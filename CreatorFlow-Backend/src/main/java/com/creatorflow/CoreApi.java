package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class CoreApi {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String geminiKey;
    private final String geminiModel;
    private final boolean providerCallsEnabled;
    public CoreApi(JdbcTemplate db, ObjectMapper json, @Value("${GEMINI_API_KEY:}") String geminiKey,
            @Value("${GEMINI_MODEL:gemini-2.5-flash}") String geminiModel,
            @Value("${CREATORFLOW_ALLOW_PROVIDER_CALLS:false}") boolean providerCallsEnabled) {
        this.db=db; this.json=json; this.geminiKey=geminiKey; this.geminiModel=geminiModel; this.providerCallsEnabled=providerCallsEnabled;
    }
    public record GenerateIdeas(@NotBlank String niche, @NotBlank String language, @Min(1) @Max(20) int count,
                                @Min(15) @Max(600) int targetDurationSec, @NotBlank String style) {}
    public record CreateContent(@NotBlank String title, @NotBlank String topic, @NotBlank String niche,
                                @NotBlank String language, UUID ideaId) {}
    private Map<String,Object> one(String sql, Object... args) {
        var rows=db.queryForList(sql,args);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Resource not found");
        return rows.getFirst();
    }
    private static final String IDEA="select id,title,hook,category,format,estimated_duration_sec as \"estimatedDurationSec\",status,score,language,niche,notes,created_at as \"createdAt\",updated_at as \"updatedAt\" from content_ideas";
    private static final String CONTENT="select id,title,topic,status,current_stage as \"currentStage\",progress_percent as \"progressPercent\",idea_id as \"ideaId\",language,niche,tags,scheduled_publication_at as \"scheduledPublicationAt\",created_at as \"createdAt\",updated_at as \"updatedAt\" from contents";
    @GetMapping("/ideas") List<Map<String,Object>> ideas(){ return db.queryForList(IDEA+" order by created_at desc"); }
    @GetMapping("/ideas/{id}") Map<String,Object> idea(@PathVariable UUID id){return one(IDEA+" where id=?",id);}
    @PatchMapping("/ideas/{id}/status") @Transactional Map<String,Object> ideaStatus(@PathVariable UUID id,@RequestBody Map<String,String> body){
        String status=body.get("status");
        if(status == null || !List.of("NEW","SELECTED","REJECTED","CONVERTED").contains(status)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid idea status");
        if(db.update("update content_ideas set status=?,updated_at=now() where id=?",status,id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Idea not found");
        return idea(id);
    }
    @DeleteMapping("/ideas/{id}") @Transactional void deleteIdea(@PathVariable UUID id){
        if(db.update("delete from content_ideas where id=?",id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Idea not found");
    }
    @PostMapping("/ideas/generate") List<Map<String,Object>> generate(@Valid @RequestBody GenerateIdeas input) throws Exception {
        if(geminiKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Gemini NOT_CONFIGURED");
        if(!providerCallsEnabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI provider calls disabled");
        UUID job=UUID.randomUUID();
        String prompt="Return only a JSON array of exactly "+input.count()+" objects with string title and hook for "+input.niche()+" in "+input.language()+". Style: "+input.style()+". No markdown.";
        db.update("insert into ai_generation_jobs(id,type,status,provider,model,prompt) values (?,'IDEA','RUNNING','GEMINI',?,?)",job,geminiModel,prompt);
        try {
            String payload=json.writeValueAsString(Map.of("contents",List.of(Map.of("parts",List.of(Map.of("text",prompt))))));
            HttpRequest request=HttpRequest.newBuilder(URI.create("https://generativelanguage.googleapis.com/v1beta/models/"+geminiModel+":generateContent"))
                .header("x-goog-api-key",geminiKey).header("Content-Type","application/json")
                .timeout(Duration.ofSeconds(60)).POST(HttpRequest.BodyPublishers.ofString(payload)).build();
            var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200) throw new IllegalStateException("Gemini HTTP "+response.statusCode());
            JsonNode root=json.readTree(response.body());
            String raw=root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText();
            JsonNode items=json.readTree(raw);
            if(!items.isArray() || items.size()!=input.count()) throw new IllegalStateException("Unexpected Gemini response shape");
            for(JsonNode item:items){
                if(item.path("title").asText().isBlank() || item.path("hook").asText().isBlank()) throw new IllegalStateException("Incomplete Gemini idea");
                db.update("insert into content_ideas(id,title,hook,category,format,estimated_duration_sec,status,language,niche,notes) values (?,?,?,'OTHER','EXPLAINER',?,'NEW',?,?,?)",
                    UUID.randomUUID(),item.get("title").asText(),item.get("hook").asText(),input.targetDurationSec(),input.language(),input.niche(),"Style: "+input.style());
            }
            db.update("update ai_generation_jobs set status='COMPLETED',response=?,input_tokens=?,output_tokens=?,updated_at=now() where id=?",raw,
                root.path("usageMetadata").path("promptTokenCount").asInt(),root.path("usageMetadata").path("candidatesTokenCount").asInt(),job);
            return db.queryForList(IDEA+" order by created_at desc limit ?",input.count());
        } catch(Exception e){
            db.update("update ai_generation_jobs set status='FAILED',error=?,updated_at=now() where id=?",e.getMessage(),job);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Gemini generation failed",e);
        }
    }
    private Map<String,Object> fullContent(Map<String,Object> row) {
        UUID id=(UUID)row.get("id");
        Map<String,Object> result=new LinkedHashMap<>(row);
        try {
            Object tags=row.get("tags");
            if(tags instanceof java.sql.Array array) result.put("tags",array.getArray());
        } catch(java.sql.SQLException e) { throw new IllegalStateException("Cannot read content tags",e); }
        result.put("stages",db.queryForList("select stage,status,started_at as \"startedAt\",completed_at as \"completedAt\",error,retry_count as \"retryCount\" from stage_progress where content_id=?",id));
        var boards=db.queryForList("select id from storyboards where content_id=?",id);
        result.put("storyboardId",boards.isEmpty()?null:boards.getFirst().get("id"));
        var workflows=db.queryForList("select id from workflow_instances where content_id=? order by created_at desc limit 1",id);
        result.put("workflowInstanceId",workflows.isEmpty()?null:workflows.getFirst().get("id"));
        return result;
    }
    @GetMapping("/contents") List<Map<String,Object>> contents(){return db.queryForList(CONTENT+" order by created_at desc").stream().map(this::fullContent).toList();}
    @GetMapping("/contents/{id}") Map<String,Object> content(@PathVariable UUID id){return fullContent(one(CONTENT+" where id=?",id));}
    @PostMapping("/contents") @Transactional Map<String,Object> create(@Valid @RequestBody CreateContent input){
        if(input.ideaId()!=null) idea(input.ideaId());
        UUID id=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,idea_id,language,niche) values (?,?,?,'DRAFT','SCRIPT',?,?,?)",
            id,input.title(),input.topic(),input.ideaId(),input.language(),input.niche());
        if(input.ideaId()!=null) db.update("update content_ideas set status='CONVERTED',updated_at=now() where id=?",input.ideaId());
        db.update("insert into activity_events(id,type,entity_id,entity_type,message,severity) values (?,'CONTENT_CREATED',?,'CONTENT',?,'INFO')",UUID.randomUUID(),id,"Content created");
        return content(id);
    }
    @GetMapping("/contents/dashboard-stats") Map<String,Object> stats(){
        return Map.of("todayIdeas",count("select count(*) from content_ideas where created_at >= current_date"),
            "scriptsReady",count("select count(*) from stage_progress where stage='SCRIPT' and status='COMPLETED'"),
            "needFlowClips",count("select count(*) from contents where status='WAITING_FOR_ASSET'"),
            "rendering",count("select count(*) from contents where status='RENDERING'"),
            "readyToPublish",count("select count(*) from contents where status='READY'"),
            "scheduled",count("select count(*) from publication_jobs where status='SCHEDULED'"),
            "failed",count("select count(*) from contents where status='FAILED'"),"stageCounts",Map.of());
    }
    private int count(String sql){return db.queryForObject(sql,Integer.class);}
    @PostMapping("/contents/{id}/resume") Map<String,Object> resume(@PathVariable UUID id){
        content(id);
        throw new ResponseStatusException(HttpStatus.CONFLICT,"Workflow can resume only after required assets and worker are available");
    }
    @GetMapping("/assets/pending-flow-scenes") List<Map<String,Object>> pending(){
        var rows=db.queryForList("select c.id as \"contentId\",c.title as \"contentTitle\",s.id as \"sceneId\",s.scene_number as \"sceneNumber\",s.prompt from scenes s join storyboards b on b.id=s.storyboard_id join contents c on c.id=b.content_id where s.asset_status='WAITING_FOR_ASSET' order by c.id,s.scene_number");
        Map<Object,Map<String,Object>> groups=new LinkedHashMap<>();
        for(var row:rows){
            Object id=row.get("contentId");
            var group=groups.computeIfAbsent(id,k->{var g=new LinkedHashMap<String,Object>();g.put("contentId",id);g.put("contentTitle",row.get("contentTitle"));g.put("scenes",new ArrayList<Map<String,Object>>());return g;});
            @SuppressWarnings("unchecked") var scenes=(List<Map<String,Object>>)group.get("scenes");
            scenes.add(Map.of("sceneId",row.get("sceneId"),"sceneNumber",row.get("sceneNumber"),"prompt",row.get("prompt")));
        }
        return new ArrayList<>(groups.values());
    }
    @GetMapping("/activity") List<Map<String,Object>> events(@RequestParam(defaultValue="50") int limit){
        return db.queryForList("select id,timestamp,type,entity_id as \"entityId\",entity_type as \"entityType\",message,severity,metadata from activity_events order by timestamp desc limit ?",Math.min(200,Math.max(1,limit)));
    }
}

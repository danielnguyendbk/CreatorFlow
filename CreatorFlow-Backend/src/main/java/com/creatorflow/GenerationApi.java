package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/contents")
public class GenerationApi {
    private final JdbcTemplate db;
    private final AiService ai;
    private final StoryboardApi storyboards;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;
    GenerationApi(JdbcTemplate db,AiService ai,StoryboardApi storyboards,ObjectMapper json,PlatformTransactionManager transactionManager){
        this.db=db;this.ai=ai;this.storyboards=storyboards;this.json=json;this.transactions=new TransactionTemplate(transactionManager);
    }
    @PostMapping("/{id}/generate-storyboard") Map<String,Object> generate(@PathVariable UUID id){
        var contents=db.queryForList("select title,topic,language from contents where id=?",id);
        if(contents.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Content not found");
        var existing=storyboards.byContent(id);
        if(existing!=null) return existing;
        var content=contents.getFirst();
        String prompt="Create a short video script and storyboard for title: "+content.get("title")+", topic: "+content.get("topic")+
            ", language: "+content.get("language")+". Return a JSON object with a scenes array. Each scene must have integer durationSec (5-30), " +
            "string narration, visualType one of IMAGE or AI_VIDEO, string prompt and optional notes. Total duration 15-60 seconds. " +
            "Narration must be factual and avoid invented metrics. Respond with JSON only.";
        try {return ai.generateStoryboard(id,prompt,raw->{
            var parsed=parse(id,(String)content.get("title"),raw);
            var board=storyboards.create(parsed);
            for(String stage:List.of("SCRIPT","STORYBOARD"))
                db.update("insert into stage_progress(content_id,stage,status,started_at,completed_at) values (?,?,'COMPLETED',now(),now()) on conflict(content_id,stage) do update set status='COMPLETED',completed_at=now(),error=null",id,stage);
            db.update("insert into activity_events(id,type,entity_id,entity_type,message,severity) values (?,'STORYBOARD_GENERATED',?,'CONTENT','Storyboard generated','SUCCESS')",UUID.randomUUID(),id);
            return board;
        },transactions);} catch(ResponseStatusException e){
            if(e.getStatusCode().value()==409){var board=storyboards.byContent(id);if(board!=null) return board;}
            throw e;
        }
    }
    StoryboardApi.NewStoryboard parse(UUID id,String title,String raw){
        try {
            JsonNode root=json.readTree(raw);
            if(root==null || !root.isObject()) throw new IllegalArgumentException("Storyboard root must be an object");
            JsonNode scenes=root.path("scenes");
            if(!scenes.isArray() || scenes.isEmpty() || scenes.size()>12) throw new IllegalArgumentException("Invalid storyboard scene count");
            var items=new ArrayList<StoryboardApi.NewScene>();
            int total=0;
            for(JsonNode scene:scenes){
                if(!scene.isObject() || !scene.path("durationSec").isIntegralNumber()
                    || !scene.path("narration").isTextual() || !scene.path("visualType").isTextual()
                    || !scene.path("prompt").isTextual()) throw new IllegalArgumentException("Invalid scene fields");
                int duration=scene.path("durationSec").intValue();
                String narration=scene.path("narration").textValue().trim();String visualType=scene.path("visualType").textValue();String visualPrompt=scene.path("prompt").textValue().trim();
                if(duration<5 || duration>30 || narration.isBlank() || narration.length()>2000 || visualPrompt.isBlank()
                    || visualPrompt.length()>5000 || !List.of("IMAGE","AI_VIDEO").contains(visualType))
                    throw new IllegalArgumentException("Incomplete storyboard scene");
                JsonNode notes=scene.path("notes");
                if(!notes.isMissingNode() && !notes.isNull() && !notes.isTextual()) throw new IllegalArgumentException("Invalid scene notes");
                items.add(new StoryboardApi.NewScene(duration,narration,visualType,visualPrompt,notes.isTextual()?notes.textValue():null));
                total+=duration;
            }
            if(total<15 || total>60) throw new IllegalArgumentException("Invalid total duration");
            JsonNode declared=root.path("totalDurationSec");
            if(!declared.isMissingNode() && (!declared.isIntegralNumber() || declared.intValue()!=total))
                throw new IllegalArgumentException("Declared duration mismatch");
            return new StoryboardApi.NewStoryboard(id,title,items);
        } catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalArgumentException("Malformed storyboard JSON",e);}
    }
}

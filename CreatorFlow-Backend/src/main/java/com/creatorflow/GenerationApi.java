package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
    GenerationApi(JdbcTemplate db,AiService ai,StoryboardApi storyboards,ObjectMapper json){
        this.db=db;this.ai=ai;this.storyboards=storyboards;this.json=json;
    }
    @PostMapping("/{id}/generate-storyboard") Map<String,Object> generate(@PathVariable UUID id){
        var contents=db.queryForList("select title,topic,language from contents where id=?",id);
        if(contents.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Content not found");
        if(storyboards.byContent(id)!=null) throw new ResponseStatusException(HttpStatus.CONFLICT,"Storyboard already exists");
        var content=contents.getFirst();
        String prompt="Create a short video script and storyboard for title: "+content.get("title")+", topic: "+content.get("topic")+
            ", language: "+content.get("language")+". Return a JSON object with a scenes array. Each scene must have integer durationSec (5-30), " +
            "string narration, visualType one of IMAGE or AI_VIDEO, string prompt and optional notes. Total duration 15-60 seconds. " +
            "Narration must be factual and avoid invented metrics. Respond with JSON only.";
        String raw=ai.generateJson("STORYBOARD",id,prompt);
        try {
            JsonNode root=json.readTree(raw);JsonNode scenes=root.path("scenes");
            if(!scenes.isArray() || scenes.isEmpty() || scenes.size()>12) throw new IllegalArgumentException("Invalid storyboard scene count");
            var items=new ArrayList<StoryboardApi.NewScene>();
            for(JsonNode scene:scenes){
                int duration=scene.path("durationSec").asInt();
                String narration=scene.path("narration").asText();String visualType=scene.path("visualType").asText();String visualPrompt=scene.path("prompt").asText();
                if(duration<5 || duration>30 || narration.isBlank() || visualPrompt.isBlank() || !List.of("IMAGE","AI_VIDEO").contains(visualType))
                    throw new IllegalArgumentException("Incomplete storyboard scene");
                items.add(new StoryboardApi.NewScene(duration,narration,visualType,visualPrompt,scene.path("notes").isMissingNode()?null:scene.path("notes").asText()));
            }
            var board=storyboards.create(new StoryboardApi.NewStoryboard(id,(String)content.get("title"),items));
            for(String stage:List.of("SCRIPT","STORYBOARD"))
                db.update("insert into stage_progress(content_id,stage,status,started_at,completed_at) values (?,?,'COMPLETED',now(),now()) on conflict(content_id,stage) do update set status='COMPLETED',completed_at=now(),error=null",id,stage);
            db.update("insert into activity_events(id,type,entity_id,entity_type,message,severity) values (?,'STORYBOARD_GENERATED',?,'CONTENT','Storyboard generated','SUCCESS')",UUID.randomUUID(),id);
            return board;
        } catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Invalid AI storyboard response",e);}
    }
}

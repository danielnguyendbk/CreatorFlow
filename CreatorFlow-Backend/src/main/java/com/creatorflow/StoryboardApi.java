package com.creatorflow;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/storyboards")
public class StoryboardApi {
    private final JdbcTemplate db;
    StoryboardApi(JdbcTemplate db) { this.db=db; }
    public record NewScene(@Min(1) int durationSec, @NotBlank String narration, @NotBlank String visualType,
                           @NotBlank String prompt, String notes) {}
    public record NewStoryboard(UUID contentId, @NotBlank String title, @Valid List<NewScene> scenes) {}
    private Map<String,Object> board(UUID id) {
        var rows=db.queryForList("select id,content_id as \"contentId\",title,total_duration_sec as \"totalDurationSec\",version,created_at as \"createdAt\",updated_at as \"updatedAt\" from storyboards where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Storyboard not found");
        var result=new LinkedHashMap<>(rows.getFirst());
        result.put("scenes",db.queryForList("select id,storyboard_id as \"storyboardId\",scene_number as \"sceneNumber\",duration_sec as \"durationSec\",narration,visual_type as \"visualType\",prompt,asset_status as \"assetStatus\",asset_id as \"assetId\",notes from scenes where storyboard_id=? order by scene_number",id));
        return result;
    }
    @GetMapping("/{id}") Map<String,Object> byId(@PathVariable UUID id){return board(id);}
    @GetMapping("/by-content/{contentId}") Map<String,Object> byContent(@PathVariable UUID contentId){
        var rows=db.queryForList("select id from storyboards where content_id=?",contentId);
        return rows.isEmpty()?null:board((UUID)rows.getFirst().get("id"));
    }
    @PostMapping @Transactional Map<String,Object> create(@Valid @RequestBody NewStoryboard request){
        if(request.contentId()==null || request.scenes()==null || request.scenes().isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Content and scenes required");
        UUID id=UUID.randomUUID();
        int total=request.scenes().stream().mapToInt(NewScene::durationSec).sum();
        db.update("insert into storyboards(id,content_id,title,total_duration_sec) values (?,?,?,?)",id,request.contentId(),request.title(),total);
        int n=1;
        for(var scene:request.scenes()) {
            db.update("insert into scenes(id,storyboard_id,scene_number,duration_sec,narration,visual_type,prompt,asset_status,notes) values (?,?,?,?,?,?,?,'WAITING_FOR_ASSET',?)",
                UUID.randomUUID(),id,n++,scene.durationSec(),scene.narration(),scene.visualType(),scene.prompt(),scene.notes());
        }
        db.update("update contents set status='WAITING_FOR_ASSET',current_stage='VISUAL_ASSETS',updated_at=now() where id=?",request.contentId());
        return board(id);
    }
    @PatchMapping("/{id}/scenes/{sceneId}") @Transactional Map<String,Object> updateScene(@PathVariable UUID id,@PathVariable UUID sceneId,@RequestBody Map<String,Object> updates){
        var allowed=Map.of("durationSec","duration_sec","narration","narration","visualType","visual_type","prompt","prompt","notes","notes");
        if(updates.isEmpty() || updates.keySet().stream().anyMatch(k->!allowed.containsKey(k))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid scene fields");
        var assignments=new ArrayList<String>(); var values=new ArrayList<Object>();
        for(var entry:updates.entrySet()){assignments.add(allowed.get(entry.getKey())+"=?");values.add(entry.getValue());}
        values.add(sceneId); values.add(id);
        if(db.update("update scenes set "+String.join(",",assignments)+" where id=? and storyboard_id=?",values.toArray())==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Scene not found");
        db.update("update storyboards set version=version+1,total_duration_sec=(select sum(duration_sec) from scenes where storyboard_id=?),updated_at=now() where id=?",id,id);
        return board(id);
    }
}

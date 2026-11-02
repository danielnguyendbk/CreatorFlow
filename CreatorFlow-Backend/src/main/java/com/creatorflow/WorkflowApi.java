package com.creatorflow;

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
@RequestMapping("/api/workflows")
public class WorkflowApi {
    private final JdbcTemplate db;
    WorkflowApi(JdbcTemplate db){this.db=db;}
    private static final String SELECT="select w.id,w.content_id as \"contentId\",c.title as \"contentTitle\",w.status,w.current_node as \"currentNode\",w.started_at as \"startedAt\",w.completed_at as \"completedAt\",w.retry_count as \"retryCount\",w.error,w.created_at as \"createdAt\",w.updated_at as \"updatedAt\" from workflow_instances w join contents c on c.id=w.content_id";
    private Map<String,Object> shape(Map<String,Object> row){
        var result=new LinkedHashMap<>(row);UUID id=(UUID)row.get("id");
        result.put("nodes",db.queryForList("select id,workflow_instance_id as \"workflowInstanceId\",node_name as \"nodeName\",node_type as \"nodeType\",status,started_at as \"startedAt\",completed_at as \"completedAt\",retry_count as \"retryCount\",error,input,output from workflow_node_executions where workflow_instance_id=? order by started_at",id));
        result.put("durationMs",null);return result;
    }
    @GetMapping List<Map<String,Object>> all(){return db.queryForList(SELECT+" order by w.created_at desc").stream().map(this::shape).toList();}
    @GetMapping("/{id}") Map<String,Object> one(@PathVariable UUID id){
        var rows=db.queryForList(SELECT+" where w.id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Workflow not found");return shape(rows.getFirst());
    }
    @PostMapping @Transactional Map<String,Object> start(@RequestBody Map<String,UUID> body){
        UUID contentId=body.get("contentId");
        if(contentId==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"contentId required");
        var board=db.queryForList("select id from storyboards where content_id=?",contentId);
        if(board.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Storyboard required before workflow start");
        var existing=db.queryForList("select id from workflow_instances where content_id=? and status in ('CREATED','RUNNING','WAITING')",contentId);
        if(!existing.isEmpty()) return one((UUID)existing.getFirst().get("id"));
        UUID id=UUID.randomUUID();
        db.update("insert into workflow_instances(id,content_id,status,current_node,started_at) values (?,?,'WAITING','VisualAssets',now())",id,contentId);
        db.update("insert into workflow_node_executions(id,workflow_instance_id,node_name,node_type,status,started_at) values (?,?,'VisualAssets','ASSET_GATE','WAITING',now())",UUID.randomUUID(),id);
        db.update("update contents set status='WAITING_FOR_ASSET',current_stage='VISUAL_ASSETS',updated_at=now() where id=?",contentId);
        return one(id);
    }
    @PostMapping("/{id}/resume") @Transactional Map<String,Object> resume(@PathVariable UUID id){
        var wf=one(id);UUID contentId=(UUID)wf.get("contentId");
        if(!"WAITING".equals(wf.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Workflow is not waiting");
        int missing=db.queryForObject("select count(*) from scenes s join storyboards b on b.id=s.storyboard_id where b.content_id=? and s.asset_status<>'READY'",Integer.class,contentId);
        if(missing>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Scenes still need assets");
        db.update("update workflow_instances set status='RUNNING',current_node='RenderVideo',updated_at=now() where id=?",id);
        db.update("update workflow_node_executions set status='COMPLETED',completed_at=now() where workflow_instance_id=? and status='WAITING'",id);
        db.update("insert into workflow_node_executions(id,workflow_instance_id,node_name,node_type,status,started_at) values (?,?,'RenderVideo','RENDER','PENDING',now())",UUID.randomUUID(),id);
        db.update("update contents set status='IN_PROGRESS',current_stage='RENDER',updated_at=now() where id=?",contentId);
        return one(id);
    }
    @PostMapping("/{id}/cancel") @Transactional Map<String,Object> cancel(@PathVariable UUID id){
        var wf=one(id);
        if("COMPLETED".equals(wf.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Completed workflow cannot be cancelled");
        db.update("update workflow_instances set status='CANCELLED',completed_at=now(),updated_at=now() where id=?",id);
        db.update("update workflow_node_executions set status='SKIPPED',completed_at=now() where workflow_instance_id=? and status in ('WAITING','PENDING')",id);
        return one(id);
    }
    @PostMapping("/{id}/retry") @Transactional Map<String,Object> retry(@PathVariable UUID id){
        var wf=one(id);
        if(!"FAILED".equals(wf.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Only failed workflows can retry");
        db.update("update workflow_instances set status='WAITING',current_node='VisualAssets',retry_count=retry_count+1,error=null,updated_at=now() where id=?",id);
        db.update("insert into workflow_node_executions(id,workflow_instance_id,node_name,node_type,status,started_at) values (?,?,'VisualAssets','ASSET_GATE','WAITING',now())",UUID.randomUUID(),id);
        return one(id);
    }
}

package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@Service
class TaskCheckpoints {
    record Save(@NotNull UUID sessionId,@Min(1) int attempt,@NotNull @Valid AgentApi.Result result) {}
    private final JdbcTemplate db;
    private final AgentQueue queue;
    private final ObjectMapper json;
    private final Path root;
    TaskCheckpoints(JdbcTemplate db,AgentQueue queue,ObjectMapper json,@Value("${CREATORFLOW_CYCLE_HANDOFF_DIR:storage/cycle-handoffs}") String root) {
        this.db=db;this.queue=queue;this.json=json;this.root=Path.of(root).toAbsolutePath().normalize();
    }
    @Transactional Map<String,Object> save(UUID agent,UUID id,Save request) {
        queue.active(agent,request.sessionId(),id,request.attempt());
        if(request.result().exitCode()!=0 || request.result().errorCode()!=null) throw AgentQueue.conflict("Checkpoint requires a successful artifact");
        try {
            db.update("insert into agent_task_checkpoints(task_id,attempt,result_json) values (?,?,?::jsonb) on conflict do nothing",id,request.attempt(),json.writeValueAsString(request.result()));
            var checkpoint=latest(id);
            if(!queue.sameResult(request.result(),checkpoint.get("result"))) throw AgentQueue.conflict("Checkpoint is immutable");
            return checkpoint;
        } catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw new IllegalStateException(e);}
    }
    Map<String,Object> latest(UUID id) {
        var rows=db.queryForList("select attempt,phase,result_json as result from agent_task_checkpoints where task_id=? order by attempt desc limit 1",id);
        if(rows.isEmpty()) return Map.of();
        var row=new LinkedHashMap<>(rows.getFirst());
        try {row.put("result",json.readValue(row.get("result").toString(),Map.class));return row;}
        catch(Exception e) {throw new IllegalStateException(e);}
    }
    @Scheduled(fixedDelay=1000) @Transactional public void generate() {
        var rows=db.queryForList("select c.id from agent_cycles c where not exists(select 1 from agent_tasks t where t.cycle_id=c.id and t.state in ('QUEUED','RUNNING','CANCEL_REQUESTED')) and not exists(select 1 from cycle_handoffs h where h.cycle_id=c.id) for update skip locked");
        for(var row:rows) {
            UUID id=(UUID)row.get("id");
            var tasks=db.queryForList("select id,node_key,kind,state,attempt,result_json,error_code from agent_tasks where cycle_id=? order by node_key",id);
            var document=new LinkedHashMap<String,Object>();
            document.put("schemaVersion",1);document.put("cycleId",id);document.put("generatedAtUtc",java.time.Instant.now().toString());
            document.put("source","COMMITTED_POSTGRESQL_STATE");document.put("branch",null);document.put("lastImplementationCommit",null);
            document.put("sourceContextStatus","NOT_PROVIDED_NO_REPOSITORY_COMMIT_CLAIM");
            var evidence=new ArrayList<Map<String,Object>>();
            for(var task:tasks) {
                var item=new LinkedHashMap<>(task);
                try {if(item.get("result_json")!=null) item.put("result_json",json.readValue(item.get("result_json").toString(),Map.class));}
                catch(Exception e) {throw new IllegalStateException(e);}
                evidence.add(item);
            }
            document.put("tasks",evidence);document.put("changedFiles",List.of());
            document.put("limits",List.of("Fixture task evidence only; no provider/publication or Maven claim","Runtime handoff is separate from the repository navigation handoff"));
            try {
                String value=json.writeValueAsString(document);
                db.update("insert into cycle_handoffs(cycle_id,document,document_hash) values (?,?::jsonb,?) on conflict do nothing",id,value,AgentIdentity.hash(value));
            } catch(Exception e) {throw new IllegalStateException(e);}
        }
    }
    Map<String,Object> handoff(UUID id) {
        var rows=db.queryForList("select document from cycle_handoffs where cycle_id=?",id);
        if(rows.isEmpty()) return Map.of("status","PENDING","cycleId",id);
        try {return json.readValue(rows.getFirst().get("document").toString(),Map.class);}
        catch(Exception e) {throw new IllegalStateException(e);}
    }
    @Scheduled(fixedDelay=1000) public void exportCommitted() {
        var rows=db.queryForList("select cycle_id,document,document_hash,exported_hash from cycle_handoffs order by created_at");
        for(var row:rows) {
            try {
                Files.createDirectories(root);
                Path target=root.resolve(row.get("cycle_id")+".json");
                if(Files.isRegularFile(target) && row.get("document_hash").equals(row.get("exported_hash"))) continue;
                Path temp=Files.createTempFile(root,"handoff-",".tmp");
                try {Files.writeString(temp,row.get("document").toString());Files.move(temp,target,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
                finally {Files.deleteIfExists(temp);}
                db.update("update cycle_handoffs set exported_hash=? where cycle_id=? and document_hash=?",row.get("document_hash"),row.get("cycle_id"),row.get("document_hash"));
            } catch(java.io.IOException e) { /* Leave export pending for restart/retry; DB remains authoritative. */ }
        }
    }
}

@RestController
class CheckpointApi {
    private final TaskCheckpoints checkpoints;
    CheckpointApi(TaskCheckpoints checkpoints) {this.checkpoints=checkpoints;}
    @PostMapping("/api/v2/agent-runtime/tasks/{id}/checkpoint") Map<String,Object> save(Authentication auth,@PathVariable UUID id,@Valid @RequestBody TaskCheckpoints.Save request) {return checkpoints.save((UUID)auth.getPrincipal(),id,request);}
    @GetMapping("/api/v2/task-cycles/{id}/handoff") Map<String,Object> handoff(@PathVariable UUID id) {return checkpoints.handoff(id);}
}

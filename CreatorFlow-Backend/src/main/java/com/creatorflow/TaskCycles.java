package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
class TaskCycles {
    record Node(@NotBlank @Pattern(regexp="[a-z0-9_-]{1,48}") String key,@NotNull AgentApi.Kind kind,
        @NotNull @Size(max=20) List<@NotBlank String> dependsOn) {}
    record Create(@NotNull UUID agentId,@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String idempotencyKey,
        @NotNull @Size(min=1,max=20) List<@Valid Node> nodes) {}
    final JdbcTemplate db;
    final AgentQueue queue;
    final ObjectMapper json;
    TaskCycles(JdbcTemplate db,AgentQueue queue,ObjectMapper json) {this.db=db;this.queue=queue;this.json=json;}
    static ResponseStatusException invalid() {return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Dependency graph must have unique nodes, existing parents and no cycles");}
    void validate(Create request) {
        var pending=new LinkedHashMap<String,Set<String>>();
        for(var n:request.nodes()) if(pending.put(n.key(),new HashSet<>(n.dependsOn()))!=null) throw invalid();
        for(var edges:pending.values()) if(!pending.keySet().containsAll(edges)) throw invalid();
        while(!pending.isEmpty()) {
            var ready=pending.entrySet().stream().filter(e->e.getValue().isEmpty()).map(Map.Entry::getKey).toList();
            if(ready.isEmpty()) throw invalid();
            ready.forEach(pending::remove);pending.values().forEach(edges->edges.removeAll(ready));
        }
    }
    @Transactional Map<String,Object> create(Create request) {
        validate(request);
        String fingerprint;
        try {fingerprint=AgentIdentity.hash(json.writeValueAsString(request));} catch(Exception e) {throw invalid();}
        db.execute("select 1");
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",request.idempotencyKey());
        var existing=db.queryForList("select id,request_hash from agent_cycles where idempotency_key=?",request.idempotencyKey());
        if(!existing.isEmpty()) {
            if(!fingerprint.equals(existing.getFirst().get("request_hash"))) throw AgentQueue.conflict("Cycle key already used with different graph");
            return read((UUID)existing.getFirst().get("id"));
        }
        UUID id=UUID.randomUUID();
        db.update("insert into agent_cycles(id,idempotency_key,request_hash) values (?,?,?)",id,request.idempotencyKey(),fingerprint);
        var ids=new HashMap<String,UUID>();
        for(var node:request.nodes()) {
            var task=queue.enqueue(new AgentApi.CreateTask(request.agentId(),node.kind(),UUID.randomUUID().toString(),"cycle-"+id.toString().substring(0,16),30,1));
            UUID taskId=(UUID)task.get("id");ids.put(node.key(),taskId);
            db.update("update agent_tasks set cycle_id=?,node_key=? where id=?",id,node.key(),taskId);
        }
        for(var node:request.nodes()) for(String parent:new HashSet<>(node.dependsOn()))
            db.update("insert into agent_task_dependencies(task_id,depends_on_id) values (?,?)",ids.get(node.key()),ids.get(parent));
        return read(id);
    }
    Map<String,Object> read(UUID id) {
        if(db.queryForList("select id from agent_cycles where id=?",id).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Cycle not found");
        var tasks=db.queryForList("select id,node_key as \"nodeKey\",state from agent_tasks where cycle_id=? order by node_key",id);
        String state=tasks.stream().allMatch(t->"SUCCEEDED".equals(t.get("state")))?"SUCCEEDED":tasks.stream().anyMatch(t->List.of("FAILED","CANCELLED").contains(t.get("state")))?"FAILED":"RUNNING";
        return Map.of("id",id,"state",state,"tasks",tasks,"dependencies",db.queryForList("select d.task_id as \"taskId\",d.depends_on_id as \"dependsOnId\" from agent_task_dependencies d join agent_tasks t on t.id=d.task_id where t.cycle_id=?",id));
    }
}

@RestController
class TaskCycleApi {
    private final TaskCycles cycles;
    TaskCycleApi(TaskCycles cycles) {this.cycles=cycles;}
    @PostMapping("/api/v2/task-cycles") Map<String,Object> create(@Valid @RequestBody TaskCycles.Create request) {return cycles.create(request);}
    @GetMapping("/api/v2/task-cycles/{id}") Map<String,Object> read(@PathVariable UUID id) {return cycles.read(id);}
}

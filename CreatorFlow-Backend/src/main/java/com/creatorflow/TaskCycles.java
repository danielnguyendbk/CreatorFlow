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
    @Transactional(noRollbackFor=ResponseStatusException.class) Map<String,Object> read(UUID id) {
        var rows=db.queryForList("select state from agent_cycles where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Cycle not found");
        var tasks=db.queryForList("select id,node_key as \"nodeKey\",state from agent_tasks where cycle_id=? order by node_key",id);
        String stored=(String)rows.getFirst().get("state"),state=stored;
        boolean settled=!tasks.isEmpty() && tasks.stream().allMatch(t->List.of("SUCCEEDED","FAILED","CANCELLED").contains(t.get("state")));
        if(settled && !List.of("SUCCEEDED","FAILED","CANCELLED").contains(stored)) {
            state=stored.equals("CANCEL_REQUESTED")?"CANCELLED":tasks.stream().allMatch(t->"SUCCEEDED".equals(t.get("state")))?"SUCCEEDED":"FAILED";
            if(db.update("update agent_cycles set state=? where id=? and state=?",state,id,stored)==1)
                db.update("insert into cycle_control_events(cycle_id,state) values (?,?)",id,state);
            else state=db.queryForObject("select state from agent_cycles where id=?",String.class,id);
        }
        return Map.of("id",id,"state",state,"tasks",tasks,"dependencies",db.queryForList("select d.task_id as \"taskId\",d.depends_on_id as \"dependsOnId\" from agent_task_dependencies d join agent_tasks t on t.id=d.task_id where t.cycle_id=?",id));
    }
    @Transactional(noRollbackFor=ResponseStatusException.class) Map<String,Object> control(UUID id,String action) {
        // Follow the agent -> cycle -> task lock order used by claims and completions.
        db.queryForList("select id from local_agents where id in (select agent_id from agent_tasks where cycle_id=?) order by id for update",id);
        var rows=db.queryForList("select state from agent_cycles where id=? for update",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Cycle not found");
        String state=(String)read(id).get("state"),next;
        switch(action) {
            case "pause" -> {
                if(state.equals("PAUSED")) return read(id);
                if(!List.of("QUEUED","RUNNING").contains(state)) throw AgentQueue.conflict("Cycle cannot pause");
                next="PAUSED";
            }
            case "resume" -> {
                if(!state.equals("PAUSED")) throw AgentQueue.conflict("Only a paused cycle can resume");
                next="QUEUED"; // Claim still checks dependencies, capabilities and backoff.
            }
            case "cancel" -> {
                if(List.of("CANCELLED","CANCEL_REQUESTED").contains(state)) return read(id);
                if(List.of("SUCCEEDED","FAILED").contains(state)) throw AgentQueue.conflict("Terminal cycle cannot cancel");
                next="CANCEL_REQUESTED";
                db.update("update agent_cycles set state=? where id=?",next,id);
                for(var task:db.queryForList("select id from agent_tasks where cycle_id=? order by id",id)) queue.cancel((UUID)task.get("id"));
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown cycle action");
        }
        db.update("update agent_cycles set state=? where id=?",next,id);
        db.update("insert into cycle_control_events(cycle_id,state) values (?,?)",id,next);
        return read(id);
    }
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=1000)
    @Transactional public void reconcile() {
        for(var row:db.queryForList("select id from agent_cycles where state in ('QUEUED','RUNNING','PAUSED','CANCEL_REQUESTED') order by id limit 100")) read((UUID)row.get("id"));
    }
}

@RestController
class TaskCycleApi {
    private final TaskCycles cycles;
    TaskCycleApi(TaskCycles cycles) {this.cycles=cycles;}
    @PostMapping("/api/v2/task-cycles") Map<String,Object> create(@Valid @RequestBody TaskCycles.Create request) {return cycles.create(request);}
    @GetMapping("/api/v2/task-cycles/{id}") Map<String,Object> read(@PathVariable UUID id) {return cycles.read(id);}
    @PostMapping("/api/v2/task-cycles/{id}/{action:pause|resume|cancel}") Map<String,Object> control(@PathVariable UUID id,@PathVariable String action) {return cycles.control(id,action);}
}

package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class AgentQueue {
    static final List<String> KINDS=List.of("GIT_FIXTURE","FFMPEG_FIXTURE","CAPABILITY_PROBE");
    static final String TASK="select id,agent_id as \"agentId\",kind,state,attempt,max_attempts as \"maxAttempts\",session_id as \"sessionId\",lease_expires_at as \"leaseExpiresAt\",idempotency_key as \"idempotencyKey\",worktree_key as \"worktreeKey\",timeout_sec as \"timeoutSec\",duration_sec as \"durationSec\",result_json as result,error_code as \"errorCode\",created_at as \"createdAt\" from agent_tasks";
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final int lease;
    AgentQueue(JdbcTemplate db,ObjectMapper json,@Value("${creatorflow.agent-lease-seconds:12}") int lease) {
        this.db=db;this.json=json;this.lease=Math.clamp(lease,3,60);
    }
    static ResponseStatusException conflict(String reason) {return new ResponseStatusException(HttpStatus.CONFLICT,reason);}
    private String encode(Object value) {
        try {return json.writeValueAsString(value);} catch(Exception e) {throw new IllegalArgumentException("Invalid agent data");}
    }
    private boolean sameResult(Object first,Object second) {
        try {return json.readTree(encode(first)).equals(json.readTree(encode(second)));}
        catch(Exception e) {throw new IllegalStateException("Invalid result",e);}
    }
    private Map<String,Object> shape(Map<String,Object> row) {
        var result=new LinkedHashMap<>(row);
        if(result.get("result")!=null) try {result.put("result",json.readValue(result.get("result").toString(),Map.class));}
        catch(Exception e) {throw new IllegalStateException("Invalid stored result",e);}
        return result;
    }
    List<Map<String,Object>> tasks() {return db.queryForList(TASK+" order by created_at desc limit 100").stream().map(this::shape).toList();}
    Map<String,Object> task(UUID id) {
        var rows=db.queryForList(TASK+" where id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Task not found");
        return shape(rows.getFirst());
    }
    List<Map<String,Object>> agents() {
        var rows=db.queryForList("select id,name,version,capabilities,session_id as \"sessionId\",last_heartbeat_at as \"lastHeartbeatAt\",case when last_heartbeat_at>now()-interval '10 seconds' then 'ONLINE' else 'OFFLINE' end as status from local_agents order by name,id");
        return rows.stream().map(row->{var result=new LinkedHashMap<>(row);
            try {result.put("capabilities",json.readValue(row.get("capabilities").toString(),List.class));}
            catch(Exception e) {throw new IllegalStateException(e);} return (Map<String,Object>)result;}).toList();
    }
    private void event(UUID task,int attempt,String type) {
        db.update("insert into agent_task_events(task_id,attempt,type) values (?,?,?)",task,attempt,type);
    }
    @Transactional Map<String,Object> register(String name) {
        UUID id=UUID.randomUUID();
        byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);
        String secret=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        db.update("insert into local_agents(id,name,version) values (?,?,'0.1.0')",id,name);
        db.update("insert into agent_credentials(agent_id,token_hash) values (?,?)",id,AgentIdentity.hash(secret));
        return Map.of("id",id,"credential",secret);
    }
    @Transactional Map<String,Object> session(UUID agent,List<String> capabilities) {
        if(!KINDS.containsAll(capabilities)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported capability");
        UUID session=UUID.randomUUID();
        db.update("update local_agents set session_id=?,capabilities=?::jsonb,last_heartbeat_at=now() where id=?",session,encode(capabilities.stream().distinct().toList()),agent);
        return Map.of("sessionId",session,"leaseSeconds",lease);
    }
    private void current(UUID agent,UUID session) {
        if(db.queryForList("select id from local_agents where id=? and session_id=? for update",agent,session).isEmpty())
            throw conflict("Agent session fenced");
    }
    @Transactional void heartbeat(UUID agent,UUID session) {
        if(db.update("update local_agents set last_heartbeat_at=now() where id=? and session_id=?",agent,session)!=1) throw conflict("Agent session fenced");
    }
    @Transactional Map<String,Object> enqueue(AgentApi.CreateTask request) {
        // A targeted task is only accepted for a registered agent, with a fixed input schema.
        var agents=db.queryForList("select id from local_agents where id=?",request.agentId());
        if(agents.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Agent not found");
        UUID id=UUID.randomUUID();
        int inserted=db.update("insert into agent_tasks(id,agent_id,kind,idempotency_key,worktree_key,timeout_sec,duration_sec) values (?,?,?,?,?,?,?) on conflict(idempotency_key) do nothing",
            id,request.agentId(),request.kind().name(),request.idempotencyKey(),request.worktreeKey(),request.timeoutSec(),request.durationSec());
        if(inserted==1) event(id,0,"QUEUED");
        var existing=db.queryForList(TASK+" where idempotency_key=?",request.idempotencyKey()).getFirst();
        if(!request.agentId().equals(existing.get("agentId")) || !request.kind().name().equals(existing.get("kind")) || !request.worktreeKey().equals(existing.get("worktreeKey"))
            || request.timeoutSec()!=((Number)existing.get("timeoutSec")).intValue() || request.durationSec()!=((Number)existing.get("durationSec")).intValue())
            throw conflict("Idempotency key already used with different input");
        return shape(existing);
    }
    @Transactional Map<String,Object> claim(UUID agent,UUID session) {
        db.queryForList("select id from local_agents where id=? for update",agent);
        current(agent,session);
        if(db.queryForObject("select count(*) from agent_tasks where agent_id=? and state in ('RUNNING','CANCEL_REQUESTED')",Integer.class,agent)>0) return null;
        var rows=db.queryForList("select t.id from agent_tasks t join local_agents a on a.id=t.agent_id where t.agent_id=? and t.state='QUEUED' and a.capabilities ?? t.kind order by t.created_at limit 1 for update of t skip locked",agent);
        if(rows.isEmpty()) return null;
        UUID id=(UUID)rows.getFirst().get("id");
        db.update("update agent_tasks set state='RUNNING',attempt=attempt+1,session_id=?,lease_expires_at=now()+make_interval(secs=>?),error_code=null,updated_at=now() where id=?",session,lease,id);
        var result=task(id);event(id,((Number)result.get("attempt")).intValue(),"CLAIMED");return result;
    }
    private Map<String,Object> active(UUID agent,UUID session,UUID id,int attempt) {
        current(agent,session);
        var rows=db.queryForList("select id from agent_tasks where id=? and agent_id=? and session_id=? and attempt=? and state in ('RUNNING','CANCEL_REQUESTED') and lease_expires_at>now() for update",id,agent,session,attempt);
        if(rows.isEmpty()) throw conflict("Task attempt/lease fenced");
        return task(id);
    }
    @Transactional Map<String,Object> renew(UUID agent,UUID session,UUID id,int attempt) {
        var task=active(agent,session,id,attempt);
        db.update("update agent_tasks set lease_expires_at=now()+make_interval(secs=>?),updated_at=now() where id=?",lease,id);
        return Map.of("cancelRequested","CANCEL_REQUESTED".equals(task.get("state")),"leaseSeconds",lease);
    }
    @Transactional Map<String,Object> finish(UUID agent,UUID session,UUID id,AgentApi.Completion completion) {
        current(agent,session);
        // Retransmission is accepted only for the same fenced attempt and identical result.
        var old=task(id);
        if(!agent.equals(old.get("agentId"))) throw conflict("Task owner mismatch");
        if(List.of("SUCCEEDED","FAILED","CANCELLED").contains(old.get("state"))) {
            if(session.equals(old.get("sessionId")) && completion.attempt()==((Number)old.get("attempt")).intValue()
                && sameResult(completion.result(),old.get("result")) && completion.state().name().equals(old.get("state"))) return old;
            throw conflict("Terminal task cannot be overwritten");
        }
        var row=active(agent,session,id,completion.attempt());
        String state="CANCEL_REQUESTED".equals(row.get("state")) ? "CANCELLED" : completion.state().name();
        if(completion.state()==AgentApi.Outcome.SUCCEEDED && (completion.result().exitCode()!=0 || completion.result().errorCode()!=null))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid success result");
        db.update("update agent_tasks set state=?,result_json=?::jsonb,error_code=?,lease_expires_at=null,updated_at=now() where id=?",
            state,encode(completion.result()),completion.result().errorCode(),id);
        event(id,completion.attempt(),state);return task(id);
    }
    @Transactional Map<String,Object> cancel(UUID id) {
        db.queryForList("select id from agent_tasks where id=? for update",id);
        var task=task(id);String state=(String)task.get("state");
        if(state.equals("QUEUED") || state.equals("RUNNING")) {
            state=state.equals("QUEUED")?"CANCELLED":"CANCEL_REQUESTED";
            db.update("update agent_tasks set state=?,updated_at=now() where id=?",state,id);
            event(id,((Number)task.get("attempt")).intValue(),state);
        }
        return task(id);
    }
    @Scheduled(fixedDelay=1000) @Transactional public void recoverExpired() {
        var rows=db.queryForList("select id,attempt,max_attempts,state from agent_tasks where state in ('RUNNING','CANCEL_REQUESTED') and lease_expires_at<=now() for update skip locked");
        for(var row:rows) {
            UUID id=(UUID)row.get("id");int attempt=((Number)row.get("attempt")).intValue();
            String state="CANCEL_REQUESTED".equals(row.get("state"))?"CANCELLED":attempt>=((Number)row.get("max_attempts")).intValue()?"FAILED":"QUEUED";
            db.update("update agent_tasks set state=?,session_id=null,lease_expires_at=null,error_code='LEASE_EXPIRED',updated_at=now() where id=?",state,id);
            event(id,attempt,"LEASE_EXPIRED_"+state);
        }
    }
}

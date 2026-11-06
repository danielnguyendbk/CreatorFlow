package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import jakarta.validation.*;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class CodingWorkspaces {
    static final List<String> KINDS=List.of("WORKTREE_PREPARE","WORKTREE_INSPECT","WORKTREE_CLEANUP","CODING_PREFLIGHT");
    enum Role {PLANNER,CODEX_EXECUTOR,GEMINI_EXECUTOR,REVIEWER,TESTER}
    enum Scope {INSPECT_ONLY,WORKSPACE_ONLY}
    record Create(@NotNull UUID repositoryId,@NotBlank String baseRef,@Pattern(regexp="[a-f0-9]{40,64}") @NotNull String baseCommit,
        @NotNull Role role,@NotNull Scope allowedScope,@NotBlank @Size(max=2000) String objective,@NotNull @Size(min=1,max=20) List<@Size(max=160) String> allowedFiles,
        @NotNull @Size(max=20) List<@Size(max=160) String> prohibitedPaths,@Min(1) @Max(60) int timeoutSec,@Min(1) @Max(3) int maxAttempts,
        UUID budgetPolicyId,@NotNull CodingAdmission.Provider provider,@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,64}") String idempotencyKey,
        @NotNull @Size(max=10) List<UUID> checkpointReferences,@NotNull @Pattern(regexp="WORKTREE_PREPARE|CODEX_EXECUTE|GEMINI_EXECUTE") String taskType) {}
    record Operation(@NotNull UUID workspaceId,@NotNull @Pattern(regexp="WORKTREE_INSPECT|WORKTREE_CLEANUP|CODING_PREFLIGHT|CODEX_EXECUTE|GEMINI_EXECUTE") String taskType,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,64}") String idempotencyKey) {}
    record Report(@NotNull UUID sessionId,@Min(1) int attempt,@NotNull UUID checkpointId,
        @NotNull @Pattern(regexp="READY|CLEANED|NEEDS_RECONCILIATION") String state,@Pattern(regexp="[a-f0-9]{40,64}") String headCommit,boolean dirty) {}
    final JdbcTemplate db;final AgentQueue queue;final CodingRegistry registry;final Validator validator;final ObjectMapper json;
    CodingWorkspaces(JdbcTemplate db,AgentQueue queue,CodingRegistry registry,Validator validator,ObjectMapper json) {this.db=db;this.queue=queue;this.registry=registry;this.validator=validator;this.json=json;}
    <T> T strict(JsonNode body,Class<T> type,Set<String> fields) {
        if(!body.isObject()) throw AgentQueue.conflict("Invalid task schema");body.fieldNames().forEachRemaining(k->{if(!fields.contains(k)) throw AgentQueue.conflict("Unknown task field");});
        try {T value=json.treeToValue(body,type);if(!validator.validate(value).isEmpty()) throw AgentQueue.conflict("Invalid task schema");return value;}
        catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw AgentQueue.conflict("Invalid task schema");}
    }
    static void relative(String path) {if(path==null || path.isBlank() || path.startsWith("/") || path.contains("\\") || path.contains(":") || path.contains("..") || path.startsWith("-") || path.chars().anyMatch(c->c<32) || path.startsWith(".git") || path.startsWith(".codex") || path.startsWith(".aws") || path.startsWith(".env")) throw AgentQueue.conflict("Unsafe file scope");}
    Map<String,Object> workspace(UUID id) {
        var rows=db.queryForList("select * from coding_workspaces where id=?",id);if(rows.isEmpty()) throw AgentQueue.conflict("Workspace not found");return rows.getFirst();
    }
    Map<String,Object> eligible(UUID repo) {
        var r=registry.repository(repo);if(!Boolean.TRUE.equals(r.get("enabled")) || !"VERIFIED".equals(r.get("verification"))) throw AgentQueue.conflict("Repository not verified/enabled by assigned agent");return r;
    }
    @Transactional Map<String,Object> create(Create input,String actor) {
        ContentManifests.operator(actor);if(!"WORKTREE_PREPARE".equals(input.taskType())) throw AgentQueue.conflict("NOT_ENABLED: autonomous AI executor");
        input.allowedFiles().forEach(CodingWorkspaces::relative);input.prohibitedPaths().forEach(CodingWorkspaces::relative);
        if(!input.checkpointReferences().isEmpty()) throw AgentQueue.conflict("New workspaces cannot adopt another workspace checkpoint");
        var repo=eligible(input.repositoryId());CodingRegistry.branch(input.baseRef());
        if(!((List<?>)repo.get("allowedBases")).contains(input.baseRef()) || !input.baseCommit().equals(((Map<?,?>)repo.get("verifiedCommits")).get(input.baseRef()))) throw AgentQueue.conflict("Unapproved base ref/commit");
        UUID agent=(UUID)repo.get("agentId");db.queryForList("select id from local_agents where id=? for update",agent);
        if(input.budgetPolicyId()!=null && db.queryForObject("select count(*) from coding_budget_policies where id=? and agent_id=? and provider=?",Integer.class,input.budgetPolicyId(),agent,input.provider().name())!=1) throw AgentQueue.conflict("Budget policy identity mismatch");
        String key="coding-"+input.idempotencyKey(),hash=AgentIdentity.hash(registry.encode(input));
        var old=db.queryForList("select c.workspace_id,c.request_hash from agent_tasks t join coding_task_contracts c on c.task_id=t.id where t.idempotency_key=?",key);
        if(!old.isEmpty()) {if(!hash.equals(old.getFirst().get("request_hash"))) throw AgentQueue.conflict("Workspace idempotency collision");return workspace((UUID)old.getFirst().get("workspace_id"));}
        UUID id=UUID.randomUUID(),task=UUID.randomUUID();
        db.update("insert into agent_tasks(id,agent_id,kind,idempotency_key,worktree_key,timeout_sec,duration_sec,max_attempts) values (?,?,'WORKTREE_PREPARE',?,?,?,1,?)",task,agent,key,"coding-"+id,input.timeoutSec(),input.maxAttempts());
        db.update("insert into coding_workspaces(id,repository_id,agent_id,base_ref,base_commit,branch,relative_path,allocation_task_id,current_task_id) values (?,?,?,?,?,?,?,?,?)",id,input.repositoryId(),agent,input.baseRef(),input.baseCommit(),"creatorflow/"+id,"coding-worktrees/"+id,task,task);
        db.update("insert into coding_task_contracts values (?,?,?::jsonb,?)",task,id,registry.encode(input),hash);event(id,"PREPARE_REQUESTED",actor);return workspace(id);
    }
    @Transactional Map<String,Object> operation(Operation input,String actor) {
        ContentManifests.operator(actor);if(!KINDS.contains(input.taskType())) throw AgentQueue.conflict("NOT_ENABLED: autonomous AI executor");
        var workspace=workspace(input.workspaceId());UUID agent=(UUID)workspace.get("agent_id");db.queryForList("select id from local_agents where id=? for update",agent);
        if(db.queryForObject("select count(*) from coding_executions where workspace_id=? and state in ('AUTHORIZED','CLAIMED','RUNNING','CANCEL_REQUESTED')",Integer.class,input.workspaceId())>0) throw AgentQueue.conflict("Workspace reserved by coding execution");
        db.queryForList("select id from coding_workspaces where id=? for update",input.workspaceId());workspace=workspace(input.workspaceId());eligible((UUID)workspace.get("repository_id"));
        String key="coding-"+input.idempotencyKey(),hash=AgentIdentity.hash(registry.encode(input));
        var old=db.queryForList("select c.workspace_id,c.request_hash from agent_tasks t join coding_task_contracts c on c.task_id=t.id where t.idempotency_key=?",key);
        if(!old.isEmpty()) {if(!hash.equals(old.getFirst().get("request_hash"))) throw AgentQueue.conflict("Operation idempotency collision");return workspace;}
        if(db.queryForObject("select count(*) from coding_task_contracts c join agent_tasks t on t.id=c.task_id where c.workspace_id=? and t.state in ('QUEUED','RUNNING','CANCEL_REQUESTED')",Integer.class,input.workspaceId())>0) throw AgentQueue.conflict("Workspace already owned by an active operation");
        if("WORKTREE_CLEANUP".equals(input.taskType()) && (!"READY".equals(workspace.get("state")) || workspace.get("last_checkpoint_id")==null)) throw AgentQueue.conflict("Cleanup requires reconciled READY checkpoint");
        if("CLEANED".equals(workspace.get("state"))) throw AgentQueue.conflict("Workspace cleaned");
        UUID task=UUID.randomUUID();db.update("insert into agent_tasks(id,agent_id,kind,idempotency_key,worktree_key,timeout_sec,duration_sec,max_attempts) values (?,?,?,?,?,60,1,1)",task,agent,input.taskType(),key,"coding-"+input.workspaceId());
        db.update("insert into coding_task_contracts values (?,?,?::jsonb,?)",task,input.workspaceId(),registry.encode(input),hash);
        db.update("update coding_workspaces set current_task_id=?,cleanup_state=case when ?='WORKTREE_CLEANUP' then 'REQUESTED' else cleanup_state end,updated_at=now() where id=?",task,input.taskType(),input.workspaceId());event(input.workspaceId(),input.taskType()+"_REQUESTED",actor);return workspace(input.workspaceId());
    }
    @Transactional Map<String,Object> report(UUID agent,UUID task,Report input) {
        var active=queue.active(agent,input.sessionId(),task,input.attempt());if(!"RUNNING".equals(active.get("state"))) throw AgentQueue.conflict("Workspace task cancelled");var refs=db.queryForList("select workspace_id from coding_task_contracts where task_id=?",task);if(refs.isEmpty()) throw AgentQueue.conflict("Not a workspace task");UUID id=(UUID)refs.getFirst().get("workspace_id");var w=workspace(id);
        if(!task.equals(w.get("current_task_id")) || !agent.equals(w.get("agent_id")) || !input.sessionId().equals(w.get("owner_session")) || input.attempt()!=((Number)w.get("owner_attempt")).intValue()) throw AgentQueue.conflict("Workspace owner fenced");
        if("READY".equals(input.state()) && (input.dirty() || !w.get("base_commit").equals(input.headCommit()))) throw AgentQueue.conflict("Invalid clean workspace checkpoint");
        if("CLEANED".equals(input.state()) && !"WORKTREE_CLEANUP".equals(active.get("kind")) && !("WORKTREE_INSPECT".equals(active.get("kind")) && "REQUESTED".equals(w.get("cleanup_state")))) throw AgentQueue.conflict("Cleanup result requires prior cleanup authority");
        String hash=AgentIdentity.hash(registry.encode(input));var existing=db.queryForList("select id,report_hash from coding_workspace_checkpoints where task_id=? and attempt=?",task,input.attempt());
        if(!existing.isEmpty()) {if(!hash.equals(existing.getFirst().get("report_hash"))) throw AgentQueue.conflict("Immutable workspace checkpoint");return workspace(id);}
        db.update("insert into coding_workspace_checkpoints(id,workspace_id,task_id,session_id,attempt,head_commit,dirty,state,report_hash) values (?,?,?,?,?,?,?,?,?)",input.checkpointId(),id,task,input.sessionId(),input.attempt(),input.headCommit(),input.dirty(),input.state(),hash);
        db.update("update coding_workspaces set state=?,last_checkpoint_id=?,writer_locked=false,cleanup_state=?,updated_at=now() where id=?",input.state(),input.checkpointId(),input.state().equals("CLEANED")?"CLEANED":"RETAINED",id);event(id,input.state(),"agent");return workspace(id);
    }
    void event(UUID id,String type,String actor) {db.update("insert into coding_workspace_events(workspace_id,type,actor) values (?,?,?)",id,type,actor);}
}

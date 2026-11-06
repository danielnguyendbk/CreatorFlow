package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
class CodingApi {
    record Verify(@NotNull UUID sessionId,@NotNull UUID repositoryId,@NotNull String configHash,@NotNull @Size(max=10) Map<String,String> commits,@Size(max=48) String errorCode) {}
    record Capability(@NotNull CodingAdmission.Provider provider,boolean installed,@Pattern(regexp="[A-Za-z0-9.+_-]{1,40}") String version) {}
    record Capabilities(@NotNull UUID sessionId,@Size(max=2) @NotNull List<@Valid Capability> providers) {}
    record Toggle(boolean enabled) {}
    final JdbcTemplate db;final CodingRegistry registry;final CodingWorkspaces workspaces;final CodingAdmission admission;final AgentQueue queue;
    CodingApi(JdbcTemplate db,CodingRegistry registry,CodingWorkspaces workspaces,CodingAdmission admission,AgentQueue queue) {this.db=db;this.registry=registry;this.workspaces=workspaces;this.admission=admission;this.queue=queue;}
    @GetMapping("/api/v2/coding") Map<String,Object> inventory() {
        return Map.of("executionEnabled",false,"repositories",db.queryForList("select id from coding_repositories order by approved_at desc").stream().map(r->registry.repository((UUID)r.get("id"))).toList(),
            "workspaces",db.queryForList("select * from coding_workspaces order by created_at desc limit 100"),
            "capabilities",db.queryForList("select agent_id as \"agentId\",provider,installed,version,observed_at as \"observedAt\" from agent_provider_capabilities order by agent_id,provider"),
            "policies",db.queryForList("select * from coding_budget_policies order by updated_at desc"),
            "admissions",db.queryForList("select id,agent_id,provider,state,reason,reserved_seconds,reserved_until,created_at from coding_admissions order by created_at desc limit 30"),
            "events",db.queryForList("select * from coding_workspace_events order by id desc limit 50"));
    }
    @PostMapping("/api/v2/coding/repositories") Map<String,Object> register(@Valid @RequestBody CodingRegistry.Register input,Authentication auth) {return registry.register(input,auth.getName());}
    @PostMapping("/api/v2/coding/repositories/{id}/enabled") Map<String,Object> enabled(@PathVariable UUID id,@RequestBody Toggle input,Authentication auth) {ContentManifests.operator(auth.getName());db.update("update coding_repositories set enabled=? where id=?",input.enabled(),id);return registry.repository(id);}
    @PostMapping("/api/v2/coding/workspaces") Map<String,Object> create(@RequestBody JsonNode input,Authentication auth) {
        return workspaces.create(workspaces.strict(input,CodingWorkspaces.Create.class,Set.of("repositoryId","baseRef","baseCommit","role","allowedScope","objective","allowedFiles","prohibitedPaths","timeoutSec","maxAttempts","budgetPolicyId","provider","idempotencyKey","checkpointReferences","taskType")),auth.getName());
    }
    @PostMapping("/api/v2/coding/operations") Map<String,Object> operation(@RequestBody JsonNode input,Authentication auth) {return workspaces.operation(workspaces.strict(input,CodingWorkspaces.Operation.class,Set.of("workspaceId","taskType","idempotencyKey")),auth.getName());}
    @PostMapping("/api/v2/coding/budget-policies") Map<String,Object> policy(@Valid @RequestBody CodingAdmission.Policy input,Authentication auth) {return admission.policy(input,auth.getName());}
    @PostMapping("/api/v2/coding/admission") Map<String,Object> admission(@Valid @RequestBody CodingAdmission.Check input,Authentication auth) {return admission.check(input,auth.getName());}
    @GetMapping("/api/v2/agent-runtime/coding/repositories") @org.springframework.transaction.annotation.Transactional List<Map<String,Object>> configuration(Authentication auth,@RequestParam UUID sessionId) {
        return configurationTransaction((UUID)auth.getPrincipal(),sessionId);
    }
    @org.springframework.transaction.annotation.Transactional
    List<Map<String,Object>> configurationTransaction(UUID agent,UUID session) {queue.current(agent,session);return db.queryForList("select id from coding_repositories where agent_id=?",agent).stream().map(r->registry.repository((UUID)r.get("id"))).toList();}
    @PostMapping("/api/v2/agent-runtime/coding/repositories/verify") void verify(Authentication auth,@Valid @RequestBody Verify input) {registry.verify((UUID)auth.getPrincipal(),input.sessionId(),input.repositoryId(),input.configHash(),input.commits(),input.errorCode(),queue);}
    @PostMapping("/api/v2/agent-runtime/coding/capabilities") @org.springframework.transaction.annotation.Transactional void capabilities(Authentication auth,@Valid @RequestBody Capabilities input) {
        UUID agent=(UUID)auth.getPrincipal();queue.current(agent,input.sessionId());
        for(var p:input.providers()) {if(p.provider()==CodingAdmission.Provider.NONE) throw AgentQueue.conflict("Invalid provider capability");db.update("insert into agent_provider_capabilities values (?,?,?,?,now()) on conflict(agent_id,provider) do update set installed=excluded.installed,version=excluded.version,observed_at=now()",agent,p.provider().name(),p.installed(),p.version());}
    }
    @PostMapping("/api/v2/agent-runtime/coding/tasks/{id}/checkpoint") Map<String,Object> checkpoint(Authentication auth,@PathVariable UUID id,@Valid @RequestBody CodingWorkspaces.Report input) {return workspaces.report((UUID)auth.getPrincipal(),id,input);}
}

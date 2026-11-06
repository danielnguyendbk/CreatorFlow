package com.creatorflow;

import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class CodingAdmission {
    enum Provider {NONE,CODEX_CLI,GEMINI_CLI}
    record Policy(@NotNull UUID agentId,@NotNull Provider provider,boolean enabled,boolean operatorAuthorized,
        @Min(1) @Max(4) int maxConcurrent,@Min(1) @Max(60) int maxDurationSec,@Min(1) @Max(3) int maxAttempts,@Min(1) @Max(720) int maxReservedSeconds) {}
    record Check(@NotNull UUID requestId,@NotNull UUID agentId,@NotNull Provider provider,@Min(1) @Max(60) int timeoutSec,@Min(1) @Max(3) int maxAttempts,boolean reserve) {}
    final JdbcTemplate db;final UsageApi usage;final CodingRegistry registry;
    CodingAdmission(JdbcTemplate db,UsageApi usage,CodingRegistry registry) {this.db=db;this.usage=usage;this.registry=registry;}
    @Transactional Map<String,Object> policy(Policy input,String actor) {
        ContentManifests.operator(actor);UUID id=UUID.randomUUID();
        db.update("insert into coding_budget_policies values (?,?,?,?,?,?,?,?,?,?,now()) on conflict(agent_id,provider) do update set enabled=excluded.enabled,operator_authorized=excluded.operator_authorized,max_concurrent=excluded.max_concurrent,max_duration_sec=excluded.max_duration_sec,max_attempts=excluded.max_attempts,max_reserved_seconds=excluded.max_reserved_seconds,approved_by=excluded.approved_by,updated_at=now()",id,input.agentId(),input.provider().name(),input.enabled(),input.operatorAuthorized(),input.maxConcurrent(),input.maxDurationSec(),input.maxAttempts(),input.maxReservedSeconds(),actor);
        return db.queryForMap("select * from coding_budget_policies where agent_id=? and provider=?",input.agentId(),input.provider().name());
    }
    @Transactional Map<String,Object> check(Check input,String actor) {
        ContentManifests.operator(actor);db.queryForList("select id from local_agents where id=? for update",input.agentId());
        String hash=AgentIdentity.hash(registry.encode(input));var old=db.queryForList("select * from coding_admissions where id=?",input.requestId());
        if(!old.isEmpty()) {if(!hash.equals(old.getFirst().get("request_hash"))) throw AgentQueue.conflict("Admission request replay mismatch");return response(old.getFirst());}
        var policies=db.queryForList("select * from coding_budget_policies where agent_id=? and provider=? for update",input.agentId(),input.provider().name());
        Map<String,Object> policy=policies.isEmpty()?null:policies.getFirst();String state="DISABLED",reason="POLICY_DISABLED";int reserve=0;
        if(policy!=null && Boolean.TRUE.equals(policy.get("enabled"))) {
            if(input.provider()!=Provider.CODEX_CLI) {state="PROVIDER_UNSUPPORTED";reason="VERIFIED_QUOTA_ADAPTER_UNAVAILABLE";}
            else if(!Boolean.TRUE.equals(policy.get("operator_authorized"))) {state="OPERATOR_REQUIRED";reason="OPERATOR_AUTHORIZATION_REQUIRED";}
            else {
                var capability=db.queryForList("select installed from agent_provider_capabilities where agent_id=? and provider='CODEX_CLI' and installed and observed_at>now()-interval '6 minutes'",input.agentId());
                var q=usage.codex(input.agentId());
                if(capability.isEmpty()) {state="PROVIDER_UNSUPPORTED";reason="AGENT_CAPABILITY_UNAVAILABLE";}
                else if(!"LIVE".equals(q.get("freshness")) || !"OK".equals(q.get("connection")) || !"CODEX_APP_SERVER".equals(q.get("source")) || !input.agentId().equals(q.get("agentId"))) {state="OPERATOR_REQUIRED";reason="QUOTA_STALE_OR_UNKNOWN";}
                else if("WAIT_FOR_RESET".equals(q.get("automationReadiness"))) {state="WAIT_FOR_RESET";reason="QUOTA_EXHAUSTED";}
                else if(!"READY".equals(q.get("automationReadiness"))) {state="OPERATOR_REQUIRED";reason="QUOTA_WINDOWS_INCOMPLETE";}
                else if(input.timeoutSec()>((Number)policy.get("max_duration_sec")).intValue() || input.maxAttempts()>((Number)policy.get("max_attempts")).intValue()) {state="OPERATOR_REQUIRED";reason="TASK_BUDGET_POLICY_EXCEEDED";}
                else {
                    var used=db.queryForMap("select count(*) as concurrent,coalesce(sum(reserved_seconds),0) as seconds from coding_admissions where agent_id=? and policy_id=? and state='READY' and reserved_until>now()",input.agentId(),policy.get("id"));
                    int units=input.timeoutSec()*input.maxAttempts();
                    if(((Number)used.get("concurrent")).intValue()>=((Number)policy.get("max_concurrent")).intValue() || units+((Number)used.get("seconds")).intValue()>((Number)policy.get("max_reserved_seconds")).intValue()) {state="OPERATOR_REQUIRED";reason="RESERVATION_BUDGET_EXHAUSTED";}
                    else {state="READY";reason="FOUNDATION_ADMISSION_ONLY";reserve=input.reserve()?units:0;}
                }
            }
        }
        db.update("insert into coding_admissions values (?,?,?,?,?,?,?, ?,case when ?>0 then now()+interval '60 seconds' else null end,now())",input.requestId(),input.agentId(),policy==null?null:policy.get("id"),input.provider().name(),state,reason,hash,reserve,reserve);
        return response(db.queryForMap("select * from coding_admissions where id=?",input.requestId()));
    }
    Map<String,Object> response(Map<String,Object> row) {var result=new LinkedHashMap<>(row);result.remove("request_hash");result.put("executionEnabled",false);result.put("budgetUnit","RESERVED_WALL_CLOCK_SECONDS_NOT_PROVIDER_USAGE");return result;}
}

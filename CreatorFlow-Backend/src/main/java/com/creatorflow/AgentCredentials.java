package com.creatorflow;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
class AgentCredentials {
    record Confirm(@NotNull @Pattern(regexp="ROTATE|REVOKE|ENROLL") String confirmation) {}
    record Enrollment(@Min(0) @Max(30) int minutes,@NotNull @Pattern(regexp="ENROLL") String confirmation) {}
    record Commit(@NotNull UUID rotationId,@Min(2) long generation,@Pattern(regexp="[a-f0-9]{64}") @NotNull String candidateHash) {}
    final JdbcTemplate db;
    AgentCredentials(JdbcTemplate db) {this.db=db;}
    void lock(UUID agent) {if(db.queryForList("select id from local_agents where id=? for update",agent).isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Agent not found");}
    void audit(UUID agent,Long generation,String type,String actor) {db.update("insert into agent_identity_audit(agent_id,generation,type,actor) values (?,?,?,?)",agent,generation,type,actor);}
    @Transactional Map<String,Object> rotate(UUID agent,String actor) {
        ContentManifests.operator(actor);lock(agent);
        var credential=db.queryForMap("select generation,revoked_at from agent_credentials where agent_id=? for update",agent);
        if(credential.get("revoked_at")!=null) throw AgentQueue.conflict("Revoked agent must be enrolled with a new identity");
        var existing=db.queryForList("select id,generation,state from agent_credential_rotations where agent_id=? and state in ('REQUESTED','COMMITTED')",agent);
        if(!existing.isEmpty()) return existing.getFirst();
        UUID id=UUID.randomUUID();long generation=((Number)credential.get("generation")).longValue()+1;
        db.update("insert into agent_credential_rotations(id,agent_id,generation,requested_by) values (?,?,?,?)",id,agent,generation,actor);audit(agent,generation,"ROTATION_REQUESTED",actor);
        return Map.of("id",id,"generation",generation,"state","REQUESTED");
    }
    @Transactional void revoke(UUID agent,String actor) {
        ContentManifests.operator(actor);lock(agent);
        if(db.update("update agent_credentials set revoked_at=now(),generation=generation+1 where agent_id=? and revoked_at is null",agent)==1) {
            db.update("update local_agents set session_id=null,last_heartbeat_at=null where id=?",agent);
            db.update("update agent_credential_rotations set state='CANCELLED' where agent_id=? and state in ('REQUESTED','COMMITTED')",agent);
            db.update("update agent_tasks set state='CANCEL_REQUESTED' where agent_id=? and state='RUNNING'",agent);
            audit(agent,null,"CREDENTIAL_REVOKED",actor);
        }
    }
    Map<String,Object> poll(UUID agent) {
        var rows=db.queryForList("select id,generation,state from agent_credential_rotations where agent_id=? and state in ('REQUESTED','COMMITTED') order by generation desc limit 1",agent);
        return rows.isEmpty()?Map.of("state","NONE"):rows.getFirst();
    }
    @Transactional Map<String,Object> commit(UUID agent,Commit input) {
        lock(agent);AgentIdentity.requireCurrent(db,agent);
        var rotation=db.queryForMap("select * from agent_credential_rotations where id=? and agent_id=? for update",input.rotationId(),agent);
        if(input.candidateHash().equals(db.queryForObject("select token_hash from agent_credentials where agent_id=?",String.class,agent))) throw AgentQueue.conflict("Rotation must replace the credential");
        if(input.generation()!=((Number)rotation.get("generation")).longValue() || !"REQUESTED".equals(rotation.get("state"))) throw AgentQueue.conflict("Rotation fenced");
        if(db.update("update agent_credentials set token_hash=?,generation=? where agent_id=? and generation=? and revoked_at is null",input.candidateHash(),input.generation(),agent,input.generation()-1)!=1) throw AgentQueue.conflict("Credential generation fenced");
        db.update("update local_agents set session_id=null where id=?",agent);
        db.update("update agent_credential_rotations set candidate_hash=?,state='COMMITTED',committed_at=now() where id=?",input.candidateHash(),input.rotationId());audit(agent,input.generation(),"ROTATION_COMMITTED","agent");return Map.of("committed",true);
    }
    @Transactional Map<String,Object> ack(UUID agent,UUID rotation) {
        lock(agent);AgentIdentity.requireCurrent(db,agent);
        db.update("update agent_credential_rotations r set state='ACKED',ack_at=now() from agent_credentials c where r.id=? and r.agent_id=? and c.agent_id=r.agent_id and c.generation=r.generation and c.token_hash=r.candidate_hash and r.state='COMMITTED'",rotation,agent);
        var rows=db.queryForList("select state,generation from agent_credential_rotations where id=? and agent_id=?",rotation,agent);
        if(rows.isEmpty() || !"ACKED".equals(rows.getFirst().get("state"))) throw AgentQueue.conflict("Rotation acknowledgement fenced");return rows.getFirst();
    }
}

@RestController
class AgentCredentialApi {
    record Retention(@Min(1) @Max(365) int logsDays,@Min(1) @Max(365) int temporaryWorktreeDays,@Min(30) @Max(3650) int artifactMetadataDays) {}
    final AgentCredentials credentials;final JdbcTemplate db;
    AgentCredentialApi(AgentCredentials credentials,JdbcTemplate db) {this.credentials=credentials;this.db=db;}
    @GetMapping("/api/v2/agent-credentials") Map<String,Object> inventory() {return Map.of("credentials",db.queryForList("select c.agent_id as \"agentId\",a.name,c.generation,c.revoked_at as \"revokedAt\",c.last_used_at as \"lastUsedAt\" from agent_credentials c join local_agents a on a.id=c.agent_id order by a.name"),"enrollment",db.queryForMap("select enabled_until as \"enabledUntil\" from agent_enrollment_policy where id=1"),"audit",db.queryForList("select agent_id as \"agentId\",generation,type,actor,created_at as \"createdAt\" from agent_identity_audit order by id desc limit 100"),"retention",db.queryForMap("select logs_days as \"logsDays\",temporary_worktree_days as \"temporaryWorktreeDays\",artifact_metadata_days as \"artifactMetadataDays\",preserve_referenced as \"preserveReferenced\" from agent_retention_policy where id=1"));}
    @PostMapping("/api/v2/agent-credentials/{id}/rotate") Map<String,Object> rotate(@PathVariable UUID id,@Valid @RequestBody AgentCredentials.Confirm input,Authentication auth) {if(!"ROTATE".equals(input.confirmation())) throw AgentQueue.conflict("Explicit ROTATE confirmation required");return credentials.rotate(id,auth.getName());}
    @PostMapping("/api/v2/agent-credentials/{id}/revoke") Map<String,Object> revoke(@PathVariable UUID id,@Valid @RequestBody AgentCredentials.Confirm input,Authentication auth) {if(!"REVOKE".equals(input.confirmation())) throw AgentQueue.conflict("Explicit REVOKE confirmation required");credentials.revoke(id,auth.getName());return Map.of("revoked",true);}
    @PostMapping("/api/v2/agent-credentials/enrollment") Map<String,Object> enrollment(@Valid @RequestBody AgentCredentials.Enrollment input,Authentication auth) {ContentManifests.operator(auth.getName());db.update("update agent_enrollment_policy set enabled_until=case when ?=0 then null else now()+make_interval(mins=>?) end,updated_by=? where id=1",input.minutes(),input.minutes(),auth.getName());credentials.audit(null,null,"ENROLLMENT_WINDOW_CHANGED",auth.getName());return Map.of("minutes",input.minutes());}
    @PutMapping("/api/v2/agent-credentials/retention") Map<String,Object> retention(@Valid @RequestBody Retention input,Authentication auth) {ContentManifests.operator(auth.getName());db.update("update agent_retention_policy set logs_days=?,temporary_worktree_days=?,artifact_metadata_days=?,updated_by=? where id=1",input.logsDays(),input.temporaryWorktreeDays(),input.artifactMetadataDays(),auth.getName());credentials.audit(null,null,"RETENTION_POLICY_CHANGED",auth.getName());return Map.of("configured",true,"sweepMode","PREVIEW_ONLY_REFERENCED_EVIDENCE_RETAINED");}
    @PostMapping("/api/v2/agent-runtime/credentials/poll") Map<String,Object> poll(Authentication auth) {return credentials.poll((UUID)auth.getPrincipal());}
    @PostMapping("/api/v2/agent-runtime/credentials/commit") Map<String,Object> commit(Authentication auth,@Valid @RequestBody AgentCredentials.Commit input) {return credentials.commit((UUID)auth.getPrincipal(),input);}
    @PostMapping("/api/v2/agent-runtime/credentials/{id}/ack") Map<String,Object> ack(Authentication auth,@PathVariable UUID id) {return credentials.ack((UUID)auth.getPrincipal(),id);}
}

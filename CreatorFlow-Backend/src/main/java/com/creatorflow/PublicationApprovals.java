package com.creatorflow;

import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class PublicationApprovals {
    enum Decision {APPROVE,REJECT}
    record Decide(@NotNull @Pattern(regexp="[a-f0-9]{64}") String fingerprint,@NotNull Decision decision,
        @NotNull UUID requestId,@Min(1) @Max(60) int expiresMinutes) {}
    final JdbcTemplate db;final ContentManifests manifests;
    PublicationApprovals(JdbcTemplate db,ContentManifests manifests) {this.db=db;this.manifests=manifests;}
    @Transactional Map<String,Object> decide(UUID manifest,Decide input,String actor) {
        ContentManifests.operator(actor);var m=manifests.row(manifest);UUID publication=(UUID)m.get("publication_id");
        var job=manifests.job(publication,true);manifests.editable(job);
        if(!manifest.equals(job.get("active_manifest_id")) || !input.fingerprint().equals(m.get("fingerprint"))) throw ContentManifests.blocked("APPROVAL_MANIFEST_MISMATCH");
        var a=db.queryForMap("select * from publication_approvals where manifest_id=? for update",manifest);
        if(!actor.equals(a.get("required_operator"))) throw ContentManifests.blocked("APPROVAL_OPERATOR_MISMATCH");
        if(input.decision()==Decision.APPROVE) manifests.verifyForApproval(m,job);
        if(!((java.sql.Timestamp)a.get("expires_at")).toInstant().isAfter(java.time.Instant.now())) throw ContentManifests.blocked("APPROVAL_EXPIRED");
        if(!"PENDING".equals(a.get("state"))) {
            if(List.of("APPROVED","REJECTED").contains(a.get("state")) && input.requestId().equals(a.get("decision_request_id")) && input.decision().name().equals(a.get("decision"))) return manifests.read(manifest);
            throw ContentManifests.blocked("APPROVAL_REPLAY_OR_TERMINAL");
        }
        if(db.queryForObject("select count(*) from publication_approvals where decision_request_id=?",Integer.class,input.requestId())>0) throw ContentManifests.blocked("APPROVAL_REQUEST_REPLAY");
        db.update("update publication_approvals set state=?,decision=?,decision_actor=?,decision_at=now(),decision_request_id=?,expires_at=least(expires_at,now()+make_interval(mins=>?)) where manifest_id=?",
            input.decision()==Decision.APPROVE?"APPROVED":"REJECTED",input.decision().name(),actor,input.requestId(),input.expiresMinutes(),manifest);
        manifests.audit(publication,manifest,input.decision()==Decision.APPROVE?"MANIFEST_APPROVED":"MANIFEST_REJECTED",actor);
        return manifests.read(manifest);
    }
    @Transactional Map<String,Object> revoke(UUID manifest,String actor) {
        ContentManifests.operator(actor);var m=manifests.row(manifest);manifests.job((UUID)m.get("publication_id"),true);
        if(db.update("update publication_approvals set state='REVOKED' where manifest_id=? and state='APPROVED'",manifest)==1) manifests.audit((UUID)m.get("publication_id"),manifest,"APPROVAL_REVOKED",actor);
        return manifests.read(manifest);
    }
}

package com.creatorflow;

import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** The only provider dispatch owner. A permit cannot be created by an API request or an agent. */
@Service
class PublicationSafety {
    final JdbcTemplate db;final ContentManifests manifests;final YouTubePublisher youtube;
    final TransactionTemplate tx;final boolean enabled;
    PublicationSafety(JdbcTemplate db,ContentManifests manifests,YouTubePublisher youtube,PlatformTransactionManager manager,
        @Value("${CREATORFLOW_ENABLE_REAL_PUBLISH:false}") boolean enabled) {
        this.db=db;this.manifests=manifests;this.youtube=youtube;this.tx=new TransactionTemplate(manager);this.enabled=enabled;
    }
    Map<String,Object> bound(Map<String,Object> job,boolean requireApproval) {
        if(!enabled && !youtube.mock()) throw ContentManifests.blocked("REAL_PUBLISH_DISABLED");
        if(job.get("superseded_by")!=null || Boolean.TRUE.equals(job.get("reconciliation_required"))) throw ContentManifests.blocked("RECONCILIATION_REQUIRED");
        if(job.get("active_manifest_id")==null) throw ContentManifests.blocked("MANIFEST_REQUIRED");
        var m=manifests.row((UUID)job.get("active_manifest_id"));var doc=manifests.document(m);
        if(!job.get("id").equals(m.get("publication_id")) || !AgentIdentity.hash(manifests.canonical(doc)).equals(m.get("fingerprint"))) throw ContentManifests.blocked("MANIFEST_CORRUPT");
        if(!job.get("content_id").toString().equals(doc.get("contentId")) || !job.get("platform").equals(doc.get("targetPlatform")) || !Objects.equals(job.get("visibility"),doc.get("visibility"))
            || !Objects.equals(ContentManifests.timestamp(job.get("scheduled_at")),doc.get("intendedSchedule")) || !manifests.canonical(manifests.metadata(job)).equals(manifests.canonical(doc.get("metadata")))) throw ContentManifests.blocked("METADATA_CHANGED");
        if(job.get("connection_id")==null || !job.get("connection_id").equals(m.get("connection_id"))) throw ContentManifests.blocked("CONNECTION_TARGET_MISMATCH");
        var connections=db.queryForList("select id,platform,status,connection_revision,revoked_at,encrypted_refresh_token is not null as has_credential,scopes from social_connections where id=?",m.get("connection_id"));
        if(connections.isEmpty()) throw ContentManifests.blocked("CONNECTION_NOT_CONFIGURED");var connection=connections.getFirst();
        if(!connection.get("connection_revision").equals(m.get("connection_revision")) || !connection.get("platform").equals(job.get("platform"))) throw ContentManifests.blocked("CONNECTION_CHANGED");
        if(connection.get("revoked_at")!=null || !"CONFIGURED".equals(connection.get("status")) || !Boolean.TRUE.equals(connection.get("has_credential"))) throw ContentManifests.blocked("CONNECTION_REVOKED_OR_NOT_CONFIGURED");
        if(!manifests.tags(connection.get("scopes")).contains("https://www.googleapis.com/auth/youtube.upload")) throw ContentManifests.blocked("UPLOAD_SCOPE_MISSING");
        if(!"YOUTUBE_SHORTS".equals(job.get("platform")) || !youtube.configured()) throw ContentManifests.blocked("PROVIDER_NOT_CONFIGURED");
        if(requireApproval) {
            var approval=db.queryForMap("select * from publication_approvals where manifest_id=?",m.get("id"));
            if(!"APPROVED".equals(approval.get("state")) || !m.get("fingerprint").equals(approval.get("fingerprint")) || !"local-user".equals(approval.get("decision_actor"))
                || !((java.sql.Timestamp)approval.get("expires_at")).toInstant().isAfter(java.time.Instant.now())) throw ContentManifests.blocked("APPROVAL_INVALID_OR_EXPIRED");
        }
        if(!List.of("private","unlisted","public").contains(doc.get("visibility"))) throw ContentManifests.blocked("VISIBILITY_UNSUPPORTED");
        if(!Objects.equals(manifests.currentRender((UUID)job.get("content_id")),m.get("render_id"))) throw ContentManifests.blocked("RENDER_CHANGED");
        var board=db.queryForMap("select version from storyboards where id=? and content_id=?",m.get("storyboard_id"),job.get("content_id"));
        if(((Number)board.get("version")).intValue()!=((Number)doc.get("storyboardVersion")).intValue() || !manifests.canonical(manifests.provenance((UUID)job.get("content_id"),(UUID)m.get("storyboard_id"),false)).equals(manifests.canonical(doc.get("artifactReferences")))) throw ContentManifests.blocked("SOURCE_ARTIFACT_CHANGED");
        source(m,doc);return m;
    }
    Path source(Map<String,Object> m,Map<String,Object> doc) {
        var rows=db.queryForList("select a.storage_path,a.file_size_bytes from assets a join render_jobs r on r.output_asset_id=a.id where a.id=? and a.content_id=? and a.asset_type='FINAL_VIDEO' and r.id=? and r.status='SUCCESS'",m.get("asset_id"),m.get("content_id"),m.get("render_id"));
        if(rows.isEmpty()) throw ContentManifests.blocked("ARTIFACT_REFERENCE_CHANGED");
        var proof=(Map<?,?>)doc.get("media");var path=manifests.media.path(rows.getFirst().get("storage_path"));
        try {if(Files.size(path)!=((Number)proof.get("sizeBytes")).longValue() || !proof.get("sha256").equals(PublicationMedia.hash(path))) throw ContentManifests.blocked("ARTIFACT_CHANGED");}
        catch(java.io.IOException e) {throw ContentManifests.blocked("ARTIFACT_UNAVAILABLE");}return path;
    }
    Map<String,Object> readiness(UUID publication) {
        var job=manifests.job(publication,false);var reasons=new ArrayList<String>();
        try {
            bound(job,true);
            if(!List.of("DRAFT","SCHEDULED","RETRYING").contains(job.get("status")) || job.get("platform_post_id")!=null) reasons.add("FAILED".equals(job.get("status"))?"RETRY_REQUIRED":"TARGET_ALREADY_CLAIMED");
            if(job.get("scheduled_at")==null || ((java.sql.Timestamp)job.get("scheduled_at")).toInstant().isAfter(java.time.Instant.now())) reasons.add("SCHEDULE_NOT_DUE");
            if(((Number)job.get("attempts")).intValue()>=((Number)job.get("max_attempts")).intValue()) reasons.add("ATTEMPTS_EXHAUSTED");
        }
        catch(ResponseStatusException e) {reasons.add(e.getReason());}
        return Map.of("ready",reasons.isEmpty(),"reasons",reasons,"realPublishEnabled",enabled,"adapterMode",youtube.mock()?"MOCK_ONLY":"LIVE","reconciliationRequired",job.get("reconciliation_required"));
    }
    void ensureRetry(UUID id) {bound(manifests.job(id,false),true);}
    ApprovedUpload claim(UUID id) {
        return tx.execute(s->{
            var job=manifests.job(id,true);var m=bound(job,true);
            if(job.get("scheduled_at")==null || ((java.sql.Timestamp)job.get("scheduled_at")).toInstant().isAfter(java.time.Instant.now())) throw ContentManifests.blocked("SCHEDULE_NOT_DUE");
            if(!List.of("DRAFT","SCHEDULED","RETRYING").contains(job.get("status")) || job.get("platform_post_id")!=null || ((Number)job.get("attempts")).intValue()>=((Number)job.get("max_attempts")).intValue()) throw ContentManifests.blocked("TARGET_ALREADY_CLAIMED_OR_ATTEMPTS_EXHAUSTED");
            var doc=manifests.document(m);var proof=(Map<?,?>)doc.get("media");
            var prepared=manifests.media.capture(source(m,doc),(String)proof.get("sha256"),((Number)proof.get("sizeBytes")).longValue());
            UUID token=UUID.randomUUID();
            try {
                db.update("update publication_jobs set status='PUBLISHING',dispatch_token=?,attempts=attempts+1,error=null,failure_category=null,updated_at=now() where id=?",token,id);
                manifests.audit(id,(UUID)m.get("id"),"DISPATCH_CLAIMED","system:guard");return new ApprovedUpload(id,token,m,doc,prepared);
            } catch(RuntimeException e) {prepared.close();throw e;}
        });
    }
    final class ApprovedUpload implements AutoCloseable {
        final UUID publication,token;final Map<String,Object> manifest,document;final PublicationMedia.Prepared prepared;
        private ApprovedUpload(UUID publication,UUID token,Map<String,Object> manifest,Map<String,Object> document,PublicationMedia.Prepared prepared) {this.publication=publication;this.token=token;this.manifest=manifest;this.document=document;this.prepared=prepared;}
        void authorize() {
            tx.executeWithoutResult(s->{var job=manifests.job(publication,true);
                if(!token.equals(job.get("dispatch_token")) || !"PUBLISHING".equals(job.get("status")) || job.get("platform_post_id")!=null) throw ContentManifests.blocked("DISPATCH_FENCED");
                var current=bound(job,true);if(!manifest.get("id").equals(current.get("id"))) throw ContentManifests.blocked("MANIFEST_CHANGED");
            });
        }
        String accessToken() throws Exception {return youtube.oauth.accessToken((UUID)manifest.get("connection_id"),(UUID)manifest.get("connection_revision"));}
        public void close() {prepared.close();}
    }
    void dispatch(UUID id) {
        var job=manifests.job(id,false);
        if(job.get("platform_post_id")!=null) {confirm(id);return;}
        ApprovedUpload permit;
        try {permit=claim(id);} catch(ResponseStatusException e) {
            db.update("update publication_jobs set failure_category='SAFETY_GATE_BLOCKED',error=?,updated_at=now() where id=? and status not in ('PUBLISHING','PUBLISHED')",e.getReason(),id);throw e;
        }
        try(permit) {
            String post=youtube.publish(permit);
            tx.executeWithoutResult(s->{
                if(db.update("update publication_jobs set platform_post_id=?,updated_at=now() where id=? and dispatch_token=? and status='PUBLISHING' and reconciliation_required=false",post,id,permit.token)!=1) throw ContentManifests.blocked("DISPATCH_ACK_FENCED");
                manifests.audit(id,(UUID)permit.manifest.get("id"),"POST_ID_RECORDED","system:provider");
            });
        } catch(YouTubePublisher.UploadException e) {
            tx.executeWithoutResult(s->{
                db.update("update publication_jobs set status=?,reconciliation_required=?,failure_category=?,error=?,updated_at=now() where id=? and dispatch_token=? and status='PUBLISHING'",
                    e.outcomeUnknown?"PUBLISHING":"FAILED",e.outcomeUnknown,e.outcomeUnknown?"UPLOAD_OUTCOME_UNKNOWN":"PRE_UPLOAD_FAILURE",e.outcomeUnknown?"RECONCILIATION_REQUIRED":"UPLOAD_DID_NOT_START",id,permit.token);
                manifests.audit(id,(UUID)permit.manifest.get("id"),e.outcomeUnknown?"UPLOAD_OUTCOME_UNKNOWN":"PRE_UPLOAD_FAILURE","system:provider");
            });
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,e.outcomeUnknown?"RECONCILIATION_REQUIRED":"UPLOAD_DID_NOT_START");
        }
        confirm(id);
    }
    void confirm(UUID id) {
        var job=manifests.job(id,false);var m=bound(job,true);var doc=manifests.document(m);
        if(job.get("platform_post_id")==null || !List.of("PUBLISHING","PUBLISHED").contains(job.get("status"))) throw ContentManifests.blocked("POST_ID_REQUIRED");
        if("PUBLISHED".equals(job.get("status"))) return;
        try {
            if(!youtube.confirmed((String)job.get("platform_post_id"),(String)doc.get("visibility"),(UUID)m.get("connection_id"),(UUID)m.get("connection_revision"))) {
                db.update("update publication_jobs set failure_category='CONFIRMATION_PENDING',error='Provider confirmation pending',updated_at=now() where id=?",id);return;
            }
            tx.executeWithoutResult(s->{
                var locked=manifests.job(id,true);bound(locked,true);
                if(db.update("update publication_jobs set status='PUBLISHED',published_at=now(),failure_category=null,error=null,updated_at=now() where id=? and status='PUBLISHING' and reconciliation_required=false and platform_post_id=?",id,job.get("platform_post_id"))==1) {
                    db.update("update contents set status='PUBLISHED',updated_at=now() where id=?",job.get("content_id"));manifests.audit(id,(UUID)m.get("id"),"PLATFORM_CONFIRMED","system:provider");
                }
            });
        } catch(ResponseStatusException e) {throw e;}
        catch(Exception e) {db.update("update publication_jobs set failure_category='CONFIRMATION_ERROR',error='Provider confirmation unavailable',updated_at=now() where id=?",id);}
    }
}

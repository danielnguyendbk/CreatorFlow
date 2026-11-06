package com.creatorflow;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/publication-jobs")
public class PublicationApi {
    private final JdbcTemplate db;
    private PublicationSafety safety;
    private final boolean realPublishEnabled;
    PublicationApi(JdbcTemplate db,YouTubePublisher youtube,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String root,
                   @Value("${CREATORFLOW_ENABLE_REAL_PUBLISH:false}") boolean realPublishEnabled){
        this.db=db;this.realPublishEnabled=realPublishEnabled;
    }
    @org.springframework.beans.factory.annotation.Autowired
    PublicationApi(JdbcTemplate db,YouTubePublisher youtube,PublicationSafety safety,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String root,
                   @Value("${CREATORFLOW_ENABLE_REAL_PUBLISH:false}") boolean enabled) {
        this(db,youtube,root,enabled);this.safety=safety;
    }
    private static final String SELECT="select p.id,p.content_id as \"contentId\",c.title as \"contentTitle\",p.platform,p.status,p.scheduled_at as \"scheduledAt\",p.published_at as \"publishedAt\",p.caption,p.title,p.description,p.connection_id as \"connectionId\",p.visibility,p.active_manifest_id as \"activeManifestId\",p.hashtags,p.attempts,p.max_attempts as \"maxAttempts\",p.error,p.platform_post_id as \"platformPostId\",p.approved_at as \"approvedAt\",p.superseded_by as \"supersededBy\",p.reconciliation_required as \"reconciliationRequired\",p.failure_category as \"failureCategory\",p.created_at as \"createdAt\",p.updated_at as \"updatedAt\" from publication_jobs p join contents c on c.id=p.content_id";
    private void requireActionable(Map<String,Object> job){
        if(job.get("supersededBy")!=null || Boolean.TRUE.equals(job.get("reconciliationRequired")))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication requires manual reconciliation");
    }
    private Map<String,Object> shape(Map<String,Object> row){
        var result=new LinkedHashMap<>(row);
        try {if(row.get("hashtags") instanceof java.sql.Array a) result.put("hashtags",a.getArray());}
        catch(java.sql.SQLException e){throw new IllegalStateException("Cannot read hashtags",e);}
        return result;
    }
    private void lockTarget(UUID contentId,String platform){
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?::text || ':' || ?,0))",contentId,platform);
    }
    @GetMapping List<Map<String,Object>> all(){return db.queryForList(SELECT+" order by p.created_at desc").stream().map(this::shape).toList();}
    @GetMapping("/{id}") Map<String,Object> one(@PathVariable UUID id){
        var rows=db.queryForList(SELECT+" where p.id=?",id);if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Publication not found");return shape(rows.getFirst());
    }
    @PostMapping @Transactional Map<String,Object> schedule(@RequestBody Map<String,Object> body){
        if(body.get("contentId")==null || body.get("scheduledAt")==null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"contentId and scheduledAt required");
        UUID contentId;
        try {contentId=UUID.fromString(String.valueOf(body.get("contentId")));}
        catch(IllegalArgumentException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid contentId");}
        var contents=db.queryForList("select status from contents where id=?",contentId);
        if(contents.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Content not found");
        if(!List.of("READY","SCHEDULED").contains(contents.getFirst().get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Final render must be READY");
        String platform=(String)body.get("platform");
        if(platform==null || !List.of("YOUTUBE_SHORTS","TIKTOK","INSTAGRAM_REELS","FACEBOOK_REELS").contains(platform))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported platform");
        lockTarget(contentId,platform);
        var existing=db.queryForList("select id from publication_jobs where content_id=? and platform=? and superseded_by is null limit 1",contentId,platform);
        if(!existing.isEmpty()) {var canonical=one((UUID)existing.getFirst().get("id"));requireActionable(canonical);return canonical;}
        java.time.OffsetDateTime when;
        try {when=java.time.OffsetDateTime.parse(String.valueOf(body.get("scheduledAt")));}
        catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid scheduledAt");}
        UUID id=UUID.randomUUID();
        String[] hashtags=((List<?>)body.getOrDefault("hashtags",List.of())).stream().map(String::valueOf).toArray(String[]::new);
        db.update("insert into publication_jobs(id,content_id,platform,status,scheduled_at,caption,title,hashtags) values (?,?,?,'SCHEDULED',?,?,?,?)",
            id,contentId,platform,when,String.valueOf(body.getOrDefault("caption","")),String.valueOf(body.getOrDefault("title","")),hashtags);
        db.update("update contents set status='SCHEDULED',scheduled_publication_at=?,updated_at=now() where id=?",when,contentId);
        return one(id);
    }
    @PatchMapping("/{id}/details") @Transactional Map<String,Object> details(@PathVariable UUID id,@RequestBody Map<String,Object> changes){
        var job=one(id);
        requireActionable(job);
        if(!List.of("DRAFT","SCHEDULED","FAILED").contains(job.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication cannot be edited");
        if(changes.keySet().stream().anyMatch(k->!List.of("title","caption","description","hashtags","scheduledAt","connectionId","visibility").contains(k)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid publication fields");
        if(changes.containsKey("title")) db.update("update publication_jobs set title=?,updated_at=now() where id=?",changes.get("title"),id);
        if(changes.containsKey("description")) db.update("update publication_jobs set description=?,updated_at=now() where id=?",changes.get("description"),id);
        if(changes.containsKey("visibility")) db.update("update publication_jobs set visibility=?,updated_at=now() where id=?",changes.get("visibility"),id);
        if(changes.containsKey("connectionId")) db.update("update publication_jobs set connection_id=?::uuid,updated_at=now() where id=?",String.valueOf(changes.get("connectionId")),id);
        if(changes.containsKey("caption")) db.update("update publication_jobs set caption=?,updated_at=now() where id=?",changes.get("caption"),id);
        if(changes.containsKey("scheduledAt")) db.update("update publication_jobs set scheduled_at=?,updated_at=now() where id=?",java.time.OffsetDateTime.parse(String.valueOf(changes.get("scheduledAt"))),id);
        if(changes.containsKey("hashtags")) db.update("update publication_jobs set hashtags=?,updated_at=now() where id=?",((List<?>)changes.get("hashtags")).stream().map(String::valueOf).toArray(String[]::new),id);
        return one(id);
    }
    @PostMapping("/{id}/approve") @Transactional Map<String,Object> approve(@PathVariable UUID id){
        var job=one(id);
        requireActionable(job);
        throw new ResponseStatusException(HttpStatus.CONFLICT,"IMMUTABLE_MANIFEST_APPROVAL_REQUIRED");
    }
    @PatchMapping("/{id}/status") Map<String,Object> status(@PathVariable UUID id,@RequestBody Map<String,String> body){
        var job=one(id);
        requireActionable(job);
        if(!"DRAFT".equals(body.get("status"))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Publication status is worker-controlled");
        db.update("update publication_jobs set status='DRAFT',approved_at=null,updated_at=now() where id=? and status='SCHEDULED'",id);return one(id);
    }
    @PostMapping("/{id}/retry") @Transactional Map<String,Object> retry(@PathVariable UUID id){
        var job=one(id);
        requireActionable(job);
        if(!"FAILED".equals(job.get("status")) || ((Number)job.get("attempts")).intValue()>=((Number)job.get("maxAttempts")).intValue())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication retry unavailable");
        lockTarget((UUID)job.get("contentId"),(String)job.get("platform"));
        int other=db.queryForObject("select count(*) from publication_jobs where content_id=? and platform=? and id<>? and status in ('DRAFT','SCHEDULED','PUBLISHING','PUBLISHED','RETRYING')",Integer.class,job.get("contentId"),job.get("platform"),id);
        if(other>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Another publication already owns this target");
        if(safety!=null) safety.ensureRetry(id);
        db.update("update publication_jobs set status='SCHEDULED',error=null,failure_category=null,updated_at=now() where id=?",id);return one(id);
    }
    @PostMapping("/{id}/publish-now") Map<String,Object> publishNow(@PathVariable UUID id){
        requireActionable(one(id));
        if(safety==null) throw new ResponseStatusException(HttpStatus.CONFLICT,"IMMUTABLE_MANIFEST_APPROVAL_REQUIRED");
        safety.dispatch(id);return one(id);
    }
    @EventListener(ApplicationReadyEvent.class) void recoverUncertainUploads(){
        db.update("update publication_jobs set reconciliation_required=true,failure_category='UPLOAD_OUTCOME_UNKNOWN',error='RECONCILIATION_REQUIRED: process restarted during publication',updated_at=now() where status='PUBLISHING' and platform_post_id is null and reconciliation_required=false");
    }
    @Scheduled(fixedDelay=30000) void due(){
        if(!realPublishEnabled && (safety==null || !safety.youtube.mock())) return;
        for(var row:db.queryForList("select id from publication_jobs where status='SCHEDULED' and scheduled_at<=now() and active_manifest_id is not null order by scheduled_at limit 10")){
            try {publishNow((UUID)row.get("id"));} catch(Exception ignored) { /* error is persisted by publishNow */ }
        }
        for(var row:db.queryForList("select id from publication_jobs where status='PUBLISHING' and platform_post_id is not null order by updated_at limit 10")){
            try {publishNow((UUID)row.get("id"));} catch(Exception ignored) { /* processing may still be pending */ }
        }
    }
}

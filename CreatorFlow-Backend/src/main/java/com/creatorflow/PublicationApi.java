package com.creatorflow;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.nio.file.Path;
import java.nio.file.Files;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/publication-jobs")
public class PublicationApi {
    private final JdbcTemplate db;
    private final YouTubePublisher youtube;
    private final Path storageRoot;
    private final boolean realPublishEnabled;
    PublicationApi(JdbcTemplate db,YouTubePublisher youtube,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String root,
                   @Value("${CREATORFLOW_ENABLE_REAL_PUBLISH:false}") boolean realPublishEnabled){
        this.db=db;this.youtube=youtube;this.storageRoot=Path.of(root).toAbsolutePath().normalize();this.realPublishEnabled=realPublishEnabled;
    }
    private static final String SELECT="select p.id,p.content_id as \"contentId\",c.title as \"contentTitle\",p.platform,p.status,p.scheduled_at as \"scheduledAt\",p.published_at as \"publishedAt\",p.caption,p.title,p.hashtags,p.attempts,p.max_attempts as \"maxAttempts\",p.error,p.platform_post_id as \"platformPostId\",p.approved_at as \"approvedAt\",p.created_at as \"createdAt\",p.updated_at as \"updatedAt\" from publication_jobs p join contents c on c.id=p.content_id";
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
        var existing=db.queryForList("select id from publication_jobs where content_id=? and platform=? order by case status when 'PUBLISHED' then 0 when 'PUBLISHING' then 1 when 'SCHEDULED' then 2 when 'RETRYING' then 3 when 'DRAFT' then 4 else 5 end, created_at desc limit 1",contentId,platform);
        if(!existing.isEmpty()) return one((UUID)existing.getFirst().get("id"));
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
        if(!List.of("DRAFT","SCHEDULED","FAILED").contains(job.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication cannot be edited");
        if(changes.keySet().stream().anyMatch(k->!List.of("title","caption","hashtags","scheduledAt").contains(k)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid publication fields");
        if(changes.containsKey("title")) db.update("update publication_jobs set title=?,updated_at=now() where id=?",changes.get("title"),id);
        if(changes.containsKey("caption")) db.update("update publication_jobs set caption=?,updated_at=now() where id=?",changes.get("caption"),id);
        if(changes.containsKey("scheduledAt")) db.update("update publication_jobs set scheduled_at=?,updated_at=now() where id=?",java.time.OffsetDateTime.parse(String.valueOf(changes.get("scheduledAt"))),id);
        if(changes.containsKey("hashtags")) db.update("update publication_jobs set hashtags=?,updated_at=now() where id=?",((List<?>)changes.get("hashtags")).stream().map(String::valueOf).toArray(String[]::new),id);
        return one(id);
    }
    @PostMapping("/{id}/approve") @Transactional Map<String,Object> approve(@PathVariable UUID id){
        var job=one(id);
        if(!"READY".equals(db.queryForObject("select status from contents where id=?",String.class,job.get("contentId")))
            && !"SCHEDULED".equals(db.queryForObject("select status from contents where id=?",String.class,job.get("contentId"))))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Final render required before approval");
        db.update("update publication_jobs set approved_at=now(),updated_at=now() where id=?",id);return one(id);
    }
    @PatchMapping("/{id}/status") Map<String,Object> status(@PathVariable UUID id,@RequestBody Map<String,String> body){
        var job=one(id);
        if(!"DRAFT".equals(body.get("status"))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Publication status is worker-controlled");
        db.update("update publication_jobs set status='DRAFT',approved_at=null,updated_at=now() where id=? and status='SCHEDULED'",id);return one(id);
    }
    @PostMapping("/{id}/retry") @Transactional Map<String,Object> retry(@PathVariable UUID id){
        var job=one(id);
        if(!"FAILED".equals(job.get("status")) || ((Number)job.get("attempts")).intValue()>=((Number)job.get("maxAttempts")).intValue())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication retry unavailable");
        lockTarget((UUID)job.get("contentId"),(String)job.get("platform"));
        int other=db.queryForObject("select count(*) from publication_jobs where content_id=? and platform=? and id<>? and status in ('DRAFT','SCHEDULED','PUBLISHING','PUBLISHED','RETRYING')",Integer.class,job.get("contentId"),job.get("platform"),id);
        if(other>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Another publication already owns this target");
        db.update("update publication_jobs set status='SCHEDULED',error=null,updated_at=now() where id=?",id);return one(id);
    }
    @PostMapping("/{id}/publish-now") Map<String,Object> publishNow(@PathVariable UUID id){
        var job=one(id);
        if(job.get("approvedAt")==null) throw new ResponseStatusException(HttpStatus.CONFLICT,"User approval required");
        if(!"YOUTUBE_SHORTS".equals(job.get("platform"))){
            db.update("update publication_jobs set status='FAILED',error='NOT_CONFIGURED: platform publishing adapter unavailable',updated_at=now() where id=?",id);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"NOT_CONFIGURED: platform publishing unavailable");
        }
        if(!realPublishEnabled){
            db.update("update publication_jobs set status='FAILED',error='NOT_CONFIGURED: real publishing disabled',updated_at=now() where id=?",id);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"NOT_CONFIGURED: real publishing disabled");
        }
        if("PUBLISHED".equals(job.get("status"))) return job;
        if(job.get("platformPostId")!=null){
            try {if(youtube.confirmed((String)job.get("platformPostId"))){
                db.update("update publication_jobs set status='PUBLISHED',published_at=now(),error=null,updated_at=now() where id=?",id);
                db.update("update contents set status='PUBLISHED',updated_at=now() where id=?",job.get("contentId"));return one(id);
            }} catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube confirmation failed");}
            throw new ResponseStatusException(HttpStatus.CONFLICT,"YouTube processing not confirmed");
        }
        int connected=db.queryForObject("select count(*) from social_connections where platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null",Integer.class);
        if(connected==0){
            db.update("update publication_jobs set status='FAILED',error='NOT_CONFIGURED: YouTube OAuth connection missing',updated_at=now() where id=?",id);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"NOT_CONFIGURED: YouTube OAuth connection missing");
        }
        var asset=db.queryForList("select storage_path from assets where content_id=? and asset_type='FINAL_VIDEO' order by created_at desc limit 1",job.get("contentId"));
        if(asset.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Final video missing");
        Path video=Path.of((String)asset.getFirst().get("storage_path")).toAbsolutePath().normalize();
        if(!video.startsWith(storageRoot) || !Files.isRegularFile(video)) throw new ResponseStatusException(HttpStatus.CONFLICT,"Final video file missing");
        var claimed=db.queryForList("update publication_jobs set status='PUBLISHING',attempts=attempts+1,error=null,updated_at=now() where id=? and approved_at is not null and platform_post_id is null and status in ('DRAFT','SCHEDULED','RETRYING') returning id",id);
        if(claimed.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Publication already claimed or needs reconciliation");
        try {
            String postId=youtube.publish(video,(String)job.get("title"),(String)job.get("caption"));
            db.update("update publication_jobs set platform_post_id=?,updated_at=now() where id=?",postId,id);
            return publishNow(id);
        } catch(ResponseStatusException e){throw e;}
        catch(Exception e){
            db.update("update publication_jobs set error='RECONCILIATION_REQUIRED: upload outcome unknown',updated_at=now() where id=?",id);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube upload outcome requires reconciliation");
        }
    }
    @Scheduled(fixedDelay=30000) void due(){
        if(!realPublishEnabled) return;
        for(var row:db.queryForList("select id from publication_jobs where status='SCHEDULED' and scheduled_at<=now() and approved_at is not null order by scheduled_at limit 10")){
            try {publishNow((UUID)row.get("id"));} catch(Exception ignored) { /* error is persisted by publishNow */ }
        }
        for(var row:db.queryForList("select id from publication_jobs where status='PUBLISHING' and platform_post_id is not null order by updated_at limit 10")){
            try {publishNow((UUID)row.get("id"));} catch(Exception ignored) { /* processing may still be pending */ }
        }
    }
}

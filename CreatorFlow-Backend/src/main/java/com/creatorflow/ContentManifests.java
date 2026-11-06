package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import jakarta.validation.constraints.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class ContentManifests {
    record Create(@NotNull UUID renderJobId,@NotNull UUID connectionId,@NotNull @Pattern(regexp="private|unlisted|public") String visibility) {}
    final JdbcTemplate db;final ObjectMapper json;final PublicationMedia media;
    ContentManifests(JdbcTemplate db,ObjectMapper json,PublicationMedia media) {this.db=db;this.json=json;this.media=media;}
    static ResponseStatusException blocked(String code) {return new ResponseStatusException(HttpStatus.CONFLICT,code);}
    String canonical(Object value) {
        try {return json.writer().without(SerializationFeature.INDENT_OUTPUT).writeValueAsString(sorted(json.valueToTree(value)));} catch(Exception e) {throw blocked("MANIFEST_SCHEMA_INVALID");}
    }
    private JsonNode sorted(JsonNode node) {
        if(node.isObject()) {var result=json.createObjectNode();var keys=new TreeSet<String>();node.fieldNames().forEachRemaining(keys::add);keys.forEach(k->result.set(k,sorted(node.get(k))));return result;}
        if(node.isArray()) {var result=json.createArrayNode();node.forEach(n->result.add(sorted(n)));return result;}return node;
    }
    static void operator(String actor) {if(!"local-user".equals(actor)) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Local operator identity required");}
    Map<String,Object> job(UUID id,boolean lock) {
        var rows=db.queryForList("select * from publication_jobs where id=?"+(lock?" for update":""),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Publication not found");return rows.getFirst();
    }
    void editable(Map<String,Object> job) {
        if(job.get("superseded_by")!=null || Boolean.TRUE.equals(job.get("reconciliation_required")) || job.get("platform_post_id")!=null || List.of("PUBLISHING","PUBLISHED").contains(job.get("status"))) throw blocked("TARGET_LOCKED_OR_RECONCILIATION_REQUIRED");
    }
    List<String> tags(Object value) {
        try {return Arrays.stream((String[])((java.sql.Array)value).getArray()).toList();} catch(Exception e) {throw blocked("METADATA_INVALID");}
    }
    static String timestamp(Object value) {return value==null?null:((java.sql.Timestamp)value).toInstant().toString();}
    Map<String,Object> metadata(Map<String,Object> job) {
        var tags=tags(job.get("hashtags"));String title=(String)job.get("title"),caption=(String)job.get("caption"),description=(String)job.get("description");
        String providerDescription=description+"\n\n"+caption+"\n\n"+String.join(" ",tags);
        if(title==null || title.isBlank() || title.length()>100 || providerDescription.length()>5000 || tags.size()>30 || tags.stream().anyMatch(t->t.length()>100)) throw blocked("METADATA_INVALID");
        return Map.of("title",title,"caption",caption,"description",description,"hashtags",tags,"providerDescription",providerDescription);
    }
    @Transactional Map<String,Object> create(UUID publication,Create input,String actor) {
        operator(actor);var job=job(publication,true);editable(job);
        var connections=db.queryForList("select id,platform,connection_revision from social_connections where id=? for share",input.connectionId());
        if(connections.isEmpty() || !job.get("platform").equals(connections.getFirst().get("platform"))) throw blocked("CONNECTION_TARGET_MISMATCH");
        var renders=db.queryForList("select r.id,r.output_asset_id,a.storage_path,a.file_size_bytes from render_jobs r join assets a on a.id=r.output_asset_id where r.id=? and r.content_id=? and r.status='SUCCESS' and a.content_id=r.content_id and a.asset_type='FINAL_VIDEO' and a.mime_type='video/mp4'",input.renderJobId(),job.get("content_id"));
        if(renders.isEmpty()) throw blocked("VERIFIED_FINAL_RENDER_REQUIRED");
        UUID current=currentRender((UUID)job.get("content_id"));if(!input.renderJobId().equals(current)) throw blocked("RENDER_REVISION_NOT_CURRENT");
        var boards=db.queryForList("select id,version from storyboards where content_id=? for share",job.get("content_id"));
        if(boards.size()!=1) throw blocked("STORYBOARD_REQUIRED");var board=boards.getFirst();
        var refs=provenance((UUID)job.get("content_id"),(UUID)board.get("id"),true);
        var render=renders.getFirst();var path=media.path(render.get("storage_path"));var proof=media.evidence(path);
        if(((Number)proof.get("sizeBytes")).longValue()!=((Number)render.get("file_size_bytes")).longValue()) throw blocked("ARTIFACT_SIZE_CHANGED");
        db.update("update publication_jobs set connection_id=?,visibility=?,updated_at=now() where id=?",input.connectionId(),input.visibility(),publication);
        job=job(publication,false);var meta=metadata(job);
        UUID id=UUID.randomUUID(),evidence=UUID.randomUUID();Instant now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        int revision=db.queryForObject("select coalesce(max(revision),0)+1 from publication_manifests where publication_id=?",Integer.class,publication);
        var document=new LinkedHashMap<String,Object>();
        document.put("manifestId",id);document.put("schemaVersion",1);document.put("revision",revision);document.put("publicationId",publication);
        document.put("contentId",job.get("content_id"));document.put("storyboardId",board.get("id"));document.put("storyboardVersion",board.get("version"));
        document.put("finalRenderJobId",input.renderJobId());document.put("finalVideoAssetId",render.get("output_asset_id"));
        document.put("media",proof);document.put("metadata",meta);document.put("targetPlatform",job.get("platform"));
        document.put("connectionId",input.connectionId());document.put("connectionRevision",connections.getFirst().get("connection_revision"));
        document.put("visibility",input.visibility());document.put("intendedSchedule",timestamp(job.get("scheduled_at")));document.put("createdAt",now.toString());
        document.put("evidenceId",evidence);document.put("artifactReferences",refs);
        document.put("providerSettings",Map.of("categoryId","22","selfDeclaredMadeForKids",false,"notifySubscribers",false));
        String canonical=canonical(document),fingerprint=AgentIdentity.hash(canonical);
        db.update("insert into artifact_evidence values (?,?,?,?,?,?,?::jsonb,?)",evidence,render.get("output_asset_id"),proof.get("sha256"),proof.get("sizeBytes"),proof.get("durationMillis"),proof.get("container"),canonical(proof.get("codecs")),java.sql.Timestamp.from(now));
        db.update("insert into publication_manifests values (?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?)",id,publication,revision,1,job.get("content_id"),board.get("id"),input.renderJobId(),render.get("output_asset_id"),evidence,input.connectionId(),connections.getFirst().get("connection_revision"),fingerprint,canonical,canonical,java.sql.Timestamp.from(now),actor);
        invalidate(publication,actor);
        db.update("update publication_jobs set active_manifest_id=?,approved_at=null,updated_at=now() where id=?",id,publication);
        db.update("insert into publication_approvals(id,manifest_id,fingerprint,required_operator,expires_at) values (?,?,?,?,now()+interval '1 hour')",UUID.randomUUID(),id,fingerprint,actor);
        audit(publication,id,"MANIFEST_CREATED",actor);return read(id);
    }
    UUID currentRender(UUID content) {
        var rows=db.queryForList("select id from render_jobs where content_id=? and status='SUCCESS' order by completed_at desc nulls last,created_at desc,id desc limit 1",content);
        return rows.isEmpty()?null:(UUID)rows.getFirst().get("id");
    }
    void verifyForApproval(Map<String,Object> m,Map<String,Object> job) {
        var doc=document(m);var connections=db.queryForList("select connection_revision from social_connections where id=? and platform=?",m.get("connection_id"),job.get("platform"));
        if(connections.isEmpty() || !connections.getFirst().get("connection_revision").equals(m.get("connection_revision")) || !Objects.equals(job.get("connection_id"),m.get("connection_id"))) throw blocked("CONNECTION_CHANGED");
        if(!AgentIdentity.hash(canonical(doc)).equals(m.get("fingerprint")) || !canonical(metadata(job)).equals(canonical(doc.get("metadata"))) || !Objects.equals(timestamp(job.get("scheduled_at")),doc.get("intendedSchedule")) || !Objects.equals(job.get("visibility"),doc.get("visibility")) || !job.get("platform").equals(doc.get("targetPlatform"))) throw blocked("METADATA_CHANGED");
        if(!Objects.equals(currentRender((UUID)job.get("content_id")),m.get("render_id"))) throw blocked("RENDER_CHANGED");
        var board=db.queryForMap("select version from storyboards where id=?",m.get("storyboard_id"));
        if(((Number)board.get("version")).intValue()!=((Number)doc.get("storyboardVersion")).intValue() || !canonical(provenance((UUID)job.get("content_id"),(UUID)m.get("storyboard_id"),false)).equals(canonical(doc.get("artifactReferences")))) throw blocked("SOURCE_ARTIFACT_CHANGED");
        var asset=db.queryForMap("select storage_path from assets where id=?",m.get("asset_id"));
        if(!((Map<?,?>)doc.get("media")).get("sha256").equals(PublicationMedia.hash(media.path(asset.get("storage_path"))))) throw blocked("ARTIFACT_CHANGED");
    }
    List<Map<String,Object>> provenance(UUID content,UUID board,boolean validate) {
        var scenes=db.queryForList("select asset_id,asset_status from scenes where storyboard_id=? order by scene_number",board);
        if(scenes.isEmpty() || scenes.stream().anyMatch(s->s.get("asset_id")==null || !"READY".equals(s.get("asset_status")))) throw blocked("SCENE_PROVENANCE_REQUIRED");
        var voice=db.queryForList("select id from assets where content_id=? and asset_type='AUDIO' order by created_at desc limit 1",content);
        if(voice.isEmpty()) throw blocked("VOICE_PROVENANCE_REQUIRED");
        var ids=new TreeSet<UUID>();scenes.forEach(s->ids.add((UUID)s.get("asset_id")));ids.add((UUID)voice.getFirst().get("id"));
        db.queryForList("select id from assets where content_id=? and asset_type='SUBTITLE'",content).forEach(r->ids.add((UUID)r.get("id")));
        var refs=new ArrayList<Map<String,Object>>();
        for(UUID id:ids) {
            var asset=db.queryForMap("select storage_path,mime_type,file_size_bytes,asset_type from assets where id=? and content_id=?",id,content);
            Path path=media.path(asset.get("storage_path"));if(validate) media.validator.validate(path,(String)asset.get("mime_type"));
            try {if(Files.size(path)!=((Number)asset.get("file_size_bytes")).longValue()) throw blocked("SOURCE_ARTIFACT_CHANGED");} catch(java.io.IOException e) {throw blocked("SOURCE_ARTIFACT_UNAVAILABLE");}
            refs.add(Map.of("assetId",id,"sha256",PublicationMedia.hash(path),"sizeBytes",asset.get("file_size_bytes"),"type",asset.get("asset_type")));
        }
        return refs;
    }
    Map<String,Object> row(UUID id) {
        var rows=db.queryForList("select * from publication_manifests where id=?",id);if(rows.isEmpty()) throw blocked("MANIFEST_REQUIRED");return rows.getFirst();
    }
    Map<String,Object> document(Map<String,Object> row) {
        try {return json.readValue(row.get("canonical_json").toString(),Map.class);} catch(Exception e) {throw blocked("MANIFEST_CORRUPT");}
    }
    Map<String,Object> read(UUID id) {
        var row=row(id);var result=new LinkedHashMap<>(document(row));result.put("fingerprint",row.get("fingerprint"));
        result.put("approval",db.queryForMap("select id,case when state in ('PENDING','APPROVED') and expires_at<=now() then 'EXPIRED' else state end as state,required_operator as \"requiredOperator\",issued_at as \"issuedAt\",expires_at as \"expiresAt\",decision_actor as \"decisionActor\",decision_at as \"decisionAt\" from publication_approvals where manifest_id=?",id));return result;
    }
    @Transactional void invalidate(UUID publication,String actor) {
        operator(actor);var job=job(publication,true);editable(job);
        if(job.get("active_manifest_id")!=null) {
            db.update("update publication_approvals set state='INVALIDATED' where manifest_id=? and state in ('PENDING','APPROVED')",job.get("active_manifest_id"));
            audit(publication,(UUID)job.get("active_manifest_id"),"MANIFEST_INVALIDATED",actor);
        }
        db.update("update publication_jobs set active_manifest_id=null,approved_at=null where id=?",publication);
    }
    void audit(UUID publication,UUID manifest,String type,String actor) {db.update("insert into publication_audit(id,publication_id,manifest_id,type,actor) values (?,?,?,?,?)",UUID.randomUUID(),publication,manifest,type,actor);}
}

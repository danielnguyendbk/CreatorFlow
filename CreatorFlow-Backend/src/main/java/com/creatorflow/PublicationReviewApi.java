package com.creatorflow;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/publication-review")
class PublicationReviewApi {
    final JdbcTemplate db;final ContentManifests manifests;final PublicationApprovals approvals;final PublicationSafety safety;
    PublicationReviewApi(JdbcTemplate db,ContentManifests manifests,PublicationApprovals approvals,PublicationSafety safety) {this.db=db;this.manifests=manifests;this.approvals=approvals;this.safety=safety;}
    @GetMapping("/jobs/{id}") Map<String,Object> review(@PathVariable UUID id) {
        var job=manifests.job(id,false);var history=db.queryForList("select id from publication_manifests where publication_id=? order by revision desc",id);
        var revisions=history.stream().map(r->manifests.read((UUID)r.get("id"))).toList();
        var result=new LinkedHashMap<String,Object>();result.put("publicationId",id);result.put("activeManifestId",job.get("active_manifest_id"));result.put("manifests",revisions);
        result.put("readiness",safety.readiness(id));
        result.put("renders",db.queryForList("select id,status,output_asset_id as \"outputAssetId\",completed_at as \"completedAt\" from render_jobs where content_id=? and status='SUCCESS' order by completed_at desc nulls last,created_at desc",job.get("content_id")));
        result.put("connections",db.queryForList("select id,platform,status,connection_revision as revision,revoked_at as \"revokedAt\" from social_connections order by platform"));
        result.put("audit",db.queryForList("select id,manifest_id as \"manifestId\",type,actor,created_at as \"createdAt\" from publication_audit where publication_id=? order by created_at desc limit 100",id));
        return result;
    }
    @PostMapping("/jobs/{id}/manifests") Map<String,Object> create(@PathVariable UUID id,@Valid @RequestBody ContentManifests.Create input,Authentication auth) {return manifests.create(id,input,auth.getName());}
    @GetMapping("/manifests/{id}") Map<String,Object> one(@PathVariable UUID id) {return manifests.read(id);}
    @PostMapping("/manifests/{id}/decision") Map<String,Object> decide(@PathVariable UUID id,@Valid @RequestBody PublicationApprovals.Decide input,Authentication auth) {return approvals.decide(id,input,auth.getName());}
    @PostMapping("/manifests/{id}/revoke") Map<String,Object> revoke(@PathVariable UUID id,Authentication auth) {return approvals.revoke(id,auth.getName());}
    @PostMapping("/jobs/{id}/invalidate") Map<String,Object> invalidate(@PathVariable UUID id,Authentication auth) {manifests.invalidate(id,auth.getName());return review(id);}
}

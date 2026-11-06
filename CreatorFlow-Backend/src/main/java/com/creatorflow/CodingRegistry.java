package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import jakarta.validation.constraints.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class CodingRegistry {
    record Register(@NotNull UUID agentId,@NotBlank @Size(max=512) String canonicalPath,@NotBlank @Size(max=512) String remoteUrl,
        @NotNull @Size(min=1,max=10) List<@Pattern(regexp="[A-Za-z0-9][A-Za-z0-9/_-]{0,99}") String> allowedBases,
        @NotNull @Size(min=1,max=20) List<@Pattern(regexp="[A-Za-z0-9][A-Za-z0-9/_-]{0,99}") String> protectedBranches) {}
    final JdbcTemplate db;final ObjectMapper json;
    CodingRegistry(JdbcTemplate db,ObjectMapper json) {this.db=db;this.json=json;}
    String encode(Object value) {try {return json.writeValueAsString(value);} catch(Exception e) {throw AgentQueue.conflict("Invalid coding contract");}}
    Object decode(Object value) {try {return json.readValue(value.toString(),Object.class);} catch(Exception e) {throw AgentQueue.conflict("Invalid stored coding contract");}}
    static void branch(String branch) {if(branch.contains("..") || branch.contains("//") || branch.endsWith("/") || branch.startsWith("creatorflow/")) throw AgentQueue.conflict("Invalid approved base branch");}
    @Transactional Map<String,Object> register(Register input,String actor) {
        ContentManifests.operator(actor);input.allowedBases().forEach(CodingRegistry::branch);input.protectedBranches().forEach(CodingRegistry::branch);
        String canonical;
        try {
            var path=Path.of(input.canonicalPath());if(!path.isAbsolute() || !Files.isDirectory(path) || Files.isSymbolicLink(path)) throw new IllegalArgumentException();
            var normalized=path.normalize().toAbsolutePath();var real=normalized.toRealPath();
            for(Path parent=normalized;parent!=null;parent=parent.getParent()) if(!parent.toRealPath().toString().equalsIgnoreCase(parent.toString())) throw new IllegalArgumentException();
            if(!real.toString().equalsIgnoreCase(normalized.toString()) || !Files.isDirectory(real.resolve(".git"),LinkOption.NOFOLLOW_LINKS)) throw new IllegalArgumentException();canonical=real.toString();
            var remote=java.net.URI.create(input.remoteUrl());if(!"https".equals(remote.getScheme()) || remote.getHost()==null || remote.getUserInfo()!=null || remote.getQuery()!=null || remote.getFragment()!=null) throw new IllegalArgumentException();
        } catch(Exception e) {throw AgentQueue.conflict("Repository path/remote must be canonical, non-reparse, existing and credential-free HTTPS metadata");}
        String fingerprint=AgentIdentity.hash(encode(List.of(input.agentId(),canonical,input.remoteUrl(),input.allowedBases(),input.protectedBranches())));
        var old=db.queryForList("select id,config_hash from coding_repositories where agent_id=? and canonical_path=?",input.agentId(),canonical);
        if(!old.isEmpty()) {if(!fingerprint.equals(old.getFirst().get("config_hash"))) throw AgentQueue.conflict("Repository registration immutable; review a new registration");return repository((UUID)old.getFirst().get("id"));}
        UUID id=UUID.randomUUID();db.update("insert into coding_repositories(id,agent_id,canonical_path,remote_url,allowed_bases,protected_branches,config_hash,approved_by) values (?,?,?,?,?::jsonb,?::jsonb,?,?)",id,input.agentId(),canonical,input.remoteUrl(),encode(input.allowedBases()),encode(input.protectedBranches()),fingerprint,actor);
        db.update("insert into coding_workspace_events(repository_id,type,actor) values (?,'REPOSITORY_APPROVED',?)",id,actor);return repository(id);
    }
    Map<String,Object> repository(UUID id) {
        var rows=db.queryForList("select id,agent_id as \"agentId\",canonical_path as \"canonicalPath\",remote_url as \"remoteUrl\",allowed_bases as \"allowedBases\",protected_branches as \"protectedBranches\",enabled,verification,verified_commits as \"verifiedCommits\",config_hash as \"configHash\",approved_by as \"approvedBy\",verified_at as \"verifiedAt\",error_code as \"errorCode\" from coding_repositories where id=?",id);
        if(rows.isEmpty()) throw AgentQueue.conflict("Repository not registered");var row=rows.getFirst();for(String field:List.of("allowedBases","protectedBranches","verifiedCommits")) row.put(field,decode(row.get(field)));return row;
    }
    @Transactional void verify(UUID agent,UUID session,UUID repo,String configHash,Map<String,String> commits,String error,AgentQueue queue) {
        queue.current(agent,session);var registered=repository(repo);
        if(!agent.equals(registered.get("agentId")) || !configHash.equals(registered.get("configHash"))) throw AgentQueue.conflict("Repository verification identity fenced");
        if(!((List<?>)registered.get("allowedBases")).containsAll(commits.keySet()) || commits.values().stream().anyMatch(c->!c.matches("[a-f0-9]{40,64}"))) throw AgentQueue.conflict("Invalid verified refs");
        boolean valid=error==null && commits.keySet().containsAll((List<?>)registered.get("allowedBases"));
        db.update("update coding_repositories set verification=?,verified_commits=?::jsonb,verified_at=now(),error_code=? where id=?",valid?"VERIFIED":"REJECTED",encode(commits),valid?null:"LOCAL_REPOSITORY_REJECTED",repo);
    }
}

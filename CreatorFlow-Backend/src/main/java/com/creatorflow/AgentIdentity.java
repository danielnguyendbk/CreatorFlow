package com.creatorflow;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class AgentIdentity {
    record Proof(UUID agent,long generation,String hash) {}
    private final JdbcTemplate db;
    AgentIdentity(JdbcTemplate db) {this.db=db;}
    boolean enrollmentOpen() {return db.queryForObject("select count(*) from agent_enrollment_policy where id=1 and enabled_until>now()",Integer.class)==1;}
    static String hash(String secret) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
    }
    static boolean equal(String a,String b) {
        return a!=null && b!=null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));
    }
    Proof authenticate(String id,String authorization) {
        try {
            UUID agent=UUID.fromString(id);
            if(authorization==null || !authorization.startsWith("Agent ") || authorization.length()>200) return null;
            var rows=db.queryForList("select token_hash,generation from agent_credentials where agent_id=? and revoked_at is null and scope='AGENT_RUNTIME'",agent);
            if(rows.size()!=1 || !equal((String)rows.getFirst().get("token_hash"),hash(authorization.substring(6)))) return null;
            db.update("update agent_credentials set last_used_at=now() where agent_id=?",agent);
            return new Proof(agent,((Number)rows.getFirst().get("generation")).longValue(),(String)rows.getFirst().get("token_hash"));
        } catch(IllegalArgumentException | NullPointerException e) {return null;}
    }
    static void requireCurrent(JdbcTemplate db,UUID agent) {
        var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if(auth!=null && auth.getPrincipal() instanceof UUID) {
            if(!(auth.getDetails() instanceof Proof proof) || !proof.agent().equals(agent) || db.queryForObject("select count(*) from agent_credentials where agent_id=? and generation=? and token_hash=? and revoked_at is null",Integer.class,agent,proof.generation(),proof.hash())!=1)
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED,"Stale or revoked credential");
        }
    }
}

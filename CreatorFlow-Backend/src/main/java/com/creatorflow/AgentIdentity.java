package com.creatorflow;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class AgentIdentity {
    private final JdbcTemplate db;
    AgentIdentity(JdbcTemplate db) {this.db=db;}
    static String hash(String secret) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
    }
    static boolean equal(String a,String b) {
        return a!=null && b!=null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));
    }
    UUID authenticate(String id,String authorization) {
        try {
            UUID agent=UUID.fromString(id);
            if(authorization==null || !authorization.startsWith("Agent ") || authorization.length()>200) return null;
            var rows=db.queryForList("select token_hash from agent_credentials where agent_id=? and revoked_at is null and scope='AGENT_RUNTIME'",agent);
            if(rows.size()!=1 || !equal((String)rows.getFirst().get("token_hash"),hash(authorization.substring(6)))) return null;
            db.update("update agent_credentials set last_used_at=now() where agent_id=?",agent);
            return agent;
        } catch(IllegalArgumentException | NullPointerException e) {return null;}
    }
}

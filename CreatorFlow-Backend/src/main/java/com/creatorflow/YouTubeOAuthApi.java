package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/social/youtube")
public class YouTubeOAuthApi {
    private static final String SCOPE="https://www.googleapis.com/auth/youtube.upload";
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final SecureRandom random=new SecureRandom();
    private final String clientId,clientSecret,redirectUri,tokenEndpoint,revokeEndpoint,keyBase64;
    YouTubeOAuthApi(JdbcTemplate db,ObjectMapper json,@Value("${YOUTUBE_CLIENT_ID:}") String clientId,
            @Value("${YOUTUBE_CLIENT_SECRET:}") String clientSecret,@Value("${YOUTUBE_REDIRECT_URI:}") String redirectUri,
            @Value("${YOUTUBE_TOKEN_ENDPOINT:https://oauth2.googleapis.com/token}") String tokenEndpoint,
            @Value("${YOUTUBE_REVOKE_ENDPOINT:https://oauth2.googleapis.com/revoke}") String revokeEndpoint,
            @Value("${CREATORFLOW_TOKEN_ENCRYPTION_KEY:}") String keyBase64){
        this.db=db;this.json=json;this.clientId=clientId;this.clientSecret=clientSecret;this.redirectUri=redirectUri;
        this.tokenEndpoint=tokenEndpoint;this.revokeEndpoint=revokeEndpoint;this.keyBase64=keyBase64;
    }
    private void configured(){
        if(clientId.isBlank() || clientSecret.isBlank() || redirectUri.isBlank() || keyBase64.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"YouTube OAuth NOT_CONFIGURED");
    }
    private static String form(Map<String,String> values){
        return values.entrySet().stream().map(e->URLEncoder.encode(e.getKey(),StandardCharsets.UTF_8)+"="+URLEncoder.encode(e.getValue(),StandardCharsets.UTF_8)).reduce((a,b)->a+"&"+b).orElse("");
    }
    private static String hash(String value){
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    private byte[] key(){
        try {byte[] bytes=Base64.getDecoder().decode(keyBase64);if(bytes.length!=32) throw new IllegalArgumentException();return bytes;}
        catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Token encryption key must be 32 bytes in Base64");}
    }
    private byte[] encrypt(String value) throws Exception {
        byte[] nonce=new byte[12];random.nextBytes(nonce);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key(),"AES"),new GCMParameterSpec(128,nonce));
        byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] result=new byte[nonce.length+encrypted.length];System.arraycopy(nonce,0,result,0,nonce.length);System.arraycopy(encrypted,0,result,nonce.length,encrypted.length);return result;
    }
    private String decrypt(byte[] bytes) throws Exception {
        if(bytes.length<29) throw new IllegalArgumentException("Invalid encrypted token");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key(),"AES"),new GCMParameterSpec(128,bytes,0,12));
        return new String(cipher.doFinal(bytes,12,bytes.length-12),StandardCharsets.UTF_8);
    }
    @GetMapping("/authorize") Map<String,String> authorize(){
        configured();key();byte[] nonce=new byte[32];random.nextBytes(nonce);String state=HexFormat.of().formatHex(nonce);
        db.update("insert into oauth_states(state_hash,platform,expires_at) values (?,'YOUTUBE_SHORTS',now()+interval '10 minutes')",hash(state));
        String url="https://accounts.google.com/o/oauth2/v2/auth?"+form(Map.of("client_id",clientId,"redirect_uri",redirectUri,
            "response_type","code","scope",SCOPE,"access_type","offline","prompt","consent","state",state));
        return Map.of("authorizationUrl",url);
    }
    @GetMapping("/callback") Map<String,String> callback(@RequestParam String code,@RequestParam String state) throws Exception {
        configured();
        int consumed=db.update("delete from oauth_states where state_hash=? and platform='YOUTUBE_SHORTS' and expires_at>now()",hash(state));
        if(consumed!=1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid OAuth state");
        JsonNode response=tokenRequest(Map.of("client_id",clientId,"client_secret",clientSecret,"redirect_uri",redirectUri,"code",code,"grant_type","authorization_code"));
        String refresh=response.path("refresh_token").asText();
        String scopes=response.path("scope").asText();
        if(refresh.isBlank() || !java.util.Set.of(scopes.split("\\s+")).contains(SCOPE)) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube did not grant offline upload scope");
        db.update("insert into social_connections(id,platform,status,encrypted_refresh_token,scopes,expires_at) values (?,'YOUTUBE_SHORTS','CONFIGURED',?,?,now()+interval '1 hour') on conflict(platform) do update set status='CONFIGURED',encrypted_refresh_token=excluded.encrypted_refresh_token,scopes=excluded.scopes,revoked_at=null,updated_at=now()",
            UUID.randomUUID(),encrypt(refresh),new String[]{SCOPE});
        return Map.of("status","CONFIGURED");
    }
    private JsonNode tokenRequest(Map<String,String> values) throws Exception {
        var req=HttpRequest.newBuilder(URI.create(tokenEndpoint)).header("Content-Type","application/x-www-form-urlencoded")
            .timeout(Duration.ofSeconds(30)).POST(HttpRequest.BodyPublishers.ofString(form(values))).build();
        var res=http.send(req,HttpResponse.BodyHandlers.ofString());
        if(res.statusCode()!=200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube token request failed: HTTP "+res.statusCode());
        return json.readTree(res.body());
    }
    String accessToken() throws Exception {
        configured();
        var rows=db.queryForList("select encrypted_refresh_token,scopes from social_connections where platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null");
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"YouTube NOT_CONFIGURED");
        var row=rows.getFirst();
        String refresh=decrypt((byte[])row.get("encrypted_refresh_token"));
        JsonNode result=tokenRequest(Map.of("client_id",clientId,"client_secret",clientSecret,"grant_type","refresh_token","refresh_token",refresh));
        String access=result.path("access_token").asText();
        if(access.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube access token missing");
        return access;
    }
    boolean publicationConfigured() {return !clientId.isBlank() && !clientSecret.isBlank() && !redirectUri.isBlank() && !keyBase64.isBlank();}
    String accessToken(UUID connection,UUID revision) throws Exception {
        configured();
        var rows=db.queryForList("select encrypted_refresh_token,scopes from social_connections where id=? and connection_revision=? and platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null",connection,revision);
        if(rows.size()!=1) throw ContentManifests.blocked("CONNECTION_REVOKED_OR_CHANGED");
        var row=rows.getFirst();
        if(!java.util.Arrays.asList((String[])((java.sql.Array)row.get("scopes")).getArray()).contains(SCOPE)) throw ContentManifests.blocked("UPLOAD_SCOPE_MISSING");
        String refresh=decrypt((byte[])row.get("encrypted_refresh_token"));
        var result=tokenRequest(Map.of("client_id",clientId,"client_secret",clientSecret,"grant_type","refresh_token","refresh_token",refresh));
        if(result.has("scope") && !java.util.Arrays.asList(result.path("scope").asText().split("\\s+")).contains(SCOPE)) throw ContentManifests.blocked("UPLOAD_SCOPE_MISSING");
        String access=result.path("access_token").asText();if(access.isBlank()) throw ContentManifests.blocked("ACCESS_TOKEN_UNAVAILABLE");return access;
    }
    @PostMapping("/revoke") void revoke() throws Exception {
        var rows=db.queryForList("select encrypted_refresh_token from social_connections where platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null");
        if(rows.isEmpty()) return;
        String refresh=decrypt((byte[])rows.getFirst().get("encrypted_refresh_token"));
        var request=HttpRequest.newBuilder(URI.create(revokeEndpoint)).header("Content-Type","application/x-www-form-urlencoded")
            .timeout(Duration.ofSeconds(30)).POST(HttpRequest.BodyPublishers.ofString(form(Map.of("token",refresh)))).build();
        var response=http.send(request,HttpResponse.BodyHandlers.discarding());
        if(response.statusCode()!=200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"YouTube token revocation failed: HTTP "+response.statusCode());
        db.update("update social_connections set status='NOT_CONFIGURED',encrypted_refresh_token=null,revoked_at=now(),updated_at=now() where platform='YOUTUBE_SHORTS'");
    }
    @GetMapping("/status") Map<String,String> status(){
        int count=db.queryForObject("select count(*) from social_connections where platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null",Integer.class);
        return Map.of("status",count>0?"CONFIGURED":"NOT_CONFIGURED");
    }
}

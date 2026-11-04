package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
class YouTubeOAuthIntegrationTest {
    @Test void codeExchangeRefreshEncryptionAndRevocation() throws Exception {
        var ds=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(ds);
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var revokes=new AtomicInteger();
        String refresh="fixture-"+UUID.randomUUID();
        server.createContext("/token",exchange->{
            byte[] request=exchange.getRequestBody().readAllBytes();
            String body=new String(request,StandardCharsets.UTF_8);
            String result=body.contains("grant_type=refresh_token")?"{\"access_token\":\"access-fixture\"}":
                "{\"access_token\":\"access-fixture\",\"refresh_token\":\""+refresh+"\",\"scope\":\"https://www.googleapis.com/auth/youtube.upload\"}";
            byte[] bytes=result.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });
        server.createContext("/revoke",exchange->{
            String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            if(body.contains(refresh)) revokes.incrementAndGet();
            exchange.sendResponseHeaders(200,-1);exchange.close();
        });
        server.start();
        try {
            byte[] key=new byte[32];new SecureRandom().nextBytes(key);
            String base="http://127.0.0.1:"+server.getAddress().getPort();
            var oauth=new YouTubeOAuthApi(db,new ObjectMapper(),"client-fixture","secret-fixture","http://127.0.0.1/callback",base+"/token",base+"/revoke",Base64.getEncoder().encodeToString(key));
            String url=oauth.authorize().get("authorizationUrl");
            String state=java.util.Arrays.stream(URI.create(url).getRawQuery().split("&")).filter(s->s.startsWith("state=")).findFirst().orElseThrow().substring(6);
            assertEquals("CONFIGURED",oauth.callback("code-fixture",state).get("status"));
            byte[] encrypted=db.queryForObject("select encrypted_refresh_token from social_connections where platform='YOUTUBE_SHORTS'",byte[].class);
            assertFalse(new String(encrypted,StandardCharsets.ISO_8859_1).contains(refresh));
            assertEquals("access-fixture",oauth.accessToken());
            oauth.revoke();
            assertEquals(1,revokes.get());
            assertEquals("NOT_CONFIGURED",oauth.status().get("status"));
        } finally {
            db.update("delete from social_connections where platform='YOUTUBE_SHORTS'");
            db.update("delete from oauth_states where platform='YOUTUBE_SHORTS'");
            server.stop(0);
        }
    }
}

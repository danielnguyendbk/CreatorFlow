package com.creatorflow;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="creatorflow.api-token=fixture-test-token")
@Import(AccountApiIntegrationTest.FixtureConfig.class)
class AccountApiIntegrationTest {
    static class FixtureDiscovery extends AccountDiscovery {
        int calls;
        String codexStatus="CONNECTED";
        @Override Health inspect(String provider) {
            calls++;
            return new Health(provider.endsWith("_CLI"),provider.equals("CODEX_CLI") ? codexStatus : "UNKNOWN","FIXTURE_HEALTH");
        }
    }
    @TestConfiguration static class FixtureConfig {
        @Bean @Primary FixtureDiscovery fixtureDiscovery() { return new FixtureDiscovery(); }
    }
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));
        p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));
        p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate db;
    @Autowired FixtureDiscovery discovery;
    private <T> ResponseEntity<T> request(String path,HttpMethod method,Class<T> type) {
        var headers=new HttpHeaders();headers.setBearerAuth("fixture-test-token");
        return http.exchange("/api/v2/accounts"+path,method,new HttpEntity<>(headers),type);
    }

    @Test void authenticatedDiscoveryPersistsOnlyAllowlistedMetadata() {
        assertEquals(HttpStatus.UNAUTHORIZED,http.getForEntity("/api/v2/accounts",String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.postForEntity("/api/v2/accounts/refresh",null,String.class).getStatusCode());
        discovery.codexStatus="CONNECTED";
        var result=request("/refresh",HttpMethod.POST,List.class);
        assertEquals(HttpStatus.OK,result.getStatusCode());assertEquals(4,result.getBody().size());
        for(Object row:result.getBody()) {
            assertEquals(java.util.Set.of("provider","displayName","installed","status","healthCode","reconnectCapability","switchingCapability","checkedAt"),((Map<?,?>)row).keySet());
        }
        assertEquals("CONNECTED",db.queryForObject("select connection_status from provider_accounts where provider='CODEX_CLI'",String.class));
        assertEquals("UNKNOWN",db.queryForObject("select connection_status from provider_accounts where provider='GEMINI_CLI'",String.class));
        assertEquals(0,db.queryForObject("select count(*) from information_schema.columns where table_name in ('provider_accounts','account_reconnect_intents') and column_name ~ '(token|password|cookie|cache|secret)'",Integer.class));
        discovery.codexStatus="EXPIRED";
        assertEquals(HttpStatus.OK,request("/refresh",HttpMethod.POST,List.class).getStatusCode());
        assertEquals("EXPIRED",db.queryForObject("select connection_status from provider_accounts where provider='CODEX_CLI'",String.class));
    }

    @Test void reconnectIsAnIntentAndUnsupportedSwitchNeverChangesIdentity() {
        int calls=discovery.calls;
        assertEquals(HttpStatus.UNAUTHORIZED,http.postForEntity("/api/v2/accounts/CODEX_CLI/reconnect-intent",null,String.class).getStatusCode());
        int before=db.queryForObject("select count(*) from account_reconnect_intents",Integer.class);
        for(String provider:List.of("CODEX_CLI","GEMINI_CLI")) {
            var result=request("/"+provider+"/reconnect-intent",HttpMethod.POST,Map.class);
            assertEquals(HttpStatus.OK,result.getStatusCode());
            assertEquals("AWAITING_USER_OFFICIAL_FLOW",result.getBody().get("status"));
            String id=(String)result.getBody().get("id");
            assertEquals(provider,db.queryForObject("select provider from account_reconnect_intents where id=?::uuid",String.class,id));
            db.update("delete from account_reconnect_intents where id=?::uuid",id);
        }
        for(String provider:List.of("CODEX_CLI","GEMINI_CLI","GEMINI_API","OPENROUTER_API"))
            assertEquals(HttpStatus.CONFLICT,request("/"+provider+"/default",HttpMethod.POST,String.class).getStatusCode());
        assertEquals(HttpStatus.CONFLICT,request("/GEMINI_API/reconnect-intent",HttpMethod.POST,String.class).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,request("/INVALID/reconnect-intent",HttpMethod.POST,String.class).getStatusCode());
        assertEquals(before,db.queryForObject("select count(*) from account_reconnect_intents",Integer.class));
        assertEquals(calls,discovery.calls);
    }
}

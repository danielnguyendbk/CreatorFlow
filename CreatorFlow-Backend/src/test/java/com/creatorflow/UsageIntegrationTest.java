package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="creatorflow.api-token=fixture-browser-token")
class UsageIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired UsageApi usage;
    @Autowired AgentQueue queue;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired TestRestTemplate http;
    @Autowired jakarta.validation.Validator validator;
    UUID agent,session;String credential;
    @BeforeEach void start() {var id=queue.register("Quota fixture");agent=(UUID)id.get("id");credential=(String)id.get("credential");session=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");}
    @AfterEach void cleanup() {db.update("delete from agent_task_events where task_id in(select id from agent_tasks where agent_id=?)",agent);db.update("delete from agent_tasks where agent_id=?",agent);db.update("delete from ai_usage_snapshots where agent_id=?",agent);db.update("delete from usage_refresh_requests where agent_id=?",agent);db.update("delete from agent_credentials where agent_id=?",agent);db.update("delete from local_agents where id=?",agent);}
    HttpHeaders headers(boolean operator) {var h=new HttpHeaders();h.setContentType(MediaType.APPLICATION_JSON);if(operator)h.setBearerAuth("fixture-browser-token");else{h.set("Authorization","Agent "+credential);h.set("X-Agent-Id",agent.toString());}return h;}
    Map<String,Object> snapshot(long sequence,Instant at,List<Map<String,Object>> windows,String status) {
        return new LinkedHashMap<>(Map.of("id",UUID.randomUUID(),"sequence",sequence,"observedAt",at.toString(),"cliVersion","0.162.1","status",status,"windows",windows));
    }
    void send(Map<String,Object> value) {assertEquals(HttpStatus.OK,http.exchange("/api/v2/agent-runtime/usage/snapshot?sessionId="+session,HttpMethod.POST,new HttpEntity<>(value,headers(false)),Map.class).getStatusCode());}
    Map<String,Object> window(int mins,double used) {return Map.of("windowDurationMins",mins,"usedPercent",used,"resetsAt",2000000000L);}
    @Test void realSchemaSupportsBothWindowsWeeklyOnlyThresholdsAndTimestamps() {
        send(snapshot(1,Instant.now(),List.of(window(10080,30),window(300,95)),"OK"));
        var data=usage.codex(agent);assertEquals("LIVE",data.get("freshness"));
        assertEquals("CRITICAL",((Map<?,?>)data.get("fiveHour")).get("warning"));assertEquals(2000000000L,((Map<?,?>)data.get("weekly")).get("resetsAt"));
        send(snapshot(2,Instant.now(),List.of(window(10080,100)),"OK"));
        data=usage.codex(agent);assertEquals("NOT_AVAILABLE",((Map<?,?>)data.get("fiveHour")).get("status"));assertEquals("WAIT_FOR_RESET",data.get("automationReadiness"));
    }
    @Test void duplicatesOutOfOrderFailuresAndRestartDoNotOverwriteFreshData() {
        var first=snapshot(2,Instant.now(),List.of(window(300,20)),"OK");send(first);send(first);
        send(snapshot(1,Instant.now().minusSeconds(300),List.of(window(300,99)),"OK"));
        assertEquals(20.0,((Map<?,?>)usage.codex(agent).get("fiveHour")).get("usedPercent"));
        send(snapshot(3,Instant.now(),List.of(),"TIMEOUT"));assertEquals("STALE",usage.codex(agent).get("freshness"));
        var newSession=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");
        assertEquals(HttpStatus.CONFLICT,http.exchange("/api/v2/agent-runtime/usage/snapshot?sessionId="+session,HttpMethod.POST,new HttpEntity<>(snapshot(4,Instant.now(),List.of(),"ERROR"),headers(false)),Map.class).getStatusCode());
        session=newSession;
        assertEquals(3,((Number)usage.instructions(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(agent,null,List.of()),new AgentApi.SessionRequest(session)).get("sequence")).intValue());
        assertEquals(3,usage.history(agent,20).size());
    }
    @Test void operatorScopeRateLimitSchemaPrivacyAndUnknownAreEnforced() {
        assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/v2/usage/codex",HttpMethod.GET,new HttpEntity<>(headers(false)),String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/v2/usage/refresh",HttpMethod.POST,new HttpEntity<>(Map.of(),headers(false)),String.class).getStatusCode());
        assertEquals(HttpStatus.ACCEPTED,http.exchange("/api/v2/usage/refresh?agentId="+agent,HttpMethod.POST,new HttpEntity<>(Map.of(),headers(true)),Map.class).getStatusCode());
        assertEquals(HttpStatus.TOO_MANY_REQUESTS,http.exchange("/api/v2/usage/refresh?agentId="+agent,HttpMethod.POST,new HttpEntity<>(Map.of(),headers(true)),Map.class).getStatusCode());
        for(String field:List.of("email","authToken","cookies","prompt","accountId","agentId")) {
            var bad=snapshot(1,Instant.now(),List.of(),"NO_DATA");bad.put(field,"private");
            assertEquals(HttpStatus.BAD_REQUEST,http.exchange("/api/v2/agent-runtime/usage/snapshot?sessionId="+session,HttpMethod.POST,new HttpEntity<>(bad,headers(false)),Map.class).getStatusCode());
        }
        assertEquals("UNKNOWN",usage.codex(agent).get("freshness"));
        assertEquals(0,db.queryForObject("select count(*) from ai_usage_snapshots where agent_id=? and payload::text like '%private%'",Integer.class,agent));
        send(snapshot(1,Instant.now(),List.of(),"NOT_AUTHENTICATED"));assertEquals("UNKNOWN",usage.codex(agent).get("freshness"));
        send(snapshot(2,Instant.now().minusSeconds(1000),List.of(window(300,80)),"OK"));assertNotEquals("LIVE",usage.codex(agent).get("freshness"));
    }
    @Test void thresholdsAreConfigurableAndExhaustionNeverBlocksGitFixtures() {
        send(snapshot(1,Instant.now(),List.of(window(300,75)),"OK"));
        var configured=new UsageApi(db,json,queue,validator,360,30,15);
        assertEquals("LOW",((Map<?,?>)configured.codex(agent).get("fiveHour")).get("warning"));
        var exhausted=snapshot(2,Instant.now(),List.of(window(300,50)),"OK");exhausted.put("rateLimitReached",true);send(exhausted);
        assertEquals("WAIT_FOR_RESET",usage.codex(agent).get("automationReadiness"));
        queue.enqueue(new AgentApi.CreateTask(agent,AgentApi.Kind.GIT_FIXTURE,UUID.randomUUID().toString(),"quota-independent",10,1));
        assertNotNull(queue.claim(agent,session));
        var passed=snapshot(3,Instant.now(),List.of(Map.of("windowDurationMins",300,"usedPercent",90,"resetsAt",Instant.now().minusSeconds(1).getEpochSecond())),"OK");send(passed);
        assertEquals("STALE",usage.codex(agent).get("freshness"));
    }
}

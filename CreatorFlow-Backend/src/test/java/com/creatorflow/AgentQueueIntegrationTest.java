package com.creatorflow;

import java.util.*;
import java.util.concurrent.*;
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
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"creatorflow.api-token=fixture-browser-token",
    "CREATORFLOW_AGENT_ENROLLMENT_TOKEN=fixture-enrollment-token-at-least-32-characters"})
class AgentQueueIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));
        p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));
        p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired TestRestTemplate http;
    @Autowired AgentQueue queue;
    @Autowired JdbcTemplate db;
    private final List<UUID> created=new ArrayList<>();
    record Identity(UUID id,String credential) {}
    private ResponseEntity<Map> post(String path,Object body,HttpHeaders headers) {
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(path,HttpMethod.POST,new HttpEntity<>(body,headers),Map.class);
    }
    private HttpHeaders browser() {var h=new HttpHeaders();h.setBearerAuth("fixture-browser-token");return h;}
    private HttpHeaders agent(Identity identity) {var h=new HttpHeaders();h.set("Authorization","Agent "+identity.credential());h.set("X-Agent-Id",identity.id().toString());return h;}
    private Identity register() {
        assertEquals(HttpStatus.OK,post("/api/v2/agent-credentials/enrollment",Map.of("minutes",1,"confirmation","ENROLL"),browser()).getStatusCode());
        var h=new HttpHeaders();h.set("X-Agent-Enrollment","fixture-enrollment-token-at-least-32-characters");
        String secret="fixture-agent-"+UUID.randomUUID();UUID requested=UUID.randomUUID();
        var response=post("/api/v2/agent-runtime/register",Map.of("name","Queue fixture","id",requested,"credentialHash",AgentIdentity.hash(secret)),h);
        assertEquals(HttpStatus.OK,response.getStatusCode());
        assertEquals("no-store",response.getHeaders().getCacheControl());
        UUID id=UUID.fromString((String)response.getBody().get("id"));created.add(id);
        db.update("delete from agent_identity_audit where agent_id=?",id);
        return new Identity(id,secret);
    }
    private UUID session(Identity identity) {
        var r=post("/api/v2/agent-runtime/session",Map.of("capabilities",AgentQueue.KINDS),agent(identity));
        assertEquals(HttpStatus.OK,r.getStatusCode());return UUID.fromString((String)r.getBody().get("sessionId"));
    }
    private UUID create(Identity identity,String key) {
        return (UUID)queue.enqueue(new AgentApi.CreateTask(identity.id(),AgentApi.Kind.GIT_FIXTURE,key,"same-worktree",10,1)).get("id");
    }
    private AgentApi.Completion completion(UUID session,int attempt) {
        return new AgentApi.Completion(session,attempt,AgentApi.Outcome.SUCCEEDED,new AgentApi.Result(0,"a".repeat(64),33L,"b".repeat(40),null,null,null));
    }
    @AfterEach void cleanup() {
        for(UUID id:created) {
            db.update("delete from agent_task_events where task_id in (select id from agent_tasks where agent_id=?)",id);
            db.update("delete from agent_tasks where agent_id=?",id);db.update("delete from agent_credentials where agent_id=?",id);db.update("delete from local_agents where id=?",id);
        }
    }
    @Test void credentialsAreScopedHashedRevocableAndAbsentFromDashboard() {
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/register",Map.of("name","Browser"),browser()).getStatusCode());
        var identity=register();UUID session=session(identity);
        assertEquals(AgentIdentity.hash(identity.credential()),db.queryForObject("select token_hash from agent_credentials where agent_id=?",String.class,identity.id()));
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/claim",Map.of("sessionId",session),browser()).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/settings",HttpMethod.GET,new HttpEntity<>(agent(identity)),String.class).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/v2/agents",HttpMethod.GET,new HttpEntity<>(agent(identity)),String.class).getStatusCode());
        var publicData=http.exchange("/api/v2/agents",HttpMethod.GET,new HttpEntity<>(browser()),String.class);
        assertFalse(publicData.getBody().contains(identity.credential()));assertFalse(publicData.getBody().contains("token_hash"));
        var second=register();var wrong=agent(identity);wrong.set("X-Agent-Id",second.id().toString());
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/heartbeat",Map.of("sessionId",session),wrong).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,post("/api/v2/agent-tasks",Map.of("agentId",identity.id(),"kind","SHELL","command","whoami"),browser()).getStatusCode());
        db.update("update agent_credentials set revoked_at=now() where agent_id=?",identity.id());
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/heartbeat",Map.of("sessionId",session),agent(identity)).getStatusCode());
    }
    @Test void idempotencyAndConcurrentClaimsAllowOnlyOneWriter() throws Exception {
        var identity=register();UUID session=session(identity);String key=UUID.randomUUID().toString();
        UUID first=create(identity,key);assertEquals(first,create(identity,key));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->queue.enqueue(new AgentApi.CreateTask(identity.id(),AgentApi.Kind.FFMPEG_FIXTURE,key,"same-worktree",10,1)));
        create(identity,UUID.randomUUID().toString());
        var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);
        try {
            var futures=new ArrayList<Future<Map<String,Object>>>();
            for(int i=0;i<8;i++) futures.add(pool.submit(()->{start.await();return queue.claim(identity.id(),session);}));
            start.countDown();int claimed=0;for(var future:futures) if(future.get(10,TimeUnit.SECONDS)!=null) claimed++;
            assertEquals(1,claimed);
            assertEquals(1,db.queryForObject("select count(*) from agent_tasks where agent_id=? and state='RUNNING'",Integer.class,identity.id()));
            assertEquals(1,db.queryForObject("select count(*) from agent_task_events where task_id=? and type='CLAIMED'",Integer.class,first));
            queue.finish(identity.id(),session,first,completion(session,1));
            assertEquals("SUCCEEDED",queue.finish(identity.id(),session,first,completion(session,1)).get("state"));
            assertNotNull(queue.claim(identity.id(),session));
        } finally {pool.shutdownNow();}
    }
    @Test void expiredAttemptsAndOldSessionsAreFencedAfterRecovery() {
        var identity=register();UUID firstSession=session(identity);UUID id=create(identity,UUID.randomUUID().toString());
        assertEquals(1,queue.claim(identity.id(),firstSession).get("attempt"));
        db.update("update agent_tasks set lease_expires_at=now()-interval '1 second' where id=?",id);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->queue.renew(identity.id(),firstSession,id,1));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->queue.finish(identity.id(),firstSession,id,completion(firstSession,1)));
        queue.recoverExpired();UUID secondSession=session(identity);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->queue.claim(identity.id(),firstSession));
        var second=queue.claim(identity.id(),secondSession);assertEquals(2,second.get("attempt"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->queue.finish(identity.id(),secondSession,id,completion(secondSession,1)));
        assertEquals("SUCCEEDED",queue.finish(identity.id(),secondSession,id,completion(secondSession,2)).get("state"));
        assertTrue(db.queryForObject("select count(*) from agent_task_events where task_id=? and type like 'LEASE_EXPIRED%'",Integer.class,id)>=1);
    }
    @Test void cancellationAttemptLimitOfflineDetectionAndCapabilitiesAreRealState() {
        var identity=register();UUID session=session(identity);
        UUID queued=create(identity,UUID.randomUUID().toString());assertEquals("CANCELLED",queue.cancel(queued).get("state"));
        UUID running=create(identity,UUID.randomUUID().toString());queue.claim(identity.id(),session);
        assertEquals("CANCEL_REQUESTED",queue.cancel(running).get("state"));
        assertEquals(true,queue.renew(identity.id(),session,running,1).get("cancelRequested"));
        queue.finish(identity.id(),session,running,new AgentApi.Completion(session,1,AgentApi.Outcome.CANCELLED,new AgentApi.Result(-1,null,null,null,null,null,"CANCELLED")));
        assertEquals("CANCELLED",queue.task(running).get("state"));
        UUID exhausted=create(identity,UUID.randomUUID().toString());queue.claim(identity.id(),session);
        db.update("update agent_tasks set attempt=3,lease_expires_at=now()-interval '1 second' where id=?",exhausted);
        queue.recoverExpired();assertEquals("FAILED",queue.task(exhausted).get("state"));
        db.update("update local_agents set last_heartbeat_at=now()-interval '20 seconds' where id=?",identity.id());
        assertEquals("OFFLINE",queue.agents().stream().filter(a->identity.id().equals(a.get("id"))).findFirst().orElseThrow().get("status"));
        queue.heartbeat(identity.id(),session);
        UUID probeSession=(UUID)queue.session(identity.id(),List.of("CAPABILITY_PROBE")).get("sessionId");
        create(identity,UUID.randomUUID().toString());assertNull(queue.claim(identity.id(),probeSession));
    }
}

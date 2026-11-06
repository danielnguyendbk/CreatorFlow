package com.creatorflow;

import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(properties="creatorflow.api-token=fixture-test-token")
class TaskEngineIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));
        p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));
        p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired TaskCycles cycles;
    @Autowired AgentQueue queue;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired TaskCheckpoints checkpoints;
    UUID agent,session;
    @BeforeEach void register() {
        agent=(UUID)queue.register("Engine fixture").get("id");session=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");
    }
    @AfterEach void cleanup() {
        db.update("delete from agent_task_dependencies where task_id in (select id from agent_tasks where agent_id=?)",agent);
        db.update("delete from agent_task_events where task_id in (select id from agent_tasks where agent_id=?)",agent);
        var ids=db.queryForList("select distinct cycle_id from agent_tasks where agent_id=? and cycle_id is not null",agent);
        db.update("delete from agent_tasks where agent_id=?",agent);
        for(var row:ids) db.update("delete from agent_cycles where id=?",row.get("cycle_id"));
        db.update("delete from agent_credentials where agent_id=?",agent);db.update("delete from local_agents where id=?",agent);
    }
    TaskCycles.Create graph() {return new TaskCycles.Create(agent,UUID.randomUUID().toString(),List.of(
        new TaskCycles.Node("build",AgentApi.Kind.GIT_FIXTURE,List.of()),new TaskCycles.Node("verify",AgentApi.Kind.FFMPEG_FIXTURE,List.of("build"))));}
    AgentApi.Completion done(int attempt) {return new AgentApi.Completion(session,attempt,AgentApi.Outcome.SUCCEEDED,new AgentApi.Result(0,null,null,null,null,null,null));}
    @Test void graphIsAtomicIdempotentAndDependenciesGateConcurrentClaims() throws Exception {
        var request=graph();var cycle=cycles.create(request);assertEquals(cycle.get("id"),cycles.create(request).get("id"));
        var pool=Executors.newFixedThreadPool(6);var start=new CountDownLatch(1);
        try {
            var futures=new ArrayList<Future<Map<String,Object>>>();
            for(int i=0;i<6;i++) futures.add(pool.submit(()->{start.await();return queue.claim(agent,session);}));
            start.countDown();var claimed=new ArrayList<Map<String,Object>>();
            for(var f:futures) {var task=f.get(10,TimeUnit.SECONDS);if(task!=null) claimed.add(task);}
            assertEquals(1,claimed.size());assertEquals("GIT_FIXTURE",claimed.getFirst().get("kind"));assertNull(queue.claim(agent,session));
            queue.finish(agent,session,(UUID)claimed.getFirst().get("id"),done(1));
            var verify=queue.claim(agent,session);assertEquals("FFMPEG_FIXTURE",verify.get("kind"));
            queue.finish(agent,session,(UUID)verify.get("id"),done(1));
            assertEquals("SUCCEEDED",new TaskCycles(db,queue,json).read((UUID)cycle.get("id")).get("state"));
        } finally {pool.shutdownNow();}
    }
    @Test void invalidGraphRollsBackAndChangedIdempotencyInputIsRejected() {
        var request=graph();cycles.create(request);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->cycles.create(new TaskCycles.Create(agent,request.idempotencyKey(),List.of(new TaskCycles.Node("other",AgentApi.Kind.GIT_FIXTURE,List.of())))));
        for(var nodes:List.of(List.of(new TaskCycles.Node("a",AgentApi.Kind.GIT_FIXTURE,List.of("missing"))),
            List.of(new TaskCycles.Node("a",AgentApi.Kind.GIT_FIXTURE,List.of("b")),new TaskCycles.Node("b",AgentApi.Kind.GIT_FIXTURE,List.of("a")))))
            assertThrows(org.springframework.web.server.ResponseStatusException.class,()->cycles.create(new TaskCycles.Create(agent,UUID.randomUUID().toString(),nodes)));
        assertEquals(2,db.queryForObject("select count(*) from agent_tasks where agent_id=?",Integer.class,agent));
    }
    @Test void backoffIsBoundedAndCancelledParentFailsDescendants() {
        cycles.create(graph());var task=queue.claim(agent,session);UUID id=(UUID)task.get("id");
        queue.finish(agent,session,id,new AgentApi.Completion(session,1,AgentApi.Outcome.FAILED,new AgentApi.Result(-1,null,null,null,null,null,"PROCESS_FAILED")));
        assertNull(queue.claim(agent,session));
        db.update("update agent_tasks set not_before=now()-interval '1 second' where id=?",id);
        assertEquals(2,queue.claim(agent,session).get("attempt"));queue.cancel(id);
        queue.finish(agent,session,id,new AgentApi.Completion(session,2,AgentApi.Outcome.CANCELLED,new AgentApi.Result(-1,null,null,null,null,null,"CANCELLED")));
        queue.recoverExpired();assertEquals(1,db.queryForObject("select count(*) from agent_tasks where agent_id=? and error_code='DEPENDENCY_FAILED'",Integer.class,agent));
        assertNull(queue.claim(agent,session));
    }
    @Test void checkpointsAreFencedImmutableAndHandoffsRebuildFromCommittedState() throws Exception {
        var cycle=cycles.create(graph());var first=queue.claim(agent,session);UUID id=(UUID)first.get("id");
        checkpoints.save(agent,id,new TaskCheckpoints.Save(session,1,done(1).result()));
        checkpoints.save(agent,id,new TaskCheckpoints.Save(session,1,done(1).result()));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->checkpoints.save(agent,id,new TaskCheckpoints.Save(session,2,done(1).result())));
        db.update("update agent_tasks set lease_expires_at=now()-interval '1 second' where id=?",id);queue.recoverExpired();
        session=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");
        var resumed=queue.claim(agent,session);assertTrue(resumed.containsKey("checkpoint"));
        queue.finish(agent,session,id,done(2));var last=queue.claim(agent,session);queue.finish(agent,session,(UUID)last.get("id"),done(1));
        checkpoints.generate();checkpoints.generate();
        UUID cycleId=(UUID)cycle.get("id");assertEquals(1,db.queryForObject("select count(*) from cycle_handoffs where cycle_id=?",Integer.class,cycleId));
        var temp=java.nio.file.Files.createTempDirectory("cf-handoff-");
        var restarted=new TaskCheckpoints(db,queue,json,temp.toString());restarted.exportCommitted();
        var persisted=json.readTree(java.nio.file.Files.readString(temp.resolve(cycleId+".json")));
        assertEquals("COMMITTED_POSTGRESQL_STATE",persisted.get("source").asText());assertEquals(2,persisted.get("tasks").size());
        assertEquals(cycleId.toString(),restarted.handoff(cycleId).get("cycleId"));
        java.nio.file.Files.deleteIfExists(temp.resolve(cycleId+".json"));java.nio.file.Files.delete(temp);
    }
}

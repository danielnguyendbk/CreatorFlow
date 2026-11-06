package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"creatorflow.api-token=telegram-fixture-browser","TELEGRAM_ENABLED=false"})
class TelegramIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));
        p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));
        p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
    }
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired TelegramStore store;
    @Autowired TaskCycles cycles;
    @Autowired AgentQueue queue;
    @Autowired ControlApprovals approvals;
    @Autowired TelegramApi api;
    @Autowired PlatformTransactionManager manager;
    @Autowired TestRestTemplate http;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    UUID agent,session,cycle;
    String credential;
    String bot;
    HttpServer server;
    TelegramRuntime runtime;
    AtomicReference<String> updates=new AtomicReference<>("[]"),webhook=new AtomicReference<>("");
    AtomicInteger sends=new AtomicInteger(),status=new AtomicInteger(200),polls=new AtomicInteger();
    AtomicLong delay=new AtomicLong(),offset=new AtomicLong();
    final String fixtureToken="999:abcdefghijklmnopqrstuvwxyz012345";
    @BeforeEach void setup() throws Exception {
        bot="fixture-"+UUID.randomUUID().toString().substring(0,8);
        var registered=queue.register("Telegram fixture");agent=(UUID)registered.get("id");credential=(String)registered.get("credential");session=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");
        db.update("insert into telegram_bots(identity,bot_id,token_env) values (?,?, 'TELEGRAM_FIXTURE_TOKEN')",bot,Math.abs(UUID.randomUUID().getLeastSignificantBits()));
        for(var route:List.of(new Object[]{-100L,"CODE"},new Object[]{-200L,"CONTENT"},new Object[]{-300L,"VIDEO"})) {
            db.update("insert into telegram_routes(bot_identity,chat_id,kind,can_control,can_approve) values (?,?,?,?,?)",bot,route[0],route[1],route[1].equals("CODE"),true);
            db.update("insert into telegram_operators(bot_identity,chat_id,user_id,role) values (?,?,42,'OPERATOR')",bot,route[0]);
        }
        cycle=(UUID)cycles.create(new TaskCycles.Create(agent,UUID.randomUUID().toString(),List.of(new TaskCycles.Node("git",AgentApi.Kind.GIT_FIXTURE,List.of()),new TaskCycles.Node("ffmpeg",AgentApi.Kind.FFMPEG_FIXTURE,List.of("git"))))).get("id");
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            try {
                var payload=json.readTree(exchange.getRequestBody());String path=exchange.getRequestURI().getPath(),body;
                int code=200;
                if(path.endsWith("getMe")) body="{\"id\":"+db.queryForObject("select bot_id from telegram_bots where identity=?",Long.class,bot)+"}";
                else if(path.endsWith("getWebhookInfo")) body=json.writeValueAsString(Map.of("url",webhook.get()));
                else if(path.endsWith("getUpdates")) {polls.incrementAndGet();offset.set(payload.path("offset").asLong());if(delay.get()>0) Thread.sleep(delay.get());body=updates.get();}
                else {sends.incrementAndGet();code=status.get();body="{\"message_id\":123}";}
                byte[] bytes=(code==200?"{\"ok\":true,\"result\":"+body+"}":"{\"ok\":false,\"parameters\":{\"retry_after\":1}}").getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(code,bytes.length);exchange.getResponseBody().write(bytes);
            } catch(Exception ignored) {} finally {exchange.close();}
        });server.start();
        var client=new TelegramClient(new MockEnvironment().withProperty("TELEGRAM_FIXTURE_TOKEN",fixtureToken),json,"http://127.0.0.1:"+server.getAddress().getPort(),Duration.ofMillis(350));
        runtime=new TelegramRuntime(db,store,client,manager,false);
    }
    @AfterEach void cleanup() {
        runtime.close();server.stop(0);
        db.update("delete from telegram_outbox where bot_identity=?",bot);
        db.update("delete from control_approvals where bot_identity=?",bot);
        db.update("delete from telegram_updates where bot_identity=?",bot);
        db.update("delete from telegram_operators where bot_identity=?",bot);
        db.update("delete from telegram_routes where bot_identity=?",bot);
        db.update("delete from telegram_bots where identity=?",bot);
        db.update("delete from agent_task_dependencies where task_id in (select id from agent_tasks where agent_id=?)",agent);
        db.update("delete from agent_task_events where task_id in (select id from agent_tasks where agent_id=?)",agent);
        var cycleIds=db.queryForList("select distinct cycle_id from agent_tasks where agent_id=? and cycle_id is not null",agent);
        db.update("delete from agent_tasks where agent_id=?",agent);
        for(var row:cycleIds) db.update("delete from agent_cycles where id=?",row.get("cycle_id"));
        db.update("delete from agent_credentials where agent_id=?",agent);db.update("delete from local_agents where id=?",agent);
    }
    JsonNode message(long id,long chat,long user,String text,boolean isBot) {
        return json.valueToTree(Map.of("update_id",id,"message",Map.of("chat",Map.of("id",chat),"from",Map.of("id",user,"is_bot",isBot),"text",text)));
    }
    void accept(JsonNode... input) {
        db.update("update telegram_operators set last_command_at=null where bot_identity=?",bot);
        UUID lease=UUID.randomUUID();db.update("update telegram_bots set poll_lease=?,poll_until=now()+interval '90 seconds' where identity=?",lease,bot);
        store.accept(bot,lease,json.valueToTree(input));
    }
    void ready() {db.update("update telegram_bots set availability='AVAILABLE',last_send_at=null,next_poll_at=now() where identity=?",bot);db.update("update telegram_routes set next_send_at=now() where bot_identity=?",bot);db.update("update telegram_outbox set next_at=now() where bot_identity=?",bot);}
    String outcome(long id) {return db.queryForObject("select outcome from telegram_updates where bot_identity=? and update_id=?",String.class,bot,id);}
    @Test void duplicateAndOutOfOrderUpdatesCommitOffsetAndRestartAtPersistedPosition() throws Exception {
        accept(message(11,-100,42,"/pause "+cycle,false),message(10,-200,42,"/status",false));
        assertEquals("PAUSED",cycles.read(cycle).get("state"));
        accept(message(11,-100,42,"/resume "+cycle,false));assertEquals("PAUSED",cycles.read(cycle).get("state"));
        assertEquals(12L,db.queryForObject("select next_offset from telegram_bots where identity=?",Long.class,bot));
        accept(message(9,-100,42,"/cancel "+cycle,false));assertEquals("OLD_UPDATE",outcome(9));
        ready();runtime.pollOnce();assertEquals(12L,offset.get());
        assertEquals(3,db.queryForObject("select count(*) from telegram_updates where bot_identity=?",Integer.class,bot));
        var restarted=new TelegramRuntime(db,store,runtime.client,manager,false);try {ready();restarted.pollOnce();assertEquals(12L,offset.get());} finally {restarted.close();}
    }
    @Test void wrongIdentityUnauthorizedMutationsAndBotsCannotControlOrCreateReplyLoops() {
        accept(message(1,-999,42,"/cancel "+cycle,false));assertEquals("UNAUTHORIZED",outcome(1));
        accept(message(2,-100,99,"/cancel "+cycle,false));assertEquals("UNAUTHORIZED",outcome(2));
        db.update("update telegram_operators set role='READER' where bot_identity=?",bot);
        accept(message(3,-100,42,"/cancel "+cycle,false));assertEquals("UNAUTHORIZED_MUTATION",outcome(3));
        accept(message(4,-100,42,"/cancel "+cycle,true));assertEquals("IGNORED_BOT",outcome(4));
        assertEquals("QUEUED",cycles.read(cycle).get("state"));
        assertEquals(0,db.queryForObject("select count(*) from telegram_outbox where bot_identity=? and ref_type='UPDATE'",Integer.class,bot));
    }
    @Test void cyclePausePreservesRunningTaskResumeGatesDependenciesCancelCannotResurrect() {
        var task=queue.claim(agent,session);assertNotNull(task);
        accept(message(1,-100,42,"/pause "+cycle,false));assertEquals("RUNNING",queue.task((UUID)task.get("id")).get("state"));
        queue.finish(agent,session,(UUID)task.get("id"),new AgentApi.Completion(session,1,AgentApi.Outcome.SUCCEEDED,new AgentApi.Result(0,null,null,null,null,null,null)));
        assertNull(queue.claim(agent,session));
        accept(message(2,-100,42,"/resume "+cycle,false));assertNotNull(queue.claim(agent,session));
        accept(message(3,-100,42,"/cancel "+cycle,false));assertEquals("CANCEL_REQUESTED",cycles.read(cycle).get("state"));
        db.update("update agent_tasks set lease_expires_at=now()-interval '1 second' where cycle_id=? and state='CANCEL_REQUESTED'",cycle);
        queue.recoverExpired();assertEquals("CANCELLED",cycles.read(cycle).get("state"));
        session=(UUID)queue.session(agent,AgentQueue.KINDS).get("sessionId");assertNull(queue.claim(agent,session));
        accept(message(4,-100,42,"/resume "+cycle,false));assertEquals("CANCELLED",cycles.read(cycle).get("state"));assertEquals("PROCESSED",outcome(4));
    }
    @Test void approvalBindingReplayExpiryAndRevocationAreDurable() {
        UUID id=(UUID)approvals.create(new ControlApprovals.Create(cycle,bot,-100,42,10)).get("id");
        accept(message(1,-200,42,"/approve "+id,false));assertEquals("PENDING",approvals.read(id).get("state"));
        var callback=json.valueToTree(Map.of("update_id",2,"callback_query",Map.of("id","fixture","from",Map.of("id",42,"is_bot",false),"message",Map.of("chat",Map.of("id",-100)),"data","approve:"+id)));
        accept(callback);assertEquals("APPROVED",approvals.read(id).get("state"));
        accept(message(3,-100,42,"/reject "+id,false));assertEquals("APPROVED",approvals.read(id).get("state"));
        UUID expired=(UUID)approvals.create(new ControlApprovals.Create(cycle,bot,-100,42,1)).get("id");
        db.update("update control_approvals set expires_at=now()-interval '1 second' where id=?",expired);
        accept(message(4,-100,42,"/approve "+expired,false));assertEquals("EXPIRED",approvals.read(expired).get("state"));
        assertEquals(42L,((Number)approvals.read(id).get("decision_actor")).longValue());
    }
    @Test void mockPollingDetectsWebhookAndTimeoutWithoutAdvancingOffset() {
        webhook.set("https://example.invalid/hook");runtime.pollOnce();assertEquals(0,polls.get());assertEquals("WEBHOOK_ACTIVE_OR_UNKNOWN",db.queryForObject("select error_code from telegram_bots where identity=?",String.class,bot));
        webhook.set("");delay.set(700);ready();runtime.pollOnce();
        assertEquals(0L,db.queryForObject("select next_offset from telegram_bots where identity=?",Long.class,bot));
        assertEquals("TRANSPORT_TIMEOUT_OR_ERROR",db.queryForObject("select error_code from telegram_bots where identity=?",String.class,bot));
    }
    @Test void outboxRetryDeadLetterAndCrashAfterSendAreNotExactlyOnce() {
        db.update("delete from telegram_outbox where bot_identity=?",bot);
        TelegramStore.enqueue(db,bot,-100,"test:"+bot,"CYCLE",cycle.toString(),"Cycle "+cycle);
        status.set(429);ready();runtime.deliverOnce(false);assertEquals("RETRY",db.queryForObject("select state from telegram_outbox where bot_identity=?",String.class,bot));
        status.set(400);ready();runtime.deliverOnce(false);assertEquals("DEAD_LETTER",db.queryForObject("select state from telegram_outbox where bot_identity=?",String.class,bot));
        db.update("delete from telegram_outbox where bot_identity=?",bot);
        TelegramStore.enqueue(db,bot,-100,"crash:"+bot,"CYCLE",cycle.toString(),"Cycle "+cycle);
        status.set(200);ready();runtime.deliverOnce(true);assertEquals("SENDING",db.queryForObject("select state from telegram_outbox where bot_identity=?",String.class,bot));
        db.update("update telegram_outbox set lease_until=now()-interval '1 second' where bot_identity=?",bot);runtime.recoverSends();
        ready();runtime.deliverOnce(false);assertEquals("UNKNOWN",db.queryForObject("select state from telegram_outbox where bot_identity=?",String.class,bot));assertEquals(3,sends.get());
    }
    @Test void routingAllThreeGroupsIsTransactionalAndNeverCopiesSensitiveEventText() {
        for(String type:List.of("SCRIPT_GENERATED","RENDER_COMPLETED")) db.update("insert into activity_events(id,type,entity_id,entity_type,message,severity) values (?,?,?,'FIXTURE','sensitive prompt fixture','INFO')",UUID.randomUUID(),type,cycle);
        var groups=db.queryForList("select distinct r.kind from telegram_outbox o join telegram_routes r using(bot_identity,chat_id) where o.bot_identity=?",String.class,bot);
        assertTrue(groups.containsAll(List.of("CODE","CONTENT","VIDEO")));
        assertEquals(0,db.queryForObject("select count(*) from telegram_outbox where bot_identity=? and body like '%sensitive%'",Integer.class,bot));
        var tx=new org.springframework.transaction.support.TransactionTemplate(manager);
        long before=db.queryForObject("select count(*) from telegram_outbox where bot_identity=?",Long.class,bot);
        tx.executeWithoutResult(s->{db.update("insert into cycle_control_events(cycle_id,state) values (?,'PAUSED')",cycle);s.setRollbackOnly();});
        assertEquals(before,db.queryForObject("select count(*) from telegram_outbox where bot_identity=?",Long.class,bot));
    }
    @Test void databaseQuotaReadAndOperatorApiDoNotExposeSecretsOrAcceptAgentCredentials() throws Exception {
        var snapshot=new UsageApi.Snapshot(UUID.randomUUID(),1,java.time.Instant.now(),"0.162.1",UsageApi.Status.OK,List.of(new UsageApi.Window(10080,60,java.time.Instant.now().plusSeconds(600).getEpochSecond()),new UsageApi.Window(300,80,java.time.Instant.now().plusSeconds(300).getEpochSecond())),false,null,null,null);
        db.update("insert into ai_usage_snapshots values (?,?,?,?,now(),'OK',?::jsonb)",snapshot.id(),agent,1,java.sql.Timestamp.from(snapshot.observedAt()),json.writeValueAsString(snapshot));
        try {
            accept(message(1,-100,42,"/usage",false));
            String body=db.queryForObject("select body from telegram_outbox where bot_identity=? and ref_type='UPDATE'",String.class,bot);
            assertTrue(body.contains("5h: used=80.0%"));assertTrue(body.contains("Weekly: used=60.0%"));assertTrue(body.contains("freshness=LIVE"));
            var headers=new HttpHeaders();headers.setBearerAuth("telegram-fixture-browser");
            var response=http.exchange("/api/v2/telegram",HttpMethod.GET,new HttpEntity<>(headers),String.class);
            assertEquals(HttpStatus.OK,response.getStatusCode());assertFalse(response.getBody().contains(fixtureToken));assertFalse(response.getBody().contains("token_env"));
            headers.set("Authorization","Agent "+credential);headers.set("X-Agent-Id",agent.toString());
            assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/v2/telegram",HttpMethod.GET,new HttpEntity<>(headers),String.class).getStatusCode());
            assertEquals(HttpStatus.UNAUTHORIZED,http.exchange("/api/v2/telegram/approvals",HttpMethod.GET,new HttpEntity<>(headers),String.class).getStatusCode());
        } finally {db.update("delete from ai_usage_snapshots where agent_id=?",agent);}
    }
    @Test void concurrentClaimsCannotCrossCommittedPauseAndOutboxHasSingleSender() throws Exception {
        cycles.control(cycle,"pause");var pool=Executors.newFixedThreadPool(6);
        try {
            var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<6;i++) jobs.add(pool.submit(()->queue.claim(agent,session)));
            for(var job:jobs) assertNull(job.get(5,TimeUnit.SECONDS));
            db.update("delete from telegram_outbox where bot_identity=?",bot);
            TelegramStore.enqueue(db,bot,-100,"sender:"+bot,"CYCLE",cycle.toString(),"Cycle "+cycle);ready();
            var claims=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<6;i++) claims.add(pool.submit(()->runtime.sendClaim()));
            int winners=0;for(var job:claims) if(job.get(5,TimeUnit.SECONDS)!=null) winners++;
            assertEquals(1,winners);
        } finally {pool.shutdownNow();}
    }
    @Test void malformedBatchRollsBackOffsetAndMutationAndRevokedUsersLoseReadAccess() {
        UUID lease=UUID.randomUUID();db.update("update telegram_bots set poll_lease=?,poll_until=now()+interval '90 seconds' where identity=?",lease,bot);
        assertThrows(IllegalArgumentException.class,()->store.accept(bot,lease,json.valueToTree(List.of(message(1,-100,42,"/pause "+cycle,false),Map.of("update_id","invalid")))));
        assertEquals(0L,db.queryForObject("select next_offset from telegram_bots where identity=?",Long.class,bot));assertEquals("QUEUED",cycles.read(cycle).get("state"));
        db.update("update telegram_operators set role='REVOKED' where bot_identity=?",bot);
        accept(message(2,-100,42,"/status",false));assertEquals("UNAUTHORIZED",outcome(2));
    }
    static void await(java.util.function.BooleanSupplier condition,int seconds) throws Exception {
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
        while(System.nanoTime()<until) {if(condition.getAsBoolean()) return;Thread.sleep(100);}
        fail("Timed out awaiting actual Windows fixture transition");
    }
    @Test @EnabledIfEnvironmentVariable(named="FFMPEG_PATH",matches=".+")
    void mockTelegramControlsActualIndependentWindowsGitFfmpegAgent() throws Exception {
        var root=java.nio.file.Files.createTempDirectory(java.nio.file.Path.of("../storage"),"telegram-worker-").toAbsolutePath();
        String backend="http://127.0.0.1:"+port;
        var provision=new ProcessBuilder("C:/Python313/python.exe","-c","import sys,json;from pathlib import Path;from agent import protect;d=json.load(sys.stdin);Path(sys.argv[1]).write_bytes(protect(json.dumps(d).encode()))",root.resolve("identity.dpapi").toString()).directory(new java.io.File("../CreatorFlow-Agent")).start();
        try(var stdin=provision.getOutputStream()) {stdin.write(json.writeValueAsBytes(Map.of("id",agent,"credential",credential,"backend",backend)));}
        assertTrue(provision.waitFor(10,TimeUnit.SECONDS));assertEquals(0,provision.exitValue());
        cycles.control(cycle,"pause");
        var builder=new ProcessBuilder("C:/Python313/python.exe","agent.py","--backend",backend,"--root",root.toString()).directory(new java.io.File("../CreatorFlow-Agent"));
        builder.environment().put("CREATORFLOW_USAGE_ENABLED","false");builder.redirectErrorStream(true).redirectOutput(root.resolve("worker.log").toFile());
        var worker=builder.start();
        try {
            await(()->!session.equals(db.queryForObject("select session_id from local_agents where id=?",UUID.class,agent)),10);
            assertTrue(worker.isAlive());assertNull(db.queryForList("select id from agent_tasks where cycle_id=? and state='RUNNING'",cycle).stream().findFirst().orElse(null));
            updates.set(json.writeValueAsString(List.of(message(1,-100,42,"/resume "+cycle,false))));ready();runtime.pollOnce();
            await(()->"SUCCEEDED".equals(cycles.read(cycle).get("state")),25);
            assertEquals(2,db.queryForObject("select count(*) from agent_tasks where cycle_id=? and state='SUCCEEDED' and result_json->>'artifactSha256' is not null",Integer.class,cycle));
            ready();runtime.deliverOnce(false);assertEquals(1,sends.get());
            // A second real cycle pauses while FFmpeg runs, then cancels through fenced agent renewal.
            UUID cancelling=(UUID)cycles.create(new TaskCycles.Create(agent,UUID.randomUUID().toString(),List.of(new TaskCycles.Node("video",AgentApi.Kind.FFMPEG_FIXTURE,List.of())))).get("id");
            db.update("update agent_tasks set duration_sec=20 where cycle_id=? and state='QUEUED'",cancelling);
            await(()->db.queryForObject("select count(*) from agent_tasks where cycle_id=? and state='RUNNING'",Integer.class,cancelling)==1,10);
            accept(message(2,-100,42,"/pause "+cancelling,false));
            assertEquals(1,db.queryForObject("select count(*) from agent_tasks where cycle_id=? and state='RUNNING'",Integer.class,cancelling));
            accept(message(3,-100,42,"/cancel "+cancelling,false));
            await(()->"CANCELLED".equals(cycles.read(cancelling).get("state")),12);
            var data=api.status();assertFalse(json.writeValueAsString(data).contains(credential));
        } finally {worker.destroy();assertTrue(worker.waitFor(8,TimeUnit.SECONDS));}
    }
}

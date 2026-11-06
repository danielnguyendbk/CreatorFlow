package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
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
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"creatorflow.api-token=p5-browser-fixture","creatorflow.codex-execution-enabled=true","CREATORFLOW_AGENT_ENROLLMENT_TOKEN=p5-enrollment-fixture-at-least-32-characters","CREATORFLOW_ENABLE_REAL_PUBLISH=false","TELEGRAM_ENABLED=false"})
class CodingFoundationIntegrationTest {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->System.getenv("CREATORFLOW_TEST_DB_URL"));p.add("spring.datasource.username",()->System.getenv("CREATORFLOW_TEST_DB_USER"));p.add("spring.datasource.password",()->System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));}
    @Autowired JdbcTemplate db;@Autowired ObjectMapper json;@Autowired AgentQueue queue;@Autowired AgentCredentials credentials;
    @Autowired CodingRegistry registry;@Autowired CodingWorkspaces workspaces;@Autowired CodingAdmission admission;@Autowired UsageApi usage;@Autowired TestRestTemplate http;
    @Autowired CodingExecutions executions;
    UUID agent,session;String secret;Path repository;UUID repo;String base="a".repeat(40);
    @BeforeEach void setup() throws Exception {
        var identity=queue.register("P5 database fixture");agent=(UUID)identity.get("id");secret=(String)identity.get("credential");
        session=(UUID)queue.session(agent,java.util.stream.Stream.concat(AgentQueue.KINDS.stream(),CodingWorkspaces.KINDS.stream()).toList()).get("sessionId");
        repository=Files.createTempDirectory(Path.of("../storage"),"p5-registered-").toAbsolutePath();Files.createDirectory(repository.resolve(".git"));
        repo=(UUID)registry.register(new CodingRegistry.Register(agent,repository.toString(),"https://example.invalid/fixture.git",List.of("main"),List.of("main","develop")),"local-user").get("id");
        registry.verify(agent,session,repo,(String)registry.repository(repo).get("configHash"),Map.of("main",base),null,queue);
    }
    HttpHeaders operator() {var h=new HttpHeaders();h.setBearerAuth("p5-browser-fixture");h.setContentType(MediaType.APPLICATION_JSON);return h;}
    HttpHeaders runtime(String token) {var h=new HttpHeaders();h.set("Authorization","Agent "+token);h.set("X-Agent-Id",agent.toString());h.setContentType(MediaType.APPLICATION_JSON);return h;}
    ResponseEntity<Map> post(String path,Object body,HttpHeaders h) {return http.exchange(path,HttpMethod.POST,new HttpEntity<>(body,h),Map.class);}
    CodingWorkspaces.Create createInput(String key) {return new CodingWorkspaces.Create(repo,"main",base,CodingWorkspaces.Role.CODEX_EXECUTOR,CodingWorkspaces.Scope.WORKSPACE_ONLY,"Foundation fixture only",List.of("src/**"),List.of("private/**"),30,1,null,CodingAdmission.Provider.NONE,key,List.of(),"WORKTREE_PREPARE");}
    @Test void runtimeConfigurationWritesReturnJsonAcknowledgements() {
        var created=post("/api/v2/coding/workspaces",createInput(UUID.randomUUID().toString()),operator());
        assertEquals(HttpStatus.OK,created.getStatusCode());assertEquals("REQUESTED",created.getBody().get("state"));
        var verified=post("/api/v2/agent-runtime/coding/repositories/verify",Map.of("sessionId",session,"repositoryId",repo,"configHash",registry.repository(repo).get("configHash"),"commits",Map.of("main",base)),runtime(secret));
        assertEquals(HttpStatus.OK,verified.getStatusCode());assertEquals("VERIFIED",verified.getBody().get("verification"));
        var capabilities=post("/api/v2/agent-runtime/coding/capabilities",Map.of("sessionId",session,"providers",List.of(Map.of("provider","CODEX_CLI","installed",true,"version","0.162.1"))),runtime(secret));
        assertEquals(HttpStatus.OK,capabilities.getStatusCode());assertEquals(true,capabilities.getBody().get("accepted"));
    }
    @Test void enrollmentRequiresExplicitOperatorWindowAndNeverAgentAuthority() {
        db.update("update agent_enrollment_policy set enabled_until=null where id=1");var enroll=new HttpHeaders();enroll.set("X-Agent-Enrollment","p5-enrollment-fixture-at-least-32-characters");
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/register",Map.of("name","Closed"),enroll).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-credentials/enrollment",Map.of("minutes",1,"confirmation","ENROLL"),runtime(secret)).getStatusCode());
        assertEquals(HttpStatus.OK,post("/api/v2/agent-credentials/enrollment",Map.of("minutes",1,"confirmation","ENROLL"),operator()).getStatusCode());
        var registered=post("/api/v2/agent-runtime/register",Map.of("name","Explicit enrollment","id",UUID.randomUUID(),"credentialHash",AgentIdentity.hash("fixture-enrollment-agent-generated")),enroll);
        assertEquals(HttpStatus.OK,registered.getStatusCode());assertFalse(registered.getBody().containsKey("credential"));
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/coding/workspaces",Map.of(),runtime(secret)).getStatusCode());
    }
    @Test void rotationCommitsOnlyHashFencesOldCredentialAndSessionAndSurvivesAckReplay() {
        var intent=post("/api/v2/agent-credentials/"+agent+"/rotate",Map.of("confirmation","ROTATE"),operator());assertEquals(HttpStatus.OK,intent.getStatusCode());
        String next="p5-next-credential-fixture";UUID id=UUID.fromString(intent.getBody().get("id").toString());
        assertEquals(HttpStatus.OK,post("/api/v2/agent-runtime/credentials/commit",Map.of("rotationId",id,"generation",2,"candidateHash",AgentIdentity.hash(next)),runtime(secret)).getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/heartbeat",Map.of("sessionId",session),runtime(secret)).getStatusCode());
        assertEquals(HttpStatus.CONFLICT,post("/api/v2/agent-runtime/heartbeat",Map.of("sessionId",session),runtime(next)).getStatusCode());
        assertEquals(HttpStatus.OK,post("/api/v2/agent-runtime/credentials/"+id+"/ack",Map.of(),runtime(next)).getStatusCode());
        assertEquals(HttpStatus.OK,post("/api/v2/agent-runtime/credentials/"+id+"/ack",Map.of(),runtime(next)).getStatusCode());
        assertEquals(AgentIdentity.hash(next),db.queryForObject("select token_hash from agent_credentials where agent_id=?",String.class,agent));
        var inventory=http.exchange("/api/v2/agent-credentials",HttpMethod.GET,new HttpEntity<>(operator()),String.class).getBody();assertFalse(inventory.contains(next));assertFalse(inventory.contains(secret));assertFalse(inventory.contains("candidate_hash"));
    }
    @Test void concurrentRotationRequestsHaveOneGenerationAndRevocationIsImmediate() throws Exception {
        var pool=Executors.newFixedThreadPool(5);
        try {var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<5;i++) jobs.add(pool.submit(()->credentials.rotate(agent,"local-user")));UUID winner=null;for(var f:jobs) {var row=f.get(5,TimeUnit.SECONDS);if(winner==null) winner=(UUID)row.get("id");else assertEquals(winner,row.get("id"));}}
        finally {pool.shutdownNow();}
        credentials.revoke(agent,"local-user");assertNull(new AgentIdentity(db).authenticate(agent.toString(),"Agent "+secret));
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/agent-runtime/session",Map.of("capabilities",AgentQueue.KINDS),runtime(secret)).getStatusCode());
        assertThrows(ResponseStatusException.class,()->credentials.rotate(agent,"local-user"));
    }
    @Test void repositoryMustBeAllowlistedAndStrictContractCannotBecomeShellOrExecutor() {
        var input=createInput(UUID.randomUUID().toString());
        var body=json.valueToTree(input);((com.fasterxml.jackson.databind.node.ObjectNode)body).put("command","forbidden");
        assertEquals(HttpStatus.CONFLICT,post("/api/v2/coding/workspaces",body,operator()).getStatusCode());
        assertThrows(ResponseStatusException.class,()->CodingWorkspaces.relative("../outside"));assertThrows(ResponseStatusException.class,()->CodingWorkspaces.relative("C:/outside"));assertThrows(ResponseStatusException.class,()->CodingWorkspaces.relative(".git/config"));
        assertThrows(ResponseStatusException.class,()->workspaces.create(new CodingWorkspaces.Create(repo,"main",base,input.role(),input.allowedScope(),input.objective(),input.allowedFiles(),input.prohibitedPaths(),30,1,null,input.provider(),input.idempotencyKey(),List.of(),"CODEX_EXECUTE"),"local-user"));
        db.update("update coding_repositories set enabled=false where id=?",repo);assertThrows(ResponseStatusException.class,()->workspaces.create(input,"local-user"));
    }
    @Test void duplicateWorkspaceRequestsAndConcurrentOperationsHaveSingleOwner() throws Exception {
        var input=createInput(UUID.randomUUID().toString());var pool=Executors.newFixedThreadPool(4);UUID id=null;
        try {var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<4;i++) jobs.add(pool.submit(()->workspaces.create(input,"local-user")));for(var f:jobs) {var row=f.get(10,TimeUnit.SECONDS);if(id==null) id=(UUID)row.get("id");else assertEquals(id,row.get("id"));}}
        finally {pool.shutdownNow();}
        var task=queue.claim(agent,session);assertNotNull(task.get("workspace"));assertNull(queue.claim(agent,session));
        assertThrows(ResponseStatusException.class,()->workspaces.operation(new CodingWorkspaces.Operation((UUID)taskWorkspace(task).get("id"),"WORKTREE_CLEANUP",UUID.randomUUID().toString()),"local-user"));
    }
    Map<?,?> taskWorkspace(Map<String,Object> task) {return (Map<?,?>)task.get("workspace");}
    @Test void expiredWorkspaceLeaseBecomesReconciliationAndStaleAttemptCannotCheckpoint() {
        var workspace=workspaces.create(createInput(UUID.randomUUID().toString()),"local-user");var task=queue.claim(agent,session);UUID taskId=(UUID)task.get("id");
        db.update("update agent_tasks set lease_expires_at=now()-interval '1 second' where id=?",taskId);queue.recoverExpired();
        assertEquals("NEEDS_RECONCILIATION",workspaces.workspace((UUID)workspace.get("id")).get("state"));assertNull(queue.claim(agent,session));
        assertThrows(ResponseStatusException.class,()->workspaces.report(agent,taskId,new CodingWorkspaces.Report(session,1,UUID.randomUUID(),"READY",base,false)));
        assertThrows(ResponseStatusException.class,()->workspaces.operation(new CodingWorkspaces.Operation((UUID)workspace.get("id"),"WORKTREE_CLEANUP",UUID.randomUUID().toString()),"local-user"));
        workspaces.operation(new CodingWorkspaces.Operation((UUID)workspace.get("id"),"WORKTREE_INSPECT",UUID.randomUUID().toString()),"local-user");assertNotNull(queue.claim(agent,session));
    }
    @Test void workspaceCheckpointIsFencedAndRequiredForSuccess() {
        workspaces.create(createInput(UUID.randomUUID().toString()),"local-user");var task=queue.claim(agent,session);UUID id=(UUID)task.get("id");
        var done=new AgentApi.Completion(session,1,AgentApi.Outcome.SUCCEEDED,new AgentApi.Result(0,null,null,base,null,null,null));
        assertThrows(ResponseStatusException.class,()->queue.finish(agent,session,id,done));
        var report=new CodingWorkspaces.Report(session,1,UUID.randomUUID(),"READY",base,false);workspaces.report(agent,id,report);workspaces.report(agent,id,report);queue.finish(agent,session,id,done);
        assertThrows(ResponseStatusException.class,()->workspaces.report(agent,id,new CodingWorkspaces.Report(session,2,UUID.randomUUID(),"READY",base,false)));
    }
    void capabilityAndQuota(double used,int age,boolean weeklyOnly) throws Exception {
        db.update("insert into agent_provider_capabilities values (?,'CODEX_CLI',true,'0.162.1',now()) on conflict(agent_id,provider) do update set observed_at=now(),installed=true",agent);
        long sequence=db.queryForObject("select coalesce(max(sequence),0)+1 from ai_usage_snapshots where agent_id=?",Long.class,agent);
        var windows=new ArrayList<UsageApi.Window>();if(!weeklyOnly) windows.add(new UsageApi.Window(300,used,Instant.now().plusSeconds(3600).getEpochSecond()));windows.add(new UsageApi.Window(10080,used,Instant.now().plusSeconds(7200).getEpochSecond()));
        var snapshot=new UsageApi.Snapshot(UUID.randomUUID(),sequence,Instant.now().minusSeconds(age),"0.162.1",UsageApi.Status.OK,windows,used>=100,null,null,null);
        db.update("insert into ai_usage_snapshots values (?,?,?,?,now(),'OK',?::jsonb)",snapshot.id(),agent,sequence,java.sql.Timestamp.from(snapshot.observedAt()),json.writeValueAsString(snapshot));
    }
    CodingAdmission.Check check(boolean reserve) {return new CodingAdmission.Check(UUID.randomUUID(),agent,CodingAdmission.Provider.CODEX_CLI,30,1,reserve);}
    UUID executionDraft() throws Exception {
        var w=workspaces.create(createInput(UUID.randomUUID().toString()),"local-user");var task=queue.claim(agent,session);UUID id=(UUID)task.get("id");
        workspaces.report(agent,id,new CodingWorkspaces.Report(session,1,UUID.randomUUID(),"READY",base,false));queue.finish(agent,session,id,new AgentApi.Completion(session,1,AgentApi.Outcome.SUCCEEDED,new AgentApi.Result(0,null,null,base,null,null,null)));
        var policy=admission.policy(new CodingAdmission.Policy(agent,CodingAdmission.Provider.CODEX_CLI,true,true,1,60,1,60),"local-user");capabilityAndQuota(10,0,false);
        // Explicitly mocked sandbox evidence, never a live OS verification claim.
        executions.capability(agent,new CodingExecutions.Capability(session,"0.162.1",true,true,null,"b".repeat(64)));
        return (UUID)executions.create(new CodingExecutions.Create((UUID)w.get("id"),"CODEX_EXECUTE","CODEX_CLI","Update fixture README only",List.of("README.md"),(UUID)policy.get("id"),30,1,UUID.randomUUID().toString()),"local-user").get("id");
    }
    void authorizeExecution(UUID id){executions.authorize(id,new CodingExecutions.Authorize((String)executions.row(id).get("contract_hash"),"AUTHORIZE_CODEX",5),"local-user");}
    CodingExecutions.Attempt executionAttempt(){return new CodingExecutions.Attempt(session,1);}
    @Test void executionAuthorizationBindsExactContractAndCannotUseAgentAuthority() throws Exception {
        UUID id=executionDraft();assertTrue(executions.claim(agent,session).isEmpty());
        assertEquals(HttpStatus.UNAUTHORIZED,post("/api/v2/coding/executions/"+id+"/authorize",Map.of("contractHash",executions.row(id).get("contract_hash"),"confirmation","AUTHORIZE_CODEX","expiresInMinutes",5),runtime(secret)).getStatusCode());
        assertThrows(ResponseStatusException.class,()->executions.authorize(id,new CodingExecutions.Authorize("f".repeat(64),"AUTHORIZE_CODEX",5),"local-user"));
        authorizeExecution(id);authorizeExecution(id);assertEquals(1,db.queryForObject("select count(*) from coding_execution_authorizations where execution_id=?",Integer.class,id));
        assertThrows(org.springframework.dao.DataAccessException.class,()->db.update("update coding_executions set contract='{}' where id=?",id));
        assertThrows(ResponseStatusException.class,()->CodingExecutions.file("src/**"));assertThrows(ResponseStatusException.class,()->CodingExecutions.file("AGENTS.md"));assertThrows(ResponseStatusException.class,()->CodingExecutions.file("../secret"));
    }
    @Test void executionRevalidatesQuotaBetweenClaimAndStartAndIgnoresHistoricalReady() throws Exception {
        UUID id=executionDraft();var historical=admission.check(check(false),"local-user");assertEquals("READY",historical.get("state"));authorizeExecution(id);assertEquals(id,executions.claim(agent,session).get("id"));assertNull(queue.claim(agent,session));
        db.update("delete from ai_usage_snapshots where agent_id=?",agent);capabilityAndQuota(100,0,false);
        var denied=executions.begin(agent,id,executionAttempt());assertEquals(false,denied.get("permitted"));assertEquals("WAIT_FOR_RESET",executions.row(id).get("error_code"));assertEquals("BLOCKED",executions.row(id).get("state"));
        assertThrows(ResponseStatusException.class,()->executions.begin(agent,id,executionAttempt()));
    }
    @Test void executionRequiresFreshSandboxAndExactCheckpointAndCredentialGeneration() throws Exception {
        UUID id=executionDraft();authorizeExecution(id);db.update("update coding_execution_capabilities set sandbox_verified=false where agent_id=?",agent);assertTrue(executions.claim(agent,session).isEmpty());assertEquals("SANDBOX_NOT_VERIFIED",executions.row(id).get("error_code"));
        executions.capability(agent,new CodingExecutions.Capability(session,"0.162.1",true,true,null,"b".repeat(64)));authorizeExecution(id);
        db.update("update agent_credentials set generation=generation+1 where agent_id=?",agent);assertTrue(executions.claim(agent,session).isEmpty());assertEquals("AUTHORIZATION_EXPIRED_OR_FENCED",executions.row(id).get("error_code"));
    }
    @Test void executionConcurrentClaimHasOneWriterAndSingleUseStart() throws Exception {
        UUID id=executionDraft();authorizeExecution(id);var pool=Executors.newFixedThreadPool(4);int claims=0;
        try{var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<4;i++)jobs.add(pool.submit(()->executions.claim(agent,session)));for(var f:jobs)if(!f.get(10,TimeUnit.SECONDS).isEmpty())claims++;}finally{pool.shutdownNow();}
        assertEquals(1,claims);assertEquals(true,executions.begin(agent,id,executionAttempt()).get("permitted"));assertThrows(ResponseStatusException.class,()->executions.begin(agent,id,executionAttempt()));
        assertThrows(ResponseStatusException.class,()->workspaces.operation(new CodingWorkspaces.Operation((UUID)executions.row(id).get("workspace_id"),"WORKTREE_CLEANUP",UUID.randomUUID().toString()),"local-user"));
    }
    @Test void executionBudgetMutationInvalidatesApprovalRatherThanExpandingAuthority() throws Exception {
        UUID id=executionDraft();authorizeExecution(id);var task=(Map<?,?>)executions.contract(executions.row(id)).get("task");
        db.update("update coding_budget_policies set max_reserved_seconds=600 where id=?",UUID.fromString(task.get("budgetPolicyId").toString()));executions.claim(agent,session);assertEquals("BUDGET_POLICY_CHANGED",executions.row(id).get("error_code"));
    }
    @Test void executionReviewStoresExactDiffHashAndCannotReplayOrEscapeScope() throws Exception {
        UUID id=executionDraft();authorizeExecution(id);executions.claim(agent,session);executions.begin(agent,id,executionAttempt());
        String diff="diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\n";
        var bad=new CodingExecutions.Result(session,1,UUID.randomUUID(),"REVIEW_REQUIRED",diff,List.of("outside.txt"),AgentIdentity.hash(diff),"a".repeat(64),null);assertThrows(ResponseStatusException.class,()->executions.result(agent,id,bad));
        var good=new CodingExecutions.Result(session,1,UUID.randomUUID(),"REVIEW_REQUIRED",diff,List.of("README.md"),AgentIdentity.hash(diff),"a".repeat(64),null);assertEquals("REVIEW_REQUIRED",executions.result(agent,id,good).get("state"));assertEquals("REVIEW_REQUIRED",workspaces.workspace((UUID)executions.row(id).get("workspace_id")).get("state"));assertThrows(ResponseStatusException.class,()->executions.result(agent,id,good));
    }
    @Test void executionCancellationExpiryAndRestartRecoveryNeverRetryDirtyWork() throws Exception {
        UUID id=executionDraft();authorizeExecution(id);db.update("update coding_execution_authorizations set expires_at=now()-interval '1 second' where execution_id=?",id);executions.claim(agent,session);assertEquals("AUTHORIZATION_EXPIRED_OR_FENCED",executions.row(id).get("error_code"));
        authorizeExecution(id);executions.claim(agent,session);executions.begin(agent,id,executionAttempt());executions.cancel(id,"local-user");assertEquals(true,executions.renew(agent,id,executionAttempt()).get("cancelRequested"));
        db.update("update coding_executions set lease_expires_at=now()-interval '1 second' where id=?",id);executions.recover();assertEquals("NEEDS_RECONCILIATION",executions.row(id).get("state"));assertTrue(executions.claim(agent,session).isEmpty());assertThrows(ResponseStatusException.class,()->executions.begin(agent,id,executionAttempt()));
    }
    @Test void admissionDistinguishesDisabledReadyBudgetStaleUnknownWeeklyAndExhausted() throws Exception {
        assertEquals("DISABLED",admission.check(check(false),"local-user").get("state"));
        admission.policy(new CodingAdmission.Policy(agent,CodingAdmission.Provider.CODEX_CLI,true,true,1,60,1,30),"local-user");
        assertEquals("PROVIDER_UNSUPPORTED",admission.check(check(false),"local-user").get("state"));
        capabilityAndQuota(20,0,false);var ready=admission.check(check(true),"local-user");assertEquals("READY",ready.get("state"));assertEquals(false,ready.get("executionEnabled"));
        assertEquals("OPERATOR_REQUIRED",admission.check(check(true),"local-user").get("state"));
        db.update("update coding_admissions set reserved_until=now()-interval '1 second' where agent_id=?",agent);
        db.update("delete from ai_usage_snapshots where agent_id=?",agent);capabilityAndQuota(100,0,false);assertEquals("WAIT_FOR_RESET",admission.check(check(false),"local-user").get("state"));
        db.update("delete from ai_usage_snapshots where agent_id=?",agent);capabilityAndQuota(10,800,false);assertEquals("OPERATOR_REQUIRED",admission.check(check(false),"local-user").get("state"));
        db.update("delete from ai_usage_snapshots where agent_id=?",agent);capabilityAndQuota(10,0,true);assertEquals("OPERATOR_REQUIRED",admission.check(check(false),"local-user").get("state"));
        admission.policy(new CodingAdmission.Policy(agent,CodingAdmission.Provider.GEMINI_CLI,true,true,1,60,1,30),"local-user");assertEquals("PROVIDER_UNSUPPORTED",admission.check(new CodingAdmission.Check(UUID.randomUUID(),agent,CodingAdmission.Provider.GEMINI_CLI,30,1,false),"local-user").get("state"));
        credentials.revoke(agent,"local-user");assertEquals("AGENT_OFFLINE_OR_REVOKED",admission.check(check(false),"local-user").get("reason"));
    }
    @Test void concurrentAdmissionCannotOverReserveAndFixturesIgnoreQuota() throws Exception {
        capabilityAndQuota(30,0,false);admission.policy(new CodingAdmission.Policy(agent,CodingAdmission.Provider.CODEX_CLI,true,true,1,60,1,30),"local-user");
        var pool=Executors.newFixedThreadPool(6);int ready=0;
        try {var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<6;i++) jobs.add(pool.submit(()->admission.check(check(true),"local-user")));for(var f:jobs) if("READY".equals(f.get(10,TimeUnit.SECONDS).get("state"))) ready++;}
        finally {pool.shutdownNow();}assertEquals(1,ready);
        queue.enqueue(new AgentApi.CreateTask(agent,AgentApi.Kind.GIT_FIXTURE,UUID.randomUUID().toString(),"quota-free-fixture",10,1));assertEquals("GIT_FIXTURE",queue.claim(agent,session).get("kind"));
    }
}

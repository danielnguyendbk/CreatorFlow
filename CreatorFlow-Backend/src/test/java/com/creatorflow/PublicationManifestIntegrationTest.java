package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="FFMPEG_PATH",matches=".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PublicationManifestIntegrationTest {
    JdbcTemplate admin,db;DriverManagerDataSource source;DataSourceTransactionManager manager;TransactionTemplate tx;
    ObjectMapper json=new ObjectMapper().registerModule(new JavaTimeModule());
    ContentManifests manifests;PublicationApprovals approvals;PublicationSafety safety;YouTubePublisher publisher;
    Path root,baseVideo,voice,video;UUID content,board,render,asset,job,connection=UUID.randomUUID();String schema;
    HttpServer server;ExecutorService serverThreads;int port;
    AtomicReference<String> mode=new AtomicReference<>("success");AtomicInteger puts=new AtomicInteger(),inits=new AtomicInteger();
    AtomicReference<JsonNode> sentMetadata=new AtomicReference<>();AtomicReference<String> uploadedHash=new AtomicReference<>();
    AtomicReference<Runnable> onInit=new AtomicReference<>(()->{});String post;
    @BeforeAll void databaseAndRealMedia() throws Exception {
        String url=System.getenv("CREATORFLOW_TEST_DB_URL"),user=System.getenv("CREATORFLOW_TEST_DB_USER"),password=System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD","");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));schema="cf_p4_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
        source=new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"currentSchema="+schema,user,password);db=new JdbcTemplate(source);
        // Explicit V14 upgrade with an historical approved_at, never grandfathered into P4 approval.
        var old=Flyway.configure().dataSource(source).defaultSchema(schema).schemas(schema).target("14").load();assertEquals(14,old.migrate().migrationsExecuted);
        UUID historicalContent=UUID.randomUUID();db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Historical','Fixture','READY','PUBLICATION','en','fixture')",historicalContent);
        db.update("insert into publication_jobs(id,content_id,platform,status,title,caption,approved_at) values (?,?,'YOUTUBE_SHORTS','SCHEDULED','Historical','Fixture',now())",UUID.randomUUID(),historicalContent);
        var latest=Flyway.configure().dataSource(source).defaultSchema(schema).schemas(schema).load();int pending=latest.info().pending().length;assertTrue(pending>=2);assertEquals(pending,latest.migrate().migrationsExecuted);latest.validate();assertEquals(0,latest.migrate().migrationsExecuted);
        assertEquals(0,db.queryForObject("select count(*) from publication_approvals",Integer.class));assertEquals(1,db.queryForObject("select count(*) from publication_jobs where approved_at is not null and active_manifest_id is null",Integer.class));
        manager=new DataSourceTransactionManager(source);tx=new TransactionTemplate(manager);
        root=Files.createTempDirectory(Path.of("../storage"),"p4-media-").toAbsolutePath();baseVideo=root.resolve("source.mp4");voice=root.resolve("voice.wav");
        run(System.getenv("FFMPEG_PATH"),"-f","lavfi","-i","testsrc2=size=160x284:rate=25","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","15","-c:v","libx264","-preset","ultrafast","-c:a","aac","-movflags","+faststart",baseVideo.toString());
        run(System.getenv("FFMPEG_PATH"),"-i",baseVideo.toString(),"-vn","-c:a","pcm_s16le",voice.toString());
    }
    void run(String executable,String... args) throws Exception {
        var command=new ArrayList<String>(List.of(executable,"-nostdin","-y","-v","error"));command.addAll(List.of(args));
        var process=new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(root.resolve("ffmpeg.log").toFile()).start();assertTrue(process.waitFor(30,TimeUnit.SECONDS));assertEquals(0,process.exitValue());
    }
    @BeforeEach void fixture() throws Exception {
        content=UUID.randomUUID();board=UUID.randomUUID();render=UUID.randomUUID();asset=UUID.randomUUID();job=UUID.randomUUID();post="post-"+job;
        mode.set("success");puts.set(0);inits.set(0);onInit.set(()->{});video=root.resolve(job+".mp4");Files.copy(baseVideo,video);
        db.update("insert into social_connections(id,platform,status,encrypted_refresh_token,scopes) values (?,'YOUTUBE_SHORTS','CONFIGURED',?,?) on conflict(platform) do update set status='CONFIGURED',encrypted_refresh_token=excluded.encrypted_refresh_token,scopes=excluded.scopes,revoked_at=null",connection,new byte[]{1,2,3},new String[]{"https://www.googleapis.com/auth/youtube.upload"});
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Manifest fixture','Fixture','READY','PUBLICATION','en','fixture')",content);
        db.update("insert into storyboards(id,content_id,title,total_duration_sec) values (?,?,'Fixture storyboard',15)",board,content);
        UUID sceneAsset=UUID.randomUUID(),voiceAsset=UUID.randomUUID();
        insertAsset(sceneAsset,"VIDEO",baseVideo,"video/mp4");insertAsset(voiceAsset,"AUDIO",voice,"audio/wav");insertAsset(asset,"FINAL_VIDEO",video,"video/mp4");
        db.update("insert into scenes(id,storyboard_id,scene_number,duration_sec,narration,visual_type,prompt,asset_status,asset_id) values (?,?,1,15,'Fixture narration','VIDEO','Private fixture prompt','READY',?)",UUID.randomUUID(),board,sceneAsset);
        db.update("insert into render_jobs(id,content_id,status,output_asset_id,completed_at) values (?,?,'SUCCESS',?,now())",render,content,asset);
        db.update("insert into publication_jobs(id,content_id,platform,status,title,caption,description,hashtags,scheduled_at) values (?,?,'YOUTUBE_SHORTS','SCHEDULED','Exact title','Exact caption','Exact description',?,now()-interval '1 minute')",job,content,new String[]{"#fixture"});
        manifests=new ContentManifests(db,json,new PublicationMedia(new MediaValidator(System.getenv("FFMPEG_PATH")),json,root.toString(),System.getenv("FFMPEG_PATH"),""));approvals=new PublicationApprovals(db,manifests);
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);port=server.getAddress().getPort();serverThreads=Executors.newCachedThreadPool();server.setExecutor(serverThreads);
        server.createContext("/upload",exchange->{
            try {
                if(exchange.getRequestMethod().equals("POST")) {
                    inits.incrementAndGet();sentMetadata.set(json.readTree(exchange.getRequestBody()));onInit.get().run();
                    if(mode.get().equals("before-timeout")) Thread.sleep(500);
                    if(mode.get().equals("rejected")) {exchange.sendResponseHeaders(403,-1);return;}
                    exchange.getResponseHeaders().set("Location","http://127.0.0.1:"+port+"/upload/session");exchange.sendResponseHeaders(200,-1);
                } else {
                    puts.incrementAndGet();uploadedHash.set(java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(exchange.getRequestBody().readAllBytes())));
                    if(mode.get().equals("after-timeout")) Thread.sleep(500);
                    String body=mode.get().equals("ambiguous")?"{}":"{\"id\":\""+post+"\"}";byte[] bytes=body.getBytes();exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
                }
            } catch(Exception ignored) {} finally {exchange.close();}
        });
        server.createContext("/verify",exchange->{try {
            String id=mode.get().equals("wrong-id")?"other-post":post,visibility=mode.get().equals("wrong-visibility")?"public":"private";
            var bytes=json.writeValueAsBytes(Map.of("items",List.of(Map.of("id",id,"status",Map.of("uploadStatus","processed","privacyStatus",visibility)))));
            exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
        } finally {exchange.close();}});server.start();
        var oauth=new YouTubeOAuthApi(null,json,"","","","","","") {
            @Override String accessToken(UUID id,UUID revision) {assertEquals(connection,id);assertEquals(db.queryForObject("select connection_revision from social_connections where id=?",UUID.class,id),revision);return "mock-only-token";}
        };
        publisher=new YouTubePublisher(oauth,json,"http://127.0.0.1:"+port+"/upload","http://127.0.0.1:"+port+"/verify",Duration.ofMillis(200),Duration.ofMillis(200),Duration.ofMillis(200));
        safety=new PublicationSafety(db,manifests,publisher,manager,false);
    }
    void insertAsset(UUID id,String type,Path path,String mime) throws Exception {db.update("insert into assets(id,filename,asset_type,content_id,file_size_bytes,mime_type,storage_path,validation_status,validated_at) values (?,'fixture',?,?,?,?,?,'VERIFIED',now())",id,type,content,Files.size(path),mime,path.toString());}
    Map<String,Object> create() {return tx.execute(s->manifests.create(job,new ContentManifests.Create(render,connection,"private"),"local-user"));}
    Map<String,Object> approve(Map<String,Object> m,UUID key) {return tx.execute(s->approvals.decide(UUID.fromString(m.get("manifestId").toString()),new PublicationApprovals.Decide((String)m.get("fingerprint"),PublicationApprovals.Decision.APPROVE,key,30),"local-user"));}
    Map<String,Object> approved() {var m=create();approve(m,UUID.randomUUID());return m;}
    String state() {return db.queryForObject("select status from publication_jobs where id=?",String.class,job);}
    @AfterEach void stop() {server.stop(0);serverThreads.shutdownNow();}
    @AfterAll void dropTestSchema() {if(schema!=null && schema.matches("cf_p4_[a-f0-9]{32}")) admin.execute("drop schema "+schema+" cascade");}

    @Test void canonicalHashIsStableAndManifestEvidenceIsImmutableAndPrivate() {
        assertEquals(manifests.canonical(Map.of("z",1,"a",Map.of("y",2,"b",3))),manifests.canonical(new LinkedHashMap<>(Map.of("a",Map.of("b",3,"y",2),"z",1))));
        var m=create();assertEquals(15000,((Number)((Map<?,?>)m.get("media")).get("durationMillis")).intValue());
        var stored=manifests.row(UUID.fromString(m.get("manifestId").toString()));assertEquals(AgentIdentity.hash(stored.get("canonical_json").toString()),m.get("fingerprint"));
        assertFalse(stored.get("canonical_json").toString().contains(root.toString()));assertFalse(stored.get("canonical_json").toString().contains("Private fixture prompt"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("update publication_manifests set fingerprint=? where id=?","a".repeat(64),stored.get("id")));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("delete from publication_manifests where id=?",stored.get("id")));
    }
    @Test void metadataMutationInvalidatesApprovalAndRevisionCannotRewriteHistory() {
        var old=approved();db.update("update publication_jobs set title='Changed title' where id=?",job);
        assertNull(manifests.job(job,false).get("active_manifest_id"));assertEquals("INVALIDATED",((Map<?,?>)manifests.read(UUID.fromString(old.get("manifestId").toString())).get("approval")).get("state"));
        var next=create();assertEquals(2,next.get("revision"));assertNotEquals(old.get("fingerprint"),next.get("fingerprint"));
        assertEquals("Exact title",((Map<?,?>)old.get("metadata")).get("title"));assertEquals("Changed title",((Map<?,?>)next.get("metadata")).get("title"));
        assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals(0,puts.get());
    }
    @Test void duplicateAndConcurrentDecisionsAreIdempotentButCrossManifestReplayIsRejected() throws Exception {
        var m=create();UUID key=UUID.randomUUID();var pool=Executors.newFixedThreadPool(4);
        try {var futures=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<4;i++) futures.add(pool.submit(()->approve(m,key)));for(var f:futures) assertEquals("APPROVED",((Map<?,?>)f.get(10,TimeUnit.SECONDS).get("approval")).get("state"));}
        finally {pool.shutdownNow();}
        assertThrows(ResponseStatusException.class,()->approve(m,UUID.randomUUID()));
        var next=create();assertThrows(ResponseStatusException.class,()->approve(next,key));
        assertThrows(ResponseStatusException.class,()->tx.execute(s->approvals.decide(UUID.fromString(next.get("manifestId").toString()),new PublicationApprovals.Decide((String)m.get("fingerprint"),PublicationApprovals.Decision.APPROVE,UUID.randomUUID(),30),"local-user")));
    }
    @Test void deniedOrExpiredOrRevokedApprovalCannotPublish() {
        var m=approved();UUID id=UUID.fromString(m.get("manifestId").toString());
        tx.execute(s->approvals.revoke(id,"local-user"));assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
        var expiring=approved();UUID expiredId=UUID.fromString(expiring.get("manifestId").toString());
        db.update("update publication_approvals set expires_at=now()-interval '1 second' where manifest_id=?",expiredId);assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
        var denied=create();tx.execute(s->approvals.decide(UUID.fromString(denied.get("manifestId").toString()),new PublicationApprovals.Decide((String)denied.get("fingerprint"),PublicationApprovals.Decision.REJECT,UUID.randomUUID(),30),"local-user"));
        assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals(0,inits.get());
    }
    @Test void artifactTamperingBeforeDispatchAndReplacementDuringInitTransferNoBytes() throws Exception {
        var m=approved();byte[] good=Files.readAllBytes(video);Files.write(video,new byte[]{1,2,3});
        assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals(0,inits.get());
        Files.write(video,good);onInit.set(()->{try {Files.write(video,new byte[]{4,5,6});} catch(Exception e) {throw new RuntimeException(e);}});
        assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals(0,puts.get());assertEquals("FAILED",state());
    }
    @Test void exactConnectionRevisionScopeAndPlatformAreRequired() {
        approved();db.update("update social_connections set scopes='{}' where id=?",connection);assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
        assertEquals(0,inits.get());
        db.update("update publication_jobs set platform='TIKTOK' where id=?",job);assertNull(manifests.job(job,false).get("active_manifest_id"));assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
    }
    @Test void revokedProviderAndLegacyApprovalFailClosed() {
        db.update("update publication_jobs set approved_at=now() where id=?",job);assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
        approved();db.update("update social_connections set revoked_at=now(),status='NOT_CONFIGURED' where id=?",connection);assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals(0,puts.get());
        assertThrows(ResponseStatusException.class,()->tx.execute(s->manifests.create(job,new ContentManifests.Create(render,connection,"private"),UUID.randomUUID().toString())));
    }
    @Test void successfulUploadUsesExactBytesMetadataVisibilityAndConfirmedPostId() {
        var m=approved();safety.dispatch(job);assertEquals("PUBLISHED",state());assertEquals(1,puts.get());
        assertEquals(((Map<?,?>)m.get("media")).get("sha256"),uploadedHash.get());assertEquals("private",sentMetadata.get().path("status").path("privacyStatus").asText());
        assertEquals(((Map<?,?>)m.get("metadata")).get("providerDescription"),sentMetadata.get().path("snippet").path("description").asText());
        safety.dispatch(job);assertEquals(1,puts.get());assertThrows(ResponseStatusException.class,()->create());
    }
    @Test void providerRejectsBeforeTransferAndRetryReusesTheSameGuard() {
        approved();mode.set("rejected");assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals("FAILED",state());assertEquals(0,puts.get());
        safety.ensureRetry(job);db.update("update publication_jobs set status='SCHEDULED' where id=?",job);mode.set("success");safety.dispatch(job);assertEquals("PUBLISHED",state());assertEquals(1,puts.get());
    }
    @Test void timeoutBeforeUploadIsSafeFailureWhileTimeoutAfterPutQuarantines() {
        approved();mode.set("before-timeout");assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertEquals("FAILED",state());assertFalse((Boolean)manifests.job(job,false).get("reconciliation_required"));
        db.update("update publication_jobs set status='SCHEDULED' where id=?",job);mode.set("after-timeout");assertThrows(ResponseStatusException.class,()->safety.dispatch(job));
        assertTrue((Boolean)manifests.job(job,false).get("reconciliation_required"));assertEquals(1,puts.get());assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertThrows(ResponseStatusException.class,()->safety.ensureRetry(job));
    }
    @Test void ambiguousResponseAndRestartNeverBlindlyResend() {
        approved();mode.set("ambiguous");assertThrows(ResponseStatusException.class,()->safety.dispatch(job));assertTrue((Boolean)manifests.job(job,false).get("reconciliation_required"));
        new PublicationApi(db,publisher,root.toString(),false).recoverUncertainUploads();
        var restarted=new PublicationSafety(db,manifests,publisher,manager,false);assertThrows(ResponseStatusException.class,()->restarted.dispatch(job));assertEquals(1,puts.get());
    }
    @Test void duplicateDispatchHasOneAtomicWinnerAndPublishingMetadataCannotChange() throws Exception {
        approved();var pool=Executors.newFixedThreadPool(4);
        try {var futures=new ArrayList<Future<?>>();for(int i=0;i<4;i++) futures.add(pool.submit(()->{try {safety.dispatch(job);} catch(ResponseStatusException ignored) {}}));for(var f:futures) f.get(10,TimeUnit.SECONDS);}
        finally {pool.shutdownNow();}
        assertEquals(1,puts.get());assertEquals("PUBLISHED",state());
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("update publication_jobs set caption='Other' where id=?",job));
    }
    @Test void confirmationMustMatchIdAndApprovedVisibilityAndCanRecoverKnownIdWithoutUpload() {
        approved();mode.set("wrong-id");safety.dispatch(job);assertEquals("PUBLISHING",state());
        mode.set("wrong-visibility");safety.confirm(job);assertEquals("PUBLISHING",state());
        mode.set("success");new PublicationSafety(db,manifests,publisher,manager,false).confirm(job);assertEquals("PUBLISHED",state());assertEquals(1,puts.get());
    }
    @Test void liveAdapterCannotBeEnabledByChangingEndpointAndRealFlagStaysFalse() {
        approved();var live=new YouTubePublisher(publisher.oauth,json,"http://127.0.0.1:"+port+"/upload","http://127.0.0.1:"+port+"/verify");
        var blocked=new PublicationSafety(db,manifests,live,manager,false);assertThrows(ResponseStatusException.class,()->blocked.dispatch(job));assertEquals(0,inits.get());
        assertEquals(false,blocked.readiness(job).get("realPublishEnabled"));
    }
    @Test void scheduledManualAndRetryShareManifestGuardAndLegacyApproveCannotAuthorize() {
        approved();var api=new PublicationApi(db,publisher,safety,root.toString(),false);
        db.update("update publication_jobs set caption='Changed after approval' where id=?",job);
        assertThrows(ResponseStatusException.class,()->api.publishNow(job));api.due();assertEquals(0,inits.get());
        db.update("update publication_jobs set status='FAILED' where id=?",job);
        assertThrows(ResponseStatusException.class,()->tx.execute(s->api.retry(job)));assertThrows(ResponseStatusException.class,()->tx.execute(s->api.approve(job)));
        approved();tx.execute(s->api.retry(job));api.due();assertEquals("PUBLISHED",state());assertEquals(1,puts.get());
    }
    @Test void fixtureApprovalCannotAuthorizePublicationEvenWithSameUuid() {
        var manifest=create();UUID manifestId=UUID.fromString(manifest.get("manifestId").toString()),cycleId=UUID.randomUUID();String bot="p4-fixture-"+UUID.randomUUID().toString().substring(0,8);
        db.update("insert into agent_cycles(id,idempotency_key,request_hash) values (?,?,?)",cycleId,UUID.randomUUID().toString(),"a".repeat(64));
        db.update("insert into telegram_bots(identity,bot_id,token_env) values (?,?,'TELEGRAM_NEVER_TOKEN')",bot,Math.abs(UUID.randomUUID().getLeastSignificantBits()));
        db.update("insert into telegram_routes(bot_identity,chat_id,kind,can_approve) values (?,-100,'CODE',true)",bot);
        db.update("insert into telegram_operators(bot_identity,chat_id,user_id,role) values (?,-100,42,'OPERATOR')",bot);
        db.update("insert into control_approvals(id,cycle_id,bot_identity,chat_id,required_operator,expires_at,evidence_ref,state) values (?,?,?,-100,42,now()+interval '1 hour',?,'APPROVED')",manifestId,cycleId,bot,cycleId);
        assertEquals("APPROVAL_INVALID_OR_EXPIRED",assertThrows(ResponseStatusException.class,()->safety.dispatch(job)).getReason());assertEquals(0,inits.get());
    }
}

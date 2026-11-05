package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
class AiReliabilityIntegrationTest {
    private static final String VALID="{\"totalDurationSec\":15,\"scenes\":[{\"durationSec\":15,\"narration\":\"A valid narrated scene.\",\"visualType\":\"IMAGE\",\"prompt\":\"A valid image prompt\"}]}";
    @Test void invalidResponseRecordsUsageAndRetryCreatesExactlyOneBoard(){
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var db=new JdbcTemplate(source);UUID content=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'AI fixture','Fixture','DRAFT','SCRIPT','en','test')",content);
        var calls=new AtomicInteger();
        AiService.TextProvider provider=new AiService.TextProvider(){
            public String name(){return "FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt){return new AiService.Result(calls.incrementAndGet()==1?"{bad json":VALID,12,18,null);}
        };
        var ai=new AiService(db,List.of(provider),true,ignored->{});
        var api=new GenerationApi(db,ai,new StoryboardApi(db),new ObjectMapper(),new DataSourceTransactionManager(source));
        try {
            assertEquals(502,assertThrows(ResponseStatusException.class,()->api.generate(content)).getStatusCode().value());
            assertEquals(0,db.queryForObject("select count(*) from storyboards where content_id=?",Integer.class,content));
            assertEquals(0,db.queryForObject("select count(*) from stage_progress where content_id=? and status='COMPLETED'",Integer.class,content));
            assertEquals("INVALID_ARTIFACT",db.queryForObject("select error_category from ai_generation_jobs where content_id=?",String.class,content));
            assertEquals(12,db.queryForObject("select input_tokens from provider_usage where generation_job_id=(select id from ai_generation_jobs where content_id=?)",Integer.class,content));
            assertNull(db.queryForObject("select cost_usd from provider_usage where generation_job_id=(select id from ai_generation_jobs where content_id=?)",java.math.BigDecimal.class,content));
            var board=api.generate(content);
            assertEquals(board.get("id"),api.generate(content).get("id"));
            assertEquals(2,calls.get());
            assertEquals(1,db.queryForObject("select count(*) from storyboards where content_id=?",Integer.class,content));
            assertEquals(board.get("id"),db.queryForObject("select artifact_id from ai_generation_jobs where content_id=? and status='COMPLETED'",UUID.class,content));
            assertEquals(2,db.queryForObject("select count(*) from stage_progress where content_id=? and status='COMPLETED'",Integer.class,content));
        } finally {cleanup(db,content);}
    }
    @Test void rateLimitAndTimeoutRetryWithinBoundAndRestartFailsRunningJob(){
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var db=new JdbcTemplate(source);UUID content=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Retry fixture','Fixture','DRAFT','SCRIPT','en','test')",content);
        var calls=new AtomicInteger();var sleeps=new AtomicInteger();
        AiService.TextProvider provider=new AiService.TextProvider(){
            public String name(){return "FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt) throws Exception {
                int call=calls.incrementAndGet();
                if(call==1) throw new AiService.ProviderError(429,Duration.ofSeconds(1));
                if(call==2) throw new java.net.http.HttpTimeoutException("fixture timeout");
                return new AiService.Result(VALID,null,null,null);
            }
        };
        var ai=new AiService(db,List.of(provider),true,millis->{assertTrue(millis>=0 && millis<=10_000);sleeps.incrementAndGet();});
        var api=new GenerationApi(db,ai,new StoryboardApi(db),new ObjectMapper(),new DataSourceTransactionManager(source));
        try {
            var board=api.generate(content);
            assertNotNull(board.get("id"));assertEquals(3,calls.get());assertEquals(2,sleeps.get());
            assertEquals(2,db.queryForObject("select retry_count from ai_generation_jobs where content_id=?",Integer.class,content));
            assertNull(db.queryForObject("select input_tokens from provider_usage where generation_job_id=(select id from ai_generation_jobs where content_id=?)",Integer.class,content));
            UUID running=UUID.randomUUID();
            db.update("insert into ai_generation_jobs(id,content_id,type,status,prompt) values (?,?,'HEALTH','RUNNING','fixture')",running,content);
            ai.recoverRunningJobs();
            assertEquals("PROCESS_RESTARTED",db.queryForObject("select error_category from ai_generation_jobs where id=?",String.class,running));
        } finally {cleanup(db,content);}
    }
    @Test void concurrentDuplicateGenerationCallsProviderOnce() throws Exception {
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var db=new JdbcTemplate(source);UUID content=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Concurrent AI fixture','Fixture','DRAFT','SCRIPT','en','test')",content);
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var calls=new AtomicInteger();
        AiService.TextProvider provider=new AiService.TextProvider(){
            public String name(){return "FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt) throws Exception {
                calls.incrementAndGet();entered.countDown();
                if(!release.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("fixture timed out");
                return new AiService.Result(VALID,4,6,null);
            }
        };
        var api=new GenerationApi(db,new AiService(db,List.of(provider),true,ignored->{}),new StoryboardApi(db),new ObjectMapper(),new DataSourceTransactionManager(source));
        var pool=Executors.newSingleThreadExecutor();
        try {
            var first=pool.submit(()->api.generate(content));
            assertTrue(entered.await(10,TimeUnit.SECONDS));
            assertEquals(409,assertThrows(ResponseStatusException.class,()->api.generate(content)).getStatusCode().value());
            release.countDown();
            var board=first.get(10,TimeUnit.SECONDS);
            assertEquals(board.get("id"),api.generate(content).get("id"));
            assertEquals(1,calls.get());
            assertEquals(1,db.queryForObject("select count(*) from storyboards where content_id=?",Integer.class,content));
        } finally {release.countDown();pool.shutdownNow();cleanup(db,content);}
    }
    @Test void provider503RetriesThreeTimesThenFallsBackToConfiguredProvider(){
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var db=new JdbcTemplate(source);UUID content=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Fallback AI fixture','Fixture','DRAFT','SCRIPT','en','test')",content);
        var primaryCalls=new AtomicInteger();var fallbackCalls=new AtomicInteger();
        AiService.TextProvider primary=new AiService.TextProvider(){
            public String name(){return "PRIMARY_FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt) throws Exception {primaryCalls.incrementAndGet();throw new AiService.ProviderError(503,null);}
        };
        AiService.TextProvider fallback=new AiService.TextProvider(){
            public String name(){return "FALLBACK_FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt){fallbackCalls.incrementAndGet();return new AiService.Result(VALID,5,7,null);}
        };
        var api=new GenerationApi(db,new AiService(db,List.of(primary,fallback),true,ignored->{}),new StoryboardApi(db),new ObjectMapper(),new DataSourceTransactionManager(source));
        try {
            assertNotNull(api.generate(content).get("id"));
            assertEquals(3,primaryCalls.get());assertEquals(1,fallbackCalls.get());
            assertEquals("FALLBACK_FIXTURE",db.queryForObject("select provider from ai_generation_jobs where content_id=?",String.class,content));
        } finally {cleanup(db,content);}
    }
    @Test void nonRetryableProviderErrorFailsOnceWithoutFallback(){
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var db=new JdbcTemplate(source);UUID content=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Nonretry AI fixture','Fixture','DRAFT','SCRIPT','en','test')",content);
        var calls=new AtomicInteger();var fallbackCalls=new AtomicInteger();
        AiService.TextProvider primary=new AiService.TextProvider(){
            public String name(){return "PRIMARY_FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt) throws Exception {calls.incrementAndGet();throw new AiService.ProviderError(400,null);}
        };
        AiService.TextProvider fallback=new AiService.TextProvider(){
            public String name(){return "FALLBACK_FIXTURE";} public String model(){return "offline";} public boolean configured(){return true;}
            public AiService.Result generate(String prompt){fallbackCalls.incrementAndGet();return new AiService.Result(VALID,5,7,null);}
        };
        var api=new GenerationApi(db,new AiService(db,List.of(primary,fallback),true,ignored->{}),new StoryboardApi(db),new ObjectMapper(),new DataSourceTransactionManager(source));
        try {
            assertEquals(502,assertThrows(ResponseStatusException.class,()->api.generate(content)).getStatusCode().value());
            assertEquals(1,calls.get());assertEquals(0,fallbackCalls.get());
            assertEquals("PROVIDER_ERROR",db.queryForObject("select error_category from ai_generation_jobs where content_id=?",String.class,content));
            assertEquals(0,db.queryForObject("select count(*) from provider_usage where generation_job_id=(select id from ai_generation_jobs where content_id=?)",Integer.class,content));
        } finally {cleanup(db,content);}
    }
    private static void cleanup(JdbcTemplate db,UUID content){
        db.update("delete from activity_events where entity_id=?",content);
        db.update("delete from provider_usage where generation_job_id in (select id from ai_generation_jobs where content_id=?)",content);
        db.update("delete from ai_generation_jobs where content_id=?",content);
        db.update("delete from stage_progress where content_id=?",content);
        db.update("delete from scenes where storyboard_id in (select id from storyboards where content_id=?)",content);
        db.update("delete from storyboards where content_id=?",content);
        db.update("delete from contents where id=?",content);
    }
}

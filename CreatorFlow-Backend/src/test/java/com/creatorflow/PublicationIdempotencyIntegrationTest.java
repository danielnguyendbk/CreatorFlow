package com.creatorflow;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
class PublicationIdempotencyIntegrationTest {
    @Test void restartQuarantinesUnconfirmedUploadWithoutRetryingIt(){
        var datasource=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(datasource);
        var api=new PublicationApi(db,null,"storage/assets",false);
        UUID contentId=UUID.randomUUID(),jobId=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Recovery fixture','Recovery','READY','PUBLICATION','en','test')",contentId);
        try {
            db.update("insert into publication_jobs(id,content_id,platform,status,caption,title,approved_at,attempts) values (?,?,'YOUTUBE_SHORTS','PUBLISHING','fixture','Recovery',now(),1)",jobId,contentId);
            api.recoverUncertainUploads();
            assertTrue((Boolean)api.one(jobId).get("reconciliationRequired"));
            assertEquals("UPLOAD_OUTCOME_UNKNOWN",api.one(jobId).get("failureCategory"));
            assertEquals(1,db.queryForObject("select attempts from publication_jobs where id=?",Integer.class,jobId));
            assertEquals(409,assertThrows(ResponseStatusException.class,()->api.publishNow(jobId)).getStatusCode().value());
            assertEquals(409,assertThrows(ResponseStatusException.class,()->api.retry(jobId)).getStatusCode().value());
        } finally {
            db.update("delete from publication_jobs where id=?",jobId);
            db.update("delete from contents where id=?",contentId);
        }
    }
    @Test void concurrentSchedulingClaimsOneTarget() throws Exception {
        var datasource=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(datasource);
        var transactions=new TransactionTemplate(new DataSourceTransactionManager(datasource));
        var api=new PublicationApi(db,null,"storage/assets",false);
        UUID contentId=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Concurrent fixture','Idempotency','READY','PUBLICATION','en','test')",contentId);
        var request=Map.<String,Object>of("contentId",contentId.toString(),"platform","YOUTUBE_SHORTS",
            "scheduledAt",OffsetDateTime.now().plusHours(1).toString(),"caption","fixture","title","Concurrent fixture");
        var pool=Executors.newFixedThreadPool(2);
        var start=new CountDownLatch(1);
        try {
            var first=pool.submit(()->{start.await();return transactions.execute(ignored->api.schedule(request));});
            var second=pool.submit(()->{start.await();return transactions.execute(ignored->api.schedule(request));});
            start.countDown();
            assertEquals(first.get(10,TimeUnit.SECONDS).get("id"),second.get(10,TimeUnit.SECONDS).get("id"));
            assertEquals(1,db.queryForObject("select count(*) from publication_jobs where content_id=?",Integer.class,contentId));
        } finally {
            pool.shutdownNow();
            db.update("delete from publication_jobs where content_id=?",contentId);
            db.update("delete from contents where id=?",contentId);
        }
    }
    @Test void failedTargetIsReusedAndCannotBeRetriedBesideAnActiveJob(){
        var datasource=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(datasource);
        var transactions=new TransactionTemplate(new DataSourceTransactionManager(datasource));
        var api=new PublicationApi(db,null,"storage/assets",false);
        UUID contentId=UUID.randomUUID(),failedId=UUID.randomUUID(),activeId=UUID.randomUUID();
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'P0 fixture','Idempotency','READY','PUBLICATION','en','test')",contentId);
        try {
            db.update("insert into publication_jobs(id,content_id,platform,status,scheduled_at,caption,title) values (?,?,'YOUTUBE_SHORTS','FAILED',now(),'fixture','P0 fixture')",failedId,contentId);
            Map<String,Object> request=Map.of("contentId",contentId.toString(),"platform","YOUTUBE_SHORTS",
                "scheduledAt",OffsetDateTime.now().plusHours(1).toString(),"caption","fixture","title","P0 fixture");
            for(int attempt=0;attempt<2;attempt++){
                var scheduled=transactions.execute(ignored->api.schedule(request));
                assertEquals(failedId,scheduled.get("id"));
            }
            assertEquals(1,db.queryForObject("select count(*) from publication_jobs where content_id=? and platform='YOUTUBE_SHORTS'",Integer.class,contentId));
            // V5 permits history but only one canonical target.
            db.update("insert into publication_jobs(id,content_id,platform,status,scheduled_at,caption,title,superseded_by) values (?,?,'YOUTUBE_SHORTS','SCHEDULED',now(),'fixture','P0 fixture',?)",activeId,contentId,failedId);
            db.update("update publication_jobs set superseded_by=? where id=?",activeId,failedId);
            db.update("update publication_jobs set superseded_by=null where id=?",activeId);
            var error=assertThrows(ResponseStatusException.class,()->transactions.execute(ignored->api.retry(failedId)));
            assertEquals(409,error.getStatusCode().value());
            assertEquals("FAILED",db.queryForObject("select status from publication_jobs where id=?",String.class,failedId));
        } finally {
            db.update("delete from publication_jobs where content_id=?",contentId);
            db.update("delete from contents where id=?",contentId);
        }
    }
}

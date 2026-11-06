package com.creatorflow;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
class PublicationMigrationIntegrationTest {
    @Test void freshAndConflictingHistoryMigrateWithoutLosingPostIds() {
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(source);
        // A generated schema isolates the fixture from the application's test data.
        String schema="cf_migration_"+UUID.randomUUID().toString().replace("-","");
        db.execute("create schema "+schema);
        try {
            var first=Flyway.configure().dataSource(source).defaultSchema(schema).schemas(schema)
                .locations("classpath:db/migration").target(MigrationVersion.fromVersion("4")).load();
            assertEquals(4,first.migrate().migrationsExecuted);
            String prefix=schema+".";
            db.update("insert into "+prefix+"contents(id,title,topic,status,current_stage,language,niche) values ('11111111-1111-4111-8111-111111111111','Fixture','Test','READY','PUBLICATION','en','test')");
            db.update("insert into "+prefix+"publication_jobs(id,content_id,platform,status,caption,title,platform_post_id) values "
                +"('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','YOUTUBE_SHORTS','FAILED','fixture','first','remote-A'),"
                +"('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','YOUTUBE_SHORTS','FAILED','fixture','second','remote-B')");
            var second=Flyway.configure().dataSource(source).defaultSchema(schema).schemas(schema)
                .locations("classpath:db/migration").load();
            assertEquals(5,second.migrate().migrationsExecuted);
            assertEquals(0,second.migrate().migrationsExecuted);
            assertEquals(2,db.queryForObject("select count(*) from "+prefix+"publication_jobs where platform_post_id is not null and reconciliation_required",Integer.class));
            assertEquals(1,db.queryForObject("select count(*) from "+prefix+"publication_jobs where superseded_by is null",Integer.class));
            assertEquals(1,db.queryForObject("select count(*) from "+prefix+"publication_jobs where superseded_by is not null",Integer.class));
            assertEquals(9,db.queryForObject("select count(*) from "+prefix+"flyway_schema_history where success",Integer.class));
            second.validate();
        } finally {
            db.execute("drop schema "+schema+" cascade");
        }
    }
}

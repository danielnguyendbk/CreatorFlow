package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CREATORFLOW_TEST_DB_URL",matches=".+")
class AssetValidationIntegrationTest {
    @Test void invalidUploadAndLegacyAssignmentLeaveSceneWaiting() throws Exception {
        var source=new DriverManagerDataSource(System.getenv("CREATORFLOW_TEST_DB_URL"),
            System.getenv("CREATORFLOW_TEST_DB_USER"),System.getenv().getOrDefault("CREATORFLOW_TEST_DB_PASSWORD",""));
        var db=new JdbcTemplate(source);
        var root=Files.createTempDirectory("cf-asset-test-");
        var api=new AssetApi(db,new ObjectMapper(),new MediaValidator("ffmpeg"),root.toString());
        UUID content=UUID.randomUUID(),board=UUID.randomUUID(),scene=UUID.randomUUID(),legacy=UUID.randomUUID();
        var invalid=new byte[]{(byte)0x89,'P','N','G',13,10,26,10,0,0,0,0};
        db.update("insert into contents(id,title,topic,status,current_stage,language,niche) values (?,'Media fixture','Test','WAITING_FOR_ASSET','VISUAL_ASSETS','en','test')",content);
        db.update("insert into storyboards(id,content_id,title) values (?,?,'Media fixture')",board,content);
        db.update("insert into scenes(id,storyboard_id,scene_number,duration_sec,narration,visual_type,prompt,asset_status) values (?,?,1,15,'fixture','IMAGE','fixture','WAITING_FOR_ASSET')",scene,board);
        try {
            var upload=new MockMultipartFile("file","bad.png","image/png",invalid);
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,()->api.upload(upload,content,scene)).code);
            assertEquals(0,db.queryForObject("select count(*) from assets where content_id=?",Integer.class,content));
            assertEquals("WAITING_FOR_ASSET",db.queryForObject("select asset_status from scenes where id=?",String.class,scene));
            var path=root.resolve(legacy.toString());Files.write(path,invalid);
            db.update("insert into assets(id,filename,asset_type,file_size_bytes,mime_type,storage_path) values (?,'legacy.png','IMAGE',?,'image/png',?)",legacy,invalid.length,path.toString());
            assertEquals("MEDIA_INVALID",assertThrows(MediaValidator.InvalidMedia.class,
                ()->api.assign(legacy,java.util.Map.of("contentId",content,"sceneId",scene))).code);
            assertEquals("UNVERIFIED",db.queryForObject("select validation_status from assets where id=?",String.class,legacy));
            assertEquals("WAITING_FOR_ASSET",db.queryForObject("select asset_status from scenes where id=?",String.class,scene));
            db.update("delete from assets where id=?",legacy);Files.deleteIfExists(path);
        } finally {
            db.update("delete from scenes where id=?",scene);
            db.update("delete from storyboards where id=?",board);
            db.update("delete from contents where id=?",content);
            Files.deleteIfExists(root);
        }
    }
}

package com.creatorflow;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/contents")
public class TtsApi {
    private final JdbcTemplate db;
    private final Path root;
    private final Path script;
    TtsApi(JdbcTemplate db,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String root,
           @Value("${CREATORFLOW_TTS_SCRIPT:scripts/synthesize.ps1}") String script) throws Exception {
        this.db=db;this.root=Path.of(root).toAbsolutePath().normalize();this.script=Path.of(script).toAbsolutePath().normalize();Files.createDirectories(this.root);
    }
    @PostMapping("/{id}/voice") Map<String,Object> generate(@PathVariable UUID id) throws Exception {
        var existing=db.queryForList("select id from assets where content_id=? and asset_type='AUDIO' order by created_at desc limit 1",id);
        if(!existing.isEmpty()) return Map.of("assetId",existing.getFirst().get("id"),"status","READY");
        var scenes=db.queryForList("select s.narration from scenes s join storyboards b on b.id=s.storyboard_id where b.content_id=? order by s.scene_number",id);
        if(scenes.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Storyboard required before voice generation");
        if(!Files.isRegularFile(script)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Local TTS NOT_CONFIGURED");
        UUID assetId=UUID.randomUUID();Path output=root.resolve(assetId+".wav");Path input=Files.createTempFile(root,"tts-",".txt");
        try {
            String text=scenes.stream().map(row->(String)row.get("narration")).reduce((a,b)->a+". "+b).orElseThrow();
            Files.writeString(input,text,StandardCharsets.UTF_8);
            Process process=new ProcessBuilder("powershell.exe","-NoProfile","-NonInteractive","-File",script.toString(),"-TextFile",input.toString(),"-OutputFile",output.toString())
                .redirectErrorStream(true).start();
            boolean done=process.waitFor(90,TimeUnit.SECONDS);
            if(!done){process.destroyForcibly();throw new IllegalStateException("TTS timed out");}
            if(process.exitValue()!=0 || !Files.isRegularFile(output) || Files.size(output)<44) throw new IllegalStateException("TTS failed");
            db.update("insert into assets(id,filename,asset_type,content_id,file_size_bytes,mime_type,storage_path) values (?,'voice.wav','AUDIO',?,?,'audio/wav',?)",
                assetId,id,Files.size(output),output.toString());
            db.update("insert into stage_progress(content_id,stage,status,started_at,completed_at) values (?,'VOICE','COMPLETED',now(),now()) on conflict(content_id,stage) do update set status='COMPLETED',completed_at=now(),error=null",id);
            db.update("insert into activity_events(id,type,entity_id,entity_type,message,severity) values (?,'VOICE_GENERATED',?,'CONTENT','Local voice generated','SUCCESS')",UUID.randomUUID(),id);
            return Map.of("assetId",assetId,"status","READY");
        } catch(Exception e){Files.deleteIfExists(output);throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"Local TTS failed",e);}
        finally {Files.deleteIfExists(input);}
    }
}

package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/render-jobs")
public class RenderApi {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final String ffmpeg;
    private final Path root;
    private final Map<UUID,Process> processes=new ConcurrentHashMap<>();
    RenderApi(JdbcTemplate db,ObjectMapper json,@Value("${FFMPEG_PATH:ffmpeg}") String ffmpeg,
              @Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String assetRoot) throws Exception {
        this.db=db;this.json=json;this.ffmpeg=ffmpeg;this.root=Path.of(assetRoot).toAbsolutePath().normalize();Files.createDirectories(root);
    }
    private static final String SELECT="select r.id,r.content_id as \"contentId\",c.title as \"contentTitle\",r.status,r.progress_percent as \"progressPercent\",r.started_at as \"startedAt\",r.completed_at as \"completedAt\",r.worker,r.retry_count as \"retryCount\",r.max_retries as \"maxRetries\",r.error,r.output_asset_id as \"outputAssetId\",r.logs,r.created_at as \"createdAt\",r.updated_at as \"updatedAt\" from render_jobs r join contents c on c.id=r.content_id";
    private Map<String,Object> shape(Map<String,Object> row){
        var result=new java.util.LinkedHashMap<>(row);
        try {result.put("logs",json.readValue(row.get("logs").toString(),List.class));}
        catch(Exception e){throw new IllegalStateException("Invalid render log",e);}
        result.put("durationMs",null);return result;
    }
    @GetMapping List<Map<String,Object>> all(){return db.queryForList(SELECT+" order by r.created_at desc").stream().map(this::shape).toList();}
    @GetMapping("/{id}") Map<String,Object> one(@PathVariable UUID id){
        var rows=db.queryForList(SELECT+" where r.id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Render job not found");return shape(rows.getFirst());
    }
    @GetMapping("/{id}/logs") List<String> logs(@PathVariable UUID id){return (List<String>)one(id).get("logs");}
    @PostMapping Map<String,Object> create(@RequestBody Map<String,UUID> body){
        UUID contentId=body.get("contentId");if(contentId==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"contentId required");
        var existing=db.queryForList("select id from render_jobs where content_id=? and status in ('QUEUED','RENDERING','RETRYING','SUCCESS') order by created_at desc limit 1",contentId);
        if(!existing.isEmpty()) return one((UUID)existing.getFirst().get("id"));
        var scenes=db.queryForList("select s.id from scenes s join storyboards b on b.id=s.storyboard_id where b.content_id=?",contentId);
        if(scenes.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Storyboard required");
        int missing=db.queryForObject("select count(*) from scenes s join storyboards b on b.id=s.storyboard_id where b.content_id=? and s.asset_status<>'READY'",Integer.class,contentId);
        if(missing>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Scenes need assets");
        int audio=db.queryForObject("select count(*) from assets where content_id=? and asset_type='AUDIO'",Integer.class,contentId);
        if(audio==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Voice audio required");
        UUID id=UUID.randomUUID();db.update("insert into render_jobs(id,content_id,status) values (?,?,'QUEUED')",id,contentId);
        return one(id);
    }
    @PostMapping("/{id}/retry") Map<String,Object> retry(@PathVariable UUID id){
        var job=one(id);
        if(!"FAILED".equals(job.get("status")) || ((Number)job.get("retryCount")).intValue()>=((Number)job.get("maxRetries")).intValue())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Render retry unavailable");
        db.update("update render_jobs set status='QUEUED',progress_percent=0,retry_count=retry_count+1,error=null,updated_at=now() where id=? and status='FAILED'",id);
        return one(id);
    }
    @PostMapping("/{id}/cancel") @ResponseStatus(HttpStatus.NO_CONTENT) void cancel(@PathVariable UUID id){
        var job=one(id);
        if(!List.of("QUEUED","RENDERING","RETRYING").contains(job.get("status"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"Render cannot be cancelled");
        db.update("update render_jobs set status='CANCELLED',updated_at=now() where id=?",id);
        Process process=processes.get(id);if(process!=null) process.destroyForcibly();
    }
    @EventListener(ApplicationReadyEvent.class) void recover(){db.update("update render_jobs set status='QUEUED',worker=null,updated_at=now() where status='RENDERING'");}
    @Scheduled(fixedDelay=3000) void work(){
        var rows=db.queryForList("update render_jobs set status='RENDERING',started_at=now(),worker='local',updated_at=now() where id=(select id from render_jobs where status='QUEUED' order by created_at limit 1 for update skip locked) returning id,content_id");
        if(rows.isEmpty()) return;
        UUID id=(UUID)rows.getFirst().get("id"),contentId=(UUID)rows.getFirst().get("content_id");
        try {render(id,contentId);}
        catch(Exception e){
            if(!"CANCELLED".equals(one(id).get("status"))){
                db.update("update render_jobs set status='FAILED',error=?,updated_at=now() where id=?",e.getMessage(),id);
                db.update("update contents set status='FAILED',updated_at=now() where id=?",contentId);
            }
        }
    }
    private void run(UUID job,List<String> args,Path log) throws Exception {
        var command=new ArrayList<String>();command.add(ffmpeg);command.addAll(List.of("-y","-hide_banner","-loglevel","error","-xerror"));command.addAll(args);
        Process process=new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile()).start();processes.put(job,process);
        boolean done=process.waitFor(180,TimeUnit.SECONDS);processes.remove(job);
        if(!done){process.destroyForcibly();throw new IllegalStateException("FFmpeg timed out");}
        if(process.exitValue()!=0) throw new IllegalStateException("FFmpeg exit "+process.exitValue()+": "+Files.readString(log).lines().reduce((a,b)->b).orElse("unknown"));
        if("CANCELLED".equals(one(job).get("status"))) throw new IllegalStateException("Render cancelled");
    }
    private static String srtTime(int sec){return String.format("%02d:%02d:%02d,000",sec/3600,(sec/60)%60,sec%60);}
    private void render(UUID job,UUID contentId) throws Exception {
        Path work=Files.createDirectories(root.resolve("render-"+job));Path log=work.resolve("ffmpeg.log");
        var scenes=db.queryForList("select s.scene_number,s.duration_sec,s.narration,a.storage_path,a.asset_type from scenes s join storyboards b on b.id=s.storyboard_id join assets a on a.id=s.asset_id where b.content_id=? order by s.scene_number",contentId);
        if(scenes.isEmpty()) throw new IllegalStateException("No scene assets");
        var audio=db.queryForList("select storage_path from assets where content_id=? and asset_type='AUDIO' order by created_at desc limit 1",contentId);
        if(audio.isEmpty()) throw new IllegalStateException("Voice audio missing");
        var concat=new StringBuilder();var subtitles=new StringBuilder();int elapsed=0,n=0;
        for(var scene:scenes){
            n++;int duration=((Number)scene.get("duration_sec")).intValue();
            Path source=Path.of((String)scene.get("storage_path")).toAbsolutePath().normalize();
            if(!source.startsWith(root) || !Files.isRegularFile(source)) throw new IllegalStateException("Scene asset file missing");
            Path segment=work.resolve("segment-"+n+".mp4");
            var args=new ArrayList<String>();
            if("IMAGE".equals(scene.get("asset_type"))) {args.addAll(List.of("-loop","1","-framerate","25"));}
            else if("VIDEO".equals(scene.get("asset_type"))) {args.addAll(List.of("-stream_loop","-1"));}
            else throw new IllegalStateException("Scene asset must be image or video");
            args.addAll(List.of("-i",source.toString(),"-t",Integer.toString(duration),"-vf","scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,format=yuv420p","-r","25","-an","-c:v","libx264","-preset","ultrafast",segment.toString()));
            run(job,args,log);
            concat.append("file '").append(segment.toString().replace("'","''").replace('\\','/')).append("'\n");
            subtitles.append(n).append("\n").append(srtTime(elapsed)).append(" --> ").append(srtTime(elapsed+duration)).append("\n")
                .append(((String)scene.get("narration")).replace("\r"," ").replace("\n"," ")).append("\n\n");
            elapsed+=duration;
            db.update("update render_jobs set progress_percent=?,updated_at=now() where id=?",Math.min(80,n*80/scenes.size()),job);
        }
        Path list=work.resolve("concat.txt"),subtitle=work.resolve("subtitle.srt"),silent=work.resolve("silent.mp4"),output=root.resolve(job+".mp4");
        Files.writeString(list,concat.toString(),StandardCharsets.UTF_8);Files.writeString(subtitle,subtitles.toString(),StandardCharsets.UTF_8);
        run(job,List.of("-f","concat","-safe","0","-i",list.toString(),"-c","copy",silent.toString()),log);
        run(job,List.of("-i",silent.toString(),"-i",(String)audio.getFirst().get("storage_path"),"-i",subtitle.toString(),"-map","0:v:0","-map","1:a:0","-map","2:s:0","-c:v","copy","-c:a","aac","-c:s","mov_text","-t",Integer.toString(elapsed),"-movflags","+faststart",output.toString()),log);
        if(!Files.isRegularFile(output) || Files.size(output)<1024) throw new IllegalStateException("Output MP4 missing");
        UUID asset=UUID.randomUUID(),subAsset=UUID.randomUUID();
        db.update("insert into assets(id,filename,asset_type,content_id,file_size_bytes,mime_type,storage_path) values (?,'final.mp4','FINAL_VIDEO',?,?,'video/mp4',?)",asset,contentId,Files.size(output),output.toString());
        db.update("insert into assets(id,filename,asset_type,content_id,file_size_bytes,mime_type,storage_path) values (?,'subtitle.srt','SUBTITLE',?,?,'application/x-subrip',?)",subAsset,contentId,Files.size(subtitle),subtitle.toString());
        db.update("update render_jobs set status='SUCCESS',progress_percent=100,output_asset_id=?,completed_at=now(),logs=?::jsonb,updated_at=now() where id=?",asset,json.writeValueAsString(List.of("FFmpeg output verified: "+Files.size(output)+" bytes")),job);
        db.update("update contents set status='READY',current_stage='PUBLICATION',progress_percent=90,updated_at=now() where id=?",contentId);
        for(String stage:List.of("RENDER","SUBTITLE"))
            db.update("insert into stage_progress(content_id,stage,status,started_at,completed_at) values (?,?,'COMPLETED',now(),now()) on conflict(content_id,stage) do update set status='COMPLETED',completed_at=now(),error=null",contentId,stage);
        db.update("update workflow_instances set status='COMPLETED',completed_at=now(),updated_at=now() where content_id=? and status='RUNNING'",contentId);
        db.update("update workflow_node_executions set status='COMPLETED',completed_at=now() where workflow_instance_id in (select id from workflow_instances where content_id=?) and node_name='RenderVideo' and status='PENDING'",contentId);
    }
}

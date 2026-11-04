package com.creatorflow;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/settings")
public class SettingsApi {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final boolean geminiConfigured;
    private final String model;
    private final String ffmpeg;
    private final String ttsScript;
    private final boolean publishEnabled;
    SettingsApi(JdbcTemplate db,ObjectMapper json,@Value("${GEMINI_API_KEY:}") String key,
            @Value("${GEMINI_MODEL:gemini-2.5-flash}") String model,
            @Value("${FFMPEG_PATH:ffmpeg}") String ffmpeg,
            @Value("${CREATORFLOW_TTS_SCRIPT:scripts/synthesize.ps1}") String ttsScript,
            @Value("${CREATORFLOW_ENABLE_REAL_PUBLISH:false}") boolean publishEnabled) {
        this.db=db;this.json=json;this.geminiConfigured=!key.isBlank();this.model=model;this.ffmpeg=ffmpeg;this.ttsScript=ttsScript;this.publishEnabled=publishEnabled;
    }
    private Map<String,Object> stored(String key,Map<String,Object> defaults){
        var rows=db.queryForList("select value::text as value from system_settings where key=?",key);
        if(rows.isEmpty()) return defaults;
        try {return json.readValue((String)rows.getFirst().get("value"),Map.class);}
        catch(JsonProcessingException e){throw new IllegalStateException("Invalid saved settings",e);}
    }
    private boolean ffmpegAvailable(){
        try {
            Process p=new ProcessBuilder(ffmpeg,"-version").redirectErrorStream(true).start();
            return p.waitFor(5,java.util.concurrent.TimeUnit.SECONDS) && p.exitValue()==0;
        } catch(Exception e){return false;}
    }
    @GetMapping Map<String,Object> get(){
        var result=new LinkedHashMap<String,Object>();
        result.put("general",stored("general",Map.of("language","en","timezone","Asia/Ho_Chi_Minh")));
        result.put("contentDefaults",stored("contentDefaults",Map.of("defaultNiche","Java Backend","defaultLanguage","en","defaultFormat","EXPLAINER","defaultDurationSec",60)));
        String not="NOT_CONFIGURED";
        result.put("aiProviders",Map.of("gemini",Map.of("name","Gemini","status",geminiConfigured?"CONFIGURED":not,"model",model),
            "googleFlow",Map.of("mode","MANUAL","status",not),"localTts",Map.of("status",java.nio.file.Files.isRegularFile(java.nio.file.Path.of(ttsScript))?"CONFIGURED":not)));
        result.put("media",Map.of("ffmpegStatus",ffmpegAvailable()?"CONFIGURED":not,"outputDirectory","storage/renders","tempDirectory","storage/tmp"));
        int youtube=db.queryForObject("select count(*) from social_connections where platform='YOUTUBE_SHORTS' and status='CONFIGURED' and revoked_at is null",Integer.class);
        result.put("publishing",Map.of("youtube",publishEnabled && youtube>0?"CONFIGURED":not,"tiktok",not,"instagram",not,"facebook",not));
        return result;
    }
    @PatchMapping @Transactional Map<String,Object> update(@RequestBody Map<String,Object> partial) throws JsonProcessingException {
        var current=get();
        if(partial.keySet().stream().anyMatch(k->!List.of("general","contentDefaults","aiProviders","media","publishing").contains(k)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Provider and media settings are environment-controlled");
        for(String immutable:List.of("aiProviders","media","publishing"))
            if(partial.containsKey(immutable) && !partial.get(immutable).equals(current.get(immutable)))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Provider and media settings are environment-controlled");
        for(var entry:partial.entrySet()) {
            if(!List.of("general","contentDefaults").contains(entry.getKey())) continue;
            if(!(entry.getValue() instanceof Map<?,?>)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid settings section");
            db.update("insert into system_settings(key,value) values (?,?::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()",
                entry.getKey(),json.writeValueAsString(entry.getValue()));
        }
        return get();
    }
}

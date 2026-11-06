package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import java.nio.file.*;
import java.nio.channels.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** File paths stay inside this service, not in immutable JSON or API errors. */
@Component
class PublicationMedia {
    final Path root;
    final MediaValidator validator;
    final ObjectMapper json;
    final String probe;
    PublicationMedia(MediaValidator validator,ObjectMapper json,@Value("${CREATORFLOW_STORAGE_DIR:storage/assets}") String directory,
        @Value("${FFMPEG_PATH:ffmpeg}") String ffmpeg,@Value("${FFPROBE_PATH:}") String probe) {
        this.root=Path.of(directory).toAbsolutePath().normalize();this.validator=validator;this.json=json;
        this.probe=probe.isBlank()?(Path.of(ffmpeg).getParent()==null?"ffprobe":Path.of(ffmpeg).resolveSibling("ffprobe.exe").toString()):probe;
    }
    Path path(Object stored) {
        try {
            var path=Path.of(String.valueOf(stored)).toAbsolutePath().normalize();
            if(!path.startsWith(root) || !Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS) || !path.toRealPath().startsWith(root.toRealPath()) || Files.size(path)<1 || Files.size(path)>250L*1024*1024) throw ContentManifests.blocked("ARTIFACT_UNAVAILABLE");
            return path;
        } catch(java.io.IOException e) {throw ContentManifests.blocked("ARTIFACT_UNAVAILABLE");}
    }
    static String hash(Path path) {
        try(var in=Files.newInputStream(path)) {var digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1) digest.update(buffer,0,n);return HexFormat.of().formatHex(digest.digest());}
        catch(Exception e) {throw ContentManifests.blocked("ARTIFACT_UNAVAILABLE");}
    }
    Map<String,Object> evidence(Path path) {
        String before=hash(path);
        validator.validate(path,"video/mp4");
        Path log=null;
        try {
            log=Files.createTempFile("cf-publication-probe-",".json");
            var process=new ProcessBuilder(probe,"-v","error","-show_entries","format=duration,format_name:stream=codec_type,codec_name,width,height","-of","json",path.toString()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if(!process.waitFor(20,TimeUnit.SECONDS)) {process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();throw ContentManifests.blocked("PROBE_TIMEOUT");}
            if(process.exitValue()!=0 || Files.size(log)>32768) throw ContentManifests.blocked("PROBE_INVALID");
            var value=json.readTree(Files.readAllBytes(log));var codecs=new ArrayList<Map<String,Object>>();
            for(var s:value.path("streams")) if(List.of("video","audio","subtitle").contains(s.path("codec_type").asText())) codecs.add(Map.of("type",s.path("codec_type").asText(),"codec",s.path("codec_name").asText()));
            long millis=new java.math.BigDecimal(value.path("format").path("duration").asText()).movePointRight(3).longValueExact();
            if(millis<=0 || codecs.stream().noneMatch(c->c.get("type").equals("video"))) throw ContentManifests.blocked("PROBE_INVALID");
            if(!before.equals(hash(path))) throw ContentManifests.blocked("ARTIFACT_CHANGED_DURING_VALIDATION");
            return Map.of("durationMillis",millis,"container",value.path("format").path("format_name").asText(),"codecs",codecs,"sizeBytes",Files.size(path),"sha256",before);
        } catch(org.springframework.web.server.ResponseStatusException e) {throw e;}
        catch(Exception e) {throw ContentManifests.blocked("PROBE_INVALID");}
        finally {if(log!=null) try {Files.deleteIfExists(log);} catch(Exception ignored) {}}
    }
    Prepared capture(Path source,String expected,long size) {
        try {
            var directory=Files.createDirectories(root.resolve("publication-staging"));
            var file=Files.createTempFile(directory,"upload-",".bin");
            var channel=FileChannel.open(file,StandardOpenOption.READ,StandardOpenOption.WRITE,StandardOpenOption.DELETE_ON_CLOSE);
            var lock=channel.lock();
            var prepared=new Prepared(channel,lock);
            try {
                try(var input=Files.newInputStream(source)) {
                    var out=Channels.newOutputStream(channel);byte[] buffer=new byte[65536];long copied=0;int count;
                    while((count=input.read(buffer))!=-1) {copied+=count;if(copied>size) throw ContentManifests.blocked("ARTIFACT_CHANGED");out.write(buffer,0,count);}
                }
                if(channel.size()!=size || !expected.equals(channelHash(channel))) throw ContentManifests.blocked("ARTIFACT_CHANGED");
                channel.position(0);return prepared;
            } catch(Exception e) {prepared.close();throw e;}
        } catch(org.springframework.web.server.ResponseStatusException e) {throw e;}
        catch(Exception e) {throw ContentManifests.blocked("ARTIFACT_CAPTURE_FAILED");}
    }
    static String channelHash(FileChannel channel) throws Exception {
        channel.position(0);var digest=MessageDigest.getInstance("SHA-256");var buffer=java.nio.ByteBuffer.allocate(65536);
        while(channel.read(buffer)>0) {buffer.flip();digest.update(buffer);buffer.clear();}return HexFormat.of().formatHex(digest.digest());
    }
    static final class Prepared implements AutoCloseable {
        final FileChannel channel;final FileLock lock;
        Prepared(FileChannel channel,FileLock lock) {this.channel=channel;this.lock=lock;}
        java.io.InputStream stream() {try {channel.position(0);return Channels.newInputStream(channel);} catch(Exception e) {throw new IllegalStateException("STAGED_ARTIFACT_UNAVAILABLE");}}
        public void close() {try {if(lock.isValid()) lock.release();} catch(Exception ignored) {}try {channel.close();} catch(Exception ignored) {}}
    }
}

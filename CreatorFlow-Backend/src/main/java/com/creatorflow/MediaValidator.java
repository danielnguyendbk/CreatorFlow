package com.creatorflow;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
final class MediaValidator {
    static final class InvalidMedia extends RuntimeException {
        final String code;
        final HttpStatus status;
        InvalidMedia(String code,String message,HttpStatus status){super(message);this.code=code;this.status=status;}
    }
    private static final long MAX_BYTES=250L*1024*1024;
    private final Semaphore slots=new Semaphore(2);
    private final String ffmpeg;
    MediaValidator(@Value("${FFMPEG_PATH:ffmpeg}") String ffmpeg){this.ffmpeg=ffmpeg;}

    String classify(String mime,byte[] head){
        if(mime==null) throw invalid("MEDIA_UNSUPPORTED","Missing MIME type",HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        String signature=signature(head);
        String type=switch(mime.toLowerCase(java.util.Locale.ROOT)) {
            case "image/png","image/jpeg","image/gif" -> "IMAGE";
            case "video/mp4","video/webm" -> "VIDEO";
            case "audio/wav","audio/x-wav","audio/wave","audio/mpeg","audio/mp3" -> "AUDIO";
            case "text/vtt","application/x-subrip","text/plain" -> "SUBTITLE";
            default -> throw invalid("MEDIA_UNSUPPORTED","Unsupported MIME type",HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        };
        boolean matches=switch(mime.toLowerCase(java.util.Locale.ROOT)) {
            case "image/png" -> signature.equals("PNG");
            case "image/jpeg" -> signature.equals("JPEG");
            case "image/gif" -> signature.equals("GIF");
            case "video/mp4" -> signature.equals("MP4");
            case "video/webm" -> signature.equals("WEBM");
            case "audio/wav","audio/x-wav","audio/wave" -> signature.equals("WAV");
            case "audio/mpeg","audio/mp3" -> signature.equals("MP3");
            case "text/vtt" -> signature.equals("VTT");
            case "application/x-subrip","text/plain" -> signature.equals("SRT") || signature.equals("VTT");
            default -> false;
        };
        if(!matches) throw invalid("MEDIA_MIME_MISMATCH","MIME type does not match file content",HttpStatus.UNPROCESSABLE_ENTITY);
        return type;
    }

    private String signature(byte[] b){
        String text=new String(b,StandardCharsets.US_ASCII);
        if(b.length>=8 && b[0]==(byte)0x89 && b[1]=='P' && b[2]=='N' && b[3]=='G') return "PNG";
        if(b.length>=3 && b[0]==(byte)0xff && b[1]==(byte)0xd8 && b[2]==(byte)0xff) return "JPEG";
        if(text.startsWith("GIF8")) return "GIF";
        if(b.length>=12 && text.substring(4,8).equals("ftyp")) return "MP4";
        if(b.length>=4 && b[0]==0x1a && b[1]==0x45 && b[2]==(byte)0xdf && b[3]==(byte)0xa3) return "WEBM";
        if(text.startsWith("RIFF") && text.length()>=12 && text.substring(8,12).equals("WAVE")) return "WAV";
        if(text.startsWith("ID3") || (b.length>=2 && b[0]==(byte)0xff && (b[1]&0xe0)==0xe0)) return "MP3";
        if(text.startsWith("WEBVTT")) return "VTT";
        if(text.stripLeading().matches("(?s)^\\d+\\s*\\R.*")) return "SRT";
        return "UNKNOWN";
    }

    void validate(Path path,String mime) {
        try {
            if(!Files.isRegularFile(path) || Files.size(path)==0 || Files.size(path)>MAX_BYTES)
                throw invalid("MEDIA_SIZE_INVALID","Invalid media size",HttpStatus.UNPROCESSABLE_ENTITY);
            byte[] head;
            try(var input=Files.newInputStream(path)){head=input.readNBytes(64);}
            String type=classify(mime,head);
            if(type.equals("IMAGE")) checkImageEnd(path,mime);
            if(!slots.tryAcquire(2,TimeUnit.SECONDS))
                throw invalid("MEDIA_VALIDATION_BUSY","Media validation capacity exhausted",HttpStatus.TOO_MANY_REQUESTS);
            try {
                if(type.equals("IMAGE")) decodeImage(path);
                else if(type.equals("SUBTITLE")) validateSubtitle(path);
                else decodeWithFfmpeg(path,type);
            } finally {slots.release();}
        } catch(InterruptedException e){Thread.currentThread().interrupt();throw invalid("MEDIA_VALIDATION_INTERRUPTED","Media validation interrupted",HttpStatus.SERVICE_UNAVAILABLE);}
        catch(IOException e){throw invalid("MEDIA_INVALID","Media could not be read",HttpStatus.UNPROCESSABLE_ENTITY);}
    }
    private void checkImageEnd(Path path,String mime) throws IOException {
        long size=Files.size(path);
        byte[] tail;
        try(var input=Files.newInputStream(path)) {
            input.skipNBytes(Math.max(0,size-16));
            tail=input.readAllBytes();
        }
        boolean complete=switch(mime.toLowerCase(java.util.Locale.ROOT)) {
            case "image/png" -> tail.length>=12 && tail[tail.length-8]=='I' && tail[tail.length-7]=='E'
                && tail[tail.length-6]=='N' && tail[tail.length-5]=='D';
            case "image/jpeg" -> tail.length>=2 && tail[tail.length-2]==(byte)0xff && tail[tail.length-1]==(byte)0xd9;
            case "image/gif" -> tail.length>=1 && tail[tail.length-1]==0x3b;
            default -> false;
        };
        if(!complete) throw invalid("MEDIA_INVALID","Image is incomplete",HttpStatus.UNPROCESSABLE_ENTITY);
    }
    private void decodeImage(Path path) throws IOException {
        try(var input=ImageIO.createImageInputStream(path.toFile())) {
            var readers=ImageIO.getImageReaders(input);
            if(!readers.hasNext()) throw invalid("MEDIA_INVALID","Image decoder unavailable",HttpStatus.UNPROCESSABLE_ENTITY);
            var reader=readers.next();
            try {
                reader.setInput(input,true,true);
                long pixels=(long)reader.getWidth(0)*reader.getHeight(0);
                if(pixels<=0 || pixels>40_000_000L) throw invalid("MEDIA_RESOURCE_LIMIT","Image dimensions exceed limit",HttpStatus.UNPROCESSABLE_ENTITY);
                if(reader.read(0)==null) throw invalid("MEDIA_INVALID","Image could not be decoded",HttpStatus.UNPROCESSABLE_ENTITY);
            } finally {reader.dispose();}
        } catch(InvalidMedia e){throw e;}
        catch(Exception e){throw invalid("MEDIA_INVALID","Image could not be decoded",HttpStatus.UNPROCESSABLE_ENTITY);}
    }
    private void validateSubtitle(Path path) throws IOException {
        if(Files.size(path)>2_000_000L) throw invalid("MEDIA_RESOURCE_LIMIT","Subtitle exceeds limit",HttpStatus.UNPROCESSABLE_ENTITY);
        String value=Files.readString(path,StandardCharsets.UTF_8);
        if(!value.contains("-->")) throw invalid("MEDIA_INVALID","Subtitle cue missing",HttpStatus.UNPROCESSABLE_ENTITY);
    }
    private void decodeWithFfmpeg(Path path,String type) throws IOException,InterruptedException {
        Path log=Files.createTempFile("creatorflow-media-check-",".log");
        try {
            var command=new java.util.ArrayList<String>(java.util.List.of(ffmpeg,"-nostdin","-hide_banner","-loglevel","error","-xerror","-threads","1","-i",path.toString()));
            command.addAll(java.util.List.of("-map",type.equals("VIDEO")?"0:v:0":"0:a:0","-f","null","-"));
            Process process=new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile()).start();
            if(!process.waitFor(30,TimeUnit.SECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();
                throw invalid("MEDIA_VALIDATION_TIMEOUT","Media decoder timed out",HttpStatus.UNPROCESSABLE_ENTITY);
            }
            if(process.exitValue()!=0) throw invalid("MEDIA_INVALID","Media could not be decoded",HttpStatus.UNPROCESSABLE_ENTITY);
        } finally {Files.deleteIfExists(log);}
    }
    private InvalidMedia invalid(String code,String message,HttpStatus status){return new InvalidMedia(code,message,status);}
}

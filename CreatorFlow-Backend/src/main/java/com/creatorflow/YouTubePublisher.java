package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class YouTubePublisher {
    static class UploadException extends Exception {
        final boolean outcomeUnknown;
        UploadException(boolean outcomeUnknown, Exception cause){super(cause);this.outcomeUnknown=outcomeUnknown;}
    }
    private final YouTubeOAuthApi oauth;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final URI uploadEndpoint,verifyEndpoint;
    private final Duration initTimeout,putTimeout,verifyTimeout;
    @Autowired
    YouTubePublisher(YouTubeOAuthApi oauth,ObjectMapper json,
        @Value("${YOUTUBE_UPLOAD_ENDPOINT:https://www.googleapis.com/upload/youtube/v3/videos}") String uploadEndpoint,
        @Value("${YOUTUBE_VERIFY_ENDPOINT:https://www.googleapis.com/youtube/v3/videos}") String verifyEndpoint){
        this(oauth,json,uploadEndpoint,verifyEndpoint,Duration.ofSeconds(30),Duration.ofMinutes(10),Duration.ofSeconds(30));
    }
    YouTubePublisher(YouTubeOAuthApi oauth,ObjectMapper json,String uploadEndpoint,String verifyEndpoint,
        Duration initTimeout,Duration putTimeout,Duration verifyTimeout){
        this.oauth=oauth;this.json=json;this.uploadEndpoint=URI.create(uploadEndpoint);this.verifyEndpoint=URI.create(verifyEndpoint);
        this.initTimeout=initTimeout;this.putTimeout=putTimeout;this.verifyTimeout=verifyTimeout;
    }
    String publish(Path video,String title,String caption) throws UploadException {
        boolean uploadStarted=false;
        try {
        if(!Files.isRegularFile(video) || Files.size(video)==0) throw new IllegalArgumentException("Final video missing");
        String token=oauth.accessToken();
        String metadata=json.writeValueAsString(Map.of("snippet",Map.of("title",title,"description",caption,"categoryId","22"),
            "status",Map.of("privacyStatus","public","selfDeclaredMadeForKids",false)));
        URI endpoint=URI.create(uploadEndpoint+"?uploadType=resumable&part=snippet,status");
        var init=HttpRequest.newBuilder(endpoint).header("Authorization","Bearer "+token)
            .header("Content-Type","application/json; charset=UTF-8").header("X-Upload-Content-Type","video/mp4")
            .header("X-Upload-Content-Length",Long.toString(Files.size(video))).timeout(initTimeout)
            .POST(HttpRequest.BodyPublishers.ofString(metadata)).build();
        var initResponse=http.send(init,HttpResponse.BodyHandlers.discarding());
        if(initResponse.statusCode()!=200 && initResponse.statusCode()!=201) throw new IllegalStateException("YouTube upload initialization HTTP "+initResponse.statusCode());
        URI upload=URI.create(initResponse.headers().firstValue("Location").orElseThrow(()->new IllegalStateException("YouTube upload location missing")));
        if(!upload.getScheme().equals(uploadEndpoint.getScheme()) || !upload.getHost().equals(uploadEndpoint.getHost()) || upload.getPort()!=uploadEndpoint.getPort())
            throw new IllegalStateException("Unexpected YouTube upload location");
        var put=HttpRequest.newBuilder(upload).header("Authorization","Bearer "+token).header("Content-Type","video/mp4")
            .timeout(putTimeout).PUT(HttpRequest.BodyPublishers.ofFile(video)).build();
        uploadStarted=true;
        var result=http.send(put,HttpResponse.BodyHandlers.ofString());
        if(result.statusCode()!=200 && result.statusCode()!=201) throw new IllegalStateException("YouTube upload HTTP "+result.statusCode());
        String postId=json.readTree(result.body()).path("id").asText();
        if(postId.isBlank()) throw new IllegalStateException("YouTube post ID missing");
        return postId;
        } catch(Exception e) {throw new UploadException(uploadStarted,e);}
    }
    boolean confirmed(String postId) throws Exception {
        String token=oauth.accessToken();
        URI url=URI.create(verifyEndpoint+"?part=status&id="+java.net.URLEncoder.encode(postId,java.nio.charset.StandardCharsets.UTF_8));
        var request=HttpRequest.newBuilder(url).header("Authorization","Bearer "+token).timeout(verifyTimeout).GET().build();
        var response=http.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200) throw new IllegalStateException("YouTube status HTTP "+response.statusCode());
        var status=json.readTree(response.body()).path("items").path(0).path("status");
        return "processed".equals(status.path("uploadStatus").asText()) && "public".equals(status.path("privacyStatus").asText());
    }
}

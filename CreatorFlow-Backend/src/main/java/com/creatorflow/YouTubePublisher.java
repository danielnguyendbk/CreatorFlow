package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class YouTubePublisher {
    static class UploadException extends Exception {
        final boolean outcomeUnknown;
        UploadException(boolean outcomeUnknown, Exception cause){super(cause);this.outcomeUnknown=outcomeUnknown;}
    }
    final YouTubeOAuthApi oauth;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final URI uploadEndpoint,verifyEndpoint;
    private final Duration initTimeout,putTimeout,verifyTimeout;
    private boolean mock;
    @Autowired
    YouTubePublisher(YouTubeOAuthApi oauth,ObjectMapper json,
        @Value("${YOUTUBE_UPLOAD_ENDPOINT:https://www.googleapis.com/upload/youtube/v3/videos}") String uploadEndpoint,
        @Value("${YOUTUBE_VERIFY_ENDPOINT:https://www.googleapis.com/youtube/v3/videos}") String verifyEndpoint){
        this(oauth,json,uploadEndpoint,verifyEndpoint,Duration.ofSeconds(30),Duration.ofMinutes(10),Duration.ofSeconds(30));
        this.mock=false;
    }
    YouTubePublisher(YouTubeOAuthApi oauth,ObjectMapper json,String uploadEndpoint,String verifyEndpoint,
        Duration initTimeout,Duration putTimeout,Duration verifyTimeout){
        this.oauth=oauth;this.json=json;this.uploadEndpoint=URI.create(uploadEndpoint);this.verifyEndpoint=URI.create(verifyEndpoint);
        this.initTimeout=initTimeout;this.putTimeout=putTimeout;this.verifyTimeout=verifyTimeout;
        this.mock=isLoopback(this.uploadEndpoint) && isLoopback(this.verifyEndpoint);
        if(!this.mock && (!official(this.uploadEndpoint) || !official(this.verifyEndpoint))) throw new IllegalArgumentException("Unverified provider endpoint");
    }
    private static boolean isLoopback(URI uri) {return "http".equals(uri.getScheme()) && List.of("127.0.0.1","localhost","::1").contains(uri.getHost()) && uri.getUserInfo()==null;}
    private static boolean official(URI uri) {return "https".equals(uri.getScheme()) && "www.googleapis.com".equals(uri.getHost()) && uri.getUserInfo()==null && (uri.getPort()==-1 || uri.getPort()==443);}
    boolean mock() {return mock;}
    boolean configured() {return mock || oauth.publicationConfigured() && official(uploadEndpoint) && official(verifyEndpoint);}
    String publish(PublicationSafety.ApprovedUpload permit) throws UploadException {
        boolean uploadStarted=false;
        try {
            permit.authorize();
            String token=permit.accessToken();
            permit.authorize();
            var document=permit.document;var meta=(Map<?,?>)document.get("metadata");
            String metadata=json.writeValueAsString(Map.of("snippet",Map.of("title",meta.get("title"),"description",meta.get("providerDescription"),"tags",meta.get("hashtags"),"categoryId","22"),
                "status",Map.of("privacyStatus",document.get("visibility"),"selfDeclaredMadeForKids",false)));
            var init=HttpRequest.newBuilder(URI.create(uploadEndpoint+"?uploadType=resumable&part=snippet,status&notifySubscribers=false"))
                .header("Authorization","Bearer "+token).header("Content-Type","application/json; charset=UTF-8").header("X-Upload-Content-Type","video/mp4")
                .header("X-Upload-Content-Length",Long.toString(((Number)((Map<?,?>)document.get("media")).get("sizeBytes")).longValue())).timeout(initTimeout)
                .POST(HttpRequest.BodyPublishers.ofString(metadata)).build();
            var initialized=http.send(init,HttpResponse.BodyHandlers.discarding());
            if(initialized.statusCode()!=200 && initialized.statusCode()!=201) throw new IllegalStateException("UPLOAD_INITIALIZATION_REJECTED");
            URI upload=URI.create(initialized.headers().firstValue("Location").orElseThrow());
            if(!Objects.equals(upload.getScheme(),uploadEndpoint.getScheme()) || !Objects.equals(upload.getHost(),uploadEndpoint.getHost()) || upload.getPort()!=uploadEndpoint.getPort() || upload.getUserInfo()!=null) throw new IllegalStateException("UPLOAD_LOCATION_REJECTED");
            permit.authorize(); // Expiry/revocation/file replacement during init must stop before bytes transfer.
            var request=HttpRequest.newBuilder(upload).header("Authorization","Bearer "+token).header("Content-Type","video/mp4").timeout(putTimeout)
                .PUT(HttpRequest.BodyPublishers.ofInputStream(permit.prepared::stream)).build();
            uploadStarted=true;
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200 && response.statusCode()!=201) throw new IllegalStateException("UPLOAD_REJECTED_OR_UNKNOWN");
            String id=json.readTree(response.body()).path("id").asText();
            if(!id.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalStateException("POST_ID_UNAVAILABLE");return id;
        } catch(Exception e) {throw new UploadException(uploadStarted,e);}
    }
    boolean confirmed(String postId,String visibility,UUID connection,UUID revision) throws Exception {
        String token=oauth.accessToken(connection,revision);
        var request=HttpRequest.newBuilder(URI.create(verifyEndpoint+"?part=status&id="+java.net.URLEncoder.encode(postId,java.nio.charset.StandardCharsets.UTF_8)))
            .header("Authorization","Bearer "+token).timeout(verifyTimeout).GET().build();
        var response=http.send(request,HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200) throw new IllegalStateException("CONFIRMATION_UNAVAILABLE");
        var items=json.readTree(response.body()).path("items");
        if(items.size()!=1 || !postId.equals(items.path(0).path("id").asText())) return false;
        var state=items.path(0).path("status");return "processed".equals(state.path("uploadStatus").asText()) && visibility.equals(state.path("privacyStatus").asText());
    }
}

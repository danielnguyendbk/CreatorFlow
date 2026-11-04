package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class YouTubePublisherTest {
    @Test void uploadRequiresPlatformPostIdAndConfirmation() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var uploads=new AtomicInteger();
        int port=server.getAddress().getPort();
        server.createContext("/upload",exchange->{
            assertEquals("Bearer test-token",exchange.getRequestHeaders().getFirst("Authorization"));
            if("POST".equals(exchange.getRequestMethod())){
                exchange.getResponseHeaders().add("Location","http://127.0.0.1:"+port+"/upload/session");
                exchange.sendResponseHeaders(200,-1);
            } else {
                uploads.incrementAndGet();
                assertTrue(exchange.getRequestBody().readAllBytes().length>0);
                byte[] body="{\"id\":\"post-123\"}".getBytes();exchange.sendResponseHeaders(200,body.length);
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.createContext("/verify",exchange->{
            byte[] body="{\"items\":[{\"status\":{\"uploadStatus\":\"processed\",\"privacyStatus\":\"public\"}}]}".getBytes();
            exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();
        });
        server.start();
        var video=Files.createTempFile("creatorflow-youtube-test-",".mp4");
        try {
            Files.write(video,new byte[]{0,1,2,3});
            var oauth=new YouTubeOAuthApi(null,new ObjectMapper(),"","","","","","") {
                @Override String accessToken(){return "test-token";}
            };
            var publisher=new YouTubePublisher(oauth,new ObjectMapper(),"http://127.0.0.1:"+port+"/upload","http://127.0.0.1:"+port+"/verify");
            assertEquals("post-123",publisher.publish(video,"Sample","Caption"));
            assertTrue(publisher.confirmed("post-123"));
            assertEquals(1,uploads.get());
        } finally {Files.deleteIfExists(video);server.stop(0);}
    }
}

package com.creatorflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class YouTubePublisherTest {
    @Test void timeoutBeforeAndAfterVideoPutHasDifferentRecoveryClass() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var executor=java.util.concurrent.Executors.newCachedThreadPool();
        server.setExecutor(executor);
        var puts=new AtomicInteger();
        int port=server.getAddress().getPort();
        server.createContext("/init-timeout",exchange->{
            try {Thread.sleep(350);exchange.sendResponseHeaders(200,-1);} catch(Exception ignored) {}
            finally {exchange.close();}
        });
        server.createContext("/put-timeout",exchange->{
            try {
                if("POST".equals(exchange.getRequestMethod())){
                    exchange.getResponseHeaders().add("Location","http://127.0.0.1:"+port+"/put-timeout/session");
                    exchange.sendResponseHeaders(200,-1);
                } else {
                    puts.incrementAndGet();exchange.getRequestBody().readAllBytes();
                    Thread.sleep(350);exchange.sendResponseHeaders(200,-1);
                }
            } catch(Exception ignored) {}
            finally {exchange.close();}
        });
        server.start();
        var video=Files.createTempFile("creatorflow-youtube-timeout-",".mp4");
        try {
            Files.write(video,new byte[]{0,1,2,3});
            var oauth=new YouTubeOAuthApi(null,new ObjectMapper(),"","","","","","") {
                @Override String accessToken(){return "test-token";}
            };
            var timeout=Duration.ofMillis(80);
            var before=new YouTubePublisher(oauth,new ObjectMapper(),"http://127.0.0.1:"+port+"/init-timeout",
                "http://127.0.0.1:"+port+"/verify",timeout,timeout,timeout);
            var first=assertThrows(YouTubePublisher.UploadException.class,()->before.publish(video,"a","b"));
            assertFalse(first.outcomeUnknown);
            assertTrue(first.getCause() instanceof java.net.http.HttpTimeoutException);
            var after=new YouTubePublisher(oauth,new ObjectMapper(),"http://127.0.0.1:"+port+"/put-timeout",
                "http://127.0.0.1:"+port+"/verify",timeout,timeout,timeout);
            var second=assertThrows(YouTubePublisher.UploadException.class,()->after.publish(video,"a","b"));
            assertTrue(second.outcomeUnknown);
            assertTrue(second.getCause() instanceof java.net.http.HttpTimeoutException);
            assertEquals(1,puts.get());
        } finally {Files.deleteIfExists(video);server.stop(0);executor.shutdownNow();}
    }
    @Test void distinguishesFailureBeforeVideoFromUnknownUploadOutcome() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var puts=new AtomicInteger();
        int port=server.getAddress().getPort();
        server.createContext("/before",exchange->{exchange.sendResponseHeaders(503,-1);exchange.close();});
        server.createContext("/after",exchange->{
            if("POST".equals(exchange.getRequestMethod())) {
                exchange.getResponseHeaders().add("Location","http://127.0.0.1:"+port+"/after/session");
                exchange.sendResponseHeaders(200,-1);
            } else {
                puts.incrementAndGet();exchange.getRequestBody().readAllBytes();
                exchange.sendResponseHeaders(503,-1);
            }
            exchange.close();
        });
        server.start();
        var video=Files.createTempFile("creatorflow-youtube-failure-",".mp4");
        try {
            Files.write(video,new byte[]{0,1,2,3});
            var oauth=new YouTubeOAuthApi(null,new ObjectMapper(),"","","","","","") {
                @Override String accessToken(){return "test-token";}
            };
            var before=new YouTubePublisher(oauth,new ObjectMapper(),"http://127.0.0.1:"+port+"/before","http://127.0.0.1:"+port+"/verify");
            assertFalse(assertThrows(YouTubePublisher.UploadException.class,()->before.publish(video,"a","b")).outcomeUnknown);
            var after=new YouTubePublisher(oauth,new ObjectMapper(),"http://127.0.0.1:"+port+"/after","http://127.0.0.1:"+port+"/verify");
            assertTrue(assertThrows(YouTubePublisher.UploadException.class,()->after.publish(video,"a","b")).outcomeUnknown);
            assertEquals(1,puts.get());
        } finally {Files.deleteIfExists(video);server.stop(0);}
    }
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

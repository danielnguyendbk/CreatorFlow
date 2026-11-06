package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Transport errors are enums, never exception messages containing a Bot API token URL. */
@Component
class TelegramClient {
    record Reply(JsonNode result,String error,boolean uncertain,boolean permanent,int retrySeconds) {
        boolean ok() {return error==null;}
    }
    final Environment env;
    final ObjectMapper json;
    final String base;
    final Duration deadline;
    final HttpClient http;
    @org.springframework.beans.factory.annotation.Autowired
    TelegramClient(Environment env,ObjectMapper json) {this(env,json,"https://api.telegram.org",Duration.ofSeconds(25));}
    TelegramClient(Environment env,ObjectMapper json,String base,Duration deadline) {
        this.env=env;this.json=json;this.base=base;this.deadline=deadline;
        http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    }
    boolean configured(String envKey) {return envKey.matches("TELEGRAM_[A-Z0-9_]*TOKEN") && env.getProperty(envKey,"").matches("[0-9]+:[A-Za-z0-9_-]{20,}");}
    Reply call(String envKey,String method,Map<String,Object> payload) {
        if(!Set.of("getMe","getWebhookInfo","getUpdates","sendMessage").contains(method)) return new Reply(null,"METHOD_DENIED",false,true,0);
        if(!configured(envKey)) return new Reply(null,"NOT_CONFIGURED",false,true,0);
        boolean send=method.equals("sendMessage");
        try {
            var request=HttpRequest.newBuilder(URI.create(base+"/bot"+env.getProperty(envKey)+"/"+method)).timeout(deadline)
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
            // Complete the body within the HTTP request deadline (an InputStream handler only bounds headers).
            var response=http.send(request,HttpResponse.BodyHandlers.ofByteArray());
            byte[] bytes=response.body();
            if(bytes.length>1_048_576) return new Reply(null,"RESPONSE_TOO_LARGE",send,false,0);
            if(response.statusCode()>=500) return new Reply(null,"REMOTE_5XX",send,false,5);
            if(response.statusCode()==429) {
                int retry=5;try {retry=Math.clamp(json.readTree(bytes).path("parameters").path("retry_after").asInt(5),1,300);} catch(Exception ignored) {}
                return new Reply(null,"RATE_LIMIT",false,false,retry);
            }
            if(response.statusCode()!=200) return new Reply(null,"REMOTE_4XX",false,true,0);
            var body=json.readTree(bytes);
            if(!body.path("ok").asBoolean()) return new Reply(null,"REMOTE_REJECTED",false,true,0);
            if(send && !body.path("result").path("message_id").isIntegralNumber()) return new Reply(null,"INVALID_RESPONSE",true,false,0);
            return new Reply(body.path("result"),null,false,false,0);
        } catch(InterruptedException e) {Thread.currentThread().interrupt();return new Reply(null,"INTERRUPTED",send,false,5);}
        catch(Exception e) {return new Reply(null,"TRANSPORT_TIMEOUT_OR_ERROR",send,false,5);}
    }
}

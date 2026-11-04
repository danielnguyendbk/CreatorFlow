package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiService {
    interface TextProvider {
        String name();
        String model();
        boolean configured();
        Result generate(String prompt) throws Exception;
    }
    record Result(String text,int inputTokens,int outputTokens) {}
    static class ProviderError extends Exception {
        final int status;
        ProviderError(int status){super("Provider HTTP "+status);this.status=status;}
    }
    private final JdbcTemplate db;
    private final List<TextProvider> providers;
    private final boolean enabled;
    AiService(JdbcTemplate db,ObjectMapper json,@Value("${GEMINI_API_KEY:}") String geminiKey,
            @Value("${GEMINI_MODEL:gemini-2.5-flash}") String geminiModel,
            @Value("${OPENROUTER_API_KEY:}") String openRouterKey,
            @Value("${OPENROUTER_MODEL:openrouter/free}") String openRouterModel,
            @Value("${CREATORFLOW_ALLOW_PROVIDER_CALLS:false}") boolean enabled) {
        this.db=db;this.enabled=enabled;
        HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        providers=List.of(new TextProvider(){
            public String name(){return "GEMINI";}
            public String model(){return geminiModel;}
            public boolean configured(){return !geminiKey.isBlank();}
            public Result generate(String prompt) throws Exception {
                String body=json.writeValueAsString(Map.of("contents",List.of(Map.of("parts",List.of(Map.of("text",prompt)))),
                    "generationConfig",Map.of("responseMimeType","application/json")));
                var req=HttpRequest.newBuilder(URI.create("https://generativelanguage.googleapis.com/v1beta/models/"+geminiModel+":generateContent"))
                    .header("x-goog-api-key",geminiKey).header("Content-Type","application/json")
                    .timeout(Duration.ofSeconds(60)).POST(HttpRequest.BodyPublishers.ofString(body)).build();
                var res=client.send(req,HttpResponse.BodyHandlers.ofString());
                if(res.statusCode()!=200) throw new ProviderError(res.statusCode());
                JsonNode root=json.readTree(res.body());
                String text=root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText();
                if(text.isBlank()) throw new IllegalStateException("Empty Gemini response");
                return new Result(text,root.path("usageMetadata").path("promptTokenCount").asInt(),root.path("usageMetadata").path("candidatesTokenCount").asInt());
            }
        },new TextProvider(){
            public String name(){return "OPENROUTER";}
            public String model(){return openRouterModel;}
            public boolean configured(){return !openRouterKey.isBlank() && (openRouterModel.equals("openrouter/free") || openRouterModel.endsWith(":free"));}
            public Result generate(String prompt) throws Exception {
                String body=json.writeValueAsString(Map.of("model",openRouterModel,"messages",List.of(Map.of("role","user","content",prompt))));
                var req=HttpRequest.newBuilder(URI.create("https://openrouter.ai/api/v1/chat/completions"))
                    .header("Authorization","Bearer "+openRouterKey).header("Content-Type","application/json")
                    .timeout(Duration.ofSeconds(60)).POST(HttpRequest.BodyPublishers.ofString(body)).build();
                var res=client.send(req,HttpResponse.BodyHandlers.ofString());
                if(res.statusCode()!=200) throw new ProviderError(res.statusCode());
                JsonNode root=json.readTree(res.body());
                String text=root.path("choices").path(0).path("message").path("content").asText();
                if(text.isBlank()) throw new IllegalStateException("Empty OpenRouter response");
                return new Result(text,root.path("usage").path("prompt_tokens").asInt(),root.path("usage").path("completion_tokens").asInt());
            }
        });
    }
    public String generateJson(String type,UUID contentId,String prompt){
        if(!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI provider calls disabled");
        if(providers.stream().noneMatch(TextProvider::configured))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI providers NOT_CONFIGURED");
        UUID id=UUID.randomUUID();
        long started=System.nanoTime();
        db.update("insert into ai_generation_jobs(id,content_id,type,status,prompt) values (?,?,?,'RUNNING',?)",id,contentId,type,prompt);
        Exception last=null;
        for(TextProvider provider:providers){
            if(!provider.configured()) continue;
            if(last!=null && (!(last instanceof ProviderError failure) || (failure.status!=429 && failure.status!=503))) break;
            try {
                db.update("update ai_generation_jobs set provider=?,model=?,updated_at=now() where id=?",provider.name(),provider.model(),id);
                Result result=provider.generate(prompt);
                db.update("update ai_generation_jobs set status='COMPLETED',response=?,input_tokens=?,output_tokens=?,duration_ms=?,updated_at=now() where id=?",
                    result.text(),result.inputTokens(),result.outputTokens(),(System.nanoTime()-started)/1_000_000,id);
                db.update("insert into provider_usage(id,provider,model,generation_job_id,input_tokens,output_tokens,cost_usd) values (?,?,?,?,?,?,?)",
                    UUID.randomUUID(),provider.name(),provider.model(),id,result.inputTokens(),result.outputTokens(),"OPENROUTER".equals(provider.name())?0:null);
                return result.text();
            } catch(Exception e) {last=e;}
        }
        db.update("update ai_generation_jobs set status='FAILED',error=?,duration_ms=?,updated_at=now() where id=?",last==null?"No provider":last.getMessage(),(System.nanoTime()-started)/1_000_000,id);
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI generation failed");
    }
    public Map<String,Object> testGemini(){
        TextProvider provider=providers.getFirst();
        if(!enabled || !provider.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Gemini NOT_CONFIGURED or provider calls disabled");
        String prompt="Return only valid JSON: {\"ok\":true}";
        UUID id=UUID.randomUUID();long started=System.nanoTime();
        db.update("insert into ai_generation_jobs(id,type,status,provider,model,prompt) values (?,'HEALTH','RUNNING',?,?,?)",id,provider.name(),provider.model(),prompt);
        try {
            Result result=provider.generate(prompt);
            long elapsed=(System.nanoTime()-started)/1_000_000;
            db.update("update ai_generation_jobs set status='COMPLETED',response=?,input_tokens=?,output_tokens=?,duration_ms=?,updated_at=now() where id=?",
                result.text(),result.inputTokens(),result.outputTokens(),elapsed,id);
            db.update("insert into provider_usage(id,provider,model,generation_job_id,input_tokens,output_tokens,cost_usd) values (?,?,?,?,?,?,null)",
                UUID.randomUUID(),provider.name(),provider.model(),id,result.inputTokens(),result.outputTokens());
            return Map.of("status","CONNECTED","model",provider.model(),"durationMs",elapsed);
        } catch(Exception e){
            db.update("update ai_generation_jobs set status='FAILED',error=?,duration_ms=?,updated_at=now() where id=?",e.getMessage(),(System.nanoTime()-started)/1_000_000,id);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Gemini connection test failed");
        }
    }
}

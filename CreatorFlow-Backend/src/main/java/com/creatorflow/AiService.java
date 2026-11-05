package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AiService {
    interface TextProvider {
        String name();
        String model();
        boolean configured();
        Result generate(String prompt) throws Exception;
    }
    record Result(String text,Integer inputTokens,Integer outputTokens,BigDecimal costUsd) {}
    static class ProviderError extends Exception {
        final int status;
        final Duration retryAfter;
        ProviderError(int status,Duration retryAfter){super("Provider HTTP "+status);this.status=status;this.retryAfter=retryAfter;}
    }
    @FunctionalInterface interface Sleeper {void sleep(long millis) throws InterruptedException;}
    private final JdbcTemplate db;
    private final List<TextProvider> providers;
    private final boolean enabled;
    private final Sleeper sleeper;
    @Autowired
    AiService(JdbcTemplate db,ObjectMapper json,@Value("${GEMINI_API_KEY:}") String geminiKey,
            @Value("${GEMINI_MODEL:gemini-2.5-flash}") String geminiModel,
            @Value("${OPENROUTER_API_KEY:}") String openRouterKey,
            @Value("${OPENROUTER_MODEL:openrouter/free}") String openRouterModel,
            @Value("${CREATORFLOW_ALLOW_PROVIDER_CALLS:false}") boolean enabled) {
        this.db=db;this.enabled=enabled;this.sleeper=Thread::sleep;
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
                if(res.statusCode()!=200) throw new ProviderError(res.statusCode(),retryAfter(res.headers().firstValue("Retry-After").orElse(null)));
                JsonNode root=json.readTree(res.body());
                String text=root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText();
                if(text.isBlank()) throw new IllegalStateException("Empty Gemini response");
                JsonNode usage=root.path("usageMetadata");
                return new Result(text,token(usage,"promptTokenCount"),token(usage,"candidatesTokenCount"),null);
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
                if(res.statusCode()!=200) throw new ProviderError(res.statusCode(),retryAfter(res.headers().firstValue("Retry-After").orElse(null)));
                JsonNode root=json.readTree(res.body());
                String text=root.path("choices").path(0).path("message").path("content").asText();
                if(text.isBlank()) throw new IllegalStateException("Empty OpenRouter response");
                JsonNode usage=root.path("usage");
                return new Result(text,token(usage,"prompt_tokens"),token(usage,"completion_tokens"),usage.path("cost").isNumber()?usage.path("cost").decimalValue():null);
            }
        });
    }
    AiService(JdbcTemplate db,List<TextProvider> providers,boolean enabled,Sleeper sleeper){
        this.db=db;this.providers=providers;this.enabled=enabled;this.sleeper=sleeper;
    }
    private static Integer token(JsonNode root,String field){return root.path(field).isIntegralNumber()?root.path(field).intValue():null;}
    private static Duration retryAfter(String header){
        if(header==null) return null;
        try {return Duration.ofSeconds(Math.max(0,Long.parseLong(header.trim())));}
        catch(Exception ignored) {
            try {return Duration.between(java.time.Instant.now(),ZonedDateTime.parse(header,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant());}
            catch(Exception invalid){return null;}
        }
    }
    private void requireProvider(){
        if(!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI provider calls disabled");
        if(providers.stream().noneMatch(TextProvider::configured))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI providers NOT_CONFIGURED");
    }
    private UUID claimStoryboard(UUID contentId,String prompt){
        UUID candidate=UUID.randomUUID();String key="STORYBOARD:"+contentId;
        var inserted=db.queryForList("insert into ai_generation_jobs(id,content_id,type,status,prompt,idempotency_key) values (?,?,'STORYBOARD','RUNNING',?,?) on conflict(idempotency_key) do nothing returning id",candidate,contentId,prompt,key);
        if(!inserted.isEmpty()) return candidate;
        var reclaimed=db.queryForList("update ai_generation_jobs set status='RUNNING',error=null,error_category=null,retry_count=retry_count+1,updated_at=now() where idempotency_key=? and status='FAILED' and retry_count<6 returning id",key);
        if(!reclaimed.isEmpty()) return (UUID)reclaimed.getFirst().get("id");
        throw new ResponseStatusException(HttpStatus.CONFLICT,"Storyboard generation already running or completed");
    }
    private record ProviderResponse(TextProvider provider,Result result) {}
    private ProviderResponse request(String prompt,UUID id) throws Exception {
        Exception last=null;
        for(TextProvider provider:providers){
            if(!provider.configured()) continue;
            for(int attempt=0;attempt<3;attempt++){
                db.update("update ai_generation_jobs set provider=?,model=?,updated_at=now() where id=?",provider.name(),provider.model(),id);
                try {return new ProviderResponse(provider,provider.generate(prompt));}
                catch(Exception e){
                    last=e;
                    boolean retryable=(e instanceof ProviderError pe && (pe.status==429 || pe.status==503))
                        || e instanceof java.net.http.HttpTimeoutException;
                    if(!retryable) throw e;
                    if(attempt<2){
                        db.update("update ai_generation_jobs set retry_count=retry_count+1,updated_at=now() where id=?",id);
                        long backoff=Math.min(10_000L,250L*(1L<<attempt)+ThreadLocalRandom.current().nextLong(150));
                        if(e instanceof ProviderError pe && pe.retryAfter!=null)
                            backoff=Math.max(backoff,Math.min(10_000L,Math.max(0,pe.retryAfter.toMillis())));
                        sleeper.sleep(backoff);
                    }
                }
            }
        }
        throw last==null?new IllegalStateException("No provider available"):last;
    }
    private void saveResponse(UUID id,ProviderResponse response,long started){
        Result result=response.result();TextProvider provider=response.provider();
        db.update("update ai_generation_jobs set response=?,input_tokens=?,output_tokens=?,duration_ms=?,provider=?,model=?,updated_at=now() where id=?",
            result.text(),result.inputTokens(),result.outputTokens(),(System.nanoTime()-started)/1_000_000,provider.name(),provider.model(),id);
        db.update("insert into provider_usage(id,provider,model,generation_job_id,input_tokens,output_tokens,cost_usd) values (?,?,?,?,?,?,?)",
            UUID.randomUUID(),provider.name(),provider.model(),id,result.inputTokens(),result.outputTokens(),result.costUsd());
    }
    private String category(Exception e){
        if(e instanceof ProviderError pe) return pe.status==429?"RATE_LIMIT":pe.status==503?"PROVIDER_UNAVAILABLE":"PROVIDER_ERROR";
        if(e instanceof java.net.http.HttpTimeoutException) return "TIMEOUT";
        return "PROVIDER_ERROR";
    }
    private void fail(UUID id,String category,long started){
        db.update("update ai_generation_jobs set status='FAILED',error_category=?,error=?,duration_ms=?,updated_at=now() where id=?",
            category,"AI generation failed: "+category,(System.nanoTime()-started)/1_000_000,id);
    }
    Map<String,Object> generateStoryboard(UUID contentId,String prompt,Function<String,Map<String,Object>> persist,
        TransactionTemplate transactions){
        requireProvider();UUID id=claimStoryboard(contentId,prompt);long started=System.nanoTime();
        try {
            ProviderResponse response=request(prompt,id);
            transactions.executeWithoutResult(ignored->saveResponse(id,response,started));
            return transactions.execute(ignored->{
                Map<String,Object> board=persist.apply(response.result().text());
                db.update("update ai_generation_jobs set status='COMPLETED',artifact_id=?,error=null,error_category=null,duration_ms=?,updated_at=now() where id=?",
                    board.get("id"),(System.nanoTime()-started)/1_000_000,id);
                return board;
            });
        } catch(Exception e){
            String reason=(e instanceof IllegalArgumentException || e instanceof com.fasterxml.jackson.core.JsonProcessingException)
                ?"INVALID_ARTIFACT":e instanceof org.springframework.dao.DataAccessException?"ARTIFACT_PERSISTENCE_ERROR":category(e);
            if(e instanceof InterruptedException) Thread.currentThread().interrupt();
            fail(id,reason,started);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI storyboard generation failed: "+reason);
        }
    }
    @EventListener(ApplicationReadyEvent.class) void recoverRunningJobs(){
        db.update("update ai_generation_jobs set status='FAILED',error_category='PROCESS_RESTARTED',error='Generation interrupted by process restart',updated_at=now() where status='RUNNING'");
    }
    public String generateJson(String type,UUID contentId,String prompt){
        requireProvider();
        UUID id=UUID.randomUUID();
        long started=System.nanoTime();
        db.update("insert into ai_generation_jobs(id,content_id,type,status,prompt) values (?,?,?,'RUNNING',?)",id,contentId,type,prompt);
        try {
            ProviderResponse response=request(prompt,id);
            saveResponse(id,response,started);
            db.update("update ai_generation_jobs set status='COMPLETED',duration_ms=?,updated_at=now() where id=?",(System.nanoTime()-started)/1_000_000,id);
            return response.result().text();
        } catch(Exception e){fail(id,category(e),started);throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI generation failed");}
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
            db.update("insert into provider_usage(id,provider,model,generation_job_id,input_tokens,output_tokens,cost_usd) values (?,?,?,?,?,?,?)",
                UUID.randomUUID(),provider.name(),provider.model(),id,result.inputTokens(),result.outputTokens(),result.costUsd());
            return Map.of("status","CONNECTED","model",provider.model(),"durationMs",elapsed);
        } catch(Exception e){
            db.update("update ai_generation_jobs set status='FAILED',error=?,duration_ms=?,updated_at=now() where id=?",e.getMessage(),(System.nanoTime()-started)/1_000_000,id);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Gemini connection test failed");
        }
    }
}

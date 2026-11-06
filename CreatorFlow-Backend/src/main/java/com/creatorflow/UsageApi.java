package com.creatorflow;

import com.fasterxml.jackson.databind.*;
import jakarta.validation.*;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
class UsageApi {
    enum Status {OK,NOT_AUTHENTICATED,CLI_NOT_FOUND,UNSUPPORTED,NO_DATA,TIMEOUT,ERROR}
    record Window(@Min(1) @Max(525600) int windowDurationMins,@DecimalMin("0") @DecimalMax("100") double usedPercent,
        @Min(0) @Max(253402300799L) Long resetsAt) {}
    record Credits(@Pattern(regexp="[0-9]{1,30}(\\.[0-9]{1,10})?") String balance,Boolean hasCredits,Boolean unlimited) {}
    record Tokens(@Min(0) Long lifetimeTokens,@Min(0) Long peakDailyTokens) {}
    record Snapshot(@NotNull UUID id,@Min(1) long sequence,@NotNull Instant observedAt,
        @Pattern(regexp="[0-9]+\\.[0-9]+\\.[0-9]+([-.][A-Za-z0-9.]+)?") String cliVersion,
        @NotNull Status status,@NotNull @Size(max=10) List<@Valid Window> windows,
        Boolean rateLimitReached,@Valid Credits credits,@Valid Tokens tokens,
        @Pattern(regexp="CLI_NOT_FOUND|PROTOCOL_UNSUPPORTED|NO_RATE_LIMIT_DATA|NOT_AUTHENTICATED|COLLECTOR_TIMEOUT|SCHEMA_INVALID|PROVIDER_ERROR") String errorCode) {}
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final AgentQueue queue;
    private final Validator validator;
    private final int stale;
    private final double low,critical;
    UsageApi(JdbcTemplate db,ObjectMapper json,AgentQueue queue,Validator validator,
        @Value("${CREATORFLOW_USAGE_STALE_SECONDS:360}") int stale,
        @Value("${CREATORFLOW_USAGE_LOW_PERCENT:20}") double low,@Value("${CREATORFLOW_USAGE_CRITICAL_PERCENT:10}") double critical) {
        this.db=db;this.json=json;this.queue=queue;this.validator=validator;this.stale=stale;this.low=low;this.critical=critical;
        if(stale<180 || critical<0 || critical>=low || low>100) throw new IllegalArgumentException("Invalid quota thresholds/freshness");
    }
    static ResponseStatusException invalid() {return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid usage snapshot schema");}
    private void keys(JsonNode node,Set<String> allowed) {
        if(!node.isObject()) throw invalid();node.fieldNames().forEachRemaining(k->{if(!allowed.contains(k)) throw invalid();});
    }
    Snapshot validate(JsonNode node) {
        keys(node,Set.of("id","sequence","observedAt","cliVersion","status","windows","rateLimitReached","credits","tokens" ,"errorCode"));
        if(!node.path("windows").isArray()) throw invalid();
        if(!node.path("sequence").isIntegralNumber()) throw invalid();
        for(var w:node.path("windows")) {
            keys(w,Set.of("windowDurationMins","usedPercent","resetsAt"));
            if(!w.path("windowDurationMins").isIntegralNumber() || !w.path("usedPercent").isNumber()) throw invalid();
            if(w.hasNonNull("resetsAt") && !w.get("resetsAt").isIntegralNumber()) throw invalid();
        }
        if(node.hasNonNull("credits")) keys(node.get("credits"),Set.of("balance","hasCredits","unlimited"));
        if(node.hasNonNull("tokens")) keys(node.get("tokens"),Set.of("lifetimeTokens","peakDailyTokens"));
        if(node.hasNonNull("rateLimitReached") && !node.get("rateLimitReached").isBoolean()) throw invalid();
        if(node.hasNonNull("credits")) {
            var c=node.get("credits");
            if(c.hasNonNull("balance") && !c.get("balance").isTextual()) throw invalid();
            for(String key:List.of("hasCredits","unlimited")) if(c.hasNonNull(key) && !c.get(key).isBoolean()) throw invalid();
        }
        if(node.hasNonNull("tokens")) for(String key:List.of("lifetimeTokens","peakDailyTokens")) if(node.get("tokens").hasNonNull(key) && !node.get("tokens").get(key).isIntegralNumber()) throw invalid();
        try {
            var value=json.treeToValue(node,Snapshot.class);
            if(!validator.validate(value).isEmpty() || value.observedAt().isAfter(Instant.now().plusSeconds(30))) throw invalid();
            if(value.status()!=Status.OK && !value.windows().isEmpty()) throw invalid();
            return value;
        } catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw invalid();}
    }
    @PostMapping("/api/v2/agent-runtime/usage/snapshot") @Transactional Map<String,Object> ingest(Authentication auth,@RequestParam UUID sessionId,@RequestBody JsonNode body) {
        UUID agent=(UUID)auth.getPrincipal();queue.current(agent,sessionId);
        var value=validate(body);String encoded;
        try {encoded=json.writeValueAsString(value);} catch(Exception e) {throw invalid();}
        var previous=db.queryForList("select id,payload from ai_usage_snapshots where agent_id=? and (id=? or sequence=?)",agent,value.id(),value.sequence());
        if(!previous.isEmpty()) {
            try {if(!queue.sameResult(value,json.readValue(previous.getFirst().get("payload").toString(),Map.class))) throw AgentQueue.conflict("Snapshot identity/sequence collision");}
            catch(com.fasterxml.jackson.core.JsonProcessingException e) {throw invalid();}
            return Map.of("accepted",true,"duplicate",true);
        }
        db.update("insert into ai_usage_snapshots(id,agent_id,sequence,observed_at,status,payload) values (?,?,?,?,?,?::jsonb)",value.id(),agent,value.sequence(),java.sql.Timestamp.from(value.observedAt()),value.status().name(),encoded);
        db.update("update usage_refresh_requests set completed_at=now() where agent_id=? and requested_at<=?",agent,java.sql.Timestamp.from(value.observedAt()));
        return Map.of("accepted",true,"duplicate",false);
    }
    @PostMapping("/api/v2/agent-runtime/usage/poll") @Transactional Map<String,Object> instructions(Authentication auth,@RequestBody @Valid AgentApi.SessionRequest request) {
        UUID agent=(UUID)auth.getPrincipal();queue.current(agent,request.sessionId());
        return Map.of("pollIntervalSeconds",180,"sequence",db.queryForObject("select coalesce(max(sequence),0) from ai_usage_snapshots where agent_id=?",Long.class,agent),
            "refreshRequested",db.queryForObject("select count(*) from usage_refresh_requests where agent_id=? and (completed_at is null or requested_at>completed_at)",Integer.class,agent)>0);
    }
    private UUID selected(UUID agent) {
        if(agent!=null) return agent;
        var rows=db.queryForList("select id from local_agents order by last_heartbeat_at desc nulls last,id limit 1");
        return rows.isEmpty()?null:(UUID)rows.getFirst().get("id");
    }
    private Snapshot decode(Map<String,Object> row) {
        try {return json.readValue(row.get("payload").toString(),Snapshot.class);} catch(Exception e) {throw new IllegalStateException(e);}
    }
    private Map<String,Object> window(Snapshot snapshot,int minutes,boolean exhausted) {
        if(snapshot==null) return Map.of("status","NOT_AVAILABLE","windowDurationMins",minutes);
        var windows=snapshot.windows().stream().filter(w->w.windowDurationMins()==minutes).toList();
        if(windows.size()!=1) return Map.of("status",windows.isEmpty()?"NOT_AVAILABLE":"UNKNOWN","windowDurationMins",minutes);
        var w=windows.getFirst();double remaining=100-w.usedPercent();var result=new LinkedHashMap<String,Object>();
        result.put("status","AVAILABLE");result.put("windowDurationMins",minutes);result.put("usedPercent",w.usedPercent());result.put("remainingPercent",remaining);
        result.put("resetsAt",w.resetsAt());result.put("warning",exhausted||remaining<=0?"EXHAUSTED":remaining<critical?"CRITICAL":remaining<low?"LOW":"NORMAL");return result;
    }
    @GetMapping("/api/v2/usage/codex") Map<String,Object> codex(@RequestParam(required=false) UUID agentId) {
        UUID agent=selected(agentId);var result=new LinkedHashMap<String,Object>();
        result.put("provider","CODEX_CLI");result.put("agentId",agent);result.put("source","CODEX_APP_SERVER");
        var rows=agent==null?List.<Map<String,Object>>of():db.queryForList("select payload,received_at from ai_usage_snapshots where agent_id=? order by observed_at desc,sequence desc limit 1",agent);
        Snapshot latest=rows.isEmpty()?null:decode(rows.getFirst());
        var good=agent==null?List.<Map<String,Object>>of():db.queryForList("select payload from ai_usage_snapshots where agent_id=? and status='OK' order by observed_at desc,sequence desc limit 1",agent);
        Snapshot valid=good.isEmpty()?null:decode(good.getFirst());
        boolean fresh=latest!=null && latest.status()==Status.OK && !latest.windows().isEmpty() && latest.observedAt().isAfter(Instant.now().minusSeconds(stale));
        if(fresh && latest.windows().stream().anyMatch(w->w.resetsAt()!=null && w.resetsAt()<=Instant.now().getEpochSecond())) fresh=false;
        boolean refreshTimedOut=agent!=null && db.queryForObject("select count(*) from usage_refresh_requests where agent_id=? and (completed_at is null or requested_at>completed_at) and requested_at<now()-interval '45 seconds'",Integer.class,agent)>0;
        boolean refreshPending=agent!=null && db.queryForObject("select count(*) from usage_refresh_requests where agent_id=? and (completed_at is null or requested_at>completed_at)",Integer.class,agent)>0;
        result.put("refreshState",refreshTimedOut?"TIMEOUT":refreshPending?"PENDING":"IDLE");
        result.put("freshness",fresh&&!refreshTimedOut?"LIVE":valid==null?"UNKNOWN":"STALE");
        result.put("connection",latest==null?"UNKNOWN":latest.status().name());result.put("errorCode",refreshTimedOut?"COLLECTOR_TIMEOUT":latest==null?null:latest.errorCode());
        result.put("lastSynced",latest==null?null:latest.observedAt());result.put("lastGoodAt",valid==null?null:valid.observedAt());result.put("cliVersion",latest==null?null:latest.cliVersion());
        boolean exhausted=valid!=null && Boolean.TRUE.equals(valid.rateLimitReached());
        result.put("fiveHour",window(valid,300,exhausted));result.put("weekly",window(valid,10080,exhausted));
        result.put("credits",valid==null?null:valid.credits());result.put("tokens",valid==null?null:valid.tokens());
        result.put("automationReadiness",!fresh||refreshTimedOut?"OPERATOR_REQUIRED":exhausted || valid.windows().stream().anyMatch(w->w.usedPercent()>=100)?"WAIT_FOR_RESET":valid.windows().stream().map(Window::windowDurationMins).toList().containsAll(List.of(300,10080))?"READY":"OPERATOR_REQUIRED");
        result.put("thresholds",Map.of("low",low,"critical",critical));return result;
    }
    @GetMapping("/api/v2/usage") Map<String,Object> usage(@RequestParam(required=false) UUID agentId) {
        return Map.of("codex",codex(agentId),"otherProviders",List.of(Map.of("provider","GEMINI_API","status","UNSUPPORTED"),Map.of("provider","OPENROUTER_API","status","UNKNOWN")));
    }
    @GetMapping("/api/v2/usage/history") List<Map<String,Object>> history(@RequestParam(required=false) UUID agentId,@RequestParam(defaultValue="20") int limit) {
        UUID agent=selected(agentId);if(agent==null) return List.of();
        return db.queryForList("select payload from ai_usage_snapshots where agent_id=? order by observed_at desc,sequence desc limit ?",agent,Math.clamp(limit,1,100)).stream().map(row->{
            var value=decode(row);return (Map<String,Object>)json.convertValue(value,Map.class);
        }).toList();
    }
    @PostMapping("/api/v2/usage/refresh") @Transactional ResponseEntity<Map<String,Object>> refresh(@RequestParam(required=false) UUID agentId) {
        UUID agent=selected(agentId);if(agent==null) throw new ResponseStatusException(HttpStatus.CONFLICT,"No registered local agent");
        var changed=db.queryForList("insert into usage_refresh_requests(agent_id) values (?) on conflict(agent_id) do update set requested_at=now() where usage_refresh_requests.requested_at<now()-interval '30 seconds' returning agent_id",agent);
        if(changed.isEmpty()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Refresh is limited to once per agent per 30 seconds");
        return ResponseEntity.accepted().body(Map.of("status","QUEUED","agentId",agent,"timeoutSeconds",45));
    }
}

package com.creatorflow;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
class AgentApi {
    enum Kind {GIT_FIXTURE,FFMPEG_FIXTURE,CAPABILITY_PROBE}
    enum Outcome {SUCCEEDED,FAILED,CANCELLED}
    record Register(@NotBlank @Pattern(regexp="[A-Za-z0-9 ._-]{1,80}") String name) {}
    record Session(@NotNull @Size(max=3) List<@NotNull String> capabilities) {}
    record SessionRequest(@NotNull UUID sessionId) {}
    record Attempt(@NotNull UUID sessionId,@Min(1) int attempt) {}
    record CreateTask(@NotNull UUID agentId,@NotNull Kind kind,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String idempotencyKey,
        @NotBlank @Pattern(regexp="[a-z0-9][a-z0-9_-]{0,47}") String worktreeKey,
        @Min(1) @Max(60) int timeoutSec,@Min(1) @Max(30) int durationSec) {}
    record Result(@Min(-1) @Max(255) int exitCode,
        @Pattern(regexp="[a-f0-9]{64}") String artifactSha256,@Min(0) Long bytes,
        @Pattern(regexp="[a-f0-9]{40,64}") String gitCommit,Boolean gitAvailable,Boolean ffmpegAvailable,
        @Pattern(regexp="TIMEOUT|CANCELLED|PROCESS_FAILED|WORKTREE_BUSY|LEASE_LOST|TOOL_UNAVAILABLE|AGENT_ERROR") String errorCode) {}
    record Completion(@NotNull UUID sessionId,@Min(1) int attempt,@NotNull Outcome state,@NotNull @Valid Result result) {}
    private final AgentQueue queue;
    private final JdbcTemplate db;
    AgentApi(AgentQueue queue,JdbcTemplate db) {this.queue=queue;this.db=db;}
    private UUID identity(Authentication auth) {return (UUID)auth.getPrincipal();}
    @GetMapping("/api/v2/agents") List<Map<String,Object>> agents() {return queue.agents();}
    @GetMapping("/api/v2/agent-tasks") List<Map<String,Object>> tasks() {return queue.tasks();}
    @GetMapping("/api/v2/agent-tasks/{id}") Map<String,Object> task(@PathVariable UUID id) {return queue.task(id);}
    @GetMapping("/api/v2/agent-tasks/{id}/events") List<Map<String,Object>> events(@PathVariable UUID id) {
        queue.task(id);return db.queryForList("select id,attempt,type,created_at as \"createdAt\" from agent_task_events where task_id=? order by id",id);
    }
    @PostMapping("/api/v2/agent-tasks") Map<String,Object> create(@Valid @RequestBody CreateTask request) {return queue.enqueue(request);}
    @PostMapping("/api/v2/agent-tasks/{id}/cancel") Map<String,Object> cancel(@PathVariable UUID id) {return queue.cancel(id);}
    @PostMapping("/api/v2/agent-runtime/register") Map<String,Object> register(@Valid @RequestBody Register request) {return queue.register(request.name());}
    @PostMapping("/api/v2/agent-runtime/session") Map<String,Object> session(Authentication auth,@Valid @RequestBody Session request) {return queue.session(identity(auth),request.capabilities());}
    @PostMapping("/api/v2/agent-runtime/heartbeat") Map<String,Object> heartbeat(Authentication auth,@Valid @RequestBody SessionRequest request) {
        queue.heartbeat(identity(auth),request.sessionId());return Map.of("status","OK");
    }
    @PostMapping("/api/v2/agent-runtime/claim") Map<String,Object> claim(Authentication auth,@Valid @RequestBody SessionRequest request) {
        var task=queue.claim(identity(auth),request.sessionId());return task==null?Map.of():task;
    }
    @PostMapping("/api/v2/agent-runtime/tasks/{id}/renew") Map<String,Object> renew(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Attempt request) {
        return queue.renew(identity(auth),request.sessionId(),id,request.attempt());
    }
    @PostMapping("/api/v2/agent-runtime/tasks/{id}/result") Map<String,Object> finish(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Completion request) {
        return queue.finish(identity(auth),request.sessionId(),id,request);
    }
}

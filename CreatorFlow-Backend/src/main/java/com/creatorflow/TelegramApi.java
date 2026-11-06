package com.creatorflow;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/telegram")
class TelegramApi {
    record Bot(@Pattern(regexp="[a-z0-9_-]{1,48}") @NotNull String identity,@Positive long botId,
        @NotNull @Pattern(regexp="TELEGRAM_[A-Z0-9_]*TOKEN") String tokenEnv) {}
    enum Group {CODE,CONTENT,VIDEO}
    enum Role {READER,OPERATOR,ADMIN}
    record Operator(@Positive long userId,@NotNull Role role) {}
    record Route(@NotBlank String botIdentity,long chatId,@NotNull Group kind,boolean canControl,boolean canApprove,
        @NotNull @Size(min=1,max=20) List<@Valid Operator> operators) {}
    final JdbcTemplate db;
    final TelegramRuntime runtime;
    final TelegramClient client;
    TelegramApi(JdbcTemplate db,TelegramRuntime runtime,TelegramClient client) {this.db=db;this.runtime=runtime;this.client=client;}
    @GetMapping Map<String,Object> status() {
        var bots=db.queryForList("select identity,bot_id as \"botId\",token_env,next_offset as \"nextOffset\",availability,last_poll_at as \"lastPollAt\",last_successful_send_at as \"lastSuccessfulSendAt\",error_code as \"errorCode\" from telegram_bots order by identity");
        for(var bot:bots) {bot.put("configured",client.configured((String)bot.remove("token_env")));}
        return Map.of("state",!runtime.enabled?"DISABLED":bots.isEmpty() || bots.stream().noneMatch(b->Boolean.TRUE.equals(b.get("configured")))?"NOT_CONFIGURED":"ENABLED",
            "botToBot","IGNORED_INTERNAL_COORDINATION","bots",bots,
            "routes",db.queryForList("select bot_identity as \"botIdentity\",chat_id::text as \"chatId\",kind,can_control as \"canControl\",can_approve as \"canApprove\" from telegram_routes order by bot_identity,chat_id"),
            "operators",db.queryForList("select bot_identity as \"botIdentity\",chat_id::text as \"chatId\",user_id::text as \"userId\",role from telegram_operators order by bot_identity,chat_id,user_id"),
            "outbox",db.queryForList("select state,count(*) as count from telegram_outbox group by state order by state"),
            "errors",db.queryForList("select id,ref_type as \"refType\",ref_id as \"refId\",state,error_code as \"errorCode\",attempts from telegram_outbox where state in ('UNKNOWN','DEAD_LETTER') order by created_at desc limit 30"));
    }
    @PostMapping("/bots") @Transactional Map<String,Object> bot(@Valid @RequestBody Bot input) {
        db.update("insert into telegram_bots(identity,bot_id,token_env) values (?,?,?) on conflict(identity) do nothing",input.identity(),input.botId(),input.tokenEnv());
        var row=db.queryForMap("select bot_id,token_env from telegram_bots where identity=?",input.identity());
        if(((Number)row.get("bot_id")).longValue()!=input.botId() || !input.tokenEnv().equals(row.get("token_env"))) throw AgentQueue.conflict("Bot identity is immutable; register a new identity");
        return Map.of("identity",input.identity(),"configured",client.configured(input.tokenEnv()));
    }
    @PutMapping("/routes") @Transactional Map<String,Object> route(@Valid @RequestBody Route input) {
        if(input.chatId()==0 || input.canControl() && input.kind()!=Group.CODE) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid group permissions");
        if(input.operators().stream().map(Operator::userId).distinct().count()!=input.operators().size()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Duplicate operator");
        db.update("insert into telegram_routes(bot_identity,chat_id,kind,can_control,can_approve) values (?,?,?,?,?) on conflict(bot_identity,chat_id) do update set kind=excluded.kind,can_control=excluded.can_control,can_approve=excluded.can_approve",input.botIdentity(),input.chatId(),input.kind().name(),input.canControl(),input.canApprove());
        // Preserve approval bindings; omitted identities lose authority rather than deleting audit references.
        db.update("update telegram_operators set role='REVOKED' where bot_identity=? and chat_id=?",input.botIdentity(),input.chatId());
        for(var o:input.operators()) db.update("insert into telegram_operators(bot_identity,chat_id,user_id,role) values (?,?,?,?) on conflict(bot_identity,chat_id,user_id) do update set role=excluded.role",input.botIdentity(),input.chatId(),o.userId(),o.role().name());
        return Map.of("registered",true);
    }
    @PostMapping("/routing-test") Map<String,Object> routingTest() {
        return Map.of("delivery","NOT_SENT","routes",db.queryForList("select r.bot_identity as \"botIdentity\",r.chat_id::text as \"chatId\",r.kind,count(o.user_id) as operators from telegram_routes r left join telegram_operators o using(bot_identity,chat_id) group by r.bot_identity,r.chat_id,r.kind order by r.kind"));
    }
}

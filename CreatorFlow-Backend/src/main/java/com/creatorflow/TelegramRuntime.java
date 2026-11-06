package com.creatorflow;

import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class TelegramRuntime {
    final JdbcTemplate db;
    final TelegramStore store;
    final TelegramClient client;
    final TransactionTemplate tx;
    final boolean enabled;
    // Long polling must never block the scheduler responsible for agent lease recovery.
    final ExecutorService workers=Executors.newFixedThreadPool(2,r->{var t=new Thread(r,"telegram-adapter");t.setDaemon(true);return t;});
    final AtomicBoolean polling=new AtomicBoolean(),sending=new AtomicBoolean();
    TelegramRuntime(JdbcTemplate db,TelegramStore store,TelegramClient client,PlatformTransactionManager manager,@Value("${TELEGRAM_ENABLED:false}") boolean enabled) {
        this.db=db;this.store=store;this.client=client;this.tx=new TransactionTemplate(manager);this.enabled=enabled;
    }
    @Scheduled(fixedDelay=1000) public void tick() {
        if(!enabled) return;
        if(polling.compareAndSet(false,true)) workers.submit(()->{try {pollOnce();} finally {polling.set(false);}});
        if(sending.compareAndSet(false,true)) workers.submit(()->{try {deliverOnce(false);} finally {sending.set(false);}});
    }
    Map<String,Object> pollClaim() {
        return tx.execute(s->{
            var rows=db.queryForList("select * from telegram_bots where next_poll_at<=now() and (poll_until is null or poll_until<=now()) order by next_poll_at,identity limit 1 for update skip locked");
            if(rows.isEmpty()) return null;var row=rows.getFirst();UUID lease=UUID.randomUUID();
            // Includes getMe, webhook discovery and one long poll, each bounded to 25 seconds.
            db.update("update telegram_bots set poll_lease=?,poll_until=now()+interval '90 seconds' where identity=?",lease,row.get("identity"));row.put("lease",lease);return row;
        });
    }
    void pollOnce() {
        var bot=pollClaim();if(bot==null) return;
        String identity=(String)bot.get("identity"),env=(String)bot.get("token_env");UUID lease=(UUID)bot.get("lease");
        var me=client.call(env,"getMe",Map.of());
        if(!me.ok()) {pollFailure(identity,lease,me.error(),me.retrySeconds());return;}
        if(!me.result().path("id").isIntegralNumber() || me.result().path("id").asLong()!=((Number)bot.get("bot_id")).longValue()) {pollFailure(identity,lease,"BOT_ID_MISMATCH",300);return;}
        var webhook=client.call(env,"getWebhookInfo",Map.of());
        if(!webhook.ok()) {pollFailure(identity,lease,webhook.error(),webhook.retrySeconds());return;}
        if(!webhook.result().has("url") || !webhook.result().path("url").asText().isEmpty()) {pollFailure(identity,lease,"WEBHOOK_ACTIVE_OR_UNKNOWN",300);return;}
        var updates=client.call(env,"getUpdates",Map.of("offset",bot.get("next_offset"),"timeout",20,"limit",100,"allowed_updates",List.of("message","callback_query")));
        if(!updates.ok()) {pollFailure(identity,lease,updates.error(),updates.retrySeconds());return;}
        try {store.accept(identity,lease,updates.result());}
        catch(Exception e) {pollFailure(identity,lease,"PROCESSING_FAILED",5);}
    }
    void pollFailure(String bot,UUID lease,String error,int retry) {
        db.update("update telegram_bots set availability=?,error_code=?,failures=least(failures+1,8),next_poll_at=now()+make_interval(secs=>greatest(?,least(300,power(2,least(failures+1,8))::int))),poll_lease=null,poll_until=null where identity=? and poll_lease=?",
            error.equals("NOT_CONFIGURED")?"NOT_CONFIGURED":"ERROR",error,retry,bot,lease);
    }
    void recoverSends() {
        // After a crash, the provider may have accepted the send. Never blindly resend an uncertain result.
        db.update("update telegram_outbox set state='UNKNOWN',error_code='CRASH_AFTER_SEND_POSSIBLE',lease_until=null where state='SENDING' and lease_until<=now()");
    }
    Map<String,Object> sendClaim() {
        return tx.execute(s->{
            recoverSends();
            // Bot row first: global 1 message/second/bot, stronger than the per-chat bound.
            var bots=db.queryForList("select b.identity,b.token_env from telegram_bots b where b.availability='AVAILABLE' and (b.last_send_at is null or b.last_send_at<now()-interval '1 second') and exists(select 1 from telegram_outbox o join telegram_routes r using(bot_identity,chat_id) where o.bot_identity=b.identity and o.state in ('PENDING','RETRY') and o.next_at<=now() and r.next_send_at<=now()) order by b.last_send_at nulls first limit 1 for update skip locked");
            if(bots.isEmpty()) return null;var bot=bots.getFirst();
            var rows=db.queryForList("select o.* from telegram_outbox o join telegram_routes r using(bot_identity,chat_id) where o.bot_identity=? and o.state in ('PENDING','RETRY') and o.next_at<=now() and r.next_send_at<=now() order by o.created_at,o.id limit 1 for update of o skip locked",bot.get("identity"));
            if(rows.isEmpty()) return null;var row=rows.getFirst();
            db.update("update telegram_outbox set state='SENDING',attempts=attempts+1,lease_until=now()+interval '35 seconds' where id=?",row.get("id"));
            db.update("update telegram_routes set next_send_at=now()+interval '3 seconds' where bot_identity=? and chat_id=?",row.get("bot_identity"),row.get("chat_id"));
            db.update("update telegram_bots set last_send_at=now() where identity=?",bot.get("identity"));row.put("token_env",bot.get("token_env"));return row;
        });
    }
    void deliverOnce(boolean simulateCrashAfterSend) {
        var row=sendClaim();if(row==null) return;
        var response=client.call((String)row.get("token_env"),"sendMessage",Map.of("chat_id",row.get("chat_id"),"text",row.get("body"),"link_preview_options",Map.of("is_disabled",true)));
        if(simulateCrashAfterSend && response.ok()) return; // Test seam: committed SENDING survives a process crash.
        tx.executeWithoutResult(s->{
            String state=response.ok()?"SENT":response.uncertain()?"UNKNOWN":response.permanent() || ((Number)row.get("attempts")).intValue()+1>=5?"DEAD_LETTER":"RETRY";
            int backoff=Math.max(response.retrySeconds(),Math.min(300,1<<Math.min(8,((Number)row.get("attempts")).intValue()+1)));
            db.update("update telegram_outbox set state=?,message_id=?,error_code=?,lease_until=null,next_at=now()+make_interval(secs=>?) where id=? and state='SENDING'",state,response.ok()?response.result().path("message_id").asLong():null,response.error(),backoff,row.get("id"));
            if(response.ok()) db.update("update telegram_bots set last_successful_send_at=now() where identity=?",row.get("bot_identity"));
        });
    }
    @PreDestroy void close() {workers.shutdownNow();}
}

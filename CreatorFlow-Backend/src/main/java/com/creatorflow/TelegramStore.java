package com.creatorflow;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Only trusted numeric identities, fixed commands and bounded, sanitized replies enter storage. */
@Service
class TelegramStore {
    final JdbcTemplate db;
    final TaskCycles cycles;
    final AgentQueue queue;
    final UsageApi usage;
    final ControlApprovals approvals;
    TelegramStore(JdbcTemplate db,TaskCycles cycles,AgentQueue queue,UsageApi usage,ControlApprovals approvals) {
        this.db=db;this.cycles=cycles;this.queue=queue;this.usage=usage;this.approvals=approvals;
    }
    static void enqueue(JdbcTemplate db,String bot,long chat,String key,String type,String ref,String body) {
        db.update("insert into telegram_outbox(id,bot_identity,chat_id,dedupe_key,ref_type,ref_id,body) values (?,?,?,?,?,?,?) on conflict(dedupe_key) do nothing",
            UUID.randomUUID(),bot,chat,key,type,ref,body.substring(0,Math.min(3500,body.length())));
    }
    @Transactional void accept(String bot,UUID lease,JsonNode updates) {
        if(!updates.isArray() || updates.size()>100) throw new IllegalArgumentException("Invalid update envelope");
        var bots=db.queryForList("select next_offset from telegram_bots where identity=? and poll_lease=? and poll_until>now() for update",bot,lease);
        if(bots.isEmpty()) throw AgentQueue.conflict("Poll lease fenced");
        long offset=((Number)bots.getFirst().get("next_offset")).longValue();
        var ordered=new ArrayList<JsonNode>();updates.forEach(ordered::add);
        for(var u:ordered) if(!u.path("update_id").isIntegralNumber() || !u.path("update_id").canConvertToLong() || u.path("update_id").asLong()<0 || u.path("update_id").asLong()==Long.MAX_VALUE) throw new IllegalArgumentException("Invalid update ID");
        ordered.sort(Comparator.comparingLong(u->u.path("update_id").asLong()));
        for(var update:ordered) {
            long id=update.path("update_id").asLong();
            if(db.update("insert into telegram_updates(bot_identity,update_id,outcome) values (?,?,'RECEIVED') on conflict do nothing",bot,id)==0) continue;
            String outcome=id<offset?"OLD_UPDATE":dispatch(bot,id,update);
            db.update("update telegram_updates set outcome=? where bot_identity=? and update_id=?",outcome,bot,id);
        }
        long next=ordered.stream().mapToLong(u->u.path("update_id").asLong()+1).max().orElse(offset);
        db.update("update telegram_bots set next_offset=greatest(next_offset,?),last_poll_at=now(),availability='AVAILABLE',error_code=null,failures=0,next_poll_at=now()+interval '1 second',poll_lease=null,poll_until=null where identity=? and poll_lease=?",next,bot,lease);
    }
    private String dispatch(String bot,long id,JsonNode update) {
        boolean callback=update.has("callback_query");
        var envelope=callback?update.path("callback_query"):update.path("message");
        var message=callback?envelope.path("message"):envelope;
        var sender=envelope.path("from");
        if(sender.path("is_bot").asBoolean(true)) return "IGNORED_BOT";
        if(!sender.path("id").isIntegralNumber() || !message.path("chat").path("id").isIntegralNumber()) return "INVALID_IDENTITY";
        long user=sender.path("id").asLong(),chat=message.path("chat").path("id").asLong();
        // Never use an edited message, channel post, anonymous sender or display name as authority.
        if(message.has("sender_chat")) return "INVALID_IDENTITY";
        var routes=db.queryForList("select r.kind,r.can_control,r.can_approve,o.role from telegram_routes r join telegram_operators o using(bot_identity,chat_id) where r.bot_identity=? and r.chat_id=? and o.user_id=? and o.role<>'REVOKED' for update of o",bot,chat,user);
        if(routes.isEmpty()) return "UNAUTHORIZED";
        int depth=0;for(var p=message;p.has("reply_to_message");p=p.path("reply_to_message")) if(++depth>3) return "DEPTH_LIMIT";
        if(db.update("update telegram_operators set last_command_at=now() where bot_identity=? and chat_id=? and user_id=? and (last_command_at is null or last_command_at<now()-interval '1 second')",bot,chat,user)==0) return "RATE_LIMITED";
        String text=callback?envelope.path("data").asText(""):message.path("text").asText("");
        if(text.length()>160) return "INVALID_COMMAND";
        String[] parts=text.trim().split("\\s+");
        if(callback) parts=text.split(":",-1);
        String command=parts[0];
        if(!callback) {
            // Explicit bot mentions must match the verified bot username; unmentioned group commands are supported.
            int mention=command.indexOf('@');
            if(mention>=0) return "MENTION_UNSUPPORTED";
            if(!command.startsWith("/")) return "IGNORED_TEXT";
            command=command.substring(1);
        } else if(!List.of("approve","reject").contains(command)) return "INVALID_CALLBACK";
        var route=routes.getFirst();boolean operator=List.of("OPERATOR","ADMIN").contains(route.get("role"));
        boolean mutation=List.of("pause","resume","cancel","approve","reject").contains(command);
        if(mutation && (!operator || !Boolean.TRUE.equals(route.get(List.of("approve","reject").contains(command)?"can_approve":"can_control")))) return "UNAUTHORIZED_MUTATION";
        if(List.of("pause","resume","cancel").contains(command) && !"CODE".equals(route.get("kind"))) return "WRONG_GROUP";
        String reply;
        try {
            boolean arg=List.of("cycle","pause","resume","cancel","approve","reject").contains(command);
            if(parts.length!=(arg?2:1)) return "INVALID_COMMAND";
            UUID target=arg?UUID.fromString(parts[1]):null;
            reply=switch(command) {
                case "help" -> "/help /status /agents /tasks /cycle <id> /usage /pause <id> /resume <id> /cancel <id> /approvals /approve <id> /reject <id>. Fixed fixtures only.";
                case "status" -> "Cycles: "+db.queryForList("select id,state from agent_cycles order by created_at desc limit 10");
                case "agents" -> "Agents: "+db.queryForList("select id,case when last_heartbeat_at>now()-interval '10 seconds' then 'ONLINE' else 'OFFLINE' end as status from local_agents order by id limit 10");
                case "tasks" -> "Tasks: "+db.queryForList("select id,kind,state from agent_tasks order by created_at desc limit 10");
                case "cycle" -> cycleText(cycles.read(target));
                case "pause","resume","cancel" -> cycleText(cycles.control(target,command));
                case "usage" -> quotaText(usage.codex(null));
                case "approvals" -> "Approvals: "+db.queryForList("select id,cycle_id,case when state='PENDING' and expires_at<=now() then 'EXPIRED' else state end as state from control_approvals where bot_identity=? and chat_id=? and required_operator=? order by expires_at desc limit 10",bot,chat,user);
                case "approve","reject" -> approvals.decide(target,command,bot,chat,user);
                default -> "Unsupported command. /help";
            };
        } catch(IllegalArgumentException e) {return "INVALID_COMMAND";}
        catch(ResponseStatusException e) {reply="Request rejected; state or authority does not permit this action.";}
        enqueue(db,bot,chat,"update:"+bot+":"+id,"UPDATE",Long.toString(id),"Update "+id+"\n"+reply);
        return "PROCESSED";
    }
    static String cycleText(Map<String,Object> cycle) {return "Cycle "+cycle.get("id")+": "+cycle.get("state")+"\nNodes: "+cycle.get("tasks");}
    static String quotaText(Map<String,Object> q) {
        return "CODEX_CLI agent="+q.get("agentId")+" source="+q.get("source")+" freshness="+q.get("freshness")+" lastSynced="+q.get("lastSynced")+"\n5h: "+windowText(q.get("fiveHour"))+"\nWeekly: "+windowText(q.get("weekly"));
    }
    static String windowText(Object value) {
        var w=(Map<?,?>)value;
        return "AVAILABLE".equals(w.get("status"))?"used="+w.get("usedPercent")+"% remaining="+w.get("remainingPercent")+"% reset="+(w.get("resetsAt")==null?"UNKNOWN":java.time.Instant.ofEpochSecond(((Number)w.get("resetsAt")).longValue()))+" warning="+w.get("warning"):String.valueOf(w.get("status"));
    }
}

package com.creatorflow;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@Service
class ControlApprovals {
    record Create(@NotNull UUID cycleId,@NotBlank String botIdentity,long chatId,@Positive long requiredOperator,@Min(1) @Max(60) int expiresMinutes) {}
    final JdbcTemplate db;
    ControlApprovals(JdbcTemplate db) {this.db=db;}
    @Transactional Map<String,Object> create(Create r) {
        if(db.queryForObject("select count(*) from telegram_operators o join telegram_routes r using(bot_identity,chat_id) where o.bot_identity=? and o.chat_id=? and o.user_id=? and o.role in ('ADMIN','OPERATOR') and r.can_approve",Integer.class,r.botIdentity(),r.chatId(),r.requiredOperator())!=1)
            throw AgentQueue.conflict("Approval operator is not authorized for this route");
        if(db.queryForObject("select count(*) from agent_cycles where id=?",Integer.class,r.cycleId())!=1) throw AgentQueue.conflict("Unknown fixture cycle");
        UUID id=UUID.randomUUID();
        db.update("insert into control_approvals(id,cycle_id,bot_identity,chat_id,required_operator,expires_at,evidence_ref) values (?,?,?,?,?,now()+make_interval(mins=>?),?)",id,r.cycleId(),r.botIdentity(),r.chatId(),r.requiredOperator(),r.expiresMinutes(),r.cycleId());
        TelegramStore.enqueue(db,r.botIdentity(),r.chatId(),"approval:"+id,"APPROVAL",id.toString(),"Fixture review approval "+id+" cycle "+r.cycleId()+". /approve "+id+" or /reject "+id+". No publication action.");
        return read(id);
    }
    Map<String,Object> read(UUID id) {return db.queryForMap("select * from control_approvals where id=?",id);}
    @Transactional List<Map<String,Object>> pending() {
        db.update("update control_approvals set state='EXPIRED' where state='PENDING' and expires_at<=now()");
        return db.queryForList("select * from control_approvals order by expires_at desc limit 100");
    }
    @Transactional(noRollbackFor=org.springframework.web.server.ResponseStatusException.class) String decide(UUID id,String action,String bot,long chat,long user) {
        if(!List.of("approve","reject").contains(action)) throw AgentQueue.conflict("Invalid approval action");
        var rows=db.queryForList("select * from control_approvals where id=? for update",id);
        if(rows.isEmpty()) throw AgentQueue.conflict("Approval not found");
        var a=rows.getFirst();
        if(!bot.equals(a.get("bot_identity")) || chat!=((Number)a.get("chat_id")).longValue() || user!=((Number)a.get("required_operator")).longValue()) throw AgentQueue.conflict("Approval binding mismatch");
        if(db.queryForObject("select count(*) from telegram_operators o join telegram_routes r using(bot_identity,chat_id) where o.bot_identity=? and o.chat_id=? and o.user_id=? and o.role in ('ADMIN','OPERATOR') and r.can_approve",Integer.class,bot,chat,user)!=1) throw AgentQueue.conflict("Approval authority revoked");
        if(!"PENDING".equals(a.get("state"))) return "Approval "+id+" already "+a.get("state")+"; no decision changed";
        if(db.queryForObject("select expires_at<=now() from control_approvals where id=?",Boolean.class,id)) {
            db.update("update control_approvals set state='EXPIRED' where id=?",id);return "Approval "+id+" EXPIRED";
        }
        String state=action.equals("approve")?"APPROVED":"REJECTED";
        db.update("update control_approvals set state=?,decision_actor=?,decision_at=now() where id=?",state,user,id);
        // Fixture review records a decision only. It cannot dispatch a publishing or shell task.
        return "Approval "+id+" "+state+" (fixture review only)";
    }
}

@RestController
@RequestMapping("/api/v2/telegram/approvals")
class ControlApprovalApi {
    final ControlApprovals approvals;
    ControlApprovalApi(ControlApprovals approvals) {this.approvals=approvals;}
    @GetMapping List<Map<String,Object>> list() {return approvals.pending();}
    @PostMapping Map<String,Object> create(@Valid @RequestBody ControlApprovals.Create input) {return approvals.create(input);}
}

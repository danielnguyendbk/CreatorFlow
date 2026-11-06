package com.creatorflow;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v2/accounts")
class AccountApi {
    private final JdbcTemplate db;
    private final AccountDiscovery discovery;
    AccountApi(JdbcTemplate db, AccountDiscovery discovery) { this.db=db; this.discovery=discovery; }

    @GetMapping List<Map<String,Object>> list() {
        return db.queryForList("select provider, display_name as \"displayName\", installed, connection_status as status, "
            + "health_code as \"healthCode\", reconnect_capability as \"reconnectCapability\", switching_capability as \"switchingCapability\", "
            + "checked_at as \"checkedAt\" from provider_accounts order by provider");
    }

    @PostMapping("/refresh") List<Map<String,Object>> refresh() {
        for (var account : list()) {
            String provider=(String)account.get("provider");
            var health=discovery.inspect(provider);
            db.update("update provider_accounts set installed=?,connection_status=?,health_code=?,checked_at=now(),updated_at=now() where provider=?",
                health.installed(),health.status(),health.code(),provider);
        }
        return list();
    }

    private Map<String,Object> account(String provider) {
        return list().stream().filter(a->provider.equals(a.get("provider"))).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Unknown provider"));
    }

    @PostMapping("/{provider}/reconnect-intent") @Transactional Map<String,Object> reconnect(@PathVariable String provider) {
        var account=account(provider);
        if (!"SUPPORTED".equals(account.get("reconnectCapability")))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Official reconnect flow is unsupported for this provider; configure its API key in the backend environment");
        UUID id=UUID.randomUUID();
        db.update("insert into account_reconnect_intents(id,provider) values (?,?)",id,provider);
        boolean codex=provider.equals("CODEX_CLI");
        return Map.of("id",id,"provider",provider,"status","AWAITING_USER_OFFICIAL_FLOW",
            "command",codex ? "codex login" : "gemini",
            "instructions",codex ? "Run codex login in your local terminal and complete the official sign-in, then refresh health."
                : "Run gemini in your local terminal, select Login with Google (or /auth to reconnect), then refresh health. Gemini connection remains Unknown without an official noninteractive probe.",
            "documentationUrl",codex ? "https://learn.chatgpt.com/docs/cli/reference" : "https://geminicli.com/docs/get-started/authentication/");
    }

    @PostMapping("/{provider}/default") Map<String,Object> makeDefault(@PathVariable String provider) {
        account(provider);
        throw new ResponseStatusException(HttpStatus.CONFLICT,"Account switching/default selection is unsupported; no credentials or sessions were changed");
    }
}

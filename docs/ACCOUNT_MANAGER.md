# V2-P1-01 Account Manager

Implemented in the existing Spring Boot modular monolith and React routes. The four metadata slots are Codex CLI, Gemini CLI, Gemini API and OpenRouter API. A slot represents the official tool's active identity; CreatorFlow does not invent multiple CLI identities or manage credential profiles.

## Contract

All routes require the existing local bearer token.

- `GET /api/v2/accounts`: stored capability and health snapshots, with `checkedAt`; no process execution.
- `POST /api/v2/accounts/refresh`: bounded local CLI discovery, persisting metadata only.
- `POST /api/v2/accounts/{provider}/reconnect-intent`: persist `AWAITING_USER_OFFICIAL_FLOW` and return an allowlisted command and official documentation. The user completes sign-in in their terminal. This does not launch a process, log out, or imply connection success.
- `POST /api/v2/accounts/{provider}/default`: 409 for all current providers. No supported account switching contract was established, so no active identity is changed. Unknown providers return 404.

Flyway V8 creates `provider_accounts` and `account_reconnect_intents`. Neither accepts arbitrary user metadata or has credential/cache/password/cookie columns. CLI stdout/stderr are discarded, never parsed into account metadata or logged. Existing provider credentials remain environment controlled. No auth file is opened or copied by this feature.

## Capability and health evidence

On Windows, discovery resolves fixed `codex.cmd` and `gemini.cmd` application names through PowerShell without a profile, then runs `--version`. Each child has a ten-second deadline; its descendants are terminated on timeout. There are no user-supplied executable names or arguments. Other OSes use direct executable invocation.

Codex `login status` exit 0 yields `CONNECTED` with `LOCAL_LOGIN_PRESENT_NOT_LIVE_VERIFIED`; nonzero/timeout yields `UNKNOWN`. This checks local authentication presence, not provider reachability, expiry, quota or a paid API call. A failed local probe never fabricates `EXPIRED`.

Gemini CLI reports installation only; connection remains `UNKNOWN / NO_NONINTERACTIVE_AUTH_PROBE`. The official interactive flow is `gemini`, Login with Google, or `/auth` to reconnect. API provider health remains `UNKNOWN / LIVE_HEALTH_NOT_CHECKED`; CLI installation is not applicable. Reconnect is unsupported for the API slots; configure their keys in the backend environment. Default selection/switching is unsupported for every current slot.

The UI renders backend `CONNECTED`, `EXPIRED`, `UNSUPPORTED`, and `UNKNOWN` independently of installation. Expired rendering/persistence is integration-tested with a fixture; it was not observed from a live provider.

Official references checked 2026-11-06:

- [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference): `codex login`, `codex login status`.
- [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/): official Google sign-in.

## V2-P1-02 Windows Local Agent handoff

Implement a separate Windows process with its own scoped identity, heartbeat, leased tasks and bounded process execution. Keep the backend authoritative. Bind local transport to loopback; no public API/tunnel is needed. Validate capabilities on the agent host rather than assuming the backend and user terminal share PATH or identity. Account health today is explicitly backend-host evidence.

Persist task leases, attempt count and restart recovery before enabling terminal execution. Use fixed task kinds/argument schemas, a per-task workspace allowlist, and one writer per Git worktree. Test Git/FFmpeg fixtures, process timeout/descendant cleanup, expired leases, duplicate delivery and restart with actual local processes. Do not add auth-cache copying or session switching. Any future automatic official login launch needs a visible user interaction and must distinguish intent, process started and provider-confirmed completion.

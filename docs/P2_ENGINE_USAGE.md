# V2-P2 implementation and acceptance

Baseline: `origin/feat/v2-p1-local-agent` at `8c613212f0d730a5322d803d582dc95ff37d9178`. Branch: `feat/v2-p2-engine-usage`. Implemented in order: P2-01 dependency engine, P2-02 checkpoints/handoff, then P2-03 AI usage. Existing Account Manager and Local Agent were extended, not replaced. No Telegram, autonomous coding, live publishing, main merge, deployment or public API exposure.

## P2-01 dependency engine

Flyway V10 adds `agent_cycles`, dependency edges and delayed eligibility. `POST /api/v2/task-cycles` accepts a targeted agent, idempotency key and 1–20 named nodes using the existing fixed fixture kinds. Unknown dependencies, duplicate keys and cycles are rejected before insertion. The graph and tasks commit atomically; duplicate requests return the same cycle, changed input under the same key returns 409. `GET /api/v2/task-cycles/{id}` returns persisted node/dependency state.

Claim preserves agent session/attempt/lease checks, one writer and `SKIP LOCKED`, and now requires all parents SUCCEEDED and `not_before` reached. Terminal failed/cancelled parents propagate DEPENDENCY_FAILED to queued descendants, including after restart. PROCESS_FAILED retries have bounded backoff (2 then 4 seconds, at most three attempts); deterministic timeout/cancel remains terminal. Agent Monitoring can run a real Git -> FFmpeg -> capability dependency cycle and show progress. These are safe fixture execution nodes, not an autonomous Planner/Executor/Publisher implementation.

## P2-02 checkpoints and handoff

V11 adds immutable successful-artifact checkpoints per task/attempt, with the same authenticated owner/session/lease fencing. The agent saves a checkpoint before terminal result. On a recovered attempt it can reuse the previous Git/FFmpeg artifact only after verifying its SHA-256, and the Git ref when applicable; missing/corrupt output is rebuilt in an isolated attempt directory. Capability probes always run again.

Settled cycles generate a handoff transactionally from committed PostgreSQL rows. Export uses temporary files plus atomic replace and can rebuild missing files after backend restart. Runtime files are `storage/cycle-handoffs/<cycle-id>.json` and `storage/cycle-handoffs/latest.json` (configurable with `CREATORFLOW_CYCLE_HANDOFF_DIR`). They include task results, completed/incomplete tasks, fixture outcomes, blockers and next action. Schema: [schemas/cycle-handoff.schema.json](schemas/cycle-handoff.schema.json).

The runtime exporter intentionally does not overwrite the tracked repository navigation handoff `.creatorflow/handoffs/latest.json`: that file is updated by the implementation cycle after Git/tests are verified. Runtime fixture cycles have no verified CreatorFlow checkout branch/commit/files; those source-context fields remain null/empty with explicit NOT_PROVIDED provenance. Actual fixture Git commits remain in task evidence. No repository commit or Maven result is fabricated from a fixture success.

## P2-03 read-only Codex collector

Installed CLI checked this cycle: `codex-cli 0.162.1`. Public schema generation succeeded and declared `initialize`, `account/rateLimits/read`, `account/rateLimits/updated` and `account/usage/read`. Commands used:

```powershell
codex --version
codex app-server --help
codex app-server generate-json-schema --out storage/codex-protocol-0.162.1 --experimental
```

The collector resolves a native `codex.exe` or the standard official Windows npm package binary. Before reads, it checks the CLI version and version-specific generated public schema. It uses bounded stdio App Server processes in Windows Job Objects, sends initialize with client metadata, waits for its response, then sends initialized. Only schema-declared rate-limit/optional token-activity reads follow. Experimental API capability and explicit gateway OAuth (when declared) prevent assuming an unsupported protocol or starting automatic gateway login. Available rate-limit notifications update explicitly supplied fields without deleting omitted windows. A failed optional token-activity read does not erase a successful quota read.

Protocol reference cross-checked 2026-11-06: [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server). The installed CLI's generated schema, not a newer documentation example, determines method/field availability on this host.

There is no `codex exec`, thread/turn/inference request, UI scraping, automatic login/logout, account switch, email nudge, reset-credit consumption or redemption. CreatorFlow code never opens/copies auth.json, cookies, credential profiles or provider token caches. The official CLI owns its existing authentication resolution. CreatorFlow/DB credentials are removed from the App Server child environment. Raw protocol errors, account IDs/emails, prompts, tokens, reset-credit descriptions and arbitrary response fields are never uploaded, logged or saved as usage data.

Supported snapshot data: server-attached Agent ID/provider/source, collection and receipt times, CLI version, connection/error enums, duration/used percentage/reset for each returned window, optional reached flag, numeric credit balance/credit flags and optional token summary. Remaining percentage is `100 - usedPercent` only because the provider explicitly supplies a quota percentage. Token counts are separate activity metrics and never become a quota percentage.

Windows are matched by `windowDurationMins`: 300 means five hours; 10080 means seven days. Primary and secondary are not labels. A weekly-only response leaves five hours NOT_AVAILABLE. Null or missing windows/balances remain unavailable; no zero/full quota is invented. Unknown or duplicate-duration ambiguity does not create a fabricated window. Reset timestamps are Unix seconds; the UI converts them to the configured user timezone and shows a countdown without pretending quota refreshed when a reset time passes.

## Snapshot API and freshness

V12 adds `ai_usage_snapshots` and `usage_refresh_requests`. Snapshot ingestion is only under authenticated agent-runtime routes:

- `POST /api/v2/agent-runtime/usage/poll` checks current session and returns server sequence, default 180-second provider polling and pending refresh intent.
- `POST /api/v2/agent-runtime/usage/snapshot?sessionId=...` strictly checks allowlisted schema and attaches identity from the credential, never a supplied Agent ID. No arbitrary JSON, email, prompt, cookie or token field is accepted. Unknown nested fields and invalid numeric types/ranges are rejected.

Agent session fencing and per-agent row locking serialize ingestion. Snapshot UUID/sequence retransmission is idempotent only for identical data; collisions are rejected. Late observations can enter history but cannot replace newer observed data. Restart fetches the persisted sequence and reuses the agent's DPAPI identity. Freshness is recomputed from server time, observed time, failures and expired reset deadlines; no stored LIVE flag survives age/failure automatically.

Operator APIs, inaccessible to an agent credential:

- `GET /api/v2/usage`: Codex plus provider-adapter availability.
- `GET /api/v2/usage/codex?agentId=...`: current/last-good windows, CLI/source, timestamps, errors, freshness, thresholds and automation readiness.
- `GET /api/v2/usage/history?agentId=...&limit=20`: bounded observation history, maximum 100 rows.
- `POST /api/v2/usage/refresh?agentId=...`: HTTP 202 queues a read-only collection intent; it is not a provider mutation or a promise of fresh data. Requests are atomically limited to one per agent per 30 seconds; excess returns 429. Agent polls control state about every five seconds. Collector RPC deadline is 20 seconds, public version/schema commands are separately bounded, manual request deadline is 45 seconds.

Default provider polling is three minutes; UI polls stored backend data more frequently without calling Codex itself. No-data/no-auth/unsupported/missing-CLI/timeout reports are explicit, not successful zero-usage snapshots. After failure an earlier good value may remain visible only as STALE; with no good snapshot the status is UNKNOWN. Age beyond `CREATORFLOW_USAGE_STALE_SECONDS` (default 360, minimum 180), a passed reset, or manual refresh timeout also prevents LIVE.

`CREATORFLOW_USAGE_LOW_PERCENT` defaults to 20 and `CREATORFLOW_USAGE_CRITICAL_PERCENT` to 10; configuration must satisfy 0 <= critical < low <= 100. Remaining below these values gives LOW/CRITICAL; zero or a provider-reported reached limit gives EXHAUSTED. Future AI admission gets READY, WAIT_FOR_RESET or OPERATOR_REQUIRED; incomplete/stale data requires an operator decision. This is readiness data for future AI task types, not automatic account switching. Existing Git/FFmpeg/probe claims never depend on AI quota. `CREATORFLOW_USAGE_ENABLED=false` disables the collector; old snapshots age normally.

Gemini is UNSUPPORTED and OpenRouter UNKNOWN until separate official quota adapters are verified. Their states come from the backend. No token-to-quota conversion or speculative adapter was introduced.

## Frontend

`/ai-usage` is linked in the existing sidebar. It shows five-hour/weekly used and remaining percentages, accessible progress bars, warning level, reset time/countdown, last sync/last good, current agent/source/version, optional credits/token activity, manual refresh/cooldown/error state and persisted history. Account Manager has a compact backend-driven quota widget. The real API path has no demo success fallback.

## Actual acceptance, 2026-11-06

Environment: Windows, Python 3.13, JDK 25, Maven 3.9.12, PostgreSQL 18.3 at loopback 55432, FFmpeg 8.1.2. Acceptance backend/frontend remain loopback 8082/5174, using a separate test database and encrypted local agent identity. No credential value is recorded here.

Executed commands (environment set with DB URL/user and FFmpeg executable):

```powershell
# CreatorFlow-Backend
& D:/DevTools/apache-maven-3.9.12/bin/mvn.cmd '-Dmaven.repo.local=C:/Users/Admin/AppData/Local/codex-with-chatgpt/maven-repo-phase2b' package -q
# CreatorFlow-Agent
python -m unittest discover -v
# CreatorFlow-Frontend, VITE_API_BASE_URL=http://127.0.0.1:5174
npm run build
# Repository root, separate operator/agent enrollment environment
python CreatorFlow-Agent/smoke_e2e.py --root storage/agent-runtime-e2e --backend-pid <verified-acceptance-pid> --backend-jar storage/agent-backend.jar --cycle-id <actual-browser-cycle-id> --evidence storage/p2-e2e-evidence.json
```

- Maven package: 37 tests, zero failures/errors/skips. Includes DAG validation/duplicate/concurrent claim, cancellation propagation, backoff, fenced checkpoint restart/readback and immutable handoff generation; quota schema/privacy, role separation, manual refresh 429, duplicate/out-of-order snapshots, stale session, reset timestamps/expiry, configurable warnings and proof exhausted AI quota does not block Git fixtures. Flyway V1–V12 fresh isolated schema/upgrade/no-op regression passed.
- Python: ten tests passed, no skips. Six actual Windows Git/FFmpeg/DPAPI/lock/process/checkpoint tests; four collector fixture tests for both windows in reversed primary/secondary positions, weekly-only, no data, no login, missing CLI, unsupported protocol, timeout, notification merge, optional usage and secret exclusion. Fixture responses are MOCK_ONLY and do not establish live provider verification.
- Full process E2E passed: actual Git and FFmpeg, cancel/timeout/offline, agent/backend restarts, and a real crash after committing the Git checkpoint but before result. Attempt 2 restored the verified artifact and exact Git commit. The browser-created dependency cycle and handoff survived restart; quota history retained five snapshots and current connection/freshness was OK/LIVE in the recorded run.
- Playwright created Git -> FFmpeg -> probe from Agent Monitoring; all three became SUCCEEDED and its persisted handoff appeared. SQL confirmed three checkpoints and atomic export hash. Formal JSON Schema validation passed on the actual exported runtime handoff. Playwright AI Usage showed real 300/10080-minute quota windows, reset times and history from the authenticated agent; manual refresh produced a new real snapshot. Account Manager displayed the matching LIVE quota widget. Final successful browser run had zero console errors and one existing React Router warning; intentional backend shutdowns in earlier traces produced expected transient proxy failures.
- **LIVE_VERIFIED, scoped to this host/account/CLI version**: an actual installed Codex App Server returned both quota windows through the collector, the authenticated Local Agent uploaded them, PostgreSQL retained them, and Playwright rendered them. At the first browser sample, used percentages were 71% (five hours) and 41% (weekly); these are historical observations, not current quota promises. No fixture is used for this claim. No Gemini/OpenRouter quota, login mutation, account switch or inference/publishing was tested.

Ignored local evidence: `storage/p2-package.log`, `storage/p2-python-tests.log`, `storage/p2-frontend-build.log`, `storage/p2-e2e.log`, `storage/p2-e2e-evidence.json`, `storage/p2-usage-browser.txt`, `storage/p2-account-widget-browser.txt`, `storage/p2-cycle-browser-pass.txt`, `storage/cycle-handoffs/`, `.playwright-cli/`. Public protocol schemas and sanitized probe snapshots also remain under ignored storage.

Resolved environment/implementation limits: Windows sandbox denied Python temp-directory access, so process tests used approved execution without ACL changes. A relative schema-output path in the standalone live probe initially nested the output directory; collector roots are now absolute and live reads passed. Flyway warns PostgreSQL 18 is newer than its tested range; Vite retains the existing bundle-size warning. This release is local/single-operator, fixed fixture kinds plus read-only usage; service installation, arbitrary AI/coding workflows, retention/rotation UI and remote multi-user deployment remain future work.

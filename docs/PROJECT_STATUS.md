# CreatorFlow project status

Updated: 2026-11-06. Current branch: `feat/v2-p1-local-agent`, baseline `origin/feat/v2-p1-account-manager` at `05afbd6a479099afe10174b74f463084fc1ee682`. Current results below supersede prior cycle records.

## Current cycle: V2-P1-02 Windows Local Agent

- Identity/authentication: IMPLEMENTED, TESTED. Separate enrollment and per-agent runtime credential; backend stores hash/scope/revocation metadata, agent stores current-user DPAPI ciphertext. Browser credentials cannot register/claim; agent credentials cannot call browser/operator routes. Cross-agent spoofing/revocation and no-store enrollment response tested. No Account Manager implementation changes.
- Queue/V9: IMPLEMENTED, TESTED. Fresh V1-V9, targeted fixed-kind queue, atomic SKIP LOCKED claim, session/attempt/lease fencing, unique idempotency key, one active agent/worktree writer, transactional events, cancellation and bounded expired-lease recovery. Eight concurrent claims yielded one writer; stale attempts/sessions/results were rejected. Equivalent terminal result retransmission passed.
- Independent Windows process: IMPLEMENTED, TESTED. Real Git commit, synthetic FFmpeg MP4 and full decode, fixed capability probes, sanitized child environment, OS instance/worktree locks and suspended-child Windows Job Object assignment. Five Python tests passed, including real cross-process lock contention, timeout/cancel and child/grandchild cleanup on abrupt owner death.
- Recovery E2E: TESTED with actual independent backend/agent processes. Cancellation/timeout/offline/DPAPI identity reuse passed. Killing the agent and restarting the backend each interrupted a running FFmpeg task; both recovered at attempt 2. Old Git result persisted unchanged. Backend-unavailable renewal stops local execution; it never submits an unfenced success.
- Monitoring UI: IMPLEMENTED, TESTED. Playwright navigated Dashboard -> Agent Monitoring, created Git/FFmpeg/capability tasks and observed real results persisted in PostgreSQL. Git returned a commit and 34-byte artifact; FFmpeg returned a 1203-byte MP4/hash; capability flags were true. Cancelled a running 20-second FFmpeg task, observed OFFLINE after stopping the agent and ONLINE after restarting it. Successful browser console: zero errors, one existing React Router warning.
- Build: TESTED. Maven package 29 tests, zero failures/errors/skips; Python five tests, no skips; frontend TypeScript/Vite build passed. Flyway PostgreSQL 18 support-range and Vite bundle warnings remain. Separate fresh acceptance DB, backend/frontend on loopback 8082/5174; provider calls and real publishing disabled.

Implementation commits: `f381e1c` (identity/V9/queue/security/concurrency), `ac981b1` (Windows runtime/fixtures/process tests), `a046cd7` (Monitoring UI), `0fb4e81` (no-store credentials, accurate lease-loss logs, integer validation), `f21af0b` (wait for actual backend readiness). Full process E2E and Python tests passed again after the startup fix. Exact commands/evidence, protocol and limits: [LOCAL_AGENT.md](LOCAL_AGENT.md).

Git: feature branch implementation pushed and remote SHA matched local. Draft PR creation targeting `feat/v2-p1-account-manager` returned GitHub connector HTTP 403 `Resource not accessible by integration`; no PR exists. [Create PR manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p1-account-manager...feat/v2-p1-local-agent?expand=1). Final handoff documentation is committed/pushed separately.

Remaining scope: no Windows service installation/automatic startup, remote multi-user agents, credential rotation UI, artifact cleanup policy or arbitrary coding worktrees. Next: V2-P2-01/02 dependency engine/checkpoints/handoff generation. Telegram, autonomous coding and live publishing were not implemented or tested. No main merge, production deployment or public exposure.

## Previous cycle: P0 closeout and V2-P1-01

- V2-P0-06: IMPLEMENTED, TESTED for the remaining asset/settings browser mutations. Actual upload, content/scene selection, assignment, settings save/persistence and local voice test passed. Fixed assignment success being reported as failure after invalid auto-resume. Completed workflows no longer resume; missing voice produces a separate warning; a ready WAITING workflow became RUNNING in PostgreSQL. Deliberate Gemini-disabled/missing-voice HTTP errors were expected; final successful assignment browser run had zero console errors and one React Router future warning.
- V2-P0-07/08: IMPLEMENTED in baseline, TESTED this cycle. Maven package ran 25 tests, zero failures/errors/skips, including actual FFmpeg corrupt/valid media regressions and five AI reliability integration tests. Provider fixtures remain MOCK_ONLY.
- Video E2E: TESTED, actual 15.000000-second MP4, video/audio/subtitle, full FFmpeg decode exit 0, retry count 1 and cancellation CANCELLED. HTTP contract smoke passed 11 routes and auth/validation/storyboard/media using the matching current fixture.
- V2-P1-01: IMPLEMENTED, TESTED (local/fixture scope). Migration V8, authenticated Account API, metadata/capability snapshots, bounded Codex/Gemini CLI discovery, official reconnect intent and React sidebar/page. Database/API tests assert exact response allowlist, no secret/cache/password/cookie schema fields, authentication, persisted intents, expired fixture handling and 409 for unsupported default switching. Fresh V1-V8, upgrade/no-op migration regression, frontend TypeScript/Vite build passed. Bundle-size warning remains.
- Account browser smoke: TESTED. Refresh detected both CLIs installed. Codex reports CONNECTED from local `login status` exit 0, explicitly not live verified. Gemini remains UNKNOWN. Both official reconnect instructions rendered. Unsupported API reconnect/default switching remain unavailable. No auth-cache file was read or copied.
- Git: TESTED. Sandbox deny-write ACLs blocked ref locks; approved execution created/pushed the feature branch without ACL changes. Baseline remote matched; implementation remote SHA `ef51627484552ba803f9e65d0e73640b4d8b6513` matched local after push. Final handoff documentation is committed separately.
- Draft PR: BLOCKED. GitHub connector creation targeting `feat/v2-p0-media-ai` returned 403 `Resource not accessible by integration`; no PR exists. [Create PR manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p0-media-ai...feat/v2-p1-account-manager?expand=1).
- V2-P1-02 Windows Local Agent: DESIGNED, next implementation task; scoped identity, heartbeat, leased tasks, timeout/restart plan is in `ACCOUNT_MANAGER.md`.

Implementation commits: `bbe9123` (P0 browser fix/acceptance), `ef51627` (Account Manager/V8/tests). Exact commands, resolved environment failures and local evidence: [P0_ACCEPTANCE_20261106.md](P0_ACCEPTANCE_20261106.md). Capability limits and local-agent plan: [ACCOUNT_MANAGER.md](ACCOUNT_MANAGER.md).

Limits: JDK 25 and PostgreSQL 18.3 used; Flyway warns PostgreSQL 18 is newer than its tested range. No live Gemini/OpenRouter, OAuth completion, Telegram, social publication, main merge, deployment or public exposure. Reconnect is an intent awaiting user completion in the official terminal flow. Historical conflicting publication IDs remain quarantined for operator reconciliation before live publishing.

## Historical records (superseded by current results above)

## V2 P0 reliability cycle, 2026-11-05

| Task | Status | Actual evidence and limits |
| --- | --- | --- |
| V2-P0-04 historical reconciliation | IMPLEMENTED, TESTED | Flyway V5 succeeded on a fresh PostgreSQL database, on existing duplicate `FAILED/SCHEDULED` data, and on a fixture with two different post IDs. `PublicationMigrationIntegrationTest` migrated V1–V4 then V5 in an isolated schema, reran V5 (0 migrations), validated schema history, retained both post IDs and required manual reconciliation. API retry of both conflicting rows returned 409. No rows were deleted. |
| V2-P0-05 publication recovery | IMPLEMENTED, TESTED (local/mock only) | Mock YouTube tests distinguish HTTP 503 and actual HTTP timeout before video PUT from those after PUT; restart integration quarantines `PUBLISHING` without post ID and rejects retry. `failure_category` persists in PostgreSQL. Existing confirmation mock passed. No real YouTube request was sent. |
| V2-P0-06 frontend/API | IMPLEMENTED, TESTED (route/HTTP scope) | All nine clients mapped in `FRONTEND_API_CONTRACT.md`; real asset assignment hook fixed. `smoke-contract.ps1` passed 11 list/settings routes, auth, validation, storyboard and authenticated MP4 download. Vite real-mode proxy returned 200 for dashboard, settings and media. Playwright visited all 12 existing route patterns with 0 console errors; dashboard loaded the database count. Full click-through mutation coverage remains open. |
| Backend tests | TESTED | `mvn test -q` with local PostgreSQL 18.3 after timeout regression: 13 tests, 0 failures, 0 errors; `mvn package -q` passed before the timeout-only follow-up. Flyway warns PostgreSQL 18.3 is newer than its tested version. |
| Frontend build | TESTED | `VITE_API_BASE_URL=http://127.0.0.1:5173 npm run build` passed TypeScript and Vite. First sandbox attempt failed `spawn EPERM`; rerun with process permission passed. Bundle-size warning remains. |
| Media E2E/restart | TESTED | `smoke-e2e.ps1` created a 15-second MP4 with video/audio/subtitle, render retry/cancel ended `CANCELLED`. After backend restart, render was `SUCCESS`, workflow `COMPLETED`, publication `FAILED` with no post ID and category `NOT_CONFIGURED`. |
| Live Gemini/YouTube/TikTok/Instagram/Facebook | NOT_CONFIGURED | No provider credentials or live publication authorization; local adapter mocks are not live evidence. |

Current gaps: the current identity model is a local shared bearer token; remote exposure is not ready. The frontend direct media URL relies on the local Vite proxy for browser authentication. `assetApi.updateSceneAssetStatus()` is an unused demo helper and now throws in real mode. Historical conflicts require operator investigation before clearing the flag. A full browser click-through of mutation controls remains open. No real social upload, production deployment or `main` merge occurred.

Implementation commits: `e085518` (migration), `d0f8def` (recovery), `b1aaf9b` (frontend/contract), `88c8c54` (timeout regression). Handoff documentation commits follow those changes.

Branch `feat/v2-p0-reliability` was pushed to `origin`. Draft PR creation targeting `feat/v2-p0-hardening` was attempted through the GitHub connector and returned HTTP 403 `Resource not accessible by integration`; no PR exists. Manual PR URL: https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p0-hardening...feat/v2-p0-reliability?expand=1

Follow-up regression: `YouTubePublisherTest.timeoutBeforeAndAfterVideoPutHasDifferentRecoveryClass` used 80 ms client timeouts and a local HTTP server. The before-PUT timeout was classified as certain no video upload; the after-PUT timeout as unknown, with exactly one PUT. Full Maven suite passed 13/13 afterward.

## Verified this cycle

| Area | Status | Evidence |
| --- | --- | --- |
| V1 Java/API | TESTED | `mvn test` with `CREATORFLOW_TEST_DB_URL` on local PostgreSQL: 9 tests, 0 failures/errors. Includes two new publication idempotency tests and one new Spring HTTP security test. |
| Frontend build | TESTED | `npm run build`: TypeScript and Vite succeeded; bundle size warning remains. Real-mode API paths were compared with Spring mappings in source, but every UI interaction was not rerun this cycle. |
| Flyway fresh install | TESTED | New `creatorflow_migration_audit_20261105` database, backend readiness `UP`, V1–V4 all `success=true`. Existing test DB also reports V1–V4 successful. PostgreSQL 18 is newer than Flyway's logged tested version. |
| Authentication/validation | TESTED | HTTP integration: GET/POST `/api/ideas` without token 401, wrong token 401, malformed authorized create 400, readiness 200. Manual malformed idea/storyboard/publication requests each returned 400. This is a local single-user token, not production multi-user authorization. |
| Video E2E | TESTED | `scripts/smoke-e2e.ps1` against local backend: 15-second MP4 with video/audio/subtitle, FFmpeg decode exit 0; corrupt MP4 fixture caused actual render failure, retry count 1 and cancel `CANCELLED`. Evidence: ignored `storage/e2e-evidence-v2-p0.json` and `storage/e2e-output.mp4`. |
| Persistence | TESTED | Backend restarted; latest E2E render remained `SUCCESS`, retry/cancel job `CANCELLED`, workflow `COMPLETED`, publication `FAILED` with empty post ID, readiness `UP`. |
| Publication idempotency | IMPLEMENTED, TESTED | Before fix, rescheduling a failed YouTube target created a second job. `PublicationApi` now serializes content/platform operations and reuses an existing job; retry checks for another active job. Two PostgreSQL regression tests and fresh E2E passed. |
| YouTube OAuth/upload | IMPLEMENTED, MOCK_ONLY | Existing token encryption and upload/confirmation tests use a local mock server. No real platform credentials or approved upload were used. |
| Gemini/OpenRouter | IMPLEMENTED, NOT_CONFIGURED | Provider calls remain disabled without explicit opt-in and credentials. No live Gemini/OpenRouter test this cycle. |
| Docker | BLOCKED | Docker Desktop Linux engine pipe absent. Isolated local PostgreSQL on `127.0.0.1:55432` supplied the database tests. |
| V2 account manager, local agent, workflow task engine, Telegram, autonomous coding | DESIGNED | Architecture and dependency plan written; no V2 runtime components claimed. |
| Draft PR | BLOCKED | GitHub connector returned HTTP 403 `Resource not accessible by integration` when creating a draft PR targeting `feat/backend-v1`. Both commits were pushed to `origin/feat/v2-p0-hardening`; no PR was created. |

## Confirmed gaps and production readiness

1. Authentication is one bearer token for all local operations. There is no user/role model, tenant boundary or separate agent identity. Vite development proxy injects that token and must stay local.
2. Historical duplicate publication rows may already exist from the prior bug. The P0 fix prevents new duplicates through the API but does not delete or merge old rows. Reconcile targets before enabling live publishing.
3. Publication scheduler catches exceptions without durable error classification on every path. An ambiguous upload with `PUBLISHING` and no post ID requires operator reconciliation; blind retry would be unsafe.
4. AI generation is synchronous; bounded backoff, checkpoint recovery and malformed storyboard response accounting are incomplete. Provider secrets and live quotas were not available to test.
5. Uploaded media is signature checked, but a signature-valid corrupt MP4 can pass upload and fail FFmpeg later. Decode/probe validation is a later hardening task.
6. TikTok, Instagram and Facebook OAuth/upload adapters are absent. YouTube live posting remains disabled. No public post, production deploy or `main` merge occurred.
7. V2 features are design only. CLI multi-account/session switching and Antigravity automation have not been proven supported on this host.
8. Draft PR creation needs GitHub App pull-request write permission or a user-created PR from the pushed branch. The local `gh` CLI is unavailable; no alternate credential was extracted.

## Changed files in this cycle

`AGENTS.md`; `docs/MASTER_PLAN.md`; `docs/ARCHITECTURE.md`; `CreatorFlow-Backend/src/main/java/com/creatorflow/PublicationApi.java`; `CreatorFlow-Backend/src/test/java/com/creatorflow/PublicationIdempotencyIntegrationTest.java`; `CreatorFlow-Backend/src/test/java/com/creatorflow/ApiSecurityIntegrationTest.java`; `CreatorFlow-Backend/scripts/smoke-e2e.ps1`; this status file, `docs/NEXT_TASKS.md` and `.creatorflow/handoffs/latest.json`.

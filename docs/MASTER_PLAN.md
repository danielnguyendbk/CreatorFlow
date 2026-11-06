# CreatorFlow V2 master plan

Current update 2026-11-06: branch `feat/v2-p2-engine-usage`, verified baseline `8c61321`. P2-01 and P2-02 were preserved/implemented before P2-03. See PROJECT_STATUS.md, P2_ENGINE_USAGE.md and the latest handoff for current scoped acceptance. The original V1 audit below is historical.

Updated: 2026-11-05. Source baseline: `origin/feat/backend-v1` at `a7c1f06`. Implementation branch: `feat/v2-p0-hardening`. This plan is based on the checked Spring controllers, Flyway V1–V4, six existing Maven tests, frontend API clients and domain types. Read `PROJECT_STATUS.md` and `.creatorflow/handoffs/latest.json` for subsequent results; recheck Git and runtime before acting.

## Verified V1 baseline

- The Spring Boot 3.3.4 backend uses PostgreSQL, Flyway and `JdbcTemplate`. Data JPA is on the classpath, but no JPA repositories were found. `ddl-auto=validate` does not create schema.
- The frontend has nine API clients with HTTP paths in real mode and demo paths without `VITE_API_BASE_URL`. Vite's development proxy injects a local bearer token. This is not a production user identity system.
- Gemini and OpenRouter are guarded by `CREATORFLOW_ALLOW_PROVIDER_CALLS`; local Windows TTS and FFmpeg create actual artifacts. The render worker and YouTube publication scheduler run inside the Spring process.
- YouTube OAuth encrypts the refresh token. TikTok, Instagram and Facebook return `NOT_CONFIGURED`; their publishing adapters are not implemented.
- Audit on 2026-11-05: Maven 6 tests passed against local PostgreSQL; frontend build passed; Flyway V1–V4 succeeded; the existing 15-second MP4 decoded with video, audio and subtitle streams. Docker daemon was unavailable. A new smoke run is required after each relevant code change.

## Task order and gates

| ID | Priority | Dependency | Acceptance criteria and test | Definition of Done |
| --- | --- | --- | --- | --- |
| V2-P0-01 Publication idempotency | P0 | V1 schema/API | Scheduling the same content/platform after `FAILED` returns the existing job; retry cannot create a second platform upload. PostgreSQL integration regression and API smoke pass. | Controller fix, database serialization and tests pass; no pre-existing data lost. |
| V2-P0-02 Authentication and API contract | P0 | V2-P0-01 | 401 without token, no write through public endpoints, frontend real paths match controllers, validation gives 4xx. Run integration/API tests. | Findings fixed or recorded with a concrete blocker; no UI layout changes. |
| V2-P0-03 Worker and media recovery | P0 | V2-P0-01 | Render cancel/retry/restart and publication scheduler transitions remain idempotent; MP4 15–30 seconds has decodable audio/subtitles. Run E2E and restart check. | New smoke evidence and regression tests recorded. |
| V2-P1-01 AI account inventory | P1 | P0 auth boundary | Dashboard lists account metadata, provider, capability, last check and connection state without secrets. Test encryption and permission checks. | No plaintext credential; only officially supported login/reconnect path is offered. |
| V2-P1-02 Windows local agent | P1 | V2-P1-01 | Agent registers, heartbeats, leases one task, reports logs/artifacts, and recovers after restart. CLI availability is probed per host. | Contract, durable lease and a Windows integration test pass. |
| V2-P2-01 Dependency task engine | P1 | V2-P1-02 | Planner/Executor/Reviewer/Publisher tasks wait for dependencies, checkpoint state, retry with backoff and enforce one Git worktree writer. | PostgreSQL integration test covers crash, duplicate delivery and lock expiry. |
| V2-P2-02 Persistent handoff | P1 | V2-P2-01 | Atomic committed-state runtime per-cycle/latest handoffs, checkpoint/results/blockers/next action. Keep tracked `.creatorflow/handoffs/latest.json` under the Git implementation writer; unverified repository metadata stays unknown. | Schema validation, checkpoint crash/reuse and restart/readback pass. |
| V2-P2-03 AI usage/quota | P1 | V2-P2-01 and V2-P2-02 | Initialized read-only Codex App Server collector, secret-free authenticated snapshots, history/freshness/refresh, duration-based windows, warnings/readiness and backend-driven UI/widget. No inference/login/switching. | Both/weekly-only/no-data/no-auth/missing/unsupported/timeout/ordering/security/restart tests, Maven/Python/build and actual-agent Playwright; LIVE_VERIFIED requires real account evidence. |
| V2-P3-01 Telegram control surface | P2 | V2-P2-01 | CODE, CONTENT and VIDEO groups map to authenticated commands/events; duplicate updates are idempotent; approval and pause/resume persist in PostgreSQL. | Mock Bot API tests pass; live bot remains `NOT_CONFIGURED` without token/group IDs. |
| V2-P4-01 Content/publishing completion | P2 | P0 and V2-P2-01 | Topic-to-MP4 pipeline preserves real artifacts; YouTube path stays guarded. TikTok uses approved official API, creator consent and confirmed platform result. | Provider mock tests and platform approval gate pass; live publish is separately authorized. |
| V2-P5-01 Autonomous coding | P3 | V2-P2-01 and V2-P2-02 | Planner creates a task, coding agent writes isolated worktree, reviewer and tests gate a draft PR; no automatic merge/deploy. | Local fixture run creates reviewable PR draft; failure leaves checkpoint. |
| V2-P5-02 Five-hour scheduler | P3 | V2-P5-01 | Configured scheduler may start a cycle every five hours only while agent online and budget/approval gates pass. | Virtual-clock and restart tests prove no overlapping cycles. |

## Phase sequence

1. Audit/harden V1 (V2-P0-01 through 03). Freeze current frontend contracts before V2 schema/API additions.
2. Add account metadata and Windows local agent; no CLI session switching without a documented supported mechanism.
3. Add dependency queue (P2-01), checkpoints/handoff (P2-02), then read-only usage (P2-03). Preserve the order; if a session budget prevents continuing, push tested milestones and leave unfinished usage work NEXT.
4. Add Telegram as a control/notification adapter over durable events, not as the task database.
5. Extend content and publishing only behind provider grants and explicit per-post approval.
6. Add autonomous coding and optional five-hour schedule after isolation, review and test gates are proven.

## Progress recorded 2026-11-05

`V2-P0-01` is implemented and tested on local PostgreSQL: repeated and concurrent schedule operations reuse one job; retry refuses a second active target. `V2-P0-02` has a tested local authentication/validation boundary, but the full frontend contract matrix and production identity model remain open. `V2-P0-03` has a fresh MP4 smoke run and restart check; worker lease and scheduler failure recovery remain open. See `PROJECT_STATUS.md` for exact test evidence and `NEXT_TASKS.md` for the next dependency-ordered tasks.

## Non-negotiable boundaries

- The backend remains a modular monolith; PostgreSQL is the source of truth. No Redis, broker or Kubernetes requirement is introduced for V2 P0.
- External CLI processes run only in a Windows local agent with bounded arguments, working directory, timeout and log redaction. Each writer receives a distinct Git worktree.
- Account inventory stores metadata and encrypted provider tokens only where official APIs permit. Codex/Gemini/Antigravity capability and authentication support are discovered per installed version; no undocumented profile switching.
- Publication requires an approved content artifact, approved account scopes and a platform confirmation. No production deploy, public post or merge to `main` is implied by this plan.

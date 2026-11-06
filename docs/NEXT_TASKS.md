# CreatorFlow next tasks

Updated: 2026-11-06. Current branch `feat/v2-p2-engine-usage`, baseline `8c61321`. Implemented in order: P2-01 dependency engine -> P2-02 checkpoints/handoff -> P2-03 usage monitoring. All three have actual scoped acceptance in [P2_ENGINE_USAGE.md](P2_ENGINE_USAGE.md). Read AGENTS.md/latest handoff and verify Git/remote/runtime before another cycle.

## P2 completion and next boundary

1. P2-01 IMPLEMENTED/TESTED: preserve V10 DAG validation, idempotency, dependency failure propagation, retry/backoff and writer/fencing rules; do not replace with a quota-only queue.
2. P2-02 IMPLEMENTED/TESTED: preserve V11 fenced checkpoints and committed-state atomic runtime per-cycle/latest handoffs. Repository navigation is separately Git/test verified; unknown source metadata stays unknown.
3. P2-03 IMPLEMENTED/TESTED: V12, initialized read-only Codex collector, private authenticated snapshots, usage/history/refresh API, AI Usage UI and Account Manager widget. This host's 0.162.1 account was LIVE_VERIFIED through actual agent/backend/browser evidence, never fixtures. Windows use duration 300/10080; weekly-only means five-hour NOT_AVAILABLE.
4. Future AI tasks must consume WAIT_FOR_RESET/OPERATOR_REQUIRED for exhausted/incomplete/stale quota. Keep Git/FFmpeg/probe tasks independent, configurable thresholds, three-minute polling, manual cooldown/deadline, schema privacy and no account switching.
5. Operator review is next. Gemini/OpenRouter adapters require official quota/limit verification; never derive percentages from token counts. Retention, credential lifecycle and real AI executors need explicit contracts/acceptance. The broader next planned phase remains P3-01, but Telegram/autonomous coding/live publication were not implemented or authorized for this completed cycle.

Acceptance: Maven 37 tests, Python ten tests, frontend build, actual checkpoint/agent/backend restart and live Codex/Playwright. Final Git/PR confirmation/manual URL are in `.creatorflow/handoffs/latest.json`. If a future session budget prevents continuation, push only tested milestones and mark remaining work NEXT; do not skip P2-01/02 or fabricate completion.

P2 implementation branch is pushed/remote verified. Draft PR creation returned GitHub connector 403; no PR exists. [Create PR manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p1-local-agent...feat/v2-p2-engine-usage?expand=1).

## Previous cycle plan: V2-P2-01 / V2-P2-02 (completed and preserved)

1. Create a clean feature branch from the verified remote local-agent head. Preserve the existing V1/Account Manager/Monitoring routes and separate browser versus agent authentication.
2. Implement PostgreSQL dependency tasks and durable checkpoints over the existing session/attempt/lease queue. Initially use the three existing safe fixture kinds; do not introduce arbitrary shell, Telegram, autonomous coding or live publication.
3. Persist checkpoint/artifact evidence and generate handoff/navigation from committed task state. Add transactional event delivery/outbox only with explicit deduplication and restart tests; current events are stored transactionally without a dispatcher.
4. Test dependency concurrency, duplicate delivery, bounded retries, cancellation and agent/backend restart. Keep Windows Job Objects and OS writer locks; do not reuse a coding worktree for simultaneous writers.
5. Define agent artifact retention and credential rotation/operator lifecycle before longer-lived deployment. A Windows service installer, remote agent transport and multi-user identity need separate authorization/scope.
6. Run Maven package, real Windows fixtures/recovery, frontend build and Playwright. Update status/next tasks/handoff, commit and push. Do not merge main, deploy or expose APIs publicly.

Latest task/implementation/test details: PROJECT_STATUS.md, LOCAL_AGENT.md and `.creatorflow/handoffs/latest.json`. Implementation branch was pushed and remote SHA verified. GitHub draft PR creation returned 403 `Resource not accessible by integration`; no PR exists. [Create PR manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p1-account-manager...feat/v2-p1-local-agent?expand=1).

## Previous cycle plan: V2-P1-02 (completed in the current cycle)

1. Create a new branch from the verified remote `feat/v2-p1-account-manager` head in a clean worktree. Git metadata needs approved execution in this sandbox; do not change ACLs or retry fetch when heads already match.
2. Implement scoped agent identity, loopback transport, heartbeat and PostgreSQL leases. Backend remains authoritative; discover provider capabilities on the agent host.
3. Implement fixed allowlisted Git/FFmpeg task kinds, working-directory boundaries, timeout/descendant cleanup, single-writer worktrees, durable attempts and restart recovery. Test real local processes, duplicate delivery and expired leases.
4. Preserve official credential ownership; no cache copying or unsupported account switching. Any future automatic login launch must be explicit and user-visible; current reconnect only supplies official terminal instructions.
5. Run DB/API/browser checks, update handoffs, commit and push. No main merge, public API exposure, production deploy or real social publication.

Architecture and acceptance: [ACCOUNT_MANAGER.md](ACCOUNT_MANAGER.md). External blockers: live provider/OAuth setup and GitHub connector PR-write permission. The branch was pushed and remote verified; draft PR returned HTTP 403. [Create PR manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p0-media-ai...feat/v2-p1-account-manager?expand=1) or grant integration PR-write permission. No PR number exists.

## Historical backlog (current status above takes precedence)

V2-P0-04 through V2-P0-06 are implemented in `feat/v2-p0-reliability`. Their exact test scope is in `PROJECT_STATUS.md` and `FRONTEND_API_CONTRACT.md`. The table retains acceptance criteria for audit history.

| Task ID | Priority | Depends on | Work | Acceptance criteria / actual test | Definition of Done |
| --- | --- | --- | --- | --- | --- |
| V2-P0-04 | P0 | V2-P0-01 | Detect/reconcile historical duplicate publication targets without losing audit history. Keep one canonical active/approved job, archive or mark superseded rows with a migration. | PostgreSQL fixture with failed + scheduled duplicates migrates deterministically; API retry cannot revive a superseded job. | Migration passes on fresh and duplicate-bearing DB; no platform upload is triggered. |
| V2-P0-05 | P0 | V2-P0-04 | Persist scheduler failure categories and reconcile `PUBLISHING` jobs after restart. Never blindly retry an unknown upload. | Mock YouTube server covers timeout before/after upload response, status lookup and restart. | Job has explicit `RECONCILIATION_REQUIRED` outcome or confirmed post ID; duplicate PUT count stays 1. |
| V2-P0-06 | P0 | V2-P0-01 | Finish API contract matrix and frontend real-mode audit, including media download/auth and settings paths. | Contract tests compare frontend-used route/shape with HTTP JSON; browser smoke for all existing routes with zero unhandled errors. | No mock success reaches real mode; deviations are fixed or documented. |
| V2-P0-07 | P1 | V2-P0-03 | Validate decodability of image/video/audio before scene assignment; reject corrupt uploads. | Upload corrupt PNG/MP4/WAV fixtures and valid assets; valid 15-second E2E still renders. | Invalid media returns 4xx and never sets scene `READY`. |
| V2-P0-08 | P1 | V2-P0-06 | Make AI job completion depend on parsed/validated storyboard, add bounded retry/backoff/idempotency. | Provider mock returns malformed JSON, 429, 503, timeout and valid output; job/usage state matches actual outcome. | No completed AI job lacks a valid artifact; no paid call is made without opt-in. |
| V2-P1-01 | P1 | V2-P0-06 | Implement account metadata and official reconnect flows, starting with provider capability discovery. | Database/security tests prove no plaintext secrets and no unsupported account switch. | Dashboard displays `SUPPORTED/UNSUPPORTED/UNKNOWN` and connection state from backend. |
| V2-P1-02 | P1 | V2-P1-01 | Implement Windows local agent with scoped authentication, heartbeat, leased task, process timeout and restart recovery. | Local agent integration test performs one Git/FFmpeg fixture task and resumes after process restart. | No shared worktree writer or leaked credential. |
| V2-P2-01 / 02 | P1 | V2-P1-02 | Durable dependency engine and checkpoint/handoff writer. | PostgreSQL concurrency, duplicate-delivery, virtual-time and restart tests. | Planner/Executor/Reviewer/Publisher task state survives restart; handoff generated from committed state. |
| V2-P3-01 | P2 | V2-P2-01 | Telegram group routing, approvals and pause/resume adapter. | Mock Bot API validates secret or polling offset, update dedupe and approval persistence. | CODE/CONTENT/VIDEO events are views of PostgreSQL state; live token remains optional. |
| V2-P4-01 | P2 | V2-P0-05, V2-P2-01 | Complete content pipeline and official TikTok provider behind approvals. | Mock provider and artifact E2E; live test only with granted scope and explicit approval. | No false `PUBLISHED`; platform ID/confirmation recorded. |
| V2-P5-01 / 02 | P3 | V2-P2-01, V2-P2-02 | Isolated coding cycle, review/tests, draft PR and optional five-hour trigger. | Worktree isolation, PR draft fixture, virtual-clock overlap tests. | No automatic `main` merge or production deploy. |

Immediate next cycle: start V2-P0-07 media decodability validation on a new feature branch from the verified `feat/v2-p0-reliability` head. Add corrupt PNG/MP4/WAV fixtures, reject before scene assignment, then rerun the 15-second MP4 smoke. In parallel, complete the remaining V2-P0-06 browser mutation click-through for asset assignment and settings, and design an operator-only reconciliation procedure for historically conflicting post IDs before enabling publication.

Review handoff: a draft PR from `feat/v2-p0-hardening` into `feat/backend-v1` was attempted but GitHub returned 403 for the connected integration. A repository admin can grant the GitHub App pull-request write permission, or the user can create the PR from the pushed branch. Do not claim a PR number until GitHub confirms creation.

For this cycle, `feat/v2-p0-reliability` was pushed, but its draft PR into `feat/v2-p0-hardening` also returned GitHub connector HTTP 403 `Resource not accessible by integration`. Create it manually at https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p0-hardening...feat/v2-p0-reliability?expand=1 or grant pull-request write permission to the GitHub integration. No PR number exists yet.

# Current boundary: P5-02B AWAITING_OPERATOR_APPROVAL (2026-11-07)

Fix/test milestone `60e31f3` pushed/remote-confirmed; draft PR BLOCKED_403. [Manual comparison](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p5-ai-executor...feat/v2-p5-ai-executor-sandbox?expand=1). No PR was created.

MXC strict canary is SANDBOX_VERIFIED after the minimal validated Windows startup-path fix; root cause CONFIRMED. Maven80/Python28/build/Flyway, real native timeout/cancel/process-tree cleanup, restart/FFmpeg and Playwright readiness passed. Fresh authenticated same-agent Codex quota is READY. See [P5_AI_EXECUTOR.md](P5_AI_EXECUTOR.md).

1. Operator reviews exact draft `1ef8ace5-d234-456f-ae16-3f668adaf633` on the existing Dashboard and directly checks confirmation/authorizes only if desired. Only README.md in new disposable workspace `824f67ed-8aed-4f00-8019-133c8bc78699`; append the displayed pilot line, 60s/one attempt, authority expires 5 minutes after issuance. Chat intent to review is not approval. Never auto-authorize or reuse the old cancelled task/orphan.
2. After a valid direct approval, recheck actual current credential/session/generation, fresh real quota and sandbox; observe the existing single-use execution pipeline. Verify real Codex-only diff/hash/checkpoint/REVIEW_REQUIRED, source/main unchanged, actual UI and restart evidence. Do not infer live success from the canary, quota or mock tests. Cancellation/process cleanup tests already passed at the native canary/API level; a live coding cancellation is not yet claimed.
3. Until then keep P5-02 full DoD BLOCKED and inference NOT_RUN / AWAITING_OPERATOR_APPROVAL. The test backend process is configured but no DRAFT has execution authority. P5-03, Telegram, publication, account switching and five-hour schedules remain out of scope.

Older blocker reports below are historical; do not repeat P5-01/V19/adapter/UI implementation.

# Current boundary: V2-P5-02 live acceptance BLOCKED (2026-11-06/07)

Implementation push confirmed at `f5b8283`. Draft PR BLOCKED_403; [manual comparison into P5-01](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p5-worktree-foundation...feat/v2-p5-ai-executor?expand=1). No PR was created.

P5-02 implementation/mock acceptance is delivered on `feat/v2-p5-ai-executor`, verified P5-01 baseline `28cfb0d`; P5-01 is not a new implementation task. Read [P5_AI_EXECUTOR.md](P5_AI_EXECUTOR.md) and verify remote/clean tree/latest handoff. Maven80/zero skipped, Python24, build, real-backend Playwright draft/cancel, explicit MOCK_ONLY diff rendering, actual restart/fenced inspect/FFmpeg passed. Full live DoD remains incomplete.

1. Diagnose restricted MXC exact-file profile startup failure (`HRESULT 0x80070003`) through an approved CLI/environment fix. Startup-only MXC_OK is insufficient. Do not change broad ACLs, provision legacy accounts/firewall silently, weaken read/write/network boundaries or substitute a full-access sandbox. Prove exact file allow/deny, outside read/write, network denial and process-tree limits first.
2. Review effective installed CLI integration restrictions/version, authenticate normally outside CreatorFlow only if operator chooses, and obtain fresh same-agent Codex 5-hour/weekly usage. No auth-cache copying, automatic login, account switching or quota inference. Gemini remains unsupported for execution.
3. Prepare a fresh/reconciled worktree and new draft with exact checkpoint/base/files/provider/budget/expiry. Obtain **explicit operator authorization for that displayed live task**; no live approval was issued in this cycle. Enable the backend execution switch only deliberately after prerequisites. Historical READY, broad foundation policy and an old approval are not execution grants.
4. Run one harmless real Codex fixture, verify actual diff/hash/checkpoint and REVIEW_REQUIRED, cancellation/restart and no source-main changes. Only then record LIVE_VERIFIED and close P5-02. Current fixture agent has a valid new DPAPI identity but its process was stopped; old P5-01 identity remains revoked, old orphan requires reconciliation.
5. Proposed **P5-03 (DESIGNED only)** after P5-02 live acceptance: Planner -> operator-authorized isolated Executor -> Reviewer -> approved fixed Tester checks -> operator-reviewed Draft PR, reusing DAG/checkpoints/quota. Define role/tool/network/credential authority and review/test rejection gates first. No automatic pipeline or AI-generated push/merge/deploy was implemented.

No live Telegram/social publication, main merge/deploy or five-hour schedule is authorized. Earlier plans below are historical.

# Current boundary after V2-P5-01 (2026-11-06)

Implementation push confirmed at `ea75ccf`; draft PR BLOCKED_403. [Create PR into P4 manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p4-content-approval...feat/v2-p5-worktree-foundation?expand=1). No PR exists from this run.

P5-01A-G are implemented with scoped acceptance on `feat/v2-p5-worktree-foundation`, baseline P4 `fd65617`. Read [P5_WORKTREE_FOUNDATION.md](P5_WORKTREE_FOUNDATION.md), latest handoff and verify Git/remote before a new cycle. Final Maven 73/zero skips, Python 17, frontend build, Playwright and actual Windows agent/backend restart/rotation/worktree/FFmpeg E2E passed. Retention policy has no automatic sweep; fixture orphan is explicitly retained for reconciliation.

1. Operator review/draft PR into `feat/v2-p4-content-approval`; no main merge. Check exact final remote SHA and PR result in latest handoff.
2. **NEXT V2-P5-02 (not implemented):** verify installed official Codex/Gemini execution protocols, explicit per-task operator authority and allowed repository/workspace. Never use a stale historical READY decision as an execution grant.
3. Revalidate credentials/session, agent capability, quota identity/freshness/windows and reservation/budget at admission, claim and execution; WAIT_FOR_RESET must wait, unknown quota requires an operator. Keep Gemini unsupported until official quota evidence exists; no automatic account switch.
4. Execute only inside proven worktrees with real file/process/network boundaries, bounded Windows Job Objects, durable checkpoint/cancel/recovery and one writer. Preserve role separation and enforce reviewer/test/operator gates before draft PR; no auto push/merge/deploy.
5. Reconcile retained fixture orphans with ownership evidence before reuse/cleanup. Design a dry-run/reference-aware retention sweep and approval/handoff reference graph before enabling automatic deletion. Current logs/worktrees/artifact policy is configuration only.
6. P4 unknown-result reconciliation and live provider setup remain separate explicit authorization tasks. No live Telegram, social upload, provider login or five-hour automation is authorized by this handoff.

Older cycle plans below are historical and do not supersede this boundary.

# CreatorFlow next tasks

## Current boundary after V2-P4 (2026-11-06)

P4-01–06 are IMPLEMENTED and scoped TESTED on `feat/v2-p4-content-approval`, verified P3 baseline `4a41cb2`. Exact commands, audit, test evidence and limits: [P4_CONTENT_APPROVAL.md](P4_CONTENT_APPROVAL.md). P0/accounts/Windows Agent/P2/P3 are preserved, not reimplementation tasks. Verify final remote/clean tree and latest handoff before the next cycle. Provider tests remain MOCK_ONLY; real publishing and Telegram are disabled.

1. Operator review of immutable publication contracts and draft PR into `feat/v2-p3-telegram-control`. Live setup/upload requires separate explicit authorization; P4 approval does not enable the feature flag or create credentials.
2. Proposed **V2-P5-01**, not implemented here: credential enrollment/rotation/revocation/retention and secret-safe child environments; explicit repository/branch allowlists and isolated coding worktree ownership with one writer and recoverable cleanup.
3. Define fixed validated AI task schemas, Windows process-tree timeout/cancellation, immutable source/evidence/checkpoint ownership. Verify the installed official Codex/Gemini execution protocol before integrating any executor; no arbitrary shell or automatic login/account switch.
4. Quota admission requires fresh READY plus budget/operator policy; WAIT_FOR_RESET waits, stale/unknown/unsupported quota requires an operator decision. Never switch accounts to bypass limits. Git/FFmpeg/probe remain quota independent.
5. Planner -> isolated executor -> reviewer/tests -> operator-reviewed draft PR. No auto merge/deploy. Periodic/five-hour automation remains a separate opt-in task after overlap/restart/quota/approval acceptance.
6. Publication follow-up: separately design evidence/authority for manual unknown-result reconciliation and approval expiry/revocation after a confirmed upload attempt. Current policy conservatively blocks; no arbitrary post-ID attach or blind retry. Bound source/evidence retention requires an approved lifecycle because immutable history restricts deletion.

Earlier cycle plans below are historical navigation; this section takes precedence.

P4 implementation push CONFIRMED at `7846fdc`; PR creation BLOCKED_403. [Create PR into P3 manually](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p3-telegram-control...feat/v2-p4-content-approval?expand=1). Final navigation commit is pushed/remote-verified separately.

## Current boundary after V2-P3-01 (2026-11-06)

P3 Telegram control, durable cycle controls/fixture approvals and transactional outbox are IMPLEMENTED and scoped TESTED on `feat/v2-p3-telegram-control`, baseline `f87c6c3`. P2-01/02/03 and the Windows Agent are preserved, not NEXT/reimplementation tasks. Exact commands and limits: [TELEGRAM_INTEGRATION.md](TELEGRAM_INTEGRATION.md). Telegram is MOCK_ONLY/NOT_CONFIGURED, disabled by default; no live bot send has been authorized/performed. Verify Git/remote/latest handoff before another cycle. Older plans below are historical.

1. Operator review of P3 and draft PR into `feat/v2-p2-engine-usage`. Live bot acceptance is optional and needs actual token/verified numeric chat/user IDs, webhook check and explicit permission for non-sensitive status/test messages in the designated group. Do not auto-enable Telegram.
2. P4: immutable content/artifact/evidence manifests and action-specific approval binding, official provider adapter scopes and uncertain-result reconciliation, controlled mock pipeline acceptance. Live publishing remains a separate authorization; P3 fixture approval cannot trigger it.
3. P5 prerequisites: credential lifecycle/rotation/retention, repository/branch allowlists, isolated worktree ownership, fixed validated AI task schema, process-tree deadlines and secret-safe checkpoints/evidence. Preserve one writer per worktree.
4. P5 executor: verify installed official Codex/Gemini capabilities before execution. Add explicit quota admission and budget/operator policy: fresh READY -> eligible; exhausted -> wait for reset; STALE/UNKNOWN/unsupported -> operator decision. Never switch accounts to bypass limits; fixtures remain quota-independent.
5. P5 review chain: planner -> isolated executor -> reviewer/tests -> operator-reviewed draft PR. Telegram CodeBot/Gemini/reviewer labels remain routing until execution acceptance exists. No automatic merge/deploy; any periodic/five-hour trigger is a separate opt-in after overlap/restart/quota tests.
6. Follow-up ergonomics: verified `/command@botname` routing, inline approval keyboards and audited manual UNKNOWN-send reconciliation are not implemented in P3. Avoid blind replay and preserve decision/event references.

Implementation push is CONFIRMED at `41b7ea0`; draft PR creation is BLOCKED_403 (`Resource not accessible by integration`). [Manual PR into P2](https://github.com/danielnguyendbk/CreatorFlow/compare/feat/v2-p2-engine-usage...feat/v2-p3-telegram-control?expand=1). Final navigation commit is pushed and verified separately; use latest Git state over historical snapshots below.

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

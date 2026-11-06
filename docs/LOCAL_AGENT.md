# V2-P1-02 Windows Local Agent

Implemented in `CreatorFlow-Agent/` (Python standard library), the existing Spring Boot backend, PostgreSQL migration V9, and React `/agents`. Account Manager remains unchanged. This release executes only isolated Git/FFmpeg fixtures and tool discovery. Telegram, autonomous coding, arbitrary shell, external Git remotes, publication and production deployment are outside this runtime.

## Identity and startup

Requirements: Windows 10/11, Python 3.12+, Git executable, optional FFmpeg executable, running local backend/PostgreSQL. Set `FFMPEG_PATH` on the agent if FFmpeg is not in PATH. The agent supports loopback HTTP backend origins only, ignores HTTP proxy environment settings and refuses redirects.

Configure a random `CREATORFLOW_AGENT_ENROLLMENT_TOKEN` of at least 32 characters in the backend and the agent environment. It must differ from `CREATORFLOW_API_TOKEN`. On first registration the backend issues a distinct random 256-bit credential with a `Cache-Control: no-store` response. PostgreSQL stores its SHA-256 hash, scope, created/last-used/revoked timestamps. Registration returns the credential only to the enrollment caller; monitoring responses never contain it. The agent encrypts its own identity with current-user Windows DPAPI in `<root>/identity.dpapi` and atomically replaces that file. There is no plaintext fallback, provider auth-cache access or credential copying.

From repository root:

```powershell
python CreatorFlow-Agent/agent.py --backend http://127.0.0.1:8080 --root storage/local-agent --name "Windows Local Agent"
```

Use environment variables/approved encrypted configuration for credentials; never put values on command lines. Remove the enrollment token from the agent service environment after successful registration; subsequent starts use its DPAPI identity. Keep the backend enrollment token disabled/empty when not onboarding. The agent waits for actual loopback readiness before registration/session startup, so starting before Spring is ready does not discard its identity or terminate the worker. The CLI supports `--once` for one claimed task; otherwise it runs continuously. There is no installed Windows service or automatic-start setup in this release: run it as an independent supervised process. It runs under the local user's identity, and DPAPI identity reuse requires that same Windows user/backend origin. Revocation sets `agent_credentials.revoked_at`; there is no browser credential-management UI yet.

## Authentication boundary

- Browser routes `/api/v2/agents`, `/api/v2/agent-tasks` and `/api/v2/agent-tasks/{id}/events` use the existing browser bearer token.
- `POST /api/v2/agent-runtime/register` requires the distinct `X-Agent-Enrollment` header. The browser token does not authorize registration.
- Other `/api/v2/agent-runtime/*` routes require `X-Agent-Id` plus `Authorization: Agent <credential>`. Agent credentials cannot read Settings/Account Manager/monitoring or enqueue operator tasks.
- Runtime routes: `session`, `heartbeat`, `claim`, `tasks/{id}/renew`, `tasks/{id}/result`. Requests carry a backend-issued session UUID; task operations also carry attempt number.

The local browser proxy and server remain loopback only. This is a local single-operator boundary, not a multi-tenant or remote deployment identity system.

## Queue and recovery

V9 adds `local_agents`, `agent_credentials`, `agent_tasks` and `agent_task_events`. Registration has no active session/heartbeat until the process successfully probes capabilities and starts a session. Status is computed from the last heartbeat: ONLINE for ten seconds, then OFFLINE. Missing tools are absent from reported task capabilities. Monitoring polls actual backend state; there are no demo successes.

Tasks target a registered agent and carry enum kind, idempotency key, constrained worktree key, timeout 1–60 seconds and video duration 1–30 seconds. No executable, arbitrary arguments, arbitrary working directory or command payload is accepted as execution input. Duplicate enqueue with identical key/input returns the same task; changed input under the same key returns 409.

Claim serializes on the agent row and uses `FOR UPDATE OF t SKIP LOCKED`. One active task per agent is the initial execution limit; a partial unique index also enforces one active writer per agent/worktree key. Claim increments attempt and grants a twelve-second lease. Session/attempt/owner/lease are checked under transaction locks for renew and result. Terminal result retransmission for the same session/attempt/result is idempotent; stale or altered results return 409. Events commit with task transitions.

The agent heartbeats/renews about once per second while executing. Cancellation moves a running task through CANCEL_REQUESTED; the process stops its Job and acknowledges CANCELLED. Queued cancellation is immediate. A failed renewal causes immediate local process-tree termination and no unfenced result submission. The reaper recovers expired RUNNING tasks to QUEUED, bounded by three attempts, and expired cancellation requests to CANCELLED. Backend restart preserves unexpired leases; it never blindly resets them. Agent restart reuses DPAPI identity but opens a new session; older sessions/results are fenced. Fixtures restart in new attempt directories; this is retry of isolated fixtures, not checkpointed arbitrary-command execution.

## Fixed execution and filesystem boundary

The agent root must not traverse a symlink/junction. It holds an OS byte-range instance lock and each fixture worktree holds a cross-process writer lock. Directories are `<root>/worktrees/<validated-key>/<task-uuid>-<attempt>`. Tasks cannot target the CreatorFlow checkout, a supplied filesystem path or an external repository. Worktree keys are logical fixture slots; arbitrary coding worktrees are not implemented.

- Git fixture initializes a local `fixture` branch, creates a constant text file and commits with fixed local identity. System/global Git config and hooks/signing are disabled. No remotes, fetch, merge, push or credential helper is used.
- FFmpeg fixture generates a bounded 64x64 synthetic MP4 and decodes it fully before success. `-re` provides a real running process for cancellation/timeout tests.
- Capability probe executes only fixed tool version checks and returns booleans. It never invokes paid AI providers.

Children receive an allowlisted environment without browser/agent/provider credentials. Windows `CreateProcessW` creates each child suspended, assigns a Job Object with KILL_ON_JOB_CLOSE, then resumes its thread. Failure to assign the Job fails closed. Timeout, cancellation, lease loss and abrupt owner termination kill descendants. `active-process.json` is a local PID/task-ID journal without arguments/secrets, used by acceptance tests; it is not trusted to kill a possibly reused PID after restart. Git/FFmpeg artifacts stay local; results store only typed exit/error codes, hash, byte count, commit and capability booleans. No raw process output is persisted. Fixtures intentionally retain attempt directories for audit; automatic cleanup is not implemented.

References: [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [PostgreSQL SELECT locking](https://www.postgresql.org/docs/current/sql-select.html).

## Actual acceptance, 2026-11-06

Environment: Windows, Python 3.13, JDK 25, Maven 3.9.12, PostgreSQL 18.3 loopback 55432, Git executable and FFmpeg 8.1.2. Acceptance backend/frontend: `127.0.0.1:8082/5174`; separate fresh database `creatorflow_agent_e2e_20261106`. Normal application defaults remain 8080/5173. Credentials for acceptance were encrypted locally with DPAPI, never committed.

Commands actually run:

```powershell
# From CreatorFlow-Backend, with test DB URL/user and FFMPEG_PATH set:
& D:/DevTools/apache-maven-3.9.12/bin/mvn.cmd '-Dmaven.repo.local=C:/Users/Admin/AppData/Local/codex-with-chatgpt/maven-repo-phase2b' '-Dtest=AgentQueueIntegrationTest' test -q
& D:/DevTools/apache-maven-3.9.12/bin/mvn.cmd '-Dmaven.repo.local=C:/Users/Admin/AppData/Local/codex-with-chatgpt/maven-repo-phase2b' package -q
# From CreatorFlow-Agent, FFMPEG_PATH set:
python -m unittest -v test_agent
# From frontend, VITE_API_BASE_URL=http://127.0.0.1:5174:
npm run build
# From repo root; environment holds DB/JAVA/FFMPEG and separate browser/enrollment tokens:
python CreatorFlow-Agent/smoke_e2e.py --root storage/agent-runtime-e2e --backend-pid <actual-acceptance-backend-pid> --backend-jar storage/agent-backend.jar --evidence storage/agent-e2e-evidence.json
```

Results:

- Maven package: 29 tests, zero failures/errors/skips. Four new database/security/concurrency tests cover cross-role rejection, hashed/revoked credential, cross-agent spoof rejection, forbidden shell kind, idempotency collision, eight simultaneous claims/one writer, expired lease/old session/stale attempt rejection, terminal result retransmission, cancellation, attempt exhaustion, capability filtering and offline detection. Flyway fresh V1–V9 and isolated V1–V4 → V9 upgrade/no-op rerun passed.
- Python: five tests passed with actual Git/FFmpeg, DPAPI roundtrip, environment exclusion, cross-process writer contention, timeout/cancellation, child/grandchild cleanup on Job close and abrupt agent-owner death. No tests were skipped.
- Full process E2E passed: real Git commit, MP4+decode, cancel, timeout, offline detection, killed agent child cleanup, DPAPI identity reuse/new session, agent restart and backend restart. Both interrupted FFmpeg tasks completed at attempt 2 after lease recovery. Earlier Git result survived backend restart unchanged. No mock executor/provider was used.
- Frontend build passed (existing bundle warning). Playwright navigated Dashboard → Agent Monitoring and clicked all three task buttons. Real worker results returned to UI with Git commit, 34-byte artifact, FFmpeg 1203-byte MP4/hash and true capability flags. SQL confirmed all three dashboard-fixture rows SUCCEEDED. UI Cancel stopped a 20-second FFmpeg task and displayed CANCELLED. OFFLINE after stopping the worker and ONLINE after restart were checked. Final browser console: zero errors, one existing React Router future warning.
- Local evidence (ignored): `storage/agent-package.log`, `storage/agent-process-tests.log`, `storage/agent-e2e-evidence.json`, `storage/agent-e2e.log`, `storage/agent-browser-success.txt`, `storage/agent-browser-cancel-pass.txt`, `storage/agent-browser-offline.txt`, `.playwright-cli/` snapshots. Runtime/task metadata and artifacts remain local.

The browser remained open during deliberate backend shutdowns, so its older trace contains transient proxy failures. The zero-error result above is the final successful browser run after reload, not a claim that shutdown requests returned success. Final startup was also exercised by opening the worker immediately after launching Spring: it logged readiness waits and then established its session/ONLINE state.

Initial failures were corrected: equivalent result JSON numeric types broke terminal retransmission comparison; lock contention occurred before error classification while reading a locked byte; tests exposed a fixture UUID cast mistake. A final E2E rerun also exposed startup before Spring readiness; the independent agent now waits for readiness, and the full harness was rerun after the fix. A running prior acceptance backend held the target JAR on Windows; its exact process was verified/stopped, then acceptance used a copied JAR to avoid target locks. PostgreSQL was already running, so a second startup attempt was refused without deleting its lock/PID file. The ui-skills registry was not cached; local accessibility skill instructions were used. Flyway warns PostgreSQL 18 is newer than its tested version range.

## Next boundary

V2-P2-01/02: dependency engine, durable checkpoints/handoffs and an event dispatcher can build on this fenced fixture queue. Design artifact retention and agent credential rotation/operator lifecycle before longer-lived deployment. Expand fixed task kinds only with explicit execution schemas and new acceptance tests; do not turn this fixture agent into arbitrary shell. Live provider sessions, remote agents, service installation, Telegram, autonomous coding and publication remain outside this cycle.

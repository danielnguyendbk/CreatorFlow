# P5-01 isolated coding worktree and admission foundation

## Preflight audit (2026-11-06, before implementation)

Local/remote P4 HEAD verified `fd65617ce5d7111b61053c5fed9b5c3550c961bf`, clean tree; branch `feat/v2-p5-worktree-foundation` created with approved Git execution, no ACL edits. Repository agreement, local-agent/P2/P3/P4 contracts, plan/next/status/handoff and affected frontend types/agent client were reviewed.

AgentIdentity currently stores one hashed runtime token without rotation generation; enrollment depends on an environment secret without an operator-opened window. AgentQueue already owns session/attempt/lease fencing, fixed fixtures and cancellation. TaskCycles/checkpoints/usage/P3/P4 are preserved. Python owns current-user DPAPI, atomic identity file creation, exclusive root/worktree locks and Windows Job Objects. No coding repository registry/workspace ownership or budget admission exists yet.

Side effects: operator enrollment/rotation/revoke change only CreatorFlow identity state; agent registration/session/heartbeat/claim/renew/result/checkpoint mutate PostgreSQL; fixture Git/FFmpeg launch fixed local processes. Codex collector public version/schema and initialized quota reads remain read-only provider operations; no execution/login. New Git operations will be limited to verified fixture repository metadata, generated worktree allocation, inspection and controlled non-force removal; never fetch/clone/push/merge/rebase/reset shared branches. Git checkout hooks/fsmonitor/filters need explicit defenses. UI controls must not turn paths or objectives into shell arguments.

P5-01 cannot execute an AI coding task. Admission READY is a bounded capacity decision, not executor enablement or a provider acceptance guarantee. Five-hour quota duration is unrelated to any scheduling interval; no periodic coding schedule is added.

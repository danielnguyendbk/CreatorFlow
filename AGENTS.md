# CreatorFlow agent working agreement

Before any new work cycle:

1. Read `.creatorflow/handoffs/latest.json`, `docs/PROJECT_STATUS.md` and `docs/NEXT_TASKS.md` when present. Treat them as navigation, then verify `git status`, branch, remote heads and the actual source/runtime. A handoff alone is never proof that a test passed.
2. Work from the latest relevant feature branch in a clean worktree. Do not write to `main`, overwrite unrelated dirty files, or let two coding agents write to the same Git worktree.
3. Read `CreatorFlow-Frontend/src/types/index.ts` and the affected `src/api/` client before changing a backend response. Preserve existing routes/layout unless the task explicitly changes them.
4. Run the smallest meaningful test, then any required integration and smoke test. Record exact commands, environment limits and results. Never mark live Gemini, OAuth, Telegram or publication `TESTED` from a mock server result.
5. Keep credentials in environment or an approved encrypted store. Never commit token files, local media or auth caches. Do not put secrets in logs, test output, docs or handoffs.
6. Do not publish to a real social account, merge to `main`, deploy production or expose the local API publicly without explicit authorization for that action. A scheduled or approved database row is not platform confirmation.
7. After each completed cycle, update the status, next tasks and JSON handoff with completed/incomplete tasks, changed files, branch, last implementation commit, actual tests, blockers and architecture decisions. Validate JSON and recheck Git before ending.

Status vocabulary: `IMPLEMENTED` means code exists; `TESTED` names a command that passed; `DESIGNED` is documented only; `NOT_CONFIGURED` lacks credentials/provider setup; `BLOCKED` states the external prerequisite; `MOCK_ONLY` means no real provider call was made. Do not infer one status from another.

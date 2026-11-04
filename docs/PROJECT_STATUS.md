# CreatorFlow project status

Updated: 2026-11-05. Branch: `feat/v2-p0-hardening`. Last tested implementation commit: `57c2b58be40606d2f6e7aa7e76318d91418d2c18`. Source branch fetched: `origin/feat/backend-v1` at `a7c1f06`; no newer backend remote branch was found at the audit fetch. Recheck all heads in the next cycle.

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

## Confirmed gaps and production readiness

1. Authentication is one bearer token for all local operations. There is no user/role model, tenant boundary or separate agent identity. Vite development proxy injects that token and must stay local.
2. Historical duplicate publication rows may already exist from the prior bug. The P0 fix prevents new duplicates through the API but does not delete or merge old rows. Reconcile targets before enabling live publishing.
3. Publication scheduler catches exceptions without durable error classification on every path. An ambiguous upload with `PUBLISHING` and no post ID requires operator reconciliation; blind retry would be unsafe.
4. AI generation is synchronous; bounded backoff, checkpoint recovery and malformed storyboard response accounting are incomplete. Provider secrets and live quotas were not available to test.
5. Uploaded media is signature checked, but a signature-valid corrupt MP4 can pass upload and fail FFmpeg later. Decode/probe validation is a later hardening task.
6. TikTok, Instagram and Facebook OAuth/upload adapters are absent. YouTube live posting remains disabled. No public post, production deploy or `main` merge occurred.
7. V2 features are design only. CLI multi-account/session switching and Antigravity automation have not been proven supported on this host.

## Changed files in this cycle

`AGENTS.md`; `docs/MASTER_PLAN.md`; `docs/ARCHITECTURE.md`; `CreatorFlow-Backend/src/main/java/com/creatorflow/PublicationApi.java`; `CreatorFlow-Backend/src/test/java/com/creatorflow/PublicationIdempotencyIntegrationTest.java`; `CreatorFlow-Backend/src/test/java/com/creatorflow/ApiSecurityIntegrationTest.java`; `CreatorFlow-Backend/scripts/smoke-e2e.ps1`; this status file, `docs/NEXT_TASKS.md` and `.creatorflow/handoffs/latest.json`.

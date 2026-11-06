# P0 closeout, 2026-11-06

Baseline `feat/v2-p0-media-ai` at `70ad2088aa4a492cd19f1ad58b547eb80e0abb8c`; local clean tree and remote head matched. Work continued on `feat/v2-p1-account-manager`. P0-07/08 implementation was already in the baseline.

## Actual validation

Environment: Windows, JDK 25, Maven 3.9.12, PostgreSQL 18.3 on loopback 55432, FFmpeg 8.1.2. Maven cache explicitly used `C:/Users/Admin/AppData/Local/codex-with-chatgpt/maven-repo-phase2b`. `CREATORFLOW_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55432/creatorflow_test`; test DB user was the existing local cluster owner. No passwords/tokens are recorded here.

- From backend: `mvn -Dmaven.repo.local=C:/Users/Admin/AppData/Local/codex-with-chatgpt/maven-repo-phase2b package -q` with test DB and `FFMPEG_PATH` set: 25 tests, 0 failures/errors/skips. This run includes the two new Account API tests and migration V8. The existing migration regression was updated to expect V8. Its V1-V4 then V5-V8 upgrade and no-op rerun passed, retaining conflicting post IDs.
- MediaValidatorTest, AssetValidationIntegrationTest, ApiSecurityIntegrationTest: corrupt/truncated PNG/JPEG/WAV/MP4 rejection, valid real FFmpeg containers, structured 422, no asset insertion/readiness mutation on rejection.
- AiReliabilityIntegrationTest (5 tests): invalid JSON/artifact, 429, timeout, three-attempt 503 fallback, nonretryable error, duplicate concurrent generation, durable usage/artifact and restart recovery. Provider fixtures are MOCK_ONLY.
- Fresh database `creatorflow_p1_acceptance_20261106`: runtime applied Flyway V1-V8; every history entry `success=true`; readiness UP.
- From frontend: `npm run build` with `VITE_API_BASE_URL=http://127.0.0.1:5173`: TypeScript/Vite passed. Bundle-size warning remains.
- From repository root: `CreatorFlow-Backend/scripts/smoke-e2e.ps1 -Ffprobe <FFmpeg-bin>/ffprobe.exe -EvidenceFile storage/e2e-evidence-v2-p1.json`: PASS. Actual MP4 duration 15.000000 seconds, video/audio/subtitle streams; corrupt media rejected; isolated post-upload corruption produces render failure; retry count 1; cancel CANCELLED. Publication fails closed with no remote post ID and real publishing disabled.
- `CreatorFlow-Backend/scripts/smoke-contract.ps1 -EvidenceFile storage/e2e-evidence-v2-p1.json`: PASS, 11 routes plus authentication/validation/storyboard/media checks. An initial attempt used the script's old default evidence file from a different DB and returned 204 for that nonexistent storyboard; rerun used the matching current evidence.

## Browser mutation smoke and fix

Real Vite proxy/backend, CLI browser session `creatorflow-p1`. Uploaded PNG through file chooser and Upload Asset; selected target content and scene, clicked Confirm Assignment. The first attempt exposed an existing frontend bug: the assignment committed, then unconditional workflow resume produced `No waiting workflow` for completed content and falsely reported assignment failure. The hook now auto-resumes only `WAITING_FOR_ASSET` content. Resume errors produce a distinct warning while preserving successful assignment and cache invalidation.

Retested completed content: Asset Assigned, no resume request. Retested WAITING workflow without voice: scene READY persists, workflow stays WAITING, explicit `Voice audio required before render` warning plus successful assignment. After generating real local voice, another browser assignment auto-resumed; SQL returned `RUNNING|IN_PROGRESS|READY`. Final browser console: zero errors, one existing React Router future warning. Earlier deliberate Gemini-disabled and missing-voice cases produced expected failed HTTP entries; they are not hidden as zero-error runs.

Settings: changed timezone to Asia/Bangkok and clicked Save Configuration; SQL verified the persisted value. Test Voice created 104742 bytes of actual WAV audio. Test Connection displayed the real backend `Gemini NOT_CONFIGURED or provider calls disabled` error; it made no live provider call.

Ignored local evidence: `storage/p1-tests.log`, `storage/p1-frontend-build.log`, `storage/p1-e2e.log`, `storage/p1-contract.log`, `storage/e2e-evidence-v2-p1.json`, `storage/assignment-no-voice-pass.txt`, `storage/assignment-ready-pass.txt`, `.playwright-cli/` snapshots. No local media/token files are committed.

## Permission and evidence limits

`.git` and FETCH_HEAD have deny-write ACL entries for sandbox SIDs; FETCH_HEAD is not read-only. Normal branch creation failed writing its ref lock. The same requested command succeeded through Codex `require_escalated`, establishing the sandbox boundary as the blocker. `git ls-remote` also succeeded with approved execution and matched baseline. No ACL edits, metadata deletion, reset or unnecessary fetch was performed. No evidence points to a file lock or security-software intervention.

Maven's default external repository cache initially failed AccessDenied; the writable existing cache above resolved it. An initial Mockito test double failed because bundled Byte Buddy did not support Java 25; a Spring fixture bean replaced it, and the suite passed without changing production dependencies. Vite process creation and PostgreSQL startup required approved execution. Flyway warns PostgreSQL 18 is newer than its tested PostgreSQL 16 support range.

No live Gemini/OpenRouter, OAuth sign-in, Telegram or social publication was tested. No main merge, public API exposure or production deployment occurred. Historical conflicting platform post IDs still require operator reconciliation before live publishing; P0 migration tests preserve and quarantine them.

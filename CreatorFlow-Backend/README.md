# CreatorFlow Backend V1

Java 21+, Maven, PostgreSQL 16+, FFmpeg, and a local API token are required. Windows voice synthesis uses `System.Speech` through `scripts/synthesize.ps1`. The service is a local single-user modular monolith. Do not expose its bearer token or the Vite development proxy to a public network.

## Start locally

Copy the root `.env.example` into your own environment and set a long random `DB_PASSWORD` and `CREATORFLOW_API_TOKEN`. Start PostgreSQL with `docker compose -f CreatorFlow-Infra/docker-compose.yml up -d` from the repository root, or set `DB_URL`, `DB_USER`, and `DB_PASSWORD` for a local PostgreSQL server. From `CreatorFlow-Backend`, run `mvn spring-boot:run`. Flyway applies V1–V4 automatically; Hibernate validates the schema and never updates it. Data and media live in PostgreSQL and `CREATORFLOW_STORAGE_DIR` respectively.

Set `FFMPEG_PATH` to the FFmpeg executable and `CREATORFLOW_TTS_SCRIPT` to the absolute path of `scripts/synthesize.ps1` on Windows. Health and readiness: `/actuator/health` and `/actuator/health/readiness`. API documentation: `/swagger-ui/index.html`.

For real frontend mode, set `VITE_API_BASE_URL=http://127.0.0.1:5173`, `VITE_BACKEND_URL=http://127.0.0.1:8080`, and `CREATORFLOW_API_TOKEN` in the Vite server environment, then run `npm run dev` from `CreatorFlow-Frontend`. The development proxy supplies the bearer token to `/api` calls. Do not deploy that proxy. With no `VITE_API_BASE_URL`, the frontend uses demo data.

## Provider gates

Gemini generation requires `GEMINI_API_KEY` and `CREATORFLOW_ALLOW_PROVIDER_CALLS=true`. OpenRouter is a fallback only when its key and a free model are configured. Generation jobs and usage records are stored in PostgreSQL; failed provider calls are reported as failures. No live AI provider was exercised without user credentials.

The Settings page reads provider configuration from the backend. Its Gemini and voice test buttons call `/api/settings/test-gemini` and `/api/settings/test-tts`; the Gemini test is an explicit provider call and records usage. Model, key, and media paths are configured by the backend environment; worker controls are fixed by the current local worker implementation. These controls are read-only in real API mode.

YouTube OAuth requires `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, and a persistent random 32-byte Base64 `CREATORFLOW_TOKEN_ENCRYPTION_KEY`. Start OAuth through `GET /api/social/youtube/authorize`; the callback stores an encrypted refresh token. `POST /api/social/youtube/revoke` revokes it. Publishing additionally requires `CREATORFLOW_ENABLE_REAL_PUBLISH=true`, a connected account, a final video, and explicit approval on the publication job. The default is disabled. TikTok, Instagram, and Facebook publishing currently report `NOT_CONFIGURED`; no upload is simulated as successful.

## Tests

Run `mvn test`. The YouTube OAuth integration test runs against PostgreSQL only when `CREATORFLOW_TEST_DB_URL`, `CREATORFLOW_TEST_DB_USER`, and `CREATORFLOW_TEST_DB_PASSWORD` are set. The YouTube upload test uses a local mock HTTP server. With the backend running, a working FFmpeg/ffprobe, and Windows voice synthesis available, run `scripts/smoke-e2e.ps1 -BaseUrl http://127.0.0.1:8080 -Ffprobe <path-to-ffprobe>`. It creates an actual 15-second MP4 with voice and subtitle streams and checks fail-closed publication. It writes local evidence under ignored `storage/`.

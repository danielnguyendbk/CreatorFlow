# CreatorFlow backend (partial V1)

Requires Java 21+, Maven, PostgreSQL 16 and a local access token. The current implementation covers Flyway schema, idea creation through Gemini, idea reads/status/delete, content creation/read, database dashboard counts, and activity reads. Other V1 media, workflow and publication routes are still pending. Real frontend mode fails visibly for unimplemented APIs.

Copy the root `.env.example` values into your local environment. Set `DB_PASSWORD` and `CREATORFLOW_API_TOKEN` to random values. Set `GEMINI_API_KEY` and explicitly set `CREATORFLOW_ALLOW_PROVIDER_CALLS=true` to enable actual generation. Check the account's free tier and billing settings first. No provider call occurs without both settings.

Run PostgreSQL from `CreatorFlow-Infra` with `docker compose up -d`. Run the backend from this directory with `mvn spring-boot:run`. Health: `GET /actuator/health`; OpenAPI: `/swagger-ui/index.html`.

For real frontend mode, set `VITE_API_BASE_URL=http://localhost:8080` before starting Vite. The local single-user token must be entered into the browser session as `sessionStorage.setItem('creatorflow_api_token', '<your token>')`. Do not use this browser token pattern for public deployment. Without `VITE_API_BASE_URL`, the frontend remains in its original demo mode.

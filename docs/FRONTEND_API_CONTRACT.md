# Frontend to Spring API contract audit

Checked 2026-11-05 on `feat/v2-p0-reliability`. The nine `CreatorFlow-Frontend/src/api` modules use the routes below when `VITE_API_BASE_URL` is set. The local HTTP check used the Vite proxy and PostgreSQL.

| Client | Real-mode Spring routes | Result |
| --- | --- | --- |
| `ideaApi` | `GET/POST /api/ideas`, `GET/DELETE /api/ideas/{id}`, `PATCH /api/ideas/{id}/status`, `POST /api/ideas/generate` | Matched; live AI requires provider opt-in and credentials. |
| `contentApi` | `GET/POST /api/contents`, `GET /api/contents/{id}`, `PATCH /api/contents/{id}/status`, `POST /api/contents/{id}/stages/{stage}/retry`, `POST /api/contents/{id}/resume`, `GET /api/contents/dashboard-stats` | Matched; dashboard returns PostgreSQL counts. |
| `storyboardApi` | `GET /api/storyboards/{id}`, `GET /api/storyboards/by-content/{contentId}`, `PATCH /api/storyboards/{id}/scenes/{sceneId}` | Matched for editable fields. Asset assignment is owned by `AssetApi`; real-mode hook now reads the updated storyboard after assignment. |
| `assetApi` | `GET/POST /api/assets`, `GET/DELETE /api/assets/{id}`, `GET /api/assets/inbox`, `GET /api/assets/by-content/{contentId}`, `GET /api/assets/pending-flow-scenes`, `POST /api/assets/{id}/assign`, `GET /api/assets/{id}/download` | HTTP upload/assignment and authenticated MP4 download matched. `updateSceneAssetStatus` is unused in real UI and still has a demo-only implementation; it must not be used as a real backend operation. |
| `workflowApi` | `GET /api/workflows`, `GET /api/workflows/{id}`, `POST /api/workflows/{id}/retry`, `/cancel`, `/resume` | Matched. |
| `renderApi` | `GET /api/render-jobs`, `GET /api/render-jobs/{id}`, `GET /api/render-jobs/{id}/logs`, `POST /api/render-jobs/{id}/retry`, `/cancel` | Matched; real render/job smoke passed. |
| `publicationApi` | `GET/POST /api/publication-jobs`, `GET /api/publication-jobs/{id}`, `PATCH /api/publication-jobs/{id}/details`, `/status`, `POST /api/publication-jobs/{id}/retry`, `/approve`, `/publish-now` | Matched. V5 adds optional `supersededBy`, `reconciliationRequired` and `failureCategory` response fields. Real mode throws on API failure and never marks a post published locally. |
| `activityApi` | `GET /api/activity?limit=`, `GET /api/activity?entityId=` | Matched. |
| `settingsApi` | `GET/PATCH /api/settings` | Matched; provider secrets remain environment-controlled and are absent from the response. |

## Verified HTTP behavior

- Authenticated GETs of all nine API families, dashboard, settings and storyboard returned HTTP 200 on local backend.
- Direct final MP4 download returned 401 without a bearer token and 200 `video/mp4` with one. Through the local Vite proxy, dashboard, settings and MP4 download returned 200 using the proxy's server-side token.
- `npm run build` with `VITE_API_BASE_URL=http://127.0.0.1:5173` passed after the `esbuild` process was allowed to start. The first sandboxed attempt failed with `spawn EPERM`; it was not a TypeScript error.
- Playwright CLI visited all 12 existing route patterns against the local proxy. Each reported 0 console errors and one React Router future-flag warning. After TanStack Query settled, the dashboard snapshot showed `5` ideas, matching the HTTP `todayIdeas` value. The UI layout and routes were not changed.
- A full click-through mutation smoke for every button is still open; route navigation and API smoke do not claim it.

## Remaining integration constraints

- The Vite token-injecting proxy is local development infrastructure. A production deployment needs a user identity/session design and an authenticated media delivery path before exposing the UI remotely.
- `assetApi.updateSceneAssetStatus()` has no Spring route and is not called by the current frontend features. Its demo-only behavior is intentionally outside the verified real-mode contract.
- External Gemini/YouTube calls were not made in this audit. Local mock-server tests prove only adapter behavior.

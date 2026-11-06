# P4 content manifest and safe publication

## Preflight and side-effect audit (2026-11-06, before edits)

Local and remote `feat/v2-p3-telegram-control` matched `4a41cb2220ac23caae5b341e68cef919cf8c212b`, tree clean. Created `feat/v2-p4-content-approval` with approved Git execution; no ACL change. Read repository agreement, navigation, P3 architecture and affected frontend contracts. P2/P3 and the Windows Agent are preserved.

| Entry | Authority/type | Existing side effect / gap | Required P4 boundary |
| --- | --- | --- | --- |
| PublicationApi.schedule/details/status/retry | Authenticated local operator HTTP | Mutable target metadata/schedule; approved_at is not invalidated by details; retry requeues | Metadata change invalidates exact approval; retry uses shared readiness gate |
| PublicationApi.approve | Local operator HTTP | Sets approved_at only | Legacy endpoint must fail closed; dedicated manifest decision required |
| PublicationApi.publishNow | Local operator HTTP | Chooses latest FINAL_VIDEO and configured platform account, CAS claim, calls YouTube | Exact immutable render/asset/account revision, byte rehash, approval and universal guard |
| PublicationApi.due | Internal scheduler | Calls publishNow when old approved_at/flag permit; also confirms known IDs | Same guard, no alternate upload bypass |
| PublicationApi.recoverUncertainUploads | Startup recovery | Quarantines in-flight unknown uploads | Preserve quarantine, never resend unknown; known-ID reconciliation reads only |
| YouTubePublisher.publish/confirmed | Live adapter (unit HTTP fixtures are mocks) | OAuth refresh, resumable init/PUT and status GET; hardcoded public and generic account lookup | Guard-issued permit only; exact account revision and approved visibility; staged verified bytes |
| YouTubeOAuthApi.authorize/callback/accessToken/revoke | Operator OAuth plus public state-checked callback | External OAuth exchange/revoke, replaces credentials in same connection row | Connection generation changes on credential/scope/status changes; old manifest cannot authorize a reconnected account |
| RenderApi / AssetApi / storyboard / voice / workflow | Local media/content APIs and render scheduler | Local files and DB artifacts; no direct provider upload found | Manifest requires successful linked render, verified real media and provenance; no path/token in manifest |
| P3 ControlApprovals / TelegramStore | Fixture-only approval / numeric Telegram authority | FIXTURE_CYCLE/FIXTURE_REVIEW decisions only | Must remain unable to authorize publication |

Real publishing stays false, Telegram stays false and acceptance uses loopback mock HTTP with fixture credentials only. TikTok/Instagram/Facebook remain NOT_CONFIGURED. No live upload is authorized.

Official contracts cross-checked: [YouTube videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert), [videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos), [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list). Visibility must be explicit and confirmation must match the requested post ID and approved visibility; provider responses never justify silently changing visibility.

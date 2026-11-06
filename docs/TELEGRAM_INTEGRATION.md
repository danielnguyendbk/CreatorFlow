# Telegram control plane

## Preflight review (2026-11-06, before implementation)

Baseline local and remote were verified as `f87c6c35d4da70cfe8ef36d7ada722c149cdd07f`; the tree was clean and `feat/v2-p3-telegram-control` was created with approved Git execution, without ACL changes.

Source review: P2 agent credentials are separate from browser authentication; fixed task kinds, session/attempt/lease fencing, dependency claims and immutable checkpoints already exist. UsageApi reads sanitized PostgreSQL quota snapshots and computes freshness; Telegram must reuse it without inference or collector calls. TaskCycles currently derives RUNNING/FAILED/SUCCEEDED from tasks, has no persisted cycle state or pause/resume/cancel API. AgentQueue claims do not check cycle state. Task events commit transactionally, but there is no outbound dispatcher, durable Telegram offset, routing registry or approval engine. These are the P3 gaps; P2 is preserved.

The [official Bot API](https://core.telegram.org/bots/api) makes getUpdates and webhooks mutually exclusive. Poll offsets acknowledge earlier updates and must follow committed processing. The [official bot-to-bot documentation](https://core.telegram.org/bots/features#bot-to-bot-communication) now describes optional BotFather configuration. P3 does not assume it is enabled: bots coordinate internally through PostgreSQL, incoming bot messages are ignored, and Executor/Reviewer remain future routing roles rather than implemented AI coding.

Implementation and acceptance results will be recorded after actual execution. Default disabled; no live Telegram verification has been performed in this cycle.

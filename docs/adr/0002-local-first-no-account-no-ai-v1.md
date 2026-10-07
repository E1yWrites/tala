# 0002 — Local-first, no account, no sync service, no AI in v1

Data lives in IndexedDB on the device. No account, no server, no sync service, no AI features in v1. Safety comes from `navigator.storage.persist()`, Add-to-Home-Screen guidance and one-tap `.tala` backups.

**Why:** the product wins on instant pen, never losing notes, and Bituin's personality. Competitors' recurring complaints are subscriptions, limits and data loss.

**Revisit:** sync via a user-owned cloud folder; opt-in handwriting recognition (Phase 5 experiment).

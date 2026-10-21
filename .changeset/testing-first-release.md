---
'@trowelkit/testing': minor
---

First release. `createTestQueue` collects queue messages and drains them through any consumer with Void's delivery rules: batches, ack and retry decisions, and retries up to `maxRetries`. `testBatch` builds a single batch for testing a consumer directly.

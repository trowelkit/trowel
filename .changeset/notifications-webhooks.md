---
'@trowelkit/notifications': minor
---

Add `webhookChannel`, which posts a builder's message as JSON to a webhook, such as a chat app's. Rate limits and server errors are retried, other client errors aren't, and errors never include the URL.

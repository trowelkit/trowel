---
'@trowelkit/notifications': minor
---

Add `webhookChannel`, which posts a builder's message as JSON to a webhook, such as a chat app's. By default it only calls `https` URLs with a public host name (`isPublicHttpsUrl`; `allowUrl` replaces the check), doesn't follow redirects and times out after 10 seconds. Rate limits, server errors and network errors are retried, other answers aren't, and errors never include the URL.

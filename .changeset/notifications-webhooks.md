---
'@trowelkit/notifications': minor
---

Add `webhookChannel`, which posts a builder's message as JSON to a webhook, such as a chat app's. By default it calls only `https` URLs outside local and private networks (`allowUrl` narrows this further), doesn't follow redirects and times out after 10 seconds. Rate limits, server errors and network errors are retried, other answers aren't, and errors never include the URL.

---
'@trowelkit/policies': minor
---

First release. Gates and policies for authorization: `defineGate`, `definePolicy`, `guest()`, typed abilities, `before` hooks, and `allow`, `deny`, `denyAsNotFound` and `denyWithStatus` responses. `authorize()` throws an `AuthorizationError` that implements `getResponse()`. The `/void` entry checks the signed-in user from Void's `getUser()` and adds route middleware.

import { defineConfig } from 'void/config';

export default defineConfig({
  worker: {
    compatibility_date: '2026-02-24',
  },
  // The app sends mail only through @trowelkit/notifications, which Void's import scan
  // doesn't see, so email and the local inbox are turned on here.
  inference: {
    bindings: { email: true },
  },
});

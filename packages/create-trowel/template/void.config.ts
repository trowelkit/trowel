import { defineConfig } from 'void/config';

export default defineConfig({
  worker: {
    compatibility_date: '2026-02-24',
  },
  head: {
    title: 'Trowel App',
    htmlAttrs: { lang: 'en' },
    meta: [{ charset: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  },
  // The app sends mail through @trowelkit/notifications rather than importing
  // void/email itself, so turn on email and the local inbox here.
  inference: {
    bindings: { email: true },
  },
});

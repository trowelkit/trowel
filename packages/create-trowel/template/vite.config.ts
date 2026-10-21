import tailwindcss from '@tailwindcss/vite';
import { voidReact } from '@void/react/plugin';
import { defineConfig } from 'vite';
import { voidPlugin } from 'void';

export default defineConfig({
  plugins: [voidPlugin(), voidReact(), tailwindcss()],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Development is served through the Express + Vite middleware in server.ts.
  // Keep this config focused on Vite transforms/builds; a self-referencing
  // /api proxy here would only be misleading for standalone Vite usage.
});

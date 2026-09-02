import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: 'all'
  },
  // Keep this config focused on Vite transforms/builds; a self-referencing
  // /api proxy here would only be misleading for standalone Vite usage.
});

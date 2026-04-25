import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // /api/* -> Countroll REST API (no CORS, must be proxied).
    // Keycloak is reached browser-direct (CORS enabled via Web Origins),
    // so no /auth proxy is needed.
    proxy: {
      '/api': {
        target: 'https://api.countroll.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Фронт всегда ходит на /api/* — тот же origin, что и страница.
// Локально Vite проксирует /api → localhost:3000, в Docker/проде то же самое делает Caddy.
// Один origin = не нужен CORS, cookie SameSite=Lax работает без ухищрений.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

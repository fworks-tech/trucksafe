import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Backend base URL for the dev proxy target. The dev server proxies
// `/api/*` to the Django backend; production must serve same-origin.
const backendOrigin = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  // maplibre-gl ships a web worker (`maplibre-gl-worker.mjs`) that the
  // dependency optimizer cannot pre-bundle; serve it unbundled in dev.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep UI/query/form vendors out of the app chunk so vendor code
        // caches across deploys. (React itself stays in the app chunk:
        // splitting it out leaves an empty facade chunk.) The map library
        // only loads with a result (React.lazy), so it gets its own chunk
        // and never weighs down the initial form route.
        manualChunks: {
          mui: [
            '@mui/material',
            '@mui/icons-material',
            '@emotion/react',
            '@emotion/styled',
          ],
          query: ['@tanstack/react-query'],
          form: ['react-hook-form', '@hookform/resolvers', 'zod'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/fixtures.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/features/**/api/handlers.ts',
        'test/**',
        'e2e/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});

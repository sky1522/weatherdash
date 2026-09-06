import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 는 /weatherdash/ 하위에 서빙된다. CI 에서 VITE_BASE 로 주입한다.
  base: process.env['VITE_BASE'] ?? '/',
  server: {
    port: 5173,
    proxy: {
      // 프론트는 인증키를 모른다. /api 는 전부 Worker(:8787)로 넘긴다.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

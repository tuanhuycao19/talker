import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: { main: 'index.html', v3: 'v3.html' },
    },
  },
});

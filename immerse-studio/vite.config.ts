import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Stop Vite from walking up and loading the parent repo's PostCSS config
  css: { postcss: { plugins: [] } },
  server: { port: 5173 },
  build: { outDir: 'dist' },
});

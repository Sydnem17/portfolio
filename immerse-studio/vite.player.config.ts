import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the learner-facing player (the same React renderer the editor
// preview uses) into a single self-contained IIFE bundle. The editor fetches
// this file and inlines it into standalone HTML and SCORM exports, so every
// export target renders from one source of truth.
export default defineConfig({
  plugins: [react()],
  // Stop Vite from walking up and loading the parent repo's PostCSS config
  css: { postcss: { plugins: [] } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  publicDir: false, // this build *writes into* public/ — don't also copy from it
  build: {
    outDir: 'public/player',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/player/entry.tsx',
      name: 'ImmersePlayer',
      formats: ['iife'],
      fileName: () => 'immerse-player.js',
    },
    rollupOptions: {
      output: { assetFileNames: 'immerse-player.[ext]' },
    },
  },
});

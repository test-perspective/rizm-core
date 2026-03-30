import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: (() => {
    // Single source of truth for app version: package.json#version
  const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
  const version = pkg.version ?? 'unknown';
    return {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    };
  })(),
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    pool: 'vmThreads',
  },
});

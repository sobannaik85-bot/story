import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      // Add fallback bundles/polyfills for older mobile browsers.
      targets: ['defaults', 'iOS >= 11', 'Android >= 5'],
      modernPolyfills: true,
    }),
  ],
});

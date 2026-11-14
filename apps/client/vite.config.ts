import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: {
    exclude: ['@facile/muse', '@facile/mise-en-scene']
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
});

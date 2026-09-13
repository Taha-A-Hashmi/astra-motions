import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // `npm run server` hosts the API on 8787; the dev site talks to it
    // through this proxy so the browser only ever sees one origin.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
});

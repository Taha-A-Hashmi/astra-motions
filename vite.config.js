import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  server: {
    // `npm run server` hosts the API on 8787; the dev site talks to it
    // through this proxy so the browser only ever sees one origin.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/uploads': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  plugins: [
    {
      // The built page is a *shell*: the server injects the SEO
      // dashboard's content into it on every request. Renaming it keeps
      // Vercel's static file handling from serving it raw at `/`.
      name: 'emit-shell',
      closeBundle() {
        const dist = path.resolve('dist');
        const from = path.join(dist, 'index.html');
        if (fs.existsSync(from)) fs.renameSync(from, path.join(dist, 'shell.html'));
      },
    },
  ],
});

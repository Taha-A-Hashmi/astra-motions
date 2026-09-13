/* ═══════════════════════════════════════════════════════════════════════
   server/index.js — long-lived entry point.

     npm run server   →  API only, for local dev alongside `npm run dev`
                         (Vite proxies /api here)
     npm start        →  API + the built site from dist/, one process
   ═══════════════════════════════════════════════════════════════════════ */
import { createApp } from './app.js';
import { config, mailConfigured } from './config.js';
import { openDb } from './db.js';

openDb();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Astra backend  →  http://localhost:${config.port}`);
  console.log(`  data:  ${config.dataDir}`);
  console.log(`  mail:  ${mailConfigured() ? `configured → ${config.contactTo}` : 'not configured — CONTACT_TO is empty; inquiries are stored only'}`);
  console.log(`  admin: ${config.adminToken ? 'enabled' : 'disabled (set ADMIN_TOKEN)'}`);
});

/* ═══════════════════════════════════════════════════════════════════════
   server/app.js — the Express app (no listen here, so the same app can
   run as a long-lived server via server/index.js or as a Vercel function
   via api/index.js).

   Routes
     GET  /api/health              liveness + whether mail is configured
     POST /api/contact             the contact form → validate, store, email
     GET  /api/inquiries           admin: list   (Bearer ADMIN_TOKEN)
     GET  /api/inquiries/:id       admin: one
     PATCH /api/inquiries/:id      admin: { status }
     *                             the built site from dist/ (production)
   ═══════════════════════════════════════════════════════════════════════ */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config, mailConfigured } from './config.js';
import { validateInquiry } from './validate.js';
import { createRateLimiter } from './ratelimit.js';
import { insertInquiry, markEmailed, listInquiries, getInquiry, setStatus, countInquiries } from './db.js';
import { sendInquiry } from './mail.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel / any reverse proxy sets X-Forwarded-For
  app.use(express.json({ limit: '32kb' }));

  /* ── Security headers + CORS ────────────────────────────────────────── */
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  const api = express.Router();

  api.get('/health', (req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString(),
      mail: mailConfigured()
        ? `configured → ${config.contactTo}`
        : config.contactTo
          ? 'not configured (CONTACT_TO set, no transport — add SMTP_USER/SMTP_PASS or RESEND_API_KEY)'
          : 'not configured (CONTACT_TO empty)',
      storage: config.onVercel ? 'ephemeral (/tmp)' : config.dataDir,
    });
  });

  /* ── The contact form ────────────────────────────────────────────────── */
  api.post('/contact', createRateLimiter(config.rateLimit), async (req, res) => {
    const body = req.body || {};

    // Honeypot: the hidden "company" field is filled only by bots. Answer
    // 200 so they think it worked and move on.
    if (typeof body.company === 'string' && body.company.trim() !== '') {
      return res.json({ ok: true, id: null });
    }
    // Timing: a real person needs more than a moment to write a brief
    const elapsed = Number(body.elapsed);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < config.minFillMs) {
      return res.json({ ok: true, id: null });
    }

    const result = validateInquiry(body);
    if (!result.ok) return res.status(422).json({ ok: false, errors: result.errors });

    let row;
    try {
      row = insertInquiry({
        ...result.data,
        ip: req.ip,
        userAgent: (req.get('user-agent') || '').slice(0, 300),
        referrer: (req.get('referer') || '').slice(0, 300),
      });
    } catch (err) {
      console.error('[contact] store failed:', err);
      return res.status(500).json({ ok: false, error: 'Could not save your message. Please try again.' });
    }

    // Email is best-effort: the inquiry is already safe in the database.
    let delivery = { sent: false };
    try {
      delivery = await sendInquiry(row);
      markEmailed(row.id, delivery.sent ? null : delivery.reason || null);
    } catch (err) {
      console.error('[contact] mail failed:', err.message);
      markEmailed(row.id, err.message.slice(0, 300));
    }

    console.log(
      `[contact] ${row.created_at} ${row.name} <${row.email}> ${row.budget} — mail: ${
        delivery.sent ? 'sent' : `not sent (${delivery.reason || 'error'})`
      }`
    );
    res.status(201).json({ ok: true, id: row.id });
  });

  /* ── Admin ──────────────────────────────────────────────────────────── */
  const requireAdmin = (req, res, next) => {
    if (!config.adminToken) return res.status(503).json({ ok: false, error: 'ADMIN_TOKEN is not set' });
    const auth = req.get('authorization') || '';
    if (auth !== `Bearer ${config.adminToken}`) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    next();
  };

  api.get('/inquiries', requireAdmin, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ ok: true, counts: countInquiries(), items: listInquiries({ limit, offset, status }) });
  });

  api.get('/inquiries/:id', requireAdmin, (req, res) => {
    const row = getInquiry(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, item: row });
  });

  api.patch('/inquiries/:id', requireAdmin, (req, res) => {
    const status = req.body?.status;
    if (!['new', 'read', 'replied', 'archived'].includes(status)) {
      return res.status(422).json({ ok: false, error: 'status must be new | read | replied | archived' });
    }
    if (!setStatus(req.params.id, status)) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  app.use('/api', api);

  /* ── Static site (production: `npm run build` then `npm start`) ─────── */
  const dist = path.resolve('dist');
  if (!config.onVercel && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
  }

  // JSON errors for bad bodies etc., never an HTML stack trace
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Invalid JSON' });
    console.error(err);
    res.status(err.status || 500).json({ ok: false, error: 'Server error' });
  });

  return app;
}

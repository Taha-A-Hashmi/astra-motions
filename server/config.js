/* ═══════════════════════════════════════════════════════════════════════
   server/config.js — every knob the backend reads, in one place.

   Everything comes from environment variables (see .env.example). Nothing
   here is required to boot: with an empty .env the API still accepts and
   stores inquiries, it just can't email them anywhere yet.
   ═══════════════════════════════════════════════════════════════════════ */
import path from 'node:path';
import os from 'node:os';

const env = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};

const onVercel = Boolean(process.env.VERCEL);

export const config = {
  port: Number(env('PORT', 8787)),
  nodeEnv: env('NODE_ENV', 'development'),
  onVercel,

  /* Where inquiries land. Serverless filesystems are read-only except
     /tmp, so on Vercel the SQLite file is ephemeral — email is the durable
     channel there. Locally / on a VPS, DATA_DIR persists. */
  dataDir: env('DATA_DIR', onVercel ? path.join(os.tmpdir(), 'astra-data') : path.resolve('data')),

  /* ── Mail ─────────────────────────────────────────────────────────────
          Vercel project env). Delivery order of preference: Resend (HTTP, no SMTP needed) → SMTP →
     none (inquiries are stored and logged, nothing is sent). */
  contactTo: env('CONTACT_TO'),
  contactFrom: env('CONTACT_FROM', 'Astra Motions <onboarding@resend.dev>'),
  resendApiKey: env('RESEND_API_KEY'),
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', 587)),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    secure: env('SMTP_SECURE', 'false') === 'true',
  },
  /* Send the visitor a short confirmation as well (only when mail works) */
  autoReply: env('AUTO_REPLY', 'true') === 'true',

  /* ── Admin: GET /api/inquiries needs `Authorization: Bearer <token>` ── */
  adminToken: env('ADMIN_TOKEN'),

  /* ── CORS: comma-separated origins allowed to POST. Empty = same-origin
     only (the site and the API are served by the same process). */
  allowedOrigins: env('ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /* ── Abuse limits ─────────────────────────────────────────────────── */
  rateLimit: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // submissions per IP per window
  },
  /* A form filled in under this many ms after opening is a bot */
  minFillMs: 1500,
};

export const mailConfigured = () =>
  Boolean(config.contactTo && (config.resendApiKey || (config.smtp.host && config.smtp.user)));

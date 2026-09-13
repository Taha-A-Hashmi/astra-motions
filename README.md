# Astra Motions

Immersive single-page WebGL site — one three.js scene, six stages, scroll to
ascend from the ground into orbit — with its own small backend for the
contact form.

## Run it

```bash
npm install
npm run dev:all        # site on http://localhost:5173, API on :8787
```

Or separately: `npm run dev` (Vite) and `npm run server` (API).

Production:

```bash
npm run build          # → dist/
npm start              # one process serves dist/ and /api on PORT (8787)
```

Requires Node **22.13+** (the backend uses the built-in `node:sqlite`).

## Backend

Everything is configured through `.env` — copy `.env.example` and fill in
what you have. With nothing filled in, the API still works: every inquiry is
saved to `data/inquiries.sqlite`, it just isn't emailed anywhere yet.

| Variable | What it does |
|---|---|
| `CONTACT_TO` | Where inquiries are emailed — the studio inbox. |
| `CONTACT_FROM` | Sender identity (must be verified with your mail provider). |
| `RESEND_API_KEY` | Mail via [Resend](https://resend.com) — simplest option. |
| `SMTP_HOST/PORT/USER/PASS` | …or any SMTP mailbox instead. |
| `AUTO_REPLY` | Send the visitor a short "received" note (default `true`). |
| `ADMIN_TOKEN` | Enables `GET /api/inquiries` (Bearer token). |
| `ALLOWED_ORIGINS` | Extra origins allowed to POST; empty = same-origin only. |
| `DATA_DIR` | Where the SQLite file lives (default `./data`). |

### API

| Route | Notes |
|---|---|
| `GET /api/health` | Liveness; reports whether mail is configured. |
| `POST /api/contact` | `{ name, email, message, budget }` → `201 { ok, id }`. `422` with per-field `errors`, `429` when rate-limited (5 per IP / 10 min). Honeypot field `company` and a fill-time guard silently drop bots. |
| `GET /api/inquiries?limit&offset&status` | Admin list + counts. |
| `GET /api/inquiries/:id` | Admin: one inquiry. |
| `PATCH /api/inquiries/:id` | Admin: `{ status: new \| read \| replied \| archived }`. |

Read your inbox from the terminal:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8787/api/inquiries
```

### Deploying

- **Any Node host / VPS** — `npm run build && npm start`. Inquiries persist in
  `DATA_DIR`; email is optional.
- **Vercel** — `vercel.json` routes `/api/*` to the same Express app as a
  serverless function. The filesystem there is ephemeral, so set up mail
  (`CONTACT_TO` + Resend or SMTP) before going live: email is the durable
  record on Vercel.

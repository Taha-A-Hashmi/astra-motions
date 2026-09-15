/* ═══════════════════════════════════════════════════════════════════════
   server/cms.js — the SEO dashboard's backend: renders the site's HTML
   shell with the saved content injected (so crawlers see edited titles,
   descriptions and copy without a rebuild), and the admin API the
   dashboard at /admin/ talks to.

     GET  /                      the shell with content injected
     GET  /api/content           public: saved values (used by the dev client)
     GET  /api/admin/schema      admin: sections + defaults read from the shell
     GET  /api/admin/content     admin: saved values + defaults
     PUT  /api/admin/content     admin: replace saved values
     POST /api/admin/upload      admin: { name, type, data(base64) } → { url }
   ═══════════════════════════════════════════════════════════════════════ */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { site, sections, fields, targetsOf } from '../cms/schema.js';
import { esc, multiline, rich, letters, lists } from '../cms/templates.js';
import { loadContent, saveContent, saveImage, storageInfo } from './content.js';

/* ── The shell: dist/shell.html, read once per process ──────────────── */
let shellCache = null;
export let shellSource = 'missing';
export async function readShell() {
  if (shellCache) return shellCache;
  const file = path.resolve('dist', 'shell.html');
  if (fs.existsSync(file)) {
    shellCache = fs.readFileSync(file, 'utf8');
    shellSource = 'fs';
    return shellCache;
  }
  // On Vercel the function bundle may not carry dist/ — the CDN does.
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  for (const origin of [site.url.replace(/\/$/, ''), base].filter(Boolean)) {
    try {
      const res = await fetch(`${origin}/shell.html`, { cache: 'no-store' });
      if (res.ok) {
        shellCache = await res.text();
        shellSource = `fetch ${origin}`;
        return shellCache;
      }
    } catch {}
  }
  return null;
}

/* ── Regex helpers for the handful of targets we support ────────────── */
const attrRe = (attr, value) => `${attr}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`;

// Find the element carrying attr="value" and return the offsets of its
// inner HTML, honouring nested elements of the same tag (a <div> list
// host contains <div>s of its own). Returns null when not found.
function findElement(html, attr, value, from = 0) {
  const open = new RegExp(`<(\\w+)\\b[^>]*\\b${attrRe(attr, value)}[^>]*>`, 'g');
  open.lastIndex = from;
  const m = open.exec(html);
  if (!m) return null;
  const tag = m[1];
  const innerStart = m.index + m[0].length;
  const pair = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  pair.lastIndex = innerStart;
  let depth = 1;
  let t;
  while ((t = pair.exec(html))) {
    if (t[0].endsWith('/>')) continue; // self-closing
    depth += t[1] ? -1 : 1;
    if (depth === 0) return { start: m.index, innerStart, innerEnd: t.index, end: t.index + t[0].length, tag };
  }
  return null;
}
function replaceInner(html, attr, value, inner) {
  let out = html;
  let from = 0;
  for (;;) {
    const el = findElement(out, attr, value, from);
    if (!el) return out;
    out = out.slice(0, el.innerStart) + inner + out.slice(el.innerEnd);
    from = el.innerStart + inner.length;
  }
}
const replaceSel = (html, key, inner) => replaceInner(html, 'data-cms', key, inner);
function readSel(html, key) {
  const el = findElement(html, 'data-cms', key);
  if (!el) return '';
  return html
    .slice(el.innerStart, el.innerEnd)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
function replaceMetaLike(html, attr, name, valueAttr, value) {
  const re = new RegExp(`(<(?:meta|link)\\b[^>]*\\b${attrRe(attr, name)}[^>]*\\b${valueAttr}=")([^"]*)(")`, 'g');
  return html.replace(re, (m, a, _old, c) => `${a}${esc(value)}${c}`);
}
function readMetaLike(html, attr, name, valueAttr) {
  const re = new RegExp(`<(?:meta|link)\\b[^>]*\\b${attrRe(attr, name)}[^>]*\\b${valueAttr}="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
}
const JSONLD_RE = /(<script type="application\/ld\+json">\s*)([\s\S]*?)(\s*<\/script>)/;
function readJsonLd(html) {
  const m = html.match(JSONLD_RE);
  if (!m) return null;
  try { return JSON.parse(m[2]); } catch { return null; }
}

/** The values the HTML ships with — the dashboard shows these as defaults. */
export function readDefaults(html) {
  const out = {};
  const ld = readJsonLd(html) || {};
  for (const f of Object.values(fields)) {
    if (f.type === 'list') { out[f.key] = f.default || []; continue; }
    let v = '';
    for (const t of targetsOf(f)) {
      if (t.sel) v = readSel(html, t.sel);
      else if (t.meta) v = readMetaLike(html, 'name', t.meta, 'content');
      else if (t.prop) v = readMetaLike(html, 'property', t.prop, 'content');
      else if (t.title) v = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
      else if (t.link) v = readMetaLike(html, 'rel', t.link, 'href');
      else if (t.jsonld) v = ld[t.jsonld] ?? '';
      else if (t.headHtml) v = '';
      if (v) break;
    }
    out[f.key] = v;
  }
  return out;
}

/** Inject saved values into the shell. Unset fields leave the HTML alone. */
export function renderShell(html, values) {
  let out = html;
  let ld = null;
  let ldDirty = false;
  for (const [key, raw] of Object.entries(values)) {
    const f = fields[key];
    if (!f) continue;
    if (f.type === 'list') {
      const items = Array.isArray(raw) ? raw : [];
      const tpl = lists[targetsOf(f)[0]?.list];
      if (!tpl) continue;
      out = replaceInner(out, 'data-cms-list', targetsOf(f)[0].list, `\n${tpl(items)}\n          `);
      continue;
    }
    const value = String(raw ?? '');
    for (const t of targetsOf(f)) {
      if (t.sel) {
        const inner = t.letters ? letters(value) : f.type === 'rich' ? rich(value) : f.type === 'textarea' ? multiline(value) : esc(value);
        out = replaceSel(out, t.sel, inner);
      } else if (t.meta) out = replaceMetaLike(out, 'name', t.meta, 'content', value);
      else if (t.prop) out = replaceMetaLike(out, 'property', t.prop, 'content', value);
      else if (t.title) out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(value)}</title>`);
      else if (t.link) out = replaceMetaLike(out, 'rel', t.link, 'href', value);
      else if (t.jsonld) {
        ld ??= readJsonLd(out) || {};
        ld[t.jsonld] = value;
        ldDirty = true;
      } else if (t.headHtml && value.trim()) {
        out = out.replace('</head>', `    <!-- custom head code (dashboard) -->\n${value}\n  </head>`);
      }
    }
  }
  if (ldDirty && ld) out = out.replace(JSONLD_RE, (m, a, _b, c) => `${a}${JSON.stringify(ld, null, 8).replace(/\n}$/, '\n      }')}${c}`);
  // hand the values to the client too, so nothing re-fetches or flashes
  out = out.replace('</head>', `    <script>window.__CMS__=${JSON.stringify(values).replace(/</g, '\\u003c')}</script>\n  </head>`);
  return out;
}

/* ── Validation of a save: only known keys, sane sizes ──────────────── */
function cleanValues(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key, raw] of Object.entries(input)) {
    const f = fields[key];
    if (!f) continue;
    if (f.type === 'list') {
      if (!Array.isArray(raw)) continue;
      out[key] = raw.slice(0, 40).map((it) => {
        const o = {};
        for (const sub of f.item) o[sub.key] = String(it?.[sub.key] ?? '').slice(0, sub.type === 'textarea' ? 2000 : 600);
        return o;
      });
      continue;
    }
    if (raw === null || raw === undefined) continue;
    const s = String(raw);
    if (s === '') continue; // empty = "use the default"
    out[key] = s.slice(0, f.type === 'code' ? 20000 : f.type === 'textarea' ? 4000 : 800);
  }
  return out;
}

/* ── Routes ─────────────────────────────────────────────────────────── */
export function cmsRouter({ requireAdmin }) {
  const r = express.Router();
  r.use(express.json({ limit: '6mb' }));

  r.get('/content', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, values: await loadContent() });
  });

  r.get('/admin/schema', requireAdmin, async (req, res) => {
    const shell = (await readShell()) || '';
    res.json({ ok: true, site, sections, defaults: readDefaults(shell), storage: storageInfo() });
  });

  r.get('/admin/content', requireAdmin, async (req, res) => {
    const shell = (await readShell()) || '';
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, values: await loadContent({ fresh: true }), defaults: readDefaults(shell) });
  });

  r.put('/admin/content', requireAdmin, async (req, res) => {
    try {
      const values = await saveContent(cleanValues(req.body?.values));
      res.json({ ok: true, values, savedAt: new Date().toISOString() });
    } catch (err) {
      console.error('[cms] save failed:', err);
      res.status(500).json({ ok: false, error: `Could not save: ${err.message}` });
    }
  });

  r.post('/admin/upload', requireAdmin, async (req, res) => {
    try {
      const { name, type, data } = req.body || {};
      if (typeof data !== 'string' || !type) return res.status(422).json({ ok: false, error: 'name, type and data are required' });
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length > 4 * 1024 * 1024) return res.status(422).json({ ok: false, error: 'Images must be under 4 MB' });
      const url = await saveImage({ name, type, buffer });
      res.json({ ok: true, url });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  return r;
}

/** GET / — the shell with the saved content injected. */
export async function shellHandler(req, res, next) {
  const shell = await readShell();
  if (!shell) return next();
  let values = {};
  try {
    values = await loadContent();
  } catch (err) {
    console.error('[cms] falling back to defaults:', err.message);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  res.send(renderShell(shell, values));
}

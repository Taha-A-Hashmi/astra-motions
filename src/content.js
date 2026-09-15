/* ═══════════════════════════════════════════════════════════════════════
   content.js — applies the SEO dashboard's saved copy in the browser.

   In production the server has already injected everything into the HTML
   (and left the values on window.__CMS__), so this does nothing. In Vite
   dev the raw index.html is served, so this fetches /api/content and
   applies the same targets client-side — same schema, same templates.
   ═══════════════════════════════════════════════════════════════════════ */
import { fields, targetsOf } from '../cms/schema.js';
import { esc, multiline, rich, letters, lists } from '../cms/templates.js';

function apply(values) {
  for (const [key, raw] of Object.entries(values)) {
    const f = fields[key];
    if (!f) continue;
    if (f.type === 'list') {
      const t = targetsOf(f)[0];
      const host = document.querySelector(`[data-cms-list="${t?.list}"]`);
      if (host && lists[t.list]) host.innerHTML = lists[t.list](Array.isArray(raw) ? raw : []);
      continue;
    }
    const value = String(raw ?? '');
    for (const t of targetsOf(f)) {
      if (t.sel) {
        for (const el of document.querySelectorAll(`[data-cms="${t.sel}"]`)) {
          el.innerHTML = t.letters ? letters(value) : f.type === 'rich' ? rich(value) : f.type === 'textarea' ? multiline(value) : esc(value);
        }
      } else if (t.meta) document.querySelector(`meta[name="${t.meta}"]`)?.setAttribute('content', value);
      else if (t.prop) document.querySelector(`meta[property="${t.prop}"]`)?.setAttribute('content', value);
      else if (t.title) document.title = value;
      else if (t.link) document.querySelector(`link[rel="${t.link}"]`)?.setAttribute('href', value);
    }
  }
}

export function applyContent() {
  if (window.__CMS__) return; // server-rendered
  fetch('/api/content', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => body?.values && apply(body.values))
    .catch(() => {});
}

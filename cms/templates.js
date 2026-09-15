/* ═══════════════════════════════════════════════════════════════════════
   cms/templates.js — HTML for list-type content (the work cards) plus the
   escaping helpers, shared by the server renderer and the dev client.
   ═══════════════════════════════════════════════════════════════════════ */

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Escaped text with line breaks kept (textarea fields). */
export const multiline = (s) => esc(s).replace(/\r?\n/g, '<br />');

/** Escaped text where *word* becomes <em>word</em> (rich fields). */
export const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

/** One <span class="ch"> per character (the hero wordmark). */
export const letters = (s) =>
  [...String(s ?? '')].map((ch) => `<span class="ch">${esc(ch)}</span>`).join('');

const safeHref = (h) => {
  const s = String(h ?? '').trim();
  return /^(https?:)?\/\//i.test(s) || s.startsWith('/') || s.startsWith('#') ? s : '#';
};

export const lists = {
  work: (items) =>
    items
      .map(
        (it, i) => `
            <a class="sheet-card tilt work-card" href="${esc(safeHref(it.href))}" target="_blank" rel="noopener">
              <div class="work-thumb">
                <span class="work-index">${String(i + 1).padStart(2, '0')}</span>
                <img src="${esc(it.image || '')}" alt="${esc(it.alt || it.title || '')}" loading="lazy" />
              </div>
              <div class="work-body">
                <p class="work-meta">${esc(it.meta)}</p>
                <h3 class="work-title">${esc(it.title)} <span class="arrow">↗</span></h3>
                <p class="work-desc">${multiline(it.description)}</p>
                <ul class="work-tags">${String(it.tags || '')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t) => `<li>${esc(t)}</li>`)
                  .join('')}</ul>
              </div>
            </a>`
      )
      .join('\n'),
};

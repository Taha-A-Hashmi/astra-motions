/* ═══════════════════════════════════════════════════════════════════════
   admin.js — the site editor. One page, no framework.

   Talks to:
     GET  /api/admin/schema    sections + defaults (+ site name/accent)
     GET  /api/admin/content   saved values
     PUT  /api/admin/content   save
     POST /api/admin/upload    images
     GET  /api/inquiries       form entries (+ PATCH /api/inquiries/:id)
   Auth is the editor password sent as a Bearer token.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };

  /* ── State ──────────────────────────────────────────────────────────── */
  const state = {
    token: sessionStorage.getItem('editor.token') || localStorage.getItem('editor.token') || '',
    schema: null,
    defaults: {},
    saved: {},   // as on the server
    values: {},  // being edited
    section: location.hash.replace('#', '') || 'seo',
    inquiries: null,
    dirty: false,
    saving: false,
  };
  const deepEq = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

  /* ── API ────────────────────────────────────────────────────────────── */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) throw Object.assign(new Error('Wrong password'), { status: 401 });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status });
    return body;
  }

  /* ── Boot / login ───────────────────────────────────────────────────── */
  const loginEl = $('#login');
  const appEl = $('#app');

  async function boot() {
    if (!state.token) return showLogin();
    try {
      const [schema, content] = await Promise.all([api('/api/admin/schema'), api('/api/admin/content')]);
      state.schema = schema;
      state.defaults = schema.defaults || {};
      state.saved = content.values || {};
      state.values = JSON.parse(JSON.stringify(state.saved));
      document.documentElement.style.setProperty('--accent', schema.site.accent || '#2271b1');
      document.documentElement.style.setProperty('--accent-ink', '#1d2327');
      $('#side-name').textContent = schema.site.name;
      document.title = `${schema.site.name} · Site editor`;
      loginEl.hidden = true;
      appEl.hidden = false;
      renderNav();
      renderSection();
      loadInquiryCount();
    } catch (err) {
      if (err.status === 401) {
        showLogin(state.token ? 'That password was not accepted.' : '');
        state.token = '';
        sessionStorage.removeItem('editor.token');
        localStorage.removeItem('editor.token');
      } else {
        showLogin(`Could not reach the site's API: ${err.message}`);
      }
    }
  }
  function showLogin(message = '') {
    appEl.hidden = true;
    loginEl.hidden = false;
    const err = $('#login-err');
    err.textContent = message;
    err.hidden = !message;
    $('#login-token').focus();
  }
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.token = $('#login-token').value.trim();
    if ($('#login-remember').checked) localStorage.setItem('editor.token', state.token);
    else sessionStorage.setItem('editor.token', state.token);
    boot();
  });
  $('#logout').addEventListener('click', () => {
    if (state.dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    sessionStorage.removeItem('editor.token');
    localStorage.removeItem('editor.token');
    location.reload();
  });

  /* ── Navigation ─────────────────────────────────────────────────────── */
  function renderNav() {
    const nav = $('#side-nav');
    nav.innerHTML = '';
    for (const s of state.schema.sections) {
      nav.append(h('button', { type: 'button', class: s.id === state.section ? 'active' : '', onclick: () => go(s.id) }, s.title));
    }
    nav.append(h('div', { class: 'sep' }));
    nav.append(h('button', { type: 'button', id: 'nav-inquiries', class: state.section === 'inquiries' ? 'active' : '', onclick: () => go('inquiries') }, 'Form entries', h('span', { class: 'badge', id: 'inq-badge', hidden: true })));
    nav.append(h('button', { type: 'button', class: state.section === 'help' ? 'active' : '', onclick: () => go('help') }, 'Help'));
  }
  function go(id) {
    state.section = id;
    location.hash = id;
    renderNav();
    renderSection();
    window.scrollTo(0, 0);
  }

  /* ── Dirty tracking + save ──────────────────────────────────────────── */
  function setDirty() {
    state.dirty = !deepEq(state.values, state.saved);
    const status = $('#status');
    status.className = 'topbar-status' + (state.dirty ? ' dirty' : '');
    status.textContent = state.dirty ? 'Unsaved changes' : 'All changes saved';
    $('#save').disabled = !state.dirty || state.saving;
    $('#discard').disabled = !state.dirty || state.saving;
  }
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#discard').addEventListener('click', () => {
    if (!confirm('Throw away your unsaved changes?')) return;
    state.values = JSON.parse(JSON.stringify(state.saved));
    setDirty();
    renderSection();
  });
  $('#save').addEventListener('click', save);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.dirty) save(); }
  });
  async function save() {
    if (state.saving) return;
    state.saving = true;
    const status = $('#status');
    status.className = 'topbar-status saving';
    status.textContent = 'Saving…';
    $('#save').disabled = true;
    try {
      const res = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify({ values: state.values }) });
      state.saved = res.values || {};
      state.values = JSON.parse(JSON.stringify(state.saved));
      toast('Saved. The live site updates within about a minute.');
      renderSection();
    } catch (err) {
      status.className = 'topbar-status err';
      status.textContent = err.message;
      toast(err.message, true);
      if (err.status === 401) return showLogin('Your session expired — sign in again.');
    } finally {
      state.saving = false;
      setDirty();
    }
  }
  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3600);
  }

  /* ── Values: saved overrides default; '' means "use default" ────────── */
  const get = (key) => (state.values[key] !== undefined && state.values[key] !== '' ? state.values[key] : state.defaults[key] ?? '');
  const isChanged = (key) => state.values[key] !== undefined && state.values[key] !== '' && !deepEq(state.values[key], state.defaults[key]);
  function set(key, v) {
    if (v === '' || (typeof v === 'string' && v === state.defaults[key])) delete state.values[key];
    else state.values[key] = v;
    setDirty();
  }

  /* ── Rendering ──────────────────────────────────────────────────────── */
  function renderSection() {
    const content = $('#content');
    content.innerHTML = '';
    if (state.section === 'inquiries') return renderInquiries(content);
    if (state.section === 'help') return renderHelp(content);
    const section = state.schema.sections.find((s) => s.id === state.section) || state.schema.sections[0];
    state.section = section.id;
    $('#section-title').textContent = section.title;
    if (section.intro) content.append(h('p', { class: 'intro' }, section.intro));
    if (section.id === 'seo') content.append(renderPreviews());
    const card = h('div', { class: 'card' }, h('div', { class: 'card-body' }));
    for (const f of section.fields) $('.card-body', card).append(renderField(f));
    content.append(card);
    setDirty();
  }

  function counter(f, value) {
    if (!f.max) return null;
    const n = [...String(value || '')].length;
    const cls = n > f.max ? 'over' : f.max >= 50 && n >= f.max * 0.7 ? 'good' : '';
    return h('span', { class: `count ${cls}` }, `${n} / ${f.max}`);
  }

  function renderField(f, opts = {}) {
    // opts: { value, onChange, noDefault } for list sub-fields
    const nested = 'value' in opts;
    const value = nested ? opts.value : get(f.key);
    const changed = nested ? false : isChanged(f.key);
    const wrap = h('div', { class: `field${changed ? ' changed' : ''}${opts.wide ? ' wide' : ''}` });
    const label = h('div', { class: 'field-label' }, h('span', {}, f.label));
    const cnt = counter(f, value);
    if (cnt) label.append(cnt);
    wrap.append(label);

    const commit = (v) => {
      if (nested) opts.onChange(v);
      else set(f.key, v);
      const c = counter(f, v);
      if (c) label.querySelector('.count').replaceWith(c);
      wrap.classList.toggle('changed', !nested && isChanged(f.key));
      if (!nested) refreshDefaultNote();
      if (state.section === 'seo' && !nested) updatePreviews();
    };

    let input;
    if (f.type === 'textarea' || f.type === 'code') {
      input = h('textarea', { class: f.type === 'code' ? 'code' : '', oninput: (e) => commit(e.target.value) });
      input.value = value;
    } else if (f.type === 'select') {
      input = h('select', { onchange: (e) => commit(e.target.value) }, ...f.options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    } else if (f.type === 'image') {
      input = renderImage(f, value, commit);
    } else if (f.type === 'list') {
      input = renderList(f);
    } else {
      input = h('input', { type: f.type === 'url' ? 'url' : 'text', oninput: (e) => commit(e.target.value) });
      input.value = value;
    }
    wrap.append(input);
    if (f.help) wrap.append(h('p', { class: 'field-help' }, f.help));

    let note;
    const refreshDefaultNote = () => {
      if (nested || f.type === 'list') return;
      const def = state.defaults[f.key];
      note?.remove();
      if (isChanged(f.key) && def !== undefined && def !== '') {
        note = h('div', { class: 'field-foot' },
          h('span', { class: 'field-default' }, 'Default: ', h('em', {}, String(def).slice(0, 90) + (String(def).length > 90 ? '…' : ''))),
          h('button', { type: 'button', class: 'btn-link', onclick: () => { set(f.key, ''); renderSection(); } }, 'Reset to default'));
        wrap.append(note);
      }
    };
    refreshDefaultNote();
    return wrap;
  }

  function renderImage(f, value, commit) {
    const preview = h('div', { class: 'image-preview' }, value ? h('img', { src: value, alt: '' }) : 'No image');
    const url = h('input', { type: 'url', placeholder: 'https://… or /path.jpg', oninput: (e) => { commit(e.target.value); preview.innerHTML = ''; preview.append(e.target.value ? h('img', { src: e.target.value, alt: '' }) : 'No image'); } });
    url.value = value;
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml' });
    const uploadBtn = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => file.click() }, 'Upload image');
    file.addEventListener('change', async () => {
      const fl = file.files[0];
      if (!fl) return;
      if (fl.size > 4 * 1024 * 1024) return toast('Images must be under 4 MB', true);
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';
      try {
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(fl); });
        const out = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ name: fl.name, type: fl.type, data }) });
        url.value = out.url;
        commit(out.url);
        preview.innerHTML = '';
        preview.append(h('img', { src: out.url, alt: '' }));
        toast('Image uploaded — remember to save.');
      } catch (err) {
        toast(err.message, true);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload image';
        file.value = '';
      }
    });
    return h('div', { class: 'image-field' }, preview, h('div', { class: 'image-controls' }, url, h('div', { class: 'row' }, uploadBtn, file, h('span', { class: 'field-help' }, 'JPG, PNG, WebP, GIF or SVG · up to 4 MB'))));
  }

  function renderList(f) {
    const items = JSON.parse(JSON.stringify(get(f.key) || []));
    const box = h('div', { style: 'display:grid;gap:0.8rem' });
    const commit = () => { set(f.key, items); };
    const draw = () => {
      box.innerHTML = '';
      items.forEach((it, i) => {
        const body = h('div', { class: 'list-item-body' });
        for (const sub of f.item) {
          body.append(renderField(sub, { value: it[sub.key] ?? '', onChange: (v) => { it[sub.key] = v; commit(); title.textContent = it[f.itemLabel] || `Item ${i + 1}`; }, wide: sub.type === 'textarea' || sub.type === 'image' }));
        }
        const title = h('strong', {}, it[f.itemLabel] || `Item ${i + 1}`);
        box.append(h('div', { class: 'list-item' },
          h('div', { class: 'list-item-head' }, h('span', { class: 'idx' }, String(i + 1).padStart(2, '0')), title,
            h('button', { type: 'button', class: 'btn btn-sm', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; commit(); draw(); } }, '↑'),
            h('button', { type: 'button', class: 'btn btn-sm', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; commit(); draw(); } }, '↓'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => { if (confirm(`Remove "${it[f.itemLabel] || 'this item'}"?`)) { items.splice(i, 1); commit(); draw(); } } }, 'Remove')),
          body));
      });
      box.append(h('button', { type: 'button', class: 'btn list-add', onclick: () => { items.push(Object.fromEntries(f.item.map((s) => [s.key, '']))); commit(); draw(); } }, '+ Add project'));
      if (isChanged(f.key)) box.append(h('button', { type: 'button', class: 'btn-link', onclick: () => { set(f.key, ''); renderSection(); } }, 'Reset list to the built-in projects'));
    };
    draw();
    return box;
  }

  /* ── SEO previews ───────────────────────────────────────────────────── */
  let previewEls = null;
  function renderPreviews() {
    const host = (get('seo.canonical') || location.origin).replace(/^https?:\/\//, '').replace(/\/$/, '');
    previewEls = {
      serpTitle: h('div', { class: 'serp-title' }),
      serpDesc: h('div', { class: 'serp-desc' }),
      serpUrl: h('span', {}, host),
      socImg: h('div', { class: 'social-img' }),
      socTitle: h('div', { class: 'social-title' }),
      socDesc: h('div', { class: 'social-desc' }),
      socHost: h('div', { class: 'social-host' }, host),
    };
    const el = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Previews'), h('span', { class: 'field-help' }, 'Update live as you type')),
      h('div', { class: 'card-body' },
        h('div', { class: 'preview' },
          h('div', {}, h('p', { class: 'preview-label' }, 'Google result'),
            h('div', { class: 'serp' }, h('div', { class: 'serp-url' }, h('img', { src: '/favicon-32.png', alt: '' }), previewEls.serpUrl), previewEls.serpTitle, previewEls.serpDesc)),
          h('div', {}, h('p', { class: 'preview-label' }, 'Shared link (LinkedIn, X, Slack…)'),
            h('div', { class: 'social' }, previewEls.socImg, h('div', { class: 'social-body' }, previewEls.socHost, previewEls.socTitle, previewEls.socDesc))))));
    updatePreviews();
    return el;
  }
  function updatePreviews() {
    if (!previewEls) return;
    const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
    previewEls.serpTitle.textContent = clip(get('seo.title'), 60);
    previewEls.serpDesc.textContent = clip(get('seo.description'), 160);
    previewEls.socTitle.textContent = clip(get('seo.ogTitle') || get('seo.title'), 70);
    previewEls.socDesc.textContent = clip(get('seo.ogDescription') || get('seo.description'), 120);
    const img = get('seo.ogImage');
    previewEls.socImg.innerHTML = '';
    if (img) previewEls.socImg.append(h('img', { src: img, alt: '' }));
  }

  /* ── Inquiries (form entries) ───────────────────────────────────────── */
  async function loadInquiryCount() {
    try {
      const res = await api('/api/inquiries?limit=1');
      const n = res.counts?.new || 0;
      const b = $('#inq-badge');
      if (b) { b.textContent = n; b.hidden = !n; }
    } catch {}
  }
  async function renderInquiries(content) {
    $('#section-title').textContent = 'Form entries';
    content.append(h('p', { class: 'intro' }, 'Every message sent through the contact form. Click a row to read it.'));
    const card = h('div', { class: 'card' });
    content.append(card);
    card.append(h('div', { class: 'empty' }, 'Loading…'));
    try {
      const res = await api('/api/inquiries?limit=200');
      state.inquiries = res.items || [];
      card.innerHTML = '';
      const c = res.counts || {};
      card.append(h('div', { class: 'card-head' }, h('h2', {}, `${c.total || 0} entries`), h('span', { class: 'field-help' }, `${c.new || 0} new · ${c.replied || 0} replied · ${c.archived || 0} archived`)));
      if (!state.inquiries.length) return card.append(h('div', { class: 'empty' }, 'No entries yet. Note: on Vercel, entries are only kept when email delivery is configured — the notification email is the durable record.'));
      const table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'From'), h('th', {}, 'Budget'), h('th', {}, 'Received'), h('th', {}, 'Status'))));
      const tbody = h('tbody');
      for (const it of state.inquiries) {
        const row = h('tr', { class: `row${it.status === 'new' ? ' is-new' : ''}`, onclick: () => showInquiry(it) },
          h('td', {}, it.name, h('div', { class: 'field-help' }, it.email)), h('td', {}, it.budget), h('td', {}, new Date(it.created_at).toLocaleString()), h('td', {}, h('span', { class: `pill ${it.status}` }, it.status)));
        tbody.append(row);
      }
      table.append(tbody);
      card.append(table);
    } catch (err) {
      card.innerHTML = '';
      card.append(h('div', { class: 'empty' }, err.message));
    }
  }
  function showInquiry(it) {
    const content = $('#content');
    content.innerHTML = '';
    $('#section-title').textContent = it.name;
    const card = h('div', { class: 'card' }, h('div', { class: 'card-body detail' },
      h('dl', {}, h('dt', {}, 'Email'), h('dd', {}, h('a', { href: `mailto:${it.email}` }, it.email)), h('dt', {}, 'Budget'), h('dd', {}, it.budget), h('dt', {}, 'Received'), h('dd', {}, new Date(it.created_at).toLocaleString()), h('dt', {}, 'Emailed'), h('dd', {}, it.emailed ? 'yes' : `no${it.email_error ? ` — ${it.email_error}` : ''}`)),
      h('pre', {}, it.message),
      h('div', { class: 'actions' },
        ...['new', 'read', 'replied', 'archived'].map((s) => h('button', { type: 'button', class: `btn btn-sm${it.status === s ? ' btn-primary' : ''}`, onclick: async () => { try { await api(`/api/inquiries/${it.id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) }); it.status = s; toast(`Marked as ${s}`); showInquiry(it); loadInquiryCount(); } catch (e) { toast(e.message, true); } } }, `Mark ${s}`)),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => go('inquiries') }, '← All entries'))));
    content.append(card);
  }

  /* ── Help ───────────────────────────────────────────────────────────── */
  function renderHelp(content) {
    $('#section-title').textContent = 'Help';
    content.append(h('div', { class: 'card' }, h('div', { class: 'card-body', html: `
      <h2>How this editor works</h2>
      <p>Every text field here maps to one place on the live site. Change it, press <b>Save changes</b> (or <span class="kbd">Ctrl</span>+<span class="kbd">S</span>), and the live page picks it up within about a minute — no developer, no deploy.</p>
      <p>Leaving a field empty means "use the built-in default". <b>Reset to default</b> appears under any field you have changed.</p>
      <h2>SEO checklist</h2>
      <ul>
        <li><b>Page title</b> — 50–60 characters, most important words first, brand at the end.</li>
        <li><b>Meta description</b> — 120–160 characters, a real sentence with a reason to click.</li>
        <li><b>Social title / description / image</b> — what LinkedIn, X, Slack and WhatsApp show. The image should be 1200×630.</li>
        <li><b>Search engine visibility</b> — keep it "Visible" unless the site is being rebuilt.</li>
        <li><b>Custom &lt;head&gt; code</b> — paste Search Console or Bing verification tags and analytics snippets here.</li>
      </ul>
      <h2>Images</h2>
      <p>Upload straight from the field, or paste a URL. Uploads are stored with the site and served from a CDN.</p>
      <h2>What needs a developer</h2>
      <p>Layout, colours, fonts, the 3D scenes and the animations. Everything that is words, links, images and metadata lives here.</p>
    ` })));
  }

  boot();
})();

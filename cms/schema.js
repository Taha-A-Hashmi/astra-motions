/* ═══════════════════════════════════════════════════════════════════════
   cms/schema.js — everything the SEO dashboard can edit, in one place.

   Shared by the server (which injects values into the HTML and validates
   saves), the admin UI (which renders a form from it) and the dev client
   (which applies values in the browser when Vite serves the raw HTML).

   A field has a `key`, a `type`, and one or more `target`s describing where
   its value lands in the page:
     { sel: 'key' }            innerHTML of the element with data-cms="key"
     { sel, letters: true }    same, but one <span class="ch"> per character
     { meta: 'name' }          <meta name="…" content>
     { prop: 'og:…' }          <meta property="…" content>
     { title: true }           <title>
     { link: 'canonical' }     <link rel="…" href>
     { jsonld: 'field' }       a top-level field of the Organization JSON-LD
     { headHtml: true }        raw HTML inserted before </head>
     { list: 'work' }          the element with data-cms-list="work" is
                               re-rendered from the item template
   ═══════════════════════════════════════════════════════════════════════ */

export const site = {
  name: 'Astro Motions',
  accent: '#efcd7a',
  url: 'https://www.astromotions.com/',
};

const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const area = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });

export const sections = [
  {
    id: 'seo',
    title: 'Site & SEO',
    intro: 'What search engines and social networks see. Titles and descriptions have live length counters and previews.',
    fields: [
      text('seo.title', 'Page title', { max: 70, target: [{ title: true }, { sel: 'seo.title' }], help: 'The browser-tab title and the headline in Google results. Aim for 50–60 characters.' }),
      area('seo.description', 'Meta description', { max: 160, target: [{ meta: 'description' }, { sel: 'seo.description' }], help: 'The grey text under the headline in Google. 120–160 characters.' }),
      text('seo.canonical', 'Canonical URL', { type: 'url', target: { link: 'canonical' }, help: 'The one true address of this page. Leave as-is unless the domain changes.' }),
      { key: 'seo.robots', label: 'Search engine visibility', type: 'select', target: { meta: 'robots' }, options: [['index, follow', 'Visible — allow indexing'], ['noindex, nofollow', 'Hidden — discourage indexing']] },
      text('seo.ogTitle', 'Social title', { max: 70, target: [{ prop: 'og:title' }, { meta: 'twitter:title' }], help: 'Used when the link is shared on LinkedIn, X, Slack, WhatsApp…' }),
      area('seo.ogDescription', 'Social description', { max: 200, target: [{ prop: 'og:description' }, { meta: 'twitter:description' }] }),
      { key: 'seo.ogImage', label: 'Social image', type: 'image', target: [{ prop: 'og:image' }, { meta: 'twitter:image' }, { jsonld: 'image' }], help: '1200×630 JPG or PNG. Upload one or paste a URL.' },
      text('seo.siteName', 'Site name', { target: [{ prop: 'og:site_name' }, { meta: 'author' }, { jsonld: 'name' }] }),
      area('seo.orgDescription', 'Organisation description (structured data)', { max: 300, target: { jsonld: 'description' }, help: 'Feeds the schema.org Organization block that Google reads.' }),
      { key: 'seo.headHtml', label: 'Custom <head> code', type: 'code', target: { headHtml: true }, help: 'Verification tags (Google Search Console, Bing), analytics snippets, extra meta tags. Inserted verbatim before </head>.' },
    ],
  },
  {
    id: 'brand',
    title: 'Brand & navigation',
    intro: 'The name in the corner, the header buttons and the footer line.',
    fields: [
      text('brand.name', 'Studio name', { max: 40, target: { sel: 'brand.name' }, help: 'Loading screen, sheet header and fallbacks.' }),
      text('brand.wordmark', 'Header wordmark', { max: 12, target: { sel: 'brand.wordmark' } }),
      text('nav.work', 'Header link · work sheet', { max: 24, target: { sel: 'nav.work' } }),
      text('nav.contact', 'Header button · contact', { max: 24, target: { sel: 'nav.contact' } }),
      text('nav.workLink', 'In-page link to the work sheet', { max: 24, target: { sel: 'nav.workLink' } }),
      text('footer.copyright', 'Footer line', { max: 60, target: { sel: 'footer.copyright' } }),
      text('footer.top', 'Footer · back-to-top label', { max: 30, target: { sel: 'footer.top' } }),
    ],
  },
  {
    id: 'stages',
    title: 'Stages',
    intro: 'The six scroll stages of the page, top to bottom. Each has a small index label and one line.',
    fields: [
      text('hero.word', 'Stage 1 · Hero wordmark', { max: 8, target: { sel: 'hero.word', letters: true }, help: 'Also the word the stars spell at stage 4 after the next deploy. Keep it short — each letter animates in.' }),
      text('hero.sub', 'Stage 1 · Sub-line', { max: 24, target: { sel: 'hero.sub' } }),
      text('hero.tagline', 'Stage 1 · Tagline', { max: 60, target: { sel: 'hero.tagline' } }),
      text('stage1.index', 'Stage 2 · Index', { max: 30, target: { sel: 'stage1.index' } }),
      text('stage1.line', 'Stage 2 · Line', { max: 60, target: { sel: 'stage1.line' } }),
      text('stage2.index', 'Stage 3 · Index', { max: 30, target: { sel: 'stage2.index' } }),
      text('stage2.line', 'Stage 3 · Line', { max: 60, target: { sel: 'stage2.line' } }),
      text('stage3.index', 'Stage 4 · Index', { max: 30, target: { sel: 'stage3.index' } }),
      text('stage3.line', 'Stage 4 · Line', { max: 60, target: { sel: 'stage3.line' } }),
      text('stage3.d1', 'Stage 4 · Discipline 1', { max: 16, target: { sel: 'stage3.d1' } }),
      text('stage3.d2', 'Stage 4 · Discipline 2', { max: 16, target: { sel: 'stage3.d2' } }),
      text('stage3.d3', 'Stage 4 · Discipline 3', { max: 16, target: { sel: 'stage3.d3' } }),
      text('stage4.index', 'Stage 5 · Index', { max: 30, target: { sel: 'stage4.index' } }),
      text('stage4.line', 'Stage 5 · Line', { max: 60, target: { sel: 'stage4.line' } }),
      text('stage5.index', 'Stage 6 · Index', { max: 30, target: { sel: 'stage5.index' } }),
      text('stage5.line', 'Stage 6 · Line', { max: 60, target: { sel: 'stage5.line' } }),
      text('cta.summit', 'Stage 6 · Button label', { max: 24, target: { sel: 'cta.summit' } }),
    ],
  },
  {
    id: 'contact',
    title: 'Contact form',
    intro: 'The panel that opens from every contact button.',
    fields: [
      text('contact.eyebrow', 'Eyebrow', { max: 30, target: { sel: 'contact.eyebrow' } }),
      text('contact.title', 'Title', { max: 60, target: { sel: 'contact.title' } }),
      area('contact.lede', 'Intro text', { max: 240, target: { sel: 'contact.lede' } }),
      text('contact.nameLabel', 'Field label · name', { max: 24, target: { sel: 'contact.nameLabel' } }),
      text('contact.emailLabel', 'Field label · email', { max: 24, target: { sel: 'contact.emailLabel' } }),
      text('contact.messageLabel', 'Field label · message', { max: 40, target: { sel: 'contact.messageLabel' } }),
      text('contact.budgetLabel', 'Field label · budget', { max: 30, target: { sel: 'contact.budgetLabel' } }),
      text('contact.submit', 'Submit button', { max: 20, target: { sel: 'contact.submit' } }),
      text('contact.doneTitle', 'Success · title', { max: 60, target: { sel: 'contact.doneTitle' } }),
      area('contact.doneText', 'Success · text', { max: 200, target: { sel: 'contact.doneText' } }),
    ],
  },
  {
    id: 'work',
    title: 'Launch log',
    intro: 'The work sheet. Wrap a word in *asterisks* in the title to set it in italic gold.',
    fields: [
      text('work.tab', 'Sheet tab label', { max: 24, target: { sel: 'work.tab' } }),
      text('work.eyebrow', 'Eyebrow', { max: 30, target: { sel: 'work.eyebrow' } }),
      text('work.title', 'Title', { max: 60, type: 'rich', target: { sel: 'work.title' } }),
      area('work.lede', 'Intro text', { max: 260, target: { sel: 'work.lede' } }),
      area('work.footText', 'Footer text', { max: 200, target: { sel: 'work.footText' } }),
      text('work.footCta', 'Footer button', { max: 24, target: { sel: 'work.footCta' } }),
      {
        key: 'work.items',
        label: 'Projects',
        type: 'list',
        target: { list: 'work' },
        itemLabel: 'title',
        item: [
          text('title', 'Title', { max: 60 }),
          text('meta', 'Meta line', { max: 60, help: 'e.g. Client · Type · Year' }),
          area('description', 'Description', { max: 260 }),
          text('href', 'Link', { type: 'url' }),
          text('tags', 'Tags', { max: 60, help: 'Comma-separated, three reads best.' }),
          { key: 'image', label: 'Thumbnail', type: 'image', help: '16:10 works best (1600×1000).' },
          text('alt', 'Image alt text', { max: 160, help: 'Describe the image for screen readers and search engines.' }),
        ],
        default: [
          { title: 'A Year of Discovery', meta: 'OceanX · Year in review · 2025', description: 'Twelve months of ocean missions retold as one continuous voyage: you scroll, the globe turns, and each expedition surfaces where it happened.', href: 'https://2025.oceanx.org/', tags: 'WebGL, Narrative, Scroll', image: '/work/oceanx-2025.jpg', alt: 'OceanX 2025 Year in Review — a globe over a deep-sea blue field' },
          { title: 'The Intelligent File Browser', meta: 'Poly · Product site', description: 'A file browser you talk to, introduced on a rendered desk the camera settles into — search, chat and sync shown in place, not in a feature grid.', href: 'https://poly.app/', tags: '3D, Product, Motion', image: '/work/poly.jpg', alt: 'Poly — the intelligent file browser, shown on a laptop on a sunlit desk' },
          { title: 'You Are Limitless', meta: 'Organimo · Brand commerce', description: 'A supplement sold the way a fragrance is: dark, slow, sound-led, with the product held up like an object worth wanting.', href: 'https://organimo.com/', tags: 'Commerce, Brand, Audio', image: '/work/organimo.jpg', alt: 'Organimo — Limitless begins here: a pastel dreamscape with floating stone, a shell and a goldfish' },
          { title: 'Yard Operating System', meta: 'Terminal Industries · Product site', description: 'Logistics software given the treatment of a car film: wide photography, product renders, and a page that moves at the pace of a trailer.', href: 'https://terminal-industries.com/', tags: 'Industrial, Photography, Scroll', image: '/work/terminal-industries.jpg', alt: 'Terminal Industries — a semi truck silhouetted against a sunset' },
        ],
      },
    ],
  },
];

/** Every editable field, flat, keyed. */
export const fields = Object.fromEntries(sections.flatMap((s) => s.fields.map((f) => [f.key, f])));

export const targetsOf = (f) => (Array.isArray(f.target) ? f.target : f.target ? [f.target] : []);

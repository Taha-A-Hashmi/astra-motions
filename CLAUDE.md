# Astro Motions

Immersive single-page WebGL site ("Starlight" brand): the entire visible site
is one three.js scene; scrolling ascends from the ground into orbit through
six stages. Geometry is procedural; the planets, moons and the Milky Way sky
are textured with Solar System Scope maps (CC BY 4.0 — credited in the
Launch-log sheet; keep that credit). Was "Astra Motions" until 2026-09-15.

Astro is a sibling of the Apex Motions Studio site (`E:\Work\Apex Motions
Studio`) with the same architecture and a distinct brand: indigo void, one
pale-gold "starlight" accent, serif display type, rectangular hairline
controls with a diamond spark, and an orbital (not alpine) scene. Keep the
two visually distinct — never copy Apex's ember/obsidian look back in.

## Stage vocabulary (use these names — the owner refers to stages, not beats)

| Stage | Code beat index | Scene | refs |
|-------|-----------------|-------|------|
| Stage 1 | beat 0 | Ringed gas giant (textured sphere, cooled to indigo) with a Saturn-style band + dust ring, a small grey moon, and the gold "moon" dot riding the ring. Hover warms it; click sends a shockwave torus out through the ring | `planet`, `heroRing` (group), `heroBand`, `heroWave`, `heroMoon`, `heroDot`, `heroDotLight` |
| Stage 2 | beat 1 | Belt of identical grey textured moons on two counter-rotating rings, **no mouse interaction**, no gold light | `orbitals`, `modules` |
| Stage 3 | beat 2 | The Guide is introduced — the gold dot detaches from the header mark's orbit (the mark's dot shrinks away) and flies into the scene as a wisp with particle tail + orbiting chips; follows the ascent to the star | `guide` (origin = `.mark-dot` unprojected) |
| Stage 4 | beat 3 | Starline particles spelling "ASTRO" in the brand serif; pushed by both cursor and the Guide. Re-laid-out via `trail.userData.relayout()` once webfonts load | `trail` |
| Stage 5 | beat 4 | Nebula deck filling the frame — violet puffs; the camera rides above it toward the star | `clouds` |
| Stage 6 | beat 5 | The star: gold core, thin ring, dust halo, a Mars-textured world and a moon in orbit; the Guide merges into the core | `star{core,ring,halo,planets,glowLight,sprite,center,flare}` |

Beat centers: `beatCenter(i) = (0, i*ELEV(6), -i*DEPTH(26))`. Stage N lives at
beat index N-1. Scroll progress `p` runs 0→1 over the ascent; stage N's
statement is centered at `p = (N-1)/5`. The star's `center` sits above the
beat-5 statement (`c.y + 3.6`), so the words sit under the ring, not behind
the core.

The passage between stages 2 and 4 is filled with drifting noise-displaced
asteroids (`debris`, rock texture) and gold dust motes (`motes`). Behind
everything: a Milky Way sky dome (`sky`, inside-out sphere, fog-free) plus
two star Points layers. Nothing in the scene is sharp-edged on purpose —
the owner asked for "stars and planetary objects instead of sharp and solid
objects" (2026-09-15).

## Textures

`public/tex/{1k,2k}/{gas-giant,ice-giant,moon,mars,rock,milky-way}.jpg` +
`public/tex/ring-alpha.png`, resized from Solar System Scope 2k maps with the
scratchpad `resize-tex.mjs`. `quality.textures` picks 1k on mid/low tiers.

## Mobile performance (`src/quality.js`)

One tier decision at boot — `high` (desktop), `mid` (few cores / tablets),
`low` (phones) — from pointer type, `deviceMemory`, `hardwareConcurrency`
and viewport. It drives: particle counts (`N()` in world.js), sphere
segments (`SEG()`), the post pipeline (`full` bloom+pixel+grade / `lite`
half-res bloom+grade / `none` direct render), antialias, DPR cap
(2 / 1.5 / 1.2), texture set, and whether statements get the CSS blur.
`?q=low|mid|high` forces a tier for testing. main.js also watches frame
time and steps DPR down to 0.75 if the 90-frame average exceeds 26 ms.
Touch devices also lose `backdrop-filter` on the glass (style.css).

## Commands

- `npm run dev` — Vite dev server at http://localhost:5173 (proxies `/api` → 8787)
- `npm run server` — backend API on http://localhost:8787 (auto-reloads)
- `npm run dev:all` — both of the above in one terminal
- `npm run build` — production build to `dist/`
- `npm start` — production: one Node process serves `dist/` **and** `/api`

## Architecture — frontend

- `src/main.js` — renderer, post pipeline (RenderPass → UnrealBloom(0.45/0.7/0.85)
  → Pixel(break effect) → Grade(vignette+grain+edge chromatic split) → Output),
  greeting-veil intro, hero letter reveal, cursor-following gold point light,
  custom cursor ring, ascent-rail clicks, portrait FOV framing, frame loop.
- `src/world.js` — builds all stages, exports `ELEV/DEPTH/BEATS/beatCenter/
  createWorld/tickWorld`. `tickWorld` = scroll-independent idle motion.
  `refs.stageObjects[i]` lists each stage's meshes so choreography can cull
  distant stages. Every `Points` material uses the shared soft dot texture
  (`makePointTexture`) — never ship square points. `makeDustRing` builds the
  planet ring and the star halo.
- `src/scroll.js` — Lenis + ScrollTrigger scrub → single progress value.
- `src/choreography.js` — maps `p` to camera spline, statement opacity/blur,
  rail + HUD (altitude 100 km → 35,786 km; stage names PAD/STAGE 0N/ORBIT),
  stage culling, nebula roll-in (`refs.cloudsFade`), star wake-up (light,
  sprite, ring emissive, core colour dim→lit) + nebula gold tint, Guide anchor.
- `src/interactions.js` — Raycaster layer: planet crack/burst, Guide
  shy-away, starline push (cursor + Guide), star flare (click the core, ring
  or a planet). Receives `fx.pixelPulse`; exposes `isHot()` for the cursor.
- `src/contact.js` — contact overlay. POSTs to `/api/contact`; handles 422
  field errors, 429, and the sent state. Returns `{ show, hide, isOpen }`.
- `src/sheets.js` + `src/sheets.css` — the Launch-log (work) sheet and the
  router for every `[data-open]` control (`work` / `contact`). Scrollable
  sheet/contact panels carry `data-lenis-prevent`. **There is no Team sheet
  and no named people anywhere on the site** — the owner removed them on
  2026-09-13; don't add portraits, names or founder metadata back. Work:
  the same four reference sites as Apex (thumbnails in `public/work/`).

## Architecture — backend (`server/`)

Identical to Apex: Express 5 on Node ≥ 22.13, storage on `node:sqlite`.
Same app runs long-lived (`server/index.js`) or as a Vercel function
(`api/index.js` + `vercel.json` rewrite). Routes: `GET /api/health`,
`POST /api/contact` (honeypot `company`, `elapsed` guard, 5/10 min per IP),
admin `GET/PATCH /api/inquiries[/:id]` behind `Authorization: Bearer ADMIN_TOKEN`.

**The SEO dashboard** lives at `/admin/` (password = `ADMIN_TOKEN` on the
Vercel project; see it in Vercel → Settings → Environment Variables). Files:
`cms/schema.js` (every editable field, its label/type/limits and where it
lands: `sel` → `data-cms="key"` element, `meta`/`prop`/`title`/`link`/
`jsonld`/`headHtml`, or `list` → `data-cms-list="work"`), `cms/templates.js`
(escaping + the work-card template), `server/content.js` (storage: Vercel
Blob store `astro-cms` via `BLOB_READ_WRITE_TOKEN`, else `DATA_DIR/cms/`),
`server/cms.js` (renders `dist/shell.html` with saved values injected + the
`/api/admin/*` routes), `src/content.js` (dev-only client apply),
`public/admin/*` (the editor UI). The Vite build renames `index.html` →
`shell.html` and `vercel.json` rewrites `/` to the function, so crawlers see
edited titles/meta without a rebuild; saved values also ride on
`window.__CMS__`. To add an editable field: add it to the schema and put
`data-cms="key"` on the element (wrap button text in a span if the button
also holds an arrow). Empty value = "use the HTML default". The function
reads the shell from disk (`includeFiles`) or fetches `/shell.html` from
the CDN as fallback; `/api/health` reports which (`shell`).

**Mail is NOT configured for Astro.** There is no Astro mailbox; `CONTACT_TO`
is empty in `.env.example` and no mail env vars are set on Vercel, so the
live form stores inquiries only — and on Vercel storage is `/tmp`, so they
are effectively lost. Set `CONTACT_TO` + Resend or SMTP on the Vercel
project before using the form for real.

## Conventions

- Design tokens in `src/style.css`: `--void #05060d`, `--ink #0c0f1c`,
  `--star #f2f0ea` (text), `--haze #8b90a8`, `--gold #efcd7a`. One accent
  only; the nebula tints (violet/teal/rose) stay in the background.
- Type: Cormorant Garamond (display, 300/400/500 + italic), Manrope (body),
  DM Mono (instruments). The hero wordmark is Cormorant 400 tracked 0.18em.
- Copy voice is launch/orbit, deliberately unlike Apex's cadence: stage
  indexes Liftoff / Escape velocity / The studio / Deep field / Arrival;
  CTA "Book a launch"; the work sheet is the "Launch log"; HUD reads
  PAD … ORBIT and "SCROLL TO LIFT OFF" / "ORBIT REACHED". Keep it that way.
- Ornament: `✦` flanks statement indexes and sheet eyebrows (no rules).
  Controls are 2px-radius rectangles; the glyph is a rotated-square
  "spark" (`.cta-dot`, `.header-contact .dot`, rail ticks, cursor dot).
- Bloom threshold is 0.85 on purpose — only true emitters may bloom
  (gold dots, Guide head, star core). Materials brighter than ~0x50xxxx
  risk blooming. The star core starts dim (`coreDim`) and is lifted by
  choreography, so it never blooms before stage 6.
- Idle motion lives in `tickWorld`; scroll-driven state in `choreography`;
  cursor-driven state in `interactions`. Cross-layer values ride on
  `refs.*.userData` or dedicated refs fields (e.g. `star.flare`).
- GSAP tween on an element centered with CSS `translate(-50%,-50%)` must set
  `xPercent:-50, yPercent:-50` or it destroys the centering.
- Every `<button>` in the overlay must reset `appearance`/`background`.
- `.statement p` has high specificity; style special statement children as
  `.statement p.foo`, not `.foo`.
- Verify visually before shipping: headless Chrome (puppeteer-core +
  `C:\Program Files\Google\Chrome\Application\chrome.exe`), screenshot each
  stage plus interactions, check console errors.
- Icons, OG image and `branding/*.svg` are generated from the mark SVG
  (orbit ellipse + four-point star + gold dot) with a puppeteer script;
  regenerate all of them together if the mark changes.

## Accounts / deployment (IMPORTANT)

- GitHub: https://github.com/Taha-A-Hashmi/astro-motions — owner is
  Taha-A-Hashmi (taha.a.hashmi@gmail.com). NEVER use or reference the
  knwn4official account or email anywhere in this project.
- Vercel: project `astro-motions` (renamed from astra-motions; team
  taha-a-hashmis-projects), connected to the GitHub repo, so every push to
  `main` deploys production. **Live domain: https://www.astromotions.com/**
  (owner-bought; apex 308-redirects to www). Also astro-motions.vercel.app.
  Canonical/OG URLs in index.html point at www.astromotions.com.

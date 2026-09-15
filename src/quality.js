/* ═══════════════════════════════════════════════════════════════════════
   quality.js — one decision about how much the device can afford, made
   once at boot and read by every layer.

   Tiers:
     high  desktop with a real GPU: full post pipeline, 2k textures, DPR 2
     mid   laptops with few cores, big tablets: half-res bloom, 1k textures
     low   phones: no post pipeline at all, a third of the particles, DPR 1.2

   `?q=low|mid|high` on the URL forces a tier for testing. main.js also
   steps the render resolution down at runtime if frames keep missing.
   ═══════════════════════════════════════════════════════════════════════ */
const coarse = window.matchMedia('(pointer: coarse)').matches;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mem = navigator.deviceMemory ?? (coarse ? 4 : 8);
const cores = navigator.hardwareConcurrency ?? 4;
const small = Math.min(window.innerWidth, window.innerHeight) < 600;

let tier = 'high';
if (coarse || small) tier = mem <= 3 || cores <= 4 ? 'low' : 'mid';
else if (cores <= 4 || mem <= 4) tier = 'mid';

const forced = new URLSearchParams(location.search).get('q');
if (forced === 'low' || forced === 'mid' || forced === 'high') tier = forced;

const pick = (table) => table[tier];

export const quality = Object.freeze({
  tier,
  coarse,
  reduced,
  /** multiplier for every particle / sprite count in the world */
  particles: pick({ high: 1, mid: 0.55, low: 0.32 }),
  /** hard cap on devicePixelRatio */
  maxDpr: pick({ high: 2, mid: 1.5, low: 1.2 }),
  /** 'full' = bloom + pixel + grade · 'lite' = half-res bloom + grade · 'none' */
  post: pick({ high: 'full', mid: 'lite', low: 'none' }),
  antialias: tier === 'high',
  /** which texture set to load from /tex */
  textures: tier === 'high' ? '2k' : '1k',
  /** CSS blur on the statements is expensive on phones — skip it there */
  blurStatements: tier === 'high',
  /** sphere segment multiplier */
  detail: pick({ high: 1, mid: 0.75, low: 0.55 }),
});

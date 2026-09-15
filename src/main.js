/* ═══════════════════════════════════════════════════════════════════════
   main.js — bootstrap. Wires renderer + world + scroll + choreography
   together, adds the cinematic post pipeline, and runs the frame loop.

   Post pipeline (quality 'full'):
       render → bloom (the star bleeds like real light)
              → pixel (Samana-style break effect, free at rest)
              → grade (vignette + film grain + edge chromatic split)
              → output (tone mapping + color space)
   'lite' drops the pixel pass and runs bloom at half resolution; 'none'
   renders straight to the canvas. On top of that the frame loop watches
   its own timing and steps the resolution down if frames keep missing.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { quality } from './quality.js';
import { createWorld, tickWorld } from './world.js';
import { createScroll } from './scroll.js';
import { createChoreography } from './choreography.js';
import { createInteractions } from './interactions.js';
import { createContact } from './contact.js';
import { createSheets } from './sheets.js';
import { applyContent } from './content.js';

const { reduced, coarse } = quality;

// Editable copy (the SEO dashboard) — in production the server has
// already injected it into the HTML; in dev this fetches and applies it.
applyContent();

/* ── Renderer — fail soft if WebGL isn't available ──────────────────────── */
const canvas = document.querySelector('canvas.webgl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    powerPreference: 'high-performance',
  });
} catch {
  document.querySelector('.veil').style.display = 'none';
  document.querySelector('.webgl-fail').hidden = false;
  throw new Error('WebGL unavailable');
}
let dpr = Math.min(window.devicePixelRatio, quality.maxDpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;

/* ── Scene, camera, world ───────────────────────────────────────────────── */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 260);
scene.add(camera);

// Environment reflections give the planets and the star's ring their
// sheen. A neutral room env at low intensity, generated once.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
scene.environmentIntensity = 0.5;
pmrem.dispose();

const refs = createWorld(scene);
const scroll = createScroll({ reduced });
const choreography = createChoreography({ camera, refs });
const contact = createContact({ lenis: scroll.lenis });
// view.dolly: how far the camera pushes forward while a sheet is open —
// the scene leans in behind the glass. Tweened by sheets.js.
const view = { dolly: 0 };

/* ── Post-processing ────────────────────────────────────────────────────── */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      float ca = 0.0028 * smoothstep(0.18, 0.85, d);
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + dir * ca).r;
      c.b = texture2D(tDiffuse, vUv - dir * ca).b;
      c.rgb *= 1.0 - smoothstep(0.45, 0.98, d) * 0.26;
      c.rgb += (rand(vUv * 917.0 + fract(uTime) * 7.0) - 0.5) * 0.018;
      gl_FragColor = c;
    }`,
};

const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uPixel: { value: 1 },
    uMix: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uPixel;
    uniform float uMix;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uMix > 0.001) {
        vec2 grid = uRes / max(uPixel, 1.0);
        vec2 quv = (floor(vUv * grid) + 0.5) / grid;
        gl_FragColor = mix(c, texture2D(tDiffuse, quv), uMix);
      } else {
        gl_FragColor = c;
      }
    }`,
};

let composer = null;
let bloom = null;
let pixel = null;
let grade = null;
if (quality.post !== 'none') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomRes =
    quality.post === 'full'
      ? new THREE.Vector2(window.innerWidth, window.innerHeight)
      : new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
  // strength / radius / threshold — 0.85 so ONLY true emitters (gold dots,
  // the star, glow sprites) bloom; lit planets must never wash out
  bloom = new UnrealBloomPass(bloomRes, 0.45, 0.7, 0.85);
  composer.addPass(bloom);
  if (quality.post === 'full') {
    pixel = new ShaderPass(PixelShader);
    composer.addPass(pixel);
  }
  grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
}

/* fx.pixelPulse: momentary pixel-break, shared with the interaction layer.
   A no-op on tiers without the pixel pass. */
const fx = {
  pixelPulse(strength = 1, duration = 0.7) {
    if (reduced || !pixel) return;
    const u = pixel.uniforms;
    gsap.killTweensOf(u.uMix);
    gsap.killTweensOf(u.uPixel);
    u.uMix.value = Math.min(1, 0.9 * strength);
    u.uPixel.value = 6 + 22 * strength;
    gsap.to(u.uPixel, { value: 1, duration, ease: 'power3.out' });
    gsap.to(u.uMix, { value: 0, duration: duration * 1.05, ease: 'power2.out' });
  },
};

const interactions = createInteractions({ camera, refs, canvas, fx });
createSheets({ lenis: scroll.lenis, fx, contact, view, reduced, coarse });

/* ── Mouse parallax: the camera leans toward the cursor ─────────────────── */
const pointer = { x: 0, y: 0 };
const parallax = { x: 0, y: 0 };
let pointerActive = false;
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  pointerActive = true;
});

/* ── Custom cursor: a ring that answers whatever it crosses ─────────────── */
const cursorEl = document.querySelector('.cursor');
const cursorPos = { x: -100, y: -100, tx: -100, ty: -100 };
let cursorShown = false;
if (!coarse && !reduced) {
  window.addEventListener('pointermove', (e) => {
    cursorPos.tx = e.clientX;
    cursorPos.ty = e.clientY;
    if (!cursorShown) {
      cursorShown = true;
      cursorPos.x = e.clientX;
      cursorPos.y = e.clientY;
      document.body.classList.add('has-cursor');
      gsap.to(cursorEl, { opacity: 1, duration: 0.4 });
    }
    const link = e.target.closest?.('button, a, label, input, textarea');
    cursorEl.classList.toggle('link', Boolean(link));
  });
  window.addEventListener('pointerdown', () => cursorEl.classList.add('down'));
  window.addEventListener('pointerup', () => cursorEl.classList.remove('down'));
  document.addEventListener('mouseleave', () => gsap.to(cursorEl, { opacity: 0, duration: 0.3 }));
  document.addEventListener('mouseenter', () => cursorShown && gsap.to(cursorEl, { opacity: 1, duration: 0.3 }));
}
function updateCursor() {
  if (!cursorShown) return;
  cursorPos.x += (cursorPos.tx - cursorPos.x) * 0.35;
  cursorPos.y += (cursorPos.ty - cursorPos.y) * 0.35;
  cursorEl.style.transform = `translate3d(${cursorPos.x.toFixed(1)}px, ${cursorPos.y.toFixed(1)}px, 0)`;
  cursorEl.classList.toggle('hot', interactions.isHot());
}

/* ── Ascent rail: click a tick to travel to that stage ──────────────────── */
document.querySelectorAll('.rail-tick').forEach((tick) => {
  tick.addEventListener('click', () => {
    const stage = Number(tick.dataset.stage);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scroll.lenis.scrollTo((stage / 5) * max, { duration: 1.9 });
  });
});

/* ── Cursor illumination: a pale gold lantern rides the cursor's ray ────── */
const cursorLight = new THREE.PointLight(0xf3dfa8, 0, 26, 2);
scene.add(cursorLight);
const cursorTarget = new THREE.Vector3();
const cursorDir = new THREE.Vector3();
function updateCursorLight() {
  if (!pointerActive || coarse) return;
  cursorDir.set(pointer.x, -pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
  cursorTarget.copy(camera.position).addScaledVector(cursorDir, 9);
  cursorLight.position.lerp(cursorTarget, 0.12);
  if (cursorLight.intensity < 3.5) cursorLight.intensity += (3.5 - cursorLight.intensity) * 0.03;
}

/* ── Framing: portrait screens get a wider lens ─────────────────────────── */
function frameCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 0.75 ? 62 : aspect < 1 ? 52 : 42;
  camera.updateProjectionMatrix();
}
frameCamera();

/* ── Resize + resolution ────────────────────────────────────────────────── */
function applySize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(dpr);
  if (composer) {
    composer.setPixelRatio(dpr);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  if (pixel) pixel.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', () => {
  frameCamera();
  applySize();
});

/* Adaptive resolution: if the average frame keeps missing ~40 fps, step
   the pixel ratio down a notch (never below 0.75). Cheap insurance for
   phones and old laptops; it never steps back up, so it can't oscillate. */
let frames = 0;
let accum = 0;
let last = performance.now();
function watchFrameTime(now) {
  accum += now - last;
  last = now;
  if (++frames < 90) return;
  const avg = accum / frames;
  frames = 0;
  accum = 0;
  if (avg > 26 && dpr > 0.75) {
    dpr = Math.max(0.75, +(dpr - 0.25).toFixed(2));
    applySize();
  }
}

/* ── Frame loop ─────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();
function tick() {
  const elapsed = clock.getElapsedTime();

  tickWorld(refs, elapsed, reduced);
  choreography.update(scroll.progress());
  interactions.update(scroll.progress());

  if (!reduced && !coarse) {
    parallax.x += (pointer.x * 0.55 - parallax.x) * 0.04;
    parallax.y += (pointer.y * 0.35 - parallax.y) * 0.04;
    camera.position.x += parallax.x;
    camera.position.y -= parallax.y;
  }
  if (view.dolly > 0.001) camera.translateZ(-view.dolly);
  updateCursorLight();
  updateCursor();

  if (composer) {
    grade.uniforms.uTime.value = elapsed;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  watchFrameTime(performance.now());
  requestAnimationFrame(tick);
}
tick();

/* ── Arrival: greeting sequence on the pale veil, then the lift ─────────── */
const veil = document.querySelector('.veil');
const greetingEl = document.querySelector('.veil-greeting');
const barEl = document.querySelector('.veil-bar');
const countEl = document.querySelector('.veil-count');

const GREETINGS = ['Hello', 'Salut', 'Hej', 'Ciao', 'Hola', 'こんにちは', 'Merhaba', 'Olá', '안녕하세요'];

// The ASTRO starline is rasterised from the brand serif; once the webfont is
// actually in, lay the word out again so it is never the fallback face.
document.fonts.ready.then(() => refs.trail.userData.relayout?.());

function reveal() {
  gsap.fromTo(
    '.site-header, .header-nav, .hud, .rail',
    { opacity: 0 },
    { opacity: 1, duration: 1.2, delay: 0.7, ease: 'power2.out', stagger: 0.12 }
  );
  gsap.to('.statement-hero .ch', {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    duration: 1.2,
    delay: reduced ? 0 : 0.55,
    stagger: 0.09,
    ease: 'power3.out',
  });
  gsap.to('.hero-reveal', {
    opacity: 1,
    y: 0,
    duration: 1.0,
    delay: reduced ? 0 : 1.05,
    stagger: 0.16,
    ease: 'power2.out',
  });
  gsap.delayedCall(1.8, () => document.querySelector('.scroll-hint').classList.add('is-in'));
}

if (reduced) {
  Promise.all([document.fonts.ready, new Promise((r) => setTimeout(r, 400))]).then(() => {
    gsap.to(veil, { opacity: 0, duration: 0.2, onComplete: () => (veil.style.display = 'none') });
    reveal();
  });
} else {
  const intro = { p: 0 };
  const STEP = 0.24;
  const introDone = new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    GREETINGS.forEach((word, i) => {
      tl.call(() => (greetingEl.textContent = word), null, i * STEP);
      tl.fromTo(
        greetingEl,
        { opacity: 0.25, y: 8 },
        { opacity: 1, y: 0, duration: STEP * 0.7, ease: 'power2.out' },
        i * STEP
      );
    });
    tl.to(intro, {
      p: 100,
      duration: GREETINGS.length * STEP,
      ease: 'power1.inOut',
      onUpdate: () => {
        barEl.style.width = `${intro.p}%`;
        countEl.textContent = String(Math.round(intro.p)).padStart(3, '0');
      },
    }, 0);
  });

  Promise.all([document.fonts.ready, introDone]).then(() => {
    // the world arrives mid-pixelation and resolves as the veil lifts
    if (pixel) {
      pixel.uniforms.uMix.value = 1;
      pixel.uniforms.uPixel.value = 42;
      gsap.to(pixel.uniforms.uPixel, { value: 1, duration: 1.6, ease: 'power3.out', delay: 0.45 });
      gsap.to(pixel.uniforms.uMix, { value: 0, duration: 1.7, ease: 'power2.inOut', delay: 0.45 });
    }
    gsap.to(veil, {
      yPercent: -100,
      duration: 1.0,
      ease: 'power4.inOut',
      delay: 0.15,
      onComplete: () => (veil.style.display = 'none'),
    });
    reveal();
  });
}

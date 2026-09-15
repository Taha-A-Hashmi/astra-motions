/* ═══════════════════════════════════════════════════════════════════════
   world.js — builds the 3D world: six "beats" arranged along an ascending
   path. Beat i sits higher (+y) and deeper (-z) than the last, so the
   camera's journey through them reads as a climb out of the atmosphere
   and into orbit.

   Nothing here is sharp: planets are textured spheres (Solar System
   Scope, CC BY 4.0), moons are moons, asteroids are lumpy rocks, and the
   sky is a real Milky Way behind two layers of stars. One pale gold light
   (the star) and a violet nebula behind it all is the visual system.

   Every count is scaled by quality.particles so phones draw a third of it.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { quality } from './quality.js';

// Vertical / depth spacing between beats. Beat i center = (0, i*ELEV, -i*DEPTH)
export const ELEV = 6;
export const DEPTH = 26;
export const BEATS = 6;

export const beatCenter = (i) => new THREE.Vector3(0, i * ELEV, -i * DEPTH);

const GOLD = 0xefcd7a;
const STARWHITE = 0xfff1c4;

const N = (n) => Math.max(8, Math.round(n * quality.particles));
const SEG = (n) => Math.max(8, Math.round(n * quality.detail));

/* ── Textures: lazy, tiered, shared ─────────────────────────────────── */
const loader = new THREE.TextureLoader();
const texCache = new Map();
function tex(name, { srgb = true, aniso = true } = {}) {
  if (texCache.has(name)) return texCache.get(name);
  const t = loader.load(`/tex/${quality.textures}/${name}.jpg`);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (aniso && quality.tier === 'high') t.anisotropy = 4;
  texCache.set(name, t);
  return t;
}

/* Small helper: a soft radial-gradient sprite texture for glows. */
function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 241, 196, 0.95)');
  g.addColorStop(0.3, 'rgba(239, 205, 122, 0.28)');
  g.addColorStop(1, 'rgba(239, 205, 122, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Small helper: a soft round dot for every Points material. Without it,
   WebGL points render as hard squares — with it, stars are stars. */
let pointTex;
function makePointTexture() {
  if (pointTex) return pointTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  pointTex = new THREE.CanvasTexture(canvas);
  return pointTex;
}

/* Small helper: tiny gold sphere — the dot from the logo's orbit, in 3D. */
function makeGoldDot(radius = 0.09) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 12),
    new THREE.MeshBasicMaterial({ color: GOLD })
  );
}

/* Small helper: a flat annulus of dust — a planetary ring, or the halo
   of a star. Points in a tilted disc between two radii, biased toward the
   middle of the band so it reads as dust, not a stripe. */
function makeDustRing({ count, inner, outer, size, opacity, palette, thickness = 0.12 }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const u = (Math.random() + Math.random()) / 2;
    const r = inner + (outer - inner) * u;
    positions[i * 3 + 0] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * thickness;
    positions[i * 3 + 2] = Math.sin(a) * r;
    let c = palette[palette.length - 1][1];
    const pick = Math.random();
    for (const [limit, color] of palette) {
      if (pick < limit) { c = color; break; }
    }
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size,
      map: makePointTexture(),
      vertexColors: true,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

/* Small helper: a flat ring whose UVs run radially, so a 1-D ring strip
   texture (the Saturn-style alpha strip) wraps around it. */
function makeBandRing(inner, outer, color, opacity) {
  const geo = new THREE.RingGeometry(inner, outer, SEG(128), 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const map = loader.load('/tex/ring-alpha.png');
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map,
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/* Small helper: an asteroid — a low-poly sphere pushed in and out by
   position-only noise, so it reads as a worn rock rather than a crystal. */
function makeAsteroidGeometry(seed) {
  const geo = new THREE.SphereGeometry(1, SEG(14), SEG(10));
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 2.3 + seed) * Math.cos(v.y * 2.9 + seed * 0.7) * 0.5 +
      Math.sin((v.y + v.z) * 3.7 + seed) * 0.3;
    v.multiplyScalar(1 + n * 0.28);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/* Nebula curtain: a big additive plane whose fragment shader draws slow,
   billowing light with fbm noise. Sits far behind the ascent, fog-free. */
function makeNebulaCurtain({ width, height, position, colorA, colorB, seed, opacity }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: opacity },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSeed, uOpacity;
      uniform vec3 uColorA, uColorB;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
        return v;
      }
      void main() {
        float t = uTime * 0.035;
        float x = vUv.x * 3.0 + uSeed;
        float cloud = fbm(vec2(x * 1.6 + t, vUv.y * 1.3 - t * 0.4));
        float wisp = fbm(vec2(x * 4.5 - t * 0.9, vUv.y * 3.0 + t * 0.2));
        float body = smoothstep(0.32, 0.9, cloud) * (0.6 + 0.4 * wisp);
        float vert = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
        float horiz = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
        vec3 col = mix(uColorA, uColorB, smoothstep(0.1, 0.8, cloud));
        float a = body * vert * horiz * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.copy(position);
  mesh.renderOrder = -10;
  return mesh;
}

export function createWorld(scene) {
  const refs = {};

  /* ── Atmosphere ─────────────────────────────────────────────────────── */
  scene.fog = new THREE.FogExp2(0x05060d, 0.021);
  scene.background = new THREE.Color(0x05060d);

  scene.add(new THREE.HemisphereLight(0x2c3160, 0x0f1226, 1.35));
  const key = new THREE.DirectionalLight(0xfff1d0, 2.1);
  key.position.set(6, 30, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7f8fc8, 0.6);
  fill.position.set(-10, -4, 14);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8a7fd8, 0.42);
  rim.position.set(-6, -9, -10);
  scene.add(rim);

  /* ── The Milky Way: a real sky behind everything ────────────────────────
     An inside-out sphere large enough to wrap the whole ascent, fog-free,
     tilted so the galactic band crosses the frame diagonally. */
  {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(230, SEG(40), SEG(22)),
      new THREE.MeshBasicMaterial({
        map: tex('milky-way', { aniso: false }),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        fog: false,
      })
    );
    sky.position.set(0, 15, -65);
    sky.rotation.set(0.55, 0.4, 0.35);
    sky.renderOrder = -20;
    scene.add(sky);
    refs.sky = sky;
  }

  /* ── Stars: two layers surrounding the whole path ───────────────────────
     A dense field of fine dust plus a sparser layer of brighter, tinted
     stars. The layers counter-rotate and the bright layer twinkles. */
  function makeStarLayer(count, size, opacity, palette) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 170;
      positions[i * 3 + 1] = Math.random() * 75 - 16;
      positions[i * 3 + 2] = -Math.random() * 185 + 22;
      let r = Math.random();
      let c = palette[palette.length - 1][1];
      for (const [limit, color] of palette) {
        if (r < limit) { c = color; break; }
      }
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const layer = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: makePointTexture(),
        vertexColors: true,
        transparent: true,
        opacity,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(layer);
    return layer;
  }
  const hazeC = new THREE.Color(0x8b90a8);
  const white = new THREE.Color(0xdcd8e6);
  const ice = new THREE.Color(0x7f9cc9);
  const lavender = new THREE.Color(0x9a86d8);
  const teal = new THREE.Color(0x5fa39a);
  const goldC = new THREE.Color(GOLD);
  refs.stars = makeStarLayer(N(4200), 0.11, 0.6, [
    [0.7, hazeC], [0.85, ice], [1.01, lavender],
  ]);
  refs.starsBright = makeStarLayer(N(2000), 0.26, 0.9, [
    [0.42, white], [0.6, ice], [0.78, lavender], [0.88, teal], [1.01, goldC],
  ]);

  /* ── Nebula: slow billows of light far behind the ascent ─────────────── */
  refs.auroras = [
    makeNebulaCurtain({
      width: 150, height: 50, position: new THREE.Vector3(-18, 22, -80),
      colorA: 0x4a3d9a, colorB: 0x8a5d9c, seed: 1.3, opacity: 0.3,
    }),
    makeNebulaCurtain({
      width: 160, height: 56, position: new THREE.Vector3(26, 40, -125),
      colorA: 0x2f7f8c, colorB: 0x6c58b8, seed: 4.1, opacity: 0.27,
    }),
    makeNebulaCurtain({
      width: 180, height: 60, position: new THREE.Vector3(-8, 58, -168),
      colorA: 0x8a4d7a, colorB: 0x3f6fb0, seed: 7.9, opacity: 0.26,
    }),
  ];
  refs.auroras[1].rotation.z = 0.06;
  refs.auroras[2].rotation.z = -0.05;
  for (const a of refs.auroras) scene.add(a);

  /* ── STAGE 1 (beat 0) · PAD — the ringed gas giant ──────────────────────
     A smooth banded world, tinted toward the indigo of the palette, with
     a broad Saturn-style ring, a dust ring for sparkle, and the logo's
     gold dot riding the ring like a small moon. Hover warms it; click
     sends a shockwave through the ring (interactions). */
  {
    const c = beatCenter(0);
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, SEG(56), SEG(36)),
      new THREE.MeshStandardMaterial({
        map: tex('gas-giant'),
        color: 0x6d76b8, // cools and darkens the beige bands into the indigo palette
        roughness: 1,
        metalness: 0,
        emissive: GOLD,
        emissiveIntensity: 0, // hover warmth, tweened by interactions
      })
    );
    planet.position.copy(c);
    planet.rotation.z = 0.3;
    planet.userData.pulse = 0; // interactions: click shockwave 0→1
    scene.add(planet);
    refs.planet = planet;

    // the ring system: a banded disc plus fine dust, both tilted like the
    // orbit on the logo
    const rings = new THREE.Group();
    rings.position.copy(c);
    rings.rotation.set(0.42, 0, -0.28);
    const band = makeBandRing(3.0, 5.6, 0xa89c7e, 0.5);
    rings.add(band);
    const dust = makeDustRing({
      count: N(1400),
      inner: 3.2,
      outer: 5.8,
      size: 0.07,
      opacity: 0.75,
      thickness: 0.1,
      palette: [[0.4, goldC], [0.75, hazeC], [1.01, white]],
    });
    rings.add(dust);
    // the shockwave: a thin torus that expands out through the ring on click
    const wave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 8, SEG(96)),
      new THREE.MeshBasicMaterial({ color: STARWHITE, transparent: true, opacity: 0, depthWrite: false })
    );
    wave.rotation.x = Math.PI / 2;
    rings.add(wave);
    scene.add(rings);
    refs.heroRing = rings;
    refs.heroBand = band;
    refs.heroWave = wave;

    // The logo made literal: the gold dot riding the ring like a moon
    const dot = makeGoldDot(0.11);
    dot.position.set(c.x + 4.6, c.y, c.z);
    scene.add(dot);
    const dotLight = new THREE.PointLight(GOLD, 14, 16, 2);
    dotLight.position.copy(dot.position);
    scene.add(dotLight);
    refs.heroDot = dot;
    refs.heroDotLight = dotLight;

    // a small grey moon further out, for scale
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, SEG(24), SEG(16)),
      new THREE.MeshStandardMaterial({ map: tex('moon'), color: 0x9da3bb, roughness: 1 })
    );
    moon.userData = { r: 7.4, phase: 2.1, speed: 0.09 };
    scene.add(moon);
    refs.heroMoon = moon;
  }

  /* ── STAGE 2 (beat 1) · LIFTOFF — the belt of identical moons ───────────
     Two counter-rotating rings of the same grey moon: the way everyone
     launches. Interchangeable, unlit by any gold, never answering the
     cursor. */
  {
    const c = beatCenter(1);
    const moonGeo = new THREE.SphereGeometry(0.55, SEG(24), SEG(16));
    const moonMat = new THREE.MeshStandardMaterial({ map: tex('moon'), color: 0x666c88, roughness: 1 });
    refs.modules = [];
    refs.orbitals = [];
    const makeOrbital = (center, radius, count, tiltX, tiltZ, phase, dir) => {
      const orbital = new THREE.Group();
      orbital.position.copy(center);
      orbital.rotation.set(tiltX, 0, tiltZ);
      orbital.userData.phase = phase;
      orbital.userData.dir = dir;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const m = new THREE.Mesh(moonGeo, moonMat);
        m.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        m.rotation.y = Math.random() * Math.PI * 2;
        m.userData.baseY = 0;
        m.userData.phase = phase + i * 0.7;
        orbital.add(m);
        refs.modules.push(m);
      }
      scene.add(orbital);
      refs.orbitals.push(orbital);
      return orbital;
    };
    makeOrbital(new THREE.Vector3(c.x, c.y - 2.2, c.z - 9), 5.6, 14, 0.36, -0.08, 0, 1);
    makeOrbital(new THREE.Vector3(c.x + 1.2, c.y + 1.4, c.z - 11), 3.4, 9, -0.24, 0.14, 1.6, -1);
  }

  /* ── STAGE 3 (beat 2) · ESCAPE VELOCITY — the Guide appears ─────────────
     The gold dot from the logo's orbit, come alive: a warm wisp with a
     flowing particle tail and a slow halo of gold sparks. Introduced
     here, then travels ahead of the camera for the rest of the ascent and
     merges with the star at the top. */
  {
    const c = beatCenter(2);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshBasicMaterial({ color: STARWHITE })
    );
    head.position.set(c.x, c.y + 0.8, c.z + 3);
    scene.add(head);

    const light = new THREE.PointLight(GOLD, 10, 20, 2);
    light.position.copy(head.position);
    scene.add(light);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture(), transparent: true, opacity: 0.85, depthWrite: false })
    );
    sprite.scale.setScalar(3.2);
    sprite.position.copy(head.position);
    scene.add(sprite);

    // halo: tiny gold sparks orbiting the head
    const chipGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const chipMat = new THREE.MeshBasicMaterial({ color: GOLD });
    const chips = [];
    for (let i = 0; i < 7; i++) {
      const chip = new THREE.Mesh(chipGeo, chipMat);
      chip.userData.phase = (i / 7) * Math.PI * 2;
      scene.add(chip);
      chips.push(chip);
    }

    // tail: a ribbon of points following the head's recent positions
    const TAIL = N(150);
    const tailPos = new Float32Array(TAIL * 3);
    const tailCol = new Float32Array(TAIL * 3);
    const headC = new THREE.Color(STARWHITE);
    const midC = new THREE.Color(GOLD);
    const endC = new THREE.Color(0x5a4f8a);
    for (let i = 0; i < TAIL; i++) {
      const t = i / (TAIL - 1);
      const col = t < 0.35 ? headC.clone().lerp(midC, t / 0.35) : midC.clone().lerp(endC, (t - 0.35) / 0.65);
      tailCol[i * 3 + 0] = col.r;
      tailCol[i * 3 + 1] = col.g;
      tailCol[i * 3 + 2] = col.b;
      tailPos[i * 3 + 0] = head.position.x;
      tailPos[i * 3 + 1] = head.position.y;
      tailPos[i * 3 + 2] = head.position.z;
    }
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('color', new THREE.BufferAttribute(tailCol, 3));
    const tail = new THREE.Points(
      tailGeo,
      new THREE.PointsMaterial({
        size: 0.13,
        map: makePointTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(tail);

    refs.guide = {
      head,
      light,
      sprite,
      chips,
      tail,
      origin: head.position.clone(),
      anchor: head.position.clone(),
      shy: new THREE.Vector3(),
      excite: 0,
      visible: 0,
      merge: 0,
    };
  }

  /* ── THE PASSAGE (stages 2 → 4) — asteroids and gold motes ──────────────
     Worn rocks drifting between the belt and the ASTRO starline, and warm
     dust motes, so the climb always has something passing by. */
  {
    const rockMat = new THREE.MeshStandardMaterial({ map: tex('rock'), color: 0x7f86a8, roughness: 1 });
    const geos = [makeAsteroidGeometry(1.7), makeAsteroidGeometry(4.2), makeAsteroidGeometry(9.1)];
    refs.debris = [];
    const count = N(36);
    for (let i = 0; i < count; i++) {
      const t = 1.25 + Math.random() * 2.1; // spread from beat ~1.25 to ~3.35
      const rock = new THREE.Mesh(geos[i % geos.length], rockMat);
      rock.position.set(
        (4 + Math.random() * 18) * (Math.random() < 0.5 ? -1 : 1),
        t * ELEV + (Math.random() - 0.5) * 9,
        -t * DEPTH + (Math.random() - 0.5) * 10
      );
      rock.scale.setScalar(0.14 + Math.random() * 0.5);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.userData.baseY = rock.position.y;
      rock.userData.phase = Math.random() * Math.PI * 2;
      rock.userData.spin = (Math.random() - 0.5) * 0.008;
      scene.add(rock);
      refs.debris.push(rock);
    }

    const MOTES = N(90);
    const motePos = new Float32Array(MOTES * 3);
    const moteCol = new Float32Array(MOTES * 3);
    const motePhase = new Float32Array(MOTES);
    const moteSpeed = new Float32Array(MOTES);
    const goldM = new THREE.Color(GOLD);
    const hazeM = new THREE.Color(0xa3a6bd);
    for (let i = 0; i < MOTES; i++) {
      const t = 1.2 + Math.random() * 2.3;
      motePos[i * 3 + 0] = (Math.random() - 0.5) * 46;
      motePos[i * 3 + 1] = t * ELEV + (Math.random() - 0.5) * 10;
      motePos[i * 3 + 2] = -t * DEPTH + (Math.random() - 0.5) * 12;
      const col = Math.random() < 0.4 ? goldM : hazeM;
      moteCol[i * 3 + 0] = col.r;
      moteCol[i * 3 + 1] = col.g;
      moteCol[i * 3 + 2] = col.b;
      motePhase[i] = Math.random() * Math.PI * 2;
      moteSpeed[i] = 0.25 + Math.random() * 0.4;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
    refs.motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        size: 0.12,
        map: makePointTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    refs.motes.userData.base = motePos.slice();
    refs.motes.userData.phase = motePhase;
    refs.motes.userData.speed = moteSpeed;
    scene.add(refs.motes);
  }

  /* ── STAGE 4 (beat 3) · THE STUDIO — the starline spells ASTRO ──────────
     The name written in the sky. Particle positions are sampled from
     rasterised text, so the word hangs in space as a constellation. The
     cursor pushes through it (interactions) and the Guide flies through
     it on its way up. `relayout()` is called again by main.js once the
     brand serif has loaded. */
  {
    const c = beatCenter(3);
    const count = N(1400);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const starC = new THREE.Color(0xf2f0ea);
    const haze = new THREE.Color(0x8b90a8);
    const gold = new THREE.Color(GOLD);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const col = r < 0.1 ? gold : r < 0.55 ? starC : haze;
      colors[i * 3 + 0] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    refs.trail = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: quality.particles < 0.6 ? 0.22 : 0.17,
        map: makePointTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    refs.trail.userData.center = c;
    refs.trail.userData.push = new Float32Array(count * 3);

    const relayout = () => {
      const tc = document.createElement('canvas');
      tc.width = 760;
      tc.height = 200;
      const tctx = tc.getContext('2d');
      tctx.font = '500 150px "Cormorant Garamond", Georgia, "Times New Roman", serif';
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillStyle = '#fff';
      tctx.letterSpacing = '14px';
      tctx.fillText('ASTRO', tc.width / 2 + 7, tc.height / 2);
      const img = tctx.getImageData(0, 0, tc.width, tc.height).data;
      const lit = [];
      for (let y = 0; y < 200; y += 2) {
        for (let x = 0; x < 760; x += 2) {
          if (img[(y * 760 + x) * 4 + 3] > 128) lit.push([x, y]);
        }
      }
      if (!lit.length) return;
      const arr = refs.trail.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const [px, py] = lit[Math.floor(Math.random() * lit.length)];
        arr[i * 3 + 0] = c.x + (px / 760 - 0.5) * 13 + (Math.random() - 0.5) * 0.22;
        arr[i * 3 + 1] = c.y + 2.3 + (0.5 - py / 200) * 3.4 + (Math.random() - 0.5) * 0.22;
        arr[i * 3 + 2] = c.z + (Math.random() - 0.5) * 1.4;
      }
      refs.trail.userData.base = arr.slice();
      refs.trail.userData.push.fill(0);
      refs.trail.geometry.attributes.position.needsUpdate = true;
    };
    relayout();
    refs.trail.userData.relayout = relayout;
    scene.add(refs.trail);
  }

  /* ── STAGE 5 (beat 4) · DEEP FIELD — through the nebula ─────────────────
     The camera has left the atmosphere and skims a rolling deck of
     violet nebula that fills the frame below, then keeps riding above it
     on the way up to the star. */
  {
    const c4 = beatCenter(4);
    const c5 = beatCenter(5);

    const makeNebulaTexture = (seed) => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      let s = seed;
      const rnd = () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      for (let i = 0; i < 9; i++) {
        const bx = 48 + rnd() * 160;
        const by = 100 + rnd() * 92;
        const br = 34 + rnd() * 46;
        const lit = 1 - (by - 100) / 92;
        const a = 0.13 + lit * 0.17;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${130 + lit * 100}, ${110 + lit * 110}, ${210 + lit * 45}, ${a})`);
        g.addColorStop(0.6, `rgba(92, 78, 160, ${a * 0.45})`);
        g.addColorStop(1, 'rgba(92, 78, 160, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.globalCompositeOperation = 'source-atop';
      const top = ctx.createLinearGradient(0, 60, 0, 200);
      top.addColorStop(0, 'rgba(240, 232, 255, 0.34)');
      top.addColorStop(0.5, 'rgba(240, 232, 255, 0)');
      top.addColorStop(1, 'rgba(24, 18, 60, 0.35)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const cloudTexes = [makeNebulaTexture(11), makeNebulaTexture(47), makeNebulaTexture(83)];

    refs.clouds = [];
    // fewer, larger puffs on phones: overdraw is what hurts there
    const grow = quality.particles < 0.6 ? 1.5 : 1;
    const addCloud = (x, y, z, s, opacity) => {
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTexes[Math.floor(Math.random() * cloudTexes.length)],
          transparent: true,
          opacity,
          depthWrite: false,
        })
      );
      cloud.position.set(x, y, z);
      cloud.scale.set(s * 1.5, s * 0.85, 1);
      cloud.userData.baseX = x;
      cloud.userData.baseOpacity = opacity;
      cloud.userData.baseScale = s * grow;
      cloud.userData.speed = 0.025 + Math.random() * 0.045;
      cloud.userData.phase = Math.random() * Math.PI * 2;
      scene.add(cloud);
      refs.clouds.push(cloud);
    };
    for (let i = 0; i < N(110); i++) {
      addCloud(
        c4.x + (Math.random() - 0.5) * 96,
        c4.y - 4.4 + (Math.random() - 0.5) * 3.2,
        c4.z - 8 + (Math.random() - 0.5) * 44,
        9 + Math.random() * 13,
        0.13 + Math.random() * 0.14
      );
    }
    for (let i = 0; i < N(16); i++) {
      addCloud(
        c4.x + (Math.random() - 0.5) * 44,
        c4.y - 3.6 + (Math.random() - 0.5) * 1.6,
        c4.z + 4 + Math.random() * 5,
        15 + Math.random() * 9,
        0.16 + Math.random() * 0.1
      );
    }
    for (let i = 0; i < N(34); i++) {
      const t = Math.random();
      addCloud(
        c4.x + (Math.random() - 0.5) * 48,
        THREE.MathUtils.lerp(c4.y - 3, c5.y - 6.5, t) + (Math.random() - 0.5) * 2.4,
        THREE.MathUtils.lerp(c4.z - 4, c5.z - 2, t) + (Math.random() - 0.5) * 10,
        10 + Math.random() * 12,
        0.13 + Math.random() * 0.13
      );
    }
  }

  /* ── STAGE 6 (beat 5) · ARRIVAL — the star ──────────────────────────────
     A gold core that only comes fully alight in the last fifth of the
     climb, wrapped in a tilted halo of dust and a thin ring, with two
     real worlds in orbit catching its light. The Guide merges into the
     core at the very top. */
  {
    const c = beatCenter(5);
    const center = new THREE.Vector3(c.x, c.y + 3.6, c.z - 5);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x5a4c2a }) // choreography lifts this to STARWHITE
    );
    core.position.copy(center);
    scene.add(core);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.035, 8, SEG(160)),
      new THREE.MeshStandardMaterial({
        color: 0x2a2f52,
        roughness: 0.4,
        metalness: 0.6,
        emissive: GOLD,
        emissiveIntensity: 0,
      })
    );
    ring.position.copy(center);
    ring.rotation.set(Math.PI / 2 + 0.42, 0.1, -0.28);
    scene.add(ring);

    const halo = makeDustRing({
      count: N(2200),
      inner: 2.2,
      outer: 7.5,
      size: 0.09,
      opacity: 0.7,
      thickness: 0.35,
      palette: [[0.5, goldC], [0.8, white], [1.01, lavender]],
    });
    halo.position.copy(center);
    halo.rotation.set(0.42, 0, -0.28);
    scene.add(halo);

    // two real worlds in orbit: a warm red one and a grey moon
    const planets = [
      new THREE.Mesh(
        new THREE.SphereGeometry(1.15, SEG(40), SEG(26)),
        new THREE.MeshStandardMaterial({ map: tex('mars'), color: 0xffd8c2, roughness: 1 })
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(0.7, SEG(32), SEG(20)),
        new THREE.MeshStandardMaterial({ map: tex('moon'), color: 0xb8bcd0, roughness: 1 })
      ),
    ];
    planets[0].userData = { r: 6.2, phase: 0.9, speed: 0.07, y: -2.6 };
    planets[1].userData = { r: 8.6, phase: 3.4, speed: 0.05, y: 1.4 };
    for (const p of planets) {
      p.position.set(center.x + p.userData.r, center.y + p.userData.y, center.z);
      scene.add(p);
    }

    const glowLight = new THREE.PointLight(GOLD, 0, 50, 1.8);
    glowLight.position.copy(center);
    scene.add(glowLight);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture(), transparent: true, opacity: 0, depthWrite: false })
    );
    sprite.scale.setScalar(12);
    sprite.position.copy(center);
    scene.add(sprite);

    refs.star = {
      core, ring, halo, planets, glowLight, sprite, center, flare: 0,
      coreDim: new THREE.Color(0x5a4c2a),
      coreLit: new THREE.Color(STARWHITE),
    };
  }

  /* ── Per-stage object lists — choreography hides a stage's set once the
     camera is far enough away that fog has already erased it. */
  refs.stageObjects = [
    [refs.planet, refs.heroDot, refs.heroDotLight, refs.heroRing, refs.heroMoon],
    [...refs.orbitals],
    [],
    [refs.trail],
    [...refs.clouds],
    [refs.star.core, refs.star.ring, refs.star.halo, ...refs.star.planets, refs.star.sprite],
  ];

  return refs;
}

/* Per-frame idle motion — independent of scroll. `reduced` disables it. */
export function tickWorld(refs, elapsed, reduced) {
  if (reduced) return;
  if (refs.planet) {
    const p = refs.planet;
    p.rotation.y = elapsed * 0.06;
    const pulse = p.userData.pulse;
    p.scale.setScalar(1 + Math.sin(pulse * Math.PI) * 0.05);
    // the ring system turns slowly; the gold dot rides it like a moon
    const rings = refs.heroRing;
    rings.rotation.y = elapsed * 0.05;
    const a = -elapsed * 0.22;
    const local = refs.heroDot.position;
    local.set(Math.cos(a) * 4.5, Math.sin(elapsed * 0.9) * 0.08, Math.sin(a) * 4.5);
    rings.localToWorld(local);
    refs.heroDotLight.position.copy(local);
    // the shockwave: radius 2.4 → 9 as pulse runs 0 → 1, fading out
    const w = refs.heroWave;
    w.visible = pulse > 0.001 && pulse < 0.999;
    if (w.visible) {
      w.scale.setScalar(2.4 + pulse * 6.6);
      w.material.opacity = (1 - pulse) * 0.9;
    }
    const m = refs.heroMoon;
    const ma = elapsed * m.userData.speed + m.userData.phase;
    const c0 = beatCenter(0);
    m.position.set(c0.x + Math.cos(ma) * m.userData.r, c0.y + Math.sin(ma) * 1.6, c0.z + Math.sin(ma) * m.userData.r * 0.5);
    m.rotation.y = ma * 1.5;
  }
  if (refs.orbitals) {
    for (const orbital of refs.orbitals) {
      orbital.rotation.y = elapsed * 0.09 * orbital.userData.dir + orbital.userData.phase;
    }
    for (const mod of refs.modules) {
      mod.position.y = mod.userData.baseY + Math.sin(elapsed * 0.5 + mod.userData.phase) * 0.12;
      mod.rotation.y += 0.002;
    }
  }
  if (refs.guide) {
    const g = refs.guide;
    const wander = 1 - g.merge * 0.7;
    g.head.position.set(
      g.anchor.x + Math.sin(elapsed * 1.25) * 0.6 * wander + g.shy.x,
      g.anchor.y + (Math.sin(elapsed * 1.7) * 0.35 + Math.cos(elapsed * 0.9) * 0.2) * wander + g.shy.y,
      g.anchor.z + Math.cos(elapsed * 1.05) * 0.5 * wander + g.shy.z
    );
    const vis = g.visible * (1 - g.merge);
    const scale = 0.4 + 0.6 * g.visible;
    g.head.scale.setScalar(scale * (1 - g.merge * 0.65));
    g.head.visible = g.visible > 0.02;
    g.light.position.copy(g.head.position);
    g.light.intensity = (10 + g.excite * 16) * vis + g.merge * 4;
    g.sprite.position.copy(g.head.position);
    g.sprite.material.opacity = 0.85 * vis;
    g.sprite.scale.setScalar(3.2 * scale + g.excite * 1.4);
    const spin = elapsed * (0.9 + g.excite * 2.6);
    g.chips.forEach((chip, i) => {
      const a = spin + chip.userData.phase;
      const r = (0.9 + Math.sin(elapsed * 0.7 + i) * 0.15) * scale;
      chip.position.set(
        g.head.position.x + Math.cos(a) * r,
        g.head.position.y + Math.sin(elapsed * 1.2 + i * 1.3) * 0.35 * scale,
        g.head.position.z + Math.sin(a) * r
      );
      chip.visible = vis > 0.05;
      chip.scale.setScalar((1 - g.merge) * (0.7 + 0.3 * Math.sin(elapsed * 3 + i)));
    });
    const tp = g.tail.geometry.attributes.position.array;
    tp.copyWithin(3, 0, tp.length - 3);
    tp[0] = g.head.position.x + (Math.random() - 0.5) * 0.06;
    tp[1] = g.head.position.y + (Math.random() - 0.5) * 0.06;
    tp[2] = g.head.position.z + (Math.random() - 0.5) * 0.06;
    g.tail.geometry.attributes.position.needsUpdate = true;
    g.tail.material.opacity = 0.85 * vis;
  }
  if (refs.clouds) {
    const fade = refs.cloudsFade ?? 1;
    for (const cloud of refs.clouds) {
      if (!cloud.visible) continue;
      const { baseX, baseOpacity, baseScale, speed, phase } = cloud.userData;
      cloud.position.x = baseX + Math.sin(elapsed * speed + phase) * 4;
      cloud.material.opacity = baseOpacity * fade * (0.82 + Math.sin(elapsed * 0.3 + phase) * 0.18);
      const breathe = 1 + Math.sin(elapsed * 0.12 + phase) * 0.05;
      cloud.scale.set(baseScale * 1.5 * breathe, baseScale * 0.85 * breathe, 1);
    }
  }
  if (refs.star) {
    const s = refs.star;
    s.halo.rotation.y = elapsed * 0.03;
    s.ring.rotation.z = -0.28 + Math.sin(elapsed * 0.15) * 0.05;
    for (const p of s.planets) {
      const { r, phase, speed, y } = p.userData;
      const a = elapsed * speed + phase;
      p.position.set(s.center.x + Math.cos(a) * r, s.center.y + y + Math.sin(a) * r * 0.32, s.center.z + Math.sin(a) * r * 0.6);
      p.rotation.y = a * 2;
    }
  }
  if (refs.debris) {
    for (const rock of refs.debris) {
      rock.rotation.y += rock.userData.spin;
      rock.rotation.x += rock.userData.spin * 0.6;
      rock.position.y = rock.userData.baseY + Math.sin(elapsed * 0.35 + rock.userData.phase) * 0.5;
    }
  }
  if (refs.motes) {
    const arr = refs.motes.geometry.attributes.position.array;
    const { base, phase, speed } = refs.motes.userData;
    for (let i = 0; i < phase.length; i++) {
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(elapsed * speed[i] + phase[i]) * 1.3;
      arr[i * 3] = base[i * 3] + Math.cos(elapsed * speed[i] * 0.6 + phase[i]) * 0.6;
    }
    refs.motes.geometry.attributes.position.needsUpdate = true;
  }
  if (refs.sky) refs.sky.rotation.y = 0.4 + elapsed * 0.002;
  if (refs.stars) refs.stars.rotation.y = elapsed * 0.004;
  if (refs.starsBright) {
    refs.starsBright.rotation.y = -elapsed * 0.0055;
    refs.starsBright.material.opacity = 0.75 + Math.sin(elapsed * 1.6) * 0.18;
  }
  if (refs.auroras) {
    for (const a of refs.auroras) a.material.uniforms.uTime.value = elapsed;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   world.js — builds the 3D world: six "beats" arranged along an ascending
   path. Beat i sits higher (+y) and deeper (-z) than the last, so the
   camera's journey through them reads as a climb out of the atmosphere
   and into orbit.

   Everything is procedural geometry — no downloaded models. Indigo rock,
   one pale gold light (the star) and a violet nebula behind it all is the
   whole visual system (Starlight).
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

// Vertical / depth spacing between beats. Beat i center = (0, i*ELEV, -i*DEPTH)
export const ELEV = 6;
export const DEPTH = 26;
export const BEATS = 6;

export const beatCenter = (i) => new THREE.Vector3(0, i * ELEV, -i * DEPTH);

const GOLD = 0xefcd7a;
const STARWHITE = 0xfff1c4;
const BASALT = 0x1f2542; // the indigo rock every solid thing is cut from

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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
   of a star. Points in a tilted disc between two radii, with a soft
   density falloff toward both edges so it reads as dust, not a stripe. */
function makeDustRing({ count, inner, outer, size, opacity, palette, thickness = 0.12 }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    // bias toward the middle of the band
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

/* Nebula curtain: a big additive plane whose fragment shader draws slow,
   streaked light with fbm noise. Sits far behind the ascent, fog-free. */
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
        // nebula: billowing, not streaked — two fbm layers at different scales
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
  // Dense enough that each beat only *hints* at the next — and the hero
  // stays clean of everything further up.
  scene.fog = new THREE.FogExp2(0x05060d, 0.021);
  scene.background = new THREE.Color(0x05060d);

  // Base light: cool indigo hemisphere + a pale starlight key + violet fill
  // from the opposite side so facets always separate from the void.
  scene.add(new THREE.HemisphereLight(0x2c3160, 0x0f1226, 1.35));
  const key = new THREE.DirectionalLight(0xfff1d0, 1.95);
  key.position.set(6, 30, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7f8fc8, 0.6);
  fill.position.set(-10, -4, 14);
  scene.add(fill);
  // violet rim from behind and below — the underside of every rock keeps
  // a silhouette instead of dissolving into the void
  const rim = new THREE.DirectionalLight(0x8a7fd8, 0.42);
  rim.position.set(-6, -9, -10);
  scene.add(rim);

  /* ── Stars: two layers surrounding the whole path ───────────────────────
     A dense field of fine dust plus a sparser layer of brighter, tinted
     stars (white / ice-blue / lavender / teal / gold). The layers counter-
     rotate and the bright layer twinkles — the sky is alive, not painted. */
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
  refs.stars = makeStarLayer(3000, 0.11, 0.55, [
    [0.7, hazeC], [0.85, ice], [1.01, lavender],
  ]);
  refs.starsBright = makeStarLayer(1400, 0.26, 0.9, [
    [0.42, white], [0.6, ice], [0.78, lavender], [0.88, teal], [1.01, goldC],
  ]);

  /* ── Nebula: slow billows of light far behind the ascent ───────────────
     Three shader planes in violet, rose and teal, staggered up the climb
     so every stage has a faint sky above it. Additive and fog-free, so
     they read as light, not as haze. */
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

  /* ── STAGE 1 (beat 0) · GROUND — the dark planet, built from chunks ──────
     Not one mesh but ~10 fragments of the same faceted sphere, each pivoted
     at its own centroid. Assembled they read as one ringed world; the
     interaction layer can crack them apart on hover and burst them on
     click. A ring of gold dust circles it, and the logo's dot rides that
     ring like a small moon. */
  {
    const c = beatCenter(0);
    const geo = new THREE.IcosahedronGeometry(2.3, 2).toNonIndexed();
    const pos = geo.attributes.position;
    // Displace vertices slightly so it reads as cut stone, not a platonic
    // solid. (Same displacement for shared corners since it depends only
    // on position.)
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 3.1 + v.y * 2.7) * Math.cos(v.z * 2.3);
      v.multiplyScalar(1 + n * 0.07);
      pos.setXYZ(i, v.x, v.y, v.z);
    }

    const material = new THREE.MeshStandardMaterial({
      color: BASALT,
      roughness: 0.3,
      metalness: 0.5,
      flatShading: true,
    });

    const faceCount = pos.count / 3;
    const CHUNKS = 10;
    const facesPerChunk = Math.ceil(faceCount / CHUNKS);
    const group = new THREE.Group();
    group.position.copy(c);
    refs.shardChunks = [];

    for (let ci = 0; ci < CHUNKS; ci++) {
      const start = ci * facesPerChunk;
      const end = Math.min(faceCount, start + facesPerChunk);
      if (start >= end) break;
      const verts = new Float32Array((end - start) * 9);
      for (let f = start; f < end; f++) {
        for (let v = 0; v < 3; v++) {
          const src = (f * 3 + v) * 3;
          verts.set(
            [pos.array[src], pos.array[src + 1], pos.array[src + 2]],
            ((f - start) * 3 + v) * 3
          );
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      // Pivot each chunk at its own centroid so it can fly out and back
      cg.computeBoundingBox();
      const centroid = new THREE.Vector3();
      cg.boundingBox.getCenter(centroid);
      cg.translate(-centroid.x, -centroid.y, -centroid.z);
      cg.computeVertexNormals();

      const chunk = new THREE.Mesh(cg, material);
      chunk.position.copy(centroid);
      chunk.userData.centroid = centroid.clone();
      chunk.userData.dir = centroid.clone().normalize();
      chunk.userData.sep = 0; // 0 = assembled; the interaction layer tweens this
      chunk.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      group.add(chunk);
      refs.shardChunks.push(chunk);
    }
    scene.add(group);
    refs.shard = group;

    // the ring: a tilted disc of gold-and-haze dust — the first hint that
    // this world is made of pieces
    const ring = makeDustRing({
      count: 1600,
      inner: 3.3,
      outer: 5.4,
      size: 0.075,
      opacity: 0.8,
      thickness: 0.16,
      palette: [[0.35, goldC], [0.75, hazeC], [1.01, white]],
    });
    ring.position.copy(c);
    ring.rotation.set(0.42, 0, -0.28); // the same tilt the logo's orbit has
    scene.add(ring);
    refs.heroRing = ring;

    // The logo made literal: the gold dot riding the ring like a moon
    const dot = makeGoldDot(0.11);
    dot.position.set(c.x + 4.6, c.y, c.z);
    scene.add(dot);
    const dotLight = new THREE.PointLight(GOLD, 14, 16, 2);
    dotLight.position.copy(dot.position);
    scene.add(dotLight);
    refs.heroDot = dot;
    refs.heroDotLight = dotLight;
  }

  /* ── STAGE 2 (beat 1) · THE PROBLEM — the lattice of identical modules ──
     Two counter-rotating rings of identical cubes: the way everyone
     launches. Every module is outlined in a cold hairline — engineered,
     interchangeable, and precisely as characterful as a spreadsheet.
     Deliberately NOT interactive and deliberately unlit by any gold: the
     obvious way has no light of its own, and it never responds to you. */
  {
    const c = beatCenter(1);
    const modGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
    const modMat = new THREE.MeshStandardMaterial({
      color: 0x141830,
      roughness: 0.55,
      metalness: 0.35,
      flatShading: true,
    });
    const edgeGeo = new THREE.EdgesGeometry(modGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5f6a9a, transparent: true, opacity: 0.4 });
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
        const mod = new THREE.Mesh(modGeo, modMat);
        mod.add(new THREE.LineSegments(edgeGeo, edgeMat));
        mod.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        mod.rotation.y = -a;
        mod.userData.baseY = 0;
        mod.userData.phase = phase + i * 0.7;
        orbital.add(mod);
        refs.modules.push(mod);
      }
      scene.add(orbital);
      refs.orbitals.push(orbital);
      return orbital;
    };
    // the wide outer ring sits low; the tighter inner ring above and behind.
    // Both are pushed well past the beat center so the camera never rides
    // inside them (and so they stay a distant silhouette from the ground).
    makeOrbital(new THREE.Vector3(c.x, c.y - 2.2, c.z - 9), 5.6, 14, 0.36, -0.08, 0, 1);
    makeOrbital(new THREE.Vector3(c.x + 1.2, c.y + 1.4, c.z - 11), 3.4, 9, -0.24, 0.14, 1.6, -1);
  }

  /* ── STAGE 3 (beat 2) · THE TURN — the Guide appears ────────────────────
     The gold dot from the logo's orbit, come alive: a warm wisp with a
     flowing particle tail and a slow halo of indigo chips. It is introduced
     here ("almost none keep you in orbit" — this one keeps you, and dodges
     the cursor) and then travels ahead of the camera for the rest of the
     ascent, through the starline and up to the star, where it merges with
     the star itself. Its anchor is driven by choreography; idle motion
     lives in tickWorld; shy/excite impulses come from interactions. */
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

    // halo: small indigo chips orbiting the head, catching its light
    const chipGeo = new THREE.TetrahedronGeometry(0.1);
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x2b3054,
      roughness: 0.3,
      metalness: 0.5,
      flatShading: true,
    });
    const chips = [];
    for (let i = 0; i < 8; i++) {
      const chip = new THREE.Mesh(chipGeo, chipMat);
      chip.userData.phase = (i / 8) * Math.PI * 2;
      scene.add(chip);
      chips.push(chip);
    }

    // tail: a ribbon of points following the head's recent positions
    const TAIL = 150;
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
      // during the descent, choreography re-aims this every frame at the
      // header logo's gold dot (unprojected into the scene) — the Guide
      // IS the dot from the mark, leaving the logo to lead the ascent
      origin: head.position.clone(),
      anchor: head.position.clone(), // choreography moves this along the ascent
      shy: new THREE.Vector3(),      // interactions: dodge-the-cursor impulse
      excite: 0,                     // interactions: click delight
      visible: 0,                    // choreography: fade-in at stage 3
      merge: 0,                      // choreography: melt into the star at the top
    };
  }

  /* ── THE PASSAGE (stages 2 → 4) — debris and gold motes ─────────────────
     The stretch between the lattice and the ASTRA starline was empty
     space. Fill it with drifting indigo fragments (echoes of the stage-1
     planet) and warm dust motes, so the climb always has something passing
     by — and the Guide's light has things to catch on. */
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: BASALT,
      roughness: 0.32,
      metalness: 0.45,
      flatShading: true,
    });
    refs.debris = [];
    for (let i = 0; i < 44; i++) {
      const t = 1.25 + Math.random() * 2.1; // spread from beat ~1.25 to ~3.35
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        (4 + Math.random() * 18) * (Math.random() < 0.5 ? -1 : 1),
        t * ELEV + (Math.random() - 0.5) * 9,
        -t * DEPTH + (Math.random() - 0.5) * 10
      );
      rock.scale.setScalar(0.12 + Math.random() * 0.42);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.userData.baseY = rock.position.y;
      rock.userData.phase = Math.random() * Math.PI * 2;
      rock.userData.spin = (Math.random() - 0.5) * 0.008;
      scene.add(rock);
      refs.debris.push(rock);
    }

    const MOTES = 90;
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

  /* ── STAGE 4 (beat 3) · WHAT WE DO — the starline spells ASTRA ──────────
     The name written in the sky. Particle positions are sampled from
     rasterised text, so the word hangs in space as a constellation. The
     cursor pushes through it (interactions) and the Guide flies through
     it on its way up — both leave wakes. The word is laid out in the
     brand serif, so `relayout()` is called again by main.js once the
     webfont has actually loaded. */
  {
    const c = beatCenter(3);
    const count = 1400;
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
        size: 0.17,
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

    // rasterise the word and sample lit pixels into the rest positions
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
      tctx.fillText('ASTRA', tc.width / 2 + 7, tc.height / 2);
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
      // Kept for the interaction layer: rest positions + current cursor pushes
      refs.trail.userData.base = arr.slice();
      refs.trail.userData.push.fill(0);
      refs.trail.geometry.attributes.position.needsUpdate = true;
    };
    relayout();
    refs.trail.userData.relayout = relayout;
    scene.add(refs.trail);
  }

  /* ── STAGE 5 (beat 4) · THROUGH THE NEBULA ──────────────────────────────
     No rock here at all: the camera has left the atmosphere and skims a
     rolling deck of nebula, violet and lavender, that fills the frame
     below, then keeps riding above it on the way up to the star. Each
     billboard is a lumpy multi-blob puff with a lit upper edge so the
     deck reads as luminous gas seen from above, not fog. */
  {
    const c4 = beatCenter(4);
    const c5 = beatCenter(5);

    // puffy texture: clustered blobs, brighter toward the top of the puff
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
        const by = 100 + rnd() * 92; // cluster in the lower 2/3
        const br = 34 + rnd() * 46;
        const lit = 1 - (by - 100) / 92; // upper blobs glow more
        const a = 0.13 + lit * 0.17;
        // shadowed underside (deep violet) → lit crown (lavender-white)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(${130 + lit * 100}, ${110 + lit * 110}, ${210 + lit * 45}, ${a})`);
        g.addColorStop(0.6, `rgba(92, 78, 160, ${a * 0.45})`);
        g.addColorStop(1, 'rgba(92, 78, 160, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      // starlight along the top silhouette, shadow pooling in the base
      ctx.globalCompositeOperation = 'source-atop';
      const top = ctx.createLinearGradient(0, 60, 0, 200);
      top.addColorStop(0, 'rgba(240, 232, 255, 0.34)');
      top.addColorStop(0.5, 'rgba(240, 232, 255, 0)');
      top.addColorStop(1, 'rgba(24, 18, 60, 0.35)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const cloudTexes = [makeNebulaTexture(11), makeNebulaTexture(47), makeNebulaTexture(83)];

    refs.clouds = [];
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
      cloud.userData.baseScale = s;
      cloud.userData.speed = 0.025 + Math.random() * 0.045;
      cloud.userData.phase = Math.random() * Math.PI * 2;
      scene.add(cloud);
      refs.clouds.push(cloud);
    };

    // the main deck: wide, deep, everywhere below the camera line
    for (let i = 0; i < 110; i++) {
      addCloud(
        c4.x + (Math.random() - 0.5) * 96,
        c4.y - 4.4 + (Math.random() - 0.5) * 3.2,
        c4.z - 8 + (Math.random() - 0.5) * 44,
        9 + Math.random() * 13,
        0.13 + Math.random() * 0.14
      );
    }
    // foreground puffs just under the camera — the deck reaches the frame edge
    for (let i = 0; i < 16; i++) {
      addCloud(
        c4.x + (Math.random() - 0.5) * 44,
        c4.y - 3.6 + (Math.random() - 0.5) * 1.6,
        c4.z + 4 + Math.random() * 5,
        15 + Math.random() * 9,
        0.16 + Math.random() * 0.1
      );
    }
    // the corridor up to the star: you keep riding above these
    for (let i = 0; i < 34; i++) {
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

  /* ── STAGE 6 (beat 5) · THE STAR ────────────────────────────────────────
     A gold core that only comes fully alight in the last fifth of the
     climb, wrapped in a tilted halo of dust and a thin ring, with two
     small dark worlds in orbit catching its light. The Guide merges into
     the core at the very top. */
  {
    const c = beatCenter(5);
    // above the statement, not behind it — the words sit inside the ring
    const center = new THREE.Vector3(c.x, c.y + 3.6, c.z - 5);

    // the core: the only true emitter up here — bright enough to bloom
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x5a4c2a }) // choreography lifts this to STARWHITE
    );
    core.position.copy(center);
    scene.add(core);

    // a thin ring, dark until the star wakes and lights its edge
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.035, 8, 160),
      new THREE.MeshStandardMaterial({
        color: 0x2a2f52,
        roughness: 0.4,
        metalness: 0.6,
        emissive: GOLD,
        emissiveIntensity: 0, // ramped in by choreography
      })
    );
    ring.position.copy(center);
    ring.rotation.set(Math.PI / 2 + 0.42, 0.1, -0.28);
    scene.add(ring);

    // the halo: a wide disc of gold dust in the same plane as the ring
    const halo = makeDustRing({
      count: 2200,
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

    // two small dark worlds in orbit — the "lesser summits" of this sky
    const worldMat = new THREE.MeshStandardMaterial({
      color: BASALT,
      roughness: 0.45,
      metalness: 0.4,
      flatShading: true,
    });
    const planets = [
      new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), worldMat),
      new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), worldMat),
    ];
    planets[0].userData = { r: 6.2, phase: 0.9, speed: 0.07, y: -2.6 };
    planets[1].userData = { r: 8.6, phase: 3.4, speed: 0.05, y: 1.4 };
    for (const p of planets) {
      p.position.set(center.x + p.userData.r, center.y + p.userData.y, center.z);
      scene.add(p);
    }

    const glowLight = new THREE.PointLight(GOLD, 0, 50, 1.8); // ramped in by choreography
    glowLight.position.copy(center);
    scene.add(glowLight);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    sprite.scale.setScalar(12);
    sprite.position.copy(center);
    scene.add(sprite);

    // `flare` is a click-impulse from the interaction layer; choreography
    // folds it into the glow so the two never fight over intensity.
    refs.star = {
      core, ring, halo, planets, glowLight, sprite, center, flare: 0,
      coreDim: new THREE.Color(0x5a4c2a),
      coreLit: new THREE.Color(STARWHITE),
    };
  }

  /* ── Per-stage object lists — choreography hides a stage's set once the
     camera is far enough away that fog has already erased it. Keeps the
     hero clean of the star and saves draw calls on the way. */
  refs.stageObjects = [
    [refs.shard, refs.heroDot, refs.heroDotLight, refs.heroRing],
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
  if (refs.shard) {
    refs.shard.rotation.y = elapsed * 0.1;
    refs.shard.rotation.x = Math.sin(elapsed * 0.2) * 0.06;
    // Chunks sit at centroid + dir·sep — sep is tweened by the interaction
    // layer (0 assembled, ~0.1 hover-crack, ~2 burst)
    for (const chunk of refs.shardChunks) {
      const { centroid, dir, sep, spin } = chunk.userData;
      chunk.position.set(
        centroid.x + dir.x * sep,
        centroid.y + dir.y * sep,
        centroid.z + dir.z * sep
      );
      chunk.rotation.set(spin.x * sep * 0.6, spin.y * sep * 0.6, spin.z * sep * 0.6);
    }
    // the dust ring turns slowly; the gold dot rides it like a moon
    const ring = refs.heroRing;
    ring.rotation.y = elapsed * 0.05;
    const a = -elapsed * 0.22;
    const local = refs.heroDot.position;
    local.set(Math.cos(a) * 4.5, Math.sin(elapsed * 0.9) * 0.08, Math.sin(a) * 4.5);
    ring.localToWorld(local);
    refs.heroDotLight.position.copy(local);
  }
  if (refs.orbitals) {
    // the lattice turns like clockwork: each ring in its own direction,
    // modules breathing a little on top of that
    for (const orbital of refs.orbitals) {
      orbital.rotation.y = elapsed * 0.09 * orbital.userData.dir + orbital.userData.phase;
    }
    for (const mod of refs.modules) {
      mod.position.y = mod.userData.baseY + Math.sin(elapsed * 0.5 + mod.userData.phase) * 0.12;
    }
  }
  if (refs.guide) {
    const g = refs.guide;
    // idle orbit around the anchor + shy dodge, all scaled by visibility
    const wander = 1 - g.merge * 0.7;
    g.head.position.set(
      g.anchor.x + Math.sin(elapsed * 1.25) * 0.6 * wander + g.shy.x,
      g.anchor.y + (Math.sin(elapsed * 1.7) * 0.35 + Math.cos(elapsed * 0.9) * 0.2) * wander + g.shy.y,
      g.anchor.z + Math.cos(elapsed * 1.05) * 0.5 * wander + g.shy.z
    );
    const vis = g.visible * (1 - g.merge);
    const scale = 0.4 + 0.6 * g.visible;
    g.head.scale.setScalar(scale * (1 - g.merge * 0.65));
    g.head.material.opacity = 1; // MeshBasic — visibility rides on scale/light
    g.head.visible = g.visible > 0.02;
    g.light.position.copy(g.head.position);
    g.light.intensity = (10 + g.excite * 16) * vis + g.merge * 4;
    g.sprite.position.copy(g.head.position);
    g.sprite.material.opacity = 0.85 * vis;
    g.sprite.scale.setScalar(3.2 * scale + g.excite * 1.4);
    // chips orbit faster when excited
    const spin = elapsed * (0.9 + g.excite * 2.6);
    g.chips.forEach((chip, i) => {
      const a = spin + chip.userData.phase;
      const r = (0.9 + Math.sin(elapsed * 0.7 + i) * 0.15) * scale;
      chip.position.set(
        g.head.position.x + Math.cos(a) * r,
        g.head.position.y + Math.sin(elapsed * 1.2 + i * 1.3) * 0.35 * scale,
        g.head.position.z + Math.sin(a) * r
      );
      chip.rotation.set(a, a * 0.7, 0);
      chip.visible = vis > 0.05;
      chip.scale.setScalar(1 - g.merge);
    });
    // tail: shift history back one slot, write the head at the front
    const tp = g.tail.geometry.attributes.position.array;
    tp.copyWithin(3, 0, tp.length - 3);
    tp[0] = g.head.position.x + (Math.random() - 0.5) * 0.06;
    tp[1] = g.head.position.y + (Math.random() - 0.5) * 0.06;
    tp[2] = g.head.position.z + (Math.random() - 0.5) * 0.06;
    g.tail.geometry.attributes.position.needsUpdate = true;
    g.tail.material.opacity = 0.85 * vis;
  }
  if (refs.clouds) {
    const fade = refs.cloudsFade ?? 1; // choreography: deck rolls in after the starline
    for (const cloud of refs.clouds) {
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
  if (refs.stars) {
    refs.stars.rotation.y = elapsed * 0.004;
  }
  if (refs.starsBright) {
    // counter-rotate and twinkle the bright layer
    refs.starsBright.rotation.y = -elapsed * 0.0055;
    refs.starsBright.material.opacity = 0.75 + Math.sin(elapsed * 1.6) * 0.18;
  }
  if (refs.auroras) {
    for (const a of refs.auroras) a.material.uniforms.uTime.value = elapsed;
  }
}

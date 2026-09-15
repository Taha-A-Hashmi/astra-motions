/* ═══════════════════════════════════════════════════════════════════════
   choreography.js — maps scroll progress (0..1) onto everything that
   changes during the ascent:

     · the camera's position along a spline through the six beats
     · which statement is visible, and its drift / focus
     · the ascent rail + altitude HUD
     · which stage's objects are worth drawing at all
     · the star waking near the top (and the nebula deck catching its
       light — gold on violet)
     · the Guide's anchor along its route

   One function, called every frame: update(p).
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEATS, beatCenter } from './world.js';
import { quality } from './quality.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v); // smoothstep

/* Visibility window for beat i: full near its center, fading at the edges.
   Beat centers sit at p = i / (BEATS - 1). */
function beatWindow(p, i, hold = 0.075, fade = 0.055) {
  const center = i / (BEATS - 1);
  const d = Math.abs(p - center);
  if (d <= hold) return 1;
  return clamp01(1 - (d - hold) / fade);
}

const STAGE_NAMES = ['PAD', 'STAGE 01', 'STAGE 02', 'STAGE 03', 'STAGE 04', 'ORBIT'];

export function createChoreography({ camera, refs }) {
  /* ── Camera spline: one waypoint above/behind each beat ─────────────── */
  const drift = [0, -3.2, 3.0, -2.6, 3.4, 0]; // lateral sway per beat
  const waypoints = [];
  for (let i = 0; i < BEATS; i++) {
    const c = beatCenter(i);
    waypoints.push(new THREE.Vector3(c.x + drift[i], c.y + 2.1, c.z + 11));
  }
  const camPath = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.4);

  /* ── The Guide's route: introduced at stage 3, then always a little
     ahead of you — through the ASTRO starline, over the nebula, and
     finally into the star itself. */
  const c2 = beatCenter(2);
  const c3 = beatCenter(3);
  const c4 = beatCenter(4);
  const starCenter = refs.star.center;
  const guidePath = new THREE.CatmullRomCurve3(
    [
      // introduced beside the statement, not behind it — the glow must
      // never swallow the words
      new THREE.Vector3(c2.x + 4.6, c2.y + 1.7, c2.z + 2),
      new THREE.Vector3(c3.x - 9, c3.y + 2.2, c3.z + 2),
      new THREE.Vector3(c3.x + 9, c3.y + 3.0, c3.z + 1), // sweeps through the word
      new THREE.Vector3(c4.x, c4.y + 1.4, c4.z + 4), // skims the nebula
      starCenter.clone(), // = the star's core
    ],
    false,
    'catmullrom',
    0.35
  );

  /* ── DOM handles ────────────────────────────────────────────────────── */
  const statements = [...document.querySelectorAll('.statement')];
  const disciplines = [...document.querySelectorAll('.disciplines li')];
  const railTicks = [...document.querySelectorAll('.rail-tick')];
  const hudAlt = document.querySelector('.hud-alt');
  const hudStage = document.querySelector('.hud-stage');
  const hudLabel = document.querySelector('.hud-label');
  const scrollHint = document.querySelector('.scroll-hint');
  const markDot = document.querySelector('.site-header .mark-dot');
  const originNdc = new THREE.Vector3();

  const lookTarget = new THREE.Vector3();
  const camBase = new THREE.Vector3();

  let lastAltText = '';
  let lastStage = -1;
  let lastTint = -1;
  let lastHintGone = null;
  const cloudViolet = new THREE.Color(0xffffff);
  const cloudGold = new THREE.Color(0xf6dc9c);
  const cloudTint = new THREE.Color();

  function update(p) {
    /* Camera along the path, looking at the current/next beat center. */
    camPath.getPoint(p, camBase);

    const seg = p * (BEATS - 1);
    const i0 = Math.min(BEATS - 2, Math.floor(seg));
    const f = smooth(clamp01(seg - i0));
    lookTarget.lerpVectors(beatCenter(i0), beatCenter(i0 + 1), f);
    lookTarget.y += 0.6;

    camera.position.copy(camBase); // parallax offset added in main.js tick
    camera.lookAt(lookTarget);

    /* Statements: opacity window, drift past the camera, and a focus
       pull — words arrive out of soft blur and sharpen as they center. */
    for (let i = 0; i < statements.length; i++) {
      const w = beatWindow(p, i);
      const el = statements[i];
      const center = i / (BEATS - 1);
      el.style.opacity = w.toFixed(3);
      el.style.transform = `translateY(${(center - p) * 260}px) scale(${(0.96 + 0.04 * w).toFixed(4)})`;
      // the focus pull is a CSS blur — skipped on phones, where it costs frames
      if (quality.blurStatements) el.style.filter = w >= 0.999 ? 'none' : `blur(${((1 - w) * 7).toFixed(2)}px)`;
      // don't intercept clicks when invisible (matters for the CTA)
      el.style.visibility = w <= 0.001 ? 'hidden' : 'visible';
    }

    /* Beat 3 disciplines: staggered reveal inside the beat's window */
    const w3 = beatWindow(p, 3, 0.06, 0.05);
    disciplines.forEach((li, idx) => {
      const delay = idx * 0.15;
      li.style.opacity = clamp01(w3 * ((w3 - delay * 0.3) / 0.7)).toFixed(3);
    });

    /* Scroll hint: only while you're still on the pad */
    const hintGone = p > 0.03;
    if (hintGone !== lastHintGone) {
      scrollHint.classList.toggle('is-gone', hintGone);
      lastHintGone = hintGone;
    }

    /* HUD: altitude climbs 100 km → 35,786 km (geostationary) over the ascent */
    const alt = Math.round(100 + p * (35786 - 100));
    const altText = `ALT ${alt.toLocaleString('en-US')} KM`;
    if (altText !== lastAltText) {
      hudAlt.textContent = altText;
      lastAltText = altText;
    }
    hudLabel.textContent = p > 0.94 ? 'ORBIT REACHED' : 'SCROLL TO LIFT OFF';

    /* Rail + stage readout */
    const stage = Math.round(seg);
    if (stage !== lastStage) {
      hudStage.textContent = STAGE_NAMES[stage];
      railTicks.forEach((tick, i) => {
        tick.classList.toggle('active', i === stage);
        tick.classList.toggle('passed', i < stage);
      });
      lastStage = stage;
    }

    /* Stage objects: draw a stage's set only while it's within reach.
       Beyond ~1.5 beats the fog has already erased it. */
    for (let i = 0; i < refs.stageObjects.length; i++) {
      if (i === 4) continue; // the nebula deck fades on its own, below
      const near = Math.abs(seg - i) < 1.5;
      for (const obj of refs.stageObjects[i]) obj.visible = near;
    }

    /* The nebula rolls in only once you leave the starline — seen
       edge-on from stage 4 it was a grey band behind the word. tickWorld
       multiplies every cloud's opacity by this. */
    refs.cloudsFade = smooth(clamp01((seg - 3.3) / 0.5));
    const cloudsOn = refs.cloudsFade > 0.001;
    for (const cloud of refs.clouds) cloud.visible = cloudsOn;

    /* The star wakes over the last fifth of the climb: the light, the
       glow, the ring's lit edge and the core itself all come up together.
       `flare` is the click-impulse from the interaction layer. */
    const glow = smooth(clamp01((p - 0.78) / 0.2));
    const star = refs.star;
    const flare = star.flare || 0;
    star.glowLight.intensity = glow * 24 + flare;
    star.sprite.material.opacity = Math.min(1, glow * 0.42 + flare * 0.012);
    star.sprite.scale.setScalar(7 + glow * 6 + flare * 0.12);
    star.ring.material.emissiveIntensity = glow * 1.0 + flare * 0.02;
    star.core.scale.setScalar(0.5 + glow * 0.5 + flare * 0.004);
    star.core.material.color.lerpColors(star.coreDim, star.coreLit, glow);
    star.halo.material.opacity = 0.2 + glow * 0.4;

    /* The nebula catches the starlight: violet tops warm toward gold as
       the star comes up. */
    const tint = glow * 0.65;
    if (Math.abs(tint - lastTint) > 0.004) {
      cloudTint.lerpColors(cloudViolet, cloudGold, tint);
      for (const cloud of refs.clouds) cloud.material.color.copy(cloudTint);
      lastTint = tint;
    }

    /* The Guide: at stage 3 the gold dot leaves the header logo — its
       origin is the mark's dot unprojected into the scene — then it
       travels the route and merges with the star on top. */
    if (refs.guide) {
      const g = refs.guide;
      const descent = smooth(clamp01((p - 0.3) / 0.09)); // logo dot → wisp
      g.visible = descent;
      // the dot visibly shrinks out of the logo as the Guide departs
      // (radius attribute, so the CSS pulse animation can't fight it)
      if (markDot) markDot.setAttribute('r', (2.2 * (1 - descent)).toFixed(2));
      const travel = smooth(clamp01((p - 0.4) / 0.56));
      if (travel <= 0) {
        if (descent < 1 && markDot) {
          // where the logo's dot sits on screen, pushed 10 units deep
          const rect = markDot.getBoundingClientRect();
          camera.updateMatrixWorld();
          originNdc
            .set(
              ((rect.x + rect.width / 2) / window.innerWidth) * 2 - 1,
              -((rect.y + rect.height / 2) / window.innerHeight) * 2 + 1,
              0.5
            )
            .unproject(camera)
            .sub(camera.position)
            .normalize();
          g.origin.copy(camera.position).addScaledVector(originNdc, 10);
        }
        guidePath.getPoint(0, g.anchor);
        g.anchor.lerpVectors(g.origin, g.anchor, descent);
      } else {
        guidePath.getPoint(travel, g.anchor);
      }
      g.merge = clamp01((p - 0.93) / 0.07);
    }
  }

  return { update };
}

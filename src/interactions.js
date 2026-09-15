/* ═══════════════════════════════════════════════════════════════════════
   interactions.js — the cursor is a physical presence in the world.

     · Planet (stage 1): hover warms it and brightens its ring; click
       sends a shockwave out through the ring (with a pixel-break pulse).
     · The Guide (stage 3+): shies away from the cursor's ray; click near
       it and it lights up, spinning its halo.
     · Starline (stage 4): the ASTRO constellation is pushed by the cursor
       AND by the Guide flying through; click detonates a shockwave.
     · The star (stage 6): click flares it.
     The stage-2 belt is deliberately non-interactive.

   All of it runs off one Raycaster updated per frame in update().
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import gsap from 'gsap';

export function createInteractions({ camera, refs, canvas, fx }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(2, 2); // offscreen until first pointer event
  let hasPointer = false;

  window.addEventListener('pointermove', (e) => {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    hasPointer = true;
  });

  /* ── Planet: hover-warm + click-shockwave ───────────────────────────── */
  let hovering = false;
  let pulsing = false;
  const planetMat = refs.planet.material;
  const bandMat = refs.heroBand.material;

  function setWarm(on) {
    gsap.to(planetMat, { emissiveIntensity: on ? 0.18 : 0, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(bandMat, { opacity: on ? 0.8 : 0.5, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
  }

  function shock() {
    if (pulsing) return;
    pulsing = true;
    fx.pixelPulse(0.8, 0.6); // the frame itself breaks with the wave
    gsap.fromTo(
      refs.heroDotLight,
      { intensity: 14 },
      { intensity: 40, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }
    );
    gsap.fromTo(
      refs.planet.userData,
      { pulse: 0 },
      { pulse: 1, duration: 1.4, ease: 'power2.out', overwrite: 'auto', onComplete: () => (pulsing = false) }
    );
  }

  /* ── Guide delight: click near the wisp and it lights up ─────────────── */
  function delight() {
    gsap.fromTo(refs.guide, { excite: 1 }, { excite: 0, duration: 1.6, ease: 'power2.out', overwrite: 'auto' });
    fx.pixelPulse(0.4, 0.45);
  }

  /* ── Star flare: the star answers a click ────────────────────────────── */
  function flare() {
    gsap.fromTo(refs.star, { flare: 46 }, { flare: 0, duration: 1.6, ease: 'power2.out', overwrite: 'auto' });
    fx.pixelPulse(0.6, 0.6);
  }

  /* ── Trail shockwave: detonate an impulse where the ray meets the trail ─ */
  function shockwave() {
    const trail = refs.trail;
    const base = trail.userData.base;
    const push = trail.userData.push;
    raycaster.ray.closestPointToPoint(trail.userData.center, closest);
    for (let i = 0; i < base.length; i += 3) {
      const dx = base[i] - closest.x;
      const dy = base[i + 1] - closest.y;
      const dz = base[i + 2] - closest.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 7 && d > 0.0001) {
        const f = ((7 - d) / d) * 0.55;
        push[i] += dx * f;
        push[i + 1] += dy * f;
        push[i + 2] += dz * f;
      }
    }
    fx.pixelPulse(0.45, 0.5);
  }

  const starTargets = () => [refs.star.core, refs.star.ring, ...refs.star.planets];

  let lastP = 0; // scroll progress mirrored from update()
  window.addEventListener('pointerdown', (e) => {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (lastP < 0.15 && raycaster.intersectObject(refs.planet).length) return shock();
    if (refs.guide.visible > 0.5 && raycaster.ray.distanceToPoint(refs.guide.head.position) < 1.5)
      return delight();
    if (lastP > 0.8 && raycaster.intersectObjects(starTargets()).length) return flare();
    if (Math.abs(lastP - 3 / 5) < 0.14) shockwave();
  });

  /* ── Per-frame ──────────────────────────────────────────────────────── */
  const closest = new THREE.Vector3();
  const away = new THREE.Vector3();
  let hot = false; // read by the custom cursor in main.js

  function update(p) {
    lastP = p;
    if (!hasPointer) return;
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;

    /* Planet hover (only meaningful near the pad, p < ~0.15) */
    if (p < 0.15) {
      const hit = raycaster.intersectObject(refs.planet).length > 0;
      if (hit !== hovering) {
        hovering = hit;
        setWarm(hit);
      }
    } else if (hovering) {
      hovering = false;
      setWarm(false);
    }

    /* One cursor decision for everything clickable */
    hot =
      hovering ||
      (refs.guide.visible > 0.5 && ray.distanceToPoint(refs.guide.head.position) < 1.5) ||
      (p > 0.8 && raycaster.intersectObjects(starTargets()).length > 0);
    canvas.style.cursor = hot ? 'pointer' : '';

    /* The Guide shies away from the cursor's ray, then drifts back */
    if (refs.guide.visible > 0.1) {
      const g = refs.guide;
      ray.closestPointToPoint(g.head.position, closest);
      const d = closest.distanceTo(g.head.position);
      if (d < 2.0) {
        away.subVectors(g.head.position, closest).normalize().multiplyScalar((2.0 - d) * 0.12);
        g.shy.add(away);
        g.shy.clampLength(0, 2.4);
      }
      g.shy.multiplyScalar(0.94);
    }

    /* Starline particles: pushed by the cursor ray AND by the Guide */
    const trail = refs.trail;
    const wActive = Math.abs(p - 3 / 5) < 0.14;
    if (wActive) {
      const posAttr = trail.geometry.attributes.position;
      const arr = posAttr.array;
      const base = trail.userData.base;
      const push = trail.userData.push;
      const gh = refs.guide.head.position;
      const guideNear = refs.guide.visible > 0.1;
      for (let i = 0; i < arr.length; i += 3) {
        closest.set(base[i], base[i + 1], base[i + 2]);
        ray.closestPointToPoint(closest, away);
        let dx = base[i] - away.x;
        let dy = base[i + 1] - away.y;
        let dz = base[i + 2] - away.z;
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 2.4 && d > 0.0001) {
          const f = ((2.4 - d) / d) * 0.06;
          push[i] += dx * f;
          push[i + 1] += dy * f;
          push[i + 2] += dz * f;
        }
        if (guideNear) {
          dx = base[i] - gh.x;
          dy = base[i + 1] - gh.y;
          dz = base[i + 2] - gh.z;
          d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 2.8 && d > 0.0001) {
            const f = ((2.8 - d) / d) * 0.05;
            push[i] += dx * f;
            push[i + 1] += dy * f;
            push[i + 2] += dz * f;
          }
        }
        push[i] *= 0.92;
        push[i + 1] *= 0.92;
        push[i + 2] *= 0.92;
        arr[i] = base[i] + push[i];
        arr[i + 1] = base[i + 1] + push[i + 1];
        arr[i + 2] = base[i + 2] + push[i + 2];
      }
      posAttr.needsUpdate = true;
    }
  }

  return { update, isHot: () => hot };
}

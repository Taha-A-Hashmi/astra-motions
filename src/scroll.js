/* ═══════════════════════════════════════════════════════════════════════
   scroll.js — the scroll system.

   The page has no real content flow: an invisible `.scroll-proxy` div
   creates SCROLL_LENGTH_VH of scrollable height, Lenis smooths the wheel,
   and GSAP's ScrollTrigger scrubs a single progress value (0 → 1) that
   the choreography reads every frame.
   ═══════════════════════════════════════════════════════════════════════ */
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Total scroll length. 6 beats × ~180vh each feels unhurried but not slow.
export const SCROLL_LENGTH_VH = 1080;

export function createScroll({ reduced }) {
  document.querySelector('.scroll-proxy').style.height = `${SCROLL_LENGTH_VH}vh`;

  // Lenis gives scrolling its weight. With reduced motion, keep native feel.
  const lenis = new Lenis({
    smoothWheel: !reduced,
    lerp: 0.09,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // One scrubbed value drives the whole experience.
  const state = { p: 0 };
  gsap.to(state, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '.scroll-proxy',
      start: 'top top',
      end: 'bottom bottom',
      scrub: reduced ? true : 0.8, // slight lag = cinematic settle
    },
  });

  return {
    /** Current smoothed progress through the ascent, 0..1 */
    progress: () => state.p,
    lenis,
  };
}

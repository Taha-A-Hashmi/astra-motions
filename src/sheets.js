/* ═══════════════════════════════════════════════════════════════════════
   sheets.js — the studio's two full-screen sheets: Team and Work.

   A sheet is a DOM layer that slides up over the live scene. The world
   keeps rendering underneath: the camera dollies forward (view.dolly), the
   frame breaks into pixels for a beat (fx.pixelPulse) and resolves again
   behind the glass. Cards answer the cursor with a 3D tilt and a gold
   sheen — the same "the cursor is a presence" rule the scene follows.

   Every [data-open="team|work|contact"] control routes through here so the
   sheets, the contact overlay and Lenis never fight over the scroll lock.
   ═══════════════════════════════════════════════════════════════════════ */
import gsap from 'gsap';

export function createSheets({ lenis, fx, contact, view, reduced, coarse }) {
  const sheets = new Map();
  for (const root of document.querySelectorAll('.sheet')) {
    sheets.set(root.dataset.sheet, {
      root,
      backdrop: root.querySelector('.sheet-backdrop'),
      scroller: root.querySelector('.sheet-scroll'),
      close: root.querySelector('.sheet-close'),
      head: [...root.querySelectorAll('.sheet-head > *')],
      cards: [...root.querySelectorAll('.sheet-card')],
      foot: root.querySelector('.sheet-foot'),
    });
  }

  let current = null; // name of the open sheet
  let busy = false;
  let lastFocus = null;

  function open(name) {
    const s = sheets.get(name);
    if (!s || busy || current === name) return;
    if (current) return swap(name);
    busy = true;
    current = name;
    lastFocus = document.activeElement;
    lenis.stop();
    // Lenis only owns wheel input; on touch the window still scrolls
    // natively, so lock the document too (fine pointers keep their scrollbar)
    if (coarse) document.documentElement.style.overflow = 'hidden';
    s.root.hidden = false;
    s.scroller.scrollTop = 0;
    document.body.classList.add('sheet-open');

    if (!reduced) fx.pixelPulse(0.55, 0.75);
    gsap.to(view, { dolly: 2.6, duration: 1.2, ease: 'power3.out', overwrite: 'auto' });

    const tl = gsap.timeline({ onComplete: () => (busy = false) });
    tl.fromTo(s.backdrop, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0);
    tl.fromTo(
      s.scroller,
      { yPercent: reduced ? 0 : 4, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power4.out' },
      0.05
    );
    tl.fromTo(
      s.head,
      { opacity: 0, y: 22, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, stagger: 0.09, ease: 'power3.out' },
      0.18
    );
    tl.fromTo(
      s.cards,
      { opacity: 0, y: 46, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.1, ease: 'power3.out' },
      0.32
    );
    if (s.foot) tl.fromTo(s.foot, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6 }, 0.7);
    tl.fromTo(s.close, { opacity: 0, rotate: -90 }, { opacity: 1, rotate: 0, duration: 0.5 }, 0.3);
    s.close.focus({ preventScroll: true });
  }

  /* Close the open sheet. `keepLock` leaves Lenis stopped — used when the
     contact overlay takes over the screen right after. */
  function close({ keepLock = false } = {}) {
    if (!current || busy) return;
    const s = sheets.get(current);
    busy = true;
    if (!reduced) fx.pixelPulse(0.3, 0.5);
    gsap.to(view, { dolly: 0, duration: 1.0, ease: 'power3.inOut', overwrite: 'auto' });
    const tl = gsap.timeline({
      onComplete: () => {
        s.root.hidden = true;
        s.scroller.style.transform = '';
        document.body.classList.remove('sheet-open');
        current = null;
        busy = false;
        if (!keepLock) {
          lenis.start();
          if (coarse) document.documentElement.style.overflow = '';
        }
        if (lastFocus && !keepLock) lastFocus.focus?.({ preventScroll: true });
      },
    });
    tl.to(s.cards, { opacity: 0, y: 16, duration: 0.3, stagger: 0.02, ease: 'power2.in' }, 0);
    tl.to([...s.head, s.foot, s.close].filter(Boolean), { opacity: 0, duration: 0.25 }, 0);
    tl.to(s.scroller, { opacity: 0, yPercent: reduced ? 0 : 2, duration: 0.35, ease: 'power2.in' }, 0.05);
    tl.to(s.backdrop, { opacity: 0, duration: 0.4 }, 0.1);
  }

  /* Team → Work (or back) without dropping the backdrop in between */
  function swap(name) {
    const from = sheets.get(current);
    const to = sheets.get(name);
    busy = true;
    if (!reduced) fx.pixelPulse(0.4, 0.55);
    gsap.timeline({
      onComplete: () => {
        from.root.hidden = true;
        current = null;
        busy = false;
        // re-enter through open() so the lock/pulse bookkeeping stays in one place
        lenis.start();
        open(name);
      },
    })
      .to(from.cards, { opacity: 0, y: 16, duration: 0.25, stagger: 0.02, ease: 'power2.in' }, 0)
      .to([...from.head, from.foot, from.close].filter(Boolean), { opacity: 0, duration: 0.2 }, 0)
      .to(from.scroller, { opacity: 0, duration: 0.25 }, 0.05)
      .to(from.backdrop, { opacity: 0, duration: 0.25 }, 0.1);
    void to;
  }

  /* ── Routing: every [data-open] control lands here ────────────────────── */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-open]');
    if (!btn) return;
    const target = btn.dataset.open;
    if (target === 'contact') {
      if (current) close({ keepLock: true });
      contact.show();
    } else {
      open(target);
    }
  });
  for (const s of sheets.values()) {
    s.close.addEventListener('click', () => close());
    s.backdrop.addEventListener('click', () => close());
    // the scroller covers the backdrop, so "click the empty glass" lands here
    s.scroller.addEventListener('click', (e) => {
      if (e.target === s.scroller || e.target.classList.contains('sheet-inner')) close();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !contact.isOpen()) close();
  });

  /* ── Tilt: cards lean toward the cursor, a gold sheen follows it ────── */
  if (!coarse && !reduced) {
    for (const card of document.querySelectorAll('.tilt')) {
      let raf = 0;
      let px = 0.5;
      let py = 0.5;
      const apply = () => {
        raf = 0;
        card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        card.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - py) * 9).toFixed(2)}deg`);
      };
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width;
        py = (e.clientY - r.top) / r.height;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerenter', () => card.classList.add('is-hot'));
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-hot');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    }
  }

  return { open, close, isOpen: () => Boolean(current) };
}

/* ═══════════════════════════════════════════════════════════════════════
   contact.js — the "Enter orbit" contact overlay.

   Opens from "Enter orbit" (and the header's Contact), pauses the
   ascent (Lenis) while open, validates inline, and POSTs to the studio's
   own backend — POST /api/contact (see server/). The backend stores every
   inquiry and emails it on once CONTACT_TO is configured; until then the
   visitor still gets a clean "received", because it *was* received.
   ═══════════════════════════════════════════════════════════════════════ */
import gsap from 'gsap';

const ENDPOINT = '/api/contact';
const coarse = window.matchMedia('(pointer: coarse)').matches;

export function createContact({ lenis }) {
  const root = document.querySelector('.contact');
  const panel = root.querySelector('.contact-panel');
  const backdrop = root.querySelector('.contact-backdrop');
  const closeBtn = root.querySelector('.contact-close');
  const form = root.querySelector('.contact-form');
  const status = root.querySelector('.contact-status');
  const submitBtn = root.querySelector('.contact-submit');
  // Openers are routed through sheets.js ([data-open="contact"]) so a sheet
  // can hand over to the form without releasing the scroll lock in between.
  const toBase = document.querySelector('.to-base');

  let open = false;
  let lastFocus = null;
  let openedAt = 0;

  function show() {
    if (open) return;
    open = true;
    openedAt = performance.now();
    lastFocus = document.activeElement;
    root.hidden = false;
    lenis.stop(); // hold the scene still while the panel is up
    if (coarse) document.documentElement.style.overflow = 'hidden'; // touch scrolls natively
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    // xPercent/yPercent re-assert the CSS translate(-50%,-50%) centering,
    // which gsap's `y` tween would otherwise overwrite.
    gsap.fromTo(
      panel,
      { opacity: 0, xPercent: -50, yPercent: -50, y: 26 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }
    );
    if (!root.classList.contains('sent')) form.querySelector('input[name="name"]').focus();
  }

  function hide() {
    if (!open) return;
    open = false;
    gsap.to(backdrop, { opacity: 0, duration: 0.25 });
    gsap.to(panel, {
      opacity: 0,
      y: 18,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: () => {
        root.hidden = true;
        lenis.start();
        if (coarse) document.documentElement.style.overflow = '';
        if (lastFocus) lastFocus.focus();
        // a sent form resets once the panel is away, ready for next time
        if (root.classList.contains('sent')) {
          root.classList.remove('sent');
          form.reset();
          status.textContent = '';
          status.classList.remove('ok', 'err');
        }
      },
    });
  }

  closeBtn.addEventListener('click', hide);
  backdrop.addEventListener('click', hide);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  toBase.addEventListener('click', () => lenis.scrollTo(0, { duration: 2.4 }));

  /* ── Validation + submit ────────────────────────────────────────────── */
  const fields = ['name', 'email', 'message'];

  function setError(name, message) {
    const input = form.querySelector(`[name="${name}"]`);
    const field = input?.closest('.contact-field');
    if (!field) return;
    field.classList.add('invalid');
    if (message) field.querySelector('.contact-err').textContent = message;
  }

  function validate() {
    let ok = true;
    for (const name of fields) {
      const input = form.querySelector(`[name="${name}"]`);
      const field = input.closest('.contact-field');
      const value = input.value.trim();
      const valid =
        name === 'email'
          ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
          : name === 'message'
            ? value.length >= 10
            : value.length >= 2;
      field.classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    }
    return ok;
  }

  // clear the error as soon as the visitor fixes a field
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.contact-field');
    if (field) field.classList.remove('invalid');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    status.textContent = 'Sending…';
    status.classList.remove('ok', 'err');

    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...data, elapsed: Math.round(performance.now() - openedAt) }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 422 && body.errors) {
        for (const [name, message] of Object.entries(body.errors)) setError(name, message);
        status.textContent = 'Check the highlighted fields';
        status.classList.add('err');
        return;
      }
      if (res.status === 429) {
        status.textContent = body.error || 'Too many attempts — try again shortly';
        status.classList.add('err');
        return;
      }
      if (!res.ok || !body.ok) throw new Error(`backend responded ${res.status}`);

      root.classList.add('sent');
      gsap.fromTo('.contact-done', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
      gsap.delayedCall(4.2, hide);
    } catch {
      status.textContent = 'Could not send — please try again in a moment';
      status.classList.add('err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return { show, hide, isOpen: () => open };
}

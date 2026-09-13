/* ═══════════════════════════════════════════════════════════════════════
   server/validate.js — the contact payload, checked server-side.
   Mirrors the client rules so the API is safe to hit directly.
   ═══════════════════════════════════════════════════════════════════════ */

export const BUDGETS = ['< $5k', '$5k – $15k', '$15k+', 'Undecided'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width junk
    .trim()
    .slice(0, max);

/**
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateInquiry(body) {
  const errors = {};
  const name = clean(body.name, 80);
  const email = clean(body.email, 160).toLowerCase();
  const message = clean(body.message, 4000);
  const budget = clean(body.budget, 24) || 'Undecided';

  if (name.length < 2) errors.name = 'Please enter your name';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (message.length < 10) errors.message = 'Tell us a little more (10+ characters)';
  if (!BUDGETS.includes(budget)) errors.budget = 'Pick one of the listed ranges';

  // Crude link-spam guard: real briefs rarely contain more than 3 URLs
  if ((message.match(/https?:\/\//gi) || []).length > 3) errors.message = 'Too many links';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, email, message, budget } };
}

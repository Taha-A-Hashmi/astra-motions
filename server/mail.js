/* ═══════════════════════════════════════════════════════════════════════
   server/mail.js — delivers an inquiry to the studio inbox (and a short
   confirmation to the sender). Two transports:

     · Resend  — set RESEND_API_KEY (plain HTTPS, no SMTP account needed)
     · SMTP    — set SMTP_HOST / SMTP_USER / SMTP_PASS (nodemailer)

   With neither configured, or with CONTACT_TO blank, send() resolves to
   { sent: false } and the inquiry simply stays in the database.
   ═══════════════════════════════════════════════════════════════════════ */
import nodemailer from 'nodemailer';
import { config, mailConfigured } from './config.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function studioNotification(inq) {
  const subject = `Astro inquiry — ${inq.name} (${inq.budget})`;
  const text = [
    `New launch request from the site`,
    ``,
    `Name:    ${inq.name}`,
    `Email:   ${inq.email}`,
    `Budget:  ${inq.budget}`,
    `When:    ${inq.created_at}`,
    ``,
    `— The project —`,
    inq.message,
    ``,
    `Reply directly to this email to answer them.`,
  ].join('\n');
  const html = `
    <div style="font-family:Manrope,Segoe UI,system-ui,sans-serif;background:#05060d;color:#f2f0ea;padding:32px;max-width:640px">
      <p style="font-family:'DM Mono',Consolas,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#efcd7a;margin:0 0 12px">New launch request</p>
      <h1 style="font-size:22px;font-weight:500;margin:0 0 24px">${esc(inq.name)} — ${esc(inq.budget)}</h1>
      <table style="border-collapse:collapse;font-size:14px;color:#8b90a8">
        <tr><td style="padding:4px 16px 4px 0">Email</td><td style="color:#f2f0ea"><a href="mailto:${esc(inq.email)}" style="color:#efcd7a">${esc(inq.email)}</a></td></tr>
        <tr><td style="padding:4px 16px 4px 0">Received</td><td style="color:#f2f0ea">${esc(inq.created_at)}</td></tr>
      </table>
      <p style="font-family:'DM Mono',Consolas,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8b90a8;margin:28px 0 8px">The project</p>
      <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;margin:0;border-left:2px solid #efcd7a;padding-left:14px">${esc(inq.message)}</p>
    </div>`;
  return { subject, text, html };
}

function visitorReceipt(inq) {
  const subject = `Countdown started — Astro Motions`;
  const text = [
    `Hi ${inq.name},`,
    ``,
    `Your message landed. Countdown started. We answer every message ourselves, usually within two days.`,
    ``,
    `Here is what you sent, for your records:`,
    ``,
    inq.message,
    ``,
    `— Astro Motions`,
    `Websites with their own gravity.`,
  ].join('\n');
  const html = `
    <div style="font-family:Manrope,Segoe UI,system-ui,sans-serif;background:#05060d;color:#f2f0ea;padding:32px;max-width:640px">
      <p style="font-family:'DM Mono',Consolas,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#efcd7a;margin:0 0 12px">Received</p>
      <h1 style="font-size:22px;font-weight:500;margin:0 0 20px">Your message landed. Countdown started.</h1>
      <p style="font-size:15px;line-height:1.6;color:#8b90a8;margin:0 0 24px">Hi ${esc(inq.name)} — we answer every message ourselves, usually within two days.</p>
      <p style="font-family:'DM Mono',Consolas,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8b90a8;margin:0 0 8px">Your message</p>
      <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;margin:0 0 32px;border-left:2px solid #1f2436;padding-left:14px">${esc(inq.message)}</p>
      <p style="font-size:13px;color:#8b90a8;margin:0">— Astro Motions<br/>Websites with their own gravity.</p>
    </div>`;
  return { subject, text, html };
}

/* ── Transports ─────────────────────────────────────────────────────── */
async function sendViaResend({ to, replyTo, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.contactFrom, to: [to], reply_to: replyTo, subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let smtpTransport;
async function sendViaSmtp({ to, replyTo, subject, text, html }) {
  smtpTransport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  await smtpTransport.sendMail({ from: config.contactFrom, to, replyTo, subject, text, html });
}

const transport = () => (config.resendApiKey ? sendViaResend : config.smtp.host ? sendViaSmtp : null);

/**
 * Deliver one inquiry. Never throws for "not configured" — only for a
 * real delivery failure, so the caller can record it.
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function sendInquiry(inq) {
  if (!mailConfigured()) {
    return { sent: false, reason: config.contactTo ? 'no transport configured' : 'CONTACT_TO is empty' };
  }
  const send = transport();
  await send({ to: config.contactTo, replyTo: inq.email, ...studioNotification(inq) });
  if (config.autoReply) {
    // a failed receipt must not mark the studio notification as failed
    try {
      await send({ to: inq.email, replyTo: config.contactTo, ...visitorReceipt(inq) });
    } catch (err) {
      console.warn('[mail] auto-reply failed:', err.message);
    }
  }
  return { sent: true };
}

/* ═══════════════════════════════════════════════════════════════════════
   server/ratelimit.js — tiny in-memory sliding-window limiter, keyed by
   IP. Enough for a studio contact form; swap for a shared store if the
   API ever runs on more than one instance.
   ═══════════════════════════════════════════════════════════════════════ */

export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> [timestamps]

  // sweep stale entries now and then so the map can't grow forever
  const sweep = () => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, stamps] of hits) {
      const live = stamps.filter((t) => t > cutoff);
      if (live.length) hits.set(ip, live);
      else hits.delete(ip);
    }
  };
  const timer = setInterval(sweep, windowMs);
  if (timer.unref) timer.unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const stamps = (hits.get(req.ip) || []).filter((t) => t > cutoff);
    if (stamps.length >= max) {
      const retryAfter = Math.ceil((stamps[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        error: 'Too many submissions — please try again in a little while.',
      });
    }
    stamps.push(now);
    hits.set(req.ip, stamps);
    next();
  };
}

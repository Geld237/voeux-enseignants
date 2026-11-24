/**
 * Limiteur de requêtes simple, en mémoire, par adresse IP.
 * skipSuccessful : seules les réponses en erreur (≥ 400) sont comptées (connexions réussies ignorées).
 */
export function rateLimit({ windowMs, max, skipSuccessful = false }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of hits) if (now - e.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    if (entry.count >= max) return res.status(429).json({ error: 'too_many_requests' });
    entry.count += 1;
    if (skipSuccessful) res.on('finish', () => res.statusCode < 400 && (entry.count -= 1));
    next();
  };
}

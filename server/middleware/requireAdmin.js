import { getSession, SESSION_COOKIE } from '../lib/sessions.js';

/** Vérifie la session de l'équipe programme. */
export function requireAdmin(req, res, next) {
  const session = getSession(req.cookies?.[SESSION_COOKIE]);
  if (!session || session.role !== 'admin') return res.status(401).json({ error: 'not_authenticated' });
  next();
}

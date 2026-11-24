/**
 * Connexions.
 *   POST /api/auth/exchange      lien unique enseignant → session (cookie httpOnly)
 *   POST /api/auth/admin-login   mot de passe équipe programme → session admin
 *   POST /api/auth/admin-setup   premier lancement : création du mot de passe (poste local)
 *   GET  /api/auth/admin         session admin ouverte ?
 *   POST /api/auth/logout
 */
import { Router } from 'express';
import { verifyToken } from '../lib/tokens.js';
import { createSession, destroySession, getSession, cookieOptions, SESSION_COOKIE } from '../lib/sessions.js';
import { rateLimit } from '../lib/rateLimit.js';
import { checkPassword, hashPassword, passwordSource, setSetting } from '../lib/settings.js';

const router = Router();

router.post('/exchange', rateLimit({ windowMs: 15 * 60_000, max: 30 }), (req, res) => {
  const result = verifyToken(req.body?.token);
  if (!result.ok) return res.status(result.reason === 'invalid' ? 404 : 410).json({ error: result.reason });
  destroySession(req.cookies?.[SESSION_COOKIE]);
  const session = createSession({ role: 'teacher', teacherId: result.teacherId, campaignId: result.campaignId });
  res.cookie(SESSION_COOKIE, session.id, cookieOptions(session.expiresAt));
  res.json({ ok: true, redirect: '/enseignant' });
});

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const openAdminSession = (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  const session = createSession({ role: 'admin' });
  res.cookie(SESSION_COOKIE, session.id, cookieOptions(session.expiresAt));
};

router.post('/admin-login', rateLimit({ windowMs: 15 * 60_000, max: 10 }), (req, res) => {
  if (!passwordSource()) return res.status(409).json({ error: 'needs_setup' });
  if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'bad_password' });
  openAdminSession(req, res);
  res.json({ ok: true });
});

/**
 * Premier lancement : création du mot de passe. Uniquement tant qu'aucun mot de passe n'existe,
 * et seulement depuis le poste qui fait tourner l'application (pas depuis le réseau).
 */
router.post('/admin-setup', rateLimit({ windowMs: 15 * 60_000, max: 10 }), (req, res) => {
  if (passwordSource()) return res.status(409).json({ error: 'already_configured' });
  if (!isLocal(req)) return res.status(403).json({ error: 'local_only' });
  const password = String(req.body?.password ?? '');
  if (password.length < 8) return res.status(422).json({ error: 'validation', message: 'Le mot de passe doit contenir au moins 8 caractères.' });
  setSetting('passwordHash', hashPassword(password));
  openAdminSession(req, res);
  res.json({ ok: true });
});

router.get('/admin', (req, res) => {
  const s = getSession(req.cookies?.[SESSION_COOKIE]);
  const source = passwordSource();
  res.json({ admin: s?.role === 'admin', demoPassword: source === 'demo', needsSetup: !source, canSetup: !source && isLocal(req) });
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;

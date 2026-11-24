/**
 * Connexions.
 *   POST /api/auth/exchange      lien unique enseignant → session (cookie httpOnly)
 *   POST /api/auth/admin-login   mot de passe équipe programme → session admin
 *   GET  /api/auth/admin         session admin ouverte ?
 *   POST /api/auth/logout
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { verifyToken } from '../lib/tokens.js';
import { createSession, destroySession, getSession, cookieOptions, SESSION_COOKIE } from '../lib/sessions.js';
import { rateLimit } from '../lib/rateLimit.js';
import { devMode } from '../lib/mailer.js';

const router = Router();

router.post('/exchange', rateLimit({ windowMs: 15 * 60_000, max: 30 }), (req, res) => {
  const result = verifyToken(req.body?.token);
  if (!result.ok) return res.status(result.reason === 'invalid' ? 404 : 410).json({ error: result.reason });
  destroySession(req.cookies?.[SESSION_COOKIE]);
  const session = createSession({ role: 'teacher', teacherId: result.teacherId, campaignId: result.campaignId });
  res.cookie(SESSION_COOKIE, session.id, cookieOptions(session.expiresAt));
  res.json({ ok: true, redirect: '/enseignant' });
});

export const adminPassword = () => process.env.ADMIN_PASSWORD || (devMode ? 'demo' : null);

router.post('/admin-login', rateLimit({ windowMs: 15 * 60_000, max: 10 }), (req, res) => {
  const expected = adminPassword();
  if (!expected) return res.status(503).json({ error: 'admin_not_configured' });
  const given = String(req.body?.password ?? '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'bad_password' });
  destroySession(req.cookies?.[SESSION_COOKIE]);
  const session = createSession({ role: 'admin' });
  res.cookie(SESSION_COOKIE, session.id, cookieOptions(session.expiresAt));
  res.json({ ok: true });
});

router.get('/admin', (req, res) => {
  const s = getSession(req.cookies?.[SESSION_COOKIE]);
  res.json({ admin: s?.role === 'admin', demoPassword: devMode && !process.env.ADMIN_PASSWORD });
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;

/**
 * Sessions côté serveur. Le cookie contient un identifiant aléatoire ; la base n'en garde
 * que l'empreinte. Rôles : teacher (après un lien unique) ou admin (après mot de passe).
 */
import crypto from 'node:crypto';
import { db, nowIso, addHours } from '../db/connection.js';
import { hashToken } from './tokens.js';

export const SESSION_COOKIE = 'sid';
const TTL_HOURS = { teacher: 12, admin: 8 };

export function createSession({ role, teacherId = null, campaignId = null }) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expiresAt = addHours(new Date(), TTL_HOURS[role] ?? 8).toISOString();
  db.prepare('INSERT INTO sessions (id_hash, role, teacher_id, campaign_id, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    hashToken(id), role, teacherId, campaignId, expiresAt
  );
  return { id, expiresAt };
}

export function getSession(id) {
  if (!id) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(hashToken(id));
  if (!s || s.expires_at <= nowIso()) return null;
  return s;
}

export function destroySession(id) {
  if (id) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(id));
}

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

export function cookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    expires: new Date(expiresAt),
  };
}

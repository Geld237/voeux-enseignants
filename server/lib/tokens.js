/**
 * Liens uniques (« magic links »).
 * Le token (256 bits aléatoires) n'est envoyé qu'une fois, par e-mail ; la base ne garde que
 * son empreinte SHA-256. Un nouveau lien pour le même enseignant révoque les précédents.
 */
import crypto from 'node:crypto';
import { db, nowIso, addDays } from '../db/connection.js';

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

export function revokeTokens({ teacherId, campaignId }) {
  db.prepare(
    'UPDATE access_tokens SET revoked_at = ? WHERE teacher_id = ? AND campaign_id = ? AND revoked_at IS NULL'
  ).run(nowIso(), teacherId, campaignId);
}

export function issueToken({ teacherId, campaignId, ttlDays = Number(process.env.TOKEN_TTL_DAYS || 30) }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = addDays(new Date(), ttlDays).toISOString();
  db.transaction(() => {
    revokeTokens({ teacherId, campaignId });
    db.prepare('INSERT INTO access_tokens (teacher_id, campaign_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
      teacherId, campaignId, hashToken(token), expiresAt
    );
  })();
  return { token, expiresAt, url: `${appUrl()}/acces/${token}` };
}

/** @returns {{ok: true, teacherId, campaignId} | {ok: false, reason: 'invalid'|'revoked'|'expired'}} */
export function verifyToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, reason: 'invalid' };
  const row = db.prepare('SELECT * FROM access_tokens WHERE token_hash = ?').get(hashToken(token));
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at <= nowIso()) return { ok: false, reason: 'expired' };
  db.prepare('UPDATE access_tokens SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return { ok: true, teacherId: row.teacher_id, campaignId: row.campaign_id };
}

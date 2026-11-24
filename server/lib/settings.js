/**
 * Réglages de l'application.
 * Ordre de priorité : valeur enregistrée dans l'onglet « Réglages » (table settings)
 * → variable d'environnement (.env) → valeur par défaut.
 */
import crypto from 'node:crypto';
import os from 'node:os';
import { db } from '../db/connection.js';

const ENV = {
  appUrl: 'APP_URL',
  smtpHost: 'SMTP_HOST',
  smtpPort: 'SMTP_PORT',
  smtpUser: 'SMTP_USER',
  smtpPass: 'SMTP_PASS',
  mailFrom: 'MAIL_FROM',
};

export const isDesktop = () => process.env.APP_MODE === 'desktop';

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== '') return row.value;
  return ENV[key] ? process.env[ENV[key]] || null : null;
}

export function setSetting(key, value) {
  if (value === null || value === undefined || value === '') db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

/** E-mail configuré = un serveur SMTP est renseigné. Sinon les messages restent dans la boîte d'envoi. */
export const mailConfigured = () => Boolean(getSetting('smtpHost'));

/** Mode démonstration (version web sans e-mail) : données fictives, boîte de démo, mot de passe « demo ». */
export const demoMode = () => !isDesktop() && !mailConfigured() && !getSetting('passwordHash');

/** Adresse à laquelle les enseignants ouvrent leur lien. */
export function appUrl() {
  const saved = getSetting('appUrl');
  if (saved) return saved.replace(/\/$/, '');
  if (isDesktop()) {
    const ip = lanAddresses()[0];
    return `http://${ip || 'localhost'}:${process.env.PORT || 4310}`;
  }
  return 'http://localhost:5173';
}

/** Adresses IPv4 du poste sur le réseau local (pour que les enseignants puissent se connecter). */
export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

/* ---------- mot de passe de l'espace équipe programme ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyHash(password, stored) {
  const [, salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

/** 'hash' | 'env' | 'demo' | null (aucun mot de passe : à créer au premier lancement). */
export function passwordSource() {
  if (getSetting('passwordHash')) return 'hash';
  if (process.env.ADMIN_PASSWORD) return 'env';
  if (demoMode()) return 'demo';
  return null;
}

export function checkPassword(password) {
  const src = passwordSource();
  const given = String(password ?? '');
  const eq = (a, b) => {
    const x = crypto.createHash('sha256').update(a).digest();
    const y = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(x, y);
  };
  if (src === 'hash') return verifyHash(given, getSetting('passwordHash'));
  if (src === 'env') return eq(given, process.env.ADMIN_PASSWORD);
  if (src === 'demo') return eq(given, 'demo');
  return false;
}

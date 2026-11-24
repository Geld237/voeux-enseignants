/** Logiciel de bureau : premier lancement (mot de passe), réglages, lien à copier. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voeux-desktop-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.APP_MODE = 'desktop';
process.env.SMTP_HOST = '';
delete process.env.ADMIN_PASSWORD;

const { db } = await import('../db/connection.js');
const { startServer } = await import('../index.js');

let server, base, cookie;
before(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('premier lancement : campagne créée sans enseignants fictifs, pas de mode démo', async () => {
  assert.equal(db.prepare('SELECT COUNT(*) n FROM teachers').get().n, 0);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM courses').get().n > 50);
  assert.equal((await api('GET', '/api/demo/status')).body.demo, false);
  assert.equal((await api('POST', '/api/demo/reset')).status, 404); // pas de remise à zéro en version bureau
});

test('création du mot de passe au premier lancement, depuis le poste local', async () => {
  const s = (await api('GET', '/api/auth/admin')).body;
  assert.equal(s.needsSetup, true);
  assert.equal(s.canSetup, true);
  assert.equal((await api('POST', '/api/auth/admin-login', { password: 'demo' })).status, 409);
  assert.equal((await api('POST', '/api/auth/admin-setup', { password: 'court' })).status, 422);
  assert.equal((await api('POST', '/api/auth/admin-setup', { password: 'motdepasse-long' })).status, 200);
  assert.equal((await api('GET', '/api/auth/admin')).body.admin, true);
  assert.equal((await api('POST', '/api/auth/admin-setup', { password: 'autre-motdepasse' })).status, 409);
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'passwordHash'").get().value;
  assert.ok(stored.startsWith('scrypt:') && !stored.includes('motdepasse'));
});

test('réglages : adresse d’accès, e-mail, changement de mot de passe', async () => {
  const s = (await api('GET', '/api/admin/settings')).body;
  assert.equal(s.desktop, true);
  assert.equal(s.mailConfigured, false);
  assert.match(s.appUrl, /^http:\/\/.+:4310$/);
  assert.equal((await api('PUT', '/api/admin/settings', { appUrl: 'pas une adresse' })).status, 422);
  const saved = await api('PUT', '/api/admin/settings', { appUrl: 'http://192.168.1.20:4310/', smtpHost: 'smtp.univ.fr', smtpPass: 'secret' });
  assert.equal(saved.body.appUrl, 'http://192.168.1.20:4310');
  assert.equal(saved.body.mailConfigured, true);
  assert.equal(saved.body.hasSmtpPass, true);
  assert.equal(JSON.stringify(saved.body).includes('secret'), false); // le mot de passe SMTP n'est jamais renvoyé
  await api('PUT', '/api/admin/settings', { smtpHost: '' });
  assert.equal((await api('POST', '/api/admin/settings/test-email', { to: 'a@b.fr' })).status, 502);
  assert.equal((await api('PUT', '/api/admin/password', { current: 'faux', next: 'nouveau-mdp-123' })).status, 401);
  assert.equal((await api('PUT', '/api/admin/password', { current: 'motdepasse-long', next: 'nouveau-mdp-123' })).status, 200);
});

test('lien personnel à copier, avec l’adresse d’accès réglée', async () => {
  await api('POST', '/api/admin/teachers', { lastName: 'Durand', firstName: 'Léa', email: 'lea.durand@univ.fr' });
  const id = db.prepare('SELECT id FROM teachers').get().id;
  const r = await api('POST', `/api/admin/teachers/${id}/link`);
  assert.match(r.body.url, /^http:\/\/192\.168\.1\.20:4310\/acces\/[A-Za-z0-9_-]{40,}$/);
  assert.ok(r.body.teachers[0].invitedAt);
});

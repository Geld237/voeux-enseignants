/**
 * Tests de bout en bout de l'API : lien unique → session → profil → brouillon → soumission.
 * Base SQLite temporaire, aucun SMTP (mode démo).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voeux-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.SMTP_HOST = '';

const { db } = await import('../db/connection.js');
const { seed } = await import('../db/seed.js');
const { issueToken, revokeTokens, hashToken } = await import('../lib/tokens.js');
const { createApp } = await import('../index.js');

let server, base, campaignId, teacherId;

before(async () => {
  seed();
  campaignId = db.prepare('SELECT id FROM campaigns').get().id;
  teacherId = db.prepare('SELECT id FROM teachers ORDER BY id').get().id;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function api(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: await res.json(), cookie: setCookie?.split(';')[0] };
}

test('le token est stocké haché, jamais en clair', () => {
  const { token } = issueToken({ teacherId, campaignId });
  const row = db.prepare('SELECT token_hash FROM access_tokens WHERE token_hash = ?').get(hashToken(token));
  assert.ok(row);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM access_tokens WHERE token_hash = ?').get(token).n, 0);
});

test('tokens invalides, révoqués ou expirés refusés', async () => {
  assert.equal((await api('POST', '/api/auth/exchange', { token: 'nimporte-quoi' })).status, 404);
  assert.equal((await api('POST', '/api/auth/exchange', { token: 'a'.repeat(43) })).status, 404);

  const old = issueToken({ teacherId, campaignId }).token;
  issueToken({ teacherId, campaignId }); // un nouveau lien révoque l'ancien
  const r = await api('POST', '/api/auth/exchange', { token: old });
  assert.equal(r.status, 410);
  assert.equal(r.body.error, 'revoked');

  const expired = issueToken({ teacherId, campaignId, ttlDays: -1 }).token;
  assert.equal((await api('POST', '/api/auth/exchange', { token: expired })).body.error, 'expired');
  revokeTokens({ teacherId, campaignId });
});

test("sans session, l'espace enseignant est inaccessible", async () => {
  assert.equal((await api('GET', '/api/teacher/me')).status, 401);
});

test('parcours complet enseignant', async () => {
  const { token } = issueToken({ teacherId, campaignId });
  const ex = await api('POST', '/api/auth/exchange', { token });
  assert.equal(ex.status, 200);
  assert.match(ex.cookie, /^sid=/);
  const c = ex.cookie;

  // Le lien est réutilisable (retour plus tard sur le brouillon)
  assert.equal((await api('POST', '/api/auth/exchange', { token })).status, 200);

  const me = await api('GET', '/api/teacher/me', null, c);
  assert.equal(me.body.profileComplete, false);
  assert.equal(me.body.response.state, 'not_started');
  const courses = me.body.courses;

  // Le brouillon est refusé tant que le profil n'est pas complet
  assert.equal((await api('PUT', '/api/teacher/draft', {}, c)).status, 409);

  assert.equal((await api('PUT', '/api/teacher/profile', { contactEmail: 'pas-un-mail', phone: '12' }, c)).status, 422);
  const p = await api('PUT', '/api/teacher/profile', { contactEmail: 'claire@exemple.fr', phone: '06 12 34 56 78' }, c);
  assert.equal(p.body.profileComplete, true);

  // Soumission incomplète → erreurs métier
  await api('PUT', '/api/teacher/draft', { teacherStatus: 'vacataire', wishes: [] }, c);
  const bad = await api('POST', '/api/teacher/submit', null, c);
  assert.equal(bad.status, 422);
  const steps = bad.body.errors.map((e) => e.step);
  assert.ok(steps.includes('status')); // employeur principal manquant pour un vacataire
  assert.ok(steps.includes('wishes'));
  assert.ok(steps.includes('availability')); // grille non renseignée

  const config = me.body.campaign.config;
  const r101 = courses.find((x) => x.code === 'R1.01');
  const sae = courses.find((x) => x.code === 'SAÉ 1.01');
  const full = Object.fromEntries(
    config.days.flatMap((d) => config.slots.map((s) => [`${d.key}|${s}`, d.key === 'FRI' ? 'unavailable' : 'possible']))
  );
  full['MON|08:30-10:00'] = 'preferred';
  full['XXX|bad'] = 'unavailable'; // ignoré à l'enregistrement

  // Intervention incomplète (TD sans groupe ni semaines) → erreur
  const incomplete = {
    teacherStatus: 'ec',
    wishes: [{ courseId: r101.id, interventions: [{ type: 'TD', hoursPerGroup: 15, sessionLength: 1.5 }] }],
    availability: full,
  };
  await api('PUT', '/api/teacher/draft', incomplete, c);
  const inc = await api('POST', '/api/teacher/submit', null, c);
  assert.equal(inc.status, 422);
  assert.ok(inc.body.errors.some((e) => /groupes/.test(e.message)));
  assert.ok(inc.body.errors.some((e) => /semaines/.test(e.message)));

  // Fiche valide : CM + TD sur R1.01, SAÉ après R1.01, évaluation commune
  const good = {
    teacherStatus: 'ec',
    wishes: [
      {
        courseId: r101.id,
        interventions: [
          { type: 'CM', hoursPerGroup: 12, sessionLength: 1.5, weeks: [37, 38, 39, 40, 41, 42, 43, 45] },
          { type: 'TD', groups: ['TD1', 'TD2'], hoursPerGroup: 15, sessionLength: 1.5, weeks: [39, 40, 41, 42, 43, 45, 46, 47, 48, 49] },
        ],
        evaluation: { kind: 'common', duration: 2, weeks: [50] },
        rooms: ['projector'],
      },
      {
        courseId: sae.id,
        interventions: [{ type: 'TD', anyGroups: 2, hoursPerGroup: 6, sessionLength: 3, anyWeeks: true }],
        afterCourseId: r101.id,
      },
    ],
    availability: full,
    exceptions: [{ from: '2026-10-21', to: '2026-11-07', note: 'colloque' }],
    organisation: { maxDays: 2, lunch: '60' },
  };
  const saved = await api('PUT', '/api/teacher/draft', good, c);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const sub = await api('POST', '/api/teacher/submit', null, c);
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal(sub.body.state, 'submitted');

  const after = (await api('GET', '/api/teacher/me', null, c)).body.response;
  assert.equal(after.state, 'submitted');
  assert.equal(after.draft.wishes.length, 2);
  assert.equal(after.draft.wishes[0].interventions[1].groups.length, 2);
  assert.equal(after.draft.exceptions[0].note, 'colloque');

  // Vue « à plat » : une ligne par intervention, séances calculées
  const flat = db.prepare('SELECT type, sessions, weeks FROM wishes ORDER BY id').all();
  assert.deepEqual(flat.map((f) => [f.type, f.sessions]), [['CM', 8], ['TD', 10], ['TD', 2]]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM availabilities WHERE day = 'XXX'").get().n, 0);

  // E-mail de confirmation dans la boîte de démo
  const outbox = (await api('GET', '/api/demo/outbox')).body.emails;
  assert.ok(outbox.some((e) => e.kind === 'confirmation' && e.recipient === 'claire@exemple.fr'));

  // Modifier après soumission repasse en brouillon
  await api('PUT', '/api/teacher/draft', good, c);
  assert.equal((await api('GET', '/api/teacher/me', null, c)).body.response.state, 'draft');

  // Données invalides refusées (semaine 60, type inconnu)
  const invalid = { wishes: [{ courseId: r101.id, interventions: [{ type: 'XX', hoursPerGroup: 1, sessionLength: 1, weeks: [60] }] }] };
  assert.equal((await api('PUT', '/api/teacher/draft', invalid, c)).status, 422);

  // Déconnexion
  await api('POST', '/api/auth/logout', null, c);
  assert.equal((await api('GET', '/api/teacher/me', null, c)).status, 401);
});

test('campagne close : lecture possible, modification refusée', async () => {
  const { token } = issueToken({ teacherId, campaignId });
  const c = (await api('POST', '/api/auth/exchange', { token })).cookie;
  db.prepare('UPDATE campaigns SET closes_at = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await api('GET', '/api/teacher/me', null, c)).body.campaign.isOpen, false);
  assert.equal((await api('PUT', '/api/teacher/draft', {}, c)).status, 403);
});

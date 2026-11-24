/** Tests de l'espace équipe programme : connexion, répartition, calendrier, groupes, salles, export. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voeux-admin-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.SMTP_HOST = '';
process.env.ADMIN_PASSWORD = 'secret-test';

const { db } = await import('../db/connection.js');
const { seed } = await import('../db/seed.js');
const { createApp } = await import('../index.js');

let server, base, cookie;
before(async () => {
  seed();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
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
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), cookie: set?.split(';')[0] };
}

test('connexion équipe programme', async () => {
  assert.equal((await api('GET', '/api/admin/teachers')).status, 401);
  assert.equal((await api('POST', '/api/auth/admin-login', { password: 'demo' })).status, 401);
  const ok = await api('POST', '/api/auth/admin-login', { password: 'secret-test' });
  assert.equal(ok.status, 200);
  cookie = ok.cookie;
  assert.equal((await api('GET', '/api/auth/admin')).body.admin, true);
});

test('import des enseignants collés depuis Excel', async () => {
  const r = await api('POST', '/api/admin/teachers/import', {
    text: 'Nom\tPrénom\tE-mail\nDupont\tMarie\tmarie.dupont@univ.fr\nSans mail\tX\n',
  });
  assert.equal(r.body.added, 1);
  assert.equal(r.body.errors.length, 1);
  const again = await api('POST', '/api/admin/teachers/import', { text: 'Dupont;Marie-Anne;MARIE.DUPONT@univ.fr' });
  assert.equal(again.body.updated, 1);
  assert.equal(again.body.teachers.length, 7);
});

test('tableau de répartition : ressource, import, besoins et affectation', async () => {
  const created = await api('POST', '/api/admin/courses', {
    code: 'R1.99', title: 'Ressource test', semester: 'S1', parcours: null, kind: 'R', pnCm: 10, pnTd: 15, pnTp: null,
  });
  assert.equal(created.status, 200);
  const c = created.body.courses.find((x) => x.code === 'R1.99');
  assert.equal(c.groupsTD.length, 5);
  assert.deepEqual(c.need, { CM: 10, TD: 75, TP: null }); // 15 h × 5 TD
  assert.equal((await api('POST', '/api/admin/courses', { ...c, kind: 'R', apogee: null })).status, 409); // doublon

  const imp = await api('POST', '/api/admin/courses/import', {
    text: 'Code\tApogée\tIntitulé\tSemestre\tParcours\tCM\tTD\tTP\nR3.GC2F.11\tVGFR311\tFiscalité BIC\tS3\tGC2F\t\t20\t\nR9.01\t\tInconnue\tS9\t\t\t\t',
  });
  assert.equal(imp.body.updated, 1);
  assert.equal(imp.body.errors.length, 1);
  const fisc = imp.body.courses.find((x) => x.code === 'R3.GC2F.11');
  assert.deepEqual(fisc.groupsTD, ['GC2F1', 'GC2F2']); // groupes du parcours uniquement
  assert.equal(fisc.need.TD, 40);

  const teacherId = db.prepare('SELECT id FROM teachers ORDER BY id').get().id;
  const a = await api('PUT', '/api/admin/assignments', { courseId: c.id, type: 'TD', groupName: 'TD1', teacherId, hours: 15 });
  assert.equal(a.body.course.assigned.TD, 15);
  const teachers = (await api('GET', '/api/admin/teachers')).body.teachers;
  assert.equal(teachers.find((t) => t.id === teacherId).assignedEqTD, 15);
  const removed = await api('PUT', '/api/admin/assignments', { courseId: c.id, type: 'TD', groupName: 'TD1', teacherId: null });
  assert.equal(removed.body.course.assigned.TD, 0);
});

test('calendrier universitaire déclaré manuellement', async () => {
  const { campaign } = (await api('GET', '/api/admin/campaign')).body;
  const weeks = campaign.config.weeks.map((w) => (w.week === 46 ? { ...w, kind: 'free', label: 'Semaine banalisée' } : w));
  const body = {
    label: campaign.label, opensAt: campaign.opensAt, closesAt: campaign.closesAt, weeks,
    publicHolidays: [{ date: '2026-11-11', label: 'Armistice' }], slots: ['08:30-10:00', '10:15-12:15'], saeFromWeek: 45,
  };
  const r = await api('PUT', '/api/admin/campaign', body);
  assert.equal(r.status, 200);
  assert.equal(r.body.campaign.config.weeks.find((w) => w.week === 46).kind, 'free');
  assert.equal(r.body.campaign.config.slots.length, 2);
  assert.equal((await api('PUT', '/api/admin/campaign', { ...body, weeks: [...weeks, weeks[3]] })).status, 409);
  assert.equal((await api('PUT', '/api/admin/campaign', { ...body, slots: ['8h30'] })).status, 422);
});

test('groupes constitués manuellement', async () => {
  const before = (await api('GET', '/api/admin/groups')).body.groups;
  const td1 = before.find((g) => g.semester === 'S1' && g.name === 'TD1');
  const add = await api('POST', '/api/admin/groups', { semester: 'S1', name: 'TD6', type: 'TD', parcours: null, size: 24 });
  assert.equal(add.body.groups.length, before.length + 1);
  assert.equal((await api('POST', '/api/admin/groups', { semester: 'S1', name: 'TD6', type: 'TD' })).status, 409);
  const tp = await api('POST', '/api/admin/groups', { semester: 'S1', name: 'TP6A', type: 'TP', parentId: td1.id, size: 12 });
  assert.equal(tp.body.groups.find((g) => g.name === 'TP6A').parentName, 'TD1');
  const td6 = add.body.groups.find((g) => g.name === 'TD6');
  const renamed = await api('PUT', `/api/admin/groups/${td6.id}`, { semester: 'S1', name: 'TD6 bis', type: 'TD', size: 25 });
  assert.ok(renamed.body.groups.some((g) => g.name === 'TD6 bis'));
  // Les groupes arrivent dans le formulaire enseignant via la campagne
  const { campaign } = (await api('GET', '/api/admin/campaign')).body;
  assert.ok(campaign.config.groupList.some((g) => g.name === 'TD6 bis'));
});

test('salles et planning des salles', async () => {
  const r = await api('POST', '/api/admin/rooms', {
    name: 'Labo 1', kind: 'info', capacity: 20, features: ['computer'], busy: { 'MON|08:30-10:00': true, 'TUE|08:30-10:00': false },
  });
  const room = r.body.rooms.find((x) => x.name === 'Labo 1');
  assert.deepEqual(room.busy, { 'MON|08:30-10:00': true });
  assert.equal((await api('POST', '/api/admin/rooms', { name: 'Labo 1', kind: 'td' })).status, 409);
  const upd = await api('PUT', `/api/admin/rooms/${room.id}`, { ...room, capacity: 22, busy: {} });
  assert.equal(upd.body.rooms.find((x) => x.id === room.id).capacity, 22);
});

test('export CSV avec BOM et séparateur point-virgule', async () => {
  const res = await fetch(`${base}/api/admin/export.csv`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
  assert.ok(bytes.toString('utf8', 3).startsWith('Nom;Prénom;E-mail'));
  const j = await api('GET', '/api/admin/export.json');
  assert.ok(Array.isArray(j.body.courses) && j.body.rooms.length > 0);
});

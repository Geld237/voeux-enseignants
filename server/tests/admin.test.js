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

/* ---------- Non-régression : défauts trouvés par la campagne de test ---------- */

test('routes de démo fermées dès qu’un vrai mot de passe existe (ADMIN_PASSWORD)', async () => {
  const saved = cookie;
  cookie = null;
  assert.equal((await api('GET', '/api/demo/status')).body.demo, false);
  assert.equal((await api('POST', '/api/demo/reset')).status, 404);
  assert.equal((await api('GET', '/api/demo/outbox')).status, 404);
  assert.equal((await api('POST', '/api/demo/invite')).status, 404);
  cookie = saved;
});

test('requête d’une autre origine refusée (CSRF) et en-têtes de sécurité présents', async () => {
  const res = await fetch(`${base}/api/admin/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://pirate.example' },
    body: JSON.stringify({ lastName: 'X', firstName: 'Y', email: 'x@y.fr' }),
  });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('export CSV : formules neutralisées', async () => {
  db.prepare("INSERT INTO teachers (last_name, first_name, email, phone) VALUES ('=HYPERLINK(\"x\")', 'Eve', 'eve@x.fr', '+33 6 12 34 56 78')").run();
  const t = db.prepare("SELECT id FROM teachers WHERE email = 'eve@x.fr'").get();
  const c = db.prepare('SELECT id, campaign_id FROM courses ORDER BY id').get();
  db.prepare("INSERT INTO responses (teacher_id, campaign_id, state, data) VALUES (?, ?, 'draft', ?)").run(
    t.id, c.campaign_id, JSON.stringify({ wishes: [{ courseId: c.id, interventions: [{ type: 'CM', groups: [], hoursPerGroup: 2, sessionLength: 2, weeks: [], anyWeeks: true }], preferredRooms: ['@SUM(A1)'] }] })
  );
  const csv = Buffer.from(await (await fetch(`${base}/api/admin/export.csv`, { headers: { Cookie: cookie } })).arrayBuffer()).toString('utf8');
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes("'@SUM(A1)"));
  assert.ok(csv.includes("'+33 6 12 34 56 78"));
});

test('ressource supprimée : retirée des fiches, plus de vœu fantôme', async () => {
  const c = db.prepare("SELECT id FROM courses WHERE code = 'R1.99'").get();
  const t = db.prepare("SELECT id FROM teachers WHERE email = 'eve@x.fr'").get();
  const r = db.prepare('SELECT id, data FROM responses WHERE teacher_id = ?').get(t.id);
  const d = JSON.parse(r.data);
  d.wishes.push({ courseId: c.id, interventions: [] });
  db.prepare('UPDATE responses SET data = ? WHERE id = ?').run(JSON.stringify(d), r.id);
  assert.equal((await api('DELETE', `/api/admin/courses/${c.id}`)).status, 200);
  const after = JSON.parse(db.prepare('SELECT data FROM responses WHERE id = ?').get(r.id).data);
  assert.ok(!after.wishes.some((w) => w.courseId === c.id));
});

test('affectation vers un enseignant ou une ressource inexistants : 404 (pas 500)', async () => {
  const c = db.prepare('SELECT id FROM courses ORDER BY id').get();
  assert.equal((await api('PUT', '/api/admin/assignments', { courseId: c.id, type: 'CM', teacherId: 99999, hours: 1 })).status, 404);
  assert.equal((await api('PUT', '/api/admin/assignments', { courseId: 99999, type: 'CM', teacherId: null })).status, 404);
  const { campaign } = (await api('GET', '/api/admin/campaign')).body;
  const bad = await api('PUT', '/api/admin/campaign', {
    label: campaign.label, opensAt: 'aaaa', closesAt: 'bbbb', weeks: campaign.config.weeks, publicHolidays: [], slots: campaign.config.slots, saeFromWeek: null,
  });
  assert.equal(bad.status, 422);
});

test('groupes : renommage limité au semestre, suppression nettoie les affectations, générateur sans doublon', async () => {
  const groups = (await api('GET', '/api/admin/groups')).body.groups;
  const s3 = groups.find((g) => g.semester === 'S3' && g.name === 'GC2F1');
  const s5course = db.prepare("SELECT id FROM courses WHERE semester = 'S5' AND parcours = 'GC2F' ORDER BY id").get();
  const s3course = db.prepare("SELECT id FROM courses WHERE semester = 'S3' AND parcours = 'GC2F' ORDER BY id").get();
  const teacherId = db.prepare('SELECT id FROM teachers ORDER BY id').get().id;
  await api('PUT', '/api/admin/assignments', { courseId: s5course.id, type: 'TD', groupName: 'GC2F1', teacherId, hours: 10 });
  await api('PUT', '/api/admin/assignments', { courseId: s3course.id, type: 'TD', groupName: 'GC2F1', teacherId, hours: 12 });
  await api('PUT', `/api/admin/groups/${s3.id}`, { semester: 'S3', name: 'GC2F-A', type: 'TD', parcours: 'GC2F', size: 26 });
  const names = db.prepare('SELECT course_id, group_name FROM assignments WHERE teacher_id = ? AND type = ?').all(teacherId, 'TD');
  assert.equal(names.find((a) => a.course_id === s5course.id).group_name, 'GC2F1'); // S5 intact
  assert.equal(names.find((a) => a.course_id === s3course.id).group_name, 'GC2F-A'); // S3 suit
  const impact = (await api('GET', `/api/admin/groups/${s3.id}/impact`)).body;
  assert.deepEqual(impact, { assignments: 1, tps: 2 });
  const del = await api('DELETE', `/api/admin/groups/${s3.id}`);
  assert.equal(del.body.removedAssignments, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM assignments WHERE course_id = ?').get(s3course.id).n, 0);

  const gen = await api('POST', '/api/admin/groups/generate', { semester: 'S1', prefix: 'TD', count: 7, tpPerTd: 2, size: 24 });
  assert.ok(gen.body.skipped.includes('TD1') && gen.body.created.includes('TD7') && gen.body.created.includes('TP7B'));
});

test('export de la répartition : une ligne par groupe, décimales à la française', async () => {
  const c = db.prepare("SELECT id FROM courses WHERE code = 'R3.GC2F.11'").get();
  await api('PUT', `/api/admin/courses/${c.id}`, { code: 'R3.GC2F.11', apogee: 'VGFR311', title: 'Fiscalité BIC', semester: 'S3', parcours: 'GC2F', kind: 'R', pnCm: 7.5, pnTd: 20, pnTp: null });
  const csv = Buffer.from(await (await fetch(`${base}/api/admin/export-repartition.csv`, { headers: { Cookie: cookie } })).arrayBuffer()).toString('utf8');
  const lines = csv.split('\r\n').filter((l) => l.includes('R3.GC2F.11'));
  assert.ok(lines.some((l) => l.includes(';CM;Promotion;') && l.includes('7,5')));
  assert.ok(lines.some((l) => l.includes(';TD;GC2F2;') && l.includes('À affecter')));
});

test('calendrier : créneaux incohérents refusés', async () => {
  const { campaign } = (await api('GET', '/api/admin/campaign')).body;
  const body = { label: campaign.label, opensAt: campaign.opensAt, closesAt: campaign.closesAt, weeks: campaign.config.weeks, publicHolidays: [], saeFromWeek: null };
  for (const slots of [['12:00-10:00'], ['08:30-10:00', '08:30-10:00'], ['08:30-10:30', '10:00-12:00']]) {
    const r = await api('PUT', '/api/admin/campaign', { ...body, slots });
    assert.equal(r.status, 422, JSON.stringify(slots));
  }
  const ok = await api('PUT', '/api/admin/campaign', { ...body, slots: ['10:15-12:00', '08:30-10:00'] });
  assert.deepEqual(ok.body.campaign.config.slots, ['08:30-10:00', '10:15-12:00']); // triés
});

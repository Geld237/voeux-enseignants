/**
 * Espace « Équipe programme » (session admin obligatoire).
 *
 *   GET  /campaign                 campagne + configuration
 *   PUT  /campaign                 libellé, dates d'ouverture, calendrier, créneaux
 *   GET  /teachers                 enseignants + état de leur fiche + heures affectées
 *   POST /teachers                 ajout manuel       DELETE /teachers/:id
 *   POST /teachers/import          coller une liste (Nom ; Prénom ; e-mail)
 *   POST /invite                   { ids } ou { mode: 'all' | 'pending' }
 *   GET  /courses                  tableau de répartition : ressources, besoins, vœux, affectations
 *   POST /courses  PUT/DELETE /courses/:id   POST /courses/import
 *   PUT  /assignments              affecter (ou retirer) un enseignant à un CM / groupe
 *   GET/POST /groups  PUT/DELETE /groups/:id
 *   GET/POST /rooms   PUT/DELETE /rooms/:id
 *   GET  /export.csv  /export.json
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as R from '../lib/responses.js';
import { inviteTeachers } from '../lib/invitations.js';
import { equivalentTD, formatWeeks, ROOM_NEEDS } from '../../shared/schemas.js';
import { WEEK_KINDS } from '../../shared/calendar.js';

const router = Router();
router.use(requireAdmin);

/* ---------- utilitaires ---------- */

const campaignOf = () => R.getCurrentCampaign();
function parse(schema, body, res) {
  const p = schema.safeParse(body);
  if (!p.success) {
    res.status(422).json({ error: 'validation', issues: p.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
    return null;
  }
  return p.data;
}
const conflict = (res, message) => res.status(409).json({ error: 'conflict', message });
const isUnique = (e) => /UNIQUE/.test(String(e?.message));
const optNum = z.number().min(0).max(2000).nullable().optional();
const str = (max) => z.string().trim().max(max);

/** Découpe un texte collé depuis Excel (tabulations), un CSV (; ou ,) ou une liste. */
function splitRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : l.split(',')).map((c) => c.trim().replace(/^"|"$/g, '')));
}
const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/h$/i, ''));
  return Number.isFinite(n) ? n : null;
};

/* ---------- campagne et calendrier ---------- */

router.get('/campaign', (_req, res) => {
  const c = campaignOf();
  if (!c) return res.status(404).json({ error: 'no_campaign' });
  res.json({ campaign: c, weekKinds: WEEK_KINDS });
});

const weekSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(53),
  monday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(Object.keys(WEEK_KINDS)),
  label: str(60).default(''),
});
const campaignSchema = z.object({
  label: str(120).min(1),
  opensAt: z.string().min(10),
  closesAt: z.string().min(10),
  weeks: z.array(weekSchema).min(1).max(60),
  publicHolidays: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: str(80).default('') })).max(40),
  slots: z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'Format attendu : 08:30-10:00')).min(1).max(12),
  saeFromWeek: z.number().int().min(1).max(53).nullable(),
});

router.put('/campaign', (req, res) => {
  const c = campaignOf();
  const data = parse(campaignSchema, req.body, res);
  if (!data) return;
  // Une même semaine ne peut apparaître qu'une fois (les numéros servent d'identifiants).
  const nums = data.weeks.map((w) => w.week);
  if (new Set(nums).size !== nums.length) return conflict(res, 'Une même semaine apparaît deux fois : le calendrier doit couvrir moins d’un an.');
  if (data.closesAt <= data.opensAt) return conflict(res, 'La date de clôture doit être après la date d’ouverture.');
  const row = db.prepare('SELECT config FROM campaigns WHERE id = ?').get(c.id);
  const config = { ...JSON.parse(row.config), weeks: data.weeks, publicHolidays: data.publicHolidays, slots: data.slots, saeFromWeek: data.saeFromWeek };
  db.prepare('UPDATE campaigns SET label = ?, opens_at = ?, closes_at = ?, config = ? WHERE id = ?').run(
    data.label, new Date(data.opensAt).toISOString(), new Date(data.closesAt).toISOString(), JSON.stringify(config), c.id
  );
  res.json({ campaign: R.getCampaign(c.id) });
});

/* ---------- enseignants ---------- */

function teacherRows(c) {
  const rows = db
    .prepare(
      `SELECT t.id, t.last_name AS lastName, t.first_name AS firstName, t.email, t.contact_email AS contactEmail, t.phone,
              COALESCE(r.state, 'not_started') AS state, r.submitted_at AS submittedAt, r.updated_at AS updatedAt, r.data,
              (SELECT MAX(sent_at) FROM email_log e WHERE e.teacher_id = t.id AND e.kind = 'invitation' AND e.status = 'sent') AS invitedAt
         FROM teachers t LEFT JOIN responses r ON r.teacher_id = t.id AND r.campaign_id = ?
        ORDER BY t.last_name, t.first_name`
    )
    .all(c.id);
  const assigned = new Map();
  for (const a of db.prepare('SELECT teacher_id, type, hours FROM assignments WHERE campaign_id = ?').all(c.id)) {
    const k = c.config.coefficients[a.type.toLowerCase()] ?? 1;
    assigned.set(a.teacher_id, (assigned.get(a.teacher_id) || 0) + a.hours * k);
  }
  return rows.map(({ data, ...t }) => {
    const d = data ? JSON.parse(data) : null;
    return {
      ...t,
      teacherStatus: d?.teacherStatus ?? null,
      requestedEqTD: d ? equivalentTD(d.wishes || [], c.config.coefficients) : 0,
      assignedEqTD: Math.round((assigned.get(t.id) || 0) * 100) / 100,
    };
  });
}

router.get('/teachers', (_req, res) => {
  const c = campaignOf();
  res.json({ teachers: teacherRows(c), statuses: c.config.statuses });
});

const teacherSchema = z.object({
  lastName: str(80).min(1, 'Nom obligatoire'),
  firstName: str(80).min(1, 'Prénom obligatoire'),
  email: str(254).email('E-mail invalide'),
});

router.post('/teachers', (req, res) => {
  const t = parse(teacherSchema, req.body, res);
  if (!t) return;
  try {
    db.prepare('INSERT INTO teachers (last_name, first_name, email) VALUES (?, ?, ?)').run(t.lastName, t.firstName, t.email.toLowerCase());
  } catch (e) {
    if (isUnique(e)) return conflict(res, 'Cet e-mail existe déjà.');
    throw e;
  }
  res.json({ teachers: teacherRows(campaignOf()) });
});

router.post('/teachers/import', (req, res) => {
  const rows = splitRows(req.body?.text);
  let added = 0;
  let updated = 0;
  const errors = [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  db.transaction(() => {
    rows.forEach((cols, i) => {
      const email = cols.find((c) => emailRe.test(c));
      if (!email) {
        if (i === 0) return; // ligne d'en-tête
        errors.push(`Ligne ${i + 1} : pas d'adresse e-mail.`);
        return;
      }
      const names = cols.filter((c) => c !== email && c);
      const [lastName = '', firstName = ''] = names;
      if (!lastName) {
        errors.push(`Ligne ${i + 1} : nom manquant.`);
        return;
      }
      const existing = db.prepare('SELECT id FROM teachers WHERE email = ?').get(email.toLowerCase());
      if (existing) {
        db.prepare('UPDATE teachers SET last_name = ?, first_name = ?, updated_at = ? WHERE id = ?').run(lastName, firstName, nowIso(), existing.id);
        updated += 1;
      } else {
        db.prepare('INSERT INTO teachers (last_name, first_name, email) VALUES (?, ?, ?)').run(lastName, firstName, email.toLowerCase());
        added += 1;
      }
    });
  })();
  res.json({ added, updated, errors, teachers: teacherRows(campaignOf()) });
});

router.delete('/teachers/:id', (req, res) => {
  db.prepare('DELETE FROM teachers WHERE id = ?').run(Number(req.params.id));
  res.json({ teachers: teacherRows(campaignOf()) });
});

router.post('/invite', async (req, res) => {
  const c = campaignOf();
  let ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  if (req.body?.mode === 'all') ids = db.prepare('SELECT id FROM teachers').all().map((t) => t.id);
  if (req.body?.mode === 'pending') ids = teacherRows(c).filter((t) => t.state !== 'submitted').map((t) => t.id);
  const sent = await inviteTeachers(c, ids);
  res.json({ sent, teachers: teacherRows(c) });
});

/* ---------- tableau de répartition ---------- */

function repartition(c) {
  const courses = R.getCourses(c.id);
  const groups = R.getGroups(c.id);
  const teachers = new Map(db.prepare('SELECT id, last_name, first_name FROM teachers').all().map((t) => [t.id, `${t.last_name} ${t.first_name}`]));
  const wishRows = db
    .prepare(
      `SELECT w.course_id, w.type, w.groups, w.any_groups, w.hours_per_group, w.priority, r.teacher_id, r.state
         FROM wishes w JOIN responses r ON r.id = w.response_id WHERE r.campaign_id = ?`
    )
    .all(c.id);
  const assignRows = db.prepare('SELECT * FROM assignments WHERE campaign_id = ?').all(c.id);

  return courses.map((course) => {
    const scope = groups.filter((g) => g.semester === course.semester && (!course.parcours || g.parcours === course.parcours));
    const td = scope.filter((g) => g.type === 'TD');
    const tp = scope.filter((g) => g.type === 'TP');
    const need = {
      CM: course.pnCm ?? null,
      TD: course.pnTd != null ? course.pnTd * td.length : null,
      TP: course.pnTp != null ? course.pnTp * tp.length : null,
    };
    const wishes = wishRows
      .filter((w) => w.course_id === course.id)
      .map((w) => {
        const g = JSON.parse(w.groups);
        const n = w.type === 'CM' ? 1 : g.length || w.any_groups || 0;
        return {
          teacherId: w.teacher_id, teacher: teachers.get(w.teacher_id), state: w.state, type: w.type, priority: w.priority,
          groups: g, anyGroups: w.any_groups, hoursPerGroup: w.hours_per_group, hours: w.hours_per_group * n,
        };
      });
    const requested = { CM: 0, TD: 0, TP: 0 };
    for (const w of wishes) requested[w.type] += w.hours;
    const assignments = assignRows
      .filter((a) => a.course_id === course.id)
      .map((a) => ({ type: a.type, groupName: a.group_name, teacherId: a.teacher_id, teacher: teachers.get(a.teacher_id), hours: a.hours }));
    const assigned = { CM: 0, TD: 0, TP: 0 };
    for (const a of assignments) assigned[a.type] += a.hours;
    return { ...course, groupsTD: td.map((g) => g.name), groupsTP: tp.map((g) => g.name), need, requested, assigned, wishes, assignments };
  });
}

router.get('/courses', (_req, res) => {
  const c = campaignOf();
  res.json({
    courses: repartition(c),
    teachers: db.prepare('SELECT id, last_name AS lastName, first_name AS firstName FROM teachers ORDER BY last_name').all(),
    semesters: c.config.semesters,
    parcours: c.config.parcours,
  });
});

const courseSchema = z.object({
  code: str(40).min(1, 'Code obligatoire'),
  apogee: str(40).nullable().optional(),
  title: str(200).min(1, 'Intitulé obligatoire'),
  semester: str(10).min(1),
  parcours: str(20).nullable().optional(),
  kind: z.enum(['R', 'SAE']),
  pnCm: optNum,
  pnTd: optNum,
  pnTp: optNum,
  toConfirm: z.boolean().optional(),
});
const courseArgs = (c, d) => [d.code, d.apogee || null, d.title, d.semester, d.parcours || null, d.kind, d.pnCm ?? null, d.pnTd ?? null, d.pnTp ?? null, d.toConfirm ? 1 : 0];

router.post('/courses', (req, res) => {
  const c = campaignOf();
  const d = parse(courseSchema, req.body, res);
  if (!d) return;
  try {
    db.prepare(
      `INSERT INTO courses (code, apogee_code, title, semester, parcours, kind, pn_cm, pn_td, pn_tp, to_confirm, campaign_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...courseArgs(c, d), c.id);
  } catch (e) {
    if (isUnique(e)) return conflict(res, `Le code ${d.code} existe déjà.`);
    throw e;
  }
  res.json({ courses: repartition(c) });
});

router.put('/courses/:id', (req, res) => {
  const c = campaignOf();
  const d = parse(courseSchema, req.body, res);
  if (!d) return;
  try {
    db.prepare(
      `UPDATE courses SET code = ?, apogee_code = ?, title = ?, semester = ?, parcours = ?, kind = ?, pn_cm = ?, pn_td = ?, pn_tp = ?, to_confirm = ?
        WHERE id = ? AND campaign_id = ?`
    ).run(...courseArgs(c, d), Number(req.params.id), c.id);
  } catch (e) {
    if (isUnique(e)) return conflict(res, `Le code ${d.code} existe déjà.`);
    throw e;
  }
  res.json({ courses: repartition(c) });
});

router.delete('/courses/:id', (req, res) => {
  const c = campaignOf();
  db.prepare('DELETE FROM courses WHERE id = ? AND campaign_id = ?').run(Number(req.params.id), c.id);
  res.json({ courses: repartition(c) });
});

/**
 * Import d'un tableau collé : Code ; Code Apogée ; Intitulé ; Semestre ; Parcours ; CM ; TD ; TP
 * (une ligne d'en-tête est ignorée). Les codes existants sont mis à jour.
 */
router.post('/courses/import', (req, res) => {
  const c = campaignOf();
  const sems = new Set(c.config.semesters.map((s) => s.key));
  const parcours = new Set(Object.keys(c.config.parcours));
  let added = 0;
  let updated = 0;
  const errors = [];
  db.transaction(() => {
    splitRows(req.body?.text).forEach((cols, i) => {
      const [code, apogee, title, semester, parc, cm, td, tp] = cols;
      if (!code || /^code/i.test(code)) return;
      const sem = String(semester || '').toUpperCase().replace(/\s/g, '');
      if (!title) return errors.push(`Ligne ${i + 1} : intitulé manquant.`);
      if (!sems.has(sem)) return errors.push(`Ligne ${i + 1} : semestre « ${semester} » inconnu (${[...sems].join(', ')}).`);
      const p = String(parc || '').toUpperCase().trim();
      if (p && !parcours.has(p) && !/^(TC|TRONC)/.test(p)) return errors.push(`Ligne ${i + 1} : parcours « ${parc} » inconnu.`);
      const d = {
        code, apogee: apogee || null, title, semester: sem, parcours: p && parcours.has(p) ? p : null,
        kind: /^SA/i.test(code) ? 'SAE' : 'R', pnCm: num(cm), pnTd: num(td), pnTp: num(tp), toConfirm: false,
      };
      const existing = db.prepare('SELECT id FROM courses WHERE campaign_id = ? AND code = ?').get(c.id, code);
      if (existing) {
        db.prepare(
          `UPDATE courses SET code = ?, apogee_code = ?, title = ?, semester = ?, parcours = ?, kind = ?, pn_cm = ?, pn_td = ?, pn_tp = ?, to_confirm = ? WHERE id = ?`
        ).run(...courseArgs(c, d), existing.id);
        updated += 1;
      } else {
        db.prepare(
          `INSERT INTO courses (code, apogee_code, title, semester, parcours, kind, pn_cm, pn_td, pn_tp, to_confirm, campaign_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(...courseArgs(c, d), c.id);
        added += 1;
      }
    });
  })();
  res.json({ added, updated, errors, courses: repartition(c) });
});

const assignmentSchema = z.object({
  courseId: z.number().int().positive(),
  type: z.enum(['CM', 'TD', 'TP']),
  groupName: str(40).default(''),
  teacherId: z.number().int().positive().nullable(),
  hours: z.number().min(0).max(500).default(0),
});

router.put('/assignments', (req, res) => {
  const c = campaignOf();
  const a = parse(assignmentSchema, req.body, res);
  if (!a) return;
  const groupName = a.type === 'CM' ? '' : a.groupName;
  if (a.teacherId === null) {
    db.prepare('DELETE FROM assignments WHERE course_id = ? AND type = ? AND group_name = ?').run(a.courseId, a.type, groupName);
  } else {
    db.prepare(
      `INSERT INTO assignments (campaign_id, course_id, type, group_name, teacher_id, hours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (course_id, type, group_name) DO UPDATE SET teacher_id = excluded.teacher_id, hours = excluded.hours, updated_at = excluded.updated_at`
    ).run(c.id, a.courseId, a.type, groupName, a.teacherId, a.hours, nowIso());
  }
  res.json({ course: repartition(c).find((x) => x.id === a.courseId) });
});

/* ---------- groupes ---------- */

const groupSchema = z.object({
  semester: str(10).min(1),
  name: str(40).min(1, 'Nom obligatoire'),
  type: z.enum(['TD', 'TP']),
  parcours: str(20).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  size: z.number().int().min(0).max(1000).nullable().optional(),
  sort: z.number().int().min(0).max(10000).optional(),
});

router.get('/groups', (_req, res) => {
  const c = campaignOf();
  res.json({ groups: R.getGroups(c.id), semesters: c.config.semesters, parcours: c.config.parcours });
});

router.post('/groups', (req, res) => {
  const c = campaignOf();
  const g = parse(groupSchema, req.body, res);
  if (!g) return;
  const sort = g.sort ?? (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM groups WHERE campaign_id = ?').get(c.id).n);
  try {
    db.prepare('INSERT INTO groups (campaign_id, semester, name, type, parcours, parent_id, size, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      c.id, g.semester, g.name, g.type, g.parcours || null, g.type === 'TP' ? g.parentId ?? null : null, g.size ?? null, sort
    );
  } catch (e) {
    if (isUnique(e)) return conflict(res, `Le groupe ${g.name} existe déjà en ${g.semester}.`);
    throw e;
  }
  res.json({ groups: R.getGroups(c.id) });
});

router.put('/groups/:id', (req, res) => {
  const c = campaignOf();
  const g = parse(groupSchema, req.body, res);
  if (!g) return;
  const old = db.prepare('SELECT * FROM groups WHERE id = ? AND campaign_id = ?').get(Number(req.params.id), c.id);
  if (!old) return res.status(404).json({ error: 'not_found' });
  try {
    db.transaction(() => {
      db.prepare('UPDATE groups SET semester = ?, name = ?, type = ?, parcours = ?, parent_id = ?, size = ?, sort = ? WHERE id = ?').run(
        g.semester, g.name, g.type, g.parcours || null, g.type === 'TP' ? g.parentId ?? null : null, g.size ?? null, g.sort ?? old.sort, old.id
      );
      // Un renommage suit dans les affectations (les vœux déjà saisis gardent l'ancien nom).
      if (old.name !== g.name) {
        db.prepare('UPDATE assignments SET group_name = ? WHERE campaign_id = ? AND group_name = ?').run(g.name, c.id, old.name);
      }
    })();
  } catch (e) {
    if (isUnique(e)) return conflict(res, `Le groupe ${g.name} existe déjà en ${g.semester}.`);
    throw e;
  }
  res.json({ groups: R.getGroups(c.id) });
});

router.delete('/groups/:id', (req, res) => {
  const c = campaignOf();
  db.prepare('DELETE FROM groups WHERE id = ? AND campaign_id = ?').run(Number(req.params.id), c.id);
  res.json({ groups: R.getGroups(c.id) });
});

/* ---------- salles ---------- */

const ROOM_FEATURES = ['projector', 'computer', 'hybrid'];
const roomSchema = z.object({
  name: str(60).min(1, 'Nom obligatoire'),
  kind: z.enum(['amphi', 'td', 'info', 'hybride', 'autre']),
  capacity: z.number().int().min(0).max(2000).nullable().optional(),
  features: z.array(z.enum(ROOM_FEATURES)).max(3).default([]),
  busy: z.record(z.string().max(40), z.boolean()).default({}),
  note: str(300).nullable().optional(),
});

router.get('/rooms', (_req, res) => {
  const c = campaignOf();
  res.json({ rooms: R.getRooms(c.id), features: Object.fromEntries(ROOM_FEATURES.map((f) => [f, ROOM_NEEDS[f]])) });
});

const roomArgs = (r) => [r.name, r.kind, r.capacity ?? null, JSON.stringify(r.features), JSON.stringify(Object.fromEntries(Object.entries(r.busy).filter(([, v]) => v))), r.note || null];

router.post('/rooms', (req, res) => {
  const c = campaignOf();
  const r = parse(roomSchema, req.body, res);
  if (!r) return;
  try {
    db.prepare('INSERT INTO rooms (name, kind, capacity, features, busy, note, campaign_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...roomArgs(r), c.id);
  } catch (e) {
    if (isUnique(e)) return conflict(res, `La salle ${r.name} existe déjà.`);
    throw e;
  }
  res.json({ rooms: R.getRooms(c.id) });
});

router.put('/rooms/:id', (req, res) => {
  const c = campaignOf();
  const r = parse(roomSchema, req.body, res);
  if (!r) return;
  try {
    db.prepare('UPDATE rooms SET name = ?, kind = ?, capacity = ?, features = ?, busy = ?, note = ? WHERE id = ? AND campaign_id = ?').run(
      ...roomArgs(r), Number(req.params.id), c.id
    );
  } catch (e) {
    if (isUnique(e)) return conflict(res, `La salle ${r.name} existe déjà.`);
    throw e;
  }
  res.json({ rooms: R.getRooms(c.id) });
});

router.delete('/rooms/:id', (req, res) => {
  const c = campaignOf();
  db.prepare('DELETE FROM rooms WHERE id = ? AND campaign_id = ?').run(Number(req.params.id), c.id);
  res.json({ rooms: R.getRooms(c.id) });
});

/* ---------- export ---------- */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/export.csv', (_req, res) => {
  const c = campaignOf();
  const courses = new Map(R.getCourses(c.id).map((x) => [x.id, x]));
  const header = ['Nom', 'Prénom', 'E-mail', 'Téléphone', 'État fiche', 'Code', 'Code Apogée', 'Intitulé', 'Semestre', 'Parcours', 'Type',
    'Groupes souhaités', 'Heures / groupe', 'Durée séance (h)', 'Séances / groupe', 'Semaines', 'Salles souhaitées', 'Affecté (groupe)', 'Heures affectées'];
  const lines = [header];
  const rows = db
    .prepare(
      `SELECT t.id AS tid, t.last_name, t.first_name, COALESCE(t.contact_email, t.email) AS email, t.phone, r.state, r.data
         FROM responses r JOIN teachers t ON t.id = r.teacher_id WHERE r.campaign_id = ? ORDER BY t.last_name`
    )
    .all(c.id);
  const assignments = db.prepare('SELECT * FROM assignments WHERE campaign_id = ?').all(c.id);
  for (const r of rows) {
    const d = JSON.parse(r.data);
    for (const w of d.wishes || []) {
      const course = courses.get(w.courseId);
      if (!course) continue;
      for (const iv of w.interventions) {
        const mine = assignments.filter((a) => a.teacher_id === r.tid && a.course_id === w.courseId && a.type === iv.type);
        lines.push([
          r.last_name, r.first_name, r.email, r.phone, r.state === 'submitted' ? 'envoyée' : 'brouillon',
          course.code, course.apogee, course.title, course.semester, course.parcours || 'Tronc commun', iv.type,
          iv.type === 'CM' ? 'promotion' : iv.groups.length ? iv.groups.join(' ') : `${iv.anyGroups} au choix`,
          iv.hoursPerGroup, iv.sessionLength, Math.ceil(iv.hoursPerGroup / iv.sessionLength - 1e-9),
          iv.anyWeeks ? 'indifférent' : formatWeeks(iv.weeks, c.config), (w.preferredRooms || []).join(' '),
          mine.map((a) => a.group_name || 'promotion').join(' '), mine.reduce((s, a) => s + a.hours, 0) || '',
        ]);
      }
    }
  }
  const csv = '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="voeux-export.csv"');
  res.send(csv);
});

router.get('/export.json', (_req, res) => {
  const c = campaignOf();
  const responses = db
    .prepare(
      `SELECT t.last_name AS lastName, t.first_name AS firstName, t.email, t.contact_email AS contactEmail, t.phone,
              r.state, r.submitted_at AS submittedAt, r.data
         FROM responses r JOIN teachers t ON t.id = r.teacher_id WHERE r.campaign_id = ?`
    )
    .all(c.id)
    .map(({ data, ...r }) => ({ ...r, fiche: JSON.parse(data) }));
  res.set('Content-Disposition', 'attachment; filename="voeux-export.json"');
  res.json({
    campaign: { label: c.label, opensAt: c.opensAt, closesAt: c.closesAt, config: c.config },
    courses: repartition(c).map(({ wishes, ...x }) => x),
    groups: R.getGroups(c.id),
    rooms: R.getRooms(c.id),
    responses,
  });
});

export default router;

/**
 * Campagne de démonstration : BUT GEA, semestres impairs 2026-2027.
 *
 *   npm run seed         → remplit la base si elle est vide
 *   npm run seed:reset   → vide toutes les tables puis remplit
 *
 * Le serveur appelle aussi seedIfEmpty() au démarrage en mode démo.
 */
import { db } from './connection.js';
import { catalogue } from './catalogue-gea.js';
import { fileURLToPath } from 'node:url';
import { isoWeekMonday } from '../../shared/calendar.js';

/* ---------- Calendrier ---------- */

/**
 * Semaines du semestre impair 2026-2027 (S36 2026 → S2 2027).
 * kind : intro (rentrée), teaching, holiday (non sélectionnable), exam (évaluations, soutenances).
 * À ajuster selon le calendrier universitaire officiel.
 */
function buildWeeks() {
  const spec = [
    [2026, 36, 'intro', 'Rentrée'],
    ...[37, 38, 39, 40, 41, 42, 43].map((w) => [2026, w, 'teaching', 'Période 1']),
    [2026, 44, 'holiday', 'Vacances de la Toussaint'],
    ...[45, 46, 47, 48, 49, 50, 51].map((w) => [2026, w, 'teaching', 'Période 2']),
    [2026, 52, 'holiday', 'Vacances de Noël'],
    [2026, 53, 'holiday', 'Vacances de Noël'],
    [2027, 1, 'exam', 'Évaluations / soutenances'],
    [2027, 2, 'exam', 'Évaluations / soutenances'],
  ];
  return spec.map(([year, week, kind, label]) => ({ year, week, kind, label, monday: isoWeekMonday(year, week) }));
}

/**
 * Groupes de démonstration (constitués ensuite manuellement dans l'onglet « Groupes »).
 * [semestre, nom, type, parcours, TD parent, effectif]
 */
const BUT23 = [['GC2F1', 'GC2F'], ['GC2F2', 'GC2F'], ['CG2P', 'CG2P'], ['GPRH', 'GPRH'], ['GEMA', 'GEMA']];
export const defaultGroups = [
  ...[1, 2, 3, 4, 5].flatMap((n) => [
    ['S1', `TD${n}`, 'TD', null, null, 28],
    ['S1', `TP${n}A`, 'TP', null, `TD${n}`, 14],
    ['S1', `TP${n}B`, 'TP', null, `TD${n}`, 14],
  ]),
  ...['S3', 'S5'].flatMap((sem) =>
    BUT23.flatMap(([g, p]) => [
      [sem, g, 'TD', p, null, 26],
      [sem, `${g}-A`, 'TP', p, g, 13],
      [sem, `${g}-B`, 'TP', p, g, 13],
    ])
  ),
];

/** Salles de démonstration : [nom, type, capacité, équipements] — le planning est généré. */
export const defaultRooms = [
  ['Amphi A', 'amphi', 180, ['projector']],
  ['Amphi B', 'amphi', 120, ['projector']],
  ['R300', 'info', 30, ['projector', 'computer']],
  ['R302', 'info', 24, ['computer']],
  ['R305', 'info', 30, ['projector', 'computer']],
  ['P302', 'hybride', 32, ['projector', 'hybrid']],
  ['Q309', 'td', 40, ['projector']],
  ['S101', 'td', 30, ['projector']],
  ['S102', 'td', 30, []],
  ['S103', 'td', 32, ['projector']],
  ['S104', 'td', 28, []],
];

export function seedGroups(campaignId, groups = defaultGroups) {
  const ins = db.prepare('INSERT INTO groups (campaign_id, semester, name, type, parcours, size, sort) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const ids = new Map();
  groups.forEach(([sem, name, type, parcours, , size], i) => {
    ids.set(`${sem}/${name}`, ins.run(campaignId, sem, name, type, parcours, size, i).lastInsertRowid);
  });
  const setParent = db.prepare('UPDATE groups SET parent_id = ? WHERE id = ?');
  for (const [sem, name, , , parent] of groups) if (parent) setParent.run(ids.get(`${sem}/${parent}`), ids.get(`${sem}/${name}`));
}

export function seedRooms(campaignId, config) {
  const ins = db.prepare('INSERT INTO rooms (campaign_id, name, kind, capacity, features, busy) VALUES (?, ?, ?, ?, ?, ?)');
  defaultRooms.forEach(([name, kind, capacity, features], r) => {
    // Occupation fictive mais stable : environ un créneau sur trois déjà réservé.
    const busy = {};
    config.days.forEach((d, i) => config.slots.forEach((s, j) => {
      if ((i * 7 + j * 3 + r * 5) % 3 === 0) busy[`${d.key}|${s}`] = true;
    }));
    ins.run(campaignId, name, kind, capacity, JSON.stringify(features), JSON.stringify(busy));
  });
}

export const defaultCampaignConfig = {
  version: 2,
  program: 'BUT GEA — formation initiale',
  semesters: [
    { key: 'S1', label: 'S1 · BUT1', promotion: 'BUT1' },
    { key: 'S3', label: 'S3 · BUT2', promotion: 'BUT2' },
    { key: 'S5', label: 'S5 · BUT3', promotion: 'BUT3' },
  ],
  parcours: { GC2F: 'Gestion comptable, fiscale et financière', CG2P: 'Contrôle de gestion et pilotage de la performance', GPRH: 'Gestion et pilotage des ressources humaines', GEMA: 'Gestion, entrepreneuriat et management d’activités' },
  weeks: buildWeeks(),
  publicHolidays: [{ date: '2026-11-11', label: 'Armistice (mercredi, S46)' }],
  saeFromWeek: 45,
  days: [
    { key: 'MON', label: 'Lundi', short: 'Lun' },
    { key: 'TUE', label: 'Mardi', short: 'Mar' },
    { key: 'WED', label: 'Mercredi', short: 'Mer' },
    { key: 'THU', label: 'Jeudi', short: 'Jeu' },
    { key: 'FRI', label: 'Vendredi', short: 'Ven' },
  ],
  // Créneaux de la fiche de vœux actuelle du département
  slots: ['08:30-10:00', '10:15-12:00', '12:00-13:30', '13:30-15:00', '15:00-17:00', '17:15-18:45'],
  sessionLengths: [1, 1.5, 2, 2.5, 3, 3.5, 4],
  coefficients: { cm: 1.5, td: 1, tp: 1 },
  statuses: [
    { value: 'ec', label: 'Enseignant-chercheur titulaire (MCF, PR)', serviceHours: 192 },
    { value: 'second_degre', label: 'Enseignant du second degré (PRAG, PRCE)', serviceHours: 384 },
    { value: 'contractuel', label: 'Enseignant contractuel (CDD, ESAS…)' },
    { value: 'ater', label: 'ATER', serviceHours: 192 },
    { value: 'doctorant', label: 'Doctorant contractuel avec mission d’enseignement', serviceHours: 64, maxHours: 64 },
    {
      value: 'vacataire',
      label: 'Chargé d’enseignement vacataire',
      requiresEmployer: true,
      employerHelp: 'Les vacataires doivent justifier d’une activité principale (employeur, statut d’indépendant…).',
    },
  ],
  minAvailableSlots: 4,
  justifyAboveRatio: 0.5,
};

// Enseignants fictifs (les vrais seront importés par l'équipe programme, module 3)
const teachers = [
  ['Martin', 'Claire', 'claire.martin@univ-demo.fr'],
  ['Bernard', 'Hugo', 'hugo.bernard@univ-demo.fr'],
  ['Diallo', 'Aminata', 'aminata.diallo@univ-demo.fr'],
  ['Nguyen', 'Thomas', 'thomas.nguyen@univ-demo.fr'],
  ['Moreau', 'Sophie', 'sophie.moreau@univ-demo.fr'],
  ['Lefèvre', 'Julien', 'julien.lefevre@univ-demo.fr'],
];

export function seed() {
  const now = new Date();
  const opensAt = new Date(now.getTime() - 86_400_000).toISOString();
  const closesAt = new Date(now.getTime() + 21 * 86_400_000).toISOString();

  db.transaction(() => {
    const { lastInsertRowid: campaignId } = db
      .prepare('INSERT INTO campaigns (label, opens_at, closes_at, config) VALUES (?, ?, ?, ?)')
      .run('BUT GEA — Semestres impairs 2026-2027', opensAt, closesAt, JSON.stringify(defaultCampaignConfig));

    const insCourse = db.prepare(
      `INSERT INTO courses (campaign_id, code, apogee_code, title, semester, parcours, kind, pn_cm, pn_td, pn_tp, to_confirm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of catalogue) {
      insCourse.run(campaignId, c.code, c.apogee, c.title, c.semester, c.parcours, c.kind, c.pnCm, c.pnTd, c.pnTp, c.toConfirm ? 1 : 0);
    }

    seedGroups(campaignId);
    seedRooms(campaignId, defaultCampaignConfig);

    const insTeacher = db.prepare('INSERT INTO teachers (last_name, first_name, email) VALUES (?, ?, ?)');
    for (const t of teachers) insTeacher.run(...t);
  })();
}

/** Base v2 sans groupes ni salles : on ajoute ceux de démonstration à la campagne existante. */
export function ensureSetup() {
  for (const { id, config } of db.prepare('SELECT id, config FROM campaigns').all()) {
    if (!db.prepare('SELECT COUNT(*) n FROM groups WHERE campaign_id = ?').get(id).n) seedGroups(id);
    if (!db.prepare('SELECT COUNT(*) n FROM rooms WHERE campaign_id = ?').get(id).n) seedRooms(id, JSON.parse(config));
  }
}

export function isEmpty() {
  return db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n === 0;
}

export function seedIfEmpty() {
  if (!isEmpty()) return false;
  seed();
  return true;
}

export function reset() {
  db.transaction(() => {
    for (const t of [
      'dev_outbox', 'email_log', 'planning_entries', 'availabilities', 'wishes', 'responses',
      'sessions', 'access_tokens', 'rooms', 'groups', 'courses', 'teachers', 'campaigns',
    ]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  })();
}

// Exécution directe : node server/db/seed.js [--reset]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) {
    reset();
    console.log('Base vidée.');
  }
  console.log(seedIfEmpty() ? 'Données de démonstration créées.' : 'La base contient déjà des données (utilisez --reset).');
  ensureSetup();
}

/**
 * Règles partagées entre le navigateur et le serveur (fiche de vœux v2).
 *
 * - Schémas zod : forme des données (types, longueurs).
 * - Fonctions de calcul : séances, heures éq. TD, progression semaine par semaine.
 * - validateSubmission : règles métier issues de l'analyse des fiches du S1 et des règles
 *   de construction d'EDT de l'équipe programme. Les erreurs bloquent l'envoi,
 *   les avertissements sont seulement affichés.
 */
import { z } from 'zod';

/* ======================= Profil ======================= */

export const profileSchema = z.object({
  contactEmail: z.string().trim().min(1, 'Adresse e-mail obligatoire').email('Adresse e-mail invalide').max(254),
  phone: z
    .string()
    .trim()
    .min(1, 'Numéro de téléphone obligatoire')
    .regex(/^\+?[0-9 .()-]+$/, 'Caractères autorisés : chiffres, espaces, + . - ( )')
    .refine((v) => {
      const digits = v.replace(/\D/g, '').length;
      return digits >= 9 && digits <= 15;
    }, 'Numéro de téléphone invalide')
    .max(25),
});

/* ======================= Brouillon ======================= */

export const INTERVENTION_TYPES = ['CM', 'TD', 'TP'];
export const RHYTHMS = {
  weekly: 'Une séance par semaine',
  twice: 'Deux séances par semaine',
  biweekly: 'Une semaine sur deux',
  block: 'Concentré sur quelques semaines',
  free: 'Indifférent',
};
export const EVALUATION_KINDS = {
  none: 'Pas d’évaluation à organiser',
  in_class: 'Contrôle continu, pendant les séances',
  common: 'Contrôle commun (toute la promotion)',
  oral: 'Soutenances / oraux',
};
export const ROOM_NEEDS = {
  projector: 'Vidéoprojecteur',
  computer: 'Salle informatique',
  hybrid: 'Salle hybride',
  large: 'Grande salle',
  exam: 'Salle d’examen (dernière séance)',
};
export const AVAILABILITY_LEVELS = ['preferred', 'possible', 'avoid', 'unavailable'];

const hours = z.number().min(0).max(500);
const week = z.number().int().min(1).max(53);
const text = (max) => z.string().max(max);

export const interventionSchema = z.object({
  type: z.enum(INTERVENTION_TYPES),
  groups: z.array(z.string().max(20)).max(20).default([]),
  anyGroups: z.number().int().min(0).max(20).nullable().default(null), // « indifférent » : nombre de groupes
  hoursPerGroup: hours,
  sessionLength: z.number().min(0.5).max(9),
  rhythm: z.enum(Object.keys(RHYTHMS)).default('weekly'),
  weeks: z.array(week).max(30).default([]),
  anyWeeks: z.boolean().default(false),
});

export const evaluationSchema = z.object({
  kind: z.enum(Object.keys(EVALUATION_KINDS)).default('none'),
  duration: z.number().min(0.5).max(8).nullable().default(null),
  weeks: z.array(week).max(10).default([]),
  note: text(300).default(''),
});

export const wishSchema = z.object({
  courseId: z.number().int().positive(),
  interventions: z.array(interventionSchema).max(3).default([]),
  // zod n'applique pas les défauts internes à une valeur par défaut : on la donne complète.
  evaluation: evaluationSchema.default({ kind: 'none', duration: null, weeks: [], note: '' }),
  rooms: z.array(z.enum(Object.keys(ROOM_NEEDS))).max(5).default([]),
  preferredRooms: z.array(z.string().max(60)).max(5).default([]), // salles proposées retenues
  roomNote: text(200).default(''),
  coTeachers: text(200).default(''),
  afterCourseId: z.number().int().positive().nullable().default(null),
  extraHoursReason: text(500).default(''),
  note: text(1000).default(''),
});

export const exceptionSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
  note: text(200).default(''),
});

export const organisationSchema = z.object({
  maxDays: z.number().int().min(1).max(5).nullable().default(null),
  sameHalfDay: z.boolean().default(false),
  earliestStart: z.string().max(5).nullable().default(null), // "09:00"
  latestEnd: z.string().max(5).nullable().default(null), // "16:30"
  maxSameGroup: z.number().min(1).max(8).nullable().default(null),
  lunch: z.enum(['none', '30', '45', '60']).nullable().default(null),
  quarterBreak: z.enum(['yes', 'no', 'any']).nullable().default(null),
  keepLastYear: z.boolean().default(false),
});

export const draftSchema = z.object({
  teacherStatus: z.string().max(40).nullable().optional(),
  mainEmployer: text(200).nullable().optional(),
  otherCommitments: text(1000).optional(),
  wishes: z.array(wishSchema).max(30).optional(),
  availability: z.record(z.string().max(40), z.enum(AVAILABILITY_LEVELS)).optional(),
  availabilityNote: text(1000).optional(),
  early8h: z.boolean().optional(),
  availableFromWeek: week.nullable().optional(),
  exceptions: z.array(exceptionSchema).max(20).optional(),
  organisation: organisationSchema.optional(),
  comment: text(3000).nullable().optional(),
});

/* ======================= Valeurs par défaut ======================= */

export const slotKey = (day, slot) => `${day}|${slot}`;

export function emptyDraft() {
  return {
    teacherStatus: null,
    mainEmployer: '',
    otherCommitments: '',
    wishes: [],
    availability: {},
    availabilityNote: '',
    early8h: false,
    availableFromWeek: null,
    exceptions: [],
    organisation: organisationSchema.parse({}),
    comment: '',
  };
}

export function newIntervention(type, course) {
  const pn = { CM: course?.pnCm, TD: course?.pnTd, TP: course?.pnTp }[type];
  return {
    type,
    groups: [],
    anyGroups: null,
    hoursPerGroup: pn || 0,
    sessionLength: type === 'CM' ? 2 : 1.5,
    rhythm: 'weekly',
    weeks: [],
    anyWeeks: false,
  };
}

export function newWish(course) {
  return wishSchema.parse({ courseId: course.id });
}

/** Complète un brouillon enregistré avec les champs ajoutés depuis. */
export function normalizeDraft(d) {
  const base = emptyDraft();
  return {
    ...base,
    ...d,
    organisation: { ...base.organisation, ...(d?.organisation || {}) },
    wishes: (d?.wishes || []).map((w) => wishSchema.parse(w)),
  };
}

/* ======================= Calculs ======================= */

export const groupCount = (iv) => (iv.type === 'CM' ? 1 : iv.groups.length || iv.anyGroups || 0);
export const sessionsPerGroup = (iv) => (iv.sessionLength > 0 ? Math.ceil((iv.hoursPerGroup || 0) / iv.sessionLength - 1e-9) : 0);
export const interventionHours = (iv) => (iv.hoursPerGroup || 0) * groupCount(iv);

export function equivalentTD(wishes, coefficients = { cm: 1.5, td: 1, tp: 1 }) {
  let total = 0;
  for (const w of wishes || []) {
    for (const iv of w.interventions || []) {
      total += interventionHours(iv) * (coefficients[iv.type.toLowerCase()] ?? 1);
    }
  }
  return Math.round(total * 100) / 100;
}

/** Rang d'une semaine dans le calendrier de la campagne (S36 2026 avant S1 2027). */
export const weekOrder = (config) => {
  const idx = new Map(config.weeks.map((w, i) => [w.week, i]));
  return (n) => idx.get(n) ?? 999;
};

export const formatWeeks = (weeks, config) => {
  if (!weeks?.length) return '';
  const order = weekOrder(config);
  const sorted = [...weeks].sort((a, b) => order(a) - order(b));
  // regroupe les suites de semaines consécutives dans le calendrier : S37–S41, S45
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const w of sorted.slice(1).concat(null)) {
    if (w !== null && order(w) === order(prev) + 1) {
      prev = w;
      continue;
    }
    parts.push(start === prev ? `S${start}` : `S${start}–S${prev}`);
    start = prev = w;
  }
  return parts.join(', ');
};

/**
 * Charge estimée par semaine (heures enseignant), en répartissant chaque intervention
 * uniformément sur ses semaines. Les interventions « semaines indifférentes » sont à part.
 */
export function weeklyLoad(wishes, config) {
  const load = Object.fromEntries(config.weeks.map((w) => [w.week, 0]));
  let unplanned = 0;
  for (const w of wishes || []) {
    for (const iv of w.interventions || []) {
      const h = interventionHours(iv);
      if (iv.anyWeeks || !iv.weeks.length) {
        unplanned += h;
        continue;
      }
      for (const n of iv.weeks) if (n in load) load[n] += h / iv.weeks.length;
    }
  }
  for (const k in load) load[k] = Math.round(load[k] * 10) / 10;
  return { load, unplanned: Math.round(unplanned * 10) / 10 };
}

export function availabilityStats(availability, config) {
  const total = config.days.length * config.slots.length;
  const count = { preferred: 0, possible: 0, avoid: 0, unavailable: 0, unset: 0 };
  for (const d of config.days) {
    for (const s of config.slots) count[availability?.[slotKey(d.key, s)] || 'unset'] += 1;
  }
  return { total, ...count, open: count.preferred + count.possible + count.avoid };
}

/* ======================= Salles ======================= */

/** Effectif concerné par une intervention (CM = tous les TD du semestre / parcours). */
export function audienceSize(iv, course, groupList = []) {
  const sem = groupList.filter((g) => g.semester === course.semester && (!course.parcours || g.parcours === course.parcours));
  const sizeOf = (type) => sem.filter((g) => g.type === type);
  if (iv.type === 'CM') return sizeOf('TD').reduce((s, g) => s + (g.size || 0), 0);
  const chosen = sizeOf(iv.type).filter((g) => iv.groups.includes(g.name));
  const pool = chosen.length ? chosen : sizeOf(iv.type);
  return Math.max(0, ...pool.map((g) => g.size || 0));
}

const NEED_FEATURE = { projector: 'projector', computer: 'computer', hybrid: 'hybrid' };

/**
 * Salles proposées pour un vœu : équipements demandés, capacité suffisante,
 * et créneaux libres là où l'enseignant est disponible (préféré compte double).
 * @returns [{ room, score, freeSlots, preferredSlots, reasons }]
 */
export function suggestRooms(wish, course, rooms, availability, config) {
  const needs = (wish.rooms || []).map((r) => NEED_FEATURE[r]).filter(Boolean);
  const types = wish.interventions.map((iv) => iv.type);
  const capacity = Math.max(0, ...wish.interventions.map((iv) => audienceSize(iv, course, config.groupList)));
  const wantsLarge = (wish.rooms || []).includes('large') || types.includes('CM');
  const out = [];
  for (const room of rooms) {
    if (!needs.every((f) => room.features.includes(f))) continue;
    if (capacity && room.capacity && room.capacity < capacity) continue;
    if (types.includes('CM') && room.kind !== 'amphi' && (room.capacity || 0) < capacity) continue;
    let freeSlots = 0;
    let preferredSlots = 0;
    for (const d of config.days) {
      for (const s of config.slots) {
        const key = slotKey(d.key, s);
        const level = availability?.[key];
        // Créneau non renseigné = encore inconnu : compté comme possible.
        if (room.busy[key] || level === 'unavailable') continue;
        freeSlots += 1;
        if (level === 'preferred') preferredSlots += 1;
      }
    }
    if (!freeSlots) continue;
    const fit = room.capacity && capacity ? room.capacity - capacity : 0;
    const score = freeSlots + preferredSlots * 2 + (wantsLarge ? 0 : -Math.min(fit, 60) / 30);
    out.push({ room, score, freeSlots, preferredSlots, capacityNeeded: capacity });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ======================= Validation ======================= */

/**
 * @param {object} data   brouillon (voir emptyDraft)
 * @param {object} ctx    { config, courses, profile? }
 * @returns {{ errors: Issue[], warnings: Issue[] }}  Issue = { step, field, message }
 */
export function validateSubmission(data, { config, courses, profile }) {
  const errors = [];
  const warnings = [];
  const err = (step, field, message) => errors.push({ step, field, message });
  const warn = (step, field, message) => warnings.push({ step, field, message });
  const order = weekOrder(config);
  const first = (weeks) => Math.min(...weeks.map(order));
  const teachingWeeks = new Set(config.weeks.filter((w) => w.kind !== 'holiday').map((w) => w.week));

  /* Profil */
  if (profile) {
    const p = profileSchema.safeParse(profile);
    if (!p.success) for (const i of p.error.issues) err('profile', String(i.path[0]), i.message);
  }

  /* Statut */
  const status = config.statuses.find((s) => s.value === data.teacherStatus);
  if (!status) err('status', 'teacherStatus', 'Sélectionnez votre statut.');
  else if (status.requiresEmployer && !data.mainEmployer?.trim()) {
    err('status', 'mainEmployer', 'Indiquez votre employeur ou activité principale (obligatoire pour ce statut).');
  }

  /* Vœux */
  const wishes = data.wishes || [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  if (!wishes.length) err('wishes', 'wishes', 'Ajoutez au moins un enseignement.');
  const seen = new Set();

  for (const w of wishes) {
    const c = byId.get(w.courseId);
    const f = `wish-${w.courseId}`;
    if (!c) {
      err('wishes', f, 'Enseignement inconnu pour cette campagne.');
      continue;
    }
    const name = c.code;
    if (seen.has(w.courseId)) err('wishes', f, `${name} est sélectionné deux fois.`);
    seen.add(w.courseId);

    if (!w.interventions.length) err('wishes', f, `${name} : choisissez CM, TD ou TP.`);
    const byType = {};
    for (const iv of w.interventions) {
      byType[iv.type] = iv;
      const lab = `${name} ${iv.type}`;
      if (!(iv.hoursPerGroup > 0)) err('wishes', f, `${lab} : indiquez le nombre d’heures.`);
      if (iv.type !== 'CM' && !iv.groups.length && !iv.anyGroups) err('wishes', f, `${lab} : choisissez vos groupes ou « indifférent » avec un nombre de groupes.`);
      if (!iv.anyWeeks && !iv.weeks.length) err('wishes', f, `${lab} : choisissez les semaines ou cochez « indifférent ».`);
      if (iv.weeks.some((n) => !teachingWeeks.has(n))) err('wishes', f, `${lab} : une semaine choisie est une semaine de vacances.`);

      const pn = { CM: c.pnCm, TD: c.pnTd, TP: c.pnTp }[iv.type];
      if (pn && iv.hoursPerGroup > pn && !w.extraHoursReason?.trim()) {
        err('wishes', f, `${lab} : ${iv.hoursPerGroup} h demandées pour ${pn} h au programme. Justifiez la demande ou ajustez.`);
      }
      const n = sessionsPerGroup(iv);
      if (!iv.anyWeeks && iv.weeks.length) {
        const perWeek = iv.rhythm === 'twice' ? 2 : 1;
        if (n > iv.weeks.length * perWeek) {
          warn('wishes', f, `${lab} : ${n} séances de ${fmtH(iv.sessionLength)} pour ${iv.weeks.length} semaine(s) — il faudra plusieurs séances certaines semaines.`);
        }
        if (n < iv.weeks.length && iv.rhythm === 'weekly') {
          warn('wishes', f, `${lab} : ${n} séances pour ${iv.weeks.length} semaines cochées — certaines semaines resteront vides.`);
        }
      }
      if (iv.hoursPerGroup > 0 && iv.sessionLength > 0 && (iv.hoursPerGroup / iv.sessionLength) % 1 > 1e-9) {
        warn('wishes', f, `${lab} : ${fmtH(iv.hoursPerGroup)} ne se divise pas en séances de ${fmtH(iv.sessionLength)} (dernière séance plus courte).`);
      }
    }
    // Règle EDT : le CM d'un module démarre avant ses TD.
    const cm = byType.CM;
    for (const t of ['TD', 'TP']) {
      const iv = byType[t];
      if (cm?.weeks.length && iv?.weeks.length && first(iv.weeks) < first(cm.weeks)) {
        warn('wishes', f, `${name} : les ${t} commencent avant le CM.`);
      }
    }
    // Règle EDT : SAE en deuxième partie de semestre et après les ressources associées.
    const allWeeks = w.interventions.flatMap((iv) => iv.weeks);
    if (c.kind === 'SAE' && allWeeks.length && config.saeFromWeek && first(allWeeks) < order(config.saeFromWeek)) {
      warn('wishes', f, `${name} : les SAE sont habituellement placées à partir de la S${config.saeFromWeek}.`);
    }
    if (w.afterCourseId) {
      const prev = wishes.find((x) => x.courseId === w.afterCourseId);
      const prevWeeks = prev?.interventions.flatMap((iv) => iv.weeks) || [];
      if (prevWeeks.length && allWeeks.length && first(allWeeks) <= first(prevWeeks)) {
        warn('wishes', f, `${name} commence avant (ou en même temps que) ${byId.get(w.afterCourseId)?.code}.`);
      }
    }
    // Évaluation
    const ev = w.evaluation;
    if (ev.kind === 'common' || ev.kind === 'oral') {
      if (!ev.duration) err('wishes', f, `${name} : indiquez la durée de l’évaluation.`);
      if (!ev.weeks.length) err('wishes', f, `${name} : indiquez la semaine de l’évaluation.`);
    }
  }

  const total = equivalentTD(wishes, config.coefficients);
  if (status?.maxHours && total > status.maxHours) {
    err('wishes', 'total', `Votre total (${fmtH(total)} éq. TD) dépasse le plafond de ${status.maxHours} h pour votre statut.`);
  }

  /* Disponibilités */
  const stats = availabilityStats(data.availability, config);
  if (stats.unset > 0) {
    err('availability', 'grid', `${stats.unset} créneau(x) non renseigné(s) : complétez la grille (le bouton « Compléter » remplit les cases restantes).`);
  }
  if (stats.open < config.minAvailableSlots) {
    err('availability', 'grid', `Laissez au moins ${config.minAvailableSlots} créneaux possibles (actuellement ${stats.open}).`);
  }
  if (stats.unavailable / stats.total > config.justifyAboveRatio && !data.availabilityNote?.trim()) {
    err('availability', 'availabilityNote', 'Vous êtes indisponible sur plus de la moitié des créneaux : merci de préciser la raison.');
  }
  for (const [i, e] of (data.exceptions || []).entries()) {
    if (!e.from) err('availability', `exception-${i}`, `Absence n°${i + 1} : indiquez la date de début.`);
    else if (e.to && e.to < e.from) err('availability', `exception-${i}`, `Absence n°${i + 1} : la date de fin précède la date de début.`);
  }
  if (stats.preferred === 0 && stats.unset === 0) {
    warn('availability', 'grid', 'Aucun créneau « préféré » : tous vos créneaux possibles seront traités à égalité.');
  }

  /* Organisation */
  const o = data.organisation || {};
  if (o.earliestStart && o.latestEnd && o.latestEnd <= o.earliestStart) {
    err('organisation', 'latestEnd', 'L’heure de fin doit être après l’heure de début.');
  }

  return { errors, warnings };
}

export function fmtH(h) {
  const n = Number(h) || 0;
  const H = Math.floor(n);
  const m = Math.round((n - H) * 60);
  return m ? `${H}h${String(m).padStart(2, '0')}` : `${H} h`;
}

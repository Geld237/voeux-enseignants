/**
 * Outils de calendrier (semaines ISO), partagés entre l'onglet « Calendrier » et le serveur.
 */
export const WEEK_KINDS = {
  intro: 'Rentrée / accueil',
  teaching: 'Cours',
  holiday: 'Vacances (non sélectionnable)',
  exam: 'Évaluations / soutenances',
  free: 'Semaine banalisée',
};

/** Lundi (AAAA-MM-JJ) de la semaine ISO `week` de l'année ISO `year`. */
export function isoWeekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Année et numéro de semaine ISO d'une date AAAA-MM-JJ. */
export function isoWeekOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // jeudi de la même semaine
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

/**
 * Liste des semaines entre deux dates (incluses), en conservant le type et le libellé
 * des semaines déjà déclarées (`previous`). Nouvelle semaine → « Cours ».
 */
export function buildWeeks(startIso, endIso, previous = []) {
  const prev = new Map(previous.map((w) => [`${w.year}-${w.week}`, w]));
  const out = [];
  let { year, week } = isoWeekOf(startIso);
  let monday = isoWeekMonday(year, week);
  const end = isoWeekMonday(isoWeekOf(endIso).year, isoWeekOf(endIso).week);
  for (let i = 0; monday <= end && i < 60; i += 1) {
    const old = prev.get(`${year}-${week}`);
    out.push({ year, week, monday, kind: old?.kind ?? 'teaching', label: old?.label ?? '' });
    const next = new Date(`${monday}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    monday = next.toISOString().slice(0, 10);
    ({ year, week } = isoWeekOf(monday));
  }
  return out;
}

export const isSelectableWeek = (w) => w.kind !== 'holiday';

/**
 * Frise des semaines du semestre (S36 → S2). Les vacances ne sont pas sélectionnables.
 * Remplace la saisie libre « S37 à S42 / 37-38-39 / au choix … » des anciennes fiches.
 */
import { formatWeeks } from '@shared/schemas.js';

const KIND_STYLE = {
  intro: 'ring-slate-300',
  teaching: 'ring-slate-300',
  exam: 'ring-violet-300',
  free: 'ring-amber-300',
};

export default function WeekPicker({ config, value, onChange, any, onAnyChange, readOnly, invalid, examOnly = false }) {
  const weeks = config.weeks;
  const selected = new Set(value || []);
  const disabled = readOnly || any;
  const toggle = (n) => onChange(selected.has(n) ? value.filter((w) => w !== n) : [...value, n]);
  const set = (list) => onChange(list);
  // Périodes = suites de semaines de cours séparées par des vacances (calendrier déclaré par l'équipe programme).
  const periods = [];
  let current = [];
  for (const w of weeks) {
    if (w.kind === 'holiday') {
      if (current.length) periods.push(current);
      current = [];
    } else if (w.kind === 'teaching') current.push(w.week);
  }
  if (current.length) periods.push(current);
  const day = (iso) => {
    const [, m, d] = iso.split('-');
    return `${Number(d)}/${Number(m)}`;
  };

  // Semaines choisies qui n'existent plus (calendrier modifié par l'équipe programme) ou devenues des vacances.
  const selectable = new Set(weeks.filter((w) => w.kind !== 'holiday').map((w) => w.week));
  const orphans = (value || []).filter((n) => !selectable.has(n));

  return (
    <div className={`space-y-2 ${invalid ? 'rounded-lg p-2 ring-2 ring-red-300' : ''}`}>
      {orphans.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Le calendrier a changé : {orphans.map((n) => `S${n}`).join(', ')} ne {orphans.length > 1 ? 'sont' : 'est'} plus proposée{orphans.length > 1 ? 's' : ''}.
          {!readOnly && (
            <button type="button" className="font-semibold text-blue-900 underline" onClick={() => onChange(value.filter((n) => selectable.has(n)))}>
              Retirer
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {weeks.map((w) => {
          if (w.kind === 'holiday') {
            return (
              <span key={w.week} title={w.label}
                className="grid h-11 w-11 place-items-center rounded-md bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_4px,#e2e8f0_4px,#e2e8f0_8px)] text-[10px] leading-tight text-slate-400">
                S{w.week}
              </span>
            );
          }
          const on = selected.has(w.week);
          const locked = disabled || (examOnly && w.kind === 'intro');
          return (
            <button key={w.week} type="button" disabled={locked} onClick={() => toggle(w.week)} aria-pressed={on}
              title={`${w.label || 'Semaine'} — semaine du ${day(w.monday)}`}
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-md text-xs ring-1 transition-colors disabled:cursor-not-allowed ${
                on ? 'bg-blue-900 font-semibold text-white ring-blue-900' : `bg-white text-slate-700 hover:bg-blue-50 ${KIND_STYLE[w.kind]}`
              } ${any ? 'opacity-40' : ''}`}>
              <span>S{w.week}</span>
              <span className={`text-[10px] ${on ? 'text-blue-100' : 'text-slate-400'}`}>{day(w.monday)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {!disabled && (
          <>
            {periods.length > 1 && periods.map((p, i) => (
              <button key={i} type="button" className="py-2 text-sm font-medium text-blue-900 hover:underline" onClick={() => set(p)}>Période {i + 1}</button>
            ))}
            <button type="button" className="py-2 text-sm font-medium text-blue-900 hover:underline" onClick={() => set(periods.flat())}>Tout le semestre</button>
            {value?.length > 0 && <button type="button" className="py-2 text-sm text-slate-600 hover:underline" onClick={() => set([])}>Effacer</button>}
          </>
        )}
        {onAnyChange && (
          <label className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" className="ios-switch" checked={!!any} disabled={readOnly} onChange={(e) => onAnyChange(e.target.checked)} />
            Semaines indifférentes
          </label>
        )}
        <span className="text-slate-500">
          {any ? 'L’équipe programme choisira les semaines.' : value?.length ? `${value.length} sem. : ${formatWeeks(value, config)}` : 'Aucune semaine choisie'}
        </span>
      </div>
    </div>
  );
}

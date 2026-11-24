/**
 * Étape « Disponibilités ».
 * - Grille jours × créneaux réels du département, 4 niveaux + « non renseigné » (neutre, plus de
 *   grille pré-remplie en rouge dont on ne sait pas si elle a été modifiée).
 * - Absences datées, première semaine de disponibilité, début possible à 8h.
 */
import { useState } from 'react';
import { availabilityStats, slotKey } from '@shared/schemas.js';
import { Button, Card, Field, Select, inputClass } from '../ui.jsx';

export const LEVELS = {
  preferred: { label: 'Préféré', cell: 'bg-emerald-700 text-white', chip: 'bg-emerald-600', symbol: '★' },
  possible: { label: 'Possible', cell: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200', chip: 'bg-emerald-50 ring-1 ring-emerald-300', symbol: '✓' },
  avoid: { label: 'À éviter', cell: 'bg-amber-300 text-amber-950', chip: 'bg-amber-300', symbol: '~' },
  unavailable: { label: 'Impossible', cell: 'bg-slate-700 text-white', chip: 'bg-slate-700', symbol: '✕' },
};
const UNSET = 'bg-[repeating-linear-gradient(45deg,#fff,#fff_5px,#f1f5f9_5px,#f1f5f9_10px)] text-slate-400 ring-1 ring-inset ring-slate-300';

export default function StepAvailability({ draft, update, config, readOnly, showErrors }) {
  const [brush, setBrush] = useState('unavailable');
  const av = draft.availability;
  const stats = availabilityStats(av, config);
  const needsJustification = stats.unavailable / stats.total > config.justifyAboveRatio;
  const noteMissing = showErrors && needsJustification && !draft.availabilityNote?.trim();
  const fmtSlot = (s) => s.split('-').map((t) => t.replace(':', 'h').replace(/^0/, ''));

  function paint(cells, toggle = false) {
    if (readOnly) return;
    update((d) => {
      const next = { ...d.availability };
      const clear = toggle && cells.every(([day, s]) => next[slotKey(day, s)] === brush);
      for (const [day, s] of cells) {
        if (clear) delete next[slotKey(day, s)];
        else next[slotKey(day, s)] = brush;
      }
      return { availability: next };
    });
  }
  const fillRest = (level) =>
    update((d) => {
      const next = { ...d.availability };
      for (const day of config.days) for (const s of config.slots) next[slotKey(day.key, s)] ??= level;
      return { availability: next };
    });
  const setEx = (fn) => update((d) => ({ exceptions: fn(d.exceptions) }));
  const teaching = config.weeks.filter((w) => w.kind === 'teaching' || w.kind === 'intro');

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Choisissez un niveau puis touchez les cases (toucher à nouveau une case l&apos;efface). Toucher un jour ou un horaire remplit toute la colonne ou la ligne.
        Toutes les cases doivent être renseignées.
      </p>

      {!readOnly && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Niveau à appliquer">
          {Object.entries(LEVELS).map(([key, l]) => (
            <button key={key} type="button" role="radio" aria-checked={brush === key} onClick={() => setBrush(key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
                brush === key ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}>
              <span className={`size-4 rounded ${l.chip}`} /> {l.label}
            </button>
          ))}
        </div>
      )}

      <Card className={`overflow-x-auto p-2 sm:p-4 ${showErrors && stats.unset ? 'ring-2 ring-red-300' : ''}`}>
        <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-14 sm:w-20" />
              {config.days.map((d) => (
                <th key={d.key} className="font-medium text-slate-700">
                  <button type="button" disabled={readOnly} onClick={() => paint(config.slots.map((s) => [d.key, s]))}
                    className="w-full rounded py-1 hover:bg-slate-100 disabled:hover:bg-transparent">
                    <span className="sm:hidden">{d.short}</span>
                    <span className="hidden sm:inline">{d.label}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.slots.map((s) => (
              <tr key={s}>
                <th className="text-left text-xs font-normal whitespace-nowrap text-slate-500">
                  <button type="button" disabled={readOnly} onClick={() => paint(config.days.map((d) => [d.key, s]))}
                    className="rounded px-1 py-1 text-left hover:bg-slate-100 disabled:hover:bg-transparent">
                    {fmtSlot(s).map((t, i) => <span key={i} className="block leading-tight">{t}</span>)}
                  </button>
                </th>
                {config.days.map((d) => {
                  const level = av[slotKey(d.key, s)];
                  return (
                    <td key={d.key}>
                      <button type="button" disabled={readOnly} onClick={() => paint([[d.key, s]], true)}
                        aria-label={`${d.label} ${s} : ${level ? LEVELS[level].label : 'non renseigné'}`}
                        className={`h-11 w-full rounded-md text-base font-semibold transition ${level ? LEVELS[level].cell : UNSET} ${readOnly ? '' : 'hover:opacity-80'}`}>
                        {level ? LEVELS[level].symbol : '?'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <span><strong className="text-emerald-700">{stats.preferred}</strong> préférés</span>
        <span><strong>{stats.possible}</strong> possibles</span>
        <span><strong className="text-amber-700">{stats.avoid}</strong> à éviter</span>
        <span><strong className="text-slate-800">{stats.unavailable}</strong> impossibles</span>
        {stats.unset > 0 && <span className={showErrors ? 'font-medium text-red-700' : 'text-slate-500'}>{stats.unset} non renseignés</span>}
        {stats.unset > 0 && !readOnly && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Compléter les cases vides avec :</span>
            <Button size="sm" variant="secondary" onClick={() => fillRest('possible')}>Possible</Button>
            <Button size="sm" variant="secondary" onClick={() => fillRest('unavailable')}>Impossible</Button>
          </span>
        )}
      </div>

      <Card className="space-y-4 p-5">
        <label className="flex flex-row-reverse items-center justify-between gap-4 text-sm">
          <input type="checkbox" className="ios-switch" checked={!!draft.early8h} disabled={readOnly}
            onChange={(e) => update({ early8h: e.target.checked })} />
          <span>Je peux commencer à <strong>8h00</strong> si nécessaire (avant le premier créneau de {fmtSlot(config.slots[0])[0]}).</span>
        </label>
        <Field label="Disponible à partir de">
          <Select value={draft.availableFromWeek} disabled={readOnly} onChange={(v) => update({ availableFromWeek: v })}
            options={[{ value: null, label: 'Dès le début du semestre' }, ...teaching.map((w) => ({ value: w.week, label: `S${w.week} (semaine du ${w.monday.split('-').reverse().slice(0, 2).join('/')})` }))]} />
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <div>
          <p className="font-medium">Absences ponctuelles</p>
          <p className="text-sm text-slate-500">Colloque, jury, congé, jours pris par un autre établissement… (dates comprises).</p>
        </div>
        {draft.exceptions.map((e, i) => {
          const bad = showErrors && (!e.from || (e.to && e.to < e.from));
          return (
            <div key={i} className={`grid gap-2 rounded-lg p-3 ring-1 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end ${bad ? 'ring-red-300' : 'ring-slate-200'}`}>
              <Field label="Du">
                <input type="date" className={inputClass(bad && !e.from)} value={e.from} disabled={readOnly}
                  min={config.weeks[0].monday} onChange={(ev) => setEx((xs) => xs.map((x, k) => (k === i ? { ...x, from: ev.target.value } : x)))} />
              </Field>
              <Field label="Au (inclus)">
                <input type="date" className={inputClass(bad && e.to && e.to < e.from)} value={e.to} disabled={readOnly}
                  min={e.from || config.weeks[0].monday} onChange={(ev) => setEx((xs) => xs.map((x, k) => (k === i ? { ...x, to: ev.target.value } : x)))} />
              </Field>
              <Field label="Motif (facultatif)">
                <input className={inputClass(false)} value={e.note} maxLength={200} disabled={readOnly}
                  onChange={(ev) => setEx((xs) => xs.map((x, k) => (k === i ? { ...x, note: ev.target.value } : x)))} />
              </Field>
              {!readOnly && (
                <Button variant="ghost" size="sm" onClick={() => setEx((xs) => xs.filter((_, k) => k !== i))}>Retirer</Button>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <Button variant="secondary" size="sm" onClick={() => setEx((xs) => [...xs, { from: '', to: '', note: '' }])}>+ Ajouter une absence</Button>
        )}
      </Card>

      <Card className="p-5">
        <Field
          label={needsJustification ? 'Pourquoi êtes-vous indisponible sur une grande partie de la semaine ?' : 'Précisions sur vos disponibilités (facultatif)'}
          required={needsJustification} htmlFor="availabilityNote"
          hint={needsJustification ? 'Obligatoire au-delà de la moitié des créneaux impossibles.' : 'Ex. cours en apprentissage le jeudi une semaine sur deux, autre département le mardi…'}
          error={noteMissing ? 'Merci de préciser la raison.' : null}
        >
          <textarea id="availabilityNote" rows={3} className={inputClass(noteMissing)} disabled={readOnly}
            value={draft.availabilityNote || ''} onChange={(e) => update({ availabilityNote: e.target.value })} />
        </Field>
      </Card>
    </div>
  );
}

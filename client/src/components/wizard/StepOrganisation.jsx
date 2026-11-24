/**
 * Étape « Organisation » : les préférences qui, dans les anciennes fiches, étaient noyées
 * dans le champ libre (jours regroupés, horaires, pauses, reprise de l'organisation de l'an dernier).
 */
import { Card, Field, Segmented, Select, inputClass } from '../ui.jsx';

const START = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:15', '12:00', '13:30'];
const END = ['12:00', '13:00', '13:30', '15:00', '16:00', '16:30', '17:00', '18:00', '18:45'];
const hhmm = (t) => t.replace(':', 'h').replace(/^0/, '');

export default function StepOrganisation({ draft, update, readOnly, showErrors }) {
  const o = draft.organisation;
  const set = (patch) => update((d) => ({ organisation: { ...d.organisation, ...patch } }));
  const endInvalid = showErrors && o.earliestStart && o.latestEnd && o.latestEnd <= o.earliestStart;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Tout est facultatif : indiquez seulement ce qui compte pour vous.</p>

      <Card className="space-y-5 p-5">
        <h2 className="font-semibold">Jours et horaires</h2>
        <Field label="Nombre de jours de présence souhaité au maximum">
          <Segmented value={o.maxDays} disabled={readOnly} onChange={(v) => set({ maxDays: v })} name="Jours maximum"
            options={[{ value: null, label: 'Indifférent' }, ...[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} jour${n > 1 ? 's' : ''}` }))]} />
        </Field>
        <label className="flex flex-row-reverse items-center justify-between gap-4 text-sm">
          <input type="checkbox" className="ios-switch" checked={o.sameHalfDay} disabled={readOnly}
            onChange={(e) => set({ sameHalfDay: e.target.checked })} />
          <span>Regrouper mes groupes sur une même demi-journée, les uns à la suite des autres</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Arriver au plus tôt à">
            <Select value={o.earliestStart} disabled={readOnly} onChange={(v) => set({ earliestStart: v })}
              options={[{ value: null, label: 'Indifférent' }, ...START.map((t) => ({ value: t, label: hhmm(t) }))]} />
          </Field>
          <Field label="Finir au plus tard à" error={endInvalid ? 'Doit être après l’heure d’arrivée.' : null}>
            <Select value={o.latestEnd} disabled={readOnly} invalid={endInvalid} onChange={(v) => set({ latestEnd: v })}
              options={[{ value: null, label: 'Indifférent' }, ...END.map((t) => ({ value: t, label: hhmm(t) }))]} />
          </Field>
        </div>
        <Field label="Durée maximale d'affilée avec un même groupe">
          <Segmented value={o.maxSameGroup} disabled={readOnly} onChange={(v) => set({ maxSameGroup: v })} name="Durée maximale"
            options={[{ value: null, label: 'Indifférent' }, { value: 1.5, label: '1h30' }, { value: 2, label: '2 h' }, { value: 3, label: '3 h' }, { value: 4, label: '4 h' }]} />
        </Field>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="font-semibold">Pauses</h2>
        <Field label="Pause déjeuner pour vous">
          <Segmented value={o.lunch} disabled={readOnly} onChange={(v) => set({ lunch: v })} name="Pause déjeuner"
            options={[{ value: null, label: 'Indifférent' }, { value: 'none', label: 'Pas nécessaire' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '1 h' }]} />
        </Field>
        <Field label="Quart d'heure de pause entre deux cours">
          <Segmented value={o.quarterBreak} disabled={readOnly} onChange={(v) => set({ quarterBreak: v })} name="Pause entre cours"
            options={[{ value: null, label: 'Indifférent' }, { value: 'yes', label: 'Nécessaire' }, { value: 'no', label: 'Pas nécessaire' }]} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <label className="flex flex-row-reverse items-center justify-between gap-4 text-sm">
          <input type="checkbox" className="ios-switch" checked={o.keepLastYear} disabled={readOnly}
            onChange={(e) => set({ keepLastYear: e.target.checked })} />
          <span>Reprendre si possible l&apos;organisation de mon emploi du temps de l&apos;an dernier</span>
        </label>
        <Field label="Autres précisions pour l'équipe programme" htmlFor="comment">
          <textarea id="comment" rows={4} className={inputClass(false)} value={draft.comment || ''} disabled={readOnly} maxLength={3000}
            placeholder="Ex. ordre de préférence entre plusieurs journées, groupes à mettre en parallèle avec un collègue…"
            onChange={(e) => update({ comment: e.target.value })} />
        </Field>
      </Card>
    </div>
  );
}

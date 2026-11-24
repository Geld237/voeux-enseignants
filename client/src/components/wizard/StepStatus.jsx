/** Étape 2 — statut. Le statut choisi adapte la suite (service attendu, plafond, employeur). */
import { Card, Field, inputClass } from '../ui.jsx';

export default function StepStatus({ draft, update, config, readOnly, showErrors }) {
  const selected = config.statuses.find((s) => s.value === draft.teacherStatus);
  const employerMissing = showErrors && selected?.requiresEmployer && !draft.mainEmployer?.trim();

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={readOnly}>
        <legend className="sr-only">Statut</legend>
        {config.statuses.map((s) => {
          const checked = draft.teacherStatus === s.value;
          return (
            <label key={s.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl bg-white p-4 ring-1 transition ${
                checked ? 'ring-2 ring-blue-900' : 'ring-slate-200 hover:ring-slate-300'
              } ${readOnly ? 'cursor-default' : ''}`}>
              <input type="radio" name="status" className="mt-1 size-4 shrink-0 accent-blue-900" checked={checked}
                onChange={() => update({ teacherStatus: s.value })} />
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="block text-sm text-slate-500">
                  {s.serviceHours ? `Service annuel de référence : ${s.serviceHours} h éq. TD` : 'Pas de service statutaire de référence'}
                  {s.maxHours ? ` · plafond ${s.maxHours} h éq. TD` : ''}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <Card className="p-5">
        <Field label="Autres engagements (facultatif)" htmlFor="otherCommitments"
          hint="Apprentissage, autre département ou composante, autre établissement… Cela aide l'équipe programme à comprendre vos indisponibilités.">
          <textarea id="otherCommitments" rows={2} className={inputClass(false)} value={draft.otherCommitments || ''} disabled={readOnly}
            maxLength={1000} onChange={(e) => update({ otherCommitments: e.target.value })} />
        </Field>
      </Card>

      {selected?.requiresEmployer && (
        <Card className="p-5">
          <Field label="Employeur ou activité principale" required htmlFor="mainEmployer"
            hint={selected.employerHelp} error={employerMissing ? 'Champ obligatoire pour ce statut.' : null}>
            <input id="mainEmployer" className={inputClass(employerMissing)} value={draft.mainEmployer || ''}
              onChange={(e) => update({ mainEmployer: e.target.value })} disabled={readOnly}
              placeholder="Ex. ingénieur chez …, avocat, enseignant au lycée …" />
          </Field>
        </Card>
      )}
    </div>
  );
}

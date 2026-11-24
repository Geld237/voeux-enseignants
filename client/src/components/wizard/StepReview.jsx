/** Étape « Validation » : problèmes restants, récapitulatif et progression semaine par semaine. */
import {
  EVALUATION_KINDS, ROOM_NEEDS, RHYTHMS, equivalentTD, fmtH, formatWeeks, groupCount, interventionHours,
  sessionsPerGroup, slotKey, weeklyLoad,
} from '@shared/schemas.js';
import { Alert, Card } from '../ui.jsx';
import { LEVELS } from './StepAvailability.jsx';

const STEP_LABELS = { profile: 'Profil', status: 'Statut', wishes: 'Vœux', availability: 'Disponibilités', organisation: 'Organisation' };
const LUNCH = { none: 'pas nécessaire', 30: '30 min', 45: '45 min', 60: '1 h' };
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '…');

export default function StepReview({ draft, config, courses, teacher, validation, readOnly, onEdit }) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const status = config.statuses.find((s) => s.value === draft.teacherStatus);
  const o = draft.organisation;
  const orgLines = [
    o.maxDays && `${o.maxDays} jour(s) de présence maximum`,
    o.sameHalfDay && 'Groupes regroupés sur une même demi-journée',
    o.earliestStart && `Arrivée au plus tôt à ${o.earliestStart.replace(':', 'h')}`,
    o.latestEnd && `Fin au plus tard à ${o.latestEnd.replace(':', 'h')}`,
    o.maxSameGroup && `${fmtH(o.maxSameGroup)} maximum d'affilée avec un même groupe`,
    o.lunch && `Pause déjeuner : ${LUNCH[o.lunch]}`,
    o.quarterBreak && `Quart d'heure entre deux cours : ${o.quarterBreak === 'yes' ? 'nécessaire' : 'pas nécessaire'}`,
    o.keepLastYear && 'Reprendre l’organisation de l’an dernier',
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {!readOnly && validation.errors.length > 0 && (
        <Alert tone="error" title={`${validation.errors.length} point${validation.errors.length > 1 ? 's' : ''} à corriger avant l'envoi`}>
          <ul className="space-y-1">
            {validation.errors.map((e, i) => (
              <li key={i}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onEdit(e.step)}>
                  <strong>{STEP_LABELS[e.step]} :</strong> {e.message}
                </button>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {!readOnly && validation.warnings.length > 0 && (
        <Alert tone="warning" title="À vérifier (n'empêche pas l'envoi)">
          <ul className="list-disc space-y-0.5 pl-5">{validation.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </Alert>
      )}
      {!readOnly && validation.errors.length === 0 && (
        <Alert tone="success">Votre fiche est complète. Vérifiez le récapitulatif puis cliquez sur « Envoyer mes vœux ».</Alert>
      )}

      <Section title="Coordonnées et statut" onEdit={!readOnly && (() => onEdit('status'))}>
        <p>{teacher.contactEmail} · {teacher.phone}</p>
        <p>{status?.label || <Missing />}{status?.requiresEmployer && ` — activité principale : ${draft.mainEmployer || '—'}`}</p>
        {draft.otherCommitments && <p className="text-slate-500">Autres engagements : {draft.otherCommitments}</p>}
      </Section>

      <Section title={`Vœux · ${fmtH(equivalentTD(draft.wishes, config.coefficients))} éq. TD`} onEdit={!readOnly && (() => onEdit('wishes'))}>
        {draft.wishes.length === 0 ? <Missing /> : (
          <ol className="space-y-3">
            {draft.wishes.map((w, i) => {
              const c = byId.get(w.courseId);
              return (
                <li key={w.courseId} className="flex gap-2">
                  <span className="w-5 shrink-0 text-slate-400">{i + 1}.</span>
                  <div className="min-w-0 space-y-1">
                    <p><span className="font-medium">{c?.title}</span> <span className="font-mono text-xs text-slate-500">{c?.code}{c?.apogee ? ` · ${c.apogee}` : ''}</span></p>
                    {w.interventions.map((iv) => (
                      <p key={iv.type} className="text-slate-600">
                        <strong>{iv.type}</strong> · {iv.type === 'CM' ? 'promotion' : iv.groups.length ? iv.groups.join(', ') : `${groupCount(iv)} groupe(s) au choix`}
                        {' · '}{sessionsPerGroup(iv)} × {fmtH(iv.sessionLength)}{iv.type !== 'CM' ? ' par groupe' : ''} = {fmtH(interventionHours(iv))}
                        {' · '}{iv.anyWeeks ? 'semaines indifférentes' : formatWeeks(iv.weeks, config)}
                        {iv.rhythm !== 'weekly' ? ` · ${RHYTHMS[iv.rhythm].toLowerCase()}` : ''}
                      </p>
                    ))}
                    {w.evaluation.kind !== 'none' && (
                      <p className="text-slate-600">
                        Évaluation : {EVALUATION_KINDS[w.evaluation.kind].toLowerCase()}
                        {w.evaluation.duration ? `, ${fmtH(w.evaluation.duration)}` : ''}
                        {w.evaluation.weeks.length ? `, ${formatWeeks(w.evaluation.weeks, config)}` : ''}
                        {w.evaluation.note ? ` — ${w.evaluation.note}` : ''}
                      </p>
                    )}
                    {(w.rooms.length > 0 || w.roomNote) && (
                      <p className="text-slate-600">Besoins de salle : {[...w.rooms.map((r) => ROOM_NEEDS[r]), w.roomNote].filter(Boolean).join(', ')}</p>
                    )}
                    {w.preferredRooms?.length > 0 && <p className="text-slate-600">Salles souhaitées : {w.preferredRooms.join(', ')}</p>}
                    {w.coTeachers && <p className="text-slate-600">Avec : {w.coTeachers}</p>}
                    {w.afterCourseId && <p className="text-slate-600">Après : {byId.get(w.afterCourseId)?.code}</p>}
                    {w.note && <p className="italic text-slate-500">« {w.note} »</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {draft.wishes.length > 0 && <Progression wishes={draft.wishes} config={config} />}

      <Section title="Disponibilités" onEdit={!readOnly && (() => onEdit('availability'))}>
        <MiniGrid config={config} availability={draft.availability} />
        <div className="mt-2 space-y-0.5 text-slate-600">
          {draft.early8h && <p>Peut commencer à 8h00</p>}
          {draft.availableFromWeek && <p>Disponible à partir de la S{draft.availableFromWeek}</p>}
          {draft.exceptions.map((e, i) => (
            <p key={i}>Absent du {fmtDate(e.from)} au {fmtDate(e.to || e.from)}{e.note ? ` (${e.note})` : ''}</p>
          ))}
          {draft.availabilityNote && <p className="italic">« {draft.availabilityNote} »</p>}
        </div>
      </Section>

      <Section title="Organisation" onEdit={!readOnly && (() => onEdit('organisation'))}>
        {orgLines.length ? <ul className="list-disc space-y-0.5 pl-5">{orgLines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="text-slate-500">Pas de préférence particulière</p>}
        {draft.comment && <p className="mt-2 text-slate-600">Précisions : {draft.comment}</p>}
      </Section>
    </div>
  );
}

/** Charge semaine par semaine : ce que les enseignants expérimentés envoyaient en onglet séparé. */
function Progression({ wishes, config }) {
  const { load, unplanned } = weeklyLoad(wishes, config);
  const max = Math.max(1, ...Object.values(load));
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Progression prévisionnelle (heures par semaine)</h2>
      <p className="mb-3 text-xs text-slate-500">Estimation : les heures de chaque intervention sont réparties sur les semaines choisies.</p>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {config.weeks.map((w) => {
          const h = load[w.week] || 0;
          const holiday = w.kind === 'holiday';
          return (
            <div key={w.week} className="flex w-9 shrink-0 flex-col items-center gap-1" title={`S${w.week} : ${fmtH(h)}`}>
              <span className="text-[10px] text-slate-500">{h ? String(h).replace('.', ',') : ''}</span>
              <div className="flex h-24 w-6 items-end rounded bg-slate-100">
                {!holiday && <div className="w-full rounded bg-blue-900" style={{ height: `${(h / max) * 100}%` }} />}
              </div>
              <span className={`text-[10px] ${holiday ? 'text-slate-300' : 'text-slate-600'}`}>S{w.week}</span>
            </div>
          );
        })}
      </div>
      {unplanned > 0 && <p className="mt-2 text-sm text-slate-600">+ {fmtH(unplanned)} sur des semaines laissées au choix de l&apos;équipe programme.</p>}
    </Card>
  );
}

const Missing = () => <span className="text-red-700">Non renseigné</span>;

function Section({ title, onEdit, children }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {onEdit && <button type="button" className="text-sm font-medium text-blue-900 hover:underline" onClick={onEdit}>Modifier</button>}
      </div>
      <div className="space-y-1 text-sm text-slate-800">{children}</div>
    </Card>
  );
}

function MiniGrid({ config, availability }) {
  const color = { preferred: 'bg-emerald-600', possible: 'bg-emerald-100', avoid: 'bg-amber-300', unavailable: 'bg-slate-700' };
  return (
    <div>
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(${config.days.length}, 1.75rem)` }}>
        <span />
        {config.days.map((d) => <span key={d.key} className="text-center text-xs text-slate-500">{d.short}</span>)}
        {config.slots.map((s) => (
          <div key={s} className="contents">
            <span className="pr-2 text-xs text-slate-500">{s.split('-')[0].replace(':', 'h').replace(/^0/, '')}</span>
            {config.days.map((d) => {
              const l = availability[slotKey(d.key, s)];
              return <span key={d.key} className={`h-5 rounded ${l ? color[l] : 'bg-white ring-1 ring-slate-300'}`} title={l ? LEVELS[l].label : 'Non renseigné'} />;
            })}
          </div>
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.entries(LEVELS).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1"><span className={`size-3 rounded ${color[k]}`} />{l.label}</span>
        ))}
      </p>
    </div>
  );
}

/**
 * Carte d'un vœu : une ressource ou SAÉ, ses interventions CM / TD / TP,
 * l'évaluation, les besoins de salle et la coordination avec d'autres modules.
 */
import { useState } from 'react';
import {
  suggestRooms, EVALUATION_KINDS, ROOM_NEEDS, RHYTHMS, fmtH, formatWeeks, groupCount, interventionHours,
  newIntervention, sessionsPerGroup,
} from '@shared/schemas.js';
import { Card, Chip, DecimalInput, Field, Segmented, Select, inputClass } from '../ui.jsx';
import WeekPicker from './WeekPicker.jsx';

const TYPE_STYLE = { CM: 'bg-emerald-100 text-emerald-900', TD: 'bg-blue-100 text-blue-900', TP: 'bg-amber-100 text-amber-900' };

export function CourseBadges({ course, config }) {
  const sem = config.semesters.find((s) => s.key === course.semester);
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <span className="font-mono">{course.code}</span>
      {course.apogee && <span className="font-mono text-slate-400">· {course.apogee}</span>}
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{sem?.label ?? course.semester}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{course.parcours ? `Parcours ${course.parcours}` : 'Tronc commun'}</span>
      {course.kind === 'SAE' && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">SAÉ</span>}
      {course.toConfirm && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800" title="Intitulé ou code reconstitué, à vérifier">à confirmer</span>}
    </span>
  );
}

export default function WishCard({ wish, index, count, course, wishes, coursesById, config, rooms = [], availability = {}, readOnly, issues, showErrors, onChange, onRemove, onMove, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasErrors = showErrors && issues.length > 0;
  const setIv = (type, patch) =>
    onChange({ interventions: wish.interventions.map((iv) => (iv.type === type ? { ...iv, ...patch } : iv)) });
  const toggleType = (type) => {
    const exists = wish.interventions.some((iv) => iv.type === type);
    const next = exists
      ? wish.interventions.filter((iv) => iv.type !== type)
      : [...wish.interventions, newIntervention(type, course)].sort((a, b) => 'CMTDTP'.indexOf(a.type) - 'CMTDTP'.indexOf(b.type));
    onChange({ interventions: next });
  };
  const ev = wish.evaluation;
  const setEv = (patch) => onChange({ evaluation: { ...ev, ...patch } });
  const totalHours = wish.interventions.reduce((s, iv) => s + interventionHours(iv), 0);
  const overPn = wish.interventions.some((iv) => {
    const pn = { CM: course.pnCm, TD: course.pnTd, TP: course.pnTp }[iv.type];
    return pn && iv.hoursPerGroup > pn;
  });

  return (
    <Card className={`overflow-hidden ${hasErrors ? 'ring-2 ring-red-300' : ''}`}>
      {/* En-tête */}
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-900 text-sm font-semibold text-white" title="Ordre de préférence">{index + 1}</span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <p className="font-medium leading-snug">{course.title}</p>
          <CourseBadges course={course} config={config} />
          {!open && (
            <p className="mt-1 text-sm text-slate-600">
              {wish.interventions.length
                ? wish.interventions.map((iv) => `${iv.type} ${fmtH(interventionHours(iv))}`).join(' · ')
                : 'Aucune intervention choisie'}
              {hasErrors && <span className="ml-2 font-medium text-red-700">· à compléter</span>}
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center">
          {!readOnly && (
            <>
              <IconButton label="Monter" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconButton>
              <IconButton label="Descendre" disabled={index === count - 1} onClick={() => onMove(1)}>↓</IconButton>
              <IconButton label="Retirer ce vœu" className="ml-1 text-red-700"
                onClick={() => window.confirm(`Retirer « ${course.title} » de vos vœux ? Tout ce que vous avez saisi pour ce module sera perdu.`) && onRemove()}>✕</IconButton>
            </>
          )}
          <IconButton label={open ? 'Replier' : 'Déplier'} onClick={() => setOpen((o) => !o)}>{open ? '▴' : '▾'}</IconButton>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t border-slate-100 p-4">
          {hasErrors && (
            <ul className="list-disc space-y-0.5 rounded-lg bg-red-50 py-2 pr-3 pl-7 text-sm text-red-800">
              {issues.map((i, k) => <li key={k}>{i.message}</li>)}
            </ul>
          )}

          {/* Types d'intervention */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">Je souhaite assurer</p>
            <div className="flex flex-wrap gap-2">
              {['CM', 'TD', 'TP'].map((t) => (
                <Chip key={t} active={wish.interventions.some((iv) => iv.type === t)} disabled={readOnly} onClick={() => toggleType(t)}>
                  {t === 'CM' ? 'CM (amphi)' : t}
                </Chip>
              ))}
            </div>
            {wish.interventions.some((iv) => iv.type === 'CM') && (
              <p className="text-xs text-slate-500">Un CM mobilise toute la {course.parcours ? `promotion du parcours ${course.parcours}` : 'promotion'} : il sera placé avant les TD.</p>
            )}
          </div>

          {wish.interventions.map((iv) => (
            <InterventionEditor key={iv.type} iv={iv} course={course} config={config} readOnly={readOnly}
              showErrors={showErrors} onChange={(p) => setIv(iv.type, p)} />
          ))}

          {wish.interventions.length > 0 && (
            <>
              {/* Évaluation */}
              <section className="space-y-3 rounded-lg bg-slate-50 p-3 sm:p-4">
                <p className="text-sm font-medium text-slate-800">Évaluation</p>
                <Select value={ev.kind} disabled={readOnly} onChange={(v) => setEv({ kind: v })}
                  options={Object.entries(EVALUATION_KINDS).map(([value, label]) => ({ value, label }))} />
                {(ev.kind === 'common' || ev.kind === 'oral') && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Durée" required>
                        <Select value={ev.duration} disabled={readOnly} invalid={showErrors && !ev.duration} onChange={(v) => setEv({ duration: v })}
                          options={[{ value: null, label: 'Choisir…' }, ...[1, 1.5, 2, 2.25, 3, 4, 6].map((h) => ({ value: h, label: fmtH(h) }))]} />
                      </Field>
                      <Field label="Précision (facultatif)">
                        <input className={inputClass(false)} value={ev.note} disabled={readOnly} maxLength={300}
                          placeholder="Ex. le mardi pour la présence des secrétaires, en amphi…" onChange={(e) => setEv({ note: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Semaine(s) de l'évaluation" required>
                      <WeekPicker config={config} value={ev.weeks} readOnly={readOnly} invalid={showErrors && !ev.weeks.length} onChange={(weeks) => setEv({ weeks })} />
                    </Field>
                  </>
                )}
              </section>

              {/* Salle */}
              <section className="space-y-2">
                <p className="text-sm font-medium text-slate-800">Besoins de salle</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROOM_NEEDS).map(([k, label]) => (
                    <Chip key={k} active={wish.rooms.includes(k)} disabled={readOnly}
                      onClick={() => onChange({ rooms: wish.rooms.includes(k) ? wish.rooms.filter((r) => r !== k) : [...wish.rooms, k] })}>
                      {label}
                    </Chip>
                  ))}
                </div>
                <RoomSuggestions wish={wish} course={course} rooms={rooms} availability={availability} config={config}
                  readOnly={readOnly} onChange={onChange} />
                <input className={inputClass(false)} value={wish.roomNote} disabled={readOnly} maxLength={200}
                  placeholder="Autre précision sur la salle (facultatif)" onChange={(e) => onChange({ roomNote: e.target.value })} />
              </section>

              {/* Coordination */}
              <section className="grid gap-4 sm:grid-cols-2">
                <Field label="Co-intervenant(s)" hint="Module partagé, séances communes, même planning qu'un collègue…">
                  <input className={inputClass(false)} value={wish.coTeachers} disabled={readOnly} maxLength={200}
                    onChange={(e) => onChange({ coTeachers: e.target.value })} />
                </Field>
                <Field label={course.kind === 'SAE' ? 'Cette SAÉ doit être placée après' : 'À placer après (facultatif)'}>
                  <Select value={wish.afterCourseId} disabled={readOnly} onChange={(v) => onChange({ afterCourseId: v })}
                    options={[{ value: null, label: 'Pas de contrainte' }, ...wishes.filter((w) => w.courseId !== wish.courseId).map((w) => ({
                      value: w.courseId, label: `${coursesById.get(w.courseId)?.code} — ${coursesById.get(w.courseId)?.title}`,
                    }))]} />
                </Field>
              </section>

              {overPn && (
                <Field label="Justification du dépassement du volume programme" required>
                  <textarea rows={2} className={inputClass(showErrors && !wish.extraHoursReason.trim())} value={wish.extraHoursReason} disabled={readOnly}
                    onChange={(e) => onChange({ extraHoursReason: e.target.value })} />
                </Field>
              )}

              <Field label="Remarque sur ce module (facultatif)">
                <textarea rows={2} className={inputClass(false)} value={wish.note} disabled={readOnly} maxLength={1000}
                  placeholder="Ex. 6 séances de TD + 4 de TP + une séance finale d'évaluation"
                  onChange={(e) => onChange({ note: e.target.value })} />
              </Field>

              <p className="text-right text-sm text-slate-600">Total pour ce module : <strong>{fmtH(totalHours)}</strong> enseignant</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function InterventionEditor({ iv, course, config, readOnly, showErrors, onChange }) {
  // Groupes constitués par l'équipe programme (onglet « Groupes »), filtrés par semestre et parcours.
  const options = (config.groupList || []).filter(
    (g) => g.semester === course.semester && g.type === iv.type && (!course.parcours || g.parcours === course.parcours)
  );
  const anyMode = iv.anyGroups !== null && iv.anyGroups !== undefined;
  const pn = { CM: course.pnCm, TD: course.pnTd, TP: course.pnTp }[iv.type];
  const n = sessionsPerGroup(iv);
  const g = groupCount(iv);
  const lastSession = iv.hoursPerGroup - (n - 1) * iv.sessionLength;
  const noHours = showErrors && !(iv.hoursPerGroup > 0);
  const noGroups = showErrors && iv.type !== 'CM' && !iv.groups.length && !iv.anyGroups;
  const noWeeks = showErrors && !iv.anyWeeks && !iv.weeks.length;

  return (
    <section className="space-y-4 rounded-lg p-3 ring-1 ring-slate-200 sm:p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className={`rounded px-2 py-0.5 ${TYPE_STYLE[iv.type]}`}>{iv.type}</span>
        {iv.type === 'CM' ? (course.parcours ? `Tout le parcours ${course.parcours}` : 'Toute la promotion') : 'Groupes et volume'}
      </p>

      {iv.type !== 'CM' && (
        <Field label="Groupes" required error={noGroups ? 'Choisissez vos groupes ou « indifférent ».' : null}>
          <div className="flex flex-wrap gap-1.5">
            {options.length === 0 && <span className="text-sm text-slate-500">Aucun groupe {iv.type} déclaré pour ce semestre : choisissez « Indifférent ».</span>}
            {options.map(({ name: grp, size }) => (
              <Chip key={grp} active={!anyMode && iv.groups.includes(grp)} disabled={readOnly || anyMode} title={size ? `${size} étudiants` : undefined}
                onClick={() => onChange({ groups: iv.groups.includes(grp) ? iv.groups.filter((x) => x !== grp) : [...iv.groups, grp] })}>
                {grp}
              </Chip>
            ))}
            <Chip active={anyMode} disabled={readOnly} onClick={() => onChange(anyMode ? { anyGroups: null } : { anyGroups: iv.groups.length || 1, groups: [] })}>
              Indifférent
            </Chip>
          </div>
          {anyMode && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span>Nombre de groupes :</span>
              <Select className="!w-24" value={iv.anyGroups} disabled={readOnly} onChange={(v) => onChange({ anyGroups: v })}
                options={Array.from({ length: Math.max(options.length, 1) }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
            </div>
          )}
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={iv.type === 'CM' ? 'Heures de CM' : 'Heures par groupe'} required hint={pn ? `Programme : ${fmtH(pn)}` : undefined}
          error={noHours ? 'Obligatoire' : pn && iv.hoursPerGroup > pn ? `Au-delà du programme (${fmtH(pn)})` : null}>
          <DecimalInput invalid={noHours} disabled={readOnly} value={iv.hoursPerGroup} onChange={(n) => onChange({ hoursPerGroup: n })} />
        </Field>
        <Field label="Durée d'une séance" required>
          <Select value={iv.sessionLength} disabled={readOnly} onChange={(v) => onChange({ sessionLength: v })}
            options={config.sessionLengths.map((h) => ({ value: h, label: fmtH(h) }))} />
        </Field>
        <Field label="Rythme">
          <Select value={iv.rhythm} disabled={readOnly} onChange={(v) => onChange({ rhythm: v })}
            options={Object.entries(RHYTHMS).map(([value, label]) => ({ value, label }))} />
        </Field>
      </div>

      {iv.hoursPerGroup > 0 && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          → <strong>{n} séance{n > 1 ? 's' : ''}</strong> de {fmtH(iv.sessionLength)}
          {lastSession > 0 && lastSession < iv.sessionLength - 1e-9 ? ` (dernière : ${fmtH(lastSession)})` : ''}
          {iv.type !== 'CM' && g > 0 ? ` par groupe × ${g} groupe${g > 1 ? 's' : ''}` : ''}
          {' '}= <strong>{fmtH(interventionHours(iv))}</strong>
          {!iv.anyWeeks && iv.weeks.length > 0 && ` sur ${iv.weeks.length} semaine${iv.weeks.length > 1 ? 's' : ''}`}
        </p>
      )}

      <Field label="Semaines" required error={noWeeks ? 'Choisissez les semaines ou activez « Semaines indifférentes ».' : null}>
        <WeekPicker config={config} value={iv.weeks} any={iv.anyWeeks} readOnly={readOnly} invalid={noWeeks}
          onChange={(weeks) => onChange({ weeks })} onAnyChange={(anyWeeks) => onChange({ anyWeeks })} />
      </Field>
    </section>
  );
}

const KIND_LABEL = { amphi: 'Amphi', td: 'Salle de TD', info: 'Salle informatique', hybride: 'Salle hybride', autre: 'Salle' };

/**
 * Salles proposées d'après le planning des salles (onglet « Salles ») : équipements demandés,
 * capacité suffisante pour les groupes choisis, et créneaux libres là où l'enseignant est disponible.
 */
function RoomSuggestions({ wish, course, rooms, availability, config, readOnly, onChange }) {
  if (!rooms.length || !wish.interventions.length) return null;
  const suggestions = suggestRooms(wish, course, rooms, availability, config).slice(0, 6);
  const chosen = wish.preferredRooms || [];
  const toggle = (name) =>
    onChange({ preferredRooms: chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name].slice(0, 3) });
  const availabilityFilled = Object.keys(availability).length > 0;
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">
        Salles proposées <span className="font-normal text-slate-500">(selon le planning des salles — jusqu&apos;à 3 au choix)</span>
      </p>
      {suggestions.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune salle libre ne correspond à ces besoins : l&apos;équipe programme cherchera une solution.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {suggestions.map(({ room, freeSlots, preferredSlots }) => {
            const on = chosen.includes(room.name);
            return (
              <button key={room.id} type="button" disabled={readOnly || (!on && chosen.length >= 3)} aria-pressed={on} onClick={() => toggle(room.name)}
                className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  on ? 'bg-blue-900 text-white ring-blue-900' : 'bg-white ring-slate-300 hover:bg-blue-50'}`}>
                <span className="block font-medium">{room.name}</span>
                <span className={`block text-xs ${on ? 'text-blue-100' : 'text-slate-500'}`}>
                  {KIND_LABEL[room.kind]}{room.capacity ? ` · ${room.capacity} places` : ''} · {freeSlots} créneau{freeSlots > 1 ? 'x' : ''} libre{freeSlots > 1 ? 's' : ''}
                  {preferredSlots ? ` dont ${preferredSlots} préféré${preferredSlots > 1 ? 's' : ''}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!availabilityFilled && (
        <p className="text-xs text-slate-500">Les propositions s&apos;affineront quand vous aurez rempli vos disponibilités (étape suivante).</p>
      )}
    </div>
  );
}

function IconButton({ label, className = '', ...props }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={`grid size-11 place-items-center rounded-full text-[17px] text-slate-600 hover:bg-slate-100 disabled:opacity-30 sm:size-9 ${className}`} {...props} />
  );
}

export { formatWeeks };

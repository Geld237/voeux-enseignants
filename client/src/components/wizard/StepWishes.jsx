/**
 * Étape « Vœux » : catalogue officiel (semestre, parcours, recherche) → cartes de vœux détaillées.
 */
import { useMemo, useState } from 'react';
import { equivalentTD, fmtH, newWish } from '@shared/schemas.js';
import { Alert, Button, Card, Chip, inputClass } from '../ui.jsx';
import WishCard, { CourseBadges } from './WishCard.jsx';

export default function StepWishes({ draft, update, config, courses, rooms, readOnly, showErrors, issues }) {
  const [semester, setSemester] = useState('all');
  const [parcours, setParcours] = useState('all');
  const [query, setQuery] = useState('');
  const [justAdded, setJustAdded] = useState(null);
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const status = config.statuses.find((s) => s.value === draft.teacherStatus);
  const wishes = draft.wishes;
  const selected = new Set(wishes.map((w) => w.courseId));

  const setWishes = (fn) => update((d) => ({ wishes: fn(d.wishes) }));
  const add = (c) => {
    setWishes((ws) => [...ws, newWish(c)]);
    setJustAdded(c.id);
  };
  const move = (i, delta) =>
    setWishes((ws) => {
      const copy = [...ws];
      const [w] = copy.splice(i, 1);
      copy.splice(i + delta, 0, w);
      return copy;
    });

  const q = query.trim().toLowerCase();
  const catalog = courses.filter(
    (c) =>
      !selected.has(c.id) &&
      (semester === 'all' || c.semester === semester) &&
      (parcours === 'all' || (parcours === 'common' ? !c.parcours : c.parcours === parcours)) &&
      (!q || `${c.code} ${c.apogee || ''} ${c.title}`.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-5">
      <Alert>
        N&apos;indiquez que vos vœux pour le <strong>{config.program}</strong>, semestres {config.semesters.map((s) => s.key).join(', ')}.
        Le nombre de séances et les totaux sont calculés automatiquement.
      </Alert>

      <Gauge total={equivalentTD(wishes, config.coefficients)} status={status} />

      <section className="space-y-3">
        <h2 className="font-semibold">Mes enseignements <span className="font-normal text-slate-500">({wishes.length})</span></h2>
        {wishes.length === 0 && (
          <Alert tone={showErrors ? 'error' : 'info'}>Ajoutez vos ressources et SAÉ depuis le catalogue ci-dessous.</Alert>
        )}
        {wishes.map((w, i) => {
          const c = byId.get(w.courseId);
          if (!c) return null;
          return (
            <WishCard key={w.courseId} wish={w} index={i} count={wishes.length} course={c} wishes={wishes} coursesById={byId}
              config={config} rooms={rooms} availability={draft.availability} readOnly={readOnly} showErrors={showErrors}
              issues={issues.filter((x) => x.field === `wish-${w.courseId}`)}
              defaultOpen={justAdded === w.courseId || (showErrors && issues.some((x) => x.field === `wish-${w.courseId}`))}
              onChange={(patch) => setWishes((ws) => ws.map((x) => (x.courseId === w.courseId ? { ...x, ...patch } : x)))}
              onRemove={() => setWishes((ws) => ws.filter((x) => x.courseId !== w.courseId))}
              onMove={(d) => move(i, d)} />
          );
        })}
      </section>

      {!readOnly && (
        <section className="space-y-3">
          <h2 className="font-semibold">Catalogue des ressources et SAÉ</h2>
          <input type="search" placeholder="Rechercher un code (R3.05, VGFR305…) ou un intitulé…" className={inputClass(false)}
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {[{ key: 'all', label: 'Tous les semestres' }, ...config.semesters].map((s) => (
              <Chip key={s.key} active={semester === s.key} onClick={() => setSemester(s.key)}>{s.label}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['all', 'Tous'], ['common', 'Tronc commun'], ...Object.keys(config.parcours).map((p) => [p, p])].map(([k, label]) => (
              <Chip key={k} active={parcours === k} onClick={() => setParcours(k)} title={config.parcours[k]}>{label}</Chip>
            ))}
          </div>
          <Card className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            {catalog.length === 0 && <p className="p-4 text-sm text-slate-500">Aucune ressource ne correspond.</p>}
            {catalog.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.title}</p>
                  <CourseBadges course={c} config={config} />
                </div>
                <Button variant="secondary" size="sm" onClick={() => add(c)}>Ajouter</Button>
              </div>
            ))}
          </Card>
          <p className="text-xs text-slate-500">
            Une ressource manque ou est mal intitulée ? Ajoutez-la en remarque à l&apos;étape « Organisation » : l&apos;équipe programme complétera le catalogue.
          </p>
        </section>
      )}
    </div>
  );
}

function Gauge({ total, status }) {
  const target = status?.maxHours ?? status?.serviceHours ?? null;
  const over = status?.maxHours != null && total > status.maxHours;
  const pct = target ? Math.min(100, (total / target) * 100) : 0;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-600">Total GEA FI demandé ce semestre</p>
        <p className={`text-lg font-semibold ${over ? 'text-red-700' : ''}`}>
          {fmtH(total)} <span className="text-sm font-normal text-slate-500">éq. TD</span>
          {target && <span className="text-sm font-normal text-slate-500"> / {target} h {status?.maxHours ? 'plafond' : 'service annuel'}</span>}
        </p>
      </div>
      {target && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${over ? 'bg-red-600' : 'bg-blue-900'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">1 h CM = 1h30 éq. TD · 1 h TP = 1 h éq. TD.</p>
    </Card>
  );
}

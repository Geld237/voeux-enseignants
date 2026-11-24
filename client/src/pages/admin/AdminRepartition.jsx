/**
 * Onglet « Répartition » : le tableau de répartition construit par l'équipe programme.
 *
 * - Ressources et SAÉ : code, code Apogée, intitulé, semestre, parcours, volumes programme par groupe.
 * - Besoin calculé = volume × nombre de groupes déclarés dans l'onglet « Groupes ».
 * - Vœux reçus (fiches) et affectations : un enseignant par CM et par groupe de TD / TP.
 */
import { Fragment, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Button, Card, Chip, Field, Select, inputClass } from '../../components/ui.jsx';
import { Badge, Feedback, Loading, NumberCell, PageTitle, Stat, fmtHours, useAction, useLoad } from './common.jsx';

const EMPTY = { code: '', apogee: '', title: '', semester: 'S1', parcours: null, kind: 'R', pnCm: null, pnTd: null, pnTp: null, toConfirm: false };

export default function AdminRepartition() {
  const [data, setData, { error }] = useLoad('/api/admin/courses');
  const [action, run, clear] = useAction();
  const [semester, setSemester] = useState('all');
  const [parcours, setParcours] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [panel, setPanel] = useState(null);

  const courses = data?.courses || [];
  const q = query.trim().toLowerCase();
  const shown = courses.filter(
    (c) =>
      (semester === 'all' || c.semester === semester) &&
      (parcours === 'all' || (parcours === 'common' ? !c.parcours : c.parcours === parcours)) &&
      (!q || `${c.code} ${c.apogee || ''} ${c.title}`.toLowerCase().includes(q))
  );
  const totals = useMemo(() => {
    const t = { need: 0, unknown: 0, requested: 0, assigned: 0 };
    for (const c of shown) {
      for (const k of ['CM', 'TD', 'TP']) {
        if (c.need[k] === null) t.unknown += 1;
        else t.need += c.need[k];
        t.requested += c.requested[k];
        t.assigned += c.assigned[k];
      }
    }
    return t;
  }, [shown]);
  if (!data) return <Loading error={error} />;

  const setCourses = (r) => r?.courses && setData((d) => ({ ...d, courses: r.courses }));
  const replaceCourse = (course) => course && setData((d) => ({ ...d, courses: d.courses.map((c) => (c.id === course.id ? course : c)) }));
  const save = (c, patch) =>
    run(() => api('PUT', `/api/admin/courses/${c.id}`, toPayload({ ...c, ...patch }))).then(setCourses);

  return (
    <>
      <PageTitle title="Tableau de répartition"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === 'add' ? null : 'add')}>+ Ajouter une ressource</Button>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === 'import' ? null : 'import')}>Coller un tableau</Button>
          </>
        }>
        Saisissez les volumes du programme <strong>par groupe</strong> : le besoin est calculé avec les groupes de l&apos;onglet « Groupes ».
        Dépliez une ligne pour voir les vœux reçus et affecter un enseignant à chaque CM et à chaque groupe.
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ressources affichées" value={shown.length} />
        <Stat label="Besoin (h enseignant)" value={fmtHours(totals.need)} hint={totals.unknown ? `${totals.unknown} volume(s) non renseigné(s)` : null} />
        <Stat label="Demandé dans les fiches" value={fmtHours(totals.requested)} tone="blue" />
        <Stat label="Affecté" value={fmtHours(totals.assigned)} tone={totals.need && totals.assigned >= totals.need ? 'green' : 'amber'}
          hint={totals.need ? `${Math.round((totals.assigned / totals.need) * 100)} % du besoin` : null} />
      </div>

      <Feedback state={action} onClose={clear} />
      {panel === 'add' && (
        <Card className="p-4">
          <CourseForm initial={EMPTY} data={data} submitLabel="Ajouter"
            onSubmit={(c) => run(() => api('POST', '/api/admin/courses', toPayload(c)), `${c.code} ajouté.`).then((r) => { if (r) { setCourses(r); setPanel(null); } })} />
        </Card>
      )}
      {panel === 'import' && <ImportCourses data={data} run={run} onDone={setCourses} />}

      <Card className="space-y-2 p-4">
        <input type="search" placeholder="Rechercher un code ou un intitulé…" className={inputClass(false)} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {[{ key: 'all', label: 'Tous les semestres' }, ...data.semesters].map((s) => (
            <Chip key={s.key} active={semester === s.key} onClick={() => setSemester(s.key)}>{s.label}</Chip>
          ))}
          <span className="mx-1 hidden w-px bg-slate-200 sm:block" />
          {[['all', 'Tous parcours'], ['common', 'Tronc commun'], ...Object.keys(data.parcours).map((p) => [p, p])].map(([k, l]) => (
            <Chip key={k} active={parcours === k} onClick={() => setParcours(k)}>{l}</Chip>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="w-8" />
              <th className="px-3 py-2.5 text-left font-medium">Ressource</th>
              <th className="px-2 py-2.5 text-left font-medium">Sem.</th>
              <th className="px-2 py-2.5 text-center font-medium" colSpan={3}>Volume programme / groupe (CM · TD · TP)</th>
              <th className="px-2 py-2.5 text-center font-medium">Groupes</th>
              <th className="px-2 py-2.5 text-right font-medium">Besoin</th>
              <th className="px-2 py-2.5 text-right font-medium">Vœux</th>
              <th className="px-3 py-2.5 text-right font-medium">Affecté</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-500">Aucune ressource. Ajoutez-en ou collez votre tableau.</td></tr>}
            {shown.map((c) => {
              const need = sum(c.need);
              const assigned = sum(c.assigned);
              const isOpen = open === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className={`hover:bg-slate-50 ${isOpen ? 'bg-blue-50/50' : ''}`}>
                    <td className="pl-2">
                      <button type="button" aria-expanded={isOpen} aria-label={isOpen ? 'Replier' : 'Déplier'} onClick={() => setOpen(isOpen ? null : c.id)}
                        className="grid size-7 place-items-center rounded text-slate-500 hover:bg-slate-200">{isOpen ? '▾' : '▸'}</button>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left" onClick={() => setOpen(isOpen ? null : c.id)}>
                        <span className="font-medium">{c.title}</span>
                        <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          <span className="font-mono">{c.code}</span>{c.apogee && <span className="font-mono text-slate-400">· {c.apogee}</span>}
                          {c.kind === 'SAE' && <Badge tone="violet">SAÉ</Badge>}
                          <Badge>{c.parcours || 'Tronc commun'}</Badge>
                          {c.toConfirm && <Badge tone="amber">à confirmer</Badge>}
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-600">{c.semester}</td>
                    <td className="px-1 py-2 text-center"><NumberCell ariaLabel={`CM ${c.code}`} value={c.pnCm} onCommit={(v) => save(c, { pnCm: v })} /></td>
                    <td className="px-1 py-2 text-center"><NumberCell ariaLabel={`TD ${c.code}`} value={c.pnTd} onCommit={(v) => save(c, { pnTd: v })} /></td>
                    <td className="px-1 py-2 text-center"><NumberCell ariaLabel={`TP ${c.code}`} value={c.pnTp} onCommit={(v) => save(c, { pnTp: v })} /></td>
                    <td className="px-2 py-2 text-center text-xs text-slate-600">{c.groupsTD.length} TD · {c.groupsTP.length} TP</td>
                    <td className="px-2 py-2 text-right tabular-nums">{need === null ? <span className="text-slate-400">?</span> : fmtHours(need)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.wishes.length ? fmtHours(sum(c.requested)) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Badge tone={!assigned ? 'slate' : need && assigned >= need ? 'green' : 'amber'}>{assigned ? fmtHours(assigned) : '—'}</Badge>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="bg-slate-50 px-3 py-4 sm:px-6">
                        <CourseDetail course={c} data={data} run={run} onCourse={replaceCourse} onCourses={setCourses} onDeleted={() => setOpen(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

const sum = (o) => {
  const vals = Object.values(o).filter((v) => v !== null);
  return Object.values(o).every((v) => v === null) ? null : vals.reduce((s, v) => s + v, 0);
};
const toPayload = (c) => ({
  code: c.code.trim(), apogee: c.apogee?.trim() || null, title: c.title.trim(), semester: c.semester, parcours: c.parcours || null,
  kind: c.kind, pnCm: c.pnCm ?? null, pnTd: c.pnTd ?? null, pnTp: c.pnTp ?? null, toConfirm: !!c.toConfirm,
});

function CourseDetail({ course, data, run, onCourse, onCourses, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const candidates = new Map(); // teacherId → ce qu'il a demandé
  for (const w of course.wishes) {
    const list = candidates.get(w.teacherId) || [];
    list.push(w);
    candidates.set(w.teacherId, list);
  }
  const rows = [
    ['CM', course.need.CM !== null || course.wishes.some((w) => w.type === 'CM') || course.assignments.some((a) => a.type === 'CM') ? [''] : [], course.pnCm],
    ['TD', course.groupsTD, course.pnTd],
    ['TP', course.groupsTP, course.pnTp],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {course.wishes.length ? `${new Set(course.wishes.map((w) => w.teacherId)).size} enseignant(s) ont demandé ce module.` : 'Aucun vœu reçu pour ce module.'}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? 'Annuler' : 'Modifier la ressource'}</Button>
          <Button size="sm" variant="danger"
            onClick={() => window.confirm(`Supprimer ${course.code} ? Les vœux et affectations correspondants seront perdus.`) &&
              run(() => api('DELETE', `/api/admin/courses/${course.id}`), `${course.code} supprimé.`).then((r) => { if (r) { onCourses(r); onDeleted(); } })}>
            Supprimer
          </Button>
        </div>
      </div>

      {editing && (
        <Card className="p-4">
          <CourseForm initial={{ ...course, apogee: course.apogee || '' }} data={data} submitLabel="Enregistrer"
            onSubmit={(c) => run(() => api('PUT', `/api/admin/courses/${course.id}`, toPayload(c)), 'Ressource enregistrée.').then((r) => { if (r) { onCourses(r); setEditing(false); } })} />
        </Card>
      )}

      {course.wishes.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Vœux reçus</p>
          <div className="flex flex-wrap gap-2">
            {course.wishes.map((w, i) => (
              <span key={i} className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                <strong className="text-sm">{w.teacher}</strong> {w.state === 'draft' && <Badge tone="amber">brouillon</Badge>}
                <br />
                {w.type} · {w.type === 'CM' ? 'promotion' : w.groups.length ? w.groups.join(', ') : `${w.anyGroups} groupe(s) au choix`} · {fmtHours(w.hoursPerGroup)}{w.type !== 'CM' ? ' / groupe' : ''} · vœu n°{w.priority}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Affectations</p>
        {rows.every(([, groups]) => !groups.length) && (
          <p className="text-sm text-slate-500">Renseignez un volume CM, ou déclarez des groupes pour ce semestre dans l&apos;onglet « Groupes ».</p>
        )}
        <div className="space-y-3">
          {rows.map(([type, groups, pn]) => groups.length > 0 && (
            <div key={type} className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase">{type}{pn != null ? ` · ${fmtHours(pn)} par ${type === 'CM' ? 'promotion' : 'groupe'}` : ''}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((g) => (
                  <AssignmentCell key={g || 'promo'} course={course} type={type} group={g} pn={pn} data={data} candidates={candidates} run={run} onCourse={onCourse} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssignmentCell({ course, type, group, pn, data, candidates, run, onCourse }) {
  const current = course.assignments.find((a) => a.type === type && a.groupName === group);
  const wantedBy = (teacherId) =>
    (candidates.get(teacherId) || []).some((w) => w.type === type && (type === 'CM' || !w.groups.length || w.groups.includes(group)));
  const asked = data.teachers.filter((t) => wantedBy(t.id));
  const others = data.teachers.filter((t) => !wantedBy(t.id));
  const assign = (teacherId, hours) =>
    run(() => api('PUT', '/api/admin/assignments', {
      courseId: course.id, type, groupName: group, teacherId, hours: hours ?? current?.hours ?? pn ?? 0,
    })).then((r) => r && onCourse(r.course));

  return (
    <div className={`flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ${current ? 'ring-emerald-300' : 'ring-slate-200'}`}>
      <span className="w-20 shrink-0 text-sm font-medium">{type === 'CM' ? 'Promotion' : group}</span>
      <select aria-label={`Enseignant ${type} ${group || 'promotion'}`} className="min-w-0 flex-1 rounded-md border-0 bg-white py-1.5 pr-7 pl-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-blue-700"
        value={current?.teacherId ?? ''} onChange={(e) => assign(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Non affecté —</option>
        {asked.length > 0 && (
          <optgroup label="Ont demandé ce module">
            {asked.map((t) => <option key={t.id} value={t.id}>★ {t.lastName} {t.firstName}</option>)}
          </optgroup>
        )}
        <optgroup label={asked.length ? 'Autres enseignants' : 'Enseignants'}>
          {others.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
        </optgroup>
      </select>
      <NumberCell ariaLabel={`Heures ${type} ${group || 'promotion'}`} value={current?.hours ?? null} disabled={!current}
        onCommit={(h) => current && assign(current.teacherId, h ?? 0)} placeholder={pn != null ? String(pn) : 'h'} />
    </div>
  );
}

function CourseForm({ initial, data, onSubmit, submitLabel }) {
  const [c, setC] = useState(initial);
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(c); }}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Code programme" required><input className={inputClass(false)} value={c.code} onChange={set('code')} placeholder="R3.GC2F.11" /></Field>
        <Field label="Code Apogée / Hyperplanning"><input className={inputClass(false)} value={c.apogee || ''} onChange={set('apogee')} placeholder="VGFR311" /></Field>
        <div className="sm:col-span-2">
          <Field label="Intitulé" required><input className={inputClass(false)} value={c.title} onChange={set('title')} /></Field>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Semestre">
          <Select value={c.semester} onChange={set('semester')} options={data.semesters.map((s) => ({ value: s.key, label: s.label }))} />
        </Field>
        <Field label="Parcours">
          <Select value={c.parcours} onChange={set('parcours')} options={[{ value: null, label: 'Tronc commun' }, ...Object.keys(data.parcours).map((p) => ({ value: p, label: p }))]} />
        </Field>
        <Field label="Type">
          <Select value={c.kind} onChange={set('kind')} options={[{ value: 'R', label: 'Ressource' }, { value: 'SAE', label: 'SAÉ' }]} />
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" className="size-4 accent-blue-900" checked={!!c.toConfirm} onChange={(e) => setC((x) => ({ ...x, toConfirm: e.target.checked }))} />
          Intitulé à confirmer
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        {[['pnCm', 'CM (h)'], ['pnTd', 'TD (h / groupe)'], ['pnTp', 'TP (h / groupe)']].map(([k, l]) => (
          <Field key={k} label={l}>
            <input type="number" min="0" step="0.5" className={inputClass(false)} value={c[k] ?? ''}
              onChange={(e) => setC((x) => ({ ...x, [k]: e.target.value === '' ? null : Number(e.target.value) }))} />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={!c.code.trim() || !c.title.trim()}>{submitLabel}</Button>
    </form>
  );
}

function ImportCourses({ data, run, onDone }) {
  const [text, setText] = useState('');
  return (
    <Card className="space-y-3 p-4">
      <Field label="Collez votre tableau de répartition (depuis Excel)"
        hint={`Colonnes, dans cet ordre : Code · Code Apogée · Intitulé · Semestre (${data.semesters.map((s) => s.key).join(', ')}) · Parcours (vide = tronc commun) · CM · TD · TP (heures par groupe). Un code déjà présent est mis à jour.`}>
        <textarea rows={7} className={`${inputClass(false)} font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Code\tApogée\tIntitulé\tSemestre\tParcours\tCM\tTD\tTP\nR3.GC2F.11\tVGFR311\tFiscalité : imposition BIC\tS3\tGC2F\t\t20\t'} />
      </Field>
      <Button disabled={!text.trim()}
        onClick={() => run(() => api('POST', '/api/admin/courses/import', { text }),
          (r) => `${r.added} ajoutée(s), ${r.updated} mise(s) à jour.${r.errors.length ? ` Lignes ignorées : ${r.errors.join(' ')}` : ''}`).then((r) => { if (r) { onDone(r); setText(''); } })}>
        Importer
      </Button>
    </Card>
  );
}

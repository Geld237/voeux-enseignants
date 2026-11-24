/**
 * Onglet « Groupes » : constitution manuelle des groupes de TD et de TP, par semestre.
 * Les enseignants choisissent parmi ces groupes dans leur fiche ; la répartition s'en sert
 * pour calculer les besoins et proposer une case d'affectation par groupe.
 */
import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Card, Chip, Field, Select, inputClass } from '../../components/ui.jsx';
import { Badge, Feedback, Loading, NumberCell, PageTitle, useAction, useLoad } from './common.jsx';

export default function AdminGroups() {
  const [data, setData, { error }] = useLoad('/api/admin/groups');
  const [action, run, clear] = useAction();
  const [semester, setSemester] = useState('S1');
  const [panel, setPanel] = useState(null);
  if (!data) return <Loading error={error} />;

  const groups = data.groups.filter((g) => g.semester === semester);
  const tds = groups.filter((g) => g.type === 'TD');
  const orphanTps = groups.filter((g) => g.type === 'TP' && !tds.some((t) => t.id === g.parentId));
  const setGroups = (r) => r?.groups && setData((d) => ({ ...d, groups: r.groups }));
  const payload = (g, patch = {}) => {
    const x = { ...g, ...patch };
    return { semester: x.semester, name: x.name, type: x.type, parcours: x.parcours || null, parentId: x.parentId ?? null, size: x.size ?? null, sort: x.sort };
  };
  const save = (g, patch) => run(() => api('PUT', `/api/admin/groups/${g.id}`, payload(g, patch))).then(setGroups);
  const remove = (g) =>
    window.confirm(`Supprimer le groupe ${g.name} ?`) && run(() => api('DELETE', `/api/admin/groups/${g.id}`), `Groupe ${g.name} supprimé.`).then(setGroups);
  const total = tds.reduce((s, g) => s + (g.size || 0), 0);

  return (
    <>
      <PageTitle title="Groupes"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === 'add' ? null : 'add')}>+ Ajouter un groupe</Button>
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === 'generate' ? null : 'generate')}>Générer une série</Button>
          </>
        }>
        Constituez vos groupes de TD et leurs groupes de TP. Ce sont ceux que les enseignants cocheront dans leur fiche et ceux du tableau de répartition.
        Renommer un groupe met à jour les affectations, mais pas les fiches déjà remplies.
      </PageTitle>

      <div className="flex flex-wrap gap-1.5">
        {data.semesters.map((s) => (
          <Chip key={s.key} active={semester === s.key} onClick={() => setSemester(s.key)}>
            {s.label} <span className="opacity-70">({data.groups.filter((g) => g.semester === s.key && g.type === 'TD').length} TD)</span>
          </Chip>
        ))}
      </div>

      <Feedback state={action} onClose={clear} />
      {panel === 'add' && <AddGroup data={data} semester={semester} tds={tds} run={run} onDone={setGroups} />}
      {panel === 'generate' && <Generate data={data} semester={semester} run={run} onDone={setGroups} />}

      <p className="text-sm text-slate-600">{tds.length} groupe(s) de TD · {groups.length - tds.length} groupe(s) de TP · {total} étudiant(s) au total (effectifs des TD).</p>

      {tds.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">Aucun groupe pour ce semestre. Ajoutez-en ou générez une série.</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tds.map((td) => {
          const tps = groups.filter((g) => g.type === 'TP' && g.parentId === td.id);
          return (
            <Card key={td.id} className="space-y-3 p-4">
              <GroupRow group={td} data={data} onSave={save} onRemove={remove} />
              <div className="space-y-2 border-l-2 border-slate-100 pl-3">
                {tps.map((tp) => <GroupRow key={tp.id} group={tp} data={data} onSave={save} onRemove={remove} />)}
                <Button size="sm" variant="ghost"
                  onClick={() => run(() => api('POST', '/api/admin/groups', {
                    semester, type: 'TP', name: nextTpName(td.name, tps, groups), parcours: td.parcours, parentId: td.id,
                    size: td.size ? Math.ceil(td.size / 2) : null,
                  })).then(setGroups)}>
                  + Ajouter un TP à {td.name}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {orphanTps.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold">TP non rattachés à un TD</p>
          {orphanTps.map((tp) => <GroupRow key={tp.id} group={tp} data={data} tds={tds} onSave={save} onRemove={remove} />)}
        </Card>
      )}
    </>
  );
}

function nextTpName(tdName, tps, all) {
  const base = tdName.replace(/^TD/i, 'TP');
  for (const suffix of ['A', 'B', 'C', 'D', 'E']) {
    const name = base === tdName ? `${tdName}-${suffix}` : `${base}${suffix}`;
    if (!all.some((g) => g.name === name)) return name;
  }
  return `${base}-${tps.length + 1}`;
}

function GroupRow({ group, data, tds, onSave, onRemove }) {
  const [name, setName] = useState(group.name);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={group.type === 'TD' ? 'blue' : 'amber'}>{group.type}</Badge>
      <input aria-label="Nom du groupe" className="w-28 rounded-md border-0 px-2 py-1 text-sm font-medium ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-blue-700"
        value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== group.name && onSave(group, { name: name.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <select aria-label="Parcours" className="rounded-md border-0 py-1 pr-7 pl-2 text-sm ring-1 ring-inset ring-slate-300"
        value={group.parcours || ''} onChange={(e) => onSave(group, { parcours: e.target.value || null })}>
        <option value="">Tronc commun</option>
        {Object.keys(data.parcours).map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {tds && (
        <select aria-label="TD de rattachement" className="rounded-md border-0 py-1 pr-7 pl-2 text-sm ring-1 ring-inset ring-slate-300"
          value={group.parentId || ''} onChange={(e) => onSave(group, { parentId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Sans TD</option>
          {tds.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <NumberCell ariaLabel={`Effectif ${group.name}`} value={group.size} step="1" onCommit={(v) => onSave(group, { size: v === null ? null : Math.round(v) })} /> étudiants
      </span>
      <button type="button" className="ml-auto text-xs text-red-700 hover:underline" onClick={() => onRemove(group)}>Supprimer</button>
    </div>
  );
}

function AddGroup({ data, semester, tds, run, onDone }) {
  const [g, setG] = useState({ name: '', type: 'TD', parcours: null, parentId: null, size: null });
  return (
    <Card className="p-4">
      <form className="grid gap-3 sm:grid-cols-5 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api('POST', '/api/admin/groups', { ...g, semester, name: g.name.trim() }), `Groupe ${g.name} ajouté.`).then((r) => {
            if (r) { onDone(r); setG((x) => ({ ...x, name: '' })); }
          });
        }}>
        <Field label="Nom"><input className={inputClass(false)} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="TD6" /></Field>
        <Field label="Type"><Select value={g.type} onChange={(v) => setG({ ...g, type: v })} options={[{ value: 'TD', label: 'TD' }, { value: 'TP', label: 'TP' }]} /></Field>
        <Field label="Parcours">
          <Select value={g.parcours} onChange={(v) => setG({ ...g, parcours: v })} options={[{ value: null, label: 'Tronc commun' }, ...Object.keys(data.parcours).map((p) => ({ value: p, label: p }))]} />
        </Field>
        {g.type === 'TP' ? (
          <Field label="TD de rattachement">
            <Select value={g.parentId} onChange={(v) => setG({ ...g, parentId: v })} options={[{ value: null, label: 'Aucun' }, ...tds.map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
        ) : (
          <Field label="Effectif">
            <input type="number" min="0" className={inputClass(false)} value={g.size ?? ''} onChange={(e) => setG({ ...g, size: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
        )}
        <Button type="submit" disabled={!g.name.trim()}>Ajouter en {semester}</Button>
      </form>
    </Card>
  );
}

/** Crée d'un coup N TD (TD1…TDn) et leurs TP (TP1A, TP1B…). */
function Generate({ data, semester, run, onDone }) {
  const [p, setP] = useState({ prefix: 'TD', count: 5, tpPerTd: 2, size: 28, parcours: null });
  async function generate() {
    let last = null;
    for (let i = 1; i <= p.count; i += 1) {
      const name = `${p.prefix}${i}`;
      const r = await api('POST', '/api/admin/groups', { semester, type: 'TD', name, parcours: p.parcours, size: p.size || null });
      const td = r.groups.find((g) => g.semester === semester && g.name === name);
      last = r;
      for (let k = 0; k < p.tpPerTd; k += 1) {
        const tpName = `${p.prefix.replace(/^TD/i, 'TP')}${i}${'ABCDE'[k]}`;
        last = await api('POST', '/api/admin/groups', {
          semester, type: 'TP', name: tpName === name ? `${name}-${'ABCDE'[k]}` : tpName, parcours: p.parcours, parentId: td.id,
          size: p.size ? Math.ceil(p.size / p.tpPerTd) : null,
        });
      }
    }
    return last;
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Préfixe des TD"><input className={inputClass(false)} value={p.prefix} onChange={(e) => setP({ ...p, prefix: e.target.value })} /></Field>
        <Field label="Nombre de TD"><input type="number" min="1" max="20" className={inputClass(false)} value={p.count} onChange={(e) => setP({ ...p, count: Number(e.target.value) })} /></Field>
        <Field label="TP par TD"><Select value={p.tpPerTd} onChange={(v) => setP({ ...p, tpPerTd: v })} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} /></Field>
        <Field label="Effectif par TD"><input type="number" min="0" className={inputClass(false)} value={p.size ?? ''} onChange={(e) => setP({ ...p, size: Number(e.target.value) })} /></Field>
        <Field label="Parcours">
          <Select value={p.parcours} onChange={(v) => setP({ ...p, parcours: v })} options={[{ value: null, label: 'Tronc commun' }, ...Object.keys(data.parcours).map((x) => ({ value: x, label: x }))]} />
        </Field>
      </div>
      <p className="text-sm text-slate-500">
        Créera {p.prefix}1 à {p.prefix}{p.count}{p.tpPerTd ? `, chacun avec ${p.tpPerTd} TP (${p.prefix.replace(/^TD/i, 'TP')}1A…)` : ''} en {semester}. Les noms déjà utilisés provoquent une erreur.
      </p>
      <Button disabled={!p.prefix.trim() || !(p.count > 0)} onClick={() => run(generate, 'Groupes créés.').then(onDone)}>Générer</Button>
    </Card>
  );
}

/**
 * Onglet « Suivi des réponses » : liste des enseignants, import, invitations, export.
 */
import { useMemo, useState } from 'react';
import { api, formatDate } from '../../api.js';
import { Button, Card, Chip, Field, inputClass } from '../../components/ui.jsx';
import { Badge, Feedback, Loading, PageTitle, Stat, copyText, fmtHours, useAction, useIsPhone, useLoad } from './common.jsx';
import { Alert } from '../../components/ui.jsx';
import { Link } from 'react-router-dom';

const STATE = {
  submitted: ['Envoyée', 'green'],
  draft: ['Brouillon', 'amber'],
  not_started: ['Pas commencée', 'slate'],
};

export default function AdminTeachers() {
  const phone = useIsPhone();
  const [data, setData, { error }] = useLoad('/api/admin/teachers');
  const [settings] = useLoad('/api/admin/settings');
  const [action, run, clear] = useAction();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(null); // 'import' | 'add'

  const teachers = data?.teachers || [];
  const counts = useMemo(() => {
    const c = { submitted: 0, draft: 0, not_started: 0 };
    for (const t of teachers) c[t.state] += 1;
    return c;
  }, [teachers]);
  if (!data) return <Loading error={error} />;

  const statusLabel = Object.fromEntries(data.statuses.map((s) => [s.value, s.label]));
  const q = query.trim().toLowerCase();
  const shown = teachers.filter(
    (t) => (filter === 'all' || t.state === filter) && (!q || `${t.lastName} ${t.firstName} ${t.email}`.toLowerCase().includes(q))
  );
  const update = (r) => r?.teachers && setData((d) => ({ ...d, teachers: r.teachers }));

  const invite = (body, label) =>
    run(() => api('POST', '/api/admin/invite', body), (r) =>
      r.sent
        ? `${r.sent} invitation(s) envoyée(s)${label ? ` ${label}` : ''}. Les liens transmis auparavant restent valables.`
        : settings?.demo
          ? `${r.queued} invitation(s) déposée(s) dans la boîte de démo (mode démonstration : aucun e-mail réel).`
          : `${r.queued} invitation(s) préparée(s) mais NON envoyée(s) : l'e-mail n'est pas configuré (voir Réglages).`
    ).then(update);
  const canInvite = settings?.mailConfigured || settings?.demo;
  const copyLink = (t) =>
    run(() => api('POST', `/api/admin/teachers/${t.id}/link`).then(async (r) => { await copyText(r.url); return r; }),
      `Lien de ${t.firstName} ${t.lastName} copié : collez-le dans votre e-mail. Les liens envoyés auparavant restent valables.`).then(update);
  const remove = (t) =>
    window.confirm(`Supprimer ${t.firstName} ${t.lastName} ?\n\nSa fiche de vœux et ses affectations dans la répartition seront aussi supprimées.`) &&
    run(() => api('DELETE', `/api/admin/teachers/${t.id}`), `${t.firstName} ${t.lastName} a été supprimé(e).`).then(update);
  const service = (t) => {
    const ref = t.maxHours ?? t.serviceHours;
    if (!t.assignedEqTD) return { text: '—', tone: null };
    const over = t.maxHours != null && t.assignedEqTD > t.maxHours;
    return { text: `${fmtHours(t.assignedEqTD)}${ref ? ` / ${ref} h` : ''}`, tone: over ? 'red' : null, title: over ? 'Plafond du statut dépassé' : undefined };
  };

  return (
    <>
      <PageTitle title="Suivi des réponses"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'add' ? null : 'add')}>+ Ajouter un enseignant</Button>
            <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'import' ? null : 'import')}>Importer une liste</Button>
            <a href="/api/admin/export.csv" className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Export CSV</a>
            <a href="/api/admin/export.json" className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Export JSON</a>
          </>
        }>
        Importez la liste des enseignants, envoyez les liens personnels et suivez qui a répondu. L&apos;export CSV (point-virgule, UTF-8) s&apos;ouvre dans Excel et sert à préparer l&apos;import Hyperplanning.
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Enseignants" value={teachers.length} />
        <Stat label="Fiches envoyées" value={counts.submitted} tone="green" hint={teachers.length ? `${Math.round((counts.submitted / teachers.length) * 100)} %` : null} />
        <Stat label="Brouillons" value={counts.draft} tone="amber" />
        <Stat label="Pas commencées" value={counts.not_started} tone={counts.not_started ? 'red' : 'slate'} />
      </div>

      {settings && !settings.mailConfigured && !settings.demo && (
        <Alert tone="info" title="L'envoi des e-mails n'est pas configuré">
          Les invitations ne partent pas. Utilisez <strong>Copier le lien</strong> pour chaque enseignant et envoyez-le depuis votre messagerie,
          ou configurez l&apos;e-mail dans <Link to="../reglages" className="font-semibold text-blue-900">Réglages</Link>.
        </Alert>
      )}
      <Feedback state={action} onClose={clear} />
      {panel === 'add' && <AddTeacher onDone={(r) => { update(r); setPanel(null); }} run={run} />}
      {panel === 'import' && <ImportTeachers onDone={(r) => { update(r); }} run={run} />}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[['all', 'Tous'], ['submitted', 'Envoyées'], ['draft', 'Brouillons'], ['not_started', 'Pas commencées']].map(([k, l]) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>
          ))}
          <input type="search" placeholder="Rechercher…" className={`${inputClass(false)} sm:ml-auto sm:max-w-xs`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canInvite && <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={action.busy || !teachers.length} onClick={() => invite({ mode: 'pending' }, 'aux enseignants qui n’ont pas encore envoyé leur fiche')}>
            Inviter / relancer les non-répondants
          </Button>
          <Button size="sm" variant="secondary" disabled={action.busy || !teachers.length}
            onClick={() => window.confirm('Envoyer une invitation à tous les enseignants, y compris ceux qui ont déjà répondu ?') && invite({ mode: 'all' })}>
            Inviter tout le monde
          </Button>
        </div>}
      </Card>

      {/* Téléphone : cartes */}
      {phone && <div className="space-y-2">
        {shown.length === 0 && <Card className="p-5 text-center text-slate-500">Aucun enseignant.</Card>}
        {shown.map((t) => {
          const [label, tone] = STATE[t.state];
          const sv = service(t);
          return (
            <Card key={t.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{t.lastName} {t.firstName}</p>
                  <p className="truncate text-[13px] text-slate-500">{t.contactEmail || t.email}</p>
                </div>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <p className="text-[13px] text-slate-600">
                Vœux {t.requestedEqTD ? fmtHours(t.requestedEqTD) : '—'} · Affecté <span className={sv.tone ? 'font-semibold text-red-700' : ''}>{sv.text}</span>
                {' '}· {t.invitedAt ? `invité le ${formatDate(t.invitedAt)}` : 'jamais invité'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={action.busy} onClick={() => copyLink(t)}>Copier le lien</Button>
                {canInvite && <Button size="sm" variant="secondary" disabled={action.busy} onClick={() => invite({ ids: [t.id] }, `à ${t.firstName} ${t.lastName}`)}>{t.invitedAt ? 'Renvoyer' : 'Inviter'}</Button>}
                <Button size="sm" variant="danger" onClick={() => remove(t)}>Supprimer</Button>
              </div>
            </Card>
          );
        })}
      </div>}

      {/* Ordinateur : tableau */}
      {!phone && <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] text-slate-500 uppercase">
            <tr className="border-b border-black/5">
              <th className="px-4 py-3 font-medium">Enseignant</th>
              <th className="px-3 py-3 font-medium">Fiche</th>
              <th className="px-3 py-3 font-medium">Statut</th>
              <th className="px-3 py-3 text-right font-medium">Vœux</th>
              <th className="px-3 py-3 text-right font-medium">Affecté / service</th>
              <th className="px-3 py-3 font-medium">Invité le</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Aucun enseignant.</td></tr>}
            {shown.map((t) => {
              const [label, tone] = STATE[t.state];
              const sv = service(t);
              return (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{t.lastName} {t.firstName}</p>
                    <p className="text-xs text-slate-500">{t.contactEmail || t.email}{t.phone ? ` · ${t.phone}` : ''}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={tone}>{label}</Badge>
                    {t.submittedAt && <p className="text-xs text-slate-500">{formatDate(t.submittedAt)}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{statusLabel[t.teacherStatus] || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.requestedEqTD ? fmtHours(t.requestedEqTD) : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={sv.title}>
                    {sv.tone ? <Badge tone="red">{sv.text}</Badge> : sv.text}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{t.invitedAt ? formatDate(t.invitedAt) : <span className="text-red-700">jamais</span>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => copyLink(t)}>Copier le lien</Button>
                    {canInvite && (
                      <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => invite({ ids: [t.id] }, `à ${t.firstName} ${t.lastName}`)}>
                        {t.invitedAt ? 'Renvoyer' : 'Inviter'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(t)}>Supprimer</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>}
      <p className="text-xs text-slate-500">Vœux et affecté en heures équivalent TD (1 h CM = 1,5 h TD). Un nouveau lien ne désactive pas ceux déjà envoyés.</p>
    </>
  );
}

function AddTeacher({ run, onDone }) {
  const [f, setF] = useState({ lastName: '', firstName: '', email: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Card className="p-4">
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
        onSubmit={(e) => { e.preventDefault(); run(() => api('POST', '/api/admin/teachers', f), 'Enseignant ajouté.').then((r) => r && onDone(r)); }}>
        <Field label="Nom"><input className={inputClass(false)} value={f.lastName} onChange={set('lastName')} /></Field>
        <Field label="Prénom"><input className={inputClass(false)} value={f.firstName} onChange={set('firstName')} /></Field>
        <Field label="E-mail (envoi du lien)"><input type="email" className={inputClass(false)} value={f.email} onChange={set('email')} /></Field>
        <Button type="submit">Ajouter</Button>
      </form>
    </Card>
  );
}

function ImportTeachers({ run, onDone }) {
  const [text, setText] = useState('');
  return (
    <Card className="space-y-3 p-4">
      <Field label="Collez la liste (depuis Excel ou un CSV)" hint="Une ligne par enseignant : Nom, Prénom, E-mail — séparés par des tabulations, des points-virgules ou des virgules. Une ligne d'en-tête est ignorée ; un e-mail déjà connu met à jour le nom.">
        <textarea rows={6} className={`${inputClass(false)} font-mono`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Nom\tPrénom\tE-mail\nDupont\tMarie\tmarie.dupont@univ.fr'} />
      </Field>
      <Button disabled={!text.trim()}
        onClick={() => run(() => api('POST', '/api/admin/teachers/import', { text }),
          (r) => `${r.added} ajouté(s), ${r.updated} mis à jour.${r.errors.length ? ` Ignorées : ${r.errors.join(' ')}` : ''}`).then((r) => { if (r) { onDone(r); setText(''); } })}>
        Importer
      </Button>
    </Card>
  );
}

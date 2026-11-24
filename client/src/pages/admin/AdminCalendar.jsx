/**
 * Onglet « Calendrier » : déclaration manuelle du calendrier universitaire.
 * - Ouverture / clôture de la collecte des vœux.
 * - Semaines du semestre (générées entre deux dates) : cours, vacances, évaluations, banalisée…
 * - Jours fériés, créneaux horaires de la grille de disponibilités, semaine de début des SAÉ.
 */
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { WEEK_KINDS, buildWeeks } from '@shared/calendar.js';
import { Alert, Button, Card, Field, Select, inputClass } from '../../components/ui.jsx';
import { Feedback, Loading, PageTitle, useAction } from './common.jsx';

const KIND_STYLE = {
  intro: 'bg-sky-50',
  teaching: 'bg-white',
  holiday: 'bg-slate-100 text-slate-500',
  exam: 'bg-violet-50',
  free: 'bg-amber-50',
};
const toDate = (iso) => (iso ? iso.slice(0, 10) : '');
const fmt = (iso) => iso.split('-').reverse().join('/');

export default function AdminCalendar() {
  const { campaign, reloadCampaign, setDirty: setLayoutDirty } = useOutletContext();
  const [form, setForm] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' });
  const [dirty, setDirtyLocal] = useState(false);
  const [rangeError, setRangeError] = useState(null);
  const setDirty = (v) => {
    setDirtyLocal(v);
    setLayoutDirty(v);
  };
  useEffect(() => () => setLayoutDirty(false), [setLayoutDirty]);
  const [action, run, clear] = useAction();

  useEffect(() => {
    if (!campaign || dirty) return;
    const c = campaign.config;
    setForm({
      label: campaign.label,
      opensAt: toDate(campaign.opensAt),
      closesAt: toDate(campaign.closesAt),
      weeks: c.weeks,
      publicHolidays: c.publicHolidays || [],
      slots: c.slots,
      saeFromWeek: c.saeFromWeek ?? null,
    });
    setRange({ start: c.weeks[0]?.monday || '', end: c.weeks.at(-1)?.monday || '' });
  }, [campaign, dirty]);

  if (!form) return <Loading />;
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setWeek = (i, patch) => set({ weeks: form.weeks.map((w, k) => (k === i ? { ...w, ...patch } : w)) });
  const counts = Object.fromEntries(Object.keys(WEEK_KINDS).map((k) => [k, form.weeks.filter((w) => w.kind === k).length]));
  const slotsChanged = campaign && JSON.stringify(form.slots) !== JSON.stringify(campaign.config.slots);

  const datesMissing = !form.opensAt || !form.closesAt;
  async function save() {
    if (datesMissing) return;
    const body = {
      ...form,
      opensAt: new Date(`${form.opensAt}T00:00:00`).toISOString(),
      closesAt: new Date(`${form.closesAt}T23:59:59`).toISOString(),
      slots: form.slots.map((s) => s.trim()),
    };
    const r = await run(() => api('PUT', '/api/admin/campaign', body), 'Calendrier enregistré : il s’applique immédiatement aux fiches des enseignants.');
    if (r) {
      setDirty(false);
      reloadCampaign();
    }
  }

  return (
    <>
      <PageTitle title="Calendrier universitaire"
        actions={<Button onClick={save} disabled={!dirty || action.busy || datesMissing}>{action.busy ? 'Enregistrement…' : dirty ? 'Enregistrer le calendrier' : 'Enregistré'}</Button>}>
        Déclarez les semaines du semestre et leur nature. Les enseignants ne peuvent choisir que des semaines qui ne sont pas des vacances.
      </PageTitle>
      <Feedback state={action} onClose={clear} />

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label="Nom de la campagne"><input className={inputClass(false)} value={form.label} onChange={(e) => set({ label: e.target.value })} /></Field>
        </div>
        <Field label="Ouverture de la collecte des vœux">
          <input type="date" className={inputClass(false)} value={form.opensAt} onChange={(e) => set({ opensAt: e.target.value })} />
        </Field>
        <Field label="Date limite de réponse" error={form.closesAt && form.opensAt && form.closesAt < form.opensAt ? 'Doit être après l’ouverture.' : null}>
          <input type="date" className={inputClass(false)} value={form.closesAt} onChange={(e) => set({ closesAt: e.target.value })} />
        </Field>
        <Field label="Les SAÉ commencent à partir de" hint="Contrôle affiché aux enseignants (avertissement)">
          <Select value={form.saeFromWeek} onChange={(v) => set({ saeFromWeek: v })}
            options={[{ value: null, label: 'Pas de règle' }, ...form.weeks.filter((w) => w.kind !== 'holiday').map((w) => ({ value: w.week, label: `S${w.week} (${fmt(w.monday)})` }))]} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Semaines du semestre</h2>
          <p className="text-sm text-slate-500">Choisissez la première et la dernière semaine, générez la liste, puis indiquez la nature de chaque semaine. Les types déjà saisis sont conservés.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Première semaine (un jour de la semaine)">
            <input type="date" className={inputClass(false)} value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
          </Field>
          <Field label="Dernière semaine">
            <input type="date" className={inputClass(false)} value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </Field>
          <Button variant="secondary" disabled={!range.start || !range.end || range.end < range.start}
            onClick={() => {
              const weeks = buildWeeks(range.start, range.end, form.weeks);
              if ((new Date(range.end) - new Date(range.start)) / 86_400_000 > 7 * 53) {
                setRangeError('La période dépasse un an : choisissez des dates d\u2019un même semestre ou d\u2019une même année universitaire.');
                return;
              }
              setRangeError(null);
              set({ weeks });
            }}>
            Générer les semaines
          </Button>
        </div>
        {rangeError && <Alert tone="error">{rangeError}</Alert>}
        {datesMissing && <Alert tone="warning">Renseignez la date d&apos;ouverture et la date limite pour pouvoir enregistrer.</Alert>}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          {Object.entries(WEEK_KINDS).map(([k, l]) => counts[k] > 0 && <span key={k}><strong>{counts[k]}</strong> {l.replace(' (non sélectionnable)', '').toLowerCase()}</span>)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr><th className="py-2 pr-3 font-medium">Semaine</th><th className="py-2 pr-3 font-medium">Du lundi</th><th className="py-2 pr-3 font-medium">Nature</th><th className="py-2 font-medium">Libellé (facultatif)</th></tr>
            </thead>
            <tbody>
              {form.weeks.map((w, i) => (
                <tr key={`${w.year}-${w.week}`} className={KIND_STYLE[w.kind]}>
                  <td className="py-1 pr-3 pl-2 font-medium">S{w.week} <span className="text-xs font-normal text-slate-400">{w.year}</span></td>
                  <td className="py-1 pr-3 text-slate-600">{fmt(w.monday)}</td>
                  <td className="py-1 pr-3">
                    <select aria-label={`Nature de la semaine ${w.week}`} className="w-full rounded-md border-0 bg-white py-1 pl-2 text-sm ring-1 ring-inset ring-slate-300"
                      value={w.kind} onChange={(e) => setWeek(i, { kind: e.target.value })}>
                      {Object.entries(WEEK_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Libellé de la semaine ${w.week}`} className="w-full rounded-md border-0 bg-white px-2 py-1 text-sm ring-1 ring-inset ring-slate-300"
                      value={w.label || ''} maxLength={60} placeholder="Ex. Toussaint, contrôles communs…" onChange={(e) => setWeek(i, { label: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">Jours fériés</h2>
          {form.publicHolidays.map((h, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={i === 0 ? 'Date' : undefined}>
                <input type="date" aria-label="Date du jour férié" className={inputClass(false)} value={h.date}
                  onChange={(e) => set({ publicHolidays: form.publicHolidays.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)) })} />
              </Field>
              <div className="flex-1">
                <Field label={i === 0 ? 'Libellé' : undefined}>
                  <input aria-label="Libellé du jour férié" className={inputClass(false)} value={h.label} maxLength={80}
                    onChange={(e) => set({ publicHolidays: form.publicHolidays.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                </Field>
              </div>
              <Button variant="ghost" size="sm" onClick={() => set({ publicHolidays: form.publicHolidays.filter((_, k) => k !== i) })}>Retirer</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => set({ publicHolidays: [...form.publicHolidays, { date: '', label: '' }] })}>+ Ajouter un jour férié</Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div>
            <h2 className="font-semibold">Créneaux horaires</h2>
            <p className="text-sm text-slate-500">Lignes de la grille de disponibilités des enseignants et du planning des salles.</p>
          </div>
          {form.slots.map((s, i) => {
            const [start = '', end = ''] = s.split('-');
            const update = (a, b) => set({ slots: form.slots.map((x, k) => (k === i ? `${a}-${b}` : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input type="time" aria-label={`Début du créneau ${i + 1}`} className={`${inputClass(false)} !w-28`} value={start} onChange={(e) => update(e.target.value, end)} />
                <span className="text-slate-400">→</span>
                <input type="time" aria-label={`Fin du créneau ${i + 1}`} className={`${inputClass(false)} !w-28`} value={end} onChange={(e) => update(start, e.target.value)} />
                <Button variant="ghost" size="sm" disabled={form.slots.length <= 1} onClick={() => set({ slots: form.slots.filter((_, k) => k !== i) })}>Retirer</Button>
              </div>
            );
          })}
          <Button variant="secondary" size="sm" onClick={() => set({ slots: [...form.slots, '18:45-20:15'] })}>+ Ajouter un créneau</Button>
          {slotsChanged && (
            <Alert tone="warning">
              Modifier les créneaux en cours de campagne : les disponibilités et le planning des salles saisis sur les créneaux supprimés ne seront plus pris en compte, et les enseignants devront renseigner les nouveaux créneaux.
            </Alert>
          )}
        </Card>
      </div>
    </>
  );
}

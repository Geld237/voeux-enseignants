/**
 * Onglet « Salles » : salles, équipements et planning d'occupation hebdomadaire.
 * Le planning sert à proposer aux enseignants des salles libres sur leurs créneaux disponibles.
 */
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { slotKey } from '@shared/schemas.js';
import { Button, Card, Chip, Field, Select, inputClass } from '../../components/ui.jsx';
import { Badge, Feedback, Loading, PageTitle, useAction, useLoad } from './common.jsx';

const KINDS = { amphi: 'Amphithéâtre', td: 'Salle de TD', info: 'Salle informatique', hybride: 'Salle hybride', autre: 'Autre' };
const EMPTY = { name: '', kind: 'td', capacity: null, features: [], busy: {}, note: '' };
const fmtSlot = (s) => s.split('-').map((t) => t.replace(':', 'h').replace(/^0/, ''));

export default function AdminRooms() {
  const { campaign, setDirty, confirmLeave } = useOutletContext();
  useEffect(() => () => setDirty(false), [setDirty]);
  const [data, setData, { error }] = useLoad('/api/admin/rooms');
  const [action, run, clear] = useAction();
  const [selected, setSelected] = useState(null); // id ou 'new'
  if (!data || !campaign) return <Loading error={error} />;

  const config = campaign.config;
  const rooms = data.rooms;
  const setRooms = (r) => r?.rooms && setData((d) => ({ ...d, rooms: r.rooms }));
  const totalSlots = config.days.length * config.slots.length;
  const busyCount = (r) => config.days.reduce((s, d) => s + config.slots.filter((sl) => r.busy[slotKey(d.key, sl)]).length, 0);
  const room = selected === 'new' ? EMPTY : rooms.find((r) => r.id === selected);
  const select = (id) => confirmLeave() && setSelected(id);

  return (
    <>
      <PageTitle title="Salles et planning des salles"
        actions={<Button size="sm" variant="secondary" onClick={() => select('new')}>+ Ajouter une salle</Button>}>
        Déclarez vos salles et cochez les créneaux déjà occupés chaque semaine. Les enseignants se voient proposer les salles qui ont
        l&apos;équipement demandé, une capacité suffisante pour leurs groupes et des créneaux libres quand ils sont disponibles.
      </PageTitle>
      <Feedback state={action} onClose={clear} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="divide-y divide-slate-100 self-start overflow-hidden">
          {rooms.length === 0 && <p className="p-4 text-sm text-slate-500">Aucune salle déclarée.</p>}
          {rooms.map((r) => {
            const busy = busyCount(r);
            return (
              <button key={r.id} type="button" onClick={() => select(r.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selected === r.id ? 'bg-blue-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="flex flex-wrap gap-1 text-xs text-slate-500">
                    {KINDS[r.kind]}{r.capacity ? ` · ${r.capacity} places` : ''}
                    {r.features.map((f) => <Badge key={f} tone="blue">{data.features[f]}</Badge>)}
                  </p>
                </div>
                <div className="w-24 shrink-0 text-right">
                  <p className="text-xs text-slate-500">{totalSlots - busy} créneaux libres</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-200">
                    <div className="h-full bg-slate-600" style={{ width: `${(busy / totalSlots) * 100}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </Card>

        {room ? (
          <RoomEditor key={selected} room={room} config={config} features={data.features} onDirty={setDirty}
            onCancel={() => select(null)}
            onSave={(r) =>
              run(() => (selected === 'new' ? api('POST', '/api/admin/rooms', r) : api('PUT', `/api/admin/rooms/${selected}`, r)), `Salle ${r.name} enregistrée.`).then((res) => {
                if (!res) return;
                setDirty(false);
                setRooms(res);
                setSelected(res.rooms.find((x) => x.name === r.name)?.id ?? null);
              })
            }
            onDelete={selected !== 'new' && (() =>
              window.confirm(`Supprimer la salle ${room.name} ?`) &&
              run(() => api('DELETE', `/api/admin/rooms/${selected}`), 'Salle supprimée.').then((res) => { setRooms(res); setSelected(null); }))}
          />
        ) : (
          <Overview rooms={rooms} config={config} />
        )}
      </div>
    </>
  );
}

function RoomEditor({ room, config, features, onSave, onCancel, onDelete, onDirty }) {
  const initial = { ...EMPTY, ...room, note: room.note || '' };
  const [r, setR] = useState(initial);
  useEffect(() => setR({ ...EMPTY, ...room, note: room.note || '' }), [room]);
  const changed = JSON.stringify(r) !== JSON.stringify(initial);
  useEffect(() => onDirty(changed), [changed, onDirty]);
  const toggle = (keys) =>
    setR((x) => {
      const busy = { ...x.busy };
      const allBusy = keys.every((k) => busy[k]);
      for (const k of keys) {
        if (allBusy) delete busy[k];
        else busy[k] = true;
      }
      return { ...x, busy };
    });

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nom" required><input className={inputClass(false)} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="R300" /></Field>
        <Field label="Type"><Select value={r.kind} onChange={(v) => setR({ ...r, kind: v })} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Capacité (places)">
          <input type="number" min="0" className={inputClass(false)} value={r.capacity ?? ''} onChange={(e) => setR({ ...r, capacity: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-800">Équipements</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(features).map(([k, label]) => (
            <Chip key={k} active={r.features.includes(k)} onClick={() => setR({ ...r, features: r.features.includes(k) ? r.features.filter((f) => f !== k) : [...r.features, k] })}>{label}</Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">Planning hebdomadaire <span className="font-normal text-slate-500">— touchez une case pour la marquer occupée (ou un jour / un horaire pour toute la colonne / ligne)</span></p>
        <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-14 sm:w-20" />
              {config.days.map((d) => (
                <th key={d.key} className="font-medium text-slate-700">
                  <button type="button" className="w-full rounded py-1 hover:bg-slate-100" onClick={() => toggle(config.slots.map((s) => slotKey(d.key, s)))}>
                    <span className="sm:hidden">{d.short}</span><span className="hidden sm:inline">{d.label}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.slots.map((s) => (
              <tr key={s}>
                <th className="text-left text-xs font-normal text-slate-500">
                  <button type="button" className="rounded px-1 py-1 text-left hover:bg-slate-100" onClick={() => toggle(config.days.map((d) => slotKey(d.key, s)))}>
                    {fmtSlot(s).map((t, i) => <span key={i} className="block leading-tight">{t}</span>)}
                  </button>
                </th>
                {config.days.map((d) => {
                  const k = slotKey(d.key, s);
                  const busy = !!r.busy[k];
                  return (
                    <td key={d.key}>
                      <button type="button" onClick={() => toggle([k])} aria-label={`${d.label} ${s} : ${busy ? 'occupée' : 'libre'}`}
                        className={`h-10 w-full rounded-md text-xs font-medium transition ${busy ? 'bg-slate-700 text-white' : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'}`}>
                        {busy ? 'Occupée' : 'Libre'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Field label="Remarque interne (non visible des enseignants)">
        <input className={inputClass(false)} value={r.note} maxLength={300} onChange={(e) => setR({ ...r, note: e.target.value })} placeholder="Ex. clé au secrétariat, réservée au département le jeudi…" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {changed && <span className="self-center text-[13px] font-medium text-amber-700">Modifications non enregistrées</span>}
        <Button disabled={!r.name.trim()} onClick={() => onSave({ name: r.name.trim(), kind: r.kind, capacity: r.capacity, features: r.features, busy: r.busy, note: r.note })}>Enregistrer</Button>
        <Button variant="secondary" onClick={onCancel}>Fermer</Button>
        {onDelete && <Button variant="danger" className="ml-auto" onClick={onDelete}>Supprimer la salle</Button>}
      </div>
    </Card>
  );
}

/** Vue d'ensemble : nombre de salles libres par créneau. */
function Overview({ rooms, config }) {
  const max = Math.max(1, rooms.length);
  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Salles libres par créneau</h2>
        <p className="text-sm text-slate-500">Sélectionnez une salle à gauche pour modifier son planning.</p>
      </div>
      <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr><th className="w-14 sm:w-20" />{config.days.map((d) => <th key={d.key} className="font-medium text-slate-700"><span className="sm:hidden">{d.short}</span><span className="hidden sm:inline">{d.label}</span></th>)}</tr>
        </thead>
        <tbody>
          {config.slots.map((s) => (
            <tr key={s}>
              <th className="text-left text-xs font-normal text-slate-500">{fmtSlot(s).map((t, i) => <span key={i} className="block leading-tight">{t}</span>)}</th>
              {config.days.map((d) => {
                const free = rooms.filter((r) => !r.busy[slotKey(d.key, s)]);
                const ratio = free.length / max;
                return (
                  <td key={d.key}>
                    <div title={free.map((r) => r.name).join(', ') || 'Aucune salle libre'}
                      className={`grid h-10 place-items-center rounded-md text-sm font-semibold ${ratio === 0 ? 'bg-red-100 text-red-800' : ratio < 0.34 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                      {free.length}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">Survolez une case pour voir les salles libres.</p>
    </Card>
  );
}

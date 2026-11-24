/** Briques partagées par les onglets de l'espace équipe programme. */
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner } from '../../components/ui.jsx';

/** Charge une ressource d'API ; renvoie [data, setData, { loading, error, reload }]. */
export function useLoad(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    setError(null);
    return api('GET', url).then(setData).catch((e) => setError(errorMessage(e)));
  }, [url]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [data, setData, { loading: !data && !error, error, reload }];
}

/** Exécute une action d'API en affichant son résultat (message ou erreur). */
export function useAction() {
  const [state, setState] = useState({ busy: false, error: null, message: null });
  const run = useCallback(async (fn, okMessage) => {
    setState({ busy: true, error: null, message: null });
    try {
      const r = await fn();
      setState({ busy: false, error: null, message: typeof okMessage === 'function' ? okMessage(r) : okMessage || null });
      return r;
    } catch (e) {
      setState({ busy: false, error: errorMessage(e), message: null });
      return null;
    }
  }, []);
  const clear = useCallback(() => setState({ busy: false, error: null, message: null }), []);
  return [state, run, clear];
}

export function Feedback({ state, onClose }) {
  if (state.error) return <Alert tone="error"><Dismiss onClose={onClose}>{state.error}</Dismiss></Alert>;
  if (state.message) return <Alert tone="success"><Dismiss onClose={onClose}>{state.message}</Dismiss></Alert>;
  return null;
}
function Dismiss({ children, onClose }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>{children}</div>
      {onClose && <button type="button" className="text-current opacity-60 hover:opacity-100" onClick={onClose} aria-label="Fermer">✕</button>}
    </div>
  );
}

export function PageTitle({ title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-1 max-w-3xl text-sm text-slate-600">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ error }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  return <div className="flex items-center gap-3 py-10 text-slate-600"><Spinner /> Chargement…</div>;
}

export function Stat({ label, value, tone = 'slate', hint }) {
  const tones = { slate: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', blue: 'text-blue-900' };
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Badge({ tone = 'slate', children, title }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-900',
    violet: 'bg-violet-100 text-violet-800',
  };
  return <span title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Champ numérique compact qui ne déclenche onCommit qu'à la sortie du champ (ou Entrée). */
export function NumberCell({ value, onCommit, disabled, className = '', placeholder = '—', step = '0.5', ariaLabel }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    const next = v === '' ? null : Number(String(v).replace(',', '.'));
    if (next !== (value ?? null) && (next === null || Number.isFinite(next))) onCommit(next);
  };
  return (
    <input type="number" inputMode="decimal" min="0" step={step} aria-label={ariaLabel} value={v} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`w-16 rounded-md border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-blue-700 disabled:bg-slate-50 ${className}`} />
  );
}

export const fmtHours = (h) => (h === null || h === undefined ? '—' : `${String(Math.round(h * 100) / 100).replace('.', ',')} h`);

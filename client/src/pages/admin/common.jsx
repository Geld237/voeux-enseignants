/** Briques partagées par les onglets de l'espace équipe programme. */
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner } from '../../components/ui.jsx';

/** Vrai sur un écran de téléphone (moins de 768 px) ; suit le redimensionnement. */
export function useIsPhone() {
  const query = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

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

/** Grand titre iOS (Large Title) avec sous-titre et actions. */
export function PageTitle({ title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-tight font-bold tracking-tight sm:text-[34px]">{title}</h1>
        {children && <p className="mt-1.5 max-w-3xl text-[15px] leading-snug text-slate-500">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Copie un texte dans le presse-papiers, avec repli si l'API n'est pas disponible (accès réseau en http). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) window.prompt('Copiez ce lien :', text);
    return ok;
  }
}

export function Loading({ error }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  return <div className="flex items-center gap-3 py-10 text-slate-600"><Spinner /> Chargement…</div>;
}

export function Stat({ label, value, tone = 'slate', hint }) {
  const tones = { slate: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', blue: 'text-blue-900' };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-[28px] leading-tight font-bold tracking-tight tabular-nums ${tones[tone]}`}>{value}</p>
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
  return <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Lit un nombre saisi à la française (« 7,5 » ou « 7.5 ») ; '' → null ; illisible → NaN. */
export const parseDecimal = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
export const fmtDecimal = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

/**
 * Champ numérique compact : accepte la virgule décimale, n'enregistre qu'à la sortie du champ (ou Entrée),
 * et revient à la valeur enregistrée si la saisie est refusée.
 */
export function NumberCell({ value, onCommit, disabled, className = '', placeholder = '—', ariaLabel }) {
  const [v, setV] = useState(fmtDecimal(value));
  useEffect(() => setV(fmtDecimal(value)), [value]);
  const commit = async () => {
    const next = parseDecimal(v);
    if (Number.isNaN(next) || (next !== null && next < 0)) return setV(fmtDecimal(value));
    if (next === (value ?? null)) return setV(fmtDecimal(value));
    const ok = await onCommit(next);
    if (ok === null || ok === false) setV(fmtDecimal(value));
  };
  return (
    <input type="text" inputMode="decimal" aria-label={ariaLabel} value={v} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`w-16 rounded-[8px] border-0 bg-[#7676801f] px-2 py-1.5 text-right text-[14px] tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-blue-700 disabled:opacity-50 ${className}`} />
  );
}

export const fmtHours = (h) => (h === null || h === undefined ? '—' : `${String(Math.round(h * 100) / 100).replace('.', ',')} h`);

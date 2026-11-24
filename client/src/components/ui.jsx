import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react';
/** Petits composants d'interface partagés. */

/**
 * Bouton façon iOS : rempli (primary), teinté (secondary), texte seul (ghost), destructif (danger).
 */
export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-900 text-white hover:bg-blue-800 active:opacity-80 disabled:bg-slate-200 disabled:text-slate-400',
    secondary: 'bg-blue-900/10 text-blue-900 hover:bg-blue-900/15 active:bg-blue-900/20 disabled:bg-slate-100 disabled:text-slate-400',
    ghost: 'text-blue-900 hover:bg-blue-900/8 active:bg-blue-900/12 disabled:text-slate-400',
    danger: 'bg-red-600/10 text-red-700 hover:bg-red-600/15 active:bg-red-600/20 disabled:text-slate-400',
  };
  // Hauteurs ≥ 44 px sur téléphone (recommandation Apple), plus compactes à la souris.
  const sizes = { sm: 'h-10 px-3.5 text-[14px] sm:h-8 sm:px-3 sm:text-[13px]', md: 'h-11 px-4 text-[16px] sm:h-10 sm:text-[15px]', lg: 'h-12 px-6 text-[17px]' };
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

/** Carte « liste groupée insérée » iOS : fond blanc, coins arrondis, pas de bordure. */
export function Card({ className = '', ...props }) {
  return <div className={`rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`} {...props} />;
}

export function Field({ label, hint, error, required, htmlFor, children }) {
  // Relie automatiquement le libellé au champ (accessibilité, lecteurs d'écran).
  const autoId = useId();
  const child = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const linkable = child && ((typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)) || child.type === Select || child.type === DecimalInput);
  const id = htmlFor || child?.props.id || (linkable ? autoId : undefined);
  const content = linkable && !child.props.id ? cloneElement(child, { id }) : children;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-slate-600">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {content}
      {hint && !error && <p className="text-xs leading-snug text-slate-500">{hint}</p>}
      {error && <p className="text-[13px] font-medium text-red-700" role="alert">{error}</p>}
    </div>
  );
}

/** Champ de saisie iOS : fond gris clair (tertiarySystemFill), sans bordure, anneau bleu au focus. */
export const inputClass = (invalid) =>
  `block w-full rounded-[10px] border-0 bg-[#7676801f] px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:ring-2 focus:ring-inset disabled:opacity-60 ${
    invalid ? 'ring-2 ring-inset ring-red-400 focus:ring-red-600' : 'focus:ring-blue-700'
  }`;

export function Alert({ tone = 'info', title, children, className = '' }) {
  const tones = {
    info: ['bg-blue-50 text-slate-800', 'bg-blue-900'],
    success: ['bg-emerald-50 text-emerald-900', 'bg-emerald-600'],
    warning: ['bg-amber-50 text-amber-950', 'bg-amber-300'],
    error: ['bg-red-50 text-red-900', 'bg-red-600'],
  };
  const [box, dot] = tones[tone];
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${box} ${className}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function IssueList({ issues, tone = 'error' }) {
  if (!issues?.length) return null;
  return (
    <Alert tone={tone} title={tone === 'error' ? 'À corriger avant de continuer' : 'À vérifier'}>
      <ul className="list-disc space-y-0.5 pl-5">
        {issues.map((i, k) => (
          <li key={k}>{i.message}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function Spinner({ className = '' }) {
  return (
    <svg className={`size-5 animate-spin text-slate-400 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CenteredPage({ children }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">{children}</main>;
}

/**
 * Champ de nombre décimal (heures) : accepte « 7,5 » comme « 7.5 », clavier numérique sur téléphone.
 * onChange reçoit un nombre (0 si vide) dès que la saisie est lisible.
 */
export function DecimalInput({ value, onChange, invalid, className = '', ...props }) {
  const show = (n) => (n ? String(n).replace('.', ',') : '');
  const [v, setV] = useState(show(value));
  useEffect(() => {
    // Ne pas écraser la saisie en cours (« 7, ») quand la valeur numérique est la même.
    setV((cur) => (Number(cur.replace(',', '.')) === (value || 0) && cur !== '' ? cur : show(value)));
  }, [value]);
  return (
    <input type="text" inputMode="decimal" className={`${inputClass(invalid)} ${className}`} value={v} placeholder="0"
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '');
        setV(raw);
        const n = Number(raw.replace(',', '.'));
        if (raw === '') onChange(0);
        else if (Number.isFinite(n)) onChange(Math.max(0, n));
      }}
      {...props} />
  );
}

/** Interrupteur iOS avec libellé à gauche (ligne de réglage). */
export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between gap-4 text-[15px]">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block text-[13px] text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" className="ios-switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Titre de section façon iOS (petites capitales grises au-dessus d'une liste groupée). */
export function SectionHeader({ children, className = '' }) {
  return <h2 className={`px-4 pb-1.5 text-[13px] font-normal tracking-wide text-slate-500 uppercase ${className}`}>{children}</h2>;
}

/** Bouton bascule en forme de pastille (groupes, besoins de salle…). */
/** Pastille à bascule (groupes, besoins de salle…) : remplie en bleu quand elle est active. */
export function Chip({ active, disabled, className = '', children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex h-10 items-center rounded-full px-3.5 text-[14px] font-medium sm:h-8 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-900 text-white' : 'bg-[#7676801f] text-slate-800 hover:bg-[#76768029]'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, invalid, className = '', ...props }) {
  return (
    <select
      className={`${inputClass(invalid)} ${className}`}
      value={value ?? ''}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value ?? '') === e.target.value);
        onChange(opt ? opt.value : null);
      }}
      {...props}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
      ))}
    </select>
  );
}

/** Contrôle segmenté iOS (UISegmentedControl) : piste grise, segment choisi en blanc. */
export function Segmented({ value, onChange, options, disabled, name }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-[#7676801f] p-0.5" role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-10 min-w-16 rounded-[8px] px-3 py-2 text-[14px] font-medium sm:min-h-0 sm:py-1.5 sm:text-[13px] transition-all disabled:cursor-not-allowed ${
              on ? 'bg-white text-slate-900 shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]' : 'text-slate-800 hover:bg-white/50'
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

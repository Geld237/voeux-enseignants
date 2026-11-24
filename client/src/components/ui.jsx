import { Children, cloneElement, isValidElement, useId } from 'react';
/** Petits composants d'interface partagés. */

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-900 text-white hover:bg-blue-800 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', ...props }) {
  return <div className={`rounded-xl bg-white shadow-sm ring-1 ring-slate-200 ${className}`} {...props} />;
}

export function Field({ label, hint, error, required, htmlFor, children }) {
  // Relie automatiquement le libellé au champ (accessibilité, lecteurs d'écran).
  const autoId = useId();
  const child = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const linkable = child && ((typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)) || child.type === Select);
  const id = htmlFor || child?.props.id || (linkable ? autoId : undefined);
  const content = linkable && !child.props.id ? cloneElement(child, { id }) : children;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-800">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {content}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export const inputClass = (invalid) =>
  `block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset disabled:bg-slate-50 disabled:text-slate-500 ${
    invalid ? 'ring-red-400 focus:ring-red-600' : 'ring-slate-300 focus:ring-blue-700'
  }`;

export function Alert({ tone = 'info', title, children, className = '' }) {
  const tones = {
    info: 'bg-blue-50 text-blue-900 ring-blue-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-900 ring-red-200',
  };
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone]} ${className}`} role={tone === 'error' ? 'alert' : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
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
    <svg className={`size-5 animate-spin text-blue-900 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CenteredPage({ children }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">{children}</main>;
}

/** Bouton bascule en forme de pastille (groupes, besoins de salle…). */
export function Chip({ active, disabled, className = '', children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-900 text-white ring-blue-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
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

/** Groupe de boutons radio présentés comme un sélecteur segmenté. */
export function Segmented({ value, onChange, options, disabled, name }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors disabled:cursor-not-allowed ${
            value === o.value ? 'bg-blue-50 text-blue-900 ring-2 ring-blue-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

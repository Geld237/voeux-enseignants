/**
 * Espace « Équipe programme ».
 * Grand écran : barre latérale façon Réglages iPadOS. Téléphone : barre d'onglets en bas.
 * Gère aussi la connexion, la création du mot de passe au premier lancement et
 * le bandeau de mise à jour du logiciel de bureau.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../../api.js';
import { Alert, Button, Card, CenteredPage, Field, Spinner, inputClass } from '../../components/ui.jsx';
import { Icon } from './icons.jsx';

export const TABS = [
  { to: 'enseignants', label: 'Suivi des réponses', short: 'Suivi', icon: 'people', color: 'bg-[#007aff]' },
  { to: 'repartition', label: 'Répartition', short: 'Répartition', icon: 'table', color: 'bg-[#34c759]' },
  { to: 'calendrier', label: 'Calendrier', short: 'Calendrier', icon: 'calendar', color: 'bg-[#ff3b30]' },
  { to: 'groupes', label: 'Groupes', short: 'Groupes', icon: 'groups', color: 'bg-[#ff9500]' },
  { to: 'salles', label: 'Salles', short: 'Salles', icon: 'door', color: 'bg-[#5856d6]' },
  { to: 'reglages', label: 'Réglages', short: 'Réglages', icon: 'gear', color: 'bg-[#8e8e93]' },
];

export default function AdminLayout() {
  const [auth, setAuth] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [dirty, setDirty] = useState(false); // modifications non enregistrées dans l'onglet courant
  const location = useLocation();
  useEffect(() => {
    const warn = (e) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  /** À appeler avant de quitter l'onglet : demande confirmation s'il reste des modifications. */
  const confirmLeave = useCallback(() => {
    if (!dirty) return true;
    const ok = window.confirm('Vous avez des modifications non enregistrées. Les abandonner ?');
    if (ok) setDirty(false);
    return ok;
  }, [dirty]);
  const guard = (e) => {
    if (!confirmLeave()) e.preventDefault();
  };

  const loadCampaign = useCallback(() => api('GET', '/api/admin/campaign').then((r) => setCampaign(r.campaign)).catch(() => {}), []);
  const loadAuth = useCallback(() => api('GET', '/api/auth/admin').then(setAuth).catch(() => setAuth({ admin: false })), []);
  useEffect(() => {
    loadAuth();
  }, [loadAuth]);
  useEffect(() => {
    if (auth?.admin) loadCampaign();
  }, [auth, loadCampaign]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!auth) return <CenteredPage><div className="flex justify-center"><Spinner /></div></CenteredPage>;
  if (!auth.admin) return <AdminLogin auth={auth} onLogged={loadAuth} />;

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => {});
    setAuth({ admin: false, needsSetup: false });
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Barre latérale (tablette / ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-black/5 bg-[#f2f2f7] px-3 pt-8 pb-4 md:flex">
        <div className="mb-5 flex items-center gap-3 px-3">
          <img src="/icon-64.png" alt="" className="size-10 rounded-[10px] shadow-sm" />
          <div className="min-w-0">
            <p className="text-[17px] leading-tight font-semibold">Vœux enseignants</p>
            <p className="truncate text-[13px] text-slate-500">{campaign?.label || 'Équipe programme'}</p>
          </div>
        </div>
        <nav className="overflow-hidden rounded-2xl bg-white" aria-label="Sections">
          {TABS.map((t, i) => (
            <NavLink key={t.to} to={t.to} onClick={guard}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-[15px] transition-colors ${
                isActive ? 'bg-blue-900 text-white' : 'text-slate-900 hover:bg-slate-50'}`}>
              {({ isActive }) => (
                <>
                  <span className={`grid size-7 place-items-center rounded-[7px] text-white ${t.color}`}><Icon name={t.icon} className="size-[18px]" /></span>
                  <span className={`flex-1 py-0.5 ${i < TABS.length - 1 && !isActive ? '' : ''}`}>{t.label}</span>
                  <Icon name="chevron" className={`size-4 ${isActive ? 'text-white/70' : 'text-slate-300'}`} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 px-3">
          <Link to="/" className="block text-[13px] text-blue-900 hover:underline">Page d&apos;accueil enseignants</Link>
          <button type="button" onClick={logout} className="text-[13px] text-red-600 hover:underline">Se déconnecter</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-10">
        {/* Barre du haut (téléphone) */}
        <header className="ios-bar hairline-b sticky top-0 z-20 md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <p className="truncate text-[15px] font-semibold">{campaign?.label || 'Équipe programme'}</p>
            <button type="button" onClick={logout} className="shrink-0 text-[15px] text-blue-900">Déconnexion</button>
          </div>
        </header>
        <UpdateBanner />
        <main className="mx-auto max-w-6xl space-y-5 px-4 pt-6 md:px-8 md:pt-10">
          <Outlet context={{ campaign, reloadCampaign: loadCampaign, setDirty, confirmLeave }} />
        </main>
      </div>

      {/* Barre d'onglets iOS (téléphone) */}
      <nav className="ios-bar hairline-t fixed inset-x-0 bottom-0 z-20 flex justify-around pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden" aria-label="Sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} onClick={guard}
            className={({ isActive }) => `flex min-h-11 min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] font-medium ${isActive ? 'text-blue-900' : 'text-slate-400'}`}>
            <Icon name={t.icon} className="size-6" />
            <span className="truncate">{t.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Bandeau de mise à jour (logiciel de bureau uniquement). */
function UpdateBanner() {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!window.desktop) return undefined;
    window.desktop.info().then((i) => setState(i.update));
    return window.desktop.onUpdate(setState);
  }, []);
  if (!state || !['downloading', 'ready', 'manual'].includes(state.status)) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 md:px-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <span className="grid size-8 place-items-center rounded-full bg-blue-900 text-white"><Icon name="arrowDown" className="size-4" /></span>
        <p className="min-w-0 flex-1 text-[14px]">
          {state.status === 'ready'
            ? <>La version <strong>{state.version}</strong> est prête. Elle s&apos;installera au prochain redémarrage.</>
            : state.status === 'manual'
              ? <>La version <strong>{state.version}</strong> est disponible. Téléchargez-la puis remplacez l&apos;application (vos données sont conservées).</>
              : <>Téléchargement de la version {state.version}{state.percent ? ` — ${state.percent} %` : '…'}</>}
        </p>
        {state.status === 'ready' && <Button size="sm" onClick={() => window.desktop.installUpdate()}>Redémarrer maintenant</Button>}
        {state.status === 'manual' && <Button size="sm" onClick={() => window.desktop.openDownloadPage()}>Télécharger</Button>}
      </div>
    </div>
  );
}

function AdminLogin({ auth, onLogged }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setup = auth.needsSetup;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (setup && password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await api('POST', setup ? '/api/auth/admin-setup' : '/api/auth/admin-login', { password });
      onLogged();
    } catch (err) {
      const code = err.body?.error;
      setError(code === 'bad_password' ? 'Mot de passe incorrect.' : code === 'local_only'
        ? 'Le mot de passe doit être créé depuis l’ordinateur où le logiciel est installé.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredPage>
      <div className="mb-6 text-center">
        <img src="/apple-touch-icon.png" alt="" className="mx-auto mb-4 size-20 rounded-[18px] shadow-md" />
        <h1 className="text-[28px] font-bold tracking-tight">{setup ? 'Bienvenue' : 'Équipe programme'}</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          {setup ? 'Créez le mot de passe qui protégera l’espace de gestion.' : 'Répartition, calendrier, groupes, salles et suivi des fiches.'}
        </p>
      </div>
      {setup && !auth.canSetup ? (
        <Alert tone="warning" title={auth.desktop ? 'Configuration à terminer sur le poste principal' : 'Mot de passe à définir sur le serveur'}>
          {auth.desktop
            ? 'Ouvrez le logiciel sur l\u2019ordinateur où il est installé pour créer le mot de passe.'
            : 'Définissez la variable ADMIN_PASSWORD dans le fichier .env du serveur, puis redémarrez-le.'}
        </Alert>
      ) : (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label={setup ? 'Nouveau mot de passe (8 caractères minimum)' : 'Mot de passe'}>
              <input type="password" autoComplete={setup ? 'new-password' : 'current-password'} className={inputClass(!!error)} value={password}
                onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            {setup && (
              <Field label="Confirmer le mot de passe">
                <input type="password" autoComplete="new-password" className={inputClass(!!error)} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            {auth.demoPassword && <Alert tone="warning">Mode démonstration : le mot de passe est <strong>demo</strong>.</Alert>}
            <Button type="submit" size="lg" disabled={busy || !password} className="w-full">
              {busy ? 'Un instant…' : setup ? 'Créer et continuer' : 'Se connecter'}
            </Button>
          </form>
        </Card>
      )}
    </CenteredPage>
  );
}

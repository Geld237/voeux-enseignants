/**
 * Espace « Équipe programme » : connexion par mot de passe, puis onglets.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api, errorMessage } from '../../api.js';
import { Alert, Button, Card, CenteredPage, Field, Spinner, inputClass } from '../../components/ui.jsx';

const TABS = [
  ['enseignants', 'Suivi des réponses'],
  ['repartition', 'Répartition'],
  ['calendrier', 'Calendrier'],
  ['groupes', 'Groupes'],
  ['salles', 'Salles'],
];

export default function AdminLayout() {
  const [auth, setAuth] = useState(null); // { admin, demoPassword }
  const [campaign, setCampaign] = useState(null);

  const loadCampaign = useCallback(() => api('GET', '/api/admin/campaign').then((r) => setCampaign(r.campaign)).catch(() => {}), []);
  useEffect(() => {
    api('GET', '/api/auth/admin').then(setAuth).catch(() => setAuth({ admin: false }));
  }, []);
  useEffect(() => {
    if (auth?.admin) loadCampaign();
  }, [auth, loadCampaign]);

  if (!auth) return <CenteredPage><div className="flex justify-center"><Spinner /></div></CenteredPage>;
  if (!auth.admin) return <AdminLogin demoPassword={auth.demoPassword} onLogged={() => setAuth({ admin: true })} />;

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => {});
    setAuth({ admin: false });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">Vœux et disponibilités</Link>
            <p className="truncate font-semibold">Équipe programme{campaign ? ` · ${campaign.label}` : ''}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>Se déconnecter</Button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" aria-label="Onglets">
          {TABS.map(([to, label]) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <Outlet context={{ campaign, reloadCampaign: loadCampaign }} />
      </main>
    </div>
  );
}

function AdminLogin({ onLogged, demoPassword }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/auth/admin-login', { password });
      onLogged();
    } catch (err) {
      setError(err.body?.error === 'bad_password' ? 'Mot de passe incorrect.' : err.body?.error === 'admin_not_configured'
        ? 'Espace désactivé : définissez ADMIN_PASSWORD dans le fichier .env du serveur.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CenteredPage>
      <Card className="space-y-5 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">Espace équipe programme</h1>
          <p className="text-sm text-slate-500">Répartition, calendrier, groupes, salles et suivi des fiches de vœux.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mot de passe">
            <input type="password" autoComplete="current-password" className={inputClass(!!error)} value={password}
              onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          {demoPassword && <Alert tone="warning">Mode démonstration : le mot de passe est <strong>demo</strong>.</Alert>}
          <Button type="submit" disabled={busy || !password} className="w-full">{busy ? 'Connexion…' : 'Se connecter'}</Button>
        </form>
      </Card>
    </CenteredPage>
  );
}

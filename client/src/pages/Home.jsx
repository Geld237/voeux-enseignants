import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Button, Card, CenteredPage } from '../components/ui.jsx';

export default function Home() {
  const [demo, setDemo] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api('GET', '/api/demo/status').then((r) => setDemo(r.demo)).catch(() => setDemo(false));
  }, []);

  async function sendInvites() {
    setBusy(true);
    try {
      await api('POST', '/api/demo/invite');
      navigate('/demo/boite');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredPage>
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-blue-900 text-white">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold">Vœux et disponibilités</h1>
          <p className="text-sm text-slate-500">Préparation des emplois du temps</p>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <p className="text-slate-700">
          <strong>Enseignants :</strong> ouvrez le lien personnel reçu par e-mail de l&apos;équipe programme. Aucun mot de passe n&apos;est nécessaire.
        </p>
        <p className="text-slate-700">
          <strong>Équipe programme :</strong>{' '}
          <Link to="/admin" className="font-medium text-blue-900 underline">accéder à l&apos;espace de gestion</Link>{' '}
          (répartition, calendrier, groupes, salles, suivi des réponses).
        </p>
      </Card>

      {demo && (
        <Card className="mt-6 space-y-4 p-6">
          <Alert tone="warning" title="Mode démonstration">
            Aucun e-mail réel n&apos;est envoyé : les messages arrivent dans une boîte de réception de démo.
            Mot de passe de l&apos;espace équipe programme : <strong>demo</strong>.
          </Alert>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Envoyez les invitations aux enseignants fictifs.</li>
            <li>Ouvrez un e-mail dans la boîte de démo et cliquez sur le lien.</li>
            <li>Remplissez la fiche comme le ferait un enseignant, puis suivez-la dans l&apos;espace équipe programme.</li>
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={sendInvites} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer les invitations'}</Button>
            <Link to="/demo/boite" className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-blue-900 ring-1 ring-slate-300 hover:bg-slate-50">
              Ouvrir la boîte de démo
            </Link>
          </div>
        </Card>
      )}
    </CenteredPage>
  );
}

/** Boîte de réception du mode démo : affiche les e-mails « envoyés » par le serveur. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { Alert, Button, Card } from '../components/ui.jsx';

const KIND_LABEL = { invitation: 'Invitation', confirmation: 'Confirmation', reminder: 'Relance', change_alert: 'Modification' };
const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} className="break-all text-blue-800 underline">{part}</a> : <span key={i}>{part}</span>
  );
}

export default function DemoOutbox() {
  const [emails, setEmails] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('GET', '/api/demo/outbox')
      .then((r) => setEmails(r.emails))
      .catch((e) => setError(e.status === 404 ? 'La boîte de démo n’est disponible qu’en mode démonstration.' : 'Chargement impossible.'));
  }, []);
  useEffect(load, [load]);

  async function run(action) {
    setBusy(true);
    try {
      await api('POST', `/api/demo/${action}`);
      setSelectedId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  const selected = emails?.find((e) => e.id === selectedId);
  const magicLink = selected?.text.match(/https?:\/\/\S+\/acces\/\S+/)?.[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">← Accueil</Link>
          <h1 className="text-xl font-semibold">Boîte de réception de démo</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={load}>Actualiser</Button>
          <Button size="sm" onClick={() => run('invite')} disabled={busy}>Envoyer les invitations</Button>
          <Button variant="danger" size="sm" onClick={() => window.confirm('Effacer toutes les données de démo (réponses, répartition, e-mails) ?') && run('reset')} disabled={busy}>
            Réinitialiser la démo
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {emails?.length === 0 && <Alert>Aucun e-mail pour l&apos;instant. Cliquez sur « Envoyer les invitations ».</Alert>}

      {emails?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className={`divide-y divide-slate-100 overflow-hidden ${selected ? 'hidden md:block' : ''}`}>
            {emails.map((e) => (
              <button key={e.id} onClick={() => setSelectedId(e.id)}
                className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${e.id === selectedId ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{e.recipient}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{KIND_LABEL[e.kind] || e.kind}</span>
                </div>
                <p className="truncate text-sm text-slate-600">{e.subject}</p>
                <p className="text-xs text-slate-400">{formatDate(e.createdAt, true)}</p>
              </button>
            ))}
          </Card>
          {selected ? (
            <Card className="p-5">
              <button className="mb-3 text-sm text-slate-500 md:hidden" onClick={() => setSelectedId(null)}>← Liste</button>
              <p className="text-xs text-slate-500">À : {selected.recipient}</p>
              <h2 className="mb-4 text-lg font-semibold">{selected.subject}</h2>
              {magicLink && (
                <a href={magicLink} className="mb-4 inline-flex rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
                  Ouvrir le formulaire (comme l&apos;enseignant)
                </a>
              )}
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700"><Linkified text={selected.text} /></pre>
            </Card>
          ) : (
            <Card className="hidden place-items-center p-10 text-sm text-slate-400 md:grid">Sélectionnez un e-mail</Card>
          )}
        </div>
      )}
    </main>
  );
}

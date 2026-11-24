/**
 * /acces/:token — échange le lien unique contre une session, puis retire le token de l'URL.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, CenteredPage, Card, Spinner } from '../components/ui.jsx';

const MESSAGES = {
  invalid: { title: 'Lien non reconnu', text: 'Vérifiez que vous avez ouvert le lien complet depuis l’e-mail. Si le problème persiste, demandez un nouveau lien à l’équipe programme.' },
  revoked: { title: 'Ce lien a été remplacé', text: 'Un lien plus récent vous a été envoyé. Utilisez le dernier e-mail reçu de l’équipe programme.' },
  expired: { title: 'Ce lien a expiré', text: 'Contactez l’équipe programme pour recevoir un nouveau lien. Vos réponses déjà enregistrées sont conservées.' },
  too_many_requests: { title: 'Trop de tentatives', text: 'Patientez quelques minutes avant de réessayer.' },
  network: { title: 'Serveur injoignable', text: 'Vérifiez votre connexion puis rechargez la page.' },
};

export default function MagicLinkLanding() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // évite le double appel du mode StrictMode
    started.current = true;
    api('POST', '/api/auth/exchange', { token })
      .then((r) => navigate(r.redirect || '/enseignant', { replace: true }))
      .catch((e) => {
        setError(MESSAGES[e.body?.error] ? e.body.error : 'invalid');
        window.history.replaceState(null, '', '/acces');
      });
  }, [token, navigate]);

  return (
    <CenteredPage>
      <Card className="p-6 sm:p-8">
        {error ? (
          <Alert tone="error" title={MESSAGES[error].title}>{MESSAGES[error].text}</Alert>
        ) : (
          <div className="flex items-center gap-3 text-slate-700"><Spinner /><p>Vérification de votre lien personnel…</p></div>
        )}
      </Card>
    </CenteredPage>
  );
}

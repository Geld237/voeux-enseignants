import { Link } from 'react-router-dom';
import { Card, CenteredPage } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <CenteredPage>
      <Card className="p-6 text-center">
        <p className="font-semibold">Page introuvable</p>
        <Link to="/" className="mt-3 inline-block text-sm text-blue-900 underline">Retour à l&apos;accueil</Link>
      </Card>
    </CenteredPage>
  );
}

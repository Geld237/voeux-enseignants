/** Étape 1 — coordonnées obligatoires. Enregistrées séparément du brouillon. */
import { useState } from 'react';
import { api } from '../../api.js';
import { profileSchema } from '@shared/schemas.js';
import { Alert, Button, Card, Field, inputClass } from '../ui.jsx';

export default function StepProfile({ teacher, onSaved, locked }) {
  const [form, setForm] = useState({ contactEmail: teacher.contactEmail || teacher.email || '', phone: teacher.phone || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSaved(false);
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      // Premier message par champ (« obligatoire » avant « invalide »).
      const errs = {};
      for (const i of parsed.error.issues) errs[i.path[0]] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await api('PUT', '/api/teacher/profile', parsed.data);
      setSaved(true);
      onSaved(r.teacher);
    } catch (err) {
      const issues = err.body?.issues;
      setErrors(issues ? Object.fromEntries(issues.map((i) => [i.field, i.message])) : { form: 'Enregistrement impossible, réessayez.' });
    } finally {
      setBusy(false);
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Card className="space-y-5 p-5 sm:p-6">
        <p className="text-sm text-slate-600">
          L&apos;équipe programme utilisera ces coordonnées pour vous joindre au sujet de votre emploi du temps et vous prévenir en cas de modification.
          Les deux champs sont obligatoires.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Adresse e-mail de contact" required htmlFor="contactEmail" error={errors.contactEmail} hint="Pré-remplie avec l'adresse à laquelle le lien a été envoyé.">
            <input id="contactEmail" type="email" autoComplete="email" className={inputClass(errors.contactEmail)} value={form.contactEmail} onChange={set('contactEmail')} disabled={locked} />
          </Field>
          <Field label="Téléphone" required htmlFor="phone" error={errors.phone} hint="Ex. 06 12 34 56 78 ou +33 6 12 34 56 78">
            <input id="phone" type="tel" autoComplete="tel" inputMode="tel" className={inputClass(errors.phone)} value={form.phone} onChange={set('phone')} disabled={locked} />
          </Field>
        </div>
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {saved && <Alert tone="success">Coordonnées enregistrées.</Alert>}
        {!locked && <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? 'Enregistrement…' : 'Enregistrer et continuer'}</Button>}
      </Card>
      <p className="text-xs leading-relaxed text-slate-500">
        <strong>Protection des données.</strong> Ces informations sont utilisées uniquement par l&apos;équipe programme pour l&apos;élaboration des emplois du temps du semestre.
        Vous pouvez exercer vos droits d&apos;accès et de rectification auprès du secrétariat pédagogique.
      </p>
    </form>
  );
}

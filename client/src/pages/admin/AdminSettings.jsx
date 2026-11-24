/**
 * Onglet « Réglages » : adresse d'accès des enseignants, e-mail, boîte d'envoi, mot de passe, version.
 */
import { useEffect, useState } from 'react';
import { api, formatDate } from '../../api.js';
import { Alert, Button, Card, Field, SectionHeader, inputClass } from '../../components/ui.jsx';
import { Badge, Feedback, Loading, PageTitle, useAction, useLoad } from './common.jsx';
import { Icon } from './icons.jsx';

export default function AdminSettings() {
  const [s, setS, { error }] = useLoad('/api/admin/settings');
  const [action, run, clear] = useAction();
  if (!s) return <Loading error={error} />;
  const saved = (r) => r && setS(r);

  return (
    <>
      <PageTitle title="Réglages" />
      <Feedback state={action} onClose={clear} />
      <AccessSection s={s} run={run} onSaved={saved} />
      <MailSection s={s} run={run} onSaved={saved} />
      <OutboxSection count={s.outboxCount} />
      <PasswordSection s={s} run={run} onSaved={saved} />
      <AboutSection s={s} />
    </>
  );
}

function Section({ title, footer, children }) {
  return (
    <section>
      <SectionHeader>{title}</SectionHeader>
      <Card className="space-y-4 p-4 sm:p-5">{children}</Card>
      {footer && <p className="px-4 pt-1.5 text-[13px] leading-snug text-slate-500">{footer}</p>}
    </section>
  );
}

function AccessSection({ s, run, onSaved }) {
  const [url, setUrl] = useState(s.appUrlSaved || s.appUrl);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(s.appUrlSaved || s.appUrl), [s.appUrlSaved, s.appUrl]);
  const copy = async () => {
    await navigator.clipboard?.writeText(s.appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Section title="Accès des enseignants"
      footer={s.desktop
        ? 'Les enseignants ouvrent leur lien personnel depuis leur navigateur, sur le même réseau que cet ordinateur (réseau de l’université ou VPN), pendant que le logiciel est ouvert.'
        : 'Adresse utilisée dans les liens envoyés aux enseignants.'}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[9px] bg-[#007aff] text-white"><Icon name="link" className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-slate-500">Adresse actuelle des liens</p>
          <p className="truncate font-mono text-[15px]">{s.appUrl}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={copy}>{copied ? 'Copié' : 'Copier'}</Button>
      </div>
      <Field label="Adresse d'accès (laisser vide pour la détection automatique)"
        hint={s.lanUrls.length ? `Adresses de cet ordinateur sur le réseau : ${s.lanUrls.join(' · ')}` : undefined}>
        <input className={`${inputClass(false)} font-mono`} value={url} placeholder={s.lanUrls[0] || 'http://192.168.1.20:4310'} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      {s.lanUrls.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {s.lanUrls.map((u) => <Button key={u} size="sm" variant="ghost" onClick={() => setUrl(u)}>Utiliser {u}</Button>)}
        </div>
      )}
      <Button onClick={() => run(() => api('PUT', '/api/admin/settings', { appUrl: url.trim() === s.appUrl && !s.appUrlSaved ? '' : url.trim() }), 'Adresse enregistrée.').then(onSaved)}>
        Enregistrer l&apos;adresse
      </Button>
    </Section>
  );
}

function MailSection({ s, run, onSaved }) {
  const [f, setF] = useState({ smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpUser: s.smtpUser, smtpPass: '', mailFrom: s.mailFrom });
  const [to, setTo] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = () => {
    const body = { ...f };
    if (!body.smtpPass) delete body.smtpPass; // vide = inchangé
    return run(() => api('PUT', '/api/admin/settings', body), 'Réglages e-mail enregistrés.').then((r) => { onSaved(r); setF((x) => ({ ...x, smtpPass: '' })); });
  };
  return (
    <Section title="E-mail"
      footer="Serveur d'envoi (SMTP) fourni par votre université ou votre messagerie. Sans serveur configuré, rien ne part : utilisez « Copier le lien » dans le suivi des réponses et envoyez les liens depuis votre propre messagerie.">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 place-items-center rounded-[9px] text-white ${s.mailConfigured ? 'bg-[#34c759]' : 'bg-[#8e8e93]'}`}><Icon name="envelope" className="size-5" /></span>
        <p className="flex-1 text-[15px]">{s.mailConfigured ? 'Envoi des e-mails activé' : 'Envoi des e-mails non configuré'}</p>
        <Badge tone={s.mailConfigured ? 'green' : 'slate'}>{s.mailConfigured ? 'Activé' : 'Désactivé'}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Serveur SMTP"><input className={inputClass(false)} value={f.smtpHost} onChange={set('smtpHost')} placeholder="smtp.univ.fr" /></Field>
        <Field label="Port"><input inputMode="numeric" className={inputClass(false)} value={f.smtpPort} onChange={set('smtpPort')} placeholder="587" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Identifiant"><input className={inputClass(false)} value={f.smtpUser} onChange={set('smtpUser')} autoComplete="off" /></Field>
        <Field label="Mot de passe" hint={s.hasSmtpPass ? 'Un mot de passe est enregistré : laissez vide pour le conserver.' : undefined}>
          <input type="password" className={inputClass(false)} value={f.smtpPass} onChange={set('smtpPass')} autoComplete="new-password" placeholder={s.hasSmtpPass ? '••••••••' : ''} />
        </Field>
      </div>
      <Field label="Expéditeur affiché"><input className={inputClass(false)} value={f.mailFrom} onChange={set('mailFrom')} placeholder="Équipe programme GEA <gea@univ.fr>" /></Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>Enregistrer</Button>
        {s.mailConfigured && (
          <Button variant="ghost" className="text-red-600" onClick={() => run(() => api('PUT', '/api/admin/settings', { smtpHost: '', smtpPass: '' }), 'Envoi des e-mails désactivé.').then(onSaved)}>
            Désactiver l&apos;envoi
          </Button>
        )}
      </div>
      {s.mailConfigured && (
        <div className="flex flex-wrap items-end gap-2 border-t border-black/5 pt-4">
          <div className="min-w-56 flex-1">
            <Field label="Envoyer un message de test à"><input type="email" className={inputClass(false)} value={to} onChange={(e) => setTo(e.target.value)} placeholder="vous@univ.fr" /></Field>
          </div>
          <Button variant="secondary" disabled={!to} onClick={() => run(() => api('POST', '/api/admin/settings/test-email', { to }), `Message de test envoyé à ${to}.`)}>Tester</Button>
        </div>
      )}
    </Section>
  );
}

function OutboxSection({ count }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState(null);
  useEffect(() => {
    if (open && !emails) api('GET', '/api/admin/outbox').then((r) => setEmails(r.emails)).catch(() => setEmails([]));
  }, [open, emails]);
  if (!count) return null;
  return (
    <Section title="Boîte d'envoi" footer="Messages préparés quand l'envoi des e-mails n'était pas configuré. Ils ne sont jamais partis.">
      <button type="button" className="flex w-full items-center justify-between text-left text-[15px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{count} message{count > 1 ? 's' : ''} non envoyé{count > 1 ? 's' : ''}</span>
        <Icon name="chevron" className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-black/5">
          {(emails || []).map((e) => {
            const link = e.text.match(/https?:\/\/\S+\/acces\/\S+/)?.[0];
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.recipient}</span>
                  <span className="block truncate text-[13px] text-slate-500">{e.subject} · {formatDate(e.createdAt, true)}</span>
                </span>
                {link && <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>Copier le lien</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function PasswordSection({ s, run, onSaved }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const mismatch = f.confirm && f.next !== f.confirm;
  if (s.passwordSource === 'env') {
    return <Section title="Mot de passe"><p className="text-[15px] text-slate-600">Le mot de passe est défini dans le fichier de configuration du serveur (ADMIN_PASSWORD).</p></Section>;
  }
  return (
    <Section title="Mot de passe de l'espace équipe programme">
      {s.passwordSource === 'demo' && <Alert tone="warning">Mode démonstration : le mot de passe actuel est « demo ».</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Mot de passe actuel"><input type="password" className={inputClass(false)} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" /></Field>
        <Field label="Nouveau (8 caractères min.)"><input type="password" className={inputClass(false)} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Confirmation" error={mismatch ? 'Ne correspond pas.' : null}><input type="password" className={inputClass(mismatch)} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="new-password" /></Field>
      </div>
      <Button disabled={!f.next || mismatch || f.next.length < 8}
        onClick={() => run(() => api('PUT', '/api/admin/password', { current: f.current, next: f.next }), 'Mot de passe modifié.').then((r) => { if (r) { onSaved(r); setF({ current: '', next: '', confirm: '' }); } })}>
        Changer le mot de passe
      </Button>
    </Section>
  );
}

function AboutSection({ s }) {
  const [desktop, setDesktop] = useState(null);
  useEffect(() => {
    window.desktop?.info().then(setDesktop);
  }, []);
  return (
    <Section title="À propos"
      footer={desktop ? 'Les mises à jour se téléchargent automatiquement et s’installent au redémarrage. Vos données et une sauvegarde par lancement sont conservées dans le dossier utilisateur (menu Fichier).' : undefined}>
      <div className="flex items-center gap-3">
        <img src="/icon-64.png" alt="" className="size-12 rounded-[12px]" />
        <div className="flex-1">
          <p className="text-[17px] font-semibold">Vœux enseignants</p>
          <p className="text-[13px] text-slate-500">Version {s.version}{desktop ? ` · logiciel de bureau (${{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[desktop.platform] || desktop.platform})` : ' · version web'}</p>
        </div>
        {desktop && <Button size="sm" variant="secondary" onClick={() => window.desktop.checkUpdates()}>Rechercher une mise à jour</Button>}
      </div>
    </Section>
  );
}

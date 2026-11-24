/**
 * Formulaire enseignant multi-étapes.
 *
 * - Le profil (e-mail de contact + téléphone) est obligatoire avant tout le reste.
 * - Chaque modification est enregistrée automatiquement en brouillon (1,2 s après la dernière frappe).
 * - Les règles de validation sont celles de shared/schemas.js, exécutées ici pour guider
 *   l'enseignant et à nouveau côté serveur lors de la soumission.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, formatDate, formatTime } from '../api.js';
import { normalizeDraft, validateSubmission } from '@shared/schemas.js';
import { Alert, Button, CenteredPage, Card, IssueList, Spinner } from '../components/ui.jsx';
import StepProfile from '../components/wizard/StepProfile.jsx';
import StepStatus from '../components/wizard/StepStatus.jsx';
import StepWishes from '../components/wizard/StepWishes.jsx';
import StepAvailability from '../components/wizard/StepAvailability.jsx';
import StepOrganisation from '../components/wizard/StepOrganisation.jsx';
import StepReview from '../components/wizard/StepReview.jsx';

export const STEPS = [
  { key: 'profile', label: 'Profil', title: 'Vos coordonnées' },
  { key: 'status', label: 'Statut', title: 'Votre statut' },
  { key: 'wishes', label: 'Vœux', title: 'Vos vœux d’enseignement' },
  { key: 'availability', label: 'Disponibilités', title: 'Vos disponibilités hebdomadaires' },
  { key: 'organisation', label: 'Organisation', title: 'Vos préférences d\u2019organisation' },
  { key: 'review', label: 'Validation', title: 'Vérifier et envoyer' },
];

const AUTOSAVE_DELAY = 1200;

export default function TeacherWizard() {
  const [ctx, setCtx] = useState(null); // { teacher, profileComplete, campaign, courses, response }
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState('profile');
  const [shownErrors, setShownErrors] = useState({}); // étapes dont on affiche les erreurs
  const [save, setSave] = useState({ state: 'idle', at: null });
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverIssues, setServerIssues] = useState(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;
  const baseRef = useRef(null); // version de la fiche sur le serveur (détection des conflits entre onglets)

  /* ---------- Chargement ---------- */

  useEffect(() => {
    api('GET', '/api/teacher/me')
      .then((data) => {
        setCtx(data);
        setDraft(normalizeDraft(data.response.draft || {}));
        setSave({ state: 'idle', at: data.response.updatedAt });
        baseRef.current = data.response.updatedAt;
        if (data.response.state === 'submitted') setStep('review');
        else if (data.profileComplete && !data.response.draft) setStep('status');
        else if (data.profileComplete) {
          // Reprise : première étape encore incomplète, sinon la validation.
          const d = normalizeDraft(data.response.draft);
          const { errors } = validateSubmission(d, { config: data.campaign.config, courses: data.courses, profile: null });
          const first = ['status', 'wishes', 'availability', 'organisation'].find((k) => errors.some((e) => e.step === k));
          setStep(first || 'review');
        }
      })
      .catch((e) => setLoadError(e.status === 401 ? 'session' : 'other'));
  }, []);

  const submitted = ctx?.response.state === 'submitted';
  const closed = ctx && !ctx.campaign.isOpen;
  const readOnly = closed || (submitted && !editing);

  /* ---------- Enregistrement automatique ---------- */

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    setSave((s) => ({ ...s, state: 'saving' }));
    try {
      const r = await api('PUT', '/api/teacher/draft', { ...draftRef.current, baseUpdatedAt: baseRef.current });
      baseRef.current = r.updatedAt;
      setSave({ state: 'saved', at: r.updatedAt });
      setCtx((c) => ({ ...c, response: { ...c.response, state: r.state, updatedAt: r.updatedAt } }));
      return true;
    } catch (e) {
      dirty.current = true;
      setSave((s) => ({ ...s, state: e.status === 401 ? 'session' : e.status === 409 ? 'conflict' : 'error' }));
      return false;
    }
  }, []);

  const update = useCallback(
    (patch) => {
      setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) }));
      dirty.current = true;
      setServerIssues(null);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DELAY);
    },
    [flush]
  );

  useEffect(() => {
    const warn = (e) => {
      if (dirty.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flush]);

  /* ---------- Validation ---------- */

  const validation = useMemo(() => {
    if (!ctx || !draft) return { errors: [], warnings: [] };
    return validateSubmission(draft, { config: ctx.campaign.config, courses: ctx.courses, profile: null });
  }, [ctx, draft]);

  const issuesFor = (key, kind = 'errors') => validation[kind].filter((i) => i.step === key);

  /* ---------- Navigation ---------- */

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function goTo(key, { force = false } = {}) {
    if (!force && key !== 'profile' && !ctx.profileComplete) return;
    flush();
    setStep(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const errorsRef = useRef(null);
  function next() {
    if (!readOnly && issuesFor(step).length) {
      setShownErrors((s) => ({ ...s, [step]: true }));
      // Ramène l'enseignant sur le récapitulatif des erreurs (haut de page) au lieu de ne rien faire.
      requestAnimationFrame(() => errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    goTo(STEPS[stepIndex + 1].key);
  }

  async function submit() {
    setShownErrors(Object.fromEntries(STEPS.map((s) => [s.key, true])));
    if (validation.errors.length) return;
    setSubmitting(true);
    setServerIssues(null);
    try {
      if (!(await flush())) throw new Error('save');
      if (ctx.response.state !== 'draft' && ctx.response.state !== 'submitted') {
        // Rien n'a encore été enregistré (formulaire validé sans modification) : on force un brouillon.
        const r0 = await api('PUT', '/api/teacher/draft', { ...draftRef.current, baseUpdatedAt: baseRef.current });
        baseRef.current = r0.updatedAt;
      }
      const r = await api('POST', '/api/teacher/submit');
      baseRef.current = r.submittedAt;
      setCtx((c) => ({ ...c, response: { ...c.response, state: 'submitted', submittedAt: r.submittedAt } }));
      setEditing(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setServerIssues(e.body?.errors || [{ message: 'L’envoi a échoué. Vérifiez votre connexion et réessayez.' }]);
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await flush();
    await api('POST', '/api/auth/logout').catch(() => {});
    window.location.href = '/';
  }

  /* ---------- Rendu ---------- */

  if (loadError) {
    return (
      <CenteredPage>
        <Alert tone="error" title={loadError === 'session' ? 'Session expirée ou absente' : 'Chargement impossible'}>
          {loadError === 'session'
            ? 'Rouvrez le lien personnel reçu par e-mail pour accéder à votre formulaire.'
            : 'Rechargez la page dans quelques instants.'}
        </Alert>
      </CenteredPage>
    );
  }
  if (!ctx || !draft) {
    return (
      <CenteredPage>
        <div className="flex items-center justify-center gap-3 text-slate-600"><Spinner /> Chargement…</div>
      </CenteredPage>
    );
  }

  const { teacher, campaign, courses } = ctx;
  const config = campaign.config;
  const current = STEPS[stepIndex];
  const stepProps = { draft, update, config, courses, readOnly, showErrors: !!shownErrors[step] };

  return (
    <div className="min-h-dvh pb-28">
      {/* En-tête */}
      <header className="ios-bar hairline-b sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{campaign.label}</p>
            <p className="truncate text-xs text-slate-600">
              <span className="hidden sm:inline">{teacher.firstName} {teacher.lastName} · </span>
              avant le {new Date(campaign.closesAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              <SaveIndicator save={save} />
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={logout}>Quitter</Button>
          </div>
        </div>
        <Stepper current={step} onSelect={goTo} locked={!ctx.profileComplete} validation={shownErrors} issuesFor={issuesFor} />
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {closed && (
          <Alert tone="warning" title="La campagne est close">
            Vous pouvez consulter vos réponses, mais plus les modifier. Contactez l&apos;équipe programme si nécessaire.
          </Alert>
        )}
        {submitted && !editing && !closed && (
          <Alert tone="success" title={`Réponse envoyée le ${formatDate(ctx.response.submittedAt, true)}`}>
            <p>Un e-mail de confirmation vous a été envoyé. Vous pouvez encore modifier vos vœux jusqu&apos;au {formatDate(campaign.closesAt)}.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>Modifier ma réponse</Button>
          </Alert>
        )}
        {ctx.response.state === 'draft' && ctx.response.submittedAt && !closed && (
          <Alert tone="warning" title="Modifications non envoyées">
            Votre réponse du {formatDate(ctx.response.submittedAt)} a été modifiée : elle n&apos;est plus prise en compte par l&apos;équipe programme
            tant que vous ne l&apos;avez pas renvoyée à l&apos;étape « Validation ».
            {step !== 'review' && (
              <Button size="sm" variant="secondary" className="mt-2 ml-0 block" onClick={() => goTo('review')}>Aller à la validation</Button>
            )}
          </Alert>
        )}
        {save.state === 'conflict' && (
          <Alert tone="error" title="Fiche modifiée ailleurs">
            Votre fiche a été modifiée dans un autre onglet ou sur un autre appareil. Rechargez la page pour repartir de la dernière version enregistrée.
            <Button size="sm" variant="secondary" className="mt-2 block" onClick={() => window.location.reload()}>Recharger</Button>
          </Alert>
        )}
        {save.state === 'session' && (
          <Alert tone="error" title="Session expirée">Rouvrez le lien reçu par e-mail : vos dernières modifications n&apos;ont pas pu être enregistrées.</Alert>
        )}

        <div>
          <p className="text-[13px] font-semibold tracking-wide text-slate-600 uppercase">Étape {stepIndex + 1} sur {STEPS.length}</p>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight sm:text-[34px]">{current.title}</h1>
        </div>

        {step !== 'profile' && step !== 'review' && shownErrors[step] && !readOnly && issuesFor(step).length > 0 && (
          <div ref={errorsRef}>
            <IssueList issues={issuesFor(step)} />
          </div>
        )}

        {step === 'profile' && (
          <StepProfile
            teacher={teacher}
            onSaved={(t) => {
              const first = !ctx.profileComplete;
              setCtx((c) => ({ ...c, teacher: t, profileComplete: true }));
              if (first) goTo('status', { force: true }); // ctx n'est pas encore mis à jour ici
            }}
            locked={closed}
          />
        )}
        {step === 'status' && <StepStatus {...stepProps} />}
        {step === 'wishes' && <StepWishes {...stepProps} rooms={ctx.rooms || []} issues={issuesFor('wishes')} />}
        {step === 'availability' && <StepAvailability {...stepProps} />}
        {step === 'organisation' && <StepOrganisation {...stepProps} />}
        {step === 'review' && (
          <StepReview
            {...stepProps}
            teacher={teacher}
            validation={validation}
            onEdit={(key) => {
              if (submitted && !closed) setEditing(true);
              goTo(key);
            }}
          />
        )}

        {serverIssues && <IssueList issues={serverIssues} />}
      </main>

      {/* Barre de navigation fixe en bas (pratique sur mobile) */}
      {ctx.profileComplete && step !== 'profile' && (
        <nav className="ios-bar hairline-t fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <Button variant="secondary" onClick={() => goTo(STEPS[stepIndex - 1].key)}>Précédent</Button>
            {step === 'review' ? (
              !readOnly && (
                <Button size="lg" onClick={submit} disabled={submitting}>
                  {submitting ? 'Envoi…' : submitted ? 'Envoyer de nouveau' : 'Envoyer mes vœux'}
                </Button>
              )
            ) : (
              <Button onClick={next}>Suivant</Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Indicateur d'enregistrement du brouillon, visible aussi sur téléphone. */
function SaveIndicator({ save }) {
  const map = {
    saving: ['Enregistrement…', 'text-slate-600'],
    saved: [`✓ Enregistré à ${save.at ? formatTime(save.at) : ''}`, 'text-emerald-700'],
    error: ['Non enregistré — nouvel essai à la prochaine modification', 'text-red-700'],
    session: ['Session expirée', 'text-red-700'],
    conflict: ['Non enregistré — fiche modifiée ailleurs', 'text-red-700'],
    idle: [save.at ? `✓ Brouillon du ${formatDate(save.at)}` : '', 'text-slate-600'],
  };
  const [label, color] = map[save.state];
  if (!label) return null;
  return <span className={`font-medium ${color}`} aria-live="polite"> · {label}</span>;
}

function Stepper({ current, onSelect, locked, validation, issuesFor }) {
  return (
    <ol className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-3" aria-label="Étapes du formulaire">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const disabled = locked && s.key !== 'profile';
        const hasError = validation[s.key] && issuesFor(s.key).length > 0;
        return (
          <li key={s.key} className={`min-w-0 ${active ? 'flex-[3] sm:flex-1' : 'flex-1'}`}>
            <button
              onClick={() => onSelect(s.key)}
              disabled={disabled}
              aria-current={active ? 'step' : undefined}
              className={`min-h-11 w-full border-t-4 pt-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:text-slate-400 ${
                hasError ? 'border-red-600 text-red-700' : active ? 'border-blue-900 text-blue-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="block whitespace-nowrap">
                <span className="sm:hidden">{active ? `${i + 1}. ${s.label}` : i + 1}</span>
                <span className="hidden sm:inline">{i + 1}. {s.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

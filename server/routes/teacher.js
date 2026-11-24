/**
 * Espace enseignant (session ouverte par lien unique).
 *   GET  /api/teacher/me        profil, campagne (avec groupes), catalogue, salles, réponse
 *   PUT  /api/teacher/profile   e-mail de contact + téléphone
 *   PUT  /api/teacher/draft     enregistrement automatique du brouillon
 *   POST /api/teacher/submit    validation finale côté serveur + e-mail de confirmation
 */
import { Router } from 'express';
import { requireTeacher } from '../middleware/requireTeacher.js';
import { profileSchema, draftSchema, validateSubmission } from '../../shared/schemas.js';
import * as R from '../lib/responses.js';
import { sendMail, submissionConfirmationEmail } from '../lib/mailer.js';

const router = Router();
router.use(requireTeacher);

const zodIssues = (error) => error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
const load = (req) => ({ teacher: R.getTeacher(req.teacherId), campaign: R.getCampaign(req.campaignId) });

router.get('/me', (req, res) => {
  const { teacher, campaign } = load(req);
  if (!teacher || !campaign) return res.status(404).json({ error: 'not_found' });
  res.json({
    teacher,
    profileComplete: R.isProfileComplete(teacher),
    campaign,
    courses: R.getCourses(campaign.id),
    // Salles : on ne transmet que ce qui sert à la proposition (pas de notes internes).
    rooms: R.getRooms(campaign.id).map(({ note, ...r }) => r),
    response: R.getResponse(teacher.id, campaign.id),
  });
});

router.put('/profile', (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'validation', issues: zodIssues(parsed.error) });
  R.updateProfile(req.teacherId, parsed.data);
  const teacher = R.getTeacher(req.teacherId);
  res.json({ teacher, profileComplete: R.isProfileComplete(teacher) });
});

router.put('/draft', (req, res) => {
  const { teacher, campaign } = load(req);
  if (!campaign.isOpen) return res.status(403).json({ error: 'campaign_closed' });
  if (!R.isProfileComplete(teacher)) return res.status(409).json({ error: 'profile_incomplete' });
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'validation', issues: zodIssues(parsed.error) });
  const courseIds = new Set(R.getCourses(campaign.id).map((c) => c.id));
  if ((parsed.data.wishes ?? []).some((w) => !courseIds.has(w.courseId))) {
    return res.status(422).json({ error: 'validation', issues: [{ field: 'wishes', message: 'Enseignement inconnu.' }] });
  }
  const updatedAt = R.saveDraft(teacher.id, campaign.id, parsed.data, campaign.config);
  res.json({ ok: true, state: 'draft', updatedAt });
});

router.post('/submit', async (req, res) => {
  const { teacher, campaign } = load(req);
  if (!campaign.isOpen) return res.status(403).json({ error: 'campaign_closed' });
  const response = R.getResponse(teacher.id, campaign.id);
  if (!response.draft) return res.status(422).json({ error: 'validation', errors: [{ step: 'wishes', message: 'Formulaire vide.' }] });
  const courses = R.getCourses(campaign.id);
  const { errors, warnings } = validateSubmission(response.draft, {
    config: campaign.config,
    courses,
    profile: { contactEmail: teacher.contactEmail ?? '', phone: teacher.phone ?? '' },
  });
  if (errors.length) return res.status(422).json({ error: 'validation', errors, warnings });
  const submittedAt = R.markSubmitted(teacher.id, campaign.id);
  const mail = submissionConfirmationEmail({
    teacher: { first_name: teacher.firstName },
    campaign: { label: campaign.label, closes_at: campaign.closesAt },
    summary: R.summarize(response.draft, courses, campaign.config),
  });
  await sendMail({ teacherId: teacher.id, kind: 'confirmation', to: teacher.contactEmail || teacher.email, ...mail });
  res.json({ ok: true, state: 'submitted', submittedAt, warnings });
});

export default router;

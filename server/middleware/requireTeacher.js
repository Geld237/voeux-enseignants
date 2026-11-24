import { getSession, SESSION_COOKIE } from '../lib/sessions.js';

/** Vérifie la session enseignant et expose req.teacherId / req.campaignId. */
export function requireTeacher(req, res, next) {
  const session = getSession(req.cookies?.[SESSION_COOKIE]);
  if (!session || session.role !== 'teacher') return res.status(401).json({ error: 'not_authenticated' });
  req.teacherId = session.teacher_id;
  req.campaignId = session.campaign_id;
  next();
}

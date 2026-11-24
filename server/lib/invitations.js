import { db } from '../db/connection.js';
import { issueToken } from './tokens.js';
import { sendMail, invitationEmail } from './mailer.js';

/** Génère un nouveau lien (l'ancien est révoqué) et envoie l'invitation à chaque enseignant. */
export async function inviteTeachers(campaign, teacherIds) {
  let sent = 0;
  for (const id of teacherIds) {
    const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
    if (!t) continue;
    const { url, expiresAt } = issueToken({ teacherId: t.id, campaignId: campaign.id });
    const mail = invitationEmail({ teacher: t, campaign: { label: campaign.label, closes_at: campaign.closesAt }, url, expiresAt });
    if (await sendMail({ teacherId: t.id, kind: 'invitation', to: t.email, ...mail })) sent += 1;
  }
  return sent;
}

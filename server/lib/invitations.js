import { db } from '../db/connection.js';
import { issueToken } from './tokens.js';
import { sendMail, invitationEmail } from './mailer.js';

/**
 * Envoie (ou met dans la boîte d'envoi si l'e-mail n'est pas configuré) une invitation avec un lien
 * personnel. Les liens déjà transmis restent valables.
 * @returns {{ sent: number, queued: number, failed: number }}
 */
export async function inviteTeachers(campaign, teacherIds) {
  const result = { sent: 0, queued: 0, failed: 0 };
  for (const id of teacherIds) {
    const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
    if (!t) continue;
    const { url, expiresAt } = issueToken({ teacherId: t.id, campaignId: campaign.id, revokePrevious: false });
    const mail = invitationEmail({ teacher: t, campaign: { label: campaign.label, closes_at: campaign.closesAt }, url, expiresAt });
    const status = await sendMail({ teacherId: t.id, kind: 'invitation', to: t.email, ...mail });
    result[status || 'failed'] += 1;
  }
  return result;
}

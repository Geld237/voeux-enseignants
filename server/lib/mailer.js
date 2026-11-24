/**
 * Envoi d'e-mails. Sans SMTP_HOST (mode démo), les messages ne partent pas :
 * ils sont stockés dans dev_outbox, consultables sur /demo/boite, et affichés dans la console.
 * Dans les deux cas, chaque envoi est tracé dans email_log.
 */
import nodemailer from 'nodemailer';
import { db } from '../db/connection.js';

export const devMode = !process.env.SMTP_HOST;

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export async function sendMail({ teacherId = null, kind, to, subject, text, html }) {
  const log = db.prepare('INSERT INTO email_log (teacher_id, kind, recipient, subject, status, error) VALUES (?, ?, ?, ?, ?, ?)');
  try {
    if (devMode) {
      db.prepare(
        `INSERT INTO dev_outbox (teacher_id, kind, recipient, subject, body_text, body_html)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(teacherId, kind, to, subject, text, html ?? null);
      console.log(`[e-mail démo] ${kind} → ${to} : ${subject}`);
    } else {
      await getTransport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    }
    log.run(teacherId, kind, to, subject, 'sent', null);
    return true;
  } catch (err) {
    log.run(teacherId, kind, to, subject, 'failed', String(err.message || err));
    console.error(`Échec d'envoi à ${to} :`, err.message);
    return false;
  }
}

export function invitationEmail({ teacher, campaign, url, expiresAt }) {
  const subject = `Vos vœux d'enseignement — ${campaign.label}`;
  const text = `Bonjour ${teacher.first_name} ${teacher.last_name},

L'équipe programme prépare les emplois du temps du semestre « ${campaign.label} ».
Merci de renseigner vos vœux d'enseignement et vos disponibilités avant le ${fmtDate(campaign.closes_at)}.

Votre lien personnel (ne le transférez pas) :
${url}

Ce lien est valable jusqu'au ${fmtDate(expiresAt)}. Vous pouvez l'utiliser plusieurs fois :
vos réponses sont enregistrées automatiquement en brouillon.

Merci,
L'équipe programme`;
  const html = `<p>Bonjour ${escapeHtml(teacher.first_name)} ${escapeHtml(teacher.last_name)},</p>
<p>L'équipe programme prépare les emplois du temps du semestre « ${escapeHtml(campaign.label)} ».
Merci de renseigner vos vœux d'enseignement et vos disponibilités avant le <strong>${fmtDate(campaign.closes_at)}</strong>.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Remplir ma fiche de vœux</a></p>
<p style="color:#64748b;font-size:13px">Lien personnel, valable jusqu'au ${fmtDate(expiresAt)}. Ne le transférez pas.</p>
<p>Merci,<br>L'équipe programme</p>`;
  return { subject, text, html };
}

export function submissionConfirmationEmail({ teacher, campaign, summary }) {
  const subject = `Vœux reçus — ${campaign.label}`;
  const text = `Bonjour ${teacher.first_name},

Nous avons bien reçu vos vœux et disponibilités pour « ${campaign.label} ».

${summary}

Vous pouvez encore les modifier jusqu'au ${fmtDate(campaign.closes_at)} avec le lien reçu
précédemment ; pensez alors à soumettre de nouveau.

L'équipe programme`;
  return { subject, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>` };
}

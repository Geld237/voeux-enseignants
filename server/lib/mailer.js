/**
 * Envoi d'e-mails. Sans serveur SMTP configuré (onglet « Réglages » ou .env), les messages ne partent pas :
 * ils sont stockés dans dev_outbox (boîte d'envoi), et l'équipe peut copier les liens à la main.
 * Dans les deux cas, chaque envoi est tracé dans email_log.
 */
import nodemailer from 'nodemailer';
import { db } from '../db/connection.js';
import { getSetting, mailConfigured } from './settings.js';

// Transport recréé à chaque envoi : les réglages peuvent changer pendant que l'application tourne.
function getTransport() {
  const port = Number(getSetting('smtpPort') || 587);
  const user = getSetting('smtpUser');
  return nodemailer.createTransport({
    host: getSetting('smtpHost'),
    port,
    secure: port === 465,
    auth: user ? { user, pass: getSetting('smtpPass') || '' } : undefined,
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export async function sendMail({ teacherId = null, kind, to, subject, text, html }) {
  const log = db.prepare('INSERT INTO email_log (teacher_id, kind, recipient, subject, status, error) VALUES (?, ?, ?, ?, ?, ?)');
  try {
    if (!mailConfigured()) {
      db.prepare(
        `INSERT INTO dev_outbox (teacher_id, kind, recipient, subject, body_text, body_html)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(teacherId, kind, to, subject, text, html ?? null);
      console.log(`[e-mail non envoyé — boîte d'envoi] ${kind} → ${to} : ${subject}`);
    } else {
      await getTransport().sendMail({ from: getSetting('mailFrom') || getSetting('smtpUser'), to, subject, text, html });
    }
    log.run(teacherId, kind, to, subject, mailConfigured() ? 'sent' : 'queued', null);
    return mailConfigured() ? 'sent' : 'queued';
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

/** Envoie un message de test (onglet « Réglages »). Lève une erreur lisible en cas d'échec. */
export async function sendTestEmail(to) {
  if (!mailConfigured()) throw new Error('Aucun serveur SMTP renseigné.');
  await getTransport().sendMail({
    from: getSetting('mailFrom') || getSetting('smtpUser'),
    to,
    subject: 'Test — Vœux et disponibilités',
    text: 'Ce message confirme que l\'envoi des e-mails fonctionne.',
  });
}

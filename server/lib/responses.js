/**
 * Lecture / écriture des réponses enseignants.
 * Le format échangé avec le navigateur est celui de emptyDraft() (shared/schemas.js).
 */
import { db, nowIso } from '../db/connection.js';
import {
  normalizeDraft, sessionsPerGroup, equivalentTD, formatWeeks, fmtH, availabilityStats,
} from '../../shared/schemas.js';

/* ---------- Campagnes et catalogue ---------- */

export function getCampaign(id) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!row) return null;
  const now = nowIso();
  const config = JSON.parse(row.config);
  // Les groupes sont gérés dans leur propre table (onglet « Groupes ») et injectés ici.
  config.groupList = getGroups(row.id);
  return {
    id: row.id,
    label: row.label,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isOpen: row.opens_at <= now && now < row.closes_at,
    config,
  };
}

/* ---------- Groupes et salles ---------- */

export function getGroups(campaignId) {
  return db
    .prepare(
      `SELECT g.id, g.semester, g.name, g.type, g.parcours, g.parent_id AS parentId, p.name AS parentName, g.size, g.sort
         FROM groups g LEFT JOIN groups p ON p.id = g.parent_id
        WHERE g.campaign_id = ? ORDER BY g.semester, g.sort, g.name`
    )
    .all(campaignId)
    .map((g) => ({ ...g }));
}

export function getRooms(campaignId) {
  return db
    .prepare('SELECT id, name, kind, capacity, features, busy, note FROM rooms WHERE campaign_id = ? ORDER BY kind, name')
    .all(campaignId)
    .map((r) => ({ ...r, features: JSON.parse(r.features), busy: JSON.parse(r.busy) }));
}

export function getCurrentCampaign() {
  const row = db.prepare('SELECT id FROM campaigns ORDER BY opens_at DESC, id DESC LIMIT 1').get();
  return row ? getCampaign(row.id) : null;
}

export function getCourses(campaignId) {
  return db
    .prepare(
      `SELECT id, code, apogee_code AS apogee, title, semester, parcours, kind,
              pn_cm AS pnCm, pn_td AS pnTd, pn_tp AS pnTp, to_confirm AS toConfirm
         FROM courses WHERE campaign_id = ?
        ORDER BY semester, parcours IS NOT NULL, parcours, kind, code`
    )
    .all(campaignId)
    .map((c) => ({ ...c, toConfirm: Boolean(c.toConfirm) }));
}

/* ---------- Enseignant ---------- */

export function getTeacher(id) {
  const t = db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
  if (!t) return null;
  return {
    id: t.id,
    firstName: t.first_name,
    lastName: t.last_name,
    email: t.email,
    contactEmail: t.contact_email,
    phone: t.phone,
  };
}

export function updateProfile(teacherId, { contactEmail, phone }) {
  db.prepare('UPDATE teachers SET contact_email = ?, phone = ?, updated_at = ? WHERE id = ?').run(
    contactEmail,
    phone,
    nowIso(),
    teacherId
  );
}

export const isProfileComplete = (t) => Boolean(t?.contactEmail && t?.phone);

/* ---------- Réponse ---------- */

/**
 * Retire d'une fiche les enseignements qui n'existent plus dans le catalogue de la campagne
 * (ressource supprimée par l'équipe programme), ainsi que les références « à placer après » vers eux.
 */
export function sanitizeDraft(draft, campaignId) {
  const ids = new Set(db.prepare('SELECT id FROM courses WHERE campaign_id = ?').all(campaignId).map((c) => c.id));
  const wishes = (draft.wishes || [])
    .filter((w) => ids.has(w.courseId))
    .map((w) => (w.afterCourseId && !ids.has(w.afterCourseId) ? { ...w, afterCourseId: null } : w));
  return { ...draft, wishes };
}

export function getResponse(teacherId, campaignId) {
  const r = db.prepare('SELECT * FROM responses WHERE teacher_id = ? AND campaign_id = ?').get(teacherId, campaignId);
  if (!r) return { state: 'not_started', submittedAt: null, updatedAt: null, draft: null };
  return {
    state: r.state,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
    draft: sanitizeDraft(normalizeDraft(JSON.parse(r.data || '{}')), campaignId),
  };
}

/** Après suppression d'une ressource : nettoie toutes les fiches de la campagne (JSON et vue à plat). */
export function purgeCourseFromResponses(campaignId, courseId) {
  const rows = db.prepare('SELECT id, data FROM responses WHERE campaign_id = ?').all(campaignId);
  for (const r of rows) {
    const d = JSON.parse(r.data || '{}');
    if (!(d.wishes || []).some((w) => w.courseId === courseId || w.afterCourseId === courseId)) continue;
    const cleaned = {
      ...d,
      wishes: d.wishes.filter((w) => w.courseId !== courseId).map((w) => (w.afterCourseId === courseId ? { ...w, afterCourseId: null } : w)),
    };
    db.prepare('UPDATE responses SET data = ? WHERE id = ?').run(JSON.stringify(cleaned), r.id);
  }
}

/**
 * Enregistre un brouillon complet. La fiche est stockée telle quelle (JSON) et « mise à plat »
 * dans wishes (une ligne par CM/TD/TP) et availabilities, pour le tableau de bord et l'export.
 * Si la réponse avait été soumise, elle repasse en brouillon.
 */
export function saveDraft(teacherId, campaignId, draft, config) {
  const validDays = new Set(config.days.map((d) => d.key));
  const validSlots = new Set(config.slots);
  const now = nowIso();
  const data = normalizeDraft(draft);

  return db.transaction(() => {
    db.prepare(
      `INSERT INTO responses (teacher_id, campaign_id, state, updated_at)
       VALUES (?, ?, 'draft', ?)
       ON CONFLICT (teacher_id, campaign_id) DO NOTHING`
    ).run(teacherId, campaignId, now);

    const { id: responseId } = db
      .prepare('SELECT id FROM responses WHERE teacher_id = ? AND campaign_id = ?')
      .get(teacherId, campaignId);

    db.prepare(`UPDATE responses SET state = 'draft', teacher_status = ?, data = ?, updated_at = ? WHERE id = ?`).run(
      data.teacherStatus ?? null,
      JSON.stringify(data),
      now,
      responseId
    );

    db.prepare('DELETE FROM wishes WHERE response_id = ?').run(responseId);
    const insWish = db.prepare(
      `INSERT INTO wishes (response_id, course_id, priority, type, groups, any_groups, hours_per_group,
                           session_length, sessions, rhythm, weeks, any_weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    data.wishes.forEach((w, i) => {
      for (const iv of w.interventions) {
        insWish.run(
          responseId, w.courseId, i + 1, iv.type, JSON.stringify(iv.groups), iv.anyGroups ?? null,
          iv.hoursPerGroup || 0, iv.sessionLength || 0, sessionsPerGroup(iv), iv.rhythm,
          JSON.stringify(iv.weeks), iv.anyWeeks ? 1 : 0
        );
      }
    });

    db.prepare('DELETE FROM availabilities WHERE response_id = ?').run(responseId);
    const insAvail = db.prepare('INSERT INTO availabilities (response_id, day, slot, level) VALUES (?, ?, ?, ?)');
    for (const [key, level] of Object.entries(data.availability ?? {})) {
      const [day, slot] = key.split('|');
      if (validDays.has(day) && validSlots.has(slot)) insAvail.run(responseId, day, slot, level);
    }
    return now;
  })();
}

export function markSubmitted(teacherId, campaignId) {
  const now = nowIso();
  db.prepare(
    `UPDATE responses SET state = 'submitted', submitted_at = ?, updated_at = ?
      WHERE teacher_id = ? AND campaign_id = ?`
  ).run(now, now, teacherId, campaignId);
  return now;
}

/** Résumé texte d'une réponse, pour l'e-mail de confirmation. */
export function summarize(draft, courses, config) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const status = config.statuses.find((s) => s.value === draft.teacherStatus);
  const lines = [`Statut : ${status?.label ?? '—'}`, '', 'Vœux (par ordre de priorité) :'];
  draft.wishes.forEach((w, i) => {
    const c = byId.get(w.courseId);
    lines.push(`  ${i + 1}. ${c?.code} — ${c?.title}`);
    for (const iv of w.interventions) {
      const groups = iv.type === 'CM' ? 'promotion' : iv.groups.length ? iv.groups.join(', ') : `${iv.anyGroups} groupe(s), indifférent`;
      const weeks = iv.anyWeeks ? 'semaines indifférentes' : formatWeeks(iv.weeks, config);
      lines.push(`     ${iv.type} : ${fmtH(iv.hoursPerGroup)} × ${groups} — séances de ${fmtH(iv.sessionLength)} — ${weeks}`);
    }
  });
  lines.push('', `Total : ${fmtH(equivalentTD(draft.wishes, config.coefficients))} éq. TD`);
  const st = availabilityStats(draft.availability, config);
  lines.push(`Créneaux préférés : ${st.preferred} · à éviter : ${st.avoid} · impossibles : ${st.unavailable}`);
  if (draft.exceptions.length) lines.push(`Absences signalées : ${draft.exceptions.length}`);
  return lines.join('\n');
}

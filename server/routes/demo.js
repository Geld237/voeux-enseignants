/**
 * Outils du mode démo (actifs seulement sans SMTP_HOST).
 *   GET  /api/demo/status   GET /api/demo/outbox   POST /api/demo/invite   POST /api/demo/reset
 */
import { Router } from 'express';
import { db } from '../db/connection.js';
import { devMode } from '../lib/mailer.js';
import { getCurrentCampaign } from '../lib/responses.js';
import { inviteTeachers } from '../lib/invitations.js';
import { reset, seed } from '../db/seed.js';

const router = Router();
router.get('/status', (_req, res) => res.json({ demo: devMode }));
router.use((_req, res, next) => (devMode ? next() : res.status(404).json({ error: 'not_found' })));

router.get('/outbox', (_req, res) => {
  const emails = db
    .prepare(`SELECT id, kind, recipient, subject, body_text AS text, created_at AS createdAt FROM dev_outbox ORDER BY id DESC LIMIT 200`)
    .all();
  res.json({ emails });
});

router.post('/invite', async (_req, res) => {
  const campaign = getCurrentCampaign();
  if (!campaign) return res.status(404).json({ error: 'no_campaign' });
  const ids = db.prepare('SELECT id FROM teachers').all().map((t) => t.id);
  res.json({ ok: true, sent: await inviteTeachers(campaign, ids) });
});

router.post('/reset', (_req, res) => {
  reset();
  seed();
  res.json({ ok: true });
});

export default router;

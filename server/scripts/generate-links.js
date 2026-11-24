/** Affiche un lien unique par enseignant pour la campagne courante.  npm run links */
import { db } from '../db/connection.js';
import { seedIfEmpty } from '../db/seed.js';
import { issueToken } from '../lib/tokens.js';
import { getCurrentCampaign } from '../lib/responses.js';

seedIfEmpty();
const campaign = getCurrentCampaign();
console.log(`Campagne : ${campaign.label}\n`);
for (const t of db.prepare('SELECT * FROM teachers ORDER BY last_name').all()) {
  const { url } = issueToken({ teacherId: t.id, campaignId: campaign.id });
  console.log(`${t.first_name} ${t.last_name}`.padEnd(24), url);
}

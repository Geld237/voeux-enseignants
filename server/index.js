import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './db/connection.js';
import { seedIfEmpty, ensureSetup } from './db/seed.js';
import { devMode } from './lib/mailer.js';
import { purgeExpiredSessions } from './lib/sessions.js';
import authRoutes, { adminPassword } from './routes/auth.js';
import teacherRoutes from './routes/teacher.js';
import adminRoutes from './routes/admin.js';
import demoRoutes from './routes/demo.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Aucune réponse de l'API ne doit être mise en cache (données personnelles).
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // En production, Express sert aussi le frontend compilé (npm run build).
  const dist = path.join(projectRoot, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(projectRoot, 'server', 'index.js')) {
  if (devMode && seedIfEmpty()) console.log('Base vide : données de démonstration créées.');
  ensureSetup();
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 3_600_000).unref();

  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => {
    console.log(`API prête sur http://localhost:${port}`);
    if (devMode) console.log('Mode démo : aucun e-mail réel (boîte de démo sur /demo/boite).');
    if (!adminPassword()) console.warn('ADMIN_PASSWORD non défini : l’espace équipe programme est désactivé.');
    else if (devMode && !process.env.ADMIN_PASSWORD) console.log('Espace équipe programme : /admin (mot de passe de démo : demo)');
  });
}

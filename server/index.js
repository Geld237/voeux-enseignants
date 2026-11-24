import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './db/connection.js';
import { seedIfEmpty, ensureSetup } from './db/seed.js';
import { demoMode, isDesktop, appUrl, passwordSource } from './lib/settings.js';
import { purgeExpiredSessions } from './lib/sessions.js';
import authRoutes from './routes/auth.js';
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

/**
 * Démarre le serveur. Utilisé par `npm start` et par le logiciel de bureau (electron/main.cjs).
 * En version bureau, le serveur écoute sur le réseau local pour que les enseignants puissent ouvrir leur lien.
 */
export function startServer({ port = Number(process.env.PORT || 3001), host = isDesktop() ? '0.0.0.0' : undefined } = {}) {
  if (seedIfEmpty({ withTeachers: demoMode() })) console.log('Base vide : campagne initiale créée.');
  ensureSetup();
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 3_600_000).unref();
  return new Promise((resolve, reject) => {
    const server = createApp().listen(port, host, () => {
      console.log(`Application prête sur http://localhost:${port}`);
      console.log(`Liens enseignants : ${appUrl()}/acces/…`);
      if (demoMode()) console.log('Mode démo : aucun e-mail réel (boîte de démo sur /demo/boite), mot de passe « demo ».');
      else if (!passwordSource()) console.log('Premier lancement : créez le mot de passe sur /admin depuis ce poste.');
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(projectRoot, 'server', 'index.js')) {
  startServer();
}

import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite'; // SQLite intégré à Node.js (≥ 22.13) : rien à compiler
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

export const dbPath = path.resolve(projectRoot, process.env.DB_PATH || './data/app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

/**
 * db.transaction(fn) renvoie une fonction qui exécute fn dans une transaction :
 * tout est validé si fn se termine, tout est annulé si elle lève une erreur.
 */
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

/**
 * Version du schéma.
 * - v1 → v2 (fiche de vœux détaillée) : structure incompatible, la base v1 (prototype) est recréée à vide.
 * - v2 → v3 (groupes et salles) : ajout de tables, les données sont conservées.
 */
export const SCHEMA_VERSION = 3;
const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
const hasTables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='campaigns'").get().n > 0;
if (hasTables && currentVersion < 2) {
  console.warn(`Base de données au format v${currentVersion} (prototype) : recréée au format v${SCHEMA_VERSION}.`);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

export const nowIso = () => new Date().toISOString();

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3_600_000);
}

-- Schéma de la base SQLite (version 2). Exécuté à chaque démarrage (idempotent).
-- La version est stockée dans PRAGMA user_version (voir connection.js).

-- Une campagne = un semestre de collecte.
-- config (JSON) : jours, créneaux, statuts, coefficients, règles de validation.
CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY,
  label       TEXT NOT NULL,
  opens_at    TEXT NOT NULL,
  closes_at   TEXT NOT NULL,
  config      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS teachers (
  id             INTEGER PRIMARY KEY,
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE, -- e-mail importé (envoi du lien)
  contact_email  TEXT,                                -- complété par l'enseignant
  phone          TEXT,                                -- complété par l'enseignant
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT
);

-- Liens uniques : seul le hash SHA-256 du token est stocké.
CREATE TABLE IF NOT EXISTS access_tokens (
  id            INTEGER PRIMARY KEY,
  teacher_id    INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tokens_teacher ON access_tokens(teacher_id, campaign_id);

-- Sessions ouvertes après échange d'un lien (enseignant) ou connexion (admin).
CREATE TABLE IF NOT EXISTS sessions (
  id_hash      TEXT PRIMARY KEY,
  role         TEXT NOT NULL CHECK (role IN ('teacher','admin')),
  teacher_id   INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
  campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Catalogue des ressources et SAÉ de la campagne.
-- pn_* : volumes du programme par groupe (NULL = non renseigné, pas de contrôle de dépassement).
CREATE TABLE IF NOT EXISTS courses (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,             -- code programme : R3.GC2F.11, SAÉ 1.01…
  apogee_code  TEXT,                      -- code Apogée / Hyperplanning : VGFR311…
  title        TEXT NOT NULL,
  semester     TEXT NOT NULL,             -- S1, S3, S5
  parcours     TEXT,                      -- GC2F, CG2P, GPRH, GEMA ou NULL (tronc commun)
  kind         TEXT NOT NULL DEFAULT 'R' CHECK (kind IN ('R','SAE')),
  pn_cm        REAL,
  pn_td        REAL,
  pn_tp        REAL,
  to_confirm   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, code)
);

-- Une réponse par enseignant et par campagne.
CREATE TABLE IF NOT EXISTS responses (
  id               INTEGER PRIMARY KEY,
  teacher_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  state            TEXT NOT NULL DEFAULT 'not_started'
                   CHECK (state IN ('not_started','draft','submitted')),
  teacher_status   TEXT,
  data             TEXT NOT NULL DEFAULT '{}', -- fiche complète (JSON, voir shared/schemas.js)
  submitted_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT,
  UNIQUE (teacher_id, campaign_id)
);

-- Une ligne par intervention (CM, TD ou TP d'une ressource) : vue « à plat » de la fiche,
-- pratique pour le tableau de bord et l'export Hyperplanning.
CREATE TABLE IF NOT EXISTS wishes (
  id              INTEGER PRIMARY KEY,
  response_id     INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  priority        INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('CM','TD','TP')),
  groups          TEXT NOT NULL DEFAULT '[]',  -- JSON : ["GC2F1","GC2F2"]
  any_groups      INTEGER,                     -- « indifférent » : nombre de groupes
  hours_per_group REAL NOT NULL DEFAULT 0,
  session_length  REAL NOT NULL DEFAULT 0,
  sessions        INTEGER NOT NULL DEFAULT 0,  -- séances par groupe
  rhythm          TEXT,
  weeks           TEXT NOT NULL DEFAULT '[]',  -- JSON : [37,38,39]
  any_weeks       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS availabilities (
  id           INTEGER PRIMARY KEY,
  response_id  INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,
  slot         TEXT NOT NULL,
  level        TEXT NOT NULL CHECK (level IN ('preferred','possible','avoid','unavailable')),
  UNIQUE (response_id, day, slot)
);

-- Planning arrêté par l'équipe programme (module 5 : alertes de modification).
CREATE TABLE IF NOT EXISTS planning_entries (
  id           INTEGER PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day          TEXT,
  slot         TEXT,
  room         TEXT,
  type         TEXT CHECK (type IN ('CM','TD','TP')),
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS email_log (
  id           INTEGER PRIMARY KEY,
  teacher_id   INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  subject      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error        TEXT,
  sent_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Boîte d'envoi de démonstration : quand aucun SMTP n'est configuré, les e-mails
-- sont stockés ici et consultables dans l'application (/demo/boite).
CREATE TABLE IF NOT EXISTS dev_outbox (
  id          INTEGER PRIMARY KEY,
  teacher_id  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===================== v3 : paramétrage par l'équipe programme =====================

-- Groupes constitués manuellement (TD, et TP rattachés à un TD).
CREATE TABLE IF NOT EXISTS groups (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  semester     TEXT NOT NULL,                      -- S1, S3, S5
  name         TEXT NOT NULL,                      -- TD1, TP1A, GC2F1…
  type         TEXT NOT NULL CHECK (type IN ('TD','TP')),
  parcours     TEXT,                               -- NULL = tronc commun
  parent_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL, -- TP → TD d'origine
  size         INTEGER,                            -- effectif
  sort         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, semester, name)
);

-- Salles et leur planning d'occupation hebdomadaire.
CREATE TABLE IF NOT EXISTS rooms (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'td' CHECK (kind IN ('amphi','td','info','hybride','autre')),
  capacity     INTEGER,
  features     TEXT NOT NULL DEFAULT '[]',   -- JSON : ["projector","computer","hybrid"]
  busy         TEXT NOT NULL DEFAULT '{}',   -- JSON : {"MON|08:30-10:00": true} = créneau déjà occupé
  note         TEXT,
  UNIQUE (campaign_id, name)
);

-- Tableau de répartition : qui assure quoi (décidé par l'équipe programme).
-- group_name = '' pour un CM (toute la promotion / tout le parcours).
CREATE TABLE IF NOT EXISTS assignments (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('CM','TD','TP')),
  group_name   TEXT NOT NULL DEFAULT '',
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  hours        REAL NOT NULL DEFAULT 0,
  updated_at   TEXT,
  UNIQUE (course_id, type, group_name)
);

-- Réglages modifiables depuis l'application (onglet « Réglages ») ; priorité sur le fichier .env.
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

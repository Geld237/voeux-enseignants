# Vœux et disponibilités des enseignants

Outil de collecte des vœux d'enseignement et des disponibilités, utilisé en début de semestre
avant l'export vers Hyperplanning.

**État actuel : modules 1, 2 et 3 terminés** — liens uniques, fiche de vœux enseignant, espace équipe programme
(suivi des réponses, tableau de répartition, calendrier, groupes, salles, export).
La fiche de vœux est en **version 2**, refondue à partir de l'analyse des fiches reçues pour les semestres impairs 2026-2027.
À venir : tableau de bord admin (3), export Hyperplanning (4), édition du planning et alertes (5).

## Installer le logiciel (équipe programme)

1. Téléchargez la dernière version sur la page **Releases** du dépôt :
   https://github.com/Geld237/voeux-enseignants/releases/latest
   - Windows : `Voeux-enseignants-x.y.z-win-x64.exe` (installation sans droits administrateur)
   - macOS : `Voeux-enseignants-x.y.z-mac-universal.dmg`
2. Au premier lancement, créez le mot de passe de l'espace équipe programme.
3. Dans **Réglages**, vérifiez l'adresse d'accès des enseignants et, si possible, configurez l'e-mail
   (serveur SMTP de l'université). Sans e-mail, utilisez « Copier le lien » pour chaque enseignant.

**Accès des enseignants.** Le logiciel fait tourner l'application sur l'ordinateur de l'équipe programme
(port 4310). Les enseignants ouvrent leur lien personnel dans leur navigateur, depuis le même réseau
(réseau de l'université, VPN) et pendant que le logiciel est ouvert. Si le pare-feu de Windows le demande
au premier lancement, autorisez l'accès sur les réseaux privés / de domaine.

**Données et sauvegardes.** La base est enregistrée dans le dossier utilisateur du système (menu
*Fichier → Ouvrir le dossier des données et sauvegardes*) ; une copie est faite à chaque lancement
(10 dernières conservées). Désinstaller ou mettre à jour le logiciel ne supprime pas les données.

**Mises à jour.** Le logiciel vérifie au démarrage (puis toutes les 6 h) s'il existe une nouvelle version,
la télécharge en arrière-plan et l'installe au redémarrage (bandeau « Redémarrer maintenant »).
Menu *Aide → Rechercher des mises à jour…* pour vérifier à la demande.

> Les installateurs ne sont pas signés numériquement : au premier lancement, Windows SmartScreen
> (« Informations complémentaires → Exécuter quand même ») ou macOS (clic droit → Ouvrir) demandent une confirmation.
> Sur macOS, la mise à jour automatique exige une application signée par un compte développeur Apple :
> sans signature, installez les nouvelles versions à la main depuis *Releases* (Windows se met à jour seul).

## Publier une nouvelle version (développeur)

```bash
# 1. changer "version" dans package.json (ex. 1.1.0), puis :
git commit -am "Version 1.1.0"
git tag v1.1.0
git push --follow-tags
```

GitHub Actions (`.github/workflows/release.yml`) lance les tests, fabrique les installateurs Windows et
macOS et les publie dans *Releases* : les logiciels installés se mettent à jour d'eux-mêmes.
Pour essayer le logiciel de bureau sans l'installer : `npm run desktop`.

## Essayer la version web en 2 minutes (mode démo, développeurs)

Prérequis : Node.js 22.13 ou plus récent (22 LTS ou 24). La base SQLite est celle intégrée à Node : aucun outil de compilation (Visual Studio, Python) n'est nécessaire.

```bash
npm install
cp .env.example .env      # facultatif : sans .env, le mode démo est actif
npm run dev
```

Ouvrez http://localhost:5173 puis :

1. Cliquez sur **Envoyer les invitations** (6 enseignants fictifs).
2. Dans la **boîte de démo**, ouvrez un e-mail et cliquez sur **Ouvrir le formulaire**.
3. Remplissez le formulaire comme un enseignant, puis envoyez-le : l'e-mail de confirmation
   apparaît dans la boîte de démo.

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm run links` | Affiche un lien unique par enseignant dans le terminal |
| `npm run seed:reset` | Remet les données de démonstration à zéro |
| `npm test` | 27 tests de l'API : liens, sessions, fiche enseignant, espace équipe programme, sécurité, logiciel de bureau |
| `npm run build && npm start` | Version de production servie par Express sur le port 3001 |

## Espace équipe programme (`/admin`)

Mot de passe : variable `ADMIN_PASSWORD` du fichier `.env` (en mode démo, sans `.env` : **demo**).

| Onglet | Ce qu'on y fait |
|---|---|
| **Suivi des réponses** | Import de la liste des enseignants (copier-coller depuis Excel), envoi / relance des liens personnels, état des fiches (envoyée, brouillon, pas commencée), heures demandées et affectées, export CSV (Excel, `;`, UTF-8) et JSON |
| **Répartition** | Tableau de répartition construit par l'équipe : ressources et SAÉ (codes R et Apogée, semestre, parcours), volumes programme par groupe (saisie directe dans le tableau ou collage d'un tableau Excel), besoin calculé d'après les groupes, vœux reçus, **affectation d'un enseignant à chaque CM et à chaque groupe de TD / TP** (les candidats ayant demandé le module sont proposés en premier) |
| **Calendrier** | Dates d'ouverture et de clôture, semaines du semestre générées entre deux dates puis typées (cours, vacances, évaluations, rentrée, banalisée), jours fériés, créneaux horaires, semaine de début des SAÉ |
| **Groupes** | Constitution manuelle des TD et de leurs TP par semestre et parcours, effectifs, générateur de séries (TD1…TDn avec TP A/B) |
| **Salles** | Salles (type, capacité, équipements) et planning d'occupation hebdomadaire à cliquer ; vue des salles libres par créneau |

Tout ce qui est déclaré ici s'applique immédiatement aux fiches des enseignants : groupes proposés,
semaines sélectionnables, créneaux de la grille, et **salles proposées** pour chaque vœu (équipement
demandé, capacité suffisante pour les groupes choisis, créneaux libres là où l'enseignant est disponible).

## Fonctionnement des liens uniques

1. Le serveur génère un token aléatoire de 256 bits, l'envoie par e-mail et **ne stocke que son hash**
   SHA-256 : une fuite de la base ne permet pas de se connecter.
2. L'enseignant ouvre `/acces/<token>`. Le navigateur échange le token contre un **cookie de session**
   httpOnly (12 h), puis le retire de la barre d'adresse.
3. Le lien reste valable 30 jours (`TOKEN_TTL_DAYS`) et réutilisable, pour revenir compléter un brouillon.
4. Envoyer un nouveau lien **révoque** l'ancien. Les tentatives d'échange sont limitées (30 / 15 min / IP).

## Formulaire enseignant (fiche v2)

| Étape | Contenu |
|---|---|
| 1. Profil | E-mail de contact, téléphone (obligatoires avant tout le reste) |
| 2. Statut | Statut, activité principale (vacataires), autres engagements |
| 3. Vœux | Catalogue BUT GEA S1/S3/S5 (code R, code Apogée, semestre, parcours). Par ressource : CM / TD / TP, groupes réels (TD1–TD5, TP1A…, GC2F1, GC2F2, CG2P, GPRH, GEMA) ou « indifférent », heures par groupe, durée de séance → **nombre de séances calculé**, rythme, **frise des semaines** S36 → S2, évaluation (type, durée, semaine), besoins de salle, co-intervenants, « à placer après » |
| 4. Disponibilités | Grille des 6 créneaux réels × 5 jours, **4 niveaux** (préféré, possible, à éviter, impossible), cases **non renseignées par défaut** et obligatoires, début à 8h possible, première semaine de disponibilité, **absences datées** |
| 5. Organisation | Jours de présence max, regroupement sur une demi-journée, heures d'arrivée / de départ, durée max avec un groupe, pause déjeuner, quart d'heure de pause, reprise de l'an dernier, précisions |
| 6. Validation | Récapitulatif, erreurs cliquables, **progression semaine par semaine** estimée, envoi + e-mail de confirmation |

Contrôles automatiques (issus des règles de construction d'EDT de l'équipe programme) :
CM avant TD, SAÉ à partir de la S45 et après la ressource associée, séances / semaines cohérentes,
volume programme (quand il est renseigné), évaluation commune complète, plafond du statut.

- Enregistrement automatique du brouillon 1,2 s après chaque modification.
- Règles dans `shared/schemas.js`, appliquées dans le navigateur et à nouveau sur le serveur.
- Modifier une réponse déjà envoyée la repasse en brouillon : il faut l'envoyer de nouveau.

### Catalogue

`server/db/catalogue-gea.js` a été **reconstitué à partir des fiches reçues** : les entrées marquées
« à confirmer » et les volumes du programme (vides) seront remplacés par les tableaux de répartition
officiels BUT1/BUT2/BUT3. Le calendrier (semaines, vacances) est dans `server/db/seed.js`.

> Mises à jour de la base : une base du prototype (v1) est recréée automatiquement ; une base v2 est
> conservée et complétée (groupes et salles de démonstration ajoutés si elle n'en a pas).

## Adapter à votre département

Ressources, volumes, calendrier, créneaux, groupes et salles se gèrent dans l'espace équipe programme,
sans toucher au code. Restent dans la configuration de campagne (`defaultCampaignConfig` dans
`server/db/seed.js`) : les statuts, services et plafonds, les parcours et les coefficients d'équivalence TD.

## Passer en production

Définissez `ADMIN_PASSWORD` (obligatoire hors démo) et renseignez `SMTP_HOST` (et `SMTP_USER`/`SMTP_PASS`) dans `.env` : le mode démo se désactive,
les e-mails partent réellement et la boîte de démo disparaît. Mettez `APP_URL` à l'adresse
publique et `COOKIE_SECURE=true` derrière HTTPS.

## Structure

```
shared/
  schemas.js               règles de la fiche (zod + règles métier), calculs, proposition de salles
  calendar.js              semaines ISO, génération du calendrier
server/
  index.js                 application Express
  db/                      schéma SQLite (v3), connexion, catalogue reconstitué, données de démo
  lib/                     tokens, sessions, e-mails, invitations, réponses, limiteur
  middleware/              contrôle des sessions enseignant et équipe programme
  routes/                  auth, teacher (fiche), admin (espace équipe programme), demo
  tests/                   tests de bout en bout de l'API
client/src/
  pages/                   accueil, atterrissage du lien, fiche enseignant, boîte de démo
  pages/admin/             onglets de l'espace équipe programme
  components/wizard/       les 6 étapes de la fiche
```

## Données personnelles

Le dépôt ne contient aucune donnée réelle : enseignants et réponses de démonstration sont fictifs.
Les fiches Excel reçues, la base (`data/`) et le fichier `.env` sont exclus par `.gitignore`.

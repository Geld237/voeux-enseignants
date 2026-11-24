/**
 * Catalogue BUT GEA — semestres impairs (S1, S3, S5), formation initiale.
 *
 * RECONSTITUÉ à partir des fiches de vœux reçues pour 2026-2027 : codes R/SAE, codes Apogée
 * quand ils apparaissaient sans ambiguïté, intitulés. Les volumes du programme (pnCm, pnTd, pnTp)
 * sont inconnus (null) tant que les tableaux de répartition BUT1/BUT2/BUT3 n'ont pas été importés.
 * toConfirm = intitulé ou code déduit, à vérifier par l'équipe programme.
 *
 * Champs : [code, apogée, intitulé, semestre, parcours|null, toConfirm?]
 */
const rows = [
  // ---------- S1 · BUT1 (tronc commun) ----------
  ['R1.01', null, 'Environnement économique', 'S1', null],
  ['R1.02', null, 'Environnement juridique', 'S1', null],
  ['R1.03', null, 'Ressources humaines', 'S1', null],
  ['R1.04', null, 'Management d’activités', 'S1', null],
  ['R1.06', null, 'Fiscalité', 'S1', null],
  ['R1.07', null, 'Comptabilité', 'S1', null],
  ['R1.08', 'VGEAR108', 'Outils mathématiques de gestion', 'S1', null],
  ['R1.09', null, 'Outils numériques de gestion', 'S1', null],
  ['R1.10', 'VGER110', 'Finance (mathématiques financières)', 'S1', null],
  ['R1.11', null, 'Gestion de projet', 'S1', null],
  ['R1.12', null, 'Psychologie sociale', 'S1', null],
  ['R1.13', null, 'Culture communicationnelle et informationnelle', 'S1', null],
  ['R1.15', 'VGER115', 'Projet personnel et professionnel (PPP)', 'S1', null],
  ['R1.AL.31', null, 'LV2 Espagnol', 'S1', null],
  ['R1.AL.32', null, 'Outils numériques de communication', 'S1', null],
  ['R1.AL.33', null, 'Aide aux apprentissages et à la réussite', 'S1', null],
  ['SAÉ 1.01', null, 'Comprendre l’organisation et son environnement', 'S1', null],
  ['SAÉ 1.02', null, 'Mettre en œuvre une démarche comptable', 'S1', null, true],
  ['SAÉ 1.03', null, 'Construire une posture professionnelle', 'S1', null],

  // ---------- S3 · BUT2 (tronc commun) ----------
  ['R3.01', null, 'Environnement économique', 'S3', null],
  ['R3.02', null, 'Environnement juridique', 'S3', null],
  ['R3.03', 'VGFR303', 'Management d’activités', 'S3', null],
  ['R3.04', 'VGFR304', 'Fiscalité', 'S3', null, true],
  ['R3.05', 'VGFR305', 'Traitement numérique des données (TND) — informatique', 'S3', null],
  ['R3.06', null, 'Contrôle de gestion', 'S3', null],
  ['R3.07', 'VGFR307', 'Finance', 'S3', null],
  ['R3.08', null, 'Communication', 'S3', null],
  ['R3.09', null, 'Culture communicationnelle et informationnelle : anglais', 'S3', null],
  ['R3.AL.31', null, 'LV2 Espagnol', 'S3', null],
  // S3 · parcours GC2F
  ['R3.GC2F.11', 'VGFR311', 'Fiscalité : imposition des entreprises (BIC)', 'S3', 'GC2F'],
  ['R3.GC2F.12', null, 'Comptabilité approfondie', 'S3', 'GC2F'],
  ['R3.GC2F.13', null, 'Finance approfondie', 'S3', 'GC2F'],
  ['SAÉ 3.GC2F.02', null, 'Établir le diagnostic financier d’une entreprise', 'S3', 'GC2F'],
  // S3 · parcours CG2P
  ['R3.CG2P.11', null, 'Comptabilité de gestion approfondie', 'S3', 'CG2P'],
  ['R3.CG2P.12', null, 'Initiation à la gestion budgétaire', 'S3', 'CG2P'],
  ['R3.CG2P.13', null, 'Management des opérations et pilotage de la performance', 'S3', 'CG2P'],
  ['R3.CG2P.14', null, 'Outils de pilotage : initiation au développement d’un SI', 'S3', 'CG2P'],
  ['SAÉ 3.CG2P.02', null, 'SAÉ parcours CG2P', 'S3', 'CG2P', true],
  // S3 · parcours GPRH
  ['R3.GPRH.11', 'VGRR311', 'Gestion administrative des contrats', 'S3', 'GPRH', true],
  ['R3.GPRH.12', null, 'Pratique de la paie', 'S3', 'GPRH'],
  ['R3.GPRH.13', 'VGRR313', 'Droit de la fonction publique', 'S3', 'GPRH', true],
  ['R3.GPRH.14', null, 'Gestion des emplois et des parcours professionnels', 'S3', 'GPRH'],
  ['R3.GPRH.15', null, 'Pratique du recrutement', 'S3', 'GPRH'],
  ['SAÉ 3.GPRH.03', null, 'Contribuer à la mise en œuvre des outils RH', 'S3', 'GPRH'],
  // S3 · parcours GEMA
  ['R3.GEMA.11', null, 'Droit de l’entrepreneuriat', 'S3', 'GEMA'],
  ['R3.GEMA.12', 'VGMR312', 'Financement des activités', 'S3', 'GEMA', true],
  ['R3.GEMA.14', 'VGMR314', 'Business model', 'S3', 'GEMA'],
  ['SAÉ 3.GEMA.02', 'VGMS302', 'Création d’activité à l’aide d’un business model', 'S3', 'GEMA'],

  // ---------- S5 · BUT3 (tronc commun) ----------
  ['R5.01', null, 'Environnement économique', 'S5', null],
  ['R5.02', null, 'Environnement juridique : droit du numérique', 'S5', null],
  ['R5.03', 'VGFR503', 'Management d’activités', 'S5', null],
  ['R5.04', 'VGFR504', 'Traitement numérique des données (TND) — informatique', 'S5', null],
  ['R5.06', null, 'Ressource R5.06 (intitulé à confirmer)', 'S5', null, true],
  ['R5.07', null, 'Psychologie sociale', 'S5', null],
  ['R5.08', null, 'Projet personnel et professionnel (PPP)', 'S5', null],
  ['R5.AL.31', null, 'LV2 Espagnol', 'S5', null],
  ['R5.AL.TOEIC', null, 'Préparation au TOEIC (adaptation locale)', 'S5', null, true],
  ['SAÉ 5.01', null, 'Transformation numérique des organisations', 'S5', null],
  // S5 · parcours GC2F
  ['R5.GC2F.09', 'VGFR509', 'Fiscalité : approfondissement TVA et IR', 'S5', 'GC2F'],
  ['R5.GC2F.10', null, 'Comptabilité : techniques particulières', 'S5', 'GC2F'],
  ['R5.GC2F.11', null, 'Contrôle de gestion : évaluation', 'S5', 'GC2F', true],
  ['R5.GC2F.12', 'VGFR512', 'Finance : gestion de trésorerie', 'S5', 'GC2F'],
  ['SAÉ 5.GC2F.02', 'VGFS502', 'Mettre en œuvre la reprise d’une entreprise', 'S5', 'GC2F'],
  // S5 · parcours CG2P
  ['R5.CG2P.09', null, 'Management des opérations approfondi', 'S5', 'CG2P'],
  ['R5.CG2P.10', null, 'SI décisionnel, tableaux de bord, reporting', 'S5', 'CG2P'],
  ['R5.CG2P.11', 'VCGR511', 'Contrôle de gestion : processus budgétaire avancé', 'S5', 'CG2P'],
  ['R5.CG2P.12', null, 'SI décisionnel et contrôle budgétaire', 'S5', 'CG2P', true],
  ['R5.CG2P.13', null, 'Comptabilité de gestion approfondie', 'S5', 'CG2P'],
  // S5 · parcours GPRH
  ['R5.GPRH.10', null, 'RH : gestion de la paie approfondie', 'S5', 'GPRH'],
  ['R5.GPRH.11', null, 'RH : politiques de rémunération', 'S5', 'GPRH'],
  ['R5.GPRH.12', 'VGRR512', 'Droit du travail', 'S5', 'GPRH', true],
  ['R5.GPRH.13', null, 'RH : pilotage social et performance sociale', 'S5', 'GPRH'],
  ['R5.GPRH.14', null, 'RH : gestion des compétences approfondie et des talents', 'S5', 'GPRH'],
  ['R5.GPRH.15', null, 'RH : gestion du recrutement approfondie', 'S5', 'GPRH'],
  ['SAÉ 5.GPRH.03', 'VGRS503', 'SAÉ parcours GPRH', 'S5', 'GPRH', true],
  // S5 · parcours GEMA
  ['R5.GEMA.09', null, 'Droit de la concurrence', 'S5', 'GEMA'],
  ['R5.GEMA.10', null, 'Outils de gestion du manager', 'S5', 'GEMA'],
  ['R5.GEMA.11', null, 'Management d’activités : management des équipes', 'S5', 'GEMA'],
  ['R5.GEMA.12', null, 'Management d’activités : management des relations', 'S5', 'GEMA'],
  ['SAÉ 5.GEMA.02', 'VGMS502', 'SAÉ parcours GEMA (2)', 'S5', 'GEMA', true],
  ['SAÉ 5.GEMA.03', 'VGMS503', 'SAÉ parcours GEMA (3)', 'S5', 'GEMA', true],
];

export const catalogue = rows.map(([code, apogee, title, semester, parcours, toConfirm]) => ({
  code,
  apogee,
  title,
  semester,
  parcours,
  kind: code.startsWith('SA') ? 'SAE' : 'R',
  pnCm: null,
  pnTd: null,
  pnTp: null,
  toConfirm: Boolean(toConfirm),
}));

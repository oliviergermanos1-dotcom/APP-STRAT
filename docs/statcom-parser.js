// STATCOM raw B/L parser — runs in the browser.
//
// Schemas supported (auto-detected):
//   - Maritime  (TIM/TEM/HIMP/HEXP): 46 cols, NOMBRE_TEU, Mois escale = name,
//                                    Qualifié? = Oui/Non
//   - Aerial    (AER IMP/EXP):       23 cols, Poids marchandise (kg),
//                                    Mois escale = 1..12, qualifie = 1/0
//
// Configurable filters (opts):
//   - excludeNonApure (default on)            → drop Transitaire == 'NON APURE'
//   - excludePetroleum (default on)           → drop hydrocarbon merchandises
//   - excludeSirSmbTransitaire (default on)   → drop SIR/SMB found in Transitaire
//   - excludeSirSmbDestinataire (default on)  → drop SIR/SMB found in Destinataire
//
// Period filtering is handled OUTSIDE this parser: parseStatcomBuffer returns
// the full set of kept rows (after exclusion filters). The caller derives
// "current period" and "N-1 full year" views from the same row set.

// ── HYDROCARBURES LIQUIDES = « POSTE PÉTROLIER » ───────────────────────────
// Trafic capté d'office par la raffinerie, traité à un poste à quai dédié.
// C'est ce périmètre que le rapport DSM désigne par « HORS PP ».
// Périmètre volontairement ÉTROIT, calé sur le reporting DSM de référence :
// seuls le brut et le raffiné transitent par le poste pétrolier. Vérifié
// sur les 4 exports 2025 — la règle reproduit les totaux du modèle au
// tonne près (import 16 635 874 T, export 4 385 383 T).
// À NE PAS élargir : bitume (117 927 T), matériaux pétroliers, diesel
// generator set sont des vracs et équipements manutentionnés à quai
// normal, comptés dans le conventionnel. Un mot-clé large comme 'gaz'
// attraperait par ailleurs GAZON SYNTHETIQUE et SEMENCE DE GAZON.
const PETROLEUM_KEYWORDS = [
  'produit petrolier brut', 'petrolier brut', 'petrole brut',
  'crude oil', 'pet brut', 'brut petrol',
  'petrole raffine', 'petroles raffines',
];

// ── GAZ (GPL) — TRAFIC DISTINCT, CONSERVÉ PAR DÉFAUT ──────────────────────
// Le butane est chimiquement issu du raffinage, mais PORTUAIREMENT c'est un
// autre métier : gaziers spécialisés, terminal dédié, consignation propre.
// Le confondre avec le brut retirait 812 500 T/an du marché adressable DSM
// et faussait le classement des acteurs. Liste séparée, exclusion optionnelle
// et DÉSACTIVÉE par défaut.
const GAS_KEYWORDS = ['gpl', 'lpg', 'butane', 'propane'];

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isAgl(name) {
  const n = norm(name);
  return /africa\s*global\s*logistics|^agl\b|^a\.?g\.?l\.?/.test(n);
}

function isNonApure(name) {
  const n = norm(name);
  return n === 'non apure' || n.startsWith('non apur');
}

function isSirSmbTransitaire(name) {
  const t = norm(name);
  return t === 'sir' || t === 'sir ci' || t === 'sir-ci'
      || t === 'smb' || t === 'smb ci';
}

function isSirSmbDestinataire(name) {
  const d = norm(name);
  if (!d) return false;
  return d.includes('sir ci')
      || d.includes('societe ivoirienne de raffinage')
      || d.includes('smb ')
      || d.includes('societe multinationale de bitumes');
}

function isPetroleum(merchLabel) {
  const n = norm(merchLabel);
  if (!n) return false;
  // Un libellé gazier ne doit jamais tomber dans le poste pétrolier, même
  // s'il contient un mot générique (ex. « GPL PETROLIER »).
  if (GAS_KEYWORDS.some((kw) => n.includes(kw))) return false;
  return PETROLEUM_KEYWORDS.some((kw) => n.includes(kw));
}

function isGas(merchLabel) {
  const n = norm(merchLabel);
  if (!n) return false;
  return GAS_KEYWORDS.some((kw) => n.includes(kw));
}

function isCotedIvoire(country) {
  // Collapse all non-alphanumerics to single spaces so "COTE D'IVOIRE",
  // "CÔTE D IVOIRE", "COTE-D-IVOIRE" all normalise identically.
  const n = norm(country).replace(/[^a-z0-9]+/g, ' ').trim();
  return n === 'cote d ivoire' || n === 'rci' || n === 'ci'
      || n.startsWith('cote d ivoire');
}

function detectSchema(headers, metier) {
  const set = new Set(headers.map((h) => String(h || '').toLowerCase()));
  const isAer = set.has('compagnie') || set.has('aéroport escale') || set.has('aeroport escale');
  if (isAer || metier === 'AER') {
    return {
      schema: 'aer',
      volumeKey: 'Poids marchandise',
      merchKey: 'Marchandise',
      qualifKey: 'qualifie',
      qualifTrueValues: [1, '1', true, 'oui', 'yes'],
      clientKey: (metier === 'TEM' || metier === 'HEXP') ? 'Chargeur' : 'Destinataire',
      yearKey: 'Année escale',
      monthKey: 'Mois escale',
      monthIsNumeric: true,
      // Poids marchandise is in kg → convert to tonnes for readability.
      unit: 'T',
      volumeDivisor: 1000,
    };
  }
  return {
    schema: 'maritime',
    volumeKey: 'NOMBRE_TEU',
    merchKey: 'Libellé marchandise',
    qualifKey: 'Qualifié?',
    qualifTrueValues: ['Oui', 'oui', 'OUI', 1, '1', true],
    clientKey: (metier === 'TEM' || metier === 'HEXP') ? 'Chargeur' : 'Destinataire',
    yearKey: 'Année escale',
    monthKey: 'Mois escale',
    monthIsNumeric: false,
    unit: metier === 'DSM' ? 'T' : 'TEU',
  };
}

function monthLabel(value, isNumeric) {
  if (isNumeric) {
    const n = Number(value);
    if (n >= 1 && n <= 12) return MONTHS_FR[n - 1];
    return null;
  }
  const s = String(value || '').trim();
  return MONTHS_FR.find((m) => m.toLowerCase() === s.toLowerCase()) || s || null;
}

/**
 * Parse a STATCOM xlsx ArrayBuffer.
 *
 * Returns the rows kept after exclusion filters, plus per-filter counters.
 * The caller is responsible for applying period filtering when deriving
 * slide datasets.
 */
function parseStatcomBuffer(buffer, metier, filename, opts = {}) {
  const o = {
    excludeNonApure: opts.excludeNonApure !== false,
    excludePetroleum: opts.excludePetroleum !== false,
    excludeSirSmbTransitaire: opts.excludeSirSmbTransitaire !== false,
    excludeSirSmbDestinataire: opts.excludeSirSmbDestinataire !== false,
    // Gaz : opt-in explicite (défaut = conservé), contrairement aux autres.
    excludeGas: opts.excludeGas === true,
  };

  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellHTML: false });
  const sheetName = wb.SheetNames.find((n) => /export|statcom|data/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0] || [];
  const sch = detectSchema(headerRow, metier);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const dropped = { nonQualified: 0, nonApure: 0, sirSmbTransit: 0, sirSmbDest: 0, petroleum: 0, gas: 0, geo: 0 };
  const kept = [];

  // Métier-specific geographic scope:
  //   TIM  (import maritime)  → keep only "Pays de livraison" = Côte d'Ivoire
  //                             (exclut transbordement vers Mali/BF = hinterland)
  //   TEM  (export maritime)  → keep only "Pays de prise en charge" = Côte d'Ivoire
  //   HEXP (hinterland export)→ keep only "Pays de prise en charge" ≠ Côte d'Ivoire
  //                             (flux export depuis Mali/BF via Abidjan)
  //   HIMP (hinterland import)→ keep only "Pays de livraison" ≠ Côte d'Ivoire
  //                             (flux import à destination de Mali/BF)
  const geoMode = metier === 'TIM'  ? 'livraison'
                : metier === 'TEM'  ? 'chargement'
                : metier === 'HEXP' ? 'chargement_hors_ci'
                : metier === 'HIMP' ? 'livraison_hors_ci'
                : null;

  for (const r of rows) {
    // Qualified
    const q = r[sch.qualifKey];
    if (q !== undefined && q !== null) {
      const qs = String(q).toLowerCase();
      const ok = sch.qualifTrueValues.some((v) => String(v).toLowerCase() === qs);
      if (!ok) { dropped.nonQualified += 1; continue; }
    }
    // « Non Apuré » = B/L dont la procédure douanière n'est pas close : le
    // transitaire n'est pas identifié. On MARQUE la ligne au lieu de la
    // supprimer, car l'exclusion ne vaut que pour les analyses fondées sur
    // le TRANSITAIRE (concurrents, clients AGL, parts de marché). Le
    // reporting DSM raisonne par armateur / manutentionnaire /
    // consignataire : la marchandise a bien été transportée et manutentionnée,
    // l'exclure amputait l'export conventionnel de moitié (2,3 M T au lieu
    // de 4,4 M T face au rapport DSM de référence).
    const _isNonApure = isNonApure(r['Transitaire']);
    if (o.excludeNonApure && _isNonApure) dropped.nonApure += 1;
    if (o.excludeSirSmbTransitaire && isSirSmbTransitaire(r['Transitaire'])) {
      dropped.sirSmbTransit += 1; continue;
    }
    if (o.excludeSirSmbDestinataire && isSirSmbDestinataire(r['Destinataire'])) {
      dropped.sirSmbDest += 1; continue;
    }
    if (o.excludePetroleum && isPetroleum(r[sch.merchKey])) {
      dropped.petroleum += 1; continue;
    }
    if (o.excludeGas && isGas(r[sch.merchKey])) {
      dropped.gas = (dropped.gas || 0) + 1; continue;
    }
    // Métier-specific geographic scope
    if (geoMode === 'livraison' && !isCotedIvoire(r['Pays de livraison'])) {
      dropped.geo += 1; continue;
    }
    if (geoMode === 'chargement' && !isCotedIvoire(r['Pays de prise en charge'])) {
      dropped.geo += 1; continue;
    }
    if (geoMode === 'livraison_hors_ci' && isCotedIvoire(r['Pays de livraison'])) {
      dropped.geo += 1; continue;
    }
    if (geoMode === 'chargement_hors_ci' && isCotedIvoire(r['Pays de prise en charge'])) {
      dropped.geo += 1; continue;
    }

    // Normalize fields for downstream consumption
    const row = {
      transitaire: String(r['Transitaire'] || '').trim(),
      destinataire: String(r['Destinataire'] || '').trim(),
      chargeur: String(r['Chargeur'] || '').trim(),
      marchandise: String(r[sch.merchKey] || '').trim(),
      volume: (Number(r[sch.volumeKey]) || 0) / (sch.volumeDivisor || 1),
      mois: monthLabel(r[sch.monthKey], sch.monthIsNumeric),
      annee: r[sch.yearKey] != null ? Number(r[sch.yearKey]) : null,
      range: String(r['Range'] || '').trim(),
      pays_chargement: String(r['Pays de prise en charge'] || '').trim(),
      pays_livraison: String(r['Pays de livraison'] || '').trim(),
      nonApure: _isNonApure,
    };
    // DSM fields (maritime only) — Direction Maritime analysis works on the
    // import maritime base aggregated by weight (POIDS_MARCHANDISE, tonnes).
    if (sch.schema === 'maritime') {
      row.poids = Number(r['POIDS_MARCHANDISE']) || 0;
      row.armateur = String(r['Armateur BL'] || '').trim();
      row.manutentionnaire = String(r['Manutentionaire'] || '').trim();
      // Conditionnement + TEU : le reporting DSM ventile chaque dimension
      // en DEUX tableaux — conteneurs (TEU) et conventionnel (tonnes,
      // limité à VRAC/SACS/BRBK). RORO et CARS en sont exclus.
      row.conditionnement = String(r['CODE_CONDIT'] || '').trim().toUpperCase();
      row.teu = Number(r['NOMBRE_TEU']) || 0;
      row.consignataire = String(r['Consignataire'] || '').trim();
      row.port_dechargement = String(r['Port de déchargement'] || '').trim();
      row.navire = String(r['Navire'] || '').trim();
    }
    kept.push(row);
  }

  const market = kept.reduce((s, r) => s + r.volume, 0);

  return {
    filename,
    schema: sch.schema,
    unit: sch.unit,
    rowCount: rows.length,
    keptCount: kept.length,
    dropped,
    market,
    kept,
  };
}

// Works in both main thread (window) and Web Worker (self) contexts.
const _globalRef = (typeof self !== 'undefined') ? self : window;
_globalRef.parseStatcomBuffer = parseStatcomBuffer;
_globalRef.STATCOM = {
  MONTHS_FR,
  isAgl,
  isPetroleum,
  isGas,
};

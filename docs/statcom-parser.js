// STATCOM raw B/L parser — runs in the browser.
//
// Supports 2 STATCOM exports:
//   - Maritime  (TIM/TEM/HIMP/HEXP): 46 columns, Qualifié? = Oui/Non,
//     volume in NOMBRE_TEU, Mois escale = French month name.
//   - Aerial    (AER IMP/EXP):       23 columns, qualifie = 1/0,
//     volume in "Poids marchandise" (kg), Mois escale = 1..12.
//
// Filters (configurable via opts):
//   - excludeNonApure (default true) → drop Transitaire == "NON APURE"
//   - excludePetroleum (default true) → drop hydrocarbon merchandises
//   - excludeSirSmb (default true) → drop the 2 historical SIR CI / SMB
//     consignees used by the v1 reference

const PETROLEUM_KEYWORDS = [
  'petrole', 'petroleum', 'brut',
  'gazole', 'gas oil', 'gasoil', 'diesel', 'jet a1', 'jet-a1',
  'essence', 'fuel', 'kerosen', 'kerosene',
  'hydrocarbure', 'hydrocarbon',
  'bitume', 'naphta', 'naphtha', 'gpl',
];

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

function isSirOrSmb(transitName, destName) {
  const t = norm(transitName);
  const d = norm(destName);
  return t === 'sir' || t === 'sir ci' || t === 'sir-ci' || t === 'smb'
      || d.includes('sir ci') || d.includes('societe ivoirienne de raffinage')
      || d.includes('societe multinationale de bitumes');
}

function isPetroleum(merchLabel) {
  const n = norm(merchLabel);
  if (!n) return false;
  return PETROLEUM_KEYWORDS.some((kw) => n.includes(kw));
}

/**
 * Detect schema by looking at the column set of the first row.
 * Returns { schema: 'aer'|'maritime', volumeKey, merchKey, qualifKey,
 *           clientKey, monthIsNumeric }.
 */
function detectSchema(headers, metier) {
  const set = new Set(headers.map((h) => String(h || '').toLowerCase()));
  // AER has 'compagnie' and 'aéroport escale'
  const isAer = set.has('compagnie') || set.has('aéroport escale') || set.has('aeroport escale');

  if (isAer || metier === 'AER') {
    return {
      schema: 'aer',
      volumeKey: 'Poids marchandise',
      merchKey: 'Marchandise',
      qualifKey: 'qualifie',
      qualifTrueValues: [1, '1', true, 'oui', 'yes'],
      clientKey: (metier === 'TEM' || metier === 'HEXP') ? 'Chargeur' : 'Destinataire',
      monthIsNumeric: true,
      unit: 'kg',
    };
  }
  return {
    schema: 'maritime',
    volumeKey: 'NOMBRE_TEU',
    merchKey: 'Libellé marchandise',
    qualifKey: 'Qualifié?',
    qualifTrueValues: ['Oui', 'oui', 'OUI', 1, '1', true],
    clientKey: (metier === 'TEM' || metier === 'HEXP') ? 'Chargeur' : 'Destinataire',
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
 * Parse a STATCOM xlsx ArrayBuffer and derive the 4 datasets used by the
 * generator.
 *
 * @param {ArrayBuffer} buffer
 * @param {string} metier 'TIM' | 'TEM' | 'HIMP' | 'HEXP' | 'AER' | 'DSM'
 * @param {string} filename
 * @param {{ excludeNonApure?: boolean, excludePetroleum?: boolean,
 *           excludeSirSmb?: boolean }} [opts]
 */
function parseStatcomBuffer(buffer, metier, filename, opts = {}) {
  const o = {
    excludeNonApure: opts.excludeNonApure !== false,
    excludePetroleum: opts.excludePetroleum !== false,
    excludeSirSmb: opts.excludeSirSmb !== false,
  };

  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellHTML: false });
  const sheetName = wb.SheetNames.find((n) => /export|statcom|data/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Get raw headers to detect schema
  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 })[0] || [];
  const sch = detectSchema(headerRow, metier);

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  // ─── Filter pipeline ────────────────────────────────────────────────────
  const dropped = { nonQualified: 0, nonApure: 0, sirSmb: 0, petroleum: 0 };
  const qualified = rows.filter((r) => {
    // Qualified check
    const q = r[sch.qualifKey];
    if (q !== undefined && q !== null) {
      const qs = String(q).toLowerCase();
      const ok = sch.qualifTrueValues.some((v) => String(v).toLowerCase() === qs);
      if (!ok) { dropped.nonQualified += 1; return false; }
    }
    // Non Apuré
    if (o.excludeNonApure && isNonApure(r['Transitaire'])) {
      dropped.nonApure += 1; return false;
    }
    // SIR / SMB
    if (o.excludeSirSmb && isSirOrSmb(r['Transitaire'], r['Destinataire'])) {
      dropped.sirSmb += 1; return false;
    }
    // Pétroliers
    if (o.excludePetroleum && isPetroleum(r[sch.merchKey])) {
      dropped.petroleum += 1; return false;
    }
    return true;
  });

  // ─── Aggregations ───────────────────────────────────────────────────────
  const market = qualified.reduce((s, r) => s + (Number(r[sch.volumeKey]) || 0), 0);

  // Concurrents (top by Transitaire)
  const byTransit = new Map();
  for (const r of qualified) {
    const name = String(r['Transitaire'] || '').trim();
    if (!name) continue;
    byTransit.set(name, (byTransit.get(name) || 0) + (Number(r[sch.volumeKey]) || 0));
  }
  const concurrentsRows = [...byTransit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, vol], i) => ({
      rang: i + 1,
      transitaire: name,
      volume: Math.round(vol * 100) / 100,
      pdm: market > 0 ? Math.round((vol / market) * 10000) / 100 : 0,
    }));

  // Clients AGL
  const aglRows = qualified.filter((r) => isAgl(r['Transitaire']));
  const byClient = new Map();
  const segByClient = new Map();
  for (const r of aglRows) {
    const name = String(r[sch.clientKey] || '').trim();
    if (!name) continue;
    byClient.set(name, (byClient.get(name) || 0) + (Number(r[sch.volumeKey]) || 0));
    if (!segByClient.has(name)) segByClient.set(name, String(r[sch.merchKey] || '').trim());
  }
  const aglTotal = [...byClient.values()].reduce((s, v) => s + v, 0);
  const clientsRows = [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, vol]) => ({
      client: name,
      volume: Math.round(vol * 100) / 100,
      segment: segByClient.get(name) || '—',
      pct_vol_agl: aglTotal > 0 ? Math.round((vol / aglTotal) * 1000) / 10 : 0,
    }));

  // Segments
  const byMerch = new Map();
  const aglByMerch = new Map();
  for (const r of qualified) {
    const seg = String(r[sch.merchKey] || '').trim();
    if (!seg) continue;
    byMerch.set(seg, (byMerch.get(seg) || 0) + (Number(r[sch.volumeKey]) || 0));
    if (isAgl(r['Transitaire'])) {
      aglByMerch.set(seg, (aglByMerch.get(seg) || 0) + (Number(r[sch.volumeKey]) || 0));
    }
  }
  const segmentsRows = [...byMerch.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11)
    .map(([seg, vol]) => ({
      segment: seg,
      volume_marche: Math.round(vol * 100) / 100,
      pdm_agl: vol > 0 ? Math.round(((aglByMerch.get(seg) || 0) / vol) * 100) : 0,
    }));

  // Mensuel
  const mMkt = new Map(), mAgl = new Map();
  for (const r of qualified) {
    const m = monthLabel(r['Mois escale'], sch.monthIsNumeric);
    if (!m) continue;
    mMkt.set(m, (mMkt.get(m) || 0) + (Number(r[sch.volumeKey]) || 0));
    if (isAgl(r['Transitaire'])) {
      mAgl.set(m, (mAgl.get(m) || 0) + (Number(r[sch.volumeKey]) || 0));
    }
  }
  const mensuelRows = MONTHS_FR
    .filter((m) => mMkt.has(m))
    .map((m) => ({
      mois: m,
      volume_marche: Math.round(mMkt.get(m) * 100) / 100,
      volume_agl: Math.round((mAgl.get(m) || 0) * 100) / 100,
      pdm_agl: mMkt.get(m) > 0
        ? Math.round(((mAgl.get(m) || 0) / mMkt.get(m)) * 1000) / 10
        : 0,
    }));

  const referentielRows = [...byTransit.entries()].map(([name, vol]) => ({
    nom_entite: name,
    metier,
    volume_annuel_n1: Math.round(vol * 100) / 100,
  }));

  return {
    filename,
    schema: sch.schema,
    unit: sch.unit,
    rowCount: rows.length,
    qualifiedCount: qualified.length,
    dropped,
    market,
    datasets: [
      { datasetType: 'concurrents',    filename, rowCount: concurrentsRows.length, rows: concurrentsRows },
      { datasetType: 'clients',        filename, rowCount: clientsRows.length,     rows: clientsRows },
      { datasetType: 'segments',       filename, rowCount: segmentsRows.length,    rows: segmentsRows },
      { datasetType: 'mensuel',        filename, rowCount: mensuelRows.length,     rows: mensuelRows },
      { datasetType: 'referentiel_n1', filename, rowCount: referentielRows.length, rows: referentielRows },
    ],
  };
}

window.parseStatcomBuffer = parseStatcomBuffer;

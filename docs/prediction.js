// Prediction module — runs on the main thread (PDFs/Excel are small).
//
// - extractPdfText(file): uses pdf.js to pull raw text from a newsletter PDF.
// - extractSignals(texts): counts sector / commodity / country mentions to
//   surface "market signals" from the newsletters.
// - parseAoExcel(buffer): generic parser for the "AO répondus / agréments"
//   Excel (auto-detected columns).

const SECTOR_LEXICON = {
  'Mines & Or': ['mine', 'minier', 'gold', 'orpaillage', 'aurifère', 'manganèse', 'nickel', 'lithium', 'bauxite'],
  'Pétrole & Énergie': ['pétrole', 'petrole', 'hydrocarbure', 'gaz', 'énergie', 'energie', 'raffinerie', 'électricité', 'electricite', 'solaire'],
  'Ciment & BTP': ['ciment', 'clinker', 'btp', 'construction', 'infrastructure', 'route', 'pont', 'logement', 'bâtiment', 'batiment'],
  'Agro & Cacao': ['cacao', 'café', 'cafe', 'anacarde', 'cajou', 'coton', 'hévéa', 'hevea', 'caoutchouc', 'banane', 'mangue', 'agro', 'palmier'],
  'Agro-alimentaire': ['riz', 'blé', 'ble', 'sucre', 'huile', 'farine', 'lait', 'alimentaire', 'boisson'],
  'Automobile': ['véhicule', 'vehicule', 'automobile', 'voiture', 'roro', 'moto'],
  'Télécoms & Tech': ['télécom', 'telecom', '5g', 'fibre', 'data center', 'digital', 'technologie', 'smartphone'],
  'Pharma & Santé': ['pharma', 'médicament', 'medicament', 'santé', 'sante', 'hôpital', 'hopital', 'vaccin'],
  'Industrie & Machines': ['usine', 'industrie', 'machine', 'équipement', 'equipement', 'manufacturing'],
  'Conteneurs & Shipping': ['conteneur', 'container', 'teu', 'armateur', 'fret', 'maritime', 'port', 'terminal', 'navire'],
};

const COUNTRY_LEXICON = ['côte d\'ivoire', 'cote d\'ivoire', 'mali', 'burkina', 'niger', 'ghana', 'chine', 'inde',
  'vietnam', 'turquie', 'maroc', 'sénégal', 'senegal', 'nigeria', 'guinée', 'guinee', 'europe', 'asie'];

function normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 40);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += ' ' + content.items.map((it) => it.str).join(' ');
  }
  return text;
}

function extractSignals(texts) {
  const blob = normTxt(texts.join(' \n '));
  const sectors = [];
  for (const [sector, terms] of Object.entries(SECTOR_LEXICON)) {
    let count = 0;
    for (const t of terms) {
      const re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const m = blob.match(re);
      if (m) count += m.length;
    }
    if (count > 0) sectors.push({ name: sector, count });
  }
  sectors.sort((a, b) => b.count - a.count);

  const countries = [];
  for (const c of COUNTRY_LEXICON) {
    const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const m = blob.match(re);
    if (m) countries.push({ name: c, count: m.length });
  }
  countries.sort((a, b) => b.count - a.count);

  return {
    sectors: sectors.slice(0, 8),
    countries: countries.slice(0, 6),
    wordCount: blob.split(/\s+/).length,
  };
}

// AO / Agréments Excel parser.
// Workbook = one sheet per year (2011..2026). We target the sheet matching the
// study year (fallback: latest numeric sheet). Each sheet has a header row
// "TYPE | ENTREPRISES | DATE DE RECEPTION | DEMANDEUR | OBJET | ... | STATUT".
function parseAoExcel(buffer, targetYear) {
  const wb = window.XLSX.read(buffer, { type: 'array' });
  const X = window.XLSX;

  // Pick the sheet for the study year, else the latest numeric one.
  const numericSheets = wb.SheetNames.filter((n) => /^\d{4}$/.test(n.trim()));
  let sheetName = null;
  if (targetYear && wb.SheetNames.includes(String(targetYear))) {
    sheetName = String(targetYear);
  } else if (numericSheets.length) {
    sheetName = numericSheets.sort().slice(-1)[0];
  } else {
    sheetName = wb.SheetNames[0];
  }
  const ws = wb.Sheets[sheetName];
  const grid = X.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find the header row (contains TYPE and ENTREPRISES).
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    const cells = (grid[i] || []).map((c) => normTxt(c));
    if (cells.some((c) => c === 'type') && cells.some((c) => c.includes('entreprise'))) {
      hdrIdx = i; break;
    }
  }
  if (hdrIdx < 0) return { sheet: sheetName, total: 0, rows: [], byType: {}, statuts: {} };

  const header = grid[hdrIdx].map((c) => normTxt(c));
  const colIdx = (...needles) => header.findIndex((h) => needles.some((n) => h.includes(n)));
  const ci = {
    type: colIdx('type'),
    entreprise: colIdx('entreprise'),
    demandeur: colIdx('demandeur'),
    objet: colIdx('objet'),
    statut: colIdx('statut'),
    date: colIdx('date de reception', 'date reception'),
  };

  const byType = {};
  const statuts = {};
  const objets = {};
  const parsed = [];
  for (let i = hdrIdx + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const type = ci.type >= 0 ? String(row[ci.type] || '').trim() : '';
    const entreprise = ci.entreprise >= 0 ? String(row[ci.entreprise] || '').trim() : '';
    if (!entreprise) continue; // skip section labels / empty rows
    const typeNorm = normTxt(type) || 'autre';
    const objet = ci.objet >= 0 ? String(row[ci.objet] || '').trim() : '';
    const statut = ci.statut >= 0 ? String(row[ci.statut] || '').trim() : '';

    // Bucket type (AO / AGREMENT / PROJET / COTATION / RFI / AGV…)
    let bucket = 'Autre';
    if (typeNorm.includes('agrement')) bucket = 'Agrément';
    else if (typeNorm.includes('ao') || typeNorm.includes('appel')) bucket = 'AO';
    else if (typeNorm.includes('projet')) bucket = 'Projet';
    else if (typeNorm.includes('cotation')) bucket = 'Cotation';
    else if (typeNorm.includes('rfi')) bucket = 'RFI';
    byType[bucket] = (byType[bucket] || 0) + 1;

    if (statut) {
      const sN = normTxt(statut);
      let sBucket = statut;
      if (/gagn|remport|attribu|adjug|retenu/.test(sN)) sBucket = 'Gagné / Retenu';
      else if (/enregistr|transmis|recu|reception|cours|relanc/.test(sN)) sBucket = 'En cours / Transmis';
      else if (/perdu|non retenu|rejet|annul/.test(sN)) sBucket = 'Perdu / Annulé';
      statuts[sBucket] = (statuts[sBucket] || 0) + 1;
    }
    if (objet) {
      const oN = objet.toUpperCase().slice(0, 30);
      objets[oN] = (objets[oN] || 0) + 1;
    }
    parsed.push({ type: bucket, entreprise, objet, statut });
  }

  const topObjets = Object.entries(objets).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  return {
    sheet: sheetName,
    total: parsed.length,
    byType,
    statuts,
    topObjets,
    rows: parsed.slice(0, 12),
  };
}

window.PREDICTION = { extractPdfText, extractSignals, parseAoExcel };

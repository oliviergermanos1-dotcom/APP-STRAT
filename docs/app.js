// Comité de Direction — vanilla browser app.
// Loads DSM + Mining JSON, manages a single in-memory "study" (datasets per
// metier), and calls window.generateStudyBuffer() to produce + download PPTX.

const METIERS = [
  { code: 'TIM', label: 'Transit Import Maritime', unit: 'TEU' },
  { code: 'TEM', label: 'Transit Export Maritime', unit: 'TEU' },
  { code: 'HIMP', label: 'Hinterland Import', unit: 'TEU' },
  { code: 'HEXP', label: 'Hinterland Export', unit: 'TEU' },
  { code: 'AER', label: 'Aérien Import', unit: 'kg' },
  { code: 'DSM', label: 'Direction Solutions Maritimes', unit: 'T' },
];

const DATASET_TYPES = [
  { key: 'concurrents',    label: 'Concurrents (rang/transitaire/volume/pdm)' },
  { key: 'clients',        label: 'Clients top 10 (client/volume/segment)' },
  { key: 'segments',       label: 'Segments (segment/volume_marche/pdm_agl)' },
  { key: 'mensuel',        label: 'Mensuel (mois/volume_marche/volume_agl)' },
  { key: 'nouveaux',       label: 'Nouveaux entrants (nom/volume/segment)' },
  { key: 'referentiel_n1', label: 'Référentiel N-1 (nom_entite/volume_annuel_n1)' },
];

const STORAGE_KEY = 'cdd_study_v1';

const state = {
  study: {
    title: `Etude_${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    metiers: METIERS.map((m) => m.code),
    datasets: [],
    n1Runs: [],
  },
};

// ─── PERSISTENCE (localStorage) ──────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.study));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.study = { ...state.study, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────
function detectSeparator(sample) {
  const firstLine = sample.split(/\r?\n/, 1)[0] || '';
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  const best = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  return counts[best] > 0 ? best : ',';
}

function parseCsv(content) {
  const separator = detectSeparator(content);
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: separator,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const columns = (parsed.meta.fields || []).map((f) => f.trim().toLowerCase());
  return { columns, rows: parsed.data, errors: parsed.errors };
}

function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const rows = json.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k.trim().toLowerCase()] = v;
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { columns, rows, errors: [] };
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    return parseCsv(await file.text());
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsx(await file.arrayBuffer());
  }
  throw new Error('Format non supporté : ' + file.name);
}

// Coerce French-formatted numbers ("1 234,5") into JS numbers.
function frenchNum(v) {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normaliseRows(rows) {
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.toLowerCase().includes('volume') || k.toLowerCase().includes('pdm') ||
          k.toLowerCase().includes('pct') || k.toLowerCase() === 'rang') {
        out[k] = frenchNum(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

// ─── DATASET MANAGEMENT ──────────────────────────────────────────────────────
async function handleUpload(metier, datasetType, file) {
  const parsed = await parseFile(file);
  const rows = normaliseRows(parsed.rows);
  state.study.datasets = state.study.datasets.filter(
    (d) => !(d.metier === metier && d.datasetType === datasetType),
  );
  state.study.datasets.push({
    metier,
    datasetType,
    filename: file.name,
    rowCount: rows.length,
    rows,
    uploadedAt: new Date().toISOString(),
  });
  saveState();
  renderDatasets();
  renderStatus();
}

function removeDataset(metier, datasetType) {
  state.study.datasets = state.study.datasets.filter(
    (d) => !(d.metier === metier && d.datasetType === datasetType),
  );
  saveState();
  renderDatasets();
  renderStatus();
}

function resetAll() {
  if (!confirm('Effacer toutes les données uploadées ?')) return;
  state.study.datasets = [];
  state.study.n1Runs = [];
  saveState();
  renderDatasets();
  renderStatus();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderStatus() {
  const el = document.getElementById('status');
  const count = state.study.datasets.length;
  el.textContent = count === 0
    ? '0 dataset chargé — la génération produira le PPTX de référence Jan-Mai 2026.'
    : `${count} dataset${count > 1 ? 's' : ''} chargé${count > 1 ? 's' : ''} — la génération utilisera ces données.`;
}

function renderDatasets() {
  const container = document.getElementById('datasets');
  container.innerHTML = '';
  for (const m of METIERS) {
    const card = document.createElement('section');
    card.className = 'border border-gray-200 rounded-lg p-4 bg-white';
    const uploaded = state.study.datasets.filter((d) => d.metier === m.code);

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3';
    header.innerHTML = `
      <div>
        <span class="text-sm font-bold text-navy">${m.code}</span>
        <span class="text-xs text-gray-600 ml-2">${m.label}</span>
        <span class="text-[10px] text-gray-400 ml-1">(${m.unit})</span>
      </div>
      <span class="text-xs ${uploaded.length ? 'text-aglgreen' : 'text-gray-400'}">${uploaded.length}/6</span>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-2';
    for (const dt of DATASET_TYPES) {
      const existing = uploaded.find((d) => d.datasetType === dt.key);
      const tile = document.createElement('div');
      tile.className = 'border border-gray-200 rounded p-2 text-xs';
      tile.innerHTML = `
        <div class="font-semibold text-navy text-[10px] mb-1">${dt.label}</div>
        ${existing
          ? `<div class="flex items-center justify-between">
              <span class="text-aglgreen">✓ ${existing.rowCount} lignes — ${existing.filename}</span>
              <button class="text-aglred text-[10px] hover:underline" data-remove="${m.code}|${dt.key}">retirer</button>
            </div>`
          : `<label class="block text-center text-gray-500 cursor-pointer hover:text-navy">
              <input type="file" class="hidden" data-upload="${m.code}|${dt.key}" accept=".csv,.tsv,.xlsx,.xls">
              déposer un fichier
            </label>`
        }
      `;
      grid.appendChild(tile);
    }
    card.appendChild(grid);
    container.appendChild(card);
  }

  // Wire up handlers
  container.querySelectorAll('input[data-upload]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const [metier, dt] = e.target.dataset.upload.split('|');
      try {
        await handleUpload(metier, dt, file);
      } catch (err) {
        alert('Erreur : ' + err.message);
      }
    });
  });
  container.querySelectorAll('button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [metier, dt] = btn.dataset.remove.split('|');
      removeDataset(metier, dt);
    });
  });
}

// ─── GENERATION ──────────────────────────────────────────────────────────────
async function generatePptx() {
  const btn = document.getElementById('generate-btn');
  const oldLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Génération en cours…';
  try {
    state.study.title = document.getElementById('study-title').value || state.study.title;
    state.study.periodStart = document.getElementById('study-start').value || state.study.periodStart;
    state.study.periodEnd = document.getElementById('study-end').value || state.study.periodEnd;
    saveState();

    const blob = await window.generateStudyBuffer({ study: state.study });
    const filename = `Comite_de_Direction_${state.study.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pptx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Erreur génération : ' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = oldLabel;
  }
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
async function boot() {
  // Load embedded reference data
  const [dsmRes, miningRes] = await Promise.all([
    fetch('./data/dsm.json'),
    fetch('./data/mining_clients.json'),
  ]);
  window.__DSM_DATA__ = await dsmRes.json();
  window.__MINING_DATA__ = await miningRes.json();

  loadState();

  document.getElementById('study-title').value = state.study.title;
  document.getElementById('study-start').value = state.study.periodStart;
  document.getElementById('study-end').value = state.study.periodEnd;
  document.getElementById('generate-btn').addEventListener('click', generatePptx);
  document.getElementById('reset-btn').addEventListener('click', resetAll);

  renderDatasets();
  renderStatus();
}

document.addEventListener('DOMContentLoaded', boot);

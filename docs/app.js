// Comité de Direction — vanilla browser app (STATCOM-driven, period-aware).
//
// Flow:
//   1. Olivier uploads STATCOM raw xlsx files (N + N-1 per metier).
//   2. parseStatcomBuffer() filters and normalises rows; rows kept in memory.
//   3. At generation time, buildDatasets() derives the slide datasets using
//      the selected period (N) and cross-checks against full N-1 for nouveaux.
//   4. generateStudyBuffer() emits the 35-slide PPTX.

const METIERS = [
  { code: 'TIM',  label: 'Transit Import Maritime', unit: 'TEU' },
  { code: 'TEM',  label: 'Transit Export Maritime', unit: 'TEU' },
  { code: 'HIMP', label: 'Hinterland Import',       unit: 'TEU' },
  { code: 'HEXP', label: 'Hinterland Export',       unit: 'TEU' },
  { code: 'AER',  label: 'Aérien Import',           unit: 'kg'  },
  { code: 'DSM',  label: 'Direction Solutions Maritimes', unit: 'T' },
];

const STORAGE_KEY = 'cdd_study_v3';

// Persisted metadata (file names, counts) — small and safe for localStorage.
const state = {
  study: {
    title: `Etude_${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
    periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    metiers: METIERS.map((m) => m.code),
  },
  // statcomMeta[`${metier}|${scope}`] = { filename, rowCount, keptCount, dropped, market, schema, unit }
  statcomMeta: {},
};

// Raw kept rows (per metier+scope), in-memory only — too big for localStorage.
// Lost on page refresh; user re-uploads.
const rowsCache = {}; // rowsCache[`${metier}|${scope}`] = [...rows]

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      study: state.study,
      statcomMeta: state.statcomMeta,
    }));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.study) state.study = { ...state.study, ...p.study };
    if (p.statcomMeta) state.statcomMeta = p.statcomMeta;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
}

// ─── STATCOM UPLOAD ──────────────────────────────────────────────────────────
// Pool of Web Workers (1 per active parse) to keep the UI thread free.
function parseInWorker(buffer, metier, filename, opts) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./parser-worker.js');
    const id = Math.random().toString(36).slice(2);
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker error'));
    };
    // Transfer the ArrayBuffer (no copy) — much faster for big files.
    worker.postMessage({ id, buffer, metier, filename, opts }, [buffer]);
  });
}

async function handleStatcomUpload(metier, scope, file) {
  const tile = document.querySelector(`[data-tile="${metier}|${scope}"]`);
  setTileBusy(tile, `Parsing ${file.name} en arrière-plan… (l'interface reste fluide)`);

  try {
    const buffer = await file.arrayBuffer();
    const filterOpts = {
      excludeNonApure:           document.getElementById('filter-non-apure').checked,
      excludePetroleum:          document.getElementById('filter-petroleum').checked,
      excludeSirSmbTransitaire:  document.getElementById('filter-sir-transit').checked,
      excludeSirSmbDestinataire: document.getElementById('filter-sir-dest').checked,
    };
    const result = await parseInWorker(buffer, metier, file.name, filterOpts);

    rowsCache[`${metier}|${scope}`] = result.kept;
    state.statcomMeta[`${metier}|${scope}`] = {
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      rowCount: result.rowCount,
      keptCount: result.keptCount,
      dropped: result.dropped,
      market: result.market,
      schema: result.schema,
      unit: result.unit,
      filters: filterOpts,
    };
    saveState();
    renderDatasets();
    renderStatus();
  } catch (err) {
    alert(`Erreur parsing ${file.name} : ${err.message}`);
    console.error(err);
    renderDatasets();
  }
}

function removeStatcom(metier, scope) {
  delete state.statcomMeta[`${metier}|${scope}`];
  delete rowsCache[`${metier}|${scope}`];
  saveState();
  renderDatasets();
  renderStatus();
}

function resetAll() {
  if (!confirm('Effacer toutes les données uploadées ?')) return;
  state.statcomMeta = {};
  for (const k of Object.keys(rowsCache)) delete rowsCache[k];
  localStorage.removeItem(STORAGE_KEY);
  renderDatasets();
  renderStatus();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function setTileBusy(tile, message) {
  if (!tile) return;
  tile.innerHTML = `
    <div class="text-xs text-aglblue flex items-center gap-2">
      <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="50 100" />
      </svg>
      ${message}
    </div>`;
}

function renderStatus() {
  const el = document.getElementById('status');
  const loaded = Object.keys(state.statcomMeta).length;
  const inMemory = Object.keys(rowsCache).length;
  if (loaded === 0) {
    el.innerHTML = '<span class="text-gray-500">Aucun fichier STATCOM chargé — la génération produira le PPTX de référence Jan-Mai 2026.</span>';
  } else if (inMemory < loaded) {
    el.innerHTML = `<span class="text-aglorange">${loaded} fichier(s) enregistrés mais ${loaded - inMemory} ont été perdus au refresh — re-déposer pour générer en mode live.</span>`;
  } else {
    const mNames = [...new Set(Object.keys(state.statcomMeta).map((k) => k.split('|')[0]))];
    el.innerHTML = `<span class="text-aglgreen font-semibold">${loaded} fichier(s) STATCOM parsé(s)</span> sur ${mNames.length} métier(s) (${mNames.join(', ')}). La génération utilisera la période sélectionnée.`;
  }
}

function renderDatasets() {
  const container = document.getElementById('datasets');
  container.innerHTML = '';

  for (const m of METIERS) {
    const card = document.createElement('section');
    card.className = 'border border-gray-200 rounded-lg p-4 bg-white';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3';
    const hasN  = state.statcomMeta[`${m.code}|n`];
    const hasN1 = state.statcomMeta[`${m.code}|n1`];
    const memN  = rowsCache[`${m.code}|n`];
    const memN1 = rowsCache[`${m.code}|n1`];
    header.innerHTML = `
      <div>
        <span class="text-sm font-bold text-navy">${m.code}</span>
        <span class="text-xs text-gray-600 ml-2">${m.label}</span>
        <span class="text-[10px] text-gray-400 ml-1">(${m.unit})</span>
      </div>
      <span class="text-[10px] ${hasN ? 'text-aglgreen' : 'text-gray-400'}">
        ${hasN ? (memN ? '✓ N' : '⚠ N (re-uploader)') : '— N'} ·
        ${hasN1 ? (memN1 ? '✓ N-1' : '⚠ N-1 (re-uploader)') : '— N-1'}
      </span>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-3';

    for (const scope of ['n', 'n1']) {
      const meta = state.statcomMeta[`${m.code}|${scope}`];
      const hasMem = Boolean(rowsCache[`${m.code}|${scope}`]);
      const slot = document.createElement('div');
      slot.className = 'border border-gray-200 rounded p-3';
      slot.innerHTML = `
        <div class="font-semibold text-navy text-xs mb-1">
          STATCOM ${scope === 'n' ? 'année courante (N)' : 'année précédente complète (N-1)'}
        </div>
        <div class="text-[10px] text-gray-500 mb-2">
          ${scope === 'n'
            ? 'Filtré sur la période sélectionnée pour KPI / classement / clients / segments / mensuel'
            : 'Sert au croisement nouveaux entrants (toute l\'année N-1)'}
        </div>
        <div data-tile="${m.code}|${scope}">
          ${meta
            ? `<div class="text-xs">
                <div class="${hasMem ? 'text-aglgreen' : 'text-aglorange'}">
                  ${hasMem ? '✓' : '⚠'} ${meta.filename}
                </div>
                <div class="text-gray-600 mt-1">
                  ${meta.rowCount.toLocaleString('fr-FR')} B/L · gardés ${meta.keptCount.toLocaleString('fr-FR')}
                  · marché ${Math.round(meta.market).toLocaleString('fr-FR')} ${meta.unit}
                </div>
                ${meta.dropped ? `<div class="text-[10px] text-gray-500 mt-0.5">
                  filtrés: non-qual ${meta.dropped.nonQualified || 0} ·
                  non-apuré ${meta.dropped.nonApure || 0} ·
                  SIR/SMB-tr ${meta.dropped.sirSmbTransit || 0} ·
                  SIR/SMB-de ${meta.dropped.sirSmbDest || 0} ·
                  pétroliers ${meta.dropped.petroleum || 0}
                </div>` : ''}
                ${!hasMem ? '<div class="text-[10px] text-aglorange mt-1 italic">Rows perdus au refresh — re-uploader pour générer live</div>' : ''}
                <div class="mt-2 flex gap-3">
                  <button class="text-aglred text-[10px] hover:underline" data-remove="${m.code}|${scope}">retirer</button>
                  <label class="text-aglblue text-[10px] hover:underline cursor-pointer">
                    <input type="file" class="hidden" data-upload="${m.code}|${scope}" accept=".xlsx,.xls">
                    remplacer
                  </label>
                </div>
              </div>`
            : `<label class="block text-center text-gray-500 cursor-pointer hover:text-navy text-xs border border-dashed border-gray-300 rounded p-2">
                <input type="file" class="hidden" data-upload="${m.code}|${scope}" accept=".xlsx,.xls">
                déposer un xlsx STATCOM
              </label>`
          }
        </div>
      `;
      grid.appendChild(slot);
    }

    card.appendChild(grid);
    container.appendChild(card);
  }

  container.querySelectorAll('input[data-upload]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const [metier, scope] = e.target.dataset.upload.split('|');
      await handleStatcomUpload(metier, scope, file);
    });
  });
  container.querySelectorAll('button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [metier, scope] = btn.dataset.remove.split('|');
      removeStatcom(metier, scope);
    });
  });
}

// ─── PERIOD DERIVATION ───────────────────────────────────────────────────────
function parsePeriod() {
  const start = document.getElementById('study-start').value;
  const end = document.getElementById('study-end').value;
  if (!start || !end) return null;
  const sd = new Date(start);
  const ed = new Date(end);
  return {
    startYear: sd.getFullYear(),
    startMonth: sd.getMonth() + 1,
    endYear: ed.getFullYear(),
    endMonth: ed.getMonth() + 1,
  };
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

    const period = parsePeriod();

    // Build derived datasets per metier that has rows in memory
    const allDatasets = [];
    for (const m of METIERS) {
      const keptN = rowsCache[`${m.code}|n`];
      const keptN1 = rowsCache[`${m.code}|n1`];
      if (!keptN || keptN.length === 0) continue;
      const built = window.buildDatasets({
        keptN,
        keptN1: keptN1 || null,
        period,
        metier: m.code,
        filename: state.statcomMeta[`${m.code}|n`]?.filename || '',
      });
      // Stamp each dataset with metier so the adapter picks them up
      for (const ds of built.datasets) {
        allDatasets.push({
          metier: m.code,
          datasetType: ds.datasetType,
          filename: ds.filename,
          rowCount: ds.rowCount,
          rows: ds.rows,
        });
      }
    }

    const study = {
      title: state.study.title,
      periodStart: state.study.periodStart,
      periodEnd: state.study.periodEnd,
      datasets: allDatasets,
      n1Runs: [],
    };

    const blob = await window.generateStudyBuffer({ study });
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

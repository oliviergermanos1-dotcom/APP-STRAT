// Comité de Direction — vanilla browser app (STATCOM-driven).
//
// Workflow:
//   1. Olivier uploads one raw STATCOM xlsx per metier (one row per B/L).
//   2. window.parseStatcomBuffer() derives concurrents/clients/segments/mensuel
//      datasets directly from the raw export.
//   3. window.generateStudyBuffer() builds the 35-slide PPTX.

const METIERS = [
  { code: 'TIM',  label: 'Transit Import Maritime', unit: 'TEU' },
  { code: 'TEM',  label: 'Transit Export Maritime', unit: 'TEU' },
  { code: 'HIMP', label: 'Hinterland Import',       unit: 'TEU' },
  { code: 'HEXP', label: 'Hinterland Export',       unit: 'TEU' },
  { code: 'AER',  label: 'Aérien Import',           unit: 'kg'  },
  { code: 'DSM',  label: 'Direction Solutions Maritimes', unit: 'T' },
];

const STORAGE_KEY = 'cdd_study_v2';

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
  // Per-metier raw STATCOM file metadata (n = current year, n1 = N-1 reference)
  statcomFiles: {},
};

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
// localStorage stores derived datasets only (not the raw STATCOM file which
// can be 50+ MB and would blow the 5 MB quota). Raw file metadata (name +
// derived stats) is kept so the user sees what was uploaded.
function saveState() {
  try {
    const payload = { study: state.study, statcomFiles: state.statcomFiles };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('localStorage save failed (probably quota):', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.study) state.study = { ...state.study, ...p.study };
    if (p.statcomFiles) state.statcomFiles = p.statcomFiles;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
}

// ─── STATCOM UPLOAD ──────────────────────────────────────────────────────────
async function handleStatcomUpload(metier, scope, file) {
  const tile = document.querySelector(`[data-tile="${metier}|${scope}"]`);
  setTileBusy(tile, `Parsing ${file.name}… (peut prendre 30s sur les gros fichiers)`);

  try {
    const buffer = await file.arrayBuffer();
    const filterOpts = {
      excludeNonApure: document.getElementById('filter-non-apure').checked,
      excludePetroleum: document.getElementById('filter-petroleum').checked,
      excludeSirSmb: document.getElementById('filter-sir-smb').checked,
    };
    const result = await new Promise((resolve, reject) => {
      // Yield to the browser so the busy indicator shows
      setTimeout(() => {
        try {
          resolve(window.parseStatcomBuffer(buffer, metier, file.name, filterOpts));
        } catch (err) {
          reject(err);
        }
      }, 50);
    });

    // Remove previously derived datasets for this metier
    state.study.datasets = state.study.datasets.filter(
      (d) => !(d.metier === metier && d._fromStatcom === scope),
    );
    if (scope === 'n') {
      // For N (current period), inject concurrents/clients/segments/mensuel
      for (const ds of result.datasets.filter((d) => d.datasetType !== 'referentiel_n1')) {
        state.study.datasets.push({
          metier,
          datasetType: ds.datasetType,
          filename: file.name,
          rowCount: ds.rowCount,
          rows: ds.rows,
          _fromStatcom: 'n',
        });
      }
    } else {
      // For N-1, only inject the referential
      const ref = result.datasets.find((d) => d.datasetType === 'referentiel_n1');
      if (ref) {
        state.study.datasets.push({
          metier,
          datasetType: 'referentiel_n1',
          filename: file.name,
          rowCount: ref.rowCount,
          rows: ref.rows,
          _fromStatcom: 'n1',
        });
      }
    }

    state.statcomFiles[`${metier}|${scope}`] = {
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      rowCount: result.rowCount,
      qualifiedCount: result.qualifiedCount,
      market: result.market,
      dropped: result.dropped,
      schema: result.schema,
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
  delete state.statcomFiles[`${metier}|${scope}`];
  state.study.datasets = state.study.datasets.filter(
    (d) => !(d.metier === metier && d._fromStatcom === scope),
  );
  saveState();
  renderDatasets();
  renderStatus();
}

function resetAll() {
  if (!confirm('Effacer toutes les données uploadées et les datasets dérivés ?')) return;
  state.study.datasets = [];
  state.study.n1Runs = [];
  state.statcomFiles = {};
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
  const loaded = Object.keys(state.statcomFiles).length;
  if (loaded === 0) {
    el.innerHTML = '<span class="text-gray-500">Aucun fichier STATCOM chargé — la génération produira le PPTX de référence Jan-Mai 2026.</span>';
  } else {
    const mNames = [...new Set(Object.keys(state.statcomFiles).map((k) => k.split('|')[0]))];
    el.innerHTML = `<span class="text-aglgreen font-semibold">${loaded} fichier(s) STATCOM parsé(s)</span> sur ${mNames.length} métier(s) (${mNames.join(', ')}). La génération utilisera ces données.`;
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
    const hasN = state.statcomFiles[`${m.code}|n`];
    const hasN1 = state.statcomFiles[`${m.code}|n1`];
    header.innerHTML = `
      <div>
        <span class="text-sm font-bold text-navy">${m.code}</span>
        <span class="text-xs text-gray-600 ml-2">${m.label}</span>
        <span class="text-[10px] text-gray-400 ml-1">(${m.unit})</span>
      </div>
      <span class="text-[10px] ${hasN ? 'text-aglgreen' : 'text-gray-400'}">
        ${hasN ? '✓ N' : '— N'} · ${hasN1 ? '✓ N-1' : '— N-1'}
      </span>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-3';

    for (const scope of ['n', 'n1']) {
      const meta = state.statcomFiles[`${m.code}|${scope}`];
      const slot = document.createElement('div');
      slot.className = 'border border-gray-200 rounded p-3';
      slot.innerHTML = `
        <div class="font-semibold text-navy text-xs mb-1">
          STATCOM ${scope === 'n' ? 'année courante (N)' : 'référentiel N-1'}
        </div>
        <div class="text-[10px] text-gray-500 mb-2">
          ${scope === 'n'
            ? 'Sert à dériver concurrents / clients / segments / mensuel'
            : 'Sert à valider les nouveaux entrants (croisement N vs N-1)'}
        </div>
        <div data-tile="${m.code}|${scope}">
          ${meta
            ? `<div class="text-xs">
                <div class="text-aglgreen">✓ ${meta.filename}</div>
                <div class="text-gray-600 mt-1">
                  ${meta.rowCount.toLocaleString('fr-FR')} B/L · qualifiés ${meta.qualifiedCount.toLocaleString('fr-FR')}
                  ${meta.market ? ` · marché ${Math.round(meta.market).toLocaleString('fr-FR')} ${m.unit}` : ''}
                </div>
                ${meta.dropped ? `<div class="text-[10px] text-gray-500 mt-0.5">
                  filtrés : non-qual. ${meta.dropped.nonQualified || 0} ·
                  non-apuré ${meta.dropped.nonApure || 0} ·
                  SIR/SMB ${meta.dropped.sirSmb || 0} ·
                  pétroliers ${meta.dropped.petroleum || 0}
                </div>` : ''}
                <button class="text-aglred text-[10px] hover:underline mt-2" data-remove="${m.code}|${scope}">retirer</button>
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

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

// Set of keys (metier|scope) whose rows are currently live in the worker.
// Worker holds the actual data; main thread only tracks which keys are warm.
// Lost on page refresh (worker dies with the tab) — user re-uploads.
const workerKeys = new Set();

// Prediction inputs (PDF newsletters + AO Excel + authored preconisations).
const prediction = {
  pdfTexts: [],         // [{ name, text }]
  ao: null,             // parsed AO summary
  signals: null,        // extracted sector/country signals
  preconisations: null, // authored content loaded from data/preconisations.json
};

// Imported PowerPoints copied verbatim into the deck (sections 09 CX / 10).
const imports = {
  cx: null,       // { name, buffer }
  analyse: null,  // { name, buffer }
};

// Fallback préconisations (used if data/preconisations.json fails to load).
const FALLBACK_PRECONISATIONS = {
  horizon: '12 mois',
  secteurs: 'Mines & Or, BTP & Ciment, Agro & Cacao, Automobile/RoRo.',
  marchandises: 'Engins miniers, clinker/ciment, véhicules RoRo, intrants agricoles, reefer.',
  clients: 'Sociétés minières à conquérir, négociants engins, donneurs d\'ordre BTP, chargeurs cacao.',
  recommandations: 'Verrouiller le minier, offensive Hinterland Import, cross-sell aérien, offre RoRo dédiée.',
  synthese: 'AGL CI consolide 3 positions #1 ; relais de croissance minier & BTP, conquête sur Hinterland Import et export cacao.',
};

// Original uploaded File/Blob objects, kept so the whole session can be saved
// to (and restored from) IndexedDB. Disk-backed Blobs — cheap to hold.
const sourceFiles = {
  statcom: {},  // key "TIM|n" → File
  ao: null,     // File
  cx: null,     // File
  analyse: null,// File
};

// ─── IndexedDB (large binary session storage) ────────────────────────────────
const IDB_NAME = 'cdd_session';
const IDB_STORE = 'kv';
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => { db.close(); resolve(r.result); };
    r.onerror = () => reject(r.error);
  });
}
async function idbClear() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

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
// ─── Persistent worker + RPC ────────────────────────────────────────────────
// One stateful worker owns the giant kept[] arrays. We only exchange small
// payloads (metadata, derived datasets) across the thread boundary.
let _worker = null;
const _pending = new Map(); // id → { resolve, reject, onProgress }

function getWorker() {
  if (_worker) return _worker;
  _worker = new Worker('./parser-worker.js?v=20260729b');
  _worker.onmessage = (e) => {
    const msg = e.data;
    const p = _pending.get(msg.id);
    if (!p) return;
    if (msg.kind === 'progress') {
      if (p.onProgress) p.onProgress(msg.phase);
      return;
    }
    _pending.delete(msg.id);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error || 'Worker error'));
  };
  _worker.onerror = (e) => {
    console.error('Worker error', e);
  };
  return _worker;
}

function callWorker(message, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    _pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, ...message }, transfer || []);
  });
}

function workerParse(key, buffer, metier, filename, opts, onProgress) {
  return callWorker(
    { kind: 'parse', key, buffer, metier, filename, opts },
    [buffer],
    onProgress,
  );
}

function workerForget(key) {
  return callWorker({ kind: 'forget', key });
}

function workerBuild(metierKeys, period, extras) {
  const e = extras || {};
  return callWorker({
    kind: 'build', metierKeys, period,
    dsm: e.dsm || null, mining: e.mining || null, ayman: e.ayman || null,
    miningAer: e.miningAer || null,
    dsmReport: e.dsmReport || null,
  });
}

// ─── FILTRES : DÉTECTION DE MODIFICATION APRÈS CHARGEMENT ────────────────
// Les filtres d'exclusion sont appliqués AU PARSING (statcom-parser.js les
// lit une seule fois, au moment où le fichier est lu). Les décocher après
// coup ne changeait donc rien aux lignes déjà en mémoire — sans le moindre
// signal. Cas vécu : SIR/SMB décoché, total DSM inchangé à 17,3 M T.
// On compare désormais les filtres courants à ceux utilisés au parsing, et
// on propose de tout ré-analyser à partir des fichiers gardés en mémoire
// (sourceFiles.statcom), sans redemander de re-déposer quoi que ce soit.

function currentFilterOpts() {
  return {
    excludeNonApure:           document.getElementById('filter-non-apure').checked,
    excludePetroleum:          document.getElementById('filter-petroleum').checked,
    excludeSirSmbTransitaire:  document.getElementById('filter-sir-transit').checked,
    excludeSirSmbDestinataire: document.getElementById('filter-sir-dest').checked,
    excludeGas:                (document.getElementById('filter-gas') || {}).checked === true,
  };
}

const FILTER_LABELS = {
  excludeNonApure: 'Non Apuré',
  excludePetroleum: 'Pétroliers',
  excludeSirSmbTransitaire: 'SIR/SMB transitaire',
  excludeSirSmbDestinataire: 'SIR/SMB destinataire',
  excludeGas: 'Gaz (GPL/butane)',
};

function refreshFilterDirtyBanner() {
  const banner = document.getElementById('filter-dirty-banner');
  const detail = document.getElementById('filter-dirty-detail');
  if (!banner) return;
  const cur = currentFilterOpts();
  const diffs = new Set();
  let nbFichiers = 0;
  for (const [key, meta] of Object.entries(state.statcomMeta || {})) {
    if (!meta || !meta.filters) continue;
    nbFichiers++;
    for (const k of Object.keys(cur)) {
      if (!!meta.filters[k] !== !!cur[k]) diffs.add(FILTER_LABELS[k] || k);
    }
  }
  if (diffs.size === 0 || nbFichiers === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  if (detail) {
    detail.innerHTML =
      `Filtre(s) modifié(s) : <strong>${[...diffs].join(', ')}</strong>. ` +
      `${nbFichiers} fichier(s) ont été analysés avec les anciens réglages — ` +
      `vos chiffres ne changeront pas tant qu'ils n'auront pas été ré-analysés.`;
  }
}

async function reparseAllStatcom() {
  const btn = document.getElementById('filter-reparse-btn');
  const keys = Object.keys(sourceFiles.statcom || {});
  if (keys.length === 0) {
    alert("Aucun fichier en mémoire. Re-déposez les fichiers STATCOM : ils seront analysés avec les filtres actuels.");
    return;
  }
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; }
  let ok = 0, ko = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const [metier, scope] = key.split('|');
    const file = sourceFiles.statcom[key];
    if (!file) { ko++; continue; }
    if (btn) btn.textContent = `Ré-analyse ${i + 1}/${keys.length}…`;
    try {
      await handleStatcomUpload(metier, scope, file);
      ok++;
    } catch (e) {
      console.error('Re-parse échoué pour', key, e);
      ko++;
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = label || 'Tout ré-analyser'; }
  refreshFilterDirtyBanner();
  alert(`Ré-analyse terminée : ${ok} fichier(s) traité(s)` +
        (ko ? `, ${ko} en échec (re-déposez-les manuellement).` : '.') +
        `\n\nLes chiffres reflètent maintenant les filtres actuels.`);
}

function initFilterWatch() {
  ['filter-non-apure', 'filter-petroleum', 'filter-sir-transit', 'filter-sir-dest', 'filter-gas']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { refreshFilterDirtyBanner(); saveState(); });
    });
  const btn = document.getElementById('filter-reparse-btn');
  if (btn) btn.addEventListener('click', reparseAllStatcom);
  refreshFilterDirtyBanner();
}

async function handleStatcomUpload(metier, scope, file) {
  const key = `${metier}|${scope}`;
  const tile = document.querySelector(`[data-tile="${key}"]`);
  setTileBusy(tile, `Parsing ${file.name} en arrière-plan… (l'interface reste fluide)`);

  try {
    const buffer = await file.arrayBuffer();
    const filterOpts = currentFilterOpts();

    const reply = await workerParse(key, buffer, metier, file.name, filterOpts, (phase) => {
      const t = document.querySelector(`[data-tile="${key}"]`);
      if (!t) return;
      setTileBusy(t, `Parsing ${file.name}… (${phase})`);
    });

    // Mark this key as "live in worker" + keep the original file for saving.
    workerKeys.add(key);
    sourceFiles.statcom[key] = file;

    state.statcomMeta[key] = {
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      rowCount: reply.metadata.rowCount,
      keptCount: reply.metadata.keptCount,
      dropped: reply.metadata.dropped,
      market: reply.metadata.market,
      schema: reply.metadata.schema,
      unit: reply.metadata.unit,
      filters: filterOpts,
    };
    saveState();
    renderDatasets();
    renderStatus();
    refreshFilterDirtyBanner();
  } catch (err) {
    alert(`Erreur parsing ${file.name} : ${err.message}`);
    console.error(err);
    renderDatasets();
  }
}

async function removeStatcom(metier, scope) {
  const key = `${metier}|${scope}`;
  delete state.statcomMeta[key];
  delete sourceFiles.statcom[key];
  workerKeys.delete(key);
  try { await workerForget(key); } catch (_) {}
  saveState();
  renderDatasets();
  renderStatus();
}

async function resetAll() {
  if (!confirm('Effacer toutes les données uploadées ?')) return;
  for (const key of [...workerKeys]) {
    try { await workerForget(key); } catch (_) {}
  }
  workerKeys.clear();
  state.statcomMeta = {};
  sourceFiles.statcom = {}; sourceFiles.ao = null; sourceFiles.cx = null; sourceFiles.analyse = null;
  prediction.pdfTexts = []; prediction.ao = null; prediction.signals = null;
  imports.cx = null; imports.analyse = null;
  localStorage.removeItem(STORAGE_KEY);
  try { await idbClear(); } catch (_) {}
  renderDatasets();
  renderStatus();
  renderImports();
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
  const inMemory = workerKeys.size;
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

  // DSM is derived from the TIM import maritime base (by weight) — no upload.
  for (const m of METIERS.filter((x) => x.code !== 'DSM')) {
    const card = document.createElement('section');
    card.className = 'border border-gray-200 rounded-lg p-4 bg-white';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-3';
    const hasN  = state.statcomMeta[`${m.code}|n`];
    const hasN1 = state.statcomMeta[`${m.code}|n1`];
    const memN  = workerKeys.has(`${m.code}|n`);
    const memN1 = workerKeys.has(`${m.code}|n1`);
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
      const hasMem = workerKeys.has(`${m.code}|${scope}`);
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
                  pétroliers ${meta.dropped.petroleum || 0}${
                    (meta.dropped.geo || 0) > 0
                      ? ` · hors-CI ${meta.dropped.geo}`
                      : ''}
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

  // Note: DSM auto-derived from TIM
  const note = document.createElement('div');
  note.className = 'text-[11px] text-gray-500 italic border border-dashed border-gray-300 rounded p-2 bg-gray-50';
  note.innerHTML = 'ℹ️ <strong>DSM (Direction Maritime)</strong> est dérivée automatiquement de la base import maritime (TIM), agrégée au <strong>poids (tonnes)</strong> par armateur / manutentionnaire / consignataire / range. Aucun upload séparé requis.';
  container.appendChild(note);
}

// ─── PREDICTION INPUTS ───────────────────────────────────────────────────────
async function handlePdfUpload(files) {
  const list = document.getElementById('pdf-list');
  const arr = Array.from(files).slice(0, 6 - prediction.pdfTexts.length);
  for (const f of arr) {
    list.insertAdjacentHTML('beforeend', `<div class="text-aglblue">⏳ ${f.name}…</div>`);
    try {
      const text = await window.PREDICTION.extractPdfText(f);
      prediction.pdfTexts.push({ name: f.name, text, file: f });
    } catch (e) {
      console.error('PDF extract failed', e);
    }
  }
  prediction.signals = window.PREDICTION.extractSignals(prediction.pdfTexts.map((p) => p.text));
  renderPrediction();
}

async function handleAoUpload(file) {
  const _p = parsePeriod();
  const yr = _p ? _p.startYear : new Date().getFullYear();
  try {
    const buf = await file.arrayBuffer();
    prediction.ao = window.PREDICTION.parseAoExcel(buf, yr);
    prediction.ao._filename = file.name;
    sourceFiles.ao = file;
  } catch (e) {
    alert('Erreur parsing AO : ' + e.message);
  }
  renderPrediction();
}

function renderPrediction() {
  const list = document.getElementById('pdf-list');
  if (list) {
    list.innerHTML = prediction.pdfTexts.map((p, i) =>
      `<div class="flex justify-between"><span class="text-aglgreen">✓ ${p.name}</span>` +
      `<button class="text-aglred hover:underline" data-pdf-rm="${i}">retirer</button></div>`).join('');
    if (prediction.signals && prediction.signals.sectors.length) {
      list.insertAdjacentHTML('beforeend',
        `<div class="text-gray-500 mt-1">Signaux : ${prediction.signals.sectors.slice(0, 4).map((x) => x.name + '(' + x.count + ')').join(', ')}</div>`);
    }
    list.querySelectorAll('button[data-pdf-rm]').forEach((b) => b.addEventListener('click', () => {
      prediction.pdfTexts.splice(Number(b.dataset.pdfRm), 1);
      prediction.signals = window.PREDICTION.extractSignals(prediction.pdfTexts.map((p) => p.text));
      renderPrediction();
    }));
  }
  const aoList = document.getElementById('ao-list');
  if (aoList) {
    aoList.innerHTML = prediction.ao
      ? `<span class="text-aglgreen">✓ ${prediction.ao._filename}</span> — ${prediction.ao.total} dossiers (onglet ${prediction.ao.sheet}) · ` +
        Object.entries(prediction.ao.byType || {}).map(([k, v]) => k + ' ' + v).join(', ')
      : '';
  }
}

function collectPreconisations() {
  // Authored by the analyst (loaded from data/preconisations.json), not typed.
  return prediction.preconisations || FALLBACK_PRECONISATIONS;
}

// ─── IMPORTED PDFs (sections 09 CX / 10) ─────────────────────────────────────
// User exports his CX/Analyse PowerPoints to PDF (Fichier → Enregistrer sous → PDF)
// then uploads the PDFs here. We rasterise each PDF page to PNG via PDF.js in the
// browser; Python (Pyodide) inserts the PNGs as full-slide pictures after the
// section separators. This avoids the AGL GPO rejection of merged external XML.
async function handleImportUpload(slot, file) {
  try {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 }); // ~115 DPI for 13.33×7.5"
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      // Pre-fill white to flatten any alpha — PowerPoint AGL refuses canvas
      // PNGs that carry an alpha channel / ICC profile, so we ship JPEG bytes
      // (no alpha, no profile chunk, smaller payload).
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      pages.push(dataUrl.split(',')[1]); // base64 payload only
    }
    imports[slot] = { name: file.name, pngBase64: pages, mime: 'image/jpeg' };
    sourceFiles[slot] = file;
  } catch (e) {
    console.error(e);
    alert(`Erreur traitement PDF ${slot} : ${e.message}`);
  }
  renderImports();
}

function renderImports() {
  const draw = (slot, elId) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const n = imports[slot] && imports[slot].pngBase64
      ? imports[slot].pngBase64.length : 0;
    el.innerHTML = imports[slot]
      ? `<span class="text-aglgreen">✓ ${imports[slot].name}</span>` +
        (n ? ` <span class="text-gray-500">— ${n} page${n > 1 ? 's' : ''} convertie${n > 1 ? 's' : ''} en image</span>` : '') +
        ` <button class="text-aglred hover:underline ml-1" data-imp-rm="${slot}">retirer</button>`
      : '';
  };
  draw('cx', 'cx-list');
  draw('analyse', 'analyse-list');
  document.querySelectorAll('button[data-imp-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      imports[b.dataset.impRm] = null;
      sourceFiles[b.dataset.impRm] = null;
      renderImports();
    }));
}

// ─── SESSION SAVE / RESTORE (IndexedDB) ──────────────────────────────────────
async function saveSession() {
  const btn = document.getElementById('save-btn');
  const status = document.getElementById('save-status');
  btn.disabled = true;
  btn.textContent = 'Sauvegarde…';
  try {
    // Capture current settings from the form.
    state.study.title = document.getElementById('study-title').value || state.study.title;
    applyPeriodToState();

    await idbClear();

    const statcomKeys = [];
    for (const key of Object.keys(sourceFiles.statcom)) {
      if (sourceFiles.statcom[key]) {
        await idbSet('file:statcom:' + key, sourceFiles.statcom[key]);
        statcomKeys.push(key);
      }
    }
    const pdfFiles = prediction.pdfTexts.map((p) => p.file).filter(Boolean);
    for (let i = 0; i < pdfFiles.length; i++) await idbSet('file:pdf:' + i, pdfFiles[i]);
    if (sourceFiles.ao) await idbSet('file:ao', sourceFiles.ao);
    if (sourceFiles.cx) await idbSet('file:cx', sourceFiles.cx);
    if (sourceFiles.analyse) await idbSet('file:analyse', sourceFiles.analyse);

    const meta = {
      savedAt: new Date().toISOString(),
      study: state.study,
      statcomMeta: state.statcomMeta,
      filters: {
        gas: (document.getElementById('filter-gas') || {}).checked === true,
        nonApure: document.getElementById('filter-non-apure').checked,
        petroleum: document.getElementById('filter-petroleum').checked,
        sirTransit: document.getElementById('filter-sir-transit').checked,
        sirDest: document.getElementById('filter-sir-dest').checked,
      },
      keys: {
        statcom: statcomKeys,
        pdfCount: pdfFiles.length,
        ao: !!sourceFiles.ao, cx: !!sourceFiles.cx, analyse: !!sourceFiles.analyse,
      },
      names: {
        pdfs: prediction.pdfTexts.map((p) => p.name),
        ao: sourceFiles.ao ? sourceFiles.ao.name : null,
        cx: sourceFiles.cx ? sourceFiles.cx.name : null,
        analyse: sourceFiles.analyse ? sourceFiles.analyse.name : null,
      },
    };
    await idbSet('meta', meta);

    const n = statcomKeys.length + pdfFiles.length +
      (meta.keys.ao ? 1 : 0) + (meta.keys.cx ? 1 : 0) + (meta.keys.analyse ? 1 : 0);
    status.innerHTML = `<span class="text-aglgreen">✓ Session sauvegardée</span> le ${new Date().toLocaleString('fr-FR')} — ${n} fichier(s). Elle sera proposée à la restauration à la prochaine ouverture.`;
  } catch (e) {
    console.error(e);
    status.innerHTML = `<span class="text-aglred">Échec de la sauvegarde : ${e.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Sauvegarder la session';
  }
}

async function checkSavedSession() {
  let meta;
  try { meta = await idbGet('meta'); } catch (_) { return; }
  if (!meta) return;
  const banner = document.getElementById('restore-banner');
  const info = document.getElementById('restore-info');
  const k = meta.keys || {};
  const parts = [];
  if (k.statcom && k.statcom.length) parts.push(`${k.statcom.length} STATCOM`);
  if (k.pdfCount) parts.push(`${k.pdfCount} PDF`);
  if (k.ao) parts.push('AO');
  if (k.cx) parts.push('CX');
  if (k.analyse) parts.push('analyse');
  info.textContent = `(${new Date(meta.savedAt).toLocaleString('fr-FR')}${parts.length ? ' · ' + parts.join(', ') : ''})`;
  banner.classList.remove('hidden');
  document.getElementById('restore-dismiss').addEventListener('click', () => banner.classList.add('hidden'));
  document.getElementById('restore-btn').addEventListener('click', () => restoreSession(meta));
}

async function restoreSession(meta) {
  const banner = document.getElementById('restore-banner');
  const btn = document.getElementById('restore-btn');
  btn.disabled = true;
  btn.textContent = 'Restauration…';
  try {
    // Settings + filters first (parsing reads the filter checkboxes).
    if (meta.study) {
      document.getElementById('study-title').value = meta.study.title || '';
      setPeriodControls(meta.study);
      state.study = { ...state.study, ...meta.study };
    }
    if (meta.filters) {
      document.getElementById('filter-non-apure').checked = !!meta.filters.nonApure;
      document.getElementById('filter-petroleum').checked = !!meta.filters.petroleum;
      document.getElementById('filter-sir-transit').checked = !!meta.filters.sirTransit;
      document.getElementById('filter-sir-dest').checked = !!meta.filters.sirDest;
      const _g = document.getElementById('filter-gas');
      if (_g) _g.checked = !!meta.filters.gas;
    }
    // La restauration re-parse les fichiers avec ces filtres : la bannière
    // sera réévaluée en fin de restauration (voir refreshFilterDirtyBanner
    // appelé par handleStatcomUpload).

    const k = meta.keys || {};
    // STATCOM (re-parsed in the worker, sequentially).
    for (const key of (k.statcom || [])) {
      const file = await idbGet('file:statcom:' + key);
      if (!file) continue;
      const [metier, scope] = key.split('|');
      btn.textContent = `Restauration ${metier} ${scope.toUpperCase()}…`;
      await handleStatcomUpload(metier, scope, file);
    }
    // PDF newsletters.
    const pdfFiles = [];
    for (let i = 0; i < (k.pdfCount || 0); i++) {
      const f = await idbGet('file:pdf:' + i);
      if (f) pdfFiles.push(f);
    }
    if (pdfFiles.length) { btn.textContent = 'Restauration PDF…'; await handlePdfUpload(pdfFiles); }
    // AO Excel.
    if (k.ao) { const f = await idbGet('file:ao'); if (f) await handleAoUpload(f); }
    // Imported PowerPoints.
    if (k.cx) { const f = await idbGet('file:cx'); if (f) await handleImportUpload('cx', f); }
    if (k.analyse) { const f = await idbGet('file:analyse'); if (f) await handleImportUpload('analyse', f); }

    saveState();
    renderDatasets();
    renderStatus();
    banner.classList.add('hidden');
    const status = document.getElementById('save-status');
    if (status) status.innerHTML = '<span class="text-aglgreen">✓ Session restaurée — prête à générer.</span>';
  } catch (e) {
    console.error(e);
    alert('Erreur restauration : ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Restaurer';
  }
}

// ─── PERIOD DERIVATION ───────────────────────────────────────────────────────
const MONTHS_UI = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function _lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate(); // month 1..12
}

// Initialise les listes déroulantes (mois × 2, années × 2) et branche le
// récapitulatif live. Remplace les anciens <input type="date">, qui
// permettaient de saisir des dates inexistantes (31/06) et n'offraient
// aucun moyen de choisir l'année de comparaison.
function _sel(id) { return document.getElementById(id); }

function _periodEls() {
  return {
    mode: _sel('study-mode'),
    y: _sel('study-year'), m1: _sel('study-m1'), m2: _sel('study-m2'),
    y1: _sel('study-year-n1'), n1m1: _sel('study-n1-m1'), n1m2: _sel('study-n1-m2'),
  };
}

// Initialise les listes (mois × 4, années × 2), le mode d'analyse et le
// récapitulatif. Remplace les anciens <input type="date"> : une date
// inexistante (31/06) ne peut plus être saisie, et chaque période dispose
// désormais de sa PROPRE plage de mois.
function initPeriodControls() {
  const e = _periodEls();
  if (!e.mode || !e.y || !e.m1 || !e.m2 || !e.y1 || !e.n1m1 || !e.n1m2) return;

  [e.m1, e.m2, e.n1m1, e.n1m2].forEach((sel) => {
    MONTHS_UI.forEach((name, i) => sel.add(new Option(name, String(i + 1))));
  });
  const nowY = new Date().getFullYear();
  for (let v = nowY + 1; v >= nowY - 8; v--) {
    e.y.add(new Option(String(v), String(v)));
    e.y1.add(new Option(String(v), String(v)));
  }
  e.y.value = String(nowY);
  e.y1.value = String(nowY - 1);
  e.m1.value = '1'; e.m2.value = '12';
  e.n1m1.value = '1'; e.n1m2.value = '12';

  const sync = () => {
    // Une borne de fin ne peut jamais précéder sa borne de début.
    if (Number(e.m2.value) < Number(e.m1.value)) e.m2.value = e.m1.value;
    if (Number(e.n1m2.value) < Number(e.n1m1.value)) e.n1m2.value = e.n1m1.value;
    applyModeVisibility();
    renderPeriodRecap();
    saveState();
  };
  [e.mode, e.y, e.m1, e.m2, e.y1, e.n1m1, e.n1m2]
    .forEach((el) => el.addEventListener('change', sync));

  const setN = (a, b) => { e.m1.value = String(a); e.m2.value = String(b); sync(); };
  const p = (id, a, b) => { const el = _sel(id); if (el) el.addEventListener('click', () => setN(a, b)); };
  p('preset-full', 1, 12); p('preset-s1', 1, 6); p('preset-s2', 7, 12);

  const mirror = _sel('cmp-mirror');
  if (mirror) mirror.addEventListener('click', () => {
    e.n1m1.value = e.m1.value; e.n1m2.value = e.m2.value; sync();
  });

  applyModeVisibility();
  renderPeriodRecap();
}

function applyModeVisibility() {
  const e = _periodEls();
  const blk = _sel('cmp-block');
  if (!e.mode || !blk) return;
  blk.style.display = (e.mode.value === 'single') ? 'none' : '';
}

function _rangeLabel(m1, m2, year) {
  return (m1 === m2)
    ? `${MONTHS_UI[m1 - 1]} ${year}`
    : `${MONTHS_UI[m1 - 1]} → ${MONTHS_UI[m2 - 1]} ${year}`;
}

function renderPeriodRecap() {
  const box = _sel('period-recap');
  const p = parsePeriod();
  if (!box || !p) return;
  const nbN = p.endMonth - p.startMonth + 1;
  const base = `<strong>Période étudiée :</strong> ${_rangeLabel(p.startMonth, p.endMonth, p.startYear)} (${nbN} mois)`;
  if (!p.compare) {
    box.innerHTML = base +
      ' &nbsp;·&nbsp; <span style="color:#6B7280">Sans comparatif — les séries et colonnes N-1 seront omises.</span>';
    return;
  }
  const nbN1 = p.n1EndMonth - p.n1StartMonth + 1;
  let html = base + ' &nbsp;·&nbsp; ' +
    `<strong>Comparée à :</strong> ${_rangeLabel(p.n1StartMonth, p.n1EndMonth, p.n1StartYear)} (${nbN1} mois)`;
  const warn = [];
  if (p.n1StartYear === p.startYear && p.n1StartMonth === p.startMonth && p.n1EndMonth === p.endMonth) {
    warn.push('les deux périodes sont identiques');
  }
  if (nbN !== nbN1) {
    // L'appariement mensuel se fait par RANG, pas par nom de mois : le 1er
    // mois de N est comparé au 1er mois de N-1, etc. Des durées inégales
    // laissent donc des mois sans contrepartie.
    warn.push(`durées inégales (${nbN} vs ${nbN1} mois) — l'appariement se fait mois à mois par rang, ` +
              `${Math.abs(nbN - nbN1)} mois resteront sans contrepartie`);
  }
  if (warn.length) {
    html += ` &nbsp;— <span style="color:#B45309">⚠ ${warn.join(' ; ')}</span>`;
  }
  box.innerHTML = html;
}

// Écrit la période courante dans state.study (dates ISO + libellé lisible),
// pour la sauvegarde de session et pour l'en-tête du PPTX.
function applyPeriodToState() {
  const p = parsePeriod();
  if (!p) return;
  state.study.periodStart = `${p.startYear}-${String(p.startMonth).padStart(2, '0')}-01`;
  state.study.periodEnd = `${p.endYear}-${String(p.endMonth).padStart(2, '0')}-` +
    String(_lastDayOfMonth(p.endYear, p.endMonth)).padStart(2, '0');
  const lblN = `${MONTHS_UI[p.startMonth - 1]}–${MONTHS_UI[p.endMonth - 1]} ${p.startYear}`;
  state.study.periodLabel = p.compare
    ? `${lblN} vs ${MONTHS_UI[p.n1StartMonth - 1]}–${MONTHS_UI[p.n1EndMonth - 1]} ${p.n1StartYear}`
    : lblN;
  state.study.comparisonYear = p.compare ? p.n1StartYear : null;
  state.study.periodMode = p.compare ? 'compare' : 'single';
  state.study.n1StartMonth = p.compare ? p.n1StartMonth : null;
  state.study.n1EndMonth = p.compare ? p.n1EndMonth : null;
}

// Repositionne les sélecteurs depuis un state sauvegardé. Gère les sessions
// antérieures aux sélecteurs (periodStart/End ISO seuls) : année/mois sont
// déduits et la comparaison retombe sur année−1, mêmes mois.
function setPeriodControls(study) {
  if (!study) return;
  const e = _periodEls();
  if (!e.mode || !e.y || !e.m1) return;

  const parse = (iso) => {
    const mt = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    return mt ? { y: Number(mt[1]), m: Number(mt[2]) } : null;
  };
  const a = parse(study.periodStart);
  const b = parse(study.periodEnd);
  const ensure = (sel, val) => {
    if (val == null) return;
    if (![...sel.options].some((o) => o.value === String(val))) {
      sel.add(new Option(String(val), String(val)));
    }
    sel.value = String(val);
  };

  if (a) { ensure(e.y, a.y); e.m1.value = String(a.m); }
  if (b) e.m2.value = String(Math.max(b.m, a ? a.m : b.m));

  const single = (study.periodMode === 'single')
    || (study.periodMode == null && study.comparisonYear === null && !!study.periodLabel);
  e.mode.value = single ? 'single' : 'compare';

  ensure(e.y1, study.comparisonYear != null ? study.comparisonYear : (a ? a.y - 1 : null));
  e.n1m1.value = String(study.n1StartMonth != null ? study.n1StartMonth : (a ? a.m : 1));
  e.n1m2.value = String(study.n1EndMonth != null ? study.n1EndMonth : (b ? b.m : 12));

  applyModeVisibility();
  renderPeriodRecap();
}

// Chaque période porte sa PROPRE plage de mois : on peut comparer
// Janv–Juin 2026 à Juil–Déc 2025. compare:false = étude mono-période
// (on ne met pas n1 à null : inPeriod(row, null) vaut true pour toutes les
// lignes, ce qui ferait entrer tout le fichier N-1 dans les agrégats).
function parsePeriod() {
  const e = _periodEls();
  if (!e.mode || !e.y || !e.m1 || !e.m2 || !e.y1 || !e.n1m1 || !e.n1m2) return null;
  if (!e.y.value || !e.m1.value || !e.m2.value) return null;
  const sm = Number(e.m1.value);
  const em = Math.max(Number(e.m2.value), sm);
  const yr = Number(e.y.value);
  const cmp = (e.mode.value !== 'single');
  const n1sm = Number(e.n1m1.value || sm);
  const n1em = Math.max(Number(e.n1m2.value || em), n1sm);
  const yr1 = cmp ? Number(e.y1.value) : null;
  return {
    startYear: yr, startMonth: sm, endYear: yr, endMonth: em,
    compare: cmp,
    n1StartYear: yr1, n1EndYear: yr1,
    n1StartMonth: cmp ? n1sm : null,
    n1EndMonth: cmp ? n1em : null,
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

    const period = parsePeriod();
    if (!period) {
      throw new Error("Période incomplète : sélectionnez les mois et les deux années avant de générer.");
    }
    // Dates ISO dérivées des sélecteurs — impossible de produire une date
    // inexistante (le dernier jour du mois est calculé, pas saisi).
    applyPeriodToState();
    saveState();

    // Build derived datasets IN the worker (rows never cross the boundary).
    const metierKeys = {};
    for (const m of METIERS) {
      const keyN = `${m.code}|n`;
      if (!workerKeys.has(keyN)) continue;
      metierKeys[m.code] = {
        n: keyN,
        n1: workerKeys.has(`${m.code}|n1`) ? `${m.code}|n1` : null,
      };
    }

    // MINING focus reste dérivé de la base import maritime (TIM).
    const timRef = workerKeys.has('TIM|n')
      ? { nKey: 'TIM|n', n1Key: workerKeys.has('TIM|n1') ? 'TIM|n1' : null }
      : null;
    const mining = timRef;
    // Focus minier AÉRIEN : étude distincte, base AER Import, en tonnes.
    // Jamais cumulée au maritime — deux jeux de chiffres séparés.
    const miningAer = workerKeys.has('AER|n')
      ? { nKey: 'AER|n', n1Key: workerKeys.has('AER|n1') ? 'AER|n1' : null }
      : null;

    // ── PÉRIMÈTRE DSM : TIM + HINTERLAND IMPORT ──────────────────────────
    // Le DSM couvre l'ensemble de l'import maritime débarqué à Abidjan et
    // San Pedro. Or TIM ne retient que les marchandises livrées en Côte
    // d'Ivoire (filtre géographique du parseur) : tout le transit vers le
    // Mali et le Burkina part dans HIMP. Alimenter le DSM par TIM seul
    // amputait donc le marché d'environ 5 M T/an.
    // Validé face au rapport DSM de référence : sur les 10 premiers
    // armateurs, 8 tombent à moins de 0,1 % une fois TIM et HIMP cumulés
    // (MSC, CMA CGM, MAERSK, AFFRETES BLE, ARMATEURS DIVERS RIZ…).
    const dsm = timRef ? {
      nKey: timRef.nKey,
      n1Key: timRef.n1Key,
      extraNKeys:  workerKeys.has('HIMP|n')  ? ['HIMP|n']  : [],
      extraN1Keys: workerKeys.has('HIMP|n1') ? ['HIMP|n1'] : [],
    } : null;

    // ── REPORTING DSM : import ET export ─────────────────────────────────
    // Format Direction Maritime : 2 vues d'ensemble + 6 tableaux
    // (armateurs / manutentionnaires / consignataires × TEU / conventionnel).
    // Import = TIM + Hinterland Import, Export = TEM + Hinterland Export.
    const dsmReport = {
      importN:  ['TIM|n',  'HIMP|n' ].filter((k) => workerKeys.has(k)),
      importN1: ['TIM|n1', 'HIMP|n1'].filter((k) => workerKeys.has(k)),
      exportN:  ['TEM|n',  'HEXP|n' ].filter((k) => workerKeys.has(k)),
      exportN1: ['TEM|n1', 'HEXP|n1'].filter((k) => workerKeys.has(k)),
    };

    // AYMAN focus — across every uploaded métier (current period source).
    const ayman = METIERS
      .filter((m) => m.code !== 'DSM' && workerKeys.has(`${m.code}|n`))
      .map((m) => ({
        metier: m.code,
        nKey: `${m.code}|n`,
        n1Key: workerKeys.has(`${m.code}|n1`) ? `${m.code}|n1` : null,
      }));

    let allDatasets = [];
    if (Object.keys(metierKeys).length > 0 || dsm) {
      btn.textContent = 'Agrégation des données…';
      const buildResult = await workerBuild(metierKeys, period, { dsm, mining, miningAer, ayman, dsmReport });
      allDatasets = buildResult.datasets;

      // ── GARDE-FOU PÉRIODE ↔ DONNÉES ──────────────────────────────────
      // Sans ce contrôle, un métier sans aucune ligne sur la période
      // laissait generator.py se rabattre en silence sur ses valeurs de
      // démonstration (193 989 TEU, Jan–Mai, STRACOTRANS…). Le deck
      // paraissait crédible mais ne contenait aucune donnée réelle.
      // Règle : les chiffres du PPTX doivent toujours correspondre aux
      // dates saisies, sinon on refuse de générer.
      const reports = buildResult.reports || {};
      const vides = [];
      const servis = [];
      for (const [m, rep] of Object.entries(reports)) {
        const cov = rep && rep.coverage;
        if (!cov) continue;
        if (cov.rowsInPeriodN > 0) { servis.push(m); continue; }
        vides.push(
          `• ${m} : 0 B/L retenu sur la période demandée` +
          (cov.min || cov.max || (cov.n && cov.n.min)
            ? ` — ce fichier couvre ${(cov.n && cov.n.min) || '?'} → ${(cov.n && cov.n.max) || '?'}`
            : '')
        );
      }
      // ── ALERTE N-1 ABSENT ────────────────────────────────────────────
      // Comparatif demandé mais aucune ligne N-1 retenue : le deck
      // sortirait sans aucune variation ni série N-1, sans que rien ne
      // l'explique. Causes usuelles : fichier N-1 non chargé, ou fichier
      // N-1 ne couvrant pas l'année de comparaison choisie.
      if (period && period.compare) {
        const sansN1 = [];
        for (const [m, rep] of Object.entries(reports)) {
          const cov = rep && rep.coverage;
          if (!cov || cov.rowsInPeriodN === 0) continue;
          if (cov.rowsInPeriodN1 === 0) {
            sansN1.push(`• ${m} — fichier N-1 couvre ` +
              `${(cov.n1 && cov.n1.min) || 'aucune donnée'}` +
              `${cov.n1 && cov.n1.max ? ' → ' + cov.n1.max : ''}`);
          }
        }
        if (sansN1.length > 0) {
          const cy = state.study.comparisonYear;
          const ok = window.confirm(
            `Comparaison demandée sur ${cy}, mais aucune donnée N-1 n'a été trouvée pour :\n` +
            `${sansN1.join('\n')}\n\n` +
            "Le PPTX sortira sans variation ni série N-1 sur ces métiers.\n\n" +
            "Vérifiez que les fichiers STATCOM N-1 sont bien chargés et qu'ils " +
            `couvrent l'année ${cy}.\n\nGénérer quand même ?`
          );
          if (!ok) throw new Error('Génération annulée — vérifiez les fichiers N-1.');
        }
      }

      if (vides.length > 0) {

        const pStart = state.study.periodStart;
        const pEnd = state.study.periodEnd;
        const entete =
          `Période demandée : ${pStart} → ${pEnd}\n\n` +
          `Aucune donnée ne correspond à cette période pour :\n${vides.join('\n')}\n\n`;
        if (servis.length === 0) {
          throw new Error(
            entete +
            "Génération annulée : le PPTX aurait affiché des valeurs de démonstration " +
            "au lieu de vos données.\n\n" +
            "Corrigez les dates ci-dessus, ou chargez des fichiers STATCOM couvrant " +
            "la période voulue (N = période étudiée, N-1 = année précédente)."
          );
        }
        const suite = window.confirm(
          entete +
          `Métiers correctement alimentés : ${servis.join(', ')}.\n\n` +
          "Les métiers listés ci-dessus afficheront des valeurs de DÉMONSTRATION, " +
          "pas vos données.\n\nContinuer quand même ?"
        );
        if (!suite) throw new Error('Génération annulée — corrigez la période ou les fichiers.');
      }

      btn.textContent = 'Composition du PPTX…';
    }

    // ── Assets visuels embarqués dans le repo (docs/cover.jpg.png +
    // docs/agl_logo.png) → fetch → base64 → passés à Python via study.assets.
    // Cover image : remplace la slide 1 plein écran.
    // Logo AGL : ajouté bas-droite de toutes les slides sauf la cover.
    async function fetchAsBase64(path) {
      try {
        const resp = await fetch(path);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return await new Promise((resolve) => {
          const r = new FileReader();
          r.onloadend = () => {
            // Strip data URL prefix → keep only base64 payload
            const idx = String(r.result).indexOf(',');
            resolve(idx >= 0 ? String(r.result).slice(idx + 1) : r.result);
          };
          r.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('Asset fetch failed for', path, e);
        return null;
      }
    }
    btn.textContent = 'Chargement assets visuels…';
    const [coverB64, logoB64] = await Promise.all([
      fetchAsBase64('./cover.jpg.png?v=' + (window.APP_VERSION || '20260729b')),
      fetchAsBase64('./agl_logo.png?v=' + (window.APP_VERSION || '20260729b')),
    ]);

    const study = {
      title: state.study.title,
      periodStart: state.study.periodStart,
      periodEnd: state.study.periodEnd,
      periodLabel: state.study.periodLabel || null,
      comparisonYear: state.study.comparisonYear || null,
      datasets: allDatasets,
      n1Runs: [],
      // Version du code chargée — imprimée dans la cover du PPTX pour que
      // l'utilisateur puisse vérifier post-download que la dernière version
      // a bien servi à générer le deck.
      appVersion: window.APP_VERSION || 'unknown',
      generatedAt: new Date().toISOString(),
      // Assets visuels (PNG base64) — utilisés par generator.py pour la
      // cover full-screen et le logo bas-droite sur chaque slide.
      assets: {
        coverImage: coverB64,
        aglLogo: logoB64,
      },
      prediction: {
        pdfCount: prediction.pdfTexts.length,
        signals: prediction.signals,
        ao: prediction.ao,
        preconisations: collectPreconisations(),
      },
      // PDF→PNG imports: each one becomes a series of full-slide images,
      // inserted by Python right after the corresponding section separator.
      imports: {
        cx: imports.cx ? imports.cx.pngBase64 : null,
        analyse: imports.analyse ? imports.analyse.pngBase64 : null,
      },
    };

    // ── Python (Pyodide + python-pptx) base deck ─────────────────────────────
    // pptxgenjs output is rejected by Olivier's PowerPoint (AGL GPO). The base
    // 43-slide deck is now generated by python-pptx inside Pyodide; PowerPoint
    // opens it natively because python-pptx produces compliant OPC packages
    // and we inject the AGL MIP "Internal" sensitivity label as required.
    btn.textContent = 'Chargement du moteur Python…';
    let blob;
    try {
      const pyBytes = await window.pyGenerate(study, (phase) => {
        btn.textContent = phase || 'Génération du PPTX…';
      });
      blob = new Blob([pyBytes], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
    } catch (e) {
      console.error('Génération Python échouée', e);
      alert('La génération PPTX a échoué (' + e.message + ').');
      throw e;
    }

    // Le merge JS n'est plus utilisé : les imports CX/Analyse sont désormais
    // injectés par Python (Pyodide) sous forme d'images PNG, dans la même
    // étape pyGenerate ci-dessus. Le GPO AGL n'a plus de XML étranger à
    // bloquer.

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
  initPeriodControls();
  initFilterWatch();
  setPeriodControls(state.study);
  document.getElementById('generate-btn').addEventListener('click', generatePptx);
  document.getElementById('reset-btn').addEventListener('click', resetAll);
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSession);

  // Authored préconisations (rédigées par l'analyste à partir des documents).
  try {
    const pr = await fetch('./data/preconisations.json?v=20260622i');
    if (pr.ok) prediction.preconisations = await pr.json();
  } catch (e) { /* fallback used */ }
  const pStat = document.getElementById('preco-status');
  if (pStat) {
    pStat.textContent = prediction.preconisations
      ? `✓ Préconisations chargées (maj ${prediction.preconisations._updated || '—'}).`
      : 'Préconisations par défaut (data/preconisations.json non chargé).';
  }

  // Prediction inputs
  const pdfInput = document.getElementById('pdf-input');
  if (pdfInput) pdfInput.addEventListener('change', (e) => { if (e.target.files.length) handlePdfUpload(e.target.files); e.target.value = ''; });
  const aoInput = document.getElementById('ao-input');
  if (aoInput) aoInput.addEventListener('change', (e) => { if (e.target.files[0]) handleAoUpload(e.target.files[0]); e.target.value = ''; });

  // Imported PowerPoints (verbatim)
  const cxInput = document.getElementById('cx-input');
  if (cxInput) cxInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImportUpload('cx', e.target.files[0]); e.target.value = ''; });
  const analyseInput = document.getElementById('analyse-input');
  if (analyseInput) analyseInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImportUpload('analyse', e.target.files[0]); e.target.value = ''; });

  renderDatasets();
  renderStatus();
  renderImports();
  checkSavedSession();
}

document.addEventListener('DOMContentLoaded', boot);

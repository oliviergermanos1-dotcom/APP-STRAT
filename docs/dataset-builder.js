// Period-aware dataset builder.
//
// Inputs:
//   keptN   : rows kept after exclusion filters from the N file
//   keptN1  : rows kept after exclusion filters from the N-1 file (12 months)
//   period  : { startYear, startMonth, endYear, endMonth } — month indices 1..12
//   metier  : 'TIM' | 'TEM' | 'HIMP' | 'HEXP' | 'AER' | 'DSM'
//
// Outputs a list of datasets ({ datasetType, rows }) compatible with the
// generator's data-adapter:
//   - concurrents     (ranked by Transitaire on N period)
//   - clients         (top 10 destinataire/chargeur AGL on N period)
//   - segments        (top 11 merchandise + AGL PDM on N period)
//   - mensuel         (per-month market + AGL on N period)
//   - nouveaux        (rank 11-15 fallback OR true newcomers if N-1 supplied)
//   - referentiel_n1  (full N-1 aggregate for downstream N-1 validation)

const MONTHS_FR_B = window.STATCOM.MONTHS_FR;
const isAglB = window.STATCOM.isAgl;

function monthIndex(monthName) {
  return MONTHS_FR_B.indexOf(monthName) + 1; // 1..12 or 0 if not found
}

function inPeriod(row, period) {
  if (!period) return true;
  const mi = monthIndex(row.mois);
  if (!mi || !row.annee) return false;
  const ym = row.annee * 100 + mi;
  const lo = period.startYear * 100 + period.startMonth;
  const hi = period.endYear * 100 + period.endMonth;
  return ym >= lo && ym <= hi;
}

function shiftPeriodToN1(period) {
  if (!period) return null;
  return {
    startYear: period.startYear - 1,
    startMonth: period.startMonth,
    endYear: period.endYear - 1,
    endMonth: period.endMonth,
  };
}

function aggregateBy(rows, keyFn, valueFn = (r) => r.volume) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + (valueFn(r) || 0));
  }
  return m;
}

function fmtPdmNum(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {object} args
 * @param {Array} args.keptN
 * @param {Array} [args.keptN1]
 * @param {object} args.period
 * @param {string} args.metier
 * @param {string} args.filename
 */
function buildDatasets(args) {
  const { keptN, keptN1, period, metier, filename } = args;

  const periodRows = period ? keptN.filter((r) => inPeriod(r, period)) : keptN;
  const periodN1Rows = keptN1 && period
    ? keptN1.filter((r) => inPeriod(r, shiftPeriodToN1(period)))
    : (keptN1 || []);
  const fullN1Rows = keptN1 || [];

  const market = periodRows.reduce((s, r) => s + r.volume, 0);

  // ─── Concurrents (ranked by Transitaire over N period) ──────────────────
  const byTransit = aggregateBy(periodRows, (r) => r.transitaire);
  const concurrents = [...byTransit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, vol], i) => ({
      rang: i + 1,
      transitaire: name,
      volume: Math.round(vol * 100) / 100,
      pdm: market > 0 ? fmtPdmNum((vol / market) * 100) : 0,
    }));

  // ─── Clients AGL (top 10 by destinataire/chargeur over N period) ────────
  const aglPeriodRows = periodRows.filter((r) => isAglB(r.transitaire));
  const clientKey = (metier === 'TEM' || metier === 'HEXP') ? 'chargeur' : 'destinataire';
  const byClient = aggregateBy(aglPeriodRows, (r) => r[clientKey]);
  const segByClient = new Map();
  for (const r of aglPeriodRows) {
    const k = r[clientKey];
    if (k && !segByClient.has(k)) segByClient.set(k, r.marchandise);
  }
  const aglTotal = [...byClient.values()].reduce((s, v) => s + v, 0);
  const clients = [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, vol]) => ({
      client: name,
      volume: Math.round(vol * 100) / 100,
      segment: segByClient.get(name) || '—',
      pct_vol_agl: aglTotal > 0 ? Math.round((vol / aglTotal) * 1000) / 10 : 0,
    }));

  // ─── Segments (top 11 merch + AGL PDM over N period) ────────────────────
  const byMerch = aggregateBy(periodRows, (r) => r.marchandise);
  const aglByMerch = aggregateBy(aglPeriodRows, (r) => r.marchandise);
  const segments = [...byMerch.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11)
    .map(([seg, vol]) => ({
      segment: seg,
      volume_marche: Math.round(vol * 100) / 100,
      pdm_agl: vol > 0 ? Math.round(((aglByMerch.get(seg) || 0) / vol) * 100) : 0,
    }));

  // ─── Mensuel (per month over N period) ──────────────────────────────────
  const mMkt = aggregateBy(periodRows, (r) => r.mois);
  const mAgl = aggregateBy(aglPeriodRows, (r) => r.mois);
  const mensuel = MONTHS_FR_B
    .filter((m) => mMkt.has(m))
    .map((m) => ({
      mois: m,
      volume_marche: Math.round(mMkt.get(m) * 100) / 100,
      volume_agl: Math.round((mAgl.get(m) || 0) * 100) / 100,
      pdm_agl: mMkt.get(m) > 0
        ? Math.round(((mAgl.get(m) || 0) / mMkt.get(m)) * 1000) / 10
        : 0,
    }));

  // ─── Nouveaux entrants — cross-check against ENTIRE N-1 ────────────────
  // Build N-1 sets (over FULL year, not just same period).
  const transitN1 = new Set();
  const merchN1 = new Set();
  const aglDestN1 = new Set();
  // Total N-1 volume per destinataire across ALL transitaires
  // → "conquest opportunity" for nouveaux clients AGL.
  const destTotalN1 = new Map();
  for (const r of fullN1Rows) {
    if (r.transitaire) transitN1.add(r.transitaire);
    if (r.marchandise) merchN1.add(r.marchandise);
    if (isAglB(r.transitaire) && r[clientKey]) aglDestN1.add(r[clientKey]);
    if (r[clientKey]) {
      destTotalN1.set(r[clientKey], (destTotalN1.get(r[clientKey]) || 0) + r.volume);
    }
  }

  // True newcomer transitaires: in N period, NOT in any of N-1
  const newcomerTransitaires = [];
  const transitVolN = aggregateBy(periodRows, (r) => r.transitaire);
  for (const [name, vol] of [...transitVolN.entries()].sort((a, b) => b[1] - a[1])) {
    if (transitN1.has(name)) continue;
    if (isAglB(name)) continue; // AGL itself is never "new"
    newcomerTransitaires.push({
      rang: newcomerTransitaires.length + 1,
      transitaire: name,
      volume: Math.round(vol * 100) / 100,
      pdm: market > 0 ? fmtPdmNum((vol / market) * 100) : 0,
      segment: 'Nouveau',
    });
    if (newcomerTransitaires.length >= 10) break;
  }

  // True newcomer merchandises
  const newcomerMerch = [];
  const merchVolN = aggregateBy(periodRows, (r) => r.marchandise);
  for (const [seg, vol] of [...merchVolN.entries()].sort((a, b) => b[1] - a[1])) {
    if (merchN1.has(seg)) continue;
    const aglVol = aglByMerch.get(seg) || 0;
    newcomerMerch.push({
      segment: seg,
      volume_marche: Math.round(vol * 100) / 100,
      pdm_agl: vol > 0 ? Math.round((aglVol / vol) * 100) : 0,
    });
    if (newcomerMerch.length >= 10) break;
  }

  // True newcomer AGL clients (destinataires that AGL serves in N but not N-1).
  // We surface the N-1 volume this destinataire was doing with OTHER transitaires
  // ("conquest_opportunity") so the slide can size the upside.
  const newcomerClients = [];
  const aglClientVolN = aggregateBy(aglPeriodRows, (r) => r[clientKey]);
  for (const [name, vol] of [...aglClientVolN.entries()].sort((a, b) => b[1] - a[1])) {
    if (aglDestN1.has(name)) continue;
    const conquestOpportunity = destTotalN1.get(name) || 0;
    newcomerClients.push({
      client: name,
      volume: Math.round(vol * 100) / 100,
      segment: segByClient.get(name) || '—',
      pct_vol_agl: aglTotal > 0 ? Math.round((vol / aglTotal) * 1000) / 10 : 0,
      volume_n1_others: Math.round(conquestOpportunity * 100) / 100,
    });
    if (newcomerClients.length >= 10) break;
  }
  // Re-sort by conquest opportunity DESC so the biggest catches surface first
  newcomerClients.sort((a, b) => (b.volume_n1_others || 0) - (a.volume_n1_others || 0));

  // ─── Top 3 marchandises avec plus forte hausse ──────────────────────────
  // Compare N period vs same-period N-1.
  const merchVolN1Period = aggregateBy(periodN1Rows, (r) => r.marchandise);
  const growth = [];
  for (const [seg, volN] of merchVolN.entries()) {
    const volN1 = merchVolN1Period.get(seg) || 0;
    const delta = volN - volN1;
    if (delta <= 0) continue;
    const aglVol = aglByMerch.get(seg) || 0;
    growth.push({
      segment: seg,
      volume_marche: Math.round(volN * 100) / 100,
      volume_n1: Math.round(volN1 * 100) / 100,
      delta_volume: Math.round(delta * 100) / 100,
      growth_pct: volN1 > 0 ? Math.round((delta / volN1) * 1000) / 10 : null,
      pdm_agl: volN > 0 ? Math.round((aglVol / volN) * 100) : 0,
    });
  }
  growth.sort((a, b) => b.delta_volume - a.delta_volume);
  const topGrowth = growth.slice(0, 3);

  // ─── Top destinataires (ALL transitaires) avec PDM AGL ─────────────────
  const byDestAll = aggregateBy(periodRows, (r) => r.destinataire);
  const aglByDest = aggregateBy(aglPeriodRows, (r) => r.destinataire);
  const topDestPdm = [...byDestAll.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, vol]) => ({
      client: name,
      volume: Math.round(vol * 100) / 100,
      volume_agl: Math.round((aglByDest.get(name) || 0) * 100) / 100,
      pdm_agl: vol > 0 ? Math.round(((aglByDest.get(name) || 0) / vol) * 100) : 0,
    }));

  // ─── Referentiel N-1 (full year aggregate by Transitaire) ──────────────
  const transitN1Vol = aggregateBy(fullN1Rows, (r) => r.transitaire);
  const referentiel = [...transitN1Vol.entries()].map(([name, vol]) => ({
    nom_entite: name,
    metier,
    volume_annuel_n1: Math.round(vol * 100) / 100,
  }));

  return {
    filename,
    metier,
    market,
    aglVolume: aglPeriodRows.reduce((s, r) => s + r.volume, 0),
    aglPdm: market > 0 ? fmtPdmNum((aglPeriodRows.reduce((s, r) => s + r.volume, 0) / market) * 100) : 0,
    datasets: [
      { datasetType: 'concurrents',    filename, rowCount: concurrents.length, rows: concurrents },
      { datasetType: 'clients',        filename, rowCount: clients.length,     rows: clients },
      { datasetType: 'segments',       filename, rowCount: segments.length,    rows: segments },
      { datasetType: 'mensuel',        filename, rowCount: mensuel.length,     rows: mensuel },
      { datasetType: 'nouveaux',       filename, rowCount: newcomerTransitaires.length, rows: newcomerTransitaires },
      { datasetType: 'nouveaux_marchandises', filename, rowCount: newcomerMerch.length, rows: newcomerMerch },
      { datasetType: 'nouveaux_clients',      filename, rowCount: newcomerClients.length, rows: newcomerClients },
      { datasetType: 'top_growth',     filename, rowCount: topGrowth.length, rows: topGrowth },
      { datasetType: 'top_destinataires_pdm', filename, rowCount: topDestPdm.length, rows: topDestPdm },
      { datasetType: 'referentiel_n1', filename, rowCount: referentiel.length, rows: referentiel },
    ],
  };
}

window.buildDatasets = buildDatasets;

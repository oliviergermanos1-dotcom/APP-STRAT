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

const _ctx = (typeof self !== 'undefined') ? self : window;
const MONTHS_FR_B = _ctx.STATCOM.MONTHS_FR;
const isAglB = _ctx.STATCOM.isAgl;

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

  // ─── Répartition par pays de chargement (HEXP : origines Mali/BF) ───────
  const byPaysChargement = aggregateBy(periodRows, (r) => r.pays_chargement);
  const repartitionPays = [...byPaysChargement.entries()]
    .filter(([name]) => name && name.trim().length > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, vol]) => ({
      pays: name,
      volume_marche: Math.round(vol * 100) / 100,
      pdm: market > 0 ? fmtPdmNum((vol / market) * 100) : 0,
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
      { datasetType: 'repartition_pays', filename, rowCount: repartitionPays.length, rows: repartitionPays },
      { datasetType: 'referentiel_n1', filename, rowCount: referentiel.length, rows: referentiel },
    ],
  };
}

_ctx.buildDatasets = buildDatasets;

// ─── DSM (Direction Maritime) ──────────────────────────────────────────────
// Built from the import maritime base (TIM rows), aggregated by WEIGHT
// (poids in tonnes) instead of TEU. AGL's maritime role is consignataire,
// so PDM AGL on any dimension = share of tonnage where consignataire = AGL.
function isAglConsignataire(name) {
  const n = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
  return /^agl\b|africa global/.test(n);
}

function aggPoids(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + (Number(r.poids) || 0));
  }
  return m;
}

/**
 * @param {Array} keptN  TIM import maritime rows (current period source)
 * @param {Array} keptN1 TIM N-1 rows (full year)
 * @param {object} period
 * @param {string} filename
 */
function buildDsmDatasets(keptN, keptN1, period, filename) {
  const periodRows = period ? keptN.filter((r) => inPeriod(r, period)) : keptN;
  const fullN1Rows = keptN1 || [];
  const market = periodRows.reduce((s, r) => s + (Number(r.poids) || 0), 0);
  const aglRows = periodRows.filter((r) => isAglConsignataire(r.consignataire));

  const round = (v) => Math.round(v * 100) / 100;
  const pdmOf = (sub, tot) => (tot > 0 ? Math.round((sub / tot) * 1000) / 10 : 0);

  // Ranking helper with AGL PDM (AGL = consignataire on that subset)
  function rankWithAglPdm(keyFn, topN) {
    const total = aggPoids(periodRows, keyFn);
    const aglByKey = aggPoids(aglRows, keyFn);
    return [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([name, vol], i) => ({
        rang: i + 1,
        name,
        tonnage: round(vol),
        pdm_marche: pdmOf(vol, market),
        pdm_agl: pdmOf(aglByKey.get(name) || 0, vol),
      }));
  }

  // Armateurs au B/L (top 10) + AGL PDM
  const armateurs = rankWithAglPdm((r) => r.armateur, 10);
  // Manutentionnaires (top 10) + AGL PDM
  const manutentionnaires = rankWithAglPdm((r) => r.manutentionnaire, 10);
  // Consignataires (top 10) — AGL appears directly here
  const consignataires = (() => {
    const total = aggPoids(periodRows, (r) => r.consignataire);
    return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, vol], i) => ({
        rang: i + 1, name, tonnage: round(vol), pdm_marche: pdmOf(vol, market),
      }));
  })();
  // Ports de déchargement
  const ports = (() => {
    const total = aggPoids(periodRows, (r) => r.port_dechargement);
    return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, vol]) => ({ name, tonnage: round(vol), pdm_marche: pdmOf(vol, market) }));
  })();
  // Range (origines) + AGL PDM
  const ranges = rankWithAglPdm((r) => r.range, 8);

  // Top manutentionnaire detail: for the #1 manutentionnaire, break down by
  // navire / marchandise / destinataire (top 5 each).
  const topManut = manutentionnaires[0] ? manutentionnaires[0].name : null;
  const manutRows = topManut
    ? periodRows.filter((r) => r.manutentionnaire === topManut)
    : [];
  function topBreakdown(rows, keyFn, n) {
    const m = aggPoids(rows, keyFn);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([name, vol]) => ({ name, tonnage: round(vol) }));
  }
  const manutDetail = {
    manutentionnaire: topManut,
    par_navire: topBreakdown(manutRows, (r) => r.navire, 5),
    par_marchandise: topBreakdown(manutRows, (r) => r.marchandise, 5),
    par_destinataire: topBreakdown(manutRows, (r) => r.destinataire, 5),
  };

  // ─── Slide 27: focus véhicules neufs + occasion par armateur ───────────
  const isVehiculeNeuf = (m) => /vehicule.*neuf|véhicule.*neuf/i.test(m || '');
  const isVehiculeOcc = (m) => /occasion/i.test(m || '');
  function vehicleByArmateur(predicate) {
    const rows = periodRows.filter((r) => predicate(r.marchandise));
    const tot = rows.reduce((s, r) => s + (Number(r.poids) || 0), 0);
    const byArm = aggPoids(rows, (r) => r.armateur);
    const aglByArm = aggPoids(rows.filter((r) => isAglConsignataire(r.consignataire)), (r) => r.armateur);
    return {
      total: round(tot),
      rows: [...byArm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, vol], i) => ({
          rang: i + 1, name, tonnage: round(vol),
          pdm_marche: pdmOf(vol, tot),
          pdm_agl: pdmOf(aglByArm.get(name) || 0, vol),
        })),
    };
  }
  const vehNeuf = vehicleByArmateur(isVehiculeNeuf);
  const vehOcc = vehicleByArmateur(isVehiculeOcc);

  // ─── Slide 28: nouveaux (armateurs / marchandises / consignataires) ────
  // Cross-check vs full N-1, by tonnage.
  const armateurN1 = new Set(fullN1Rows.map((r) => r.armateur).filter(Boolean));
  const merchN1 = new Set(fullN1Rows.map((r) => r.marchandise).filter(Boolean));
  const aglConsignN1 = new Set(
    fullN1Rows.filter((r) => isAglConsignataire(r.consignataire))
      .map((r) => r.consignataire).filter(Boolean),
  );

  const armVolN = aggPoids(periodRows, (r) => r.armateur);
  const nouveauxArmateurs = [...armVolN.entries()]
    .filter(([name]) => name && !armateurN1.has(name))
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, vol]) => ({ name, tonnage: round(vol), pdm_marche: pdmOf(vol, market) }));

  const merchVolN = aggPoids(periodRows, (r) => r.marchandise);
  const aglMerchN = aggPoids(aglRows, (r) => r.marchandise);
  const nouvellesMarch = [...merchVolN.entries()]
    .filter(([name]) => name && !merchN1.has(name))
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, vol]) => ({
      name, tonnage: round(vol), pdm_agl: pdmOf(aglMerchN.get(name) || 0, vol),
    }));

  // Top 3 marchandises plus forte hausse (tonnage), N period vs N-1 same period
  const periodN1Rows = keptN1 && period ? keptN1.filter((r) => inPeriod(r, shiftPeriodToN1(period))) : [];
  const merchVolN1Period = aggPoids(periodN1Rows, (r) => r.marchandise);
  const growth = [];
  for (const [seg, volN] of merchVolN.entries()) {
    const volN1 = merchVolN1Period.get(seg) || 0;
    const delta = volN - volN1;
    if (delta <= 0) continue;
    growth.push({
      name: seg, tonnage: round(volN), tonnage_n1: round(volN1),
      delta: round(delta), growth_pct: volN1 > 0 ? Math.round((delta / volN1) * 1000) / 10 : null,
      pdm_agl: pdmOf(aglMerchN.get(seg) || 0, volN),
    });
  }
  growth.sort((a, b) => b.delta - a.delta);

  // ─── Vue d'ensemble (même schéma que les autres métiers) ───────────────
  // KPI période + évolution mensuelle marché/AGL + PDM AGL mensuel + N vs N-1.
  const aglTonnage = aglRows.reduce((s, r) => s + (Number(r.poids) || 0), 0);
  // AGL rank among ALL consignataires (not just top 10).
  const consAll = [...aggPoids(periodRows, (r) => r.consignataire).entries()]
    .sort((a, b) => b[1] - a[1]);
  const aglRank = consAll.findIndex(([name]) => isAglConsignataire(name)) + 1; // 0 if absent
  const secondName = consAll[0] && isAglConsignataire(consAll[0][0])
    ? (consAll[1] ? consAll[1][0] : null)
    : (consAll[0] ? consAll[0][0] : null);
  // Monthly series over the N period (tonnage).
  const mMkt = aggPoids(periodRows, (r) => r.mois);
  const mAgl = aggPoids(aglRows, (r) => r.mois);
  const mensuel = MONTHS_FR_B.filter((m) => mMkt.has(m)).map((m) => ({
    mois: m,
    volume_marche: round(mMkt.get(m)),
    volume_agl: round(mAgl.get(m) || 0),
    pdm_agl: mMkt.get(m) > 0 ? Math.round(((mAgl.get(m) || 0) / mMkt.get(m)) * 1000) / 10 : 0,
  }));
  // N-1 same period (already filtered above as periodN1Rows).
  const marketN1 = periodN1Rows.reduce((s, r) => s + (Number(r.poids) || 0), 0);
  const aglTonnageN1 = periodN1Rows
    .filter((r) => isAglConsignataire(r.consignataire))
    .reduce((s, r) => s + (Number(r.poids) || 0), 0);
  const overview = {
    market: round(market),
    aglTonnage: round(aglTonnage),
    aglPdm: pdmOf(aglTonnage, market),
    aglRank: aglRank || null,
    secondName,
    marketN1: round(marketN1),
    aglTonnageN1: round(aglTonnageN1),
    marketGrowthPct: marketN1 > 0 ? Math.round(((market - marketN1) / marketN1) * 1000) / 10 : null,
    aglGrowthPct: aglTonnageN1 > 0 ? Math.round(((aglTonnage - aglTonnageN1) / aglTonnageN1) * 1000) / 10 : null,
    mensuel,
  };

  return {
    filename,
    market: round(market),
    aglTonnage: round(aglTonnage),
    aglPdm: pdmOf(aglTonnage, market),
    datasets: [
      { datasetType: 'dsm_overview',         rows: [overview] },
      { datasetType: 'dsm_armateurs',        rows: armateurs },
      { datasetType: 'dsm_manutentionnaires', rows: manutentionnaires },
      { datasetType: 'dsm_consignataires',   rows: consignataires },
      { datasetType: 'dsm_ports',            rows: ports },
      { datasetType: 'dsm_ranges',           rows: ranges },
      { datasetType: 'dsm_manut_detail',     rows: [manutDetail] },
      { datasetType: 'dsm_vehicules_neufs',  rows: vehNeuf.rows, meta: { total: vehNeuf.total } },
      { datasetType: 'dsm_vehicules_occasion', rows: vehOcc.rows, meta: { total: vehOcc.total } },
      { datasetType: 'dsm_nouveaux_armateurs', rows: nouveauxArmateurs },
      { datasetType: 'dsm_nouvelles_marchandises', rows: nouvellesMarch },
      { datasetType: 'dsm_top_growth',       rows: growth.slice(0, 3) },
    ],
  };
}

_ctx.buildDsmDatasets = buildDsmDatasets;

// ─── MINING FOCUS ──────────────────────────────────────────────────────────
// Mining clients are matched on the Destinataire column via the appellations
// provided by Olivier (mining docx). A TIM row is "mining" when its
// normalised destinataire contains one of these appellations.
function normMatch(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const MINING_APPELLATIONS = [
  'agbaou gold operation', 'bonikro gold mine', 'ste des mines de lafigue',
  'ste des mines d ity', 'k1 mining', 'bureau veritas cote d ivoire',
  'corica mining service', 'roxgold sango', '3g mining', 'cmb abidjan',
  'equatorial engineering cote d ivoire',
  'mines et exploitation en afrique de l ouest', 'minex wa',
  'epiroc cote d ivoire', 'societe miniere de la lobo',
  'societe miniere de lafigue',
].map(normMatch);

function isMiningDestinataire(name) {
  const n = normMatch(name);
  if (!n) return false;
  return MINING_APPELLATIONS.some((a) => n.includes(a) || a.includes(n));
}
_ctx.isMiningDestinataire = isMiningDestinataire;

// ─── AYIMAN FOCUS ──────────────────────────────────────────────────────────
// AYIMAN = competitor forwarder. Le nom STATCOM canonique est
// "AYIMAN LOGISTICS CI". On élargit légèrement sur la racine 'ayiman' pour
// attraper d'éventuelles variantes orthographiques.
const AYIMAN_KEYS = ['ayiman logistics ci', 'ayiman'].map(normMatch);
function isAyiman(name) {
  const n = normMatch(name);
  return AYIMAN_KEYS.some((k) => n.includes(k));
}
_ctx.isAyiman = isAyiman;
// Back-compat alias — older callers may still use isAyman.
_ctx.isAyman = isAyiman;

/**
 * AYMAN multi-métier focus.
 * @param {Array<{metier, unit, keptN, keptN1}>} sources
 * @param {object} period
 */
function buildAymanDatasets(sources, period) {
  const round = (v) => Math.round(v * 100) / 100;
  const pdmOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  // Per-métier summary: AYMAN volume, rank, AGL volume, gap.
  const parMetier = [];
  let aymanTimRows = [];
  let aymanTimN1Rows = [];

  for (const src of sources) {
    const pRows = period ? src.keptN.filter((r) => inPeriod(r, period)) : src.keptN;
    const market = pRows.reduce((s, r) => s + (r.volume || 0), 0);
    // rank AYMAN among transitaires
    const byTransit = aggregateBy(pRows, (r) => r.transitaire);
    const ranked = [...byTransit.entries()].sort((a, b) => b[1] - a[1]);
    let aymanVol = 0;
    let aymanRank = null;
    ranked.forEach(([name, vol], i) => {
      if (isAyman(name)) { aymanVol += vol; if (aymanRank === null) aymanRank = i + 1; }
    });
    const aglVol = pRows.filter((r) => isAglB(r.transitaire)).reduce((s, r) => s + (r.volume || 0), 0);
    parMetier.push({
      metier: src.metier,
      unit: src.unit,
      ayman_vol: round(aymanVol),
      ayman_pdm: pdmOf(aymanVol, market),
      ayman_rang: aymanRank,
      agl_pdm: pdmOf(aglVol, market),
      ecart_pts: Math.round((pdmOf(aglVol, market) - pdmOf(aymanVol, market)) * 10) / 10,
    });
    if (src.metier === 'TIM') {
      aymanTimRows = pRows.filter((r) => isAyman(r.transitaire));
      aymanTimN1Rows = (src.keptN1 || []).filter((r) => isAyman(r.transitaire));
    }
  }

  // AYMAN clients (TIM destinataires it serves)
  const byClient = aggregateBy(aymanTimRows, (r) => r.destinataire);
  const aymanTimTotal = aymanTimRows.reduce((s, r) => s + (r.volume || 0), 0);
  const clients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aymanTimTotal) }));

  // AYMAN marchandises (TIM)
  const byMerch = aggregateBy(aymanTimRows, (r) => r.marchandise);
  const marchandises = [...byMerch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aymanTimTotal) }));

  // Evolution mensuelle AYMAN (TIM)
  const byMonth = aggregateBy(aymanTimRows, (r) => r.mois);
  const evolution = MONTHS_FR_B.filter((m) => byMonth.has(m))
    .map((m) => ({ mois: m, vol: round(byMonth.get(m)) }));

  // Evolution N vs N-1 (TIM total)
  const totN = aymanTimTotal;
  const periodN1 = period ? aymanTimN1Rows.filter((r) => inPeriod(r, shiftPeriodToN1(period))) : aymanTimN1Rows;
  const totN1 = periodN1.reduce((s, r) => s + (r.volume || 0), 0);

  return {
    parMetier,
    clients,
    marchandises,
    evolution,
    timTotalN: round(totN),
    timTotalN1: round(totN1),
    timGrowthPct: totN1 > 0 ? Math.round(((totN - totN1) / totN1) * 1000) / 10 : null,
  };
}
_ctx.buildAymanDatasets = buildAymanDatasets;

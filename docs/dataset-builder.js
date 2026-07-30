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
//   - clients         (top 20 destinataire/chargeur AGL on N period)
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
  // Chaque période porte sa propre plage : année ET mois de comparaison sont
  // choisis explicitement dans l'interface. Repli sur « année−1, mêmes mois »
  // pour les sessions enregistrées avant l'ajout des sélecteurs.
  return {
    startYear: period.n1StartYear != null ? period.n1StartYear : period.startYear - 1,
    startMonth: period.n1StartMonth != null ? period.n1StartMonth : period.startMonth,
    endYear: period.n1EndYear != null ? period.n1EndYear
      : (period.n1StartYear != null ? period.n1StartYear : period.endYear - 1),
    endMonth: period.n1EndMonth != null ? period.n1EndMonth : period.endMonth,
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
  // compare === false : étude sur une seule période. On force le jeu N-1 à
  // vide plutôt que de laisser shiftPeriodToN1() renvoyer null — inPeriod()
  // vaut true quand period est null, ce qui ferait entrer TOUT le fichier
  // N-1 dans les agrégats et fausserait les chiffres.
  const noCompare = !!(period && period.compare === false);
  const periodN1Rows = noCompare ? []
    : (keptN1 && period
      ? keptN1.filter((r) => inPeriod(r, shiftPeriodToN1(period)))
      : (keptN1 || []));
  const fullN1Rows = noCompare ? [] : (keptN1 || []);

  // ─── Couverture temporelle réelle des fichiers ──────────────────────────
  // Sert à garantir que la période saisie dans l'outil correspond bien aux
  // données : si 0 ligne survit au filtre, l'app doit refuser de générer au
  // lieu de laisser generator.py se rabattre sur ses valeurs de démo.
  function coverage(rows) {
    let min = null, max = null;
    for (const r of rows || []) {
      const mi = monthIndex(r.mois);
      if (!mi || !r.annee) continue;
      const ym = r.annee * 100 + mi;
      if (min === null || ym < min) min = ym;
      if (max === null || ym > max) max = ym;
    }
    const fmt = (v) => (v === null ? null
      : `${Math.floor(v / 100)}-${String(v % 100).padStart(2, '0')}`);
    return { min: fmt(min), max: fmt(max) };
  }
  const covN = coverage(keptN);
  const covN1 = coverage(fullN1Rows);

  const market = periodRows.reduce((s, r) => s + r.volume, 0);
  const marketN1Period = periodN1Rows.reduce((s, r) => s + r.volume, 0);

  // ─── Concurrents (ranked by Transitaire over N period) ──────────────────
  // N-1 same-period ranking surfaces volume_n1 / pdm_n1 / rank_n1 per
  // transitaire so downstream slides can colour bars + render evolution.
  const byTransit = aggregateBy(periodRows, (r) => r.transitaire);
  const byTransitN1 = aggregateBy(periodN1Rows, (r) => r.transitaire);
  const rankedN1 = [...byTransitN1.entries()].sort((a, b) => b[1] - a[1]);
  const rankN1ByName = new Map(rankedN1.map(([name], i) => [name, i + 1]));
  const concurrents = [...byTransit.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, vol], i) => {
      const volN1 = byTransitN1.get(name) || 0;
      const pdmN = market > 0 ? (vol / market) * 100 : 0;
      const pdmN1 = marketN1Period > 0 ? (volN1 / marketN1Period) * 100 : 0;
      return {
        rang: i + 1,
        transitaire: name,
        volume: Math.round(vol * 100) / 100,
        pdm: fmtPdmNum(pdmN),
        volume_n1: Math.round(volN1 * 100) / 100,
        pdm_n1: fmtPdmNum(pdmN1),
        rang_n1: rankN1ByName.get(name) || null,
        delta_pdm: fmtPdmNum(pdmN - pdmN1),
      };
    });

  // ─── Clients AGL (top 20 by destinataire/chargeur over N period) ────────
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
    .slice(0, 20)
    .map(([name, vol]) => ({
      client: name,
      volume: Math.round(vol * 100) / 100,
      segment: segByClient.get(name) || '—',
      pct_vol_agl: aglTotal > 0 ? Math.round((vol / aglTotal) * 1000) / 10 : 0,
    }));

  // ─── Segments (top 11 merch + AGL PDM over N period) ────────────────────
  // pdm_agl_n1 = PDM AGL sur le même segment N-1 même période, sert à colorer
  // les barres (vert si PDM N ≥ PDM N-1).
  const aglPeriodN1Rows = periodN1Rows.filter((r) => isAglB(r.transitaire));
  const byMerch = aggregateBy(periodRows, (r) => r.marchandise);
  const aglByMerch = aggregateBy(aglPeriodRows, (r) => r.marchandise);
  const byMerchN1 = aggregateBy(periodN1Rows, (r) => r.marchandise);
  const aglByMerchN1 = aggregateBy(aglPeriodN1Rows, (r) => r.marchandise);
  const segments = [...byMerch.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11)
    .map(([seg, vol]) => {
      const volN1 = byMerchN1.get(seg) || 0;
      const aglN1 = aglByMerchN1.get(seg) || 0;
      return {
        segment: seg,
        volume_marche: Math.round(vol * 100) / 100,
        pdm_agl: vol > 0 ? Math.round(((aglByMerch.get(seg) || 0) / vol) * 100) : 0,
        volume_marche_n1: Math.round(volN1 * 100) / 100,
        pdm_agl_n1: volN1 > 0 ? Math.round((aglN1 / volN1) * 100) : 0,
      };
    });

  // ─── Mensuel (per month over N period) ──────────────────────────────────
  // pdm_agl_n1 = PDM AGL sur le même mois année N-1, pour colorer les barres
  // (vert si la PDM du mois N ≥ PDM même mois N-1).
  const mMkt = aggregateBy(periodRows, (r) => r.mois);
  const mAgl = aggregateBy(aglPeriodRows, (r) => r.mois);
  const mMktN1 = aggregateBy(periodN1Rows, (r) => r.mois);
  const mAglN1 = aggregateBy(aglPeriodN1Rows, (r) => r.mois);

  // Appariement N ↔ N-1 par RANG dans chaque plage, et non par nom de mois :
  // les deux périodes peuvent couvrir des mois différents (ex. Janv–Juin 2026
  // comparé à Juil–Déc 2025). Le 1er mois de N est comparé au 1er mois de
  // N-1, etc. Quand les plages coïncident, cela revient exactement à
  // l'appariement par nom de mois d'avant.
  const _n1p = noCompare ? null : shiftPeriodToN1(period);
  const _range = (a, b) => {
    const out = [];
    for (let mm = a; mm <= b; mm++) out.push(MONTHS_FR_B[mm - 1]);
    return out;
  };
  const nRange = period ? _range(period.startMonth, period.endMonth) : MONTHS_FR_B;
  const n1Range = _n1p ? _range(_n1p.startMonth, _n1p.endMonth) : [];
  const mensuel = nRange
    .map((m, k) => ({ m, m1: n1Range[k] || null }))
    .filter((o) => mMkt.has(o.m))
    .map(({ m, m1 }) => {
      const mkN1 = m1 ? (mMktN1.get(m1) || 0) : 0;
      const agN1 = m1 ? (mAglN1.get(m1) || 0) : 0;
      return {
        mois: m,
        mois_n1: m1,
        volume_marche: Math.round(mMkt.get(m) * 100) / 100,
        volume_agl: Math.round((mAgl.get(m) || 0) * 100) / 100,
        pdm_agl: mMkt.get(m) > 0
          ? Math.round(((mAgl.get(m) || 0) / mMkt.get(m)) * 1000) / 10
          : 0,
        volume_marche_n1: Math.round(mkN1 * 100) / 100,
        volume_agl_n1: Math.round(agN1 * 100) / 100,
        pdm_agl_n1: mkN1 > 0 ? Math.round((agN1 / mkN1) * 1000) / 10 : 0,
      };
    });

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
    .slice(0, 20)
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
    coverage: {
      n: covN,
      n1: covN1,
      rowsTotalN: (keptN || []).length,
      rowsInPeriodN: periodRows.length,
      rowsInPeriodN1: periodN1Rows.length,
    },
    aglVolume: aglPeriodRows.reduce((s, r) => s + r.volume, 0),
    aglPdm: market > 0 ? fmtPdmNum((aglPeriodRows.reduce((s, r) => s + r.volume, 0) / market) * 100) : 0,
    datasets: [
      { datasetType: 'concurrents',    filename, rowCount: concurrents.length, rows: concurrents },
      { datasetType: 'clients',        filename, rowCount: clients.length,     rows: clients },
      { datasetType: 'segments',       filename, rowCount: segments.length,    rows: segments },
      { datasetType: 'mensuel',        filename, rowCount: mensuel.length,     rows: mensuel },
      { datasetType: 'nouveaux',       filename, rowCount: noCompare ? 0 : newcomerTransitaires.length, rows: noCompare ? [] : newcomerTransitaires },
      { datasetType: 'nouveaux_marchandises', filename, rowCount: noCompare ? 0 : newcomerMerch.length, rows: noCompare ? [] : newcomerMerch },
      { datasetType: 'nouveaux_clients',      filename, rowCount: noCompare ? 0 : newcomerClients.length, rows: noCompare ? [] : newcomerClients },
      { datasetType: 'top_growth',     filename, rowCount: noCompare ? 0 : topGrowth.length, rows: noCompare ? [] : topGrowth },
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
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  // Mode « période unique » : aucune donnée N-1 ne doit entrer, ni pour la
  // comparaison mensuelle, ni pour la détection des nouveaux entrants.
  const _dsmNoCmp = !!(period && period.compare === false);
  if (_dsmNoCmp) keptN1 = null;
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
  // Monthly series over the N period (tonnage). pdm_agl_n1 = même mois N-1.
  const mMkt = aggPoids(periodRows, (r) => r.mois);
  const mAgl = aggPoids(aglRows, (r) => r.mois);
  const aglPeriodN1Rows = periodN1Rows.filter((r) => isAglConsignataire(r.consignataire));
  const mMktN1 = aggPoids(periodN1Rows, (r) => r.mois);
  const mAglN1 = aggPoids(aglPeriodN1Rows, (r) => r.mois);
  const mensuel = MONTHS_FR_B.filter((m) => mMkt.has(m)).map((m) => {
    const mkN1 = mMktN1.get(m) || 0;
    const agN1 = mAglN1.get(m) || 0;
    return {
      mois: m,
      volume_marche: round(mMkt.get(m)),
      volume_agl: round(mAgl.get(m) || 0),
      pdm_agl: mMkt.get(m) > 0 ? Math.round(((mAgl.get(m) || 0) / mMkt.get(m)) * 1000) / 10 : 0,
      volume_marche_n1: round(mkN1),
      volume_agl_n1: round(agN1),
      pdm_agl_n1: mkN1 > 0 ? Math.round((agN1 / mkN1) * 1000) / 10 : 0,
    };
  });
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
      { datasetType: 'dsm_nouveaux_armateurs', rows: _dsmNoCmp ? [] : nouveauxArmateurs },
      { datasetType: 'dsm_nouvelles_marchandises', rows: _dsmNoCmp ? [] : nouvellesMarch },
      { datasetType: 'dsm_top_growth',       rows: _dsmNoCmp ? [] : growth.slice(0, 3) },
    ],
  };
}

_ctx.buildDsmDatasets = buildDsmDatasets;

// ─── MINING FOCUS ──────────────────────────────────────────────────────────
// Mining clients are matched on the Destinataire column via the appellations
// provided by Olivier (mining docx). A TIM row is "mining" when its
// normalised destinataire contains one of these appellations.
function normMatch(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  // Clé client selon le métier : destinataire pour import/aérien, chargeur pour export.
  const clientKeyFor = (metier) => (metier === 'TEM' || metier === 'HEXP' ? 'chargeur' : 'destinataire');

  // Per-métier summary + breakdown clients/marchandises/évolution PAR métier
  // (TIM, HIMP, HEXP, TEM, AER) pour alimenter le slide focus complet.
  const parMetier = [];
  const byMetierDetail = {};
  let aymanTimRows = [];
  const _noCmp = !!(period && period.compare === false);
  let aymanTimN1Rows = [];
  let aymanAerRows = [];
  let aymanAerN1Rows = [];

  for (const src of sources) {
    const pRows = period ? src.keptN.filter((r) => inPeriod(r, period)) : src.keptN;
    const market = pRows.reduce((s, r) => s + (r.volume || 0), 0);
    const aymanRows = pRows.filter((r) => isAyman(r.transitaire));
    const aymanN1Rows = _noCmp ? [] : (src.keptN1 || []).filter((r) => isAyman(r.transitaire));
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

    // Breakdown détaillé AYIMAN par métier (clients, marchandises, mois, N-1)
    if (aymanRows.length > 0) {
      const ck = clientKeyFor(src.metier);
      const totMetier = aymanRows.reduce((s, r) => s + (r.volume || 0), 0);
      // Clients (8) — chargeur/destinataire selon métier
      const cMap = aggregateBy(aymanRows, (r) => r[ck]);
      const topClients = [...cMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, totMetier) }));
      // Marchandises (8)
      const mMap = aggregateBy(aymanRows, (r) => r.marchandise);
      const topMerch = [...mMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, totMetier) }));
      // Évolution mensuelle
      const monthMap = aggregateBy(aymanRows, (r) => r.mois);
      const evolMonths = MONTHS_FR_B.filter((m) => monthMap.has(m))
        .map((m) => ({ mois: m, vol: round(monthMap.get(m)) }));
      // N-1 même période (volume seul)
      const aymanN1Period = period
        ? aymanN1Rows.filter((r) => inPeriod(r, shiftPeriodToN1(period)))
        : aymanN1Rows;
      const totN1 = aymanN1Period.reduce((s, r) => s + (r.volume || 0), 0);
      // Clients communs AGL ↔ AYIMAN (cross-prospection / verrouillage)
      const aglRowsMetier = pRows.filter((r) => isAglB(r.transitaire));
      const aglClientSet = new Set(aglRowsMetier.map((r) => r[ck]).filter(Boolean));
      const aymanClientSet = new Set(aymanRows.map((r) => r[ck]).filter(Boolean));
      const commonClients = [...aymanClientSet].filter((c) => aglClientSet.has(c));
      const aymanByClient = new Map();
      const aglByClient = new Map();
      for (const r of aymanRows) {
        if (!r[ck]) continue;
        aymanByClient.set(r[ck], (aymanByClient.get(r[ck]) || 0) + (r.volume || 0));
      }
      for (const r of aglRowsMetier) {
        if (!r[ck]) continue;
        aglByClient.set(r[ck], (aglByClient.get(r[ck]) || 0) + (r.volume || 0));
      }
      const sharedClients = commonClients
        .map((name) => ({
          name,
          ayiman_vol: round(aymanByClient.get(name) || 0),
          agl_vol: round(aglByClient.get(name) || 0),
        }))
        .sort((a, b) => b.ayiman_vol - a.ayiman_vol)
        .slice(0, 5);

      byMetierDetail[src.metier] = {
        unit: src.unit,
        rang: aymanRank,
        vol: round(totMetier),
        vol_n1: round(totN1),
        growth_pct: totN1 > 0 ? Math.round(((totMetier - totN1) / totN1) * 1000) / 10 : null,
        pdm: pdmOf(totMetier, market),
        agl_pdm: pdmOf(aglVol, market),
        clients: topClients,
        marchandises: topMerch,
        evolution: evolMonths,
        sharedClients,
        clientKey: ck,
        marketTotal: round(market),
      };
    }

    if (src.metier === 'TIM') {
      aymanTimRows = aymanRows;
      aymanTimN1Rows = aymanN1Rows;
    }
    // Aérien Import : étude STRICTEMENT séparée du maritime. Les volumes
    // sont en tonnes (kg convertis) quand TIM est en TEU — on ne cumule
    // jamais les deux, on produit deux jeux de chiffres distincts.
    if (src.metier === 'AER') {
      aymanAerRows = aymanRows;
      aymanAerN1Rows = aymanN1Rows;
    }
  }

  // AYMAN clients TIM (compat existant)
  const byClient = aggregateBy(aymanTimRows, (r) => r.destinataire);
  const aymanTimTotal = aymanTimRows.reduce((s, r) => s + (r.volume || 0), 0);
  const clients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aymanTimTotal) }));

  const byMerch = aggregateBy(aymanTimRows, (r) => r.marchandise);
  const marchandises = [...byMerch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aymanTimTotal) }));

  const byMonth = aggregateBy(aymanTimRows, (r) => r.mois);
  // Évolution AYIMAN mensuelle : on garde le même set de mois que N
  // mais on ajoute la valeur N-1 du mois équivalent pour graphe comparé.
  const periodN1 = period ? aymanTimN1Rows.filter((r) => inPeriod(r, shiftPeriodToN1(period))) : aymanTimN1Rows;
  const byMonthN1 = aggregateBy(periodN1, (r) => r.mois);
  const evolution = MONTHS_FR_B.filter((m) => byMonth.has(m))
    .map((m) => ({
      mois: m,
      vol: round(byMonth.get(m)),
      vol_n1: round(byMonthN1.get(m) || 0),
    }));

  // ── Agrégats aériens (miroir du volet TIM, unité tonnes) ───────────────
  const aerTotN  = aymanAerRows.reduce((s, r) => s + (r.volume || 0), 0);
  const aerTotN1 = aymanAerN1Rows.reduce((s, r) => s + (r.volume || 0), 0);
  const aerByClient = aggregateBy(aymanAerRows, (r) => r.destinataire);
  const aerClients = [...aerByClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aerTotN) }));
  const aerByMerch = aggregateBy(aymanAerRows, (r) => r.marchandise);
  const aerMerch = [...aerByMerch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, vol]) => ({ name, vol: round(vol), pct: pdmOf(vol, aerTotN) }));
  const aerByMonth   = aggregateBy(aymanAerRows, (r) => r.mois);
  const aerByMonthN1 = aggregateBy(aymanAerN1Rows, (r) => r.mois);
  const aerEvolution = MONTHS_FR_B.filter((m) => aerByMonth.has(m)).map((m) => ({
    mois: m, vol: round(aerByMonth.get(m)), vol_n1: round(aerByMonthN1.get(m) || 0),
  }));

  const totN = aymanTimTotal;
  const totN1 = periodN1.reduce((s, r) => s + (r.volume || 0), 0);

  return {
    parMetier,
    byMetierDetail,
    clients,
    marchandises,
    evolution,
    timTotalN: round(totN),
    timTotalN1: round(totN1),
    timGrowthPct: totN1 > 0 ? Math.round(((totN - totN1) / totN1) * 1000) / 10 : null,
    // ── Volet aérien (tonnes) — jamais additionné au volet maritime ──────
    aerTotalN: round(aerTotN),
    aerTotalN1: round(aerTotN1),
    aerGrowthPct: aerTotN1 > 0
      ? Math.round(((aerTotN - aerTotN1) / aerTotN1) * 1000) / 10 : null,
    aerClients: aerClients,
    aerMarchandises: aerMerch,
    aerEvolution: aerEvolution,
  };
}
_ctx.buildAymanDatasets = buildAymanDatasets;

// ─── SECTOR PROSPECTS ──────────────────────────────────────────────────────
// Croise les marchandises STATCOM B/L avec les secteurs prioritaires du
// Plan National de Développement (PND) Côte d'Ivoire 2026-2030 et avec les
// signaux extraits des newsletters, pour produire des LISTES DE PROSPECTS
// CONCRETS (destinataires pour import/aérien, chargeurs pour export).
//
// Chaque secteur définit :
//   • merchKeywords : motifs pour matcher la colonne marchandise
//   • pnd          : true si secteur prioritaire PND
// Le résultat fournit, par secteur : top 5 destinataires (import+aérien)
// et top 5 chargeurs (export), volume total, métiers actifs, PDM AGL.
const PND_SECTORS = [
  { name: 'Agro-industrie (cacao, anacarde, hévéa)',
    merchKeywords: ['cacao', 'feve.*cacao', 'anacarde', 'cajou', 'hevea', 'hévéa',
                    'caoutchouc', 'palmier', 'huile palme', 'karite', 'karité'],
    pnd: true },
  { name: 'Coton & textile',
    merchKeywords: ['coton', 'fibre.*coton', 'tissu', 'textile', 'habillement'],
    pnd: true },
  { name: 'Mines & métaux (or, manganèse, fer)',
    merchKeywords: ['or\\b', 'gold', 'manganese', 'minerai', 'mining', 'minier',
                    'fer\\b', 'acier', 'nickel', 'lithium', 'bauxite'],
    pnd: true },
  { name: 'Pétrole / hydrocarbures / gaz',
    merchKeywords: ['petrole', 'pétrole', 'hydrocarbure', 'fuel', 'gaz\\b',
                    'lpg', 'gpl', 'huile.*moteur'],
    pnd: true },
  { name: 'BTP & ciment',
    merchKeywords: ['ciment', 'clinker', 'gypse', 'beton', 'béton',
                    'materiel.*construction', 'matériaux.*construction',
                    'carreau', 'céramique'],
    pnd: true },
  { name: 'Industrie pharma & santé',
    merchKeywords: ['medicament', 'médicament', 'pharma', 'vaccin', 'hopital',
                    'hôpital', 'sante', 'santé', 'soin'],
    pnd: true },
  { name: 'Agro-alimentaire (riz, blé, sucre, lait)',
    merchKeywords: ['riz\\b', 'rice', 'ble\\b', 'blé', 'farine', 'sucre',
                    'lait', 'huile alimentaire', 'boisson'],
    pnd: true },
  { name: 'Automobile (véhicules, RoRo)',
    merchKeywords: ['vehicule', 'véhicule', 'voiture', 'automobile', 'roro',
                    'moto\\b', 'occasion', 'tracteur'],
    pnd: true },
  { name: 'Pêche & aquaculture',
    merchKeywords: ['poisson', 'pêche', 'peche', 'congele', 'congelé',
                    'produits.*mer', 'crevette', 'thon'],
    pnd: true },
  { name: 'Chimie & engrais',
    merchKeywords: ['engrais', 'fertilisant', 'urea', 'urée', 'chimi',
                    'herbicide', 'insecticide', 'pesticide'],
    pnd: true },
  { name: 'Emballages & papier',
    merchKeywords: ['emballage', 'papier', 'derives.*papier', 'carton',
                    'plastique', 'pvc', 'polyethylene', 'polyéthylène'],
    pnd: false },
  { name: 'Électroménager / électronique',
    merchKeywords: ['appareil.*electromenager', 'electromenager', 'électroménager',
                    'electronique', 'électronique', 'smartphone', 'téléphone'],
    pnd: false },
];

function clientKeyForMetier(metier) {
  return (metier === 'TEM' || metier === 'HEXP') ? 'chargeur' : 'destinataire';
}

function buildSectorProspects(sources, period) {
  const round = (v) => Math.round(v * 100) / 100;
  const result = [];

  for (const sector of PND_SECTORS) {
    // Compile regex de matching marchandise (OR de tous les motifs).
    const re = new RegExp('(' + sector.merchKeywords.join('|') + ')', 'i');
    const destAgg = new Map();      // import/aérien
    const chargAgg = new Map();     // export
    const merchAgg = new Map();
    const metierActive = new Set();
    let totalVol = 0;
    let aglVol = 0;
    let totalLines = 0;

    for (const src of sources) {
      const pRows = period ? src.keptN.filter((r) => inPeriod(r, period)) : src.keptN;
      const ck = clientKeyForMetier(src.metier);
      for (const r of pRows) {
        const m = String(r.marchandise || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!re.test(m)) continue;
        totalVol += r.volume || 0;
        totalLines += 1;
        metierActive.add(src.metier);
        if (isAglB(r.transitaire)) aglVol += r.volume || 0;
        merchAgg.set(r.marchandise || '—',
                     (merchAgg.get(r.marchandise || '—') || 0) + (r.volume || 0));
        const c = r[ck];
        if (c) {
          if (ck === 'chargeur') {
            chargAgg.set(c, (chargAgg.get(c) || 0) + (r.volume || 0));
          } else {
            destAgg.set(c, (destAgg.get(c) || 0) + (r.volume || 0));
          }
        }
      }
    }

    if (totalVol === 0) continue;  // secteur sans flux STATCOM, on n'affiche pas

    const topDest = [...destAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, vol]) => ({ name, vol: round(vol) }));
    const topCharg = [...chargAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, vol]) => ({ name, vol: round(vol) }));
    const topMerch = [...merchAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, vol]) => ({ name, vol: round(vol) }));

    result.push({
      sector: sector.name,
      pnd: sector.pnd,
      totalVol: round(totalVol),
      aglVol: round(aglVol),
      aglPdm: totalVol > 0 ? Math.round((aglVol / totalVol) * 1000) / 10 : 0,
      lineCount: totalLines,
      metiers: [...metierActive],
      topDestinataires: topDest,
      topChargeurs: topCharg,
      topMarchandises: topMerch,
    });
  }
  // Tri : PND prioritaires d'abord, puis par volume marché desc.
  result.sort((a, b) => (b.pnd - a.pnd) || (b.totalVol - a.totalVol));
  return result;
}

_ctx.buildSectorProspects = buildSectorProspects;

// ═══════════════════════════════════════════════════════════════════════════
// REPORTING DSM — format Direction Maritime
// ═══════════════════════════════════════════════════════════════════════════
// Spécification établie à partir du modèle fourni par la DSM et validée au
// tonne près sur les exports 2025 :
//
//   Périmètre   IMPORT = TIM + Hinterland Import   (534 476 TEU / 16 635 874 T)
//               EXPORT = TEM + Hinterland Export   (336 540 TEU /  4 385 383 T)
//
//   TEU         somme de NOMBRE_TEU, tous conditionnements confondus
//   CONV        CODE_CONDIT ∈ {VRAC, SACS, BRBK} uniquement — RORO et CARS
//               exclus — et hors poste pétrolier (brut + raffiné)
//
//   Le filtre « Non Apuré » n'est PAS appliqué : un B/L non apuré a bien été
//   manutentionné, même si sa procédure douanière reste ouverte. L'activer
//   creusait l'écart au modèle de 12 449 T à 1 154 047 T.
// ═══════════════════════════════════════════════════════════════════════════

const DSM_CONV_CONDIT = new Set(['VRAC', 'SACS', 'BRBK']);

function dsmIsConv(row) {
  return DSM_CONV_CONDIT.has(String(row.conditionnement || '').toUpperCase());
}

// Classement d'une dimension (armateur / manutentionnaire / consignataire)
// sur une unité d'œuvre donnée, avec comparaison N-1 et ligne de total.
function dsmRank(rowsN, rowsN1, keyFn, valFn) {
  const aggN = new Map(); const aggN1 = new Map();
  const cumul = (rows, map) => {
    for (const r of rows || []) {
      const k = String(keyFn(r) || '').trim();
      if (!k) continue;
      const v = valFn(r);
      if (!v) continue;
      map.set(k, (map.get(k) || 0) + v);
    }
  };
  cumul(rowsN, aggN); cumul(rowsN1, aggN1);
  const totN  = [...aggN.values()].reduce((s, v) => s + v, 0);
  const totN1 = [...aggN1.values()].reduce((s, v) => s + v, 0);

  // Union des deux périodes : un acteur présent seulement en N-1 doit
  // apparaître avec 0 en N (sortie de marché), et non disparaître.
  const noms = new Set([...aggN.keys(), ...aggN1.keys()]);
  const rows = [...noms].map((nom) => {
    const vN = aggN.get(nom) || 0;
    const vN1 = aggN1.get(nom) || 0;
    return {
      name: nom,
      valN: Math.round(vN * 100) / 100,
      pdmN: totN > 0 ? Math.round((vN / totN) * 1000) / 10 : 0,
      valN1: Math.round(vN1 * 100) / 100,
      pdmN1: totN1 > 0 ? Math.round((vN1 / totN1) * 1000) / 10 : 0,
      delta: Math.round((vN - vN1) * 100) / 100,
      deltaPct: vN1 > 0 ? Math.round(((vN - vN1) / vN1) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.valN - a.valN || b.valN1 - a.valN1);
  rows.forEach((r, i) => { r.rang = i + 1; });

  return {
    rows,
    total: {
      valN: Math.round(totN * 100) / 100,
      valN1: Math.round(totN1 * 100) / 100,
      delta: Math.round((totN - totN1) * 100) / 100,
      deltaPct: totN1 > 0 ? Math.round(((totN - totN1) / totN1) * 1000) / 10 : null,
    },
  };
}

/**
 * Construit les 12 tableaux du reporting DSM.
 * @param {Object} src { importN, importN1, exportN, exportN1 } — lignes déjà
 *   filtrées sur la période (N) et sur la période de comparaison (N-1).
 */
function buildDsmReport(src) {
  const DIMS = [
    ['armateurs',        (r) => r.armateur],
    ['manutentionnaires',(r) => r.manutentionnaire],
    ['consignataires',   (r) => r.consignataire],
  ];
  const out = {};
  for (const [sens, kN, kN1] of [['import', 'importN', 'importN1'],
                                 ['export', 'exportN', 'exportN1']]) {
    const rN  = src[kN]  || [];
    const rN1 = src[kN1] || [];
    const convN  = rN.filter(dsmIsConv);
    const convN1 = rN1.filter(dsmIsConv);
    for (const [dim, keyFn] of DIMS) {
      out[`${sens}_${dim}_teu`]  = dsmRank(rN, rN1, keyFn, (r) => r.teu || 0);
      out[`${sens}_${dim}_conv`] = dsmRank(convN, convN1, keyFn, (r) => r.poids || 0);
    }
    out[`${sens}_totaux`] = {
      teu:  out[`${sens}_armateurs_teu`].total,
      conv: out[`${sens}_armateurs_conv`].total,
    };
    // Séries mensuelles pour les graphes d'évolution des vues d'ensemble.
    // Appariement N ↔ N-1 par RANG dans la plage (cohérent avec le reste de
    // l'app) : les deux périodes peuvent couvrir des mois différents.
    const moisN  = MONTHS_FR_B.filter((m) => rN.some((r) => r.mois === m));
    const moisN1 = MONTHS_FR_B.filter((m) => rN1.some((r) => r.mois === m));
    const somme = (rows, mois, f) => rows.reduce(
      (s, r) => (r.mois === mois ? s + (f(r) || 0) : s), 0);
    out[`${sens}_mensuel`] = moisN.map((m, k) => {
      const m1 = moisN1[k] || null;
      return {
        mois: m, mois_n1: m1,
        teu:      Math.round(somme(rN, m, (r) => r.teu)),
        teu_n1:   m1 ? Math.round(somme(rN1, m1, (r) => r.teu)) : 0,
        conv:     Math.round(somme(convN, m, (r) => r.poids)),
        conv_n1:  m1 ? Math.round(somme(convN1, m1, (r) => r.poids)) : 0,
      };
    });
  }
  return out;
}

_ctx.buildDsmReport = buildDsmReport;

// Helpers exposés au worker pour filtrer les lignes DSM sur la période.
_ctx.inPeriodDsm   = (r, period) => inPeriod(r, period);
_ctx.inPeriodDsmN1 = (r, period) => (period && period.compare === false)
  ? false : inPeriod(r, shiftPeriodToN1(period));

// ═══════════════════════════════════════════════════════════════════════════
// OPPORTUNITÉS & HIGHLIGHTS — moteur prédictif
// ═══════════════════════════════════════════════════════════════════════════
// Renversement de logique par rapport à buildSectorProspects() : les 12
// secteurs PND servaient de FILTRE, ce qui rendait invisibles 42 % du volume
// (dont 15 988 TEU de RIZ, premier produit d'importation du pays, raté par
// un détail d'expression régulière). On part désormais du marché réel — donc
// 100 % du volume — et le secteur PND devient une ÉTIQUETTE posée après coup.
// Un libellé non reconnu perd son tag, plus son flux.
//
// UNITÉS : chaque métier garde la sienne (TEU maritime, tonnes aérien). Rien
// n'est jamais cumulé entre métiers — les signaux portent leur unité.
// ═══════════════════════════════════════════════════════════════════════════

let _PND_SECTEURS = null;
function setPndSecteurs(list) { _PND_SECTEURS = Array.isArray(list) ? list : null; }
_ctx.setPndSecteurs = setPndSecteurs;

function _pndTag(marchandise) {
  if (!_PND_SECTEURS) return null;
  const m = normMatch(marchandise);
  if (!m) return null;
  for (const sec of _PND_SECTEURS) {
    for (const kw of (sec.motsCles || [])) {
      try { if (new RegExp(kw, 'i').test(m)) return { nom: sec.nom, pnd: !!sec.pnd }; }
      catch (_) { if (m.includes(String(kw).toLowerCase())) return { nom: sec.nom, pnd: !!sec.pnd }; }
    }
  }
  return null;
}

// Seuil de significativité : un mouvement doit franchir À LA FOIS un plancher
// absolu (50 dans l'unité du métier) et un plancher relatif (0,1 % du marché).
// Sans le relatif, 50 t d'aérien (≈1 % d'un marché de 5 600 t) et 50 TEU de
// TIM (0,01 % de 473 000) auraient le même poids, ce qui est faux.
function _significatif(vol, marche) {
  return Math.abs(vol) >= 50 && (marche <= 0 || Math.abs(vol) >= marche * 0.001);
}

/**
 * Opportunités commerciales, approche ascendante.
 * @param {Array} sources [{ metier, unit, keptN, keptN1 }]
 */
function buildOpportunities(sources, period) {
  const out = [];
  for (const src of sources) {
    const rN  = period ? (src.keptN || []).filter((r) => inPeriod(r, period)) : (src.keptN || []);
    const rN1 = (period && period.compare === false) ? []
      : (src.keptN1 || []).filter((r) => inPeriod(r, shiftPeriodToN1(period)));
    if (!rN.length) continue;
    const ck = clientKeyForMetier(src.metier);
    const marche = rN.reduce((s, r) => s + (r.volume || 0), 0);
    const par = new Map();
    for (const r of rN) {
      const k = String(r.marchandise || '—').trim();
      let a = par.get(k);
      if (!a) { a = { tot: 0, agl: 0, cl: new Map() }; par.set(k, a); }
      a.tot += r.volume || 0;
      if (isAglB(r.transitaire)) a.agl += r.volume || 0;
      else {
        const c = String(r[ck] || '').trim();
        if (c) a.cl.set(c, (a.cl.get(c) || 0) + (r.volume || 0));
      }
    }
    const n1 = aggregateBy(rN1, (r) => String(r.marchandise || '—').trim());
    for (const [nom, a] of par.entries()) {
      const aCapter = a.tot - a.agl;
      if (!_significatif(aCapter, marche)) continue;
      const pdm = a.tot > 0 ? Math.round((a.agl / a.tot) * 1000) / 10 : 0;
      const vN1 = n1.get(nom) || 0;
      out.push({
        metier: src.metier, unit: src.unit,
        marchandise: nom,
        marche: Math.round(a.tot),
        agl: Math.round(a.agl),
        pdm,
        aCapter: Math.round(aCapter),
        partMarche: marche > 0 ? Math.round((a.tot / marche) * 1000) / 10 : 0,
        croissancePct: vN1 > 0 ? Math.round(((a.tot - vN1) / vN1) * 1000) / 10 : null,
        secteur: _pndTag(nom),
        prospects: [...a.cl.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
          .map(([n, v]) => ({ nom: n, vol: Math.round(v) })),
      });
    }
  }
  // Priorité : volume à capter, pondéré par la faiblesse de la PDM actuelle.
  out.sort((a, b) => (b.aCapter * (1 - b.pdm / 100)) - (a.aCapter * (1 - a.pdm / 100)));
  return out;
}
_ctx.buildOpportunities = buildOpportunities;

/**
 * HIGHLIGHTS — signaux à porter en CODIR, recalculés à chaque génération.
 *
 * Cinq familles, chacune notée puis classées entre elles :
 *   1. Client AGL en décrochage      (perte de volume vs N-1)
 *   2. Concurrent en progression     (gain de PDM sur un métier)
 *   3. Marchandise émergente         (absente N-1, significative en N)
 *   4. Opportunité majeure           (gros volume, PDM AGL faible)
 *   5. Perte de vitesse intra-période (2ᵈᵉ moitié vs 1ʳᵉ moitié de N)
 *
 * Le score croise l'AMPLEUR (volume en jeu, rapporté au marché du métier)
 * et la BRUTALITÉ (variation relative). Un client qui passe de 10 à 5 chute
 * de 50 % mais ne pèse rien : il ne remonte pas. Un client qui perd 15 % de
 * 8 000 TEU remonte.
 */
function buildHighlights(sources, period) {
  const sig = [];
  const push = (o) => { if (o && o.score > 0) sig.push(o); };

  for (const src of sources) {
    const unit = src.unit || 'TEU';
    const rN  = period ? (src.keptN || []).filter((r) => inPeriod(r, period)) : (src.keptN || []);
    const rN1 = (period && period.compare === false) ? []
      : (src.keptN1 || []).filter((r) => inPeriod(r, shiftPeriodToN1(period)));
    if (!rN.length) continue;
    const marche   = rN.reduce((s, r) => s + (r.volume || 0), 0);
    const marcheN1 = rN1.reduce((s, r) => s + (r.volume || 0), 0);
    const ck = clientKeyForMetier(src.metier);
    const aglN  = rN.filter((r) => isAglB(r.transitaire));
    const aglN1 = rN1.filter((r) => isAglB(r.transitaire));
    const base = { metier: src.metier, unit };
    const ampleur = (v) => (marche > 0 ? Math.min(1, Math.abs(v) / (marche * 0.05)) : 0);
    // Sans N-1 exploitable, tout concurrent « gagnerait » sa PDM entière et
    // toute marchandise serait « nouvelle » : on n'émet alors que les signaux
    // calculables sur la seule période N (opportunités, momentum).
    const aN1 = marcheN1 > 0 && rN1.length > 0;

    // ── 1. Clients AGL en décrochage ────────────────────────────────────
    const cN = aggregateBy(aglN, (r) => r[ck]);
    const cN1 = aggregateBy(aglN1, (r) => r[ck]);
    for (const [nom, v1] of (aN1 ? cN1.entries() : [])) {
      const v = cN.get(nom) || 0;
      const perte = v1 - v;
      if (!_significatif(perte, marche) || perte <= 0) continue;
      const chute = v1 > 0 ? perte / v1 : 0;
      if (chute < 0.25) continue;
      push({ ...base, type: 'client_decrochage',
        titre: `${String(nom).slice(0, 30)} — ${Math.round(chute * 100)} % de volume perdu`,
        detail: `${fmtNum(v1)} → ${fmtNum(v)} ${unit} (${fmtNum(-perte)})`,
        action: v === 0 ? 'Client perdu — reconquête à arbitrer' : 'Rendez-vous de rétention à programmer',
        score: Math.round((ampleur(perte) * 0.65 + chute * 0.35) * 100) });
    }

    // ── 2. Concurrents en progression ───────────────────────────────────
    const tN = aggregateBy(rN, (r) => r.transitaire);
    const tN1 = aggregateBy(rN1, (r) => r.transitaire);
    for (const [nom, v] of (aN1 ? tN.entries() : [])) {
      if (isAglB(nom)) continue;
      const v1 = tN1.get(nom) || 0;
      const gain = v - v1;
      if (!_significatif(gain, marche) || gain <= 0) continue;
      const pdm  = marche > 0 ? (v / marche) * 100 : 0;
      const pdm1 = marcheN1 > 0 ? (v1 / marcheN1) * 100 : 0;
      const dPts = pdm - pdm1;
      if (dPts < 1.0) continue;
      push({ ...base, type: 'concurrent_progression',
        titre: `${String(nom).slice(0, 30)} gagne ${dPts.toFixed(1).replace('.', ',')} pt de PDM`,
        detail: `${pdm1.toFixed(1)} % → ${pdm.toFixed(1)} % · +${fmtNum(gain)} ${unit}`,
        action: 'Analyser les comptes captés et la politique tarifaire',
        score: Math.round((ampleur(gain) * 0.55 + Math.min(1, dPts / 5) * 0.45) * 100) });
    }

    // ── 3. Marchandises émergentes ──────────────────────────────────────
    const mN = aggregateBy(rN, (r) => r.marchandise);
    const mN1 = aggregateBy(rN1, (r) => r.marchandise);
    if (aN1) {
      for (const [nom, v] of mN.entries()) {
        const v1 = mN1.get(nom) || 0;
        if (v1 > v * 0.1) continue;              // pas vraiment nouveau
        if (!_significatif(v, marche)) continue;
        const aglPart = aglN.filter((r) => r.marchandise === nom)
          .reduce((s, r) => s + (r.volume || 0), 0);
        push({ ...base, type: 'marchandise_emergente',
          titre: `${String(nom).slice(0, 30)} — segment nouveau (${fmtNum(v)} ${unit})`,
          detail: `absent en N-1 · PDM AGL ${(v > 0 ? (aglPart / v) * 100 : 0).toFixed(1)} %`,
          action: aglPart < v * 0.15 ? 'Segment à investir — AGL quasi absent'
                                     : 'Position à consolider',
          score: Math.round(ampleur(v) * 78) });
      }
    }

    // ── 4. Opportunités majeures (volume non capté) ─────────────────────
    for (const [nom, v] of mN.entries()) {
      const aglPart = aglN.filter((r) => r.marchandise === nom)
        .reduce((s, r) => s + (r.volume || 0), 0);
      const aCapter = v - aglPart;
      const pdm = v > 0 ? (aglPart / v) * 100 : 0;
      if (pdm > 8 || !_significatif(aCapter, marche)) continue;
      if (aCapter < marche * 0.02) continue;     // au moins 2 % du marché
      push({ ...base, type: 'opportunite',
        titre: `${String(nom).slice(0, 30)} — ${fmtNum(aCapter)} ${unit} hors AGL`,
        detail: `marché ${fmtNum(v)} ${unit} · PDM AGL ${pdm.toFixed(1)} %`,
        action: 'Cibler les chargeurs du segment',
        score: Math.round(ampleur(aCapter) * 72) });
    }

    // ── 5. Perte de vitesse intra-période ───────────────────────────────
    if (period && (period.endMonth - period.startMonth) >= 3) {
      const mid = Math.floor((period.startMonth + period.endMonth) / 2);
      const idx = (r) => MONTHS_FR_B.indexOf(r.mois) + 1;
      const h1 = aglN.filter((r) => idx(r) <= mid).reduce((s, r) => s + (r.volume || 0), 0);
      const h2 = aglN.filter((r) => idx(r) > mid).reduce((s, r) => s + (r.volume || 0), 0);
      const d = h2 - h1;
      if (_significatif(d, marche) && h1 > 0 && Math.abs(d / h1) >= 0.15) {
        const baisse = d < 0;
        push({ ...base, type: 'momentum',
          titre: `AGL ${src.metier} — ${baisse ? 'ralentissement' : 'accélération'} en 2ᵈᵉ moitié de période`,
          detail: `${fmtNum(h1)} → ${fmtNum(h2)} ${unit} (${(d / h1 * 100).toFixed(0)} %)`,
          action: baisse ? 'Identifier la cause du décrochage récent'
                         : 'Sécuriser la dynamique sur le prochain trimestre',
          score: Math.round((ampleur(d) * 0.6 + Math.min(1, Math.abs(d / h1)) * 0.4) * 92) });
      }
    }
  }

  // Un seul signal par type et par métier : sans cela une famille prolifique
  // (les opportunités, souvent nombreuses) monopoliserait la slide.
  // Deux dédoublonnages : un signal par famille et par métier (sinon une
  // famille prolifique monopolise la slide), et un seul signal par SUJET
  // (une même marchandise ressortait en « segment émergent » ET en
  // « opportunité », ce qui gaspille une ligne sur huit).
  const vusType = new Set();
  const vusSujet = new Set();
  return sig.sort((a, b) => b.score - a.score).filter((x) => {
    const kt = `${x.type}|${x.metier}`;
    const sujet = String(x.titre || '').split('—')[0].trim().toLowerCase();
    const ks = `${sujet}|${x.metier}`;
    if (vusType.has(kt) || vusSujet.has(ks)) return false;
    vusType.add(kt); vusSujet.add(ks);
    return true;
  }).slice(0, 8);
}
function fmtNum(v) {
  const n = Math.round(Math.abs(v));
  const s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + s;
}
_ctx.buildHighlights = buildHighlights;

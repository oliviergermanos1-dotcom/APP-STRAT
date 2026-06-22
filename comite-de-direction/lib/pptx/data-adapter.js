// Data adapter: transforms a Study object (with uploaded datasets) into the
// shape consumed by each slide of the generator.
//
// Contract: every build*(study, metier, opts?) returns either null (slide
// falls back to its hardcoded sample values, preserving byte-identical
// output to the reference PPTX) or an object whose fields drop into the
// slide template in place of the literals.
//
// Keep this file CommonJS — required by lib/pptx/generator.js (also CJS).

const MONTHS_FR_FULL = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

function fmtInt(value) {
  return Math.round(value).toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtPdm(value) {
  return value.toFixed(1).replace('.', ',') + ' %';
}

function findDataset(study, metier, datasetType) {
  if (!study || !Array.isArray(study.datasets)) return null;
  return study.datasets.find(
    (d) => d.metier === metier && d.datasetType === datasetType,
  );
}

function isAgl(name) {
  return /africa\s*global|^agl\b|^a\.?g\.?l\.?/i.test(name || '');
}

function unitOf(metier) {
  // AER volumes are converted from kg to tonnes in the parser → display 'T'.
  if (metier === 'AER') return 'T';
  if (metier === 'DSM') return 'T';
  return 'TEU';
}

/**
 * Répartition par pays de chargement (utilisé pour HEXP slide 18).
 * Returns null if the repartition_pays dataset is absent.
 */
function buildRepartitionPaysData(study, metier) {
  const ds = findDataset(study, metier, 'repartition_pays');
  if (!ds || !ds.rows.length) return null;
  const unit = unitOf(metier);
  return {
    source: ds.filename,
    unit,
    bars: ds.rows.map((r) => ({
      label: String(r.pays || ''),
      vol: fmtInt(Number(r.volume_marche) || 0) + ' ' + unit,
      pdm: Math.round(Number(r.pdm) || 0),
    })),
  };
}

/**
 * Generic overview: top-line KPI bar + monthly chart + monthly PDM bars.
 * Depends on `concurrents` (mandatory for market sizing) and `mensuel`
 * (optional for the time-series). Returns null if concurrents is missing.
 */
function buildOverviewData(study, metier) {
  const concurrents = findDataset(study, metier, 'concurrents');
  const mensuel = findDataset(study, metier, 'mensuel');
  if (!concurrents || !concurrents.rows.length) return null;

  const rows = concurrents.rows;
  const nameKey = rows[0].transitaire !== undefined ? 'transitaire' : 'nom_entite';
  const market = rows.reduce((s, r) => s + (Number(r.volume) || 0), 0);

  const ranked = [...rows].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
  );
  const aglIdx = ranked.findIndex((r) => isAgl(String(r[nameKey] || '')));
  const agl = aglIdx >= 0 ? ranked[aglIdx] : null;
  const aglVolume = agl ? Number(agl.volume) || 0 : 0;
  const aglPdm = market > 0 ? (aglVolume / market) * 100 : 0;

  const top4Pdm = market > 0
    ? (ranked.slice(0, 4).reduce((s, r) => s + (Number(r.volume) || 0), 0) / market) * 100
    : 0;

  const second = aglIdx === 0 && ranked.length > 1
    ? ranked[1]
    : (aglIdx > 0 ? ranked[0] : null);
  const ecart = agl && second ? aglVolume - (Number(second.volume) || 0) : 0;
  const secondName = second ? String(second[nameKey] || '') : null;

  let monthLabels = null;
  let monthlyMarket = null;
  let monthlyAgl = null;
  let monthlyPdm = null;
  if (mensuel && mensuel.rows.length > 0) {
    const m = mensuel.rows;
    monthLabels = m.map((r) => String(r.mois || '').slice(0, 4));
    monthlyMarket = m.map((r) => Number(r.volume_marche) || 0);
    monthlyAgl = m.map((r) => Number(r.volume_agl) || 0);
    monthlyPdm = m.map((r, i) =>
      monthlyMarket[i] > 0 ? (monthlyAgl[i] / monthlyMarket[i]) * 100 : 0,
    );
  }

  const unit = unitOf(metier);
  return {
    source: concurrents.filename,
    sourceMensuel: mensuel ? mensuel.filename : null,
    unit,
    market,
    aglVolume,
    aglPdm,
    aglRank: aglIdx >= 0 ? aglIdx + 1 : null,
    secondName,
    ecart,
    top4Pdm,
    monthLabels,
    monthlyMarket,
    monthlyAgl,
    monthlyPdm,
    kpis: {
      marche: fmtInt(market),
      agl: fmtInt(aglVolume),
      pdm: fmtPdm(aglPdm),
      ecart: (ecart >= 0 ? '+' : '') + fmtInt(ecart),
      top4: fmtPdm(top4Pdm),
    },
  };
}

/**
 * Ranking table (top 10) + segment bars. Both depend on `concurrents`
 * (and optionally `segments`). Returns null if concurrents missing.
 */
function buildConcurrentsData(study, metier) {
  const concurrents = findDataset(study, metier, 'concurrents');
  const segments = findDataset(study, metier, 'segments');
  if (!concurrents || !concurrents.rows.length) return null;

  const nameKey = concurrents.rows[0].transitaire !== undefined
    ? 'transitaire'
    : 'nom_entite';
  const ranked = [...concurrents.rows].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
  );
  const market = ranked.reduce((s, r) => s + (Number(r.volume) || 0), 0);
  const unit = unitOf(metier);

  const top10 = ranked.slice(0, 10).map((r, i) => [
    `#${i + 1}`,
    String(r[nameKey] || ''),
    fmtInt(Number(r.volume) || 0),
    fmtPdm(market > 0 ? ((Number(r.volume) || 0) / market) * 100 : 0),
  ]);

  let segmentBars = null;
  if (segments && segments.rows.length > 0) {
    segmentBars = segments.rows
      .map((r) => ({
        label: String(r.segment || ''),
        vol: fmtInt(Number(r.volume_marche) || 0) + ' ' + unit,
        pdm: Math.round(Number(r.pdm_agl) || 0),
      }))
      .sort((a, b) => b.pdm - a.pdm)
      .slice(0, 11);
  }

  return {
    source: concurrents.filename,
    unit,
    rows: top10,
    aglRowIdx: ranked.findIndex((r) => isAgl(String(r[nameKey] || ''))),
    segmentBars,
  };
}

/**
 * Top 10 clients (destinataires for imports, chargeurs for exports).
 * Depends on `clients`. Returns null if missing.
 */
function buildClienteleData(study, metier) {
  const clients = findDataset(study, metier, 'clients');
  if (!clients || !clients.rows.length) return null;

  const sorted = [...clients.rows].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
  );
  const aglTotal = sorted.reduce((s, r) => s + (Number(r.volume) || 0), 0);
  const unit = unitOf(metier);

  const rows = sorted.slice(0, 10).map((r) => [
    String(r.client || ''),
    fmtInt(Number(r.volume) || 0),
    String(r.segment || '—'),
    aglTotal > 0
      ? (((Number(r.volume) || 0) / aglTotal) * 100).toFixed(1).replace('.', ',') + '%'
      : (Number(r.pct_vol_agl) || 0).toFixed(1).replace('.', ',') + '%',
  ]);

  // Build segment mix for the pie chart (aggregate volumes per segment)
  const segmentMix = new Map();
  for (const r of sorted) {
    const seg = String(r.segment || 'Autres');
    segmentMix.set(seg, (segmentMix.get(seg) || 0) + (Number(r.volume) || 0));
  }
  const total = Array.from(segmentMix.values()).reduce((s, v) => s + v, 0);
  const mixSorted = Array.from(segmentMix.entries()).sort((a, b) => b[1] - a[1]);
  const top8 = mixSorted.slice(0, 8);
  const othersSum = mixSorted.slice(8).reduce((s, [, v]) => s + v, 0);
  const mixLabels = top8.map(([k]) => k);
  const mixValues = top8.map(([, v]) =>
    total > 0 ? Math.round((v / total) * 100) : 0,
  );
  if (othersSum > 0) {
    mixLabels.push('Autres');
    mixValues.push(Math.round((othersSum / total) * 100));
  }

  return {
    source: clients.filename,
    unit,
    rows,
    mixLabels,
    mixValues,
    topClient: sorted[0] ? String(sorted[0].client || '') : null,
    topClientShare:
      aglTotal > 0
        ? (((Number(sorted[0]?.volume) || 0) / aglTotal) * 100).toFixed(1).replace('.', ',') + '%'
        : null,
  };
}

/**
 * Nouveaux entrants — entries ranked 11–15 in the concurrents dataset
 * (i.e. just below the top-10 cut) + any rows from a dedicated `nouveaux`
 * dataset if supplied. N-1 cross-referencing is optional: when n1Runs are
 * present we tag verdicts but DO NOT filter rows out (caller decides).
 *
 * Returns null if no concurrents OR nouveaux dataset is available.
 */
function buildNouveauxData(study, metier) {
  const concurrents = findDataset(study, metier, 'concurrents');
  const dedicated = findDataset(study, metier, 'nouveaux');
  if (!concurrents && !dedicated) return null;

  const unit = unitOf(metier);
  let entrants = [];

  if (concurrents && concurrents.rows.length > 10) {
    const nameKey = concurrents.rows[0].transitaire !== undefined
      ? 'transitaire'
      : 'nom_entite';
    const ranked = [...concurrents.rows].sort(
      (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
    );
    const market = ranked.reduce((s, r) => s + (Number(r.volume) || 0), 0);
    entrants = ranked.slice(10, 15).map((r, i) => ({
      rang: `#${10 + i + 1}`,
      nom: String(r[nameKey] || ''),
      volume: Number(r.volume) || 0,
      pdm: market > 0 ? ((Number(r.volume) || 0) / market) * 100 : 0,
      segment: String(r.segment || '—'),
      verdict: null,
    }));
  }

  // Overlay dedicated `nouveaux` dataset (richer metadata)
  if (dedicated && dedicated.rows.length > 0) {
    entrants = dedicated.rows.map((r, i) => ({
      rang: `#${i + 1}`,
      nom: String(r.nom || ''),
      volume: Number(r.volume) || 0,
      pdm: 0,
      segment: String(r.segment || r.trimestre || '—'),
      verdict: null,
    }));
  }

  // Optional N-1 verdict overlay (tag rows; do not filter)
  const runs = Array.isArray(study?.n1Runs)
    ? study.n1Runs.filter((r) => r.metier === metier)
    : [];
  const latestRun = runs.length ? runs[runs.length - 1] : null;
  if (latestRun && Array.isArray(latestRun.results)) {
    const verdictMap = new Map();
    for (const v of latestRun.results) {
      verdictMap.set(String(v.entityName).toLowerCase(), v.verdict);
    }
    entrants = entrants.map((e) => ({
      ...e,
      verdict: verdictMap.get(e.nom.toLowerCase()) || null,
    }));
  }

  const tableRows = entrants.map((e) => [
    e.rang,
    e.nom,
    fmtInt(e.volume),
    fmtPdm(e.pdm),
    e.segment,
  ]);

  return {
    source: dedicated ? dedicated.filename : concurrents.filename,
    unit,
    rows: tableRows,
    entries: entrants,
    hasN1Verdicts: !!latestRun,
  };
}

/**
 * Build the full "nouveaux entrants" picture: 3 newcomer tables + top-3
 * growth marchandises + top-10 destinataires with their AGL PDM. All five
 * datasets must be present in study.datasets (produced by the browser
 * dataset-builder) for the slide to render in live mode.
 */
function buildNouveauxFullData(study, metier) {
  const find = (t) => findDataset(study, metier, t);
  const nouveaux = find('nouveaux');
  const nouveauxMerch = find('nouveaux_marchandises');
  const nouveauxClients = find('nouveaux_clients');
  const topGrowth = find('top_growth');
  const topDest = find('top_destinataires_pdm');

  if (!nouveaux || !nouveauxMerch || !nouveauxClients) return null;

  const unit = unitOf(metier);

  // Compute insight metrics
  const totalNouveauxTransit = nouveaux.rows.length;
  const totalNouvellesMerch = nouveauxMerch.rows.length;
  const totalNouveauxClients = nouveauxClients.rows.length;
  const topGr = (topGrowth && topGrowth.rows[0]) || null;
  const topConquest = (nouveauxClients.rows || [])
    .map((r) => ({ ...r, upside: Math.max(0, (Number(r.volume_n1_others) || 0) - (Number(r.volume) || 0)) }))
    .sort((a, b) => b.upside - a.upside)[0] || null;
  const topUntappedDest = (topDest && topDest.rows ? topDest.rows : [])
    .filter((r) => (Number(r.pdm_agl) || 0) < 5)
    .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))[0] || null;

  return {
    source: nouveaux.filename,
    unit,
    metrics: {
      totalNouveauxTransit,
      totalNouvellesMerch,
      totalNouveauxClients,
      topGrowthName: topGr ? topGr.segment : null,
      topGrowthDelta: topGr ? topGr.delta_volume : 0,
      topGrowthDeltaStr: topGr ? fmtInt(topGr.delta_volume) : '0',
      topGrowthPct: topGr ? topGr.growth_pct : null,
      topGrowthPdmAgl: topGr ? topGr.pdm_agl : null,
      topConquestName: topConquest ? topConquest.client : null,
      topConquestUpside: topConquest ? topConquest.upside : 0,
      topConquestUpsideStr: topConquest ? fmtInt(topConquest.upside) : '0',
      topConquestAglVolume: topConquest ? topConquest.volume : 0,
      topConquestAglVolumeStr: topConquest ? fmtInt(topConquest.volume) : '0',
      topConquestSegment: topConquest ? topConquest.segment : null,
      topUntappedName: topUntappedDest ? topUntappedDest.client : null,
      topUntappedVolume: topUntappedDest ? topUntappedDest.volume : 0,
      topUntappedVolumeStr: topUntappedDest ? fmtInt(topUntappedDest.volume) : '0',
      topUntappedPdm: topUntappedDest ? topUntappedDest.pdm_agl : 0,
    },
    nouveauxTransitaires: nouveaux.rows.slice(0, 5).map((r) => [
      String(r.transitaire || ''),
      fmtInt(Number(r.volume) || 0),
      fmtPdm(Number(r.pdm) || 0),
    ]),
    nouveauxMarchandises: nouveauxMerch.rows.slice(0, 5).map((r) => [
      String(r.segment || ''),
      fmtInt(Number(r.volume_marche) || 0),
      (r.pdm_agl != null ? r.pdm_agl + ' %' : '—'),
    ]),
    nouveauxClients: nouveauxClients.rows.slice(0, 5).map((r) => [
      String(r.client || ''),
      fmtInt(Number(r.volume) || 0),
      fmtInt(Number(r.volume_n1_others) || 0),
    ]),
    topGrowth: (topGrowth ? topGrowth.rows : []).map((r) => [
      String(r.segment || ''),
      fmtInt(Number(r.volume_marche) || 0),
      fmtInt(Number(r.volume_n1) || 0),
      '+' + fmtInt(Number(r.delta_volume) || 0),
      (r.growth_pct != null ? r.growth_pct + ' %' : 'NEW'),
      (r.pdm_agl != null ? r.pdm_agl + ' %' : '—'),
    ]),
    topDestinataires: (topDest ? topDest.rows : []).map((r) => [
      String(r.client || '').slice(0, 32),
      fmtInt(Number(r.volume) || 0),
      fmtInt(Number(r.volume_agl) || 0),
      (r.pdm_agl != null ? r.pdm_agl + ' %' : '—'),
    ]),
  };
}

module.exports = {
  buildOverviewData,
  buildConcurrentsData,
  buildClienteleData,
  buildNouveauxData,
  buildNouveauxFullData,
  buildRepartitionPaysData,
  // Legacy aliases for TIM-specific call sites (slide 4/5)
  buildTimOverviewData: (study) => buildOverviewData(study, 'TIM'),
  buildTimConcurrentsData: (study) => buildConcurrentsData(study, 'TIM'),
  MONTHS_FR_FULL,
};

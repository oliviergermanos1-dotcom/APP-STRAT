// Data adapter: transforms a Study object (with uploaded datasets) into the
// shape consumed by each slide of the generator.
//
// Each `build<Metier><Slide>Data(study)` returns either:
//   - null  → no relevant dataset uploaded; the slide falls back to the
//             hardcoded sample values (current behaviour)
//   - object → live values derived from the user's uploads
//
// Keep this file CommonJS — it is required by lib/pptx/generator.js (also CJS).

const MONTHS_FR_FULL = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

function fmtTeu(value) {
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
  return /africa\s*global|^agl\b|^a\.?g\.?l\.?/i.test(name);
}

function buildTimOverviewData(study) {
  const concurrents = findDataset(study, 'TIM', 'concurrents');
  const mensuel = findDataset(study, 'TIM', 'mensuel');
  if (!concurrents || !concurrents.rows.length) return null;

  const rows = concurrents.rows;
  const market = rows.reduce((sum, r) => sum + (Number(r.volume) || 0), 0);
  const aglIdx = rows.findIndex((r) => isAgl(String(r.transitaire || '')));
  const agl = aglIdx >= 0 ? rows[aglIdx] : null;
  const aglVolume = agl ? Number(agl.volume) || 0 : 0;
  const aglPdm = market > 0 ? (aglVolume / market) * 100 : 0;

  const ranked = [...rows].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
  );
  const top4Sum = ranked.slice(0, 4).reduce(
    (s, r) => s + (Number(r.volume) || 0),
    0,
  );
  const top4Pdm = market > 0 ? (top4Sum / market) * 100 : 0;

  const aglRankIdx = ranked.findIndex((r) =>
    isAgl(String(r.transitaire || '')),
  );
  const second =
    aglRankIdx === 0 && ranked.length > 1 ? ranked[1] : null;
  const ecart = second ? aglVolume - (Number(second.volume) || 0) : 0;

  let monthlyMarket = null;
  let monthlyAgl = null;
  let monthlyPdm = null;
  let monthLabels = null;
  if (mensuel && mensuel.rows.length > 0) {
    const m = [...mensuel.rows];
    monthLabels = m.map((r) => String(r.mois || '').slice(0, 4));
    monthlyMarket = m.map((r) => Number(r.volume_marche) || 0);
    monthlyAgl = m.map((r) => Number(r.volume_agl) || 0);
    monthlyPdm = m.map((r, i) =>
      monthlyMarket[i] > 0 ? (monthlyAgl[i] / monthlyMarket[i]) * 100 : 0,
    );
  }

  return {
    source: concurrents.filename,
    market,
    aglVolume,
    aglPdm,
    aglRank: aglRankIdx >= 0 ? aglRankIdx + 1 : null,
    secondName: second ? String(second.transitaire) : null,
    ecart,
    top4Pdm,
    monthLabels,
    monthlyMarket,
    monthlyAgl,
    monthlyPdm,
    kpis: {
      marche: fmtTeu(market),
      agl: fmtTeu(aglVolume),
      pdm: fmtPdm(aglPdm),
      ecart: (ecart >= 0 ? '+' : '') + fmtTeu(ecart),
      top4: fmtPdm(top4Pdm),
    },
  };
}

function buildTimConcurrentsData(study) {
  const concurrents = findDataset(study, 'TIM', 'concurrents');
  const segments = findDataset(study, 'TIM', 'segments');
  if (!concurrents || !concurrents.rows.length) return null;

  const ranked = [...concurrents.rows].sort(
    (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0),
  );
  const market = ranked.reduce((s, r) => s + (Number(r.volume) || 0), 0);

  const top10 = ranked.slice(0, 10).map((r, i) => [
    `#${i + 1}`,
    String(r.transitaire || ''),
    fmtTeu(Number(r.volume) || 0),
    fmtPdm(market > 0 ? ((Number(r.volume) || 0) / market) * 100 : 0),
  ]);

  let segmentBars = null;
  if (segments && segments.rows.length > 0) {
    segmentBars = segments.rows
      .map((r) => ({
        label: String(r.segment || ''),
        vol: fmtTeu(Number(r.volume_marche) || 0) + ' TEU',
        pdm: Math.round(Number(r.pdm_agl) || 0),
      }))
      .sort((a, b) => b.pdm - a.pdm)
      .slice(0, 11);
  }

  return {
    source: concurrents.filename,
    rows: top10,
    aglRowIdx: ranked.findIndex((r) =>
      isAgl(String(r.transitaire || '')),
    ),
    segmentBars,
  };
}

module.exports = {
  buildTimOverviewData,
  buildTimConcurrentsData,
  MONTHS_FR_FULL,
};

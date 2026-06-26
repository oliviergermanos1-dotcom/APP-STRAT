// Stateful Web Worker for STATCOM parsing AND dataset building.
//
// Architecture: ONE persistent worker is created at app boot. It owns an
// internal Map<key, keptRows[]>. The main thread only ever receives
// lightweight payloads:
//   - parse  → metadata + per-filter counters
//   - build  → small aggregated datasets (a few KB)
//   - forget → cleanup
//
// This keeps the 100k+ row arrays entirely inside the worker context, so
// no structured-clone / JSON.parse over big data ever happens on the
// main thread.

importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
importScripts('./statcom-parser.js?v=20260625i');
importScripts('./dataset-builder.js?v=20260625i');

// Map<key, { metier, filename, kept, market, schema, unit }>
const cache = new Map();

function reply(id, payload) {
  self.postMessage({ id, ...payload });
}

self.onmessage = (event) => {
  const msg = event.data || {};
  const { kind, id } = msg;

  try {
    if (kind === 'parse') {
      reply(id, { kind: 'progress', phase: 'parsing' });
      const { key, buffer, metier, filename, opts } = msg;
      const r = self.parseStatcomBuffer(buffer, metier, filename, opts || {});
      cache.set(key, {
        metier,
        filename,
        kept: r.kept,
        market: r.market,
        schema: r.schema,
        unit: r.unit,
      });
      // Reply with metadata ONLY (no kept rows crossing the boundary).
      reply(id, {
        ok: true,
        kind: 'parse',
        metadata: {
          filename: r.filename,
          schema: r.schema,
          unit: r.unit,
          rowCount: r.rowCount,
          keptCount: r.keptCount,
          dropped: r.dropped,
          market: r.market,
        },
      });
      return;
    }

    if (kind === 'forget') {
      cache.delete(msg.key);
      reply(id, { ok: true, kind: 'forget' });
      return;
    }

    if (kind === 'build') {
      // msg.metierKeys = { TIM: { n: 'k1', n1: 'k2' }, TEM: { n: 'k3', n1: 'k4' }, ... }
      // msg.period    = { startYear, startMonth, endYear, endMonth }
      const { metierKeys, period } = msg;
      const allDatasets = [];
      const reports = {};
      for (const [metier, scopes] of Object.entries(metierKeys)) {
        const cN = scopes.n  ? cache.get(scopes.n)  : null;
        const cN1 = scopes.n1 ? cache.get(scopes.n1) : null;
        if (!cN) continue;
        const built = self.buildDatasets({
          keptN: cN.kept,
          keptN1: cN1 ? cN1.kept : null,
          period,
          metier,
          filename: cN.filename,
        });
        reports[metier] = {
          market: built.market,
          aglVolume: built.aglVolume,
          aglPdm: built.aglPdm,
        };
        for (const ds of built.datasets) {
          allDatasets.push({
            metier,
            datasetType: ds.datasetType,
            filename: ds.filename,
            rowCount: ds.rowCount,
            rows: ds.rows,
          });
        }
      }
      // DSM derived from the import maritime base (TIM rows), by weight.
      if (msg.dsm && msg.dsm.nKey) {
        const cN = cache.get(msg.dsm.nKey);
        const cN1 = msg.dsm.n1Key ? cache.get(msg.dsm.n1Key) : null;
        if (cN) {
          const dsm = self.buildDsmDatasets(
            cN.kept, cN1 ? cN1.kept : null, period, cN.filename,
          );
          reports.DSM = { market: dsm.market, aglVolume: dsm.aglTonnage, aglPdm: dsm.aglPdm };
          for (const ds of dsm.datasets) {
            allDatasets.push({
              metier: 'DSM',
              datasetType: ds.datasetType,
              rows: ds.rows,
              meta: ds.meta || null,
            });
          }
        }
      }

      // MINING focus — TIM rows restricted to mining destinataires, then a
      // standard TIM-like analysis (metier label 'MINING').
      if (msg.mining && msg.mining.nKey) {
        const cN = cache.get(msg.mining.nKey);
        const cN1 = msg.mining.n1Key ? cache.get(msg.mining.n1Key) : null;
        if (cN) {
          const keptN = cN.kept.filter((r) => self.isMiningDestinataire(r.destinataire));
          const keptN1 = cN1 ? cN1.kept.filter((r) => self.isMiningDestinataire(r.destinataire)) : null;
          const built = self.buildDatasets({ keptN, keptN1, period, metier: 'MINING', filename: cN.filename });
          reports.MINING = { market: built.market, aglVolume: built.aglVolume, aglPdm: built.aglPdm };
          for (const ds of built.datasets) {
            allDatasets.push({ metier: 'MINING', datasetType: ds.datasetType, rows: ds.rows });
          }
        }
      }

      // AYMAN focus — competitor forwarder across all uploaded metiers.
      if (msg.ayman && msg.ayman.length) {
        const sources = [];
        for (const a of msg.ayman) {
          const cN = cache.get(a.nKey);
          if (!cN) continue;
          const cN1 = a.n1Key ? cache.get(a.n1Key) : null;
          sources.push({ metier: a.metier, unit: cN.unit, keptN: cN.kept, keptN1: cN1 ? cN1.kept : null });
        }
        if (sources.length) {
          const ay = self.buildAymanDatasets(sources, period);
          allDatasets.push({ metier: 'AYIMAN', datasetType: 'ayiman_focus', rows: [ay] });
        }
      }

      // SECTOR PROSPECTS — cross PND/newsletter ↔ STATCOM marchandises.
      // Réutilise toutes les sources STATCOM uploadées pour fournir des
      // exemples concrets de destinataires/chargeurs par secteur prioritaire.
      const prospectSources = [];
      for (const [metier, scopes] of Object.entries(metierKeys || {})) {
        const cN = scopes.n ? cache.get(scopes.n) : null;
        if (cN) prospectSources.push({ metier, keptN: cN.kept });
      }
      if (prospectSources.length && self.buildSectorProspects) {
        const prospects = self.buildSectorProspects(prospectSources, period);
        allDatasets.push({
          metier: 'PREDICTION', datasetType: 'sector_prospects', rows: prospects,
        });
      }

      reply(id, { ok: true, kind: 'build', datasets: allDatasets, reports });
      return;
    }

    if (kind === 'status') {
      const entries = [];
      for (const [k, v] of cache.entries()) {
        entries.push({ key: k, metier: v.metier, filename: v.filename, keptCount: v.kept.length });
      }
      reply(id, { ok: true, kind: 'status', entries });
      return;
    }

    reply(id, { ok: false, error: 'Unknown kind: ' + kind });
  } catch (err) {
    reply(id, { ok: false, error: (err && err.message) || String(err), stack: err && err.stack });
  }
};

// Ensure dataset-builder's MONTHS_FR_B/isAglB references are resolved.
// dataset-builder.js declares them at top via window.STATCOM — within
// the worker this is `self.STATCOM` thanks to the parser's _globalRef fix.

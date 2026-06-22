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
importScripts('./statcom-parser.js?v=20260618h');
importScripts('./dataset-builder.js?v=20260618h');

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

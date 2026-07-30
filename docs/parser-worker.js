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
importScripts('./statcom-parser.js?v=20260729h');
importScripts('./dataset-builder.js?v=20260729h');

// Map<key, { metier, filename, kept, market, schema, unit }>
const cache = new Map();

function reply(id, payload) {
  self.postMessage({ id, ...payload });
}

// Les lignes « Non Apuré » sont conservées au parsing et seulement marquées.
// Elles sont retirées ICI, uniquement pour les analyses fondées sur le
// TRANSITAIRE (concurrents, clientèle AGL, segments, mensuel, nouveaux
// entrants). Le reporting DSM et les focus par armateur les conservent.
function keptTransit(entry) {
  if (!entry || !entry.kept) return [];
  if (!(entry.opts && entry.opts.excludeNonApure)) return entry.kept;
  return entry.kept.filter((r) => !r.nonApure);
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
        opts: opts || {},
        kept: r.kept,
        market: r.market,
        coverage: r.coverage || null,
        schema: r.schema,
        unit: r.unit,
      });
      // Reply with metadata ONLY (no kept rows crossing the boundary).
      reply(id, {
        ok: true,
        kind: 'parse',
        metadata: {
          filename: r.filename,
          coverage: r.coverage || null,
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

    // Référentiel sectoriel PND transmis au démarrage (data/pnd_sectors.json).
    if (kind === 'pnd') {
      if (self.setPndSecteurs) self.setPndSecteurs(msg.secteurs || []);
      reply(id, { ok: true, kind: 'pnd', count: (msg.secteurs || []).length });
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
          keptN: keptTransit(cN),
          keptN1: cN1 ? keptTransit(cN1) : null,
          period,
          metier,
          filename: cN.filename,
        });
        reports[metier] = {
          market: built.market,
          aglVolume: built.aglVolume,
          aglPdm: built.aglPdm,
          coverage: built.coverage,
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
          // Périmètre DSM = import maritime + import hinterland. On concatène
          // les lignes retenues des deux bases avant agrégation ; sans cela
          // tout le transit Mali/Burkina (≈ 5 M T/an) manquait au marché.
          const merge = (base, keys) => {
            let rows = base ? base.kept : [];
            for (const k of (keys || [])) {
              const c = cache.get(k);
              if (c && c.kept) rows = rows.concat(c.kept);
            }
            return rows;
          };
          const rowsN  = merge(cN,  msg.dsm.extraNKeys);
          const rowsN1 = cN1 || (msg.dsm.extraN1Keys || []).length
            ? merge(cN1, msg.dsm.extraN1Keys) : null;
          const dsm = self.buildDsmDatasets(
            rowsN, (rowsN1 && rowsN1.length) ? rowsN1 : null, period, cN.filename,
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
      // Focus minier AÉRIEN — étude distincte du maritime, en tonnes.
      // Même détection de destinataire minier, base AER Import.
      if (msg.miningAer && msg.miningAer.nKey) {
        const aN = cache.get(msg.miningAer.nKey);
        const aN1 = msg.miningAer.n1Key ? cache.get(msg.miningAer.n1Key) : null;
        if (aN) {
          const kN  = keptTransit(aN).filter((r) => self.isMiningDestinataire(r.destinataire));
          const kN1 = aN1 ? keptTransit(aN1).filter((r) => self.isMiningDestinataire(r.destinataire)) : null;
          // Aucun minier en aérien sur la période : on n'émet aucun dataset,
          // les slides correspondantes seront masquées plutôt que vides.
          if (kN.length > 0) {
            const b = self.buildDatasets({
              keptN: kN, keptN1: kN1, period, metier: 'MININGAER', filename: aN.filename });
            reports.MININGAER = { market: b.market, aglVolume: b.aglVolume, aglPdm: b.aglPdm };
            for (const ds of b.datasets) {
              allDatasets.push({ metier: 'MININGAER', datasetType: ds.datasetType,
                                 filename: aN.filename, rows: ds.rows });
            }
          }
        }
      }

      if (msg.mining && msg.mining.nKey) {
        const cN = cache.get(msg.mining.nKey);
        const cN1 = msg.mining.n1Key ? cache.get(msg.mining.n1Key) : null;
        if (cN) {
          const keptN = keptTransit(cN).filter((r) => self.isMiningDestinataire(r.destinataire));
          const keptN1 = cN1 ? keptTransit(cN1).filter((r) => self.isMiningDestinataire(r.destinataire)) : null;
          const built = self.buildDatasets({ keptN, keptN1, period, metier: 'MINING', filename: cN.filename });
          reports.MINING = { market: built.market, aglVolume: built.aglVolume, aglPdm: built.aglPdm };
          for (const ds of built.datasets) {
            allDatasets.push({ metier: 'MINING', datasetType: ds.datasetType,
                               filename: cN.filename, rows: ds.rows });
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
          sources.push({ metier: a.metier, unit: cN.unit, keptN: keptTransit(cN), keptN1: cN1 ? keptTransit(cN1) : null });
        }
        if (sources.length) {
          const ay = self.buildAymanDatasets(sources, period);
          allDatasets.push({ metier: 'AYIMAN', datasetType: 'ayiman_focus', rows: [ay] });
        }
      }

      // ── REPORTING DSM (import + export, TEU + conventionnel) ─────────
      if (msg.dsmReport && self.buildDsmReport) {
        const cat = (keys) => {
          let out = [];
          for (const k of (keys || [])) {
            const c = cache.get(k);
            if (c && c.kept) out = out.concat(c.kept);
          }
          return out;
        };
        const src = {
          importN:  cat(msg.dsmReport.importN),
          importN1: cat(msg.dsmReport.importN1),
          exportN:  cat(msg.dsmReport.exportN),
          exportN1: cat(msg.dsmReport.exportN1),
        };
        const inPer  = (r) => !period || self.inPeriodDsm(r, period);
        if (src.importN.length || src.exportN.length) {
          const rep = self.buildDsmReport({
            importN:  src.importN.filter((r) => inPer(r)),
            importN1: src.importN1.filter((r) => self.inPeriodDsmN1(r, period)),
            exportN:  src.exportN.filter((r) => inPer(r)),
            exportN1: src.exportN1.filter((r) => self.inPeriodDsmN1(r, period)),
          });
          allDatasets.push({ metier: 'DSMREP', datasetType: 'dsm_report', rows: [rep] });
        }
      }

      // ── PRÉDICTIF : highlights + opportunités ────────────────────────
      // Alimentés par tous les métiers chargés. Chaque signal porte son
      // métier et son unité — rien n'est cumulé entre TEU et tonnes.
      if (self.buildHighlights) {
        const predSrc = [];
        for (const [metier, scopes] of Object.entries(metierKeys || {})) {
          const cN = scopes.n ? cache.get(scopes.n) : null;
          const cN1 = scopes.n1 ? cache.get(scopes.n1) : null;
          if (cN) predSrc.push({ metier, unit: cN.unit,
            keptN: keptTransit(cN), keptN1: cN1 ? keptTransit(cN1) : null });
        }
        if (predSrc.length) {
          allDatasets.push({ metier: 'PREDICTION', datasetType: 'highlights',
                             rows: self.buildHighlights(predSrc, period) });
          allDatasets.push({ metier: 'PREDICTION', datasetType: 'opportunites',
                             rows: self.buildOpportunities(predSrc, period) });
        }
      }

      // SECTOR PROSPECTS — cross PND/newsletter ↔ STATCOM marchandises.
      // Réutilise toutes les sources STATCOM uploadées pour fournir des
      // exemples concrets de destinataires/chargeurs par secteur prioritaire.
      const prospectSources = [];
      for (const [metier, scopes] of Object.entries(metierKeys || {})) {
        const cN = scopes.n ? cache.get(scopes.n) : null;
        if (cN) prospectSources.push({ metier, keptN: keptTransit(cN) });
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

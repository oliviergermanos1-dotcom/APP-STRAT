// Web Worker for STATCOM parsing.
// Imports SheetJS (XLSX) and the statcom-parser logic, then listens for
// messages from the main thread, parses, and posts the result back.
//
// This isolates the heavy synchronous loops (~125k rows × 46 cols) from
// the UI thread so the browser never shows "Cette page ne répond pas".

importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
importScripts('./statcom-parser.js');

self.onmessage = (event) => {
  const { id, buffer, metier, filename, opts } = event.data || {};
  try {
    self.postMessage({ id, kind: 'progress', phase: 'parsing' });
    const result = self.parseStatcomBuffer(buffer, metier, filename, opts || {});

    // Serialise to a JSON string so the main thread receives a single
    // immutable blob (native JSON.parse is much faster than structured-
    // cloning 50k+ nested objects).
    self.postMessage({ id, kind: 'progress', phase: 'encoding' });
    const json = JSON.stringify(result);
    self.postMessage({ id, ok: true, json });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: (err && err.message) || String(err),
    });
  }
};

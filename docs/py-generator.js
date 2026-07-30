// py-generator.js — Python-pptx generation pipeline (Pyodide in browser).
//
// pptxgenjs output is rejected by Olivier's PowerPoint (AGL enterprise GPO),
// while python-pptx output opens fine. We therefore run python-pptx inside
// the browser via Pyodide (Python 3.12 + WebAssembly). All data stays
// 100% client-side — Pyodide runs in the same process as the page.
//
// Public API:
//   await window.pyGenerate(study) → Uint8Array (PPTX binary)
//
// First call boots Pyodide (~30 MB, cached) + installs python-pptx via
// micropip. Subsequent calls are instantaneous.

(function () {
  let _pyodide = null;
  let _bootPromise = null;
  let _generatorCode = null;

  async function fetchGeneratorPy() {
    if (_generatorCode) return _generatorCode;
    const r = await fetch('./generator.py?v=20260729h');
    if (!r.ok) throw new Error('generator.py introuvable (HTTP ' + r.status + ')');
    _generatorCode = await r.text();
    return _generatorCode;
  }

  async function bootPyodide(onProgress) {
    if (_pyodide) return _pyodide;
    if (_bootPromise) return _bootPromise;
    _bootPromise = (async () => {
      if (!window.loadPyodide) throw new Error('Pyodide non chargé (CDN)');
      onProgress && onProgress('Chargement de Pyodide…');
      const py = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
      });
      onProgress && onProgress('Installation de python-pptx…');
      await py.loadPackage('micropip');
      const micropip = py.pyimport('micropip');
      await micropip.install(['python-pptx']);
      _pyodide = py;
      return py;
    })();
    return _bootPromise;
  }

  async function pyGenerate(study, onProgress) {
    const py = await bootPyodide(onProgress);
    onProgress && onProgress('Préparation du script de génération…');
    const code = await fetchGeneratorPy();
    py.globals.set('STUDY_JSON', JSON.stringify(study || {}));
    onProgress && onProgress('Génération du PPTX (Python)…');
    await py.runPythonAsync(code);
    const bytes = py.globals.get('PPTX_BYTES');
    // bytes is a PyProxy over a Python bytes object; toJs() returns Uint8Array
    const arr = bytes.toJs({ create_proxies: false });
    bytes.destroy();
    return arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  }

  window.pyGenerate = pyGenerate;
  window.bootPyodide = bootPyodide;
})();

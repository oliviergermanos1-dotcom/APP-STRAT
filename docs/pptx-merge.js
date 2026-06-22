// pptx-merge.js — client-side, verbatim merge of external PPTX slides into the
// generated deck. pptxgenjs can only author slides from scratch, so to copy
// uploaded slides "à l'identique" we splice their raw OOXML (slide XML + the
// layout/master/theme chain + media/charts they reference) into the base .pptx
// zip and register them in [Content_Types].xml, presentation.xml(.rels).
//
// Public API:
//   await window.PPTXMerge.mergeExternalSlides(baseBlob, inserts)
//   inserts = [{ after: <1-based slide index in base sldIdLst>, buffer: ArrayBuffer }]
//   inserts are applied so that each external deck's slides appear, in order,
//   immediately after the given base slide. Returns a Blob (merged pptx).

(function () {
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  // ── path helpers ───────────────────────────────────────────────────────────
  function dirname(p) {
    const i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }
  function basename(p) {
    const i = p.lastIndexOf('/');
    return i < 0 ? p : p.slice(i + 1);
  }
  function extname(p) {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i < 0 ? '' : b.slice(i + 1).toLowerCase();
  }
  // Resolve a relationship Target (possibly "../media/x.png") against the folder
  // that contains the *part* (not the .rels file). Returns an absolute zip path.
  function resolvePath(baseDir, target) {
    // Absolute targets ("/ppt/…") are relative to the package root.
    const stack = target.charAt(0) === '/' ? [] : (baseDir ? baseDir.split('/') : []);
    for (const seg of target.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') stack.pop();
      else stack.push(seg);
    }
    return stack.join('/');
  }
  // Relative path from a part's folder to a target absolute path.
  function relPath(fromDir, toPath) {
    const from = fromDir ? fromDir.split('/') : [];
    const to = toPath.split('/');
    let i = 0;
    while (i < from.length && i < to.length && from[i] === to[i]) i++;
    const up = from.slice(i).map(() => '..');
    return up.concat(to.slice(i)).join('/');
  }
  function relsPathFor(partPath) {
    return dirname(partPath) + '/_rels/' + basename(partPath) + '.rels';
  }

  // ── tiny string helpers (avoid full DOM parse for robustness) ───────────────
  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Parse a .rels XML into [{id, type, target, mode}]
  function parseRels(xml) {
    if (!xml) return [];
    const out = [];
    const re = /<Relationship\b[^>]*?\/?>/g;
    let m;
    while ((m = re.exec(xml))) {
      const tag = m[0];
      const id = (tag.match(/\bId="([^"]*)"/) || [])[1];
      const type = (tag.match(/\bType="([^"]*)"/) || [])[1];
      const target = (tag.match(/\bTarget="([^"]*)"/) || [])[1];
      const mode = (tag.match(/\bTargetMode="([^"]*)"/) || [])[1];
      if (id && target) out.push({ id, type, target, mode });
    }
    return out;
  }

  // Read [Content_Types].xml → { overrides:{partName:contentType}, defaults:{ext:contentType} }
  function parseContentTypes(xml) {
    const overrides = {};
    const defaults = {};
    let m;
    const reO = /<Override\b[^>]*?\/?>/g;
    while ((m = reO.exec(xml))) {
      const pn = (m[0].match(/\bPartName="([^"]*)"/) || [])[1];
      const ct = (m[0].match(/\bContentType="([^"]*)"/) || [])[1];
      if (pn) overrides[pn] = ct;
    }
    const reD = /<Default\b[^>]*?\/?>/g;
    while ((m = reD.exec(xml))) {
      const ex = (m[0].match(/\bExtension="([^"]*)"/) || [])[1];
      const ct = (m[0].match(/\bContentType="([^"]*)"/) || [])[1];
      if (ex) defaults[ex.toLowerCase()] = ct;
    }
    return { overrides, defaults };
  }

  function maxIndexIn(zip, re) {
    let max = 0;
    zip.forEach((path) => {
      const m = re.exec(path);
      if (m) max = Math.max(max, parseInt(m[1], 10));
      re.lastIndex = 0;
    });
    return max;
  }

  // Decide the new path for a copied external part, by its folder/type, using
  // monotonically increasing counters so it never collides with the base deck.
  function newPathFor(oldPath, ctr) {
    const ext = extname(oldPath);
    if (/^ppt\/slides\/slide\d+\.xml$/.test(oldPath)) return 'ppt/slides/slide' + (++ctr.slide) + '.xml';
    if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(oldPath)) return 'ppt/slideLayouts/slideLayout' + (++ctr.layout) + '.xml';
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(oldPath)) return 'ppt/slideMasters/slideMaster' + (++ctr.master) + '.xml';
    if (/^ppt\/theme\/theme\d+\.xml$/.test(oldPath)) return 'ppt/theme/theme' + (++ctr.theme) + '.xml';
    if (/^ppt\/media\//.test(oldPath)) return 'ppt/media/mrg' + (++ctr.media) + (ext ? '.' + ext : '');
    if (/^ppt\/notesSlides\//.test(oldPath)) return 'ppt/notesSlides/notesSlideMrg' + (++ctr.misc) + '.xml';
    if (/^ppt\/notesMasters\//.test(oldPath)) return 'ppt/notesMasters/notesMasterMrg' + (++ctr.misc) + '.xml';
    if (/^ppt\/charts\//.test(oldPath)) {
      ctr.misc++;
      return 'ppt/charts/' + basename(oldPath).replace(/\.[^.]+$/, '') + 'Mrg' + ctr.misc + (ext ? '.' + ext : '');
    }
    if (/^ppt\/embeddings\//.test(oldPath)) {
      ctr.misc++;
      return 'ppt/embeddings/' + basename(oldPath).replace(/\.[^.]+$/, '') + 'Mrg' + ctr.misc + (ext ? '.' + ext : '');
    }
    // generic fallback: keep folder, suffix the name uniquely.
    ctr.misc++;
    const dir = dirname(oldPath);
    const base = basename(oldPath).replace(/\.[^.]+$/, '');
    return (dir ? dir + '/' : '') + base + 'Mrg' + ctr.misc + (ext ? '.' + ext : '');
  }

  // Relationship types whose targets we deliberately DROP (keeps the merge
  // self-contained without dragging notes/masters that need their own chain,
  // and without keeping external OLE/package links that PowerPoint refuses
  // to validate when their SharePoint target is unreachable from the user).
  const DROP_TYPES = [/relationships\/notesSlide$/];
  const DROP_EXTERNAL_TYPES = [
    /relationships\/oleObject$/,
    /relationships\/package$/,
    /relationships\/audio$/,
    /relationships\/video$/,
    /relationships\/externalData$/,
  ];

  async function copyExternalDeck(extZip, baseZip, ctr, baseCT, extCT) {
    // Memo: external part path → new base path.
    const renamed = {};
    // Parts that are XML and need a [Content_Types] Override.
    const newOverrides = []; // {partName, contentType}
    const newSlideTargets = []; // new slide part paths, in import order
    const newMasterTargets = []; // new master part paths

    // Recursively copy a part and (via its rels) everything it references.
    async function copyPart(oldPath) {
      if (renamed[oldPath]) return renamed[oldPath];
      if (!extZip.file(oldPath)) return null; // missing part, skip
      const newPath = newPathFor(oldPath, ctr);
      renamed[oldPath] = newPath;

      const isXml = /\.(xml|rels)$/i.test(oldPath);
      // Track type buckets for later registration.
      if (/^ppt\/slides\/slide\d+\.xml$/.test(newPath)) newSlideTargets.push(newPath);
      if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(newPath)) newMasterTargets.push(newPath);

      // Register content type (Override for xml parts; Default for media ext).
      if (isXml) {
        const ct = extCT.overrides['/' + oldPath];
        if (ct) newOverrides.push({ partName: '/' + newPath, contentType: ct });
      } else {
        const ex = extname(oldPath);
        if (ex && !baseCT.defaults[ex] && extCT.defaults[ex]) {
          baseCT.defaults[ex] = extCT.defaults[ex];
        }
      }

      // Handle this part's relationships (if any), copying targets & rewriting.
      const relsPath = relsPathFor(oldPath);
      let newRelsXml = null;
      const droppedRids = []; // rIds removed from this part's rels
      if (extZip.file(relsPath)) {
        const relsXml = await extZip.file(relsPath).async('string');
        const rels = parseRels(relsXml);
        const rewritten = [];
        for (const r of rels) {
          if (r.mode === 'External') {
            // External SharePoint/HTTP links to OLE objects, packages, audio
            // and video make PowerPoint refuse to open the file if it cannot
            // resolve them (auth, network, deleted source). Drop them — the
            // slide still renders fine without the live data link.
            if (DROP_EXTERNAL_TYPES.some((re) => re.test(r.type || ''))) {
              droppedRids.push(r.id);
              continue;
            }
            rewritten.push(r);
            continue;
          }
          if (DROP_TYPES.some((re) => re.test(r.type || ''))) { droppedRids.push(r.id); continue; }
          const absOld = resolvePath(dirname(oldPath), r.target);
          const copiedNew = await copyPart(absOld);
          if (!copiedNew) { droppedRids.push(r.id); continue; }
          rewritten.push({ id: r.id, type: r.type, target: relPath(dirname(newPath), copiedNew) });
        }
        newRelsXml = buildRelsXml(rewritten);
      }

      // Write the part itself (binary for media, string for xml).
      if (isXml) {
        let content = await extZip.file(oldPath).async('string');
        // Strip in-body references to any rIds we dropped. Without this,
        // PowerPoint chokes on dangling r:id="rIdX" pointers (e.g. a chart's
        // <c:externalData r:id="rId3"/> after we removed its external OLE
        // rel). Targets:
        //   - <c:externalData r:id="…"/>  (chart external data refresh)
        //   - <p:oleObj r:id="…">…</p:oleObj> (slide-level embedded objects)
        if (droppedRids.length) {
          for (const rid of droppedRids) {
            const ridEsc = rid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            content = content.replace(
              new RegExp('<c:externalData\\b[^>]*?r:id="' + ridEsc + '"[^>]*?(?:/>|>[\\s\\S]*?</c:externalData>)', 'g'),
              ''
            );
            content = content.replace(
              new RegExp('<p:oleObj\\b[^>]*?r:id="' + ridEsc + '"[^>]*?(?:/>|>[\\s\\S]*?</p:oleObj>)', 'g'),
              ''
            );
          }
        }
        baseZip.file(newPath, content);
      } else {
        const content = await extZip.file(oldPath).async('uint8array');
        baseZip.file(newPath, content);
      }
      if (newRelsXml !== null) {
        baseZip.file(relsPathFor(newPath), newRelsXml);
      }
      return newPath;
    }

    // Enumerate the external slides in presentation order.
    const extPres = await extZip.file('ppt/presentation.xml').async('string');
    const extPresRels = parseRels(await extZip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const relById = {};
    extPresRels.forEach((r) => { relById[r.id] = r; });
    const slideOrder = [];
    const reS = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
    let m;
    while ((m = reS.exec(extPres))) {
      const rel = relById[m[1]];
      if (rel) slideOrder.push(resolvePath('ppt', rel.target));
    }

    // Copy each slide (pulls its layout→master→theme→media chain along).
    for (const slidePath of slideOrder) {
      await copyPart(slidePath);
    }

    return {
      // slide part paths in the same order the user's deck presented them
      slidePaths: slideOrder.map((p) => renamed[p]).filter(Boolean),
      masterPaths: newMasterTargets,
      overrides: newOverrides,
    };
  }

  function buildRelsXml(rels) {
    const items = rels.map((r) =>
      `<Relationship Id="${escAttr(r.id)}" Type="${escAttr(r.type)}" Target="${escAttr(r.target)}"` +
      (r.mode === 'External' ? ' TargetMode="External"' : '') + '/>'
    ).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      items + '</Relationships>';
  }

  async function mergeExternalSlides(baseBlob, inserts) {
    const JSZip = window.JSZip;
    if (!JSZip) throw new Error('JSZip non chargé');
    const valid = (inserts || []).filter((it) => it && it.buffer);
    // Note: we no longer early-return when there are no imports — every deck
    // still needs the [Content_Types].xml sanitisation pass below (pptxgenjs
    // 3.12 emits phantom slideMaster Overrides that crash PowerPoint).

    const baseZip = await JSZip.loadAsync(baseBlob);

    let contentTypes = await baseZip.file('[Content_Types].xml').async('string');
    let presentation = await baseZip.file('ppt/presentation.xml').async('string');
    let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string');
    const baseCT = parseContentTypes(contentTypes);

    const ctr = {
      slide: maxIndexIn(baseZip, /^ppt\/slides\/slide(\d+)\.xml$/),
      layout: maxIndexIn(baseZip, /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/),
      master: maxIndexIn(baseZip, /^ppt\/slideMasters\/slideMaster(\d+)\.xml$/),
      theme: maxIndexIn(baseZip, /^ppt\/theme\/theme(\d+)\.xml$/),
      media: maxIndexIn(baseZip, /^ppt\/media\/\D*(\d+)\.[^.]+$/),
      misc: 0,
    };

    // Next free presentation rIds and sld/master ids.
    const presRels = parseRels(presRelsXml);
    let maxRid = 0;
    presRels.forEach((r) => { const n = parseInt((r.id || '').replace(/\D/g, ''), 10); if (n) maxRid = Math.max(maxRid, n); });
    let maxSldId = 255;
    let mm;
    const reSld = /<p:sldId\b[^>]*\bid="(\d+)"/g;
    while ((mm = reSld.exec(presentation))) maxSldId = Math.max(maxSldId, parseInt(mm[1], 10));
    let maxMasterId = 2147483647;
    const reMid = /<p:sldMasterId\b[^>]*\bid="(\d+)"/g;
    while ((mm = reMid.exec(presentation))) maxMasterId = Math.max(maxMasterId, parseInt(mm[1], 10));

    const allNewPresRels = [];   // {id, type, target}
    const newMasterEntries = []; // {id, rid} for sldMasterIdLst
    // Map base "after" position → list of new slide rIds to insert after it.
    const insertsByPos = []; // {after, rids:[...]}

    for (const ins of valid) {
      const extZip = await JSZip.loadAsync(ins.buffer);
      const extCT = parseContentTypes(await extZip.file('[Content_Types].xml').async('string'));
      const res = await copyExternalDeck(extZip, baseZip, ctr, baseCT, extCT);

      // Register content-type Overrides for all copied xml parts.
      for (const ov of res.overrides) {
        if (contentTypes.indexOf('PartName="' + ov.partName + '"') < 0) {
          contentTypes = contentTypes.replace('</Types>',
            `<Override PartName="${escAttr(ov.partName)}" ContentType="${escAttr(ov.contentType)}"/></Types>`);
        }
      }

      // Register new masters in presentation.xml.rels + sldMasterIdLst.
      for (const mp of res.masterPaths) {
        const rid = 'rId' + (++maxRid);
        allNewPresRels.push({ id: rid, type: REL_NS + '/slideMaster', target: relPath('ppt', mp) });
        newMasterEntries.push({ id: ++maxMasterId, rid });
      }

      // Register new slides in presentation.xml.rels and queue their sldIds.
      const rids = [];
      for (const sp of res.slidePaths) {
        const rid = 'rId' + (++maxRid);
        allNewPresRels.push({ id: rid, type: REL_NS + '/slide', target: relPath('ppt', sp) });
        rids.push(rid);
      }
      insertsByPos.push({ after: ins.after, rids });
    }

    // Add any new media Default extensions discovered.
    for (const ex of Object.keys(baseCT.defaults)) {
      if (contentTypes.indexOf('Extension="' + ex + '"') < 0) {
        contentTypes = contentTypes.replace('</Types>',
          `<Default Extension="${escAttr(ex)}" ContentType="${escAttr(baseCT.defaults[ex])}"/></Types>`);
      }
    }

    // Append new relationships to presentation.xml.rels.
    if (allNewPresRels.length) {
      const relsStr = allNewPresRels.map((r) =>
        `<Relationship Id="${r.id}" Type="${escAttr(r.type)}" Target="${escAttr(r.target)}"/>`).join('');
      presRelsXml = presRelsXml.replace('</Relationships>', relsStr + '</Relationships>');
    }

    // Insert sldMasterId entries into sldMasterIdLst (create the list if absent).
    if (newMasterEntries.length) {
      const masterStr = newMasterEntries.map((e) =>
        `<p:sldMasterId id="${e.id}" r:id="${e.rid}"/>`).join('');
      if (/<p:sldMasterIdLst[ >]/.test(presentation)) {
        presentation = presentation.replace(/<\/p:sldMasterIdLst>/, masterStr + '</p:sldMasterIdLst>');
      } else {
        // place right before sldIdLst
        presentation = presentation.replace(/<p:sldIdLst/, '<p:sldMasterIdLst>' + masterStr + '</p:sldMasterIdLst><p:sldIdLst');
      }
    }

    // Insert sldId entries into sldIdLst at the requested positions.
    // Build the list of existing sldId elements, then splice.
    const sldLstMatch = presentation.match(/<p:sldIdLst[^>]*>([\s\S]*?)<\/p:sldIdLst>/);
    if (!sldLstMatch) throw new Error('sldIdLst introuvable dans presentation.xml');
    const existing = [];
    const reExist = /<p:sldId\b[^>]*\/>/g;
    let em;
    while ((em = reExist.exec(sldLstMatch[1]))) existing.push(em[0]);

    // Process inserts from the highest "after" to the lowest so indices remain valid.
    const ordered = insertsByPos.slice().sort((a, b) => b.after - a.after);
    for (const ins of ordered) {
      const newEls = ins.rids.map((rid) => `<p:sldId id="${++maxSldId}" r:id="${rid}"/>`);
      const at = Math.min(Math.max(ins.after, 0), existing.length);
      existing.splice(at, 0, ...newEls);
    }
    const newLst = '<p:sldIdLst>' + existing.join('') + '</p:sldIdLst>';
    presentation = presentation.replace(/<p:sldIdLst[^>]*>[\s\S]*?<\/p:sldIdLst>/, newLst);

    // ── Strip phantom [Content_Types] Overrides ──────────────────────────────
    // pptxgenjs 3.12 emits one <Override PartName="/ppt/slideMasters/slideMaster
    // N.xml"/> per slide while only ever writing slideMaster1.xml. PowerPoint
    // refuses to open a package whose Content_Types declares a part that is not
    // present ("PowerPoint ne peut pas lire …"), whereas JSZip / LibreOffice /
    // python-pptx silently ignore it. Drop every Override whose PartName has no
    // matching entry in the package.
    const presentParts = new Set();
    baseZip.forEach((p) => { presentParts.add('/' + p.replace(/\/+$/, '')); });
    contentTypes = contentTypes.replace(/<Override\b[^>]*?\/>/g, (tag) => {
      const pn = (tag.match(/\bPartName="([^"]*)"/) || [])[1];
      return (pn && !presentParts.has(pn)) ? '' : tag;
    });

    // Write back the mutated core parts.
    baseZip.file('[Content_Types].xml', contentTypes);
    baseZip.file('ppt/presentation.xml', presentation);
    baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml);

    return baseZip.generateAsync({ type: 'blob', mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  window.PPTXMerge = { mergeExternalSlides };
})();

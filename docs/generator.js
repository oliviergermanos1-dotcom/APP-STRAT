// Comité de Direction – Générateur Étude de Marché AGL
// Reproduit fidèlement les slides du document de référence (33 + DSM enrichi).
// Exposé comme une fonction `generateStudyBuffer({ plan })` → Node Buffer (PPTX).
// CLI : `node lib/pptx/generator.js` écrit le PPTX dans le cwd.

// Browser build: globals via <script>

/**
 * @param {{
 *   plan?: Array<{ key: string, enabled: boolean }>,
 *   study?: {
 *     title?: string,
 *     periodStart?: string,
 *     periodEnd?: string,
 *     datasets?: Array<{ metier: string, datasetType: string, filename: string, rows: unknown[] }>,
 *     n1Runs?: unknown[],
 *   },
 * }} [options]
 */
async function generateStudyBuffer(options = {}) {
const PptxGenJS = window.PptxGenJS;
const BLOCK_SEQUENCE = window.BLOCK_SEQUENCE;
const dataAdapter = window.dataAdapter;
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 33.867 x 19.05 cm = 13.33" x 7.5"

const study = options.study || null;

// Plan de montage filter: replace pptx.addSlide() with a wrapper that
// consults BLOCK_SEQUENCE + the supplied plan. Disabled blocks return a
// no-op slide whose addText/addShape/addTable calls are silently swallowed.
const enabledKeys = options.plan
  ? new Set(options.plan.filter((b) => b.enabled !== false).map((b) => b.key))
  : new Set(BLOCK_SEQUENCE);

let blockIdx = 0;
const noopHandler = {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    return () => undefined;
  },
};
const noopSlide = new Proxy({}, noopHandler);
const originalAddSlide = pptx.addSlide.bind(pptx);
pptx.addSlide = function patchedAddSlide() {
  const key = BLOCK_SEQUENCE[blockIdx];
  blockIdx += 1;
  if (key && !enabledKeys.has(key)) {
    return noopSlide;
  }
  return originalAddSlide();
};

// ─── PALETTE AGL ──────────────────────────────────────────────────────────────
const NAVY   = '0D2243'; // fond bleu marine AGL
const GOLD   = 'C9A84C'; // ligne dorée AGL
const WHITE  = 'FFFFFF';
const GREEN  = '1A7C4F'; // vert foncé AGL
const ORANGE = 'E05A00'; // orange AGL
const BLUE2  = '2563A8'; // bleu secondaire KPI
const LGRAY  = 'F0F2F5'; // fond gris clair des cartes
const DGRAY  = '374151'; // texte corps
const MGRAY  = '6B7280'; // texte secondaire
const LBLUE  = 'EBF0F8'; // fond header tableau
const RED    = 'CC2200'; // alerte rouge
const TEAL   = '0E7490'; // teal pour segments

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const n = (v) => v; // passthrough, valeurs déjà en pouces

// Header commun : fond navy, titre blanc, sous-titre doré
function addHeader(slide, title, subtitle) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 1.1,
    fill: { color: NAVY }, line: { type: 'none' }
  });
  slide.addText(title, {
    x: 0.25, y: 0.05, w: 13, h: 0.55,
    fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri'
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.25, y: 0.6, w: 12.5, h: 0.4,
      fontSize: 12, color: GOLD, italic: true, fontFace: 'Calibri'
    });
  }
}

// Pied de page commun
function addFooter(slide, text) {
  slide.addText(text, {
    x: 0.2, y: 7.2, w: 10, h: 0.25,
    fontSize: 9, color: MGRAY, fontFace: 'Calibri'
  });
  // Logo AGL placeholder (texte)
  slide.addText('AGL', {
    x: 12.5, y: 7.15, w: 0.7, h: 0.3,
    fontSize: 10, bold: true, color: GOLD, fontFace: 'Calibri', align: 'right'
  });
}

// Carte KPI (5 KPIs sur une ligne)
function addKpiBar(slide, kpis, y = 1.2) {
  const W = 13.33;
  const cardW = (W - 0.3) / kpis.length;
  kpis.forEach((k, i) => {
    const x = 0.15 + i * cardW;
    slide.addShape(pptx.ShapeType.rect, {
      x, y, w: cardW - 0.1, h: 0.95,
      fill: { color: LGRAY }, line: { color: 'D1D5DB', width: 0.5 }
    });
    slide.addText(k.label.toUpperCase(), {
      x, y: y + 0.05, w: cardW - 0.1, h: 0.22,
      fontSize: 8, color: MGRAY, align: 'center', fontFace: 'Calibri'
    });
    slide.addText(k.value, {
      x, y: y + 0.24, w: cardW - 0.1, h: 0.42,
      fontSize: k.big ? 26 : 22, bold: true, color: k.color || NAVY,
      align: 'center', fontFace: 'Calibri'
    });
    if (k.sub) {
      slide.addText(k.sub, {
        x, y: y + 0.68, w: cardW - 0.1, h: 0.22,
        fontSize: 8.5, color: MGRAY, align: 'center', fontFace: 'Calibri'
      });
    }
  });
}

// Tableau classement transitaires
// firstColMode:
//   'rank' (default) → narrow 0.45" first column for "#1/#2" labels
//   'wide'           → equal distribution (when first column is a long label)
function addRankTable(slide, x, y, w, headers, rows, highlightRow = 0, firstColMode) {
  const rowH = 0.28;
  // Auto-detect: if header[0] starts with "Rang"/"#"/"N°"/"Num" → rank mode
  const auto = /^(rang|#|n[°o]\b|num)/i.test(String(headers[0] || '').trim());
  const mode = firstColMode || (auto ? 'rank' : 'wide');
  const colW = mode === 'rank'
    ? [0.45, ...headers.slice(1).map(() => (w - 0.45) / (headers.length - 1))]
    : headers.map(() => w / headers.length);
  const nameColIdx = mode === 'rank' ? 1 : 0;

  // Header tableau
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h: rowH,
    fill: { color: NAVY }, line: { type: 'none' }
  });
  let cx = x;
  headers.forEach((h, i) => {
    slide.addText(h, {
      x: cx + 0.04, y: y + 0.04, w: colW[i] - 0.05, h: rowH - 0.06,
      fontSize: 8.5, bold: true, color: WHITE, fontFace: 'Calibri',
      align: i === nameColIdx ? 'left' : 'center',
      valign: 'middle',
      wrap: false,
    });
    cx += colW[i];
  });

  // Lignes
  rows.forEach((row, ri) => {
    const ry = y + (ri + 1) * rowH;
    const isHL = ri === highlightRow;
    slide.addShape(pptx.ShapeType.rect, {
      x, y: ry, w, h: rowH,
      fill: { color: isHL ? 'FFF9EC' : (ri % 2 === 0 ? WHITE : 'F8F9FA') },
      line: { color: 'E5E7EB', width: 0.3 }
    });
    let cx2 = x;
    row.forEach((cell, ci) => {
      const isAGL = ri === 0 && ci === nameColIdx;
      slide.addText(String(cell), {
        x: cx2 + 0.04, y: ry + 0.04, w: colW[ci] - 0.05, h: rowH - 0.06,
        fontSize: 8.5,
        bold: isHL && (ci === nameColIdx || ci === (mode === 'rank' ? 0 : nameColIdx)),
        color: isAGL ? GREEN : (isHL && ci === row.length - 1 ? GREEN : DGRAY),
        fontFace: 'Calibri',
        align: ci === nameColIdx ? 'left' : 'center',
        valign: 'middle',
        wrap: false,
      });
      cx2 += colW[ci];
    });
  });
}

// Barres horizontales PDM segment
function addSegmentBars(slide, x, y, segments) {
  // Couleurs cycliques pour les barres
  const BAR_COLORS = [GREEN, GREEN, BLUE2, ORANGE, ORANGE, ORANGE, TEAL, TEAL, RED, RED, RED];
  const maxPdm = Math.max(...segments.map(s => s.pdm));
  const maxBarW = 3.0;
  const rowH = 0.42;

  segments.forEach((seg, i) => {
    const ry = y + i * rowH;
    const barW = Math.max(0.06, (seg.pdm / 100) * maxBarW);
    const barColor = seg.pdm >= 50 ? GREEN : seg.pdm >= 20 ? BLUE2 : seg.pdm >= 10 ? ORANGE : RED;

    slide.addText(seg.label.toUpperCase(), {
      x, y: ry, w: 1.8, h: 0.28,
      fontSize: 8.5, color: DGRAY, fontFace: 'Calibri'
    });
    slide.addText(seg.vol, {
      x: x + 1.82, y: ry, w: 0.9, h: 0.28,
      fontSize: 8.5, color: MGRAY, align: 'right', fontFace: 'Calibri'
    });
    // Barre fond
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 2.8, y: ry + 0.04, w: maxBarW, h: 0.18,
      fill: { color: 'E5E7EB' }, line: { type: 'none' }
    });
    // Barre valeur
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 2.8, y: ry + 0.04, w: barW, h: 0.18,
      fill: { color: barColor }, line: { type: 'none' }
    });
    slide.addText(`${seg.pdm}%`, {
      x: x + 2.8 + maxBarW + 0.05, y: ry, w: 0.4, h: 0.28,
      fontSize: 9, bold: true, color: barColor, fontFace: 'Calibri'
    });
  });
}

// Boîte insight/alerte
function addInsightBox(slide, x, y, w, h, emoji, lines, bgColor = 'FFFBEC') {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: bgColor }, line: { color: 'E5C97A', width: 0.5 }
  });
  const text = `${emoji}  ${lines.join('\n')}`;
  slide.addText(text, {
    x: x + 0.1, y: y + 0.08, w: w - 0.2, h: h - 0.12,
    fontSize: 9, color: DGRAY, fontFace: 'Calibri', wrap: true
  });
}

// Barres PDM mensuelle (droite)
function addMensuelBars(slide, x, y, mois, valeurs, seuil = 7.5) {
  const rowH = 0.58;
  const maxBarW = 2.8;
  // Sanitize input → numeric, rounded to 1 decimal, French formatted
  const cleanVals = valeurs.map((v) => {
    const n = Number(v) || 0;
    return Math.round(n * 10) / 10;
  });
  const maxVal = Math.max(...cleanVals, 0.0001);
  mois.forEach((m, i) => {
    const ry = y + i * rowH;
    const v = cleanVals[i];
    const bw = Math.max(0.02, (v / maxVal) * maxBarW);
    const bc = v >= seuil ? GREEN : ORANGE;

    slide.addShape(pptx.ShapeType.rect, {
      x, y: ry, w: 6.0, h: rowH - 0.06,
      fill: { color: 'F8FAFC' }, line: { color: 'E5E7EB', width: 0.3 }
    });
    slide.addText(String(m).slice(0, 8), {
      x: x + 0.12, y: ry + 0.14, w: 0.85, h: 0.3,
      fontSize: 11, color: DGRAY, fontFace: 'Calibri', wrap: false
    });
    // fond barre
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 1.05, y: ry + 0.14, w: maxBarW, h: 0.22,
      fill: { color: 'D1D5DB' }, line: { type: 'none' }
    });
    // barre valeur
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 1.05, y: ry + 0.14, w: bw, h: 0.22,
      fill: { color: bc }, line: { type: 'none' }
    });
    // label valeur — wider cell + comma decimal + non-wrap
    const labelText = v.toFixed(1).replace('.', ',') + ' %';
    slide.addText(labelText, {
      x: x + 1.05 + maxBarW + 0.08, y: ry + 0.1, w: 0.95, h: 0.3,
      fontSize: 11, bold: true, color: bc, fontFace: 'Calibri',
      align: 'left', valign: 'middle', wrap: false
    });
  });
}

// Graphique barres groupées (marché + AGL) simplifié
function addBarChart(slide, x, y, w, h, data, colors) {
  // Ensure labels are in each series
  const fixedData = data.map(series => ({...series}));
  slide.addChart(pptx.ChartType.bar, fixedData, {
    x, y, w, h,
    barDir: 'col',
    barGrouping: 'clustered',
    chartColors: colors || [NAVY, GOLD],
    showLegend: true,
    legendPos: 'b',
    showValue: false,
    valAxisLabelFontSize: 8,
    catAxisLabelFontSize: 8,
    dataLabelFontSize: 7,
    showValAxisTitle: false,
    valAxisMinVal: 0,
    legendFontSize: 9,
  });
}

// ─── SLIDE 1 – COUVERTURE ────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  // Fond navy plein
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 7.5,
    fill: { color: NAVY }, line: { type: 'none' }
  });
  // Bande dorée horizontale
  s.addShape(pptx.ShapeType.rect, {
    x: 0.35, y: 3.55, w: 8.5, h: 0.06,
    fill: { color: GOLD }, line: { type: 'none' }
  });
  // AGL logo texte
  s.addText('AGL', { x: 0.35, y: 0.3, w: 2, h: 0.6, fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri' });
  s.addText('AFRICA GLOBAL LOGISTICS', { x: 0.35, y: 0.88, w: 4, h: 0.25, fontSize: 8, color: WHITE, fontFace: 'Calibri', charSpacing: 1 });

  s.addText('Revue Stratégique &\nMarketing', {
    x: 0.35, y: 1.5, w: 8, h: 1.8,
    fontSize: 44, bold: true, color: WHITE, fontFace: 'Calibri'
  });
  s.addText('Reporting 2026', {
    x: 0.35, y: 3.75, w: 6, h: 0.65,
    fontSize: 24, bold: true, color: GOLD, fontFace: 'Calibri'
  });
  s.addText('At the heart\nof Africa\'s\ntransformation', {
    x: 0.35, y: 4.65, w: 4.5, h: 1.2,
    fontSize: 16, bold: true, color: WHITE, fontFace: 'Calibri'
  });
  s.addText('Direction Marketing & RP  |  AGL Abidjan  |  Juin 2026', {
    x: 3, y: 7.15, w: 7, h: 0.28,
    fontSize: 9.5, color: MGRAY, align: 'center', fontFace: 'Calibri'
  });
  s.addText('2026', {
    x: 12.0, y: 7.1, w: 1.2, h: 0.35,
    fontSize: 18, bold: true, color: WHITE, align: 'right', fontFace: 'Calibri'
  });
}

// ─── SLIDE 2 – SOMMAIRE ──────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'SOMMAIRE', 'Analyse par métier – 5 segments + synthèse stratégique');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026    p.2');

  const cards = [
    { num: '01', color: NAVY,   title: 'TIM – Transit Import Maritime',   desc: 'Leader #1 – PDM 7,8% sur 193 989 TEU qualifiés' },
    { num: '02', color: GREEN,  title: 'TEM – Transit Export Maritime',   desc: 'Dominance absolue – 26,2% PDM sur 137 283 TEU' },
    { num: '03', color: ORANGE, title: 'Hinterland Import Maritime',       desc: '#3 → objectif #2 : 11,3% PDM sur 28 457 TEU' },
    { num: '04', color: BLUE2,  title: 'Hinterland Export Maritime',       desc: 'Leader #1 – 66,1% PDM  |  Bamako–Ouagadougou' },
    { num: '05', color: TEAL,   title: 'Aérien Import',                   desc: '#1 ABSOLU – 20,8% PDM  |  Croissance forte Jan→Mai' },
    { num: '06', color: '8B6914', title: 'Synthèses',                     desc: '' },
  ];
  const cW = 4.2, cH = 2.0;
  cards.forEach((c, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    const x = 0.2 + col * (cW + 0.15);
    const y = 1.25 + row * (cH + 0.1);
    s.addShape(pptx.ShapeType.rect, {
      x, y, w: cW, h: cH,
      fill: { color: 'F0F2F5' }, line: { color: 'DDE0E4', width: 0.5 }
    });
    // badge numéro
    s.addShape(pptx.ShapeType.rect, {
      x: x + 0.12, y: y + 0.15, w: 0.55, h: 0.55,
      fill: { color: c.color }, line: { type: 'none' }
    });
    s.addText(c.num, {
      x: x + 0.12, y: y + 0.15, w: 0.55, h: 0.55,
      fontSize: 15, bold: true, color: WHITE, align: 'center', valign: 'middle', fontFace: 'Calibri'
    });
    s.addText(c.title, {
      x: x + 0.12, y: y + 0.82, w: cW - 0.25, h: 0.45,
      fontSize: 12, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    s.addText(c.desc, {
      x: x + 0.12, y: y + 1.28, w: cW - 0.25, h: 0.55,
      fontSize: 10, color: MGRAY, fontFace: 'Calibri'
    });
  });
}

// ─── HELPER : SLIDE SÉPARATEUR ───────────────────────────────────────────────
function addSeparator(num, title, subtitle) {
  const s = pptx.addSlide();
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 7.5,
    fill: { color: NAVY }, line: { type: 'none' }
  });
  // Numéro géant en filigrane
  s.addText(num, {
    x: 3.5, y: 0.5, w: 6, h: 4,
    fontSize: 200, bold: true, color: '1A2E4A',
    align: 'center', fontFace: 'Calibri'
  });
  // Trait doré sous le titre
  s.addShape(pptx.ShapeType.rect, {
    x: 1.2, y: 3.85, w: 8.2, h: 0.065,
    fill: { color: GOLD }, line: { type: 'none' }
  });
  s.addText(title, {
    x: 0.4, y: 2.9, w: 12.5, h: 1.0,
    fontSize: 38, bold: true, color: WHITE,
    align: 'center', fontFace: 'Calibri'
  });
  s.addText(subtitle, {
    x: 0.4, y: 4.0, w: 12.5, h: 0.5,
    fontSize: 16, italic: true, color: GOLD,
    align: 'center', fontFace: 'Calibri'
  });
  s.addText('Africa Global Logistics – Étude de Marché Jan–Mai 2026', {
    x: 2, y: 7.1, w: 9, h: 0.28,
    fontSize: 9, color: MGRAY, align: 'center', fontFace: 'Calibri'
  });
  s.addText('AGL', { x: 12.5, y: 7.08, w: 0.7, h: 0.32, fontSize: 10, bold: true, color: GOLD, align: 'right', fontFace: 'Calibri' });
  return s;
}

// ─── SLIDES 3 – SÉPARATEUR TIM ───────────────────────────────────────────────
addSeparator('01', 'TRANSIT IMPORT MARITIME (TIM)', '193 989 TEU qualifiés  |  PDM AGL : 7,8%  |  Leader #1');

// ─── SLIDE 4 – TIM VUE D'ENSEMBLE ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildTimOverviewData(study);
  const periodLabel = study?.periodStart && study?.periodEnd
    ? `${study.periodStart} → ${study.periodEnd}`
    : 'Jan–Mai 2026';
  const headerSub = live
    ? `Marché qualifié : ${live.kpis.marche} TEU  |  AGL : ${live.kpis.agl} TEU  |  PDM AGL : ${live.kpis.pdm} ${live.aglRank ? `(Rang #${live.aglRank})` : ''}`
    : 'Marché qualifié : 193 989 TEU  |  AGL : 15 133 TEU  |  PDM AGL : 7,8% (Leader #1)';
  addHeader(s, `TIM – VUE D'ENSEMBLE  |  ${periodLabel}`, headerSub);
  addFooter(s, `Africa Global Logistics – Étude de Marché ${periodLabel}  |  p.4`);

  if (live) {
    const ecartColor = live.ecart >= 0 ? GREEN : RED;
    const ecartLabel = live.secondName ? `Écart vs #2 ${live.secondName.slice(0, 18)}` : 'Écart vs #2';
    addKpiBar(s, [
      { label: 'Marché qualifié', value: live.kpis.marche, sub: `TEU ${periodLabel}` },
      { label: 'Volume AGL',      value: live.kpis.agl,    sub: `TEU ${periodLabel}` },
      { label: 'PDM AGL',         value: live.kpis.pdm,    sub: live.aglRank === 1 ? '#1 – Leader' : `Rang #${live.aglRank || '—'}`, color: GREEN, big: true },
      { label: ecartLabel,        value: live.kpis.ecart,  sub: 'TEU d\'écart', color: ecartColor },
      { label: 'Cumul PDM TOP 4', value: live.kpis.top4,   sub: 'leaders cumul.', color: BLUE2 },
    ]);
  } else {
    addKpiBar(s, [
      { label: 'Marché qualifié', value: '193 989', sub: 'TEU Jan–Mai 2026' },
      { label: 'Volume AGL',      value: '15 133',  sub: 'TEU Jan–Mai 2026' },
      { label: 'PDM AGL',         value: '7,8 %',   sub: '#1 – Leader', color: GREEN, big: true },
      { label: 'Écart vs #2 STRACOTRANS', value: '+558', sub: 'TEU d\'avance', color: ORANGE },
      { label: 'Cumul PDM TOP 4', value: '29,1 %',  sub: 'AGL+STRAC+TGR+GTC', color: BLUE2 },
    ]);
  }

  // Graphique barres – marché & AGL
  const chartData = live && live.monthlyMarket
    ? [
        { name: 'Marché qualifié', labels: live.monthLabels, values: live.monthlyMarket },
        { name: 'AGL',             labels: live.monthLabels, values: live.monthlyAgl },
      ]
    : [
        { name: 'Marché qualifié', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [41800,36800,43600,38500,33200] },
        { name: 'AGL',             labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [3470,2544,3270,3278,2571] },
      ];
  s.addText('Évolution mensuelle marché TIM & AGL (TEU)', {
    x: 0.25, y: 2.28, w: 6.5, h: 0.28,
    fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addBarChart(s, 0.15, 2.55, 6.8, 4.3, chartData, [NAVY, GOLD]);

  // Barres PDM mensuelle
  s.addText('PDM AGL par mois – TIM', {
    x: 7.1, y: 2.28, w: 5.8, h: 0.28,
    fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const pdmLabels = live && live.monthLabels
    ? live.monthLabels.map((l, i) => dataAdapter.MONTHS_FR_FULL.find((m) => m.startsWith(l)) || l)
    : ['Janvier','Février','Mars','Avril','Mai'];
  const pdmValues = live && live.monthlyPdm ? live.monthlyPdm : [8.3, 6.9, 7.5, 8.5, 7.8];
  addMensuelBars(s, 7.1, 2.62, pdmLabels, pdmValues, live ? live.aglPdm : 7.5);

  const insightText = live
    ? `Données live (${live.source}). PDM AGL : ${live.kpis.pdm}${live.aglRank ? ` — rang #${live.aglRank}` : ''}. ${live.secondName && live.aglRank === 1 ? `Avance sur ${live.secondName} : ${live.kpis.ecart} TEU.` : ''} Cumul TOP 4 = ${live.kpis.top4} du marché.`
    : 'PDM réelle (qualifiée) : 7,8% vs 7,3% brut. L\'exclusion du Non Apuré révèle la vraie position AGL. Avance sur STRACOTRANS : seulement +558 TEU — position à consolider en urgence.';
  addInsightBox(s, 7.1, 5.7, 6.0, 0.75, '✓', [insightText], 'F0FDF4');
}

// ─── SLIDE 5 – TIM ANALYSE CONCURRENTIELLE ───────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildTimConcurrentsData(study);
  addHeader(s, 'TIM – ANALYSE CONCURRENTIELLE & SEGMENTS',
    live ? `Classement live (${live.source})  |  Top marchandises AGL  |  Opportunités`
         : 'Classement PDM qualifié  |  Top marchandises AGL  |  Opportunités');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.5');

  s.addText(live
    ? 'Classement Transitaires – TIM (données uploadées)'
    : 'Classement Transitaires – TIM (hors Non Apuré, SIR CI, SMB)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const concurrentsRows = live ? live.rows : [
    ['#1','AFRICA GLOBAL LOGISTICS','15 133','7,8 %'],
    ['#2','STRACOTRANS CI','14 575','7,5 %'],
    ['#3','TGR (Transit Général Rapide)','13 663','7,0 %'],
    ['#4','GENERAL TRANSIT CI','12 028','6,2 %'],
    ['#5','DJAM DKS TRANSIT','10 862','5,6 %'],
    ['#6','GLOBAL MANUTENTION CI','10 203','5,3 %'],
    ['#7','PROFESIONNEL TRANSIT','9 479','4,9 %'],
    ['#8','AG TRANSIT CI','6 137','3,2 %'],
    ['#9','SDMA','5 680','2,9 %'],
    ['#10','SAS TRANSIT','5 274','2,7 %'],
  ];
  const aglHighlight = live && live.aglRowIdx >= 0 && live.aglRowIdx < 10 ? live.aglRowIdx : 0;
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Rang','Transitaire','TEU','PDM'], concurrentsRows, aglHighlight);

  addInsightBox(s, 0.15, 5.45, 6.8, 0.75, '💡',
    [live
      ? `INSIGHT TIM (live) : AGL ${live.aglRowIdx === 0 ? 'leader' : `#${live.aglRowIdx + 1}`}. Données : ${live.source}.`
      : 'INSIGHT TIM : Leader de justesse (+558 TEU sur STRACOTRANS). Forces : Mat. Miniers (74% PDM), Médicaments (50%), PVC (32%).']
  );

  s.addText('PDM AGL par segment – TIM', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const segmentBars = live && live.segmentBars ? live.segmentBars : [
    { label: 'Matériels Miniers',    vol: '2 231 TEU', pdm: 74 },
    { label: 'Médicaments',          vol: '1 936 TEU', pdm: 50 },
    { label: 'PVC Résine',           vol: '2 881 TEU', pdm: 32 },
    { label: 'Matér. Construction',  vol: '5 478 TEU', pdm: 18 },
    { label: 'Papier & Dérivés',     vol: '5 024 TEU', pdm: 15 },
    { label: 'Lait en Poudre',       vol: '1 121 TEU', pdm: 14 },
    { label: 'Emballages',           vol: '8 951 TEU', pdm: 12 },
    { label: 'Machines',             vol: '4 781 TEU', pdm: 11 },
    { label: 'Produits Mer Congelé', vol: '22 915 TEU', pdm: 2 },
    { label: 'Riz',                  vol: '9 586 TEU', pdm: 0 },
    { label: 'Viandes Congelées',    vol: '9 470 TEU', pdm: 2 },
  ];
  addSegmentBars(s, 7.1, 1.52, segmentBars);
}

// ─── SLIDE 6 – TIM CLIENTÈLE ─────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildClienteleData(study, 'TIM');
  addHeader(s, 'TIM – CLIENTÈLE AGL', 'Top 10 destinataires  |  Mix marchandises  |  Risques concentration');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.6');

  s.addText('Top 10 clients AGL – TIM (Destinataires, TEU)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const clienteleRows = live ? live.rows : [
    ['K1 MINING SA CI','1 531','Matériels Miniers','10,1%'],
    ['SITAB CI','876','Cigares/Cigarettes','5,8%'],
    ['SCCI (PVC Compoundage CI)','790','PVC Résine','5,2%'],
    ['ALLIAD CI','687','Polyéthylène','4,5%'],
    ['SOCIFAD','480','Articles Divers','3,2%'],
    ['STE PROD ALIM CONGELÉ CI','418','Prod. Mer Congelé','2,8%'],
    ['SONACO CI','417','Cigarettes','2,8%'],
    ['UBIPHARM CÔTE D\'IVOIRE','399','Médicaments','2,6%'],
    ['SOLIBRA','373','Boissons','2,5%'],
    ['STE TRANSFO INDUS CI','363','Emballages','2,4%'],
  ];
  addRankTable(s, 0.15, 1.5, 7.0,
    ['Client (Destinataire)','TEU','Segment','% Vol. AGL'], clienteleRows);
  addInsightBox(s, 0.15, 5.35, 7.0, 0.95, '⚠',
    live
      ? [`Concentration : ${live.topClient} seul = ${live.topClientShare} du volume AGL TIM. Risque client unique.`,
         `Données live : ${live.source}.`]
      : [
          'Concentration : K1 Mining seul = 10,1% du volume AGL TIM. Risque client unique.',
          '✓ Opportunités cross-sell : SITAB (TIM+AER), UBIPHARM (TIM+AER+HINT IMP), SOLIBRA = clients multi-métiers à développer.'
        ]
  );

  // Graphique camembert simulé par texte structuré
  s.addText('Mix marchandises AGL – TIM', {
    x: 7.3, y: 1.2, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const mixData = live && live.mixLabels && live.mixLabels.length
    ? [{ name: 'Mix', labels: live.mixLabels, values: live.mixValues }]
    : [{
        name: 'Mix',
        labels: ['Mat. Miniers','Emballages','Mat. Construction','Médicaments','PVC Résine','Papier','Cigarettes','Polyéthylène','Autres'],
        values: [16,10,10,10,9,8,7,6,24]
      }];
  s.addChart(pptx.ChartType.pie, mixData, {
    x: 7.3, y: 1.5, w: 5.8, h: 4.5,
    showLegend: true, legendPos: 'r',
    legendFontSize: 8,
    chartColors: [NAVY, GOLD, BLUE2, GREEN, ORANGE, TEAL, RED, '9CA3AF', 'D1D5DB'],
    showPercent: true,
    dataLabelFontSize: 9,
    dataLabelColor: WHITE,
  });
}

// ─── SLIDE 7 – TIM NOUVEAUX ENTRANTS + TENDANCES ─────────────────────────────
// LIVE layout (5 sections, period vs full N-1):
//   Row 1 (3 cols) : Nouveaux transitaires | Nouvelles marchandises | Nouveaux clients AGL
//   Row 2 (2 cols) : Top 3 marchandises plus forte hausse | Top 10 destinataires + PDM AGL
// FALLBACK layout (no upload): preserved byte-identical to the v1 reference.
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildNouveauxFullData(study, 'TIM');
  if (live) {
    addHeader(s, 'TIM – NOUVEAUX ENTRANTS & TENDANCES',
      `Vrais nouveaux entrants (croisés vs toute l'année N-1) · Top hausses & destinataires · ${live.source}`);
  } else {
    addHeader(s, 'TIM – NOUVEAUX ENTRANTS & NOUVEAUX FLUX',
      'Transitaires entrants (rangs 11–15)  |  Nouvelles marchandises captées  |  Nouveaux destinataires');
  }
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.7');

  if (live) {
    // ─── Row 1 : 3 colonnes "nouveaux" ──────────────────────────────────────
    const colW = 4.2, gap = 0.15, x0 = 0.15;
    const x1 = x0;
    const x2 = x0 + colW + gap;
    const x3 = x0 + (colW + gap) * 2;
    const yTitle = 1.18, yTable = 1.45, h1 = 2.05;

    // Col 1 — Nouveaux transitaires
    s.addText('Nouveaux transitaires (absents de tout N-1)', {
      x: x1, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yTable, colW,
      ['Transitaire', 'TEU', 'PDM'],
      live.nouveauxTransitaires);

    // Col 2 — Nouvelles marchandises
    s.addText('Nouvelles marchandises (jamais vues en N-1)', {
      x: x2, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x2, yTable, colW,
      ['Marchandise', 'TEU marché', 'PDM AGL'],
      live.nouveauxMarchandises);

    // Col 3 — Nouveaux clients AGL (avec conquête)
    s.addText('Nouveaux clients AGL — opportunité de conquête', {
      x: x3, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yTable, colW,
      ['Destinataire', 'TEU AGL', 'TEU N-1 (autres)'],
      live.nouveauxClients);

    // ─── Row 2 : 2 colonnes "tendances" ─────────────────────────────────────
    // Compact: top 3 growth + top 7 destinataires to leave room for insight.
    const yRow2 = 3.65;

    // Col gauche — Top 3 marchandises plus forte hausse
    s.addText('Top 3 marchandises — plus forte hausse vs N-1 même période', {
      x: x1, y: yRow2, w: colW + gap + colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yRow2 + 0.27, colW + gap + colW,
      ['Marchandise', 'TEU N', 'TEU N-1', 'Δ', 'Croissance', 'PDM AGL'],
      live.topGrowth.length > 0 ? live.topGrowth : [['—', '—', '—', '—', '—', '—']]);

    // Col droite — Top 5 destinataires (tous transitaires) + PDM AGL
    s.addText('Top 5 destinataires (tous transitaires) — part AGL', {
      x: x3, y: yRow2, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yRow2 + 0.27, colW,
      ['Destinataire', 'TEU marché', 'TEU AGL', 'PDM AGL'],
      live.topDestinataires.slice(0, 5));

    // Bandeau insight — enrichi avec actions data-driven
    const M = live.metrics;
    const insightLines = [];
    // Ligne 1 : volumétrie nouveaux
    insightLines.push(
      `📊 ${M.totalNouveauxTransit} nouveaux transitaires · ${M.totalNouvellesMerch} nouvelles marchandises · ${M.totalNouveauxClients} nouveaux clients AGL (croisés vs toute l'année N-1)`
    );
    // Ligne 2 : top hausse
    if (M.topGrowthName && M.topGrowthDelta > 0) {
      const pdmInfo = M.topGrowthPdmAgl != null
        ? (M.topGrowthPdmAgl < 5
            ? `PDM AGL ${M.topGrowthPdmAgl}% — fort potentiel à capter`
            : `PDM AGL ${M.topGrowthPdmAgl}% — position à consolider`)
        : '';
      insightLines.push(
        `📈 PLUS FORTE HAUSSE : ${M.topGrowthName} (+${M.topGrowthDeltaStr} ${live.unit}${M.topGrowthPct != null ? `, +${M.topGrowthPct}%` : ''}) · ${pdmInfo}`
      );
    }
    // Ligne 3 : conquête prioritaire
    if (M.topConquestName && M.topConquestUpside > 0) {
      insightLines.push(
        `🎯 CONQUÊTE #1 : ${M.topConquestName} — déjà ${M.topConquestAglVolumeStr} ${live.unit} chez AGL, reste ${M.topConquestUpsideStr} ${live.unit} à capter chez la concurrence`
      );
    }
    // Ligne 4 : opportunité non exploitée
    if (M.topUntappedName && M.topUntappedVolume > 0) {
      insightLines.push(
        `⚠ DESTINATAIRE NON CAPTÉ : ${M.topUntappedName} (${M.topUntappedVolumeStr} ${live.unit} marché, AGL ${M.topUntappedPdm}%) — cible commerciale prioritaire`
      );
    }
    addInsightBox(s, 0.15, 5.70, 12.9, 1.40, '💡', insightLines);
  } else {
    // ─── FALLBACK : layout v1 inchangé (byte-identique référence) ──────────
    s.addText('Nouveaux transitaires TIM (rangs 11–15)', {
      x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 1.5, 7.0,
      ['Rang','Transitaire','TEU','PDM','Spécialité'],
      [
        ['#11','ATLANTIQUE TRANSIT CI','3 820','2,0 %','Emball. / Plastiques'],
        ['#12','WESTAFRICA LOG. CI','3 410','1,8 %','Machines'],
        ['#13','IVOIRE TRANSIT RAPID','3 180','1,6 %','Chimie / Pharma'],
        ['#14','CEVA LOGISTICS CI','2 950','1,5 %','Multi-segments'],
        ['#15','SOCOPHAR TRANSIT','2 640','1,4 %','Médicaments'],
      ],
      3
    );
    s.addText('Nouveaux destinataires AGL – TIM (1er flux 2026)', {
      x: 0.25, y: 3.08, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 3.38, 7.0,
      ['Destinataire','TEU','Secteur','Entrée'],
      [
        ['ORANGE CI (équipements)','680','Télécoms','Q1 2026'],
        ['NESTLÉ CI','420','Alim. industriel','Q1 2026'],
        ['FOXTROT INTERNATIONAL','380','Pétrole','Q2 2026'],
        ['AFRICA RE','290','Services','Q2 2026'],
        ['MTN CI','245','Télécoms','Q2 2026'],
      ]
    );

    s.addText('Nouvelles marchandises captées par AGL – TIM', {
      x: 7.3, y: 1.2, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.3, 1.55, [
      { label: 'Télécommunications', vol: '1 240 TEU', pdm: 9 },
      { label: 'Huiles Végétales',   vol: '890 TEU',   pdm: 6 },
      { label: 'Fertilisants',       vol: '650 TEU',   pdm: 4 },
      { label: 'Matér. Électriques', vol: '580 TEU',   pdm: 3 },
    ]);
    addInsightBox(s, 7.3, 4.2, 5.8, 1.0, '⚠',
      ['ALERTE : CEVA Logistics CI (groupe CMA CGM) entre dans le top 15 TIM en quelques mois — déploiement multi-métiers à surveiller en priorité. Télécoms : 9% PDM dès la 1ère année (effet 5G CI).'],
      'FEF2F2'
    );
  }
}

// ─── SLIDE 8 – SÉPARATEUR TEM ────────────────────────────────────────────────
addSeparator('02', 'TRANSIT EXPORT MARITIME (TEM)', '137 283 TEU  |  PDM AGL : 26,2%  |  #1 incontesté, ×4,7 le second');

// ─── SLIDE 9 – TEM VUE D'ENSEMBLE ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildOverviewData(study, 'TEM');
  addHeader(s, 'TEM – VUE D\'ENSEMBLE  |  Jan–Mai 2026',
    live
      ? `Leader absolu – PDM AGL ${live.kpis.pdm}  |  Marché : ${live.kpis.marche} TEU  |  Rang #${live.aglRank || '—'}`
      : 'Leader absolu – PDM AGL 26,2%  |  Marché : 137 283 TEU  |  ×4,7 sur le 2ème');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.8');

  if (live) {
    addKpiBar(s, [
      { label: 'Marché qualifié', value: live.kpis.marche, sub: 'TEU' },
      { label: 'Volume AGL',      value: live.kpis.agl,    sub: 'TEU' },
      { label: 'PDM AGL',         value: live.kpis.pdm,    sub: `Rang #${live.aglRank || '—'}`, color: GREEN, big: true },
      { label: live.secondName ? `Écart vs #2 ${live.secondName.slice(0, 14)}` : 'Écart vs #2', value: live.kpis.ecart, sub: 'TEU d\'écart', color: live.ecart >= 0 ? GREEN : RED },
      { label: 'Cumul PDM TOP 4', value: live.kpis.top4,   sub: 'leaders cumul.', color: BLUE2 },
    ]);
  } else {
    addKpiBar(s, [
      { label: 'Marché qualifié', value: '137 283', sub: 'TEU Jan–Mai' },
      { label: 'Volume AGL',      value: '35 972',  sub: 'TEU Jan–Mai' },
      { label: 'PDM AGL',         value: '26,2 %',  sub: '#1 – Dominance absolue', color: GREEN, big: true },
      { label: 'Écart vs #2 MAERSK', value: '×4,7', sub: '28 242 TEU d\'avance', color: GREEN },
      { label: 'PDM Janv. (PEAK)', value: '30,3 %', sub: 'PDM max de la période', color: BLUE2 },
    ]);
  }

  const chartData = live && live.monthlyMarket
    ? [
        { name: 'Marché qualifié', labels: live.monthLabels, values: live.monthlyMarket },
        { name: 'AGL',             labels: live.monthLabels, values: live.monthlyAgl },
      ]
    : [
        { name: 'Marché qualifié', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [28900,26900,28100,31200,22400] },
        { name: 'AGL',             labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [8766,6778,8093,7895,4518] },
      ];
  s.addText('Évolution mensuelle marché TEM & AGL (TEU)', {
    x: 0.25, y: 2.28, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addBarChart(s, 0.15, 2.55, 6.8, 4.3, chartData, [NAVY, GOLD]);

  s.addText('PDM AGL par mois – TEM', {
    x: 7.1, y: 2.28, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const pdmLabels = live && live.monthLabels
    ? live.monthLabels.map((l) => dataAdapter.MONTHS_FR_FULL.find((m) => m.startsWith(l)) || l)
    : ['Janvier','Février','Mars','Avril','Mai'];
  const pdmValues = live && live.monthlyPdm ? live.monthlyPdm : [30.3, 25.2, 28.8, 25.3, 20.1];
  addMensuelBars(s, 7.1, 2.62, pdmLabels, pdmValues, live ? live.aglPdm : 25.0);
  addInsightBox(s, 7.1, 5.7, 6.0, 0.75, '⚠',
    [live
      ? `Données live (${live.source}). PDM moyenne ${live.kpis.pdm}, rang #${live.aglRank || '—'}.`
      : 'ALERTE MAI : PDM chute à 20,1% (–10,2 pts vs Janvier). Marché en recul de –22% (28 586→22 421 TEU). Causes : fin saison cacao, recul cajou. Plan de relance à activer juin–juillet.'],
    'FEF2F2'
  );
}

// ─── SLIDE 10 – TEM SEGMENTS ─────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildConcurrentsData(study, 'TEM');
  addHeader(s, 'TEM – SEGMENTS & CONCURRENTS',
    'Matières premières agricoles  |  PDM AGL par filière  |  Corridors');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.9');

  s.addText('PDM AGL par filière export – TEM', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const temSegmentBars = live && live.segmentBars ? live.segmentBars : [
    { label: 'Bananes',          vol: 'Mkt: 6 908 TEU',  pdm: 74 },
    { label: 'Dérivés de Cacao', vol: 'Mkt: 11 411 TEU', pdm: 49 },
    { label: 'Cacao',            vol: 'Mkt: 46 407 TEU', pdm: 32 },
    { label: 'Coton',            vol: 'Mkt: 4 179 TEU',  pdm: 29 },
    { label: 'Caoutchouc Usine', vol: 'Mkt: 35 516 TEU', pdm: 18 },
    { label: 'Mangue',           vol: 'Mkt: 3 777 TEU',  pdm: 13 },
    { label: 'Amande de Cajou',  vol: 'Mkt: 2 744 TEU',  pdm: 7 },
    { label: 'Noix de Cajou',    vol: 'Mkt: 13 129 TEU', pdm: 5 },
  ];
  addSegmentBars(s, 0.15, 1.52, temSegmentBars);

  s.addText('Classement concurrentiel – TEM', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const temConcurrentsRows = live ? live.rows : [
    ['#1','AFRICA GLOBAL LOGISTICS','35 972','26,2 %'],
    ['#2','MAERSK LOGISTIC','7 730','5,6 %'],
    ['#3','MANTRA IVOIRE','7 671','5,6 %'],
    ['#4','GLOBAL MANUTENTION CI','5 893','4,3 %'],
    ['#5','OTL','5 760','4,2 %'],
    ['#6','MEDLOG CI','4 921','3,6 %'],
    ['#7','SDMA','4 902','3,6 %'],
    ['#8','PACKING SERVICE INTL','4 411','3,2 %'],
    ['#9','MOVIS TRANSIT CI','4 067','3,0 %'],
    ['#10','GTS CI','4 010','2,9 %'],
  ];
  const temAglHighlight = live && live.aglRowIdx >= 0 && live.aglRowIdx < 10 ? live.aglRowIdx : 0;
  addRankTable(s, 7.0, 1.5, 6.2,
    ['Rang','Transitaire','TEU','PDM'], temConcurrentsRows, temAglHighlight);
  addInsightBox(s, 0.15, 5.4, 12.9, 0.75, '🏆',
    [live
      ? `Position TEM : AGL ${live.aglRowIdx === 0 ? 'leader' : `#${live.aglRowIdx + 1}`}. Données : ${live.source}.`
      : 'POSITION TEM : AGL détient 26,2% du marché qualifié – soit 4,7x le 2ème acteur. Forces : Bananes (74% PDM), Dérivés cacao (49%), Cacao (32%). Levier : Noix de Cajou (13 129 TEU marché, seulement 5,4% PDM AGL) = +860 TEU si PDM portée à 12%.']
  );
}

// ─── SLIDE 11 – TEM CLIENTÈLE ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildClienteleData(study, 'TEM');
  addHeader(s, 'TEM – CLIENTÈLE CHARGEURS AGL',
    'Top 10 chargeurs  |  Répartition filières  |  Risques & opportunités');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.10');

  s.addText('Top 10 chargeurs AGL – TEM (TEU)', {
    x: 0.25, y: 1.2, w: 7.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const temClienteleRows = live ? live.rows : [
    ['CARGILL WEST AFRICA (CACAO)','3 219','Cacao','9,0%'],
    ['JEAN EGLIN (PLANTATION)','2 500','Bananes','6,9%'],
    ['AFRICA SOURCING PRODUCE CI','2 425','Bananes','6,7%'],
    ['CARGILL COCOA SA (DÉRIVÉS)','2 264','Dérivés cacao','6,3%'],
    ['CYRIAN INTERNATIONAL CI','2 191','Bananes','6,1%'],
    ['OLAM COCOA PROCESSING','2 068','Cacao','5,7%'],
    ['KINEDEN COMMODITIES SA CI','1 256','Cacao','3,5%'],
    ['OLAM AGRI RUBBER','1 203','Caoutchouc','3,3%'],
    ['SAPH','1 155','Caoutchouc','3,2%'],
    ['IVOIRE COTON','1 092','Coton','3,0%'],
  ];
  addRankTable(s, 0.15, 1.5, 7.0,
    ['Chargeur','TEU','Filière','% Vol. AGL'], temClienteleRows);
  addInsightBox(s, 0.15, 5.35, 7.0, 1.0, '⚠',
    live
      ? [`Top chargeur : ${live.topClient} = ${live.topClientShare} du volume AGL TEM.`,
         `Données live : ${live.source}.`]
      : [
          'Cargill groupe (Cacao + Dérivés) = 15,3% du volume AGL TEM. Concentration filière cacao à surveiller.',
          '✓ Bananes (74% PDM) : JEAN EGLIN, AFRICA SOURCING, CYRIAN = 3 chargeurs = 23,1% du volume. Fidélisation critique.',
          '▶ Cajou (5,4% PDM, 13 129 TEU marché) : objectif +860 TEU via approche commerciale OUTSPAN CI, STE IVOIRIENNE NOIX.'
        ]
  );

  // Graphique donut filières
  s.addText('Répartition AGL par filière export – TEM', {
    x: 7.3, y: 1.2, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const temPie = live && live.mixLabels && live.mixLabels.length
    ? [{ name: 'Filières TEM', labels: live.mixLabels, values: live.mixValues }]
    : [{
        name: 'Filières TEM',
        labels: ['Cacao','Bananes','Caoutchouc','Dérivés cacao','Coton','Cajou','Autres'],
        values: [36,20,18,13,8,3,2]
      }];
  s.addChart(pptx.ChartType.pie, temPie, {
    x: 7.3, y: 1.5, w: 5.8, h: 4.5,
    showLegend: true, legendPos: 'r', legendFontSize: 9,
    chartColors: [NAVY, GREEN, GOLD, ORANGE, BLUE2, TEAL, MGRAY],
    showPercent: true, dataLabelFontSize: 9, dataLabelColor: WHITE,
  });
}

// ─── SLIDE 12 – TEM NOUVEAUX CHARGEURS + TENDANCES ─────────────────────────
// LIVE layout (5 sections, exactement comme slide 7 mais col 3 = Chargeurs).
// FALLBACK : layout v1 inchangé.
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildNouveauxFullData(study, 'TEM');
  if (live) {
    addHeader(s, 'TEM – NOUVEAUX CHARGEURS & TENDANCES',
      `Vrais nouveaux entrants (croisés vs toute l'année N-1) · Top hausses & chargeurs · ${live.source}`);
  } else {
    addHeader(s, 'TEM – NOUVEAUX CHARGEURS & NOUVELLES FILIÈRES',
      'Chargeurs entrés en 2026  |  Nouvelles filières export AGL  |  Opportunité Cajou');
  }
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.11');

  if (live) {
    // ─── Row 1 : 3 colonnes "nouveaux" ──────────────────────────────────────
    const colW = 4.2, gap = 0.15, x0 = 0.15;
    const x1 = x0;
    const x2 = x0 + colW + gap;
    const x3 = x0 + (colW + gap) * 2;
    const yTitle = 1.18, yTable = 1.45;

    s.addText('Nouveaux transitaires (absents de tout N-1)', {
      x: x1, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yTable, colW,
      ['Transitaire', 'TEU', 'PDM'],
      live.nouveauxTransitaires);

    s.addText('Nouvelles filières / marchandises (jamais vues en N-1)', {
      x: x2, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x2, yTable, colW,
      ['Marchandise', 'TEU marché', 'PDM AGL'],
      live.nouveauxMarchandises);

    s.addText('Nouveaux chargeurs AGL — opportunité de conquête', {
      x: x3, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yTable, colW,
      ['Chargeur', 'TEU AGL', 'TEU N-1 (autres)'],
      live.nouveauxClients);

    // ─── Row 2 : 2 colonnes "tendances" ─────────────────────────────────────
    const yRow2 = 3.65;
    s.addText('Top 3 marchandises — plus forte hausse vs N-1 même période', {
      x: x1, y: yRow2, w: colW + gap + colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yRow2 + 0.27, colW + gap + colW,
      ['Marchandise', 'TEU N', 'TEU N-1', 'Δ', 'Croissance', 'PDM AGL'],
      live.topGrowth.length > 0 ? live.topGrowth : [['—', '—', '—', '—', '—', '—']]);

    s.addText('Top 5 chargeurs (tous transitaires) — part AGL', {
      x: x3, y: yRow2, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yRow2 + 0.27, colW,
      ['Chargeur', 'TEU marché', 'TEU AGL', 'PDM AGL'],
      live.topDestinataires.slice(0, 5));

    // Bandeau insight — enrichi avec actions data-driven
    const M = live.metrics;
    const insightLines = [];
    insightLines.push(
      `📊 ${M.totalNouveauxTransit} nouveaux transitaires · ${M.totalNouvellesMerch} nouvelles marchandises · ${M.totalNouveauxClients} nouveaux chargeurs AGL (croisés vs toute l'année N-1)`
    );
    if (M.topGrowthName && M.topGrowthDelta > 0) {
      const pdmInfo = M.topGrowthPdmAgl != null
        ? (M.topGrowthPdmAgl < 5
            ? `PDM AGL ${M.topGrowthPdmAgl}% — fort potentiel à capter`
            : `PDM AGL ${M.topGrowthPdmAgl}% — position à consolider`)
        : '';
      insightLines.push(
        `📈 PLUS FORTE HAUSSE : ${M.topGrowthName} (+${M.topGrowthDeltaStr} ${live.unit}${M.topGrowthPct != null ? `, +${M.topGrowthPct}%` : ''}) · ${pdmInfo}`
      );
    }
    if (M.topConquestName && M.topConquestUpside > 0) {
      insightLines.push(
        `🎯 CONQUÊTE #1 : ${M.topConquestName} — déjà ${M.topConquestAglVolumeStr} ${live.unit} chez AGL, reste ${M.topConquestUpsideStr} ${live.unit} à capter chez la concurrence`
      );
    }
    if (M.topUntappedName && M.topUntappedVolume > 0) {
      insightLines.push(
        `⚠ CHARGEUR NON CAPTÉ : ${M.topUntappedName} (${M.topUntappedVolumeStr} ${live.unit} marché, AGL ${M.topUntappedPdm}%) — cible commerciale prioritaire`
      );
    }
    addInsightBox(s, 0.15, 5.70, 12.9, 1.40, '💡', insightLines);
  } else {
    // ─── FALLBACK : layout v1 inchangé ──────────────────────────────────────
    s.addText('Nouveaux chargeurs AGL – TEM 2026', {
      x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 1.5, 6.8,
      ['Chargeur','TEU','Filière','Entrée'],
      [
        ['CI-ÉNERGIES','890','Caoutchouc','Q1 2026'],
        ['SITA GROUP','760','Mangue / Fruits','Q1 2026'],
        ['COOPERX CAJOU CI','640','Noix de Cajou','Q2 2026'],
        ['SECO INDUSTRIE','520','Caoutchouc usiné','Q2 2026'],
        ['OLAM PALM','410','Huile de Palme','Q1 2026'],
      ]);
    s.addText('Nouvelles filières export – PDM AGL', {
      x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.1, 1.52, [
      { label: 'Huile de Palme', vol: 'Mkt: 1 420 TEU', pdm: 8 },
      { label: 'Cola',           vol: 'Mkt: 980 TEU',   pdm: 12 },
    ]);
  }
}

// ─── SLIDE 13 – SÉPARATEUR HINTERLAND IMPORT ─────────────────────────────────
addSeparator('03', 'HINTERLAND IMPORT MARITIME', '28 457 TEU qualifiés  |  AGL #3 – PDM 11,3%  |  Objectif : rang #2');

// ─── SLIDE 14 – HINTERLAND IMPORT VUE D'ENSEMBLE ────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildOverviewData(study, 'HIMP');
  addHeader(s, 'HINTERLAND IMPORT – VUE D\'ENSEMBLE  |  Jan–Mai 2026',
    live
      ? `Marché qualifié : ${live.kpis.marche} TEU  |  AGL : ${live.kpis.agl} TEU  |  PDM : ${live.kpis.pdm}  |  Rang : #${live.aglRank || '—'}`
      : 'Marché qualifié : 28 457 TEU  |  AGL : 3 214 TEU  |  PDM : 11,3%  |  Rang : #3');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.12');

  if (live) {
    addKpiBar(s, [
      { label: 'Marché qualifié', value: live.kpis.marche, sub: 'TEU' },
      { label: 'Volume AGL',      value: live.kpis.agl,    sub: 'TEU' },
      { label: 'PDM AGL',         value: live.kpis.pdm,    sub: `Rang #${live.aglRank || '—'}`, color: ORANGE, big: true },
      { label: live.secondName ? `vs ${live.secondName.slice(0, 14)}` : 'Écart vs #2', value: live.kpis.ecart, sub: 'TEU d\'écart', color: live.ecart >= 0 ? GREEN : RED },
      { label: 'Cumul PDM TOP 4', value: live.kpis.top4,   sub: 'leaders cumul.', color: BLUE2 },
    ]);
  } else {
    addKpiBar(s, [
      { label: 'Marché qualifié', value: '28 457',  sub: 'TEU Jan–Mai' },
      { label: 'Volume AGL',      value: '3 214',   sub: 'TEU Jan–Mai' },
      { label: 'PDM AGL',         value: '11,3 %',  sub: '#3 – Progression vs brut', color: ORANGE, big: true },
      { label: 'Leader UCT',      value: '26,6 %',  sub: '7 559 TEU – Écart ×2,4', color: RED },
      { label: 'PDM Janv. (PEAK)', value: '16,4 %', sub: 'Meilleure PDM période', color: BLUE2 },
    ]);
  }

  const chartData = live && live.monthlyMarket
    ? [
        { name: 'Marché qualifié', labels: live.monthLabels, values: live.monthlyMarket },
        { name: 'AGL',             labels: live.monthLabels, values: live.monthlyAgl },
      ]
    : [
        { name: 'Marché qualifié', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [5400,5800,5600,6100,5550] },
        { name: 'AGL',             labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [886,598,431,652,647] },
      ];
  s.addText('Évolution mensuelle marché qualifié & AGL – Hinterland Import', {
    x: 0.25, y: 2.28, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addBarChart(s, 0.15, 2.55, 6.8, 3.8, chartData, [NAVY, ORANGE]);

  s.addText('PDM AGL par mois – Hinterland Import', {
    x: 7.1, y: 2.28, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const pdmLabels = live && live.monthLabels
    ? live.monthLabels.map((l) => dataAdapter.MONTHS_FR_FULL.find((m) => m.startsWith(l)) || l)
    : ['Janvier','Février','Mars','Avril','Mai'];
  const pdmValues = live && live.monthlyPdm ? live.monthlyPdm : [16.4, 10.3, 7.7, 10.7, 10.8];
  addMensuelBars(s, 7.1, 2.62, pdmLabels, pdmValues, live ? live.aglPdm : 11.3);

  s.addText('Destinations : Bamako 55,5% (17 407 TEU) | Ouagadougou 40,0% (12 549 TEU) | Bobo-Dioulasso 2,1%', {
    x: 0.15, y: 6.45, w: 13, h: 0.25, fontSize: 9, color: MGRAY, fontFace: 'Calibri', italic: true
  });
  s.addText('Origines : Chine 55,5% | Indonésie 7,1% | Inde 6,8%', {
    x: 0.15, y: 6.7, w: 13, h: 0.25, fontSize: 9, color: MGRAY, fontFace: 'Calibri', italic: true
  });
}

// ─── SLIDE 15 – HINTERLAND IMPORT CONCURRENTS ────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildConcurrentsData(study, 'HIMP');
  addHeader(s, 'HINTERLAND IMPORT – CONCURRENTS & SEGMENTS',
    'UCT & Sitracom dominent  |  AGL en reconquête  |  Cibles prioritaires');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.13');

  s.addText('Classement transitaires – Hinterland Import (qualifié)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const himpConcurrentsRows = live ? live.rows : [
    ['#1','UNION CENTER TRANSIT CI','7 559','26,6 %'],
    ['#2','SITRACOM CI','7 208','25,3 %'],
    ['#3','AFRICA GLOBAL LOGISTICS','3 214','11,3 %'],
    ['#4','ECOTRAM CI','1 249','4,4 %'],
    ['#5','CEVA LOGISTICS CI','1 242','4,4 %'],
    ['#6','MAERSK LOGISTIC','1 062','3,7 %'],
    ['#7','FM GENERAL SERVICES','955','3,4 %'],
    ['#8','EBURNEENE LOG. TRANSIT.','928','3,3 %'],
    ['#9','SOCOCIB TRANSIT','886','3,1 %'],
    ['#10','MEDLOG CI','855','3,0 %'],
  ];
  const himpAglHighlight = live && live.aglRowIdx >= 0 && live.aglRowIdx < 10 ? live.aglRowIdx : 2;
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Rang','Transitaire','TEU','PDM'], himpConcurrentsRows, himpAglHighlight);
  addInsightBox(s, 0.15, 5.35, 6.8, 0.95, '🎯',
    [live
      ? `Position HIMP : AGL ${live.aglRowIdx === 0 ? 'leader' : `#${live.aglRowIdx + 1}`}. Données : ${live.source}.`
      : 'STRATÉGIE HINT IMP : Écart de 3 994 TEU avec Sitracom (#2). Cibles filières à 0% PDM : Thé (928 TEU) + Motos (1 172 TEU) = 2 100 TEU de potentiel immédiat. Clients têtes de pont : SOFAO BF (926 TEU), BRAKINA (552 TEU), CODIMEX BF (461 TEU). Commercial dédié Ouagadougou requis.']
  );

  s.addText('PDM AGL par marchandise – Hinterland Import', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const himpSegmentBars = live && live.segmentBars ? live.segmentBars.slice(0, 7) : [
    { label: 'Malt',               vol: '439 TEU',   pdm: 73 },
    { label: 'Matériels Miniers',  vol: '600 TEU',   pdm: 50 },
    { label: 'Pâtes Alimentaires', vol: '528 TEU',   pdm: 31 },
    { label: 'Huile Alimentaire',  vol: '3 069 TEU', pdm: 28 },
    { label: 'Riz',                vol: '736 TEU',   pdm: 20 },
    { label: 'Emballages',         vol: '1 151 TEU', pdm: 20 },
    { label: 'Matér. Construction',vol: '645 TEU',   pdm: 16 },
  ];
  addSegmentBars(s, 7.1, 1.52, himpSegmentBars);

  // Répartition import hinterland par pays de chargement (origines)
  const himpRep = live ? dataAdapter.buildRepartitionPaysData(study, 'HIMP') : null;
  if (himpRep && himpRep.bars.length) {
    s.addText('Répartition import hinterland par pays de chargement', {
      x: 7.1, y: 4.65, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.1, 4.95, himpRep.bars.slice(0, 4));
  }
}

// ─── SLIDE 16 – HINTERLAND IMPORT NOUVEAUX ENTRANTS + TENDANCES ──────────────
// LIVE layout (5 sections, comme slide 7 mais destination = Mali/BF).
// FALLBACK : layout v1 inchangé.
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildNouveauxFullData(study, 'HIMP');
  if (live) {
    addHeader(s, 'HINTERLAND IMPORT – NOUVEAUX ENTRANTS & TENDANCES',
      `Vrais nouveaux entrants (croisés vs toute l'année N-1) · Top hausses & destinataires · ${live.source}`);
  } else {
    addHeader(s, 'HINTERLAND IMPORT – NOUVEAUX ENTRANTS & NOUVEAUX FLUX',
      'Transitaires entrants  |  Nouvelles marchandises  |  Nouveaux destinataires Bamako–Ouagadougou');
  }
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.16');

  if (live) {
    const colW = 4.2, gap = 0.15, x0 = 0.15;
    const x1 = x0, x2 = x0 + colW + gap, x3 = x0 + (colW + gap) * 2;
    const yTitle = 1.18, yTable = 1.45;

    s.addText('Nouveaux transitaires (absents de tout N-1)', {
      x: x1, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yTable, colW,
      ['Transitaire', 'TEU', 'PDM'], live.nouveauxTransitaires);

    s.addText('Nouvelles marchandises (jamais vues en N-1)', {
      x: x2, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x2, yTable, colW,
      ['Marchandise', 'TEU marché', 'PDM AGL'], live.nouveauxMarchandises);

    s.addText('Nouveaux destinataires AGL — opportunité de conquête', {
      x: x3, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yTable, colW,
      ['Destinataire', 'TEU AGL', 'TEU N-1 (autres)'], live.nouveauxClients);

    const yRow2 = 3.65;
    s.addText('Top 3 marchandises — plus forte hausse vs N-1 même période', {
      x: x1, y: yRow2, w: colW + gap + colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yRow2 + 0.27, colW + gap + colW,
      ['Marchandise', 'TEU N', 'TEU N-1', 'Δ', 'Croissance', 'PDM AGL'],
      live.topGrowth.length > 0 ? live.topGrowth : [['—', '—', '—', '—', '—', '—']]);

    s.addText('Top 5 destinataires (tous transitaires) — part AGL', {
      x: x3, y: yRow2, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yRow2 + 0.27, colW,
      ['Destinataire', 'TEU marché', 'TEU AGL', 'PDM AGL'],
      live.topDestinataires.slice(0, 5));

    const M = live.metrics;
    const insightLines = [];
    insightLines.push(
      `📊 ${M.totalNouveauxTransit} nouveaux transitaires · ${M.totalNouvellesMerch} nouvelles marchandises · ${M.totalNouveauxClients} nouveaux destinataires AGL (croisés vs toute l'année N-1)`
    );
    if (M.topGrowthName && M.topGrowthDelta > 0) {
      const pdmInfo = M.topGrowthPdmAgl != null
        ? (M.topGrowthPdmAgl < 5
            ? `PDM AGL ${M.topGrowthPdmAgl}% — fort potentiel à capter`
            : `PDM AGL ${M.topGrowthPdmAgl}% — position à consolider`)
        : '';
      insightLines.push(
        `📈 PLUS FORTE HAUSSE : ${M.topGrowthName} (+${M.topGrowthDeltaStr} ${live.unit}${M.topGrowthPct != null ? `, +${M.topGrowthPct}%` : ''}) · ${pdmInfo}`
      );
    }
    if (M.topConquestName && M.topConquestUpside > 0) {
      insightLines.push(
        `🎯 CONQUÊTE #1 : ${M.topConquestName} — déjà ${M.topConquestAglVolumeStr} ${live.unit} chez AGL, reste ${M.topConquestUpsideStr} ${live.unit} à capter chez la concurrence`
      );
    }
    if (M.topUntappedName && M.topUntappedVolume > 0) {
      insightLines.push(
        `⚠ DESTINATAIRE NON CAPTÉ : ${M.topUntappedName} (${M.topUntappedVolumeStr} ${live.unit} marché, AGL ${M.topUntappedPdm}%) — cible commerciale prioritaire`
      );
    }
    addInsightBox(s, 0.15, 5.70, 12.9, 1.40, '💡', insightLines);
  } else {
    s.addText('Nouveaux transitaires – Hinterland Import', {
      x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 1.5, 6.8,
      ['Rang','Transitaire','TEU','PDM','Spécialité'],
      [
        ['#11','SAHEL TRANSIT','620','2,2 %','Sucre / Alimentaire'],
        ['#12','BURKINATRANS','580','2,0 %','BTP Burkina'],
        ['#13','TRANS-SAHEL LOG.','450','1,6 %','Machines'],
        ['#14','KARAMOKOTRAKRANSIT','380','1,3 %','Alimentation'],
      ]);
    s.addText('Nouveaux destinataires AGL – Hinterland Import', {
      x: 0.25, y: 3.0, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 3.3, 6.8,
      ['Destinataire','TEU','Destination','Entrée'],
      [
        ['SOFAO BF (alimentaire)','926','Ouagadougou','Q1 2026'],
        ['BRAKINA (boissons)','552','Bobo-Dioulasso','Q1 2026'],
        ['CODIMEX BF (emballages)','461','Ouagadougou','Q2 2026'],
        ['TOTAL ENERGIES ML','390','Bamako','Q1 2026'],
        ['ONATEL BF (télécoms)','320','Ouagadougou','Q2 2026'],
      ]
    );
    s.addText('Nouvelles marchandises hinterland – PDM AGL', {
      x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.1, 1.52, [
      { label: 'Matériel Agricole',  vol: '520 TEU', pdm: 8 },
      { label: 'Véhicules BTP',      vol: '380 TEU', pdm: 5 },
      { label: 'Intrants Pharma',    vol: '290 TEU', pdm: 12 },
    ]);
    addInsightBox(s, 7.1, 4.2, 6.0, 0.75, '🎯',
      ['CIBLES : Thé (928 TEU) + Motos (1 172 TEU) à 0–1% PDM = 2 100 TEU de potentiel immédiat. Commercial dédié Ouagadougou recommandé (40% du marché hinterland).']
    );
    addInsightBox(s, 7.1, 5.1, 6.0, 0.75, '⚠',
      ['MENACE : CEVA Logistics déjà #5 (4,4%) en quelques mois. UCT + Sitracom verrouillent 51,9% du marché — l\'écart vers le rang #2 est de 3 994 TEU.'],
      'FEF2F2'
    );
  }
}

// ─── SLIDE 17 – SÉPARATEUR HINTERLAND EXPORT ─────────────────────────────────
addSeparator('04', 'HINTERLAND EXPORT MARITIME', '4 294 TEU  |  PDM AGL : 66,1%  |  Dominance absolue');

// ─── SLIDE 18 – HINTERLAND EXPORT VUE D'ENSEMBLE ─────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildOverviewData(study, 'HEXP');
  addHeader(s, 'HINTERLAND EXPORT – VUE D\'ENSEMBLE  |  Jan–Mai 2026',
    live
      ? `AGL #${live.aglRank || '—'} – PDM ${live.kpis.pdm}  |  Marché : ${live.kpis.marche} TEU  |  Coton dominant`
      : 'AGL #1 ABSOLU – PDM 66,1%  |  Marché : 4 294 TEU  |  Coton dominant');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.15');

  if (live) {
    addKpiBar(s, [
      { label: 'Marché total',     value: live.kpis.marche, sub: 'TEU' },
      { label: 'Volume AGL',       value: live.kpis.agl,    sub: 'TEU' },
      { label: 'PDM AGL',          value: live.kpis.pdm,    sub: `Rang #${live.aglRank || '—'}`, color: GREEN, big: true },
      { label: live.secondName ? `vs ${live.secondName.slice(0, 14)}` : 'Écart vs #2', value: live.kpis.ecart, sub: 'TEU d\'écart', color: live.ecart >= 0 ? GREEN : RED },
      { label: 'Cumul PDM TOP 4',  value: live.kpis.top4,   sub: 'leaders cumul.', color: BLUE2 },
    ]);
  } else {
    addKpiBar(s, [
      { label: 'Marché total',     value: '4 294',   sub: 'TEU Jan–Mai' },
      { label: 'Volume AGL',       value: '2 840',   sub: 'TEU Jan–Mai' },
      { label: 'PDM AGL',          value: '66,1 %',  sub: '#1 ABSOLU', color: GREEN, big: true },
      { label: 'Coton AGL',        value: '2 522',   sub: 'TEU – 88,8% du portef.', color: NAVY },
      { label: 'PDM Fév. (PEAK)',  value: '72,9 %',  sub: 'Meilleure PDM période', color: BLUE2 },
    ]);
  }

  const chartData = live && live.monthlyMarket
    ? [
        { name: 'Marché total', labels: live.monthLabels, values: live.monthlyMarket },
        { name: 'AGL',          labels: live.monthLabels, values: live.monthlyAgl },
      ]
    : [
        { name: 'Marché total', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [870,950,900,820,754] },
        { name: 'AGL',          labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [441,693,647,559,500] },
      ];
  s.addText('Évolution mensuelle – Hinterland Export', {
    x: 0.25, y: 2.28, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addBarChart(s, 0.15, 2.55, 6.8, 4.3, chartData, [NAVY, GREEN]);

  s.addText('PDM AGL par mois – Hinterland Export', {
    x: 7.1, y: 2.28, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const pdmLabels = live && live.monthLabels
    ? live.monthLabels.map((l) => dataAdapter.MONTHS_FR_FULL.find((m) => m.startsWith(l)) || l)
    : ['Janvier','Février','Mars','Avril','Mai'];
  const pdmValues = live && live.monthlyPdm ? live.monthlyPdm : [50.7, 72.9, 71.9, 68.1, 56.7];
  addMensuelBars(s, 7.1, 2.62, pdmLabels, pdmValues, live ? live.aglPdm : 60.0);

  // Répartition export hinterland par pays de chargement (origines Mali/BF)
  const repPays = live ? dataAdapter.buildRepartitionPaysData(study, 'HEXP') : null;
  if (repPays && repPays.bars.length) {
    s.addText('Répartition export hinterland par pays de chargement', {
      x: 7.1, y: 5.55, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.1, 5.85, repPays.bars.slice(0, 4));
  } else {
    s.addText('Concurrents : FM General Services 12,1% (518 TEU)  |  Movis Transit 5,8% (251 TEU)  |  CEVA Logistics 5,1% (220 TEU)', {
      x: 0.15, y: 6.5, w: 13, h: 0.25, fontSize: 9, color: MGRAY, fontFace: 'Calibri', italic: true
    });
    s.addText('Chargeurs AGL : SOFITEX 1 492 TEU  |  CMDT Bamako 1 010 TEU  |  SAGROCOM BF 249 TEU', {
      x: 0.15, y: 6.75, w: 13, h: 0.25, fontSize: 9, color: MGRAY, fontFace: 'Calibri', italic: true
    });
  }
}

// ─── SLIDE 19 – HINTERLAND EXPORT NOUVEAUX CHARGEURS + TENDANCES ─────────────
// LIVE layout (5 sections, comme slide 7/12 mais col 3 = Chargeurs hinterland).
// FALLBACK : layout v1 inchangé.
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildNouveauxFullData(study, 'HEXP');
  if (live) {
    addHeader(s, 'HINTERLAND EXPORT – NOUVEAUX CHARGEURS & TENDANCES',
      `Vrais nouveaux entrants (croisés vs toute l'année N-1) · Top hausses & chargeurs · ${live.source}`);
  } else {
    addHeader(s, 'HINTERLAND EXPORT – NOUVEAUX CHARGEURS',
      'Chargeurs entrés en 2026  |  Sécurisation du portefeuille coton  |  Nouvelle filière huile de palme');
  }
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.19');

  if (live) {
    const colW = 4.2, gap = 0.15, x0 = 0.15;
    const x1 = x0, x2 = x0 + colW + gap, x3 = x0 + (colW + gap) * 2;
    const yTitle = 1.18, yTable = 1.45;

    s.addText('Nouveaux transitaires (absents de tout N-1)', {
      x: x1, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yTable, colW,
      ['Transitaire', 'TEU', 'PDM'], live.nouveauxTransitaires);

    s.addText('Nouvelles marchandises (jamais vues en N-1)', {
      x: x2, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x2, yTable, colW,
      ['Marchandise', 'TEU marché', 'PDM AGL'], live.nouveauxMarchandises);

    s.addText('Nouveaux chargeurs AGL — opportunité de conquête', {
      x: x3, y: yTitle, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yTable, colW,
      ['Chargeur', 'TEU AGL', 'TEU N-1 (autres)'], live.nouveauxClients);

    const yRow2 = 3.65;
    s.addText('Top 3 marchandises — plus forte hausse vs N-1 même période', {
      x: x1, y: yRow2, w: colW + gap + colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x1, yRow2 + 0.27, colW + gap + colW,
      ['Marchandise', 'TEU N', 'TEU N-1', 'Δ', 'Croissance', 'PDM AGL'],
      live.topGrowth.length > 0 ? live.topGrowth : [['—', '—', '—', '—', '—', '—']]);

    s.addText('Top 5 chargeurs (tous transitaires) — part AGL', {
      x: x3, y: yRow2, w: colW, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    addRankTable(s, x3, yRow2 + 0.27, colW,
      ['Chargeur', 'TEU marché', 'TEU AGL', 'PDM AGL'],
      live.topDestinataires.slice(0, 5));

    const M = live.metrics;
    const insightLines = [];
    insightLines.push(
      `📊 ${M.totalNouveauxTransit} nouveaux transitaires · ${M.totalNouvellesMerch} nouvelles marchandises · ${M.totalNouveauxClients} nouveaux chargeurs AGL (croisés vs toute l'année N-1)`
    );
    if (M.topGrowthName && M.topGrowthDelta > 0) {
      const pdmInfo = M.topGrowthPdmAgl != null
        ? (M.topGrowthPdmAgl < 5
            ? `PDM AGL ${M.topGrowthPdmAgl}% — fort potentiel à capter`
            : `PDM AGL ${M.topGrowthPdmAgl}% — position à consolider`)
        : '';
      insightLines.push(
        `📈 PLUS FORTE HAUSSE : ${M.topGrowthName} (+${M.topGrowthDeltaStr} ${live.unit}${M.topGrowthPct != null ? `, +${M.topGrowthPct}%` : ''}) · ${pdmInfo}`
      );
    }
    if (M.topConquestName && M.topConquestUpside > 0) {
      insightLines.push(
        `🎯 CONQUÊTE #1 : ${M.topConquestName} — déjà ${M.topConquestAglVolumeStr} ${live.unit} chez AGL, reste ${M.topConquestUpsideStr} ${live.unit} à capter chez la concurrence`
      );
    }
    if (M.topUntappedName && M.topUntappedVolume > 0) {
      insightLines.push(
        `⚠ CHARGEUR NON CAPTÉ : ${M.topUntappedName} (${M.topUntappedVolumeStr} ${live.unit} marché, AGL ${M.topUntappedPdm}%) — cible commerciale prioritaire`
      );
    }
    addInsightBox(s, 0.15, 5.70, 12.9, 1.40, '💡', insightLines);
  } else {
    s.addText('Nouveaux chargeurs AGL – Hinterland Export 2026', {
      x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 1.5, 6.8,
      ['Chargeur','TEU','Filière','Entrée'],
      [
        ['IVOIRE COTON EXPORT','280','Coton','Q1 2026'],
        ['COTON BURKINA SUD','195','Coton','Q2 2026'],
        ['SODECOTON ML (Mali)','160','Coton','Q2 2026'],
        ['OIL PALM CI EXPORT','140','Huile de Palme','Q1 2026'],
      ]);
    s.addText('Portefeuille existant à sécuriser', {
      x: 0.25, y: 3.35, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addRankTable(s, 0.15, 3.65, 6.8,
      ['Chargeur','TEU','% Portefeuille'],
      [
        ['SOFITEX','1 492','52,5 %'],
        ['CMDT Bamako','1 010','35,6 %'],
        ['SAGROCOM BF','249','8,8 %'],
      ]
    );
    s.addText('Contexte concurrentiel – PDM concurrents', {
      x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
    });
    addSegmentBars(s, 7.1, 1.52, [
      { label: 'FM GENERAL SERVICES', vol: '518 TEU', pdm: 12 },
      { label: 'MOVIS TRANSIT CI',    vol: '251 TEU', pdm: 6 },
      { label: 'CEVA LOGISTICS CI',   vol: '220 TEU', pdm: 5 },
    ]);
    addInsightBox(s, 7.1, 3.5, 6.0, 0.85, '⚠',
      ['MENACE CEVA : CEVA Logistics (CMA CGM, bureau Abidjan avril 2026) capte déjà 5,1% du marché. Risque direct sur les flux coton Bamako–Ouagadougou.'],
      'FEF2F2'
    );
    addInsightBox(s, 7.1, 4.5, 6.0, 0.85, '🎯',
      ['ACTION : Sécuriser SOFITEX (52,5% du portefeuille) et CMDT par contrats pluriannuels avant la campagne coton 2026–2027. Développer la filière huile de palme (140 TEU dès Q1).']
    );
  }
}

// ─── SLIDE 20 – SÉPARATEUR AÉRIEN ────────────────────────────────────────────
addSeparator('05', 'AÉRIEN IMPORT', '5 603 T qualifiées  |  PDM AGL : 20,8%  |  #1 ABSOLU');

// ─── SLIDE 21 – AÉRIEN VUE D'ENSEMBLE ───────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildOverviewData(study, 'AER');
  addHeader(s, 'AÉRIEN IMPORT – VUE D\'ENSEMBLE  |  Jan–Mai 2025 vs 2026',
    live
      ? `Marché qualifié : ${live.kpis.marche} kg  |  AGL : ${live.kpis.agl} kg  |  PDM ${live.kpis.pdm} (Rang #${live.aglRank || '—'})`
      : 'Marché qualifié : +1,5% vs 2025  |  AGL #1 ABSOLU – PDM 20,8%  |  Montée en puissance Jan→Mai');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.17');

  if (live) {
    addKpiBar(s, [
      { label: 'Marché qualifié 2025', value: '5 521 T',  sub: 'Jan–Mai 2025 (réf.)' },
      { label: 'Marché qualifié',      value: live.kpis.marche + ' kg', sub: 'période courante' },
      { label: 'AGL période',          value: live.kpis.agl + ' kg', sub: `Rang #${live.aglRank || '—'}`, color: GREEN },
      { label: 'PDM AGL',              value: live.kpis.pdm, sub: 'période courante', color: GREEN, big: true },
      { label: 'Cumul PDM TOP 4',      value: live.kpis.top4, sub: 'leaders cumul.', color: BLUE2 },
    ]);
  } else {
    addKpiBar(s, [
      { label: 'Marché qualifié 2025', value: '5 521 T',  sub: 'Jan–Mai 2025' },
      { label: 'Marché qualifié 2026', value: '5 603 T',  sub: '+1,5% vs 2025' },
      { label: 'AGL 2026',             value: '1 166 T',  sub: '#1 ABSOLU', color: GREEN },
      { label: 'PDM AGL 2026',         value: '20,8 %',   sub: 'vs ~18% estimé 2025', color: GREEN, big: true },
      { label: 'PDM Mai 2026',         value: '31,2 %',   sub: 'Record de la période', color: BLUE2 },
    ]);
  }

  const chartData = live && live.monthlyMarket
    ? [
        { name: 'Marché qualifié (kg)', labels: live.monthLabels, values: live.monthlyMarket },
        { name: 'AGL (kg)',             labels: live.monthLabels, values: live.monthlyAgl },
      ]
    : [
        { name: 'Marché 2025 (kg)', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [1180000,1020000,1100000,1150000,1071000] },
        { name: 'Marché 2026 (kg)', labels: ['Janv.','Févr.','Mars','Avr.','Mai'], values: [1220000,1050000,1130000,1050000,1153000] },
      ];
  s.addText('Marché aérien import qualifié (kg) – 2025 vs 2026', {
    x: 0.25, y: 2.28, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addBarChart(s, 0.15, 2.55, 6.8, 4.3, chartData, [NAVY, GOLD]);

  s.addText('PDM AGL aérien – Progression Jan→Mai 2026 (%)', {
    x: 7.1, y: 2.28, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const pdmLabels = live && live.monthLabels
    ? live.monthLabels.map((l) => dataAdapter.MONTHS_FR_FULL.find((m) => m.startsWith(l)) || l)
    : ['Janvier','Février','Mars','Avril','Mai'];
  const pdmValues = live && live.monthlyPdm ? live.monthlyPdm : [10.9, 15.2, 22.4, 28.1, 31.2];
  addMensuelBars(s, 7.1, 2.62, pdmLabels, pdmValues, live ? live.aglPdm : 20.0);
  addInsightBox(s, 7.1, 5.7, 6.0, 0.75, '🏆',
    [live
      ? `Données live (${live.source}). AGL #${live.aglRank || '—'}, PDM ${live.kpis.pdm}.`
      : 'AGL #1 ABSOLU aérien import (qualifié) : 20,8% de PDM sur 5 603 tonnes. Progression remarquable : 10,9% en Janvier → 31,2% en Mai, soit +20,3 pts en 5 mois.'],
    'F0FDF4'
  );
}

// ─── SLIDE 22 – AÉRIEN SEGMENTS ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'AÉRIEN IMPORT – SEGMENTS & CONCURRENTS  |  2025 vs 2026',
    'Évolution marchandises  |  Classement transitaires qualifiés  |  PDM AGL par filière');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.18');

  s.addText('Top marchandises – évolution 2025 vs 2026 (kg)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Marchandise','2025','2026','Var.%'],
    [
      ['OEUFS','1 483 700','1 883 317','+26,9%'],
      ['MATÉRIELS MINIERS','149 783','515 776','+244,3%'],
      ['MACHINES','255 984','486 785','+90,2%'],
      ['MÉDICAMENTS','280 991','337 882','+20,2%'],
      ['BILLETS DE BANQUE','268 210','330 706','+23,3%'],
      ['TÉLÉCOMS','113 602','182 071','+60,3%'],
      ['MATÉRIELS ÉLECTRIQUE','64 622','158 887','+145,9%'],
      ['PIÈCES DÉTACHÉES','1 181 203','942 926','–20,2%'],
      ['PRODUITS CHIMIQUES','207 323','189 901','–8,4%'],
      ['FRUITS & LÉGUMES','154 253','115 798','–24,9%'],
    ]
  );

  s.addText('Classement transitaires – Aérien Import 2026 (qualifié)', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const aerConcurrentsLive = dataAdapter.buildConcurrentsData(study, 'AER');
  const aerConcurrentsRows = aerConcurrentsLive ? aerConcurrentsLive.rows : [
    ['#1','AFRICA GLOBAL LOGISTICS','1 165 994','20,8 %'],
    ['#2','OSMOZ AFRICA','525 506','9,4 %'],
    ['#3','GTS CI','468 097','8,4 %'],
    ['#4','IVOIRE INTL TRANSIT','333 558','6,0 %'],
    ['#5','MANUEL','292 408','5,2 %'],
    ['#6','TRANSIT-COSS','274 613','4,9 %'],
    ['#7','HANNYYAH ET SAID','273 092','4,9 %'],
    ['#8','DHL','217 874','3,9 %'],
    ['#9','INTL LOGISTICS SA','187 906','3,4 %'],
    ['#10','IVOIRE PHENIX TRANSIT','133 527','2,4 %'],
  ];
  const aerAglHighlight = aerConcurrentsLive && aerConcurrentsLive.aglRowIdx >= 0 && aerConcurrentsLive.aglRowIdx < 10
    ? aerConcurrentsLive.aglRowIdx : 0;
  addRankTable(s, 7.0, 1.5, 6.2,
    ['Rang','Transitaire','Poids kg','PDM'], aerConcurrentsRows, aerAglHighlight);
  addInsightBox(s, 0.15, 5.38, 12.9, 0.85, '🏆',
    [aerConcurrentsLive
      ? `AGL ${aerConcurrentsLive.aglRowIdx === 0 ? 'leader' : `#${aerConcurrentsLive.aglRowIdx + 1}`} aérien import. Données : ${aerConcurrentsLive.source}.`
      : 'AGL #1 : 20,8% PDM sur marché qualifié. Progression continue Jan→Mai (+20 pts). ⚠ Transit-Coss : –60% (696K→274K kg). Clients récupérés partiellement par AGL. 🎯 Cibles : GTS CI (#3, 8,4%) à surveiller. Osmoz Africa (#2, 9,4%) à challenger sur Matériels Miniers.']
  );
}

// ─── SLIDE 23 – AÉRIEN CLIENTÈLE ─────────────────────────────────────────────
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildClienteleData(study, 'AER');
  addHeader(s, 'AÉRIEN IMPORT – CLIENTÈLE AGL',
    'Top 10 destinataires  |  Mix produits  |  Risques & leviers de croissance');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.19');

  s.addText('Top 10 clients AGL – Aérien Import (Destinataires, kg)', {
    x: 0.25, y: 1.2, w: 7.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const aerClienteleRows = live ? live.rows : [
    ['K1 MINING SA CI','308 596','Mat. Miniers','26,5%'],
    ['PROSUMA','268 633','Prod. Alimentaires','23,1%'],
    ['UBIPHARM CÔTE D\'IVOIRE','61 130','Médicaments','5,2%'],
    ['ORANGE CI','49 988','Télécoms','4,3%'],
    ['NESTLÉ CÔTE D\'IVOIRE','38 474','Alimentaire','3,3%'],
    ['SIFAAP CI','24 694','Alim. Animal','2,1%'],
    ['SITAB CI','23 535','Cigarettes','2,0%'],
    ['ROCHE DIAGNOSTICS CI','22 633','Mat. Labo.','1,9%'],
    ['MTN CI','20 141','Télécoms','1,7%'],
    ['FOXTROT INTERNATIONAL','18 721','Pétrole','1,6%'],
  ];
  addRankTable(s, 0.15, 1.5, 7.0,
    ['Client (Destinataire)','Poids (kg)','Segment','% Vol. AGL'], aerClienteleRows);
  addInsightBox(s, 0.15, 5.3, 7.0, 1.05, '⚠',
    live
      ? [`Top client : ${live.topClient} = ${live.topClientShare} du volume AGL aérien.`,
         `Données live : ${live.source}.`]
      : [
          'Hyper-concentration : K1 Mining (26,5%) + PROSUMA (23,1%) = 49,6% du volume AGL aérien sur 2 clients. Risque élevé.',
          '✓ Télécoms (Orange + MTN) : 70 129 kg – Secteur en forte croissance. Contrats cadres 2026/2027 à signer.',
          '▶ Nestlé + SIFAAP = 63 168 kg (filière agro-alim). Ubipharm = pont TIM/AER. Développer offre multi-métiers.'
        ]
  );

  s.addText('Mix produits AGL – Aérien Import', {
    x: 7.3, y: 1.2, w: 5.8, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const aerPie = live && live.mixLabels && live.mixLabels.length
    ? [{ name: 'Mix Aérien', labels: live.mixLabels, values: live.mixValues }]
    : [{
        name: 'Mix Aérien',
        labels: ['Mat. Miniers','Prod. Alimentaires','Médicaments','Télécoms','Alimentaire','Autres'],
        values: [27,23,5,6,3,36]
      }];
  s.addChart(pptx.ChartType.pie, aerPie, {
    x: 7.3, y: 1.5, w: 5.8, h: 4.5,
    showLegend: true, legendPos: 'r', legendFontSize: 9,
    chartColors: [NAVY, GREEN, GOLD, ORANGE, TEAL, MGRAY],
    showPercent: true, dataLabelFontSize: 9, dataLabelColor: WHITE,
  });
}

// ─── SLIDE 24 – AÉRIEN NOUVEAUX ENTRANTS ──────────────────────────────────────
// TODO: cross-référencer study.n1Runs pour annoter les verdicts (en revue).
{
  const s = pptx.addSlide();
  const live = dataAdapter.buildNouveauxData(study, 'AER');
  addHeader(s, 'AÉRIEN IMPORT – NOUVEAUX ENTRANTS & NOUVEAUX FLUX',
    'Transitaires entrants  |  Nouvelles marchandises en croissance  |  Récupération clients Transit-Coss');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.24');

  s.addText('Nouveaux transitaires – Aérien Import 2026', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const aerNouveauxRows = live && live.rows.length ? live.rows.map((r) => [r[1], r[2], r[4], r[0]]) : [
    ['FRET INTER CI','94 200','Alimentaire','Q1 2026'],
    ['SOTRA FRET','78 400','Pièces détachées','Q2 2026'],
  ];
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Transitaire','Poids kg','Spécialité','Entrée'], aerNouveauxRows);
  s.addText('Marchandises en forte croissance 2025 → 2026', {
    x: 0.25, y: 2.95, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 3.25, 6.8,
    ['Marchandise','2026 (kg)','Var. %','PDM AGL'],
    [
      ['ŒUFS','1 883 317','+26,9 %','1 %'],
      ['MATÉRIELS MINIERS','515 776','+244,3 %','61 %'],
      ['MACHINES','486 785','+90,2 %','—'],
      ['TÉLÉCOMS','182 071','+60,3 %','33 %'],
      ['MATÉR. ÉLECTRIQUES','158 887','+145,9 %','—'],
    ]
  );

  s.addText('Opportunités prioritaires – PDM AGL actuelle', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addSegmentBars(s, 7.1, 1.55, [
    { label: 'ŒUFS (cible 8%)',       vol: '1 883 317 kg', pdm: 1 },
    { label: 'TÉLÉCOMS (Orange+MTN)', vol: '182 071 kg',   pdm: 33 },
    { label: 'MAT. MINIERS (K1)',      vol: '515 776 kg',   pdm: 61 },
    { label: 'PIÈCES DÉTACHÉES',       vol: '942 926 kg',   pdm: 8 },
  ]);
  addInsightBox(s, 7.1, 4.2, 6.0, 1.05, '🎯',
    ['LEVIERS : Œufs : +26,9% de marché, AGL à 1% → cible 8% = +130 T/an. Transit-Coss en chute de –60% (696K→274K kg) : accélérer la captation de ses clients. Contrats cadres Télécoms 2027 à sécuriser dès maintenant.']
  );
}

// ─── SLIDE 25 – SÉPARATEUR DSM ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.ShapeType.rect, { x:0,y:0,w:13.33,h:7.5, fill:{color:NAVY}, line:{type:'none'} });
  s.addShape(pptx.ShapeType.rect, { x:1.2,y:3.85,w:8.2,h:0.065, fill:{color:GOLD}, line:{type:'none'} });
  s.addText('DSM', { x:0.4,y:2.2,w:12.5,h:1.0, fontSize:72, bold:true, color:'1A2E4A', align:'center', fontFace:'Calibri' });
  s.addText('DIRECTION DES SOLUTIONS MARITIMES', {
    x:0.4,y:2.9,w:12.5,h:1.0, fontSize:28, bold:true, color:WHITE, align:'center', fontFace:'Calibri'
  });
  s.addText('Étude des armateurs au B/L  |  Lignes régulières (TEU + RoRo)  |  Tramps : BRBK, Sac, Vrac', {
    x:0.4,y:4.05,w:12.5,h:0.5, fontSize:14, italic:true, color:GOLD, align:'center', fontFace:'Calibri'
  });
  s.addText('Africa Global Logistics – Étude de Marché Jan–Mai 2026', {
    x:2,y:7.1,w:9,h:0.28, fontSize:9, color:MGRAY, align:'center', fontFace:'Calibri'
  });
  s.addText('AGL', { x:12.5,y:7.08,w:0.7,h:0.32, fontSize:10, bold:true, color:GOLD, align:'right', fontFace:'Calibri' });
}

// ─── SLIDES 26–27 – DSM ──────────────────────────────────────────────────────
// Source : examples/dsm_import_2025.xlsx → lib/pptx/data/dsm.json (Import 2025 hors PP)
const dsmData = window.__DSM_DATA__;

const fmtTon = (v) => Math.round(v).toLocaleString('fr-FR').replace(/,/g, ' ');
const fmtPdm = (v) => v.toFixed(2).replace('.', ',') + ' %';

// ─── SLIDE 26 – DSM ARMATEURS AU B/L ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'DSM – ARMATEURS AU B/L  |  Tonnage Import 2025',
    `Classement annuel tonnage tous conditionnements  |  Marché : ${fmtTon(dsmData.armateurs.market_total)} T  |  Hors PP`);
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.26');

  // Tableau classement armateurs
  s.addText('Top 10 Armateurs au B/L (Import 2025)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Rang','Armateur','Tonnage','PDM'],
    dsmData.armateurs.top.slice(0, 10).map((r, i) => [
      `#${i + 1}`, r.name, fmtTon(r.total), fmtPdm(r.pdm)
    ])
  );

  // PDM mensuelle Top 5 armateurs
  s.addText('Évolution mensuelle Top 5 armateurs (% du marché mensuel)', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const top5 = dsmData.armateurs.top.slice(0, 5);
  const colors = [NAVY, GOLD, GREEN, BLUE2, TEAL];
  const monthlyMarket = Array(12).fill(0);
  dsmData.armateurs.top.forEach(r => r.monthly.forEach((v, i) => monthlyMarket[i] += v));
  // Mini-tableau PDM mensuelle (% par mois)
  const monthAbbr = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const tableRows = [['Armateur', ...monthAbbr, 'Tot']];
  top5.forEach((r, i) => {
    const cells = [r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name];
    r.monthly.forEach((v, m) => {
      const pct = monthlyMarket[m] ? (v / monthlyMarket[m]) * 100 : 0;
      cells.push(pct >= 5 ? pct.toFixed(0) + '%' : '');
    });
    cells.push(fmtPdm(r.pdm));
    tableRows.push(cells);
  });
  s.addTable(tableRows, {
    x: 7.1, y: 1.5, w: 6.0, fontSize: 7, fontFace: 'Calibri',
    border: { type: 'solid', pt: 0.25, color: 'D1D5DB' },
    colW: [1.4, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.56],
    rowH: 0.28,
    fill: { color: 'FFFFFF' },
  });

  addInsightBox(s, 0.15, 5.5, 12.9, 0.95, '💡',
    [`INSIGHT ARMATEURS : Affrètement clinker (${fmtPdm(dsmData.armateurs.top[0].pdm)}) domine le tonnage import — flux cimenteries CIM-CI / SCA / SOCOCIM via CAM PHA, PORT SAID, MINA SAQR. Hors affrètement, MSC (${fmtPdm(dsmData.armateurs.top.find(r => r.name === 'MSC')?.pdm || 0)}) + CMA CGM (${fmtPdm(dsmData.armateurs.top.find(r => r.name === 'CMA CGM')?.pdm || 0)}) + Maersk = ~16% sur lignes régulières. Cible AGL : consolider commission B/L sur ces 3 majors + capter armateurs riz/blé/engrais (vraquiers spot).`]
  );
}

// ─── SLIDE 27 – DSM MANUTENTIONNAIRES ────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'DSM – MANUTENTIONNAIRES  |  Position AGL CI',
    `Classement annuel tonnage manutention  |  AGL CI : #${dsmData.manutentionnaires.agl_rank} avec ${fmtTon(dsmData.manutentionnaires.agl_total)} T (${fmtPdm(dsmData.manutentionnaires.agl_pdm)} PDM)`);
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.27');

  // Classement avec AGL CI en surbrillance
  const aglRowIdx = dsmData.manutentionnaires.top.findIndex(r => r.name.toUpperCase().includes('AGL'));
  s.addText('Top 10 Manutentionnaires (Import 2025)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Rang','Manutentionnaire','Tonnage','PDM'],
    dsmData.manutentionnaires.top.slice(0, 10).map((r, i) => [
      `#${i + 1}`, r.name, fmtTon(r.total), fmtPdm(r.pdm)
    ]),
    aglRowIdx >= 0 ? aglRowIdx + 1 : 0
  );

  // PDM AGL CI mensuelle vs marché
  s.addText('AGL CI – tonnage mensuel manutention 2025', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const aglMonth = dsmData.manutentionnaires.top[aglRowIdx]?.monthly || [];
  const totalMonth = Array(12).fill(0);
  dsmData.manutentionnaires.top.forEach(r => r.monthly.forEach((v, i) => totalMonth[i] += v));
  const monthLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  // Barres verticales
  const chartX = 7.2, chartY = 1.6, chartW = 5.9, chartH = 2.8;
  const maxV = Math.max(...aglMonth);
  aglMonth.forEach((v, i) => {
    const bw = (chartW - 0.2) / 12;
    const bx = chartX + i * bw + 0.05;
    const bh = maxV ? (v / maxV) * (chartH - 0.4) : 0;
    s.addShape(pptx.ShapeType.rect, {
      x: bx, y: chartY + chartH - bh - 0.3, w: bw - 0.05, h: bh,
      fill: { color: NAVY }, line: { type: 'none' }
    });
    s.addText(monthLabels[i], {
      x: bx, y: chartY + chartH - 0.25, w: bw, h: 0.2,
      fontSize: 7, color: MGRAY, align: 'center', fontFace: 'Calibri'
    });
    if (v > 0) {
      s.addText(fmtTon(v / 1000) + 'k', {
        x: bx - 0.1, y: chartY + chartH - bh - 0.55, w: bw + 0.15, h: 0.2,
        fontSize: 6, color: NAVY, bold: true, align: 'center', fontFace: 'Calibri'
      });
    }
  });

  addInsightBox(s, 0.15, 5.5, 12.9, 0.95, '🎯',
    [`STRATÉGIE MANUTENTION : AGL CI #${dsmData.manutentionnaires.agl_rank} sur 10 (${fmtPdm(dsmData.manutentionnaires.agl_pdm)}) — écart important avec leader Sea-Invest (${fmtPdm(dsmData.manutentionnaires.top[0].pdm)}) et Côte d'Ivoire Terminal (${fmtPdm(dsmData.manutentionnaires.top[1].pdm)}). Levier 2026 : capter manutention vraquiers clinker (CAM PHA → cimenteries) + consolider Global Manutention en partenariat technique. Objectif 6% PDM à 18 mois.`]
  );
}

// ─── SLIDE 27B – DSM CONSIGNATAIRES & POL ────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'DSM – CONSIGNATAIRES & PORTS DE CHARGEMENT',
    `AGL CI #${dsmData.consignataires.agl_rank} consignataire (${fmtPdm(dsmData.consignataires.agl_pdm)} PDM, ${fmtTon(dsmData.consignataires.agl_total)} T)  |  Top 10 POL Import 2025`);
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.27b');

  const aglConsignIdx = dsmData.consignataires.top.findIndex(r => r.name.toUpperCase().includes('AGL'));
  s.addText('Top 10 Consignataires (Import 2025)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Rang','Consignataire','Tonnage','PDM'],
    dsmData.consignataires.top.slice(0, 10).map((r, i) => [
      `#${i + 1}`, r.name, fmtTon(r.total), fmtPdm(r.pdm)
    ]),
    aglConsignIdx >= 0 ? aglConsignIdx + 1 : 0
  );

  s.addText('Top 10 POL — Origines des imports 2025', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 7.1, 1.5, 6.0,
    ['Rang','Port de chargement','Tonnage','PDM'],
    dsmData.pol_top20.top.slice(0, 10).map((r, i) => [
      `#${i + 1}`, r.port, fmtTon(r.total), fmtPdm(r.pdm)
    ])
  );

  addInsightBox(s, 0.15, 5.5, 12.9, 0.95, '💡',
    [`POSITION CONSIGNATAIRE FORTE : AGL CI #${dsmData.consignataires.agl_rank} (${fmtPdm(dsmData.consignataires.agl_pdm)}) — seulement Sea-Invest devant. ROUTES CLÉS : CAM PHA (clinker Vietnam, ${fmtPdm(dsmData.pol_top20.top[0].pdm)}) + PORT SAID (transbord. Égypte, ${fmtPdm(dsmData.pol_top20.top[1].pdm)}) + MINA SAQR (clinker UAE). Cible : consolider consignation armateurs spot vraquiers + capter co-consignation MSC/CMA sur lignes Asie-WAF.`]
  );
}

// ─── SLIDE 28 – FOCUS PÉTROLE ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'FOCUS SECTORIEL – PÉTROLE  |  Position AGL',
    'Flux hydrocarbures import / export  |  Opérateurs au B/L  |  ~2,4 M T  |  Jan–Mai 2026');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.28');

  s.addText('Opérateurs pétroliers actifs – Abidjan (B/L)', {
    x: 0.25, y: 1.2, w: 6.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.8,
    ['Opérateur','Volume T','Flux','PDM'],
    [
      ['SIR CI (Raffinerie)','~480 000','Import brut','20,0 %'],
      ['TOTAL ENERGIES CI','~320 000','Import raffinés','13,3 %'],
      ['VIVO ENERGY (Shell)','~280 000','Import raffinés','11,7 %'],
      ['PETRO IVOIRE','~190 000','Import + Distrib.','7,9 %'],
      ['FOXTROT INTERNATIONAL','~160 000','Export offshore','6,7 %'],
      ['ORYX CI','~140 000','Import raffinés','5,8 %'],
      ['BOLLORÉ ENERGY','~120 000','Import divers','5,0 %'],
    ]
  );

  s.addText('Position AGL dans le secteur pétrolier', {
    x: 7.1, y: 1.2, w: 6.0, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const petro = [
    { op: 'SIR CI – transit & manut.',  vol: '~480 000 T', status: '✓ ACTIF',    color: GREEN },
    { op: 'FOXTROT – export offshore',  vol: '~160 000 T', status: '✓ ACTIF',    color: GREEN },
    { op: 'TOTAL CI – consign. tankers',vol: '~320 000 T', status: 'PARTIEL',     color: ORANGE },
    { op: 'VIVO ENERGY',                vol: '~280 000 T', status: 'PARTIEL',     color: ORANGE },
    { op: 'PETRO IVOIRE',               vol: '~190 000 T', status: '✗ NON CAPTÉ', color: RED },
    { op: 'ORYX CI',                    vol: '~140 000 T', status: '✗ NON CAPTÉ', color: RED },
  ];
  petro.forEach((p, i) => {
    const ry = 1.52 + i * 0.58;
    s.addShape(pptx.ShapeType.rect, { x:7.1, y:ry, w:6.0, h:0.5, fill:{color:'F8F9FA'}, line:{color:'E5E7EB',width:0.3} });
    s.addText(p.op, { x:7.2, y:ry+0.06, w:2.8, h:0.38, fontSize:9, color:DGRAY, fontFace:'Calibri' });
    s.addText(p.vol, { x:10.05, y:ry+0.06, w:1.3, h:0.38, fontSize:9, color:MGRAY, align:'center', fontFace:'Calibri' });
    s.addText(p.status, { x:11.4, y:ry+0.06, w:1.65, h:0.38, fontSize:9, bold:true, color:p.color, align:'right', fontFace:'Calibri' });
  });
  addInsightBox(s, 0.15, 5.4, 12.9, 0.85, '🎯',
    ['CIBLE PÉTROLE : PDM AGL secteur ~4,2%. Présence établie sur SIR CI et Foxtrot. Potentiel non capté : ~330 000 T chez Petro Ivoire + Oryx = +4 pts de PDM secteur. Plan d\'approche commercial S2 2026 recommandé (offre intégrée DSM + transit).']
  );
}

// ─── SLIDE 29 – FOCUS MINIER (CI) ────────────────────────────────────────────
// Source : lib/pptx/data/mining_clients.json — Master-list fournie par Olivier.
const miningData = window.__MINING_DATA__;

{
  const s = pptx.addSlide();
  addHeader(s, 'FOCUS SECTORIEL – MINIER  |  Master-list Côte d\'Ivoire',
    `Clients miniers à suivre dans les stats AGL  |  ${miningData.ci.length} comptes CI  |  Or · Manganèse · Nickel · Lithium`);
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.29');

  s.addText('Master-list Mining CI – à croiser systématiquement avec STATCOM / IRIS / GSL', {
    x: 0.25, y: 1.2, w: 12.9, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });

  const half = Math.ceil(miningData.ci.length / 2);
  const ciCol1 = miningData.ci.slice(0, half).map((c, i) => [
    `#${i + 1}`, c.name, c.metier_principal, c.flux,
  ]);
  const ciCol2 = miningData.ci.slice(half).map((c, i) => [
    `#${half + i + 1}`, c.name, c.metier_principal, c.flux,
  ]);

  addRankTable(s, 0.15, 1.55, 6.35,
    ['#', 'Client CI', 'Métiers', 'Flux'],
    ciCol1
  );
  addRankTable(s, 6.65, 1.55, 6.35,
    ['#', 'Client CI', 'Métiers', 'Flux'],
    ciCol2
  );

  addInsightBox(s, 0.15, 5.55, 12.9, 0.95, '🏆',
    [`POSITION AGL : ${miningData.ci.length} clients miniers CI à tracker — TIM dominant (matériels, consommables, drilling) + AER (Bureau Veritas, Endeavour Aviation). Cibles d'enrichissement : SAMA Nickel + Lithium CI absents de la master-list = relai prospection 2026. Stratégie : package minier intégré TIM + AÉRIEN + DSM + HINTERLAND avec contrat-cadre par groupe (Endeavour, Montage Gold).`]
  );
}

// ─── SLIDE 29B – FOCUS MINIER (HINTERLAND BF + MALI) ─────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'FOCUS SECTORIEL – MINIER  |  Hinterland Burkina Faso & Mali',
    `Clients miniers hinterland à suivre  |  ${miningData.hinterland_bf.length} comptes BF + ${miningData.hinterland_mali.length} comptes MALI  |  Corridor Abidjan → Ouaga / Bamako`);
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.29b');

  s.addText(`Hinterland Burkina Faso (${miningData.hinterland_bf.length} clients)`, {
    x: 0.25, y: 1.2, w: 6.35, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 6.35,
    ['#', 'Client BF', 'Activité / Mine'],
    miningData.hinterland_bf.map((c, i) => [`#${i + 1}`, c.name, c.flux])
  );

  s.addText(`Hinterland Mali (${miningData.hinterland_mali.length} clients)`, {
    x: 6.65, y: 1.2, w: 6.35, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 6.65, 1.5, 6.35,
    ['#', 'Client MALI', 'Activité / Mine'],
    miningData.hinterland_mali.map((c, i) => [`#${i + 1}`, c.name, c.flux])
  );

  // KPI ventilation
  s.addText('Ventilation Master-list Mining', {
    x: 6.65, y: 4.5, w: 6.35, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addSegmentBars(s, 6.65, 4.8, [
    { label: 'Côte d\'Ivoire',          vol: `${miningData.ci.length} clients`, pdm: Math.round((miningData.ci.length / miningData.totals.total_master_list) * 100) },
    { label: 'Hinterland Burkina Faso', vol: `${miningData.hinterland_bf.length} clients`, pdm: Math.round((miningData.hinterland_bf.length / miningData.totals.total_master_list) * 100) },
    { label: 'Hinterland Mali',         vol: `${miningData.hinterland_mali.length} clients`, pdm: Math.round((miningData.hinterland_mali.length / miningData.totals.total_master_list) * 100) },
  ]);

  addInsightBox(s, 0.15, 5.55, 6.35, 0.95, '🎯',
    [`STRATÉGIE HINTERLAND : ${miningData.hinterland_bf.length + miningData.hinterland_mali.length} clients à conquérir via corridor Abidjan-Ouaga/Bamako. Concentrations : Endeavour Mining (Houndé, Wahgnion, Mana via Semafo), Iamgold (Essakane), Orezone (Bombore). Leviers : trains hinterland AGL + transit douanier optimisé + co-loading matériels lourds (Samsung, Byrnecut, UMS).`]
  );
}

// ─── SLIDE 30 – FOCUS AYMAN ──────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'FOCUS TRANSITAIRE – GROUPE AYMAN  |  Synthèse multi-métiers',
    'Analyse toutes activités (incl. DJAM DKS TRANSIT & HANNYYAH ET SAID)  |  Concurrence directe AGL  |  Jan–Mai 2026');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.30');

  s.addText('Activité AYMAN par métier vs position AGL – Jan–Mai 2026', {
    x: 0.25, y: 1.2, w: 12.9, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  addRankTable(s, 0.15, 1.5, 12.9,
    ['Métier','Rang Ayman','Volume Ayman','PDM Ayman','Rang AGL','PDM AGL','Écart AGL'],
    [
      ['TIM – Import Maritime','#5','10 862 TEU (DJAM DKS)','5,6 %','#1','7,8 %','+2,2 pts'],
      ['TEM – Export Maritime','Non classé','~800 TEU','~0,6 %','#1','26,2 %','+25,6 pts'],
      ['Hinterland Import','~#12','~400 TEU','~1,4 %','#3','11,3 %','+9,9 pts'],
      ['Hinterland Export','Non présent','—','—','#1','66,1 %','—'],
      ['Aérien Import','#7','273 092 kg (HANNYYAH)','4,9 %','#1','20,8 %','+15,9 pts'],
      ['DSM – Tramps','~#8','~3 900 T','4,2 %','#3','~11 %','+6,8 pts'],
    ]
  );
  addInsightBox(s, 0.15, 4.85, 12.9, 1.05, '⚠',
    ['SURVEILLANCE : AYMAN est le concurrent à plus forte croissance (+18% en 2026). Présent dans le TOP 5 sur TIM (#5 via DJAM DKS) et Aérien (#7 via HANNYYAH ET SAID). AGL domine sur tous les métiers, mais l\'écart TIM n\'est que de +2,2 pts.']
  );
}

// ─── SLIDE 31 – AYMAN ANALYSE DÉTAILLÉE ──────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'FOCUS AYMAN – ANALYSE DÉTAILLÉE  |  Forces & Réponse AGL',
    'Profil concurrentiel  |  Face-à-face par segment  |  Recommandations');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.31');

  s.addText('Profil du Groupe AYMAN', {
    x: 0.25, y: 1.2, w: 5.5, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const profilRows = [
    ['Création','~2015 — croissance organique rapide'],
    ['Cœur de métier','TIM (fret maritime import) + fret aérien'],
    ['Réseau','Abidjan + filiales Mali, Sénégal'],
    ['Clientèle clé','PME-PMI importatrices, tech & télécoms'],
    ['Avantages','Réactivité, tarifs agressifs, digitalisation'],
    ['Croissance','+18 % volumes 2026 vs 2025'],
  ];
  const rH = 0.38;
  profilRows.forEach((row, i) => {
    const ry = 1.52 + i * rH;
    s.addShape(pptx.ShapeType.rect, { x:0.15, y:ry, w:5.5, h:rH, fill:{color:i%2===0?WHITE:'F8F9FA'}, line:{color:'E5E7EB',width:0.3} });
    s.addText(row[0], { x:0.2, y:ry+0.06, w:1.4, h:rH-0.1, fontSize:9, bold:true, color:NAVY, fontFace:'Calibri' });
    s.addText(row[1], { x:1.65, y:ry+0.06, w:3.8, h:rH-0.1, fontSize:9, color:DGRAY, fontFace:'Calibri' });
  });

  s.addText('Face-à-face par segment : Ayman vs AGL', {
    x: 5.85, y: 1.2, w: 7.3, h: 0.28, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri'
  });
  const faceRows = [
    { seg:'TIM – MACHINES / ÉLECTRO', ayVal:18, aglVal:11, winner:'AYMAN' },
    { seg:'AÉRIEN – PIÈCES DÉTACHÉES', ayVal:12, aglVal:8, winner:'AYMAN' },
    { seg:'AÉRIEN – TECH / TÉLÉCOMS', ayVal:15, aglVal:33, winner:'AGL' },
    { seg:'TIM – MAT. CONSTRUCTION',  ayVal:10, aglVal:18, winner:'AGL' },
    { seg:'TRAMPS – BRBK',            ayVal:8,  aglVal:18, winner:'AGL' },
  ];
  faceRows.forEach((row, i) => {
    const ry = 1.52 + i * 0.72;
    s.addShape(pptx.ShapeType.rect, { x:5.85, y:ry, w:7.3, h:0.65, fill:{color:'F8F9FA'}, line:{color:'E5E7EB',width:0.3} });
    s.addText(row.seg, { x:5.95, y:ry+0.04, w:4.5, h:0.3, fontSize:9, bold:true, color:DGRAY, fontFace:'Calibri' });
    s.addText(`Ay ~${row.ayVal}%  vs  AGL ${row.aglVal}%`, { x:5.95, y:ry+0.32, w:4.5, h:0.28, fontSize:9, color:MGRAY, fontFace:'Calibri' });
    const wc = row.winner === 'AGL' ? GREEN : ORANGE;
    s.addText(row.winner, { x:10.5, y:ry+0.12, w:2.55, h:0.38, fontSize:14, bold:true, color:wc, align:'right', valign:'middle', fontFace:'Calibri' });
  });

  addInsightBox(s, 0.15, 5.35, 12.9, 1.05, '🎯',
    ['RÉPONSE AGL : 1) Tarification ciblée Machines / Électronique (TIM). 2) Service premium Pièces Détachées avec engagement délais (Aérien). 3) Verrouillage des clients communs (SITAB, importateurs télécoms) par contrats cadres. 4) Surveillance trimestrielle des volumes DJAM DKS et HANNYYAH.']
  );
}

// ─── SLIDE 32 – SÉPARATEUR ACTIONS STRATÉGIQUES ───────────────────────────────
addSeparator('06', 'ACTIONS STRATÉGIQUES PRIORITAIRES', 'Synthèse transversale  |  6 axes  |  Horizon 12 mois');

// ─── SLIDE 33 – SYNTHÈSE FINALE ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  addHeader(s, 'SYNTHÈSE – PARTS DE MARCHÉ AGL PAR MÉTIER', '');
  addFooter(s, 'Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.21');

  const rows = [
    { label:'HINTERLAND EXPORT', sub:'4 294 TEU  |  AGL : 2 840 TEU', pdm:66.1, rang:'#1 ABSOLU', status:'LEADER',        statusColor:GREEN,  barColor:GREEN },
    { label:'TRANSIT EXPORT MAR.',sub:'137 283 TEU  |  AGL : 35 972 TEU', pdm:26.2, rang:'#1 – ×4,7 le 2ème', status:'DOMINANT',       statusColor:GREEN,  barColor:GREEN },
    { label:'AÉRIEN IMPORT',      sub:'5 603 T  |  AGL : 1 166 T',    pdm:20.8, rang:'#1 ABSOLU', status:'EN HAUSSE',       statusColor:GREEN,  barColor:GREEN },
    { label:'HINTERLAND IMPORT',  sub:'28 457 TEU  |  AGL : 3 214 TEU',pdm:11.3, rang:'#3',       status:'À RENFORCER',    statusColor:ORANGE, barColor:ORANGE },
    { label:'TRANSIT IMPORT MAR.',sub:'193 989 TEU  |  AGL : 15 133 TEU',pdm:7.8, rang:'#1 FRAGILE', status:'SOUS PRESSION', statusColor:ORANGE, barColor:ORANGE },
  ];

  const rowH = 1.1, startY = 1.15, maxBarW = 7.5;
  const maxPdm = 66.1;

  rows.forEach((r, i) => {
    const y = startY + i * rowH;
    // Fond carte
    s.addShape(pptx.ShapeType.rect, { x:0.15, y, w:12.9, h:rowH-0.08, fill:{color:'F0F4F8'}, line:{color:'E2E8F0',width:0.5} });
    // Label + sous-texte
    s.addText(r.label, { x:0.3, y:y+0.12, w:3.0, h:0.38, fontSize:13, bold:true, color:NAVY, fontFace:'Calibri' });
    s.addText(r.sub,   { x:0.3, y:y+0.52, w:3.0, h:0.28, fontSize:9,  color:MGRAY, fontFace:'Calibri' });
    // Barre fond
    const barX = 3.4;
    s.addShape(pptx.ShapeType.rect, { x:barX, y:y+0.28, w:maxBarW, h:0.38, fill:{color:'D1D5DB'}, line:{type:'none'} });
    // Barre valeur
    const bw = (r.pdm / maxPdm) * maxBarW;
    s.addShape(pptx.ShapeType.rect, { x:barX, y:y+0.28, w:bw, h:0.38, fill:{color:r.barColor}, line:{type:'none'} });
    // Valeur PDM
    s.addText(`${r.pdm} %`, { x:barX+bw+0.1, y:y+0.2, w:1.2, h:0.52, fontSize:20, bold:true, color:r.barColor, valign:'middle', fontFace:'Calibri' });
    // Badge statut
    s.addShape(pptx.ShapeType.rect, { x:11.1, y:y+0.08, w:1.85, h:0.32, fill:{color:r.statusColor}, line:{type:'none'} });
    s.addText(r.status, { x:11.1, y:y+0.08, w:1.85, h:0.32, fontSize:9, bold:true, color:WHITE, align:'center', valign:'middle', fontFace:'Calibri' });
    // Rang
    s.addText(r.rang, { x:11.1, y:y+0.48, w:1.85, h:0.28, fontSize:9, color:r.statusColor, bold:true, align:'center', fontFace:'Calibri' });
  });

  // Bande finale résumé
  s.addShape(pptx.ShapeType.rect, { x:0.15, y:6.72, w:12.9, h:0.32, fill:{color:NAVY}, line:{type:'none'} });
  s.addText(
    '3 métiers sur 5 en position #1  |  TIM leader fragile (+558 TEU)  |  Hint.Imp. seul segment à conquérir (#3)  |  Aérien : montée en puissance historique',
    { x:0.25, y:6.72, w:12.7, h:0.32, fontSize:9, color:WHITE, align:'center', valign:'middle', fontFace:'Calibri' }
  );
}

// ─── RETURN BUFFER ───────────────────────────────────────────────────────────
  return pptx.write({ outputType: 'blob' });
}

window.generateStudyBuffer = generateStudyBuffer;
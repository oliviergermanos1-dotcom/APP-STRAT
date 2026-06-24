"""Comité de Direction — PPTX generator (python-pptx, runs in Pyodide).

The pptxgenjs library produces files that Olivier's PowerPoint Desktop
(AGL enterprise GPO) refuses to open. python-pptx output works. This
module reproduces the 43-slide deck described in docs/generator.js using
python-pptx natively, plus injects the AGL Microsoft Information
Protection sensitivity label so the file complies with AGL policy.

Entry point (called by docs/py-generator.js after Pyodide boots):
    PPTX_BYTES = build(globals().get('STUDY_JSON', '{}'))
"""

# ────────────────────────────────────────────────────────────────────────────
# Imports & constants
# ────────────────────────────────────────────────────────────────────────────
import io
import json
import re
import zipfile

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION


# ── AGL charte ──────────────────────────────────────────────────────────────
NAVY    = RGBColor(0x0D, 0x22, 0x43)
GOLD    = RGBColor(0xC9, 0xA8, 0x4C)
WHITE   = RGBColor(0xFF, 0xFF, 0xFF)
GREEN   = RGBColor(0x1A, 0x7C, 0x4F)
ORANGE  = RGBColor(0xE0, 0x5A, 0x00)
BLUE2   = RGBColor(0x25, 0x63, 0xA8)
LGRAY   = RGBColor(0xF0, 0xF2, 0xF5)
DGRAY   = RGBColor(0x37, 0x41, 0x51)
MGRAY   = RGBColor(0x6B, 0x72, 0x80)
LBLUE   = RGBColor(0xEB, 0xF0, 0xF8)
RED     = RGBColor(0xCC, 0x22, 0x00)
TEAL    = RGBColor(0x0E, 0x74, 0x90)
WMARK   = RGBColor(0x1A, 0x2E, 0x4A)
EBORDER = RGBColor(0xE5, 0xC9, 0x7A)
EYELLOW = RGBColor(0xFF, 0xFB, 0xEC)
EROW    = RGBColor(0xF8, 0xF9, 0xFA)
EGREEN  = RGBColor(0xF0, 0xFD, 0xF4)
ERED    = RGBColor(0xFE, 0xF2, 0xF2)
EHL     = RGBColor(0xFF, 0xF9, 0xEC)
LINE_GR = RGBColor(0xE5, 0xE7, 0xEB)
LINE_DK = RGBColor(0xD1, 0xD5, 0xDB)

# Slide layout (LAYOUT_WIDE = 13.33" × 7.5")
SLIDE_W = Inches(13.33)
SLIDE_H = Inches(7.5)


# ────────────────────────────────────────────────────────────────────────────
# Primitive helpers (rect + text)
# ────────────────────────────────────────────────────────────────────────────
def _in(v):
    """Inches() shortcut tolerant of int/float."""
    return Inches(v)


def _rect(slide, x, y, w, h, fill=None, line=None, line_width=None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        if line_width is not None:
            s.line.width = Pt(line_width)
    s.shadow.inherit = False
    return s


def _txt(slide, x, y, w, h, text,
         size=12, bold=False, italic=False, color=NAVY,
         align='left', valign='top', wrap=True, font='Calibri'):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.margin_left = tf.margin_right = Emu(36000)
    tf.margin_top = tf.margin_bottom = Emu(18000)
    tf.word_wrap = wrap
    if valign == 'middle':
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    elif valign == 'bottom':
        tf.vertical_anchor = MSO_ANCHOR.BOTTOM
    # Multi-line support via \n
    lines = str(text).split('\n')
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if align == 'center':
            p.alignment = PP_ALIGN.CENTER
        elif align == 'right':
            p.alignment = PP_ALIGN.RIGHT
        r = p.add_run()
        r.text = line
        r.font.name = font
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        if isinstance(color, RGBColor):
            r.font.color.rgb = color
    return box


# ────────────────────────────────────────────────────────────────────────────
# Composite helpers (header / footer / kpi bar / tables / charts / etc.)
# ────────────────────────────────────────────────────────────────────────────
def add_header(s, title, subtitle=None):
    _rect(s, 0, 0, SLIDE_W, _in(1.1), fill=NAVY)
    _txt(s, _in(0.25), _in(0.05), _in(13), _in(0.55),
         title, size=22, bold=True, color=WHITE)
    if subtitle:
        _txt(s, _in(0.25), _in(0.6), _in(12.5), _in(0.4),
             subtitle, size=12, italic=True, color=GOLD)


def add_footer(s, text):
    _txt(s, _in(0.2), _in(7.2), _in(10), _in(0.25),
         text, size=9, color=MGRAY)
    _txt(s, _in(12.5), _in(7.15), _in(0.7), _in(0.3),
         'AGL', size=10, bold=True, color=GOLD, align='right')


def add_kpi_bar(s, kpis, y=1.2):
    """kpis = [{'label','value','sub','color'?,'big'?}, ...]"""
    W = 13.33
    n = len(kpis)
    cw = (W - 0.3) / n
    for i, k in enumerate(kpis):
        x = 0.15 + i * cw
        _rect(s, _in(x), _in(y), _in(cw - 0.1), _in(0.95),
              fill=LGRAY, line=LINE_DK, line_width=0.5)
        _txt(s, _in(x), _in(y + 0.05), _in(cw - 0.1), _in(0.22),
             k['label'].upper(), size=8, color=MGRAY, align='center')
        _txt(s, _in(x), _in(y + 0.24), _in(cw - 0.1), _in(0.42),
             k['value'],
             size=26 if k.get('big') else 22,
             bold=True, color=k.get('color', NAVY), align='center')
        if k.get('sub'):
            _txt(s, _in(x), _in(y + 0.68), _in(cw - 0.1), _in(0.22),
                 k['sub'], size=8.5, color=MGRAY, align='center')


def add_rank_table(s, x, y, w, headers, rows, highlight_row=0, first_col_mode=None):
    """Tableau classement. firstColMode: 'rank' or 'wide' (auto-detected from header[0])."""
    row_h = 0.28
    h0 = str(headers[0]).strip()
    auto_rank = bool(re.match(r'^(rang|#|n[°o]\b|num)', h0, re.I))
    mode = first_col_mode or ('rank' if auto_rank else 'wide')
    n_cols = len(headers)
    if mode == 'rank':
        col_w = [0.45] + [(w - 0.45) / (n_cols - 1)] * (n_cols - 1)
    else:
        col_w = [w / n_cols] * n_cols
    name_col_idx = 1 if mode == 'rank' else 0

    # Header bar
    _rect(s, _in(x), _in(y), _in(w), _in(row_h), fill=NAVY)
    cx = x
    for i, h in enumerate(headers):
        _txt(s, _in(cx + 0.04), _in(y + 0.04), _in(col_w[i] - 0.05), _in(row_h - 0.06),
             str(h), size=8.5, bold=True, color=WHITE,
             align=('left' if i == name_col_idx else 'center'),
             valign='middle', wrap=False)
        cx += col_w[i]

    # Rows
    for ri, row in enumerate(rows):
        ry = y + (ri + 1) * row_h
        is_hl = (ri == highlight_row)
        bg = EHL if is_hl else (WHITE if ri % 2 == 0 else EROW)
        _rect(s, _in(x), _in(ry), _in(w), _in(row_h),
              fill=bg, line=LINE_GR, line_width=0.3)
        cx2 = x
        for ci, cell in enumerate(row):
            is_agl_row = (ri == 0 and ci == name_col_idx)
            is_last_hl = is_hl and ci == len(row) - 1
            color = GREEN if (is_agl_row or is_last_hl) else DGRAY
            _txt(s, _in(cx2 + 0.04), _in(ry + 0.04),
                 _in(col_w[ci] - 0.05), _in(row_h - 0.06),
                 str(cell), size=8.5,
                 bold=(is_hl and ci == name_col_idx),
                 color=color,
                 align=('left' if ci == name_col_idx else 'center'),
                 valign='middle', wrap=False)
            cx2 += col_w[ci]


def add_segment_bars(s, x, y, segments):
    """Barres horizontales PDM par segment."""
    max_bar = 2.55
    row_h = 0.42
    for i, seg in enumerate(segments):
        ry = y + i * row_h
        pdm = float(seg.get('pdm', 0))
        bar_w = max(0.06, (pdm / 100.0) * max_bar)
        bar_color = (GREEN if pdm >= 50 else
                     BLUE2 if pdm >= 20 else
                     ORANGE if pdm >= 10 else RED)
        _txt(s, _in(x), _in(ry), _in(1.8), _in(0.28),
             str(seg.get('label', '')).upper(), size=8.5, color=DGRAY)
        _txt(s, _in(x + 1.82), _in(ry), _in(0.9), _in(0.28),
             str(seg.get('vol', '')), size=8.5, color=MGRAY, align='right')
        _rect(s, _in(x + 2.8), _in(ry + 0.04), _in(max_bar), _in(0.18),
              fill=LINE_GR)
        _rect(s, _in(x + 2.8), _in(ry + 0.04), _in(bar_w), _in(0.18),
              fill=bar_color)
        _txt(s, _in(x + 2.8 + max_bar + 0.05), _in(ry), _in(0.5), _in(0.28),
             f"{int(round(pdm))}%", size=9, bold=True, color=bar_color)


def add_insight_box(s, x, y, w, h, emoji, lines, bg=EYELLOW):
    _rect(s, _in(x), _in(y), _in(w), _in(h),
          fill=bg, line=EBORDER, line_width=0.5)
    text = f"{emoji}  " + '\n'.join(str(l) for l in lines if l)
    _txt(s, _in(x + 0.1), _in(y + 0.08), _in(w - 0.2), _in(h - 0.12),
         text, size=9, color=DGRAY, wrap=True)


def add_mensuel_bars(s, x, y, mois, valeurs, seuil=7.5):
    row_h = 0.58
    max_bar = 2.8
    clean = [round(float(v or 0), 1) for v in valeurs]
    max_v = max(clean + [0.0001])
    for i, m in enumerate(mois):
        ry = y + i * row_h
        v = clean[i] if i < len(clean) else 0
        bw = max(0.02, (v / max_v) * max_bar)
        bc = GREEN if v >= seuil else ORANGE
        _rect(s, _in(x), _in(ry), _in(6.0), _in(row_h - 0.06),
              fill=RGBColor(0xF8, 0xFA, 0xFC), line=LINE_GR, line_width=0.3)
        _txt(s, _in(x + 0.12), _in(ry + 0.14), _in(0.85), _in(0.3),
             str(m)[:8], size=11, color=DGRAY, wrap=False)
        _rect(s, _in(x + 1.05), _in(ry + 0.14), _in(max_bar), _in(0.22),
              fill=LINE_DK)
        _rect(s, _in(x + 1.05), _in(ry + 0.14), _in(bw), _in(0.22), fill=bc)
        label = f"{v:.1f}".replace('.', ',') + ' %'
        _txt(s, _in(x + 1.05 + max_bar + 0.08), _in(ry + 0.1),
             _in(0.95), _in(0.3),
             label, size=11, bold=True, color=bc, valign='middle', wrap=False)


def add_bar_chart(s, x, y, w, h, series, colors=None):
    """series = [{'name','labels','values'}, ...]"""
    if not series:
        return
    cd = CategoryChartData()
    cd.categories = list(series[0]['labels'])
    for sr in series:
        cd.add_series(sr['name'], list(sr['values']))
    chart = s.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        _in(x), _in(y), _in(w), _in(h), cd
    ).chart
    chart.has_title = False
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.BOTTOM
    chart.legend.include_in_layout = False
    chart.legend.font.size = Pt(9)
    # Series colors
    palette = colors or [NAVY, GOLD]
    for i, plot_series in enumerate(chart.plots[0].series):
        fill = plot_series.format.fill
        fill.solid()
        fill.fore_color.rgb = palette[i % len(palette)]
    # Axis font size
    try:
        chart.value_axis.tick_labels.font.size = Pt(8)
        chart.category_axis.tick_labels.font.size = Pt(8)
    except Exception:
        pass


def add_pie_chart(s, x, y, w, h, labels, values):
    cd = CategoryChartData()
    cd.categories = list(labels)
    cd.add_series('Mix', list(values))
    chart = s.shapes.add_chart(
        XL_CHART_TYPE.PIE, _in(x), _in(y), _in(w), _in(h), cd
    ).chart
    chart.has_title = False
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.RIGHT
    chart.legend.font.size = Pt(8)
    # Color the slices via theme palette
    palette = [NAVY, GOLD, BLUE2, GREEN, ORANGE, TEAL, RED,
               RGBColor(0x9C, 0xA3, 0xAF), LINE_DK]
    for i, pt in enumerate(chart.plots[0].series[0].points):
        fill = pt.format.fill
        fill.solid()
        fill.fore_color.rgb = palette[i % len(palette)]
    # Data labels in percent — must enable first
    chart.plots[0].has_data_labels = True
    dlbls = chart.plots[0].data_labels
    dlbls.show_percentage = True
    dlbls.show_value = False
    dlbls.show_category_name = False
    dlbls.font.size = Pt(9)
    dlbls.font.color.rgb = WHITE


# ────────────────────────────────────────────────────────────────────────────
# Separator slides
# ────────────────────────────────────────────────────────────────────────────
def add_separator(prs, num, title, subtitle):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=NAVY)
    _txt(s, _in(3.5), _in(0.5), _in(6), _in(4), num,
         size=200, bold=True, color=WMARK, align='center')
    _rect(s, _in(2.565), _in(3.85), _in(8.2), _in(0.065), fill=GOLD)
    _txt(s, _in(0.4), _in(2.9), _in(12.5), _in(1.0),
         title, size=38, bold=True, color=WHITE, align='center')
    _txt(s, _in(0.4), _in(4.0), _in(12.5), _in(0.5),
         subtitle, size=16, italic=True, color=GOLD, align='center')
    _txt(s, _in(2), _in(7.1), _in(9), _in(0.28),
         'Africa Global Logistics – Étude de Marché 2026',
         size=9, color=MGRAY, align='center')
    _txt(s, _in(12.5), _in(7.08), _in(0.7), _in(0.32),
         'AGL', size=10, bold=True, color=GOLD, align='right')
    return s


def add_brand_separator(prs, code, title, subtitle):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=NAVY)
    _rect(s, _in(2.565), _in(3.85), _in(8.2), _in(0.065), fill=GOLD)
    _txt(s, _in(0.4), _in(2.2), _in(12.5), _in(1.0),
         code, size=72, bold=True, color=WMARK, align='center')
    _txt(s, _in(0.4), _in(2.9), _in(12.5), _in(1.0),
         title, size=28, bold=True, color=WHITE, align='center')
    _txt(s, _in(0.4), _in(4.05), _in(12.5), _in(0.5),
         subtitle, size=14, italic=True, color=GOLD, align='center')
    _txt(s, _in(2), _in(7.1), _in(9), _in(0.28),
         'Africa Global Logistics – Étude de Marché 2026',
         size=9, color=MGRAY, align='center')
    _txt(s, _in(12.5), _in(7.08), _in(0.7), _in(0.32),
         'AGL', size=10, bold=True, color=GOLD, align='right')
    return s


# ────────────────────────────────────────────────────────────────────────────
# Data adapter (Python port of docs/data-adapter.js)
# ────────────────────────────────────────────────────────────────────────────
MONTHS_FR_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']


def fmt_int(v):
    try:
        return f"{int(round(float(v))):,}".replace(',', ' ')
    except Exception:
        return '0'


def fmt_pdm(v):
    try:
        return f"{float(v):.1f}".replace('.', ',') + ' %'
    except Exception:
        return '— %'


def find_dataset(study, metier, dataset_type):
    if not study or not isinstance(study.get('datasets'), list):
        return None
    for d in study['datasets']:
        if d.get('metier') == metier and d.get('datasetType') == dataset_type:
            return d
    return None


def is_agl(name):
    return bool(re.search(r'africa\s*global|^agl\b|^a\.?g\.?l\.?',
                          str(name or ''), re.I))


def unit_of(metier):
    if metier in ('AER', 'DSM'):
        return 'T'
    return 'TEU'


def build_overview_data(study, metier):
    concurrents = find_dataset(study, metier, 'concurrents')
    mensuel = find_dataset(study, metier, 'mensuel')
    if not concurrents or not concurrents.get('rows'):
        return None
    rows = concurrents['rows']
    name_key = 'transitaire' if 'transitaire' in rows[0] else 'nom_entite'
    market = sum(float(r.get('volume') or 0) for r in rows)
    ranked = sorted(rows, key=lambda r: -float(r.get('volume') or 0))
    agl_idx = next((i for i, r in enumerate(ranked) if is_agl(str(r.get(name_key) or ''))), -1)
    agl = ranked[agl_idx] if agl_idx >= 0 else None
    agl_vol = float(agl.get('volume') or 0) if agl else 0
    agl_pdm = (agl_vol / market) * 100 if market > 0 else 0
    top4 = sum(float(r.get('volume') or 0) for r in ranked[:4])
    top4_pdm = (top4 / market) * 100 if market > 0 else 0
    second = (ranked[1] if agl_idx == 0 and len(ranked) > 1 else
              (ranked[0] if agl_idx > 0 else None))
    ecart = agl_vol - float(second.get('volume') or 0) if (agl and second) else 0
    second_name = str(second.get(name_key) or '') if second else None
    month_labels = monthly_market = monthly_agl = monthly_pdm = None
    if mensuel and mensuel.get('rows'):
        m = mensuel['rows']
        month_labels = [str(r.get('mois') or '')[:4] for r in m]
        monthly_market = [float(r.get('volume_marche') or 0) for r in m]
        monthly_agl = [float(r.get('volume_agl') or 0) for r in m]
        monthly_pdm = [(monthly_agl[i] / monthly_market[i]) * 100 if monthly_market[i] > 0 else 0
                       for i in range(len(m))]
    return {
        'source': concurrents.get('filename', ''),
        'unit': unit_of(metier),
        'market': market, 'aglVolume': agl_vol, 'aglPdm': agl_pdm,
        'aglRank': agl_idx + 1 if agl_idx >= 0 else None,
        'secondName': second_name, 'ecart': ecart, 'top4Pdm': top4_pdm,
        'monthLabels': month_labels, 'monthlyMarket': monthly_market,
        'monthlyAgl': monthly_agl, 'monthlyPdm': monthly_pdm,
        'kpis': {
            'marche': fmt_int(market), 'agl': fmt_int(agl_vol),
            'pdm': fmt_pdm(agl_pdm),
            'ecart': ('+' if ecart >= 0 else '') + fmt_int(ecart),
            'top4': fmt_pdm(top4_pdm),
        },
    }


def build_concurrents_data(study, metier):
    concurrents = find_dataset(study, metier, 'concurrents')
    segments = find_dataset(study, metier, 'segments')
    if not concurrents or not concurrents.get('rows'):
        return None
    rows = concurrents['rows']
    name_key = 'transitaire' if 'transitaire' in rows[0] else 'nom_entite'
    ranked = sorted(rows, key=lambda r: -float(r.get('volume') or 0))
    market = sum(float(r.get('volume') or 0) for r in ranked)
    unit = unit_of(metier)
    top10 = [
        [f"#{i+1}", str(r.get(name_key) or ''),
         fmt_int(r.get('volume') or 0),
         fmt_pdm((float(r.get('volume') or 0) / market) * 100 if market > 0 else 0)]
        for i, r in enumerate(ranked[:10])
    ]
    segment_bars = None
    if segments and segments.get('rows'):
        bars = [{'label': str(r.get('segment') or ''),
                 'vol': fmt_int(r.get('volume_marche') or 0) + ' ' + unit,
                 'pdm': int(round(float(r.get('pdm_agl') or 0)))}
                for r in segments['rows']]
        segment_bars = sorted(bars, key=lambda b: -b['pdm'])[:11]
    agl_row_idx = next((i for i, r in enumerate(ranked) if is_agl(str(r.get(name_key) or ''))), -1)
    return {'source': concurrents.get('filename', ''), 'unit': unit,
            'rows': top10, 'aglRowIdx': agl_row_idx, 'segmentBars': segment_bars}


def build_clientele_data(study, metier):
    clients = find_dataset(study, metier, 'clients')
    if not clients or not clients.get('rows'):
        return None
    sorted_rows = sorted(clients['rows'], key=lambda r: -float(r.get('volume') or 0))
    agl_total = sum(float(r.get('volume') or 0) for r in sorted_rows)
    rows = [
        [str(r.get('client') or ''),
         fmt_int(r.get('volume') or 0),
         str(r.get('segment') or '—'),
         (f"{((float(r.get('volume') or 0) / agl_total) * 100):.1f}".replace('.', ',') + '%')
         if agl_total > 0 else
         (f"{float(r.get('pct_vol_agl') or 0):.1f}".replace('.', ',') + '%')]
        for r in sorted_rows[:10]
    ]
    seg_mix = {}
    for r in sorted_rows:
        seg = str(r.get('segment') or 'Autres')
        seg_mix[seg] = seg_mix.get(seg, 0) + float(r.get('volume') or 0)
    total_mix = sum(seg_mix.values())
    mix_sorted = sorted(seg_mix.items(), key=lambda kv: -kv[1])
    top8 = mix_sorted[:8]
    others = sum(v for _, v in mix_sorted[8:])
    mix_labels = [k for k, _ in top8]
    mix_values = [int(round((v / total_mix) * 100)) if total_mix > 0 else 0 for _, v in top8]
    if others > 0:
        mix_labels.append('Autres')
        mix_values.append(int(round((others / total_mix) * 100)))
    top_client = str(sorted_rows[0].get('client') or '') if sorted_rows else None
    top_client_share = (
        (f"{(float(sorted_rows[0].get('volume') or 0) / agl_total * 100):.1f}".replace('.', ',') + '%')
        if (sorted_rows and agl_total > 0) else None)
    return {'rows': rows, 'mixLabels': mix_labels, 'mixValues': mix_values,
            'topClient': top_client, 'topClientShare': top_client_share}


def build_nouveaux_full_data(study, metier):
    find = lambda t: find_dataset(study, metier, t)
    nouveaux = find('nouveaux')
    nouveaux_merch = find('nouveaux_marchandises')
    nouveaux_clients = find('nouveaux_clients')
    top_growth = find('top_growth')
    top_dest = find('top_destinataires_pdm')
    if not nouveaux or not nouveaux_merch or not nouveaux_clients:
        return None
    unit = unit_of(metier)
    return {
        'unit': unit,
        'source': nouveaux.get('filename', ''),
        'nouveauxTransitaires': [
            [str(r.get('transitaire') or ''), fmt_int(r.get('volume') or 0),
             fmt_pdm(r.get('pdm') or 0)]
            for r in nouveaux['rows'][:5]
        ],
        'nouveauxMarchandises': [
            [str(r.get('segment') or ''), fmt_int(r.get('volume_marche') or 0),
             (f"{r['pdm_agl']} %" if r.get('pdm_agl') is not None else '—')]
            for r in nouveaux_merch['rows'][:5]
        ],
        'nouveauxClients': [
            [str(r.get('client') or ''), fmt_int(r.get('volume') or 0),
             fmt_int(r.get('volume_n1_others') or 0)]
            for r in nouveaux_clients['rows'][:5]
        ],
        'topGrowth': [
            [str(r.get('segment') or ''),
             fmt_int(r.get('volume_marche') or 0),
             fmt_int(r.get('volume_n1') or 0),
             '+' + fmt_int(r.get('delta_volume') or 0),
             (f"{r['growth_pct']} %" if r.get('growth_pct') is not None else 'NEW'),
             (f"{r['pdm_agl']} %" if r.get('pdm_agl') is not None else '—')]
            for r in (top_growth['rows'] if top_growth else [])
        ],
        'topDestinataires': [
            [str(r.get('client') or '')[:32],
             fmt_int(r.get('volume') or 0),
             fmt_int(r.get('volume_agl') or 0),
             (f"{r['pdm_agl']} %" if r.get('pdm_agl') is not None else '—')]
            for r in (top_dest['rows'] if top_dest else [])
        ],
    }


def build_dsm_overview_data(study):
    ds = find_dataset(study, 'DSM', 'dsm_overview')
    if not ds or not ds.get('rows'):
        return None
    o = ds['rows'][0]
    mensuel = o.get('mensuel') or []
    month_labels = []
    for m in mensuel:
        mois = str(m.get('mois') or '')
        full = next((x for x in MONTHS_FR_FULL if x.lower().startswith(mois[:3].lower())), mois[:3])
        month_labels.append(full[:3])
    return {
        'kpis': {
            'marche': fmt_int(o.get('market') or 0),
            'agl': fmt_int(o.get('aglTonnage') or 0),
            'pdm': fmt_pdm(o.get('aglPdm') or 0),
            'rang': f"#{o['aglRank']}" if o.get('aglRank') else '—',
            'growth': (('+' if (o.get('aglGrowthPct') or 0) >= 0 else '') +
                       fmt_pdm(o['aglGrowthPct']))
                      if o.get('aglGrowthPct') is not None else '—',
        },
        'aglRank': o.get('aglRank'),
        'aglGrowthPct': o.get('aglGrowthPct'),
        'marketGrowthPct': o.get('marketGrowthPct'),
        'aglTonnageN1': fmt_int(o.get('aglTonnageN1') or 0),
        'marketN1': fmt_int(o.get('marketN1') or 0),
        'secondName': o.get('secondName'),
        'monthLabels': month_labels,
        'monthlyMarket': [m.get('volume_marche', 0) for m in mensuel],
        'monthlyAgl': [m.get('volume_agl', 0) for m in mensuel],
        'monthlyPdm': [m.get('pdm_agl', 0) for m in mensuel],
        'aglPdm': o.get('aglPdm') or 0,
    }


def build_dsm_full_data(study):
    armateurs = find_dataset(study, 'DSM', 'dsm_armateurs')
    if not armateurs or not armateurs.get('rows'):
        return None

    def t(v): return fmt_int(v or 0)
    def pct(v): return (str(v).replace('.', ',') + ' %') if v is not None else '—'
    def get(name):
        d = find_dataset(study, 'DSM', name)
        return d['rows'] if d else []

    veh_neuf = find_dataset(study, 'DSM', 'dsm_vehicules_neufs')
    veh_occ = find_dataset(study, 'DSM', 'dsm_vehicules_occasion')
    detail = (find_dataset(study, 'DSM', 'dsm_manut_detail') or {'rows': []})['rows']

    return {
        'armateurs': [[f"#{r['rang']}", r['name'], t(r['tonnage']), pct(r.get('pdm_agl'))]
                      for r in get('dsm_armateurs')],
        'manutentionnaires': [[f"#{r['rang']}", r['name'], t(r['tonnage']), pct(r.get('pdm_agl'))]
                              for r in get('dsm_manutentionnaires')],
        'consignataires': [[f"#{r['rang']}", r['name'], t(r['tonnage']), pct(r.get('pdm_marche'))]
                           for r in get('dsm_consignataires')],
        'ports': [[r['name'], t(r['tonnage']), pct(r.get('pdm_marche'))]
                  for r in get('dsm_ports')],
        'ranges': [[r['name'], t(r['tonnage']), pct(r.get('pdm_agl'))]
                   for r in get('dsm_ranges')],
        'manutDetail': detail[0] if detail else None,
        'vehNeuf': {
            'total': t((veh_neuf.get('meta') or {}).get('total', 0)) if veh_neuf else '0',
            'rows': [[f"#{r['rang']}", r['name'], t(r['tonnage']),
                      pct(r.get('pdm_marche')), pct(r.get('pdm_agl'))]
                     for r in get('dsm_vehicules_neufs')]},
        'vehOcc': {
            'total': t((veh_occ.get('meta') or {}).get('total', 0)) if veh_occ else '0',
            'rows': [[f"#{r['rang']}", r['name'], t(r['tonnage']),
                      pct(r.get('pdm_marche')), pct(r.get('pdm_agl'))]
                     for r in get('dsm_vehicules_occasion')]},
        'nouveauxArmateurs': [[r['name'], t(r['tonnage']), pct(r.get('pdm_marche'))]
                              for r in get('dsm_nouveaux_armateurs')],
        'nouvellesMarch': [[r['name'], t(r['tonnage']), pct(r.get('pdm_agl'))]
                           for r in get('dsm_nouvelles_marchandises')],
        'topGrowth': [[r['name'], t(r['tonnage']), t(r['tonnage_n1']),
                       '+' + t(r['delta']),
                       (f"{r['growth_pct']} %" if r.get('growth_pct') is not None else 'NEW'),
                       pct(r.get('pdm_agl'))] for r in get('dsm_top_growth')],
    }


def build_ayman_focus_data(study):
    ds = find_dataset(study, 'AYMAN', 'ayman_focus')
    if not ds or not ds.get('rows'):
        return None
    a = ds['rows'][0]
    return {
        'parMetier': [[m.get('metier'),
                       (f"#{m.get('ayman_rang')}" if m.get('ayman_rang') else 'NC'),
                       fmt_int(m.get('ayman_vol')) + ' ' + m.get('unit', ''),
                       (f"{m['ayman_pdm']} %" if m.get('ayman_pdm') is not None else '—'),
                       (f"{m['agl_pdm']} %" if m.get('agl_pdm') is not None else '—'),
                       (('+' if (m.get('ecart_pts') or 0) >= 0 else '') +
                        f"{m['ecart_pts']} pts") if m.get('ecart_pts') is not None else '—']
                      for m in (a.get('parMetier') or [])],
        'clients': [[c.get('name'), fmt_int(c.get('vol')), str(c.get('pct')) + ' %']
                    for c in (a.get('clients') or [])],
        'marchandises': [[m.get('name'), fmt_int(m.get('vol')), str(m.get('pct')) + ' %']
                         for m in (a.get('marchandises') or [])],
        'evolution': a.get('evolution') or [],
        'timTotalN': fmt_int(a.get('timTotalN')),
        'timTotalN1': fmt_int(a.get('timTotalN1')),
        'timGrowthPct': a.get('timGrowthPct'),
    }


# ────────────────────────────────────────────────────────────────────────────
# AGL MIP sensitivity label injector
# ────────────────────────────────────────────────────────────────────────────
AGL_LABEL_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<clbl:labelList xmlns:clbl="http://schemas.microsoft.com/office/2020/mipLabelMetadata">'
    '<clbl:label id="{fc24caf1-31f7-40c1-bde0-ca915f0156e3}" enabled="1" method="Standard" '
    'siteId="{088e9b00-ffd0-458e-bfa1-acf4c596d3cb}" contentBits="2" removed="0"/>'
    '</clbl:labelList>'
)
AGL_CUSTOM_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" '
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" '
    'name="ClassificationContentMarkingFooterLocations"><vt:lpwstr>Office Theme:3</vt:lpwstr></property>'
    '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" '
    'name="ClassificationContentMarkingFooterText"><vt:lpwstr>Sensitivity: Internal</vt:lpwstr></property>'
    '</Properties>'
)


def _fix_chart_axids(xml: str) -> str:
    """python-pptx may emit negative axId values (id(obj) mod 2^31 wraps);
    Open XML schema requires UInt32. Convert any negative integer literal
    in <c:axId val="..."/> and <c:crossAx val="..."/> to its uint32 form."""
    def repl(m):
        tag, val = m.group(1), int(m.group(2))
        # Map to a safe positive int32 range [1, 2^31-1] required by validator
        val = (abs(val) % 0x7FFFFFFE) + 1
        return f'<c:{tag} val="{val}"/>'
    xml = re.sub(r'<c:(axId|crossAx)\s+val="(-?\d+)"\s*/>', repl, xml)
    return xml


def inject_agl_label(pptx_bytes: bytes) -> bytes:
    src = zipfile.ZipFile(io.BytesIO(pptx_bytes))
    out_buf = io.BytesIO()
    out = zipfile.ZipFile(out_buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=6)
    ct = src.read('[Content_Types].xml').decode('utf-8')
    if '/docMetadata/LabelInfo.xml' not in ct:
        ct = ct.replace(
            '</Types>',
            '<Override PartName="/docMetadata/LabelInfo.xml" '
            'ContentType="application/vnd.ms-office.classificationlabels+xml"/>'
            '<Override PartName="/docProps/custom.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>'
            '</Types>')
    root_rels = src.read('_rels/.rels').decode('utf-8')
    if 'classificationlabels' not in root_rels:
        rids = [int(m.group(1)) for m in re.finditer(r'Id="rId(\d+)"', root_rels)]
        n1 = (max(rids) if rids else 0) + 1
        n2 = n1 + 1
        inject = (
            f'<Relationship Id="rId{n1}" Type="http://schemas.microsoft.com/office/2020/02/'
            f'relationships/classificationlabels" Target="docMetadata/LabelInfo.xml"/>'
            f'<Relationship Id="rId{n2}" Type="http://schemas.openxmlformats.org/officeDocument/'
            f'2006/relationships/custom-properties" Target="docProps/custom.xml"/>')
        root_rels = root_rels.replace('</Relationships>', inject + '</Relationships>')
    out.writestr('[Content_Types].xml', ct)
    out.writestr('docMetadata/LabelInfo.xml', AGL_LABEL_XML)
    existing = set(src.namelist())
    has_custom = 'docProps/custom.xml' in existing
    if not has_custom:
        out.writestr('docProps/custom.xml', AGL_CUSTOM_XML)
    for name in src.namelist():
        if name == '[Content_Types].xml':
            continue
        if name == '_rels/.rels':
            out.writestr(name, root_rels); continue
        if name == 'docProps/custom.xml':
            out.writestr(name, AGL_CUSTOM_XML); continue
        if src.getinfo(name).is_dir():
            continue
        data = src.read(name)
        # Patch chart XML to convert negative axId/crossAx → uint32 (python-pptx bug).
        if name.startswith('ppt/charts/') and name.endswith('.xml'):
            data = _fix_chart_axids(data.decode('utf-8')).encode('utf-8')
        out.writestr(name, data)
    src.close(); out.close()
    return out_buf.getvalue()


# ────────────────────────────────────────────────────────────────────────────
# Slide builders (43 slides, port of docs/generator.js)
# ────────────────────────────────────────────────────────────────────────────
def build_cover(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    _rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=NAVY)
    _rect(s, _in(0.35), _in(3.55), _in(8.5), _in(0.06), fill=GOLD)
    _txt(s, _in(0.35), _in(0.3), _in(2), _in(0.6), 'AGL', size=36, bold=True, color=WHITE)
    _txt(s, _in(0.35), _in(0.88), _in(4), _in(0.25),
         'AFRICA GLOBAL LOGISTICS', size=8, color=WHITE)
    title = study.get('title') or 'Revue Stratégique & Marketing'
    _txt(s, _in(0.35), _in(1.5), _in(8), _in(1.8), title,
         size=44, bold=True, color=WHITE)
    period = 'Reporting 2026'
    if study.get('periodStart') and study.get('periodEnd'):
        period = f"Reporting {study['periodStart']} → {study['periodEnd']}"
    _txt(s, _in(0.35), _in(3.75), _in(6), _in(0.65), period,
         size=24, bold=True, color=GOLD)
    _txt(s, _in(0.35), _in(4.65), _in(4.5), _in(1.2),
         "At the heart\nof Africa's\ntransformation",
         size=16, bold=True, color=WHITE)
    _txt(s, _in(3), _in(7.15), _in(7), _in(0.28),
         'Direction Marketing & RP  |  AGL Abidjan  |  2026',
         size=9.5, color=MGRAY, align='center')
    _txt(s, _in(12.0), _in(7.1), _in(1.2), _in(0.35),
         '2026', size=18, bold=True, color=WHITE, align='right')


def build_sommaire(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_header(s, 'SOMMAIRE', 'Analyse par métier – 5 segments + synthèses')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.2')
    cards = [
        ('01', NAVY, 'TIM – Transit Import Maritime', 'Leader #1 – PDM 7,8%'),
        ('02', GREEN, 'TEM – Transit Export Maritime', 'Dominance absolue – 26,2%'),
        ('03', ORANGE, 'Hinterland Import Maritime', '#3 → objectif #2 : 11,3%'),
        ('04', BLUE2, 'Hinterland Export Maritime', 'Leader #1 – 66,1% PDM'),
        ('05', TEAL, 'Aérien Import', '#1 ABSOLU – 20,8% PDM'),
        ('06', RGBColor(0x8B, 0x69, 0x14), 'Synthèses', 'Mining · AYMAN · Prédictions'),
    ]
    cw, ch = 4.2, 2.0
    for i, (num, col, title, desc) in enumerate(cards):
        row, c = i // 3, i % 3
        x = 0.2 + c * (cw + 0.15)
        y = 1.25 + row * (ch + 0.1)
        _rect(s, _in(x), _in(y), _in(cw), _in(ch),
              fill=RGBColor(0xF0, 0xF2, 0xF5),
              line=RGBColor(0xDD, 0xE0, 0xE4), line_width=0.5)
        _rect(s, _in(x + 0.12), _in(y + 0.15), _in(0.55), _in(0.55), fill=col)
        _txt(s, _in(x + 0.12), _in(y + 0.15), _in(0.55), _in(0.55),
             num, size=15, bold=True, color=WHITE, align='center', valign='middle')
        _txt(s, _in(x + 0.12), _in(y + 0.82), _in(cw - 0.25), _in(0.45),
             title, size=12, bold=True, color=DGRAY)
        _txt(s, _in(x + 0.12), _in(y + 1.28), _in(cw - 0.25), _in(0.55),
             desc, size=10, color=MGRAY)


# ────────── TIM (4 slides) ──────────
def build_tim_overview(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_overview_data(study, 'TIM')
    period_label = (f"{study.get('periodStart')} → {study.get('periodEnd')}"
                    if study.get('periodStart') and study.get('periodEnd') else 'Jan–Mai 2026')
    sub = (f"Marché qualifié : {live['kpis']['marche']} TEU  |  AGL : {live['kpis']['agl']} TEU  |  "
           f"PDM AGL : {live['kpis']['pdm']}") if live else \
          'Marché qualifié : 193 989 TEU  |  AGL : 15 133 TEU  |  PDM AGL : 7,8% (Leader #1)'
    add_header(s, f"TIM – VUE D'ENSEMBLE  |  {period_label}", sub)
    add_footer(s, f"Africa Global Logistics – Étude de Marché {period_label}  |  p.4")
    if live:
        ecart_color = GREEN if live['ecart'] >= 0 else RED
        kpis = [
            {'label': 'Marché qualifié', 'value': live['kpis']['marche'], 'sub': f"TEU {period_label}"},
            {'label': 'Volume AGL', 'value': live['kpis']['agl'], 'sub': f"TEU {period_label}"},
            {'label': 'PDM AGL', 'value': live['kpis']['pdm'],
             'sub': '#1 – Leader' if live['aglRank'] == 1 else f"Rang #{live['aglRank'] or '—'}",
             'color': GREEN, 'big': True},
            {'label': (f"Écart vs #2 {(live['secondName'] or '')[:18]}"
                       if live.get('secondName') else "Écart vs #2"),
             'value': live['kpis']['ecart'], 'sub': "TEU d'écart", 'color': ecart_color},
            {'label': 'Cumul PDM TOP 4', 'value': live['kpis']['top4'],
             'sub': 'leaders cumul.', 'color': BLUE2},
        ]
    else:
        kpis = [
            {'label': 'Marché qualifié', 'value': '193 989', 'sub': 'TEU Jan–Mai 2026'},
            {'label': 'Volume AGL', 'value': '15 133', 'sub': 'TEU Jan–Mai 2026'},
            {'label': 'PDM AGL', 'value': '7,8 %', 'sub': '#1 – Leader',
             'color': GREEN, 'big': True},
            {'label': 'Écart vs #2 STRACOTRANS', 'value': '+558',
             'sub': "TEU d'avance", 'color': ORANGE},
            {'label': 'Cumul PDM TOP 4', 'value': '29,1 %',
             'sub': 'AGL+STRAC+TGR+GTC', 'color': BLUE2},
        ]
    add_kpi_bar(s, kpis)

    # Bar chart left
    _txt(s, _in(0.25), _in(2.28), _in(6.5), _in(0.28),
         'Évolution mensuelle marché TIM & AGL (TEU)', size=11, bold=True, color=DGRAY)
    if live and live.get('monthlyMarket'):
        series = [
            {'name': 'Marché qualifié', 'labels': live['monthLabels'], 'values': live['monthlyMarket']},
            {'name': 'AGL', 'labels': live['monthLabels'], 'values': live['monthlyAgl']},
        ]
    else:
        labels = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai']
        series = [{'name': 'Marché qualifié', 'labels': labels, 'values': [41800, 36800, 43600, 38500, 33200]},
                  {'name': 'AGL', 'labels': labels, 'values': [3470, 2544, 3270, 3278, 2571]}]
    add_bar_chart(s, 0.15, 2.55, 6.8, 4.3, series, [NAVY, GOLD])

    # Mensuel bars right
    _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
         'PDM AGL par mois – TIM', size=11, bold=True, color=DGRAY)
    if live and live.get('monthlyPdm'):
        pdm_labels = [next((m for m in MONTHS_FR_FULL if m.startswith(l)), l)
                      for l in live['monthLabels']]
        pdm_values = live['monthlyPdm']
        seuil = live['aglPdm']
    else:
        pdm_labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai']
        pdm_values = [8.3, 6.9, 7.5, 8.5, 7.8]
        seuil = 7.5
    add_mensuel_bars(s, 7.1, 2.62, pdm_labels, pdm_values, seuil)

    # Insight
    text = (f"Données live. PDM AGL : {live['kpis']['pdm']} — rang #{live['aglRank'] or '—'}. "
            f"Cumul TOP 4 = {live['kpis']['top4']}.") if live else \
        "PDM qualifiée 7,8% vs 7,3% brut. Avance sur STRACOTRANS : +558 TEU — à consolider."
    add_insight_box(s, 7.1, 5.7, 6.0, 0.75, '✓', [text], bg=EGREEN)


def build_tim_concurrents(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_concurrents_data(study, 'TIM')
    add_header(s, 'TIM – ANALYSE CONCURRENTIELLE & SEGMENTS',
               (f"Classement live ({live['source']})  |  Top marchandises AGL"
                if live else 'Classement PDM qualifié  |  Top marchandises AGL'))
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.5')
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         'Classement Transitaires – TIM' + (' (live)' if live else ' (hors NA/SIR/SMB)'),
         size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else [
        ['#1', 'AFRICA GLOBAL LOGISTICS', '15 133', '7,8 %'],
        ['#2', 'STRACOTRANS CI', '14 575', '7,5 %'],
        ['#3', 'TGR (Transit Général Rapide)', '13 663', '7,0 %'],
        ['#4', 'GENERAL TRANSIT CI', '12 028', '6,2 %'],
        ['#5', 'DJAM DKS TRANSIT', '10 862', '5,6 %'],
        ['#6', 'GLOBAL MANUTENTION CI', '10 203', '5,3 %'],
        ['#7', 'PROFESIONNEL TRANSIT', '9 479', '4,9 %'],
        ['#8', 'AG TRANSIT CI', '6 137', '3,2 %'],
        ['#9', 'SDMA', '5 680', '2,9 %'],
        ['#10', 'SAS TRANSIT', '5 274', '2,7 %'],
    ]
    hl = live['aglRowIdx'] if live and 0 <= live['aglRowIdx'] < 10 else 0
    add_rank_table(s, 0.15, 1.5, 6.8, ['Rang', 'Transitaire', 'TEU', 'PDM'], rows, hl)
    if live:
        rank_lbl = 'leader' if live['aglRowIdx'] == 0 else '#' + str(live['aglRowIdx'] + 1)
        insight = f"TIM live : AGL {rank_lbl}."
    else:
        insight = 'Leader de justesse. Forces : Mat. Miniers (74%), Médicaments (50%), PVC (32%).'
    add_insight_box(s, 0.15, 5.45, 6.8, 0.75, '💡', [insight])

    _txt(s, _in(7.1), _in(1.2), _in(6.0), _in(0.28),
         'PDM AGL par segment – TIM', size=11, bold=True, color=DGRAY)
    segs = live['segmentBars'] if live and live.get('segmentBars') else [
        {'label': 'Matériels Miniers', 'vol': '2 231 TEU', 'pdm': 74},
        {'label': 'Médicaments', 'vol': '1 936 TEU', 'pdm': 50},
        {'label': 'PVC Résine', 'vol': '2 881 TEU', 'pdm': 32},
        {'label': 'Matér. Construction', 'vol': '5 478 TEU', 'pdm': 18},
        {'label': 'Papier & Dérivés', 'vol': '5 024 TEU', 'pdm': 15},
        {'label': 'Lait en Poudre', 'vol': '1 121 TEU', 'pdm': 14},
        {'label': 'Emballages', 'vol': '8 951 TEU', 'pdm': 12},
        {'label': 'Machines', 'vol': '4 781 TEU', 'pdm': 11},
        {'label': 'Riz', 'vol': '9 586 TEU', 'pdm': 0},
    ]
    add_segment_bars(s, 7.1, 1.52, segs)


def build_tim_clientele(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_clientele_data(study, 'TIM')
    add_header(s, 'TIM – CLIENTÈLE AGL', 'Top 10 destinataires  |  Mix marchandises')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.6')
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         'Top 10 clients AGL – TIM (Destinataires, TEU)',
         size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else [
        ['K1 MINING SA CI', '1 531', 'Matériels Miniers', '10,1%'],
        ['SITAB CI', '876', 'Cigares/Cigarettes', '5,8%'],
        ['SCCI', '790', 'PVC Résine', '5,2%'],
        ['ALLIAD CI', '687', 'Polyéthylène', '4,5%'],
        ['SOCIFAD', '480', 'Articles Divers', '3,2%'],
        ['STE PROD ALIM CONGELÉ', '418', 'Prod. Mer Congelé', '2,8%'],
        ['SONACO CI', '417', 'Cigarettes', '2,8%'],
        ["UBIPHARM CÔTE D'IVOIRE", '399', 'Médicaments', '2,6%'],
        ['SOLIBRA', '373', 'Boissons', '2,5%'],
        ['STE TRANSFO INDUS CI', '363', 'Emballages', '2,4%'],
    ]
    add_rank_table(s, 0.15, 1.5, 7.0,
                   ['Client (Destinataire)', 'TEU', 'Segment', '% Vol. AGL'], rows)
    add_insight_box(s, 0.15, 5.35, 7.0, 0.95, '⚠', [
        (f"Concentration : {live['topClient']} = {live['topClientShare']} du volume AGL TIM."
         if live else "Concentration : K1 Mining = 10,1% du volume AGL TIM."),
        "Cross-sell : SITAB, UBIPHARM, SOLIBRA = clients multi-métiers à développer."])

    _txt(s, _in(7.3), _in(1.2), _in(5.8), _in(0.28),
         'Mix marchandises AGL – TIM', size=11, bold=True, color=DGRAY)
    if live and live.get('mixLabels'):
        labels, values = live['mixLabels'], live['mixValues']
    else:
        labels = ['Mat. Miniers', 'Emballages', 'Mat. Construction', 'Médicaments',
                  'PVC Résine', 'Papier', 'Cigarettes', 'Polyéthylène', 'Autres']
        values = [16, 10, 10, 10, 9, 8, 7, 6, 24]
    add_pie_chart(s, 7.3, 1.5, 5.8, 3.7, labels, values)


def build_tim_nouveaux(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_nouveaux_full_data(study, 'TIM')
    add_header(s, 'TIM – NOUVEAUX ENTRANTS & TENDANCES',
               (f"Vrais nouveaux (croisés vs N-1) · {live['source']}" if live else
                'Transitaires entrants (rangs 11–15)  |  Nouvelles marchandises'))
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.7')
    if live:
        col_w, gap = 4.2, 0.15
        x1, x2, x3 = 0.15, 0.15 + col_w + gap, 0.15 + 2 * (col_w + gap)
        for x, title, hdrs, data in [
            (x1, 'Nouveaux transitaires (absents de N-1)', ['Transitaire', 'TEU', 'PDM'],
             live['nouveauxTransitaires']),
            (x2, 'Nouvelles marchandises (jamais vues N-1)', ['Marchandise', 'TEU marché', 'PDM AGL'],
             live['nouveauxMarchandises']),
            (x3, 'Nouveaux clients AGL — conquête', ['Destinataire', 'TEU AGL', 'TEU N-1 (autres)'],
             live['nouveauxClients']),
        ]:
            _txt(s, _in(x), _in(1.18), _in(col_w), _in(0.22),
                 title, size=9, bold=True, color=NAVY)
            add_rank_table(s, x, 1.45, col_w, hdrs, data or [['—', '—', '—']])

        y2 = 3.65
        _txt(s, _in(x1), _in(y2), _in(col_w + gap + col_w), _in(0.22),
             'Top 3 marchandises — plus forte hausse vs N-1', size=9, bold=True, color=NAVY)
        add_rank_table(s, x1, y2 + 0.27, col_w + gap + col_w,
                       ['Marchandise', 'TEU N', 'TEU N-1', 'Δ', 'Croissance', 'PDM AGL'],
                       live['topGrowth'] or [['—', '—', '—', '—', '—', '—']])
        _txt(s, _in(x3), _in(y2), _in(col_w), _in(0.22),
             'Top 5 destinataires — part AGL', size=9, bold=True, color=NAVY)
        add_rank_table(s, x3, y2 + 0.27, col_w,
                       ['Destinataire', 'TEU marché', 'TEU AGL', 'PDM AGL'],
                       (live.get('topDestinataires') or [])[:5])
        add_insight_box(s, 0.15, 5.70, 12.9, 1.40, '💡',
                        [f"📊 Synthèse nouveaux : {len(live['nouveauxTransitaires'])} transitaires · "
                         f"{len(live['nouveauxMarchandises'])} marchandises · "
                         f"{len(live['nouveauxClients'])} clients AGL."])
    else:
        _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
             'Nouveaux transitaires TIM (rangs 11–15)', size=11, bold=True, color=DGRAY)
        add_rank_table(s, 0.15, 1.5, 7.0,
                       ['Rang', 'Transitaire', 'TEU', 'PDM', 'Spécialité'],
                       [['#11', 'ATLANTIQUE TRANSIT CI', '3 820', '2,0 %', 'Plastiques'],
                        ['#12', 'WESTAFRICA LOG. CI', '3 410', '1,8 %', 'Machines'],
                        ['#13', 'IVOIRE TRANSIT RAPID', '3 180', '1,6 %', 'Chimie/Pharma'],
                        ['#14', 'CEVA LOGISTICS CI', '2 950', '1,5 %', 'Multi'],
                        ['#15', 'SOCOPHAR TRANSIT', '2 640', '1,4 %', 'Médicaments']], 3)
        add_insight_box(s, 0.15, 5.4, 12.9, 1.5, '💡',
                        ['Uploader les fichiers STATCOM (N + N-1) pour activer l\'analyse live.'])


# ────────── Generic métier slides (TEM/HIMP/HEXP/AER share patterns with TIM) ──────────
def build_metier_overview(prs, study, code, label, page_no, fallback_sub, fallback_kpis,
                          fallback_series, fallback_pdm, unit='TEU'):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_overview_data(study, code)
    sub = (f"Marché : {live['kpis']['marche']} {unit}  |  AGL : {live['kpis']['agl']} {unit}  |  "
           f"PDM : {live['kpis']['pdm']}") if live else fallback_sub
    add_header(s, f"{label} – VUE D'ENSEMBLE", sub)
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    if live:
        ecart_color = GREEN if live['ecart'] >= 0 else RED
        kpis = [
            {'label': f'Marché ({unit})', 'value': live['kpis']['marche'], 'sub': 'période'},
            {'label': f'AGL ({unit})', 'value': live['kpis']['agl'], 'sub': 'période'},
            {'label': 'PDM AGL', 'value': live['kpis']['pdm'],
             'sub': f"Rang #{live['aglRank'] or '—'}", 'color': GREEN, 'big': True},
            {'label': f"vs #2 {((live.get('secondName') or '')[:14])}",
             'value': live['kpis']['ecart'], 'sub': f"{unit} écart", 'color': ecart_color},
            {'label': 'TOP 4 cumul.', 'value': live['kpis']['top4'],
             'sub': 'leaders', 'color': BLUE2},
        ]
    else:
        kpis = fallback_kpis
    add_kpi_bar(s, kpis)

    _txt(s, _in(0.25), _in(2.28), _in(6.5), _in(0.28),
         f"Évolution mensuelle {label} & AGL ({unit})",
         size=11, bold=True, color=DGRAY)
    series = (
        [{'name': 'Marché', 'labels': live['monthLabels'], 'values': live['monthlyMarket']},
         {'name': 'AGL', 'labels': live['monthLabels'], 'values': live['monthlyAgl']}]
        if live and live.get('monthlyMarket') else fallback_series)
    add_bar_chart(s, 0.15, 2.55, 6.8, 4.3, series, [NAVY, GOLD])

    _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
         f'PDM AGL par mois – {label}', size=11, bold=True, color=DGRAY)
    pdm_labels = ([next((m for m in MONTHS_FR_FULL if m.startswith(l)), l)
                   for l in live['monthLabels']]
                  if live and live.get('monthlyPdm') else fallback_pdm[0])
    pdm_values = live['monthlyPdm'] if live and live.get('monthlyPdm') else fallback_pdm[1]
    seuil = live['aglPdm'] if live else fallback_pdm[2]
    add_mensuel_bars(s, 7.1, 2.62, pdm_labels, pdm_values, seuil)
    add_insight_box(s, 7.1, 5.7, 6.0, 0.75, '✓',
                    [(f"Données live. PDM {live['kpis']['pdm']} · rang #{live['aglRank'] or '—'}."
                      if live else f"Référence {label} — uploader STATCOM pour le live.")], bg=EGREEN)


def build_metier_concurrents(prs, study, code, label, page_no, fallback_rows, fallback_segs, unit='TEU'):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_concurrents_data(study, code)
    add_header(s, f"{label} – CONCURRENTS & SEGMENTS",
               (f"Classement live ({live['source']})" if live else 'Classement transitaires'))
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         f'Classement Transitaires – {label}', size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else fallback_rows
    hl = live['aglRowIdx'] if live and 0 <= live['aglRowIdx'] < 10 else 0
    add_rank_table(s, 0.15, 1.5, 6.8, ['Rang', 'Transitaire', unit, 'PDM'], rows, hl)
    _txt(s, _in(7.1), _in(1.2), _in(6.0), _in(0.28),
         f"PDM AGL par segment – {label}", size=11, bold=True, color=DGRAY)
    segs = live.get('segmentBars') if live else None
    add_segment_bars(s, 7.1, 1.52, segs or fallback_segs)


def build_metier_clientele(prs, study, code, label, page_no, fallback_rows,
                           fallback_mix_labels, fallback_mix_values):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_clientele_data(study, code)
    add_header(s, f"{label} – CLIENTÈLE AGL",
               'Top 10 clients  |  Mix marchandises')
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         f'Top 10 clients AGL – {label}', size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else fallback_rows
    add_rank_table(s, 0.15, 1.5, 7.0,
                   ['Client', 'Volume', 'Segment', '% AGL'], rows)
    add_insight_box(s, 0.15, 5.35, 7.0, 0.95, '⚠',
                    [(f"Concentration : {live['topClient']} = {live['topClientShare']} du volume AGL {label}."
                      if live else f"Concentration {label} : à analyser.")])
    _txt(s, _in(7.3), _in(1.2), _in(5.8), _in(0.28),
         f'Mix marchandises AGL – {label}', size=11, bold=True, color=DGRAY)
    if live and live.get('mixLabels'):
        labels, values = live['mixLabels'], live['mixValues']
    else:
        labels, values = fallback_mix_labels, fallback_mix_values
    add_pie_chart(s, 7.3, 1.5, 5.8, 3.7, labels, values)


def build_metier_nouveaux(prs, study, code, label, page_no, unit='TEU'):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_nouveaux_full_data(study, code)
    add_header(s, f"{label} – NOUVEAUX ENTRANTS & TENDANCES",
               (f"Vrais nouveaux · {live['source']}" if live else
                'Transitaires entrants  |  Nouvelles marchandises'))
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    if live:
        col_w, gap = 4.2, 0.15
        x1, x2, x3 = 0.15, 0.15 + col_w + gap, 0.15 + 2 * (col_w + gap)
        for x, title, hdrs, data in [
            (x1, 'Nouveaux transitaires (absents N-1)', ['Transitaire', unit, 'PDM'],
             live['nouveauxTransitaires']),
            (x2, 'Nouvelles marchandises', ['Marchandise', unit + ' marché', 'PDM AGL'],
             live['nouveauxMarchandises']),
            (x3, 'Nouveaux clients AGL — conquête', ['Client', f'{unit} AGL', f'{unit} N-1 (autres)'],
             live['nouveauxClients']),
        ]:
            _txt(s, _in(x), _in(1.18), _in(col_w), _in(0.22),
                 title, size=9, bold=True, color=NAVY)
            add_rank_table(s, x, 1.45, col_w, hdrs, data or [['—', '—', '—']])
        y2 = 3.65
        _txt(s, _in(x1), _in(y2), _in(col_w + gap + col_w), _in(0.22),
             'Top 3 marchandises — plus forte hausse vs N-1', size=9, bold=True, color=NAVY)
        add_rank_table(s, x1, y2 + 0.27, col_w + gap + col_w,
                       ['Marchandise', f'{unit} N', f'{unit} N-1', 'Δ', 'Croissance', 'PDM AGL'],
                       live['topGrowth'] or [['—', '—', '—', '—', '—', '—']])
        _txt(s, _in(x3), _in(y2), _in(col_w), _in(0.22),
             'Top 5 destinataires — part AGL', size=9, bold=True, color=NAVY)
        add_rank_table(s, x3, y2 + 0.27, col_w,
                       ['Client', f'{unit} marché', f'{unit} AGL', 'PDM AGL'],
                       (live.get('topDestinataires') or [])[:5])
        add_insight_box(s, 0.15, 5.70, 12.9, 1.40, '💡',
                        [f"📊 Synthèse : {len(live['nouveauxTransitaires'])} transitaires · "
                         f"{len(live['nouveauxMarchandises'])} marchandises · "
                         f"{len(live['nouveauxClients'])} clients AGL."])
    else:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        [f"Uploader les fichiers STATCOM ({code}) N + N-1 pour activer l'analyse live."])


# ────────── DSM (4 slides) ──────────
def build_dsm_overview(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    ov = build_dsm_overview_data(study)
    sub = (f"Marché : {ov['kpis']['marche']} T  |  AGL : {ov['kpis']['agl']} T  |  "
           f"PDM {ov['kpis']['pdm']}") if ov else \
        "Tonnage import maritime  |  PDM AGL consignataire"
    add_header(s, "DSM – VUE D'ENSEMBLE  |  Import maritime au poids (T)", sub)
    add_footer(s, "Africa Global Logistics – Étude de Marché 2026  |  p.dsm-1")
    if ov:
        kpis = [
            {'label': 'Marché (T)', 'value': ov['kpis']['marche'], 'sub': 'tonnage période'},
            {'label': 'AGL consignataire', 'value': ov['kpis']['agl'], 'sub': 'T', 'color': GREEN},
            {'label': 'PDM AGL', 'value': ov['kpis']['pdm'], 'sub': f"Rang {ov['kpis']['rang']}",
             'color': GREEN, 'big': True},
            {'label': 'AGL vs N-1', 'value': ov['kpis']['growth'],
             'sub': f"{ov['aglTonnageN1']} T N-1",
             'color': GREEN if (ov.get('aglGrowthPct') or 0) >= 0 else RED},
            {'label': 'Marché vs N-1',
             'value': (('+' if (ov.get('marketGrowthPct') or 0) >= 0 else '') +
                       f"{ov.get('marketGrowthPct')} %") if ov.get('marketGrowthPct') is not None else '—',
             'sub': 'marché total', 'color': BLUE2},
        ]
        add_kpi_bar(s, kpis)
        _txt(s, _in(0.25), _in(2.28), _in(6.5), _in(0.28),
             'Évolution mensuelle import & AGL (tonnes)',
             size=11, bold=True, color=DGRAY)
        if ov['monthLabels']:
            add_bar_chart(s, 0.15, 2.55, 6.8, 3.9, [
                {'name': 'Marché', 'labels': ov['monthLabels'], 'values': ov['monthlyMarket']},
                {'name': 'AGL', 'labels': ov['monthLabels'], 'values': ov['monthlyAgl']},
            ], [NAVY, GREEN])
        _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
             'PDM AGL par mois (%)', size=11, bold=True, color=DGRAY)
        add_mensuel_bars(s, 7.1, 2.62, ov['monthLabels'], ov['monthlyPdm'], ov['aglPdm'])
        add_insight_box(s, 7.1, 5.7, 6.0, 0.85, '🚢',
                        [f"AGL consignataire {ov['kpis']['rang']} avec {ov['kpis']['pdm']} du tonnage."],
                        bg=EGREEN)
    else:
        add_insight_box(s, 0.15, 1.6, 12.9, 1.2, 'ℹ',
                        ["Uploader la base TIM (import maritime) pour activer la vue d'ensemble DSM."])


def build_dsm_acteurs(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    dsm = build_dsm_full_data(study)
    add_header(s, "DSM – ACTEURS MARITIMES  |  Import maritime au poids (T)",
               "Armateurs · Manutentionnaires · Consignataires · Ports · Range")
    add_footer(s, "Africa Global Logistics – Étude de Marché 2026  |  p.26")
    if not dsm:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        ["Uploader la base TIM pour activer l'analyse DSM live."])
        return
    col_w, gap, x0 = 4.2, 0.15, 0.15
    x1, x2, x3 = x0, x0 + col_w + gap, x0 + 2 * (col_w + gap)
    yT, yTab = 1.15, 1.42
    for x, title, hdrs, data in [
        (x1, 'Armateurs au B/L (top 7) — PDM AGL', ['#', 'Armateur', 'T', 'PDM AGL'],
         dsm['armateurs'][:7]),
        (x2, 'Manutentionnaires (top 7) — PDM AGL', ['#', 'Manutentionnaire', 'T', 'PDM AGL'],
         dsm['manutentionnaires'][:7]),
        (x3, 'Consignataires (top 7) — part marché', ['#', 'Consignataire', 'T', 'PDM'],
         dsm['consignataires'][:7]),
    ]:
        _txt(s, _in(x), _in(yT), _in(col_w), _in(0.22),
             title, size=9, bold=True, color=NAVY)
        add_rank_table(s, x, yTab, col_w, hdrs, data or [['—', '—', '—', '—']])
    yR = 3.95
    _txt(s, _in(x1), _in(yR), _in(col_w), _in(0.22),
         'Ports de déchargement', size=9, bold=True, color=NAVY)
    add_rank_table(s, x1, yR + 0.27, col_w, ['Port', 'T', 'PDM'],
                   dsm['ports'][:4] or [['—', '—', '—']])
    _txt(s, _in(x2), _in(yR), _in(col_w), _in(0.22),
         'Range / origines — PDM AGL', size=9, bold=True, color=NAVY)
    add_rank_table(s, x2, yR + 0.27, col_w, ['Range', 'T', 'PDM AGL'],
                   dsm['ranges'][:4] or [['—', '—', '—']])
    md = dsm.get('manutDetail')
    title3 = (f"Détail #1 manut. ({(md.get('manutentionnaire') or '')[:22]}) — marchandise"
              if md else 'Détail manutentionnaire')
    _txt(s, _in(x3), _in(yR), _in(col_w), _in(0.22),
         title3, size=9, bold=True, color=NAVY)
    md_rows = [[r['name'], fmt_int(r['tonnage'])]
               for r in (md.get('par_marchandise') or [])[:4]] if md else [['—', '—']]
    add_rank_table(s, x3, yR + 0.27, col_w, ['Marchandise', 'T'],
                   md_rows or [['—', '—']])


def build_dsm_vehicules(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    dsm = build_dsm_full_data(study)
    sub = (f"Tonnage tous conditionnements  |  Neufs : {dsm['vehNeuf']['total']} T  |  "
           f"Occasion : {dsm['vehOcc']['total']} T") if dsm else \
        "Tonnage tous conditionnements"
    add_header(s, 'DSM – FOCUS VÉHICULES  |  Neufs & Occasion par armateur', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.27')
    if not dsm:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        ['Données live indisponibles.'])
        return
    _txt(s, _in(0.25), _in(1.2), _in(6.4), _in(0.28),
         f"Véhicules NEUFS par armateur ({dsm['vehNeuf']['total']} T)",
         size=11, bold=True, color=DGRAY)
    add_rank_table(s, 0.15, 1.5, 6.5,
                   ['#', 'Armateur', 'T', 'Part', 'PDM AGL'],
                   (dsm['vehNeuf']['rows'] or [['—', 'Aucune donnée', '—', '—', '—']])[:8])
    _txt(s, _in(6.85), _in(1.2), _in(6.4), _in(0.28),
         f"Véhicules OCCASION par armateur ({dsm['vehOcc']['total']} T)",
         size=11, bold=True, color=DGRAY)
    add_rank_table(s, 6.75, 1.5, 6.5,
                   ['#', 'Armateur', 'T', 'Part', 'PDM AGL'],
                   (dsm['vehOcc']['rows'] or [['—', 'Aucune donnée', '—', '—', '—']])[:8])


def build_dsm_nouveaux(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    dsm = build_dsm_full_data(study)
    add_header(s, 'DSM – NOUVEAUX ENTRANTS & TENDANCES  |  Au poids (T)',
               'Nouveaux armateurs · Nouvelles marchandises · Top hausses')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.28')
    if not dsm:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        ['Données live indisponibles.'])
        return
    col_w, gap = 4.2, 0.15
    x1, x2, x3 = 0.15, 0.15 + col_w + gap, 0.15 + 2 * (col_w + gap)
    for x, title, hdrs, data in [
        (x1, 'Nouveaux armateurs (absents N-1)', ['Armateur', 'T', 'PDM'],
         dsm['nouveauxArmateurs'] or [['—', '—', '—']]),
        (x2, 'Nouvelles marchandises (jamais vues N-1)', ['Marchandise', 'T', 'PDM AGL'],
         dsm['nouvellesMarch'] or [['—', '—', '—']]),
        (x3, 'Top consignataires — part marché', ['#', 'Consignataire', 'T', 'PDM'],
         dsm['consignataires'][:7]),
    ]:
        _txt(s, _in(x), _in(1.18), _in(col_w), _in(0.22),
             title, size=9, bold=True, color=NAVY)
        add_rank_table(s, x, 1.45, col_w, hdrs, data)
    yR = 3.95
    _txt(s, _in(x1), _in(yR), _in(col_w * 3 + gap * 2), _in(0.22),
         'Top 3 marchandises — plus forte hausse vs N-1 (T)',
         size=9, bold=True, color=NAVY)
    add_rank_table(s, x1, yR + 0.27, col_w * 3 + gap * 2,
                   ['Marchandise', 'T N', 'T N-1', 'Δ', 'Croissance', 'PDM AGL'],
                   dsm['topGrowth'] or [['—', '—', '—', '—', '—', '—']])
    add_insight_box(s, 0.15, 5.70, 12.9, 1.20, '💡',
                    [f"📊 {len(dsm['nouveauxArmateurs'])} nouveaux armateurs · "
                     f"{len(dsm['nouvellesMarch'])} nouvelles marchandises."])


# ────────── Mining (3 slides — uses generic builders with MINING data) ──────────
def build_mining_overview(prs, study):
    live = build_overview_data(study, 'MINING')
    build_metier_overview(
        prs, study, 'MINING', 'FOCUS MINIER', 'mining-1',
        fallback_sub='Clients miniers traités par AGL  |  Or, Manganèse, Nickel, Lithium',
        fallback_kpis=[
            {'label': 'Marché minier', 'value': '— TEU', 'sub': 'période'},
            {'label': 'Volume AGL', 'value': '— TEU', 'sub': 'période'},
            {'label': 'PDM AGL', 'value': '—', 'sub': '—', 'color': GREEN, 'big': True},
            {'label': 'Écart vs #2', 'value': '—', 'sub': 'TEU', 'color': BLUE2},
            {'label': 'TOP 4', 'value': '—', 'sub': 'leaders', 'color': BLUE2},
        ],
        fallback_series=[
            {'name': 'Marché minier', 'labels': ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai'],
             'values': [0, 0, 0, 0, 0]},
            {'name': 'AGL', 'labels': ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai'],
             'values': [0, 0, 0, 0, 0]}],
        fallback_pdm=(['Janvier', 'Février', 'Mars', 'Avril', 'Mai'], [0, 0, 0, 0, 0], 0))


def build_mining_concurrents(prs, study):
    build_metier_concurrents(
        prs, study, 'MINING', 'FOCUS MINIER – CONCURRENTS & MARCHANDISES', 'mining-2',
        fallback_rows=[['#1', 'AFRICA GLOBAL LOGISTICS', '—', '—'],
                       ['#2', '—', '—', '—']],
        fallback_segs=[{'label': 'Mat. Miniers', 'vol': '— TEU', 'pdm': 0}])


def build_mining_clientele(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    liveC = build_clientele_data(study, 'MINING')
    liveN = build_nouveaux_full_data(study, 'MINING')
    liveConc = build_concurrents_data(study, 'MINING')
    add_header(s, 'FOCUS MINIER – CLIENTÈLE & PDM AGL',
               'Top clients miniers (marché) — PDM AGL  |  Top marchandises')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.mining-3')
    if liveC or liveN:
        _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
             'Top 10 clients miniers (marché) — part AGL',
             size=11, bold=True, color=DGRAY)
        dest_rows = (liveN.get('topDestinataires') if liveN and liveN.get('topDestinataires')
                     else (liveC['rows'] if liveC else [['—', '—', '—', '—']]))
        add_rank_table(s, 0.15, 1.5, 6.6,
                       ['Client minier', 'TEU marché', 'TEU AGL', 'PDM AGL'], dest_rows)
        _txt(s, _in(7.0), _in(1.2), _in(6.2), _in(0.28),
             'Top marchandises minières — PDM AGL', size=11, bold=True, color=DGRAY)
        if liveConc and liveConc.get('segmentBars'):
            add_segment_bars(s, 7.0, 1.55, liveConc['segmentBars'][:9])
        else:
            add_insight_box(s, 7.0, 1.55, 6.2, 0.8, 'ℹ',
                            ['Marchandises minières indisponibles.'])
        lines = []
        if liveC and liveC.get('topClient'):
            lines.append(f"🏆 Top client minier AGL = {liveC['topClient']} ({liveC['topClientShare']}).")
        add_insight_box(s, 0.15, 5.55, 12.9, 1.05, '⛏',
                        lines or ['Analyse clientèle minière live.'])
    else:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        ['Uploader TIM (N + N-1) pour activer l\'analyse minière.'])


# ────────── AYMAN (3 slides) ──────────
def build_ayman_overview(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_ayman_focus_data(study)
    sub = (f"TIM {live['timTotalN']} TEU sur la période · {live['timTotalN1']} TEU N-1"
           if live else 'Volume AYMAN  |  Croissance N vs N-1')
    add_header(s, "FOCUS AYMAN – VUE D'ENSEMBLE  |  Maritime import", sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.ayman-1')
    if live and live.get('parMetier'):
        tim = next((m for m in live['parMetier'] if 'TIM' in str(m[0])), None)
        kpis = [
            {'label': 'AYMAN TIM', 'value': live['timTotalN'], 'sub': 'TEU période'},
            {'label': 'Évolution N-1', 'value': (
                ('+' if (live.get('timGrowthPct') or 0) >= 0 else '') +
                f"{live['timGrowthPct']} %") if live.get('timGrowthPct') is not None else '—',
             'sub': 'TEU N-1',
             'color': RED if (live.get('timGrowthPct') or 0) >= 0 else GREEN, 'big': True},
            {'label': 'Rang AYMAN TIM', 'value': tim[1] if tim else 'NC', 'sub': 'transitaires'},
            {'label': 'PDM AYMAN TIM', 'value': tim[3] if tim else '—', 'sub': 'du marché'},
            {'label': 'PDM AGL TIM', 'value': tim[4] if tim else '—',
             'sub': 'référence', 'color': GREEN},
        ]
        add_kpi_bar(s, kpis)
        evol = live.get('evolution') or []
        if evol:
            _txt(s, _in(0.25), _in(2.28), _in(12.9), _in(0.28),
                 'Évolution mensuelle AYMAN (TIM, TEU)',
                 size=11, bold=True, color=DGRAY)
            add_bar_chart(s, 0.15, 2.55, 12.9, 3.0,
                          [{'name': 'AYMAN TEU',
                            'labels': [e.get('mois', '') for e in evol],
                            'values': [int(round(e.get('vol', 0))) for e in evol]}],
                          [ORANGE])
        add_insight_box(s, 0.15, 5.7, 12.9, 1.2, '⚠',
                        [f"DYNAMIQUE : AYMAN {('progresse' if (live.get('timGrowthPct') or 0) >= 0 else 'recule')} "
                         f"vs N-1 ({live['timTotalN1']} → {live['timTotalN']} TEU)."])
    else:
        add_insight_box(s, 0.15, 1.6, 12.9, 1.2, 'ℹ',
                        ['Uploader STATCOM (TIM + AER) pour activer l\'analyse AYMAN.'])


def build_ayman_metiers(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_ayman_focus_data(study)
    add_header(s, 'FOCUS CONCURRENT – GROUPE AYMAN  |  Synthèse multi-métiers',
               'DJAM DKS (maritime) & HANNYYAH ET SAID (aérien)')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.ayman-2')
    if live and live.get('parMetier'):
        _txt(s, _in(0.25), _in(1.2), _in(12.9), _in(0.28),
             'Activité AYMAN par métier vs position AGL',
             size=11, bold=True, color=DGRAY)
        add_rank_table(s, 0.15, 1.5, 12.9,
                       ['Métier', 'Rang Ayman', 'Volume Ayman',
                        'PDM Ayman', 'PDM AGL', 'Écart AGL'],
                       live['parMetier'])
        add_insight_box(s, 0.15, 4.6, 12.9, 1.2, '⚠',
                        [f"SURVEILLANCE : AYMAN — TIM {live['timTotalN']} TEU sur la période.",
                         "AGL domine mais l'écart se resserre — verrouiller les clients communs."])
    else:
        _txt(s, _in(0.25), _in(1.2), _in(12.9), _in(0.28),
             'Activité AYMAN (référence)',
             size=11, bold=True, color=DGRAY)
        add_rank_table(s, 0.15, 1.5, 12.9,
                       ['Métier', 'Rang Ayman', 'Volume Ayman',
                        'PDM Ayman', 'PDM AGL', 'Écart AGL'],
                       [['TIM – Import Mar.', '#5', '10 862 TEU', '5,6 %', '7,8 %', '+2,2 pts'],
                        ['Aérien Import', '#7', '273 092 kg', '4,9 %', '20,8 %', '+15,9 pts']])
        add_insight_box(s, 0.15, 4.6, 12.9, 1.0, '⚠',
                        ['Uploader STATCOM (TIM, AER, HIMP) pour l\'analyse AYMAN live.'])


def build_ayman_detail(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_ayman_focus_data(study)
    add_header(s, 'FOCUS AYMAN – CLIENTS & MARCHANDISES  |  Maritime import',
               'Clients servis par AYMAN  |  Marchandises  |  Évolution')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.ayman-3')
    if live and (live['clients'] or live['marchandises']):
        _txt(s, _in(0.25), _in(1.2), _in(6.4), _in(0.28),
             'Top clients AYMAN (destinataires, TIM)',
             size=11, bold=True, color=DGRAY)
        add_rank_table(s, 0.15, 1.5, 6.4, ['Client', 'TEU', '% AYMAN'],
                       live['clients'] or [['—', '—', '—']])
        _txt(s, _in(6.85), _in(1.2), _in(6.4), _in(0.28),
             'Top marchandises AYMAN (TIM)',
             size=11, bold=True, color=DGRAY)
        add_rank_table(s, 6.75, 1.5, 6.4, ['Marchandise', 'TEU', '% AYMAN'],
                       live['marchandises'] or [['—', '—', '—']])
        add_insight_box(s, 0.15, 5.5, 12.9, 1.0, '🎯',
                        [f"AYMAN maritime import : {live['timTotalN']} TEU.",
                         "RÉPONSE AGL : verrouiller clients communs, surveillance trimestrielle."])
    else:
        add_insight_box(s, 0.15, 1.6, 12.9, 1.2, 'ℹ',
                        ['Uploader STATCOM pour l\'analyse détaillée AYMAN.'])


# ────────── Prediction (3 slides) ──────────
def build_prediction_signaux(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pred = study.get('prediction') or {}
    sub = (f"Sources : {pred.get('pdfCount', 0)} newsletter(s) · "
           f"AO/agréments {pred['ao']['sheet'] if pred.get('ao') else '—'}")
    add_header(s, 'PRÉDICTION – SIGNAUX DE MARCHÉ', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.signaux')
    _txt(s, _in(0.25), _in(1.2), _in(6.4), _in(0.28),
         'Secteurs les plus cités (newsletters)',
         size=11, bold=True, color=DGRAY)
    sectors = (pred.get('signals') or {}).get('sectors') or []
    if sectors:
        max_c = max((x.get('count', 0) for x in sectors), default=1) or 1
        bars = [{'label': x['name'], 'vol': f"{x['count']} cit.",
                 'pdm': int(round(x['count'] / max_c * 100))} for x in sectors[:7]]
        add_segment_bars(s, 0.15, 1.5, bars)
    else:
        add_insight_box(s, 0.15, 1.5, 6.4, 0.8, 'ℹ',
                        ['Déposer jusqu\'à 6 PDF dans la section Prédiction.'])
    _txt(s, _in(7.1), _in(1.2), _in(6.0), _in(0.28),
         'Dynamique commerciale (AO & agréments)',
         size=11, bold=True, color=DGRAY)
    if pred.get('ao'):
        ao = pred['ao']
        ao_rows = [[k, str(v)] for k, v in (ao.get('byType') or {}).items()] or [['—', '—']]
        add_rank_table(s, 7.1, 1.5, 6.0, ['Type', 'Nombre'], ao_rows)
        statuts = sorted((ao.get('statuts') or {}).items(), key=lambda kv: -kv[1])[:5]
        st_rows = [[k[:28], str(v)] for k, v in statuts] or [['—', '—']]
        _txt(s, _in(7.1), _in(3.3), _in(6.0), _in(0.28),
             'Statuts principaux', size=11, bold=True, color=DGRAY)
        add_rank_table(s, 7.1, 3.6, 6.0, ['Statut', 'Nombre'], st_rows)
    else:
        add_insight_box(s, 7.1, 1.5, 6.0, 0.8, 'ℹ',
                        ['Déposer RECAP_AO_ET_AGREMENTS pour la synthèse.'])


def build_prediction_preconisations(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pred = study.get('prediction') or {}
    P = pred.get('preconisations') or {}
    sub = (f"Horizon {P['horizon']}  |  Lecture stratégique AGL"
           if P.get('horizon') else
           'Secteurs porteurs  |  Marchandises  |  Clients cibles  |  Recommandations')
    add_header(s, 'PRÉDICTION – PRÉCONISATIONS DE POSITIONNEMENT', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.préco')
    def quad(title, x, y, color, lines):
        _rect(s, _in(x), _in(y), _in(6.35), _in(2.05),
              fill=RGBColor(0xF8, 0xF9, 0xFA), line=LINE_GR, line_width=0.5)
        _rect(s, _in(x), _in(y), _in(6.35), _in(0.32), fill=color)
        _txt(s, _in(x + 0.12), _in(y + 0.03), _in(6.1), _in(0.26),
             title, size=10, bold=True, color=WHITE, valign='middle')
        _txt(s, _in(x + 0.15), _in(y + 0.42), _in(6.05), _in(1.55),
             '\n'.join(l for l in lines if l), size=9, color=DGRAY, valign='top', wrap=True)
    quad('SECTEURS PORTEURS', 0.15, 1.18, NAVY,
         [P.get('secteurs') or '(à compléter)'])
    quad('MARCHANDISES À SURVEILLER', 6.65, 1.18, GREEN,
         [P.get('marchandises') or '(à compléter)'])
    quad('CLIENTS CIBLES', 0.15, 3.40, BLUE2,
         [P.get('clients') or '(à compléter)'])
    quad('RECOMMANDATIONS DE POSITIONNEMENT', 6.65, 3.40, GOLD,
         [P.get('recommandations') or '(à compléter)'])
    add_insight_box(s, 0.15, 5.7, 12.9, 1.2, '🧭',
                    [P.get('synthese') or
                     'SYNTHÈSE PRÉDICTIVE : croiser hausses STATCOM + signaux newsletters + pipeline AO.'])


# ────────────────────────────────────────────────────────────────────────────
# BLOCK_SEQUENCE — same order as docs/blocks.js
# ────────────────────────────────────────────────────────────────────────────
BLOCK_SEQUENCE = [
    'cover', 'sommaire',
    'sep_TIM', 'TIM_vue_ensemble', 'TIM_concurrents', 'TIM_clientele', 'TIM_nouveaux_entrants',
    'sep_TEM', 'TEM_vue_ensemble', 'TEM_segments_concurrents', 'TEM_clientele', 'TEM_nouveaux_chargeurs',
    'sep_HIMP', 'HIMP_vue_ensemble', 'HIMP_concurrents', 'HIMP_nouveaux_entrants',
    'sep_HEXP', 'HEXP_vue_ensemble', 'HEXP_nouveaux_chargeurs',
    'sep_AER', 'AER_vue_ensemble', 'AER_segments_concurrents', 'AER_clientele', 'AER_nouveaux_entrants',
    'sep_DSM', 'DSM_vue_ensemble', 'DSM_armateurs', 'DSM_manutentionnaires', 'DSM_consignataires_pol',
    'sep_divers', 'sep_mining', 'mining_overview', 'mining_concurrents', 'mining_clientele',
    'sep_ayman', 'ayman_overview', 'ayman_metiers', 'ayman_detail',
    'sep_predictions', 'prediction_signaux', 'prediction_preconisations',
    'sep_cx', 'sep_analyse_client',
]


# Fallback rows for métiers other than TIM (kept small — port can be extended)
FALLBACK_TEM_ROWS = [['#1', 'AFRICA GLOBAL LOGISTICS', '35 972', '26,2 %'],
                     ['#2', 'STRACOTRANS', '7 654', '5,6 %'],
                     ['#3', 'TGR', '6 432', '4,7 %']]
FALLBACK_HIMP_ROWS = [['#1', 'UCT', '3 893', '13,7 %'],
                      ['#2', 'SITRACOM', '3 568', '12,5 %'],
                      ['#3', 'AFRICA GLOBAL LOGISTICS', '3 214', '11,3 %']]
FALLBACK_HEXP_ROWS = [['#1', 'AFRICA GLOBAL LOGISTICS', '2 840', '66,1 %'],
                      ['#2', 'SDV', '720', '16,8 %']]
FALLBACK_AER_ROWS = [['#1', 'AFRICA GLOBAL LOGISTICS', '1 166', '20,8 %'],
                     ['#2', 'DHL', '870', '15,5 %']]
FALLBACK_KPIS = lambda label, vol, agl, pdm, rank: [
    {'label': f'Marché', 'value': vol, 'sub': 'période'},
    {'label': 'Volume AGL', 'value': agl, 'sub': 'période'},
    {'label': 'PDM AGL', 'value': pdm, 'sub': rank, 'color': GREEN, 'big': True},
    {'label': 'Écart vs #2', 'value': '—', 'sub': 'écart', 'color': BLUE2},
    {'label': 'TOP 4', 'value': '—', 'sub': 'cumul', 'color': BLUE2},
]
FALLBACK_SERIES = lambda: [
    {'name': 'Marché', 'labels': ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai'], 'values': [0, 0, 0, 0, 0]},
    {'name': 'AGL', 'labels': ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai'], 'values': [0, 0, 0, 0, 0]}]
FALLBACK_PDM = (['Janvier', 'Février', 'Mars', 'Avril', 'Mai'], [0, 0, 0, 0, 0], 0)
FALLBACK_SEGS = [{'label': '—', 'vol': '—', 'pdm': 0}]
FALLBACK_MIX = (['Catégorie A', 'Catégorie B', 'Autres'], [50, 30, 20])


SEPARATORS = {
    'sep_TIM':  ('01', 'TRANSIT IMPORT MARITIME (TIM)', '193 989 TEU  |  PDM AGL 7,8%'),
    'sep_TEM':  ('02', 'TRANSIT EXPORT MARITIME (TEM)', '137 283 TEU  |  PDM AGL 26,2%'),
    'sep_HIMP': ('03', 'HINTERLAND IMPORT MARITIME', '28 457 TEU  |  PDM AGL 11,3%'),
    'sep_HEXP': ('04', 'HINTERLAND EXPORT MARITIME', '4 294 TEU  |  PDM AGL 66,1%'),
    'sep_AER':  ('05', 'AÉRIEN IMPORT', '5 603 T  |  PDM AGL 20,8%'),
    'sep_DSM':  ('DSM', 'DIRECTION DES SOLUTIONS MARITIMES', 'Armateurs · Manut · Consignataires (poids T)'),
    'sep_divers': ('07', 'DIVERS FOCUS', 'Mining  |  AYMAN  |  Période en cours'),
    'sep_predictions': ('08', 'PRÉDICTION MARCHÉ', 'Signaux newsletters  |  AO  |  Positionnement'),
    'sep_cx':   ('09', 'EXPÉRIENCE CLIENT (CX)', 'Slides importées'),
    'sep_analyse_client': ('10', 'ANALYSE ACTIVITÉ CLIENT', 'Slides importées'),
}
BRAND_SEPARATORS = {
    'sep_mining': ('MINING', 'FOCUS MINING', 'Clients miniers traités par AGL'),
    'sep_ayman': ('AYMAN', 'FOCUS AYMAN', 'Concurrent forwarder · DJAM DKS / HANNYYAH'),
}


def dispatch_block(prs, study, key):
    """Map a BLOCK_SEQUENCE key to its slide builder."""
    if key in SEPARATORS:
        num, title, sub = SEPARATORS[key]
        add_separator(prs, num, title, sub); return
    if key in BRAND_SEPARATORS:
        code, title, sub = BRAND_SEPARATORS[key]
        add_brand_separator(prs, code, title, sub); return
    if key == 'cover':       build_cover(prs, study); return
    if key == 'sommaire':    build_sommaire(prs, study); return
    if key == 'TIM_vue_ensemble':       build_tim_overview(prs, study); return
    if key == 'TIM_concurrents':        build_tim_concurrents(prs, study); return
    if key == 'TIM_clientele':          build_tim_clientele(prs, study); return
    if key == 'TIM_nouveaux_entrants':  build_tim_nouveaux(prs, study); return

    if key == 'TEM_vue_ensemble':
        build_metier_overview(prs, study, 'TEM', 'TEM', '9',
                              'Marché : 137 283 TEU  |  AGL : 35 972 TEU  |  PDM 26,2%',
                              FALLBACK_KPIS('TEM', '137 283', '35 972', '26,2 %', '#1 incontesté'),
                              FALLBACK_SERIES(), FALLBACK_PDM); return
    if key == 'TEM_segments_concurrents':
        build_metier_concurrents(prs, study, 'TEM', 'TEM', '10',
                                 FALLBACK_TEM_ROWS, FALLBACK_SEGS); return
    if key == 'TEM_clientele':
        build_metier_clientele(prs, study, 'TEM', 'TEM', '11',
                               [['CARGILL', '4 200', 'Cacao', '11,7%']],
                               *FALLBACK_MIX); return
    if key == 'TEM_nouveaux_chargeurs':
        build_metier_nouveaux(prs, study, 'TEM', 'TEM', '12'); return

    if key == 'HIMP_vue_ensemble':
        build_metier_overview(prs, study, 'HIMP', 'HINTERLAND IMPORT', '14',
                              'Marché : 28 457 TEU  |  AGL : 3 214 TEU  |  PDM 11,3% (#3)',
                              FALLBACK_KPIS('HIMP', '28 457', '3 214', '11,3 %', '#3'),
                              FALLBACK_SERIES(), FALLBACK_PDM); return
    if key == 'HIMP_concurrents':
        build_metier_concurrents(prs, study, 'HIMP', 'HINTERLAND IMPORT', '15',
                                 FALLBACK_HIMP_ROWS, FALLBACK_SEGS); return
    if key == 'HIMP_nouveaux_entrants':
        build_metier_nouveaux(prs, study, 'HIMP', 'HINTERLAND IMPORT', '16'); return

    if key == 'HEXP_vue_ensemble':
        build_metier_overview(prs, study, 'HEXP', 'HINTERLAND EXPORT', '18',
                              'Marché : 4 294 TEU  |  AGL : 2 840 TEU  |  PDM 66,1% (#1)',
                              FALLBACK_KPIS('HEXP', '4 294', '2 840', '66,1 %', '#1 dominant'),
                              FALLBACK_SERIES(), FALLBACK_PDM); return
    if key == 'HEXP_nouveaux_chargeurs':
        build_metier_nouveaux(prs, study, 'HEXP', 'HINTERLAND EXPORT', '19'); return

    if key == 'AER_vue_ensemble':
        build_metier_overview(prs, study, 'AER', 'AÉRIEN IMPORT', '21',
                              'Marché : 5 603 T  |  AGL : 1 166 T  |  PDM 20,8% (#1)',
                              FALLBACK_KPIS('AER', '5 603', '1 166', '20,8 %', '#1 absolu'),
                              FALLBACK_SERIES(), FALLBACK_PDM, unit='T'); return
    if key == 'AER_segments_concurrents':
        build_metier_concurrents(prs, study, 'AER', 'AÉRIEN IMPORT', '22',
                                 FALLBACK_AER_ROWS, FALLBACK_SEGS, unit='T'); return
    if key == 'AER_clientele':
        build_metier_clientele(prs, study, 'AER', 'AÉRIEN IMPORT', '23',
                               [['UBIPHARM', '180', 'Médicaments', '15,4%']],
                               *FALLBACK_MIX); return
    if key == 'AER_nouveaux_entrants':
        build_metier_nouveaux(prs, study, 'AER', 'AÉRIEN IMPORT', '24', unit='T'); return

    if key == 'DSM_vue_ensemble':        build_dsm_overview(prs, study); return
    if key == 'DSM_armateurs':           build_dsm_acteurs(prs, study); return
    if key == 'DSM_manutentionnaires':   build_dsm_vehicules(prs, study); return
    if key == 'DSM_consignataires_pol':  build_dsm_nouveaux(prs, study); return

    if key == 'mining_overview':         build_mining_overview(prs, study); return
    if key == 'mining_concurrents':      build_mining_concurrents(prs, study); return
    if key == 'mining_clientele':        build_mining_clientele(prs, study); return

    if key == 'ayman_overview':          build_ayman_overview(prs, study); return
    if key == 'ayman_metiers':           build_ayman_metiers(prs, study); return
    if key == 'ayman_detail':            build_ayman_detail(prs, study); return

    if key == 'prediction_signaux':         build_prediction_signaux(prs, study); return
    if key == 'prediction_preconisations':  build_prediction_preconisations(prs, study); return

    # Unknown key — placeholder
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_header(s, f"[{key}]", 'Slide non implémentée')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026')


# ────────────────────────────────────────────────────────────────────────────
# Entry point
# ────────────────────────────────────────────────────────────────────────────
def build(study_json: str) -> bytes:
    study = json.loads(study_json) if study_json else {}
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    for key in BLOCK_SEQUENCE:
        try:
            dispatch_block(prs, study, key)
        except Exception as e:
            # Don't let one broken slide kill the whole deck — emit a placeholder.
            s = prs.slides.add_slide(prs.slide_layouts[6])
            add_header(s, f"[ERREUR : {key}]", str(e)[:200])
            add_footer(s, 'Africa Global Logistics – Étude de Marché 2026')
    buf = io.BytesIO()
    prs.save(buf)
    return inject_agl_label(buf.getvalue())


# Entry point — read STUDY_JSON, write PPTX_BYTES
PPTX_BYTES = build(globals().get('STUDY_JSON', '{}'))

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
import base64
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
    # Texte centre-gauche uniquement — le logo AGL en image (PNG) est ajouté
    # à la toute fin de build() sur chaque slide sauf la cover, voir
    # add_logo_to_slide(). On retire le texte 'AGL' que portait jadis le
    # coin bas-droite (remplacé par le logo).
    _txt(s, _in(0.2), _in(7.2), _in(10), _in(0.25),
         text, size=9, color=MGRAY)


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


def _fit_text(text, max_inches, pt=8.5):
    """Tronque text pour qu'il tienne dans max_inches à la taille pt donnée.
    Calibri à 8.5 pt : ~0.060 in/char minuscules, ~0.092 in/char MAJUSCULES
    (caps + chiffres comptent comme caps). Marge sécurité 0.20 in pour
    éviter tout débordement visuel sur la colonne voisine quand wrap=False
    (PowerPoint ne clipe pas — le texte qui dépasse le textbox s'écrit
    par-dessus le contenu d'à côté)."""
    if not text:
        return ''
    text = str(text)
    # Ratio de caractères "larges" (caps + digits + ponctuation type W).
    n_caps = sum(1 for c in text if c.isupper() or c.isdigit() or c in 'WMÉÈÊ')
    caps_ratio = n_caps / max(len(text), 1)
    char_w = (0.060 + caps_ratio * 0.032) * (pt / 8.5)
    avail = max_inches - 0.20
    max_chars = max(4, int(avail / char_w))
    return text if len(text) <= max_chars else text[:max_chars - 1] + '…'


def _is_numeric_header(h):
    """Reconnaît une colonne dont le contenu est numérique (volume, PDM,
    pourcentage, écart) pour la right-aligner et l'éloigner visuellement
    de la colonne nom."""
    if not h:
        return False
    s = str(h).strip().lower()
    return any(k in s for k in (
        'teu', 'tonn', '%', 'pdm', 'pct', 'volume', 'vol.', 'nombre', 'nb',
        ' t ', 't)', 't ', 'kg', 'rang', 'rank', 'écart', 'ecart', 'δ',
        'croissance', 'growth', 'cit.', 'n-1', 'n+1',
    )) or s == 't' or s == 'n' or s == '#'


def add_rank_table(s, x, y, w, headers, rows, highlight_row=0, first_col_mode=None, max_h=None):
    """Tableau classement. firstColMode: 'rank' or 'wide' (auto-detected from header[0]).
    La colonne 'nom' (Transitaire/Client/Marchandise) reçoit ~2× la largeur
    des autres colonnes pour éviter que les noms longs débordent sur les
    colonnes numériques voisines.

    max_h : hauteur totale disponible (pouces), header + lignes. Si fourni,
    row_h et la taille de police sont réduits proportionnellement pour que
    (len(rows)+1) lignes tiennent dans max_h sans déborder sur l'élément
    suivant (ex. encart insight). Sert notamment aux tableaux Top 20
    (10→20 lignes dans le même espace qu'un ancien Top 10)."""
    row_h = 0.28
    font_size = 8.5
    if max_h is not None and rows:
        n_lines = len(rows) + 1  # + header
        fitted = max_h / n_lines
        row_h = max(0.15, min(0.28, fitted))
        font_size = max(6.5, round(8.5 * (row_h / 0.28), 1))
    h0 = str(headers[0]).strip()
    auto_rank = bool(re.match(r'^(rang|#|n[°o]\b|num)', h0, re.I))
    mode = first_col_mode or ('rank' if auto_rank else 'wide')
    n_cols = len(headers)
    if mode == 'rank':
        # 1ʳᵉ col = rang étroite ; 2ᵉ col = nom 2× plus large que les colonnes data.
        if n_cols >= 3:
            data_cols = n_cols - 2
            other_w = (w - 0.45) / (data_cols + 2.0)
            name_w = other_w * 2.0
            col_w = [0.45, name_w] + [other_w] * data_cols
        else:
            col_w = [0.45] + [(w - 0.45) / (n_cols - 1)] * (n_cols - 1)
        name_col_idx = 1
    else:
        # mode 'wide' : 1ʳᵉ col = nom 1.6× les autres
        if n_cols >= 2:
            data_cols = n_cols - 1
            other_w = w / (data_cols + 1.6)
            name_w = other_w * 1.6
            col_w = [name_w] + [other_w] * data_cols
        else:
            col_w = [w]
        name_col_idx = 0

    # Détermine pour chaque colonne son alignement :
    #   - nom → left
    #   - colonne au contenu numérique → right (éloigne du nom voisin)
    #   - autre (rang, label court) → center
    col_align = []
    for i, h in enumerate(headers):
        if i == name_col_idx:
            col_align.append('left')
        elif _is_numeric_header(h) and i != 0:
            col_align.append('right')
        else:
            col_align.append('center')

    # Header bar
    _rect(s, _in(x), _in(y), _in(w), _in(row_h), fill=NAVY)
    cx = x
    for i, h in enumerate(headers):
        _txt(s, _in(cx + 0.04), _in(y + 0.04), _in(col_w[i] - 0.05), _in(row_h - 0.06),
             str(h), size=font_size, bold=True, color=WHITE,
             align=col_align[i], valign='middle', wrap=False)
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
            # Tronquer toute cellule TEXTE (nom + libellés type "Segment")
            # pour éviter qu'un mot long déborde sur la colonne voisine.
            # Les cellules numériques (right-align) sont laissées telles quelles.
            is_numeric_cell = (col_align[ci] == 'right')
            text = (str(cell) if is_numeric_cell else _fit_text(cell, col_w[ci], pt=font_size))
            _txt(s, _in(cx2 + 0.04), _in(ry + 0.04),
                 _in(col_w[ci] - 0.05), _in(row_h - 0.06),
                 text, size=font_size,
                 bold=(is_hl and ci == name_col_idx),
                 color=color,
                 align=col_align[ci],
                 valign='middle', wrap=False)
            cx2 += col_w[ci]


def add_segment_bars(s, x, y, segments):
    """Barres horizontales PDM par segment.
    Si seg['pdm_n1'] est fourni : couleur vert si PDM N ≥ PDM N-1 du segment,
    orange si PDM N < PDM N-1. Le delta s'affiche en bout de barre.
    Fallback (pas de N-1) : palette 2 couleurs — vert si PDM ≥ 10 %,
    orange sinon (cohérent avec la légende affichée).

    Calibration largeurs (x=7.1, slide 13.33") :
      label seg (1.80) · vol (0.90) · bar (1.85) · pdm% (0.50) · N-1 (0.90)
      → 5.95 in à droite de x ; avec x=7.1 → fin 13.05 < 13.33 ✓
    """
    max_bar = 1.85
    row_h = 0.42
    for i, seg in enumerate(segments):
        ry = y + i * row_h
        pdm = float(seg.get('pdm', 0))
        pdm_n1 = seg.get('pdm_n1')
        has_n1 = pdm_n1 is not None
        bar_w = max(0.06, (pdm / 100.0) * max_bar)
        if has_n1:
            pdm_n1_f = float(pdm_n1)
            bar_color = GREEN if pdm >= pdm_n1_f else ORANGE
        else:
            bar_color = GREEN if pdm >= 10 else ORANGE
        _txt(s, _in(x), _in(ry), _in(1.8), _in(0.28),
             str(seg.get('label', '')).upper(), size=8.5, color=DGRAY)
        _txt(s, _in(x + 1.82), _in(ry), _in(0.85), _in(0.28),
             str(seg.get('vol', '')), size=8.5, color=MGRAY, align='right')
        _rect(s, _in(x + 2.70), _in(ry + 0.04), _in(max_bar), _in(0.18),
              fill=LINE_GR)
        _rect(s, _in(x + 2.70), _in(ry + 0.04), _in(bar_w), _in(0.18),
              fill=bar_color)
        _txt(s, _in(x + 2.70 + max_bar + 0.03), _in(ry), _in(0.50), _in(0.28),
             f"{int(round(pdm))}%", size=9, bold=True, color=bar_color)
        if has_n1:
            delta = pdm - pdm_n1_f
            sign = '+' if delta >= 0 else ''
            # Format compact : "N-1 12% (+5pt)" — sans parenthèses ni · pour
            # rester sous 0.90 in à 7 pt (~14 caractères max).
            _txt(s, _in(x + 2.70 + max_bar + 0.55), _in(ry + 0.02),
                 _in(0.90), _in(0.28),
                 f"N-1 {int(round(pdm_n1_f))}% ({sign}{int(round(delta))}pt)",
                 size=7, color=MGRAY, wrap=False)


def add_segment_legend(s, x, y, w=4.0, mode='n1'):
    """Légende des couleurs des barres segments.
    mode='n1'      → vert si PDM AGL ≥ N-1, orange sinon
    mode='seuil'   → vert si PDM AGL ≥ 10 %, orange sinon (fallback)
    """
    if mode == 'n1':
        green_lbl = "PDM AGL ≥ N-1"
        orange_lbl = "PDM AGL < N-1"
    else:
        green_lbl = "PDM AGL ≥ 10 % (N-1 indispo)"
        orange_lbl = "PDM AGL < 10 % (N-1 indispo)"
    _rect(s, _in(x), _in(y), _in(0.14), _in(0.14), fill=GREEN)
    _txt(s, _in(x + 0.18), _in(y - 0.02), _in(2.30), _in(0.2),
         green_lbl, size=8, color=DGRAY, wrap=False)
    _rect(s, _in(x + 2.55), _in(y), _in(0.14), _in(0.14), fill=ORANGE)
    _txt(s, _in(x + 2.73), _in(y - 0.02), _in(2.30), _in(0.2),
         orange_lbl, size=8, color=DGRAY, wrap=False)


def add_insight_box(s, x, y, w, h, emoji, lines, bg=EYELLOW):
    """Encadré jaune avec auto-fit du texte : la taille de police diminue
    automatiquement quand il y a beaucoup de lignes, pour garantir que le
    contenu rentre dans la box (h fixée par le caller)."""
    _rect(s, _in(x), _in(y), _in(w), _in(h),
          fill=bg, line=EBORDER, line_width=0.5)
    clean = [str(l) for l in lines if l]
    n = max(len(clean), 1)
    # Estimation : chaque ligne occupe (size * 1.25)/72 in. On résout pour
    # que (n + 0.5 marge) lignes tiennent dans h - 0.16.
    avail_h = max(0.20, h - 0.16)
    target_size = (avail_h / (n + 0.4)) * 72 / 1.25
    size = max(6.5, min(9.0, target_size))
    text = f"{emoji}  " + '\n'.join(clean)
    _txt(s, _in(x + 0.1), _in(y + 0.08), _in(w - 0.2), _in(h - 0.12),
         text, size=size, color=DGRAY, wrap=True)


def mensuel_layout(n_months, y0=2.62, y_max=7.12, legend_h=0.30, ins_min=0.85):
    """Calcule la géométrie du bloc « PDM AGL par mois » en fonction du
    NOMBRE RÉEL de mois de la période (5, 6, 12…).

    Avant, row_h / légende / encart étaient figés pour 5 mois : dès qu'on
    passait à 6 mois, les barres débordaient sous la légende (placée à
    5,50") et l'encart insight (5,80") recouvrait le dernier mois.

    Retourne (row_h, legend_y, ins_y, ins_h) :
      - row_h    : hauteur d'une ligne mois, plafonnée à 0.58 (rendu
                   historique conservé à l'identique pour 5 mois)
      - legend_y : juste sous la dernière barre
      - ins_y/h  : encart insight sous la légende, jusqu'à y_max
    """
    n = max(int(n_months or 1), 1)
    bars_h = max(0.9, (y_max - y0) - legend_h - ins_min - 0.04)
    row_h = min(0.58, bars_h / n)
    bars_end = y0 + n * row_h
    legend_y = bars_end + 0.04
    ins_y = legend_y + legend_h
    return row_h, legend_y, ins_y, max(ins_min, y_max - ins_y)


def add_mensuel_bars(s, x, y, mois, valeurs, seuil=7.5, valeurs_n1=None, row_h=0.58):
    """Barres mensuelles PDM. Si valeurs_n1 fourni : couleur = comparaison
    PDM N vs PDM N-1 du même mois (vert si N≥N-1, orange sinon). Sinon
    fallback : comparaison à la moyenne période (seuil).

    row_h : hauteur d'une ligne. Quand la période compte plus de 5 mois,
    l'appelant réduit row_h via mensuel_layout() ; tous les offsets et
    tailles de police internes sont alors mis à l'échelle par k pour que
    barre, libellé et valeur restent dans leur ligne."""
    k = max(0.45, min(1.0, row_h / 0.58))
    max_bar = 2.55
    clean = [round(float(v or 0), 1) for v in valeurs]
    clean_n1 = [round(float(v or 0), 1) for v in (valeurs_n1 or [])]
    has_n1 = bool(clean_n1) and any(v > 0 for v in clean_n1)
    max_v = max(clean + clean_n1 + [0.0001])
    for i, m in enumerate(mois):
        ry = y + i * row_h
        v = clean[i] if i < len(clean) else 0
        v_n1 = clean_n1[i] if i < len(clean_n1) else 0
        bw = max(0.02, (v / max_v) * max_bar)
        if has_n1 and v_n1 > 0:
            bc = GREEN if v >= v_n1 else ORANGE
        else:
            bc = GREEN if v >= seuil else ORANGE
        _rect(s, _in(x), _in(ry), _in(6.0), _in(row_h - 0.06 * k),
              fill=RGBColor(0xF8, 0xFA, 0xFC), line=LINE_GR, line_width=0.3)
        _txt(s, _in(x + 0.12), _in(ry + 0.14 * k), _in(0.85), _in(0.3 * k),
             str(m)[:8], size=max(6.5, 11 * k), color=DGRAY, wrap=False)
        _rect(s, _in(x + 1.0), _in(ry + 0.14 * k), _in(max_bar), _in(0.22 * k),
              fill=LINE_DK)
        _rect(s, _in(x + 1.0), _in(ry + 0.14 * k), _in(bw), _in(0.22 * k), fill=bc)
        label = f"{v:.1f}".replace('.', ',') + ' %'
        _txt(s, _in(x + 1.0 + max_bar + 0.06), _in(ry + 0.1 * k),
             _in(0.78), _in(0.3 * k),
             label, size=max(6.5, 10 * k), bold=True, color=bc, valign='middle', wrap=False)
        # Référence N-1 + delta à droite si dispo
        if has_n1:
            n1_lbl = f"N-1 {v_n1:.1f}".replace('.', ',') + ' %'
            delta = v - v_n1
            sign = '+' if delta >= 0 else ''
            d_lbl = f"({sign}{delta:.1f}".replace('.', ',') + ' pt)'
            _txt(s, _in(x + 1.0 + max_bar + 0.85), _in(ry + 0.1 * k),
                 _in(1.30), _in(0.3 * k),
                 n1_lbl + ' ' + d_lbl, size=max(6.0, 8 * k), color=MGRAY,
                 valign='middle', wrap=False)


def add_mensuel_legend(s, x, y, seuil=None, w=6.0, mode='n1'):
    """Légende des couleurs sous le graphe PDM mensuel.
    mode='n1'      → vert si PDM N ≥ même mois N-1, orange sinon
    mode='moyenne' → vert si PDM ≥ moyenne période (seuil)
    """
    if mode == 'n1':
        green_lbl = "≥ même mois N-1 (progression)"
        orange_lbl = "< même mois N-1 (recul)"
    else:
        seuil_str = (f"{float(seuil or 0):.1f}".replace('.', ',') + ' %'
                     if seuil is not None else 'moyenne')
        green_lbl = f"≥ moyenne période ({seuil_str})"
        orange_lbl = f"< moyenne période ({seuil_str})"
    _rect(s, _in(x), _in(y), _in(0.14), _in(0.14), fill=GREEN)
    _txt(s, _in(x + 0.18), _in(y - 0.02), _in(2.9), _in(0.2),
         green_lbl, size=8, color=DGRAY, wrap=False)
    _rect(s, _in(x + 3.0), _in(y), _in(0.14), _in(0.14), fill=ORANGE)
    _txt(s, _in(x + 3.18), _in(y - 0.02), _in(2.9), _in(0.2),
         orange_lbl, size=8, color=DGRAY, wrap=False)


def compute_concurrents_insights(live, label, unit='TEU'):
    """Insight box jaune slide CONCURRENTS — analyse profonde même sans N-1.
    Toujours produit : rang+PDM AGL, écart #2/#3, concentration TOP4, segments
    forts/faibles, longue traîne, source. Ajouts si N-1 : rang/PDM Δ, top
    movers, segment gagné / érodé."""
    lines = []
    if not live:
        return [f"📊 Uploader STATCOM {label} N (+ N-1 pour analyse temporelle)."]
    full = live.get('fullRanked') or []
    name_key = 'transitaire' if (full and 'transitaire' in full[0]) else 'nom_entite'

    # ── 1. Rang AGL N (toujours) + Δ vs N-1 si dispo ────────────────────
    agl_row = next((r for r in full if is_agl(str(r.get(name_key) or ''))), None)
    rang_n = next((i+1 for i, r in enumerate(full)
                   if is_agl(str(r.get(name_key) or ''))), None) if agl_row else None
    if agl_row:
        pdm = float(agl_row.get('pdm') or 0)
        vol = float(agl_row.get('volume') or 0)
        rang_n1 = agl_row.get('rang_n1')
        pdm_n1 = agl_row.get('pdm_n1')
        delta = agl_row.get('delta_pdm')
        if rang_n1 and pdm_n1 is not None and float(pdm_n1) > 0:
            arrow_rank = '▲' if (rang_n < rang_n1) else ('▼' if rang_n > rang_n1 else '=')
            sign = '+' if (delta or 0) >= 0 else ''
            lines.append(
                f"🏁 AGL #{rang_n} ({pdm:.1f}".replace('.', ',') +
                f" %, {fmt_int(vol)} {unit}) vs #{rang_n1} ({float(pdm_n1):.1f}".replace('.', ',') +
                f" %) en N-1 — {arrow_rank} {sign}{float(delta or 0):.1f}".replace('.', ',') + " pt."
            )
        else:
            lines.append(
                f"🏁 AGL #{rang_n} ({pdm:.1f}".replace('.', ',') +
                f" %, {fmt_int(vol)} {unit}) — comparaison N-1 indispo."
            )

    # ── 2. Écart vs #2 / leader ─────────────────────────────────────────
    if agl_row and rang_n and len(full) >= 2:
        agl_vol = float(agl_row.get('volume') or 0)
        if rang_n == 1:
            second = full[1]
            ecart = agl_vol - float(second.get('volume') or 0)
            sec_pdm = float(second.get('pdm') or 0)
            lines.append(
                f"🥈 #2 = {str(second.get(name_key, ''))[:22]} ({sec_pdm:.1f}".replace('.', ',') +
                f" %) — avance AGL +{fmt_int(ecart)} {unit}."
            )
        else:
            leader = full[0]
            ecart = float(leader.get('volume') or 0) - agl_vol
            ld_pdm = float(leader.get('pdm') or 0)
            lines.append(
                f"🏆 Leader = {str(leader.get(name_key, ''))[:22]} ({ld_pdm:.1f}".replace('.', ',') +
                f" %) — AGL à -{fmt_int(ecart)} {unit}."
            )

    # ── 3. Concentration TOP 4 / TOP 10 / longue traîne ─────────────────
    if full:
        total_vol = sum(float(r.get('volume') or 0) for r in full)
        if total_vol > 0:
            top4_vol = sum(float(r.get('volume') or 0) for r in full[:4])
            top4_pct = (top4_vol / total_vol) * 100
            n_active = sum(1 for r in full
                           if (float(r.get('volume') or 0) / total_vol) * 100 >= 1.0)
            lines.append(
                f"🎯 Concentration TOP 4 = {top4_pct:.1f}".replace('.', ',') +
                f" % du marché qualifié · {len(full)} transitaires ({n_active} avec ≥ 1 % PDM)."
            )

    # ── 4. Segments AGL — forces & zones faibles ────────────────────────
    segs = live.get('rawSegments') or []
    if segs:
        sorted_segs = sorted(segs, key=lambda s: -float(s.get('pdm_agl') or 0))
        forces = [s for s in sorted_segs[:3] if float(s.get('pdm_agl') or 0) >= 10]
        if forces:
            lbls = ', '.join([
                f"{str(s.get('segment', ''))[:18]} ({int(round(float(s.get('pdm_agl') or 0)))} %)"
                for s in forces
            ])
            lines.append(f"💪 Forces AGL : {lbls}.")
        # Segments à fort volume marché mais PDM AGL faible (cible conquête)
        vol_strong = sorted(segs, key=lambda s: -float(s.get('volume_marche') or 0))[:5]
        weak = [s for s in vol_strong if 0 < float(s.get('pdm_agl') or 0) <= 5]
        if weak:
            lbls = ', '.join([
                f"{str(s.get('segment', ''))[:18]} ({int(round(float(s.get('pdm_agl') or 0)))} %, {fmt_int(s.get('volume_marche') or 0)} {unit})"
                for s in weak[:2]
            ])
            lines.append(f"🎯 Conquête prioritaire (gros volumes, PDM ≤ 5 %) : {lbls}.")

    # ── 5. Mouvements concurrents vs N-1 (si dispo) ─────────────────────
    top = [r for r in full[:10] if r.get('delta_pdm') is not None
           and not is_agl(str(r.get(name_key) or ''))]
    if top:
        movers_up = sorted(top, key=lambda r: -float(r.get('delta_pdm') or 0))[:2]
        movers_dn = sorted(top, key=lambda r: float(r.get('delta_pdm') or 0))[:2]
        up_lbls = ', '.join([
            f"{str(r.get(name_key, ''))[:16]} (+{float(r['delta_pdm']):.1f} pt)".replace('.', ',')
            for r in movers_up if (r.get('delta_pdm') or 0) > 0.05
        ])
        dn_lbls = ', '.join([
            f"{str(r.get(name_key, ''))[:16]} ({float(r['delta_pdm']):.1f} pt)".replace('.', ',')
            for r in movers_dn if (r.get('delta_pdm') or 0) < -0.05
        ])
        # Sans periode de comparaison, volume_n1 vaut 0 partout : delta_pdm
        # devient egal a la PDM courante et l'app conclurait a une "hausse"
        # generalisee inexistante. On n'emet ces lignes que si un N-1 reel
        # est present.
        _has_n1 = any(float(r.get('volume_n1') or 0) > 0 for r in top)
        if _has_n1 and up_lbls:
            lines.append(f"📈 En hausse vs N-1 : {up_lbls}.")
        if _has_n1 and dn_lbls:
            lines.append(f"📉 En recul vs N-1 : {dn_lbls}.")

    # ── 6. Segments gagnés / érodés vs N-1 (si dispo) ───────────────────
    seg_with_n1 = [s for s in segs if s.get('pdm_agl_n1') is not None
                   and float(s.get('pdm_agl_n1') or 0) > 0]
    if seg_with_n1:
        gains = sorted(seg_with_n1,
                       key=lambda s: -(float(s.get('pdm_agl') or 0) - float(s.get('pdm_agl_n1') or 0)))
        best = gains[0]
        worst = gains[-1]
        d_best = float(best.get('pdm_agl') or 0) - float(best.get('pdm_agl_n1') or 0)
        d_worst = float(worst.get('pdm_agl') or 0) - float(worst.get('pdm_agl_n1') or 0)
        if d_best > 0.5:
            lines.append(
                f"✅ Segment gagné : {str(best.get('segment', ''))[:22]} "
                f"({int(round(float(best.get('pdm_agl_n1') or 0)))} % → "
                f"{int(round(float(best.get('pdm_agl') or 0)))} %, +{d_best:.0f} pt)."
            )
        if d_worst < -0.5:
            lines.append(
                f"⚠ Segment érodé : {str(worst.get('segment', ''))[:22]} "
                f"({int(round(float(worst.get('pdm_agl_n1') or 0)))} % → "
                f"{int(round(float(worst.get('pdm_agl') or 0)))} %, {d_worst:.0f} pt)."
            )

    # ── 7. Source ──────────────────────────────────────────────────────
    return lines


def compute_clientele_insights(live, label, unit='TEU'):
    """Insight box jaune slide CLIENTÈLE — concentration top client, top 3
    cumul, mix marchandises, cibles cross-sell, profondeur du portefeuille."""
    lines = []
    if not live:
        return [f"📊 Uploader STATCOM {label} pour activer l'analyse clientèle live."]

    rows = live.get('rows') or []
    mix_lbls = live.get('mixLabels') or []
    mix_vals = live.get('mixValues') or []
    top_client = live.get('topClient')
    top_share = live.get('topClientShare')

    # ── 1. Concentration top client ─────────────────────────────────────
    if top_client and top_share:
        lines.append(f"⚠ Concentration #1 : {str(top_client)[:30]} = {top_share} du volume AGL {label}.")

    # ── 2. Top 3 cumul + reste du top 10 ────────────────────────────────
    if rows:
        # Format des rows : [client, volume_str, segment, pct_str]
        def pct_to_num(s):
            try:
                return float(str(s).replace('%', '').replace(',', '.').strip())
            except Exception:
                return 0.0
        top3 = sum(pct_to_num(r[3]) for r in rows[:3] if len(r) > 3)
        top10 = sum(pct_to_num(r[3]) for r in rows[:10] if len(r) > 3)
        if top3 > 0:
            lines.append(
                f"🎯 TOP 3 clients = {top3:.1f}".replace('.', ',') +
                f" % · TOP 10 = {top10:.1f}".replace('.', ',') +
                " % du volume AGL (mesure de concentration / risque client)."
            )

    # ── 3. Mix marchandises (3 segments leaders) ────────────────────────
    if mix_lbls and mix_vals:
        pairs = sorted(zip(mix_lbls, mix_vals), key=lambda p: -p[1])
        top3_mix = pairs[:3]
        share3 = sum(v for _, v in top3_mix)
        lbls = ', '.join([f"{str(l)[:18]} ({int(round(v))} %)" for l, v in top3_mix])
        lines.append(f"📦 Mix AGL — TOP 3 segments = {int(round(share3))} % : {lbls}.")
        # Si le mix est ≥ 60 % sur 3 segments, c'est un risque de spécialisation
        if share3 >= 60:
            lines.append(
                f"⚠ Portefeuille concentré : 3 segments ≥ 60 % → exposition forte au cycle de ces marchés."
            )
        elif share3 <= 35:
            lines.append("✅ Portefeuille diversifié : mix équilibré, faible exposition à un marché.")

    # ── 4. Cibles cross-sell ────────────────────────────────────────────
    if len(rows) >= 4:
        cross = ', '.join([str(r[0])[:18] for r in rows[1:4]])
        lines.append(f"🤝 Cross-sell prioritaire : {cross} (clients déjà actifs, à pousser sur autres métiers).")

    # ── 5. Profondeur portefeuille ──────────────────────────────────────
    if rows:
        lines.append(
            f"👥 Portefeuille suivi : {len(rows)} clients dans le top — segmenter par marchandise pour cibler la prospection."
        )
    return lines


def compute_metier_insights(live, unit='TEU'):
    """Build a list of 5–7 insight lines from a build_overview_data() dict."""
    if not live:
        return []
    lines = []
    market_str = live['kpis']['marche']
    agl_str = live['kpis']['agl']
    pdm_str = live['kpis']['pdm']
    rank_str = f"#{live['aglRank']}" if live.get('aglRank') else '—'
    lines.append(f"📊 PDM AGL : {pdm_str} sur {market_str} {unit} de marché — rang {rank_str}.")
    # Second + écart
    if live.get('secondName') and live.get('aglRank') == 1:
        ecart = live['kpis']['ecart']
        lines.append(f"🥈 #2 = {live['secondName']} — avance AGL {ecart} {unit} (à consolider).")
    elif live.get('secondName'):
        ecart = live['kpis']['ecart']
        lines.append(f"🏆 Leader = {live['secondName']} — AGL à {ecart} {unit} (objectif : combler l'écart).")
    # Top 4 cumul
    top4 = live['kpis']['top4']
    lines.append(f"🎯 Concentration : TOP 4 transitaires = {top4} du marché qualifié.")
    # Monthly analysis
    pdm = live.get('monthlyPdm') or []
    labels = live.get('monthLabels') or []
    if pdm and labels:
        full_months = [next((m for m in MONTHS_FR_FULL if m.startswith(l)), l) for l in labels]
        max_i = pdm.index(max(pdm))
        min_i = pdm.index(min(pdm))
        max_v = f"{pdm[max_i]:.1f}".replace('.', ',')
        min_v = f"{pdm[min_i]:.1f}".replace('.', ',')
        lines.append(f"📈 Meilleur mois : {full_months[max_i]} ({max_v} %)  ·  ⚠ Plus faible : {full_months[min_i]} ({min_v} %).")
        # Trend (compare first half avg to second half)
        if len(pdm) >= 4:
            half = len(pdm) // 2
            avg1 = sum(pdm[:half]) / half
            avg2 = sum(pdm[half:]) / (len(pdm) - half)
            diff = avg2 - avg1
            arrow = '↗' if diff > 0.3 else ('↘' if diff < -0.3 else '→')
            trend_word = 'progression' if diff > 0.3 else ('érosion' if diff < -0.3 else 'stabilité')
            sign = '+' if diff > 0 else ''
            lines.append(f"{arrow} Tendance période : {trend_word} ({sign}{diff:+.1f} pts entre 1ʳᵉ et 2ᵈᵉ moitié).".replace('+-', '−'))
    # Source
    return lines


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


PIE_PALETTE = [NAVY, GOLD, BLUE2, GREEN, ORANGE, TEAL, RED,
               RGBColor(0x9C, 0xA3, 0xAF), LINE_DK]


def add_pie_chart(s, x, y, w, h, labels, values):
    """Camembert avec légende MANUELLE à droite (plus de chevauchement
    légende ↔ tracé). On découpe la zone (x, y, w, h) en :
      • pie  → 55 % à gauche
      • légende → 45 % à droite (puces colorées + libellé tronqué)
    """
    n = len(labels)
    pie_w = w * 0.55
    leg_x = x + pie_w + 0.10
    leg_w = w - pie_w - 0.10

    # ── Tracé du camembert (légende interne désactivée) ──────────────────
    cd = CategoryChartData()
    cd.categories = list(labels)  # complets pour le data label, même s'il est masqué
    cd.add_series('Mix', list(values))
    chart = s.shapes.add_chart(
        XL_CHART_TYPE.PIE, _in(x), _in(y), _in(pie_w), _in(h), cd
    ).chart
    chart.has_title = False
    chart.has_legend = False
    for i, pt in enumerate(chart.plots[0].series[0].points):
        fill = pt.format.fill
        fill.solid()
        fill.fore_color.rgb = PIE_PALETTE[i % len(PIE_PALETTE)]
    chart.plots[0].has_data_labels = True
    dlbls = chart.plots[0].data_labels
    dlbls.show_percentage = True
    dlbls.show_value = False
    dlbls.show_category_name = False
    dlbls.font.size = Pt(9)
    dlbls.font.color.rgb = WHITE

    # ── Légende manuelle : 1 ligne par catégorie ────────────────────────
    # Hauteur de ligne calée pour que tout tienne dans h (max ~12 lignes).
    line_h = min(0.22, max(0.16, (h - 0.20) / max(n, 1)))
    chip = 0.13
    total_v = sum(values) or 1
    leg_y_start = y + max(0.05, (h - n * line_h) / 2)
    for i, (lbl, val) in enumerate(zip(labels, values)):
        ly = leg_y_start + i * line_h
        # Puce couleur
        _rect(s, _in(leg_x), _in(ly + 0.02), _in(chip), _in(chip),
              fill=PIE_PALETTE[i % len(PIE_PALETTE)])
        # Libellé tronqué pour la largeur disponible
        pct = (float(val) / total_v) * 100
        text = f"{_fit_text(lbl, leg_w - chip - 0.65, pt=8)}  {pct:.0f}%"
        _txt(s, _in(leg_x + chip + 0.06), _in(ly), _in(leg_w - chip - 0.10),
             _in(line_h - 0.02),
             text, size=8, color=DGRAY, valign='middle', wrap=False)


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



def _pct_var(n, n1):
    """Variation en % entre N et N-1. None si pas de N-1 (mode periode
    unique ou fichier N-1 absent) : on n'affiche alors aucune variation
    plutot qu'un -100% trompeur."""
    try:
        n, n1 = float(n or 0), float(n1 or 0)
    except Exception:
        return None
    if n1 <= 0:
        return None
    return round((n - n1) / n1 * 100, 1)


def _var_txt(pct, suffixe=' % vs N-1'):
    """Texte de variation pretr a afficher, ou None."""
    if pct is None:
        return None
    signe = '+' if pct >= 0 else ''
    return (signe + f"{pct:.1f}".replace('.', ',') + suffixe)


def _var_color(pct):
    if pct is None:
        return MGRAY
    return GREEN if pct >= 0 else RED


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
    monthly_pdm_n1 = monthly_market_n1 = monthly_agl_n1 = None
    if mensuel and mensuel.get('rows'):
        m = mensuel['rows']
        month_labels = [str(r.get('mois') or '')[:4] for r in m]
        monthly_market = [float(r.get('volume_marche') or 0) for r in m]
        monthly_agl = [float(r.get('volume_agl') or 0) for r in m]
        monthly_pdm = [(monthly_agl[i] / monthly_market[i]) * 100 if monthly_market[i] > 0 else 0
                       for i in range(len(m))]
        monthly_market_n1 = [float(r.get('volume_marche_n1') or 0) for r in m]
        monthly_agl_n1 = [float(r.get('volume_agl_n1') or 0) for r in m]
        monthly_pdm_n1 = [float(r.get('pdm_agl_n1') or 0) for r in m]
    # AGL N-1 totals + growth on same period (when N-1 data is present)
    agl_vol_n1 = sum(monthly_agl_n1) if monthly_agl_n1 else 0
    market_n1 = sum(monthly_market_n1) if monthly_market_n1 else 0
    agl_pdm_n1 = (agl_vol_n1 / market_n1) * 100 if market_n1 > 0 else 0
    return {
        'source': concurrents.get('filename', ''),
        'unit': unit_of(metier),
        'market': market, 'aglVolume': agl_vol, 'aglPdm': agl_pdm,
        'aglRank': agl_idx + 1 if agl_idx >= 0 else None,
        'secondName': second_name, 'ecart': ecart, 'top4Pdm': top4_pdm,
        'monthLabels': month_labels, 'monthlyMarket': monthly_market,
        'monthlyAgl': monthly_agl, 'monthlyPdm': monthly_pdm,
        'monthlyMarketN1': monthly_market_n1, 'monthlyAglN1': monthly_agl_n1,
        'monthlyPdmN1': monthly_pdm_n1,
        'marketN1': market_n1, 'aglVolumeN1': agl_vol_n1, 'aglPdmN1': agl_pdm_n1,
        # Variations N vs N-1. Regle de lecture du deck : la valeur affichee
        # est TOUJOURS celle de l'annee N ; le N-1 n'apparait que sous forme
        # de variation. Aucune addition entre annees.
        'deltaMarchePct': _pct_var(market, market_n1),
        'deltaAglPct': _pct_var(agl_vol, agl_vol_n1),
        'deltaPdmPts': (round(agl_pdm - agl_pdm_n1, 1) if market_n1 > 0 else None),
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
    top20 = [
        [f"#{i+1}", str(r.get(name_key) or ''),
         fmt_int(r.get('volume') or 0),
         fmt_pdm((float(r.get('volume') or 0) / market) * 100 if market > 0 else 0)]
        for i, r in enumerate(ranked[:20])
    ]
    segment_bars = None
    if segments and segments.get('rows'):
        bars = [{'label': str(r.get('segment') or ''),
                 'vol': fmt_int(r.get('volume_marche') or 0) + ' ' + unit,
                 'pdm': int(round(float(r.get('pdm_agl') or 0))),
                 'pdm_n1': (int(round(float(r.get('pdm_agl_n1'))))
                            if r.get('pdm_agl_n1') is not None else None)}
                for r in segments['rows']]
        segment_bars = sorted(bars, key=lambda b: -b['pdm'])[:11]
    agl_row_idx = next((i for i, r in enumerate(ranked) if is_agl(str(r.get(name_key) or ''))), -1)
    # Full ranking enriched with N-1 (volume_n1, pdm_n1, rang_n1, delta_pdm).
    full_ranked = sorted(rows, key=lambda r: -float(r.get('volume') or 0))
    return {'source': concurrents.get('filename', ''), 'unit': unit,
            'rows': top20, 'aglRowIdx': agl_row_idx, 'segmentBars': segment_bars,
            'fullRanked': full_ranked, 'rawSegments': segments['rows'] if segments and segments.get('rows') else None}


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
        for r in sorted_rows[:20]
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
        # Lignes brutes (gardées pour alimenter compute_nouveaux_insights).
        '_rawTransitaires': nouveaux['rows'],
        '_rawMarchandises': nouveaux_merch['rows'],
        '_rawClients': nouveaux_clients['rows'],
        '_rawGrowth': top_growth['rows'] if top_growth else [],
        '_rawDestinataires': top_dest['rows'] if top_dest else [],
    }


def compute_nouveaux_insights(live, label, unit='TEU'):
    """Insight box jaune slide NOUVEAUX ENTRANTS — analyse approfondie :
    leader des nouveaux entrants, marchandises émergentes les plus
    volumineuses, opportunité de conquête (clients nouveaux pour AGL mais
    importants en N-1), top growth en volume, destinataires les plus
    importants du marché, lecture stratégique."""
    if not live:
        return [f"📊 Uploader STATCOM {label} N + N-1 pour activer l'analyse nouveaux entrants."]
    lines = []

    rawT = live.get('_rawTransitaires') or []
    rawM = live.get('_rawMarchandises') or []
    rawC = live.get('_rawClients') or []
    rawG = live.get('_rawGrowth') or []
    rawD = live.get('_rawDestinataires') or []

    # ── 1. Synthèse + niveau de fragmentation ──────────────────────────
    nT, nM, nC = len(rawT), len(rawM), len(rawC)
    lines.append(
        f"📊 Synthèse : {nT} nouveaux transitaires · {nM} nouvelles marchandises · "
        f"{nC} nouveaux clients AGL — dynamique d'arrivée mesurée vs N-1 même période."
    )

    # ── 2. Nouveau transitaire #1 — alerte si volume significatif ──────
    if rawT:
        top_t = rawT[0]
        vol_t = float(top_t.get('volume') or 0)
        pdm_t = float(top_t.get('pdm') or 0)
        if vol_t > 0:
            alert = '⚠' if pdm_t >= 1.5 else '🆕'
            lines.append(
                f"{alert} Nouveau transitaire #1 : {str(top_t.get('transitaire') or '')[:30]} "
                f"({fmt_int(vol_t)} {unit}, {pdm_t:.1f} % PDM).".replace('.', ',')
                + (' Acteur déjà significatif → surveiller.' if pdm_t >= 1.5 else '')
            )

    # ── 3. Nouvelles marchandises à fort volume marché ─────────────────
    big_merch = [m for m in rawM
                 if float(m.get('volume_marche') or 0) >= 100]  # seuil pertinence
    if big_merch:
        lbls = ', '.join([
            f"{str(m.get('segment') or '')[:22]} ({fmt_int(m.get('volume_marche'))} {unit})"
            for m in big_merch[:3]
        ])
        lines.append(f"📦 Marchandises émergentes à fort volume marché : {lbls}.")
        # AGL absente sur ces marchandises = gisement
        absent = [m for m in big_merch[:5] if float(m.get('pdm_agl') or 0) == 0]
        if absent:
            lbls2 = ', '.join([str(m.get('segment') or '')[:22] for m in absent[:3]])
            lines.append(
                f"🎯 AGL ABSENTE sur ces nouveaux segments (PDM 0 %) — opportunité conquête : {lbls2}."
            )

    # ── 4. Opportunité conquête clients (volume N-1 chez les concurrents) ─
    big_clients = sorted([c for c in rawC
                          if float(c.get('volume_n1_others') or 0) > 0],
                         key=lambda c: -float(c.get('volume_n1_others') or 0))[:3]
    if big_clients:
        lbls = '; '.join([
            f"{str(c.get('client') or '')[:24]} "
            f"(AGL {fmt_int(c.get('volume'))} / chez concurrents N-1 {fmt_int(c.get('volume_n1_others'))})"
            for c in big_clients
        ])
        lines.append(f"🎯 Clients à plus fort potentiel (gros volumes N-1 chez concurrents) : {lbls}.")

    # ── 5. Top growth marchandise — alerte si AGL absente ──────────────
    if rawG:
        top_g = rawG[0]
        delta = float(top_g.get('delta_volume') or 0)
        growth = top_g.get('growth_pct')
        pdm_g = float(top_g.get('pdm_agl') or 0)
        growth_str = (f"+{growth} %" if growth is not None else 'nouveau')
        emoji = '⚠' if pdm_g <= 5 else '✅'
        lines.append(
            f"{emoji} Plus forte hausse marché : {str(top_g.get('segment') or '')[:28]} "
            f"(+{fmt_int(delta)} {unit}, {growth_str}, PDM AGL {pdm_g:.0f} %) — "
            + ('AGL sous-représentée, à investir.' if pdm_g <= 5
               else 'AGL bien positionnée pour capter la croissance.')
        )

    # ── 6. Destinataire #1 du marché — référence concurrentielle ───────
    if rawD:
        top_d = rawD[0]
        vol_d = float(top_d.get('volume') or 0)
        vol_a = float(top_d.get('volume_agl') or 0)
        pdm_d = float(top_d.get('pdm_agl') or 0)
        if vol_d > 0:
            posture = ('✅ AGL en force' if pdm_d >= 50 else
                       '⚖ AGL présente' if pdm_d >= 10 else
                       '⚠ AGL marginal')
            lines.append(
                f"🏢 Destinataire #1 marché : {str(top_d.get('client') or '')[:26]} "
                f"({fmt_int(vol_d)} {unit}, AGL {fmt_int(vol_a)} = {pdm_d:.0f} %) — {posture}."
            )

    # ── 7. Source ──────────────────────────────────────────────────────
    return lines


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
        'monthlyMarketN1': [m.get('volume_marche_n1', 0) for m in mensuel],
        'monthlyAglN1': [m.get('volume_agl_n1', 0) for m in mensuel],
        'monthlyPdm': [m.get('pdm_agl', 0) for m in mensuel],
        'monthlyPdmN1': [m.get('pdm_agl_n1', 0) for m in mensuel],
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
    ds = find_dataset(study, 'AYIMAN', 'ayiman_focus')
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
        # Détail par métier (TIM/HIMP/HEXP/TEM/AER) pour étude complète AYIMAN
        'byMetierDetail': a.get('byMetierDetail') or {},
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
    """Slide 1 = COVER. Si study.assets.coverImage (PNG base64) est fourni,
    on l'utilise plein écran (1280×718 ≈ ratio 16:9 ≈ 13.33×7.5"). Sinon
    fallback sur la cover dessinée manuellement (ancienne version)."""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    cover_b64 = (study.get('assets') or {}).get('coverImage')
    if cover_b64:
        try:
            img_bytes = base64.b64decode(cover_b64)
            s.shapes.add_picture(
                io.BytesIO(img_bytes), 0, 0, SLIDE_W, SLIDE_H,
            )
            # Tag version discret en bas-gauche par-dessus l'image
            app_v = study.get('appVersion') or 'unknown'
            gen_at = (study.get('generatedAt') or '')[:19].replace('T', ' ')
            _txt(s, _in(0.35), _in(7.30), _in(4.0), _in(0.18),
                 f"Build v={app_v}  ·  {gen_at}",
                 size=6, italic=True, color=RGBColor(0xCC, 0xCC, 0xCC))
            return
        except Exception:
            pass  # Fallback ci-dessous si décodage rate
    # Fallback : cover dessinée à la main (ancienne version)
    _rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=NAVY)
    _rect(s, _in(0.35), _in(3.55), _in(8.5), _in(0.06), fill=GOLD)
    _txt(s, _in(0.35), _in(0.3), _in(2), _in(0.6), 'AGL', size=36, bold=True, color=WHITE)
    _txt(s, _in(0.35), _in(0.88), _in(4), _in(0.25),
         'AFRICA GLOBAL LOGISTICS', size=8, color=WHITE)
    title = study.get('title') or 'Revue Stratégique & Marketing'
    _txt(s, _in(0.35), _in(1.5), _in(8), _in(1.8), title,
         size=44, bold=True, color=WHITE)
    period = 'Reporting 2026'
    if study.get('periodLabel'):
        period = f"Reporting {study['periodLabel']}"
    elif study.get('periodStart') and study.get('periodEnd'):
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
    app_v = study.get('appVersion') or 'unknown'
    gen_at = (study.get('generatedAt') or '')[:19].replace('T', ' ')
    _txt(s, _in(0.35), _in(7.25), _in(4.0), _in(0.20),
         f"Build v={app_v}  ·  généré {gen_at}",
         size=7, italic=True, color=RGBColor(0x88, 0x95, 0xA8))


def build_sommaire(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_header(s, 'SOMMAIRE', 'Analyse par métier  |  Focus concurrent  |  Prédiction & CX')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.2')
    # 10 sections — layout 5 colonnes × 2 lignes
    PURPLE = RGBColor(0x6B, 0x46, 0xC1)
    BROWN = RGBColor(0x8B, 0x69, 0x14)
    SLATE = RGBColor(0x47, 0x55, 0x69)
    DARKGREEN = RGBColor(0x05, 0x46, 0x2A)
    cards = [
        ('01', NAVY,      'TIM',     'Transit Import Maritime'),
        ('02', GREEN,     'TEM',     'Transit Export Maritime'),
        ('03', ORANGE,    'Hint.IMP', 'Hinterland Import'),
        ('04', BLUE2,     'Hint.EXP', 'Hinterland Export'),
        ('05', TEAL,      'AÉRIEN',  'Aérien Import'),
        ('06', DARKGREEN, 'DSM',     'Direction Solutions Maritimes'),
        ('07', BROWN,     'DIVERS',  'Focus Mining & AYIMAN'),
        ('08', PURPLE,    'PRÉDICT.','Veille marché & préconisations'),
        ('09', RED,       'CX',      'Expérience client'),
        ('10', SLATE,     'ANALYSE', 'Activité client'),
    ]
    cols = 5
    rows = 2
    margin_x = 0.2
    gap_x = 0.12
    avail_w = 13.33 - 2 * margin_x - gap_x * (cols - 1)
    cw = avail_w / cols
    ch = 2.5
    gap_y = 0.15
    y0 = 1.3
    for i, (num, col, title, desc) in enumerate(cards):
        row = i // cols
        c = i % cols
        x = margin_x + c * (cw + gap_x)
        y = y0 + row * (ch + gap_y)
        _rect(s, _in(x), _in(y), _in(cw), _in(ch),
              fill=RGBColor(0xF0, 0xF2, 0xF5),
              line=RGBColor(0xDD, 0xE0, 0xE4), line_width=0.5)
        # Coloured badge with number
        _rect(s, _in(x + 0.12), _in(y + 0.15), _in(0.55), _in(0.55), fill=col)
        _txt(s, _in(x + 0.12), _in(y + 0.15), _in(0.55), _in(0.55),
             num, size=15, bold=True, color=WHITE, align='center', valign='middle')
        # Title
        _txt(s, _in(x + 0.12), _in(y + 0.85), _in(cw - 0.25), _in(0.4),
             title, size=13, bold=True, color=DGRAY)
        # Description
        _txt(s, _in(x + 0.12), _in(y + 1.30), _in(cw - 0.25), _in(1.1),
             desc, size=9.5, color=MGRAY, wrap=True)


# ────────── TIM (4 slides) ──────────
def build_tim_overview(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_overview_data(study, 'TIM')
    period_label = (study.get('periodLabel')
                    or (f"{study.get('periodStart')} → {study.get('periodEnd')}"
                        if study.get('periodStart') and study.get('periodEnd')
                        else 'periode non definie'))
    # Regle de lecture : la valeur affichee est celle de l'annee N ; le N-1
    # apparait uniquement en variation. Jamais d'addition entre annees.
    _dm = _var_txt(live.get('deltaMarchePct')) if live else None
    _da = _var_txt(live.get('deltaAglPct')) if live else None
    sub = (f"Marché qualifié : {live['kpis']['marche']} TEU"
           + (f" ({_dm})" if _dm else '')
           + f"  |  AGL : {live['kpis']['agl']} TEU"
           + (f" ({_da})" if _da else '')
           + f"  |  PDM AGL : {live['kpis']['pdm']}") if live else \
          'Aucune donnée sur la période sélectionnée'
    add_header(s, f"TIM – VUE D'ENSEMBLE  |  {period_label}", sub)
    add_footer(s, f"Africa Global Logistics – Étude de Marché {period_label}  |  p.4")
    if live:
        ecart_color = GREEN if live['ecart'] >= 0 else RED
        kpis = [
            {'label': 'Marché qualifié (N)', 'value': live['kpis']['marche'],
             'sub': _dm or f"TEU — {period_label}",
             'color': _var_color(live.get('deltaMarchePct')) if _dm else None},
            {'label': 'Volume AGL (N)', 'value': live['kpis']['agl'],
             'sub': _da or f"TEU — {period_label}",
             'color': _var_color(live.get('deltaAglPct')) if _da else None},
            {'label': 'PDM AGL (N)', 'value': live['kpis']['pdm'],
             'sub': (_var_txt(live.get('deltaPdmPts'), ' pt vs N-1')
                     or ('#1 – Leader' if live['aglRank'] == 1 else f"Rang #{live['aglRank'] or '—'}")),
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
         ('Évolution mensuelle marché TIM & AGL (TEU) — N vs N-1'
          if study.get('comparisonYear') else 'Évolution mensuelle marché TIM & AGL (TEU)'),
         size=11, bold=True, color=DGRAY)
    # 4 séries groupées par mois : Marché N + AGL N + Marché N-1 + AGL N-1
    # (couleurs distinctes pour distinguer N et N-1, palette navy/gold ⇋ light).
    if live and live.get('monthlyMarket'):
        _mN1 = live.get('monthlyMarketN1') or []
        _aN1 = live.get('monthlyAglN1') or []
        # Etude sans comparatif : on omet les series N-1 plutot que de tracer
        # des barres plates a zero, qui laisseraient croire a un effondrement.
        _has_n1 = any(v for v in _mN1) or any(v for v in _aN1)
        if _has_n1:
            series = [
                {'name': 'Marché qualifié N',  'labels': live['monthLabels'], 'values': live['monthlyMarket']},
                {'name': 'Marché qualifié N-1', 'labels': live['monthLabels'],
                 'values': _mN1 or [0] * len(live['monthLabels'])},
                {'name': 'AGL N',  'labels': live['monthLabels'], 'values': live['monthlyAgl']},
                {'name': 'AGL N-1', 'labels': live['monthLabels'],
                 'values': _aN1 or [0] * len(live['monthLabels'])},
            ]
        else:
            series = [
                {'name': 'Marché qualifié',  'labels': live['monthLabels'], 'values': live['monthlyMarket']},
                {'name': 'AGL',  'labels': live['monthLabels'], 'values': live['monthlyAgl']},
            ]
    else:
        labels = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai']
        series = [{'name': 'Marché qualifié N',  'labels': labels, 'values': [41800, 36800, 43600, 38500, 33200]},
                  {'name': 'Marché qualifié N-1', 'labels': labels, 'values': [38000, 34000, 40500, 35200, 30800]},
                  {'name': 'AGL N',  'labels': labels, 'values': [3470, 2544, 3270, 3278, 2571]},
                  {'name': 'AGL N-1', 'labels': labels, 'values': [3100, 2300, 2900, 2980, 2400]}]
    # Palette : navy + navy clair (marché) ; gold + gold clair (AGL)
    _pal = ([NAVY, GOLD] if len(series) == 2
            else [NAVY, RGBColor(0x6C, 0x80, 0xA0), GOLD, RGBColor(0xE0, 0xCD, 0x96)])
    add_bar_chart(s, 0.15, 2.55, 6.8, 4.3, series, _pal)

    # Mensuel bars right
    _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
         'PDM AGL par mois – TIM', size=11, bold=True, color=DGRAY)
    if live and live.get('monthlyPdm'):
        pdm_labels = [next((m for m in MONTHS_FR_FULL if m.startswith(l)), l)
                      for l in live['monthLabels']]
        pdm_values = live['monthlyPdm']
        pdm_values_n1 = live.get('monthlyPdmN1')
        seuil = live['aglPdm']
    else:
        pdm_labels = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai']
        pdm_values = [8.3, 6.9, 7.5, 8.5, 7.8]
        pdm_values_n1 = None
        seuil = 7.5
    _m_row_h, _m_leg_y, _m_ins_y, _m_ins_h = mensuel_layout(len(pdm_labels))
    add_mensuel_bars(s, 7.1, 2.62, pdm_labels, pdm_values, seuil, pdm_values_n1,
                     row_h=_m_row_h)
    # Légende : vert si PDM N ≥ même mois N-1, orange sinon
    legend_mode = 'n1' if (pdm_values_n1 and any(v > 0 for v in pdm_values_n1)) else 'moyenne'
    add_mensuel_legend(s, 7.1, _m_leg_y, seuil=seuil, mode=legend_mode)

    # Insight enrichi (live) ou fallback statique
    if live:
        lines = compute_metier_insights(live, unit='TEU')
    else:
        lines = [
            "📊 PDM AGL : 7,8 % sur 193 989 TEU de marché — rang #1.",
            "🥈 #2 = STRACOTRANS — avance AGL +558 TEU (à consolider).",
            "🎯 TOP 4 transitaires = 29,1 % du marché qualifié.",
            "📈 Meilleur mois : Avril (8,5 %) · ⚠ Plus faible : Février (6,9 %).",
            "→ Tendance période : stabilité (+0,1 pt entre 1ʳᵉ et 2ᵈᵉ moitié).",
        ]
    add_insight_box(s, 7.1, _m_ins_y, 6.0, _m_ins_h, '✓', lines, bg=EGREEN)


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
    hl = live['aglRowIdx'] if live and 0 <= live['aglRowIdx'] < 20 else 0
    add_rank_table(s, 0.15, 1.5, 6.8, ['Rang', 'Transitaire', 'TEU', 'PDM'], rows, hl, max_h=3.95)
    # Insight enrichi (rang AGL N vs N-1, mouvements concurrents, segments gagnés/érodés)
    if live:
        ins_lines = compute_concurrents_insights(live, 'TIM', unit='TEU')
    else:
        ins_lines = [
            "💡 Leader de justesse. Forces : Mat. Miniers (74 %), Médicaments (50 %), PVC (32 %).",
            "🏁 Uploader STATCOM TIM N + N-1 pour activer l'analyse live (rang N vs N-1, mouvements concurrents).",
        ]
    add_insight_box(s, 0.15, 5.45, 6.8, 1.55, '💡', ins_lines, bg=EYELLOW)

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
    # Légende couleurs segments (N vs N-1) sous les barres
    add_segment_legend(s, 7.1, 6.30)


def build_tim_clientele(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_clientele_data(study, 'TIM')
    add_header(s, 'TIM – CLIENTÈLE AGL', 'Top 20 destinataires  |  Mix marchandises')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.6')
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         'Top 20 clients AGL – TIM (Destinataires, TEU)',
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
                   ['Client (Destinataire)', 'TEU', 'Segment', '% Vol. AGL'], rows, max_h=3.85)
    add_insight_box(s, 0.15, 5.35, 7.0, 1.70, '⚠',
                    compute_clientele_insights(live, 'TIM', unit='TEU'),
                    bg=EYELLOW)

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
        add_insight_box(s, 0.15, 5.65, 12.9, 1.55, '💡',
                        compute_nouveaux_insights(live, 'TIM', unit='TEU'),
                        bg=EYELLOW)
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
    # Regle de lecture : valeur = annee N ; le N-1 n'apparait qu'en variation.
    _dm = _var_txt(live.get('deltaMarchePct')) if live else None
    _da = _var_txt(live.get('deltaAglPct')) if live else None
    _plabel = study.get('periodLabel') or 'période'
    sub = (f"Marché : {live['kpis']['marche']} {unit}" + (f" ({_dm})" if _dm else '')
           + f"  |  AGL : {live['kpis']['agl']} {unit}" + (f" ({_da})" if _da else '')
           + f"  |  PDM : {live['kpis']['pdm']}") if live \
          else 'Aucune donnée sur la période sélectionnée'
    add_header(s, f"{label} – VUE D'ENSEMBLE  |  {_plabel}", sub)
    add_footer(s, f"Africa Global Logistics – Étude de Marché {_plabel}  |  p.{page_no}")
    if live:
        ecart_color = GREEN if live['ecart'] >= 0 else RED
        kpis = [
            {'label': f'Marché {unit} (N)', 'value': live['kpis']['marche'],
             'sub': _dm or _plabel,
             'color': _var_color(live.get('deltaMarchePct')) if _dm else None},
            {'label': f'AGL {unit} (N)', 'value': live['kpis']['agl'],
             'sub': _da or _plabel,
             'color': _var_color(live.get('deltaAglPct')) if _da else None},
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
         (f"Évolution mensuelle {label} & AGL ({unit}) — N vs N-1"
          if study.get('comparisonYear') else f"Évolution mensuelle {label} & AGL ({unit})"),
         size=11, bold=True, color=DGRAY)
    if live and live.get('monthlyMarket'):
        n_labels = live['monthLabels']
        _mN1 = live.get('monthlyMarketN1') or []
        _aN1 = live.get('monthlyAglN1') or []
        if any(v for v in _mN1) or any(v for v in _aN1):
            series = [
                {'name': 'Marché N',  'labels': n_labels, 'values': live['monthlyMarket']},
                {'name': 'Marché N-1', 'labels': n_labels,
                 'values': _mN1 or [0] * len(n_labels)},
                {'name': 'AGL N',  'labels': n_labels, 'values': live['monthlyAgl']},
                {'name': 'AGL N-1', 'labels': n_labels,
                 'values': _aN1 or [0] * len(n_labels)},
            ]
        else:
            series = [
                {'name': 'Marché',  'labels': n_labels, 'values': live['monthlyMarket']},
                {'name': 'AGL',  'labels': n_labels, 'values': live['monthlyAgl']},
            ]
    else:
        series = fallback_series
    _pal = ([NAVY, GOLD] if len(series) == 2
            else [NAVY, RGBColor(0x6C, 0x80, 0xA0), GOLD, RGBColor(0xE0, 0xCD, 0x96)])
    add_bar_chart(s, 0.15, 2.55, 6.8, 4.3, series, _pal)

    _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
         f'PDM AGL par mois – {label}', size=11, bold=True, color=DGRAY)
    pdm_labels = ([next((m for m in MONTHS_FR_FULL if m.startswith(l)), l)
                   for l in live['monthLabels']]
                  if live and live.get('monthlyPdm') else fallback_pdm[0])
    pdm_values = live['monthlyPdm'] if live and live.get('monthlyPdm') else fallback_pdm[1]
    pdm_values_n1 = live.get('monthlyPdmN1') if live else None
    seuil = live['aglPdm'] if live else fallback_pdm[2]
    _m_row_h, _m_leg_y, _m_ins_y, _m_ins_h = mensuel_layout(len(pdm_labels))
    add_mensuel_bars(s, 7.1, 2.62, pdm_labels, pdm_values, seuil, pdm_values_n1,
                     row_h=_m_row_h)
    legend_mode = 'n1' if (pdm_values_n1 and any(v > 0 for v in pdm_values_n1)) else 'moyenne'
    add_mensuel_legend(s, 7.1, _m_leg_y, seuil=seuil, mode=legend_mode)
    if live:
        lines = compute_metier_insights(live, unit=unit)
    else:
        lines = [f"📊 Référence {label} — uploader STATCOM N + N-1 pour activer l'analyse live."]
    add_insight_box(s, 7.1, _m_ins_y, 6.0, _m_ins_h, '✓', lines, bg=EGREEN)


def build_metier_concurrents(prs, study, code, label, page_no, fallback_rows, fallback_segs, unit='TEU'):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_concurrents_data(study, code)
    add_header(s, f"{label} – CONCURRENTS & SEGMENTS",
               (f"Classement live ({live['source']})" if live else 'Classement transitaires'))
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         f'Classement Transitaires – {label}', size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else fallback_rows
    hl = live['aglRowIdx'] if live and 0 <= live['aglRowIdx'] < 20 else 0
    add_rank_table(s, 0.15, 1.5, 6.8, ['Rang', 'Transitaire', unit, 'PDM'], rows, hl, max_h=3.95)
    _txt(s, _in(7.1), _in(1.2), _in(6.0), _in(0.28),
         f"PDM AGL par segment – {label}", size=11, bold=True, color=DGRAY)
    segs = live.get('segmentBars') if live else None
    add_segment_bars(s, 7.1, 1.52, segs or fallback_segs)
    # Légende couleurs segments (N vs N-1) sous les barres
    add_segment_legend(s, 7.1, 6.30)
    # Insight box jaune enrichi
    lines = compute_concurrents_insights(live, label, unit=unit)
    add_insight_box(s, 0.15, 5.45, 6.8, 1.55, '💡', lines, bg=EYELLOW)


def build_metier_clientele(prs, study, code, label, page_no, fallback_rows,
                           fallback_mix_labels, fallback_mix_values, unit='TEU'):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_clientele_data(study, code)
    add_header(s, f"{label} – CLIENTÈLE AGL",
               'Top 20 clients  |  Mix marchandises')
    add_footer(s, f"Africa Global Logistics – Étude de Marché 2026  |  p.{page_no}")
    _txt(s, _in(0.25), _in(1.2), _in(6.5), _in(0.28),
         f'Top 20 clients AGL – {label}', size=11, bold=True, color=DGRAY)
    rows = live['rows'] if live else fallback_rows
    add_rank_table(s, 0.15, 1.5, 7.0,
                   ['Client', 'Volume', 'Segment', '% AGL'], rows, max_h=3.85)
    add_insight_box(s, 0.15, 5.35, 7.0, 1.70, '⚠',
                    compute_clientele_insights(live, label, unit=unit),
                    bg=EYELLOW)
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
        add_insight_box(s, 0.15, 5.70, 12.9, 1.45, '💡',
                        compute_nouveaux_insights(live, label, unit=unit),
                        bg=EYELLOW)
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
             ('Évolution mensuelle import & AGL (tonnes) — N vs N-1'
              if study.get('comparisonYear') else 'Évolution mensuelle import & AGL (tonnes)'),
             size=11, bold=True, color=DGRAY)
        if ov['monthLabels']:
            n_labels = ov['monthLabels']
            add_bar_chart(s, 0.15, 2.55, 6.8, 3.9, [
                {'name': 'Marché N',  'labels': n_labels, 'values': ov['monthlyMarket']},
                {'name': 'Marché N-1', 'labels': n_labels,
                 'values': ov.get('monthlyMarketN1') or [0] * len(n_labels)},
                {'name': 'AGL N',  'labels': n_labels, 'values': ov['monthlyAgl']},
                {'name': 'AGL N-1', 'labels': n_labels,
                 'values': ov.get('monthlyAglN1') or [0] * len(n_labels)},
            ], [NAVY, RGBColor(0x6C, 0x80, 0xA0), GREEN, RGBColor(0x9E, 0xC9, 0xB0)])
        _txt(s, _in(7.1), _in(2.28), _in(5.8), _in(0.28),
             'PDM AGL par mois (%)', size=11, bold=True, color=DGRAY)
        pdm_n1_vals = ov.get('monthlyPdmN1')
        _m_row_h, _m_leg_y, _m_ins_y, _m_ins_h = mensuel_layout(len(ov['monthLabels']))
        add_mensuel_bars(s, 7.1, 2.62, ov['monthLabels'], ov['monthlyPdm'],
                         ov['aglPdm'], pdm_n1_vals, row_h=_m_row_h)
        legend_mode = 'n1' if (pdm_n1_vals and any(v > 0 for v in pdm_n1_vals)) else 'moyenne'
        add_mensuel_legend(s, 7.1, _m_leg_y, seuil=ov['aglPdm'], mode=legend_mode)
        # Insight enrichi DSM
        lines = [f"🚢 AGL consignataire {ov['kpis']['rang']} avec {ov['kpis']['pdm']} du tonnage marché."]
        if ov.get('aglGrowthPct') is not None:
            sign = '+' if ov['aglGrowthPct'] >= 0 else ''
            lines.append(f"📈 Tonnage AGL vs N-1 : {sign}{ov['aglGrowthPct']} % (était {ov['aglTonnageN1']} T).")
        if ov.get('marketGrowthPct') is not None:
            sign = '+' if ov['marketGrowthPct'] >= 0 else ''
            lines.append(f"🌊 Marché global vs N-1 : {sign}{ov['marketGrowthPct']} % (était {ov['marketN1']} T).")
        if ov.get('secondName'):
            lines.append(f"🥈 Concurrent #2 : {ov['secondName']}.")
        add_insight_box(s, 7.1, _m_ins_y, 6.0, _m_ins_h, '🚢', lines, bg=EGREEN)
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
    # ── Bloc bas : 3 HISTOGRAMMES VERTICAUX (column charts natifs).
    # Les noms (parfois longs : MEDITERRANEE ORIENTALE, CLINKER/GYPSE)
    # passent en label sous chaque barre verticale → plus de chevauchement
    # avec la colonne tonnage voisine.
    yR = 3.95
    chart_h = 2.95

    def _raw(ds_name):
        d = find_dataset(study, 'DSM', ds_name)
        return d['rows'] if d and d.get('rows') else []

    def _trunc(name, n=14):
        s = str(name or '')
        return s if len(s) <= n else s[:n - 1] + '…'

    _txt(s, _in(x1), _in(yR), _in(col_w), _in(0.22),
         'Ports de déchargement (tonnage)', size=9, bold=True, color=NAVY)
    ports = _raw('dsm_ports')[:4]
    if ports:
        add_bar_chart(s, x1, yR + 0.27, col_w, chart_h,
                      [{'name': 'Tonnage',
                        'labels': [_trunc(p.get('name'), 12) for p in ports],
                        'values': [int(p.get('tonnage') or 0) for p in ports]}],
                      [NAVY])

    _txt(s, _in(x2), _in(yR), _in(col_w), _in(0.22),
         'Range / origines (PDM AGL %)', size=9, bold=True, color=NAVY)
    ranges = _raw('dsm_ranges')[:4]
    if ranges:
        add_bar_chart(s, x2, yR + 0.27, col_w, chart_h,
                      [{'name': 'PDM AGL %',
                        'labels': [_trunc(r.get('name'), 12) for r in ranges],
                        'values': [round(float(r.get('pdm_agl') or 0), 1) for r in ranges]}],
                      [GREEN])

    md = dsm.get('manutDetail')
    title3 = (f"Détail #1 manut. ({(md.get('manutentionnaire') or '')[:22]}) — marchandise"
              if md else 'Détail manutentionnaire')
    _txt(s, _in(x3), _in(yR), _in(col_w), _in(0.22),
         title3, size=9, bold=True, color=NAVY)
    if md and md.get('par_marchandise'):
        merch_rows = md['par_marchandise'][:4]
        add_bar_chart(s, x3, yR + 0.27, col_w, chart_h,
                      [{'name': 'Tonnage',
                        'labels': [_trunc(r.get('name'), 12) for r in merch_rows],
                        'values': [int(r.get('tonnage') or 0) for r in merch_rows]}],
                      [GOLD])


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
    # ── Insight enrichi DSM nouveaux entrants (parité avec les autres
    # slides nouveaux entrants STATCOM) ────────────────────────────────
    nouv_arm = (find_dataset(study, 'DSM', 'dsm_nouveaux_armateurs') or {'rows': []})['rows']
    nouv_merch = (find_dataset(study, 'DSM', 'dsm_nouvelles_marchandises') or {'rows': []})['rows']
    top_growth = (find_dataset(study, 'DSM', 'dsm_top_growth') or {'rows': []})['rows']
    cons = (find_dataset(study, 'DSM', 'dsm_consignataires') or {'rows': []})['rows']
    lines = [
        f"📊 Synthèse DSM : {len(nouv_arm)} nouveaux armateurs · "
        f"{len(nouv_merch)} nouvelles marchandises (vs N-1) — dynamique du marché maritime au poids."
    ]
    if nouv_arm:
        a = nouv_arm[0]
        v = float(a.get('tonnage') or 0)
        pdm = float(a.get('pdm_marche') or 0)
        alert = '⚠' if pdm >= 1.0 else '🆕'
        lines.append(
            f"{alert} Nouvel armateur #1 : {str(a.get('name') or '')[:28]} "
            f"({fmt_int(v)} T, {pdm:.1f} %".replace('.', ',') + ' PDM marché).'
            + (' Acteur déjà significatif → surveillance.' if pdm >= 1.0 else '')
        )
    if nouv_merch:
        big = [m for m in nouv_merch if float(m.get('tonnage') or 0) >= 500][:3]
        if big:
            lbls = ', '.join([
                f"{str(m.get('name') or '')[:18]} ({fmt_int(m.get('tonnage'))} T)"
                for m in big
            ])
            lines.append(f"📦 Nouvelles marchandises à fort tonnage : {lbls}.")
        absent_agl = [m for m in nouv_merch[:5]
                      if float(m.get('pdm_agl') or 0) == 0 and float(m.get('tonnage') or 0) >= 200]
        if absent_agl:
            lbls = ', '.join([str(m.get('name') or '')[:20] for m in absent_agl[:3]])
            lines.append(f"🎯 AGL ABSENTE (PDM 0 %) sur ces nouvelles marchandises — gisement : {lbls}.")
    if top_growth:
        g = top_growth[0]
        delta = float(g.get('delta') or 0)
        gp = g.get('growth_pct')
        pdm_g = float(g.get('pdm_agl') or 0)
        growth_str = f"+{gp} %" if gp is not None else 'nouveau'
        emoji = '⚠' if pdm_g <= 5 else '✅'
        lines.append(
            f"{emoji} Plus forte hausse marché : {str(g.get('name') or '')[:25]} "
            f"(+{fmt_int(delta)} T, {growth_str}, PDM AGL {pdm_g:.0f} %) — "
            + ('AGL sous-représentée, à investir.' if pdm_g <= 5
               else 'AGL bien positionnée pour capter la hausse.')
        )
    if cons:
        # Rang AGL parmi consignataires
        agl_idx = next((i for i, c in enumerate(cons)
                        if 'AGL' in (c.get('name') or '').upper()), None)
        if agl_idx is not None:
            agl = cons[agl_idx]
            lines.append(
                f"🏢 AGL CI consignataire #{agl_idx + 1} ({fmt_int(agl.get('tonnage'))} T, "
                f"{agl.get('pdm_marche')} % du marché tonnage)."
            )
    add_insight_box(s, 0.15, 5.70, 12.9, 1.45, '💡', lines, bg=EYELLOW)


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
        prs, study, 'MINING', 'FOCUS MINIER', 'mining-2',
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
             'Top 20 clients miniers (marché) — part AGL',
             size=11, bold=True, color=DGRAY)
        dest_rows = (liveN.get('topDestinataires') if liveN and liveN.get('topDestinataires')
                     else (liveC['rows'] if liveC else [['—', '—', '—', '—']]))
        add_rank_table(s, 0.15, 1.5, 6.6,
                       ['Client minier', 'TEU marché', 'TEU AGL', 'PDM AGL'], dest_rows, max_h=3.90)
        _txt(s, _in(7.0), _in(1.2), _in(6.2), _in(0.28),
             'Top marchandises minières — PDM AGL', size=11, bold=True, color=DGRAY)
        if liveConc and liveConc.get('segmentBars'):
            add_segment_bars(s, 7.0, 1.55, liveConc['segmentBars'][:9])
        else:
            add_insight_box(s, 7.0, 1.55, 6.2, 0.8, 'ℹ',
                            ['Marchandises minières indisponibles.'])
        # ── Insight box jaune MINING enrichi ─────────────────────────
        lines = []
        # 1. Concentration top client minier
        if liveC and liveC.get('topClient') and liveC.get('topClientShare'):
            lines.append(f"⚠ Concentration #1 : {liveC['topClient']} = {liveC['topClientShare']} "
                         "du volume AGL sur le segment minier.")
        # 2. Cumul TOP 3 / TOP 5 destinataires
        dest_raw = (liveN.get('_rawDestinataires') if liveN else None) or []
        if dest_raw:
            total_dest = sum(float(r.get('volume') or 0) for r in dest_raw) or 1
            top3 = sum(float(r.get('volume') or 0) for r in dest_raw[:3]) / total_dest * 100
            top5 = sum(float(r.get('volume') or 0) for r in dest_raw[:5]) / total_dest * 100
            lines.append(
                f"🎯 TOP 3 destinataires miniers = {top3:.1f}".replace('.', ',') +
                f" % du marché minier · TOP 5 = {top5:.1f}".replace('.', ',') +
                " % (mesure de concentration sectorielle)."
            )
        # 3. Position AGL minier (rang + PDM + écart vs #2)
        full = liveConc.get('fullRanked') if liveConc else None
        if full:
            name_key = 'transitaire' if (full and 'transitaire' in full[0]) else 'nom_entite'
            agl_idx = next((i for i, r in enumerate(full)
                            if is_agl(str(r.get(name_key) or ''))), None)
            if agl_idx is not None and agl_idx < len(full):
                agl = full[agl_idx]
                pdm = float(agl.get('pdm') or 0)
                vol = float(agl.get('volume') or 0)
                line = f"🏁 AGL #{agl_idx + 1} minier ({pdm:.1f}".replace('.', ',') + f" %, {fmt_int(vol)} TEU)"
                if agl_idx == 0 and len(full) > 1:
                    sec = full[1]
                    ecart = vol - float(sec.get('volume') or 0)
                    line += (f" — avance vs #2 {str(sec.get(name_key, ''))[:18]} : "
                             f"+{fmt_int(ecart)} TEU.")
                elif agl_idx > 0:
                    leader = full[0]
                    ecart = float(leader.get('volume') or 0) - vol
                    line += (f" — leader {str(leader.get(name_key, ''))[:18]} à "
                             f"+{fmt_int(ecart)} TEU.")
                else:
                    line += "."
                lines.append(line)
        # 4. Marchandises minières : forces (PDM ≥ 50 %)
        segs = liveConc.get('rawSegments') if liveConc else None
        if segs:
            forces = sorted([sg for sg in segs if float(sg.get('pdm_agl') or 0) >= 50],
                            key=lambda sg: -float(sg.get('pdm_agl') or 0))[:3]
            if forces:
                lbls = ', '.join([
                    f"{str(sg.get('segment', ''))[:22]} ({int(round(float(sg.get('pdm_agl') or 0)))} %)"
                    for sg in forces
                ])
                lines.append(f"💪 Marchandises minières DOMINÉES par AGL (PDM ≥ 50 %) : {lbls}.")
            # Marchandises minières où AGL faible mais marché significatif
            weak = sorted([sg for sg in segs
                           if 0 < float(sg.get('pdm_agl') or 0) <= 20
                           and float(sg.get('volume_marche') or 0) >= 100],
                          key=lambda sg: -float(sg.get('volume_marche') or 0))[:3]
            if weak:
                lbls = ', '.join([
                    f"{str(sg.get('segment', ''))[:22]} ({int(round(float(sg.get('pdm_agl') or 0)))} %, "
                    f"{fmt_int(sg.get('volume_marche'))} TEU)"
                    for sg in weak
                ])
                lines.append(f"🎯 Conquête prioritaire (PDM ≤ 20 %, marché ≥ 100 TEU) : {lbls}.")
        # 5. Synthèse stratégique
        lines.append("⛏ ENJEU MINIER : verrouiller les clients miniers historiques "
                     "(K1 Mining, Lafigué, Yaouré) tout en élargissant aux nouveaux "
                     "projets PND (Sissingué, Lauzoua, Mt Klahoyo).")
        add_insight_box(s, 0.15, 5.40, 12.9, 1.72, '⛏',
                        lines, bg=EYELLOW)
    else:
        add_insight_box(s, 0.15, 1.5, 12.9, 5, 'ℹ',
                        ['Uploader TIM (N + N-1) pour activer l\'analyse minière.'])


# ────────── AYIMAN (3 slides) ──────────
def build_ayman_overview(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_ayman_focus_data(study)
    sub = (f"TIM {live['timTotalN']} TEU sur la période · {live['timTotalN1']} TEU N-1"
           if live else 'Volume AYIMAN  |  Croissance N vs N-1')
    add_header(s, "FOCUS AYIMAN – VUE D'ENSEMBLE  |  Maritime import", sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.ayman-1')
    if live and live.get('parMetier'):
        tim = next((m for m in live['parMetier'] if 'TIM' in str(m[0])), None)
        kpis = [
            {'label': 'AYIMAN TIM', 'value': live['timTotalN'], 'sub': 'TEU période'},
            {'label': 'Évolution N-1', 'value': (
                ('+' if (live.get('timGrowthPct') or 0) >= 0 else '') +
                f"{live['timGrowthPct']} %") if live.get('timGrowthPct') is not None else '—',
             'sub': 'TEU N-1',
             'color': GREEN if (live.get('timGrowthPct') or 0) >= 0 else RED, 'big': True},
            {'label': 'Rang AYIMAN TIM', 'value': tim[1] if tim else 'NC', 'sub': 'transitaires'},
            {'label': 'PDM AYIMAN TIM', 'value': tim[3] if tim else '—', 'sub': 'du marché'},
            {'label': 'PDM AGL TIM', 'value': tim[4] if tim else '—',
             'sub': 'référence', 'color': GREEN},
        ]
        add_kpi_bar(s, kpis)
        evol = live.get('evolution') or []
        if evol:
            _txt(s, _in(0.25), _in(2.28), _in(12.9), _in(0.28),
                 ('Évolution mensuelle AYIMAN (TIM, TEU) — N vs N-1'
                  if study.get('comparisonYear') else 'Évolution mensuelle AYIMAN (TIM, TEU)'),
                 size=11, bold=True, color=DGRAY)
            labels_e = [e.get('mois', '') for e in evol]
            add_bar_chart(s, 0.15, 2.55, 12.9, 3.0,
                          [{'name': 'AYIMAN N',  'labels': labels_e,
                            'values': [int(round(e.get('vol', 0))) for e in evol]},
                           {'name': 'AYIMAN N-1', 'labels': labels_e,
                            'values': [int(round(e.get('vol_n1', 0))) for e in evol]}]
                          if any(e.get('vol_n1') for e in evol) else
                          [{'name': 'AYIMAN', 'labels': labels_e,
                            'values': [int(round(e.get('vol', 0))) for e in evol]}],
                          [ORANGE, RGBColor(0xF5, 0xC2, 0x9F)])
        # Sans comparatif, timTotalN1 vaut 0 : annoncer une progression
        # "0 -> 1 245 TEU" serait faux. On se limite au volume de l'annee N.
        try:
            _n1val = float(str(live.get('timTotalN1') or 0).replace(' ', '').replace(',', '.'))
        except Exception:
            _n1val = 0.0
        if study.get('comparisonYear') and _n1val > 0:
            _ay_line = (f"DYNAMIQUE : AYIMAN "
                        f"{('progresse' if (live.get('timGrowthPct') or 0) >= 0 else 'recule')} "
                        f"vs N-1 ({live['timTotalN1']} → {live['timTotalN']} TEU).")
        else:
            _ay_line = f"VOLUME AYIMAN sur la période : {live['timTotalN']} TEU (aucun comparatif N-1)."
        add_insight_box(s, 0.15, 5.7, 12.9, 1.2, '⚠', [_ay_line])
    else:
        add_insight_box(s, 0.15, 1.6, 12.9, 1.2, 'ℹ',
                        ['Uploader STATCOM (TIM + AER) pour activer l\'analyse AYIMAN.'])


def build_ayman_detail(prs, study):
    """Étude AYIMAN complète multi-métier : 3 colonnes (Import / Export /
    Aérien) avec, pour chacune : KPIs métier, top clients (destinataires
    pour import + aérien, chargeurs pour export), top marchandises,
    clients communs AGL↔AYIMAN. Insight cross-métier en bas."""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    live = build_ayman_focus_data(study)
    add_header(s, 'FOCUS AYIMAN – ÉTUDE COMPLÈTE MULTI-MÉTIERS',
               'Import (TIM/HIMP) · Aérien (AER) · Clients communs AGL↔AYIMAN')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.ayman-3')

    if not live or not live.get('byMetierDetail'):
        add_insight_box(s, 0.15, 1.6, 12.9, 1.2, 'ℹ',
                        ["Uploader STATCOM (TIM + HIMP + HEXP + TEM + AER) "
                         "+ N-1 pour activer l'étude complète AYIMAN."])
        return

    detail = live['byMetierDetail']
    # Regroupement par grand bloc fonctionnel. EXPORT retiré sur demande
    # (focus AYIMAN = import maritime + aérien uniquement).
    blocks = [
        ('IMPORT MARITIME', ['TIM', 'HIMP'], NAVY),
        ('AÉRIEN', ['AER'], GOLD),
    ]

    col_w = 6.45
    gap = 0.15
    x0 = 0.15
    xs = [x0, x0 + col_w + gap]

    def fmt_growth(g):
        if g is None:
            return '—'
        sign = '+' if g >= 0 else ''
        return f"{sign}{g} %"

    for ci, (title, codes, color) in enumerate(blocks):
        x = xs[ci]
        # Bandeau couleur titre
        _rect(s, _in(x), _in(1.18), _in(col_w), _in(0.30), fill=color)
        _txt(s, _in(x + 0.12), _in(1.20), _in(col_w - 0.20), _in(0.26),
             title, size=10, bold=True, color=WHITE, valign='middle', wrap=False)

        # Agréger les métiers actifs du bloc
        active = [(c, detail[c]) for c in codes if c in detail]
        if not active:
            _txt(s, _in(x + 0.05), _in(1.55), _in(col_w), _in(0.28),
                 "Données indisponibles", size=9, color=MGRAY)
            continue

        # KPIs synthétiques du bloc (somme volumes, PDM moyenne pondérée).
        sum_vol = sum(d.get('vol', 0) for _, d in active)
        sum_vol_n1 = sum(d.get('vol_n1', 0) for _, d in active)
        growth = (((sum_vol - sum_vol_n1) / sum_vol_n1) * 100 if sum_vol_n1 > 0 else None)
        unit = active[0][1].get('unit', 'TEU')
        avg_pdm = (sum(d.get('pdm', 0) * d.get('vol', 0) for _, d in active) /
                   sum_vol if sum_vol > 0 else 0)
        agl_avg_pdm = (sum(d.get('agl_pdm', 0) * d.get('vol', 0) for _, d in active) /
                       sum_vol if sum_vol > 0 else 0)
        rang_lbl = ', '.join([f"{c} #{d.get('rang') or '—'}" for c, d in active])

        # Ligne KPIs
        y = 1.55
        kpi_h = 0.32
        kpi_y = y
        _rect(s, _in(x), _in(kpi_y), _in(col_w), _in(kpi_h),
              fill=RGBColor(0xF8, 0xFA, 0xFC), line=LINE_GR, line_width=0.3)
        kpi_text = (f"AYIMAN : {fmt_int(sum_vol)} {unit}  |  "
                    f"PDM {avg_pdm:.1f} %".replace('.', ',') +
                    f"  |  vs N-1 : {fmt_growth(round(growth, 1) if growth is not None else None)}  |  "
                    f"AGL {agl_avg_pdm:.1f} %".replace('.', ','))
        _txt(s, _in(x + 0.08), _in(kpi_y + 0.04), _in(col_w - 0.16), _in(kpi_h - 0.08),
             kpi_text, size=8, bold=True, color=DGRAY, valign='middle', wrap=False)
        # Rangs
        _txt(s, _in(x + 0.08), _in(kpi_y + 0.32 + 0.02), _in(col_w - 0.16), _in(0.18),
             f"Rangs : {rang_lbl}", size=7.5, color=MGRAY, wrap=False)

        # Top clients (consolidé multi-métiers du bloc) — top 5
        client_map = {}
        for code, d in active:
            for c in d.get('clients', []):
                nm = c.get('name')
                if not nm:
                    continue
                client_map[nm] = client_map.get(nm, 0) + (c.get('vol') or 0)
        top_clients = sorted(client_map.items(), key=lambda kv: -kv[1])[:5]
        total_block = sum_vol or 1
        tab_y = y + 0.55
        _txt(s, _in(x + 0.08), _in(tab_y), _in(col_w - 0.16), _in(0.20),
             ("Top chargeurs AYIMAN" if codes[0] in ('TEM', 'HEXP')
              else "Top destinataires AYIMAN"),
             size=8.5, bold=True, color=NAVY, wrap=False)
        rows_c = [[c[0], fmt_int(c[1]),
                   f"{(c[1]/total_block*100):.1f}".replace('.', ',') + ' %']
                  for c in top_clients] or [['—', '—', '—']]
        add_rank_table(s, x, tab_y + 0.22, col_w,
                       ['Client', unit, '% AYIMAN'], rows_c)

        # Top marchandises — top 5
        merch_map = {}
        for code, d in active:
            for m in d.get('marchandises', []):
                nm = m.get('name')
                if not nm:
                    continue
                merch_map[nm] = merch_map.get(nm, 0) + (m.get('vol') or 0)
        top_merch = sorted(merch_map.items(), key=lambda kv: -kv[1])[:5]
        rows_m = [[m[0], fmt_int(m[1]),
                   f"{(m[1]/total_block*100):.1f}".replace('.', ',') + ' %']
                  for m in top_merch] or [['—', '—', '—']]
        merch_y = tab_y + 0.22 + 0.28 * (len(rows_c) + 1) + 0.12
        _txt(s, _in(x + 0.08), _in(merch_y), _in(col_w - 0.16), _in(0.20),
             "Top marchandises AYIMAN", size=8.5, bold=True, color=NAVY, wrap=False)
        add_rank_table(s, x, merch_y + 0.22, col_w,
                       ['Marchandise', unit, '% AYIMAN'], rows_m)

    # ── Insight bas : synthèse cross-métier ──────────────────────────────
    lines = []
    # 1. Volume total AYIMAN multi-métier
    total_all = sum(d.get('vol', 0) for d in detail.values())
    total_all_n1 = sum(d.get('vol_n1', 0) for d in detail.values())
    if total_all_n1 > 0:
        g = ((total_all - total_all_n1) / total_all_n1) * 100
        arrow = '📈' if g >= 0 else '📉'
        lines.append(
            f"{arrow} AYIMAN tous métiers confondus : {fmt_int(total_all)} (vs {fmt_int(total_all_n1)} N-1, "
            f"{'+' if g >= 0 else ''}{g:.1f} %).".replace('.', ',')
        )
    else:
        lines.append(f"📊 AYIMAN tous métiers confondus : {fmt_int(total_all)} volume cumulé période.")

    # 2. Métier dominant pour AYIMAN
    if detail:
        dom = max(detail.items(), key=lambda kv: kv[1].get('vol', 0))
        lines.append(
            f"🎯 Cœur d'activité AYIMAN : {dom[0]} ({fmt_int(dom[1]['vol'])} {dom[1].get('unit', '')}, "
            f"PDM {dom[1].get('pdm', 0):.1f} %".replace('.', ',') + ")."
        )

    # 3. Clients communs AGL↔AYIMAN (verrouillage prioritaire)
    shared_all = []
    for code, d in detail.items():
        for sc in d.get('sharedClients', []):
            shared_all.append({**sc, 'metier': code, 'unit': d.get('unit', '')})
    if shared_all:
        shared_all.sort(key=lambda x: -x.get('ayiman_vol', 0))
        top_shared = shared_all[:3]
        lbls = '; '.join([
            f"{str(c['name'])[:22]} ({c['metier']}, AYIMAN {fmt_int(c['ayiman_vol'])} {c['unit']} / AGL {fmt_int(c['agl_vol'])})"
            for c in top_shared
        ])
        lines.append(f"🔒 Clients communs prioritaires (à verrouiller) : {lbls}.")

    # 4. Croissance la plus forte — métier
    growths = [(c, d.get('growth_pct')) for c, d in detail.items()
               if d.get('growth_pct') is not None]
    if growths:
        growths.sort(key=lambda kv: -(kv[1] or 0))
        winner = growths[0]
        if (winner[1] or 0) > 5:
            lines.append(
                f"⚠ Métier AYIMAN en plus forte progression : {winner[0]} "
                f"({'+' if (winner[1] or 0) >= 0 else ''}{winner[1]} % vs N-1) — alerte concurrentielle."
            )
        losers = sorted(growths, key=lambda kv: (kv[1] or 0))
        if losers and (losers[0][1] or 0) < -5:
            lines.append(
                f"✅ Métier AYIMAN en recul : {losers[0][0]} ({losers[0][1]} % vs N-1) — fenêtre de reprise AGL."
            )

    # 5. Recommandation finale
    lines.append("📌 Recommandation : verrouiller les destinataires/chargeurs communs, "
                 "ouvrir prospection multi-métiers sur les clients AYIMAN exclusifs (gisement conquête).")

    # 6.55 + 0.85 = 7.40 > pied de page a 7.20 : hauteur ramenee a 0.62.
    add_insight_box(s, 0.15, 6.52, 12.95, 0.62, '🎯', lines, bg=EYELLOW)


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


def build_prediction_newsletters(prs, study):
    """Slide PRÉDICTION – FOCUS PRÉDICTIF NEWSLETTERS & AO.
    Angle distinct de la slide 39 (Signaux de marché — vue d'ensemble) :
    cette slide pousse l'analyse prédictive en croisant les signaux
    newsletters avec la réalité STATCOM et en zoomant sur le pipeline AO
    par statut. Elle ne refait PAS le top sectors qui est déjà sur la 39.
    Contenu :
      - Validation des signaux newsletter par la réalité STATCOM (croisement)
      - Pays / origines cités (zoom géographique pas présent sur la 39)
      - Pipeline AO détaillé par STATUT (alertes pipeline)
      - Lecture stratégique enrichie en bas
    """
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pred = study.get('prediction') or {}
    signals = pred.get('signals') or {}
    sectors = signals.get('sectors') or []
    countries = signals.get('countries') or []
    ao = pred.get('ao')

    pdfn = pred.get('pdfCount', 0)
    sub = (f"Croisement signaux newsletters × réalité STATCOM  |  Pipeline AO par statut  |  "
           f"{pdfn} PDF · AO {ao['sheet'] if ao else '—'}")
    add_header(s, 'PRÉDICTION – FOCUS PRÉDICTIF NEWSLETTERS & AO', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.signaux-2')

    # ── Bloc gauche : VALIDATION secteurs newsletter × marchandises STATCOM ──
    # Pour chaque top secteur newsletter, on cherche si on a une preuve
    # de flux STATCOM correspondant (via le dataset sector_prospects).
    # Permet de distinguer "buzz médiatique" vs "vrai marché en mouvement".
    _txt(s, _in(0.25), _in(1.18), _in(6.4), _in(0.22),
         'Validation prédictive : signal newsletter × flux STATCOM réel',
         size=10, bold=True, color=NAVY)
    # Mapping approximatif secteur newsletter → mots-clés à chercher dans
    # sector_prospects (PND keywords sont déjà bien alignés)
    prospects_ds = find_dataset(study, 'PREDICTION', 'sector_prospects')
    prospects = prospects_ds['rows'] if prospects_ds and prospects_ds.get('rows') else []
    # On match les secteurs newsletter (CIMENT & BTP, AGRO & CACAO, etc.)
    # avec les secteurs PND (BTP & ciment, Agro-industrie, etc.)
    def _norm(s):
        import unicodedata
        return ''.join(c for c in unicodedata.normalize('NFD', str(s).lower())
                       if not unicodedata.combining(c))
    val_rows = []
    for sec in sectors[:6]:
        sec_n = _norm(sec.get('name', ''))
        match = None
        for p in prospects:
            p_n = _norm(p.get('sector', ''))
            # Match par mots-clés partagés (2+ caractères communs significatifs)
            for token in sec_n.split():
                if len(token) >= 4 and token in p_n:
                    match = p
                    break
            if match:
                break
        if match:
            vol = float(match.get('totalVol') or 0)
            pdm = float(match.get('aglPdm') or 0)
            val_status = '✅ Confirmé STATCOM' if vol >= 100 else '⚠ Volume faible'
            val_rows.append([
                str(sec.get('name', ''))[:24],
                f"{sec.get('count', 0)} cit.",
                fmt_int(vol),
                f"{pdm:.0f}%",
                val_status,
            ])
        else:
            val_rows.append([
                str(sec.get('name', ''))[:24],
                f"{sec.get('count', 0)} cit.",
                '—', '—', '🔍 Pas de match',
            ])
    if val_rows:
        add_rank_table(s, 0.15, 1.45, 6.4,
                       ['Secteur', 'Citations', 'Marché STATCOM', 'PDM AGL', 'Validation'],
                       val_rows)
    else:
        add_insight_box(s, 0.15, 1.45, 6.4, 0.8, 'ℹ',
                        ['Déposer newsletters PDF + STATCOM pour activer la validation croisée.'])

    # ── Bloc droite haut : pays / origines (focus géographique) ──────
    _txt(s, _in(7.0), _in(1.18), _in(6.2), _in(0.22),
         'Pays / origines en focus (newsletters)', size=10, bold=True, color=NAVY)
    if countries:
        max_c = max((x.get('count', 0) for x in countries), default=1) or 1
        bars = [{'label': str(x.get('name', '')).upper(),
                 'vol': f"{x.get('count', 0)} cit.",
                 'pdm': int(round(x.get('count', 0) / max_c * 100))}
                for x in countries[:6]]
        add_segment_bars(s, 7.0, 1.45, bars)
    else:
        add_insight_box(s, 7.0, 1.45, 6.2, 0.8, 'ℹ',
                        ['Aucun pays cité — newsletters non déposées.'])

    # ── Bloc droite milieu : Pipeline AO par STATUT (pas par type — déjà sur 39) ──
    _txt(s, _in(7.0), _in(4.10), _in(6.2), _in(0.22),
         'Pipeline AO — détail par statut (top 6)', size=10, bold=True, color=NAVY)
    if ao and ao.get('statuts'):
        statuts = sorted(ao['statuts'].items(), key=lambda kv: -kv[1])[:6]
        total = sum(int(v) for _, v in statuts) or 1
        st_bars = [{'label': str(k), 'vol': f"{v} dossiers",
                    'pdm': int(round(int(v) / total * 100))}
                   for k, v in statuts]
        add_segment_bars(s, 7.0, 4.35, st_bars)
    else:
        add_insight_box(s, 7.0, 4.35, 6.2, 0.8, 'ℹ',
                        ['Déposer RECAP_AO_ET_AGREMENTS pour le pipeline.'])

    # ── Insight bas : lecture prédictive ──────────────────────────────
    lines = []
    confirmed = [r for r in val_rows if r[4].startswith('✅')]
    weak = [r for r in val_rows if r[4].startswith('⚠')]
    no_match = [r for r in val_rows if r[4].startswith('🔍')]
    if val_rows:
        lines.append(
            f"🔬 Validation prédictive : {len(confirmed)} secteur(s) confirmé(s) par STATCOM, "
            f"{len(weak)} à faible volume, {len(no_match)} sans match — signaux media "
            f"vs flux logistiques réels."
        )
    if confirmed:
        lbls = ', '.join([r[0] for r in confirmed[:3]])
        lines.append(f"✅ Signaux CONFIRMÉS (à investir prioritairement) : {lbls}.")
    if no_match:
        lbls = ', '.join([r[0] for r in no_match[:3]])
        lines.append(f"🔍 Buzz médiatique SANS flux STATCOM ({lbls}) : signaux faibles, à surveiller mais pas (encore) actionnable.")
    if countries:
        top_co = ', '.join([f"{c.get('name', '').upper()} ({c.get('count', 0)})"
                            for c in countries[:3]])
        lines.append(f"🌍 Géographie prédictive : {top_co} — origines à anticiper côté sourcing/routes.")
    if ao and ao.get('statuts'):
        total_ao = sum(int(v) for v in ao['statuts'].values())
        en_cours = sum(v for k, v in ao['statuts'].items()
                       if any(t in str(k).lower() for t in ('en cours', 'recevable', 'instruction')))
        if total_ao > 0:
            pct = round(en_cours / total_ao * 100)
            lines.append(f"📋 Pipeline AO ACTIF : {en_cours}/{total_ao} dossiers en cours d'instruction ({pct} %) — "
                         "potentiel de conversion CA dans les 6-12 mois.")
    if not lines:
        lines = ["📊 Déposer newsletters PDF + Excel AO + STATCOM pour activer l'analyse prédictive croisée."]
    add_insight_box(s, 0.15, 6.55, 13.0, 0.85, '💡', lines, bg=EYELLOW)


# ─── PND CI 2026-2030 : projets phares par secteur ──────────────────────────
# Affichés sur la slide PROSPECTS PND à la place des destinataires STATCOM.
# Sourcés des annonces publiques (PND-CI, communiqués gouvernementaux,
# documents bailleurs). À ajuster/compléter par Olivier dans cette constante.
PND_PHARES = {
    'Agro-industrie (cacao, anacarde, hévéa)': [
        'Transformation locale cacao — 2ᵉ transformation (Abidjan, San Pedro)',
        'Plateforme anacarde — Bondoukou & Korhogo (PRTAA)',
        'Programme Hévéa CI 2030 (50 000 ha)',
        'SUCRIVOIRE Ferké & Borotou (sucre)',
    ],
    'Coton & textile': [
        'Relance filière coton-textile (Bouaké, Korhogo)',
        'Zone industrielle textile (PNIA)',
        'Usine de filature Bouaké',
    ],
    'Mines & métaux (or, manganèse, fer)': [
        'Mine d\'or Lafigué (Endeavour Mining)',
        'Mine d\'or Yaouré (Allied Gold)',
        'Mine de Sissingué (Perseus)',
        'Projet manganèse Lauzoua (Bondoukou Manganese)',
        'Projet fer Mt Klahoyo (Tata Steel CI)',
    ],
    'Pétrole / hydrocarbures / gaz': [
        'Champs Baleine (Eni — production 200 kbpd)',
        'Calao (Eni)',
        'Murène (Tullow Oil)',
        'Expansion raffinerie SIR Abidjan',
        'Gazoduc West African Gas Pipeline (WAGP)',
    ],
    'BTP & ciment': [
        'Programme 100 000 logements sociaux',
        '4ᵉ pont d\'Abidjan (HKB)',
        'Métro d\'Abidjan (4 lignes)',
        'Autoroute Yamoussoukro–Bouaké',
        'Extension LafargeHolcim Abidjan & Cimaf Bouaké',
    ],
    'Industrie pharma & santé': [
        'Plan National Production Médicaments (PNPM)',
        'Usine DGH Pharma Abidjan',
        'CHU de Bouaké (extension)',
        'Couverture Maladie Universelle (CMU)',
    ],
    'Agro-alimentaire (riz, blé, sucre, lait)': [
        'Programme national autosuffisance riz',
        'Brassivoire (Bralima/HEINEKEN) — extension Yopougon',
        'Moulins du Cœur de l\'Afrique (MCEA)',
        'SCB Côte d\'Ivoire',
    ],
    'Automobile (véhicules, RoRo)': [
        'Assemblage IVECO San Pedro',
        'Hub RoRo Abidjan (PAA)',
        'Plateforme Volkswagen CI',
        'Programme TROTRO national (transport urbain)',
    ],
    'Pêche & aquaculture': [
        'Plan Aquaculture (PNDAP)',
        'Port de pêche d\'Abidjan (modernisation)',
        'Filière thon (CI Tuna)',
    ],
    'Chimie & engrais': [
        'YARA West Africa (fertilisants — usine San Pedro)',
        'LIBYA Oil CI (lubrifiants)',
        'Programme engrais subventionnés',
    ],
    'Emballages & papier': [
        'VACALU Abidjan',
        'Africa Packaging',
    ],
    'Électroménager / électronique': [
        'Hub électronique CFAO',
        'Programme One Laptop Per Child (OLPC)',
    ],
}


# Mapping explicite secteur newsletter (extrait via prediction.js
# SECTOR_LEXICON) → secteur PND (défini dans dataset-builder.js
# PND_SECTORS). None = pas d'équivalent PND, le secteur n'apparaîtra
# pas sur la slide PROSPECTS NEWSLETTERS faute de flux STATCOM correspondant.
# IMPORTANT : ne pas matcher par sous-chaîne — "industrie" est contenu
# dans "agro-industrie" donc Industrie & Machines pointerait à tort
# sur les chargeurs cacao. Mapping 1:1 explicite obligatoire.
NEWSLETTER_TO_PND = {
    'Mines & Or':           'Mines & métaux (or, manganèse, fer)',
    'Pétrole & Énergie':    'Pétrole / hydrocarbures / gaz',
    'Ciment & BTP':         'BTP & ciment',
    'Agro & Cacao':         'Agro-industrie (cacao, anacarde, hévéa)',
    'Agro-alimentaire':     'Agro-alimentaire (riz, blé, sucre, lait)',
    'Automobile':           'Automobile (véhicules, RoRo)',
    'Pharma & Santé':       'Industrie pharma & santé',
    # Pas d'équivalent PND : ces secteurs newsletters ne se matchent à
    # aucun secteur du Plan National. La slide PROSPECTS NEWSLETTERS
    # les écartera car ils n'auront pas de match STATCOM.
    'Télécoms & Tech':      None,
    'Industrie & Machines': None,
    'Conteneurs & Shipping': None,
}


def build_prediction_newsletter_prospects(prs, study):
    """Slide PRÉDICTION – PROSPECTS PRIORISÉS NEWSLETTERS.
    Pour chaque top secteur cité dans les newsletters PDF, on remonte
    les destinataires/chargeurs STATCOM correspondants — angle distinct
    de la slide PND (qui priorise les 12 secteurs du Plan National).
    Ici, c'est l'actualité média qui dicte la priorité.

    Layout : grille 3 × 2 cartes (top 6 secteurs newsletters) avec, pour
    chacune : citations newsletter + prospects STATCOM réels."""
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pred = study.get('prediction') or {}
    sectors = (pred.get('signals') or {}).get('sectors') or []
    prospects_ds = find_dataset(study, 'PREDICTION', 'sector_prospects')
    prospects = prospects_ds['rows'] if prospects_ds and prospects_ds.get('rows') else []

    pdfn = pred.get('pdfCount', 0)
    sub = (f"Priorisation des prospects par citation média  |  "
           f"{pdfn} newsletter(s) PDF analysée(s)  |  {len(sectors)} secteurs détectés")
    add_header(s, 'PRÉDICTION – PROSPECTS PRIORISÉS NEWSLETTERS', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.prospects-news')

    if not sectors:
        add_insight_box(s, 0.15, 1.6, 12.95, 1.4, 'ℹ',
                        ["Déposer jusqu'à 6 newsletters PDF dans la section Prédiction pour activer la priorisation par signaux média."])
        return

    # Match secteur newsletter → prospects PND via mapping EXPLICITE
    # (NEWSLETTER_TO_PND défini en haut). On évite le matching par
    # sous-chaîne qui faisait confondre "Industrie & Machines" avec
    # "Agro-industrie" (token 'industrie' présent dans les deux).
    def _find_match(sec_name):
        target_pnd = NEWSLETTER_TO_PND.get(sec_name)
        if not target_pnd:
            return None
        for p in prospects:
            if p.get('sector') == target_pnd:
                return p
        return None
        return None

    # 6 cartes en grille 3 × 2
    cols = 3
    card_w = 4.30
    card_h = 2.55
    gap_x = 0.10
    gap_y = 0.12
    x0, y0 = 0.15, 1.18

    # Filtrer : ne garder QUE les secteurs avec un match STATCOM
    # (sinon on aurait des cartes "Pas de marchandise STATCOM détectée"
    # qui ne servent à rien). Top 6 ainsi filtrés.
    shown = [s for s in sectors if _find_match(s.get('name', ''))][:6]
    total_cit = sum(s.get('count', 0) for s in shown) or 1
    if not shown:
        add_insight_box(s, 0.15, 1.6, 12.95, 1.4, 'ℹ',
                        ["Aucun secteur newsletter avec correspondance STATCOM détectée. "
                         "Vérifier que les fichiers STATCOM sont déposés (TIM/HIMP/HEXP/TEM/AER) "
                         "ou que les marchandises citées dans les newsletters apparaissent dans les B/L."])
        return

    for i, sec in enumerate(shown):
        row = i // cols
        c = i % cols
        x = x0 + c * (card_w + gap_x)
        y = y0 + row * (card_h + gap_y)
        match = _find_match(sec.get('name', ''))

        # Couleur bandeau : intensité selon poids du secteur dans le mix newsletter
        weight = sec.get('count', 0) / total_cit
        head_color = NAVY if weight >= 0.20 else (BLUE2 if weight >= 0.10 else GOLD)

        _rect(s, _in(x), _in(y), _in(card_w), _in(card_h),
              fill=RGBColor(0xF9, 0xFA, 0xFC), line=LINE_GR, line_width=0.4)
        _rect(s, _in(x), _in(y), _in(card_w), _in(0.32), fill=head_color)
        cit_lbl = f"{sec.get('count', 0)} CITATIONS ({int(round(weight * 100))} %)"
        _txt(s, _in(x + 0.10), _in(y + 0.04), _in(card_w - 1.50), _in(0.24),
             _fit_text(sec.get('name', ''), card_w - 1.70, pt=10),
             size=10, bold=True, color=WHITE, valign='middle', wrap=False)
        _txt(s, _in(x + card_w - 1.55), _in(y + 0.04), _in(1.45), _in(0.24),
             cit_lbl, size=8, color=WHITE, align='right', valign='middle', wrap=False)

        if match:
            # KPIs marché STATCOM
            vol = float(match.get('totalVol') or 0)
            pdm = float(match.get('aglPdm') or 0)
            metiers = ' · '.join(match.get('metiers') or [])
            kpi_y = y + 0.40
            _txt(s, _in(x + 0.10), _in(kpi_y), _in(card_w - 0.20), _in(0.20),
                 f"Marché STATCOM : {fmt_int(vol)}  ·  AGL : {fmt_int(match.get('aglVol'))} "
                 f"({pdm:.1f} %".replace('.', ',') + ")",
                 size=8, bold=True, color=DGRAY, wrap=False)
            _txt(s, _in(x + 0.10), _in(kpi_y + 0.20), _in(card_w - 0.20), _in(0.16),
                 f"Métiers actifs : {metiers}", size=7.5, color=MGRAY, wrap=False)
            # Prospects (top 5)
            dest = match.get('topDestinataires') or []
            charg = match.get('topChargeurs') or []
            use_dest = len(dest) >= len(charg)
            lst = dest if use_dest else charg
            title_lbl = 'Top destinataires' if use_dest else 'Top chargeurs (export)'
            list_y = kpi_y + 0.42
            _txt(s, _in(x + 0.10), _in(list_y), _in(card_w - 0.20), _in(0.16),
                 f"🎯 {title_lbl} :", size=8, bold=True, color=NAVY, wrap=False)
            for j, cl in enumerate(lst[:5]):
                _txt(s, _in(x + 0.14), _in(list_y + 0.18 + j * 0.18),
                     _in(card_w - 0.28), _in(0.18),
                     f"• {_fit_text(cl.get('name', ''), card_w - 1.30, pt=8)}  "
                     f"({fmt_int(cl.get('vol'))})",
                     size=8, color=DGRAY, wrap=False)
        else:
            _txt(s, _in(x + 0.10), _in(y + 0.50), _in(card_w - 0.20), _in(card_h - 0.60),
                 "🔍 Pas de marchandise STATCOM correspondante détectée. "
                 "Signal média à surveiller mais non actionnable côté logistique pour le moment.",
                 size=9, italic=True, color=MGRAY, wrap=True)

    # Insight bas — synthèse priorisation média
    confirmed = [s for s in shown if _find_match(s.get('name', ''))]
    no_match = [s for s in shown if not _find_match(s.get('name', ''))]
    lines = [
        f"📰 {len(shown)} secteurs prioritaires médias affichés "
        f"({len(confirmed)} avec flux STATCOM, {len(no_match)} signaux à surveiller).",
    ]
    if confirmed:
        top_conf = ', '.join([f"{c.get('name', '')} ({c.get('count', 0)} cit.)"
                              for c in confirmed[:3]])
        lines.append(f"✅ Signaux ACTIONNABLES (média + STATCOM) : {top_conf} — destinataires/chargeurs à démarcher en priorité.")
    if no_match:
        no_m = ', '.join([s.get('name', '') for s in no_match[:3]])
        lines.append(f"🔍 Signaux MÉDIA SEULS (pas de flux STATCOM) : {no_m} — surveiller, pas (encore) actionnable.")
    lines.append("📌 Différence avec slide PROSPECTS PND : ici la priorité vient de l'actualité média "
                 "(citations newsletter), pas du Plan National. Les deux slides sont complémentaires.")
    add_insight_box(s, 0.15, 6.55, 13.0, 0.85, '💡', lines, bg=EYELLOW)


def build_prediction_prospects(prs, study):
    """Slide PRÉDICTION – PROSPECTS PAR SECTEUR : croise les secteurs
    prioritaires du PND Côte d'Ivoire 2026-2030 (+ signaux newsletters)
    avec les destinataires/chargeurs STATCOM réellement actifs sur ces
    segments. Surface des prospects concrets à démarcher, ventilés par
    secteur, avec PDM AGL actuelle pour qualifier l'effort commercial."""
    s = prs.slides.add_slide(prs.slide_layouts[6])

    ds = find_dataset(study, 'PREDICTION', 'sector_prospects')
    prospects = ds['rows'] if ds and ds.get('rows') else []

    add_header(s, "PRÉDICTION – PROSPECTS PAR SECTEUR  |  PND CI 2026-2030 × STATCOM",
               "Croisement Plan National × flux STATCOM réels  |  Prospects concrets par secteur prioritaire")
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.prospects')

    if not prospects:
        add_insight_box(s, 0.15, 1.6, 12.95, 1.4, 'ℹ',
                        ["Uploader STATCOM (TIM / HIMP / HEXP / TEM / AER) pour activer la "
                         "détection de prospects par secteur PND. Les newsletters seules ne "
                         "suffisent pas — on a besoin des B/L pour identifier qui importe / "
                         "exporte réellement sur chaque segment."])
        return

    # Filtrer : ne garder QUE les secteurs PND prioritaires (les autres
    # sont déjà visibles sur la slide PROSPECTS NEWSLETTERS et n'ont pas
    # leur place ici, dédiée au Plan National). Limité au top 9 = grille
    # 3×3, qui permet des cartes plus hautes (1.65 in) pour faire tenir
    # tous les projets phares sans troncature.
    cols = 3
    card_w = 4.30
    card_h = 1.65
    gap_x = 0.10
    gap_y = 0.10
    x0, y0 = 0.15, 1.18

    shown = [p for p in prospects if p.get('pnd')][:9]
    if not shown:
        add_insight_box(s, 0.15, 1.6, 12.95, 1.4, 'ℹ',
                        ["Aucun secteur PND prioritaire détecté avec flux STATCOM. "
                         "Uploader davantage de bases STATCOM (TIM/HIMP/HEXP/TEM/AER)."])
        return
    for i, p in enumerate(shown):
        row = i // cols
        c = i % cols
        x = x0 + c * (card_w + gap_x)
        y = y0 + row * (card_h + gap_y)
        # Couleur bandeau selon PND prioritaire
        head_color = GREEN if p.get('pnd') else BLUE2
        _rect(s, _in(x), _in(y), _in(card_w), _in(card_h),
              fill=RGBColor(0xF9, 0xFA, 0xFC), line=LINE_GR, line_width=0.4)
        _rect(s, _in(x), _in(y), _in(card_w), _in(0.30), fill=head_color)
        pnd_tag = '★ PND PRIORITAIRE' if p.get('pnd') else '○ Hors PND'
        _txt(s, _in(x + 0.10), _in(y + 0.04), _in(card_w - 0.85), _in(0.22),
             _fit_text(p.get('sector', ''), card_w - 1.10, pt=9),
             size=9, bold=True, color=WHITE, valign='middle', wrap=False)
        _txt(s, _in(x + card_w - 0.95), _in(y + 0.04), _in(0.90), _in(0.22),
             pnd_tag, size=7, color=WHITE, align='right', valign='middle', wrap=False)

        # Ligne KPIs : marché + PDM AGL + #lignes B/L
        unit_label = ('TEU' if 'AER' not in (p.get('metiers') or [None])[0:1]
                      else 'mixte')
        pdm = float(p.get('aglPdm') or 0)
        kpi_y = y + 0.34
        kpi_text = (f"Marché : {fmt_int(p.get('totalVol'))} {unit_label}  ·  "
                    f"AGL : {fmt_int(p.get('aglVol'))} ({pdm:.1f} %".replace('.', ',') +
                    f")  ·  {p.get('lineCount', 0)} B/L")
        _txt(s, _in(x + 0.10), _in(kpi_y), _in(card_w - 0.20), _in(0.18),
             kpi_text, size=8, color=DGRAY, wrap=False)
        # Métiers actifs
        metiers = ' · '.join(p.get('metiers') or [])
        _txt(s, _in(x + 0.10), _in(kpi_y + 0.18), _in(card_w - 0.20), _in(0.16),
             f"Métiers actifs : {metiers}", size=7.5, color=MGRAY, wrap=False)

        # Projets phares du PND par secteur (à la place des destinataires
        # STATCOM) — les clients réels sont sur la slide PROSPECTS NEWSLETTERS.
        # Ici on liste les programmes d'investissement à anticiper.
        # Card_h = 1.65 permet 5 projets à 0.17 in line spacing.
        phares = PND_PHARES.get(p.get('sector', ''), [])
        list_y = kpi_y + 0.40
        if phares:
            _txt(s, _in(x + 0.10), _in(list_y), _in(card_w - 0.20), _in(0.18),
                 "🏗  Projets phares PND 2026-2030 :",
                 size=8, bold=True, color=NAVY, wrap=False)
            line_y = list_y + 0.20
            for j, project in enumerate(phares[:5]):
                _txt(s, _in(x + 0.14), _in(line_y + j * 0.16), _in(card_w - 0.28), _in(0.16),
                     f"• {_fit_text(project, card_w - 0.30, pt=8)}",
                     size=7.5, color=DGRAY, wrap=False)
        else:
            _txt(s, _in(x + 0.10), _in(list_y), _in(card_w - 0.20), _in(0.50),
                 "🔍 Projets phares non répertoriés pour ce secteur.",
                 size=8, italic=True, color=MGRAY, wrap=True)

    # ── Insight bas : synthèse stratégique des prospects PND ──────────
    # (Re-ajouté après demande utilisateur d'enrichir cette slide.)
    pnd_count = sum(1 for p in shown if p.get('pnd'))
    total_vol_all = sum(float(p.get('totalVol') or 0) for p in shown)
    total_agl = sum(float(p.get('aglVol') or 0) for p in shown)
    weighted_pdm = (total_agl / total_vol_all * 100) if total_vol_all > 0 else 0
    gisements = sorted([p for p in shown if p.get('pnd')
                        and float(p.get('aglPdm') or 0) <= 10
                        and float(p.get('totalVol') or 0) >= 1000],
                       key=lambda x: -float(x.get('totalVol') or 0))[:3]
    forces_pnd = sorted([p for p in shown if p.get('pnd')
                         and float(p.get('aglPdm') or 0) >= 30],
                        key=lambda x: -float(x.get('aglPdm') or 0))[:3]
    lines = [
        f"📊 {len(shown)} secteurs détectés ({pnd_count} prioritaires PND, "
        f"{len(shown) - pnd_count} hors PND) — volume cumulé : {fmt_int(total_vol_all)} "
        f"toutes unités · PDM AGL pondérée : {weighted_pdm:.1f} %.".replace('.', ','),
    ]
    if forces_pnd:
        f_lbls = ', '.join([
            f"{str(g.get('sector', ''))[:24]} ({float(g.get('aglPdm') or 0):.0f}%)"
            for g in forces_pnd
        ])
        lines.append(f"💪 Positions FORTES PND (PDM ≥ 30%) : {f_lbls}.")
    if gisements:
        g_lbls = ', '.join([
            f"{str(g.get('sector', ''))[:24]} (PDM {float(g.get('aglPdm') or 0):.0f}%, marché {fmt_int(g.get('totalVol'))})"
            for g in gisements
        ])
        lines.append(f"🎯 GISEMENTS PND (PDM ≤ 10%, gros volume) : {g_lbls}.")
    lines.append("📌 Cartes = projets phares PND 2026-2030 à anticiper (programmes "
                 "d'investissement publics & privés). Clients réels à démarcher = "
                 "voir slide PROSPECTS NEWSLETTERS.")
    add_insight_box(s, 0.15, 6.55, 13.00, 0.60, '🎯', lines, bg=EYELLOW)


def build_prediction_preconisations(prs, study):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pred = study.get('prediction') or {}
    P = pred.get('preconisations') or {}
    signals = pred.get('signals') or {}
    sectors = signals.get('sectors') or []
    sub = (f"Horizon {P['horizon']}  |  Lecture stratégique AGL — synthèse cross-sources"
           if P.get('horizon') else
           'Secteurs porteurs  |  Marchandises  |  Clients cibles  |  Recommandations · synthèse cross-sources')
    add_header(s, 'PRÉDICTION – PRÉCONISATIONS DE POSITIONNEMENT', sub)
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026  |  p.préco')

    def quad(title, x, y, color, body, footer_lines=None):
        """body = texte principal ; footer_lines = bullets contextuels en bas."""
        _rect(s, _in(x), _in(y), _in(6.35), _in(2.05),
              fill=RGBColor(0xF8, 0xF9, 0xFA), line=LINE_GR, line_width=0.5)
        _rect(s, _in(x), _in(y), _in(6.35), _in(0.32), fill=color)
        _txt(s, _in(x + 0.12), _in(y + 0.03), _in(6.1), _in(0.26),
             title, size=10, bold=True, color=WHITE, valign='middle')
        # Texte principal (corps préco)
        _txt(s, _in(x + 0.15), _in(y + 0.40), _in(6.05), _in(1.00),
             body, size=9, bold=True, color=DGRAY, valign='top', wrap=True)
        # Lignes contextuelles enrichies en bas du quadrant
        if footer_lines:
            _txt(s, _in(x + 0.15), _in(y + 1.42), _in(6.05), _in(0.60),
                 '\n'.join(footer_lines), size=8, italic=True, color=MGRAY,
                 valign='top', wrap=True)

    # Contexte cross-sources pour enrichir les quadrants
    # Top secteurs newsletter
    top_news = ', '.join([s['name'] for s in sectors[:3]]) if sectors else 'newsletters non chargées'
    # Top hausses N vs N-1 toutes bases STATCOM confondues (lecture cross-métier)
    growth_lines = []
    for code in ('TIM', 'HIMP', 'HEXP', 'TEM', 'AER'):
        ds = find_dataset(study, code, 'top_growth')
        if ds and ds.get('rows'):
            top = ds['rows'][0]
            growth_lines.append(f"{code} : {top.get('segment', '')[:20]} ({'+' if (top.get('growth_pct') or 0) >= 0 else ''}{top.get('growth_pct', '—')}%)")
    growth_str = '; '.join(growth_lines[:3]) if growth_lines else 'pas de hausse STATCOM détectée'
    # Top prospects PND
    prospects_ds = find_dataset(study, 'PREDICTION', 'sector_prospects')
    pnd_top = []
    if prospects_ds and prospects_ds.get('rows'):
        pnd_top = [p.get('sector', '')[:25] for p in prospects_ds['rows'][:3] if p.get('pnd')]
    pnd_str = ', '.join(pnd_top) if pnd_top else 'STATCOM non croisé'

    quad('SECTEURS PORTEURS', 0.15, 1.18, NAVY,
         P.get('secteurs') or '(à compléter dans data/preconisations.json)',
         [f"📰 Newsletters : {top_news}",
          f"📈 STATCOM hausses : {growth_str}",
          f"★ PND prioritaires détectés : {pnd_str}"])

    quad('MARCHANDISES À SURVEILLER', 6.65, 1.18, GREEN,
         P.get('marchandises') or '(à compléter)',
         ['🎯 Surveiller les marchandises où PDM AGL ≤ 5 % et volume marché élevé.',
          '⚡ Croiser top_growth des 5 métiers pour repérer marchandises en accélération.',
          ('🚨 Alerter sur les nouvelles marchandises (absentes N-1) à fort volume.'
           if study.get('comparisonYear')
           else '🚨 Comparer à une période N-1 pour détecter les marchandises nouvelles.')])

    # Renvoi conditionnel : en mode « période unique » les slides NOUVEAUX
    # ENTRANTS ne sont pas produites — on ne renvoie pas vers des slides
    # inexistantes.
    _clients_notes = ['🔍 Prospects PND : voir slide PROSPECTS PAR SECTEUR (destinataires réels STATCOM).',
                      '🔒 Verrouillage : clients communs AGL ↔ AYIMAN (voir focus AYIMAN).']
    if study.get('comparisonYear'):
        _clients_notes.append(
            '🎁 Conquête : nouveaux destinataires AGL absents N-1 (voir slides NOUVEAUX ENTRANTS).')
    else:
        _clients_notes.append(
            '🎁 Conquête : activer une période de comparaison pour identifier les nouveaux destinataires.')
    quad('CLIENTS CIBLES', 0.15, 3.40, BLUE2,
         P.get('clients') or '(à compléter)',
         _clients_notes)

    quad('RECOMMANDATIONS DE POSITIONNEMENT', 6.65, 3.40, GOLD,
         P.get('recommandations') or '(à compléter)',
         ['🏁 Capitaliser sur les segments AGL où PDM ≥ 50 % (forces).',
          '📊 Lancer offensive sur les métiers où AGL ≤ #5 et marché en hausse.',
          '🤝 Pipeline AO : prioriser les statuts "EN COURS" et "RECEVABLE".'])

    add_insight_box(s, 0.15, 5.65, 12.9, 1.40, '🧭',
                    [P.get('synthese') or
                     "🧭 SYNTHÈSE PRÉDICTIVE AGL : trois leviers à actionner sur les 12 prochains mois.",
                     "1️⃣ DÉFENSIF : verrouiller les segments à PDM ≥ 50 % (Matériels Miniers, Hinterland Export, "
                     "Aérien) — risque AYIMAN/concurrence sur clients communs.",
                     "2️⃣ OFFENSIF : prospecter les destinataires PND (mines, BTP, agro-industrie) où AGL ≤ 10 %, "
                     "soutenus par signaux newsletters (effervescence médiatique).",
                     "3️⃣ STRUCTUREL : industrialiser le pipeline AO (RECAP_AO_ET_AGREMENTS) pour transformer "
                     "les agréments en CA, en cohérence avec les marchandises à plus forte hausse STATCOM."],
                    bg=EYELLOW)


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
    'sep_ayman', 'ayman_overview', 'ayman_detail',
    'sep_predictions', 'prediction_signaux',
    'prediction_newsletter_prospects', 'prediction_prospects',
    'prediction_preconisations',
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
    'sep_divers': ('07', 'DIVERS FOCUS', 'Mining  |  AYIMAN LOGISTICS CI  |  Période en cours'),
    'sep_predictions': ('08', 'PRÉDICTION MARCHÉ', 'Signaux newsletters  |  AO  |  Positionnement'),
    'sep_cx':   ('09', 'EXPÉRIENCE CLIENT (CX)', 'Slides importées'),
    'sep_analyse_client': ('10', 'ANALYSE ACTIVITÉ CLIENT', 'Slides importées'),
}
BRAND_SEPARATORS = {
    'sep_mining': ('MINING', 'FOCUS MINING', 'Clients miniers traités par AGL'),
    'sep_ayman': ('AYIMAN', 'FOCUS AYIMAN LOGISTICS CI', 'Concurrent forwarder · AYIMAN LOGISTICS CI'),
}


def _add_import_image_slides(prs, b64_list):
    """For each base64-encoded image (PNG or JPEG), add a python-pptx slide
    that fills the slide with that picture. The browser ships JPEG bytes
    (smaller, no alpha channel — PowerPoint AGL refuses canvas PNG-with-alpha)
    but we handle both via header magic."""
    if not b64_list:
        return
    import base64
    blank = prs.slide_layouts[6]
    for b64 in b64_list:
        try:
            img_bytes = base64.b64decode(b64)
        except Exception:
            continue
        if not img_bytes:
            continue
        s = prs.slides.add_slide(blank)
        s.shapes.add_picture(io.BytesIO(img_bytes), 0, 0,
                             width=prs.slide_width, height=prs.slide_height)


def _live_sep_subtitle(study, key, fallback):
    """Sous-titre de slide séparateur calculé sur les données réelles.

    Avant, ces valeurs étaient codées en dur (193 989 TEU / PDM 7,8% pour
    TIM…) : le séparateur annonçait donc un chiffre sans rapport avec la
    vue d'ensemble qui suivait immédiatement — 193 989 contre 459 374 sur
    un deck réel. On recalcule à partir du même dataset que la vue
    d'ensemble, pour que les deux slides disent la même chose.
    """
    code = {'sep_TIM': ('TIM', 'TEU'), 'sep_TEM': ('TEM', 'TEU'),
            'sep_HIMP': ('HIMP', 'TEU'), 'sep_HEXP': ('HEXP', 'TEU'),
            'sep_AER': ('AER', 'T')}.get(key)
    if not code:
        return fallback
    metier, unit = code
    live = build_overview_data(study, metier)
    if not live or not live.get('kpis'):
        # Pas de données sur la période : on n'affiche aucun chiffre plutôt
        # qu'un chiffre de démonstration trompeur.
        return 'Aucune donnée sur la période sélectionnée'
    k = live['kpis']
    txt = f"{k['marche']} {unit}  |  PDM AGL {k['pdm']}"
    d = live.get('deltaMarchePct')
    if d is not None:
        txt += f"  |  {'+' if d >= 0 else ''}{d:.1f}".replace('.', ',') + ' % vs N-1'
    return txt


def dispatch_block(prs, study, key):
    """Map a BLOCK_SEQUENCE key to its slide builder."""
    if key in SEPARATORS:
        num, title, sub = SEPARATORS[key]
        add_separator(prs, num, title, _live_sep_subtitle(study, key, sub))
        # Right after the section separator, inject its imported PDF pages.
        imports = (study or {}).get('imports') or {}
        if key == 'sep_cx':
            _add_import_image_slides(prs, imports.get('cx'))
        elif key == 'sep_analyse_client':
            _add_import_image_slides(prs, imports.get('analyse'))
        return
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
                               *FALLBACK_MIX, unit='T'); return
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
    if key == 'ayman_detail':            build_ayman_detail(prs, study); return

    if key == 'prediction_signaux':         build_prediction_signaux(prs, study); return
    if key == 'prediction_newsletter_prospects':
        build_prediction_newsletter_prospects(prs, study); return
    if key == 'prediction_prospects':       build_prediction_prospects(prs, study); return
    if key == 'prediction_preconisations':  build_prediction_preconisations(prs, study); return

    # Unknown key — placeholder
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_header(s, f"[{key}]", 'Slide non implémentée')
    add_footer(s, 'Africa Global Logistics – Étude de Marché 2026')


# ────────────────────────────────────────────────────────────────────────────
# Entry point
# ────────────────────────────────────────────────────────────────────────────
def _add_logo_to_slide(slide, logo_bytes):
    """Place le logo AGL en bas-droite (petite taille 0.65×0.42 in, ratio
    74×48 préservé). Appelé sur toutes les slides sauf la cover."""
    try:
        slide.shapes.add_picture(
            io.BytesIO(logo_bytes),
            _in(12.55), _in(7.02),
            _in(0.65), _in(0.42),
        )
    except Exception:
        pass  # Si le PNG est corrompu, on n'empêche pas la génération


def build(study_json: str) -> bytes:
    study = json.loads(study_json) if study_json else {}
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    # ── Mode « période unique » : on retire les slides « nouveaux entrants »
    # Un nouvel entrant se définit par ABSENCE du référentiel N-1. Sans
    # période de comparaison, ce référentiel est vide : toutes les slides
    # concernées sortiraient vides (ou, pire, présenteraient l'intégralité
    # des acteurs comme nouveaux). On les omet plutôt que de les publier.
    _no_cmp = not study.get('comparisonYear')
    # 'DSM_consignataires_pol' est listé explicitement : sa clé ne contient
    # aucun des mots-clés, alors qu'elle rend bien « DSM – NOUVEAUX ENTRANTS ».
    _cmp_only = {'DSM_consignataires_pol'}
    _sequence = [k for k in BLOCK_SEQUENCE
                 if not (_no_cmp and ('nouveaux' in k or 'chargeurs' in k or k in _cmp_only))]

    for key in _sequence:
        try:
            dispatch_block(prs, study, key)
        except Exception as e:
            # Don't let one broken slide kill the whole deck — emit a placeholder.
            s = prs.slides.add_slide(prs.slide_layouts[6])
            add_header(s, f"[ERREUR : {key}]", str(e)[:200])
            add_footer(s, 'Africa Global Logistics – Étude de Marché 2026')

    # ── Logo AGL bas-droite sur toutes les slides SAUF la cover ──────
    logo_b64 = (study.get('assets') or {}).get('aglLogo')
    if logo_b64:
        try:
            logo_bytes = base64.b64decode(logo_b64)
            # On commence à l'index 1 pour skip la cover (slide 1).
            for slide in list(prs.slides)[1:]:
                _add_logo_to_slide(slide, logo_bytes)
        except Exception:
            pass

    # ── Renumérotation des pieds de page ────────────────────────────────
    # Les numéros de page sont écrits en dur dans chaque builder (p.4, p.5…).
    # Dès qu'un bloc est omis — cas du mode « période unique », qui retire
    # les slides « nouveaux entrants » — cette numérotation se décale. On
    # réécrit donc « p.N » d'après la position réelle de la slide.
    try:
        _pnum = re.compile(r'(\|\s*p\.)\s*\d+')
        for _i, _sl in enumerate(prs.slides, start=1):
            for _sh in _sl.shapes:
                if not _sh.has_text_frame:
                    continue
                for _pa in _sh.text_frame.paragraphs:
                    for _run in _pa.runs:
                        if '| p.' in _run.text or '|  p.' in _run.text:
                            _run.text = _pnum.sub(r'\g<1>' + str(_i), _run.text)
    except Exception:
        pass

    buf = io.BytesIO()
    prs.save(buf)
    return inject_agl_label(buf.getvalue())


# Entry point — read STUDY_JSON, write PPTX_BYTES
PPTX_BYTES = build(globals().get('STUDY_JSON', '{}'))

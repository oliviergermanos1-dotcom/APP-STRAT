"""Comité de Direction — PPTX generator (python-pptx, runs in Pyodide).

Receives a JSON study spec via the global ``STUDY_JSON``, writes the binary
PPTX into the global ``PPTX_BYTES`` (Python ``bytes``). The browser side
(``py-generator.js``) reads that variable back as a ``Uint8Array``.

STAGE 1: minimal smoke test (1 cover slide + AGL MIP sensitivity label) to
prove the Pyodide → python-pptx → PowerPoint pipeline opens cleanly on the
user's poste. STAGE 2 (next commits) ports the 43 slides from generator.js.
"""
import io
import json
import zipfile
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE


# ── AGL charte ───────────────────────────────────────────────────────────────
NAVY = RGBColor(0x0D, 0x22, 0x43)
GOLD = RGBColor(0xC9, 0xA8, 0x4C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN = RGBColor(0x1A, 0x7C, 0x4F)
MGRAY = RGBColor(0x6B, 0x72, 0x80)
SLIDE_W = Inches(13.33)
SLIDE_H = Inches(7.5)


def _solid_rect(slide, x, y, w, h, color, line_color=None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    if line_color is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line_color
    s.shadow.inherit = False
    return s


def _text(slide, x, y, w, h, text, **kw):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.margin_left = tf.margin_right = Emu(36000)
    tf.margin_top = tf.margin_bottom = Emu(18000)
    tf.word_wrap = True
    p = tf.paragraphs[0]
    if kw.get('align') == 'center':
        from pptx.enum.text import PP_ALIGN
        p.alignment = PP_ALIGN.CENTER
    elif kw.get('align') == 'right':
        from pptx.enum.text import PP_ALIGN
        p.alignment = PP_ALIGN.RIGHT
    r = p.add_run()
    r.text = str(text)
    r.font.name = 'Calibri'
    r.font.size = Pt(kw.get('size', 12))
    r.font.bold = bool(kw.get('bold'))
    r.font.italic = bool(kw.get('italic'))
    color = kw.get('color', NAVY)
    if isinstance(color, RGBColor):
        r.font.color.rgb = color
    return box


# ── AGL Microsoft Information Protection sensitivity label ──────────────────
# Exact bytes copied from Olivier's reference deck (tenant 088e9b00-…,
# label fc24caf1-… = "Internal"). PowerPoint AGL refuses to open any PPTX
# without this label.
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


def inject_agl_label(pptx_bytes: bytes) -> bytes:
    """Add AGL's Microsoft Information Protection label to a PPTX binary."""
    src = zipfile.ZipFile(io.BytesIO(pptx_bytes))
    out_buf = io.BytesIO()
    out = zipfile.ZipFile(out_buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=6)

    # Update [Content_Types].xml + _rels/.rels in pass
    ct = src.read('[Content_Types].xml').decode('utf-8')
    if '/docMetadata/LabelInfo.xml' not in ct:
        ct = ct.replace(
            '</Types>',
            '<Override PartName="/docMetadata/LabelInfo.xml" '
            'ContentType="application/vnd.ms-office.classificationlabels+xml"/>'
            '<Override PartName="/docProps/custom.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>'
            '</Types>'
        )
    root_rels = src.read('_rels/.rels').decode('utf-8')
    if 'classificationlabels' not in root_rels:
        import re
        rids = [int(m.group(1)) for m in re.finditer(r'Id="rId(\d+)"', root_rels)]
        n1 = (max(rids) if rids else 0) + 1
        n2 = n1 + 1
        inject = (
            f'<Relationship Id="rId{n1}" Type="http://schemas.microsoft.com/office/2020/02/'
            f'relationships/classificationlabels" Target="docMetadata/LabelInfo.xml"/>'
            f'<Relationship Id="rId{n2}" Type="http://schemas.openxmlformats.org/officeDocument/'
            f'2006/relationships/custom-properties" Target="docProps/custom.xml"/>'
        )
        root_rels = root_rels.replace('</Relationships>', inject + '</Relationships>')

    # [Content_Types].xml must be the FIRST archive entry per PowerPoint's OPC
    # reader; also drop directory entries.
    out.writestr('[Content_Types].xml', ct)
    out.writestr('docMetadata/LabelInfo.xml', AGL_LABEL_XML)
    if 'docProps/custom.xml' not in set(src.namelist()):
        out.writestr('docProps/custom.xml', AGL_CUSTOM_XML)
    for name in src.namelist():
        if name == '[Content_Types].xml':
            continue
        if name == '_rels/.rels':
            out.writestr(name, root_rels)
            continue
        if name == 'docProps/custom.xml':
            # Replace existing custom.xml if python-pptx wrote one
            out.writestr(name, AGL_CUSTOM_XML)
            continue
        if src.getinfo(name).is_dir():
            continue
        out.writestr(name, src.read(name))
    src.close()
    out.close()
    return out_buf.getvalue()


def build_cover(prs, study):
    """Cover slide (stub for STAGE 1 smoke test)."""
    blank = prs.slide_layouts[6]  # blank layout
    s = prs.slides.add_slide(blank)
    _solid_rect(s, 0, 0, SLIDE_W, SLIDE_H, NAVY)
    _solid_rect(s, Inches(0.35), Inches(3.55), Inches(8.5), Inches(0.06), GOLD)
    _text(s, Inches(0.35), Inches(0.3), Inches(2), Inches(0.6),
          'AGL', size=36, bold=True, color=WHITE)
    _text(s, Inches(0.35), Inches(0.88), Inches(4), Inches(0.25),
          'AFRICA GLOBAL LOGISTICS', size=8, color=WHITE)
    title = study.get('title') or 'Revue Stratégique & Marketing'
    _text(s, Inches(0.35), Inches(1.5), Inches(8), Inches(1.8),
          title, size=44, bold=True, color=WHITE)
    period_label = 'Reporting 2026'
    if study.get('periodStart') and study.get('periodEnd'):
        period_label = f"Reporting {study['periodStart']} → {study['periodEnd']}"
    _text(s, Inches(0.35), Inches(3.75), Inches(6), Inches(0.65),
          period_label, size=24, bold=True, color=GOLD)
    _text(s, Inches(3), Inches(7.15), Inches(7), Inches(0.28),
          'Direction Marketing & RP  |  AGL Abidjan  |  Juin 2026 — Généré par python-pptx (Pyodide)',
          size=9, color=MGRAY, align='center')
    _text(s, Inches(12.0), Inches(7.1), Inches(1.2), Inches(0.35),
          '2026', size=18, bold=True, color=WHITE, align='right')


def build(study_json: str) -> bytes:
    study = json.loads(study_json) if study_json else {}
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    build_cover(prs, study)
    # TODO STAGE 2: port the 42 remaining slides from generator.js
    buf = io.BytesIO()
    prs.save(buf)
    raw = buf.getvalue()
    return inject_agl_label(raw)


# Entry point — read STUDY_JSON, write PPTX_BYTES
PPTX_BYTES = build(globals().get('STUDY_JSON', '{}'))

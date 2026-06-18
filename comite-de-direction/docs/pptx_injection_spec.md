# PPTX INJECTION SPEC — Module d'injection slides externes

> Spécification technique du module permettant d'injecter des slides depuis des PPTX externes dans le PPTX final assemblé.

---

## 1. Objectif

Permettre à l'utilisateur d'intégrer dans le PPTX final des slides provenant d'autres sources sans re-rendu :
- Exports Power BI (rapports `codir_V1.pbix`)
- Slides Excel (analyses tableurs exportées en PPT)
- Slides d'autres présentations existantes à réutiliser

**Principe** : copie XML brute → préservation 100% mise en page, graphiques, images, polices, animations.

---

## 2. Workflow utilisateur

```
1. Olivier upload 1 à N PPTX externes (drag-and-drop multi-fichiers)
   ↓
2. Microservice Python génère thumbnails de toutes les slides
   ↓
3. UI affiche grid de thumbnails par PPTX uploadé
   ↓
4. Olivier sélectionne les slides à conserver (checkboxes)
   ↓
5. Détection automatique polices non-standard → warning si applicable
   ↓
6. Olivier drag-and-drop ces slides dans le plan de montage
   ↓
7. Au moment de la génération du PPTX final :
   - Python copie XML brut des slides sélectionnées
   - Réordonnancement selon plan de montage
   - Préservation des relations (images, charts, etc.)
```

---

## 3. Architecture technique

### 3.1 Stack

| Composant | Rôle |
|-----------|------|
| **python-pptx 0.6.23+** | Lecture / écriture PPTX |
| **lxml 5+** | Manipulation XML brute (necessaire pour copy inter-PPTX) |
| **LibreOffice headless** | Conversion PPTX → PDF (pour thumbnails) |
| **pdftoppm** | Conversion PDF → PNG (thumbnails) |
| **Pillow** | Redimensionnement thumbnails |

### 3.2 Microservice FastAPI

```python
# main.py
from fastapi import FastAPI, HTTPException, Depends, Header, File, UploadFile
from pydantic import BaseModel
from typing import List
import os

app = FastAPI(title="Comité de Direction Python Service", version="2.0")

async def verify_token(authorization: str = Header(...)):
    expected = f"Bearer {os.getenv('SERVICE_TOKEN')}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

class InjectRequest(BaseModel):
    base_pptx_url: str           # URL Supabase signed du PPTX généré (base)
    insertions: List[dict]       # Liste d'insertions ordonnées
    output_filename: str

class Insertion(BaseModel):
    source_pptx_url: str
    source_slide_index: int      # Index 0-based dans le PPTX source
    target_position: int         # Position 0-based dans le PPTX final

@app.post("/inject", dependencies=[Depends(verify_token)])
async def inject_slides(req: InjectRequest):
    """
    Télécharge le PPTX de base et les PPTX sources,
    copie les slides spécifiées aux positions demandées,
    upload le résultat dans Supabase Storage.
    """
    # Implémentation détaillée section 4
    pass

@app.post("/thumbnails", dependencies=[Depends(verify_token)])
async def generate_thumbnails(pptx_url: str):
    """
    Convertit le PPTX en PDF puis en PNG (1 par slide),
    upload les thumbnails dans bucket `external-thumbnails`,
    retourne URLs publiques.
    """
    pass

@app.post("/detect-fonts", dependencies=[Depends(verify_token)])
async def detect_fonts(pptx_url: str):
    """
    Parse le PPTX et retourne la liste des polices utilisées
    qui ne sont pas dans le set safe (Calibri, Arial, etc.).
    """
    pass

@app.get("/health")
async def health():
    return {"status": "ok"}
```

---

## 4. Algorithme d'injection détaillé

### 4.1 Copie XML brute inter-PPTX

```python
from pptx import Presentation
from pptx.oxml.ns import qn
from copy import deepcopy
import lxml.etree as etree
import os
import shutil
import zipfile
import tempfile

def copy_slide_xml(
    source_pptx_path: str,
    source_slide_idx: int,
    target_pptx_path: str,
    target_position: int = None
) -> None:
    """
    Copie une slide depuis source_pptx vers target_pptx en préservant
    le XML brut. Gère les relations (images, charts, etc.).

    Args:
        source_pptx_path : chemin du PPTX source
        source_slide_idx : index 0-based de la slide à copier
        target_pptx_path : chemin du PPTX destination (modifié en place)
        target_position : position d'insertion (None = en fin)
    """
    source = Presentation(source_pptx_path)
    target = Presentation(target_pptx_path)

    if source_slide_idx >= len(source.slides):
        raise ValueError(f"Slide index {source_slide_idx} out of range")

    src_slide = source.slides[source_slide_idx]

    # 1. Créer nouvelle slide vide dans la destination avec layout blank
    blank_layout = target.slide_layouts[6]  # Layout 6 = blank dans templates standards
    if blank_layout is None:
        blank_layout = target.slide_layouts[0]

    new_slide = target.slides.add_slide(blank_layout)

    # 2. Vider le contenu par défaut de la nouvelle slide
    new_slide.shapes._spTree.clear()

    # 3. Copier tous les shapes XML depuis la source
    for elem in src_slide.shapes._spTree:
        if elem.tag.endswith('}nvGrpSpPr') or elem.tag.endswith('}grpSpPr'):
            # Skip les éléments de groupement par défaut déjà présents
            continue
        new_slide.shapes._spTree.append(deepcopy(elem))

    # 4. Copier le background si défini
    src_bg = src_slide.background
    if src_bg.fill.type is not None:
        # python-pptx ne permet pas une copie directe simple ;
        # on copie le XML du bg manuellement
        src_bg_xml = src_slide.slide_layout.element.find(qn('p:cSld/p:bg'))
        if src_bg_xml is not None:
            new_slide.element.find(qn('p:cSld')).insert(0, deepcopy(src_bg_xml))

    # 5. Gérer les relations (images, charts embedded)
    _copy_relationships(src_slide, new_slide, source, target)

    # 6. Réordonner si target_position spécifiée
    if target_position is not None:
        _reorder_slide(target, len(target.slides) - 1, target_position)

    target.save(target_pptx_path)


def _copy_relationships(src_slide, new_slide, source_prs, target_prs):
    """
    Copie les relations (images, charts, embedded files) entre slides.
    C'est la partie délicate : il faut copier les fichiers media
    physiquement dans le ZIP du PPTX et créer les bonnes refs XML.
    """
    src_rels = src_slide.part.rels
    new_rels = new_slide.part.rels

    for rel_id, rel in src_rels.items():
        if rel.target_part is not None:
            # Image, chart, embedded object
            target_blob = rel.target_part.blob
            target_content_type = rel.target_part.content_type
            target_partname = rel.target_part.partname

            # Vérifier si la part existe déjà dans target
            # Sinon la créer
            # ... (logique complexe, voir lxml documentation)
            pass


def _reorder_slide(prs, from_idx, to_idx):
    """Déplace une slide de from_idx vers to_idx dans la présentation."""
    xml_slides = prs.slides._sldIdLst
    slides_list = list(xml_slides)
    slides_list.insert(to_idx, slides_list.pop(from_idx))
    for slide_id in slides_list:
        xml_slides.append(slide_id)
```

### 4.2 Approche alternative — Manipulation ZIP directe

Si l'approche python-pptx pose problème avec les relations, une approche plus bas-niveau via manipulation du ZIP (un PPTX est un ZIP) est possible :

```python
import zipfile
import shutil
import os
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

def merge_pptx_zip_level(
    base_pptx: str,
    source_pptx: str,
    source_slide_indices: List[int],
    target_positions: List[int],
    output_pptx: str
) -> None:
    """
    Approche manipulation ZIP brute pour merger PPTX.

    Plus fiable pour les cas complexes mais plus de code.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        base_dir = Path(tmpdir) / "base"
        source_dir = Path(tmpdir) / "source"

        # 1. Extraire les deux PPTX
        with zipfile.ZipFile(base_pptx, 'r') as z:
            z.extractall(base_dir)
        with zipfile.ZipFile(source_pptx, 'r') as z:
            z.extractall(source_dir)

        # 2. Pour chaque slide à copier :
        for src_idx, tgt_pos in zip(source_slide_indices, target_positions):
            # Trouver le fichier slide source
            src_slide_xml = source_dir / "ppt" / "slides" / f"slide{src_idx+1}.xml"
            src_rels_xml = source_dir / "ppt" / "slides" / "_rels" / f"slide{src_idx+1}.xml.rels"

            # Déterminer le numéro du prochain slide dans base
            base_slides = sorted((base_dir / "ppt" / "slides").glob("slide*.xml"))
            next_slide_num = len(base_slides) + 1
            new_slide_path = base_dir / "ppt" / "slides" / f"slide{next_slide_num}.xml"
            new_rels_path = base_dir / "ppt" / "slides" / "_rels" / f"slide{next_slide_num}.xml.rels"

            # Copier le XML de la slide
            shutil.copy(src_slide_xml, new_slide_path)
            shutil.copy(src_rels_xml, new_rels_path)

            # Copier les media référencés (images, charts)
            src_rels_tree = ET.parse(src_rels_xml)
            for rel in src_rels_tree.iter('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                target = rel.get('Target')
                if target.startswith('../media/'):
                    src_media = source_dir / "ppt" / "media" / target.replace('../media/', '')
                    dst_media = base_dir / "ppt" / "media" / target.replace('../media/', '')
                    if not dst_media.exists():
                        # Vérifier collision de nom et renommer si nécessaire
                        shutil.copy(src_media, dst_media)

            # Mettre à jour [Content_Types].xml pour déclarer la nouvelle slide
            _update_content_types(base_dir / "[Content_Types].xml", next_slide_num)

            # Mettre à jour ppt/presentation.xml pour insérer la slide dans le sldIdLst
            _update_presentation_xml(
                base_dir / "ppt" / "presentation.xml",
                next_slide_num,
                tgt_pos
            )

            # Mettre à jour ppt/_rels/presentation.xml.rels pour ajouter la ref
            _update_presentation_rels(
                base_dir / "ppt" / "_rels" / "presentation.xml.rels",
                next_slide_num
            )

        # 3. Re-zipper le résultat
        with zipfile.ZipFile(output_pptx, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in base_dir.rglob('*'):
                if file.is_file():
                    arcname = file.relative_to(base_dir)
                    z.write(file, arcname)
```

### 4.3 Recommandation

**Démarrer avec l'approche python-pptx pure** pour 80% des cas simples (slides sans charts embedded complexes).

**Basculer vers manipulation ZIP** si on rencontre des bugs sur :
- Slides avec charts Excel embeddés
- Slides avec videos / audio
- Slides avec animations custom
- Slides avec polices custom embedded

---

## 5. Génération thumbnails

```python
import subprocess
import os
import tempfile
from pathlib import Path

def generate_pptx_thumbnails(
    pptx_path: str,
    output_dir: str,
    width_px: int = 480
) -> List[str]:
    """
    Convertit un PPTX en série de PNG thumbnails (1 par slide).

    Returns: liste des chemins PNG générés (slide-1.png, slide-2.png, ...)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. PPTX → PDF via LibreOffice headless
        subprocess.run([
            'soffice', '--headless', '--convert-to', 'pdf',
            '--outdir', tmpdir,
            pptx_path
        ], check=True, timeout=120)

        pdf_name = Path(pptx_path).stem + '.pdf'
        pdf_path = Path(tmpdir) / pdf_name

        # 2. PDF → PNG via pdftoppm
        # Résolution adaptée : 150 DPI pour qualité acceptable
        output_prefix = Path(output_dir) / 'slide'
        subprocess.run([
            'pdftoppm', '-png', '-r', '150',
            str(pdf_path), str(output_prefix)
        ], check=True, timeout=60)

        # 3. Lister les PNG générés et redimensionner si besoin
        png_files = sorted(Path(output_dir).glob('slide-*.png'))

        if width_px:
            from PIL import Image
            for png in png_files:
                img = Image.open(png)
                ratio = width_px / img.width
                new_height = int(img.height * ratio)
                img_resized = img.resize((width_px, new_height), Image.LANCZOS)
                img_resized.save(png, optimize=True)

        return [str(p) for p in png_files]
```

---

## 6. Détection polices non-standard

```python
SAFE_FONTS = {
    'Calibri', 'Calibri Light', 'Calibri Body',
    'Arial', 'Arial Black', 'Arial Narrow',
    'Cambria', 'Cambria Math',
    'Times New Roman', 'Times',
    'Courier New', 'Courier',
    'Verdana', 'Tahoma', 'Georgia',
    'Trebuchet MS', 'Comic Sans MS',
    'Segoe UI', 'Segoe UI Light', 'Segoe UI Semibold',
}

def detect_custom_fonts(pptx_path: str) -> List[str]:
    """
    Parse toutes les slides du PPTX et retourne la liste
    des polices utilisées qui ne sont pas dans SAFE_FONTS.
    """
    from pptx import Presentation
    prs = Presentation(pptx_path)
    used_fonts = set()

    for slide in prs.slides:
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    font_name = run.font.name
                    if font_name:
                        used_fonts.add(font_name)

    custom = sorted(used_fonts - SAFE_FONTS)
    return custom
```

---

## 7. Sécurité et robustesse

### 7.1 Validation entrées

- Taille max PPTX uploadé : 50 MB (configurable)
- Nombre max de slides par PPTX externe : 100
- Nombre max de PPTX externes par étude : 10
- Types MIME acceptés : `application/vnd.openxmlformats-officedocument.presentationml.presentation`

### 7.2 Sandboxing

- Le microservice Python tourne dans un container Docker isolé.
- Permissions write limitées à `/tmp/`.
- Pas d'exécution de code arbitraire (xml safe parsing avec lxml).
- Timeout strict sur opérations LibreOffice (120s).

### 7.3 Quotas

- Rate limit : 10 requêtes/minute par utilisateur.
- Storage Supabase : monitoring volume utilisé, alertes si > 80% quota.

---

## 8. Tests

### 8.1 Cas de test à valider

| Test | Input | Résultat attendu |
|------|-------|------------------|
| **T01** | PPTX simple (texte uniquement, 3 slides) | Injection OK, mise en page préservée |
| **T02** | PPTX avec image PNG | Image présente dans PPTX final |
| **T03** | PPTX avec image JPG + caption | Image + texte caption OK |
| **T04** | PPTX avec chart Excel embedded | Chart fonctionnel dans PPTX final |
| **T05** | PPTX avec police custom (ex: Roboto) | Warning généré + slide injectée |
| **T06** | PPTX avec animation slide | Animation préservée |
| **T07** | PPTX avec hyperlink | Lien fonctionnel |
| **T08** | PPTX exporté depuis Power BI | Layout et données préservés |
| **T09** | PPTX corrompu | Erreur claire à l'utilisateur |
| **T10** | PPTX très grand (50 MB) | Traitement OK ou message clair si limite |

### 8.2 Tests visuels

Pour chaque cas, comparaison pixel-à-pixel via LibreOffice :
1. Convertir PPTX source en PDF
2. Convertir PPTX final en PDF
3. Comparer les pages injectées avec les pages sources

Tolérance acceptable : 1% de différence pixel (artefacts compression).

---

## 9. Limitations connues

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Polices custom non-installées | Substitution automatique par Office | Detection + warning utilisateur |
| Macros VBA dans PPTX source | Non préservées | À documenter dans guide utilisateur |
| Animations entre slides | Préservées par slide, non inter-slides | Acceptable pour usage CODIR |
| Slides masters custom | Peuvent ne pas s'appliquer | Utiliser layout blank par défaut |
| Templates avec placeholders | Placeholders devenus texte | Mineur pour usage AGL |

---

## 10. Évolutions futures

### v2.1
- Support de l'extraction de slides depuis Google Slides (via API Google Drive)
- Détection automatique du type de slide (cover, transition, contenu) pour suggestions de placement

### v2.2
- Édition légère des slides injectées (changement texte, sans toucher la mise en page)
- Application automatique de la charte AGL sur slides injectées (couleurs, polices remplacées)

### v2.3
- Bibliothèque de slides récurrentes (templates Power BI fréquents)
- Drag-and-drop direct depuis le navigateur Power BI

---

*Document v1.0 — 18 juin 2026*

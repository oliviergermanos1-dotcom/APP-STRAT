# BRAND GUIDELINES — Charte visuelle Comité de Direction

> Référence exhaustive de la charte graphique appliquée à toutes les slides générées.

## 1. Palette de couleurs

### 1.1 Couleurs primaires AGL

| Nom | Hex | RGB | Usage |
|-----|-----|-----|-------|
| **Navy AGL** | `#0D2243` | rgb(13, 34, 67) | Header bands, fonds séparateurs, cover, bandeaux de synthèse |
| **Doré AGL** | `#C9A84C` | rgb(201, 168, 76) | Soulignements, lignes décoratives, accents, "Reporting 2026" |
| **Blanc** | `#FFFFFF` | rgb(255, 255, 255) | Texte sur fond navy, fond tableaux |

### 1.2 Couleurs sémantiques

| Nom | Hex | Usage |
|-----|-----|-------|
| **Vert positif** | `#1A7C4F` | PDM ≥ seuil cible, KPIs positifs, badges "LEADER" / "DOMINANT" / "EN HAUSSE" |
| **Vert clair fond** | `#F0FDF4` | Fond des insight boxes positives |
| **Vert bordure** | `#22C55E` | Bordure insight box positive |
| **Orange alerte** | `#E05A00` | PDM < seuil, statuts intermédiaires, badges "À RENFORCER" / "SOUS PRESSION" |
| **Orange clair fond** | `#FFFBEC` | Fond des insight boxes par défaut |
| **Orange bordure** | `#E5C97A` | Bordure insight box par défaut |
| **Rouge critique** | `#CC2200` | Alertes critiques, recul de marché, mention "CEVA" / menaces |
| **Rouge clair fond** | `#FEF2F2` | Fond des insight boxes critiques |

### 1.3 Couleurs neutres

| Nom | Hex | Usage |
|-----|-----|-------|
| **Bleu KPI** | `#2563A8` | Données neutres importantes, KPIs informatifs |
| **Teal** | `#0E7490` | Variantes segments multiples, focus DSM |
| **Gris foncé texte** | `#374151` | Texte corps des slides |
| **Gris moyen** | `#6B7280` | Texte secondaire, sous-labels, légendes |
| **Gris clair fond** | `#F0F2F5` | Fond cartes KPI |
| **Gris bordure** | `#D1D5DB` | Bordures cartes KPI |
| **Gris ligne tableau** | `#E5E7EB` | Lignes alternées tableaux |
| **Gris très clair** | `#F8F9FA` | Fond alterné lignes tableaux |
| **Bleu pâle header** | `#EBF0F8` | Headers tableaux secondaires |

### 1.4 Couleurs spécifiques métier

Pour différencier les 6 sections du sommaire :

| Métier | Couleur badge | Hex |
|--------|---------------|-----|
| 01 TIM | Navy | `#0D2243` |
| 02 TEM | Vert | `#1A7C4F` |
| 03 HIMP | Orange | `#E05A00` |
| 04 HEXP | Bleu KPI | `#2563A8` |
| 05 AER | Teal | `#0E7490` |
| 06 Synthèses | Doré sombre | `#8B6914` |

## 2. Typographie

### 2.1 Police unique : Calibri

Calibri exclusivement sur toutes les slides (police safe, présente sur tous les postes Windows et macOS Office).

### 2.2 Hiérarchie typographique

| Élément | Taille | Poids | Couleur | Style |
|---------|--------|-------|---------|-------|
| Titre cover principal | 44pt | Bold | Blanc | — |
| Sous-titre cover | 24pt | Bold | Doré | — |
| Tagline cover ("At the heart...") | 16pt | Bold | Blanc | — |
| Titre slide standard | 22pt | Bold | Blanc (sur navy) | — |
| Sous-titre slide (italique doré) | 12pt | Regular | Doré | Italic |
| Titre séparateur métier | 38pt | Bold | Blanc | — |
| Numéro filigrane séparateur | 200pt | Bold | `#1A2E4A` (navy clair) | — |
| Sous-titre séparateur | 16pt | Regular | Doré | Italic |
| Titre section tableau | 11pt | Bold | Gris foncé | — |
| KPI label | 8pt | Regular | Gris moyen | UPPERCASE, letter-spacing |
| KPI valeur | 22-26pt | Bold | Couleur sémantique | — |
| KPI sub-label | 8.5pt | Regular | Gris moyen | — |
| Header tableau | 9pt | Bold | Blanc (sur navy) | — |
| Corps tableau | 9pt | Regular | Gris foncé | — |
| Ligne AGL surlignée | 9pt | Bold | Vert | Fond `#FFF9EC` |
| Insight box | 9pt | Regular | Gris foncé | wrap |
| Légende / footnote | 9pt | Regular | Gris moyen | Italic |
| Pied de page | 9pt | Regular | Gris moyen | — |
| Logo AGL textuel | 36pt | Bold | Blanc/Doré | — |

## 3. Layout slide

### 3.1 Format global

- **Layout** : `LAYOUT_WIDE` (16:9 étendu)
- **Dimensions** : 33.867 × 19.05 cm = 13.33 × 7.5 inches
- **Orientation** : paysage exclusivement

### 3.2 Zones de la slide standard

```
┌─────────────────────────────────────────────────────────┐
│ [HEADER navy — 1.1" haut]                                │
│ Titre slide 22pt bold blanc                              │
│ Sous-titre 12pt italic doré                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Zone contenu — 5.7" haut × 13.33" large                  │
│                                                          │
│ Marges : 0.4" gauche/droite                              │
│ Marges internes : 0.2"                                   │
│                                                          │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [PIED DE PAGE — 0.3" haut]                              │
│ Africa Global Logistics – Étude... | p.X    [AGL doré] │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Grille des slides standards

Pour les slides type "Vue d'ensemble" (slides 4, 9, 14, 18, 21) :

```
Header (0 → 1.1")
─────────────────────────────────────────────────────
KPI Bar (1.2 → 2.15") — 5 KPI cards alignés
─────────────────────────────────────────────────────
Titre graphe (2.28 → 2.55")
Graphe barres (2.55 → 6.85") — gauche      Barres PDM mensuelles (droite)
                                            Insight box (en bas)
─────────────────────────────────────────────────────
Pied de page (7.15 → 7.5")
```

### 3.4 Grille séparateurs métier

```
Numéro filigrane (vertical centré, 200pt navy clair)
Titre métier en majuscules (38pt blanc bold)
Ligne dorée horizontale (8.2" large × 0.065" haut)
Sous-titre italique doré (16pt)
Footer centré
```

## 4. Composants visuels

### 4.1 KPI Card

```
Dimensions : auto-fit (5 cards / largeur slide)
Hauteur : 0.95"
Fond : #F0F2F5
Bordure : 0.5pt #D1D5DB
Padding : 0.05" top label

Structure interne :
- Label (8pt, UPPERCASE, gris) — y: +0.05
- Valeur (22-26pt, bold, couleur sémantique) — y: +0.24
- Sub-label (8.5pt, gris moyen) — y: +0.68
```

### 4.2 Tableau classement (avec ligne AGL surlignée)

```
Header navy plein :
  Hauteur 0.28"
  Texte blanc 9pt bold
  Première colonne (rang) : align center
  Deuxième colonne (nom) : align left
  Autres colonnes (chiffres) : align center

Lignes alternées :
  Hauteur 0.28"
  Lignes paires : blanc
  Lignes impaires : #F8F9FA
  Bordure 0.3pt #E5E7EB

Ligne AGL (toujours rang #1 ou highlight) :
  Fond : #FFF9EC (crème pâle)
  Texte : Bold dans cols rang + nom
  PDM : Bold vert (#1A7C4F)
```

### 4.3 Barres horizontales PDM segment

```
Pour chaque segment :
- Label gauche (8.5pt gris foncé) — largeur 1.8"
- Volume (8.5pt gris moyen, align right) — largeur 0.9"
- Barre :
  - Fond gris (#E5E7EB) — 3.0" large × 0.18" haut
  - Barre valeur : couleur dynamique
    - Vert si pdm ≥ 50
    - Bleu (#2563A8) si pdm ≥ 20
    - Orange (#E05A00) si pdm ≥ 10
    - Rouge (#CC2200) si pdm < 10
  - Largeur proportionnelle : pdm/100 × maxBarW
- Valeur % (9pt bold, couleur même que barre, align right) — 0.4"
```

### 4.4 Barres mensuelles (PDM par mois)

```
Pour chaque mois :
- Card fond (#F8FAFC) avec bordure 0.3pt #E5E7EB
- Hauteur 0.52", largeur 6.0"
- Label mois (11pt gris foncé) — à gauche
- Barre fond #D1D5DB — 2.8" large × 0.22" haut
- Barre valeur :
  - Vert (#1A7C4F) si valeur ≥ seuil
  - Orange (#E05A00) si valeur < seuil
- Valeur % (12pt bold, couleur même que barre, align right) — 0.55"
```

### 4.5 Insight box

```
Default (jaune doré) :
  Fond : #FFFBEC
  Bordure : 0.5pt #E5C97A

Positive (vert clair) :
  Fond : #F0FDF4
  Bordure : 0.5pt #22C55E

Alerte (rouge clair) :
  Fond : #FEF2F2
  Bordure : 0.5pt #FCA5A5

Structure :
- Emoji + espace + texte sur ligne 1
- Lignes suivantes alignées sous le texte
- Padding interne : 0.1" x 0.08"
- Police 9pt regular gris foncé
- Wrap activé
```

### 4.6 Pie charts / Donut

```
Couleurs cycliques (ordre standard) :
1. Navy (#0D2243)
2. Doré (#C9A84C)
3. Bleu KPI (#2563A8)
4. Vert (#1A7C4F)
5. Orange (#E05A00)
6. Teal (#0E7490)
7. Rouge (#CC2200)
8. Gris moyen (#9CA3AF)
9. Gris clair (#D1D5DB)

Légende : à droite, fontSize 8-9
Pourcentages : affichés sur les segments en blanc
```

### 4.7 Bar charts (graphes mensuel marché vs AGL)

```
Série 1 (Marché qualifié) : Navy (#0D2243)
Série 2 (AGL) : Doré (#C9A84C) ou couleur métier
Axe Y : valeurs absolues, fontSize 8
Axe X : labels mois, fontSize 8
Légende : en bas, centrée, fontSize 9
Barres groupées (clustered)
```

### 4.8 Badges statut (slide synthèse 33)

```
LEADER (Vert) :
  Fond #1A7C4F
  Texte blanc 9pt bold
  Padding 0.08" x 0.04"

DOMINANT (Vert)
EN HAUSSE (Vert)

À RENFORCER (Orange) :
  Fond #E05A00

SOUS PRESSION (Orange)
```

## 5. Header structure

```
Bandeau navy plein (largeur slide × 1.1")
├─ Titre principal (22pt bold blanc Calibri)
│  Position : x=0.25, y=0.05, w=13"
│  Format : MAJUSCULES ou Casse normale selon référence
│
└─ Sous-titre (12pt italic doré Calibri)
   Position : x=0.25, y=0.6, w=12.5"
   Texte : description courte | séparateurs avec |
```

## 6. Footer structure

```
À gauche (x=0.2, y=7.2, w=10") :
  "Africa Global Logistics – Étude de Marché Jan–Mai 2026  |  p.X"
  Police : 9pt Calibri Regular
  Couleur : Gris moyen (#6B7280)

À droite (x=12.5, y=7.15, w=0.7") :
  Texte "AGL" ou logo si disponible
  Police : 10pt Calibri Bold
  Couleur : Doré (#C9A84C)
  Alignement : right
```

## 7. Règles d'or

### 7.1 Cohérence stricte

- **Aucune couleur hors charte** ne doit apparaître sur les slides générées.
- **Calibri exclusivement** — pas de mélange de polices.
- **Pas de drop shadow ni d'effets décoratifs** — slides flat / minimalistes.
- **Pas d'emoji dans les titres** — uniquement dans les insight boxes (✓ ⚠ 🎯 💡 🏆 ▶).

### 7.2 Espacements

- Marge gauche/droite slide : 0.4" minimum
- Marge entre composants : 0.2" minimum
- Padding interne cards : 0.05–0.1"
- Hauteur ligne tableau : 0.28"

### 7.3 Lisibilité

- Taille minimum texte : 8pt (sauf footnotes)
- Contraste minimum WCAG AA (4.5:1) pour tout texte
- Pas de texte en italique pour de longs passages
- Majuscules réservées aux labels courts (KPI labels, segments)

### 7.4 Iconographie

Emojis autorisés dans les insight boxes uniquement :
- ✓ : positif, validé, opportunité confirmée
- ⚠ : alerte modérée
- 🎯 : action stratégique recommandée
- 💡 : insight / point de vigilance
- 🏆 : position dominante, achievement
- ▶ : développement / continuité
- ⚠ ALERTE : alerte critique en rouge

### 7.5 Format texte

- **Nombres** : séparateur de milliers = espace (15 133, pas 15,133 ni 15.133)
- **Décimales** : virgule française (7,8% pas 7.8%)
- **TEU/kg** : minuscule sauf titres (15 133 TEU, 5 603 T)
- **Pourcentages** : avec espace insécable (7,8 %)
- **Dates** : "Jan–Mai 2026" avec tiret demi-cadratin

## 8. Mise en application dans pptxgenjs

### 8.1 Constantes globales

```javascript
const COLORS = {
  // Primaires AGL
  NAVY:   '0D2243',
  GOLD:   'C9A84C',
  WHITE:  'FFFFFF',

  // Sémantiques
  GREEN:  '1A7C4F',
  ORANGE: 'E05A00',
  BLUE2:  '2563A8',
  RED:    'CC2200',
  TEAL:   '0E7490',

  // Neutres
  DGRAY:  '374151',
  MGRAY:  '6B7280',
  LGRAY:  'F0F2F5',
  BORDER: 'D1D5DB',

  // Fonds
  LBLUE:  'EBF0F8',
  HIGHL:  'FFF9EC',
};

const FONTS = {
  DEFAULT: 'Calibri',
};

const SIZES = {
  TITLE: 22,
  SUBTITLE: 12,
  KPI_VAL: 22,
  KPI_LABEL: 8,
  TABLE_HEAD: 9,
  TABLE_BODY: 9,
  INSIGHT: 9,
  FOOTER: 9,
};
```

### 8.2 Helpers réutilisables (déjà dans v1.0)

- `addHeader(slide, title, subtitle)` : header navy + titre/sous-titre
- `addFooter(slide, text)` : footer texte + logo AGL
- `addKpiBar(slide, kpis, y)` : barre de 5 KPI cards
- `addRankTable(slide, x, y, w, headers, rows, highlightRow)` : tableau avec ligne AGL surlignée
- `addSegmentBars(slide, x, y, segments)` : barres PDM par segment
- `addMensuelBars(slide, x, y, mois, valeurs, seuil)` : barres PDM mensuelles colorées
- `addInsightBox(slide, x, y, w, h, emoji, lines, bgColor)` : encadré insight
- `addBarChart(slide, x, y, w, h, data, colors)` : graphique barres natif
- `addSeparator(num, title, subtitle)` : slide séparateur métier

---

*Document v1.0 — 18 juin 2026*

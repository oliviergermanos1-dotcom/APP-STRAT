# SLIDES REFERENCE — Description exhaustive des 33 slides

> Description slide par slide de l'étude de référence Jan–Mai 2026, avec contenu attendu, données sources, et logique de génération.

---

## Slide 1 — Couverture

**Type** : Cover plein navy
**Données nécessaires** : aucune (statique)

**Contenu** :
- Logo AGL textuel (top-left, blanc 36pt bold)
- Tagline "AFRICA GLOBAL LOGISTICS" sous le logo (8pt blanc, letter-spacing)
- Titre principal : "Revue Stratégique & Marketing" (44pt blanc bold, 2 lignes)
- Ligne dorée horizontale (8.5" × 0.06")
- "Reporting 2026" (24pt doré bold)
- Tagline "At the heart of Africa's transformation" (16pt blanc bold, 3 lignes)
- Footer central : "Direction Marketing & RP | AGL Abidjan | Juin 2026" (9.5pt gris)
- Année "2026" en bas-droite (18pt blanc bold)

**Variables paramétrables** :
- Période ("Jan–Mai 2026", "Juin 2026")
- Date de production ("Juin 2026")

---

## Slide 2 — Sommaire

**Type** : Layout 2×3 cards
**Données nécessaires** : KPIs résumés par métier

**Contenu** :
6 cards (4.2" × 2.0") alignées en 2 lignes × 3 colonnes :
- Card 01 (Navy) : TIM — "Leader #1 – PDM 7,8% sur 193 989 TEU qualifiés"
- Card 02 (Vert) : TEM — "Dominance absolue – 26,2% PDM sur 137 283 TEU"
- Card 03 (Orange) : Hinterland Import — "#3 → objectif #2 : 11,3% PDM sur 28 457 TEU"
- Card 04 (Bleu) : Hinterland Export — "Leader #1 – 66,1% PDM | Bamako-Ouagadougou"
- Card 05 (Teal) : Aérien Import — "#1 ABSOLU – 20,8% PDM | Croissance forte Jan→Mai"
- Card 06 (Doré) : Synthèses — texte vide ou résumé global

Chaque card :
- Badge numéroté (0.55" × 0.55") en haut-gauche
- Titre métier (12pt bold)
- Description courte (10pt gris)

**Variables** : descriptions courtes générées automatiquement depuis KPIs principaux par métier.

---

## Slide 3 — Séparateur TIM (01)

**Type** : Slide séparateur métier
**Données nécessaires** : KPIs principaux TIM

**Contenu** :
- Fond navy plein
- Numéro "01" géant filigrane (200pt, navy clair `#1A2E4A`)
- Titre "TRANSIT IMPORT MARITIME (TIM)" (38pt blanc bold, centré)
- Ligne dorée sous le titre (8.2" × 0.065")
- Sous-titre italique doré : "193 989 TEU qualifiés | PDM AGL : 7,8% | Leader #1" (16pt)
- Footer centré "Africa Global Logistics – Étude de Marché Jan–Mai 2026"
- Logo AGL doré bas-droite

**Variables** :
- Numéro métier (01, 02, 03, 04, 05, 06)
- Titre métier complet
- Stats KPIs principaux (volume, PDM, rang)

---

## Slide 4 — TIM Vue d'ensemble

**Type** : Slide analytique standard
**Données nécessaires** :
- KPIs : volume marché qualifié, volume AGL, PDM AGL, écart vs #2, cumul TOP 4
- Mensuel : 5 mois × (volume marché, volume AGL, PDM AGL)
- Insight box texte

**Layout** :
- Header navy + titre + sous-titre
- Bandeau 5 KPI cards (1.2 → 2.15")
- Gauche : graphe barres groupées marché vs AGL (0.15 → 6.95, 2.55 → 6.85")
- Droite : 5 barres PDM mensuelles colorées (7.1 → 13, 2.62 → 5.5")
- Insight box en bas-droite (7.1 → 13, 5.7 → 6.45")
- Footer

**Logique couleurs barres mensuelles** :
- Vert si PDM ≥ seuil (7,5% pour TIM)
- Orange si PDM < seuil

**Variables** :
- Données KPI bar (5 valeurs + sub-labels)
- Données mensuelles (5 mois × 3 valeurs)
- Seuil PDM cible
- Texte insight (1-3 lignes)

---

## Slide 5 — TIM Analyse concurrentielle & segments

**Type** : Slide analytique avec tableau + barres
**Données nécessaires** :
- Tableau Top 10 concurrents : rang, transitaire, TEU, PDM
- Barres PDM par segment : nom segment, volume marché, PDM AGL
- Insight box

**Layout** :
- Header + titre
- Gauche : tableau 10 lignes (0.15 → 6.95, 1.5 → 5.3")
- Insight box en bas-gauche (5.45 → 6.2")
- Droite : barres PDM par segment (7.1 → 13, 1.52 → 6.5")
- Footer

**Variables** :
- Highlight row (par défaut : rang #1 = AGL)
- Couleurs barres dynamiques par PDM (vert ≥ 50, bleu ≥ 20, orange ≥ 10, rouge < 10)

---

## Slide 6 — TIM Clientèle AGL

**Type** : Slide tableau + pie chart
**Données nécessaires** :
- Top 10 clients destinataires : nom, TEU, segment, % vol. AGL
- Mix marchandises AGL : labels + pourcentages

**Layout** :
- Header
- Gauche : tableau 10 lignes (0.15 → 7.15, 1.5 → 5.3")
- Insight box en bas-gauche (0.15 → 7.15, 5.35 → 6.3")
- Droite : pie chart mix marchandises (7.3 → 13, 1.5 → 6.0")
- Footer

**Note** : surveiller l'overflow de la colonne 1 du tableau (noms clients longs).

---

## Slide 7 — TIM Nouveaux entrants & nouveaux flux

**Type** : Slide double tableau + barres
**Données nécessaires** :
- Nouveaux transitaires (rangs 11-15) : validés par module N-1
- Nouveaux destinataires AGL : nom, TEU, secteur, entrée
- Nouvelles marchandises captées : barres PDM AGL
- Insight/alerte box

**Layout** :
- Header
- Gauche-haut : tableau 5 nouveaux transitaires (0.15 → 7.15, 1.5 → 3.0")
- Gauche-bas : tableau 5 nouveaux destinataires (0.15 → 7.15, 3.38 → 5.0")
- Droite-haut : barres 4 nouvelles marchandises (7.3 → 13, 1.55 → 3.5")
- Droite-bas : insight box alerte CEVA (7.3 → 13, 4.2 → 5.2")
- Footer

**Logique N-1** : ne contient que les entités validées comme "nouveau" ou "marginal".

---

## Slide 8 — Séparateur TEM (02)

Identique slide 3 avec :
- Numéro "02"
- Titre "TRANSIT EXPORT MARITIME (TEM)"
- Sous-titre KPIs TEM

---

## Slide 9 — TEM Vue d'ensemble

Identique slide 4 (vue d'ensemble TIM) avec :
- Données TEM
- Seuil PDM cible : 25% (TEM est en position dominante)
- Insight box rouge si alerte recul (cf. Mai 2026 à 20,1%)

---

## Slide 10 — TEM Segments & concurrents

**Type** : Slide barres segment + tableau concurrents
**Données nécessaires** :
- Barres PDM par filière export (Bananes, Cacao, Caoutchouc, etc.)
- Tableau Top 10 concurrents TEM
- Insight box

**Layout** :
- Header
- Gauche : barres PDM 8 filières (0.15 → 6.95, 1.52 → 5.3")
- Droite : tableau 10 concurrents (7.0 → 13.2, 1.5 → 5.3")
- Insight box pleine largeur (0.15 → 13, 5.4 → 6.2")
- Footer

---

## Slide 11 — TEM Clientèle chargeurs AGL

Similaire slide 6 (clientèle) avec :
- Top 10 chargeurs TEM (au lieu de destinataires)
- Donut filières (cacao, bananes, caoutchouc...)
- Format : pourcentages affichés sur les segments

---

## Slide 12 — TEM Nouveaux chargeurs & nouvelles filières

Similaire slide 7 (nouveaux entrants) avec :
- Tableau nouveaux chargeurs (CI-ÉNERGIES, SITA GROUP, COOPEX CAJOU, etc.)
- Barres nouvelles filières export (Huile de Palme, Cola...)
- Données validées par module N-1
- Tableau portefeuille existant à sécuriser

---

## Slide 13 — Séparateur Hinterland Import (03)

Numéro "03", titre "HINTERLAND IMPORT MARITIME", sous-titre KPIs HIMP.

---

## Slide 14 — Hinterland Import Vue d'ensemble

Identique slide 4 avec :
- Données HIMP
- Couleur AGL = Orange (barres et indicateurs)
- Seuil PDM cible : 11,3%
- En bas : 2 lignes texte légère :
  - "Destinations : Bamako 55,5% | Ouagadougou 40,0% | Bobo-Dioulasso 2,1%"
  - "Origines : Chine 55,5% | Indonésie 7,1% | Inde 6,8%"

---

## Slide 15 — Hinterland Import Concurrents & segments

Identique slide 5 avec :
- AGL en rang #3 (highlight row index 2)
- Cibles filières à 0% PDM visibles en rouge dans les barres

---

## Slide 16 — Hinterland Import Nouveaux entrants

Identique slide 7 avec :
- Tableau nouveaux transitaires hinterland (SAHEL TRANSIT, BURKINATRANS, etc.)
- Tableau nouveaux destinataires Bamako/Ouagadougou
- Alerte CEVA spécifique HIMP

---

## Slide 17 — Séparateur Hinterland Export (04)

Numéro "04", titre "HINTERLAND EXPORT MARITIME".

---

## Slide 18 — Hinterland Export Vue d'ensemble

Identique slide 4 avec :
- Données HEXP
- Couleur AGL = Vert (position dominante 66,1%)
- Seuil PDM cible : 60%
- En bas : informations chargeurs en clair (SOFITEX, CMDT Bamako, SAGROCOM BF)

**Note** : pas de slide concurrents/clientèle séparée car le métier est petit (3 chargeurs principaux).

---

## Slide 19 — Hinterland Export Nouveaux chargeurs

**Type** : Double tableau + barres concurrents + double insight
**Données** :
- Nouveaux chargeurs entrés en 2026 (validés N-1)
- Portefeuille existant à sécuriser (SOFITEX, CMDT, SAGROCOM)
- Barres PDM concurrents (FM, MOVIS, CEVA)
- 2 insight boxes : menace CEVA + action sécurisation

**Layout** :
- 2 tableaux empilés à gauche
- Barres concurrents en haut-droite
- 2 insight boxes en bas-droite (menace en rouge + action stratégique en jaune)

---

## Slide 20 — Séparateur Aérien (05)

Numéro "05", titre "AÉRIEN IMPORT".

---

## Slide 21 — Aérien Import Vue d'ensemble (2025 vs 2026)

**Type** : Slide comparative année N-1 vs N
**Données** :
- KPI bar : 2025 vs 2026 (5 KPIs)
- Graphe barres comparatif 2025 vs 2026 (marché qualifié kg)
- Barres PDM mensuelle progression Jan→Mai 2026
- Insight box croissance

**Spécificité** : seule slide en comparaison directe N-1 / N (les autres montrent uniquement N).

---

## Slide 22 — Aérien Import Segments & concurrents (2025 vs 2026)

**Type** : Double tableau
**Données** :
- Tableau évolution marchandises 2025 vs 2026 (avec colonne Var.%)
- Tableau Top 10 concurrents aérien 2026
- Insight box transversale

**Layout** :
- Gauche : tableau évolution marchandises (10 lignes)
- Droite : tableau concurrents (10 lignes)
- Insight box pleine largeur en bas

---

## Slide 23 — Aérien Import Clientèle AGL

Similaire slide 6 avec :
- Top 10 destinataires aérien (en kg, pas en TEU)
- Pie mix produits aérien

---

## Slide 24 — Aérien Import Nouveaux entrants

Similaire slide 7 avec :
- Tableau 2 nouveaux transitaires aérien
- Tableau marchandises en forte croissance 2025→2026 (avec PDM AGL actuelle)
- Barres opportunités prioritaires (Œufs cible 8%, etc.)
- Insight leviers stratégiques

---

## Slide 25 — Séparateur DSM

**Type** : Séparateur spécifique (pas de numérotation 01-06)
**Contenu** :
- Fond navy plein
- "DSM" en grand (72pt) au lieu de numéro
- Titre "DIRECTION DES SOLUTIONS MARITIMES" (28pt blanc bold)
- Ligne dorée
- Sous-titre : "Étude des armateurs au B/L | Lignes régulières (TEU + RoRo) | Tramps : BRBK, Sac, Vrac" (14pt italique doré)

---

## Slide 26 — DSM Armateurs en ligne régulière

**Type** : Tableau classement + barres couverture
**Données** :
- Top 10 armateurs : rang, nom, TEU + RoRo, PDM
- Couverture AGL par armateur : nom, PDM, statut (Actif/Partiel/Non couvert)

**Layout** :
- Gauche : tableau 10 armateurs (MSC, Maersk, CMA CGM, etc.)
- Droite : 7 lignes avec barres + statut coloré (vert/bleu/orange/rouge)
- Insight box bas-gauche

---

## Slide 27 — DSM Tramps : BRBK, Sac & Vrac

**Type** : Tableau + barres
**Données** :
- Top 7 manutentionnaires tramps (Bolloré, SDV, AGL...)
- AGL #3 surligné
- Barres PDM AGL par type cargaison (BRBK, Ciment, Sucre, Riz, Vrac, Clinker)
- Insight stratégique

---

## Slide 28 — Focus Sectoriel Pétrole

**Type** : Tableau + statuts visuels
**Données nécessaires (en attente Olivier)** :
- Tableau opérateurs pétroliers : nom, volume T, flux (Import/Export), PDM secteur
- Position AGL par opérateur : statut ✓ ACTIF / PARTIEL / ✗ NON CAPTÉ

**Layout** :
- Gauche : tableau 7 opérateurs (SIR CI, Total, Vivo, Petro Ivoire, Foxtrot, Oryx, Bolloré)
- Droite : 6 cards statut par opérateur
- Insight box pleine largeur en bas

**À paramétrer** :
- Volumes exacts par opérateur
- Statut AGL réel par compte
- Cibles non-captées (Petro Ivoire, Oryx)

---

## Slide 29 — Focus Sectoriel Minier

**Type** : Tableau + barres PDM par métier
**Données nécessaires (en attente Olivier)** :
- Tableau opérateurs miniers : nom, Import TEU, Export, statut AGL
- Barres PDM AGL Matériels Miniers par métier (TIM, Aérien, HIMP, DSM Export)
- Insight position AGL secteur

**Layout** :
- Gauche : tableau 7 opérateurs (K1 Mining, SMI, Endeavour, Newcrest, Sama Nickel, Ivoire Manganèse, Lithium CI)
- Droite : 4 barres PDM par métier
- Insight box bas-gauche

**À paramétrer** :
- Paramétrage clients par site minier
- Stratégie package multi-métiers

---

## Slide 30 — Focus Transitaire AYMAN — Synthèse

**Type** : Grand tableau multi-métiers
**Données nécessaires (à approfondir)** :
- Tableau 6 lignes (1 par métier) × 7 colonnes : Métier, Rang Ayman, Volume Ayman, PDM Ayman, Rang AGL, PDM AGL, Écart AGL

**Layout** :
- Header + sous-titre
- Tableau pleine largeur (0.15 → 13, 1.5 → 4.5")
- Insight box jaune en bas

**Note** : surveiller overflow colonne 1 (noms métiers).

---

## Slide 31 — Focus AYMAN — Analyse détaillée

**Type** : Double bloc profil + face-à-face + recommandations
**Données** :
- Profil Groupe AYMAN : 6 lignes (Création, Cœur, Réseau, Clientèle, Avantages, Croissance)
- Face-à-face par segment : 5 lignes avec Ay% vs AGL% + winner
- Insight réponse AGL

**Layout** :
- Gauche : tableau profil (6 lignes × 2 colonnes)
- Droite : 5 cards face-à-face avec badge winner (AGL vert ou AYMAN orange)
- Insight box pleine largeur

---

## Slide 32 — Séparateur Actions stratégiques (06)

Numéro "06", titre "ACTIONS STRATÉGIQUES PRIORITAIRES", sous-titre "Synthèse transversale | 6 axes | Horizon 12 mois".

---

## Slide 33 — Synthèse — Parts de marché AGL par métier

**Type** : Barres horizontales proportionnelles + badges
**Données** :
- 5 métiers ordonnés par PDM décroissant
- Pour chaque : volume marché, volume AGL, PDM, rang, statut

**Layout** :
- 5 cards horizontales (12.9" × 1.1" chacune)
- Pour chaque card :
  - Label métier + sous-stats (gauche)
  - Barre proportionnelle (centre, max 7.5" pour PDM max 66,1%)
  - Valeur PDM grand format (à droite de la barre)
  - Badge statut + rang (extrême droite)
- Bandeau navy en bas avec synthèse texte (12.9" × 0.32")
- Footer

**Logique couleurs** :
- Vert pour PDM ≥ 20% (Hinterland Export, TEM, Aérien)
- Orange pour PDM 10-20% (Hinterland Import)
- Orange pour PDM < 10% (TIM)

**Badges statut** :
- LEADER (vert) — Hinterland Export 66,1%
- DOMINANT (vert) — TEM 26,2%
- EN HAUSSE (vert) — Aérien 20,8%
- À RENFORCER (orange) — Hinterland Import 11,3%
- SOUS PRESSION (orange) — TIM 7,8%

---

## Slides supplémentaires v2.0

### Préconisations TIM / TEM / HIMP / HEXP / AER (5 slides à ajouter)

**Type** : Layout quadrant + insight final
**Données** : depuis fichier Excel uploadé par Olivier
**Position** : à placer dans le plan de montage selon préférence (recommandation : avant slide 32 séparateur Actions)

**Layout** :
```
┌────────────────────────────────────────────────────────┐
│ Header : TIM — PRÉCONISATIONS STRATÉGIQUES            │
├────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐               │
│ │ VISION MARCHÉ    │ │ POSITIONNEMENT  │               │
│ │ 12 mois          │ │ AGL              │               │
│ │ Points cibles    │ │ Stratégies       │               │
│ └─────────────────┘ └─────────────────┘               │
│ ┌─────────────────┐ ┌─────────────────┐               │
│ │ SEGMENTS CIBLES  │ │ RISQUES          │               │
│ │ Priorités haute  │ │ À surveiller     │               │
│ └─────────────────┘ └─────────────────┘               │
│ [INSIGHT SYNTHÈSE EXPERT]                              │
└────────────────────────────────────────────────────────┘
```

**Couleurs quadrants** :
- Vision Marché : Navy
- Positionnement : Vert
- Segments Cibles : Bleu KPI
- Risques : Rouge

---

## Légende statuts par slide

| Statut | Description |
|--------|-------------|
| ✅ Implémenté v1.0 | Slide générée par script actuel |
| 🔨 À enrichir v2.0 | Slide existante, contenu à mettre à jour |
| ⏳ En attente data | Slide existante, contenu à paramétrer (Mining, O&G, AYMAN, DSM) |
| 🆕 Nouvelle slide | Slide à ajouter en v2.0 (Préconisations) |

| Slide | Statut |
|-------|--------|
| 1 Cover | ✅ |
| 2 Sommaire | ✅ |
| 3 Sep TIM | ✅ |
| 4-7 TIM | ✅ |
| 8 Sep TEM | ✅ |
| 9-12 TEM | ✅ |
| 13 Sep HIMP | ✅ |
| 14-16 HIMP | ✅ |
| 17 Sep HEXP | ✅ |
| 18-19 HEXP | ✅ |
| 20 Sep AER | ✅ |
| 21-24 AER | ✅ |
| 25 Sep DSM | ✅ |
| 26-27 DSM | 🔨 |
| 28 Pétrole | ⏳ |
| 29 Minier | ⏳ |
| 30-31 AYMAN | ⏳ |
| 32 Sep Actions | ✅ |
| 33 Synthèse | ✅ |
| **Préconisations TIM/TEM/HIMP/HEXP/AER (5)** | 🆕 |

---

*Document v1.0 — 18 juin 2026*

# CAP Strategic Analytics — Brief Projet pour Claude Code

> **Ce fichier est lu automatiquement par Claude Code à chaque démarrage.**
> Il contient toute la mémoire projet, conventions, bugs résolus et roadmap.

---

## 📌 CONTEXTE BUSINESS

**Propriétaire du projet** : Olivier ASSAF GERMANOS
**Poste** : Head of Strategy Division — AGL (Africa Global Logistics)
**Localisation** : Abidjan, Côte d'Ivoire
**Audience cible** : COMEX / Direction Marketing & Commercial AGL
**Confidentialité** : Données sensibles (CAP clients) — ne pas committer dans Git public

## 🎯 OBJECTIF DU PROJET

Transformer un reporting d'activité Power BI statique (3 tableaux) en une **Customer Intelligence Platform** stratégique (9 pages, 48 mesures, prédictif). Niveau de qualité attendu : **livrable cabinet international (EY-Parthenon / McKinsey-grade)**.

---

## 🏗️ ARCHITECTURE TECHNIQUE

### Stack
- **Format** : Single-file HTML (PWA installable, autonome)
- **Pas de build** : tout est inline dans `index.html`
- **CDN externes** : XLSX (SheetJS), Chart.js 4.4, Plotly 2.27, PapaParse 5.4
- **Pas de framework** : Vanilla JS pour rester léger et 100% portable
- **Pas de localStorage > 5 MB** : data en mémoire uniquement (sauf option mémoriser)

### Structure interne du HTML (`index.html`)

```
HEAD
├── Manifest PWA inline
├── CDN (XLSX, Chart.js, Plotly, PapaParse)
└── CSS (charte AGL Navy/Or)

BODY
├── #app (header + slicers + sidebar + content) — vide au démarrage
└── #upload-screen (visible au démarrage)

SCRIPTS (10 blocs nommés)
├── js-engine        : Upload, parsing Excel/CSV, mapping flexible, validation
├── js-calculator    : Les 48 mesures DAX traduites en JS (objet CALC.*)
├── js-ui-core       : Layout, navigation, slicers, applyFilters()
├── js-pages-1       : Pages 0-3 (Cockpit, Portfolio, Customers, Growth)
├── js-pages-2       : Pages 4-7 (Cross-sell, Geo, Cohorts, Risk)
└── js-pages-3       : Page 8 (Forecast + What-If)
```

### Les 9 pages

| # | ID | Audience | Contenu clé |
|---|---|---|---|
| 0 | cockpit   | DG/COMEX     | Big Numbers, 6 KPI Macro, alertes top 5 |
| 1 | portfolio | Marketing    | Matrice 9-box scatter, Pareto 80/20 |
| 2 | customers | KAM          | Tableau 200 clients avec Score 0-100 / Tier |
| 3 | growth    | Commercial   | Top growers, decliners, win-back |
| 4 | crosssell | Marketing    | Whitespace, pénétration libellés |
| 5 | geo       | Opérations   | Performance par site (charts + tableau) |
| 6 | cohorts   | Marketing    | Matrice cohortes interactive |
| 7 | risk      | COMEX/KAM    | Health Score & alertes churn |
| 8 | forecast  | DG/Stratégie | Forecast multi-horizon + What-If 3 sliders |

### Les 48 mesures (objet `CALC.*`)

**Mesures de base (7)** : `cap`, `capN_1`, `evolutionAbs`, `evolutionPct`, `couleurEvolution`, `nbClients`, `capMoyenClient`

**KPI Macro (6)** : `HHI`, `top10Dependency`, `NRR`, `GRR`, `churnRate`, `newLogoContribution`

**Segmentation (10)** : `aggregateByClient`, `computePercentiles`, `precomputeStats`, `scoreClient`, `tier`, `quadrant9Box`, `quadrantColor`, `statutCycleVie`

**Cross-sell** : intégré dans `aggregateByClient` (nbLibelles, nbSites)

**Health Score** : `healthScore`, `healthStatus`

**Forecast** : `cagr`, `coefSaisonniers`, `forecast`

> ⚠️ Toutes les mesures DAX d'origine sont documentées dans `docs/DAX_REFERENCE.md`

---

## 📊 STRUCTURE DES DONNÉES

### Source : `data/CAP_IRIS_Consolidated.xlsx`

Issu de la **fusion** de 2 fichiers IRIS d'AGL :
- `Classeur1.xlsx` (export brut SAP/IRIS — 156k lignes)
- `REF_METIER_LIBELLES_FACT.csv` (référentiel libellés/métiers)

**Colonnes finales** :
| Colonne | Type | Description |
|---|---|---|
| MONTANT | Number | Montant en XOF (peut être négatif = avoir) |
| CLIENT | String | Nom raison sociale |
| ANNEE | Integer | 2022-2026 |
| MOIS | Integer | 1-12 |
| SITE | String | ABJ, BYK, DLA, SPY |
| LIBELLE | String | Libellé département (70 distincts) |
| METIER | String | 10 BU (TRANSIT MARITIME, MANUTENTION & TERMINAUX, AERIEN, etc.) |
| CODE_DEPAR | String | Code département IRIS (ex: 10A00, 20F00) |
| RUBRQ | String | Rubrique comptable (ex: CAP054) |
| ID | String | ID client interne IRIS |

**Volumétrie typique** :
- 156 590 lignes valides
- 365.5 milliards XOF de CAP cumulé 2022-2026
- 3 396 clients distincts
- 4 sites (ABJ = Abidjan, SPY = San Pedro, BYK = Bouaké, DLA = Douala)

### Mapping flexible des colonnes (engine)

L'application accepte plusieurs variantes via `COLUMN_MAP` dans `js-engine`. Si un utilisateur charge un fichier avec `MONTAN` au lieu de `MONTANT`, ou `CLIENTS` au lieu de `CLIENT`, le système détecte automatiquement.

---

## 🐛 BUGS HISTORIQUES RÉSOLUS (NE PAS REFAIRE)

Ces bugs ont été identifiés et corrigés. **Ne pas réintroduire** :

### Bug #1 — Stack overflow `Math.max(...arr)` sur >100k éléments
- **Symptôme** : page blanche à l'ouverture après upload
- **Cause** : `Math.max(...array)` plante avec spread sur grand tableau (limite stack JS)
- **Solution** : utiliser `array.reduce((m, v) => v > m ? v : m, 0)`
- **Fichier** : `js-calculator` (CALC.scoreClient, CALC.cagr, etc.)

### Bug #2 — Calcul O(n²) inutile dans Cohorts
- **Symptôme** : navigateur figé sur la page Cohort & Lifecycle
- **Cause** : `data.fact.map(r => data.fact.filter(x => x.CLIENT === r.CLIENT))` = 156k × 156k = 24 milliards d'opérations
- **Solution** : variable supprimée (n'était pas utilisée)
- **Fichier** : `js-pages-2` render_cohorts

### Bug #3 — quadrant9Box trie à chaque appel
- **Symptôme** : `applyFilters()` met plusieurs secondes
- **Cause** : `[...all].sort()` exécuté 3396 fois pour 3396 clients
- **Solution** : pré-calcul `computePercentiles(all)` **1 fois**, passer p80/p20 en paramètres
- **Fichier** : `js-calculator` + `js-ui-core` applyFilters

### Bug #4 — scoreClient recalcule max à chaque appel
- **Symptôme** : lent
- **Solution** : `precomputeStats(all)` 1 fois, passe `stats` en paramètre

### Bug #5 — forecastByClient O(N×M)
- **Symptôme** : page Forecast très lente
- **Cause** : 3396 clients × 156k lignes filter = 530M opérations
- **Solution** : pré-grouper rows par client, limiter aux Top 50 par CA
- **Fichier** : `js-pages-3` render_forecast

### Bug #6 — Codes département corrompus en notation scientifique
- **Symptôme** : `2,00E+01` et `7,00E+01` dans REF_METIER_LIBELLES
- **Cause** : Excel convertit `20E00` (qui ressemble à 20×10¹) en notation scientifique
- **Solution** : pré-traitement Python avant consolidation Excel
- **Fichier** : `scripts/consolidate.py`

### Bug #7 — Calcul lourd dans template string `wi-result`
- **Symptôme** : sliders What-If gèlent
- **Solution** : utiliser `top50ClientsByCA` déjà calculé
- **Fichier** : `js-pages-3` render_forecast

---

## 🎨 CHARTE GRAPHIQUE AGL (NE PAS CHANGER)

| Élément | Couleur | Hex |
|---|---|---|
| Navy primaire | Bleu marine AGL | `#0A2540` |
| Navy secondaire | Bleu clair | `#1B3A5C` |
| Or AGL | Doré | `#D4A24E` |
| Or secondaire | Doré clair | `#F4D894` |
| Évolution forte croissance | Vert foncé | `#0B6E4F` |
| Évolution croissance | Vert clair | `#52B788` |
| Évolution stable | Jaune | `#F4D35E` |
| Évolution décroissance | Orange | `#F77F00` |
| Évolution critique | Rouge | `#D62828` |
| Nouveau client | Bleu | `#1F77B4` |
| Client perdu | Gris | `#7F7F7F` |

**Fonts** :
- Display (titres) : Playfair Display (serif élégant)
- Body : Inter
- Monospace (chiffres tabulaires) : JetBrains Mono

---

## 🧠 STYLE DE TRAVAIL D'OLIVIER

Olivier travaille **par étapes courtes avec validations**. Style observé :
- Messages courts : "ok", "go", "super"
- Mots-clés de reprise : "go frip" (FripGestion), "jarvis go" (JARVIS)
- Pour ce projet : suggérer **"go cap"** comme keyword de reprise
- Préfère **action directe** plutôt que longues explications
- N'hésite pas à pousser pour aller plus loin (il accepte les recommandations Partner)
- Tolérance zéro pour bugs récurrents : "je ne veux plus tourner en rond avec 15 codes avec toujours des erreurs"

**À faire systématiquement** :
- ✅ Vérifier la syntaxe JS avant de livrer (utiliser `tests/perf_test.js`)
- ✅ Tester perf sur dataset 156k lignes simulé
- ✅ Mode Senior Partner Cabinet (analytique, structuré)
- ✅ Tableaux comparatifs quand pertinent
- ✅ Recommandation explicite à chaque choix

**À éviter** :
- ❌ Re-générer tout le HTML pour un bugfix (faire des `Edit` ciblés)
- ❌ Mots vagues type "voici une amélioration"
- ❌ Solutions sans test de validation

---

## 🚀 ROADMAP — ÉVOLUTIONS POSSIBLES

### V1.1 (court terme)
- [ ] Filtre par client (autocomplete) dans la slicer bar
- [ ] Drill-down client : vue 360° d'un client en cliquant son nom
- [ ] Export Excel des tableaux (chaque page)
- [ ] Mode dark/light toggle

### V1.5 (moyen terme)
- [ ] Module fournisseurs (si données dispo)
- [ ] Suivi des objectifs commerciaux par KAM
- [ ] Comparateur : 2 périodes côte-à-côte
- [ ] Alertes automatiques par email (via Apps Script si déployé)

### V2.0 (long terme)
- [ ] Forecasting niveau 3 (Holt-Winters explicit en JS)
- [ ] Détection d'anomalies (z-score sur transactions)
- [ ] Module ML : prédiction de churn par client
- [ ] Intégration Dynamics 365 CRM (si accessible)
- [ ] Multi-utilisateurs avec auth Supabase

### V3.0 (vision)
- [ ] Backend Supabase pour partage entre KAM
- [ ] App mobile native (React Native ou Flutter)
- [ ] Intégration JARVIS pour briefing quotidien automatique

---

## 📋 COMMANDES UTILES POUR CLAUDE CODE

```bash
# Démarrer une session
claude

# Tester perf après modification
node tests/perf_test.js

# Valider la syntaxe JS du HTML
node tests/validate_syntax.js

# Re-consolider les données depuis IRIS
python scripts/consolidate.py

# Lancer un serveur local (Python intégré Windows)
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

---

## 🔑 KEYWORDS DE REPRISE

- **"go cap"** : reprendre le développement de CAP Strategic Analytics
- **"audit cap"** : audit complet du code (perf, bugs, qualité)
- **"deploy cap"** : préparer pour déploiement Vercel/Netlify

---

## 📞 ESCALATION

Si Claude Code détecte une anomalie majeure (perte de données, faille sécurité, erreur de calcul stratégique), **demander confirmation à Olivier avant de modifier**. Préférer la prudence : un mauvais calcul de CAP = mauvaise décision COMEX.

---

*Dernière mise à jour : Mai 2026*
*Version brief : 1.0*

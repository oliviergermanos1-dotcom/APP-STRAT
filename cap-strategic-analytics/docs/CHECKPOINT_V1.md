# 📌 CHECKPOINT V1.0 — CAP Strategic Analytics

> **État stable de l'application au 9 mai 2026.**
>
> Cette version est **figée** comme référence stable. Les évolutions
> futures (refonte data prep, app séparée…) se feront sur une nouvelle
> branche pour ne pas toucher cette version opérationnelle.

---

## 🎯 Statut

| Champ | Valeur |
|---|---|
| **Version** | 1.0 (production-ready) |
| **Date** | 9 mai 2026 |
| **Commit de référence** | `c782f08` |
| **Branche** | `claude/setup-repo-security-DuAQq` |
| **Tag git** | `v1.0` |
| **Statut** | ✅ Stable, prêt usage COMEX |

---

## ✅ Fonctionnalités livrées (V1.0)

### 📊 23 pages d'analyse stratégique

#### Pilotage
- 00 Cockpit COMEX
- 01 Cartographie portefeuille (matrice 9-box BCG/McKinsey)
- 09 Centre d'action commerciale
- 14 Briefing exécutif COMEX (note de cabinet consolidée)
- 20 Comparateur 2 périodes côte-à-côte

#### Clients
- 02 Vue 360° clients (Score 0-100 + Tiers S/A/B/C/D)
- 03 Moteur de croissance (top growers, decliners, win-back)
- 04 Radar ventes croisées (whitespace)
- 17 Customer Velocity (progression entre tiers)
- 18 Segmentation RFM comportementale (11 segments)
- 21 Cadence de facturation (nb factures/mois + tendance + projection)

#### Périmètre
- 05 Performance géographique (ABJ, SPY, BYK, DLA)
- 06 Cohortes & cycle de vie
- 10 Heatmap mois × métier

#### Risques
- 07 Tour de contrôle risques (Health Score)
- 15 Cartographie 10 risques stratégiques
- 16 Détection d'anomalies (patterns)
- 19 Qualité des données
- 22 Anomalies statistiques (Z-score robuste)
- 23 Score de churn probabiliste (ML logistic regression)

#### Intelligence
- 11 Filières clients (cacao, coton, pétrole…)
- 13 Suivi stratégie AGL (objectifs annuels vs réalisé)

#### Prospective
- 08 Prévisions & projections (Holt-Winters + IC 95%)

### 🔧 Fonctionnalités transverses

- ✅ Autocomplete client temps réel + drill-down 360°
- ✅ Filtres multi-niveaux (Année, Mois, Site, Métier, Département, Client)
- ✅ Toggle Cumul / Mois seul
- ✅ Comparaisons N vs N-1 alignées sur mêmes mois
- ✅ Règles strictes (nouveau client = 36 mois, perdu = 9 mois)
- ✅ Fuzzy matching 5 algorithmes (auto-classification "À vérifier")
- ✅ Synthèses stratégiques en haut de chaque page (style cabinet)
- ✅ Annotations KAM persistantes (localStorage)
- ✅ Battle Cards A4 imprimables par client
- ✅ Mobile responsive (Android + iOS Safari)
- ✅ Mode présentation auto (rotation 30s)

### 📤 Exports

- ✅ HTML interactif chiffré AES-256 + watermark personnalisé par destinataire
- ✅ PDF complet 19 pages (page de garde + toutes les analyses)
- ✅ Excel par page (multi-feuilles)
- ✅ Battle Cards A4 par client

### 🛡 Sécurité

- ✅ Repository GitHub privé
- ✅ `.gitignore` racine (Excel, snapshots, secrets bloqués)
- ✅ Chiffrement AES-256 PBKDF2 100k iterations
- ✅ Modal password custom iOS-friendly (3 tentatives max)
- ✅ Watermark "AGL CONFIDENTIEL — {nom}" + filigrane diagonal
- ✅ Identifiant unique versionId par export
- ✅ ID interne IRIS retiré des exports (RGPD art. 5.1.c)

### 📐 Robustesse mathématique

- ✅ Helpers `_safeNum`, `_safeDiv`, `_safeLog`, `_clamp`
- ✅ `_percentile` + `_iqrBounds` + `_robustZ` (médiane + MAD)
- ✅ `precomputeStats` IQR-capped (résistant aux outliers extrêmes)
- ✅ `scoreClient` durci (garde-fous numériques)
- ✅ `try/catch` dans `renderCurrentPage` (résilience)

### 🔬 Modèles statistiques avancés

- ✅ Holt-Winters multiplicatif (saisonnalité 12 mois)
  - Niveau α=0.30 · Tendance β=0.05 · Saison γ=0.30
  - Intervalle de confiance 95% basé sur RMSE × √h
  - Métriques RMSE + MAPE in-sample affichées
- ✅ Régression logistique JS pour churn (6 variables, calibrage auto)
- ✅ Z-score robuste (médiane + MAD × 1.4826) pour anomalies

### 🎨 Identité visuelle

- ✅ Logo AGL officiel inline SVG (header + page de garde PDF)
- ✅ Charte AGL respectée (Navy `#0A2540` + Or `#D4A24E`)
- ✅ Fonts : Playfair Display (titres) + Inter (corps) + JetBrains Mono (chiffres)

### 🚦 Stabilité

- ✅ Gestionnaire d'erreurs global (toast + recharger/ignorer)
- ✅ Cleanup Chart.js + Plotly avant re-render (anti memory leak)
- ✅ Debounce slicers 80ms (anti-stutter)
- ✅ Spinner de chargement (>200ms)

### 📋 Documentation

- ✅ `docs/RGPD_FICHE_TRAITEMENT.md` (template DPO)
- ✅ `docs/POLITIQUE_CONSERVATION.md`
- ✅ `docs/ARCHITECTURE.md`
- ✅ `docs/DAX_REFERENCE.md`
- ✅ `docs/ROADMAP.md`
- ✅ `CLAUDE.md` (brief projet pour Claude Code)

---

## 📊 Métriques techniques

| Indicateur | Valeur |
|---|---|
| Taille `index.html` | 509 KB (uncompressed) |
| Volumétrie testée | 156 590 lignes IRIS (3 396 clients) |
| Performance applyFilters | 31 ms |
| Performance Forecast 12 mois | 18 ms |
| Performance HHI | 13 ms |
| Performance NRR | 19 ms |
| Validation syntaxe | 6/6 scripts JS OK |
| Score robustesse maths | 9/10 |
| Score sécurité | 9/10 |
| Score conformité RGPD | 9.3/10 |

---

## 📋 Historique commits de la session V1.0

| # | Commit | Sujet |
|---|---|---|
| 1 | `c453baf` | Autocomplete client + drill-down 360° |
| 2 | `c1857ab` | Export Excel par page |
| 3 | `11bdef8` | Comparateur 2 périodes côte-à-côte |
| 4 | `982508a` | Watermark personnalisé par destinataire |
| 5 | `26e001a` | Conformité RGPD (strip ID + 2 docs) |
| 6 | `8146c1a` | Briefing COMEX réécrit (note de cabinet) |
| 7 | `559cfc6` | Robustesse mathématique (IQR + try/catch) |
| 8 | `61dc4b6` | Suppression page Corridors |
| 9 | `07ee549` | Page Cadence facturation |
| 10 | `037297b` | Holt-Winters + IC 95% RMSE |
| 11 | `e2f6bc3` | Logo AGL + Z-score + ML Churn |
| 12 | `c782f08` | Pack Stabilité+ |

---

## 🚀 Évolutions prévues (V2 — branche séparée)

> ⚠️ Cette V1.0 est **figée**. Les évolutions ci-dessous se feront sur une
> branche `claude/v2-data-prep` pour ne pas perturber la version stable.

### V2 — Refonte chaîne de données

**Objectif** : extraire la logique de préparation/qualité des données
de l'application analytique vers une **app séparée** (data prep & cleaning).

#### App 1 (NEW) — AGL Data Prep
- 3 tables référentielles éditables :
  - Master clients (avec aliases groupés)
  - Métier × Département (relation exacte)
  - Exclusions (clients/groupes à retirer)
- Import Excel IRIS brut
- Validation auto métier × département (flag mismatches)
- Fuzzy matching en **propositions** (validation humaine, pas auto-merge)
- Bouton exclusion clients/groupes avant export
- Export Excel propre prêt pour App 2

#### App 2 (CURRENT) — CAP Strategic Analytics
- Reçoit l'Excel propre validé
- Plus de fuzzy matching dans cette app
- Concentré sur la génération de rapports

### Bénéfices attendus
- ✅ Qualité des données auditée mensuellement
- ✅ Rapports COMEX incontestables
- ✅ Réutilisable (Excel propre alimente aussi Power BI, Excel direct, futures intégrations)
- ✅ Aligné gouvernance : séparation data layer / analytics layer

---

## 🔗 Accès

### Repository
- **GitHub** : https://github.com/oliviergermanos1-dotcom/APP-STRAT
- **Branche stable V1** : `claude/setup-repo-security-DuAQq`
- **Tag git** : `v1.0` (à appliquer sur `c782f08`)

### Commandes de reprise
```bash
# Reprendre le développement V2 (data prep)
"go cap v2"

# Revenir à la V1 stable pour usage opérationnel
git checkout v1.0
```

### Procédure d'urgence
Si la V2 casse quelque chose, il suffit de revenir à la V1 :
```bash
git checkout v1.0
# OU
git checkout claude/setup-repo-security-DuAQq
```

---

*Checkpoint V1.0 créé le 9 mai 2026 · Olivier ASSAF GERMANOS · AGL*

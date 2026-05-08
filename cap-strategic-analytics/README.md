# CAP Strategic Analytics — AGL

> **Customer Intelligence Platform** pour la Direction Marketing & Commercial d'Africa Global Logistics.
> Single-file HTML autonome avec 9 pages d'analyse stratégique, 48 mesures DAX traduites en JS, prédictif multi-horizon et What-If interactif.

---

## 🚀 DÉMARRAGE RAPIDE

### Option 1 : Tester l'application directement (sans Claude Code)

1. Ouvrir `index.html` dans un navigateur (Chrome / Edge recommandé)
2. Glisser-déposer `data/CAP_IRIS_Consolidated.xlsx`
3. Cliquer sur "Lancer l'analyse stratégique"
4. Naviguer dans les 9 pages via le menu latéral

### Option 2 : Développer avec Claude Code (recommandé)

```bash
# 1. Installer Node.js (si pas déjà fait) : https://nodejs.org
# 2. Installer Claude Code
npm install -g @anthropic-ai/claude-code

# 3. Configurer la clé API (créer un compte sur https://console.anthropic.com)
# Suivre la procédure interactive au premier lancement

# 4. Aller dans le dossier projet
cd cap-strategic-analytics

# 5. Lancer Claude Code
claude

# Au démarrage, Claude Code lit automatiquement CLAUDE.md
# et a tout le contexte du projet
```

---

## 📁 STRUCTURE DU PROJET

```
cap-strategic-analytics/
├── README.md                       ← Ce fichier (mode d'emploi)
├── CLAUDE.md                       ← Brief mémoire pour Claude Code
├── package.json                    ← Métadonnées projet
├── index.html                      ← L'application complète (single-file)
│
├── data/
│   └── CAP_IRIS_Consolidated.xlsx  ← Données AGL consolidées (156k lignes)
│
├── docs/
│   ├── ARCHITECTURE.md             ← Architecture technique détaillée
│   ├── DAX_REFERENCE.md            ← Les 48 mesures avec formules DAX d'origine
│   └── ROADMAP.md                  ← Évolutions futures planifiées
│
├── scripts/
│   ├── consolidate.py              ← Consolidation IRIS Excel + REF CSV
│   └── serve.bat                   ← Lancer serveur local (Windows)
│
├── tests/
│   ├── validate_syntax.js          ← Validation syntaxe JS du HTML
│   └── perf_test.js                ← Test perf sur dataset 156k simulé
│
└── .gitignore                      ← Fichiers à ne pas committer
```

---

## 🎯 LES 9 PAGES DE L'APPLICATION

| # | Page | Audience prioritaire |
|---|---|---|
| 0 | **Cockpit COMEX** | DG / COMEX |
| 1 | **Portfolio Strategic Map** (matrice 9-box) | Direction Marketing |
| 2 | **Customer Deep Dive** (Score 0-100, Tier S/A/B/C/D) | KAM / Commercial |
| 3 | **Growth Engine** | Direction Commerciale |
| 4 | **Cross-sell Radar** | Marketing produit |
| 5 | **Geographic Performance** | Direction Opérations |
| 6 | **Cohort & Lifecycle** | Direction Marketing |
| 7 | **Risk Watch Tower** (Health Score) | COMEX / KAM |
| 8 | **Forecast & Projections** (multi-horizon + What-If) | DG / Stratégie |

---

## 🛠️ COMMANDES UTILES

### Tester l'application en local

```bash
# Windows : double-cliquer sur scripts/serve.bat
# Ou en ligne de commande :
python -m http.server 8000
# Puis ouvrir http://localhost:8000
```

### Valider la syntaxe après modification

```bash
node tests/validate_syntax.js
```

### Tester les performances

```bash
node tests/perf_test.js
```

### Re-consolider les données depuis IRIS

```bash
# Si tu mets à jour les fichiers IRIS source
python scripts/consolidate.py
```

---

## 🔑 KEYWORDS POUR REPRENDRE LE PROJET

Quand tu reviens sur Claude Code après une pause, utilise ces mots-clés :

- **"go cap"** : reprendre le développement
- **"audit cap"** : audit complet code (perf, bugs, qualité)
- **"deploy cap"** : préparer le déploiement Vercel

Claude Code lit `CLAUDE.md` et reprend exactement là où tu t'étais arrêté.

---

## 🚨 BUGS HISTORIQUES (DÉJÀ RÉSOLUS)

Les bugs suivants ont été identifiés et corrigés. **Ne pas les réintroduire** :

1. ❌ `Math.max(...arr)` sur >100k éléments → stack overflow
2. ❌ Calcul O(n²) dans Cohorts → navigateur figé
3. ❌ `quadrant9Box` triait à chaque appel → applyFilters lent
4. ❌ `scoreClient` recalculait max à chaque appel
5. ❌ `forecastByClient` 530M opérations
6. ❌ Codes département corrompus en notation scientifique Excel
7. ❌ Calcul lourd dans template string `wi-result`

Voir détails dans `CLAUDE.md` section "BUGS HISTORIQUES RÉSOLUS".

---

## 📊 DONNÉES SOURCE

Le fichier `data/CAP_IRIS_Consolidated.xlsx` est la consolidation propre de :
- Export brut IRIS (156k lignes 2022-Avril 2026)
- Référentiel libellés/métiers AGL

**Volumétrie** :
- 156 590 lignes valides
- 365.5 milliards XOF de CAP cumulé
- 3 396 clients distincts
- 4 sites (ABJ, BYK, DLA, SPY)
- 10 métiers AGL
- 70 libellés distincts

---

## 🔒 CONFIDENTIALITÉ

⚠️ **Données AGL sensibles**. Ne pas committer dans un repo Git public.

Le fichier `.gitignore` exclut déjà :
- `data/` (toutes les données métier)
- `*.xlsx`, `*.csv` (sécurité supplémentaire)
- `.env` (variables d'environnement)

---

## 🆘 SUPPORT

**Bugs / Évolutions** : Utiliser Claude Code → `claude` → décrire le problème
**Questions stratégiques** : Voir `CLAUDE.md` pour le contexte business
**Documentation technique** : Voir `docs/ARCHITECTURE.md`

---

*Projet : CAP Strategic Analytics*
*Propriétaire : Olivier ASSAF GERMANOS — Head of Strategy AGL*
*Version : 1.0 — Mai 2026*

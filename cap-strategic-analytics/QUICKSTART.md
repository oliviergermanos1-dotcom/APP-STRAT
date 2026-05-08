# 🚀 QUICK START — CAP Strategic Analytics

## 3 OPTIONS POUR DÉMARRER

---

### ⚡ OPTION 1 : Tester immédiatement (le plus simple)

1. **Décompresse** ce dossier
2. **Double-clique** sur `index.html`
3. Glisse-dépose `data/CAP_IRIS_Consolidated.xlsx`
4. Clique "Lancer l'analyse"

✅ C'est tout. L'application tourne dans ton navigateur.

---

### 🌐 OPTION 2 : Lancer un serveur local (recommandé)

1. **Double-clique** sur `scripts/serve.bat`
2. Ton navigateur ouvre `http://localhost:8000`
3. Glisse-dépose le fichier Excel

> Avantage : évite certaines limitations de sécurité du navigateur (file://)

---

### 🤖 OPTION 3 : Développer avec Claude Code (la plus puissante)

#### A. Installation Claude Code (une fois)

```bash
# 1. Installer Node.js si besoin : https://nodejs.org
# 2. Installer Claude Code
npm install -g @anthropic-ai/claude-code

# 3. Se connecter (premier lancement)
claude
# → Suit la procédure interactive (compte Anthropic + clé API)
```

#### B. Démarrer une session de développement

```bash
# Ouvrir un terminal dans le dossier décompressé
cd cap-strategic-analytics

# Lancer Claude Code
claude
```

Claude Code lit automatiquement `CLAUDE.md` et a tout le contexte du projet.

#### C. Commandes magiques

Une fois dans Claude Code, tape :

| Commande | Action |
|---|---|
| `go cap` | Reprendre le développement |
| `audit cap` | Audit complet du code |
| `test perf` | Tester les performances |
| `add page X` | Ajouter une nouvelle page |
| `fix bug Y` | Corriger un bug spécifique |

---

## 📋 VÉRIFICATION RAPIDE

Avant de commencer, vérifier que tout est OK :

```bash
# Test syntaxe (doit afficher 0 erreur)
node tests/validate_syntax.js

# Test performance (doit tout passer en vert)
node tests/perf_test.js
```

---

## 🆘 DÉPANNAGE

| Problème | Solution |
|---|---|
| Page blanche après upload | Voir `CLAUDE.md` section "Bugs résolus" |
| Performance lente | `node tests/perf_test.js` pour diagnostic |
| Excel non reconnu | Vérifier les noms de colonnes (voir README) |
| `node` non reconnu | Installer Node.js depuis https://nodejs.org |
| `python` non reconnu | Installer Python depuis https://python.org |

---

## 📂 STRUCTURE DU PROJET

```
cap-strategic-analytics/
│
├── 📄 index.html              ← L'APPLICATION
├── 📄 README.md               ← Documentation principale
├── 📄 CLAUDE.md               ← ⭐ Brief pour Claude Code (LIRE !)
├── 📄 QUICKSTART.md           ← Ce fichier
├── 📄 package.json
├── 📄 .gitignore
│
├── 📁 data/
│   └── CAP_IRIS_Consolidated.xlsx   ← Tes données (156k lignes)
│
├── 📁 docs/
│   ├── ARCHITECTURE.md        ← Architecture technique détaillée
│   ├── DAX_REFERENCE.md       ← Les 48 mesures DAX d'origine
│   └── ROADMAP.md             ← Évolutions futures
│
├── 📁 scripts/
│   ├── consolidate.py         ← Re-consolider depuis IRIS brut
│   └── serve.bat              ← Lancer serveur local Windows
│
└── 📁 tests/
    ├── validate_syntax.js     ← Test syntaxe JS
    └── perf_test.js           ← Test performance 156k lignes
```

---

## 🔑 LE FICHIER LE PLUS IMPORTANT : `CLAUDE.md`

Si tu utilises Claude Code, **lis d'abord CLAUDE.md**. Il contient :

- 📌 Contexte business (toi, AGL, l'objectif)
- 🏗️ Architecture technique (les 9 pages, les 48 mesures)
- 🐛 Bugs déjà résolus (pour ne pas les refaire)
- 🎨 Charte graphique (couleurs, fonts)
- 🚀 Roadmap (V1.1, V1.5, V2.0...)
- 🧠 Style de travail à adopter

Quand tu lances `claude`, il lit ce fichier et **se met en mode projet immédiatement**.

---

*Bon développement ! 🚀*
*— Olivier ASSAF GERMANOS, Head of Strategy AGL*

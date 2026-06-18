# Comité de Direction — Générateur d'Études de Marché

> Plateforme de génération automatisée d'études de marché stratégiques pour Africa Global Logistics (AGL), Direction Marketing & RP, Abidjan.

---

## 1. Vue d'ensemble

**Comité de Direction** est une application web qui industrialise la production des études de marché récurrentes d'AGL Côte d'Ivoire. L'outil remplace un workflow manuel de 3 à 5 jours (extractions Excel → tableaux croisés → mise en forme PowerPoint slide par slide) par une chaîne automatisée :

```
BDD STATCOM + IRIS + CRM
        ↓
Injection structurée (CSV / TSV / XLSX par métier)
        ↓
Validation N-1 automatique (anti-faux-nouveaux)
        ↓
Génération PPTX 33 slides (charte AGL)
        ↓
Injection optionnelle de slides externes (Power BI, Excel, autres)
        ↓
Livrable final assemblé prêt CODIR
```

L'outil reproduit fidèlement le format de référence (étude Jan–Mai 2026, 33 slides) tout en permettant : (a) le rafraîchissement périodique sans repartir de zéro, (b) l'ajout de slides externes copiées-collées, et (c) l'enrichissement par module (Mining, O&G, AYMAN, DSM, Préconisations).

---

## 2. Contexte métier

### 2.1 Producteur et destinataires

- **Producteur** : Direction Marketing & RP — AGL Abidjan.
- **Destinataire principal** : CODIR AGL Côte d'Ivoire (Directeur Général, Directeurs Métiers).
- **Cadence** : étude mensuelle ou bimensuelle selon période (campagne cacao, fin semestre, exercice budgétaire).
- **Langue** : français exclusivement.

### 2.2 Périmètre des données

L'étude couvre 5 métiers AGL + transversaux :

| Code | Métier | Unité | Périmètre |
|------|--------|-------|-----------|
| `TIM` | Transit Import Maritime | TEU | Port Abidjan, hors Non Apuré / SIR CI / SMB |
| `TEM` | Transit Export Maritime | TEU | Port Abidjan, filières agricoles + caoutchouc |
| `HIMP` | Hinterland Import | TEU | Corridor Abidjan → Mali / Burkina |
| `HEXP` | Hinterland Export | TEU | Corridor Mali / Burkina → Abidjan (coton dominant) |
| `AER` | Aérien Import | kg | Aéroport Félix Houphouët-Boigny |
| `DSM` | Direction Solutions Maritimes | T-eq | Armateurs (lignes régulières + tramps) |

Plus 4 focus sectoriels et transversaux : **Pétrole** (B/L hydrocarbures), **Minier** (Or, Manganèse, Nickel, Lithium), **Groupe AYMAN** (concurrent transversal), **Préconisations stratégiques** (vision marché + positionnement AGL).

### 2.3 Sources de données

| Source | Type | Usage |
|--------|------|-------|
| **STATCOM** | Base interne AGL | Volumes par transitaire, marchandise, destinataire |
| **IRIS** | Système facturation AGL | Volumes AGL réels par client et métier |
| **CRM AGL** | Référentiel clients | Enrichissement segment / secteur / corridor |
| **RUBRIKS** | BDD opérations | Données complémentaires DSM |
| **Power BI codir_V1.pbix** | Tableau de bord interne | Slides exportées injectables |
| **Manuel** | Saisie expert | Insights, alertes, préconisations |

---

## 3. Composants livrés

### 3.1 Générateur PPTX (`generate_AGL_2026.js`)

Script Node.js basé sur `pptxgenjs`. 33 slides reproduites à l'identique du format de référence. Données paramétrables en haut de fichier (constantes par métier).

**Exécution** :
```bash
npm install pptxgenjs
node generate_AGL_2026.js
# → AGL_Etude_Marche_Jan_Mai_2026.pptx
```

### 3.2 Validateur Nouveaux Entrants N-1

Module React qui croise automatiquement les candidats "nouveaux entrants" année N contre le référentiel complet année N-1 (12 mois), pour éliminer les faux nouveaux.

**Verdict par entité** :
- `nouveau` — absent toute l'année N-1 (volume = 0 ou nom introuvable)
- `marginal` — présent en N-1 mais < 30% du volume N (montée en puissance)
- `existant` — significativement actif en N-1 (à exclure de la slide)

Matching par similarité de noms (normalisation accents + tokens), seuil 72%.

### 3.3 Injecteur de slides externes (à développer — voir CDC)

Module Python utilisant `python-pptx` pour copier des slides d'un PPTX externe et les insérer à des positions précises dans le PPTX final.

---

## 4. État du projet

| Composant | Statut | Notes |
|-----------|--------|-------|
| Générateur 33 slides | ✅ Livré v1.0 | Reproduction fidèle du format Jan–Mai 2026 |
| Validateur N-1 | ✅ Livré v1.0 | Widget React standalone |
| Slides 6, 23, 30 — overflow texte | 🟡 À corriger v1.1 | Élargissement colonnes (correction 5 min) |
| Focus Mining (slide 29) | ⏳ Attente data | Paramétrage clients par site |
| Focus O&G (slide 28) | ⏳ Attente data | Volumes opérateurs détaillés |
| Focus AYMAN approfondi | ⏳ Attente data | Volumes DJAM DKS + HANNYYAH par segment |
| DSM modifications | ⏳ Attente data | Éléments à modifier sur slides 26–27 |
| Slides préconisations / métier | ⏳ Attente Excel | 5 nouvelles slides à créer |
| Injecteur PPTX externes | 🔨 À développer | Spec dans CDC |
| Interface web unifiée | 🔨 À développer | Spec dans CDC |

---

## 5. Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│                    AGL STUDIO (Vercel)                       │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  Frontend Next │  │  API Routes    │  │  Supabase    │ │
│  │  React + TS    │←→│  Node.js       │←→│  Storage +   │ │
│  │  Tailwind      │  │  pptxgenjs     │  │  Postgres    │ │
│  │                │  │  python-pptx   │  │              │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│         ↑                    ↓                    ↑         │
│         │                    │                    │         │
│    Olivier (UI)        PPTX final         BDD historisée   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↑                                          ↑
         │                                          │
   Upload CSV/TSV/XLSX                    Référentiels N, N-1, N-2
   Upload PPTX externes                   Templates métiers
                                          Historique études
```

---

## 6. Fichiers livrés dans ce dossier

```
comite-de-direction/
├── README.md                          ← Ce fichier
├── CAHIER_DES_CHARGES.md              ← Spécifications techniques exhaustives
├── ARCHITECTURE.md                    ← Schémas et choix techniques
├── DATA_MODEL.md                      ← Schéma BDD + formats d'import
├── BRAND_GUIDELINES.md                ← Charte visuelle AGL (couleurs, typo, mise en page)
├── ROADMAP.md                         ← Plan de développement séquencé
├── docs/
│   ├── slides_reference.md            ← Description détaillée des 33 slides
│   ├── pptx_injection_spec.md         ← Spec technique injecteur slides externes
│   ├── n1_validation_logic.md         ← Algorithme validation Nouveaux Entrants
│   └── api_endpoints.md               ← Spec API REST
├── examples/
│   ├── input_TIM_2026.csv             ← Exemple format données entrée TIM
│   ├── input_concurrents_TEM.csv      ← Exemple format concurrents TEM
│   ├── input_n1_referentiel.csv       ← Exemple référentiel N-1
│   └── plan_montage_exemple.json      ← Exemple plan de montage PPTX final
└── reference/
    ├── AGL_Etude_Marche_Jan_Mai_2026.pptx  ← PPTX généré v1.0 (référence)
    └── generate_AGL_2026.js                ← Script générateur v1.0
```

---

## 7. Quick start développement

```bash
# 1. Cloner le repo
git clone <repo-url>
cd comite-de-direction

# 2. Installer
npm install
pip install -r requirements.txt   # python-pptx, openpyxl, fuzzywuzzy

# 3. Configurer
cp .env.example .env
# Renseigner SUPABASE_URL, SUPABASE_ANON_KEY, etc.

# 4. Lancer en local
npm run dev
# → http://localhost:3000

# 5. Tester génération PPTX
npm run generate -- --metier=TIM --periode=2026-01:2026-05
```

---

## 8. Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| **Frontend** | Next.js 14 (App Router) + TypeScript | SSR + ergonomie Vercel + déjà familier d'Olivier |
| **UI** | Tailwind CSS + shadcn/ui | Charte AGL custom + composants accessibles |
| **PPTX génération** | pptxgenjs (Node.js) | Déjà utilisé en v1.0, contrôle total mise en page |
| **PPTX injection** | python-pptx + lxml | Seule lib capable de copier XML brut |
| **Bridge Node↔Python** | Subprocess (spawn) ou microservice FastAPI | API Routes Next.js lancent Python via spawn |
| **BDD** | Supabase (Postgres + Storage) | Déjà utilisé pour FripGestion / Babyroad |
| **Auth** | Supabase Auth (Google SSO AGL) | Restriction @aglgroup.com |
| **Hébergement** | Vercel | Stack Olivier connue |
| **Fichiers volumineux** | Supabase Storage | Templates + PPTX externes uploadés |
| **Excel/CSV parsing** | SheetJS (xlsx) + papaparse | Robuste pour formats variés AGL |
| **Matching fuzzy** | Fuse.js (frontend) + RapidFuzz (Python) | Cohérence entre validation et matching CRM/IRIS |

---

## 9. Reprise de contexte (mots-clés)

Pour reprendre le projet rapidement dans une nouvelle session Claude Code :

- **`agl studio go`** → reprise développement plateforme complète
- **`audit pptx go`** → audit visuel du PPTX généré
- **`n1 validation go`** → travail sur validateur Nouveaux Entrants
- **`preconisations go`** → travail sur slides préconisations par métier
- **`injection pptx go`** → travail sur module d'injection slides externes

---

## 10. Contact projet

**Olivier Germanos**
Head of Strategy Division — AGL Côte d'Ivoire
Direction Marketing & RP
Email : olivier.germanos@aglgroup.com (à confirmer)
GitHub : oliviergermanos1-dotcom

**Reporting hiérarchique** : Christian Didier Obrou, Directeur Marketing AGL CI

---

*Document généré le 18 juin 2026. Version 1.0.*

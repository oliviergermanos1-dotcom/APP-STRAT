# CAHIER DES CHARGES — Comité de Direction v2.0

> Spécifications fonctionnelles et techniques exhaustives pour le développement de la plateforme de génération d'études de marché AGL.

**Version document** : 1.0
**Date** : 18 juin 2026
**Auteur** : Olivier Germanos (Head of Strategy, AGL CI)
**Cible** : équipe développement / Claude Code

---

## Table des matières

1. [Objectifs et critères de succès](#1-objectifs-et-critères-de-succès)
2. [Périmètre fonctionnel](#2-périmètre-fonctionnel)
3. [User stories détaillées](#3-user-stories-détaillées)
4. [Architecture technique](#4-architecture-technique)
5. [Spécifications fonctionnelles détaillées](#5-spécifications-fonctionnelles-détaillées)
6. [Modèle de données](#6-modèle-de-données)
7. [Spécifications UI/UX](#7-spécifications-uiux)
8. [Module d'injection PPTX externes](#8-module-dinjection-pptx-externes)
9. [Module Préconisations par métier](#9-module-préconisations-par-métier)
10. [Validation N-1 anti-faux-nouveaux](#10-validation-n-1-anti-faux-nouveaux)
11. [Charte visuelle et reproduction fidèle](#11-charte-visuelle-et-reproduction-fidèle)
12. [Sécurité et accès](#12-sécurité-et-accès)
13. [Tests et critères d'acceptation](#13-tests-et-critères-dacceptation)
14. [Roadmap de développement](#14-roadmap-de-développement)
15. [Annexes](#15-annexes)

---

## 1. Objectifs et critères de succès

### 1.1 Objectif principal

Industrialiser la production des études de marché stratégiques d'AGL Côte d'Ivoire en passant d'un processus manuel de **3 à 5 jours** à un processus automatisé de **moins de 30 minutes** (hors collecte des données sources).

### 1.2 Objectifs secondaires

- **Garantir la cohérence visuelle** sur toutes les éditions (charte AGL respectée à 100%).
- **Éliminer les erreurs de qualification** (notamment les "faux nouveaux entrants" détectés sur N seulement et présents en N-1).
- **Permettre l'enrichissement par modules** (Mining, O&G, AYMAN, DSM, Préconisations) sans toucher au cœur du générateur.
- **Permettre l'injection de slides externes** (Power BI, Excel, autres rapports) pour assembler le livrable final.
- **Historiser les études** pour faciliter les comparaisons inter-périodes.

### 1.3 Critères de succès mesurables

| Critère | Cible | Mesure |
|---------|-------|--------|
| Temps de production étude complète | < 30 min | Chronométrage Olivier sur 3 éditions consécutives |
| Fidélité visuelle vs référence | ≥ 95% | Diff visuel slide par slide vs PPTX référence |
| Faux nouveaux entrants éliminés | 100% | Aucun entrant N déjà présent en N-1 dans livrable final |
| Capacité d'injection slides externes | 100% des PPTX standards | Tests sur exports Power BI + slides Excel |
| Charge cognitive Olivier | Réduction 80% | Comparaison vs workflow actuel |

---

## 2. Périmètre fonctionnel

### 2.1 Modules in-scope v2.0

| Module | Description | Priorité |
|--------|-------------|----------|
| **M1 — Générateur 33 slides** | Reproduction fidèle format Jan–Mai 2026 (existant v1.0, à porter dans plateforme) | P0 |
| **M2 — Injection données** | Upload CSV/TSV/XLSX par métier, parsing, validation | P0 |
| **M3 — Validation N-1** | Croisement automatique référentiels N vs N-1 (existant widget, à intégrer) | P0 |
| **M4 — Injection PPTX externes** | Copie de slides depuis fichiers PPTX uploadés | P0 |
| **M5 — Préconisations par métier** | 5 nouvelles slides (1 par métier) générées depuis Excel | P0 |
| **M6 — Focus Mining & O&G** | Slides 28–29 paramétrables par opérateur | P1 |
| **M7 — Focus AYMAN approfondi** | Slides 30–31 enrichies par segment | P1 |
| **M8 — DSM modifications** | Mise à jour slides 26–27 (armateurs, tramps) | P1 |
| **M9 — Plan de montage configurable** | Réordonnancement des blocs slides | P0 |
| **M10 — Historique études** | Liste, comparaison, archivage des éditions passées | P2 |
| **M11 — Templates personnalisables** | Édition de la charte visuelle (couleurs, fonts) | P2 |
| **M12 — Export multi-format** | Export PPTX + PDF + Word (synthèse texte) | P2 |

### 2.2 Hors-scope v2.0

- Génération automatique de commentaires textuels par IA (slides à compléter manuellement par l'expert).
- Connexion temps réel à STATCOM / IRIS (l'utilisateur exporte en local puis upload).
- Workflow de revue collaborative (commentaires, validation multi-niveaux).
- Mode mobile / responsive (l'outil cible un usage bureau exclusivement).

### 2.3 Métiers couverts

```
TIM   — Transit Import Maritime    (TEU)
TEM   — Transit Export Maritime    (TEU)
HIMP  — Hinterland Import           (TEU)
HEXP  — Hinterland Export           (TEU)
AER   — Aérien Import               (kg)
DSM   — Direction Solutions Maritimes (T-éq, RoRo)
```

Plus 4 focus transversaux : Pétrole, Minier, AYMAN, Préconisations.

---

## 3. User stories détaillées

### 3.1 US-01 — Création d'une nouvelle étude

**En tant qu'** Head of Strategy AGL,
**je veux** initier une nouvelle étude en choisissant la période et les métiers à inclure,
**afin de** démarrer le workflow de production sans configurer un projet entier.

**Critères d'acceptation** :
- Bouton "Nouvelle étude" sur dashboard.
- Modal : titre étude (auto : `AGL_Etude_<Mois>_<Année>`), période (date début / fin), métiers à inclure (checkboxes multiples).
- Création d'un record dans `studies` avec status = `draft`.
- Redirection vers l'éditeur de l'étude.

### 3.2 US-02 — Upload données par métier

**En tant qu'** utilisateur d'Comité de Direction,
**je veux** uploader mes exports STATCOM / IRIS / CRM dans un format CSV ou Excel,
**afin de** alimenter le générateur sans saisie manuelle.

**Critères d'acceptation** :
- Pour chaque métier sélectionné, une carte avec zone de drop file (CSV, XLSX, TSV).
- Détection automatique du séparateur, encoding (UTF-8 + ISO-8859-1).
- Validation du schéma attendu (colonnes obligatoires : `transitaire`, `volume`, `pdm` ou équivalents).
- Affichage des erreurs avec ligne en cause si parsing échoue.
- Aperçu des 10 premières lignes après parsing réussi.
- Sauvegarde dans `study_datasets` avec lien vers fichier source dans Supabase Storage.

### 3.3 US-03 — Validation Nouveaux Entrants N-1

**En tant qu'** utilisateur,
**je veux** que l'application vérifie automatiquement qu'un acteur identifié comme "nouveau" en 2026 était bien absent toute l'année 2025,
**afin de** éviter de présenter au CODIR des faux nouveaux entrants.

**Critères d'acceptation** :
- Pour chaque métier, upload séparé du référentiel N-1 (12 mois complets).
- Bouton "Valider les nouveaux entrants" déclenche le matching fuzzy (seuil 72%).
- Affichage d'un tableau avec verdict par entité : `nouveau` / `marginal` / `existant`.
- Possibilité d'override manuel (cocher / décocher) avec justification.
- Les entités `existant` sont automatiquement exclues du PPTX final.

### 3.4 US-04 — Injection de slides PPTX externes

**En tant qu'** utilisateur,
**je veux** uploader un PPTX externe (export Power BI, slides Excel, autres rapports) et indiquer où l'insérer dans le livrable final,
**afin de** ne pas refaire le travail déjà fait dans d'autres outils.

**Critères d'acceptation** :
- Zone d'upload PPTX externes (multi-fichiers, jusqu'à 10).
- Pour chaque PPTX uploadé : aperçu thumbnails de toutes ses slides.
- Sélection des slides à conserver (checkboxes).
- Drag-and-drop dans le plan de montage pour positionner précisément.
- Copie XML brute préservant 100% de la mise en page d'origine.
- Avertissement automatique si polices non-standard détectées.

### 3.5 US-05 — Plan de montage personnalisé

**En tant qu'** utilisateur,
**je veux** voir l'ordre exact des 33+ slides du livrable final et pouvoir le réorganiser,
**afin de** adapter le livrable à un contexte spécifique (présentation orientée DG vs DSM, etc.).

**Critères d'acceptation** :
- Vue verticale liste de tous les blocs slides avec thumbnails.
- Drag-and-drop pour réordonner.
- Possibilité de désactiver temporairement un bloc (toggle visible/masqué).
- Indicateurs visuels : slide générée (icône ⚙) vs slide injectée (icône 📎) vs slide manuelle (icône ✏).
- Sauvegarde automatique du plan dans `study_montage`.

### 3.6 US-06 — Génération et téléchargement PPTX final

**En tant qu'** utilisateur,
**je veux** déclencher la génération du PPTX final assemblé et le télécharger,
**afin de** finaliser ma livraison au CODIR.

**Critères d'acceptation** :
- Bouton "Générer PPTX" en bas de page (gros CTA bleu navy).
- Loader avec étapes visibles (génération slides natives → injection externes → assemblage final).
- En cas d'erreur : message clair indiquant la slide en cause.
- Téléchargement direct au format `.pptx`.
- Nommage automatique : `AGL_Etude_<Mois>_<Année>_v<N>.pptx`.
- Sauvegarde de la version finale dans `study_versions` (historique).

### 3.7 US-07 — Upload Excel préconisations

**En tant qu'** utilisateur,
**je veux** uploader un fichier Excel contenant les points stratégiques à analyser par métier,
**afin de** générer les slides Préconisations sans saisie manuelle.

**Critères d'acceptation** :
- Zone d'upload dédiée pour fichier Excel "Préconisations".
- Schéma attendu détaillé (voir section 9).
- Parsing et affichage des préconisations par métier.
- Possibilité d'éditer / enrichir avant génération.
- Génération de 5 slides (1 par métier + 1 synthèse globale optionnelle).

### 3.8 US-08 — Historique et comparaison études

**En tant qu'** utilisateur,
**je veux** consulter mes études passées et comparer les évolutions de PDM entre éditions,
**afin de** suivre les tendances sur 12 / 24 mois.

**Critères d'acceptation** :
- Liste des études archivées triée par date.
- Click sur une étude → vue détail (résumé KPIs + accès au PPTX original).
- Bouton "Comparer" → sélection 2 études → tableau diff PDM par métier.
- Export de la comparaison en PPTX 1 slide (à intégrer dans la nouvelle étude).

---

## 4. Architecture technique

### 4.1 Diagramme global

```
                      ┌────────────────────────┐
                      │   Olivier (Browser)     │
                      │   Chrome / Firefox      │
                      └───────────┬────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel — comite-de-direction.vercel.app              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Next.js 14 (App Router + TypeScript)         │  │
│  │                                                        │  │
│  │  Routes UI :                                          │  │
│  │  /                          → Dashboard               │  │
│  │  /studies/new               → Nouvelle étude          │  │
│  │  /studies/[id]/data         → Upload données          │  │
│  │  /studies/[id]/n1           → Validation N-1          │  │
│  │  /studies/[id]/external     → PPTX externes           │  │
│  │  /studies/[id]/montage      → Plan de montage         │  │
│  │  /studies/[id]/preview      → Aperçu slides           │  │
│  │  /studies/[id]/generate     → Génération PPTX         │  │
│  │  /studies/history           → Historique              │  │
│  │                                                        │  │
│  │  API Routes :                                         │  │
│  │  POST /api/studies          → Créer étude             │  │
│  │  POST /api/upload/dataset   → Upload CSV/XLSX         │  │
│  │  POST /api/validate/n1      → Validation N-1          │  │
│  │  POST /api/upload/external  → Upload PPTX externe     │  │
│  │  POST /api/generate         → Génération PPTX final   │  │
│  │  GET  /api/studies/:id      → Récup détails étude     │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌──────────────────────────┴──────────────────────────┐  │
│  │              Serverless Functions                     │  │
│  │                                                       │  │
│  │  Node.js :                                           │  │
│  │  - pptxgenjs (génération slides natives)             │  │
│  │  - papaparse + xlsx (parsing données)                │  │
│  │  - Fuse.js (fuzzy matching frontend)                 │  │
│  │                                                       │  │
│  │  Python (via subprocess ou microservice) :           │  │
│  │  - python-pptx (injection slides externes)           │  │
│  │  - openpyxl (parsing Excel complexes)                │  │
│  │  - rapidfuzz (matching N-1 robuste)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase — siewomjmhnufravrpqem                 │
│                                                              │
│  Database (Postgres + RLS) :                                │
│  - users (authentification @aglgroup.com)                   │
│  - studies (métadonnées études)                             │
│  - study_datasets (données uploadées par métier)            │
│  - study_external_slides (PPTX externes uploadés)           │
│  - study_montage (plans de montage)                         │
│  - study_versions (historique des PPTX générés)             │
│  - n1_referentials (référentiels N-1 historisés)            │
│                                                              │
│  Storage Buckets :                                          │
│  - datasets/ (CSV/XLSX uploadés)                            │
│  - external-pptx/ (PPTX externes injectables)               │
│  - generated/ (PPTX finaux générés)                         │
│  - templates/ (templates métier réutilisables)              │
│                                                              │
│  Auth :                                                     │
│  - Email + password (Olivier en admin)                      │
│  - Google SSO restreint @aglgroup.com (v2.1)                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Stack détaillée

#### Frontend
- **Next.js 14** (App Router, Server Components)
- **TypeScript** strict mode
- **Tailwind CSS** 3.4+
- **shadcn/ui** (composants : Card, Dialog, Table, Toast, Tabs, Select, Button)
- **lucide-react** (icônes)
- **react-dropzone** (upload fichiers)
- **react-beautiful-dnd** ou **@dnd-kit** (drag-and-drop plan de montage)
- **recharts** (graphiques aperçu KPIs)
- **zustand** (state management léger, déjà utilisé sur projets Olivier)

#### Backend (API Routes Next.js)
- **pptxgenjs** 3.12+ (génération slides natives)
- **xlsx** (SheetJS) — parsing Excel
- **papaparse** — parsing CSV
- **Fuse.js** — fuzzy matching côté Node
- **@supabase/supabase-js** — client Supabase
- **multer** ou équivalent Next.js — gestion uploads

#### Backend Python (microservice ou subprocess)
- **python-pptx** 0.6.21+ (injection slides externes)
- **openpyxl** (parsing Excel avancé)
- **rapidfuzz** (matching fuzzy haute performance)
- **lxml** (manipulation XML brute pour copy XML inter-PPTX)
- **fastapi** (si microservice séparé)

**Choix architectural** : démarrer avec subprocess Node→Python pour éviter un second déploiement. Migrer vers microservice FastAPI sur Render ou Railway si problèmes de cold start ou de timeout (> 10s sur Vercel Free).

#### BDD et Storage
- **Supabase** (Postgres 15 + Storage S3-compatible)
- Project existant : `siewomjmhnufravrpqem` (cohérent avec FripGestion, Babyroad)
- Row Level Security (RLS) activée sur toutes les tables sensibles
- Buckets Storage avec policies : `auth.uid()` = `owner`

#### Hébergement
- **Vercel** (Pro plan recommandé pour timeouts > 10s sur génération PPTX)
- Domaine custom : `comite-de-direction.aglgroup.com` (si DNS accessible) sinon `comite-de-direction.vercel.app`

---

## 5. Spécifications fonctionnelles détaillées

### 5.1 Module M1 — Générateur 33 slides

#### 5.1.1 Reproduction fidèle du format référence

Le générateur doit reproduire **slide par slide** le format de l'étude `AGL_Etude_Marche_Jan_Mai_2026_Enrichie__2_.pptx` (référence). Voir `docs/slides_reference.md` pour la description détaillée slide par slide.

#### 5.1.2 Structure des 33 slides

| # | Type | Métier | Contenu principal |
|---|------|--------|-------------------|
| 1 | Cover | — | Revue Stratégique & Marketing, Reporting 2026 |
| 2 | Sommaire | — | 6 cartes métiers numérotées 01–06 |
| 3 | Séparateur | TIM | "01 TRANSIT IMPORT MARITIME (TIM)" |
| 4 | Vue d'ensemble | TIM | 5 KPI cards + graphe barres groupées + barres PDM mensuelles |
| 5 | Concurrents & segments | TIM | Tableau 10 transitaires + barres PDM par segment |
| 6 | Clientèle | TIM | Top 10 destinataires + pie mix marchandises |
| 7 | Nouveaux entrants | TIM | Tableau nouveaux transitaires + nouveaux destinataires + barres nouvelles marchandises |
| 8 | Séparateur | TEM | "02 TRANSIT EXPORT MARITIME (TEM)" |
| 9 | Vue d'ensemble | TEM | Idem TIM |
| 10 | Segments & concurrents | TEM | Barres PDM filières + tableau 10 concurrents |
| 11 | Clientèle chargeurs | TEM | Top 10 chargeurs + donut filières |
| 12 | Nouveaux chargeurs | TEM | Nouveaux chargeurs + portefeuille existant + nouvelles filières |
| 13 | Séparateur | HIMP | "03 HINTERLAND IMPORT MARITIME" |
| 14 | Vue d'ensemble | HIMP | 5 KPI + graphe + barres PDM mensuelles + destinations Bamako/Ouaga |
| 15 | Concurrents & segments | HIMP | Tableau 10 transitaires + barres PDM marchandises |
| 16 | Nouveaux entrants | HIMP | Double tableau + alertes CEVA |
| 17 | Séparateur | HEXP | "04 HINTERLAND EXPORT MARITIME" |
| 18 | Vue d'ensemble | HEXP | 5 KPI + graphe + barres PDM mensuelles + concurrents + chargeurs |
| 19 | Nouveaux chargeurs | HEXP | Nouveaux chargeurs + portefeuille à sécuriser + alerte CEVA |
| 20 | Séparateur | AER | "05 AÉRIEN IMPORT" |
| 21 | Vue d'ensemble | AER | 5 KPI (2025 vs 2026) + graphe comparatif + barres PDM mensuelles |
| 22 | Segments & concurrents | AER | Tableau évolution 2025→2026 + tableau 10 concurrents |
| 23 | Clientèle | AER | Top 10 destinataires + pie mix produits |
| 24 | Nouveaux entrants | AER | Nouveaux transitaires + marchandises en croissance + opportunités |
| 25 | Séparateur | DSM | "DSM DIRECTION DES SOLUTIONS MARITIMES" |
| 26 | DSM Armateurs | DSM | Tableau armateurs lignes régulières + couverture AGL |
| 27 | DSM Tramps | DSM | Tableau manutentionnaires + PDM par type cargaison |
| 28 | Focus Pétrole | Pétrole | Tableau opérateurs + position AGL par opérateur |
| 29 | Focus Minier | Minier | Tableau opérateurs miniers + PDM AGL Matériels Miniers par métier |
| 30 | Focus AYMAN synthèse | AYMAN | Tableau 6 métiers Ayman vs AGL |
| 31 | Focus AYMAN analyse | AYMAN | Profil Ayman + face-à-face par segment + réponse AGL |
| 32 | Séparateur | — | "06 ACTIONS STRATÉGIQUES PRIORITAIRES" |
| 33 | Synthèse finale | — | Barres horizontales PDM par métier + badges statut |

#### 5.1.3 Slides à AJOUTER en v2.0

| # | Type | Métier | Contenu |
|---|------|--------|---------|
| Nx | Préconisations TIM | TIM | Vision marché 12/24 mois + positionnement AGL recommandé + segments cibles |
| Nx | Préconisations TEM | TEM | Idem TIM |
| Nx | Préconisations HIMP | HIMP | Idem |
| Nx | Préconisations HEXP | HEXP | Idem |
| Nx | Préconisations AER | AER | Idem |

Position dans le plan de montage : à définir par l'utilisateur (recommandation : juste avant le séparateur "06 Actions stratégiques").

#### 5.1.4 Charte visuelle stricte

Voir `BRAND_GUIDELINES.md` pour les détails. Synthèse :

| Couleur | Hex | Usage |
|---------|-----|-------|
| Navy AGL | `#0D2243` | Header bands, séparateurs, fonds cover |
| Doré AGL | `#C9A84C` | Soulignements, lignes décoratives, accent |
| Vert | `#1A7C4F` | KPIs positifs, indicateurs verts |
| Orange | `#E05A00` | Alertes modérées, statuts intermédiaires |
| Bleu KPI | `#2563A8` | Données neutres importantes |
| Rouge | `#CC2200` | Alertes critiques, recul de marché |
| Teal | `#0E7490` | Variantes pour segments multiples |
| Gris clair | `#F0F2F5` | Fond cartes KPI |

**Typographie** : Calibri exclusivement (titre 22pt bold, sous-titre 12pt italic doré, corps 9–11pt).

### 5.2 Module M2 — Injection données

#### 5.2.1 Formats supportés

- **CSV** (séparateur `,` ou `;` ou `\t` auto-détecté)
- **XLSX** (Excel 2007+)
- **TSV** (alternative manuelle, copier-coller Excel)
- Encoding : UTF-8 (priorité) + ISO-8859-1 (fallback Excel Windows)

#### 5.2.2 Schémas attendus par type de données

**Classement concurrents (par métier)** :
```csv
rang,transitaire,volume,pdm
1,AFRICA GLOBAL LOGISTICS,15133,7.8
2,STRACOTRANS CI,14575,7.5
...
```

**Top clients (destinataires ou chargeurs)** :
```csv
client,volume,segment,pct_vol_agl
K1 MINING SA CI,1531,Matériels Miniers,10.1
SITAB CI,876,Cigares/Cigarettes,5.8
...
```

**Segments / marchandises** :
```csv
segment,volume_marche,pdm_agl
Matériels Miniers,2231,74
Médicaments,1936,50
...
```

**Mensuel** (KPIs par mois) :
```csv
mois,volume_marche,volume_agl,pdm_agl
Janvier,41800,3470,8.3
Février,36800,2544,6.9
...
```

**Référentiel N-1** :
```csv
nom_entite,metier,volume_annuel_n1
STRACOTRANS CI,TIM,32410
TGR,TIM,30200
...
```

#### 5.2.3 Validation et erreurs

- Détection automatique du type de fichier (basée sur les colonnes présentes).
- Affichage du nombre de lignes valides / lignes en erreur.
- Mise en évidence des erreurs (ligne + colonne en cause).
- Possibilité de corriger directement dans l'UI (édition cellule) avant de poursuivre.
- Sauvegarde du fichier source dans Supabase Storage pour traçabilité.

### 5.3 Module M3 — Validation N-1

Voir `docs/n1_validation_logic.md` pour l'algorithme complet. Synthèse :

#### 5.3.1 Algorithme

```
Pour chaque entité E dans le candidat N (entrants présumés) :
    Pour chaque entité R dans le référentiel N-1 :
        score = similarity(E.nom, R.nom)
        si score > meilleur_score :
            meilleur_score = score
            meilleur_match = R

    si meilleur_score < SEUIL (0.72) :
        verdict(E) = "nouveau"
    sinon si meilleur_match.volume_n1 == 0 :
        verdict(E) = "nouveau"
    sinon si meilleur_match.volume_n1 < (E.volume_n × 0.3) :
        verdict(E) = "marginal"
    sinon :
        verdict(E) = "existant"
```

Pour les **marchandises** uniquement, règle additionnelle : si présent en N-1 mais croissance ≥ +30%, verdict = `nouveau` (montée en puissance).

#### 5.3.2 Fonction de similarité

Normalisation préalable :
1. Suppression accents (NFD + filter diacritiques)
2. Lowercase
3. Remplacement caractères non-alphanumériques par espace
4. Collapse espaces multiples

Calcul similarité :
- Si chaînes identiques après normalisation → score = 1.0
- Si l'une contient l'autre → score = 0.85
- Sinon : Jaccard sur tokens ≥ 3 caractères

### 5.4 Module M4 — Injection PPTX externes

Voir `docs/pptx_injection_spec.md` pour détails techniques. Synthèse :

#### 5.4.1 Workflow utilisateur

1. Utilisateur upload 1 à N fichiers PPTX externes.
2. L'application génère des thumbnails de toutes les slides.
3. Utilisateur sélectionne les slides à conserver (checkboxes).
4. Utilisateur drag-and-drop ces slides dans le plan de montage final.
5. Au moment de la génération, le script Python copie XML brut depuis le PPTX source vers le PPTX final.

#### 5.4.2 Implémentation technique

- **python-pptx** + **lxml** pour copy XML brute (préservation 100% mise en page).
- **LibreOffice headless** pour génération thumbnails (`soffice --headless --convert-to png`).
- Détection automatique des polices non-standard avec avertissement.

#### 5.4.3 Limitations connues

- Les polices custom non-installées sur le poste qui ouvre le PPTX final seront substituées.
- Les images embarquées sont conservées mais peuvent augmenter la taille du fichier final.
- Les liens hypertext, animations et transitions sont préservés.

---

## 6. Modèle de données

Voir `DATA_MODEL.md` pour le schéma complet. Synthèse des tables :

### 6.1 Tables Supabase

```sql
-- Utilisateurs
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'analyst', -- analyst, admin
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Études
CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metiers TEXT[] NOT NULL, -- ['TIM','TEM','HIMP','HEXP','AER','DSM']
    status TEXT DEFAULT 'draft', -- draft, generating, completed, archived
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datasets uploadés par étude / métier / type
CREATE TABLE study_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    dataset_type TEXT NOT NULL, -- 'concurrents', 'clients', 'segments', 'mensuel', 'nouveaux'
    storage_path TEXT NOT NULL, -- chemin dans bucket Supabase
    parsed_data JSONB NOT NULL, -- données parsées
    row_count INTEGER,
    validation_status TEXT, -- 'valid', 'warnings', 'errors'
    validation_messages JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Référentiels N-1
CREATE TABLE n1_referentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    year INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    parsed_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Slides externes uploadées
CREATE TABLE study_external_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL, -- PPTX source
    original_filename TEXT,
    slides_metadata JSONB NOT NULL, -- [{index, title, thumbnail_url}, ...]
    selected_slides INTEGER[], -- indices des slides à inclure
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan de montage
CREATE TABLE study_montage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE UNIQUE,
    blocks JSONB NOT NULL, -- ordre des blocs (cover, sommaire, sep_TIM, slides_TIM[], etc.)
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Versions générées (historique)
CREATE TABLE study_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    storage_path TEXT NOT NULL, -- PPTX généré
    slide_count INTEGER,
    file_size_bytes BIGINT,
    generation_log JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Préconisations
CREATE TABLE study_preconisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    vision_marche TEXT,
    positionnement_agl TEXT,
    segments_cibles JSONB,
    risques_surveillance JSONB,
    horizon TEXT, -- '12_mois', '24_mois'
    source_excel_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 Buckets Storage

```
datasets/              ← Fichiers CSV/XLSX uploadés par les utilisateurs
  /{study_id}/{metier}/{dataset_type}-{timestamp}.csv

external-pptx/         ← PPTX externes à injecter
  /{study_id}/{filename}-{timestamp}.pptx

external-thumbnails/   ← Thumbnails générés pour preview
  /{study_id}/{pptx_id}/slide-{N}.png

generated/             ← PPTX finaux générés
  /{study_id}/v{version}-{timestamp}.pptx

templates/             ← Templates métier réutilisables (futur)
  /metier-{TIM,TEM,...}/template.json
```

### 6.3 RLS Policies (sécurité)

```sql
-- Une étude n'est lisible/modifiable que par son créateur
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own studies" ON studies
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can modify own studies" ON studies
    FOR ALL USING (auth.uid() = user_id);

-- Même pattern pour les tables dépendantes
ALTER TABLE study_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own datasets" ON study_datasets
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );
```

---

## 7. Spécifications UI/UX

### 7.1 Layout global

```
┌────────────────────────────────────────────────────────────┐
│  [LOGO AGL]   Comité de Direction                  [Avatar] Olivier │
├────────────────────────────────────────────────────────────┤
│ ┌──────────┐                                                │
│ │ Sidebar  │  Main content area                            │
│ │          │                                                │
│ │ Études   │                                                │
│ │ Nouvelle │                                                │
│ │ Historiq │                                                │
│ │ Paramèt. │                                                │
│ │          │                                                │
│ │ [Logout] │                                                │
│ └──────────┘                                                │
└────────────────────────────────────────────────────────────┘
```

- **Sidebar** fixée à gauche, largeur 240px, fond `#0D2243` (navy AGL), texte blanc.
- **Header** : logo AGL doré + nom utilisateur connecté + menu déroulant déconnexion.
- **Main** : fond `#F9FAFB` (gris très clair), max-width 1280px.

### 7.2 Éditeur d'étude — workflow tabs

```
┌────────────────────────────────────────────────────────────┐
│  AGL Etude Jan-Mai 2026                          [Status]  │
├────────────────────────────────────────────────────────────┤
│ ① Données  ② Validation N-1  ③ Externes  ④ Montage  ⑤ Gen │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  Contenu du tab actif                                        │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

- 5 tabs horizontaux représentant les étapes.
- Tab actif souligné en doré (`#C9A84C`).
- Tab non-complété avec point gris ; tab complété avec coche verte.

### 7.3 Composants clés

#### 7.3.1 Card métier (tab Données)

```
┌────────────────────────────────────────┐
│ ● TIM — Transit Import Maritime    [↓] │
├────────────────────────────────────────┤
│  Concurrents  ✓  10 lignes             │
│  Clients      ✓  10 lignes             │
│  Segments     ✓  11 lignes             │
│  Mensuel      ✓  5 lignes              │
│  Nouveaux     ✓  5 lignes              │
│  Référentiel N-1 ✓  142 lignes          │
└────────────────────────────────────────┘
```

- Pastille colorée par métier (couleur unique par métier).
- Toggle déroulement pour voir détail.
- Statut visuel par dataset (uploaded / parsed / error).

#### 7.3.2 Plan de montage (tab Montage)

```
Drag-and-drop liste verticale :

┌────────────────────────────────────────┐
│ ⋮⋮  [thumbnail]  Cover            ⚙ ✏ │
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  Sommaire         ⚙ ✏ │
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  Séparateur TIM   ⚙ ✏ │
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  TIM Vue d'ens.   ⚙ ✏ │
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  Analyse Power BI 📎 ✏│ ← injectée
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  TIM Concurrents  ⚙ ✏ │
├────────────────────────────────────────┤
│ ⋮⋮  [thumbnail]  Préconisation TIM ✏  │ ← saisie manuelle
└────────────────────────────────────────┘
```

- ⋮⋮ : handle drag-and-drop
- ⚙ : icône slide générée
- 📎 : icône slide injectée
- ✏ : édition manuelle texte

#### 7.3.3 CTA Génération

Gros bouton bleu navy en bas de page : `Générer PPTX final` avec icône ⚡ et compteur dynamique des slides.

---

## 8. Module d'injection PPTX externes

### 8.1 Cas d'usage

Olivier exporte régulièrement des slides depuis :
- **Power BI** (`codir_V1.pbix` → export PPTX d'une page de rapport)
- **Excel** (slides analyses STATCOM exportées via "Save as PPT")
- **Autres présentations** (slides de rapports précédents à recycler)

L'application doit permettre de **copier ces slides telles quelles** dans le PPTX final, sans re-rendu, en préservant 100% de la mise en page.

### 8.2 Implémentation Python

```python
# pseudocode
from pptx import Presentation
from pptx.util import Inches
from copy import deepcopy
from lxml import etree

def inject_slides_from_external(
    final_pptx_path: str,
    external_pptx_path: str,
    slide_indices: list[int],
    insert_position: int
) -> None:
    """
    Copie les slides désignées depuis external_pptx_path
    et les insère dans final_pptx_path à la position spécifiée.
    Préserve XML brut, images, polices, animations.
    """
    final = Presentation(final_pptx_path)
    external = Presentation(external_pptx_path)

    for i, src_idx in enumerate(slide_indices):
        src_slide = external.slides[src_idx]

        # Créer nouvelle slide dans destination avec layout blank
        blank_layout = final.slide_layouts[6]  # ou index 0
        new_slide = final.slides.add_slide(blank_layout)

        # Copier tous les shapes XML brut
        new_slide.shapes._spTree.clear()
        for elem in src_slide.shapes._spTree:
            new_slide.shapes._spTree.append(deepcopy(elem))

        # TODO : copier le background si défini
        # TODO : copier les media (images embarquées)
        # TODO : réordonner pour respecter insert_position

    final.save(final_pptx_path)
```

### 8.3 Génération thumbnails

Pour permettre à l'utilisateur de prévisualiser les slides à injecter :

```bash
soffice --headless --convert-to pdf input.pptx
pdftoppm -png -r 100 input.pdf slide
# → slide-1.png, slide-2.png, ...
```

Upload des thumbnails dans Supabase Storage bucket `external-thumbnails/`.

### 8.4 Détection polices non-standard

```python
def detect_custom_fonts(pptx_path: str) -> list[str]:
    """Retourne la liste des polices utilisées non incluses dans le 'safe set'."""
    SAFE_FONTS = {'Calibri', 'Arial', 'Cambria', 'Times New Roman',
                  'Courier New', 'Verdana', 'Tahoma'}
    prs = Presentation(pptx_path)
    used_fonts = set()
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        if run.font.name:
                            used_fonts.add(run.font.name)
    return list(used_fonts - SAFE_FONTS)
```

Si polices custom détectées, afficher un warning à l'utilisateur :
> Les polices `<liste>` ne sont pas dans le set safe. Le PPTX final s'affichera correctement uniquement sur les postes où elles sont installées.

---

## 9. Module Préconisations par métier

### 9.1 Source de données

L'utilisateur uploade un fichier Excel avec une feuille par métier (TIM, TEM, HIMP, HEXP, AER) au format :

| Colonne | Type | Description |
|---------|------|-------------|
| `axe` | string | Catégorie : "Vision Marché", "Positionnement AGL", "Segments Cibles", "Risques" |
| `horizon` | string | "12 mois" ou "24 mois" |
| `point_cible` | string | Énoncé du point à analyser |
| `donnee_quantitative` | string | Métrique chiffrée si disponible (ex: "+860 TEU/an cible Cajou") |
| `priorite` | string | "Haute", "Moyenne", "Basse" |
| `commentaire_expert` | string | Note libre d'Olivier |

### 9.2 Structure de la slide générée

```
┌─────────────────────────────────────────────────────────────┐
│ [HEADER NAVY]                                                │
│ TIM — PRÉCONISATIONS STRATÉGIQUES                            │
│ Vision marché 12 mois | Positionnement AGL | Cibles & Risques│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────────────────┐ ┌─────────────────────────────┐│
│ │ VISION MARCHÉ 12 MOIS    │ │ POSITIONNEMENT AGL          ││
│ │                          │ │                              ││
│ │ • Point cible 1          │ │ • Stratégie 1                ││
│ │   → métrique             │ │   → action concrète          ││
│ │ • Point cible 2          │ │ • Stratégie 2                ││
│ │   → métrique             │ │   → action concrète          ││
│ │                          │ │                              ││
│ └─────────────────────────┘ └─────────────────────────────┘│
│                                                              │
│ ┌─────────────────────────┐ ┌─────────────────────────────┐│
│ │ SEGMENTS CIBLES          │ │ RISQUES À SURVEILLER         ││
│ │                          │ │                              ││
│ │ ▲ Segment 1 — Priorité H │ │ ⚠ Risque 1 — Impact élevé    ││
│ │ ▲ Segment 2 — Priorité M │ │ ⚠ Risque 2 — Concurrent      ││
│ │                          │ │                              ││
│ └─────────────────────────┘ └─────────────────────────────┘│
│                                                              │
│ [INSIGHT BOX dorée] Synthèse expert AGL : ...               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Logique de génération

```javascript
function generatePreconisationSlide(metier, preconisations) {
  const slide = pptx.addSlide();

  addHeader(slide, `${metier} — PRÉCONISATIONS STRATÉGIQUES`,
    `Vision marché ${preconisations.horizon} | Positionnement AGL | Cibles & Risques`);

  // Quadrant supérieur gauche : Vision marché
  addQuadrant(slide, 0.4, 1.2, 6.2, 2.8,
    'VISION MARCHÉ',
    preconisations.filter(p => p.axe === 'Vision Marché'),
    'NAVY'
  );

  // Quadrant supérieur droit : Positionnement
  addQuadrant(slide, 6.8, 1.2, 6.2, 2.8,
    'POSITIONNEMENT AGL',
    preconisations.filter(p => p.axe === 'Positionnement AGL'),
    'GREEN'
  );

  // Quadrant inférieur gauche : Segments cibles
  addQuadrant(slide, 0.4, 4.1, 6.2, 2.2,
    'SEGMENTS CIBLES',
    preconisations.filter(p => p.axe === 'Segments Cibles'),
    'BLUE2'
  );

  // Quadrant inférieur droit : Risques
  addQuadrant(slide, 6.8, 4.1, 6.2, 2.2,
    'RISQUES À SURVEILLER',
    preconisations.filter(p => p.axe === 'Risques'),
    'RED'
  );

  // Insight box bas
  addInsightBox(slide, 0.4, 6.5, 12.5, 0.6, '💡',
    [preconisations.find(p => p.axe === 'Synthèse')?.commentaire_expert || '']);

  addFooter(slide, `Africa Global Logistics — Préconisations ${metier} | p.X`);
}
```

---

## 10. Validation N-1 anti-faux-nouveaux

### 10.1 Algorithme complet

Voir section 5.3 et `docs/n1_validation_logic.md`.

### 10.2 Cas particuliers à gérer

1. **Synonymes / variantes orthographiques** : `CEVA LOGISTICS CI`, `CEVA CI`, `CEVA Côte d'Ivoire` doivent matcher.
2. **Acronymes vs noms complets** : `TGR` vs `TRANSIT GENERAL RAPIDE` — utiliser une table de correspondance manuelle ajoutée par l'utilisateur (`aliases`).
3. **Fusions / changements de raison sociale** : permettre à l'utilisateur de définir manuellement une équivalence (`old_name` → `new_name`).
4. **Caractères spéciaux** : `'`, `&`, `-`, accents — tous normalisés.

### 10.3 Table aliases utilisateur

```sql
CREATE TABLE n1_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    metier TEXT,
    name_n TEXT NOT NULL,        -- nom utilisé en N
    name_n_minus_1 TEXT NOT NULL, -- nom équivalent en N-1
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

L'algorithme consulte cette table avant le matching fuzzy. Si une équivalence est trouvée, score = 1.0 forcé.

---

## 11. Charte visuelle et reproduction fidèle

Voir `BRAND_GUIDELINES.md` pour le détail complet. Points clés :

### 11.1 Règle d'or — fidélité absolue

**Aucune slide générée ne doit s'écarter du modèle de référence.** Toute modification de couleur, police, taille ou layout doit être validée par Olivier avant déploiement.

### 11.2 Format slide

- Layout : `LAYOUT_WIDE` (33.867 × 19.05 cm = 13.33 × 7.5 inches).
- Marges : 0.4" gauche/droite, 0.2" haut/bas.
- Header bandeau navy : hauteur 1.1", couvre toute la largeur.
- Pied de page : "Africa Global Logistics – Étude de Marché Jan–Mai 2026 | p.X" à gauche, logo AGL doré à droite.

### 11.3 Composants standardisés

| Composant | Spécifications |
|-----------|----------------|
| Header | Bandeau navy 1.1", titre 22pt bold blanc Calibri, sous-titre 12pt italic doré |
| KPI Card | Fond `#F0F2F5`, bordure `#D1D5DB` 0.5pt, padding interne 0.1", titre 8pt majuscules gris, valeur 22-26pt bold |
| Tableau | Header navy fond blanc, alternance lignes blanc/`#F8F9FA`, AGL surligné fond `#FFF9EC` |
| Insight Box | Fond `#FFFBEC`, bordure `#E5C97A`, emoji + texte 9pt |
| Barre PDM | Fond gris `#E5E7EB`, barre couleur dynamique (vert ≥ seuil, orange < seuil), label valeur à droite |
| Pie/Donut | Couleurs ramp AGL (navy, doré, vert, orange, bleu, teal, rouge, gris) |

---

## 12. Sécurité et accès

### 12.1 Authentification

- **v2.0** : Supabase Auth email + password, comptes créés manuellement par Olivier (admin).
- **v2.1** (futur) : Google SSO restreint au domaine `@aglgroup.com`.

### 12.2 Autorisation

- 1 utilisateur peut voir / modifier uniquement ses propres études (RLS strict).
- Admin (Olivier) peut voir toutes les études (policy étendue).

### 12.3 Données sensibles

- Aucune donnée sensible (volumes clients, PDM concurrents) ne doit transiter en clair hors Supabase.
- Fichiers uploadés (CSV, XLSX, PPTX) stockés dans buckets privés avec policies.
- URLs de téléchargement signées avec expiration 1h.

### 12.4 Conformité

- Pas de PII (Personal Identifiable Information) — uniquement noms d'entreprises et volumes business.
- Hébergement Vercel (USA / Europe) et Supabase (Europe par défaut) acceptable pour usage interne AGL.
- À évaluer : conformité RGPD si données futures incluent contacts nominatifs (futur module CRM).

---

## 13. Tests et critères d'acceptation

### 13.1 Tests fonctionnels

**TEST-01** : Création étude vide
- Cliquer "Nouvelle étude"
- Remplir titre, période, métiers
- Vérifier création record `studies` en BDD
- Vérifier redirection vers éditeur

**TEST-02** : Upload CSV concurrents TIM
- Uploader fichier exemple `input_concurrents_TIM.csv`
- Vérifier parsing correct (10 lignes attendues)
- Vérifier statut "validé" affiché
- Vérifier données accessibles dans tab suivant

**TEST-03** : Validation N-1
- Uploader référentiel N-1 TIM
- Uploader candidats nouveaux entrants TIM
- Cliquer "Valider"
- Vérifier verdict correct sur 5 entités test (3 nouveaux, 1 marginal, 1 existant)

**TEST-04** : Injection PPTX externe
- Uploader un PPTX externe (3 slides test)
- Vérifier génération thumbnails
- Sélectionner slide #2
- Vérifier ajout dans plan de montage

**TEST-05** : Génération PPTX final
- Compléter tous les tabs d'une étude test
- Cliquer "Générer PPTX final"
- Vérifier fichier téléchargé non corrompu
- Ouvrir dans PowerPoint et vérifier 33+ slides présentes
- Vérifier mise en page conforme

### 13.2 Tests visuels

- **Comparaison pixel-à-pixel** des slides générées vs slides de référence (script automatisé via LibreOffice → PNG → diff).
- **Tolérance** : 5% de pixels différents acceptable (rendu LibreOffice vs PowerPoint).

### 13.3 Tests de performance

- Génération PPTX < 30s pour étude complète (33 slides) sur Vercel Pro.
- Upload + parsing CSV de 1000 lignes < 5s.
- Affichage thumbnails PPTX externe (10 slides) < 10s.

### 13.4 Tests de régression

À chaque release :
- Lancer la suite de tests sur l'étude de référence (Jan–Mai 2026).
- Comparer le PPTX généré à la version v1.0 archivée.
- Tout écart visuel > 5% bloque le déploiement.

---

## 14. Roadmap de développement

Voir `ROADMAP.md` pour le détail séquencé. Synthèse :

### Phase 1 — MVP fonctionnel (2 semaines)

- [ ] Initialiser projet Next.js + Supabase
- [ ] Migrer générateur v1.0 (`generate_AGL_2026.js`) en API Route
- [ ] Implémenter upload datasets (CSV/XLSX) par métier
- [ ] Implémenter génération PPTX 33 slides depuis BDD
- [ ] UI minimale : dashboard + éditeur étude (tabs)

### Phase 2 — Modules essentiels (2 semaines)

- [ ] Validation N-1 (port du widget existant en module)
- [ ] Injection PPTX externes (microservice Python)
- [ ] Plan de montage drag-and-drop
- [ ] Slides Préconisations par métier (depuis Excel)

### Phase 3 — Enrichissements (1 semaine)

- [ ] Focus Mining & O&G paramétrables
- [ ] Focus AYMAN approfondi
- [ ] DSM modifications
- [ ] Historique études + comparaison

### Phase 4 — Polish & déploiement (1 semaine)

- [ ] Tests visuels automatisés
- [ ] Documentation utilisateur
- [ ] Déploiement production Vercel
- [ ] Formation Olivier (1 session 2h)

**Durée totale estimée** : 6 semaines (1 dev full-time avec Claude Code).

---

## 15. Annexes

### 15.1 Glossaire métier

| Terme | Définition |
|-------|------------|
| **TEU** | Twenty-foot Equivalent Unit — unité standard de mesure des conteneurs maritimes |
| **PDM** | Part de Marché — pourcentage de volume capté par AGL sur le marché qualifié |
| **B/L** | Bill of Lading — connaissement maritime, document de transport |
| **Hinterland** | Arrière-pays — pays enclavés desservis depuis Abidjan (Mali, Burkina, Niger) |
| **CODIR** | Comité de Direction AGL |
| **STATCOM** | Base de données opérationnelle interne AGL |
| **IRIS** | Système de facturation AGL |
| **RUBRIKS** | Base données complémentaire DSM |
| **Tramps** | Navires non-réguliers (par opposition aux lignes régulières) |
| **BRBK** | Break Bulk — cargaisons hors-gabarit non conteneurisées |
| **RoRo** | Roll-on / Roll-off — navires pour véhicules |
| **Non Apuré** | Transitaires avec dossiers douaniers non clôturés (exclus du périmètre qualifié) |

### 15.2 Mots-clés de reprise Claude Code

- `agl studio go` → reprise développement plateforme complète
- `audit pptx go` → audit visuel du PPTX généré
- `n1 validation go` → travail sur validateur Nouveaux Entrants
- `preconisations go` → travail sur slides préconisations par métier
- `injection pptx go` → travail sur module d'injection slides externes
- `mining og go` → paramétrage Focus Mining & O&G
- `ayman go` → approfondissement Focus AYMAN
- `dsm go` → modifications DSM

### 15.3 Références externes

- Documentation `pptxgenjs` : https://gitbrent.github.io/PptxGenJS/
- Documentation `python-pptx` : https://python-pptx.readthedocs.io/
- Documentation Supabase : https://supabase.com/docs
- Charte AGL : voir `BRAND_GUIDELINES.md`

### 15.4 Contacts techniques

- **Olivier Germanos** — Product Owner & Tech Lead
- **GitHub** : oliviergermanos1-dotcom
- **Supabase Project** : siewomjmhnufravrpqem
- **Hébergement** : Vercel (compte personnel Olivier)

---

*Document v1.0 — 18 juin 2026*
*À jour avec la version v1.0 du générateur livrée*

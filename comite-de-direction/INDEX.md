# INDEX — Dossier Comité de Direction

> Structure complète du dossier livré pour démarrer le développement sur Claude Code.

## Arborescence

```
comite-de-direction/
│
├── CLAUDE.md                              ← Instructions Claude Code (lu auto)
├── README.md                              ← Vue projet & quick start
├── CAHIER_DES_CHARGES.md                  ← Spec exhaustive (15 sections, ~50 pages)
├── ARCHITECTURE.md                        ← Stack technique & infra
├── DATA_MODEL.md                          ← Schéma BDD complet SQL prêt à exécuter
├── BRAND_GUIDELINES.md                    ← Charte visuelle AGL exhaustive
├── ROADMAP.md                             ← Plan dev 6 semaines détaillé
│
├── docs/
│   ├── slides_reference.md                ← Description des 33 slides + 5 nouvelles
│   ├── pptx_injection_spec.md             ← Spec module injection PPTX externes
│   ├── n1_validation_logic.md             ← Algorithme validation Nouveaux Entrants
│   └── api_endpoints.md                   ← Spec API REST complète
│
├── examples/
│   ├── input_concurrents_TIM.csv          ← Exemple CSV concurrents
│   ├── input_clients_TIM.csv              ← Exemple CSV clients
│   ├── input_n1_referentiel_TIM.csv       ← Exemple référentiel N-1
│   ├── plan_montage_exemple.json          ← Plan de montage exemple
│   └── preconisations_template_README.md  ← Spec format Excel préconisations
│
└── reference/
    ├── AGL_Etude_Marche_Jan_Mai_2026.pptx ← PPTX v1.0 généré (référence visuelle)
    └── generate_AGL_2026.js                ← Script générateur v1.0 (~1454 lignes)
```

## Volume documentaire

| Document | Taille | Description |
|----------|--------|-------------|
| README.md | 11 KB | Vue d'ensemble |
| CAHIER_DES_CHARGES.md | 53 KB | Spec exhaustive |
| ARCHITECTURE.md | 13 KB | Choix techniques |
| DATA_MODEL.md | 18 KB | Schéma SQL |
| BRAND_GUIDELINES.md | 13 KB | Charte visuelle |
| ROADMAP.md | 11 KB | Plan 6 semaines |
| docs/slides_reference.md | 15 KB | 33 slides détaillées |
| docs/pptx_injection_spec.md | 14 KB | Injection technique |
| docs/n1_validation_logic.md | 13 KB | Algorithme N-1 |
| docs/api_endpoints.md | 15 KB | API REST |
| examples/*.csv + json + md | 6 KB | Exemples données |
| reference/*.pptx + .js | 1.7 MB | v1.0 fonctionnelle |

**Total documentation** : ~190 KB de Markdown + 1.7 MB de références.

## Ordre de lecture recommandé

### Première session (1 heure)
1. README.md (15 min)
2. CAHIER_DES_CHARGES.md sections 1-5 (30 min)
3. ROADMAP.md (15 min)

### Avant de coder (1 heure)
4. ARCHITECTURE.md
5. DATA_MODEL.md
6. BRAND_GUIDELINES.md (skimming)

### Au besoin par module
- Travail sur génération PPTX → `docs/slides_reference.md` + `reference/generate_AGL_2026.js`
- Travail sur N-1 → `docs/n1_validation_logic.md`
- Travail sur injection PPTX → `docs/pptx_injection_spec.md`
- Travail sur API → `docs/api_endpoints.md`

## Comment démarrer dans Claude Code

```bash
# 1. Créer le projet Next.js
npx create-next-app@latest comite-de-direction --typescript --tailwind --app --eslint
cd comite-de-direction

# 2. Copier le dossier de documentation
cp -r /chemin/vers/comite-de-direction/* .

# 3. Première session Claude Code
claude

# Puis dans Claude Code :
"Lis CLAUDE.md puis lance le sprint 1.1 de la roadmap"
```

## Status au moment de la livraison

| Élément | Status |
|---------|--------|
| Générateur PPTX v1.0 | ✅ Livré, 33 slides reproduites |
| Validateur N-1 widget | ✅ Livré (à porter dans plateforme v2.0) |
| Documentation projet | ✅ Complète (ce dossier) |
| Plateforme web v2.0 | 🔨 À développer (6 semaines estimées) |

## Modules en attente d'éléments d'Olivier

| Module | Élément attendu |
|--------|-----------------|
| Focus Mining (slide 29) | Paramétrage clients par site minier |
| Focus O&G (slide 28) | Volumes opérateurs détaillés |
| Focus AYMAN approfondi (slides 30-31) | Données DJAM DKS + HANNYYAH par segment |
| DSM modifications (slides 26-27) | Éléments à modifier |
| Slides Préconisations (5 nouvelles) | Fichier Excel avec points cibles |

---

*Index v1.0 — 18 juin 2026*

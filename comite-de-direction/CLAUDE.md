# CLAUDE.md — Instructions pour Claude Code

> Ce fichier est lu automatiquement par Claude Code à chaque session sur ce projet.

## Contexte projet

Tu travailles sur **Comité de Direction**, plateforme de génération automatisée d'études de marché stratégiques pour Africa Global Logistics (AGL), Direction Marketing & RP, Abidjan.

L'utilisateur principal est **Olivier Germanos**, Head of Strategy AGL Côte d'Ivoire.

## Documentation à lire en priorité

Au démarrage de toute nouvelle session, lire dans cet ordre :

1. **`README.md`** — vue d'ensemble du projet, contexte métier, état actuel
2. **`CAHIER_DES_CHARGES.md`** — spécifications fonctionnelles exhaustives (15 sections)
3. **`ARCHITECTURE.md`** — stack technique, choix d'infrastructure
4. **`DATA_MODEL.md`** — schéma BDD complet avec SQL prêt à exécuter
5. **`BRAND_GUIDELINES.md`** — charte visuelle AGL (couleurs, typo, layout)
6. **`ROADMAP.md`** — plan de développement semaine par semaine
7. **`docs/slides_reference.md`** — description détaillée des 33 slides
8. **`docs/pptx_injection_spec.md`** — spec module injection PPTX externes
9. **`docs/n1_validation_logic.md`** — algorithme validation N-1
10. **`docs/api_endpoints.md`** — spécification API REST

## Principes de développement

### Langue
- **Tout le code, les commentaires et les commits** : anglais (standard).
- **Toute communication avec Olivier** : français exclusivement.
- **Tous les libellés UI** : français.

### Style de réponse
- Précis et exhaustif (mode expert).
- Pas de simplifications ou résumés.
- Donner les explications techniques complètes.

### Stack obligatoire

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14 (App Router) + TypeScript strict |
| UI | Tailwind CSS + shadcn/ui |
| State | zustand |
| Backend | Next.js API Routes (Node.js serverless) |
| PPTX génération | pptxgenjs |
| PPTX injection | python-pptx + lxml (microservice FastAPI) |
| BDD | Supabase (Postgres + Storage) |
| Auth | Supabase Auth |
| Hébergement | Vercel + Railway (Python service) |

### Convention de nommage

- **Fichiers** : `kebab-case.ts`
- **Composants React** : `PascalCase.tsx`
- **Variables/fonctions** : `camelCase`
- **Constantes** : `SCREAMING_SNAKE_CASE`
- **Types/Interfaces** : `PascalCase`
- **Tables SQL** : `snake_case`

### Structure projet

```
comite-de-direction/
├── app/                       # Next.js App Router
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── studies/
│   │   │   ├── new/
│   │   │   └── [id]/
│   │   │       ├── data/
│   │   │       ├── n1/
│   │   │       ├── external/
│   │   │       ├── montage/
│   │   │       └── generate/
│   │   └── history/
│   └── api/
│       ├── studies/
│       ├── upload/
│       ├── validate/
│       └── generate/
├── components/
│   ├── ui/                    # shadcn primitives
│   ├── studies/
│   ├── datasets/
│   ├── n1/
│   ├── montage/
│   └── pptx/
├── lib/
│   ├── pptx/
│   │   ├── generator.ts       # Logique pptxgenjs (port v1.0)
│   │   ├── slides/            # 1 fichier par slide
│   │   └── helpers.ts
│   ├── n1-validation/
│   │   └── validate.ts
│   ├── parsers/
│   │   ├── csv.ts
│   │   ├── xlsx.ts
│   │   └── schemas.ts         # Zod schemas
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   └── utils.ts
├── python-service/            # Microservice Python
│   ├── main.py
│   ├── injector.py
│   ├── thumbnails.py
│   ├── fonts.py
│   ├── Dockerfile
│   └── requirements.txt
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── public/
└── package.json
```

### Tests

- Tests unitaires : Vitest + React Testing Library
- Tests E2E : Playwright
- Tests visuels PPTX : LibreOffice headless + comparaison PNG
- Coverage cible : 70%+ sur lib/, 100% sur lib/pptx/ et lib/n1-validation/

## Mots-clés de reprise

L'utilisateur peut utiliser ces commandes courtes pour reprendre rapidement :

- **`agl studio go`** → reprise développement plateforme complète, lire README + CAHIER_DES_CHARGES + ROADMAP
- **`audit pptx go`** → audit visuel du PPTX généré, comparer slides actuelles vs référence
- **`n1 validation go`** → travail sur validateur Nouveaux Entrants (lire docs/n1_validation_logic.md)
- **`preconisations go`** → travail sur slides préconisations (lire examples/preconisations_template_README.md)
- **`injection pptx go`** → travail sur module d'injection slides externes (lire docs/pptx_injection_spec.md)
- **`mining og go`** → paramétrage Focus Mining & O&G (slides 28-29)
- **`ayman go`** → approfondissement Focus AYMAN (slides 30-31)
- **`dsm go`** → modifications DSM (slides 26-27)

## Sources de données (à clarifier avec Olivier)

L'utilisateur fournira ces données — ne pas inventer :

- **STATCOM** : exports CSV par métier (volumes par transitaire/marchandise/destinataire)
- **IRIS** : exports volumes AGL par client et métier (facturation)
- **CRM AGL** : référentiel clients enrichi
- **Power BI codir_V1.pbix** : exports slides PPTX réutilisables
- **Excel préconisations** : à recevoir séparément avec format spécifié

## Règle d'or — Fidélité à la charte AGL

**Aucune modification de la charte visuelle (couleurs, polices, layouts) sans validation explicite d'Olivier.**

Charte stricte :
- Navy `#0D2243`
- Doré `#C9A84C`
- Calibri exclusivement
- Format 13.33" × 7.5" (LAYOUT_WIDE)
- 0 effet décoratif (shadow, gradient, neon)

Voir `BRAND_GUIDELINES.md` pour les spécifications complètes.

## Modules en attente d'éléments

Au moment de la rédaction, ces 4 modules attendent des éléments d'Olivier :

1. **Focus Mining & O&G** (slides 28-29) — paramétrage clients par site
2. **Focus AYMAN approfondi** (slides 30-31) — données DJAM DKS + HANNYYAH détaillées
3. **DSM modifications** (slides 26-27) — éléments à modifier
4. **Slides Préconisations** (5 nouvelles) — fichier Excel avec points cibles

Quand l'un de ces éléments est fourni, traiter en priorité.

## Sécurité

- Pas de secrets en clair dans le code (`.env.local` non-committé).
- RLS Supabase activé sur toutes les tables.
- URLs Storage signées avec expiration max 1h.
- Bearer token pour communication Next.js ↔ Python service.

## Gestion des erreurs

- Toute erreur utilisateur doit avoir un message en français clair.
- Pas de stack trace exposée côté client.
- Logs serveur structurés (JSON) pour debugging.

## Commits

Format Conventional Commits :
```
feat(scope): description courte

Description longue en anglais.

Closes #123
```

Scopes : `pptx`, `n1`, `upload`, `montage`, `auth`, `ui`, `api`, `db`, `python`.

---

*Document v1.0 — 18 juin 2026*

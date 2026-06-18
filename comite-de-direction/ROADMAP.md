# ROADMAP — Comité de Direction v2.0

> Plan de développement séquencé sur 6 semaines.

## Vue d'ensemble

```
Semaine 1 ────────► Foundation (Next.js + Supabase + auth)
Semaine 2 ────────► Générateur PPTX intégré (port v1.0 en API Route)
Semaine 3 ────────► Module M2 (uploads) + Module M3 (Validation N-1)
Semaine 4 ────────► Module M4 (Injection PPTX) + microservice Python
Semaine 5 ────────► Module M5 (Préconisations) + UI plan de montage
Semaine 6 ────────► Tests + déploiement + formation Olivier
```

## Phase 1 — Foundation (semaine 1)

### Sprint 1.1 — Initialisation projet (jour 1-2)

**Tâches** :
- [ ] Créer repo GitHub `comite-de-direction`
- [ ] Initialiser projet Next.js 14 avec TypeScript strict
- [ ] Configurer Tailwind CSS + shadcn/ui
- [ ] Installer composants UI de base (Button, Card, Dialog, Toast, Table, Tabs)
- [ ] Configurer ESLint + Prettier + Husky pre-commit hooks
- [ ] Setup CI GitHub Actions (lint + type-check + build)
- [ ] Configurer variables d'environnement (.env.local + .env.example)

**Livrable** : projet vide build OK, déployable sur Vercel.

### Sprint 1.2 — Backend Supabase (jour 2-3)

**Tâches** :
- [ ] Créer projet Supabase (ou réutiliser `siewomjmhnufravrpqem`)
- [ ] Appliquer migrations SQL (toutes tables de `DATA_MODEL.md`)
- [ ] Configurer RLS policies sur toutes les tables
- [ ] Créer buckets Storage : `datasets`, `external-pptx`, `external-thumbnails`, `generated`, `preconisations`
- [ ] Configurer bucket policies
- [ ] Seeder utilisateur admin (Olivier)
- [ ] Insérer aliases N-1 connus (CEVA, TGR, etc.)

**Livrable** : BDD prête, schéma testé via Supabase Studio.

### Sprint 1.3 — Auth + layout global (jour 3-5)

**Tâches** :
- [ ] Implémenter login email/password avec Supabase Auth
- [ ] Page `/login` avec formulaire + validation Zod
- [ ] Middleware Next.js pour protéger les routes
- [ ] Layout global avec sidebar navy + header
- [ ] Page dashboard `/` vide avec placeholder
- [ ] Composant déconnexion
- [ ] Tests E2E de login (Playwright)

**Livrable** : utilisateur peut se connecter, accède à dashboard vide.

## Phase 2 — Générateur intégré (semaine 2)

### Sprint 2.1 — Port du générateur v1.0 (jour 6-8)

**Tâches** :
- [ ] Copier `generate_AGL_2026.js` dans `lib/pptx/generator.ts`
- [ ] Refactor en TypeScript avec types stricts
- [ ] Extraire les données hardcodées vers structure `StudyData` typée
- [ ] Créer API Route `POST /api/generate-pptx` qui prend des données et retourne un Buffer
- [ ] Tester génération PPTX depuis l'API Route en local
- [ ] Upload PPTX généré vers Supabase Storage
- [ ] Retourner URL signée téléchargement

**Livrable** : appel API génère un PPTX 33 slides depuis données mock.

### Sprint 2.2 — UI création étude (jour 8-10)

**Tâches** :
- [ ] Page `/studies/new` avec formulaire création étude
- [ ] Champs : titre, période (date pickers), métiers (checkboxes)
- [ ] Création record `studies` en BDD via API Route
- [ ] Redirection vers `/studies/[id]/data`
- [ ] Page dashboard listant les études existantes (Cards)
- [ ] Tri par date, filtres par statut

**Livrable** : Olivier peut créer une étude vide et la voir dans son dashboard.

## Phase 3 — Modules uploads + validation N-1 (semaine 3)

### Sprint 3.1 — Module M2 Upload datasets (jour 11-13)

**Tâches** :
- [ ] Page `/studies/[id]/data` avec tabs par métier
- [ ] Composant `DatasetUploadCard` par type de donnée
- [ ] Intégration `react-dropzone` pour upload fichiers
- [ ] Parser CSV avec `papaparse` (auto-détection séparateur)
- [ ] Parser XLSX avec `SheetJS`
- [ ] Validation schéma par type de donnée (Zod schemas)
- [ ] Affichage erreurs ligne par ligne
- [ ] Aperçu 10 premières lignes après parsing OK
- [ ] Sauvegarde dans `study_datasets` + upload fichier source vers Storage

**Livrable** : Olivier peut uploader ses CSV/XLSX par métier, voir parsing et validation.

### Sprint 3.2 — Module M3 Validation N-1 (jour 13-15)

**Tâches** :
- [ ] Page `/studies/[id]/n1` avec composants par métier
- [ ] Upload référentiel N-1 par métier
- [ ] Implémenter algorithme matching fuzzy (port du widget existant en TypeScript)
- [ ] Gestion table `n1_aliases` pour équivalences manuelles
- [ ] Bouton "Valider" déclenche le matching
- [ ] Affichage tableau résultats avec verdicts colorés
- [ ] Possibilité d'override manuel (cocher/décocher)
- [ ] Sauvegarde dans `n1_validation_results`
- [ ] Mise à jour des datasets pour exclure automatiquement les `existant`

**Livrable** : validation N-1 fonctionnelle, faux nouveaux entrants éliminés.

## Phase 4 — Injection PPTX externes (semaine 4)

### Sprint 4.1 — Microservice Python (jour 16-18)

**Tâches** :
- [ ] Créer projet FastAPI `agl-python-service`
- [ ] Installer `python-pptx`, `lxml`, `openpyxl`, `rapidfuzz`
- [ ] Endpoint `POST /inject` : copie XML brut entre PPTX
- [ ] Endpoint `POST /thumbnails` : génération thumbnails via LibreOffice + pdftoppm
- [ ] Endpoint `POST /detect-fonts` : détection polices non-standard
- [ ] Auth via Bearer token simple
- [ ] Déploiement Railway / Render avec `Dockerfile`
- [ ] Variables d'env : `SUPABASE_URL`, `SERVICE_ROLE_KEY`, `SERVICE_TOKEN`

**Livrable** : microservice déployé, endpoints testables via curl.

### Sprint 4.2 — Module M4 UI injection (jour 18-20)

**Tâches** :
- [ ] Page `/studies/[id]/external` avec upload multi-PPTX
- [ ] Upload vers Supabase Storage
- [ ] Appel microservice `/thumbnails` après upload
- [ ] Affichage grid thumbnails par PPTX uploadé
- [ ] Checkboxes sélection slides
- [ ] Sauvegarde sélections dans `study_external_slides`
- [ ] Détection polices non-standard + warning UI
- [ ] Bouton "Inclure dans le plan de montage"

**Livrable** : Olivier peut uploader des PPTX externes, voir thumbnails, sélectionner slides à injecter.

## Phase 5 — Préconisations + plan de montage (semaine 5)

### Sprint 5.1 — Module M5 Préconisations (jour 21-23)

**Tâches** :
- [ ] Page `/studies/[id]/preconisations` avec upload Excel
- [ ] Parsing Excel avec une feuille par métier
- [ ] Validation schéma colonnes : `axe`, `horizon`, `point_cible`, `donnee_quantitative`, `priorite`, `commentaire_expert`
- [ ] Affichage par métier en accordéons éditables
- [ ] Sauvegarde dans `study_preconisations`
- [ ] Ajouter au générateur PPTX : 5 nouvelles slides (1 par métier) avec layout quadrant
- [ ] Tests visuels rendu slide préconisation

**Livrable** : génération des 5 slides préconisations depuis Excel.

### Sprint 5.2 — Module M9 Plan de montage (jour 23-25)

**Tâches** :
- [ ] Page `/studies/[id]/montage` avec liste verticale drag-and-drop
- [ ] Intégrer `@dnd-kit` (préféré à react-beautiful-dnd qui est maintenance-mode)
- [ ] Génération thumbnails pour chaque slide native (via PPTX intermédiaire + LibreOffice)
- [ ] Affichage thumbnails dans liste
- [ ] Indicateurs visuels par type : ⚙ généré / 📎 injecté / ✏ manuel
- [ ] Toggle visible/masqué par bloc
- [ ] Sauvegarde drag-and-drop dans `study_montage.blocks`
- [ ] Possibilité d'ajouter une slide blanche manuelle (titre + texte)

**Livrable** : Olivier peut réorganiser tout l'ordre des slides à sa guise.

## Phase 6 — Génération finale + déploiement (semaine 6)

### Sprint 6.1 — Pipeline génération complet (jour 26-28)

**Tâches** :
- [ ] Page `/studies/[id]/generate` avec aperçu final + bouton de génération
- [ ] API Route `POST /api/studies/[id]/generate` orchestrant :
  1. Récupération données complètes
  2. Génération PPTX intermédiaire (Node pptxgenjs)
  3. Upload intermédiaire vers Storage
  4. Appel microservice Python `/inject` si slides externes
  5. Réordonnancement final selon `study_montage.blocks`
  6. Création record `study_versions`
- [ ] Loader avec étapes visibles dans UI
- [ ] Gestion erreurs avec messages clairs
- [ ] Téléchargement automatique du PPTX final
- [ ] Historique versions accessibles depuis détail étude

**Livrable** : Génération complète end-to-end fonctionnelle.

### Sprint 6.2 — Tests, polish, documentation (jour 28-30)

**Tâches** :
- [ ] Tests E2E Playwright : workflow complet création → génération
- [ ] Tests visuels : génération étude Jan-Mai 2026 comparée à référence v1.0
- [ ] Documentation utilisateur (`docs/user-guide.md`)
- [ ] Vidéo screencast 5min montrant workflow complet
- [ ] Corrections bugs identifiés en tests
- [ ] Déploiement production Vercel
- [ ] Configuration domaine custom (si applicable)
- [ ] Formation Olivier : session live 2h (workflow complet, troubleshooting)

**Livrable** : application en production, Olivier autonome.

## Backlog post-v2.0

### Modules P1 (à itérer après stabilisation v2.0)

| Module | Effort estimé | Priorité |
|--------|--------------|----------|
| **M6 — Focus Mining & O&G paramétrables** | 3 jours | P1 |
| **M7 — Focus AYMAN approfondi** | 2 jours | P1 |
| **M8 — DSM modifications** | 2 jours | P1 |
| **M10 — Historique études + comparaison** | 3 jours | P2 |
| **M11 — Templates personnalisables (charte)** | 5 jours | P2 |
| **M12 — Export PDF + Word synthèse** | 4 jours | P2 |
| Google SSO @aglgroup.com | 1 jour | P2 |
| Multi-utilisateurs avec rôles fins | 2 jours | P3 |
| Workflow de validation hiérarchique | 5 jours | P3 |
| Connexion temps réel STATCOM via API | 7 jours | P3 |
| Génération automatique commentaires (LLM) | 5 jours | P3 |
| Dashboard analytics évolution PDM | 3 jours | P3 |

### Idées exploratoires (P4)

- Intégration Power BI : embed direct des dashboards dans Studio
- Mode collaboratif : commentaires sur slides
- Templates communautaires : partage de configs entre utilisateurs AGL
- API publique : trigger de génération depuis Power Automate

## Jalons clés

| Jalon | Date cible | Critères de validation |
|-------|-----------|------------------------|
| **MVP Foundation** | Fin S1 | Auth + dashboard fonctionnels |
| **MVP Génération** | Fin S2 | API génère PPTX 33 slides |
| **MVP Uploads + N-1** | Fin S3 | Données uploadables + N-1 validé |
| **MVP Injection** | Fin S4 | PPTX externes injectables |
| **Bêta privée** | Fin S5 | Workflow complet utilisable |
| **Production** | Fin S6 | Olivier autonome, étude Juin 2026 produite avec v2.0 |

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Cold start microservice Python | UX dégradée | Plan payant Railway pour instance toujours up |
| Timeout Vercel sur génération >30s | Bloquant | Plan Pro Vercel (timeout 60s) + génération asynchrone si nécessaire |
| Polices non-standard PPTX externes | Rendu cassé | Détection automatique + warning utilisateur |
| Performance LibreOffice thumbnails | Lenteur perçue | Génération asynchrone en background + cache |
| Volume Storage Supabase | Coût | Purge automatique versions > 90 jours |
| Olivier indisponible pour tests | Retard | Tests automatisés exhaustifs en lieu et place |

---

*Document v1.0 — 18 juin 2026*

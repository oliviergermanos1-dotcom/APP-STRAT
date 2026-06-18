# ARCHITECTURE — Comité de Direction v2.0

## 1. Vue globale

```
                          ┌──────────────────┐
                          │   Olivier (UI)    │
                          │   comite-de-direction.com  │
                          └────────┬──────────┘
                                   │ HTTPS
                  ┌────────────────┴────────────────┐
                  │                                  │
                  ▼                                  ▼
        ┌─────────────────┐               ┌──────────────────┐
        │   Vercel Edge    │               │  Supabase Auth   │
        │   (CDN + Static) │               │  (JWT validation)│
        └────────┬────────┘               └──────────────────┘
                 │
                 ▼
        ┌────────────────────────────────────────┐
        │   Next.js 14 App Router (Vercel)        │
        │                                          │
        │   ┌────────────┐  ┌─────────────────┐  │
        │   │  Pages     │  │   API Routes    │  │
        │   │  (React    │  │   (Node.js      │  │
        │   │   Server)  │  │    serverless)  │  │
        │   └────────────┘  └────────┬────────┘  │
        │                            │            │
        └────────────────────────────┼────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
        ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
        │   pptxgenjs   │  │  Python service │  │   Supabase       │
        │   (génération │  │  (injection     │  │   - Postgres     │
        │    slides)    │  │   PPTX externes)│  │   - Storage      │
        │               │  │                 │  │   - Auth         │
        │   Inline      │  │   Microservice  │  │                  │
        │   in API      │  │   FastAPI sur   │  │   Project :      │
        │   Route       │  │   Railway/Render│  │   siewomjmhnufrav│
        └──────────────┘  └─────────────────┘  └──────────────────┘
```

## 2. Stack technique détaillée

### 2.1 Frontend

| Composant | Version | Rôle |
|-----------|---------|------|
| **Next.js** | 14.2+ | Framework SSR/SSG avec App Router |
| **React** | 18.3+ | Bibliothèque UI |
| **TypeScript** | 5.4+ | Typage strict (`strict: true`) |
| **Tailwind CSS** | 3.4+ | Styling utility-first |
| **shadcn/ui** | latest | Composants accessibles préconstruits |
| **lucide-react** | latest | Icônes (cohérence Tabler côté outils) |
| **zustand** | 4+ | State management léger (déjà familier Olivier) |
| **react-hook-form** | 7+ | Formulaires complexes (validation, upload) |
| **zod** | 3+ | Schémas validation (alignés Supabase) |

### 2.2 Backend Node.js (API Routes)

| Composant | Version | Rôle |
|-----------|---------|------|
| **pptxgenjs** | 3.12+ | Génération slides natives 33 slides |
| **xlsx** (SheetJS) | 0.18+ | Parsing Excel (.xlsx) |
| **papaparse** | 5+ | Parsing CSV avec auto-détection séparateur |
| **fuse.js** | 7+ | Fuzzy matching (validation N-1) |
| **@supabase/supabase-js** | 2+ | Client BDD + Storage |
| **uuid** | 9+ | Génération identifiants uniques |
| **dayjs** | 1+ | Manipulation dates |

### 2.3 Microservice Python

Hébergé séparément (Railway, Render ou Fly.io) car :
- python-pptx + lxml ne fonctionnent pas dans serverless Vercel (timeout, dépendances natives).
- Cold start trop long sur Vercel pour python.

| Composant | Version | Rôle |
|-----------|---------|------|
| **FastAPI** | 0.110+ | Framework API REST |
| **python-pptx** | 0.6.23+ | Manipulation PPTX |
| **lxml** | 5+ | XML brut pour copy slides inter-PPTX |
| **openpyxl** | 3.1+ | Parsing Excel avancé |
| **rapidfuzz** | 3+ | Matching fuzzy haute performance |
| **uvicorn** | 0.27+ | Serveur ASGI |
| **pydantic** | 2+ | Validation schémas |

### 2.4 Infrastructure

| Service | Plan | Coût mensuel |
|---------|------|--------------|
| **Vercel** | Pro | ~20$/mois (timeout 60s, build illimité) |
| **Supabase** | Pro | ~25$/mois (8 GB DB, 100 GB storage) |
| **Railway** (Python) | Hobby | ~5$/mois |
| **Domaine** | OVH ou Vercel | ~15€/an |
| **Total** | | **~55$/mois** |

## 3. Communication inter-services

### 3.1 Next.js → Python microservice

```typescript
// app/api/inject-slides/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL;
const SERVICE_TOKEN = process.env.PYTHON_SERVICE_TOKEN;

export async function POST(req: NextRequest) {
  const { studyId, finalPptxUrl, externalSlides } = await req.json();

  const response = await fetch(`${PYTHON_SERVICE_URL}/inject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      study_id: studyId,
      final_pptx_url: finalPptxUrl,
      external_slides: externalSlides,
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Python service error' },
      { status: 500 }
    );
  }

  const result = await response.json();
  return NextResponse.json(result);
}
```

### 3.2 Microservice Python — endpoints

```python
# main.py
from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Comité de Direction Python Service")

class InjectRequest(BaseModel):
    study_id: str
    final_pptx_url: str  # URL signée Supabase
    external_slides: List[dict]  # [{pptx_url, slide_index, position}]

async def verify_token(authorization: str = Header(...)):
    expected = f"Bearer {os.getenv('SERVICE_TOKEN')}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/inject", dependencies=[Depends(verify_token)])
async def inject_slides(req: InjectRequest):
    # 1. Télécharger PPTX final depuis Supabase
    # 2. Télécharger PPTX sources externes
    # 3. Copier slides XML brut
    # 4. Upload nouveau PPTX vers Supabase
    # 5. Retourner URL du fichier final
    return {"status": "ok", "final_url": "..."}

@app.post("/thumbnails", dependencies=[Depends(verify_token)])
async def generate_thumbnails(pptx_url: str):
    # Utilise LibreOffice headless + pdftoppm
    return {"thumbnails": [...]}

@app.post("/detect-fonts", dependencies=[Depends(verify_token)])
async def detect_fonts(pptx_url: str):
    # Analyse polices utilisées
    return {"custom_fonts": [...]}
```

## 4. Flux de génération PPTX complet

```
1. UI : utilisateur clique "Générer PPTX"
   ↓
2. Next.js API Route POST /api/studies/[id]/generate
   ↓
3. Récupération données complètes depuis Supabase :
   - studies, study_datasets, study_montage, study_preconisations
   ↓
4. Étape A : Génération slides natives (pptxgenjs Node.js)
   - 33 slides standard
   - + slides préconisations
   → PPTX intermédiaire stocké en mémoire
   ↓
5. Étape B : Upload PPTX intermédiaire vers Supabase Storage
   - Bucket : generated/
   - Path : {study_id}/intermediate-{timestamp}.pptx
   ↓
6. Étape C : Si slides externes à injecter
   - Appel POST microservice Python /inject
   - Python télécharge PPTX intermédiaire + PPTX externes
   - Copie XML brut, réordonne selon plan_montage
   - Upload PPTX final vers Supabase
   ↓
7. Étape D : Création record study_versions
   - version_number incrémenté
   - storage_path = chemin PPTX final
   ↓
8. Réponse à UI avec URL signée téléchargement
   ↓
9. UI déclenche download navigateur
```

## 5. Schéma BDD Supabase complet

Voir `DATA_MODEL.md` pour les définitions SQL complètes.

```
users
  ↓ (1:N)
studies
  ├─ study_datasets (N:1)
  │    └─ stockage CSV/XLSX dans Supabase Storage
  ├─ n1_referentials (N:1)
  ├─ study_external_slides (N:1)
  │    └─ stockage PPTX dans Supabase Storage
  ├─ study_montage (1:1)
  ├─ study_versions (N:1)
  │    └─ stockage PPTX final dans Supabase Storage
  └─ study_preconisations (N:1)

n1_aliases (table indépendante, user-scoped)
```

## 6. Pattern de déploiement

### 6.1 Branches Git

```
main                    ← production (auto-deploy Vercel)
develop                 ← intégration continue
feature/n1-validation   ← features
feature/pptx-injection
hotfix/...              ← corrections urgentes
```

### 6.2 Variables d'environnement

```bash
# .env.local (dev)
NEXT_PUBLIC_SUPABASE_URL=https://siewomjmhnufravrpqem.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PYTHON_SERVICE_URL=http://localhost:8000
PYTHON_SERVICE_TOKEN=dev-secret-123

# .env.production (Vercel)
NEXT_PUBLIC_SUPABASE_URL=https://siewomjmhnufravrpqem.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PYTHON_SERVICE_URL=https://agl-python-service.up.railway.app
PYTHON_SERVICE_TOKEN=<random 64-char>
```

### 6.3 CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test

  deploy-vercel:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

  deploy-railway:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd python-service && railway up
```

## 7. Monitoring et observabilité

### 7.1 Logs

- **Vercel logs** : automatique, accessible dans dashboard Vercel.
- **Supabase logs** : queries SQL et erreurs Auth dans dashboard Supabase.
- **Railway logs** : logs Python service dans dashboard Railway.
- **Sentry** (v2.1 futur) : capture erreurs frontend + backend.

### 7.2 Métriques

À tracker dans dashboard interne Supabase :
- Nombre d'études créées / mois
- Temps moyen de génération PPTX
- Taux d'erreur génération
- Volume de stockage utilisé
- Nombre d'utilisateurs actifs

## 8. Stratégie de migration depuis v1.0

### 8.1 Approche

La v1.0 (script Node.js standalone) reste utilisable en parallèle pendant le développement de la v2.0. L'utilisateur peut continuer à générer ses études avec v1.0 jusqu'à la mise en production de v2.0.

### 8.2 Étapes de migration

1. **Étape 1** : Déploiement v2.0 en dev sur preview branch Vercel.
2. **Étape 2** : Olivier teste génération étude Juin 2026 en parallèle avec v1.0 et v2.0.
3. **Étape 3** : Validation visuelle 100% identique.
4. **Étape 4** : Bascule production v2.0.
5. **Étape 5** : Archive v1.0 (script conservé dans `/legacy/`).

## 9. Sauvegarde et reprise sur incident

### 9.1 Sauvegardes automatiques

- **Supabase** : backups quotidiens automatiques (plan Pro).
- **Storage** : versioning activé sur bucket `generated/` (conservation 30 jours).
- **Code** : repo GitHub avec mirrors automatiques.

### 9.2 Plan de reprise

- **Downtime acceptable** : 4h ouvrées.
- **RPO** (Recovery Point Objective) : 24h (dernier backup).
- **RTO** (Recovery Time Objective) : 2h (redéploiement Vercel + restore Supabase).

---

*Document v1.0 — 18 juin 2026*

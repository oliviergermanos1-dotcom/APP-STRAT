# API ENDPOINTS — Comité de Direction v2.0

> Spécification complète de l'API REST.

---

## 1. Conventions

### 1.1 Base URL

- **Dev** : `http://localhost:3000/api`
- **Production** : `https://comite-de-direction.vercel.app/api`

### 1.2 Authentification

Toutes les routes (sauf `/auth/*`) requièrent un header :
```
Authorization: Bearer <supabase_jwt_token>
```

### 1.3 Format

- Tous les payloads en JSON.
- Encoding UTF-8.
- Dates au format ISO 8601 (`2026-01-15T10:30:00Z`).

### 1.4 Codes HTTP standards

| Code | Signification |
|------|---------------|
| 200 | OK |
| 201 | Créé |
| 204 | OK sans contenu |
| 400 | Bad Request (payload invalide) |
| 401 | Non authentifié |
| 403 | Non autorisé (RLS) |
| 404 | Ressource non trouvée |
| 409 | Conflit (ex: doublon) |
| 422 | Validation Zod échouée |
| 500 | Erreur serveur |

### 1.5 Format erreur standard

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ 'period_start' est requis",
    "details": {
      "field": "period_start",
      "value": null
    }
  }
}
```

---

## 2. Authentication

### 2.1 POST `/api/auth/login`

Connexion utilisateur.

**Request** :
```json
{
  "email": "olivier.germanos@aglgroup.com",
  "password": "********"
}
```

**Response 200** :
```json
{
  "user": {
    "id": "uuid",
    "email": "olivier.germanos@aglgroup.com",
    "full_name": "Olivier Germanos",
    "role": "admin"
  },
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 3600
}
```

### 2.2 POST `/api/auth/logout`

Déconnexion (invalide le token).

**Response 204**

### 2.3 GET `/api/auth/me`

Récupère l'utilisateur actuellement connecté.

**Response 200** :
```json
{
  "id": "uuid",
  "email": "olivier.germanos@aglgroup.com",
  "full_name": "Olivier Germanos",
  "role": "admin",
  "last_login_at": "2026-06-18T08:30:00Z"
}
```

---

## 3. Études (Studies)

### 3.1 GET `/api/studies`

Liste les études de l'utilisateur connecté.

**Query params** :
- `status` (optionnel) : `draft`, `completed`, `archived`
- `limit` (défaut 20)
- `offset` (défaut 0)

**Response 200** :
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "AGL Étude Jan-Mai 2026",
      "period_start": "2026-01-01",
      "period_end": "2026-05-31",
      "metiers": ["TIM", "TEM", "HIMP", "HEXP", "AER", "DSM"],
      "status": "completed",
      "created_at": "2026-06-15T10:00:00Z",
      "updated_at": "2026-06-18T09:00:00Z",
      "stats": {
        "dataset_count": 12,
        "external_pptx_count": 2,
        "version_count": 3,
        "last_generated_at": "2026-06-18T09:00:00Z"
      }
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 20,
    "offset": 0
  }
}
```

### 3.2 POST `/api/studies`

Crée une nouvelle étude.

**Request** :
```json
{
  "title": "AGL Étude Juin 2026",
  "description": "Étude mensuelle pour CODIR",
  "period_start": "2026-06-01",
  "period_end": "2026-06-30",
  "metiers": ["TIM", "TEM", "HIMP", "HEXP", "AER", "DSM"]
}
```

**Response 201** :
```json
{
  "id": "uuid",
  "title": "AGL Étude Juin 2026",
  "status": "draft",
  ...
}
```

### 3.3 GET `/api/studies/:id`

Récupère le détail complet d'une étude.

**Response 200** :
```json
{
  "id": "uuid",
  "title": "...",
  "status": "draft",
  "datasets": [...],
  "n1_referentials": [...],
  "external_slides": [...],
  "montage": {...},
  "versions": [...],
  "preconisations": [...]
}
```

### 3.4 PATCH `/api/studies/:id`

Met à jour une étude (titre, description, période, métiers, status).

**Request** :
```json
{
  "title": "Titre modifié",
  "status": "archived"
}
```

**Response 200** : étude mise à jour.

### 3.5 DELETE `/api/studies/:id`

Supprime une étude et toutes ses données associées.

**Response 204**

---

## 4. Datasets (données métier)

### 4.1 POST `/api/studies/:id/datasets`

Upload un dataset (CSV, XLSX, TSV) pour un métier et un type donné.

**Request (multipart/form-data)** :
```
file: <fichier>
metier: "TIM"
dataset_type: "concurrents"  // ou "clients", "segments", "mensuel", "nouveaux_acteurs", etc.
```

**Response 201** :
```json
{
  "id": "uuid",
  "study_id": "uuid",
  "metier": "TIM",
  "dataset_type": "concurrents",
  "storage_path": "datasets/{study_id}/TIM/concurrents-{timestamp}.csv",
  "row_count": 10,
  "validation_status": "valid",
  "validation_messages": [],
  "parsed_data": [
    { "rang": 1, "nom": "AFRICA GLOBAL LOGISTICS", "volume": 15133, "pdm": 7.8 },
    ...
  ]
}
```

**Response 422 (validation échouée)** :
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "3 lignes invalides détectées",
    "details": {
      "errors": [
        { "line": 5, "column": "volume", "message": "Valeur non numérique" },
        { "line": 12, "column": "pdm", "message": "Valeur > 100%" }
      ]
    }
  }
}
```

### 4.2 GET `/api/studies/:id/datasets`

Liste tous les datasets de l'étude.

**Query params** :
- `metier` (optionnel) : filtre par métier
- `dataset_type` (optionnel)

**Response 200** :
```json
{
  "data": [...]
}
```

### 4.3 PUT `/api/studies/:id/datasets/:dataset_id`

Met à jour un dataset existant (édition manuelle des données parsées).

**Request** :
```json
{
  "parsed_data": [...]
}
```

### 4.4 DELETE `/api/studies/:id/datasets/:dataset_id`

Supprime un dataset.

---

## 5. Référentiels N-1

### 5.1 POST `/api/studies/:id/n1-referentials`

Upload un référentiel N-1 pour un métier.

**Request (multipart/form-data)** :
```
file: <fichier>
metier: "TIM"
year: 2025
```

**Response 201** : référentiel parsé.

### 5.2 POST `/api/studies/:id/n1-validations`

Déclenche la validation N-1 pour un métier donné.

**Request** :
```json
{
  "metier": "TIM",
  "validation_type": "acteurs"  // ou "marchandises"
}
```

**Response 200** :
```json
{
  "results": [
    {
      "entity_name": "CEVA LOGISTICS CI",
      "volume_n": 2950,
      "volume_n_minus_1": 1200,
      "match_score": 1.0,
      "matched_name": "CEVA CI",
      "verdict": "existant"
    },
    {
      "entity_name": "ATLANTIQUE TRANSIT CI",
      "volume_n": 3820,
      "volume_n_minus_1": 0,
      "match_score": 1.0,
      "matched_name": "ATLANTIQUE TRANSIT CI",
      "verdict": "nouveau"
    },
    ...
  ]
}
```

### 5.3 PATCH `/api/n1-validations/:id`

Override manuel d'un verdict.

**Request** :
```json
{
  "verdict": "nouveau",
  "reason": "Changement de raison sociale en mars 2026",
  "also_add_alias": {
    "name_n": "CEVA LOGISTICS CI",
    "name_n_minus_1": "CEVA CI"
  }
}
```

### 5.4 GET `/api/n1-aliases`

Liste les aliases manuels de l'utilisateur.

### 5.5 POST `/api/n1-aliases`

Ajoute un alias manuel.

**Request** :
```json
{
  "metier": "TIM",
  "name_n": "CEVA LOGISTICS CI",
  "name_n_minus_1": "CEVA CI",
  "notes": "Variante orthographique observée"
}
```

---

## 6. PPTX externes

### 6.1 POST `/api/studies/:id/external-pptx`

Upload un PPTX externe.

**Request (multipart/form-data)** :
```
file: <PPTX>
```

**Response 201** :
```json
{
  "id": "uuid",
  "original_filename": "rapport_power_bi.pptx",
  "storage_path": "...",
  "slide_count": 8,
  "upload_status": "processing",
  "thumbnails_metadata": []
}
```

Le service Python génère les thumbnails en arrière-plan. Le frontend peut poller `GET /api/external-pptx/:id` jusqu'à `upload_status: "ready"`.

### 6.2 GET `/api/external-pptx/:id`

Récupère détail d'un PPTX externe avec ses thumbnails.

**Response 200** :
```json
{
  "id": "uuid",
  "upload_status": "ready",
  "slide_count": 8,
  "thumbnails_metadata": [
    { "index": 0, "title": "Slide 1", "thumbnail_url": "..." },
    { "index": 1, "title": "Slide 2", "thumbnail_url": "..." },
    ...
  ],
  "custom_fonts_detected": ["Roboto", "Open Sans"],
  "selected_slide_indices": [2, 5]
}
```

### 6.3 PATCH `/api/external-pptx/:id`

Met à jour la sélection de slides.

**Request** :
```json
{
  "selected_slide_indices": [2, 5, 7]
}
```

### 6.4 DELETE `/api/external-pptx/:id`

Supprime un PPTX externe et ses thumbnails.

---

## 7. Plan de montage

### 7.1 GET `/api/studies/:id/montage`

Récupère le plan de montage de l'étude.

**Response 200** :
```json
{
  "id": "uuid",
  "study_id": "uuid",
  "blocks": [
    { "type": "cover", "enabled": true },
    { "type": "sommaire", "enabled": true },
    { "type": "separator", "metier": "TIM", "enabled": true },
    { "type": "native", "metier": "TIM", "slide_type": "vue_ensemble", "enabled": true },
    { "type": "native", "metier": "TIM", "slide_type": "concurrents", "enabled": true },
    { "type": "external", "pptx_id": "uuid", "slide_index": 2, "enabled": true },
    { "type": "native", "metier": "TIM", "slide_type": "clientele", "enabled": true },
    { "type": "preconisation", "metier": "TIM", "enabled": true },
    ...
  ],
  "updated_at": "..."
}
```

### 7.2 PUT `/api/studies/:id/montage`

Met à jour le plan de montage complet.

**Request** :
```json
{
  "blocks": [...]
}
```

### 7.3 POST `/api/studies/:id/montage/auto-generate`

Régénère un plan de montage par défaut basé sur les métiers sélectionnés.

**Response 200** : nouveau plan de montage.

---

## 8. Préconisations

### 8.1 POST `/api/studies/:id/preconisations`

Upload un fichier Excel de préconisations.

**Request (multipart/form-data)** :
```
file: <XLSX>
```

**Response 201** :
```json
{
  "preconisations": [
    {
      "metier": "TIM",
      "horizon": "12_mois",
      "vision_marche": [...],
      "positionnement_agl": [...],
      "segments_cibles": [...],
      "risques_surveillance": [...],
      "synthese_expert": "..."
    },
    ...
  ]
}
```

### 8.2 GET `/api/studies/:id/preconisations`

Liste les préconisations par métier.

### 8.3 PUT `/api/studies/:id/preconisations/:metier`

Édite manuellement les préconisations d'un métier.

**Request** :
```json
{
  "vision_marche": [
    { "point": "...", "metrique": "+860 TEU/an", "priorite": "haute" }
  ],
  "positionnement_agl": [...],
  "segments_cibles": [...],
  "risques_surveillance": [...],
  "synthese_expert": "..."
}
```

---

## 9. Génération PPTX final

### 9.1 POST `/api/studies/:id/generate`

Déclenche la génération du PPTX final.

**Request** : vide (utilise l'état actuel de l'étude).

**Response 202 (Accepted)** :
```json
{
  "version_id": "uuid",
  "version_number": 3,
  "status": "generating",
  "estimated_duration_ms": 25000
}
```

La génération est asynchrone. Le frontend poll `GET /api/studies/:id/versions/:version_id` jusqu'à statut `completed`.

**Response 200 (génération synchrone si < 25s)** :
```json
{
  "version_id": "uuid",
  "version_number": 3,
  "storage_path": "generated/{study_id}/v3-{timestamp}.pptx",
  "download_url": "https://...signed-url",
  "expires_at": "2026-06-18T10:30:00Z",
  "slide_count": 38,
  "file_size_bytes": 2456789,
  "generation_duration_ms": 24000
}
```

### 9.2 GET `/api/studies/:id/versions`

Liste toutes les versions générées.

### 9.3 GET `/api/studies/:id/versions/:version_id`

Détail d'une version + URL de téléchargement signée.

**Response 200** :
```json
{
  "id": "uuid",
  "version_number": 3,
  "status": "completed",
  "download_url": "https://...signed-url?expires=...",
  "expires_at": "...",
  "generation_log": {
    "steps": [
      { "name": "fetch_data", "duration_ms": 800, "status": "ok" },
      { "name": "generate_native_slides", "duration_ms": 4200, "status": "ok" },
      { "name": "inject_external_slides", "duration_ms": 8500, "status": "ok" },
      { "name": "reorder_final", "duration_ms": 1200, "status": "ok" },
      { "name": "upload_to_storage", "duration_ms": 2300, "status": "ok" }
    ]
  }
}
```

### 9.4 POST `/api/studies/:id/versions/:version_id/download-link`

Re-génère une URL signée si l'ancienne a expiré.

**Response 200** :
```json
{
  "download_url": "...",
  "expires_at": "..."
}
```

---

## 10. Stats et analytics

### 10.1 GET `/api/stats/dashboard`

Statistiques globales du tableau de bord utilisateur.

**Response 200** :
```json
{
  "total_studies": 5,
  "completed_studies": 3,
  "drafts": 2,
  "total_pptx_generated": 12,
  "storage_used_mb": 145.2,
  "storage_quota_mb": 8192
}
```

### 10.2 GET `/api/stats/pdm-evolution`

Évolution des PDM AGL inter-études (pour comparaisons).

**Query params** :
- `metier` (obligatoire) : `TIM`, `TEM`, ...
- `period_months` (défaut 12) : période lookback

**Response 200** :
```json
{
  "data": [
    { "period_end": "2026-01-31", "pdm_agl": 7.5 },
    { "period_end": "2026-02-28", "pdm_agl": 7.8 },
    ...
  ]
}
```

---

## 11. Health check

### 11.1 GET `/api/health`

Vérification de santé du service.

**Response 200** :
```json
{
  "status": "ok",
  "version": "2.0.0",
  "services": {
    "supabase": "ok",
    "python_service": "ok",
    "storage": "ok"
  },
  "timestamp": "2026-06-18T09:30:00Z"
}
```

---

## 12. Rate limiting

| Endpoint | Limite |
|----------|--------|
| `/api/auth/*` | 5 req/min par IP |
| `/api/studies/*` (read) | 100 req/min par utilisateur |
| `/api/studies/*` (write) | 30 req/min par utilisateur |
| `/api/generate` | 5 req/min par utilisateur |
| Upload fichiers | 20 req/min par utilisateur |

Headers de réponse :
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1718712600
```

---

## 13. Webhooks (v2.1 futur)

Possibilité d'enregistrer un webhook qui sera notifié à chaque génération complétée.

```json
POST <user_webhook_url>
Content-Type: application/json
X-AGL-Studio-Signature: sha256=...

{
  "event": "study.version.created",
  "data": {
    "study_id": "uuid",
    "version_id": "uuid",
    "version_number": 3,
    "download_url": "..."
  },
  "timestamp": "..."
}
```

---

*Document v1.0 — 18 juin 2026*

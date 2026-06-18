# DATA MODEL — Comité de Direction v2.0

## 1. Schéma Postgres / Supabase

### 1.1 Tables

```sql
-- =============================================
-- Table : users
-- =============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('analyst', 'admin')),
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- =============================================
-- Table : studies (études)
-- =============================================
CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metiers TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'data_uploaded', 'n1_validated',
                          'montage_ready', 'generating', 'completed', 'archived')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_studies_user_id ON studies(user_id);
CREATE INDEX idx_studies_status ON studies(status);
CREATE INDEX idx_studies_period ON studies(period_start, period_end);

-- =============================================
-- Table : study_datasets (données par métier)
-- =============================================
CREATE TABLE study_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL
        CHECK (metier IN ('TIM','TEM','HIMP','HEXP','AER','DSM','PETROLE','MINIER','AYMAN')),
    dataset_type TEXT NOT NULL
        CHECK (dataset_type IN ('concurrents','clients','segments','mensuel',
                                'nouveaux_acteurs','nouvelles_marchandises',
                                'nouveaux_destinataires','kpis_globaux')),
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    parsed_data JSONB NOT NULL DEFAULT '[]',
    row_count INTEGER NOT NULL DEFAULT 0,
    validation_status TEXT DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'valid', 'warnings', 'errors')),
    validation_messages JSONB DEFAULT '[]',
    file_size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (study_id, metier, dataset_type)
);

CREATE INDEX idx_datasets_study_id ON study_datasets(study_id);
CREATE INDEX idx_datasets_metier ON study_datasets(metier);

-- =============================================
-- Table : n1_referentials (référentiels année N-1)
-- =============================================
CREATE TABLE n1_referentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    year INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    parsed_data JSONB NOT NULL DEFAULT '[]',
    entity_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (study_id, metier, year)
);

CREATE INDEX idx_n1_study_id ON n1_referentials(study_id);

-- =============================================
-- Table : n1_aliases (équivalences manuelles N <-> N-1)
-- =============================================
CREATE TABLE n1_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metier TEXT,
    name_n TEXT NOT NULL,
    name_n_minus_1 TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aliases_user ON n1_aliases(user_id);

-- =============================================
-- Table : n1_validation_results (résultats des validations)
-- =============================================
CREATE TABLE n1_validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('transitaire','chargeur','destinataire','marchandise')),
    volume_n NUMERIC,
    volume_n_minus_1 NUMERIC DEFAULT 0,
    match_score NUMERIC,
    matched_name_n_minus_1 TEXT,
    verdict TEXT NOT NULL CHECK (verdict IN ('nouveau','marginal','existant')),
    manual_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_n1_results_study ON n1_validation_results(study_id);

-- =============================================
-- Table : study_external_slides (PPTX externes)
-- =============================================
CREATE TABLE study_external_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    slide_count INTEGER NOT NULL DEFAULT 0,
    thumbnails_metadata JSONB DEFAULT '[]',
    selected_slide_indices INTEGER[] DEFAULT '{}',
    custom_fonts_detected TEXT[] DEFAULT '{}',
    file_size_bytes BIGINT,
    upload_status TEXT DEFAULT 'uploading'
        CHECK (upload_status IN ('uploading', 'processing', 'ready', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_external_study ON study_external_slides(study_id);

-- =============================================
-- Table : study_montage (plan de montage)
-- =============================================
CREATE TABLE study_montage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL UNIQUE REFERENCES studies(id) ON DELETE CASCADE,
    blocks JSONB NOT NULL DEFAULT '[]',
    -- blocks structure :
    -- [
    --   { type: 'cover', enabled: true },
    --   { type: 'sommaire', enabled: true },
    --   { type: 'separator', metier: 'TIM', enabled: true },
    --   { type: 'native', metier: 'TIM', slide_type: 'vue_ensemble', enabled: true },
    --   { type: 'native', metier: 'TIM', slide_type: 'concurrents', enabled: true },
    --   { type: 'external', pptx_id: 'uuid', slide_index: 2, enabled: true },
    --   { type: 'preconisation', metier: 'TIM', enabled: true },
    --   ...
    -- ]
    last_modified_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Table : study_versions (historique générations)
-- =============================================
CREATE TABLE study_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    slide_count INTEGER,
    file_size_bytes BIGINT,
    generation_log JSONB DEFAULT '{}',
    generation_duration_ms INTEGER,
    is_current BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (study_id, version_number)
);

CREATE INDEX idx_versions_study ON study_versions(study_id);

-- Trigger : marquer les anciennes versions comme is_current = false
CREATE OR REPLACE FUNCTION set_current_version() RETURNS TRIGGER AS $$
BEGIN
    UPDATE study_versions
    SET is_current = FALSE
    WHERE study_id = NEW.study_id AND id != NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_current_version
    AFTER INSERT ON study_versions
    FOR EACH ROW EXECUTE FUNCTION set_current_version();

-- =============================================
-- Table : study_preconisations
-- =============================================
CREATE TABLE study_preconisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
    metier TEXT NOT NULL,
    horizon TEXT NOT NULL CHECK (horizon IN ('12_mois', '24_mois')),
    vision_marche JSONB DEFAULT '[]',
    -- vision_marche structure :
    -- [ { point: '...', metrique: '+...', priorite: 'haute' }, ... ]
    positionnement_agl JSONB DEFAULT '[]',
    segments_cibles JSONB DEFAULT '[]',
    risques_surveillance JSONB DEFAULT '[]',
    synthese_expert TEXT,
    source_excel_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (study_id, metier)
);

CREATE INDEX idx_preconisations_study ON study_preconisations(study_id);

-- =============================================
-- Table : audit_log (traçabilité actions utilisateur)
-- =============================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

## 2. Triggers d'auto-update

```sql
-- Auto-update updated_at sur toutes les tables
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_studies_updated_at BEFORE UPDATE ON studies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_datasets_updated_at BEFORE UPDATE ON study_datasets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_external_updated_at BEFORE UPDATE ON study_external_slides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_montage_updated_at BEFORE UPDATE ON study_montage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_preconisations_updated_at BEFORE UPDATE ON study_preconisations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 3. RLS Policies (Row Level Security)

```sql
-- =============================================
-- Activer RLS sur toutes les tables
-- =============================================
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_referentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE n1_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_external_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_montage ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_preconisations ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Policies : un utilisateur ne voit que ses propres données
-- =============================================
CREATE POLICY "users_view_own_studies" ON studies
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_studies" ON studies
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_studies" ON studies
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_studies" ON studies
    FOR DELETE USING (auth.uid() = user_id);

-- Pattern réutilisable pour tables dépendantes (via study_id)
CREATE POLICY "users_access_own_datasets" ON study_datasets
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_n1_referentials" ON n1_referentials
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_aliases" ON n1_aliases
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_access_own_n1_results" ON n1_validation_results
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_external" ON study_external_slides
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_montage" ON study_montage
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_versions" ON study_versions
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

CREATE POLICY "users_access_own_preconisations" ON study_preconisations
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM studies WHERE id = study_id)
    );

-- =============================================
-- Policies admin : accès complet
-- =============================================
CREATE POLICY "admins_see_all" ON studies
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
```

## 4. Storage Buckets

```sql
-- Buckets à créer via Supabase Dashboard ou API
-- (Pas de SQL pour création buckets, c'est via REST API)

-- datasets : CSV/XLSX uploadés
-- external-pptx : PPTX externes injectables
-- external-thumbnails : PNG thumbnails (publics)
-- generated : PPTX finaux générés
-- preconisations : Excel préconisations
-- templates : Templates métier (futur)

-- Policies bucket (à appliquer via Dashboard Supabase) :
-- datasets : { authenticated users can upload + read own files }
-- external-pptx : idem
-- generated : idem + signed URLs avec expiration 1h
-- external-thumbnails : public read, authenticated write
```

## 5. Format des `parsed_data` (JSONB)

### 5.1 Concurrents

```json
{
  "type": "concurrents",
  "metier": "TIM",
  "periode": { "debut": "2026-01-01", "fin": "2026-05-31" },
  "unite": "TEU",
  "data": [
    { "rang": 1, "nom": "AFRICA GLOBAL LOGISTICS", "volume": 15133, "pdm": 7.8 },
    { "rang": 2, "nom": "STRACOTRANS CI", "volume": 14575, "pdm": 7.5 },
    ...
  ]
}
```

### 5.2 Clients (Top N)

```json
{
  "type": "clients",
  "metier": "TIM",
  "periode": { "debut": "2026-01-01", "fin": "2026-05-31" },
  "data": [
    {
      "nom": "K1 MINING SA CI",
      "volume": 1531,
      "segment": "Matériels Miniers",
      "pct_vol_agl": 10.1
    },
    ...
  ]
}
```

### 5.3 Segments / Marchandises

```json
{
  "type": "segments",
  "metier": "TIM",
  "data": [
    { "nom": "Matériels Miniers", "volume_marche": 3015, "pdm_agl": 74 },
    ...
  ]
}
```

### 5.4 KPIs mensuels

```json
{
  "type": "mensuel",
  "metier": "TIM",
  "data": [
    { "mois": "Janvier", "volume_marche": 41800, "volume_agl": 3470, "pdm_agl": 8.3 },
    { "mois": "Février", "volume_marche": 36800, "volume_agl": 2544, "pdm_agl": 6.9 },
    ...
  ]
}
```

### 5.5 Nouveaux acteurs (sortie validation N-1)

```json
{
  "type": "nouveaux_acteurs",
  "metier": "TIM",
  "data": [
    {
      "nom": "ATLANTIQUE TRANSIT CI",
      "volume": 3820,
      "rang": 11,
      "specialite": "Emball. / Plastiques",
      "verdict_n1": "nouveau",
      "score_match": 0.0,
      "match_n1": null
    },
    ...
  ]
}
```

## 6. Migrations Supabase

```bash
# Structure attendue
comite-de-direction/
└── supabase/
    ├── migrations/
    │   ├── 20260618_000_initial_schema.sql
    │   ├── 20260618_001_rls_policies.sql
    │   ├── 20260618_002_triggers.sql
    │   └── 20260618_003_seed_data.sql
    └── seed.sql
```

## 7. Données d'exemple (seed)

```sql
-- seed.sql — données de démo Olivier
INSERT INTO users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000001',
        'olivier.germanos@aglgroup.com',
        'Olivier Germanos',
        'admin');

-- Aliases connus pour le matching N-1
INSERT INTO n1_aliases (user_id, name_n, name_n_minus_1, notes) VALUES
    ('00000000-0000-0000-0000-000000000001',
     'CEVA LOGISTICS CI', 'CEVA CI', 'Variante orthographique'),
    ('00000000-0000-0000-0000-000000000001',
     'TGR', 'TRANSIT GENERAL RAPIDE', 'Acronyme'),
    ('00000000-0000-0000-0000-000000000001',
     'GENERAL TRANSIT CI', 'GENERAL TRANSIT', 'Variante');
```

## 8. Indexes de performance

```sql
-- Recherche full-text sur noms entités
CREATE INDEX idx_n1_results_entity_name_trgm
    ON n1_validation_results USING gin (entity_name gin_trgm_ops);

-- Recherche datasets par contenu JSON
CREATE INDEX idx_datasets_parsed_data
    ON study_datasets USING gin (parsed_data);

-- Recherche études par tableau metiers
CREATE INDEX idx_studies_metiers
    ON studies USING gin (metiers);
```

## 9. Vues utilitaires

```sql
-- Vue : statistiques par étude
CREATE VIEW v_study_stats AS
SELECT
    s.id,
    s.title,
    s.status,
    COUNT(DISTINCT sd.id) AS dataset_count,
    COUNT(DISTINCT ses.id) AS external_pptx_count,
    COUNT(DISTINCT sv.id) AS version_count,
    MAX(sv.created_at) AS last_generated_at,
    s.created_at
FROM studies s
LEFT JOIN study_datasets sd ON sd.study_id = s.id
LEFT JOIN study_external_slides ses ON ses.study_id = s.id
LEFT JOIN study_versions sv ON sv.study_id = s.id
GROUP BY s.id;

-- Vue : comparaison PDM AGL inter-études
CREATE VIEW v_pdm_evolution AS
SELECT
    s.id AS study_id,
    s.title,
    s.period_start,
    s.period_end,
    sd.metier,
    (sd.parsed_data->0->>'pdm')::numeric AS pdm_agl
FROM studies s
JOIN study_datasets sd ON sd.study_id = s.id
WHERE sd.dataset_type = 'concurrents'
  AND sd.parsed_data->0->>'nom' = 'AFRICA GLOBAL LOGISTICS';
```

---

*Document v1.0 — 18 juin 2026*

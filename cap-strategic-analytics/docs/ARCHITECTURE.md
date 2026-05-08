# Architecture technique — CAP Strategic Analytics

## Vue d'ensemble

L'application est un **single-file HTML autonome** (~115 Ko) avec toutes les dépendances chargées via CDN. Aucun build, aucun framework. Vanilla JS pour un maximum de portabilité.

## Diagramme général

```
┌─────────────────────────────────────────────────────────────┐
│                    index.html (115 Ko)                       │
│                                                              │
│  ┌────────────────┐                                          │
│  │  HEAD          │ ──→ Manifest PWA, CDN, CSS               │
│  └────────────────┘                                          │
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │  BODY                                       │              │
│  │  ├── #app (caché au démarrage)              │              │
│  │  │   ├── Header (logo, titre, actions)      │              │
│  │  │   ├── Slicers bar (Année/Site/Métier)    │              │
│  │  │   ├── Sidebar (navigation 9 pages)       │              │
│  │  │   └── Content (page active)              │              │
│  │  └── #upload-screen (visible au démarrage)  │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │  10 SCRIPTS (ordre crucial)                 │              │
│  │  1-4. Librairies CDN                        │              │
│  │  5. js-engine     : Upload + parsing        │              │
│  │  6. js-calculator : 48 mesures (CALC.*)     │              │
│  │  7. js-ui-core    : Layout + nav            │              │
│  │  8. js-pages-1    : Pages 0-3               │              │
│  │  9. js-pages-2    : Pages 4-7               │              │
│  │  10. js-pages-3   : Page 8 + What-If        │              │
│  └────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## Flux de données

```
1. UPLOAD
   User glisse fichier .xlsx
   ↓
2. PARSING (js-engine)
   XLSX.read() → workbook
   detectSchema(headers) → mapping flexible des colonnes
   cleanRow(row) × N → APP.data.fact
   ↓
3. VALIDATION
   Affichage rapport (lignes valides, colonnes mappées)
   User clique "Lancer l'analyse"
   ↓
4. UI CONSTRUCTION (js-ui-core)
   buildApp() → layout
   buildSidebar() → navigation
   buildSlicers() → filtres globaux
   ↓
5. APPLY FILTERS
   APP.filters → filtre APP.data.fact → APP.filtered
   aggregateByClient() → APP.clientsAgg
   precomputeStats() + computePercentiles() → 1 seule fois
   forEach client : score, tier, quadrant, healthScore
   ↓
6. RENDER PAGE
   render_<id>() → innerHTML innerHTML du div page
   Charts via Chart.js / Plotly
```

## Objet global APP

```javascript
APP = {
  data: {
    fact: [],          // Toutes les transactions (jamais filtrées)
    dimClients: [],    // Si onglet DIM_CLIENTS présent
    dimLibelles: []    // Si onglet DIM_LIBELLES présent
  },
  schema: {},          // Mapping détecté { MONTANT: "MONTAN", CLIENT: "CLIENTS"... }
  filtered: [],        // Lignes après application des slicers
  clientsAgg: [],      // Aggregation par client (avec scores, tiers, quadrants)
  filters: {           // État courant des slicers
    ANNEE: 2026,
    SITE: 'Tout',
    METIER: 'Tout'
  },
  currentPage: 'cockpit',
  whatif: {            // État des sliders What-If (page 8)
    croissance: 0,
    top10: 0,
    saison: 1
  },
  horizon: 12,         // Horizon forecast en mois
  charts: {}           // Références Chart.js pour destroy()
}
```

## Module Calculator (objet CALC)

Toutes les mesures sont dans l'objet `CALC.*` pour éviter le pollution du global scope.

### Patterns d'optimisation utilisés

**Pattern 1 — Pre-computation**
Au lieu de recalculer dans une boucle :
```javascript
// ❌ MAUVAIS : O(n²)
clients.forEach(c => {
  const max = Math.max(...clients.map(x => x.CA));  // recalculé n fois
});

// ✅ BON : O(n)
const max = clients.reduce((m, c) => c.CA > m ? c.CA : m, 0);
clients.forEach(c => {
  // utiliser max directement
});
```

**Pattern 2 — Pas de spread sur grand tableau**
```javascript
// ❌ MAUVAIS : stack overflow >100k
Math.max(...arr.map(x => x.val));

// ✅ BON :
arr.reduce((m, x) => x.val > m ? x.val : m, 0);
```

**Pattern 3 — Map pré-grouping**
```javascript
// ❌ MAUVAIS : O(N×M)
clients.forEach(c => {
  const rows = data.filter(r => r.CLIENT === c.name);  // O(N) à chaque itération
});

// ✅ BON : O(N+M)
const rowsByClient = {};
data.forEach(r => {
  (rowsByClient[r.CLIENT] = rowsByClient[r.CLIENT] || []).push(r);
});
clients.forEach(c => {
  const rows = rowsByClient[c.name] || [];
});
```

## Charts utilisés

| Type | Librairie | Pages |
|---|---|---|
| Bar (groupé) | Chart.js | Cockpit, Geo |
| Bar (horizontal) | Chart.js | Geo |
| Line (multi) | Chart.js | Forecast |
| Combo (bar+line) | Chart.js | Pareto |
| Scatter | Plotly | Portfolio (9-box) |
| Heatmap (CSS) | Custom | Cohorts |

## Performance attendue

Sur dataset de 156 000 lignes (volume IRIS réel) :
- Parsing initial : ~500ms
- applyFilters() complet : <100ms
- Render page : <200ms
- Total UX : interaction instantanée

## Stratégie de sécurité

1. **Pas de localStorage par défaut** : option opt-in via case à cocher
2. **Pas d'envoi réseau** : tout reste local au navigateur
3. **Pas d'eval()** : pas de risque XSS via les données
4. **HTML escape** : à vérifier sur les noms de clients (TODO V1.1)

## Stratégie de mise à jour

Pour ajouter une page ou une mesure :
1. Ajouter la mesure dans `js-calculator` (CALC.*)
2. Ajouter la page dans `PAGES[]` (js-ui-core)
3. Créer `function render_<id>()` dans le module pages approprié
4. Tester via `npm run test:syntax` puis ouverture navigateur

## Stratégie de tests

- **Syntaxe JS** : `tests/validate_syntax.js` — extrait tous les blocks `<script>` et tente `new Function(content)` pour détecter les erreurs syntaxe
- **Performance** : `tests/perf_test.js` — simule 156k lignes et mesure les temps de chaque étape critique

## Limites connues

- **localStorage limit** : ~5 MB par domaine. Si data > 5 MB, fallback à mémoire RAM seulement
- **Plotly bundle** : ~3 MB en CDN, charge ~1s la première fois
- **IE11** : non supporté (ES6+ requis)
- **Mobile** : fonctionnel mais expérience optimisée pour desktop ≥1100px

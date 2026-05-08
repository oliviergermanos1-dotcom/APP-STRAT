# Roadmap — CAP Strategic Analytics

> Évolutions planifiées de l'application. Chaque feature peut être abordée avec Claude Code.

---

## 🎯 V1.0 — État actuel (livré Mai 2026)

### ✅ Fonctionnalités présentes

- [x] 9 pages d'analyse stratégique
- [x] 48 mesures DAX traduites en JS
- [x] Auto-détection flexible des colonnes Excel
- [x] Mode démo intégré (génération données fictives)
- [x] LocalStorage optionnel
- [x] Charte AGL (Navy + Or)
- [x] Single-file HTML 100% portable
- [x] Forecast multi-horizon (3/6/12/24 mois)
- [x] What-If interactif (3 sliders)
- [x] PWA installable
- [x] Export PDF (via Ctrl+P)
- [x] Optimisations performance (testé sur 156k lignes)

---

## 🚀 V1.1 — Court terme (1-2 semaines)

### 🔝 Priorité haute

- [ ] **Filtre client autocomplete** : recherche par nom dans la slicer bar
- [ ] **Drill-through client** : clic sur un nom de client → vue 360°
- [ ] **Export Excel par page** : bouton sur chaque tableau
- [ ] **Tooltips explicatifs** : sur chaque KPI, expliquer la formule
- [ ] **HTML escape** : sécuriser l'affichage des noms (XSS prevention)

### 🟡 Priorité moyenne

- [ ] **Filtre par métier multi-sélection** (au lieu de "Tout" ou "1 métier")
- [ ] **Tri colonnes tableaux** : clic sur en-tête pour trier
- [ ] **Pagination tableaux** : pour gérer >200 clients
- [ ] **Recherche globale** : barre de recherche en haut

---

## 🎯 V1.2 — Court/moyen terme (3-4 semaines)

- [ ] **Comparateur 2 périodes** : page dédiée avec 2 slicers Année
- [ ] **Mode dark / light** : toggle dans le header
- [ ] **Sauvegarde de filtres favoris** : "Mes vues" enregistrées
- [ ] **Annotations** : possibilité d'ajouter des commentaires sur un KPI
- [ ] **Page "Commercial Performance"** : si COMMERCIAL bien rempli
- [ ] **Heatmap mensuelle** : Cockpit, voir les pics

---

## 🌟 V1.5 — Moyen terme (1-2 mois)

### Module Fournisseurs
- [ ] Si données fournisseurs disponibles, dupliquer la logique CAP côté achats
- [ ] Vue marges (CAP - coûts fournisseurs) si possible

### Module Objectifs
- [ ] Saisie d'objectifs commerciaux par KAM (UI dédiée)
- [ ] Calcul atteinte des objectifs (% real vs target)
- [ ] Page "Performance commerciale" par KAM

### Module Alertes
- [ ] Système d'alertes paramétrable (seuils personnalisables)
- [ ] Export liste d'alertes en Excel pour traitement
- [ ] (Si déployé serveur) emails automatiques quotidiens

---

## 🤖 V2.0 — Moyen/long terme (3-6 mois)

### Forecasting niveau 3
- [ ] **Holt-Winters explicit** en JS (au lieu de CAGR + saison)
- [ ] **ARIMA simple** pour comparer
- [ ] **Affichage intervalle de confiance** dynamique (95%, 80%, 50%)

### Détection d'anomalies
- [ ] **Z-score sur transactions** : repérer les valeurs aberrantes
- [ ] **Pattern matching** : détecter des comportements similaires entre clients
- [ ] **Page "Anomalies"** dédiée

### Machine Learning léger
- [ ] **Prédiction de churn par client** : modèle simple (régression logistique)
- [ ] **Score de propension** au cross-sell
- [ ] **Clustering automatique** des clients (K-means)

### Intégrations
- [ ] **Connexion Dynamics 365 CRM** (si autorisé par AGL DSI)
- [ ] **Export vers Power BI** (.pbix)
- [ ] **Webhook pour mise à jour auto** des données

---

## 🌐 V3.0 — Vision long terme (6-12 mois)

### Architecture multi-utilisateurs
- [ ] **Backend Supabase** avec RLS par KAM
- [ ] **Auth multi-rôles** : Admin, KAM, Marketing, Direction
- [ ] **Partage de vues** entre utilisateurs
- [ ] **Historique d'actions** (audit trail)

### Mobile
- [ ] **App native** (React Native ou Flutter)
- [ ] **Push notifications** sur alertes critiques
- [ ] **Mode offline** complet

### IA générative
- [ ] **Briefing automatique** quotidien (intégration JARVIS)
- [ ] **Q&A en langage naturel** : "Quel est mon top client en croissance ?"
- [ ] **Recommandations IA** : actions commerciales suggérées par client
- [ ] **Génération de rapports COMEX** automatique

### Analytics avancés
- [ ] **Lifetime Value (LTV)** prévisionnelle par client
- [ ] **Cost of Acquisition (CAC)** estimé
- [ ] **NPS / CSAT** intégration si données disponibles
- [ ] **Heatmap géographique CI/Afrique** (Mapbox)

---

## 📋 Backlog d'idées non priorisées

- Multi-langue (anglais, espagnol pour BU internationales)
- Mode présentation plein écran avec auto-rotate des pages
- Comparaison vs benchmark sectoriel (logistique Afrique)
- Module "What if competitive" : impact perte de gros client
- Intégration calendrier : événements clés (élections, saison cacao, etc.)
- Module ESG (impact carbone par site)
- Suivi des litiges / contentieux clients

---

## 🔄 Versions et compatibilité

| Version | Date | Status | Note |
|---|---|---|---|
| V1.0 | Mai 2026 | ✅ Live | Version initiale, 9 pages |
| V1.1 | Juin 2026 | 🟡 Planifiée | Drill-through + filtres avancés |
| V1.5 | Été 2026 | 🟡 Planifiée | Module objectifs |
| V2.0 | Automne 2026 | 🔵 Vision | ML + Forecast avancé |
| V3.0 | 2027 | 🔵 Vision | Multi-users + Mobile |

---

## 🎯 Critères de priorisation

Pour décider quoi développer ensuite :

1. **Impact COMEX** : Est-ce que ça aide une décision stratégique ?
2. **Effort technique** : Combien de temps de développement ?
3. **Données disponibles** : Avons-nous les données pour faire ça ?
4. **Adoption KAM** : Est-ce que les commerciaux vont vraiment l'utiliser ?
5. **Différenciation** : Est-ce que ça apporte un avantage concurrentiel à AGL ?

> Règle d'or : **mieux vaut une feature parfaitement exécutée que dix features bâclées**.

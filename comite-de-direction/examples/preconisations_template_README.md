# EXEMPLE FORMAT EXCEL — Préconisations par métier

Le fichier Excel doit contenir **une feuille par métier** nommées exactement :
- `TIM`
- `TEM`
- `HIMP`
- `HEXP`
- `AER`

Et optionnellement :
- `SYNTHESE` (préconisations transversales globales)

Chaque feuille doit avoir les colonnes suivantes (en ligne 1) :

| Colonne | Type | Obligatoire | Description |
|---------|------|-------------|-------------|
| `axe` | string | ✓ | "Vision Marché" / "Positionnement AGL" / "Segments Cibles" / "Risques" / "Synthèse" |
| `horizon` | string | ✓ | "12 mois" ou "24 mois" |
| `point_cible` | string | ✓ | Énoncé du point à analyser (court, max 200 caractères) |
| `donnee_quantitative` | string | ✗ | Métrique chiffrée si disponible (ex: "+860 TEU/an cible Cajou") |
| `priorite` | string | ✓ | "Haute" / "Moyenne" / "Basse" |
| `commentaire_expert` | string | ✗ | Note libre de l'expert (max 500 caractères) |

## Exemple feuille `TIM`

| axe | horizon | point_cible | donnee_quantitative | priorite | commentaire_expert |
|-----|---------|-------------|---------------------|----------|---------------------|
| Vision Marché | 12 mois | Croissance modérée du marché TIM (+3% attendu) | 199 800 TEU prévus 2026 vs 193 989 réalisés Jan-Mai | Moyenne | Effet base Apuré reste solide, contraction Non Apuré devrait s'atténuer |
| Vision Marché | 12 mois | Pression concurrentielle accrue de CEVA Logistics | CEVA #14 en 5 mois, croissance ×3 anticipée | Haute | Surveiller dès Q3 2026, plan défensif sur multi-segments |
| Vision Marché | 24 mois | Effet ZLECAf sur les flux régionaux | Volumes inter-pays africains attendus +15-20% | Haute | Opportunité pour réseau hinterland AGL en complément TIM |
| Positionnement AGL | 12 mois | Consolider le rang #1 face à STRACOTRANS | Écart actuel +558 TEU à porter à +2000 TEU | Haute | Plan commercial dédié K1 Mining + UBIPHARM (clients haute valeur) |
| Positionnement AGL | 12 mois | Verrouiller les filières fortes (Matériels Miniers, Médicaments) | 74% PDM Miniers, 50% PDM Médicaments | Haute | Contrats cadres 24 mois minimum à signer Q3 2026 |
| Positionnement AGL | 24 mois | Développer offre intégrée multi-métiers | Cible : 30% des clients sur 3+ métiers | Moyenne | Cross-sell prioritaire SITAB, UBIPHARM, SOLIBRA |
| Segments Cibles | 12 mois | Télécommunications (effet 5G CI) | Marché 1 240 TEU, PDM 9% | Haute | MTN, Orange, Moov à fidéliser ; partenariats équipementiers |
| Segments Cibles | 12 mois | Fertilisants (relance agricole gouvernementale) | Marché 650 TEU, PDM 4% | Moyenne | Approche Yara, OCP, plan PND |
| Segments Cibles | 24 mois | Matériaux Construction (PND 2026-2030) | Marché 5 478 TEU, PDM 18% | Haute | Doubler PDM à 35% via SOCIMAT, SCB, OLAM HOUSING |
| Risques | 12 mois | Déploiement multi-métiers CEVA Logistics | Présent TIM + HIMP + HEXP en 5 mois | Haute | Réponse coordonnée multi-métiers, plan tarifaire défensif |
| Risques | 12 mois | Hyper-concentration sur K1 Mining (10.1%) | Risque client unique | Moyenne | Développer 2 comptes Mining équivalents (Sama Nickel, Lithium CI) |
| Risques | 24 mois | Pression sur les marges due à la concurrence chinoise | Sinotrans CI en croissance silencieuse | Moyenne | Surveiller, étude de positionnement Q4 2026 |
| Synthèse | 12 mois | Maintenir leadership TIM tout en élargissant l'assise client | — | Haute | Plan en 3 axes : verrouillage filières fortes + développement nouvelles + défense vs CEVA |

## Notes importantes

1. **Ordre des axes dans la slide générée** :
   - Quadrant haut-gauche : Vision Marché
   - Quadrant haut-droit : Positionnement AGL
   - Quadrant bas-gauche : Segments Cibles
   - Quadrant bas-droit : Risques
   - Insight box en bas : Synthèse

2. **Limite par quadrant** : 3 à 4 points par axe maximum (sinon illisible).

3. **Tri automatique par priorité** : Haute → Moyenne → Basse dans chaque quadrant.

4. **Horizon mixte** : un quadrant peut contenir des points avec horizons différents (12 et 24 mois). L'horizon affiché dans le header de la slide est celui dominant.

5. **Champ `commentaire_expert`** : affiché en survol ou repris dans les notes du PPTX.

## Exemple feuille `SYNTHESE` (transversal optionnel)

| axe | horizon | point_cible | donnee_quantitative | priorite | commentaire_expert |
|-----|---------|-------------|---------------------|----------|---------------------|
| Vision Marché | 12 mois | Marché logistique CI en croissance globale +4-5% | PND 2026-2030 booste BTP + Mining | Haute | Tous métiers AGL en bénéficient |
| Positionnement AGL | 12 mois | Renforcer la position transversale via cross-sell | Cible : 25% des grands comptes multi-métiers | Haute | Focus 10 comptes prioritaires |
| Segments Cibles | 24 mois | Pôle Lithium émergent | Lithium CI Q4 2026 production prévue | Haute | Premier mover advantage |
| Risques | 12 mois | Concentration CEVA Logistics sur multi-métiers | Stratégie d'attaque coordonnée groupe CMA CGM | Haute | Réponse stratégique commune indispensable |
| Synthèse | 12 mois | AGL doit consolider sa position dominante par stratégie intégrée | — | Haute | 3 enjeux : défendre TIM, accélérer HIMP, sécuriser TEM/HEXP |

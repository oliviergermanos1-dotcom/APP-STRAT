# N-1 VALIDATION LOGIC — Algorithme de validation Nouveaux Entrants

> Spécification détaillée de l'algorithme de validation anti-faux-nouveaux entrants pour les études AGL.

---

## 1. Problème métier

Lors de la construction des slides "Nouveaux entrants", un acteur identifié comme nouveau sur la période courante (ex: Jan–Mai 2026) peut en réalité avoir été présent sur l'année précédente complète (2025) — il était simplement absent ou avec peu de volume au début de 2026.

**Risque** : présenter au CODIR des "faux nouveaux entrants" → étude moins crédible.

**Solution** : croiser systématiquement chaque candidat "nouveau" avec un référentiel N-1 complet (12 mois) avant validation.

---

## 2. Définition des verdicts

| Verdict | Condition | Action |
|---------|-----------|--------|
| **`nouveau`** | Absent du référentiel N-1 (introuvable) OU volume N-1 = 0 | ✅ Conserver dans la slide |
| **`marginal`** | Présent en N-1 mais volume < 30% du volume N | ⚠ Conserver avec mention "montée en puissance" |
| **`existant`** | Présent en N-1 avec volume ≥ 30% du volume N | ❌ Exclure de la slide |

### 2.1 Cas spécial pour les marchandises

Pour les "nouvelles marchandises captées" (slides 7, 12, 16, 24), une marchandise déjà présente en N-1 mais avec une croissance ≥ +30% peut être qualifiée de "nouveau dynamique" et rester dans la slide.

```
Si marchandise présente en N-1 :
  Si (volume_N - volume_N-1) / volume_N-1 >= 0.30 :
    verdict = "nouveau"  # croissance forte
  Sinon :
    verdict = "existant"  # stable, à exclure
```

---

## 3. Algorithme de matching

### 3.1 Vue d'ensemble

```python
def valider_nouveaux_entrants(
    candidats_n: List[Entity],
    referentiel_n_minus_1: List[Entity],
    aliases: List[Alias] = None,
    seuil_similarity: float = 0.72,
    seuil_marginal: float = 0.30,
    type_validation: str = 'acteurs'  # ou 'marchandises'
) -> List[ValidationResult]:
    """
    Valide chaque candidat contre le référentiel N-1.

    Args:
        candidats_n : liste des entités à valider (Entity = {nom, volume, ...})
        referentiel_n_minus_1 : référentiel complet de l'année précédente
        aliases : équivalences manuelles (ex: "TGR" <-> "TRANSIT GENERAL RAPIDE")
        seuil_similarity : seuil de matching fuzzy (0.0 à 1.0)
        seuil_marginal : ratio de volume sous lequel un présent est considéré marginal
        type_validation : 'acteurs' ou 'marchandises' (règle différente)

    Returns:
        Liste de ValidationResult avec verdict pour chaque candidat
    """
    results = []
    aliases_dict = _build_aliases_dict(aliases) if aliases else {}

    for candidat in candidats_n:
        # Étape 1 : Vérifier dans aliases d'abord (équivalences manuelles)
        alias_match = _check_alias(candidat.nom, aliases_dict, referentiel_n_minus_1)
        if alias_match:
            best_match = alias_match
            best_score = 1.0
        else:
            # Étape 2 : Matching fuzzy automatique
            best_match, best_score = _find_best_match(
                candidat.nom,
                referentiel_n_minus_1
            )

        # Étape 3 : Déterminer le verdict
        verdict = _determine_verdict(
            candidat,
            best_match,
            best_score,
            seuil_similarity,
            seuil_marginal,
            type_validation
        )

        results.append(ValidationResult(
            entity_name=candidat.nom,
            volume_n=candidat.volume,
            volume_n_minus_1=best_match.volume if best_match else 0,
            match_score=best_score,
            matched_name=best_match.nom if best_match else None,
            verdict=verdict
        ))

    return results
```

### 3.2 Normalisation des noms

```python
import unicodedata
import re

def normalize_name(name: str) -> str:
    """
    Normalise un nom d'entité pour comparaison robuste.

    Étapes :
    1. NFD decomposition (sépare lettre + accent)
    2. Suppression des diacritiques
    3. Lowercase
    4. Remplacement non-alphanumériques par espaces
    5. Collapse espaces multiples
    """
    # 1. NFD decomposition
    nfd = unicodedata.normalize('NFD', name)

    # 2. Suppression diacritiques (catégorie Mn = Mark, nonspacing)
    no_accents = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')

    # 3. Lowercase
    lower = no_accents.lower()

    # 4. Remplace non-alphanum par espace
    clean = re.sub(r'[^a-z0-9]', ' ', lower)

    # 5. Collapse espaces multiples
    return re.sub(r'\s+', ' ', clean).strip()
```

**Exemples** :
- `"CEVA LOGISTICS CI"` → `"ceva logistics ci"`
- `"Côte d'Ivoire Énergies"` → `"cote d ivoire energies"`
- `"K1 MINING SA CI"` → `"k1 mining sa ci"`
- `"DJAM DKS TRANSIT"` → `"djam dks transit"`

### 3.3 Fonction de similarité

```python
def similarity_score(name_a: str, name_b: str) -> float:
    """
    Calcule un score de similarité entre 0.0 et 1.0.

    Stratégie multi-passes :
    1. Match exact après normalisation → 1.0
    2. Containment (l'un contient l'autre) → 0.85
    3. Jaccard sur tokens significatifs (≥ 3 caractères)
    """
    norm_a = normalize_name(name_a)
    norm_b = normalize_name(name_b)

    # 1. Match exact
    if norm_a == norm_b:
        return 1.0

    # 2. Containment
    if norm_a in norm_b or norm_b in norm_a:
        return 0.85

    # 3. Jaccard sur tokens
    tokens_a = set(t for t in norm_a.split() if len(t) >= 3)
    tokens_b = set(t for t in norm_b.split() if len(t) >= 3)

    if not tokens_a or not tokens_b:
        return 0.0

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b

    jaccard = len(intersection) / len(union)
    return jaccard
```

**Exemples de scores** :
- `"CEVA LOGISTICS CI"` vs `"CEVA CI"` → `0.85` (containment)
- `"GENERAL TRANSIT CI"` vs `"GENERAL TRANSIT"` → `0.85` (containment)
- `"DJAM DKS TRANSIT"` vs `"DJAM DKS"` → `0.85`
- `"K1 MINING SA CI"` vs `"K1 MINING"` → `0.85`
- `"STRACOTRANS CI"` vs `"STRACOTRANS"` → `0.85`
- `"AFRICA GLOBAL LOGISTICS"` vs `"AFRICA SOURCING"` → Jaccard = 1/3 ≈ `0.33` (un seul token "africa" en commun, 3 tokens en union)
- `"NESTLE CI"` vs `"NESTLE COTE D IVOIRE"` → `0.85` (containment) ou Jaccard = 1/4 = `0.25` si normalisation différente

### 3.4 Gestion des aliases manuels

Table `n1_aliases` permet à l'utilisateur d'enregistrer des équivalences custom qui forcent un match à score 1.0 :

```python
def check_alias(
    candidat_nom: str,
    aliases_dict: dict,
    referentiel: List[Entity]
) -> Optional[Entity]:
    """
    Vérifie si une équivalence manuelle existe pour ce nom.
    Si oui, retourne l'entité référentielle équivalente.
    """
    norm_candidat = normalize_name(candidat_nom)

    # aliases_dict : { normalized_name_n : normalized_name_n_minus_1 }
    if norm_candidat in aliases_dict:
        equiv_name = aliases_dict[norm_candidat]
        # Trouver dans le référentiel l'entité correspondante
        for ref_entity in referentiel:
            if normalize_name(ref_entity.nom) == normalize_name(equiv_name):
                return ref_entity

    return None
```

**Cas pré-renseignés (seed BDD)** :

| name_n | name_n_minus_1 | Notes |
|--------|----------------|-------|
| `CEVA LOGISTICS CI` | `CEVA CI` | Variante orthographique |
| `TGR` | `TRANSIT GENERAL RAPIDE` | Acronyme |
| `GENERAL TRANSIT CI` | `GENERAL TRANSIT` | Suffix CI ajouté/retiré |
| `CARGILL COCOA SA` | `CARGILL COCOA` | Évolution raison sociale |

---

## 4. Détermination du verdict

```python
def determine_verdict(
    candidat: Entity,
    best_match: Optional[Entity],
    best_score: float,
    seuil_similarity: float,
    seuil_marginal: float,
    type_validation: str
) -> str:
    """
    Détermine le verdict final à partir du match.
    """
    # Aucun match trouvé ou score insuffisant
    if best_match is None or best_score < seuil_similarity:
        return 'nouveau'

    # Match trouvé mais volume N-1 = 0 (entité existait en référentiel mais sans activité)
    if best_match.volume == 0:
        return 'nouveau'

    # Calcul du ratio
    if type_validation == 'marchandises':
        # Pour marchandises : croissance ≥ +30% = nouveau
        croissance = (candidat.volume - best_match.volume) / best_match.volume
        if croissance >= 0.30:
            return 'nouveau'
        else:
            return 'existant'
    else:
        # Pour acteurs : ratio volume N-1 / volume N
        ratio = best_match.volume / candidat.volume
        if ratio < seuil_marginal:  # 0.30 par défaut
            return 'marginal'
        else:
            return 'existant'
```

---

## 5. Exemples concrets

### 5.1 Exemple TIM 2026

**Candidats nouveaux entrants TIM 2026** :
```
ATLANTIQUE TRANSIT CI    3820 TEU
WESTAFRICA LOG. CI       3410 TEU
IVOIRE TRANSIT RAPID     3180 TEU
CEVA LOGISTICS CI        2950 TEU
SOCOPHAR TRANSIT         2640 TEU
```

**Référentiel TIM N-1 (extrait)** :
```
STRACOTRANS CI           32 410 TEU
TGR                      30 200 TEU
ATLANTIQUE TRANSIT CI         0 TEU  (existait mais 0 activité)
WESTAFRICA LOG. CI            0 TEU
IVOIRE TRANSIT RAPID          0 TEU
CEVA CI                    1 200 TEU  (alias → CEVA LOGISTICS CI)
SOCOPHAR TRANSIT             580 TEU
```

**Validations** :

| Candidat 2026 | Match N-1 | Score | Volume N-1 | Verdict |
|---------------|-----------|-------|------------|---------|
| ATLANTIQUE TRANSIT CI | ATLANTIQUE TRANSIT CI | 1.0 | 0 | `nouveau` |
| WESTAFRICA LOG. CI | WESTAFRICA LOG. CI | 1.0 | 0 | `nouveau` |
| IVOIRE TRANSIT RAPID | IVOIRE TRANSIT RAPID | 1.0 | 0 | `nouveau` |
| CEVA LOGISTICS CI | CEVA CI (via alias) | 1.0 | 1 200 | `marginal` (1200/2950 = 0.41 > 0.30 → en fait `existant`) |
| SOCOPHAR TRANSIT | SOCOPHAR TRANSIT | 1.0 | 580 | `marginal` (580/2640 = 0.22 < 0.30 → `marginal`) |

**Recalcul CEVA** : 1200/2950 = 0.407 → ratio > 0.30 → verdict `existant`
**Recalcul SOCOPHAR** : 580/2640 = 0.220 → ratio < 0.30 → verdict `marginal`

→ Slide finale doit présenter : ATLANTIQUE, WESTAFRICA, IVOIRE TRANSIT RAPID comme nouveaux confirmés ; SOCOPHAR comme montée en puissance ; CEVA à retirer (déjà significativement actif en 2025).

### 5.2 Exemple Aérien 2026 (marchandises)

**Marchandises candidates** :
```
ŒUFS                  1 883 317 kg
MATÉRIELS MINIERS       515 776 kg
MACHINES                486 785 kg
TÉLÉCOMS                182 071 kg
```

**Référentiel N-1 (2025)** :
```
ŒUFS                  1 483 700 kg
MATÉRIELS MINIERS       149 783 kg
MACHINES                255 984 kg
TÉLÉCOMS                113 602 kg
```

**Validations (règle marchandises)** :

| Marchandise | Volume 2026 | Volume 2025 | Croissance | Verdict |
|-------------|-------------|-------------|------------|---------|
| ŒUFS | 1 883 317 | 1 483 700 | +26.9% | `existant` (< +30%) |
| MATÉRIELS MINIERS | 515 776 | 149 783 | +244.3% | `nouveau` |
| MACHINES | 486 785 | 255 984 | +90.2% | `nouveau` |
| TÉLÉCOMS | 182 071 | 113 602 | +60.3% | `nouveau` |

→ Les Œufs seront présentés en "marchandise stable à fort potentiel cible" plutôt qu'en "marchandise en croissance forte".

---

## 6. Implémentation TypeScript (frontend)

```typescript
// lib/n1-validation/validate.ts
import Fuse from 'fuse.js';

export interface Entity {
  nom: string;
  metier: string;
  volume: number;
}

export interface ValidationResult {
  entityName: string;
  volumeN: number;
  volumeNMinus1: number;
  matchScore: number;
  matchedName: string | null;
  verdict: 'nouveau' | 'marginal' | 'existant';
}

const SIMILARITY_THRESHOLD = 0.72;
const MARGINAL_RATIO = 0.30;
const GROWTH_THRESHOLD = 0.30;

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarityScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const wa = new Set(na.split(' ').filter(w => w.length >= 3));
  const wb = new Set(nb.split(' ').filter(w => w.length >= 3));

  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;

  return union > 0 ? intersection / union : 0;
}

export function validateNewEntrants(
  candidates: Entity[],
  referentialN1: Entity[],
  aliases: Map<string, string> = new Map(),
  type: 'acteurs' | 'marchandises' = 'acteurs'
): ValidationResult[] {
  return candidates.map(candidate => {
    let bestMatch: Entity | null = null;
    let bestScore = 0;

    // 1. Vérifier alias
    const normCandidate = normalizeName(candidate.nom);
    if (aliases.has(normCandidate)) {
      const equivName = aliases.get(normCandidate)!;
      bestMatch = referentialN1.find(
        r => normalizeName(r.nom) === normalizeName(equivName)
      ) || null;
      bestScore = 1.0;
    } else {
      // 2. Matching fuzzy
      for (const ref of referentialN1) {
        const score = similarityScore(candidate.nom, ref.nom);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ref;
        }
      }
    }

    // 3. Déterminer verdict
    let verdict: 'nouveau' | 'marginal' | 'existant';

    if (!bestMatch || bestScore < SIMILARITY_THRESHOLD || bestMatch.volume === 0) {
      verdict = 'nouveau';
    } else if (type === 'marchandises') {
      const growth = (candidate.volume - bestMatch.volume) / bestMatch.volume;
      verdict = growth >= GROWTH_THRESHOLD ? 'nouveau' : 'existant';
    } else {
      const ratio = bestMatch.volume / candidate.volume;
      verdict = ratio < MARGINAL_RATIO ? 'marginal' : 'existant';
    }

    return {
      entityName: candidate.nom,
      volumeN: candidate.volume,
      volumeNMinus1: bestMatch?.volume || 0,
      matchScore: Math.round(bestScore * 100) / 100,
      matchedName: bestMatch?.nom || null,
      verdict
    };
  });
}
```

---

## 7. Override manuel par l'utilisateur

L'utilisateur doit pouvoir override le verdict de l'algorithme dans 2 cas :

**Cas 1 — Faux positif** : l'algo dit `existant` mais c'est en réalité un nouveau (changement de raison sociale, etc.)
→ Bouton "Marquer comme nouveau" + champ justification

**Cas 2 — Faux négatif** : l'algo dit `nouveau` mais l'utilisateur sait que c'est en réalité une entité présente sous un autre nom
→ Bouton "Marquer comme existant" + champ justification + ajout automatique à la table `n1_aliases`

```typescript
interface OverrideRequest {
  validation_result_id: string;
  new_verdict: 'nouveau' | 'marginal' | 'existant';
  reason: string;
  also_add_alias?: {
    name_n: string;
    name_n_minus_1: string;
  };
}
```

---

## 8. Audit et traçabilité

Toutes les validations sont sauvegardées dans `n1_validation_results` avec :
- `match_score` : score brut du matching
- `matched_name_n_minus_1` : nom matché en N-1 (null si nouveau)
- `verdict` : verdict final
- `manual_override` : booléen
- `override_reason` : si manuel, raison

Permet de :
- Justifier au CODIR pourquoi telle entité est qualifiée de nouvelle
- Détecter les patterns de faux nouveaux récurrents
- Améliorer progressivement la liste des aliases

---

## 9. Cas limites et gestion d'erreurs

| Cas | Gestion |
|-----|---------|
| Référentiel N-1 vide | Tous les candidats → `nouveau` (avec warning UI) |
| Candidat avec volume 0 | Verdict `nouveau` mais warning "vérifier saisie" |
| Caractères Unicode exotiques | Normalisation gère, fallback à match texte brut |
| Noms d'entités très courts (< 3 lettres) | Matching uniquement sur match exact |
| Doublons dans le référentiel N-1 | Premier match conservé (warning admin) |
| PDF/Image scannés en entrée | Hors scope (utiliser OCR externe d'abord) |

---

*Document v1.0 — 18 juin 2026*

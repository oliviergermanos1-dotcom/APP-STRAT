# FICHE DE TRAITEMENT RGPD — CAP Strategic Analytics

> **Document à transmettre au DPO AGL pour ajout au registre des traitements
> (Article 30 du RGPD).**
>
> Renseigne les champs entre crochets `[...]` avant envoi.

---

## 1. IDENTIFICATION DU TRAITEMENT

| Champ | Valeur |
|---|---|
| **Nom du traitement** | CAP Strategic Analytics |
| **Date de mise en œuvre** | [Date première diffusion COMEX] |
| **Version de l'outil** | 1.0 (mai 2026) |
| **Domaine fonctionnel** | Analyse stratégique du portefeuille clients |

## 2. RESPONSABLES

| Rôle | Nom | Contact |
|---|---|---|
| **Responsable du traitement** | AGL (Africa Global Logistics) | [adresse siège AGL] |
| **Pilote opérationnel** | Olivier ASSAF GERMANOS, Head of Strategy Division | [email AGL] |
| **DPO AGL** | [Nom DPO] | [email DPO] |

## 3. FINALITÉ DU TRAITEMENT

**Finalité principale** : Analyse stratégique du portefeuille clients d'AGL
afin d'éclairer les décisions COMEX et la stratégie commerciale (priorisation
des KAM, détection des clients à risque churn, identification des
opportunités cross-sell, allocation des ressources commerciales).

**Finalités secondaires** : aucune (pas de marketing direct, pas de profilage
de personnes physiques).

## 4. BASE LÉGALE (Article 6 RGPD)

**Intérêt légitime** (art. 6.1.f) : analyse commerciale interne d'AGL sur ses
propres clients personnes morales B2B, sans incidence sur les droits et
libertés des personnes physiques.

**Pas de consentement requis** : le traitement porte exclusivement sur des
données de personnes morales (sociétés clientes), pas sur des personnes
physiques au sens du RGPD.

## 5. CATÉGORIES DE PERSONNES CONCERNÉES

| Catégorie | Volume estimé |
|---|---|
| Clients personnes morales d'AGL (sociétés) | ~3 400 entités |
| Personnes physiques | **Aucune** |

> ℹ Le traitement ne contient **aucune donnée de personne physique** (pas de
> noms d'employés, pas d'emails, pas de téléphones, pas de coordonnées
> bancaires). Stricto sensu, le RGPD ne s'applique pas. Cette fiche est
> remplie par mesure de précaution et de transparence vis-à-vis du DPO.

## 6. CATÉGORIES DE DONNÉES TRAITÉES

| Catégorie | Données | Sensibilité |
|---|---|---|
| **Identification entité** | Raison sociale du client | Standard B2B |
| **Données financières** | Montants CAP en XOF, par mois/année | Sensible commercialement |
| **Données opérationnelles** | Site (ABJ, SPY, BYK, DLA), métier, libellé département | Standard |
| **Données comptables** | Code département IRIS, rubrique | Standard |

**Aucune donnée sensible** au sens de l'article 9 RGPD (santé, religion,
opinions politiques, orientation sexuelle, biométrie, génétique).

**Mesures de minimisation appliquées** :
- ID interne IRIS retiré des exports (mai 2026)
- Pas de noms de personnes physiques (signataires, contacts) dans le dataset
- Filtrage des colonnes IRIS au strict nécessaire à l'analyse

## 7. DESTINATAIRES

| Catégorie | Nombre | Identification |
|---|---|---|
| **Direction Stratégie AGL** | 1 (pilote) | Olivier ASSAF GERMANOS |
| **COMEX AGL** | ≤ 10 personnes | [liste nominative tenue à jour] |
| **Sous-traitants** | 0 | Aucun |

**Liste nominative des destinataires** (à tenir à jour mensuellement) :
1. [Nom destinataire 1] — [Fonction]
2. [Nom destinataire 2] — [Fonction]
3. [...]
10. [Nom destinataire 10] — [Fonction]

## 8. DURÉE DE CONSERVATION

| Support | Durée |
|---|---|
| Fichiers Excel sources IRIS (PC pilote) | 36 mois glissants |
| Exports HTML générés (PC pilote) | 12 mois max |
| Fichiers diffusés dans Teams "CAP Reports" | 6 mois (auto-purge canal) |
| localStorage chez destinataires | 7 jours (purge auto) |
| Logs accès Teams | 90 jours (paramétrage IT AGL) |

Cf. document `POLITIQUE_CONSERVATION.md` pour le détail.

## 9. TRANSFERTS DE DONNÉES HORS UE

**Transferts hors UE : NON**

| Outil | Localisation | Justificatif |
|---|---|---|
| Microsoft Teams (diffusion) | Tenant AGL (UE/Afrique) | Hébergement Microsoft 365 conforme |
| SharePoint AGL | Tenant AGL | Idem |
| Repository GitHub | États-Unis | **Code uniquement, AUCUNE donnée client** |
| CDN Cloudflare (Chart.js, Plotly, XLSX) | Mondial | **Code public, AUCUNE donnée client** |

Les données AGL ne quittent jamais l'écosystème AGL.

## 10. MESURES DE SÉCURITÉ TECHNIQUES ET ORGANISATIONNELLES

### Sécurité technique

| Mesure | Détail |
|---|---|
| **Chiffrement au repos** | AES-256-GCM avec PBKDF2-SHA256, 100 000 itérations |
| **Chiffrement en transit** | HTTPS/TLS natif Microsoft Teams + SharePoint |
| **Authentification** | Compte AGL Microsoft (canal Teams privé) |
| **Mot de passe export** | 12+ caractères, renouvelé chaque mois |
| **Watermark personnalisé** | Bandeau + filigrane "AGL CONFIDENTIEL — {nom}" sur chaque export |
| **Identifiant unique** | versionId par export (audit forensique) |
| **Dépôt code source** | Repository GitHub privé (zéro donnée commitée) |
| **`.gitignore` strict** | Bloquant tous fichiers Excel, snapshots, secrets |

### Sécurité organisationnelle

| Mesure | Détail |
|---|---|
| **Liste destinataires fermée** | Maximum 10 personnes COMEX, validation pilote |
| **Mot de passe hors-bande** | Communication orale ou SMS, jamais dans le canal de diffusion |
| **Renouvellement mensuel** | Mot de passe AES changé à chaque diffusion |
| **Procédure documentée** | Mémo de procédure mensuelle |
| **Suppression sur demande** | Procédure droit d'accès / suppression formalisée |

## 11. DROITS DES PERSONNES (rappel)

Bien que le traitement ne porte pas sur des personnes physiques, AGL
s'engage à répondre dans les délais légaux à toute demande :

| Droit | Procédure |
|---|---|
| Droit d'accès (art. 15) | Extraction Excel du périmètre client demandé via filtre app |
| Droit de rectification (art. 16) | Correction directe dans la source IRIS |
| Droit à l'effacement (art. 17) | Suppression ligne IRIS + re-génération rapport |
| Droit à la portabilité (art. 20) | Export Excel des données concernant le demandeur |
| Droit d'opposition (art. 21) | Exclusion du périmètre d'analyse sur demande |

**Délai de réponse** : 1 mois maximum (article 12.3 RGPD).

## 12. ANALYSE D'IMPACT (DPIA — article 35 RGPD)

**DPIA obligatoire ?** : NON

Justification : le traitement ne porte pas sur des personnes physiques et
ne comporte aucune des situations listées à l'article 35.3 du RGPD
(profilage à grande échelle, données sensibles à grande échelle,
surveillance systématique d'espaces publics).

**DPIA recommandée ?** : OUI (par mesure de précaution, format léger 1 page)

Justification : 10 personnes ont accès à des données commerciales
détaillées sur 3 400 entités clientes, avec un risque résiduel de
re-share volontaire ou involontaire. Le DPIA documente que le risque
est maîtrisé par les mesures techniques (chiffrement, watermark).

## 13. INCIDENT / VIOLATION DE DONNÉES

**Procédure en cas de fuite** :

1. **Détection** : alerte du pilote, du destinataire ou via veille externe
2. **Identification** : le watermark + versionId permettent d'identifier
   le destinataire dont le fichier a fuité
3. **Notification CNIL** : si risque pour les droits et libertés (art. 33),
   notification dans les 72h
4. **Communication aux personnes** : sans objet (pas de personnes physiques)
5. **Mesures correctives** :
   - Révocation du destinataire concerné
   - Renouvellement immédiat du mot de passe AES
   - Renforcement éventuel du protocole

## 14. VALIDATION

| Étape | Date | Signataire |
|---|---|---|
| Création de la fiche | [Date] | Olivier ASSAF GERMANOS |
| Validation DPO AGL | [Date] | [Nom DPO] |
| Inscription au registre | [Date] | [Réf. registre] |
| Revue annuelle | [Date prévue +12 mois] | DPO AGL |

---

*Document créé le [date] · Version 1.0 · À envoyer au DPO AGL pour
inscription au registre des traitements.*

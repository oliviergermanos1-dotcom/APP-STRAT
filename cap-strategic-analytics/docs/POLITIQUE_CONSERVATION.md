# POLITIQUE DE CONSERVATION DES DONNÉES — CAP Strategic Analytics

> **Document opérationnel — politique de rétention et de purge des données
> traitées par l'outil CAP Strategic Analytics.**
>
> Conforme à l'article 5.1.e du RGPD (limitation de la conservation).

---

## 1. PRINCIPE DIRECTEUR

Les données ne sont conservées que **pendant la durée strictement
nécessaire** aux finalités du traitement (analyse stratégique COMEX
mensuelle, suivi de tendances pluriannuelles).

À l'issue de la durée définie, les données sont **purgées
automatiquement ou manuellement** selon le support.

## 2. TABLEAU DE CONSERVATION PAR SUPPORT

| # | Support / Donnée | Durée | Mode purge | Responsable |
|---|---|---|---|---|
| 1 | Excel sources IRIS sur PC pilote | **36 mois glissants** | Manuel mensuel | Pilote |
| 2 | Snapshots HTML générés (PC pilote) | **12 mois max** | Manuel trimestriel | Pilote |
| 3 | Fichiers HTML diffusés dans Teams "CAP Reports" | **6 mois** | Auto (rétention canal) | IT AGL |
| 4 | Fichiers HTML chez destinataires | **1 mois** | Rappel suppression mensuelle | Destinataires |
| 5 | localStorage navigateur destinataires | **7 jours** | Auto (code app) | Automatique |
| 6 | Annotations KAM (localStorage pilote) | **Permanent** | Manuel à la demande | Pilote |
| 7 | Logs accès Teams | **90 jours** | Auto (paramétrage M365) | IT AGL |
| 8 | Logs accès SharePoint (si utilisé) | **90 jours** | Auto (paramétrage M365) | IT AGL |
| 9 | Repository GitHub (code source) | **Permanent** | Manuel | Pilote |
| 10 | Branches expérimentales GitHub | **6 mois** | Manuel | Pilote |

## 3. JUSTIFICATIONS DES DURÉES

### Excel sources IRIS — 36 mois
**Pourquoi 36 mois ?** L'analyse de cohortes et la définition métier AGL
("nouveau client = absent depuis 36 mois") nécessitent un historique
glissant de 3 ans. Au-delà, les données sont purgées de la base de
travail (mais peuvent rester archivées chez IRIS pour conformité
fiscale).

### Snapshots HTML générés — 12 mois
**Pourquoi 12 mois ?** Permet de revenir à une version antérieure pour
analyse rétrospective ou audit. Au-delà, l'export devient obsolète et
les données fiscales restent accessibles via la source IRIS.

### Fichiers Teams diffusés — 6 mois
**Pourquoi 6 mois ?** Couvre les besoins de revue COMEX rétrospectif sur
2 trimestres tout en limitant le risque d'accumulation de versions
obsolètes dans le canal collaboratif.

### Fichiers chez destinataires — 1 mois
**Pourquoi 1 mois ?** Le rapport mensuel suivant remplace le précédent.
Conserver des versions plus anciennes localement n'a pas d'utilité
opérationnelle et augmente le risque de fuite.

### localStorage — 7 jours
**Pourquoi 7 jours ?** Limite technique programmée dans l'app pour la
sauvegarde de session. Au-delà, l'utilisateur doit recharger les
données.

## 4. PROCÉDURES DE PURGE

### 4.1 Purge mensuelle (à effectuer après chaque diffusion COMEX)

**Pilote (Olivier)** :
- [ ] Vérifier que les exports HTML > 12 mois sur PC sont supprimés
- [ ] Conserver uniquement les 12 derniers exports
- [ ] Vérifier que la liste des destinataires est à jour

**Destinataires (par email automatique ou rappel COMEX)** :
- [ ] Inviter les destinataires à supprimer le rapport du mois
  précédent une fois le nouveau reçu

### 4.2 Purge trimestrielle (chaque T+1 mois)

**Pilote** :
- [ ] Audit complet du dossier `data/` sur le PC
- [ ] Suppression des Excel IRIS > 36 mois
- [ ] Audit du repository GitHub : fermeture des branches dormantes

### 4.3 Purge auto (paramétrée 1× par IT AGL)

**Canal Teams "CAP Reports"** :
- Politique de rétention : **6 mois**
- Configuration : Microsoft Purview > Politique de rétention >
  Conservation puis suppression à 6 mois
- Action : à activer 1 fois par admin Teams AGL

**SharePoint (si utilisé)** :
- Idem : politique de rétention 6 mois sur la bibliothèque dédiée

## 5. SUPPRESSION SUR DEMANDE (DROIT À L'EFFACEMENT)

Si un client demande la suppression de ses données :

1. **Réception de la demande** par AGL (DPO ou commercial)
2. **Vérification de la légitimité** (article 17 RGPD : droits d'opposition,
   fin de contrat, données illicites…)
3. **Action technique** :
   - Suppression de toutes les lignes du client dans l'Excel IRIS source
   - Re-génération du rapport mensuel suivant sans le client
   - Notification au client que la suppression est effective
4. **Délai** : 1 mois maximum (art. 12.3 RGPD), prolongation possible 2 mois
5. **Traçabilité** : noter la demande dans un registre interne (date,
   demandeur, action, date de réalisation)

## 6. DESTRUCTION FIN DE VIE DE L'OUTIL

Si l'outil CAP Strategic Analytics est arrêté ou remplacé :

1. **Diffusion d'un avis** aux 10 destinataires demandant la suppression
   de tous les fichiers HTML reçus
2. **Suppression du canal Teams** "CAP Reports" (les fichiers et logs sont
   purgés automatiquement)
3. **Archivage** des Excel sources IRIS selon la politique d'archivage
   AGL (ou suppression si l'archivage n'est pas requis fiscalement)
4. **Conservation du code source** dans le repository GitHub privé pour
   audit de la conformité historique
5. **Mise à jour du registre des traitements** AGL : statut "fermé"

## 7. AUDIT DE CONFORMITÉ

### Audit annuel (recommandé)

À effectuer chaque année par le pilote (ou un binôme avec le DPO) :

- [ ] Vérification du respect des durées de conservation
- [ ] Audit des destinataires (toujours actifs ? toujours légitimes ?)
- [ ] Renouvellement de la fiche RGPD si évolutions du périmètre
- [ ] Audit des logs Teams : volumétrie d'accès, anomalies
- [ ] Vérification du dépôt GitHub : pas de leak accidentel
- [ ] Test de récupération sur un fichier exporté (le mot de passe
  est-il toujours connu et fonctionnel ?)

### Audit ponctuel (sur incident)

Déclenché en cas de :
- Suspicion de fuite ou re-share non autorisé
- Demande d'un client (droit d'accès, suppression…)
- Modification du périmètre (ajout/retrait destinataire)
- Évolution réglementaire (modification CNIL ou RGPD)

## 8. RESPONSABILITÉS

| Action | Responsable |
|---|---|
| Politique générale | Pilote (Olivier ASSAF GERMANOS) |
| Validation conformité | DPO AGL |
| Configuration technique Teams/SharePoint | IT AGL |
| Purges manuelles mensuelles | Pilote |
| Purges automatiques | IT AGL (paramétrage initial) |
| Suppression sur demande client | Pilote + DPO |
| Audit annuel | Pilote + DPO |

## 9. RÉFÉRENCES RÉGLEMENTAIRES

- **RGPD** (Règlement UE 2016/679) — article 5.1.e (limitation de la
  conservation), article 17 (droit à l'effacement), article 30
  (registre des traitements)
- **Loi Informatique et Libertés** (modifiée par la loi du 20 juin 2018)
- **Code de commerce** (durées de conservation des documents comptables :
  10 ans pour les pièces justificatives — la source IRIS reste détenue
  par AGL au-delà de l'outil CAP)
- **CNIL — Référentiel "Gestion commerciale"** (durées recommandées
  pour les données B2B)

## 10. RÉVISION DU DOCUMENT

| Version | Date | Auteur | Modifications |
|---|---|---|---|
| 1.0 | [Date création] | Olivier ASSAF GERMANOS | Création initiale |

---

*Document à valider par le DPO AGL avant mise en application.
Revue annuelle obligatoire.*

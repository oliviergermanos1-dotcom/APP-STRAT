# Référence DAX — CAP Strategic Analytics

> Les 48 mesures originales en DAX (pour Power BI) traduites en JavaScript dans `index.html` (objet `CALC.*`).
> Cette doc permet de retrouver la logique métier de chaque calcul.

---

## 📊 Section 1 — Mesures de base (7)

### 1.1 CAP_N
```dax
CAP_N = SUM( FACT_CAP[MONTANT] )
```
**JS** : `CALC.cap(rows)` → `rows.reduce((s, r) => s + (r.MONTANT || 0), 0)`

### 1.2 CAP_N_1
```dax
CAP_N_1 = 
CALCULATE(
    [CAP_N],
    DATEADD( DIM_DATE[Date], -1, YEAR )
)
```
**JS** : `CALC.capN_1(rows, allRows, currentYear)` — filtre `allRows` sur année N-1 + mêmes filtres autres dimensions

### 1.3 CAP_Evolution_Abs
```dax
CAP_Evolution_Abs = [CAP_N] - [CAP_N_1]
```

### 1.4 CAP_Evolution_Pct
```dax
CAP_Evolution_Pct = DIVIDE( [CAP_N] - [CAP_N_1], [CAP_N_1] )
```

### 1.5 CAP_Couleur_Evolution
```dax
CAP_Couleur_Evolution = 
SWITCH( TRUE(),
    ISBLANK([CAP_N_1]) && NOT ISBLANK([CAP_N]), "#1F77B4",   // Bleu : Nouveau
    NOT ISBLANK([CAP_N_1]) && ISBLANK([CAP_N]), "#7F7F7F",   // Gris : Perdu
    [CAP_Evolution_Pct] >= 0.20, "#0B6E4F",                  // Vert foncé
    [CAP_Evolution_Pct] >= 0.05, "#52B788",                  // Vert clair
    [CAP_Evolution_Pct] > -0.05, "#F4D35E",                  // Jaune
    [CAP_Evolution_Pct] > -0.20, "#F77F00",                  // Orange
    [CAP_Evolution_Pct] <= -0.20, "#D62828",                 // Rouge
    "#FFFFFF"
)
```

### 1.6 Nb_Clients
```dax
Nb_Clients = DISTINCTCOUNT( FACT_CAP[CLIENTS] )
```

### 1.7 CAP_Moyen_Client
```dax
CAP_Moyen_Client = DIVIDE( [CAP_N], [Nb_Clients] )
```

---

## 🎯 Section 2 — KPI Macro (6)

### 2.1 HHI_Concentration (Herfindahl-Hirschman)
```dax
HHI_Concentration = 
VAR vCATotal = CALCULATE( [CAP_N], REMOVEFILTERS( FACT_CAP[CLIENTS] ) )
VAR vTable = 
    ADDCOLUMNS(
        VALUES( FACT_CAP[CLIENTS] ),
        "Part2", 
            VAR vCAClient = [CAP_N]
            RETURN ( DIVIDE( vCAClient, vCATotal ) ) ^ 2
    )
RETURN SUMX( vTable, [Part2] ) * 10000
```
**Benchmark** : <1500 = sain | 1500-2500 = modéré | >2500 = risque

### 2.2 Top10_Dependency_Pct
```dax
Top10_Dependency_Pct = 
VAR vCATotal = CALCULATE( [CAP_N], REMOVEFILTERS( FACT_CAP[CLIENTS] ) )
VAR vTop10 = TOPN( 10, VALUES( FACT_CAP[CLIENTS] ), [CAP_N], DESC )
VAR vCATop10 = SUMX( vTop10, [CAP_N] )
RETURN DIVIDE( vCATop10, vCATotal )
```
**Benchmark** : <50% sain | >70% critique

### 2.3 NRR_Pct (Net Revenue Retention)
```dax
NRR_Pct = 
VAR vClientsN1 = CALCULATETABLE( VALUES( FACT_CAP[CLIENTS] ), DATEADD( DIM_DATE[Date], -1, YEAR ) )
VAR vCAN_ClientsN1 = CALCULATE( [CAP_N], TREATAS( vClientsN1, FACT_CAP[CLIENTS] ) )
RETURN DIVIDE( vCAN_ClientsN1, [CAP_N_1] )
```
**Benchmark** : >100% expansion | >110% excellent

### 2.4 GRR_Pct (Gross Revenue Retention)
```dax
GRR_Pct = 
VAR vClientsCommuns = INTERSECT( VALUES( FACT_CAP[CLIENTS] ),
    CALCULATETABLE( VALUES( FACT_CAP[CLIENTS] ), DATEADD( DIM_DATE[Date], -1, YEAR ) ) )
VAR vCAClientsCommunsN = CALCULATE( [CAP_N], TREATAS( vClientsCommuns, FACT_CAP[CLIENTS] ) )
VAR vCAClientsCommunsN1 = CALCULATE( [CAP_N_1], TREATAS( vClientsCommuns, FACT_CAP[CLIENTS] ) )
RETURN DIVIDE( MIN( vCAClientsCommunsN, vCAClientsCommunsN1 ), [CAP_N_1] )
```
**Benchmark** : >90% sain

### 2.5 Churn_Rate_Pct
```dax
Churn_Rate_Pct = 
VAR vChurned = EXCEPT( vClientsN1, vClientsN )
RETURN DIVIDE( COUNTROWS( vChurned ), COUNTROWS( vClientsN1 ) )
```
**Benchmark** : <10% annuel sain

### 2.6 New_Logo_Contribution_Pct
```dax
New_Logo_Contribution_Pct = 
VAR vNewLogos = EXCEPT( vClientsN, vClientsN1 )
VAR vCANewLogos = CALCULATE( [CAP_N], TREATAS( vNewLogos, FACT_CAP[CLIENTS] ) )
RETURN DIVIDE( vCANewLogos, [CAP_N] )
```
**Benchmark** : >5% dynamique active

---

## 🎯 Section 3 — Segmentation (9)

### 3.1 Score_Taille
```dax
Score_Taille = 
VAR vCA = [CAP_N]
VAR vMaxCA = MAXX( ALL( FACT_CAP[CLIENTS] ), [CAP_N] )
RETURN
IF( vCA > 0 && vMaxCA > 0,
    DIVIDE( LN(vCA + 1), LN(vMaxCA + 1) ) * 20,
    0 )
```

### 3.2 Score_Croissance
```dax
Score_Croissance = 
SWITCH( TRUE(),
    [CAP_Evolution_Pct] >= 0.50, 20,
    [CAP_Evolution_Pct] >= 0.20, 17,
    [CAP_Evolution_Pct] >= 0.10, 14,
    [CAP_Evolution_Pct] >= 0.00, 11,
    [CAP_Evolution_Pct] >= -0.10, 7,
    [CAP_Evolution_Pct] >= -0.20, 4,
    1 )
```

### 3.3 Score_Regularite
```dax
Score_Regularite = 
VAR vMoisActifs = CALCULATE( DISTINCTCOUNT( DIM_DATE[Annee_Mois] ),
    DATESINPERIOD( DIM_DATE[Date], MAX( DIM_DATE[Date] ), -12, MONTH ) )
RETURN DIVIDE( vMoisActifs, 12 ) * 20
```

### 3.4 Score_Diversite
```dax
Score_Diversite = 
VAR vNbLibelles = DISTINCTCOUNT( FACT_CAP[RUBRQ] )
VAR vNbLibellesTotal = CALCULATE( DISTINCTCOUNT( FACT_CAP[RUBRQ] ), REMOVEFILTERS( FACT_CAP ) )
RETURN DIVIDE( vNbLibelles, vNbLibellesTotal ) * 20
```

### 3.5 Score_Anciennete
```dax
Score_Anciennete = 
VAR vAnneeMin = CALCULATE( MIN( FACT_CAP[ANNEE] ), ALLEXCEPT( FACT_CAP, FACT_CAP[CLIENTS] ) )
VAR vAnciennete = YEAR( TODAY() ) - vAnneeMin + 1
RETURN
SWITCH( TRUE(),
    vAnciennete >= 5, 20,
    vAnciennete = 4, 16,
    vAnciennete = 3, 12,
    vAnciennete = 2, 8,
    vAnciennete = 1, 4,
    0 )
```

### 3.6 Customer_Score
```dax
Customer_Score = 
ROUND(
    [Score_Taille]      * 1.25 +    -- pondération 25%
    [Score_Croissance]  * 1.25 +    -- pondération 25%
    [Score_Regularite]  * 1.00 +    -- pondération 20%
    [Score_Diversite]   * 0.75 +    -- pondération 15%
    [Score_Anciennete]  * 0.75,     -- pondération 15%
    0
)
```

### 3.7 Customer_Tier
```dax
Customer_Tier = 
SWITCH( TRUE(),
    [Customer_Score] >= 90, "S - Strategic",
    [Customer_Score] >= 75, "A - Premium",
    [Customer_Score] >= 50, "B - Standard",
    [Customer_Score] >= 25, "C - Long Tail",
    "D - À arbitrer"
)
```

### 3.8 Quadrant_9Box
```dax
Quadrant_9Box = 
VAR vCA = [CAP_N]
VAR vEvol = [CAP_Evolution_Pct]
VAR vP80 = PERCENTILEX.INC( ALL( FACT_CAP[CLIENTS] ), [CAP_N], 0.80 )
VAR vP20 = PERCENTILEX.INC( ALL( FACT_CAP[CLIENTS] ), [CAP_N], 0.20 )

VAR vTaille = SWITCH( TRUE(),
    vCA >= vP80, "Haut",
    vCA >= vP20, "Moyen",
    "Bas" )

VAR vMomentum = SWITCH( TRUE(),
    vEvol >= 0.15, "Forte",
    vEvol >= -0.05, "Modérée",
    "Décroissance" )

RETURN
SWITCH( TRUE(),
    vTaille = "Haut" && vMomentum = "Forte", "Champions",
    vTaille = "Haut" && vMomentum = "Modérée", "Cash Generators",
    vTaille = "Haut", "Endangered Kings",
    vTaille = "Moyen" && vMomentum = "Forte", "Rising Stars",
    vTaille = "Moyen" && vMomentum = "Modérée", "Steady Performers",
    vTaille = "Moyen", "Fading Mid-Tier",
    vTaille = "Bas" && vMomentum = "Forte", "Seeds",
    vTaille = "Bas" && vMomentum = "Modérée", "Marginal",
    "Dormant"
)
```

### 3.9 Quadrant_Couleur
Mapping fixe quadrant → code hex (voir `CALC.quadrantColor` en JS).

---

## 🔄 Section 4 — Cross-sell (4)

### 4.1 Nb_Libelles_Client
```dax
Nb_Libelles_Client = DISTINCTCOUNT( FACT_CAP[RUBRQ] )
```

### 4.2 Nb_Libelles_Total
```dax
Nb_Libelles_Total = CALCULATE( DISTINCTCOUNT( FACT_CAP[RUBRQ] ), REMOVEFILTERS( FACT_CAP ) )
```

### 4.3 Penetration_Rate
```dax
Penetration_Rate = DIVIDE( [Nb_Libelles_Client], [Nb_Libelles_Total] )
```

### 4.4 Whitespace_Score
```dax
Whitespace_Score = ROUND( [CAP_N] * ( 1 - [Penetration_Rate] ), 0 )
```
**Logique** : un client à fort CA et faible pénétration = forte opportunité cross-sell.

---

## 📈 Section 5 — Cohortes & Lifecycle (3)

### 5.1 Annee_Premiere_Transaction (colonne calculée DIM_CLIENTS)
```dax
Annee_Premiere_Transaction = 
CALCULATE( MIN( FACT_CAP[ANNEE] ), ALLEXCEPT( FACT_CAP, FACT_CAP[CLIENTS] ) )
```

### 5.2 Statut_Cycle_Vie
```dax
Statut_Cycle_Vie = 
SWITCH( TRUE(),
    [vMoisDepuisDerniereTransaction] > 12, "❌ Churned",
    [vMoisDepuisDerniereTransaction] > 6, "💤 Dormant",
    ( YEAR( TODAY() ) - [Annee_Premiere_Transaction] ) <= 1, "🆕 New",
    [CAP_Evolution_Pct] >= 0.10, "📈 Growing",
    [CAP_Evolution_Pct] <= -0.10, "📉 Declining",
    "⚓ Mature"
)
```

### 5.3 Cohort_Retention_Pct
```dax
Cohort_Retention_Pct = 
VAR vCohorteCAInitial = 
    CALCULATE( [CAP_N],
        FILTER( ALL( DIM_DATE[Annee] ),
            DIM_DATE[Annee] = SELECTEDVALUE( DIM_CLIENTS[Annee_Premiere_Transaction] ) ) )
RETURN DIVIDE( [CAP_N], vCohorteCAInitial )
```

---

## 🚨 Section 6 — Health Score (8)

### 6.1 Health_Signal_Decroissance
```dax
Health_Signal_Decroissance = 
VAR vEvol3M = ...  -- évolution sur 3 derniers mois
RETURN IF( vEvol3M < -0.15, -2, 0 )
```

### 6.2 Health_Signal_Inactivite
```dax
Health_Signal_Inactivite = 
VAR vMoisDepuis = DATEDIFF( vDernierMois, TODAY(), MONTH )
RETURN IF( vMoisDepuis > 3, -2, 0 )
```

### 6.3 Health_Signal_Diversite
```dax
Health_Signal_Diversite = 
IF( [Nb_Libelles_Client_N] < [Nb_Libelles_Client_N1], -1, 0 )
```

### 6.4 Health_Signal_Volatilite
```dax
Health_Signal_Volatilite = 
VAR vCV = DIVIDE( STDEVX.P(...), AVERAGEX(...) )
RETURN IF( vCV > 1, -1, 0 )
```

### 6.5 Health_Signal_Concentration
```dax
Health_Signal_Concentration = 
IF( DISTINCTCOUNT( FACT_CAP[SITE] ) = 1, -1, 0 )
```

### 6.6 Health_Score_Total
```dax
Health_Score_Total = 
[Health_Signal_Decroissance] +
[Health_Signal_Inactivite] +
[Health_Signal_Diversite] +
[Health_Signal_Volatilite] +
[Health_Signal_Concentration]
```

### 6.7 Health_Status
```dax
Health_Status = 
SWITCH( TRUE(),
    [Health_Score_Total] >= 0, "🟢 Sain",
    [Health_Score_Total] >= -2, "🟡 À surveiller",
    [Health_Score_Total] >= -4, "🟠 À risque",
    "🔴 Critique"
)
```

### 6.8 Alerte_Churn
```dax
Alerte_Churn = IF( [Health_Score_Total] <= -4, 1, 0 )
```

---

## 🔮 Section 7 — Forecast (6)

### 7.1 CAGR_3ans
```dax
CAGR_3ans = 
VAR vAnneeFin = MAX( DIM_DATE[Annee] )
VAR vAnneeDebut = vAnneeFin - 3
VAR vCAFin = CALCULATE( [CAP_N], DIM_DATE[Annee] = vAnneeFin, REMOVEFILTERS( DIM_DATE ) )
VAR vCADebut = CALCULATE( [CAP_N], DIM_DATE[Annee] = vAnneeDebut, REMOVEFILTERS( DIM_DATE ) )
RETURN IF( vCADebut > 0, ( vCAFin / vCADebut ) ^ ( 1 / 3 ) - 1, 0 )
```

### 7.2 Coef_Saisonnalite_Mois
```dax
Coef_Saisonnalite_Mois = 
VAR vCAMoisHistorique = ...   -- moyenne du mois sur N années
VAR vCAMoyenAnnuel = ...      -- moyenne annuelle / 12
RETURN DIVIDE( vCAMoisHistorique, vCAMoyenAnnuel )
```

### 7.3 CAP_Forecast_Base
```dax
CAP_Forecast_Base = 
[CAP_Reference_N_1] * ( 1 + [CAGR_3ans] ) * [Coef_Saisonnalite_Mois]
```

### 7.4 CAP_Forecast_Optimiste
```dax
CAP_Forecast_Optimiste = [CAP_Forecast_Base] * 1.15
```

### 7.5 CAP_Forecast_Pessimiste
```dax
CAP_Forecast_Pessimiste = [CAP_Forecast_Base] * 0.85
```

### 7.6 Forecast_Selected_Horizon
```dax
Forecast_Selected_Horizon = 
VAR vHorizon = SELECTEDVALUE( DIM_HORIZON[Horizon_Mois], 12 )
VAR vDateLimite = EDATE( vDateMax, vHorizon )
RETURN CALCULATE( [CAP_Forecast_Base],
    DIM_DATE[Date] >= vDateMax && DIM_DATE[Date] <= vDateLimite )
```

---

## 💡 Section 8 — What-If (3)

### 8.1 CAP_Forecast_WhatIf
```dax
CAP_Forecast_WhatIf = 
VAR vAjustCroissance = SELECTEDVALUE( WhatIf_Croissance[Value], 0 )
VAR vAjustSaison = SELECTEDVALUE( WhatIf_Saisonnalite[Value], 1 )
RETURN [CAP_Forecast_Base] * ( 1 + vAjustCroissance ) * vAjustSaison
```

### 8.2 CAP_Impact_Top10
```dax
CAP_Impact_Top10 = 
VAR vAjustTop10 = SELECTEDVALUE( WhatIf_Top10[Value], 0 )
VAR vCATop10 = SUMX( TOPN( 10, VALUES( FACT_CAP[CLIENTS] ), [CAP_N], DESC ), [CAP_N] )
RETURN vCATop10 * vAjustTop10
```

### 8.3 CAP_Forecast_Final
```dax
CAP_Forecast_Final = [CAP_Forecast_WhatIf] + [CAP_Impact_Top10]
```

---

## 📊 Récapitulatif

**Total** : 48 mesures + 1 colonne calculée + 1 table calculée

| Section | Nb mesures |
|---|---|
| Mesures de base | 7 |
| KPI Macro | 6 |
| Segmentation | 9 |
| Cross-sell | 4 |
| Cohortes | 3 |
| Health Score | 8 |
| Forecast | 6 |
| What-If | 3 |
| **TOTAL** | **46 mesures + 2 objets** |

> Le HTML implémente toutes ces mesures sous forme de fonctions JavaScript dans `CALC.*` (voir `index.html` script `js-calculator`).

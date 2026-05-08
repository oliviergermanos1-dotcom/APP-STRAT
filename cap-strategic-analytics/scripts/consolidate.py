"""
Consolidation des données IRIS pour CAP Strategic Analytics
============================================================

Fusionne :
- Classeur1.xlsx (export brut SAP/IRIS, ~156k lignes)
- REF_METIER_LIBELLES_FACT.csv (référentiel libellés/métiers)

Produit :
- CAP_IRIS_Consolidated.xlsx (prêt pour l'application)

Usage :
    python scripts/consolidate.py [chemin_classeur] [chemin_ref_csv]

Si pas d'argument, utilise les chemins par défaut dans data/
"""

import sys
import os
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("ERREUR : pandas n'est pas installé.")
    print("Installation : pip install pandas openpyxl")
    sys.exit(1)


# ============= CONFIGURATION =============

DEFAULT_CLASSEUR = "data/Classeur1.xlsx"
DEFAULT_REF = "data/REF_METIER_LIBELLES_FACT.csv"
OUTPUT = "data/CAP_IRIS_Consolidated.xlsx"

# Mapping intelligent des départements manquants
MISSING_LIBELLES = {
    '40D09': 'EVA EXTENSION 9',
    '40D08': 'EVA EXTENSION 8',
    '40D07': 'EVA EXTENSION 7',
    '40D06': 'EVA EXTENSION 6',
    '40D10': 'EVA EXTENSION 10',
    '75A00': 'AUTRES PRESTATIONS',
    '70G00': 'CADRE LOCAUX EXPAT (HQ)',
    '15J03': 'LIVRAISON SAN PEDRO',
    '20F02': 'ENTREPOSAGE ANNEXE',
    '20B09': 'TEM CACAO PROCESSING'
}

# Correction des codes corrompus en notation scientifique Excel
SCIENTIFIC_NOTATION_FIX = {
    '2,00E+01': '20',
    '7,00E+01': '70',
    '2.00E+01': '20',
    '7.00E+01': '70'
}


def infer_metier(depar: str) -> str:
    """Infère le métier AGL à partir du code département IRIS."""
    if not depar or pd.isna(depar):
        return 'NON RENSEIGNE'
    code = str(depar).strip()
    
    METIER_MAP = {
        '10': 'CONSIGNATION MARITIME',
        '15': 'MANUTENTION & TERMINAUX',
        '20': 'TRANSIT MARITIME',
        '30': 'AERIEN',
        '40': 'LOGISTIQUE & ENTREPOSAGE',
        '45': 'TRANSPORT TERRESTRE',
        '60': 'SERVICES ANNEXES',
        '70': 'SUPPORT & ADMINISTRATION',
        '75': 'AUTRES',
        '80': 'SERVICES TIERS',
        '90': 'AUTRES'
    }
    
    prefix = code[:2]
    return METIER_MAP.get(prefix, 'NON RENSEIGNE')


def consolidate(classeur_path: str, ref_path: str, output_path: str):
    """Consolide les 2 fichiers en un seul Excel."""
    
    # ========== CHARGEMENT FACT ==========
    print(f"📥 Chargement {classeur_path}...")
    df_fact = pd.read_excel(classeur_path, sheet_name=0)
    df_fact.columns = [c.strip() for c in df_fact.columns]
    
    # Nettoyer les espaces dans les colonnes texte
    for col in ['ID', 'CLIENT', 'DEPARTEMENT', 'RUBRQ', 'SITE']:
        if col in df_fact.columns:
            df_fact[col] = df_fact[col].astype(str).str.strip()
    
    # Conversion MONTANT en numérique
    df_fact['MONTANT'] = pd.to_numeric(df_fact['MONTANT'], errors='coerce')
    invalid = df_fact['MONTANT'].isna().sum()
    df_fact = df_fact.dropna(subset=['MONTANT'])
    df_fact['ANNEE'] = df_fact['ANNEE'].astype(int)
    df_fact['MOIS'] = df_fact['MOIS'].astype(int)
    
    print(f"   ✅ {len(df_fact):,} lignes valides ({invalid} lignes invalides supprimées)")
    
    # ========== CHARGEMENT REF ==========
    print(f"\n📥 Chargement {ref_path}...")
    df_ref = pd.read_csv(ref_path, sep=';', encoding='utf-8-sig')
    df_ref.columns = [c.strip() for c in df_ref.columns]
    df_ref['DEPAR'] = df_ref['DEPAR'].astype(str).str.strip()
    df_ref['DPT'] = df_ref['DPT'].astype(str).str.strip()
    
    # Corriger les codes corrompus
    df_ref['DEPAR'] = df_ref['DEPAR'].replace(SCIENTIFIC_NOTATION_FIX)
    print(f"   ✅ {len(df_ref)} départements (codes scientifiques corrigés)")
    
    # ========== ENRICHIR REF ==========
    new_rows = pd.DataFrame([
        {'DEPAR': k, 'DPT': v} for k, v in MISSING_LIBELLES.items()
        if k not in df_ref['DEPAR'].values
    ])
    if len(new_rows):
        df_ref = pd.concat([df_ref, new_rows], ignore_index=True)
        print(f"   ✅ {len(new_rows)} départements supplémentaires ajoutés")
    
    # Inférence métier
    df_ref['METIER'] = df_ref['DEPAR'].apply(infer_metier)
    
    # ========== JOINTURE ==========
    print(f"\n🔗 Jointure FACT × REF...")
    df_consolidated = df_fact.merge(
        df_ref[['DEPAR', 'DPT', 'METIER']],
        left_on='DEPARTEMENT',
        right_on='DEPAR',
        how='left'
    )
    df_consolidated = df_consolidated.rename(columns={'DPT': 'LIBELLE'})
    
    # Pour les non matchés, utiliser le code et inférer
    mask_no_match = df_consolidated['LIBELLE'].isna()
    n_unmatched = mask_no_match.sum()
    if n_unmatched > 0:
        df_consolidated.loc[mask_no_match, 'LIBELLE'] = df_consolidated.loc[mask_no_match, 'DEPARTEMENT']
        df_consolidated.loc[mask_no_match, 'METIER'] = df_consolidated.loc[mask_no_match, 'DEPARTEMENT'].apply(infer_metier)
        print(f"   ⚠️  {n_unmatched:,} lignes sans correspondance directe (libellé = code)")
    else:
        print(f"   ✅ 100% des lignes matchées")
    
    # ========== STRUCTURE FINALE ==========
    df_final = df_consolidated[[
        'MONTANT', 'CLIENT', 'ANNEE', 'MOIS', 'SITE',
        'LIBELLE', 'METIER', 'DEPARTEMENT', 'RUBRQ', 'ID'
    ]].copy()
    df_final = df_final.rename(columns={'DEPARTEMENT': 'CODE_DEPAR'})
    
    # ========== EXPORT ==========
    print(f"\n💾 Export vers {output_path}...")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_final.to_excel(writer, sheet_name='FACT_CAP', index=False)
    
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    
    # ========== STATS ==========
    print("\n" + "="*60)
    print("📊 STATISTIQUES DU FICHIER CONSOLIDÉ")
    print("="*60)
    print(f"   Fichier      : {output_path} ({size_mb:.1f} MB)")
    print(f"   Lignes       : {len(df_final):,}")
    print(f"   CAP total    : {df_final['MONTANT'].sum():,.0f} XOF")
    print(f"   Période      : {df_final['ANNEE'].min()}-{df_final['ANNEE'].max()}")
    print(f"   Clients      : {df_final['CLIENT'].nunique():,}")
    print(f"   Sites        : {df_final['SITE'].nunique()} ({', '.join(sorted(df_final['SITE'].unique()))})")
    print(f"   Métiers      : {df_final['METIER'].nunique()}")
    print(f"   Libellés     : {df_final['LIBELLE'].nunique()}")
    
    print("\n📊 RÉPARTITION PAR MÉTIER:")
    metier_stats = df_final.groupby('METIER').agg(
        CAP=('MONTANT', 'sum'),
        Clients=('CLIENT', 'nunique')
    ).sort_values('CAP', ascending=False)
    metier_stats['CAP_Md'] = (metier_stats['CAP'] / 1e9).round(2)
    metier_stats['Part_%'] = (metier_stats['CAP'] / metier_stats['CAP'].sum() * 100).round(1)
    print(metier_stats[['CAP_Md', 'Clients', 'Part_%']].to_string())
    
    print("\n✅ Consolidation terminée avec succès")


if __name__ == '__main__':
    classeur = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CLASSEUR
    ref = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_REF
    
    if not os.path.exists(classeur):
        print(f"❌ Fichier introuvable : {classeur}")
        print(f"Usage : python scripts/consolidate.py [chemin_classeur] [chemin_ref_csv]")
        sys.exit(1)
    
    if not os.path.exists(ref):
        print(f"❌ Fichier introuvable : {ref}")
        sys.exit(1)
    
    consolidate(classeur, ref, OUTPUT)

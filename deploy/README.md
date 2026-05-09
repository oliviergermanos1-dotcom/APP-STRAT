# Dossier de déploiement Vercel

Ce dossier contient le **snapshot HTML chiffré** servi par Vercel.

## Mise à jour des données

```
1. Local : ouvre cap-strategic-analytics/index.html
2. Charge ton Excel AGL (CAP_IRIS_Consolidated.xlsx)
3. Clique "📤 Exporter HTML interactif" → mot de passe AES-256
4. Renomme le fichier téléchargé en "index.html"
5. Place-le dans deploy/index.html (remplace l'existant)
6. git add deploy/index.html
7. git commit -m "Mise à jour snapshot AGL — semaine X"
8. git push
9. Vercel rebuild auto en ~30s
```

## URL de production

Sera disponible après config Vercel (ex. `https://cap-agl.vercel.app`).

## Sécurité

- ✅ Le snapshot est chiffré AES-256 (mot de passe ≥ 8 car)
- ✅ Headers HTTP sécurité (HSTS, X-Frame-Options, etc.) via `vercel.json`
- ✅ Repo GitHub privé (collaborateurs uniquement)
- ⚠ Le mot de passe est partagé hors-bande (SMS/oral)

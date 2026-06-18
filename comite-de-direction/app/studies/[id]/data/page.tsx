import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StudyTabs } from "@/components/StudyTabs";
import { UploadDropzone } from "@/components/UploadDropzone";
import { getStudy } from "@/lib/store/studies";
import type { DatasetType } from "@/lib/parsers/schemas";

const DATASET_TYPES: Array<{ key: DatasetType; label: string; hint: string }> = [
  { key: "concurrents", label: "Concurrents", hint: "rang,transitaire,volume,pdm" },
  { key: "clients", label: "Clients (Top destinataires/chargeurs)", hint: "client,volume,segment,pct_vol_agl" },
  { key: "segments", label: "Segments / Marchandises", hint: "segment,volume_marche,pdm_agl" },
  { key: "mensuel", label: "Mensuel (KPI par mois)", hint: "mois,volume_marche,volume_agl,pdm_agl" },
  { key: "nouveaux", label: "Candidats nouveaux entrants", hint: "nom,volume,segment,trimestre" },
  { key: "referentiel_n1", label: "Référentiel N-1 (12 mois)", hint: "nom_entite,metier,volume_annuel_n1" },
];

export default async function StudyDataPage({ params }: { params: { id: string } }) {
  const study = await getStudy(params.id);
  if (!study) notFound();

  const completed = {
    data: study.datasets.length > 0,
    n1: study.n1Runs.length > 0,
  };

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-navy"
      >
        <ArrowLeft className="h-3 w-3" />
        Retour au tableau de bord
      </Link>

      <div>
        <div className="text-xs uppercase tracking-widest text-gold font-semibold">
          Étude
        </div>
        <h1 className="text-2xl font-bold text-navy mt-1">{study.title}</h1>
        <div className="text-xs text-gray-500 mt-1">
          {study.periodStart} → {study.periodEnd} · Métiers :{" "}
          {study.metiers.join(", ")} · {study.datasets.length} dataset(s) chargé(s)
        </div>
      </div>

      <StudyTabs studyId={study.id} active="data" completed={completed} />

      <div className="space-y-8">
        {study.metiers.map((metier) => (
          <section key={metier} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-navy">{metier}</h2>
              <span className="text-xs text-gray-500">
                {study.datasets.filter((d) => d.metier === metier).length} dataset(s)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {DATASET_TYPES.map((t) => {
                const existing = study.datasets.find(
                  (d) => d.metier === metier && d.datasetType === t.key,
                );
                return (
                  <div key={t.key} className="border border-gray-200 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-navy">{t.label}</div>
                      {existing ? (
                        <span className="text-[10px] uppercase font-bold text-aglgreen">
                          ✓ {existing.rowCount} lignes
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase text-gray-400">
                          en attente
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mb-2 truncate">
                      {t.hint}
                    </div>
                    <UploadDropzone
                      studyId={study.id}
                      metier={metier}
                      datasetTypeHint={t.key}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/studies/${study.id}/n1`}
          className="px-5 py-2 bg-navy text-white rounded text-sm font-medium hover:bg-navy/90"
        >
          Étape suivante : Validation N-1 →
        </Link>
      </div>
    </div>
  );
}

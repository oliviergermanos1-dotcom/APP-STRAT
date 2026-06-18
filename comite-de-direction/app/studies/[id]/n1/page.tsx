import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StudyTabs } from "@/components/StudyTabs";
import { N1ValidationPanel } from "@/components/N1ValidationPanel";
import { getStudy } from "@/lib/store/studies";

export default async function StudyN1Page({ params }: { params: { id: string } }) {
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
        <p className="text-sm text-gray-600 mt-2 max-w-3xl">
          Croisement automatique des candidats &quot;nouveaux entrants&quot; contre le
          référentiel N-1 (12 mois). Verdicts : <strong>nouveau</strong> (à
          conserver), <strong>marginal</strong> (montée en puissance),{" "}
          <strong>existant</strong> (à exclure du PPTX final).
        </p>
      </div>

      <StudyTabs studyId={study.id} active="n1" completed={completed} />

      <N1ValidationPanel studyId={study.id} metiers={study.metiers} />

      <div className="flex justify-between">
        <Link
          href={`/studies/${study.id}/data`}
          className="px-4 py-2 text-sm text-gray-600 hover:text-navy"
        >
          ← Données
        </Link>
        <Link
          href={`/studies/${study.id}/generate`}
          className="px-5 py-2 bg-navy text-white rounded text-sm font-medium hover:bg-navy/90"
        >
          Étape suivante : Générer →
        </Link>
      </div>
    </div>
  );
}

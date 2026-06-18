import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StudyTabs } from "@/components/StudyTabs";
import { PlanMontagePanel } from "@/components/PlanMontagePanel";
import { getStudy } from "@/lib/store/studies";

export default async function StudyMontagePage({
  params,
}: {
  params: { id: string };
}) {
  const study = await getStudy(params.id);
  if (!study) notFound();

  const completed = {
    data: study.datasets.length > 0,
    n1: study.n1Runs.length > 0,
    montage: study.plan.some((b) => !b.enabled),
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
          Plan de montage du PPTX final. Active ou désactive chaque bloc avant
          génération. Les blocs désactivés sont silencieusement omis sans
          décaler les autres.
        </p>
      </div>

      <StudyTabs studyId={study.id} active="montage" completed={completed} />

      <PlanMontagePanel studyId={study.id} initialPlan={study.plan} />

      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-xs text-gray-500 bg-gray-50">
        <strong className="text-gray-700">Note v1 :</strong> le réordonnancement
        par drag-and-drop sera activé lorsque chaque bloc du générateur sera
        extrait en fonction indépendante. Pour l&apos;instant, seul l&apos;ordre
        par défaut est honoré (le code du générateur dicte la séquence).
        L&apos;activation / désactivation est pleinement fonctionnelle.
      </div>
    </div>
  );
}

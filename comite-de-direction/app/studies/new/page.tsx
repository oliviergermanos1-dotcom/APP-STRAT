import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const METIERS = [
  { code: "TIM", label: "Transit Import Maritime", unit: "TEU" },
  { code: "TEM", label: "Transit Export Maritime", unit: "TEU" },
  { code: "HIMP", label: "Hinterland Import", unit: "TEU" },
  { code: "HEXP", label: "Hinterland Export", unit: "TEU" },
  { code: "AER", label: "Aérien Import", unit: "kg" },
  { code: "DSM", label: "Direction Solutions Maritimes", unit: "T-éq" },
];

export default function NewStudyPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-navy"
      >
        <ArrowLeft className="h-3 w-3" />
        Retour au tableau de bord
      </Link>

      <div>
        <div className="text-xs uppercase tracking-widest text-gold font-semibold">
          Étape 1 / 5
        </div>
        <h1 className="text-2xl font-bold text-navy mt-1">Nouvelle étude</h1>
        <p className="text-sm text-gray-600 mt-2">
          Définis la période et les métiers à inclure. Tu pourras ensuite uploader les
          datasets, valider les nouveaux entrants N-1, injecter des slides externes, puis
          générer le PPTX final.
        </p>
      </div>

      <form
        action="/api/studies"
        method="POST"
        className="bg-white rounded-lg border border-gray-200 p-6 space-y-6 shadow-sm"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
            Titre de l&apos;étude
          </label>
          <input
            type="text"
            name="title"
            defaultValue={`AGL_Etude_${new Date().toLocaleDateString("fr-FR", {
              month: "long",
              year: "numeric",
            })}`}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
              Période — début
            </label>
            <input
              type="date"
              name="period_start"
              defaultValue="2026-01-01"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
              Période — fin
            </label>
            <input
              type="date"
              name="period_end"
              defaultValue="2026-05-31"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-3">
            Métiers à inclure
          </label>
          <div className="grid grid-cols-2 gap-3">
            {METIERS.map((m) => (
              <label
                key={m.code}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded hover:border-gold cursor-pointer"
              >
                <input
                  type="checkbox"
                  name="metiers"
                  value={m.code}
                  defaultChecked
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-navy">{m.code}</div>
                  <div className="text-xs text-gray-600">{m.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Unité : {m.unit}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-gray-600 hover:text-navy">
            Annuler
          </Link>
          <button
            type="submit"
            className="px-5 py-2 bg-navy text-white rounded text-sm font-medium hover:bg-navy/90"
          >
            Créer l&apos;étude →
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-xs text-gray-500 bg-gray-50">
        <strong className="text-gray-700">Note v0.1 :</strong> la persistance Supabase
        n&apos;est pas encore branchée. Le bouton &quot;Générer le PPTX&quot; du tableau de
        bord produit déjà l&apos;étude complète (34 slides, données DSM réelles
        incluses). Module N-1, injection PPTX externes et plan de montage : sessions
        suivantes.
      </div>
    </div>
  );
}

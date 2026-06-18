import Link from "next/link";
import {
  ArrowRight,
  Download,
  FileText,
  Plus,
  Sparkles,
} from "lucide-react";
import dsmData from "@/lib/pptx/data/dsm.json";
import { formatPdm, formatTon } from "@/lib/utils";

const KPIS = [
  { label: "Métiers couverts", value: "6", sub: "TIM · TEM · HIMP · HEXP · AER · DSM" },
  { label: "Slides générées", value: "34", sub: "33 standards + 1 DSM enrichie" },
  { label: "Marché DSM 2025", value: formatTon(dsmData.armateurs.market_total) + " T", sub: "Import hors PP" },
  {
    label: "PDM AGL consignataire",
    value: formatPdm(dsmData.consignataires.agl_pdm),
    sub: `#${dsmData.consignataires.agl_rank} — ${formatTon(dsmData.consignataires.agl_total)} T`,
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-gold font-semibold">
            Tableau de bord
          </div>
          <h1 className="text-3xl font-bold text-navy mt-1">
            Comité de Direction
          </h1>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">
            Plateforme de production des études de marché stratégiques d&apos;AGL Côte
            d&apos;Ivoire. Charte AGL stricte. Référentiel N-1 anti-faux-nouveaux. Données DSM
            Import 2025 chargées.
          </p>
        </div>
        <Link
          href="/studies/new"
          className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-md hover:bg-navy/90 transition text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Nouvelle étude
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {KPIS.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm"
          >
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              {kpi.label}
            </div>
            <div className="text-2xl font-bold text-navy mt-2">{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-navy">
              Module DSM — Données 2025 intégrées
            </h2>
            <span className="text-[10px] uppercase font-semibold bg-aglgreen/10 text-aglgreen px-2 py-1 rounded">
              Live
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                Top 5 Armateurs
              </div>
              <ul className="space-y-1">
                {dsmData.armateurs.top.slice(0, 5).map((r, i) => (
                  <li key={r.name} className="flex justify-between gap-2">
                    <span className="truncate text-gray-700">
                      <span className="text-gray-400 mr-1">#{i + 1}</span>
                      {r.name}
                    </span>
                    <span className="text-navy font-semibold tabular-nums">
                      {formatPdm(r.pdm)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                Top 5 Manutentionnaires
              </div>
              <ul className="space-y-1">
                {dsmData.manutentionnaires.top.slice(0, 5).map((r, i) => (
                  <li key={r.name} className="flex justify-between gap-2">
                    <span className="truncate text-gray-700">
                      <span className="text-gray-400 mr-1">#{i + 1}</span>
                      {r.name}
                    </span>
                    <span className="text-navy font-semibold tabular-nums">
                      {formatPdm(r.pdm)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                Top 5 Consignataires
              </div>
              <ul className="space-y-1">
                {dsmData.consignataires.top.slice(0, 5).map((r, i) => (
                  <li
                    key={r.name}
                    className={
                      r.name.toUpperCase().includes("AGL")
                        ? "flex justify-between gap-2 bg-gold/10 -mx-2 px-2 py-0.5 rounded"
                        : "flex justify-between gap-2"
                    }
                  >
                    <span className="truncate text-gray-700">
                      <span className="text-gray-400 mr-1">#{i + 1}</span>
                      {r.name}
                    </span>
                    <span className="text-navy font-semibold tabular-nums">
                      {formatPdm(r.pdm)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded text-xs text-gray-700">
            <strong className="text-aglorange">Insight :</strong> AGL CI =
            #{dsmData.consignataires.agl_rank} consignataire (
            {formatPdm(dsmData.consignataires.agl_pdm)}) mais seulement #
            {dsmData.manutentionnaires.agl_rank} manutentionnaire (
            {formatPdm(dsmData.manutentionnaires.agl_pdm)}). Gap stratégique de
            ~10 pts entre les 2 positions = levier prioritaire 2026.
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href="/api/generate"
            className="block bg-navy text-white rounded-lg p-5 hover:bg-navy/90 transition shadow-sm group"
          >
            <Download className="h-6 w-6 text-gold mb-3" />
            <div className="text-sm font-bold">Générer le PPTX</div>
            <div className="text-xs text-white/70 mt-1">
              Étude complète 34 slides — données DSM incluses
            </div>
            <div className="text-xs text-gold mt-3 flex items-center gap-1">
              Télécharger maintenant
              <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition" />
            </div>
          </Link>
          <Link
            href="/studies/new"
            className="block bg-white rounded-lg p-5 border border-gray-200 hover:border-gold transition shadow-sm"
          >
            <Sparkles className="h-6 w-6 text-gold mb-3" />
            <div className="text-sm font-bold text-navy">Nouvelle étude</div>
            <div className="text-xs text-gray-600 mt-1">
              Configurer période et métiers
            </div>
          </Link>
          <Link
            href="/studies/history"
            className="block bg-white rounded-lg p-5 border border-gray-200 hover:border-gold transition shadow-sm"
          >
            <FileText className="h-6 w-6 text-gold mb-3" />
            <div className="text-sm font-bold text-navy">Historique</div>
            <div className="text-xs text-gray-600 mt-1">
              Comparer études passées
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

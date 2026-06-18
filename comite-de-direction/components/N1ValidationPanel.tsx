"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ValidationResult, Verdict } from "@/lib/n1-validation/validate";
import { cn } from "@/lib/utils";

interface N1ValidationPanelProps {
  studyId: string;
  metiers: string[];
}

interface N1Run {
  metier: string;
  results: ValidationResult[];
  summary: Record<Verdict, number>;
}

const VERDICT_STYLE: Record<Verdict, { bg: string; text: string; icon: typeof ShieldCheck; label: string }> = {
  nouveau: {
    bg: "bg-aglgreen/10",
    text: "text-aglgreen",
    icon: ShieldCheck,
    label: "Nouveau",
  },
  marginal: {
    bg: "bg-aglorange/10",
    text: "text-aglorange",
    icon: ShieldQuestion,
    label: "Marginal",
  },
  existant: {
    bg: "bg-aglred/10",
    text: "text-aglred",
    icon: ShieldAlert,
    label: "Existant (exclu)",
  },
};

export function N1ValidationPanel({ studyId, metiers }: N1ValidationPanelProps) {
  const [metier, setMetier] = useState(metiers[0]);
  const [type, setType] = useState<"acteurs" | "marchandises">("acteurs");
  const [threshold, setThreshold] = useState(0.72);
  const [run, setRun] = useState<N1Run | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/validate/n1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyId,
          metier,
          type,
          similarityThreshold: threshold,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setRun({
        metier,
        results: json.run.results,
        summary: json.summary,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 grid grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
            Métier
          </label>
          <select
            value={metier}
            onChange={(e) => setMetier(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          >
            {metiers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "acteurs" | "marchandises")}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="acteurs">Acteurs (transitaires/clients)</option>
            <option value="marchandises">Marchandises</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
            Seuil similarité : {threshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={handleValidate}
          disabled={loading}
          className="px-4 py-2 bg-navy text-white rounded text-sm font-medium hover:bg-navy/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Valider N-1
        </button>
      </div>

      {error && (
        <div className="bg-aglred/10 border border-aglred/30 text-aglred text-sm rounded p-4">
          {error}
        </div>
      )}

      {run && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 grid grid-cols-3 gap-4">
            {(Object.keys(VERDICT_STYLE) as Verdict[]).map((v) => {
              const style = VERDICT_STYLE[v];
              const Icon = style.icon;
              return (
                <div key={v} className={cn("rounded p-3", style.bg)}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", style.text)} />
                    <div className="text-xs font-bold uppercase">
                      {style.label}
                    </div>
                  </div>
                  <div className={cn("text-2xl font-bold mt-1", style.text)}>
                    {run.summary[v]}
                  </div>
                </div>
              );
            })}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Entité</th>
                <th className="text-right px-4 py-2">Volume N</th>
                <th className="text-right px-4 py-2">Volume N-1</th>
                <th className="text-left px-4 py-2">Match</th>
                <th className="text-right px-4 py-2">Score</th>
                <th className="text-left px-4 py-2">Verdict</th>
                <th className="text-left px-4 py-2">Justification</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map((r) => {
                const style = VERDICT_STYLE[r.verdict];
                return (
                  <tr key={r.entityName} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-navy">
                      {r.entityName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.volumeN.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                      {r.volumeNMinus1.toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                      {r.matchedName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      {r.matchScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                          style.bg,
                          style.text,
                        )}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

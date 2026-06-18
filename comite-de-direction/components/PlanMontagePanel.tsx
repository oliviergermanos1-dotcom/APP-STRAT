"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Save } from "lucide-react";
import type { PlanBlock } from "@/lib/pptx/plan";
import { cn } from "@/lib/utils";

interface PlanMontagePanelProps {
  studyId: string;
  initialPlan: PlanBlock[];
}

const GROUP_COLORS: Record<string, string> = {
  Intro: "bg-gray-100 text-gray-700",
  TIM: "bg-aglblue/10 text-aglblue",
  TEM: "bg-aglgreen/10 text-aglgreen",
  HIMP: "bg-aglorange/10 text-aglorange",
  HEXP: "bg-aglteal/10 text-aglteal",
  AER: "bg-purple-100 text-purple-700",
  DSM: "bg-navy/10 text-navy",
  Focus: "bg-gold/10 text-yellow-700",
  Synthèse: "bg-aglred/10 text-aglred",
};

export function PlanMontagePanel({ studyId, initialPlan }: PlanMontagePanelProps) {
  const [plan, setPlan] = useState<PlanBlock[]>(initialPlan);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const enabledCount = useMemo(() => plan.filter((b) => b.enabled).length, [plan]);
  const groups = useMemo(() => {
    const out: Record<string, PlanBlock[]> = {};
    for (const b of plan) {
      out[b.group] = out[b.group] ?? [];
      out[b.group].push(b);
    }
    return out;
  }, [plan]);

  function toggle(key: string) {
    setPlan((current) =>
      current.map((b) => (b.key === key ? { ...b, enabled: !b.enabled } : b)),
    );
    setDirty(true);
    setSaved(null);
  }

  function toggleGroup(group: string, enable: boolean) {
    setPlan((current) =>
      current.map((b) => (b.group === group ? { ...b, enabled: enable } : b)),
    );
    setDirty(true);
    setSaved(null);
  }

  function resetAll() {
    setPlan((current) => current.map((b) => ({ ...b, enabled: true })));
    setDirty(true);
    setSaved(null);
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/studies/${studyId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setSaved(new Date().toLocaleTimeString("fr-FR"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-navy">
            {enabledCount} slides sur {plan.length} sélectionnées
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Décocher les blocs à exclure du PPTX final. La sauvegarde s&apos;applique à
            la prochaine génération.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-navy"
          >
            Tout réactiver
          </button>
          {saved && (
            <span className="text-xs text-aglgreen">Sauvé à {saved}</span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 bg-navy text-white rounded text-sm font-medium hover:bg-navy/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer le plan
          </button>
          <a
            href={`/api/generate?studyId=${studyId}`}
            className="px-4 py-2 bg-gold text-navy rounded text-sm font-bold hover:bg-gold/90 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Générer
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(groups).map(([group, blocks]) => {
          const allOn = blocks.every((b) => b.enabled);
          const allOff = blocks.every((b) => !b.enabled);
          return (
            <div key={group} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded",
                      GROUP_COLORS[group] ?? "bg-gray-200 text-gray-700",
                    )}
                  >
                    {group}
                  </span>
                  <span className="text-xs text-gray-500">
                    {blocks.filter((b) => b.enabled).length}/{blocks.length}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleGroup(group, true)}
                    disabled={allOn}
                    className="text-[10px] px-2 py-1 text-gray-600 hover:text-aglgreen disabled:opacity-30"
                  >
                    Tout
                  </button>
                  <button
                    onClick={() => toggleGroup(group, false)}
                    disabled={allOff}
                    className="text-[10px] px-2 py-1 text-gray-600 hover:text-aglred disabled:opacity-30"
                  >
                    Aucun
                  </button>
                </div>
              </div>
              <ul>
                {blocks.map((block) => (
                  <li key={block.key} className="border-t border-gray-100 first:border-t-0">
                    <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={block.enabled}
                        onChange={() => toggle(block.key)}
                        className="h-4 w-4"
                      />
                      <span
                        className={cn(
                          "flex-1 text-sm",
                          block.enabled ? "text-navy" : "text-gray-400 line-through",
                        )}
                      >
                        {block.label}
                      </span>
                      <span className="text-[10px] text-gray-400 tabular-nums">
                        #{block.order}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudyTabsProps {
  studyId: string;
  active: "data" | "n1" | "external" | "montage" | "generate";
  completed?: Partial<Record<StudyTabsProps["active"], boolean>>;
}

const TABS: Array<{ key: StudyTabsProps["active"]; label: string }> = [
  { key: "data", label: "① Données" },
  { key: "n1", label: "② Validation N-1" },
  { key: "external", label: "③ PPTX externes" },
  { key: "montage", label: "④ Plan de montage" },
  { key: "generate", label: "⑤ Générer" },
];

export function StudyTabs({ studyId, active, completed = {} }: StudyTabsProps) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const isDone = completed[tab.key];
          return (
            <Link
              key={tab.key}
              href={`/studies/${studyId}/${tab.key}`}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition",
                isActive
                  ? "border-gold text-navy font-semibold"
                  : "border-transparent text-gray-600 hover:text-navy hover:border-gray-300",
              )}
            >
              {isDone ? (
                <Check className="h-3.5 w-3.5 text-aglgreen" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-gray-300" />
              )}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

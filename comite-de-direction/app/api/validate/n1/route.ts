import { NextResponse } from "next/server";
import { z } from "zod";
import { addN1Run, getStudy } from "@/lib/store/studies";
import {
  summarizeVerdicts,
  validateNewEntrants,
  type Entity,
} from "@/lib/n1-validation/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  studyId: z.string().uuid(),
  metier: z.string(),
  type: z.enum(["acteurs", "marchandises"]).default("acteurs"),
  candidatesDatasetType: z.enum(["nouveaux", "concurrents", "clients"]).default("nouveaux"),
  similarityThreshold: z.number().min(0).max(1).default(0.72),
  marginalThreshold: z.number().min(0).max(1).default(0.3),
  growthThreshold: z.number().min(0).max(1).default(0.3),
});

function pickEntities(rows: unknown[]): Entity[] {
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      const name =
        (row.nom as string) ??
        (row.transitaire as string) ??
        (row.client as string) ??
        (row.nom_entite as string) ??
        "";
      const volume =
        Number(row.volume ?? row.volume_annuel_n1 ?? 0) || 0;
      return { name: String(name), volume };
    })
    .filter((e) => e.name.trim().length > 0);
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const {
    studyId,
    metier,
    type,
    candidatesDatasetType,
    similarityThreshold,
    marginalThreshold,
    growthThreshold,
  } = parsed.data;

  const study = await getStudy(studyId);
  if (!study) {
    return NextResponse.json({ error: "Étude introuvable" }, { status: 404 });
  }

  const candidatesDataset = study.datasets.find(
    (d) => d.metier === metier && d.datasetType === candidatesDatasetType,
  );
  const refDataset = study.datasets.find(
    (d) => d.metier === metier && d.datasetType === "referentiel_n1",
  );

  if (!candidatesDataset) {
    return NextResponse.json(
      { error: `Dataset candidats manquant : ${metier}/${candidatesDatasetType}` },
      { status: 422 },
    );
  }
  if (!refDataset) {
    return NextResponse.json(
      { error: `Référentiel N-1 manquant pour ${metier}` },
      { status: 422 },
    );
  }

  const candidates = pickEntities(candidatesDataset.rows);
  const reference = pickEntities(refDataset.rows);

  const results = validateNewEntrants(candidates, reference, {
    type,
    similarityThreshold,
    marginalThreshold,
    growthThreshold,
  });

  const run = await addN1Run(studyId, {
    metier,
    type,
    candidateCount: candidates.length,
    results,
    manualOverrides: {},
  });

  return NextResponse.json({
    run,
    summary: summarizeVerdicts(results),
  });
}

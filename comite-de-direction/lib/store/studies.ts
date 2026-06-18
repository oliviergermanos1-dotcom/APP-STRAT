/**
 * File-based store for studies pending the Supabase migration.
 *
 * Each study is persisted at `data/studies/{id}.json`. The shape mirrors the
 * Supabase tables described in DATA_MODEL.md so the migration to Postgres
 * stays purely mechanical.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatasetType } from "@/lib/parsers/schemas";
import type { ValidationResult } from "@/lib/n1-validation/validate";
import { DEFAULT_PLAN, type PlanBlock } from "@/lib/pptx/plan";

const STUDIES_DIR = path.join(process.cwd(), "data", "studies");

export interface StudyDataset {
  id: string;
  metier: string;
  datasetType: DatasetType;
  filename: string;
  uploadedAt: string;
  rowCount: number;
  errorCount: number;
  rows: unknown[];
}

export interface StudyN1Run {
  id: string;
  metier: string;
  type: "acteurs" | "marchandises";
  createdAt: string;
  candidateCount: number;
  results: ValidationResult[];
  manualOverrides: Record<string, "nouveau" | "marginal" | "existant">;
}

export interface Study {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  metiers: string[];
  status: "draft" | "generating" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
  datasets: StudyDataset[];
  n1Runs: StudyN1Run[];
  plan: PlanBlock[];
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(STUDIES_DIR, { recursive: true });
}

function studyPath(id: string): string {
  return path.join(STUDIES_DIR, `${id}.json`);
}

export async function listStudies(): Promise<Study[]> {
  await ensureDir();
  const files = await fs.readdir(STUDIES_DIR);
  const studies: Study[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(STUDIES_DIR, f), "utf8");
    studies.push(JSON.parse(raw));
  }
  return studies.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getStudy(id: string): Promise<Study | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(studyPath(id), "utf8");
    const parsed = JSON.parse(raw) as Study;
    // Backfill plan for studies created before plan_montage support landed.
    if (!parsed.plan || parsed.plan.length === 0) {
      parsed.plan = DEFAULT_PLAN.map((b) => ({ ...b }));
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function savePlan(
  studyId: string,
  plan: PlanBlock[],
): Promise<Study> {
  return updateStudy(studyId, { plan });
}

export async function createStudy(
  input: Pick<Study, "title" | "periodStart" | "periodEnd" | "metiers">,
): Promise<Study> {
  await ensureDir();
  const now = new Date().toISOString();
  const study: Study = {
    id: randomUUID(),
    ...input,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    datasets: [],
    n1Runs: [],
    plan: DEFAULT_PLAN.map((b) => ({ ...b })),
  };
  await fs.writeFile(studyPath(study.id), JSON.stringify(study, null, 2));
  return study;
}

export async function updateStudy(
  id: string,
  patch: Partial<Study>,
): Promise<Study> {
  const existing = await getStudy(id);
  if (!existing) throw new Error(`Étude introuvable : ${id}`);
  const updated: Study = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(studyPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function addDataset(
  studyId: string,
  dataset: Omit<StudyDataset, "id" | "uploadedAt">,
): Promise<StudyDataset> {
  const study = await getStudy(studyId);
  if (!study) throw new Error(`Étude introuvable : ${studyId}`);
  const newDataset: StudyDataset = {
    ...dataset,
    id: randomUUID(),
    uploadedAt: new Date().toISOString(),
  };
  study.datasets = [
    ...study.datasets.filter(
      (d) => !(d.metier === dataset.metier && d.datasetType === dataset.datasetType),
    ),
    newDataset,
  ];
  await updateStudy(studyId, { datasets: study.datasets });
  return newDataset;
}

export async function addN1Run(
  studyId: string,
  run: Omit<StudyN1Run, "id" | "createdAt">,
): Promise<StudyN1Run> {
  const study = await getStudy(studyId);
  if (!study) throw new Error(`Étude introuvable : ${studyId}`);
  const newRun: StudyN1Run = {
    ...run,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  study.n1Runs = [...study.n1Runs, newRun];
  await updateStudy(studyId, { n1Runs: study.n1Runs });
  return newRun;
}

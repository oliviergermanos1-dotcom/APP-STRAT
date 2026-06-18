import { NextResponse } from "next/server";
import { addDataset } from "@/lib/store/studies";
import { parseUploadedFile, validateDataset } from "@/lib/parsers";
import { DatasetTypeEnum, MetierEnum } from "@/lib/parsers/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const studyId = form.get("study_id");
  const metierRaw = form.get("metier");
  const datasetTypeRaw = form.get("dataset_type");
  const file = form.get("file");

  if (typeof studyId !== "string" || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Champs manquants (study_id, file requis)" },
      { status: 400 },
    );
  }

  const metierParsed = MetierEnum.safeParse(metierRaw);
  if (!metierParsed.success) {
    return NextResponse.json({ error: "Métier invalide" }, { status: 400 });
  }
  const hintParsed = datasetTypeRaw
    ? DatasetTypeEnum.safeParse(datasetTypeRaw)
    : { success: false } as const;
  const hint = hintParsed.success ? hintParsed.data : undefined;

  const parsed = await parseUploadedFile(file);
  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "Échec du parsing", details: parsed.errors },
      { status: 422 },
    );
  }

  const validated = validateDataset(parsed.columns, parsed.rows, hint);
  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error, columns: parsed.columns },
      { status: 422 },
    );
  }

  const dataset = await addDataset(studyId, {
    metier: metierParsed.data,
    datasetType: validated.type,
    filename: file.name,
    rowCount: validated.rowCount,
    errorCount: validated.errors.length,
    rows: validated.validRows,
  });

  return NextResponse.json({
    dataset,
    preview: validated.validRows.slice(0, 10),
    errors: validated.errors.slice(0, 50),
  });
}

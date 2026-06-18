import { z } from "zod";
import { parseCsv } from "./csv";
import { parseXlsx } from "./xlsx";
import {
  detectDatasetType,
  SCHEMAS,
  type DatasetType,
} from "./schemas";

export interface ValidatedDataset {
  type: DatasetType;
  rowCount: number;
  validRows: unknown[];
  errors: Array<{ row: number; field: string; message: string }>;
  raw: { columns: string[]; rows: Record<string, unknown>[] };
}

export async function parseUploadedFile(
  file: File,
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; errors: string[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    const text = await file.text();
    return parseCsv(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    return parseXlsx(buf);
  }
  return {
    columns: [],
    rows: [],
    errors: [`Format de fichier non supporté : ${file.name}`],
  };
}

export function validateDataset(
  columns: string[],
  rows: Record<string, unknown>[],
  hint?: DatasetType,
): ValidatedDataset | { error: string } {
  const type = hint ?? detectDatasetType(columns);
  if (!type) {
    return {
      error:
        "Type de dataset non reconnu. Colonnes attendues : transitaire/client/segment/mois/nom/nom_entite.",
    };
  }

  const schema = SCHEMAS[type];
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const valid: unknown[] = [];

  rows.forEach((row, idx) => {
    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      for (const issue of (result.error as z.ZodError).issues) {
        errors.push({
          row: idx + 2,
          field: issue.path.join("."),
          message: issue.message,
        });
      }
    }
  });

  return {
    type,
    rowCount: rows.length,
    validRows: valid,
    errors,
    raw: { columns, rows },
  };
}

export { detectDatasetType, SCHEMAS };
export type { DatasetType } from "./schemas";

import * as XLSX from "xlsx";
import type { ParsedTable } from "./csv";

export function parseXlsx(buffer: ArrayBuffer): ParsedTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return { columns: [], rows: [], errors: ["Classeur vide"], separator: "," };
  }
  const ws = wb.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });

  const columns =
    json.length > 0
      ? Object.keys(json[0]).map((k) => k.trim().toLowerCase())
      : [];

  const rows = json.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim().toLowerCase()] = v;
    return out;
  });

  return { columns, rows, errors: [], separator: "," };
}

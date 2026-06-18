import Papa from "papaparse";

export interface ParsedTable {
  columns: string[];
  rows: Record<string, unknown>[];
  errors: string[];
  separator: "," | ";" | "\t";
}

function detectSeparator(sample: string): "," | ";" | "\t" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  const best = (Object.keys(counts) as Array<keyof typeof counts>).reduce((a, b) =>
    counts[a] >= counts[b] ? a : b,
  );
  return counts[best] > 0 ? best : ",";
}

export function parseCsv(content: string): ParsedTable {
  const separator = detectSeparator(content);
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: separator,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const errors = parsed.errors.map(
    (e) => `Ligne ${e.row ?? "?"} (${e.code}): ${e.message}`,
  );

  const columns = parsed.meta.fields?.map((f) => f.trim().toLowerCase()) ?? [];
  return { columns, rows: parsed.data, errors, separator };
}

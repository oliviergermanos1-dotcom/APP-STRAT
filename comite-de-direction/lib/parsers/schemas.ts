import { z } from "zod";

const METIERS = ["TIM", "TEM", "HIMP", "HEXP", "AER", "DSM"] as const;
export type Metier = (typeof METIERS)[number];
export const MetierEnum = z.enum(METIERS);

const DATASET_TYPES = [
  "concurrents",
  "clients",
  "segments",
  "mensuel",
  "nouveaux",
  "referentiel_n1",
] as const;
export type DatasetType = (typeof DATASET_TYPES)[number];
export const DatasetTypeEnum = z.enum(DATASET_TYPES);

/** Coerce a comma- or space-separated French number into a JS number. */
const FrenchNumber = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const cleaned = v.replace(/\s/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  });

export const ConcurrentsRowSchema = z.object({
  rang: z.union([z.string(), z.number()]).optional(),
  transitaire: z.string().min(1),
  volume: FrenchNumber,
  pdm: FrenchNumber.optional(),
});
export type ConcurrentsRow = z.infer<typeof ConcurrentsRowSchema>;

export const ClientsRowSchema = z.object({
  client: z.string().min(1),
  volume: FrenchNumber,
  segment: z.string().optional(),
  pct_vol_agl: FrenchNumber.optional(),
});
export type ClientsRow = z.infer<typeof ClientsRowSchema>;

export const SegmentsRowSchema = z.object({
  segment: z.string().min(1),
  volume_marche: FrenchNumber,
  pdm_agl: FrenchNumber.optional(),
});
export type SegmentsRow = z.infer<typeof SegmentsRowSchema>;

export const MensuelRowSchema = z.object({
  mois: z.string().min(1),
  volume_marche: FrenchNumber,
  volume_agl: FrenchNumber,
  pdm_agl: FrenchNumber.optional(),
});
export type MensuelRow = z.infer<typeof MensuelRowSchema>;

export const NouveauxRowSchema = z.object({
  nom: z.string().min(1),
  volume: FrenchNumber,
  segment: z.string().optional(),
  trimestre: z.string().optional(),
});
export type NouveauxRow = z.infer<typeof NouveauxRowSchema>;

export const ReferentielN1RowSchema = z.object({
  nom_entite: z.string().min(1),
  metier: MetierEnum.optional(),
  volume_annuel_n1: FrenchNumber,
});
export type ReferentielN1Row = z.infer<typeof ReferentielN1RowSchema>;

export const SCHEMAS = {
  concurrents: ConcurrentsRowSchema,
  clients: ClientsRowSchema,
  segments: SegmentsRowSchema,
  mensuel: MensuelRowSchema,
  nouveaux: NouveauxRowSchema,
  referentiel_n1: ReferentielN1RowSchema,
} as const;

/** Detect the dataset type from the column names of a parsed CSV/XLSX. */
export function detectDatasetType(columns: string[]): DatasetType | null {
  const cols = new Set(columns.map((c) => c.toLowerCase().trim()));
  if (cols.has("transitaire") && cols.has("volume")) return "concurrents";
  if (cols.has("client") && cols.has("volume")) return "clients";
  if (cols.has("segment") && cols.has("volume_marche")) return "segments";
  if (cols.has("mois") && cols.has("volume_marche")) return "mensuel";
  if (cols.has("nom") && cols.has("volume") && (cols.has("segment") || cols.has("trimestre")))
    return "nouveaux";
  if (cols.has("nom_entite") && cols.has("volume_annuel_n1")) return "referentiel_n1";
  return null;
}

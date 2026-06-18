/**
 * Default plan_montage — list of slide block keys in the order they appear
 * in the generator's imperative code (lib/pptx/generator.js).
 *
 * Each key corresponds to exactly one `pptx.addSlide()` call inside the
 * generator. When the generator is called with a custom plan, the wrapper
 * checks each key against the plan's `enabled` flag and silently swallows
 * disabled slides.
 *
 * v1 LIMITATION: reordering is not honoured (the generator runs in code
 * order). Drag-and-drop is preserved for UX consistency and will become
 * effective once each block is extracted into its own render function.
 */
export type PlanBlockKey =
  | "cover"
  | "sommaire"
  | "sep_TIM"
  | "TIM_vue_ensemble"
  | "TIM_concurrents"
  | "TIM_clientele"
  | "TIM_nouveaux_entrants"
  | "sep_TEM"
  | "TEM_vue_ensemble"
  | "TEM_segments_concurrents"
  | "TEM_clientele"
  | "TEM_nouveaux_chargeurs"
  | "sep_HIMP"
  | "HIMP_vue_ensemble"
  | "HIMP_concurrents"
  | "HIMP_nouveaux_entrants"
  | "sep_HEXP"
  | "HEXP_vue_ensemble"
  | "HEXP_nouveaux_chargeurs"
  | "sep_AER"
  | "AER_vue_ensemble"
  | "AER_segments_concurrents"
  | "AER_clientele"
  | "AER_nouveaux_entrants"
  | "sep_DSM"
  | "DSM_armateurs"
  | "DSM_manutentionnaires"
  | "DSM_consignataires_pol"
  | "focus_petrole"
  | "focus_minier_ci"
  | "focus_minier_hinterland"
  | "ayman_synthese"
  | "ayman_analyse"
  | "sep_actions"
  | "synthese_finale";

export interface PlanBlock {
  key: PlanBlockKey;
  label: string;
  metier: string | null;
  group: string;
  enabled: boolean;
  /** Display-order in the UI list. Generator currently always uses default. */
  order: number;
}

export const DEFAULT_PLAN: PlanBlock[] = [
  { key: "cover",                     label: "Couverture",                          metier: null,     group: "Intro",   enabled: true, order: 1  },
  { key: "sommaire",                  label: "Sommaire",                            metier: null,     group: "Intro",   enabled: true, order: 2  },
  { key: "sep_TIM",                   label: "Séparateur — TIM",                    metier: "TIM",    group: "TIM",     enabled: true, order: 3  },
  { key: "TIM_vue_ensemble",          label: "TIM — Vue d'ensemble",                metier: "TIM",    group: "TIM",     enabled: true, order: 4  },
  { key: "TIM_concurrents",           label: "TIM — Concurrents & segments",        metier: "TIM",    group: "TIM",     enabled: true, order: 5  },
  { key: "TIM_clientele",             label: "TIM — Clientèle",                     metier: "TIM",    group: "TIM",     enabled: true, order: 6  },
  { key: "TIM_nouveaux_entrants",     label: "TIM — Nouveaux entrants",             metier: "TIM",    group: "TIM",     enabled: true, order: 7  },
  { key: "sep_TEM",                   label: "Séparateur — TEM",                    metier: "TEM",    group: "TEM",     enabled: true, order: 8  },
  { key: "TEM_vue_ensemble",          label: "TEM — Vue d'ensemble",                metier: "TEM",    group: "TEM",     enabled: true, order: 9  },
  { key: "TEM_segments_concurrents",  label: "TEM — Segments & concurrents",        metier: "TEM",    group: "TEM",     enabled: true, order: 10 },
  { key: "TEM_clientele",             label: "TEM — Clientèle",                     metier: "TEM",    group: "TEM",     enabled: true, order: 11 },
  { key: "TEM_nouveaux_chargeurs",    label: "TEM — Nouveaux chargeurs",            metier: "TEM",    group: "TEM",     enabled: true, order: 12 },
  { key: "sep_HIMP",                  label: "Séparateur — Hinterland Import",      metier: "HIMP",   group: "HIMP",    enabled: true, order: 13 },
  { key: "HIMP_vue_ensemble",         label: "HIMP — Vue d'ensemble",               metier: "HIMP",   group: "HIMP",    enabled: true, order: 14 },
  { key: "HIMP_concurrents",          label: "HIMP — Concurrents",                  metier: "HIMP",   group: "HIMP",    enabled: true, order: 15 },
  { key: "HIMP_nouveaux_entrants",    label: "HIMP — Nouveaux entrants",            metier: "HIMP",   group: "HIMP",    enabled: true, order: 16 },
  { key: "sep_HEXP",                  label: "Séparateur — Hinterland Export",      metier: "HEXP",   group: "HEXP",    enabled: true, order: 17 },
  { key: "HEXP_vue_ensemble",         label: "HEXP — Vue d'ensemble",               metier: "HEXP",   group: "HEXP",    enabled: true, order: 18 },
  { key: "HEXP_nouveaux_chargeurs",   label: "HEXP — Nouveaux chargeurs",           metier: "HEXP",   group: "HEXP",    enabled: true, order: 19 },
  { key: "sep_AER",                   label: "Séparateur — Aérien",                 metier: "AER",    group: "AER",     enabled: true, order: 20 },
  { key: "AER_vue_ensemble",          label: "AER — Vue d'ensemble",                metier: "AER",    group: "AER",     enabled: true, order: 21 },
  { key: "AER_segments_concurrents",  label: "AER — Segments & concurrents",        metier: "AER",    group: "AER",     enabled: true, order: 22 },
  { key: "AER_clientele",             label: "AER — Clientèle",                     metier: "AER",    group: "AER",     enabled: true, order: 23 },
  { key: "AER_nouveaux_entrants",     label: "AER — Nouveaux entrants",             metier: "AER",    group: "AER",     enabled: true, order: 24 },
  { key: "sep_DSM",                   label: "Séparateur — DSM",                    metier: "DSM",    group: "DSM",     enabled: true, order: 25 },
  { key: "DSM_armateurs",             label: "DSM — Armateurs au B/L",              metier: "DSM",    group: "DSM",     enabled: true, order: 26 },
  { key: "DSM_manutentionnaires",     label: "DSM — Manutentionnaires",             metier: "DSM",    group: "DSM",     enabled: true, order: 27 },
  { key: "DSM_consignataires_pol",    label: "DSM — Consignataires & POL",          metier: "DSM",    group: "DSM",     enabled: true, order: 28 },
  { key: "focus_petrole",             label: "Focus Pétrole",                       metier: "PETROLE", group: "Focus",  enabled: true, order: 29 },
  { key: "focus_minier_ci",           label: "Focus Minier — Master-list CI",       metier: "MINIER", group: "Focus",   enabled: true, order: 30 },
  { key: "focus_minier_hinterland",   label: "Focus Minier — Hinterland BF/Mali",   metier: "MINIER", group: "Focus",   enabled: true, order: 31 },
  { key: "ayman_synthese",            label: "Focus AYMAN — Synthèse",              metier: "AYMAN",  group: "Focus",   enabled: true, order: 32 },
  { key: "ayman_analyse",             label: "Focus AYMAN — Analyse détaillée",     metier: "AYMAN",  group: "Focus",   enabled: true, order: 33 },
  { key: "sep_actions",               label: "Séparateur — Actions stratégiques",   metier: null,     group: "Synthèse", enabled: true, order: 34 },
  { key: "synthese_finale",           label: "Synthèse finale — PDM par métier",    metier: null,     group: "Synthèse", enabled: true, order: 35 },
];

/** Array of keys in code-execution order — fed to the generator wrapper. */
export const BLOCK_SEQUENCE: PlanBlockKey[] = DEFAULT_PLAN.map((b) => b.key);

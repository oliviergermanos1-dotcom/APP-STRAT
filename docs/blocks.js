// CommonJS twin of lib/pptx/plan.ts — the JS generator (which runs in plain
// Node / Next.js Server Component) imports this to know the slide sequence.
// Keep in sync with plan.ts (single source of truth would require a TS build
// step for the generator, which we avoid for v1).

const BLOCK_SEQUENCE = [
  "cover",
  "sommaire",
  "sep_TIM",
  "TIM_vue_ensemble",
  "TIM_concurrents",
  "TIM_clientele",
  "TIM_nouveaux_entrants",
  "sep_TEM",
  "TEM_vue_ensemble",
  "TEM_segments_concurrents",
  "TEM_clientele",
  "TEM_nouveaux_chargeurs",
  "sep_HIMP",
  "HIMP_vue_ensemble",
  "HIMP_concurrents",
  "HIMP_nouveaux_entrants",
  "sep_HEXP",
  "HEXP_vue_ensemble",
  "HEXP_nouveaux_chargeurs",
  "sep_AER",
  "AER_vue_ensemble",
  "AER_segments_concurrents",
  "AER_clientele",
  "AER_nouveaux_entrants",
  "sep_DSM",
  "DSM_armateurs",
  "DSM_manutentionnaires",
  "DSM_consignataires_pol",
  "focus_petrole",
  "focus_minier_ci",
  "focus_minier_hinterland",
  "ayman_synthese",
  "ayman_analyse",
  "sep_actions",
  "synthese_finale",
];

window.BLOCK_SEQUENCE = BLOCK_SEQUENCE;

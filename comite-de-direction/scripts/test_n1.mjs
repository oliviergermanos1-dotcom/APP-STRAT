// Smoke test for N-1 validation. Run: node scripts/test_n1.mjs
// We compile via tsx-on-the-fly is not available; instead we inline the algorithm via dynamic import.
// Simplest path: compile to JS via swc or just exercise through fetch once the dev server is up.
// Here we exercise the algorithm by direct relative import after compiling on the fly via esbuild stdin.

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

mkdirSync(".tmp-test", { recursive: true });

writeFileSync(
  ".tmp-test/run.ts",
  `
import { validateNewEntrants, summarizeVerdicts } from "../lib/n1-validation/validate";
const candidates = [
  { name: "ORANGE CI", volume: 680 },
  { name: "STRACOTRANS CI", volume: 14000 },
  { name: "K1 Mining S.A. (CI)", volume: 1531 },
  { name: "NESTLE COTE D'IVOIRE", volume: 420 },
];
const reference = [
  { name: "STRACOTRANS CÔTE D'IVOIRE", volume: 32410 },
  { name: "K1 MINING SA CI", volume: 800 },
  { name: "NESTLE CI", volume: 380 },
];
const results = validateNewEntrants(candidates, reference);
console.log(JSON.stringify({ summary: summarizeVerdicts(results), results }, null, 2));
`,
);

execSync(
  "npx --yes tsx .tmp-test/run.ts",
  { stdio: "inherit", cwd: process.cwd() },
);

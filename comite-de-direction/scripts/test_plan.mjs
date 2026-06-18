import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { generateStudyBuffer } = require("../lib/pptx/generator.js");
const { BLOCK_SEQUENCE } = require("../lib/pptx/blocks.js");
const { default: AdmZip } = await import("adm-zip");

function countSlides(buffer) {
  const zip = new AdmZip(buffer);
  return zip.getEntries().filter((e) => e.entryName.startsWith("ppt/slides/slide"))
    .length;
}

// 1. No plan → all 35
const full = await generateStudyBuffer();
console.log(`full default: ${countSlides(full)} slides (expect 35)`);

// 2. Plan with only TIM enabled (drop everything else)
const onlyTIM = BLOCK_SEQUENCE.map((k) => ({
  key: k,
  enabled: k === "cover" || k === "sommaire" || k.startsWith("TIM_") || k === "sep_TIM" || k === "synthese_finale",
}));
const tim = await generateStudyBuffer({ plan: onlyTIM });
console.log(`TIM-only: ${countSlides(tim)} slides (expect 8 = cover+sommaire+sep_TIM+4×TIM+synthese)`);

// 3. Drop AYMAN focus
const noAyman = BLOCK_SEQUENCE.map((k) => ({
  key: k,
  enabled: !k.startsWith("ayman_"),
}));
const dropped = await generateStudyBuffer({ plan: noAyman });
console.log(`no AYMAN: ${countSlides(dropped)} slides (expect 33)`);

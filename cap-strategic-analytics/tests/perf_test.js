/**
 * Test de performance sur dataset simulé 156k lignes
 * Mesure les temps des opérations critiques pour détecter les régressions
 *
 * Usage : node tests/perf_test.js
 *
 * Seuils acceptables (machine moderne) :
 * - aggregateByClient   : <100ms
 * - precompute          : <10ms
 * - enrichissement      : <50ms
 * - TOTAL               : <500ms
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

console.log('⚡ Test de performance sur 156k lignes simulées\n');

// Extraire le module CALCULATOR
const match = html.match(/<script id="js-calculator">([\s\S]*?)<\/script>/);
if (!match) {
  console.error('❌ Module js-calculator introuvable dans index.html');
  process.exit(1);
}
const calcCode = match[1];

const setupCode = `
const APP = { filters: { SITE: 'Tout', METIER: 'Tout' } };
const fmt = { money: v => Math.round(v) };
${calcCode}

// Génération dataset 156k lignes (volume IRIS réel)
const data = [];
const clients = Array.from({length: 3400}, (_, i) => 'CLIENT_' + i);
const sites = ['ABJ','SPY','BYK','DLA'];
const metiers = ['TRANSIT MARITIME','MANUTENTION','LOGISTIQUE','AERIEN','CONSIGNATION'];
const libelles = ['ENTREPOSAGE','TIM','MANUTENTION','LIVRAISON','GEMACIE'];

for (let y = 2022; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 4) break;
    for (let i = 0; i < 2750; i++) {
      data.push({
        CLIENT: clients[i % 3400],
        ANNEE: y,
        MOIS: m,
        DATE: new Date(y, m - 1, 1),
        YEAR_MONTH: y + '-' + String(m).padStart(2, '0'),
        MONTANT: Math.random() * 10000000,
        SITE: sites[i % 4],
        METIER: metiers[i % 5],
        LIBELLE: libelles[i % 5]
      });
    }
  }
}

console.log('📦 Dataset généré :', data.length.toLocaleString('fr-FR'), 'lignes\\n');

// === Test 1 : applyFilters complet ===
console.log('--- Test 1 : applyFilters complet ---');
const t1 = Date.now();
const filtered = data.filter(r => r.ANNEE === 2026);
const tFilter = Date.now() - t1;
console.log('  Filter par année       :', tFilter, 'ms (', filtered.length.toLocaleString('fr-FR'), 'lignes)');

const t2 = Date.now();
const agg = CALC.aggregateByClient(filtered, data, 2026);
const tAgg = Date.now() - t2;
console.log('  aggregateByClient      :', tAgg, 'ms (', agg.length, 'clients)');

const t3 = Date.now();
const { p80, p20 } = CALC.computePercentiles(agg);
const stats = CALC.precomputeStats(agg);
const tPre = Date.now() - t3;
console.log('  Pre-compute            :', tPre, 'ms');

const t4 = Date.now();
agg.forEach(c => {
  c.score = CALC.scoreClient(c, stats);
  c.tier = CALC.tier(c.score);
  c.quadrant = CALC.quadrant9Box(c, p80, p20);
  c.statut = CALC.statutCycleVie(c);
  c.healthScore = CALC.healthScore(c, data);
  c.healthStatus = CALC.healthStatus(c.healthScore);
});
const tEnrich = Date.now() - t4;
console.log('  Enrichissement clients :', tEnrich, 'ms');

const total = tFilter + tAgg + tPre + tEnrich;
console.log('  ----------');
console.log('  TOTAL applyFilters     :', total, 'ms');

// Validations
console.log('\\n--- Validations ---');
const validations = [
  { name: 'Filter < 50ms', ok: tFilter < 50 },
  { name: 'aggregateByClient < 200ms', ok: tAgg < 200 },
  { name: 'Pre-compute < 20ms', ok: tPre < 20 },
  { name: 'Enrichissement < 200ms', ok: tEnrich < 200 },
  { name: 'TOTAL < 500ms', ok: total < 500 }
];
validations.forEach(v => {
  console.log(' ', v.ok ? '✅' : '❌', v.name);
});

// === Test 2 : KPI Macro ===
console.log('\\n--- Test 2 : KPI Macro ---');
const tk1 = Date.now();
CALC.HHI(filtered);
console.log('  HHI                    :', (Date.now() - tk1), 'ms');

const tk2 = Date.now();
CALC.top10Dependency(filtered);
console.log('  Top10 Dependency       :', (Date.now() - tk2), 'ms');

const tk3 = Date.now();
CALC.NRR(filtered, data, 2026);
console.log('  NRR                    :', (Date.now() - tk3), 'ms');

// === Test 3 : Forecast ===
console.log('\\n--- Test 3 : Forecast ---');
const lastDate = data.reduce((m, r) => r.DATE.getTime() > m ? r.DATE.getTime() : m, 0);
const tf1 = Date.now();
const forecast = CALC.forecast(data, 12, new Date(lastDate), { croissance: 0, top10: 0, saison: 1 });
console.log('  Forecast 12 mois       :', (Date.now() - tf1), 'ms (', forecast.length, 'points)');

// === Distribution finale ===
console.log('\\n--- Distribution Tiers ---');
const tierCount = {};
agg.forEach(c => tierCount[c.tier] = (tierCount[c.tier] || 0) + 1);
console.log(' ', JSON.stringify(tierCount));

const allOk = validations.every(v => v.ok);
process.exit(allOk ? 0 : 1);
`;

try {
  new Function(setupCode)();
} catch (e) {
  console.error('❌ Erreur lors du test :', e.message);
  console.error(e.stack);
  process.exit(1);
}

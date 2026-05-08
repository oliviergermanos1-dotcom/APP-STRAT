/**
 * Validation syntaxe JS du fichier index.html
 * Extrait tous les blocs <script> inline et tente de les parser.
 * 
 * Usage : node tests/validate_syntax.js
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

console.log('🔍 Validation syntaxe JS de index.html\n');

if (!fs.existsSync(HTML_PATH)) {
  console.error('❌ Fichier introuvable :', HTML_PATH);
  process.exit(1);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const scripts = html.match(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g) || [];

let totalErrors = 0;
let totalScripts = 0;
let totalChars = 0;

scripts.forEach((script, i) => {
  // Extraire le contenu et l'attribut id si présent
  const idMatch = script.match(/<script[^>]*id="([^"]+)"/);
  const id = idMatch ? idMatch[1] : `script-${i + 1}`;
  
  const content = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
  
  // Sauter les scripts CDN (avec src)
  if (script.includes('src=')) {
    console.log(`  ⏩ ${id} : CDN externe (sauté)`);
    return;
  }
  
  if (!content.trim()) {
    return;
  }
  
  totalScripts++;
  totalChars += content.length;
  
  try {
    new Function(content);
    console.log(`  ✅ ${id.padEnd(20)} OK (${content.length.toLocaleString('fr-FR')} chars)`);
  } catch (e) {
    totalErrors++;
    console.log(`  ❌ ${id.padEnd(20)} ERREUR :`);
    console.log(`     ${e.message.substring(0, 200)}`);
    
    // Essayer de localiser l'erreur
    const lineMatch = e.message.match(/line (\d+)/i);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1]);
      const lines = content.split('\n');
      const ctxStart = Math.max(0, lineNum - 3);
      const ctxEnd = Math.min(lines.length, lineNum + 2);
      console.log(`     Contexte (lignes ${ctxStart + 1} à ${ctxEnd}) :`);
      for (let li = ctxStart; li < ctxEnd; li++) {
        const marker = li + 1 === lineNum ? '>>>' : '   ';
        console.log(`     ${marker} ${li + 1}: ${lines[li]?.substring(0, 100)}`);
      }
    }
  }
});

console.log('\n' + '='.repeat(60));
console.log(`📊 Résultat : ${totalScripts} scripts validés (${totalChars.toLocaleString('fr-FR')} chars)`);

if (totalErrors === 0) {
  console.log('✅ Aucune erreur de syntaxe détectée');
  process.exit(0);
} else {
  console.log(`❌ ${totalErrors} erreur(s) de syntaxe détectée(s)`);
  process.exit(1);
}

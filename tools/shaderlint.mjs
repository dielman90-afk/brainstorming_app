// Backticks in Kommentaren innerhalb eines Template-Literals brechen den
// Shader-String — der Build-Fehler zeigt dann auf die Kommentarzeile und sagt
// „Expected , or }". Das steht seit Runde 6 in den bezahlten Lehren, und ich
// bin in dieser Runde dreimal hineingelaufen. Deshalb eine Prüfung, die es
// **vor** dem Build meldet und die Zeile nennt.
//
//   node tools/shaderlint.mjs [datei …]     Vorgabe: src/**/*.js
import fs from 'node:fs';
import path from 'node:path';

const dateien = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (function sammeln(dir, aus = []) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) sammeln(p, aus);
        else if (e.name.endsWith('.js')) aus.push(p);
      }
      return aus;
    })('src');

let funde = 0;
for (const datei of dateien) {
  const zeilen = fs.readFileSync(datei, 'utf8').split('\n');
  // Grobe, aber ausreichende Zustandsmaschine: Ein Template-Literal beginnt
  // mit einem Backtick, der nicht in einem Kommentar steht, und endet am
  // nächsten. Innerhalb davon ist jeder weitere Backtick ein Fehler, wenn die
  // Zeile mit // beginnt.
  let drin = false;
  zeilen.forEach((zeile, i) => {
    const getrimmt = zeile.trim();
    // Ein **maskierter** Backtick ist erlaubt und kommt vor – er bricht das
    // Literal nicht. Nur unmaskierte zählen.
    const unmaskiert = zeile.replace(/\\`/g, '');
    if (drin && getrimmt.startsWith('//') && unmaskiert.includes('`')) {
      process.stdout.write(`${datei}:${i + 1}  Backtick im Kommentar innerhalb eines Template-Literals\n    ${getrimmt.slice(0, 100)}\n`);
      funde++;
    }
    // Backticks in dieser Zeile zählen – ungerade Zahl kippt den Zustand.
    if (!getrimmt.startsWith('//')) {
      const n = (unmaskiert.match(/`/g) || []).length;
      if (n % 2 === 1) drin = !drin;
    }
  });
}
process.stdout.write(funde ? `\n${funde} Fund(e).\n` : 'Keine Backticks in Shader-Kommentaren.\n');
process.exit(funde ? 1 : 0);

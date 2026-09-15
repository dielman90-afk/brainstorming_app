// Helle Punkte **innerhalb** einer dunklen Geländesilhouette finden.
//
//   node tools/silhouette.mjs <bild.png> [band]
//
// Der Anlass ist ein konkreter Mangel des Nachthimmels: Die Sternschalen liegen
// bei 38 bis 40 m, die Bodenfläche reicht bis 48 m (an den Ecken bis 68 m).
// Alles Gelände, das weiter weg ist als die Schale, wird von den Sternen
// überzeichnet — die Sterne stehen dann *vor* dem Boden. Im Bild ist das ein
// Sternenfeld, das über eine schwarze Bergsilhouette weiterläuft.
//
// Mit bloßem Auge ist das leicht zu übersehen und noch leichter zu behaupten.
// Dieses Werkzeug macht eine Zahl daraus:
//
//   1. Je Bildspalte die Geländekante suchen — die oberste Zeile, ab der 35
//      Zeilen am Stück heller als L 7 sind (der Himmel zwischen den Sternen
//      liegt bei L 2 bis 4, das Gelände auch im Dunkeln über 8).
//   2. In einem Band unterhalb dieser Kante nach Punkten suchen, die deutlich
//      über ihrer 11x11-Umgebung liegen, während diese Umgebung dunkel ist.
//
// **Die Schwellen der ersten Fassung waren zu weich, und der Prüfer hat es
// gemerkt, bevor ich es gemerkt habe.** „Umgebung < 32 und Punkt > Umgebung +
// 18" hat unter dem neuen streifenden Mondlicht Felsfacetten und
// Kontaktkanten mitgezählt: `c-crater` sprang von 18 auf 101 Treffer, `e-ground`
// von 10 auf 179 — sämtlich bei L 47 bis 70, also Gestein, kein Stern. Ein
// Messwerkzeug, das auf eine Beleuchtungsänderung reagiert, misst nicht mehr
// das, wofür es gebaut wurde.
//
// Ein Stern vor dem Gelände ist ein **sehr** heller Punkt in einer **sehr**
// dunklen Umgebung: gemessen L 129 bis 135 bei Umgebungswerten von 13 bis 17.
// Eine belichtete Felsfacette ist heller als ihre Umgebung, aber ihre Umgebung
// ist es auch. Deshalb drei Bedingungen statt zwei, und alle drei hart:
//
//   * Punkt heller als `--min` (Vorgabe 100)
//   * Umgebung dunkler als 30
//   * Abstand zur Umgebung über 40 Stufen
//
// Gemeldet wird die Anzahl und eine Kostprobe mit Koordinate, Punkthelligkeit
// und Umgebungshelligkeit.
//
// **Und dann ist die Voraussetzung ein zweites Mal weggebrochen.** Die
// Kantensuche oben hängt daran, dass der Himmel dunkler als L 7 ist. Der
// Nachthimmel trägt inzwischen einen Verlauf und Luftglühen; am oberen Bildrand
// stehen L 9 bis 16. Damit ist die Bedingung „35 Zeilen am Stück heller als 7"
// schon in der ersten geprüften Zeile erfüllt, die Kante wird bei y = 40
// gefunden, und das Werkzeug zählt gewöhnliche Sterne **im Himmel** — oder
// meldet null, weil es unterhalb seiner Scheinkante nichts findet.
//
// Der Prüfer hat das aufgedeckt, nachdem er von Hand 104 Sterne vor dem Gelände
// in `rund-210` gefunden hatte, während dieses Werkzeug schwieg. Sein Satz
// dazu: „Wer diesem Werkzeug eine 0 entnommen hat, hat nichts gemessen."
//
// Deshalb prüft es jetzt **seine eigene Voraussetzung** und verweigert die
// Auskunft, statt eine falsche zu geben. Eine bessere Kantensuche wäre die
// falsche Antwort: Jede Schwelle über der Helligkeit bricht beim nächsten Mal
// wieder. Wer die Zahl wirklich braucht, nimmt `tools/sterne-hinter.mjs` — das
// rät nicht, sondern schaltet das Sternfeld ab und vergleicht.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const datei = process.argv[2];
const band = +(process.argv[3] ?? 90);
const minArg = process.argv.indexOf('--min');
const MIN_PUNKT = minArg > 0 ? +process.argv[minArg + 1] : 100;
const MAX_UMGEBUNG = 30;
const MIN_ABSTAND = 40;
const p = PNG.sync.read(fs.readFileSync(datei));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
const umgebung = (x, y) => {
  let s = 0;
  let n = 0;
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= p.width || yy >= p.height) continue;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue; // den Punkt selbst aussparen
      s += L(xx, yy);
      n++;
    }
  }
  return s / n;
};

// --- Selbstprüfung: hält die Annahme über den Himmel noch? ------------------
//
// Gemessen wird der Median der obersten 26 Zeilen. Dort ist in jeder Prüfkamera
// Himmel; wären Sterne der Grund für einen hohen Wert, träfe es den Median
// nicht, denn sie belegen weit unter der Hälfte der Fläche.
const HIMMEL_SCHWELLE = 7;
const obenWerte = [];
for (let y = 0; y < Math.min(26, p.height); y++) {
  for (let x = 0; x < p.width; x += 3) obenWerte.push(L(x, y));
}
obenWerte.sort((a, b) => a - b);
const himmelMedian = obenWerte[obenWerte.length >> 1];
if (himmelMedian > HIMMEL_SCHWELLE) {
  process.stdout.write(
    `${datei.split('/').slice(-2).join('/')}: KEINE AUSSAGE — der Himmel ist zu hell für dieses Werkzeug\n` +
      `  Median der obersten 26 Zeilen: L ${himmelMedian.toFixed(1)}, gebraucht wird höchstens ${HIMMEL_SCHWELLE}.\n` +
      `  Die Kantensuche würde bei y = 40 anschlagen und Himmel als Gelände zählen.\n` +
      `  Nimm stattdessen: node tools/sterne-hinter.mjs\n`
  );
  process.exit(2);
}

const treffer = [];
for (let x = 6; x < p.width - 6; x++) {
  let kante = null;
  for (let y = 40; y < p.height - 40; y++) {
    let ok = true;
    for (let k = 0; k < 35; k++) {
      if (L(x, y + k) <= 7) {
        ok = false;
        break;
      }
    }
    if (ok) {
      kante = y;
      break;
    }
  }
  if (kante === null) continue; // Spalte ohne Gelände (reiner Himmel)
  for (let y = kante + 4; y < Math.min(kante + band, p.height - 6); y++) {
    const u = umgebung(x, y);
    const v = L(x, y);
    if (v >= MIN_PUNKT && u < MAX_UMGEBUNG && v > u + MIN_ABSTAND) {
      treffer.push([x, y, Math.round(v), Math.round(u)]);
    }
  }
}

process.stdout.write(
  `${datei.split('/').slice(-2).join('/')}: ${treffer.length} helle Punkte in der Geländesilhouette\n`
);
if (treffer.length) {
  process.stdout.write(
    '  ' + treffer.slice(0, 12).map((t) => `(${t[0]},${t[1]}) L=${t[2]} Umg=${t[3]}`).join('  ') + '\n'
  );
}

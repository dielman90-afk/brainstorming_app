// **Sieht man die Kachel?**
//
//   node tools/kachel.mjs [--env matrix] <shot> <x0,y0,x1,y1:Name> ...
//
// Eine gekachelte Textur wiederholt sich, und ab einer bestimmten Groesse im
// Bild erkennt das Auge die Wiederholung als Ornament — bei der Ledernarbung
// des Sessels als eine Art Damastmuster, das mit Leder nichts zu tun hat.
//
// Gemessen wird per **Autokorrelation** ueber eine hochpassgefilterte Zeile:
// Das Bild wird zeilenweise vom lokalen Mittel befreit (5-Punkte-Hochpass,
// damit Formkanten und Beleuchtungsverlauf herausfallen), dann wird fuer jede
// Verschiebung die normierte Korrelation gebildet. Ein Ausschlag bei
// Verschiebung k heisst: Was bei x steht, steht auch bei x+k — und k ist die
// Kachelbreite in Bildpunkten.
//
// Gemeldet wird der staerkste Ausschlag zwischen 8 und 160 Punkten Abstand.
// Rauschen ohne Wiederholung liegt bei 0,0x; ein sichtbares Muster bei 0,2
// und darueber.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'matrix');
const rest = argv.filter((a, i) => a !== '--env' && argv[i - 1] !== '--env');
const shotName = rest[0];
const BEREICHE = rest.slice(1).map((s) => {
  const [zahlen, name] = s.split(':');
  const [x0, y0, x1, y1] = zahlen.split(',').map(Number);
  return { x0, y0, x1, y1, name: name ?? zahlen };
});
const MIN = 8;
const MAX = 160;

const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  if (!shot) {
    process.stderr.write(`Kein Shot "${shotName}" in "${ENV}".\n`);
    process.exit(1);
  }
  await lockCamera(page, shot, 6.0);
  await page.waitForTimeout(400);
  const bild = PNG.sync.read(await page.screenshot());

  process.stdout.write(
    `${shotName}\n${'Bereich'.padEnd(20)}${'Zeilen'.padStart(8)}${'Periode'.padStart(9)}${'Staerke'.padStart(9)}   zweitstaerkste\n`
  );
  for (const b of BEREICHE) {
    const breite = b.x1 - b.x0 + 1;
    const spitzen = new Float64Array(MAX + 1);
    const gewicht = new Float64Array(MAX + 1);
    let zeilen = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      // Hochpass: Wert minus Mittel der fuenf Nachbarn.
      const hp = new Float64Array(breite);
      for (let k = 2; k < breite - 2; k++) {
        const x = b.x0 + k;
        let m = 0;
        for (let d = -2; d <= 2; d++) m += L(bild, (y * bild.width + x + d) * 4);
        hp[k] = L(bild, (y * bild.width + x) * 4) - m / 5;
      }
      let energie = 0;
      for (let k = 2; k < breite - 2; k++) energie += hp[k] * hp[k];
      if (energie < 1) continue;
      zeilen++;
      for (let v = MIN; v <= MAX && v < breite - 6; v++) {
        let summe = 0;
        let n = 0;
        for (let k = 2; k < breite - 2 - v; k++) {
          summe += hp[k] * hp[k + v];
          n++;
        }
        if (!n) continue;
        spitzen[v] += summe / energie;
        gewicht[v] += 1;
      }
    }
    const werte = [];
    for (let v = MIN; v <= MAX; v++) if (gewicht[v]) werte.push([spitzen[v] / gewicht[v], v]);
    werte.sort((a, c) => c[0] - a[0]);
    const [s1, v1] = werte[0] ?? [0, 0];
    // Die zweitstaerkste Periode muss von der ersten weg liegen, sonst meldet
    // das Werkzeug nur die Schulter desselben Ausschlags.
    const zweite = werte.find(([, v]) => Math.abs(v - v1) > 4) ?? [0, 0];
    process.stdout.write(
      `${b.name.padEnd(20)}${String(zeilen).padStart(8)}${String(v1).padStart(9)}${s1.toFixed(3).padStart(9)}   ${zweite[1]} / ${zweite[0].toFixed(3)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

// **Zwei Flaechen, die aneinanderstossen — wie gross ist der Sprung?**
//
//   node tools/bodennaht.mjs [--env zen] --pos x,y,z [--breite 240] [--achse x|y]
//
// Die Kamera blickt aus 45 Grad steil auf die angegebene Bodenstelle. Kein
// Schoenheitsbild, sondern der Blick, in dem eine Naht zwischen zwei
// Bodenflaechen ohne Himmel und ohne Horizont im Bild steht. Ausgegeben wird
// ein Mittelwertprofil quer zur Naht.
//
// **Nicht senkrecht von oben, obwohl das naheliegt.** `lockCamera` setzt
// `camera.up` fest auf (0, 1, 0). Bei senkrechtem Blick steht das parallel zur
// Blickrichtung, `lookAt` ist dort entartet, und die Bildorientierung faellt
// zufaellig aus. Zwei Laeufe desselben Standes lieferten so 170,8 und 148,5
// fuer dieselbe Flaeche — ein Unterschied, den ich beinahe einer
// Farbaenderung zugeschrieben haette, die die Flaeche gar nicht beruehrt.
//
// **Warum es diesen Blick braucht.** Der Sprung zwischen Kiesbett und Saum im
// Zen-Garten liess sich ueber die differenzielle Maske des Saums nicht
// messen: Dessen Umriss beruehrt aussen den Himmel und innen den Kies, und
// der Mittelwert ueber alle Randpunkte mischt beides. Vier Anlaeufe haben
// deshalb Zahlen geliefert, die sich kaum bewegten, waehrend die Naht im Bild
// unveraendert stand. Von oben gesehen war es in einem Lauf klar: 170,8 gegen
// 189,2.
import { PNG } from 'pngjs';
import { envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (n, v) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : v);
const ENV = envArg(argv, 'zen');
const [px, py, pz] = wert('--pos', '20,5,0').split(',').map(Number);
const BREITE = Number(wert('--breite', '240'));
const ACHSE = wert('--achse', 'x');

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  // Das Blickziel liegt genau unter der Kamera; ein winziger Versatz in z
  // haelt `lookAt` von der entarteten Stellung fern, in der `up` und die
  // Blickrichtung parallel stehen.
  // 45 Grad: hoch genug, dass die Naht nicht perspektivisch verschmiert, weit
  // genug von der Senkrechten, dass `up` eindeutig bleibt.
  await lockCamera(page, { name: 'naht', pos: [px, py, pz + py], look: [px, 0, pz], fov: 45 }, 6.0);
  await page.waitForTimeout(400);
  const p = PNG.sync.read(await page.screenshot(SCHUSS));
  const L = (x, y) => {
    const i = (y * p.width + x) * 4;
    return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  };
  const mitteX = p.width >> 1;
  const mitteY = p.height >> 1;
  process.stdout.write(`${ENV}  Blick aus 45 Grad auf (${px} | ${pz})\n`);
  let vorher = null;
  let groesster = { sprung: 0, bei: 0 };
  for (let k = -BREITE / 2; k <= BREITE / 2; k += 10) {
    let summe = 0;
    let n = 0;
    for (let q = -160; q <= 160; q++) {
      const x = ACHSE === 'x' ? mitteX + k : mitteX + q;
      const y = ACHSE === 'x' ? mitteY + q : mitteY + k;
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue;
      summe += L(x, y);
      n++;
    }
    const wertL = summe / n;
    if (vorher !== null && Math.abs(wertL - vorher) > groesster.sprung) {
      groesster = { sprung: Math.abs(wertL - vorher), bei: k };
    }
    process.stdout.write(`${String(k).padStart(6)}  ${wertL.toFixed(1)}\n`);
    vorher = wertL;
  }
  process.stdout.write(`\ngroesster Sprung zwischen zwei Proben: ${groesster.sprung.toFixed(1)} Stufen bei ${groesster.bei}\n`);
} finally {
  await browser.close();
  await server.stop();
}

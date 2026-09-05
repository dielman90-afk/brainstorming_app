// **Flimmert ein feines Muster, wenn der Kopf sich bewegt?**
//
//   node tools/kamm.mjs [--env matrix] <shot> <x0,y0,x1,y1:Name> ...
//
// Ein Standbild kann diese Frage nicht beantworten. Ein Lamellenband mit zwei
// Pixeln Strichbreite sieht im Einzelbild sauber aus und kriecht trotzdem,
// sobald sich der Blick um Bruchteile eines Pixels verschiebt — und in einer
// Brille steht der Kopf nie still.
//
// Darum wird hier GEWACKELT: Die Kamera wandert in Millimeterschritten quer
// zur Blickrichtung, und gemessen wird der mittlere Betrag der Aenderung von
// Bild zu Bild. Das ist genau die Groesse, die als Kribbeln wahrgenommen wird.
//
// Zwei Zahlen je Bereich, weil eine allein nichts sagt:
//
//   * **Zittern** — mittleres |dL| zwischen aufeinanderfolgenden Stellungen.
//   * **Streuung** — Standardabweichung von L im Bereich, also wie viel
//     Kontrast das Muster ueberhaupt hat.
//
// Der Quotient sagt, wie viel vom vorhandenen Kontrast bei einer winzigen
// Kopfbewegung umspringt. Eine aufgeloeste Struktur bewegt sich sanft (kleiner
// Quotient), eine unteraufgeloeste kippt (grosser).
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
// Vier Stellungen, je 1,5 mm auseinander. Zusammen 4,5 mm — weniger, als ein
// ruhig stehender Kopf ohnehin schwankt.
const SCHRITTE = [0, 0.0015, 0.003, 0.0045];

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
  // Querrichtung: senkrecht auf Blickrichtung und Weltoben.
  const d = [shot.look[0] - shot.pos[0], shot.look[1] - shot.pos[1], shot.look[2] - shot.pos[2]];
  const quer = [d[2], 0, -d[0]];
  const len = Math.hypot(quer[0], quer[2]) || 1;
  quer[0] /= len;
  quer[2] /= len;

  const bilder = [];
  for (const s of SCHRITTE) {
    const versetzt = { ...shot, pos: [shot.pos[0] + quer[0] * s, shot.pos[1], shot.pos[2] + quer[2] * s] };
    await lockCamera(page, versetzt, 6.0);
    await page.waitForTimeout(360);
    bilder.push(PNG.sync.read(await page.screenshot()));
  }

  process.stdout.write(
    `${shotName}  Versatz ${SCHRITTE.map((s) => (s * 1000).toFixed(1)).join(' / ')} mm quer\n` +
      `${'Bereich'.padEnd(22)}${'Punkte'.padStart(8)}${'Streuung'.padStart(10)}${'Zittern'.padStart(9)}${'Quotient'.padStart(10)}${'max dL'.padStart(8)}\n`
  );
  for (const b of BEREICHE) {
    const werte = [];
    let zitter = 0;
    let maxD = 0;
    let zahl = 0;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = (y * bilder[0].width + x) * 4;
        werte.push(L(bilder[0], i));
        for (let k = 1; k < bilder.length; k++) {
          const dd = Math.abs(L(bilder[k], i) - L(bilder[k - 1], i));
          zitter += dd;
          if (dd > maxD) maxD = dd;
          zahl++;
        }
      }
    }
    const mittel = werte.reduce((a, v) => a + v, 0) / werte.length;
    const streu = Math.sqrt(werte.reduce((a, v) => a + (v - mittel) ** 2, 0) / werte.length);
    const z = zitter / Math.max(1, zahl);
    process.stdout.write(
      `${b.name.padEnd(22)}${String(werte.length).padStart(8)}${streu.toFixed(1).padStart(10)}${z.toFixed(2).padStart(9)}${(z / Math.max(0.01, streu)).toFixed(3).padStart(10)}${maxD.toFixed(0).padStart(8)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

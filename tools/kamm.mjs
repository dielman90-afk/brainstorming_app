// **Flimmert ein feines Muster, wenn der Kopf sich bewegt?**
//
//   node tools/kamm.mjs [--env matrix] [--hoch] [--dreh] <shot> <x0,y0,x1,y1:Name> ...
//
// `--dreh` wackelt nicht in Millimetern, sondern in **Bildpunkten**: Die Kamera
// dreht sich um Bruchteile eines Pixels, statt sich zu verschieben. Das ist
// keine Bequemlichkeit, sondern die einzige Messung, die in der Ferne noch
// etwas sagt. Ein Versatz von 1,5 mm verschiebt einen Gegenstand auf 1,1 m um
// knapp einen Bildpunkt und einen auf 30 m um ein Zwanzigstel davon — an einer
// Baumkrone im Hintergrund misst die Millimeterfassung deshalb null
// (gemessen: Quotient 0,005), auch wenn die Krone in Bewegung kribbelt. Eine
// Drehung verschiebt dagegen **das ganze Bild** um denselben Betrag,
// unabhaengig von der Entfernung. Und ein Kopf in der Brille dreht sich mehr,
// als er wandert.
//
// `--hoch` wackelt SENKRECHT statt quer. Das ist kein Zusatz, sondern eine
// Luecke, die einen Befund verschluckt hat: Ein waagerechtes Streifenmuster
// — das Zeilenraster der Bildroehre — aendert sich bei einer Querbewegung
// ueberhaupt nicht, weil die Streifen mit der Kamera mitwandern, ohne ihre
// Phase zu aendern. Gemessen wurde damit 0,47 („der ruhigste Bereich der
// Szene"), und der Pruefer hat es trotzdem als kriechgefaehrdet gemeldet. Er
// hatte recht: Die Messung hat in die falsche Richtung gewackelt.
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
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'matrix');
const HOCH = argv.includes('--hoch');
const DREH = argv.includes('--dreh');
const rest = argv.filter(
  (a, i) => a !== '--env' && a !== '--hoch' && a !== '--dreh' && argv[i - 1] !== '--env'
);
const shotName = rest[0];
const BEREICHE = rest.slice(1).map((s) => {
  const [zahlen, name] = s.split(':');
  const [x0, y0, x1, y1] = zahlen.split(',').map(Number);
  return { x0, y0, x1, y1, name: name ?? zahlen };
});
// Vier Stellungen, je 1,5 mm auseinander. Zusammen 4,5 mm — weniger, als ein
// ruhig stehender Kopf ohnehin schwankt.
const SCHRITTE = [0, 0.0015, 0.003, 0.0045];
// Bei `--dreh` dieselbe Zahl Stellungen, aber in Bildpunkten: ein Viertel
// Bildpunkt je Schritt. Unterhalb eines ganzen Bildpunkts liegt genau der
// Bereich, in dem eine unteraufgeloeste Struktur umspringt statt zu wandern.
const DREHSCHRITTE = [0, 0.25, 0.5, 0.75];

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
  // Querrichtung: senkrecht auf Blickrichtung und Weltoben. Bei `--hoch`
  // stattdessen einfach nach oben — ein Kopf nickt.
  const d = [shot.look[0] - shot.pos[0], shot.look[1] - shot.pos[1], shot.look[2] - shot.pos[2]];
  let quer = [d[2], 0, -d[0]];
  const len = Math.hypot(quer[0], quer[2]) || 1;
  quer[0] /= len;
  quer[2] /= len;
  if (HOCH) quer = [0, 1, 0];

  // Der Blickpunkt wird um die Kamera gedreht, nicht die Kamera versetzt.
  // Der Winkel je Bildpunkt folgt aus dem senkrechten Bildwinkel und der
  // Bildhoehe; die Bildpunkte sind quadratisch, waagerecht gilt derselbe Wert.
  const HOEHE = 720;
  const proPunkt = (((shot.fov ?? 60) * Math.PI) / 180) / HOEHE;
  const laenge = Math.hypot(d[0], d[1], d[2]) || 1;
  const blick = [d[0] / laenge, d[1] / laenge, d[2] / laenge];
  // Achse, um die gedreht wird: bei einer Querbewegung die Welt-Hochachse
  // (der Kopf schaut zur Seite), bei `--hoch` die Querachse (er nickt).
  const achse = HOCH ? [quer[0], 0, quer[2]] : [0, 1, 0];
  const gedreht = (w) => {
    // Rodrigues; die Achse ist bereits normiert.
    const c = Math.cos(w);
    const s2 = Math.sin(w);
    const kd = achse[0] * blick[0] + achse[1] * blick[1] + achse[2] * blick[2];
    const kx = [
      achse[1] * blick[2] - achse[2] * blick[1],
      achse[2] * blick[0] - achse[0] * blick[2],
      achse[0] * blick[1] - achse[1] * blick[0],
    ];
    return [0, 1, 2].map(
      (i) => (blick[i] * c + kx[i] * s2 + achse[i] * kd * (1 - c)) * laenge + shot.pos[i]
    );
  };

  const bilder = [];
  for (const s of DREH ? DREHSCHRITTE : SCHRITTE) {
    const versetzt = DREH
      ? { ...shot, look: gedreht(s * proPunkt) }
      : {
          ...shot,
          pos: [shot.pos[0] + quer[0] * s, shot.pos[1] + quer[1] * s, shot.pos[2] + quer[2] * s],
        };
    await lockCamera(page, versetzt, 6.0);
    await page.waitForTimeout(360);
    bilder.push(PNG.sync.read(await page.screenshot(SCHUSS)));
  }

  const richtung = HOCH ? 'hoch' : 'quer';
  process.stdout.write(
    `${shotName}  ${
      DREH
        ? `Drehung ${DREHSCHRITTE.join(' / ')} Bildpunkte ${richtung}`
        : `Versatz ${SCHRITTE.map((s) => (s * 1000).toFixed(1)).join(' / ')} mm ${richtung}`
    }\n` +
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

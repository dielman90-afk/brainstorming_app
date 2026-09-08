// **Liegt eine Flaeche auf dem Boden oder klebt sie darauf?**
//
//   node tools/moossaum.mjs [--env zen] <shot> <knoten> [<knoten> ...]
//
// Drei Zahlen zu genau der Frage, die der Pruefer an den Moosinseln gestellt
// hat („flache Klebebilder mit messerscharfer Kante"):
//
//   * **Kantensprung** — der mittlere Helligkeitsunterschied ueber die
//     Umrisslinie hinweg. **Diese Zahl ist zweideutig, und das gehoert
//     dazugesagt:** Ein Abziehbild springt hart, ein Polster mit dunklem
//     Kontaktsaum aber auch — der Saum IST ein dunkler Strich. Sie taugt zum
//     Vergleich zweier Staende nur zusammen mit `Saum`; steigt sie, waehrend
//     `Saum` unter 1 faellt, ist das ein gewonnener Kontaktschatten und kein
//     verlorener Uebergang.
//   * **Zackigkeit** — Randlaenge geteilt durch die Wurzel der Flaeche. Fuer
//     einen Kreis ist das 3,54, und kleiner geht es nicht. Eine ausgestanzte
//     Ellipse liegt knapp darueber, ein ausgefranster Bewuchs mit Ablegern
//     deutlich. Das ist die Zahl zu „ausgestanzt".
//   * **Saum** — Helligkeit im Randstreifen (bis 4 Bildpunkte nach innen)
//     geteilt durch die im Innern. Unter 1 heisst: der Rand ist dunkler, das
//     Polster verschattet sich selbst. Ueber 1 heisst: der Rand ist heller als
//     die Mitte, und die Flaeche liest als ausgestanzt.
//
//     **Dafuer gehoert `--ohne-werfer` dazu.** Der Baumschatten liegt in
//     `c-torii` mitten auf der Flaeche, also im Innern, waehrend die Ableger
//     am Rand in der Sonne stehen — mit Schlagschatten misst diese Zahl den
//     Baum und nicht den Saum (gemessen: 1,068, ganz gleich, wie die
//     Scheitelfarben aussahen).
//
//     Der Ausweg „nur die besonnten Bildpunkte zaehlen, also alles ueber dem
//     Mittelwert" war ein zweiter Fehler, und ein schlimmerer: Ein dunkler
//     Saum liegt **unter** dem Mittelwert und wird von genau diesem Filter
//     weggeworfen. Die Zahl blieb bei 1,00, waehrend eine Probe mit
//     verdreifachter Saumstaerke den Kantensprung von 33,99 auf 47,59 hob —
//     die Scheitelfarbe kam also sehr wohl im Bild an, nur nicht in meiner
//     Messung. Ein Mass, das sein eigenes Signal herausfiltert, misst nichts.
//   * **Korn** — mittleres |L − Mittel(5x5)| innerhalb der Maske. Das misst
//     Feinstruktur und laesst die weichen Schattenverlaeufe darueber
//     unberuehrt; eine Farbflaeche kommt hier auf nahe null.
//
// Die Maske ist differenziell: der Knoten wird aus- und eingeblendet, und die
// geaenderten Bildpunkte SIND seine Flaeche. Kein Rechteck, kein Himmel, kein
// Sand darin.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const OHNE_WERFER = argv.includes('--ohne-werfer');
const rest = argv.filter((a, i) => a !== '--env' && a !== '--ohne-werfer' && argv[i - 1] !== '--env');
const shotName = rest[0] ?? 'a-eyelevel';
const KNOTEN = rest.slice(1);
if (!KNOTEN.length) {
  process.stderr.write('Kein Knoten angegeben.\n');
  process.exit(1);
}

const L = (p, x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  if (!shot) {
    process.stderr.write(`Kein Shot "${shotName}" in Umgebung "${ENV}".\n`);
    process.exit(1);
  }
  await lockCamera(page, shot, 6.0);
  if (OHNE_WERFER) {
    await page.evaluate(() => {
      window.__app.scene.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    });
  }
  const bild = async () => {
    await page.waitForTimeout(320);
    return PNG.sync.read(await page.screenshot());
  };
  const sichtbar = (name, an) =>
    page.evaluate(
      ({ name, an, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        let n = 0;
        g.traverse((o) => {
          if (o.name === name) {
            o.visible = an;
            n++;
          }
        });
        return n;
      },
      { name, an, gruppe: `env-${ENV}` }
    );

  const voll = await bild();
  process.stdout.write(
    `${ENV} / ${shotName}${OHNE_WERFER ? '  (ohne alle Schlagschatten)' : ''}\n${'Knoten'.padEnd(16)}${'Punkte'.padStart(8)}${'Kantensprung'.padStart(14)}${'innen-aussen'.padStart(14)}${'Zackigkeit'.padStart(12)}${'Saum'.padStart(8)}${'Korn'.padStart(8)}\n`
  );
  for (const name of KNOTEN) {
    await sichtbar(name, false);
    const ohne = await bild();
    await sichtbar(name, true);
    const W = voll.width;
    const H = voll.height;
    const maske = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      const d = Math.max(
        Math.abs(voll.data[j] - ohne.data[j]),
        Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
        Math.abs(voll.data[j + 2] - ohne.data[j + 2])
      );
      if (d >= 3) maske[i] = 1;
    }
    let n = 0;
    for (let i = 0; i < W * H; i++) n += maske[i];
    if (!n) {
      process.stdout.write(`${name.padEnd(16)}  (nicht im Bild)\n`);
      continue;
    }
    // Abstand zur Maskenkante, in Bildpunkten, per Wellenfront.
    const dist = new Int16Array(W * H).fill(-1);
    let front = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!maske[i]) continue;
        if (!maske[i - 1] || !maske[i + 1] || !maske[i - W] || !maske[i + W]) {
          dist[i] = 0;
          front.push(i);
        }
      }
    const kante = front.slice();
    for (let d = 1; d <= 6 && front.length; d++) {
      const naechste = [];
      for (const i of front)
        for (const j of [i - 1, i + 1, i - W, i + W])
          if (j >= 0 && j < W * H && maske[j] && dist[j] < 0) {
            dist[j] = d;
            naechste.push(j);
          }
      front = naechste;
    }
    // Kantensprung: innen (Abstand 0) gegen den Nachbarn ausserhalb.
    let sprung = 0;
    let sn = 0;
    // Zusaetzlich der VORZEICHENBEHAFTETE Unterschied: `Kantensprung` sagt
    // nur, wie hart die Linie ist, nicht, welche Seite heller steht. Fuer
    // einen Uebergang, den man ANGLEICHEN will, ist genau das die Zahl.
    let seite = 0;
    for (const i of kante) {
      const x = i % W;
      const y = (i / W) | 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const j = (y + dy) * W + (x + dx);
        if (j < 0 || j >= W * H || maske[j]) continue;
        sprung += Math.abs(L(voll, x, y) - L(voll, x + dx, y + dy));
        seite += L(voll, x, y) - L(voll, x + dx, y + dy);
        sn++;
      }
    }
    let randS = 0;
    let randN = 0;
    let innenS = 0;
    let innenN = 0;
    let korn = 0;
    let kornN = 0;
    for (let y = 2; y < H - 2; y++)
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (!maske[i]) continue;
        const l = L(voll, x, y);
        if (dist[i] >= 0 && dist[i] <= 4) {
          randS += l;
          randN++;
        } else {
          innenS += l;
          innenN++;
        }
        let s = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L(voll, x + dx, y + dy);
        korn += Math.abs(l - s / 25);
        kornN++;
      }
    const saum = innenN ? randS / randN / (innenS / innenN) : NaN;
    process.stdout.write(
      `${name.padEnd(16)}${String(n).padStart(8)}${(sn ? sprung / sn : 0).toFixed(2).padStart(14)}${(sn ? seite / sn : 0).toFixed(2).padStart(14)}${(kante.length / Math.sqrt(n)).toFixed(2).padStart(12)}${saum.toFixed(3).padStart(8)}${(korn / kornN).toFixed(3).padStart(8)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

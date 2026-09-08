// **Wie gefleckt ist der Schatten einer Krone?**
//
//   node tools/laubschatten.mjs [--env zen] <shot> <krone> [<huelle>]
//
// Prüferbefund 7: *„Der Sakura-Schatten ist ein strukturloser Fleck."* Der
// Schatten eines blühenden Kirschbaums ist gesprenkelt — hunderte kleiner
// Lichtlücken zwischen den Blattbüscheln. Ein geschlossener Fleck entsteht,
// wenn ein **Hüllkörper** mitwirft: Der ist dicht, und die Karten koennen
// nichts mehr aufloesen, was schon zu ist.
//
// Gemessen wird deshalb dreierlei im selben Fleck:
//
//   * Fläche des Schattens (Bildpunkte),
//   * **Randanteil** — wie viele Schattenpunkte einen unverschatteten
//     Nachbarn haben. Das ist das Verhältnis von Umfang zu Fläche, und es ist
//     das eigentliche Mass für Sprenkelung: Ein geschlossener Fleck von A
//     Bildpunkten hat rund 2·sqrt(pi/A) Randanteil (bei 13 700 px also drei
//     Prozent), ein gesprenkelter ein Vielfaches davon. Ein umschliessendes
//     Rechteck taugt hier nicht — der Stammschatten zieht es quer durchs Bild.
//   * Hochpass der Schattentiefe gegen die vier Nachbarn.
//
// Der Fleck entsteht differenziell: Wurf der Krone aus, Bild, an, Bild.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const rest = argv.filter(
  (a, i) =>
    !a.startsWith('--') &&
    argv[i - 1] !== '--env' &&
    argv[i - 1] !== '--aus' &&
    argv[i - 1] !== '--depthalpha'
);
// `--aus <knoten>` nimmt einen Knoten VOR der Messung aus dem Schattenpass —
// etwa den Huellkoerper, dessen Beitrag geschlossen ist. `--depthalpha <wert>`
// stellt den Alphaschwellwert des TIEFENmaterials, nicht des sichtbaren: Damit
// laesst sich der Schatten ausduennen, ohne die Krone anzufassen.
const ai = argv.indexOf('--aus');
const AUS = ai >= 0 ? argv[ai + 1] : null;
const di = argv.indexOf('--depthalpha');
const DEPTHALPHA = di >= 0 ? Number(argv[di + 1]) : null;
const SHOT = rest[0] ?? 'd-aerial';
const KNOTEN = rest.slice(1);
if (!KNOTEN.length) {
  process.stderr.write('Kein Kronenknoten angegeben.\n');
  process.exit(1);
}
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shotsFor(ENV).find((s) => s.name === SHOT), 6.0);
  const bild = async () => {
    await page.waitForTimeout(340);
    return PNG.sync.read(await page.screenshot());
  };
  const wurf = (namen, an) =>
    page.evaluate(
      ({ an, namen, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (namen.includes(o.name)) o.traverse((k) => (k.castShadow = an));
        });
      },
      { an, namen, gruppe: `env-${ENV}` }
    );

  if (AUS) await wurf([AUS], false);
  if (DEPTHALPHA !== null) {
    await page.evaluate(
      ({ wert, namen, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (!namen.includes(o.name)) return;
          const d = o.customDepthMaterial;
          if (d) {
            d.alphaTest = wert;
            d.needsUpdate = true;
          }
        });
      },
      { wert: DEPTHALPHA, namen: KNOTEN, gruppe: `env-${ENV}` }
    );
  }
  // Alle genannten Knoten zusammen: Ihr Schatten ist der Fleck.
  const mit = await bild();
  await wurf(KNOTEN, false);
  const ohne = await bild();
  await wurf(KNOTEN, true);

  const fleck = [];
  for (let i = 0; i < mit.data.length; i += 4) {
    const d = lum(ohne.data[i], ohne.data[i + 1], ohne.data[i + 2]) -
      lum(mit.data[i], mit.data[i + 1], mit.data[i + 2]);
    if (d >= 3) fleck.push({ i, d });
  }
  if (!fleck.length) {
    process.stdout.write(`${SHOT}: kein Schatten von ${KNOTEN.join(', ')} im Bild\n`);
  } else {
    // Die Huelle des Flecks: rechteckige Umschliessung, darin der Anteil, der
    // NICHT verschattet ist. Ein Rechteck ist grob, aber es ist derselbe Rahmen
    // in beiden Staenden und damit vergleichbar.
    const tiefen = fleck.map((f) => f.d).sort((a, b) => a - b);
    const p = (q) => tiefen[Math.min(tiefen.length - 1, Math.floor(q * tiefen.length))];
    // Hochpass der Schattentiefe: kleine Luecken erzeugen viele Nachbarschafts-
    // sprünge, ein geschlossener Fleck fast keine.
    const tiefeAn = new Map(fleck.map((f) => [f.i, f.d]));
    let hoch = 0;
    let hn = 0;
    let rand = 0;
    for (const { i, d } of fleck) {
      let s = 0;
      let n = 0;
      let offen = false;
      for (const o of [-4, 4, -mit.width * 4, mit.width * 4]) {
        if (!tiefeAn.has(i + o)) {
          offen = true; // Nachbar ausserhalb des Schattens = volle Helligkeit
          n++;
        } else {
          s += tiefeAn.get(i + o);
          n++;
        }
      }
      if (offen) rand++;
      hoch += Math.abs(d - s / n);
      hn++;
    }
    const kompakt = 2 * Math.sqrt(Math.PI / fleck.length) * 100;
    // **Randanteil allein genuegt nicht.** Ein stark gelappter, aber innen
    // geschlossener Fleck bekommt davon einen hohen Wert, ohne gesprenkelt zu
    // sein. Die eigentliche Frage ist: Wie viele LOECHER hat der Schatten —
    // also unverschattete Bereiche, die ringsum von Schatten umgeben sind?
    // Das entscheidet, ob ein Baumschatten gesprenkelt ist oder ein Fleck.
    //
    // Ermittelt durch Flutfuellung des Unverschatteten vom Bildrand her: Was
    // dabei nicht erreicht wird, liegt eingeschlossen.
    const breite = mit.width;
    const hoehe = mit.height;
    const istSchatten = new Uint8Array(breite * hoehe);
    for (const { i } of fleck) istSchatten[i / 4] = 1;
    const erreicht = new Uint8Array(breite * hoehe);
    const stapel = [];
    for (let x = 0; x < breite; x++) {
      for (const y of [0, hoehe - 1]) {
        const q = y * breite + x;
        if (!istSchatten[q] && !erreicht[q]) {
          erreicht[q] = 1;
          stapel.push(q);
        }
      }
    }
    for (let y = 0; y < hoehe; y++) {
      for (const x of [0, breite - 1]) {
        const q = y * breite + x;
        if (!istSchatten[q] && !erreicht[q]) {
          erreicht[q] = 1;
          stapel.push(q);
        }
      }
    }
    while (stapel.length) {
      const q = stapel.pop();
      const x = q % breite;
      const y = (q - x) / breite;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue;
        const n = ny * breite + nx;
        if (istSchatten[n] || erreicht[n]) continue;
        erreicht[n] = 1;
        stapel.push(n);
      }
    }
    // Loecher zaehlen und ihre Groessen sammeln.
    const gesehen = new Uint8Array(breite * hoehe);
    const loecher = [];
    for (const { i } of fleck) {
      const q0 = i / 4;
      const x0 = q0 % breite;
      const y0 = (q0 - x0) / breite;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x0 + dx;
        const ny = y0 + dy;
        if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue;
        const n = ny * breite + nx;
        if (istSchatten[n] || erreicht[n] || gesehen[n]) continue;
        let gr = 0;
        const st = [n];
        gesehen[n] = 1;
        while (st.length) {
          const q = st.pop();
          gr++;
          const qx = q % breite;
          const qy = (q - qx) / breite;
          for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const mx = qx + ex;
            const my = qy + ey;
            if (mx < 0 || my < 0 || mx >= breite || my >= hoehe) continue;
            const m = my * breite + mx;
            if (istSchatten[m] || erreicht[m] || gesehen[m]) continue;
            gesehen[m] = 1;
            st.push(m);
          }
        }
        loecher.push(gr);
      }
    }
    loecher.sort((a, b) => b - a);
    const lochFlaeche = loecher.reduce((a, b) => a + b, 0);
    process.stdout.write(
      `${SHOT}  ${KNOTEN.join(' + ')}\n` +
        `   Flaeche      ${String(fleck.length).padStart(7)} px\n` +
        `   Randanteil   ${((rand / fleck.length) * 100).toFixed(1).padStart(7)} %  ` +
        `(ein geschlossener Fleck dieser Groesse haette ${kompakt.toFixed(1)} %)\n` +
        `   Loecher      ${String(loecher.length).padStart(7)}  zusammen ${lochFlaeche} px ` +
        `(${((lochFlaeche / fleck.length) * 100).toFixed(1)} % der Schattenflaeche), ` +
        `groesstes ${loecher[0] ?? 0} px, Median ${loecher.length ? loecher[Math.floor(loecher.length / 2)] : 0} px\n` +
        `   Tiefe        p05 ${p(0.05).toFixed(1)}  p50 ${p(0.5).toFixed(1)}  p95 ${p(0.95).toFixed(1)}\n` +
        `   Hochpass     ${(hoch / hn).toFixed(2).padStart(7)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

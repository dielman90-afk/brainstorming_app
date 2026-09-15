// **Wie trüb darf das Wasser sein?**
//
//   node tools/teichprobe.mjs [--env zen]
//
// Zwei Forderungen ziehen gegeneinander, und keine lässt sich raten:
//
//   * Bei steilem Blick müssen die Koi lesen. Gemessen trugen sie in `b-pond`
//     413 und 377 Bildpunkte bei 5,2 und 4,6 Stufen Abhebung bei — ein Fisch,
//     der sich um fünf Stufen vom Wasser unterscheidet, ist nicht da.
//   * Bei streifendem Blick darf der Beckengrund NICHT durchkommen, sonst ist
//     die Fläche wieder eine Platte ohne Fresnel.
//
// Die Reihe fährt deshalb beide Kameras zugleich: `b-pond` für die Koi,
// `a-eyelevel` für den Durchblick. Die Trübung steht als Uniform in der Szene
// (`uWasserTrueb`: Koeffizient, Sockel am Ufer, Sockel in der Mitte), damit
// die Quelle waehrend des Messlaufs unangetastet bleibt.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const saett = (r, g, b) => {
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};

const REIHE = [
  [3.4, 0.44, 0.86], // Stand von Paket S
  [1.8, 0.36, 0.78],
  [1.2, 0.3, 0.72],
  [0.8, 0.26, 0.66],
  [0.5, 0.22, 0.58],
];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const alle = shotsFor(ENV);
  const bild = async () => {
    await page.waitForTimeout(340);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };
  const sichtbar = (name, an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.visible = an;
        });
      },
      { an, name, gruppe: `env-${ENV}` }
    );
  const truebung = (v) =>
    page.evaluate(
      ({ v, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          const u = o.material?.userData?.zenUniforms;
          if (u?.uWasserTrueb) u.uWasserTrueb.value.set(v[0], v[1], v[2]);
        });
      },
      { v, gruppe: `env-${ENV}` }
    );

  // Wassermaske je Kamera einmal festlegen — sie ändert sich mit der Trübung
  // nur am äußersten Saum, und eine wandernde Maske vergliche verschiedene
  // Bildpunkte.
  const masken = {};
  for (const n of ['b-pond', 'a-eyelevel']) {
    await lockCamera(page, alle.find((s) => s.name === n), 6.0);
    const mit = await bild();
    await sichtbar('zen-wasser', false);
    const ohne = await bild();
    await sichtbar('zen-wasser', true);
    const m = [];
    for (let i = 0; i < mit.data.length; i += 4) {
      const d =
        Math.abs(mit.data[i] - ohne.data[i]) +
        Math.abs(mit.data[i + 1] - ohne.data[i + 1]) +
        Math.abs(mit.data[i + 2] - ohne.data[i + 2]);
      if (d >= 6) m.push(i);
    }
    masken[n] = m;
  }
  process.stdout.write(
    `Masken: b-pond ${masken['b-pond'].length} px, a-eyelevel ${masken['a-eyelevel'].length} px\n\n` +
      `${'Trueb  Sockel'.padEnd(20)} ${'Koi 0'.padStart(7)} ${'Koi 1'.padStart(7)}  ` +
      `${'Wasser L'.padStart(8)} ${'Saett'.padStart(6)}  ${'Durchblick a'.padStart(12)}\n`
  );

  for (const v of REIHE) {
    await truebung(v);
    // Koi in b-pond
    await lockCamera(page, alle.find((s) => s.name === 'b-pond'), 6.0);
    const mitB = await bild();
    const koi = [];
    for (const name of ['zen-koi-0', 'zen-koi-1']) {
      await sichtbar(name, false);
      const ohne = await bild();
      await sichtbar(name, true);
      let n = 0;
      let su = 0;
      for (let i = 0; i < mitB.data.length; i += 4) {
        const d =
          Math.abs(mitB.data[i] - ohne.data[i]) +
          Math.abs(mitB.data[i + 1] - ohne.data[i + 1]) +
          Math.abs(mitB.data[i + 2] - ohne.data[i + 2]);
        if (d < 6) continue;
        n++;
        su += Math.abs(
          lum(mitB.data[i], mitB.data[i + 1], mitB.data[i + 2]) -
            lum(ohne.data[i], ohne.data[i + 1], ohne.data[i + 2])
        );
      }
      koi.push(n ? su / n : 0);
    }
    let wl = 0;
    let ws = 0;
    for (const i of masken['b-pond']) {
      wl += lum(mitB.data[i], mitB.data[i + 1], mitB.data[i + 2]);
      ws += saett(mitB.data[i], mitB.data[i + 1], mitB.data[i + 2]);
    }
    wl /= masken['b-pond'].length;
    ws /= masken['b-pond'].length;

    // Durchblick in a-eyelevel
    await lockCamera(page, alle.find((s) => s.name === 'a-eyelevel'), 6.0);
    const mitA = await bild();
    await sichtbar('zen-teichbecken', false);
    const ohneGrund = await bild();
    await sichtbar('zen-teichbecken', true);
    let db = 0;
    for (const i of masken['a-eyelevel']) {
      db += Math.abs(
        lum(mitA.data[i], mitA.data[i + 1], mitA.data[i + 2]) -
          lum(ohneGrund.data[i], ohneGrund.data[i + 1], ohneGrund.data[i + 2])
      );
    }
    db /= masken['a-eyelevel'].length;

    process.stdout.write(
      `${`${v[0]}  ${v[1]}/${v[2]}`.padEnd(20)} ${koi[0].toFixed(1).padStart(7)} ${koi[1].toFixed(1).padStart(7)}  ` +
        `${wl.toFixed(1).padStart(8)} ${(ws * 100).toFixed(1).padStart(5)}%  ${db.toFixed(1).padStart(12)}\n`
    );
  }
  await truebung([0.8, 0.26, 0.66]);
} finally {
  await browser.close();
  await server.stop();
}

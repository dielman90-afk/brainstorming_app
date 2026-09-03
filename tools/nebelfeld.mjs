// **Wie nah muss der Nebel ansetzen, damit die Bodenebene staffelt?**
//
//   node tools/nebelfeld.mjs
//
// Der Pruefer: „Gras `1-eyelevel` ferner Kamm L 180,0 / Saettigung 50,7 gegen
// naechsten Vordergrund L 179,3 / 50,7 — 0,7 Stufen und 0,0 Saettigungspunkte
// ueber rund 30 m."
//
// Der Grund steht in einer Zahl: Der Nebel setzt bei 6 * WORLD_SCALE = 24 m an.
// Die Insel ist 40 m breit; wer in ihrer Mitte steht, sieht ihre ferne Kante in
// 20 m. Sie liegt damit **vollstaendig vor** dem Nebel.
//
// Naeher zu setzen ist ein Kompromiss, kein freier Gewinn: Karten liegen bei
// 1,15 bis 1,5 m, und eine Hauptinsel im Dunst waere schlimmer als eine ohne
// Staffelung. Dieses Werkzeug faehrt das Feld ab, statt es zu raten — je
// Einstellung der Unterschied zwischen fernem Kamm und naechstem Vordergrund,
// und als Gegenprobe der Wert an einer Stelle in Kartenreichweite.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';
import { PNG } from 'pngjs';

const shot = shotsFor('island').find((s) => s.name === '1-eyelevel');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);

  const setze = (nah, fern) =>
    page.evaluate(
      ({ nah, fern }) => {
        const f = window.__app.scene.fog;
        if (!f) return false;
        if (window.__nebelSicher === undefined) window.__nebelSicher = { near: f.near, far: f.far };
        f.near = nah ?? window.__nebelSicher.near;
        f.far = fern ?? window.__nebelSicher.far;
        return `${f.near} / ${f.far}`;
      },
      { nah, fern }
    );

  const messen = async (name) => {
    await page.waitForTimeout(400);
    const p = PNG.sync.read(await page.screenshot());
    const mittel = (x0, y0, x1, y1) => {
      let l = 0;
      let satt = 0;
      let n = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = (y * p.width + x) * 4;
          const r = p.data[i];
          const g = p.data[i + 1];
          const b = p.data[i + 2];
          l += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          satt += Math.max(r, g, b) - Math.min(r, g, b);
          n++;
        }
      }
      return [l / n, satt / n];
    };
    const [lf, sf] = mittel(250, 392, 420, 404); // ferner Kamm
    const [ln, sn] = mittel(250, 660, 420, 700); // naechster Vordergrund
    const [lk] = mittel(600, 470, 700, 500); // Kartenreichweite, gut 4 m
    console.log(
      `  ${name.padEnd(16)} fern L ${lf.toFixed(1)} / S ${sf.toFixed(1)}   nah L ${ln.toFixed(1)} / S ${sn.toFixed(1)}   ` +
        `Delta L ${(lf - ln).toFixed(1).padStart(5)} / S ${(sf - sn).toFixed(1).padStart(5)}   Kartenband L ${lk.toFixed(1)}`
    );
  };

  console.log('1-eyelevel, Nebelfeld (Weltkoordinaten)');
  for (const [nah, fern] of [
    [null, null],
    [16, 128],
    [12, 128],
    [8, 128],
    [8, 90],
    [5, 90],
    [5, 70],
    [2, 70],
  ]) {
    const stand = await setze(nah, fern);
    await messen(String(stand));
  }
} finally {
  await browser.close();
  await server.stop();
}

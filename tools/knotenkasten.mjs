// **Wo im Bild steckt dieser Knoten?**
//
//   node tools/knotenkasten.mjs [--env island] <shot> <knoten> [<knoten> ...]
//
// Die Ergaenzung zu `knotenwerte.mjs`: Der misst die Verteilung auf der Maske
// eines Knotens, dieser sagt, **wo** die Maske liegt. Gebraucht, weil ein von
// Hand gesetzter Kasten in diesem Auftrag schon dreimal neben dem Gegenstand
// lag — beim Stamm vier Bildpunkte daneben, bei den Wolken auf einer Gruppe,
// die sich gar nicht geaendert hatte, und bei der Krone zweihundert daneben.
// Raten kostet mehr als messen.
//
// Gemeldet werden der Gesamtkasten und die zusammenhaengenden Teilstuecke, nach
// Flaeche sortiert — ein Knoten mit fuenf Voegeln hat fuenf davon.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'island');
const rest = argv.filter((a, i) => a !== '--env' && argv[i - 1] !== '--env');
const shotName = rest[0];
const KNOTEN = rest.slice(1);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  if (!shot) throw new Error(`Kein Shot "${shotName}" in "${ENV}"`);
  await lockCamera(page, shot, 6.0);
  const schalt = (name, an) =>
    page.evaluate(({ name, an }) => {
      let n = 0;
      window.__app.scene.traverse((o) => {
        // Nicht nur `isMesh`: Der Wasserfall besteht aus Punktwolken und
        // Sprites, und die waren mit der Mesh-Pruefung unsichtbar fuer dieses
        // Werkzeug — es meldete „0 Netze" fuer Knoten, die im Bild stehen.
        if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.name === name) {
          o.visible = an;
          n++;
        }
      });
      return n;
    }, { name, an });

  await page.waitForTimeout(320);
  const mit = PNG.sync.read(await page.screenshot(SCHUSS));
  process.stdout.write(`${shotName}\n\n`);
  for (const name of KNOTEN) {
    const n = await schalt(name, false);
    await page.waitForTimeout(320);
    const ohne = PNG.sync.read(await page.screenshot(SCHUSS));
    await schalt(name, true);
    const W = mit.width;
    const H = mit.height;
    const maske = new Uint8Array(W * H);
    let cnt = 0;
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      const d =
        Math.abs(mit.data[j] - ohne.data[j]) +
        Math.abs(mit.data[j + 1] - ohne.data[j + 1]) +
        Math.abs(mit.data[j + 2] - ohne.data[j + 2]);
      if (d > 10) {
        maske[i] = 1;
        cnt++;
      }
    }
    // Zusammenhaengende Stuecke
    const gesehen = new Uint8Array(W * H);
    const stuecke = [];
    for (let i = 0; i < W * H; i++) {
      if (!maske[i] || gesehen[i]) continue;
      const s = [i];
      gesehen[i] = 1;
      let x0 = W, x1 = -1, y0 = H, y1 = -1, m = 0;
      while (s.length) {
        const k = s.pop();
        const kx = k % W;
        const ky = (k / W) | 0;
        m++;
        if (kx < x0) x0 = kx;
        if (kx > x1) x1 = kx;
        if (ky < y0) y0 = ky;
        if (ky > y1) y1 = ky;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = kx + dx;
            const ny = ky + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nk = ny * W + nx;
            if (maske[nk] && !gesehen[nk]) {
              gesehen[nk] = 1;
              s.push(nk);
            }
          }
      }
      if (m >= 8) stuecke.push({ m, x0, y0, x1, y1 });
    }
    stuecke.sort((a, b) => b.m - a.m);
    const gx0 = Math.min(...stuecke.map((s) => s.x0));
    const gy0 = Math.min(...stuecke.map((s) => s.y0));
    const gx1 = Math.max(...stuecke.map((s) => s.x1));
    const gy1 = Math.max(...stuecke.map((s) => s.y1));
    process.stdout.write(
      `${name}  (${n} Netze)  ${cnt} Bildpunkte, ${stuecke.length} Stuecke\n` +
        (stuecke.length ? `  Gesamtkasten ${gx0},${gy0},${gx1},${gy1}\n` : '') +
        stuecke
          .slice(0, 40)
          .map((s) => `  ${String(s.m).padStart(6)}  ${s.x0},${s.y0},${s.x1},${s.y1}\n`)
          .join('')
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

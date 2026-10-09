// **Wo scheint in der Brille das echte Zimmer durch?**
//
//   node tools/alphaprobe.mjs [--env all|island,dojo] [--nur 1-eyelevel] [--out tools/shots/run-alpha]
//
// Die Quest startet die App als `immersive-ar`, also mit Passthrough — auch
// dann, wenn eine virtuelle Umgebung gewaehlt ist. Der Compositor der Brille
// mischt dabei jeden Bildpunkt mit dem Kamerabild des Zimmers, und zwar ueber
// den Alphawert des Framebuffers: Alpha 1 deckt, alles darunter laesst das
// Zimmer durchscheinen. Der Nutzer hat genau das gemeldet: Durch die Pflanzen
// der Himmelsinsel sah er die Umrisse seines Zimmers.
//
// Am Desktop ist das unsichtbar, und headless gibt es keine AR-Sitzung. Dieses
// Werkzeug stellt sie nach: Es rendert jede Pruefansicht in ein Renderziel mit
// vier MSAA-Abtastpunkten (wie der Brillen-Framebuffer, sonst greift
// `alphaToCoverage` nicht) und liest den Alphakanal zurueck.
//
// Zwei Durchgaenge je Bild:
//
//   * **ohne Dichtung** — three loescht in AR mit (0,0,0,0), egal welche
//     Hintergrundfarbe die Umgebung hat (WebGLBackground.js, Zweig
//     `alpha-blend`). So lief die App bisher in der Brille.
//   * **mit Dichtung** — die Sitzung meldet `alpha-blend`, und die App
//     entscheidet selbst (`__app.passthrough`, src/passthrough.js). Ziel: kein
//     einziger Bildpunkt unter Alpha 1.
//
// Gezaehlt wird der Anteil der Bildpunkte mit Alpha < 255 und < 128 (also
// ueberwiegend Zimmer). Eine Maske je Bild landet im Ausgabeordner: weiss =
// deckt, rot = Zimmer scheint durch.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, VIEWPORT, shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (name, vorgabe) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : vorgabe);
const ALLE = ['island', 'zen', 'night', 'matrix', 'dojo'];
const envWahl = wert('--env', 'all');
const envs = envWahl === 'all' ? ALLE : envWahl.split(',');
const nur = argv.includes('--nur') ? wert('--nur').split(',') : null;
const outDir = path.resolve(ROOT, wert('--out', 'tools/shots/run-alpha'));
const { width: W, height: H } = VIEWPORT;

const server = await startServer();
const browser = await launchBrowser();
let fehler = false;
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page, messages } = await openApp(browser);
  await ladeThree(page);

  for (const env of envs) {
    await selectEnv(page, env);
    const shots = shotsFor(env).filter((s) => !nur || nur.includes(s.name));
    for (const shot of shots) {
      await lockCamera(page, shot, 6.0);
      await page.waitForTimeout(300);
      const ergebnis = await page.evaluate(
        ({ W, H }) => {
          const T = window.__THREE;
          const app = window.__app;
          const { renderer, scene, camera } = app;
          const xr = renderer.xr;
          const rt = new T.WebGLRenderTarget(W, H, { samples: 4 });
          const buf = new Uint8Array(W * H * 4);
          const vorherBlend = xr.getEnvironmentBlendMode;
          const dichtung = app.passthrough;
          const vorherQuelle = dichtung?.sitzungsModus;

          const messe = (modus) => {
            if (modus === 'ohne') {
              // Ohne Dichtung: three sieht die rohe AR-Meldung.
              xr.getEnvironmentBlendMode = () => 'alpha-blend';
            } else if (dichtung) {
              // Mit Dichtung: Die Sitzung meldet AR, die App entscheidet.
              dichtung.sitzungsModus = () => 'alpha-blend';
            } else {
              return null; // alter Stand ohne Dichtung
            }
            renderer.setRenderTarget(rt);
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
            renderer.setRenderTarget(null);
            xr.getEnvironmentBlendMode = vorherBlend;
            if (dichtung) dichtung.sitzungsModus = vorherQuelle;
            let unter = 0;
            let halb = 0;
            const maske = new Uint8Array(W * H);
            for (let i = 0, p = 0; i < buf.length; i += 4, p++) {
              const a = buf[i + 3];
              maske[p] = a;
              if (a < 255) unter++;
              if (a < 128) halb++;
            }
            return { unter, halb, maske: Array.from(maske) };
          };
          const ohne = messe('ohne');
          const mit = messe('mit');
          rt.dispose();
          return { ohne, mit };
        },
        { W, H }
      );
      const n = W * H;
      const pct = (x) => ((x / n) * 100).toFixed(3).padStart(8) + ' %';
      const zeile = (name, m) =>
        m ? `${name} Alpha<255 ${pct(m.unter)}   Alpha<128 ${pct(m.halb)}` : `${name} (keine Dichtung im Stand)`;
      process.stdout.write(`${env.padEnd(7)} ${shot.name.padEnd(14)} ${zeile('ohne:', ergebnis.ohne)}   |   ${zeile('mit:', ergebnis.mit)}\n`);
      if (!ergebnis.mit || ergebnis.mit.unter > 0) fehler = true;

      // Masken schreiben. readRenderTargetPixels liefert die Zeilen von unten
      // nach oben; fuer ein lesbares Bild wird gespiegelt.
      for (const [name, m] of [['ohne', ergebnis.ohne], ['mit', ergebnis.mit]]) {
        if (!m) continue;
        const png = new PNG({ width: W, height: H });
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const a = m.maske[(H - 1 - y) * W + x];
            const o = (y * W + x) * 4;
            png.data[o] = 255;
            png.data[o + 1] = a;
            png.data[o + 2] = a;
            png.data[o + 3] = 255;
          }
        }
        await fs.writeFile(path.join(outDir, `${env}-${shot.name}-${name}.png`), PNG.sync.write(png));
      }
    }
  }
  if (messages.length) process.stdout.write(`\nKonsole:\n${messages.slice(0, 20).join('\n')}\n`);
} finally {
  await browser.close();
  await server.stop();
}
process.stdout.write(fehler ? '\nFEHLER: Mit Dichtung scheint noch Zimmer durch (oder die Dichtung fehlt).\n' : '\nOK: Mit Dichtung deckt jeder Bildpunkt.\n');
process.exit(fehler ? 1 : 0);

// **Welcher Zustand gehört zu welchem Bild?**
//
// Der Prüfstand liefert für dasselbe Bild aus getrennten Prozessen zwei
// verschiedene Prüfsummen. Dieses Werkzeug nimmt das Bild auf **und** schreibt
// im selben Lauf die Lage aller Dinge heraus, die das Bild bestimmen. Über
// mehrere Läufe lässt sich damit ablesen, welches Feld mit der Prüfsumme
// mitspringt — statt zwei getrennte Messungen zu vergleichen, die zufällig
// beide im selben Zustand gelandet sein können.
//
//   node tools/zustand.mjs [--env night] [--shot a-augenhoehe]
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { ROOT, shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');
const name = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : 'a-augenhoehe';
const shot = shotsFor(envId).find((s) => s.name === name);
const outDir = path.resolve(ROOT, 'tools/shots/wiederholung');

const server = await startServer();
const browser = await launchBrowser();
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);
  await page.waitForTimeout(450);
  const datei = path.join(outDir, `${name}-zustand.png`);
  await page.screenshot({ path: datei });
  const hash = crypto.createHash('md5').update(await fs.readFile(datei)).digest('hex').slice(0, 10);
  const z = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const m = (o) => Array.from(o.matrixWorld.elements).map((v) => v.toFixed(9)).join(',');
    const licht = app.scene.getObjectByName('nacht-mondlicht');
    const welt = app.scene.getObjectByName('nacht-welt');
    const himmel = app.scene.getObjectByName('nacht-himmel');
    const boden = app.scene.getObjectByName('nacht-planet');
    return {
      kamera: m(app.camera),
      proj: Array.from(app.camera.projectionMatrix.elements).map((v) => v.toFixed(9)).join(','),
      spieler: app.player.position.toArray().map((v) => v.toFixed(9)).join(','),
      welt: welt ? m(welt) : '-',
      himmel: himmel ? m(himmel) : '-',
      boden: boden ? m(boden) : '-',
      licht: licht ? `${m(licht)} | ziel ${m(licht.target)} | int ${licht.intensity}` : '-',
      schattenKamera: licht
        ? [licht.shadow.camera.left, licht.shadow.camera.right, licht.shadow.camera.top, licht.shadow.camera.bottom, licht.shadow.camera.near, licht.shadow.camera.far].join('/')
        : '-',
      nebel: app.scene.fog ? `${app.scene.fog.color.getHexString()} ${app.scene.fog.near}/${app.scene.fog.far}` : '-',
      belichtung: app.renderer.toneMappingExposure,
      puffer: `${app.renderer.getContext().drawingBufferWidth}x${app.renderer.getContext().drawingBufferHeight}`,
      threads: navigator.hardwareConcurrency,
      renderer: (() => {
        const gl = app.renderer.getContext();
        const e = gl.getExtension('WEBGL_debug_renderer_info');
        return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      })(),
      tiefenBits: (() => {
        const gl = app.renderer.getContext();
        return `${gl.getParameter(gl.DEPTH_BITS)}/${gl.getParameter(gl.STENCIL_BITS)}/${gl.getParameter(gl.SAMPLES)}`;
      })(),
    };
  });
  console.log(`bild=${hash}`);
  for (const [k, v] of Object.entries(z)) console.log(`  ${k}: ${v}`);
} finally {
  await browser.close();
  await server.stop();
}

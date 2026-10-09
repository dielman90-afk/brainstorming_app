// **Kommt nach einem Rundgang durch die Qualitaetsstufen dasselbe Bild heraus?**
//
//   node tools/stufenwechsel.mjs [--env dojo|all] [--nur a-halle,c-engawa] [--out tools/shots/run-stufen]
//
// Befund des Nutzers aus der Brille: „Wenn ich in der Dojo-Umgebung wieder die
// Bildqualitaet aendere, dann ist diese Qualitaet ganz anders als zuvor die
// hoechste Qualitaet." Das sind zwei moegliche Fehler, und dieses Werkzeug
// trennt sie:
//
//   * Die Stufen sehen verschieden aus. Das ist eine Gestaltungsfrage und steht
//     in der Zeile „Stufe X gegen Start".
//   * Die Ausgangsstufe sieht nach dem Rundgang anders aus als vorher. Das waere
//     ein Zustandsfehler (etwas wird beim Umschalten nicht zurueckgestellt) und
//     steht in der Zeile „zurueck gegen Start". Sie muss **0** zeigen.
//
// Umgeschaltet wird ueber denselben Weg wie im Handgelenk-Menue
// (`handleAction('quality')`). Die Zahl der Stufen liest das Werkzeug aus
// `__app.quality.stufen`; fehlt der Eintrag (alter Stand), sind es drei.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (name, vorgabe) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : vorgabe);
const ALLE = ['island', 'zen', 'night', 'matrix', 'dojo'];
const envWahl = wert('--env', 'dojo');
const envs = envWahl === 'all' ? ALLE : envWahl.split(',');
const nur = argv.includes('--nur') ? wert('--nur').split(',') : null;
const outDir = path.resolve(ROOT, wert('--out', 'tools/shots/run-stufen'));

function vergleiche(a, b) {
  let anders = 0;
  let deutlich = 0;
  let max = 0;
  let summe = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2])
    );
    if (d > 0) anders++;
    if (d > 8) deutlich++;
    if (d > max) max = d;
    summe += d;
  }
  const n = a.data.length / 4;
  return {
    anders: ((anders / n) * 100).toFixed(3) + ' %',
    deutlich: ((deutlich / n) * 100).toFixed(3) + ' %',
    max,
    mittel: (summe / n).toFixed(3),
    gleich: anders === 0,
  };
}

const server = await startServer();
const browser = await launchBrowser();
let fehler = false;
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page, messages } = await openApp(browser);
  const bild = async () => {
    await page.waitForTimeout(450);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };
  const stufe = () => page.evaluate(() => window.__app.quality?.aktuell?.() ?? '?');
  const zyklus = await page.evaluate(() => window.__app.quality?.stufen?.length ?? 3);

  for (const env of envs) {
    await selectEnv(page, env);
    await ladeThree(page);
    const shots = shotsFor(env).filter((s) => !nur || nur.includes(s.name));
    for (const shot of shots) {
      await lockCamera(page, shot, 6.0);
      const start = await bild();
      const startName = await stufe();
      process.stdout.write(`\n${env} / ${shot.name}  (Start: ${startName})\n`);
      for (let k = 1; k <= zyklus; k++) {
        await page.evaluate(() => window.__app.handleAction('quality'));
        await lockCamera(page, shot, 6.0);
        const jetzt = await bild();
        const name = await stufe();
        const v = vergleiche(start, jetzt);
        const zurueck = k === zyklus;
        const label = zurueck ? 'zurueck gegen Start' : `Stufe ${name} gegen Start`;
        process.stdout.write(
          `  ${label.padEnd(28)} anders ${v.anders.padStart(9)}  >8 ${v.deutlich.padStart(9)}  max ${String(v.max).padStart(3)}  mittel ${v.mittel}\n`
        );
        await fs.writeFile(path.join(outDir, `${env}-${shot.name}-${k}-${name}.png`), PNG.sync.write(jetzt));
        if (zurueck && !v.gleich) fehler = true;
      }
      await fs.writeFile(path.join(outDir, `${env}-${shot.name}-0-start.png`), PNG.sync.write(start));
    }
  }
  if (messages.length) {
    process.stdout.write(`\nKonsole:\n${messages.slice(0, 20).join('\n')}\n`);
  }
} finally {
  await browser.close();
  await server.stop();
}
process.stdout.write(fehler ? '\nFEHLER: Die Ausgangsstufe kommt nach dem Rundgang nicht bitgleich zurueck.\n' : '\nOK: Rundgang bitgleich.\n');
process.exit(fehler ? 1 : 0);

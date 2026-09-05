// Screenshot-Harness: die festen Ansichten einer Umgebung (+ optional je ein
// Regressionsbild der übrigen vier).
//
//   node tools/screenshots.mjs --out tools/shots/run-00 [--env zen|island] [--all-envs]
//
// Die Kamerapositionen stehen in harness-common.mjs und bleiben über alle
// Durchläufe identisch. Vorgabe ist der Zen-Garten.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  shotsFor,
  envArg,
  REGRESSION_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
  ladeThree,
} from './harness-common.mjs';

const argv = process.argv.slice(2);
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'tools/shots/latest';
const allEnvs = argv.includes('--all-envs');
const envId = envArg(argv);
const SHOTS = shotsFor(envId);
const outDir = path.resolve(ROOT, outArg);

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page, messages } = await openApp(browser);

  await selectEnv(page, envId);
  // `setzeStation` braucht three im Seitenkontext (ein Bild darf eine Station
  // des Rundgangs verlangen).
  await ladeThree(page);
  for (const shot of SHOTS) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
    process.stdout.write(`✓ ${shot.name}  (${shot.title})\n`);
  }

  if (allEnvs) {
    for (const [id, shot] of Object.entries(REGRESSION_SHOTS)) {
      if (id === envId) continue; // die Arbeitsumgebung steht oben schon im Bild
      await selectEnv(page, id);
      await lockCamera(page, { ...shot, name: id }, 6.0);
      await page.waitForTimeout(450);
      // Das Dojo ist die teuerste der fuenf Umgebungen; unter SwiftShader hat
      // ein Einzelbild davon schon die Vorgabe von 30 s gerissen und den
      // ganzen Durchlauf abgebrochen. Der Wert ist reine Harness-Geduld und
      // sagt nichts ueber die Laufzeit auf der Quest.
      await page.screenshot({ path: path.join(outDir, `env-${id}.png`), timeout: 120000 });
      process.stdout.write(`✓ env-${id}\n`);
    }
    // Zurück auf die Arbeitsumgebung, damit ein anschließender Blick nicht irritiert.
    await selectEnv(page, envId);
  }

  if (messages.length) {
    failed = true;
    process.stdout.write(`\n⚠ Konsole nicht sauber (${messages.length}):\n`);
    for (const m of messages.slice(0, 30)) process.stdout.write(`   ${m}\n`);
  } else {
    process.stdout.write('\n✓ Konsole frei von Errors und Warnings\n');
  }
  process.stdout.write(`\nBilder in ${path.relative(ROOT, outDir)}\n`);
} finally {
  await browser.close();
  await server.stop();
}
process.exit(failed ? 1 : 0);

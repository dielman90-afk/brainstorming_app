// **Wer wirft, wer empfängt, und wer leuchtet?**
//
//   node tools/lichtzensus.mjs [--env island]
//
// Der Ausgangsbefund des Nachthimmel-Auftrags lautete „39 Meshes, 0 Werfer,
// 0 Empfänger" — eine Zahl, die man in fünf Sekunden hat und die drei
// Durchläufe Rätselraten erspart. Dieselbe Zahl braucht jede Umgebung.
//
// Ausgegeben werden je Umgebung: Zeichenknoten, Schattenwerfer, -empfänger,
// die Lichter mit Farbe, Stärke und Schattenkarte, sowie `sceneAmbient`.
import { envArg, startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'island');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  const d = await page.evaluate((envId) => {
    const app = window.__app;
    const wurzel = app.scene.getObjectByName(`env-${envId}`) || app.scene;
    let meshes = 0;
    let werfer = 0;
    let empfaenger = 0;
    const ohne = [];
    const wirft = [];
    const empfaengt = [];
    wurzel.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      meshes++;
      if (o.castShadow) {
        werfer++;
        wirft.push(o.name || o.type);
      }
      if (o.receiveShadow) {
        empfaenger++;
        empfaengt.push(o.name || o.type);
      }
      if (!o.castShadow && !o.receiveShadow) ohne.push(o.name || o.type);
    });
    const lichter = [];
    app.scene.traverse((o) => {
      if (!o.isLight) return;
      lichter.push(
        `${(o.name || o.type).padEnd(26)} ${o.type.padEnd(18)} Stärke ${String(o.intensity).padStart(6)}  Farbe #${o.color.getHexString()}` +
          (o.castShadow ? `  Schattenkarte ${o.shadow.mapSize.x}, bias ${o.shadow.bias}, normalBias ${o.shadow.normalBias}` : '  ohne Schatten')
      );
    });
    const env = app.environments?.find?.((e) => e.id === envId);
    return {
      meshes,
      werfer,
      empfaenger,
      ohne: ohne.slice(0, 24),
      wirft,
      empfaengt,
      lichter,
      sceneAmbient: env?.sceneAmbient ?? null,
      schattenkarte: `${app.renderer.shadowMap.enabled ? 'an' : 'aus'}, Typ ${app.renderer.shadowMap.type}`,
    };
  }, envId);
  console.log(`env-${envId}: ${d.meshes} Zeichenknoten, ${d.werfer} Schattenwerfer, ${d.empfaenger} Empfänger`);
  console.log(`  renderer.shadowMap: ${d.schattenkarte}`);
  console.log(`  sceneAmbient: ${d.sceneAmbient === null ? '— (nicht gesetzt)' : d.sceneAmbient}`);
  console.log('  Lichter der ganzen Szene:');
  for (const l of d.lichter) console.log(`    ${l}`);
  console.log(`  wirft: ${d.wirft.join(', ') || '—'}`);
  console.log(`  empfaengt: ${d.empfaengt.join(', ') || '—'}`);
  if (d.ohne.length) console.log(`  ohne Schattenrolle (erste ${d.ohne.length}): ${d.ohne.join(', ')}`);
} finally {
  await browser.close();
  await server.stop();
}

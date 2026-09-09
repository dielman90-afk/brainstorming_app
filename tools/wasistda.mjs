// **Welcher Knoten liegt unter diesem Bildpunkt?**
//
//   node tools/wasistda.mjs [--env dojo] <shot> <x,y> [<x,y> …]
//
// Die Umkehrung von `knotenkasten.mjs`. Der Prüfer nennt Bildkoordinaten
// („schwebende graue Klötze bei 200–270, 175–215"), und die Suche nach dem
// zugehörigen Netz hat mich in diesem Auftrag mehrfach Läufe gekostet: Jeden
// Knoten einzeln aus- und einzublenden sind bei siebzig Netzen und fünf
// Sekunden je Bild rund zwölf Minuten.
//
// Ein Raycast durch das Bildpunkt kostet nichts und sagt dasselbe — three hat
// den Strahl ohnehin. Gemeldet werden alle Treffer entlang des Strahls mit
// Abstand, Name und Materialfarbe, sodass man auch sieht, was *hinter* dem
// vordersten Ding steckt.
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree, VIEWPORT } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'dojo');
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env');
const SHOT = rest[0];
const PUNKTE = rest.slice(1).map((p) => p.split(',').map(Number));
if (!SHOT || !PUNKTE.length) {
  process.stderr.write('node tools/wasistda.mjs [--env dojo] <shot> <x,y> …\n');
  process.exit(1);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await ladeThree(page);
  await lockCamera(page, shotsFor(ENV).find((s) => s.name === SHOT), 6.0);
  await page.waitForTimeout(300);
  const treffer = await page.evaluate(
    ({ punkte, breite, hoehe, gruppe }) => {
      const THREE = window.__THREE;
      const app = window.__app;
      const g = app.scene.children.find((c) => c.name === gruppe);
      const rc = new THREE.Raycaster();
      // **Punktwolken brauchen eine enge Schwelle.** Die Vorgabe fuer
      // `Points` ist 1 — und das ist **ein Meter Weltradius** um den Strahl.
      // Damit meldet das Werkzeug jede Staubwolke der Umgebung als Treffer bei
      // 0,00 m, und genau das hat mich beim Dojo eine Fehlspur gekostet: Es sah
      // aus, als saesse ein Staubkorn auf der Kamera. Zwei Zentimeter sind
      // grosszuegig fuer ein Korn von drei.
      rc.params.Points = { threshold: 0.02 };
      return punkte.map(([x, y]) => {
        const ndc = new THREE.Vector2((x / breite) * 2 - 1, -((y / hoehe) * 2 - 1));
        rc.setFromCamera(ndc, app.camera);
        const hits = rc.intersectObject(g, true).slice(0, 6);
        return {
          x,
          y,
          hits: hits.map((h) => ({
            name: h.object.name || `(${h.object.type})`,
            dist: h.distance,
            farbe: h.object.material?.color ? `#${h.object.material.color.getHexString()}` : '—',
            seite: h.object.material?.side ?? null,
          })),
        };
      });
    },
    { punkte: PUNKTE, breite: VIEWPORT.width, hoehe: VIEWPORT.height, gruppe: `env-${ENV}` }
  );
  for (const t of treffer) {
    process.stdout.write(`${SHOT}  (${t.x},${t.y})\n`);
    if (!t.hits.length) process.stdout.write('   nichts getroffen (Himmel oder Rueckseite)\n');
    for (const h of t.hits) {
      process.stdout.write(`   ${h.dist.toFixed(2).padStart(7)} m  ${h.name.padEnd(30)} ${h.farbe}\n`);
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

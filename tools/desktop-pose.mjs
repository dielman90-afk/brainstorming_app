// **Wie steht die Kamera am Desktop, wenn man eine Umgebung betritt?**
//
// Gemeldet vom Nutzer: „Wenn man im Desktop-Modus die Umgebung betritt, dann ist
// die Steuerung ganz komisch und nicht intuitiv. Man blickt auch zu Beginn
// direkt auf den Boden."
//
// Beides sind Zahlen, keine Meinungen:
//
//   • **Blickneigung** — der Winkel zwischen Blickrichtung und Waagerechter.
//     Senkrecht nach unten sind −90 Grad.
//   • **Kreisradius** — der Abstand zwischen Kamera und `controls.target`. Das
//     ist der Punkt, um den die Maus schwenkt. Bei gut zwei Metern dreht man
//     den Kopf; bei fünfundzwanzig schwenkt man um den Planetenmittelpunkt,
//     und genau das fühlt sich falsch an.
//   • **Augenhöhe über dem Boden** — sie muss im Band von 0,4 bis 2,6 m liegen,
//     das `main.js` erzwingt.
//
// Geprüft wird jede der fünf Umgebungen, so wie man sie betritt: umschalten,
// ein paar Bilder laufen lassen, ablesen. Die Sperre bleibt an — sie ist Teil
// des Vorgangs.
//
//   node tools/desktop-pose.mjs

import { startServer, launchBrowser, openApp } from './harness-common.mjs';

const UMGEBUNGEN = ['island', 'night', 'zen', 'matrix', 'dojo'];

const server = await startServer();
const browser = await launchBrowser();
let fehler = 0;
try {
  const { page, messages } = await openApp(browser);
  console.log('  Umgebung   Neigung   Kreisradius   Auge über Boden   Boden');
  for (const id of UMGEBUNGEN) {
    // Umschalten wie der Nutzer: über die Umgebungsliste, nicht über die Kamera.
    await page.evaluate((wanted) => {
      const api = window.__app.env;
      const ziel = api.environments.findIndex((e) => e.id === wanted);
      let schutz = 0;
      while (api.current() !== ziel && schutz++ < 12) api.cycle();
    }, id);
    // Ein paar Bilder, damit die Sperre und OrbitControls einmal durchlaufen.
    await page.waitForTimeout(700);

    const p = await page.evaluate(() => {
      const app = window.__app;
      const c = app.camera;
      const t = app.controls.target;
      const dx = t.x - c.position.x;
      const dy = t.y - c.position.y;
      const dz = t.z - c.position.z;
      const waag = Math.hypot(dx, dz);
      return {
        neigung: (Math.atan2(dy, waag) * 180) / Math.PI,
        radius: Math.hypot(dx, dy, dz),
        auge: c.position.y - (app.env.floorY() ?? 0),
        boden: app.env.floorY() ?? 0,
      };
    });

    const gut = p.neigung > -35 && p.neigung < 20 && p.radius < 6 && p.auge >= 0.35 && p.auge <= 2.65;
    if (!gut) fehler++;
    console.log(
      `  ${gut ? '✅' : '❌'} ${id.padEnd(8)} ${p.neigung.toFixed(1).padStart(7)}°  ${p.radius
        .toFixed(2)
        .padStart(9)} m  ${p.auge.toFixed(2).padStart(13)} m  ${p.boden.toFixed(2).padStart(7)} m`
    );
  }
  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
  console.log(
    fehler
      ? `\n❌ ${fehler} Umgebung(en) mit unbrauchbarer Anfangspose`
      : '\n✅ jede Umgebung startet mit brauchbarer Pose'
  );
} finally {
  await browser.close();
  await server.stop();
}

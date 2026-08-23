// Prüfung des begehbaren Bereichs (src/walkable.js).
//
// Läuft die echte App im Browser und prüft die Sperre so, wie sie im Betrieb
// greift – in der Bildschleife, nach der Bewegung.
//
// **Warum nicht einfach W drücken.** Der Container hat keine GPU, Chromium
// rendert per SwiftShader; die Insel schafft dort wenige Bilder je Sekunde.
// Weil `dt` in der Schleife auf 0,1 s gedeckelt ist, kommt man je Bild höchstens
// 34 cm weit – ein 20-Sekunden-Lauf trägt dann drei Meter statt siebzig, und die
// Messung sagt mehr über die Bildrate als über die Sperre. Geprüft wird deshalb:
//
//   1. **Grenze:** Die Kamera wird weit hinausgesetzt; die Sperre muss sie im
//      nächsten Bild zurückholen. Das ist derselbe Codepfad, nur ohne die
//      Bildrate im Nenner.
//   2. **Kette (Dojo):** in Schritten von 34 cm – dem echten Maximum je Bild –
//      vom Raum nach Süden, einmal durch die Tür und einmal daneben.
//   3. **Boden:** Standhöhe an mehreren Stellen, direkt aus `walk.floorAt`.
//   4. **Tasten:** W bewegt, Q und E nicht mehr.
//
// Aufruf: node tools/gehbereich.mjs
import { startServer, launchBrowser, openApp, selectEnv } from './harness-common.mjs';

const AUGE_MIN = 0.4;
const AUGE_MAX = 2.6;
const SCHRITT = 0.34; // 3,4 m/s bei gedeckeltem dt = 0,1 s

let fehler = 0;
const pruefe = (ok, text) => {
  if (!ok) fehler++;
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
};

// Kamera setzen und die Sperre ein paar Bilder arbeiten lassen.
async function setzeUndLies(page, x, z, bilder = 12) {
  return page.evaluate(
    async ({ x, z, bilder }) => {
      const { camera, controls } = window.__app;
      camera.position.set(x, camera.position.y, z);
      controls.target.set(x, camera.position.y, z - 1);
      for (let i = 0; i < bilder; i++) await new Promise((r) => requestAnimationFrame(r));
      return {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        floorY: window.__app.env.floorY(),
      };
    },
    { x, z, bilder }
  );
}

// In echten Bildschritten laufen – so, wie updateDesktopMovement es tut.
async function schreite(page, vonX, vonZ, dx, dz, schritte) {
  return page.evaluate(
    async ({ vonX, vonZ, dx, dz, schritte }) => {
      const { camera, controls } = window.__app;
      camera.position.set(vonX, camera.position.y, vonZ);
      controls.target.set(vonX + dx, camera.position.y, vonZ + dz);
      const spur = [];
      for (let i = 0; i < schritte; i++) {
        camera.position.x += dx;
        camera.position.z += dz;
        controls.target.x += dx;
        controls.target.z += dz;
        await new Promise((r) => requestAnimationFrame(r));
        spur.push([+camera.position.x.toFixed(2), +camera.position.z.toFixed(2), +window.__app.env.floorY().toFixed(3)]);
      }
      return spur;
    },
    { vonX, vonZ, dx, dz, schritte }
  );
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);

  // --- Himmelsinsel ---------------------------------------------------------
  await selectEnv(page, 'island');
  console.log('\n=== 🏝 Himmelsinsel ===');
  {
    let maxR = 0;
    let drin = true;
    for (let g = 0; g < 360; g += 30) {
      const a = (g * Math.PI) / 180;
      const p = await setzeUndLies(page, Math.sin(a) * 200, Math.cos(a) * 200, 4);
      const r = Math.hypot(p.x, p.z);
      maxR = Math.max(maxR, r);
      // Erlaubter Radius in genau dieser Richtung, aus der Form selbst.
      const grenze = await page.evaluate(
        ({ x, z }) => {
          const w = window.__app.env.walk();
          const out = { x: 0, z: 0 };
          w.limit(x * 1000, z * 1000, out); // sehr weit draußen ⇒ Randpunkt
          return Math.hypot(out.x, out.z);
        },
        { x: Math.sin(a), z: Math.cos(a) }
      );
      if (r > grenze + 0.01) drin = false;
      console.log(`  ${String(g).padStart(3)}°  geklemmt auf r=${r.toFixed(2)} m (Rand ${grenze.toFixed(2)} m), Boden ${p.floorY.toFixed(2)} m`);
    }
    pruefe(drin, 'jede Richtung landet auf dem Inselrand, nicht darüber hinaus');
    pruefe(maxR > 14 && maxR < 28, `größter Radius ${maxR.toFixed(1)} m liegt im erwarteten Bereich (14–28 m)`);

    // Höhere Ebenen begehbar: Boden über die Insel abtasten.
    const hoehen = await page.evaluate(() => {
      const w = window.__app.env.walk();
      const out = { x: 0, z: 0 };
      let min = Infinity;
      let max = -Infinity;
      for (let g = 0; g < 360; g += 5) {
        const a = (g * Math.PI) / 180;
        for (let f = 0; f <= 1.0001; f += 0.05) {
          w.limit(Math.sin(a) * 200 * f, Math.cos(a) * 200 * f, out);
          const y = w.floorAt(out.x, out.z);
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      }
      return { min, max, mitte: w.floorAt(0, 0) };
    });
    console.log(`  Boden: Mitte ${hoehen.mitte.toFixed(2)} m, tiefster ${hoehen.min.toFixed(2)} m, höchster ${hoehen.max.toFixed(2)} m`);
    // Die Mitte liegt NICHT auf der Grasfläche, sondern rund 0,3 m darunter:
    // Der Bach entspringt dicht am Ursprung und schneidet sein Bett ein
    // (`h -= 0.09 * gauss(riverDist, 0.40)` in `relief`). Das ist richtig so –
    // man steht dort in der Rinne. Geprüft wird deshalb nur, dass die Mitte im
    // Bereich der ebenen Fläche bleibt und nicht irgendwo im Fels landet.
    pruefe(hoehen.mitte > -0.6 && hoehen.mitte < 0.1, 'ebene Mitte bleibt auf Grasniveau (Bachbett eingerechnet)');
    pruefe(hoehen.max > 2.0, `Randwall/Höhenrücken sind begehbar und liegen ${hoehen.max.toFixed(1)} m hoch`);

    // Kein Sprung beim Entlanglaufen an der Kante.
    const spur = await schreite(page, 0, 0, 0, SCHRITT, 70);
    let maxSprung = 0;
    for (let i = 1; i < spur.length; i++) maxSprung = Math.max(maxSprung, Math.abs(spur[i][2] - spur[i - 1][2]));
    const letzte = spur[spur.length - 1];
    console.log(`  Lauf nach Süden: Endpunkt z=${letzte[1]} m, Boden ${letzte[2]} m, größter Bodensprung je Bild ${maxSprung.toFixed(3)} m`);
    pruefe(maxSprung < 1.0, 'Bodenhöhe folgt weich, ohne Sprungschaltung');
  }

  // --- Dojo: die Kette muss unverändert funktionieren -----------------------
  await selectEnv(page, 'dojo');
  console.log('\n=== ⛩ Konstrukt-Dojo ===');
  {
    // Durch die Tür (x = 0): Raum → Durchgang → Engawa → Stufe → Kiesbeet.
    const durch = await schreite(page, 0, 0, 0, SCHRITT, 40);
    const zielDurch = durch[durch.length - 1];
    console.log(`  durch die Tür:  Endpunkt z=${zielDurch[1]} m, Boden ${zielDurch[2]} m`);
    pruefe(zielDurch[1] > 11.5, 'das Kiesbeet wird erreicht (z > 11,5 m)');
    pruefe(Math.abs(zielDurch[2] + 0.375) < 0.05, 'Boden endet auf Kieshöhe (−0,375 m)');

    // Daneben (x = 3): Die Südwand ist zu.
    const daneben = await schreite(page, 3, 0, 0, SCHRITT, 40);
    const zielDaneben = daneben[daneben.length - 1];
    console.log(`  neben der Tür:  Endpunkt z=${zielDaneben[1]} m, Boden ${zielDaneben[2]} m`);
    pruefe(zielDaneben[1] <= 7.06, 'die Südwand hält (z bleibt bei 7,05 m)');

    // Decke: hoch orbiten darf nicht durchs Dach führen.
    const oben = await page.evaluate(async () => {
      const { camera, controls } = window.__app;
      camera.position.set(0, 30, 0);
      controls.target.set(0, 0, -1);
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
      return camera.position.y;
    });
    console.log(`  Kamera von y = 30 m gedrückt auf ${oben.toFixed(2)} m`);
    pruefe(oben <= 2.7, 'die Decke hält (Dojo maxY bzw. Höhenband)');
  }

  // --- Der Planet ------------------------------------------------------------
  //
  // Der 🌌 Nachthimmel war einmal eine unbegrenzte Ebene und ist seit dem Umbau
  // eine Kugel mit 25 m Halbmesser. Die Sperre beantwortet dort eine andere
  // Frage: Sie hält den Spieler am Nordpol und rechnet seine Abdrift in eine
  // Drehung der Welt um. Die alte Prüfung („von (300, −220) aus bleibt er bei
  // (300, −220)") würde hier zu Recht scheitern.
  //
  // Der eigentliche Rundgang wird in `tools/rundgang.mjs` gemessen; hier steht
  // nur, was in diese Datei gehört: dass die Sperre greift und dass der Boden
  // dort liegt, wo das Höhenfeld ihn hinlegt.
  await selectEnv(page, 'night');
  console.log('\n=== 🌌 Nachthimmel (Planet) ===');
  {
    const planet = await page.evaluate(() => {
      const app = window.__app;
      const w = app.env.walk();
      const welt = app.scene.getObjectByName('nacht-welt');
      const start = welt.quaternion.clone();
      const out = { x: 0, z: 0 };
      // Weit hinausgesetzt: Die Sperre muss auf den Freiraum zurückholen.
      w.limit(300, -220, out);
      const weit = { x: out.x, z: out.z, r: Math.hypot(out.x, out.z) };
      welt.quaternion.copy(start);

      // Ein Schritt von 34 cm — das echte Maximum je Bild — muss die Welt um
      // genau 34 cm Bogen drehen, also um 0,34 / 25 rad.
      w.limit(0, 0.9 + 0.34, out);
      const winkel = 2 * Math.acos(Math.min(1, Math.abs(welt.quaternion.clone().multiply(start.clone().invert()).w)));
      welt.quaternion.copy(start);

      return {
        weit,
        bogen: winkel * 25,
        polBoden: w.floorAt(0, 0),
        istPlanet: Boolean(w.istPlanet),
      };
    });
    console.log(
      `  von (300, −220) aus: geklemmt auf (${planet.weit.x.toFixed(2)}, ${planet.weit.z.toFixed(
        2
      )}), Abstand vom Pol ${planet.weit.r.toFixed(2)} m`
    );
    pruefe(planet.istPlanet, 'die Umgebung meldet einen Planeten');
    pruefe(Math.abs(planet.weit.r - 0.9) < 0.01, 'die Sperre hält den Spieler im Freiraum von 90 cm');
    console.log(`  ein Schritt von 34 cm dreht die Welt um ${(planet.bogen * 100).toFixed(2)} cm Bogen`);
    pruefe(Math.abs(planet.bogen - 0.34) < 0.005, 'die Übersetzung ist 1:1 in Bogenmetern');
    console.log(`  Standhöhe am Nordpol ${planet.polBoden.toFixed(3)} m (Sollradius 25 m)`);
    pruefe(
      planet.polBoden > 25 && planet.polBoden < 26,
      'der Spieler steht auf der Kugelschale, nicht auf y = 0'
    );
  }

  // --- Unbegrenzte Welten ---------------------------------------------------
  for (const id of ['zen', 'matrix']) {
    await selectEnv(page, id);
    console.log(`\n=== ${id} ===`);
    const p = await setzeUndLies(page, 300, -220);
    console.log(`  von (300, −220) aus: bleibt bei (${p.x.toFixed(0)}, ${p.z.toFixed(0)}), Boden ${p.floorY.toFixed(2)} m`);
    pruefe(Math.hypot(p.x - 300, p.z + 220) < 0.01, 'horizontal unbegrenzt');
    const ueber = p.y - p.floorY;
    pruefe(ueber >= AUGE_MIN - 0.02 && ueber <= AUGE_MAX + 0.02, `Kamera steht ${ueber.toFixed(2)} m über dem Boden`);
    pruefe(Math.abs(p.floorY) < 0.01, 'ebener Boden auf y = 0');
  }

  // --- Tasten ---------------------------------------------------------------
  await selectEnv(page, 'matrix');
  console.log('\n=== Tasten ===');
  {
    const start = await setzeUndLies(page, 0, 0, 3);
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.waitForTimeout(150);
    const nachW = await page.evaluate(() => ({ ...window.__app.camera.position }));
    const weg = Math.hypot(nachW.x - start.x, nachW.z - start.z);
    console.log(`  W:    ${weg.toFixed(2)} m zurückgelegt`);
    pruefe(weg > 0.3, 'W bewegt noch');

    const yVor = nachW.y;
    for (const taste of ['e', 'q']) {
      await page.keyboard.down(taste);
      await page.waitForTimeout(700);
      await page.keyboard.up(taste);
    }
    await page.waitForTimeout(150);
    const yNach = await page.evaluate(() => window.__app.camera.position.y);
    console.log(`  Q/E:  y ${yVor.toFixed(3)} → ${yNach.toFixed(3)}`);
    pruefe(Math.abs(yNach - yVor) < 0.02, 'Q und E bewegen nichts mehr');
  }

  if (messages.length) console.log('\nKonsole:\n  ' + messages.join('\n  '));
} finally {
  await browser.close();
  await server.stop();
}
console.log(fehler ? `\n${fehler} Abweichung(en)` : '\n✅ Alles im Rahmen');
process.exit(fehler ? 1 : 0);

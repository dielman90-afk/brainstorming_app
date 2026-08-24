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

  // --- Gehen auf dem Planeten -----------------------------------------------
  //
  // Der zweite Teil der Meldung war „die Steuerung ist komisch". Der
  // Kreisradius war die eine Haelfte; die andere ist, ob Gehen ueberhaupt
  // funktioniert. Auf dem Planeten schiebt WASD die Kamera vom Pol weg, die
  // Sperre holt sie zurueck und dreht dabei die Welt. Das darf sich nicht
  // gegenseitig aufheben.
  //
  // Die zurueckgelegte Strecke haengt hier an der Bildrate — der Container hat
  // keine GPU, und `dt` ist auf 0,1 s gedeckelt. Geprueft wird deshalb die
  // Richtung und dass der Nutzer am Pol bleibt, nicht der Betrag.
  await page.evaluate(() => {
    const api = window.__app.env;
    const ziel = api.environments.findIndex((e) => e.id === 'night');
    let schutz = 0;
    while (api.current() !== ziel && schutz++ < 12) api.cycle();
  });
  await page.waitForTimeout(700);
  const vorher = await page.evaluate(() => {
    const app = window.__app;
    const w = app.scene.getObjectByName('nacht-welt');
    return {
      q: w.quaternion.toArray(),
      abstand: Math.hypot(app.camera.position.x, app.camera.position.z),
      auge: app.camera.position.y - (app.env.floorY() ?? 0),
    };
  });
  // **Sechs Sekunden, nicht zwei.** Der Container hat keine GPU; gemessen
  // schafft der Nachthimmel dort 2,4 Bilder je Sekunde, und `dt` ist in der
  // Schleife auf 0,1 s gedeckelt — je Bild also hoechstens 34 cm. Zwei Sekunden
  // sind fuenf Bilder, und die ersten davon gehen fuer den Freiraum drauf. Der
  // Messwert saegt hier an der Bildrate, nicht an der Steuerung.
  await page.evaluate(() => { window.__bilder = 0; const t = () => { window.__bilder++; requestAnimationFrame(t); }; t(); });
  await page.keyboard.down('w');
  await page.waitForTimeout(6000);
  await page.keyboard.up('w');
  await page.waitForTimeout(200);
  const nachher = await page.evaluate((q0) => {
    const app = window.__app;
    const w = app.scene.getObjectByName('nacht-welt');
    // Winkel zwischen Anfangs- und Endstellung, in Bogenmetern.
    const a = q0;
    const b = w.quaternion.toArray();
    const punkt = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const winkel = 2 * Math.acos(Math.min(1, Math.abs(punkt)));
    return {
      bogen: winkel * 25,
      abstand: Math.hypot(app.camera.position.x, app.camera.position.z),
      auge: app.camera.position.y - (app.env.floorY() ?? 0),
    };
  }, vorher.q);

  const bilder = await page.evaluate(() => window.__bilder);
  console.log('\n=== Gehen im Nachthimmel (Taste W, 6 s) ===');
  console.log(`  Welt gedreht um ${nachher.bogen.toFixed(2)} m Bogen in ${bilder} Bildern`);
  console.log(
    `  Abstand vom Pol ${vorher.abstand.toFixed(2)} -> ${nachher.abstand.toFixed(2)} m   ` +
      `Auge ueber Boden ${vorher.auge.toFixed(2)} -> ${nachher.auge.toFixed(2)} m`
  );
  const gehtGut = nachher.bogen > 0.3 && nachher.abstand <= 0.95 && nachher.auge > 1.0 && nachher.auge < 2.3;
  if (!gehtGut) fehler++;
  console.log(
    gehtGut
      ? '  ✅ die Welt dreht sich, der Nutzer bleibt am Pol und auf Augenhoehe'
      : '  ❌ Gehen auf dem Planeten funktioniert nicht wie erwartet'
  );


  // --- Umsehen darf nicht Gehen sein ----------------------------------------
  //
  // `OrbitControls` schwenkt die Kamera auf einer Kugel um `controls.target`.
  // Auf dem Planeten liest die Sperre jede Verschiebung der Kamera als Schritt
  // — beim Mausziehen liefe man also seitwaerts. Genau das war die zweite
  // Haelfte der Meldung „die Steuerung ist komisch".
  //
  // Der Prueflauf schaltet die Steuerung dafuer wieder ein: `openApp` hat sie
  // abgeschaltet, damit feste Kameras nicht verdreht werden.
  await page.evaluate(() => { window.__app.controls.enabled = true; });
  const vorZiehen = await page.evaluate(() => {
    const a = window.__app;
    return {
      q: a.scene.getObjectByName('nacht-welt').quaternion.toArray(),
      blick: a.camera.getWorldDirection(new (a.camera.position.constructor)()).toArray(),
    };
  });
  const kasten = await page.evaluate(() => {
    const r = window.__app.renderer.domElement.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(kasten.x, kasten.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(kasten.x + i * 18, kasten.y);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const nachZiehen = await page.evaluate((vor) => {
    const a = window.__app;
    const w = a.scene.getObjectByName('nacht-welt');
    const b = a.camera.getWorldDirection(new (a.camera.position.constructor)()).toArray();
    const punkt = Math.min(1, Math.abs(vor.blick[0] * b[0] + vor.blick[1] * b[1] + vor.blick[2] * b[2]));
    // **Die Drehung ZWISCHEN den beiden Stellungen**, nicht die Differenz
    // zweier Gesamtwinkel. Der erste Anlauf hat letzteres gerechnet und damit
    // eine Drehung gemeldet, die es nicht gab: Zwei Stellungen koennen denselben
    // Winkel zur Identitaet haben und trotzdem weit auseinanderliegen — und
    // umgekehrt.
    const a2 = vor.q;
    const b2 = w.quaternion.toArray();
    const qp = Math.abs(a2[0]*b2[0] + a2[1]*b2[1] + a2[2]*b2[2] + a2[3]*b2[3]);
    return {
      gedreht: 2 * Math.acos(Math.min(1, qp)) * 25,
      blickWinkel: (Math.acos(punkt) * 180) / Math.PI,
    };
  }, vorZiehen);

  console.log('\n=== Umsehen mit der Maus (216 px ziehen) ===');
  console.log(
    `  Blick gedreht um ${nachZiehen.blickWinkel.toFixed(1)}°,` +
      ` Welt dabei um ${nachZiehen.gedreht.toFixed(3)} m Bogen`
  );
  const sauber = nachZiehen.blickWinkel > 5 && nachZiehen.gedreht < 0.05;
  if (!sauber) fehler++;
  console.log(
    sauber
      ? '  ✅ Umsehen dreht den Blick, nicht die Welt'
      : '  ❌ Umsehen verschiebt den Nutzer ueber den Planeten'
  );

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

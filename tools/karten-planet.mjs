// **Bleiben die Karten liegen?**
//
// Der Grund für den ganzen Umbau: Der Planet soll eine begehbare
// Gedächtnislandkarte sein. Das steht und fällt damit, dass eine abgelegte
// Karte dort bleibt, wo sie liegt — auch wenn man einmal um den Planeten geht
// und wiederkommt, und auch über das Speichern hinweg.
//
// Geprüft wird fünferlei:
//   1. Eine Karte, die im Nachthimmel entsteht, hängt an der Weltgruppe.
//   2. Nach einer halben Runde und zurück steht sie wieder an derselben Stelle.
//   3. `toJSON` schreibt ihre Lage **relativ zur Weltgruppe** — nach einer
//      halben Runde muss derselbe Wert herauskommen wie am Anfang.
//   4. **Dasselbe gilt für Zonen.** Eine Zone ist der Rahmen, vor dem Karten
//      stehen; bliebe sie beim Nutzer, während die Karten mit dem Planeten
//      wandern, wäre die Gruppierung nach zwanzig Schritten aufgelöst — und
//      der Rahmen stünde vor einer leeren Fläche.
//   5. In einer der anderen vier Umgebungen hängen beide weiter an der Szene.
//
//   node tools/karten-planet.mjs

import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
let fehler = 0;
const pruefe = (bedingung, text) => {
  console.log(`  ${bedingung ? '✅' : '❌'} ${text}`);
  if (!bedingung) fehler++;
};

try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);

  const ergebnis = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.scene.getObjectByName('nacht-welt');
    const cm = app.cardManager;

    // **Die Ausgangsstellung muss festgenagelt werden.** Die Sperre läuft in
    // diesem Werkzeug mit — sie soll ja mitlaufen — und dreht die Welt in jedem
    // Bild ein Stück, solange der Kopf neben dem Pol steht. Ohne diese zwei
    // Zeilen wurde die Weltpose der Karte einmal unter einer beliebigen Drehung
    // abgelesen und später unter der Identität, und der Vergleich maß den
    // Unterschied zweier Bezugsstellungen statt den der Karte. Gemessen war das
    // ein Fehler von 31 cm bei einer Karte, die sich nicht bewegt hatte.
    app.env.setWalkEnabled?.(false);
    welt.quaternion.identity();
    welt.updateMatrixWorld(true);

    const karte = cm.addCard('Merkstein');
    // Irgendwo neben dem Startpunkt ablegen, in Weltkoordinaten.
    karte.group.position.set(1.4, 26.2, -0.8);
    const elter = karte.group.parent?.name || '(Szene)';
    const weltVorher = karte.group.getWorldPosition(new T.Vector3()).toArray();
    const jsonVorher = cm.toJSON().cards.find((c) => c.id === karte.id);

    // Eine halbe Runde: 78,5 m Bogen sind pi um die Achse, um die das Gehen
    // nach +Z dreht.
    const halb = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
    welt.quaternion.copy(halb);
    welt.updateMatrixWorld(true);
    const weltHalb = karte.group.getWorldPosition(new T.Vector3()).toArray();
    const jsonHalb = cm.toJSON().cards.find((c) => c.id === karte.id);

    // Und wieder zurück.
    welt.quaternion.identity();
    welt.updateMatrixWorld(true);
    const weltZurueck = karte.group.getWorldPosition(new T.Vector3()).toArray();

    // Speichern und laden, mit gedrehter Welt dazwischen — so, wie es beim
    // Neuladen der Seite passiert.
    const stand = cm.toJSON();
    welt.quaternion.copy(halb);
    welt.updateMatrixWorld(true);
    cm.loadJSON(stand);
    welt.updateMatrixWorld(true);
    const nachLadenLokal = karte.group.position.toArray();

    welt.quaternion.identity();
    welt.updateMatrixWorld(true);
    const nachLadenWelt = cm.cards
      .find((c) => c.text === 'Merkstein')
      .group.getWorldPosition(new T.Vector3())
      .toArray();

    cm.clear();
    return {
      elter,
      weltVorher,
      weltHalb,
      weltZurueck,
      jsonVorher: jsonVorher.position,
      jsonHalb: jsonHalb.position,
      rahmen: jsonVorher.frame ?? null,
      nachLadenLokal,
      nachLadenWelt,
    };
  });

  const abstand = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const f = (v) => v.map((x) => x.toFixed(3)).join(' | ');

  console.log('\n=== 🌌 Nachthimmel: Karten am Planeten ===');
  console.log(`  Elter der neuen Karte: ${ergebnis.elter}`);
  pruefe(ergebnis.elter === 'nacht-welt', 'die Karte hängt an der Weltgruppe, nicht an der Szene');

  console.log(`  Weltort am Start        ${f(ergebnis.weltVorher)}`);
  console.log(`  nach einer halben Runde ${f(ergebnis.weltHalb)}`);
  console.log(`  wieder am Start         ${f(ergebnis.weltZurueck)}`);
  pruefe(
    abstand(ergebnis.weltVorher, ergebnis.weltHalb) > 40,
    `sie wandert mit dem Planeten mit (${abstand(ergebnis.weltVorher, ergebnis.weltHalb).toFixed(2)} m auf der Gegenseite)`
  );
  pruefe(
    abstand(ergebnis.weltVorher, ergebnis.weltZurueck) < 1e-5,
    'nach der ganzen Runde steht sie wieder exakt dort'
  );

  console.log(`\n  gespeichert am Start    ${f(ergebnis.jsonVorher)}   frame=${ergebnis.rahmen}`);
  console.log(`  gespeichert nach halb   ${f(ergebnis.jsonHalb)}`);
  pruefe(ergebnis.rahmen === 'planet', 'der Stand vermerkt den Planetenrahmen');
  pruefe(
    abstand(ergebnis.jsonVorher, ergebnis.jsonHalb) < 1e-5,
    'der gespeicherte Ort hängt nicht davon ab, wo der Nutzer gerade steht'
  );

  console.log(`\n  nach Laden (lokal)      ${f(ergebnis.nachLadenLokal)}`);
  console.log(`  nach Laden (Welt, Runde zurückgedreht) ${f(ergebnis.nachLadenWelt)}`);
  pruefe(
    abstand(ergebnis.nachLadenWelt, ergebnis.weltVorher) < 1e-4,
    'nach dem Neuladen liegt sie wieder an derselben Stelle des Planeten'
  );

  // --- Zonen: derselbe Anspruch ---------------------------------------------
  const zonen = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.scene.getObjectByName('nacht-welt');
    const zm = app.zoneManager;

    app.env.setWalkEnabled?.(false);
    welt.quaternion.identity();
    welt.updateMatrixWorld(true);

    const zone = zm.addZone({ title: 'Merkfeld' });
    zone.group.position.set(-1.1, 26.5, 1.9);
    const elter = zone.group.parent?.name || '(Szene)';
    const weltVorher = zone.group.getWorldPosition(new T.Vector3()).toArray();
    const jsonVorher = zm.toJSON()[0];

    const halb = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
    welt.quaternion.copy(halb);
    welt.updateMatrixWorld(true);
    const weltHalb = zone.group.getWorldPosition(new T.Vector3()).toArray();
    const jsonHalb = zm.toJSON()[0];

    // Speichern, Welt drehen, laden — wie beim Neuladen der Seite.
    const stand = zm.toJSON();
    zm.loadJSON(stand);
    welt.quaternion.identity();
    welt.updateMatrixWorld(true);
    const nachLadenWelt = zm.zones[0].group.getWorldPosition(new T.Vector3()).toArray();

    zm.clear();
    return { elter, weltVorher, weltHalb, jsonVorher, jsonHalb, nachLadenWelt };
  });

  console.log('\n=== 🌌 Nachthimmel: Zonen am Planeten ===');
  console.log(`  Elter der neuen Zone: ${zonen.elter}`);
  pruefe(zonen.elter === 'nacht-welt', 'die Zone hängt an der Weltgruppe, nicht an der Szene');
  console.log(`  Weltort am Start        ${f(zonen.weltVorher)}`);
  console.log(`  nach einer halben Runde ${f(zonen.weltHalb)}`);
  pruefe(
    abstand(zonen.weltVorher, zonen.weltHalb) > 40,
    `sie wandert mit dem Planeten mit (${abstand(zonen.weltVorher, zonen.weltHalb).toFixed(2)} m)`
  );
  console.log(`  gespeichert am Start    ${f(zonen.jsonVorher.position)}   frame=${zonen.jsonVorher.frame ?? null}`);
  console.log(`  gespeichert nach halb   ${f(zonen.jsonHalb.position)}`);
  pruefe(zonen.jsonVorher.frame === 'planet', 'der Stand vermerkt den Planetenrahmen');
  pruefe(
    abstand(zonen.jsonVorher.position, zonen.jsonHalb.position) < 1e-5,
    'der gespeicherte Ort hängt nicht davon ab, wo der Nutzer gerade steht'
  );
  console.log(`  nach Laden (Welt, Runde zurückgedreht) ${f(zonen.nachLadenWelt)}`);
  pruefe(
    abstand(zonen.nachLadenWelt, zonen.weltVorher) < 1e-4,
    'nach dem Neuladen steht sie wieder an derselben Stelle des Planeten'
  );

  // --- Gegenprobe: die anderen vier Umgebungen -------------------------------
  await selectEnv(page, 'zen');
  const zen = await page.evaluate(() => {
    const app = window.__app;
    const karte = app.cardManager.addCard('Gegenprobe');
    const zone = app.zoneManager.addZone({ title: 'Gegenprobe' });
    const aus = {
      karteElter: karte.group.parent === app.scene ? '(Szene)' : karte.group.parent?.name,
      karteRahmen: app.cardManager.toJSON().cards[0].frame ?? null,
      zoneElter: zone.group.parent === app.scene ? '(Szene)' : zone.group.parent?.name,
      zoneRahmen: app.zoneManager.toJSON()[0].frame ?? null,
    };
    app.cardManager.clear();
    app.zoneManager.clear();
    return aus;
  });
  console.log('\n=== 🪷 Zen-Garten: Gegenprobe ===');
  console.log(`  Karte: Elter ${zen.karteElter}, frame=${zen.karteRahmen}`);
  console.log(`  Zone:  Elter ${zen.zoneElter}, frame=${zen.zoneRahmen}`);
  pruefe(zen.karteElter === '(Szene)', 'dort hängen Karten weiter an der Szene');
  pruefe(zen.zoneElter === '(Szene)', 'und Zonen ebenso');
  pruefe(
    zen.karteRahmen === null && zen.zoneRahmen === null,
    'beide Stände bleiben im alten Format'
  );

  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
  console.log(fehler ? `\n❌ ${fehler} Prüfung(en) fehlgeschlagen` : '\n✅ alle Prüfungen bestanden');
} finally {
  await browser.close();
  await server.stop();
}

// **Wo landen die Tafeln, die sich vor den Nutzer stellen?**
//
// Whiteboard, Zeitgeber, Zonen und die Kartenreihe haben alle dieselbe Zeile:
// `pos.y = clamp(camPos.y + versatz, 0.6…1.0, 2.0…2.2)`. Die Grenzen sind
// **absolute** Welthöhen und setzen damit stillschweigend voraus, dass der
// Boden bei y = 0 liegt. Auf einer Kugel von 25 m Halbmesser steht der Nutzer
// bei y ≈ 26,9 — die Klemmung schlägt an, und die Tafel landet zwanzig und mehr
// Meter unter seinen Füßen, also im Gestein.
//
// Gemessen wird die Höhe **über dem Boden unter dem Nutzer**, nicht über y = 0.
// Nur die erste Zahl sagt etwas darüber, ob man die Tafel sieht.
//
//   node tools/panelhoehe.mjs
import { startServer, launchBrowser, openApp, selectEnv } from './harness-common.mjs';

const UMGEBUNGEN = ['island', 'zen', 'matrix', 'dojo', 'night'];

const server = await startServer();
const browser = await launchBrowser();
let abweichungen = 0;
try {
  const { page } = await openApp(browser);
  for (const id of UMGEBUNGEN) {
    await selectEnv(page, id);
    await page.waitForTimeout(200);
    const erg = await page.evaluate(() => {
      const app = window.__app;
      const cam = app.camera;
      const boden = app.env.floorY();
      const kam = cam.getWorldPosition(new (cam.position.constructor)());
      const aus = { boden, kamY: kam.y, tafeln: {} };

      // Whiteboard
      app.whiteboard.placeInFront(cam);
      aus.tafeln.whiteboard = app.whiteboard.group.getWorldPosition(
        new (cam.position.constructor)()
      ).y;

      // Zeitgeber
      if (app.timer?.placeInFront) {
        app.timer.placeInFront(cam);
        aus.tafeln.zeitgeber = app.timer.group.getWorldPosition(
          new (cam.position.constructor)()
        ).y;
      }

      // Zone — sie hängt auf dem Planeten an der Weltgruppe, deshalb ist die
      // **Welt**position gefragt und nicht die lokale.
      const zone = app.zoneManager.addZone({ title: 'Prüfmaß' });
      zone.placeInFront(cam);
      aus.tafeln.zone = zone.group.getWorldPosition(new (cam.position.constructor)()).y;
      app.zoneManager.removeZone(zone);

      // Kartenreihe: eine Karte anlegen und einordnen lassen.
      const karte = app.cardManager.addCard('Prüfmaß');
      app.cardManager.arrangeInArc([karte], cam, 0);
      aus.tafeln.karte = karte.group.getWorldPosition(new (cam.position.constructor)()).y;
      app.cardManager.removeCard(karte);

      // Flussdiagramm: zwei verbundene Prozessknoten anlegen und ordnen lassen.
      const a = app.cardManager.addCard('A', { flowType: app.flow.types[0]?.id ?? 'step' });
      const b = app.cardManager.addCard('B', { flowType: app.flow.types[0]?.id ?? 'step' });
      app.flow.layout();
      aus.tafeln.fluss = a.group.getWorldPosition(new (cam.position.constructor)()).y;
      // Und hängt der Knoten noch dort, wo Karten hingehören?
      aus.flussHeimat = a.group.parent === app.cardManager.heimat;
      app.cardManager.removeCard(a);
      app.cardManager.removeCard(b);

      return aus;
    });

    const zeilen = Object.entries(erg.tafeln).map(([name, y]) => {
      const ueber = y - erg.boden;
      const ok = ueber > 0.2 && ueber < 3.0;
      if (!ok) abweichungenMerken();
      return `    ${name.padEnd(12)} y=${y.toFixed(2).padStart(7)}   über dem Boden ${ueber
        .toFixed(2)
        .padStart(7)} m  ${ok ? '✅' : '❌'}`;
    });
    console.log(`=== ${id} ===`);
    console.log(`    Boden ${erg.boden?.toFixed(2)} m, Kamera ${erg.kamY.toFixed(2)} m`);
    console.log(zeilen.join('\n'));
    if (erg.flussHeimat === false) {
      abweichungenMerken();
      console.log('    ❌ das Flussdiagramm hat die Karten von ihrer Heimat gelöst');
    } else {
      console.log('    ✅ das Flussdiagramm lässt die Karten an ihrer Heimat');
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
function abweichungenMerken() {
  abweichungen++;
}
console.log(
  abweichungen === 0
    ? '\n✅ jede Tafel steht in Reichweite über dem Boden'
    : `\n❌ ${abweichungen} Tafel(n) außer Reichweite`
);
process.exit(abweichungen === 0 ? 0 : 1);

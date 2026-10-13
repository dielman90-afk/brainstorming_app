// **Liegt das Prozessdiagramm flach?** (src/flowLayout.js, src/connections.js)
//
// Der Nutzer wollte keine zu ihm gedrehten Knoten mehr, sondern eine flache
// Tafel. Ob sie flach ist, sieht man einem Standbild schlecht an — ein Fächer
// aus 0,7 Grad je Rang ist auf einem Bildschirmfoto kaum zu erkennen. Gemessen
// wird deshalb an den Weltposen selbst:
//
//   1. alle Knoten tragen dieselbe Weltdrehung (Winkelabstand < 0,01 Grad);
//   2. alle Knotenmittelpunkte liegen in einer Ebene (Abstand < 1 mm), und
//      deren Normale ist dieselbe wie die der Karten;
//   3. die Normale ist waagerecht und zeigt zum Standpunkt beim Anordnen;
//   4. jedes Zweigschild trägt die Weltdrehung seiner Quellkarte und liegt
//      vor der Tafel, vor dem Pfeilschaft (Radius 4 mm).
//
// Zweimal: auf der Insel, wo alles an der Szene hängt, und im Nachthimmel,
// **nachdem** sich die Weltgruppe unter dem Nutzer gedreht hat. Dort hängen
// die Karten an der gedrehten Gruppe, und jede Verwechslung von lokaler und
// Weltdrehung zeigt sich als Winkel — genau die Fehlerquelle, an der diese
// App schon mehrfach hing (siehe heimat.js).
//
// Zum Schluss eine Gegenprobe: Die Knoten werden wie früher einzeln zur Kamera
// gedreht, und die Messung muss das als Fächer erkennen. Sonst bewiese ein
// „OK" nur, dass sie nichts sieht.
//
// Aufruf: HARNESS_PORT=… node tools/flussflach.mjs
import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const WINKEL_MAX = 0.01; // Grad
const EBENE_MAX = 0.001; // m
// Das Schild muss vor dem Schaft liegen (Radius 4 mm), aber nicht sichtbar
// über der Tafel schweben.
const SCHILD_MIN = 0.004;
const SCHILD_MAX = 0.03;

let fehler = 0;
const pruefe = (ok, text) => {
  if (!ok) fehler++;
  console.log(`  ${ok ? 'OK    ' : 'FEHLER'} ${text}`);
};

// Läuft im Browser. Legt den Prozess an, ordnet ihn und misst.
async function baueUndMiss(page, { gehen, gier }) {
  return page.evaluate(
    ({ gehen, gier }) => {
      const T = window.__THREE;
      const app = window.__app;
      const { cardManager: cm, connectionManager: con, camera, controls, scene } = app;
      const grad = (rad) => (rad * 180) / Math.PI;
      const winkel = (a, b) => grad(2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))));

      // Vorher gehen: Auf dem Planeten dreht jeder Schritt über den Freiraum
      // hinaus die Weltgruppe. Zwei Richtungen, damit die Drehung keine reine
      // Kippung um eine Achse bleibt.
      const walk = app.env.walk();
      const welt = scene.getObjectByName('nacht-welt');
      const out = { x: 0, z: 0 };
      for (const [a, n] of gehen) {
        for (let i = 0; i < n; i++) {
          const r = walk.freiraum + 0.3;
          walk.limit(Math.sin(a) * r, Math.cos(a) * r, out);
        }
      }
      const weltDrehung = welt ? grad(2 * Math.acos(Math.min(1, Math.abs(welt.quaternion.w)))) : 0;

      // Schräg schauen, damit „vorn" nicht zufällig die −Z-Achse ist.
      const boden = app.env.floorY() ?? 0;
      camera.position.set(0.1, boden + 1.6, 0.05);
      const ziel = new T.Vector3(0.1 - Math.sin(gier), boden + 1.4, 0.05 - Math.cos(gier));
      controls.target.copy(ziel);
      camera.lookAt(ziel);
      camera.updateMatrixWorld(true);

      // Sieben Knoten, eine Verzweigung mit beschrifteten Zweigen und eine
      // Rückführung.
      cm.clear();
      con.clear();
      const k = (text, flowType) => cm.addCard(text, { flowType });
      const start = k('Antrag eingegangen', 'start');
      const pruefen = k('Unterlagen prüfen', 'task');
      const frage = k('Vollständig?', 'decision');
      const nach = k('Unterlagen nachfordern', 'task');
      const bewerten = k('Antrag bewerten', 'task');
      const bescheid = k('Bescheid senden', 'task');
      const ende = k('Erledigt', 'end');
      con.connect(start, pruefen);
      con.connect(pruefen, frage);
      con.connect(frage, bewerten, { label: 'ja' });
      con.connect(frage, nach, { label: 'nein' });
      con.connect(nach, pruefen);
      con.connect(bewerten, bescheid);
      con.connect(bescheid, ende);
      const knoten = [start, pruefen, frage, nach, bewerten, bescheid, ende];

      const camPos = camera.getWorldPosition(new T.Vector3());
      const vorn = camera.getWorldDirection(new T.Vector3());
      vorn.y = 0;
      vorn.normalize();

      const anzahl = app.flow.layout();
      con.update();

      const miss = () => {
        const q = knoten.map((c) => c.group.getWorldQuaternion(new T.Quaternion()));
        const p = knoten.map((c) => c.group.getWorldPosition(new T.Vector3()));
        const qSpanne = Math.max(...q.map((x) => winkel(x, q[0])));
        const kartenNormale = new T.Vector3(0, 0, 1).applyQuaternion(q[0]);

        // Ebene aus den Positionen, unabhängig von der Kartendrehung: der
        // weiteste Knoten vom ersten, dann der weiteste von dieser Linie.
        const p0 = p[0];
        const pa = p.reduce((m, x) => (x.distanceTo(p0) > m.distanceTo(p0) ? x : m));
        const linie = pa.clone().sub(p0).normalize();
        const abLinie = (x) => x.clone().sub(p0).cross(linie).length();
        const pb = p.reduce((m, x) => (abLinie(x) > abLinie(m) ? x : m));
        const ebene = pa.clone().sub(p0).cross(pb.clone().sub(p0)).normalize();
        if (ebene.dot(kartenNormale) < 0) ebene.negate();
        const ebenenAbstand = Math.max(...p.map((x) => Math.abs(x.clone().sub(p0).dot(ebene))));

        const schilder = con.connections
          .filter((c) => c.labelPanel)
          .map((c) => {
            const quelle = knoten.find((n) => n.id === c.a);
            const qq = quelle.group.getWorldQuaternion(new T.Quaternion());
            const nq = new T.Vector3(0, 0, 1).applyQuaternion(qq);
            const mesh = c.labelPanel.mesh;
            const ql = mesh.getWorldQuaternion(new T.Quaternion());
            const pl = mesh.getWorldPosition(new T.Vector3());
            return {
              text: c.label,
              elterIstSzene: mesh.parent === scene,
              winkel: winkel(ql, qq),
              vorTafel: pl.clone().sub(quelle.group.getWorldPosition(new T.Vector3())).dot(nq),
            };
          });
        return { qSpanne, ebenenAbstand, ebene, kartenNormale, schilder };
      };

      const m = miss();
      const ergebnis = {
        anzahl,
        weltDrehung,
        anWelt: welt ? knoten.every((c) => c.group.parent === welt) : null,
        qSpanne: m.qSpanne,
        ebenenAbstand: m.ebenenAbstand,
        ebeneZuKarte: winkel(
          new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), m.ebene),
          new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), m.kartenNormale)
        ),
        normaleY: m.kartenNormale.y,
        zurKamera: grad(m.kartenNormale.angleTo(vorn.clone().negate())),
        kameraSeite: camPos.clone().sub(knoten[0].group.getWorldPosition(new T.Vector3())).dot(m.kartenNormale),
        schilder: m.schilder,
      };

      // Auf dem Planeten weitergehen: Die Tafel dreht mit der Welt, die
      // Schilder müssen ihren Karten im nächsten `update()` folgen.
      if (welt) {
        for (let i = 0; i < 20; i++) walk.limit(0.3 + walk.freiraum, 0, out);
        con.update();
        ergebnis.nachGehen = miss().schilder.map((s) => s.winkel);
      }

      // Gegenprobe: die alte Fächerdrehung — jeder Knoten zur Kamera.
      for (const c of knoten) {
        const w = c.group.getWorldPosition(new T.Vector3());
        c.group.lookAt(camPos.x, w.y, camPos.z);
      }
      ergebnis.faecher = miss().qSpanne;
      return ergebnis;
    },
    { gehen, gier }
  );
}

function bericht(name, e) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${e.anzahl} Knoten angeordnet, Weltgruppe um ${e.weltDrehung.toFixed(1)} Grad gedreht`);
  pruefe(e.anzahl === 7, 'alle sieben Knoten sind angeordnet');
  if (e.anWelt !== null) {
    pruefe(e.weltDrehung > 10, 'die Weltgruppe ist vorher spürbar gedreht worden');
    pruefe(e.anWelt, 'die Knoten hängen an der Weltgruppe (Heimat), nicht an der Szene');
  }
  pruefe(e.qSpanne < WINKEL_MAX, `gleiche Weltdrehung aller Knoten: größter Abstand ${e.qSpanne.toFixed(5)} Grad`);
  pruefe(e.ebenenAbstand < EBENE_MAX, `Mittelpunkte in einer Ebene: größter Abstand ${(e.ebenenAbstand * 1000).toFixed(4)} mm`);
  pruefe(e.ebeneZuKarte < WINKEL_MAX, `Ebenennormale = Kartennormale: ${e.ebeneZuKarte.toFixed(5)} Grad`);
  pruefe(Math.abs(e.normaleY) < 1e-6, `Normale waagerecht: y = ${e.normaleY.toExponential(2)}`);
  pruefe(e.zurKamera < WINKEL_MAX && e.kameraSeite > 0, `Normale zeigt zum Standpunkt: ${e.zurKamera.toFixed(5)} Grad gegen −vorn`);
  pruefe(e.schilder.length === 2, `${e.schilder.length} Zweigschilder (ja/nein)`);
  for (const s of e.schilder) {
    pruefe(s.elterIstSzene, `„${s.text}" hängt an der Szene`);
    pruefe(s.winkel < WINKEL_MAX, `„${s.text}" trägt die Weltdrehung der Quellkarte: ${s.winkel.toFixed(5)} Grad`);
    pruefe(
      s.vorTafel > SCHILD_MIN && s.vorTafel < SCHILD_MAX,
      `„${s.text}" liegt ${(s.vorTafel * 1000).toFixed(1)} mm vor der Quellkarte`
    );
  }
  if (e.nachGehen) {
    const w = Math.max(...e.nachGehen);
    pruefe(w < WINKEL_MAX, `nach 20 weiteren Schritten folgen die Schilder ihren Karten: ${w.toFixed(5)} Grad`);
  }
  pruefe(e.faecher > 1, `Gegenprobe: die alte Fächerdrehung wird erkannt (${e.faecher.toFixed(2)} Grad Spanne)`);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);
  await ladeThree(page);

  await selectEnv(page, 'island');
  bericht('Himmelsinsel', await baueUndMiss(page, { gehen: [], gier: 0.65 }));

  await selectEnv(page, 'night');
  // Warten, bis die Bildschleife den Planeten eingemessen hat: Bodenhöhe
  // gesetzt, Kamera auf der Polachse. Unter SwiftShader dauert ein Bild hier
  // mehrere Sekunden.
  await page.waitForFunction(() => (window.__app.env.floorY() ?? 0) > 20, null, { timeout: 300000 });
  bericht('Nachthimmel', await baueUndMiss(page, { gehen: [[0.7, 30], [2.1, 20]], gier: -0.9 }));

  const echte = messages.filter((m) => !/Failed to load resource/.test(m));
  if (echte.length) console.log('\nKonsole:\n  ' + echte.join('\n  '));
} finally {
  await browser.close();
  await server.stop();
}
console.log(fehler ? `\nFEHLER: ${fehler} Abweichung(en)` : '\nOK: das Prozessdiagramm liegt flach');
process.exit(fehler ? 1 : 0);

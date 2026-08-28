// **Verhalten sich Tafel und Karten auf dem Planeten richtig?**
//
// Gemeldet wurden zwei Dinge aus der Brille bzw. vom Desktop:
//
//   * „Das Whiteboard wird bei Bewegung mitgezogen."
//   * „Kärtchen verschwinden, wenn man sie verschieben möchte."
//
// Beides ist auf einer Kugel ein anderer Sachverhalt als auf einer Ebene, und
// beides lässt sich zählen statt beschreiben:
//
//   1. **Mitgezogen.** Der Nutzer steht auf dem Planeten still, die Welt dreht
//      sich unter ihm. Was an der Szene hängt, bleibt damit **für immer vor
//      ihm** — es wandert nicht mit, es geht nie weg. Gemessen wird der Bogen,
//      um den sich ein Gegenstand nach einer Vierteldrehung der Welt vom Nutzer
//      entfernt hat. Für einen Gegenstand der Welt sind das 39,3 m; für etwas,
//      das am Nutzer klebt, null.
//
//   2. **Verschwunden.** Der Desktop-Zug spannt eine Ebene durch
//      `group.position` und rechnet einen Versatz gegen einen Treffpunkt aus
//      dem Raycast. Der eine Wert ist **lokal** (Elter ist auf dem Planeten die
//      Weltgruppe), der andere **Welt**. Auf den vier flachen Umgebungen ist
//      das dasselbe, weil die Szene im Ursprung steht; auf dem Planeten liegen
//      zwischen beiden bis zu 25 m und eine beliebige Drehung. Gemessen wird,
//      wie weit ein Gegenstand springt, wenn die Maus ihn um zehn Bildpunkte
//      zieht.
//
//   node tools/werkzeuge.mjs [--env night|zen]

import { startServer, launchBrowser, openApp, selectEnv, ladeThree, envArg } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');

const server = await startServer();
const browser = await launchBrowser();
let fehler = 0;
const pruefe = (bedingung, text) => {
  console.log(`  ${bedingung ? '✅' : '❌'} ${text}`);
  if (!bedingung) fehler++;
};

try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  // **Erst den Nutzer auf dem Boden ankommen lassen.** Der Bodenblock in
  // main.js setzt die Kamera beim Betreten des Planeten von 1,6 m auf 26,9 m —
  // und zwar im Bildlauf, nicht beim Umschalten. Ein erster Anlauf hat direkt
  // nach `selectEnv` gemessen, die Karte damit bei y = 1,4 m abgelegt, also
  // **im Inneren des Planeten**, 1,4 m von der Drehachse entfernt. Dort ist
  // lokal fast gleich Welt, und beide Prüfungen liefen ins Leere: Die
  // Vierteldrehung ergab 2,02 m statt 37,8, und der Mauszug sprang nicht,
  // weil es nichts zu springen gab.
  await page.waitForTimeout(700);
  const augeY = await page.evaluate(() => window.__app.camera.getWorldPosition(new window.__THREE.Vector3()).y);
  console.log(`\n  Augenhöhe beim Start: ${augeY.toFixed(2)} m`);
  if (envId === 'night' && augeY < 20) {
    throw new Error(`Der Nutzer steht nicht auf dem Planeten (y = ${augeY.toFixed(2)})`);
  }

  // --- 1: Bleibt liegen, was liegen bleiben soll? --------------------------
  const bleiben = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    app.env.setWalkEnabled?.(false);
    // **Nicht am Vorhandensein des Knotens erkennen.** Alle fünf Umgebungen
    // stehen gleichzeitig im Szenengraphen, nur vier davon unsichtbar —
    // `nacht-welt` gibt es also auch im Zen-Garten. Ein erster Anlauf hat
    // daraufhin dort die Planetenprüfungen angelegt und 0,00 m als Fehler
    // gemeldet, obwohl 0,00 m in einer ortsfesten Umgebung genau richtig ist.
    // Maßgeblich ist, welche Heimat die Karten gerade haben.
    const aufPlanet = app.cardManager.heimat !== app.scene;
    const welt = aufPlanet ? app.cardManager.heimat : null;
    if (welt) {
      welt.quaternion.identity();
      welt.updateMatrixWorld(true);
    }
    const auge = app.camera.getWorldPosition(new T.Vector3());

    app.whiteboard.setVisible(true);
    app.whiteboard.placeInFront(app.camera);
    const karte = app.cardManager.addCard('Zugprobe');
    karte.group.position.copy(
      app.cardManager.heimat === app.scene
        ? new T.Vector3(auge.x + 0.4, auge.y - 0.2, auge.z - 1.5)
        : app.cardManager.heimat.worldToLocal(new T.Vector3(auge.x + 0.4, auge.y - 0.2, auge.z - 1.5))
    );
    app.scene.updateMatrixWorld(true);

    const w0 = app.whiteboard.group.getWorldPosition(new T.Vector3());
    const k0 = karte.group.getWorldPosition(new T.Vector3());

    // Eine Vierteldrehung der Welt: 39,3 m Bogen, ein Viertel des Rundgangs.
    if (welt) {
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
      const himmel = app.scene.getObjectByName('nacht-himmel');
      if (himmel) himmel.quaternion.copy(welt.quaternion);
      app.scene.updateMatrixWorld(true);
    }
    const w1 = app.whiteboard.group.getWorldPosition(new T.Vector3());
    const k1 = karte.group.getWorldPosition(new T.Vector3());

    const kartenId = karte.id;
    return {
      planet: aufPlanet,
      tafelElter: app.whiteboard.group.parent?.name || '(Szene)',
      kartenElter: karte.group.parent?.name || '(Szene)',
      tafelWeg: w0.distanceTo(w1),
      karteWeg: k0.distanceTo(k1),
      kartenId,
    };
  });

  console.log(`\n=== 1. Was bleibt liegen? (${envId}) ===`);
  console.log(`  Tafel hängt an  ${bleiben.tafelElter}`);
  console.log(`  Karte hängt an  ${bleiben.kartenElter}`);
  console.log(
    `  Nach einer Vierteldrehung der Welt: Tafel ${bleiben.tafelWeg.toFixed(2)} m,` +
      ` Karte ${bleiben.karteWeg.toFixed(2)} m vom Ausgangsort`
  );
  if (bleiben.planet) {
    pruefe(bleiben.karteWeg > 30, 'die Karte bleibt am Planeten liegen');
    pruefe(
      bleiben.tafelWeg > 30,
      'die Tafel bleibt am Planeten liegen (bei 0,00 m klebt sie am Nutzer)'
    );
  } else {
    pruefe(bleiben.karteWeg < 0.001, 'ortsfeste Umgebung: die Karte bewegt sich nicht');
    pruefe(bleiben.tafelWeg < 0.001, 'ortsfeste Umgebung: die Tafel bewegt sich nicht');
  }

  // --- 2: Der Zug mit der Maus, in einer **gedrehten** Welt ----------------
  //
  // **Der erste Anlauf hat hier nichts gefunden, und der Grund ist lehrreich.**
  // Er hat die Weltdrehung vorher auf die Einheit zurückgesetzt, damit der
  // Gegenstand wieder im Bild steht — und unter der Einheit ist die lokale
  // Koordinate in der Weltgruppe gleich der Weltkoordinate. Genau die
  // Verwechslung, die geprüft werden soll, fällt dann nicht auf. Der Nutzer
  // meldet den Fehler ja auch erst, *nachdem* er gelaufen ist.
  //
  // Gedreht wird deshalb um 40 Grad — gut 17 m Bogen, ein Viertel des Weges zum
  // Gegenpol — und der Gegenstand danach frisch vor den Nutzer gesetzt.
  const wo = await page.evaluate((id) => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.cardManager.heimat !== app.scene ? app.cardManager.heimat : null;
    if (welt) {
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (40 * Math.PI) / 180);
      const himmel = app.scene.getObjectByName('nacht-himmel');
      if (himmel) himmel.quaternion.copy(welt.quaternion);
    }
    app.scene.updateMatrixWorld(true);

    const auge = app.camera.getWorldPosition(new T.Vector3());
    const richtung = app.camera.getWorldDirection(new T.Vector3());
    richtung.y = 0;
    richtung.normalize();
    const vorn = auge.clone().addScaledVector(richtung, 1.5);

    const karte = app.cardManager.cards.find((c) => c.id === id);
    const heimat = app.cardManager.heimat;
    karte.group.position.copy(
      heimat === app.scene ? vorn : heimat.worldToLocal(vorn.clone())
    );
    app.whiteboard.placeInFront(app.camera);
    app.scene.updateMatrixWorld(true);

    const rect = app.renderer.domElement.getBoundingClientRect();
    const auf = (obj) => {
      const p = obj.getWorldPosition(new T.Vector3()).project(app.camera);
      return {
        x: rect.left + ((p.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - p.y) / 2) * rect.height,
        sichtbar: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1,
      };
    };
    return {
      karte: auf(karte.group),
      griff: auf(app.whiteboard.handle),
      karteWelt: karte.group.getWorldPosition(new T.Vector3()).toArray(),
      tafelWelt: app.whiteboard.group.getWorldPosition(new T.Vector3()).toArray(),
    };
  }, bleiben.kartenId);

  const zug = async (start, dx, dy) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(start.x + (dx * i) / 5, start.y + (dy * i) / 5);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(60);
  };

  console.log(`\n=== 2. Der Zug mit der Maus, Welt um 40 Grad gedreht ===`);
  if (!wo.karte.sichtbar || !wo.griff.sichtbar) {
    console.log('  ⚠ Karte oder Griff stehen nicht im Bild — der Zug wird übersprungen');
    fehler++;
  } else {
    await zug(wo.karte, 40, 0);
    const nachKarte = await page.evaluate((id) => {
      const T = window.__THREE;
      const app = window.__app;
      const karte = app.cardManager.cards.find((c) => c.id === id);
      return karte.group.getWorldPosition(new T.Vector3()).toArray();
    }, bleiben.kartenId);
    await zug(wo.griff, 40, 0);
    const nachTafel = await page.evaluate(() =>
      window.__app.whiteboard.group.getWorldPosition(new window.__THREE.Vector3()).toArray()
    );
    const weg = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const karteWeg = weg(wo.karteWelt, nachKarte);
    const tafelWeg = weg(wo.tafelWelt, nachTafel);
    // 40 Bildpunkte bei 1280 px und 55 Grad Bildwinkel sind rund 1,7 Grad; auf
    // 1,5 m Entfernung also gut 4 cm. Alles über einem halben Meter ist ein
    // Sprung und kein Zug.
    console.log(`  Karte um 40 Bildpunkte gezogen → ${karteWeg.toFixed(2)} m bewegt`);
    console.log(`  Tafel um 40 Bildpunkte gezogen → ${tafelWeg.toFixed(2)} m bewegt`);
    pruefe(karteWeg > 0.005 && karteWeg < 0.5, 'die Karte folgt der Maus, statt zu springen');
    pruefe(tafelWeg > 0.005 && tafelWeg < 0.5, 'die Tafel folgt der Maus, statt zu springen');
  }

  // --- 3: Alles andere, was sich vor den Nutzer stellt ---------------------
  //
  // Zeituhr, Zone und Flussdiagramm rechnen nach demselben Muster wie die Tafel:
  // Sie bauen eine Weltlage aus der Kamerapose und schreiben sie in eine Gruppe.
  // Ob dabei in die Heimat umgerechnet wird, sieht man nicht am Code, sondern
  // daran, wo die Sachen nach einer Weltdrehung stehen.
  const rest = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    // **Aufgestellt wird in einer bereits gedrehten Welt.** Das ist der Fall,
    // der schiefging: `placeInFront` rechnet die Weltlage in die Heimat um —
    // und `inHeimat` verändert den Vektor dabei an Ort und Stelle. Wer danach
    // noch `pos.y` als Weltziel an `lookAt` gibt, richtet das Panel gegen eine
    // lokale Höhe aus. Bei nicht gedrehter Welt sind beide gleich und nichts
    // fällt auf; bei 40 Grad kippt das Panel.
    const welt = app.cardManager.heimat !== app.scene ? app.cardManager.heimat : null;
    if (welt) {
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (40 * Math.PI) / 180);
      app.scene.updateMatrixWorld(true);
    }

    app.timer.setVisible(true);
    app.timer.placeInFront(app.camera);
    const zone = app.zoneManager.addZone({ title: 'Zugprobe' });
    zone.placeInFront(app.camera);
    // Ein Knoten mit Flussform, damit `layoutFlow` etwas zu legen hat.
    const knoten = app.cardManager.addCard('Fluss');
    knoten.flowType = app.flow.types[0].id;
    app.flow.layout();
    app.scene.updateMatrixWorld(true);

    const auge = app.camera.getWorldPosition(new T.Vector3());
    const messe = (g) => ({
      elter: g.parent?.name || '(Szene)',
      // Abstand zum Nutzer und Neigung gegen die Senkrechte: Ein Panel, das
      // in einem falschen Bezugssystem ausgerichtet wurde, steht schief.
      weg: g.getWorldPosition(new T.Vector3()).distanceTo(auge),
      neigung:
        (Math.acos(
          Math.min(1, Math.abs(new T.Vector3(0, 1, 0).applyQuaternion(g.getWorldQuaternion(new T.Quaternion())).y))
        ) * 180) / Math.PI,
    });
    const vorher = { uhr: messe(app.timer.group), zone: messe(zone.group), knoten: messe(knoten.group) };

    // Eine **weitere** Vierteldrehung, nicht eine absolute: Aufgestellt wurde
    // schon bei 40 Grad.
    if (welt) {
      welt.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
      app.scene.updateMatrixWorld(true);
    }
    const nachher = { uhr: messe(app.timer.group), zone: messe(zone.group), knoten: messe(knoten.group) };
    return { planet: Boolean(welt), vorher, nachher };
  });

  console.log('\n=== 3. Zeituhr, Zone und Flussdiagramm ===');
  console.log('  Gegenstand   Elter            Abstand zum Nutzer   Neigung gegen die Senkrechte');
  for (const name of ['uhr', 'zone', 'knoten']) {
    const v = rest.vorher[name];
    const n = rest.nachher[name];
    console.log(
      `  ${name.padEnd(11)} ${v.elter.padEnd(16)} ${v.weg.toFixed(2)} m → ${n.weg
        .toFixed(2)
        .padStart(6)} m      ${v.neigung.toFixed(1)}°`
    );
    // Aufgestellt wird immer 1,5 bis 2,5 m vor dem Nutzer, und senkrecht.
    pruefe(v.weg > 0.5 && v.weg < 3.0, `${name}: steht in Reichweite vor dem Nutzer`);
    pruefe(v.neigung < 5, `${name}: steht senkrecht, nicht verkantet`);
    if (rest.planet) {
      pruefe(n.weg > 30, `${name}: bleibt nach einer Vierteldrehung am Planeten`);
    } else {
      pruefe(Math.abs(n.weg - v.weg) < 0.001, `${name}: ortsfeste Umgebung, nichts bewegt sich`);
    }
  }

  // --- 4: Über das Speichern hinweg ---------------------------------------
  //
  // Die Tafel schreibt ihre Lage seit dieser Runde **relativ zur Heimat**. Wenn
  // das schiefgeht, merkt man es erst nach dem Neuladen — und dann steht die
  // Tafel dort, wo der Nutzer zuletzt stand, statt dort, wo er sie aufgestellt
  // hat. Dieselbe Prüfung, die `tools/karten-planet.mjs` für Karten fährt.
  const speichern = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.cardManager.heimat !== app.scene ? app.cardManager.heimat : null;
    if (welt) {
      welt.quaternion.identity();
      app.scene.updateMatrixWorld(true);
    }
    app.whiteboard.setVisible(true);
    app.whiteboard.placeInFront(app.camera);
    app.scene.updateMatrixWorld(true);
    const lokalVorher = app.whiteboard.group.position.clone();
    const stand = app.boardToJSON();
    const rahmen = stand.whiteboard?.frame ?? null;

    // Eine halbe Runde weiterlaufen, dann den Stand laden.
    if (welt) {
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
      app.scene.updateMatrixWorld(true);
    }
    app.applyBoardJSON(stand);
    app.scene.updateMatrixWorld(true);
    const lokalNachher = app.whiteboard.group.position.clone();
    return {
      planet: Boolean(welt),
      rahmen,
      abweichung: lokalVorher.distanceTo(lokalNachher),
      lokalVorher: lokalVorher.toArray().map((v) => +v.toFixed(3)),
      lokalNachher: lokalNachher.toArray().map((v) => +v.toFixed(3)),
    };
  });

  console.log('\n=== 4. Die Tafel über das Speichern hinweg ===');
  console.log(`  Rahmen im Stand: ${speichern.rahmen ?? '(keiner — Weltkoordinaten)'}`);
  console.log(`  lokal vorher  ${speichern.lokalVorher.join(' | ')}`);
  console.log(`  lokal nachher ${speichern.lokalNachher.join(' | ')}`);
  pruefe(
    speichern.abweichung < 0.005,
    `nach einer halben Runde und Neuladen steht sie wieder am selben Ort (${(speichern.abweichung * 100).toFixed(2)} cm)`
  );
  if (speichern.planet) {
    pruefe(speichern.rahmen === 'planet', 'der Stand vermerkt den Planetenrahmen');
  } else {
    pruefe(speichern.rahmen === null, 'ortsfeste Umgebung: der Stand bleibt im alten Format');
  }

  // --- 5: Der Knopf „Werkzeuge ordnen" ------------------------------------
  //
  // Zwei Dinge muss er leisten: die Werkzeuge zurückholen, nachdem man
  // weitergegangen ist, und sie **nebeneinander** stellen statt übereinander.
  // Das zweite ist der Grund, warum `placeInFront` allein nicht reicht — es
  // setzt jedes Panel für sich auf dieselbe Stelle.
  const ordnen = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.cardManager.heimat !== app.scene ? app.cardManager.heimat : null;
    if (welt) {
      welt.quaternion.identity();
      app.scene.updateMatrixWorld(true);
    }
    app.whiteboard.setVisible(true);
    app.whiteboard.placeInFront(app.camera);
    app.timer.setVisible(true);
    app.timer.placeInFront(app.camera);
    app.scene.updateMatrixWorld(true);

    const auge = app.camera.getWorldPosition(new T.Vector3());
    const mitte = (g) => g.getWorldPosition(new T.Vector3());
    // Überlappen sich zwei Panels? Gemessen am Winkelabstand ihrer Mitten
    // gegen die Summe ihrer halben Winkelbreiten.
    const winkelAbstand = (a, b) => {
      const va = mitte(a).sub(auge);
      const vb = mitte(b).sub(auge);
      va.y = 0;
      vb.y = 0;
      return (va.angleTo(vb) * 180) / Math.PI;
    };
    const halbwinkel = (g, breite) => {
      const r = mitte(g).sub(auge).length();
      return (Math.atan(breite / 2 / r) * 180) / Math.PI;
    };
    const vorher = {
      abstand: winkelAbstand(app.whiteboard.group, app.timer.group),
      noetig: halbwinkel(app.whiteboard.group, app.whiteboard.breite) + halbwinkel(app.timer.group, app.timer.breite),
    };

    // Eine halbe Runde weiterlaufen, dann ordnen.
    if (welt) {
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
      app.scene.updateMatrixWorld(true);
    }
    const wegVorher = mitte(app.whiteboard.group).distanceTo(auge);
    app.ordneAlles();
    app.scene.updateMatrixWorld(true);

    const nachher = {
      abstand: winkelAbstand(app.whiteboard.group, app.timer.group),
      noetig: halbwinkel(app.whiteboard.group, app.whiteboard.breite) + halbwinkel(app.timer.group, app.timer.breite),
      tafelWeg: mitte(app.whiteboard.group).distanceTo(auge),
      uhrWeg: mitte(app.timer.group).distanceTo(auge),
      // Steht das Panel senkrecht und schaut es zum Nutzer?
      tafelNeigung:
        (Math.acos(
          Math.min(1, Math.abs(new T.Vector3(0, 1, 0).applyQuaternion(app.whiteboard.group.getWorldQuaternion(new T.Quaternion())).y))
        ) * 180) / Math.PI,
      // Winkel zwischen der Flächennormale und der Richtung zum Auge: 0 heißt,
      // das Panel schaut den Nutzer an.
      tafelSchielt: (() => {
        const n = new T.Vector3(0, 0, 1).applyQuaternion(app.whiteboard.group.getWorldQuaternion(new T.Quaternion()));
        const zumAuge = auge.clone().sub(mitte(app.whiteboard.group)).normalize();
        n.y = 0;
        zumAuge.y = 0;
        return (n.normalize().angleTo(zumAuge.normalize()) * 180) / Math.PI;
      })(),
    };
    return { planet: Boolean(welt), vorher, nachher, wegVorher };
  });

  console.log('\n=== 5. Der Knopf „Werkzeuge ordnen" ===');
  console.log(
    `  Vorher (beide mit placeInFront gesetzt): Winkelabstand ${ordnen.vorher.abstand.toFixed(1)}°,` +
      ` nötig wären ${ordnen.vorher.noetig.toFixed(1)}°`
  );
  console.log(
    `  Nach einer halben Runde stand die Tafel ${ordnen.wegVorher.toFixed(1)} m entfernt`
  );
  console.log(
    `  Nachher: Winkelabstand ${ordnen.nachher.abstand.toFixed(1)}°, nötig ${ordnen.nachher.noetig.toFixed(1)}°;` +
      ` Tafel ${ordnen.nachher.tafelWeg.toFixed(2)} m, Uhr ${ordnen.nachher.uhrWeg.toFixed(2)} m`
  );
  pruefe(ordnen.vorher.abstand < ordnen.vorher.noetig, 'vorher überlappten sich Tafel und Uhr tatsächlich');
  pruefe(
    ordnen.nachher.abstand >= ordnen.nachher.noetig,
    `nachher überlappen sie nicht mehr (${ordnen.nachher.abstand.toFixed(1)}° ≥ ${ordnen.nachher.noetig.toFixed(1)}°)`
  );
  pruefe(ordnen.nachher.tafelWeg > 1.0 && ordnen.nachher.tafelWeg < 3.3, 'die Tafel steht wieder in Reichweite');
  pruefe(ordnen.nachher.uhrWeg > 1.0 && ordnen.nachher.uhrWeg < 3.3, 'die Uhr steht wieder in Reichweite');
  pruefe(ordnen.nachher.tafelNeigung < 2, `die Tafel steht senkrecht (${ordnen.nachher.tafelNeigung.toFixed(1)}°)`);
  pruefe(ordnen.nachher.tafelSchielt < 2, `die Tafel schaut den Nutzer an (${ordnen.nachher.tafelSchielt.toFixed(1)}°)`);

  // --- 6: Zonen nehmen ihre Karten mit ------------------------------------
  //
  // Eine Zone weiß nicht, welche Karten zu ihr gehören — es gibt nur Nähe.
  // Würde `ordneAlles` die Rahmen einsammeln und die Karten getrennt neu
  // verteilen, löste ein Klick jede Gruppierung auf, die von Hand gebaut wurde.
  // Geprüft wird deshalb die Lage **relativ zur Zone**, vor und nach dem Ordnen.
  const mitziehen = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    app.zoneManager.clear();
    app.cardManager.clear?.();
    app.scene.updateMatrixWorld(true);

    const zone = app.zoneManager.addZone({ title: 'Gruppe A' });
    zone.placeInFront(app.camera);
    app.scene.updateMatrixWorld(true);

    // Drei Karten vor den Rahmen legen, in seinem eigenen Koordinatensystem.
    const drin = [];
    for (const [dx, dy] of [[-0.4, 0.2], [0.0, -0.1], [0.45, -0.3]]) {
      const k = app.cardManager.addCard('in der Zone');
      const welt = zone.group.localToWorld(new T.Vector3(dx, dy, 0.05));
      const h = app.cardManager.heimat;
      k.group.position.copy(h === app.scene ? welt : h.worldToLocal(welt.clone()));
      drin.push(k);
    }
    // Und zwei weit weg, die frei bleiben müssen.
    const draussen = [];
    for (let i = 0; i < 2; i++) {
      const k = app.cardManager.addCard('frei');
      const auge = app.camera.getWorldPosition(new T.Vector3());
      const welt = auge.clone().add(new T.Vector3(3 + i, -0.3, -1));
      const h = app.cardManager.heimat;
      k.group.position.copy(h === app.scene ? welt : h.worldToLocal(welt.clone()));
      draussen.push(k);
    }
    app.scene.updateMatrixWorld(true);

    const relativ = (k) =>
      zone.group.worldToLocal(k.group.getWorldPosition(new T.Vector3())).toArray();
    const vorher = drin.map(relativ);
    const erkannt = drin.filter((k) => zone.umfasst(k.group.getWorldPosition(new T.Vector3()))).length;
    const falschErkannt = draussen.filter((k) => zone.umfasst(k.group.getWorldPosition(new T.Vector3()))).length;

    app.ordneAlles();
    app.scene.updateMatrixWorld(true);
    const nachher = drin.map(relativ);
    let groessteAbweichung = 0;
    for (let i = 0; i < vorher.length; i++) {
      groessteAbweichung = Math.max(
        groessteAbweichung,
        Math.hypot(vorher[i][0] - nachher[i][0], vorher[i][1] - nachher[i][1], vorher[i][2] - nachher[i][2])
      );
    }
    // Und die freien Karten: Stehen sie danach vor dem Nutzer statt drei Meter daneben?
    const auge = app.camera.getWorldPosition(new T.Vector3());
    const freiWeg = draussen.map((k) => k.group.getWorldPosition(new T.Vector3()).distanceTo(auge));
    return { erkannt, falschErkannt, groessteAbweichung, freiWeg };
  });

  console.log('\n=== 6. Zonen nehmen ihre Karten mit ===');
  console.log(`  Von 3 Karten vor dem Rahmen erkannt: ${mitziehen.erkannt}`);
  console.log(`  Von 2 Karten weit weg fälschlich zugeordnet: ${mitziehen.falschErkannt}`);
  console.log(
    `  Größte Abweichung ihrer Lage relativ zur Zone: ${(mitziehen.groessteAbweichung * 1000).toFixed(3)} mm`
  );
  console.log(`  Freie Karten stehen danach ${mitziehen.freiWeg.map((v) => v.toFixed(2)).join(' und ')} m entfernt`);
  pruefe(mitziehen.erkannt === 3, 'alle drei Karten vor dem Rahmen werden erkannt');
  pruefe(mitziehen.falschErkannt === 0, 'die weit entfernten werden nicht zugeordnet');
  pruefe(mitziehen.groessteAbweichung < 0.001, 'die Zonenkarten behalten ihre Lage zur Zone auf den Millimeter');
  pruefe(
    mitziehen.freiWeg.every((v) => v > 0.8 && v < 2.4),
    'die freien Karten stehen danach in Reichweite vor dem Nutzer'
  );

  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
  console.log(fehler ? `\n❌ ${fehler} Prüfung(en) fehlgeschlagen` : '\n✅ alles in Ordnung');
} finally {
  await browser.close();
  await server.stop();
}
process.exit(fehler ? 1 : 0);

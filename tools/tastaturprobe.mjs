// **Sieht man, wohin man auf der Tastatur zielt?** (src/keyboard.js,
// src/interactions.js, src/locomotion.js)
//
// Der Nutzer hat gemeldet, dass er auf der virtuellen Tastatur nicht erkennt,
// wohin sein Strahl zeigt. Ursachen und Abhilfen:
//
//   1. Der Strahl lag unter der Tastatur (Zeichenordnung 0 gegen 30–32, die
//      Tastatur ohne Tiefentest) und war genau am Ziel verdeckt. Jetzt zeichnet
//      er danach, und ein Zielpunkt liegt flach auf der getroffenen Fläche.
//   2. Die Hervorhebung war ein kaum sichtbarer Farbwechsel. Jetzt: Rand,
//      Anheben, Vibrations-Tick, Aufblitzen und Klick beim Drücken.
//   3. In den Lücken lief der Strahl durch die Tastatur auf Karten dahinter.
//      Jetzt fängt das Panel ihn ab und gibt ihn an die nächste Taste.
//   4. Der Stick bewegte einen beim Tippen von der Tastatur weg. Jetzt steht
//      man still, solange sie offen ist.
//
// Ohne Brille gibt es keine XR-Sitzung. Geprüft wird deshalb mit den echten
// Controller-Objekten der App, die von Hand gesetzt und ausgerichtet werden,
// und mit denselben Methoden, die die Bildschleife in XR aufruft. Für den
// Stillstand wird `isPresenting` für die Dauer eines synchronen Aufrufs
// gesetzt – dazwischen läuft kein Bild.
//
// Gegenproben: Ohne Strahlfang muss der Lückenstrahl wieder auf der Karte
// dahinter landen, und ohne Pause muss der Stick wieder bewegen. Sonst bewiese
// ein „OK" nur, dass die Messung nichts sieht.
//
// Aufruf: HARNESS_PORT=… node tools/tastaturprobe.mjs [--bild <ordner>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, launchBrowser, openApp, ladeThree, ROOT } from './harness-common.mjs';

const args = process.argv.slice(2);
const bildIdx = args.indexOf('--bild');
const bildOrdner = bildIdx >= 0 ? path.resolve(args[bildIdx + 1]) : path.join(ROOT, 'tools/shots/run-tastatur');

let fehler = 0;
const pruefe = (ok, text) => {
  if (!ok) fehler++;
  console.log(`  ${ok ? 'OK    ' : 'FEHLER'} ${text}`);
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);
  await ladeThree(page);

  // Hilfsfunktionen im Browser: Controller auf einen Weltpunkt richten.
  await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    window.__tp = {
      kopf: () => app.camera.getWorldPosition(new T.Vector3()),
      // Controller in Hüfthöhe rechts vor dem Kopf, Strahl (−Z) auf das Ziel.
      ziele(index, ziel, versatz = [0.12, -0.38, -0.12]) {
        const c = app.interactions.controllers[index];
        const start = this.kopf().add(new T.Vector3(...versatz));
        const parent = c.parent;
        parent.updateMatrixWorld(true);
        // Der Zielraum eines XR-Controllers hat `matrixAutoUpdate = false` (three
        // setzt seine Matrix aus der Pose) – nach Position und Drehung also die
        // Matrix selbst nachziehen.
        c.position.copy(parent.worldToLocal(start.clone()));
        c.updateMatrix();
        c.updateMatrixWorld(true);
        // Object3D.lookAt richtet +Z aus; der Strahl ist −Z.
        c.lookAt(start.clone().multiplyScalar(2).sub(ziel));
        c.updateMatrix();
        c.updateMatrixWorld(true);
        c.visible = true;
        return start;
      },
      taste(label) {
        return app.keyboard.keys.find((k) => k.label === label);
      },
      welt(mesh) {
        return mesh.getWorldPosition(new T.Vector3());
      },
      // Punkt in Tastatur-Koordinaten → Welt
      lokal(x, y) {
        return app.keyboard.group.localToWorld(new T.Vector3(x, y, 0));
      },
    };
  });

  // --- Öffnen ----------------------------------------------------------------
  console.log('\n=== Tastatur öffnen ===');
  const auf = await page.evaluate(() => {
    const app = window.__app;
    window.__eingabe = null;
    app.keyboard.open(app.camera, {
      onSubmit: (t) => (window.__eingabe = t),
      onCancel: () => (window.__eingabe = '(abgebrochen)'),
    });
    app.scene.updateMatrixWorld(true);
    return { offen: app.keyboard.offen, ziele: app.keyboard.uiTargets.length, tasten: app.keyboard.keys.length };
  });
  pruefe(auf.offen, 'die Tastatur ist offen');
  pruefe(auf.ziele === auf.tasten + 1, `Strahlziele: ${auf.tasten} Tasten und das Panel (${auf.ziele})`);

  // --- 1. Strahl und Zielpunkt ---------------------------------------------
  console.log('\n=== 1. Strahl und Zielpunkt ===');
  const eins = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const tp = window.__tp;
    const ia = app.interactions;
    const c = ia.controllers[0];
    const g = tp.taste('g');
    tp.ziele(0, tp.welt(g.mesh));
    const hit = ia._xrRaycast(c);
    ia._setzeStrahl(c, hit, ia._setzeZeiger(c, hit));
    const z = c.userData.zeiger;
    const ray = c.getObjectByName('ray');
    const normal = new T.Vector3(0, 0, 1).applyQuaternion(z.quaternion);
    const kbNormal = new T.Vector3(0, 0, 1).applyQuaternion(app.keyboard.group.getWorldQuaternion(new T.Quaternion()));
    return {
      typ: hit?.type,
      istG: hit?.object === g.mesh,
      rayOrder: ray.renderOrder,
      tastenOrder: g.mesh.renderOrder,
      hudOrder: 44,
      sichtbar: z.visible,
      abstandPunkt: z.position.distanceTo(hit.point),
      ohneTiefe: z.children.every((m) => m.material.depthTest === false),
      zeigerOrder: Math.min(...z.children.map((m) => m.renderOrder)),
      flach: Math.abs(normal.dot(kbNormal)),
      radius: z.scale.x,
      soll: hit.distance * 0.011,
      distanz: hit.distance,
    };
  });
  pruefe(eins.typ === 'ui' && eins.istG, `der Strahl auf „g" trifft „g" (${eins.typ})`);
  pruefe(eins.rayOrder > eins.tastenOrder && eins.rayOrder > eins.hudOrder, `der Strahl zeichnet nach Tastatur und HUD (${eins.rayOrder} > ${eins.tastenOrder}, ${eins.hudOrder})`);
  pruefe(eins.sichtbar, 'der Zielpunkt ist sichtbar');
  pruefe(eins.abstandPunkt < 0.003, `er liegt am Trefferpunkt (${(eins.abstandPunkt * 1000).toFixed(1)} mm)`);
  pruefe(eins.flach > 0.999, `er liegt flach auf der Tastatur (|cos| ${eins.flach.toFixed(4)})`);
  pruefe(eins.ohneTiefe && eins.zeigerOrder > eins.tastenOrder, 'auf flacher UI ohne Tiefentest und über den Tasten gezeichnet');
  pruefe(Math.abs(eins.radius - eins.soll) < 1e-6, `gleiche Sehgröße: ${(eins.radius * 1000).toFixed(1)} mm Halbmesser in ${eins.distanz.toFixed(2)} m`);

  // --- 3. Lücken -------------------------------------------------------------
  console.log('\n=== 3. Lücken zwischen den Tasten ===');
  const drei = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const tp = window.__tp;
    const ia = app.interactions;
    const c = ia.controllers[0];
    const g = tp.taste('g');
    const h = tp.taste('h');
    // Mitte der Lücke zwischen g und h, etwas näher an h
    const luecke = tp.welt(g.mesh).lerp(tp.welt(h.mesh), 0.55);
    const start = tp.ziele(0, luecke);
    // Eine Karte 0,5 m hinter der Tastatur, genau auf dem Lückenstrahl
    const [karte] = app.cardManager.spawnIdeas(['Dahinter'], app.camera);
    const dir = luecke.clone().sub(start).normalize();
    karte.group.position.copy(karte.group.parent.worldToLocal(luecke.clone().addScaledVector(dir, 0.5)));
    karte.group.lookAt(tp.kopf());
    app.scene.updateMatrixWorld(true);
    const mit = ia._xrRaycast(c);
    // Gegenprobe ohne Strahlfang: so war es vorher.
    const fang = app.keyboard.panel.userData.strahlFang;
    delete app.keyboard.panel.userData.strahlFang;
    const ohne = ia._xrRaycast(c);
    app.keyboard.panel.userData.strahlFang = fang;
    // Ecke des Panels, weit weg von jeder Taste
    const ecke = tp.lokal(-app.keyboard.boardW / 2 + 0.008, 0.2);
    tp.ziele(0, ecke);
    const eckTreffer = ia._xrRaycast(c);
    // Pinch einer Hand dort: kein Griff ins Leere, keine Karte gegriffen
    c.userData.inputSource = { hand: {} };
    ia._onSelectStart(c);
    const nachPinch = { leer: Boolean(c.userData.emptySelect), gegriffen: Boolean(c.userData.grabbed) };
    ia._onSelectEnd(c);
    c.userData.inputSource = null;
    window.__karteId = karte.id;
    return {
      mitTyp: mit?.type,
      mitTaste: mit?.object === h.mesh ? 'h' : mit?.object === g.mesh ? 'g' : '?',
      ohneTyp: ohne?.type,
      eckTyp: eckTreffer?.type,
      eckAufPanel: eckTreffer?.object === app.keyboard.panel,
      ...nachPinch,
    };
  });
  pruefe(drei.mitTyp === 'ui' && drei.mitTaste === 'h', `der Strahl in der Lücke gehört der nächsten Taste („${drei.mitTaste}")`);
  pruefe(drei.ohneTyp === 'card', `Gegenprobe ohne Strahlfang: er träfe die Karte dahinter (${drei.ohneTyp})`);
  pruefe(drei.eckTyp === 'block' && drei.eckAufPanel, `in der Panel-Ecke endet er auf der Tastatur, ohne Taste (${drei.eckTyp})`);
  pruefe(!drei.leer && !drei.gegriffen, 'ein Pinch dort zieht nicht an der Welt und greift nichts');

  // --- 2. Rückmeldung --------------------------------------------------------
  console.log('\n=== 2. Rückmeldung ===');
  const zwei = await page.evaluate(async () => {
    const app = window.__app;
    const tp = window.__tp;
    const ia = app.interactions;
    const [c0, c1] = ia.controllers;
    const g = tp.taste('g');
    const h = tp.taste('h');
    const ticks = [];
    const original = ia.haptics.pulseOnly;
    ia.haptics.pulseOnly = (muster, controller) => ticks.push([muster, ia.controllers.indexOf(controller)]);
    for (const c of [c0, c1]) ia._setHover(c, null);
    ticks.length = 0;

    tp.ziele(0, tp.welt(g.mesh));
    ia._setHover(c0, ia._xrRaycast(c0));
    const angezielt = {
      hovered: g.hovered,
      scale: g.mesh.scale.x,
      z: g.mesh.position.z,
      rand: g.panel ? true : false,
    };
    // Zweiter Strahl auf dieselbe Taste, dann geht der erste weiter
    tp.ziele(1, tp.welt(g.mesh), [-0.12, -0.38, -0.12]);
    ia._setHover(c1, ia._xrRaycast(c1));
    tp.ziele(0, tp.welt(h.mesh));
    ia._setHover(c0, ia._xrRaycast(c0));
    const beideWeg = { gNoch: g.hovered, hJetzt: h.hovered };
    ia._setHover(c1, null);
    const gZuletzt = g.hovered;
    ia._setHover(c0, null);
    const tickListe = ticks.map(([m, i]) => `${m}@${i}`);

    // Drücken: Text, Aufblitzen, wieder zurück
    tp.ziele(0, tp.welt(g.mesh));
    ia._setHover(c0, ia._xrRaycast(c0));
    const vorher = app.keyboard.text;
    ia._onSelectStart(c0);
    ia._onSelectEnd(c0);
    const getippt = app.keyboard.text.slice(vorher.length);
    const blitzSofort = g.blitz;
    await new Promise((r) => setTimeout(r, 250));
    const blitzSpaeter = g.blitz;
    // Druck in der Lücke tippt die nächste Taste. Vorher die Hervorhebung von
    // „g" lösen: Eine angezielte Taste behält den Strahl bis 3 mm jenseits der
    // Lückenmitte (siehe Gegenprüfung unten) – hier geht es um die freie Lücke.
    ia._setHover(c0, null);
    const luecke = tp.welt(g.mesh).lerp(tp.welt(h.mesh), 0.55);
    tp.ziele(0, luecke);
    ia._onSelectStart(c0);
    ia._onSelectEnd(c0);
    const lueckeGetippt = app.keyboard.text.slice(vorher.length + getippt.length);
    ia._setHover(c0, null);
    ia.haptics.pulseOnly = original;
    return { angezielt, beideWeg, gZuletzt, tickListe, getippt, blitzSofort, blitzSpaeter, lueckeGetippt };
  });
  pruefe(zwei.angezielt.hovered, 'die angezielte Taste ist hervorgehoben');
  pruefe(
    Math.abs(zwei.angezielt.scale - (1 + 0.004 / 0.052)) < 1e-9 && zwei.angezielt.z > 0.005,
    `sie tritt hervor (×${zwei.angezielt.scale.toFixed(4)} = 2 mm je Seite, z ${(zwei.angezielt.z * 1000).toFixed(0)} mm)`
  );
  pruefe(zwei.beideWeg.gNoch && zwei.beideWeg.hJetzt, 'zwei Strahlen: geht der eine weiter, bleibt die Taste des anderen hervorgehoben');
  pruefe(!zwei.gZuletzt, 'erst wenn beide weg sind, erlischt sie');
  pruefe(
    zwei.tickListe.join(' ') === 'hover@0 hover@1 hover@0',
    `je neuer Taste ein Tick, nur in der zielenden Hand (${zwei.tickListe.join(' ')})`
  );
  pruefe(zwei.getippt === 'G', `Drücken tippt „G" (Großschreibung am Satzanfang): „${zwei.getippt}"`);
  pruefe(zwei.blitzSofort && !zwei.blitzSpaeter, 'die Taste blitzt auf und kehrt zurück');
  pruefe(zwei.lueckeGetippt === 'h', `Drücken in der Lücke tippt die nächste Taste („${zwei.lueckeGetippt}")`);

  // --- Befunde der Gegenprüfung ----------------------------------------------
  console.log('\n=== Gegenprüfung: Tracking, Zeichenordnung, Lücken, Leertaste ===');
  const nach = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const tp = window.__tp;
    const ia = app.interactions;
    const [c0, c1] = ia.controllers;
    const g = tp.taste('g');
    const h = tp.taste('h');
    const ergebnis = {};
    for (const c of [c0, c1]) ia._setHover(c, null);

    // a) Hand verliert das Tracking, während sie auf „g" zielt: Die andere
    //    Hand überstreicht „g" und geht weiter – „g" muss erlöschen.
    tp.ziele(0, tp.welt(g.mesh));
    ia._setHover(c0, ia._xrRaycast(c0));
    c0.visible = false;
    // Was update() je Controller tut, ohne XR-Sitzung nachgestellt:
    const hit0 = c0.visible ? ia._xrRaycast(c0) : null;
    ia._setHover(c0, hit0);
    tp.ziele(1, tp.welt(g.mesh), [-0.12, -0.38, -0.12]);
    ia._setHover(c1, ia._xrRaycast(c1));
    tp.ziele(1, tp.welt(h.mesh), [-0.12, -0.38, -0.12]);
    ia._setHover(c1, ia._xrRaycast(c1));
    ergebnis.gErloschen = !g.hovered;
    ia._setHover(c1, null);
    c0.visible = true;

    // b) Zeichenordnung je Treffer: Taste → 50/51, Karte → 0/19.
    const ordnung = (c, hit) => {
      const aufUi = ia._setzeZeiger(c, hit);
      ia._setzeStrahl(c, hit, aufUi);
      return { aufUi, zeiger: c.userData.zeiger.children[0].renderOrder, strahl: c.getObjectByName('ray').renderOrder };
    };
    tp.ziele(0, tp.welt(g.mesh));
    ergebnis.taste = ordnung(c0, ia._xrRaycast(c0));
    const [karte] = app.cardManager.spawnIdeas(['Seitlich'], app.camera);
    karte.group.position.copy(karte.group.parent.worldToLocal(tp.kopf().add(new T.Vector3(1.2, 0, -1.4))));
    karte.group.lookAt(tp.kopf());
    app.scene.updateMatrixWorld(true);
    tp.ziele(0, karte.group.getWorldPosition(new T.Vector3()));
    const kartenTreffer = ia._xrRaycast(c0);
    ergebnis.karteTyp = kartenTreffer?.type;
    ergebnis.karte = ordnung(c0, kartenTreffer);
    app.cardManager.removeCard(karte);

    // c) Hysterese: 1 mm jenseits der Mitte der Lücke g|h.
    const mitte = (g.x + g.width / 2 + h.x - h.width / 2) / 2;
    const punkt = app.keyboard.group.localToWorld(new T.Vector3(mitte + 0.001, g.y, 0));
    g.hovered = false;
    ergebnis.ohneVorsprung = app.keyboard._tasteNahe(punkt) === h.mesh ? 'h' : 'g';
    g.hovered = true;
    ergebnis.mitVorsprung = app.keyboard._tasteNahe(punkt) === g.mesh ? 'g' : 'h';
    g.hovered = false;

    // d) Die angezielte Leertaste bleibt in ihrer Spur.
    const leer = app.keyboard.spaceKey;
    const links = app.keyboard.cancelKey;
    const rechts = app.keyboard.backKey;
    leer.mesh.userData.setHover(true);
    const halb = (leer.width * leer.mesh.scale.x) / 2;
    ergebnis.luftLinks = leer.x - halb - (links.x + links.width / 2);
    ergebnis.luftRechts = rechts.x - rechts.width / 2 - (leer.x + halb);
    leer.mesh.userData.setHover(false);
    return ergebnis;
  });
  pruefe(nach.gErloschen, 'verliert eine Hand das Tracking, gibt sie ihre Taste frei – die andere löscht sie beim Weiterziehen');
  pruefe(
    nach.taste.aufUi && nach.taste.strahl === 50 && nach.taste.zeiger === 51,
    `auf einer Taste zeichnen Strahl und Zielpunkt nach der UI (${nach.taste.strahl}/${nach.taste.zeiger})`
  );
  pruefe(
    nach.karteTyp === 'card' && !nach.karte.aufUi && nach.karte.strahl === 0 && nach.karte.zeiger === 19,
    `auf einer Karte bleiben sie unter Menü und Tastatur (${nach.karteTyp}, ${nach.karte.strahl}/${nach.karte.zeiger})`
  );
  pruefe(nach.ohneVorsprung === 'h', `1 mm jenseits der Lückenmitte gehört der Strahl ohne Vorsprung „h" (${nach.ohneVorsprung})`);
  pruefe(nach.mitVorsprung === 'g', `ist „g" schon angezielt, behält es ihn dort (${nach.mitVorsprung}) – kein Flattern`);
  pruefe(
    nach.luftLinks > 0.005 && nach.luftRechts > 0.005,
    `die angezielte Leertaste behält Luft zu den Nachbarn (${(nach.luftLinks * 1000).toFixed(1)} / ${(nach.luftRechts * 1000).toFixed(1)} mm)`
  );

  // --- 4. Stillstand ----------------------------------------------------------
  console.log('\n=== 4. Stillstand beim Tippen ===');
  const vier = await page.evaluate(() => {
    const app = window.__app;
    const { locomotion, player, renderer, interactions: ia } = app;
    const [c0, c1] = ia.controllers;
    const lage = () => ({ p: player.position.clone(), q: player.quaternion.clone() });
    const bewegt = (a, b) => a.p.distanceTo(b.p) > 1e-6 || a.q.angleTo(b.q) > 1e-6;
    c0.userData.handedness = 'left';
    c1.userData.handedness = 'right';
    c0.userData.inputSource = { gamepad: { axes: [0, 0, 0, -1] } }; // vorwärts
    c1.userData.inputSource = { gamepad: { axes: [0, 0, 1, 0] } }; // rechts drehen
    const start = lage();
    const war = renderer.xr.isPresenting;
    renderer.xr.isPresenting = true;
    let offen;
    let zu;
    let gegenprobe;
    try {
      locomotion.update(0.05);
      offen = bewegt(start, lage());
      // Gegenprobe: dieselbe Eingabe ohne Pause bewegt
      const pause = locomotion.pausiert;
      locomotion.pausiert = () => false;
      locomotion.update(0.05);
      gegenprobe = bewegt(start, lage());
      locomotion.pausiert = pause;
      player.position.copy(start.p);
      player.quaternion.copy(start.q);
      // Tastatur zu: Gehen geht wieder. Die Drehung ist gespannt, bis der
      // Stick einmal in der Mitte war.
      app.keyboard.close();
      locomotion.update(0.05);
      const nachZu = lage();
      zu = { gegangen: nachZu.p.distanceTo(start.p) > 1e-6, gedreht: nachZu.q.angleTo(start.q) > 1e-6 };
    } finally {
      renderer.xr.isPresenting = war;
      player.position.copy(start.p);
      player.quaternion.copy(start.q);
      c0.userData.inputSource = null;
      c1.userData.inputSource = null;
      locomotion.reset();
    }
    return { offen, gegenprobe, zu };
  });
  pruefe(!vier.offen, 'Stick vorwärts und Drehen bei offener Tastatur: man steht still');
  pruefe(vier.gegenprobe, 'Gegenprobe ohne Pause: dieselbe Eingabe bewegt');
  pruefe(vier.zu.gegangen && !vier.zu.gedreht, 'nach dem Schließen geht man wieder; gedreht wird erst nach einmal Loslassen');

  // --- Bild --------------------------------------------------------------------
  console.log('\n=== Bild ===');
  await fs.mkdir(bildOrdner, { recursive: true });
  for (const [name, neu] of [
    ['vorher', false],
    ['nachher', true],
  ]) {
    await page.evaluate((neu) => {
      const app = window.__app;
      const tp = window.__tp;
      const ia = app.interactions;
      const c = ia.controllers[0];
      // Karte von vorhin weg, Tastatur wieder auf
      const k = app.cardManager.cards.find((x) => x.id === window.__karteId);
      if (k) app.cardManager.removeCard?.(k);
      app.keyboard.open(app.camera, { onSubmit() {}, onCancel() {} });
      app.scene.updateMatrixWorld(true);
      // Am Desktop versteckt die Bildschleife den Zielpunkt – fürs Bild nicht.
      ia._versteckeZeiger = () => {};
      // Der Prüfstand blendet beim Öffnen alles außer der Umgebung aus, auch das
      // Rig mit den Controllern; ohne es fehlte der Strahl im Bild.
      app.player.visible = true;
      // Nur ein Strahl im Bild; der zweite Controller stand aus Abschnitt 2
      // noch auf „g".
      ia.controllers[1].visible = false;
      const g = tp.taste('g');
      for (const x of ia.controllers) ia._setHover(x, null);
      tp.ziele(0, tp.welt(g.mesh));
      const hit = ia._xrRaycast(c);
      const ray = c.getObjectByName('ray');
      ray.scale.z = hit.distance;
      if (neu) {
        ia._setHover(c, hit);
        ia._setzeStrahl(c, hit, ia._setzeZeiger(c, hit));
      } else {
        // So sah es vorher aus: Strahl unter der Tastatur, kein Zielpunkt,
        // Hervorhebung nur als dunkler Farbwechsel.
        ray.renderOrder = 0;
        c.userData.zeiger.visible = false;
        g.panel.setColors({ background: '#3b3644', border: null });
      }
    }, neu);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const datei = path.join(bildOrdner, `tastatur-${name}.png`);
    // Ausschnitt um die angezielte Taste und den Strahl darunter
    const ausschnitt = await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const g = window.__tp.taste('g');
      const p = g.mesh.getWorldPosition(new T.Vector3()).project(app.camera);
      const r = app.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    });
    const clip = {
      x: Math.max(0, Math.round(ausschnitt.x - 160)),
      y: Math.max(0, Math.round(ausschnitt.y - 110)),
      width: 320,
      height: 320,
    };
    clip.height = Math.min(clip.height, 720 - clip.y);
    await page.screenshot({ path: datei, timeout: 120000, clip });
    console.log(`  ${datei}`);
  }

  pruefe(messages.length === 0, `keine Fehler in der Konsole (${messages.length})`);
  if (messages.length) console.log('  ' + messages.join('\n  '));
} finally {
  await browser.close();
  await server.stop();
}

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nOK: alle Prüfungen bestanden');
process.exit(fehler ? 1 : 0);

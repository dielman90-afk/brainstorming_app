// **Sind Zonen echte Behälter?**
//
// Zonen waren halbtransparente Rahmen ohne Funktion. Seit dem Umbau enthalten
// sie Karten: hineinziehen → einrasten → mitwandern. Dieses Werkzeug prüft das
// über `window.__app`, ohne Maus und ohne KI-Server:
//
//   1. Drei Karten in eine Zone legen → Mitglieder, Raster, koplanar, ohne Überlappung
//   2. Zone verschieben, drehen, greifen, skalieren → die Karten folgen exakt
//   3. Eine Karte herausziehen → sie verlässt die Zone, der Titel zählt mit
//   4. Zwanzig Karten → die Zone wächst nach unten, die Oberkante bleibt
//   5. Rückgängig/Wiederholen → Mitgliedschaft und Lagen kommen zurück, nichts springt
//   6. Speichern und Laden; ein altes Board ohne `karten` leitet die Mitglieder ab
//   7. Cluster (KI gestubbt) → je Thema eine Zone, flache Wand, keine 📌-Karten
//   8. Dasselbe wie 1 und 2 im Nachthimmel, mit gedrehter Welt
//
//   HARNESS_PORT=5301 node tools/zonenprobe.mjs [--ohne-nacht]

import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const ohneNacht = process.argv.includes('--ohne-nacht');
const server = await startServer();
const browser = await launchBrowser();
let fehler = 0;
const pruefe = (ok, text) => {
  console.log(`  ${ok ? 'OK    ' : 'FEHLER'} ${text}`);
  if (!ok) fehler++;
};
const zahl = (v, n = 6) => (Number.isFinite(v) ? v.toExponential(1) : String(v)).padStart(n);

try {
  const { page, messages } = await openApp(browser);
  // Die KI-Anfrage beantwortet das Werkzeug selbst: Ein Server mit Schlüssel
  // ist dafür nicht nötig, und die Antwort ist Teil des Prüffalls.
  let clusterAntwort = { clusters: [] };
  await page.route('**/api/generate', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clusterAntwort) })
  );
  await ladeThree(page);

  // Ein paar Bilder der App laufen lassen — dort ruft die Schleife
  // `zoneManager.update()`. Geprüft wird also auch der Einbau in main.js.
  const bilder = (n = 4) =>
    page.evaluate(
      (n) =>
        new Promise((r) => {
          let i = 0;
          const f = () => (++i >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n
    );

  await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const V = () => new T.Vector3();
    window.__zp = {
      leer() {
        app.cardManager.clear();
        app.connectionManager.loadJSON([]);
        app.zoneManager.clear();
        app.history.reset('Probe');
      },
      // Einen Weltpunkt als Kartenlage setzen — in die Heimat umgerechnet.
      setzeWelt(karte, welt) {
        const h = app.cardManager.heimat;
        h.updateMatrixWorld(true);
        karte.group.position.copy(h === app.scene ? welt : h.worldToLocal(welt.clone()));
        karte.group.updateMatrixWorld(true);
      },
      // Eine Karte vor die Zone halten (schräg, zum Nutzer gedreht) und
      // loslassen — wie ein Zug, der über der Zone endet.
      ablegen(zone, karte, x, y, z = 0.12) {
        zone.group.updateWorldMatrix(true, false);
        const w = zone.group.localToWorld(new T.Vector3(x, y, z));
        this.setzeWelt(karte, w);
        karte.group.lookAt(app.camera.getWorldPosition(V()));
        app.interactions.onCardMoved(karte);
      },
      karte(id) {
        return app.cardManager.cards.find((c) => c.id === id);
      },
      // Raster-Befund: Abstand zur Zonenebene, Drehung gegen die Zone,
      // Überlappungen, Anteil innerhalb von `umfasst`.
      befund(zone) {
        app.scene.updateMatrixWorld(true);
        const zq = zone.group.getWorldQuaternion(new T.Quaternion());
        const n = new T.Vector3(0, 0, 1).applyQuaternion(zq);
        const o = zone.group.getWorldPosition(V());
        const karten = zone.karten.map((id) => this.karte(id));
        const abst = karten.map((k) => n.dot(k.group.getWorldPosition(V()).sub(o)));
        const qAbw = karten.map((k) => {
          const q = k.group.getWorldQuaternion(new T.Quaternion());
          const s = Math.sign(q.dot(zq)) || 1;
          return Math.max(...['x', 'y', 'z', 'w'].map((c) => Math.abs(q[c] - s * zq[c])));
        });
        const r = karten.map((k) => {
          const l = zone.group.worldToLocal(k.group.getWorldPosition(V()));
          const w = (k.width * k.scale) / zone.scale / 2;
          const h = (k.height * k.scale) / zone.scale / 2;
          return [l.x - w, l.x + w, l.y - h, l.y + h];
        });
        let ueberlapp = 0;
        for (let i = 0; i < r.length; i++)
          for (let j = i + 1; j < r.length; j++) {
            const [a, b] = [r[i], r[j]];
            if (a[0] < b[1] - 1e-9 && b[0] < a[1] - 1e-9 && a[2] < b[3] - 1e-9 && b[2] < a[3] - 1e-9) ueberlapp++;
          }
        const drin = karten.filter((k) => zone.umfasst(k.group.getWorldPosition(V()))).length;
        return {
          n: karten.length,
          abstMin: Math.min(...abst),
          abstMax: Math.max(...abst),
          qAbw: Math.max(0, ...qAbw),
          ueberlapp,
          drin,
          kopf: zone.kopfzeile,
        };
      },
      // Die Lagen der Mitglieder im Koordinatensystem der Zone.
      relativ(zone) {
        app.scene.updateMatrixWorld(true);
        const zi = zone.group.matrixWorld.clone().invert();
        return zone.karten.map((id) => new T.Matrix4().multiplyMatrices(zi, this.karte(id).group.matrixWorld).elements);
      },
      // Lagen aller Karten in der Heimat, nach ID.
      lagen() {
        const o = {};
        for (const k of app.cardManager.cards) o[k.id] = [...k.group.position.toArray(), ...k.group.quaternion.toArray()];
        return o;
      },
      oberkante(zone) {
        app.scene.updateMatrixWorld(true);
        return zone.group.localToWorld(new T.Vector3(0, zone.panel.position.y + zone.hoeheLokal / 2, 0)).toArray();
      },
    };
  });
  const abweichung = (a, b) => {
    if (Array.isArray(a)) return Math.max(0, ...a.map((x, i) => abweichung(x, b[i])));
    if (a && typeof a === 'object') return Math.max(0, ...Object.keys(a).map((k) => (k in b ? abweichung(a[k], b[k]) : Infinity)));
    return Math.abs(a - b);
  };
  const rasterPruefen = (b, n, titel) => {
    pruefe(b.n === n, `${n} Mitglieder (${b.n})`);
    pruefe(b.abstMin > 0.005 && b.abstMax - b.abstMin < 1e-9, `koplanar knapp vor der Fläche (Abstand ${b.abstMin.toFixed(4)} m, Streuung ${zahl(b.abstMax - b.abstMin)})`);
    pruefe(b.qAbw < 1e-5, `Drehung gleich der Zone (Abweichung ${zahl(b.qAbw)})`);
    pruefe(b.ueberlapp === 0, `keine Überlappung (${b.ueberlapp})`);
    pruefe(b.drin === n, `alle innerhalb von umfasst() (${b.drin}/${n})`);
    if (titel) pruefe(b.kopf === titel, `Kopfzeile „${b.kopf}“`);
  };

  // --- 1 -------------------------------------------------------------------
  console.log('\n=== 1. Drei Karten in eine Zone legen ===');
  const eins = await page.evaluate(async () => {
    const app = window.__app;
    const zp = window.__zp;
    zp.leer();
    await app.handleAction('zone');
    const zone = app.zoneManager.zones.at(-1);
    const ids = [];
    [[-0.45, 0.25], [0.1, -0.2], [0.5, 0.05]].forEach(([x, y], i) => {
      const k = app.cardManager.addCard(`Idee ${i + 1}`);
      ids.push(k.id);
      zp.ablegen(zone, k, x, y);
    });
    return {
      zoneId: zone.id,
      mitglieder: zone.karten,
      ids,
      befund: zp.befund(zone),
      label: app.history.entries[app.history.index].label,
    };
  });
  pruefe(
    eins.ids.every((id) => eins.mitglieder.includes(id)),
    'alle drei sind Mitglieder'
  );
  rasterPruefen(eins.befund, 3, 'Neue Zone · 3');
  pruefe(eins.label === 'Karte in Zone „Neue Zone“ gelegt', `Verlaufseintrag „${eins.label}“`);

  // --- 2 -------------------------------------------------------------------
  console.log('\n=== 2. Zone verschieben, drehen, greifen, skalieren ===');
  const vorher2 = await page.evaluate(() => window.__zp.relativ(window.__app.zoneManager.zones[0]));
  await page.evaluate(() => {
    const zone = window.__app.zoneManager.zones[0];
    zone.group.position.x += 0.6;
    zone.group.position.y += 0.15;
    zone.group.rotateY(0.35);
  });
  await bilder();
  const nachZug = await page.evaluate(() => window.__zp.relativ(window.__app.zoneManager.zones[0]));
  pruefe(abweichung(vorher2, nachZug) < 1e-9, `verschoben und gedreht, nach ein paar Bildern: Karten folgen (Abweichung ${zahl(abweichung(vorher2, nachZug))})`);

  // In VR hängt die Zone beim Greifen an der Hand, nicht an der Heimat.
  const greifen = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    const hand = new T.Object3D();
    app.scene.add(hand);
    hand.position.copy(zone.group.getWorldPosition(new T.Vector3()));
    hand.updateMatrixWorld(true);
    hand.attach(zone.group);
    hand.position.y += 0.3;
    hand.rotateX(-0.2);
    hand.rotateY(0.5);
    app.zoneManager.update();
    const inDerHand = window.__zp.relativ(zone);
    app.zoneManager.heimat.attach(zone.group);
    hand.removeFromParent();
    app.zoneManager.update();
    return { inDerHand, losgelassen: window.__zp.relativ(zone), befund: window.__zp.befund(zone) };
  });
  pruefe(abweichung(vorher2, greifen.inDerHand) < 1e-9, `in der Hand: Karten folgen (Abweichung ${zahl(abweichung(vorher2, greifen.inDerHand))})`);
  pruefe(abweichung(vorher2, greifen.losgelassen) < 1e-9, 'losgelassen: Karten bleiben auf der Zone');

  // Ein Mitglied in der Hand bleibt in der Hand, auch wenn die Zone wandert;
  // losgelassen ohne gemeldeten Zug rastet es im nächsten Durchlauf wieder ein.
  const halten = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    const k = window.__zp.karte(zone.karten[0]);
    const hand = new T.Object3D();
    app.scene.add(hand);
    hand.attach(k.group);
    const vorher = k.group.getWorldPosition(new T.Vector3());
    zone.group.position.x -= 0.3;
    app.zoneManager.update();
    const inDerHand = k.group.getWorldPosition(new T.Vector3()).distanceTo(vorher);
    app.zoneManager.heimat.attach(k.group);
    hand.removeFromParent();
    app.zoneManager.update();
    return { inDerHand, relativ: window.__zp.relativ(zone) };
  });
  pruefe(halten.inDerHand < 1e-9, 'ein gehaltenes Mitglied bleibt in der Hand, während die Zone wandert');
  pruefe(abweichung(vorher2, halten.relativ) < 1e-9, 'losgelassen rastet es wieder in seinen Platz');

  const skaliert = await page.evaluate(() => {
    const zone = window.__app.zoneManager.zones[0];
    zone.setScale(1.6);
    window.__app.zoneManager.update();
    const b = window.__zp.befund(zone);
    zone.setScale(1);
    window.__app.zoneManager.update();
    return b;
  });
  rasterPruefen(skaliert, 3);

  // --- 3 -------------------------------------------------------------------
  console.log('\n=== 3. Eine Karte herausziehen ===');
  const drei = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    const k = window.__zp.karte(zone.karten[1]);
    const auge = app.camera.getWorldPosition(new T.Vector3());
    window.__zp.setzeWelt(k, auge.clone().add(new T.Vector3(3, -0.3, -1)));
    app.interactions.onCardMoved(k);
    return {
      drin: zone.karten.includes(k.id),
      befund: window.__zp.befund(zone),
      label: app.history.entries[app.history.index].label,
    };
  });
  pruefe(!drei.drin, 'die Karte hat die Zone verlassen');
  rasterPruefen(drei.befund, 2, 'Neue Zone · 2');
  pruefe(drei.label === 'Karte aus Zone genommen', `Verlaufseintrag „${drei.label}“`);

  // --- 4 -------------------------------------------------------------------
  console.log('\n=== 4. Zwanzig Karten: die Zone wächst nach unten ===');
  const vier = await page.evaluate(() => {
    const app = window.__app;
    const zp = window.__zp;
    zp.leer();
    const zone = app.zoneManager.addZone({ title: 'Viele' });
    zone.placeInFront(app.camera);
    app.history.reset('Probe');
    const oben = zp.oberkante(zone);
    const hoehe0 = zone.hoeheLokal;
    let vorLetzter = null;
    for (let i = 0; i < 20; i++) {
      if (i === 19) vorLetzter = { lagen: zp.lagen(), karten: [...zone.karten] };
      // Abgelegt wird unten mittig — dort landet die Karte am Ende der Reihe.
      zp.ablegen(zone, app.cardManager.addCard(`Karte ${i + 1}`), 0, -0.45 - zone.hoeheLokal + 1.05);
    }
    const geom = zone.panel.geometry.parameters;
    return {
      hoehe0,
      hoehe: zone.hoeheLokal,
      oben,
      obenNach: zp.oberkante(zone),
      befund: zp.befund(zone),
      geomH: geom.height,
      geomB: geom.width,
      seitenverhaeltnis: zone._canvas.height / zone._canvas.width,
      vorLetzter,
      nachLetzter: { lagen: zp.lagen(), karten: [...zone.karten] },
      eintraege: app.history.entries.length,
    };
  });
  console.log(`  Höhe ${vier.hoehe0.toFixed(3)} → ${vier.hoehe.toFixed(3)} m`);
  pruefe(vier.hoehe > vier.hoehe0 + 0.05, 'die Zone ist gewachsen');
  pruefe(abweichung(vier.oben, vier.obenNach) < 1e-9, 'die Oberkante bleibt, wo sie war');
  rasterPruefen(vier.befund, 20, 'Viele · 20');
  pruefe(Math.abs(vier.geomH - vier.hoehe) < 1e-9, 'die Fläche ist neu gebaut, nicht gestreckt');
  pruefe(
    Math.abs(vier.seitenverhaeltnis - vier.geomH / vier.geomB) < 0.005,
    `Leinwand im Seitenverhältnis der Fläche (${vier.seitenverhaeltnis.toFixed(3)} gegen ${(vier.geomH / vier.geomB).toFixed(3)}) — die Strichelung bleibt unverzerrt`
  );

  // --- 5 -------------------------------------------------------------------
  console.log('\n=== 5. Rückgängig und Wiederholen ===');
  const fuenfA = await page.evaluate(() => {
    const app = window.__app;
    const label = app.history.undo();
    const zone = app.zoneManager.zones[0];
    return { label, karten: [...zone.karten], lagen: window.__zp.lagen(), hoehe: zone.hoeheLokal };
  });
  await bilder();
  const fuenfA2 = await page.evaluate(() => window.__zp.lagen());
  // Nach dem Rückgängigmachen ist die zwanzigste Karte gelöscht, alle übrigen
  // müssen dort stehen, wo sie vor dem letzten Ablegen standen.
  const erwartetA = vier.vorLetzter.lagen;
  pruefe(JSON.stringify(fuenfA.karten) === JSON.stringify(vier.vorLetzter.karten), `Rückgängig („${fuenfA.label}“): Mitgliedschaft wie vorher (${fuenfA.karten.length})`);
  pruefe(abweichung(erwartetA, fuenfA.lagen) < 1e-9, `Rückgängig: Lagen wie vorher (Abweichung ${zahl(abweichung(erwartetA, fuenfA.lagen))})`);
  pruefe(abweichung(fuenfA.lagen, fuenfA2) < 1e-9, 'Rückgängig: nach ein paar Bildern springt nichts');
  const fuenfB = await page.evaluate(() => {
    const app = window.__app;
    app.history.redo();
    const zone = app.zoneManager.zones[0];
    return { karten: [...zone.karten], lagen: window.__zp.lagen(), hoehe: zone.hoeheLokal };
  });
  await bilder();
  const fuenfB2 = await page.evaluate(() => window.__zp.lagen());
  pruefe(JSON.stringify(fuenfB.karten) === JSON.stringify(vier.nachLetzter.karten), 'Wiederholen: Mitgliedschaft wie nachher');
  pruefe(abweichung(vier.nachLetzter.lagen, fuenfB.lagen) < 1e-9, 'Wiederholen: Lagen wie nachher');
  pruefe(abweichung(fuenfB.lagen, fuenfB2) < 1e-9, 'Wiederholen: nach ein paar Bildern springt nichts');
  pruefe(Math.abs(fuenfB.hoehe - vier.hoehe) < 1e-9 && fuenfA.hoehe <= fuenfB.hoehe, 'die Höhe folgt dem Stand');

  // Löschen schrumpft die Zone; Rückgängig holt Karten und Höhe zurück, und
  // Wiederholen löscht wieder, ohne dass die übrigen Karten wegspringen.
  const fuenfC = await page.evaluate(() => {
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    const vorher = window.__zp.lagen();
    for (const id of zone.karten.slice(3)) app.cardManager.removeCard(window.__zp.karte(id));
    app.history.commit('Karten gelöscht');
    const nach = { lagen: window.__zp.lagen(), hoehe: zone.hoeheLokal, befund: window.__zp.befund(zone) };
    app.history.undo();
    const zurueck = { lagen: window.__zp.lagen(), hoehe: app.zoneManager.zones[0].hoeheLokal, n: app.zoneManager.zones[0].karten.length };
    app.history.redo();
    return { vorher, nach, zurueck, wieder: window.__zp.lagen(), hoeheWieder: app.zoneManager.zones[0].hoeheLokal };
  });
  await bilder();
  const fuenfC2 = await page.evaluate(() => window.__zp.lagen());
  pruefe(Math.abs(fuenfC.nach.hoehe - 1.05) < 1e-9, `nach dem Löschen schrumpft die Zone auf die Grundhöhe (${fuenfC.nach.hoehe.toFixed(3)})`);
  rasterPruefen(fuenfC.nach.befund, 3, 'Viele · 3');
  pruefe(fuenfC.zurueck.n === 20 && abweichung(fuenfC.vorher, fuenfC.zurueck.lagen) < 1e-9, 'Rückgängig: zwanzig Karten an ihren alten Plätzen');
  pruefe(abweichung(fuenfC.nach.lagen, fuenfC.wieder) < 1e-9, 'Wiederholen: die drei übrigen Karten stehen, wo sie nach dem Löschen standen');
  pruefe(abweichung(fuenfC.wieder, fuenfC2) < 1e-9 && Math.abs(fuenfC.hoeheWieder - 1.05) < 1e-9, 'Wiederholen: nichts springt, Grundhöhe');

  // --- 6 -------------------------------------------------------------------
  console.log('\n=== 6. Speichern und Laden ===');
  const sechs = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const zp = window.__zp;
    zp.leer();
    const a = app.zoneManager.addZone({ title: 'Links' });
    a.placeInFront(app.camera);
    a.group.position.x -= 0.85;
    const b = app.zoneManager.addZone({ title: 'Rechts', colorIndex: 1 });
    b.placeInFront(app.camera);
    b.group.position.x += 0.85;
    app.scene.updateMatrixWorld(true);
    for (let i = 0; i < 5; i++) zp.ablegen(i < 3 ? a : b, app.cardManager.addCard(`K${i}`), 0, 0);
    const frei = app.cardManager.addCard('frei');
    zp.setzeWelt(frei, app.camera.getWorldPosition(new T.Vector3()).add(new T.Vector3(-3, 0, -1)));
    const mitglieder = () => Object.fromEntries(app.zoneManager.zones.map((z) => [z.id, [...z.karten]]));
    const stand = app.boardToJSON();
    const vorher = { m: mitglieder(), lagen: zp.lagen() };
    app.applyBoardJSON(JSON.parse(JSON.stringify(stand)));
    const rund = { m: mitglieder(), lagen: zp.lagen() };
    // Ein Board von früher: ohne `karten`. Die Karten liegen vor ihren Zonen,
    // aber ein wenig neben dem Raster — wie von Hand hingestellt.
    const alt = JSON.parse(JSON.stringify(stand));
    for (const z of alt.zones) delete z.karten;
    for (const k of alt.cards) if (k.text !== 'frei') k.position[1] += 0.03;
    app.applyBoardJSON(alt);
    const abgeleitet = { m: mitglieder(), befundA: zp.befund(app.zoneManager.zones[0]), befundB: zp.befund(app.zoneManager.zones[1]) };
    return { vorher, rund, abgeleitet, hatFeld: stand.zones.every((z) => Array.isArray(z.karten)) };
  });
  const gleicheMengen = (x, y) =>
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => y[k] && x[k].length === y[k].length && x[k].every((id) => y[k].includes(id)));
  pruefe(sechs.hatFeld, 'der Stand schreibt `karten` je Zone');
  pruefe(JSON.stringify(sechs.vorher.m) === JSON.stringify(sechs.rund.m), 'Rundreise: Mitgliedschaft erhalten (samt Reihenfolge)');
  pruefe(abweichung(sechs.vorher.lagen, sechs.rund.lagen) < 1e-9, 'Rundreise: Lagen erhalten');
  pruefe(gleicheMengen(sechs.vorher.m, sechs.abgeleitet.m), 'altes Board: Mitglieder über umfasst() abgeleitet, die freie Karte bleibt frei');
  rasterPruefen(sechs.abgeleitet.befundA, 3, 'Links · 3');
  rasterPruefen(sechs.abgeleitet.befundB, 2, 'Rechts · 2');

  // --- 7 -------------------------------------------------------------------
  console.log('\n=== 7. Cluster legt Zonen an ===');
  await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    window.__zp.leer();
    for (const t of ['Akku', 'Display', 'Sensor', 'Team', 'Kunden', 'Budget']) app.cardManager.addCard(t);
    app.cardManager.repositionAllInArc(app.camera);
    // Eine leere Zone von Hand, abseits: Sie muss den Lauf überstehen.
    const hand = app.zoneManager.addZone({ title: 'Handarbeit' });
    hand.placeInFront(app.camera);
    hand.group.position.add(new T.Vector3(0, 0, 6));
    app.history.reset('Probe');
  });
  clusterAntwort = {
    clusters: [
      { name: 'Technik', ideaIndexes: [0, 1, 2] },
      { name: 'Menschen', ideaIndexes: [3, 4] },
      { name: 'Geld', ideaIndexes: [5] },
    ],
  };
  const clusterBefund = () =>
    page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      app.scene.updateMatrixWorld(true);
      const auto = app.zoneManager.zones.filter((z) => z.auto);
      const q0 = auto[0]?.group.getWorldQuaternion(new T.Quaternion());
      const n0 = new T.Vector3(0, 0, 1).applyQuaternion(q0 ?? new T.Quaternion());
      const o0 = auto[0]?.group.getWorldPosition(new T.Vector3());
      const rechts = new T.Vector3().crossVectors(n0, new T.Vector3(0, 1, 0)).negate().normalize();
      const orte = auto
        .map((z) => z.group.getWorldPosition(new T.Vector3()))
        .sort((a, b) => a.dot(rechts) - b.dot(rechts));
      const auge = app.camera.getWorldPosition(new T.Vector3());
      const mitte = orte.reduce((s, p) => s.add(p), new T.Vector3()).multiplyScalar(1 / Math.max(1, orte.length));
      return {
        zonen: app.zoneManager.zones.map((z) => ({
          title: z.title,
          auto: z.auto,
          texte: z.karten.map((id) => window.__zp.karte(id).text),
          farben: z.karten.map((id) => window.__zp.karte(id).colorIndex),
          befund: window.__zp.befund(z),
        })),
        qAbw: Math.max(
          0,
          ...auto.map((z) => {
            const q = z.group.getWorldQuaternion(new T.Quaternion());
            const s = Math.sign(q.dot(q0)) || 1;
            return Math.max(...['x', 'y', 'z', 'w'].map((c) => Math.abs(q[c] - s * q0[c])));
          })
        ),
        eben: Math.max(0, ...orte.map((p) => Math.abs(n0.dot(p.clone().sub(o0))))),
        luecken: orte.slice(1).map((p, i) => p.distanceTo(orte[i]) - 1.5),
        // Schaut die Wand zum Nutzer? Normale gegen die waagerechte Richtung zum Auge.
        schielt: (() => {
          const zumAuge = auge.clone().sub(mitte);
          zumAuge.y = 0;
          const n = n0.clone();
          n.y = 0;
          return (n.angleTo(zumAuge) * 180) / Math.PI;
        })(),
        abstand: Math.hypot(mitte.x - auge.x, mitte.z - auge.z),
        pins: app.cardManager.cards.filter((k) => k.text.startsWith('📌')).length,
        kartenZahl: app.cardManager.cards.length,
        jsonAuto: app.boardToJSON().zones.filter((z) => z.auto === true).length,
        label: app.history.entries[app.history.index].label,
      };
    });
  await page.evaluate(() => window.__app.handleAction('cluster'));
  const sieben = await clusterBefund();
  const autoZ = sieben.zonen.filter((z) => z.auto);
  console.log(`  Zonen: ${sieben.zonen.map((z) => `${z.title}${z.auto ? '*' : ''} [${z.texte.join(', ')}]`).join(' · ')}`);
  pruefe(autoZ.length === 3, `je Cluster eine Zone (${autoZ.length})`);
  pruefe(
    JSON.stringify(autoZ.map((z) => [z.title, z.texte])) ===
      JSON.stringify([
        ['Technik', ['Akku', 'Display', 'Sensor']],
        ['Menschen', ['Team', 'Kunden']],
        ['Geld', ['Budget']],
      ]),
    'Titel und Mitglieder wie vom Cluster vorgegeben'
  );
  pruefe(autoZ.every((z) => new Set(z.farben).size === 1 && z.farben[0] !== 0), 'je Zone einheitlich eingefärbt');
  for (const z of autoZ) rasterPruefen(z.befund, z.texte.length);
  pruefe(sieben.qAbw < 1e-9, `alle Zonen parallel (Abweichung ${zahl(sieben.qAbw)})`);
  pruefe(sieben.eben < 1e-6, `alle Zonen in einer Ebene (Abweichung ${zahl(sieben.eben)})`);
  pruefe(sieben.luecken.every((l) => Math.abs(l - 0.15) < 1e-6), `nebeneinander mit 0,15 m Luft (${sieben.luecken.map((l) => l.toFixed(3)).join(', ')})`);
  pruefe(sieben.schielt < 1, `die Wand schaut zum Nutzer (${sieben.schielt.toFixed(2)}°)`);
  pruefe(Math.abs(sieben.abstand - 2.4) < 0.01, `rund 2,4 m vor dem Nutzer (${sieben.abstand.toFixed(2)} m)`);
  pruefe(sieben.pins === 0 && sieben.kartenZahl === 6, 'keine 📌-Titelkarten');
  pruefe(sieben.jsonAuto === 3, 'auto: true steht im JSON');
  pruefe(sieben.zonen.some((z) => z.title === 'Handarbeit' && !z.auto), 'die leere Zone von Hand bleibt');
  pruefe(sieben.label === 'Cluster angewendet', `Verlaufseintrag „${sieben.label}“`);

  clusterAntwort = { clusters: [{ name: 'Alles', ideaIndexes: [0, 1, 2, 3, 4, 5] }] };
  await page.evaluate(() => window.__app.handleAction('cluster'));
  const siebenB = await clusterBefund();
  const autoB = siebenB.zonen.filter((z) => z.auto);
  console.log(`  Zweiter Lauf: ${siebenB.zonen.map((z) => `${z.title}${z.auto ? '*' : ''} (${z.texte.length})`).join(' · ')}`);
  pruefe(autoB.length === 1 && autoB[0].texte.length === 6, 'zweiter Lauf: eine Zone mit allen sechs Karten');
  pruefe(siebenB.zonen.every((z) => !z.auto || z.texte.length), 'keine leeren Auto-Zonen übrig');
  pruefe(siebenB.zonen.some((z) => z.title === 'Handarbeit'), 'die leere Zone von Hand bleibt auch jetzt');

  // --- Zusatz: mit der Maus --------------------------------------------------
  //
  // Die Prüfungen oben rufen `onCardMoved` direkt. Hier läuft der ganze Weg:
  // Zug über die Ziehebene, Loslassen, und die Zone an der Kopfzeile gezogen —
  // die Karten folgen dann allein über die Bildschleife.
  console.log('\n=== Zusatz: mit der Maus ===');
  const wo = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const zp = window.__zp;
    zp.leer();
    const zone = app.zoneManager.addZone({ title: 'Maus' });
    zone.placeInFront(app.camera);
    app.scene.updateMatrixWorld(true);
    const k = app.cardManager.addCard('Mauskarte');
    zp.setzeWelt(k, zone.group.localToWorld(new T.Vector3(1.2, 0.1, 0.3)));
    k.group.lookAt(app.camera.getWorldPosition(new T.Vector3()));
    app.scene.updateMatrixWorld(true);
    const rect = app.renderer.domElement.getBoundingClientRect();
    const auf = (obj) => {
      const p = obj.getWorldPosition(new T.Vector3()).project(app.camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
    return { karte: auf(k.group), ziel: auf(zone.panel), kopf: auf(zone.header.mesh), id: k.id };
  });
  const zug = async (von, nach) => {
    await page.mouse.move(von.x, von.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(von.x + ((nach.x - von.x) * i) / 6, von.y + ((nach.y - von.y) * i) / 6);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
  };
  await zug(wo.karte, wo.ziel);
  const mausA = await page.evaluate((id) => {
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    return {
      mitglied: zone.karten.includes(id),
      befund: window.__zp.befund(zone),
      relativ: window.__zp.relativ(zone),
      status: document.getElementById('status')?.textContent ?? '',
    };
  }, wo.id);
  pruefe(mausA.mitglied, 'mit der Maus hineingezogen: Mitglied');
  rasterPruefen(mausA.befund, 1, 'Maus · 1');
  pruefe(mausA.status.includes('Zone „Maus“'), `Statuszeile „${mausA.status}“`);
  await zug(wo.kopf, { x: wo.kopf.x - 120, y: wo.kopf.y + 40 });
  await bilder();
  const mausB = await page.evaluate(() => {
    const app = window.__app;
    const zone = app.zoneManager.zones[0];
    return {
      relativ: window.__zp.relativ(zone),
      label: app.history.entries[app.history.index].label,
    };
  });
  pruefe(mausB.label === 'Zone verschoben', `Zone an der Kopfzeile gezogen („${mausB.label}“)`);
  pruefe(abweichung(mausA.relativ, mausB.relativ) < 1e-9, 'die Karte ist mitgewandert');

  // **Der Grundablauf, ohne die Karte vorher vor die Zone zu setzen.** Oben
  // steht die Mauskarte schon 30 cm vor der Fläche. Im echten Ablauf liegt
  // eine neue Karte 1,15 m vor dem Nutzer (`spawnIdeas`), eine neue Zone 2,4 m
  // (`placeInFront`), und der Mauszug ändert die Tiefe nie. Das Gegenreview
  // hat genau diesen Fall gefunden: Die Karte blieb draußen. Abgelegt wird
  // jetzt auch über den Blickstrahl (zones.js, `_trefferAm`).
  const wo2 = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    window.__zp.leer();
    const zone = app.zoneManager.addZone({ title: 'Grundablauf' });
    zone.placeInFront(app.camera);
    const [k] = app.cardManager.spawnIdeas(['Neue Idee'], app.camera);
    app.scene.updateMatrixWorld(true);
    const rect = app.renderer.domElement.getBoundingClientRect();
    const auf = (obj) => {
      const p = obj.getWorldPosition(new T.Vector3()).project(app.camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
    const tiefe = zone.group.worldToLocal(k.group.getWorldPosition(new T.Vector3())).z;
    return { karte: auf(k.group), ziel: auf(zone.panel), id: k.id, tiefe };
  });
  console.log(`  neue Karte liegt ${wo2.tiefe.toFixed(2)} m vor der neuen Zone`);
  await zug(wo2.karte, wo2.ziel);
  const mausC = await page.evaluate((id) => {
    const zone = window.__app.zoneManager.zones[0];
    return { mitglied: zone.karten.includes(id), befund: window.__zp.befund(zone) };
  }, wo2.id);
  pruefe(wo2.tiefe > 0.6, 'die Karte liegt vor dem Zug ausserhalb des Naehe-Fensters (Ausgangslage stimmt)');
  pruefe(mausC.mitglied, 'Grundablauf: neue Karte per Maus auf die neue Zone gezogen → Mitglied');
  rasterPruefen(mausC.befund, 1, 'Grundablauf · 1');

  // --- 8 -------------------------------------------------------------------
  if (ohneNacht) {
    console.log('\n=== 8. Nachthimmel — übersprungen (--ohne-nacht) ===');
  } else {
    console.log('\n=== 8. Nachthimmel: gedrehte Welt ===');
    await page.evaluate(() => window.__zp.leer());
    await selectEnv(page, 'night');
    // Erst auf dem Planeten ankommen: Den Boden übernimmt die Bildschleife.
    await page.waitForFunction(() => window.__app.camera.getWorldPosition(new window.__THREE.Vector3()).y > 20, null, {
      timeout: 120000,
      polling: 200,
    });
    const acht = await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const zp = window.__zp;
      app.env.setWalkEnabled(false);
      const welt = app.cardManager.heimat;
      const himmel = app.scene.getObjectByName('nacht-himmel');
      const drehe = (grad) => {
        welt.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0.3, 0).normalize(), (grad * Math.PI) / 180));
        himmel?.quaternion.copy(welt.quaternion);
        app.scene.updateMatrixWorld(true);
      };
      // Ein paar Meter gegangen: Die Welt steht schief unter dem Nutzer.
      drehe(35);
      const zone = app.zoneManager.addZone({ title: 'Planet' });
      zone.placeInFront(app.camera);
      app.scene.updateMatrixWorld(true);
      [[-0.4, 0.2], [0.2, 0], [0.45, -0.3]].forEach(([x, y], i) => zp.ablegen(zone, app.cardManager.addCard(`Stern ${i}`), x, y));
      return {
        planet: welt !== app.scene,
        elter: zone.group.parent?.name,
        befund: zp.befund(zone),
        relativ: zp.relativ(zone),
      };
    });
    pruefe(acht.planet && acht.elter === 'nacht-welt', `Zone hängt am Planeten (${acht.elter})`);
    rasterPruefen(acht.befund, 3, 'Planet · 3');
    // Zone verschieben — in Weltrichtung, umgerechnet in die gedrehte Heimat.
    await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const zone = app.zoneManager.zones[0];
      const w = zone.group.getWorldPosition(new T.Vector3()).add(new T.Vector3(0.5, 0.2, 0));
      zone.group.position.copy(app.zoneManager.heimat.worldToLocal(w));
      zone.group.rotateY(-0.3);
    });
    await bilder();
    const achtB = await page.evaluate(() => window.__zp.relativ(window.__app.zoneManager.zones[0]));
    pruefe(abweichung(acht.relativ, achtB) < 1e-9, `verschoben: Karten folgen auf dem Planeten (Abweichung ${zahl(abweichung(acht.relativ, achtB))})`);
    // Weitergehen: Die Welt dreht sich, Zone und Karten drehen gemeinsam mit —
    // dafür darf nichts neu gelegt werden.
    const achtC = await page.evaluate(async () => {
      const T = window.__THREE;
      const app = window.__app;
      const zm = app.zoneManager;
      const zone = zm.zones[0];
      let gelegt = 0;
      const lege = zm._lege.bind(zm);
      zm._lege = (z) => {
        gelegt++;
        return lege(z);
      };
      const k0 = window.__zp.karte(zone.karten[0]).group.getWorldPosition(new T.Vector3());
      const welt = zm.heimat;
      welt.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), (25 * Math.PI) / 180));
      app.scene.getObjectByName('nacht-himmel')?.quaternion.copy(welt.quaternion);
      await new Promise((r) => {
        let i = 0;
        const f = () => (++i >= 4 ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      });
      zm._lege = lege;
      const k1 = window.__zp.karte(zone.karten[0]).group.getWorldPosition(new T.Vector3());
      return { gelegt, weg: k0.distanceTo(k1), relativ: window.__zp.relativ(zone), befund: window.__zp.befund(zone) };
    });
    pruefe(achtC.weg > 5, `weitergegangen: die Karten wandern mit dem Planeten (${achtC.weg.toFixed(1)} m)`);
    pruefe(abweichung(acht.relativ, achtC.relativ) < 1e-9, 'und bleiben dabei auf ihrer Zone');
    pruefe(achtC.gelegt === 0, `ohne Neulegen — die Lage in der Heimat hat sich nicht geändert (${achtC.gelegt}×)`);
    rasterPruefen(achtC.befund, 3);
    // Gegriffen und losgelassen auf dem Planeten.
    const achtD = await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const zone = app.zoneManager.zones[0];
      const hand = new T.Object3D();
      app.scene.add(hand);
      hand.position.copy(zone.group.getWorldPosition(new T.Vector3()));
      hand.updateMatrixWorld(true);
      hand.attach(zone.group);
      hand.position.x -= 0.4;
      hand.rotateY(0.6);
      app.zoneManager.update();
      const inDerHand = window.__zp.relativ(zone);
      app.zoneManager.heimat.attach(zone.group);
      hand.removeFromParent();
      app.zoneManager.update();
      return { inDerHand, los: window.__zp.relativ(zone), json: app.boardToJSON() };
    });
    pruefe(abweichung(acht.relativ, achtD.inDerHand) < 1e-9, 'in der Hand: Karten folgen');
    pruefe(abweichung(acht.relativ, achtD.los) < 1e-9, 'losgelassen: Karten bleiben auf der Zone');
    pruefe(achtD.json.zones[0].frame === 'planet' && achtD.json.zones[0].karten.length === 3, 'Stand: Planetenrahmen und drei Mitglieder');
  }

  // Gezählt werden nur Ausnahmen der Seite; Warnungen und Ladefehler von
  // Ressourcen stehen informativ darüber.
  const fehlerMeldungen = messages.filter((m) => m.startsWith('pageerror'));
  if (messages.length) console.log(`\n  Konsole: ${messages.slice(0, 8).join(' | ')}`);
  pruefe(fehlerMeldungen.length === 0, `keine Fehler in der Konsole (${fehlerMeldungen.length})`);
  console.log(fehler ? `\nFEHLER: ${fehler} Prüfung(en) fehlgeschlagen` : '\nOK: alle Prüfungen bestanden');
} finally {
  await browser.close();
  await server.stop();
}
process.exit(fehler ? 1 : 0);

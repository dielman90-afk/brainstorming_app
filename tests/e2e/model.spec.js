// Logik von Karten und Verbindungen (src/cards.js, src/connections.js).
//
// Läuft im Browser statt in Node, weil beide Module Canvas-Texturen bauen –
// aber ohne Mausklicks: direkt über die Manager der laufenden App.
import { test, expect, openApp } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await openApp(page, { board: { cards: [], connections: [], zones: [] } });
});

test('Verbindungen: Toggle, Pfeil verdrängt Linie, Gegenrichtung ist eigener Pfeil', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, connectionManager: con, camera } = window.__app;
    const [a, b, c] = cm.spawnIdeas(['A', 'B', 'C'], camera);
    const log = [];
    log.push(con.toggle(a, b), con.toggle(b, a)); // added, removed (ungerichtet)
    log.push(con.toggle(a, a)); // null – keine Schleife
    con.toggle(a, b);
    log.push(con.connect(a, b)); // Pfeil ersetzt die lose Linie
    log.push(con.connections.length, con.connections[0].directed);
    log.push(con.connect(b, a)); // Rückweg ist eine eigene Kante
    log.push(con.edgesFrom(a).length, con.edgesFrom(b).length);
    log.push(con.connect(a, b)); // zweites Mal: entfernt
    con.connect(a, c, { label: 'ja' });
    log.push(con.setLabel(con.findDirected(a, c), '  nein  '), con.findDirected(a, c).label);
    return log;
  });
  expect(r).toEqual(['added', 'removed', null, 'added', 1, true, 'added', 1, 1, 'removed', true, 'nein']);
});

test('Löschen einer Karte räumt ihre Verbindungen ab; alte Pfeil-Zeiger sind ungültig', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, connectionManager: con, camera } = window.__app;
    const [a, b, c] = cm.spawnIdeas(['A', 'B', 'C'], camera);
    con.toggle(a, b);
    con.connect(b, c, { label: 'x' });
    const edge = con.findDirected(b, c);
    cm.removeCard(b);
    return { left: con.connections.length, stale: con.setLabel(edge, 'neu'), has: con.has(edge) };
  });
  expect(r).toEqual({ left: 0, stale: false, has: false });
});

test('Serialisierung: Ideenkarten ohne flowType, Verbindungen im alten Format, Rundlauf', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, connectionManager: con, camera, boardToJSON, applyBoardJSON } = window.__app;
    const [a, b, c] = cm.spawnIdeas(['Idee', 'Schritt', 'Noch eine'], camera);
    b.setFlowType('task');
    a.setColor(3);
    a.setScale(1.4);
    con.toggle(a, c); // lose Linie (zwischen a und b würde der Pfeil sie verdrängen)
    con.connect(b, a, { label: 'zurück' });
    const json = boardToJSON();
    const ideaKeys = Object.keys(json.cards[0]).sort();
    cm.clear();
    applyBoardJSON(JSON.parse(JSON.stringify(json)));
    const again = boardToJSON();
    return { ideaKeys, flow: json.cards[1].flowType, connections: json.connections, same: JSON.stringify(again.cards) === JSON.stringify(json.cards) };
  });
  expect(r.ideaKeys).toEqual(['colorIndex', 'id', 'position', 'quaternion', 'scale', 'text']);
  expect(r.flow).toBe('task');
  expect(r.connections).toEqual([
    { a: expect.any(String), b: expect.any(String) },
    { a: expect.any(String), b: expect.any(String), directed: true, label: 'zurück' },
  ]);
  expect(r.same).toBe(true);
});

test('applyState (Undo) behält Objekt-Identität und Auswahl, entfernt und ergänzt korrekt', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, camera } = window.__app;
    const [a, b] = cm.spawnIdeas(['A', 'B'], camera);
    cm.select(a);
    const state = cm.toJSON().cards;
    const c = cm.spawnIdeas(['C'], camera)[0];
    a.setText('A geändert');
    cm.removeCard(b);
    cm.applyState(state);
    return {
      texts: cm.cards.map((x) => x.text),
      sameA: cm.cards[0] === a,
      selected: cm.selected === a,
      cGone: !cm.cards.includes(c),
      bId: cm.cards[1].id === state[1].id,
    };
  });
  expect(r).toEqual({ texts: ['A', 'B'], sameA: true, selected: true, cGone: true, bId: true });
});

test('Knotenarten: Form, Maße und Farbe; zurück zur Ideenkarte', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, camera } = window.__app;
    const card = cm.spawnIdeas(['K'], camera)[0];
    const look = () => ({ shape: card.shape, w: card.width, color: card.colorIndex, type: card.flowType });
    const out = [look()];
    for (const t of ['decision', 'start', 'end', 'quatsch', null]) {
      card.setFlowType(t);
      out.push(look());
    }
    return out;
  });
  expect(r).toEqual([
    { shape: 'rect', w: 0.32, color: 0, type: null },
    { shape: 'diamond', w: 0.42, color: 1, type: 'decision' },
    { shape: 'stadium', w: 0.3, color: 2, type: 'start' },
    { shape: 'stadium', w: 0.3, color: 4, type: 'end' },
    { shape: 'rect', w: 0.32, color: 0, type: null }, // unbekannte Art → Ideenkarte
    { shape: 'rect', w: 0.32, color: 0, type: null },
  ]);
});

test('Pfeile enden am Rand des Zielknotens, nicht in seiner Mitte', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, connectionManager: con, camera } = window.__app;
    const [a, b] = cm.spawnIdeas(['A', 'B'], camera);
    b.setFlowType('decision');
    a.group.position.set(-1, 1.5, -2);
    b.group.position.set(1, 1.5, -2);
    a.group.rotation.set(0, 0, 0);
    b.group.rotation.set(0, 0, 0);
    con.connect(a, b);
    con.update(camera);
    const head = con.findDirected(a, b).head.position;
    return { tipX: head.x, bLeftEdge: 1 - b.width / 2 };
  });
  expect(r.tipX).toBeLessThan(r.bLeftEdge);
  expect(r.tipX).toBeGreaterThan(r.bLeftEdge - 0.1);
});

test('Neue Karten stehen im Halbkreis vor dem Nutzer, Batches gestaffelt', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { cardManager: cm, camera } = window.__app;
    const cam = camera.getWorldPosition(camera.position.clone());
    const first = cm.spawnIdeas(['1', '2', '3'], camera);
    const second = cm.spawnIdeas(['4'], camera);
    const dist = (c) => c.group.getWorldPosition(cam.clone()).setY(cam.y).distanceTo(cam);
    return {
      dists: first.map(dist),
      ys: [first[0].group.position.y, second[0].group.position.y],
    };
  });
  r.dists.forEach((d) => expect(d).toBeCloseTo(1.15, 2));
  expect(r.ys[0]).not.toBeCloseTo(r.ys[1], 2);
});

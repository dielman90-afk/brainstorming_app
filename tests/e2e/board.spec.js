// Board als Ganzes: Export/Import, Leeren, Zonen, Werkzeuge, Speicherkosten.
import { test, expect, openApp, cardCount, cardTexts, statusText, frames } from './fixtures.js';

// Importdateien als Buffer statt als Pfad: Playwright legt Testdateien in
// Ordner, die nach dem Testtitel heißen (hier mit Umlauten und „→"). Ohne
// UTF-8-Locale öffnet Chromium solche Pfade nicht und meldet `cancel` statt
// `change` – der Import liefe dann gar nicht erst los.
const jsonFile = (content) => ({
  name: 'board.json',
  mimeType: 'application/json',
  buffer: Buffer.from(content),
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('Export → Leeren → Import stellt das Board wieder her', async ({ page }) => {
  await page.evaluate(() => {
    const { cardManager, connectionManager } = window.__app;
    const [a, b, c] = cardManager.cards;
    connectionManager.toggle(a, b);
    connectionManager.connect(b, c, { label: 'ja' });
    c.setFlowType('decision');
  });
  const before = await page.evaluate(() => window.__app.boardToJSON());

  const download = page.waitForEvent('download');
  await page.click('#btn-export');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^brainstorm-board-.*\.json$/);
  const raw = Buffer.concat(await (await file.createReadStream()).toArray()).toString('utf8');
  const exported = JSON.parse(raw);
  expect(exported.cards.map((c) => c.text)).toEqual(before.cards.map((c) => c.text));

  await page.click('#btn-clear');
  expect(await cardCount(page)).toBe(3); // erster Druck nur „scharf"
  expect(await statusText(page)).toMatch(/Nochmal drücken/);
  await page.click('#btn-clear');
  expect(await cardCount(page)).toBe(0);

  await page.setInputFiles('#import-file', jsonFile(raw));
  await expect.poll(() => cardCount(page)).toBe(3);
  const after = await page.evaluate(() => window.__app.boardToJSON());
  expect(after.cards.map(({ id, text, flowType }) => ({ id, text, flowType }))).toEqual(
    before.cards.map(({ id, text, flowType }) => ({ id, text, flowType }))
  );
  expect(after.connections).toEqual(before.connections);
});

test('defekte Importdatei: klare Meldung, Board bleibt unverändert', async ({ page }) => {
  for (const [content, pattern] of [
    ['{kaputt', /kein gültiges JSON/],
    ['{"cards":"x"}', /„cards"/],
    ['[1,2]', /kein Board-Objekt/],
  ]) {
    await page.setInputFiles('#import-file', jsonFile(content));
    await expect.poll(() => statusText(page)).toMatch(pattern);
    expect(await cardCount(page)).toBe(3);
    await page.keyboard.press('Escape');
  }
});

test('Import mit Zonen: genau ein Verlaufsschritt, Rückgängig führt zum Stand davor', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { zoneManager, history, boardToJSON, applyBoardJSON, handleAction } = window.__app;
    await handleAction('zone');
    await handleAction('zone');
    const datei = boardToJSON();
    await handleAction('zone');
    const zonesBefore = zoneManager.zones.length;
    const steps = history.entries.length;
    applyBoardJSON(datei); // wie der Datei-Import in main.js …
    history.commit('Board importiert'); // … samt anschließendem Schritt
    const labels = history.entries.slice(steps).map((e) => e.label);
    const zonesImported = zoneManager.zones.length;
    await handleAction('undo');
    return { labels, zonesImported, zonesAfterUndo: zoneManager.zones.length, zonesBefore };
  });
  expect(r).toEqual({ labels: ['Board importiert'], zonesImported: 2, zonesAfterUndo: 3, zonesBefore: 3 });
});

test('Zonen: Undo/Redo lässt keine Texturen liegen', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { renderer, handleAction } = window.__app;
    await handleAction('zone');
    await handleAction('zone');
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await frame();
    const t0 = renderer.info.memory.textures;
    for (let i = 0; i < 10; i++) {
      await handleAction('undo');
      await handleAction('redo');
      await frame();
    }
    return { t0, t1: renderer.info.memory.textures };
  });
  expect(r.t1 - r.t0).toBeLessThanOrEqual(2);
});

test('Zone: anlegen, umbenennen aus dem Eingabefeld, Farbe, löschen – alles rückgängig machbar', async ({ page }) => {
  await page.click('#btn-zone');
  const zone = () =>
    page.evaluate(() => {
      const z = window.__app.zoneManager.zones[0];
      return z ? { title: z.title, color: z.colorIndex } : null;
    });
  expect(await zone()).toEqual({ title: 'Neue Zone', color: 0 });
  await page.fill('#idea-input', 'Doing');
  await page.evaluate(() => window.__app.zoneManager.zones[0].buttons[0].userData.onClick()); // ✎
  await expect.poll(zone).toEqual({ title: 'Doing', color: 0 });
  await page.evaluate(() => window.__app.zoneManager.zones[0].buttons[1].userData.onClick()); // 🎨
  expect(await zone()).toEqual({ title: 'Doing', color: 1 });
  await page.evaluate(() => window.__app.zoneManager.zones[0].buttons[2].userData.onClick()); // ✕
  expect(await zone()).toBe(null);
  await page.click('#btn-undo');
  expect(await zone()).toEqual({ title: 'Doing', color: 1 });
});

test('„Alles ordnen" holt Tafel, Uhr, Zone und Karten nach vorn – und ist rückgängig machbar', async ({ page }) => {
  await page.click('#btn-whiteboard');
  await page.click('#btn-timer');
  await page.click('#btn-zone');
  const positions = () => page.evaluate(() => window.__app.cardManager.cards.map((c) => c.group.position.toArray()));
  const before = await positions();
  await page.click('#btn-tools-order');
  expect(await statusText(page)).toMatch(/3 Flächen und 3 Karten vor dich geordnet/);
  const ordered = await positions();
  expect(ordered).not.toEqual(before);
  // Karten stehen vor der Wand: näher an der Kamera als Tafel und Zone.
  const depth = await page.evaluate(() => {
    const { camera, cardManager, whiteboard, zoneManager } = window.__app;
    const cam = camera.getWorldPosition(camera.position.clone());
    const dist = (g) => g.getWorldPosition(cam.clone()).setY(cam.y).distanceTo(cam);
    return {
      cards: Math.max(...cardManager.cards.map((c) => dist(c.group))),
      wall: Math.min(dist(whiteboard.group), dist(zoneManager.zones[0].group)),
    };
  });
  expect(depth.cards).toBeLessThan(depth.wall);
  await page.click('#btn-undo');
  const back = await positions();
  back.flat().forEach((v, i) => expect(v).toBeCloseTo(before.flat()[i], 5));
});

test('Autosave kodiert das Whiteboard nur nach einer Änderung neu', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { whiteboard, boardToJSON } = window.__app;
    whiteboard.strokeStart({ x: 0.2, y: 0.5 });
    for (let i = 0; i < 40; i++) whiteboard.strokeMove({ x: 0.2 + i * 0.01, y: 0.5 + Math.sin(i / 5) * 0.2 });
    whiteboard.strokeEnd();
    const first = boardToJSON().whiteboard.image;
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) boardToJSON();
    const cached = (performance.now() - t0) / 5;
    whiteboard.strokeStart({ x: 0.7, y: 0.3 });
    whiteboard.strokeMove({ x: 0.8, y: 0.2 });
    whiteboard.strokeEnd();
    const changed = boardToJSON().whiteboard.image !== first;
    whiteboard.clearBoard();
    const cleared = boardToJSON().whiteboard.image !== first;
    return { cached, changed, cleared };
  });
  expect(r.cached).toBeLessThan(10);
  expect(r.changed).toBe(true);
  expect(r.cleared).toBe(true);
});

test('Umgebung, Bildqualität, Menü einklappen', async ({ page }) => {
  await page.click('#btn-env');
  expect(await statusText(page)).toMatch(/Himmelsinsel aktiv/);
  const q = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__app.handleAction('quality'));
    q.push(await statusText(page));
  }
  expect(q).toEqual(['🎚 Bildqualität: sparsam', '🎚 Bildqualität: mittel', '🎚 Bildqualität: voll']);

  await page.mouse.click(1100, 700);
  await page.keyboard.press('m');
  await expect(page.locator('body')).toHaveClass(/menu-collapsed/);
  await page.reload();
  await page.waitForFunction(() => window.__app?.cardManager, null, { timeout: 90_000 });
  await expect(page.locator('body')).toHaveClass(/menu-collapsed/);
  await page.click('#btn-collapse');
  await expect(page.locator('body')).not.toHaveClass(/menu-collapsed/);
  await frames(page, 1);
  expect(await cardTexts(page)).toHaveLength(3);
});

test('kleines Fenster: Overlay scrollt bis zum XR-Knopf', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  const r = await page.evaluate(() => {
    const s = document.getElementById('overlay-scroll');
    s.scrollTop = s.scrollHeight;
    const b = document.getElementById('xr-button').getBoundingClientRect();
    return { scrollable: s.scrollHeight > s.clientHeight, visible: b.top >= 0 && b.bottom <= innerHeight };
  });
  expect(r).toEqual({ scrollable: true, visible: true });
});

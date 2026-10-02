// Start, Wiederherstellung und Autosave.
import { test, expect, openApp, cardCount, cardTexts, frames } from './fixtures.js';

test('Erststart mit leerem Speicher: drei Demo-Karten, Baustand, Undo aus', async ({ page }) => {
  await openApp(page);
  expect(await cardTexts(page)).toEqual(['VR-Brainstorming-App', 'Zielgruppe: Remote-Teams', 'Feature: KI-Ideenassistent']);
  await expect(page.locator('#build-stamp')).toHaveText(/^Baustand \S+ · \d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#btn-undo')).toBeDisabled();
  await expect(page.locator('#btn-redo')).toBeDisabled();
});

test('Desktop ohne WebXR: XR-Knopf bleibt aus und sagt warum', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#xr-button')).toBeDisabled();
  await expect(page.locator('#xr-button')).toHaveText(/WebXR nicht verfügbar|Kein XR-Gerät/);
});

test('gespeichertes leeres Board: keine Demo-Karten', async ({ page }) => {
  await openApp(page, { board: { cards: [], connections: [], zones: [] } });
  expect(await cardCount(page)).toBe(0);
});

test('defektes gespeichertes Board: App startet trotzdem', async ({ page }) => {
  await openApp(page, { board: '{"cards":"kaputt"}' });
  expect(await cardCount(page)).toBe(0);
  await page.fill('#idea-input', 'Geht noch');
  await page.press('#idea-input', 'Enter');
  expect(await cardTexts(page)).toEqual(['Geht noch']);
});

// Zwei Reloads und drei Autosave-Takte – auf einem langsamen CI-Rechner mehr
// als zwei Minuten. Daher `test.slow()` (dreifache Zeitgrenze) und keine teure
// Umgebung in diesem Test; die Umgebungswahl prüft der nächste.
test('Reload stellt Karten, Verbindungen, Zonen und Whiteboard wieder her', async ({ page }) => {
  test.slow();
  await openApp(page);
  const before = await page.evaluate(async () => {
    const { cardManager, connectionManager, whiteboard, handleAction } = window.__app;
    const [a, b] = cardManager.cards;
    connectionManager.toggle(a, b);
    a.setColor(3);
    a.setScale(1.5);
    await handleAction('zone');
    whiteboard.setVisible(true);
    return {
      texts: cardManager.cards.map((c) => c.text),
      connections: connectionManager.connections.length,
      color: a.colorIndex,
      scale: a.scale,
    };
  });

  // Autosave läuft alle 3 s – ohne Verlassen der Seite (in der Brille stürzt
  // der Browser auch mal ab, statt sauber zu schließen). Erst die Karten …
  await page.waitForFunction(() => {
    const board = JSON.parse(localStorage.getItem('webxr-brainstorming-board') ?? '{}');
    return board.zones?.length === 1 && board.cards?.[0]?.colorIndex === 3;
  }, null, { timeout: 15_000 });

  // … dann NUR zeichnen. Getrennt, weil der Autosave neue Striche früher
  // übersehen hat und das Bild nur mitnahm, wenn sich zugleich eine Karte
  // änderte.
  const image = await page.evaluate(() => {
    const { whiteboard } = window.__app;
    whiteboard.strokeStart({ x: 0.3, y: 0.5 });
    whiteboard.strokeMove({ x: 0.6, y: 0.4 });
    whiteboard.strokeEnd();
    return whiteboard.toDataURL();
  });
  await page.waitForFunction(
    (img) => JSON.parse(localStorage.getItem('webxr-brainstorming-board') ?? '{}').whiteboard?.image === img,
    image,
    { timeout: 15_000 }
  );

  await page.reload();
  await page.waitForFunction(() => window.__app?.cardManager, null, { timeout: 90_000 });
  await frames(page, 2);
  const after = await page.evaluate(async () => {
    const { cardManager, connectionManager, zoneManager, whiteboard } = window.__app;
    // Das Whiteboard-Bild lädt asynchron.
    for (let i = 0; i < 50 && !whiteboard.hasContent; i++) await new Promise((r) => setTimeout(r, 100));
    const a = cardManager.cards[0];
    return {
      texts: cardManager.cards.map((c) => c.text),
      connections: connectionManager.connections.length,
      color: a.colorIndex,
      scale: a.scale,
      zones: zoneManager.zones.length,
      board: whiteboard.hasContent && whiteboard.group.visible,
    };
  });
  expect(after).toEqual({
    texts: before.texts,
    connections: before.connections,
    color: before.color,
    scale: before.scale,
    zones: 1,
    board: true,
  });
});

test('Reload startet in der zuletzt gewählten Umgebung', async ({ page }) => {
  test.slow();
  await openApp(page);
  // Direkt bis zum Konstrukt durchschalten, ohne die Welten dazwischen zu
  // rendern – das Konstrukt ist eine der billigen, die Insel davor die
  // teuerste. Gemerkt wird die stabile id, nicht die Position in der Liste.
  const saved = await page.evaluate(() => {
    const { env } = window.__app;
    const k = env.environments.findIndex((e) => e.id === 'matrix');
    while (env.current() !== k) env.cycle();
    return localStorage.getItem('webxr-brainstorming-env');
  });
  expect(saved).toBe('matrix');
  await page.reload();
  await page.waitForFunction(() => window.__app?.cardManager, null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__app.env.environments[window.__app.env.current()]?.id)).toBe('matrix');
});

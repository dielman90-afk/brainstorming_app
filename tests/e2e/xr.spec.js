// VR-Abläufe, soweit sie sich ohne Brille prüfen lassen: Die Controller-
// Objekte existieren auch am Desktop (`interactions.controllers`), Greifen und
// Loslassen lassen sich über dieselben Handler auslösen, die in XR die
// select-Ereignisse bedienen. Echte Sitzungen, Hand-Tracking, Haptik und
// Bildrate auf der Quest bleiben Handarbeit auf dem Gerät.
import { test, expect, openApp } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('Greifen und Loslassen: Karte bleibt in ihrer Heimat, Verschiebung landet im Verlauf', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { interactions, cardManager, history } = window.__app;
    const card = cardManager.cards[0];
    const c = interactions.controllers[0];
    c.userData.grabbed = card;
    c.userData.grabStart = card.group.getWorldPosition(card.group.position.clone());
    c.attach(card.group);
    // Hand bewegt sich. XR-Controller tragen ihre Pose in `matrix`
    // (matrixAutoUpdate = false) – `position` zu ändern hätte keine Wirkung.
    c.matrix.multiply(new card.group.matrix.constructor().makeTranslation(0.3, 0, 0));
    c.updateMatrixWorld(true);
    const steps = history.entries.length;
    interactions._onSelectEnd(c);
    return { parentIsHome: card.group.parent === cardManager.heimat, newSteps: history.entries.length - steps };
  });
  expect(r).toEqual({ parentIsHome: true, newSteps: 1 });
});

test('Karte, die während des Haltens gelöscht wird, kehrt nicht als Geist zurück', async ({ page }) => {
  const inScene = await page.evaluate(() => {
    const { interactions, cardManager } = window.__app;
    const card = cardManager.cards[0];
    const c = interactions.controllers[0];
    c.userData.grabbed = card;
    c.userData.grabStart = card.group.getWorldPosition(card.group.position.clone());
    c.attach(card.group);
    cardManager.removeCard(card); // z. B. „Aus Text bauen" ersetzt den Prozess
    interactions._onSelectEnd(c);
    let found = false;
    card.group.traverseAncestors((o) => (found ||= o.isScene));
    return found;
  });
  expect(inScene).toBe(false);
});

test('Zone, die während des Haltens gelöscht wird, kehrt nicht als Geist zurück', async ({ page }) => {
  const inScene = await page.evaluate(async () => {
    const { interactions, zoneManager, handleAction } = window.__app;
    await handleAction('zone');
    const zone = zoneManager.zones[0];
    const c = interactions.controllers[1];
    c.userData.grabbedTarget = zone.header.mesh.userData.grabTarget;
    c.userData.grabTargetStart = zone.group.getWorldPosition(zone.group.position.clone());
    c.attach(zone.group);
    zoneManager.removeZone(zone); // ✕ oder Rückgängig mit der anderen Hand
    interactions._onSelectEnd(c);
    let found = false;
    zone.group.traverseAncestors((o) => (found ||= o.isScene));
    return found;
  });
  expect(inScene).toBe(false);
});

test('Hand-Menü: drei Reiter mit allen Aktionen, jede Aktion ist bekannt', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { wristMenu } = window.__app;
    const pages = [];
    for (let i = 0; i < 3; i++) {
      wristMenu.setPage(i);
      pages.push(wristMenu.buttons.length);
    }
    return { pages, ids: [...wristMenu.buttonsById.keys()] };
  });
  expect(r.pages).toEqual([13, 13, 10]); // 3 Reiter + 10 / 10 / 7 Aktionen
  expect(r.ids).toHaveLength(27);

  // Jede Aktion des Menüs läuft ohne Fehler durch (Eingaben über das Feld).
  for (const id of r.ids) {
    await page.fill('#idea-input', 'Test');
    await page.evaluate((action) => window.__app.handleAction(action), id);
    await page.waitForFunction(() => !document.getElementById('status-band').classList.contains('busy'), null, {
      timeout: 60_000,
    });
  }
});

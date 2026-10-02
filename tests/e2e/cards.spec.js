// Karten am Desktop: anlegen, auswählen, bearbeiten, Kontextmenü, Formen,
// Größe, Löschen, Undo/Redo.
import { test, expect, openApp, cardCount, cardTexts, cardOnScreen, clickCard, statusText } from './fixtures.js';

const selectedIndex = (page) =>
  page.evaluate(() => window.__app.cardManager.cards.indexOf(window.__app.cardManager.selected));

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('neue Karte per Enter und per Knopf; leeres Feld legt nichts an', async ({ page }) => {
  await page.fill('#idea-input', 'Per Enter');
  await page.press('#idea-input', 'Enter');
  await page.fill('#idea-input', 'Per Knopf');
  await page.click('#btn-new');
  expect((await cardTexts(page)).slice(-2)).toEqual(['Per Enter', 'Per Knopf']);
  await expect(page.locator('#idea-input')).toHaveValue('');

  await page.click('#btn-new');
  expect(await cardCount(page)).toBe(5);
  expect(await statusText(page)).toMatch(/Bitte zuerst Text/);
});

test('Klick wählt aus, Doppelklick und F2 öffnen den Editor, Esc bricht ab', async ({ page }) => {
  await clickCard(page, 1);
  expect(await selectedIndex(page)).toBe(1);

  await page.keyboard.press('F2');
  await expect(page.locator('#edit-box')).toBeVisible();
  await expect(page.locator('#edit-input')).toHaveValue('Zielgruppe: Remote-Teams');
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-box')).toBeHidden();

  await clickCard(page, 2, { clickCount: 2 });
  await expect(page.locator('#edit-box')).toBeVisible();
  await page.fill('#edit-input', 'Neuer Text');
  await page.press('#edit-input', 'Enter');
  expect((await cardTexts(page))[2]).toBe('Neuer Text');
});

test('Kontextmenü: Einträge reagieren auf Klick aufs Icon wie auf den Text', async ({ page }) => {
  for (const target of ['.ic-lead', null]) {
    await clickCard(page, 0, { button: 'right' });
    await expect(page.locator('#context-menu')).toBeVisible();
    const entry = page.locator('#context-menu button[data-action="edit"]');
    if (target) await entry.locator(target).click();
    else await entry.click({ position: { x: (await entry.boundingBox()).width - 12, y: 10 } });
    await expect(page.locator('#context-menu')).toBeHidden();
    await expect(page.locator('#edit-box'), `Klick auf ${target ?? 'Text'}`).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('Kontextmenü: Farbe, Verbinden, Löschen; Klick daneben schließt es', async ({ page }) => {
  await clickCard(page, 0, { button: 'right' });
  await page.locator('#color-row .color-dot').nth(2).click();
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].colorIndex)).toBe(2);

  await clickCard(page, 0, { button: 'right' });
  await page.locator('#context-menu button[data-action="connect"] .ic-lead').click();
  await clickCard(page, 1);
  expect(await page.evaluate(() => window.__app.connectionManager.connections.length)).toBe(1);

  await clickCard(page, 2, { button: 'right' });
  await page.mouse.click(1200, 120); // daneben
  await expect(page.locator('#context-menu')).toBeHidden();

  await clickCard(page, 2, { button: 'right' });
  await page.locator('#context-menu button[data-action="delete"]').click();
  expect(await cardCount(page)).toBe(2);
});

test('Formleiste: Icon- und Textklick setzen die Form der ausgewählten Karte', async ({ page }) => {
  const shapes = page.locator('#flow-shapes button');
  await expect(shapes.first()).toBeDisabled(); // nichts ausgewählt
  await clickCard(page, 0);
  await page.locator('#flow-shapes button[data-flow-type="decision"] .ic-lead').click();
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].flowType)).toBe('decision');
  await expect(page.locator('#flow-shapes button[data-flow-type="decision"]')).toHaveClass(/active/);
  await page.locator('#flow-shapes button[data-flow-type="end"]').click({ position: { x: 50, y: 10 } });
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].flowType)).toBe('end');
  await page.locator('#flow-shapes button[data-flow-type=""]').click();
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].flowType)).toBe(null);
});

test('Größe per +/−, begrenzt auf 0,45–2,2; Mausrad über der Karte', async ({ page }) => {
  await clickCard(page, 0);
  for (let i = 0; i < 20; i++) await page.keyboard.press('+');
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].scale)).toBe(2.2);
  for (let i = 0; i < 40; i++) await page.keyboard.press('-');
  expect(await page.evaluate(() => window.__app.cardManager.cards[0].scale)).toBe(0.45);

  const before = await page.evaluate(() => window.__app.cardManager.cards[1].scale);
  const pos = await cardOnScreen(page, 1);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.wheel(0, -100);
  expect(await page.evaluate(() => window.__app.cardManager.cards[1].scale)).toBeGreaterThan(before);
});

test('Entf löscht die ausgewählte Karte; Strg+Z holt sie zurück, Strg+Y wieder weg', async ({ page }) => {
  await clickCard(page, 1);
  await page.keyboard.press('Delete');
  expect(await cardTexts(page)).toEqual(['VR-Brainstorming-App', 'Feature: KI-Ideenassistent']);
  await page.keyboard.press('Control+z');
  expect(await cardCount(page)).toBe(3);
  await page.keyboard.press('Control+y');
  expect(await cardCount(page)).toBe(2);
  await page.click('#btn-undo');
  expect(await cardCount(page)).toBe(3);
  await page.click('#btn-redo');
  expect(await cardCount(page)).toBe(2);
});

test('Strg+Z im Eingabefeld gehört dem Textfeld, nicht dem Board', async ({ page }) => {
  await page.fill('#idea-input', 'X');
  await page.press('#idea-input', 'Enter');
  await page.fill('#idea-input', 'tippe');
  await page.press('#idea-input', 'Control+z');
  expect(await cardCount(page)).toBe(4);
});

test('Verschieben per Ziehen landet im Verlauf', async ({ page }) => {
  const pos = await cardOnScreen(page, 0);
  const before = await page.evaluate(() => window.__app.cardManager.cards[0].group.position.toArray());
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.mouse.move(pos.x + 120, pos.y + 40, { steps: 6 });
  await page.mouse.up();
  const moved = await page.evaluate(() => window.__app.cardManager.cards[0].group.position.toArray());
  expect(moved).not.toEqual(before);
  await page.keyboard.press('Control+z');
  const back = await page.evaluate(() => window.__app.cardManager.cards[0].group.position.toArray());
  back.forEach((v, i) => expect(v).toBeCloseTo(before[i], 5));
});

test('Kartenschrift schaltet durch und bleibt nach Reload', async ({ page }) => {
  await page.click('#btn-fontsize');
  await expect(page.locator('#btn-fontsize')).toHaveText('Schrift: Groß');
  await page.click('#btn-fontsize');
  await expect(page.locator('#btn-fontsize')).toHaveText('Schrift: Sehr groß');
  await page.reload();
  await page.waitForFunction(() => window.__app?.cardManager, null, { timeout: 90_000 });
  await expect(page.locator('#btn-fontsize')).toHaveText('Schrift: Sehr groß');
  await page.click('#btn-fontsize');
  await expect(page.locator('#btn-fontsize')).toHaveText('Schrift: Normal');
});

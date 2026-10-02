// KI-Funktionen über den Mock-Proxy, plus Fehlerpfade mit abgefangenen
// Anfragen. Es geht nie etwas an die echte API (siehe playwright.config.js).
import { test, expect, openApp, cardCount, cardTexts, clickCard, runAiAction, statusText } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('Verwandte Ideen, Kritiker, Zusammenfassen zur ausgewählten Karte', async ({ page }) => {
  await clickCard(page, 0);
  await runAiAction(page, '#btn-related');
  expect(await cardCount(page)).toBe(7);
  expect(await statusText(page)).toMatch(/4 neue Ideen zu „VR-Brainstorming-App“/);

  await runAiAction(page, '#btn-critic');
  expect(await cardCount(page)).toBe(11);
  const critics = await page.evaluate(() =>
    window.__app.cardManager.cards.filter((c) => c.text.startsWith('Mock-Kritik')).map((c) => c.colorIndex)
  );
  expect(critics).toEqual([4, 4, 4, 4]); // rot

  await runAiAction(page, '#btn-summary');
  const summary = await page.evaluate(() => {
    const c = window.__app.cardManager.cards.at(-1);
    return { text: c.text, scale: c.scale, color: c.colorIndex };
  });
  expect(summary).toEqual({ text: expect.stringMatching(/^Mock-Zusammenfassung/), scale: 1.7, color: 6 });
});

test('ohne Auswahl: Hinweis statt Anfrage', async ({ page }) => {
  let calls = 0;
  page.on('request', (r) => r.url().includes('/api/generate') && calls++);
  await page.click('#btn-related');
  expect(await statusText(page)).toMatch(/zuerst eine Karte auswählen/);
  await page.click('#btn-critic');
  expect(calls).toBe(0);
});

test('Themen-Start nimmt das Thema aus dem Eingabefeld', async ({ page }) => {
  let sent;
  page.on('request', (r) => {
    if (r.url().includes('/api/generate')) sent = r.postDataJSON();
  });
  await page.fill('#idea-input', 'Gartenparty');
  await runAiAction(page, '#btn-topic');
  expect(sent).toMatchObject({ action: 'topic', topic: 'Gartenparty', ideas: expect.any(Array) });
  expect((await cardTexts(page)).filter((t) => t.startsWith('Mock'))).toHaveLength(8);
  await expect(page.locator('#idea-input')).toHaveValue('');
});

test('Cluster: Titelkarten, Einfärbung, ein Undo-Schritt', async ({ page }) => {
  await page.fill('#idea-input', 'Vierte');
  await page.press('#idea-input', 'Enter');
  await runAiAction(page, '#btn-cluster');
  const r = await page.evaluate(() =>
    window.__app.cardManager.cards.map((c) => ({ text: c.text, color: c.colorIndex }))
  );
  expect(r.filter((c) => c.text.startsWith('📌'))).toHaveLength(2);
  expect(new Set(r.filter((c) => !c.text.startsWith('📌')).map((c) => c.color)).size).toBe(2);
  await page.click('#btn-undo');
  expect(await cardCount(page)).toBe(4);
});

test('Prozess aus Text: Knoten, Pfeile, Beschriftungen; ersetzt den alten Prozess; Mermaid-Export', async ({ page }) => {
  await page.fill('#idea-input', 'Urlaubsantrag');
  await runAiAction(page, '#btn-flow');
  const count = () =>
    page.evaluate(() => ({
      nodes: window.__app.cardManager.cards.filter((c) => c.flowType).length,
      ideas: window.__app.cardManager.cards.filter((c) => !c.flowType).length,
      arrows: window.__app.connectionManager.connections.filter((c) => c.directed).length,
      labels: window.__app.connectionManager.connections.map((c) => c.label).filter(Boolean).sort(),
    }));
  expect(await count()).toEqual({ nodes: 6, ideas: 3, arrows: 6, labels: ['ja', 'nein'] });

  // Zweiter Durchlauf ersetzt, statt zu verdoppeln; Ideenkarten bleiben.
  await page.fill('#idea-input', 'Nochmal');
  await runAiAction(page, '#btn-flow');
  expect(await count()).toEqual({ nodes: 6, ideas: 3, arrows: 6, labels: ['ja', 'nein'] });

  const download = page.waitForEvent('download');
  await page.click('#btn-mermaid');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^prozess-.*\.mmd$/);
  const text = await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
  expect(text.split('\n')[0]).toBe('flowchart LR');
  expect(text).toContain('-->|"ja"|');
  expect(text.match(/-->/g)).toHaveLength(6);
});

test('Whiteboard-Skizze → Karten (Vision-Mock); leeres Whiteboard fragt nicht an', async ({ page }) => {
  let sent = null;
  page.on('request', (r) => {
    if (r.url().includes('/api/generate')) sent = r.postDataJSON();
  });
  await page.evaluate(() => window.__app.handleAction('sketch'));
  expect(await statusText(page)).toMatch(/Whiteboard ist leer/);
  expect(sent).toBe(null);

  await page.evaluate(async () => {
    const { whiteboard, handleAction } = window.__app;
    whiteboard.setVisible(true);
    whiteboard.strokeStart({ x: 0.3, y: 0.5 });
    whiteboard.strokeMove({ x: 0.6, y: 0.6 });
    whiteboard.strokeEnd();
    await handleAction('sketch');
  });
  expect(sent.action).toBe('whiteboard');
  expect(Buffer.from(sent.image, 'base64').subarray(1, 4).toString()).toBe('PNG');
  expect((await cardTexts(page)).filter((t) => t.startsWith('Skizze:'))).toHaveLength(3);
});

test.describe('Fehlerpfade', () => {
  async function failWith(page, handler) {
    let calls = 0;
    await page.route('**/api/generate', (route) => {
      calls++;
      return handler(route);
    });
    await clickCard(page, 0);
    await page.click('#btn-related');
    await page.waitForFunction(() => window.__app.hud.errorPanel.mesh.visible, null, { timeout: 60_000 });
    return calls;
  }

  test('500: drei Versuche, dann Fehlerkarte mit Servermeldung; Esc schließt', async ({ page }) => {
    const calls = await failWith(page, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Testfehler 500"}' })
    );
    expect(calls).toBe(3);
    expect(await statusText(page)).toBe('Fehler: Testfehler 500');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__app.hud.errorPanel.mesh.visible)).toBe(false);
  });

  test('400: kein Wiederholversuch', async ({ page }) => {
    const calls = await failWith(page, (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"selectedIdea fehlt."}' })
    );
    expect(calls).toBe(1);
  });

  test('Server weg: Klartext, danach ist die App wieder bedienbar', async ({ page }) => {
    await failWith(page, (route) => route.abort('connectionrefused'));
    expect(await statusText(page)).toMatch(/Server nicht erreichbar/);
    await expect(page.locator('#status-band')).not.toHaveClass(/busy/);
    await page.unroute('**/api/generate');
    await runAiAction(page, '#btn-related');
    expect(await cardCount(page)).toBe(7);
  });

  test('während eine Anfrage läuft, startet keine zweite', async ({ page }) => {
    let release;
    let calls = 0;
    await page.route('**/api/generate', async (route) => {
      calls++;
      await new Promise((resolve) => (release = resolve));
      await route.continue();
    });
    await clickCard(page, 0);
    await page.click('#btn-related');
    await expect(page.locator('#status-band')).toHaveClass(/busy/);
    await page.click('#btn-critic');
    expect(await statusText(page)).toMatch(/Claude arbeitet noch/);
    release();
    await expect(page.locator('#status-band')).not.toHaveClass(/busy/);
    expect(calls).toBe(1);
  });
});

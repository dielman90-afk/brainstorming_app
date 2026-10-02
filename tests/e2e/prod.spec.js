// Smoke-Test gegen den Produktions-Build (`vite build` + `vite preview`).
//
// Eigenes Projekt in playwright.config.js, weil Dev-Server und Build sich
// unterscheiden können: Der Startabsturz vom September (`_floorY` vor seiner
// Deklaration) trat nur am Dev-Server auf – im Build machte der Minifier aus
// dem `let` ein `var`. Was auf die Brille geht, ist der Build.
import { test, expect, openApp, cardCount, clickCard, runAiAction, statusText } from './fixtures.js';

test('Build: Erststart, Baustand, KI über den Proxy, Autosave', async ({ page }) => {
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));

  await openApp(page);
  expect(await cardCount(page)).toBe(3);
  await expect(page.locator('#build-stamp')).toHaveText(/^Baustand \S+ · \d{4}-\d{2}-\d{2}$/);
  // Schriften und Assets kommen aus dem Build, nicht von einem CDN.
  expect(await page.evaluate(() => document.fonts.check('600 16px Sora'))).toBe(true);

  await clickCard(page, 0);
  await runAiAction(page, '#btn-related');
  expect(await cardCount(page)).toBe(7);
  expect(await statusText(page)).toMatch(/neue Ideen/);

  await page.waitForFunction(
    () => (JSON.parse(localStorage.getItem('webxr-brainstorming-board') ?? '{}').cards ?? []).length === 7,
    null,
    { timeout: 15_000 }
  );
  expect(failed).toEqual([]);
});

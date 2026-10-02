// Gemeinsame Bausteine der Browser-Tests.
//
// Die App stellt für Tests bereits alles über `window.__app` bereit (siehe
// Ende von src/main.js). Jeder Test bekommt einen frischen Browser-Kontext und
// damit einen leeren localStorage – also einen echten Erststart.
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  // Jeder Test endet mit der Prüfung, dass kein unbehandelter Fehler auf der
  // Seite auftrat. Absichtlich provozierte KI-Fehler landen nicht hier – die
  // fängt die App selbst und zeigt eine Fehlerkarte.
  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      expect(errors, 'unbehandelte Fehler auf der Seite').toEqual([]);
    },
    { auto: true },
  ],
});

// App laden und warten, bis `window.__app` steht. Mit `board` wird vorher ein
// gespeichertes Board in den localStorage gelegt (Rohtext oder Objekt).
export async function openApp(page, { board } = {}) {
  if (board !== undefined) {
    const raw = typeof board === 'string' ? board : JSON.stringify(board);
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('e2e-seeded')) {
        localStorage.setItem('webxr-brainstorming-board', value);
        sessionStorage.setItem('e2e-seeded', '1');
      }
    }, raw);
  }
  await page.goto('/');
  await page.waitForFunction(() => window.__app?.cardManager, null, { timeout: 90_000 });
}

export const cardCount = (page) => page.evaluate(() => window.__app.cardManager.cards.length);
export const cardTexts = (page) => page.evaluate(() => window.__app.cardManager.cards.map((c) => c.text));
export const statusText = (page) => page.textContent('#status');

// Bildschirmposition (CSS-Pixel) der Kartenmitte mit Index `index`.
export function cardOnScreen(page, index) {
  return page.evaluate((i) => {
    const { cardManager, camera, renderer, scene } = window.__app;
    scene.updateMatrixWorld(true);
    const v = cardManager.cards[i].group.getWorldPosition(camera.position.clone());
    v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, index);
}

export async function clickCard(page, index, options) {
  const { x, y } = await cardOnScreen(page, index);
  await page.mouse.click(x, y, options);
}

// Warten, bis keine KI-Anfrage mehr läuft (Ladeanzeige im Status-Band aus).
export async function waitIdle(page) {
  await page.waitForFunction(() => !document.getElementById('status-band').classList.contains('busy'), null, {
    timeout: 60_000,
  });
}

// Eine Aktion auslösen, deren Ergebnis über die KI kommt, und bis zum Ende
// warten. Die App setzt „busy" noch im Klick-Handler, das Warten danach
// erwischt also immer die laufende Anfrage.
export async function runAiAction(page, buttonSelector) {
  await page.click(buttonSelector);
  await waitIdle(page);
}

// n Bilder der App-Schleife abwarten.
export function frames(page, n = 2) {
  return page.evaluate(
    (k) =>
      new Promise((resolve) => {
        let i = 0;
        const tick = () => (++i >= k ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n
  );
}

// Drei Karten über das Eingabefeld anlegen.
export async function addCards(page, texts) {
  for (const text of texts) {
    await page.fill('#idea-input', text);
    await page.press('#idea-input', 'Enter');
  }
}

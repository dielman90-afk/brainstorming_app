// Alles, was an der Zeit hängt: Gehtempo und Timebox.
//
// Unter SwiftShader rendert die App 10–20 Bilder/s, auf CI-Rechnern auch mal
// weniger, und sie kappt die Bildzeit bei 0,1 s. Ein Vergleich gegen die
// Wanduhr wäre damit ein Glücksspiel. Gemessen wird deshalb die Zeit, die die
// App selbst gesehen hat: Bild für Bild über requestAnimationFrame, mit
// derselben Kappung. (Playwrights `page.clock` taugt dafür nicht – es fälscht
// performance.now, die Bilder laufen aber in Echtzeit weiter.)
import { test, expect, openApp } from './fixtures.js';

// Im Browser `ms` lang mitlaufen und die Spielzeit (Summe der gekappten
// Bildzeiten) samt einer Messgröße am Anfang und am Ende liefern.
function measure(page, ms, probe) {
  return page.evaluate(
    ({ ms, probe }) =>
      new Promise((resolve) => {
        const read = new Function(`return (${probe})()`);
        const begin = read();
        let last = performance.now();
        let gameTime = 0;
        const stopAt = last + ms;
        const tick = (now) => {
          gameTime += Math.min(0.1, (now - last) / 1000);
          last = now;
          if (now < stopAt) requestAnimationFrame(tick);
          else resolve({ begin, end: read(), gameTime });
        };
        requestAnimationFrame(tick);
      }),
    { ms, probe: probe.toString() }
  );
}

const cameraXZ = () => {
  const p = window.__app.camera.getWorldPosition(window.__app.camera.position.clone());
  return { x: p.x, z: p.z };
};

test('WASD: 3,4 m/s am Desktop (nicht doppelt)', async ({ page }) => {
  await openApp(page);
  await page.mouse.click(1100, 700); // Fokus aufs Board, nicht ins Eingabefeld
  await page.keyboard.down('KeyW');
  const { begin, end, gameTime } = await measure(page, 1500, cameraXZ);
  await page.keyboard.up('KeyW');
  const speed = Math.hypot(end.x - begin.x, end.z - begin.z) / gameTime;
  expect(gameTime).toBeGreaterThan(0.3);
  expect(speed).toBeGreaterThan(2.6);
  expect(speed).toBeLessThan(4.4);
});

test('WASD bewegt nicht, solange im Eingabefeld getippt wird', async ({ page }) => {
  await openApp(page);
  await page.focus('#idea-input');
  await page.keyboard.down('KeyW');
  const { begin, end } = await measure(page, 800, cameraXZ);
  await page.keyboard.up('KeyW');
  expect(Math.hypot(end.x - begin.x, end.z - begin.z)).toBeLessThan(1e-6);
});

test('Timebox zählt weiter, auch wenn sie ausgeblendet ist', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-timer');
  await page.evaluate(() => {
    window.__app.timer.setDuration(60);
    window.__app.timer.toggleRun();
  });
  await page.click('#btn-timer'); // ausblenden
  expect(await page.evaluate(() => window.__app.timer.group.visible)).toBe(false);
  const { begin, end, gameTime } = await measure(page, 2000, () => window.__app.timer.remainingSec);
  expect(gameTime).toBeGreaterThan(0.5);
  expect(begin - end).toBeGreaterThan(gameTime * 0.7);
  expect(begin - end).toBeLessThan(gameTime * 1.3 + 0.1);
});

test('Timebox endet bei null und hält an', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-timer');
  await page.evaluate(() => {
    window.__app.timer.setDuration(1);
    window.__app.timer.toggleRun();
  });
  await page.waitForFunction(() => window.__app.timer.remainingSec === 0, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__app.timer.running)).toBe(false);
});

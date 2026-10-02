// Die fünf Umgebungen. Unter SwiftShader ist das der teuerste Teil der Suite
// (das Dojo braucht Sekunden pro Bild) – daher wenige, gezielte Bilder.
//
// Umgebungen werden über ihre `id` gesucht, nicht über ihre Eigenschaften:
// Neuere Stände bauen eine Umgebung erst beim ersten Zugriff, und ein
// `find(e => e.walk…)` würde dann alle fünf auf einmal bauen.
import { test, expect, openApp, frames } from './fixtures.js';

test.describe.configure({ timeout: 240_000 });

test('Umgebungsknopf schaltet alle fünf Welten durch und zurück auf den Desktop', async ({ page }) => {
  await openApp(page);
  // Jede Statusmeldung mitschreiben: Sie verschwindet nach 3,5 s, und ein
  // Dojo-Bild dauert unter SwiftShader länger – nachträglich lesen wäre Zufall.
  await page.evaluate(() => {
    window.__messages = [];
    const el = document.getElementById('status');
    new MutationObserver(() => el.textContent && window.__messages.push(el.textContent)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await page.click('#btn-env');
    await frames(page, 2);
    seen.push(
      await page.evaluate(() => {
        const { env } = window.__app;
        return env.current() < 0 ? 'desktop' : env.environments[env.current()].id;
      })
    );
  }
  expect(seen).toEqual(['island', 'night', 'zen', 'matrix', 'dojo', 'desktop']);
  const messages = await page.evaluate(() => window.__messages);
  expect(messages).toEqual([
    expect.stringMatching(/Himmelsinsel aktiv\.$/),
    expect.stringMatching(/Nachthimmel aktiv\.$/),
    expect.stringMatching(/Zen-Garten aktiv\.$/),
    expect.stringMatching(/Konstrukt aktiv\.$/),
    expect.stringMatching(/Dojo aktiv\.$/),
    'Weißer Hintergrund aktiv.',
  ]);
});

test('Nachthimmel (Planet): neue Karten, Tafel und Zone stehen auf Augenhöhe vor dem Nutzer', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { env, cardManager, whiteboard, zoneManager, camera, handleAction } = window.__app;
    const k = env.environments.findIndex((e) => e.id === 'night');
    while (env.current() !== k) env.cycle();
    // Ein paar Bilder, bis die Bodenhöhe übernommen ist.
    for (let i = 0; i < 5; i++) await new Promise((res) => requestAnimationFrame(res));
    const card = cardManager.spawnIdeas(['Planetentest'], camera)[0];
    await handleAction('whiteboard');
    await handleAction('zone');
    const cam = camera.getWorldPosition(camera.position.clone());
    const rel = (g) => {
      const p = g.getWorldPosition(cam.clone());
      return { dy: p.y - cam.y, d: Math.hypot(p.x - cam.x, p.z - cam.z) };
    };
    return { floor: env.floorY(), card: rel(card.group), board: rel(whiteboard.group), zone: rel(zoneManager.zones[0].group) };
  });
  expect(r.floor).toBeGreaterThan(20); // wirklich auf der Kugel
  for (const [name, { dy, d }] of Object.entries({ card: r.card, board: r.board, zone: r.zone })) {
    expect(Math.abs(dy), `${name}: Höhe zum Auge`).toBeLessThan(0.8);
    expect(d, `${name}: Abstand`).toBeGreaterThan(0.8);
    expect(d, `${name}: Abstand`).toBeLessThan(3.0);
  }
});

test('Dojo: Desktop-Kamera bleibt im begehbaren Bereich', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(async () => {
    const { env, camera, controls } = window.__app;
    const k = env.environments.findIndex((e) => e.id === 'dojo');
    while (env.current() !== k) env.cycle();
    for (let i = 0; i < 3; i++) await new Promise((res) => requestAnimationFrame(res));
    // Weit hinaus „teleportieren": Die Sperre muss die Kamera zurückholen.
    camera.position.x += 40;
    controls.target.x += 40;
    for (let i = 0; i < 3; i++) await new Promise((res) => requestAnimationFrame(res));
    const p = camera.getWorldPosition(camera.position.clone());
    const out = { x: NaN, z: NaN };
    env.walk().limit(p.x, p.z, out);
    return { dx: Math.abs(out.x - p.x), dz: Math.abs(out.z - p.z), x: p.x };
  });
  expect(r.x).toBeLessThan(30);
  expect(r.dx + r.dz).toBeLessThan(1e-6);
});

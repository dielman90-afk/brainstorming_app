// **Läuft die Uhr des Laubes auf der Insel?**
//
//   node tools/laubuhr.mjs
//
// `foliageMaterial()` legt die Zeit in `uniforms.uTime` ab, und das Einzige,
// was diesen Wert hochzaehlt, ist `updateFoliage(time)`. Wer die Karten
// benutzt, ohne es aufzurufen, bekommt reglos aufgeklebtes Laub — die Warnung
// steht woertlich im Quelltext des Zen-Gartens.
//
// Gemessen wird nicht der Quelltext, sondern der laufende Stand: Die Uhr der
// Umgebung wird auf zwei Zeitpunkte gestellt und `uTime` danach ausgelesen.
//
// Der zweite Teil misst die Wirkung im Bild: Zwei Zeitpunkte, ein Kronenkasten,
// und der Anteil der Bildpunkte, die sich unterscheiden. Ein laufender Uniform
// ist noch keine sichtbare Bewegung — Voegel und Wolken werden dafuer
// ausgeblendet, damit nur das Laub uebrig bleibt.
import { PNG } from 'pngjs';
import { startServer, launchBrowser, openApp, selectEnv, lockCamera, shotsFor } from './harness-common.mjs';

const KRONE = [950, 150, 1250, 450];

const setzeZeit = (page, id, t) =>
  page.evaluate(
    ({ id, t }) => {
      const env = window.__app.env.environments.find((e) => e.id === id);
      const original = (env.__originalUpdate ??= env.update);
      env.update = () => original(t);
      original(t);
    },
    { id, t }
  );

const uhren = (page, gruppe) =>
  page.evaluate((gruppe) => {
    const g = window.__app.scene.children.find((c) => c.name === gruppe);
    const werte = new Set();
    let n = 0;
    g.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        const u = m.userData?.uniforms?.uTime;
        if (!u) continue;
        n++;
        werte.add(u.value);
      }
    });
    return { n, werte: [...werte] };
  }, gruppe);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  for (const [id, gruppe] of [['island', 'env-island'], ['zen', 'env-zen']]) {
    await selectEnv(page, id);
    process.stdout.write(`${id}\n`);
    for (const t of [10, 25, 40]) {
      await setzeZeit(page, id, t);
      const { n, werte } = await uhren(page, gruppe);
      process.stdout.write(
        `  Umgebungszeit ${String(t).padStart(3)} s  ->  ${n} Laubwerkstoffe, uTime = ${werte.map((v) => v.toFixed(2)).join(', ')}\n`
      );
    }
  }

  // --- Zweiter Teil: sieht man es? ------------------------------------------
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island').find((s) => s.name === '5-backlight'), 6.0);
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.name === 'birds' || o.name === 'butterflies') o.visible = false;
    });
  });
  const bilder = [];
  // 1/72 s ist der Bildabstand auf der Quest. Was sich von Bild zu Bild um
  // mehrere Luminanzstufen aendert, ist kein Wind mehr, sondern Flimmern —
  // genau der Fehler, der die Nadeln schon einmal ein ganzes Paket gekostet hat.
  for (const t of [20, 20 + 1 / 72, 20.5, 22]) {
    await setzeZeit(page, 'island', t);
    await page.waitForTimeout(320);
    bilder.push(PNG.sync.read(await page.screenshot()));
  }
  const vergleich = (a, b) => {
    let n = 0;
    let summe = 0;
    let flaeche = 0;
    for (let y = KRONE[1]; y <= KRONE[3]; y++)
      for (let x = KRONE[0]; x <= KRONE[2]; x++) {
        const p = (y * a.width + x) * 4;
        flaeche++;
        const d = Math.max(
          Math.abs(a.data[p] - b.data[p]),
          Math.abs(a.data[p + 1] - b.data[p + 1]),
          Math.abs(a.data[p + 2] - b.data[p + 2])
        );
        summe += d;
        if (d >= 3) n++;
      }
    return [(n * 100) / flaeche, summe / flaeche];
  };
  const zeile = (name, a, b) => {
    const [anteil, mittel] = vergleich(a, b);
    return `  ${name.padEnd(22)} ${anteil.toFixed(2).padStart(6)} % der Bildpunkte geaendert, mittlerer Betrag ${mittel.toFixed(2)}\n`;
  };
  process.stdout.write(
    `\nKronenkasten (${KRONE.join(',')}) in 5-backlight, Voegel und Falter ausgeblendet:\n` +
      zeile('20,0 s gegen +1/72 s', bilder[0], bilder[1]) +
      zeile('20,0 s gegen 20,5 s', bilder[0], bilder[2]) +
      zeile('20,0 s gegen 22,0 s', bilder[0], bilder[3])
  );
} finally {
  await browser.close();
  await server.stop();
}

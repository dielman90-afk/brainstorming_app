// **Wie viel Leben ist im Teich wirklich zu sehen?**
//
//   node tools/teichleben.mjs [--env zen] [shot …]
//
// Prüferbefund 17 der zweiten Runde lautete „kaum Leben unter Wasser". Das ist
// eine Behauptung über Bildpunkte, und differenziell nachprüfbar: Jede
// Lebensregung im Teich einzeln abschalten, Bild vergleichen, zählen.
//
// Gemessen werden je Kamera Fläche in Bildpunkten und mittlere Abweichung — die
// Fläche sagt, ob man etwas sieht, die Abweichung, ob es sich vom Wasser
// abhebt. Ein Fisch, der 300 Bildpunkte gross ist und sich um zwei Stufen vom
// Wasser unterscheidet, ist nicht da.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env');

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Was im Teich lebt oder schwimmt. Namen wie im Baum.
const SACHEN = ['zen-koi-0', 'zen-koi-1', 'zen-seerosen', 'zen-teichringe'];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const alle = shotsFor(ENV);
  const shots = rest.length ? alle.filter((s) => rest.includes(s.name)) : alle;

  // Erst nachsehen, was es überhaupt gibt — ein Name, den es nicht gibt, misst
  // sonst still eine Null und liest sich wie ein Befund.
  const vorhanden = await page.evaluate(
    ({ gruppe, namen }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      const da = [];
      g.traverse((o) => {
        if (namen.includes(o.name) && !da.includes(o.name)) da.push(o.name);
      });
      return da;
    },
    { gruppe: `env-${ENV}`, namen: SACHEN }
  );
  const fehlt = SACHEN.filter((n) => !vorhanden.includes(n));
  if (fehlt.length) process.stdout.write(`Nicht in der Szene: ${fehlt.join(', ')}\n\n`);

  const sichtbar = (name, an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.visible = an;
        });
      },
      { an, name, gruppe: `env-${ENV}` }
    );
  const bild = async () => {
    await page.waitForTimeout(350);
    return PNG.sync.read(await page.screenshot());
  };

  for (const shot of shots) {
    await lockCamera(page, shot, 6.0);
    const mit = await bild();
    process.stdout.write(`${shot.name}\n`);
    for (const name of vorhanden) {
      await sichtbar(name, false);
      const ohne = await bild();
      await sichtbar(name, true);
      let n = 0;
      let summe = 0;
      for (let i = 0; i < mit.data.length; i += 4) {
        const d =
          Math.abs(mit.data[i] - ohne.data[i]) +
          Math.abs(mit.data[i + 1] - ohne.data[i + 1]) +
          Math.abs(mit.data[i + 2] - ohne.data[i + 2]);
        if (d < 6) continue;
        n++;
        summe += Math.abs(
          lum(mit.data[i], mit.data[i + 1], mit.data[i + 2]) -
            lum(ohne.data[i], ohne.data[i + 1], ohne.data[i + 2])
        );
      }
      process.stdout.write(
        `   ${name.padEnd(16)} ${String(n).padStart(6)} px   ` +
          `Abhebung ${(n ? summe / n : 0).toFixed(1).padStart(5)} Stufen\n`
      );
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

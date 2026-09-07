// **Wie viel nackter Stamm steht unter der Krone?**
//
//   node tools/lutscher.mjs <shot> <x0> <x1>
//
// Der Pruefer nennt die Laubbaeume „Lutscher": eine runde Masse auf einem
// langen kahlen Stiel. Das ist ein Verhaeltnis und damit messbar — man braucht
// nur die beiden Masken getrennt.
//
// Gemessen wird im angegebenen Spaltenbereich, differenziell ueber das Ein- und
// Ausblenden von `island-holz` und `island-laub`: die Hoehe, ueber die nur Holz
// steht, gegen die Gesamthoehe des Baums. Ein Laubbaum in der Natur liegt bei
// einem Viertel bis zwei Fuenfteln.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'island');
const rest = argv.filter((a, i) => a !== '--env' && argv[i - 1] !== '--env');
const shotName = rest[0];
const X0 = +rest[1];
const X1 = +rest[2];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shotsFor(ENV).find((s) => s.name === shotName), 6.0);
  const schalt = (name, an) =>
    page.evaluate(({ name, an }) => {
      let n = 0;
      window.__app.scene.traverse((o) => {
        if (o.isMesh && o.name === name) {
          o.visible = an;
          n++;
        }
      });
      return n;
    }, { name, an });

  await page.waitForTimeout(320);
  const alle = PNG.sync.read(await page.screenshot());
  const maske = async (name, bisY = 1e9) => {
    await schalt(name, false);
    await page.waitForTimeout(320);
    const ohne = PNG.sync.read(await page.screenshot());
    await schalt(name, true);
    // **Perzentile statt Extremwerte.**
    //
    // Zwei Anlaeufe daneben: Das blosse Minimum und Maximum von y nimmt einen
    // Busch hinter dem Stamm mit und rechnete den nackten Stiel auf 0,0
    // Prozent. Eine Deckungsschwelle von vierzig Prozent je Zeile misst
    // stattdessen nur den dichten Kern der Krone und laesst ihren ganzen
    // aeusseren Bereich weg — auch nicht die gesuchte Groesse.
    //
    // Gemessen wird deshalb ueber die Verteilung: Ober- und Unterkante sind
    // das 2. und das 96. Perzentil der y-Werte aller Maskenpunkte. Ein Busch
    // mit ein paar hundert Punkten verschiebt das 96. Perzentil nicht, eine
    // Krone mit Tausenden schon.
    const ys = [];
    for (let y = 0; y < alle.height; y++)
      for (let x = X0; x <= X1; x++) {
        const i = (y * alle.width + x) * 4;
        const d =
          Math.abs(alle.data[i] - ohne.data[i]) +
          Math.abs(alle.data[i + 1] - ohne.data[i + 1]) +
          Math.abs(alle.data[i + 2] - ohne.data[i + 2]);
        if (d > 12 && y <= bisY) ys.push(y);
      }
    if (!ys.length) return { n: 0, oben: 0, unten: 0 };
    ys.sort((a, b) => a - b);
    return {
      n: ys.length,
      oben: ys[Math.floor(ys.length * 0.02)],
      unten: ys[Math.floor(ys.length * 0.96)],
    };
  };
  const holz = await maske('island-holz');
  // **Laub unterhalb des Stammfusses gehoert nicht zu diesem Baum.**
  // Ein Busch hinter dem Stamm reicht sonst tiefer als der Baum selbst und
  // rechnet den nackten Stiel auf null. Die Laubmasken werden deshalb an der
  // Standlinie abgeschnitten.
  const laub = await maske('island-laub', holz.unten);
  const krone = await maske('island-krone', holz.unten);
  const laubOben = Math.min(laub.oben, krone.oben);
  const laubUnten = Math.max(laub.unten, krone.unten);
  const gesamt = Math.max(holz.unten, laubUnten) - Math.min(holz.oben, laubOben) + 1;
  const kahl = Math.max(0, holz.unten - laubUnten);
  process.stdout.write(
    `${shotName}, Spalten ${X0}…${X1}\n\n` +
      `  Holz   ${String(holz.n).padStart(6)} px   y ${holz.oben}…${holz.unten}\n` +
      `  Laub   ${String(laub.n).padStart(6)} px   y ${laub.oben}…${laub.unten}\n` +
      `  Kronen ${String(krone.n).padStart(6)} px   y ${krone.oben}…${krone.unten}\n\n` +
      `  Gesamthoehe ${gesamt} px, davon nackter Stamm ${kahl} px = ${((kahl * 100) / gesamt).toFixed(1)} %\n`
  );
} finally {
  await browser.close();
  await server.stop();
}

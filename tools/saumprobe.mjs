// **Was kostet es, den Himmelssaum vom Laub zu nehmen?**
//
//   node tools/saumprobe.mjs
//
// `addSkyRim` legt seine Staerke als Uniform ab (`material.userData.shader`),
// laesst sich also zur Laufzeit verstellen. Gemessen wird je Einstellung
// zweierlei, weil es sich widersprechen kann:
//
//   * **Saum im Innern** — der Befund des Pruefers. Anteil der Laubpixel mit
//     B ueber R+30, die keinen Nachbarn ausserhalb des Laubs haben.
//   * **Silhouettenkontrast** — der Grund, aus dem der Saum einmal
//     hinzugefuegt wurde. Mittlerer Sprung ueber die Kronenkante gegen den
//     Himmel.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';
import { PNG } from 'pngjs';

const KASTEN = [630, 555, 790, 670];
// Zwei Silhouettenkaesten, weil zwei verschiedene Koerper Kontur bilden:
// die Konifere rechts (Nadelkarten) und die Laubkrone links (Huellkoerper
// plus Blattkarten).
const KANTE = [950, 150, 1250, 450];
const KANTE2 = [340, 350, 490, 440];
const shot = shotsFor('island').find((s) => s.name === '5-backlight');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);

  // Nach Gruppen getrennt: `addSkyRim` sitzt auf der Insel an vier Stellen
  // mit vier verschiedenen Ausgangswerten, und ein Rundumschlag ueber alle
  // Materialien misst nur die Summe. Der Schluessel ist das Wertepaar
  // (Staerke, Exponent) beim ersten Antreffen.
  const gruppen = () =>
    page.evaluate(() => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      const zaehler = {};
      g.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          const u = m.userData?.shader?.uniforms;
          if (!u?.rimStrength) continue;
          if (m.userData.__saumAlt === undefined) m.userData.__saumAlt = u.rimStrength.value;
          const k = `${m.userData.__saumAlt.toFixed(2)}/${u.rimPower.value.toFixed(1)}`;
          zaehler[k] = (zaehler[k] || 0) + 1;
        }
      });
      return zaehler;
    });

  // Setzt EINE Gruppe auf `wert`, alle anderen auf ihren Ausgangswert.
  const stelle = (schluessel, wert) =>
    page.evaluate(
      ([schluessel, wert]) => {
        const g = window.__app.scene.children.find((c) => c.name === 'env-island');
        let n = 0;
        g.traverse((o) => {
          const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          for (const m of mats) {
            const u = m.userData?.shader?.uniforms;
            if (!u?.rimStrength) continue;
            if (m.userData.__saumAlt === undefined) m.userData.__saumAlt = u.rimStrength.value;
            const k = `${m.userData.__saumAlt.toFixed(2)}/${u.rimPower.value.toFixed(1)}`;
            if (k === schluessel) {
              u.rimStrength.value = wert;
              n++;
            } else {
              u.rimStrength.value = m.userData.__saumAlt;
            }
          }
        });
        return n;
      },
      [schluessel, wert]
    );

  const messen = async (name, n) => {
    await page.waitForTimeout(400);
    const p = PNG.sync.read(await page.screenshot());
    const at = (x, y) => {
      const i = (y * p.width + x) * 4;
      return [p.data[i], p.data[i + 1], p.data[i + 2]];
    };
    const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const istLaub = (x, y) => {
      const c = at(x, y);
      return !(c[2] > c[0] + 18 && L(c) > 120);
    };
    let laub = 0;
    let innen = 0;
    for (let y = KASTEN[1] + 1; y <= KASTEN[3] - 1; y++) {
      for (let x = KASTEN[0] + 1; x <= KASTEN[2] - 1; x++) {
        if (!istLaub(x, y)) continue;
        laub++;
        const c = at(x, y);
        if (!(c[2] > c[0] + 30)) continue;
        let offen = false;
        for (let dy = -1; dy <= 1 && !offen; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && !istLaub(x + dx, y + dy)) {
              offen = true;
              break;
            }
          }
        if (!offen) innen++;
      }
    }
    // Silhouettenkontrast: Spruenge ueber die Grenze Laub/Himmel.
    const sprung = (k) => {
      let summe = 0;
      let kanten = 0;
      for (let y = k[1]; y <= k[3]; y++) {
        for (let x = k[0]; x < k[2]; x++) {
          if (istLaub(x, y) !== istLaub(x + 1, y)) {
            summe += Math.abs(L(at(x, y)) - L(at(x + 1, y)));
            kanten++;
          }
        }
      }
      return [summe / Math.max(1, kanten), kanten];
    };
    const [mN, kN] = sprung(KANTE);
    const [mL, kL] = sprung(KANTE2);
    console.log(
      `  ${name.padEnd(14)} (${String(n).padStart(2)} Mat)  Saum innen ${((innen * 100) / laub).toFixed(2).padStart(5)} Pp` +
        `   Konifere ${mN.toFixed(1).padStart(5)} (${String(kN).padStart(3)})` +
        `   Laubkrone ${mL.toFixed(1).padStart(5)} (${String(kL).padStart(3)})`
    );
  };

  console.log('5-backlight');
  // Die Uniformen sind erst nach dem ERSTEN Bild erreichbar: `onBeforeCompile`
  // laeuft beim ersten Rendern, und `lockCamera` allein loest keines aus.
  // Darum steht die Grundlinie vor der Gruppenermittlung.
  await messen('Stand', 0);
  const z = await gruppen();
  console.log(`  Gruppen: ${JSON.stringify(z)}`);
  for (const k of Object.keys(z)) {
    const n = await stelle(k, 0);
    await messen(`ohne ${k}`, n);
  }
  await stelle('-', 0);
  await messen('Stand erneut', 0);
} finally {
  await browser.close();
  await server.stop();
}

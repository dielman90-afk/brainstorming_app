// **Der leuchtende Saum auf der Gratlinie, als Zahl über einem Parameterfeld.**
//
// Der Befund steht seit drei Durchläufen: ein bis drei Bildpunkte über der
// Geländekante liegt ein neutralgrauer Faden, drei- bis vierfach heller als
// Himmel und Boden, die er trennt. Gemessen ist auch schon, was er **nicht**
// ist — weder Staub noch Staubteufel noch Kontaktverdunklung noch Brocken —,
// und was er ist: die beleuchtete Bodenfläche selbst, durch ein Lichtleck der
// Schattenkarte. `normalBias` verschiebt den Abtastpunkt entlang der Normale,
// und an einer Kante greift diese Verschiebung über den Grat.
//
// Der erste Durchgang hat nur `normalBias` durchgefahren und eine Wanne
// gefunden (0,025 → 165 Pixel). Aber die Schattenkarte hat **zwei** Schrauben:
// `bias` verschiebt in der Tiefe, `normalBias` entlang der Fläche. Sie gegen
// dieselbe Kante zu messen, statt nacheinander, war der fehlende Schritt.
//
//   node tools/naht.mjs                 — das Feld abfahren
//   node tools/naht.mjs --nur           — nur den aktuellen Stand messen
//   node tools/naht.mjs --nur --ohne X  — dasselbe, mit ausgeblendetem Knoten X
//   node tools/naht.mjs --abstand       — wie weit weicht das Netz vom Feld ab?
//
// `--abstand` beantwortet, **wie hoch die Scheiben liegen müssen**. Sie holen
// ihre Scheitelhöhen aus `heightAt`, das Gelände ist ein Netz mit 41 cm
// Kantenlänge — zwischen zwei Netzknoten ist die gerenderte Fläche eine Sehne,
// das Feld aber gekrümmt. Die Scheibe muss über der **Sehne** liegen, nicht
// über dem Feld. Gemessen wird die Differenz durch einen radialen Strahl gegen
// `nacht-planet` an vielen zufälligen Stellen.
//
// `--ohne` beantwortet die eigentliche Frage: **wessen Pixel ist das?** Ein
// Kandidat wird unsichtbar geschaltet, und wenn die Zahl fällt, war er es.
//
// Gezählt wird über alle sechs festen Kameras: ein Bildpunkt, der um mehr als
// `HUB` heller ist als der über **und** der unter ihm, während beide Nachbarn
// dunkler als `DUNKEL` sind. Das ist ein Faden, kein Verlauf und keine Kante.
//
// **Und das allein zählt Sterne mit.** Ein Stern ist per Definition ein heller
// Punkt zwischen dunklen Nachbarn; der erste Anlauf meldete deshalb 750 bis
// 1000 „Saumpixel" über sechs Kameras, von denen die große Mehrheit am Himmel
// stand. Der Zähler bekommt deshalb eine **Geländemaske** aus derselben Quelle
// wie `tools/sterne-hinter.mjs`: Kuppel und alles Durchsichtige aus, Hintergrund
// magenta, und was dann nicht magenta ist, ist Geometrie. Gezählt wird nur, was
// höchstens `SAUM_BAND` Bildpunkte **über** einem Geländepixel derselben Spalte
// liegt — dort und nur dort ist ein Faden der gesuchte Saum. Die Akne wird
// umgekehrt nur **innerhalb** der Maske gezählt.
import { PNG } from 'pngjs';
import {
  PLANET_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
  ladeThree,
} from './harness-common.mjs';

const HUB = 12;
const DUNKEL = 40;
const SAUM_BAND = 6;

const FELD = process.argv.includes('--nur')
  ? [null]
  : [
      { bias: -0.0004, normalBias: 0.008 },
      { bias: -0.0004, normalBias: 0.015 },
      { bias: -0.0004, normalBias: 0.025 },
      { bias: -0.0004, normalBias: 0.04 },
      { bias: -0.0015, normalBias: 0.008 },
      { bias: -0.0015, normalBias: 0.015 },
      { bias: -0.0015, normalBias: 0.025 },
      { bias: -0.004, normalBias: 0.008 },
      { bias: -0.004, normalBias: 0.015 },
      { bias: -0.004, normalBias: 0.025 },
      { bias: -0.01, normalBias: 0.008 },
      { bias: -0.01, normalBias: 0.015 },
      { bias: -0.02, normalBias: 0.008 },
    ];

// Die Geländemaske einer Kamera: „ist hier Geometrie", schwellenfrei aus der
// Szene geholt statt aus der Helligkeit geraten.
async function gelaendeMaske(page) {
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-night');
    g.traverse((o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (o.name === 'nacht-kuppel' || o.name === 'nacht-sterne' || (m && m.transparent === true)) {
        o.userData.__maskeAus = true;
        o.visible = false;
      }
    });
    window.__app.scene.background.setHex(0xff00ff);
  });
  await page.waitForTimeout(260);
  const C = PNG.sync.read(await page.screenshot());
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-night');
    g.traverse((o) => {
      if (o.userData.__maskeAus) {
        o.visible = true;
        delete o.userData.__maskeAus;
      }
    });
    window.__app.scene.background.setHex(0x0a0605);
  });
  await page.waitForTimeout(180);
  const ist = new Uint8Array(C.width * C.height);
  for (let i = 0, k = 0; k < ist.length; k++, i += 4) {
    ist[k] = C.data[i] > 200 && C.data[i + 1] < 60 && C.data[i + 2] > 200 ? 0 : 1;
  }
  return { ist, w: C.width, h: C.height };
}

function zaehle(buf, maske) {
  const p = PNG.sync.read(buf);
  const L = (x, y) => {
    const i = (y * p.width + x) * 4;
    return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  };
  const gelaende = (x, y) => maske.ist[y * maske.w + x] === 1;
  let saum = 0;
  let akne = 0;
  // **Z-Fighting-Zähler.** Eine Kontaktscheibe, die zu tief liegt, zerfällt in
  // harte Polygonflecken; im Bild sind das viele senkrechte Sprünge **im**
  // Gelände. Ein weicher Verlauf macht keine.
  let kanten = 0;
  for (let x = 1; x < p.width - 1; x++) {
    for (let y = 1; y < p.height - 1; y++) {
      const v = L(x, y);
      const o = L(x, y - 1);
      const u = L(x, y + 1);
      if (v > o + HUB && v > u + HUB && o < DUNKEL && u < DUNKEL && !gelaende(x, y)) {
        let nah = false;
        for (let d = 1; d <= SAUM_BAND && !nah; d++)
          if (y + d < p.height && gelaende(x, y + d)) nah = true;
        if (nah) saum++;
      }
      if (o > v + HUB && u > v + HUB && o > DUNKEL && u > DUNKEL && gelaende(x, y)) akne++;
      if (gelaende(x, y) && gelaende(x, y + 1) && Math.abs(v - u) > 10) kanten++;
    }
  }
  return { saum, akne, kanten };
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');

  if (process.argv.includes('--abstand')) {
    await ladeThree(page);
    const r = await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const boden = app.scene.getObjectByName('nacht-welt-boden');
      const netz = app.scene.getObjectByName('nacht-planet');
      const heightAt = boden.userData.heightAt;
      const R = 25;
      const rc = new T.Raycaster();
      const gold = Math.PI * (3 - Math.sqrt(5));
      const N = 6000;
      const werte = [];
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N;
        const rr = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * gold;
        const d = new T.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
        const feld = R + heightAt(d);
        // Von außen radial nach innen schießen: Wo trifft der Strahl das Netz?
        rc.set(d.clone().multiplyScalar(feld + 3), d.clone().negate());
        rc.far = 12;
        const tr = rc.intersectObject(netz, true);
        if (!tr.length) continue;
        const netzR = tr[0].point.length();
        werte.push(feld - netzR); // positiv: Feld liegt über dem Netz
      }
      werte.sort((a, b) => a - b);
      const q = (f) => werte[Math.min(werte.length - 1, Math.floor(werte.length * f))];
      return { n: werte.length, min: werte[0], p50: q(0.5), p95: q(0.95), p999: q(0.999), max: werte[werte.length - 1] };
    });
    console.log(`Feld minus Netz, ${r.n} Stichproben (positiv = Feld über der Sehne)`);
    console.log(
      `  kleinster ${(r.min * 1000).toFixed(2)} mm   Median ${(r.p50 * 1000).toFixed(2)} mm   ` +
        `p95 ${(r.p95 * 1000).toFixed(2)} mm   p99,9 ${(r.p999 * 1000).toFixed(2)} mm   größter ${(r.max * 1000).toFixed(2)} mm`
    );
    await browser.close();
    await server.stop();
    process.exit(0);
  }
  // Die Maske hängt nur an der Geometrie, nicht am Bias — einmal je Kamera.
  const masken = {};
  for (const shot of PLANET_SHOTS) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(280);
    masken[shot.name] = await gelaendeMaske(page);
  }
  const ohneArg = process.argv.indexOf('--ohne');
  if (ohneArg > 0) {
    const name = process.argv[ohneArg + 1];
    // **Nach der Maske ausblenden, nicht davor.** Die Maske soll das Gelände
    // zeigen, wie es ist; ausgeblendet wird nur für die Zählung.
    await page.evaluate((n) => {
      window.__app.scene.children
        .find((c) => c.name === 'env-night')
        .traverse((o) => {
          if (o.name === n) o.visible = false;
        });
    }, name);
    console.log(`(ausgeblendet: ${name})`);
  }
  console.log('   bias   normalBias    Saum    Akne   Kanten  (Summe über sechs Kameras)');
  for (const f of FELD) {
    if (f) {
      await page.evaluate(({ bias, normalBias }) => {
        // Das Mondlicht trägt keinen Namen; gesucht wird die einzige
        // gerichtete Quelle unter `env-night`.
        let l = null;
        window.__app.scene.children
          .find((c) => c.name === 'env-night')
          .traverse((o) => {
            if (o.isDirectionalLight) l = o;
          });
        l.shadow.bias = bias;
        l.shadow.normalBias = normalBias;
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }, f);
    }
    let saum = 0;
    let akne = 0;
    let kanten = 0;
    for (const shot of PLANET_SHOTS) {
      await lockCamera(page, shot, 6.0);
      await page.waitForTimeout(280);
      const buf = await page.screenshot();
      const z = zaehle(buf, masken[shot.name]);
      saum += z.saum;
      akne += z.akne;
      kanten += z.kanten;
    }
    const b = f ? f.bias : 'Stand';
    const nb = f ? f.normalBias : '';
    console.log(
      `${String(b).padStart(8)}  ${String(nb).padStart(9)}   ${String(saum).padStart(5)}   ${String(akne).padStart(5)}   ${String(kanten).padStart(6)}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

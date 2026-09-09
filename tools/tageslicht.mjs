// **Ist es draussen heller als drinnen?**
//
//   node tools/tageslicht.mjs [--env dojo] [shot]
//
// Prüferbefund 1 zum Dojo: *„Draussen ist dunkler als drinnen — die Tageszeit
// kippt."* Gemessen an Punktproben stimmt das (offener Türausschnitt L 73–87,
// Boden davor 131–140, Papierwand 185). Die Frage ist, **woran** es liegt, und
// dafür braucht es drei Zustände derselben Fläche:
//
//   1. wie sie steht,
//   2. ohne den Schattenwurf des Bambushains,
//   3. ohne jeden Schattenwurf.
//
// Bleibt eine Fläche in allen dreien gleich dunkel, liegt es am Material oder
// am Licht; hellt sie auf, stand sie im Schatten. Das ist der Unterschied
// zwischen „der Kies ist zu dunkel eingefärbt" und „der Kies liegt im Schatten
// des eigenen Hains" — zwei Befunde mit völlig verschiedenen Folgen.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'dojo');
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env');
const SHOT = rest[0] ?? 'c-engawa';
// `--ohne <knoten…>` nimmt weitere Knoten aus dem Schattenpass und legt das
// Bild dazu ab. Fuer die Papierwand gebaut: Sie wirft einen vollen Schatten,
// und der ganze Innenraum liegt darin.
const oi = argv.indexOf('--ohne');
const OHNE = oi >= 0 ? argv.slice(oi + 1).filter((a) => !a.startsWith('--')) : null;
const bi = argv.indexOf('--bild');
const BILD = bi >= 0 ? argv[bi + 1] : null;
// `--himmelsreihe <faktor…>` skaliert `envMapIntensity` aller Aussenmaterialien.
// Die Himmelskarte ist am Dojo die einzige nennenswerte Quelle des Aussenraums
// (45 bis 55 der 61 bis 101 Stufen), und sie ist damit der einzige Regler, der
// „draussen ist dunkler als drinnen" ueberhaupt bewegen kann.
const hri = argv.indexOf('--himmelsreihe');
const HIMMELSREIHE = hri >= 0 ? argv.slice(hri + 1).filter((a) => /^[0-9.]+$/.test(a)).map(Number) : null;

// Feste Rechtecke je Kamera. Sie liegen bewusst auf FLAECHEN, nicht auf
// Objekten: Eine Punktprobe trifft eine Harkrille oder ein Blatt, ein Rechteck
// mittelt darueber hinweg.
const FELDER = {
  'c-engawa': [
    ['Kies rechts', 950, 440, 1150, 520],
    ['Kies links', 560, 430, 700, 470],
    ['Laubwand', 620, 60, 900, 200],
    ['Diele innen', 60, 620, 300, 700],
    ['Shoji-Papier', 60, 150, 260, 400],
  ],
  'f-gegenlicht': [
    ['Tuerausschnitt', 950, 350, 1080, 450],
    ['Tatami', 400, 550, 800, 660],
    ['Shoji-Papier Ost', 380, 350, 700, 420],
    ['Diele', 100, 500, 250, 560],
  ],
  'd-suedfront': [
    ['Fassade', 100, 250, 400, 450],
    ['Halle durch die Tuer', 520, 380, 780, 470],
    ['Boden davor', 300, 690, 900, 715],
  ],
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === SHOT);
  await lockCamera(page, shot, 6.0);
  const felder = FELDER[SHOT];
  if (!felder) {
    process.stderr.write(`Keine Felder fuer "${SHOT}" hinterlegt.\n`);
    process.exit(1);
  }
  const bild = async () => {
    await page.waitForTimeout(450);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };

  const wurf = (namen, an) =>
    page.evaluate(
      ({ an, namen, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (namen.includes(o.name)) o.castShadow = an;
        });
      },
      { an, namen, gruppe: `env-${ENV}` }
    );
  const lichtWurf = (an) =>
    page.evaluate(
      ({ an, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.isDirectionalLight) o.castShadow = an;
        });
      },
      { an, gruppe: `env-${ENV}` }
    );

  const messe = (b) =>
    felder.map(([, x0, y0, x1, y1]) => {
      let s = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * b.width + x) * 4;
          s += lum(b.data[i], b.data[i + 1], b.data[i + 2]);
          n++;
        }
      }
      return s / n;
    });

  const standBild = await bild();
  const stand = messe(standBild);
  if (OHNE) {
    await wurf(OHNE, false);
    const b = await bild();
    const w = messe(b);
    if (BILD) fs.writeFileSync(BILD, PNG.sync.write(b));
    await wurf(OHNE, true);
    process.stdout.write(`${SHOT}, ohne Wurf von ${OHNE.join(' + ')}\n\n`);
    felder.forEach(([name], i) => {
      process.stdout.write(
        `   ${name.padEnd(24)} ${stand[i].toFixed(1).padStart(7)} → ${w[i].toFixed(1).padStart(7)}  ` +
          `${(w[i] - stand[i] >= 0 ? '+' : '')}${(w[i] - stand[i]).toFixed(1)}\n`
      );
    });
    process.stdout.write('\n');
  }
  if (HIMMELSREIHE) {
    process.stdout.write(
      `${SHOT}, Himmelskarte skaliert\n\n${'Faktor'.padEnd(10)}` +
        felder.map(([n]) => n.slice(0, 11).padStart(13)).join('') + '\n'
    );
    for (const f of HIMMELSREIHE) {
      await page.evaluate(
        ({ f, gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
              if (m.envMapIntensity === undefined || !m.envMap) continue;
              if (m.userData.__envBasis === undefined) m.userData.__envBasis = m.envMapIntensity;
              m.envMapIntensity = m.userData.__envBasis * f;
            }
          });
        },
        { f, gruppe: `env-${ENV}` }
      );
      const b = await bild();
      if (BILD) fs.writeFileSync(BILD.replace(/\.png$/, `-${String(f).replace('.', '_')}.png`), PNG.sync.write(b));
      const w = messe(b);
      process.stdout.write(String(f).padEnd(10) + w.map((v) => v.toFixed(1).padStart(13)).join('') + '\n');
    }
    await page.evaluate(
      ({ gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
            if (m.userData.__envBasis !== undefined) m.envMapIntensity = m.userData.__envBasis;
          }
        });
      },
      { gruppe: `env-${ENV}` }
    );
    process.stdout.write('\n');
  }
  // **Und wer liefert das Licht?** Der Schattenwurf erklaert beim Kies nur
  // sechs Stufen; die Frage ist damit nicht mehr, was ihn verdunkelt, sondern
  // was ihn nicht aufhellt. Jede Quelle einzeln auf null, im selben Rechteck.
  const quellen = await page.evaluate(
    ({ gruppe }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      const out = [];
      g.traverse((o) => {
        if (!o.isLight) return;
        o.userData.__q = out.length;
        out.push(`${o.type} #${o.color.getHexString()} ${o.intensity}`);
      });
      return out;
    },
    { gruppe: `env-${ENV}` }
  );
  const bilanz = [];
  for (let q = 0; q < quellen.length; q++) {
    await page.evaluate(
      ({ q, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.isLight && o.userData.__q === q) {
            o.userData.__merk = o.intensity;
            o.intensity = 0;
          }
        });
      },
      { q, gruppe: `env-${ENV}` }
    );
    bilanz.push([quellen[q], messe(await bild())]);
    await page.evaluate(
      ({ q, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.isLight && o.userData.__q === q) o.intensity = o.userData.__merk;
        });
      },
      { q, gruppe: `env-${ENV}` }
    );
  }
  // Die Himmelskarte ist keine Lichtquelle im Graphen, sondern steht als
  // envMap an den Materialien. Sie muss deshalb getrennt abgeschaltet werden —
  // und sie ist am Dojo mit Staerke 4,5 die groesste Quelle ueberhaupt.
  await page.evaluate(
    ({ gruppe }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      g.traverse((o) => {
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          if (m.envMapIntensity === undefined) continue;
          m.userData.__envMerk = m.envMapIntensity;
          m.envMapIntensity = 0;
        }
      });
    },
    { gruppe: `env-${ENV}` }
  );
  bilanz.push(['Himmelskarte (envMapIntensity 0)', messe(await bild())]);
  await page.evaluate(
    ({ gruppe }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      g.traverse((o) => {
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          if (m.userData.__envMerk !== undefined) m.envMapIntensity = m.userData.__envMerk;
        }
      });
    },
    { gruppe: `env-${ENV}` }
  );
  await wurf(['dojo-bamboo-laub', 'dojo-bamboo'], false);
  const ohneHain = messe(await bild());
  await wurf(['dojo-bamboo-laub', 'dojo-bamboo'], true);
  await lichtWurf(false);
  const ohneWurf = messe(await bild());
  await lichtWurf(true);

  process.stdout.write(
    `${SHOT}\n\n${'Flaeche'.padEnd(24)} ${'Stand'.padStart(7)} ${'ohne Hain'.padStart(10)} ` +
      `${'ohne Wurf'.padStart(10)}   Deutung\n`
  );
  felder.forEach(([name], i) => {
    const d1 = ohneHain[i] - stand[i];
    const d2 = ohneWurf[i] - stand[i];
    const deutung =
      d2 < 3 ? 'steht nicht im Schatten' : d1 > d2 * 0.6 ? 'Schatten des Hains' : 'anderer Schatten';
    process.stdout.write(
      `${name.padEnd(24)} ${stand[i].toFixed(1).padStart(7)} ${ohneHain[i].toFixed(1).padStart(10)} ` +
        `${ohneWurf[i].toFixed(1).padStart(10)}   ${deutung}\n`
    );
  });
  process.stdout.write(`\n${'Beitrag der Quelle (Stufen)'.padEnd(40)}` + felder.map(([n]) => n.slice(0, 11).padStart(12)).join('') + '\n');
  for (const [name, werte] of bilanz) {
    process.stdout.write(
      name.slice(0, 40).padEnd(40) + werte.map((w, i) => (stand[i] - w).toFixed(1).padStart(12)).join('') + '\n'
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

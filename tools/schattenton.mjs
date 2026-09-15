// **Welche Farbe hat der Schatten, und wer füllt ihn?**
//
//   node tools/schattenton.mjs [--env zen] [shot] [--werfer <knoten> …]
//
// Prüferbefund 12: *„Neutralgraue Schatten ohne kühles Indirektlicht."* Das ist
// eine Aussage über Farbton, und sie braucht zwei Zahlen im **selben** Fleck:
// den Ton der beschatteten Bildpunkte und den Ton derselben Bildpunkte ohne
// Schatten. Zwei von Hand gegriffene Proben taugen nicht — die eine liegt auf
// einer Harkerille, die andere daneben.
//
// Der Fleck entsteht differenziell (Werfer aus, Bild, an, Bild). Danach wird
// jedes Licht der sichtbaren Umgebung einzeln abgeschaltet und im selben Fleck
// gemessen: Das sagt, WER den Schatten füllt. Ein warmes Licht ohne
// Schattenwurf hebt die Kühle des Himmelslichts wieder auf, und genau das ist
// der Befund.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const wi = argv.indexOf('--werfer');
const WERFER =
  wi >= 0 ? argv.slice(wi + 1).filter((a) => !a.startsWith('--')) : ['zen-sakura-blobs', 'zen-sakura-karten'];
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && (wi < 0 || argv.indexOf(a) < wi));
const SHOT = rest[0] ?? 'd-aerial';
// `--himmel <hex> …` faehrt die Himmelsfarbe des Hemisphaerenlichts durch und
// misst je Wert Schatten UND beleuchtete Flaeche. Beide zusammen, weil eine
// kraeftigere Himmelsfarbe die Schatten kuehlt und die Sonnenflaechen
// gleich mit — der Gewinn muss groesser sein als der Verlust.
const hi = argv.indexOf('--himmel');
const HIMMEL = hi >= 0 ? argv.slice(hi + 1).filter((a) => a.startsWith('0x')).map(Number) : null;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx === 0 ? 0 : d / mx];
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shotsFor(ENV).find((s) => s.name === SHOT), 6.0);
  const bild = async () => {
    await page.waitForTimeout(340);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };
  // `--sichtbar` schaltet den Knoten ganz ab statt nur seinen Wurf. Fuer
  // aufgelegte Kontaktschatten ist das der richtige Schalter: Sie werfen
  // nichts, sie LIEGEN auf, und die Frage ist, was sie mit der Farbe darunter
  // machen.
  const SICHT = argv.includes('--sichtbar');
  const wurf = (an) =>
    page.evaluate(
      ({ an, namen, gruppe, sicht }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (!namen.includes(o.name)) return;
          if (sicht) o.visible = an;
          else o.traverse((k) => (k.castShadow = an));
        });
      },
      { an, namen: WERFER, gruppe: `env-${ENV}`, sicht: SICHT }
    );

  const mit = await bild();
  await wurf(false);
  const ohne = await bild();
  await wurf(true);

  const maske = [];
  for (let i = 0; i < mit.data.length; i += 4) {
    const d = lum(ohne.data[i], ohne.data[i + 1], ohne.data[i + 2]) -
      lum(mit.data[i], mit.data[i + 1], mit.data[i + 2]);
    if (d >= 8) maske.push(i);
  }
  if (!maske.length) {
    process.stdout.write(`Kein Schatten von ${WERFER.join(', ')} in ${SHOT}.\n`);
  } else {
    const ton = (b) => {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (const i of maske) {
        r += b.data[i];
        g += b.data[i + 1];
        bl += b.data[i + 2];
      }
      const n = maske.length;
      const [h, s] = hsv(r / n, g / n, bl / n);
      return { r: r / n, g: g / n, b: bl / n, L: lum(r / n, g / n, bl / n), h, s };
    };
    const imS = ton(mit);
    const beL = ton(ohne);
    process.stdout.write(
      `${SHOT}  Werfer ${WERFER.join(' + ')}  Maske ${maske.length} px\n\n` +
        `   beleuchtet   rgb ${beL.r.toFixed(0)},${beL.g.toFixed(0)},${beL.b.toFixed(0)}  ` +
        `L ${beL.L.toFixed(1)}  Ton ${beL.h.toFixed(1)}°  Saett ${(beL.s * 100).toFixed(1)} %\n` +
        `   im Schatten  rgb ${imS.r.toFixed(0)},${imS.g.toFixed(0)},${imS.b.toFixed(0)}  ` +
        `L ${imS.L.toFixed(1)}  Ton ${imS.h.toFixed(1)}°  Saett ${(imS.s * 100).toFixed(1)} %\n` +
        `   Tonwanderung ${(imS.h - beL.h).toFixed(1)}°   ` +
        `(negativ = kuehler; ein Sandschatten unter blauem Zenit gehoert deutlich ins Minus)\n\n`
    );

    if (HIMMEL) {
      process.stdout.write(
        `   ${'Himmelsfarbe'.padEnd(14)} ${'Schatten'.padStart(24)}   ${'beleuchtet'.padStart(24)}\n`
      );
      for (const hex of HIMMEL) {
        await page.evaluate(
          ({ hex, gruppe }) => {
            const g = window.__app.scene.children.find((c) => c.name === gruppe);
            g.traverse((o) => {
              if (o.isHemisphereLight) o.color.setHex(hex);
            });
          },
          { hex, gruppe: `env-${ENV}` }
        );
        const bS = await bild();
        await wurf(false);
        const bL = await bild();
        await wurf(true);
        const tS = ton(bS);
        const tL = ton(bL);
        process.stdout.write(
          `   0x${hex.toString(16).padStart(6, '0')}     ` +
            `L ${tS.L.toFixed(1).padStart(5)} Ton ${tS.h.toFixed(1).padStart(5)}° Saett ${(tS.s * 100).toFixed(1).padStart(4)} %   ` +
            `L ${tL.L.toFixed(1).padStart(5)} Ton ${tL.h.toFixed(1).padStart(5)}° Saett ${(tL.s * 100).toFixed(1).padStart(4)} %\n`
        );
      }
      await page.evaluate(
        ({ gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            if (o.isHemisphereLight) o.color.setHex(0xb3cdf0);
          });
        },
        { gruppe: `env-${ENV}` }
      );
      process.stdout.write('\n');
    }

    // Wer füllt ihn? Jedes Licht der SICHTBAREN Umgebung einzeln aus.
    const lichter = await page.evaluate(
      ({ gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        const out = [];
        g.traverse((o) => {
          if (!o.isLight) return;
          out.push({
            id: out.length,
            typ: o.type,
            name: o.name || '—',
            farbe: `#${o.color.getHexString()}`,
            staerke: o.intensity,
            wirft: !!o.castShadow,
          });
          o.userData.__zensus = out.length - 1;
        });
        return out;
      },
      { gruppe: `env-${ENV}` }
    );
    process.stdout.write(`   ${'Licht'.padEnd(34)} ${'Anteil'.padStart(7)}  Ton ohne dieses Licht\n`);
    for (const l of lichter) {
      await page.evaluate(
        ({ id, an, gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            if (o.isLight && o.userData.__zensus === id) o.intensity = an ? o.userData.__merk : ((o.userData.__merk = o.intensity), 0);
          });
        },
        { id: l.id, an: false, gruppe: `env-${ENV}` }
      );
      const b = await bild();
      await page.evaluate(
        ({ id, gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            if (o.isLight && o.userData.__zensus === id) o.intensity = o.userData.__merk;
          });
        },
        { id: l.id, gruppe: `env-${ENV}` }
      );
      const t = ton(b);
      process.stdout.write(
        `   ${`${l.typ} ${l.farbe} ${l.staerke}${l.wirft ? ' (wirft)' : ''}`.padEnd(34)} ` +
          `${(imS.L - t.L).toFixed(1).padStart(7)}  Ton ${t.h.toFixed(1)}°  Saett ${(t.s * 100).toFixed(1)} %\n`
      );
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

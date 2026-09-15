// **Den Blattatlas ansehen, statt ihn an der Krone zu erraten.**
//
//   node tools/blattatlas.mjs <art> [<art> …] [--out <verzeichnis>]
//
// Arten: bamboo, maple, azalea, fern, sakura, nadel.
//
// Der Anlass ist der Prüferbefund „der Bambus liest als bereifte Konifere". Im
// Bild ist ein Blatt drei Bildpunkte gross; ob seine Form stimmt, sieht man
// daran nicht — und die Ursache stand denn auch nicht in der Beleuchtung,
// sondern im Zeichenverfahren: 14 Sternbüschel je Zelle, jedes mit 17 bis 25
// Blättern aus einem Punkt. Das ist ein Koniferenschopf, und man sieht es dem
// Atlas sofort an. Vier Läufe wären daran vorbeigegangen, ohne ihn je zu
// öffnen.
//
// Ausgegeben werden Farbkarte, Alphakanal und Normal-Map je Art, 512 x 512.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer, launchBrowser, openApp } from './harness-common.mjs';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outDir = path.resolve(
  ROOT,
  outIdx >= 0 ? argv[outIdx + 1] : 'tools/shots/blattatlas'
);
const arten = argv.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
if (arten.length === 0) arten.push('bamboo');

const server = await startServer();
const browser = await launchBrowser();
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page, messages } = await openApp(browser);

  for (const art of arten) {
    const bilder = await page.evaluate(async (kind) => {
      const mod = await import('/src/dojo/foliage.js');
      const atlas = mod.leafAtlas(kind);
      const hole = (tex) => {
        const bild = tex.image;
        const c = document.createElement('canvas');
        c.width = bild.width;
        c.height = bild.height;
        const g = c.getContext('2d');
        g.drawImage(bild, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        return { w: c.width, h: c.height, data: Array.from(d.data) };
      };
      return {
        farbe: hole(atlas.map),
        normal: hole(atlas.normalMap),
        groesse: atlas.size,
        zellen: atlas.cells,
      };
    }, art);

    const schreibe = (name, quelle, nurAlpha) => {
      const p = new PNG({ width: quelle.w, height: quelle.h });
      for (let i = 0; i < quelle.data.length; i += 4) {
        if (nurAlpha) {
          const a = quelle.data[i + 3];
          p.data[i] = p.data[i + 1] = p.data[i + 2] = a;
          p.data[i + 3] = 255;
        } else {
          // Ueber Schachbrett komponiert: Ein Blatt auf schwarzem Grund sieht
          // anders aus als eines auf weissem, und beide luegen ueber die Kante.
          const a = quelle.data[i + 3] / 255;
          const x = (i / 4) % quelle.w;
          const y = Math.floor(i / 4 / quelle.w);
          const feld = ((x >> 4) + (y >> 4)) & 1 ? 210 : 150;
          for (let k = 0; k < 3; k++) {
            p.data[i + k] = Math.round(quelle.data[i + k] * a + feld * (1 - a));
          }
          p.data[i + 3] = 255;
        }
      }
      const ziel = path.join(outDir, `${art}-${name}.png`);
      return fs.writeFile(ziel, PNG.sync.write(p)).then(() => ziel);
    };

    await schreibe('farbe', bilder.farbe, false);
    await schreibe('alpha', bilder.farbe, true);
    await schreibe('normal', bilder.normal, false);
    process.stdout.write(
      `${art.padEnd(8)} ${bilder.groesse}x${bilder.groesse}, ${bilder.zellen}x${bilder.zellen} Zellen\n`
    );
  }

  const stoerend = messages.filter((m) => m.type === 'error' || m.type === 'warning');
  process.stdout.write(
    stoerend.length ? `\n✗ Konsole: ${stoerend.length} Meldungen\n` : '\n✓ Konsole sauber\n'
  );
  process.stdout.write(`Bilder in ${path.relative(ROOT, outDir)}\n`);
} finally {
  await browser.close();
  await server.stop();
}

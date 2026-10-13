// **Sieht man noch Füllkörper, und wie dicht sind die Kronen?**
//
//   node tools/kronenprobe.mjs [--env island|zen|dojo]
//
// Der Nutzer hat in allen Umgebungen „komische Strukturen in Gebüschen und
// Bäumen, die vielleicht auffüllen sollen" gemeldet. Gemeint waren die glatten
// Hüllkörper unter den Blattkarten. Diese Probe misst je Prüfkamera dreierlei:
//
//   * **Laub**     Anteil der Bildfläche, auf dem Pflanzenmasse (Karten oder
//                  Körper) die sichtbare Oberfläche ist
//   * **Kern**     davon der Anteil, auf dem ein **glatter** Körper sichtbar
//                  ist – ein Lambert-Körper ohne Blattzeichnung. Ziel: 0.
//                  Körper mit Laubzeichnung (`laubKoerperMaterial`) zählen
//                  getrennt als „Laubkörper".
//   * **Durchblick** Lücken innerhalb der Kronenkontur: Bildpunkte, die nach
//                  einem Schließen der Laubmaske (5 px) dazukommen, bezogen
//                  auf die geschlossene Fläche. Steigt er stark, ist die Krone
//                  löchrig geworden.
//
// **Gemessen über die Farbe, nicht über das Ausblenden.** Ein ausgeblendeter
// Baum nimmt seinen Schatten mit, und der Schatten auf dem Gras wäre dann Teil
// der Maske. Stattdessen wird die Materialfarbe der Gruppe auf Magenta gesetzt:
// Das Tiefenmaterial der Schattenkarte bleibt unberührt, und jeder Bildpunkt,
// an dem diese Gruppe sichtbar ist, verliert seinen Grünkanal.
//
// Auf der Insel kommt die Anordnung der Bäume dazu (aus
// `island.userData.baumPlaetze`): kleinster Abstand und die gerädeste
// Dreiergruppe naher Bäume. Eine Reihe zeigt sich als Winkel nahe 180 Grad.
import { PNG } from 'pngjs';
import { envArg, shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const ENV = envArg(process.argv.slice(2), 'island');

// Knotennamen je Umgebung. Alte Namen bleiben in der Liste, damit dieselbe
// Probe auch den Stand vor dem Umbau messen kann.
const GRUPPEN = {
  island: ['island-laub', 'bush-leaves', 'island-krone', 'bushes'],
  zen: ['zen-ahorn-karten', 'zen-sakura-karten', 'zen-ahorn-blobs', 'zen-sakura-blobs'],
  dojo: [
    'dojo-garden-blattkarten',
    'dojo-garden-blattkarten-fern',
    'dojo-garden-kronenkarten',
    'dojo-wald-nahlaub',
    'dojo-garden-polster',
    'dojo-garden-fernkronen',
    'dojo-garden-krone',
    'dojo-wald-kronen',
    'dojo-wald-kronen-fern',
  ],
};

// Färbt die Materialien der genannten Knoten (oder nur die einer Art) um bzw.
// stellt sie wieder her. Gibt zurück, wie viele Knoten welcher Art es gibt.
const faerbe = (page, namen, art, an) =>
  page.evaluate(
    ({ env, namen, art, an }) => {
      const g = window.__app.scene.children.find((c) => c.name === `env-${env}`);
      const zaehl = { karten: 0, kern: 0, laubkoerper: 0 };
      window.__kpAlt ??= new Map();
      g.traverse((o) => {
        if (!o.isMesh || !namen.includes(o.name)) return;
        const m = o.material;
        const istKarte = Boolean(m.userData?.foliage);
        const istLaubKoerper = Boolean(m.userData?.laubKoerper);
        const a = istKarte ? 'karten' : istLaubKoerper ? 'laubkoerper' : 'kern';
        zaehl[a]++;
        if (art !== 'alle' && art !== a) return;
        if (an) {
          if (!window.__kpAlt.has(m)) window.__kpAlt.set(m, m.color.getHex());
          m.color.setRGB(1, 0, 1);
        } else if (window.__kpAlt.has(m)) {
          m.color.setHex(window.__kpAlt.get(m));
          window.__kpAlt.delete(m);
        }
      });
      return zaehl;
    },
    { env: ENV, namen, art, an }
  );

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot(SCHUSS));
};

// Maske: Bildpunkte, deren Grünkanal beim Umfärben deutlich fällt.
const maske = (a, b) => {
  const m = new Uint8Array(a.width * a.height);
  for (let i = 0; i < m.length; i++) {
    const p = i * 4;
    if (a.data[p + 1] - b.data[p + 1] >= 6) m[i] = 1;
  }
  return m;
};

// Morphologisches Schließen mit quadratischem Fenster (Radius r).
const schliesse = (m, w, h, r) => {
  const dehne = (src, wert) => {
    const tmp = new Uint8Array(src.length);
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = !wert;
        for (let k = -r; k <= r && v !== wert; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w && src[y * w + xx] === (wert ? 1 : 0)) v = wert;
        }
        tmp[y * w + x] = v ? 1 : 0;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = !wert;
        for (let k = -r; k <= r && v !== wert; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < h && tmp[yy * w + x] === (wert ? 1 : 0)) v = wert;
        }
        out[y * w + x] = v ? 1 : 0;
      }
    }
    return out;
  };
  return dehne(dehne(m, true), false);
};

const summe = (m) => m.reduce((s, v) => s + v, 0);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const namen = GRUPPEN[ENV];
  const zeilen = [];
  for (const shot of shotsFor(ENV)) {
    await lockCamera(page, shot, 6.0);
    const voll = await bild(page);
    const zaehl = await faerbe(page, namen, 'alle', true);
    const allesMagenta = await bild(page);
    await faerbe(page, namen, 'alle', false);
    await faerbe(page, namen, 'kern', true);
    const kernMagenta = await bild(page);
    await faerbe(page, namen, 'kern', false);
    await faerbe(page, namen, 'laubkoerper', true);
    const lkMagenta = await bild(page);
    await faerbe(page, namen, 'laubkoerper', false);

    const w = voll.width;
    const h = voll.height;
    const laub = maske(voll, allesMagenta);
    const kern = maske(voll, kernMagenta);
    const lk = maske(voll, lkMagenta);
    const zu = schliesse(laub, w, h, 5);
    const nLaub = summe(laub);
    const nZu = summe(zu);
    const n = w * h;
    zeilen.push({
      name: shot.name,
      laub: (nLaub / n) * 100,
      kern: nLaub ? (summe(kern) / nLaub) * 100 : 0,
      laubkoerper: nLaub ? (summe(lk) / nLaub) * 100 : 0,
      durchblick: nZu ? ((nZu - nLaub) / nZu) * 100 : 0,
      zaehl,
    });
  }
  for (const z of zeilen) {
    process.stdout.write(
      `${z.name.padEnd(16)} Laub ${z.laub.toFixed(2).padStart(6)} %   ` +
        `Kern ${z.kern.toFixed(2).padStart(6)} %   Laubkörper ${z.laubkoerper.toFixed(2).padStart(6)} %   ` +
        `Durchblick ${z.durchblick.toFixed(2).padStart(6)} %\n`
    );
  }
  const k = zeilen[0]?.zaehl;
  if (k) {
    process.stdout.write(
      `Knoten: ${k.karten} Kartenwolken, ${k.kern} glatte Körper, ${k.laubkoerper} Laubkörper\n`
    );
  }

  if (ENV === 'island') {
    const plaetze = await page.evaluate(() => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let liste = null;
      g.traverse((o) => {
        if (!liste && o.name === 'island' && o.userData.baumPlaetze) liste = o.userData.baumPlaetze;
      });
      return liste;
    });
    if (!plaetze) {
      process.stdout.write('Baumplätze: nicht hinterlegt (Stand vor dem Umbau)\n');
    } else {
      let minAbstand = Infinity;
      let geradeste = 0;
      for (let i = 0; i < plaetze.length; i++) {
        for (let j = i + 1; j < plaetze.length; j++) {
          const d = Math.hypot(plaetze[i].x - plaetze[j].x, plaetze[i].z - plaetze[j].z);
          minAbstand = Math.min(minAbstand, d);
          for (let k2 = j + 1; k2 < plaetze.length; k2++) {
            const p = [plaetze[i], plaetze[j], plaetze[k2]];
            // Nur Dreiergruppen, die man zusammen sieht: alle unter 4 Einheiten
            // (16 m) auseinander.
            const nah = [
              [0, 1],
              [0, 2],
              [1, 2],
            ].every(([a, b]) => Math.hypot(p[a].x - p[b].x, p[a].z - p[b].z) < 4);
            if (!nah) continue;
            for (let m = 0; m < 3; m++) {
              const a = p[m];
              const b = p[(m + 1) % 3];
              const c = p[(m + 2) % 3];
              const ux = b.x - a.x;
              const uz = b.z - a.z;
              const vx = c.x - a.x;
              const vz = c.z - a.z;
              const cos = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
              geradeste = Math.max(geradeste, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
            }
          }
        }
      }
      process.stdout.write(
        `Baumplätze Hauptinsel: ${plaetze.length}, kleinster Abstand ${(minAbstand * 4).toFixed(1)} m, ` +
          `größter Winkel in einer nahen Dreiergruppe ${geradeste.toFixed(1)}° (Reihe ab ~172°)\n`
      );
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

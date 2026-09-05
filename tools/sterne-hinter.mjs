// Stehen Sterne VOR dem Gelände? — als harte Messung statt als Heuristik.
//
//   node tools/sterne-hinter.mjs [--out tools/shots/xxx] [--rundgang]
//
// `--rundgang` prüft statt der sechs festen Kameras die **zwölf Stationen des
// Rundgangs**. Das ist kein Zusatz, sondern eine Lücke, die sich gerächt hat:
// Der Prüfer hat 104 Sterne vor dem Gelände in `rund-210` gefunden, dazu welche
// in 240, 270 und 300 — sämtlich Stationen, die dieses Werkzeug nie gesehen
// hat, weil es nur die sechs Standbilder kannte. Vier von zwölf Stationen
// betroffen, und die Messung meldete null, weil sie woanders hinsah.
//
// `tools/silhouette.mjs` sucht die Geländekante über eine Luminanzschwelle und
// nimmt dabei an, der Himmel sei dunkler als L 7. Das galt, solange der Himmel
// praktisch schwarz war. Seit er einen Verlauf bis L 29 trägt, hält die Annahme
// nicht mehr — das Werkzeug meldete daraufhin 128 „Sterne im Gelände" in
// `c-crater`, wo in Wahrheit der halbe Himmel als Gelände galt. Ein Werkzeug,
// das auf eine Änderung der Szene reagiert, misst nicht mehr, was es soll.
//
// Diese Fassung rät nicht, sondern fragt die Szene:
//
//   A  normaler Durchgang
//   B  Sternfeld unsichtbar
//   C  Kuppel und Sternfeld unsichtbar, Hintergrund knallmagenta
//
// Aus C ergibt sich die **Geländemaske** ohne jede Schwelle: Alles, was nicht
// magenta ist, ist Geometrie. Aus A − B ergeben sich die Pixel, die das
// Sternfeld tatsächlich beigetragen hat. Der Schnitt beider Mengen ist die
// gesuchte Zahl: Sternpixel, die vor dem Gelände liegen. Null heißt bestanden.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  ROOT,
  shotsFor,
  PLANET_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
  ladeThree,
} from './harness-common.mjs';

const argv = process.argv.slice(2);
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const rundgang = argv.includes('--rundgang');
const SHOTS = shotsFor('night');

// Eine Station des Rundgangs einnehmen: die Welt um `grad` drehen und die
// Kamera aus dem Höhenfeld auf den Boden setzen — wortgleich wie in
// `tools/rundgang.mjs`, damit beide Werkzeuge dieselben zwölf Bilder meinen.
async function stelleStation(page, grad) {
  const s0 = PLANET_SHOTS[0];
  const blick = [s0.look[0] - s0.pos[0], s0.look[1] - s0.pos[1], s0.look[2] - s0.pos[2]];
  const { augeY, ziel } = await page.evaluate(
    ({ grad, blick }) => {
      const T = window.__THREE;
      const app = window.__app;
      app.env.setWalkEnabled?.(false);
      const welt = app.scene.getObjectByName('nacht-welt');
      const himmel = app.scene.getObjectByName('nacht-himmel');
      const kuppel = app.scene.getObjectByName('nacht-kuppel');
      welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (grad * Math.PI) / 180);
      himmel.quaternion.copy(welt.quaternion);
      kuppel.userData.setzeWeltdrehung(welt.quaternion);
      welt.updateMatrixWorld(true);
      const boden = app.scene.getObjectByName('nacht-welt-boden');
      const oben = new T.Vector3(0, 1, 0).applyQuaternion(welt.quaternion.clone().invert());
      const y = 25 + boden.userData.heightAt(oben) + 1.6;
      return { augeY: y, ziel: [blick[0], y + blick[1], blick[2]] };
    },
    { grad, blick }
  );
  // **Und dann die Kamera festnageln.** Ohne `lockCamera` setzt die Bildschleife
  // sie zwischen den drei Aufnahmen nach, und A, B und C zeigten verschiedene
  // Ansichten — der Vergleich wäre wertlos.
  await lockCamera(page, { name: `rund-${grad}`, pos: [0, augeY, 0], look: ziel, fov: s0.fov }, 6.0);
}

const sichtbarkeit = (page, namen, sichtbar) =>
  page.evaluate(
    ({ namen, sichtbar }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-night');
      g.traverse((o) => {
        if (namen.includes(o.name)) o.visible = sichtbar;
      });
    },
    { namen, sichtbar }
  );

const server = await startServer();
const browser = await launchBrowser();
let vorDemGelaende = 0;
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  if (outArg) await fs.mkdir(path.resolve(ROOT, outArg), { recursive: true });

  const posen = rundgang
    ? Array.from({ length: 12 }, (_, k) => ({
        name: `rund-${String(k * 30).padStart(3, '0')}`,
        setzen: () => stelleStation(page, k * 30),
      }))
    : SHOTS.map((shot) => ({ name: shot.name, setzen: () => lockCamera(page, shot, 6.0) }));

  for (const shot of posen) {
    await shot.setzen();
    await page.waitForTimeout(350);
    const A = PNG.sync.read(await page.screenshot());

    await sichtbarkeit(page, ['nacht-sterne'], false);
    await page.waitForTimeout(250);
    const B = PNG.sync.read(await page.screenshot());

    // Für die Maske zählt nur, was wirklich verdeckt: **opake** Geometrie.
    // Der Mondhof ist ein transparentes Sprite — er blendet sich über den
    // magenta Hintergrund und wäre sonst als „Gelände" gezählt worden, obwohl
    // Sterne durch ihn hindurch völlig richtig zu sehen sind. Genau daran hing
    // die letzte Fehlmeldung von acht Pixeln in `b-moon`.
    await sichtbarkeit(page, ['nacht-kuppel'], false);
    await page.evaluate(() => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-night');
      g.traverse((o) => {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && m.transparent === true) {
          o.userData.__maskeAus = true;
          o.visible = false;
        }
      });
      window.__app.scene.background.setHex(0xff00ff);
    });
    await page.waitForTimeout(250);
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
    await sichtbarkeit(page, ['nacht-sterne', 'nacht-kuppel'], true);

    // **Randpixel zählen nicht.** Die Geländekante ist kantengeglättet: Ein
    // Pixel direkt auf der Silhouette ist eine Mischung aus Gelände und
    // Himmel, und ein Stern dahinter trägt dort anteilig bei. Das ist richtig
    // so und kein durchscheinender Stern. Gezählt wird deshalb nur, was
    // **innerhalb** der Maske liegt, also ringsum von Gelände umgeben ist.
    const istGelaendeAt = (x, y) => {
      const p = (y * C.width + x) * 4;
      return !(C.data[p] > 200 && C.data[p + 1] < 60 && C.data[p + 2] > 200);
    };
    const imInneren = (x, y) => {
      if (x < 2 || y < 2 || x >= C.width - 2 || y >= C.height - 2) return false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!istGelaendeAt(x + dx, y + dy)) return false;
      return true;
    };
    let treffer = 0;
    let amRand = 0;
    let sternPixel = 0;
    let gelaendePixel = 0;
    const karte = outArg ? new PNG({ width: A.width, height: A.height }) : null;
    for (let i = 0; i < A.width * A.height; i++) {
      const p = i * 4;
      // Geländemaske: in C ist alles Geometrie, was nicht der magenta
      // Hintergrund ist.
      const istGelaende = !(C.data[p] > 200 && C.data[p + 1] < 60 && C.data[p + 2] > 200);
      // Sternbeitrag: Was A gegenüber B heller macht, kommt vom Sternfeld.
      const beitrag = Math.max(
        A.data[p] - B.data[p],
        A.data[p + 1] - B.data[p + 1],
        A.data[p + 2] - B.data[p + 2]
      );
      if (beitrag >= 6) sternPixel++;
      if (istGelaende) gelaendePixel++;
      if (beitrag >= 6 && istGelaende) {
        if (imInneren(i % A.width, (i / A.width) | 0)) treffer++;
        else amRand++;
      }
      if (karte) {
        karte.data[p] = beitrag >= 6 && istGelaende ? 255 : 0;
        karte.data[p + 1] = beitrag >= 6 ? 255 : 0;
        karte.data[p + 2] = istGelaende ? 90 : 0;
        karte.data[p + 3] = 255;
      }
    }
    if (karte) {
      await fs.writeFile(path.join(path.resolve(ROOT, outArg), `${shot.name}-maske.png`), PNG.sync.write(karte));
    }
    vorDemGelaende += treffer;
    process.stdout.write(
      `${shot.name.padEnd(12)} Sternpixel ${String(sternPixel).padStart(6)}  Gelände ${String(gelaendePixel).padStart(7)}  ` +
        `Sterne VOR dem Gelände: ${treffer === 0 ? '0  ✓' : `${treffer}  ✗`}` +
        `  (an der Kante, gezählt nicht: ${amRand})\n`
    );
  }
  process.stdout.write(
    `\nSumme über ${rundgang ? 'alle zwölf Stationen' : 'alle sechs Kameras'}: ${vorDemGelaende}\n`
  );
} finally {
  await browser.close();
  await server.stop();
}
process.exit(vorDemGelaende === 0 ? 0 : 1);

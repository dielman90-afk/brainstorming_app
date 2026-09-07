// **Woher kommt das Kribbeln der Nadelkrone — differenziell und in Bewegung.**
//
//   node tools/kronenzittern.mjs [<shot>] [<x0,y0,x1,y1>]
//
// `laubprobe.mjs` misst den **Hochpass** eines Standbildes. Der sagt, wie viel
// Detail dasteht, nicht, ob es umspringt. Der Pruefer meldet aber Flimmern, und
// das ist eine Aussage ueber Bewegung.
//
// Gemessen wird deshalb wie in `kamm.mjs --dreh`: Die Kamera dreht sich um
// Viertelbildpunkte, und gemeldet wird der mittlere Betrag der Aenderung von
// Stellung zu Stellung. Das Ganze je Ursache einzeln abgeschaltet — die
// Differenz IST der Beitrag dieser Ursache.
//
// Warum nicht `kamm.mjs` mit Schaltern: Weil jede Variante vier Aufnahmen
// braucht und die Kamera dazwischen stehen bleiben muss. Das ist eine andere
// Schleife, nicht ein Zusatzschalter.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? '4-aerial';
const K = argv[1] ? argv[1].split(',').map(Number) : [606, 240, 659, 350];
const SCHRITTE = [0, 0.25, 0.5, 0.75];

const shot = shotsFor('island').find((s) => s.name === shotName);
if (!shot) throw new Error(`Kein Shot "${shotName}"`);
const d = [shot.look[0] - shot.pos[0], shot.look[1] - shot.pos[1], shot.look[2] - shot.pos[2]];
const laenge = Math.hypot(d[0], d[1], d[2]) || 1;
const blick = d.map((v) => v / laenge);
const proPunkt = (((shot.fov ?? 60) * Math.PI) / 180) / 720;
// Drehung um die Welt-Hochachse; nur die waagerechten Anteile aendern sich.
const gedreht = (w) => {
  const c = Math.cos(w);
  const s = Math.sin(w);
  const b = [blick[0] * c + blick[2] * s, blick[1], -blick[0] * s + blick[2] * c];
  return [0, 1, 2].map((i) => b[i] * laenge + shot.pos[i]);
};

const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const stelle = (page, was) =>
  page.evaluate((was) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    let n = 0;
    // **Welche Schicht zittert?** Die Krone besteht aus zwei Meshes: dem
    // Huellkoerper (island-krone, undurchsichtige Schoepfe) und den
    // Blattkarten davor (island-laub, alphagetestet). Sie einzeln
    // auszublenden trennt „die Kanten der Karten springen" von „der Koerper
    // selbst springt" — und das ist eine andere Frage als jeder
    // Materialschalter.
    g.traverse((o) => {
      if (o.name === 'island-laub') o.visible = was !== 'ohne Karten';
      if (o.name === 'island-krone') o.visible = was !== 'ohne Huellkoerper';
    });
    g.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        // Alphaschwelle plus Normalenkarte trifft genau das Laub — die Lehre
        // aus laubprobe.mjs: ueber den Programmschluessel zu filtern erwischt
        // nichts, weil addSkyRim das Material umhuellt.
        if (!(m.alphaTest > 0) || !m.normalMap) continue;
        n++;
        if (!m.userData.__zitterSicherung) {
          m.userData.__zitterSicherung = {
            normalScale: m.normalScale.clone(),
            roughness: m.roughness,
            alphaTest: m.alphaTest,
            a2c: m.alphaToCoverage,
            aniso: m.map ? m.map.anisotropy : 4,
            rauKarte: m.roughnessMap,
          };
        }
        const s = m.userData.__zitterSicherung;
        m.normalScale.copy(s.normalScale);
        m.roughness = s.roughness;
        m.alphaTest = s.alphaTest;
        m.alphaToCoverage = s.a2c;
        m.roughnessMap = s.rauKarte;
        for (const t of [m.map, m.normalMap, m.roughnessMap]) {
          if (t && t.anisotropy !== s.aniso) {
            t.anisotropy = s.aniso;
            t.needsUpdate = true;
          }
        }
        if (was === 'ohne Normalenkarte') m.normalScale.set(0, 0);
        if (was === 'ohne Rauheitskarte') m.roughnessMap = null;
        if (was === 'ohne alphaToCoverage') m.alphaToCoverage = false;
        if (was === 'Anisotropie 16') {
          for (const t of [m.map, m.normalMap, m.roughnessMap]) {
            if (t) {
              t.anisotropy = 16;
              t.needsUpdate = true;
            }
          }
        }
        if (was === 'Alphaschwelle 0,20') m.alphaTest = 0.2;
        if (was === 'Alphaschwelle 0,60') m.alphaTest = 0.6;
        m.needsUpdate = true;
      }
    });
    return n;
  }, was);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  process.stdout.write(
    `${shotName}, Kasten ${K.join(',')} — Drehung ${SCHRITTE.join(' / ')} Bildpunkte\n\n` +
      `${'Variante'.padEnd(26)}${'Mittel'.padStart(9)}${'Streuung'.padStart(10)}${'Zittern'.padStart(9)}${'Quotient'.padStart(10)}${'max dL'.padStart(8)}\n`
  );
  for (const was of [
    'stand',
    'ohne Normalenkarte',
    'ohne Rauheitskarte',
    'ohne alphaToCoverage',
    'Anisotropie 16',
    'Alphaschwelle 0,20',
    'Alphaschwelle 0,60',
    'ohne Karten',
    'ohne Huellkoerper',
  ]) {
    const treffer = await stelle(page, was);
    const bilder = [];
    for (const s of SCHRITTE) {
      await lockCamera(page, { ...shot, look: gedreht(s * proPunkt) }, 6.0);
      await page.waitForTimeout(340);
      bilder.push(PNG.sync.read(await page.screenshot()));
    }
    const werte = [];
    let zit = 0;
    let maxD = 0;
    let zahl = 0;
    for (let y = K[1]; y <= K[3]; y++)
      for (let x = K[0]; x <= K[2]; x++) {
        const i = (y * bilder[0].width + x) * 4;
        werte.push(L(bilder[0], i));
        for (let k = 1; k < bilder.length; k++) {
          const dd = Math.abs(L(bilder[k], i) - L(bilder[k - 1], i));
          zit += dd;
          if (dd > maxD) maxD = dd;
          zahl++;
        }
      }
    const m = werte.reduce((a, v) => a + v, 0) / werte.length;
    const sd = Math.sqrt(werte.reduce((a, v) => a + (v - m) ** 2, 0) / werte.length);
    const z = zit / zahl;
    process.stdout.write(
      `${`${was} (${treffer})`.padEnd(26)}${m.toFixed(1).padStart(9)}${sd.toFixed(1).padStart(10)}` +
        `${z.toFixed(2).padStart(9)}${(z / Math.max(0.01, sd)).toFixed(3).padStart(10)}${maxD.toFixed(0).padStart(8)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

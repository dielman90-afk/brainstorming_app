// **Welche Farbe hat die Wasserfläche wirklich — und schwankt sie mit der
// Kamera?**
//
//   node tools/wasserton.mjs [--env zen] [--knoten zen-wasser] [shot …]
//
// Der Prüfer meldete, der Teich sei „eine opake Milchglasplatte", die
// „unmotiviert die Farbe mit dem Blickwinkel wechselt". Beide Hälften des
// Befunds sind messbar, aber nur mit einer sauberen Maske: Punktproben aus
// dem Prüferbericht treffen bei anderer Kamera Kies oder Laub.
//
// Die Maske entsteht differenziell — Wasserfläche aus, Bild, Wasserfläche an,
// Bild; was sich geändert hat, IST das Wasser. Ausgegeben werden Mittelwert,
// Perzentile, Sättigung und Farbton je Kamera, dazu die Spannweite über alle
// Kameras. Erst diese Spannweite beantwortet die Frage nach dem Wechsel.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
let KNOTEN = 'zen-wasser';
const ki = argv.indexOf('--knoten');
if (ki >= 0) KNOTEN = argv[ki + 1];
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && argv[i - 1] !== '--knoten');
// **Durchblick**: Wie viel vom Beckengrund kommt durch die Wasserfläche? Das
// ist die zweite Hälfte des Milchglas-Befunds — eine Fläche, durch die man am
// Ufer NICHT und in der Mitte SEHR WOHL sieht, steht auf dem Kopf.
const DURCHBLICK = argv.includes('--durchblick');
// **Zutaten**: Woraus besteht das Bild der Wasserflaeche eigentlich? Solange
// das nicht aufgeteilt ist, schraubt man an der Farbe einer Flaeche, deren
// Bild zu drei Vierteln aus der Spiegelung kommt.
const ZUTATEN = argv.includes('--zutaten');

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// HSV-Farbton in Grad und Sättigung 0..1 — die Sprache, in der „blaugrün"
// gegen „graugrün" überhaupt vergleichbar wird.
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
  const alle = shotsFor(ENV);
  const shots = rest.length ? alle.filter((s) => rest.includes(s.name)) : alle;

  const sichtbar = (an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.visible = an;
        });
      },
      { an, name: KNOTEN, gruppe: `env-${ENV}` }
    );

  const bild = async () => {
    await page.waitForTimeout(350);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };

  const zeilen = [];
  for (const shot of shots) {
    await lockCamera(page, shot, 6.0);
    await sichtbar(true);
    const mit = await bild();
    await sichtbar(false);
    const ohne = await bild();
    await sichtbar(true);

    const px = [];
    for (let i = 0; i < mit.data.length; i += 4) {
      const dr = mit.data[i] - ohne.data[i];
      const dg = mit.data[i + 1] - ohne.data[i + 1];
      const db = mit.data[i + 2] - ohne.data[i + 2];
      // Schwelle 6: darunter liegt das Rauschen der Kräuselung, die auch ohne
      // Wasserfläche nicht exakt reproduziert (Zeituniform läuft weiter).
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 6) continue;
      px.push([mit.data[i], mit.data[i + 1], mit.data[i + 2]]);
    }
    if (px.length < 200) {
      zeilen.push({ name: shot.name, n: px.length });
      process.stdout.write(`${shot.name.padEnd(12)}  nur ${px.length} px — Fläche nicht im Bild\n`);
      continue;
    }
    let durchblick = null;
    if (DURCHBLICK) {
      // Maske ist bekannt; jetzt den Grund abschalten und im selben Fleck
      // messen, wie stark sich das Bild ändert.
      await page.evaluate(
        ({ gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            if (o.name === 'zen-teichbecken') o.visible = false;
          });
        },
        { gruppe: `env-${ENV}` }
      );
      const ohneGrund = await bild();
      await page.evaluate(
        ({ gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          g.traverse((o) => {
            if (o.name === 'zen-teichbecken') o.visible = true;
          });
        },
        { gruppe: `env-${ENV}` }
      );
      let summe = 0;
      let n = 0;
      for (let i = 0; i < mit.data.length; i += 4) {
        const dr = mit.data[i] - ohne.data[i];
        const dg = mit.data[i + 1] - ohne.data[i + 1];
        const db = mit.data[i + 2] - ohne.data[i + 2];
        if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 6) continue;
        summe += Math.abs(lum(mit.data[i], mit.data[i + 1], mit.data[i + 2]) -
          lum(ohneGrund.data[i], ohneGrund.data[i + 1], ohneGrund.data[i + 2]));
        n++;
      }
      durchblick = n ? summe / n : 0;
      // Und was liegt ueberhaupt darunter? Wenn Grund und Wasser sich in
      // Helligkeit und Ton kaum unterscheiden, bleibt der Durchblick klein,
      // egal wie durchsichtig die Flaeche gestellt wird. Ohne diese Zahl
      // schraubt man an der Deckkraft und misst das Nichts darunter.
      let gr = 0;
      let gg = 0;
      let gb = 0;
      let gn = 0;
      for (let i = 0; i < mit.data.length; i += 4) {
        const dr = mit.data[i] - ohne.data[i];
        const dg = mit.data[i + 1] - ohne.data[i + 1];
        const db = mit.data[i + 2] - ohne.data[i + 2];
        if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 6) continue;
        gr += ohne.data[i];
        gg += ohne.data[i + 1];
        gb += ohne.data[i + 2];
        gn++;
      }
      if (gn) {
        const [gh, gs] = hsv(gr / gn, gg / gn, gb / gn);
        durchblick = {
          d: n ? summe / n : 0,
          gL: lum(gr / gn, gg / gn, gb / gn),
          gh,
          gs,
        };
      }
    }
    let zutaten = null;
    if (ZUTATEN) {
      const stellen = async (feld, wert) =>
        page.evaluate(
          ({ feld, wert, name, gruppe }) => {
            const g = window.__app.scene.children.find((c) => c.name === gruppe);
            g.traverse((o) => {
              if (o.name !== name || !o.material) return;
              window.__merk = window.__merk ?? {};
              if (!(feld in window.__merk)) window.__merk[feld] = o.material[feld];
              o.material[feld] = wert === null ? window.__merk[feld] : wert;
              o.material.needsUpdate = true;
            });
          },
          { feld, wert, name: KNOTEN, gruppe: `env-${ENV}` }
        );
      const mittel = (bild) => {
        let su = 0;
        let n = 0;
        for (let i = 0; i < mit.data.length; i += 4) {
          const dr = mit.data[i] - ohne.data[i];
          const dg = mit.data[i + 1] - ohne.data[i + 1];
          const db = mit.data[i + 2] - ohne.data[i + 2];
          if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 6) continue;
          su += lum(bild.data[i], bild.data[i + 1], bild.data[i + 2]);
          n++;
        }
        return n ? su / n : 0;
      };
      const voll = mittel(mit);
      await stellen('clearcoat', 0);
      const ohneLack = mittel(await bild());
      await stellen('clearcoat', null);
      await stellen('envMapIntensity', 0);
      const ohneKarte = mittel(await bild());
      await stellen('clearcoat', 0);
      const nackt = mittel(await bild());
      await stellen('clearcoat', null);
      await stellen('envMapIntensity', null);
      zutaten = { voll, lack: voll - ohneLack, karte: voll - ohneKarte, nackt };
    }
    const L = px.map(([r, g, b]) => lum(r, g, b)).sort((a, b) => a - b);
    const p = (q) => L[Math.min(L.length - 1, Math.floor(q * L.length))];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (const [r, g, b] of px) {
      sr += r;
      sg += g;
      sb += b;
    }
    const mr = sr / px.length;
    const mg = sg / px.length;
    const mb = sb / px.length;
    const [h, s] = hsv(mr, mg, mb);
    const eintrag = {
      name: shot.name,
      n: px.length,
      rgb: [mr, mg, mb],
      L: L.reduce((a, b) => a + b, 0) / L.length,
      p05: p(0.05),
      p50: p(0.5),
      p95: p(0.95),
      max: L[L.length - 1],
      h,
      s,
    };
    zeilen.push(eintrag);
    process.stdout.write(
      `${shot.name.padEnd(12)} n=${String(px.length).padStart(6)}  ` +
        `rgb ${mr.toFixed(0).padStart(3)},${mg.toFixed(0).padStart(3)},${mb.toFixed(0).padStart(3)}  ` +
        `L ${eintrag.L.toFixed(1).padStart(5)}  p05 ${eintrag.p05.toFixed(0).padStart(3)}  ` +
        `p50 ${eintrag.p50.toFixed(0).padStart(3)}  p95 ${eintrag.p95.toFixed(0).padStart(3)}  ` +
        `max ${eintrag.max.toFixed(0).padStart(3)}  ` +
        `Ton ${h.toFixed(0).padStart(3)}°  Saett ${(s * 100).toFixed(1).padStart(5)}%` +
        (durchblick === null
          ? ''
          : `  Durchblick ${durchblick.d.toFixed(1).padStart(5)}` +
            `  Grund L ${durchblick.gL.toFixed(0).padStart(3)} Ton ${durchblick.gh.toFixed(0).padStart(3)}° ` +
            `Saett ${(durchblick.gs * 100).toFixed(0).padStart(3)}%`) +
        (zutaten === null
          ? ''
          : `  | voll ${zutaten.voll.toFixed(1)}  Lackschicht ${zutaten.lack.toFixed(1)}` +
            `  Umgebungskarte gesamt ${zutaten.karte.toFixed(1)}  ohne beides ${zutaten.nackt.toFixed(1)}`) + '\n'
    );
  }

  const gut = zeilen.filter((z) => z.rgb);
  if (gut.length > 1) {
    const sp = (f) => {
      const v = gut.map(f);
      return Math.max(...v) - Math.min(...v);
    };
    process.stdout.write(
      `\nSpannweite ueber ${gut.length} Kameras: ` +
        `L ${sp((z) => z.L).toFixed(1)}  ` +
        `Ton ${sp((z) => z.h).toFixed(0)}deg  ` +
        `Saett ${(sp((z) => z.s) * 100).toFixed(1)}%  ` +
        `Binnenkontrast p95-p05 ${gut.map((z) => (z.p95 - z.p05).toFixed(0)).join(' / ')}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

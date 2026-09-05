// Bewegt sich die Szene wirklich — und bewegt sie sich uneinheitlich?
//
//   node tools/bewegung.mjs
//
// Die sechs Prüfbilder stehen auf einem eingefrorenen Zeitpunkt; sie können
// über Bewegung nichts aussagen. Der Prüfer hat das im ersten Bericht richtig
// eingeordnet („aus dem Szenenzustand gelesen, nicht aus den Standbildern") und
// die eine Zeile `starsGroup.rotation.y = time * 0.004` als wörtliche
// Definition dessen benannt, was das Kriterium ausschließt: alles im Gleichtakt.
//
// Dieses Werkzeug rendert dieselbe Kamera zu vielen Zeitpunkten und beantwortet
// zwei Fragen mit Zahlen:
//
//   1. **Bewegt sich jeder Teil für sich?** Je Teil wird der Beitrag gemessen,
//      indem einmal mit und einmal ohne ihn gerendert wird.
//   2. **Ist etwas im Gleichtakt?** Wenn zwei Teile dieselbe Periode hätten,
//      wären ihre Beitragsreihen über die Zeit korreliert. Gemeldet wird die
//      Korrelation je Paar — nahe 1 wäre Gleichtakt.
import { PNG } from 'pngjs';
import { startServer, launchBrowser, openApp, selectEnv, lockCamera, shotsFor } from './harness-common.mjs';

const TEILE = ['nacht-staub', 'nacht-staubteufel', 'nacht-meteor', 'nacht-sterne'];
const ZEITEN = Array.from({ length: 24 }, (_, i) => 4 + i * 1.7);

// **Die Uhr wird umgehängt, nicht gestellt.** Ein einzelner Aufruf mit der
// gewünschten Zeit hilft nicht: Die Renderschleife der App ruft `env.update()`
// in jedem Bild erneut auf, und das ist nach `selectEnv` der einfrierende
// Verschluss — er setzt die Uniformen sofort auf `FROZEN_TIME` zurück. Der
// erste Anlauf dieses Werkzeugs hat deshalb an 24 Zeitpunkten exakt denselben
// Wert gemessen, ohne dass etwas kaputt gewesen wäre.
const setzeZeit = (page, t) =>
  page.evaluate((t) => {
    const env = window.__app.env.environments.find((e) => e.id === 'night');
    const original = env.__originalUpdate ?? env.update;
    env.update = () => original(t);
    original(t);
  }, t);

const sichtbar = (page, name, an) =>
  page.evaluate(({ name, an }) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-night');
    g.traverse((o) => { if (o.name === name) o.visible = an; });
  }, { name, an });

const anteil = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const p = i * 4;
    const d = Math.max(Math.abs(a.data[p] - b.data[p]), Math.abs(a.data[p + 1] - b.data[p + 1]), Math.abs(a.data[p + 2] - b.data[p + 2]));
    if (d >= 3) n++;
  }
  return (n / (a.width * a.height)) * 100;
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  // Die Uhr der Umgebung wird vom Harness festgehalten; hier wird sie je
  // Messpunkt von Hand gestellt.
  const shot = shotsFor('night').find((s) => s.name === 'a-eyelevel');
  await lockCamera(page, shot, 6.0);

  const reihen = Object.fromEntries(TEILE.map((t) => [t, []]));
  for (const t of ZEITEN) {
    await setzeZeit(page, t);
    await page.waitForTimeout(90);
    const voll = PNG.sync.read(await page.screenshot());
    for (const teil of TEILE) {
      await sichtbar(page, teil, false);
      await setzeZeit(page, t);
      await page.waitForTimeout(60);
      const ohne = PNG.sync.read(await page.screenshot());
      await sichtbar(page, teil, true);
      reihen[teil].push(anteil(voll, ohne));
    }
  }

  process.stdout.write('Beitrag je Teil in % der Bildpunkte, über 24 Zeitpunkte (4,0 s bis 43,1 s):\n\n');
  for (const teil of TEILE) {
    const r = reihen[teil];
    const mittel = r.reduce((s, v) => s + v, 0) / r.length;
    process.stdout.write(
      `  ${teil.padEnd(20)} Mittel ${mittel.toFixed(3)} %  min ${Math.min(...r).toFixed(3)}  max ${Math.max(...r).toFixed(3)}\n`
    );
  }

  // **Der Meteor braucht eine eigene Kamera und eigene Zeitpunkte.** In
  // `a-eyelevel` liegt seine Bahn außerhalb des Blickfelds, und selbst dort, wo
  // sie im Bild liegt, ist er nur zu 3,5 % der Zeit sichtbar (1,1 s je 31 s).
  // Ein Stichprobenraster von 1,7 s trifft das Fenster meistens nicht — der
  // erste Anlauf meldete deshalb an 24 Zeitpunkten 0,000 % und sah aus wie ein
  // Fehler, obwohl der Meteor tadellos lief.
  {
    const shotB = shotsFor('night').find((s) => s.name === 'b-moon');
    await lockCamera(page, shotB, 6.0);
    const reihe = [];
    for (const t of [0.05, 0.25, 0.45, 0.65, 0.85, 1.05, 1.3, 4.0, 15.0, 30.9, 31.3]) {
      await setzeZeit(page, t);
      await page.waitForTimeout(80);
      const voll = PNG.sync.read(await page.screenshot());
      await sichtbar(page, 'nacht-meteor', false);
      await setzeZeit(page, t);
      await page.waitForTimeout(60);
      const ohne = PNG.sync.read(await page.screenshot());
      await sichtbar(page, 'nacht-meteor', true);
      reihe.push([t, anteil(voll, ohne)]);
    }
    process.stdout.write('\nMeteor in b-moon, über eine Periode (31 s, davon 1,1 s sichtbar):\n\n');
    for (const [t, a] of reihe) {
      process.stdout.write(`  t = ${String(t).padStart(5)} s   ${a.toFixed(3)} %${a > 0.001 ? '  sichtbar' : ''}\n`);
    }
  }

  const korr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let za = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { za += (a[i] - ma) * (b[i] - mb); na += (a[i] - ma) ** 2; nb += (b[i] - mb) ** 2; }
    return za / Math.sqrt(Math.max(1e-9, na * nb));
  };
  process.stdout.write('\nKorrelation der Beitragsreihen (nahe 1 waere Gleichtakt):\n\n');
  for (let i = 0; i < TEILE.length; i++) {
    for (let j = i + 1; j < TEILE.length; j++) {
      process.stdout.write(`  ${TEILE[i].padEnd(20)} ${TEILE[j].padEnd(20)} r = ${korr(reihen[TEILE[i]], reihen[TEILE[j]]).toFixed(3)}\n`);
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

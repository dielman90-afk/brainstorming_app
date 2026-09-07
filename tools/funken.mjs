// **Wie viele Einzelpunkte funkeln?**
//
//   node tools/funken.mjs [--env matrix] <shot> <x0,y0,x1,y1:Name> ...
//
// Der mittlere Nachbarunterschied sagt nichts ueber Funkeln: Ein Bereich kann
// im Mittel ruhig sein und trotzdem voller einzelner fast weisser Punkte
// stecken. Genau das meldet der Pruefer am Leder — „Streusalz", Einzelspruenge
// bis 86 Stufen bei 1 Bildpunkt Breite.
//
// Gezaehlt wird deshalb der **Ausreisser**: ein Punkt, der sein Viererumfeld um
// mehr als eine Schwelle uebersteigt. Das ist die Groesse, die in Bewegung als
// Kribbeln wahrgenommen wird — nicht der Mittelwert.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'matrix');
const rest = argv.filter((a, i) => a !== '--env' && a !== '--sweep' && argv[i - 1] !== '--env');
const shotName = rest[0];
const BEREICHE = rest.slice(1).map((s) => {
  const [z, name] = s.split(':');
  const [x0, y0, x1, y1] = z.split(',').map(Number);
  return { x0, y0, x1, y1, name: name ?? z };
});
const SCHWELLEN = [15, 25, 40];
// Optionaler Durchlauf ueber Ledereinstellungen: `--sweep`.
const SWEEP = argv.includes('--sweep');
const STELLUNGEN = [
  { name: 'Stand' },
  { normal: 0.45 },
  { normal: 0.3 },
  { roughness: 0.55 },
  { roughness: 0.55, normal: 0.45 },
  { roughness: 0.65, normal: 0.45 },
];
const L = (p, x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  await lockCamera(page, shot, 6.0);
  await page.waitForTimeout(400);
  process.stdout.write(
    `${shotName}\n${'Bereich'.padEnd(26)}${'Punkte'.padStart(8)}` +
      SCHWELLEN.map((t) => `  >Umfeld+${t}`).join('') +
      `${'groesster'.padStart(11)}\n`
  );
  const stelle = (w) =>
    page.evaluate((w) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
      const gesehen = new Set();
      g.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m.normalMap || gesehen.has(m)) continue;
          gesehen.add(m);
          if (m.userData.__alt === undefined)
            m.userData.__alt = { r: m.roughness, n: m.normalScale.x };
          const a = m.userData.__alt;
          m.roughness = w.roughness ?? a.r;
          m.normalScale.set(w.normal ?? a.n, w.normal ?? a.n);
          m.needsUpdate = true;
        }
      });
    }, w);
  for (const stellung of SWEEP ? STELLUNGEN : [{ name: 'Stand' }]) {
   await stelle(stellung);
   await page.waitForTimeout(300);
   const p = PNG.sync.read(await page.screenshot());
   const etikett = stellung.name ?? `r${stellung.roughness ?? '-'} n${stellung.normal ?? '-'}`;
   for (const b of BEREICHE) {
    let n = 0;
    const zahl = SCHWELLEN.map(() => 0);
    let groesster = 0;
    for (let y = b.y0 + 1; y < b.y1; y++) {
      for (let x = b.x0 + 1; x < b.x1; x++) {
        const v = L(p, x, y);
        const um = (L(p, x - 1, y) + L(p, x + 1, y) + L(p, x, y - 1) + L(p, x, y + 1)) / 4;
        const d = v - um;
        n++;
        if (d > groesster) groesster = d;
        SCHWELLEN.forEach((t, i) => {
          if (d > t) zahl[i]++;
        });
      }
    }
    process.stdout.write(
      `${(etikett + ' ' + b.name).padEnd(26)}${String(n).padStart(8)}` +
        zahl.map((z) => `${((z * 100) / n).toFixed(3)}%`.padStart(12)).join('') +
        `${groesster.toFixed(0).padStart(11)}\n`
    );
   }
  }
} finally {
  await browser.close();
  await server.stop();
}

// Diagnose-Werkzeug: listet auf, woraus sich Draw-Calls und Dreiecke einer
// Umgebung zusammensetzen, und misst den Software-Rasterizer-Boden
// (leere Umgebung) als Bezugspunkt für die Frame-Zeiten.
//
//   node tools/inspect.mjs [--env zen|island] [--shot <name>]
//
// Ohne --shot wird über alle festen Kameras der Umgebung gemessen; die Spalte
// `sicht` zählt, in wie vielen dieser Ansichten der Knoten tatsächlich
// gezeichnet wurde (Frustum-Culling). Nur was in einer Ansicht sichtbar ist,
// zählt gegen das Draw-Call-Budget.

import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv);
const SHOTS = shotsFor(envId);
const shotFilter = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : null;
const useShots = shotFilter ? SHOTS.filter((s) => s.name === shotFilter) : SHOTS;

const server = await startServer();
const browser = await launchBrowser({ perf: true });
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);

  // Je Kamera einmal rendern und mitzählen, was wirklich gezeichnet wurde.
  const perShot = [];
  for (const shot of useShots) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(350);
    perShot.push(
      await page.evaluate((envId) => {
        const { scene, camera, renderer } = window.__app;
        renderer.render(scene, camera);
        const group = scene.children.find((c) => c.name === `env-${envId}`);

        // Sichtbarkeitsprüfung wie in three: Frustum gegen die Weltkugel.
        // `window.__app` reicht THREE nicht durch, und dafür src/ anzufassen
        // wäre falsch herum – die sechs Ebenen aus der Sicht-Projektions-
        // Matrix zu ziehen ist zwanzig Zeilen reines Rechnen.
        const mul = (a, b) => {
          const o = new Array(16);
          for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
              o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
          }
          return o;
        };
        const m = mul(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements);
        const ebene = (x, y, z, w) => {
          const l = Math.hypot(x, y, z);
          return [x / l, y / l, z / l, w / l];
        };
        const planes = [
          ebene(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]),
          ebene(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]),
          ebene(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]),
          ebene(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]),
          ebene(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]),
          ebene(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]),
        ];
        const kugelSichtbar = (cx, cy, cz, r) =>
          planes.every((p) => p[0] * cx + p[1] * cy + p[2] * cz + p[3] >= -r);
        const rows = [];
        group.traverse((o) => {
          if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
          const g = o.geometry;
          const idx = g.index ? g.index.count : g.attributes.position?.count || 0;
          const inst = o.isInstancedMesh ? o.count : 1;
          const tris = o.isMesh ? Math.round((idx / 3) * inst) : 0;
          const mats = Array.isArray(o.material) ? o.material.length : 1;
          let sichtbar = o.visible;
          for (let p = o.parent; p && sichtbar; p = p.parent) sichtbar = p.visible;
          if (sichtbar && o.frustumCulled) {
            if (!g.boundingSphere) g.computeBoundingSphere();
            const bs = g.boundingSphere;
            const e = o.matrixWorld.elements;
            const c = bs.center;
            const wx = e[0] * c.x + e[4] * c.y + e[8] * c.z + e[12];
            const wy = e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13];
            const wz = e[2] * c.x + e[6] * c.y + e[10] * c.z + e[14];
            const sx = Math.hypot(e[0], e[1], e[2]);
            const sy = Math.hypot(e[4], e[5], e[6]);
            const sz = Math.hypot(e[8], e[9], e[10]);
            sichtbar = kugelSichtbar(wx, wy, wz, bs.radius * Math.max(sx, sy, sz));
          }
          const key =
            o.name ||
            (o.isInstancedMesh ? 'InstancedMesh' : o.isPoints ? 'Points' : o.isSprite ? 'Sprite' : o.type) +
              ':' +
              (g.type || '?');
          rows.push({ key, tris, mats, sichtbar, uuid: o.uuid });
        });
        return {
          rows,
          rendered: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles },
        };
      }, envId)
    );
  }

  // Zusammenfassen: pro Art einmal, Sichtbarkeit über alle Kameras zählen.
  const tally = new Map();
  const gesehen = new Map();
  for (const shot of perShot) {
    for (const r of shot.rows) {
      const t = tally.get(r.key) || { count: 0, calls: 0, tris: 0, sicht: 0 };
      if (shot === perShot[0]) {
        t.count++;
        t.calls += r.mats;
        t.tris += r.tris;
      }
      tally.set(r.key, t);
      if (r.sichtbar) {
        if (!gesehen.has(r.key)) gesehen.set(r.key, new Set());
        gesehen.get(r.key).add(r.uuid);
      }
    }
  }
  for (const [k, t] of tally) t.sicht = gesehen.get(k)?.size || 0;

  const report = {
    byKind: [...tally.entries()].map(([k, v]) => ({ kind: k, ...v })).sort((a, b) => b.calls - a.calls),
    totalNodes: perShot[0].rows.length,
    totalPotentialCalls: perShot[0].rows.reduce((s, r) => s + r.mats, 0),
    totalTris: perShot[0].rows.reduce((s, r) => s + r.tris, 0),
    proShot: useShots.map((s, i) => ({ name: s.name, ...perShot[i].rendered })),
  };

  process.stdout.write(`Aufschlüsselung der Umgebung env-${envId}\n`);
  process.stdout.write(
    'kind'.padEnd(34) + 'nodes'.padStart(7) + 'calls'.padStart(7) + 'sicht'.padStart(7) + 'tris'.padStart(9) + '\n'
  );
  for (const r of report.byKind) {
    process.stdout.write(
      String(r.kind).slice(0, 33).padEnd(34) +
        String(r.count).padStart(7) +
        String(r.calls).padStart(7) +
        String(r.sicht).padStart(7) +
        String(r.tris).padStart(9) +
        '\n'
    );
  }
  process.stdout.write(
    `\nKnoten gesamt ${report.totalNodes}, potentielle Calls ${report.totalPotentialCalls}, Dreiecke ${report.totalTris}\n`
  );
  for (const s of report.proShot) {
    process.stdout.write(`  ${s.name.padEnd(14)} calls ${String(s.calls).padStart(4)}  tris ${String(s.tris).padStart(7)}\n`);
  }

  // Software-Rasterizer-Boden: leere weiße Umgebung, gleiche Auflösung.
  //
  // **Der Boden ist eine Nebenauskunft und darf den Lauf nicht kippen.** Die
  // Budgetzahlen darüber sind das, wofür dieses Werkzeug da ist; die Frame-Zeit
  // ist nur ein Bezugspunkt für den Software-Rasterizer und sagt nichts über
  // die Brille.
  //
  // Zwei Läufe sind hier an „Execution context was destroyed" gescheitert, und
  // beide Male lag es nicht am Werkzeug: Ich hatte `src/environments.js`
  // bearbeitet, **während** der Lauf lief, und Vite hat die Seite neu geladen.
  // Ein Lauf ohne Eingriff kommt sauber durch. Das `try` bleibt trotzdem — es
  // kostet nichts und hält die Budgetzahlen fest, wenn der Seitenkontext aus
  // welchem Grund auch immer wegbricht.
  try {
    await selectEnv(page, 'matrix');
    await page.waitForTimeout(300);
    const floor = await page.evaluate(async () => {
      const { renderer, scene, camera } = window.__app;
      const gl = renderer.getContext();
      const times = [];
      for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        renderer.render(scene, camera);
        gl.finish();
        times.push(performance.now() - t0);
      }
      return +(times.slice(10).reduce((s, v) => s + v, 0) / (times.length - 10)).toFixed(2);
    });
    process.stdout.write(`\nSoftware-Boden (⬜ Konstrukt, 1280x720): ${floor} ms/Frame\n`);
  } catch (e) {
    process.stdout.write(`\nSoftware-Boden: nicht gemessen — ${String(e).split('\n')[0]}\n`);
  }
} finally {
  await browser.close();
  await server.stop();
}

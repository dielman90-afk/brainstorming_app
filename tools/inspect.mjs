// Diagnose-Werkzeug: listet auf, woraus sich Draw-Calls und Dreiecke der
// Insel-Umgebung zusammensetzen, und misst den Software-Rasterizer-Boden
// (leere Umgebung) als Bezugspunkt für die Frame-Zeiten.
//
//   node tools/inspect.mjs

import { SHOTS, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser({ perf: true });
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, SHOTS[3], 6.0);
  await page.waitForTimeout(400);

  const report = await page.evaluate(() => {
    const { scene, camera, renderer } = window.__app;
    renderer.render(scene, camera);
    const group = scene.children.find((c) => c.name === 'env-island');

    const rows = [];
    const tally = new Map();
    group.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
      const g = o.geometry;
      const idx = g.index ? g.index.count : g.attributes.position?.count || 0;
      const inst = o.isInstancedMesh ? o.count : 1;
      const tris = o.isMesh ? Math.round((idx / 3) * inst) : 0;
      const mats = Array.isArray(o.material) ? o.material.length : 1;
      const key =
        o.name ||
        (o.isInstancedMesh ? 'InstancedMesh' : o.isPoints ? 'Points' : o.isSprite ? 'Sprite' : o.type) +
          ':' +
          (g.type || '?');
      const t = tally.get(key) || { count: 0, calls: 0, tris: 0 };
      t.count++;
      t.calls += mats;
      t.tris += tris;
      tally.set(key, t);
      rows.push({ key, tris, mats });
    });
    return {
      byKind: [...tally.entries()]
        .map(([k, v]) => ({ kind: k, ...v }))
        .sort((a, b) => b.calls - a.calls),
      totalNodes: rows.length,
      totalPotentialCalls: rows.reduce((s, r) => s + r.mats, 0),
      totalTris: rows.reduce((s, r) => s + r.tris, 0),
      rendered: { calls: renderer.info.render.calls, tris: renderer.info.render.triangles },
    };
  });

  process.stdout.write('Aufschlüsselung der Insel-Umgebung (env-island)\n');
  process.stdout.write('kind'.padEnd(34) + 'nodes'.padStart(7) + 'calls'.padStart(7) + 'tris'.padStart(9) + '\n');
  for (const r of report.byKind) {
    process.stdout.write(
      String(r.kind).slice(0, 33).padEnd(34) +
        String(r.count).padStart(7) +
        String(r.calls).padStart(7) +
        String(r.tris).padStart(9) +
        '\n'
    );
  }
  process.stdout.write(
    `\nKnoten gesamt ${report.totalNodes}, potentielle Calls ${report.totalPotentialCalls}, Dreiecke ${report.totalTris}\n`
  );
  process.stdout.write(`Gerendert (Totale): calls ${report.rendered.calls}, tris ${report.rendered.tris}\n`);

  // Software-Rasterizer-Boden: leere weiße Umgebung, gleiche Auflösung.
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
} finally {
  await browser.close();
  await server.stop();
}

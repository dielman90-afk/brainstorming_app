// Mess-Harness: Draw-Calls, Dreiecke, Shader-Programme, Texturspeicher und
// mittlere Frame-/Renderzeit einer Umgebung.
//
//   node tools/measure.mjs --out tools/metrics/run-00.json [--env zen|island]
//
// Gemessen wird an denselben Kamerapositionen wie die Screenshots, weil
// Draw-Calls durch Frustum-Culling blickabhängig sind. Berichtet werden der
// Höchstwert (das ist die Budgetgrenze) und die Einzelwerte.
//
// WICHTIG zur Frame-Zeit: Der Container hat keine GPU, Chromium rendert per
// SwiftShader in Software. Die Millisekunden sind daher kein Quest-3-Wert,
// sondern ein reproduzierbarer Vergleichsmaßstab zwischen zwei Ständen.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  shotsFor,
  envArg,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
} from './harness-common.mjs';

const argv = process.argv.slice(2);
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'tools/metrics/latest.json';
const outFile = path.resolve(ROOT, outArg);
const envId = envArg(argv);
const SHOTS = shotsFor(envId);
// 60 statt 300 Frames je Kamera. Der Container hat keine GPU; seit die Insel
// das Alpha-Karten-Laub trägt, kostet ein Bild im Software-Rasterizer bis zu
// einer Sekunde – 300 Frames × 6 Kameras wären über eine halbe Stunde für eine
// Zahl, die ohnehin kein Budgetkriterium ist (siehe Kopf dieser Datei).
// Draw-Calls, Dreiecke und Texturspeicher – die belastbaren Werte – stehen
// nach dem ersten Bild fest.
const FRAMES = 60;

const server = await startServer();
const browser = await launchBrowser({ perf: true });
const result = { generatedAt: new Date().toISOString(), viewport: '1280x720 (SwiftShader)', shots: {} };
try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, envId);

  // --- Statik: Texturspeicher & Geometrie der Umgebungsgruppe ---
  result.env = envId;
  result.static = await page.evaluate((envId) => {
    const { scene } = window.__app;
    const group = scene.children.find((c) => c.name === `env-${envId}`);
    const textures = new Map();
    let triangles = 0;
    let meshes = 0;
    const addTex = (t) => {
      if (!t || textures.has(t.uuid)) return;
      const img = t.image || {};
      const w = img.width || 0;
      const h = img.height || 0;
      const mip = t.generateMipmaps === false ? 1 : 4 / 3;
      textures.set(t.uuid, Math.round(w * h * 4 * mip));
    };
    group.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) meshes++;
      const g = o.geometry;
      if (g) {
        const count = g.index ? g.index.count : g.attributes.position?.count || 0;
        const inst = o.isInstancedMesh ? o.count : 1;
        if (o.isMesh) triangles += (count / 3) * inst;
      }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap']) {
          addTex(m[key]);
        }
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) addTex(u.value);
      }
    });
    let bytes = 0;
    for (const b of textures.values()) bytes += b;
    return {
      envTriangles: Math.round(triangles),
      envNodes: meshes,
      textureCount: textures.size,
      textureBytes: bytes,
      textureMB: +(bytes / 1048576).toFixed(2),
    };
  }, envId);

  // --- Pro Kameraposition: Draw-Calls, Dreiecke, Programme, Frame-Zeit ---
  for (const shot of SHOTS) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(300);
    const m = await page.evaluate(async (frames) => {
      const { renderer } = window.__app;
      const gl = renderer.getContext();
      const original = renderer.render.bind(renderer);
      const renderTimes = [];
      const rafTimes = [];
      let last = performance.now();
      renderer.render = function (scene, camera) {
        const t0 = performance.now();
        original(scene, camera);
        gl.finish();
        const t1 = performance.now();
        renderTimes.push(t1 - t0);
        rafTimes.push(t0 - last);
        last = t0;
      };
      await new Promise((resolve) => {
        const check = () => (renderTimes.length >= frames ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      });
      renderer.render = original;
      const info = renderer.info;
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const sorted = [...renderTimes].sort((a, b) => a - b);
      return {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        programs: info.programs.length,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        renderMsMean: +mean(renderTimes).toFixed(2),
        renderMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        frameMsMean: +mean(rafTimes.slice(1)).toFixed(2),
      };
    }, FRAMES);
    result.shots[shot.name] = m;
    process.stdout.write(
      `${shot.name.padEnd(16)} calls ${String(m.drawCalls).padStart(4)}  tris ${String(m.triangles).padStart(7)}  render ${String(m.renderMsMean).padStart(7)} ms\n`
    );
  }

  const shots = Object.values(result.shots);
  result.summary = {
    drawCallsMax: Math.max(...shots.map((s) => s.drawCalls)),
    trianglesMax: Math.max(...shots.map((s) => s.triangles)),
    programs: Math.max(...shots.map((s) => s.programs)),
    textureMB: result.static.textureMB,
    renderMsMean: +(shots.reduce((s, v) => s + v.renderMsMean, 0) / shots.length).toFixed(2),
    renderMsWorst: Math.max(...shots.map((s) => s.renderMsMean)),
  };
  result.console = messages;

  const budget = {
    drawCalls: [result.summary.drawCallsMax, 120],
    triangles: [result.summary.trianglesMax, 350000],
    textureMB: [result.summary.textureMB, 60],
  };
  process.stdout.write('\n--- Budget ---\n');
  for (const [k, [v, limit]] of Object.entries(budget)) {
    process.stdout.write(`${k.padEnd(12)} ${String(v).padStart(9)} / ${limit}  ${v <= limit ? 'OK' : 'ÜBERSCHRITTEN'}\n`);
  }
  process.stdout.write(`renderMs     ${String(result.summary.renderMsWorst).padStart(9)} (Software-Rasterizer, nur Vergleichswert)\n`);
  process.stdout.write(`Konsole      ${messages.length ? `${messages.length} Meldung(en)` : 'sauber'}\n`);

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(result, null, 2));
  process.stdout.write(`\nJSON: ${path.relative(ROOT, outFile)}\n`);
} finally {
  await browser.close();
  await server.stop();
}

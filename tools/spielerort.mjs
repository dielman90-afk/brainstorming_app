// Wo steht der Spieler, wenn ein Prüfbild aufgenommen wird?
//
//   node tools/spielerort.mjs [--env night]
//
// Hintergrund: `lockCamera` setzt die Kamera jedes Bild neu, aber **nicht** den
// Spieler. Ist die Kamera ein Kind des Spielers, addiert sich dessen Lage dazu.
// Wenn sie sich zwischen zwei Durchläufen unterscheidet, verschiebt sich das
// ganze Bild um Bruchteile eines Bildpunkts — und jeder Regressionsvergleich
// misst dann Rauschen statt Änderung.
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  for (const shot of shotsFor(envId)) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(450);
    const s = await page.evaluate(() => {
      const { player, camera, scene } = window.__app;
      const welt = scene.getObjectByName('nacht-welt');
      const wq = welt ? welt.quaternion : null;
      const wp = camera.getWorldPosition(new window.__THREE.Vector3());
      const gl = window.__app.renderer.getContext();
      return {
        eltern: camera.parent?.name || camera.parent?.type || '-',
        p: [player.position.x, player.position.y, player.position.z],
        r: [player.rotation.x, player.rotation.y, player.rotation.z],
        w: [wp.x, wp.y, wp.z],
        q: wq ? [wq.x, wq.y, wq.z, wq.w] : null,
        puffer: [gl.drawingBufferWidth, gl.drawingBufferHeight, window.devicePixelRatio, window.innerWidth, window.innerHeight],
        proj: camera.projectionMatrix.elements.map((v) => v.toFixed(8)).join(','),
        zeit: (() => {
          const w = [];
          window.__app.scene.traverse((o) => {
            const u = o.material?.uniforms?.zeit;
            if (u) w.push(`${o.name}=${u.value.toFixed(4)}`);
            if (o.name === 'nacht-sterne-gruppe' || (o.isGroup && /stern/i.test(o.name || ''))) w.push(`${o.name}.rotY=${o.rotation.y.toFixed(6)}`);
          });
          return w.join(' ');
        })(),
        schatten: (() => {
          const l = window.__app.scene.getObjectByName('nacht-mondlicht');
          if (!l) return '-';
          return `${l.shadow.mapSize.x} bias=${l.shadow.bias} nb=${l.shadow.normalBias} cam=${[l.shadow.camera.left, l.shadow.camera.right, l.shadow.camera.near, l.shadow.camera.far].join('/')} dir=${l.getWorldPosition(new window.__THREE.Vector3()).toArray().map((v) => v.toFixed(5)).join(',')}`;
        })(),
      };
    });
    console.log(
      `${shot.name.padEnd(14)} camera.parent=${String(s.eltern).padEnd(10)} player ${s.p.map((v) => v.toFixed(6)).join(' ')} rot ${s.r.map((v) => v.toFixed(6)).join(' ')}`
    );
    console.log(`${''.padEnd(14)} Puffer ${s.puffer.join(' ')}  Proj ${s.proj}`);
    console.log(`${''.padEnd(14)} Zeit ${s.zeit}`);
    console.log(`${''.padEnd(14)} Schatten ${s.schatten}`);
    console.log(`${''.padEnd(14)} Kamera in Welt ${s.w.map((v) => v.toFixed(6)).join(' ')}  Weltdrehung ${s.q ? s.q.map((v) => v.toFixed(9)).join(' ') : '-'}`);
  }
} finally {
  await browser.close();
  await server.stop();
}

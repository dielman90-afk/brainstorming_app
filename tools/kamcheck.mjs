import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'matrix');
  for (const shot of shotsFor('matrix')) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(300);
    const ist = await page.evaluate(() => {
      const c = window.__app.camera;
      const d = new window.__THREE.Vector3();
      c.getWorldDirection(d);
      return { p: c.position.toArray(), d: d.toArray(), fov: c.fov, t: window.__app.controls?.target?.toArray() };
    });
    const soll = [shot.look[0] - shot.pos[0], shot.look[1] - shot.pos[1], shot.look[2] - shot.pos[2]];
    const len = Math.hypot(...soll);
    const sn = soll.map((v) => v / len);
    const winkel = (Math.acos(Math.max(-1, Math.min(1, sn[0]*ist.d[0]+sn[1]*ist.d[1]+sn[2]*ist.d[2]))) * 180) / Math.PI;
    const dp = Math.hypot(ist.p[0]-shot.pos[0], ist.p[1]-shot.pos[1], ist.p[2]-shot.pos[2]);
    console.log(
      `${shot.name.padEnd(14)} Ort-Abweichung ${dp.toFixed(3)} m   Blickwinkel-Abweichung ${winkel.toFixed(2)}°   fov ${ist.fov}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}

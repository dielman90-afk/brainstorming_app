import { PNG } from 'pngjs';
import { startServer, launchBrowser, openApp, selectEnv, ladeThree, PLANET_SHOTS } from './harness-common.mjs';
const server = await startServer();
const browser = await launchBrowser();
const { page } = await openApp(browser);
await selectEnv(page, 'night');
await ladeThree(page);
const shot = PLANET_SHOTS[0];
const blick = [shot.look[0]-shot.pos[0], shot.look[1]-shot.pos[1], shot.look[2]-shot.pos[2]];
await page.evaluate(({blick, fov}) => {
  const T = window.__THREE; const app = window.__app;
  app.env.setWalkEnabled?.(false);
  const welt = app.scene.getObjectByName('nacht-welt');
  const himmel = app.scene.getObjectByName('nacht-himmel');
  const kuppel = app.scene.getObjectByName('nacht-kuppel');
  welt.quaternion.setFromAxisAngle(new T.Vector3(1,0,0), (300*Math.PI)/180);
  himmel.quaternion.copy(welt.quaternion);
  kuppel.userData.setzeWeltdrehung(welt.quaternion);
  welt.updateMatrixWorld(true);
  const boden = app.scene.getObjectByName('nacht-welt-boden');
  const oben = new T.Vector3(0,1,0).applyQuaternion(welt.quaternion.clone().invert());
  const augeY = 25 + boden.userData.heightAt(oben) + 1.6;
  const ziel = [blick[0], augeY+blick[1], blick[2]];
  const tick = () => {
    app.controls.target.set(ziel[0], ziel[1], ziel[2]);
    app.camera.fov = fov; app.camera.position.set(0, augeY, 0); app.camera.up.set(0,1,0);
    app.camera.lookAt(ziel[0], ziel[1], ziel[2]); app.camera.updateProjectionMatrix();
    app.__lock = requestAnimationFrame(tick);
  };
  tick();
}, {blick, fov: shot.fov});
const saum = (buf) => {
  const p = PNG.sync.read(buf);
  const at=(x,y)=>{const i=(y*p.width+x)*4;return [p.data[i],p.data[i+1],p.data[i+2]];};
  const L=(x,y)=>{const c=at(x,y);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
  const istBoden=(x,y)=>{const c=at(x,y);return c[0]-c[2]>6 && L(x,y)<60;};
  let n=0,mx=0;
  for(let y=200;y<p.height-6;y++)for(let x=2;x<p.width-2;x++){
    const l=L(x,y); if(l<80) continue;
    let b=false; for(let d=2;d<=6;d++) if(istBoden(x,y+d)) b=true;
    if(b&&(L(x-1,y)>80||L(x+1,y)>80)){n++; if(l>mx)mx=l;}
  }
  return `Saumpixel ${String(n).padStart(4)}   hellster ${mx.toFixed(0)}`;
};
const lauf = async (label, quelle) => {
  if (quelle) await page.evaluate((q) => { (0, eval)(q)(); }, quelle);
  await page.waitForTimeout(500);
  console.log(label.padEnd(38), saum(await page.screenshot()));
};
await lauf('0 normalBias 0.025', null);
await lauf('1 Schattenwurf ganz aus', "() => { let l=null; window.__app.scene.getObjectByName('nacht-himmel').traverse(o=>{if(o.isDirectionalLight) l=o;}); l.castShadow = false; }");
await lauf('2 Schatten zurueck, Mondlicht halb', "() => { let l=null; window.__app.scene.getObjectByName('nacht-himmel').traverse(o=>{if(o.isDirectionalLight) l=o;}); l.castShadow = true; l.intensity = 1.55; }");
await lauf('3 Mondlicht ganz aus', "() => { let l=null; window.__app.scene.getObjectByName('nacht-himmel').traverse(o=>{if(o.isDirectionalLight) l=o;}); l.intensity = 0; }");
await browser.close(); await server.stop();

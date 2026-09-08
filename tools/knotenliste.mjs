// **Was steht ueberhaupt in einer Umgebung?**
//
//   node tools/knotenliste.mjs [zen|island|night|matrix|dojo]
//
// Name, Dreiecke, Instanzenzahl und die Oberkante der Huelle je Netz. Gebraucht
// wird das, bevor man etwas hinzufuegt: Der Zen-Garten hat 93 von 120
// Draw-Calls belegt, und die Liste sagt, welche davon sich lohnen zu
// verschmelzen — und welche Gegenstaende hoch genug stehen, um sich in einem
// Teich zu spiegeln.
import { startServer, launchBrowser, openApp, selectEnv } from './harness-common.mjs';
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, process.argv[2] ?? 'zen');
  const r = await page.evaluate((env) => {
    const g = window.__app.scene.children.find(c=>c.name===`env-${env}`);
    const out=[];
    g.traverse(o=>{ if(o.isMesh||o.isInstancedMesh||o.isPoints||o.isSprite){
      const gm=o.geometry; const tri=gm?.index?gm.index.count/3:(gm?.attributes?.position?gm.attributes.position.count/3:0);
      gm?.computeBoundingBox?.();
      const bb=gm?.boundingBox;
      out.push([o.name||o.type, Math.round(tri*(o.isInstancedMesh?o.count:1)), o.isInstancedMesh?o.count:1,
                bb?+(bb.max.y).toFixed(2):null]);
    }});
    return out;
  }, process.argv[2] ?? 'zen');
  for(const [n,t,c,y] of r) console.log(`${String(n).padEnd(26)} ${String(t).padStart(8)} tri  x${String(c).padStart(4)}  ymax ${y}`);
  console.log('Meshes:', r.length);
} finally { await browser.close(); await server.stop(); }

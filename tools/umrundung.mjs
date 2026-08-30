// **Einen Gegenstand von allen Seiten ansehen.**
//
// Für kleine Gegenstände sagt eine feste Kamera nur, wie sie von *dieser* Seite
// aussehen. Der Sputnik ist ausdrücklich so gebaut, dass sein Schaden aus jeder
// Richtung liest — ob das stimmt, beantwortet nur ein Umlauf.
//
//   node tools/umrundung.mjs --objekt nacht-sputnik-gruppe [--n 8]
//   node tools/umrundung.mjs --ort 2.76,24.66,-4.78 [--n 8]
//
// **`--objekt` nimmt die Mitte des Hüllquaders, und die kann daneben liegen.**
// Beim Sputnik ziehen die 2,9 m langen Antennen den Quader auf 6,6 m auf; seine
// Mitte liegt 70 cm neben der Kugel, und die Kamera sah bei 1,05 m Abstand nur
// Boden. Für solche Fälle `--ort`.
//                            [--abstand 1.15] [--hoehe 0.25] [--fov 42]
//                            [--out tools/shots/umlauf]
//
// Die Kamera steht auf einem Kreis um den Weltmittelpunkt des Gegenstands und
// blickt auf ihn. `--hoehe` ist die Erhebung über seiner Mitte.
import fs from "node:fs/promises";
import path from "node:path";
import {
  ROOT,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  ladeThree,
  envArg,
} from "./harness-common.mjs";

const argv = process.argv.slice(2);
const arg = (name, vor) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : vor;
const envId = envArg(argv, "night");
const objekt = arg("--objekt", "nacht-sputnik-gruppe");
const anzahl = +arg("--n", 8);
const abstand = +arg("--abstand", 1.15);
const hoehe = +arg("--hoehe", 0.25);
const fov = +arg("--fov", 42);
const ortArg = argv.includes("--ort")
  ? argv[argv.indexOf("--ort") + 1].split(",").map(Number)
  : null;
const outDir = path.resolve(ROOT, arg("--out", "tools/shots/umlauf"));

const server = await startServer();
const browser = await launchBrowser();
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page, messages } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  const mitte = ortArg
    ? { m: ortArg, groesse: 0 }
    : await page.evaluate((name) => {
        const o = window.__app.scene.getObjectByName(name);
        if (!o) return null;
        const b = new window.__THREE.Box3().setFromObject(o);
        const m = b.getCenter(new window.__THREE.Vector3());
        return {
          m: [m.x, m.y, m.z],
          groesse: b.getSize(new window.__THREE.Vector3()).length(),
        };
      }, objekt);
  if (!mitte) throw new Error(`Kein Objekt "${objekt}" in der Szene`);
  console.log(
    `${objekt}: Mitte ${mitte.m.map((v) => v.toFixed(3)).join(" ")}, Ausdehnung ${mitte.groesse.toFixed(2)} m`,
  );

  // Ein Tangentensystem am Ort des Gegenstands: „oben" ist auf einer Kugel die
  // Richtung vom Planetenmittelpunkt.
  for (let i = 0; i < anzahl; i++) {
    const winkel = (i / anzahl) * Math.PI * 2;
    await page.evaluate(
      ({ m, winkel, abstand, hoehe, fov }) => {
        const T = window.__THREE;
        const { camera, player, controls, renderer, scene } = window.__app;
        const mitte = new T.Vector3(m[0], m[1], m[2]);
        const oben = mitte.clone().normalize();
        const ost = new T.Vector3(0, 1, 0).cross(oben);
        if (ost.lengthSq() < 1e-6) ost.set(1, 0, 0);
        ost.normalize();
        const nord = oben.clone().cross(ost).normalize();
        const pos = mitte
          .clone()
          .addScaledVector(ost, Math.cos(winkel) * abstand)
          .addScaledVector(nord, Math.sin(winkel) * abstand)
          .addScaledVector(oben, hoehe);
        // **Die Kamera muss jedes Bild neu gesetzt werden.** Der erste Anlauf
        // hat sie einmal gesetzt und dann 300 ms gewartet — in dieser Zeit
        // läuft die Schleife der App weiter, und `OrbitControls.update()`
        // stellt die Kamera auf seine eigenen Kugelkoordinaten um den
        // Zielpunkt zurück. Im Bild stand daraufhin leerer Boden statt des
        // Gegenstands, und ich habe zuerst den Zielpunkt verdächtigt.
        window.__app.env.setWalkEnabled?.(false);
        if (window.__umlaufLock) cancelAnimationFrame(window.__umlaufLock);
        // Die Weltdrehung gehört in denselben Takt wie die Kamera — sonst
        // dreht ein einziges Bild der Fortbewegung den Gegenstand aus dem
        // Blickfeld. Die Begründung steht bei `lockCamera`.
        const welt = scene.getObjectByName('nacht-welt');
        const himmel = scene.getObjectByName('nacht-himmel');
        const kuppel = scene.getObjectByName('nacht-kuppel');
        const soll = new T.Quaternion();
        const tick = () => {
          if (welt && !welt.quaternion.equals(soll)) {
            welt.quaternion.copy(soll);
            himmel?.quaternion.copy(soll);
            kuppel?.userData?.setzeWeltdrehung?.(soll);
            welt.updateMatrixWorld(true);
          }
          player.position.set(0, 0, 0);
          player.rotation.set(0, 0, 0);
          controls.target.copy(mitte);
          camera.fov = fov;
          camera.position.copy(pos);
          camera.up.copy(oben);
          camera.lookAt(mitte);
          camera.updateProjectionMatrix();
          window.__umlaufLock = requestAnimationFrame(tick);
        };
        tick();
        renderer.render(scene, camera);
      },
      { m: mitte.m, winkel, abstand, hoehe, fov },
    );
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(
        outDir,
        `${String(Math.round((i / anzahl) * 360)).padStart(3, "0")}.png`,
      ),
    });
    process.stdout.write(`✓ ${Math.round((i / anzahl) * 360)}°\n`);
  }
  if (messages.length) {
    process.stdout.write(
      `\n⚠ Konsole nicht sauber (${messages.length}): ${messages.slice(0, 5).join(" | ")}\n`,
    );
  }
  process.stdout.write(`\nBilder in ${path.relative(ROOT, outDir)}\n`);
} finally {
  await browser.close();
  await server.stop();
}

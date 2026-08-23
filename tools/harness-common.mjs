// Gemeinsame Basis für Screenshot- und Mess-Harness.
//
// Kein Eingriff in src/: Die App exportiert bereits alles Nötige über
// `window.__app` (Szene, Renderer, Kamera, Umgebungsliste). Der Harness
// schaltet darüber die Umgebung um, blendet die Board-Objekte (Karten,
// Whiteboard, Zonen, Wrist-Menü, HUD) aus und setzt die Kamera – die App
// selbst bleibt unverändert und läuft im Normalbetrieb exakt wie zuvor.
//
// Hinweis zur Aussagekraft der Zeitmessung: Der Container hat keine GPU
// (/dev/dri fehlt), Chromium rendert per SwiftShader in Software. Die
// absoluten Millisekunden sind daher KEIN Quest-3-Wert, sondern nur ein
// stabiler Vergleichsmaßstab zwischen zwei Ständen desselben Harness.

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROMIUM = '/opt/pw-browsers/chromium';
export const PORT = 5199;
export const VIEWPORT = { width: 1280, height: 720 };

// Sechs feste Kamerapositionen. Weltkoordinaten in Metern (WORLD_SCALE = 4,
// Insel ~40 m breit, Grasoberfläche bei y ≈ -0.08, Augenhöhe 1.6 m).
// DIESE WERTE DÜRFEN SICH ÜBER ALLE DURCHLÄUFE NICHT ÄNDERN – sonst sind die
// Vergleichsbilder wertlos.
export const SHOTS = [
  {
    name: '1-eyelevel',
    title: 'Augenhöhe Inselmitte',
    pos: [1.5, 1.6, 9.0],
    look: [-2.0, 1.2, -14.0],
    fov: 70,
  },
  {
    name: '2-waterfall',
    title: 'Blick zum Wasserfall',
    pos: [-2.0, 1.7, 6.0],
    look: [15.5, -1.5, -9.1],
    fov: 65,
  },
  {
    name: '3-edge-down',
    title: 'Über die Kante nach unten',
    // Knapp außerhalb der Abbruchkante, Blick zurück und hinab: zeigt
    // Grasnarbe, Erdschicht und den geschichteten Fels in einem Bild.
    pos: [3.0, 3.2, 27.0],
    look: [-1.0, -11.0, 10.0],
    fov: 72,
  },
  {
    name: '4-aerial',
    title: 'Totale von schräg oben',
    pos: [36.0, 24.0, 38.0],
    look: [0.0, -4.0, 0.0],
    fov: 55,
  },
  {
    name: '5-backlight',
    title: 'Gegenlicht in die Sonne',
    pos: [-9.0, 1.7, 12.0],
    look: [22.0, 14.0, -18.0],
    fov: 70,
  },
  {
    name: '6-groundcover',
    title: 'Nahaufnahme Bodenvegetation',
    pos: [4.6, 0.55, 7.4],
    look: [1.0, -0.15, 1.6],
    fov: 60,
  },
];

// Feste Kameras des Zen-Gartens. Maßstab 1:1 (kein WORLD_SCALE), Sandkreis
// r = 20 m, Augenhöhe 1.6 m.
// DIESE WERTE DÜRFEN SICH ÜBER ALLE DURCHLÄUFE NICHT ÄNDERN – sonst sind die
// Vergleichsbilder wertlos. Eingefroren in Durchlauf 1 nach Sichtprüfung der
// Bildausschnitte.
export const ZEN_SHOTS = [
  {
    name: 'a-eyelevel',
    title: 'Augenhöhe, Blick über den Sand zum Torii',
    pos: [0, 1.6, 6.0],
    look: [0, 1.0, -12.0],
    fov: 70,
  },
  {
    name: 'b-pond',
    title: 'Teich mit Laterne',
    pos: [1.2, 1.5, 2.4],
    look: [3.2, 0.1, -1.2],
    fov: 65,
  },
  {
    name: 'c-torii',
    title: 'Torii über den Trittsteinen',
    pos: [1.0, 1.6, 3.0],
    look: [-2.0, 1.5, -9.0],
    fov: 70,
  },
  {
    name: 'd-aerial',
    title: 'Totale von schräg oben (Komposition)',
    pos: [10.0, 9.0, 12.0],
    look: [0, 0, 0],
    fov: 55,
  },
  {
    name: 'e-sand',
    title: 'Flache Nahsicht auf Harkmuster und Trittsteine',
    pos: [0.5, 0.45, 4.2],
    look: [-1.5, -0.05, -2.0],
    fov: 60,
  },
  {
    name: 'f-grove',
    title: 'Sakura und Bambushain',
    pos: [2.0, 1.7, 6.5],
    look: [-5.0, 1.6, 0.5],
    fov: 70,
  },
];

// Feste Kameras des Nachthimmels. Maßstab 1:1 (kein WORLD_SCALE), Bodenfläche
// 96 × 96 m, Nebel 22–48 m, Kuppel r = 44, Mond bei [14 | 16 | −24].
// DIESE WERTE DÜRFEN SICH ÜBER ALLE DURCHLÄUFE NICHT ÄNDERN – sonst sind die
// Vergleichsbilder wertlos. Eingefroren mit dem Ausgangsstand night-00.
export const NIGHT_SHOTS = [
  {
    name: 'a-eyelevel',
    title: 'Augenhöhe, Blick über den Regolith zum Mond',
    pos: [-4.0, 1.6, 8.0],
    look: [11.0, 7.0, -20.0],
    fov: 70,
  },
  {
    name: 'b-moon',
    title: 'Der Mond im Bild',
    pos: [0, 1.6, 4.0],
    look: [14.0, 16.0, -24.0],
    fov: 60,
  },
  {
    name: 'c-crater',
    title: 'Blick in den großen Krater',
    pos: [-3.0, 1.7, 12.0],
    look: [-11.0, -0.6, 5.0],
    fov: 70,
  },
  {
    name: 'd-aerial',
    title: 'Totale von schräg oben (Komposition)',
    pos: [18.0, 14.0, 22.0],
    look: [0, -0.5, 0],
    fov: 55,
  },
  {
    name: 'e-ground',
    title: 'Flache Nahsicht auf den Regolith',
    pos: [2.0, 0.45, 5.0],
    look: [-2.0, -0.15, -3.0],
    fov: 60,
  },
  {
    name: 'f-hills',
    title: 'Horizonthügel gegen den Sternhimmel',
    pos: [1.0, 1.6, 1.0],
    look: [-22.0, 3.5, -24.0],
    fov: 70,
  },
];

// Kamerasätze je Umgebung. `SHOTS` bleibt der Inselsatz, damit die alten
// Inselbilder vergleichbar bleiben.
export const ENV_SHOTS = { island: SHOTS, zen: ZEN_SHOTS, night: NIGHT_SHOTS };

export function shotsFor(envId) {
  const set = ENV_SHOTS[envId];
  if (!set) throw new Error(`Kein Kamerasatz für Umgebung "${envId}"`);
  return set;
}

// --env <id> aus der Kommandozeile. Vorgabe ist der Zen-Garten: Das ist die
// Umgebung, an der gerade gearbeitet wird.
export function envArg(argv, fallback = 'zen') {
  const i = argv.indexOf('--env');
  return i >= 0 ? argv[i + 1] : fallback;
}

// Screenshots der anderen Umgebungen (Regressionsvergleich).
//
// Achtung beim Pixelvergleich: ⬜ Konstrukt ist NICHT reproduzierbar. Das Bild
// der Röhre wird mit Math.random() verrauscht und das Schirmlicht flackert
// zufällig – zwei Läufe desselben Standes unterscheiden sich dort immer. Für
// diese Umgebung zählt der Blick aufs Bild, nicht der Byte-Vergleich.
export const REGRESSION_SHOTS = {
  island: { pos: [1.5, 1.6, 9.0], look: [-2.0, 1.2, -14.0], fov: 70 },
  night: { pos: [0, 1.6, 6], look: [0, 2.5, -18], fov: 70 },
  zen: { pos: [0, 1.6, 6], look: [0, 1.0, -12], fov: 70 },
  matrix: { pos: [0, 1.6, 2.5], look: [0, 1.0, -5], fov: 70 },
  // Seit PR #9 gibt es eine fuenfte Umgebung; ohne sie im Regressionssatz
  // wuerde eine Aenderung dort unbemerkt bleiben.
  dojo: { pos: [0, 1.6, 4.5], look: [0, 1.2, -6], fov: 70 },
};

function waitForPort(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Port ${port} kam nicht hoch`));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function startServer() {
  if (await portOpen(PORT)) return { async stop() {} }; // bereits laufender Dev-Server
  const child = spawn(
    ROOT + '/node_modules/.bin/vite',
    ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, env: { ...process.env, NO_HTTPS: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  );
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  await waitForPort(PORT);
  return {
    async stop() {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    },
  };
}

export async function launchBrowser({ perf = false } = {}) {
  const args = [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ];
  if (perf) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  return chromium.launch({ executablePath: CHROMIUM, args });
}

// Seite laden, App-Bootstrap abwarten, Board-Objekte ausblenden.
export async function openApp(browser, { collectConsole = true } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = [];
  if (collectConsole) {
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') messages.push(`${type}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => messages.push(`pageerror: ${err.message}`));
  }
  // Ein leeres Board vermeidet die Demo-Karten – die Umgebung soll frei stehen.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('webxr-brainstorming-board', JSON.stringify({ cards: [], connections: [], zones: [] }));
      localStorage.setItem('webxr-brainstorming-env', 'passthrough');
    } catch {
      /* ohne localStorage läuft der Rest trotzdem */
    }
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__app), null, { timeout: 60000 });

  // DOM-Overlay ausblenden (rein visuell für die Screenshots).
  await page.addStyleTag({
    content: '#overlay, #btn-collapse, #status-band, #context-menu, #edit-box { display: none !important; }',
  });

  // Alles außer der Umgebung und den globalen Lichtern verstecken.
  await page.evaluate(() => {
    const { scene } = window.__app;
    for (const child of scene.children) {
      if (child.isLight) continue;
      if (typeof child.name === 'string' && child.name.startsWith('env-')) continue;
      child.userData.__harnessHidden = child.visible;
      child.visible = false;
    }
    // OrbitControls sollen die gesetzte Kamera nicht wieder verdrehen.
    window.__app.controls.enabled = false;
    window.__app.controls.autoRotate = false;
  });

  return { context, page, messages };
}

// Die Animationsschleife der App ruft env.update(elapsed) mit ihrer eigenen Uhr
// auf – direkt vor dem Rendern. Ohne Eingriff steht die Umgebung in jedem Lauf
// woanders und die Bilder sind nicht vergleichbar. Deshalb wird die
// update-Funktion auf einen festen Zeitpunkt festgenagelt.
export const FROZEN_TIME = 6.0;

export async function selectEnv(page, id) {
  await page.evaluate(
    ({ wanted, frozen }) => {
      const api = window.__app.env;
      const target = api.environments.findIndex((e) => e.id === wanted);
      let guard = 0;
      while (api.current() !== target && guard++ < 12) api.cycle();
      const env = api.environments[target];
      env.group.visible = true;
      if (env.update && !env.__frozen) {
        const original = env.update.bind(env);
        env.__frozen = true;
        // **Das Original bleibt erreichbar.** Ohne diese Zeile ist die Uhr der
        // Umgebung endgültig eingefroren: `env.update` ist danach ein
        // Verschluss, der sein Argument verwirft, und wer ihn aufruft, bekommt
        // wieder `frozen`. `tools/bewegung.mjs` hat daraufhin an 24
        // Zeitpunkten exakt denselben Wert gemessen und keinen Fehler gemeldet
        // — das Werkzeug maß, dass sich nichts bewegt, weil es selbst nichts
        // bewegen konnte.
        env.__originalUpdate = original;
        env.update = () => original(frozen);
        original(frozen);
      }
    },
    { wanted: id, frozen: FROZEN_TIME }
  );
  await page.waitForTimeout(150);
}

// **Die Sperre muss dafür aus.** Seit src/walkable.js haelt die App den Nutzer
// im begehbaren Bereich und auf dessen Boden – die festen Kameras hier liegen
// bewusst ausserhalb (die Totale 24 m ueber der Insel, der Kantenblick knapp
// jenseits der Abbruchkante). Ohne das Abschalten zieht die Sperre sie jedes
// Bild auf Augenhoehe zurueck, und die Vergleichsbilder waeren wertlos.
export async function placeCamera(page, shot, time = 6.0) {
  await page.evaluate(
    ({ pos, look, fov, time }) => {
      const { camera, player, renderer, scene, controls } = window.__app;
      window.__app.env.setWalkEnabled?.(false);
      player.position.set(0, 0, 0);
      player.rotation.set(0, 0, 0);
      // OrbitControls.update() ruft am Ende lookAt(target) auf und würde eine
      // von außen gesetzte Blickrichtung wieder überschreiben.
      controls.target.set(look[0], look[1], look[2]);
      camera.fov = fov;
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(look[0], look[1], look[2]);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
    },
    { pos: shot.pos, look: shot.look, fov: shot.fov, time }
  );
}

// Kamera nach jedem Frame neu setzen: Die App-Schleife läuft weiter und würde
// sonst über OrbitControls/Locomotion dazwischenfunken.
export async function lockCamera(page, shot, time) {
  await page.evaluate(
    ({ pos, look, fov, time }) => {
      const app = window.__app;
      app.env.setWalkEnabled?.(false); // siehe placeCamera
      if (app.__harnessLock) cancelAnimationFrame(app.__harnessLock);
      const tick = () => {
        app.controls.target.set(look[0], look[1], look[2]);
        app.camera.fov = fov;
        app.camera.position.set(pos[0], pos[1], pos[2]);
        app.camera.up.set(0, 1, 0);
        app.camera.lookAt(look[0], look[1], look[2]);
        app.camera.updateProjectionMatrix();
        app.__harnessLock = requestAnimationFrame(tick);
      };
      tick();
    },
    { pos: shot.pos, look: shot.look, fov: shot.fov, time }
  );
}

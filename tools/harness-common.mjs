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

// Feste Kameras des Nachthimmels — **neu, seit der Boden eine Kugel ist.**
//
// Die sechs Kameras von night-00 bis night-09 sind mit der Platte weggefallen
// und nicht zu retten: `f-hills` zeigte Horizonthügel, die es nicht mehr gibt,
// und `d-aerial` stand bei (18 | 14 | 22) — das liegt jetzt **innerhalb** des
// Planeten. Der Messvergleich gegen night-XX endet damit; für den Planeten
// beginnt eine neue Reihe mit planet-00.
//
// Maßstab 1:1. Planetenhalbmesser 25 m, Startpunkt am Nordpol (0 | 25 | 0),
// Augenhöhe 1,6 m. Zwei Zahlen bestimmen jeden Bildausschnitt:
//
//   • Der Horizont liegt **19,9 Grad unter Augenhöhe** (acos(25/26,6)) und in
//     8,7 m Bogenabstand. Wer waagerecht schaut, sieht zu vier Fünfteln Himmel.
//     Die Bodenkameras zielen deshalb 15 bis 25 Grad nach unten.
//   • Der Mond steht in **Azimut 150 Grad** (aus MOND_RICHTUNG) und 29,9 Grad
//     über dem Horizont der Polstellung.
//
// DIESE WERTE DÜRFEN SICH ÜBER ALLE DURCHLÄUFE NICHT ÄNDERN.
export const PLANET_SHOTS = [
  {
    name: 'a-augenhoehe',
    title: 'Augenhöhe am Startpunkt, Blick zum Mond über die Krümmung',
    pos: [0, 26.94, 0],
    look: [5.8, 23.83, -10.04],
    fov: 70,
  },
  {
    name: 'b-mond',
    // **Nicht mehr in der Bildmitte.** Der Prüfer hat den Schwerpunkt der
    // hellen Scheibe bei (631, 346) auf 1280 x 720 gemessen — „das ist der
    // schwächstmögliche Ort im Bild, und es ist die eine Kamera, deren einziger
    // Zweck der Mond ist." Das Blickziel ist deshalb um gut zehn Grad nach
    // links und sechs nach unten versetzt: Der Mond steht jetzt im rechten
    // oberen Drittel, mit der Milchstraße als Gegengewicht links unten.
    title: 'Der Mond im Bild, aus der Mitte gerückt',
    pos: [0, 26.94, 0],
    look: [79.0, 141.0, -246.0],
    fov: 60,
  },
  {
    name: 'c-krater',
    // Der Standort ist gemessen, nicht geschätzt: `tools/planetort.mjs` meldet
    // für 7,6 m Bogen bei Azimut 155 eine Geländehöhe von +0,33 m — den Wall
    // des alten, flachen Kraters, dessen Mulde bei 12,1 m auf −0,87 m liegt.
    //
    // **Azimut 155 und nicht −38.** Der erste Anlauf stand am Krater bei −38,
    // also 188 Grad vom Mond weg: Das Gelände kehrte dem Licht den Rücken zu,
    // und im Bild stand eine gleichmäßig dunkle Fläche, in der die Mulde nicht
    // zu erkennen war. Der Mond steht in Azimut 150; ein Krater, der eine Form
    // zeigen soll, braucht eine beleuchtete und eine abgewandte Flanke.
    title: 'Vom Wall in den großen Krater (12,1 m Bogen, Azimut 155)',
    pos: [3.41, 25.7, -7.31],
    look: [6.53, 18.95, -14.0],
    fov: 70,
  },
  {
    name: 'd-orbit',
    title: 'Der ganze Planet von außen (Silhouette und Terminator)',
    // **Ohne Nebel und mit weiterer Fernebene.** Beides, weil diese Kamera als
    // einzige außerhalb der Modellannahme steht: Der Spieler ist immer am
    // Nordpol, dort ist die Kuppel überall 298 bis 302 m entfernt, und der
    // Nebel von 5 bis 13 m staffelt genau die Strecke, die es gibt. Aus 77 m
    // Abstand stimmt beides nicht mehr — der Planet läge vollständig im Nebel,
    // und die Kuppel reicht von 226 bis 374 m, also über die Fernebene der App
    // (340 m) hinaus. Gemessen stand daraufhin ein schwarzer Ring um den
    // Planeten: Ein Strahl durch (400 | 120) traf nichts, das Pixel zeigte
    // exakt die Hintergrundfarbe (10 | 6 | 5), und bei (340 | 180) traf er die
    // Kuppel in 363,7 m — schräg genug, um in der Sichttiefe noch
    // durchzukommen.
    //
    // Beides gilt **nur für dieses eine Bild**. Es misst Form und Verteilung,
    // nicht Atmosphäre; in der Brille kann diese Ansicht niemand einnehmen.
    nebel: false,
    fern: 520,
    pos: [52.0, 30.0, 46.0],
    look: [0, 0, 0],
    fov: 45,
  },
  {
    name: 'e-boden',
    title: 'Flache Nahsicht auf den Regolith',
    pos: [0.6, 25.76, 1.2],
    look: [-2.43, 23.51, -3.47],
    fov: 60,
  },
  {
    name: 'f-kante',
    title: 'Die Krümmungskante gegen den Sternhimmel, vom Mond abgewandt',
    pos: [0, 26.94, 0],
    look: [-5.71, 23.23, 9.88],
    fov: 70,
  },
  {
    name: 'g-sputnik',
    // Der Sputnik liegt bei 5,5 m Bogen in Azimut 150; sein Boden steht laut
    // `tools/planetort.mjs` auf (2,76 | 24,66 | −4,78). Die Kamera steht 1,15 m
    // davor bei 4,35 m Bogen, auf 0,62 m Augenhöhe — hockend, wie man einen
    // Fund ansieht, und **nicht** von oben: Aus 2,2 m Abstand und Brusthöhe
    // füllte er 120 von 720 Zeilen, und von dem, was ihn ausmacht — Flansch,
    // Delle, Antennenschuhe — war nichts zu sehen.
    title: 'Der beschädigte Sputnik aus der Hocke (5,5 m Bogen, Azimut 150)',
    pos: [2.25, 25.59, -3.89],
    look: [2.76, 24.95, -4.78],
    fov: 48,
  },
  {
    name: 'h-mond-rot',
    // Der zweite Mond steht der Sonne… dem ersten Mond gegenüber. Diese Kamera
    // dreht sich zu ihm um; sie ist das Gegenstück zu `b-mond`.
    //
    // **Mit `station: 180`.** Bei 0 Grad steht er 33,3 Grad **unter** dem
    // Horizont — genau dafür ist er da. Eine halbe Runde weiter steht er oben.
    title: 'Der rötliche Halbmond auf der Gegenseite (Station 180)',
    station: 180,
    pos: [0, 26.94, 0],
    look: [44.3, 189.6, -246.9],
    fov: 45,
  },
];

// ⬜ Konstrukt. Eine weisse Leere mit genau einer Sitzgruppe darin: zwei
// Sessel, ein Staender, eine Radiola-Konsole mit Bildroehre. Die Gruppe steht
// bei z = -3,9; die Sessel bei x = +/-1,06 / z = -4,78, das Geraet bei z = -3,12
// auf 0,30 m Staenderhoehe. Die BILDROEHRE zeigt nach -Z, also zu den Sesseln —
// wer sie sehen will, muss zwischen Geraet und Sesseln stehen. Was der Nutzer
// von seinem Platz aus sieht, ist die Schautafel auf der Rueckseite.
//
// Sechs Kameras, dieselbe Logik wie bei den anderen Umgebungen: eine, die den
// Normalfall zeigt, vier fuer die Gegenstaende, die es ueberhaupt gibt, und
// eine fuer den Boden — in einer leeren weissen Welt ist der Uebergang
// Boden/Kuppel die groesste Flaeche des Bildes.
export const KONSTRUKT_SHOTS = [
  {
    name: 'a-augenhoehe',
    title: 'Der Blick vom Platz des Nutzers auf die Sitzgruppe',
    pos: [0, 1.6, 0.6],
    look: [0, 0.75, -3.9],
    fov: 60,
  },
  {
    name: 'b-sessel',
    title: 'Der linke Sessel aus der Naehe (Polster, Naehte, Knoepfe)',
    pos: [-0.15, 1.15, -3.35],
    look: [-1.06, 0.45, -4.78],
    fov: 45,
  },
  {
    name: 'c-roehre',
    title: 'Die Bildroehre von der Sesselseite',
    pos: [0, 0.95, -4.25],
    look: [0, 0.62, -3.12],
    fov: 45,
  },
  {
    name: 'd-schautafel',
    title: 'Die Schautafel auf der Rueckseite, die der Nutzer sieht',
    pos: [0, 0.88, -2.05],
    look: [0, 0.62, -3.12],
    fov: 40,
  },
  {
    name: 'e-schraeg',
    title: 'Die ganze Gruppe von schraeg oben',
    pos: [2.6, 2.0, -1.1],
    look: [0, 0.45, -3.9],
    fov: 50,
  },
  {
    name: 'f-boden',
    title: 'Boden und Fusspunkte: Kontaktschatten, Beine, horizontloser Grund',
    pos: [0, 1.55, -1.5],
    look: [0, -0.05, -3.4],
    fov: 70,
  },
];

export const ENV_SHOTS = {
  island: SHOTS,
  zen: ZEN_SHOTS,
  night: PLANET_SHOTS,
  matrix: KONSTRUKT_SHOTS,
};

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
// **⬜ Konstrukt war lange NICHT reproduzierbar** — das Bild der Röhre wurde mit
// `Math.random()` verrauscht und das Schirmlicht flackerte zufällig, zwei Läufe
// desselben Standes unterschieden sich dort immer. Seit beide Quellen aus der
// Bildnummer (und damit aus der Zeit) kommen, ist auch diese Umgebung
// bitgleich vergleichbar.
export const REGRESSION_SHOTS = {
  island: { pos: [1.5, 1.6, 9.0], look: [-2.0, 1.2, -14.0], fov: 70 },
  // Der Nachthimmel ist ein Planet: Augenhoehe heisst hier 26,6 m ueber dem
  // Mittelpunkt, nicht 1,6 m ueber y = 0.
  night: { pos: [0, 26.94, 0], look: [5.8, 23.83, -10.04], fov: 70 },
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
  // **90 Sekunden statt der voreingestellten 30.** Der Nachthimmel baut beim
  // Start eine Icosphere mit 245 760 Scheitelpunkten und zweihundertvierzig
  // Bruchkörper; das dauert im Container spürbar. Mit `perf: true` (kein
  // Bildratenlimit) kam `tools/inspect.mjs` reproduzierbar nicht mehr über die
  // 30 Sekunden, während `tools/screenshots.mjs` mit demselben Stand durchlief
  // — der Unterschied war nie die Seite, sondern die Rechenzeit daneben.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 90000 });
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
//
// **Nebelschalter.** Ein Bild darf `nebel: false` verlangen — die Totale des
// Planeten von außen tut das. Der Wert der Umgebung wird dabei aufgehoben und
// beim nächsten Bild ohne Vermerk wiederhergestellt, sonst bliebe die ganze
// Reihe nach der Totale nebelfrei.
async function nebelHilfe(page) {
  await page.evaluate(() => {
    if (window.__setzeNebel) return;
    // Ebenso die Fernebene: Ein Bild darf sie weiter setzen. Der Wert der App
    // wird beim ersten Eingriff gemerkt und danach wiederhergestellt.
    window.__setzeFern = (camera, wert) => {
      if (wert) {
        if (window.__fernSpeicher === undefined) window.__fernSpeicher = camera.far;
        camera.far = wert;
      } else if (window.__fernSpeicher !== undefined) {
        camera.far = window.__fernSpeicher;
        window.__fernSpeicher = undefined;
      }
      camera.updateProjectionMatrix();
    };
    window.__setzeNebel = (scene, an) => {
      if (!an) {
        if (window.__nebelSpeicher === undefined) window.__nebelSpeicher = scene.fog;
        scene.fog = null;
      } else if (window.__nebelSpeicher !== undefined) {
        scene.fog = window.__nebelSpeicher;
        window.__nebelSpeicher = undefined;
      }
      // Steht kein Vermerk an, bleibt der Nebel unangetastet — sonst truege ein
      // gespeicherter Wert der einen Umgebung in die naechste hinein.
    };
  });
}

// **three.js im Seitenkontext.** `import('three')` scheitert dort: Der nackte
// Bezeichner wird nicht aufgelöst, weil der evaluate-Code nicht durch Vite
// gelaufen ist. Die Seite hat das Modul aber längst geladen — seine URL steht
// in der Ressourcenliste. Der innere Chunk `three.module-XXXX.js` exportiert
// die Namen nicht, deshalb wird jeder Kandidat probiert, bis einer einen
// Raycaster liefert.
export async function ladeThree(page) {
  await page.evaluate(async () => {
    if (window.__THREE) return;
    const kandidaten = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => /three[^/]*\.js/.test(n));
    for (const url of kandidaten) {
      try {
        const m = await import(/* @vite-ignore */ url);
        if (typeof m.Raycaster === 'function' && typeof m.Vector3 === 'function') {
          window.__THREE = m;
          return;
        }
      } catch {
        /* naechster Kandidat */
      }
    }
    throw new Error(`three.js nicht ladbar. Kandidaten: ${kandidaten.join(', ')}`);
  });
}

// **Eine Station des Rundgangs, als Eigenschaft eines Prüfbildes.**
//
// Die sechs festen Kameras zeigen alle denselben Augenblick des Rundgangs — die
// Welt steht bei 0 Grad. Der zweite Mond steht dann aber unter dem Horizont;
// er gehört ja der dunklen Hälfte. Ein Bild darf deshalb `station: 180`
// verlangen: Die Welt wird um diesen Winkel gedreht, bevor die Kamera gesetzt
// wird, und danach ohne Vermerk zurückgestellt — sonst bliebe die ganze Reihe
// danach verdreht.
let _stationSteht = false;
async function setzeStation(page, grad) {
  // **Station 0 ist keine Station, sondern der Normalfall.** Ohne diese Zeile
  // verlangt jedes Werkzeug three im Seitenkontext, auch wenn es gar nichts
  // dreht — `tools/strahl.mjs` ist daran sofort aufgelaufen.
  //
  // **Aber zurückgestellt werden muss trotzdem.** Der erste Anlauf ist hier
  // ausgestiegen, sobald `grad` null war — auch dann, wenn ein Bild davor die
  // Welt auf 180 Grad gedreht hatte. `f-kante` wurde daraufhin auf der
  // **Nachtseite** gerendert und stand als fast schwarzes Bild in der Reihe.
  // Der Kommentar über dieser Funktion hatte genau davor gewarnt; geschrieben
  // war die Warnung, gebaut war sie nicht.
  // **Der frühe Ausstieg ist gefallen.** Er stand hier, damit Werkzeuge ohne
  // three nicht daran scheitern — aber `ladeThree` steht zwei Zeilen weiter
  // und stellt die Voraussetzung selbst her. Der Preis war zu hoch: Wenn
  // zwischen Seitenaufbau und `setWalkEnabled(false)` ein Bild der
  // Fortbewegung durchläuft, steht die Welt schon vor dem ersten Bild schief,
  // und bei `grad = 0` hat diese Zeile das nie zurückgestellt.
  _stationSteht = grad !== 0;
  // **Das Werkzeug muss three nicht selbst laden.** Der erste Anlauf hat hier
  // geworfen, wenn `window.__THREE` fehlte — und damit jedes Werkzeug, das die
  // festen Kameras abfährt, ohne three zu brauchen (`tools/inspect.mjs`,
  // `tools/strahl.mjs`). Eine Voraussetzung, die man selbst herstellen kann,
  // fordert man nicht ein.
  await ladeThree(page);
  await page.evaluate((grad) => {
    const T = window.__THREE;
    const app = window.__app;
    const welt = app.scene.getObjectByName('nacht-welt');
    if (!welt) return;
    if (window.__stationSpeicher === undefined) window.__stationSpeicher = 0;
    const himmel = app.scene.getObjectByName('nacht-himmel');
    const kuppel = app.scene.getObjectByName('nacht-kuppel');
    welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (grad * Math.PI) / 180);
    himmel.quaternion.copy(welt.quaternion);
    kuppel?.userData?.setzeWeltdrehung?.(welt.quaternion);
    welt.updateMatrixWorld(true);
  }, grad);
}

export async function placeCamera(page, shot, time = 6.0) {
  await nebelHilfe(page);
  await setzeStation(page, shot.station ?? 0);
  await page.evaluate(
    ({ pos, look, fov, time, nebel, fern }) => {
      const { camera, player, renderer, scene, controls } = window.__app;
      window.__app.env.setWalkEnabled?.(false);
      window.__setzeNebel(scene, nebel);
      window.__setzeFern(camera, fern);
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
    { pos: shot.pos, look: shot.look, fov: shot.fov, time, nebel: shot.nebel !== false, fern: shot.fern ?? 0 }
  );
}

// Kamera nach jedem Frame neu setzen: Die App-Schleife läuft weiter und würde
// sonst über OrbitControls/Locomotion dazwischenfunken.
//
// **Und die Weltdrehung gehört mit in denselben Takt.**
//
// Der Prüfstand hat für dasselbe Bild aus getrennten Prozessen zwei
// verschiedene Prüfsummen geliefert — `a-augenhoehe` Δmittel 5,38,
// `g-sputnik` 29,0 — und zwar über Wochen, ohne dass es aufgefallen wäre.
// Sechs Läufe mit `tools/zustand.mjs`, das Bild **und** Zustand im selben Lauf
// herausschreibt, haben es gezeigt: In fünf Läufen stand `nacht-welt` auf der
// Einheitsmatrix, im sechsten auf einer Drehung um **0,01 Bogenmaß** um X —
// und genau dieser Lauf hatte die andere Prüfsumme.
//
// 0,01 Bogenmaß auf 25 m Halbmesser sind 25 cm Weg, also **ein einziger
// Schritt** der Fortbewegung: Zwischen Seitenaufbau und
// `setWalkEnabled(false)` lief in manchen Läufen ein Bild mit Fortbewegung
// durch. Das dreht die ganze Welt um ein halbes Grad — im Bild eine
// Verschiebung unter einem Bildpunkt, die jede Kante, jeden Stern und jedes
// Korn ändert und in der Summe wie Rauschen aussieht.
//
// Die Kamera wurde von Anfang an jedes Bild neu gesetzt, die Weltdrehung nur
// **einmal** vor der Schleife. Jetzt beides im selben Takt.
export async function lockCamera(page, shot, time) {
  await nebelHilfe(page);
  await setzeStation(page, shot.station ?? 0);
  await ladeThree(page);
  await page.evaluate(
    ({ pos, look, fov, time, nebel, fern, station }) => {
      const T = window.__THREE;
      const app = window.__app;
      app.env.setWalkEnabled?.(false); // siehe placeCamera
      window.__setzeNebel(app.scene, nebel);
      window.__setzeFern(app.camera, fern);
      if (app.__harnessLock) cancelAnimationFrame(app.__harnessLock);
      const welt = app.scene.getObjectByName('nacht-welt');
      const himmel = app.scene.getObjectByName('nacht-himmel');
      const kuppel = app.scene.getObjectByName('nacht-kuppel');
      const soll = welt
        ? new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), (station * Math.PI) / 180)
        : null;
      const tick = () => {
        if (welt && !welt.quaternion.equals(soll)) {
          welt.quaternion.copy(soll);
          himmel?.quaternion.copy(soll);
          kuppel?.userData?.setzeWeltdrehung?.(soll);
          welt.updateMatrixWorld(true);
        }
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
    {
      pos: shot.pos,
      look: shot.look,
      fov: shot.fov,
      time,
      nebel: shot.nebel !== false,
      fern: shot.fern ?? 0,
      station: shot.station ?? 0,
    }
  );
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './fonts.js'; // lokal gebündelte Schriften (kein CDN nötig)
import { CardManager, CARD_COLORS, CARD_FONT_STEPS, FLOW_TYPES, flowTypeById } from './cards.js';
import { ConnectionManager } from './connections.js';
import { layoutFlow } from './flowLayout.js';
import { decorateIcons } from './icons.js';
import { Tweener } from './tween.js';
import { InteractionManager } from './interactions.js';
import { WristMenu } from './wristMenu.js';
import { VirtualKeyboard } from './keyboard.js';
import {
  isHeadsetBrowser,
  isSpeechAvailable,
  recognizeSpeech,
  setXRPresenting,
  speechUnavailableReason,
} from './speech.js';
import { Haptics } from './haptics.js';
import { requestAI, requestIdeas } from './ai.js';
import {
  downloadBoard,
  importBoardFile,
  saveBoardLocal,
  loadBoardLocal,
  downloadMermaid,
} from './boardState.js';
import { createEnvironments } from './environments.js';
import { Whiteboard } from './whiteboard.js';
import { ZoneManager } from './zones.js';
import { Timer } from './timer.js';
import { Locomotion } from './locomotion.js';
import { History } from './history.js';
import { Hud } from './hud.js';
import { FLAT_WALK } from './walkable.js';

// --- Szene & Renderer ---

const DESKTOP_BG = new THREE.Color(0x1a1920);

const scene = new THREE.Scene();
scene.background = DESKTOP_BG;

// far reicht bis hinter die größte Himmelskuppel (44 m × Weltmaßstab 4 = 176 m)
// plus Reserve; bei 60 wurden die skalierte Insel und der Konstrukt-Boden
// abgeschnitten. near bleibt bei 5 cm – dort sitzt praktisch die gesamte
// Tiefengenauigkeit, ein größeres far kostet sie kaum.
// **Die Fernebene reicht bis 340 m, seit der Nachthimmel ein Planet ist.**
// Seine Kuppel steht 300 m vom Nordpol, das Sternfeld bei 280, der Mond bei
// 300 — mit den alten 260 m stand mitten im Bild ein **schwarzes Loch**: Die
// Fernebene schneidet nach Sichttiefe, nicht nach Abstand, also fiel genau der
// Kegel von 29,9 Grad um die Blickachse weg (cos 29,9° = 260/300), während der
// Rand der Kuppel schräg genug stand, um durchzukommen. Gemessen: Das Loch
// zeigte exakt die Hintergrundfarbe (10|6|5), und mit far = 5000 füllte es
// sich auf (30|32|38).
//
// Die Tiefenauflösung kostet das nichts. Sie hängt an 1/near − 1/far; mit
// near = 0,05 sind das 20,0 gegen vorher 19,996 — der Unterschied liegt bei
// zwei Zehntausendsteln.
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 340);
camera.position.set(0, 1.6, 1.2);

// Player-Rig: Kamera (und in XR die Controller) hängen hier. three.js wendet die
// Parent-Matrix auf die XR-Kamera an → Verschieben/Drehen dieser Gruppe bewegt
// den Nutzer durch die Welt (Grundlage für Desktop- und VR-Fortbewegung).
const player = new THREE.Group();
player.name = 'player';
player.add(camera);
scene.add(player);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
// Filmisches Tone-Mapping für weichere Lichtverläufe (weg vom flachen Look).
// UI/Karten sind per material.toneMapped = false ausgenommen, bleiben also knackig.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
// Schatten sind eine RENDERER-Einstellung und gehören deshalb hierher, nicht in
// eine einzelne Umgebung. Sie standen in der Dojo-Atmosphäre, die erst gebaut
// wird, wenn man das Dojo betritt – die Himmelsinsel hat ihre Schattenwerfer
// und -empfänger dadurch gesetzt, ohne dass je eine Schattenkarte entstand.
// Folgenlos für Umgebungen ohne Werfer: Ohne castShadow und receiveShadow
// rendert three keine Schattenkarte und ändert kein Pixel.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// **Das Grundlicht der App, und warum es je Umgebung regelbar sein muss.**
//
// Diese eine Hemisphärenleuchte gilt für alles: Passthrough, Desktop-Ansicht
// und jede der fünf Welten. Mit 1,4 ist sie so kräftig, dass eine Umgebung
// darunter kaum noch modellieren kann – der Zen-Garten kam auf gut die Hälfte
// seiner Flächenhelligkeit aus dieser Quelle, und weil eine Hemisphärenleuchte
// fast nur von `normal.y` abhängt, reagiert dieser Anteil auf keine
// Oberflächenform. Gemessen hatte der Sand dort über die ganze Fläche eine
// Spannweite von 17 Luminanzstufen.
//
// three kennt keine Beleuchtung je Objekt (Layer filtern nur kameraweit), also
// ist die Stärke der einzige Hebel. Sie liegt jetzt bei der Umgebung: Wer
// nichts angibt, bekommt weiterhin 1,4 – die vier anderen Welten und beide
// Nicht-Welt-Zustände ändern sich dadurch um kein Pixel.
const AMBIENT_STANDARD = 1.4;
const ambientLight = new THREE.HemisphereLight(0xffffff, 0x334455, AMBIENT_STANDARD);
scene.add(ambientLight);

// Umgebungen: Passthrough/Weiß (-1) sowie die virtuellen Welten aus
// environments.js, per 🌐-Button zyklisch durchschaltbar.
// Dezenter, weicher Boden statt Raster für die schlichte Desktop-/Weiß-Ansicht.
function makeDesktopFloor() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, '#2b2933');
  g.addColorStop(1, 'rgba(18, 17, 22, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(6, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  return mesh;
}
const desktopFloor = makeDesktopFloor();
scene.add(desktopFloor);

const environments = createEnvironments(scene);
const ENV_STORAGE_KEY = 'webxr-brainstorming-env';
let envIndex = -1; // -1 = Passthrough (AR) bzw. weißer Hintergrund

// **Wo Inhalte hängen, entscheidet die Umgebung.** Vier der fünf sind ortsfest
// und lassen Karten und Zonen an der Szene; der 🌌 Nachthimmel gibt seine
// Weltgruppe an, weil sich unter dem Nutzer der Planet dreht und alles, was an
// der Szene hinge, mit ihm um die Kugel liefe. Die vollständige Begründung
// steht in heimat.js.
//
// Der Umweg über Rückrufe ist nötig, weil `applyEnvironment()` schon beim
// Aufbau der Szene läuft — lange bevor es einen `cardManager` oder einen
// `zoneManager` gibt. Ein direkter Zugriff wäre ein Fehler in der temporalen
// Totzone, und der zeigt sich nicht als Fehlermeldung, sondern als Seite, die
// nie fertig lädt (die Lehre von `bodenFarbe` in environments.js).
let weltHeimatZiel = null;
const weltHeimatEmpfaenger = [];
function setzeWeltHeimat(ziel) {
  weltHeimatZiel = ziel;
  for (const empfaenger of weltHeimatEmpfaenger) empfaenger(ziel);
}
// Wer sich anmeldet, bekommt die aktuelle Wahl sofort — die Umgebung steht zu
// diesem Zeitpunkt längst fest.
function meldeWeltHeimat(empfaenger) {
  weltHeimatEmpfaenger.push(empfaenger);
  empfaenger(weltHeimatZiel ?? scene);
}

function applyEnvironment() {
  const inPassthrough = renderer.xr.isPresenting && xrMode === 'immersive-ar';
  setzeWeltHeimat((envIndex >= 0 ? environments[envIndex].weltHeimat : null) ?? scene);
  environments.forEach((env, i) => {
    env.group.visible = i === envIndex;
  });
  if (envIndex >= 0) {
    const env = environments[envIndex];
    scene.background = env.background;
    scene.fog = env.fog ?? null;
    // Environment-Map (IBL) für Umgebungen, die spiegelnde Materialien haben.
    // Erst hier gebaut, nicht beim Laden: Der PMREM-Generator braucht einen
    // lebenden Renderer und rechnet auf der GPU – das wäre Startzeit für jeden,
    // der die Umgebung nie aufruft. Ohne die Karte rendern Metall und Lack
    // schwarz, weil ein Metall ohne etwas zu spiegeln keine diffuse Komponente
    // hat.
    env.ensureEnvironment?.(renderer);
    scene.environment = env.environment ?? null;
    ambientLight.intensity = env.sceneAmbient ?? AMBIENT_STANDARD;
    desktopFloor.visible = false;
  } else if (inPassthrough) {
    ambientLight.intensity = AMBIENT_STANDARD;
    scene.background = null;
    scene.fog = null;
    scene.environment = null;
    desktopFloor.visible = false;
  } else {
    scene.background = DESKTOP_BG;
    scene.fog = null;
    scene.environment = null;
    ambientLight.intensity = AMBIENT_STANDARD;
    desktopFloor.visible = true;
  }
}

// Gemerkt wird die stabile `id` der Umgebung, nicht ihre Position in der Liste:
// Ein gespeicherter Index zeigt nach dem Entfernen oder Umsortieren einer
// Umgebung auf die falsche Welt. (Beim Entfernen von „Studio" wäre aus jedem
// gemerkten Konstrukt ein Zen-Garten geworden.) Ältere Einträge sind noch reine
// Zahlen – die werden ignoriert und landen auf Passthrough.
function savedEnvIndex() {
  try {
    const value = localStorage.getItem(ENV_STORAGE_KEY);
    if (value === null) return null;
    if (value === 'passthrough') return -1;
    const index = environments.findIndex((env) => env.id === value);
    return index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function cycleEnvironment() {
  envIndex = envIndex >= environments.length - 1 ? -1 : envIndex + 1;
  try {
    localStorage.setItem(
      ENV_STORAGE_KEY,
      envIndex >= 0 ? environments[envIndex].id : 'passthrough'
    );
  } catch {
    // Autosave der Umgebungswahl ist optional
  }
  applyEnvironment();
  const inAR = renderer.xr.isPresenting && xrMode === 'immersive-ar';
  setStatus(
    envIndex >= 0
      ? `${environments[envIndex].name} aktiv.`
      : inAR
        ? '🪟 Passthrough aktiv – du siehst wieder deinen Raum.'
        : 'Weißer Hintergrund aktiv.'
  );
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.4, -0.6);
controls.update();

// --- Bausteine ---

const cardManager = new CardManager(scene, { floorY: () => _floorY ?? 0 });

// **Ein Aufruf, drei Stellen.** Das Flussdiagramm braucht zwei Angaben, die es
// selbst nicht kennt: die Bodenhöhe unter dem Nutzer (sonst legt es sich auf
// y = 1,5 und damit auf dem Planeten unter den Boden) und die Heimat der Karten
// (sonst hängt es sie vom Planeten ab in die Szene). Beides stand an drei
// Aufrufstellen zu wiederholen — genau die Bauart, an der der Freiraum der
// Fortbewegung schon einmal auseinandergelaufen ist.
const ordneFluss = () =>
  layoutFlow(cardManager.cards, connectionManager.connections, camera, scene, {
    heimat: cardManager.heimat,
    boden: _floorY ?? 0,
  });
// Jetzt gibt es einen Empfänger für die Heimatwahl — und die Umgebung steht
// schon fest, also einmal nachziehen.
meldeWeltHeimat((ziel) => cardManager.setHeimat(ziel));
const connectionManager = new ConnectionManager(scene, cardManager);
// Fährt Karten sanft an neue Plätze, statt sie springen zu lassen.
const tweener = new Tweener();
cardManager.onCardRemoved = (card) => {
  connectionManager.removeForCard(card);
  // Eine gelöschte Karte darf nicht weiter animiert werden – sonst schreibt
  // der Tweener noch Positionen in ein entsorgtes Objekt.
  tweener.cancel(card.group);
};

// Kartenschrift (Barrierefreiheit): gewählte Stufe überdauert einen Reload und
// wird gesetzt, bevor die ersten Karten entstehen.
const FONT_STORAGE_KEY = 'webxr-brainstorming-cardfont';
try {
  const saved = parseInt(localStorage.getItem(FONT_STORAGE_KEY) ?? '', 10);
  if (Number.isInteger(saved)) cardManager.setFontStep(saved);
} catch {
  // Ohne gemerkte Stufe bleibt es bei „Normal"
}

const whiteboard = new Whiteboard(scene, {
  onSketch: () => handleAction('sketch'),
  floorY: () => _floorY ?? 0,
});

const zoneManager = new ZoneManager(scene, { floorY: () => _floorY ?? 0 });
// Zonen sind Rahmen, vor denen Karten stehen — sie müssen dieselbe Heimat haben
// wie die Karten, sonst löst sich die Gruppierung beim Weitergehen auf.
meldeWeltHeimat((ziel) => zoneManager.setHeimat(ziel));
zoneManager.onRename = async (zone) => {
  const text = await getUserText();
  if (text) {
    zone.setTitle(text);
    commit('Zone umbenannt');
    setStatus('Zone umbenannt.');
  }
};

const timer = new Timer(scene, { floorY: () => _floorY ?? 0 });

function boardToJSON() {
  return {
    ...cardManager.toJSON(),
    connections: connectionManager.toJSON(),
    whiteboard: whiteboard.toJSON(),
    zones: zoneManager.toJSON(),
  };
}

function applyBoardJSON(data) {
  // Erst die laufenden Bewegungen abbrechen: Ein Undo mitten in einer
  // laufenden Kartenfahrt würde die geladenen Positionen sonst gleich wieder
  // überschrieben bekommen.
  tweener.clear();
  cardManager.loadJSON(data);
  connectionManager.loadJSON(data?.connections ?? []);
  whiteboard.loadJSON(data?.whiteboard);
  zoneManager.loadJSON(data?.zones ?? []);
  // Beim Laden und bei jedem Undo werden alle Verbindungen neu aufgebaut – ein
  // gemerkter Pfeil zeigt danach auf ein entsorgtes Objekt.
  lastFlowEdge = null;
  // Befund 8: `applyState` ändert die Form der weiterhin ausgewählten Karte,
  // ohne die Auswahl anzufassen. Ohne diesen Aufruf bliebe die Markierung in
  // der Formleiste nach einem Undo auf der alten Form stehen.
  updateFlowShapeRow();
}

const keyboard = new VirtualKeyboard(scene, {
  onStatus: (message, duration = 5000) => setStatus(message, duration),
});
const wristMenu = new WristMenu((action) => handleAction(action));

// Kurzes Rumble als Rückmeldung in VR (Greifen, Menü-Klick, Verbinden, Löschen).
const haptics = new Haptics({
  getControllers: () => interactions.controllers,
  isPresenting: () => renderer.xr.isPresenting,
});

const interactions = new InteractionManager({
  renderer,
  scene,
  camera,
  cardManager,
  haptics,
  xrRoot: player,
  getUiTargets: () => [
    ...(renderer.xr.isPresenting && wristMenu.group.visible ? wristMenu.buttons : []),
    ...keyboard.uiTargets,
    ...whiteboard.uiTargets,
    ...zoneManager.uiTargets,
    ...timer.uiTargets,
    ...hud.uiTargets,
  ],
});
let handHintShown = false;
interactions.onInputConnected = ({ handedness, grip, hand, isHand }) => {
  wristMenu.registerSource(handedness, { grip, hand });
  // Hand-Tracking ist ohne Hinweis kaum zu erraten – einmal pro Sitzung zeigen.
  if (isHand && !handHintShown) {
    handHintShown = true;
    setStatus(
      '🖐 Hände erkannt: Handfläche öffnen = Menü · ins Leere pinchen und ziehen = bewegen',
      8000
    );
  }
};

// Fortbewegung: VR über den Player-Rig (Gleiten/Snap-Turn/Teleport),
// Desktop über WASD/Pfeile (siehe Animationsschleife).
const locomotion = new Locomotion({
  renderer,
  player,
  camera,
  controllers: interactions.controllers,
});

const UP = new THREE.Vector3(0, 1, 0);
// **Es gibt keine Hoch/Runter-Tasten mehr.** Q und E waren ein Freiflug ohne
// jede Grenze: Man stieg durch Baumkronen, schwebte unter die Insel und ueber
// das Dojo-Dach hinaus — und weil es keine Kollision gibt, landete man dabei
// regelmaessig IN einem Objekt statt davor. Die Hoehe kommt jetzt aus dem Boden
// unter dem Nutzer (walkable.js); die Blickhoehe bleibt ueber die Orbit-Maus
// regelbar, aber nur innerhalb eines Bandes ueber diesem Boden.
const moveKeys = { forward: false, back: false, left: false, right: false };
const MOVE_KEYMAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};
function isTypingTarget() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}
window.addEventListener('keydown', (e) => {
  if (isTypingTarget()) return;
  // Strg/Cmd gehört den Kürzeln (Strg+Z, Strg+A …), nicht der Fortbewegung.
  if (e.ctrlKey || e.metaKey) return;
  const k = MOVE_KEYMAP[e.code];
  if (k) moveKeys[k] = true;
});
window.addEventListener('keyup', (e) => {
  const k = MOVE_KEYMAP[e.code];
  if (k) moveKeys[k] = false;
});

// --- Bildqualität ------------------------------------------------------------
//
// Drei Stufen (siehe src/dojo/quality.js). Die Vorgabe hängt am Gerät: am
// Desktop die volle Fassung, in der Brille die mittlere. Der Nutzer kann sie
// überstimmen – im Handgelenk-Menü, weil die Frage nur auf dem Gerät zu
// beantworten ist, und über `?q=` für den Test am Rechner.
//
// `null` heißt „automatisch"; sobald einmal umgeschaltet wurde, gilt die Wahl
// für beide Betriebsarten.
const QUALITAETSSTUFEN = ['sparsam', 'mittel', 'voll'];
const QUALITAET_NAMEN = { sparsam: 'sparsam', mittel: 'mittel', voll: 'voll' };
let qualitaetsWahl = (() => {
  const q = new URLSearchParams(location.search).get('q');
  return QUALITAETSSTUFEN.includes(q) ? q : null;
})();

function aktuelleQualitaet() {
  if (qualitaetsWahl) return qualitaetsWahl;
  return renderer.xr.isPresenting ? 'mittel' : 'voll';
}

function applyQualityTier() {
  const stufe = aktuelleQualitaet();
  for (const env of environments) env.setQuality?.(stufe);
  return stufe;
}

function cycleQuality() {
  const jetzt = aktuelleQualitaet();
  const i = QUALITAETSSTUFEN.indexOf(jetzt);
  qualitaetsWahl = QUALITAETSSTUFEN[(i + 1) % QUALITAETSSTUFEN.length];
  const stufe = applyQualityTier();
  // Die Umgebung muss die Änderung sehen: `setQuality` liefert die neue
  // Environment-Map zurück, und die hängt an der Szene, nicht an der Gruppe.
  applyEnvironment();
  setStatus(`🎚 Bildqualität: ${QUALITAET_NAMEN[stufe]}`);
}

// Desktop: Standpunkt (Kamera + Orbit-Ziel) gemeinsam durch die Welt schieben,
// sodass die gewohnte Orbit-Ansicht und Karten-Bedienung erhalten bleiben.
const _moveFwd = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _moveDelta = new THREE.Vector3();
function updateDesktopMovement(dt) {
  const f = (moveKeys.forward ? 1 : 0) - (moveKeys.back ? 1 : 0);
  const s = (moveKeys.right ? 1 : 0) - (moveKeys.left ? 1 : 0);
  if (!f && !s) return;
  camera.getWorldDirection(_moveFwd);
  _moveFwd.y = 0;
  if (_moveFwd.lengthSq() < 1e-6) _moveFwd.set(0, 0, -1);
  _moveFwd.normalize();
  _moveRight.crossVectors(_moveFwd, UP).normalize();
  _moveDelta.set(0, 0, 0).addScaledVector(_moveFwd, f).addScaledVector(_moveRight, s);
  if (_moveDelta.lengthSq() > 0) _moveDelta.normalize();
  const speed = 3.4;
  _moveDelta.multiplyScalar(speed * dt);
  camera.position.add(_moveDelta);
  controls.target.add(_moveDelta);
}

// --- Status: DOM-Zeile am Desktop + schwebendes HUD in XR ---

const hud = new Hud(camera);

let hudTimer = 0;
const statusBand = document.getElementById('status-band');
const statusText = document.getElementById('status');
function setStatus(message, ms = 3500) {
  if (statusText) statusText.textContent = message;
  statusBand?.classList.toggle('show', Boolean(message));
  hud.setStatus(message, ms);
  clearTimeout(hudTimer);
  if (message && ms) {
    hudTimer = setTimeout(() => {
      if (statusText) statusText.textContent = '';
      statusBand?.classList.remove('show');
    }, ms);
  }
}

// Ladeanzeige: 3D-Panel im Blickfeld plus Zustand am Desktop-Band.
function setBusyLabel(label) {
  hud.setBusy(label);
  statusBand?.classList.toggle('busy', Boolean(label));
}

function showError(message, error) {
  console.error(error ?? message);
  hud.showError(message);
  haptics.pulse('error');
  setStatus(`Fehler: ${message}`, 8000);
}

// --- Undo/Redo ---
//
// Gesichert werden Karten und Verbindungen. Die Whiteboard-Zeichnung bleibt
// bewusst außen vor: Sie ist ein PNG pro Schritt und würde den Verlauf sprengen.
const history = new History({
  capture: () => ({
    cards: cardManager.toJSON().cards,
    connections: connectionManager.toJSON(),
    zones: zoneManager.toJSON(),
  }),
  restore: (state) => {
    cardManager.applyState(state.cards);
    connectionManager.loadJSON(state.connections);
    zoneManager.loadJSON(state.zones);
  },
});

function commit(label) {
  history.commit(label);
  updateHistoryButtons();
}

// Fortlaufende Gesten (Mausrad, Daumenstick) erzeugen sonst pro Frame einen
// Schritt – erst nach einer kurzen Pause wird daraus ein Verlaufseintrag.
let commitTimer = 0;
let pendingCommit = null;
function commitSoon(label, delay = 700) {
  pendingCommit = label;
  clearTimeout(commitTimer);
  commitTimer = setTimeout(flushCommit, delay);
}

// Vor Undo/Redo nachholen, sonst würde ein Zurückspringen die noch offene
// Größenänderung überspringen statt sie rückgängig zu machen.
function flushCommit() {
  if (!pendingCommit) return;
  clearTimeout(commitTimer);
  const label = pendingCommit;
  pendingCommit = null;
  commit(label);
}

function updateHistoryButtons() {
  const undo = document.getElementById('btn-undo');
  const redo = document.getElementById('btn-redo');
  if (undo) undo.disabled = !history.canUndo;
  if (redo) redo.disabled = !history.canRedo;
}

interactions.onCardGrabStart = (card) => tweener.cancel(card.group);
interactions.onCardMoved = () => commit('Karte verschoben');
interactions.onCardScaled = () => commitSoon('Kartengröße');
// Zonen hängen ebenfalls im Verlauf; die Whiteboard-Griffleiste löst hier zwar
// auch aus, ändert aber nichts am gesicherten Zustand und erzeugt keinen Schritt.
interactions.onGrabMoved = () => commit('Zone verschoben');
interactions.onGrabScaled = () => commitSoon('Zonengröße');
zoneManager.onChange = (label) => commit(label);

// --- Aktionen (Wrist-Menü in XR, DOM-Buttons am Desktop) ---

let busy = false;

let clearArmedAt = 0;
let linkSource = null;
// 'lose' = ungerichtete Linie, 'flow' = gerichteter Prozesspfeil. Beide laufen
// über dieselbe Auswahl-Mechanik (Quelle merken, Ziel antippen).
//
// Der Wert hieß bis zur Entfernung des Mindmap-Layouts `'mindmap'`. Das war
// schon vorher missverständlich – gemeint ist die Linie, nicht das Layout –,
// und ohne das Layout wäre es ein Name ohne Gegenstück gewesen. Er steht in
// keiner gespeicherten Datei: `connections.js` legt `directed: false` ab, nicht
// diesen Bezeichner.
let linkMode = 'lose';
// Zuletzt gezogener Pfeil – „Zweig benennen" beschriftet ihn.
let lastFlowEdge = null;

function startLinking(mode = 'lose') {
  const selected = cardManager.selected;
  if (!selected) {
    setStatus('Bitte zuerst eine Karte auswählen.');
    return;
  }
  linkSource = selected;
  linkMode = mode;
  setStatus(
    mode === 'flow'
      ? '➜ Pfeil: Ziel-Schritt anklicken (gleiche Karte oder Esc = abbrechen)'
      : '🔗 Verbinden: Ziel-Karte anklicken (gleiche Karte oder Esc = abbrechen)',
    0
  );
}

// Meldet Wiederholversuche an die Ladeanzeige, damit eine hakelige Verbindung
// sichtbar wird statt sich als scheinbarer Stillstand zu zeigen.
function aiProgress(label) {
  return {
    onProgress: ({ attempt, maxAttempts, waitMs, message }) => {
      setBusyLabel(
        `${label} – Versuch ${attempt + 1}/${maxAttempts} in ${Math.ceil(waitMs / 1000)} s`
      );
      setStatus(`⚠️ ${message} Neuer Versuch…`, 0);
    },
  };
}

async function handleAction(action) {
  if (busy) {
    setStatus('Claude arbeitet noch – einen Moment.');
    return;
  }
  try {
    if (action === 'new') {
      await newCardFlow();
      return;
    }
    if (action === 'environment') {
      cycleEnvironment();
      return;
    }
    if (action === 'quality') {
      cycleQuality();
      return;
    }
    if (action === 'fontsize') {
      cycleCardFont();
      return;
    }
    if (action === 'flow-node') {
      newFlowNode();
      return;
    }
    if (action === 'flow-type') {
      cycleFlowType();
      return;
    }
    if (action === 'flow-arrow') {
      startLinking('flow');
      return;
    }
    if (action === 'flow-label') {
      labelFlowEdge();
      return;
    }
    if (action === 'flow-layout') {
      const count = ordneFluss();
      if (!count) {
        setStatus('Noch keine Prozessschritte da – erst „Schritt" oder „Aus Text" benutzen.');
        return;
      }
      commit('Prozess angeordnet');
      setStatus(`⤓ ${count} Schritte angeordnet.`);
      return;
    }
    if (action === 'flow-generate') {
      buildFlowFromText();
      return;
    }
    if (action === 'flow-export') {
      const count = downloadMermaid(boardToJSON());
      setStatus(
        count
          ? `⬇️ ${count} Schritte als Mermaid gespeichert.`
          : 'Kein Prozessdiagramm auf dem Board – erst Schritte anlegen.'
      );
      return;
    }
    if (action === 'undo') {
      flushCommit();
      const label = history.undo();
      updateHistoryButtons();
      setStatus(label ? `↶ Rückgängig: ${label}` : 'Kein Schritt zum Rückgängigmachen.');
      return;
    }
    if (action === 'redo') {
      flushCommit();
      const label = history.redo();
      updateHistoryButtons();
      setStatus(label ? `↷ Wiederhergestellt: ${label}` : 'Kein Schritt zum Wiederherstellen.');
      return;
    }
    if (action === 'export') {
      const count = downloadBoard(boardToJSON());
      setStatus(
        renderer.xr.isPresenting
          ? `⬇️ ${count} Karten als JSON exportiert – die Datei liegt nach der Sitzung in den Downloads.`
          : `⬇️ ${count} Karten als JSON exportiert.`
      );
      return;
    }
    if (action === 'whiteboard') {
      const show = !whiteboard.group.visible;
      whiteboard.setVisible(show);
      if (show) whiteboard.placeInFront(camera);
      setStatus(
        show
          ? '📋 Whiteboard eingeblendet – einfach drauf loszeichnen.'
          : 'Whiteboard ausgeblendet.'
      );
      return;
    }
    if (action === 'sketch') {
      if (!whiteboard.hasContent) {
        setStatus('Das Whiteboard ist leer – erst etwas zeichnen.');
        return;
      }
      busy = true;
      setStatus('Claude analysiert die Skizze…', 0);
      setBusyLabel('Claude liest die Skizze…');
      const image = whiteboard.toDataURL().split(',')[1];
      const result = await requestIdeas(
        'whiteboard',
        { image, ideas: cardManager.cards.map((c) => c.text) },
        aiProgress('Claude liest die Skizze…')
      );
      cardManager.spawnIdeas(
        result.map((i) => i.text),
        camera
      );
      commit('Ideen aus Skizze');
      setStatus(`✨ ${result.length} Ideen aus der Skizze erstellt.`);
      return;
    }
    if (action === 'color') {
      const selected = cardManager.selected;
      if (!selected) {
        setStatus('Bitte zuerst eine Karte auswählen.');
        return;
      }
      selected.setColor(selected.colorIndex + 1);
      commit('Kartenfarbe');
      return;
    }
    if (action === 'zone') {
      const zone = zoneManager.addZone({
        title: 'Neue Zone',
        colorIndex: zoneManager.zones.length,
      });
      zone.placeInFront(camera);
      commit('Zone erstellt');
      setStatus('🗂️ Zone erstellt – Karten davor gruppieren. ✎ zum Umbenennen.');
      return;
    }
    if (action === 'timer') {
      const shown = timer.toggle(camera);
      setStatus(shown ? '⏱️ Timebox eingeblendet.' : 'Timebox ausgeblendet.');
      return;
    }
    if (action === 'critic') {
      const selected = cardManager.selected;
      if (!selected) {
        setStatus('Bitte zuerst eine Karte auswählen.');
        return;
      }
      busy = true;
      setStatus('😈 Advocatus Diaboli prüft die Idee…', 0);
      setBusyLabel('😈 Advocatus Diaboli prüft…');
      const result = await requestIdeas(
        'critic',
        { selectedIdea: selected.text, ideas: cardManager.cards.map((c) => c.text) },
        aiProgress('😈 Advocatus Diaboli prüft…')
      );
      const cards = cardManager.spawnIdeas(
        result.map((i) => i.text),
        camera
      );
      for (const card of cards) card.setColor(4); // Rot = kritische Einwände
      commit('Kritische Einwände');
      setStatus(`😈 ${result.length} kritische Einwände zu „${selected.text}“`);
      return;
    }
    if (action === 'connect') {
      startLinking();
      return;
    }
    if (action === 'topic') {
      const topic = await getUserText();
      if (!topic) return;
      busy = true;
      setStatus(`Claude erstellt ein Start-Board zu „${topic}“…`, 0);
      setBusyLabel(`Start-Board zu „${topic}“…`);
      const result = await requestIdeas(
        'topic',
        { topic, ideas: cardManager.cards.map((c) => c.text) },
        aiProgress(`Start-Board zu „${topic}“…`)
      );
      cardManager.spawnIdeas(
        result.map((i) => i.text),
        camera
      );
      commit(`Themen-Start „${topic}“`);
      setStatus(`Start-Board zu „${topic}“: ${result.length} Ideen.`);
      return;
    }
    if (action === 'clear') {
      if (!cardManager.cards.length) {
        setStatus('Das Board ist schon leer.');
        return;
      }
      if (Date.now() - clearArmedAt > 4000) {
        clearArmedAt = Date.now();
        setStatus('⚠️ Wirklich ALLE Karten löschen? Nochmal drücken zum Bestätigen.', 4000);
        return;
      }
      clearArmedAt = 0;
      cardManager.clear();
      haptics.pulse('delete');
      commit('Alles löschen');
      setStatus('Alle Karten gelöscht – „↶ Rückgängig" holt sie zurück.');
      return;
    }
    if (action === 'delete') {
      const selected = cardManager.selected;
      if (!selected) {
        setStatus('Bitte zuerst eine Karte auswählen.');
        return;
      }
      cardManager.removeCard(selected);
      haptics.pulse('delete');
      commit('Karte gelöscht');
      setStatus('Karte gelöscht.');
      return;
    }
    const ideas = cardManager.cards.map((c) => c.text);
    if (!ideas.length) {
      setStatus('Das Board ist leer – erst Karten anlegen.');
      return;
    }
    busy = true;
    if (action === 'related') {
      const selected = cardManager.selected;
      if (!selected) {
        setStatus('Bitte zuerst eine Karte auswählen (Trigger/Klick).');
        return;
      }
      setStatus('Claude generiert verwandte Ideen…', 0);
      setBusyLabel('Claude sucht verwandte Ideen…');
      const result = await requestIdeas(
        'related',
        { selectedIdea: selected.text, ideas },
        aiProgress('Claude sucht verwandte Ideen…')
      );
      cardManager.spawnIdeas(
        result.map((i) => i.text),
        camera
      );
      commit('Verwandte Ideen');
      setStatus(`${result.length} neue Ideen zu „${selected.text}“`);
    } else if (action === 'cluster') {
      if (ideas.length < 2) {
        setStatus('Für Cluster werden mindestens 2 Karten benötigt.');
        return;
      }
      setStatus('Claude gruppiert die Karten…', 0);
      setBusyLabel('Claude gruppiert die Karten…');
      // Snapshot, damit die Indizes der Antwort zu den gesendeten Ideen passen
      const snapshot = [...cardManager.cards];
      const data = await requestAI(
        'cluster',
        { ideas: snapshot.map((c) => c.text) },
        aiProgress('Claude gruppiert die Karten…')
      );
      const clusterDefs = (data.clusters ?? [])
        .map((cl, i) => ({
          name: cl.name,
          colorIndex: 1 + (i % (CARD_COLORS.length - 1)),
          cards: (cl.ideaIndexes ?? [])
            .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < snapshot.length)
            .map((idx) => snapshot[idx]),
        }))
        .filter((def) => def.cards.length);
      if (!clusterDefs.length) throw new Error('Keine verwertbaren Cluster erhalten.');
      cardManager.applyClusters(clusterDefs, camera);
      commit('Cluster angewendet');
      setStatus(
        `${clusterDefs.length} Cluster angewendet – Karten wurden gruppiert und eingefärbt.`
      );
    } else if (action === 'summary') {
      setStatus('Claude fasst das Board zusammen…', 0);
      setBusyLabel('Claude fasst zusammen…');
      const result = await requestIdeas('summary', { ideas }, aiProgress('Claude fasst zusammen…'));
      const cards = cardManager.spawnIdeas(
        result.map((i) => i.text),
        camera
      );
      // Eine Zusammenfassung ist deutlich länger als eine Idee. Sie bekommt
      // deshalb eine größere Karte – der Text schrumpft sonst zwar mit (siehe
      // shrinkToFit in textPanel.js), wäre auf Ideengröße aber winzig.
      for (const card of cards) {
        card.setScale(1.7);
        card.setColor(6); // Neutral – hebt das Ergebnis von den Ideen ab
      }
      commit('Zusammenfassung');
      setStatus('Zusammenfassung erstellt.');
    }
  } catch (err) {
    showError(err.message, err);
  } finally {
    busy = false;
    setBusyLabel(null);
  }
}

// --- Kartenschrift (Barrierefreiheit) ---

function cycleCardFont() {
  const step = cardManager.cycleFontStep();
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(cardManager.fontStepIndex));
  } catch {
    // Merken der Stufe ist optional
  }
  updateFontButton();
  setStatus(`🔠 Kartenschrift: ${step.label}`);
}

function updateFontButton() {
  const button = document.getElementById('btn-fontsize');
  // In den Label-Span schreiben, nicht in den Knopf: textContent auf dem
  // Knopf würde das Icon gleich mit auslöschen.
  const lbl = button?.querySelector('.lbl');
  if (lbl) lbl.textContent = `Schrift: ${cardManager.fontStep.label}`;
}

// **Sprachbefehle gibt es nicht mehr.**
//
// Hier stand ein `VoiceCommands`-Erkenner, der dauerhaft zuhörte und gut
// zwanzig Kommandos auf dieselben Aktions-IDs abbildete, die auch das Menü
// auslöst. Er ist ersatzlos raus: Ein Mikrofon, das die ganze Sitzung
// mitschneidet und jede Äußerung serverseitig verarbeiten lässt (die Web
// Speech API tut genau das), ist ein hoher Preis für einen zweiten Weg zu
// Knöpfen, die ohnehin danebenstehen. Das Diktat bleibt – es macht etwas, das
// kein Knopf ersetzt, und läuft nur, solange man es gedrückt hält.

// --- Prozessflussdiagramm ---
//
// Die Knoten sind ganz normale Karten mit gesetztem `flowType` (siehe
// FLOW_TYPES in cards.js). Dadurch erben sie Greifen, Auswahl, Undo/Redo,
// Autosave und Export, ohne dass davon etwas nachgebaut werden müsste.

// Reihenfolge beim Durchschalten: erst die häufigen Arten, dann zurück zur
// gewöhnlichen Ideenkarte. Nur für VR – am Desktop wird die Form direkt
// gewählt (Formleiste im Overlay und im Kontextmenü).
const FLOW_CYCLE = ['task', 'decision', 'start', 'end', null];

// Icons für die Formleiste im Kontextmenü – dieselben Miniaturformen wie im
// Overlay. Vorher standen hier Unicode-Zeichen (⬭ ▭ ◇ ⬬), und die hatten genau
// das Problem, das die Icons abgelöst haben: „Ende" (⬬) kam als *gefüllte*
// Ellipse heraus, „Start" (⬭) als Umriss – zwei Formen, die im Diagramm gleich
// aussehen, wirkten im Menü völlig verschieden, je nach installiertem Font.
const FLOW_ICONS = {
  start: 'flow-start',
  task: 'flow-task',
  decision: 'flow-decision',
  end: 'flow-end',
};

// Eine Form setzen und den Schritt festhalten. Einziger Weg dorthin, damit
// Overlay, Kontextmenü und VR-Menü sich nicht auseinanderentwickeln.
function applyFlowType(card, id) {
  if (!card) {
    setStatus('Bitte zuerst eine Karte auswählen.');
    return;
  }
  card.setFlowType(id);
  commit('Form gewechselt');
  updateFlowShapeRow();
  setStatus(`Form: ${id ? flowTypeById(id).label : 'Normale Karte'}`);
}

// Formleiste im Overlay: zeigt, welche Form die ausgewählte Karte hat, und
// setzt beim Klick direkt die gewünschte – kein Durchschalten wie in VR.
function updateFlowShapeRow() {
  const row = document.getElementById('flow-shapes');
  if (!row) return;
  const current = cardManager.selected?.flowType ?? null;
  const hasSelection = Boolean(cardManager.selected);
  for (const button of row.querySelectorAll('button')) {
    const id = button.dataset.flowType || null;
    button.classList.toggle('active', hasSelection && id === current);
    button.disabled = !hasSelection;
  }
}

async function newFlowNode() {
  const text = await getUserText();
  if (!text) return;
  const card = cardManager.spawnIdeas([text], camera)[0];
  card.setFlowType('task');
  cardManager.select(card);
  updateFlowShapeRow();
  commit('Prozessschritt angelegt');
  setStatus('Schritt angelegt – „◇ Form wechseln" macht daraus Start, Entscheidung oder Ende.');
}

function cycleFlowType() {
  const card = cardManager.selected;
  if (!card) {
    setStatus('Bitte zuerst eine Karte auswählen.');
    return;
  }
  const at = FLOW_CYCLE.indexOf(card.flowType);
  applyFlowType(card, FLOW_CYCLE[(at + 1) % FLOW_CYCLE.length]);
}

async function labelFlowEdge() {
  // Bevorzugt der zuletzt gezogene Pfeil; sonst der erste unbeschriftete
  // Ausgang der gewählten Karte. Alles andere wäre eine zweite Auswahlrunde
  // für eine Beschriftung von zwei Buchstaben.
  let edge = lastFlowEdge;
  if (!edge && cardManager.selected) {
    edge = connectionManager.edgesFrom(cardManager.selected).find((e) => !e.label) ?? null;
  }
  if (!edge) {
    setStatus('Erst einen Pfeil ziehen – oder die Karte wählen, von der er ausgeht.');
    return;
  }
  // Leere Eingabe entfernt die Beschriftung. `getUserText()` liefert dafür
  // null – dasselbe wie ein Abbruch –, deshalb wird hier unterschieden: Bei
  // einer bereits beschrifteten Kante gilt „nichts eingegeben" als Löschen,
  // sonst als Abbruch. Vorher war das Entfernen schlicht nicht erreichbar.
  const text = await getUserText();
  if (text === null && !edge.label) return;
  const next = text ?? '';
  if (!connectionManager.setLabel(edge, next)) {
    lastFlowEdge = null;
    setStatus('Dieser Pfeil gibt es nicht mehr.');
    return;
  }
  commit('Zweig benannt');
  setStatus(next ? `🏷 Zweig „${next}".` : 'Beschriftung entfernt.');
}

// Prozess aus einer Beschreibung bauen lassen und sofort anordnen.
async function buildFlowFromText() {
  if (busy) {
    setStatus('Claude arbeitet noch – einen Moment.');
    return;
  }
  const description = await getUserText();
  if (!description) return;
  try {
    busy = true;
    setStatus(`Claude baut den Prozess zu „${description}"…`, 0);
    setBusyLabel(`Prozess zu „${description}"…`);
    const data = await requestAI('flow', { topic: description }, aiProgress('Prozess'));
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    if (!nodes.length) throw new Error('Claude hat keinen verwertbaren Prozess geliefert.');

    // Vorhandene Prozessschritte weichen dem neuen Diagramm.
    //
    // Ohne das lägen zwei Prozesse übereinander: „⤓ Anordnen" rangiert alle
    // Prozessknoten gemeinsam, beide Startknoten landen auf Rang 0 und beide
    // Ketten teilen sich dieselben Spalten – das sieht nach kaputtem Layout
    // aus, nicht nach zwei Diagrammen. Ideenkarten bleiben unangetastet, und
    // Rückgängig holt den alten Prozess zurück.
    const previous = cardManager.cards.filter((c) => c.flowType);
    for (const node of previous) cardManager.removeCard(node);

    // Antwort-IDs sind nur innerhalb der Antwort gültig – hier auf die echten
    // Karten-IDs abgebildet.
    const byResponseId = new Map();
    for (const node of nodes) {
      const card = cardManager.addCard(node.text, { flowType: node.type });
      byResponseId.set(node.id, card);
    }
    for (const edge of Array.isArray(data?.edges) ? data.edges : []) {
      const from = byResponseId.get(edge.from);
      const to = byResponseId.get(edge.to);
      if (from && to) connectionManager.connect(from, to, { label: edge.label });
    }
    ordneFluss();
    commit('Prozess erzeugt');
    setStatus(
      previous.length
        ? `✨ Prozess mit ${nodes.length} Schritten gebaut – der vorherige wurde ersetzt (↶ holt ihn zurück).`
        : `✨ Prozess mit ${nodes.length} Schritten gebaut.`,
      7000
    );
  } catch (err) {
    showError(err.message);
  } finally {
    busy = false;
    setBusyLabel(null);
  }
}

// Themen-Start mit bereits bekanntem Thema.
async function startTopic(topic) {
  if (busy) {
    setStatus('Claude arbeitet noch – einen Moment.');
    return;
  }
  try {
    busy = true;
    setStatus(`Claude erstellt ein Start-Board zu „${topic}“…`, 0);
    setBusyLabel(`Start-Board zu „${topic}“…`);
    const result = await requestIdeas(
      'topic',
      { topic, ideas: cardManager.cards.map((c) => c.text) },
      aiProgress(`Start-Board zu „${topic}“…`)
    );
    cardManager.spawnIdeas(
      result.map((i) => i.text),
      camera
    );
    commit(`Themen-Start „${topic}“`);
    setStatus(`Start-Board zu „${topic}“: ${result.length} Ideen.`);
  } catch (err) {
    showError(err.message, err);
  } finally {
    busy = false;
    setBusyLabel(null);
  }
}

// Texteingabe: XR = Tastatur mit Diktat-Knopf, Desktop = Eingabefeld.
//
// Der Diktat-Versuch läuft nicht mehr automatisch vor der Tastatur: Auf der
// Quest scheitert er zuverlässig, und die Wartezeit bis zum Fehlschlag verzögert
// jede Eingabe. Stattdessen öffnet sich direkt die Tastatur – mit „🎤 Sprechen"
// als gleichwertigem Weg für alle, die nicht tippen wollen.
async function getUserText() {
  if (renderer.xr.isPresenting) {
    // In XR wird getippt. Spracheingabe ist dort abgeschaltet (siehe speech.js),
    // es gibt also auch keinen Erkenner, der ums Mikrofon streiten könnte.
    return await new Promise((resolve) => {
      keyboard.open(camera, {
        onSubmit: (text) => resolve(text),
        onCancel: () => {
          setStatus('');
          resolve(null);
        },
      });
    });
  }
  const input = document.getElementById('idea-input');
  const text = input.value.trim();
  if (!text) {
    setStatus('Bitte zuerst Text ins Eingabefeld tippen.');
    input.focus();
    return null;
  }
  input.value = '';
  return text;
}

async function newCardFlow() {
  const text = await getUserText();
  if (!text) return;
  cardManager.spawnIdeas([text], camera);
  commit('Neue Karte');
  setStatus('Karte erstellt.');
}

// --- Desktop-UI ---

// Alle data-icon-Halterungen im Overlay und Kontextmenü mit ihren SVGs
// bestücken – einmal beim Start, die Elemente sind statisches Markup. Wirft
// bei unbekanntem Icon-Namen, damit ein Tippfehler nicht als leere Halterung
// überlebt.
decorateIcons();

const DESKTOP_BUTTONS = {
  'btn-new': 'new',
  'btn-related': 'related',
  'btn-critic': 'critic',
  'btn-cluster': 'cluster',
  'btn-summary': 'summary',
  'btn-zone': 'zone',
  'btn-timer': 'timer',
  'btn-topic': 'topic',
  'btn-whiteboard': 'whiteboard',
  'btn-export': 'export',
  'btn-mermaid': 'flow-export',
  'btn-flow': 'flow-generate',
  'btn-flow-arrow': 'flow-arrow',
  'btn-flow-label': 'flow-label',
  'btn-flow-layout': 'flow-layout',
  'btn-clear': 'clear',
  'btn-env': 'environment',
  'btn-undo': 'undo',
  'btn-redo': 'redo',
};
for (const [id, action] of Object.entries(DESKTOP_BUTTONS)) {
  document.getElementById(id)?.addEventListener('click', () => handleAction(action));
}

// Formleiste: setzt die Form der ausgewählten Karte direkt.
document.getElementById('flow-shapes')?.addEventListener('click', (e) => {
  const id = e.target?.dataset?.flowType;
  if (id === undefined) return;
  applyFlowType(cardManager.selected, id || null);
});
cardManager.onSelect = () => updateFlowShapeRow();
updateFlowShapeRow();
document.getElementById('idea-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAction('new');
});
updateFontButton();

// Diktieren am Desktop: füllt das Eingabefeld, statt einen eigenen Dialog zu
// öffnen – von dort geht es mit Enter oder jedem KI-Button ganz normal weiter.
const dictateButton = document.getElementById('btn-dictate');
let dictateAbort = null;

async function toggleDesktopDictation() {
  const input = document.getElementById('idea-input');
  if (dictateAbort) {
    dictateAbort.abort();
    return;
  }
  if (!isSpeechAvailable()) {
    setStatus(speechUnavailableReason(), 7000);
    return;
  }
  const controller = new AbortController();
  dictateAbort = controller;
  const before = input.value.trim();
  if (dictateButton) {
    const lbl = dictateButton.querySelector('.lbl');
    if (lbl) lbl.textContent = 'Hört zu…';
    dictateButton.classList.add('active');
  }
  setStatus('🎤 Sprich jetzt…', 0);
  try {
    const text = await recognizeSpeech({
      signal: controller.signal,
      onPartial: (partial) => {
        input.value = before ? `${before} ${partial}` : partial;
      },
    });
    input.value = before ? `${before} ${text}` : text;
    input.focus();
    setStatus('Diktat übernommen – Enter legt die Karte an.');
  } catch (err) {
    input.value = before;
    setStatus(err.message, 6000);
  } finally {
    dictateAbort = null;
    if (dictateButton) {
      const lbl = dictateButton.querySelector('.lbl');
      if (lbl) lbl.textContent = 'Diktieren';
      dictateButton.classList.remove('active');
    }
  }
}

dictateButton?.addEventListener('click', toggleDesktopDictation);

// Auf einer Brille verschwindet der ganze Abschnitt „Sprache".
//
// Er steht im Desktop-Overlay, das auf der Quest vor dem Start der Sitzung als
// normale Webseite sichtbar ist – dort wäre „Diktieren" erreichbar, könnte aber
// nur scheitern: Spracherkennung gibt es auf dem Gerät nicht. Ein Knopf, der
// bestenfalls eine Fehlermeldung ausgibt und schlimmstenfalls den Browser
// mitreißt, gehört nicht in die Oberfläche.
//
// Entfernt wird der **Abschnitt**, nicht der Knopf: Vorher blieb die
// Überschrift „Sprache" ohne Inhalt stehen.
if (isHeadsetBrowser()) {
  document.getElementById('speech-section')?.remove();
}
document.getElementById('btn-fontsize')?.addEventListener('click', () => handleAction('fontsize'));

// --- Overlay ein-/ausklappen (Desktop) ---
//
// Eingeklappt bleibt nur der Knopf stehen, das Board bekommt die volle Fläche.
// Der Zustand hält über einen Reload – wer das Menü weghaben will, will es
// beim nächsten Öffnen meist immer noch weg.

const MENU_STORAGE_KEY = 'webxr-brainstorming-menu-collapsed';
const collapseButton = document.getElementById('btn-collapse');

function applyMenuCollapsed(collapsed) {
  document.body.classList.toggle('menu-collapsed', collapsed);
  if (!collapseButton) return;
  collapseButton.textContent = collapsed ? '☰' : '‹';
  collapseButton.title = collapsed ? 'Menü ausklappen (M)' : 'Menü einklappen (M)';
  collapseButton.setAttribute('aria-expanded', String(!collapsed));
}

function setMenuCollapsed(collapsed) {
  applyMenuCollapsed(collapsed);
  try {
    localStorage.setItem(MENU_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Merken des Zustands ist optional
  }
}

function toggleMenu() {
  setMenuCollapsed(!document.body.classList.contains('menu-collapsed'));
}

collapseButton?.addEventListener('click', toggleMenu);

let menuCollapsedAtStart = false;
try {
  menuCollapsedAtStart = localStorage.getItem(MENU_STORAGE_KEY) === '1';
} catch {
  menuCollapsedAtStart = false;
}
applyMenuCollapsed(menuCollapsedAtStart);
document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    applyBoardJSON(await importBoardFile(file));
    commit('Board importiert');
    setStatus(`Board importiert (${cardManager.cards.length} Karten).`);
  } catch (err) {
    showError(`Import fehlgeschlagen: ${err.message}`, err);
  }
  e.target.value = '';
});

// --- Verbindungsmodus: Quell-Karte gewählt, nächster Karten-Pick verbindet ---

interactions.onCardPick = (card) => {
  if (!linkSource) return false;
  if (card === linkSource) {
    linkSource = null;
    setStatus('Verbinden abgebrochen.');
    return true;
  }
  if (linkMode === 'flow') {
    const result = connectionManager.connect(linkSource, card);
    lastFlowEdge = result === 'added' ? connectionManager.findDirected(linkSource, card) : null;
    haptics.pulse('connect');
    commit(result === 'added' ? 'Pfeil gezogen' : 'Pfeil entfernt');
    setStatus(
      result === 'added'
        ? '➜ Pfeil gezogen. „🏷 Zweig benennen" beschriftet ihn.'
        : 'Pfeil entfernt.'
    );
    linkSource = null;
    return true;
  }
  const result = connectionManager.toggle(linkSource, card);
  haptics.pulse('connect');
  commit(result === 'added' ? 'Verbindung erstellt' : 'Verbindung entfernt');
  setStatus(result === 'added' ? '🔗 Verbindung erstellt.' : 'Verbindung entfernt.');
  linkSource = null;
  return true;
};

// --- Kontextmenü (Rechtsklick auf Karte, Desktop) ---

const contextMenu = document.getElementById('context-menu');
let contextCard = null;

function openContextMenu(card, x, y) {
  contextCard = card;
  contextMenu.hidden = false;
  const rect = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(x, innerWidth - rect.width - 8)}px`;
  contextMenu.style.top = `${Math.min(y, innerHeight - rect.height - 8)}px`;
}

function closeContextMenu() {
  contextMenu.hidden = true;
  contextCard = null;
}

contextMenu.addEventListener('click', (e) => {
  const action = e.target.dataset?.action;
  const card = contextCard;
  closeContextMenu();
  if (!action || !card) return;
  if (action === 'edit') {
    openEditor(card);
  } else if (action === 'delete') {
    cardManager.removeCard(card);
    commit('Karte gelöscht');
    setStatus('Karte gelöscht.');
  } else if (action === 'related') {
    cardManager.select(card);
    handleAction('related');
  } else if (action === 'critic') {
    cardManager.select(card);
    handleAction('critic');
  } else if (action === 'connect') {
    cardManager.select(card);
    startLinking();
  } else if (action === 'flow-arrow') {
    cardManager.select(card);
    startLinking('flow');
  }
});

// Formauswahl im Kontextmenü – nach demselben Muster wie die Farbpunkte.
// Beschriftet wie die Formleiste im Overlay: Fünf namenlose Symbole
// untereinander waren nicht zu deuten, und breiter wird das Menü davon nicht –
// die Chips brechen um und brauchen zusammen weniger Platz als vorher fünf
// volle Zeilen.
const contextFlowRow = document.getElementById('context-flow-row');
if (contextFlowRow) {
  const entries = [
    ...FLOW_TYPES.map((t) => ({ id: t.id, label: t.label, icon: FLOW_ICONS[t.id] })),
    { id: null, label: 'Karte', icon: 'flow-none' },
  ];
  for (const entry of entries) {
    const button = document.createElement('button');
    button.textContent = entry.label;
    button.dataset.icon = entry.icon;
    button.title = entry.id ? `Form: ${entry.label}` : 'Form entfernen – wieder normale Karte';
    button.addEventListener('click', () => {
      const card = contextCard;
      closeContextMenu();
      if (card) applyFlowType(card, entry.id);
    });
    contextFlowRow.appendChild(button);
  }
  // decorateIcons() ist oben schon gelaufen – diese Knöpfe entstehen erst
  // jetzt und brauchen ihren eigenen Durchgang.
  decorateIcons(contextFlowRow);
}

// Farbpunkte im Kontextmenü
const colorRow = document.getElementById('color-row');
CARD_COLORS.forEach((color, i) => {
  const dot = document.createElement('span');
  dot.className = 'color-dot';
  dot.style.background = color.accent;
  dot.title = i === 0 ? 'Standardfarbe' : `Farbe ${i}`;
  dot.addEventListener('click', () => {
    if (!contextCard) return;
    contextCard.setColor(i);
    commit('Kartenfarbe');
  });
  colorRow.appendChild(dot);
});

window.addEventListener(
  'pointerdown',
  (e) => {
    if (!contextMenu.hidden && !contextMenu.contains(e.target)) closeContextMenu();
  },
  true
);

// --- Karten-Editor (Doppelklick, Desktop) ---

const editBox = document.getElementById('edit-box');
const editInput = document.getElementById('edit-input');
let editingCard = null;

function openEditor(card) {
  editingCard = card;
  editInput.value = card.text;
  editBox.hidden = false;
  editInput.focus();
  editInput.select();
}

function closeEditor(save) {
  if (save && editingCard) {
    const text = editInput.value.trim();
    if (text) {
      editingCard.setText(text);
      commit('Kartentext');
      setStatus('Karte aktualisiert.');
    }
  }
  editBox.hidden = true;
  editingCard = null;
}

editInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') closeEditor(true);
  if (e.key === 'Escape') closeEditor(false);
  e.stopPropagation();
});

interactions.onCardContextMenu = (card, x, y) => openContextMenu(card, x, y);
interactions.onCardDoubleClick = (card) => openEditor(card);

// --- Tastatur-Shortcuts (Desktop) ---

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  // In einem Textfeld gehört Strg+Z der Texteingabe, nicht dem Board.
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      handleAction(e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (key === 'y') {
      e.preventDefault();
      handleAction('redo');
      return;
    }
    return;
  }

  // Menü ein-/ausklappen. Bewusst ohne Modifikator und vor der Auswahl-Prüfung,
  // damit es auch bei leerem Board greift.
  if (e.key === 'm' || e.key === 'M') {
    toggleMenu();
    return;
  }

  if (e.key === 'Escape') {
    closeContextMenu();
    closeEditor(false);
    hud.hideError();
    if (linkSource) {
      linkSource = null;
      setStatus('Verbinden abgebrochen.');
    }
    return;
  }
  if (!cardManager.selected) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    cardManager.removeCard(cardManager.selected);
    commit('Karte gelöscht');
    setStatus('Karte gelöscht.');
  } else if (e.key === 'F2') {
    openEditor(cardManager.selected);
  } else if (e.key === '+' || e.key === '=') {
    cardManager.selected.setScale(cardManager.selected.scale * 1.12);
    commitSoon('Kartengröße');
  } else if (e.key === '-') {
    cardManager.selected.setScale(cardManager.selected.scale / 1.12);
    commitSoon('Kartengröße');
  }
});

// --- WebXR: Passthrough (immersive-ar) bevorzugt, sonst VR ---

let xrMode = null;

async function setupXRButton() {
  const button = document.getElementById('xr-button');
  if (!('xr' in navigator)) {
    button.textContent = 'WebXR nicht verfügbar (Desktop-Modus)';
    return;
  }
  const arOk = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  const vrOk = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!arOk && !vrOk) {
    button.textContent = 'Kein XR-Gerät gefunden (Desktop-Modus)';
    return;
  }
  xrMode = arOk ? 'immersive-ar' : 'immersive-vr';
  button.textContent = arOk ? 'Mixed Reality starten (Passthrough)' : 'VR starten';
  button.disabled = false;
  button.addEventListener('click', async () => {
    try {
      const session = await navigator.xr.requestSession(xrMode, {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      await renderer.xr.setSession(session);
    } catch (err) {
      setStatus(`XR-Start fehlgeschlagen: ${err.message}`, 6000);
    }
  });
}
setupXRButton();

let recenterOnNextFrame = false;

renderer.xr.addEventListener('sessionstart', () => {
  // Spracherkennung für die Dauer der Sitzung sperren – siehe speech.js.
  // Läuft ein Erkenner noch aus dem Desktop-Betrieb, wird er hier beendet.
  setXRPresenting(true);
  controls.enabled = false;
  // Sparsame Fassung in der Brille. Gemessen kostet allein die IBL-Abtastung
  // ein Viertel der Frame-Zeit; welche Umgebung das betrifft, entscheidet sie
  // selbst (siehe src/dojo/quality.js).
  applyQualityTier();
  locomotion.reset(); // Fortbewegungs-Rig zentriert starten
  if (xrMode === 'immersive-ar') {
    // Passthrough: Raum zeigen, Umgebung per Menü zuschaltbar
    envIndex = -1;
  } else {
    // Reine VR-Session: direkt immersiv – zuletzt genutzte Umgebung, sonst Insel
    const saved = savedEnvIndex();
    envIndex = saved !== null && saved >= 0 ? saved : 0;
  }
  applyEnvironment();
  wristMenu.setVisible(true);
  // Karten neu vor den Nutzer holen, sobald die echte Headset-Pose steht
  recenterOnNextFrame = true;
});

renderer.xr.addEventListener('sessionend', () => {
  setXRPresenting(false);
  controls.enabled = true;
  applyQualityTier();
  // Rig zurücksetzen und Desktop-Ansicht wieder auf eine saubere Pose stellen
  locomotion.reset();
  camera.position.set(0, 1.6, 1.2);
  controls.target.set(0, 1.4, -0.6);
  controls.update();
  envIndex = savedEnvIndex() ?? -1;
  applyEnvironment();
  wristMenu.setVisible(false);
  keyboard.close();
});

// --- Start: gespeicherte Umgebung + Board wiederherstellen ---

envIndex = savedEnvIndex() ?? -1;
applyEnvironment();

const savedBoard = loadBoardLocal();
if (savedBoard === null) {
  cardManager.spawnIdeas(
    ['VR-Brainstorming-App', 'Zielgruppe: Remote-Teams', 'Feature: KI-Ideenassistent'],
    camera
  );
} else {
  try {
    applyBoardJSON(savedBoard);
  } catch {
    // Defektes gespeichertes Board ignorieren
  }
}

// Ausgangspunkt für Undo/Redo: der wiederhergestellte Stand.
history.reset('Sitzungsstart');
updateHistoryButtons();

// Automatisches Speichern: alle 3 s bei Änderungen sowie beim Verlassen
let lastSavedSnapshot = '';
setInterval(() => {
  const data = boardToJSON();
  const snapshot = JSON.stringify([data.cards, data.connections, data.zones]);
  if (snapshot !== lastSavedSnapshot) {
    lastSavedSnapshot = snapshot;
    saveBoardLocal(data);
  }
}, 3000);
addEventListener('beforeunload', () => saveBoardLocal(boardToJSON()));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveBoardLocal(boardToJSON());
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const _walkHead = new THREE.Vector3();
const _walkZiel = { x: 0, z: 0 };

// Welcher begehbare Bereich zuletzt galt, und wie hoch der Boden gerade liegt.
// `null` heisst "noch nicht gesetzt": Beim Umgebungswechsel wird die neue
// Bodenhoehe uebernommen, statt aus der alten dorthin zu gleiten.
let _walkEnv = -2;
let _floorY = null;
const _blickRi = new THREE.Vector3();
const _kamVorOrbit = new THREE.Vector3();
const _orbitVersatz = new THREE.Vector3();
// Wo die Kamera am Ende des letzten Bildes stand. Alles, was sich bis zum
// naechsten Bild daran aendert, kommt von OrbitControls und ist Umsehen, nicht
// Gehen. `null` heisst: noch kein Bezug, nicht korrigieren.
let _kamZuletzt = null;

// Wie weit die Desktop-Kamera ueber ihrem Boden stehen darf.
//
// Am Desktop gibt es keine Kopfpose; die Blickhoehe kommt aus der Orbit-Maus.
// Das Band ersetzt die weggefallenen Tasten Q/E: Man kann das Board weiterhin
// von schraeg oben ansehen, aber nicht mehr davonfliegen. Die Untergrenze haelt
// den Blick ueber dem Boden, statt in ihn hinein.
const AUGE_MIN = 0.4;
const AUGE_MAX = 2.6;

// Ausstieg für den Mess- und Bildharness. Dessen feste Kamerapositionen liegen
// bewusst außerhalb des begehbaren Bereichs – die Totale steht 24 m über der
// Insel, der Kantenblick knapp jenseits der Abbruchkante. Ohne diesen Schalter
// zöge die Sperre sie jedes Bild auf Augenhöhe zurück und die Vergleichsbilder
// wären wertlos. Im Normalbetrieb wird er nie angefasst.
let walkEnabled = true;

// THREE.Timer statt des abgekündigten THREE.Clock (three ≥ r180 warnt sonst bei
// jedem Start). Mit connect(document) liefert er nach einem Tab-Wechsel kein
// riesiges Delta mehr – Karten und Animationen springen dadurch nicht.
const clock = new THREE.Timer();
clock.connect(document);
let elapsed = 0;

renderer.setAnimationLoop(() => {
  // update() ist die einzige Zeitquelle; elapsed wird selbst akkumuliert.
  clock.update();
  const dt = Math.min(0.1, clock.getDelta());
  elapsed += dt;
  interactions.update();
  // Kopfpose IMMER aus der Nutzer-Kamera lesen, nie aus renderer.xr.getCamera():
  // Die XR-Kamera hängt in keinem Szenengraph, deshalb überschreibt
  // getWorldPosition() ihre von three berechnete matrixWorld mit der reinen
  // XR-Pose und verwirft den Player-Rig-Offset. Die Nutzer-Kamera ist Kind des
  // Rigs und liefert die echte Weltpose (dieselbe Falle wie in locomotion.js).
  wristMenu.update(camera);
  hud.update(dt);
  // Vor connectionManager.update: Die Linien sollen den fahrenden Karten in
  // demselben Frame folgen, nicht einen hinterher.
  tweener.update(dt);
  connectionManager.update(camera);
  if (envIndex >= 0) environments[envIndex].update?.(elapsed);
  timer.update(elapsed);
  if (renderer.xr.isPresenting) {
    locomotion.update(dt);
  } else {
    updateDesktopMovement(dt);
    // **Auf dem Planeten darf Umsehen nicht Gehen sein.**
    //
    // `OrbitControls` schwenkt die Kamera auf einer Kugel um `controls.target`
    // — bei 1,86 m Kreisradius verschiebt ein Mausziehen sie also um bis zu
    // 3,7 m. In den vier ortsfesten Umgebungen ist das genau richtig: Man
    // umkreist den Punkt vor sich. Auf dem Planeten liest die Sperre jede
    // Verschiebung der Kamera als Schritt und dreht die Welt darunter — man
    // läuft beim Umsehen seitwärts, und **das** ist die „komische Steuerung",
    // die gemeldet wurde. Gemessen: 216 Bildpunkte ziehen drehte den Blick um
    // 52,8 Grad und die Welt um 0,65 m Bogen.
    //
    // Rückgängig gemacht wird der Anteil, den der Orbit verschoben hat — an
    // Kamera **und** Ziel, damit die Blickrichtung bleibt. Aus dem Umkreisen
    // wird ein Umsehen an Ort und Stelle; Kreisradius und Ziehgefühl bleiben.
    //
    // **Verglichen wird gegen das Ende des letzten Bildes, nicht gegen den
    // Moment vor `controls.update()`.** Der erste Anlauf tat Letzteres und hat
    // nur die Hälfte erwischt: `OrbitControls` ruft `update()` auch selbst,
    // direkt aus seinem `pointermove`-Handler, also zwischen zwei Bildern.
    const walkJetzt = (envIndex >= 0 ? environments[envIndex].walk : null) ?? FLAT_WALK;
    if (walkJetzt.istPlanet && walkEnabled && _kamZuletzt !== null) {
      _orbitVersatz.subVectors(camera.position, _kamZuletzt);
      _orbitVersatz.y = 0; // die Höhe regelt der Bodenblock
      camera.position.sub(_orbitVersatz);
      controls.target.sub(_orbitVersatz);
    }
    updateDesktopMovement(dt);
    if (walkJetzt.istPlanet && walkEnabled) {
      _kamVorOrbit.copy(camera.position);
      controls.update();
      _orbitVersatz.subVectors(camera.position, _kamVorOrbit);
      _orbitVersatz.y = 0;
      camera.position.sub(_orbitVersatz);
      controls.target.sub(_orbitVersatz);
    } else {
      controls.update();
    }
  }
  // Den Nutzer auf dem Boden und im begehbaren Bereich halten.
  //
  // Jede Umgebung beschreibt ihren begehbaren Bereich selbst (walkable.js);
  // wer nichts angibt, bekommt `FLAT_WALK` — unbegrenzt auf y = 0. Das gilt
  // auch fuer Passthrough und die weisse Desktop-Ansicht und ist dort ein
  // Nichtstun in x/z.
  //
  // Der Block laeuft deshalb JEDES Bild, nicht nur wenn es eine Grenze gibt:
  // Seine zweite Aufgabe ist die Hoehe, und die braucht auch eine Welt ohne
  // Grenze. Vorher lief der Nutzer immer auf y = 0 — auf der Insel also durch
  // den Randwall hindurch und ueber die Abbruchkante hinaus, im Nachthimmel
  // durch die Duenen.
  //
  // Geklemmt wird in XR das **Rig**, nicht die Kamera: Die Kamera ist Kind des
  // Rigs und traegt in XR zusaetzlich die Kopfpose. Die Kamera zu verschieben
  // wuerde gegen das Headset-Tracking arbeiten und Uebelkeit ausloesen.
  const walk = (envIndex >= 0 ? environments[envIndex].walk : null) ?? FLAT_WALK;
  if (!walkEnabled) {
    _walkEnv = -2; // beim Wiedereinschalten neu einmessen
    _kamZuletzt = null;
  } else {
    if (_walkEnv !== envIndex) {
      _walkEnv = envIndex;
      walk.reset?.();
      _floorY = null; // neue Bodenhoehe uebernehmen statt dorthin gleiten
      _kamZuletzt = null; // Bezug fuer die Orbit-Korrektur neu fassen
    }

    const head = camera.getWorldPosition(_walkHead);
    walk.limit(head.x, head.z, _walkZiel);
    const dx = _walkZiel.x - head.x;
    const dz = _walkZiel.z - head.z;

    // Bodenhöhe weich nachführen. Die Dojo-Stufe liegt 42 cm unter dem Raumboden
    // und der Inselwall steigt über mehrere Meter; als Sprung ist beides in der
    // Brille unangenehm, über ein paar Bilder verteilt liest es sich als Stufe
    // bzw. als Anstieg.
    const zielY = walk.floorAt(_walkZiel.x, _walkZiel.z);
    if (_floorY === null) {
      _floorY = zielY;
      // **Die Desktop-Pose muss auf den neuen Boden mitgehoben werden.**
      //
      // Am Desktop kreist die Kamera um `controls.target`. Beide standen bei
      // Umgebungswechseln auf der Hoehe des alten Bodens; die Kamera wurde vom
      // Block weiter unten sofort auf `_floorY + AUGE_MIN` geklemmt, das Ziel
      // aber nur um `dy` nachgezogen — und `dy` ist in genau diesem Bild null,
      // weil `_floorY` gerade erst gesetzt wurde.
      //
      // Auf den vier ortsfesten Umgebungen fiel das nie auf: Ihr Boden liegt
      // um null. Der Nachthimmel ist seit dem Umbau ein Planet, sein Boden
      // liegt bei 25,3 m — die Kamera sprang also auf 26,9 m, waehrend das
      // Ziel bei 1,4 m stehenblieb. Man sah senkrecht nach unten, und jede
      // Mausbewegung schwenkte einen um den **Planetenmittelpunkt** statt um
      // den eigenen Kopf. Genau so hat es der Nutzer gemeldet.
      //
      // Gehoben werden Kamera und Ziel um denselben Betrag: Blickrichtung,
      // Neigung und Kreisradius bleiben damit erhalten, nur die Hoehe stimmt.
      if (!renderer.xr.isPresenting) {
        const hub = zielY + 1.6 - camera.position.y;
        if (Math.abs(hub) > 0.001) {
          camera.position.y += hub;
          controls.target.y += hub;
        }
        // **Und waagerecht auf die Polachse.** Sonst holt die Sperre die Kamera
        // im ersten Bild von 1,2 m auf den Freiraum zurueck und dreht dabei die
        // Welt um 0,95 m — man betritt den Planeten mit einem Ruck, den niemand
        // ausgeloest hat. Ziel und Kamera wandern gemeinsam, die Blickrichtung
        // bleibt.
        if (walk.istPlanet) {
          controls.target.x -= camera.position.x;
          controls.target.z -= camera.position.z;
          camera.position.x = 0;
          camera.position.z = 0;
        }
        // Eine Umgebung darf zusaetzlich sagen, wie steil man beim Betreten
        // schauen soll. Auf einer Kugel mit 25 m Halbmesser liegt der Horizont
        // 20 Grad unter Augenhoehe — wer waagerecht schaut, sieht zu vier
        // Fuenfteln Himmel.
        const neigung = envIndex >= 0 ? environments[envIndex].blickNeigung : undefined;
        if (typeof neigung === 'number') {
          _blickRi.subVectors(controls.target, camera.position);
          const weite = Math.hypot(_blickRi.x, _blickRi.z);
          if (weite > 1e-4) {
            controls.target.y = camera.position.y + Math.tan(neigung) * weite;
          }
        }
        controls.update();
      }
    }
    const dy = (zielY - _floorY) * Math.min(1, dt * 7);
    _floorY += dy;

    if (renderer.xr.isPresenting) {
      player.position.x += dx;
      player.position.z += dz;
      // Der Rig steht auf dem Boden; die Augenhöhe kommt aus der Brille.
      player.position.y = _floorY;
    } else {
      // **Am Desktop wird die Kamera geklemmt, nicht der Rig.**
      //
      // `updateDesktopMovement` schiebt die Kameraposition (lokal – die Kamera
      // hängt im Player-Rig) und das Orbit-Ziel (Welt) um denselben Betrag.
      // Solange `player.position` null ist, ist das dasselbe Bezugssystem.
      // Verschiebt die Sperre den Rig, ist es das nicht mehr, und
      // `controls.update()` rechnet die Kameraposition ab da aus einem Ziel,
      // das um `player.position` daneben liegt. Gemessen (sperre.mjs): Nach dem
      // ersten Eingriff fuhr der Nutzer rückwärts, während er vorwärts drückte,
      // und der Drehpunkt der Maussteuerung lag 2,15 m neben ihm – das
      // gemeldete „irgendwann drehe ich mich im Kreis".
      //
      // Kamera und Ziel wandern deshalb um denselben Vektor; ihr
      // Kugelkoordinaten-Abstand bleibt erhalten und `controls.update()` im
      // nächsten Bild stabil. Dass der Rig am Desktop wirklich identisch ist,
      // stellt `locomotion.reset()` sicher – es läuft bei sessionstart **und**
      // sessionend.
      camera.position.x += dx;
      camera.position.z += dz;
      // Das Band wandert mit dem Boden mit: `+ dy` erhält die relative Blickhöhe
      // beim Anstieg, die Grenzen fangen ab, wer aus ihm herausorbitet.
      const decke = walk.maxY !== undefined ? Math.min(_floorY + AUGE_MAX, walk.maxY) : _floorY + AUGE_MAX;
      camera.position.y = Math.min(Math.max(camera.position.y + dy, _floorY + AUGE_MIN), decke);
      controls.target.x += dx;
      controls.target.z += dz;
      controls.target.y += dy;
    }
    // Bezug fuer die Orbit-Korrektur im naechsten Bild.
    if (!renderer.xr.isPresenting) {
      if (_kamZuletzt === null) _kamZuletzt = new THREE.Vector3();
      _kamZuletzt.copy(camera.position);
    }
  }

  renderer.render(scene, camera);

  // Nach dem ersten gerenderten XR-Frame hat die XR-Kamera eine gültige Pose –
  // erst dann die Karten vor den Nutzer setzen.
  if (recenterOnNextFrame && renderer.xr.isPresenting) {
    const xrCam = renderer.xr.getCamera();
    if (xrCam.cameras?.length) {
      cardManager.repositionAllInArc(xrCam);
      commit('Karten vor den Nutzer geholt');
      recenterOnNextFrame = false;
    }
  }
});

// Für schnelle Iteration & Headless-Tests
// Baustand sichtbar machen (vite.config.js schreibt die Werte beim Bauen fest).
// Damit lässt sich in einem Blick beantworten, ob eine Meldung den aktuellen
// Code betrifft oder eine ältere, noch ausgelieferte Fassung.
const BUILD = { commit: __BUILD_COMMIT__, date: __BUILD_DATE__ };
{
  const stamp = document.getElementById('build-stamp');
  if (stamp) stamp.textContent = `Baustand ${BUILD.commit} · ${BUILD.date}`;
}

window.__app = {
  build: BUILD,
  scene,
  camera,
  renderer,
  cardManager,
  connectionManager,
  keyboard,
  flow: {
    layout: () =>
      ordneFluss(),
    types: FLOW_TYPES,
  },
  tweener,
  wristMenu,
  whiteboard,
  zoneManager,
  timer,
  player,
  locomotion,
  interactions,
  controls,
  handleAction,
  setStatus,
  history,
  hud,
  boardToJSON,
  applyBoardJSON,
  env: {
    environments,
    desktopFloor,
    current: () => envIndex,
    cycle: cycleEnvironment,
    // Der begehbare Bereich der aktiven Umgebung – damit ein Testskript ihn
    // ohne Umweg über die Bildschleife befragen kann.
    walk: () => (envIndex >= 0 ? environments[envIndex].walk : null) ?? FLAT_WALK,
    floorY: () => _floorY,
    setWalkEnabled: (v) => {
      walkEnabled = Boolean(v);
    },
  },
};

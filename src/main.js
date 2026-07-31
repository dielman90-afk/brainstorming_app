import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CardManager, CARD_COLORS } from './cards.js';
import { ConnectionManager } from './connections.js';
import { InteractionManager } from './interactions.js';
import { WristMenu } from './wristMenu.js';
import { VirtualKeyboard } from './keyboard.js';
import { isSpeechAvailable, recognizeSpeech } from './speech.js';
import { requestAI, requestIdeas } from './ai.js';
import {
  downloadBoard,
  importBoardFile,
  saveBoardLocal,
  loadBoardLocal,
  saveSnapshot,
  loadSnapshot,
} from './boardState.js';
import { createEnvironments } from './environments.js';
import { Whiteboard } from './whiteboard.js';
import { ZoneManager } from './zones.js';
import { Timer } from './timer.js';
import { Locomotion } from './locomotion.js';
import { History } from './history.js';
import { Hud } from './hud.js';

// --- Szene & Renderer ---

const DESKTOP_BG = new THREE.Color(0x1a1920);

const scene = new THREE.Scene();
scene.background = DESKTOP_BG;

// far reicht bis hinter die größte Himmelskuppel (44 m × Weltmaßstab 4 = 176 m)
// plus Reserve; bei 60 wurden die skalierte Insel und der Konstrukt-Boden
// abgeschnitten. near bleibt bei 5 cm – dort sitzt praktisch die gesamte
// Tiefengenauigkeit, ein größeres far kostet sie kaum.
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 260);
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
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));

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

function applyEnvironment() {
  const inPassthrough = renderer.xr.isPresenting && xrMode === 'immersive-ar';
  environments.forEach((env, i) => {
    env.group.visible = i === envIndex;
  });
  if (envIndex >= 0) {
    scene.background = environments[envIndex].background;
    scene.fog = environments[envIndex].fog ?? null;
    desktopFloor.visible = false;
  } else if (inPassthrough) {
    scene.background = null;
    scene.fog = null;
    desktopFloor.visible = false;
  } else {
    scene.background = DESKTOP_BG;
    scene.fog = null;
    desktopFloor.visible = true;
  }
}

function savedEnvIndex() {
  try {
    const value = parseInt(localStorage.getItem(ENV_STORAGE_KEY) ?? '', 10);
    return Number.isInteger(value) && value >= -1 && value < environments.length ? value : null;
  } catch {
    return null;
  }
}

function cycleEnvironment() {
  envIndex = envIndex >= environments.length - 1 ? -1 : envIndex + 1;
  try {
    localStorage.setItem(ENV_STORAGE_KEY, String(envIndex));
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

const cardManager = new CardManager(scene);
const connectionManager = new ConnectionManager(scene, cardManager);
cardManager.onCardRemoved = (card) => connectionManager.removeForCard(card);

const whiteboard = new Whiteboard(scene, { onSketch: () => handleAction('sketch') });

const zoneManager = new ZoneManager(scene);
zoneManager.onRename = async (zone) => {
  const text = await getUserText();
  if (text) {
    zone.setTitle(text);
    commit('Zone umbenannt');
    setStatus('Zone umbenannt.');
  }
};

const timer = new Timer(scene);

function boardToJSON() {
  return {
    ...cardManager.toJSON(),
    connections: connectionManager.toJSON(),
    whiteboard: whiteboard.toJSON(),
    zones: zoneManager.toJSON(),
  };
}

function applyBoardJSON(data) {
  cardManager.loadJSON(data);
  connectionManager.loadJSON(data?.connections ?? []);
  whiteboard.loadJSON(data?.whiteboard);
  zoneManager.loadJSON(data?.zones ?? []);
}

const keyboard = new VirtualKeyboard(scene);
const wristMenu = new WristMenu((action) => handleAction(action));

const interactions = new InteractionManager({
  renderer,
  scene,
  camera,
  cardManager,
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
    setStatus('🖐 Hände erkannt: Handfläche öffnen = Menü · ins Leere pinchen und ziehen = bewegen', 8000);
  }
};

// Fortbewegung: VR über den Player-Rig (Gleiten/Snap-Turn/Teleport),
// Desktop über WASD/Pfeile (siehe Animationsschleife).
const locomotion = new Locomotion({ renderer, player, camera, controllers: interactions.controllers });

const UP = new THREE.Vector3(0, 1, 0);
const moveKeys = { forward: false, back: false, left: false, right: false, up: false, down: false };
const MOVE_KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyE: 'up', KeyQ: 'down',
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

// Desktop: Standpunkt (Kamera + Orbit-Ziel) gemeinsam durch die Welt schieben,
// sodass die gewohnte Orbit-Ansicht und Karten-Bedienung erhalten bleiben.
const _moveFwd = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _moveDelta = new THREE.Vector3();
function updateDesktopMovement(dt) {
  const f = (moveKeys.forward ? 1 : 0) - (moveKeys.back ? 1 : 0);
  const s = (moveKeys.right ? 1 : 0) - (moveKeys.left ? 1 : 0);
  const u = (moveKeys.up ? 1 : 0) - (moveKeys.down ? 1 : 0);
  if (!f && !s && !u) return;
  camera.getWorldDirection(_moveFwd);
  _moveFwd.y = 0;
  if (_moveFwd.lengthSq() < 1e-6) _moveFwd.set(0, 0, -1);
  _moveFwd.normalize();
  _moveRight.crossVectors(_moveFwd, UP).normalize();
  _moveDelta.set(0, 0, 0).addScaledVector(_moveFwd, f).addScaledVector(_moveRight, s);
  if (_moveDelta.lengthSq() > 0) _moveDelta.normalize();
  const speed = 3.4;
  _moveDelta.multiplyScalar(speed * dt);
  _moveDelta.y += u * speed * dt;
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

function startLinking() {
  const selected = cardManager.selected;
  if (!selected) {
    setStatus('Bitte zuerst eine Karte auswählen.');
    return;
  }
  linkSource = selected;
  setStatus('🔗 Verbinden: Ziel-Karte anklicken (gleiche Karte oder Esc = abbrechen)', 0);
}

// Meldet Wiederholversuche an die Ladeanzeige, damit eine hakelige Verbindung
// sichtbar wird statt sich als scheinbarer Stillstand zu zeigen.
function aiProgress(label) {
  return {
    onProgress: ({ attempt, maxAttempts, waitMs, message }) => {
      setBusyLabel(`${label} – Versuch ${attempt + 1}/${maxAttempts} in ${Math.ceil(waitMs / 1000)} s`);
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
    if (action === 'save') {
      const entry = saveSnapshot(boardToJSON());
      setStatus(`💾 Sicherungspunkt angelegt (${entry.cards} Karten).`);
      return;
    }
    if (action === 'load') {
      const entry = loadSnapshot(0);
      if (!entry) {
        setStatus('Noch kein Sicherungspunkt vorhanden – erst „💾 Sichern".');
        return;
      }
      applyBoardJSON(entry.data);
      commit('Sicherungspunkt geladen');
      const time = new Date(entry.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      setStatus(`📂 Sicherungspunkt von ${time} geladen (${cardManager.cards.length} Karten).`);
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
      setStatus(show ? '📋 Whiteboard eingeblendet – einfach drauf loszeichnen.' : 'Whiteboard ausgeblendet.');
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
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      const zone = zoneManager.addZone({ title: 'Neue Zone', colorIndex: zoneManager.zones.length });
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
      const cards = cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      setStatus(`${clusterDefs.length} Cluster angewendet – Karten wurden gruppiert und eingefärbt.`);
    } else if (action === 'summary') {
      setStatus('Claude fasst das Board zusammen…', 0);
      setBusyLabel('Claude fasst zusammen…');
      const result = await requestIdeas('summary', { ideas }, aiProgress('Claude fasst zusammen…'));
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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

// Texteingabe: XR = Sprache mit Tastatur-Fallback, Desktop = Eingabefeld.
async function getUserText() {
  if (renderer.xr.isPresenting) {
    if (isSpeechAvailable()) {
      setStatus('🎤 Sprich jetzt…', 0);
      try {
        const text = await recognizeSpeech();
        setStatus('');
        return text;
      } catch {
        setStatus('Spracheingabe fehlgeschlagen – Tastatur wird geöffnet.');
      }
    }
    return new Promise((resolve) => {
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
  'btn-clear': 'clear',
  'btn-env': 'environment',
  'btn-undo': 'undo',
  'btn-redo': 'redo',
  'btn-save': 'save',
  'btn-load': 'load',
};
for (const [id, action] of Object.entries(DESKTOP_BUTTONS)) {
  document.getElementById(id)?.addEventListener('click', () => handleAction(action));
}
document.getElementById('idea-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAction('new');
});
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
  const result = connectionManager.toggle(linkSource, card);
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
  }
});

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
  button.textContent = arOk ? '🥽 Mixed Reality starten (Passthrough)' : '🥽 VR starten';
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
  controls.enabled = false;
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
  controls.enabled = true;
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

const clock = new THREE.Clock();
let elapsed = 0;

renderer.setAnimationLoop(() => {
  // getDelta() ist die einzige Zeitquelle; elapsed wird selbst akkumuliert
  // (getElapsedTime würde den Delta verbrauchen und dt auf 0 setzen).
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
  connectionManager.update();
  if (envIndex >= 0) environments[envIndex].update?.(elapsed);
  timer.update(elapsed);
  if (renderer.xr.isPresenting) {
    locomotion.update(dt);
  } else {
    updateDesktopMovement(dt);
    controls.update();
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
window.__app = {
  scene,
  camera,
  renderer,
  cardManager,
  connectionManager,
  keyboard,
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
  env: { environments, desktopFloor, current: () => envIndex, cycle: cycleEnvironment },
};

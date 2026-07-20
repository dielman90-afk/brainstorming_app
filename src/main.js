import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CardManager, CARD_COLORS } from './cards.js';
import { ConnectionManager } from './connections.js';
import { InteractionManager } from './interactions.js';
import { WristMenu } from './wristMenu.js';
import { VirtualKeyboard } from './keyboard.js';
import { isSpeechAvailable, recognizeSpeech } from './speech.js';
import { requestAI, requestIdeas } from './ai.js';
import { downloadBoard, importBoardFile, saveBoardLocal, loadBoardLocal } from './boardState.js';
import { createEnvironments } from './environments.js';
import { Whiteboard } from './whiteboard.js';
import { ZoneManager } from './zones.js';
import { Timer } from './timer.js';
import { Locomotion } from './locomotion.js';
import { createTextPanel } from './textPanel.js';

// --- Szene & Renderer ---

const DESKTOP_BG = new THREE.Color(0x1a1920);

const scene = new THREE.Scene();
scene.background = DESKTOP_BG;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
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

// Umgebungen: Passthrough/Weiß (-1) sowie drei virtuelle Welten aus
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
  ],
});
interactions.onControllerConnected = (handedness, grip) => {
  wristMenu.registerGrip(handedness, grip);
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

const hud = createTextPanel({
  width: 0.5,
  height: 0.07,
  text: '',
  background: 'rgba(26,24,31,0.85)',
  fontSize: 30,
});
hud.mesh.position.set(0, -0.28, -0.9);
hud.mesh.visible = false;
camera.add(hud.mesh);

let hudTimer = 0;
const statusBand = document.getElementById('status-band');
const statusText = document.getElementById('status');
function setStatus(message, ms = 3500) {
  if (statusText) statusText.textContent = message;
  statusBand?.classList.toggle('show', Boolean(message));
  hud.setText(message);
  hud.mesh.visible = Boolean(message);
  clearTimeout(hudTimer);
  if (message && ms) {
    hudTimer = setTimeout(() => {
      hud.mesh.visible = false;
      if (statusText) statusText.textContent = '';
      statusBand?.classList.remove('show');
    }, ms);
  }
}

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

async function handleAction(action) {
  if (busy) return;
  try {
    if (action === 'new') {
      await newCardFlow();
      return;
    }
    if (action === 'environment') {
      cycleEnvironment();
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
      const image = whiteboard.toDataURL().split(',')[1];
      const result = await requestIdeas('whiteboard', {
        image,
        ideas: cardManager.cards.map((c) => c.text),
      });
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      return;
    }
    if (action === 'zone') {
      const zone = zoneManager.addZone({ title: 'Neue Zone', colorIndex: zoneManager.zones.length });
      zone.placeInFront(camera);
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
      const result = await requestIdeas('critic', {
        selectedIdea: selected.text,
        ideas: cardManager.cards.map((c) => c.text),
      });
      const cards = cardManager.spawnIdeas(result.map((i) => i.text), camera);
      for (const card of cards) card.setColor(4); // Rot = kritische Einwände
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
      const result = await requestIdeas('topic', {
        topic,
        ideas: cardManager.cards.map((c) => c.text),
      });
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
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
      setStatus('Alle Karten gelöscht.');
      return;
    }
    if (action === 'delete') {
      const selected = cardManager.selected;
      if (!selected) {
        setStatus('Bitte zuerst eine Karte auswählen.');
        return;
      }
      cardManager.removeCard(selected);
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
      const result = await requestIdeas('related', { selectedIdea: selected.text, ideas });
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
      setStatus(`${result.length} neue Ideen zu „${selected.text}“`);
    } else if (action === 'cluster') {
      if (ideas.length < 2) {
        setStatus('Für Cluster werden mindestens 2 Karten benötigt.');
        return;
      }
      setStatus('Claude gruppiert die Karten…', 0);
      // Snapshot, damit die Indizes der Antwort zu den gesendeten Ideen passen
      const snapshot = [...cardManager.cards];
      const data = await requestAI('cluster', { ideas: snapshot.map((c) => c.text) });
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
      setStatus(`${clusterDefs.length} Cluster angewendet – Karten wurden gruppiert und eingefärbt.`);
    } else if (action === 'summary') {
      setStatus('Claude fasst das Board zusammen…', 0);
      const result = await requestIdeas('summary', { ideas });
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
      setStatus('Zusammenfassung erstellt.');
    }
  } catch (err) {
    console.error(err);
    setStatus(`Fehler: ${err.message}`, 6000);
  } finally {
    busy = false;
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
  setStatus('Karte erstellt.');
}

// --- Desktop-UI ---

document.getElementById('btn-new').addEventListener('click', () => handleAction('new'));
document.getElementById('btn-related').addEventListener('click', () => handleAction('related'));
document.getElementById('btn-critic').addEventListener('click', () => handleAction('critic'));
document.getElementById('btn-cluster').addEventListener('click', () => handleAction('cluster'));
document.getElementById('btn-summary').addEventListener('click', () => handleAction('summary'));
document.getElementById('btn-zone').addEventListener('click', () => handleAction('zone'));
document.getElementById('btn-timer').addEventListener('click', () => handleAction('timer'));
document.getElementById('btn-topic').addEventListener('click', () => handleAction('topic'));
document.getElementById('btn-whiteboard').addEventListener('click', () => handleAction('whiteboard'));
document.getElementById('btn-export').addEventListener('click', () => downloadBoard(boardToJSON()));
document.getElementById('btn-clear').addEventListener('click', () => handleAction('clear'));
document.getElementById('btn-env').addEventListener('click', () => handleAction('environment'));
document.getElementById('idea-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAction('new');
});
document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    applyBoardJSON(await importBoardFile(file));
    setStatus(`Board importiert (${cardManager.cards.length} Karten).`);
  } catch (err) {
    setStatus(`Import fehlgeschlagen: ${err.message}`, 6000);
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
    contextCard?.setColor(i);
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
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') {
    closeContextMenu();
    closeEditor(false);
    if (linkSource) {
      linkSource = null;
      setStatus('Verbinden abgebrochen.');
    }
    return;
  }
  if (!cardManager.selected) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    cardManager.removeCard(cardManager.selected);
    setStatus('Karte gelöscht.');
  } else if (e.key === 'F2') {
    openEditor(cardManager.selected);
  } else if (e.key === '+' || e.key === '=') {
    cardManager.selected.setScale(cardManager.selected.scale * 1.12);
  } else if (e.key === '-') {
    cardManager.selected.setScale(cardManager.selected.scale / 1.12);
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
  controls,
  handleAction,
  setStatus,
  env: { environments, desktopFloor, current: () => envIndex, cycle: cycleEnvironment },
};

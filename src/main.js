import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CardManager } from './cards.js';
import { InteractionManager } from './interactions.js';
import { WristMenu } from './wristMenu.js';
import { VirtualKeyboard } from './keyboard.js';
import { isSpeechAvailable, recognizeSpeech } from './speech.js';
import { requestIdeas } from './ai.js';
import { downloadBoard, importBoardFile } from './boardState.js';
import { createTextPanel } from './textPanel.js';

// --- Szene & Renderer ---

const DESKTOP_BG = new THREE.Color(0xf5f7fa);

const scene = new THREE.Scene();
scene.background = DESKTOP_BG;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
camera.position.set(0, 1.6, 1.2);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));

// Einfache VR-Umgebung – wird im Passthrough-Modus ausgeblendet
const environment = new THREE.Group();
environment.add(new THREE.GridHelper(8, 24, 0xb8c7d6, 0xdde6ee));
scene.add(environment);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.4, -0.6);
controls.update();

// --- Bausteine ---

const cardManager = new CardManager(scene);
const keyboard = new VirtualKeyboard(scene);
const wristMenu = new WristMenu((action) => handleAction(action));

const interactions = new InteractionManager({
  renderer,
  scene,
  camera,
  cardManager,
  getUiTargets: () => [
    ...(renderer.xr.isPresenting && wristMenu.group.visible ? wristMenu.buttons : []),
    ...keyboard.uiTargets,
  ],
});
interactions.onControllerConnected = (handedness, grip) => {
  if (handedness === 'left' || (handedness === 'right' && !wristMenu.attachedHand)) {
    wristMenu.attachToGrip(grip, handedness);
  }
};

// --- Status: DOM-Zeile am Desktop + schwebendes HUD in XR ---

const hud = createTextPanel({
  width: 0.5,
  height: 0.07,
  text: '',
  background: 'rgba(10,16,24,0.85)',
  fontSize: 30,
});
hud.mesh.position.set(0, -0.28, -0.9);
hud.mesh.visible = false;
camera.add(hud.mesh);

let hudTimer = 0;
function setStatus(message, ms = 3500) {
  const el = document.getElementById('status');
  if (el) el.textContent = message;
  hud.setText(message);
  hud.mesh.visible = Boolean(message);
  clearTimeout(hudTimer);
  if (message && ms) {
    hudTimer = setTimeout(() => {
      hud.mesh.visible = false;
      if (el) el.textContent = '';
    }, ms);
  }
}

// --- Aktionen (Wrist-Menü in XR, DOM-Buttons am Desktop) ---

let busy = false;

async function handleAction(action) {
  if (busy) return;
  try {
    if (action === 'new') {
      await newCardFlow();
      return;
    }
    const ideas = cardManager.cards.map((c) => c.text);
    if (!ideas.length) {
      setStatus('Das Board ist leer – erst Karten anlegen.');
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
      setStatus('Claude schlägt Cluster vor…', 0);
      const result = await requestIdeas('cluster', { ideas });
      cardManager.spawnIdeas(result.map((i) => i.text), camera);
      setStatus('Cluster-Vorschläge erstellt.');
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

async function newCardFlow() {
  if (renderer.xr.isPresenting) {
    if (isSpeechAvailable()) {
      setStatus('🎤 Sprich deine Idee…', 0);
      try {
        const text = await recognizeSpeech();
        cardManager.spawnIdeas([text], camera);
        setStatus('Karte erstellt.');
        return;
      } catch {
        setStatus('Spracheingabe fehlgeschlagen – Tastatur wird geöffnet.');
      }
    }
    keyboard.open(camera, {
      onSubmit: (text) => {
        cardManager.spawnIdeas([text], camera);
        setStatus('Karte erstellt.');
      },
      onCancel: () => setStatus(''),
    });
  } else {
    const input = document.getElementById('idea-input');
    const text = input.value.trim();
    if (!text) {
      setStatus('Bitte zuerst Text eingeben.');
      input.focus();
      return;
    }
    cardManager.spawnIdeas([text], camera);
    input.value = '';
    setStatus('Karte erstellt.');
  }
}

// --- Desktop-UI ---

document.getElementById('btn-new').addEventListener('click', () => handleAction('new'));
document.getElementById('btn-related').addEventListener('click', () => handleAction('related'));
document.getElementById('btn-cluster').addEventListener('click', () => handleAction('cluster'));
document.getElementById('btn-summary').addEventListener('click', () => handleAction('summary'));
document.getElementById('btn-export').addEventListener('click', () => downloadBoard(cardManager));
document.getElementById('idea-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAction('new');
});
document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const count = await importBoardFile(file, cardManager);
    setStatus(`Board importiert (${count} Karten).`);
  } catch (err) {
    setStatus(`Import fehlgeschlagen: ${err.message}`, 6000);
  }
  e.target.value = '';
});

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
  }
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
    return;
  }
  if (!cardManager.selected) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    cardManager.removeCard(cardManager.selected);
    setStatus('Karte gelöscht.');
  } else if (e.key === 'F2') {
    openEditor(cardManager.selected);
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

renderer.xr.addEventListener('sessionstart', () => {
  controls.enabled = false;
  const passthrough = xrMode === 'immersive-ar';
  scene.background = passthrough ? null : DESKTOP_BG;
  environment.visible = !passthrough;
  wristMenu.setVisible(true);
});

renderer.xr.addEventListener('sessionend', () => {
  controls.enabled = true;
  scene.background = DESKTOP_BG;
  environment.visible = true;
  wristMenu.setVisible(false);
  keyboard.close();
});

// --- Start ---

cardManager.spawnIdeas(
  ['VR-Brainstorming-App', 'Zielgruppe: Remote-Teams', 'Feature: KI-Ideenassistent'],
  camera
);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  interactions.update();
  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

// Für schnelle Iteration & Headless-Tests
window.__app = { scene, camera, renderer, cardManager, keyboard, wristMenu, handleAction, setStatus };

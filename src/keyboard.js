import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { flatLayer } from './wristMenu.js';

const KEY = 0.052;
const GAP = 0.007;

// Feste Zeichenreihenfolge gegen Transparenz-Flackern (wie Menü/Whiteboard):
// Hintergrund unten, Tasten oben. Über den Menü-Ordnungen (20–22), damit die
// modale Tastatur zuoberst liegt.
const KB_LAYER = { bg: 30, preview: 31, key: 32 };

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', 'ä', 'ü', 'ß'],
];

const KEY_BG = '#26364a';
const KEY_BG_HOVER = '#3d5674';

// Fallback-Texteingabe in XR, wenn die Web Speech API nicht verfügbar ist.
export class VirtualKeyboard {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'virtualKeyboard';
    this.group.visible = false;
    this.keys = [];
    this.text = '';
    this.callbacks = null;

    const cols = ROWS[0].length;
    const boardW = cols * KEY + (cols - 1) * GAP + 0.06;
    const boardH = (ROWS.length + 1) * (KEY + GAP) + 0.16;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(boardW, boardH),
      new THREE.MeshBasicMaterial({ color: 0x0b121a, transparent: true, opacity: 0.97 })
    );
    bg.position.z = -0.004;
    flatLayer(bg, KB_LAYER.bg);
    this.group.add(bg);

    this.preview = createTextPanel({
      width: boardW - 0.04,
      height: 0.07,
      text: '▏',
      background: '#16222f',
      fontSize: 34,
      doubleSided: false,
    });
    this.preview.mesh.position.set(0, boardH / 2 - 0.06, 0.002);
    flatLayer(this.preview.mesh, KB_LAYER.preview);
    this.group.add(this.preview.mesh);

    const top = boardH / 2 - 0.13 - KEY / 2;
    ROWS.forEach((row, r) => {
      const rowW = row.length * KEY + (row.length - 1) * GAP;
      row.forEach((label, i) => {
        this._addKey(label, -rowW / 2 + KEY / 2 + i * (KEY + GAP), top - r * (KEY + GAP), KEY, () =>
          this._type(label)
        );
      });
    });

    const yBottom = top - ROWS.length * (KEY + GAP);
    this._addKey('Abbr.', -boardW / 2 + 0.085, yBottom, 0.11, () => this._cancel(), '#5c2b2b');
    this._addKey('Leerzeichen', -0.02, yBottom, 0.24, () => this._type(' '));
    this._addKey('⌫', 0.15, yBottom, 0.07, () => this._backspace());
    this._addKey('OK', boardW / 2 - 0.08, yBottom, 0.1, () => this._submit(), '#2b5c3a');

    scene.add(this.group);
  }

  _addKey(label, x, y, width, onClick, bgColor = KEY_BG) {
    const panel = createTextPanel({
      width,
      height: KEY,
      text: label,
      background: bgColor,
      fontSize: 30,
      doubleSided: false,
    });
    panel.mesh.position.set(x, y, 0.002);
    panel.mesh.userData.onClick = onClick;
    panel.mesh.userData.setHover = (hovered) =>
      panel.setColors({ background: hovered ? KEY_BG_HOVER : bgColor });
    flatLayer(panel.mesh, KB_LAYER.key);
    this.group.add(panel.mesh);
    this.keys.push(panel.mesh);
  }

  get uiTargets() {
    return this.group.visible ? this.keys : [];
  }

  open(camera, callbacks) {
    this.callbacks = callbacks;
    this.text = '';
    this._updatePreview();

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();

    const pos = camPos.clone().addScaledVector(dir, 0.7);
    pos.y = camPos.y - 0.25;
    this.group.position.copy(pos);
    this.group.lookAt(camPos.x, pos.y + 0.2, camPos.z);
    this.group.visible = true;
  }

  // close() informiert einen wartenden Aufrufer über onCancel (z. B. wenn die
  // XR-Session endet, während die Tastatur offen ist) – sonst hinge dessen
  // Eingabe-Promise für immer.
  close() {
    const callbacks = this.callbacks;
    this.callbacks = null;
    this.group.visible = false;
    callbacks?.onCancel?.();
  }

  _updatePreview() {
    this.preview.setText(`${this.text}▏`);
  }

  _type(ch) {
    this.text += ch;
    this._updatePreview();
  }

  _backspace() {
    this.text = this.text.slice(0, -1);
    this._updatePreview();
  }

  _submit() {
    const trimmed = this.text.trim();
    const finalText = trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : '';
    const cb = this.callbacks;
    this.callbacks = null; // vor close(), damit close() nicht zusätzlich onCancel feuert
    this.close();
    if (finalText) cb?.onSubmit?.(finalText);
    else cb?.onCancel?.();
  }

  _cancel() {
    this.close(); // feuert onCancel
  }
}

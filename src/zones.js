import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { wechsleHeimat, inHeimat, poseInHeimat } from './heimat.js';

// Räumliche Zonen / Rahmen: beschriftete, halbtransparente Flächen, vor denen
// man Karten thematisch gruppiert (z. B. „To Do / Doing / Done"). Greifbar zum
// Verschieben, skalierbar, umbenennbar, farbig und löschbar. Persistiert im
// Board-JSON.

const WIDTH = 1.5;
const HEIGHT = 1.05;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

// Feste Zeichenreihenfolge gegen Transparenz-Flackern (wie beim Whiteboard):
// Hintergrundfläche zuerst, Kopf/Buttons darüber; depthWrite aus, depthTest an.
const LAYER = { panel: 1, header: 2, button: 3 };

export const ZONE_COLORS = [
  { key: 'amber', border: 'rgba(255,180,84,0.9)', fill: 'rgba(255,180,84,0.10)', header: '#3a2f1c', text: '#ffd8a0' },
  { key: 'blue', border: 'rgba(125,211,252,0.9)', fill: 'rgba(125,211,252,0.10)', header: '#1c2b3a', text: '#bfe6ff' },
  { key: 'green', border: 'rgba(134,239,172,0.9)', fill: 'rgba(134,239,172,0.10)', header: '#1c3a29', text: '#c4f5d5' },
  { key: 'violet', border: 'rgba(196,181,253,0.9)', fill: 'rgba(196,181,253,0.12)', header: '#2b1c3a', text: '#ddd0ff' },
  { key: 'pink', border: 'rgba(240,171,252,0.9)', fill: 'rgba(240,171,252,0.12)', header: '#3a1c33', text: '#ffd6fb' },
];

function layer(mesh, order) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    if (!m) continue;
    m.transparent = true;
    m.depthWrite = false;
  }
  mesh.renderOrder = order;
  return mesh;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

class Zone {
  constructor(manager, { title = 'Zone', colorIndex = 0 } = {}) {
    this.manager = manager;
    this.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    this.title = title;
    this.colorIndex = colorIndex % ZONE_COLORS.length;
    this.scale = 1;
    this.group = new THREE.Group();
    // Inhalt, nicht Umgebung — siehe `nichtUmgebung` in tools/measure.mjs.
    this.group.userData.nichtUmgebung = true;
    this.group.name = 'zone';
    this.buttons = [];

    // Hintergrundfläche (neu einfärbbar)
    const px = 640;
    this._canvas = document.createElement('canvas');
    this._canvas.width = Math.round(WIDTH * px);
    this._canvas.height = Math.round(HEIGHT * px);
    this._ctx = this._canvas.getContext('2d');
    this._tex = new THREE.CanvasTexture(this._canvas);
    this._tex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, HEIGHT),
      new THREE.MeshBasicMaterial({ map: this._tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })
    );
    layer(this.panel, LAYER.panel);
    this.group.add(this.panel);

    // Kopfzeile = Greif-/Verschiebeleiste mit Titel
    this.header = createTextPanel({
      width: WIDTH * 0.62,
      height: 0.12,
      text: title,
      background: ZONE_COLORS[this.colorIndex].header,
      color: ZONE_COLORS[this.colorIndex].text,
      fontSize: 34,
      weight: 600,
      singleLine: true,
      radius: 22,
      doubleSided: false,
    });
    this.header.mesh.position.set(-WIDTH * 0.16, HEIGHT / 2 + 0.085, 0.006);
    this.header.mesh.userData.grabTarget = {
      group: this.group,
      // Wohin die Zone beim Loslassen zurückgehängt wird. Ohne diese Zeile
      // landete sie in der Szene — im Nachthimmel also beim Nutzer statt auf
      // dem Planeten, und der Rahmen liefe von seinen Karten weg.
      heimat: () => this.manager.heimat,
      getScale: () => this.scale,
      setScale: (v) => this.setScale(v),
    };
    this.header.mesh.userData.setHover = (h) =>
      this.header.setColors({ background: h ? this._lightHeader() : ZONE_COLORS[this.colorIndex].header });
    layer(this.header.mesh, LAYER.header);
    this.group.add(this.header.mesh);

    // Aktions-Buttons oben rechts: umbenennen, Farbe, löschen
    const mkBtn = (label, onClick) => {
      const b = createTextPanel({
        width: 0.1,
        height: 0.1,
        text: label,
        background: 'rgba(28,25,33,0.92)',
        color: '#eef1f5',
        fontSize: 40,
        singleLine: true,
        radius: 18,
        doubleSided: false,
      });
      b.mesh.userData.onClick = onClick;
      b.mesh.userData.setHover = (h) => b.setColors({ background: h ? 'rgba(60,54,70,0.95)' : 'rgba(28,25,33,0.92)' });
      layer(b.mesh, LAYER.button);
      this.group.add(b.mesh);
      this.buttons.push(b.mesh);
      return b.mesh;
    };
    const bx = WIDTH / 2 - 0.06;
    const by = HEIGHT / 2 + 0.085;
    mkBtn('✎', () => this.manager.onRename?.(this)).position.set(bx - 0.24, by, 0.006);
    mkBtn('🎨', () => {
      this.setColor(this.colorIndex + 1);
      this.manager.onChange?.('Zonenfarbe');
    }).position.set(bx - 0.12, by, 0.006);
    mkBtn('✕', () => this.manager.removeZone(this)).position.set(bx, by, 0.006);

    this._redraw();
  }

  _lightHeader() {
    const c = new THREE.Color(ZONE_COLORS[this.colorIndex].header).multiplyScalar(1.5);
    return `#${c.getHexString()}`;
  }

  _redraw() {
    const ctx = this._ctx;
    const W = this._canvas.width;
    const H = this._canvas.height;
    const c = ZONE_COLORS[this.colorIndex];
    ctx.clearRect(0, 0, W, H);
    roundRectPath(ctx, 6, 6, W - 12, H - 12, 40);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = c.border;
    ctx.setLineDash([26, 16]);
    ctx.stroke();
    ctx.setLineDash([]);
    this._tex.needsUpdate = true;
  }

  setTitle(title) {
    this.title = title;
    this.header.setText(title);
  }

  setColor(index) {
    this.colorIndex = ((index % ZONE_COLORS.length) + ZONE_COLORS.length) % ZONE_COLORS.length;
    const c = ZONE_COLORS[this.colorIndex];
    this.header.setColors({ background: c.header, color: c.text });
    this._redraw();
  }

  setScale(value) {
    this.scale = THREE.MathUtils.clamp(value, MIN_SCALE, MAX_SCALE);
    this.group.scale.setScalar(this.scale);
  }

  placeInFront(camera) {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const pos = camPos.clone().addScaledVector(dir, 2.4);
    // **Die Klemmung misst ab dem Boden, nicht ab y = 0.**
    //
    // Hier stand `clamp(camPos.y + versatz, unten, oben)` mit absoluten
    // Welthöhen. Das setzt stillschweigend voraus, dass der Boden bei null
    // liegt — auf den vier flachen Umgebungen stimmt das, auf einer Kugel von
    // 25 m Halbmesser nicht: Der Nutzer steht dort bei y ≈ 26,9, die obere
    // Grenze schlägt an, und die Tafel landet **23,4 m unter seinen Füßen**,
    // also im Gestein. Gemessen mit `tools/panelhoehe.mjs`.
    //
    // Mit dem Boden als Bezug bleibt das Verhalten auf ebenem Grund Zahl für
    // Zahl dasselbe (dort ist `boden` null), und auf der Kugel steht die Tafel
    // dort, wo sie hingehört.
    const boden = this.manager.floorY();
    pos.y = boden + THREE.MathUtils.clamp(camPos.y - boden, 1.0, 2.2);
    // Gerechnet wird in Weltkoordinaten — die Zone stellt sich vor den Nutzer,
    // nicht vor den Planeten. Erst danach in die Heimat umgerechnet.
    const m = this.manager;
    // **Die Höhe vorher sichern.** `inHeimat` rechnet den Vektor an Ort und
    // Stelle um; nach dem Aufruf steht in `pos.y` die **lokale** Höhe in der
    // Heimat. Unten braucht `lookAt` aber ein **Weltziel** — sonst kippt die
    // Zone auf dem Planeten um genau den Betrag, um den die Weltgruppe gedreht
    // ist, und steht schräg im Gelände.
    const weltY = pos.y;
    this.group.position.copy(inHeimat(m.heimat, m.scene, pos));
    // `lookAt` bekommt ein Weltziel und rechnet die Elternmatrix selbst heraus.
    this.group.lookAt(camPos.x, weltY, camPos.z);
  }

  get uiTargets() {
    return [this.header.mesh, ...this.buttons];
  }

  dispose() {
    this.group.removeFromParent();
    this._tex.dispose();
    this.panel.geometry.dispose();
    this.panel.material.dispose();
  }

  toJSON() {
    const m = this.manager;
    return {
      id: this.id,
      title: this.title,
      colorIndex: this.colorIndex,
      scale: this.scale,
      // `frame` ist reine Auskunft für den Leser der Datei; gelesen wird immer
      // relativ zu der Heimat, die beim Laden gerade gilt. Die Begründung steht
      // bei `poseInHeimat` in heimat.js.
      ...(m.heimat !== m.scene ? { frame: 'planet' } : {}),
      ...poseInHeimat(m.heimat, m.scene, this.group),
    };
  }
}

export class ZoneManager {
  constructor(scene, { floorY = () => 0 } = {}) {
    this.scene = scene;
    // Die Bodenhöhe unter dem Nutzer; `Zone.placeInFront` fragt sie über den
    // Verwalter ab. Vorgabe null, damit ohne Angabe alles bleibt, wie es war.
    this.floorY = floorY;
    // **Zonen gehören zur Welt, nicht zum Nutzer.** Eine Zone ist der Rahmen,
    // vor dem Karten stehen; wenn die Karten mit dem Planeten wandern und der
    // Rahmen vor dem Nutzer stehen bleibt, ist die Gruppierung nach zwanzig
    // Schritten aufgelöst. Sie bekommen deshalb dieselbe Heimat wie die Karten.
    this.heimat = scene;
    this.zones = [];
    this.onRename = null; // (zone) => void  – von main.js gesetzt
    // (label) => void – meldet Änderungen an den Undo-Verlauf
    this.onChange = null;
  }

  addZone({ title, colorIndex, position, quaternion, scale } = {}) {
    const zone = new Zone(this, { title, colorIndex });
    if (Array.isArray(position)) zone.group.position.fromArray(position);
    if (Array.isArray(quaternion)) zone.group.quaternion.fromArray(quaternion);
    if (typeof scale === 'number') zone.setScale(scale);
    this.heimat.add(zone.group);
    this.zones.push(zone);
    return zone;
  }

  setHeimat(ziel) {
    const neu = ziel ?? this.scene;
    const alt = this.heimat;
    this.heimat = neu;
    wechsleHeimat(alt, neu, this.zones.map((z) => z.group));
  }

  removeZone(zone) {
    zone.dispose();
    this.zones = this.zones.filter((z) => z !== zone);
    this.onChange?.('Zone entfernt');
  }

  clear() {
    for (const zone of [...this.zones]) this.removeZone(zone);
  }

  get uiTargets() {
    return this.zones.flatMap((z) => z.uiTargets);
  }

  toJSON() {
    return this.zones.map((z) => z.toJSON());
  }

  loadJSON(list) {
    this.clear();
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (!entry || typeof entry.title !== 'string') continue;
      const zone = this.addZone(entry);
      if (typeof entry.id === 'string' && entry.id) zone.id = entry.id;
    }
  }
}

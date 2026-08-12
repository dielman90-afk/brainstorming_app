import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

// Das Menü ist auf zwei Reiter aufgeteilt: 21 Aktionen untereinander wären ein
// über 80 cm hohes Panel an der Hand. Zwei Seiten à sechs Reihen bleiben
// kompakt und sind auch verkleinert auf der Handfläche noch lesbar.
// Exportiert, damit Tests die Seiten prüfen können, ohne die Knopf-Meshes
// auseinanderzunehmen.
export const PAGES = [
  {
    id: 'ideas',
    label: '💡 Ideen',
    actions: [
      { id: 'new', label: '＋ Neue Karte' },
      { id: 'topic', label: '🚀 Themen-Start' },
      { id: 'related', label: '✨ Verwandte Ideen' },
      { id: 'critic', label: '😈 Kritiker' },
      { id: 'cluster', label: '📂 Cluster' },
      { id: 'summary', label: '📝 Zusammenfassen' },
      { id: 'color', label: '🎨 Farbe' },
      { id: 'connect', label: '🔗 Verbinden' },
      { id: 'fontsize', label: '🔠 Schrift' },
      { id: 'delete', label: '🗑️ Karte löschen', danger: true },
    ],
  },
  {
    id: 'board',
    label: '🗂 Board',
    actions: [
      { id: 'undo', label: '↶ Rückgängig' },
      { id: 'redo', label: '↷ Wiederholen' },
      { id: 'mindmap', label: '🕸 Mindmap ordnen' },
      { id: 'zone', label: '🗂️ Zone' },
      { id: 'timer', label: '⏱️ Timer' },
      { id: 'whiteboard', label: '📋 Whiteboard' },
      { id: 'environment', label: '🌐 Umgebung' },
      // Der Regler für die Bildqualität gehört in die Brille und nicht nur ins
      // Desktop-Overlay: Ob die Quest die volle Fassung trägt, entscheidet sich
      // dort und nirgends sonst. Headless lässt sich die Füllrate einer Adreno
      // nicht messen (SwiftShader hat keine Textur-Abtasteinheiten), also
      // bekommt der Nutzer den Schalter statt einer geratenen Zahl.
      { id: 'quality', label: '🎚 Bildqualität' },
      // Kein Eintrag für Sprachbefehle: In der Brille gibt es keine
      // Spracherkennung (siehe speech.js) – der Knopf konnte dort nur
      // scheitern. Am Desktop steht er weiterhin im Overlay.
      { id: 'save', label: '💾 Sichern' },
      { id: 'load', label: '📂 Laden' },
      { id: 'export', label: '⬇️ Als Datei' },
      { id: 'clear', label: '🧹 Alles löschen', danger: true },
    ],
  },
  {
    id: 'flow',
    label: '⚙️ Prozess',
    actions: [
      { id: 'flow-generate', label: '✨ Aus Text bauen' },
      { id: 'flow-node', label: '＋ Schritt' },
      { id: 'flow-type', label: '◇ Form wechseln' },
      { id: 'flow-arrow', label: '➜ Pfeil ziehen' },
      { id: 'flow-label', label: '🏷 Zweig benennen' },
      { id: 'flow-layout', label: '⤓ Anordnen' },
      { id: 'flow-export', label: '⬇️ Als Mermaid' },
    ],
  },
];

const COLORS = {
  panelFill: 'rgba(26, 24, 31, 0.98)',
  panelBorder: 'rgba(255, 180, 84, 0.45)',
  accent: '#ffd8a0',
  base: '#2c2933',
  hover: '#3b3644',
  dangerBase: '#3a2830',
  dangerHover: '#4e3540',
  tabBase: '#232029',
  tabHover: '#302c38',
  tabActive: '#4a3a24',
  text: '#f0eef2',
  textMuted: '#a09aa8',
};

// --- Platzierung ---

// Am Controller: das Panel saß bisher hinter dem Handgelenk und ragte durch die
// Neigung weit Richtung Ellenbogen – die untere Hälfte lag damit außerhalb des
// bequemen Blickfelds. Jetzt sitzt es über dem Handrücken und reicht nach vorn.
const GRIP_POSITION = new THREE.Vector3(0, 0.05, -0.06);
const GRIP_TILT_X = -Math.PI / 3;

// Ohne Controller: das Menü schwebt über der offenen Handfläche.
const PALM_SCALE = 0.6;
const PALM_LIFT = 0.05; // Abstand über der Handfläche
const PALM_FORWARD = 0.03; // leicht Richtung Finger, damit das Handgelenk frei bleibt

// Aufstellwinkel gegenüber der Handfläche. Plan auf der Hand liegend schaut man
// von schräg oben auf das Panel: Die Beschriftungen stehen dann stark verkürzt
// und die untere Reihe ist am schlechtesten zu treffen. Aufgestellt wie ein
// Laptop-Deckel steht die Fläche dem Blick zugewandt.
const PALM_TILT = 0.62; // rad, gut 35°

// Ein-/Ausblenden mit Hysterese, sonst flackert das Menü an der Schwelle.
// Die Schwellen sind bewusst großzügig: Handtracking rauscht, und ein Menü,
// das erst bei perfekt ausgerichteter Hand erscheint, wirkt kaputt.
const FACING_SHOW = 0.4; // Handfläche zeigt zum Gesicht
const FACING_HIDE = 0.15;
const OPEN_SHOW = 1.6; // Mittelfinger gestreckt (Vielfaches der Handflächenlänge)
const OPEN_HIDE = 1.35;

// Für die Handflächen-Ebene nötig. Die Fingerspitze steht bewusst NICHT hier
// drin: Sie fällt beim Blick auf die Handfläche regelmäßig aus dem Tracking,
// und daran darf das Menü nicht scheitern (siehe _openness).
const PALM_JOINTS = [
  'wrist',
  'index-finger-phalanx-proximal',
  'middle-finger-phalanx-proximal',
  'pinky-finger-phalanx-proximal',
];

// Abgerundetes Panel als Canvas-Textur (Füllung + feiner Rahmen + Glow)
export function makeRoundedPanel(width, height, { fill, border }, pxPerMeter = 1400) {
  const w = Math.round(width * pxPerMeter);
  const h = Math.round(height * pxPerMeter);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const r = 34;
  const inset = 6;
  const rr = (x, y, ww, hh, rad) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
    ctx.arcTo(x, y + hh, x, y, rad);
    ctx.arcTo(x, y, x + ww, y, rad);
    ctx.closePath();
  };
  rr(inset, inset, w - inset * 2, h - inset * 2, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
  );
  return mesh;
}

// UI-Ebene "flach" halten: keine tiefenbasierte Sortierung (die bei bewegtem
// Blickwinkel kippt und den Hintergrund über Buttons malt), sondern feste
// Zeichenreihenfolge per renderOrder. depthWrite aus → reine Maler-Reihenfolge.
export function flatLayer(mesh, order) {
  mesh.material.depthWrite = false;
  mesh.material.depthTest = false;
  mesh.renderOrder = order;
  mesh.traverse((child) => {
    if (child.material) {
      child.material.depthWrite = false;
      child.material.depthTest = false;
      child.renderOrder = order;
    }
  });
  return mesh;
}

// Menü-Panel an der Hand. Mit Controllern hängt es am Grip, bei Hand-Tracking
// über der offenen Handfläche. Buttons werden mit dem Ray bzw. per Pinch der
// anderen Hand geklickt.
export class WristMenu {
  constructor(onAction) {
    this.group = new THREE.Group();
    this.group.name = 'wristMenu';
    this.group.visible = false;
    this.onAction = onAction;
    this.enabled = false;
    this.activePage = 0;
    this.mode = null; // 'grip' | 'palm' | null
    this.attachedHand = null;
    this.sources = new Map(); // handedness -> { handedness, grip, hand }
    this.buttonsById = new Map(); // Aktions-ID -> { panel, base, hover }
    this._palmVisible = false;

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._basis = new THREE.Matrix4();

    const BTN_W = 0.138;
    const BTN_H = 0.05;
    const GAP_X = 0.01;
    const GAP_Y = 0.009;
    const PAD = 0.022;
    const HEADER_H = 0.042;
    const TAB_H = 0.034;
    const rows = Math.max(...PAGES.map((page) => Math.ceil(page.actions.length / 2)));

    const panelW = 2 * BTN_W + GAP_X + PAD * 2;
    const panelH = PAD + HEADER_H + 0.006 + TAB_H + 0.012 + rows * BTN_H + (rows - 1) * GAP_Y + PAD;
    // Die Handflächen-Platzierung braucht die Höhe, um den Aufstellwinkel
    // auszugleichen (siehe PALM_TILT).
    this.panelHeight = panelH;

    const panel = makeRoundedPanel(panelW, panelH, {
      fill: COLORS.panelFill,
      border: COLORS.panelBorder,
    });
    panel.position.z = -0.004;
    flatLayer(panel, 20); // Hintergrund zuerst
    this.group.add(panel);

    const top = panelH / 2;
    const headerY = top - PAD - HEADER_H / 2;

    const title = createTextPanel({
      width: panelW - PAD * 2,
      height: HEADER_H,
      text: '🧠 Brainstorming',
      background: 'transparent',
      color: COLORS.accent,
      weight: 700,
      singleLine: true,
      fontSize: 30,
      doubleSided: false,
    });
    title.mesh.position.set(0, headerY, 0.002);
    flatLayer(title.mesh, 22);
    this.group.add(title.mesh);

    // --- Reiter für die Seiten ---
    //
    // Breite aus der Anzahl gerechnet, nicht für zwei Reiter fest verdrahtet:
    // Beim dritten Reiter hätten sich sonst die Beschriftungen überlappt – exakt
    // der Fehler, den die Funktionsreihe der Tastatur schon einmal hatte.
    const tabY = headerY - HEADER_H / 2 - 0.006 - TAB_H / 2;
    const innerW = panelW - PAD * 2;
    const tabW = (innerW - GAP_X * (PAGES.length - 1)) / PAGES.length;
    this.tabs = [];
    PAGES.forEach((page, i) => {
      const tab = createTextPanel({
        width: tabW,
        height: TAB_H,
        text: page.label,
        background: COLORS.tabBase,
        color: COLORS.textMuted,
        weight: 600,
        singleLine: true,
        fontSize: 22,
        padding: 14,
        radius: 16,
        doubleSided: false,
      });
      tab.mesh.position.set(-innerW / 2 + tabW / 2 + i * (tabW + GAP_X), tabY, 0.002);
      flatLayer(tab.mesh, 23);
      tab.mesh.userData.onClick = () => this.setPage(i);
      tab.mesh.userData.setHover = (hovered) => {
        if (i === this.activePage) return;
        tab.setColors({ background: hovered ? COLORS.tabHover : COLORS.tabBase });
      };
      this.group.add(tab.mesh);
      this.tabs.push(tab);
    });

    // --- Aktions-Raster je Seite ---
    const gridTopY = tabY - TAB_H / 2 - 0.012 - BTN_H / 2;
    const colX = (BTN_W + GAP_X) / 2;

    this.pageButtons = PAGES.map((page) => {
      // Die Seiten sind unterschiedlich lang (10 bzw. 11 Aktionen). Das Panel
      // ist auf die längere ausgelegt; die kürzere wird im freien Raum
      // zentriert, sonst klafft unten eine ganze leere Reihe.
      const pageRows = Math.ceil(page.actions.length / 2);
      const centerOffset = ((rows - pageRows) * (BTN_H + GAP_Y)) / 2;
      return page.actions.map((action, i) => {
        const row = Math.floor(i / 2);
        const x = (i % 2 === 0 ? -1 : 1) * colX;
        const y = gridTopY - centerOffset - row * (BTN_H + GAP_Y);
        const base = action.danger ? COLORS.dangerBase : COLORS.base;
        const hover = action.danger ? COLORS.dangerHover : COLORS.hover;

        const button = createTextPanel({
          width: BTN_W,
          height: BTN_H,
          text: action.label,
          background: base,
          color: COLORS.text,
          weight: 600,
          singleLine: true,
          fontSize: 25,
          padding: 24,
          radius: 22,
          doubleSided: false,
        });
        button.mesh.position.set(x, y, 0.002);
        flatLayer(button.mesh, 21);
        button.mesh.userData.onClick = () => this.onAction(action.id);
        // Umschaltbare Aktionen (z. B. Sprachbefehle) färben sich, solange sie
        // aktiv sind – setActionActive() hinterlegt dafür die Farben.
        const entry = { panel: button, base, hover };
        button.mesh.userData.setHover = (hovered) =>
          button.setColors({ background: hovered ? entry.hover : entry.base });
        this.buttonsById.set(action.id, entry);
        this.group.add(button.mesh);
        return button.mesh;
      });
    });

    this.setPage(0);
  }

  // Dauerzustand einer Aktion anzeigen (an = Amber-Fläche mit dunkler Schrift).
  setActionActive(id, active) {
    const entry = this.buttonsById.get(id);
    if (!entry) return;
    entry.base = active ? COLORS.tabActive : COLORS.base;
    entry.hover = active ? COLORS.tabActive : COLORS.hover;
    entry.panel.setColors({
      background: entry.base,
      color: active ? COLORS.accent : COLORS.text,
    });
  }

  // Anklickbare Elemente: Reiter plus die Buttons der sichtbaren Seite.
  get buttons() {
    return [...this.tabs.map((tab) => tab.mesh), ...this.pageButtons[this.activePage]];
  }

  setPage(index) {
    this.activePage = THREE.MathUtils.euclideanModulo(index, PAGES.length);
    this.pageButtons.forEach((buttons, i) => {
      const visible = i === this.activePage;
      for (const button of buttons) button.visible = visible;
    });
    this.tabs.forEach((tab, i) => {
      const active = i === this.activePage;
      tab.setColors({
        background: active ? COLORS.tabActive : COLORS.tabBase,
        color: active ? COLORS.accent : COLORS.textMuted,
      });
    });
  }

  // Eingabequelle registrieren. Controller liefern einen Grip, Hand-Tracking
  // ein XRHandSpace – beides kann während der Sitzung wechseln, wenn der Nutzer
  // die Controller weglegt oder wieder aufnimmt.
  registerSource(handedness, { grip, hand } = {}) {
    const key = handedness || 'unknown';
    const entry = this.sources.get(key) ?? { handedness: key };
    if (grip) entry.grip = grip;
    if (hand) entry.hand = hand;
    this.sources.set(key, entry);
  }

  setVisible(visible) {
    this.enabled = visible;
    if (!visible) {
      this.group.visible = false;
      this.mode = null;
    }
  }

  // Alle passenden Quellen, linke Hand zuerst (sie ist die gewohnte Menühand).
  _tracked(test) {
    const all = [...this.sources.values()].filter(test);
    return all.sort(
      (a, b) => (a.handedness === 'left' ? -1 : 0) - (b.handedness === 'left' ? -1 : 0)
    );
  }

  _attachTo(parent, mode) {
    if (this.group.parent !== parent) parent.add(this.group);
    this.mode = mode;
  }

  update(camera) {
    if (!this.enabled) {
      this.group.visible = false;
      return;
    }

    // Jede getrackte Hand durchprobieren, nicht nur die bevorzugte: Sonst
    // „gewinnt" die linke Hand allein dadurch, dass sie getrackt wird, und
    // blockiert die rechte – wer die rechte Handfläche hochhält, sieht dann
    // nie ein Menü, obwohl beide Hände erkannt werden.
    const hands = this._tracked((source) => this._handTracked(source));
    for (const source of hands) {
      if (this._placeOnPalm(source, camera)) return;
    }
    if (hands.length) {
      // Hände sind da, aber keine offene Handfläche zeigt zum Gesicht.
      this.group.visible = false;
      this._palmVisible = false;
      return;
    }

    const gripSource = this._tracked((source) => source.grip?.visible)[0];
    if (gripSource) {
      this._placeOnGrip(gripSource);
      return;
    }

    this.group.visible = false;
  }

  _handTracked(source) {
    const hand = source.hand;
    if (!hand?.visible || !hand.joints) return false;
    return PALM_JOINTS.every((name) => hand.joints[name]?.visible);
  }

  _placeOnGrip(source) {
    this._attachTo(source.grip, 'grip');
    this.attachedHand = source.handedness;
    this.group.position.copy(GRIP_POSITION);
    this.group.rotation.set(GRIP_TILT_X, 0, 0);
    this.group.scale.setScalar(1);
    this.group.visible = true;
    this._palmVisible = false;
  }

  // Wie weit die Hand geöffnet ist, als Vielfaches der Handflächenlänge:
  // gestreckter Mittelfinger ≈ 2, Faust ≈ 1. Ist die Fingerspitze gerade nicht
  // getrackt (beim Blick auf die Handfläche häufig), liefert die Messung null –
  // dann wird die Prüfung übersprungen statt das Menü auszublenden.
  _openness(joints, palmLength) {
    const tip = joints['middle-finger-tip'];
    if (!tip?.visible) return null;
    return joints['wrist'].position.distanceTo(tip.position) / palmLength;
  }

  // Handflächen-Platzierung. Die Basis wird ausschließlich aus Gelenk-*Positionen*
  // gebildet – die Achsenkonvention einzelner Gelenk-Spaces bleibt damit außen vor.
  // Liefert true, wenn das Menü tatsächlich auf dieser Hand gelandet ist.
  _placeOnPalm(source, camera) {
    const joints = source.hand.joints;
    const wrist = joints['wrist'].position;
    const knuckle = joints['middle-finger-phalanx-proximal'].position;
    const indexKnuckle = joints['index-finger-phalanx-proximal'].position;
    const pinkyKnuckle = joints['pinky-finger-phalanx-proximal'].position;

    const palmLength = wrist.distanceTo(knuckle);
    if (palmLength < 1e-4) return false;

    // Richtung Finger und quer über die Handfläche (Kleinfinger → Zeigefinger).
    this._forward.copy(knuckle).sub(wrist).normalize();
    this._side.copy(indexKnuckle).sub(pinkyKnuckle);
    if (this._side.lengthSq() < 1e-8) return false;
    this._side.normalize();

    // Flächennormale, die aus der HANDFLÄCHE herauszeigt (nicht aus dem
    // Handrücken). Die Reihenfolge des Kreuzprodukts hängt an der Händigkeit.
    //
    // Probe rechte Hand über den Handschlag: Finger nach vorn F = -Z, Daumen
    // nach oben, Handfläche nach links N = -X. Der Zeigefinger liegt auf der
    // Daumenseite, also S = +Y, und cross(S, F) = Y × (-Z) = -X = N.
    // Die linke Hand ist gespiegelt. Merkhilfe: Legt man beide Handflächen vor
    // dem Gesicht auf, zeigen die Daumen nach außen – links nach links, rechts
    // nach rechts.
    if (source.handedness === 'right') this._normal.crossVectors(this._side, this._forward);
    else this._normal.crossVectors(this._forward, this._side);
    if (this._normal.lengthSq() < 1e-8) return false;
    this._normal.normalize();

    // „Vorwärts" senkrecht zur Normalen nachziehen (Gelenke liegen nie exakt in
    // einer Ebene) und daraus eine saubere rechtshändige Basis bauen.
    this._forward.addScaledVector(this._normal, -this._forward.dot(this._normal)).normalize();
    this._right.crossVectors(this._forward, this._normal);

    const openness = this._openness(joints, palmLength);

    const palmCenter = this._v1.copy(wrist).lerp(knuckle, 0.55);
    // Gelenke sind Kinder des Hand-Objekts – Kamera in denselben Raum holen.
    camera.getWorldPosition(this._camPos);
    source.hand.worldToLocal(this._camPos);
    const toCamera = this._v2.copy(this._camPos).sub(palmCenter);
    const facing = toCamera.lengthSq() > 1e-8 ? toCamera.normalize().dot(this._normal) : 0;

    // Hysterese: einmal sichtbar, bleibt das Menü bis deutlich unter der Schwelle.
    const openEnough =
      openness === null || (this._palmVisible ? openness > OPEN_HIDE : openness > OPEN_SHOW);
    const facingEnough = this._palmVisible ? facing > FACING_HIDE : facing > FACING_SHOW;
    const show = openEnough && facingEnough;
    this._palmVisible = show;
    if (!show) return false;

    this._attachTo(source.hand, 'palm');
    this.attachedHand = source.handedness;
    this._basis.makeBasis(this._right, this._forward, this._normal);
    this.group.quaternion.setFromRotationMatrix(this._basis);
    // Um die Querachse aufstellen, sodass die Oberkante zum Gesicht kippt.
    this.group.rotateX(PALM_TILT);

    // Gedreht wird um die Panelmitte – ohne Ausgleich taucht die Unterkante
    // dabei in die Handfläche ein. Der Zuschlag hebt sie wieder heraus, das
    // Panel klappt also um seine Unterkante auf statt um seinen Mittelpunkt.
    const tiltLift = (this.panelHeight * PALM_SCALE * Math.sin(PALM_TILT)) / 2;
    this.group.position
      .copy(palmCenter)
      .addScaledVector(this._normal, PALM_LIFT + tiltLift)
      .addScaledVector(this._forward, PALM_FORWARD);
    this.group.scale.setScalar(PALM_SCALE);
    this.group.visible = true;
    return true;
  }
}

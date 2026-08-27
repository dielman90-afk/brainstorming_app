import * as THREE from 'three';
import { wechsleHeimat, inHeimat, poseInHeimat } from './heimat.js';
import { createTextPanel } from './textPanel.js';
import { makeRoundedPanel } from './wristMenu.js';

// Zeichenbares Whiteboard im Raum: Stift/Marker/Radierer, Farben, Strichstärken,
// Formen (Linie/Rechteck/Kreis mit Live-Vorschau), Wischen, Skalieren und
// KI-Skizzenanalyse ("Zu Karten"). Griffleiste oben zum Verschieben.
//
// Modernes Design: große, weich abgerundete Zeichenfläche (keine harten Kanten),
// dezenter Rahmen mit Schlagschatten und eine gruppierte Icon-Werkzeugleiste mit
// klaren Vektor-Symbolen.

const BOARD_W = 1.92;
const BOARD_H = 1.16;
const CANVAS_W = 2304;
const CANVAS_H = 1392;
const BOARD_RADIUS = 96; // Eckenradius der Zeichenfläche (px)
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;

export const PEN_COLORS = ['#111827', '#e03131', '#1971c2', '#2f9e44', '#f76707', '#9c36b5'];
const SIZES = [
  { label: 'S', width: 4, dot: 8 },
  { label: 'M', width: 9, dot: 14 },
  { label: 'L', width: 18, dot: 20 },
];

// Werkzeugleisten-Farbwelt (passend zum "Soft Spatial Minimal"-Theme)
const BAR_FILL = 'rgba(22, 20, 27, 0.97)';
const BAR_BORDER = 'rgba(255, 255, 255, 0.12)';
const BTN_BASE = 'rgba(255, 255, 255, 0.06)';
const BTN_HOVER = 'rgba(255, 255, 255, 0.15)';
const BTN_ACTIVE = '#ffb454';
const TXT = '#eef1f5';
const TXT_ACTIVE = '#231a0c';

// Feste Zeichenreihenfolge für alle (durchscheinenden) Whiteboard-Ebenen.
// Ohne diese sortiert Three.js die transparenten Flächen nach Kameradistanz;
// bei bewegtem Blick kippt die Reihenfolge und die fast opake Leiste wird mal
// über, mal unter den Buttons gemalt – die Toolbar „flackert" durchsichtig.
// depthWrite bleibt aus (Ebenen verdecken sich nicht gegenseitig über die
// Tiefe), depthTest bleibt an (das Board wird korrekt von näheren Objekten im
// Raum verdeckt). Gleiche Technik wie beim Handgelenk-Menü.
const LAYER = { back: 1, frame: 2, surface: 3, panel: 4, divider: 5, button: 6 };

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

function sparkle(ctx, cx, cy, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 ? r : R;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// Vektor-Glyphen, gezeichnet in einem 100×100-Koordinatenraum.
const GLYPHS = {
  pen(ctx) {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(76, 24);
    ctx.lineTo(44, 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, 52);
    ctx.lineTo(48, 60);
    ctx.lineTo(24, 76);
    ctx.closePath();
    ctx.fill();
  },
  marker(ctx) {
    ctx.save();
    ctx.translate(50, 50);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-50, -50);
    roundRectPath(ctx, 38, 20, 24, 32, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(38, 52);
    ctx.lineTo(62, 52);
    ctx.lineTo(56, 72);
    ctx.lineTo(44, 72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  eraser(ctx) {
    ctx.lineWidth = 7;
    ctx.save();
    ctx.translate(50, 50);
    ctx.rotate(-0.42);
    ctx.translate(-50, -50);
    roundRectPath(ctx, 22, 40, 56, 24, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, 40);
    ctx.lineTo(48, 64);
    ctx.stroke();
    ctx.restore();
  },
  line(ctx) {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(24, 76);
    ctx.lineTo(76, 24);
    ctx.stroke();
  },
  rect(ctx) {
    ctx.lineWidth = 8;
    roundRectPath(ctx, 24, 30, 52, 40, 8);
    ctx.stroke();
  },
  circle(ctx) {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(50, 50, 27, 0, Math.PI * 2);
    ctx.stroke();
  },
  trash(ctx) {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(26, 33);
    ctx.lineTo(74, 33);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(42, 33);
    ctx.lineTo(42, 26);
    ctx.lineTo(58, 26);
    ctx.lineTo(58, 33);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(33, 33);
    ctx.lineTo(37, 76);
    ctx.lineTo(63, 76);
    ctx.lineTo(67, 33);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(45, 42);
    ctx.lineTo(46, 67);
    ctx.moveTo(55, 42);
    ctx.lineTo(54, 67);
    ctx.stroke();
  },
  minus(ctx) {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(30, 50);
    ctx.lineTo(70, 50);
    ctx.stroke();
  },
  plus(ctx) {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(30, 50);
    ctx.lineTo(70, 50);
    ctx.moveTo(50, 30);
    ctx.lineTo(50, 70);
    ctx.stroke();
  },
  wand(ctx) {
    sparkle(ctx, 42, 44, 20, 7);
    sparkle(ctx, 72, 28, 9, 3.2);
    sparkle(ctx, 70, 64, 7, 2.6);
  },
};

export class Whiteboard {
  constructor(scene, { onSketch, floorY = () => 0 } = {}) {
    this.scene = scene;
    this.onSketch = onSketch;
    // Die Bodenhöhe unter dem Nutzer. Vorgabe null, damit die Klemmung in
    // `placeInFront` ohne diese Angabe genau das tut, was sie vorher tat.
    this.floorY = floorY;
    // **Die Tafel gehört an den Ort, an dem man sie aufstellt.**
    //
    // Hier stand einmal die Begründung, sie sei „ein Werkzeug, kein Gegenstand
    // der Welt", und bleibe deshalb an der Szene. Auf den vier ortsfesten
    // Umgebungen ist das folgenlos — man geht von ihr weg. Auf dem Planeten
    // steht der Nutzer still und die Welt dreht sich unter ihm: Was an der
    // Szene hängt, steht damit **für immer vor ihm** und lässt sich nicht
    // verlassen. Gemessen mit `tools/werkzeuge.mjs`: nach einer Vierteldrehung
    // der Welt — 39,3 m Bogen — hatte sich die Tafel um **0,00 m** vom Nutzer
    // entfernt. Genau das ist die Meldung „das Whiteboard wird bei Bewegung
    // mitgezogen".
    //
    // Sie bekommt deshalb dieselbe Heimat wie Karten und Zonen. Verloren geht
    // sie dadurch nicht: Der Knopf blendet sie aus und beim nächsten Einblenden
    // stellt `placeInFront` sie wieder vor den Nutzer.
    this.heimat = scene;
    this.group = new THREE.Group();
    this.group.name = 'whiteboard';
    // Siehe `nichtUmgebung` in tools/measure.mjs: Diese Gruppe hängt auf dem
    // Planeten in der Weltgruppe, gehört aber nicht zur Umgebung und darf
    // nicht gegen deren Budget zählen.
    this.group.userData.nichtUmgebung = true;
    this.group.visible = false;
    this.scale = 1;
    this.tool = 'pen';
    this.colorIndex = 0;
    this.sizeIndex = 1;
    this.hasContent = false;
    this.buttons = [];
    this._renderers = []; // { key, kind, render(state) }
    this._stroke = null;

    // Zeichenfläche (Canvas-Textur mit runden Ecken auf transparentem Grund)
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d');
    this._fillBoard();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        alphaTest: 0.5, // saubere runde Ecken, keine Sortierprobleme
        toneMapped: false,
      })
    );
    this.surface.userData.drawSurface = this;
    this._layer(this.surface, LAYER.surface);
    this.group.add(this.surface);

    // Dezenter, weich abgerundeter Rahmen mit Schlagschatten (statt harter Kanten)
    const frame = this._makeFrame();
    frame.position.z = -0.006;
    this._layer(frame, LAYER.frame);
    this.group.add(frame);

    // Rückwand, damit das Board von hinten solide wirkt
    const back = makeRoundedPanel(BOARD_W + 0.05, BOARD_H + 0.05, {
      fill: '#17151b',
      border: 'rgba(255,255,255,0.05)',
    });
    back.material.toneMapped = false;
    back.rotation.y = Math.PI;
    back.position.z = -0.01;
    this._layer(back, LAYER.back);
    this.group.add(back);

    // Griffleiste oben: greifen = verschieben, Stick beim Halten = Größe
    const handleBg = makeRoundedPanel(0.44, 0.062, {
      fill: 'rgba(28, 25, 33, 0.96)',
      border: 'rgba(255,255,255,0.12)',
    });
    handleBg.material.toneMapped = false;
    const handleLabel = createTextPanel({
      width: 0.42,
      height: 0.055,
      text: '⠿  Whiteboard',
      background: 'transparent',
      color: '#c8c2d0',
      fontSize: 24,
      singleLine: true,
      doubleSided: false,
    });
    handleLabel.mesh.position.z = 0.001;
    this._layer(handleLabel.mesh, LAYER.button);
    handleBg.add(handleLabel.mesh);
    this._layer(handleBg, LAYER.panel);
    handleBg.position.set(0, BOARD_H / 2 + 0.06, 0.004);
    handleBg.userData.grabTarget = {
      group: this.group,
      // Damit das Loslassen in XR sie wieder an die Heimat hängt und nicht an
      // die Szene — sonst klebte sie nach jedem Anfassen wieder am Nutzer.
      heimat: () => this.heimat,
      getScale: () => this.scale,
      setScale: (v) => this.setScale(v),
    };
    handleBg.userData.setHover = (h) =>
      handleLabel.setColors({ color: h ? '#ffffff' : '#c8c2d0' });
    this.handle = handleBg;
    this.group.add(handleBg);

    this._buildToolbar();
    scene.add(this.group);
  }

  // Ebene in die feste Zeichenreihenfolge einordnen (siehe LAYER-Kommentar).
  _layer(mesh, order) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = true;
      m.depthWrite = false;
    }
    mesh.renderOrder = order;
    return mesh;
  }

  // --- Rahmen mit weichem Schatten ---

  _makeFrame() {
    const pad = 0.16;
    const pxPerMeter = 900;
    const outerW = BOARD_W + 0.05 + pad * 2;
    const outerH = BOARD_H + 0.05 + pad * 2;
    const W = Math.round(outerW * pxPerMeter);
    const H = Math.round(outerH * pxPerMeter);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const bx = pad * pxPerMeter;
    const by = pad * pxPerMeter;
    const bw = (BOARD_W + 0.05) * pxPerMeter;
    const bh = (BOARD_H + 0.05) * pxPerMeter;
    const r = 74;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 26;
    roundRectPath(ctx, bx, by, bw, bh, r);
    ctx.fillStyle = 'rgba(32, 29, 38, 0.98)';
    ctx.fill();
    ctx.restore();

    // feiner heller Lichtrand oben für Tiefe
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    roundRectPath(ctx, bx + 1.5, by + 1.5, bw - 3, bh - 3, r);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(outerW, outerH),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
    );
  }

  // --- Icon-Buttons ---

  _boardPath(ctx) {
    roundRectPath(ctx, 4, 4, CANVAS_W - 8, CANVAS_H - 8, BOARD_RADIUS);
  }

  _makeButton({ key, kind, glyph, colorHex, dot, width, height = 0.086, onClick }) {
    const pxPerMeter = 1500;
    const W = Math.round(width * pxPerMeter);
    const H = Math.round(height * pxPerMeter);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.colorSpace = THREE.SRGBColorSpace;

    const render = (state) => {
      ctx.clearRect(0, 0, W, H);
      const active = state === 'active';
      const hover = state === 'hover';
      const rad = Math.min(W, H) * 0.28;

      if (kind === 'color') {
        // dezenter Chip-Hintergrund
        roundRectPath(ctx, 3, 3, W - 6, H - 6, rad);
        ctx.fillStyle = active ? 'rgba(255,180,84,0.22)' : hover ? BTN_HOVER : BTN_BASE;
        ctx.fill();
        // Farbkreis
        const cx = W / 2;
        const cy = H / 2;
        const cr = Math.min(W, H) * 0.28;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fillStyle = colorHex;
        ctx.fill();
        // Ring
        ctx.lineWidth = active ? 5 : 3;
        ctx.strokeStyle = active ? '#ffffff' : hover ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, cr + (active ? 5 : 3), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        roundRectPath(ctx, 3, 3, W - 6, H - 6, rad);
        ctx.fillStyle = active ? BTN_ACTIVE : hover ? BTN_HOVER : BTN_BASE;
        ctx.fill();
        const fg = active ? TXT_ACTIVE : TXT;
        ctx.strokeStyle = fg;
        ctx.fillStyle = fg;
        if (kind === 'size') {
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, dot, 0, Math.PI * 2);
          ctx.fill();
        } else if (glyph) {
          const s = Math.min(W, H) * 0.62;
          ctx.save();
          ctx.translate(W / 2, H / 2);
          ctx.scale(s / 100, s / 100);
          ctx.translate(-50, -50);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          GLYPHS[glyph](ctx);
          ctx.restore();
        }
      }
      texture.needsUpdate = true;
    };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
    );
    mesh.userData.onClick = onClick;
    mesh.userData.setHover = (h) => render(this._isActive(key) ? 'active' : h ? 'hover' : 'base');
    render(this._isActive(key) ? 'active' : 'base');

    this._layer(mesh, LAYER.button);
    this._renderers.push({ key, render });
    this.buttons.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  _isActive(key) {
    if (!key) return false;
    if (key.startsWith('tool:')) return this.tool === key.slice(5);
    if (key.startsWith('color:')) return this.colorIndex === Number(key.slice(6));
    if (key.startsWith('size:')) return this.sizeIndex === Number(key.slice(5));
    return false;
  }

  _refreshToolbar() {
    for (const { key, render } of this._renderers) {
      render(this._isActive(key) ? 'active' : 'base');
    }
  }

  _buildToolbar() {
    const SQ = 0.086; // quadratische Werkzeug-Buttons
    const CH = 0.062; // schmale Chips (Farbe/Größe)
    const GAP = 0.012;
    const SEP = 0.026;

    // Erst die Buttons definieren, dann Gesamtbreite → zentriert platzieren
    const specs = [];
    for (const [tool, glyph] of [['pen', 'pen'], ['marker', 'marker'], ['eraser', 'eraser']]) {
      specs.push({ w: SQ, make: () => this._makeButton({ key: `tool:${tool}`, kind: 'tool', glyph, width: SQ, onClick: () => this.setTool(tool) }) });
    }
    specs.push({ sep: true });
    PEN_COLORS.forEach((color, i) => {
      specs.push({ w: CH, make: () => this._makeButton({ key: `color:${i}`, kind: 'color', colorHex: color, width: CH, onClick: () => this.setColor(i) }) });
    });
    specs.push({ sep: true });
    SIZES.forEach((size, i) => {
      specs.push({ w: CH, make: () => this._makeButton({ key: `size:${i}`, kind: 'size', dot: size.dot, width: CH, onClick: () => this.setSize(i) }) });
    });
    specs.push({ sep: true });
    for (const [tool, glyph] of [['line', 'line'], ['rect', 'rect'], ['circle', 'circle']]) {
      specs.push({ w: SQ, make: () => this._makeButton({ key: `tool:${tool}`, kind: 'tool', glyph, width: SQ, onClick: () => this.setTool(tool) }) });
    }
    specs.push({ sep: true });
    specs.push({ w: SQ, make: () => this._makeButton({ kind: 'action', glyph: 'trash', width: SQ, onClick: () => this.clearBoard() }) });
    specs.push({ w: SQ, make: () => this._makeButton({ kind: 'action', glyph: 'minus', width: SQ, onClick: () => this.setScale(this.scale / 1.15) }) });
    specs.push({ w: SQ, make: () => this._makeButton({ kind: 'action', glyph: 'plus', width: SQ, onClick: () => this.setScale(this.scale * 1.15) }) });

    // Gesamtbreite berechnen
    let total = 0;
    specs.forEach((s, i) => {
      if (s.sep) total += SEP;
      else total += s.w + (i > 0 && !specs[i - 1]?.sep ? GAP : 0);
    });
    // AI-Button separat rechts, mit etwas Abstand
    const aiW = SQ + 0.04;
    const barH = 0.13;
    const y = -BOARD_H / 2 - 0.098;
    const barW = total + aiW + SEP + 0.05;

    // Werkzeugleisten-Hintergrund (eine weiche Pille statt vieler Kästchen)
    const bar = makeRoundedPanel(barW, barH, { fill: BAR_FILL, border: BAR_BORDER });
    bar.material.toneMapped = false;
    bar.position.set(0, y, 0.001);
    this._layer(bar, LAYER.panel);
    this.group.add(bar);

    // Buttons platzieren
    let x = -barW / 2 + 0.028;
    const place = (mesh, w) => {
      mesh.position.set(x + w / 2, y, 0.004);
      x += w;
    };
    const addDivider = () => {
      x += SEP / 2 - 0.001;
      const div = new THREE.Mesh(
        new THREE.PlaneGeometry(0.002, barH * 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, toneMapped: false })
      );
      div.position.set(x, y, 0.003);
      this._layer(div, LAYER.divider);
      this.group.add(div);
      x += SEP / 2 + 0.001;
    };

    specs.forEach((s, i) => {
      if (s.sep) {
        addDivider();
        return;
      }
      if (i > 0 && !specs[i - 1]?.sep) x += GAP;
      place(s.make(), s.w);
    });

    // Prominenter KI-Button ("Zu Karten")
    addDivider();
    x += 0.008;
    const ai = this._makeButton({ kind: 'ai', glyph: 'wand', width: aiW, height: 0.092, onClick: () => this.onSketch?.() });
    ai.position.set(x + aiW / 2, y, 0.004);

    this._refreshToolbar();
  }

  // --- Zustand ---

  setTool(tool) {
    this.tool = tool;
    this._refreshToolbar();
  }

  setColor(index) {
    this.colorIndex = index;
    this._refreshToolbar();
  }

  setSize(index) {
    this.sizeIndex = index;
    this._refreshToolbar();
  }

  setScale(value) {
    this.scale = THREE.MathUtils.clamp(value, MIN_SCALE, MAX_SCALE);
    this.group.scale.setScalar(this.scale);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  get uiTargets() {
    return this.group.visible ? [this.surface, this.handle, ...this.buttons] : [];
  }

  setHeimat(ziel) {
    const neu = ziel ?? this.scene;
    const alt = this.heimat;
    this.heimat = neu;
    wechsleHeimat(alt, neu, [this.group]);
  }

  placeInFront(camera) {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const pos = camPos.clone().addScaledVector(dir, 1.7);
    // **Die Klemmung misst ab dem Boden, nicht ab y = 0.**
    //
    // Hier stand `clamp(camPos.y + versatz, unten, oben)` mit absoluten Welthöhen.
    // Das setzt stillschweigend voraus, dass der Boden bei null liegt — auf den vier
    // flachen Umgebungen stimmt das, auf einer Kugel von 25 m Halbmesser nicht: Der
    // Nutzer steht dort bei y ≈ 26,9, die obere Grenze schlägt an, und die Tafel
    // landet **23,4 m unter seinen Füßen**, also im Gestein. Gemessen mit
    // `tools/panelhoehe.mjs`.
    //
    // Mit dem Boden als Bezug bleibt das Verhalten auf ebenem Grund Zahl für Zahl
    // dasselbe (dort ist `boden` null), und auf der Kugel steht die Tafel dort, wo
    // sie hingehört.
    const boden = this.floorY();
    pos.y = boden + THREE.MathUtils.clamp(camPos.y - boden - 0.1, 0.9, 2.0);
    // Gerechnet wird in Weltkoordinaten — die Tafel stellt sich vor den Nutzer,
    // nicht vor den Planeten. Erst danach in die Heimat umgerechnet.
    //
    // **Die Höhe muss vorher gesichert werden.** `inHeimat` rechnet den Vektor
    // an Ort und Stelle um; danach steht in `pos.y` die lokale Höhe. `lookAt`
    // braucht ein Weltziel. Gemessen: Ohne diese Zeile stand die Tafel nach
    // 40 Grad Weltdrehung verdreht im Bild, und der Griff lag nicht mehr dort,
    // wo ihn die Maus suchte.
    const weltY = pos.y;
    this.group.position.copy(inHeimat(this.heimat, this.scene, pos));
    // `lookAt` bekommt ein Weltziel und rechnet die Elternmatrix selbst heraus.
    this.group.lookAt(camPos.x, weltY, camPos.z);
  }

  // --- Zeichnen (uv aus dem Raycast der Zeichenfläche) ---

  _uvToPx(uv) {
    return { x: uv.x * CANVAS_W, y: (1 - uv.y) * CANVAS_H };
  }

  _applyStyle() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const base = SIZES[this.sizeIndex].width;
    if (this.tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 1;
      ctx.lineWidth = base * 4;
    } else if (this.tool === 'marker') {
      ctx.strokeStyle = PEN_COLORS[this.colorIndex];
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = base * 3;
    } else {
      ctx.strokeStyle = PEN_COLORS[this.colorIndex];
      ctx.globalAlpha = 1;
      ctx.lineWidth = base;
    }
  }

  _isShapeTool() {
    return this.tool === 'line' || this.tool === 'rect' || this.tool === 'circle';
  }

  strokeStart(uv) {
    const p = this._uvToPx(uv);
    this._stroke = { start: p, last: p };
    if (this._isShapeTool()) {
      this._stroke.snapshot = this.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    } else {
      this._segment(p, p);
    }
  }

  strokeMove(uv) {
    if (!this._stroke) return;
    const p = this._uvToPx(uv);
    if (this._isShapeTool()) {
      this.ctx.putImageData(this._stroke.snapshot, 0, 0);
      this._shape(this._stroke.start, p);
    } else {
      this._segment(this._stroke.last, p);
      this._stroke.last = p;
    }
    this._markDirty();
  }

  strokeEnd() {
    this._stroke = null;
  }

  _segment(a, b) {
    const ctx = this.ctx;
    ctx.save();
    this._boardPath(ctx);
    ctx.clip();
    this._applyStyle();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    this._markDirty();
  }

  _shape(a, b) {
    const ctx = this.ctx;
    ctx.save();
    this._boardPath(ctx);
    ctx.clip();
    this._applyStyle();
    ctx.beginPath();
    if (this.tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else if (this.tool === 'rect') {
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else {
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  _fillBoard() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
    this._boardPath(ctx);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  _markDirty() {
    this.hasContent = true;
    this.texture.needsUpdate = true;
  }

  clearBoard() {
    this._fillBoard();
    this.texture.needsUpdate = true;
    // hasContent bleibt true, damit der geleerte Stand auch gespeichert wird
  }

  // --- Persistenz ---

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }

  loadDataURL(dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._fillBoard();
        this.ctx.save();
        this._boardPath(this.ctx);
        this.ctx.clip();
        this.ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        this.ctx.restore();
        this.texture.needsUpdate = true;
        this.hasContent = true;
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataURL;
    });
  }

  toJSON() {
    return {
      visible: this.group.visible,
      // `frame` ist reine Auskunft für den Leser der Datei; gelesen wird immer
      // relativ zu der Heimat, die beim Laden gerade gilt. Die Begründung steht
      // bei `poseInHeimat` in heimat.js. Über die Weltpose gerechnet, damit
      // auch eine gerade gegriffene Tafel (Elter = Controller) stimmt.
      ...(this.heimat !== this.scene ? { frame: 'planet' } : {}),
      ...poseInHeimat(this.heimat, this.scene, this.group),
      scale: this.scale,
      image: this.hasContent ? this.toDataURL() : null,
    };
  }

  loadJSON(data) {
    if (!data) return;
    if (Array.isArray(data.position)) this.group.position.fromArray(data.position);
    if (Array.isArray(data.quaternion)) this.group.quaternion.fromArray(data.quaternion);
    if (typeof data.scale === 'number') this.setScale(data.scale);
    this.group.visible = Boolean(data.visible);
    if (typeof data.image === 'string' && data.image.startsWith('data:image')) {
      this.loadDataURL(data.image);
    }
  }
}

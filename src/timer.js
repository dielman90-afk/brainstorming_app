import * as THREE from 'three';
import { wechsleHeimat, stelleAn } from './heimat.js';
import { createTextPanel } from './textPanel.js';
import { makeRoundedPanel } from './wristMenu.js';

// Schwebende Timebox-Uhr für moderierte Sessions: Presets (1/3/5/10 min),
// Start/Pause, Reset, Fortschrittsbalken und ein Gong bei Ablauf. Greifbar zum
// Verschieben, funktioniert an Desktop und in XR.

const PANEL_W = 0.66;
const PANEL_H = 0.58;
const ACCENT = '#ffb454';
const PRESETS = [1, 3, 5, 10];

// Feste Zeichenreihenfolge gegen Transparenz-Flackern (wie beim Whiteboard).
const LAYER = { panel: 1, track: 2, fill: 3, label: 4, button: 4 };

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

export class Timer {
  constructor(scene, { floorY = () => 0 } = {}) {
    this.scene = scene;
    // Siehe `placeInFront`: Die Klemmung misst ab dem Boden, nicht ab y = 0.
    this.floorY = floorY;
    // Dieselbe Heimat wie Karten, Zonen und Tafel — und aus demselben Grund:
    // Auf dem Planeten steht der Nutzer still, und was an der Szene hängt,
    // schwebt für immer vor ihm mit. Die Begründung steht in heimat.js.
    this.heimat = scene;
    this.group = new THREE.Group();
    this.group.name = 'timer';
    this.group.userData.nichtUmgebung = true;
    this.group.visible = false;

    this.durationSec = 5 * 60;
    this.remainingSec = this.durationSec;
    this.running = false;
    this._last = 0;
    this._shownStr = '';
    this._presetBtns = [];
    this.buttons = [];

    // Hintergrund
    const panel = makeRoundedPanel(PANEL_W, PANEL_H, {
      fill: 'rgba(22,20,27,0.97)',
      border: 'rgba(255,255,255,0.12)',
    });
    panel.material.toneMapped = false;
    layer(panel, LAYER.panel);
    this.group.add(panel);

    // Kopfzeile = Greifleiste
    this.header = createTextPanel({
      width: PANEL_W - 0.16,
      height: 0.08,
      text: '⏱  Timebox',
      background: 'transparent',
      color: '#c8c2d0',
      fontSize: 30,
      weight: 600,
      singleLine: true,
      doubleSided: false,
    });
    this.header.mesh.position.set(-0.03, PANEL_H / 2 - 0.06, 0.004);
    this.header.mesh.userData.grabTarget = {
      group: this.group,
      heimat: () => this.heimat,
      getScale: () => this.group.scale.x,
      setScale: (v) => this.group.scale.setScalar(THREE.MathUtils.clamp(v, 0.6, 2.2)),
    };
    this.header.mesh.userData.setHover = (h) =>
      this.header.setColors({ color: h ? '#ffffff' : '#c8c2d0' });
    layer(this.header.mesh, LAYER.label);
    this.group.add(this.header.mesh);

    // Schließen-Button
    const close = this._btn('✕', 0.08, () => this.setVisible(false), 'rgba(28,25,33,0)');
    close.mesh.position.set(PANEL_W / 2 - 0.06, PANEL_H / 2 - 0.06, 0.006);

    // Große Zeitanzeige
    this.timeLabel = createTextPanel({
      width: PANEL_W - 0.1,
      height: 0.2,
      text: '05:00',
      background: 'transparent',
      color: '#ffffff',
      fontSize: 128,
      weight: 700,
      singleLine: true,
      doubleSided: false,
    });
    this.timeLabel.mesh.position.set(0, 0.13, 0.004);
    layer(this.timeLabel.mesh, LAYER.label);
    this.group.add(this.timeLabel.mesh);

    // Fortschrittsbalken
    const trackW = PANEL_W - 0.14;
    this._trackW = trackW;
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(trackW, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x3a3742, transparent: true, toneMapped: false })
    );
    track.position.set(0, 0.0, 0.004);
    layer(track, LAYER.track);
    this.group.add(track);
    this._fill = new THREE.Mesh(
      new THREE.PlaneGeometry(trackW, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, toneMapped: false })
    );
    this._fill.position.set(0, 0.0, 0.005);
    layer(this._fill, LAYER.fill);
    this.group.add(this._fill);

    // Preset-Reihe
    const presetW = 0.11;
    const presetGap = 0.018;
    const rowW = PRESETS.length * presetW + (PRESETS.length - 1) * presetGap;
    let px = -rowW / 2 + presetW / 2;
    PRESETS.forEach((min) => {
      const b = this._btn(`${min}′`, presetW, () => this.setDuration(min * 60));
      b.mesh.position.set(px, -0.11, 0.006);
      b.min = min;
      this._presetBtns.push(b);
      px += presetW + presetGap;
    });

    // Steuer-Reihe: Start/Pause + Reset
    this._playBtn = this._btn('▶  Start', 0.3, () => this.toggleRun(), ACCENT, '#231a0c');
    this._playBtn.mesh.position.set(-0.11, -0.22, 0.006);
    const reset = this._btn('↺  Reset', 0.22, () => this.reset());
    reset.mesh.position.set(0.16, -0.22, 0.006);

    scene.add(this.group);
    this._refresh();
    this._updateDisplay(true);
  }

  _btn(label, width, onClick, bg = 'rgba(255,255,255,0.07)', color = '#eef1f5') {
    const b = createTextPanel({
      width,
      height: 0.086,
      text: label,
      background: bg,
      color,
      fontSize: 34,
      weight: 600,
      singleLine: true,
      radius: 16,
      doubleSided: false,
    });
    b.baseBg = bg;
    b.mesh.userData.onClick = onClick;
    b.mesh.userData.setHover = (h) => {
      if (b._active) return;
      b.setColors({ background: h ? 'rgba(255,255,255,0.16)' : bg });
    };
    layer(b.mesh, LAYER.button);
    this.group.add(b.mesh);
    this.buttons.push(b.mesh);
    return b;
  }

  _refresh() {
    // aktives Preset hervorheben
    for (const b of this._presetBtns) {
      const active = b.min * 60 === this.durationSec;
      b._active = active;
      b.setColors({ background: active ? ACCENT : b.baseBg, color: active ? '#231a0c' : '#eef1f5' });
    }
    this._playBtn.setColors({
      background: this.running ? '#e8b04a' : ACCENT,
      color: '#231a0c',
    });
    this._playBtn.setText(this.running ? '⏸  Pause' : this.remainingSec <= 0 ? '▶  Neu' : '▶  Start');
  }

  setDuration(sec) {
    this.durationSec = Math.max(1, Math.round(sec));
    this.remainingSec = this.durationSec;
    this.running = false;
    this._refresh();
    this._updateDisplay(true);
  }

  toggleRun() {
    if (this.running) {
      this.running = false;
    } else {
      if (this.remainingSec <= 0) this.remainingSec = this.durationSec;
      this.running = true;
      this._resumeAudio();
    }
    this._refresh();
  }

  reset() {
    this.remainingSec = this.durationSec;
    this.running = false;
    this._refresh();
    this._updateDisplay(true);
  }

  _fmt(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  _updateDisplay(force = false) {
    const str = this._fmt(this.remainingSec);
    if (force || str !== this._shownStr) {
      this._shownStr = str;
      const done = this.remainingSec <= 0;
      this.timeLabel.setColors({ color: done ? '#ff9b9b' : '#ffffff' });
      this.timeLabel.setText(str);
    }
    const frac = this.durationSec > 0 ? THREE.MathUtils.clamp(this.remainingSec / this.durationSec, 0, 1) : 0;
    this._fill.scale.x = Math.max(0.0001, frac);
    this._fill.position.x = -this._trackW / 2 + (this._trackW * frac) / 2;
    this._fill.material.color.set(this.remainingSec <= 0 ? 0xff6b6b : frac < 0.2 ? 0xff9b6b : 0xffb454);
  }

  // elapsed = clock.getElapsedTime()
  update(elapsed) {
    const dt = this._last ? Math.min(0.25, elapsed - this._last) : 0;
    this._last = elapsed;
    if (!this.group.visible) return;
    if (this.running) {
      this.remainingSec -= dt;
      if (this.remainingSec <= 0) {
        this.remainingSec = 0;
        this.running = false;
        this._chime();
        this._refresh();
      }
    }
    this._updateDisplay();
  }

  // --- Audio ---
  _resumeAudio() {
    try {
      this._audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this._audio.state === 'suspended') this._audio.resume();
    } catch {
      // Audio ist optional
    }
  }

  _chime() {
    try {
      this._resumeAudio();
      const ctx = this._audio;
      if (!ctx) return;
      const now = ctx.currentTime;
      [0, 0.2, 0.4].forEach((t, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 620 + i * 240;
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.28, now + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(now + t);
        o.stop(now + t + 0.24);
      });
    } catch {
      // ignorieren
    }
  }

  get uiTargets() {
    return this.group.visible ? [this.header.mesh, ...this.buttons] : [];
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
    // etwas seitlich versetzt, damit die Uhr nicht die Karten verdeckt
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const pos = camPos.clone().addScaledVector(dir, 1.5).addScaledVector(side, 0.7);
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
    pos.y = boden + THREE.MathUtils.clamp(camPos.y - boden + 0.15, 1.0, 2.2);
    stelleAn(this.group, this.heimat, this.scene, pos, camPos);
  }

  get breite() {
    return PANEL_W * this.group.scale.x;
  }

  // Die Höhe im Raum — das Anordnen braucht sie, um die Kartenreihen
  // **unter** die Wand zu legen statt davor.
  get hoehe() {
    return PANEL_H * this.group.scale.y;
  }

  stelleAnOrt(weltOrt, camPos) {
    stelleAn(this.group, this.heimat, this.scene, weltOrt, camPos);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  toggle(camera) {
    const show = !this.group.visible;
    this.setVisible(show);
    if (show) this.placeInFront(camera);
    return show;
  }
}

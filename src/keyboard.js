import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { flatLayer, makeRoundedPanel } from './wristMenu.js';

// Texteingabe in XR: virtuelle Tastatur.
//
// Ohne Diktat-Knopf – in der Brille gibt es keine Spracherkennung, siehe die
// Begründung weiter unten bei „Kein Diktat in XR".
//
// Optisch bewusst wie die übrigen Oberflächen („Soft Spatial Minimal"):
// abgerundetes Glas-Panel mit Amber-Rahmen, weich abgerundete Tasten, gleiche
// Farbwelt wie Hand-Menü und Whiteboard-Leiste – vorher war es ein Raster
// harter, dunkelblauer Rechtecke, das aus dem Rest der App herausfiel.

const KEY = 0.052;
const GAP = 0.008;
const PAD = 0.022;
const PREVIEW_H = 0.078;
const ROW_GAP = 0.009;

// Feste Zeichenreihenfolge gegen Transparenz-Flackern (wie Menü/Whiteboard):
// Hintergrund unten, Tasten oben. Über den Menü-Ordnungen (20–23), damit die
// modale Tastatur zuoberst liegt.
const KB_LAYER = { bg: 30, preview: 31, key: 32 };

// Deutsches Layout inklusive Umlauten und der gängigen Satzzeichen.
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', 'ß'],
];
const MAX_COLS = Math.max(...ROWS.map((row) => row.length));

// Wie weit neben einer Taste der Strahl noch ihr gehört. Etwas mehr als die
// Lücke (8–9 mm), damit auch der Rand um die äußeren Tasten zählt; der Platz um
// das Eingabefeld und die Panel-Ecken bleibt frei.
const FANG = 0.012;
// Die schon angezielte Taste behält den Strahl bis 3 mm jenseits der Mitte
// einer Lücke. Ohne diesen Vorsprung kippte ein Strahl, der genau auf der
// Mittellinie ruht, mit jedem Zittern zwischen zwei Tasten hin und her – und
// jedes Kippen gab einen Vibrations-Tick.
const HALTEN = 0.003;

// Angezielte Taste: tritt etwas hervor und bekommt einen kräftigen Rand. Der
// frühere Farbwechsel allein (#2c2933 → #3b3644, Kontrast 1,2 : 1) war in der
// Brille kaum zu sehen.
//
// Sie wächst um feste 2 mm je Seite, nicht um einen Faktor: Die Leertaste ist
// fast fünfmal so breit wie eine Buchstabentaste, und mit 8 % wäre sie um
// 1 cm je Seite gewachsen – über die 8-mm-Lücke hinweg auf ihre Nachbarn.
const HOVER_WACHSEN = 0.002;
const HOVER_LIFT = 0.004;
const HOVER_BORDER_PX = 7;
const BLITZ_MS = 110;

// Farbwelt wie im Hand-Menü
const COLORS = {
  panelFill: 'rgba(24, 22, 28, 0.98)',
  panelBorder: 'rgba(255, 180, 84, 0.45)',
  key: '#2c2933',
  keyHover: '#433d4f',
  previewBg: '#221f28',
  accent: '#ffb454',
  accentHover: '#ffc06f',
  accentText: '#231b10',
  danger: '#3a2830',
  dangerHover: '#4e3540',
  active: '#4a3a24',
  text: '#f0eef2',
  muted: '#8f8a98',
  // Rand der angezielten Taste; auf der Amber-Taste hell statt Amber.
  hoverBorder: '#ffb454',
  hoverBorderOnAccent: '#fff4e3',
  // Aufblitzen beim Drücken
  flash: '#ffb454',
  flashOnAccent: '#fff0d6',
};

// Kurzer Klick beim Tastendruck. Bei Hand-Tracking ist er die einzige
// Bestätigung außer dem Text im Feld – Hände haben keinen Vibrationsmotor.
// Der AudioContext entsteht beim ersten Druck, also aus einer Nutzergeste.
let klickAudio = null;
function klick(akzent = false) {
  try {
    klickAudio ??= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = klickAudio;
    if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {});
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(akzent ? 1700 : 1400, t);
    o.frequency.exponentialRampToValueAtTime(akzent ? 1100 : 850, t + 0.035);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.06);
  } catch {
    // Ton ist optional
  }
}

export class VirtualKeyboard {
  // onStatus: kurze Rückmeldungen nach außen reichen.
  constructor(scene, { onStatus = null } = {}) {
    this.scene = scene;
    this.onStatus = onStatus;
    this.group = new THREE.Group();
    this.group.name = 'virtualKeyboard';
    this.group.visible = false;
    this.keys = [];
    this.letterKeys = [];
    this.text = '';
    this.callbacks = null;
    this.shift = true; // Deutsche Sätze fangen groß an

    const boardW = MAX_COLS * KEY + (MAX_COLS - 1) * GAP + PAD * 2;
    const rowsH = ROWS.length * KEY + ROWS.length * ROW_GAP;
    const boardH = PAD + PREVIEW_H + 0.014 + rowsH + KEY + ROW_GAP + PAD;
    this.boardW = boardW;

    const panel = makeRoundedPanel(boardW, boardH, {
      fill: COLORS.panelFill,
      border: COLORS.panelBorder,
    });
    panel.position.z = -0.004;
    flatLayer(panel, KB_LAYER.bg);
    this.group.add(panel);
    // **Das Panel fängt den Strahl ab.** Ziele waren bisher nur die Tasten. In
    // den Lücken lief der Strahl durch die Tastatur hindurch: Er sprang auf 4 m
    // oder auf eine Karte dahinter, der Trigger griff diese Karte, und mit der
    // Hand begann ein Pinch dort das Ziehen der Welt. Jetzt endet der Strahl auf
    // der Tastatur, und nahe einer Taste zählt diese (interactions.js).
    panel.userData.strahlFang = (weltPunkt) => this._tasteNahe(weltPunkt);
    this.panel = panel;

    // --- Eingabefeld ---
    this.preview = createTextPanel({
      width: boardW - PAD * 2,
      height: PREVIEW_H,
      text: '',
      background: COLORS.previewBg,
      color: COLORS.text,
      border: 'rgba(255, 255, 255, 0.10)',
      fontSize: 34,
      radius: 20,
      padding: 40,
      align: 'left',
      singleLine: true,
      doubleSided: false,
    });
    this.preview.mesh.position.set(0, boardH / 2 - PAD - PREVIEW_H / 2, 0.002);
    flatLayer(this.preview.mesh, KB_LAYER.preview);
    this.group.add(this.preview.mesh);

    // --- Zeichen-Reihen ---
    let y = boardH / 2 - PAD - PREVIEW_H - 0.014 - KEY / 2;
    for (const row of ROWS) {
      const rowW = row.length * KEY + (row.length - 1) * GAP;
      row.forEach((label, i) => {
        const key = this._addKey({
          label,
          x: -rowW / 2 + KEY / 2 + i * (KEY + GAP),
          y,
          width: KEY,
          onClick: () => this._typeKey(key),
        });
        // Nur echte Buchstaben folgen der Umschalttaste. Das ß ist bewusst
        // ausgenommen: sein toUpperCase() ist „SS" – zwei Zeichen auf einer
        // Taste, die dann auch noch zwei Buchstaben schreiben würde.
        const upper = label.toUpperCase();
        if (upper !== label && upper.length === label.length) {
          key.isLetter = true;
          this.letterKeys.push(key);
        }
      });
      y -= KEY + ROW_GAP;
    }

    // --- Funktionsreihe ---
    //
    // Breiten als Anteile, nicht in Metern: Feste Maße müssten bei jeder
    // Änderung an Tastengröße oder Panelbreite nachgezogen werden, und sobald
    // ihre Summe die Innenbreite übersteigt, wird der Zwischenraum negativ und
    // die Tasten schieben sich sichtbar übereinander.
    const inner = boardW - PAD * 2;
    const specs = [
      { id: 'shift', label: 'Aa', flex: 0.09, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'cancel', label: 'Abbrechen', flex: 0.21, bg: COLORS.danger, hover: COLORS.dangerHover },
      { id: 'space', label: 'Leerzeichen', flex: 0.4, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'back', label: '←', flex: 0.09, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'ok', label: '✓ OK', flex: 0.21, bg: COLORS.accent, hover: COLORS.accentHover, fg: COLORS.accentText },
    ];
    const gap = GAP;
    const usable = inner - gap * (specs.length - 1);
    const flexSum = specs.reduce((sum, spec) => sum + spec.flex, 0);
    for (const spec of specs) spec.w = (usable * spec.flex) / flexSum;
    const handlers = {
      shift: () => this._toggleShift(),
      cancel: () => this._cancel(),
      space: () => this._type(' '),
      back: () => this._backspace(),
      ok: () => this._submit(),
    };
    let x = -inner / 2;
    for (const spec of specs) {
      const key = this._addKey({
        label: spec.label,
        x: x + spec.w / 2,
        y,
        width: spec.w,
        bg: spec.bg,
        hover: spec.hover,
        fg: spec.fg ?? COLORS.text,
        fontSize: 24,
        onClick: handlers[spec.id],
      });
      this[`${spec.id}Key`] = key;
      x += spec.w + gap;
    }

    this._applyShiftLabels();
    this._updatePreview();
    scene.add(this.group);
  }

  _addKey({ label, x, y, width, onClick, bg = COLORS.key, hover = COLORS.keyHover, fg = COLORS.text, fontSize = 30 }) {
    const panel = createTextPanel({
      width,
      height: KEY,
      text: label,
      background: bg,
      color: fg,
      fontSize,
      weight: 600,
      radius: 18,
      padding: 14,
      singleLine: true,
      doubleSided: false,
    });
    panel.mesh.position.set(x, y, 0.002);
    flatLayer(panel.mesh, KB_LAYER.key);
    const key = {
      mesh: panel.mesh,
      panel,
      label,
      bg,
      hover,
      fg,
      isLetter: false,
      x,
      y,
      width,
      hovered: false,
      blitz: false,
      blitzTimer: 0,
      akzent: bg === COLORS.accent,
    };
    panel.mesh.userData.onClick = () => {
      this._blitze(key);
      klick(key.akzent);
      onClick();
    };
    panel.mesh.userData.setHover = (hovered) => {
      key.hovered = hovered;
      if (hovered) panel.mesh.scale.set(1 + (2 * HOVER_WACHSEN) / width, 1 + (2 * HOVER_WACHSEN) / KEY, 1);
      else panel.mesh.scale.set(1, 1, 1);
      panel.mesh.position.z = hovered ? 0.002 + HOVER_LIFT : 0.002;
      this._zeichneTaste(key);
    };
    this.group.add(panel.mesh);
    this.keys.push(key);
    return key;
  }

  // Alle Zustände einer Taste in einem Zug zeichnen: Grundfarbe, angezielt,
  // Aufblitzen. Einzeln gesetzt überschrieb sonst etwa die Umschalttaste beim
  // Umfärben die Hervorhebung, unter der der Strahl gerade steht.
  _zeichneTaste(key) {
    const rand = key.akzent ? COLORS.hoverBorderOnAccent : COLORS.hoverBorder;
    if (key.blitz) {
      key.panel.setColors({
        background: key.akzent ? COLORS.flashOnAccent : COLORS.flash,
        color: COLORS.accentText,
        border: rand,
        borderWidth: HOVER_BORDER_PX,
      });
      return;
    }
    key.panel.setColors({
      background: key.hovered ? key.hover : key.bg,
      color: key.fg,
      border: key.hovered ? rand : null,
      borderWidth: HOVER_BORDER_PX,
    });
  }

  // Kurz in Amber aufleuchten – sichtbar, dass genau diese Taste ausgelöst hat.
  _blitze(key) {
    key.blitz = true;
    this._zeichneTaste(key);
    clearTimeout(key.blitzTimer);
    key.blitzTimer = setTimeout(() => {
      key.blitz = false;
      this._zeichneTaste(key);
    }, BLITZ_MS);
  }

  // Die Taste, der ein Punkt auf dem Panel gehört: die nächste, sofern er
  // höchstens FANG neben ihrem Rand liegt. Sonst keine – der Strahl endet dann
  // auf dem Panel, ohne etwas auszulösen.
  _tasteNahe(weltPunkt) {
    const p = this.group.worldToLocal(weltPunkt.clone());
    let beste = null;
    let abstand = FANG;
    for (const key of this.keys) {
      const dx = Math.max(Math.abs(p.x - key.x) - key.width / 2, 0);
      const dy = Math.max(Math.abs(p.y - key.y) - KEY / 2, 0);
      const d = Math.hypot(dx, dy) - (key.hovered ? HALTEN : 0);
      if (d <= abstand) {
        abstand = d;
        beste = key;
      }
    }
    return beste?.mesh ?? null;
  }

  // Farben einer Taste dauerhaft ändern (z. B. aktive Umschalttaste)
  _setKeyColors(key, { bg, hover, fg }) {
    key.bg = bg ?? key.bg;
    key.hover = hover ?? key.hover;
    key.fg = fg ?? key.fg;
    this._zeichneTaste(key);
  }

  get offen() {
    return this.group.visible;
  }

  // Tasten zuerst: Liegt der Strahl auf einer Taste, trifft er sie vor dem
  // Panel dahinter (z = 0,002 gegen −0,004) und braucht den Umweg nicht.
  get uiTargets() {
    return this.group.visible ? [...this.keys.map((key) => key.mesh), this.panel] : [];
  }

  // --- Umschalttaste ---

  _toggleShift() {
    this.shift = !this.shift;
    this._applyShiftLabels();
  }

  _applyShiftLabels() {
    for (const key of this.letterKeys) {
      const label = this.shift ? key.label.toUpperCase() : key.label;
      key.panel.setText(label);
    }
    if (this.shiftKey) {
      this._setKeyColors(this.shiftKey, {
        bg: this.shift ? COLORS.active : COLORS.key,
        hover: this.shift ? COLORS.active : COLORS.keyHover,
        fg: this.shift ? COLORS.accent : COLORS.text,
      });
    }
  }

  _typeKey(key) {
    const char = this.shift && key.isLetter ? key.label.toUpperCase() : key.label;
    this._type(char);
    // Umschalten gilt für genau ein Zeichen – wie auf dem Handy.
    if (this.shift && key.isLetter) {
      this.shift = false;
      this._applyShiftLabels();
    }
  }

  // Kein Diktat in XR.
  //
  // Hier saß eine „🎤 Sprechen"-Taste. Sie ist raus, weil es in der Brille
  // nichts gibt, worauf sie sich stützen könnte: Der Quest-Browser meldet zwar
  // `webkitSpeechRecognition`, hat darunter aber keinen Erkennungsdienst – der
  // Aufruf riss den Browser mit. Der Umweg über die Systemtastatur der Brille
  // (deren Mikrofon-Taste diktieren kann) hat auf echter Hardware ebenfalls
  // nicht getragen.
  //
  // Diktiert wird deshalb nur noch am Desktop, über „🎤 Diktieren" im Overlay
  // (Chrome/Edge, siehe main.js). In XR ist Tippen der Weg.

  // Ein längerer Satz passt schnell nicht mehr ins Feld. Statt die Schrift immer
  // weiter zu schrumpfen (singleLine tut das von sich aus) wird vorn gekürzt –
  // das Ende mit der Schreibmarke bleibt sichtbar, wie in einem echten Feld.
  _fit(text) {
    const MAX = 46;
    const shown = text.length > MAX ? `…${text.slice(-MAX)}` : text;
    return `${shown}▏`;
  }

  // --- Öffnen/Schließen ---

  open(camera, callbacks) {
    this.callbacks = callbacks;
    this.text = '';
    this.shift = true;
    this._applyShiftLabels();
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
    this.preview.setText(this.text ? this._fit(this.text) : 'Text eingeben…▏');
    this.preview.setColors({ color: this.text ? COLORS.text : COLORS.muted });
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
    const finalText = this.text.trim();
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

import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { flatLayer, makeRoundedPanel } from './wristMenu.js';
import {
  SPEECH_DEAD_ENDS,
  isSpeechAvailable,
  recognizeSpeech,
  speechUnavailableReason,
} from './speech.js';

// Texteingabe in XR: virtuelle Tastatur mit Diktat-Knopf.
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

// Farbwelt wie im Hand-Menü
const COLORS = {
  panelFill: 'rgba(24, 22, 28, 0.98)',
  panelBorder: 'rgba(255, 180, 84, 0.45)',
  key: '#2c2933',
  keyHover: '#3b3644',
  previewBg: '#221f28',
  accent: '#ffb454',
  accentHover: '#ffc06f',
  accentText: '#231b10',
  danger: '#3a2830',
  dangerHover: '#4e3540',
  mic: '#2b3340',
  micHover: '#3a4557',
  listening: '#7dd3fc',
  active: '#4a3a24',
  text: '#f0eef2',
  muted: '#8f8a98',
};

export class VirtualKeyboard {
  // onStatus: kurze Rückmeldungen (Mikrofon-Status, Fehler) nach außen reichen.
  // systemKeyboard: SystemKeyboardBridge – der Diktierweg auf der Quest, wo es
  // keine Web Speech API gibt.
  constructor(scene, { onStatus = null, systemKeyboard = null } = {}) {
    this.scene = scene;
    this.onStatus = onStatus;
    this.systemKeyboard = systemKeyboard;
    this.group = new THREE.Group();
    this.group.name = 'virtualKeyboard';
    this.group.visible = false;
    this.keys = [];
    this.letterKeys = [];
    this.text = '';
    this.callbacks = null;
    this.shift = true; // Deutsche Sätze fangen groß an
    this.listening = false;
    this._dictationAbort = null;

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
      { id: 'shift', label: 'Aa', flex: 0.08, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'cancel', label: 'Abbrechen', flex: 0.185, bg: COLORS.danger, hover: COLORS.dangerHover },
      { id: 'mic', label: '🎤 Sprechen', flex: 0.215, bg: COLORS.mic, hover: COLORS.micHover },
      { id: 'space', label: 'Leerzeichen', flex: 0.245, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'back', label: '←', flex: 0.09, bg: COLORS.key, hover: COLORS.keyHover },
      { id: 'ok', label: '✓ OK', flex: 0.185, bg: COLORS.accent, hover: COLORS.accentHover, fg: COLORS.accentText },
    ];
    const gap = GAP;
    const usable = inner - gap * (specs.length - 1);
    const flexSum = specs.reduce((sum, spec) => sum + spec.flex, 0);
    for (const spec of specs) spec.w = (usable * spec.flex) / flexSum;
    const handlers = {
      shift: () => this._toggleShift(),
      cancel: () => this._cancel(),
      mic: () => this.toggleDictation(),
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
    const key = { mesh: panel.mesh, panel, label, bg, hover, fg, isLetter: false };
    panel.mesh.userData.onClick = onClick;
    panel.mesh.userData.setHover = (hovered) =>
      panel.setColors({ background: hovered ? key.hover : key.bg });
    this.group.add(panel.mesh);
    this.keys.push(key);
    return key;
  }

  // Farben einer Taste dauerhaft ändern (aktive Umschalttaste, laufendes Diktat)
  _setKeyColors(key, { bg, hover, fg }) {
    key.bg = bg ?? key.bg;
    key.hover = hover ?? key.hover;
    key.fg = fg ?? key.fg;
    key.panel.setColors({ background: key.bg, color: key.fg });
  }

  get uiTargets() {
    return this.group.visible ? this.keys.map((key) => key.mesh) : [];
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

  // --- Diktat ---

  // Der eigentliche Punkt des Ganzen: Wer nicht tippen will, drückt hier und
  // spricht.
  //
  // Es gibt zwei Wege, und welcher zieht, hängt vom Gerät ab:
  //   1. Web Speech API – Desktop-Chrome/Edge. Erkennt direkt im Browser.
  //   2. Systemtastatur der Brille – der Quest-Browser kennt SpeechRecognition
  //      nicht, die Brille selbst aber sehr wohl. Ihre Systemtastatur hat eine
  //      Mikrofon-Taste, und über die läuft dort das Diktat.
  // Meldet Weg 1, dass er in diesem Browser nichts wird (siehe
  // SPEECH_DEAD_ENDS), wird ohne Zutun auf Weg 2 gewechselt.
  async toggleDictation() {
    if (this.listening) {
      this._dictationAbort?.abort();
      return;
    }
    if (isSpeechAvailable()) {
      const deadEnd = await this._webSpeechDictation();
      if (!deadEnd) return;
      if (!this.systemKeyboard?.available) return;
    }
    if (this.systemKeyboard?.available) {
      await this._systemDictation();
      return;
    }
    this.onStatus?.(speechUnavailableReason() ?? this.systemKeyboard?.unavailableReason ?? '');
  }

  // Liefert true, wenn die Spracherkennung in diesem Browser als aussichtslos
  // gilt und der Aufrufer den anderen Weg probieren soll.
  async _webSpeechDictation() {
    const controller = new AbortController();
    this._dictationAbort = controller;
    this._setListening(true);
    this.onStatus?.('🎤 Sprich jetzt…');
    try {
      const text = await recognizeSpeech({
        signal: controller.signal,
        onPartial: (partial) => this._showPartial(partial),
        onReady: () => this._setListening(true, 'Hört zu…'),
      });
      this.text = this.text ? `${this.text.trimEnd()} ${text}` : text;
      this.onStatus?.('');
      return false;
    } catch (err) {
      const deadEnd = SPEECH_DEAD_ENDS.has(err.code);
      // Bei einem Wechsel auf die Systemtastatur die Fehlermeldung
      // unterdrücken – der zweite Weg meldet sich gleich selbst.
      if (!deadEnd || !this.systemKeyboard?.available) this.onStatus?.(err.message);
      return deadEnd;
    } finally {
      this._dictationAbort = null;
      this._setListening(false);
      this._updatePreview();
    }
  }

  // Diktat über die Systemtastatur der Brille.
  //
  // Solange sie oben liegt, steht die XR-Sitzung auf „visible-blurred" und
  // nimmt keine Controller-Eingaben an – unsere „Abbrechen"-Taste ist in dieser
  // Zeit also nicht erreichbar. Beendet wird über die Systemtastatur selbst;
  // danach steht der Text im Vorschaufeld und kann hier weiterbearbeitet werden.
  async _systemDictation() {
    this._setListening(true, '⌨️ Systemtastatur');
    this.onStatus?.('Systemtastatur offen – 🎤 antippen und sprechen, dann schließen.', 0);
    try {
      const text = await this.systemKeyboard.request({
        onPartial: (partial) => this._showPartial(partial),
        onOpen: () => this.onStatus?.('🎤-Taste der Systemtastatur antippen und sprechen.', 0),
        onSilent: () =>
          this.onStatus?.('Systemtastatur meldet sich nicht – notfalls hier tippen.', 6000),
      });
      if (text) {
        this.text = this.text ? `${this.text.trimEnd()} ${text}` : text;
        this.onStatus?.('Diktat übernommen.');
      } else {
        this.onStatus?.('');
      }
    } catch (err) {
      this.onStatus?.(err.message, 6000);
    } finally {
      this._setListening(false);
      this._updatePreview();
    }
  }

  _setListening(listening, label = '🎙 Hört zu…') {
    this.listening = listening;
    if (!this.micKey) return;
    this.micKey.panel.setText(listening ? label : '🎤 Sprechen');
    this._setKeyColors(this.micKey, {
      bg: listening ? COLORS.listening : COLORS.mic,
      hover: listening ? COLORS.listening : COLORS.micHover,
      fg: listening ? COLORS.accentText : COLORS.text,
    });
  }

  // Zwischenergebnis nur anzeigen, nicht übernehmen – erst das Endergebnis
  // landet im Text.
  _showPartial(partial) {
    const combined = this.text ? `${this.text.trimEnd()} ${partial}` : partial;
    this.preview.setText(this._fit(combined));
    this.preview.setColors({ color: COLORS.text });
  }

  // Ein diktierter Satz ist schnell länger als das Feld. Statt die Schrift immer
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
    this._setListening(false);
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
    this._dictationAbort?.abort();
    this.group.visible = false;
    callbacks?.onCancel?.();
  }

  _updatePreview() {
    this.preview.setText(this.text ? this._fit(this.text) : 'Sprechen oder tippen…▏');
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

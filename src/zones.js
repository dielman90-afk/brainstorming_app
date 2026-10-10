import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { wechsleHeimat, poseInHeimat, stelleAn } from './heimat.js';

// Räumliche Zonen: beschriftete, halbtransparente Flächen, die Karten
// **enthalten** (z. B. „To Do / Doing / Done"). Eine Karte, die man hineinzieht,
// rastet im Raster ein und wandert mit, wenn man die Zone verschiebt, dreht
// oder skaliert. Greifbar, skalierbar, umbenennbar, farbig und löschbar.
// Persistiert im Board-JSON samt Mitgliedschaft.
//
// **Warum Container statt Rahmen.** Bis hierher war eine Zone ein Bild ohne
// Funktion: Wer sie verschob, ließ ihre Karten stehen, und „gehört dazu" hieß
// nur „liegt gerade davor". Der Nutzer fand sie deshalb überflüssig.

const WIDTH = 1.5;
// Grundhöhe. Reicht sie für das Raster nicht, wächst die Zone nach unten —
// die Oberkante mit Kopfzeile und Knöpfen bleibt, wo sie ist.
const HEIGHT = 1.05;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
// Canvas-Pixel je Meter der Hintergrundfläche.
const PX = 640;

// Das Raster, in Zonenmaß (skaliert also mit der Zone). Mit 5,5 cm Rand und
// 3,5 cm Luft passen genau vier Ideenkarten (0,32 m) nebeneinander — bei den
// runden 6/4 cm wären es drei, und das letzte Drittel der Fläche bliebe leer.
const RAND = 0.055;
const LUECKE = 0.035;
// Karten liegen knapp **vor** der Fläche: weit genug gegen Z-Fighting mit dem
// Panel, nah genug, dass sie auf ihr zu liegen scheinen.
const KARTEN_Z = 0.025;

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

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _auge = new THREE.Vector3();
const _mitte = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _lp = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _ls = new THREE.Vector3();
const _OBEN = new THREE.Vector3(0, 1, 0);

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

// Zwei Lagen gelten als gleich, wenn kein Eintrag um mehr als das abweicht. Auf
// dem Planeten rechnet die Lage einer gegriffenen Zone über zwei Weltmatrizen,
// und deren Rundungsrauschen soll nicht jedes Bild ein Neulegen auslösen.
function nahGleich(a, b) {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a.elements[i] - b.elements[i]) > 1e-7) return false;
  }
  return true;
}

class Zone {
  constructor(manager, { title = 'Zone', colorIndex = 0, auto = false } = {}) {
    this.manager = manager;
    this.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    this.title = title;
    this.colorIndex = colorIndex % ZONE_COLORS.length;
    this.scale = 1;
    // Von „Cluster" angelegt: Solche Zonen verschwinden, sobald sie leer sind;
    // von Hand angelegte bleiben auch leer stehen.
    this.auto = auto;
    // Karten-IDs der Mitglieder; die Reihenfolge ist die Rasterreihenfolge.
    this.karten = [];
    // Aktuelle Höhe in Zonenmaß (≥ HEIGHT), siehe `_setzeHoehe`.
    this.hoeheLokal = HEIGHT;
    // Stand des letzten Legens: Lage in der Heimat, Mitglieder, deren Maße.
    // `update()` vergleicht dagegen und legt nur neu, wenn sich etwas tat.
    this._lage = null;
    this._mitglieder = [];
    this._masse = [];
    this._schmutzig = false;
    this._hervor = false;
    this._kopfText = title;
    this.group = new THREE.Group();
    // Inhalt, nicht Umgebung — siehe `nichtUmgebung` in tools/measure.mjs.
    this.group.userData.nichtUmgebung = true;
    this.group.name = 'zone';
    this.buttons = [];
    this._buttonPanels = [];

    // Hintergrundfläche (neu einfärbbar)
    this._canvas = document.createElement('canvas');
    this._canvas.width = Math.round(WIDTH * PX);
    this._canvas.height = Math.round(HEIGHT * PX);
    this._ctx = this._canvas.getContext('2d');
    this._tex = this._neueTextur();
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
      this._buttonPanels.push(b);
      return b.mesh;
    };
    const bx = WIDTH / 2 - 0.06;
    const by = HEIGHT / 2 + 0.085;
    mkBtn('✎', () => this.manager.onRename?.(this)).position.set(bx - 0.24, by, 0.006);
    mkBtn('🎨', () => {
      this.setColor(this.colorIndex + 1);
      this.manager.onChange?.('Zonenfarbe');
    }).position.set(bx - 0.12, by, 0.006);
    // Löschen lässt die Karten stehen, wo sie sind — die Zone ist der Behälter,
    // nicht der Besitzer.
    mkBtn('✕', () => this.manager.removeZone(this)).position.set(bx, by, 0.006);

    this._redraw();
  }

  _neueTextur() {
    const tex = new THREE.CanvasTexture(this._canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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
    // Hervorgehoben (eine gezogene Karte schwebt darüber): Fläche doppelt
    // gedeckt und durchgezogener, dickerer Rand — „hier landet sie".
    if (this._hervor) ctx.fill();
    ctx.lineWidth = this._hervor ? 10 : 6;
    ctx.strokeStyle = c.border;
    ctx.setLineDash(this._hervor ? [] : [26, 16]);
    ctx.stroke();
    ctx.setLineDash([]);
    this._tex.needsUpdate = true;
  }

  // **Die Höhe ändern, ohne die Umrandung zu verzerren.**
  //
  // Die Fläche zu skalieren wäre billiger, zöge aber Strichelung und
  // Eckenradius mit in die Länge. Deshalb neue Geometrie und eine Leinwand im
  // passenden Seitenverhältnis. Die Textur wird neu angelegt: Auf der GPU
  // behält sie die Größe ihres ersten Hochladens.
  _setzeHoehe(h) {
    if (Math.abs(h - this.hoeheLokal) < 1e-6) return;
    this.hoeheLokal = h;
    this.panel.geometry.dispose();
    this.panel.geometry = new THREE.PlaneGeometry(WIDTH, h);
    // Oberkante fest: Die Mitte rutscht um die halbe Mehrhöhe nach unten.
    this.panel.position.y = HEIGHT / 2 - h / 2;
    this._canvas.height = Math.round(h * PX);
    this._tex.dispose();
    this._tex = this._neueTextur();
    this.panel.material.map = this._tex;
    this.panel.material.needsUpdate = true;
    this._redraw();
  }

  setHervorgehoben(an) {
    if (this._hervor === an) return;
    this._hervor = an;
    this._redraw();
  }

  // Kopfzeile = Titel plus Kartenzahl. `title` bleibt der reine Titel — er wird
  // umbenannt und gespeichert, die Zahl ist nur Anzeige.
  _beschrifte() {
    const n = this.karten.length;
    const text = n ? `${this.title} · ${n}` : this.title;
    if (text === this._kopfText) return;
    this._kopfText = text;
    this.header.setText(text);
  }

  // Was die Kopfzeile gerade zeigt (für Tests und Statusmeldungen).
  get kopfzeile() {
    return this._kopfText;
  }

  setTitle(title) {
    this.title = title;
    this._kopfText = null; // erzwingt das Neuzeichnen
    this._beschrifte();
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
    // Umrechnung in die Heimat und Drehung zum Nutzer stehen zusammen in
    // `stelleAn` (heimat.js) — samt der Begründung, warum beides zusammengehört.
    stelleAn(this.group, m.heimat, m.scene, pos, camPos);
  }

  // An einen gerechneten Weltort stellen statt vor den Nutzer — für das
  // Anordnen. Dieselbe Rechnung, anderer Ort.
  stelleAnOrt(weltOrt, camPos) {
    const m = this.manager;
    stelleAn(this.group, m.heimat, m.scene, weltOrt, camPos);
  }

  get uiTargets() {
    return [this.header.mesh, ...this.buttons];
  }

  // Die Breite im Raum, für das Anordnen nebeneinander.
  get breite() {
    return WIDTH * this.scale;
  }

  // Die Höhe im Raum, mit dem Zuwachs durch das Raster.
  get hoehe() {
    return this.hoeheLokal * this.scale;
  }

  // Wie weit die Unterkante unter dem Ursprung der Gruppe liegt. Das Anordnen
  // legt die freien Kartenreihen darunter; bei Tafel und Uhr ist das die halbe
  // Höhe, bei einer gewachsenen Zone mehr, weil sie nur nach unten wächst.
  get unterkante() {
    return (this.hoeheLokal - HEIGHT / 2) * this.scale;
  }

  // **Liegt dieser Weltpunkt vor der Zone?**
  //
  // Das ist die Frage beim Ablegen einer Karte — und beim Laden eines alten
  // Boards ohne gespeicherte Mitgliedschaft, wo sie einmalig über Nähe
  // abgeleitet wird.
  //
  // Der Test läuft im Koordinatensystem der Zone; `worldToLocal` rechnet die
  // Skalierung dabei heraus, verglichen wird also gegen das Sollmaß. Nach vorn
  // ist der Streifen großzügiger als nach hinten: Karten legt man **vor** eine
  // Zone, nicht dahinter. Die Weltmatrix muss aktuell sein.
  umfasst(weltPunkt) {
    const l = this.group.worldToLocal(_l.copy(weltPunkt));
    return (
      Math.abs(l.x) <= WIDTH / 2 &&
      l.y <= HEIGHT / 2 &&
      l.y >= HEIGHT / 2 - this.hoeheLokal &&
      l.z >= -0.25 &&
      l.z <= 0.6
    );
  }

  dispose() {
    this.group.removeFromParent();
    this._tex.dispose();
    this.panel.geometry.dispose();
    this.panel.material.dispose();
    // Kopf und Knöpfe haben eigene Leinwände. Seit „Cluster" bei jedem Lauf
    // Zonen anlegt und leere wieder entfernt, summierte sich das sonst.
    this.header.dispose();
    for (const b of this._buttonPanels) b.dispose();
  }

  toJSON() {
    const m = this.manager;
    return {
      id: this.id,
      title: this.title,
      colorIndex: this.colorIndex,
      scale: this.scale,
      ...(this.auto ? { auto: true } : {}),
      karten: [...this.karten],
      // `frame` ist reine Auskunft für den Leser der Datei; gelesen wird immer
      // relativ zu der Heimat, die beim Laden gerade gilt. Die Begründung steht
      // bei `poseInHeimat` in heimat.js.
      ...(m.heimat !== m.scene ? { frame: 'planet' } : {}),
      ...poseInHeimat(m.heimat, m.scene, this.group),
    };
  }
}

export class ZoneManager {
  // `karten`: liefert die aktuelle Kartenliste. Zonen speichern nur IDs — die
  // Karten selbst gehören dem CardManager.
  constructor(scene, { floorY = () => 0, karten = () => [] } = {}) {
    this.scene = scene;
    // Die Bodenhöhe unter dem Nutzer; `Zone.placeInFront` fragt sie über den
    // Verwalter ab. Vorgabe null, damit ohne Angabe alles bleibt, wie es war.
    this.floorY = floorY;
    this.alleKarten = karten;
    // **Zonen gehören zur Welt, nicht zum Nutzer.** Wenn die Karten mit dem
    // Planeten wandern und die Zone vor dem Nutzer stehen bleibt, ist die
    // Gruppierung nach zwanzig Schritten aufgelöst. Sie bekommen deshalb
    // dieselbe Heimat wie die Karten.
    this.heimat = scene;
    this.zones = [];
    this.onRename = null; // (zone) => void  – von main.js gesetzt
    // (label) => void – meldet Änderungen an den Undo-Verlauf
    this.onChange = null;
    // (karte) => bool – zieht die Maus diese Karte gerade? Ein Zug am Desktop
    // hängt die Karte nicht um, das sieht man ihr also nicht an. Von main.js
    // gesetzt, sobald es die Interaktion gibt.
    this.wirdGezogen = () => false;
    // (out) => Vector3|null – wo das Auge des Nutzers steht. Von main.js
    // gesetzt (nur am Desktop); ohne Angabe zählt beim Ablegen nur die Nähe
    // zur Fläche.
    this.auge = () => null;
  }

  addZone({ title, colorIndex, position, quaternion, scale, auto } = {}) {
    const zone = new Zone(this, { title, colorIndex, auto: auto === true });
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
    // Die Karten wechseln gleichzeitig mit (main.js meldet beiden dieselbe
    // Heimat). Die Lage der Zone in der neuen Heimat ist eine andere Zahl —
    // `update()` legt daraufhin einmal neu, auf dieselben Weltorte.
    wechsleHeimat(alt, neu, this.zones.map((z) => z.group));
  }

  // `melden: false` beim Laden und für „Cluster": Dort sichert der Aufrufer
  // selbst — ein Schritt je entfernter Zone hielte einen halben Zustand fest.
  removeZone(zone, { melden = true } = {}) {
    zone.dispose();
    this.zones = this.zones.filter((z) => z !== zone);
    if (melden) this.onChange?.('Zone entfernt');
  }

  clear() {
    for (const zone of [...this.zones]) this.removeZone(zone, { melden: false });
  }

  get uiTargets() {
    return this.zones.flatMap((z) => z.uiTargets);
  }

  // --- Mitgliedschaft -------------------------------------------------------

  zoneVon(karte) {
    return this.zones.find((z) => z.karten.includes(karte.id)) ?? null;
  }

  // Hängt die Karte gerade an einer Hand oder an der Maus? Dann gehört ihre
  // Lage dem Nutzer, nicht dem Raster.
  _gegriffen(karte) {
    return karte.group.parent !== this.heimat || this.wirdGezogen(karte);
  }

  // Die Zone, in der dieser Weltpunkt liegt. **Die nächste, nicht die erste:**
  // Zwei Zonen können sich überlappen — sonst bekäme die zuerst angelegte alle
  // Karten, auch die, die sichtbar vor der anderen liegen. Gemessen wird zur
  // Mitte der Fläche, nicht zum Ursprung, denn eine gewachsene Zone reicht weit
  // unter ihren Ursprung.
  _zoneAm(weltPunkt, auge = null) {
    return this._trefferAm(weltPunkt, auge)?.zone ?? null;
  }

  // **Wo trifft eine Karte eine Zone – auch aus Sicht des Nutzers?**
  //
  // Zuerst die Nähe: Liegt der Punkt vor einer Zone (`umfasst`), gilt die
  // nächste davon. Das allein reichte nicht. Der Mauszug hält eine Karte auf
  // einer Ebene durch ihren Startpunkt, ihre Tiefe ändert er nie – neue Karten
  // stehen 1,15 m vor dem Nutzer, eine neue Zone 2,4 m. Gemessen lag die Karte
  // nach einem Zug auf die Zonenmitte 1,24 m vor der Fläche; `umfasst` erlaubt
  // 0,6, und die Karte blieb draußen. Der Grundablauf „Karte in die Zone
  // ziehen" ging am Desktop also nicht.
  //
  // Deshalb die zweite Frage, wenn ein Augenpunkt bekannt ist: Trifft der
  // Strahl vom Auge durch die Karte die Zonenfläche? Was der Nutzer über einer
  // Zone loslässt, gehört hinein. Die Stelle im Raster folgt dem Treffpunkt
  // auf der Fläche, nicht der Kartenmitte. Bei mehreren Zonen gewinnt die,
  // die der Strahl zuerst trifft.
  //
  // Rückgabe `{ zone, lokal }` (lokal: Punkt in den Koordinaten der Zone)
  // oder null.
  _trefferAm(weltPunkt, auge = null) {
    let beste = null;
    let naechste = Infinity;
    for (const z of this.zones) {
      z.group.updateWorldMatrix(true, false);
      if (!z.umfasst(weltPunkt)) continue;
      const d = z.panel.getWorldPosition(_mitte).distanceToSquared(weltPunkt);
      if (d < naechste) {
        naechste = d;
        beste = z;
      }
    }
    if (beste) return { zone: beste, lokal: beste.group.worldToLocal(weltPunkt.clone()) };
    if (!auge) return null;
    let treffer = null;
    let tMin = Infinity;
    for (const z of this.zones) {
      const a = z.group.worldToLocal(_a.copy(auge));
      const b = z.group.worldToLocal(_b.copy(weltPunkt));
      // Das Auge muss vor der Fläche stehen und der Strahl auf sie zulaufen;
      // von hinten durch eine Zone hindurch wird nichts abgelegt.
      if (a.z <= 0 || b.z >= a.z) continue;
      const t = a.z / (a.z - b.z);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (Math.abs(x) > WIDTH / 2 || y > HEIGHT / 2 || y < HEIGHT / 2 - z.hoeheLokal) continue;
      if (t < tMin) {
        tMin = t;
        treffer = { zone: z, lokal: new THREE.Vector3(x, y, 0) };
      }
    }
    return treffer;
  }

  // **Eine Karte wurde losgelassen.** Liegt sie vor einer Zone, wird sie deren
  // Mitglied (und verlässt eine andere); liegt sie vor keiner, verlässt sie
  // ihre bisherige. Prozessknoten können nicht Mitglied werden: Ihre Lage
  // gehört dem Flussdiagramm.
  //
  // Eingefügt wird an der Rasterstelle, die dem Ablageort am nächsten liegt —
  // so sortiert man innerhalb einer Zone um, indem man eine Karte auf einen
  // anderen Platz zieht.
  //
  // Rückgabe: `null`, wenn die Mitgliedschaft gleich blieb, sonst
  // `{ zone, vorher }` (`zone` null = herausgenommen).
  karteAbgelegt(karte) {
    const vorher = this.zoneVon(karte);
    karte.group.getWorldPosition(_p);
    const treffer = karte.flowType ? null : this._trefferAm(_p, this.auge(_auge));
    const ziel = treffer?.zone ?? null;
    if (vorher) vorher.karten = vorher.karten.filter((id) => id !== karte.id);
    if (ziel) {
      const lokal = treffer.lokal;
      const mitglieder = [...this._mitgliederVon(ziel), karte];
      const raster = this._raster(ziel, mitglieder);
      let stelle = mitglieder.length - 1;
      let beste = Infinity;
      for (let i = 0; i < mitglieder.length; i++) {
        const s = raster.platz(i);
        const d = (s.x - lokal.x) ** 2 + (s.y - lokal.y) ** 2;
        if (d < beste) {
          beste = d;
          stelle = i;
        }
      }
      ziel.karten.splice(stelle, 0, karte.id);
      this._lege(ziel);
    }
    if (vorher && vorher !== ziel) this._lege(vorher);
    return vorher === ziel ? null : { zone: ziel, vorher };
  }

  // **Eine Karte wurde gelöscht.** Neu gelegt wird erst im nächsten
  // `update()`, nicht sofort: Beim Rückgängigmachen und beim Import löscht
  // `applyState` Karten, **nachdem** es die übrigen auf ihre gespeicherten
  // Plätze gestellt hat. Ein sofortiges Neulegen der alten Zone schöbe die
  // eben wiederhergestellten Karten weg, bevor `loadJSON` die Zonen ersetzt.
  karteEntfernt(karte) {
    const zone = this.zoneVon(karte);
    if (!zone) return;
    zone.karten = zone.karten.filter((id) => id !== karte.id);
    zone._schmutzig = true;
  }

  // Karten in eine Zone aufnehmen (hinten anhängen), aus anderen Zonen heraus.
  // Für „Cluster"; gelegt wird hier noch nicht, das macht der Aufrufer einmal
  // für alle betroffenen Zonen.
  nimmAuf(zone, karten) {
    for (const karte of karten) {
      if (karte.flowType) continue;
      const vorher = this.zoneVon(karte);
      if (vorher === zone) continue;
      if (vorher) {
        vorher.karten = vorher.karten.filter((id) => id !== karte.id);
        vorher._schmutzig = true;
      }
      zone.karten.push(karte.id);
    }
    zone._schmutzig = true;
  }

  // Leere Zonen, die „Cluster" angelegt hat, wieder abräumen. Von Hand
  // angelegte bleiben stehen — die hat jemand mit Absicht hingestellt.
  entferneLeereAuto() {
    for (const zone of [...this.zones]) {
      if (zone.auto && !zone.karten.length) this.removeZone(zone, { melden: false });
    }
  }

  // **Zonen als flache Wand vor den Nutzer stellen**, für „Cluster".
  //
  // Nicht als Bogen wie beim Anordnen: Alle Zonen bekommen dieselbe Normale
  // (waagerecht gegen die Blickrichtung) und stehen Kante an Kante. Dann liest
  // sich das Ergebnis wie eine Pinnwand mit Spalten, und die Ränder der
  // Nachbarn laufen nicht schräg ineinander.
  stelleInReihe(zonen, camera, { abstand = 2.4, luecke = 0.15 } = {}) {
    if (!zonen.length) return;
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const blick = camera.getWorldDirection(new THREE.Vector3());
    blick.y = 0;
    if (blick.lengthSq() < 1e-6) blick.set(0, 0, -1);
    blick.normalize();
    const rechts = new THREE.Vector3().crossVectors(blick, _OBEN).normalize();
    const mitte = camPos.clone().addScaledVector(blick, abstand);
    // Höhe wie bei `placeInFront`: ab dem Boden gemessen, nicht ab y = 0.
    const boden = this.floorY();
    mitte.y = boden + THREE.MathUtils.clamp(camPos.y - boden, 1.0, 2.2);
    const gesamt = zonen.reduce((s, z) => s + z.breite, 0) + luecke * (zonen.length - 1);
    let x = -gesamt / 2;
    for (const zone of zonen) {
      const ort = mitte.clone().addScaledVector(rechts, x + zone.breite / 2);
      // Blickziel ist ein Punkt genau vor der eigenen Mitte, nicht der Nutzer —
      // sonst drehte sich jede Zone einzeln zu ihm, und aus der Wand würde
      // wieder ein Bogen.
      stelleAn(zone.group, this.heimat, this.scene, ort, ort.clone().sub(blick));
      x += zone.breite + luecke;
    }
  }

  // --- Raster ---------------------------------------------------------------

  // Die Mitglieder als Karten. IDs ohne Karte (gelöscht) und Prozessknoten
  // (Form gewechselt) fallen dabei aus der Mitgliedschaft heraus.
  _mitgliederVon(zone) {
    const nachId = new Map(this.alleKarten().map((k) => [k.id, k]));
    const karten = [];
    for (const id of zone.karten) {
      const k = nachId.get(id);
      if (k && !k.flowType) karten.push(k);
    }
    if (karten.length !== zone.karten.length) zone.karten = karten.map((k) => k.id);
    return karten;
  }

  // Spalten, Zellmaß und benötigte Höhe, alles in Zonenmaß. Die Zelle ist so
  // groß wie die größte Karte: Ein gleichmäßiges Raster liest sich als
  // Ordnung, ein gepacktes als Zufall.
  _raster(zone, karten) {
    let zellB = 0;
    let zellH = 0;
    for (const k of karten) {
      // Die Kartengröße gehört der Karte; in Zonenmaß wird sie mit wachsender
      // Zone kleiner, das Raster bekommt also mehr Spalten.
      zellB = Math.max(zellB, (k.width * k.scale) / zone.scale);
      zellH = Math.max(zellH, (k.height * k.scale) / zone.scale);
    }
    const innen = WIDTH - 2 * RAND;
    const spalten = Math.max(1, Math.floor((innen + LUECKE) / (zellB + LUECKE) + 1e-9));
    const reihen = Math.ceil(karten.length / spalten);
    // Zentriert wird das volle Raster, nicht die belegten Spalten: Sonst
    // rückten alle Karten seitlich, sobald eine dazukommt.
    const genutzt = spalten * (zellB + LUECKE) - LUECKE;
    const hoehe = Math.max(HEIGHT, 2 * RAND + reihen * (zellH + LUECKE) - LUECKE);
    const oben = HEIGHT / 2 - RAND;
    return {
      hoehe,
      platz: (i) => ({
        x: -genutzt / 2 + zellB / 2 + (i % spalten) * (zellB + LUECKE),
        y: oben - zellH / 2 - Math.floor(i / spalten) * (zellH + LUECKE),
      }),
    };
  }

  // Die Lage der Zone **in der Heimat der Karten**. Hängt sie selbst dort, ist
  // das ihre lokale Matrix — exakt, ohne den Umweg über zwei Weltmatrizen.
  // Hängt sie an einer Hand, wird über die Welt zurückgerechnet.
  _lageInHeimat(zone, ziel) {
    zone.group.updateWorldMatrix(true, false);
    if (zone.group.parent === this.heimat) return ziel.copy(zone.group.matrix);
    this.heimat.updateWorldMatrix(true, false);
    return ziel.copy(this.heimat.matrixWorld).invert().multiply(zone.group.matrixWorld);
  }

  // **Die Mitglieder ins Raster legen.** Karten liegen flach in der Zonenebene,
  // knapp davor, mit der Ausrichtung der Zone; ihre eigene Skalierung bleibt.
  // Gerechnet wird direkt in der Heimat der Karten — auf dem Planeten ist das
  // die gedrehte Weltgruppe, und eine Rechnung in Welt müsste dorthin zurück.
  _lege(zone) {
    const karten = this._mitgliederVon(zone);
    const raster = this._raster(zone, karten);
    zone._setzeHoehe(raster.hoehe);
    zone._beschrifte();
    const lage = this._lageInHeimat(zone, (zone._lage ??= new THREE.Matrix4()));
    lage.decompose(_lp, _lq, _ls);
    // Ein gehaltenes Mitglied bleibt, wo die Hand es hat. Die Zone bleibt dann
    // aber offen: Wird es losgelassen, ohne dass ein Zug gemeldet wird (kaum
    // bewegt), rastet es im nächsten Bild trotzdem wieder ein.
    let offen = false;
    karten.forEach((k, i) => {
      if (this._gegriffen(k)) {
        offen = true;
        return;
      }
      const { x, y } = raster.platz(i);
      k.group.position.set(x, y, KARTEN_Z).applyMatrix4(lage);
      k.group.quaternion.copy(_lq);
    });
    zone._mitglieder = karten;
    zone._masse = karten.flatMap((k) => [k.width * k.scale, k.height * k.scale]);
    zone._schmutzig = offen;
  }

  // Hat sich an Größe oder Art eines Mitglieds etwas geändert, seit es gelegt
  // wurde? (Mausrad auf einer Karte, Form gewechselt.)
  _masseGeaendert(zone) {
    const k = zone._mitglieder;
    const m = zone._masse;
    for (let i = 0; i < k.length; i++) {
      const c = k[i];
      if (c.flowType || m[2 * i] !== c.width * c.scale || m[2 * i + 1] !== c.height * c.scale) return true;
    }
    return false;
  }

  // Alle Zonen sofort neu legen — nach dem Anordnen und überall, wo Karten von
  // außen bewegt wurden.
  legeAlle() {
    for (const zone of this.zones) this._lege(zone);
  }

  // **Jedes Bild.** Legt eine Zone neu, sobald sie sich in der Heimat bewegt
  // hat (gegriffen, gezogen, skaliert, angeordnet), ein Mitglied seine Größe
  // geändert hat oder ein Mitglied gelöscht wurde. Sonst kostet es einen
  // Matrixvergleich je Zone. Verglichen wird die Lage **in der Heimat**, nicht
  // in der Welt: Auf dem Planeten dreht sich die Welt bei jedem Schritt, Zone
  // und Karten drehen aber gemeinsam mit — dafür muss nichts gelegt werden.
  update() {
    for (const zone of this.zones) {
      if (!zone._lage || zone._schmutzig) {
        this._lege(zone);
        continue;
      }
      if (!zone.karten.length) continue;
      if (!nahGleich(this._lageInHeimat(zone, _m), zone._lage) || this._masseGeaendert(zone)) {
        this._lege(zone);
      }
    }
    this._hebeHervor();
  }

  // Schwebt eine gezogene Karte über einer Zone, leuchtet deren Rand auf.
  _hebeHervor() {
    let ziel = null;
    if (this.zones.length) {
      for (const k of this.alleKarten()) {
        if (k.flowType || !this._gegriffen(k)) continue;
        ziel = this._zoneAm(k.group.getWorldPosition(_p), this.auge(_auge));
        break;
      }
    }
    for (const zone of this.zones) zone.setHervorgehoben(zone === ziel);
  }

  // --- Speichern ------------------------------------------------------------

  toJSON() {
    return this.zones.map((z) => z.toJSON());
  }

  // Erwartet, dass die Karten schon geladen sind (main.js: Karten →
  // Verbindungen → Zonen).
  //
  // **Gelegt wird beim Laden nicht.** Gespeichert wurde ein gelegter Zustand;
  // die Karten stehen also schon im Raster. Der Vergleichsstand für `update()`
  // wird auf die aktuelle Lage gesetzt, damit Rückgängig und Laden nichts
  // springen lassen. Einzige Ausnahme sind alte Boards ohne Mitgliedschaft.
  loadJSON(list) {
    this.clear();
    if (!Array.isArray(list)) return;
    const vorhanden = new Set(this.alleKarten().filter((k) => !k.flowType).map((k) => k.id));
    const vergeben = new Set();
    const ohneFeld = [];
    for (const entry of list) {
      if (!entry || typeof entry.title !== 'string') continue;
      const zone = this.addZone(entry);
      if (typeof entry.id === 'string' && entry.id) zone.id = entry.id;
      if (Array.isArray(entry.karten)) {
        // Nur IDs, die es als Karte gibt, und jede nur einmal.
        for (const id of entry.karten) {
          if (typeof id !== 'string' || !vorhanden.has(id) || vergeben.has(id)) continue;
          zone.karten.push(id);
          vergeben.add(id);
        }
      } else {
        ohneFeld.push(zone);
      }
    }

    // **Altes Board:** Mitglieder einmalig über Nähe ableiten — so, wie die
    // App sie früher beim Anordnen zugeordnet hat — und sofort legen. Danach
    // steht das Feld in jedem gespeicherten Stand.
    if (ohneFeld.length) {
      for (const k of this.alleKarten()) {
        if (k.flowType || vergeben.has(k.id)) continue;
        const zone = this._zoneAm(k.group.getWorldPosition(_p));
        if (zone && ohneFeld.includes(zone)) zone.karten.push(k.id);
      }
      for (const zone of ohneFeld) this._lege(zone);
    }

    for (const zone of this.zones) {
      if (ohneFeld.includes(zone)) continue;
      const karten = this._mitgliederVon(zone);
      zone._setzeHoehe(this._raster(zone, karten).hoehe);
      zone._beschrifte();
      zone._lage = this._lageInHeimat(zone, new THREE.Matrix4());
      zone._mitglieder = karten;
      zone._masse = karten.flatMap((k) => [k.width * k.scale, k.height * k.scale]);
    }
  }
}

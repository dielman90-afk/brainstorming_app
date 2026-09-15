import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// Bewegung unterhalb dieser Schwelle gilt als „nur angetippt" und landet nicht
// im Undo-Verlauf (ein Grab setzt die Matrix minimal neu, auch ohne Bewegung).
const MOVE_EPSILON_SQ = 1e-6;

// Ray-Casting + Grab für XR-Controller sowie Maus-Fallback am Desktop.
export class InteractionManager {
  constructor({ renderer, scene, camera, cardManager, getUiTargets, xrRoot, haptics = null }) {
    this.renderer = renderer;
    this.haptics = haptics;
    this.scene = scene;
    // Controller/Grips hängen am Player-Rig (falls vorhanden), damit sie sich
    // bei der Fortbewegung mit dem Nutzer mitbewegen; sonst direkt an der Szene.
    this.xrRoot = xrRoot || scene;
    this.camera = camera;
    this.cardManager = cardManager;
    this.getUiTargets = getUiTargets;
    this.onInputConnected = null;

    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.pointer = new THREE.Vector2();
    this._weltHilf = new THREE.Vector3();
    this.controllers = [];
    this.hands = [];
    this.drag = null;
    this.onCardContextMenu = null;
    this.onCardDoubleClick = null;
    // Melden abgeschlossene Änderungen, damit main.js einen Undo-Schritt sichert.
    // „Grab" umfasst alles mit grabTarget – Zonen und die Whiteboard-Griffleiste.
    this.onCardMoved = null;
    this.onCardScaled = null;
    this.onGrabMoved = null;
    this.onGrabScaled = null;
    // Optionaler Interceptor: gibt true zurück, wenn ein Karten-Pick konsumiert
    // wurde (z. B. Verbindungsmodus) – dann kein Grab/Drag.
    this.onCardPick = null;
    // Beginn einer Zieh-Geste. Eine noch laufende Layout-Animation muss dann
    // aufhören, sonst zerren Animation und Hand an derselben Karte.
    this.onCardGrabStart = null;

    this._initControllers();
    this._initPointer();
  }

  _targets() {
    return [...this.getUiTargets(), ...this.cardManager.cards.map((c) => c.group)];
  }

  _findInteractive(object) {
    let o = object;
    while (o) {
      if (o.userData.onClick) return { type: 'ui', object: o };
      if (o.userData.drawSurface) return { type: 'draw', surface: o.userData.drawSurface, object: o };
      if (o.userData.grabTarget) return { type: 'grab', target: o.userData.grabTarget, object: o };
      if (o.userData.card) return { type: 'card', card: o.userData.card };
      o = o.parent;
    }
    return null;
  }

  _initControllers() {
    const modelFactory = new XRControllerModelFactory();
    const handFactory = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x9bd7ff, transparent: true, opacity: 0.6 })
      );
      line.name = 'ray';
      line.scale.z = 4;
      controller.add(line);
      controller.userData.hover = null;
      controller.addEventListener('selectstart', () => this._onSelectStart(controller));
      controller.addEventListener('selectend', () => this._onSelectEnd(controller));

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(modelFactory.createControllerModel(grip));

      // Hand-Tracking: dieselbe Slot-Nummer liefert den XRHandSpace. Das
      // Kugel-Profil ist rein prozedural – keine externen Assets, damit die App
      // auch offline auf der Quest vollständig lädt.
      const hand = this.renderer.xr.getHand(i);
      hand.add(handFactory.createHandModel(hand, 'spheres'));

      controller.addEventListener('connected', (event) => {
        controller.userData.handedness = event.data?.handedness;
        controller.userData.inputSource = event.data;
        this.onInputConnected?.({
          handedness: event.data?.handedness,
          grip,
          hand,
          controller,
          isHand: Boolean(event.data?.hand),
        });
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
      });

      // Hände gehören wie Controller/Grips ans Player-Rig, damit sie der
      // Fortbewegung folgen.
      this.xrRoot.add(controller, grip, hand);
      this.controllers.push(controller);
      this.hands.push(hand);
    }
  }

  _xrRaycast(controller) {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    return this._firstInteractiveHit();
  }

  _firstInteractiveHit() {
    const hits = this.raycaster.intersectObjects(this._targets(), true);
    for (const hit of hits) {
      const interactive = this._findInteractive(hit.object);
      if (interactive) {
        return { ...interactive, distance: hit.distance, point: hit.point, uv: hit.uv };
      }
    }
    return null;
  }

  _setHover(controller, hit) {
    const prev = controller.userData.hover;
    if ((prev?.object ?? prev?.card) === (hit?.object ?? hit?.card)) return;
    if (prev?.type === 'ui') prev.object.userData.setHover?.(false);
    if (prev?.type === 'card') prev.card.setHovered(false);
    if (hit?.type === 'ui') hit.object.userData.setHover?.(true);
    if (hit?.type === 'card') hit.card.setHovered(true);
    controller.userData.hover = hit;
  }

  _onSelectStart(controller) {
    const hit = this._xrRaycast(controller);
    // Merken, welche Hand zuletzt etwas ausgelöst hat – Menü-Aktionen ohne
    // eigenen Controller-Bezug rumpeln dann auf der richtigen Seite.
    this.haptics?.noteUsed(controller);
    if (!hit) {
      // Griff ins Leere – nichts angevisiert. Das ist das Signal für die
      // Fortbewegung per Hand (locomotion.js zieht daran die Welt heran);
      // ein Pinch auf eine Karte oder einen Button bleibt davon unberührt.
      controller.userData.emptySelect = true;
      return;
    }
    if (hit.type === 'ui') {
      this.haptics?.pulse('click', controller);
      hit.object.userData.onClick();
      return;
    }
    if (hit.type === 'draw') {
      controller.userData.drawing = hit.surface;
      hit.surface.strokeStart(hit.uv);
      return;
    }
    if (hit.type === 'grab') {
      this.haptics?.pulse('grab', controller);
      controller.userData.grabbedTarget = hit.target;
      controller.userData.grabTargetStart = hit.target.group.getWorldPosition(new THREE.Vector3());
      controller.attach(hit.target.group);
      return;
    }
    this.cardManager.select(hit.card);
    this.haptics?.pulse('grab', controller);
    if (this.onCardPick?.(hit.card)) return;
    this.onCardGrabStart?.(hit.card);
    controller.userData.grabbed = hit.card;
    controller.userData.grabStart = hit.card.group.getWorldPosition(new THREE.Vector3());
    controller.attach(hit.card.group);
  }

  _onSelectEnd(controller) {
    controller.userData.emptySelect = false;
    if (controller.userData.drawing) {
      controller.userData.drawing.strokeEnd();
      controller.userData.drawing = null;
    }
    const target = controller.userData.grabbedTarget;
    if (target) {
      // Zonen gehören zur Welt und melden dafür eine Heimat; das Whiteboard ist
      // ein Werkzeug und bleibt an der Szene.
      (target.heimat?.() ?? this.scene).attach(target.group);
      controller.userData.grabbedTarget = null;
      const targetStart = controller.userData.grabTargetStart;
      // **Welt gegen Welt.** `grabTargetStart` kommt aus `getWorldPosition`;
      // `group.position` ist nach dem Zurückhängen die lokale Lage in der
      // Heimat. Auf dem Planeten liegen dazwischen 25 m, und jede Berührung
      // meldete eine Verschiebung an den Undo-Verlauf.
      if (targetStart && this._weltAbstandQ(target.group, targetStart) > MOVE_EPSILON_SQ) {
        this.onGrabMoved?.(target);
      }
      controller.userData.grabTargetStart = null;
    }
    const card = controller.userData.grabbed;
    if (card) {
      // In die **Heimat** der Karten, nicht in die Szene: Im Nachthimmel ist
      // das die Weltgruppe des Planeten, und eine dort losgelassene Karte
      // bleibt liegen, wenn man weitergeht.
      (this.cardManager?.heimat ?? this.scene).attach(card.group);
      controller.userData.grabbed = null;
      const start = controller.userData.grabStart;
      if (start && this._weltAbstandQ(card.group, start) > MOVE_EPSILON_SQ) {
        this.haptics?.pulse('release', controller);
        this.onCardMoved?.(card);
      }
      controller.userData.grabStart = null;
    }
  }

  update() {
    if (!this.renderer.xr.isPresenting) return;
    for (const controller of this.controllers) {
      // Aktiver Zeichenstrich: Ray nur gegen die Zeichenfläche
      if (controller.userData.drawing) {
        this.tempMatrix.identity().extractRotation(controller.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
        const hits = this.raycaster.intersectObject(controller.userData.drawing.surface, false);
        if (hits[0]?.uv) controller.userData.drawing.strokeMove(hits[0].uv);
        continue;
      }

      const hit = this._xrRaycast(controller);
      this._setHover(controller, hit);
      const ray = controller.getObjectByName('ray');
      if (ray) ray.scale.z = hit ? Math.max(hit.distance, 0.1) : 4;

      // Gehaltenes Objekt per Daumenstick (hoch/runter) skalieren
      const axes = controller.userData.inputSource?.gamepad?.axes;
      if (axes && axes.length >= 4 && Math.abs(axes[3]) > 0.25) {
        const grabbed = controller.userData.grabbed;
        const target = controller.userData.grabbedTarget;
        if (grabbed) {
          grabbed.setScale(grabbed.scale * (1 - axes[3] * 0.02));
          this.onCardScaled?.(grabbed);
        } else if (target) {
          target.setScale(target.getScale() * (1 - axes[3] * 0.02));
          this.onGrabScaled?.(target);
        }
      }
    }
  }

  // --- Desktop-Maussteuerung ---

  _initPointer() {
    // Capture-Phase auf window, damit ein Karten-Drag OrbitControls zuvorkommt
    window.addEventListener('pointerdown', (e) => this._onPointerDown(e), true);
    window.addEventListener('pointermove', (e) => this._onPointerMove(e), true);
    window.addEventListener('pointerup', () => this._onPointerUp(), true);
    this.renderer.domElement.addEventListener('contextmenu', (e) => this._onContextMenu(e));
    this.renderer.domElement.addEventListener('dblclick', (e) => this._onDoubleClick(e));
    window.addEventListener('wheel', (e) => this._onWheel(e), { capture: true, passive: false });
  }

  // Mausrad über Karte oder Griffleiste = Größe ändern (statt Kamera-Zoom)
  _onWheel(event) {
    if (this.renderer.xr.isPresenting) return;
    if (event.target !== this.renderer.domElement) return;
    this._setRayFromMouse(event);
    const hit = this._firstInteractiveHit();
    const factor = Math.pow(1.1, -Math.sign(event.deltaY));
    if (hit?.type === 'card') {
      event.preventDefault();
      event.stopPropagation();
      hit.card.setScale(hit.card.scale * factor);
      this.onCardScaled?.(hit.card);
    } else if (hit?.type === 'grab') {
      event.preventDefault();
      event.stopPropagation();
      hit.target.setScale(hit.target.getScale() * factor);
      this.onGrabScaled?.(hit.target);
    }
  }

  _setRayFromMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  _onPointerDown(event) {
    if (this.renderer.xr.isPresenting) return;
    if (event.target !== this.renderer.domElement) return;
    if (event.button !== 0 && event.button !== 2) return;
    this._setRayFromMouse(event);
    const hit = this._firstInteractiveHit();
    if (!hit) return;

    // 3D-UI (Whiteboard-Toolbar) auch per Maus bedienbar
    if (hit.type === 'ui' && event.button === 0) {
      event.stopPropagation();
      hit.object.userData.onClick();
      return;
    }
    if (hit.type === 'draw' && event.button === 0) {
      event.stopPropagation();
      this.drawTarget = hit.surface;
      hit.surface.strokeStart(hit.uv);
      return;
    }
    if (hit.type === 'grab' && event.button === 0) {
      event.stopPropagation();
      this.dragGrab = this._beginneZug(hit.target.group, hit.point, { target: hit.target });
      return;
    }
    if (hit.type !== 'card') return;
    // Verhindert, dass OrbitControls die Geste übernimmt (Rotation/Pan)
    event.stopPropagation();
    // Rechtsklick: kein Drag – das contextmenu-Event öffnet gleich das Menü
    if (event.button === 2) return;
    this.cardManager.select(hit.card);
    if (this.onCardPick?.(hit.card)) return;
    this.onCardGrabStart?.(hit.card);
    this.drag = this._beginneZug(hit.card.group, hit.point, { card: hit.card });
  }

  // **Ein Zug rechnet in Weltkoordinaten, nicht in den Koordinaten des Elters.**
  //
  // Hier stand einmal `gruppe.position` — die **lokale** Lage im Elter — neben
  // `hit.point` und der Ziehebene, die beide in **Welt** stehen. Auf den vier
  // ortsfesten Umgebungen ist das dasselbe, weil dort der Elter die Szene im
  // Ursprung ist. Im 🌌 Nachthimmel ist der Elter die Weltgruppe des Planeten:
  // Sie steht zwar auch im Ursprung, trägt aber die Drehung des Rundgangs, und
  // eine Karte liegt 25 m vom Mittelpunkt entfernt.
  //
  // Gemessen mit `tools/werkzeuge.mjs`: Nach 40 Grad Weltdrehung — gut 17 m
  // Bogen, also nach ein paar Schritten — warf ein Zug über 40 Bildpunkte die
  // Karte **18,95 m** weit. Das ist der gemeldete Fehler „Kärtchen
  // verschwinden, wenn man sie verschieben möchte".
  //
  // Bemerkenswert ist, dass er erst nach dem Losgehen auftritt: Steht die Welt
  // noch unverdreht, sind lokal und Welt zufällig gleich, und nichts springt.
  _beginneZug(gruppe, treffer, rest) {
    const welt = gruppe.getWorldPosition(new THREE.Vector3());
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    return {
      ...rest,
      gruppe,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, welt),
      offset: welt.clone().sub(treffer),
      point: new THREE.Vector3(),
      // Der Vergleich am Ende läuft ebenfalls über die Weltlage — sonst misst
      // er den Abstand zwischen zwei Bezugssystemen und meldet jede Berührung
      // als Verschiebung an den Undo-Verlauf.
      start: welt.clone(),
    };
  }

  // Der quadrierte Abstand einer Gruppe von einer **Weltlage**. Dieselbe Falle
  // wie oben, nur an der anderen Stelle: `gruppe.position` ist lokal.
  _weltAbstandQ(gruppe, weltStart) {
    return gruppe.getWorldPosition(this._weltHilf).distanceToSquared(weltStart);
  }

  // Die Weltlage aus dem Zug in den Elter zurückrechnen und setzen.
  _fuehreZug(zug) {
    if (!this.raycaster.ray.intersectPlane(zug.plane, zug.point)) return;
    zug.point.add(zug.offset);
    const elter = zug.gruppe.parent;
    zug.gruppe.position.copy(elter ? elter.worldToLocal(zug.point) : zug.point);
  }

  _onPointerMove(event) {
    if (this.renderer.xr.isPresenting) return;
    if (this.drawTarget) {
      this._setRayFromMouse(event);
      const hits = this.raycaster.intersectObject(this.drawTarget.surface, false);
      if (hits[0]?.uv) this.drawTarget.strokeMove(hits[0].uv);
      return;
    }
    if (this.dragGrab) {
      this._setRayFromMouse(event);
      this._fuehreZug(this.dragGrab);
      return;
    }
    if (this.drag) {
      this._setRayFromMouse(event);
      this._fuehreZug(this.drag);
      return;
    }
    if (event.target === this.renderer.domElement) {
      this._setRayFromMouse(event);
      const hit = this._firstInteractiveHit();
      const cursors = { card: 'grab', draw: 'crosshair', grab: 'grab', ui: 'pointer' };
      this.renderer.domElement.style.cursor = cursors[hit?.type] ?? '';
    }
  }

  _onPointerUp() {
    if (this.drawTarget) {
      this.drawTarget.strokeEnd();
      this.drawTarget = null;
    }
    if (this.dragGrab) {
      const { target, start } = this.dragGrab;
      this.dragGrab = null;
      if (this._weltAbstandQ(target.group, start) > MOVE_EPSILON_SQ) {
        this.onGrabMoved?.(target);
      }
    }
    if (this.drag) {
      const { card, start } = this.drag;
      this.drag = null;
      if (this._weltAbstandQ(card.group, start) > MOVE_EPSILON_SQ) {
        this.onCardMoved?.(card);
      }
    }
  }

  _onContextMenu(event) {
    if (this.renderer.xr.isPresenting) return;
    event.preventDefault();
    this._setRayFromMouse(event);
    const hit = this._firstInteractiveHit();
    if (hit?.type !== 'card') return;
    this.cardManager.select(hit.card);
    this.onCardContextMenu?.(hit.card, event.clientX, event.clientY);
  }

  _onDoubleClick(event) {
    if (this.renderer.xr.isPresenting) return;
    this._setRayFromMouse(event);
    const hit = this._firstInteractiveHit();
    if (hit?.type === 'card') this.onCardDoubleClick?.(hit.card);
  }
}

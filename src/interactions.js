import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// Ray-Casting + Grab für XR-Controller sowie Maus-Fallback am Desktop.
export class InteractionManager {
  constructor({ renderer, scene, camera, cardManager, getUiTargets }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.cardManager = cardManager;
    this.getUiTargets = getUiTargets;
    this.onControllerConnected = null;

    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.pointer = new THREE.Vector2();
    this.controllers = [];
    this.drag = null;
    this.onCardContextMenu = null;
    this.onCardDoubleClick = null;
    // Optionaler Interceptor: gibt true zurück, wenn ein Karten-Pick konsumiert
    // wurde (z. B. Verbindungsmodus) – dann kein Grab/Drag.
    this.onCardPick = null;

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
      if (o.userData.card) return { type: 'card', card: o.userData.card };
      o = o.parent;
    }
    return null;
  }

  _initControllers() {
    const modelFactory = new XRControllerModelFactory();
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
      controller.addEventListener('connected', (event) => {
        controller.userData.handedness = event.data?.handedness;
        controller.userData.inputSource = event.data;
        this.onControllerConnected?.(event.data?.handedness, grip, controller);
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
      });

      this.scene.add(controller, grip);
      this.controllers.push(controller);
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
      if (interactive) return { ...interactive, distance: hit.distance, point: hit.point };
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
    if (!hit) return;
    if (hit.type === 'ui') {
      hit.object.userData.onClick();
      return;
    }
    this.cardManager.select(hit.card);
    if (this.onCardPick?.(hit.card)) return;
    controller.userData.grabbed = hit.card;
    controller.attach(hit.card.group);
  }

  _onSelectEnd(controller) {
    const card = controller.userData.grabbed;
    if (card) {
      this.scene.attach(card.group);
      controller.userData.grabbed = null;
    }
  }

  update() {
    if (!this.renderer.xr.isPresenting) return;
    for (const controller of this.controllers) {
      const hit = this._xrRaycast(controller);
      this._setHover(controller, hit);
      const ray = controller.getObjectByName('ray');
      if (ray) ray.scale.z = hit ? Math.max(hit.distance, 0.1) : 4;

      // Gehaltene Karte per Daumenstick (hoch/runter) skalieren
      const grabbed = controller.userData.grabbed;
      const axes = controller.userData.inputSource?.gamepad?.axes;
      if (grabbed && axes && axes.length >= 4 && Math.abs(axes[3]) > 0.25) {
        grabbed.setScale(grabbed.scale * (1 - axes[3] * 0.02));
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

  // Mausrad über einer Karte = Größe ändern (statt Kamera-Zoom)
  _onWheel(event) {
    if (this.renderer.xr.isPresenting) return;
    if (event.target !== this.renderer.domElement) return;
    this._setRayFromMouse(event);
    const hit = this._firstInteractiveHit();
    if (hit?.type !== 'card') return;
    event.preventDefault();
    event.stopPropagation();
    const factor = Math.pow(1.1, -Math.sign(event.deltaY));
    hit.card.setScale(hit.card.scale * factor);
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
    if (hit?.type !== 'card') return;
    // Verhindert, dass OrbitControls die Geste übernimmt (Rotation/Pan)
    event.stopPropagation();
    // Rechtsklick: kein Drag – das contextmenu-Event öffnet gleich das Menü
    if (event.button === 2) return;
    this.cardManager.select(hit.card);
    if (this.onCardPick?.(hit.card)) return;
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    this.drag = {
      card: hit.card,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.card.group.position),
      offset: hit.card.group.position.clone().sub(hit.point),
      point: new THREE.Vector3(),
    };
  }

  _onPointerMove(event) {
    if (this.renderer.xr.isPresenting) return;
    if (this.drag) {
      this._setRayFromMouse(event);
      if (this.raycaster.ray.intersectPlane(this.drag.plane, this.drag.point)) {
        this.drag.card.group.position.copy(this.drag.point.add(this.drag.offset));
      }
      return;
    }
    if (event.target === this.renderer.domElement) {
      this._setRayFromMouse(event);
      const hit = this._firstInteractiveHit();
      this.renderer.domElement.style.cursor = hit?.type === 'card' ? 'grab' : '';
    }
  }

  _onPointerUp() {
    this.drag = null;
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

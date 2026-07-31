import * as THREE from 'three';

// VR-Fortbewegung über einen „Player-Rig" (Gruppe, die Kamera + Controller
// enthält). Da three.js die Parent-Matrix auf die XR-Kamera anwendet, bewegt
// das Verschieben/Drehen dieser Gruppe den Nutzer durch die Welt.
//
//   • Linker Stick  → sanftes Gleiten in Blickrichtung (analog dosierbar)
//   • Rechter Stick → ruckartiges Drehen (Snap-Turn, komfortabler)
//   • Ohne Controller (Hand-Tracking): ins Leere pinchen und ziehen – man greift
//     die Welt und zieht sich daran entlang. Mit beiden Händen kommt Drehen
//     dazu. Hände liefern kein Gamepad, ohne diesen Weg käme man mit reinem
//     Hand-Tracking überhaupt nicht von der Stelle.
//
// Wichtig: Die Blickrichtung/Kopfposition wird aus der NUTZER-Kamera gelesen
// (Kind des Rigs) – NICHT aus renderer.xr.getCamera(). Deren getWorldQuaternion
// verwirft den Rig-Offset, wodurch die Bewegung nicht der Blickrichtung folgt.
// Snap-Turn dreht um die Kopfposition, damit man sich nicht „aus dem Körper" dreht.

const UP = new THREE.Vector3(0, 1, 0);
const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const MOVE_SPEED = 2.4; // m/s bei vollem Stickausschlag
const DEADZONE = 0.18;
const TURN_ON = 0.7;
const TURN_OFF = 0.35;
// Handtracking springt gelegentlich. Ein Ruck von mehr als 15 cm in einem Frame
// wäre keine echte Handbewegung – begrenzen, statt den Nutzer zu schleudern.
const HAND_STEP_MAX = 0.15;
// Ebenso bei der Drehung: mehr als ~29° pro Frame ist ein Tracking-Aussetzer.
const HAND_TURN_MAX = 0.5;

function deadzone(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

export class Locomotion {
  constructor({ renderer, player, camera, controllers }) {
    this.renderer = renderer;
    this.player = player;
    this.camera = camera; // Nutzer-Kamera (Kind des Rigs) – korrekte Weltpose
    this.controllers = controllers; // Referenz auf interactions.controllers
    this._snapArmed = false;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._drag = null; // { mid, angle, count } – Bezug des laufenden Hand-Zugs
  }

  _isHand(c) {
    return Boolean(c.userData.inputSource?.hand);
  }

  _grabbing(c) {
    return Boolean(c.userData.grabbed || c.userData.grabbedTarget || c.userData.drawing);
  }

  // Thumbstick robust auslesen (xr-standard: axes[2]/[3]; Fallback [0]/[1])
  _stick(gp) {
    const a = gp.axes || [];
    let x = a[2] ?? 0;
    let y = a[3] ?? 0;
    if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) {
      x = a[0] ?? 0;
      y = a[1] ?? 0;
    }
    return { x, y };
  }

  update(dt) {
    if (!this.renderer.xr.isPresenting) return;

    for (const c of this.controllers) {
      const gp = c.userData.inputSource?.gamepad;
      if (!gp || this._grabbing(c)) continue;
      const { x, y } = this._stick(gp);

      if (c.userData.handedness === 'right') {
        this._snap(x); // rechter Stick = drehen
      } else {
        this._glide(deadzone(x), deadzone(y), dt); // links/unbekannt = gehen
      }
    }

    this._handDrag();
  }

  // Fortbewegung ohne Controller: Die Welt wird gegriffen und herangezogen.
  //
  // Gerechnet wird in Rig-Koordinaten. Die Hände hängen als Kinder am Player-Rig,
  // ihre lokale Position ändert sich also nicht dadurch, dass wir das Rig
  // verschieben – deshalb genügt der Zuwachs von Frame zu Frame und es kann
  // keine Rückkopplung entstehen.
  _handDrag() {
    const hands = this.controllers.filter(
      (c) => this._isHand(c) && c.userData.emptySelect && !this._grabbing(c)
    );
    if (!hands.length) {
      this._drag = null;
      return;
    }

    this._mid.set(0, 0, 0);
    for (const c of hands) this._mid.add(c.position);
    this._mid.multiplyScalar(1 / hands.length);

    // Zweihändig: Winkel der Verbindungslinie liefert die Drehung.
    const angle =
      hands.length >= 2
        ? Math.atan2(
            hands[1].position.x - hands[0].position.x,
            hands[1].position.z - hands[0].position.z
          )
        : null;

    // Erster Frame eines Zugs – oder Wechsel zwischen ein- und zweihändig:
    // nur den Bezug setzen, sonst gäbe es einen Sprung.
    if (!this._drag || this._drag.count !== hands.length) {
      this._drag = { mid: this._mid.clone(), angle, count: hands.length };
      return;
    }

    // Hand nach hinten ziehen = Welt kommt entgegen = man bewegt sich vorwärts.
    // Nur horizontal, wie beim Stick – sonst hebt man unbeabsichtigt ab.
    this._v.copy(this._mid).sub(this._drag.mid);
    this._v.y = 0;
    const step = this._v.length();
    if (step > HAND_STEP_MAX) this._v.multiplyScalar(HAND_STEP_MAX / step);
    this._v.applyQuaternion(this.player.quaternion);
    this.player.position.sub(this._v);

    if (angle !== null && this._drag.angle !== null) {
      let d = angle - this._drag.angle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < HAND_TURN_MAX) this._rotateAroundHead(-d);
    }

    this._drag.mid.copy(this._mid);
    this._drag.angle = angle;
  }

  _glide(mvx, mvy, dt) {
    if (mvx === 0 && mvy === 0) return;
    // Blickrichtung (horizontal) aus der Nutzer-Kamera
    this.camera.getWorldQuaternion(this._q);
    this._fwd.set(0, 0, -1).applyQuaternion(this._q);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) return; // schaut senkrecht → keine Richtung
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, UP).normalize();
    // Stick nach oben (mvy < 0) = vorwärts; rechts (mvx > 0) = seitlich rechts
    this._v.copy(this._right).multiplyScalar(mvx).addScaledVector(this._fwd, -mvy);
    const len = this._v.length();
    if (len < 1e-4) return;
    if (len > 1) this._v.multiplyScalar(1 / len); // Diagonale nicht schneller
    this.player.position.addScaledVector(this._v, MOVE_SPEED * dt);
  }

  _snap(x) {
    if (!this._snapArmed) {
      if (x > TURN_ON) {
        this._rotateAroundHead(-SNAP_ANGLE); // Stick rechts = nach rechts drehen
        this._snapArmed = true;
      } else if (x < -TURN_ON) {
        this._rotateAroundHead(SNAP_ANGLE);
        this._snapArmed = true;
      }
    } else if (Math.abs(x) < TURN_OFF) {
      this._snapArmed = false; // erst nach Zurückschnappen wieder auslösbar
    }
  }

  _rotateAroundHead(theta) {
    // Kopfposition aus der Nutzer-Kamera (inkl. Rig-Offset)
    this.camera.getWorldPosition(this._head);
    const p = this.player;
    p.position.sub(this._head).applyAxisAngle(UP, theta).add(this._head);
    p.rotateOnWorldAxis(UP, theta);
  }

  reset() {
    this.player.position.set(0, 0, 0);
    this.player.quaternion.identity();
    this._snapArmed = false;
    this._drag = null;
  }
}

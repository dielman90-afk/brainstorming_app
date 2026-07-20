import * as THREE from 'three';

// VR-Fortbewegung über einen „Player-Rig" (Gruppe, die Kamera + Controller
// enthält). Da three.js die Parent-Matrix auf die XR-Kamera anwendet, bewegt
// das Verschieben/Drehen dieser Gruppe den Nutzer durch die Welt.
//
//   • Linker Stick  → sanftes Gleiten in Blickrichtung
//   • Rechter Stick → ruckartiges Drehen (Snap-Turn, komfortabler)
//   • Griff-Taste   → Teleport: Bodenpunkt anvisieren, loslassen = hinspringen
//
// Snap-Turn und Teleport rechnen um die Kopfposition, damit man sich nicht
// „aus dem Körper heraus" dreht/springt.

const UP = new THREE.Vector3(0, 1, 0);
const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const MOVE_SPEED = 2.6; // m/s
const DEADZONE = 0.15;
const TURN_ON = 0.7;
const TURN_OFF = 0.3;
const TELE_MIN = 0.4;
const TELE_MAX = 26;

export class Locomotion {
  constructor({ renderer, player, scene, controllers }) {
    this.renderer = renderer;
    this.player = player;
    this.scene = scene;
    this.controllers = controllers; // Referenz auf interactions.controllers
    this._snapArmed = false;
    this._teleAiming = false;
    this._teleTarget = null;

    // Teleport-Markierung (Ring am Boden)
    this.marker = new THREE.Group();
    this.marker.visible = false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 32),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 999;
    this.marker.add(ring);
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 20),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
    );
    dot.rotation.x = -Math.PI / 2;
    dot.renderOrder = 999;
    this.marker.add(dot);
    scene.add(this.marker);

    this._v = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._head = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }

  _xrCam() {
    return this.renderer.xr.getCamera();
  }

  _headWorld(out) {
    this._xrCam().getWorldPosition(out);
    return out;
  }

  _grabbing(c) {
    return Boolean(c.userData.grabbed || c.userData.grabbedTarget || c.userData.drawing);
  }

  update(dt) {
    if (!this.renderer.xr.isPresenting) {
      this.marker.visible = false;
      return;
    }
    let anyAiming = false;
    let teleportPoint = null;

    for (const c of this.controllers) {
      const src = c.userData.inputSource;
      const gp = src?.gamepad;
      if (!gp) continue;
      const hand = c.userData.handedness;
      const axes = gp.axes || [];
      const buttons = gp.buttons || [];
      // Thumbstick liegt bei xr-standard auf axes[2]/axes[3]
      const sx = axes[2] ?? 0;
      const sy = axes[3] ?? 0;

      if (hand === 'left' && !this._grabbing(c)) {
        this._glide(sx, sy, dt);
      }
      if (hand === 'right' && !this._grabbing(c)) {
        this._snap(sx);
      }

      // Teleport per Griff-Taste (squeeze = buttons[1]) an beiden Controllern
      const squeeze = buttons[1]?.pressed;
      if (squeeze) {
        anyAiming = true;
        const p = this._aimGround(c);
        if (p) teleportPoint = p;
      }
    }

    // Markierung anzeigen / Teleport beim Loslassen ausführen
    if (anyAiming) {
      this._teleAiming = true;
      if (teleportPoint) {
        this._teleTarget = teleportPoint.clone();
        this.marker.position.copy(teleportPoint);
        this.marker.visible = true;
      } else {
        this._teleTarget = null;
        this.marker.visible = false;
      }
    } else {
      if (this._teleAiming && this._teleTarget) this._teleportTo(this._teleTarget);
      this._teleAiming = false;
      this._teleTarget = null;
      this.marker.visible = false;
    }
  }

  _glide(sx, sy, dt) {
    const mag = Math.hypot(sx, sy);
    if (mag < DEADZONE) return;
    this._xrCam().getWorldQuaternion(this._q);
    this._fwd.set(0, 0, -1).applyQuaternion(this._q);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) return;
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, UP).normalize();
    // Stick nach oben = -sy = vorwärts
    this._v.copy(this._right).multiplyScalar(sx).addScaledVector(this._fwd, -sy);
    this.player.position.addScaledVector(this._v, MOVE_SPEED * dt);
  }

  _snap(sx) {
    if (!this._snapArmed) {
      if (sx > TURN_ON) {
        this._rotateAroundHead(-SNAP_ANGLE);
        this._snapArmed = true;
      } else if (sx < -TURN_ON) {
        this._rotateAroundHead(SNAP_ANGLE);
        this._snapArmed = true;
      }
    } else if (Math.abs(sx) < TURN_OFF) {
      this._snapArmed = false;
    }
  }

  _rotateAroundHead(theta) {
    const head = this._headWorld(this._head);
    const p = this.player;
    p.position.sub(head).applyAxisAngle(UP, theta).add(head);
    p.rotateOnWorldAxis(UP, theta);
  }

  // Strahl vom Controller auf die Bodenebene (y = 0)
  _aimGround(c) {
    this._rot.extractRotation(c.matrixWorld);
    this._origin.setFromMatrixPosition(c.matrixWorld);
    this._dir.set(0, 0, -1).applyMatrix4(this._rot).normalize();
    if (this._dir.y > -0.02) return null; // zeigt nicht nach unten
    const t = -this._origin.y / this._dir.y;
    if (t < TELE_MIN || t > TELE_MAX) return null;
    return this._origin.clone().addScaledVector(this._dir, t).setY(0.02);
  }

  _teleportTo(point) {
    const head = this._headWorld(this._head);
    this.player.position.x += point.x - head.x;
    this.player.position.z += point.z - head.z;
  }

  reset() {
    this.player.position.set(0, 0, 0);
    this.player.quaternion.identity();
    this._snapArmed = false;
    this._teleAiming = false;
    this._teleTarget = null;
    this.marker.visible = false;
  }
}

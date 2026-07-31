import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { flatLayer } from './wristMenu.js';

// Kopfgebundene Anzeige: Statuszeile, Ladeanzeige und Fehlerkarte.
//
// Alle drei hängen an der Kamera und sind damit in VR wie am Desktop im Blick,
// ohne dass man sich umdrehen muss. Die Ladeanzeige ist bewusst animiert und
// zeigt die verstrichene Zeit – bei einer KI-Antwort, die 20 s braucht, soll
// erkennbar bleiben, dass die App noch arbeitet und nicht hängt.
export class Hud {
  constructor(camera) {
    this.group = new THREE.Group();
    camera.add(this.group);

    // --- Statuszeile ---
    this.status = createTextPanel({
      width: 0.5,
      height: 0.07,
      text: '',
      background: 'rgba(26,24,31,0.85)',
      fontSize: 30,
      doubleSided: false,
    });
    this.status.mesh.position.set(0, -0.28, -0.9);
    this.status.mesh.visible = false;
    flatLayer(this.status.mesh, 40);
    this.group.add(this.status.mesh);
    this._statusTimer = 0;

    // --- Ladeanzeige: rotierender Bogen + Beschriftung ---
    this.busyGroup = new THREE.Group();
    this.busyGroup.position.set(0, -0.17, -0.9);
    this.busyGroup.visible = false;
    this.group.add(this.busyGroup);

    this.spinner = new THREE.Mesh(
      // Offener Bogen statt geschlossenem Ring – nur so ist die Drehung sichtbar.
      new THREE.TorusGeometry(0.018, 0.0035, 8, 32, Math.PI * 1.35),
      new THREE.MeshBasicMaterial({ color: 0xffb454 })
    );
    this.spinner.position.set(-0.222, 0, 0.001);
    flatLayer(this.spinner, 42);
    this.busyGroup.add(this.spinner);

    this.busyLabel = createTextPanel({
      width: 0.52,
      height: 0.075,
      text: '',
      background: 'rgba(26,24,31,0.92)',
      color: '#ffd8a0',
      fontSize: 27,
      weight: 600,
      singleLine: true,
      padding: 90,
      radius: 26,
      border: 'rgba(255,180,84,0.45)',
      doubleSided: false,
    });
    flatLayer(this.busyLabel.mesh, 41);
    this.busyGroup.add(this.busyLabel.mesh);

    this._busyText = '';
    this._busyStart = 0;
    this._busyShown = '';

    // --- Fehlerkarte ---
    this.errorPanel = createTextPanel({
      width: 0.62,
      height: 0.2,
      text: '',
      background: ['#3b2429', '#2a1b1f'],
      color: '#ffdede',
      accent: '#fca5a5',
      border: 'rgba(252,165,165,0.45)',
      fontSize: 28,
      radius: 26,
      doubleSided: false,
    });
    this.errorPanel.mesh.position.set(0, 0.06, -0.85);
    this.errorPanel.mesh.visible = false;
    this.errorPanel.mesh.userData.onClick = () => this.hideError();
    this.errorPanel.mesh.userData.setHover = () => {};
    flatLayer(this.errorPanel.mesh, 44);
    this.group.add(this.errorPanel.mesh);
    this._errorTimer = 0;
  }

  // Anklickbare Elemente für den InteractionManager (Fehlerkarte wegtippen).
  get uiTargets() {
    return this.errorPanel.mesh.visible ? [this.errorPanel.mesh] : [];
  }

  setStatus(message, ms = 3500) {
    this.status.setText(message ?? '');
    this.status.mesh.visible = Boolean(message);
    clearTimeout(this._statusTimer);
    if (message && ms) {
      this._statusTimer = setTimeout(() => {
        this.status.mesh.visible = false;
      }, ms);
    }
  }

  // label = null beendet die Ladeanzeige.
  setBusy(label) {
    if (!label) {
      this.busyGroup.visible = false;
      this._busyText = '';
      return;
    }
    if (!this.busyGroup.visible) this._busyStart = performance.now();
    this._busyText = label;
    this.busyGroup.visible = true;
    this._refreshBusyLabel();
  }

  get isBusy() {
    return this.busyGroup.visible;
  }

  showError(message, ms = 10_000) {
    this.errorPanel.setText(`⚠️ ${message}`);
    this.errorPanel.mesh.visible = true;
    clearTimeout(this._errorTimer);
    if (ms) this._errorTimer = setTimeout(() => this.hideError(), ms);
  }

  hideError() {
    clearTimeout(this._errorTimer);
    this.errorPanel.mesh.visible = false;
  }

  _refreshBusyLabel() {
    const seconds = Math.floor((performance.now() - this._busyStart) / 1000);
    // Sekunden erst ab 4 s zeigen – vorher wirkt der Zähler nur unruhig.
    const text = seconds >= 4 ? `${this._busyText}  ·  ${seconds} s` : this._busyText;
    if (text === this._busyShown) return;
    this._busyShown = text;
    this.busyLabel.setText(text);
  }

  update(delta) {
    if (!this.busyGroup.visible) return;
    this.spinner.rotation.z -= delta * 3.2;
    this._refreshBusyLabel();
  }

  dispose() {
    clearTimeout(this._statusTimer);
    clearTimeout(this._errorTimer);
  }
}

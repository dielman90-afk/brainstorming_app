// Kurzes Controller-Rumble als Rückmeldung: Greifen, Menü-Klick, Verbinden,
// Löschen. In VR fehlt jedes taktile Signal – ohne Vibration bleibt unklar, ob
// ein Trigger-Druck den Button wirklich getroffen hat.
//
// Zwei Wege je nach Browser/Runtime: die einfache Gamepad-Erweiterung
// `hapticActuators[i].pulse(intensität, dauer)` (das kennt der Quest-Browser)
// und als Rückfall `playEffect('dual-rumble', …)` aus der neueren Spezifikation.
// Beide sind optional – ohne Unterstützung passiert schlicht nichts.

// Muster: [Stärke 0–1, Dauer in ms]. Bewusst kurz: Alles über ~60 ms wirkt in
// der Hand wie ein Fehler-Buzz statt wie eine Bestätigung.
export const PATTERNS = {
  grab: [0.35, 22],
  release: [0.2, 14],
  click: [0.28, 18],
  connect: [0.5, 34],
  delete: [0.7, 55],
  error: [0.9, 70],
};

function actuatorsOf(controller) {
  const gamepad = controller?.userData?.inputSource?.gamepad;
  const list = gamepad?.hapticActuators;
  return Array.isArray(list) || list?.length ? list : null;
}

function fire(actuator, intensity, duration) {
  if (!actuator) return false;
  try {
    if (typeof actuator.pulse === 'function') {
      // Liefert ein Promise; ein abgelehntes darf nichts umwerfen.
      Promise.resolve(actuator.pulse(intensity, duration)).catch(() => {});
      return true;
    }
    if (typeof actuator.playEffect === 'function') {
      Promise.resolve(
        actuator.playEffect('dual-rumble', {
          duration,
          strongMagnitude: intensity,
          weakMagnitude: intensity,
        })
      ).catch(() => {});
      return true;
    }
  } catch {
    // Ein Controller ohne funktionierende Aktuatoren darf nichts blockieren
  }
  return false;
}

export class Haptics {
  // getControllers: Zugriff auf die aktuellen XR-Controller, damit Aktionen ohne
  // eigenen Controller-Bezug (Löschen per Menü, Verbinden) trotzdem rumpeln.
  constructor({ getControllers = () => [], isPresenting = () => true } = {}) {
    this.getControllers = getControllers;
    this.isPresenting = isPresenting;
    this.enabled = true;
    // Zuletzt benutzter Controller – Ziel für Aktionen, die über das Menü
    // ausgelöst werden, aber zur Hand des Nutzers gehören.
    this.lastUsed = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  noteUsed(controller) {
    if (controller) this.lastUsed = controller;
  }

  // Auf einem bestimmten Controller. Ohne Controller wird der zuletzt benutzte
  // genommen, sonst alle verbundenen.
  pulse(pattern, controller = null) {
    if (!this.enabled || !this.isPresenting()) return false;
    const [intensity, duration] = PATTERNS[pattern] ?? PATTERNS.click;
    const target = controller ?? this.lastUsed;
    if (target) {
      const actuators = actuatorsOf(target);
      if (actuators && fire(actuators[0], intensity, duration)) return true;
    }
    return this.pulseAll(pattern);
  }

  pulseAll(pattern) {
    if (!this.enabled || !this.isPresenting()) return false;
    const [intensity, duration] = PATTERNS[pattern] ?? PATTERNS.click;
    let any = false;
    for (const controller of this.getControllers()) {
      const actuators = actuatorsOf(controller);
      if (actuators && fire(actuators[0], intensity, duration)) any = true;
    }
    return any;
  }
}

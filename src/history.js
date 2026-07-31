// Undo/Redo für das Board.
//
// Statt jede Aktion als eigenes Command-Objekt zu modellieren, arbeitet der
// Verlauf mit Snapshots: Das Board lässt sich ohnehin schon vollständig
// serialisieren (Karten + Verbindungen), und ein Snapshot deckt damit alle
// Änderungen einheitlich ab – Anlegen, Löschen, „Alles löschen", Verschieben,
// Größe, Farbe, Text, Cluster und Verbindungen.
//
// Snapshots werden als JSON-String gehalten. Das macht den Vergleich „hat sich
// überhaupt etwas geändert?" trivial und verhindert, dass später jemand
// versehentlich in einen bereits abgelegten Zustand hineinschreibt.

export class History {
  // capture(): liefert das zu sichernde Board-Objekt
  // restore(state): setzt das Board auf ein solches Objekt zurück
  constructor({ capture, restore, limit = 60 }) {
    this.capture = capture;
    this.restore = restore;
    this.limit = limit;
    this.entries = []; // [{ state: string, label: string }]
    this.index = -1;
    // Während restore() läuft, dürfen keine neuen Einträge entstehen
    // (sonst würde das Zurücksetzen selbst als Änderung gezählt).
    this.suspended = false;
    this.onChange = null;
  }

  // Ausgangszustand festlegen (Start der Sitzung, nach einem Import).
  reset(label = 'Ausgangszustand') {
    this.entries = [{ state: JSON.stringify(this.capture()), label }];
    this.index = 0;
    this.onChange?.(this);
  }

  // Aktuellen Zustand als neuen Schritt sichern. Liefert false, wenn sich
  // gegenüber dem letzten Schritt nichts geändert hat.
  commit(label) {
    if (this.suspended) return false;
    if (this.index < 0) {
      this.reset(label);
      return true;
    }
    const state = JSON.stringify(this.capture());
    if (state === this.entries[this.index].state) return false;

    // Alles nach der aktuellen Position verwerfen – ab hier ist ein neuer Ast.
    this.entries.length = this.index + 1;
    this.entries.push({ state, label });
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
    this.onChange?.(this);
    return true;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  // Liefert die Beschriftung des rückgängig gemachten Schritts (oder null).
  undo() {
    if (!this.canUndo) return null;
    const label = this.entries[this.index].label;
    this.index -= 1;
    this._apply();
    return label;
  }

  // Liefert die Beschriftung des wiederhergestellten Schritts (oder null).
  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    this._apply();
    return this.entries[this.index].label;
  }

  _apply() {
    this.suspended = true;
    try {
      this.restore(JSON.parse(this.entries[this.index].state));
    } finally {
      this.suspended = false;
    }
    this.onChange?.(this);
  }
}

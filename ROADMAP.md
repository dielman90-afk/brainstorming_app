# ROADMAP – automatisierte Tagesverbesserungen

Diese Datei ist der **Fortschritts-Tracker** für die tägliche Claude-Code-Routine.
Jeder Lauf nimmt sich **genau den ersten offenen Punkt** (`[ ]`) von oben, setzt ihn
vollständig um, verifiziert per Build, committet + pusht auf den Branch
`claude/vr-app-improvements-29f6oo` und hakt den Punkt hier ab (`[x]`).

**Reihenfolge = Priorität (von oben nach unten abarbeiten).** Ist ein Punkt bereits
teilweise vorhanden, wird er sinnvoll erweitert statt doppelt gebaut. Punkte, die
sich nur auf echter Quest-3-Hardware final abnehmen lassen, sind mit *(Hardware)*
markiert – Code wird trotzdem umgesetzt und per Build/Headless-Check geprüft.

## Aufgaben

- [x] **Matrix-Welt** – komplett weiße „Konstrukt"-Umgebung (nahtloser weißer Void).
      *(erledigt am 2026-07-20)*
- [ ] **Undo/Redo** – Verlauf für Verschieben, Anlegen, Löschen, „Alles löschen",
      Cluster und Farbe. Menü-/Tastatur-Zugriff (Ctrl+Z / Ctrl+Shift+Z) und in VR
      ein Menüeintrag. Reine Logik, voll testbar.
- [ ] **KI-Fehlerbehandlung + Loading-Indikator** – Timeout, Retry mit Backoff und
      eine sichtbare Status-/Ladeanzeige im Raum, während Claude arbeitet; klare
      Fehlerkarte statt stillem Fehlschlag.
- [ ] **JSON-Export/Import** – Board als JSON-Datei herunterladen und wieder laden
      (Vorhandenes prüfen und ggf. auf Datei-Download + Import erweitern, auch aus VR
      erreichbar).
- [ ] **Recenter + Snap-Grid** – „Karten zu mir holen"-Button (bestehendes
      `recenterOnNextFrame` nutzen/erweitern) und optionales Einrasten der Karten an
      einem Raster zum sauberen Ausrichten.
- [ ] **A11y/Komfort** – umschaltbare Schriftgröße/Kontrast für Karten sowie eine
      Motion-Sickness-Vignette bei Bewegung.
- [ ] **Model-Update** – serverseitiges Modell von `claude-sonnet-4-6` auf
      `claude-sonnet-5` heben (in `server/ai-core.js`), inkl. README.
- [ ] **Tests & CI** – Unit-Tests für `boardState`, `connections`, `cards` (Node-
      Test-Runner o. Ä.) plus eine GitHub-Action, die Build + Tests + Lint fährt.
- [ ] **Fonts/Three lokal bündeln** – Google Fonts und ggf. Three-Addons lokal
      einbinden, damit die App offline/auf der Quest ohne Internet vollständig lädt.
- [ ] **Haptik** *(Hardware)* – kurzes Controller-Rumble beim Greifen, Menü-Klick,
      Verbinden und Löschen über `gamepad.hapticActuators`.
- [ ] **Hand-Tracking** *(Hardware)* – Pinch-Geste zum Anvisieren/Greifen von Karten
      und zum Zeichnen, zusätzlich zu den Controllern (Feature ist bereits als
      `hand-tracking` angefragt).
- [ ] **Sprachbefehle** *(Hardware)* – einfache Sprachkommandos („neue Karte",
      „verbinden", „zusammenfassen") über die Web Speech API, soweit vom Browser
      unterstützt.

## Wenn alle Punkte erledigt sind

Sind alle Kästchen abgehakt, macht der Lauf **keine** Code-Änderung mehr: kurz
melden, dass die Roadmap vollständig ist, und beenden (kein Leer-Commit).

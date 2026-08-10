# ROADMAP – automatisierte Tagesverbesserungen

Diese Datei ist der **Fortschritts-Tracker** für die tägliche Claude-Code-Routine.
Jeder Lauf nimmt sich **genau den ersten offenen Punkt** (`[ ]`) von oben, setzt ihn
vollständig um, verifiziert per Build, committet + pusht auf den Branch
`claude/vr-app-improvements-29f6oo` und hakt den Punkt hier ab (`[x]`).

**Reihenfolge = Priorität (von oben nach unten abarbeiten).** Ist ein Punkt bereits
teilweise vorhanden, wird er sinnvoll erweitert statt doppelt gebaut. Punkte, die
sich nur auf echter Quest-3-Hardware final abnehmen lassen, sind mit *(Hardware)*
markiert – Code wird trotzdem umgesetzt und per Build/Headless-Check geprüft.

Mehrere Punkte wurden zwischenzeitlich über andere Branches (PR #2–#6) erledigt,
ohne dass die Haken hier nachgezogen wurden. Der Stand unten ist am 2026-08-03
gegen den tatsächlichen Code geprüft.

## Aufgaben

- [x] **Matrix-Welt** – komplett weiße „Konstrukt"-Umgebung (nahtloser weißer Void).
      *(erledigt am 2026-07-20)*
- [x] **Undo/Redo** – Verlauf für Verschieben, Anlegen, Löschen, „Alles löschen",
      Cluster und Farbe. Menü-/Tastatur-Zugriff (Ctrl+Z / Ctrl+Shift+Z) und in VR
      ein Menüeintrag. Reine Logik, voll testbar.
      *(erledigt über PR #2, `src/history.js`; Haken nachgetragen am 2026-08-03)*
- [x] **KI-Fehlerbehandlung + Loading-Indikator** – Timeout, Retry mit Backoff und
      eine sichtbare Status-/Ladeanzeige im Raum, während Claude arbeitet; klare
      Fehlerkarte statt stillem Fehlschlag.
      *(erledigt über PR #2, `src/hud.js` + `src/ai.js`; Haken nachgetragen am 2026-08-03)*
- [x] **JSON-Export/Import** – Board als JSON-Datei herunterladen und wieder laden
      (Vorhandenes prüfen und ggf. auf Datei-Download + Import erweitern, auch aus VR
      erreichbar).
      *(erledigt über PR #2, `src/boardState.js`; Haken nachgetragen am 2026-08-03)*
- [x] **Prozessflussdiagramm** – Knotenarten mit eigener Form (Stadion, Rechteck,
      Raute), gerichtete Pfeile mit Beschriftung, automatisches geschichtetes
      Layout **von links nach rechts** (senkrecht ging der Platz aus),
      Bedienung in VR *und* am Desktop (Formleiste im Overlay und im
      Kontextmenü), Erzeugung aus einer Beschreibung durch Claude und Export als
      Mermaid (`src/flowLayout.js`, `FLOW_TYPES` in `src/cards.js`, Aktion
      `flow` in `server/ai-core.js`). *(erledigt am 2026-08-05)*
      *(QA-Runde am 2026-08-05: neun Befunde behoben – u. a. schief stehende
      Zweigbeschriftungen bei gedrehtem Player-Rig, ein gegriffener Knoten, der
      beim Anordnen am Rig hängenblieb, ein Schild am Weltursprung nach
      gelöschter Kante und sich stapelnde Geschwister bei vielen Zweigen.)*
      Offen als Fortsetzung: rechtwinklige Kantenführung wie bei Miro,
      `flowId` für mehrere Diagramme nebeneinander mit einer Zone als Rahmen,
      Schwimmbahnen für Rollen über `src/zones.js`, Mermaid-**Import**.
- [x] **Automatisches Mindmap-Layout** – ein Knopf ordnet die Karten radial nach
      ihren Verbindungen an: Wurzel in der Mitte (die ausgewählte Karte, sonst die
      bestverbundene), Spannbaum per Breitensuche, **Sektor proportional zur
      Größe des Teilbaums** statt gleicher Winkel für jeden Ast. Das flache
      Radiallayout wird auf eine gekrümmte Wand um den Nutzer projiziert, damit
      alles gleich weit weg und gleich lesbar bleibt; mehrere Inseln liegen
      nebeneinander, verbindungslose Karten in einer Reihe darunter. Die Karten
      **fahren** über eine knappe halbe Sekunde an ihren Platz (`src/tween.js`)
      statt zu springen. Bewusst deterministisch statt kräftebasiert: Zweimal
      denselben Knopf drücken muss zweimal dasselbe Bild ergeben.
      (`src/mindmapLayout.js`, Aktion `mindmap`). *(erledigt am 2026-08-09)*
      Offen als Fortsetzung: Kanten als Kurven statt Geraden, und ein zweiter
      Knopf, der nur den Teilbaum unter der ausgewählten Karte neu ordnet.
- [~] **Konstrukt-Dojo als fünfte Umgebung** – Samurai-Trainingsraum im Stil des
      Films, in eigenen Dateien unter `src/dojo/`. Erste Umgebung der App mit
      echten Schatten, PBR-Materialien und prozeduraler Environment-Map.
      Zeichenlast im Budget (67 Draw-Calls, 100k Dreiecke).
      **Vier Kritik-Runden gegen die Rubrik: 0/9 → 2/9 → 6/9.**
      **Erledigt am 2026-08-10** (die vier Rückfragen zu den Referenzbildern):
      • Dach: offener Giebeldachstuhl durch geschlossene Decke ersetzt, dazu ein
        Walmdach nach außen. Magenta-Lochprobe **0,0 %** (vorher 0,429 %).
      • Schwarze Wand ins Nichts: Südseite ist eine volle Wand mit Shoji-Front;
        der Raum ist nach Süden von 9 auf 14 m verlängert.
      • Abstehende Fensterstäbe: Sprossen sind skalierte Einheitswürfel ohne
        Drehung. Zusätzlich fand `windows.mjs` einen zweiten, kleineren Fall
        derselben Art (3 mm Überstand auf Nord und Süd).
      • Schwerter auf dem Ständer: Auflage ist jetzt eine Kerbe, Neigung und
        Höhe werden geschlossen gelöst. Gemessen liegen alle sechs
        Auflagepunkte innerhalb **±0,17 mm**.
      • Fenster auf allen leeren Wänden; das Ranma hatte ein Vorzeichenproblem,
        das in der Brille drei Wände geöffnet hätte.
      • Außenwelt: Bambushain als Schattenwerfer auf dem Washi (25,8 % der
        Fensterbreite, 34 Wechsel), Baumlinie, Moosfläche.
      • Begrenzung: Der Raum lässt sich nicht mehr verlassen.
      **Nachgezogen am 2026-08-10 (zweite Runde Nutzerkritik):**
      • Ranma: Kumiko-Felder statt Lattenzaun, Papier warm statt himmelblau.
      • Lichtschächte sind in der Brille wieder an. Sie waren pauschal
        abgeschaltet, weil eine Messung auf **SwiftShader** 10,6 % ergab –
        aus einer übertragbaren Rangfolge war ein nicht übertragbarer Faktor
        geworden. Auf der Quest 3 war deshalb kein einziger Strahl zu sehen.
      • Süd-Eingang: zwei Felder der Front stehen offen, dahinter der Garten.
      • Waffenwand: Ständer mit Naginata, Yari, Bo, Jo und den beiden Bokken,
        die vorher frei an der Wand lehnten; Wandbild in Tusche auf Goldgrund;
        zwei Bodenvasen am Eingang.
      **Offen:**
      • Frame-Zeit: Desktop 7,9× Zen-Garten, XR-Stufe 3,6× – **das Gate von
        3,5× ist knapp verfehlt.** Die Lichtschächte kommen seit dieser Runde
        wieder dazu; neu gemessen ist das noch nicht. Nach Runde 5 lag die XR-Stufe bei 1,16×;
        seither ist der Raum 55 % größer und hat eine Außenwelt. Die p95-
        Referenz schwankt zwischen identischen Läufen um rund 10 %.
        Auf der Quest 3 weiterhin **ungeprüft**.
      • Die Sonnenseite liest sich weiter als großer heller Bereich. Geklemmt
        ist gemessen nichts (0 % gesättigt, Spitze 228 von 255) – es ist eine
        Frage der Komposition, nicht der Belichtung.
      • Coderegen ist als Motiv lesbar, aber flächenmäßig noch ein Token.
      • Tatami-Geflecht liest sich als Textil-Abziehbild statt als Binsen.
      *(Stand 2026-08-10)*
- [ ] **Snap-Grid** – optionales Einrasten der Karten an einem Raster zum sauberen
      Ausrichten. *(Das „Karten zu mir holen" aus diesem Punkt ist erledigt:
      `recenterOnNextFrame` in `src/main.js` ordnet beim XR-Start neu an.)*
- [x] **A11y/Komfort – Schriftgröße** – umschaltbare Kartenschrift in drei Stufen
      (Normal · Groß · Sehr groß), über Menü und Overlay erreichbar, gilt für neue
      Karten und überdauert einen Reload. *(erledigt am 2026-08-03)*
      Kontrast-Umschaltung und Motion-Sickness-Vignette sind auf Wunsch bewusst
      **nicht** Teil des Punktes.
- [x] **Model-Update** – serverseitiges Modell auf `claude-sonnet-5` gehoben
      (`server/ai-core.js`), inkl. README. *(erledigt am 2026-08-03)*
- [ ] **Tests & CI** – Unit-Tests für `boardState`, `connections`, `cards` (Node-
      Test-Runner o. Ä.) plus eine GitHub-Action, die Build + Tests + Lint fährt.
- [x] **Fonts lokal bündeln** – *Space Grotesk* und *Sora* über `@fontsource` im
      Build statt vom Google-CDN (`src/fonts.js`); die 3D-Panels zeichnen nach dem
      Laden einmal nach. Three-Addons kamen ohnehin schon aus `node_modules`, nicht
      von einem CDN. *(erledigt am 2026-08-03)*
- [x] **Haptik** *(Hardware)* – kurzes Controller-Rumble beim Greifen/Ablegen,
      Menü-Klick, Verbinden, Löschen und bei Fehlerkarten (`src/haptics.js`).
      *(Code erledigt am 2026-08-03; das Rumpeln selbst lässt sich nur auf dem
      Headset beurteilen – die Intensitäten stehen als benannte Muster in
      `PATTERNS`.)*
- [x] **Hand-Tracking** *(Hardware)* – Pinch zum Anvisieren/Greifen von Karten und
      zum Zeichnen sowie Menü auf der Handfläche.
      *(erledigt über PR #4/#5; Haken nachgetragen am 2026-08-03)*
- [x] **Sprachbefehle** – Diktat mit Live-Zwischenergebnis („🎤 Diktieren") und
      abschaltbare Dauer-Sprachbefehle für 20 Aktionen (`src/speech.js`),
      **beides nur am Desktop** (Chrome/Edge).
      *(Auf der Quest verworfen und am 2026-08-05 wieder ausgebaut: Der
      Quest-Browser meldet `webkitSpeechRecognition`, hat darunter aber keinen
      Erkennungsdienst – der Aufruf riss den Browser mit. Auch der Umweg über
      die Systemtastatur der Brille trug auf echter Hardware nicht. In XR wird
      getippt; die Spracherkennung ist dort doppelt gesperrt.)*

## Wenn alle Punkte erledigt sind

Sind alle Kästchen abgehakt, macht der Lauf **keine** Code-Änderung mehr: kurz
melden, dass die Roadmap vollständig ist, und beenden (kein Leer-Commit).

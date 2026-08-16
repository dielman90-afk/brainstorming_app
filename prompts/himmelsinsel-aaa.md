# Prompt: Himmelsinsel auf AAA-Niveau bringen

> Fertiger Prompt zum Einfügen in Claude Code. Modell: `claude-opus-5`, Reasoning-Effort **high**
> (`/model opus`, Effort auf „high" stellen). Genau **ein** unterstützender Sub-Agent.

---

## Auftrag

Bring die Umgebung **🏝 Himmelsinsel** in `src/environments.js` auf das visuell bestmögliche
Niveau, das auf einer Meta Quest 3 standalone bei stabilen 72 fps läuft. Die Umgebung
existiert bereits – du baust sie **nicht neu**, du überarbeitest sie in mehreren
Durchläufen, bis jedes Detail sitzt.

Einstiegspunkt: `createIslandEnvironment()` in `src/environments.js:762`. Zugehörige
Bausteine: `buildIsland`, `makeTree`, `addGrassDecoration`, `addUndergrowth`,
`makeWaterfall`, `makeCloud`, `makeVines`, `makeBirds`, `makeButterflies`, `makeDome`,
`displaceRadial`, `paintVertices`, `bakeVertexShade`.

## Harte Rahmenbedingungen (nicht verhandelbar)

1. **Rein prozedural.** Keine externen Assets: keine GLB/GLTF, keine Bilddateien, keine
   CDN-Requests. Geometrie aus Code, Texturen aus `<canvas>` – genau wie der Bestand.
2. **Keine neuen Runtime-Abhängigkeiten.** `three@^0.185` und was schon in
   `package.json` steht. Playwright darf als *Dev*-Werkzeug für Screenshots dazu.
3. **Performance-Budget** für die Insel-Umgebung, gemessen bei aktiver Insel:
   - ≤ **120 Draw-Calls** für `env-island` (aktuell: als Erstes messen und notieren)
   - ≤ **350 k Dreiecke** in der gesamten Szene
   - ≤ **60 MB** GPU-Texturspeicher
   - Frame-Zeit im Desktop-Headless-Harness ≤ **8 ms/Frame** (Proxy für 72 fps auf XR2)
   - Instancing (`InstancedMesh`) und Geometrie-Merging bleiben Pflicht, nicht Kür.
4. **Keine Regression.** Karten, Whiteboard, Wrist-Menü, Locomotion, Zonen und die
   anderen drei Umgebungen müssen unverändert funktionieren. `npm run build` muss nach
   jedem Durchlauf grün sein.
5. **Maßstab bleibt.** `WORLD_SCALE = 4`; die Insel ist ~40 m breit, Bäume ~6 m. Wer
   daran dreht, bricht Fog-Distanzen, Locomotion und Kartenplatzierung.

## Die Messlatte

Vergleiche **nicht** gegen Call of Duty – ein Konsolentitel mit 200 GB Assets und 200 W
GPU ist keine erreichbare Referenz für eine 5-MB-WebXR-App auf mobiler Hardware, und ein
Prüfer mit dieser Latte sagt nie „bestanden".

Die richtige Messlatte ist: **stilisierte AAA-Qualität im Rahmen des Machbaren** – der
Look von *Journey*, *Sky: Children of the Light*, *The Witness*, *Ghibli*-Landschaften.
Konkret prüfbar:

- **Silhouette:** Liest sich die Inselform auch als schwarze Kontur noch interessant?
- **Komposition:** Führt der Blick? Gibt es Vorder-, Mittel- und Hintergrund?
- **Lichtführung:** Gerichtetes Sonnenlicht, Rim-Light auf Silhouetten, Bounce-Fill von
  unten, konsistente Schattenrichtung überall.
- **Farbharmonie:** Begrenzte, abgestimmte Palette. Keine gesättigten Primärfarben nebeneinander.
- **Materialtrennung:** Fels ≠ Erde ≠ Gras ≠ Wasser ≠ Blattwerk – erkennbar an Ton,
  Rauheit und Vertex-Shading, nicht nur an der Farbe.
- **Tiefenstaffelung:** Atmosphärische Perspektive, ferne Inseln blasser und blauer.
- **Bewegung:** Nichts steht still, nichts zappelt. Wolken, Vögel, Wasser, Gras im Wind –
  alle mit unterschiedlichen Frequenzen, kein sichtbarer Gleichtakt.
- **Kein „Programmierer-Tell":** keine sichtbar wiederholten Instanzen im Raster, keine
  z-fighting-Kanten, keine harten Übergänge Insel↔Fels, keine schwebenden Objekte.

## Rollenverteilung

**Du (Hauptagent)** implementierst. Alles.

**Genau ein Sub-Agent** unterstützt dich – der **Prüfer**. Kein Fan-out, keine
Parallel-Agents, kein Agent pro Arbeitspaket. Ein einziger Prüfer, den du in jedem
Durchlauf neu beauftragst.

Der Prüfer:
- läuft ebenfalls auf `claude-opus-5` mit Reasoning-Effort **high**
- bekommt die Screenshots des aktuellen Stands, die Messlatte oben und die Zahlen aus
  dem Performance-Budget
- ist ein **strenger Kritiker**: Er sucht aktiv nach Schwächen und benennt sie konkret
  („der Übergang von Grasplatte zu Felsunterseite ist eine harte Kante bei y≈0,
  es fehlt eine Erdschicht mit ausgefransten Vertices"), nicht pauschal („sieht noch
  nicht AAA aus")
- gibt pro Kriterium der Messlatte ein Urteil: **bestanden / nicht bestanden**, jeweils
  mit Begründung
- schlägt **keine** Implementierung vor und schreibt **keinen** Code – er urteilt und
  listet Defekte, priorisiert nach visueller Wirkung

## Ablauf: mehrere Durchläufe mit mehreren Prüfungen

### Durchlauf 0 – Bestandsaufnahme

1. Lies `createIslandEnvironment()` und alle genannten Bausteine vollständig.
2. Baue ein **Screenshot-Harness** (Playwright, Chromium ist unter
   `/opt/pw-browsers` vorinstalliert – kein `playwright install`): lädt die App im
   Desktop-Modus, schaltet auf die Insel, macht Screenshots aus **sechs festen
   Kamerapositionen** (Augenhöhe Inselmitte / Blick zum Wasserfall / Blick über die
   Kante nach unten / Totale von schräg oben / Gegenlicht in die Sonne /
   Nahaufnahme Bodenvegetation). Kamerapositionen bleiben über alle Durchläufe
   **identisch**, sonst sind die Vergleiche wertlos.
   Für die Ansteuerung darfst du einen Debug-Parameter (`?env=island&shot=1`)
   ergänzen; er darf das normale Verhalten der App nicht ändern.
3. Baue ein **Mess-Harness**: liest `renderer.info` (Draw-Calls, Dreiecke, Programme,
   Texturspeicher) und die mittlere Frame-Zeit über 300 Frames aus und schreibt sie als
   JSON.
4. Führe beides aus, notiere die **Ausgangswerte** in `prompts/himmelsinsel-log.md`.
5. Lege die Arbeitspakete fest (Reihenfolge = Priorität, nach visueller Wirkung):
   1. **Silhouette & Fels** – Inselunterseite, Schichtung, Zerklüftung, Übergang zur Grasplatte
   2. **Licht & Atmosphäre** – Sonne, Rim-Light, Dunst, Fog-Kurve, Himmelsgradient
   3. **Terrain-Material** – Vertex-Shading, Moos in Senken, Erdkanten, Farbvariation
   4. **Vegetation** – Baumform und Blattmassen, Gras, Unterwuchs, Windbewegung
   5. **Wasser** – Fluss, Wasserfall, Schaum, Gischt, Regenbogen, Kantenauflösung
   6. **Wolken & Tiefe** – Volumeneindruck, Schichten, atmosphärische Perspektive
   7. **Leben** – Vögel, Schmetterlinge, Bewegungsvielfalt
   8. **Mini-Inseln** – Variation statt Kopie, Komposition am Horizont
   9. **Performance-Pass** – zurück ins Budget, ohne den Look zu verlieren

### Pro Durchlauf (ein Arbeitspaket)

**Phase A – Bauen.** Setze das Arbeitspaket vollständig um. Ein Paket pro Durchlauf,
nicht drei halbe.

**Phase B – Prüfung 1: Build.** `npm run build` muss fehlerfrei durchlaufen. Zusätzlich:
Konsole im Headless-Lauf muss frei von Errors und Warnings sein.

**Phase C – Prüfung 2: Screenshots.** Harness ausführen, sechs Bilder erzeugen.

**Phase D – Prüfung 3: Performance.** Mess-Harness ausführen. Verletzt ein Wert das
Budget, wird **in diesem Durchlauf** nachgebessert – nicht auf den Performance-Pass
verschoben.

**Phase E – Prüfung 4: Regression.** Kurzer Durchklick der drei anderen Umgebungen im
Harness, plus ein Screenshot je Umgebung. Nichts darf sich dort verändert haben.

**Phase F – Prüfung 5: Der Prüfer.** Beauftrage den einen Sub-Agenten mit den sechs
Screenshots, der Messlatte und den Messwerten. Er urteilt pro Kriterium.

**Phase G – Auswertung.**
- Urteil **nicht bestanden** → seine Defektliste wird zum Inhalt des nächsten
  Durchlaufs für **dieses** Arbeitspaket. Zurück zu Phase A.
- Urteil **bestanden** → committen (Format unten), Arbeitspaket abhaken, nächstes
  Arbeitspaket.

**Maximal 4 Durchläufe pro Arbeitspaket.** Ist ein Paket danach nicht bestanden,
schreibe die offenen Punkte in `prompts/himmelsinsel-log.md`, sag es mir im Klartext und
geh zum nächsten Paket weiter. Kein endloses Kreisen an einem Detail.

### Abschluss

Wenn alle neun Pakete durch sind, folgt ein **Gesamtdurchlauf**: alle sechs Screenshots
frisch, Prüfer beurteilt die Komposition als Ganzes gegen die volle Messlatte. Sein
Urteil in zwei aufeinanderfolgenden Gesamtdurchläufen ohne neue Defekte = fertig.

## Abbruchbedingungen

Halt an und melde dich bei mir, wenn:
- ein Arbeitspaket nach 4 Durchläufen nicht bestanden ist (weitermachen, aber melden)
- das Performance-Budget nur zulasten des Looks einzuhalten wäre – dann will ich die
  Abwägung selbst treffen
- eine Änderung eine andere Umgebung oder eine App-Funktion brechen würde
- der Prüfer dreimal hintereinander dieselbe Kritik ohne erkennbaren Fortschritt äußert

## Commits

Ein Commit pro bestandenem Arbeitspaket, auf `claude/flying-islands-prompt-optimization-4w3xj2`.
Nachricht: was sich **sichtbar** geändert hat, plus die Messwerte vorher/nach.
Nicht: „improve island". Sondern: „Felsunterseite der Insel schichten und ausfransen –
Draw-Calls 84→91, Frame 6,2→6,4 ms".

Screenshot-Harness und Mess-Harness kommen nach `tools/`, nicht nach `src/`.
`prompts/himmelsinsel-log.md` wird bei jedem Durchlauf fortgeschrieben: Paket,
Durchlauf-Nr., Messwerte, Prüfer-Urteil, offene Punkte.

## Ehrlichkeit

Berichte den Stand so, wie er ist. Wenn ein Paket bei „gut, aber nicht überragend"
landet, schreib das hin. Ein geschöntes „AAA erreicht" ist wertlos – ich schaue mir die
Screenshots selbst an.

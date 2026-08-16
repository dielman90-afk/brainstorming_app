# 🏝 Himmelsinsel – Überarbeitungsprotokoll

Fortlaufendes Protokoll der Durchläufe: Arbeitspaket, Durchlauf-Nr., Messwerte,
Prüfer-Urteil, offene Punkte.

## Werkzeuge

| Datei | Zweck |
| --- | --- |
| `tools/harness-common.mjs` | Server-Start, Browser, App-Bootstrap, **die sechs festen Kamerapositionen** |
| `tools/screenshots.mjs` | Sechs Insel-Ansichten (+ `--all-envs`: je ein Bild der drei anderen Umgebungen) |
| `tools/measure.mjs` | Draw-Calls, Dreiecke, Programme, Texturspeicher, Frame-Zeit → JSON |
| `tools/inspect.mjs` | Aufschlüsselung: woraus die Draw-Calls bestehen |
| `tools/verify.mjs` | Ein Kommando: Build → Screenshots → Messung → Budget-Urteil |

Aufruf eines Durchlaufs: `node tools/verify.mjs run-NN`

### Kamerapositionen (unveränderlich)

| # | Name | Position | Blickziel | FOV |
| --- | --- | --- | --- | --- |
| 1 | Augenhöhe Inselmitte | 1.5 / 1.6 / 9.0 | −2 / 1.2 / −14 | 70° |
| 2 | Blick zum Wasserfall | −2 / 1.7 / 6.0 | 15.5 / −1.5 / −9.1 | 65° |
| 3 | Über die Kante nach unten | 0 / 2.0 / 18.5 | 0 / −13 / 27 | 75° |
| 4 | Totale von schräg oben | 36 / 24 / 38 | 0 / −4 / 0 | 55° |
| 5 | Gegenlicht in die Sonne | −9 / 1.7 / 12 | 22 / 14 / −18 | 70° |
| 6 | Nahaufnahme Bodenvegetation | 4.6 / 0.55 / 7.4 | 1.0 / −0.15 / 1.6 | 60° |

### Ehrliche Einordnung der Frame-Zeit

Der Container hat **keine GPU** (`/dev/dri` fehlt); Chromium rendert per
SwiftShader in Software. Zum Vergleich: die leere ⬜-Konstrukt-Umgebung kostet
bei 1280×720 rund **0,45 ms**, die Insel im Ausgangsstand **105–175 ms**. Der
im Auftrag genannte Zielwert „≤ 8 ms im Desktop-Headless-Harness" ist unter
einem Software-Rasterizer für **keine** nicht-triviale Szene erreichbar und
sagt nichts über die Quest 3 aus. Die Zahl wird deshalb als **relativer**
Vergleichswert zwischen zwei Ständen geführt, nicht als bestandene/nicht
bestandene Budgetgrenze. Die belastbaren Budgetgrenzen sind Draw-Calls,
Dreiecke und Texturspeicher – und die sind auf der Quest ohnehin die
entscheidenden Größen.

---

## Durchlauf 0 – Bestandsaufnahme (Ausgangswerte)

Commit-Basis: `claude/himmelsinsel-optimization-2g3px8`, Stand vor der Überarbeitung.

### Messwerte (`tools/metrics/run-00.json`)

| Kameraposition | Draw-Calls | Dreiecke | Renderzeit (SW) |
| --- | ---: | ---: | ---: |
| 1 Augenhöhe | 102 | 25 744 | 114,5 ms |
| 2 Wasserfall | 84 | 18 714 | 168,8 ms |
| 3 Kante | 112 | 29 036 | 174,5 ms |
| 4 Totale | 111 | 30 752 | 105,3 ms |
| 5 Gegenlicht | 95 | 20 758 | 127,4 ms |
| 6 Bodennah | 78 | 21 768 | 130,6 ms |

| Budget | Ist | Grenze | |
| --- | ---: | ---: | --- |
| Draw-Calls (env-island) | **112** | 120 | knapp – nur 8 Reserve |
| Dreiecke (Szene) | 30 752 | 350 000 | 11× Reserve |
| Texturspeicher | 0,50 MB | 60 MB | 120× Reserve |
| Shader-Programme | 12 | – | |
| Konsole | sauber | – | |

### Aufschlüsselung der Draw-Calls (`tools/inspect.mjs`)

| Art | Knoten | Calls | Dreiecke |
| --- | ---: | ---: | ---: |
| Icosaeder-Meshes (Steine, Blumen-Einzelteile) | 40 | 40 | 1 880 |
| BufferGeometry (25 Wolken, 6 Felsunterseiten, 6 Rankenbündel, Fluss) | 38 | 38 | 41 356 |
| Cylinder (Baumstämme, mehrmaterialig) | 19 | 31 | 1 568 |
| **Blob-Schatten** | **28** | **28** | 56 |
| CircleGeometry (Quelle, Becken) | 12 | 12 | 148 |
| ConeGeometry (Nadelbaum-Etagen) | 10 | 10 | 280 |
| PlaneGeometry (Vogelflügel) | 8 | 8 | 16 |
| Sprites (Sonne, Dunst, Gischt, Schaum) | 4 | 4 | 0 |
| InstancedMesh (Blumen, Grasbüschel, Büsche, Pilze) | 4 | 4 | 3 392 |
| Sonstige (Kuppel, Regenbogen, Wassertropfen) | 3 | 3 | 2 416 |
| **Summe** | **166** | **178 potentiell / 112 gerendert** | 51 112 |

### Befund

Das Budget ist **falsch verteilt**: Draw-Calls sind zu 93 % ausgereizt,
Dreiecke zu 9 %, Texturspeicher zu 0,8 %. Die Umgebung besteht aus sehr vielen
sehr einfachen Einzelobjekten – genau das Profil, das eine mobile GPU
(Quest 3, XR2 Gen 2) am schlechtesten verträgt. Allein 28 Draw-Calls gehen für
Blob-Schatten mit zusammen 56 Dreiecken drauf.

Die Überarbeitung muss deshalb zuerst **verschmelzen und instanzieren**, um
Draw-Calls freizuräumen, und den freien Dreiecks- und Texturspeicher in echte
Form- und Materialdichte investieren.

### Arbeitspakete (Reihenfolge = Priorität)

1. Silhouette & Fels
2. Licht & Atmosphäre
3. Terrain-Material
4. Vegetation
5. Wasser
6. Wolken & Tiefe
7. Leben
8. Mini-Inseln
9. Performance-Pass

### Nebenbei behoben (Voraussetzung für „Konsole sauber")

- `THREE.Clock` → `THREE.Timer` in `src/main.js` (three r185 warnt bei jedem Start).
- `getContext('2d', { willReadFrequently: true })` für die Bildröhre im ⬜ Konstrukt.

Beides ist verhaltensneutral; die Regressionsbilder der drei anderen Umgebungen
liegen als Referenz in `tools/shots/reference/`.

### Korrektur am Harness (nach Durchlauf 1 gefunden)

Zwei Fehler im Harness, die die ersten Bilder wertlos machten – beide behoben,
`run-00` wurde danach mit dem unveränderten Ausgangsstand **neu erzeugt**:

1. `OrbitControls.update()` ruft am Ende `lookAt(controls.target)` auf und hat
   jede von außen gesetzte Blickrichtung überschrieben. Alle sechs Bilder
   zeigten in Wahrheit dieselbe Richtung. Der Harness setzt jetzt zusätzlich
   `controls.target`.
2. Kamera 3 („über die Kante nach unten") stand auf der Insel und blickte über
   den neuen Randwall in den leeren Himmel. Sie steht jetzt knapp außerhalb der
   Abbruchkante und blickt zurück und hinab – sie zeigt Grasnarbe, Erdschicht
   und Fels in einem Bild, also genau das, worum es in Paket 1 geht.

Die Kamerapositionen sind seit `run-00` (neu) unverändert und bleiben es.

---

## Paket 1 – Silhouette & Fels

### Was gebaut wurde

Der Inselkörper war eine `CylinderGeometry` (Grasplatte) mit einer
`ConeGeometry` darunter (Fels) – zwei getrennte Rotationskörper mit einer
harten Kante dazwischen. Er ist jetzt **ein** Gitter aus einer analytischen
Formbeschreibung (`makeIslandShape`):

- **Grundriss** nicht mehr kreisrund: gewellter Umriss plus eine vorspringende
  Landzunge und eine Bucht.
- **Oberfläche** in der Mitte bewusst eben (siehe Einschränkung unten), nach
  außen ein weicher Höhenrücken gegenüber dem Wasserfall, am Rand abgerundete
  Traufkante, dazu eine eingeschnittene Flussrinne.
- **Flanke** in einem Zug: Erdschicht mit senkrechten Auswaschungsstreifen,
  darunter geschichteter Fels – Bänke mit scharfer Oberkante, schräg liegend
  und pro Sektor versetzt, dazu grobe Felsplatten (18 Sektoren × Tiefenbänder)
  für große ebene Wandflächen, senkrechte Risse und zwei bis drei
  Strebepfeiler, die ihren Sektor tiefer ziehen.
- **Keil statt Kegel**: die Masse bleibt unten zusammen und endet stumpf,
  seitlich versetzt (`lean`), statt in eine Eiszapfen-Nadel auszulaufen.
- Drei Materialgruppen auf einem Mesh: Gras (glatt, stumpf), Erde (glatt, ganz
  stumpf), Fels (facettiert, etwas glänzender).
- Alles Übrige sitzt jetzt auf `shape.heightAt(x, z)`: Bäume, Findlinge,
  Blumen, Grasbüschel, Büsche, Pilze, Quelle, Fluss, Auffangbecken. Nichts
  schwebt mehr, nichts steckt im Boden.
- Draw-Call-Umbau: Baumstämme, Blattwerk, Findlinge, Wurzelvorhänge und
  **alle Kontaktschatten** je Insel zu einem Mesh verschmolzen (vorher 28
  Draw-Calls allein für Schatten mit zusammen 56 Dreiecken).

### Wichtige Einschränkung, bewusst so entschieden

`locomotion.js` kennt kein Gelände – der Nutzer läuft immer auf y = 0. Ein
durchgehend hügeliges Oberdeck ließe ihn in Kuppen versinken. Die begehbare
Innenfläche (bis 58 % des Radius, rund 23 m Durchmesser) bleibt deshalb eben;
die Höhenentwicklung setzt erst außerhalb ein. Das kostet Relief in der
Bildmitte und ist der Preis dafür, dass die Fortbewegung unverändert
funktioniert. Wenn hier mehr Relief gewünscht ist, braucht `locomotion.js`
eine Geländeabfrage – das wäre eine Änderung an einer App-Funktion und steht
so nicht im Auftrag.

### Ein echter Fehler, gefunden und behoben

Der innerste Gitterring liegt komplett im Mittelpunkt; dort ist das
Kreuzprodukt zur Normalenberechnung null. Ohne Sonderbehandlung blieb die
Normale (0,0,0) – die Fläche wurde **stockschwarz** gerendert, ein rund 2 m
großes schwarzes Loch mitten im Gras (`tools/shots/debug/only-body.png`).

### Messwerte

| Durchlauf | Draw-Calls | Dreiecke | Texturspeicher | Konsole |
| --- | ---: | ---: | ---: | --- |
| run-00 (Ausgang) | 112 | 27 816 | 0,50 MB | sauber |
| run-01 | 70 | 44 254 | 0,50 MB | sauber |
| run-02 | 72 | 45 731 | 0,50 MB | sauber |
| run-03 | 71 | 49 112 | 0,50 MB | sauber |
| run-04 | 71 | 49 112 | 0,50 MB | sauber |
| run-05 | 73 | 53 787 | 0,50 MB | sauber |
| run-06 | 73 | 53 787 | 0,50 MB | sauber |
| run-07 | 73 | 53 787 | 0,50 MB | sauber |

Draw-Calls **112 → 71** bei gleichzeitig dreifacher Baumzahl, doppelter
Findlingszahl und deutlich dichterem Inselgitter. Dreiecke 27 816 → 49 112,
das sind 14 % des Budgets.

### Zwischenschritte (Selbstkritik vor dem Prüfer)

- run-01: Der ausgefranste Materialübergang Gras→Erde wurde pro Viereck
  entschieden und ergab eine **Treppe aus rechten Winkeln** – ein
  Lehrbuch-„Programmierer-Tell". Der Übergang läuft seit run-02 über die
  Vertex-Farbe und ist damit stufenlos.
- run-01/02: Die Schichtbänke liefen als saubere Ringe um die Insel („wie
  gedrechselt"). Seit run-03 sind sie pro Sektor verschoben und geneigt.
- run-02: Der Fels lief in eine dünne Nadel aus. Seit run-03 endet er stumpf.
- Der Fels war in run-01–03 deutlich zu hell (beige/kalkweiß). Ursache ist
  überwiegend die Beleuchtung: Szene und Umgebung summieren sich auf eine
  Bestrahlung weit über 1, alles läuft ins Weiße. In run-04 wurden die
  Umgebungslichter vorläufig gesenkt (Sonne 1,9 → 1,35, Hemisphäre 1,15 →
  0,75) – die eigentliche Lichtführung ist Paket 2.

### Prüfung 1 (nach run-04): NICHT BESTANDEN

Der Prüfer hat alle acht Kriterien bewertet – sieben nicht bestanden, Bewegung
aus Standbildern nicht beurteilbar – und zehn lokalisierte Paket-1-Defekte
gemeldet. Die schwersten:

- **B1** Grundriss durchgehend konvex, keine einzige Einbuchtung. „Als schwarze
  Silhouette wäre run-04 kaum von run-00 zu unterscheiden."
- **B2** Erde↔Fels als umlaufend höhengleiche Kante, Erdschicht überall gleich
  dick – der stärkste Programmierer-Tell im Bild.
- **B3** Grasplatte als gleichmäßig dicke, rundgeschliffene „Zuckerguss"-Kante.
- **B4** Terrassen ohne Größenhierarchie, alle Formen derselben Größenordnung.
- **B5** Fels und Erde im gleichen Hellwert; Fels so hell wie die besonnte
  Grasoberseite.
- **B6** Unterseite endet als Sägezahnreihe statt als Kiel.
- **B7** Profil spiegelsymmetrisch, nirgends ein Überhang.
- **B8** Ranken setzen sichtbar neben der Felsoberfläche an.
- **B9/B10** Mini-Inseln als erkennbare Kopie; harte Schnittkante Gras↔Fels dort.

Zusätzlich als schwerster Einzelbefund der ganzen Serie: **in keinem der sechs
Bilder gibt es einen einzigen Schlagschatten** – nichts steht, alles schwebt
auf dem Boden. Das gehört zu Paket 2.

### Nacharbeit (run-05 bis run-07)

- **B1**: Landzunge (+0,30), tiefe Bucht (−0,24) und schmaler Einschnitt
  (−0,17) statt ±8 % Welligkeit. Der Radius schwankt jetzt zwischen rund 0,6
  und 1,3 – echte Konkavität.
- **B2**: Dicke der Erdschicht schwankt um etwa Faktor 10 über den Umfang;
  an manchen Stellen stößt der Fels bis unter die Grasnarbe durch.
- **B3**: Grasnarbe zieht sich nur noch halb so weit über die Kante; dazu ein
  ungleichmäßiger Abriss (Zungen und Kerben) in der Geometrie am äußersten
  Rand, eine kürzere und steilere Traufkante und teilversenkte Felsknöchel im
  Kantensaum.
- **B4**: EIN dominanter Kiel (Breite 0,62, Tiefenzuschlag bis 0,62) plus zwei
  bis drei kleinere Strebepfeiler; Bankdicke, Sektorzahl und Neigung je Insel
  neu gewürfelt.
- **B5**: Fels deutlich dunkler und kühler (L 0,095 statt 0,175, Sättigung
  halbiert), Erde bleibt warm; Verdunklung nach unten von 0,52 auf 0,62.
- **B6/B7**: stumpf endender Keil, überkragendes Gesims und eine durchgehende
  Kaminspalte.
- **B8**: Ranken stecken im Fels statt auf der Haut zu sitzen, mit Wurzelteller
  am Ansatz.
- **B10**: Felston von Findlingen, Knöcheln und Inselkörper angeglichen.

### Prüfung 2 (nach run-07)

Läuft.

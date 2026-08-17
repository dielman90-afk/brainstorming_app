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

## Stand der Arbeit

| Paket | Stand |
| --- | --- |
| 0 Bestandsaufnahme | abgeschlossen |
| **Zwischenschritt: Branch-Zusammenführung** | PR #9 (60 Commits) in den Default-Branch, Vegetation daraus übernommen und ins Draw-Call-Budget verschmolzen (129 → 85) |
| 1 Silhouette & Fels | abgeschlossen, **nicht bestanden** – 5 offene Punkte |
| 2 Licht & Atmosphäre | abgeschlossen, **nicht bestanden** – Kriterium 6 bestanden, 5 offene Punkte |
| 3 Terrain-Material | Durchlauf 3 gebaut, zweite Prüfung läuft |
| 4 Vegetation … 9 Performance-Pass | offen |

**Budget durchgehend eingehalten:** 93 von 120 Draw-Calls, 173 667 von 350 000
Dreiecken, 11,83 von 60 MB Texturspeicher. Konsole sauber, Build grün, die vier
anderen Umgebungen unverändert.

**Bestandene Messlatten-Kriterien: 1 von 8** (Tiefenstaffelung). Der Fortschritt
ist real und in jeder Runde nachgemessen, aber die Messlatte ist hoch angesetzt.

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

### Prüfung 2 (nach run-07): NICHT BESTANDEN

6 von 10 Defekten behoben (B1 Grundriss, B2 Erde↔Fels-Kante, B5 Tontrennung,
B6 Kiel, B7 Undercut/Kaminspalte, B9 Mini-Insel-Formen), 4 teilweise
(B3, B4, B8, B10). Dazu fünf **neue** Defekte, die die Änderungen erzeugt haben:

- **N1** Die Felswand ist jetzt gleichförmiges Splitterrauschen: „Der alte
  Fehler war zu viel Regelmäßigkeit – der neue ist zu viel gleichverteilte
  Unregelmäßigkeit." Es fehlen große ruhige Wandflächen, gegen die sich der
  Bruch abheben kann.
- **N2** Der dunklere Klippenfels hat die Szene in zwei unvereinbare
  Felsfamilien gespalten – die Findlinge auf der Wiese blieben hell.
- **N3** Durch die stellenweise auf null gehende Erddicke ist die Erdschicht
  ausgerechnet in der Totale fast nicht mehr zu sehen.
- **N4** Die Ranken haben keinen Durchhang und laufen als Haarlinien über die
  Felskontur vor den Himmel.
- **N5** Die neuen Kantensaum-Knöchel stecken mit harter, gerader
  Durchdringungslinie in der Wiese.

### Nacharbeit (run-08, run-09)

- **N1**: Bruchzonen-Maske über die Wand; hochfrequente Rauschanteile halbiert,
  niederfrequente verstärkt; Felsplatten größer (10–14 Sektoren statt 14–22).
- **N2**: Findlinge, Quellsteine und Knöchel auf dieselbe Palette wie der
  Klippenfels (Helligkeit 0,20–0,32 → 0,115–0,19).
- **N3**: Untergrenze der Erddicke angehoben, sie geht nirgends mehr auf null.
- **N4**: Ranken doppelt so dick, mit Kettenlinien-Durchhang, oben dick nach
  unten dünn; Wurzelteller entfernt (sie lagen als brauner Span auf der Wand).
- **N5**: Knöchel kleiner, tiefer versenkt, nur noch ganz außen, mit erdigem
  Fuß und flachem Erdaufwurf.
- **B3**: Grasnarbe zieht sich nochmals halb so weit über die Kante; der Abriss
  wirkt jetzt über den ganzen Umfang statt nur punktuell.

**run-08 war ein Rückschritt** und wird hier festgehalten, weil das Muster
lehrreich ist: Der erdige Fuß der Knöchel färbte über den gewählten
Verlaufsbereich den *ganzen* Block sandbraun, und der „Erdaufwurf" war so groß
und flach, dass die Blöcke als Tische auf der Grasnarbe lagen. In run-09
korrigiert.

Außerhalb von Paket 1 vorgezogen: Die Fliegenpilze waren in drei von sechs
Bildern das größte und lauteste Objekt im Frame (voll gesättigtes Rot). Sie
sind jetzt auf ein Drittel verkleinert und entsättigt – das gehört eigentlich
zu Paket 4, hätte aber jede weitere Prüfung verfälscht.

### Prüfung 3 (nach run-09): NICHT BESTANDEN, Restliste auf zwei Punkte

Behoben: N1 (Bruchzonen-Maske wirkt – „genau der Wechsel aus wenigen ruhigen
Flächen und wenigen konzentrierten Bruchzonen, der gefehlt hat"), N3, B4
(Größenhierarchie), B8 (Rankenverankerung), B10. Teilweise: N2, N4, N5, B3
(„jetzt ein Feinheitsproblem, kein Formproblem").

Drei neue Defekte:

- **N6** Die Kantensaum-Knöchel sind über ihre ganze Fläche warmes Sandbraun
  und lesen sich als Erdklumpen statt als durchstoßender Fels.
- **N7** Das Erdband ist durch die angehobene Untergrenze die zweitgrößte
  Fläche im Nahbild geworden – und ein vollkommen glatter Farbverlauf ohne
  Facettierung, Krümel, Wurzelsaum oder Vertex-Variation. Neben dem
  facettierten Fels trennt es sich damit nur noch über den Ton.
- **N8** Im Frontsektor der Totale liegen wieder vier parallele, gleich dicke
  Bänke übereinander, während links und rechts der Sektorversatz funktioniert.

### Nacharbeit (run-10, run-11) – Durchlauf 4, die zulässige Obergrenze

- **N6**: Der Übeltäter war nicht die Einfärbung des Blocks, sondern ein
  zusätzlicher flacher „Erdaufwurf" aus run-08 – eine waagerechte Scheibe, die
  auf dem geneigten Kantensaum talseitig weit heraushing. Ersatzlos entfallen;
  der Erdton wirkt jetzt nur noch auf den verdeckten Fuß.
- **N7**: Senkrechte Auswaschungsrillen (zwei Frequenzen), blockweise
  Krümelstruktur, dunkler Humussaum unter der Grasnarbe, körnige
  Vertex-Variation; Erdmaterial auf facettierte Schattierung umgestellt,
  bleibt aber matter als der Fels.
- **N8**: Bankfolge springt jetzt pro Sektor im Versatz UND in der Dichte
  (Bankdicke je Sektor 0,72–1,34 der Grundrate).
- **N4**: Ranken dünner und länger mit stärkerem Ausschwung, dunkler
  Wurzelton. run-10 war hier zu kurz und zu dick – sie standen als helle
  Stummel vom Fels ab.

**Zum Streitpunkt „dritter Felston" (N2-Rest):** Der Prüfer sah in der Totale
eine auffällig helle, weißlich-graue Fläche und ordnete sie als dritte,
nicht angeglichene Felsfamilie ein. Die Nachstellung
(`tools/shots/debug/mini-closeup.png`) zeigt: Es ist **kein Fels**. Die Fläche
ist grün, aber stark entsättigt, und dahinter steht eine reinweiße Wolke. Das
ist fehlende atmosphärische Perspektive und gehört zu Paket 6.

### Prüfung 4 (nach run-11): NICHT BESTANDEN – Durchläufe aufgebraucht

Der Prüfer hat diesmal Pixelwerte gemessen statt geschätzt. Ergebnis:

**Behoben:** N2b (Nahfindling misst (101,99,94) – identisch mit dem Klippenfels
(101,99,92)), N6 (alle Knöchel im Grauband der Klippe). **Teilweise:** N7 (der
glatte Verlauf ist weg, es fehlt die kleine Skala und der Wurzelsaum), N8
(Zickzack nimmt die Geradlinigkeit, nicht die Gleichmäßigkeit).
**Keine echten Rückfälle.**

**Ich lag beim Streitpunkt N2a falsch.** Meine Erklärung „reinweiße Wolke
dahinter" ist an der genannten Koordinate widerlegt: Der Himmel neben der
Fläche misst (180,218,236), das Weiß sitzt auf dem Objekt selbst. Der Prüfer
gibt den Punkt trotzdem an Paket 6 ab – aber mit einer schärferen Diagnose als
meiner: Es fehlt nicht die atmosphärische Perspektive, sie ist **falsch
gefärbt und zu stark**. Der Dunst zieht gegen Weiß/Mint statt gegen die
Himmelsfarbe, dadurch wird das ferne Objekt **heller als der Himmel davor**.
Gemessen über drei Inseln desselben Materials: fern (157–190), Hauptkörper
(67–113), mittlere Mini-Insel (17–88). **Die Tiefenstaffelung ist nicht
schwach, sie ist invertiert.** Auftrag an Paket 6: Dunstfarbe an den Himmel
binden und die Kurve einheitlich über alle Objekte außerhalb der Hauptinsel
anwenden.

### Sofort behoben (echter Fehler, keine Paket-Iteration)

Die Ranken hingen senkrecht an einem Radius, der nur am Ansatzpunkt bestimmt
wurde – die Felswand zieht sich nach unten aber ein. Ergebnis: kurze Stummel,
die frei vor der Wand standen, und Haarlinien, die unter der Insel im blauen
Himmel abbrachen. Die Flanke wird jetzt über die **ganze** Stranglänge
abgetastet und der engste Radius genommen, das Strangende bleibt über der
Felsunterkante, und jeder Strang endet in einem Blattbüschel statt in einem
glatt abgeschnittenen Zylinder. Zusätzlich saßen die Blattbüschel wegen eines
falschen Faktors (0,22 statt 0,34) neben der Strangspitze statt an ihr.

## Paket 1 – Abschluss: NICHT BESTANDEN nach vier Durchläufen

Der Hauptkörper ist erledigt und wurde vom Prüfer ausdrücklich so bewertet:
Kiel, überkragendes Gesims, Kaminspalte, Bruchzonen, Erdband-Facettierung,
Ton- und Hellwerttrennung, Größenhierarchie, Grundrisskonkavität. Kriterium 5
(Materialtrennung) ist für die Trias Fels/Erde/Gras **bestanden**, gemessen:
Fels (101,99,92), Erde (127,108,82), Gras (152,177,120).

**Paket 1 scheitert nicht am Hauptkörper, sondern daran, dass zwei Dinge nicht
erfasst wurden, die zum Umfang gehören.** Offene Punkte, die weitergetragen
werden:

| # | Offener Punkt | Weitergabe an |
| --- | --- | --- |
| 1 | **Mini-Inseln haben Kastensilhouette**: flacher Deckel, senkrechte Flanken, gekappte Unterkante, acht gleich dicke Simse. In `1-eyelevel`, `2-waterfall` und `5-backlight` stellen sie die **einzige** Felssilhouette gegen den Himmel – dort ist von Paket 1 nichts zu sehen. | **Paket 8** (dessen Thema sie sind) |
| 2 | **Fehlende Sodendicke**: Messreihe über die Kante zeigt einen reinen Schattierungsverlauf über 54 px ohne einen einzigen Materialsprung. An den Mini-Inseln ist die Narbe eine „rasierklingendünne Waffel". | **Paket 3** |
| 3 | **Facettenskala im Nahbereich**: In `6-groundcover` ist ein Block über 30 % der Bildfläche auf ±1 Tonwert uniform. Der Fels ist für die Totale gebaut, nicht für Augenhöhe – also nicht für die VR-Standarddistanz. | **Paket 3** |
| 4 | **Metronomische Bankrhythmik im Frontsektor**: Höhe, Abstand und Zickzack-Amplitude bleiben über die ganze Frontbreite gleich – liest sich als Textur-Kachelung. | Performance-/Schlusspass |
| 5 | Nachrangig: N7-Feinskala (Krümel, Wurzelsaum an der Naht Gras↔Erde), Restfuge unter dem großen Knöchel, inkonsistenter Nahtcharakter (links Airbrush-Verlauf, rechts harte Facettenkante). | Paket 3 |

Der Prüfer stellt ausdrücklich fest: **keine Budget-Ausrede.** 73 von 120
Draw-Calls, 54 767 von 350 000 Dreiecken, 0,5 von 60 MB. Alle offenen Punkte
sind Form- und Geometrieprobleme mit reichlich Kopfraum; nur bei den
Mini-Inseln ist auf die Draw-Call-Seite zu achten.

---

## Paket 2 – Licht & Atmosphäre: NICHT BESTANDEN nach vier Durchläufen

### Was erledigt ist (vom Prüfer gemessen bestätigt)

| Befund | Vorher | Nachher |
| --- | --- | --- |
| **Rim im Gegenlicht** – Kronenrand `5-backlight` (294,380) | (0,13,2) L=9,4 | **L=28,0**, rechte Krone 51→85, Saum stellenweise heller als der Himmel |
| **Bounce von unten** – Kiel `4-aerial` x=600 | 147/95/54/25, fallend | **127/57/145/98**, zum Kiel hin *steigend* |
| **Tiefenstaffelung** | invertiert (fern heller als der Himmel) | **Kriterium 6 BESTANDEN** – Dunst zieht messbar zur Himmelsfarbe (b−r +28…+32), Fog erreicht die Nachbarinseln |
| **Globale Helligkeit** | Einbruch in 5 von 6 Bildern | fünf von sechs auf oder über Ausgangsniveau |
| **Sonne mit Hof, Himmel weiß von ihr** | flache Scheibe | Kern + Korona + Hof im Kuppel-Shader |
| **Konsistente Lichtrichtung** | Sonne und Licht an verschiedenen Orten | eine Quelle für Sprite, Hof, Licht und Schatten |
| **Zenit-Clamp** | Kuppel oben flach | Verlauf 112,6 → 204,4 wiederhergestellt |

### Offene Punkte, die weitergetragen werden

| # | Punkt | Weitergabe |
| --- | --- | --- |
| 1 | **Himmelssaum an der Grasnarbe.** Der Prüfer misst an der Inselkante ein helles Band (104 → 140), wo vor Paket 2 eine Verdunklung lag (153 → 49), und wertet es als Kontur statt Licht. Ich habe den Saum von Gras und Erde entfernt – das Band blieb. Es stammt also **nicht** vom Saum, sondern vom Bounce-Licht, das die nach unten gekrümmte Traufkante beleuchtet. Physikalisch ist das an einer frei schwebenden Insel richtig; dass es als gleichbreite Kontur liest, ist es nicht. **Hier widerspreche ich dem Prüfer in der Ursache, nicht im Befund.** | Paket 3 (Terrain-Material), zusammen mit der fehlenden Sodendicke |
| 2 | **Schlagschatten weiterhin lückenhaft.** Bäume und Findlinge werfen, Büsche/Grasbüschel/Blüten/Pilze nicht; `6-groundcover` enthält keinen einzigen. Schatten tragen keine Himmelsfarbe (b/g = 0,62/0,66). | Paket 4 (Vegetation) + Schlusspass |
| 3 | **Wolken tragen zu wenig Lichtrichtung.** Die Richtung ist jetzt in die Scheitelfarben gebacken (Modulation 3,6 → 12,7 Luminanzstufen), aber weit von einem Silberrand entfernt. | Paket 6 (Wolken) |
| 4 | **Facettenspreizung der Unterseite** an der Messstelle `3-edge-down` x=400: 9,1 gegen 27,3 im Ausgangsstand. Flächig ist die Unterseite besser (Spreizung 73 gegen 57), an dieser Stelle nicht. | Paket 3 |
| 5 | **Halbschattenbreite inkonsistent** (5 px gegen 20 px) – Auflösungsgrenze der Schattenkarte. | Schlusspass |

### Eigene Fehler in diesem Paket, protokolliert

- **Regression:** Ich nahm 1,4 globales Hemisphärenlicht weg und gab nur 0,78
  zurück. Der Kiel fiel von L≈100 auf L≈30 – die untere Inselhälfte war
  *unlesbarer als vor dem Paket*.
- **Zweimal am falschen Ort gesucht:** Das Schattenvolumen war in lokalen statt
  Welteinheiten gesetzt (deckte 14 m einer 40-m-Insel ab), und
  `renderer.shadowMap.enabled` stand in der Dojo-Atmosphäre, die erst beim
  Betreten des Dojos läuft. Beide Male habe ich zur Laufzeit nachgemessen
  statt weiter zu raten – das war der schnellere Weg.
- **Rim-Light falsch verstanden:** Ein gerichtetes Licht von hinten beleuchtet
  die Rückseite, die man nicht sieht. Der Saum musste ein Materialeffekt
  werden.
- **Saum überdosiert:** Bei `flatShading` ist die Normale je Facette konstant,
  der Fresnel-Term wird damit zur Flächenhelligkeit statt zur Kante – der Fels
  sah aus wie bereift.
- **Kontaktverdunklung zu grob entfernt:** Ich hatte sie beim Einführen der
  echten Schatten ganz gestrichen. Ein Schlagschatten sagt, wo die Sonne nicht
  hinkommt; eine Kontaktverdunklung sagt, wo das Umgebungslicht nicht
  hinkommt. Sie ist jetzt wieder da, eng und schwach.

### Messwerte Paket 2 (Abschluss)

| | vor Paket 2 | Paket 2 | Budget |
| --- | ---: | ---: | ---: |
| Draw-Calls env-island | 83 | **93** | 120 |
| Dreiecke Szene | 117 769 | **164 461** | 350 000 |
| Texturspeicher | 9,17 MB | 9,17 MB | 60 MB |
| Shader-Programme | 22 | 30 | – |
| Konsole | sauber | sauber | – |
| Andere vier Umgebungen | – | unverändert | – |

### Für Paket 2 vorgemerkte Messwerte des Prüfers

- Gegenlicht-Krone in `5-backlight` misst **(0,19,5)** – absolut schwarz, kein
  Rim-Light, keine Blattdurchsicht.
- Die Sonne ist eine flache Scheibe (231,184,140) ohne Halo.
- Der Kiel wird nach unten **dunkler** statt heller: (158,148,117) → (95,92,85)
  → (51,52,51). Null Bounce-Fill von unten, an einer Insel, die frei im hellen
  Himmel hängt.
- In keinem der sechs Bilder gibt es einen Schlagschatten.

Das ist laut Prüfer der Hauptgrund, warum der gut geformte Fels noch nach
grauem Kunststoff aussieht: „die Form von Paket 1 wird vom fehlenden Licht
verschenkt."

### Messwerte Paket 1 (Abschluss)

| | Ausgang | Paket 1 | Budget |
| --- | ---: | ---: | ---: |
| Draw-Calls env-island | 112 | **73** | 120 |
| Dreiecke Szene | 27 816 | **59 282** | 350 000 |
| Texturspeicher | 0,50 MB | **0,50 MB** | 60 MB |
| Shader-Programme | 19 | 18 | – |
| Konsole | sauber | sauber | – |
| Build | grün | grün | – |
| Andere drei Umgebungen | – | unverändert | – |

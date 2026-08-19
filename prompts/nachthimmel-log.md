# 🌌 Nachthimmel — Arbeitsprotokoll

Fortgeschrieben **jeden** Durchlauf. Reihenfolge: neuester Eintrag unten.

Maßstab 1:1 (kein `WORLD_SCALE`). Bodenfläche 96 × 96 m mit 150 × 150 Segmenten,
Nebel 22 → 48 m, Himmelskuppel r = 44, Sternschalen 38–40 m, Mond bei
[14 | 16 | −24], Horizonthügel r = 26–38 m. Diese Werte bleiben.

Budget: Draw-Calls ≤ 120, Dreiecke ≤ 350 000, Texturspeicher ≤ 60 MB.

---

## Durchlauf 0 — Ausgangsstand aufnehmen

**Befund vorweg, weil der Auftrag etwas anderes annahm.** Der Auftrag setzt
voraus, dass `NIGHT_SHOTS` in `tools/harness-common.mjs` bereits steht und
`tools/shots/night-00/` sowie `tools/metrics/night-00.json` vorliegen. Das war
**nicht** der Fall: Der Harness kannte nur `island` und `zen`, ein Nacht-Satz
existierte nicht, und `tools/metrics/` gab es überhaupt nicht (steht in
`.gitignore`). Der Ausgangsstand wurde deshalb zuerst hergestellt:

* `NIGHT_SHOTS` in `tools/harness-common.mjs` eingetragen — **exakt** die sechs
  Positionen aus der Auftragstabelle, damit die Bilder über alle weiteren
  Durchläufe vergleichbar bleiben. `ENV_SHOTS` um `night` erweitert.
* `tools/verify.mjs` kennt jetzt `night-00` als Vergleichsstand.
* `tools/shots/night-00/` und `tools/metrics/night-00.json` erzeugt.

Dass die Messung danach **auf die Ziffer** die Tabelle des Auftrags
reproduzierte (40 Draw-Calls, 51 842 Dreiecke, 0,77 MB, 7 Programme), ist die
Bestätigung, dass die eingetragenen Kamerawerte die gemeinten sind.

### Messung night-00

| Größe | Grenze | Ist |
| --- | ---: | ---: |
| Draw-Calls (max, d-aerial) | 120 | 40 |
| Dreiecke (max) | 350 000 | 51 842 |
| Texturspeicher | 60 MB | 0,77 MB |
| Shader-Programme | – | 7 |
| Render-Zeit schlechtestes Bild | – | 355 ms (SwiftShader, **kein** Quest-Wert) |

### Eigene Nachmessung der fünf gemeldeten Mängel

| Behauptung | nachgemessen | Ergebnis |
| --- | --- | --- |
| Boden ohne Modellierung | `e-ground` (100,400)–(1180,700) | Mittel 50,2, p05–p95 = **31…63**, >190: **0,0 %**, Hochpass \|d\| 1,86 — bestätigt |
| kein Schatten | 39 Meshes, 0 `castShadow`, 0 `receiveShadow` | bestätigt |
| weißes Grundlicht 1,4 | `createNightEnvironment` setzt kein `sceneAmbient` | bestätigt |
| Mond ist weiße Scheibe | `MeshBasicMaterial` 0xe8ecf2, ein Sprite als Hof; Kern misst (223,224,225) | bestätigt |
| Sterne vor dem Boden | Sternschalen 38–40 m, Bodenfläche bis 48 m | bestätigt (geometrisch zwingend) |

Himmel `a-eyelevel` (100,60)–(1180,380): Mittel 4,3, p95 = **3**. Der Himmel ist
außerhalb der Sternpunkte praktisch schwarz.

---

## Durchlauf 1 — Paket 1 „Licht"

### Was gebaut wurde

1. **`sceneAmbient: 0`.** Das globale Grundlicht aus `main.js` (Hemisphäre
   0xffffff über 0x334455, Stärke 1,4) ist für diese Umgebung aus. Es lieferte
   beim aufwärts gerichteten Bodennormalenvektor rund **1,4 von 1,72** Einheiten
   Bestrahlung — 82 % des Lichts der ganzen Szene kam aus einer weißen Quelle,
   die nur von `normal.y` abhängt und deshalb auf **keine** Oberflächenform
   reagiert. Genau das war der Grund für den flachen Tonwert.
2. **Das Mondlicht ist die einzige gerichtete Quelle**, jetzt mit Schattenkarte:
   2048², Orthofrustum ±40 m (3,9 cm je Texel), `near 0.5 / far 120`,
   `bias −0.0004`, `normalBias 0.008`. Der Mond steht 29,9° über dem Horizont.
3. **Werfer und Empfänger gesetzt**: Boden, Brocken, Horizonthügel — vorher
   0 von 39 Meshes, jetzt alle.
4. **Himmelslicht als kühler Gegenpol**: Hemisphäre 0x7595b4 über 0x412012,
   Stärke 2,0. Das Regolithrot steckt damit in der Rückstrahlung von unten
   statt flächig im Albedo.
5. **Kontaktverdunklung**, zweiteilig: abgedunkelte Scheitelpunkte am Fuß jedes
   Brockens (in **Weltausrichtung** gerechnet, weil die Brocken um alle drei
   Achsen zufällig gedreht sind) plus geländekonforme Verdunklungsscheiben
   (`makeKontaktAO`) — alle in **einem** Draw-Call über die vierte Komponente
   des Farbattributs.
6. **Albedo entsättigt** (Boden 0x9c4a2b → 0x7a4c38, Brocken und Hügel
   entsprechend).
7. **Brocken und Hügel verschmolzen** — siehe „Budget" unten.

### Zwei Rechnungen statt Raten

**Die Lichtstärken sind vorwärts gerechnet.** Aus dem Ausgangsstand ließ sich
der Zusammenhang zwischen Bestrahlung und Bildwert ablesen: R = 115 bei Σ 1,72
Einheiten ⇒ 0,0665 linear je Einheit im Rotkanal (inklusive Albedo, Belichtung
1,1 und ACES). Ziel Schattenseite R ≈ 30 ⇒ Σ_r ≈ 0,32; Ziel mondzugewandte
Flanke R ≈ 130 ⇒ Σ_r ≈ 2,12. Gemessen wurde danach (114 | 87 | 89) an der
hellsten und (53 | 33 | 30) an einer verschatteten Bodenstelle in `e-ground`.

**Die Entsättigung war keine Stilfrage, sondern eine Notwendigkeit.** Mit
0x9c4a2b hat der Regolith linear (0,331 | 0,070 | 0,024) — im Blaukanal sieben
Prozent des Rotkanals. Ein kühles Himmelslicht wird auf so einer Fläche
weggefiltert. Gerechnet ergab die Schattenseite (31 | 7 | 4), also weiterhin
rot, nur dunkler. Der geforderte kalte Gegenpol ist mit dieser Farbe
physikalisch nicht herstellbar.

**Ein Fehlgriff auf dem Weg, der nachgemessen wurde.** Der erste Farbton der
Aufhellung (0x6a86c8) ergab an der hellsten Bodenstelle (113 | 88 | 94) — Blau
**über** Grün, also einen Magentastich. Grund: Regolith linear G:B = 1,88,
Leuchte G:B = 0,41, Produkt 0,77. Mit 0x7595b4 (G:B = 0,66) steht das Produkt
bei 1,23 und Grün führt wieder. Drei Durchgänge, jeder nachgemessen — kein
Raten.

### Messung (night-00 → night-01)

| Größe | Grenze | vorher | nachher |
| --- | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | **12** |
| Dreiecke (max) | 350 000 | 51 842 | **105 898** |
| Texturspeicher | 60 MB | 0,77 | 0,77 |
| Shader-Programme | – | 7 | 7 |
| Render-Zeit schlechtestes Bild | – | 355 ms | 278 ms |

**Warum die Draw-Calls trotz Schattendurchgang gefallen sind.** Der Schattenpass
zeichnet jeden Werfer ein zweites Mal; mit dreißig einzelnen Brocken und sechs
einzelnen Hügeln sprang die Szene zuerst von 40 auf **78**. Das ist im Budget,
aber sechzig Calls für dreißig Steine, und fünf Pakete sollen noch etwas
hinzufügen. Verschmolzen sind es zwei Meshes. Gebaut wird **vor** dem
Verschmelzen, damit die `mulberry32`-Ziehungen sich nicht verschieben; der
Pixelvergleich bestätigt das (Δ ≥ 8 in **0,000 – 0,001 %** der Pixel über alle
sechs Kameras).

Aufschlüsselung jetzt: 9 Knoten — Kuppel, Mond, zwei Sternschalen, Mondhof,
Boden, `nacht-brocken`, `nacht-huegel`, `kontaktverdunklung`.

### Tonwert (der eigentliche Zweck des Pakets)

| Bild / Bereich | vorher | nachher |
| --- | --- | --- |
| `e-ground` (100,400)–(1180,700), p05…p95 | 31 … 63 (**32** Stufen) | 13 … 90 (**77** Stufen) |
| dieselbe Fläche, Hochpass \|d\| | 1,86 | 7,29 |
| dieselbe Fläche, Kante senkrecht | 2,45 | 9,85 |
| `e-ground` Bildmittel / p99 | 30,4 / 68,4 | 31,9 / **103,2** |
| `a-eyelevel` Bildmittel / p99 | 21,9 / 69,9 | 26,0 / **102,7** |
| `d-aerial` Bildmittel / p99 | 34,8 / 62,3 | 35,1 / 72,6 |
| `f-hills` Bildmittel / p99 | 25,4 / 67,2 | 27,5 / 90,5 |

**Der Bildmittelwert bleibt praktisch stehen, die Spanne verdoppelt bis
verdreifacht sich.** Das war das Ziel: Es sollte nicht heller werden, sondern
moduliert.

### Regression der anderen vier Umgebungen

| Umgebung | Δ ≥ 2 | Δ ≥ 8 | Urteil |
| --- | ---: | ---: | --- |
| 🪷 Zen-Garten | 0,000 % | 0,000 % | bitgleich |
| ⬜ Konstrukt | 0,000 % | 0,000 % | praktisch bitgleich |
| ⛩ Dojo | 0,010 % | 0,000 % | praktisch bitgleich |
| 🏝 Himmelsinsel | 0,654 % | 0,135 % | im bekannten Rauschband (0,6–0,9 %) |

Build grün, Konsole in allen Läufen frei von Errors **und** Warnings.
App-Funktionen geprüft: Karten, Whiteboard, Wrist-Menü, Zonen, Verbindungen und
HUD verwenden ausnahmslos `MeshBasicMaterial` — `sceneAmbient: 0` ändert an
ihnen kein Pixel. Locomotion rechnet ohne Bodenabtastung, die Interaktion
strahlt nur auf UI und Karten; das Verschmelzen der Brocken berührt beides
nicht.

### Eine Falle, die per Laufzeit-Auszug geklärt wurde (statt geraten)

`applyQuality()` blendet in der Brille **alle** additiv gemischten Meshes und
Points aus, sofern ihr Name nicht auf `additivBehalten` passt. Die Sternschalen
des Nachthimmels sind additiv — der Verdacht war also, dass die Quest gar keine
Sterne sieht. Ein Auszug über die Szene bei allen drei Stufen zeigt das
Gegenteil: `voll=true, mittel=true, sparsam=true` für beide Sternschalen.

Der Grund ist die Vorgabe `additivBehalten = /$^/`. Dieses Muster passt auf
**nichts** — außer auf den leeren String, denn bei Länge 0 stimmen Ende und
Anfang überein. Die Sternschalen haben keinen Namen, also greift die Ausnahme,
und sie bleiben stehen.

**Merke für Paket 2:** Wer den Sternen einen Namen gibt, nimmt ihnen damit
diesen Schutz und blendet sie in der Brille aus. Namen nur zusammen mit einem
passenden `additivBehalten`.

### Urteil des Prüfers, Durchlauf 1

**1 von 8 Kriterien bestanden: Licht.** Wörtlich: „Das Paket hat genau das getan,
was es angekündigt hat, und die Wirkung ist die größte, die eine einzelne
Maßnahme in dieser Szene erzielen konnte." Die übrigen sieben nicht bestanden.

Die zwölf Mängel, nach visueller Wirkung sortiert (gekürzt):

1. Rechteckgitter der Bodentextur, jetzt das auffälligste Merkmal der Szene
2. Der Himmel ist ein einfarbiges Feld über 55–60 % der Bildfläche (p05 2, p95 3)
3. Kein Objekt steht gegen den Sternhimmel; Horizontamplitude in `f-hills` 30 px auf 1280 px
4. Belichteter Boden magentastichig und unbunt (B−G = +4…+10; Sättigung 66 % → 15 %)
5. Brocken und Boden materiell nicht unterscheidbar (ΔL 2,2)
6. Kein Streiflicht auf mondzugewandten Kanten
7. Kontaktverdunklung ist eine Vignette (Abfall über 95 px bei 80 px Brockenbreite)
8. Tiefenbänder nicht geordnet (Ferne 63,7 / Mitte 73,2 / Nah 60,9)
9. Vier von sechs Bildern ohne Motiv; `b-moon` hat den Mond exakt im Bullauge
10. Brocken als Ikosaeder lesbar, Schattenseiten laufen zu
11. `c-crater` noch zu 52 % in einem Tonwerteimer
12. Einzige Bewegung: 1500 Sterne drehen sich starr im Gleichtakt

### **Mein Fehler, vom Prüfer gefunden**

Er hat die A/B-Vergleichbarkeit angezweifelt, bevor er irgendetwas beurteilt
hat — zu Recht. Ich hatte in der Brockenschleife einen zusätzlichen `rand()`-Zug
eingebaut (`r: s * (1.9 + rand() * 0.6)` für den Radius der Kontaktverdunklung).
`mulberry32` ist ein gesäter Generator; ab dem ersten Brocken stand damit
**alles** danach woanders. Beleg des Prüfers an `e-ground`: (280,420) sprang von
L 9,2 (Brocken) auf L 60,0 (Boden), (990,415) von L 12,2 auf L 74,1 — das Bild
hatte seine gesamte Vordergrundgruppe verloren.

**Das steht wörtlich in der Liste der bezahlten Lehren, die ich vor dem ersten
Zeilenwechsel gelesen habe, und ich habe es trotzdem gemacht.** Die Lehre dort
lautet „erst bauen, dann verschmelzen"; sie ist zu eng formuliert. Richtig ist:
*jeder* zusätzliche Zug aus dem gesäten Strom verschiebt alles danach — auch
einer, der nur einen Radius bestimmen soll.

---

## Durchlauf 2 — Paket 1 „Licht", zweiter Anlauf

Alle sieben Änderungen dieses Durchlaufs gehen auf den Prüfbericht zurück.

1. **Der `rand()`-Zug ist weg.** Der Radius der Kontaktverdunklung kommt jetzt
   aus der **Geometrie**: die waagerechte Ausdehnung des gedrehten und
   skalierten Brockens (`xzMax`, im selben Scheitelpunkt-Durchlauf mitgerechnet,
   der schon für die Fußabdunklung läuft), mal 1,35.
2. **Bodentextur neu** — siehe unten, eigener Abschnitt.
3. **Magentastich an der richtigen Quelle behoben.** Der erste Anlauf hatte ihn
   in der Hemisphärenleuchte gesucht; er blieb, nur verschoben (113|88|94 →
   121|103|110). Die hellen Stellen kommen aber von der **gerichteten** Quelle,
   und 0xd8e2ff ist selbst (216|226|255), also B über G um 29 Stufen. Jetzt
   0xe2eaf0.
4. **Sättigung zurück:** Bodenalbedo 0x7a4c38 → 0x854c33 (linear +20 % Rot,
   −16 % Blau), Brocken und Hügel entsprechend.
5. **Kontaktverdunklung enger und steiler:** Ringe [0, 0.46, 0.76, 1] statt
   [0, 0.42, 0.74, 1], Deckkraft [1, 0.44, 0.11, 0] statt [1, 0.62, 0.22, 0].
6. **Materialtrennung über die Rauheit:** Fels 0,72 gegen 0,95 am Boden. Das ist
   zugleich die einzige Form von Streiflicht, die eine facettierte, flach
   schattierte Geometrie hergibt — eine Fresnel-Kante würde dort zur
   Flächenhelligkeit statt zur Kante.
7. **Aufhellung von unten** 0x412012 → 0x4e2a1c, damit Brockenschattenseiten
   nicht zulaufen.

### Warum die Bodentextur in diesem Paket neu gebaut wurde

Sie gehört eigentlich zu Paket 4. Aber der Tell ist ein **Preis dieses
Lichtpakets**: Die alte Höhenfunktion war

    rausch(x >> 4, y >> 4) * 0.5 + rausch(x >> 2, y >> 2) * 0.34 + rausch(x, y) * 0.16

— drei ungefilterte Wertrauschlagen auf einem achsenparallelen Gitter mit 16-,
4- und 1-Texel-Blöcken, ohne jede Interpolation. Unter dem alten flächigen Licht
unsichtbar, unter streifendem Mondlicht das dominante Muster der Szene. Ihn vier
Pakete weiterzureichen hieße, den Stand schlechter zu übergeben, als er war.

Das Rezept steht im selben Haus, bei `kornCanvas()` für den Zen-Sand: **Körner
sind keine Frequenz, sondern Objekte.** Gesetzt werden jetzt weiche runde Kuppen
in drei Größenklassen an zufälligen Positionen, jede um ±Kachelbreite
mitgezeichnet. Kein Gitter, also keine Vorzugsrichtung. Auflösung 512 statt 256
(3,1 mm je Texel bei 1,6 m Kachel), Stärke 1,15 statt 1,9 — die Kuppen haben
eine echte Flanke, das Blockrauschen hatte nur an den Blockkanten eine Ableitung.

| Bereich, Hochpass \|d\| | night-00 | night-01 | night-02 |
| --- | ---: | ---: | ---: |
| `e-ground` (100,400)–(1180,700) | 1,86 | 7,29 | **2,25** |
| dieselbe Fläche, Kante senkrecht | 2,45 | 9,85 | **3,01** |
| `d-aerial` Flachzone (180,380)–(430,470) | 0,36 | 2,11 | **0,65** |

### A/B-Vergleichbarkeit: nachgewiesen statt behauptet

Deckung der Brocken-Silhouetten gegen `night-00` (Maske = Pixel unter L 30 im
Bodenbereich, Schnitt über Vereinigung):

| Bild | night-01 | night-02 |
| --- | ---: | ---: |
| `a-eyelevel` (y ≥ 460) | 11,2 % | **61,3 %** |
| `e-ground` (y ≥ 300) | 20,1 % | **44,3 %** |

Wichtiger als die Quote selbst: In `a-eyelevel` sind **90 %** der dunklen Pixel
des Ausgangsstands auch im neuen Stand dunkel (30 424 von 33 709) gegen 18 %
in Durchlauf 1. Der Rest der Differenz ist Absicht — Schlagschatten sind
hinzugekommen und liegen ebenfalls unter L 30.

### Farbe

| Ort | night-01 | night-02 | Sättigung 02 |
| --- | --- | --- | ---: |
| `a-eyelevel` (640,540) | (121\|103\|110) B−G **+7** | (128\|97\|88) B−G **−9** | 31 % |
| `b-moon` (640,700) | (128\|115\|125) B−G **+10** | (132\|107\|100) B−G **−7** | 24 % |
| `a-eyelevel` (200,650) | (89\|63\|61) | (102\|63\|51) | 50 % |

Blau führt an keiner gemessenen Stelle mehr über Grün.

### Messung und Regression

| Größe | Grenze | night-00 | night-01 | night-02 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 12 | **12** |
| Dreiecke (max) | 350 000 | 51 842 | 105 898 | **105 898** |
| Texturspeicher | 60 MB | 0,77 | 0,77 | **2,77** |
| Shader-Programme | – | 7 | 7 | 7 |

Bildmittel / p99 über die sechs Kameras (night-00 → night-02):
`a-eyelevel` 21,9/69,9 → **24,7/98,7** · `b-moon` 7,7/72,4 → **9,0/103,4** ·
`c-crater` 35,4/64,6 → **39,6/83,8** · `d-aerial` 34,8/62,3 → **37,1/74,5** ·
`e-ground` 30,4/68,4 → **32,1/97,8** · `f-hills` 25,4/67,2 → **28,5/90,7**.
Der Mittelwert steigt um 2–4 Stufen, die Spitze um 20–43. Es bleibt Nacht.

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,594 % (Rauschband). Build grün, Konsole ohne Errors und Warnings.

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

### Urteil des Prüfers, Durchlauf 2

**3 von 8 bestanden** (Licht, Farbharmonie, Tiefenstaffelung), vorher 1 von 8.
Die drei Selbstverschuldungen des ersten Anlaufs sind je einzeln mit Zahlen
abgenommen:

| Änderung | Abnahme |
| --- | --- |
| `rand()`-Zug raus, A/B wieder gültig | **erledigt** — Deckung der dunklen Brockenpixel von night-00: `a-eyelevel` 19,5 % → **97,1 %**, `c-crater` 28,7 % → 95,8 %, `e-ground` 22,0 % → 88,9 %, `f-hills` 34,0 % → 75,8 % |
| Bodentextur ohne Gitter | **erledigt** — Hochpass 7,29 → 2,25; Autokorrelation über (600,480)–(950,660) ohne Nebengipfel bei jedem Versatz 1…24, waagerecht wie senkrecht |
| Magentastich | **erledigt** — Anteil B > G bei hellen Pixeln (L > 60): `a-eyelevel` 53,40 % → **1,79 %**, `e-ground` 55,94 % → 0,23 %. Seltener als im Ausgangsstand |
| Sättigung | **teilweise** — Median beleuchteter Boden `e-ground` 0,819 → 0,392 → **0,573** |
| Kontaktverdunklung enger | **erledigt** — kein Hof mehr; Boden liegt bis an die Brockenkante auf L 73…77 |
| Materialtrennung Fels/Boden | **teilweise** — Trennung da (Fels L 81…91 gegen Boden ≤ 77), aber „Trennung gewonnen, Körper verloren" |
| Aufhellung von unten | **nicht erledigt** — s. u. |

Zwei Punkte hat er ausdrücklich in einen dritten Anlauf verwiesen, nicht in ein
späteres Paket:

* **Brockenschattenseiten laufen unter Himmelsniveau zu.** Anteil der
  Brockenfläche unter L 2,6 (Himmelsmedian): `e-ground` 0,0 % → 0,3 % →
  **28,6 %**, `a-eyelevel` 1,3 % → 0,0 % → **24,5 %**. „Ein Brocken ist damit
  kein Körper mehr, sondern ein schwarzer Ausschnitt."
* **Facettenkontrast innerhalb eines Objekts 16:1** (Spalte x=880 in
  `a-eyelevel`: 10 → 53 → 81 → 48 → 7) gegen 4,75:1 im Ausgangsstand. „Ein
  Dreistufen-Plakat statt eines Steins."

Außerdem ein Befund über **mein Messwerkzeug**: `tools/silhouette.mjs` sprang
unter dem neuen Licht von 18 auf 101 Treffer (`c-crater`) bzw. von 10 auf 179
(`e-ground`) — sämtlich Felsfacetten bei L 47…70, keine Sterne. Ein Werkzeug,
das auf eine Beleuchtungsänderung reagiert, misst nicht mehr das, wofür es
gebaut ist.

Tonwertumfang p05…p95 der Bodenfläche, sein Vorher/Nachher:

| Bild | night-00 | night-01 | night-02 |
| --- | --- | --- | --- |
| `a-eyelevel` (200,520)–(900,700) | 20…66 (46) | 26…95 (69) | **5…91 (86)** |
| `c-crater` (100,420)–(900,700) | 46…60 (**14**) | 13…73 (60) | **32…74 (42)** |
| `f-hills` (100,450)–(1250,700) | 38…64 (26) | 39…81 (42) | **15…82 (67)** |

---

## Durchlauf 3 — Paket 1 „Licht", dritter Anlauf

Nur die beiden offenen Punkte plus das Werkzeug. Sonst nichts.

### Brockenkörper: die Ursache war nachgerechnet, nicht geraten

Für eine mondabgewandte Flanke: Bestrahlung 0,254 × Albedo 0,084 ×
Vertexfaktor 0,62 → Bildwert **2,5 von 255**. Der Himmel zwischen den Sternen
liegt bei 2,6. Die Rechnung trifft die Messung des Prüfers auf die Stelle.

**Warum die Hemisphäre der falsche Hebel gewesen wäre.** Sie rechnet nur mit
`normal.y`. Eine senkrechte Felsflanke steht bei ihr auf halbem Weg zwischen
Himmels- und Bodenfarbe und weiß nichts von der Fläche, die zwei Handbreit
daneben im vollen Mondlicht liegt — obwohl genau die den Brocken in Wahrheit
von unten anstrahlt. Sie anzuheben hätte die Bodenfläche mit aufgehellt, und
die Szene soll nicht heller werden.

Drei Maßnahmen, alle nur am Fels:

* **Eigenleuchten 0x170d07** am Felsmaterial — die übliche stilisierte
  Ersatzdarstellung für Bodenrückstrahlung, warm getönt, weil das Licht von
  unten vom Regolith kommt. Rechnerisch landet es bei Bildwert ≈ 16 im
  Rotkanal.
* **Vertexverlauf am Fuß 0,62 → 0,82** und kürzer. Er war ursprünglich der
  einzige Kontaktschatten; seit es Schlagschatten und Verdunklungsscheiben
  gibt, zählte er doppelt.
* **Brockenfarben aufgehellt** (0x522f23 → 0x67402f usw.). Sie waren dunkler
  als der Boden, auf dem sie liegen.

| Bereich, Anteil unter L 2,6 / L 5 | 00 | 01 | 02 | 03 |
| --- | --- | --- | --- | --- |
| `e-ground` (200,370)–(360,465) | 0,0 / 0,5 % | 0,3 / 1,3 % | **28,6 / 38,0 %** | **0,0 / 0,0 %** |
| `a-eyelevel` (340,590)–(440,700) | 1,3 / 4,5 % | 0,0 / 0,0 % | **24,5 / 28,0 %** | **0,0 / 0,0 %** |

### Glanz: Rauheit 0,72 → 0,84

Spalte x=880 in `a-eyelevel`, y = 640/660/680/700:

| Stand | Werte | Verhältnis |
| --- | --- | ---: |
| night-00 | 34,3 · 21,7 · 22,1 · 8,2 | 4,2 : 1 |
| night-02 | 65,3 · 5,4 · 6,4 · 0,9 | **72 : 1** |
| night-03 | 60,9 · 16,7 · 17,5 · 8,8 | **6,9 : 1** |

Mehr Umfang als der Ausgangsstand, aber ein lesbarer Verlauf statt drei Stufen.

### Das Messwerkzeug, das falsch gemessen hat

Die erste Fassung von `tools/silhouette.mjs` verlangte „Umgebung < 32 und Punkt
> Umgebung + 18". Ein Stern vor dem Gelände ist aber ein **sehr** heller Punkt
in einer **sehr** dunklen Umgebung (gemessen L 129…135 bei Umgebung 13…17); eine
belichtete Felsfacette ist zwar heller als ihre Umgebung, aber ihre Umgebung ist
es auch. Jetzt drei harte Bedingungen: Punkt > 100, Umgebung < 30, Abstand > 40.

Ergebnis über alle vier Stände: `d-aerial` **18**, `c-crater` 0, `e-ground` 0,
`f-hills` 0 — unverändert über drei Beleuchtungswechsel. Das ist die
Eigenschaft, die vorher fehlte.

### Messung und Regression

Draw-Calls 12/120, Dreiecke 105 898/350 000, Texturspeicher 2,77/60 MB,
7 Programme. Bildmittel gegenüber Durchlauf 2 um 0,2 bis 0,6 Stufen gestiegen,
p99 unverändert — die Aufhellung trifft nur die Brocken.

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,762 % (Rauschband 0,6–0,9 %). Build grün, Konsole ohne Errors und Warnings.

### Der Prüfer ist ausgefallen

Der Prüfdurchlauf 3 ist abgebrochen: **„You've hit your monthly spend limit"** —
dasselbe Ausgabelimit des Kontos, das im Auftrag als bekannter Ausfallgrund
genannt ist. Er hat keine einzige Messung mehr geliefert. Weitere Sub-Agenten
scheitern damit ebenfalls; ab hier gibt es keinen unbefangenen Prüfer mehr.

Nach der Vorgabe des Auftrags gilt deshalb: **selbst weiterprüfen, mit denselben
Werkzeugen und gegen seine letzte schriftliche Liste — und nicht „bestanden"
ins Protokoll schreiben.** Das Folgende ist eine Eigenprüfung. Sie kann
belegen, dass zwei benannte Mängel behoben sind; sie kann **nicht** das Paket
abnehmen.

#### Eigenprüfung Durchlauf 3 gegen seine Teil-C-Fragen

**Frage 1 — laufen Brockenschattenseiten noch unter Himmelsniveau zu?** Nein.

| Bereich, Anteil unter L 2,6 / L 5 | 00 | 01 | 02 | 03 |
| --- | --- | --- | --- | --- |
| `e-ground` (200,370)–(360,465) | 0,0 / 0,5 % | 0,3 / 1,3 % | 28,6 / 38,0 % | **0,0 / 0,0 %** |
| `a-eyelevel` (340,590)–(440,700) | 1,3 / 4,5 % | 0,0 / 0,0 % | 24,5 / 28,0 % | **0,0 / 0,0 %** |

**Frage 2 — ist der Facettenkontrast wieder lesbar?** Ja, an drei Brocken in
drei verschiedenen Bildern nachgemessen (hellste zu dunkelster Abtastung):

| Brocken | night-00 | night-02 | night-03 |
| --- | ---: | ---: | ---: |
| `a-eyelevel` Spalte x=880 | 4,2 : 1 | **72 : 1** | **6,9 : 1** |
| `c-crater` Spalte x=400 | 2,6 : 1 | 9,6 : 1 | **3,8 : 1** |
| `e-ground` Spalte x=270 | 6,7 : 1 | 50 : 1 | **10,4 : 1** |

Alle drei liegen jetzt zwischen dem Ausgangsstand und dem übersteuerten
Durchlauf 2 — mehr Umfang als vorher, aber ein Verlauf statt drei Stufen.

**Frage 3 — sind neue Fehler entstanden? Verrät sich das Eigenleuchten?**
Der entscheidende Test ist, ob ein Brocken heller wird als seine Umgebung, wo
er dunkler sein müsste. Er wird es nicht:

| | Brocken-Dunkelseite | Boden daneben |
| --- | ---: | ---: |
| `a-eyelevel` (880,660) / (700,660) | L 16,7 | L 32,8 |
| `c-crater` (400,320) / (470,345) | L 18,1 | L 67,1 |

Der Brocken bleibt in seiner Nachbarschaft das Dunkelste. Auch flächig:
Brockenbereich `c-crater` (380,300)–(420,330) p05 = 18 gegen Boden p05 = 63.

**Hat die Materialtrennung unter der zurückgenommenen Rauheit gelitten?** Nein
— und dies ist die Zahl, die den ganzen Punkt trägt:

| | night-00 | night-02 | night-03 |
| --- | ---: | ---: | ---: |
| hellste Felsfacette `a-eyelevel` (840,620)–(920,700) | 65,0 | 127,1 | **100,8** |
| hellster Boden ringsum (600,600)–(800,700) | 65,8 | 87,4 | **87,4** |
| Differenz Fels − Boden | **−0,8** | +39,7 | **+13,4** |

Im Ausgangsstand war die hellste Felsfläche **dunkler** als der hellste Boden —
genau die Ununterscheidbarkeit, die der Prüfer in Durchlauf 1 mit ΔL 2,2
gemessen hatte. Sie ist weg und bleibt weg.

**Frage 4 — meldet `silhouette.mjs` über alle vier Stände denselben Wert?** Ja:
`d-aerial` 18, `c-crater` 0, `e-ground` 0, `f-hills` 0 — über drei
Beleuchtungswechsel unverändert.

**Farbe:** Blau führt an keiner von fünf gemessenen Stellen über Grün
((128|97|88), (117|92|85), (102|63|51), (132|107|100), (109|81|73)).

**Tonwertumfang Boden, seine vier Prüfbereiche, p05…p95 in Durchlauf 3:**
`a-eyelevel` 15…90 · `c-crater` 32…74 · `e-ground` 22…87 · `f-hills` 21…83.
Gegenüber Durchlauf 2 etwas enger — das ist die beabsichtigte Folge davon, dass
die zugelaufenen Schwarzwerte wieder hochgekommen sind.

#### Stand des Pakets „Licht"

Drei Anläufe, alle offenen Punkte des letzten Prüfberichts messbar erledigt.
**Abgenommen ist es trotzdem nicht** — es gibt niemanden mehr, der es
unbefangen abnehmen könnte. Es geht als *nicht abgenommen* zum nächsten Paket.

Was aus seiner Mängelliste bewusst offen bleibt und wohin es gehört:

| Mangel | Paket |
| --- | --- |
| Himmel ein einfarbiges Feld (p05 2, p95 3 über 55–60 % der Fläche) | 2 |
| Sterne stehen vor dem Gelände (18 Punkte in `d-aerial`) | 2 |
| Sterne als achsenparallele 2×2-Quadrate | 2 |
| Mond ohne Oberfläche (L 224 konstant über 50 px) | 3 |
| Mond exakt in der Bildmitte | 3 / 7 |
| Kornstärke entfernungsunabhängig | 4 |
| Horizontkante als gezogener Strich (`c-crater` 10 px auf 260 px) | 5 |
| Krater als wiederholte Ellipsen | 5 |
| Brocken als Ikosaeder lesbar | 6 |
| nur zwei Materialien im Inventar | 4 / 6 |
| vier von sechs Bildern ohne Motiv | 7 |
| einzige Bewegung: 1500 Sterne im Gleichtakt | 8 |

---

## Durchlauf 4 — Paket 2 „Himmel"

Ohne Prüfer (Konto am Ausgabelimit). Alle Urteile unten sind Eigenprüfung; das
Paket ist damit **nicht abgenommen**.

### Der Befund, der das ganze Paket erklärt

Der Himmel war nicht zu flach **entworfen** — er wurde um Faktor 6 bis 12
verdunkelt. `makeDome()` schreibt seine Farb-Uniforms roh in den sRGB-Puffer.
Ein `ShaderMaterial` bekommt von three keine Farbraum-Umrechnung eingebaut, und
`#include <colorspace_fragment>` steht dort nicht. `THREE.Color` speichert einen
Hex-Wert aber **linear**:

| | |
| --- | --- |
| Uniform `topColor` (zur Laufzeit ausgelesen) | (0,00335 \| 0,00750 \| 0,03310) linear |
| roh × 255 | (0,9 \| 1,9 \| 8,4) |
| im Bild gemessen | (2 \| 2 \| 7) |
| 0x0b1533 sähe aus wie | (11 \| 21 \| 51) |

Dieselbe Klasse Fehler wie die bekannte Notiz zur Nebelfarbe. Die neue Kuppel
rechnet am Ende ausdrücklich linear → sRGB; ein Hex-Wert, der dort steht, sieht
danach auch so aus. `makeDome()` bleibt unangetastet — Insel und Zen-Garten
hängen an seinem heutigen Verhalten.

### Was gebaut wurde

1. **Eigene Nachtkuppel** (`makeNachtKuppel`) mit dreistufigem Verlauf, korrekter
   Farbraumumrechnung, Milchstraßenband, Luftglühen und Extinktion.
2. **Milchstraßenband** aus einer 1024 × 256-Kachel: u läuft **einmal** um das
   Band (keine Naht möglich), v quer darüber. Bandlage gerechnet — der Pol
   steht so zur Mondrichtung, dass das Band rund 20° **neben** dem Mond
   vorbeiläuft und ihm nicht die Bühne nimmt.
3. **Luftglühen**: zwei Keulen über dem Horizont, grünlich (557,7 nm), plus
   warme Extinktion darunter.
4. **Sternfeld neu** (`makeSternfeld`): 2600 Sterne, **ein** Draw-Call, mit
   Größe, Farbtemperatur, Extinktion und Flimmerphase je Stern als Attribut.
   Runde Punkte statt achsenparalleler Quadrate. Farbe an Helligkeit gekoppelt
   — nur helle Sterne zeigen Farbtemperatur, sonst sähe es aus wie Konfetti.
5. **Die Sterne stehen hinter dem Gelände.**

### Warum die Sterne jetzt hinter dem Gelände stehen

Nicht die Entfernung war das Problem, sondern die **Reihenfolge**: Ein
`transparent: true`-Material landet in der transparenten Liste, und die zeichnet
three grundsätzlich nach allen opaken Objekten. Von dort kommt ein Stern nie
hinter das Gelände. Der Ausweg steht in three selbst, `WebGLState.setMaterial`:

    ( material.blending === NormalBlending && material.transparent === false )
      ? setBlending( NoBlending ) : setBlending( material.blending, … )

Additives Mischen bleibt also auch bei `transparent: false` aktiv. Damit gehört
das Feld in die **opake** Liste, wird über `renderOrder` (Kuppel −2, Sterne −1)
vor das Gelände sortiert, prüft und schreibt keine Tiefe — und das Gelände
zeichnet darüber.

### Vier Fehler auf dem Weg, alle nachgemessen

1. **Der sqrt-Ast der sRGB-Kurve.** Ich hatte `sqrt(col)` als „grobe, aber
   ausreichende Näherung" geschrieben. Sie ist es nicht: Die beiden Äste der
   sRGB-Kurve müssen an der Schwelle 0,0031308 zusammenstoßen.

   | Ast | Wert an der Schwelle |
   | --- | ---: |
   | linear, 12,92 · x | 10,31 von 255 |
   | mein sqrt-Ast | **1,03** von 255 |
   | richtig, x^0,41666 · 1,055 − 0,055 | 10,32 von 255 |

   Im Bild war das ein **harter Bogen quer über den Himmel**, je Kanal an einer
   anderen Höhe: `a-eyelevel` Spalte x=200, Grün fiel zwischen y=224 und 225 von
   10 auf 1, Rot zwischen y=312 und 313 ebenso.

2. **Backticks in einem Kommentar innerhalb eines Template-Literals.** Steht
   wörtlich in der Liste der bezahlten Lehren, und ich bin trotzdem
   hineingelaufen — zweimal in derselben Datei. Der Build-Fehler zeigt, wie dort
   beschrieben, auf die Kommentarzeile.

3. **Der Farbverlauf der Milchstraßenkachel entstand vor `translate`.** Canvas
   wertet Verlaufskoordinaten beim Füllen im dann gültigen Koordinatensystem
   aus; der Mittelpunkt landete bei ungefähr dem Doppelten von x, und die
   gefüllte Ellipse traf nur noch das durchsichtige Ende. Ergebnis: eine fast
   schwarze Karte und ein Band, das in keiner der sechs Kameras zu sehen war.
   Nach der Reparatur: Karte Mittel 36,4, Spitze 255 von 255.

4. **Die Staubbahnen hatten null Wirkung.** Ich hatte sie mit
   `destination-out` gezeichnet — das senkt den **Alphakanal**, der Shader liest
   aber den **Rotkanal**. Das Band stand als strukturloser grauer Schacht im
   Bild. Mit `source-over` und Schwarz wird das Ziel wirklich dunkler.

### Zwei Messwerkzeuge, die falsch gemessen haben

**`silhouette.mjs` ist überholt.** Es sucht die Geländekante über die Annahme
„Himmel dunkler als L 7". Seit der Himmel einen Verlauf bis L 27 trägt, hält sie
nicht mehr: Das Werkzeug meldete 128 „Sterne im Gelände" in `c-crater`, wo in
Wahrheit der halbe Himmel als Gelände galt.

Ersatz ist `tools/sterne-hinter.mjs`, das nicht rät, sondern die Szene fragt:
drei Durchgänge je Kamera (normal / ohne Sternfeld / ohne Kuppel und Sternfeld
vor magenta Hintergrund). Aus dem dritten ergibt sich die Geländemaske **ohne
jede Schwelle**, aus der Differenz der ersten beiden der tatsächliche Beitrag
des Sternfelds. Zwei Feinheiten, beide durch Fehlmeldungen erzwungen:

* **Randpixel zählen nicht.** Die Geländekante ist kantengeglättet; ein Stern
  dahinter trägt dort anteilig bei, und das ist richtig so.
* **Nur opake Geometrie verdeckt.** Der Mondhof ist ein transparentes Sprite;
  er stand in der Maske und ließ acht Sterne in `b-moon` als Fehler erscheinen,
  obwohl man durch einen Hof selbstverständlich hindurchsieht.

Ergebnis: **0 Sternpixel vor dem Gelände in allen sechs Kameras** (Summe 0 von
rund 12 100 Sternpixeln).

### Messung

| Größe | Grenze | 00 | 03 | 04 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 12 | **11** |
| Dreiecke (max) | 350 000 | 51 842 | 105 898 | **106 842** |
| Texturspeicher | 60 MB | 0,77 | 2,77 | **4,08** |

Himmelsfläche `a-eyelevel` (100,60)–(1180,380):

| | 00 | 04 |
| --- | --- | --- |
| Mittel | 4,3 | **14,3** |
| p05 … p95 | 2 … 3 (**1 Stufe**) | 9 … 24 (**15 Stufen**) |
| Zenit (200,40) | (2\|2\|6) L 2,3 | (6\|9\|18) L 9,0 |
| horizontnah (200,430) | (5\|2\|2) L 2,6 | (22\|29\|28) L 27,4 |

**Ehrlich anzumerken:** Das Bildmittel steigt spürbar (`a-eyelevel` 25,1 → 34,3,
`b-moon` 9,0 → 19,8), und das p01 geht von 2,3 auf 8…12 — es gibt kein reines
Schwarz mehr im Bild. Das ist die unvermeidliche Folge davon, dass der Himmel
überhaupt einen Wert bekommt. Ob es noch als Nacht liest, ist eine Frage, die
ein Prüfer beantworten müsste; meine eigene Einschätzung dazu ist befangen. Die
Verhältnisse sprechen dafür: Himmel 9…27, Boden 30…90, Mond 224.

**Offen aus diesem Paket:** Das Milchstraßenband liest noch eher als weicher
Schleier denn als Sternwolke. Ich habe die Kachel zweimal überarbeitet (runde
statt langgezogener Ballungen, vier Größenklassen, Körnung, Staubbahnen); es ist
besser, aber nicht gut. Kandidat für den Schlusspass.

**Regression:** Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,816 % (oberer Rand des bekannten Rauschbands 0,6–0,9 %). Build grün, Konsole
ohne Errors und Warnings.

---

## Durchlauf 5 — Paket 3 „Mond"

Weiterhin ohne Prüfer (Konto am Ausgabelimit). Eigenprüfung, **nicht abgenommen**.

### Warum eine Scheibe statt einer Kugel

Aus 32,1 m Abstand hat der Mond einen scheinbaren Radius von 2,5° — er *ist*
eine Scheibe. Die alte Kugel kostete 1216 Dreiecke, um eine Fläche zu zeigen,
die zwei tragen. Wichtiger als die Dreiecke ist die Kontrolle: Auf einer
Billboard-Scheibe steht jeder Bildpunkt an einer bekannten Stelle, und
Randabdunklung, Phase und die Verkürzung der Krater zum Rand hin lassen sich
**rechnen** statt über eine Kugel-UV zu hoffen. Gezeitengebunden ist er ohnehin.

Der Aufbau ist zweistufig, weil beides seine eigene Sprache hat:

* **Albedo** mit Zeichenbefehlen — Maria als zusammenhängende Becken mit
  ausgefransten Rändern (Kernblob plus Kranz), 90 Krater mit Licht- und
  Schattenbogen, zwei Strahlensysteme, feine Fleckigkeit des Hochlands.
* **Beleuchtung je Pixel** — Randabdunklung, Phase und weiche Kante über die
  Kugelnormale `z = √(R² − x² − y²)`. Das geht mit Zeichenbefehlen nicht.

Die Krater werden zum Rand hin verkürzt: Einer bei 80 % Radius wird unter 37°
gesehen. Genau diese Ellipsen machen eine flache Scheibe als Kugel lesbar.

Phase: Sonnenrichtung mit z = 0,47, also rund **74 % beleuchtete Fläche** —
genug Sichel, dass die Kugelform liest, genug Fläche, dass er die Lichtquelle
der Szene bleiben darf. Die unbeleuchtete Seite behält 5,5 % (Erdschein), sonst
wäre sie ein Loch im Sternhimmel.

Hof: **drei** Lagen statt einer, mit sehr verschiedenen Reichweiten und
Exponenten (1,9 / 3,2 / 6,5 bei Größe 26 / 11 / 4,6). Nachgemessen ist der
Übergang glatt — Radialprofil bei y = 360 nach rechts: 18 · 15 · 13,2 · 13 ·
12 · 11,9 · 11,1 · 10,8 · 10,1 · 10 · 10. Keine Stufe, kein Ring.

### Messung

| `b-moon`, Scheibe (615,335)–(665,385) | night-00 | night-05 |
| --- | ---: | ---: |
| Mittel | 191,2 | 93,9 |
| p05 … p95 | 72 … 224 | **11 … 198** |
| Anteil > 190 | 76,4 % | 11,0 % |
| innere Modulation | **keine** (L 224 konstant über 50 px) | Maria, Krater, Terminator |
| Pixel auf reinem Weiß | 0 | **0** |

Der Mond ist nicht mehr die hellste Fläche, sondern der hellste **Gegenstand**.
Dass Mittelwert und Anteil über 190 fallen, ist der Zweck: Vorher war die ganze
Scheibe eine einzige Helligkeit.

### Zwei Fehler, beide nachgemessen

1. **Der enge Hof lag auf der Mondoberfläche.** Alle vier Sprites sitzen am
   selben Ort und haben denselben Kameraabstand; three sortiert die transparente
   Liste nach `renderOrder`, dann Tiefe, dann **Objekt-ID** — und die Scheibe
   entsteht im Quelltext vor den Höfen. Ohne ausdrückliches `renderOrder` löschte
   der Hof als blauweißer Fleck genau die Modulation, um die es geht.
2. **Der erste Grundton war zu dunkel.** 0xb9bcc4 ergab nach Randabdunklung und
   Phase Mittel 75 / p95 159 — dunkler als der Ausgangsstand. Der Mond ist der
   Punkt, auf den die Komposition zeigt; ihn dunkler zu machen wäre das Gegenteil
   der Aufgabe. Jetzt 0xe8eaf0, Randabdunklung von 0,60 auf 0,70 gemildert.

### Ein Fund aus Paket 2, hier behoben

Die hellsten Sterne standen auf exakt **(255|255|255)** — gemessen 34 Pixel in
`b-moon` — und hatten damit keine Farbtemperatur mehr, obwohl genau die in
Paket 2 gebaut wurde. Dieselbe bezahlte Lehre wie bei der Sonnenscheibe des
Zen-Gartens. Der Kern wird jetzt bei 0,93 gedeckelt: **0 Pixel auf reinem Weiß**.

### Backticks, zum dritten Mal — jetzt mit Prüfung

Ich bin in dieser Runde **dreimal** in dieselbe Falle gelaufen: Backticks in
einem Kommentar innerhalb eines Template-Literals brechen den Shader-String, und
der Build-Fehler zeigt auf die Kommentarzeile. Dreimal dieselbe bezahlte Lehre
ist keine Unachtsamkeit mehr, sondern ein fehlendes Werkzeug.

`tools/shaderlint.mjs` meldet es jetzt **vor** dem Build mit Datei und Zeile.
Es kennt maskierte Backticks (`\``) als erlaubt — die erste Fassung hat dort
falsch angeschlagen und wurde daraufhin korrigiert.

### Budget und Regression

| Größe | Grenze | 00 | 04 | 05 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 11 | **13** |
| Dreiecke (max) | 350 000 | 51 842 | 106 842 | **105 632** |
| Texturspeicher | 60 MB | 0,77 | 4,08 | **6,33** |

Sterne vor dem Gelände: **0** über alle sechs Kameras (unverändert).
Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,500 % (Rauschband). Build grün, Konsole ohne Errors und Warnings.

---

## Durchlauf 6 — Paket 4 „Boden"

Weiterhin ohne Prüfer. Eigenprüfung, **nicht abgenommen**.

### Die Aufteilung nach Frequenz, dieselbe wie beim Zen-Sand

| Ortsfrequenz | Träger | Inhalt |
| --- | --- | --- |
| grob, Meter bis Zehnermeter | Scheitelfarben, 0,64 m je Zelle | Verwehungen, Ausbleichen nach Exposition |
| mittel, 34 cm | **rechnerisch aus der Weltposition** | Windrippel |
| fein, 1–3 cm | kachelnde Normalenkarte | Korn |

Alles hat **eine** Windrichtung (35,5° gegen die x-Achse, bewusst nicht
achsenparallel — sonst fiele das Rippelmuster mit den Textur- und Gitterachsen
zusammen und würde zum Raster). Rippel, Verwehungen und Staubfahnen kommen aus
derselben Richtung; drei Merkmale, die einander widersprechen, lesen als Zufall
statt als Wetter.

**Windrippel**, gerechnet: Abstand 34 cm, Sägezahnprofil statt Sinus (flache Luv-,
steile Leeseite; ein reiner Sinus liest als Dünung), mäandernde Kämme über
`quer += 0,35·sin(0,7·laengs)`. **Die Streuung des Abstands ist A·f = 0,245**,
also knapp ein Viertel einer Periode — nicht A·f·Teilung, das war der Fehler,
der auf der Insel 4 % rechnete und 90 % ins Bild stellte.

Sie sind nicht überall: Sie brauchen eine flache Auflage (`normal.y`) und kommen
in Feldern von zwanzig bis vierzig Metern. Ein flächendeckend gleich stark
geripptes Feld ist so sehr ein Muster wie gar keines.

**Verwehungen** sind entlang des Windes um Faktor 6,5 gestreckt abgetastet
(0,020 gegen 0,130) — isotropes Rauschen gäbe Flecken, Verwehungen sind Bahnen.
**Ausbleichen nach Exposition** läuft mit dem Licht statt gegen es: Kämme hell
*und* beschienen, Mulden dunkel *und* im Schatten. Die freigefegten Kämme sind
zusätzlich um wenige Prozent **kühler** — der rote Feinstaub ist dort weg. Das
ist der Unterschied zwischen „heller" und „anderes Material".

**Staubfahnen** liegen in derselben verschmolzenen Fläche wie die
Kontaktverdunklung. Dafür trägt die Farbe jetzt je Scheitelpunkt und die
Materialfarbe ist neutral — vorher stand sie auf Schwarz und konnte nur
abdunkeln. Der Kegel öffnet sich **nur** stromab: Der Streckfaktor kommt aus
dem Anteil in Windrichtung und wird bei null geklemmt; eine symmetrische
Streckung ergäbe eine Ellipse, und die läse als Pfütze statt als Fahne.

### Drei Male, in denen mich das Auge getäuscht hat und die Messung es geklärt hat

Dieses Paket ist ein gutes Beispiel dafür, warum „nach zwei erfolglosen
Anläufen nachmessen" zu spät ansetzt — hier war schon der **erste** Eindruck
falsch.

1. **„Der Shader-Einschub kommt nicht an."** Die Feinstruktur änderte sich
   kaum (1,955 → 1,953), und meine Laufzeitprobe meldete nur ein Programm.
   Beides war falsch gemessen: Der 5×5-Hochpass ist das falsche Instrument für
   ein 25-Pixel-Merkmal, und `renderer.info.programs` war zu früh gelesen. Das
   Bild zeigte die Rippel deutlich.
2. **„Die Brocken sind verschwunden."** Nachgemessen: Δmax 21 gegen den
   Vorstand, **kein einziges Pixel** über 24. Es hatte sich nichts bewegt — die
   Brocken lesen nur weniger, weil der Boden jetzt beschäftigt ist.
3. **„Die Staubfahne steht als heller Keil im Bild."** Gemessen war die Stelle
   (97|64|54) gegen (107|66|53) daneben, also **dunkler** — der Schlagschatten
   des Brockens. Ich hatte die Fahnen daraufhin von 0,30 auf 0,16 gedämpft; die
   Dämpfung ist zurückgenommen (jetzt 0,24), weil ihr Grund falsch war.

### Messung

| | night-00 | night-05 | night-06 |
| --- | --- | --- | --- |
| Feinstruktur `e-ground`, nah → fern | 1,62 · 1,71 · 1,99 · 2,13 · 2,01 | 1,96 · 2,14 · 2,38 · 2,42 · 2,05 | **1,79 · 1,96 · 2,18 · 2,26 · 2,02** |
| `e-ground` Boden, Mittel / p05…p95 | — | 50,3 / 27…84 | 44,2 / 21…78 |
| Draw-Calls (max) | 40 | 13 | **13** |
| Dreiecke (max) | 51 842 | 105 632 | **107 432** |
| Texturspeicher | 0,77 MB | 6,33 MB | **6,33 MB** |

**Was die Messung *nicht* zeigt, und das gehört hierher:**

* Die **Entfernungsabhängigkeit des Korns** ist verbessert, aber nicht gelöst.
  Das nahe Band fällt von 1,96 auf 1,79, die Reihe steigt aber weiterhin zur
  Mitte hin an statt zu fallen. Der 5×5-Hochpass mischt Korn, Rippel und
  Geländekontrast in einer Zahl; für diese Frage bräuchte es ein Maß, das an
  einem festen **Welt**maßstab misst statt an einem festen Pixelmaßstab.
  Offen für den Schlusspass.
* Der **Tonwertumfang ist nicht gewachsen**, obwohl das Ausbleichen nach
  Exposition darauf zielte: `e-ground` p05…p95 bleibt bei 57 Stufen, der
  Mittelwert fällt um 6. Die Rippel kippen die Hälfte der Fläche vom Licht weg,
  und das frisst auf, was die Exposition beiträgt. Kein Fehler, aber auch kein
  Gewinn — die Behauptung „größter Hebel" hat sich für diesen Teil nicht
  bestätigt.

Sterne vor dem Gelände: **0** über alle sechs Kameras. Regression: Zen
bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel 0,707 %
(Rauschband). Build grün, Konsole ohne Errors und Warnings.

---

## Durchlauf 7 — Paket 5 „Geländeform"

Weiterhin ohne Prüfer. Eigenprüfung, **nicht abgenommen**.

### Krater bekommen eine Geschichte

Das alte Profil hatte zwei Zonen — Schüssel und Randwall — und hörte bei
t = 1,14 auf. Die Auswurfdecke fehlte ganz, und weil alle fünf Krater dasselbe
Profil und dieselbe Wallhöhe hatten, las das Feld als „nahezu deckungsgleiche
Ellipsen, nur skaliert". Jetzt vier Zonen: Schüssel (mit dem Alter von der
Parabel zur Wanne), Wall, **Auswurfdecke** mit 1/t³-Abfall bis t = 2,6, dann
nichts. `wall` und `alter` machen daraus eine Familie statt einer Form. Zwei
kleine, sehr frische Krater sind dazugekommen — ein Feld aus fünf gleich großen
liest als Aufzählung, eine Größenverteilung als Einschlagsgeschichte.

Der Rand ist **unrund**: `welligerUmriss` liefert den wirksamen Radius je
Winkel. Ein Feld aus Kreisen ist ein Programmierer-Tell.

**Strahlensysteme sind Albedo, keine Form** — fein zerstäubtes helles Material.
Sie stehen deshalb in den Scheitelfarben und dürfen dadurch über die
Auswurfdecke hinausreichen, ohne das Gelände zu stören. Speichenmuster aus drei
Sinus-Termen mit teilerfremden Frequenzen (7, 11, 17), damit es sich nicht nach
einem Achtel wiederholt.

### Dünen mit Luv und Lee, für den Preis einer zweiten Rauschabtastung

Ein Rauschfeld ist symmetrisch: Jede Erhebung steigt so an, wie sie abfällt.
Der billigste Weg zur Asymmetrie ist, den Vorgang nachzubilden: **Das Feld wird
dort, wo es hoch ist, windabwärts verschoben abgetastet.** Ein Kamm wandert
stromab, sein Luvhang wird gedehnt und flach, sein Leehang gestaucht und steil.

Der Betrag ist gerechnet: Wellenlänge 1/0,05 = 20 m, `fbm2` liefert ±0,5,
6,0 m Versatz je Einheit ergibt ±3,0 m — bis zu 15 % einer Wellenlänge. Mehr
als etwa ein Viertel würde den Kamm über sich selbst falten.

### Vier Verdächtige, drei davon falsch — und ein Strahlenschuss, der es klärte

In `d-aerial` stand rechts eine **helle, flache Platte mit gerader Kante**. Ich
habe nacheinander verdächtigt: die Kuppelfarben, die Einfärbung des Fernrings,
die Quadratkante der Bodenplatte. Alle drei falsch, jedes Mal einen Bau- und
Renderdurchgang.

Ein Strahl durch (1150,330) trifft **`nacht-huegel` bei 39,9 m**. Es waren die
sechs Horizonthügel: abgeflachte Kugelkappen mit **eigenem Material** — keine
Scheitelfarben, keine Normalenkarte, keine Rauheitskarte, keine Windrippel. Sie
standen als glatte Fläche im gerippelten Gelände, und ihre Schnittlinie mit der
Platte las als gerade Kante.

**Ein Hügel ist kein Gegenstand auf dem Gelände — er ist Gelände.** Als
Einträge im Höhenfeld bekommen sie automatisch dieselbe Einfärbung, dasselbe
Korn, dieselben Rippel und Verwehungen; eine Naht kann es gar nicht mehr geben.
Nebenbei fallen ein Draw-Call, 3120 Dreiecke und ein ganzes Material weg. Die
Lage bleibt bei r = 26 bis 38 m; die Verteilung ist bewusst unsymmetrisch —
dichte Gruppe im Nordwesten, weite Lücke im Südosten.

**Die Lehre daraus, und sie ist neu:** Bei einem Bildbefund, der nicht
offensichtlich einer Ursache zuzuordnen ist, ist der **Strahlenschuss durch das
Pixel** die erste Handlung, nicht die vierte. `interactions.raycaster` liegt an
`window.__app` und beantwortet in einer Minute, was drei Durchläufe Raten nicht
beantwortet haben.

### Die Kante bei 48 m

Ein Ring von r = 46 (noch unter der Platte, deren Kante axial bei 48 und
diagonal bei 67,9 liegt) bis r = 150, 5 cm tiefer gelegt, damit in der
Überlappung nichts flimmert. Er nimmt der Kante den Himmel: Der Nebel endet bei
48 m, dahinter ist alles Nebelfarbe — eine dunkle Masse statt eines Schnitts.

Zwei Fehler dabei, beide korrigiert:

1. **Eigene Einfärbungsformel.** Der Ring bekam zuerst eine einfachere; im Bild
   stand daraufhin an der Quadratkante eine helle Naht mit gerader Innenkante —
   genau die Kante, die er auflösen sollte, nur in anderer Farbe. Jetzt färbt
   **eine** Funktion (`bodenFarbe`) beide Flächen ein.
2. **Zu große Amplitude.** Mit ±10 m ragten seine Kämme als schmale,
   konzentrische Bögen über den Nahhorizont und standen als schwebende rote
   Linien im Himmel, mit Sternhimmel dazwischen. Der Ring hat nicht die
   Aufgabe, Berge zu bauen; er bleibt flach und fällt nach außen ab. Ferne
   Silhouetten sind Sache des Steinwerks.

Beim Umbau bin ich zusätzlich in die **temporale Totzone** gelaufen: Die
ausgelagerte `bodenFarbe` stand als `const` hinter ihrer ersten Verwendung.
`npm run build` war grün — der Fehler zeigte sich erst als Zeitüberschreitung
beim Warten auf `window.__app`.

### Messung

Neues Werkzeug `tools/horizont.mjs`. Es sucht die Kante **nicht** über eine
Helligkeitsschwelle — die hält nicht, seit der Himmel selbst einen Verlauf trägt
(dieselbe Falle wie bei `silhouette.mjs`) —, sondern über den Vorzeichenwechsel
von R − B: Boden warm, Himmel kühl, unabhängig von der Helligkeit.

| Horizontkante | night-00 | night-06 | night-07 |
| --- | --- | --- | --- |
| `c-crater` (x 0…260), Spanne | 12 px | 6 px | **90 px** |
| dieselbe, Nachbarspalten gleich hoch | 94,6 % | 95,0 % | **64,2 %** |
| `f-hills` (volle Breite), Spanne | 15 px | 20 px | **33 px** |
| dieselbe, Nachbarspalten gleich hoch | 95,5 % | 93,4 % | **89,5 %** |

`f-hills` bleibt der schwächere Wert — dort schaut man über die weite Lücke im
Südosten, und die ist Absicht. Ob die Bilanz aus „ein Bild mit Kamm, ein Bild
mit Leere" richtig ist, ist eine Kompositionsfrage und gehört in Paket 7.

| Größe | Grenze | 00 | 06 | 07 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 13 | **12** |
| Dreiecke (max) | 350 000 | 51 842 | 107 432 | **105 288** |
| Texturspeicher | 60 MB | 0,77 | 6,33 | **6,33** |

Sterne vor dem Gelände: **0**. Regression: Zen bitgleich, Konstrukt Δmax 1,
Dojo Δ ≥ 8 in 0,000 %, Insel 0,816 % (oberer Rand des Rauschbands). Build grün,
Konsole ohne Errors und Warnings.

### Vorkehrung für den Miniplaneten, wie zugesagt

Krater und Hügel sind **Listen**, die Abstandsmessung ist **eine Funktion**
(`abstand`). Für die Kugel wird daraus die Großkreisdistanz `R · acos(dot(a,b))`,
die Orte werden Einheitsvektoren; Profile, Umrisse, Strahlen und Einfärbung
bleiben unverändert stehen.

---

## Durchlauf 8 — Paket 6 „Steinwerk"

Weiterhin ohne Prüfer. Eigenprüfung, **nicht abgenommen**.

### Warum die alten Brocken als Ikosaeder lasen — und was stattdessen richtig ist

Sie waren `IcosahedronGeometry(s, 1)`: achtzig gleich große, gleich geformte
Dreiecke mit einer **radialen Streuung** je Scheitelpunkt. Radiale Streuung
verschiebt Ecken nach außen und innen — sie erzeugt aber keine **Fläche**.
Das Ergebnis ist ein gerundetes Vielflach mit gleichmäßigen Facetten, also ein
geschliffener Stein. Der Prüfer hat es gemessen: zwei Nachbarfacetten mit 1,8
Stufen Unterschied über je eine ganze ebene Fläche.

Ein zerbrochener Stein entsteht nicht durch Verschieben, sondern durch
**Schneiden**. Ein Sprung läuft als Ebene durch das Material und hinterlässt
eine ebene Fläche; mehrere Sprünge hinterlassen ein Vielflach aus
**unterschiedlich großen** Flächen, die sich in scharfen Kanten treffen.
`bruchGeometrie()` kappt eine Kugel an 7 bis 15 zufälligen Ebenen, in zwei
Durchgängen (wer einen Scheitelpunkt auf eine Ebene setzt, kann ihn dabei über
eine andere hinausschieben).

Der Unterschied ist nicht die Zahl der Dreiecke, sondern ihre **Verteilung**:
Beim Ikosaeder ist jede Facette gleich groß; beim Bruch entscheidet der Zufall
der Ebenen, ob eine Fläche ein Drittel des Steins einnimmt oder einen
Fingernagel.

Die Unterteilung ist ein Messwert: Bei Stufe 3 hat eine Netzkante 15 % des
Radius — auf einem 30-cm-Brocken 4,5 cm, und das ist die Treppung, mit der eine
Schnittkante durch das Netz läuft. Bei Stufe 2 wären es 9 cm und die Kanten
sichtbar ausgefranst. Die Fernfelsen bekommen trotzdem Stufe 2: Aus 40 m ist
eine 15-cm-Kante von einer 30-cm-Kante nicht zu unterscheiden.

### Drei fehlende Materialien, ohne ein neues Material

Der Prüfer zählte zwei Materialien im Inventar, gefordert sind fünf. Die
fehlenden drei kommen als **Einfärbung je Fläche**, nicht je Scheitelpunkt, und
kosten weder eine Textur noch einen Draw-Call:

* **Staub** liegt auf dem, was nach oben zeigt — in der Farbe des Bodens, denn
  von dort kommt er.
* **Bruchgestein** ist, was steil steht: dort hält kein Staub. Heller, kühler,
  weniger rot als die verwitterte Außenhaut. Der Anteil geht mit dem Alter
  zurück.
* **Frost** sammelt sich, wo die Fläche vom Mond abgewandt **und** nach unten
  geneigt ist — die kälteste Stelle des Steins. Ein bläulicher Hauch.

Gerechnet wird in **Weltausrichtung** (die Brocken sind um alle drei Achsen
gedreht); ohne das säße der Staub bei jedem Stein an einer anderen Flanke.
`MOND_ORT` und `MOND_RICHTUNG` stehen dafür jetzt auf Modulebene statt zweimal
im Quelltext.

**Halb verwehte Füße:** Wie tief ein Brocken im Sand steckt, schwankt zwischen
10 % und 65 % — aus `hashNoise`, nicht aus `rand()`, damit sich die Lage der
folgenden Brocken nicht verschiebt.

### Fernfelsen: die Silhouette, die der Szene von Anfang an fehlte

Der erste Prüfbericht listete es als ersten Punkt: „In keinem der sechs Bilder
steht eine einzige Form gegen den Sternhimmel." Seit Paket 5 trägt der Horizont
eine Form, aber eine Geländewelle ist eine weiche Linie — kein Umriss.

Elf Formationen zwischen 30 und 72 m, je zwei bis drei aneinandergeschobene
Blöcke (ein einzelner Körper liest als Gegenstand, mehrere als Aufschluss), in
zwei Bauformen (aufragende Blöcke und lange, flache Abbruchkanten). Sie fallen
in zwei Zonen mit ganz verschiedener Wirkung: **innerhalb des Nebels** noch
beleuchteter Fels mit Streiflicht — die Mittelebene der Tiefenstaffelung, die
bisher fehlte — und **jenseits von 48 m** vollständig Nebelfarbe, also reiner
Umriss.

Verteilung absichtlich unsymmetrisch: dichte Gruppe im Nordwesten hinter den
Hügeln, ein einzelner hoher Block gegen den Mond im Nordosten, im Südosten
nichts. Leere ist eine Entscheidung.

**Ein Rechenfehler dabei, im Bild sichtbar:** Ich hatte `f.h` direkt als
Skalierung genommen. Die Geometrie hat aber Radius 1 und reicht nach dem
Skalieren von −hk bis +hk, wovon hk·0,42 im Boden steckt — über dem Gelände
blieben also nur 58 % der beabsichtigten Höhe. Die erste Fassung stand als Reihe
kleiner Buckel am Horizont statt als Skyline.

### Messung

| Horizontkante | night-00 | night-07 | night-08 |
| --- | --- | --- | --- |
| `f-hills` (volle Breite), Spanne | 15 px | 33 px | **58 px** |
| dieselbe, Nachbarspalten gleich hoch | 95,5 % | 89,5 % | **67,0 %** |
| `c-crater` (x 0…260), Spanne | 12 px | 90 px | 90 px |

`c-crater` bleibt unverändert — dort blickt man in den Krater, die Formationen
liegen außerhalb des Bildes.

| Größe | Grenze | 00 | 07 | 08 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 12 | **13** |
| Dreiecke (max) | 350 000 | 51 842 | 105 288 | **128 328** |
| Texturspeicher | 60 MB | 0,77 | 6,33 | **6,33** |

Sterne vor dem Gelände: **0**. Regression: Zen bitgleich, Konstrukt Δmax 1,
Dojo Δ ≥ 8 in 0,000 %, Insel 0,729 % (Rauschband). Build grün, Konsole ohne
Errors und Warnings.

---

## Durchlauf 9 — Paket 7 „Komposition"

Weiterhin ohne Prüfer. Eigenprüfung, **nicht abgenommen**.

### Was gemessen war

Neues Werkzeug `tools/komposition.mjs`. Es zählt drei Dinge, die der Prüfer
bemängelt hat: die Masseverteilung (über die **Dunkelheit** gewichtet, weil in
einer Nachtszene die dunklen Massen tragen), den Helligkeitsschwerpunkt und den
Kantenanteil im unteren Bilddrittel — also die Frage, ob es überhaupt einen
Vordergrund gibt.

Ausgangslage über alle sechs Kameras: Masse links zu rechts **1,01 · 1,01 ·
1,01 · 1,01 · 1,06 · 1,02**, Kantenanteil im unteren Drittel **0,08 bis
1,80 %**. Beide Hälften gleich schwer, die untere Bildhälfte Fläche.

### Drei Findlinge als Leitlinie zum Mond

Der Mond steht bei Azimut atan2(−24, 14) = **−59,7°**, seine Richtung in der
Ebene ist (0,504 | −0,864). Die Linie von (−9 | 13) über (−6 | 8) nach
(−3 | 3) hat die Richtung (6 | −10), normiert (0,514 | −0,857) — dieselbe
Achse auf ein Grad genau. Der Blick, der den Steinen folgt, landet beim Mond.

Sie werden zum Betrachter hin größer (0,60 → 0,78 → 0,95 m); zusammen mit der
Perspektive ergibt das eine Staffelung in die Tiefe statt einer Reihe. Jeder
besteht aus einem Hauptstein und zwei kleineren Begleitern — ein Monolith
allein liest als aufgestellt, eine Gruppe als etwas, das beim Aufschlag
zersprungen und liegen geblieben ist.

Der nächste steht **4,2 m** vom Ursprung. Näher wäre er im Weg: Der Nutzer
steht im Ursprung, und die Karten ordnen sich bei 1,15 bis 1,5 m um ihn an. Ein
Findling darf Anker sein, nicht Hindernis.

| | night-08 | night-09 |
| --- | --- | --- |
| Kantenanteil unteres Drittel `a-eyelevel` | 1,80 % | **2,27 %** |
| dasselbe `c-crater` | 0,22 % | **0,92 %** |
| dasselbe `e-ground` | 0,27 % | **0,85 %** |
| Lichtschwerpunkt `c-crater` (x / y) | 55,5 % / 22,1 % | **57,8 % / 47,9 %** |
| Lichtschwerpunkt `e-ground` | 87,0 % / 49,4 % | **64,2 % / 57,2 %** |

### Zwei Fehler, einer davon nur durch Lesen gefunden

1. **Die Findlinge bekamen keine Kontaktverdunklung und keine Staubfahne.** Der
   Aufruf `makeKontaktAO(aoStellen)` stand direkt hinter der Brockenschleife;
   die Findlinge tragen ihre Stellen aber später ein. Ein Fehler, den **kein
   Bild gezeigt hätte** — es hätte nur etwas gefehlt, das man nicht vermisst,
   wenn man es nie gesehen hat. Gefunden beim Lesen der Aufrufreihenfolge, nicht
   im Bild.
2. **Sie standen wie Marmor in der Szene.** Gemessen L 109,3 an der beleuchteten
   Fläche gegen L 67,7 am hellsten Boden und L 47,3 an einem verstreuten
   Brocken — das Anderthalbfache des hellsten Bodens, also ein anderes Material
   statt eines größeren Steins. Grundton dunkler, Alter höher (das halbiert den
   Anteil frischen Bruchgesteins), Staub zurück: jetzt L 91,8. Sie stechen
   heraus, ohne aus der Szene zu fallen.

### Was **nicht** gelöst ist, und warum ich es so lasse

**Die Masse links zu rechts bleibt bei 1,00 bis 1,06.** Das ist unverändert und
wird sich mit Mitteln, die ich für richtig halte, auch nicht ändern. Der Grund
ist grundsätzlich: Dies ist eine **VR-Umgebung**. Der Nutzer dreht den Kopf; es
gibt kein festes Bildformat, für das man ausbalancieren könnte. Die Welt hat
eine Asymmetrie — die Hügelgruppe im Nordwesten, die Felsengruppe dahinter, die
bewusste Leere im Südosten, die Findlingsachse zum Mond. Über sechs beliebig
gerichtete 16:9-Ausschnitte mittelt sich das heraus.

Ein Bild links schwerer zu machen hieße, für den Prüfstand zu komponieren statt
für die Welt. Wer das misst, misst die Kameras.

**`b-moon` hat den Mond bei 50,0 % / 49,9 %, also im Bullauge.** Auch das
bleibt: Die Kamera ist mit `look = [14, 16, −24]` definiert, also **auf den
Mond gerichtet**. Ihre Zentrierung ist eine Eigenschaft des Prüfstands, keine
der Szene. Der Mond dorthin zu verschieben, wo er in dieser einen Kamera besser
säße, würde die Vorgabe brechen und in den anderen fünf Kameras nichts
verbessern.

### Messung

| Größe | Grenze | 00 | 08 | 09 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 13 | **15** |
| Dreiecke (max) | 350 000 | 51 842 | 128 328 | **135 168** |
| Texturspeicher | 60 MB | 0,77 | 6,33 | **6,33** |

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,833 % (oberer Rand des Rauschbands). Build grün, Konsole ohne Errors und
Warnings.

---

## Durchlauf 10 — Paket 8 „Leben & Bewegung"

Weiterhin ohne Prüfer. Eigenprüfung, **nicht abgenommen**.

Die Szene bewegte sich in **einer** Zeile: `starsGroup.rotation.y = time * 0.004`
— fünfzehnhundert Sterne starr als ein Körper, wörtlich das, was das Kriterium
ausschließt. Das Sternflimmern kam in Paket 2 dazu (eigene Phase und eigenes
Tempo je Stern); hier kommen Feinstaub, zwei Staubteufel und ein Meteor.

**Die gemeinsame Regel:** Jede Bewegung bekommt ihre eigene Periode, und die
Perioden sind zueinander teilerfremd. Zwei Bewegungen mit verwandten Perioden
fallen regelmäßig zusammen, und genau dieser Zusammenfall liest als „gemacht".

* **Feinstaub** nur auf den Kämmen — ein Punkt gilt als Kamm, wenn er höher
  liegt als seine Nachbarn **quer zum Wind**. Jedes Korn läuft rund vier Meter
  mit dem Wind, steigt dabei und verschwindet. Nicht weiter: Der Shader kennt
  das Höhenfeld nicht und wüsste nach zwanzig Metern nicht, wie hoch der Boden
  dort ist. Über vier Meter ändert er sich um Dezimeter, und das trägt.
* **Staubteufel**, zwei, mit Radius, der mit der Höhe wächst, und einer Drehung,
  die nach oben langsamer wird (innen und unten schnell, außen und oben träge).
* **Ein** Meteor, alle 31 s für 1,1 s — also zu **3,5 %** der Zeit. Wer hinsieht,
  sieht meistens keinen. Gebaut als ein langgezogenes Viereck: Der Schweif ist
  die Streckung des Vierecks selbst, nicht ein Nachziehen mehrerer Bilder.

### Ein Messwerkzeug, das erst nichts messen konnte

`tools/bewegung.mjs` rendert dieselbe Kamera zu 24 Zeitpunkten und misst je
Teil den Beitrag (einmal mit, einmal ohne). Der erste Anlauf meldete an allen
24 Zeitpunkten **exakt denselben Wert** — min = max, für jedes Teil.

Die Ursache lag im Harness, nicht in der Szene: `selectEnv` ersetzt `env.update`
durch einen Verschluss, der sein Argument verwirft. Meine Zeitstellung ging
also ins Leere, und die Renderschleife setzte die Uniformen ohnehin in jedem
Bild auf `FROZEN_TIME` zurück. Die Uhr muss **umgehängt** werden, nicht gestellt:
`env.update = () => original(t)`. `harness-common.mjs` gibt das Original jetzt
über `env.__originalUpdate` heraus.

Ein Werkzeug, das „es bewegt sich nichts" meldet, weil es selbst nichts bewegen
kann, ist gefährlicher als gar keines.

### Zwei eigene Fehler, beide im Bild

1. **Die Staubteufel mauerten das Bild zu.** Gemessen deckte einer bis zu
   **74,7 %** der Bildfläche ab. Zwei Ursachen: Ihre Bahn war ein Kreuz aus
   zwei unabhängigen Sinus — eine Lissajous-Figur, und die läuft durch den
   Ursprung, also durch die Kamera. Und ein Korn in zwei Metern Abstand bekam
   375 Pixel Durchmesser. Jetzt umkreisen sie den Ursprung in 14 bis 26 m, die
   Punktgröße ist bei 22 px gedeckelt, und im Nahfeld blenden sie aus. Neuer
   Höchstwert: **1,6 %**.
2. **Der Feinstaub war orangefarbener Funkenflug.** Ich hatte seine Farbe vom
   **Boden** genommen. Das ist eine falsche Vorstellung: Der Boden ist rot, weil
   er im Mondlicht rot **reflektiert**; ein Staubkorn in der Luft wird von
   derselben Quelle beschienen und ist deshalb kühl und schwach. Es leuchtet
   nicht, es wird angeleuchtet. Farbe auf 0x4c5568, Stärke von 1,6 über 0,30
   (unsichtbar) auf 0,62.

### Messung

Beitrag je Teil über 24 Zeitpunkte (4,0 s bis 43,1 s), `a-eyelevel`:

| Teil | Mittel | min | max |
| --- | ---: | ---: | ---: |
| `nacht-staub` | 0,469 % | 0,428 | 0,501 |
| `nacht-staubteufel` | 0,589 % | 0,000 | 1,640 |
| `nacht-sterne` | 0,377 % | 0,358 | 0,393 |

Korrelation der Beitragsreihen (nahe 1 wäre Gleichtakt): Staub/Staubteufel
**−0,088**, Staub/Sterne **−0,005**. Kein Paar läuft im Takt.

Meteor, eigene Kamera und eigene Zeitpunkte (in `a-eyelevel` liegt seine Bahn
außerhalb des Blickfelds, und ein 1,7-s-Raster trifft ein 1,1-s-Fenster meistens
nicht — der erste Anlauf sah deshalb aus wie ein Fehler):

| t | sichtbarer Anteil |
| ---: | ---: |
| 0,25 s | 0,000 % |
| 0,45 s | **0,077 %** |
| 1,05 s | **0,014 %** |
| 1,30 s | 0,000 % |
| 31,30 s | **0,046 %** |

Genau eine Periode später wieder da.

| Größe | Grenze | 00 | 09 | 10 |
| --- | ---: | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | 15 | **18** |
| Dreiecke (max) | 350 000 | 51 842 | 135 168 | **135 170** |
| Texturspeicher | 60 MB | 0,77 | 6,33 | **6,33** |

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δ ≥ 8 in 0,000 %, Insel
0,582 %. Build grün, Konsole ohne Errors und Warnings.

---

## Durchlauf 11 — Paket 9 „Schlusspass"

Ohne Prüfer (Konto am Ausgabelimit seit Durchlauf 3). **Nichts hiervon ist
abgenommen.**

### Der offene Punkt aus Paket 2, endlich verstanden

Das Milchstraßenband las über drei Fassungen hinweg als weicher Schleier — wie
Zirren oder Polarlicht, nicht wie eine Sternwolke. Ich habe an den Ballungen
gedreht, an den Staubbahnen, an der Stärke. Der Fehler saß in **einer Zahl**,
die ich nie nachgerechnet hatte.

Die Kachel wird ungleichmäßig auf den Himmel abgebildet:

```
u läuft über 360,0° auf 1024 Texel  →  0,3516° je Texel
v läuft über  42,8° auf  256 Texel  →  0,1673° je Texel
```

Ein Texel ist in Bandrichtung also **2,10-mal so groß** wie quer dazu. Damit ein
Blob am **Himmel** rund erscheint, muss er in der Kachel 2,10-mal **höher als
breit** sein. Im Code stand `ctx.scale(r * 1.7, r)` — 1,7-mal **breiter** als
hoch. Verkehrt herum, und in der Wirkung um Faktor **1,7 × 2,10 = 3,6** in
Bandrichtung gestreckt.

Dass ich den Kommentar „1,7 gleicht die Dehnung der Abbildung aus" selbst
geschrieben hatte, ohne die Richtung zu prüfen, ist der eigentliche Fehler.
Ein Faktor, der eine Verzerrung ausgleichen soll, gehört hergeleitet, nicht
geschätzt — das ist dieselbe Lehre wie „Wicklungsreihenfolge ausrechnen, nicht
raten".

### Gesamtbilanz: Ausgangsstand gegen Schlussstand

**Tonwert des Bodens** (Bereich (100,420)–(1180,700)), p05…p95:

| Bild | night-00 | night-11 |
| --- | --- | --- |
| `a-eyelevel` | 3 … 68 | **21 … 95** |
| `c-crater` | 47 … 60 (**13 Stufen**) | **20 … 73 (53 Stufen)** |
| `e-ground` | 32 … 62 | **17 … 88** |
| `f-hills` | 37 … 64 | **51 … 81** |

**Himmelsfläche** `a-eyelevel` (100,60)–(1180,380):

| | night-00 | night-11 |
| --- | --- | --- |
| Mittel | 4,3 | **14,0** |
| p05 … p95 | 2 … 3 (**1 Stufe**) | **9 … 29 (20 Stufen)** |

**Bildmittel / p99** über die sechs Kameras:

| Bild | night-00 | night-11 |
| --- | --- | --- |
| `a-eyelevel` | 21,9 / 69,9 | 33,3 / **100,9** |
| `b-moon` | 7,7 / 72,4 | 20,2 / **101,7** |
| `c-crater` | 35,4 / 64,6 | 44,3 / **92,1** |
| `d-aerial` | 34,8 / 62,3 | 42,0 / **80,3** |
| `e-ground` | 30,4 / 68,4 | 37,6 / **101,2** |
| `f-hills` | 25,4 / 67,2 | 36,5 / **89,3** |

**Horizont** `f-hills`: Spanne 15 px → **58 px**, gleich hohe Nachbarspalten
95,5 % → **67,0 %**.
**Vordergrund** `c-crater`: Kantenanteil im unteren Drittel 0,03 % → **0,92 %**.
**Sterne vor dem Gelände**: 18 in `d-aerial` → **0 über alle sechs Kameras**.

### Budget

| Größe | Grenze | night-00 | night-11 |
| --- | ---: | ---: | ---: |
| Draw-Calls (max) | 120 | 40 | **18** |
| Dreiecke (max) | 350 000 | 51 842 | **135 170** |
| Texturspeicher | 60 MB | 0,77 | **6,33** |
| Shader-Programme | – | 7 | 12 |

Die Draw-Calls sind **gefallen**, obwohl fünf Objektklassen dazugekommen sind
(Fernfeldring, Fernfelsen, Findlinge, drei Bewegungsträger): Brocken, Hügel,
Findlinge und Felsen sind je Klasse verschmolzen, und die Horizonthügel sind
ganz im Höhenfeld aufgegangen. 102 Draw-Calls und 215 000 Dreiecke bleiben frei.

### Eigenprüfung gegen die acht Kriterien

**Ich schreibe hier bewusst nicht „bestanden".** Der Prüfer ist seit Durchlauf 3
ausgefallen, und an der eigenen Arbeit ist man nicht unbefangen. Was folgt, ist
eine Zustandsbeschreibung mit Belegen, kein Urteil.

| # | Kriterium | Stand | Beleg |
| --- | --- | --- | --- |
| 1 | Silhouette | elf Felsformationen stehen als Umriss gegen den Sternhimmel; Horizontspanne 15 → 58 px | Paket 6 |
| 2 | Komposition | Findlingsachse auf −59,1° gegen Mondazimut −59,7°; Vordergrundkanten 0,03 → 0,92 % | Paket 7 |
| 3 | Licht | eine gerichtete Quelle mit Schattenkarte, Kontaktverdunklung, Streiflicht auf Bruchflächen | Pakete 1, 6 |
| 4 | Farbharmonie | Blau führt an keiner gemessenen Stelle über Grün; kalte Lichtseite gegen warmen Schatten | Paket 1 |
| 5 | Materialtrennung | Staub, Fels, Bruchgestein, Frost, Ferne — fünf, ohne ein neues Material | Paket 6 |
| 6 | Tiefenstaffelung | Fernfelsen als Mittelebene, Fernfeldring als Ferne, Extinktion am Himmel | Pakete 2, 6 |
| 7 | Bewegung | vier Träger, Korrelation der Beitragsreihen −0,088 und −0,005 | Paket 8 |
| 8 | Programmierer-Tell | Gitterrauschen, Ikosaeder, Kreis-Krater, gerader Horizont je einzeln behoben | Pakete 1, 5, 6 |

### Was offen bleibt

1. **Die Entfernungsabhängigkeit des Korns.** Verbessert (nahes Band 1,96 →
   1,79), aber die Reihe steigt weiterhin zur Mitte hin an statt zu fallen. Für
   diese Frage bräuchte es ein Maß an festem **Welt**maßstab statt an festem
   Pixelmaßstab; der 5×5-Hochpass mischt Korn, Rippel und Geländekontrast in
   einer Zahl.
2. **Die Masse links zu rechts bleibt bei 1,00 bis 1,06.** Begründung in
   Durchlauf 9: In einer VR-Umgebung gibt es kein festes Bildformat, für das man
   ausbalancieren könnte. Ein Bild links schwerer zu machen hieße, für den
   Prüfstand zu komponieren.
3. **Der Mond sitzt in `b-moon` im Bullauge.** Die Kamera ist mit
   `look = [14, 16, −24]` auf ihn gerichtet — eine Eigenschaft des Prüfstands.
4. **Kein unbefangenes Urteil.** Sieben von neun Paketen sind ohne Prüfer
   entstanden.

### Die Lehren dieser Runde, für das nächste Mal

* **Ein Faktor, der eine Verzerrung ausgleichen soll, gehört hergeleitet.** Die
  1,7 in der Milchstraßenkachel war geschätzt, stand mit einem
  selbstgeschriebenen Kommentar da, der sie erklärte, und war um Faktor 3,6
  falsch.
* **Bei einem Bildbefund ohne offensichtliche Ursache: Strahlenschuss durch das
  Pixel, erste Handlung.** `interactions.raycaster` an `window.__app` hat in
  einer Minute geklärt, was drei Durchläufe Raten nicht geklärt haben.
* **Das Auge lügt öfter als die Zahl — auch beim ersten Eindruck.** Dreimal in
  Paket 4, einmal in Paket 5, einmal in Paket 7: „Die Brocken sind verschwunden",
  „die Fahne ist zu hell", „der Einschub kommt nicht an" — jedes Mal widerlegt.
* **Ein Messwerkzeug altert mit der Szene.** `silhouette.mjs` maß Felsfacetten
  als Sterne, sobald der Himmel einen Verlauf bekam. `bewegung.mjs` maß
  Bewegungslosigkeit, weil es selbst nichts bewegen konnte. Beide Male sah es
  nach einem Szenenfehler aus.
* **Backticks in Shader-Kommentaren.** Dreimal in einer Runde. Jetzt gibt es
  `tools/shaderlint.mjs`.

---

## Durchlauf 12–14: Der Nachthimmel wird ein Planet

Nach dem Abschluss der neun Pakete hat der Auftraggeber eine neue Frage
gestellt: ob aus der flachen Platte eine **Kugel** werden kann, die man in gut
einer Minute umrundet. Der Plan dazu steht in
`/root/.claude/plans/so-ich-hab-mal-glimmering-sloth.md`; entschieden wurden
Halbmesser 25 m, Karten bleiben am Planeten liegen, der Mond geht unter.

**Der Ansatz: die Welt dreht sich, nicht der Spieler.** Den Spieler auf der
Kugel aufzurichten hätte jede Y-oben-Annahme der App auf einmal gebrochen —
`Locomotion` rechnet mit UP = (0,1,0), `cards.js` ordnet Karten auf einem
Zylinder an und richtet sie mit gleichbleibendem y auf, Whiteboard und Zonen
sind flach und achsenparallel. Stattdessen bleibt der Spieler am Nordpol und
`weltGruppe` dreht sich unter ihm. Optisch dieselbe Relativbewegung, nur trägt
eine andere Matrix sie.

Die Umrechnung sitzt vollständig in `makePlanetWalk` (src/walkable.js):
`limit()` bekommt ohnehin jedes Bild die Weltposition des Kopfes und schiebt sie
zurück — auf dem Planeten wird der Abstand vom Pol vorher in eine Weltdrehung
umgerechnet. **`Locomotion` und `updateDesktopMovement` sind unverändert und
wissen nichts von Kugeln.** 90 cm Freiraum bleiben für Raumskala-Bewegung; erst
was darüber hinausgeht, dreht die Welt.

### Sieben gemessene Fehler

| Befund im Bild | Ursache | Beleg |
| --- | --- | --- |
| Ball aus 3-m-Facetten | `detail` in three ist **kein** Rekursionsgrad: `PolyhedronGeometry` zerlegt jede Grundfläche in (detail+1)², nicht in 4^detail | 2940 Scheitel gemessen statt 245 760; jetzt detail 63 |
| Flickenteppich aus 40-cm-Rauten | `computeVertexNormals()` auf **nicht-indizierter** Geometrie ist Flat-Shading | blieb ohne Normalenkarte, Rauheitskarte und Scheitelfarben stehen; Normalen kommen jetzt analytisch aus dem Höhenfeld |
| schwarze Kuppel von 40° mitten im Bild | `camera.far` = 260 gegen Kuppel bei 300; die Fernebene schneidet nach **Sichttiefe**, nicht nach Abstand | Loch zeigte exakt die Hintergrundfarbe (10\|6\|5); mit far = 5000 füllte es sich auf (30\|32\|38). cos 29,9° = 260/300 |
| breiter schwarzer Streifen über dem Boden | der Himmelsverlauf hatte seinen Horizont auf Augenhöhe; auf der Kugel liegt er 20,0° tiefer | Strahl traf `nacht-kuppel` bei dir.y = −0,046, also im Ast `unten` |
| Kamm aus parallelen Strichen quer über den Terminator | Schattenakne: `normalBias` 0,008 reicht nicht, wenn das Licht streift — und auf einer Kugel streift es immer irgendwo | Reihe 0,008 / 0,03 / 0,06 / 0,10; ab 0,06 verschwindet der Kamm, die Schlagschatten bleiben |
| Kamm aus Strichen auf der Fläche selbst | die Windrippel zogen ihre Phase aus der waagerechten Projektion der Weltkoordinate — am Äquator der Y-Achse werden daraus Meterabstände | Strahl traf `nacht-planet` bei (25,04 \| 4,78 \| 2,78). Feld jetzt zonal um `WIND_POL`, Kammzahl **ganzzahlig** (462), damit keine Naht vom Pol zum Pol entsteht |
| Fuß des Staubteufels auf reinem Weiß | 420 Körner additiv auf 0,22 m Fußradius; auf der Platte war er nie näher als 14 m | (255\|255\|255) gemessen; Fußradius 0,40 m und Faktor 0,25 statt 0,42 → Spitze 167 |

Dazu zwei Fehler ohne Bildbefund, weil sie Geometriemenge kosteten statt Pixel:
Die Formationen steckten mit der alten Begrabungsregel bis auf **6,3 m an den
Planetenmittelpunkt** (26 m Körper für 7,7 m Wirkung), und ihre Breite von 11 m
bei 3,3 m Höhe stand in der Totale wie eine Warze auf der Kugel.

### Der Rundgang, gemessen (`tools/rundgang.mjs`)

4712 Schritte zu 3,3 cm — das ist 2,4 m/s bei 72 Bildern je Sekunde, also genau
das, was in der Brille passiert.

| Frage | Messwert |
| --- | --- |
| Schließt der Rundgang? | Restwinkel 0,0297° = **1,30 cm** nach 157,07 m |
| Steht der Boden wieder da? | Geländehöhe Start 0,3423 m, Ende 0,3417 m |
| Steht die Sperre auf dem Gelände? | \|`walk.floorAt` − wirkliches Gelände\| max **0,000 mm** |
| Hinkt die weiche Nachführung? | p50 2,55 cm, p95 12,18 cm, max **37,92 cm** |
| Geht der Mond unter? | +29,9° am Start, +63,9° nach 26 m, −3,3° nach 65 m, −63,9° nach 105 m |
| Trägt die Nachtseite Tonwert? | 6 von 12 Stationen ohne Mond, Spanne p05–p95 dort 12,4 bis 21,0 (gegen 73 bis 92 auf der Lichtseite) |

**Die Vorgabe „unter einem Zentimeter" ist am Höhenfeld erfüllt und an der
Nachführung nicht — und das ist keine Eigenschaft des Planeten.** Die weiche
Nachführung ist ein Tiefpass erster Ordnung mit k = 7/s; sein Nachlauf bei einer
Geländerate v ist v/k. Die größte Abweichung steht bei einer Steigung von 1,46,
also 2,4 · 1,46 / 7 = 50 cm für eine **anhaltende** Rampe; gemessen sind 37,9 cm,
weil die Flanke kürzer ist. Dieselbe Rechnung gilt für den Randwall der
Himmelsinsel und die Dojo-Stufe. Wer das ändern will, ändert `dt * 7` in
`main.js` und macht dafür jede Stufe härter — das ist eine Entscheidung über die
ganze App, nicht über diese Umgebung, und sie ist hier nicht getroffen worden.

### Karten bleiben liegen (`tools/karten-planet.mjs`)

Alle dreizehn Prüfungen bestanden: Karte und Zone hängen an `nacht-welt`,
wandern 52,42 bzw. 53,14 m mit auf die Gegenseite, stehen nach der ganzen Runde
wieder exakt dort, der Stand vermerkt `frame: 'planet'`, und der gespeicherte Ort
ist unabhängig davon, wo der Nutzer beim Speichern stand. Gegenprobe im
Zen-Garten: beide hängen dort weiter an der Szene, beide Stände bleiben im alten
Format.

**Zwei dieser Prüfungen sind zuerst fehlgeschlagen, und der Fehler lag im
Werkzeug.** Die Sperre läuft in `karten-planet.mjs` mit — sie soll ja mitlaufen
— und dreht die Welt in jedem Bild ein Stück, solange der Kopf neben dem Pol
steht. Die Weltpose der Karte wurde damit einmal unter einer beliebigen Drehung
abgelesen und später unter der Identität; gemessen war das ein Unterschied von
31 cm bei einer Karte, die sich nicht bewegt hatte. Die Ausgangsstellung wird
jetzt festgenagelt. Vierter Fall in diesem Auftrag, in dem ein Messwerkzeug den
Fehler hatte und nicht die Szene.

**Nachtrag: die Zonen mussten mit.** Ich hatte hier zuerst geschrieben, die
Zugehörigkeit einer Karte zu einer Zone ändere sich beim Weitergehen still. Das
war falsch beschrieben — `zones.js` kennt überhaupt keine Zugehörigkeit, eine
Zone ist ein beschrifteter Rahmen, vor dem Karten stehen. Die Folge ist dadurch
aber **schlimmer**, nicht harmloser: Wandern die Karten mit dem Planeten und
bleibt der Rahmen beim Nutzer, dann steht nach zwanzig Schritten ein leerer
Rahmen vor ihm und die Gruppe liegt hinter dem Horizont. Zonen haben deshalb
dieselbe Heimat bekommen wie Karten, und die Umrechnung sitzt jetzt in einem
eigenen Modul (`src/heimat.js`), damit sie nicht zweimal von Hand dasteht.

**Das Whiteboard bekommt bewusst keine Heimat.** Es wird ein- und ausgeblendet
und bei jedem Einblenden vor den Nutzer gesetzt — ein Werkzeug, kein Gegenstand
der Welt. Es bleibt an der Szene.

Auch das Loslassen ist versorgt: Ein Greifziel meldet über `heimat()`, wohin es
zurückgehängt wird. Ohne das landete eine losgelassene Zone in der Szene, also
beim Nutzer statt auf dem Planeten.

### Budget und Regression

| Größe | Budget | Platte (Durchlauf 11) | Planet |
| --- | --- | --- | --- |
| Draw-Calls | 120 | 18 | **18** |
| Dreiecke | 350 000 | 135 170 | **307 234** |
| Texturspeicher | 60 MB | 6,33 | **6,33** |
| Sterne vor dem Gelände | 0 | 0 | **0** |

Die Dreiecke sind der teure Posten: 81 920 für die Icosphere, 43 200 für 240
Brocken, 29 880 für die Kontaktscheiben, dazu der Schattendurchgang. 42 766
bleiben frei. `bruchGeometrie` hat dafür einen Parameter für die Unterteilung
bekommen — Stufe 2 statt 3 sind 180 statt 320 Dreiecke je Brocken, und für einen
Brocken von 30 cm, dessen Form aus den Schnittebenen kommt und nicht aus der
Kugel darunter, sind die 320 Verschwendung.

**Regression:** Der einzige Eingriff außerhalb des Nachthimmels ist
`camera.far` 260 → 340. Gemessen, nicht behauptet: derselbe Stand einmal mit
260 und einmal mit 340 gerendert ergibt Δmittel 0,001 (Insel), 0,000 (Zen),
0,000 (Konstrukt), 0,008 (Dojo) — jeweils innerhalb des eigenen Rauschbands der
Umgebung. Die große Abweichung gegen `night-11` (Δmittel 21,95 auf der Insel)
stammt aus dem Zweigzusammenführung davor, nicht aus dieser Arbeit;
`tools/shots/planet-01` ist der neue Bezugsstand.

**Die sechs eingefrorenen Kameras sind ersetzt.** `f-hills` zeigte
Horizonthügel, die es nicht mehr gibt, und `d-aerial` stand bei (18 \| 14 \| 22)
— das liegt jetzt **innerhalb** des Planeten. Der Messvergleich gegen night-XX
endet damit; `PLANET_SHOTS` beginnt eine neue Reihe. Zwei Zahlen bestimmen darin
jeden Bildausschnitt: Der Horizont liegt 19,9° unter Augenhöhe und in 8,7 m
Bogenabstand, und der Mond steht in Azimut 150°.

### Ein schwarzer Ring, der keiner war

In der Totale `d-orbit` stand ein schwarzer Ring um den Planeten. Ich hatte ihn
zuerst als den Ast `unten` des Himmelsverlaufs gedeutet, von außen gesehen —
plausibel und **falsch**. Ein Strahl durch (400 | 120) traf gar nichts und das
Pixel zeigte exakt die Hintergrundfarbe (10 | 6 | 5); ein zweiter durch
(340 | 180) traf die Kuppel in **363,7 m**.

Es war dieselbe Fernebene wie schon einmal, nur andersherum: Der Spieler steht
immer am Nordpol, dort ist die Kuppel überall 298 bis 302 m entfernt, und
340 m Fernebene reichen bequem. Diese Prüfkamera aber steht 77 m außerhalb, und
von dort reicht die Kuppel von 226 bis 374 m.

**Behoben wurde das Instrument, nicht die Szene.** Ein Prüfbild darf jetzt
`fern` setzen, wie es schon `nebel: false` setzen durfte; beides gilt nur für
diese eine Kamera, die als einzige außerhalb der Modellannahme steht. In der
Brille kann diese Ansicht niemand einnehmen.

## Der Prüfer ist zurück — und der schlimmste Befund war mein Messstand

Nach acht Durchläufen ohne unbefangenes Urteil hat der Prüfer wieder gearbeitet.
Sein auffälligster Befund: In `rund-060` läuft von (700 | 704) bis (1260 | 459)
eine **mathematisch gerade Kante** durch den Boden, darunter fast Schwarz. Er hat
sie über 560 Bildpunkte nachgemessen — Abweichung von der Geraden **null**. Auf
einer Kugel gibt es keine geraden Kanten.

Er hatte recht, und der Fehler stand im Werkzeug. `tools/rundgang.mjs` hat für
alle zwölf Stationen die Augenhöhe von Station 0 behalten (26,94 m). Der Boden
unter dem Nordpol ist aber nicht überall gleich hoch — er schwankt über den
Rundgang zwischen −1,12 und +2,11 m. Bei Station 60 lag das Auge damit **4 cm
über dem Gelände**: Ein Strahl durch die Bildmitte traf `nacht-planet` in 0,1 m.
Die „gerade Kante" war die Bodenfläche, von der Nasenspitze aus gesehen, und die
ist über wenige Meter eben. Die Augenhöhe kommt jetzt je Station aus demselben
Höhenfeld, aus dem sie die Sperre im Betrieb nimmt.

**Ein echter Fehler kam bei der Suche trotzdem heraus, nur ein kleinerer.** Das
Ziel des Mondlichts stand als (0 | −PLANET_R | 0) **in der Himmelsgruppe** — der
Planetenmittelpunkt, solange die Welt unverdreht steht. Bei 60 Grad steht es bei
(0 | 12,5 | −21,65), also 25 m daneben, bei 180 Grad bei (0 | 50 | 0). Die
Orthobox der Schattenkarte von ±34 m deckte damit nicht mehr den ganzen Planeten
ab. Das Ziel hängt jetzt an der Umgebungsgruppe im Ursprung.

**Zugeordnet, nicht behauptet:** Der Unterschied zwischen altem und neuem Ziel
beträgt bei Station 60 Δmittel 1,124 bei einem Δmax von **3** Stufen und bei
Station 180 exakt null. Der Fehler war real, seine Bildwirkung war klein — die
gerade Kante hat er **nicht** verursacht.

Und `tools/rundgang.mjs` kann diesen Fehlertyp jetzt selbst finden: Es sucht je
Station die längste Kante, **die auf beiden Seiten Gelände hat** (Boden ist warm,
R > B; Himmel ist kühl — dasselbe Kriterium wie `tools/horizont.mjs`), legt eine
Ausgleichsgerade hindurch und meldet die größte Abweichung. Die
Helligkeitsstatistik allein hat den Streifen nicht gesehen: Ein halb so heller
Streifen verschiebt Mittel und Perzentile um wenige Stufen und sieht aus wie eine
Wolke. **Ein Bildmaß muss die Form messen, nicht nur die Menge.**

### Der leuchtende Saum auf der Gratlinie

Der dritte Befund des Prüfers: In `rund-300` liegt ein bis drei Bildpunkte über
der Geländekante ein neutralgrauer Saum, drei- bis vierfach heller als der
Himmel und der Boden, die er trennt. Er hat recht; ein Ausschnitt bei sechsfacher
Vergrößerung zeigt eine harte weiße Reihe genau auf der Kammlinie.

**Was es nicht ist, ist gemessen:** Weder `nacht-staub` noch `nacht-staubteufel`
noch `kontaktverdunklung` noch Brocken, Findlinge oder Landmarken ändern etwas
daran. Mit ausgeschaltetem Mondlicht fällt die Zahl der Saumpixel von 165 auf
14; mit ausgeschaltetem **Schattenwurf** steigt sie auf 1276. Es ist also die
Bodenfläche selbst, beleuchtet, und der Schatten hält den größten Teil davon
schon ab.

Der Rest ist ein Lichtleck: `normalBias` verschiebt den Abtastpunkt entlang der
Flächennormale, und an einer Kante greift diese Verschiebung über den Grat.
Gemessen an Station 300:

| normalBias | 0,008 | 0,015 | **0,025** | 0,04 | 0,06 |
| --- | --- | --- | --- | --- | --- |
| Saumpixel | 381 | 247 | **165** | 188 | 296 |

Eine Wanne, kein Optimum: Zu wenig gibt Akne, zu viel gibt das Leck. Der Wert
steht jetzt auf 0,025 statt 0,06 — der alte war allein gegen die Akne am
Terminator gewählt, bevor der Saum bekannt war.

**Zwei Versuche, die Wanne zu umgehen, sind gescheitert, und beide sind
lehrreich.** Der erste wollte das Texel verfeinern: Der Spieler sieht nie mehr
als gut 20 m, also müsste eine Box von ±20 m um den Nordpol reichen und wäre mit
1,95 cm je Texel 1,7-mal feiner. Ergebnis: 1276 Saumpixel, unabhängig vom Bias.
**Die Nachtseite entsteht durch Selbstverschattung** — was das Licht dort abhält,
ist der Planetenbauch, und der steht bis 25 m quer zur Lichtachse. Ohne ihn wird
gar nicht mehr verschattet, und genau das sagt die Unabhängigkeit vom Bias.

Der zweite wollte den Glanzanteil dämpfen: three setzt für ein Dielektrikum
specularColor = 0,04 und lässt den Fresnel-Term bei streifendem Einfall gegen
eins laufen, was auf jeder Gratlinie einen hellen Rand ergibt. Der Einschub an
`#include <lights_physical_fragment>` **greift nicht** — ein Kontrolltest, der
den Boden rot färben sollte, ließ ihn braun, auch nach dem Abschießen aller
laufenden Entwicklungsserver. Warum, ist offen; die Änderung ist wieder heraus,
statt ungeprüft stehenzubleiben.

Damit bleibt der Saum halbiert und nicht behoben. Das ist der ehrliche Stand.

### Staubteufel und Sterne

**Der Staubteufel bestand nicht aus Staub.** Der Prüfer hat bei (500 | 250) ein
kühles Fliederrgrau (144 | 126 | 138) gemessen, gegen einen Boden von
(114 | 70 | 53). Meine Begründung für die kühle Farbe war halb richtig: Die
Quelle ist das Mondlicht — aber ein Korn in der Luft hat die **Albedo des
Bodens**, aus dem es hochgerissen wurde, und die ist warm. 0x5e5a5e war
obendrein magentastichig (Rot und Blau gleich, Grün darunter). Jetzt 0x7a685c.

Er war außerdem **heller als jeder Bodenpunkt der Szene** — Spitze 167 gegen
113,9. Der Zwischenschritt von 0,25 auf 0,17 hat nichts gebracht, und das war
rechenbar: Die neue Farbe ist linear 42 % heller als die alte (0,152 gegen
0,107) und hebt die Absenkung um 32 % fast genau auf; gemessen 156 vorher, 166
nachher. Erst 0,105 bringt die Spitze auf **108,5**, also unter den hellsten
Boden, und die Farbe (141 | 102 | 77) liegt jetzt in derselben Familie wie der
Boden (152 | 105 | 90).

Und er hatte keinen Fuß — „unten bricht sie ohne Fußsaum ab". Die untersten 13 %
der Körner bekommen jetzt einen weiten flachen Kranz statt der schlanken Säule
und werden dabei um 45 % dunkler: Was am Boden schleift, liegt im Eigenschatten
des Wirbels.

**Die Sterne waren Quadrate**, und die Ursache stand im Code: `max(1.0, …)` auf
die Punktgröße. Der runde Auslauf im Fragmentschritt kann nichts formen, wenn
das Fenster 1×1 Bildpunkt groß ist. Physikalisch ist ein Stern ein Punkt; was man
sieht, ist die Punktbildfunktion des Instruments, und die ist mehrere Bildpunkte
breit. Die Mindestgröße steht jetzt auf 4,2 Bildpunkten, und **unterhalb davon
wird der Stern nicht kleiner, sondern schwächer** — die Fläche bleibt stehen, die
Helligkeit geht mit dem Quadrat des Verhältnisses zurück, gedeckelt bei 0,30,
damit die schwachen Sterne nicht ganz verschwinden. Sie tragen die Dichte des
Himmels.

Nachgeprüft, dass die Änderung wirklich im Material steht (`vSchwund` und
`MINGROESSE` im übersetzten Shader) — nachdem ein anderer Shader-Einschub am
selben Tag nachweislich **nicht** gegriffen hatte, ist das keine überflüssige
Frage mehr.

### Steinlage und Luftglühen

**„Jeder Stein zeigt exakt vom Mittelpunkt weg."** Der Prüfer hat das als den
Grund benannt, warum die Kugel als Ball liest und nicht als Ort: kein einziger
liegt gekippt, gestürzt, verkantet. Die Kippung betrug höchstens 26 Grad gegen
die Flächennormale. Jetzt gibt es drei Lagen — gut die Hälfte liegt flach
eingeregelt, ein Drittel steht schief, weil es auf etwas anderem aufliegt, der
Rest liegt beliebig.

Das erzwang eine zweite Änderung: **Wie tief ein Brocken steckt, kann nicht mehr
aus seinem Sollmaß kommen.** Ein Körper, der auf der Seite liegt, hat eine ganz
andere Höhe als einer, der flach liegt — er ist ja abgeplattet. Die Einsinktiefe
wird deshalb aus der gemessenen Ausdehnung **längs der Flächennormale** gebildet,
nachdem die Drehung steht. Sonst schwebte der eine und versänke der andere.

**Das Luftglühen war ein aufgemalter Streifen.** Gemessen stand in `f-kante` bei
x = 150, 300 und 1000 exakt derselbe Wert (23 | 31 | 29) — über die volle
Bildbreite kein Zahlenschritt Unterschied. Es bekommt jetzt Wellen: drei Sinus
über die waagerechte Richtung mit ganzzahlfremden Frequenzen, dazu eine leichte
Höhenwanderung der Schicht. Dieselben sechs Messpunkte liegen jetzt zwischen
15,1 und 23,0.

**Und dabei ein Fehler, der das ganze Programm gekostet hat:** Die Kuppel war im
Bild komplett weg und die Konsole voll von „useProgram: program not valid". Die
Ursache war eine **Doppeldeklaration** — in diesem Shader heißt die
Milchstraßenhelligkeit schon `band`, und ich habe eine zweite Variable desselben
Namens angelegt. Ein Shader hat einen einzigen Namensraum je Funktion, und das
Prüfbild sagt es sofort: statt Himmel die Hintergrundfarbe.

### Der Rückweg — und warum eine Station „leer" aussah, obwohl sie verstellt war

Der Prüfer hat sechs der zwölf Stationen als austauschbar gemeldet und `rund-210`
zusätzlich als „ein einziger Brocken, der zwei Drittel des Bildes füllt, dessen
Dreiecke man abzählen kann". Beides trifft zu, und beides hat dieselbe Ursache:
**den Querabstand der Formationen zur Laufspur**.

Der Rundgang läuft von (0 | 1 | 0) über Azimut 180 zum Gegenpol und über Azimut 0
zurück. Der Abstand einer Formation von dieser Spur ist

    quer = R · asin( sin(bogen / R) · sin(azimut) )

Nachgerechnet für die sechzehn Formationen standen vier davon **unter 3,3 m**
neben der Spur — `{62 | 12}` bei 3,2 m und `{69 | −6}` bei **1,0 m**. Was der
Prüfer als „zu großen Brocken" gelesen hat, war kein Größenproblem, sondern ein
Abstandsproblem: Man läuft hinein.

Umgekehrt lag auf dem Rückweg (Azimut 0, 26 bis 65 m Bogen) gar nichts, und das
ist die dunkle Hälfte — dort trägt nur der Umriss. Vier neue Formationen stehen
jetzt dort, alle mit 10 bis 12 m Querabstand.

**Eine Grenze, die man nicht wegplanen kann:** In der Nähe des Gegenpols (ab etwa
68 m Bogen) ist ein Querabstand über 9,5 m geometrisch unmöglich — dort läuft die
Spur durch alles hindurch, weil alle Großkreise sich dort treffen. Deshalb steht
dort nichts.

Gemessen an den Stationen: 210 hat p95−p05 von 13,1 auf 14,1 und ein offenes
Bild statt eines verstellten; 300 von 19,0 auf 22,0; 180 von 13,3 auf 8,7 (der
Brocken, der dort im Weg stand, ist weg). Die Bilder tragen jetzt Umriss statt
Verdeckung.

### Die Desktop-Ansicht war beim Betreten unbrauchbar

Vom Auftraggeber gemeldet: „Wenn man im Desktop-Modus die Umgebung betritt, dann
ist die Steuerung ganz komisch und nicht intuitiv. Man blickt auch zu Beginn
direkt auf den Boden."

Beides sind Zahlen. Gemessen mit `tools/desktop-pose.mjs` am Stand davor:

| | Blickneigung | Kreisradius | Auge über Boden |
| --- | --- | --- | --- |
| 🏝 Himmelsinsel | −6,3° | 1,81 m | 2,00 m |
| 🌌 **Nachthimmel** | **−85,8°** | **24,42 m** | **0,40 m** |
| 🪷 Zen-Garten | −33,7° | 2,16 m | 2,60 m |

−85,8 Grad ist „direkt auf den Boden". Und der Kreisradius ist der Punkt, um den
die Maus schwenkt: Bei knapp zwei Metern dreht man den Kopf, bei 24,42 m schwenkt
man um den **Planetenmittelpunkt**. Genau das fühlt sich falsch an.

**Die Ursache lag in `main.js` und war seit dem Umbau da.** Am Desktop kreist die
Kamera um `controls.target`; beide standen nach einem Umgebungswechsel noch auf
der Höhe des alten Bodens. Die Kamera wurde vom Sperrblock sofort auf
`_floorY + AUGE_MIN` geklemmt, das Ziel aber nur um `dy` nachgezogen — und `dy`
ist in genau diesem Bild **null**, weil `_floorY` gerade erst gesetzt wurde. Auf
den vier ortsfesten Umgebungen fiel das nie auf: Ihr Boden liegt um null. Der
Planet liegt bei 25,36 m.

Kamera und Ziel werden jetzt um denselben Betrag gehoben — Blickrichtung,
Neigung und Kreisradius bleiben damit erhalten, nur die Höhe stimmt. Dazu darf
eine Umgebung eine Anfangsneigung angeben; der Nachthimmel nimmt −15 Grad, weil
sein Horizont 20 Grad unter Augenhöhe liegt und ein waagerechter Blick zu vier
Fünfteln Himmel zeigt.

Nachher: −14,9 Grad, 1,86 m Kreisradius, 1,60 m Augenhöhe — und dieselben Werte
in allen fünf Umgebungen.

### Und zwei weitere Fehler derselben Familie, die dabei herauskamen

Die Meldung sprach von zwei Dingen — „direkt auf den Boden" **und** „die
Steuerung ist komisch". Das Zweite war nicht mit der Blickrichtung erledigt.

**Man konnte am Desktop gar nicht laufen.** Gemessen: zwei Sekunden
Vorwärtstaste ergaben **0,00 m** Weltdrehung. Die Ursache war der Freiraum von
90 cm um die Polachse. Er ist ein Totband in der **Position**, und ein Totband
in der Position muss bei jeder Richtungsumkehr einmal ganz durchlaufen werden:
1,80 m, in denen der Stick nichts bewirkt. Die Desktop-Kamera startete
ausgerechnet am Rand des Bandes und wanderte beim Vorwärtsgehen nur zum
anderen Rand. 25 cm kosten bei einer Umkehr eine halbe Sekunde und fangen das
Vorbeugen weiterhin ab.

**Und Umsehen war Gehen.** `OrbitControls` schwenkt die Kamera auf einer Kugel
um `controls.target`; bei 1,86 m Kreisradius verschiebt ein Mausziehen sie um
bis zu 3,7 m. Die Sperre liest jede Verschiebung der Kamera als Schritt — 216
Bildpunkte ziehen drehte den Blick um 52,8 Grad **und die Welt um 0,65 m
Bogen**. Man lief beim Umsehen seitwärts.

Der Anteil, den der Orbit verschoben hat, wird jetzt wieder abgezogen, an Kamera
und Ziel gemeinsam. **Der erste Anlauf hat nur die Hälfte erwischt**, weil er
gegen den Moment vor `controls.update()` verglich: `OrbitControls` ruft `update()`
auch selbst, direkt aus seinem `pointermove`-Handler, also zwischen zwei
Bildern. Verglichen wird deshalb gegen das Ende des letzten Bildes. Danach:
Blick 52,8 Grad, Welt **0,000 m**.

Dazu setzt der Eintritt die Kamera waagerecht auf die Polachse. Sonst holt die
Sperre sie im ersten Bild von 1,2 m auf den Freiraum zurück und dreht die Welt
dabei um 0,95 m — ein Ruck beim Betreten, den niemand ausgelöst hat.

**Was ich daraus mitnehme:** Neun Durchläufe lang habe ich nur gerendert, nie
*bedient*. Der Prüfstand setzt die Kamera von außen und schaltet die Sperre
dafür ab — er kann diese Fehler prinzipiell nicht sehen. Ein Bild zu messen und
eine Umgebung zu betreten sind zwei verschiedene Prüfungen, und die zweite hat
gefehlt. Alle drei Fehler lagen im Bedienpfad, keiner im Bild.

### Die fehlenden Sterne

Vom Auftraggeber gemeldet: „Was irritiert sind die fehlenden Sterne."

**Mein erster Verdacht war falsch, und die Messung hat ihn sofort widerlegt.**
Ich hatte kurz zuvor die Punktgröße der Sterne auf mindestens 4,2 Bildpunkte
gesetzt und sie darunter nach Fläche gedimmt — energieerhaltend, aber
verdächtig. Gezählt wurden im Eintrittsbild als Punktquellen (heller als das
7×7-Mittel um sie herum):

| Stand | Sterne im oberen Himmel |
| --- | --- |
| vor der Punktgrößen-Änderung | 191 |
| danach (4,2 px, Boden 0,30) | 198 |
| mit 3,0 px und Boden 0,75 | 247 |

Die Änderung hatte also **keinen** Stern gekostet.

Der wirkliche Grund stand in `makeSternfeld`:

    const y = Math.abs(u) * 0.98 - 0.02;   // nur die obere Halbkugel

Auf der 96-m-Platte war das richtig — was unter Augenhöhe lag, deckten Boden und
Nebel ab. Auf einer Kugel mit 25 m Halbmesser liegt der Horizont **20,0 Grad
unter Augenhöhe**. Zwischen dem Schnitt bei y = 0 und der Geländekante klaffte
damit ein zwanzig Grad breiter Streifen ohne einen einzigen Stern — und das ist
genau der Streifen, in den man auf einem kleinen Planeten am meisten schaut.

Verteilt wird jetzt gleichmäßig über die Kappe von y = −0,36 bis y = 1. Weil `u`
schon gleichverteilt in [−1, 1] liegt und die Fläche einer Kugelzone linear in y
wächst, genügt `y = 0,32 + 0,68 · u` — **ohne** eine zusätzliche Ziehung aus dem
gesäten Strom, also ohne dass sich Brocken, Staub und Wirbel verschieben. Der
Sinus des Polarwinkels muss dabei aus y kommen und nicht mehr aus u; solange
y ungefähr |u| war, fiel der Unterschied nicht auf, jetzt fielen die Sterne sonst
von der Kugel.

Gemessen: Sternpixel in `a-augenhoehe` 1448 → **1995**, in `c-krater` 0 → **569**,
in `f-kante` 1296 → **1670**. Sterne vor dem Gelände: weiterhin **0** über alle
sechs Kameras — die Sterne unter dem Horizont werden ordentlich verdeckt.

**Dieselbe Lehre zum dritten Mal an einem Tag:** Was auf einer Ebene richtig war,
ist auf einer Kugel nicht falsch, sondern bedeutungslos. Erst der Nebel, dann der
Himmelshorizont, jetzt die Sternverteilung — jedes Mal eine Annahme über „unter
Augenhöhe sieht man nichts", die auf einem Planeten mit 8,9 m Horizont nicht mehr
gilt.

### Neue Werkzeuge

* `tools/strahl.mjs` — **was steht in diesem Pixel.** Die Lehre aus Paket 7 als
  Werkzeug. Hat in diesem Durchlauf dreimal in einer Minute geklärt, was Raten
  nicht geklärt hätte. Wichtig: three prüft `visible` beim Raycasting **nicht**,
  und die abgeschalteten Umgebungen sind nur an ihrer Wurzelgruppe unsichtbar —
  ohne die Kette nach oben meldet das Werkzeug die Wolkenschalen der Insel als
  Treffer im Nachthimmel.
* `tools/planetort.mjs` — **wo liegt der Boden.** Auf der Platte konnte man eine
  Prüfkamera hinschreiben; auf der Kugel sind „am Kraterrand" und „im Krater"
  zwei Meter, die man nicht raten kann.
* `tools/rundgang.mjs` und `tools/karten-planet.mjs` — siehe oben.

### Eine Silhouette für `f-kante`, in zwei Anläufen

Im Blick vom Mond weg stand keine einzige Form gegen den Sternhimmel — das
Kriterium, mit dem der Prüfer seinerzeit seinen ersten Bericht eröffnet hat. In
dieser Richtung lag die nächste Formation bei 36 m Bogen.

Der erste Anlauf setzte eine auf 19 m und rechnete die Sichtweite aus der Kugel
allein: 8,9 + sqrt(2 · 25 · 5,2) = 25 m, also bequem sichtbar. **Im Bild war sie
weiterhin nicht da.** Nachgemessen an der Geometrie steht ihre Spitze bei 20,8 m
Bogen und 30,0 m Radius, das sind 16,9° unter Augenhöhe; der nächstgelegene
Geländerücken verdeckt in dieser Richtung alles unter 16,5°. Sie fehlte um vier
Zehntelgrad.

**Die Formel vergisst das Gelände.** Sie gilt für eine glatte Kugel, und das
Höhenfeld schwankt um ±2 m — auf 6 m Abstand sind das mehrere Grad. Bei 15 m
Bogen steht dieselbe Spitze auf 6,8° und damit klar über dem Rücken; im Bild
steht sie jetzt als dunkler Umriss vor der Milchstraße.

### Was das Auge diesmal falsch gesehen hat

Zum sechsten Mal in diesem Auftrag: In `b-mond` meinte ich, einen **rechteckigen
Rand** um den Mondhof zu sehen — die Kante der Sprite-Kachel, ein klassischer
Fehler. Nachgemessen ist da nichts: In der Zeile y = 300 fällt der Wert von 35
auf 6 über 360 Pixel, in der Spalte x = 520 ebenso gleichmäßig; keine Stufe,
keine Kante. Was ich für einen Rand gehalten habe, war die weiche Flanke des
Milchstraßenbandes, das dort schräg vorbeiläuft.

Die Nachtseite ist ebenfalls gemessen statt beurteilt worden: Bei Station 240°
(Mond 63,9° unter dem Horizont) steht ein Bildmittel von 14,5 und eine Spanne
p05–p95 von 14,6. Das Bild zeigt einen dunklen Hügel gegen ein dichtes
Sternfeld, das Luftglühen am Horizont und die Windrippel noch gerade eben — eine
Nacht, kein schwarzes Bild.

### Vier Sorten Stein, in zwei Anläufen

Befund 12 des Prüfers, wörtlich: *„Materialtrennung: zwei Sorten, nicht vier.
Nachweisbar getrennt sind Staub (112,67,51 — gesättigt orange) und Fels
(137,108,100 bzw. 153,102,86 — entsättigt rosagrau). Das ist echt und es hilft.
**Frischer Bruch und Frost sind nirgends zu finden.** Kein einziger heller
Splitterrand, keine kalte Kruste an einer Nordflanke, keine Stelle, an der ein
Stein aufgebrochen aussieht."*

Er hatte recht, und beide Ursachen stehen in einer Zeile Rechnung.

**Frost saß dort, wo niemand hinsieht.** Der Faktor war `abgewandt · unten` mit
`unten = max(0, −n·oben)`. Für jede senkrechte Fläche ist `unten` null. Frost
lag damit ausschließlich auf den nach unten zeigenden Flächen — auf der
Unterseite eines Brockens, der im Sand steckt.

**Frischer Bruch war rechnerisch da und optisch nicht.** Der Faktor lief über
`steil²` mit `steil = 1 − |n·oben| = 1 − cos θ`, wobei θ die Neigung der Fläche
gegen die Waagerechte ist. Eine 60-Grad-Fläche kommt damit auf 0,5, quadriert
0,25, mal 0,55 macht 0,14, und bei einem mittelalten Brocken noch einmal
halbiert. Übrig blieben sieben Prozent Beimischung einer Farbe (`0xa08573`), die
vom Grundton kaum abwich.

#### Der erste Anlauf war messbar besser und im Bild falsch

Ich habe zuerst nur die Zahlen hochgezogen: `steil · 0,8` statt `steil² · 0,55`,
`bruchFarbe` von `0xa08573` auf `0xb2a49b` aufgehellt, und beim Frost einen
Grundanteil von 0,4 auch für senkrechte Flächen. Die Bildmessung
(`tools/materialien.mjs`, neu) sagte klar „besser": Der Anteil entsättigter
Felspixel in `a-augenhoehe` stieg von 1,73 % auf 4,73 %, in `d-orbit` von
1,27 % auf 9,76 %.

**In `d-orbit` standen daraufhin alle sechzehn Landmarken knochenhell da.** Ein
Stein, der ringsum frisch gebrochen ist, ist kein gebrochener Stein — er ist ein
anders angemalter. Die Messung hatte recht und das Bild auch; gemessen wurde nur
die falsche Größe. „Wie viel Fels sieht man" ist nicht dieselbe Frage wie „liest
ein Bruch als Bruch".

#### Der zweite Anlauf: eine Richtung statt eines Betrags

Ein echter Bruch sitzt auf **einer** Fläche. Jeder Brocken bekommt deshalb eine
`bruchachse` — die Richtung, in die seine Bruchfläche zeigt, annähernd
waagerecht (nach oben liegt Staub, nach unten sieht keiner hin). Der Anteil
läuft über `cos⁵` zu dieser Achse: 30° daneben noch 0,66, 60° daneben 0,03.
Alles andere Steile behält einen schwachen Grundanteil von 0,16, denn dort hält
bloß kein Staub.

Die Achse kommt aus `hashNoise`, **nicht** aus `rand()`. Der gesäte Strom legt
die Lage aller folgenden Brocken fest; ein zusätzlicher Zug hätte die ganze
Landschaft verschoben. Dieselbe Vorkehrung stand schon über den übrigen
Bruchparametern und hat sich zum zweiten Mal ausgezahlt.

Beim Frost bekam die Kruste eine **Kante**: `smoothstep(0.25, 0.85, abgewandt)`
statt eines linearen Verlaufs, dazu die Stärke von 0,24 auf höchstens 0,65
angehoben. Ein weicher Verlauf über die ganze Flanke liest als bläuliche Tönung
des Steins; eine Kruste fängt irgendwo an.

#### Gemessen

`tools/steinfarben.mjs` (neu) liest die Scheitelfarben der zusammengefassten
Steinnetze direkt aus, statt Pixel zu zählen — die Bildmessung hängt an
Beleuchtung und Schatten, und ein Frostfleck auf der mondabgewandten Flanke ist
im Bild dunkel, obwohl er in den Daten steht. Über 137 700 Scheitel:

| | vorher | erster Anlauf | jetzt |
| --- | --- | --- | --- |
| Scheitel, deren Ton dem Bruch am nächsten liegt | 7,14 % | 19,88 % | **30,10 %** |
| Scheitel, deren Ton dem Frost am nächsten liegt | 0,00 % | 0,00 % | **2,09 %** |

(Die Spalte „vorher" ist nachträglich gemessen: `src/environments.js` einmal auf
den letzten Stand zurückgesetzt, Werkzeug laufen lassen, Stand wiederhergestellt.
Eine Vorher-Zahl, die man nicht mehr messen kann, gehört nicht in eine Tabelle.)

Und im Bild, an dem einen Brocken links in `a-augenhoehe`, der kühlste Punkt:

| | planet-06 | planet-07 |
| --- | --- | --- |
| RGB der Flanke | (21, 26, 25) | **(53, 60, 76)** |
| Blau minus Rot | +4 | **+23** |

+4 war der Rauschboden des Himmels dahinter; auf dem Stein selbst gab es vorher
keinen einzigen Punkt mit mehr Blau als Rot. Der Ausschnitt zeigt jetzt einen
warmen, verstaubten Deckel und darunter eine kalt blaugraue Kruste mit einer
lesbaren Oberkante.

Der Anteil entsättigter Felspixel liegt nach der Richtungsbindung wieder
niedriger als im ersten Anlauf — das ist beabsichtigt: `d-orbit` 1,27 % → 4,08 %
statt → 9,76 %, `a-augenhoehe` 1,73 % → 2,30 % statt → 4,73 %. Dazu kommen jetzt
0,61 % bzw. 0,15 % kühle Pixel, die es vorher praktisch nicht gab (0,00 % /
0,04 %).

#### Budget und Regression

Die Änderung fasst ausschließlich Scheitelfarben an: keine Geometrie, kein
Draw-Call, keine Textur. Gemessen bestätigt: Draw-Calls 13–18 (Budget 120),
Dreiecke 310 266–313 154 (Budget 350 000) — dieselben Werte wie in planet-06.
Der Texturspeicher (6,33 von 60 MB) ist nicht neu gemessen: Es ist keine Textur
dazugekommen und keine weggefallen.

Regression der vier übrigen Umgebungen gegen planet-06: Zen bitgleich (Δmax 0),
Konstrukt Δmax 1, Dojo Δmax 6 bei 0,010 % der Pixel ≥ 2, Insel Δmittel 0,019 bei
0,381 % ≥ 2 — im bekannten Rauschband der Insel. Konsole frei von Errors und
Warnings.

`tools/karten-planet.mjs` (13 Prüfungen) und `tools/shaderlint.mjs` laufen
durch; `tools/gehbereich.mjs` meldet „Alles im Rahmen" — Sperre auf 25 cm, ein
34-cm-Schritt dreht die Welt um 34,00 cm Bogen, Standhöhe am Nordpol 25,342 m.

**Und noch ein Fehlurteil von mir dazwischen:** Ich hatte `gehbereich.mjs`
zweimal abgebrochen, weil es „hängt", und einmal einen `ReferenceError` auf eine
Konstante gesehen, die im Code nachweislich übergeben wird. Beides war weder
Werkzeug- noch Codefehler: Der Lauf ist in diesem Container nur **langsam** — die
Schrittsimulation wartet je Schritt auf ein Bild, und ein Dojo-Bild braucht auf
SwiftShader unter Last Sekunden. Ungestört und ohne Nebenläufer kommt er sauber
durch. **Ein Werkzeug, das man selbst umbringt, hat nicht versagt.**

#### Zwei Fehler am Rande, beide meine

**Ich habe `prettier --write` auf `src/environments.js` losgelassen.** Das Projekt
hat kein Format-Skript und die Datei ist nicht danach formatiert; der Diff stand
danach bei 2566 geänderten Zeilen für eine Änderung, die 105 braucht. Rückgängig
gemacht über `git checkout HEAD -- src/environments.js` und die fünf inhaltlichen
Hunks neu gesetzt. **Ein Werkzeug, das die ganze Datei anfasst, gehört nicht in
einen Lauf, der drei Zeilen ändert** — der Diff ist das, woran später jemand
liest, was passiert ist.

**Ich habe `tools/inspect.mjs` einen Fehler angehängt, den es nicht hatte.**
Zwei Läufe brachen am Ende mit „Execution context was destroyed, most likely
because of a navigation" ab. Ich habe daraus eine These über SwiftShader und
`gl.finish()` gebaut, in den Code geschrieben und ins Protokoll — und dann fiel
der dritte Lauf an einer ganz anderen Zeile um, worauf die eigentliche Ursache
offensichtlich war: **Ich hatte `src/environments.js` bearbeitet, während der
Lauf lief.** Vite lädt die Seite dann neu, und jedes `page.evaluate` danach
findet keinen Kontext mehr. Ein Lauf ohne Eingriff kommt sauber durch, samt
Software-Boden (0,23 ms/Frame in ⬜ Konstrukt).

Die Lehre ist nicht neu, aber diesmal teuer: **Eine Erklärung, die zum Symptom
passt, ist noch keine Ursache.** Der `try`-Block bleibt — er kostet nichts —,
aber sein Kommentar sagt jetzt, was wirklich passiert ist.

### Der Planet bekommt eine Gestalt — und der Prüfstand einen Fehler weniger

Zwei Befunde des Prüfers standen noch offen, und sie haben dieselbe Ursache:

> **7 (zweite Hälfte)** — „Die Kugel hat Textur, aber keine Topographie. Aus dem
> Orbit ist der Umriss ein makelloser Kreis — kein Kraterrand bricht ihn."
> **10** — „Nur zwei Tiefenebenen. Was nah ist, ist nah; was fern ist, steht an
> der Kante. Dazwischen ist nichts."

#### Erst messen, dann bauen

„Makelloser Kreis" ist ein Eindruck; ich wollte eine Zahl. Am Bild ist sie
schwer zu holen — der Terminator trennt die Nachtseite mit demselben Kontrast
wie die Kante gegen den Himmel, und ein Schwellwert kann beides nicht
auseinanderhalten. Mein erster Anlauf (`tools/silhouette.mjs`) hat genau das
getan und **14 % Rauheit** gemeldet, wo das Auge einen glatten Kreis sieht: Er
hat den Terminator als Silhouette gezählt. Ein Werkzeug, dessen Ergebnis dem
Augenschein widerspricht, hat erst einmal selbst unrecht.

`tools/gestalt.mjs` misst deshalb an der Geometrie. Für jeden Bildazimut wird
über den zugehörigen Großkreis der **größte Sehwinkel** gesucht — die wahre
perspektivische Silhouette, nicht die Näherung „R + h am Äquator". Und die
Antwort war eindeutig:

| | vorher |
| --- | --- |
| Rauheit des Umrisses | 4,32 px auf 296 px Halbmesser (**1,46 %**) |
| Spanne | 26,2 px |
| Höhenfeld | −1,80 bis +3,91 m, Streuung 0,81 m |

Und die Ursache stand in `craterProfile`: Der Wall ist `0,32 · wall · (1−alter) ·
depth`. Über alle vierzehn Krater durchgerechnet ist der **höchste Wall des
ganzen Planeten 34 cm** — im Orbitbild vier Bildpunkte. Genau die gemessene
Rauheit. Der Prüfer hatte nicht nur recht, er hatte auf den Pixel recht.

**Die Krater waren nicht falsch bemessen, sie waren zu klein für ihren Körper.**
Ein Wall ist rund vier Prozent des Durchmessers hoch; bei 6 m Durchmesser sind
das 24 cm, und daran ändert kein Parameter etwas. Was eine Silhouette bricht,
ist ein Einschlag, dessen Durchmesser ein nennenswerter Teil des Körpers ist —
auf Phobos ist Stickney knapp die Hälfte.

#### Zwei große Einschläge und drei Grate

Dazugekommen sind zwei Krater von 19 und 14 m Durchmesser (bei 50 m
Körperdurchmesser) mit Tiefen nach der üblichen Fünftelregel, und ein neues
Primitiv: der **Grat**.

Ein Grat ist die einfachste Form, die beide Befunde zugleich beantwortet. Krater
sind rund, Hügel sind rund; runde Formen von 10 m Halbmesser sind auf einem
Körper von 25 m so weich, dass sie weder eine Kante noch eine Verdeckung
ergeben. Ein Grat ist lang, schmal und hoch: Er verdeckt die Ferne — das ist die
fehlende mittlere Ebene — und gibt der Kante einen Knick.

Auf einer Kugel ist seine Achse ein **Großkreisbogen**, die gerade Linie der
Kugel. `bogenAbstandZuGrat` gibt den Abstand entlang der Oberfläche: innerhalb
des Bogens der Abstand zur Trägerebene, außerhalb der zum näheren Endpunkt — so
bekommt der Grat runde Enden statt abgeschnittener.

Der erste liegt bewusst im Blick der Eingangskamera. Sichtbarkeit auf einer
Kugel ist `sqrt(2·R·h_auge) + sqrt(2·R·h)`; bei 3,2 m Kammhöhe sind das
8,9 + 12,6 = 21,5 m, und bei 16 m Bogen steht der Kamm klar über der
Krümmungskante — hinter dem Krater bei 12,1 m. In `a-augenhoehe` stehen jetzt
drei Ebenen: Steine im Vordergrund, die beleuchtete Gratflanke dahinter, dann
Formation und Sternhimmel.

#### Und dann meldete der Prüfstand, der Rundgang schließe nicht

Der erste Lauf nach dem Umbau:

```
  Restwinkel nach der Runde 179.3908° = 7827.40 cm
  ❌ der Rundgang schließt nicht
  b) Nachführung: p50 35.88 cm, p95 122.70 cm, max 233.26 cm (Steigung dort 11.05)
```

Eine Steigung von 11,05 ist eine Wand von 85 Grad. Mein Grat kann höchstens 1,4;
`tools/gestalt.mjs` hatte über die ganze Kugel 1,82 gemessen. **Wenn zwei
Werkzeuge sich um den Faktor sechs widersprechen, hat eines von beiden unrecht,
und es ist selten die Geometrie.**

Der Fehler saß in `tools/rundgang.mjs`, Zeile 166:

```js
walk.limit(0, 0.9 + schritt, ziel);
```

Die 0,9 war der Freiraum von `makePlanetWalk` — **damals**. Zwei Commits vorher
habe ich ihn auf 0,25 m gesetzt, weil ein Totband von 90 cm bei jeder
Richtungsumkehr zweimal durchlaufen werden muss und das Gehen am Desktop
lahmlegte. Der Prüfstand hat seine 0,9 behalten. Damit trieb der Kopf je Schritt
nicht um 3,3 cm über den Freiraum hinaus, sondern um 68 cm — **das
Zwanzigfache**. Die Welt drehte sich zwanzigmal zu weit, der „Rundgang" lief in
Wahrheit zwanzig Runden und blieb bei einer halben stehen; und die
Bodenkontaktzahlen maßen die Höhenänderung über 68 cm, geteilt durch 3,3 cm.

Nach der Korrektur — `walk.freiraum` kommt jetzt aus der App, und
`tools/gehbereich.mjs` bricht ab, wenn sein eigener Wert davon abweicht:

| | vor dem Umbau (planet-06) | mit Grat und Großkratern |
| --- | --- | --- |
| Restwinkel der Runde | 1,30 cm | **1,30 cm** |
| Geländehöhe Start / Ende | — | 0,3423 m / 0,3417 m |
| `walk.floorAt` gegen Gelände | 0,000 mm | **0,000 mm** |
| Nachführung p50 / p95 / max | 2,55 / 12,18 / 37,92 cm | 2,81 / 17,56 / **38,71** cm |

Der Nachlauf ist die app-weite Glättung `dt · 7`, nicht der Planet; das Maximum
steht praktisch da, wo es stand. Das p95 ist um 44 % gestiegen, weil es jetzt
mehr Hänge gibt, die diese Glättung überhaupt sichtbar machen.

**Die Lehre steht in beiden Dateien als Kommentar:** Eine Zahl, die zwei Seiten
kennen müssen, darf nur an einer Stelle stehen. Ich hatte sie an dreien —
`walkable.js`, `rundgang.mjs`, `gehbereich.mjs` — und beim Ändern zwei
übersehen. `gehbereich.mjs` ist mir dabei nur deshalb nicht auch aufgelaufen,
weil dort zufällig derselbe neue Wert stand.

#### Ein Werkzeug, das ich beim Bauen zerstört habe

Mein erstes Messwerkzeug hieß `tools/silhouette.mjs` — und den Namen gab es
schon. Der bestehende `silhouette.mjs` zählt **helle Punkte innerhalb einer
dunklen Geländesilhouette**, also Sterne, die vor dem Boden stehen; er hat in
Paket 2 einen echten Fehler gefunden und trägt in seinem Kopf die Herleitung
seiner Schwellen. Ein `cat >` hat ihn wortlos ersetzt.

Aufgefallen ist es erst beim Blick auf `git diff --stat`: 166 geänderte Zeilen
in einer Datei, die ich für neu hielt. Wiederhergestellt aus HEAD; das neue
Werkzeug heißt jetzt `tools/gestalt.mjs`. **`git status` vor dem Anlegen einer
Datei ist billiger als die Wiederherstellung danach** — und ohne Versionsstand
wäre die Datei weg gewesen.

#### Was der Umbau kostet und was er nicht kostet

| | planet-07 | planet-08 |
| --- | --- | --- |
| Rauheit des Umrisses | 4,32 px (1,46 %) | **6,94 px (2,31 %)** |
| Spanne des Umrisses | 26,2 px | **47,5 px** |
| Höhenfeld | −1,80 … +3,91 m | **−3,73 … +6,32 m** |
| Streuung des Höhenfelds | 0,81 m (3,25 % von R) | **1,15 m (4,62 %)** |
| größte Neigung über 41 cm | 1,20 | 1,82 |

Zum Vergleich, aus demselben Lauf von `tools/gehbereich.mjs`: Der größte
Bodensprung je Bild beträgt auf der **Himmelsinsel** 0,493 m, auf dem Planeten
0,387 m. Das Gelände ist trotz der Grate weiterhin sanfter als das der Insel,
und die Steigung von 1,82 ist eine einzelne Stelle irgendwo auf der Kugel, nicht
der Weg, den man geht (dort sind es höchstens 1,49).

#### Der vollständige Prüflauf

| Prüfung | Ergebnis |
| --- | --- |
| `npm run build` | grün |
| Konsole | frei von Errors und Warnings |
| Rundgang schließt | **1,30 cm** auf 157,07 m; Gelände 0,3423 m → 0,3417 m |
| `walk.floorAt` gegen Gelände | **0,000 mm** |
| Nachführung (app-weite Glättung) | p50 2,81 cm, p95 17,56 cm, max 38,71 cm |
| Karten und Zonen am Planeten | 13 von 13 |
| `tools/gehbereich.mjs` | „Alles im Rahmen" — auch die neue Freiraum-Gegenprobe |
| `tools/shaderlint.mjs` | sauber |
| Draw-Calls | 13–18 / 120 |
| Dreiecke | 310 266–313 154 / 350 000 |
| Texturspeicher | 6,33 / 60 MB |
| Regression Zen | bitgleich (Δmax 0) |
| Regression Konstrukt | Δmax 1 |
| Regression Dojo | Δmax 5 bei 0,008 % der Pixel ≥ 2 |
| Regression Insel | Δmittel 0,023 bei 0,483 % ≥ 2 (Rauschband) |

Weder Draw-Calls noch Dreiecke noch Texturspeicher haben sich bewegt: Grate und
Großkrater sind Änderungen **am Höhenfeld** derselben Ikosphäre, kein einziges
neues Objekt und keine einzige neue Karte.

#### Was damit offen bleibt

* Die **Gratnaht** aus dem Prüferbericht ist weiterhin halbiert (296 → 165
  Pixel), nicht beseitigt.
* Ob 5,5°/s Weltdrehung in der Brille bequem sind, kann dieser Container nicht
  beantworten.
* Der Nachlauf der Bodenglättung (p95 17,6 cm) ist eine **app-weite**
  Entscheidung — `dt · 7` gilt in allen fünf Umgebungen. Zum Vergleich aus
  demselben Lauf: Der größte Bodensprung je Bild liegt auf der Himmelsinsel bei
  0,493 m, auf dem Planeten bei 0,387 m. Ich habe diese Konstante nicht
  angefasst; das wäre eine Änderung an allen Umgebungen zugleich.

### „Alle Werkzeuge sind broke. Wahrscheinlich verschwinden sie irgendwo im Gestein"

So hat der Nutzer es gemeldet, und er hatte auf den Meter recht.

An fünf Stellen im Programm stellt sich etwas vor den Nutzer — das Whiteboard,
der Zeitgeber, eine neue Zone, die Kartenreihe und das Flussdiagramm. Alle fünf
hatten dieselbe Zeile:

```js
pos.y = THREE.MathUtils.clamp(camPos.y + versatz, 0.6…1.0, 2.0…2.2);
```

Die Grenzen sind **absolute Welthöhen**. Sie setzen stillschweigend voraus, dass
der Boden bei y = 0 liegt — auf den vier flachen Umgebungen stimmt das. Auf
einer Kugel von 25 m Halbmesser steht der Nutzer bei y ≈ 26,97; die obere Grenze
schlägt an, und die Tafel landet bei y = 2,0.

`tools/panelhoehe.mjs` (neu) misst die Höhe **über dem Boden unter dem Nutzer**
statt über y = 0, weil nur die erste Zahl etwas darüber sagt, ob man die Tafel
sieht:

| | vorher | nachher |
| --- | --- | --- |
| Whiteboard auf dem Planeten | **−23,37 m** | +1,50 m |
| Zeitgeber | **−23,17 m** | +1,75 m |
| Zone | — | +1,60 m |
| Kartenreihe | — | +1,55 m |
| Flussdiagramm | — | +1,58 m |

Auf den vier flachen Umgebungen ändert sich **keine einzige Stelle hinter dem
Komma**: Dort ist die Bodenhöhe null, und `boden + clamp(camY − boden + v, u, o)`
ist dann Zeichen für Zeichen die alte Rechnung. Auf der Insel (Boden −0,40 m)
stand das Whiteboard vorher wie nachher bei y = 1,10.

**Ein zweiter Fehler an derselben Stelle.** `layoutFlow` hängte die Knoten mit
`scene.attach(node.group)` um. Auf dem Planeten hängen Karten an der Weltgruppe;
wer sie in die Szene umhängt, löst sie vom Planeten, und beim nächsten Schritt
läuft die Welt unter ihnen weg. Der Kommentar über der Zeile warnte ausdrücklich
davor, an den falschen Elternteil zu hängen — er kannte nur die Heimat noch
nicht, die es damals nicht gab. Jetzt geht es an `cardManager.heimat`, und die
Prüfung fragt das eigens nach.

**Warum es die bestehenden Prüfungen nicht gefunden haben.**
`tools/karten-planet.mjs` legt Karten und Zonen über `addCard`/`addZone` an und
setzt die Pose selbst — es prüft das Speicherformat und die Heimat, nie den Weg
über `placeInFront`. Die Höhe einer Tafel hat schlicht nie jemand gemessen.

**Die Lehre:** Eine Konstante mit einer Einheit ist eine Aussage über einen
Bezugspunkt. „0,9 bis 2,0 Meter" ist ohne die Angabe *wovon* keine Höhe, sondern
eine Zahl. Auf der Platte fielen Weltnull und Boden zusammen, und deshalb konnte
der Unterschied zwanzig Umgebungswechsel lang unbemerkt bleiben.

### Der schwerste Befund war eine Konstante — und der drittschwerste gab es nicht

Der Prüfer hat seinen Bericht mit einem Satz geschlossen: *„Man steht auf einem
Mond und schaut auf einen ausgeschnittenen Karton."* Sein Befund 1: Jede
mondabgewandte Geländemasse ist **eine einzige flache Farbe**, RGB(28,13,9), und
zwar dasselbe Zahlentripel in vier verschiedenen Bildern auf vier verschiedenen
Graten. In `rund-270` waren das 3,93 % aller Bildpunkte in einer
zusammenhängenden Fläche von 36 158 px.

RGB(28,13,9) ist `0x1c0d09`. Das ist die Nebelfarbe.

**Linearer Nebel sättigt bei `far` vollständig.** `far` stand auf 13 m — für
eine Welt gerechnet, deren fernster Punkt der Horizont bei 8,9 m ist. Das war
richtig, solange nichts darüber hinausragte. Seit dem letzten Durchlauf ragt
etwas darüber hinaus: die Grate und die zwei großen Einschläge, die genau dafür
gebaut wurden, den Mittelgrund zu tragen. Sie standen bei 16 bis 24 m und wurden
restlos zu Nebelfarbe. **Ich habe den Mittelgrund gebaut und im selben Zug
zugedeckt.**

Der Prüfer hat die Ursache nicht gekannt und die Wirkung trotzdem exakt benannt.
Sein Satz „das größte Objekt im Bild ist kein Objekt, es hat einen Umriss und
sonst nichts" ist die genaue Beschreibung eines gesättigten Nebels.

#### Gemessen, nicht geraten

`tools/nebelversuch.mjs` (neu) rendert vier Einstellungen an denselben vier
Kameras; `tools/nebelanteil.mjs` (neu) zählt, wie viele Bildpunkte exakt die
Nebelfarbe tragen und wie groß die größte zusammenhängende solche Fläche ist.

| Nebel | reine Nebelfarbe (vier Kameras) |
| --- | --- |
| 5 → 13 m (vorher) | 0,75 bis 1,56 % |
| 5 → 24 m | 0,00 bis 0,24 % |
| **6 → 34 m (jetzt)** | **überall 0,00 %** |
| ganz aus | 0,00 % |

Über die zwölf Rundgangsstationen fällt die größte zusammenhängende Fläche reiner
Nebelfarbe von **36 158 px auf 0**.

Das ist wenig Nebel — und das ist richtig so. **Ein luftloser Körper hat keine
Luftperspektive.** Was übrig bleibt, ist ein kompositorischer Anstoß, keine
Physik; die Tiefe trägt hier die Krümmung. In `rund-270` stehen jetzt zwei
bereifte Blöcke vor einem modellierten Rücken, wo vorher eine Fläche war; in
`f-kante` ist aus dem schwarzen Ausschnitt ein Fels mit Facetten geworden.

### Die Sterne vor dem Boden, die es nicht gab

Befund 3 des Prüfers: 104 helle Punkte unterhalb der Geländekante in `rund-210`,
dazu welche in 240, 270, 300 — „der eine Fehler in dieser Liste, den auch ein
völlig unaufmerksamer Betrachter bemerkt".

**Er hat sich geirrt, und zwar aus demselben Grund, aus dem er Befund 1 gefunden
hat.** Im alten Bild war das Gelände jenseits von 13 m reine Nebelfarbe, L 15,6 —
nicht unterscheidbar vom dunklen Himmel am Horizont. Wer die Geländekante über
die Helligkeit sucht, findet dort, wo das beleuchtete Nahfeld aufhört, eine
Kante — und die liegt weit **über** dem wirklichen Horizont. Alles dazwischen ist
Himmel.

Nachgemessen an seiner eigenen Koordinate. `tools/sterne-hinter.mjs` rät nicht,
sondern schaltet das Sternfeld ab, setzt den Hintergrund auf Magenta und liest
die Geländemaske aus der Szene:

| | Prüfer | gemessen |
| --- | --- | --- |
| Geländekante in Spalte 386 | y = 418 | **y = 479** |
| (386, 458) | „Stern 40 px im Boden" | **Himmel, kein Gelände** |
| (840, 433) | Stern im Boden | Himmel |
| (239, 511) | Stern im Boden | Himmel |
| Sterne vor dem Gelände, zwölf Stationen | 104 + | **0** |

Das ist kein Punkt gegen ihn: **Mein eigenes Werkzeug hatte genau denselben
Fehler**, und er hat ihn gefunden, nicht ich. `tools/silhouette.mjs` sucht die
Kante als „oberste Zeile, ab der 35 Zeilen heller als L 7 sind" und setzt laut
eigenem Kommentar voraus, dass der Himmel bei L 2 bis 4 liegt. Er liegt bei L 9
bis 16. Sein Satz dazu: *„Wer diesem Werkzeug eine 0 entnommen hat, hat nichts
gemessen."* Das war ich.

#### Zwei Reparaturen am Prüfstand

* **`tools/silhouette.mjs` prüft jetzt seine eigene Voraussetzung** und
  verweigert die Auskunft, statt eine falsche zu geben: Es misst den Median der
  obersten 26 Zeilen und bricht mit Rückgabewert 2 ab, wenn der über 7 liegt.
  Eine bessere Schwelle wäre die falsche Antwort gewesen — jede Schwelle über
  der Helligkeit bricht beim nächsten Mal wieder.
* **`tools/sterne-hinter.mjs --rundgang`** prüft jetzt auch die zwölf Stationen.
  Dass es sie nicht kannte, war die eigentliche Lücke: Der Fehler wurde an
  Stationen behauptet, die die Messung nie gesehen hat. Vier von zwölf, und die
  Antwort lautete null, weil sie woanders hinsah.

**Die Lehre:** Ein Werkzeug, dessen Annahme über die Szene irgendwann einmal
stimmte, ist kein Messgerät mehr, sondern ein Gerücht mit Nachkommastellen. Beide
Fassungen von `silhouette.mjs` sind an derselben Annahme gescheitert, und beide
Male stand die Annahme im Kommentar darüber.

### Der leuchtende Saum war drei Durchläufe lang falsch zugeordnet

Der Saum steht seit Durchlauf 12 im Protokoll: ein bis drei Bildpunkte über der
Geländekante ein neutralgrauer Faden, drei- bis vierfach heller als Himmel und
Boden, die er trennt. Der Prüfer hat ihn erneut gefunden und diesmal genau
lokalisiert: `e-boden`, x 1025 bis 1187, ein Pixel breit, rund 160 Bildpunkte
Lauflänge.

Das Protokoll führte ihn als **Lichtleck der Schattenkarte**, mit einer
gemessenen Wanne über `normalBias` (0,025 → 165 Saumpixel). Das war falsch, und
zwei Messungen zeigen es.

**Erstens: er reagiert nicht auf die Schattenkarte.** `tools/naht.mjs` (neu)
fährt ein Feld aus dreizehn Paarungen von `bias` und `normalBias` ab und zählt
zwei Dinge — den Saum über der Geländekante und die Schattenakne im Gelände:

| bias | −0,0004 | −0,0015 | −0,004 | −0,01 | −0,02 |
| --- | --- | --- | --- | --- | --- |
| Saum | 43 | 43 | 42 | 42 | 42 |
| Akne | 352 | 326 | 267 | 209 | 204 |

Die Akne fällt um 42 %, der Saum um ein einziges Pixel. **Die Schattenkarte
reagiert, der Saum nicht.**

**Zweitens: ein Strahl sagt, was da steht.** `tools/strahl.mjs` durch (1140, 223)
trifft `kontaktverdunklung` in 4,40 m — und `nacht-planet` überhaupt nicht.
Dasselbe bei (1140, 225), (1100, 218), (1160, 226). Ausgeblendet fallen die
Saumpixel über sechs Kameras von 46 auf 5.

Es ist keine Naht im Boden. Es sind die **Kontaktscheiben**, die 2 cm über dem
Gelände liegen und über einen Grat hinweg um genau diesen Betrag über die
Silhouette ragen. Sie sind `toneMapped: false` und können aufhellen (die
Staubfahnen tun das) — vor dem schwarzen Himmel liest das als heller Faden.

**Warum die alte Zuordnung trotzdem plausibel war:** Sie stützte sich auf
Station 300, nicht auf `e-boden`, und dort steht ausdrücklich, dass ein
Ausblenden von `kontaktverdunklung` nichts geändert hat. Entweder waren es zwei
verschiedene Artefakte, oder die damalige Zählung hat Sterne mitgezählt — mein
erster Anlauf mit dem neuen Werkzeug tat genau das und meldete 750 bis 1000
„Saumpixel" über sechs Kameras, von denen die große Mehrheit am Himmel stand.
Ein Stern **ist** ein heller Punkt zwischen dunklen Nachbarn. Der Zähler bekam
daraufhin dieselbe schwellenfreie Geländemaske wie `tools/sterne-hinter.mjs`.

#### Zwei Anläufe, die scheiterten, und warum

**`polygonOffset` statt Anhebung.** Der Gedanke: Der Abstand zum Boden gehört in
die Tiefe, nicht in den Raum; ein Tiefenversatz kann eine Scheibe niemals über
eine Silhouette heben. Der Saum fiel auf 2 Pixel — und die Verdunklung zerfiel
in harte Polygonflecken. **Ein Tiefenversatz heilt keine Durchdringung.**

**Ein kleinerer fester Hub.** Gemessen über die sechs Kameras:

| Hub | 20 mm | 12 mm | 8 mm | 5 mm | 3 mm |
| --- | --- | --- | --- | --- | --- |
| Saumpixel | 46 | 14 | 7 | 4 | 2 |

Der Saum **ist** der Hub, linear. Aber bei 5 mm zerfiel die Verdunklung wieder —
und mein Kantenzähler hat das nicht gesehen (20 541 gegen 20 566, flach über die
ganze Reihe), weil er von den Felssilhouetten dominiert wird. **Aufgefallen ist
es nur, weil ich den Ausschnitt angesehen habe.** Ein Maß, das den Fehler nicht
findet, den man sucht, ist kein Beleg für seine Abwesenheit.

#### Was schließlich trägt: der Hub folgt der Krümmung

`tools/naht.mjs --abstand` misst, wie weit das Höhenfeld vom gerenderten Netz
abweicht — 6000 radiale Strahlen gegen `nacht-planet`:

| | kleinster | Median | p95 | größter |
| --- | --- | --- | --- | --- |
| Feld minus Netz | −273 mm | +0,97 mm | +12,4 mm | +165 mm |

Und darin steht die Lösung. Das Netz liegt genau dort **über** dem Feld, wo das
Feld konkav ist — in Mulden. Auf einem Kamm, also genau dort, wo der Saum
entsteht, schneidet die Sehne unter das Feld, und die Scheibe liegt ohnehin
schon darüber. **Die beiden Forderungen betreffen verschiedene Orte.**

Der Hub kommt deshalb je Scheitelpunkt aus der Krümmung: Mittelwert des Feldes
auf einem Ring von einer Netzkantenlänge (41 cm), minus dem Feld am Punkt, bei
null geklemmt — der diskrete Laplace-Operator, positiv in der Mulde, null auf
dem Kamm. Dazu 2 mm Grundabstand.

| | Saumpixel | Verdunklung |
| --- | --- | --- |
| 20 mm fest (vorher) | 46 | weich ✅ |
| 5 mm fest | 4 | zerfallen ❌ |
| `polygonOffset` | 2 | zerfallen ❌ |
| **Hub aus der Krümmung** | **2** | **weich ✅** |

Kosten: sechs zusätzliche `heightAt`-Aufrufe je Scheibenscheitelpunkt beim
Aufbau, keine zur Laufzeit, kein Draw-Call, kein Byte Textur.

**Die Lehre:** Drei Durchläufe lang habe ich an einer Schraube gedreht, die mit
dem Fehler nichts zu tun hatte, weil die erste Vermutung plausibel klang und nie
gegen eine Alternative geprüft wurde. Ein Strahl durch das Pixel hätte das in
einer Minute geklärt — und im Kopf von `tools/strahl.mjs` steht seit Paket 7,
dass er die **erste** Handlung bei einem unerklärten Fleck sein soll, nicht die
vierte. Diesmal war er die vierte.

### Gleiche Sterne, ein zweiter Mond, ein Sputnik — und Rippel, die gabeln

Drei Wünsche des Auftraggebers und der zweitschwerste Befund des Prüfers in
einem Durchlauf.

#### Alle Sterne gleich hell

Drei Dinge machten sie ungleich, und alle drei beschreiben **Luft**, die es auf
einem luftlosen Körper nicht gibt:

* die Größenklassenverteilung `pow(rand, 2.6)` — zwei Dutzend helle über
  zweieinhalbtausend schwache,
* die **Extinktion** zum Horizont hin,
* das **Flimmern** — Szintillation entsteht in der Atmosphäre.

Alle drei sind heraus. Die Farbtemperatur bleibt: „gleich hell" ist keine
Aussage über die Farbe. Damit die Farbe die Helligkeit nicht durch die
Hintertür wieder ungleich macht, wird jeder Ton auf **gleiche Leuchtdichte**
normiert (Y₇₀₉ = 0,55).

Gemessen an den lokalen Maxima im oberen Bilddrittel von `f-kante`:

| | Spanne | Streuung |
| --- | --- | --- |
| vorher | 212,7 | 25,0 (**61,3 %**) |
| jetzt | 62,0 | 14,8 (**8,4 %**) |

Der Rest von 8,4 % ist die Farbtemperatur und die Kantenglättung des Punktes.

**Der Zug aus dem gesäten Strom bleibt stehen**, obwohl sein Wert nicht mehr
gebraucht wird — ohne ihn verschöbe sich jede folgende Ziehung und mit ihr die
Lage sämtlicher Sterne, Brocken und Landmarken.

**Was das kostet:** einen der vier Träger von Bewegung. Der Himmel steht jetzt
still. Physikalisch ist das richtig; wenn das Flimmern zurück soll, ist es eine
Zeile.

#### Der zweite Mond

Ein rötlicher Halbmond auf der Gegenseite, 33,3 Grad **unter** dem Horizont bei
Station 0 und 33,3 Grad darüber bei Station 180 — er gehört der dunklen Hälfte
des Rundgangs. Er ist **keine Lichtquelle**; die Szene hat genau eine gerichtete
Quelle, und dabei bleibt es.

Damit er nicht als Kopie liest, unterscheidet er sich in fünf Merkmalen:
eisenrote statt kühlgraue Farbe, exakt halbe statt dreiviertel Phase
(`phaseZ = 0` legt den Terminator genau über die Mitte), 17 statt 26 Einheiten
Größe (3,2 gegen 5,0 Grad), 170 Krater ohne Strahlensysteme gegen 90 mit, und
eine schwache rötliche Hoflage gegen drei blaue.

Der Scheibenbauer ist dafür **parametrisch** geworden statt kopiert: `MOND_STIL`
hält die zwölf Zahlen, die die beiden Körper unterscheiden. Zweihundert Zeilen
Kopie wären die Sorte, bei der beim nächsten Mal nur eine der beiden gepflegt
wird.

#### Der beschädigte Sputnik

Der echte: 58 cm aus zwei Halbschalen an einem Äquatorflansch, vier
Peitschenantennen in kegeligen Schuhen. Beschädigt heißt hier nicht „zufällig
verbeult", sondern eine erzählbare Geschichte — auf der Flanke aufgeschlagen,
die Schale dort eingedrückt, der Flansch aufgebogen, zwei Antennen an der Wurzel
abgerissen, eine geknickt, eine krumm, dazu eine Schleifspur mit Blechfetzen.
Ein Material, ein Draw-Call.

**Vier Anläufe, und jeder hat etwas gelehrt.**

**1. Metall ohne Umgebungskarte ist schwarz.** `metalness: 0.82` ist für
Aluminium physikalisch richtig und hier fatal: Bei einem Metall kommt fast die
ganze Antwort aus der Spiegelung der Umgebung, und diese Szene hat aus gutem
Grund keine PMREM-Karte. Übrig blieb ein fast schwarzer Ballon mit einem weißen
Glanzfleck — im Bild eine Seifenblase. Über 0,45 (schwarzer Käfer) steht der
Wert jetzt auf **0,25 bei Rauheit 0,20**: eng genug für Metall, hell genug für
eine Form.

**2. Eine Form, die dünner ist als ein Bildpunkt, ist keine Form.** Die Antennen
hatten maßstäbliche 9 auf 3 mm. Bei 55 Grad Bildwinkel auf 720 Zeilen deckt ein
Bildpunkt 1,33 mrad ab; 3 mm auf drei Meter sind 1,0. Im Bild standen Kratzer.
Jetzt 14 auf 6 mm.

**3. `stelleAuf` setzt den Mittelpunkt.** Ein Halbmesser unter der Geländehöhe
versenkt damit mehr als die halbe Kugel. Zwei Anläufe (−11 cm, −2 cm) zeigten
nur eine Kuppe; **+8 cm** lassen 37 der 58 cm frei.

**4. Und wieder die Falle mit `detail`.** Ich habe „Detail 4 gibt 5120 Dreiecke"
in den Kommentar geschrieben — dieselbe Verwechslung, an der der Planet selbst
schon einmal hing und die in diesem Protokoll unter „Eine API-Zahl, deren
Bedeutung man zu kennen glaubt, gehört nachgezählt" steht. `detail` ist keine
Rekursionstiefe: 20 · (d+1)². Detail 4 sind **500**. Nachgezählt hat es
`tools/inspect.mjs` — der ganze Sputnik stand mit 2228 Dreiecken in der Liste,
wo allein die Kugel 5120 haben sollte. Detail 15 gibt sie.

#### Die Rippel gabeln jetzt

Befund 2 des Prüfers: *„Die Rippelkämme laufen über den gesamten sichtbaren Hang
parallel, mit gleichem Abstand und gleicher Amplitude, ohne eine einzige
Gabelung."*

Er hatte recht, und der Grund stand in einer Zeile, die aussah wie die Lösung:
`versatz` hing **nur von `laengs` ab**, also von der Lage *entlang* der Kämme.
Alle Kämme wurden damit um denselben Betrag verschoben — sie mäandern, aber sie
bleiben parallel.

Eine Gabelung entsteht, wo benachbarte Kämme **verschieden** weit verschoben
werden. Dafür muss der Versatz auch von der Lage *quer* dazu abhängen. Zwei
Terme mit `bogenQuer` genügen. Dazu ein zweiter, feinerer Fleckenmaßstab (drei
bis sechs Meter), der die Rippelung stellenweise ganz aussetzen lässt.

#### Zwei eigene Fehler am Prüfstand, beide vom selben Typ

**Backticks im Shader-Kommentar, zum zweiten Mal in derselben Sitzung.** Der
GLSL-Quelltext steht in einem Template-Literal; ein `` ` `` darin beendet die
Zeichenkette. `tools/shaderlint.mjs` gibt es genau dafür — es kann diesen Fall
aber **nicht** finden, weil die Datei danach nicht mehr parst und der Linter
gar nicht erst läuft. Der Bauabbruch ist hier der Melder, nicht der Linter.

**Und eine Warnung, die ich selbst geschrieben und nicht gebaut habe.** Ein
Prüfbild darf jetzt `station: 180` verlangen, damit der zweite Mond überhaupt
ins Bild kommt. Über der Funktion steht: *„und danach ohne Vermerk
zurückgestellt — sonst bliebe die ganze Reihe danach verdreht."* Genau das ist
passiert: `f-kante` wurde auf der Nachtseite gerendert und stand als fast
schwarzes Bild in der Reihe. Geschrieben war die Warnung, gebaut war sie nicht.

#### Gemessen

| | vorher | jetzt |
| --- | --- | --- |
| Draw-Calls | 13–18 / 120 | **16–21 / 120** |
| Dreiecke | 310 266–313 154 / 350 000 | **318 218–328 506 / 350 000** |
| Streuung der Sternhelligkeit | 61,3 % | **8,4 %** |
| Sputnik | — | 6848 Dreiecke, 1 Draw-Call |
| Blechfetzen | — | 560 Dreiecke, 1 Draw-Call |

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δmax 8 bei 0,012 %, Insel
0,585 % ≥ 2 im Rauschband. Konsole frei von Errors und Warnings.

### Der halbe Sternhimmel, und was „gleich hell" wirklich hieß

Zwei Korrekturen des Auftraggebers, beide berechtigt, und die erste war ein
handfester Fehler, den er zweimal melden musste, bevor ich ihn nachgezählt habe.

#### Die Kappe

Das Sternfeld war eine **Kappe** von y = −0,36 bis y = +1: die obere Halbkugel
plus die zwanzig Grad bis zur Geländekante. Auf der 96-m-Platte war das richtig
— was tiefer lag, deckten Boden und Nebel ab.

Auf dem Planeten dreht das Sternfeld mit der Welt, weil sonst der Mond nie
unterginge. **Die Kappe dreht mit** — und zeigt nach einer halben Runde nach
unten. In `h-mond-rot` (Station 180), zeilenweise gezählt:

| Bildzeilen | 0–120 | 120–240 | 240–360 | 360–480 | 480–600 | 600–720 |
| --- | --- | --- | --- | --- | --- | --- |
| vorher | **0** | **0** | 510 | 162 | 130 | 239 |
| jetzt | 449 | 469 | 965 | 636 | 431 | 397 |

Jetzt die volle Kugel. Was unter dem Horizont steht, verdeckt der Boden — das
kostet nichts und ist die einzige Verteilung, die unter jeder Drehung stimmt.

**Die Anzahl steigt von 2600 auf 5200, ohne den gesäten Strom zu verschieben.**
`makeSternfeld` läuft **vor** dem Bau des Planeten; jeder zusätzliche
`rand()`-Zug verschöbe die Lage sämtlicher Brocken, Formationen und Findlinge.
Deshalb: genau so viele Züge verbrauchen wie bisher (2600 × 5), und danach mit
einem eigenen gesäten Strom bauen.

#### „Gleich hell" hieß: auf der Seite ohne Mond

Ich hatte **alle** Sterne gleich hell gemacht. Gemeint war die mondabgewandte
Seite — und das ist zum Glück die einfachere Aufgabe: Mond und Sternfeld sitzen
in derselben Gruppe, ihre gegenseitige Lage ändert sich beim Rundgang **nie**.
Der Anteil lässt sich deshalb je Stern einbacken, statt ihn je Bild zu rechnen.

Am Mond behält der Himmel seine Größenklassen — dort blendet sein Hof die
schwachen ohnehin aus, und die wenigen hellen sind genau das, was man neben
einem Mond sieht. Auf der Gegenseite stehen sie alle gleich hell und damit alle
sichtbar. Das **Flimmern** kommt auf derselben Grundlage zurück: nur dort, wo
die Sterne nicht gleich hell sein sollen — es war einer der vier Träger von
Bewegung, und auf der Gleichseite wäre es genau der Rest, der sie wieder
ungleich macht.

### Vier weitere Befunde des Prüfers

**10 — Die Milchstraße ist Rauch.** *„Ein weichgezeichnetes graues Band ohne
eine einzige Punktquelle."* Eine Milchstraße besteht aus Sternen. 36 % des
Sternfelds werden jetzt zur Bandebene hin **gestaucht**: Der Anteil der Richtung
entlang des Bandpols wird auf ein Fünftel zusammengedrückt und neu normiert —
aus der gleichverteilten Kugel wird ein Gürtel von rund elf Grad Halbbreite, und
die Verteilung darin bleibt gleichmäßig. Damit Band und Verdichtung dieselbe
Ebene meinen, steht `MILCH_POL` jetzt auf Modulebene statt in `makeNachtKuppel`.

**12 — Der Mond in der Bildmitte.** Schwerpunkt (631, 346) auf 1280 × 720 —
*„der schwächstmögliche Ort im Bild, und es ist die eine Kamera, deren einziger
Zweck der Mond ist."* Das Blickziel ist um gut zehn Grad nach links und sechs
nach unten versetzt; der Mond steht jetzt im rechten oberen Drittel, mit der
Milchstraße als Gegengewicht.

**8 — Keine Schlagschatten.** `tools/schattenwurf.mjs` (neu) rendert jede Kamera
zweimal — mit und ohne Schattenwurf — und misst, was dazwischen liegt.
Schwellenfrei, ohne Raterei, welches Pixel dazugehört. Ergebnis:

| | a-augenhoehe | e-boden | d-orbit | g-sputnik |
| --- | --- | --- | --- | --- |
| Schattenfläche | 0,22 % | 0,01 % | 1,79 % | **6,91 %** |

Schatten **gibt** es. Zwei Gründe, warum sie in Augenhöhe kaum ankommen, und
nur einer ist zu beheben:

* **Geometrie.** Die Brocken sind 14 bis 56 cm groß und zu einem Drittel
  eingesunken; ihr Schatten ist bei 30 Grad Mondhöhe einen halben Meter lang.
  Der Sputnik zeigt mit 6,91 %, was ein Körper mit Aufbauten kann — das ist
  keine Lichtfrage, das ist eine Frage, was dasteht.
* **Das Verhältnis der Quellen.** Bei Himmel 2,0 gegen Mond 3,1 · sin 30° = 1,55
  kam mehr als die Hälfte des Lichts aus einer Quelle, die kein Schatten je
  abhält. Gemessen:

  | Himmel / Mond | 2,0/3,1 | 1,4/3,8 | 1,0/4,4 | 0,6/5,0 |
  | --- | --- | --- | --- | --- |
  | größter Abfall | 54 | 72 | 81 | 79 |

1,45/3,8 ist der Kompromiss. Die Nachtseite lebt **nur** vom Himmelslicht;
gemessen über die sechs mondlosen Stationen fällt ihr Mittel von 13,7–18,5 auf
11,2–17,3, ihre Tonwertspanne **steigt** aber von 7,8–29,8 auf **9,2–33,0** —
weil dort jetzt mehr und hellere Sterne stehen. Dunkler im Mittel, mehr
Zeichnung im Bild.

**5 — Frost, dritter Anlauf.** Nach dem zweiten stand er immer noch bei 0,00 bis
0,18 % der Bodenpixel, in `e-boden` bei null. Die Kante war richtig, der
Einsatzpunkt zu spät: `smoothstep(0.25, 0.85, abgewandt)` ließ die Kruste erst
75 Grad hinter dem Terminator beginnen, und so weit abgewandte Flächen sind
ohnehin fast schwarz. `smoothstep(0.05, 0.55, …)` legt sie auf die schattige
Flanke, wo man sie sieht. Jetzt 0,05 bis 0,29 %, in `e-boden` 0,14 % statt null
— und im Bild tragen mehrere Brocken eine sichtbare kalte Kruste.

**11 — `rund-030` ist ein leeres Bild.** Der Rundgang läuft nach Azimut 180;
Station 30 steht bei 13,1 m Bogen. Ein Grat quert den Weg jetzt bei 22 bis 30 m
Bogen — aus 9 bis 17 m Entfernung, und mit 3,5 m Kammhöhe reicht die Sichtweite
(8,9 + sqrt(2·25·3,5) = 22,1 m) genau bis dorthin.

#### Gemessen

| | Wert |
| --- | --- |
| Draw-Calls | 16–21 / 120 |
| Dreiecke | 318 218–328 506 / 350 000 |
| Rundgang schließt | 1,30 cm |
| längste gerade Kante im Gelände | 119 px (vorher 192) |
| Sterne in den obersten 240 Zeilen bei Station 180 | 0 → **918** |
| Frost auf Bodenpixeln | 0,00–0,18 % → **0,05–0,29 %** |
| größter Schattenabfall | 54 → **72** |

Regression: Zen bitgleich, Konstrukt Δmax 1, Dojo Δmax 5 bei 0,008 %, Insel
0,495 % ≥ 2 im Rauschband. Konsole frei von Errors und Warnings.

#### Was offen bleibt

* **Die Schattenfläche in Augenhöhe** ist geometriebegrenzt, nicht
  lichtbegrenzt. Mehr Schatten hieße größere Körper oder mehr Aufbauten — das
  ist eine Entscheidung über die Landschaft, keine über die Beleuchtung.
* Der Prüfer hat den Sputnik noch nie gesehen; sein Bericht ist von vor seinem
  Einbau.

### „Von allen Seiten beleuchtet" — ohne den Mond zur Sonne zu machen

Der Auftraggeber will den Planeten von allen Seiten beleuchtet haben. Das steht
in einer Spannung zur Grundregel dieses Auftrags — *„Es bleibt Nacht. Wer den
Mond zur Sonne macht, hat die Aufgabe verfehlt."* — und die Auflösung stand
schon am Himmel, seit einem Durchlauf, ohne dass ich sie benutzt hätte: **Es
gibt einen zweiten Mond.** Er stand als Bild da und tat nichts. Ein Körper, der
eine halbe Scheibe voll Sonnenlicht zeigt, wirft welches zurück.

Der rote Halbmond bekommt deshalb eine gerichtete Quelle: 0,78 gegen 3,8 des
weißen, in seiner eigenen Farbe (0xd08a62), **ohne Schattenwurf**. Zwei
Schattenkarten wären zwei Durchgänge über 328 000 Dreiecke, und zwei
Schattensätze aus verschiedenen Richtungen lesen in einer Nachtszene als Fehler,
nicht als Licht. Die eine gerichtete Quelle mit Schatten bleibt der Mond; dies
ist Fülllicht mit einer Richtung.

Damit ist die abgewandte Seite kein Schwarz mehr, sondern eine **zweite,
andersfarbige Nacht**. Wer den Rundgang macht, läuft aus einem kalten Licht in
ein warmes und wieder zurück. Über die sechs mondlosen Stationen:

| | Mittel | Tonwertspanne |
| --- | --- | --- |
| vor dem zweiten Licht | 11,2 – 17,3 | 9,2 – 33,0 |
| jetzt | **17,1 – 20,0** | **12,7 – 46,8** |

In der Totale `d-orbit` ist die schwarze Hälfte verschwunden: Der Körper trägt
jetzt rundherum Form, kalt auf der einen und rostrot auf der anderen Seite.

**Es bleibt Nacht.** Das hellste Bild des Rundgangs steht bei einem Mittel von
93,8 von 255, das dunkelste bei 17,1. Der zweite Mond ist ein Sechstel so stark
wie der erste und leuchtet aus der Gegenrichtung — er ist ein Mond, keine Sonne.

### Der Frost war zu hell, und der Saum ist nicht, wofür ich ihn gehalten habe

Zwei Befunde aus dem zweiten Prüfbericht, beide von mir verursacht, beide auf
der halben Runde sichtbar. Einer ist behoben, der andere nicht — und der Weg
dorthin ist der lehrreichere.

#### Frost, vierter Anlauf — diesmal nach unten

Der Prüfer, als schwersten Mangel: In `rund-270` steht ein vereister Brocken bei
L = 46,5, der Boden ringsum bei L = 19,9 — **das 2,4-Fache** — und farblich
neutral bis kühl (B ≥ R), obwohl das einzige gerichtete Licht dort das warme
rote Fülllicht ist. *„Marshmallows in einer roten Wüste."*

Die Ursache ist nicht der Frost, sondern was ihn beleuchtet: Das
Hemisphärenlicht (0x7595b4) ist **blaugrau** und trifft alles, was nach oben
zeigt, unabhängig von jeder Richtung. Eine blauweiße Albedo darunter wird
zwangsläufig das Hellste und Kühlste im Bild. Der Regolith entgeht dem nur, weil
er dunkel und warm ist.

`0xbcd0e0` hatte eine Leuchtdichte von 0,79 und 36 Stufen Blauüberschuss;
`0x8e969a` liegt bei 0,58 und bei 12. Dazu die Menge von 0,9 auf 0,54 zurück.

| `rund-270` (830, 470) | vorher | jetzt |
| --- | --- | --- |
| RGB | (57, 43, 50) | **(44, 24, 22)** |
| Leuchtdichte | 46,5 | **28,1** |
| Verhältnis zum Boden | 2,4× | **1,41×** |
| Farbe | kühl (B > G) | **warm (R > G > B)** |

Der Frost bleibt auffindbar (0,03 bis 0,29 % der Bodenpixel), widerspricht aber
der Beleuchtung nicht mehr.

#### Der Saum an der Kontaktlinie — drei Verdächtige, alle freigesprochen

Der Prüfer: unter jedem Brocken der Nachtseite ein harter heller Saum,
`rund-210` bei (270, 576) mit L = 75,6 gegen Boden L ≈ 20 — *„es bringt die
Steine zum Schweben, statt sie einzubetten."*

**Erster Verdacht: die Staubfahnen der Kontaktverdunklung.** Sie sind
`MeshBasicMaterial` und `toneMapped: false`, ihr Wert steht also unabhängig vom
Licht am Ort fest. Auf der Mondseite liest das als Verweher, auf der Nachtseite
als glühender Ring. Der Anteil wird jetzt eingebacken — das geht, weil die Lage
des Mondes **relativ zur Planetenoberfläche** fest ist. **Wirkung auf den Saum:
keine.** Die Änderung bleibt trotzdem drin; eine Staubfahne, die im Dunkeln
leuchtet, ist unabhängig davon falsch.

**Zweiter Verdacht: Feinstaub und Brocken.** Je einzeln ausgeblendet
(`tools/naht.mjs --station 210 --ohne …`, neu): keine Wirkung.

**Dritter Verdacht: das Fülllicht ohne Schatten.** Die Farbe stützte ihn stark —
RGB(105, 66, 54) ist das Verhältnis 1 : 0,63 : 0,51, und das Fülllicht
(0xd08a62) hat 1 : 0,66 : 0,47. Also bekam es versuchsweise eine eigene
Schattenkarte, 1024 Texel, dieselbe Box. **An derselben Stelle steht danach
exakt RGB(105, 66, 54).** Nicht ein Pixelwert hat sich bewegt.

Die Karte ist deshalb wieder heraus. Ein zweiter Schattendurchgang über
328 000 Dreiecke ist auf einer Brille kein Rundungsfehler, und man bezahlt ihn
nicht für eine Wirkung, die man nicht nachweisen kann. Der Saum bleibt offen —
mit vier ausgeschlossenen Ursachen statt keiner.

**Und mein Saumzähler misst das Falsche.** `tools/naht.mjs` sucht einen hellen
Punkt **über** der Geländekante; der Prüfer meint einen hellen Bogen **an der
Kontaktlinie**, also mitten im Gelände. Am Prüfstand liegt Station 210 bei 27
Saumpixeln und rührt sich bei keinem der Versuche — er hat den Fehler nie
gesehen. Das ist die dritte Stelle in diesem Auftrag, an der ein Messwerkzeug
etwas anderes gemessen hat als das, was auf dem Bild steht.

### Das Schachbrett im Halbschatten: vier Auswege, vier Fehlschläge

Der Prüfer hat unter dem Sputnik ein regelmäßiges 2-Pixel-Schachbrett gefunden
und es „das einzige echte Pixelgitter der Szene — kein Stilmittel, sondern eine
Rechenspur" genannt. Sein Nachweis war die Autokorrelation des Hochpasses.

`tools/raster.mjs` (neu) macht daraus eine wiederholbare Messung und, wichtiger,
eine, mit der sich der Verursacher einkreisen lässt: Es rendert dieselbe Ansicht
mehrfach und schaltet dabei je einen Kandidaten um.

| Fall | RMS | r(1,0) | r(2,0) |
| --- | --- | --- | --- |
| Stand | 1,525 | **−0,374** | 0,325 |
| Schatten aus | 0,636 | +0,765 | 0,505 |

Damit ist die Quelle eindeutig: **die Schattenkarte**. Hartes PCF vergleicht je
Bildpunkt gegen das Texelraster, und dort, wo der Halbschatten einsetzt, kippt
der Vergleich zwischen benachbarten Bildpunkten hin und her. Der Wert −0,374
deckt sich mit den −0,39, die der Prüfer gemessen hat.

Vier Auswege, alle nachgemessen, alle durchgefallen:

* **`PCFSoftShadowMap`** — in three r185 **abgekündigt**. three meldet beim
  Setzen „has been deprecated. Using PCFShadowMap instead" und rendert Zeichen
  für Zeichen dasselbe Bild (RMS 1,525 → 1,525). Der klassische Hebel gegen
  genau dieses Artefakt existiert nicht mehr.
* **Schattenkarte 4096 statt 2048** — RMS 1,075 → 0,974, also **zehn Prozent
  für die vierfache Karte**. 1024 macht es schlechter (1,385). Auf einer Brille
  ist das kein Handel.
* **`shadow.radius` 2 und 6** — macht es **schlechter**, nicht besser: RMS 2,5
  und 4,3. Der größere Kernel spreizt die Quantisierung, statt sie zu glätten.
* **`VSMShadowMap`** — löscht das Gitter vollständig (RMS 0,620, r(1,0)
  +0,756). Und zwar, weil es die **Schatten gleich mitlöscht**: Der Wert ist
  identisch mit „Schatten aus", der Sputnik wirft keinen Schatten mehr, das Bild
  wird um 18 Helligkeitsstufen heller, 89,5 % der Bildpunkte ändern sich, und
  die Himmelsinsel — die ihn gar nichts angeht — verschiebt sich um Δmax 118.

**Der Wert, der zu gut aussieht, war der Hinweis.** RMS 0,620 gegen 0,636 für
„gar keine Schatten" ist kein Erfolg, sondern derselbe Zustand unter anderem
Namen. Zwei Zahlen, die auf drei Stellen übereinstimmen, wo eine Verbesserung
stehen sollte, sind ein Grund nachzusehen, kein Grund zu feiern.

Es bleibt deshalb bei PCF, und das Gitter bleibt als **bekannter, gemessener
Mangel** stehen. Ein eigener, je Bildpunkt gedrehter PCF-Kern wäre ein Eingriff
in einen three-Shaderbaustein, der alle fünf Umgebungen trägt — das ist kein
Preis für ein Muster, das man bei achtfacher Vergrößerung findet.

### Der Fingerabdruck im Sand: zwei Windsysteme statt eines

Der Prüfer über den Boden: *„gleichabständige, gleichbreite Rillen, die überall
exakt der Höhenlinie folgen — man sieht nicht Sand, sondern eine
Höhenlinienkarte."* Im Ausschnitt von `c-krater` ist es unverkennbar ein
**Fingerabdruck**: verschachtelte Bögen um ein Zentrum.

Das Zentrum ist der **Windpol**. Ein zonaler Wind hat zwei davon, und dort
laufen seine Kämme als konzentrische Kreise zusammen. Der Kommentar im Code
kannte das Problem seit dem Umbau auf die Kugel — er hat es als unvermeidlich
verbucht (*„ein Vektorfeld ohne Nullstelle gibt es auf der Kugel nicht, Satz vom
Igel"*) und nur den Pol weit vom Startpunkt weggestellt. Auf einer Platte hätte
das gereicht. Auf einem Körper, den man in einer Minute umrundet, kommt man an
jedem Pol vorbei.

**Die Pole sind nicht wegzurechnen, aber wegzublenden.** Zwei Systeme mit Polen
90 Grad auseinander: Am Pol von A steht B im Äquator und hat dort gerade Kämme.
Sichtbar ist immer das System, dessen Pol **weiter weg** ist.

**Der erste Anlauf hat zwei Fehler auf einmal gemacht.** Er hat beide Systeme
über ein breites Band überblendet (`smoothstep(0.82, 0.97, |sinBr|)`). Der
Wirbel blieb trotzdem stehen — die Blende setzte erst bei 55 Grad Breite ein,
und der Fingerabdruck ist lange vorher zu sehen — und im Überlappungsbereich
stand ein **regelmäßiges Rautengitter**, also ein neuer Programmierer-Tell an
Stelle des alten. Jetzt entscheidet ein Vergleich der beiden Polabstände mit
einer absichtlich **schmalen** Blende (rund sechs Grad). Was bleibt, ist eine
schmale Scherlinie zwischen zwei Rippelrichtungen — die gibt es in einem echten
Dünenfeld auch.

**Und ein Fehler in meinem eigenen Shader, der fast durchgegangen wäre.** Der
erste Entwurf hatte in der Systemschleife zwei `continue`, um Rechenschritte zu
sparen. In der Schleife steht ein `fwidth`, und **Ableitungen in nicht-uniformem
Kontrollfluss sind in GLSL undefiniert**: Der Wert kommt aus den
Nachbarfragmenten, und wenn eines davon die Schleife verlassen hat, ist er Müll.
Gespart hätte ich ein paar Takte, bezahlt hätte ich mit einem Artefakt genau an
der Blendkante, die der Umbau beseitigen soll.

### Der Linter war in Ordnung, mein Vorgehen nicht

**Zum dritten Mal in dieser Sitzung** habe ich einen Backtick in einen
Shader-Kommentar geschrieben und damit das Template-Literal beendet.
`tools/shaderlint.mjs` gibt es genau dafür, seit Runde 6, und es findet den Fall
auch zuverlässig — an einer Testdatei gegengeprüft: `t.js:2 Backtick im
Kommentar innerhalb eines Template-Literals`, Rückgabewert 1.

Es hat nur nie jemand vorher aufgerufen. Ich habe es dreimal **nach** dem
Bauabbruch laufen lassen, und dann meldete es folgerichtig „keine Funde".

`package.json` hat deshalb jetzt ein `prebuild`: `npm run build` ruft den Linter
von selbst auf und bricht ab, bevor der Bau überhaupt beginnt. **Eine Prüfung,
an die man denken muss, ist keine Prüfung.**

### Komposition: die Steine folgen jetzt dem Gelände — und die Kennzahl misst die Kugel

Der Prüfer hat die Komposition als schwächstes Kriterium benannt: *„Masse links
zu rechts 1,00 bis 1,07 in **allen zwanzig Bildern** — kein einziges hat eine
Gewichtsachse."*

Die Ursache der Gleichförmigkeit stand in zwei Zeilen: `u` und `phi`
gleichverteilt über die Kugel. 240 Brocken auf 7854 m² sind einer je 33 m²; ein
Blick über den 8,9-m-Horizont deckt rund 250 m² ab, und darin liegen **immer**
dieselben sieben. Jede Ansicht ist dieselbe Stichprobe derselben Verteilung.

Auf einem echten Körper liegt Blockwerk dort, wo es hergekommen ist: als
Auswurfdecke um einen Einschlag und als Schutthalde am Fuß eines Grats. Genau
diese Orte gibt es hier schon. Zwei Drittel der Brocken werden ihnen jetzt
zugeordnet, nach Gewicht (ein großer Krater bekommt mehr als ein kleiner), ein
Drittel bleibt verstreut — **ohne einen einzigen zusätzlichen `rand()`-Zug**:
Welcher Brocken zu welchem Feld gehört, kommt aus `hashNoise`, und seine beiden
Lagezüge werden umgedeutet (`u` wird zum flächengleichen Radialanteil im Kranz,
`phi` bleibt der Winkel).

#### Was das bringt, und was nicht

Über die **zwölf Stationen des Rundgangs**, Anteil der Felspixel je Bild:

| | vorher | jetzt |
| --- | --- | --- |
| Streuung | 8,43 | **11,64** |
| Spanne | 24,4 | **42,7** Prozentpunkte |

Es gibt jetzt Stationen mit 42,9 % Blockwerk und Stationen mit 0,24 %. Das ist
der Unterschied zwischen Verteilung und Komposition, und in `d-orbit` sieht man
ihn direkt: Gruppen und kahle Flächen statt gleichmäßigem Streusel.

**An der Kennzahl des Prüfers ändert es fast nichts** — Masse links zu rechts
bleibt bei 1,00 bis 1,04. Das ist kein Versäumnis, sondern eine Eigenschaft der
Kennzahl: In einer Nachtszene trägt die **dunkle Masse** die Komposition, und
die dunkle Masse ist hier der Boden. Wer auf einer Kugel von 25 m Halbmesser
steht, hat den Horizont ringsum bei 8,9 m; der Boden füllt die untere Bildhälfte
**immer** symmetrisch, und 240 Brocken von 14 bis 56 cm bewegen daran nichts.

Was diese Zahl bewegen würde, sind Formen, die die Horizontlinie asymmetrisch
brechen — also mehr oder größere Landmarken, gesetzt mit Blick auf den Rundgang.
Das ist eine Entscheidung über die Landschaft, keine über die Steinverteilung,
und sie steht offen. Der Kantenanteil im unteren Bilddrittel, die andere Hälfte
seines Befunds, hat sich dort bewegt, wo Blockwerk dazukam: `c-krater` von
0,96 % auf 1,39 %.

### Die Lehren dieser Runde

* **Eine API-Zahl, deren Bedeutung man zu kennen glaubt, gehört nachgezählt.**
  `detail: 6` sah nach 81 920 Dreiecken aus und war 980. Die Zahl stand im
  Kommentar, die Herleitung stand im Kommentar, und beide waren falsch. Was sie
  aufgedeckt hat, war ein `verts`-Feld in einer Diagnoseausgabe.
* **Was auf einer Ebene richtig war, ist auf einer Kugel nicht falsch, sondern
  bedeutungslos.** Nebel 22–48 m auf einem Planeten mit 8,9 m Horizont,
  Rippelphase aus x/z, ein Himmelshorizont auf Augenhöhe, `+Y` als „oben" für
  jeden Stein: vier Stellen, an denen der Code weiterlief und nichts mehr
  aussagte.
* **Eine geschlossene Formel für Sichtbarkeit ist eine Untergrenze, kein
  Beweis.** „Aus 25 m Bogen sichtbar" galt für eine glatte Kugel; das Gelände
  darauf schwankt um ±2 m und macht daraus mehrere Grad. Was zählt, ist die
  gemessene Höhe der Spitze gegen die gemessene Höhe des Rückens davor.
* **Eine Zahl, die zwei Seiten kennen müssen, darf nur an einer Stelle
  stehen.** Der Freiraum der Fortbewegung stand in `walkable.js`, in
  `rundgang.mjs` und in `gehbereich.mjs`. Als er von 0,9 auf 0,25 m fiel, habe
  ich zwei davon übersehen — und der Prüfstand hat daraufhin gemeldet, der
  Rundgang schließe nicht. Nicht der Planet war kaputt, sondern das Maßband.
* **Wenn zwei Werkzeuge sich um den Faktor sechs widersprechen, hat eines von
  beiden unrecht, und es ist selten die Geometrie.** Eine Steigung von 11,05
  ist eine Wand von 85 Grad; dass die Szene so etwas nicht enthält, war schneller
  zu prüfen als die Zahl zu glauben.
* **`git status`, bevor man eine Datei anlegt.** `tools/silhouette.mjs` gab es
  schon, und ein `cat >` hat es wortlos ersetzt. Aufgefallen ist es an einer
  Zeile in `git diff --stat`.
* **Eine Kugel hat immer einen Terminator.** Alles, was auf der Platte unter
  30° Lichteinfall getestet war — Schattenbias, Kontaktverdunklung, aufgemalte
  Staubfahnen —, sieht sich hier einmal je Rundgang streifendem Licht gegenüber.

---

## Anker am Weg — und was sie nicht können

Der offene Punkt aus der letzten Runde war die Komposition: *„Was diese Zahl
bewegen würde, sind Formen, die die Horizontlinie asymmetrisch brechen — also
mehr oder größere Landmarken, gesetzt mit Blick auf den Rundgang."* Die
Entscheidung dafür ist gefallen, und die Umsetzung hat drei Anläufe gebraucht,
von denen die ersten beiden falsch waren.

### Erst rechnen, wohin überhaupt etwas gehört

Die sechzehn Landmarken stehen bereits neben der Laufspur, mit gerechnetem
Querabstand. Mehr davon hätte den Befund nicht getroffen, denn seine zweite
Hälfte lautete: *„Kantenanteil im unteren Bilddrittel bei 15 von 20 Bildern
unter 0,7 %, bei dreien 0,00 %."*

**Welchen Bogen zeigt dieses Drittel?** Für die Augenhöhenkamera — Neigung
−15°, Bildwinkel 70° — reicht es von −27,6° bis −50° Tiefenwinkel. Auf einer
Kugel von 25 m Halbmesser bei 1,6 m Augenhöhe ist der Tiefenwinkel zu einem
Bodenpunkt in Bogenabstand *s*

```
tief(s) = atan2( 1,6 + 25·(1 − cos(s/25)) , 25·sin(s/25) )
```

also 58° bei 1 m, 40° bei 2 m, 25,7° bei 4 m und 20,0° am Horizont bei 8,9 m.
**Das untere Bilddrittel zeigt den Bogen von 1,4 bis 3,7 m — ein Band von 2,3 m
Tiefe, direkt vor den Füßen.** Eine Formation bei 20 m Bogen steht dort niemals;
sie steht immer oben im Bild. Dieser Befund verlangt nicht nach Landmarken, er
verlangt nach etwas in Armeslänge.

Dazu kommt eine zweite Rechnung, die dem Werkzeug gilt und nicht der Szene:
`ortAmWeg(entlang, quer)` setzt Steine seitlich der Bahn, aber die
Augenhöhenkamera blickt 30° **neben** die Laufrichtung — sie schaut zum Mond.
Ein Stein bei 2,5 m Querabstand steht aus 2,7 m Entfernung unter 43° zur Bahn;
auf der einen Seite fällt er knapp ins Bild, auf der anderen liegt er 73° neben
der Achse und damit außerhalb der halben Bildbreite von 52°. **Die Hälfte aller
Nahanker kann diese Kamera grundsätzlich nicht sehen.** Dafür gibt es jetzt
`tools/nahfeld.mjs`: zwölf Stationen, je drei Blickrichtungen (geradeaus und
45° nach links und rechts), Kantenanteil nach demselben Maß wie
`tools/komposition.mjs`.

### Erster Anlauf: ein Kissen vor der Nase

Achtzehn Blöcke von 0,66 bis 1,71 m Halbmesser bei Unterteilung 2. Die Kennzahl
sprang, wo einer im Bild stand — Station 90 von 0,11 % auf **1,68 %** —, und
das Bild hatte zum ersten Mal eine Gewichtsachse. Der Blick auf dasselbe Bild
zeigte den Preis: ein Körper von 2,5 m Breite anderthalb Meter vor der Nase,
dessen Facetten 0,5 m maßen. Bei 0,097° je Bildpunkt sind das rund 250 px je
Facette, und weil `faerbeBruchstein` benachbarte Facetten kaum gegeneinander
abtönt, las das Ganze als **glattes Kissen**, nicht als Stein. Die Findlinge
tragen die Lehre schon im Kommentar: *„Ein Anker darf Anker sein, nicht
Hindernis."*

Zwei weitere Fehler standen daneben: der Querabstand lief bis 4,5 m — alles über
3,7 m kann das gemessene Band gar nicht erreichen, ein Drittel der Blöcke war
also für seinen Zweck wirkungslos —, und die Größe war unabhängig vom Abstand
gewürfelt, so dass große Steine nah standen und kleine fern.

### Die Grenze ist das Dreiecksbudget, und sie ist gerechnet

Der naheliegende Ausweg — kleinere Steine, dafür mehr davon — stößt sofort an
das Budget. Vor dieser Runde stand die Umgebung bei **337 626** von 350 000
Dreiecken je Bild. Ein Block bei Unterteilung 3 trägt 320 Dreiecke und wirft
Schatten, kostet also 640. Für lückenlose Deckung des 2,3-m-Bands bräuchte es
2,3 m Abstand, also 68 Blöcke und **43 520 Dreiecke** — das Siebenfache des
Freiraums.

Bevor irgendetwas anderes gestrichen wurde, war der größte Posten des
Schattendurchgangs zu prüfen: `nacht-planet` liefert 81 920 der 151 132
Dreiecke, mehr als die Hälfte. Ein Versuch mit `castShadow = false` ergab in
allen vier festen Kameras **Δmax = 0** — bitgleich, kein einziger Bildpunkt.

**Und genau daran wäre diese Runde beinahe gescheitert.** Vier Standbilder sind
kein Beweis; `tools/rundgang.mjs` misst am Gelände Steigungen bis 1,46, und eine
solche Flanke muss sich bei streifendem Licht selbst verschatten. Dieselbe
Messung über zwölf Stationen des Rundgangs:

| Station | 0–120 | **150** | 180 | **210** | 240–300 | **330** |
| --- | --- | --- | --- | --- | --- | --- |
| Δmax ohne Planetenschatten | 0 | **70** | 0 | **94** | 0 | **46** |
| Bildpunkte ≥ 2 | 0 % | **17,89 %** | 0 % | 0,10 % | 0 % | **10,35 %** |

Die drei Stationen mit Wirkung sind die Terminatorstationen: Mondhöhe −3,3°,
−53,7° und +3,3°. **Die vier festen Kameras stehen allesamt dort, wo der
Selbstschatten nichts tut** — sie taugen zur Beurteilung dieses Postens nicht.
Die 81 920 Dreiecke sind verdient und bleiben.

Damit steht die Grenze fest: **zwanzig Blöcke**, Unterteilung 3, Halbmesser 0,34
bis 0,72 m, Querabstand 2,0 bis 3,5 m, Abstand längs 7,85 m mit Versatz. Die
Umgebung liegt jetzt bei **344 186** von 350 000.

### Was sie leisten, gemessen

Strahlen von der Augenhöhe aus, 36 Azimute je Station bei −30° Tiefenwinkel,
gezählt wird, was auf Fels trifft:

| | vorher | jetzt |
| --- | --- | --- |
| Stationen mit Fels in Reichweite | 0 von 12 | **9 von 12** |
| nächster Fels | — | **1,5 bis 4,9 m** |

Über die 36 Ansichten von `tools/nahfeld.mjs`:

| | vorher | jetzt |
| --- | --- | --- |
| Kantenanteil unteres Drittel, Mittel | 0,77 % | 0,85 % |
| Median | 0,23 % | 0,30 % |
| Ansichten unter 0,7 % | 27 von 36 | **24 von 36** |

**Das ist ehrlich gesagt wenig.** Der Rundgang hat jetzt alle acht Meter etwas
in Armeslänge, und das ist für den Gang durch die Landschaft ein Gewinn; den
leeren unteren Bildrand schließt es nicht. Der Grund steht in der Zahl darüber:
Zwei bis sechs von 36 Richtungen treffen Fels, also 6 bis 17 % Rundum-Deckung.
Ein Bildausschnitt von 70° deckt sieben dieser Richtungen ab — die Wahrscheinlichkeit,
dabei einen der zwei Treffer zu erwischen, ist klein. Für „fast immer" bräuchte
es 30 bis 50 % Deckung, also das Drei- bis Fünffache an Steinen, und das verbietet
das Budget.

**Damit ist der Befund nicht erledigt, sondern eingegrenzt**, und die Eingrenzung
sagt zugleich, wo die Lösung nicht liegt: nicht in Geometrie neben dem Weg. Ein
Nahanker muss klein sein, weil er in Armeslänge steht; ein großer muss zurücktreten
und ist dann Mittelgrund. Was das Band von 1,4 bis 3,7 m in **jeder** Richtung
füllen kann, ist der Boden selbst — Struktur im Regolithschattierer, die keine
Dreiecke kostet. Das ist der nächste Zug.

### Nebenbefund, nicht in dieser Runde behoben

In `a-augenhoehe` läuft eine schnurgerade, dunkle Linie von einem Bildpunkt
Breite quer über den Sand. Es ist keine Naht, sondern eine **Peitschenantenne
des Sputnik**: 7 mm Wurzeldurchmesser auf 6 m Entfernung sind 1,17 mrad, also
0,7 Bildpunkte. Die Lehre aus Paket 3 gilt hier gegen mich — *eine Form, die
dünner ist als ein Bildpunkt, ist keine Form* —, und in der Brille wird sie bei
72 Bildern je Sekunde flimmern. Notiert, nicht behoben.

### Die Lehren dieser Runde

* **Bevor man etwas gegen eine Kennzahl baut, rechnet man aus, was die Kennzahl
  überhaupt sehen kann.** „Unteres Bilddrittel" klang nach Vordergrund und war
  ein Band von 2,3 m Tiefe. Drei Zeilen Trigonometrie hätten den ersten Anlauf
  gespart.
* **Ein Prüfbild misst die Szene und die Kamera.** Die Augenhöhenkamera blickt
  30° neben die Laufrichtung; die Hälfte aller Nahanker ist für sie unsichtbar,
  ganz gleich, wie viele es sind. Wer das nicht trennt, optimiert die Szene auf
  einen Winkel.
* **Bitgleich in vier Kameras heißt nicht wirkungslos.** Der Selbstschatten des
  Planeten war in allen festen Ansichten auf den Bit genau folgenlos und ändert
  an einer Terminatorstation 17,9 % der Bildpunkte. Ein Sparvorschlag, der auf
  vier Standbildern beruht, ist keiner.
* **Wenn eine Änderung die Kennzahl nicht bewegt, sagt man das.** Aus 0,77 auf
  0,85 % wird kein Erfolg, indem man die Zahl weglässt. Der Wert dieser Runde
  liegt in der Eingrenzung: Es ist jetzt gerechnet, dass Geometrie neben dem Weg
  dieses Problem nicht lösen kann.

---

## Kiesel in Armeslänge — Struktur ohne Dreiecke

Der vorige Eintrag endet mit einem Zeigefinger: *„Was das Band von 1,4 bis 3,7 m
in jeder Richtung füllen kann, ist der Boden selbst."* Das ist dieser Eintrag.

### Der Befund als Zahl

Verteilung der Helligkeitssprünge zwischen benachbarten Bildpunkten im **unteren
Bilddrittel**, gemessen an den festen Kameras. Die Kennzahl des Prüfers zählt
alles über 26:

| | Mittel L | p50 | p90 | p99 | größter |
| --- | --- | --- | --- | --- | --- |
| `e-boden` | 70,2 | 1,9 | 4,3 | 7,6 | **15** |
| `a-augenhoehe` | 79,1 | 4,9 | 11,3 | 22,6 | 160 |
| `c-krater` | 83,0 | 2,8 | 7,9 | 31,2 | 163 |

In `e-boden` liegt der **größte** Sprung über 240 000 Bildpunkte bei 15 — die
Schwelle wird nirgends erreicht, nicht einmal knapp. Wo `a-augenhoehe` und
`c-krater` über die Schwelle kommen, sind es die Brocken (p99,9 bei 84 bis 86),
nicht der Boden.

Der Boden hatte drei Maßstäbe: Korn aus der Normalenkarte (1,9 cm, blendet ab
6 m aus), Kies aus derselben Karte auf vierfacher Kachel (7,6 cm, bis 30 m) und
die Windrippel (34 cm). Der Kies stand auf **0,13** Neigung, also 7,4 Grad, und
mehr verträgt er nicht: Der erste Anlauf mit 0,42 hatte die Rippel vollständig
übertönt. Ein Flüstern über die ganze Fläche ist aber kein Vordergrund.

### Der Unterschied zwischen Rauschen und einem Ding

**Ein Kiesel hat einen Rand.** Rauschen hat keinen. Deshalb hier keine vierte
Karte, sondern verstreute Scheiben, gerechnet aus der Weltposition: ein Gitter
von 22 cm, je Zelle ein versetzter Mittelpunkt aus einer Hashfunktion, und nur
gut ein Viertel der Zellen trägt überhaupt einen. Halbmesser 3,1 bis 6,6 cm,
netto rund 4 % Flächendeckung. Kosten: **null Dreiecke, null Draw-Calls**, vier
Hashauswertungen je Fragment.

Vier Zellen statt neun, weil Versatz und Halbmesser so begrenzt sind, dass kein
Kiesel weiter als eine Zellgrenze reicht. Ausgeblendet wird zwischen 2,5 und
6 m — bei 22 cm Zellweite deckt eine Zelle auf 1,2 m rund 130 Bildpunkte ab, auf
7 m noch 22; weiter draußen wäre sie Moiré, und dort tragen Kies und Rippel
weiter.

### Drei Anläufe, drei Fehler

* **Golfball.** Erster Versuch: die Hälfte der Zellen belegt, Halbmesser bis
  9,2 cm, Neigung 0,5, Tönung 0,34. Das deckte 40 % der Fläche und sah aus wie
  Mondpocken. Auf ein Viertel der Zellen, 0,34 Neigung und 0,20 Tönung
  zurückgenommen.
* **Konfetti.** Kreise, alle gleich rund. Jetzt bekommt jede Zelle eine eigene
  Achse — aus demselben Hashwert normalisiert statt aus Winkelfunktionen
  gezogen, das spart je Zelle ein `sin` und ein `cos` — und wird quer dazu auf
  0,78 gestaucht.
* **Das Vorzeichen.** In `f-kante` sah die umgekehrte Version besser aus, und
  beinahe wäre sie so stehen geblieben. Dort steht der Mond aber **hinter der
  Kamera**: Eine von hinten beleuchtete Kuppe zeigt fast nichts, was sich nicht
  auch als Mulde lesen ließe. Entschieden hat `e-boden`, wo der Mond links vorn
  steht — nur mit dem ursprünglichen Vorzeichen liegt das Licht auf der linken
  Flanke. **Ein Vorzeichen entscheidet man an der Kamera, deren Licht eine
  Richtung hat, nicht an der, in der es von hinten kommt.**

### Was es bringt

| Kennzahl | vor den Ankern | mit Ankern | mit Kieseln |
| --- | --- | --- | --- |
| `a-augenhoehe`, Kantenanteil unten | 0,73 % | 0,73 % | **1,44 %** |
| `f-kante` | 0,12 % | 0,12 % | **0,74 %** |
| `c-krater` | 1,39 % | 1,39 % | 1,42 % |
| `e-boden` | 0,00 % | 0,00 % | 0,03 % |
| 36 Ansichten (`nahfeld`), Mittel | 0,77 % | 0,85 % | **1,13 %** |
| Median | 0,23 % | 0,30 % | **0,43 %** |
| Ansichten unter 0,7 % | 27/36 | 24/36 | **22/36** |
| größter Sprung in `e-boden` | 15 | 15 | **35** |

Dreiecke, Draw-Calls und Texturspeicher stehen unverändert bei 344 186 / 21 /
8 MB. Die Regression bleibt im bekannten Band (Insel 0,55 %, Zen, Konstrukt und
Dojo praktisch bitgleich), die Konsole ist frei von Errors und Warnings.

### Was es nicht bringt, und warum das so bleibt

Zweiundzwanzig von 36 Ansichten liegen weiter unter 0,7 %, und `e-boden` bleibt
bei 0,03 %. Der Grund ist inzwischen ausgerechnet: Bei 4 % Flächendeckung und
einer Randzone von 12 % des Halbmessers liegt rund **ein Prozent** der
Bildpunkte auf einer Kieselkante — genau die p99, die von 7,6 auf 8,8 steigt.
Für 0,7 % über der Schwelle 26 bräuchte es entweder das Zwanzigfache an Rändern
oder deutlich mehr Kontrast, und beides sah im Bild falsch aus: Das war der
Golfball.

**Die Schwelle 26 misst Objektkanten und Schlagschatten, nicht Oberfläche.** Ein
Boden, der sie flächig erreicht, ist kein Regolith mehr, sondern Schotter. Die
drei Stationen der Nachtseite (180, 240, 270) bleiben aus einem zweiten Grund
nahe null: Dort ist schlicht kein Licht, mit dem eine Oberfläche eine Kante
werfen könnte, und das ist richtig so.

Was sich wirklich geändert hat, steht nicht in dieser Kennzahl, sondern im Bild:
`c-krater` und `e-boden` zeigen jetzt einen Maßstab zwischen Korn und Brocken,
an dem das Auge Entfernung abliest. Genau das war der ursprüngliche Prüferbefund
hinter der Zahl.

### Die Lehren dieser Runde

* **Wenn eine Kennzahl nach mehr Kontrast verlangt, als das Bild verträgt, ist
  die Kennzahl am Ende ihrer Zuständigkeit.** Man sagt das und hört auf, sie zu
  füttern — man erfindet keine dritte Auslegung.
* **Ein Detail, das ein Ding sein soll, braucht einen Rand.** Vier Maßstäbe
  Rauschen übereinander bleiben Rauschen; eine Scheibe mit Kante liest sofort
  als Kiesel.
* **Ein Vorzeichen prüft man dort, wo das Licht eine Richtung hat.** Bei
  Gegenlicht sehen Kuppe und Mulde gleich aus, und die Kamera, an der es am
  ehesten auffällt, ist die falsche zum Entscheiden.

---

## Die Werkzeuge auf dem Planeten: vier Fehler in einem Bezugssystem

Gemeldet wurden zwei Dinge aus dem Betrieb: *„Das Whiteboard wird bei Bewegung
mitgezogen"* und *„Kärtchen verschwinden, wenn man sie verschieben möchte."*
Beide stimmen, beide sind Folgen derselben Sache, und beim Nachmessen kamen zwei
weitere heraus, die noch niemand gemeldet hatte.

Neu dafür: `tools/werkzeuge.mjs`.

### Der gemeinsame Grund

Auf einer Ebene ist die lokale Lage eines Objekts in der Szene gleich seiner
Weltlage — die Szene steht im Ursprung und ist nicht gedreht. Im Nachthimmel ist
der Elter von Karten, Zonen und (seit dieser Runde) Werkzeugen die **Weltgruppe
des Planeten**: Sie steht zwar auch im Ursprung, trägt aber die Drehung des
Rundgangs, und ihre Kinder liegen 25 m vom Mittelpunkt entfernt. Jede Zeile, die
`group.position` neben einen Weltwert stellt, ist damit falsch — und zwar erst,
**nachdem der Nutzer losgegangen ist**. Steht die Welt noch unverdreht, stimmt
alles zufällig.

### 1. Die Tafel klebte am Nutzer

Sie hing an der Szene, mit der ausdrücklichen Begründung, sie sei „ein Werkzeug,
kein Gegenstand der Welt". Auf den vier ortsfesten Umgebungen ist das folgenlos:
Man geht von ihr weg. Auf dem Planeten steht der Nutzer **still** — was an der
Szene hängt, steht damit für immer vor ihm.

| | vorher | jetzt |
| --- | --- | --- |
| Abstand nach einer Vierteldrehung (39,3 m Bogen) | **0,00 m** | 38,07 m |

Die Tafel bekommt dieselbe Heimat wie Karten und Zonen, dazu `frame: 'planet'`
im Stand. Verloren geht sie nicht: Der Knopf blendet sie aus, und beim nächsten
Einblenden stellt `placeInFront` sie wieder vor den Nutzer. **Die Zeituhr hat
dasselbe Problem und bekommt dieselbe Behandlung** — gemeldet war sie nicht, sie
verhält sich aber Zeile für Zeile gleich.

### 2. Der Mauszug warf die Karte quer über den Planeten

`_onPointerDown` spannte die Ziehebene durch `group.position` — **lokal** — und
bildete den Versatz gegen `hit.point` aus dem Raycast — **Welt**.

| | vorher | jetzt |
| --- | --- | --- |
| Ein Zug über 40 Bildpunkte, Welt um 40° gedreht | **18,95 m** | 0,11 m |

Der Zug rechnet jetzt durchgehend in Weltkoordinaten und schreibt erst beim
Setzen über `parent.worldToLocal` zurück. Derselbe Griff steckt in
`_beginneZug`/`_fuehreZug`, damit Karte und Griffleiste ihn teilen.

**Dieselbe Verwechslung stand dreimal weiter im Code**, und alle drei Stellen
sind mitgeprüft:

* Der Vergleich am Ende des Zugs (`position.distanceToSquared(start)`) — lokal
  gegen Welt. Er meldete auf dem Planeten **jede Berührung** als Verschiebung an
  den Undo-Verlauf.
* Dasselbe im XR-Pfad in `_onSelectEnd`, zweimal.
* `layoutFlow` schrieb die aus `camPos` gebaute Weltlage blank in
  `node.group.position` — das Flussdiagramm lag nach ein paar Schritten quer
  über dem Planeten.

### 3. `inHeimat` verändert seinen Vektor, und zwei Aufrufer wussten es nicht

`worldToLocal` rechnet **an Ort und Stelle**. `Zone.placeInFront` gab deshalb
anschließend `pos.y` als Weltziel an `lookAt` — und da stand längst die lokale
Höhe. **Das war schon in Betrieb**, es hat nur niemand gemeldet, weil eine Zone
selten aufgestellt wird, nachdem man gelaufen ist. Beim Bauen der Tafel habe ich
denselben Fehler frisch danebengestellt.

Belegt mit einer Gegenprobe: den Fix im Timer zurückgenommen und gemessen —
das Panel stand **77,5 Grad** gegen die Senkrechte, also fast auf der Seite.
`cards.js` macht es an derselben Stelle richtig; dort steht die Welthöhe in
einer eigenen Variablen.

### 4. Ein Budget, das plötzlich um das Neunfache überschritten war

Nach dem Umhängen meldete `tools/verify.mjs` **73,82 MB** Texturspeicher gegen
ein Budget von 60. Aufgeschlüsselt:

| Teilbaum | MB |
| --- | --- |
| whiteboard | 58,85 |
| timer | 6,96 |
| nacht-welt-boden | 2,67 |
| nacht-himmel | 4,00 |
| nacht-himmel-fest | 1,33 |

**Die Umgebung hatte sich um kein Byte geändert** — 8,00 MB vorher, 8,00 MB
nachher. Geändert hatte sich der Elter eines Werkzeugs, und das Messwerkzeug lief
blind durch `env-night` hindurch. `tools/measure.mjs` überspringt jetzt Teilbäume
mit `userData.nichtUmgebung` (Tafel, Uhr, Karten, Zonen) und weist sie **getrennt
aus, statt sie zu verschweigen**.

Nebenbefund, den diese Aufschlüsselung erst sichtbar gemacht hat: **Die Tafel
allein belegt 58,85 MB Textur.** Das gilt in allen fünf Umgebungen gleichermaßen
und ist nicht Gegenstand dieser Runde, aber auf einer Quest 3 ist es echter
Speicher. Notiert.

### Nachweis

`tools/werkzeuge.mjs` prüft vier Dinge, je einmal auf dem Planeten und einmal im
Zen-Garten als Gegenprobe: was liegen bleibt, ob ein Mauszug zieht statt springt,
ob Uhr, Zone und Flussknoten senkrecht und in Reichweite stehen, und ob die Tafel
das Speichern übersteht. Alle acht Prüfungen grün.

Die acht Prüfbilder des Nachthimmels sind gegen den Stand davor **bitgleich**
(Δmax 0) — es war eine Änderung am Bezugssystem, nicht am Bild. Regression der
anderen vier im bekannten Rauschband, Konsole ohne Errors und Warnings, Budget
21 Draw-Calls / 344 186 Dreiecke / 8,00 MB.

### Die Lehren dieser Runde

* **Ein Fehler, der erst nach dem Losgehen auftritt, wird von einem Test im
  Ruhezustand nie gefunden.** Der erste Anlauf dieses Werkzeugs hat die
  Weltdrehung vorher zurückgesetzt, damit der Gegenstand im Bild steht — und
  damit genau die Verwechslung ausgeblendet, die er suchen sollte. Er meldete
  „alles in Ordnung", während ein Zug die Karte 19 m weit warf.
* **Ein Prüfstand, der die Kamera festhält, während sich die Welt dreht, erfindet
  Fehler.** Ein Bild zeigte den Planeten als dünne Scheibe mit Sternen darunter.
  Das war die eingefrorene Augenhöhe des Werkzeugs, nicht die Szene.
* **Ein Helfer, der seinen Eingabewert verändert, ist eine Falle mit Ansage.**
  `inHeimat` tut das, weil `cards.js` sich darauf verlässt. Zwei andere Aufrufer
  haben es nicht gewusst. Jetzt steht es im Kommentar der Funktion, mit beiden
  Namen.
* **Wenn eine Budgetzahl plötzlich springt, ohne dass etwas gebaut wurde, misst
  man erst das Messwerkzeug.** 73,82 statt 8,00 MB sahen nach einem groben
  Fehler aus und waren eine Frage der Zuordnung.
* **`Object3D.traverse` kann keinen Teilbaum auslassen.** Ein `return` im
  Rückruf überspringt den Rest des Rückrufs, nicht die Kinder. Wer einen Zweig
  wirklich überspringen will, schreibt seine eigene Rekursion.

### Der Prüfer ist in dieser Runde ausgefallen

Er wurde frisch beauftragt (claude-opus-5, hoher Aufwand, ausdrücklich mit dem
Hinweis, dass es eine Nachtszene ist) und ist nach wenigen Schritten mit einem
API-Fehler abgebrochen: monatliches Ausgabenlimit erreicht. Sein letzter Satz
war eine Ankündigung, keine Feststellung; es liegt **kein Befund** von ihm vor.

**Deshalb steht hier nicht „bestanden".** An der eigenen Arbeit ist man nicht
unbefangen, und was folgt, ist Selbstprüfung, kein Urteil.

Selbst angesehen habe ich die acht festen Kameras. Was dabei auffiel:

* **`d-orbit` hat keinen Terminator mehr.** Die sichtbare Halbkugel ist
  durchgehend beleuchtet. Das ist die Folge des Wunsches „der Planet soll von
  allen Seiten beleuchtet sein" und insofern gewollt — es kostet aber die
  Modellierung des Körpers im Raum, und die Kamera trägt den Terminator noch im
  Titel. Der Hintergrund dieser Kamera ist ohnehin irreführend: Die Himmelskuppe
  ist am Spieler verankert, und diese Kamera steht außerhalb von ihr.
* **Die Streifen in der Milchstraße sind gemessen und praktisch unsichtbar.** Im
  6-fachen Ausschnitt sah es nach regelmäßigen Diagonalen aus. Senkrecht zum
  Band abgetastet und hochpassgefiltert: **2,43 Stufen von 255** bei rund 6,7 px
  Periode. Das ist die 8-Bit-Quantisierung eines weichen Verlaufs, kein
  Texturfehler. Die offene Frage „Himmelsbänderung" bleibt damit offen, aber sie
  ist kleiner, als sie im Ausschnitt aussieht.
* **Der rötliche Halbmond liest als Halbmond**, mit sauberem Terminator und
  deutlich anderer Farbe als der weiße. Bei rund 42 px Durchmesser ist von den
  170 Kratern wenig zu sehen; das ist eine Frage der Größe, nicht der Machart.
* Die Peitschenantenne des Sputnik als 0,7 px breite Linie steht weiter offen
  (siehe oben).

---

## „Werkzeuge ordnen" — ein Knopf, zwei Probleme

Gewünscht war ein Knopf, der alle offenen Werkzeuge vor einem ausrichtet. Er
löst zwei Dinge auf einmal, und das zweite war vorher nicht als Problem benannt:

* **Auf dem Planeten bleiben die Werkzeuge liegen**, seit sie eine Heimat haben.
  Das ist gewollt — aber wer eine halbe Runde gelaufen ist, hat sie hinter sich,
  und der einzige Weg zurück war, sie aus- und wieder einzublenden. Gemessen:
  Nach einer halben Runde stand die Tafel **53,8 m** entfernt, nach dem Knopf
  1,90 m.
* **`placeInFront` setzt jedes Panel für sich auf dieselbe Stelle.** Tafel
  (1,92 m breit) und Zeitgeber (0,66 m) standen dadurch übereinander: gemessen
  **25,0° Winkelabstand, wo 40,6° nötig gewesen wären** — die Uhr verschwand
  hinter der Tafel, sobald beide offen waren. Nach dem Ordnen 40,3° bei 36,6°
  nötigen.

### Wie angeordnet wird

Auf einem Bogen um den Nutzer. Ein Panel der Breite *b* im Abstand *r* nimmt den
Winkel 2·atan(*b*/2*r*) ein; das breiteste steht auf der Blickachse, die übrigen
wechselweise rechts und links daneben.

**Nicht die ganze Reihe zentriert** — das war der erste Anlauf, und er stellte
die Tafel elf Grad neben die Achse. Man arbeitet nicht auf etwas, das schief vor
einem hängt; der Zeitgeber darf seitlich stehen, den schaut man an.

Der Abstand ist nicht fest, sondern wächst in Schritten von 10 cm, bis alles in
80° Blickfeld passt (höchstens 3,2 m). **Auch hier ein Fehler, der erst beim
Nachrechnen auffiel:** Die Prüfung rechnete die Summe der Breiten als
*zentrierten* Block — 77° —, während die gebaute Anordnung von −29,5° bis +55,5°
reichte, also 85°. Geprüft wurde etwas anderes, als gebaut wurde, und der
Zeitgeber stand am Bildrand. Jetzt rechnet dieselbe Funktion die wirkliche
Spanne, und der Abstand landet bei 1,90 m statt 1,70.

### Eine Stelle statt drei

Tafel und Zeitgeber mussten beide zweierlei richtig machen: die Weltlage in die
Heimat umrechnen **und** `lookAt` trotzdem ein Weltziel geben. Daran ist es in
der Runde davor zweimal gescheitert. Mit dem Knopf wäre es eine dritte Stelle
gewesen — deshalb steht es jetzt einmal in `heimat.js` als `stelleAn()`, mit
einer Kopie des Vektors statt einer Falle.

### Nachweis

`tools/werkzeuge.mjs` prüft es als Schritt 5, je einmal auf dem Planeten und
einmal im Zen-Garten: dass sich die Panels vorher wirklich überlappten, dass sie
es nachher nicht mehr tun, dass beide in Reichweite stehen, senkrecht stehen und
den Nutzer anschauen (Neigung 0,0°, Schielwinkel 0,0°).

Der Knopf sitzt am Desktop unter „Board" und in VR im Handgelenkmenü unter
„Board". Die acht Prüfbilder sind unverändert (Δmax 0), Regression im bekannten
Band, Budget 21 Draw-Calls / 344 186 Dreiecke / 8,00 MB, Konsole sauber.

**Nicht enthalten:** Karten und Zonen. Die sind Inhalt, kein Werkzeug — auf dem
Planeten ist ihr Liegenbleiben der Zweck der ganzen Umgebung, und eine Zone vor
den Nutzer zu holen risse sie von den Karten los, die sie zusammenfasst.

---

## „Alles ordnen": Karten und Zonen kommen mit

Der Knopf aus der Runde davor holte nur Tafel und Zeitgeber. Gewünscht war er
für **alles** — Karten und Zonen eingeschlossen. Das ist mehr als eine erweiterte
Liste, aus zwei Gründen.

### Zonen wissen nicht, welche Karten zu ihnen gehören

Es gibt keine Mitgliedschaft, nur Nähe: Eine Zone ist ein Rahmen, davor liegen
Karten. Wer die Rahmen einsammelt und die Karten getrennt neu verteilt, **löst
mit einem Klick jede Gruppierung auf**, die der Nutzer von Hand gebaut hat.

Die einzige Definition von „gehört dazu", die es gibt, steht jetzt als
`Zone.umfasst(weltPunkt)` in der Zone selbst: der Streifen vor dem Rahmen, im
Koordinatensystem der Zone geprüft, nach vorn großzügiger als nach hinten (0,6
gegen 0,25 m) — Karten legt man vor einen Rahmen, nicht dahinter. Die zugehörigen
Karten werden **starr mitgeführt**, über die Matrix relativ zur Zone. Gemessen:
Ihre Lage zur Zone ändert sich um **0,000 mm**.

Bei überlappenden Rahmen gewinnt die **nächste** Zone, nicht die zuerst angelegte
— sonst bekäme der ältere Rahmen auch die Karten, die sichtbar vor dem anderen
liegen.

### Zwei Ebenen, nicht eine Reihe

„Nebeneinander" kann nicht heißen, eine Karte von 0,32 m neben eine Tafel von
1,92 m zu stellen; bei dreißig Karten wäre die Reihe 12 m lang. Die großen
Flächen bilden deshalb eine Wand, die freien Karten stehen in Reihen zu sechst
davor.

**Der erste Anlauf hat sie davor gestellt und damit verdeckt.** Im Bild lagen
„Freie Idee 1, 2, 3, 5" quer über der Tafel und beiden Zonen: Zwei Ebenen in der
Tiefe reichen nicht, sie müssen sich auch in der Höhe trennen. Die Wand steigt
jetzt um 0,22 m je nötiger Kartenreihe, und die Karten beginnen unter der
Unterkante der höchsten Fläche.

### Wie breit die Wand werden darf

Der Wert stand auf 80 Grad. Mit Tafel, zwei Zonen und Zeitgeber schob das den
ganzen Aufbau auf **3,10 m** zurück — und die Tafel ist das, worauf man zeichnet.

Die Kamera der App hat 70 Grad senkrecht, im Format 16:9 also **102 Grad
waagerecht**. 100 Grad Aufbau passt damit rechnerisch gerade eben und steht
praktisch am Bildrand, wo die Perspektive die Panels stark verzerrt. Bei 90 Grad
bleibt Rand, und die Tafel steht bei 2,70 statt 3,10 m.

**Das ist eine Obergrenze, keine Zusage.** Reichen die 3,0 m Höchstabstand nicht
— vier Flächen ergeben zusammen 5,58 m Breite —, legt sich der Aufbau um den
Nutzer, und die äußeren Flächen liegen hinter dem Bildrand, bis er den Kopf
dreht. Das ist Geometrie, nicht Nachlässigkeit: Vier Flächen dieser Größe passen
nicht gleichzeitig nah und in ein Blickfeld.

### Rückgängig machbar, und das ist kein Beiwerk

Auf dem Planeten sind die abgelegten Karten eine begehbare Gedächtnislandkarte.
Ein Klick auf diesen Knopf holt sie **alle** ein. Die Aktion schreibt deshalb
einen Verlaufseintrag; Strg+Z stellt die Landkarte wieder her, und die
Statuszeile sagt das auch.

### Nachweis

`tools/werkzeuge.mjs` prüft es als Schritte 5 und 6, je einmal auf dem Planeten
und einmal im Zen-Garten: dass Tafel und Uhr sich vorher überlappten (25,0° bei
40,6° nötigen) und nachher nicht mehr, dass alle drei Karten vor einem Rahmen
erkannt und zwei weit entfernte nicht zugeordnet werden, dass die Zonenkarten
ihre Lage auf 0,000 mm behalten und die freien Karten danach in Reichweite
stehen.

Acht Prüfbilder unverändert (Δmax 0), Regression im bekannten Band, Budget
21 Draw-Calls / 344 186 Dreiecke / 8,00 MB, Konsole sauber.

### Die Lehren dieser Runde

* **Wo es keine Datenstruktur gibt, gibt es trotzdem eine Bedeutung.** „Diese
  Karten gehören in diese Zone" steht nirgends im Modell — es steht in der
  Anordnung, die der Nutzer gebaut hat. Eine Funktion, die aufräumt, muss das
  respektieren, sonst räumt sie Arbeit weg.
* **Zwei Ebenen in der Tiefe sind keine zwei Ebenen im Bild.** Karten bei 1,3 m
  und Panels bei 2,4 m verdecken sich trotzdem, weil beide auf Augenhöhe stehen.
* **Eine Zahl wie „passt ins Blickfeld" braucht das Blickfeld.** 70 Grad
  senkrecht sind bei 16:9 102 waagerecht — ohne diese Umrechnung wäre die
  Grenze geraten gewesen.

---

## Ein Himmel, ein Muster — die Sondersterne sind weg

Gemeldet: *„Ich verstehe nicht, wieso die Sterne unterschiedlich sind. Alle
Sterne sollen das gleiche Muster haben, also kleine und große und manche
leuchtend."*

Das war keine Einbildung, sondern gebaut — und zwar von mir, auf einen früheren
Wunsch hin: *„die Sterne auf der Seite, wo der Mond nicht scheint"* sollten
gleich hell sein. Ich habe das wörtlich umgesetzt und damit auf der halben
Himmelskugel genau das abgeschaltet, was einen Sternhimmel ausmacht.

### Der Befund

Neu: `tools/sterne-muster.mjs` — die Verteilung von Größe und Helligkeit,
gestaffelt nach dem Winkel zum Mond.

| Band vom Mond | n | Streuung der Größe | Streuung der Helligkeit |
| --- | --- | --- | --- |
| 0–36° | 553 | 0,232 | 0,187 |
| 36–72° | 1267 | 0,221 | 0,172 |
| 72–108° | 1440 | 0,174 | 0,133 |
| 108–144° | 1326 | **0,011** | **0,008** |
| 144–180° | 614 | **0,000** | **0,000** |

**Sechshundertvierzehn Sterne mit einer Streuung von exakt null** — alle Größe
0,60, alle Helligkeit 0,62. Im Bild dasselbe: Die Streuung der Fleckenfläche lag
auf der Gegenseite bei 5,73 gegen 25,43 auf der Mondseite.

Verantwortlich war ein je Stern eingebackener Anteil `gleich`, der über
`smoothstep(0.30, −0.45, zumMond)` von null auf eins stieg und drei Dinge auf
einmal plattdrückte: Größe, Helligkeit samt Farbnormierung, und das Flimmern.

### Die Änderung

Die Sonderbehandlung ist ersatzlos weg — Attribut, Shader-Zweig und alle drei
Sonderfälle. Es gilt überall dieselbe Verteilung `pow(zufall, 2,6)`: viele
schwache, wenige helle. **Der Mond blendet die schwachen in seiner Nähe ohnehin
aus; dafür braucht es keine zweite Regel im Code, das macht sein Hof von
selbst.**

Ein Faktor von 1,18 auf die Helligkeit gleicht die weggefallene Anhebung aus. Er
wirkt auf **alle** Sterne gleich und lässt das Muster deshalb unangetastet — das
ist der Unterschied zwischen einer Verstärkung und einer Abflachung.

### Was daraus geworden ist

| Band vom Mond | Streuung der Größe | Streuung der Helligkeit |
| --- | --- | --- |
| 0–36° | 0,232 | 0,220 |
| 36–72° | 0,221 | 0,203 |
| 72–108° | 0,230 | 0,215 |
| 108–144° | 0,228 | 0,212 |
| 144–180° | 0,231 | 0,209 |

Verhältnis größte zu kleinste Streuung: **1,0:1** bei der Größe, 1,1:1 bei der
Helligkeit. Vorher war es 231 760:1.

Und die Sorge, die zum ersten Wunsch geführt hatte — auf der Gegenseite sei zu
wenig zu sehen — ist gemessen unbegründet:

| Gegenseite (Station 180) | vorher | jetzt |
| --- | --- | --- |
| gezählte Sterne im Himmelsteil | 760 | **775** |
| Streuung der Fleckenfläche | 5,73 | **7,20** |
| Streuung der Spitzenhelligkeit | 69,6 | **76,8** |

Es sind **mehr** Sterne sichtbar als vorher, nicht weniger. Was schrumpft, ist
die belegte Fläche (6703 auf 4838 px) — die gleich großen Scheiben von 0,60 sind
weg, und das war der Zweck.

Nachtseite im Rundgang unverändert (Tonwertspanne 11,9 bis 26,8), Regression im
bekannten Band, Budget 21 Draw-Calls / 344 186 Dreiecke / 8,00 MB, Konsole
sauber.

### Die Lehre dieser Runde

**Einen Wunsch wörtlich zu erfüllen kann heißen, ihn zu verfehlen.** „Gleich
hell" hieß „alle sichtbar", nicht „alle identisch". Der Unterschied zwischen
einer Verstärkung (jeder Stern mal 1,18) und einer Abflachung (jeder Stern auf
0,62) ist genau der zwischen beidem — und er war an einer einzigen Zeile
abzulesen, wenn man gefragt hätte, was mit der Streuung passiert.

---

## Punkt 1 der offenen Liste: die Sputnik-Antenne flimmerte

Notiert war sie als „schnurgerade dunkle Linie von einem Bildpunkt Breite quer
über den Sand". Nachgemessen an `a-augenhoehe`, Profil senkrecht zur Linie:

| | vorher | jetzt |
| --- | --- | --- |
| Halbwertsbreite | **1 px** | 2 px |
| Kontrast zum Umfeld | 32,7 Stufen | 31,4 Stufen |
| Profil bei x = 820 | 109 109 **126 75** 112 | 109 109 **77 80** 112 |

Das Aufschlussreiche steht im Profil: Vorher lag neben dem dunklen Bildpunkt ein
**hellerer als das Umfeld** (126 gegen 108). Das ist kein Schatten, das ist
Unterabtastung — die Kante fällt zwischen zwei Abtastpunkte, und ein
Bildpunkt bekommt das beleuchtete Metall, der nächste die Schattenseite. Bei
jeder Kopfbewegung wechseln sie. Jetzt stehen dort zwei benachbarte dunkle
Bildpunkte, und der Überschwinger ist weg.

**Meine frühere Notiz war obendrein falsch:** Ich hatte „7 mm
Wurzeldurchmesser" geschrieben — 0,007 ist der **Radius**, der Durchmesser war
14 mm. Die Rechnung stimmte trotzdem nicht: 14 mm auf 6 m sind 2,33 mrad, und
die Kamera löst 70 Grad auf 720 Zeilen auf, also 1,70 mrad je Bildpunkt — 1,4
Bildpunkte, gemessen 1.

### Warum Verdicken und kein Shader

Der saubere Weg wäre, die Breite im Bildraum zu erzwingen (die Kuppe im
Vertexschritt aufweiten, bis sie zwei Bildpunkte deckt). Das kostet ein eigenes
Material, einen zusätzlichen Draw-Call und ein Attribut, das
`verschmelzeObjekte` durch `angleichen` hindurchschmuggeln müsste.

Dagegen steht eine Rechnung: Der Sputnik ist wegen des 8,9-m-Horizonts nur aus
**1 bis 12 m** überhaupt sichtbar. Bei 22 mm Durchmesser sind das 1,8
Bildpunkte auf 7 m und noch 1,1 auf 12 m. **Und bei ein bis zwei Bildpunkten
Breite kann niemand einen Durchmesser beurteilen** — man sieht nur, ob es
flimmert. Der Shader wäre teurer und im Ergebnis nicht zu unterscheiden.

Dass die Antenne damit siebenfach zu dick ist (das Original hatte 3,2 mm), ist
der Preis. Er ist unsichtbar.

Budget unverändert (21 Draw-Calls, 344 186 Dreiecke, 8,00 MB) — dieselbe
Dreieckszahl, nur dicker. `c-krater`, `e-boden` und `h-mond-rot` sind bitgleich;
geändert haben sich nur die beiden Bilder, in denen der Sputnik steht.

---

## Punkt 2 der offenen Liste: 33 MB Texturspeicher, die niemand sieht

Aufgeschlüsselt belegten Tafel und Zeituhr **65,75 MB**, davon drei Texturen
allein 54,5:

| MB | Größe | was es ist |
| --- | --- | --- |
| 23,76 | 2758×1694 | **Rückwand** der Tafel — eine einfarbige Fläche mit kaum sichtbarem Rand, die man nur von hinten sieht |
| 16,31 | 2304×1392 | die **Zeichenfläche** |
| 14,43 | 2061×1377 | **Rahmen mit Schlagschatten** — Inhalt ist ein Weichzeichner über 70 Bildpunkte |

Rückwand und Rahmen laufen jetzt auf 400 statt 1400 bzw. 900 Bildpunkten je
Meter. **Damit die Weltgestalt gleich bleibt, skalieren die Formkonstanten mit**
— Eckradius, Randbreite, Weichzeichnerbreite und Schattenversatz. In
`makeRoundedPanel` ist der Faktor bei der Vorgabe 1400 genau eins, alle
bisherigen Aufrufer (Handgelenkmenü, Zeituhr, Werkzeugleiste) bekommen also
bitgleich dieselbe Textur wie vorher.

| | vorher | jetzt |
| --- | --- | --- |
| Tafel und Uhr zusammen | 65,75 MB | **32,41 MB** |
| Rückwand | 23,76 | 1,94 |
| Rahmen | 14,43 | 2,85 |

Im Bild aus 1,15 m Abstand: 0,73 % der Bildpunkte weichen um ≥ 2 ab, 0,015 % um
≥ 8, größte Abweichung 36 am äußersten Rand des Schlagschattens. Ecken, Rand und
Werkzeugleiste sind unverändert scharf.

**Die Zeichenfläche bleibt, wie sie ist.** 2304 Bildpunkte auf 1,92 m sind bei
einer Quest 3 (rund 1215 Bildpunkte Bildbreite für die Tafel auf 1,7 m) knapp
das Doppelte der Bildauflösung — das ist Reserve für den Fall, dass der Nutzer
die Tafel vergrößert, und es ist die **einzige** der drei Texturen, deren
Auflösung wirklich benutzt wird. Sie zu halbieren hieße außerdem, alle
Strichbreiten mitzuskalieren; das ist eine Verhaltensänderung und kein
Aufräumen.

Umgebungsbudget unverändert bei 8,00 MB, 21 Draw-Calls, 344 186 Dreiecken;
`tools/werkzeuge.mjs` grün, Regression im bekannten Band.

---

## Der Prüfer war da — und sein schwerster Befund hatte die falsche Ursache

Diesmal ist er durchgelaufen. Sein Befund 1, „auffällig": *„Sterne stehen auf
dem Boden"* — 366 farbneutrale Lichtpunkte auf rotem Regolith am Kamm von
`rund-300`, mit Einzelnachweis: bei (600,397) steht (110,106,107) zwischen zwei
Bodenpixeln (29,11,6).

**Der Befund stimmt, die Ursache nicht.** Nachgemessen:

| Test | Pixel (600,397) |
| --- | --- |
| unverändert | (110,106,107) |
| ohne Sternfeld, Staub, Staubteufel, Meteor, Höfe, Fetzen, Kuppel, Monde | unverändert |
| **ohne `nacht-planet`** | **(23,26,28)** |
| ohne gerichtetes Licht | (17,8,5) |
| `roughness = 1`, ohne Rauheitskarte | (115,112,113) |

Der Boden leuchtet dort selbst. Kein Stern, und auch kein Glanzlicht im
naheliegenden Sinn — Rauheit 1 ändert nichts.

Neu dafür: `tools/funkeln.mjs`. Es zählt, was ein Mensch als Fehler sieht: ein
Bildpunkt, der deutlich heller ist als alle vier Nachbarn, dabei farbneutral,
während seine Umgebung rot ist. **288 solcher Punkte über die zwölf Stationen**,
die hellsten voll ausgebrannt bei L = 255.

### Drei Fehlversuche, jeder von der Messung widerlegt

1. **Nach Fußabdruck ausblenden.** Annahme: Am Horizont sieht man den Boden
   streifend, ein Bildpunkt deckt ein Vielfaches der Texelbreite ab. Ergebnis:
   288 → 288. Die Flächen dort werden gar nicht streifend gesehen.
2. **Nach abgewandter Fläche dämpfen.** Annahme: Die Fläche steht im
   Eigenschatten, und nur eine Beule kippt die Normale ins Licht. Ergebnis:
   288 → 288. Sie ist dem Mond zugewandt.
3. **Den Überschuss deckeln** — eine Beule darf nicht viel mehr Licht bekommen
   als die Fläche, auf der sie sitzt. Erster Anlauf in Weltkoordinaten: ohne
   Wirkung, weil `MOND_RICHTUNG` in **Planetenkoordinaten** steht und dazwischen
   die Drehung des Rundgangs liegt — an Station 300 also 300 Grad. Zweiter
   Anlauf im Sichtraum, korrekt gerechnet: 136 → 135.

Auch die Zerlegung nach Störtermen führte nicht weiter: Rippel aus macht aus 136
Punkten 133, Korn aus lässt 136 stehen, Kiesel aus 118, Kies aus 131 — **alle
vier aus macht 7.** Kein einzelner Term, sie stapeln sich.

### Die Ursache

`MeshStandardMaterial` gibt jedem Dielektrikum einen festen Spiegelanteil von
F0 = 0,04, und die **Fresnel-Kante zieht ihn bei streifendem Blick gegen eins**.
Das ist der Grund, warum `roughness = 1` nichts half: Der Lappen wird breiter,
aber er verschwindet nicht, und seine Richtungsabhängigkeit läuft über den
Halbvektor — dort schlägt eine kleine Normalenänderung viel stärker durch als im
diffusen Anteil.

Zwei Zeilen hinter dem Beleuchtungsschritt nehmen ihn weg. **Mondstaub ist ein
poröses Pulver und hat keinen Spiegellappen** — das ist keine Notlösung, sondern
das richtige Material.

| | vorher | jetzt |
| --- | --- | --- |
| Summe über zwölf Stationen | 288 | **98** |
| `rund-300` (schlimmste) | 136 | **6** |
| `rund-270` | 66 | **6** |

Die verbliebenen 48 in `rund-060` stehen im hellsten Bild des Rundgangs
(Mittel 31, p95 108) und sind beleuchtete Felsflächen, kein Funkeln.

Im Bild ändert sich sonst nichts: Rippel, Kiesel und Brocken stehen unverändert.
Budget 21 Draw-Calls / 344 186 Dreiecke / 8,00 MB, Regression im bekannten Band,
Konsole sauber.

### Die Lehre dieser Runde

**Ein Befund kann stimmen und seine Begründung trotzdem falsch sein — auch die
eigene, dreimal hintereinander.** Der Prüfer sagte „Sterne", ich sagte nacheinander
„Fußabdruck", „Eigenschatten" und „Ausreißerbeule". Vier Erklärungen, vier Mal
widerlegt, und jedes Mal war es dieselbe Messung, die es entschieden hat. Wer
nach der ersten Vermutung baut, baut drei Mal umsonst.

---

## Der leuchtende Saum: das Vorzeichen des Schatten-Bias

Befund 3 des Prüfers, „auffällig": *„Leuchtender Saum unter jedem Brocken […]
Die Steine wirken dadurch aufgeklebt statt eingebettet."*

Gemessen an Station 210 — dort steht der Mond **62,9 Grad unter dem Horizont**,
es kann kein Strahl hinkommen, der Planet steht dazwischen:

| | px | hellster Wert |
| --- | --- | --- |
| Saum am größten Brocken | 187 | (168,118,98), L = 127 |
| drei weitere Brocken | 160 / 141 / 58 | L = 99…134 |
| Boden ringsum | — | L = 13 |

### Was es nicht war

Der Reihe nach ausgeschlossen, jedes Mal durch Ausblenden oder Nullsetzen:

| Verdacht | Ergebnis |
| --- | --- |
| Kontaktverdunklung | unverändert (der Saum wird sogar 3 px größer) |
| Frost auf den Brocken | unverändert |
| zweites Mondlicht (rot) | unverändert |
| Hemisphären- / Umgebungslicht | 2 Stufen dunkler |
| Fremdlichter der anderen vier Umgebungen | unsichtbar, three überspringt sie |
| Auflösung der Schattenkarte 2048 → 4096 | 187 → **191** |
| Normal-Bias 0,025 → 0,005 → 0 | 187 → 145 → **132** |

Und was es sicher **war**: Mondlicht auf null lässt nichts übrig; Schattenwurf
ganz aus macht aus 187 Punkten **643**. Die Schattenkarte arbeitete also, hielt
aber diesen einen Streifen nicht.

### Das Vorzeichen

In three wird `shadow.bias` auf die Tiefe im Schattenraum **addiert**: negativ
heißt näher am Licht, also **weniger** Schatten. Der Wert stand auf −0,0004,
gewählt gegen Schattenakne am Terminator. An der Unterkante eines Brockens steht
die Fläche fast tangential zum Licht; dort schob dieselbe kleine Verschiebung
eine ganze Schicht aus dem Schatten heraus, und weil sie tangential liegt, war
das Ergebnis ein **voll beleuchteter Streifen** statt einer Aufhellung.

Gegenprobe in beide Richtungen: −0,002 macht aus 187 Punkten **610**, also fast
so viel wie Schatten ganz aus. **+0,0005 lässt vom Saum nichts übrig.**

| Station | helle Flecken im Gelände, vorher → jetzt |
| --- | --- |
| rund-210 | 643 px → **97 px** (nur noch Sterne) |
| rund-180 | → 0 |
| rund-270 | → 54 px |

Die Schatten auf der Mondseite bleiben: `c-krater` zeigt die Schlagschatten der
Brocken und die Kontaktverdunklung unverändert, kein Ablösen vom Fuß.

Budget 21 Draw-Calls / 344 186 Dreiecke / 8,00 MB, Regression im bekannten Band,
Konsole sauber.

### Noch offen aus demselben Befundsatz

Der „brennende Findling" in `rund-150` (7033 px, L = 172) bleibt unverändert —
auch bei abgeschaltetem Schattenwurf. Er hat also eine andere Ursache. An
Station 150 steht der Mond bei −3,3 Grad, also unmittelbar am Terminator; ein
aufragender Block kann dort mit seiner Oberkante durchaus noch im Licht stehen,
während der Boden schon dunkel ist. Ob das der Fall ist oder ein zweiter Fehler,
ist **nicht** geklärt.

### Die Lehre dieser Runde

**Ein Parameter, dessen Vorzeichen man nicht geprüft hat, ist ein Parameter, den
man nicht kennt.** Der Bias stand seit Paket 1 auf −0,0004, mit einer Begründung
im Kommentar, die nur von Akne sprach. Dass derselbe Wert an tangentialen
Flächen einen leuchtenden Streifen erzeugt, stand nirgends — und der Weg dorthin
führte über sieben ausgeschlossene Verdächtige. Die Gegenprobe in **beide**
Richtungen (−0,002 und +0,0005) hätte am Anfang stehen können statt am Ende.

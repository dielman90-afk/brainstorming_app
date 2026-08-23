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

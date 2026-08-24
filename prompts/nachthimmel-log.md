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
* **Eine Kugel hat immer einen Terminator.** Alles, was auf der Platte unter
  30° Lichteinfall getestet war — Schattenbias, Kontaktverdunklung, aufgemalte
  Staubfahnen —, sieht sich hier einmal je Rundgang streifendem Licht gegenüber.

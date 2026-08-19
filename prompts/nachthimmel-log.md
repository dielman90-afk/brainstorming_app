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

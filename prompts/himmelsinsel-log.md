# 🏝 Himmelsinsel — Protokoll

Derselbe Auftrag wie beim 🌌 Nachthimmel, dieselben Regeln: rein prozedural,
keine neuen Laufzeit-Abhängigkeiten, keine Regressionen, Budget
(Draw-Calls ≤ 120, Dreiecke ≤ 350 000, Texturspeicher ≤ 60 MB), Instancing und
Verschmelzung Pflicht, Harness nach `tools/`, ein Commit je bestandenem Paket,
Befunde mit Koordinate und Zahl statt Eindrücken.

**Eine Regel ist umzudeuten.** „Es bleibt Nacht" hieß dort: nicht heller machen.
Hier heißt sie **„es bleibt Tag"** — eine stilisierte, helle Schwebeinsel unter
blauem Himmel. Die Aufgabe ist nicht, sie dramatisch zu machen, sondern ihr
Modulation zu geben, wo heute Farbfelder stehen.

---

## Paket 0: Der Prüfstand — die Insel ist jetzt reproduzierbar

Seit drei Aufträgen steht im Protokoll: *„Die Insel ist nicht reproduzierbar.
Zwei Läufe desselben Standes unterscheiden sich bei `env-island.png` in 0,6 bis
0,9 % der Pixel. Beim Regressionsblick auf die Insel zählt nur eine Abweichung
deutlich darüber."*

Das war nie eine Eigenschaft der Insel, sondern **acht Zeilen Code**.

### Gemessen

Zwei Läufe des festen Bildersatzes, derselbe Stand:

| Bild | Δmittel | ≥ 2 |
| --- | --- | --- |
| 1-eyelevel | 0,039 | 0,556 % |
| **2-waterfall** | **0,168** | **1,535 %** |
| 3-edge-down | 0,003 | 0,071 % |
| 4-aerial | 0,015 | 0,256 % |
| 5-backlight | 0,003 | 0,057 % |
| 6-groundcover | 0,019 | 0,257 % |

Die beiden größten Abweichungen stehen in den beiden Bildern mit **Wasser**.
Vier Aufnahmen innerhalb **eines** Seitenaufrufs waren dagegen bitgleich — also
kein Rasterisierer, sondern der Aufbau.

### Die Ursache

`makeWaterTexture()` zeichnet acht helle Strähnen auf ein 64 × 256er Blatt und
holte ihre Lage und Deckkraft aus **`Math.random()`**. Bei jedem Seitenaufruf
sah das Wasser damit anders aus. Ein gesäter Strom (`mulberry32(90210)`) liefert
dieselben acht Strähnen und sieht keinen Deut anders aus.

### Danach

Zwei getrennte Durchläufe, alle sechs Bilder: **Δmittel 0,000, Δmax 0.**

Damit ist die Insel dieselbe Messgrundlage wie die übrigen vier Umgebungen, und
das „Rauschband 0,6–0,9 %" ist aus dem Protokoll zu streichen. Jede Abweichung
unter dieser Schwelle war bisher nicht messbar — von jetzt an ist sie es.

**Die Lehre:** Eine Ungenauigkeit, die lange genug im Protokoll steht, wird zur
angenommenen Eigenschaft des Gegenstands. „Die Insel ist nicht reproduzierbar"
stand dort als Naturgesetz und war ein `Math.random()` in einer Textur.

---

## Ausgangsstand, gemessen

`tools/shots/insel-01/`, sechs feste Kameras.

### Budget — dasselbe Bild wie beim Nachthimmel: es ist Platz da

| Größe | Grenze | Ist |
| --- | ---: | ---: |
| Draw-Calls env-island | ≤ 120 | **73** |
| Dreiecke szenenweit | ≤ 350 000 | **186 257** |
| Texturspeicher | ≤ 60 MB | **11,83 MB** |

47 Draw-Calls, 164 000 Dreiecke und 48 MB Textur sind frei.

### Befund 1 — Die Wiese ist ein Farbfeld

`6-groundcover` heißt „Nahaufnahme Bodenvegetation". Der Bereich
(100,420)–(1180,700), also 304 000 Bildpunkte und über die Hälfte des Bildes:

```
Hochpass |d| 0,040   p95 0,23   Kante waagerecht 0,013   senkrecht 0,034
Mittel 181,1   p05…p95 = 176…188
```

**Zwölf Tonwertstufen von 255**, und ein Hochpass von 0,040. Zum Vergleich: Der
Regolith des Nachthimmels — eine bewusst dunkle Fläche — hat an derselben Stelle
0,867, also das **Einundzwanzigfache**. In `1-eyelevel` ist es mit 1,203 besser,
aber dort stehen Büsche und Blumen im Ausschnitt; die reine Wiese trägt nichts.

### Befund 2 — 95 Zeichenknoten, 7 Werfer, 4 Empfänger

`tools/lichtzensus.mjs` (neu):

```
env-island: 95 Zeichenknoten, 7 Schattenwerfer, 4 Empfänger
sceneAmbient: — (nicht gesetzt)
```

Ohne Schattenrolle sind unter anderem: `island-body` (der Boden selbst),
`island-krone` und `island-laub` (die Baumkronen), `island-stones`, `bushes`,
`mushrooms`, `undergrowth-shade`. Es gibt `island-shadows` — gemalte Blobs, die
immer senkrecht nach unten liegen —, aber die Sonne steht schräg. In
`5-backlight` steht die Sonne hoch rechts, und der große Findling rechts wirft
**nichts**.

### Befund 3 — Die globale Hemisphäre wird mit einem negativen Licht aufgehoben

Die Szene trägt 18 Lichter. Darunter die globale `HemisphereLight` mit Stärke
1,4 **und** eine `global-hemi-compensation` mit Stärke **−1,4**. Das funktioniert,
aber `sceneAmbient` ist genau dafür da und wird von der Insel nicht gesetzt.

### Befund 4 — Der Nadelbaum flimmert

In `5-backlight` füllt eine Konifere das rechte Bilddrittel; ihre Nadeln stehen
als hochfrequentes Gekrissel. Das ist die bezahlte Lehre „Der Detailgrad muss zur
Abtastung passen" — noch nicht gemessen, kommt im Paket Vegetation.

### Befund 5 — Ein Gegenlichtbild ohne Gegenlicht

`5-backlight` heißt so, weil die Kamera in die Sonne blickt. Das Laub davor ist
flach dunkelgrün: kein Randlicht, keine Durchleuchtung, kein Streiflicht auf den
Kanten. Die Sonne selbst ist ein weißer Fleck mit weichem Hof.

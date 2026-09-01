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

### Befund 2 — ~~95 Zeichenknoten, 7 Werfer, 4 Empfänger~~ **berichtigt, siehe unten**

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

---

## Berichtigung zu Befund 2: Die Schatten sind verdrahtet, es steht nur nichts drin

Oben steht: „Ohne Schattenrolle sind unter anderem `island-body` (der Boden
selbst), `island-krone` und `island-laub` (die Baumkronen), `island-stones`,
`bushes`." **Das ist falsch, und der Fehler war mein Werkzeug.**

`tools/lichtzensus.mjs` hat in seiner ersten Fassung nur die Knoten **ohne**
Schattenrolle aufgelistet. Die Namen `island-body`, `island-krone`,
`island-laub` und `island-stones` kommen aber **mehrfach** vor: einmal für die
Hauptinsel und je einmal für die fünf Mini-Inseln, die absichtlich keine
Schatten haben (die Begründung steht im Quelltext: dieselbe Kartenauflösung über
die sechsfache Fläche würde aus scharfen Baumschatten Flecken machen). Ich habe
die Kopien der Mini-Inseln gesehen und auf die Hauptinsel geschlossen.

Mit der Namensliste statt der Zahl:

```
wirft:     island-body, island-holz, island-krone, island-laub,
           island-krone, island-laub, island-stones
empfaengt: island-body, island-stones, flowers, bush-leaves
```

Die Hauptinsel wirft also vollständig: Körper, Stämme, beide Kronentypen,
Findlinge.

### Was stattdessen der Befund ist

`tools/schattenanteil.mjs` (neu) nimmt jedes feste Bild zweimal auf — einmal mit
Schattenwurf, einmal ohne — und misst die Differenz. Was dazwischen liegt,
**ist** der Schatten, schwellenfrei.

| Bild | Fläche mit Schatten | Abfall Mittel | Abfall größter |
| --- | ---: | ---: | ---: |
| 1-eyelevel | **0,57 %** | 39,2 | 120 |
| 2-waterfall | **0,93 %** | 44,7 | 156 |
| 3-edge-down | 22,73 % | 29,9 | 121 |
| 4-aerial | 5,51 % | 30,9 | 67 |
| 5-backlight | **1,78 %** | 42,1 | 169 |
| 6-groundcover | **0,99 %** | 36,8 | 135 |

Wo Schatten liegt, ist er **kräftig** — 30 bis 45 Luminanzstufen Abfall, in der
Spitze 169. Das ist kein zu schwaches Licht und keine falsche Karte.

Der Mangel ist, dass er in den vier Augenhöhen-Bildern **unter zwei Prozent der
Fläche** einnimmt. Die Sonne steht auf 38,7 Grad; ein vier Meter hoher Baum wirft
dort fünf Meter Schatten. Dass davon nichts im Bild ist, heißt nicht „die
Schatten fehlen", sondern **auf der Wiese steht nichts, das welche wirft**. Das
ist derselbe Befund wie Befund 1, aus einer anderen Richtung gemessen.

Ein echter Nebenbefund bleibt: `bushes`, `undergrowth-shade` und `mushrooms`
**empfangen** keine Schatten. Ein Busch im Schatten eines Baumes steht damit voll
beleuchtet in einem dunklen Feld.

**Die Lehre:** Ein Werkzeug, das nur die Ausreißer ausgibt, lädt zum Fehlschluss
ein. Die Namensliste der Werfer stand nach drei Zeilen Änderung da und hätte den
falschen Befund nie entstehen lassen.

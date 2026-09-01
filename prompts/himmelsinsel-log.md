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

---

## Paket „Wiese": Die Narbe trägt jetzt Struktur — für null Byte Textur

Der größte Hebel der Insel: Die Grasnarbe füllt in vier der sechs festen Bilder
die halbe bis dreiviertel Fläche, und sie war ein Farbfeld.

### Warum die vorhandene Einfärbung nicht ausreicht

Die Wiese hat eine sorgfältig gebaute Vertex-Einfärbung — Feuchte aus Mulden und
Bachnähe, Moos im Nassen, dürres Gras auf dem Rücken, drei Ortsfrequenzen. Die
hängt aber an den **Scheitelpunkten**, und die begehbare Fläche ist absichtlich
eben und damit grob unterteilt. Aus anderthalb Metern deckt eine Gitterzelle
einen guten Teil des Bildes ab, und was dazwischen liegt, ist eine lineare
Interpolation — ein weicher Verlauf, dessen Hochpass definitionsgemäß bei null
liegt.

Es ist derselbe Befund wie beim Nachthimmel-Vordergrund und dieselbe Antwort:
**nicht fehlendes Detail, sondern Vergrößerung.** Was fehlt, ist Struktur im
Maßstab der Halme.

### Warum keine Textur

Ein früherer Anlauf hat die Mooskarten des Dojo-Satzes auf die Narbe gelegt:
dreifacher Texturspeicher (9,17 → 27,83 MB) bei unverändertem Bild
(Bildmittel 144,9 gegen 145,0). Diese Lehre steht im Quelltext und gilt weiter.

Die Struktur entsteht deshalb **rechnend im Shader** — kein Texturspeicher, kein
Draw-Call, keine Kachelgrenze:

* **Albedo**, zwei Ortsfrequenzen: Flecken von rund 90 cm, die dem Rasen Gebiete
  geben, plus ein Korn von 16 cm für die Halme. Dazu eine Farbwanderung ins
  Gelbe auf dem Korn — die Spitze ist heller als der Grund, und sie wandert mit
  dem einzelnen Büschel, nicht mit dem Gebiet.
* **Normale**, Büschel von 18 cm: Der Gradient kommt aus drei Abtastungen, die
  Störung wird im Weltraum gebildet und erst dann in den Blickraum gedreht —
  ohne Normalenkarte steht im Shader kein Tangentensystem.

**Der Maßstab ist gerechnet, nicht geschätzt.** Die Kamera löst 60 Grad auf 720
Zeilen auf, also 1,45 mrad je Bildpunkt; auf 1,5 m sind das 2,2 mm, auf 6 m
8,7 mm. Ein Büschel von 18 cm ist auf 1,5 m 82 Bildpunkte breit. Die
Normalenstörung blendet trotzdem zwischen 5 und 14 m aus — nicht weil sie dort zu
klein wäre, sondern weil eine Normalenstörung unterhalb weniger Bildpunkte zu
flimmerndem Korn wird statt zu Form. Die 90-cm-Flecken bleiben ungedämpft; sie
tragen die Wiese auch in der Ferne.

### Gemessen

Wiese in `6-groundcover`, (100,420)–(1180,700), 304 000 Bildpunkte:

| | vorher | nachher |
| --- | --- | --- |
| Hochpass | 0,040 | **0,532** |
| p95 des Hochpasses | 0,23 | **1,94** |
| Kante senkrecht | 0,034 | **0,894** |
| p05…p95 | 176…188 (12 Stufen) | **166…192 (26 Stufen)** |

Wiese in `1-eyelevel`, (100,470)–(1180,700): Hochpass **1,203 → 2,554**.

Bandweise von nah nach fern (`tools/hochpass-reihe.mjs`, reine Wiesenbänder):

```
6-groundcover  vorher   0,016  0,019  0,022  0,026  0,034  0,061
               nachher  0,181  0,194  0,215  0,284  0,453  0,754
1-eyelevel     vorher   0,045  0,055  0,086
               nachher  0,597  0,804  1,209
```

Elf- bis zwölffach über den ganzen Nahbereich, und ohne Sprung an der
Ausblendgrenze.

### Kein Flimmern in der Ferne

Die Gegenprobe ist der Punkt, an dem so etwas üblicherweise scheitert:

| Bild | vorher | nachher |
| --- | --- | --- |
| 4-aerial (Totale, 24 m Höhe) | 3,596 | 3,646 |
| 5-backlight | 7,397 | 7,428 |
| 3-edge-down | 2,157 | 2,163 |
| 2-waterfall | 2,344 | 3,071 |

Die drei Bilder, in denen die Wiese weit weg ist, bleiben praktisch unverändert
— die Ausblendung greift. `2-waterfall` gewinnt, weil dort Wiese im Nahbereich
steht.

### Kosten

**Keine.** 73 Draw-Calls von 120, 186 257 Dreiecke von 350 000, 11,83 MB von 60
— jede Zahl unverändert. Regression: Zen bitgleich, Konstrukt Δmittel 0,001,
Dojo 0,000, alle acht Nachtbilder bitgleich. Konsole frei von Errors und
Warnings.

### Was offen bleibt

Im Nahbereich liest das Korn als **waagerechte Schlieren**. Bei streifendem
Blick projiziert ein isotropes Rauschen so — echtes Gras tut es auch —, aber es
ist an der Grenze. Wenn der Prüfer es meldet, ist die Antwort nicht weniger
Stärke, sondern eine Störung, die die Halmrichtung kennt.

---

## Der Prüfer über den Ausgangsstand

Er hat den Stand **vor** dem Wiesen-Paket beurteilt. Sein Urteil: sieben der acht
Kriterien nicht bestanden, allein **Farbharmonie** bestanden (gesättigte Pixel in
genau zwei Fächern, 0,0 % im Bereich 240–360°, selbst Vögel und Pilzkappen
innerhalb der Tonart).

Elf Mängel, nach visueller Wirkung. Was er ausdrücklich als gut bezeichnet und
was ich nicht anfassen darf: die Farbtonart, der Fels (Hochpass 2,30 gegen Erde
1,73 und Rinde 4,91), die Kiel-Silhouette (Unterseite 63,5 gegen Himmel 192,2 —
128 Stufen), `5-backlight` als einziges Bild mit Achse (Masse L:R 1,43,
Kantenanteil unteres Drittel 14,09 %), der Nebel auf den Mini-Inseln und die
Vogelbahnen.

**Er widerlegt außerdem meinen Auftrag an ihn.** Ich hatte ihm mitgegeben, die
Blob-Schatten lägen immer senkrecht, während die Sonne schräg steht. Er findet
sie im Bildsatz nicht: Die Schlagschatten stimmen in Richtung und Länge zu
`SUN_DIR = (18,24,−24)`, in `6-groundcover` nach links unten, in `5-backlight`
auf die Kamera zu. Das deckt sich mit meiner eigenen Berichtigung weiter oben.

### Sein Mangel 1 ist bereits erledigt

*„Das Nahfeld ist leer, im Bild, das es zeigen soll"* — `6-groundcover`, Zeilen
420–719, Hochpass 0,017 bis 0,038, kein Pixel unterscheidet sich von seinem
Nachbarn um mehr als 3 von 255.

Nachgemessen im selben Bereich: **0,038 → 0,545.** Vierzehnfach.

Ein Teil seines Befundes steht aber weiter: **Kantenanteil im unteren Bilddrittel
0,00 %**, unverändert. Der nächste Grasbewohner überhaupt steht bei 4,2 m. Die
Wiese hat jetzt Oberfläche, aber immer noch keinen Vordergrundanker.

---

## Paket „Laub": Das Flimmern der Krone, gemessen statt geraten

**Sein Mangel 2** (`5-backlight`, Kasten (950,150)–(1250,450)): Hochpass 27,4 bei
p95 = 81,0, gleichzeitig 39,0 % der Kronenpixel unter L 40 und 2,2 % über L 190
— ein pixelweise abwechselndes Schwarz-Weiß-Gitter.

**Sein Mangel 5** (ferner Busch Hochpass 23,1 gegen nahen 12,6) hat dieselbe
Wurzel: Entfernung verdoppelt die Mikrokontraste, statt sie zu dämpfen.

### Erster Anlauf: `alphaToCoverage` — und er hat fast nichts gebracht

Die naheliegende Erklärung war die Alphaschwelle: `foliageMaterial` benutzt
`alphaTest` statt `transparent`, damit das Laub im Tiefenpuffer bleibt und
Schatten wirft. Wird die Karte kleiner, mittelt die Mipmap Alpha und Farbe
gemeinsam herunter, das Alpha fällt unter 0,42, der Bildpunkt verschwindet ganz
— während der Nachbar mit voller Farbe stehen bleibt.

`alphaToCoverage` verteilt die Schwellenentscheidung auf die vier
MSAA-Abtastpunkte, die dieser Renderer ohnehin hält. Gemessen:
**27,355 → 26,908**, dunkle Pixel 39,0 → 37,5 %. Also 1,6 Prozent. Die Zeile
bleibt drin — sie ist die richtige Darstellung für alphageprüftes Laub und
kostet nichts —, aber sie war nicht die Ursache, und das steht hier, damit
niemand sie später für die Lösung hält.

### Dann gemessen statt weitergeraten

`tools/laubprobe.mjs` (neu) schaltet die vier möglichen Ursachen im laufenden
Bild einzeln ab:

| | Hochpass | unter L 40 | über L 190 |
| --- | ---: | ---: | ---: |
| Stand | 26,908 | 37,6 % | 2,1 % |
| Rauheit 0,92 | **21,347** | **37,5 %** | **0,1 %** |
| Rauheit 0,92 + Normale ×0,75 | 18,868 | 45,5 % | 0,1 % |
| Rauheit 0,92 + Normale ×0,6 | 16,642 | 51,6 % | 0,1 % |
| ohne Normalenkarte | 5,135 | 75,1 % | 2,5 % |

Die **Normalenkarte** ist mit Abstand der größte Beitrag zum Flimmern — und
zugleich das, was die Krone überhaupt ins Licht hebt: Ohne sie liegen drei
Viertel der Kronenpixel unter L 40. Jeder Schritt, der sie zurückdreht, kauft
Ruhe mit Dunkelheit.

Die **Rauheit** nicht. Sie nimmt ein Fünftel des Flimmerns und **alle**
ausgebrannten Bildpunkte, ohne die Krone eine Zehntelstufe dunkler zu machen.
Das ist der freie Anteil, und mehr wird nicht genommen: Nadeln 0,7 → 0,92,
Blattkarten 0,78 → 0,88.

**Warum 0,7 dort stand und trotzdem falsch war:** „wachsig" ist richtig für eine
Nadel. Nur ist eine Nadel in diesem Bild **einen Bildpunkt** breit, und auf einem
Bildpunkt ist eine enge Glanzkeule kein Material, sondern ein Schalter.

### Gemessen am Bild

Konifere in `5-backlight`, (950,150)–(1250,450):

| | vorher | nachher |
| --- | ---: | ---: |
| Hochpass | 27,355 | **21,347** |
| p95 des Hochpasses | 81,01 | **54,78** |
| Kante senkrecht | 34,529 | **27,295** |
| über L 190 | 2,2 % | **0,1 %** |
| unter L 40 | 39,0 % | 37,3 % |

Budget unverändert: 73 Draw-Calls, 186 257 Dreiecke, 11,83 MB. Regression:
Nacht und Zen bitgleich, Konstrukt Δmittel 0,001, Dojo 0,001. Konsole sauber.

### Bestanden ist das nicht

Das Weiß ist weg und das Flimmern um ein Fünftel kleiner, aber die Krone liest
weiterhin als feines Rauschen und nicht als Nadelbüschel. Die verbleibende
Ursache ist benannt und **nicht behoben**: Der Nadelatlas zeichnet einzelne
Nadeln in Texelbreite, und die Karte steht im Bild etwa 1:1 — eine Struktur an
der Abtastgrenze. Was hilft, ist eine gröber gezeichnete Nadel**gruppe** statt
einzelner Nadeln, und die sitzt in `src/dojo/foliage.js`, wo auch das Dojo sie
holt. Das ist ein eigener Auftrag mit eigener Messung und nicht der Rest dieses
Pakets.

**Sein Mangel 5 bleibt ebenfalls offen:** ferner Busch 23,6 gegen nahen 11,6 —
die Rauheit hat daran nichts geändert. Ob das Aliasing ist oder eine Folge davon,
dass ein kleiner Messkasten um ein fernes Objekt überwiegend dessen Rand enthält,
ist **nicht geklärt**; die Frage gehört vor die nächste Änderung, nicht danach.

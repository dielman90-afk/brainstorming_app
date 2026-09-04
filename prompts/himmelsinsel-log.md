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

---

## Paket „Der Sturz": Was gemessen wurde, war nicht das, was ich gesucht habe

**Prüfer-Mangel 3:** *„Der Wasserfall hat keinen Körper und hängt neben der
Insel."* In `4-aerial` reißt der Sturz über je 60 px vollständig ab, größter
Abstand zum Himmel 16,2 Stufen; in `2-waterfall` — dem Bild, das nach ihm heißt
— kommt er gar nicht vor.

### Zwei falsche Fährten, beide gemessen widerlegt

*Erstens:* Ich hielt die Bahn für **kantensichtig** — ein flaches Band, das man
von der Schmalseite sieht, ist ein Strich. `tools/wasserfall.mjs` (neu) rechnet
Breite, Winkel zur Blickrichtung und Bildbreite je Querschnitt aus: In
`4-aerial` steht die Bahn **11 bis 37 Bildpunkte** breit im Bild, in
`6-groundcover` bis 806. An der Breite lag es nicht.

*Zweitens:* Ich habe einen Kasten um den Sturz gelegt und gegen den Himmel
gemessen — Ergebnis „Ausschlag Mittel 74,1". Im selben Kasten steht die
**Felswand**, und ihre 140 Stufen überdecken alles. Gemessen war der Fels.

### Die Messung, die trägt

`tools/sturzprobe.mjs` (neu) schaltet jeden Teil einzeln unsichtbar und nimmt
die Differenz — dieselbe Methode wie beim Schattenanteil, schwellenfrei. Dafür
haben die vier Teile jetzt Namen.

| Teil | in wie vielen Bildern | Fläche | Ausschlag |
| --- | --- | --- | --- |
| `waterfall-sheet` | **1 von 6** | 1175 px | 9,1 |
| `waterfall-drops` | **1 von 6** | 297 px | 11,6 |
| `waterfall-mist` | **1 von 6** | 2917 px | **1,8** |
| `waterfall-foam` | 4 von 6 | 669–2588 px | 4,3–14,6 |

Das ist deutlich schärfer als der Befund des Prüfers und verschiebt ihn: Der
Sturz **reißt nicht ab, er ist nicht da.** Wer auf der Insel steht, sieht ihn
nicht — er fällt hinter der Kante, auf der man steht. Das ist Geometrie und
lässt sich nicht polieren. Sichtbar ist von der Wiese aus allein die **Lippe**.

### Was gebaut wurde

**Eine Sprühfahne über der Lippe.** Neunzig Tropfen, die im Sinusbogen
aufsteigen, über die Kante driften und beschleunigt darunter verschwinden. Der
Umlauf setzt im hellen Schaum wieder ein, wo der Wechsel nicht zu sehen ist.

| | vorher | nachher |
| --- | --- | --- |
| in wie vielen Bildern sichtbar | — | **5 von 6** |
| `1-eyelevel` | — | 173 px, Ausschlag **42,4** |
| `2-waterfall` | — | 108 px, 8,6 |
| `4-aerial` | — | 132 px, 6,0 |
| `5-backlight` | — | 75 px, 7,4 |

**Eigenleuchten auf der Bahn.** Die Wassertextur läuft von 0x8fd2f0 nach
0x5fb6e6 — genau das Blau, vor dem sie steht. Mit `emissive` 0xcdeaf8 bei
Stärke 0,5: Ausschlag in `4-aerial` **9,1 → 11,3**. Das ist wenig, und es steht
hier als wenig.

### Zwei eigene Fehler in diesem Durchlauf

**Der Schaum.** Ich habe das Sprite von 1,3 × 0,5 auf 1,7 × 0,62 vergrößert. Die
Messzahl wurde besser (`1-eyelevel` 2588 → 4588 Bildpunkte, Ausschlag 14,6 →
19,1) und das Bild schlechter: Das Sprite ist ein **Billboard** und liegt damit
als blasser Fleck von knapp sieben Metern quer über der Wiese, nicht als Schaum
an einer Kante. Nachgesehen hat es der Ausschnitt, nicht die Messung.
**Zurückgenommen.**

**Der Zufallsstrom.** Die 540 Werte der Fahne kamen zuerst aus `rand`, dem
gesäten Inselstrom — und verschoben damit alles, was danach gebaut wird:
Mini-Inseln, ihre Bäume, ihre Findlinge. Gemessen schlug das mit Δmittel **1,6
bis 7,7** auf allen sechs Inselbildern durch und mit **2952 Dreiecken** im
Budget, für eine Punktwolke ohne ein einziges Dreieck. Die Lehre steht wortgleich
im Auftrag („Ein zusätzlicher `rand()`-Aufruf verschiebt **alles** danach"); ich
bin trotzdem hineingelaufen. Mit eigenem Strom: Δmittel **0,000 bis 0,048**,
Dreiecke wieder 186 257.

### Kosten und Regression

74 Draw-Calls von 120 (+1 für die Punktwolke), 186 257 Dreiecke, 11,83 MB
Textur. Nacht und Zen bitgleich, Konstrukt Δmittel 0,002, Dojo 0,000. Konsole
frei von Errors und Warnings.

### Was offen bleibt und was als Nächstes dran ist

Der Sturz selbst bleibt in fünf von sechs Bildern unsichtbar. Das ist keine
Materialfrage; wer ihn sehen will, muss über die Kante blicken, und genau dafür
gibt es `3-edge-down` — nur zeigt diese Kamera eine andere Stelle des Randes.
**Eine feste Kamera zu verschieben ist ausgeschlossen** (sie sind der
Vergleichsmaßstab über den ganzen Auftrag); ob der Sturz an eine sichtbarere
Stelle des Randes gehört, ist eine Frage an den Auftraggeber, keine, die ich
still entscheide.

Beim Nachsehen am Ausschnitt ist der eigentlich lautere Nachbar aufgefallen: Das
breite blasse Gebilde neben der Lippe in `1-eyelevel` ist das **Bachband**, das
zur Kante hin auf sieben Meter aufgeht und als durchscheinende Folie über der
Wiese liegt. Das ist Prüfer-Mangel 6, und es ist im Bild deutlicher als alles,
was dieses Paket betroffen hat.

---

## Entscheidung des Auftraggebers: Der Sturz muss nicht sichtbar sein

Auf die offene Frage aus dem vorigen Paket — ob der Wasserfall an eine
sichtbarere Stelle des Randes gehört — lautet die Antwort: **nein.** Er bleibt,
wo er ist. Damit ist der Befund „in fünf von sechs Bildern unsichtbar" kein
offener Mangel mehr, sondern eine bewusste Eigenschaft der Umgebung, und die
Sprühfahne über der Lippe ist das, was von ihm im Bild ankommt.

---

## Paket „Der Bach": Aus der Folie wird ein Lauf mit Ufer

**Prüfer-Mangel 6:** *„Der Bach ist eine geradkantige Folie über dem Gras."*
Querschnitt in `2-waterfall` bei y = 520: ein monotoner Verlauf über vierzehn
Stufen, Hochpass 1,66; kein Ufer, kein nasser Saum, keine Kräuselung, kein
Glanzpunkt, keine Schaumkrause.

Die Ursache ist dieselbe wie bei der Wiese: Das Band hat **zwei
Scheitelpunkte je Querschnitt** und eine Farbtextur darauf. Zwischen den beiden
Rändern kann nichts stehen als eine lineare Interpolation.

### Was gebaut wurde

Das Bachband bekommt ein eigenes Material (`bachMaterial`) mit drei Eingriffen
im Shader — kein Texturspeicher, kein Draw-Call, kein Dreieck:

* **Kräuselung.** Zwei Lagen Rauschen, quer zur Fließrichtung gestreckt und mit
  ihr wandernd. Sie stören die Normale, und erst dadurch bekommt die niedrige
  Rauheit etwas zu spiegeln — vorher war der Glanzpunkt einer ebenen
  waagerechten Fläche entweder ganz da oder gar nicht.
* **Weiches Ufer.** Die Deckkraft läuft zu beiden Rändern hin aus, und zwar
  **mit derselben Welle**, die auch die Oberfläche trägt: Eine glatt
  auslaufende Kante wäre wieder eine gerade Linie, nur unschärfer.
* **Schaumsaum.** Ein heller, unruhiger Streifen dort, wo das Wasser an die
  Grasnarbe stößt.

Die Fließrichtung kommt als Uniform herein — ohne sie weiß die Kräuselung
nicht, wo längs und wo quer ist, und quer gestreckte Wellen, die mit dem Strom
wandern, sind der halbe Unterschied zwischen Wasser und Marmor.

### Gemessen — und zuerst dreimal danebengemessen

**Drei Anläufe habe ich einen Kasten von Hand um das Wasser gelegt und Gras
gemessen.** Beim Sturz war es sogar die Felswand. Die Zahlen bewegten sich
jedesmal um weniger als ein Prozent, während der Bildausschnitt einen deutlichen
Unterschied zeigte — ich hätte daraus fast geschlossen, die Änderung greife
nicht.

`tools/sturzprobe.mjs` misst deshalb jetzt den Hochpass **auf der Maske des
Gegenstands selbst**: Der Knoten wird unsichtbar geschaltet, die geänderten
Bildpunkte sind seine Fläche, und nur über sie wird gemittelt. Damit kann der
Messbereich nicht mehr danebenliegen.

| Bild | Hochpass vorher | nachher | Fläche vorher → nachher |
| --- | ---: | ---: | --- |
| 1-eyelevel | 5,57 | **6,25** | 6764 → 6267 px |
| 2-waterfall | 3,26 | **3,53** | 12379 → 11541 px |
| 3-edge-down | 8,73 | **10,86** | 956 → 788 px |
| 4-aerial | 4,09 | **4,98** | 2106 → 1849 px |
| 5-backlight | 10,07 | **10,35** | 1296 → 1110 px |
| 6-groundcover | 6,88 | **8,23** | 2734 → 2450 px |

Drei bis vierundzwanzig Prozent mehr Feinstruktur, in **jedem** Bild. Die Fläche
schrumpft um sechs bis achtzehn Prozent, und das ist kein Verlust, sondern die
Wirkung des weichen Ufers: Was vorher als volle Deckkraft bis zur Polygonkante
stand, läuft jetzt unter die Messschwelle aus.

**Die Zahl untertreibt den Unterschied.** Der Hauptgewinn sitzt an der *Kante*,
und ein Hochpass über die Fläche misst die Kante kaum mit. Der Beleg ist der
Ausschnitt: Wo vorher eine durchscheinende Platte mit geraden Rändern über den
Findlingen lag, steht jetzt ein Lauf mit ausgefranstem, schaumigem Ufer.

### Kosten und Regression

74 Draw-Calls von 120, 186 257 Dreiecke, 11,83 MB Textur — jede Zahl
unverändert. Nacht und Zen bitgleich, Konstrukt Δmittel 0,002, Dojo 0,000.
Konsole frei von Errors und Warnings.

### Was offen bleibt

Das Band läuft weiterhin **über** die Findlinge im Bachbett, statt an ihnen zu
brechen. Ein Schaumkranz am Stein braucht die Steinorte im Shader; das ist
machbar (die Kranzsteine der Quelle stehen als Liste da), aber ein eigenes
Paket. Und der breite Abschnitt kurz vor der Lippe bleibt flächiger als der
schmale — dort ist das Band bis zu sieben Meter breit, und ein Ufersaum trägt
über diese Breite nicht.

### Die Lehre dieser Runde

**Ein von Hand gesetzter Messkasten ist eine Vermutung, kein Messbereich.** Drei
Mal hintereinander habe ich damit den falschen Gegenstand gemessen und zweimal
fast die falsche Schlussfolgerung gezogen. Die Maske des Gegenstands steht als
Nebenprodukt jeder differentiellen Messung schon da — man muss sie nur benutzen.

---

## Paket „Licht": Die Sonne hat wieder eine Farbe

**Prüfer-Mangel 7:** `5-backlight`, Kasten x 529–608, y 141–220 — **5036
Bildpunkte reines (255,255,255)**, Sättigung entlang y = 175 durchgehend null.

Über der betreffenden Zeile im Quelltext stand: *„Warmer Kern. Gemessen war die
Scheibe über neunzig Pixel hinweg reines (255,255,255) bei Sättigung null."* Der
Kommentar beschrieb den Befund als behoben. Der Prüfer hat ihn unverändert
wiedergefunden.

### Warum ein warmer Kern nicht reicht

Der Kern war **additiv** gemischt, über einem ebenfalls additiven Hof, über einem
Himmel von L ≈ 190. Eine Summe, die in jedem Kanal an die Obergrenze läuft, hat
keine Farbe mehr — ganz gleich, welche Farbe man hineingibt. Die Lehre steht
wortgleich im Auftrag („additiv plus voller Kern ergibt reines Weiß") und ist
beim **Mond des Nachthimmels** schon einmal bezahlt worden: Dort wurde der Kern
normal gemischt und nur der Hof blieb additiv. Dieselbe Lösung, dieselbe Datei,
hundert Zeilen entfernt.

Jetzt: Kern mit `NormalBlending` und `toneMapped: false`, Hof weiter additiv.
Normal gemischt **ersetzt** der Kern den Himmel, statt sich zu ihm zu addieren.

| `5-backlight`, (500,120)–(640,250) | vorher | nachher |
| --- | ---: | ---: |
| reines Weiß | 4994 px (**27,0 %**) | **0 px (0,0 %)** |
| Sättigung, Mittel | 56,9 | **70,2** |

Im Bild steht statt eines weißen Lochs eine goldene Scheibe mit hellem Hof.

### Und die Büsche werfen jetzt selbst

**Prüfer-Mangel 4:** *„Büsche liegen auf, Felsen stehen."* Der Findling in
`6-groundcover` nimmt dem Gras unter sich **67 Luminanzstufen**, der Busch 200
Bildpunkte daneben **vier** — „ein Aufkleber mit haarscharfer Unterkante neben
einem Stein mit Schatten".

Getragen hat ihn allein die gemalte Kontaktverdunklung `undergrowth-shade`. Die
liegt aber immer senkrecht unter dem Gegenstand, während die Sonne auf 38,7 Grad
steht, und gemessen (`tools/sturzprobe.mjs`) deckt sie nur **377 bis 2335
Bildpunkte bei 4,8 bis 7,8 Stufen** Abfall. Ein Busch von anderthalb Metern
wirft bei diesem Sonnenstand knapp zwei Meter Schatten — das ist keine
Verdunklung unter ihm, sondern eine Form neben ihm.

Büsche und ihre Blattkarten werfen jetzt, Büsche und Pilze empfangen. Pilze
werfen **nicht**: Ein Hut von sechs Zentimetern ergäbe bei 5,2 cm je
Schattenkartentexel zwei Texel, und das ist Rauschen, kein Schatten.

Gemessen mit `tools/schattenanteil.mjs` — jedes Bild zweimal, mit und ohne
Schattenwurf, die Differenz **ist** der Schatten:

| Bild | Fläche vorher | nachher | Abfall vorher → nachher |
| --- | ---: | ---: | --- |
| 1-eyelevel | 0,57 % | **2,14 %** | 39,2 → 27,5 |
| 2-waterfall | 0,93 % | **2,66 %** | 44,7 → 32,7 |
| 3-edge-down | 22,73 % | 22,93 % | 29,9 → 29,8 |
| 4-aerial | 5,51 % | 5,66 % | 30,9 → 30,6 |
| 5-backlight | 1,78 % | **3,16 %** | 42,1 → 36,9 |
| 6-groundcover | 0,99 % | **2,30 %** | 36,8 → 26,8 |

In den vier Augenhöhen-Bildern **verdoppelt bis verdreifacht** sich die
beschattete Fläche. Dass der mittlere Abfall dabei sinkt, ist kein Verlust: Ein
Buschschatten auf Gras ist weicher und teildurchlässig, ein Felsschatten hart.
Mehr Fläche bei sanfterem Abfall ist genau die Richtung.

### Kosten und Regression

74 → **76 Draw-Calls** von 120, 186 257 → **199 505 Dreiecke** von 350 000
(+13 248 für Büsche und Blattkarten im Schattendurchgang), Texturspeicher
unverändert 11,83 MB. Nacht und Zen bitgleich, Konstrukt Δmittel 0,003, Dojo
0,000. Konsole frei von Errors und Warnings.

### Die Lehre dieser Runde

**Ein Kommentar, der einen Befund als behoben ausweist, ist kein Beleg dafür.**
Über der Sonnenzeile stand die Messung des alten Zustands und darunter der
Versuch, sie zu beheben — nur hat der Versuch die Ursache nicht getroffen, und
der Kommentar blieb stehen, als wäre er es. Wer so etwas liest, prüft es nicht
nach; der Prüfer schon.

---

## Berichtigung: Die Wiese bestand aus Kacheln, und die habe ich gebaut

**Befund des Auftraggebers:** *„Die Wiese sieht noch ganz komisch aus, als würde
sie aus Kacheln bestehen. Außerdem soll das Gras gleichmäßig grün sein."*

Beides trifft zu, und das erste ist **mein eigener Fehler aus dem
Wiesen-Paket**.

### Die Kacheln

Wertrauschen sitzt auf einem **achsenparallelen Gitter**. Eine einzelne Lage
zeigt dieses Gitter als Rauten, sobald ihre Zellen im Bild größer als ein paar
Bildpunkte werden — und genau das habe ich im Nahfeld eingebaut: Flecken bei
0,9 m und ein Korn bei 0,16 m, beide als **eine** Lage Wertrauschen, beide auf
demselben Gitter. Im Ausschnitt bei fünffacher Vergrößerung sind die Rauten
nicht zu übersehen.

Mehrere Oktaven allein hätten nichts geholfen, solange sie dieselbe Ausrichtung
haben: Ihre Gitter fallen aufeinander und **verstärken** sich. Jede Oktave wird
deshalb jetzt um 36,7 Grad gedreht und mit dem krummen Faktor 2,17 statt 2,0
skaliert; damit liegt keine Zellgrenze auf einer anderen. Dasselbe Rauschen
trägt Albedo und Normalenstörung.

### Das Grün

Zwei Quellen, beide zu kräftig:

*In meinem Shader* standen Flecken von 90 cm mit 17 Prozent Ausschlag, Büschel
mit 10 Prozent und eine Farbwanderung ins Gelbe auf dem Korn. Die Flecken sind
auf ein Drittel zurück, die Farbwanderung ist ganz heraus.

*In den Scheitelfarben* stand über der Stelle: „Die Ausschläge sind bewusst
groß." Sie waren zu groß — ±0,098 im Farbton und ±0,24 in der Sättigung, und
damit zerfiel die Wiese in Gebiete. Der Grund für die Variation war richtig
(Wasser sammelt sich in Mulden und läuft vom Rücken ab), die **Sprache** falsch:
Feuchtes Gras ist nicht anders grün, es ist dunkler grün. Der Farbton bewegt
sich jetzt um ein Viertel des alten Betrags, die Sättigung um ein Fünftel, und
die Helligkeit trägt den Rest.

### Gemessen

`tools/grasfarbe.mjs` (neu) misst beides zusammen, weil es sich widersprechen
kann: Farbstreuung **und** Feinstruktur. Wer nur eines misst, macht aus dem
Farbfeld ein Fleckenmuster oder umgekehrt.

Wiese in `6-groundcover`, (100,420)–(1180,700):

| | Farbton ± | Rot-Blau ± | Hochpass |
| --- | ---: | ---: | ---: |
| Ausgangsstand | ± 3,71 | ± 0,57 | 0,040 |
| nach dem Wiesen-Paket | ± 4,95 | ± 3,31 | 0,539 |
| **jetzt** | **± 3,05** | **± 2,56** | **1,052** |

Die Farbstreuung liegt jetzt **unter** dem Ausgangsstand — die Wiese ist
gleichmäßiger grün als vor allen Änderungen —, und die Feinstruktur ist
gleichzeitig das **Sechsundzwanzigfache** des Ausgangs und das Doppelte des
letzten Standes.

In `1-eyelevel`: Farbton ± 13,48 → ± 13,19, Hochpass 2,447 → **2,945** (die
größere Streuung dort enthält Büsche und Blumen im Messfeld).

Budget unverändert: 76 Draw-Calls, 199 505 Dreiecke, 11,83 MB. Nacht, Zen,
Konstrukt und Dojo alle Δmittel 0,000. Konsole sauber.

### Die Lehre dieser Runde

**Wertrauschen ist ein Gitter, und ein Gitter sieht man.** Die Hausregel sagt
bisher nur, dass `hashNoise` als Umriss einen Zackenstern ergibt. Der zweite
Teil fehlte: Auch die geglättete Fassung verrät ihre Achsen, sobald eine Zelle
mehr als ein paar Bildpunkte deckt. Gegenmittel ist nicht mehr Amplitude,
sondern **Drehung zwischen den Oktaven**.

Und: **Mehr Variation ist nicht mehr Qualität.** Ich habe im Wiesen-Paket die
Farbstreuung von ±3,71 auf ±4,95 gehoben und das für einen Gewinn gehalten,
weil der Hochpass mitstieg. Der Auftraggeber hat die Wiese daraufhin als
fleckig gemeldet. Die richtige Zielgröße war von Anfang an: Struktur in der
Helligkeit, Ruhe in der Farbe.

---

## Der Prüfer, zweiter Durchgang

Gegenstand war `tools/shots/insel-jetzt/` nach acht Paketen, mit `insel-01/` zum
Vergleich. Er hatte den ausdrücklichen Auftrag, meine sieben Behauptungen
nachzumessen statt zu übernehmen.

### Urteil je Kriterium

| # | Kriterium | Urteil | gegenüber dem ersten Durchgang |
| --- | --- | --- | --- |
| 1 | Silhouette | nicht bestanden | unverändert |
| 2 | Komposition | nicht bestanden | unverändert, Zahlen bis auf 0,1 % gleich |
| 3 | **Licht** | **bestanden** | **geändert: nicht bestanden → bestanden** |
| 4 | Farbharmonie | bestanden | unverändert |
| 5 | Materialtrennung | nicht bestanden | deutlich besser, Urteil steht |
| 6 | Tiefenstaffelung | nicht bestanden | unverändert |
| 7 | Bewegung | nicht bestanden (nur Quellenlage) | unverändert |
| 8 | Programmierer-Tell | nicht bestanden | Wiesenkachelung ist weg, Rest steht |

Von acht Kriterien ist eines dazugekommen: **Licht**. Begründet mit einer Quelle
samt Hof, Kern (254,241,199) statt Weiß, Schlagschatten mit 30-px-Halbschatten
und 62 Stufen Tiefe, Kontaktverdunklung am Findlingsfuß und dem Himmel als
kühlem Gegenpol über 89 Stufen.

### Meine sieben Behauptungen, nachgemessen

| # | Behauptung | sein Urteil |
| --- | --- | --- |
| 1 | Wiese 0,040 → 1,052 | **bestätigt**, dazu konstante Läufe 97,6 % → 6,7 % |
| 2 | gleichmäßig grün, ±3,05 | **teilweise** — Farbton ja, aber Rot-Blau-Streuung ±0,57 → ±2,56 und die Grasfarbe verliert Sättigung (max−min 76 → 56) |
| 3 | Konifere 27,4 → 21,3 | **bestätigt**, bleibt aber der höchste Hochpass im Satz |
| 4 | Sonnenkern | **bestätigt**, 4994 → 0 |
| 5 | Buschschatten, Fläche ×2 bis ×3 | **erster Teil bestätigt, zweiter widerlegt** |
| 6 | weiches Bachufer | **teilweise** — nah ja (2 px → 9 px Rampe), auf mittlerer Entfernung unverändert 1 px |
| 7 | Sprühfahne | **bestätigt, aber klein** — 4,55 % → 8,65 % Nicht-Himmel, nur aus der Vogelkamera |

### Zu Behauptung 5 — und was daran wirklich zutrifft

Er misst den **dunklen Anteil der hellen Wiese** in einem Kasten und findet ihn
gefallen: `1-eyelevel` 18,86 → 17,04 %, `4-aerial` 38,98 → 33,61 %.

Das widerspricht meiner Zahl nicht, denn es ist eine andere Größe. Ich habe
**differentiell** gemessen — jedes Bild einmal mit und einmal ohne Schattenwurf,
und die Differenz ist per Definition der Schatten: 0,57 → 2,14 % in
`1-eyelevel`. Sein Wert enthält dagegen alles Dunkle im Kasten, auch Büsche,
Steine und dunkleres Gras, und er fällt schon deshalb, weil die Wiese nach der
Farbberuhigung insgesamt heller und gleichmäßiger geworden ist.

**Meine Formulierung war trotzdem zu weit.** Ich habe „verdoppelt bis
verdreifacht" geschrieben und mich dabei auf die vier Augenhöhen-Bilder bezogen;
in `4-aerial` steht in derselben Tabelle 5,51 → 5,66 %, also unverändert. Wer
den Satz ohne die Tabelle liest, nimmt mehr mit, als dasteht.

Und sein **Mangel 12** trifft unabhängig davon zu und ist neu: In `4-aerial`
misst die größte dunkle Zusammenhangskomponente 400 × 191 px bei **17 %
Deckung** — sechs zehn Meter hohe Koniferen, und kein einziger Baum ist als
Schatten wiederzuerkennen.

### Was ich nicht auf dem Zettel hatte

**1 — Die Wiesenstruktur sitzt in der Ferne, nicht vor den Füßen.** Bandweise in
`6-groundcover`, x 150–1150:

```
y 380–418  4,594      y 500–538  1,237      y 620–658  0,477
y 420–458  2,061      y 540–578  0,917      y 660–698  0,348
y 460–498  1,695      y 580–618  0,651
```

Faktor **13 in die falsche Richtung**. Das nächste Stück Boden moduliert um
unter eine Luminanzstufe. Damit ist auch mein eigener offener Punkt erklärt: Der
Vordergrund ist nicht leer, weil dort nichts *steht*, sondern weil die
Modulation dort zusammenbricht — es ist dieselbe Vergrößerungsfalle wie beim
Nachthimmel, nur habe ich sie hier selbst wieder eingebaut.

**2 — Dieselbe Ursache erklärt den ungeklärten Buschbefund.** Nah verschwindet
das Detail, fern aliasiert es. In `6-groundcover` ist das Verhältnis sogar
**schlechter** geworden: 1,38 → 1,64.

**3 — Die Findlinge sind jetzt die glattesten Flächen der Szene.** 35,4 % bzw.
37,7 % der Pixel in konstanten Läufen ≥ 6, längster Lauf 91 px — gegen 6,7 % auf
der Wiese und 16,1 % am Kiel. Ich habe die Wiese an ihnen vorbeigezogen.

**4 — Null Luftperspektive auf der Bodenebene.** Ferner Kamm L 180,0 /
Sättigung 50,7 gegen nächsten Vordergrund L 179,3 / Sättigung 50,7: **0,7
Stufen und 0,0 Sättigungspunkte über rund 30 m**, während der Fels im selben
Bild um 35 Stufen staffelt. Die Staffelung ist eingebaut und greift auf einem
von zwei Materialien.

**5 — Der Himmelssaum landet im Blattinnern.** `5-backlight` (630,555)–(790,670):
3,05 % der Laubpixel mit B > R+30, davon **2,48 Prozentpunkte vollständig von
Laub umschlossen**. Beispiel: (32,62,22) direkt neben (55,109,97).

**6 — `addWind` wird genau einmal aufgerufen** (Blumen). Kronen- und
Buschhüllkörper stehen still, während die Blattkarten darauf schwingen. Alle
fünf Vögel teilen `flap: 5.0`, alle sieben Falter `flap: 13`, alle Mini-Inseln
`time * 0.4`, alle Wolken driften in +x und springen bei ±26 per Modulo. Er
führt das ausdrücklich als **unbestätigt** — ein Standbild kann es nicht zeigen.

### Was er als gut bezeichnet und was nicht angefasst wird

Himmel (89 Stufen Verlauf), Sonne (0 ausgebrannte Punkte, Sättigung 70,2),
Farbtonart (98,4–99,4 % in zwei Familien), Busch- und Findlingsschatten (30-px-
Halbschatten, 62 Stufen — „der klarste Gewinn dieser Runde"), Felsstaffelung
(35 Stufen, der alte Befund „1,8 Stufen" ist erledigt), das **nahe** Bachufer
(9-px-Rampe mit Schaum) und die Kiel-Felsoberfläche (16,1 % konstante Läufe —
„der Maßstab, an dem die Findlinge gemessen gehören").

### Die Lehre dieser Runde

**Eine Verbesserung verschiebt den Maßstab.** Die Wiese war die glatteste Fläche
der Szene; jetzt sind es die Findlinge, und zwar ohne dass sich an ihnen etwas
geändert hätte. Und: **Ein Detail, das nicht an die Bildschirmauflösung
gekoppelt ist, verschwindet nah und aliasiert fern.** Beides habe ich beim
Nachthimmel schon einmal gelernt und hier nicht angewandt.

---

## Paket „Nahfeld": Die Wiesenstruktur stand falsch herum

**Der schwerste Befund des zweiten Prüferdurchgangs**, und einer, den ich nicht
auf dem Zettel hatte: Die Struktur der Wiese war in der **Ferne** am stärksten
und brach zur Kamera hin zusammen.

```
6-groundcover, bandweise x 152–1148, fern -> nah
Ausgangsstand   2,822  0,110  0,064  0,034  0,026  0,021  0,018  0,016
nach Paket 2    4,594  2,061  1,695  1,237  0,917  0,651  0,477  0,348
```

Faktor **13,2** in die falsche Richtung. Das nächste Stück Boden — rund zwei
Meter vor dem Auge — modulierte um weniger als eine Luminanzstufe.

### Warum, und warum es dieselbe Falle wie beim Nachthimmel ist

Es ist kein fehlendes Detail, sondern **Vergrößerung**. Das Korn hat 32 cm
Kantenlänge; aus zwei Metern deckt eine solche Zelle einen guten Teil des Bildes
ab, und ein Hochpass über ein 5×5-Fenster sieht darin nichts. Die Struktur ist
da — nur mit einer Ortsfrequenz, die auf diese Entfernung nicht mehr als
Oberfläche liest.

Genau das steht seit dem Nachthimmel im Protokoll („Texturvergrößerung, nicht
fehlendes Detail"), und die Antwort ist dieselbe: **ein zweiter, viel feinerer
Maßstab, der nur nah eingeblendet wird.** 4,5 cm sind auf zwei Metern 15
Bildpunkte, auf sechs noch fünf; darüber wird er ausgeblendet, bevor er zu
Flimmern wird. Dieselbe Staffelung noch einmal in der Normalenstörung: Büschel
von 18 cm für den mittleren Bereich, Halme von 3,6 cm für das Allernächste.

### Gemessen

```
6-groundcover, bandweise, fern -> nah
Ausgangsstand   2,822  0,110  0,064  0,034  0,026  0,021  0,018  0,016
vorher          4,594  2,061  1,695  1,237  0,917  0,651  0,477  0,348
jetzt           5,234  3,290  2,776  2,126  1,750  1,439  1,151  0,938
```

Das **vorderste** Band steigt von 0,348 auf **0,938**, die ganze nahe Hälfte
etwa auf das Doppelte. Das Verhältnis fern zu nah fällt von **13,2 auf 5,6**.

`1-eyelevel`, dieselbe Messung über den Nahbereich: 1,515 / 1,774 / 2,074 →
**2,524 / 2,665 / 2,809**.

Gesamtbild in `6-groundcover` (100,420)–(1180,700):

| | Farbton ± | Rot-Blau | Hochpass |
| --- | ---: | ---: | ---: |
| Ausgangsstand | ± 3,71 | 26,0 ± 0,57 | 0,040 |
| vor diesem Paket | ± 3,05 | 25,4 ± 2,56 | 1,052 |
| **jetzt** | ± 3,49 | **28,5** ± 3,24 | **1,917** |

Kantenanteil im unteren Bilddrittel **0,00 % → 0,14 %** — die Kantenerkennung
findet dort zum ersten Mal etwas.

### Dazu die Sättigung zurückgeholt

Der Prüfer hatte an meiner Farbberuhigung zu Recht bemängelt, dass die Wiese
dabei auch **blasser** geworden ist (`2-waterfall` y = 440: Abstand max − min von
76 auf 56). Der Grundwert der Sättigung geht deshalb von 0,40 auf 0,44 — der
Rot-Blau-Abstand steht wieder bei 28,5 gegen 25,4, und die Farbtonstreuung
bleibt mit ± 3,49 unter dem Ausgangsstand von ± 3,71. Gleichmäßig grün heißt
nicht blass.

### Kosten und Regression

76 Draw-Calls von 120, 199 505 Dreiecke, 11,83 MB — **alles unverändert**, der
zweite Maßstab kostet nur Rechenzeit im Fragment. Nacht, Zen und Konstrukt
Δmittel 0,000, Dojo 0,000. Konsole sauber.

### Was offen bleibt

Das Verhältnis fern zu nah steht bei 5,6 und nicht bei 1. Ein Teil davon ist
unvermeidlich: Der Boden liegt im Nahbereich fast in der Blickachse, und eine
Fläche unter streifendem Blick trägt weniger Kontrast als dieselbe Fläche von
oben. Wie viel davon Rest und wie viel noch Fehler ist, ist **nicht geklärt**.

### Die Lehre dieser Runde

**Eine Lehre gilt nicht nur für die Umgebung, in der sie bezahlt wurde.** Die
Vergrößerungsfalle steht seit dem Nachthimmel im Protokoll, mit derselben
Ursache und derselben Antwort. Ich habe hier ein Korn gesetzt, das Maß an der
mittleren Entfernung genommen und den Nahbereich nicht nachgemessen — obwohl das
Bild, um das es ging, „Nahaufnahme Bodenvegetation" heißt.

---

## Paket „Findlinge": Sie waren an der Wiese vorbeigezogen worden

**Prüfer-Mangel 3 des zweiten Durchgangs:** *„Die Findlinge sind jetzt die
glattesten Flächen der Szene."* 35,4 bzw. 37,7 % ihrer Bildpunkte in konstanten
Läufen ab sechs, längster Lauf 91 px — gegen 16,1 % am Kiel und 6,7 % auf der
Wiese.

**Und zwar, ohne dass sich an ihnen etwas geändert hätte.** Sie stehen noch da,
wo sie immer standen; die Wiese ist an ihnen vorbeigezogen worden.

`tools/laeufe.mjs` (neu) macht seine Kennzahl nachvollziehbar. Meine Schwelle
ist mit „unter einer Luminanzstufe" lockerer als seine, die absoluten Zahlen
liegen deshalb höher — die Reihenfolge ist dieselbe: Findlinge 58,9 und 61,9 %
gegen Kiel 25,5 und Wiese 16,7.

### Die Ursache: Der Findling ist kleiner als seine Kachel

`boulderGeometry` legt die UV mit `faceBoxUV(g, 0,17 · WORLD_SCALE)` an, also
**0,68 lokale Einheiten je Kachel**. Ein Findling misst 0,1 bis 0,5 lokale
Einheiten — er ist kleiner als eine Kachel, und die Granitkarte liefert ihm damit
einen fast konstanten Wert. Die Kachel zu verkleinern ist keine Lösung: Am
Material steht, warum sie groß ist — die runden Einschlüsse der Karte kehren
sonst sichtbar wieder und lesen sich als Muster.

Also dieselbe Antwort wie bei Wiese und Bach: **rechnend im Shader**, kein
Texturspeicher, keine Kachelgrenze. Die Projektion nimmt die dominante Weltachse
der Flächennormale; weil das Material flach schattiert ist, ist diese Normale je
Facette konstant, und innerhalb einer Facette entsteht keine Naht. An den
Facettenkanten bricht sie ohnehin. Das Flat-Shading bleibt — der Prüfer hat es
im ersten Durchgang ausdrücklich gelobt.

### Der erste Anlauf hat die Hälfte der Steine nicht erwischt

Ich habe zunächst nur `island-stones` behandelt. Ergebnis: `1-eyelevel` von 58,9
auf 40,4 %, `2-waterfall` **exakt unverändert** — 61,9 % vorher wie nachher, der
Hochpass auf drei Nachkommastellen gleich.

Die Brocken im Bachbett sind ein **anderes Mesh** (`spring-stones`) mit einem
blanken Standardmaterial ohne jede Karte. Wer nur nach dem Namen sucht, den der
Prüfer nennt, findet sie nicht.

### Gemessen

| Fläche | vorher | nachher |
| --- | ---: | ---: |
| Findling `1-eyelevel` (820,350)–(910,400) | 58,9 % | **40,4 %** |
| Bachbett `2-waterfall` (100,440)–(320,590) | 61,9 % | **9,4 %** |
| Findling `6-groundcover` (620,300)–(780,380) | 49,6 % | **19,4 %** |
| **Kiel** (Maßstab) | 25,5 % | 25,5 % |
| **Wiese** | 16,7 % | 16,7 % |

Zwei der drei Steinflächen liegen jetzt **unter** dem Kiel, eine davon unter der
Wiese. Kiel und Wiese sind bitgleich — kein Kollateralschaden.

### Kosten und Regression

76 Draw-Calls von 120, 199 505 Dreiecke, 11,83 MB — **alles unverändert**. Nacht
und Zen bitgleich, Konstrukt Δmittel 0,002, Dojo 0,000. Konsole sauber.

### Was offen bleibt

`1-eyelevel` liegt mit 40,4 % weiterhin über dem Kiel. Der dortige Findling
steht so weit hinten, dass die Ausblendung (14 bis 34 m) schon greift. Sie weiter
zu ziehen ist die naheliegende, aber **nicht geprüfte** Idee — ein Korn von
4,5 cm fällt in dieser Entfernung unter zwei Bildpunkte, und dort beginnt genau
das Flimmern, das dieses Projekt beim Laub schon einmal bezahlt hat.

### Die Lehre dieser Runde

**Ein Befund nennt ein Bild, keine Menge.** „Die Findlinge" waren zwei
verschiedene Meshes mit zwei verschiedenen Materialien, und der eine Name im
Befund führte nur zu einem davon. Dass die zweite Messung sich auf drei
Nachkommastellen **nicht** bewegt hat, war der Hinweis — eine Änderung, die
nichts ändert, hat nicht die Sache getroffen, um die es ging.

---

## Paket „Luftperspektive": Der Szenennebel kann es nicht, und das ist gemessen

**Prüfer-Mangel 2 des zweiten Durchgangs:** *„Gras `1-eyelevel` ferner Kamm
L 180,0 / Sättigung 50,7 gegen nächsten Vordergrund L 179,3 / 50,7 — 0,7 Stufen
und 0,0 Sättigungspunkte über rund 30 m"*, während der Fels im selben Bild um
35 Stufen staffelt.

### Warum der Fels staffelt und der Boden nicht

Der Szenennebel setzt bei **6 · WORLD_SCALE = 24 m** an. Die Insel ist 40 m
breit; wer in ihrer Mitte steht, sieht ihre ferne Kante in **20 m** — sie liegt
vollständig **vor** dem Nebel. Der Fels staffelt, weil der Prüfer einen nahen
Findling mit der Klippe einer Mini-Insel in 80 m vergleicht, also quer durch den
Nebelbereich.

### Erst das Feld abfahren, dann entscheiden

`tools/nebelfeld.mjs` (neu) verstellt Nebelanfang und -ende zur Laufzeit und
misst je Einstellung die beiden Kästen des Prüfers plus einen dritten in
Kartenreichweite:

| Nebel | Δ Luminanz | Δ Sättigung | Kartenband |
| --- | ---: | ---: | ---: |
| 24 / 128 (Stand) | 1,2 | −0,4 | 115,0 |
| 12 / 128 | 1,3 | −0,8 | 115,0 |
| 8 / 90 | 2,1 | −2,8 | 115,0 |
| 5 / 70 | 3,6 | −6,9 | 115,1 |
| 2 / 70 | 4,5 | −9,5 | **116,1** |

Selbst die äußerste Einstellung bringt 4,5 Stufen und beginnt dabei, das
Kartenband zu heben. **Ein Nebel, der zugleich Mini-Inseln auf 100 m trägt, kann
auf 20 m nichts Feines tun.** Der Wert bleibt deshalb, wo er ist.

### Also dort, wo die Entfernung schon bekannt ist

Ein eigener Dunst in der Grasnarbe, auf das Band 4 bis 26 m gelegt. Er berührt
nichts anderes — keine Karten, keine Findlinge, keinen Himmel — und kostet kein
Byte.

**Zwei Anläufe, zwei Korrekturen:**

*Erstens der Ton.* Der erste Versuch mischte gegen die Himmelsfarbe
(0,44 | 0,66 | 0,83) und erzeugte 6,3 Luminanzstufen — aber auch **21,4
Sättigungspunkte** weniger. Im Bild stand daraufhin ein blassblauer Hintergrund,
auf dem Büsche und Findlinge in voller Sättigung saßen: Die Wiese staffelte,
alles darauf nicht. Jetzt gegen einen hellen, nur leicht kühlen Ton in der Nähe
der Grasfarbe.

*Zweitens die Reichweite.* Eine reine `smoothstep(4, 26)` lässt jenseits von
26 m überall denselben vollen Dunst stehen. In der Totale — Kamera 57 m entfernt
— lag damit die **ganze** Insel gleichmäßig im Schleier: Wiesenmittel 159,5 →
162,7, Anteil über L 190 von 16,4 auf **29,2 %**. Das ist keine Tiefe, das ist
Aufhellung. Der Term wird deshalb zwischen 30 und 55 m wieder zurückgenommen,
dort wo der Szenennebel greift. Physikalisch nimmt Dunst mit der Entfernung
nicht ab; hier tut er es, weil sonst zwei Quellen dieselbe Strecke doppelt
rechnen. Das ist eine Entscheidung der Technik, keine der Optik.

### Gemessen

| | Δ Luminanz | Δ Sättigung |
| --- | ---: | ---: |
| vorher | 1,2 | −0,4 |
| erster Anlauf (Himmelston) | 6,3 | −21,4 |
| **jetzt** | **4,8** | **−14,1** |

Und die Gegenprobe in der Totale: Wiesenmittel **159,5 → 159,5**, Anteil über
L 190 16,4 → 16,6 % — praktisch unverändert, während der erste Anlauf dort 29,2 %
stand.

Wirkung je Bild: `1-eyelevel` Δmittel 1,410 · `2-waterfall` 1,145 ·
`3-edge-down` 1,688 · **`4-aerial` 0,232** · `5-backlight` 1,191 ·
`6-groundcover` 0,895.

### Kosten und Regression

76 Draw-Calls, 199 505 Dreiecke, 11,83 MB — unverändert. Nacht und Zen
bitgleich, Konstrukt Δmittel 0,001, Dojo 0,000. Konsole sauber.

### Was offen bleibt

Der Dunst liegt **nur** auf der Grasnarbe. Büsche, Findlinge und Bäume, die
darauf stehen, staffeln innerhalb der Insel weiterhin nicht. Der zweite Anlauf
hat die Fehlpaarung deutlich gemildert, aber nicht beseitigt; sie ganz
aufzulösen hieße, denselben Term auf jedes Material der Insel zu legen — machbar
und ein eigenes Paket.

### Die Lehre dieser Runde

**Eine Einstellung, die zwei Aufgaben gleichzeitig erfüllen soll, erfüllt beide
schlecht.** Der Szenennebel muss Mini-Inseln auf 100 m ausblenden und sollte
zugleich 20 m Boden staffeln; das Feld zeigt, dass zwischen beiden kein Wert
liegt, der beides kann. Erst als die zweite Aufgabe einen eigenen Term bekam,
ging beides.

---

## Paket „Himmelssaum": Er saß im Blattinnern, weil er dort hingehörte

Befund des Prüfers (#40): In `5-backlight`, Kasten (630,555)–(790,670), tragen
3,05 % der Laubpixel Himmelsfarbe (B über R+30), und **2,48 Prozentpunkte davon
sind vollständig von Laub umschlossen**. Ein Saum am Rand hat immer Himmel neben
sich; einer im Innern nie. Meine eigene Nachmessung mit `tools/saumlage.mjs`:
1,55 % Saum, davon 1,53 Prozentpunkte innen liegend — es ist also praktisch
*jeder* Saumpixel ein Innenpixel.

### Zwei Fehler von mir, bevor die Messung stimmte

**Erstens** habe ich beim Sortieren des Befunds behauptet, den Saum trügen die
beiden Kartenwerkstoffe, und der Hüllkörper `_inselLaub` habe nie einen gehabt.
Das stimmt für die Baumkronen. Nur bauen Büsche und Kronen ihre Hülle in
`baueKrone()`, und **dort** sitzt der stärkste Saum der Insel:
`strength 0.5, power 2.0`, direkt am Werkstoff, nicht an `_inselLaub`.

**Zweitens** hat der erste Durchlauf von `tools/saumprobe.mjs` alle Säume auf
einmal auf null gesetzt und die Summe gemessen. Das Ergebnis sah eindeutig aus
(1,53 → 0,36 Prozentpunkte) und hat mich dazu gebracht, den Saum von den beiden
Kartenwerkstoffen zu nehmen. Gerendert änderte das **nichts**: 1,53 → 1,52. Der
Rundumschlag hatte den Hüllkörper mitgenommen, und der war es die ganze Zeit.

Erst die nach Gruppen getrennte Probe — Schlüssel ist das Wertepaar
(Stärke, Exponent) beim ersten Antreffen — trennt die Wirkungen sauber:

| abgeschaltet | Körper | Saum innen | Konifere | Laubkrone |
| --- | --- | ---: | ---: | ---: |
| — (Stand) | | 1,53 Pp | 53,0 (78) | 66,1 (646) |
| 0,50 / 2,0 | **Hüllkörper der Schöpfe** | **0,36 Pp** | 53,0 (78) | 67,7 (624) |
| 0,26 / 4,2 | Nadelkarten | 1,53 Pp | **67,3 (46)** | 66,1 (646) |
| 0,24 / 4,2 | Blattkarten | 1,52 Pp | 53,0 (78) | **67,9 (652)** |
| 0,18 / 4,0 | Fels | 1,53 Pp | 53,0 (78) | 66,1 (646) |
| 0,16 / 3,8 | Findling | 1,53 Pp | 53,0 (78) | 66,1 (646) |

### Warum es nicht anders sein konnte

Der Hüllkörper ist eine Detailstufe-0-Blase: **zwanzig Dreiecke, nicht
indiziert**. Seine Normalen sind Facettennormalen, der Fresnel-Term ist also je
Facette konstant. Er malt keinen Saum an eine Kontur, er hellt ganze Facetten
mitten im Busch himmelblau auf. Im vergrößerten Ausschnitt sieht man genau das:
helle blaugraue Flecken im Buschinnern, die als Löcher zum Himmel lesen. Gemessen
an drei Punkten: (41 | 94 | 73) → (21 | 67 | 39), (35 | 76 | 62) → (20 | 55 | 36).

Bei den Karten ist es dieselbe Mechanik in schwächer, und sie war hier schon
einmal aufgeschrieben: Eine Karte ist eine ebene Fläche mit konstanter Normale,
der Fresnel-Term wird darauf zur Flächenhelligkeit. Der Betrag war von
`0.55, 1.9` auf `0.26, 4.2` heruntergedreht worden — das hat den Fehler leise
gemacht, nicht behoben.

### Der Saum hat die Silhouette gekostet, für die er da war

Das ist der Teil, mit dem ich nicht gerechnet hatte. Alle drei Laubsäume
verbessern beim Abschalten **auch** den Konturkontrast:

| Kasten | Saum innen | Silhouettensprung |
| --- | ---: | ---: |
| Busch (630,555)–(790,670) | 1,53 → **0,36** Pp | — |
| Konifere (950,150)–(1250,450) | 0,80 → **0,17** Pp | 53,0 (78 Kanten) → **67,3 (46)** |
| Laubkrone (340,350)–(490,440) | 8,00 → **2,73** Pp | 66,1 (646) → **69,4 (634)** |

Die Zahl der Grenzstücke ist dabei die eigentliche Auskunft: Mit Saum zerfiel die
Kontur der Konifere in 78 Stücke, ohne ihn sind es 46. Aufgehellte Karten sind
vom Himmel nicht mehr zu unterscheiden — der Saum hat die Silhouette aufgelöst,
statt sie zu ziehen, und jedes verbliebene Stück sprang schwächer.

### Was geändert wurde

`baueKrone()` bekommt `himmelssaum` (Vorgabe `true`), die drei Aufrufe der Insel
setzen es auf `false`. `_inselNadeln` und `_inselKarten` sind nicht mehr in
`addSkyRim` gewickelt. An den beiden Felswerkstoffen bleibt der Saum: Ein
geschlossener Körper mit glatten Normalen ist der Fall, für den der Term gedacht
ist, und in diesen Kästen tut er messbar nichts Schädliches.

**Die Dojo-Kronen laufen durch dieselbe Funktion und behalten ihren Saum.** Die
Mechanik ist dort dieselbe, der Befund ist deshalb nicht automatisch derselbe —
gemessen habe ich auf der Insel. Ein Auftrag über die Insel ist kein Freibrief,
eine andere Umgebung nebenbei zu verändern. Wer den Dojo anfasst, misst ihn
vorher.

### Wirkung und Regression

Δmittel je Inselbild: `1-eyelevel` 0,431 · `2-waterfall` 0,299 ·
`3-edge-down` 0,045 · `4-aerial` 0,194 · **`5-backlight` 2,106** ·
`6-groundcover` 0,559.

Zen und Nachthimmel bitgleich (Δmax 0), Konstrukt Δmax 1, Dojo Δmax 4 bei
0,010 % der Pixel ≥ 2 — die Fallunterscheidung greift. Konsole frei von Errors
und Warnings, `npm run build` grün.

Kosten unverändert: 76 Draw-Calls, 199 505 Dreiecke (`4-aerial`, die teuerste
der sechs Ansichten) — der Eingriff nimmt Shader-Zeilen weg und fügt weder Mesh
noch Werkstoff hinzu. Grenzen sind 120 und 350 000.

### Die Lehre dieser Runde

**Ein Rundumschlag misst die Summe, nicht die Ursache.** Die erste Probe schaltete
alle Säume gemeinsam ab, das Ergebnis war eindeutig und die daraus gezogene
Folgerung falsch — ich habe zwei Werkstoffe geändert, die nichts beitrugen, und
den einen, der alles beitrug, stehen lassen. Gerendert kam 1,53 → 1,52 heraus.
Eine Differenzmessung ist nur so scharf wie das, was sie einzeln abschaltet.

---

## Paket „Bewegung", erster Teil: Die Wolken sind gesprungen

Der Prüfer hat unter #41 den Gleichtakt der Szene gemeldet und selbst dazu
geschrieben, das sei **unbestätigt** — ein Standbild kann über Bewegung nichts
aussagen. Also erst ein Werkzeug: `tools/inselbewegung.mjs` hängt die Uhr der
Umgebung um und liest über hunderte Zeitschritte **Ortspositionen aus der
Szene**, nicht Bildpunkte. Ein Sprung ist eine Ortsdifferenz; dafür braucht es
weder Schwelle noch Rendern.

Zwei Anläufe brauchte auch dieses Werkzeug:

* Der erste las **Weltpositionen**. Die Liste bestand daraufhin aus sechzig
  Zeilen mit demselben Wert — jede Mini-Insel schleppt ihre Kinder mit, und
  gefragt war, wer sich *selbst* bewegt. Jetzt liest es Ortspositionen.
* Instanzierte Meshes bewegen sich über `instanceMatrix`, nicht über die
  Ortsposition. Vögel, Falter und Blumen standen mit 0 in der Liste, obwohl sie
  das Beweglichste der Szene sind. Jetzt wird die Verschiebung der ersten
  Instanz mitgelesen.

### Der Befund

| Knoten | Mittlerer Schritt | Größter Schritt | Verhältnis |
| --- | ---: | ---: | ---: |
| Wolke (15 von 25) | 0,09–0,14 m | **51,97 m** | **385 bis 575** |
| Vögel | 0,38 m | 0,63 m | 1,7 |
| Falter | 0,29 m | 0,49 m | 1,7 |
| Hauptinsel | 0,03 m | 0,05 m | 1,6 |

Die Drift lief im Modulo um: Bei |x| = 26 sprang eine Wolke auf die andere Seite
des Himmels — **51,97 Meter in einem Zeitschritt von 0,25 s**. Und nicht am Rand
der Welt: Die Wolken liegen auf Radien von 8 bis 36, die Umbruchkante bei 26
läuft quer durch den sichtbaren Himmel. Fünfzehn der fünfundzwanzig Wolken sind
allein in den ersten zweihundert Sekunden gesprungen; die übrigen zehn hatten
ihre Kante nur noch nicht erreicht. Alle springen irgendwann.

### Was geändert wurde

Über die letzten drei Einheiten vor der Kante schrumpft die Wolke auf null und
wächst auf der anderen Seite wieder heraus (`smoothstep`, damit auch die
Änderungsrate keine Kante hat). Eine Haufenwolke, die sich auflöst und anderswo
neu bildet, ist das, was Haufenwolken tun. Bei 0,1 bis 0,32 Einheiten je Sekunde
dauert der Vorgang 9 bis 30 Sekunden. Kosten: keine — kein zweiter Werkstoff,
keine Transparenz, und solange die Wolke unsichtbar ist, spart sie ihren
Draw-Call.

**Drei Einheiten und nicht sechs, und das ist gemessen.** Mit sechs war jede
Wolke 23 % ihres Umlaufs verkleinert, und im eingefrorenen Zeitpunkt von
`2-waterfall` hat das die Wolke oben rechts vollständig gekostet — 0,266 % der
Bildpunkte, kompositorisch das Gegengewicht zur Konifere.

Drei Einheiten allein haben sie **nicht** zurückgebracht: Sie stand zufällig
direkt an der Kante, also einen Augenblick vor ihrem Sprung. Zurückgebracht hat
sie erst die zweite Änderung — **jede Wolke bekommt ihre eigene Umbruchweite**,
22 bis 34 statt einheitlich 26. Vorher lösten sich alle fünfundzwanzig an
derselben Ebene im Raum auf: eine unsichtbare Wand, an der Wolken sterben, und
genau die Art Regelmäßigkeit, die als Mechanik liest, sobald man ihr eine Minute
zusieht. Jetzt liegen die Umbruchstellen verstreut und die Umlaufzeiten (140 bis
680 s) haben keinen gemeinsamen Takt mehr.

Der zusätzliche Zufallswert kommt aus einem **eigenen Strom** (`mulberry32(771403)`).
Ein weiterer `rand()` im Wolkenbau hätte jede Ziehung danach verschoben — dieselbe
Lehre wie bei der Wasserfallfahne, die 2952 Dreiecke gekostet hat.

### Gemessen danach

Über 300 s und 1200 Zeitschritte ist das größte Verhältnis der ganzen Szene
**1,7** (Vögel und Falter). Kein Knoten springt mehr. Die Wolken laufen mit
Verhältnis genau 1,0 — gleichförmige Drift — und sind je Umlauf 10 bis 21
Zeitschritte unsichtbar, also rund 1,5 % der Zeit.

Wirkung auf die Prüfbilder: `2-waterfall` Δmittel 0,331 · `5-backlight` 0,047 ·
`4-aerial` 0,001 · `6-groundcover` 0,001 · `1-eyelevel` und `3-edge-down`
bitgleich. Zen und Nachthimmel bitgleich, Konstrukt Δmax 1, Dojo Δmax 7 bei
0,010 %. Konsole sauber, Build grün.

### Was an #41 offen bleibt

Der Befund hatte drei Teile, und nur einer war ein Fehler:

* **Vögel und Falter mit gleicher Schlagfrequenz** ist keiner. Die Phase ist
  längst je Tier verschieden (`d.phase * 2.3`, mit Begründung im Quelltext), und
  fünf Bussarde schlagen nun einmal ähnlich schnell — das ist eine Artkonstante,
  kein Gleichtakt.
* **Wolken driften alle in +x** ist ebenfalls keiner: Wind hat eine Richtung.
  Ihre Geschwindigkeiten waren schon verschieden.
* **Der Sprung** war einer, und zwar ein großer.

Offen ist der vierte Punkt, den der Prüfer daneben genannt hat: `addWind` wird
genau einmal aufgerufen, nämlich für die Blumen. Ob die Hüllkörper der Kronen
und Büsche stillstehend überhaupt sichtbar sind, ist noch nicht gemessen — sie
sitzen als Verdecker **innerhalb** der Kartenschale, und was man nicht sieht,
braucht keinen Shader. Das ist die nächste Messung, nicht die nächste Änderung.

---

## Paket „Bewegung", zweiter Teil: Das Laub der Insel hat sich nie bewegt

Der Prüfer hatte unter #41 notiert, `addWind` werde genau einmal aufgerufen, und
daraus geschlossen, die Hüllkörper der Kronen stünden still, während ihre
Blattkarten schwingen. Die erste Hälfte stimmt. Die zweite war zu freundlich.

Die Blattkarten bringen ihren Wind selbst mit — `foliageMaterial()` legt ihn in
einen gemeinsamen Uniform-Satz. Hochgezählt wird der aber von genau einer
Funktion, `updateFoliage(time)`, und die Warnung dazu steht seit dem Zen-Garten
wörtlich im Quelltext: *„wer die Karten anderswo benutzt, muss es selbst tun,
sonst hängen Blüten und Blätter reglos in der Luft und sehen aus wie
aufgeklebt."*

Der Zen-Garten ruft es auf. Das Dojo ruft es auf. **Die Insel nicht.**

### Gemessen, nicht gelesen

`tools/laubuhr.mjs` stellt die Uhr der Umgebung und liest `uTime` danach aus
dem laufenden Stand:

| Umgebungszeit | Insel | Zen |
| ---: | --- | --- |
| 10 s | **0,00** | 10,00 |
| 25 s | **0,00** | 25,00 |
| 40 s | **0,00** | 40,00 |

Achtzehn Laubwerkstoffe, alle auf null. Jede Blattkarte auf jedem Baum und
jedem Busch der Insel war reglos aufgeklebt, seit es die Insel gibt. Bewegt
haben sich bisher: Vögel, Falter, Wolken, die Mini-Inseln — und die Blumen, weil
sie als einzige `addWind` benutzen.

### Was geändert wurde

Eine Zeile: `updateFoliage(time)` im `update()` der Insel.

### Ist es Wind oder ist es Flimmern?

Das ist die Frage, die hier zählt, denn die Nadeln haben schon einmal ein ganzes
Paket gekostet: `alphaTest` auf ein Bildpunkt breiten Nadeln ergibt ein
Salz-und-Pfeffer-Muster, sobald sich etwas bewegt. Gemessen im Kronenkasten
(950,150)–(1250,450) von `5-backlight`, Vögel und Falter ausgeblendet:

| Zeitabstand | geänderte Bildpunkte | mittlerer Betrag |
| --- | ---: | ---: |
| **1/72 s** (ein Bild auf der Quest) | 13,84 % | **1,54** |
| 0,5 s | 93,65 % | 24,80 |
| 2,0 s | 97,91 % | 32,77 |

Von Bild zu Bild ändert sich also wenig und schwach; über eine halbe Sekunde
ändert sich fast alles und deutlich. Das ist die Signatur einer zusammenhängenden
Bewegung und nicht die von Rauschen — bei Flimmern stünde in der ersten Zeile
derselbe Betrag wie in der letzten. Ein Faktor 16 zwischen einem Bild und einer
halben Sekunde ist reichlich Abstand.

Nebenbei ist die Konifere dadurch besser geworden: Silhouettensprung 67,3 → 73,4
bei 46 → 110 Konturstücken. Mehr Stücke **und** stärkere Sprünge — anders als
beim Himmelssaum, wo mehr Stücke schwächere waren. Eine Konifere hat eine
zerfranste Kante; jetzt hat sie eine.

Wirkung: `5-backlight` Δmittel 11,584 (27,3 % der Bildpunkte) · `6-groundcover`
1,409 · `1-eyelevel` 1,260 · `2-waterfall` 0,712 · `3-edge-down` 0,252 ·
`4-aerial` 0,200. Zen und Nachthimmel bitgleich, Konstrukt Δmax 1, Dojo Δmax 7
bei 0,011 %.

### Die Hüllkörper bleiben stehen, und das ist eine Entscheidung

`tools/huellenprobe.mjs` misst differenziell, was ein Knoten überhaupt zum Bild
beiträgt — einmal mit, einmal ohne ihn, und die geänderten Bildpunkte **sind**
sein Beitrag:

| Bild | `island-krone` | `bushes` | `island-laub` | `bush-leaves` |
| --- | ---: | ---: | ---: | ---: |
| 1-eyelevel | 0,65 % | 0,31 % | 4,86 % | 4,19 % |
| 2-waterfall | 0,57 % | 0,39 % | 2,67 % | 4,03 % |
| 3-edge-down | 0,06 % | 0,09 % | 2,32 % | 0,52 % |
| 4-aerial | 0,66 % | 0,04 % | 3,10 % | 0,14 % |
| 5-backlight | 0,35 % | 0,34 % | 24,53 % | 3,47 % |
| 6-groundcover | 0,92 % | 0,29 % | 6,80 % | 3,72 % |

Die Hüllkörper sind auf 0,04 bis 0,92 Prozent der Fläche zu sehen, die Karten
davor auf dem Fünf- bis Fünfzigfachen. Sie sind Verdecker, sichtbar nur durch
Lücken — und die Lücken selbst bewegen sich, weil die Karten es tun. Der
Anteil hat sich durch den laufenden Wind **nicht** vergrößert (vorher 0,05–0,92,
nachher 0,04–0,92); die Karten wandern also nicht von ihrer Hülle weg.

Dagegen steht ein konkreter Preis: Der Schattendurchgang benutzt für den
Hüllkörper das Standard-Tiefenmaterial, das keinen Windeingriff hat. Ein
schwingender Hüllkörper würfe einen stehenden Schatten — genau der Fehler, gegen
den `foliageMaterial()` sein eigenes Tiefenmaterial mitbringt. Für 0,5 Prozent
der Fläche ist das der schlechtere Tausch. **Es bleibt also stehen, und hier
steht warum.** Wer es anders will, hat die Zahlen.

### Kosten

74 Draw-Calls und 196 739 Dreiecke in der teuersten der sechs Ansichten, gegen
76 und 199 505 vorher — also eine Spur **weniger**, weil eine Wolke an ihrer
Umbruchkante unsichtbar wird und dabei ihren Draw-Call spart. Grenzen sind 120
und 350 000. Der Wind kostet nichts weiter als ein paar Zeilen im vorhandenen
Vertexshader; das Tiefenmaterial der Karten gab es schon, nur seine Uhr stand.

Der „Software-Boden" desselben Laufs meldet 32,08 ms gegen 14,92 ms beim Lauf
davor. Das ist **kein** Befund: Es ist der leere Konstrukt-Raum auf einem
CPU-Rasterizer, und beim zweiten Lauf lief eine zweite Messung auf derselben
Maschine. Bildzeiten sind hier ohnehin keine Belege — das steht so im Auftrag.

### Die Lehre dieser Runde

**Ein Befund kann zu freundlich sein.** „Die Hülle steht still, während die
Karten schwingen" klang nach einem Detail und war die halbe Wahrheit; die andere
Hälfte war, dass die Karten auch stillstanden. Nachgesehen habe ich erst, als
ich für die Hülle den Aufrufweg des Windes suchte — und der Kommentar, der genau
diesen Fehler beschreibt, stand seit Monaten zwei Bildschirmseiten entfernt im
selben Quelltext.

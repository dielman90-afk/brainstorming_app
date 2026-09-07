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

---

## Erdfarbe im Felskiel: Der Befund stimmt, meine Erklärung dafür nicht — Ursache offen

Der Prüfer meldet in `3-edge-down` einen Kasten (400,385)–(480,425) mit Mittel
**88,8 gegen 47,4** daneben und nennt es „Erdfarbe mitten im Felskiel". Der
helle Fleck ist da, reproduzierbar, und sieht im vergrößerten Ausschnitt aus wie
ein weicher beiger Klecks im dunklen Gestein.

**Er ist keine Erdfarbe.** Das ist die erste gesicherte Aussage. Schaltet man
allein die Sonne ab, steht der Fleck bei 50,3 und der Kiel daneben bei 47,4 —
2,9 Stufen auseinander. Die Vertexfarben der beiden Flächen sind also praktisch
gleich; die 41 Stufen Unterschied sind **Licht**, nicht Farbe.

### Was gesichert ist

| Messung | Fleck | Kiel daneben |
| --- | ---: | ---: |
| Stand | 88,8 | 47,4 |
| nur Sonne aus | 50,3 | 47,4 |
| **alle Werfer aus** | **93,3** | **91,1** |

Ohne jeden Schattenwerfer sind beide Flächen gleich hell (Abstand 2,2 statt
41,4). Der Kiel ist also beschattet, der Fleck nicht — der Fleck ist ein **Loch
im Schlagschatten**. Dazu passen die Flächennormalen: (0,46 | 0,80 | 0,38) am
Fleck gegen (0,53 | 0,77 | 0,36) daneben, N·L 0,368 gegen 0,393. Geometrisch
sind die beiden Flächen nicht zu unterscheiden.

### Was ausgeschlossen ist

Jeder Regler der Schattenkarte, einzeln bis zum Anschlag gedreht, lässt den
Fleck auf 88,7–88,8 stehen:

| Regler | Bereich | Wirkung auf den Fleck |
| --- | --- | --- |
| `bias` | −0,05 … +0,002 | keine (der Kiel reagiert bei −0,05 mit +3,8) |
| `normalBias` | 0 … 0,035 | keine |
| `shadowSide` | vorne / hinten / beide | keine |
| Ortho-Kasten | 26,4 … 46 | keine |
| `near` / `far` | 30…95 / 215…300 | keine |
| `mapSize` | 1024 / 2048 | +0,5 |

Der Fleck liegt dabei **innerhalb** des Schattenkegels (Clipraum
(−0,361 | 0,291 | 0,234), alle drei zwischen −1 und 1), auf demselben Mesh wie
seine dunkle Nachbarschaft (`island-body`), mit `receiveShadow` an, und die
Schattenkarte wird jedes Bild neu gezeichnet (`autoUpdate = true`). Ein Strahl
vom Fleck zur Sonne trifft nach **6,00 m** `island-body`.

### Vier Fehlschlüsse von mir, der Reihe nach

1. **„Eine tiefe Erdzunge."** `earthEndAt()` kann das Erdreich bis auf das
   2,5-fache seiner Nennweite hinabziehen, das sah nach der Erklärung aus. Die
   Gegenprobe — Erdzone versuchsweise magenta — zeigte den Fleck unverändert
   beige. Widerlegt.
2. **„Die Vertexfarbe des Fels."** Widerlegt durch dieselbe Messung wie oben:
   ohne Sonne sind Fleck und Kiel gleich.
3. **„Der Fleck sitzt auf einer Mini-Insel, die keine Schatten empfängt."**
   Widerlegt: Der Treffer hängt an `island-body < island`, der Hauptinsel, mit
   `receiveShadow: ja`.
4. **„Die Schattenkarte ist veraltet."** Passte auf jede Beobachtung — bis
   `autoUpdate = true` herauskam. Widerlegt.

### Zwei Werkzeugfehler, die mich Zeit gekostet haben

* **`app.scene.traverse` statt der Inselgruppe.** So habe ich die
  schattenwerfende Sonne einer *anderen* Umgebung erwischt und einen
  Ortho-Kasten von 12 mit `near 2,5` gemeldet, wo die Insel 26,4 und 95 setzt.
  Zehn Minuten auf eine Zahl verwendet, die zum Dojo gehörte.
* **Werfer einzeln statt gemeinsam abgeschaltet.** Jeder einzelne Werfer
  änderte nichts, und daraus habe ich geschlossen, der Schatten komme von
  keinem von ihnen. Er kommt von **mehreren, die einander überdecken**: Erst
  alle zusammen abgeschaltet hebt den Kiel von 47,4 auf 91,1. Eine
  Einzelabschaltung beweist nur dann etwas, wenn es genau einen Verursacher
  gibt — und das war eine Annahme, keine Messung.

### Was offen bleibt

**Warum an dieser einen Stelle kein Verdecker in der Schattenkarte steht,
obwohl 6 m weiter oben Geometrie ist, weiß ich nicht.** Die eine Spur, der ich
nicht mehr nachgegangen bin: Von den sechs Meshes namens `island-body` in der
Szene ist genau **eines** ein Werfer (die Hauptinsel); die fünf Mini-Inseln
werfen keinen Schatten. Ob der Treffer bei 6,00 m zur Hauptinsel gehört oder zu
einer Mini-Insel, habe ich nicht mehr gemessen — falls Letzteres, wäre der
Fleck schlicht der fehlende Schlagschatten einer Mini-Insel, und das wäre eine
bewusste Entscheidung von damals (das Schattenvolumen umfasst nur die
Hauptinsel) und kein Fehler.

Ich habe hier weit mehr als die im Auftrag zugestandenen vier Durchläufe
verbraucht und breche deshalb ab, statt weiter zu raten. Die Werkzeuge
(`tools/kielfleck.mjs`, `tools/schattenleck.mjs`) bleiben da; der nächste Anlauf
fängt bei der offenen Spur an und nicht bei null.

### Die Lehre dieser Runde

**Ein Regler, der nichts bewirkt, ist erst dann ausgeschlossen, wenn man ihn bis
zum Anschlag gedreht hat.** Mein erster `bias`-Durchlauf lief von −0,0006 bis
+0,0002 — eine Spanne, in der sich nichts rühren *kann* — und ich hätte daraus
beinahe geschlossen, die Tiefenverzerrung sei unschuldig. Sie ist es, aber das
wusste ich erst bei −0,05.

---

## Zwei Prüferbefunde, die die Messung nicht bestätigt

### „Der Kiel wird nach unten dunkler" (y 240 L 99,0 → y 360 L 60,2)

Er wird dunkler, und das ist richtig so. Bänderweise über den Fels gemessen
(x 380–900):

| Band | Mittel | p05 | p95 | Spanne |
| --- | ---: | ---: | ---: | ---: |
| y 250–310 | 82,4 | 48 | 133 | 85 |
| y 320–380 | 70,1 | 46 | 125 | 79 |
| y 390–450 | 64,1 | 44 | 98 | 54 |

Der Fußpunkt (p05) bleibt bei 44–48, die Spitzlichter fallen von 133 auf 98. Die
Fläche verliert also Helligkeit, aber nicht ihre Modellierung — 54 Luminanzstufen
Spanne im untersten Band sind keine tote Fläche. Und weniger Licht mit der Tiefe
ist an der Unterseite einer schwebenden Insel das physikalisch Richtige: weniger
Himmel, kein Bodenlicht. Der gebackene Tiefenschatten tut genau das, wofür er da
ist. **Kein Eingriff.**

### „`4-aerial`: Schatten ohne Form"

Der Prüfer nennt eine größte dunkle Komponente von 400 × 191 Bildpunkten bei
17 % Deckung und liest sie als formlosen Fleck. Das ist der **Selbstschatten des
Inselkörpers auf dem Kiel** — eine große zusammenhängende Fläche zu sein ist bei
dem genau richtig.

Ich selbst habe beim Hinsehen behauptet, auf der Wiese lägen überhaupt keine
Baumschatten. Auch das ist falsch. `tools/wurfprobe.mjs` schaltet je Werfer nur
`castShadow` ab — der Knoten bleibt im Bild, die Differenz ist sein
Schlagschatten — und misst auf der reinen Wiese (420,250)–(800,400):

| Werfer | Fläche | Tiefe |
| --- | ---: | ---: |
| `island-laub` (Kronen) | 3,98 % | 35,3 |
| `bush-leaves` | 1,22 % | 18,8 |
| `island-stones` | 0,96 % | 28,0 |
| `island-holz` (Stämme) | 0,68 % | 29,8 |
| **alle zusammen** | **10,76 %** | **38,0** |

Ein Zehntel der Wiese liegt im Schatten, und zwar 38 Luminanzstufen tief. Der
Grund, warum es *schwächer liest* als es misst: Die Schatten sind gesprenkelt
(Blattkartenschatten, kein geschlossener Kronenumriss), und die
Hemisphärenaufhellung hebt sie auf einem hellen Grün an. Das ist ein Befund über
die Lichtbalance und nicht über fehlende Schatten — und es ist ein anderer
Befund als der gemeldete. **Kein Eingriff auf dieser Grundlage.**

### Warum das hier steht

Drei der letzten vier Befunde haben sich unter der Messung aufgelöst oder als
etwas anderes entpuppt. Das ist kein Vorwurf an den Prüfer — er sieht Standbilder
und benennt, was auffällt, und genau das soll er. Es ist ein Vermerk für mich:
**Ein Befund ist eine Frage, keine Aufgabe.** Wer ihn ungeprüft abarbeitet,
ändert Code gegen ein Problem, das es nicht gibt — und die Insel hat davon schon
zwei Male genug gehabt (der Himmelssaum an den falschen Werkstoffen, die
Wasserfallfahne aus dem falschen Zufallsstrom).

---

## Der Prüfer, dritter Durchgang — und was seine drei größten Befunde aushalten

Neu angesetzt auf `duft-09`, also nach Himmelssaum, Wolken und Laubwind. Sein
Gesamturteil in einem Satz: Die Szene zerfällt in **zwei nicht überlappende
Helligkeitsplateaus** — alles Vegetative zwischen L 25 und 165, der Boden
zwischen 166 und 200 —, und die Wiese wird **zur Kamera hin glatter** statt
reicher. Dazu 23 Einzelbefunde, geordnet.

Ich habe die drei obersten nachgemessen, bevor ich etwas geändert habe. Das
Ergebnis ist gemischt, und der Reihe nach.

### #3 „Kein Sonnenlicht auf Laub" — bestätigt, aber jeder Hebel dagegen kostet mehr, als er bringt

Erst die Gegenprobe zu meiner eigenen Skepsis: Ein Kasten über die ganze Krone
meldet 25,4 % über L 190 — das klang nach Widerlegung, ist aber der **Himmel
dahinter**. Deshalb `tools/knotenwerte.mjs`: Der Knoten wird ein- und
ausgeblendet, die geänderten Bildpunkte **sind** seine Fläche, und darin wird
gemessen. Kein Rechteck, kein Himmel:

| Knoten | Punkte | Mittel | p05 | p95 | > 150 | > 190 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `island-laub` | 44 888 | **58,7** | 21 | 122 | 1,2 % | **0,0 %** |
| `bush-leaves` | 38 329 | 83,1 | 25 | 165 | 12,2 % | 0,0 % |
| `island-holz` | 5 378 | 95,3 | 58 | 154 | 5,9 % | 0,1 % |
| Wiese daneben | — | 172,1 | 159 | 184 | — | 0,2 % |

**Der Befund stimmt.** Das Laub steht bei 58,7, das Gras direkt daneben bei
172,1, und über L 190 liegt kein einziger Blattpixel.

Es ist **nicht** der Schlagschatten: Ohne jeden Werfer wird das Laub sogar
dunkler (58,7 → 56,2). Es ist die Albedo. Also den Ton anheben —
`tools/laubton.mjs` dreht ihn zur Laufzeit und misst gleichzeitig, was er
kostet:

| Faktor | Laub Mittel | p95 | > 150 | Silhouettensprung |
| --- | ---: | ---: | ---: | ---: |
| ×1,0 | 58,7 | 122 | 1,2 % | **73,4** |
| ×1,3 | 64,4 | 125 | 1,2 % | 69,5 |
| ×1,6 | 69,8 | 129 | 1,3 % | 66,3 |
| ×2,0 | 76,4 | 135 | 1,7 % | 61,0 |
| ×2,5 | 84,0 | 142 | 2,7 % | 56,2 |

Das ist ein schlechter Tausch, und zwar messbar: Bei ×2,5 steigt das Mittel um
25 Stufen, der **p95 aber nur um 20**, über L 190 kommt weiterhin nichts, und
die Silhouette verliert **17 Stufen**. Der Hebel hebt den ganzen Ton an, statt
Spitzlichter zu erzeugen — er macht die Krone heller und flauer zugleich, also
genau das Gegenteil des Gewünschten.

Der Hebel, der Spitzlichter erzeugen *würde*, ist die Rauheit. Und der ist in
diesem Auftrag schon einmal gemessen und bewusst in die andere Richtung gestellt
worden: 0,7 → 0,92 nahm **alle** ausgebrannten Bildpunkte (2,1 % → 0,1 %) und
ein Fünftel des Flimmerns, ohne die Krone dunkler zu machen. Auf einer Nadel von
einem Bildpunkt Breite ist eine enge Glanzkeule kein Material, sondern ein
Schalter. Diesen Tausch wieder aufzumachen hieße, gemessene Ruhe auf der Quest
gegen ungemessene Spitzlichter im Standbild zu tauschen.

**Deshalb bleibt es, wie es ist, und hier steht warum.** Der Befund ist richtig
beobachtet; die drei verfügbaren Hebel sind vermessen; zwei davon wurden in
früheren Runden bereits entschieden. Wer es anders will, hat die Zahlen.

### #7 „Vögel als flache schwarze Linsen" — bestätigt und behoben

`MeshBasicMaterial` nimmt kein Licht an. Beide Flügel trugen deshalb denselben
Wert, und aus ihrer Überlappung wurde ein einzelner dunkler Mandelfleck — einer
davon liegt in `4-aerial` quer über der Felskante und liest als schwarzer Riss
im Gestein.

Die Messung auf den eigenen Bildpunkten der Vögel ist eindeutig: **p05 63,
p50 63.** Mehr als die Hälfte aller Punkte auf exakt einem Wert — die Signatur
einer Flächenfüllung. Die Falter tragen längst ein beleuchtetes Material; die
Vögel waren der Ausreißer.

Jetzt `MeshLambertMaterial` (nicht Standard: Ein Vogel auf fünfzehn Bildpunkten
braucht keine Glanzkeule). Danach **p05 47, p50 52** — die V-Stellung der Flügel
trennt die beiden Flächen, im vergrößerten Ausschnitt liegt eine sichtbare Naht
zwischen ihnen. Kosten: keine.

**Ehrlich zum Ausmaß:** Die Verbesserung ist klein. Der Vogel ist immer noch
überwiegend eine dunkle Linse, weil sich bei diesem Blickwinkel beide Flügel
fast deckungsgleich auf dieselbe Fläche projizieren. Der zweite Teil des
Befunds — der Vogel sei „so groß wie eine Baumkrone" — steht noch: Bei
`spread: 9` (mal Weltmaßstab vier = 36 m) fliegen einzelne Tiere deutlich näher
an der Kamera als die Insel und erscheinen dadurch größer als ihre zwei Meter
Spannweite. Das ist eine Frage der Platzierung und offen.

### Kosten und Regression

`5-backlight`, `2-waterfall`, `3-edge-down`, `6-groundcover` bitgleich oder
nahezu; `4-aerial` Δmittel 0,017 auf 0,106 % der Bildpunkte, `1-eyelevel` 0,002.
Zen und Nachthimmel bitgleich, Konstrukt Δmax 1, Dojo Δmax 5 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

### Die Lehre dieser Runde

**Ein bestätigter Befund ist noch kein Auftrag zur Änderung.** „Kein
Sonnenlicht auf Laub" ist richtig gemessen und bleibt trotzdem stehen, weil alle
drei Hebel dagegen etwas kosten, das teurer ist — und zwei davon wurden in
diesem Auftrag schon einmal gegeneinander abgewogen, mit Zahlen, die noch
gelten. Der Fehler wäre, den Befund abzuarbeiten, ohne die frühere Messung zu
kennen.

---

## Paket „Nahfeld", zweiter Anlauf: Eine dritte Skala für den letzten Meter

Befund #1 des dritten Prüfdurchgangs, und der mit der größten Fläche: Die Wiese
wird **zur Kamera hin glatter**. Nachgefahren über elf Bänder in
`6-groundcover`, von hinten nach vorn:

    vorher   8,675  5,926  5,461  3,106  2,421  1,857  1,464  1,123  0,887

Monoton fallend zur Kamera. Genau das, worauf ein Nutzer in der Brille schaut,
wenn er den Kopf senkt, ist die strukturärmste Fläche des Bildes.

### Warum die Korrektur der letzten Runde nicht gereicht hat

Sie hat gewirkt, nur nicht weit genug. In `1-eyelevel` steht das vorderste Band
jetzt bei 2,53 statt 0,35 — dort liegt der Boden rund vier Meter vor der Kamera,
und die 4,5-cm-Lage greift. In `6-groundcover` nicht.

Der Grund ist wieder **Vergrößerung**, eine Stufe tiefer. Ein Strahl durch den
unteren Bildrand (`tools/kielfleck.mjs` auf `6-groundcover`) trifft den Boden
nach **1,13 m**. Aus dieser Entfernung deckt eine Zelle von 4,5 cm rund
**23 Bildpunkte** — ein Hochpass über ein 5×5-Fenster sieht davon nichts, und
das Auge liest es als Fleck, nicht als Oberfläche. Alle drei vorhandenen
Nah-Blenden standen dort bereits auf voll; es fehlte keine Blende, sondern eine
Skala.

### Was geändert wurde

Eine dritte Lage von **1,2 cm**, in Albedo und Normale, eingeblendet erst unter
drei Metern (`1 - smoothstep(1.2, 3.0, tiefe)`). Aus 1,13 m sind das rund fünf
Bildpunkte — die Größe, die als Halmwerk liest.

**Eine Oktave, nicht vier.** `grasFbm` legt vier Lagen mit Faktor 2,17
übereinander; bei Grundfrequenz 85 läge die oberste bei 0,1 cm und damit weit
unter einem Bildpunkt. Das ist kein Detail mehr, sondern Rauschen, das auf der
Quest bei jeder Kopfbewegung kriecht. Gedreht wird die eine Lage trotzdem —
eine einzelne Lage Wertrauschen zeigt sonst ihr achsenparalleles Gitter als
Rauten, und diese Lehre hat die Wiese schon einmal gekostet.

### Gemessen

    nachher  8,675  5,926  5,461  3,137  2,817  2,703  2,353  1,871  1,412

Das vorderste Band **0,887 → 1,412** (+59 %), das zweite 1,123 → 1,871, das
dritte 1,464 → 2,353. Die hinteren vier Bänder stehen auf die dritte
Nachkommastelle unverändert — die Ausblendung sitzt.

Nahfeld (300,600)–(900,715): p05 172 → **169**, p95 191 → **192**, Spanne also
19 → 23 Stufen. Der Mittelwert bleibt bei 182 (181,6 gegen 182,3), die Wiese
wird also nicht heller, nur unruhiger.

Im vergrößerten Ausschnitt ist es der deutlichste Unterschied: vorher ein weicher
Wolkenwisch, jetzt eine körnige Fläche mit Richtungswechseln.

### Was das Maß NICHT sagt

Die Bänder steigen weiterhin nach hinten (1,41 → 2,35 → 2,82 → 3,14 → 5,46).
Das ist kein Restfehler: Die hinteren Bänder enthalten Blumen, Büsche und
Findlinge, die vorderen reines Gras. Ein Vergleich zwischen ihnen wiegt
Gegenstände gegen Oberfläche. Was zählt, ist der Vergleich derselben Stelle
vorher/nachher, und der steht oben.

`1-eyelevel` bleibt an der Nahwiese **unverändert** (p05 169, p95 189). Dort
liegt der Boden jenseits der drei Meter, die neue Lage greift also nicht — und
das ist Absicht: Bei 3,5 m wäre eine 1,2-cm-Zelle 1,6 Bildpunkte groß, und das
ist die Grenze, an der Struktur zu Flimmern wird.

### Regression

`1-eyelevel`, `3-edge-down`, `4-aerial`, `5-backlight` bitgleich oder Δmax 1;
`2-waterfall` Δmittel 0,003; `6-groundcover` Δmittel 1,239 auf 25,6 % der
Bildpunkte bei Δmax 22. Zen und Nachthimmel bitgleich, Konstrukt Δmax 1, Dojo
Δmax 4 bei 0,010 %. Build grün, Konsole sauber.

### Kosten

74 Draw-Calls, 196 739 Dreiecke — auf die Einerstelle unverändert. Eine dritte
Rauschlage im Fragmentshader fügt weder Mesh noch Werkstoff noch Textur hinzu;
sie kostet Rechenzeit je Bildpunkt, und die ist auf diesem Prüfstand ohnehin
nicht messbar (SwiftShader, kein Grafikprozessor). Grenzen sind 120 und 350 000.

### Die Lehre dieser Runde

**Der `shaderlint` hat zum fünften Mal Backticks in einem GLSL-Kommentar
gefunden.** Drei Stück, in Text, den ich gerade erst über eine frühere Lehre
geschrieben hatte. Der Prüfschritt vor dem Bauen ist das Einzige, was diesen
Fehler zuverlässig fängt — ich fange ihn selbst offenbar nicht.

---

## „Weiße Punkte ohne Quelle": Es sind die Blüten, und sie standen ohne Bodenkontakt

Befund #10 des dritten Prüfdurchgangs: in `2-waterfall`, Kasten
(600,340)–(760,430), „**neun isolierte weiße Blobs, mittlere Größe 2,4 px**,
frei vor dem Stein hängend. Über den Punkten befindet sich nichts, was sie
erzeugen könnte."

Derselbe Kasten, sechsfach vergrößert, zeigt **keine Felswand**: Es ist Wiese
mit Blumen und einem Pilz. Die neun Punkte sind Blütenköpfe. Der Prüfer hat den
Untergrund verwechselt und daraus „ohne Quelle" geschlossen — die Beobachtung
darunter ist trotzdem richtig: Der Stiel ist auf diese Entfernung schmaler als
ein Bildpunkt, verschwindet, und der helle Kopf steht in der Luft.

Dazu passt ein Befund aus dem **zweiten** Durchgang, den ich nie abgearbeitet
hatte: „Blütenstiele, kein Schatten, kein Bodenkontakt."

### Warum kein Schlagschatten

Aus demselben Grund, der seit dem Unterwuchs-Paket bei den Pilzen im Quelltext
steht: Eine Blüte von 6,4 cm ergibt bei **5,2 cm je Schattenkartentexel** einen
Schatten aus zwei Texeln. Das ist kein Schatten, sondern Rauschen.

Eine **gemalte** Kontaktverdunklung hat dieses Problem nicht — sie ist
Geometrie, keine Abtastung. Und es gibt sie schon: `addUndergrowth` sammelt die
Flecken unter Büschen und Pilzen in einem Bucket und verschmilzt sie zu einem
einzigen Draw-Call. Die Blüten entstehen zwar in `addGrassDecoration`, ihre
Fußpunkte wandern jetzt aber in **denselben** Bucket — ein Draw-Call bleibt ein
Draw-Call.

Zusätzliche Zufallswerte werden dabei **keine** gezogen: Die Fußpunkte sind die
ohnehin schon gewürfelten Standorte. Der Strom bleibt, wo er war.

### Zwei Anläufe beim Radius

Der erste nahm 0,022 lokale Einheiten, rund 11 cm. Gemessen war die Verdunklung
real (137,5 → 127,2 an einer Probe), im Bild bei vierfacher Vergrößerung aber
**nicht zu finden**: 11 cm sind auf diese Entfernung zwei Bildpunkte, und eine
weiche Radialtextur bei Deckkraft 0,30 verteilt das auf nichts.

Jetzt 0,05, also rund 25 cm — so groß, wie die Blüte hoch ist. Probe
137,5 → **122,5**, und in der Beitragsmaske (`tools/knotenwerte.mjs --maske`,
Differenz aus Ein- und Ausblenden des Knotens) sind die beiden nächsten
Blütenflecken die **dunkelsten Kontaktflecken des ganzen Bildes** — dunkler als
der des Busches daneben.

### Ehrlich zum Ergebnis

**Der Fleck sitzt richtig und ist zu dezent, um den gemeldeten Eindruck zu
drehen.** Im Bild-zu-Bild-Vergleich bei vierfacher Vergrößerung ist der
Unterschied nicht zu sehen; sichtbar wird er erst in der zwölffach vergrößerten
Maske. Was den „weißen Punkt bei 1×" erzeugt, ist nicht der fehlende Fleck,
sondern der **unterpixelbreite Stiel** — und den behebt eine Verdunklung am
Boden nicht.

Was die Änderung leistet: Die Blumen haben Bodenkontakt, wo vorher keiner war,
und der offene Befund aus dem zweiten Durchgang ist geschlossen. Was sie nicht
leistet, steht oben. Der nächste Anlauf müsste am Stiel ansetzen (breiter oder
kontrastreicher) und wäre eine eigene Messung.

### Regression

`3-edge-down` und `4-aerial` Δmax 6; `1-eyelevel` Δmittel 0,021 auf 0,286 % der
Bildpunkte; `2-waterfall` 0,020 auf 0,257 %; `6-groundcover` 0,009 auf 0,171 %.
Wiesenmittel in `2-waterfall` unverändert (148,5 gegen 148,4) — die Flecken
verschmutzen die Fläche also nicht. Zen und Nachthimmel bitgleich, Konstrukt
Δmax 1, Dojo Δmax 4 bei 0,008 %.

Kosten: 74 Draw-Calls unverändert, 196 739 → **196 919** Dreiecke. Das sind
genau **180**, also die neunzig Blütenquads zu je zwei Dreiecken — sie liegen im
vorhandenen verschmolzenen Mesh und kosten deshalb keinen zweiten Draw-Call.
Grenzen sind 120 und 350 000.

---

## Findlings-Facetten: Ein Drittel des Befunds war echt, und es lag am Licht von unten

Befund #5: „Bei drei von vier Findlingen ist die nach OBEN weisende Facette
dunkler als eine seitliche oder nach unten weisende — um 31, 39 und 39
Luminanzstufen. Zwei Facettentöne wechseln sich ab, offenbar unabhängig von der
Normalen. Deshalb wirken die Findlinge wie Papierfaltungen."

Die Pixelwerte reproduzieren auf die Zehntelstufe. Was sie bedeuten, entscheidet
aber die Flächennormale, und die steht in keinem Standbild. `tools/facetten.mjs`
liest sie zusammen mit dem N·L zur Sonne und mit dem, was zwischen Stelle und
Sonne steht.

### Zwei der drei Fälle sind Fehldeutungen

| Bild | Stelle | Normale | N·L | L |
| --- | --- | --- | ---: | ---: |
| `2-waterfall` | 190,470 | (−0,59 \| **0,48** \| 0,64) | **−0,378** | 85,2 |
| `2-waterfall` | 175,530 | (0,22 \| **0,87** \| 0,44) | **+0,372** | 126,3 |
| `5-backlight` | 1000,560 | (−0,46 \| **0,68** \| 0,57) | **−0,144** | 106,7 |
| `5-backlight` | 930,620 | (−0,61 \| **0,67** \| −0,43) | **+0,402** | 140,0 |

In beiden Fällen ist die **hellere** Facette die, die zur Sonne zeigt, und die
dunklere die abgewandte. Bei `2-waterfall` ist die hellere sogar die **stärker
nach oben** weisende (y 0,87 gegen 0,48). Der Prüfer hat die Position im Bild
für die Ausrichtung der Fläche genommen — weiter oben im Bild heißt nicht nach
oben gewandt. Hier ist nichts zu reparieren.

### Der dritte Fall war echt

| Bild | Stelle | Normale | N·L | L |
| --- | --- | --- | ---: | ---: |
| `1-eyelevel` | 856,366 | (0,05 \| 0,56 \| 0,83) | −0,150 | 101,9 |
| `1-eyelevel` | 837,391 | (−0,75 \| −0,07 \| 0,65) | **−0,806** | **132,5** |

Beide sind von der Sonne abgewandt, die untere **deutlich stärker** — und
trotzdem 31 Stufen heller. Das kann kein Sonnenlicht sein.

Es sind die beiden gerichteten **Aufhellungen von unten**, 1,9 und 0,85. Für den
Kiel gebaut, unter dem heller Himmel steht, treffen sie in three jeden Körper der
Szene — auch einen Stein, der auf der Wiese liegt. Die untere Facette bekommt von
ihnen N·L = +0,47, die obere −0,32, also nichts. Zusammen standen sie bei **2,75
gegen 2,5 der Sonne**: Die Insel wurde von unten stärker beleuchtet als von oben.

### Die Korrektur ist kein Tausch

`tools/aufhellung.mjs` fährt beide Seiten zugleich ab — den Abstand
Oberseite-minus-Unterseite am Findling und Mittel/Spanne des Kiels in drei
Bändern:

| Einstellung | oben − unten | Kiel (Mittel/Spanne) |
| --- | ---: | --- |
| Bounce ×1,00 (Stand) | **−30,7** | 82/85  70/79  64/55 |
| Bounce ×0,35 | −13,1 | 75/63  67/67  61/51 |
| **Bounce ×0,35, Hemisphäre ×1,15** | **−12,8** | **81/63  72/66  66/49** |

Die Hemisphäre kann den Fehlbetrag übernehmen, ohne Schaden anzurichten: Ihre
beiden Töne sind fast gleich (0xc6e2f4 gegen 0xbcd6ea), sie ist also praktisch
richtungslos und kann keine Oberseite unter ihre Unterseite drücken. Der Kiel
behält damit seine Helligkeit (81/72/66 gegen 82/70/64). Bezahlt wird mit
Spannweite (85 → 63 im obersten Band) — der Preis dafür, gerichtetes Licht durch
ungerichtetes zu ersetzen. 63 Stufen sind reichlich Modellierung.

Gesetzt: Aufhellungen 1,9 → **0,66** und 0,85 → **0,30**, Hemisphäre 1,35 →
**1,55**.

### Gemessen im Bild

Findling `1-eyelevel`: oben 101,9 → **108,6**, unten 132,5 → **122,5**, Umkehrung
−30,6 → **−13,9**. Die sonnenzugewandte Facette steigt 131,4 → 137,2.

Die Wiese hebt sich leicht (171,9 → 175,5), der Anteil über L 190 bleibt bei
0,9 % — kein Auswaschen.

Wirkung je Bild: `3-edge-down` Δmittel 4,496 · `6-groundcover` 3,639 ·
`2-waterfall` 3,120 · `5-backlight` 2,962 · `1-eyelevel` 2,920 · `4-aerial`
1,150. Zen und Nachthimmel bitgleich, Konstrukt Δmax 2, Dojo Δmax 5 bei 0,009 %.

Kosten: 74 Draw-Calls, 196 919 Dreiecke — auf die Einerstelle unverändert. Es
wurden nur drei Lichtstärken geändert, kein Knoten hinzugefügt.

### Die Lehre dieser Runde

**Eine Facette hat keine Oberseite im Bild, sondern eine Normale im Raum.** Zwei
von drei gemeldeten Umkehrungen waren keine; sie sahen nur so aus, weil im
Standbild „weiter oben" mit „nach oben gewandt" verwechselt wird. Die dritte war
echt und hätte in derselben Zeile stehen können — der Unterschied ist eine
Messung, die es vorher nicht gab.

---

## Wolken: ein Fleck, ein Zwölfeck, keine Lappen

Befund #15: „Wolken als flache Papierblobs, teils polygonale Kanten, ein
rechteckiger Zapfen." Gemessen in `3-edge-down` (80,460)–(280,660): Hochpass
**0,36**, p05 194 / p95 240, **99,8 %** der Bildpunkte über L 190.

Bei vierfacher Vergrößerung ist die nahe Wolke ein einziger weicher weißer
Verlauf mit zwei geraden Umrissstrecken. Drei Ursachen, alle in `makeCloud`:

**Erstens der Umriss.** Die großen Ballen waren `SphereGeometry(s, 12, 10)` —
zwölf Segmente ergeben einen Zwölfeck-Umriss, und auf einer nahen Wolke von über
zweihundert Bildpunkten liest das als Strecken mit Ecken. Jetzt 16×12, die
Knospen 9×7 statt 7×6.

**Zweitens die Lappen.** Die Farbe wird aus der Position der **verschmolzenen**
Geometrie gebacken. Alle drei bis vier Ballen und ein Dutzend Knospen bekommen
damit denselben glatten Verlauf, und die Wolke liest als ein Fleck statt als
Haufen. Jeder Ballen bekommt jetzt einen eigenen kleinen Helligkeitsversatz
(±0,05 groß, ±0,10 klein), der vor dem Silberrand aufgeschlagen wird.

Der Versatz kommt aus einem **eigenen Zufallsstrom** (`mulberry32(553091)`).
Zum wievielten Mal diese Lehre hier steht, habe ich aufgehört zu zählen.

**Drittens der Tonwert.** Die ganze Wolke lag im flachen Ast der ACES-Kurve:
p05 194 bis p95 240, also 3,4-facher Helligkeitsunterschied auf 46 sRGB-Stufen.
Oben mehr draufzugeben bringt dort nichts — Kontrast entsteht nur nach unten.
Grundwert 0,62 → **0,58**, Schattenseite −0,28 → **−0,42**, Höhenanteil
0,18 → **0,24**.

### Gemessen

Hochpass über die Wolkenfläche in `3-edge-down`, von nah nach fern:

    vorher   0,144  0,173  0,215  0,419  0,575  1,837
    nachher  0,489  0,468  0,409  0,517  0,552  1,823

Im vordersten Band das **3,4-fache**, im zweiten das 2,7-fache. Der Anteil über
L 190 geht von 99,8 auf 96,0 Prozent zurück — ein Teil der Wolke ist jetzt
überhaupt außerhalb der Kompression.

Im Bild: Der Umriss ist rund, die Lappen trennen sich, und die Unterseite ist
beschattet. In `1-eyelevel` lesen die beiden Wolken oben rechts erstmals als
Haufenwolken statt als Papierschnipsel.

Wirkung: `3-edge-down` Δmittel 0,413 · `4-aerial` 0,353 · `1-eyelevel` 0,198 ·
`2-waterfall` 0,167 · `5-backlight` 0,043 · `6-groundcover` 0,010. Zen und
Nachthimmel bitgleich, Konstrukt Δmax 2, Dojo Δmax 5 bei 0,010 %.

### Kosten

74 Draw-Calls unverändert, 196 919 → **205 409** Dreiecke, also **+8 490** für
die feineren Kugeln über alle fünfundzwanzig Wolken. Das ist der einzige Posten
dieser Runde, der überhaupt etwas kostet, und er liegt weit unter der Grenze von
350 000. Der Lappenversatz und die Tonwertänderung kosten nichts: Sie stehen in
den Scheitelfarben, die es ohnehin gibt.

---

## Stämme: Rinde ja, Segmentnähte nein

Befund #19: „Stämme ohne Rinde, mit waagerechten Segmentnähten." Bei fünffacher
Vergrößerung ist der Stamm ein glatter brauner Kegel mit weichem Verlauf, und wo
zwei Zylinderabschnitte aneinanderstoßen, läuft eine waagerechte Kante quer
durch.

### Rinde: erledigt

`rindenKorn()` legt eine **anisotrope** Faserung in den Fragmentshader: in der
Waagerechten fein (Faktor 26, die Furchen stehen dicht), in der Senkrechten grob
(Faktor 3,4, sie laufen weit). Isotropes Rauschen wäre Putz, keine Rinde. Dazu
eine zweite, viel gröbere Lage für die Flecken. Ausgeblendet zwischen 9 und 26 m.

Gemessen im Stammkasten (1014,500)–(1036,640) von `5-backlight`, Hochpass über
drei Bänder:

    vorher   2,333  1,820  19,309
    nachher  2,333  2,451  19,354

Im mittleren Band, das ganz im Stamm liegt, **+35 %**. Das erste und dritte Band
enthalten Laub und ändern sich nicht. Im vergrößerten Ausschnitt ist der
Unterschied deutlich: senkrechte Fasern statt einer flachen braunen Fläche.

Kosten: keine. Kein Mesh, kein Werkstoff, keine Textur — Zeilen im vorhandenen
Shader.

### Segmentnähte: bleiben, und hier steht warum

Sie sind **nicht** verschwunden; das Korn hat sie nicht überdeckt. Sie sind
geometrisch: `branchInto()` baut den Stamm als Kette von Zylindern, und an jedem
Stoß springt die Normale.

`branchInto` liegt in `src/dojo/foliage.js` und wird vom **Dojo** genauso
benutzt. Eine Glättung dort änderte eine Umgebung, die nicht Gegenstand dieses
Auftrags ist und für die niemand gemessen hat — dieselbe Entscheidung wie beim
Himmelssaum an den Dojo-Kronen. Wer die Nähte angeht, misst vorher beide
Umgebungen.

### Regression

`4-aerial` bitgleich; `6-groundcover` Δmittel 0,009 auf 0,192 % der Bildpunkte;
`5-backlight` 0,005; `1-eyelevel` 0,004. Der kleine Zahlenwert ist kein Zeichen
von Wirkungslosigkeit, sondern von Fläche: Stämme belegen wenig Bild. Zen und
Nachthimmel bitgleich, Konstrukt Δmax 1, Dojo Δmax 5 bei 0,009 %.

---

## Paket A — Zweiter Prüfdurchgang: Abgrund unter der Insel, und ein widerlegter Befund

Der Prüfer ist nach dem Konstrukt-Durchgang neu auf die Insel angesetzt worden
(neun Bilder: sechs eingefrorene Kameras plus drei freie Nahsichten). Sein
Bericht hat 21 Befunde; dieses Paket erledigt einen davon und **widerlegt einen
zweiten**.

### Widerlegt: „Bäume werfen überhaupt keinen Schatten" (sein Befund 2)

Er misst am Baumfuß in `1-eyelevel` Grashelligkeit 183–195 und beim Findling
zehn Meter daneben 126, und schließt daraus: die Bäume stehen außerhalb des
Lichtsystems.

**Gemessen mit `tools/wurfprobe.mjs`** (schaltet je Werfer nur `castShadow` ab
und misst die Differenz), auf der Wiese in `4-aerial`, Kasten 430,240–860,420:

| Werfer | Fläche | Tiefe |
| --- | --- | --- |
| `island-laub` | **3,02 %** | 31,2 |
| `island-holz` | 0,51 % | 26,9 |
| `island-krone` | 0,14 % | 12,9 |
| `island-stones` | 1,03 % | 26,5 |
| bushes + bush-leaves | 1,12 % | 17,9 |
| alle zusammen | 9,50 % | 33,1 |

Die Bäume beschatten **3,67 % der Wiese** — mehr als die Findlinge. Der Befund
ist damit widerlegt.

Was an seiner Beobachtung stimmt: Der Baumschatten ist **gesprenkelt**, nicht
gepoolt. Die Blattkarten werfen einzeln (3,02 %), der Kronenkörper fast nichts
(0,14 %) — und dass der Körper so wenig beiträgt, ist ein Messartefakt und kein
Befund: Sein Schatten liegt vollständig im Schatten der Karten, und wer Werfer
einzeln abschaltet, misst bei überlappenden Verdeckern nichts. Diese Falle steht
seit dem Konstrukt-Schattensplitter im Protokoll und hat mich hier fast ein
zweites Mal erwischt.

Und an der Stelle, an der **er** gemessen hat, hat er recht: Bei 38,7° Sonnenstand
läuft der Schatten eines Baums nach hinten aus dem Bild; am Fuß selbst steht
keiner. Nur folgt daraus nicht, dass keiner geworfen wird.

### Erledigt: „Unter der Insel ist nichts" (sein Befund 4)

Belegt und schwerwiegend. Im unteren Drittel von `3-edge-down` schwankt die
Fläche über 700 Bildpunkte um **drei Stufen**. Sein Schluss trifft den Kern:
„Genau dieser Blick ist der Moment, in dem der Nutzer erfährt, dass er schwebt.
Statt Tiefe bekommt er eine gestrichene Wand."

Die Ursache stand in den Wolkenschichten: Sie liegen bei y = −13 bis +13, der
Kiel reicht bis −8,2. Die unterste Schicht stand also **neben** der Insel, nicht
unter ihr. Es gab nie eine Tiefe.

**Ein Wolkenmeer als bemalte Fläche geht hier nicht, und das ist gemessen.** Der
erste Anlauf war eine Decke bei y = −18 mit 1200 m Kantenlänge und einer
Canvas-Textur aus 216 Ballen in drei Größen. Ergebnis im Kasten unter dem Kiel:
Der Bereich hob sich von 200 auf 212 — **gleichmäßig, ohne jede Struktur**. Der
Grund ist der Tiefennebel, der bei 136 m voll deckt: Alles, was von dieser
Kamera aus unter der Insel liegt, ist entweder weiter weg als das oder von der
Insel selbst verdeckt. Was tragen soll, muss **nah** sein.

Also Körper statt Fläche — eine vierte Wolkenschicht im Radius 5 bis 17 lokal
(20 bis 68 m) und 12 bis 22 lokal unter der Nullebene: dicht genug am Kiel, dass
sie durch den Nebel kommt, weit genug darunter, dass zwischen Kielspitze und
Wolke Luft steht.

Spanne p05–p95 im unteren Bilddrittel: 155 → **164**; im Bild stehen jetzt drei
Wolkenkörper unter und neben dem Kiel statt einer leeren Wand.

Die Schicht steht **nach** allen anderen Ziehungen im Zufallsstrom — Mini-Inseln,
Bäume, Steine und Vögel werden dadurch nicht verschoben. Diese Lehre steht seit
der Wasserfallfahne im Protokoll.

### Regression und Kosten

77 Draw-Calls (von 120), 212 792 Dreiecke, 11,83 MB Textur. Nachthimmel und
Zen-Garten **bitgleich**, Dojo Δmax 6 bei 0,010 %. Build grün, Konsole frei von
Errors und Warnings.

## Paket B — Die Wiese hat keine Grasnarbe (Prüferbefund 1)

Sein Satz: „Wer sich in der Brille hinhockt und die Grasnarbe ansieht, sieht
**kein Gras**, sondern ein grünes Tuch mit eingesteckten Stecknadeln."

### Bestätigt, und schlimmer als gedacht

Mit dem neuen `tools/grasnarbe.mjs` (mittlerer Nachbarunterschied getrennt nach
x und y, dazu der Anteil der Paare über 40 Stufen) über vier Bänder in
`6-groundcover`. Die Entfernungen sind nicht geschätzt, sondern mit
`tools/strahl.mjs` durch die Bildmitte gemessen: Der Boden liegt am unteren
Bildrand **1,08 m** vor der Kamera und im obersten Band 2,2 m.

| Band | Entfernung | Mittel | \|dx\| | \|dy\| | Paare > 40 |
| --- | --- | --- | --- | --- | --- |
| Vordergrund | 1,1 m | 185,1 | **1,32** | 1,99 | 0,000 % |
| zweites | 1,4–1,7 m | 184,8 | 1,60 | 2,94 | 0,000 % |
| drittes | 1,7–2,2 m | 183,6 | 1,73 | 3,64 | 0,000 % |
| viertes | ab 2,2 m | 179,1 | 2,00 | 4,33 | 0,000 % |

Die Struktur nimmt **zur Kamera hin ab**, monoton. Das ist derselbe Befund wie in
den Paketen „Die Wiese trägt keine Modellierung" und „Wiesenstruktur sitzt in der
Ferne", eine Vergrößerungsstufe tiefer — und beide Male hatte ich ihn für erledigt
gehalten.

### Warum mehr Amplitude nicht die Antwort war

Der erste Anlauf hat den vorhandenen feinsten Maßstab (1,2 cm, isotropes
Wertrauschen) verstärkt. Im vierfach vergrößerten Ausschnitt las das als **Filz**:
viel feine Faser, keine Halme. Was aus 1,1 m fehlt, ist nicht Kontrast, sondern
Gestalt.

Neu ist deshalb ein **anisotropes** Feld: dieselbe Rauschabfrage in einem
gedrehten, gestreckten Koordinatensystem — 9,1 mm quer, 111 mm längs. Die
Richtung kommt aus dem bereits berechneten Korn (Zellen von 32 cm) und dreht damit
über die Fläche, statt ein Kammuster zu legen. Kosten: eine Rauschabfrage, kein
Texturspeicher.

Der zweite Fehlversuch steckt in der Verteilung: Ein symmetrischer Ausschlag um
den Mittelwert ergibt Faser. Auf einer Wiese ist die helle Fläche groß und
zusammenhängend und das Dunkel **schmal und tief** — die Spalten zwischen den
Halmen. `pow(1 - h, 1.7)` lässt die obere Hälfte des Feldes fast unberührt und
zieht nur den unteren Rand herunter; der Erwartungswert wird abgezogen, damit die
Wiese ihre Helligkeit behält. Mit `pow(..., 2.6)` und 5,7 mm Querweite wurden aus
den Spalten **einzelne Bildpunkte**: 1,147 % der Nachbarpaare sprangen über 40
Stufen, im Bild Pfeffer statt Gras. Breiter und weicher, und der Wert fiel auf
0,057 %.

### Ausgeblendet wird nach Bildpunkten, nicht nach Metern

Eine Ausblendung über die Entfernung trifft den flachen Blick nicht: Auf dem
streifend gesehenen Boden ist der Fußabdruck eines Bildpunkts stark länglich —
quer zur Blickrichtung 3 mm, längs 12. `fwidth` gibt diese Weltweite. Zwei
Lehren dazu, beide gemessen:

* Wer **beide** Bildachsen mittelt (`0,5·(fwidth.x + fwidth.y)`), blendet die
  Halme schon bei zwei Metern aus, obwohl sie quer noch vier Bildpunkte breit
  sind — im Band 1,7–2,2 m fiel \|dx\| von 6,31 zurück auf 1,76, und zwar dort,
  wo gar kein Flimmern zu messen war (0,008 % Paare über 40). Maßgeblich ist die
  **schmalere** Bildachse: `min(length(dFdx(w)), length(dFdy(w)))`.
* Die Entfernungsausblendung 1,4 → 3,4 m war für die Augenhöhenkamera falsch
  gewählt: Dort liegt der Boden am unteren Bildrand **2,8 m** entfernt, das Feld
  war also schon fast aus. Jetzt 3,0 → 9,0 m, mit der Bildpunktschwelle als Netz.

### Ergebnis

`6-groundcover`, dieselben vier Bänder:

| Band | \|dx\| vorher | \|dx\| nachher | Paare > 40 nachher |
| --- | --- | --- | --- |
| 1,1 m | 1,32 | **8,06** | 0,057 % |
| 1,4–1,7 m | 1,60 | **8,19** | 0,051 % |
| 1,7–2,2 m | 1,73 | **8,34** | 0,080 % |
| ab 2,2 m | 2,00 | **7,17** | 0,035 % |

`1-eyelevel`, unteres Band (Boden 2,8 m entfernt): \|dx\| 1,92 → **4,90**, kein
einziges Paar über 40. Die Totale `4-aerial` ist im Wiesenkasten **bitgleich** —
dort ist das Feld vollständig ausgeblendet.

### Was gemessen und dann wieder ausgebaut wurde

Naheliegend wäre eine Normalenstörung quer zur Halmachse: Die Sonne steht 38,7°
hoch, eine Querneigung moduliert N·L. Gebaut, gemessen, im vordersten Band:

    ohne Querneigung   |dx| 8,06   Paare über 40: 0,057 %
    mit  Querneigung   |dx| 8,33   Paare über 40: 0,106 %

Drei Prozent mehr Struktur, doppelt so viele Ausreißer — und im vierfach
vergrößerten Ausschnitt kein Unterschied, den man benennen könnte. Bei 5,8
Bildpunkten Halmbreite ist die Neigung zu kleinteilig, um als Form zu lesen. Die
Zeilen sind draußen; die Begründung steht als Messung im Quelltext, damit sie
nicht in einem halben Jahr noch einmal gebaut wird.

### Was damit **nicht** erledigt ist

Der Prüferbefund hat zwei Hälften, und dieses Paket löst nur die erste. Im
Augenhöhenbild liest die Wiese weiterhin als glattes Tuch, weil ihr die
**vertikale** Ebene fehlt: Die Blumen stehen auf nackten Stielen, ohne
irgendetwas um ihren Fuß. Das ist der Teil „eingesteckte Stecknadeln", und
Mikrostruktur kann ihn nicht beheben — das braucht Grashorste, in der richtigen
Größe. (Sie waren einmal da und flogen raus, weil sie mit 0,15 lokalen Einheiten
= 0,6 m als Schilf lasen. Die Lehre war der Maßstab, nicht der Gedanke.) Nächstes
Paket.

### Wackeltest

`tools/kamm.mjs --hoch`, Versatz 1,5 / 3,0 / 4,5 mm, Vordergrundband:
Zittern 1,37 → 8,20, Quotient 0,200 → 0,776, max dL 12 → 55.

Das ist ein **erwarteter** Anstieg und kein Flimmerbefund: Die Struktur ist an
die Weltkoordinate gebunden, ein Kameraversatz von 1,5 mm verschiebt das Bild bei
1,1 m um knapp einen Bildpunkt, und ein Merkmal von 5,8 Bildpunkten Breite ändert
sich dabei rechnerisch um rund vier Fünftel seiner räumlichen Streuung. Der Wert,
der Flimmern anzeigt, ist der Anteil einzelner Ausreißer, und der liegt überall
unter 0,08 %. Der Vorzustand hatte einen Quotienten von 0,200, weil dort schlicht
**nichts** war, das sich hätte ändern können.

### Regression und Kosten

93 Draw-Calls (von 120), 74 606 Dreiecke, 21,53 MB Textur — die Zahlen des
Zen-Prüfstands, unverändert gegenüber dem Vorstand: Das Paket fügt weder ein
Objekt noch ein Byte Textur hinzu, nur Rechenzeit im Fragment-Shader.
Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 4 bei 0,010 %. Build grün,
Konsole frei von Errors und Warnings.

## Paket C — Die Stecknadeln: Grashorste in der richtigen Größe

Die zweite Hälfte desselben Prüferbefunds. Paket B hat das *Tuch* beseitigt
(Nachbarunterschied im vordersten Band 1,32 → 8,06); die *Stecknadeln* blieben:
Die Blumen standen auf nackten Stielen auf einer Fläche, die keine senkrechte
Ebene hat. Aus Augenhöhe ist eine Wiese aber gerade das — ein Feld, das nach oben
steht und in dem etwas steckt. Eine bemalte Ebene kann das nicht leisten, wie
fein sie gezeichnet ist.

### Warum die Horste beim ersten Mal rausflogen — und was daran die Lehre war

Sie standen schon einmal hier: 240 Stück aus je vier bis sechs gebogenen Halmen,
bis **0,15 lokale Einheiten** hoch, bei WORLD_SCALE 4 also gut **60 cm**. Damit
waren sie aus Augenhöhe die dominierende Form im Vordergrund und lasen als
Schilf. Der Quelltext hielt danach fest: „Die Wiese trägt ihre Zeichnung ohnehin
über die Bodenfarbe." Das war der falsche Schluss aus einem richtigen Befund —
die Lehre war der **Maßstab**, nicht der Gedanke.

Jetzt: 1,9 bis 4,0 cm lokal, also **7,6 bis 16 cm** in der Welt, und damit
deutlich unter dem Blumenstiel von 22 cm. Der Horst umgibt den Fuß der Blume,
statt sie zu verdecken.

### Drei Entscheidungen, jede gegen einen gemessenen Fehlversuch

**Der Fernbereich wird im Vertex-Shader zusammengezogen.** Ein Halm von 6 mm
Breite ist auf 20 m ein Drittel Bildpunkt; daraus wird Gefunkel, und das steht
als Befund 14 des Prüfers schon im Protokoll. Statt die Zahl zu senken (was die
Nähe leer macht), werden Instanzen jenseits von 11 m auf Größe null gezogen —
über die Entfernung der **Instanz**, nicht des Scheitelpunkts, sonst zerrt es
einen Horst in sich zusammen statt ihn als Ganzes wegzunehmen. In `4-aerial` ist
von den Horsten nichts zu sehen und nichts zu messen.

**Zwei Segmente je Halm statt drei, und das ist eine Budgetentscheidung.** Mit
drei Segmenten und 3600 Horsten stand die Insel bei **320 792** Dreiecken von
350 000 — kein Spielraum mehr. Zwei kosten vier Dreiecke je Halm statt sechs. Die
Biegung liegt dafür auf der oberen Hälfte; reines `t³` war zu viel, der Halm
stand dann bis kurz unter die Spitze senkrecht und las als Stachel.

**Flecken statt Gleichverteilung.** Gleichmäßig gestreut ergaben 3600 Horste
überall dieselbe dünne Belegung — im Bild eine Fläche mit vereinzelten Spitzen
darauf, nirgends Wiese. Eine echte Wiese ist fleckig. Dieselben Halme in 150
Flecken von 0,4 bis 1,2 m gelegt ergeben Stellen, an denen wirklich Gras steht;
die kahleren Stellen dazwischen trägt die Grasnarbe aus Paket B. Das kostet kein
einziges Dreieck und ist der größte Sprung dieses Pakets.

Dazu, aus demselben Grund: Die fünf Halme eines Horsts stiegen zuerst aus **einem
Punkt** auf — eher Agave als Büschel. Ihre Füße stehen jetzt über einen Kreis von
3 cm verteilt, die Biegung zeigt nach außen; ein Horst deckt damit rund 8 cm
Boden.

### Ergebnis

`1-eyelevel`, unterstes Band (Boden 2,8 m entfernt):

| Stand | sd | \|dx\| | Paare > 40 |
| --- | --- | --- | --- |
| vor Paket B | 5,49 | 1,95 | 0,000 % |
| nur Grasnarbe (Paket B) | 6,70 | 4,49 | 0,000 % |
| mit Horsten | **14,75** | **5,79** | 0,716 % |

Die 0,716 % sind Halmkanten, keine Rauschspitzen: Der Wackeltest gibt einen
Quotienten von **0,269** — die Silhouetten sind groß genug, dass ein Kameraversatz
von 1,5 mm sie kaum ändert. (Zum Vergleich: die Mikrostruktur aus Paket B liegt
bei 0,776, weil ihre Merkmale nur fünf Bildpunkte breit sind.)

### Kosten

| | vorher | nachher | Budget |
| --- | --- | --- | --- |
| Draw-Calls | 78 | **78** | 120 |
| Dreiecke | 212 792 | **299 192** | 350 000 |
| Texturspeicher | 11,83 MB | **11,83 MB** | 60 MB |

Ein einziger InstancedMesh, kein zweiter Draw-Call: Die Horste werfen **keinen**
Schatten. Eine Schattenkarte mit 2,6 cm je Texel ist ein Texel je fünf Halme und
ergäbe Rauschen statt Schatten — und den Schattendurchgang hätte sie verdoppelt.

**86 400 Dreiecke für eine Wiese sind ein Viertel des Gesamtbudgets, und das ist
eine bewusste Wahl.** Was danach noch an Geometrie kommt (Rinde, Bachbett,
Wasserfall), hat 50 808 Dreiecke Luft. Wird das eng, sind die Horste die erste
Stelle, an der gekürzt wird — die Fleckenzahl ist dafür ein einzelner Parameter.

Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 5 bei 0,010 %. Zen-Prüfstand
unverändert bei 93 Draw-Calls / 74 606 Dreiecken / 21,53 MB. Build grün, Konsole
frei von Errors und Warnings.

## Paket D — Die Nadelkronen flimmern (Prüferbefund 3)

### Erst ein Werkzeug, sonst misst man nichts

`kamm.mjs` versetzt die Kamera in Millimetern. Auf 1,1 m sind 1,5 mm knapp ein
Bildpunkt — auf 30 m ein Zwanzigstel davon. An einer Baumkrone im Hintergrund
meldete die Millimeterfassung deshalb einen Quotienten von **0,005**, also
„vollkommen ruhig", während der Prüfer sie als flimmernd meldet. Er hat recht,
und meine Messung hat in der falschen Größenordnung gewackelt.

Neu ist `--dreh`: Die Kamera **dreht** sich um Viertelbildpunkte statt sich zu
verschieben. Eine Drehung verschiebt das ganze Bild um denselben Betrag,
unabhängig von der Entfernung — und ein Kopf in der Brille dreht sich mehr, als
er wandert. Damit im Kronenkasten von `4-aerial`:

    Konifere        Zittern 4,75   Quotient 0,099   max dL 156
    Konifere fern   Zittern 2,70   Quotient 0,240   max dL 106
    Wiese (Bezug)   Zittern 0,75   Quotient 0,039   max dL  43

Ein Viertelbildpunkt Kopfdrehung ändert einzelne Kronenpixel um bis zu **156 von
255**. Befund bestätigt.

### Die Ursache ist keine der vermuteten

`tools/kronenzittern.mjs` schaltet die Ursachen einzeln ab und misst dieselbe
Drehreihe:

| Variante | Mittel | Streuung | Zittern | Quotient |
| --- | --- | --- | --- | --- |
| stand | 70,2 | 47,8 | 4,75 | 0,099 |
| ohne Normalenkarte | 70,2 | 47,8 | 4,63 | 0,097 |
| ohne Rauheitskarte | 68,5 | 48,3 | 4,69 | 0,097 |
| ohne alphaToCoverage | 60,3 | 42,9 | 4,11 | 0,096 |
| Anisotropie 16 | 70,3 | 47,8 | 4,75 | 0,100 |
| Alphaschwelle 0,20 | 62,0 | 41,3 | 4,11 | 0,100 |
| Alphaschwelle 0,60 | 78,6 | 53,7 | 5,21 | 0,097 |
| **ohne Karten** | 113,8 | 66,0 | **1,93** | **0,029** |
| ohne Hüllkörper | 72,3 | 48,3 | 5,60 | 0,116 |

**Kein einziger Materialschalter bewegt etwas.** Die Normalenkarte, die in
Paket „Laubprobe" als Hauptquelle des *Hochpasses* gemessen wurde, trägt zum
*Zittern* 0,12 von 4,75 bei. Was zittert, sind die Blattkarten selbst: Ohne sie
ist die Krone so ruhig wie die Wiese. Das ist kein Beleuchtungs- und kein
Filterfehler, sondern Unterauflösung — ein Nadelbündel ist auf 30 m ein
Bildpunkt, und jede Vierteldrehung tastet ein anderes ab.

### Der naheliegende Schluss war falsch, und das Bild hat es gezeigt

Wenn die Karten zittern und der Hüllkörper ruhig ist: Karten ausblenden,
Hüllkörper übernehmen lassen. Gebaut (Ausblendung 12 → 26 m, Hüllkörper zum
Ausgleich um 0,62 nachgedunkelt), und das Zittern fiel wie erhofft auf 0,027.

Im Bild stand danach **keine Krone mehr**, sondern eine Traube einzelner Klumpen
mit Luft dazwischen. Der Hüllkörper ist als Verdecker *hinter* den Karten
gebaut; er kann nicht übernehmen, was er nie getragen hat. Verworfen.

### Was stattdessen dasteht

Die Karten bleiben, sie werden nur aus einer **gröberen Mipmap-Stufe**
abgetastet: `texture2D(map, vMapUv, bias)` mit einem Bias, der zwischen 12 und
26 m einblendet. Das trifft genau die gemessene Ursache — nicht die Karte
zittert, sondern die Nadelzeichnung darauf. Eine Stufe höher gemittelt ist
dieselbe Zeichnung eine weiche Masse, und eine weiche Masse ist, was eine
Konifere aus 30 m ist.

**Die Stärke ist gemessen, nicht gewählt.** Die Streuung im Kasten verrät, ob die
Karten noch da sind: 47,8 mit, 65,8 ohne.

| Bias | Streuung | Zittern | Quotient |
| --- | --- | --- | --- |
| 0 (Stand) | 47,8 | 4,75 | 0,099 |
| **1,8** | **51,1** | **3,20** | **0,063** |
| 2,2 | 55,8 | 2,97 | 0,053 |
| 2,8 | 65,1 | 2,84 | 0,044 |
| 3,8 | 65,8 | 1,76 | 0,027 |

Ab 2,8 steht die Streuung auf dem Wert **ohne** Karten: Das Alpha ist so weit
heruntergemittelt, dass die Karte unter die Schwelle fällt — die Ruhe von 0,027
ist dieselbe wie beim verworfenen ersten Anlauf und auf demselben Weg erkauft.
1,8 ist der größte Bias, bei dem die Krone noch eine Krone ist.

Der Schattenwurf bleibt unberührt: Das Tiefenmaterial tastet ohne Bias ab. Ein
Baum, dessen Schatten beim Weggehen weich wird, wäre ein schlimmerer Fehler als
der, den diese Stufe behebt.

### Offen, und das gehört hierher

**36 Prozent des Zitterns sind weg, 64 Prozent stehen noch da** (Quotient 0,099
→ 0,063 gegen 0,039 auf der Wiese). Der Rest sitzt in der Silhouette der Karten
gegen den hellen Himmel und ist mit vierfachem MSAA nicht weiter zu bekommen.
Was wirklich helfen würde, wäre ein Hüllkörper, der die Krone **trägt** statt sie
nur zu verdecken — dann könnte die Fernstufe die Karten ganz abschalten. Das ist
ein Umbau der Kronengeometrie und damit ein eigenes Paket, kein Nachtrag zu
diesem.

### Berichtigung an meiner eigenen Commit-Nachricht

In der Nachricht zu `a2e5f59` steht für die ferne Krone „2,70 → 2,02, Quotient
0,240 → 0,098". Das sind die Zahlen des Laufs mit **Bias 2,2**, nicht die des
ausgelieferten Standes. Nachgemessen am gebauten Stand:

    ferne Krone   Zittern 2,70 → 1,83   Quotient 0,240 → 0,125

Das Zittern fällt also stärker als angegeben, der Quotient weniger. Der Fehler
kam davon, dass ich die Zeile aus der Sweep-Tabelle übernommen habe, statt am
fertigen Stand nachzumessen. Die Zahlen für die nahe Krone (3,20 / 0,063) sind
richtig.

### Regression und Kosten

Kein Objekt, kein Dreieck, kein Byte Textur, kein Draw-Call: 78 / 299 192 /
11,83 MB, unverändert gegenüber Paket C. Nachthimmel und Konstrukt **bitgleich**,
Dojo Δmax 4 bei 0,007 %, Zen-Prüfstand unverändert. Build grün, Konsole frei von
Errors und Warnings.

## Paket E — Der Bach ist ein Farbstreifen ohne Bett (Prüferbefund 5)

Ein früheres Paket hat hier die **Oberfläche** bearbeitet: Kräuselung, weiches
Ufer in der Deckkraft, Schaumsaum. Der Prüfer meldet den Bach trotzdem wieder, und
sein Wort ist diesmal **Bett**. Der Querschnitt durch `2-waterfall` bei y = 405
sagt, woran es liegt:

| | vorher |
| --- | --- |
| Wiese links | L 169,4 (148 \| 180 \| 127) |
| Wasser | L 180–194 (137 \| 194 \| 208) |
| Wiese rechts | L 169,4 (148 \| 180 \| 127) |

Das Wasser ist **heller** als seine Umgebung, der Übergang drei Bildpunkte breit,
und links wie rechts steht exakt derselbe Grünton. Es gibt kein einziges dunkles
Bildelement — kein Ufer, keinen nassen Saum, keine Rinne. Ein Bach in der Natur
sitzt immer in einem dunkleren Rahmen; das ist der Grund, warum man ihn überhaupt
als Vertiefung liest und nicht als aufgemalten Strich.

### Der Abstand zum Bach als Attribut, nicht als Scheitelfarbe

Das Ufer ist rund einen Meter breit, die Ringe der Deckfläche liegen 0,28 lokal
(1,1 m) auseinander. Eine Uferfarbe an den Scheitelpunkten fände deshalb
höchstens jeden zweiten Ring — genau die Falle, die schon die Grasnarbe
verschluckt hat.

Ein **Abstand** dagegen überlebt die Interpolation: Er läuft zwischen zwei
Scheitelpunkten fast genau linear, und die scharfe Schwelle setzt der Shader je
Bildpunkt. `buildIslandBody` schreibt deshalb `shape.riverDist` als
Vertex-Attribut `bachAbstand`; ein Meter Ufer wird so auf einem Netz mit 1,1 m
Maschenweite eine saubere Kante. Auf den Mini-Inseln liefert `riverDist` 99 —
dort passiert nichts.

### Drei Zutaten

* **Nasser Kies statt Gras** in den letzten 0,6 m vor dem Wasser, dunkel und
  fast entsättigt, zum Wasser hin noch dunkler. Die Uferlinie franst über
  dasselbe Fleckenrauschen aus, das die Wiese trägt, damit sie keine zweite
  gerade Kante wird.
* **Korn auf dem Kies.** Aus der Kamera von `2-waterfall` liegt das nahe Ufer
  fast in der Blickachse und zieht sich über ein Viertel der Bildbreite; ohne
  eigene Zeichnung stand dort eine glatte braune Fläche — ein Schmutzfleck, kein
  Kies. Zwei Lagen, 5 cm und 1,2 cm, an die Weltkoordinate gebunden wie die
  Grasnarbe.
* **Das Wasser wird durchsichtig.** Deckkraft 0,92 → 0,70. Bis zu diesem Paket
  lag unter dem Wasser dieselbe Wiese wie daneben; ein durchsichtiger Bach hätte
  grünes Gras gezeigt. Mit dem Kiesbett darunter wird aus der Durchsicht Tiefe.

### Der Maßstab war beim ersten Anlauf wieder falsch

Zuerst stand das Ufer auf `riverDist` 0,30 bis 0,64 lokal. Das Wasserband hat
eine halbe Breite von 0,12 an der Quelle und 0,25 an der Lippe — der Streifen lag
also nicht am Wasser, sondern **daneben**, vier Meter breit über der halben
Wiese. Richtige Idee, falscher Maßstab, derselbe Fehler wie bei den Grashorsten
eine Runde zuvor. Jetzt 0,145 bis 0,335 lokal, also 0,58 bis 1,34 m von der
Lauflinie.

### Ergebnis

Derselbe Querschnitt, y = 405, jetzt über 180 Bildpunkte:

    Wiese      169,9  168,8  167,5
    Böschung   162,7  155,0  149,2  143,6  140,5  138,0
    Wasser     165,6  167,8  168,5  166,8  166,6  167,0  171,9  174,8
    Böschung   172,1  146,9  128,9  134,2  142,0  148,0  155,0
    Wiese      160,4  164,2  165,5  167,2  168,9

Tonwertumfang über den Querschnitt **25 → 46 Stufen**, und der Bach hat zum
ersten Mal einen dunklen Rahmen: Minimum 128,9 am Ufer gegen 169,4 auf beiden
Seiten vorher. Die Differenzkarte zeigt zwei Bänder entlang des Laufs und sonst
nichts.

### Regression und Kosten

Kein Objekt, kein Draw-Call, kein Byte Textur; ein Float je Scheitelpunkt des
Inselkörpers. 78 / 299 192 / 11,83 MB, unverändert. Nachthimmel und Konstrukt
**bitgleich**, Dojo Δmax 6 bei 0,010 %, Zen-Prüfstand unverändert bei 93 /
74 606 / 21,53 MB. Build grün, Konsole frei von Errors und Warnings.

## Paket F — Kiel als geprägtes Leder, Erdband als reine Malerei (Prüferbefund 6)

Zwei Hälften, zwei Ursachen, ein Paket.

### Der Kiel: geprägtes Leder

Im vierfach vergrößerten Ausschnitt von `3-edge-down` (400,300)–(600,400) ist es
nicht zu übersehen: weiche, gerundete, wandernde Wülste ohne eine einzige Kante.

Die Ursache steht in `cliffMaps()` aus dem Dojo-Satz — einer Summe aus
gebrochenem Rauschen plus zwei Rissscharen. Für eine **Gartenmauer aus behauenem
Stein** ist das genau richtig, und dort steht sie weiter. Eine Felsflanke von
vierzig Metern ist etwas anderes: Fels bricht entlang von Flächen, was man sieht
sind **ebene Facetten mit scharfen Kanten dazwischen**. Gerundetes Rauschen kann
das nicht liefern, egal mit wie vielen Oktaven — es hat per Konstruktion keine
Kante.

Neu ist deshalb ein inselzugehöriges Feld: ein Zellenrauschen, bei dem jede Zelle
nicht einen Buckel trägt, sondern eine **geneigte Ebene**. An der Zellgrenze
springt die Neigung, und genau dort entsteht die Kante. Drei Lagen (75 cm, 30 cm,
10 cm), gekachelt über Zellindizes modulo der Zellenzahl.

**Drei Fehlversuche, alle gemessen:**

* **Eine gemeinsame Materialinstanz für alle Inseln.** `addSkyRim` umhüllt
  `onBeforeCompile`, und der Aufruf steht einmal je Insel — die Hüllen legten
  sich übereinander, der Shader ging nicht durch, und im Bild stand dort, wo der
  Kiel sein sollte, **der Himmel** (Kastenmittel 64,7 → 180,1). Genau dafür stand
  am alten `cliffMaterial()` das `.clone()`, dessen Kommentar zwei Zeilen weiter
  die Begründung nennt. Jetzt wieder eine Instanz je Aufruf; die Karten selbst
  bleiben geteilt.
* **Zellenzahlen 6, 18, 54.** Alle drei Gitter lagen aufeinander — jede
  Zellgrenze der groben Lage war zugleich eine der feinen, und die Kanten liefen
  als Treppe entlang der Achsen. Dieselbe Lehre wie bei der Grasnarbe, nur dass
  sich eine Kachel nicht drehen lässt: jetzt 5, 13, 37 mit eigenen Versätzen.
* **Neigung 0,55, Stufe 0,62.** Die Kanten waren da, die Flächen daneben aber
  gleich hell — der mittlere Nachbarunterschied fiel von 1,37 auf **0,83**, die
  Wand war flacher als das Leder davor. Eine Facette ohne Neigung ist kein
  Bruchstück, sondern ein Umriss. Jetzt Neigung 1,9 und Stufe 0,34.

### Das Erdband: reine Malerei, wörtlich

Zwischen Grasnarbe und Fels läuft ein Band aus Erdreich um die ganze Insel. Sein
Material war `new MeshStandardMaterial({ vertexColors, roughness: 1,
flatShading })` — **keine Karte, keinerlei Relief.** Alles, was dort stand, war
die Scheitelfarbe an einem Netz mit gut einem Meter Maschenweite.

Erde ist nicht facettiert wie Fels und nicht gewellt wie Leder, sie ist
**krümelig**. Dieselbe Zellmaschinerie, aber mit dem **Abstand** statt der
Facettenebene: Schollen von 40 cm, Brocken von 14 cm, und einzelne Steine von
5 cm, die nur in jeder dritten Zelle sitzen — sonst wäre es eine Pflasterung.

### Ergebnis

Mittlerer Nachbarunterschied, `3-edge-down`:

| Bereich | vorher | nachher |
| --- | --- | --- |
| Kiel (380,240)–(700,420) | 1,37 | **1,98** |
| Erdband (60,150)–(360,240) | 0,88 | **3,00** |

Der Zwischenstand nach dem Felspaket allein zeigt 0,90 im Erdband — die beiden
Änderungen sind sauber getrennt.

### Regression und Kosten

Zwei neue Kartenpaare zu je 512²: Texturspeicher 11,83 → **17,17 MB** von 60.
Draw-Calls und Dreiecke unverändert (78 / 299 192). `cliffMaps()` und
`cliffMaterial()` bleiben unangetastet — Nachthimmel und Konstrukt **bitgleich**,
Dojo Δmax 4 bei 0,008 %, Zen-Prüfstand unverändert bei 93 / 74 606 / 21,53 MB.
Build grün, Konsole frei von Errors und Warnings.

## Paket G — Die Kronen tragen keine Lichtmodellierung (Prüferbefund 7)

In `4-aerial` über die Krone der vorderen Konifere bandweise gemessen, von oben
nach unten: **56,2 / 48,2 / 50,1 / 50,8 / 47,7 / 49,1**. Sieben Stufen Spanne,
und nicht einmal monoton — bei einer Sonne, die 38,7 Grad hoch steht. Eine
Baumkrone ist gerade das Gegenteil: oben voll besonnt, unten tiefer Schatten.

### Der Schattenwurf löst es nicht, und das ist gemessen

Naheliegend wäre `receiveShadow` auf den Kronen — sie werfen längst Schatten,
sie empfingen nur keine. Eingeschaltet und dieselben Bänder nachgemessen:

    ohne   oben 56,2 … unten 49,1     Spanne 7,1   Mittel 50,0
    mit    oben 49,1 … unten 46,1     Spanne 3,0   Mittel 45,3

Die Krone wird um fünf Stufen **dunkler** und ihre Spanne **kleiner**. Der Grund:
Die Kartennormalen zeigen in alle Richtungen, der Schattenterm fällt dadurch über
die ganze Krone gleichmäßig an — er nimmt Licht, ohne es zu verteilen. Dieselbe
Rechnung wie bei der Normalenkarte der Nadeln: Tiefe mit Dunkelheit gekauft.
Wieder ausgebaut, die Messung steht als Begründung im Quelltext.

### Was stattdessen dasteht

**Kronenverdeckung, beim Bauen ausgerechnet.** Für jeden Schopf wird gezählt, wie
viel Laub senkrecht über ihm steht — gewichtet nach Abstand vom Lot und mit der
Höhe abklingend, damit nicht ein Wipfel den ganzen Baum bis zum Boden gleich
stark verdunkelt. Das Ergebnis geht in die Instanzfarbe. Zur Laufzeit kostet es
nichts: kein Draw-Call, kein Dreieck, kein Byte Textur, keine Shader-Zeile.

**Der Mittelwert wird abgezogen.** Ein Term, der nur abdunkelt, kauft
Modellierung mit Dunkelheit — genau die Falle, in die der Schattenwurf zwei
Absätze weiter oben getappt ist. So wird die Oberseite heller und die Unterseite
dunkler, das Mittel bleibt.

### Ergebnis

Dieselben Bänder, oben nach unten:

    vorher   56,2  48,2  50,1  50,8  47,7  49,1    Spanne  8,5   Mittel 50,0
    nachher  62,7  53,1  51,9  50,5  43,0  43,2    Spanne 19,7   Mittel 50,1

Die Spanne wächst auf mehr als das Doppelte, der Verlauf ist zum ersten Mal
**monoton**, und die Krone ist im Mittel nicht dunkler geworden (50,0 → 50,1).

### Die anderen Umgebungen bekommen sie nicht

`baueKrone` bedient auch Dojo und Zen-Garten. Die Verdeckung ist deshalb ein
Parameter mit Vorgabewert 0 und wird nur von der Insel gesetzt — dieselbe Regel
wie beim Himmelssaum: Der Befund ist auf der Insel gemessen, und ein Auftrag über
die Insel ist kein Freibrief, eine andere Umgebung nebenbei zu verändern.

### Regression und Kosten

78 Draw-Calls, 299 192 Dreiecke, 17,17 MB — **unverändert** gegenüber Paket F.
Die Verdeckung ist eine Rechnung beim Bauen (O(n²) über die Schöpfe einer Insel)
und danach eine Instanzfarbe. Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 5
bei 0,009 %, Zen-Prüfstand unverändert. Build grün, Konsole frei von Errors und
Warnings.

## Paket H — Das Gegenlichtbild ist keins (Prüferbefund 8)

### Ein umgedrehtes Vorzeichen, gegen den eigenen Kommentar

Das Laubmaterial hat einen Transluzenzterm, und der hat eine Blickabhängigkeit
mit dem Kommentar: „Ein Blatt leuchtet am stärksten, wenn man in die Sonne
schaut." Die Zeile darunter tat das Gegenteil:

```
float fView = max( 0.0, dot( geometryViewDir, fLight.direction ) );
```

`geometryViewDir` zeigt **vom Fragment zur Kamera**, `fLight.direction` vom
Fragment **zur Lichtquelle**. Wer in die Sonne blickt, steht ihr gegenüber — die
Vektoren zeigen dann auseinander und das Skalarprodukt ist **negativ**. Mit
`max(0, …)` lief der Effekt genau dort auf seinem Sockel von 0,40, wo er sein
Maximum haben sollte, und auf Maximum, wenn die Sonne im Rücken steht.

Das neue `tools/gegenlicht.mjs` liest den Term aus, statt ihn zu vermuten, und
misst zugleich differenziell, was er beiträgt. In `5-backlight`:

    zur Sonne                     0,469 | 0,625 | -0,625
    Blickachse                    0,691 | 0,274 | -0,669
    Blickachse · Lichtrichtung   +0,913   (die Kamera sieht fast genau hinein)
    geometryViewDir · lightDir   -0,913   →  geklemmt auf 0

    Transluzenz x 0   Kastenmittel 39,3
    Transluzenz x 1                51,8
    Transluzenz x 3                68,0

Der Term wirkt also — er wirkte nur an der falschen Stelle. Das ist die Erklärung
für den Prüferbefund, und sie ist keine Geschmacksfrage: Es war nicht zu wenig
Effekt, es war der Effekt am falschen Ort.

### Ergebnis

`5-backlight`, Kasten über der vorderen Konifere (880,40)–(1270,520), nur
Laubpixel:

| | vorher | nachher |
| --- | --- | --- |
| Mittel | 38,9 | **46,0** |
| Anteil über L 110 | 0,86 % | **4,58 %** |
| \|dx\| im ganzen Kasten | 19,80 | 22,49 |

Im Bild leuchten die Nadeln am Silhouettenrand jetzt gelbgrün durch, statt als
schwarze Masse zu stehen. Δ über das ganze Bild: 10,5 % der Bildpunkte ändern
sich um mindestens 8 Stufen.

### Dies ist die eine Änderung, die die anderen Umgebungen mitnimmt

`foliageMaterial` bedient Dojo und Zen-Garten. Sonst gilt in diesem Auftrag: Ein
auf der Insel gemessener Befund ist kein Freibrief, eine andere Umgebung zu
verändern — beim Himmelssaum und bei der Kronenverdeckung steht es genau so im
Protokoll. **Hier gilt es nicht**, und der Unterschied ist nicht Bequemlichkeit:
Dort ging es um eine Abwägung, hier um ein Vorzeichen, das dem eigenen Kommentar
widerspricht. Eine korrigierte Kopie für die Insel neben der falschen Fassung für
alle anderen wäre die schlechtere Technik.

Gemessen, was es dort bewirkt:

| Prüfbild | ≥ 2 Stufen | ≥ 8 | Δmax |
| --- | --- | --- | --- |
| Zen `a-eyelevel` | 3,93 % | 3,65 % | 59 |
| Zen `c-torii` | 2,21 % | 2,12 % | 64 |
| Zen `e-sand` | 2,65 % | 2,53 % | 63 |
| Zen `f-grove` | 1,64 % | 1,55 % | 60 |
| Zen `b-pond` | 0,00 % | 0,00 % | 0 |
| Dojo-Übersicht | 0,01 % | 0,00 % | 5 |
| Nachthimmel, Konstrukt | 0,00 % | 0,00 % | 0 |

Angesehen: Die Sakura im Zen-Garten steht gegen die tief stehende Sonne und
leuchtet jetzt warm durch, statt stumpf zu bleiben. Das ist dort dieselbe
Verbesserung wie auf der Insel — die Kamera des Zen-Gartens schaut ebenfalls ins
Licht. `b-pond` ändert sich um **null** Bildpunkte: Dort steht kein Laub im
Gegenlicht. Das ist die Gegenprobe dafür, dass die Änderung tut, was sie soll,
und nichts anderes.

### Regression und Kosten

Eine Zeile Shader, kein Draw-Call, kein Dreieck, kein Byte Textur. Zen-Prüfstand
unverändert bei 93 / 74 606 / 21,53 MB, Insel bei 78 / 299 192 / 17,17 MB. Build
grün, Konsole frei von Errors und Warnings.

## Paket I — Freischwebende Felsen an der Inselkante (Prüferbefund 9)

### Erst ein Fehlschlag beim Messen, und der gehört ins Protokoll

Der erste Versuch, den Befund zu beziffern, war `tools/schwebeprobe.mjs`: Ein
Block, der über die Kante ragt, lässt unter sich Himmel stehen — also den Himmel
vom Bildrand her fluten und zählen, was eingeschlossen übrig bleibt. In
`3-edge-down` fand das Werkzeug elf Löcher mit zusammen 3005 Bildpunkten. Nachgesehen
waren es **legitime Himmelstaschen** zwischen der nahen und der fernen
Inselkante, nicht Luft unter Felsen. Nach der Korrektur meldet es exakt dieselben
3005 Bildpunkte — die Gegenprobe dafür, dass es den Befund nie gemessen hat.

Das Werkzeug bleibt trotzdem im Baum: Es beantwortet eine sinnvolle Frage, nur
nicht diese.

### Gemessen wurde am Verzeichnis, nicht am Bild

`shape.blocked` führt jeden belegten Platz mit Ort und Radius. Der Abstand jedes
Eintrags zur dortigen Kante (`radius · outline(a)`) ist damit direkt auszulesen.
Im ausgelieferten Stand:

| | Anzahl von 25 |
| --- | --- |
| jenseits des Umrisses (> 1,00) | **6** |
| jenseits von 0,96 | **11** |
| äußerster Eintrag | **1,038** |

0,96 ist die Linie, an der `shape.frei` schon jeden Bewuchs verweigert, weil dort
die Grasnarbe abfällt. Sechs Blöcke standen jenseits des Umrisses überhaupt.

### Die Ursache stand vier Zeilen über der Lehre

    const rf = 0.92 + rand() * 0.12;    // 0,92 … 1,04

Bei den Findlingen, vier Zeilen weiter unten, steht seit einem früheren Paket
genau dieser Befund im Quelltext: „Ohne den Faktor ist 0,92 · radius in der Bucht
das 1,5-fache der dortigen Kante — und der Block hängt frei im Himmel neben der
Insel." Die Knöchel hatten `outline(a)` immer; was ihnen fehlte, war die
Obergrenze.

### Der Mittelpunkt genügt nicht

Ein Mittelpunkt bei 0,96 reicht nicht: Ein Block mit Halbmaß 0,31 ragt von dort
immer noch hinaus. Maßgeblich ist die **Außenflanke**, und die lässt sich erst
rechnen, wenn das Halbmaß gezogen ist:

    const rad = Math.min(kante * rf, kante - s * 1.15);

Der Faktor 1,15 deckt die Streuung von `boulderGeometry` und die anschließende
Skalierung bis 1,45 in x und z.

Dazu: **zur Kante hin tiefer einsinken.** Ein Block, der am Saum nur zu einem
Fünftel steckt, steht auf der Lippe statt in ihr. Die Einsenkung wächst deshalb
mit `smoothstep(0.80, 0.98, rad/kante)` um bis zu 0,45 Halbmaße.

### Ergebnis

| | vorher | nachher |
| --- | --- | --- |
| jenseits des Umrisses | 6 | **0** |
| jenseits von 0,96 | 11 | **2** |
| äußerster Eintrag | 1,038 | **0,975** |

Im Bild sitzen die Blöcke am Kantensaum jetzt **in** der Kante statt darauf.

### Was sich sonst noch bewegt hat, und warum

Die Prüfbilder ändern sich um 0,2 bis 5,7 Prozent der Bildpunkte. Der
Zufallsstrom ist dabei **nicht** verschoben: Die Rinnenprüfung sitzt weiter vor
der Ziehung des Halbmaßes und trifft dieselben Entscheidungen, Bäume und
Findlinge werden also aus demselben Strom an denselben Stellen gezogen. Was sich
ändert, sind die Einträge in `shape.blocked` — und `shape.frei` fragt sie ab.
Blumen, Grashorste und Unterholz werden dadurch an anderen Stellen abgewiesen und
sitzen anders. Das ist die Folge der Korrektur, nicht ein zweiter Eingriff.

### Regression und Kosten

93 / 74 606 / 21,53 MB im Zen-Prüfstand, unverändert. Nachthimmel, Konstrukt und
**alle sechs Zen-Bilder bitgleich** gegenüber dem Vorstand, Dojo Δmax 5 bei
0,009 %. Build grün, Konsole frei von Errors und Warnings.

## Paket J — Rinde ohne Struktur (Prüferbefund 10)

Ein früheres Paket hat `rindenKorn()` gebaut, und der Prüfer meldet die Stämme
trotzdem wieder als glatt. Am vorderen Stamm in `5-backlight`, Kasten im
Stamminneren (1004,500)–(1022,566): mittlerer Nachbarunterschied **2,59** von 255
bei einer Standardabweichung von 13,3. Ein Stamm auf acht Metern trägt damit
weniger Zeichnung als die Wiese auf zwanzig.

### Erst der falsche Kasten, dann der richtige

Der erste Messkasten saß neben dem Stamm. Aufgefallen ist es erst, als eine
Verdoppelung der Amplitude die Zahl um zwei Prozent bewegte. Die Maske kam
danach differenziell: `island-holz` ausblenden und zählen, welche Bildpunkte sich
ändern — 5941 Holzpixel, dichteste Blöcke bei (992,480) bis (1024,576). Mein
Kasten lag bei x = 1028, also **vier Bildpunkte daneben**. Ohne die
Differenzmaske hätte ich aus einer Messung neben dem Gegenstand geschlossen, der
Shader laufe nicht.

### Zwei Befunde, einer davon eine Entartung

**Erstens die Koordinate.** Es stand `u = (x + z) · 26`, mit der Begründung, die
Waagerechte des Weltorts laufe über die sichtbare Hälfte eines Stammes monoton.
Das stimmt für die meisten Stämme und für manche gar nicht: Steht die sichtbare
Flanke so, dass x und z sich gegenläufig ändern, bleibt x + z über die ganze
Breite **konstant** — und der Stamm trägt exakt nichts. Zwei um 23 Grad
gegeneinander gedrehte Projektionen beheben es; wo die eine entartet, läuft die
andere voll durch. Kostet eine zweite Rauschabfrage und keinen Atan.

**Zweitens, und das war der größere Anteil: die Amplitude.** Sie stand auf 0,30
und 0,20. Eine Probe mit dem Fünffachen zeigte, dass der Shader durchaus läuft
(|dx| 2,59 → 7,32) — er war nur zu leise. Gemessen über drei Stände:

| Amplitude | \|dx\| im Stamminneren |
| --- | --- |
| 0,30 (Stand) | 2,59 |
| 0,62 | 2,64 |
| 2,00 | **5,27** |
| 3,00 | 7,32 |

Der Sprung von 0,30 auf 0,62 bringt nichts, weil die zwei gemittelten
Rauschabfragen die Streuung wieder wegnehmen, die die höhere Amplitude bringt.
Ausgeliefert ist 2,00 mit 1,00 auf der groben Lage; bei 3,00 beginnt die Rinde,
über den Stamm zu kriechen statt ihn zu gliedern.

Dazu eine dritte Lage für das Nahfeld — Schuppen von 1,2 cm, ausgeblendet
zwischen 3 und 8 m, bevor sie unter einen Bildpunkt fallen.

### Wackeltest

`--dreh`, Viertelbildpunkte, Stamminneres: Zittern 2,13 bei einer Streuung von
14,2, Quotient **0,150**, max dL 24. Zum Vergleich: die Wiese liegt bei 0,039,
die Nadelkrone bei 0,063. Die Rinde ist gutmütig — ihre Merkmale sind zehn
Bildpunkte breit.

### Regression und Kosten

Zwei zusätzliche Rauschabfragen im Fragment-Shader der Stämme, sonst nichts:
93 / 74 606 / 21,53 MB im Zen-Prüfstand, unverändert. Alle sechs Zen-Bilder,
Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 4 bei 0,007 %. Build grün,
Konsole frei von Errors und Warnings.

## Paket K — Wolken als unbeschattete Watte (Prüferbefund 11)

Ein früheres Paket hat die Wolken von flachen Papierblobs zu Ballenhaufen
gemacht, ihnen einen Silberrand gegeben und die Sonnenrichtung in die
Scheitelfarben gebacken. Der Prüfer meldet sie trotzdem als Watte. Tonwertumfang
über alle Wolkenpixel (p05 bis p95):

| Prüfbild | vorher |
| --- | --- |
| `1-eyelevel` | 57,3 |
| `4-aerial` | 38,4 |
| `3-edge-down` | 54,1 |

### Ein Rechenfehler, der die Basisabdunklung geviertelt hat

Es stand `maxY = max(|y|)` und `up = y / maxY`. Nach dem **Abflachen der
Unterkante** — einem Schritt, den ein früheres Paket eingeführt hat — liegt der
Boden aber bei −0,34·size, während der Gipfel bis +1,4·size reicht. `up`
erreichte an der Basis damit nur **−0,24** statt −1, und der Term `+0,24·up` nahm
dort sechs Hundertstel statt einem Viertel.

Genau die Basis ist aber die Fläche, die man von unten sieht, und sie war fast so
hell wie der Gipfel. `up` läuft jetzt über die tatsächliche Höhenspanne der
Wolke, −1 an der Unterkante bis +1 am Gipfel.

### Und die Wolke war als EIN Körper modelliert

Die vorhandenen Terme sagen: Sonne vorn hell, hinten dunkel, oben heller. Das ist
die Modellierung einer Kugel. Was fehlte, ist die Wolke als **Haufen** — die
tiefen Kerben dort, wo ein Lappen den nächsten beschattet. Genau daraus besteht
das Bild einer Kumuluswolke.

Gerechnet wird es beim Bauen, nach demselben Muster wie die Kronenverdeckung: von
jedem Scheitelpunkt fünf Schritte Richtung Sonne, und gezählt, wie viel
Ballenmasse dabei durchquert wird. Zur Laufzeit kostet es nichts — kein
Draw-Call, kein Dreieck, kein Byte Textur, keine Shader-Zeile.

### Ergebnis

| Prüfbild | vorher | nachher |
| --- | --- | --- |
| `1-eyelevel` | 57,3 | **70,7** |
| `4-aerial` | 38,4 | **47,0** |
| `3-edge-down` | 54,1 | **58,1** |

Im Bild trennen sich die Lappen: Zwischen den Ballen steht jetzt eine Kerbe, die
Unterkante ist als Schattenfläche zu erkennen, und der Silberrand sitzt auf einem
Körper statt auf einer Fläche.

### Was ich beim Messen falsch gemacht habe

Der erste Messkasten lag auf einer Wolkengruppe, die sich nicht geändert hatte —
n und alle Perzentile waren zwischen den beiden Ständen **bitgleich**, und ich
war kurz davor zu schließen, der Eingriff greife nicht. Die Differenzkarte zeigte
den Schwerpunkt der Änderung 200 Bildpunkte daneben. Seither wird der
Wolkenanteil über eine Farbmaske über das **ganze** Bild gemessen und nicht über
einen von Hand gesetzten Kasten. Derselbe Fehler wie beim Stamm eine Runde zuvor,
und ich habe ihn ein zweites Mal gemacht.

### Regression und Kosten

Alles beim Bauen gerechnet: 93 / 74 606 / 21,53 MB im Zen-Prüfstand, unverändert.
Alle Zen-Bilder, Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 4 bei
0,007 %. Build grün, Konsole frei von Errors und Warnings.

## Paket L — Vögel als schwarze Klingen (Prüferbefund 12)

Ein früheres Paket hat die Vögel von `MeshBasicMaterial` auf Lambert umgestellt,
weil beide Flügel sonst denselben Wert trugen (p05 63 / p50 63 — mehr als die
Hälfte aller Punkte auf einem Wert). Der Prüfer meldet sie trotzdem als schwarze
Klingen. Auf der Maske des Knotens `birds` in `4-aerial`:

    Mittel 62,7   p05 32   p50 55   p95 157

Ein Drittel des Tonwertumfangs liegt unter L 32, während der andere Flügel bei
157 steht. Im vergrößerten Ausschnitt steht es nebeneinander **im selben Tier**:
ein grauer Flügel, ein fast schwarzer Keil.

### Ein gespiegelter Flügel ist innen außen

Der zweite Flügel entsteht durch `scale.x = -1`. Eine Spiegelung dreht den
Umlaufsinn der Dreiecke um; three sieht sie damit als Rückseiten und kehrt bei
`DoubleSide` die Normale um. Der eine Flügel zeigt dem Licht also seine Ober-,
der andere seine Unterseite — und bei einer Sonne, die 38,7 Grad hoch steht, wird
aus dem einen eine graue Fläche und aus dem anderen ein schwarzer Keil.

Das ist kein Beleuchtungsfehler der Szene, sondern eine Folge der Spiegelung, und
es war durch die Umstellung auf Lambert **erst sichtbar geworden**: Ein
unbeleuchtetes Material bemerkt eine umgedrehte Normale nicht.

Ein Vogelflügel ist auf fünfzehn Bildpunkten eine dünne Membran; seine beiden
Seiten sehen von außen gleich aus. Die Normale wird deshalb immer auf die
Himmelsseite gedreht. Dann schattieren beide Flügel gleich, und die V-Stellung
bleibt als feiner Unterschied erhalten statt als Kontrast von achtzig Stufen.

### Ergebnis

`4-aerial`, Maske des Knotens:

| | vorher | nachher |
| --- | --- | --- |
| Mittel | 62,7 | **88,0** |
| p05 | 32 | **72** |
| p50 | 55 | **74** |
| p95 | 157 | 167 |

Gegen den Himmel bleiben sie Silhouetten, wie sie sollen: `5-backlight` Mittel
117,6, `1-eyelevel` Mittel 89,7 — bei einem Himmel um 200.

### Offen

Der Flügel, der in `4-aerial` streifend gesehen wird, steht weiter bei L 74 gegen
eine Wiese von 180. Das ist kein umgedrehter Schatten mehr, sondern die
Silhouette einer Fläche ohne Dicke unter flachem Winkel — sie liest als
schmaler dunkler Strich. Beheben ließe sich das nur mit einem Flügel, der Dicke
hat, und das sind Dreiecke für ein Tier von fünfzig Bildpunkten. Steht als
offener Punkt, nicht als erledigt.

### Regression und Kosten

Eine Zeile im Fragment-Shader der Vögel, sonst nichts. 93 / 74 606 / 21,53 MB im
Zen-Prüfstand, unverändert. Alle Zen-Bilder, Nachthimmel und Konstrukt
**bitgleich**, Dojo Δmax 4 bei 0,008 %. Build grün, Konsole frei von Errors und
Warnings.

## Paket M — Die Bodendekoration als wiederholte Doppelmarke (Prüferbefund 13)

Sein Wort trifft es: Jede Blume war ein dunkelgrüner Stab mit einem weißen Klumpen
darauf, neunzigmal derselbe Umriss, und der Stab endete ohne Übergang in der
Grasnarbe. Das ist eine Stecknadel, keine Pflanze.

### Was gemessen besser geworden ist

**Der Stiel war zu dunkel.** Ein Zylinder aus drei Seitenflächen kehrt der Sonne
immer nur eine zu; die anderen beiden liegen im Schatten. Mit `0x5f8f45` stand er
als fast schwarzer Strich auf blasser Wiese. Jetzt `0x7ba055`.

**Der Fuß fehlte.** Eine Grundrosette aus vier kurzen Blättern, sechzehn Dreiecke
je Blume. Sie verdeckt zugleich die Stelle, an der der Zylinder den Boden
schneidet.

Auf der Maske des Knotens `flowers` in `1-eyelevel`:

| | vorher | nachher |
| --- | --- | --- |
| Bildpunkte | 3326 | **4125** (+24 %) |
| p05 | 66 | **83** |
| Mittel | 153,6 | 156,2 |

p05 ist der dunkelste Fünftel der Blume, also der Stiel: siebzehn Stufen heller.

### Was gemessen NICHT besser geworden ist

Die Skalierung war bisher gleichmäßig — eine große Blume war exakt dieselbe Form
wie eine kleine. Höhe und Kopf werden jetzt getrennt gezogen (aus einem eigenen
Zufallsstrom, damit nichts anderes verschoben wird). Als Maß dafür habe ich die
Streuung des Seitenverhältnisses über alle vierzig Teilstücke der Maske genommen:

    vorher   Mittel 2,07   sd 0,57   Variationskoeffizient 0,274
    nachher  Mittel 2,23   sd 0,63   Variationskoeffizient 0,282

**Das ist kein Beleg.** Der mittlere Umriss ist schlanker geworden, die
Streuung praktisch gleich. Die getrennte Skalierung bleibt drin, weil sie nichts
kostet — aber sie steht hier nicht als Erfolg, sondern als das, was sie ist: eine
Änderung ohne nachgewiesene Wirkung. Was den Umriss wirklich vereinheitlicht, ist
nicht die Skalierung, sondern dass jede Blume dieselbe Geometrie ist: Stiel plus
Klumpen. Das zu ändern hieße mehrere Blütenformen, also mehrere InstancedMeshes
und Draw-Calls; das ist ein eigenes Paket mit einer eigenen Budgetrechnung.

**Und ein Zwischenfall beim Messen:** Der erste Vergleich lief über die acht
größten Teilstücke und gab 0,146 gegen 0,113 — ich hätte daraus geschlossen, die
Streuung sei *gefallen*. Über alle vierzig Stücke gemessen ist sie unverändert.
Acht Stichproben sind für eine Streuungsaussage zu wenig, und die acht größten
sind zudem die nächsten und damit keine Zufallsauswahl. `knotenkasten.mjs` listet
jetzt vierzig statt acht Stücke.

### Ein Baufehler, der still im Bild landete

Die Rosette kommt aus `halmGeometrie`, und die liefert nur Position, Farbe und
Normale — **kein uv**. `mergeGeometries` verlangt bei allen Teilen dieselben
Attribute und gibt sonst `null` zurück: Die Blumen verschwanden vollständig, und
der nächste Frame brach an `boundingSphere` von `null` ab. Im Prüfbild war nur
eine schwarze Fläche zu sehen. Die Konsolenprüfung hat es gefangen — ohne sie
hätte ein leeres Bild wie ein Kamerafehler ausgesehen.

### Regression und Kosten

Sechzehn Dreiecke je Blume, neunzig Blumen: 1440 Dreiecke, kein Draw-Call, kein
Byte Textur. 93 / 74 606 / 21,53 MB im Zen-Prüfstand, unverändert. Alle
Zen-Bilder, Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 4 bei 0,007 %.
Build grün, Konsole frei von Errors und Warnings.

## Paket N — Steinschatten mit gerader Polygonkante (Prüferbefund 14): NICHT REPRODUZIERT

Dieses Paket schließt nichts ab. Es hält fest, was ich gesucht und nicht gefunden
habe, damit die nächste Runde nicht dieselbe Stunde noch einmal ausgibt.

### Was ich gemessen und angesehen habe

* `tools/wurfprobe.mjs` über `6-groundcover`, Kasten (100,250)–(1200,700):
  `island-stones` verdunkelt **0,35 Prozent** der Bildfläche um im Mittel 26,3
  Stufen. In diesem Prüfbild gibt es schlicht kaum Steinschatten zu betrachten.
* `tools/knotenkasten.mjs` auf `island-shadows` in `1-eyelevel`: **121
  Bildpunkte** in drei Stücken. Die weichen Kontaktflecken tragen dort nichts.
* Drei freie Nahaufnahmen mit `tools/blick.mjs`, vier- bis sechsfach vergrößert.
  Die Schattenkanten, die dort zu sehen sind — Busch auf Wiese, Findlingsgruppe
  auf Wiese —, sind **weich und leicht gewellt**, keine Treppen und keine
  geraden Polygonkanten.

### Die eine strukturelle Auffälligkeit, und warum sie trotzdem bleibt

Die Schattenkarte der Inselsonne steht auf **1024**, während Dojo und Mond 2048
fahren. Auf einem Ortho von ±26,4 m sind das 5,2 cm je Texel — die plausible
Ursache für eine Treppenkante, wenn es eine gäbe.

Auf 2048 gestellt und dieselbe Nahaufnahme gerendert: **6,3 Prozent** der
Bildpunkte ändern sich um mindestens zwei Stufen, und im vierfach vergrößerten
Ausschnitt ist **kein Unterschied zu benennen**. Das deckt sich mit der Messreihe
des Nachthimmels, wo die vierfache Karte zehn Prozent der Quantisierung gekauft
hat. Vierfacher Speicher und vierfache Füllrate im Schattendurchgang für nichts
Sichtbares ist auf einer mobilen Brille kein Handel — **zurückgestellt**, mit der
Messung als Begründung im Quelltext.

### Was ich falsch gemacht habe

Ich habe in dieser Runde wieder Kästen von Hand gesetzt und dabei dreimal
danebengelegen, obwohl `tools/knotenkasten.mjs` seit dem Vogelpaket genau dafür
da ist. Ein Messband über eine Schattenkante, das ich zum Schluss legen wollte,
fand in **beiden** Ständen „kein Uebergang" — also lag auch das Band falsch. Die
Aussage dieses Pakets stützt sich deshalb auf die drei belastbaren Messungen oben
und auf das Hinsehen, nicht auf ein Kantenmaß.

### Woran es liegen könnte, dass ich ihn nicht finde

Der Befund stammt aus einer Prüfrunde, die vor zwölf Paketen liegt; seither haben
Felskarte, Erdband, Kronenverdeckung und das Gegenlicht die Beleuchtung dieser
Flächen angefasst. Es ist gut möglich, dass er nebenbei erledigt wurde. Belegen
kann ich das nicht — belegen kann ich nur, dass ich ihn im heutigen Stand nicht
reproduziere.

**Offen.** Wenn der Prüfer beim nächsten Durchgang dieselbe Stelle wieder meldet,
braucht es von ihm die Kamera und den Kasten, nicht die Beschreibung.

## Paket O — Der Wasserfall als verstreute weiße Punkte (Prüferbefund 15)

### Zuerst der Werkzeugfehler, der diese Sitzung fünfmal in die Irre geführt hat

`tools/crop.mjs` nimmt `<x> <y>` als **Mitte** des Ausschnitts, nicht als linke
obere Ecke. Das stand nirgends, und ich habe es die ganze Sitzung über als Ecke
gelesen. Die Folgen stehen verstreut in den letzten Paketen:

* der Stamm-Messkasten „vier Bildpunkte daneben",
* der Wolkenkasten auf einer Gruppe, die sich gar nicht geändert hatte,
* die Krone „zweihundert Bildpunkte daneben",
* ein Messband über eine Schattenkante, das in **beiden** Ständen „kein
  Uebergang" fand,
* und beinahe der Befund „die Gegenlichtkamera zeigt nur Himmel", den nur die
  Pixelstatistik rechtzeitig widerlegt hat.

Jedes Mal habe ich den Fehler bei der Szene gesucht. `crop.mjs` sagt es jetzt im
Kopfkommentar und nimmt zusätzlich `--kasten x0,y0,x1,y1` — genau das Format, in
dem `knotenkasten.mjs` seine Masken meldet, mit zehn Prozent Rand. Wer eine Maske
gemessen hat, soll sie nicht in Mittelpunkt und Breite umrechnen müssen.

Dazu: `knotenkasten.mjs` prüfte nur auf `isMesh` und meldete für den Wasserfall
„0 Netze" — er besteht aus Punktwolken und Sprites. Jetzt auch `isPoints`,
`isSprite`, `isLine`.

### Der Befund, mit dem richtigen Ausschnitt

Mit `--kasten` auf die Maske von `waterfall-sheet` gelegt, ist der Prüfer sofort
zu bestätigen: Der Sturz ist ein **dünner, blasser Kratzer aus einzelnen
Punkten** neben der Felswand — kein Körper, keine Bahn.

`tools/sturzprobe.mjs`, differenziell über alle sechs Prüfbilder:

    waterfall-sheet   in 1 von 6 Bildern vorhanden
    4-aerial          1226 px   Ausschlag Mittel 10,5   groesster 19

Zehn Stufen gegen einen Himmel um L 200. Der Sturz ist da und **unsichtbar**; was
man sieht, sind die Tropfen.

Ein früheres Paket hat genau dies schon einmal angefasst und `emissiveIntensity`
auf 0,5 gesetzt — gemessen 9,1. Der Schritt hat also 1,4 Stufen gebracht und die
Ursache nicht beseitigt.

### Ergebnis

`emissiveIntensity` 0,5 → **1,6**:

| | vorher | nachher |
| --- | --- | --- |
| Fläche | 1226 px | 1250 px |
| Ausschlag Mittel | 10,5 | **20,5** |
| größter Ausschlag | 19 | **34** |
| Hochpass auf der Maske | 4,72 | 6,96 |

Im Bild liest der Sturz jetzt als zusammenhängendes helles Band statt als
Punktreihe. Ausgebrannt ist er nicht — der größte Ausschlag liegt bei 34 Stufen,
weit unterhalb der Schwelle, an der die Sonnenscheibe des Zen-Gartens ihre Form
verloren hat.

### Offen

**Der Sturz steht in fünf von sechs Prüfbildern gar nicht im Bild.** Das ist kein
Materialfehler, sondern eine Frage der Kameras: Er hängt an der Inselkante, und
nur die Totale sieht dorthin. Solange das so ist, misst dieser Auftrag ihn an
einer einzigen Aufnahme. Ein siebter Prüfblick von unten wäre die ehrlichere
Grundlage — das ist eine Änderung am Prüfstand und gehört in ein eigenes Paket.

Er hängt außerdem weiterhin **neben** der Felswand statt an ihr, mit Himmel
dazwischen. Ein früheres Paket hat dafür die Mittellinie an die Wand gelegt; im
Luftbild reicht das sichtbar nicht. Offen.

### Regression und Kosten

Eine Zahl im Material, zwei Werkzeugkorrekturen. 93 / 74 606 / 21,53 MB im
Zen-Prüfstand, unverändert. Alle Zen-Bilder, Nachthimmel und Konstrukt
**bitgleich**, Dojo Δmax 6 bei 0,009 %. Build grün, Konsole frei von Errors und
Warnings.

## Paket P — Blasser Mintsaum um das Gras (Prüferbefund 16)

### Zwei Verdächtige, beide differenziell geprüft, beide falsch

**Erster Verdacht: die Erdzone.** Die Erde bekommt an ihrer Oberkante einen
Grasüberhang eingeblendet (`out.lerp(grass, 1 - g2e)`), und der Ton dafür ist ein
fester Grünwert ohne die Variation der Wiese — ein Kandidat für eine
gleichmäßige grüne Bordüre. Geprüft, indem das Erdmaterial zur Laufzeit **rot**
gefärbt wurde: Der Saum blieb grün. Nicht die Erde.

**Zweiter Verdacht: die Luftperspektive** im Grasshader, die gegen ein blasses
Mintgrün `vec3(0.40, 0.55, 0.44)` mischt. Term ganz abgeschaltet und dieselben
Spalten gemessen:

    mit Dunst    x920 L175 S25%   x960 L172 S25%   x1000 L158 S27%   x1040 L166 S26%
    ohne Dunst   x920 L174 S28%   x960 L172 S28%   x1000 L156 S31%   x1040 L164 S30%

Der Dunst trägt **eine bis zwei Luminanzstufen** und drei bis fünf
Sättigungspunkte. Er macht den Saum nicht.

### Was der Saum wirklich ist

Die Abbruchkante des Grasdeckels ist eine **Schräge**. Bei einer Sonne von
38,7 Grad trifft das Licht sie fast senkrecht, während die ebene Fläche daneben
nur sin(38,7) = 0,63 abbekommt. Die dreißig Luminanzstufen Unterschied sind
damit **richtige Beleuchtung** und kein Fehler — was daran falsch war, ist etwas
anderes: Der helle Streifen lief über die ganze Länge **ununterbrochen grün**.

Der Aufriss der Narbe an der Kante hängt an zwei Toren: `smoothstep(0.70, 0.99,
rr)` für die Nähe zur Kante und einem Rauschtor für die Fleckigkeit. Letzteres
stand auf `smoothstep(0.42, 0.78, …)` und ließ den Aufriss auf weiten Strecken
ganz aus — eine saubere, gleichmäßig breite Bordüre aus einer Farbe. Eine
Grasnarbe, die über eine Kante hängt, reißt dort auf; Erde und Wurzelfilz kommen
durch.

### Ergebnis

Rauschtor `0.42 … 0.78` → `0.26 … 0.66`. Gezählt wurden die hellen Grünpunkte
(L > 150) im Kantenkasten von `3-edge-down`:

| | vorher | nachher |
| --- | --- | --- |
| Saumpixel | 3728 | **1496** (−60 %) |
| Mittelfarbe | (141,168,127) | (137,168,126) |
| Sättigung | 24,4 % | 24,8 % |

Der Saum ist nicht heller oder dunkler geworden — er ist **unterbrochen**. Im
Bild ist die Bordüre über die linke Hälfte der Kante verschwunden; wo sie bleibt,
ist sie die besonnte Schräge, und die soll dort sein.

### Was offen bleibt

Die Blässe des verbleibenden Streifens ist die ACES-Kurve: Bei dreißig Stufen
über der Umgebung liegt er im flachen Ast, und dort verliert jede Farbe
Sättigung. Das ist dieselbe Mechanik wie bei den Wolken und beim Sonnenkern und
mit einer Materialänderung nicht zu beheben.

### Regression und Kosten

Zwei Zahlen in der Scheitelfärbung. 93 / 74 606 / 21,53 MB im Zen-Prüfstand,
unverändert. Alle Zen-Bilder, Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 6
bei 0,008 %. Build grün, Konsole frei von Errors und Warnings.

## Paket Q — „Auf Augenhöhe verrät nichts, dass die Insel fliegt" (Prüferbefund 17)

Dieses Paket ändert nichts an der Szene. Es beantwortet den Befund mit einer
Messung, weil er über eine einzelne Kamera gestellt war und über die Umgebung
entschieden werden muss.

### Warum eine Kamera das nicht entscheiden kann

`1-eyelevel` steht bei (1,5 | 1,6 | 9) und blickt nach (−2 | 1,2 | −14) — also
**quer über die Insel** auf ihren Rücken. Dass man dort keine Kante sieht, ist
kein Fehler: Auf einer Insel von vierzig Metern versperrt der Wall die Sicht,
wie er es auf jeder Insel täte. Der Nutzer dreht sich aber; die Frage ist, was er
über den ganzen Rundblick sieht.

### Das neue Werkzeug

`tools/schwebeblick.mjs` stellt die Kamera auf Augenhöhe in die Inselmitte und
dreht sie in zwölf Schritten einmal herum. Je Richtung zwei Zahlen: der Anteil
**Himmel in der unteren Bildhälfte** — bei waagerechtem Blick liegt dort alles,
was tiefer steht als das Auge, und auf einer normalen Landschaft ist dort kein
Himmel — und der Anteil **Wolken in derselben Hälfte**.

**Mein erster Anlauf hat falsch gezählt, und das gehört ins Protokoll.** Er nahm
je Spalte den obersten Bodenpunkt als Horizont und zählte allen Himmel darunter.
Ein Baum am Bildrand setzt diesen „Horizont" damit an seine Krone, und der ganze
Himmel neben dem Stamm galt als Blick ins Leere — 3 bis 13 Prozent in jeder
Richtung. Das Ergebnis („alles verrät das Fliegen") war zufällig dasselbe wie
nach der Korrektur, aus einem falschen Grund. Die untere Bildhälfte kennt das
Problem nicht: Dort steht von der Inselmitte aus kein Laub.

### Ergebnis

| Richtung | Himmel unten | Wolke unten |
| --- | --- | --- |
| 0° | 1,763 % | 0,470 % |
| 30° | 3,037 % | 0,273 % |
| 60° | 3,895 % | 0,266 % |
| 90° | 8,033 % | 0,094 % |
| 120° | 12,730 % | 1,761 % |
| 150° | 11,538 % | 2,244 % |
| 180° | 9,460 % | 1,513 % |
| 210° | 1,930 % | 0,212 % |
| 240° | 1,186 % | 0,367 % |
| 270° | **0,345 %** | 0,177 % |
| 300° | **0,377 %** | 0,434 % |
| 330° | 0,769 % | 0,317 % |

**In allen zwölf Richtungen ist die Leere zu sehen.** Der Befund gilt für die
eine Prüfkamera, nicht für die Umgebung.

### Was die Messung trotzdem zeigt

Vier der zwölf Richtungen liegen unter einem Prozent — dort ist der Blick ins
Leere ein Streifen von wenigen Bildpunkten, und dass die Insel fliegt, erfährt man
dort eher nebenbei. Zwischen 0,345 % (270°) und 12,730 % (120°) liegt der Faktor
**siebenunddreißig**. Der Rücken der Insel liegt gegen Westen höher.

Das zu ändern hieße, die Geländeform anzufassen — eine Senkung des Walls über ein
Drittel des Umfangs. Das ist ein Eingriff in die Silhouette, die mehrere Pakete
bewusst aufgebaut haben, für einen Gewinn, den diese Messung als „vorhanden, aber
schmal" beziffert. **Nicht gemacht**, und die Zahlen stehen hier, damit die
Entscheidung nachvollziehbar ist statt vergessen.

### Regression und Kosten

Keine Änderung an `src/`. Ein neues Werkzeug.

## Paket R — Die Luftperspektive stand auf dem Kopf (Prüferbefund 19)

### Erst der Kasten, dann die Zahl

Ein erster Durchlauf über waagerechte Bänder in `1-eyelevel` ergab eine völlig
unregelmäßige Reihe (L 178 / 169 / 156 / 175 / 161). Der Grund: Die Bänder
enthalten Büsche, Bäume und den Bach, und ein Farbfilter auf „grün" nimmt Laub
mit. Gemessen wurde damit die Bepflanzung, nicht der Boden.

Die belastbare Messung läuft deshalb auf der **Maske des Inselkörpers** — aus dem
Ein- und Ausblenden von `island-body` gewonnen, wie bei den Vögeln und beim
Wasserfall. Sieben Bänder vom Vordergrund bis zum Kamm:

    Saettigung   28,1  28,2  29,4  29,7  28,4  24,7  22,9

Die Sättigung **steigt** über die ersten vier Bänder und fällt erst danach; das
Maximum liegt in der Mittelentfernung. Über die ganze Strecke sind es 5,2 Punkte.
Der Prüfer hat recht: Über die halbe Sichtweite läuft die Staffelung rückwärts.

### Der Faktor allein reicht nicht — auch das ist gemessen

Naheliegend war, den Dunst kräftiger zu machen. 0,30 → 0,55 vertieft aber nur das
ferne Ende (22,9 → 18,9) und lässt den Anstieg in der nahen Hälfte unberührt
(28,1 → 29,3). Der Grund steht in der Kurve selbst: Der Dunst setzt bei **4 m**
ein und erreicht die nahe Hälfte gar nicht.

### Ergebnis

Einsatz 4 → 2 m, Faktor 0,30 → 0,45:

    vorher    28,1  28,2  29,4  29,7  28,4  24,7  22,9    Spanne 5,2
    nachher   27,9  27,8  28,6  28,1  25,6  21,2  19,1    Spanne 8,8

Die Reihe ist fast monoton; der einzige verbleibende Anstieg beträgt **0,7
Punkte** statt 1,6, und das Gefälle über die ganze Strecke hat sich von 5,2 auf
8,8 Punkte fast verdoppelt.

**Die Totale bleibt unberührt** — genau die Grenze, an der ein früherer Anlauf
gescheitert ist: Wiesenmittel in `4-aerial` 150,0 → 150,6, Anteil über L 190
unverändert 18,1 %. (Der verworfene Anlauf von damals brachte 159,5 → 162,7 und
16,4 % → 29,2 %.)

### Was bewusst so bleibt

Die **Helligkeit** ist weiter nicht monoton (181,9 / 181,8 / 175,1 / 175,4 /
177,2 / 179,7 / 180,2). Das ist die Feuchtemalerei der Wiese — Mulden dunkel,
Rücken hell —, und die soll über zehn Meter stärker wirken als der Dunst. Reale
Luftperspektive über drei bis zehn Meter ist in klarer Luft vernachlässigbar; was
dort ordnet, ist der Boden selbst.

### Regression und Kosten

Zwei Zahlen im Grasshader. 93 / 74 606 / 21,53 MB im Zen-Prüfstand, unverändert.
Alle Zen-Bilder, Nachthimmel und Konstrukt **bitgleich**, Dojo Δmax 4 bei
0,009 %. Build grün, Konsole frei von Errors und Warnings.

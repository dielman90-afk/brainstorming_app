# 🥋 Dojo — Arbeitsprotokoll

Die fünfte Umgebung, und die einzige, die bis hierher **kein** Protokoll hatte.
Insel, Nachthimmel, Konstrukt und Zen-Garten sind je über mehrere Runden
gegangen; das Dojo ist mitgelaufen, ohne je selbst geprüft worden zu sein.

Es ist zugleich die aufwendigste der fünf: elf Dateien, 11 450 Zeilen, und
unter dem Software-Rasterizer des Containers braucht ein einzelnes Bild so
lange, dass die Vorgabe von dreissig Sekunden im Harness gerissen ist.

---

## Paket 0 — Ein Prüfstand für das Dojo

Ohne feste Kameras ist jede Aussage über ein Vorher und ein Nachher wertlos.
Die anderen vier Umgebungen haben ihren Satz; das Dojo hatte nur **ein**
Regressionsbild (`REGRESSION_SHOTS.dojo`), das ausreicht, um eine Veränderung
zu bemerken, aber nicht, um eine zu beurteilen.

Sechs Kameras, nach Sichtprüfung der Ausschnitte eingefroren:

| Name | Was sie zeigt |
| --- | --- |
| `a-halle` | Augenhöhe, die Halle der Länge nach zur Tokonoma |
| `b-shoji` | Die Ostfront mit dem Schattenriss des Bambushains auf dem Papier |
| `c-engawa` | Durch die Südtür in den Kiesgarten, mit Ikebana im Vordergrund |
| `d-suedfront` | Die Südfront vom Kiesbett, Blick durch die offene Tür bis zur Tokonoma |
| `e-tatami` | Nahaufnahme Matten, Waffenständer, Fusuma, Tokonoma |
| `f-gegenlicht` | Aus der Nordwestecke gegen die tief stehende Sonne |

Die Sonne steht bei (15,3 | 3,9 | 6,5) und zielt auf (0 | 0,85 | 0,5) — aus
Ostsüdost unter **10,5°**. Sie fällt durch die Papierwand im Osten, und der
Schattenriss der Halme darauf ist die wichtigste Lichtidee des Raums. Zwei der
sechs Kameras stehen deshalb dafür.

### Es gibt keine Totale von aussen, und das ist kein Versäumnis

Drei Anläufe für eine Schrägaufnahme von oben — (13 | 9 | 16), (20 | 15 | 22)
und (11 | 6,5 | 13) — standen **alle im Laub**: der erste im Bambus, der zweite
mitten zwischen den Kronen des Waldes, der dritte wieder im Hain. Der Grund
steht in `layout.js`: Die gemalte Kulisse ist ein Zylindermantel bei r = 46 m,
und zwischen Gebäude und Mantel steht ein geschlossener Wald. Wer hier eine
Totale will, muss die Kamera aus der Welt herausnehmen — und dann zeigt sie
etwas, das kein Betrachter je sieht.

An ihre Stelle tritt `d-suedfront` vom Kiesbett aus. Sie zeigt Fassade, Engawa,
Ranma und durch die offene Tür die ganze Halle bis zur Tokonoma, also mehr
Bauwerk als eine Vogelperspektive, und sie steht dort, wo man wirklich steht.

### Ein Harness-Fehler dabei

`screenshots.mjs` hat den Regressionsdurchgang seit Längerem mit
`timeout: 120000` aufgerufen, den Hauptdurchgang aber nicht. Das Dojo ist die
teuerste der fünf Umgebungen, und das erste Bild riss prompt die Vorgabe von
dreissig Sekunden und brach den ganzen Lauf ab. Jetzt steht dieselbe Geduld an
beiden Stellen. Reine Harness-Geduld — über die Laufzeit auf der Quest sagt
diese Zahl nichts.

Ausgangsstand: `tools/shots/dojo-00`. Konsole frei von Errors und Warnings.

### Und gleich der erste Befund: Das Dreiecksbudget ist gerissen

    drawCalls          118 / 120       OK, aber zwei uebrig
    triangles       418 534 / 350 000  UEBERSCHRITTEN um 68 534 (19,6 %)
    textureMB         42,85 / 60       OK
    Konsole                            sauber

Je Kamera:

    a-halle        calls 118   tris 418 530
    b-shoji        calls 118   tris 418 534
    c-engawa       calls  99   tris 405 670
    d-suedfront    calls 118   tris 418 530
    e-tatami       calls 109   tris 396 764
    f-gegenlicht   calls 118   tris 418 534

Die Zahl steht in **jeder** Kamera fast gleich hoch — es gibt also kein
Sichtfeld, in dem sie nicht anfällt, und keine Frustum-Aussonderung, die
nennenswert greift. Das ist kein Ausreisser eines Blickwinkels, sondern der
Grundstand der Umgebung.

Draw-Calls mit 118 von 120 lassen ausserdem keinen Spielraum: Was hier gebaut
wird, muss entweder instanziert oder verschmolzen sein.

---

## Der Prüfer über den Ausgangsstand

Frisch gebrieft, mit der ausdrücklichen Angabe, was für eine Szene das ist
(japanische Trainingshalle, später sonniger Nachmittag, Sonne 11° aus Ost durch
die Papierwand, alles rein prozedural). Er hat die sechs Bilder gelesen,
Ausschnitte bis achtfach vergrössert und Helligkeiten nachgemessen.

Sein Urteil je Kriterium, zusammengefasst:

* **Licht und Schatten.** Die Grundidee ist da, aber behauptet statt umgesetzt.
  **Kein einziger geworfener Objektschatten** in der ganzen Szene. Dazu ein
  Tonwertfehler erster Ordnung: der Garten ist zwei- bis dreimal dunkler als
  der Innenraum (Kies L 66–88, Laub 53–89 gegen Papier 164–179).
* **Materialien.** Papier überzeugt als einziges. Holz ist Tapete mit immer
  derselben Wellenlinie, Stroh liest als Wellpappe, Stein ist texturloses
  Blaugrau, der Goldgrund ist Millimeterpapier, Klingen sind flache weisse
  Flächen ohne Dicke.
* **Form.** Die Architektur ist Zimmermannsarbeit, alles darin nicht: Die
  Steinlaterne ist erkennbar Kegel plus Zylinder plus Kugel, die Bambushalme
  sind konstant breite Stäbe ohne Knoten, die Schwerter sind gerade Stäbe mit
  einer Kugel daran.
* **Komposition.** Fünf von sechs Bildern mittig, frontal, auf Augenhöhe, mit
  leerem Vordergrund. Nur `c-engawa` hat eine echte Staffelung.
* **Maßstab.** In Ordnung. Die Tatami-Randbreite hat er nachgemessen und für
  richtig befunden — das Problem dort ist der Tonwert, nicht das Maß.
* **Vegetation.** Der schwächste Teil: **eine** Blattform für den ganzen Hain
  und den Ahorn, nur umgefärbt.

### Die Befundliste, nach visueller Wirkung

 1. Draussen ist dunkler als drinnen — die Tageszeit kippt.
 2. Kein einziges Objekt wirft einen Schatten (Makiwara, Waffenständer, Vasen,
    Steinlaterne, Trittsteine).
 3. Die Lichtschächte sind ein Overlay über dem Bild, kein Licht im Raum — sie
    laufen über Pfosten und Raumecken hinweg, ohne den Bildwinkel zu ändern.
 4. Schwebende ungestaltete graue Klötze über dem Ranma-Band.
 5. Bambushalme enden frei in der Luft, ein Ast schwebt ohne Baum.
 6. Grosse ausgebrannte Flächen ohne Zeichnung (in `e-tatami` sechs Prozent des
    Bildes auf RGB 255/255/230, Rot und Grün abgeschnitten).
 7. Der Schattenriss auf dem Papier liest nicht als Bambus — die **Halmschatten
    fehlen ganz**, es bleibt eine Wolke.
 8. Der Garten ist eine grüne Wand ohne Tiefe, dahinter kippt es ins Schwarz.
 9. Ein Sprite für alles: Bambus und Ahorn haben dieselbe Silhouette.
10. Die Steinlaterne ist ein Stapel Grundkörper aus Kunststoff.
11. Der Kiesgarten liest als nasser Asphalt, die Trittsteine sind dickenlose
    Polygone.
12. Das Mattenfeld liest als gestreifter Teppich: alle Matten in derselben
    Richtung, keine einzige T-Fuge, Ränder bei RGB 33/29/26 praktisch schwarz.
13. Der Goldgrund des Fusuma ist Millimeterpapier, die Hügelsilhouette
    wiederholt sich identisch und läuft über die Paneelfugen hinweg.
14. Die Tokonoma hat keine Tiefe — Rückwand und Laibung auf demselben Tonwert.
15. Das Rollbild hängt an nichts, der Räucherfaden ist ein Kratzer.
16. Die Waffen sind Stäbe mit Perlen; ein Katana ist gebogen.
17. Papierfasern lesen als senkrechte Kratzer — gleiche Bildlänge unabhängig
    von der Entfernung, folgen nie der Perspektive.
18. Die Südfront hat von aussen eine andere Sprossenteilung als von innen.
19. `d-suedfront` ist eine Aufrisszeichnung ohne Traufschatten.
20. Eine harte Texturnaht mitten in der Wand.
21. Staubkörner wirken wie tote Bildpunkte — alle gleich gross, deckend weiss,
    auf Wand und Boden statt in der Luft, und nicht in den Lichtbahnen.
22. Die Decke hat keinen Lichtverlauf und trägt eine Tapete.
23. Die Vase ist glänzender Kunststoff, das Ikebana flach und teils schwebend;
    dieselbe Vase steht spiegelbildlich zweimal.
24. Die Halle wirkt unbenutzt — nichts liegt, nichts ist abgenutzt.
25. `f-gegenlicht` ist kein Gegenlichtbild.
26. Die dunkle Türöffnung in `b-shoji` ist ein Loch ins Nichts.
27. Unsicher: feine diagonale Haarlinien über dem Mattenfeld, die die
    Mattenfugen ignorieren.

Siebenundzwanzig Befunde sind mehr, als eine Umgebung sonst bekommen hat —
und das ist folgerichtig: Das Dojo ist die einzige, die nie geprüft wurde.

### Befund 2 ist als Erstes nachgemessen, und er stimmt

Differenziell, `f-gegenlicht`, alle sechs Requisitennetze zugleich aus dem
Schattenpass genommen:

    Maske 2 Bildpunkte

**Zwei.** Die gesamten Requisiten des Dojo — Makiwara, Waffenständer, Waffen,
Vasen, Rollbild, Räuchergefäss, zusammen 23 940 Dreiecke — werfen im Bild
nichts. Sie werden im Schattenpass ein zweites Mal gezeichnet und zahlen damit
23 940 Dreiecke für zwei Bildpunkte.

Damit hängen Befund 2 und die Budgetüberschreitung am selben Faden, und beide
werden in einem Zug behandelt.

---

## Paket A — Das Dreiecksbudget, und warum es gerissen war

Nicht die Geometrie war zu gross, sondern **der Schattenpass**.
`tools/dreiecke.mjs` zählt je Zeichenknoten:

    70 Zeichenknoten, 233 278 Dreiecke
    davon in Schattenwerfern 185 116

Ein Werfer wird ein zweites Mal gezeichnet. Das Budget sieht also 418 394 —
und die Vorgabe liegt bei 350 000. **Die Verdopplung ist die Überschreitung.**
Ohne sie stünden 233 278 da, mit reichlich Luft.

### Wer aus dem Schattenpass darf, ist eine Rechnung

`tools/wurfnutzen.mjs` nimmt jeden Werfer einzeln aus dem Pass und zählt, wie
viele Bildpunkte sich ändern — über alle sechs Kameras:

| Werfer | Dreiecke | geänderte Bildpunkte |
| --- | ---: | --- |
| `dojo-bamboo-laub` | 36 192 | **494 878** bei 16–39 Stufen |
| `dojo-bamboo` | 30 240 | 24 716 bei 5–37 Stufen |
| `dojo-garden-blattkarten` | 38 380 | 689 bei 4 Stufen |
| `dojo-garden-polster` | 12 880 | **0** |
| `dojo-garden-kronenkarten` | 8 280 | **0** |
| `props-wood` | 7 488 | **0** |
| `dojo-garden-krone` | 7 200 | **0** |
| `dojo-garden-blattkarten-fern` | 6 240 | 7 |
| `props-fibre` | 5 272 | **0** |
| `props-lacquer` | 4 716 | 9 |
| `dojo-lattice` | 4 224 | 19 |
| `dojo-ranma-bars` | 4 224 | **0** |
| `props-metal` | 3 726 | **0** |
| `dojo-garden-farne` | 3 380 | **0** |
| `dojo-ranma-frame` | 2 160 | 351 bei 13–14 Stufen |
| `dojo-garden-stein` | 2 096 | **0** |

Ein Werfer trägt die Szene: `dojo-bamboo-laub`. Er allein ändert eine halbe
Million Bildpunkte — er ist der Schattenriss auf dem Papier, die Lichtidee
dieses Raums.

### Gestrichen wurde die Gartenvegetation, und zwar aus Geometrie

Sieben Knoten, zusammen 78 456 Dreiecke: Polster, Kronen, Kronenkarten,
Blattkarten nah und fern, Farne, Gartenstein.

Der Grund ist **nicht** ein Beleuchtungsfehler, den man später beheben könnte.
Die Sonne steht im Ostsüdosten, der Garten liegt im Süden; seine Schatten
fallen nach −x und −z, also unter das Gebäude und vom Betrachter weg — hinter
die Pflanzen, die sie werfen. Das bleibt so, auch wenn die Beleuchtung des
Gartens noch angefasst wird.

**Die Requisiten bleiben Werfer**, obwohl sie gemessen ebenso wenig beitragen
(zwei Bildpunkte für 23 940 Dreiecke). Bei ihnen ist es sehr wohl ein Fehler:
Sie stehen im Raum, mitten im Licht, und dass sie keinen Schatten werfen, ist
Prüferbefund 2. Wer ihnen hier `castShadow` nähme, machte den Befund
unbehebbar.

### Ergebnis

    vorher    drawCalls 118/120   triangles 418 534/350 000  ÜBERSCHRITTEN
    nachher   drawCalls 111/120   triangles 340 078/350 000  OK

Die Draw-Calls fallen mit, weil ein verschmolzener Werfer auch im
Schattendurchgang einen eigenen Aufruf hatte. Textur unverändert 42,85 MB,
Konsole sauber.

**Im Bild ist davon nichts zu sehen.** `b-shoji` ist bitgleich, `a-halle` und
`e-tatami` ändern 0,007 und 0,022 Prozent der Bildpunkte, `c-engawa` mit
0,379 Prozent am meisten — davon 0,003 Prozent stärker als 24 Stufen. Zwei
Ausschnitte des Gartens nebeneinander sind nicht zu unterscheiden. Insel,
Konstrukt, Nachthimmel und Zen-Garten bitgleich.

### Eine Lehre zur Messung

Die Einzelmessung sagte für `c-engawa` 393 geänderte Bildpunkte, der Vergleich
nach dem Eingriff zeigt 3495. Der Unterschied ist kein Fehler, sondern die
Natur der Sache: **Überlappende Schatten verdecken einander.** Nimmt man einen
von zwei Werfern heraus, die dieselbe Stelle verschatten, ändert sich dort
nichts — nimmt man beide, ändert sich alles. Eine Werferliste, die einzeln
gemessen wurde, unterschätzt die Summe systematisch. Für die Entscheidung hier
war das ungefährlich, weil auch die Summe unsichtbar blieb; als Regel gehört es
notiert.

---

## Paket B — Draussen war dunkler als drinnen, und es lag nicht am Schatten

Prüferbefund 1, der schwerste seiner Liste. Gemessen mit dem neuen
`tools/tageslicht.mjs`, das feste Rechtecke auf **Flächen** legt statt
Punktproben zu nehmen (eine Punktprobe trifft eine Harkrille oder ein Blatt):

    c-engawa      Kies rechts   L  60,8      Diele innen   L 133,3
                  Kies links       76,5      Shoji-Papier    132,2
                  Laubwand        100,7

    f-gegenlicht  Tuerausschnitt   76,6      Tatami          121,9
                                             Diele           164,4

Eine offene Tür an einem sonnigen Nachmittag muss von innen ein blendend
heller Ausschnitt sein. Hier ist sie ein dunkelgrünes Loch, achtundachtzig
Stufen unter der Diele davor.

### Zwei Vermutungen, beide gemessen und beide falsch

**Der Bambushain verschattet den Garten.** Er verschattet tatsächlich viel —
seine Maske in `c-engawa` umfasst 331 589 Bildpunkte, ein Drittel des Bildes,
und senkt sie um 25 Stufen. Nur eben nicht den Kies: Nimmt man dem Hain den
Wurf, steigt das rechte Kiesfeld von 60,8 auf 60,4. Nimmt man **jeden**
Schattenwurf der Szene heraus, steigt es auf 67,2. Sechs Stufen. Der Kies
steht nicht im Schatten, er bekommt kein Licht.

**Die Papierwand sperrt die Sonne aus dem Raum.** `paper.castShadow = true`
steht in `architecture.js` mit einem ausführlichen Kommentar dazu, und der
Verdacht lag nahe. Gemessen: Ohne den Wurf der drei Washi-Netze steigt die
Tatami von 121,9 auf 126,7 — **4,8 Stufen**. Ohne jeden Wurf sind es 20,9. Was
die Sonne aus dem Raum hält, ist also nicht das Papier, sondern der
**Dachüberstand**, und bei 11° Sonnenhöhe ist das bauphysikalisch genau
richtig. Ein tief überstehendes Dach ist der Sinn der Sache.

### Was es wirklich ist

Die Bilanz je Quelle, dieselben Rechtecke:

    Quelle                              Kies re.   Kies li.  Laubwand  Diele innen
    DirectionalLight #ffe9c4 1,9             3,9        8,9      13,9          0,0
    HemisphereLight #ffffff −1              −8,9       −9,5     −10,3        −33,2
    HemisphereLight #9fc2d8 0,85             4,3        4,5       6,2         20,9
    Himmelskarte (envMapIntensity)          45,1       50,9      54,6          0,0

Zwei Zahlen tragen den ganzen Befund:

* **Die Sonne trägt zum Kies 3,9 Stufen bei** und zum Innenboden null. Der
  „sonnige Nachmittag" ist im Bild praktisch nicht vorhanden; was die Szene
  beleuchtet, sind Hemisphärenlichter und die Himmelskarte.
* **Die Himmelskarte liefert dem Aussenraum 45 bis 55 der 61 bis 101 Stufen und
  dem Innenraum genau nichts.** Innenmaterialien bekommen am Desktop gar keine
  Umgebungskarte (`applyQuality`: `next = inXR ? … : null`). Es gibt für den
  Aussenraum also genau **einen** Regler, und der Innenraum haengt nicht daran.

### Die Reihe

`--himmelsreihe` skaliert `envMapIntensity` aller Aussenmaterialien. Die
Innenwerte stehen unbewegt daneben — das ist die Gegenprobe, dass der Regler
wirklich isoliert:

    Faktor   Kies re.  Kies li.  Laubwand    Diele    Papier
       1,0       60,8      76,5     100,7    133,3     132,2
       2,0       92,0     109,7     133,8    133,3     132,2
       2,6      106,6     124,9     148,0    133,3     132,2
       3,2      118,9     137,6     159,5    133,3     132,2
       4,0      132,6     151,4     171,6    133,3     132,2

Gewählt: **2,0**, also `SKY_INTENSITY` von 4,5 auf 9,0.

**Warum nicht mehr.** Ab 2,6 kippt das Laub im Bild ins Blasse. Über L 150
liegt es im flachen Bereich der ACES-Kurve und verliert seine Sättigung —
dieselbe Lehre wie bei Wolken, Sonnenscheibe, Grasfase und Teichspiegelung, und
zum fünften Mal in diesem Auftrag. Bei 3,2 ist der Garten hell **und** farblos,
und das ist kein Fortschritt: Prüferbefund 8 („der Garten ist eine grüne Wand
ohne Tiefe") würde davon schlechter, nicht besser.

### Was das Paket erreicht — und was es nicht erreicht

Die Umkehrung ist **halbiert, nicht aufgehoben**. Die Laubwand steht jetzt auf
der Höhe des Innenbodens statt dreissig Stufen darunter; der Kies liegt immer
noch vierzig darunter. Der Rest gehört nicht diesem Regler, sondern der Albedo:
Der Kies ist mit `0xa79f90` absichtlich abgedunkelt (der Kommentar dort sagt,
warum), und das Laub ist sehr dunkel grün. Wer draussen wirklich heller haben
will als drinnen, muss **beides zugleich** anfassen — mehr Licht und hellere
Körperfarben, damit die Flächen unterhalb der Flachzone bleiben. Das ist ein
eigenes Paket und steht offen.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Die reinen
Innenkameras bewegen sich um 0,003 bis 0,024 Prozent der Bildpunkte, `c-engawa`
um 38,8 Prozent (der Garten füllt dort das Bild), `f-gegenlicht` um 1,9 und
`d-suedfront` um 1,3 — genau die Anteile, in denen Aussenraum zu sehen ist.
Geometrie unverändert, Budget also weiter 340 078 / 350 000. Konsole sauber.

Bildstand `tools/shots/dojo-02`.

---

## Zwischenbefund zu Prüferbefund 4 — die „schwebenden grauen Klötze"

Der Prüfer nennt sie an fünf Stellen in `a-halle` und in drei weiteren Bildern:
blassgraublaue Quader, die oben auf den Ranma-Rahmen aufsitzen, an nichts
anstossen und vom Deckenholz durch einen offenen dunklen Spalt getrennt sind.

Die Suche nach dem zugehörigen Netz wäre teuer gewesen — siebzig Knoten
einzeln aus- und einzublenden sind beim Dojo rund zwölf Minuten. Ein Raycast
durch den Bildpunkt kostet nichts und sagt dasselbe; dafür gibt es jetzt
`tools/wasistda.mjs`, die Umkehrung von `knotenkasten.mjs`.

    a-halle (30,125)     8,17 m   dojo-ranma-paper-schatten   #e8e0cc
                         8,19 m   dojo-ranma-bars
    a-halle (240,210)   10,03 m   dojo-walls                  #bdb6a6
    a-halle (137,178)    8,78 m   dojo-ranma-frame

**Es ist keine Streugeometrie.** Die hellen Flächen sind das Ranma-Papier der
beschatteten Wände und die Wand selbst — beides ordentlich gebaute Bauteile an
ihrem richtigen Platz. Was der Prüfer sieht, ist die *Lesart*: Eine ungestufte
helle Putzfläche (L 179–186) direkt neben dunklem Deckenholz (L 51–58) ergibt
einen Sprung von rund 130 Stufen auf wenigen Bildpunkten, und weil die Balken
sie in Stücke schneiden, liest man diese Stücke als einzelne Körper.

Der Befund ist damit **kein Geometriefehler, sondern derselbe wie Befund 22**
(„die Decke hat keinen Lichtverlauf"): Über der hell beleuchteten Mattenfläche
fehlt jede indirekte Aufhellung nach oben, und der Wand über dem Ranma fehlt
jede Verlaufsmodellierung. Beides gehört in ein Paket zur Innenraumbeleuchtung
und nicht in eine Korrektur an der Wandgeometrie — die ist in Ordnung.

Notiert, umgeschrieben, offen.

---

## Paket C — Das Mattenfeld war ein gestreifter Teppich

Prüferbefund 12: *„Sämtliche Matten laufen in dieselbe Richtung, mit identischer
Binsenrichtung, ohne Versatz, ohne Halbmatten, ohne eine einzige T-Fuge …
durchgehende schwarze Balken über die ganze Hallenbreite."*

Er hat recht, und der Code sagt selbst das Gegenteil. Über der Schleife stand:

> Verlegt im Wechsel (quer/längs paarweise), wie es üblich ist – ein
> durchgehendes Raster sähe aus wie Fliesen, nicht wie Matten.

Darunter legte die Schleife **jede einzelne Matte mit ihrer Längsachse auf x**,
ohne Ausnahme. Der halbe Mattenversatz jeder zweiten Reihe ändert daran nichts:
Ein Läuferverband ohne Richtungswechsel lässt die Borten alle parallel laufen,
und genau das sind die schwarzen Balken. Ein Kommentar, der eine Absicht
beschreibt, die der Code nie umgesetzt hat — teurer als gar kein Kommentar,
weil er die Stelle vor dem Nachsehen schützt.

### Der Verband geht ohne eine geschnittene Matte auf

Das Feld misst 7,28 × 10,92 m. In Mattenlängen sind das **4 × 6 Quadrate von
1,82 m**, und jedes Quadrat fasst genau zwei Matten — 48 Stück, dieselbe Zahl
wie vorher. Die ganze Kürzungslogik für Randmatten entfällt damit; sie wird
nicht ersetzt, es gibt schlicht keinen Rand zu kürzen.

Gelegt wird im **Schachbrett** (市松敷き): Quadrat (i,j) mit gerader Summe trägt
zwei Matten längs x, mit ungerader Summe zwei längs z. An jeder Quadratgrenze
wechselt die Borte die Richtung, es entstehen T-Stösse statt Kreuzfugen, und
keine Linie läuft mehr durch den Raum. Die Binsenrichtung dreht mit, weil sie
in der Mattengeometrie steckt — der Wechsel Hell/Dunkel über das Feld kommt
also gratis dazu.

**Es ist nicht das Pinwheel-Muster** (祝儀敷き), bei dem sich zusätzlich
nirgends vier Ecken treffen. Das lässt sich für ein Rechteck dieser Grösse
nicht regelmässig legen, und grosse Übungshallen verwenden ohnehin den
Schachbrettverband. Notiert, damit es niemand später für ein Versehen hält.

### Die Borte war ein Spalt, kein Band

    vorher   Borte L 51,2 gegen Matten L 129 bis 157   —  75 bis 105 Stufen Abfall
    nachher  Borte L 70,4 gegen Matten L 129 bis 150   —  59 bis  80 Stufen

Zwei Änderungen, beide begründet:

* **Breite 5,5 → 4,0 cm.** An jeder Mattenfuge stossen zwei Borten aneinander;
  mit 5,5 cm waren das elf Zentimeter Schwarz gegen eine Mattenbreite von
  einundneunzig, also zwölf Prozent des Feldes. Echte Heri sind drei bis vier
  Zentimeter breit — zusammen acht statt zwölf Prozent.
* **Farbe `0x2f2b26` → `0x343a47`, Rauheit 0,88 → 0,72.** Neutralgrau ohne
  Zeichnung liest als Spalt zwischen den Matten. Heri-Leinen ist dunkel, aber
  blaugrau und nicht grau, und es fängt Licht: Die geringere Rauheit legt einen
  Streifen Glanz entlang der Fuge, und der macht aus einem Loch ein Band.

**Ein Gewebemuster bekommt die Borte damit nicht.** Dafür bräuchte es eine
eigene Karte, und die kostet Texturspeicher für ein Band von vier Zentimetern.
Auf der Quest mit 23 Bildpunkten je Grad wäre sie bei drei Metern Abstand
siebzehn Bildpunkte breit und würde lesen — hier bei 10,3 nicht. Offen, mit
dieser Begründung.

### Ergebnis

    drawCalls   111 / 120        unverändert
    triangles   339 862 / 350 000  (vorher 340 078)
    textureMB    42,85 / 60       unverändert
    Konsole      sauber

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo ändert
sich genau dort etwas, wo Matten liegen: `e-tatami` 42,4 %, `b-shoji` 22,8 %,
`a-halle` 20,2 %, `f-gegenlicht` 17,4 %, `d-suedfront` 2,4 % — und `c-engawa`
**bitgleich**, weil dort keine einzige Matte im Bild ist. Sauberer lässt sich
ein Eingriff kaum eingrenzen.

Bildstand `tools/shots/dojo-04`.

---

## Paket D — Der Staub brennt nichts aus, und der Verdacht war zweimal falsch

Prüferbefund 21: *„Staubkörner wirken wie tote Pixel — alle exakt gleich gross,
unabhängig von der Entfernung, alle deckend weiss, und sie liegen auf Wand und
Boden statt in der Luft."*

Die erste Messung schien ihn zu bestätigen. `knotenwerte.mjs` auf der Maske des
Knotens in `a-halle`:

    429 Bildpunkte   Mittel 174,1   p95 246   max 255   38,7 % ueber L 190

Maximum 255 — dieselbe Signatur wie beim Zen-Staub, der wirklich ausgebrannt
war. Also der naheliegende Verdacht:

### Verdacht 1: `toneMapped: false`

Ohne Tone-Mapping geht die additive Farbe unverändert in den Puffer, während
jede Fläche daneben durch die ACES-Kurve läuft. Umgestellt und gemessen:

    toneMapped: false   Mittel 174,1   ueber L 190  38,7 %   max 255
    toneMapped: true    Mittel 174,5   ueber L 190  39,1 %   max 255

**Nichts.** Der Wert steht wieder auf `false`, damit hier niemand ein zweites
Mal danach greift, und der Grund steht als Kommentar daneben.

### Verdacht 2: die Deckkraft — und warum auch der falsch war

Dafür brauchte es eine Zahl, die es bis hierher gar nicht gab. `knotenwerte.mjs`
misst die **Absolutwerte** innerhalb der Maske; was ein Knoten *beiträgt*, sagt
das nicht. Ein Staubkorn auf Shoji-Papier misst 246, weil das Papier schon bei
185 steht. Das Werkzeug hat jetzt eine Spalte **Beitrag** — der Mittelwert der
Differenz zwischen Bild mit und ohne den Knoten, auf denselben Bildpunkten:

    dojo-dust   429 px   Mittel 174,1   max 255   **Beitrag 7,6**

**Siebeneinhalb Stufen.** Der Staub brennt gar nichts aus; er legt einen
Schimmer auf Flächen, die schon hell sind. Wo 255 steht, stand vorher 248. Die
Deckkraft zu senken wäre also der zweite falsche Griff gewesen — und ohne die
neue Spalte hätte ich ihn getan, weil die Absolutwerte genau danach aussehen.

### Was von dem Befund bleibt

Kein Eingriff. Der Befund ist in seiner Begründung **widerlegt**: Die Körner
sind nicht deckend weiss, sie tragen 7,6 Stufen bei. Was der Prüfer sieht, ist
ihre **Grösse**: Bei `size: 0.028` ist ein Korn in einem Meter vierzehn
Bildpunkte breit, in sechs Metern unter zwei — und unter zwei Bildpunkten sieht
jede Alphakarte gleich aus, nämlich wie ein harter Punkt. Das ist die
Untergrenze, die die Hardware für `gl_PointSize` setzt, und sie lässt sich nicht
wegstellen: Grösser wäre kein Staub mehr.

Die zweite Hälfte des Befunds — *„sie stehen nicht in den Lichtbahnen"* — ist
damit die einzige, die noch trägt, und sie widerspricht dem Kommentar im Code
(„Staub gibt es nur **in** den Schächten"). Ob die Bahn wirklich in den Schacht
gerechnet wird, ist ungeprüft und steht offen.

**Konsole sauber, Geometrie unberührt, Budget unverändert.**

---

## Messung zu Prüferbefund 3 — die Lichtschächte sind die halbe Beleuchtung

Prüferbefund 3: *„Die Lichtschächte sind ein Overlay über dem Bild, keine
Lichtstrahlen im Raum. Sie laufen über die Wand, über den massiven
Tokonoma-Pfosten, in die Nische hinein und wieder heraus — überall im gleichen
Bildwinkel, gleicher Weichheit und gleicher Stärke."*

Der erste Verdacht — abgeschalteter Tiefentest — ist falsch. Am Material steht
ausdrücklich `depthTest: true`, mit Begründung: „Nur so schneidet der Fußboden
den Schacht dort ab, wo das Licht auftrifft." Die Prismen werden also korrekt
verdeckt.

Mit der neuen Beitragsspalte, `a-halle`:

    Knoten              Punkte   Mittel   p95   max   Beitrag
    dojo-light-shafts   472 890    154,0   251   255      32,0
    dojo-shoji-bloom     54 517    196,2   254   255       7,4

**472 890 Bildpunkte sind einundfünfzig Prozent des Bildes.** Über die halbe
Fläche liegt eine additive Lage, die sie um zweiunddreissig Stufen anhebt, und
im 95. Perzentil steht sie bei 251 — dort stösst sie an.

Damit ist der Befund bestätigt, und zugleich ist klar, warum er sich nicht
einzeln beheben lässt: **Die Schächte sind keine Zutat, sie sind die
Beleuchtung.** Paket B hat gemessen, dass die Sonne zum Innenboden null Stufen
beiträgt und die Himmelskarte ebenfalls null; was den Raum hell macht, sind die
beiden Hemisphärenlichter — und diese Lage. Nimmt man sie herunter, bleibt ein
flacher, toter Raum.

Der Weg dahin ist derselbe, den Paket B schon benannt hat und den Befund 4 und
Befund 22 ebenfalls brauchen: **eine echte Lichtquelle für die leuchtende
Papierwand.** Sie ist im Bild das Hellste (L 185) und beleuchtet nichts. Erst
wenn der Raum sein Licht von dort bekommt, kann die additive Lage auf das
zurückgehen, was sie sein soll — ein Hauch Dunst in der Luft statt einer Farbe
auf der Wand.

Vier Befunde hängen damit an einem Paket:

* **3** — die Schächte als Overlay,
* **4** — die hellen Wandflächen ohne Verlauf, die als Klötze lesen,
* **22** — die Decke ohne indirekte Aufhellung von unten,
* **2** — kein Objekt wirft einen Schatten, weil im Raum kein gerichtetes Licht
  ankommt.

Das ist das nächste Paket, und es ist ein Umbau der Innenraumbeleuchtung, kein
Nachziehen einer Zahl. **Offen, mit dieser Begründung.**

---

## Paket E — Die Kontaktschatten der Requisiten lagen unter dem Fussboden

Prüferbefund 2 hat zwei Hälften. Die eine — kein geworfener Schlagschatten im
Innenraum — ist keine Nachlässigkeit, sondern Bauwerk: Die Dachüberstände
halten die tief stehende Sonne ab (Paket B, gemessen). Die andere Hälfte ist
ein glatter Fehler.

Das Dojo hat ein Netz namens `prop-contact-shadows` mit neun Flecken unter
Waffenständer, Makiwara, Stangenständer, Räuchergefäss und den beiden Vasen.
Gemessen in `f-gegenlicht`:

    prop-contact-shadows   (nicht im Bild, 1 Knoten)

**Null Bildpunkte.** Der Knoten ist da, gebaut, verschmolzen, mit
Vertexfarben für die Deckkraft je Fleck — und man sieht ihn nie.

### Der Grund steht in einer Vorgabe

    for (const { x, z, r, y = 0.012, opacity = 1 } of spots)

`y = 0.012`. Die Dielenoberkante liegt bei **0,055**, die Mattenoberkante bei
**0,110**. Jeder Fleck lag also dreiundvierzig Millimeter unter der Diele und
achtundneunzig unter den Matten — begraben. Der Wert war einmal richtig, als
der Boden noch bei y = 0 lag; beim Anheben der Diele ist er stehen geblieben,
und niemandem ist es aufgefallen, weil ein unsichtbarer Kontaktschatten keine
Fehlermeldung erzeugt, sondern nur fehlt.

Besonders schön ist, dass der Kommentar bei den Vasen im selben Aufruf das
Symptom bereits beschreibt:

> Sie standen nachweislich auf der Diele … und sahen trotzdem aus, als
> schwebten sie. Ein unabhängiger Kritiker hat es als „schwebt 70 cm über dem
> Boden" gemeldet … Ohne dunkle Fuge am Fuß liest das Auge keinen Bodenkontakt.

Genau richtig erkannt — und der Fleck, der es beheben sollte, lag im Boden.

### Die Höhe wird jetzt berechnet, nicht gesetzt

Ohne eigene Angabe bestimmt `bodenHoehe(x, z)` die Fläche, auf der der
Gegenstand steht — Matte innerhalb des Feldes, Diele ausserhalb — und legt den
Fleck drei Millimeter darüber. Wer einen Fleck versetzt, muss dann nicht daran
denken, ob er dabei vom Brett auf die Matte wandert.

    vorher      0 px
    nachher   5 999 px   Beitrag −18,5 Stufen

Im Bild haben die Vasen am Eingang jetzt eine dunkle Fuge am Fuss und stehen
auf der Diele statt darüber.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo ändern
sich 0,06 bis 0,69 Prozent der Bildpunkte, jeweils mit dem Schwerpunkt am
Boden. Budget unverändert: 111 Draw-Calls, 339 862 Dreiecke, 42,85 MB Textur.
Konsole sauber.

Bildstand `tools/shots/dojo-05`.

---

## Paket F — Die ausgebrannten Flächen: Ursache gefunden, zwei Hebel widerlegt

Prüferbefund 6: *„`e-tatami`, rechtes oberes Viertel — sechs Prozent des Bildes
liegen bei RGB (255,255,~230). Rot und Grün sind vollständig abgeschnitten,
Blau nicht, deshalb ist die hellste Fläche nicht weiss, sondern ein flaches
Gelbplateau ohne jeden Verlauf."*

Dafür gibt es jetzt `tools/anschlag.mjs`. Es zählt getrennt, was den
Unterschied ausmacht: **alle drei Kanäle** angeschlagen ergibt nur Weiss,
**einzelne** Kanäle kippen die Farbe. Kein Browser nötig, das rechnet auf den
Prüfbildern.

    Bild            >=254 alle   >=254 einzeln    p99   max   Schwerpunkt
    a-halle              0,11 %          3,82 %   253   255   959,389
    b-shoji              0,00 %          0,43 %   228   254
    c-engawa             0,00 %          0,00 %   189   219
    d-suedfront          0,01 %          0,80 %   220   255
    e-tatami             0,69 %          8,57 %   255   255   1071,206
    f-gegenlicht         0,00 %          0,01 %   213   255

**8,57 Prozent** in `e-tatami`, und der Kasten der angeschlagenen Bildpunkte
umfasst das ganze obere Band, (94,13) bis (1279,358). Sechs Proben daraus:

    1234, 20   255,255,234        772,216   255,249,220
     793,104   255,246,219       1129,258   255,255,226
     520,153   255,249,229       1052,307   255,255,226

Rot durchgehend am Anschlag, Blau bei 219 bis 234 — exakt das Gelbplateau.

### Woher es kommt

`tools/wasistda.mjs` schickt einen Strahl durch jeden dieser Bildpunkte. Vor
**jedem** liegen vier bis sechs Schacht-Mantelflächen, bei 0,25 / 0,35 / 1,41 /
1,51 m. Die Kamera `e-tatami` steht in 42 cm Höhe, also mitten im
Schachtvolumen und blickt durch mehrere Lagen zugleich — deshalb ist sie mit
8,57 Prozent doppelt so schlimm wie `a-halle` mit 3,82.

Der Kommentar an der Stelle hat das vorhergesagt: *„Ein Strahlprisma hat vier
Mantelflächen bei `DoubleSide`, benachbarte Paneele überlagern sich zusätzlich;
sieben Lagen ergeben 1,07 und damit reines Weiß."*

### Hebel 1: eine Seite statt zwei — trägt nicht

Am Geometriebauer steht, `DoubleSide` sei nur da, um „die Wicklung egal" zu
machen. Also Versicherung, kein Lichtgrund; das Halbieren der Lagen schien
umsonst zu haben zu sein. Gemessen:

    DoubleSide   e-tatami 8,57 %   a-halle 3,82 %
    FrontSide    e-tatami 8,58 %   a-halle 3,77 %

**Nichts.** Die Quads liegen so, dass sie in diesen Ansichten ohnehin alle zur
Kamera zeigen — `DoubleSide` kostet hier nichts und spart nichts.
Zurückgenommen, mit der Messung als Kommentar an Ort und Stelle.

### Hebel 2: `uIntensity` — scheidet rechnerisch aus

Der Grund steht bereits im Code und ist beim Nachrechnen richtig: Der additive
Modus mischt auf den **sRGB-kodierten** Wert. Halbieren senkt ihn nur um
2^(1/2,4) ≈ 1,33; man müsste durch fünf teilen, und dann wäre die Farbe tot.

### Was bleibt

Weniger Volumen oder **echtes Licht im Raum**. Damit ist auch dieser Befund an
dasselbe Paket gebunden wie 2, 3, 4 und 22. Fünf von siebenundzwanzig Befunden
hängen an einer einzigen Ursache: Der Raum hat keine Lichtquelle, die
Papierwand leuchtet und beleuchtet nichts, und die additive Lage macht die
Arbeit, für die sie nicht gebaut ist.

**Kein Eingriff in diesem Paket.**

### Werkzeugfehler nebenbei

`wasistda.mjs` hat beim ersten Lauf `dojo-dust` in **0,00 m** Abstand gemeldet
— es sah aus, als sässe ein Staubkorn auf der Kamera. Der Grund ist threes
Vorgabe für `Raycaster.params.Points.threshold`: **1**, und das ist ein Meter
Weltradius um den Strahl. Damit meldet jeder Lauf jede Staubwolke der Umgebung
als Treffer. Jetzt 0,02 — grosszügig für ein Korn von drei Zentimetern. Die
Fehlspur hat mich einen Gedankengang gekostet; ohne die Korrektur den
nächsten.

---

## Paket G — Die Papierwand leuchtet und beleuchtet jetzt auch

Fünf Prüferbefunde hingen an einer Ursache, und die Pakete B, D und F haben sie
Stück für Stück eingekreist:

> Der Raum hat keine Lichtquelle. Die Sonne trägt zum Innenboden **null** Stufen
> bei (Dachüberstand bei 11° Sonnenhöhe — bauphysikalisch richtig), die
> Himmelskarte ebenfalls null (Innenmaterialien haben am Desktop keine). Was
> den Raum hell macht, sind zwei richtungslose Hemisphärenlichter und eine
> **additive Lage**, die 32 Stufen über 51 Prozent des Bildes legt und dabei
> Bildpunkte an den Anschlag treibt.

Ein Raum, dessen einziges gerichtetes Licht gemalt ist, kann gar nicht anders
als flach aussehen — und das Hellste im Bild, die Shoji-Front bei L 185, war
eine leuchtende Oberfläche ohne jede Wirkung auf ihre Umgebung.

### Zwei Quellen, kein Schattendurchgang

Das Dreiecksbudget hat nach Paket A noch 10 138 Dreiecke Luft; ein zweiter
werfender Scheinwerfer bräuchte rund 106 000. Beide neuen Lichter werfen
deshalb nicht:

* **`dojo-papierwand`** — was durch das Washi kommt. Aus dem Osten unter rund
  20°, dem mittleren Winkel von einem Bodenpunkt zur Mitte der Papierfläche
  (Brüstung 0,42 m, Sturz 2,85 m, Raumtiefe 12 m). Farbe `0xffeed8`, Stärke 0,9.
* **`dojo-bodenlicht`** — das Gegenstück von unten, was von der hellen
  Mattenfläche zurückkommt. Senkrecht nach oben, Farbe `0xd6d2b4`, Stärke 0,35.

Gemessen mit `tools/tageslicht.mjs`, Beitrag je Quelle auf denselben Rechtecken:

    Fläche              Papierwand 0,9   Bodenlicht 0,35
    Decke                          0,3              5,3
    Westwand                      12,5              0,0
    Tatami                        10,2              0,0
    Diele (f-gegenlicht)          19,4              0,0
    Tokonoma-Nische                1,4              0,0

Jede Quelle trifft genau das, wofür sie gebaut ist. Die Westwand bekommt ihre
12,5 Stufen — das ist der „Lichtsee auf Boden und Rückwand", den der Prüfer als
behauptet, aber nicht umgesetzt bezeichnet hat. Und die Decke bekommt ihre 5,3
**von unten**, was ein Hemisphärenlicht grundsätzlich nicht leisten kann, weil
es ortsunabhängig ist (Prüferbefund 22).

### Und dann die Schächte zurück

Der Kommentar an der Stelle sagt, `uIntensity` sei „fast wirkungslos", weil der
additive Modus auf den sRGB-kodierten Wert mischt und Halbieren ihn nur um
2^(1/2,4) senkt. Das stimmt **je Lage** — und führt trotzdem zur falschen
Folgerung, denn was anstösst, ist der **Stapel** aus vier bis sechs Lagen.
Nimmt jede etwas ab, fällt die Summe aus der Sättigung heraus, und zwar schnell:

    Faktor   angeschlagene Bildpunkte   max   Tatami   Tokonoma
      1,0                     4,12 %    255    147,0      155,1
      0,6                     2,13 %    254    142,7      145,6
      0,35                    0,60 %    253    139,0      137,1
      0,2                     0,04 %    253    136,2      130,5

`uIntensity` 0,02 → **0,007**. Bei 0,2 sind die Schächte im Bild fast fort, und
sie sollen nicht verschwinden — sie sollen nur aufhören, die Beleuchtung zu
**ersetzen**. Der Raum verliert durch die Senkung acht Stufen, und die neuen
Lichter geben zwölf bis neunzehn zurück.

### Ergebnis über alle sechs Kameras

    angeschlagene Bildpunkte     alle drei Kanäle        einzelne Kanäle
    Bild                        vorher → nachher       vorher → nachher
    a-halle                     0,11 % → 0,00 %        3,82 % → 0,60 %
    b-shoji                     0,00 % → 0,00 %        0,43 % → 0,01 %
    c-engawa                    0,00 % → 0,00 %        0,00 % → 0,00 %
    d-suedfront                 0,01 % → 0,00 %        0,80 % → 0,03 %
    e-tatami                    0,69 % → 0,00 %        8,57 % → 2,44 %
    f-gegenlicht                0,00 % → 0,00 %        0,01 % → 0,00 %

**Kein Bildpunkt in keiner Kamera hat mehr alle drei Kanäle am Anschlag.** Das
Gelbplateau in `e-tatami` ist von 8,57 auf 2,44 Prozent gefallen.

Im Bild hat der Raum jetzt ein Gefälle von der Ostwand zur Westwand, die
Shoji-Paneele sind einzeln lesbar statt eine Wand aus Weiss, und die Decke ist
über der hellen Seite heller als über der dunklen.

**Was das Paket nicht liefert:** Schlagschatten der Requisiten. Beide neuen
Lichter werfen nicht, und ein drittes Schattenfrustum passt nicht ins Budget.
Für den Bodenkontakt sorgt Paket E; für die Modellierung sorgt jetzt die
Richtung. Ein echter Schlagschatten im Innenraum bleibt offen und ist an das
Dreiecksbudget gebunden, nicht an die Beleuchtung.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo ändert
sich fast das ganze Bild (48 bis 97 Prozent der Bildpunkte ≥ 2), aber flach —
nur 0,04 bis 17,2 Prozent liegen über 24 Stufen. Genau so sieht eine
Beleuchtungsänderung aus. Budget unverändert: 111 Draw-Calls, 339 862 Dreiecke,
42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-08`.

---

## Der Prüfer über den Stand nach Paket G

Zweiter Durchgang, frisch gebrieft, ohne Kenntnis des ersten Berichts. Was er
als **tragend** benennt — und wovon er ausdrücklich abrät, es anzufassen:

* die Lichtführung im Innenraum in `a-halle` (Paket G),
* Durchscheinen und Kumiko-Teilung der Shoji,
* die Tatami-Nahoberfläche in `e-tatami` (Paket C),
* Deckenbalken-Perspektive und Maßstab des Raums insgesamt.

> „Der Grundgedanke, den Raum ausschliesslich über die Papierwand und den
> Schattenriss zu beleuchten, funktioniert."

Von den siebenundzwanzig Befunden des ersten Berichts tauchen mehrere nicht
mehr auf: das Kippen der Tageszeit, der Streifenteppich, die schwebenden
Requisiten, die ausgebrannten Flächen als Hauptvorwurf. Sein neuer Befund 1 ist
dafür schärfer als alles im ersten Bericht.

---

## Paket H — „Der Garten wirft keine Schatten", und warum ich das selbst gebaut habe

Prüferbefund 1 des zweiten Durchgangs, in seinen Worten:

> Laterne, Trittsteine, Ahorn und Bambus stehen auf einer gleichmässig hellen
> Kiesfläche, ohne dass irgendetwas einen Schlagschatten wirft. Der Betrachter
> liest „Nachmittag" am Himmelslicht und „bedeckter Mittag" am Boden, und diese
> beiden Aussagen widersprechen sich in derselben Bildhälfte.

**Der erste Verdacht fiel auf mich.** In Paket A hatte ich die Gartenvegetation
aus dem Schattenpass genommen — gemessen trug sie null Bildpunkte bei — und das
mit Geometrie begründet: Sonne im Ostsüdosten, Garten im Süden, Schatten fallen
unter das Gebäude und vom Betrachter weg. Für Polster und Kronen stimmt das.
Für **Steinlaterne und Trittsteine auf offenem Kies** ist es eine unzulässige
Verallgemeinerung, und Paket B hat den Aussenraum seitdem verdoppelt.

Also zurückgenommen und gemessen: **0,070 Prozent geänderte Bildpunkte, Δmax
12.** Die alte Messung hält also auch beim helleren Licht. Nicht die Ursache.

**Zweiter Verdacht: die Reichweite der Schattenkarte.** Das Ortho-Frustum stand
bei ±12 m um (0 | 0,85 | 0,5), und das Kiesbeet liegt bei z = 7 bis 12,6 —
genau am Rand. Aufgeweitet auf ±17: **0,3 bis 0,7 Prozent.** Auch nicht.

### Die Ursache stand seit Paket B da, und ich habe sie nicht zu Ende gedacht

Die Bilanz je Quelle auf dem Kies, aus Paket B:

    DirectionalLight #ffe9c4 1,9 (die werfende Sonne)      3,9 Stufen
    HemisphereLight #9fc2d8 0,85                           4,3 Stufen
    Himmelskarte                                          45,1 Stufen

**Die Sonne trägt zum Kies vier Stufen bei.** Ein Schatten kann nur wegnehmen,
was die Sonne hinlegt — vier Stufen tief ist kein Schatten, sondern eine
Tönung. Der Garten wird zu neunzig Prozent von einer Umgebungskarte beleuchtet,
und die wirft grundsätzlich nichts.

Die Reihe misst deshalb je Wert **beides**, Helligkeit und Schattentiefe
(`--sonnenreihe`, dieselbe Fläche einmal mit und einmal ohne jeden Wurf):

    Faktor    Kies rechts     Kies links      Laubwand    Shoji-Papier
      1,0    96,8 /  4,4    113,3 /  2,8   138,0 / 0,0    132,2 / 22,8
      2,0   103,3 /  7,8    121,1 /  5,2   148,1 / 0,0    132,4 / 22,8
      3,5   111,7 / 11,7    130,3 /  8,2   159,7 / 0,0    132,5 / 22,8
      5,0   118,8 / 14,7    137,6 / 10,5   168,5 / 0,0    132,6 / 22,8

Zwei Dinge stehen darin, die den Ausschlag geben:

* Die Schattentiefe auf dem Kies **skaliert sauber mit der Sonne**, 4,4 auf
  14,7 — der Mechanismus ist bestätigt.
* Das **Shoji-Papier bewegt sich über die ganze Reihe um vier Zehntel**. Der
  Innenraum ist von dieser Schraube praktisch unberührt, weil die
  Dachüberstände die Sonne drinnen ohnehin abfangen. Es gibt also keinen
  Zielkonflikt mit Paket G.

Gewählt: **`SUN.intensity` 1,9 → 4,75** (Faktor 2,5). Nach oben begrenzt die
Laubwand: Ab etwa 160 liegt sie im flachen Bereich der ACES-Kurve und verliert
ihre Sättigung — dieselbe Grenze wie in Paket B, zum sechsten Mal in diesem
Auftrag.

### Was das Paket erreicht — und was ehrlicherweise nicht

Die Schattentiefe auf dem Kies steigt von 4,4 auf rund 10 Stufen, der Kies
selbst von 96,8 auf 110. Das Ausbrennen bleibt weit unter dem Ausgangsstand
(`e-tatami` 2,44 → 3,21 Prozent gegen 8,57 vor Paket G), und kein Bildpunkt hat
alle drei Kanäle am Anschlag.

**Im Bild von `c-engawa` sieht man davon fast nichts**, und das ist keine
Ausrede, sondern die Geometrie, die ich in Paket A schon beschrieben hatte: Die
Sonne steht im Ostsüdosten, die Schatten der Laterne und der Trittsteine fallen
nach Westnordwesten — also **hinter** die Gegenstände, von beiden Gartenkameras
aus gesehen. Was jetzt tiefer ist, liegt grösstenteils dort, wo keine der sechs
Kameras hinsieht.

Die Ursache ist damit behoben und die Wirkung im Bild bleibt gering. Wer sie
sehen will, braucht einen Standpunkt, der mit der Sonne blickt statt gegen sie
— und der Kamerasatz ist eingefroren, aus gutem Grund. **Notiert als das, was
es ist.**

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo 3,3 bis
25,4 Prozent geänderte Bildpunkte. Budget: 112 Draw-Calls (von 111 — der
Gartenstein wirft wieder), 342 022 Dreiecke von 350 000, 42,85 MB Textur.
Konsole sauber.

Bildstand `tools/shots/dojo-12`.

### Nebenbei: das Rollbild hängt jetzt an etwas

Prüferbefund 15 des ersten Berichts. Die beiden Aufhängeschnüre waren 0,17 m
lang und um 0,5 rad geneigt; ihre Spitzen landeten damit bei ±13,9 cm von der
Mitte — sie trafen sich also **gar nicht**, sie hörten in der Luft auf, und
darüber hing nichts. Der Kommentar an der Stelle sagte schon „Aufhängeschnur
zum Haken", nur gab es keinen Haken.

Jetzt zwei Schenkel, die sich in der Mitte treffen, und ein kurzer dunkler
Stift am Otoshigake. Waagerechter Lauf 0,22 m, Steigung 0,17 m; Länge und
Winkel folgen daraus (`hypot` und `atan2`) statt als Zahlen dazustehen — wer
die Rollbildbreite ändert, zieht beide automatisch mit.

### Werkzeug

`wasistda.mjs` hat jetzt `--ohne <knoten…>`. Ohne das ist die Trefferliste im
Dojo unbrauchbar: Die additiven Lichtschächte füllen jeden Strahl mit vier bis
sechs Treffern, und was dahinter steht — also das, wonach man sucht — fällt aus
der Liste.

## Paket I — die Gegenstände stehen auf dem Boden, nicht darin

**Prüferbefund 3 des zweiten Berichts:** „Frei schwebende Schattenflecken auf
den Matten. Weiche dunkle Ovale liegen mitten auf dem Mattenfeld, ohne dass
darüber irgendein Gegenstand steht."

Der Befund ist richtig und die Ursache war meine eigene: In Paket E hatte ich
die Kontaktschatten auf die richtige Bodenhöhe gehoben. Die Kissen darunter
nicht. `addZabuton` setzte das Polster auf `y = 0,043` bei einer Dicke von
0,085 — es reichte also von 0,0005 bis 0,0855, während die Mattenoberseite bei
**0,110** liegt. Die Kissen steckten vollständig im Boden. Sichtbar blieb nur
der Schatten, den ich gehoben hatte: ein Oval ohne Gegenstand.

Ein `grep` nach demselben Muster fand drei weitere Bauer:

| Bauer | tiefster Punkt | Boden dort |
| --- | --- | --- |
| `addZabuton` | 0,0005 | 0,110 (Matte) |
| `addRack` | 0,014 | 0,055 (Diele) |
| `addMakiwara` | 0,045 | 0,055 (Diele) |
| `addPoleRack` | 0,035 | 0,055 (Diele) |

Das ist dieselbe Fehlerklasse wie in Paket E, zum dritten Mal: **alles in
`props.js` ist gebaut, als läge der Boden bei y = 0.** Er lag dort auch einmal;
Dielen bei 0,055 und Tatami bei 0,110 kamen später dazu.

**Behoben, ohne eine neue Zahl hinzuschreiben.** Die Höhe wird aus dem Ort
gerechnet:

```js
const y0 = bodenHoehe(RACK.x, RACK.z);
const put = (bucket, geo, hex, shade) =>
  B[bucket].geos.push(tint(geo.translate(0, y0, 0), hex, shade));
```

Jeder Bauer baut weiter auf y = 0 und wird am Ende einmal angehoben. Eine
Höhe, die richtig war, als der Boden noch bei y = 0 lag, ist genau das, was hier
dreimal hintereinander schiefgegangen ist — deshalb steht jetzt nirgends mehr
eine Zahl, sondern überall `bodenHoehe(x, z)`.

Im Bild: zwei indigofarbene Kissen mit ihren Knöpfen liegen auf den Matten, die
Ovale haben einen Gegenstand bekommen. Der Ausschnitt von `dojo-14` zeigt
ausserdem den Keilfuss des Makiwara und die Schwelle des Waffenständers zum
ersten Mal auf dem Boden statt darunter.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. `c-engawa`
bitgleich (Gartenkamera, sieht nichts davon). Im Dojo 0 bis 1,7 Prozent
geänderte Bildpunkte. Budget: 112 Draw-Calls von 120, 342 022 Dreiecke von
350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-14`.

## Paket J — der Waffenständer hält die Waffen jetzt wirklich

**Prüferbefund 8 des zweiten Berichts:** Die Stangenwaffen gehen durch die
Auflage des Ständers hindurch.

Der Befund ist buchstäblich zu nehmen. Der Kopfriegel war ein Kasten von 0,13 m
Tiefe, gesetzt auf `POLE.x` — **die Mitte des Riegels lag genau dort, wo die
Schäfte stehen.** Er trug nichts; er durchdrang. Der Kommentar über der
Requisite sagte „ein Kopfriegel mit Löchern", nur gab es keine Löcher.

**Ein Riegel, der eine Stange hält, kann nicht an der Stelle der Stange sein.**
Er muss daneben sitzen, und zwar auf beiden Seiten, sonst fällt sie nach vorn
heraus. Das ist auch der gebräuchliche Bau: zwei dünne Latten, die die Stangen
zwischen sich klemmen. Innenkante 0,0325 gegen den größten Schaftradius 0,021,
Aussenkante 0,0675 gegen die Pfostenflanke 0,045 — die Latten greifen also
1,25 cm auf die Pfosten und enden nicht in der Luft.

**Zweite Höhe bei 0,90.** Jo (Oberkante 1,34) und die beiden Bokken (1,08)
reichen gar nicht bis zum Kopfriegel bei 1,42; die Hälfte des Ständers stand
also frei. Jetzt werden alle sechs gehalten.

### Drei Fehler, die dabei herausfielen

**Der Ausgleich für die Neigung stand in der falschen Achse.** `shaft()` neigt
mit `rotateX`, also **in z**, und verschob dann um `POLE.x - sin(lean)·len/2`
— **in x**. Das glich nichts aus, es versetzte den Schaft um 2,9 cm zur Seite
und schob die Naginata damit bis auf 5 cm an die Aussenkante heran. Der
Ausgleich gehört dorthin, wo geneigt wird.

**Die Klingen sassen neben ihren Schäften.** `shaft()` gab nur die Höhe zurück;
Naginata-Klinge und Yari-Spitze wurden auf `(POLE.x, top, zs[i])` gesetzt — also
auf die *ungeneigte* Achse. Jetzt liefert `shaft()` Höhe **und** z der Spitze.

**Der Bokken stand schief, obwohl er senkrecht gesetzt war.** `spineAt` biegt
von s = 0 nach +x weg, und der Bokken läuft von s = −0,24 bis s = +0,78 — er
liegt also ganz auf einer Seite dieses Nullpunkts: Knauf bei x = 0,007, Spitze
bei x = 0,072. Die Sehne steht damit um **3,7 Grad** schief, und mit der
Rückneigung von 1,7 Grad zusammen kippten die beiden im Bild sichtbar aus dem
Ständer. `addBokken` richtet die Sehne jetzt auf und legt den Knauf auf y = 0;
die Krümmung selbst (3,1 cm Pfeilhöhe) bleibt, und das ist die Sori, die ein
Bokken haben soll.

Dazu eine Vierteldrehung um Y an der Aufstellstelle: Die Krümmung liegt damit
**in der Ebene des Ständers** statt quer heraus — sie passt zwischen die Latten
und ist obendrein zu sehen, weil der Ständer von Osten betrachtet wird.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo nur die
zwei Kameras, die den Ständer sehen: `a-halle` 0,51 %, `e-tatami` 0,77 %,
`d-suedfront` 0,002 %, die übrigen drei bitgleich. Budget: 112 Draw-Calls von
120, **343 438** Dreiecke von 350 000 (vorher 342 022 — die vier Latten kosten
1 416), 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-17`.

### Werkzeug: `measure.mjs --frames <n>`

Der Budgetlauf ist zweimal in die Zeitgrenze gelaufen, ohne eine einzige Zahl
auszugeben. Grund: 60 Frames je Kamera, und `e-tatami` braucht im
Software-Rasterizer 11,7 Sekunden je Bild — das sind allein für diese Kamera
zwölf Minuten. Gemessen wird dabei eine Zahl, die laut dem Kopf von
`measure.mjs` **ohnehin kein Budgetkriterium ist**: Der Container hat keine GPU.

`--frames 3` bringt denselben Budgetbefund in einem Sechstel der Zeit. Die
Frame-Zeit ist dann nichts mehr wert — sie war es nie.

## Paket K — der Bambus war nie einer

**Prüferbefund 2 des zweiten Berichts:** Der Bambus liest als bereifte
Konifere. Betroffen `c`, `f` und das Schattenmuster in `b`.

Der Befund ist richtig, und die Ursache stand nicht in der Beleuchtung,
sondern **im Zeichenverfahren des Blattatlas**. `cellBlades()` setzte je Zelle
14 Büschel zu 17–25 Blättern, die alle aus *einem Punkt* in einen Fächer von
2,7 rad ausstrahlten. Das ist die Form eines Koniferenschopfs. Der Kommentar
darüber sagte „Bambus wächst in Büscheln an Zweigenden, nicht einzeln" — das
ist richtig, aber ein Büschel an einem Zweigende ist keine Rosette.

### Erst hinsehen: `tools/blattatlas.mjs`

Im Bild ist ein Blatt drei bis fünf Bildpunkte gross. Ob seine Form stimmt,
sieht man daran **nicht** — und vier Durchläufe wären daran vorbeigegangen,
ohne den Atlas je zu öffnen. Das neue Werkzeug gibt Farbkarte, Alphakanal und
Normal-Map einer Art als 512er PNG aus, über Schachbrett komponiert (ein Blatt
auf Schwarz sieht anders aus als eines auf Weiss, und beide lügen über die
Kante).

Der alte Atlas ist ein Feld aus Sternen. Der Blick darauf hat den Befund in
einer Minute bestätigt, für die ich sonst einen Durchlauf gebraucht hätte.
Bildstand `tools/shots/atlas-alt` und `tools/shots/atlas-neu`.

### Die Form

Ein Bambuszweig ist eine **Fieder**: ein dünner verholzter Trieb mit
wechselständigen Blättern rechts und links, alle schräg nach vorn, das Ganze
überhängend. Der Trieb ist das Erkennungsmerkmal — ohne ihn ist jede
Blattgruppe ein Stern, mit ihm ist sie eine Feder.

Zweig und Blätter teilen sich über `leaf()` **eine** Tiefe. Das ist nicht
Sparsamkeit: Läge ein fremdes Blatt zwischen Trieb und Blattansatz, hinge das
Blatt neben seinem Zweig statt daran.

Die Zahl der Zweige ist ein **Messwert, kein Geschmack**. Deckung des
Alphakanals über den Atlas:

    alt (14 Sternbüschel)   37,8 %
    15 Zweige               25,2 %
    21 Zweige               32,3 %
    26 Zweige               37,1 %

26, weil ein durchsichtigerer Hain genau den Fehler zurückgeholt hätte, den
`exterior.js` schon einmal behoben hat („der Streifen Ferne im Türausschnitt").

### Die Helligkeit — und ein falscher Verdacht, gemessen statt geglaubt

Der Kronenbereich von `c-engawa` mass **L 142,7 bei 46,7 % über L 150**, die
Azaleenhecke im selben Bild L 98,0 bei 10,6 %. Fast die Hälfte der Krone stand
in der flachen Zone der ACES-Kurve, in der Sättigung verlorengeht und nichts
mehr moduliert. **Das ist die Bereifung.**

Der naheliegende Verdacht war `transColor` 0xa9c664 — ein Blassgelbgrün, das
der gemessenen Kronenfarbe (131|148|99) verblüffend ähnlich sieht. **Gemessen
trägt die Transluzenz *aller* Aussenpflanzen zusammen 6,9 von 140,8 Stufen**
(auf 0 gesetzt: 133,9). Ähnlichkeit ist kein Beitrag — dieselbe Falle wie beim
Staub auf dem Shoji-Papier, und diesmal hat die Messung sie vor dem Hebel
abgefangen.

Der Hebel ist die Blattfarbe selbst. Palette gegen die Hecke im selben Bild:

    Palette   Laub L   ueber 150   Hecke L
    x 1,00     140,8     44,6 %      96,3
    x 0,80     123,6     27,7 %      96,3
    x 0,65     110,7     19,9 %      94,7

x 0,80. x 0,65 macht aus dem Bambus einen dritten dunklen Busch; Bambusblätter
*sind* heller als Azaleenlaub, das soll auch so bleiben.

### Grössere Karten — der zweite Teil von „Konifere"

Aus fünfzehn Metern, dem Abstand von `c-engawa` in den Hain, war eine Karte
von 0,52 rund 35 Bildpunkte breit. Eine Atlaszelle von 256 px landet damit auf
35 px, ein **einzelnes Blatt auf fünf**. Fünf Bildpunkte sind ein Strich, und
ein Feld aus Strichen ist eine Nadel — der Koniferen-Eindruck stand nach der
neuen Blattform immer noch.

Zehn Karten zu 0,70 decken dieselbe Fläche wie sechzehn zu 0,52
(10 × 0,49 gegen 16 × 0,27), zeigen das Blatt aber mit sieben statt fünf
Bildpunkten. Im Ausschnitt lösen die Blätter zum ersten Mal einzeln auf.

**Das kostet 31 388 Dreiecke weniger** (343 438 → 312 050).

### Was bleibt

Die Krone steht bei **L 130,0 mit 35,2 % über L 150** gegen eine Hecke bei
97,8. Das ist deutlich besser als die 142,7 / 46,7 % vom Anfang, aber ein
Drittel der Fläche liegt weiter im flachen Bereich. Der Grund ist nicht mehr
die Blattfarbe, sondern dass der Hain **kein dunkles Inneres hat**: `dojo-bamboo-laub`
hat `receiveShadow = false`, und die Gartenvegetation wurde in Paket A aus dem
Schattendurchgang genommen, um das Dreiecksbudget zu halten. Ein Hain ohne
Selbstverschattung ist überall gleich hell. Das bleibt offen und ist mit dem
jetzigen Budget nicht zu haben.

**Der Zen-Bambus benutzt denselben Atlas** und ändert sich mit (3,9 % geänderte
Bildpunkte). Der Vergleich der Ausschnitte zeigt dieselbe Dichte und denselben
Charakter — dort war die Form nie das Problem, weil die Schöpfe klein und aus
der Nähe zu sehen sind.

**Regression:** Insel, Konstrukt, Nachthimmel bitgleich, Zen 3,9 %. Im Dojo
`c-engawa` 32,8 %, `f-gegenlicht` 3,0 %, `b-shoji` 2,2 %, `a-halle` 2,0 %,
`d-suedfront` 0,57 %, `e-tatami` 0,50 %. Budget: 112 Draw-Calls von 120,
**312 050** Dreiecke von 350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-21`.

### Zwei Fehler in diesem Paket, beide meine

**Der Transluzenz-Wischlauf hat vier Materialien getroffen statt einem.** Mein
`sed` traf jede Zeile `translucency:` in `exterior.js`, also auch Kronen,
Blattkarten und Farne. Die Zahl oben ist deshalb „alle Aussenpflanzen", nicht
„der Bambus". Für die Schlussfolgerung — die Transluzenz ist nicht der Hebel —
reicht sie erst recht, aber sie steht hier als das, was sie ist.

**Ein `assert` in meinem Änderungsskript ist fehlgeschlagen, und ich habe es
nicht gemerkt.** Der letzte Palettenschritt auf x 0,72 wurde nie geschrieben;
`dojo-21` ist bitgleich mit `dojo-20`. Aufgefallen ist es nur daran, dass zwei
angeblich verschiedene Stände dieselbe Zahl bis auf die dritte Stelle lieferten.
Der Endstand ist deshalb x 0,80, und das steht so in der Palette.

### Werkzeug: `screenshots.mjs --nur <kameras>`

Für eine Abtastung — denselben Regler in drei Stufen — sind sechs Bilder je
Stufe reine Wartezeit, wenn die Wirkung nur an einer Kamera abzulesen ist. Der
eingefrorene Kamerasatz bleibt unberührt: Wer vergleicht, lässt ihn ganz
laufen; wer einen Regler sucht, nicht.

## Paket L — das Zickzack auf den Schwellhölzern

**Prüferbefund 9 des zweiten Berichts:** Zickzack-Gekritzel auf den
Schwellhölzern der Shoji.

Der Befund war leicht zu bestätigen und die Ursache eine Zeile:

```js
const wobble = pfbm((x / size) * CELLS, (y / size) * CELLS * 4, CELLS, 3, 11) - 0.5;
const rings  = Math.sin(((y / size) * RINGS + wobble * 0.35) * Math.PI * 2);
const late   = Math.pow(Math.max(0, rings), 6);
```

`CELLS` ist 8, und mit drei Oktaven sind das **32 Rauschzellen längs** des
Bretts. `RINGS` ist 11. Die Wackelperiode der Spätholzlinie war damit
**dreimal feiner als der Ringabstand** — die Linie springt schneller auf und
ab, als sie überhaupt breit ist. `pow(…, 6)` macht daraus eine harte schmale
Linie, und das Wertrauschen ist zwischen den Gitterpunkten linear
interpoliert: eine harte Linie auf einem stückweise geraden Mittelweg **ist**
ein Zickzack mit scharfen Ecken.

Auf der Diele fällt das nicht auf, weil dort viele Ringe nebeneinander liegen.
Auf einer schmalen Schwelle, in die genau **eine** Linie passt, ist es das
Einzige, was man sieht.

**Holzmaserung wackelt langsam längs und schnell quer.** Zwei Zellen über die
Kachel in x, acht in y. Beide Spannen sind Vielfache der Periode 2 — die
Kachel bleibt nahtlos, denn `pvalue` wickelt den Zellindex und nicht die
Koordinate; eine Spanne, die nicht auf die Periode aufgeht, gäbe an der
Kachelgrenze eine Naht.

Im Bild ist aus dem Gekritzel ein weich laufendes Maserungsband geworden.

**Die Änderung wirkt auf alles Hinoki im Haus** — Diele, Balken, Rahmen,
Engawa. Das ist beabsichtigt: Sie hatten denselben Fehler, nur weniger
sichtbar.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo 4,5 bis
14,5 Prozent der Bildpunkte um mindestens 2 Stufen geändert, aber nur 0,02 bis
0,4 Prozent um mindestens 24 — das flächige, kleine Muster einer
Maserungsänderung. Budget unverändert: Texturgrösse, Texturzahl und Geometrie
sind dieselben; geändert hat sich allein der Inhalt einer 512er Kachel.
Konsole sauber.

Bildstand `tools/shots/dojo-23`.

## Paket M — der Mattenverband hält jetzt die Regel

**Prüferbefund 12 des zweiten Berichts:** Vierereck-Treffen im Mattenverband.

Der Befund ist richtig, und der Kommentar über der Stelle behauptete das
Gegenteil: „es entstehen T-Stösse statt Kreuzfugen". Das war ein Denkfehler,
kein Messfehler.

**Ein Quadrat von 1,82 m mit zwei Matten darin hat, wie es auch gedreht ist,
immer eine Mattenecke in jeder seiner vier Quadratecken.** An jedem inneren
Quadratpunkt stossen vier Quadrate zusammen, also vier Mattenecken. Fünfzehn
Kreuzfugen im Feld, und die Schachbrett-Drehung ändert daran nichts — sie kann
es gar nicht.

### Die Feldbreite ist ein Messwert geworden

Gelegt wird jetzt nach der Regel selbst (祝儀敷き), und die wird **gesucht**,
nicht konstruiert: `tools/mattenverband.mjs` durchsucht das Zellgitter nach
einer Belegung, in der sich nirgends vier Ecken treffen. Vier Ecken treffen
sich im Gitterpunkt (x,z) genau dann, wenn die vier Zellen darum zu vier
verschiedenen Matten gehören — das ist die ganze Bedingung.

Dass es für ein gegebenes Feld überhaupt eine Lösung gibt, ist **keine
Selbstverständlichkeit**:

| Feld | Halbmatten | Richtungswechsel | längste Fuge | Kreuzfugen |
| --- | --- | --- | --- | --- |
| 8 × 12 Schachbrett (vorher) | 0 | 61 % | 12 | **15** |
| 8 × 12 | 0 | *keine Lösung* | | |
| 8 × 12 | 1 | *keine Lösung* | | |
| 8 × 12 | 2 | 35 % | 8 | 0 |
| 8 × 10 | 0 | 27 % | 8 | 0 |
| **9 × 12** | **8** | **59 %** | **6** | **0** |

Das Feld ist deshalb **um eine halbe Mattenlänge breiter** geworden: 8,19 statt
7,28 m, ringsum 1,905 m freie Diele statt 2,36 m. Die Breite folgt jetzt aus
der Regel und nicht aus einer runden Zahl.

### Die Regel zu erfüllen genügt nicht

Der **erste** Verband, den die Suche für 8 × 12 fand, erfüllte die Regel und
war im Bild deutlich schlechter als das Schachbrett: lange gleichgerichtete
Bahnen, in der Ferne ein konzentrisches Rechteck — eine Laufbahn, kein
Mattenfeld. Das ist im Bild `tools/shots/dojo-24` festgehalten, und es ist der
Grund, warum dieses Paket zwei Durchläufe mehr gekostet hat.

Der Unterschied ist messbar: **Richtungswechsel**, der Anteil benachbarter
Mattenpaare mit verschiedener Lage. Das Schachbrett hatte 61 %, der erste
gefundene Verband 34 %. Das Werkzeug sucht deshalb sechshundertmal mit
gestreuter Reihenfolge und bewertet nach Richtungswechsel, Fugenlänge und Zahl
der Halbmatten.

**Die Auswahl unter den Lösungen ist ein Blick und keine Zahl** — deshalb steht
der gewählte Verband als Tabelle im Quelltext und die Suche nicht im Bauweg.
`tatamiVerband()` bleibt als Rückfall, wenn jemand die Raummasse ändert; dann
stimmt zwar die Regel, aber niemand hat das Ergebnis angesehen, und genau das
sagt dann auch die Konsole.

### Halbmatten

Acht Halbmatten (半畳) gehören zum Verband — ein 4,5-Matten-Raum besteht aus
vier Matten um eine. Sie kosten **keinen** eigenen Zeichenaufruf: dieselbe
Geometrie, in der Längsachse halbiert. Das Binsengeflecht verläuft längs der
Matte, seine Streifen liegen also quer; eine Stauchung längs verkürzt die
Streifen, ohne ihren Abstand zu ändern. Quer gestaucht wäre es falsch.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. `c-engawa`
bitgleich (Gartenkamera). Im Dojo `e-tatami` 43,6 %, `a-halle` 27,8 %,
`b-shoji` 27,1 %, `f-gegenlicht` 22,1 %, `d-suedfront` 2,7 % — das Feld ist
breiter geworden und neu gelegt, das ist der ganze Unterschied. Budget: 112
Draw-Calls von 120, 312 410 Dreiecke von 350 000 (von 312 050 — zehn Matten
mehr), 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-26`.

## Paket N — die Bildnische ist ein Kasten geworden

**Prüferbefund 5 des zweiten Berichts:** Die Tokonoma hat keine Tiefe.

Gemessen in `e-tatami`: Nischenrückwand **L 171,2** gegen **L 183,1** für die
Nordwand daneben. Zwölf Stufen für einen halben Meter Rücksprung — das ist ein
Anstrich, keine Nische.

**Die Ursache ist bekannt und bleibt bestehen:** Für die Innenräume gibt es
keinen eigenen Schattendurchgang; das Dreiecksbudget trägt keinen dritten
Kegelstumpf (Paket A). Ohne Verschattung bekommt die Nische dieselbe
Halbraumaufhellung wie die offene Wand, und der einzige Unterschied ist der
Farbwert des Putzes.

Also gebacken. Vier unterteilte Flächen dicht innen an der Schale — Rückwand,
zwei Wangen, Deckel —, deren Vertexfarbe mit der Tiefe im Rücksprung und mit
der Nähe zu Wange, Sturz und Nischenboden abfällt. Die Ecke zählt hinten mehr
als vorn: An der Öffnung fällt Licht von der Seite herein, an der Rückwand
nicht mehr.

**Die Unterteilung ist der eigentliche Punkt.** Eine Kastenfläche hat vier
Ecken, und zwischen vier Ecken lässt sich eine Rampe legen, aber keine
Vignette. Zwölf mal zwölf Felder tragen den Verlauf, den eine Nische wirklich
hat. Ohne das wäre die ganze Rechnung ein gleichmäßiger Farbabzug gewesen —
also genau das, was schon da war.

**171,2 → 140,3.** Der Abstand zur Nachbarwand geht von zwölf auf **dreiund­vierzig**
Stufen. Im Bild steht die linke Wange jetzt hell gegen einen dunklen Grund, und
das Rollbild hat einen Hintergrund statt einer Wand.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. `c-engawa`
bitgleich. Im Dojo `e-tatami` 3,8 %, `b-shoji` 1,3 %, `a-halle` 1,2 %,
`d-suedfront` 0,5 %, `f-gegenlicht` 0,5 % — nur die Nische. Budget: **113**
Draw-Calls von 120 (der Innenkasten ist einer, alle vier Flächen teilen ein
Material), 313 130 Dreiecke von 350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-28`.

## Paket O — die Lichtschächte waren ein Überzug, kein Strahl

**Prüferbefund 4 des zweiten Berichts:** Diagonale Lichtstreifen über die
Nordwand gemalt.

Der Verdacht lag zuerst auf der Putztextur — diagonale Streifen auf einer Wand
sind meistens eine Textur. Die differenzielle Messung sagt etwas anderes:

```
node tools/knotenwerte.mjs --env dojo a-halle dojo-light-shafts
dojo-light-shafts  431604 Punkte  Beitrag 18,0  >190 10,7 %
```

**431 604 Bildpunkte sind 47 Prozent des Bildes.** Dort trägt der Knoten im
Mittel achtzehn Stufen bei. Das ist kein Lichtstrahl mehr, das ist ein Überzug
über die halbe Bildfläche — und auf einer Wand, die ohnehin bei L 180 steht,
also im flachen Teil der ACES-Kurve, wird daraus genau das, was der Prüfer
beschreibt: ein kreidiger Streifen ohne Farbe.

### Warum die Fläche so gross war

Die Geometrie ist richtig abgeleitet und bleibt es: Zehn Shoji-Felder von
2,43 m Höhe, aus derselben Blende und derselben Sonnenrichtung wie die
Schatten. Was fehlte, war das Ende. `BEAM_LENGTH` folgt aus der Sonnenhöhe von
10,5 Grad und beträgt **16,6 m** — der Raum ist zwölf. Der Schwanz verblasste
von 22 bis 100 Prozent dieser Länge, also über den ganzen Raum und darüber
hinaus. Zehn solche Schächte füllen zwangsläufig das Bild.

Jetzt von 12 auf 62 Prozent, also von zwei bis zehn Metern: dicht an der
Blende, weg vor der Westwand. Das ist auch die Physik — was streut, ist die
Luft im Strahl, und der weitet sich.

### Die Tabelle oben beantwortete die falsche Frage

`SHAFT_DICHTE` stand auf 0,34, und die Begründung darüber lautete: „der
**grösste** Wert, der noch unter 0,5 % geklemmter Bildpunkte bleibt". Gesucht
war damals der hellste Wert, der nicht ausbrennt. Der Befund war aber nicht
das Ausbrennen, sondern die Fläche.

| Schwanz | Dichte | Bildpunkte | Anteil | Beitrag | > 190 |
| --- | --- | --- | --- | --- | --- |
| 0,22–1,00 | 0,34 | 431 604 | 47 % | 18,0 | 10,7 % |
| 0,22–1,00 | 0,24 | 371 466 | 40 % | 14,4 | 6,5 % |
| 0,22–1,00 | 0,16 | 345 735 | 38 % | 10,0 | 3,2 % |
| 0,12–0,62 | 0,34 | 320 644 | 35 % | 17,2 | 11,2 % |
| **0,12–0,62** | **0,22** | **297 969** | **32 %** | **11,7** | **4,6 %** |

Der kürzere Schwanz nimmt ein Viertel der Fläche, die kleinere Dichte den Rest
der Lautstärke.

**Nebenbei fällt damit das letzte Ausbrennen weg.** `anschlag.mjs` auf
`e-tatami`: einzelne Kanäle bei 254 von **3,20 % auf 0,00 %**. Das flache
Gelbplateau, an dem Paket F gearbeitet hat, ist damit ganz verschwunden.

### Was das kostet

**Der Raum ist ruhiger geworden, und das ist nicht nur Gewinn.** Die
Lichtschächte waren das auffälligste Stimmungsmittel im Bild; jetzt sind sie
ein Hauch. Wer dem Raum wieder mehr Sonne geben will, hat dafür die
**Lichtpfützen** — sie liegen flach auf dem Boden, stehen bei `uIntensity`
0,03 und sind unangetastet geblieben. Das wäre der richtige Ort: Licht, das
auftrifft, statt Licht, das über allem liegt. Steht offen und ist bewusst
nicht in diesem Paket gemacht, weil zwei Regler in einem Durchlauf keine
Messung mehr ergeben.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. `c-engawa`
bitgleich. Im Dojo grossflächig, aber flach: `e-tatami` 79,9 % der Bildpunkte
um mindestens 2 Stufen geändert, jedoch nur 10,6 % um mindestens 24 und
Δmax 45. Budget: 113 Draw-Calls von 120, 313 130 Dreiecke von 350 000,
42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-30`.

### Ein eigener Fehler, den das Werkzeug abgefangen hat

Im ersten Anlauf stand in meinem neuen Kommentar ein Wort in Rückwärts-
strichen — **innerhalb eines GLSL-Template-Literals**. `tools/shaderlint.mjs`
hat es als `prebuild` gemeldet, wie es dafür gebaut wurde. Gesehen habe ich es
trotzdem erst zwei Läufe später, weil mein `grep` über die Bauausgabe nur nach
`^✓` und `^error` suchte und die Meldung des Linters durchfallen liess. Das
Werkzeug hat funktioniert, meine Prüfung der Ausgabe nicht.

## Paket P — drei harte Baufehler aus dem dritten Prüferbericht

Nach den Paketen I bis O ist der Prüfer noch einmal über alle sechs Kameras
gelaufen und hat zwanzig Befunde geliefert. Drei davon sind Baufehler, die man
rechnen kann statt sie zu beurteilen — die kommen zuerst.

### Der Längsunterzug endete im Fensterband (Befund 6)

Gerechnet: Der Unterzug liegt bei y = 3,67 und ist 0,20 hoch, seine Unterkante
also bei **3,57**. Das Ranma reicht von 3,05 bis **3,72**. Die letzten fünfzehn
Zentimeter des Balkens standen damit im Papierband — er lief auf die Nordwand
zu und endete dort an einem Oberlicht, mit sichtbarer Schnittfläche und ohne
jedes Auflager. Der Prüfer hat es genau so gesehen, und es steht in der
Bildmitte von `a-halle`, direkt über der Tokonoma.

Ein Balken endet nicht in der Luft. Ein **Firstpfosten** trägt ihn: von der
Unterkante des Balkens auf die Oberkante der geschlossenen Wand, quer durch das
Ranma-Feld, das er dabei ausfüllt. 18 cm gegen die 22 des Balkens — ein Pfosten
ist nie breiter als das, was er trägt.

**Beide Pfosten und der Balken sind ein Netz.** Beim ersten Anlauf waren es drei
eigene Meshes, und das Budget sprang von 113 auf **117** von 120 Draw-Calls. Drei
Körper aus demselben Holz sind drei Zeichenaufrufe; verschmolzen ist es einer.

### Die Mattenborte war eine Stufe und ein Graben (Befund 9)

Zwei Fehler an derselben Stelle, und ich habe zuerst nur den einen gesehen.

**Die Stufe.** Die Borte lag bei 0,1115 und war 5 mm hoch, stand also bis 0,114
— vier Millimeter über einer Mattenoberkante von 0,110. Auf einem vier
Zentimeter breiten Streifen ist das 1 : 10, und der Prüfer las es als
Seitenwand: „der Boden ist gestuft". Jetzt 2 mm hoch bei 0,1106, also **1,6 mm
statt 4**. Ganz bündig geht nicht, weil die Borte innerhalb der Mattenfläche
liegt und mit ihr um dieselbe Tiefe stritte.

**Der Tonwert — und das war der eigentliche Befund.** Nach der
Geometrieänderung habe ich nachgemessen, und der Boden sah exakt gleich aus:
Borte L 41 gegen Mattenfläche L 141, **Faktor 3,46**, unverändert. Die Stufe war
nur die halbe Miete. Bei acht Zentimetern Dunkel je einundneunzig Zentimeter
Matte entscheidet der Tonwert, ob man ein Band sieht oder eine Fuge — und bei
Faktor 3,5 sieht man eine Fuge. Der Vorwurf „Gitterrost" ist berechtigt.

0x343a47 → 0x4c5568. **L 41 → 66, Faktor 3,46 → 2,13.** Immer noch das Dunkelste
am Boden, aber Leinen und kein Loch.

### Die Fusuma-Stege — und eine Zahl des Prüfers, die nicht stimmt (Befund 15)

Er meldet „senkrechte Fugen mit L nahe null — dunkler als jede andere Fläche in
beiden Bildern". **Gemessen stimmt das nicht.** Die drei Stege in `e-tatami`
standen bei L 103,5, 115,7 und 107,8 gegen ein Goldfeld von 160,0. Dunkel, aber
weit von null.

Der Befund dahinter ist trotzdem richtig: 0x2f2419 hat eine Eigenhelligkeit von
38, und alles andere Holz im Haus steht bei 0x9a7b56. Elf fast schwarze Stege
zerhacken eine Wandmalerei, die zusammenhängen soll. Ein Fusuma-Rahmen ist
dunkler lackiert als eine Diele, aber er ist kein Loch. 0x5a4630 → **L 111,7 /
122,3 / 115,9**.

**Die dunkelste Spalte in diesem Bereich ist gar kein Steg.** Bei x = 361–363
steht L 74; ein Raycast durch diese Bildpunkte trifft `dojo-walls`. Das ist ein
Schatten auf dem Putz, und der bleibt.

**Regression:** Insel, Nachthimmel, Zen bitgleich. `c-engawa` bitgleich.
`env-matrix` 0,03 % — das ist meine eigene Konstrukt-Änderung von vorhin, kein
Rückschlag. Im Dojo `e-tatami` 7,7 %, `a-halle` 4,9 %, `b-shoji` 4,3 %,
`f-gegenlicht` 3,6 %, `d-suedfront` 1,0 %. Budget: **113** Draw-Calls von 120,
313 178 Dreiecke von 350 000 (von 313 130 — die beiden Pfosten kosten 48),
42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-33`.

## Paket Q — draussen ist jetzt heller als drinnen

**Prüferbefund 1 des dritten Berichts, sein schwerster:** „Draussen ist dunkler
als drinnen — die Lichtlogik ist umgedreht." Gartenöffnung L 108, Engawa-Diele
L 141, Kies L 103, Shoji-Papier L 140.

Seine Zahlen reproduzieren sich exakt. **Und Paket B hat dieses Paket
vorhergesagt und aufgeschoben** — der Absatz über `SKY_INTENSITY` endet mit:
„Wer draussen wirklich heller haben will als drinnen, muss beides zugleich
anfassen — mehr Licht UND hellere Körperfarben. Das ist ein eigenes Paket."

### Erst der naheliegende Verdacht, und er war falsch

Bei 10,5 Grad Sonnenhöhe wirft ein elf Meter hoher Bambushain unmittelbar im
Osten einen Schatten von neunundfünfzig Metern nach Westen — über Haus und
Garten hinweg. Der Garten liegt also im Schatten des eigenen Hains, und das
klang nach der Ursache.

`knotenwerte.mjs --ohne-werfer`, also mit **jedem** Schattenwurf abgeschaltet:

    Kies mit Werfern    105,7
    Kies ohne Werfer    117,1

**Elf von fünfunddreissig Stufen.** Der Schatten ist es nicht.

### Dann ein Wischlauf, der wieder in einen Kasten gemessen hat

Ich habe die Kiesfarbe von 0xa79f90 auf 0xdfd4bd gehoben — ein Drittel mehr
Albedo — und im Kasten (620,470)–(900,545) ganze **sieben Stufen** gefunden.
Grund: Der Kasten ist grösstenteils kein Kies, sondern Moos, Steine und
Sträucher. Derselbe Fehler wie beim Staub auf dem Shoji-Papier und beim
Moossaum, und ich hatte das differenzielle Werkzeug bereits in der Hand.
**Notiert, weil es das dritte Mal ist.**

### Die Messung, die trägt

Differenziell je Knoten in `c-engawa`, auf den eigenen Bildpunkten:

| SKY | Kies | Bambuslaub | Azaleenpolster | Laub über L 150 |
| --- | --- | --- | --- | --- |
| 9,0 | 105,7 | 134,2 | 54,8 | 48,0 % |
| 11,7 | 121,4 | 141,6 | 64,7 | 54,4 % |
| 14,4 | 134,6 | 147,8 | 73,6 | 60,4 % |

Innen zum Vergleich, **unbewegt**: Engawa-Diele 141,5, Shoji-Papier 140,2. Das
bestätigt Paket B: Die Innenmaterialien hängen am Desktop nicht an der
Himmelskarte. `a-halle` ändert sich am Ende um 0,012 % der Bildpunkte,
`e-tatami` um 0,035 % — der Regler fasst nur den Aussenraum an.

### Warum 3,2 jetzt geht und in Paket B nicht

Paket B schrieb: „Ab 2,6 kippt das Laub im Bild ins Blasse." Das galt für die
Blattfarben von damals. **Paket K hat die Blattpalette inzwischen um ein Fünftel
abgedunkelt** — aus einem ganz anderen Grund (der Hain las als bereifte
Konifere), aber mit genau der Wirkung, die hier fehlte.

`SKY_INTENSITY` 9,0 → **14,4** (Faktor 2,0 → 3,2), Blattpalette noch einmal
× 0,83 und, nach einer Kontrollmessung, ein zweites Mal × 0,85. Endstand der
Palette **× 0,56** gegenüber dem Ausgangswert.

| Krone in `c-engawa` | L | Sättigung | über L 150 |
| --- | --- | --- | --- |
| vor diesem Paket | 130,0 | 35,7 % | 35,2 % |
| nur Himmel 14,4 | 138,4 | 29,7 % | 41,8 % |
| **Himmel + Palette** | **129,4** | **28,7 %** | **34,8 %** |

Der Kies steht damit bei **134,6** statt 105,7 — auf der Höhe des Innenraums
statt vierzig Stufen darunter. Die Azaleen kommen von 54,8 auf 73,6; sie waren
das Dunkelste im Bild. Die Krone steht im Tonwert genau da, wo sie vorher stand.

### Was es kostet, und das bleibt offen

**Die Krone hat sieben Punkte Sättigung verloren** (35,7 → 28,7 Prozent). Bei
gleichem Tonwert und dunklerer Körperfarbe kommt mehr vom Licht und weniger vom
Blatt — und das Licht ist der blaue Himmel. Das ist der Preis dieses Pakets, und
er ist bezahlt, nicht wegdiskutiert.

Der eigentliche Grund, warum die Palette so weit herunter muss, ist **derselbe
wie bei der Bildnische und beim Sesselkissen: es fehlt die Verdeckung.** Ein
Hain verschattet sich selbst; dieser hier nicht. Jedes Blatt mit einer Normalen
nach oben bekommt den vollen Himmel, ob es unter zehn anderen Blättern liegt
oder obenauf. Solange das so ist, bleibt die Blattfarbe der einzige Regler, und
er muss die fehlende Verdeckung mitbezahlen. **Der nächste Hebel wäre eine in
die Kartenbüschel gebackene Verdeckung** — dieselbe Technik wie in der Nische,
nur auf `cardCluster` statt auf vier Wandflächen.

**Regression:** Insel, Konstrukt, Nachthimmel bitgleich. Zen 1,3 % (teilt sich
die Blattpalette, Δmax 17). Im Dojo `c-engawa` 38,8 %, `f-gegenlicht` 1,9 %,
`d-suedfront` 1,4 %, die drei Innenkameras unter 0,04 %. Budget: 113 Draw-Calls
von 120, 313 178 Dreiecke von 350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-36`.

## Paket R — die Kontaktschatten gab es, man sah sie nur nicht

**Prüferbefund 3 des dritten Berichts:** „Nichts wirft einen Kontaktschatten"
— mit einer Liste: beide Zabuton, der Makiwara-Fuss, die drei Vasen, die
Trittsteine, die Steinlaterne.

Der Befund stimmt im Bild und ist in der Sache falsch. `buildBlobShadows`
setzt seit Paket E acht Flecken: Waffenständer, Makiwara, beide Zabuton,
Räuchergefäss, Stangenständer, beide Vasen. Sie sind da.

### Warum man sie nicht sah

`knotenwerte.mjs --env dojo a-halle prop-contact-shadows`:

    Punkte 829   Beitrag −12,5

**829 Bildpunkte für acht Flecken** — 0,09 Prozent des Bildes. Der Grund steht
in der Textur: Der Verlauf war 0,50 Deckkraft in der Mitte, 0,24 bei 55 Prozent,
0 aussen. Eine Glocke, die genau dort am dunkelsten ist, wo der Gegenstand
selbst steht **und sie verdeckt**. Ausserhalb der Silhouette blieb ein Saum mit
rund 0,08 Deckkraft, verteilt auf einen breiten weichen Ring. Das liest als
nichts.

Eine Verdeckung unter einem aufliegenden Gegenstand ist keine Glocke. Sie ist
**flach dunkel bis zur Kante** und fällt dann innerhalb etwa einer Objekthöhe
ab. Also ein Plateau bis 0,60 des Radius (0,62 → 0,58 Deckkraft) und der ganze
Abfall dahinter. Dazu die Regel, nach der die Radien jetzt gewählt werden:
**0,60 r deckt die Standfläche** — der sichtbare Saum ist dann der Abfall und
nicht sein Ausläufer. Radien entsprechend nachgezogen, Zabuton 0,36 → 0,46.

    Punkte 829 → 1672   Beitrag −12,5 → −27,4

Doppelte Fläche, doppelte Tiefe.

### Die Steinlaterne — der Prüfer irrt sich, aber nicht ganz

„Müsste bei 10 Grad Sonnenhöhe einen mehrere Meter langen Schatten über den
Kies ziehen; **es gibt gar keinen**." Den gibt es: `solid.castShadow` steht seit
Paket H auf `true`, und bei 10,5 Grad ist er rund acht Meter lang. Er fällt nach
Westnordwesten, also von **beiden** Gartenkameras aus hinter die Laterne, wo er
sich selbst verdeckt. Das ist in Paket A gemessen und in Paket H bestätigt.

Was wirklich fehlte, ist etwas anderes, und es ist der bessere Befund: Die
Gartenkörper tragen ihr gebackenes AO **auf sich selbst** (dunkler nach unten),
der Kies ringsum aber nichts. Der Gegenstand wird dunkel, der Boden bleibt hell
— und genau diese Asymmetrie liest als „aufgesetzt". Ein Fleck am Fuss ist aus
jeder Richtung sichtbar, ein Schlagschatten nicht.

`buildBlobShadows` ist dafür aus `props.js` exportiert und wird jetzt auch im
Garten benutzt, für Laterne, Becken und Bambusrohr. `spot.y` ist dort Pflicht:
`bodenHoehe` kennt nur die Innenböden.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo
`c-engawa` 1,0 %, `f-gegenlicht` 0,8 %, die übrigen unter 0,2 %. Budget: **114**
Draw-Calls von 120 (das Gartenfleckennetz ist einer), 313 184 Dreiecke von
350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-38`.

## Paket S — die Decke, und zum vierten Mal dieselbe Ursache

**Prüferbefund 5 des dritten Berichts:** „Die Decke in `a-halle` ist eine flache
Platte." Balkenunterseite L 64,2 gegen Deckenfeld L 67,1 — drei Stufen. Die
Balken heben sich allein durch ihre Kantenlinien ab, nicht durch Tonwert. In
`b-shoji` und `f-gegenlicht` trägt dieselbe Decke, weil dort die Balkenflanken
sichtbar sind; **entlang** der Balken gesehen bricht sie zusammen.

Die Ursache ist dieselbe wie bei der Bildnische (Paket N), dem Sesselkissen
(Konstrukt-Paket 22) und dem Bambushain (Paket Q): **dieser Renderer hat kein
Verdeckungsglied.** Ein Unterzug, der 24 cm unter der Decke hängt, verdeckt der
Schalung neben sich den halben Himmel — das Beleuchtungsmodell weiss davon
nichts, weil die Normale der Schalung überall dieselbe ist.

Die Schalung war ausserdem **ein einziges Viereck**. Vier Ecken tragen keinen
Verlauf; das ist wörtlich derselbe Satz wie an der Nische. Jetzt 32 × 96
Felder.

**Die Reichweite folgt der Geometrie, sie ist nicht gesetzt:** ein Balken von
0,2 m Breite, der 0,24 m heruntersteht, verdeckt bis rund 0,45 m zu jeder
Seite; der Längsunterzug (0,22 m breit, Oberkante 0,18 m unter der Decke)
entsprechend weniger. Dazu ein Saum an den Wänden, wo die Schalung nur noch den
halben Raum sieht.

**Gemessen an einem senkrechten Schnitt durch die Deckenfelder in `a-halle`,
Spanne innerhalb eines Feldes:**

    vorher   59 61 64 64 64 62 61 63   →  5 Stufen
    nachher  59 61 64 64 62 57 49 44   → 20 Stufen

Die Felder senken sich zum Balken hin ab, statt gleichmässig hell zu bleiben.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. `c-engawa`
bitgleich (sieht keine Decke). Im Dojo `f-gegenlicht` 12,8 %, `b-shoji` 9,2 %,
`a-halle` 9,1 %, `e-tatami` 2,0 %, `d-suedfront` 0,6 % — davon nur 1 bis 2 %
um mindestens 24 Stufen, also flächig und flach, wie eine Verdeckung aussehen
soll. Budget: 114 Draw-Calls von 120, **319 326** Dreiecke von 350 000 (von
313 184 — die Unterteilung kostet 6 142), 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-40`.

## Paket T — der Trockengarten hatte drei Materialien in elf Stufen, und zwei davon in der falschen Reihenfolge

**Prüferbefund 4 des dritten Berichts:** „Der Trockengarten ist eine einzige
graue Masse. Kies L 103, Trittstein L 106, Laternenschaft L 110 — drei
Materialien innerhalb von sieben Tonwertstufen."

Seine Zahlen sind von vor dem Tageslicht-Paket. Nachgemessen, differenziell je
Knoten in `c-engawa`:

| | Kies | Trittsteine | Steinwerk |
| --- | --- | --- | --- |
| vorher | 127,8 | 138,8 | 137,1 |

Elf Stufen statt sieben — und **in der falschen Reihenfolge.** Die Trittsteine
standen elf Stufen heller als der Kies. Ein Karesansui-Bett ist das Hellste, was
in so einem Garten liegt, und ein Trittstein ist nasser, dichter Granit: das
Dunkelste. Genau umgekehrt.

Kies 0xa79f90 → 0xc4bca8, Trittsteine 0x4f4c45 → 0x3d3a34:

| | Kies | Trittsteine | Steinwerk |
| --- | --- | --- | --- |
| nachher | **144,3** | **115,9** | 137,3 |

**Spanne 11 → 28 Stufen, Reihenfolge richtig.** Im Bild liegen die Trittsteine
jetzt als dunkle Platten in einem hellen Bett statt daneben zu verschwinden.

Die Begründung, die im Quelltext gegen einen helleren Kies stand — „die Textur
kam mit dem Himmelslicht darüber als hellstes Ding im ganzen Bild heraus" —
galt für Himmelsfaktor 1,0. Seit Paket Q steht er auf 3,2, und der Vergleich
hatte sich umgedreht, ohne dass jemand nachgesehen hätte.

### Die Körnung: dreimal so viel Kontrast, gemessen null

Der zweite Teil des Befunds lautet: „Der Kies hat keinerlei Körnung, kein
Rauschen, kein einzelnes Steinchen." Die Körnung ist da — 26 000 Rechtecke von
ein bis drei Bildpunkten, bei 1024 px auf zehn Meter also ein bis drei
Zentimeter, die richtige Kieselgrösse. Ihre Streuung lag bei 92–132 mit
Deckkraft 0,5, also ±10 Stufen.

**Versucht:** Streuung 62–168 bei Deckkraft 0,72 — das Dreifache — plus ein
zweiter Durchgang mit 3 000 groberen Kieseln von drei bis sieben Bildpunkten,
die nach dem Verkleinern einzeln stehen bleiben sollten.

Hochpass auf einer **reinen** Kiesfläche (Kasten aus `knotenkasten.mjs`,
800–950 × 445–478):

    ohne die Aenderung   |d| 6,334   p95 20,55
    mit der Aenderung    |d| 6,049   p95 18,82

**Nichts, sogar minimal weniger** — der Rest ist die hellere Fläche, die die
Tonwertkurve stärker staucht. Die Körnung geht bei dieser Entfernung in der
Verkleinerung unter, unabhängig von ihrem Kontrast, und zwar auch die groberen
Kiesel, von denen ich es nicht erwartet hätte. Der Hebel wäre eine
Detailschicht, deren Massstab am Bildschirm hängt und nicht an der Fläche — ein
eigener Eingriff. **Zurückgenommen, Messung steht im Quelltext.**

### Und noch ein Kastenfehler, der vierte in dieser Sitzung

Vor der Messung oben habe ich den Hochpass zweimal in Kästen gemessen, die ich
für Kies hielt: (640,460)–(1150,545) enthielt überwiegend Farne, (1020,436)–
(1150,462) gar keinen Kies. Beide Male kam „keine Änderung" heraus — beim
zweiten Mal sogar für die Farbe, die nachweislich um sechzehn Stufen gestiegen
war. Erst `knotenkasten.mjs` hat den richtigen Ausschnitt geliefert.

Das ist in dieser Sitzung viermal passiert (Staub, Moossaum, Kies-Albedo, hier).
**Die Regel, die daraus folgt: kein Kasten ohne `knotenkasten.mjs` oder
`knotenwerte.mjs` davor.** Ein von Hand gesetzter Kasten ist eine Vermutung
über die Bildaufteilung, und die ist regelmässig falsch.

**Regression:** Insel, Konstrukt, Nachthimmel, Zen bitgleich. Im Dojo nur
`c-engawa` 4,2 %, alle übrigen unter 0,04 %. Budget: 114 Draw-Calls von 120,
319 326 Dreiecke von 350 000, 42,85 MB Textur. Konsole sauber.

Bildstand `tools/shots/dojo-42`.

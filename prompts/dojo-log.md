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

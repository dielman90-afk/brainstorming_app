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

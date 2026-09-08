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

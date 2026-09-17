# Gesamtbudget — was die Brille wirklich trägt

Dieses Log gehört zu keiner einzelnen Umgebung. Es hält fest, was gemessen
wird, wenn man die Frage nicht je Umgebung stellt, sondern für die ganze App.

---

## Befund 1 — Alle fünf Umgebungen liegen gleichzeitig im Speicher

**Ausgelöst durch den Nutzer:** „wieso hängt sich das Bild so stark auf über den
Browser?"

### Was ich bis hierher gemessen habe, und was daran fehlte

`tools/measure.mjs` läuft über die Gruppe **einer** Umgebung und summiert deren
Texturen und Dreiecke. Gegen dieses Maß habe ich achtzehn Pakete lang geprüft,
und es stand jedes Mal im grünen Bereich — zuletzt der Zen-Garten mit 96
Draw-Calls, 130 762 Dreiecken und 21,86 MB.

**Das ist die richtige Zahl für die Frage „passt diese Umgebung ins Budget" und
die falsche für die Frage „warum ruckelt es".** `main.js` baut nämlich alle fünf
Umgebungen beim Start und schaltet danach nur `group.visible` um. Unsichtbare
Netze werden nicht gezeichnet — ihre Texturen und Puffer liegen aber weiter im
Grafikspeicher. Die Brille trägt immer die Summe.

### Gemessen mit dem neuen `tools/gesamtspeicher.mjs`

    Umgebung        Texturen       MB     Dreiecke   sichtbar
      env-island          21    17,17      369 963   nein
      env-night            9     8,00      192 386   nein
      env-zen             34    21,86       96 351   nein
      env-matrix           6     1,98       50 898   nein
      env-dojo            36    42,77      226 970   nein

    Ganze Szene, Mehrfachnutzung einmal gezaehlt
      Texturen                180
      Texturspeicher       117,24 MB
      Dreiecke              936 568

Das Budget des Auftrags lautet **60 MB und 350 000 Dreiecke**. Die Szene trägt
das **Doppelte an Textur** und das **2,7fache an Geometrie**.

Und ein Einzelwert reisst es schon allein: **Die Himmelsinsel steht bei 369 963
Dreiecken** und liegt damit über dem Budget, das für sie allein gilt. Das ist
mir entgangen, weil ich sie zuletzt vor mehreren Paketen gemessen habe.

### Die Ladezeit

Zweiter Seitenaufruf, Übersetzer warm, damit nur die App selbst gezählt wird:

    domInteractive      48 ms      <- die Seite selbst ist sofort da
    domComplete     16 772 ms      <- der Aufbau der fuenf Umgebungen

**Rund siebzehn Sekunden**, und das ist fast reine Rechenarbeit im JavaScript:
Geometrie erzeugen, Canvas-Texturen zeichnen, Netze verschmelzen. Der
Software-Rasterizer dieses Containers hat damit wenig zu tun — auf dem Prozessor
der Quest wird es eher länger dauern als kürzer.

### Was das für das Ruckeln bedeutet

Drei Dinge, die zusammenkommen:

1. **Ein Einfrieren beim Start** von rund siebzehn Sekunden.
2. **117 MB Texturen und 937 000 Dreiecke dauerhaft im Speicher.** Die Quest 3
   teilt ihren Speicher zwischen Prozessor und Grafik; was nicht hineinpasst,
   wird ausgelagert, und das erzeugt genau das stockende Bild, das der Nutzer
   beschreibt.
3. **Kein Freigeben beim Wechsel.** Wer alle fünf Umgebungen einmal besucht,
   trägt sie danach alle.

### Was zu tun wäre

**Umgebungen erst bauen, wenn sie gewählt werden.** Die Vorlage dafür steht
schon im Quelltext: Die Umgebungskarte (PMREM) wird bereits so behandelt, mit
genau dieser Begründung — „Erst hier gebaut, nicht beim Laden … das wäre
Startzeit für jeden, der die Umgebung nie aufruft."

`createEnvironments()` ist dafür günstig gebaut: fünf Aufrufe und eine Schleife.
Zu klären ist, was **vor** dem Bauen bekannt sein muss (`id`, Name und Symbol
für das Menü und für die gemerkte Auswahl) und was erst danach kommt (`group`,
`fog`, `background`, `sceneAmbient`, `weltHeimat`, `update`).

Das verschiebt das Einfrieren vom Start auf den ersten Wechsel in jede
Umgebung — besser, aber nicht gut: Ein Ruck von drei bis fünf Sekunden beim
Umschalten bleibt. Vollständig behoben wäre es erst, wenn der Aufbau über
mehrere Bilder verteilt liefe.

**Noch nicht gebaut.** Der Umbau berührt `main.js` an mehreren Stellen und
damit Karten, Zonen und die Weltheimat des Planeten; er gehört abgesprochen und
nicht nebenbei gemacht.

---

## Paket 1 — Umgebungen werden erst gebaut, wenn sie gewählt werden

### Was gebaut wurde

`createEnvironments()` gibt jetzt **Stellvertreter** zurück statt fertiger
Umgebungen. Gebaut wird beim ersten Zugriff auf irgendein Feld; `scene.add()`
und das Nachholen einer schon gesetzten Qualitätsstufe passieren dabei.

Der Stellvertreter kennt genau drei Dinge selbst, und die dürfen nicht bauen:

* **`id`** — `main.js` sucht damit die gemerkte Umgebung, der Prüfstand seine
  Zielumgebung. Beides läuft über **alle** fünf.
* **`sichtbar(ja)`** — was nicht gebaut ist, ist auch nicht sichtbar; nur das
  Einschalten baut. Die Zeile in `applyEnvironment()`, die vorher
  `env.group.visible` für alle fünf setzte, hätte sonst weiter alle gebaut.
* **`setQuality(stufe)`** — läuft ebenfalls über alle fünf; die Stufe wird
  gemerkt und beim Bauen nachgeholt.

Alles andere leitet ein `Proxy` weiter. **Bewusst kein von Hand gepflegtes
Feldverzeichnis:** Die fünf Umgebungen liefern zusammen dreizehn verschiedene
Felder, und eine Liste vergisst früher oder später eines davon — der Fehler wäre
still, ein `undefined` statt eines Nebels.

### Gemessen

    Ladezeit bis zum ersten Bild, Uebersetzer warm
      vorher   domInteractive  48 ms   domComplete  16 772 ms
      nachher  domInteractive  34 ms   domComplete   1 024 ms

    Texturspeicher der ganzen Szene beim Start
      vorher   117,24 MB   180 Texturen   936 568 Dreiecke
      nachher   40,96 MB    89 Texturen         0 Dreiecke

**Der Aufbau fällt von 16,8 auf 1,0 Sekunden**, und beim Start liegt keine
einzige Umgebung im Speicher. Die verbleibenden 40,96 MB sind die Werkzeuge —
Karten, Whiteboard, Tastatur, Bedienflächen. Das ist der nächste Posten, wenn
einer gebraucht wird.

### Was das nicht löst

Der `🌐`-Knopf schaltet **zyklisch** weiter. Wer von Passthrough bis zum Dojo
durchklickt, baut auf dem Weg dorthin alle vier davor — jede einmal, danach nie
wieder. Der Start ist also schnell, der erste Durchlauf durch alle Umgebungen
kostet dieselbe Zeit wie früher, nur verteilt. Freigegeben wird weiterhin
nichts; wer alle fünf besucht hat, trägt danach alle.

Vollständig wäre es erst mit zwei weiteren Schritten: den Aufbau über mehrere
Bilder verteilen, und beim Wechsel wieder freigeben.

### Ein alter Fehler, den erst das Umbauen sichtbar gemacht hat

Nach der Umstellung wich das Konstrukt in der Regressionsaufnahme um 0,030 %
der Bildpunkte ab, Höchstabweichung 43 — und zwar **ausschliesslich in den drei
Schriftzügen** auf der Radio-Schautafel (AWA, DEEP IMAGE, RADIOLA TELEVISION).
Zweimal gerendert war das Ergebnis bitgleich mit sich selbst, also kein
Zeitrauschen.

Der Grund: `createEnvironments()` lief **synchron** beim Laden des Moduls.
JavaScript hat einen Faden — während dieses siebzehn Sekunden langen Blocks
konnte **keine** Schriftzusage auflösen. Die Schautafel wurde also mit dem
Ersatzzeichensatz gezeichnet und nie neu gezeichnet. Nachgemessen:

    "RADIOLA TELEVISION", 600 27px, Laufweite 9 px
      Space Grotesk   421,8 px
      Ersatzschrift   485,1 px

Der alte Stand war der breitere. **Der neue Stand ist der richtige** — das
Konstrukt zeigt zum ersten Mal die Schrift, in der es gesetzt ist.

Damit das nicht vom Zeitpunkt abhängt, meldet sich die Schautafel jetzt auf
zwei Wegen zum Nachzeichnen an: `onFontsReady` aus `fonts.js` für den
Normalfall und `document.fonts.ready` für den Wettlauf, in dem die Zusage schon
aufgelöst, die Datei aber noch nicht eingetragen ist. Dazu fehlte in
`fonts.js` die Familie **Space Grotesk** in der Liste der erzwungenen Schriften
— angefordert wurde sie nie, `fonts.ready` löste also auf, bevor sie da war.

### Regression

Alle sechs Zen-Kameras **bitgleich**, Insel und Nachthimmel **bitgleich**, Dojo
Δmax 4 auf 0,009 %. Konstrukt 0,030 % — die korrigierte Schrift, siehe oben.
Budget des Zen-Gartens unverändert (96 Draw-Calls, 130 762 Dreiecke, 21,86 MB).
`npm run build` grün, Konsole frei von Errors und Warnings. Bildstand
`tools/shots/zen-82`.

---

## Paket 2 — Die Bodenkamera, in allen fünf Umgebungen

### Warum das ein eigenes Paket ist

Im Inselpaket 45 hat der Nutzer ein Muster auf dem Boden gemeldet, das **keine
der sechs eingefrorenen Inselkameras zeigte**. Der Grund war kein Messfehler,
sondern eine Lücke im Prüfstand: Keine Kamera schaute steil nach unten. Man
geht durch die Umgebung, und dabei sieht man ständig auf den Grund vor den
eigenen Füßen — der am häufigsten betrachtete Bildausschnitt der ganzen App war
in keinem Prüfbild enthalten.

Diese Lücke gab es in **allen fünf** Umgebungen. Sie ist jetzt geschlossen:

    island    7-grasblick     54,9 Grad   Blickpunkt 1,25 m vor den Fuessen
    zen       g-bodenblick    49,4 Grad   1,39 m
    night     i-bodenblick    51,3 Grad   1,60 m
    matrix    g-bodenblick    52,3 Grad   1,25 m
    dojo      g-bodenblick    48,7 Grad   1,39 m

Alle fünf sind **angehängt, nicht eingefügt**. Die bestehenden Kameras behalten
Namen und Reihenfolge, die alten Vergleichsstände bleiben gültig. Belegt: Zen
bitgleich auf allen sechs alten Kameras, Dojo praktisch bitgleich (Δmax 4 bis 7
auf drei Bildern, dieselbe kleine Unbestimmtheit wie in den Läufen zuvor).

Beim Nachthimmel ist der Blickpunkt gerechnet statt geschätzt: 1,6 m Bogen auf
einer Kugel mit r = 25 m sind 0,064 rad, also (0,80 | 24,95 | −1,38). Die
Richtung ist Azimut 150 — dieselbe, in der der Mond steht, damit der Regolith
beleuchtet ist und nicht als schwarze Fläche liest.

### Was der erste Blick durch diese Kameras gefunden hat

**Zengarten — der stärkste Fund.** Die Trittsteine sind flache Prismen mit
geradkantigem Vieleckumriss, und ihre Seitenfläche ist **unbeleuchtet**. Ein
senkrechtes Profil bei x = 350 über die Steinkante:

    Deckflaeche       71 bis 112
    Seitenflaeche     19  19  19  19  20  20     (sechs Bildpunkte, konstant)
    Sand in der Sonne 149 bis 170

Die Seite steht bei **12 Prozent** des besonnten Sandes und ist über ihre ganze
Höhe konstant — sie bekommt nur die flache Aufhellung, keine Himmelsrichtung.
Ein Kontaktschatten ist vorhanden (der Sand fällt am Fuß von 160 auf 64 bis 96),
der fehlt also nicht. Im selben Bild: Die Harkrillen laufen **gerade unter den
Steinen durch**, und links treffen gerade Züge auf konzentrische Bögen — das
sind die offenen Prüferbefunde 3 und der Rest von Paket BC, jetzt zum ersten Mal
in einem Prüfbild statt nur im Bericht.

**Konstrukt — der Grund vor den Füßen ist ein leeres Blatt.** Über die untere
Bildhälfte, 433 481 Bildpunkte:

    Mittel 223,7   p05 221   p50 224   p95 227   max 230

Sechs Tonwertstufen zwischen dem 5. und dem 95. Perzentil. Kein Raster, keine
Körnung, kein Maßstab, nichts, woran das Auge Entfernung ablesen könnte. Die
bestehende Kamera `f-boden` schaut 40 Grad nach unten und zeigt die Fußpunkte
der Möbel drei Meter weiter — sie hat das nie erfasst.

**Nachthimmel — die Krater sind als Beulen beleuchtet.** Vergrößert tragen sie
sehr wohl eine Licht-Schatten-Paarung; mein erster Eindruck „flache Aufkleber"
war bei 1:1 zu schnell. Die Polarität stimmt aber nicht. Gemessen gegen einen
sicher konvexen Körper im selben Bild:

    Fels (konvex)   linke Flanke 44,4   rechte Flanke 81,0
    Krater A        linke Flanke 62,7   rechte Flanke 83,1
    Krater B        linke Flanke 65,2   rechte Flanke 70,7
    Regolith ringsum                    74,5

Krater und Fels sind **gleichsinnig** schattiert: links dunkel, rechts hell. Eine
Mulde muss unter demselben Licht andersherum liegen — ihre der Lichtquelle
zugewandte Innenwand ist die linke. Die Krater lesen deshalb als Blasen, nicht
als Löcher. Dazu haben sie alle dieselbe Größe, dieselbe Eiform und dieselbe
Achsneigung, und keiner hat einen Wall.

**Dojo — hier hatte ich weitgehend unrecht, und das gehört hierher.** Drei
Eindrücke aus dem Bild, alle drei nachgemessen:

    „alle Matten gleich"       falsch: Spanne 22 Stufen ueber sechs Matten
                               (124,5 bis 146,5)
    „kein Kontaktschatten"     falsch: am Pfostenfuss 127,8 gegen 140,8
                               sechzig Bildpunkte weiter, also 13 Stufen
    „das Randband ist gemalt"  bestaetigt

Das Heri, über 4090 Abtastungen auf dem ganzen Boden: Mittel 65,2, p05 62,
p95 71 — **neun Stufen Spanne**, während die Matten daneben 115 bis 150 tragen,
also fünfunddreißig. Das Randband ist über den ganzen Raum hinweg derselbe
flache Ton, ohne Gewebe, ohne Glanzwechsel, ohne Reaktion auf den Blickwinkel.

### Budget: die neuen Kameras setzen nirgends den Hoechstwert

Das war die eine Sorge bei einem zusaetzlichen Bildausschnitt — ein Budget ist
der Hoechstwert ueber alle Kameras, und eine neue Kamera kann ihn heben. Tut sie
nicht. Je Umgebung der bisherige Hoechstwert gegen die neue Kamera:

    Umgebung   Hoechstwert (Kamera)          neue Bodenkamera
    zen         95 Calls / 96.920 (a,d)       68 Calls /  77.917
    matrix      24 Calls / 50.898 (a,c,d,e,f) 21 Calls /  43.338
    dojo       114 Calls / 323.646 (f)        98 Calls / 298.350
    night       21 Calls / 344.186 (a,b)      18 Calls / 344.182

Alle vier Bodenkameras liegen unter dem jeweiligen Hoechstwert, in Draw-Calls
wie in Dreiecken. Kein Budgetwert aendert sich durch dieses Paket.

**Zwei bestehende Engstellen, die dabei aufgefallen sind und nichts mit diesem
Paket zu tun haben:** Das Dojo steht bei 114 von 120 Draw-Calls (95 Prozent,
gesetzt von `f-gegenlicht` und `d-suedfront`), der Nachthimmel bei 344.186 von
350.000 Dreiecken (**98,3 Prozent**, gesetzt von `a-augenhoehe`). Beim
Nachthimmel bleiben damit 5.814 Dreiecke Luft — jede kuenftige Aenderung an der
Planetengeometrie muss das mitrechnen. Das gehoert in dieses Log und ist hiermit
notiert.

### Offen

Die vier Befunde oben sind **gefunden, nicht behoben**. Sie sind Arbeit für die
nächsten Pakete, in dieser Reihenfolge nach Wirkung: Konstrukt-Grund,
Zen-Trittsteine, Planetenkrater, Dojo-Heri.

Die beiden veralteten Stände `konstrukt-37` und `planet-21`, die im Inselpaket
45 als offener Punkt notiert waren, sind mit diesem Lauf erneuert.

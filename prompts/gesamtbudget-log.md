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

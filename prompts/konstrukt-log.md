# ⬜ Konstrukt — Arbeitsprotokoll

Dieselben Regeln wie bei 🌌 Nachthimmel und 🏝 Himmelsinsel: rein prozedural,
keine neuen Abhängigkeiten, keine Regression in den anderen vier Umgebungen,
Budget 120 Draw-Calls / 350 000 Dreiecke / 60 MB Textur, ein Commit je
bestandenem Paket, und jede Behauptung mit einer Zahl belegt.

Was diese Umgebung ist: der weiße „Konstrukt"-Raum — eine unendlich wirkende,
nahtlose Leere ohne sichtbaren Horizont, und darin genau eine Sitzgruppe aus
zwei roten Sesseln, einem Ständer und einer Radiola-Konsole mit Bildröhre. Es
ist wenig Gegenstand auf viel Fläche; genau deshalb muss jeder einzelne davon
tragen.

---

## Paket 0: Der Prüfstand ist wiederholbar

**Diese Umgebung war als einzige der fünf von jeder Messung ausgenommen.** Die
Warnung stand wörtlich im Harness:

> Achtung beim Pixelvergleich: ⬜ Konstrukt ist NICHT reproduzierbar. Das Bild
> der Röhre wird mit `Math.random()` verrauscht und das Schirmlicht flackert
> zufällig – zwei Läufe desselben Standes unterscheiden sich dort immer. Für
> diese Umgebung zählt der Blick aufs Bild, nicht der Byte-Vergleich.

Damit war jede Aussage über sie eine Behauptung. Zwei Stellen waren schuld, beide
in `makeRadiolaConsole`:

* das **Korn** der Bildröhre — `(Math.random() - 0.5) * 42` je Bildpunkt, neu
  gezogen bei jedem Neuzeichnen (alle 0,08 s),
* das **Flackern** des Schirmlichts — `Math.random() * 0.05`.

Beide hängen jetzt an der **Bildnummer** (`Math.floor(time / 0.08)`), aus der ein
`mulberry32` gespeist wird. Die Röhre rauscht und flackert weiterhin — sie tut es
bei derselben Zeit nur zweimal gleich.

### Belegt

Zwei vollständig getrennte Läufe desselben Standes, über alle sechs neuen
Prüfansichten:

| Ansicht | Δmittel | Δmax |
| --- | ---: | ---: |
| a-augenhoehe | 0,000 | **0** |
| b-sessel | 0,000 | **0** |
| c-roehre | 0,000 | **0** |
| d-schautafel | 0,000 | **0** |
| e-schraeg | 0,000 | **0** |
| f-boden | 0,000 | **0** |

Bitgleich. Die Warnung im Harness ist ersetzt.

### Die sechs Prüfkameras

Neu in `tools/harness-common.mjs` als `KONSTRUKT_SHOTS`. Die Sitzgruppe steht bei
z = −3,9; die Sessel bei x = ±1,06 / z = −4,78, das Gerät bei z = −3,12 auf 0,30 m
Ständerhöhe. **Die Bildröhre zeigt nach −Z**, also zu den Sesseln — wer sie sehen
will, muss zwischen Gerät und Sesseln stehen; was der Nutzer von seinem Platz aus
sieht, ist die Schautafel auf der Rückseite. Das ist keine Nebensache, sondern
bestimmt, welche Fläche überhaupt Aufmerksamkeit verdient.

| Name | Was sie zeigt |
| --- | --- |
| `a-augenhoehe` | der Blick vom Platz des Nutzers |
| `b-sessel` | der linke Sessel nah: Polster, Nähte, Knöpfe |
| `c-roehre` | die Bildröhre von der Sesselseite |
| `d-schautafel` | die Rückseite, die der Nutzer tatsächlich sieht |
| `e-schraeg` | die ganze Gruppe von schräg oben |
| `f-boden` | Boden und Fußpunkte, der horizontlose Grund |

---

## Paket 1: Die horizontlose Leere hatte einen Horizont

Das ist die Gestaltungsidee dieser Umgebung, wörtlich aus dem Quelltext: „eine
unendlich wirkende, nahtlose weiße Leere **ohne sichtbaren Horizont**". Sie hatte
einen, und zwar quer durch das ganze Bild.

Gemessen in `a-augenhoehe`, Spalte 200, senkrechtes Profil:

    y=256  225,2      y=260  224,2      y=262  224,2
    y=263  226,6      y=266  226,8      y=272  226,8

**In einer einzigen Bildzeile 2,4 Stufen**, dazu ein Tonwechsel von bläulich
(219 | 225 | 231) auf neutral (226 | 227 | 227). Zwei Stufen sind als Fläche
nichts; als gerade Kante über 1280 Bildpunkte sind sie alles — das Auge findet
eine Linie weit unterhalb der Schwelle, ab der es einen Flächenunterschied
bemerkt.

### Drei Ursachen, und keine davon war die, die der Kommentar behauptete

Der Kommentar an der Stelle sagte „Nahtloser Boden im **selben** Weißton wie der
Kuppelgrund".

**Erstens: es war nicht derselbe Ton.** Kuppelgrund 0xeef1f4, Boden 0xf3f5f8.

**Zweitens: der Aufruf von `makeDome` war falsch, und zwar zweifach.** Die
Signatur ist `makeDome(topColor, horizonColor, bottomColor = horizonColor,
radius = 44, …)`. Übergeben wurde `(0xffffff, 0xeef1f4, 60)` — die 60 war als
Radius gemeint und landete als **bottomColor**: `new THREE.Color(60)` ist
0x00003C, ein fast schwarzes Blau. Der Radius blieb auf 44, während der Boden
mit 60 gebaut wird; der Boden ragte also 16 m über die Kuppel hinaus. Die beiden
anderen Aufrufer im Projekt übergeben fünf Argumente korrekt, nur dieser nicht.

**Drittens, und das ist der eigentliche Punkt: gleicher Hexwert heißt nicht
gleiche Farbe.** `makeDome` schreibt seine Farbe roh in den Puffer, ohne
Tonemapping — dieselbe Lehre, die an der Nachthimmelkuppel schon ausführlich
steht. Der Boden war ein gewöhnliches Material und lief durch ACES. Gemessen:

| Hexwert | in der Kuppel | im Boden |
| --- | --- | --- |
| 0xeef1f4 | (218 \| 224 \| 231) | (224 \| 225 \| 228) |

Selbst wenn beide Kommentare recht gehabt hätten und derselbe Wert eingetragen
gewesen wäre, hätte die Naht bestanden.

### Was geändert wurde

* Der `makeDome`-Aufruf übergibt jetzt `bottomColor` und `radius` an ihrer
  richtigen Stelle.
* Der Boden trägt einen **radialen Verlauf** im Shader: nah der Ton, den er
  vorher hatte, am Rand genau der der Kuppel. Übergang zwischen 6 und 34 m — der
  Verlauf muss dort schnell sein, wo der Horizont steht, nicht in der Mitte;
  deshalb Shader und nicht Scheitelfarben (`CircleGeometry` hat nur einen Ring).
* Der Boden läuft **ohne Tonemapping**, wie die Kuppel. Eine Fläche, die als
  Rückwand dient und nicht als beleuchtete Oberfläche, hat darin nichts zu
  suchen — und nur so lassen sich beide exakt aufeinander setzen.

Ein Zwischenschritt hat den Bodenwert stattdessen **gegen** die ACES-Kurve
kalibriert (zwei bekannte Punkte, örtliche Steigung 0,4 bis 0,5). Das kam auf
1,0 Stufen Restsprung und lief im Blaukanal an die 255 — der Umweg ist im
Protokoll, weil er zeigt, warum der direkte Weg der richtige war.

### Gemessen danach

    y=262 (Kuppel)  218,224,231
    y=263 (Boden)   218,224,231

**Exakt gleich.** Der größte Sprung von Zeile zu Zeile im ganzen Band von y=200
bis 330 liegt jetzt bei **0,72** (vorher 2,49) und sitzt bei y=216 — mitten im
Verlauf der Kuppel, also im normalen Verlaufsraster und nicht an einer Grenze.

Der Nahbereich ist unverändert: y=500 steht bei (226 | 227 | 227), demselben Wert
wie vorher.

### Regression

Zen und Nachthimmel bitgleich, Dojo Δmax 5 bei 0,009 % — und weil diese drei
`makeDome()` mitbenutzen, ist damit zugleich belegt, dass an der Funktion selbst
nichts geändert wurde. Im Konstrukt: `e-schraeg` Δmittel 0,870 ·
`a-augenhoehe` 0,741 · `b-sessel` 0,471 · `f-boden` 0,199 · `c-roehre` 0,198 ·
`d-schautafel` 0,043, überall Δmax 8. Build grün, Konsole sauber.

### Die Lehre dieser Runde

**Ein Kommentar ist kein Beleg.** Hier standen zwei Behauptungen — „derselbe
Weißton" und ein Radius, der keiner war — und beide waren falsch, seit sie
geschrieben wurden. Gefunden hat sie nicht das Lesen, sondern eine Spalte
Pixelwerte.

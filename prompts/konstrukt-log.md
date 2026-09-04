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

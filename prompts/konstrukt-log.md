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

---

## Paket 2: Die Möbel standen nicht, sie lagen auf

In dieser Umgebung warf **nichts** einen Schatten. Es gab genau einen gemalten
Fleck — eine weiche Ellipse von 1,8 m unter der ganzen Gruppe —, der weder die
Form der Sessel noch die dünnen Beine des Ständers kennt. In `f-boden` enden die
Beine im Nichts.

Das wiegt hier schwerer als in jeder anderen Umgebung: In einer weißen Leere ist
der Schatten die **einzige** Angabe darüber, wo ein Gegenstand steht und wie er
geformt ist. Es gibt sonst nichts, woran man ihn messen könnte.

### Zwei verschiedene Dinge, und beide fehlten

**Der Schlagschatten.** Das Führungslicht wirft jetzt. Der Ortho-Kasten ist eng —
die Sitzgruppe misst rund 3,8 × 3,0 m, die Schattenkamera deckt ±3 m ab; bei 1024
Texeln sind das **5,9 mm je Texel**, schärfer als in jeder anderen Umgebung des
Projekts, und möglich nur, weil hier so wenig steht. Das Ziel wandert zur
Sitzgruppe, die Lichtposition um denselben Betrag: Ein gerichtetes Licht kennt
nur die Differenz, die Lichtrichtung bleibt exakt dieselbe wie vorher.

**Der Boden kann keinen Schatten empfangen.** Er ist ein `MeshBasicMaterial`,
also unbeleuchtet — per Bauart nimmt er keinen an. Ihn auf ein beleuchtetes
Material umzustellen hieße, die in Paket 1 kalibrierte Farbe der Beleuchtung
auszuliefern und die Naht zur Kuppel wieder aufzureißen. `ShadowMaterial` ist
für genau diesen Fall da: eine durchsichtige Fläche, die nur den empfangenen
Schatten zeigt und über dem Boden liegt, ohne dessen Ton anzufassen. Radius 8
statt 60 — weiter reicht der Ortho-Kasten ohnehin nicht.

**Die Kontaktverdunklung.** Der Schlagschatten fällt nach hinten rechts. Am
Sesselfuß ändert er nichts (209,8 gegen 208,8), und das ist kein Mangel der
Einstellung, sondern der Natur der Sache: Was einen Gegenstand *stehen* lässt,
ist die Verdunklung unmittelbar an seiner Aufstandsfläche, und die kommt von
einem entfernten gerichteten Licht grundsätzlich nicht. Der eine große Fleck
half dabei nicht, weil er unter niemandem saß: Ein Sessel steht 1,06 m von der
Mitte, sein Fuß also am Rand des Flecks, wo dieser fast ausgeblendet ist. Jetzt
hat jedes Möbel seinen eigenen (Sessel 0,58 m, Gerät 0,42 m), und der gemeinsame
Fleck ist auf die halbe Deckkraft zurück — er bindet, er trägt nicht mehr.

### Gemessen in `f-boden`

| Stelle | vorher | + Schlagschatten | + Kontaktflecken |
| --- | ---: | ---: | ---: |
| Boden am linken Sesselfuß (470,255) | 191,8 | **134,0** | 132,0 |
| Boden unter dem Gerät (640,430) | 172,8 | 172,8 | **163,0** |
| Bodenkasten, Anteil über L 190 | 72,8 % | 66,9 % | **66,5 %** |

Die beiden Zeilen zeigen die Arbeitsteilung genau: Der Schlagschatten bringt dem
Sesselfuß 58 Stufen und dem Gerät null, die Kontaktflecken bringen dem Gerät
zehn. Keiner der beiden hätte den anderen ersetzt.

### Kosten — und warum daraus ein eigenes Stück Arbeit wurde

Der Schattendurchgang zeichnet jeden Werfer ein zweites Mal. Pauschal alle
Meshes der Sitzgruppe werfen zu lassen, brachte die Umgebung von **56 auf 109
Draw-Calls** — mehr als die ganze Himmelsinsel mit ihren Bäumen, Findlingen und
Wolken (74), und das für zwei Sessel und ein Fernsehgerät. Im Budget (120), aber
nur knapp, und als Verhältnis absurd.

**Erster Schritt: Werfer nach Größe.** Ein Sessel besteht aus Dutzenden kleiner
Teile, Knöpfe und Keder eingeschlossen. Ein Knopf von einem Zentimeter wirft bei
5,9 mm je Texel einen Schatten aus zwei Texeln — dasselbe Argument wie bei den
Pilzen der Insel, nur hier mit einem Preis in Draw-Calls dahinter. Schwelle bei
6 cm Hüllkugelhalbmesser: **109 → 99**. Empfangen sollen dagegen alle, das
kostet nichts.

**Zweiter Schritt, und der eigentliche: verschmelzen.** Die beiden Sessel sind
statisch und teilen sich drei Werkstoffe. Genau dafür steht `verschmelzeObjekte()`
in dieser Datei. Damit es greift, mussten die Werkstoffe zuerst aus der
Sesselfunktion heraus — vorher legte jeder Aufruf eigene an, und zwei Sätze
gleicher Werkstoffe ergeben doppelt so viele Meshes wie einer. Danach:

| Stand | Knoten | Draw-Calls | Dreiecke |
| --- | ---: | ---: | ---: |
| Ausgangsstand, **ohne** Schatten | 56 | 56 | 20 750 |
| mit Schatten, alle werfen | 60 | **109** | 39 594 |
| Werfer ab 6 cm | 60 | 99 | 38 282 |
| **Sessel verschmolzen** | **27** | **43** | 39 470 |

Die Umgebung kostet jetzt **mit** Schlagschatten weniger als vorher **ohne**:
43 gegen 56. Die Dreiecke steigen leicht (verschmolzene Meshes werden immer ganz
gezeichnet), das ist bei 350 000 Grenze belanglos.

Belegt, dass das Verschmelzen optisch nichts tut: `c-roehre` bitgleich, die
übrigen fünf Ansichten Δmittel zwischen 0,002 und 0,015 bei höchstens 0,011 %
der Bildpunkte ≥ 2.

### Regression

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 6 bei 0,009 %. Build grün,
Konsole frei von Errors und Warnings.

### Die Lehre dieser Runde

**Ein Schatten kostet so viele Draw-Calls, wie der Gegenstand Teile hat.** Das
ist der Preis, den man beim Einschalten nicht sieht und beim Messen sofort. Und
die Antwort darauf war nicht, den Schatten wieder wegzunehmen, sondern das
Möbel so zu bauen, wie es hätte gebaut sein sollen.

---

## Paket 3: Der Sessel war ein Klotz mit aufgeklebten Punkten

### Das Sitzkissen, und warum keine Textur es rettet

Gemessen ist es die glatteste Fläche des ganzen Sessels:

| Fläche | Hochpass |
| --- | ---: |
| Sitzkissen (560,380)–(760,440) | **0,96 / 0,76** |
| Rückenlehne (560,180)–(760,240) | 1,39 / 1,79 |
| Armwange (420,300)–(480,460) | 1,90 / **5,44** |

Bei achtfacher Vergrößerung ist die Kissenoberseite praktisch eine Volltonfläche.
Die Ledernarbung **liegt** darauf — sie zeigt sich nur nicht: Eine Normalenkarte
wirkt über den Winkel zwischen gestörter Normale und Licht, und auf einer nach
oben gerichteten Fläche unter einem steilen Führungslicht ist dieser Winkel
klein. Dieselbe Karte trägt an der senkrechten Wange, die dasselbe Licht
streifend bekommt, das Fünffache.

Dagegen hilft keine stärkere Textur, sondern **Form**. Ein Polster hat ohnehin
einen Keder — die eingenähte Schnur entlang der Naht —, und der gibt einem
Kissen aus jeder Richtung eine Kante. Neu: `kederRing()`, ein Schlauch entlang
eines abgerundeten Rechtecks, einmal um das Kissen auf halber Polsterhöhe und
einmal auf der Oberkante des Unterbaus.

**Der Sockelkeder brauchte zwei Anläufe.** Der erste lag bei y = 0,375, drei
Millimeter unter der Oberkante — die Schnur steckte damit fast vollständig im
Korpus, und was herausschaute, war ein dünner dunkler Strich quer über die
Vorderseite. Er las als vergessener Draht. Ein Keder muss **auf** der Kante
sitzen, nicht darin; jetzt liegt er bei 0,381.

### Die Knöpfe, und warum ein Ring noch keine Mulde ist

Vorher: flache dunkle Punkte auf glattem Leder, also Aufkleber. Eine
Kapitonierung zieht das Polster am Knopf **ein**; was man sieht, ist nicht der
Knopf, sondern der Trichter um ihn herum.

Auch hier zwei Anläufe, und der erste ist lehrreich: Mit Schnurstärke 0,012 und
vier Millimeter vor der Fläche standen Ringe wie Ösen auf dem Leder — ein
Beschlag, kein Polster. Eine Falte ist weich und niedrig: jetzt 0,0075 stark, in
z auf 30 % gestaucht, fünf Millimeter eingelassen. Die Knöpfe selbst sitzen drei
Millimeter **hinter** der Fläche statt zwei davor.

Kosten dafür: keine. Keder und Mulden teilen sich die Werkstoffe des Sessels und
werden mit ihm verschmolzen — 43 Draw-Calls wie vorher, Dreiecke 39 470 →
59 726 bei einer Grenze von 350 000.

### Was die Messung dazu sagt — und was sie nicht sagt

Nichts. Hochpass der Knopftafel 1,318 → 1,399, lokale Spanne um einen einzelnen
Knopf p05/p95 von 18/33 auf 17/33. Im vergrößerten Ausschnitt ist der
Unterschied dagegen unübersehbar: aus Punkten sind Knöpfe in weichen Mulden
geworden.

Beides stimmt, und der Widerspruch hat zwei Gründe:

**Der Maßstab.** Ein Muldenring ist im Bild rund dreißig Bildpunkte groß. Ein
Hochpass über ein 5×5-Fenster sieht davon nichts — dieselbe Vergrößerungsfalle
wie bei der Wiese der Insel, nur andersherum.

**Der Tonwert, und das ist der ernstere Punkt.** Die Knopftafel liegt bei einem
Mittel von **24** und zu **99,7 % unter L 40**, vor einem Hintergrund von L 226.
Jede Modellierung dort bewegt ein bis vier Luminanzstufen, weil die Fläche
schlicht fast schwarz ist. Der Sessel liest von weitem als schwarzer Ausschnitt
vor Weiß.

**Das ist der nächste Befund, und er wiegt schwerer als die Knöpfe.** Er steht
hier und wird als eigenes Paket gemessen, nicht nebenbei mitgedreht.

### Offen geblieben

Die **oberste Knopfreihe** hat keine Mulde. Die Rückenlehne ist
`roundedBox(W, backH, 0.19, 0.16)`: Bei 19 cm Tiefe und 9,6 cm Fase ist ihre
Vorderseite fast vollständig gerundet, die Fläche weicht nach oben zurück, und
der eingelassene Ring verschwindet dort im Körper. Mit neun Millimetern Einlass
fehlten zwei Reihen, mit fünf nur noch eine. Ganz ohne Einlass säßen die Ringe
auf allen Reihen — dann aber wieder als Ösen. Ich habe die fünf Millimeter
behalten und schreibe die eine Reihe hierher.

### Regression

Zen, Nachthimmel und Insel bitgleich, Dojo Δmax 6 bei 0,009 %. Build grün,
Konsole sauber.

---

## Paket 4: Der Sessel war ein schwarzer Ausschnitt vor Weiß

Der Befund aus Paket 3, jetzt als eigene Messung. Auf den **eigenen
Bildpunkten** des Sessels (Maske aus Ein- und Ausblenden, kein Rechteck):

| | Median | p05 | p95 | unter L 40 |
| --- | ---: | ---: | ---: | ---: |
| Lederkörper | **16** | 12 | 154 | — |
| Polster | 30 | 21 | 159 | — |
| Holzteile | 10 | 7 | 156 | — |
| ganze Sesselfläche | **28** | 13 | 159 | **74,3 %** |

Der Hintergrund steht bei 226. Drei Viertel des Möbels liegen unter L 40 — jede
Modellierung, die man dort hineinbaut, Keder und Knopfmulden eingeschlossen,
bewegt ein bis vier Luminanzstufen und ist unsichtbar.

**Er war schon vorher so.** Knopftafel im Ausgangsstand 25,3, nach dem
Schattenpaket 24,1 — die 1,2 Stufen gehen auf den neuen Schlagschatten, der Rest
war immer da.

### Warum der Hebel hier so billig ist

Boden und Kuppel sind **unbeleuchtete** Materialien (`MeshBasicMaterial` und ein
eigener Shader). Licht trifft in dieser Umgebung ausschließlich die Möbel. Man
kann die Beleuchtung verdreifachen, ohne dass die weiße Leere sich um eine Stufe
ändert — was in jeder anderen Umgebung des Projekts undenkbar wäre.

Und es ist das physikalisch Richtige: Ein dunkelroter Sessel in einem weißen
Unendlich-Hohlraum bekommt von allen Seiten Rückwurf. Dass er dort fast schwarz
stand, war kein dramatisches Licht, sondern ein fehlender Lichtweg.

### Der Sweep

`tools/konstruktlicht.mjs` fährt Hemisphäre und Führungslicht zugleich ab und
misst neben der Tonlage die **Spanne** p05 bis p95 — ein Sessel, der bloß
gleichmäßig heller wird, hätte nichts gewonnen:

| Einstellung | Median | Spanne | unter L 40 |
| --- | ---: | ---: | ---: |
| Hemi ×1,0 Key ×1,0 (Stand) | 28 | 146 | 74,3 % |
| Hemi ×2,0 Key ×1,0 | 40 | 140 | 51,0 % |
| **Hemi ×2,6 Key ×1,4** | **48** | **136** | **25,7 %** |
| Hemi ×3,2 Key ×1,6 | 56 | 132 | 18,5 % |

Die dritte Zeile: Der Median steigt um zwanzig Stufen, drei Viertel der schwarzen
Fläche verschwinden, und die Spanne kostet das **zehn** Punkte von 146. Das ist
kein Tausch, das ist ein Fund.

Gesetzt: Hemisphäre 1,5 → **3,9**, Führungslicht 0,7 → **0,98**.

### Gemessen danach

Sessel-Lederkörper Median 16 → **26**, Polster 30 → **51**, Mittel 48,2 → 65,5.
Die Konsole gewinnt mit: Schautafel Mittel 49,8 → **79,5**, Anteil unter L 40
13,7 → 6,4 %.

**Und die Leere ist bitgleich.** Vier Messpunkte in `a-augenhoehe`, vorher wie
nachher: Kuppel oben (226 | 231 | 236), Kuppel am Horizont (218 | 224 | 231),
Boden am Horizont (218 | 224 | 231), Boden nah (226 | 227 | 227). Keine einzige
Stufe. Die Überlegung, dass Licht hier nur die Möbel trifft, ist damit nicht nur
plausibel, sondern belegt.

### Regression

Zen, Nachthimmel und Insel bitgleich, Dojo Δmax 4 bei 0,010 %. Build grün,
Konsole sauber.

### Die Lehre dieser Runde

**Erst die Tonlage, dann das Detail.** Keder und Knopfmulden waren richtig und
sind trotzdem in einer Fläche gelandet, die zu drei Vierteln unter L 40 lag. Die
Reihenfolge war falsch: Wer Modellierung in einen schwarzen Umriss baut, baut
sie für niemanden. Dass es hier trotzdem gut ausgeht, liegt daran, dass beide
Änderungen bleiben — die Mulden sieht man jetzt erst.

---

## Der Prüfer, erster Durchgang am Konstrukt

Angesetzt auf `konstrukt-12`, also nach den vier Paketen. Sein Gesamturteil:
Die Leere ist geglückt — nahtlos, ohne Kante, ohne Fleck. Was die Umgebung
zurückhält, ist **Schatten 152 zu Boden 227, also 0,674**: Das gerichtete Licht
liefert nur ein Drittel der Beleuchtung, zwei Drittel sind flaches Ambiente.
Zwanzig belegte Mängel, vier ausdrücklich als unbestätigt markiert.

Was er ausdrücklich **nicht** gefunden hat: Z-Fighting, Durchdringungen,
freischwebende Bauteile, eine sichtbare Kuppelnaht, einen Tonwertsprung am
Horizont. Paket 1 hält.

Zwei seiner Befunde betrafen meine eigene letzte Änderung, und einer davon war
falsch: „Es gibt keinen einzigen Keder am ganzen Sessel." Doch — zwei, seit
Paket 3, und im vergrößerten Ausschnitt liegt der Sockelkeder als sauberer
dunkler Strang unter der Sitzvorderkante. Was er sah und zu Recht bemängelt hat,
ist der **Sägezahn-Kamm darüber**: die Ledernarbung, über die Fase des Kissens
anisotrop gestreckt. Ein UV-Problem, kein fehlendes Bauteil — aber ein Fehler,
und er steht auf der Liste.

---

## Paket 5: Zwei Flächen, die keine Information trugen

### Der Boden war nicht unter dem Nutzer, sondern um ihn

Befund #1 des Prüfers, und der mit der größten Fläche: In `f-boden` ist die
Spalte x = 200 von y = 100 bis 719 — **620 Zeilen — durchgehend exakt
(226 | 227 | 227)**, ohne eine einzige Änderung. In `a-augenhoehe` über die
untere Bildhälfte p05 225 / p95 227 bei 193 596 Bildpunkten.

Seine Formulierung trifft es genau: Die Leere war dann nicht mehr *unter* dem
Nutzer, sondern nur noch *um* ihn. Ein Grund ohne jeden Verlauf ist keine
Fläche, auf der man steht, sondern eine zweite Wand.

Zwei Ursachen:

* Der radiale Verlauf aus Paket 1 lief von **6 bis 34 m**. Die Bodenkamera sieht
  Boden von anderthalb bis sechs Metern — der Verlauf hatte dort noch gar nicht
  begonnen. Jetzt 1 bis 14 m.
* Die Kontaktscheibe unter dem Nutzer war da und trug nichts: Radius 3,2 bei
  Deckkraft 0,5, im Bild nicht messbar. Jetzt Radius 6 bei 0,8.

Gemessen in `f-boden`, Spalte x = 200:

    vorher   226,8  226,8  226,8  226,8  226,8  226,8  226,8  226,8
    nachher  226,5  229,5  230,7  230,6  229,9  229,6  229,4  228,6

Aus einer Konstanten wird ein Verlauf mit einem Rücken im Mittelgrund und
Abfall nach beiden Seiten. Untere Bildhälfte in `a-augenhoehe`: p05/p95 von
225/227 auf **226/230**, also von zwei auf vier Stufen.

**Und die Naht bleibt unangetastet**: (218 | 224 | 231) auf beiden Seiten,
vorher wie nachher. Der Verlauf endet am fernen Ende genau auf der Kuppelfarbe;
das war der Grund, ihn dort zu verankern.

### Das Gehäuse war ein Farbeimer

Befund #2: Seitenfläche in `e-schraeg` (545,320)–(600,430), 6216 Bildpunkte,
**p05 = p95 = 101**. Deckel (470,275)–(550,295): **p05 = p95 = 126**. Nicht eine
Stufe Variation — und direkt daneben die Schautafel mit neunzig Stufen Textur.

Der Kommentar am Werkstoff sagte „Gealtertes Messing/Olivbronze mit Patina".
Eine Patina war nie da; es standen nur Farbe, Rauheit und Metallanteil.

`patinaKorn()` legt sie in den Shader: grobe Flecken von rund 9 cm für die
Alterung, ein feines Korn von 1,5 cm für die Oberfläche, beides auf Albedo
**und Rauheit**. Bei einem halb metallischen Werkstoff trägt die Rauheit mehr
als die Farbe, weil sie den Glanz aufbricht — Patina ist stumpfer als das blanke
Metall darunter, nicht glänzender.

Der Ort kommt aus der Welt und nicht aus der UV: Der Kasten besteht aus Korpus
und Schulter, deren UV-Maßstäbe nichts voneinander wissen.

| Fläche | vorher | nachher |
| --- | --- | --- |
| Seite `e-schraeg` | p05 101 / p95 101 · Mittel 101,2 | p05 **95** / p95 **107** · Mittel 101,1 |
| Deckel `e-schraeg` | p05 126 / p95 126 · Mittel 126,3 | p05 **121** / p95 **133** · Mittel 127,0 |

Aus null Stufen werden zwölf, bei praktisch unverändertem Mittel — es ist reine
Modulation und keine Aufhellung.

### Kosten und Regression

43 Draw-Calls und 59 726 Dreiecke, beides unverändert: Beide Änderungen stehen
in Shadern und in zwei Zahlen. Zen, Nachthimmel und Insel bitgleich, Dojo Δmax 5
bei 0,011 %. Konsole frei von Errors und Warnings.

### Die Lehre dieser Runde

**Der `shaderlint` hat zum sechsten Mal Backticks gefunden — und diesmal hätte
ich es fast nicht gemerkt.** Ich hatte die Bauausgabe auf `error|✓ built`
gefiltert; die Lint-Meldung sagt aber „Fund(e)". Der Bau brach ab, der
Entwicklungsserver lieferte weiter die kaputte Quelle, und der Prüfstand lief in
einen 60-Sekunden-Timeout, dessen Ursache erst der ungefilterte Bau zeigte. Ein
Filter, der Fehlermeldungen verschluckt, ist schlimmer als kein Filter.

---

## Der Splitter im Schatten: vier Anläufe, vier Widerlegungen, Ursache offen

Befund #6 des Prüfers: In `b-sessel` liegen mitten im Schlagschatten
**19 Bildpunkte, die von L 158 auf 226,7 springen** — 69 Stufen, ein weißer
Splitter auf grauem Grund. Dasselbe in `e-schraeg` mit 7 Punkten. Auf dem
Standbild sind das Fusseln; bei Kopfbewegung wären es flackernde Funken auf
einer sonst absolut ruhigen Fläche.

Der Befund ist bestätigt und die **Art** des Fehlers ist geklärt. Die Ursache
nicht.

### Was gesichert ist

**Es ist ein echter Spalt in der Geometrie, kein Rundungsfehler der
Schattenkarte.** Der Test dafür ist eindeutig: Bei doppelter Auflösung der
Schattenkarte (1024 → 2048) wurde der Splitter **schärfer und heller** — von 19
auf 27 Bildpunkte, hellster Wert 222 auf 230. Ein Präzisionsartefakt wäre
kleiner geworden.

**Die Schattenebene ist an dieser Stelle vorhanden.** Die Beitragsmaske des
Knotens (`tools/knotenwerte.mjs --maske`) zeigt dort keinen Beitrag — was
zunächst nach einem Loch in der Fläche aussah. Es heißt aber das Gegenteil: Die
Ebene ist da, sie empfängt nur keinen Schatten. Die Schattenkarte meldet an
dieser Stelle „beleuchtet".

**Aus dem Blick des Lichts ist er zu sehen.** `tools/lichtblick.mjs` (neu) setzt
die Prüfkamera auf die Schattenkamera. Dort liegt ein heller Schlitz genau da,
wo Rückenlehne, Flügel und Sitz zusammenstoßen — der Boden scheint durch den
Sessel hindurch.

### Vier Anläufe, und warum jeder danebenlag

| # | Vermutung | Ergebnis |
| --- | --- | --- |
| 1 | Die Schattenebene (Radius 8) endet vor dem Schattenrand — die Schattenkamera reicht bis 7,5 m vom Ursprung | Radius 12: **42 → 43** Splitter. Widerlegt. |
| 2 | Texelpräzision | Doppelte Auflösung macht ihn **schärfer**. Widerlegt — und damit als echter Spalt bewiesen. |
| 3 | Keil zwischen Flügel und Lehne: die Lehne steht mit `rotation.x = 0.07` zurück, der Flügel stand senkrecht | Flügel gekippt, Überlappung 4 → 7 cm: **23 → 20**. Widerlegt. |
| 4 | Schlitz zwischen Kissenrückkante (z = −0,19) und Lehnenvorderseite (z = −0,23) | Kissentiefe +5,5 cm, Hinterkante 1,5 cm in die Lehne: **23 → 20**. Widerlegt. |

Vier Durchläufe sind die im Auftrag zugestandene Höchstzahl. Ich breche hier ab,
statt weiter zu raten.

### Was trotzdem bleibt

Anlauf 3 und 4 waren **für sich richtig**, auch wenn sie den Splitter nicht
erklärt haben:

* Der Flügel hat jetzt dieselbe Neigung wie die Lehne. Der Prüfer hat den Keil
  unabhängig davon als „tiefe harte Spalte zwischen Wange und Lehne" gemeldet
  (sein Befund #11) — der ist damit geschlossen.
* Das Kissen reicht jetzt an die Lehne. Ein Sitzkissen, das vier Zentimeter vor
  der Rückenlehne endet, ist unabhängig vom Licht falsch gebaut.

Beides bleibt drin. Der Splitter bleibt offen, und die Spur ist aufgeschrieben:
**der Blick des Lichts, Bereich um die Naht Lehne / Flügel / Sitz.** Wer ihn
aufnimmt, fängt dort an und nicht bei null.

### Regression und Kosten

Zen, Nachthimmel und Insel bitgleich, Dojo Δmax 6 bei 0,009 %. 43 Draw-Calls
und 59 726 Dreiecke — unverändert. Build grün, Konsole sauber.

### Die Lehre dieser Runde

**„Kein Beitrag" heißt nicht „nicht vorhanden".** Ich habe die Beitragsmaske
zuerst als Loch in der Schattenebene gelesen und daraufhin ihren Radius
vergrößert — eine ganze Runde in die falsche Richtung. Die Maske misst die
Differenz aus Ein- und Ausblenden; eine Fläche, die da ist und nichts tut, sieht
darin genauso aus wie eine, die fehlt. Zwei sehr verschiedene Zustände mit
demselben Messwert, und das stand nirgends dran.

---

## Paket 6 — Das Leder hatte kein Glanzlicht, weil der Raum kein Licht abgab

**Befund des Prüfers (Rang 3 seiner Liste):** Auf den 281 009 roten Bildpunkten
der Sessel liegt p99 bei L 90, das Maximum bei 113,6. „Die Sessel lesen als
Filz." — Bestätigt: eigene Messung auf der Beitragsmaske in `b-sessel`
(287 966 Punkte) ergab p95 64, p99 81, **0,23 %** über L 110.

### Die Ursache stand nicht im Werkstoff

Der naheliegende Griff wäre die Rauheit gewesen. Sie allein bringt aber fast
nichts — gemessen mit dem neuen `tools/lederglanz.mjs`:

| Rauheit | p95 | p99 | > L 110 | Korn im hellsten Zwanzigstel |
| --- | --- | --- | --- | --- |
| 0,72 (Stand) | 64 | 81 | 0,23 % | 5,4 |
| 0,45 | 60 | 94 | 0,59 % | 12,3 |
| 0,22 | 57 | 95 | 0,72 % | 23,6 |

p95 **fällt** dabei sogar. Der Grund: Spiegelnd wirkten in dieser Umgebung nur
drei gerichtete Lampen mit zusammen 1,9 Einheiten. Bei 4 % Grundreflexion eines
Nichtmetalls ist deren Beitrag klein, ganz gleich wie schmal die Keule ist —
schmaler heißt nur, dass sich derselbe kleine Betrag auf weniger Punkte drängt.

**Was fehlte, war der Raum.** Das Konstrukt ist ein weißer Hohlraum von 60 m,
und ein Ledersessel darin spiegelt nach allen Seiten Weiß. Eine Umgebungskarte
gab es nicht. Die Hemisphärenleuchte auf 3,9 war der Ersatz dafür — sie hat die
Helligkeit nachgestellt, die eine Umgebungskarte mitbringt, aber sie trägt
**keinen spiegelnden Anteil**: three ruft für eine Hemisphärenleuchte nur den
diffusen Pfad. Ein Sessel unter reiner Hemisphärenleuchte kann kein Glanzlicht
haben. Nicht „hat keins", sondern kann keins haben.

### Was gebaut wurde

`konstruktUmgebungskarte(renderer)` — eine prozedurale Sonde nach demselben
Muster wie Dojo und Zen-Garten: Kugel von innen, oben das Weiß der Kuppel, unten
der kühlere Bodenton, `PMREMGenerator.fromScene()` darüber. Keine Sonnenscheibe,
weil es hier keine gibt; 32×20 Segmente reichen deshalb.

Die Karte hängt an den Werkstoffen der Umgebung, **nicht** an
`scene.environment`: Letzteres gälte auch für Karten und Whiteboard, die zu
keiner Umgebung gehören und in allen fünf gleich aussehen müssen. Gebaut wird
sie erst beim ersten Sichtbarwerden (`ensureEnvironment`), wie beim Zen-Teich.

Weil damit derselbe Lichtweg zweimal zählte, musste die Hemisphäre im selben
Zug herunter. Gemessen entlang der Linie „der Median bleibt, wo er ist":

| | p50 | p95 | p99 | > L 110 |
| --- | --- | --- | --- | --- |
| Hemi 3,90, keine Karte | 44 | 64 | 81 | 0,23 % |
| Hemi 3,90, Karte 0,35 | 62 | 89 | 99 | 0,33 % |
| Hemi 0,00, Karte 0,30 | 34 | 78 | 101 | 0,57 % |
| **Hemi 1,17, Karte 0,30, Rauheit 0,45** | **43** | **86** | **107** | **0,77 %** |

### Ergebnis im Stand

| Kamera | p50 | p95 | p99 | max | > L 110 | Korn |
| --- | --- | --- | --- | --- | --- | --- |
| `b-sessel` | 47 | 93 | 113 | 202 | 1,54 % | 10,8 |
| `a-augenhoehe` | 50 | 102 | 133 | 197 | 1,66 % | 9,1 |
| `e-schraeg` | 46 | 92 | 115 | 202 | 1,40 % | 11,2 |

Vorher an derselben Stelle (`b-sessel`): 44 / 64 / 81 / 189 / 0,23 % / 5,4.

Der Median bleibt — der Sessel wird nicht heller, er bekommt einen Kopf. Und das
Korn im hellsten Zwanzigstel verdoppelt sich: Die Ledernarbung, die bisher nur
auf den senkrechten Wangen zu sehen war, bricht jetzt das Glanzlicht. Genau das
unterscheidet Leder von Lack und von Filz.

### Warum nicht schmaler

Bei Rauheit 0,22 steigt das Korn auf 23,6. Das ist kein Leder mehr, sondern
Sprenkelrauschen — in einer Brille die Sorte Muster, die beim Kopfdrehen
kribbelt. 0,45 mit der aufmultiplizierenden Rauheitskarte (0,70 bis 0,92) ergibt
wirksam 0,32 bis 0,41; das ist die obere Kante dessen, was gealtertes Leder
trägt.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 6 bei 0,008 % (das bekannte
Rauschband seiner eigenen Bewegung). 43 Draw-Calls, 59 726 Dreiecke — beides
unverändert; die Karte kostet keinen Aufruf, sie hängt an vorhandenen
Werkstoffen. Texturspeicher 1,98 MB von 60. Build grün, Konsole frei von Errors
und Warnings.

### Neues Werkzeug

`tools/lederglanz.mjs` — Verteilung auf der Beitragsmaske der Sessel, mit zwei
Zahlen statt einer: Anteil oberhalb einer Helligkeit (**gibt** es ein
Glanzlicht) und mittlerer 3×3-Hochpass innerhalb der hellsten 5 % (**wie** sieht
es aus — Lack ist dort glatt, Leder gesprenkelt). Zwei Fallen kostete es
unterwegs:

* Die Maske aus Ein- und Ausblenden enthält auch den **Schlagschatten**: Blendet
  man die Sessel aus, wird der Boden dort hell, und mit L 157 bis 222 ist er das
  Hellste in der Maske. Gemessen worden wäre der Boden. Jetzt kommt eine
  Farbprobe dazu — Leder ist rot, der Boden ist neutral.
* Die drei Sessel-Meshes heißen nach dem Verschmelzen `construct-armchairs`,
  `-1` und `-2`. Ein Vergleich auf Gleichheit fand nur eines davon.

---

## Paket 7 — Das Lamellenband stand falsch herum im Raum, und es kribbelte

**Befund des Prüfers (Rang 4 seiner Liste):** „Aliasing der Lüftungsschlitze",
`f-boden`, Strichbreiten 2 bis 4 Bildpunkte — das eine Muster der Szene, das in
einer Brille garantiert kriecht.

### Erst messen, ob es überhaupt kriecht

Ein Standbild kann das nicht beantworten. Neues Werkzeug `tools/kamm.mjs`: Es
bewegt die Kamera in Millimeterschritten quer zur Blickrichtung — 1,5 mm je
Schritt, weniger als ein ruhig stehender Kopf ohnehin schwankt — und misst je
Bereich den mittleren Sprung pro Bildpunkt (**Zittern**) neben der
Standardabweichung im Bereich (**Streuung**, also der vorhandene Kontrast).

| Bereich | Streuung | Zittern | Quotient |
| --- | --- | --- | --- |
| Lamellenband | 22,5 | **1,72** | 0,077 |
| Gehäuse daneben, glatt | 23,9 | 0,52 | 0,022 |
| Schriftzug „AWA" (Textur) | 23,1 | 0,74 | 0,032 |
| Leder | 70,3 | 0,27 | 0,004 |

Bestätigt, und der Vergleich sagt gleich, woran es liegt: Der Schriftzug ist
ebenso fein und hat denselben Kontrast, zittert aber nur halb so stark. Er kommt
aus einer **Textur** und wird mit dem Abstand von selbst weicher. Geometrie hat
kein Mipmapping.

### Der zweite Befund kam beim Hinsehen

Die 23 dunklen Kästen standen **6 mm vor** der Gehäusewand. Das ist eine
Öffnung, die aus dem Möbel heraussteht — ein Schlitz, der sich wölbt. Wer das
Band anschaut, liest dunkle Streifen als Löcher; gebaut waren sie als
Vorsprünge. Das ist unabhängig vom Flimmern falsch.

Jetzt: eine dunkle Nische und davor Stege in der Gehäusefarbe. Das Dunkle gehört
der Öffnung, nicht dem Vorsprung.

### Drei Anläufe, und was jeder gelehrt hat

| # | Änderung | Ergebnis |
| --- | --- | --- |
| 1 | Nische 7 mm **zurück**gesetzt, Stege bündig | Band verschwindet: Profil 72–85 statt 33–85 |
| 2 | Nische 1 mm **vor** die Wand, Stege 5 mm darüber | Zittern 1,27 → 1,05, Streuung 21,9 → 19,2 |
| 3 | Teilung 22,7 → 34 mm, 15 statt 23 Öffnungen, Fase 2,4 mm | Zittern → **0,86**, Streuung 19,5 |

Anlauf 1 war ein Denkfehler mit Ansage: Die Vorderseite des Gehäuses sitzt bei
z = D/2, und eine Nische dahinter liegt **im** Kasten. Zwischen den Stegen sah
man dann nicht die Nische, sondern die Gehäusewand selbst. Ein Rücksprung in
eine geschlossene Wand ist kein Rücksprung, sondern ein verstecktes Bauteil —
ein Loch im Körper wäre eine CSG-Operation, die es in diesem Projekt nicht gibt.
Also liegt die dunkle Fläche eben davor; einen Millimeter, den niemand sieht,
weil die Stege 4 mm darüber stehen.

Anlauf 3 ist der eigentliche Hebel und der einzige, der am Kern ansetzt: **Die
Merkmalsgröße in Bildpunkten.** Eine Fase mildert die Stufe, eine dunklere Farbe
mildert den Ausschlag — aber wenn ein Streifen 4 Bildpunkte breit ist, bleibt er
unteraufgelöst. Bei 34 mm Teilung sind es 6 bis 7, und das ist der Unterschied.
Eine gröbere Blende ist zudem periodgerecht; Konsolen der Fünfziger haben
Stäbe von zwei bis drei Zentimetern, nicht von einem.

### Ergebnis

| | Streuung | Zittern | Quotient | max dL |
| --- | --- | --- | --- | --- |
| vorher | 21,9 | 1,27 | 0,058 | 36 |
| nachher | 19,5 | **0,86** | 0,044 | 36 |

Ein Drittel weniger Zittern bei erhaltenem Kontrast. Damit liegt das Band
zwischen dem Schriftzug aus der Textur (0,032) und dem, was es war — nicht bei
der glatten Wand (0,024), aber ein Lamellenband ist auch keine glatte Wand.
Die letzte Fase hat außerdem den größten Einzelsprung von 60 auf 36 zurückgeholt.

**Offen und ehrlich:** Der Quotient sinkt nur von 0,058 auf 0,044. Was
tatsächlich verschwindet, ist ein Drittel der absoluten Unruhe; was bleibt, ist
ein Muster mit 15 harten Kanten. Ganz weg wäre es nur als Textur — und das wäre
weniger Modellierung, nicht mehr.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 6 bei 0,009 %. Build grün,
Konsole frei von Errors und Warnings.

Draw-Calls 43 → **45** (die Nische ist ein eigener Körper), Dreiecke 59 726 →
**73 406**. Der Sprung von 13 680 Dreiecken geht auf die Stege: 16 Stück aus
`roundedBox`, und das ist eine `ExtrudeGeometry` mit Fase — rund 855 Dreiecke je
Steg für ein Bauteil von anderthalb Zentimetern. Beides bleibt weit im Budget
(45 von 120, 73 406 von 350 000), aber es ist ein Viertel mehr Geometrie für
eine Blende, und das gehört hier notiert statt weggelächelt. Wer die Zahl
braucht, findet sie in `roundedBox` — `bevelSegments: 3` und `curveSegments: 6`
sind für ein 13-mm-Teil großzügig.

---

## Paket 8 — Die Bildröhre gab kein Licht ab

**Befund des Prüfers (Rang 5):** „Die Röhre gibt kein Licht ab — kein Bloom,
keine Glasspiegelung, kein Bildpunkt über L 135."

### Der Befund stimmt, seine Zahlen nicht

Er nennt „Schirmmitte L 89 gegen Blende L 142". Auf der Beitragsmaske des
Schirms gemessen (`c-roehre`, 142 689 Bildpunkte) steht es anders da:

| Knoten | Mittel | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Schirm | 71,8 | 68 | 116 | 172 |
| Blende (`bezelMat`, 0x1a1916) | 38,1 | 38 | 48 | 102 |

Die Blende ist mit L 38 das **Dunkelste** am Gerät; was er bei 142 gemessen
hat, ist das olivfarbene Gehäuse. Der Befund bleibt trotzdem richtig, nur
anders begründet: Das Gehäuse liegt bei p50 60 bis 66 und p95 104 bis 141 — der
Schirm hebt sich davon **nicht** ab. Eine eingeschaltete Bildröhre, die so hell
ist wie der Schrank, in dem sie steckt, ist eine graue Platte.

### Zwei Ursachen, zwei Mittel

**Erstens: zu dunkel gezeichnet.** Das Material ist `MeshBasicMaterial` mit
`toneMapped: false` — was im Canvas steht, kommt unverändert heraus, 255 ist die
Obergrenze, und die Helligkeit muss deshalb im Canvas entstehen. Grundverlauf
und Schwaden angehoben, Vignette von 0,34 auf 0,26.

**Zweitens: keine Spiegelung — und die war bis zu diesem Stand nicht baubar.**
Eine Spiegelung braucht etwas zum Spiegeln; die Umgebungskarte gibt es erst seit
dem Lederpaket. Jetzt liegt 2 mm vor dem Schirm eine zweite, gleich gewölbte
Fläche: schwarze Grundfarbe, additiv, Rauheit 0,12 — damit trägt sie keinen
diffusen Anteil, sondern ausschließlich ihre Spiegelung. Das ist das Verhalten
einer klaren Scheibe vor einer selbstleuchtenden Fläche, und es ist
blickabhängig: Beim Kopfdrehen wandert der Schleier über das Bild, und der
Reflex des Führungslichts wandert mit.

| Schritt | Mittel | p50 | p95 | max | > L 150 |
| --- | --- | --- | --- | --- | --- |
| Stand | 71,8 | 68 | 116 | 172 | 0,2 % |
| Bild heller gezeichnet | 106,4 | 103 | 158 | 225 | 7,7 % |
| + Glasscheibe | **123,9** | **120** | **178** | **255** | **16,9 %** |

### Was unterwegs schiefging

Die Scheibe stand zuerst auf Rauheit 0,05 und Kartenstärke 1,0. Das ergab
zweierlei Ärger: Der Schirm wurde als Ganzes um 37 Stufen angehoben (p50 103 →
140) — in einem gleichmäßig weißen Raum ist die Spiegelung eben auch
gleichmäßig, sie wäscht das Bild —, und der Reflex des Führungslichts wurde ein
**harter weißer Punkt** von wenigen Bildpunkten, also genau das Muster, das beim
Kopfdrehen springt. Auf einer gewölbten Röhre ist ein Lichtreflex ein Fleck, kein
Stern. Jetzt: Kartenstärke 0,45 (getönte Sicherheitsscheibe, nicht Spiegel) und
Rauheit 0,12.

Damit `ensureEnvironment` der Scheibe mehr geben kann als den Möbeln, liest es
jetzt `material.userData.envStaerke`; ohne Angabe bleibt es bei 0,35.

### Kein Flimmern dazugekommen

`tools/kamm.mjs` über die Schirmfläche: Streuung 67,3, Zittern **0,47**,
Quotient 0,007 — der ruhigste Bereich der ganzen Szene. Die Rasterzeilen kommen
aus einer Textur und werden mit dem Abstand von selbst weicher.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 5 bei 0,010 %. Draw-Calls
45 → **47** (die Scheibe ist ein eigener Körper und liegt im
Transparenz-Durchgang), Dreiecke 73 406 → 74 078, Texturspeicher 1,98 MB.
Build grün, Konsole frei von Errors und Warnings.

---

## Paket 9 — Die Armrosette war eine Scheibe, kein Schnitzwerk

**Befund des Prüfers (Rang 8):** „Armrosetten als schwarze Löcher", L 25,1,
89,6 % unter L 40.

Bestätigt, und der Blick in den Quelltext sagt sofort, warum: Gebaut war ein
Zylinder von 10 cm Durchmesser mit einer Kugel davor. Der Kommentar daneben
behauptete „geschnitzte Rosette"; gebaut war ein Knopf. Null Relief außer der
Kugel, und das in einem Holz von 0x2b1a11 — dem dunkelsten Werkstoff der ganzen
Szene.

### Zwei Änderungen, und die zweite hat einen Nebennutzen

**Relief.** Jetzt hat sie, was eine Rosette hat: einen erhabenen Außenring
(Torus, 8 mm Schnur), der das Licht an seiner Kuppe fängt, einen dahinter
zurückgesetzten Teller, einen Kranz aus acht flachgedrückten Blattbuckeln und
den Mittelbuckel. Das Relief trägt die Form aus **jeder** Richtung, weil jede
Kuppe ihre eigene Lichtseite und ihre eigene Schattenseite hat — anders als eine
Textur, die nur bei streifendem Licht etwas zeigt (dieselbe Lehre wie am
Sitzkissen, Paket 3).

**Eigener Werkstoff.** Poliertes Nussbaum, 0x4a2d18, Rauheit 0,34,
Kartenstärke 0,5. Das Beinholz darf dunkel bleiben — Beine stehen im Schatten
des Möbels und sind matt. Eine polierte Zierscheibe an der Stirnseite ist das
Gegenteil davon.

Der Nebennutzen ist messtechnisch: `verschmelzeObjekte` gruppiert nach
Werkstoff, und alles, was sich `wood` teilt, verschwindet in einem gemeinsamen
Netz ohne eigenen Namen. Mit eigenem Werkstoff bleibt die Rosette ein eigenes
Netz und damit ein Knoten, den `knotenwerte.mjs` messen kann. Ein Draw-Call bei
47 von 120 ist der billigste Messzugang, den diese Szene zu bieten hat.

### Ergebnis

Gemessen im Rechteck der geänderten Bildpunkte in `f-boden` — das ist der
verlässlichste Weg, ein verschmolzenes Einzelteil zu finden: Was sich zwischen
zwei Ständen ändert, **ist** das Bauteil.

| Rosette | Mittel | p05 | p50 | unter L 40 |
| --- | --- | --- | --- | --- |
| links, vorher | 52,0 | 27 | 48 | 32,3 % |
| links, nachher | 62,7 | 46 | 59 | **0,0 %** |
| rechts, vorher | 41,8 | 30 | 31 | 60,9 % |
| rechts, nachher | 62,9 | 50 | 62 | **0,0 %** |

Der Befund „schwarzes Loch" ist damit weg, und zwar an beiden Sesseln.

### Was unterwegs schiefging

Der erste Anlauf stand auf 0x5a3a22 bei Rauheit 0,28 und Kartenstärke 0,7.
Heraus kam ein **Messingmedaillon** — eine Zierscheibe, die heller glänzt als
das Leder, liest als Metall, nicht als Holz. Poliertes Nussbaum fängt den Raum,
es spiegelt ihn nicht.

Und zweimal habe ich die Rosette im Bild an der falschen Stelle gesucht: erst
auf der Schautafel der Konsole (dort steht der dunkelste Kern des Bildes, ein
Bedienknopf), dann 60 Bildpunkte daneben. Beides kostete je einen Messlauf. Der
Differenzweg — zwei Stände abziehen, die geänderten Punkte sind das Bauteil —
hätte beim ersten Mal funktioniert. Dafür gibt es jetzt `tools/kasten.mjs`.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 5 bei 0,008 %. Draw-Calls
47 → **49**, Dreiecke 74 078 → **82 270** (vier Rosetten mit Ring, acht Blättern
und Buckel, rund 2000 Dreiecke je Stück). Texturspeicher 1,98 MB. Build grün,
Konsole frei von Errors und Warnings.

Neues Werkzeug `tools/kasten.mjs`.

---

## Paket 10 — Die Knopfheftung saß auf einer Fläche, die es nicht gibt

Der Anlass war ein anderer: der Befund „Kissenoberseite ohne Form" (p05 54 /
p95 62 — acht Stufen). Gefunden wurde unterwegs ein handfester Baufehler an der
Lehne, und der Befund selbst blieb offen. Der Reihe nach.

### Der Baufehler

Die 21 Knöpfe der Kapitonierung standen alle auf derselben Tiefe
`frontZ0 - 0.003`. Die Lehne ist aber um 0,07 rad zurückgeneigt, **um ihre
eigene Mitte**: Oben weicht ihre Vorderseite 2,0 cm nach hinten, unten kommt sie
2,0 cm nach vorn. Gerechnet heißt das:

* oberste Reihe: **2,3 cm im Polster**
* unterste Reihe: **1,8 cm davor**

Im Bild sah man oben kaum noch etwas und unten aufgesetzte Perlen. Der
Kommentar an den Mulden hat das Symptom sogar beschrieben — „mit 9 mm Einlass
verschwanden die oberen zwei Reihen vollständig im Körper, während die unteren
richtig saßen" — und die Ursache in der Fase der `roundedBox` vermutet. Sie lag
in der Neigung. Der damalige Ausgleich (Einlass von 9 auf 5 mm) hat den Fehler
gemildert und dabei die Mulden flacher gemacht, als sie sein sollten.

Jetzt liefert eine Funktion `lehnePunkt(x, y, einlass)` zu jeder Stelle auf der
Lehne den Punkt auf deren **tatsächlicher** Vorderfläche — Neigung und Wölbung
eingerechnet — und Knöpfe wie Mulden sitzen darauf. Alle sechs Reihen tragen,
der Einlass darf wieder 2 mm sein.

### Zwei Versuche am eigentlichen Befund, beide gemessen, beide klein

**Erstens: wölben.** Neuer Körper `polsterKissen` — ein unterteilter Kasten,
dessen Kanten durch Klemmen und Wegdrücken gerundet werden (die Normale fällt
dabei als Wegdrückrichtung ab) und dessen Oberseite eine zum Rand hin
auslaufende Kuppe bekommt. `roundedBox` kann das nicht: Sie extrudiert mit
`steps: 1`, hat also in Extrusionsrichtung zwei Ringe, und eine Wölbung darauf
ergäbe einen Keil.

| Kissenoberseite in `e-schraeg` | p05 | p50 | p95 |
| --- | --- | --- | --- |
| ohne Kuppe | 47 | 73 | 90 |
| Kuppe 2,2 cm | 47 | 72 | 93 |
| Kuppe 5,0 cm | 47 | 72 | 93 |

**Fünf Zentimeter Wölbung auf 55 cm Kissentiefe — drei Stufen.** Der Grund liegt
im Licht: Was von oben kommt, ist die Hemisphärenleuchte und die obere Hälfte
der Umgebungskarte; beide hängen kaum von der Neigung ab. Das Führungslicht
steht steil, sechs Grad Kippung ändern seinen Kosinus um wenige Prozent. **In
einer weißen Leere gibt es keine Richtung, aus der eine waagerechte Fläche nicht
beleuchtet wird — und damit auch keine, in die man sie neigen könnte.**

**Zweitens: verdecken.** Ein Kissen zwischen zwei Wangen und einer Lehne sieht
an seinen Rändern weniger Himmel. Als Scheitelfarben aus den lokalen
Kissenkoordinaten, Sohle 0,5, Reichweite 18 cm zur Lehne und 14 cm zu den
Wangen.

Auch das trägt wenig, und auch das ist gemessen: Mit einer Sohle von **0,15**
statt 0,5 — Verdunklung auf ein Sechstel — ändern sich in der Nahsicht **1,0 %**
der Bildpunkte um mindestens zwei Stufen, größter Einzelsprung 42. Der Grund ist
ernüchternd: Die Ränder, die verdeckt sind, sind auch die Ränder, die von Wange
und Lehne **verdeckt** werden. Was man vom Kissen sieht, ist sein heller Kern.

### Was daraus folgt

Die Verdeckung bleibt drin, weil sie richtig ist, und die Kuppe bleibt, weil sie
der Silhouette und den Kanten guttut. **Der Befund ist damit nicht geschlossen**,
und ich schreibe das lieber hin, als eine Zahl zu suchen, die gut aussieht: Was
der Oberseite in dieser Beleuchtung Form geben könnte, ist weder Neigung noch
Verdeckung, sondern eine **Naht** quer über das Polster oder ein **flacheres
Führungslicht**. Beides ist ein eigener Eingriff mit eigenen Folgen — ein
flacheres Licht ändert jede andere Fläche der Szene mit.

### Ein Fehlschlag, der eine Lehre wert ist

Die Verdeckung stand zuerst in einem Shader und nahm ihre Koordinate aus
`transformed`. Das ging schief: **`verschmelzeObjekte` backt die Matrix in die
Geometrie**, und die beiden Sessel stehen gegeneinander gedreht. Im Shader kam
die Lounge-Koordinate an, nicht die Kissenkoordinate — die Verdunklung lief bei
einem Sessel quer und beim anderen verkehrt herum und traf ausgerechnet die
Vorderkante, die hell bleiben sollte (71,9 auf 55,3). Scheitelfarben kennen das
Problem nicht: Sie werden vor dem Verschmelzen aus den lokalen Koordinaten
berechnet und wandern danach unverändert mit.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 5 bei 0,008 %. Draw-Calls
49 → **51** (das Kissen bekommt eigene Scheitelfarben und damit einen eigenen
Werkstoff), Dreiecke 82 270 → **89 150** (der unterteilte Kasten des Kissens
statt der Extrusion). Texturspeicher 1,98 MB. Build grün, Konsole sauber.

Neue Werkzeuge: `tools/blick.mjs` (freie Kamera zum Hinsehen, ohne den
eingefrorenen Kamerasatz anzutasten), `tools/maskenwerte.mjs` (dieselbe
Knotenmaske auf einem anderen Stand messen — der Weg zu einem Vorher, wenn das
Bauteil damals noch mit anderen verschmolzen war), `tools/kamcheck.mjs`
(Sollkamera gegen Istkamera).

---

## Paket 11 — Der Flügel drehte um die falsche Achse

Im freien Blick von hinten-seitlich (`tools/blick.mjs`, Position 1,75 | 1,5 |
−4,0) stand der Flügel als angelehnte Platte neben der Lehne, mit einer Kerbe
dazwischen, durch die man ins Freie sah.

### Die Ursache ist eine Zeile

```js
wing.rotation.y = -side * 0.2;
```

auf einem Körper, dessen Ursprung in seiner **Mitte** liegt. Damit schwenkt die
Vorderkante nach innen — und die Hinterkante nach außen. Gerechnet: Die äußere
hintere Ecke sitzt 0,065 m vom Flügelmittelpunkt entfernt; nach der Drehung um
0,2 rad liegt sie bei

```
x = 0,065·cos(0,2) + 0,15·sin(0,2) = 0,0637 + 0,0298 = 0,0935 m
```

also bei x = 0,4685 — und die Lehne endet bei 0,44. Die Ecke stand **2,85 cm
über die Lehne hinaus**, und dazwischen blieb eine Kerbe offen.

### Die Drehung gehört an die Hinterkante

Ein Ohrensessel-Flügel wächst aus der Lehne heraus und flart nach vorn. Das ist
eine Drehung um die **Hinterkante**: Die bleibt bündig mit der Lehnenflanke, nur
die Vorderkante wandert. Der Ursprung der Geometrie wandert dafür mit
`translate(0, 0, WING_D / 2)` an die Hinterkante, und die Position beschreibt
jetzt genau diese Kante.

Dazu steckt der Flügel 10 statt 7 cm in der Lehne. Sichtbar ist davon nichts,
aber es gibt keine Blickrichtung mehr, aus der zwischen beiden Licht durchfällt.

Dreiecke und Draw-Calls bleiben unverändert — es ist derselbe Körper, nur mit
verschobenem Ursprung. Im festen Kamerasatz ändert sich `e-schraeg` um 0,81 %
der Bildpunkte (≥ 8 Stufen); Zen, Nachthimmel und Insel bitgleich, Dojo Δmax 7
bei 0,009 %.

51 Draw-Calls, 89 150 Dreiecke, 1,98 MB Textur — alle drei unveraendert. Build
gruen, Konsole frei von Errors und Warnings.

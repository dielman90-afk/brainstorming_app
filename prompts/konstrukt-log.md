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

---

## Paket 12 — Die Ledernarbung las als Reptilhaut

Der Prüfer hatte eine Kachelwiederholung bei „etwa 73 Bildpunkten" vermutet und
sie als unbestätigt notiert. Gemessen (`tools/kachel.mjs`, Autokorrelation über
hochpassgefilterte Zeilen) sind es **69** auf der Lehne und **33** auf dem
Flügel. Der Befund ist damit bestätigt — und beim freien Blick aus einem Meter
Abstand (`tools/blick.mjs`) ist er offensichtlich: große eckige Schuppen, ein
Krokodilmuster.

### Die Rechnung

60 Zellen auf 128 Punkten ergeben eine Zelle von rund 16,5 Punkten, also 12,9 %
der Kachel. Bei 14-facher Kachelung misst die Kachel 71 mm — **eine Zelle ist
damit 8,9 mm groß**. Rindsleder hat Poren unter einem Millimeter und eine Narbe
von zwei bis vier. Das ist Faktor drei bis neun daneben.

Jetzt: 110 Zellen, 24-fach gekachelt. Eine Zelle misst 4,0 mm, die Kachel 42 mm
mit gut zehn Zellen Kantenlänge. `normalScale` geht von 0,5 auf 0,6 — feineres
Korn braucht etwas mehr Ausschlag, um dieselbe Tiefe zu behaupten.

### Warum nicht noch feiner

Der erste Anlauf stand auf 34-facher Kachelung (2,8 mm Zelle) und war
**zu** fein: Aus einem Meter Abstand liegt ein Texel dann bei 0,27 Bildpunkten,
und das Mipmapping zeichnet die Narbe fast vollständig weg. Der Sessel sah
lackiert aus — der entgegengesetzte Fehler zum Ausgangszustand, und optisch der
schlimmere. 24 ist der Wert, bei dem die Narbe aus Sitzabstand noch trägt.

### Der naheliegende Einwand ist gemessen und trifft nicht zu

Feineres Korn könnte in der Brille kribbeln. `tools/narbe.mjs` fährt `repeat`
zur Laufzeit ab und misst beide Seiten in einem Lauf:

| repeat | Periode | Stärke | Streuung | Zittern |
| --- | --- | --- | --- | --- |
| 14 | 10 | 0,036 | 25,3 | **0,37** |
| 20 | 10 | 0,038 | 25,2 | 0,34 |
| 26 | 13 | 0,041 | 25,2 | 0,31 |
| 34 | 13 | 0,043 | 25,2 | **0,27** |

Das Zittern **sinkt**, und zwar genau deshalb, weil die Karte gekachelt und
mipgemappt ist: Was auf Entfernung unter die Bildpunktgröße fällt, wird
weichgezeichnet statt zu Rauschen. Feiner ist hier auf Distanz ruhiger und aus
der Nähe richtiger — die Grenze setzt nicht das Flimmern, sondern das
Verschwinden.

Im Stand gemessen: Kachelperiode auf dem Flügel **33 → 13** Bildpunkte, Zittern
0,37 → 0,34, Streuung unverändert 25,1.

Die 66 Bildpunkte, die im Kasten über der Lehne stehen bleiben, sind **nicht**
die Kachel: Dort sitzt die Knopfheftung, und ihre Knöpfe stehen 0,165 m
auseinander.

### Regression und Kosten

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 6 bei 0,009 %. 51
Draw-Calls, 89 150 Dreiecke, 1,98 MB Textur — alle unverändert; es ist dieselbe
128er-Kachel, nur anders gefüllt und dichter gelegt. Die Erzeugung kostet mehr:
Die Suche nach den zwei nächsten Zellzentren läuft je Bildpunkt über alle
Zellen, also 128² × 110 statt 128² × 60 — rund 1,8 statt 1,0 Millionen
Abstände, einmalig beim ersten Aufruf. Build grün, Konsole frei von Errors und
Warnings.

Neues Werkzeug `tools/narbe.mjs`.

---

## Paket 13 — Die Schautafel war vollständig gemalt, die Beine waren Draht

Zwei Befunde des Prüfers an einem Möbel: „Schautafel ohne Relief" und
„Konsolenbeine 2–3 px breit". Beide bestätigen sich beim freien Blick aus einem
Meter (`tools/blick.mjs`, Position 0,75 | 1,0 | −2,15) sofort.

### Die Tafel

Emblem, Dreieck, Auge, Schriftzug — alles lag als Canvas-Textur auf einer
`PlaneGeometry`. Aus Sitzabstand liest das als aufgeklebter Druck: Es gibt keine
Kante, die Licht fängt, und keine, die Schatten wirft.

Nicht alles davon braucht Geometrie. Schrift und Typenschildzeilen sind auf einem
echten Gerät auch nur aufgedruckt — die bleiben gemalt. Was **erhaben** ist, ist
das Beschlagwerk, und genau die drei Teile bekommen Körper:

* **Firmenschild** — ein aufgesetzter Rahmen (`kederRing`) um die gemalten
  Buchstaben. Ein Typenschild ist eine aufgeschraubte Platte, und was man davon
  zuerst sieht, ist ihr Rand.
* **Dreiecksrahmen** — drei Stäbe. Ein Schlauch entlang einer geschlossenen
  Kurve hätte die Ecken rund gezogen; ein Art-déco-Emblem hat spitze.
* **Linse** — eine flache Kuppe aus dunklem Glas mit Pupille, in einer
  Torus-Fassung. Sie ist der Blickfang der Tafel und war ein gemalter Kreis.

Die Umrechnung Canvas → Tafel steht als Funktion im Quelltext statt als geratene
Zahlen: Die Tafel misst (W − 0,07) × (H − 0,08) bei 512 × 560 Bildpunkten.

### Ein Nebeneffekt, der dreimal nachgestellt werden musste

Ein erhabener Rahmen **verdeckt** aus schräger Sicht, was hinter ihm liegt — das
ist physikalisch richtig und war trotzdem ein Problem: Bei der ursprünglichen
Textlage (±104) fehlte von schräg vorn das „D" von DEEP, und „LEEP IMAGE" liest
als Fehler, nicht als Perspektive.

| Textlage | von schräg vorn | von vorn |
| --- | --- | --- |
| ±104 | „LEEP IMAGE" | richtig |
| ±80 | richtig | „DEEPIMAGE" — die Wörter stoßen zusammen |
| **±88** | richtig | richtig, letztes E leicht angeschnitten |

Dazu ist der Stab von 7 auf 5 mm Höhe und von 11 auf 9 mm Breite zurück. Das
angeschnittene E bleibt — ein Rahmen, der vor dem Druck steht, tut genau das.

### Die Beine

14 mm oben und 9 mm unten sind im Bild zwei bis drei Bildpunkte breit — dünner
als jede andere Linie der Szene. Ein Fernsehmöbel der Fünfziger steht auf
konischen Holzbeinen von rund 25 mm am Zargenanschluss; die Zahl ist kein
Geschmack, sie trägt das Gerät. Jetzt 24/13 mm.

Dazu, was solche Beine immer haben und was hier fehlte: eine **Zwinge** am oberen
Ende, wo das Bein in die Zarge geht, und eine **Messingspitze** unten. Beide sind
winzig, und beide tun genau das, was einem 2-Pixel-Stab fehlt — sie geben ihm ein
Ende statt eines Abbruchs.

### Ein Budgetfehler, den die Messung sofort gezeigt hat

Zwingen und Spitzen als eigene Meshes ließen den Ständer auf **dreizehn**
Körper anwachsen — Zargenplatte, vier Beine, vier Zwingen, vier Spitzen — und
das Budget sprang von 51 auf **62 Draw-Calls**, allein für Zierteile von wenigen
Millimetern. Sie sind statisch und teilen sich zwei Werkstoffe; damit ist es
genau der Fall für `verschmelzeObjekte`. Zwei Meshes statt dreizehn.

### Regression und Kosten

Draw-Calls 51 → **48** (der verschmolzene Ständer spart mehr, als das Relief
kostet), Dreiecke 89 150 → **93 010**, Texturspeicher 1,98 MB. Zen, Nachthimmel
und Insel **bitgleich**, Dojo Δmax 4 bei 0,011 %. Das Verschmelzen selbst ändert
`a-augenhoehe` und `f-boden` um 0,002 % der Bildpunkte an den Beinkanten — das
übliche Fließkommarauschen, wenn Ortsangaben in die Geometrie gebacken werden.
Build grün, Konsole frei von Errors und Warnings.

---

## Paket 14 — Der Schlagschatten war exakt neutral und innen vollkommen flach

Zwei Befunde des Prüfers, beide auf 33 355 reinen Schattenpunkten in
`e-schraeg` bestätigt:

| | R | G | B | B−R | p05 | p50 | p95 | Spanne |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Boden hell | 225,9 | 227,7 | 228,6 | 2,68 | | | | |
| Schatten vorher | 156,2 | 157,6 | 158,5 | **2,24** | 152,6 | 156,6 | 161,6 | **8,9** |

Kanalweise ist das 0,692 / 0,693 / 0,694 — **derselbe Farbton**, nur dunkler,
und über Meter hinweg derselbe Wert.

### Warum ein `ShadowMaterial` das gar nicht anders kann

Es multipliziert mit einer Farbe, und die stand auf Schwarz. Dazu kommt: Der
Boden ist ein `MeshBasicMaterial` **ohne Tonemapping** und empfängt gar kein
Licht — die Schattenfarbe kann hier prinzipiell nicht aus der Beleuchtung
entstehen. Sie muss gesetzt werden, und die Frage ist, worauf.

### Was ihr zusteht

Das Führungslicht ist 0xfff6ec, also warm. Wo es fehlt, bleibt das Übrige —
Hemisphäre 1,2, Aufheller 0,55, Saumlicht 0xdce6f0 mit 0,35 und die
Umgebungskarte —, und das ist kühler. Aufsummiert trägt das Führungslicht rund
0,98 von 3,03 Einheiten, also **32 %**; der Schatten müsste linear bei
0,677 / 0,686 / 0,696 liegen, das Blau also 2,8 % höher als das Rot.

Gesetzt: Farbe 0x1c2127 bei Deckkraft 0,36 und `toneMapped: false` — Letzteres,
damit Boden und Schatten in derselben Zahlenwelt rechnen.

### Und das Gefälle

Der Grund dafür ist derselbe wie für die Farbe: Ein Gegenstand verdeckt nicht
nur das Führungslicht, sondern auch einen Teil des Himmels — dicht an seinem Fuß
viel, weit weg wenig. Genau deshalb ist ein Schatten am Werfer dunkel und läuft
nach außen aus. Das Gefälle läuft entlang der Bodenprojektion der Lichtrichtung
(3,5 | −5,0), gerechnet aus der Sitzgruppenmitte, und nimmt die Deckkraft über
zwei Meter auf 55 % zurück.

| Schatten nachher | R | G | B | B−R | p05 | p50 | p95 | Spanne |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | 166,5 | 169,4 | 172,1 | **5,63** | 151,6 | 158,6 | 190,6 | **39,0** |

Am Fuß bleibt er, wo er war (p50 156,6 → 158,6); nach außen hin läuft er von
161,6 auf 190,6 aus. Die Spanne im Schatteninnern vervierfacht sich.

### Der Fehler, der eine Regel wert ist

Der erste Anlauf hat im Shader auf `gl_FragColor = vec4( color, opacity * ( 1.0
- shadowMask ) );` ersetzt. Die Zeile heißt in three aber
`... ( 1.0 - getShadowMask() ) ...`. **`String.replace` meldet einen Fehlschlag
nicht** — es gibt den unveränderten Text zurück. Sichtbar war davon genau das,
was auch bei einem Treffer mit zu kleinem Gefälle sichtbar gewesen wäre:
nichts. Die Farbe kam trotzdem an, weil sie aus einer Uniform stammt, und der
erste Messlauf zeigte deshalb eine korrekte Farbverschiebung bei unveränderter
Spanne — ein Befund, der wie ein Sachergebnis aussah und ein Tippfehler war.

Ab jetzt läuft die Ersetzung durch `ersetzeGenau`, das wirft, wenn das Muster
fehlt. Das ist die zweite stumme Falle dieser Art im Projekt — die erste waren
die Backticks in GLSL-Kommentaren, gegen die `tools/shaderlint.mjs` als
`prebuild` läuft.

### Regression und Kosten

48 Draw-Calls, 93 010 Dreiecke, 1,98 MB Textur — alle unverändert; es ist
dasselbe Mesh mit anderem Werkstoff. Zen, Nachthimmel und Insel **bitgleich**,
Dojo Δmax 4 bei 0,009 %. Build grün, Konsole frei von Errors und Warnings.

---

## Paket 15 — Die Bedienknöpfe waren zwei Kegelstümpfe

**Befund des Prüfers:** „Konsolenknöpfe ohne Bauteilcharakter." Gebaut war
`CylinderGeometry(0.026, 0.03, 0.026, 16)` in fast schwarzem Material — im Bild
zwei dunkle Klumpen auf der Blende.

Ein Bedienknopf der Zeit hat vier Merkmale, und keines davon war da:

* einen **Sockelring** in Messing, wo der Knopf auf die Blende trifft (an einem
  Gerät ist das die Rosette, die das Loch verdeckt),
* einen **eingezogenen Schaft** über dem Sockel,
* eine **Fase zur Stirn**, die das Licht als Ring fängt,
* eine **Zeigermarke** auf der Schulter.

Das Profil läuft jetzt über `LatheGeometry` mit **14** Segmenten. Vierzehn und
nicht dreißig: Bakelitknöpfe sind gepresst und facettiert, und die Facetten sind
es, die den Knopf beim Kopfdrehen leben lassen — eine glatte Drehfläche hätte in
dieser gleichmäßigen Beleuchtung wieder keine Modellierung. Das ist dieselbe
Lehre wie an der Kissenoberseite, nur diesmal von vornherein eingerechnet: In
einem Raum ohne Lichtrichtung trägt eine Kante, keine Wölbung.

Werkstoff neu: Bakelit (0x1a1712, Rauheit 0,30) statt des matten
Gehäusedunkels — gepresstes Bakelit glänzt, und seit es eine Umgebungskarte gibt,
kann man das auch sehen.

`c-roehre` ändert sich um 0,56 % der Bildpunkte (≥ 8 Stufen).

### Nebenbei bestätigt

Der Befund „obere Knopfreihe ohne Mulde" ist mit Paket 10 erledigt: Seit die
Knöpfe auf der tatsächlichen, geneigten Lehnenfläche sitzen statt auf einer
festen Tiefe, trägt die Mulde auf allen sechs Reihen. Der freie Blick von vorn
zeigt sie vollständig.

### Regression und Kosten — und eine Zahl, die ich zuerst falsch aufgeschrieben habe

Im ersten Anlauf stand hier „Draw-Calls 48 → 48", begründet damit, dass vorher
zwei Knopf-Meshes standen und jetzt auch zwei. **Gemessen waren es 50.** Die
Zahl stand im selben Messlauf, aus dem ich die Dreiecke abgeschrieben habe; ich
habe sie nicht angesehen, weil ich die Antwort schon zu kennen glaubte.

Die zwei Aufrufe sind erklärt, und die Erklärung ist eine eigene Lehre:

**Die Hüllkugel eines verschmolzenen Körpers ist nicht die seines Bauteils.**
Die Auswahl der Schattenwerfer läuft über `geometry.boundingSphere.radius >=
0.06`. Ein einzelner Knopf misst 3 cm und blieb darunter — verschmolzen spannen
die beiden 26 cm auseinander, die Hüllkugel misst 16 cm, und **beide** neuen
Netze landeten im Schattendurchgang. `renderer.info.render.calls` zählt den mit.
Zwei Aufrufe für den Schatten zweier Knöpfe auf einer senkrechten Wand, den es
ohnehin nicht gibt.

Behoben über einen Vermerk `userData.keinWerfer`, den die Werferauswahl
respektiert. Damit:

Draw-Calls **48 → 48** (diesmal gemessen), Dreiecke 93 010 → **93 778**,
Texturspeicher 1,98 MB. Das Bild ist gegenüber der werfenden Fassung
**bitgleich** — der Schatten war unsichtbar, er hat nur gekostet. Zen,
Nachthimmel und Insel bitgleich, Dojo Δmax 6 bei 0,011 %. Build grün, Konsole
frei von Errors und Warnings.

---

## Paket 16 — Die Leere hatte einen Horizont

Der Prüfer, neu angesetzt auf den Stand nach Paket 15, nennt diesen Befund an
zweiter Stelle seiner Liste und begründet ihn damit, dass er die
Gestaltungsidee selbst verletzt. Er hat recht, und er hat es sauber belegt.
Meine Nachmessung in `a-augenhoehe`, senkrechte Abtastung an vier Stellen der
Bildbreite:

| y | 0 | 100 | 200 | **280–340** | 400 | 500 | 700 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R | 232 | 228 | 223 | **218** | 224 | 229 | 228 |

Auf eine Stufe gleich bei x = 60, 300, 1000 und 1220. Ein Minimum, das über die
volle Bildbreite auf gleicher Höhe liegt, **ist** ein Horizont.

### Die Ursache war eine Summe, nicht eine Naht

Zwei Verläufe, die beide zum Horizont hin dunkler wurden:

* **Die Kuppel schreibt ihre Farbe roh in den Puffer** — die Lehre steht seit
  Langem an der Nachthimmelkuppel, und hier hat sie mich trotzdem erwischt.
  `THREE.Color(0xeef1f4)` wandelt nach linear, das ergibt 0,863, und roh
  geschrieben sind das **220**, nicht 238. Der Kuppelverlauf lief also von 234
  oben auf 220 am Horizont.
* **Der Boden** lief von 218 in der Ferne auf 232 unter den Füßen.

Zusammen ein V mit der Spitze genau am Horizont. Und das Bittere daran: Die
**Naht war richtig kalibriert** — 220 gegen 218, eine Stufe. Paket 1 hat genau
diese Naht vermessen und geschlossen. Was niemand gemessen hat, war die Kurve
um sie herum. Ein Fehler, der aus einem gelösten Problem entsteht: Ich habe die
Stelle geprüft, an der ich einen Sprung erwartet habe, und nicht die Form der
Kurve, in der sie liegt.

### Die Kuppel ist jetzt einfarbig

Ohne Verlauf kann sie zum Horizont hin nicht dunkler werden. 0xfcfcfc und nicht
0xffffff, weil roh geschrieben reines Weiß 255 wäre — eine geklippte Fläche über
der halben Bildhöhe, gegen die jede Silhouette mit dem höchstmöglichen Kontrast
stünde (der Prüfer bemängelt die Silhouettentreppe getrennt, Befund 14).

Der Boden läuft jetzt von 0xf8f8f8 in der Ferne — demselben Wert, den die Kuppel
zeigt — auf 0xe6e8ec unter den Füßen. Damit fällt der Tonwert von oben nach
unten **monoton** durch:

| y | 0–340 | 400 | 480 | 560 | 680 |
| --- | --- | --- | --- | --- | --- |
| R | 248 | 241 | 235 | 231 | 227 |

Kein Minimum, kein Band, keine Naht. Der Übergang Kuppel → Boden liegt bei
248 → 246 über 40 Bildzeilen.

## Und im selben Zug: das Banding

Befund 9 des Prüfers, ebenfalls belegt: Der Verlauf bestand aus lauter absolut
gleichfarbigen Bändern mit Ein-Stufen-Sprüngen, gemessen bis 61 Bildpunkte breit,
und in einem leeren 80×80-Feld ein mittlerer Nachbarunterschied von **0,00**. In
einer weißen Leere, in der das Auge nichts anderes zu tun hat, sind das die
einzigen sichtbaren Strukturen: konzentrische Ringe um den Betrachter.

Dagegen hilft kein feinerer Verlauf, sondern **Rauschen**. Eine halbe Stufe
Streuung je Bildpunkt löst die Kante zwischen zwei Quantisierungsstufen in einen
Übergang auf. 1,5/255 im linearen Raum sind nach der sRGB-Wandlung rund 0,75/255
— unter der Sichtbarkeitsschwelle für eine Fläche, über der für eine Kante.

| Bodenverlauf, Lauflängen bei x = 60 | Anzahl Streifen | längster | Mittel |
| --- | --- | --- | --- |
| vorher | 20 | 61 px | 17,9 px |
| nachher | 93 | 38 px | **3,9 px** |

Die Kuppel braucht kein Rauschen mehr: Sie ist einfarbig, und eine Fläche ohne
Verlauf kann nicht banden.

### Regression und Kosten

48 Draw-Calls, 93 778 Dreiecke, 1,98 MB Textur — alle unverändert; es sind zwei
Farbwerte und sechs Zeilen Shader. Zen, Nachthimmel und Insel **bitgleich**,
Dojo Δmax 6 bei 0,010 %. Build grün, Konsole frei von Errors und Warnings.

### Die Lehre

**Eine Naht kann richtig sitzen und trotzdem falsch sein.** Paket 1 hat den
Sprung an der Nahtstelle Kuppel/Boden auf eine Stufe genau geschlossen und das
sauber belegt. Der Horizont war trotzdem da — weil er nicht aus dem Sprung kam,
sondern aus der Form der Kurve, in der die Naht liegt. Wer nur die Stelle
prüft, an der er einen Fehler erwartet, findet den, der eine Ebene darüber
liegt, nie.

---

## Paket 17 — Die Möbel lagen auf, sie standen nicht

**Befund 3 des Prüfers, belegt:** Am Sesselfuß beträgt die Verdunklung des
Bodens **5 bis 8 von 255 Stufen** — gegen 70 bis 75 im Schlagschatten daneben.
In einer diffus ausgeleuchteten weißen Leere ist der Kontaktschatten das
**einzige** Signal, das ein Objekt an den Boden bindet; ohne ihn kleben die drei
Möbel wie Aufkleber auf der Fläche.

### Die Ursache ist die Größe des Flecks

Es gab Kontaktflecken — einen je Möbel. Der unter dem Sessel hat Radius 0,60,
seine Füße stehen bei 0,48 vom Mittelpunkt, also bei **80 % des Radius**. Die
Schattentextur läuft von 0,5 in der Mitte über 0,24 bei 55 % auf 0 am Rand; bei
80 % ist davon fast nichts mehr übrig. **Ein Fleck, der unter dem ganzen Möbel
liegt, ist an keinem seiner Füße dunkel.**

### Ein Fleck je Fuß

Vier kleine dazu, 7,5 cm Radius auf einem Bein von 3 cm (am Ständer 6 cm auf
2,4 cm). Der Ausstellwinkel der Fernsehbeine wandert mit: 0,1 rad über die
Beinhöhe verschieben den Fuß um 2,7 cm nach außen — er steht nicht unter seinem
Anschlusspunkt.

Gemessen in `f-boden`, im Rechteck der geänderten Bildpunkte:

| Fuß | vorher (p50) | nachher (p50) | freier Boden |
| --- | --- | --- | --- |
| Fernsehmöbel vorn | 215 | **184** | 229 |
| Sessel vorn | 162 | **138** | 229 |

Größter Einzelabfall am Ständerfuß: **88,9 Stufen**. Aus 14 Stufen Abstand zum
freien Boden werden 45.

### Und es kostet nichts — es spart

`verschmelzeSchatten` legt den großen Fleck und die vier kleinen in **ein** Netz.
Der Nebeneffekt ist der eigentliche Gewinn: Weil dabei das gemeinsame
Schattenmaterial benutzt wird statt eines eigenen je Fleck, verschmelzen
anschließend auch die Kontaktschatten **beider Sessel** zu einem einzigen Netz.
Vorher waren das zwei Netze mit je zwei Dreiecken (`construct-armchairs-5` und
`-6` im Knotenbericht — zwei Draw-Calls für zwei Dreiecke).

Draw-Calls **48 → 47**, Dreiecke 93 778 → 93 828. Die große Fleckdeckkraft geht
im Gegenzug von 0,85 auf 0,70 (Sessel) und von 0,80 auf 0,62 (Ständer), damit
die Summe nicht zu schwer wird.

Zen, Nachthimmel und Insel **bitgleich**, Dojo Δmax 5 bei 0,009 %.
Texturspeicher 1,98 MB. Build grün, Konsole frei von Errors und Warnings.

---

## Paket 18 — Der Sessel war ein Brettstapel

Der schwerste Befund des Prüfers, und er hat ihn genau richtig benannt: „Ein
Ohrensessel ist gerade dadurch definiert, dass Flügel, Rücken und Arm eine
durchgehende Polsterhülle bilden. Hier sieht man an drei Stellen zwischen die
Teile."

### Acht Zentimeter Luft, quer über die ganze Sitzbreite

Die Armrolle hatte die Tiefe `frontDepth` = 0,42 um `frontZ` = 0,0575, reichte
also bis z = −0,153. Die Vorderseite der Lehne sitzt bei z = −0,23.

**Dazwischen standen acht Zentimeter Luft**, über die volle Breite, an beiden
Armen — und aus jeder Richtung, aus der man in den Sessel hineinsieht, sah man
sie. Dasselbe für die Wange darunter.

Beide sind jetzt 12 cm länger und wandern 6 cm nach hinten: Die Vorderkante
bleibt, wo sie war, die Hinterkante steckt 4 cm in der Lehne.

### Der Flügelschlitz war ein Rest des vorigen Pakets

Paket 11 hat die Flügeldrehung von der Mitte auf die Hinterkante verlegt, damit
die hintere äußere Ecke nicht mehr über die Lehne hinausragt. Was dabei blieb:
Auch um die Hinterkante gedreht läuft die **Außenseite** des Flügels mit dem
Winkel nach innen — bei 0,2 rad über 30 cm Flügeltiefe um **6,0 cm**. Die
Lehnenflanke steht bei x = 0,44, die Flügelvorderkante damit bei 0,380, und
dazwischen klafft von hinten-seitlich eine keilförmige Kerbe über die volle
Flügelhöhe. Genau die meldet der Prüfer.

Bei 0,09 rad sind es 2,7 cm. Das liest als Flare, nicht als Spalt.

Das ist die zweite Runde an derselben Stelle, und die Lehre daraus ist
unangenehm einfach: Ich habe in Paket 11 die **Ecke** korrigiert, die ich
gerechnet hatte, und nicht nachgesehen, was der Winkel mit der ganzen **Fläche**
macht. Derselbe Fehlertyp wie beim Horizont in Paket 16 — die Stelle prüfen und
die Kurve übersehen.

### Ergebnis

Aus dem Sitzabstand (freier Blick, Position 0,1 | 1,35 | −3,35) liest der Sessel
jetzt als ein Möbel: Die Flügel flankieren die Lehne, die Armrollen laufen
darunter durch bis in die Lehne, und es gibt keine Blickrichtung mehr, aus der
zwischen den Teilen Weiß steht.

47 Draw-Calls, 93 828 Dreiecke, 1,98 MB Textur — alle unverändert; es sind zwei
längere Körper und ein kleinerer Winkel. Zen, Nachthimmel und Insel
**bitgleich**, Dojo Δmax 5 bei 0,008 %. Build grün, Konsole frei von Errors und
Warnings.

### Was am Sessel offen bleibt

* Die Innenkante Sitzkissen / Lehne ist ein scharfer rechter Winkel ohne
  Polsterwulst (Prüferbefund 6).
* Sockel und Polster lesen als zwei Werkstoffe mit harter Trennlinie
  (Befund 15) — der Sockelkeder ist vorhanden, trägt aber nicht.
* Die Rosette liest als Schokolade (Befund 12).

---

## Paket 19 — Die drei kleineren Sesselbefunde

Befunde 6, 12 und 15 des Prüfers in einem Paket, weil sie dasselbe Möbel und
dieselbe Ursache haben: **In einem Raum ohne Lichtrichtung trägt eine Wölbung
nichts.** Was hier Form gibt, ist eine Kante oder ein Tiefenunterschied.

### Innenkante Kissen/Lehne (Befund 6)

„Die Sitzfläche trifft die Rückenplatte in einer scharfen rechtwinkligen
Innenkante wie zwei Wände eines Kastens — kein Spalt, keine Kehle, kein
Polsterwulst." Genau so war es gebaut: zwei Quader, die sich durchdringen. An
einem echten Sessel liegt dort die Naht zwischen Sitz- und Rückenbahn, und die
ist ein Wulst, kein Winkel.

Jetzt ein liegender Schlauch quer über die Sitzbreite, Radius 26 mm.

**Erster Anlauf daneben:** Ich habe ihn auf y = 0,40 gelegt, also auf halbe
Kissenhöhe — vollständig **im** Kissen. Sichtbar war nichts. Die Kehle sitzt an
der Oberkante: Kissenmitte 0,38 plus halbe Kissenhöhe 0,075 macht 0,455.

### Sockel ohne Modellierung (Befund 15)

Der Prüfer misst auf einem 60×50-Feld einen Umfang von 34 bis 43 Stufen bei
einem mittleren Nachbarunterschied von 0,92 — „das untere Drittel des Sessels
wirkt wie ein Loch". Eine senkrechte Fläche in einem Raum ohne Lichtrichtung hat
überall dieselbe Normale; da ist nichts zu beleuchten.

Was ihr Form gibt, ist auch hier die Verdeckung: Ein Sockel steht 24 cm über dem
Boden, und je tiefer eine Stelle liegt, desto weniger Himmel sieht sie. Als
Scheitelfarben, 0,45 an der Unterkante bis 1,0 an der Oberkante.

| Sockel, Mittel je Höhendrittel | oben | Mitte | unten | Gefälle |
| --- | --- | --- | --- | --- |
| vorher | 46,9 | 43,6 | 41,9 | 5,0 |
| Faktor 0,60 unten | 45,5 | 41,0 | 37,5 | 8,0 |
| **Faktor 0,45 unten** | 44,8 | 39,9 | 35,4 | **9,4** |

Neun Stufen sind nicht viel, und das ist ehrlich gesagt die Grenze des
Verfahrens: Ein multiplikativer Faktor auf einen ohnehin dunklen Werkstoff
(0x4c1216) ergibt wenige absolute Stufen. Was man im Bild sieht, ist trotzdem
deutlich — der Sockel liest jetzt als Plinthe statt als Loch.

**Und ein Anlauf daneben:** Ich habe zuerst die Kederschnur von 8 auf 11 mm
verstärkt, weil der Prüfer „ohne Keder" meldet. Im Bild stand daraufhin ein
dunkler Stab quer über die Sockelvorderseite — **derselbe Fehler, der in diesem
Protokoll schon einmal steht** („las als vergessener Draht", Paket 3). Der Keder
bleibt bei 8 mm; was dem Übergang fehlte, war die Modellierung darunter.

### Rosette als Schokolade (Befund 12)

„Eine weiche braune Blüte aus acht gewölbten Blobs, ohne Kante, ohne Glanzlicht,
völlig streuend." Die Rosette besteht aus lauter Wölbungen — und Wölbungen
tragen hier nichts. Was ihr fehlt, ist der **Tiefenunterschied**: An geschnitztem
Holz ist der zurückliegende Teller dunkler als der Ring darüber, weil er weniger
Himmel sieht.

Jetzt in Scheitelfarben: Teller 0,58, Blätter 0,95, Buckel 1,12, Ring 1,18.

### Regression und Kosten

Draw-Calls 47 → **49** (der Sockel bekommt eigene Scheitelfarben und damit einen
eigenen Werkstoff, die Rosette ebenfalls — beides je ein Netz für beide Sessel),
Dreiecke 93 828 → **94 020**, Texturspeicher 1,98 MB. Zen, Nachthimmel und Insel
**bitgleich**, Dojo Δmax 5 bei 0,010 %. Build grün, Konsole frei von Errors und
Warnings.

---

## Paket 20 — Das Zeilenraster kroch, und meine Messung hatte es freigesprochen

**Der wichtigste Teil dieses Pakets ist ein Messfehler von mir.**

In Paket 8 steht: „Kein Flimmern dazugekommen: `tools/kamm.mjs` über die
Schirmfläche meldet Streuung 67,3 bei Zittern 0,47, Quotient 0,007 — der
ruhigste Bereich der Szene." Der Prüfer hat das Zeilenraster trotzdem als
kriechgefährdet gemeldet (Periode 5–6 px, mittlerer Zeilensprung 9,2 Stufen,
aus einem Meter unverändert 9,17).

Er hatte recht, und mein Werkzeug war blind: **`kamm.mjs` hat nur QUER
gewackelt.** Ein waagerechtes Streifenmuster ändert bei einer Querbewegung
seine Phase überhaupt nicht — die Streifen wandern mit, ohne sich zu
verschieben. Das Werkzeug hat gemessen, was es messen konnte, und daraus habe
ich einen Freispruch gemacht.

Mit dem neuen `--hoch` (die Kamera nickt statt zu schwenken):

| Bereich | Streuung | Zittern | Quotient |
| --- | --- | --- | --- |
| Schirm, quer | 32,4 | 1,98 | 0,061 |
| **Schirm, hoch** | 32,4 | **4,87** | **0,150** |
| Gehäuse daneben, hoch | 44,6 | 0,22 | 0,005 |

Der mit Abstand unruhigste Bereich der Szene — und er liegt auf dem einen
Gegenstand, auf den der Blick fällt.

### Die Abhilfe

Das Raster war eine schwarze Zeile von 28 % Deckkraft auf je zwei helle: ein
Rechteckmuster mit Periode 3, auf dem Schirm rund 6 Bildpunkte, mit harten
Kanten. Drei Änderungen, alle an der Ursache:

* **Periode 4 statt 3** — 8 statt 6 Bildpunkte, also aufgelöst statt
  grenzwertig.
* **Kosinusprofil statt Rechteckkante** — dieselbe Grundfrequenz, aber ohne die
  Oberwellen, die eine harte Kante mitbringt.
* **Amplitude 0,13 statt 0,28** — das Raster einer Röhre ist aus zwei Metern
  ohnehin kaum zu sehen.

**Zittern hoch: 4,87 → 2,31**, Quotient 0,150 → 0,070.

### Der ausgebrannte Fleck (Befund 13)

Der Prüfer zählt **1021 Bildpunkte** auf dem Schirm, die in allen drei Kanälen
auf 254 oder darüber stehen — geklippt, also ohne Zeichnung, und auf einer sonst
flauen Röhre der einzige helle Punkt. Er liest ihn als Blendfleck oder defektes
Panel, nicht als Phosphor.

Das ist der Reflex des Führungslichts auf der Glasscheibe. Zwei Anläufe:

1. **Rauheit 0,12 → 0,20.** Verteilt dieselbe Energie auf mehr Fläche — und
   ließ die geklippte Fläche auf **2561** Punkte **wachsen**, weil das weichere
   Zeilenraster das ganze Bild um 8 % angehoben hatte und die breitere Keule
   nun über einer helleren Grundfläche liegt.
2. **Schwadenpegel 214 → 200** — brachte nur 2561 → 2561.
3. **Deckkraft der Scheibe 1,0 → 0,68.** Bei additiver Mischung skaliert sie die
   ganze Spiegelung, Umgebung wie Lichtreflex: **1078** Punkte, also wieder auf
   dem Ausgangswert — aber jetzt mit einem weichen Hof drumherum statt einer
   harten Scheibe.

Ehrlich bleibt: Der Kern des Reflexes klippt weiterhin auf 0,6 % der
Schirmfläche. Das ist bei einer gespiegelten Lichtquelle auch richtig; was den
Befund ausgemacht hat, war die fehlende Zeichnung **um** ihn herum, und die ist
jetzt da. Der Schirm insgesamt: Mittel 123,9 → 121,8, p95 178 → 177.

### Und ein Durchgang gespart

Der erste Anlauf hat das Raster als zweiten `getImageData`/`putImageData`-Zyklus
angehängt — zwei volle Durchläufe über 224×168 Punkte, zwölfmal je Sekunde, für
eine Multiplikation, die in die vorhandene Kornschleife passt. Jetzt läuft
beides in einem Durchgang.

### Regression und Kosten

49 Draw-Calls, 94 020 Dreiecke, 1,98 MB Textur — unverändert. Zen, Nachthimmel
und Insel **bitgleich**, Dojo Δmax 4 bei 0,009 %. Build grün, Konsole frei von
Errors und Warnings.

---

## Paket 21 — Das Glanzgesprenkel auf dem Leder

**Befund 8 des Prüfers:** „Einzelne fast weiße Pixel auf dunkelrotem Grund, in
Ketten entlang der Glanzkanten. Kein Muster, keine Fläche — Streusalz."

### Erst ein Werkzeug, das Funken zählt

Der mittlere Nachbarunterschied sagt darüber nichts: Ein Bereich kann im Mittel
ruhig sein und trotzdem voller einzelner Ausreißer stecken. Neues
`tools/funken.mjs` zählt deshalb **Punkte, die ihr Viererumfeld um mehr als eine
Schwelle übersteigen** — die Größe, die in Bewegung als Kribbeln erscheint.

Auf der Armrolle in `b-sessel` (58 911 Punkte), im Stand: **0,859 %** über
Umfeld+15, **0,353 %** über +25, größter Sprung 64.

### Rauheit räumt sie weg — und nimmt den Glanz mit

| Rauheit | > +15 | > +25 | größter | Glanz (> L 110) | Korn |
| --- | --- | --- | --- | --- | --- |
| 0,45 (Stand) | 0,859 % | 0,353 % | 64 | 0,89 % | 8,33 |
| 0,55 | 0,316 % | 0,048 % | 42 | 0,30 % | 5,99 |
| 0,65 | 0,042 % | 0,005 % | 42 | — | — |

Das ist ein Tausch, kein Gewinn: Der Glanz, um den Paket 6 gerungen hat, fällt
im selben Verhältnis.

### Die Ursache ist die Abtastung, nicht der Werkstoff

Eine Normalenkarte, die sich innerhalb eines Bildpunkts stark ändert, liefert je
Bildpunkt eine **zufällige** Normale statt eines Mittelwerts — und wo die
zufällig zur Lichtquelle zeigt, steht ein Funke. Dagegen gibt es ein
Standardmittel: die Rauheit dort anheben, wo die Normale schnell variiert.

three tut das bereits, aber nur für die Geometrie:

```glsl
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
```

`nonPerturbedNormal` ist die Flächennormale **ohne** Karte. Ersetzt man sie
durch `normal` — die gestörte —, erfasst derselbe Ausdruck genau die Änderung,
die die Narbung einbringt. Keine Textur, kein Aufruf, kein Durchgang.

| | > +15 | > +25 | > +40 | größter | Glanz | Korn |
| --- | --- | --- | --- | --- | --- | --- |
| ohne | 0,859 % | 0,353 % | 0,088 % | 64 | 0,89 % | 8,33 |
| **mit** | 0,579 % | **0,221 %** | 0,042 % | 63 | 0,55 % | 6,16 |

Ein Drittel weniger Funken, und der Glanz kostet weniger als bei reiner
Rauheit: Bei Rauheit 0,55 wären es 0,30 % Glanz für 0,048 % Funken, hier
0,55 % Glanz für 0,221 %. Im Bild ist der Unterschied deutlich — die hellen
Einzelpunkte auf der Armrolle sind weg, die Narbung bleibt.

### Zwei Dinge, die dabei schiefgingen

**Erstens, und das ist die eigentliche Lehre:** Der erste Anlauf hat direkt auf
den Text des three-Bausteins ersetzt. Die eingebaute Wache hat sofort
angeschlagen — **in `onBeforeCompile` sind die Bausteine noch nicht
eingesetzt.** `shader.fragmentShader` enthält dort noch
`#include <lights_physical_fragment>`; three löst die Einschlüsse erst danach
auf. Wer einen Baustein ändern will, muss ihn selbst einsetzen. (Die übrigen
Ersetzungen in dieser Datei treffen deshalb entweder `#include`-Zeilen oder
Code, der direkt im Hauptteil steht — das war mir bis hierher nicht bewusst,
es hat nur zufällig immer gepasst.)

Dass die Wache angeschlagen hat statt still zu scheitern, ist das Verdienst von
Paket 14: Dort hat eine stumme `String.replace` einen ganzen Messlauf entwertet,
und seitdem wirft es.

**Zweitens ein Messwert, der nichts wert war:** Die Zahlen, die ich zwischen dem
Fehlschlag und seiner Behebung genommen habe (0,971 % / 0,575 %), stammen von
einem Werkstoff, dessen Shader gar nicht übersetzt wurde. Sie stehen hier nur,
damit klar ist, dass sie nicht zählen.

### Was offen bleibt

Aus **drei Metern** (`a-augenhoehe`, Sessel 120 px breit) ändert die Glättung
nichts: 1,661 % → 1,674 % über Umfeld+15. Das ist kein Versagen des Mittels,
sondern ein anderer Befund: Dort ist die Narbung längst wegmipgemappt, und was
funkelt, sind **Kanten von Kleinteilen** — Keder, Knöpfe, Flügelkanten — gegen
den maximal hellen Hintergrund. Das ist der Prüferbefund 14
(„Silhouettenkanten fast unbehandelt, genau ein Zwischenpixel"), und dagegen
hilft nur mehr Abtastung, nicht ein glatteres Material.

### Regression und Kosten

49 Draw-Calls, 94 020 Dreiecke, 1,98 MB Textur — unverändert; die Glättung ist
eine geänderte Zeile im vorhandenen Shader. Zen, Nachthimmel und Insel
**bitgleich**, Dojo Δmax 6 bei 0,011 %. Build grün, Konsole frei von Errors und
Warnings.

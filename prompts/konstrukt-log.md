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

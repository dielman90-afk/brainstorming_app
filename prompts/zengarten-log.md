# 🪷 Zen-Garten – Arbeitsprotokoll

Fortgeschrieben in **jedem** Durchlauf. Neueste Einträge oben.

## Stand

| Größe | Grenze | Ausgang (zen-00) | jetzt |
| --- | ---: | ---: | ---: |
| Draw-Calls env-zen (Höchstwert über 6 Kameras) | ≤ 120 | 166 ❌ | **84 ✅** |
| Dreiecke szenenweit | ≤ 350 000 | 20 028 | 44 414 ✅ |
| Texturspeicher | ≤ 60 MB | 29,77 MB | 21,18 MB ✅ |
| Shader-Programme | – | 20 | 24 |

Pakete: **1 bestanden.** Paket 2 (Sand) **nicht bestanden**, ein Anlauf
verbraucht, offene Punkte unten. Paket 3 gebaut, Prüfung läuft. 4–9 offen.

**Korrektur zu meinem eigenen Urteil.** Ich habe Paket 2 nach Durchlauf 2
selbst als bestanden protokolliert und committet, **bevor** der Prüfer sein
Urteil geliefert hat. Das war falsch herum: Der Prüfer ist die Instanz, nicht
ich. Sein Urteil lautet „nicht bestanden", und es ist mit Zahlen belegt, denen
ich nicht widersprechen kann. Der Eintrag zu Durchlauf 2 unten ist
entsprechend berichtigt.

---

## Werkzeug

Der Harness stand auf die Himmelsinsel eingerichtet und kennt jetzt beide
Umgebungen. Alle Werkzeuge nehmen `--env zen|island`, Vorgabe ist `zen`.

    node tools/verify.mjs zen-02 zen        # Build → Bilder → Messung → Urteil
    node tools/inspect.mjs --env zen        # woraus die Draw-Calls bestehen
    node tools/diff.mjs a.png b.png         # neu: zwei Bilder vergleichen

### Die sechs Zen-Kameras sind eingefroren

Stehen in `tools/harness-common.mjs` als `ZEN_SHOTS`. Ab hier unverändert:

| Name | pos | look | fov |
| --- | --- | --- | ---: |
| a-eyelevel | 0, 1.6, 6.0 | 0, 1.0, −12.0 | 70 |
| b-pond | 1.2, 1.5, 2.4 | 3.2, 0.1, −1.2 | 65 |
| c-torii | 1.0, 1.6, 3.0 | −2.0, 1.5, −9.0 | 70 |
| d-aerial | 10.0, 9.0, 12.0 | 0, 0, 0 | 55 |
| e-sand | 0.5, 0.45, 4.2 | −1.5, −0.05, −2.0 | 60 |
| f-grove | 2.0, 1.7, 6.5 | −5.0, 1.6, 0.5 | 70 |

Der Vorschlag aus dem Auftrag ist übernommen, wo er trug (a, d), und dort
korrigiert, wo er ins Leere zeigte: `b-pond` blickte mit [2.5,1.5,2] →
[−3,0.2,−4] am Teich (Mitte 3.2 | 0 | −1.2) **vorbei**, `c-torii` mit
[−4,1.6,5] → [3,1.4,−8] am Torii (−2 | 0 | −9) vorbei. Beide zeigen jetzt auf
ihr Motiv. Dazu zwei eigene: `e-sand` flach über dem Sand (Harkmuster,
Paket 2) und `f-grove` auf Sakura und Bambus (Paket 5).

### Zwei Messhinweise, die man kennen muss

* **Die Zen-Bilder sind bitgenau reproduzierbar.** Zwei Läufe desselben
  Standes ergaben Δmax 0. Eine Abweichung ist also immer echt.
* **Die Insel ist es nicht.** Zwei Läufe desselben Standes unterscheiden sich
  bei `env-island.png` in 0,62 % der Pixel (≥2 von 255). Beim Regressionsblick
  auf die Insel zählt deshalb nur eine Abweichung deutlich darüber – der Wert
  0,66 %, den der Vergleich zen-00 → zen-01 zeigt, liegt im Rauschen.
* **Die Frame-Zeiten schwanken stark** (a-eyelevel 11,5 ms im einen Lauf,
  1,3 ms im nächsten, bei identischem Bild). SwiftShader ohne GPU, dazu
  offenbar ein Aufwärmeffekt über die ersten Kameras. Ich benutze sie in
  diesem Protokoll **nicht** als Argument.

---

## Durchlauf 1 — Paket 1: Draw-Call-Struktur — **bestanden**

**Ziel:** 166 → ≤ 120 Draw-Calls ohne sichtbare Änderung.
**Ergebnis:** 166 → **53**. Bildabweichung ≤ 0,04 % der Pixel (Schwelle 8/255),
und die liegt ausschließlich auf Objektkanten.

### Erst gemessen, dann verschmolzen

`tools/inspect.mjs` zählte 153 Zeichenknoten, der Renderer aber **166** Calls.
Die Differenz von 13 war der erste Befund und hätte durch Raten nicht geklärt
werden können: Ein `page.evaluate`, das `renderer.info.update` abfängt und
gegen `onBeforeRender` hält, zeigte 13 Zeichenaufrufe **ohne** zugehöriges
Objekt. Ursache ist eine Stelle in `WebGLRenderer.renderObject`: Ein Material,
das gleichzeitig `transparent` und `side: DoubleSide` ist, wird in **zwei**
Durchgängen gezeichnet (erst Rück-, dann Vorderseiten), damit sich gekrümmte
Hüllen richtig überlagern. Betroffen waren die zehn Koi-Flossen und die drei
Wasserringe — allesamt **ebene** Flächen, die sich nie mit sich selbst
überlagern. `forceSinglePass: true` nimmt den zweiten Durchgang weg, ohne ein
Pixel zu ändern (nachgewiesen im Bildvergleich).

### Was verschmolzen wurde

| Vorher | Nachher | Calls |
| --- | --- | ---: |
| 33 Lotus-Blütenkegel + 3 Kerne, je Blüte eigenes Material | 2 Meshes, modulweite Materialien | −34 |
| 8 Findlinge + 16 Teichrandsteine (alle `zenGranite`) | 1 Mesh `zen-findlinge` | −23 |
| 6 Trittsteine | 1 Mesh | −5 |
| 5 Moosinseln | 1 Mesh | −4 |
| 7 Seerosenblätter | 1 Mesh | −6 |
| 5 Torii-Teile | 1 Mesh | −4 |
| 5 Steinteile der Laterne | 1 Mesh | −4 |
| 13 Kontaktschatten, 13 Materialien | 1 Mesh, Deckkraft in der Scheitelfarbe | −12 |
| Koi: je 8 Knoten / 13 Calls | je 4 Knoten / 4 Calls | −18 |
| Wasserringe doppelt gezeichnet | einfach | −3 |

### Der Trick bei den Kontaktschatten

Dreizehn Schatten unterscheiden sich nur in Ort, Größe und **Deckkraft** —
und genau die stand je Schatten in einem eigenen Material. Die bezahlte Lehre
aus der Insel sagt: *Scheitelfarben multiplizieren die Farbe, nicht die
Deckkraft.* Das stimmt für ein Farbattribut mit **drei** Komponenten. Hat es
**vier**, setzt three `USE_COLOR_ALPHA` (`WebGLPrograms.js`, Feld
`vertexAlphas`), und die vierte Komponente multipliziert die Deckkraft mit.
Damit tragen alle dreizehn Schatten in einem Draw-Call.

### Reihenfolge der Zufallszahlen

`mulberry32` ist gesät; ein zusätzlicher `rand()`-Aufruf verschiebt alles
danach. Deshalb wird **erst gebaut, dann verschmolzen**: Die Objekte entstehen
Zeile für Zeile wie zuvor, werden aber in eine Liste statt in die Gruppe
gelegt; `verschmelzeObjekte()` backt ihre Weltmatrix in die Geometrie. Kein
`rand()`-Aufruf hat sich verschoben — nachweisbar daran, dass im Bildvergleich
kein Stein und kein Blütenblatt seinen Platz gewechselt hat.

### Was ich falsch gemacht habe

Die ersten Bilder habe ich erst **nach** dem Umbau aufgenommen und musste den
Ausgangsstand über `git stash` nachholen. Beim nächsten Paket stehen die
Vergleichsbilder vorher.

### Was das Paket **nicht** getan hat

* Die 13 Bambushalme bleiben 13 Draw-Calls. Sie wiegen einzeln in `update()`;
  ein Verschmelzen bräuchte den Wiegeschritt im Shader (Phase je Halm als
  Attribut). Machbar, aber das ist eine sichtbare Mechanik und gehört nicht in
  ein Paket, das nichts ändern soll. Reserve für später: −12 Calls.
* Die 5 Nebel-Sprites und die 7 Sprites insgesamt bleiben.

**Kopfraum für Paket 2–9: 67 Draw-Calls.**

---

## Durchlauf 2 — Paket 2: Sand — **nicht bestanden** (Urteil des Prüfers)

**Messwerte:** Draw-Calls 53 → 54 (der Saum), Dreiecke 19 570 → 28 074
(das Kiesbett ist jetzt ein Ringnetz statt 72 Dreiecke), Texturspeicher
29,77 → **20,77 MB**, Konsole sauber, Build grün.

### Was sich sichtbar geändert hat

* **Harkspur mit plausiblem Abstand.** Vorher 86 cm, jetzt 22,5 cm. Um jede
  Steingruppe und um den Teich liegt ein Band konzentrischer Züge, dazwischen
  gerade Züge; wo zwei Zugrichtungen aufeinandertreffen, steht eine Naht, wie
  sie ein Gärtner hinterlässt.
* **Die Rille hat ein Profil.** Runder Grund, flacher Kamm, der Grund dunkler
  und kühler, der Kamm eine Spur glatter. Vorher war die Spur eine Zeichnung
  in der Farbkarte plus eine Normal-Map derselben Zeichnung.
* **Korn.** Grobkiesel von 1 bis 2,5 cm und feines Korn darunter, kachelnd
  über 70 cm.
* **Ausbleichen zum Rand**, ab 55 % des Radius einsetzend, und die Harkspur
  läuft zwischen 11 und 17 m aus: außen liegt ungeharkter, sonnengebleichter
  Kies.
* **Übergang zum Moos und zum Teich.** Der Sand darum ist feucht: dunkler,
  gesättigter, und die Harke hört auf.
* **Der Saum.** Das Kiesbett endet bei 20 m und der Nebel fängt bei 20 m an —
  die Kante, an der die Welt aufhört, bekam also null Dunst und stand als
  scharfe Linie gegen den Himmel („der Garten ist eine schwebende Platte",
  Prüferbefund 15). Jetzt liegt dort ein Ring bis 52 m, der in den gesättigten
  Nebel läuft. Die Horizontfarbe der Himmelskuppel ist dafür auf die
  Nebelfarbe gesetzt worden.

### Warum die Harkspur gerechnet wird statt gezeichnet

Die alte Karte deckte mit 1024² die ganze 40-m-Scheibe ab: 3,9 cm je Texel.
Ein Rillenabstand von 22 cm hätte damit fünf Texel je Periode gehabt — das ist
die Unterabtastung, die auf der Insel schon einmal drei Durchläufe gekostet
hat. Für eine brauchbare Flanke bräuchte man rund 8000² Texel, also 350 MB
gegen ein Budget von 60 MB für **alle** Texturen.

Die Aufgabe ist deshalb nach Frequenz aufgeteilt: grob (Meter) in eine
512er-Farbkarte, mittel (die Harke, 22 cm) rechnerisch im Shader aus der
Weltposition, fein (Korn, Millimeter bis Zentimeter) in eine kachelnde
256er-Normal-Map. Der rechnerische Teil kann sich an `fwidth` ausblenden,
sobald eine Periode unter zwei Pixel fällt — deshalb gibt es in der Totale
kein Moiré, obwohl die Rillen bis 17 m laufen.

### Zwei eigene Fehler in diesem Durchlauf

1. **Ein Ersetzen an der falschen Stelle.** Die Erhöhung der Kornstärke von
   0,9 auf 1,15 hat nicht das Sandmaterial getroffen, sondern das des
   **Marsbodens** in der Nachtstadt — die erste Fundstelle im File stand dort.
   Aufgefallen ist es nur, weil der Regressionsvergleich `env-night.png` mit
   3,3 % abweichenden Pixeln meldete, während zwei Läufe desselben Standes
   bitgleich sind. Der Weg zur Ursache war ein Auszug der Nachtmaterialien mit
   Prüfsummen über alle Texturen, vorher und nachher — fünf Minuten, gegen
   beliebig viel Raten. Genau der Fall, für den die Regel „nach zwei
   Fehlversuchen nachmessen" da ist; hier hat schon der erste Messwert
   gereicht. Behoben, `env-night.png` ist wieder bitgleich.
2. **Ein Wertrauschen auf quadratischem Gitter als Korn.** In der
   sechsfachen Vergrößerung des Vordergrunds lag ein diagonales Karomuster
   über dem Sand — die Gitterinterpolation hat eine Vorzugsrichtung. Ersetzt
   durch gesetzte Körner (2600 feine, 220 grobe je Kachel, an den Rändern
   umlaufend gezeichnet); ein Tupfenfeld hat kein Gitter.
3. **Und ein dritter, kleinerer:** Der erste Saum lief in stumpfes Grün als
   „Bewuchs außerhalb des Gartens" aus und legte damit einen grünen Streifen
   genau auf die Horizontlinie. Der Nebel ist warm; der Saum muss ihm
   entgegenlaufen, nicht quer dazu.

### Das Urteil des Prüfers: nicht bestanden

Zwei der sechs Teilaufgaben sitzen, vier nicht:

| Teilaufgabe | Urteil | Beleg |
| --- | --- | --- |
| Harkmuster | bestanden | Kantenstärke im Vordergrund 0,107 → 0,394 L, das Karogitter ist weg |
| Ausbleichen zum Rand | knapp bestanden | Sättigung nah→fern 22,4 % → 17,5 %, Richtung stimmt, Betrag zaghaft |
| Relief in den Rillen | **nicht bestanden** | Profilasymmetrie 0,84 (Sägezahn wäre 2–4), Talwert 194 = Grundton; kein Pixel im Vordergrundstreifen unter L 183 |
| Korn | **nicht bestanden** | Hochpassbetrag 0,41 L, unter der Sichtbarkeitsschwelle |
| Übergang zum Moos | **nicht bestanden** | Bereich (460,478)–(620,518) in `a-eyelevel` **pixelidentisch** zu vorher |
| Rand des Kiesbetts | **nicht bestanden** | `d-aerial` Spalte 500, y 84–100: konstant 218,9 — kein Abschluss, nur Ausblendung |

Dazu sechs neue Programmierer-Tells, der schwerste: **Moiré**. In `f-grove`
liegt die Rillenperiode bei x=350 zwischen 2,7 und 3,7 px — Nyquist ist 2 px.
Der Ausblendeterm greift also zu spät. Gleichzeitig meldet der Prüfer, dass
die **Fernzone toter** ist als vorher (strukturloser Anteil 31,2 % → 59,8 %):
Der Preis für die Aliasing-Vermeidung wurde zu weit vorne bezahlt. Beides
zusammen heißt, dass die Ausblendung nicht auf „nichts" laufen darf, sondern
auf eine gröbere Struktur, die weiter trägt.

Weiter belegt: der Rillenabstand ist mit 7,0 % Streuung zu regelmäßig
(Handharke streut 15–30 % sprunghaft), der Musterabbruch bei 11–17 m steht als
gerade Linie quer im Bild (`e-sand` y ≈ 367–372), und die Modellierung nimmt
**zur Kamera hin ab** statt zu (Kantenstärke 1,79 bei y=480 gegen 0,37 bei
y=700).

Und ein echter Fehler, den er gefunden hat und ich nicht: In `c-torii` bei
(600,612) lagen „vier konzentrische Ellipsen konstanter Breite" auf dem Sand,
durch die die Harkstreifen ungestört hindurchlaufen. Das waren die
**Wasserringe des Teichs**, die im Ursprung standen statt im Wasser —
`update()` setzt ihre Lage nur im ersten Fünfzigstel ihrer Periode, davor
liegen sie bei (0 | 0). Behoben in Durchlauf 3.

### Was offen bleibt

* **Die Modellierung des Sandes ist durch das Licht gedeckelt.** Im
  Vordergrundstreifen von `e-sand` liegt die Spannweite p05–p95 bei 25 von
  255 (vorher 17). Mehr ist mit dem Sand allein nicht zu holen: Das
  Hemisphärenlicht steht auf 1,05 und liefert etwa die Hälfte der Helligkeit
  der Fläche, und diese Hälfte reagiert praktisch nicht auf eine Neigung der
  Normalen. Das ist Paket 3.
* **Die Ferne ist heller als die Nähe**, weil der Nebel warm und satt ist,
  der ausgebleichte Kies aber hell. Der Prüfer hat das im Ausgangsstand als
  fehlende Tiefenstaffelung gemeldet (9 von 255 über 44 m); der Saum hat die
  Kante beseitigt, die Tonwertfolge selbst gehört zu Paket 3.
* **Das Kiesbett ist eben.** Ein Karesansui-Bett ist gebaut und waagerecht,
  das ist richtig so; wenn später Steine und Trittsteine einsinken sollen
  (Paket 6), braucht es trotzdem eine gemeinsame Höhenfunktion.

### Der Prüferbefund zum Ausgangsstand (Durchlauf 1)

Zur Erinnerung für die kommenden Pakete — alle acht Kriterien nicht
bestanden, 16 belegte Mängel. Die schwersten, mit Paketzuordnung:

| # | Mangel | Beleg | Paket |
| --- | --- | --- | ---: |
| 1 | Kein Schlagschatten, keine Kontaktverdunklung | Sand am Fuß des Trittsteins 212,8 gegen freier Sand 212,9 — Δ 0,1 | 3 |
| 2 | Die Sonne ist dunkler als der Boden | Sonnenkern L=210,5, Vordergrundsand L=214,8; Anteil L>230 = 0,00–0,02 % | 3 |
| 3 | Sand ohne Modellierung | p05–p95 = 17 von 255 | **2 ✔** |
| 4 | Sand als sichtbares Rastergitter | Zellen von 10–14 px in d-aerial | **2 ✔** |
| 5 | Keine Tiefe | 9 von 255 über 44 m; Horizont eine Pixelzeile | 3 (Kante: **2 ✔**) |
| 6 | Bambus und Sakura sind Lutscher | Sakura-Stamm über 70 px exakt L=93,6, kein Ast | 5 |
| 7 | Wasser ist Grauplatte | Anteil >190 = 0,0 %, Spalte streng monoton | 4 |
| 8 | Trittsteine 21/22/23/21/23 px auf einer Geraden | Ufersteine bei konstantem Winkelschritt | 6, 7 |
| 9 | Laterne ist ein Grundkörperstapel und leuchtet nichts an | kein messbarer Lichtabfall daneben | 3, 6 |
| 10 | Drei unverbundene Grüntöne | Moos 71°, Bambus 76°, Seerose 119° | 4, 5 |
| 11 | Alle Steine ein Material | G/R 0,82–0,85 über sieben Steine | 6 |
| 12 | Torii eine einzige Farbe | vier Flächen, max. Abweichung 1 von 255 | 6 |
| 13 | Blütenblätter sind richtungslose Punkte | Seitenverhältnis 1,06, Dichte gegenläufig zum Baum | 8 |
| 14 | Koi ohne Körperbogen, ohne Schatten, ohne Bugwelle | beide waagerecht, gleiche Richtung | 8 |
| 15 | Der Garten ist eine schwebende Platte | Sandkreis endet als scharfer Bogen gegen den Himmel | **2 ✔** |
| 16 | Der Himmel ist eine lineare Rampe | 19 Proben streng monoton, gleiche Schrittweite | 3 |

---

## Durchlauf 3 — Paket 3: Licht & Atmosphäre

**Messwerte:** Draw-Calls 54 → **84** (der Schattendurchgang; Budget 120),
Dreiecke 28 074 → 44 294, Texturspeicher 20,77 → 21,18 MB, Shader-Programme
19 → 24, Konsole sauber, Build grün. Regression: `env-night`, `env-matrix`
bitgleich, `env-dojo` Δmax 6 auf 0,009 % der Pixel, `env-island` im bekannten
Eigenrauschen.

### Die Wurzel: eine Leuchte in main.js, die niemandem gehörte

`scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4))` gilt für
**alles** — Passthrough, Desktop-Ansicht und jede der fünf Welten. Zusammen mit
der eigenen Hemisphäre des Gartens (1,05) und einem Gegenlicht (0,45) standen
damit fast das Dreifache dessen im Bild, was die Sonne bei 34° auf eine
waagerechte Fläche legte. Eine Hemisphärenleuchte hängt fast nur von
`normal.y` ab; dieser Anteil reagiert also auf **keine** Oberflächenform. Das
ist der Grund, warum der Sand über die ganze Fläche 17 Luminanzstufen hatte und
warum am Fuß eines Trittsteins 0,1 Stufen Unterschied zum freien Sand gemessen
wurden.

three kennt keine Beleuchtung je Objekt — Layer filtern nur kameraweit —, also
ist die Stärke der einzige Hebel. Sie liegt jetzt bei der Umgebung
(`env.sceneAmbient`): Wer nichts angibt, bekommt weiterhin 1,4, die vier
anderen Welten und beide Nicht-Welt-Zustände ändern sich um kein Pixel. Der
Zen-Garten setzt 0,35 und bringt seinen Himmelsanteil selbst mit.

### Was sich sichtbar geändert hat

* **Sonnenstand 34° → 19,4°.** Später Nachmittag statt später Vormittag.
  Streiflicht über den Kies, Schatten fast dreimal so lang wie das Objekt hoch
  ist. Der Sonnenstand steht jetzt an **einer** Stelle im Code und wird von
  Licht, Schattenkamera, Sonnenscheibe, Himmelsbeschreibung und der
  Moospatina der Steine gelesen.
* **Schlagschatten**, 2048er Karte über 24 m. Gemessen auf derselben
  Sandfläche: besonnt L=182, verschattet L=107 — vorher war der Unterschied
  0,1.
* **Kühler Himmel, warme Sonne.** Vorher war beides warm und der Schatten nur
  ein dunklerer Sand. Jetzt trennen sich besonnt und verschattet im **Farbton**,
  nicht nur in der Helligkeit.
* **Die Sonne ist eine Lichtquelle.** Kleiner heller Kern plus weiter Hof, beide
  `toneMapped: false` — ohne das läuft die Scheibe durch dieselbe ACES-Kurve
  wie alles andere und landet im flachen Ast; gemessen war der Sonnenkern mit
  L=210,5 **dunkler** als der Sand davor mit L=214,8.
* **Schleierwolken am Himmel**, gerechnet in der Kuppel, null Draw-Calls. Der
  Himmel war eine lineare Rampe über 45 % der Bildfläche.
* **Streulicht durch das Laub.** Die Hüllkörper der Kronen stehen nicht mehr in
  der Schattenkarte, nur noch die Blattkarten mit Alpha-Test. Unter der Sakura
  liegt damit gesprenkeltes Licht statt eines geschlossenen dunklen Flecks.
* **Lichtspitzen auf Stein.** Die Rauheit des Zen-Granits skaliert jetzt auf
  0,76; dazu ein schmaler Himmelssaum an der Silhouettenkante — kleiner Betrag,
  hoher Exponent, damit daraus keine Flächenhelligkeit wird.
* **Kontaktverdunklung** statt Schattenersatz: Die gefälschten Flecken unter den
  Objekten sind auf 45–60 % ihres Radius zurückgenommen, weil die Sonne den
  Schatten jetzt selbst wirft.

### Ein eigener Fehler in diesem Durchlauf

Der Normal-Bias der Schattenkarte stand auf 0,03. Er verschiebt den
Abtastpunkt entlang der Normalen, und auf dem Kies zeigt die nach oben — ein
Trittstein ist 6 cm dick und steht 3 cm über dem Sand, also wurde über ihn
hinweg abgetastet und er warf nichts. Im Bild sah das aus wie ein vergessener
Schattenwerfer, war aber ein Zahlenwert. Auf 0,008 gesenkt.

---

## Durchlauf 4 — Paket 2 (Sand), zweiter Anlauf

Der Sand ist mit dem Licht aus Durchlauf 3 noch einmal angefasst worden. Er
hatte im ersten Anlauf vier von sechs Teilaufgaben nicht bestanden, und drei
davon — Relief, Korn, Tonwertlage — hingen nachweislich an der Beleuchtung.

**Messwerte:** Draw-Calls 84 (unverändert), Dreiecke 44 414, Texturspeicher
21,18 MB, Konsole sauber. Regression: `env-night` und `env-matrix` bitgleich,
`env-dojo` Δmax 4 auf 0,009 %, `env-island` im Eigenrauschen.

### Nachgemessen mit dem Maß des Prüfers

Vordergrundstreifen `e-sand` (60,620)–(1220,700). Für den Hochpass (Pixel
minus 5×5-Mittel) hat `tools/region.mjs` jetzt einen eigenen Schalter
`--hochpass`, damit ich in derselben Sprache messen kann wie der Prüfer.

| | Ausgang | Sand 1. Anlauf | + Licht | Sand 2. Anlauf |
| --- | ---: | ---: | ---: | ---: |
| Hochpass \|d\| | 0,156 | 0,413 | 1,926 | **2,561** |
| Hochpass p95 | 0,37 | 1,31 | 6,86 | **8,59** |
| Kante waagerecht | 0,108 | 0,393 | 1,784 | **2,203** |
| p05–p95 | 17 | 25 | 74 | **66** |
| Anteil über L 190 | 96,8 % | 97,7 % | 15,1 % | **15,0 %** |

Der Befund „kein Pixel unter L 183" ist damit erledigt: Die Fläche sitzt nicht
mehr im obersten Sechstel der Skala, sondern schwingt in einer Spalte des
Vordergrunds zwischen L 119 und L 205. Der Befund „kein Korn" ebenfalls: Der
Hochpass steht beim Sechzehnfachen des Ausgangswerts.

Der Moiré-Bereich, den der Prüfer benannt hatte (`f-grove` 300,425–420,475):
senkrechte Kantenstärke 3,381 → **1,979**, Hochpass-p95 7,99 → **2,88**.

Das Fernband der Totale (`d-aerial` 100,80–1180,180), das im ersten Anlauf
**leerer** geworden war: Hochpass 1,025 (Ausgang) → 1,226 → **1,341**. Es
trägt jetzt mehr Struktur als im Ausgangsstand, nicht weniger.

### Was dafür geändert wurde

* **Asymmetrisches Rillenprofil.** Eine Harkzinke schiebt das Korn zur Seite;
  die eine Flanke ist steil, die andere läuft flach aus. Vorher stand dort ein
  symmetrisches Wellenband (gemessene Asymmetrie 0,84), also ein Glanzlicht auf
  dem Grat statt eines Schattens in der Rille.
* **Ein zweiter, grober Zug** im Abstand von 1,6 m — die Bahnen, in denen der
  Gärtner arbeitet. Er wird erst siebenmal weiter draußen unterabtastbar als
  die Zinkenspur und hält damit die Ferne besetzt, wenn die feine Spur längst
  ausgeblendet ist. Das ist die Antwort auf „der Preis für die
  Aliasing-Vermeidung wurde zu weit vorne bezahlt".
* **Früher ausblenden.** Die feine Spur ist jetzt bei 0,34 Perioden je Pixel
  vollständig weg statt bei 0,55 — deutlich vor Nyquist (0,5).
* **Streuung im Rillenabstand**, siehe eigener Fehler unten.
* **Die Randausblendung ist kein Kreis mehr.** Sie schwankt über den Azimut um
  ±5 m; vorher stand sie im flachen Blick als gerade Linie quer durchs Bild.
* **Der Moosrand ist ausgefranst.** 44 Segmente statt 20, jeder Randpunkt über
  zwei Frequenzen verrauscht: Zungen und Buchten statt einer Ellipse.

### Mein Fehler in diesem Durchlauf, und wie er aufgefallen ist

Für die Abstandsstreuung habe ich den Betrag **geschätzt** statt die Ableitung
hinzuschreiben. Für φ' = φ + A·sin(f·φ) ist dφ'/dφ = 1 + A·f·cos(f·φ); die
Streuung des Abstands ist also **A·f**. Ich hatte A·f·Teilung gerechnet und
kam auf „4 %", tatsächlich standen dort 0,9, also ±90 % — und wo der Ausdruck
negativ wurde, lief die Spur rückwärts. Im ersten Bild waren das keine
Harkzüge mehr, sondern Kratzer. Aufgefallen sofort im Bild, korrigiert auf
A·f = 0,26.

Das ist derselbe Fehlertyp wie beim Normal-Bias in Durchlauf 3: ein Zahlenwert,
den man hinschreiben statt schätzen muss.

### Was am Sand offen bleibt

* **Der Bettrand.** Der Prüfer will einen Abschluss sehen, ich habe nur die
  Ausblendung unregelmäßiger gemacht. Ein Karesansui ist von einer Mauer, einer
  Hecke oder einer Bordkante eingefasst — das ist eine
  **Kompositionsentscheidung** und gehört zu Paket 7, nicht in eine
  Sandtextur. Dort wird es entschieden.
* **Der Übergang zum Moos** ist jetzt von der Sandseite her da (Feuchtezone,
  auslaufende Harke) und von der Moosseite her als ausgefranster Rand. Was
  fehlt, ist die dritte Sache: Moospolster haben Aufbauhöhe, sie liegen nicht
  flach auf. Das gehört zu Paket 5.

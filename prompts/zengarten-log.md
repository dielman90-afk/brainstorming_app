# 🪷 Zen-Garten – Arbeitsprotokoll

Fortgeschrieben in **jedem** Durchlauf. Neueste Einträge oben.

## Stand

| Größe | Grenze | Ausgang (zen-00) | jetzt |
| --- | ---: | ---: | ---: |
| Draw-Calls env-zen (Höchstwert über 6 Kameras) | ≤ 120 | 166 ❌ | **93 ✅** |
| Dreiecke szenenweit | ≤ 350 000 | 20 028 | 74 606 ✅ |
| Texturspeicher | ≤ 60 MB | 29,77 MB | 21,53 MB ✅ |
| Shader-Programme | – | 20 | 32 |

| Paket | Anläufe | Stand |
| --- | ---: | --- |
| 1 Draw-Call-Struktur | 1 | **bestanden** (Prüfer) |
| 2 Sand | 2 | 1. Anlauf nicht bestanden, 2. Anlauf: 3 von 6 Teilaufgaben bestanden, 3 offen |
| 3 Licht & Atmosphäre | 2 | 1. Anlauf nicht bestanden, 2. Anlauf **ungeprüft** |
| 4 Wasser | 2 | 1. Anlauf nicht bestanden, 2. Anlauf **ungeprüft** |
| 5 Bepflanzung | 1 | **ungeprüft** |
| 6 Steinwerk | 1 | **ungeprüft** |
| 7 Komposition | 1 | **ungeprüft** |
| 8 Leben & Bewegung | 1 | **ungeprüft** |
| 9 Schlusspass | 1 | erledigt |

„Ungeprüft" heißt: Der Prüf-Subagent ist beim Urteil über die Durchläufe 6 bis
8 an einem Ausgabelimit des Kontos abgebrochen und ließ sich danach nicht mehr
starten. Die Zahlen in den Einträgen unten sind meine eigenen Messungen mit
denselben Werkzeugen. Ein Urteil „bestanden" spreche ich mir für diese Pakete
nicht selbst zu.

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

---

## Durchlauf 5 — Paket 4: Wasser

**Messwerte:** Draw-Calls 84 → 86, Dreiecke 44 414 → 59 712, Texturspeicher
21,18 → 21,52 MB, Konsole sauber. Regression: `env-night` und `env-matrix`
bitgleich, `env-dojo` Δmax 4 auf 0,008 %, `env-island` im Eigenrauschen.

### Der Befund: Der Teich war eine Scheibe, kein Gewässer

Die Wasserfläche lag bei y = 0,01 auf dem Kiesbett bei y = −0,02 — drei
Zentimeter „Tiefe". Der Prüfer hatte gemessen: Mittel 114, Spannweite 26, kein
Pixel über 190, praktisch keine Sättigung, und eine Spalte durch den Teich fiel
streng monoton. Dazu: Die Koi sind 11 cm hoch und schwammen auf y = 0 — sie
ragten viereinhalb Zentimeter aus dem Wasser.

### Was gebaut wurde

* **Ein echtes Becken.** 42 cm tiefe Mulde mit Uferwulst, der über die
  Wasserlinie steigt und außen wieder in den Kies läuft. Die Zonen — Schlick,
  Flachwasser, Wasserlinie, nasses Ufer, trockener Wulst — stecken in den
  Scheitelfarben, also ein Draw-Call.
* **Eine Aussparung im Kiesbett.** Sonst schneidet die waagerechte Kiesfläche
  durch das Becken und man sieht Sand auf halber Wassertiefe.
* **Tiefenton als Deckkraft, nicht als Farbe.** Am Ufer sieht man den sandigen
  Grund, in der Mitte nicht mehr — nach Beer-Lambert, nicht linear. Genau das
  trennt Wasser von eingefärbtem Glas. Gemessen: Mittel 95 → 112 bei einer
  Spannweite von 59 bis 143 gegen 96 bis 122 vorher.
* **Wasserlinie statt Schnitt.** Ein dunkler Saum am Ufer, und die Fläche läuft
  am äußersten Rand in der Deckkraft aus.
* **Nässe an den Steinen.** Die sechzehn Uferkiesel sind an die Wasserlinie
  gerückt und abgesenkt; unterhalb davon sind ihre Scheitelfarben um 45 %
  abgedunkelt, mit einem Saum von acht Zentimetern darüber, wo das Wasser
  hochzieht. Kein zweites Material, also kein zweiter Draw-Call.
* **Die Koi schwimmen unter Wasser**, 10 cm unter der Oberfläche. Seerosen,
  Lotus und Wasserringe sitzen auf der Fläche statt drei Zentimeter darüber.
* **Rauheit von 0,05 auf 0,14** und Spiegelungsstärke verdoppelt: Bei 0,05 ist
  die Sonnenspiegelung ein Punkt von wenigen Pixeln.

### Drei eigene Fehler in diesem Durchlauf

1. **`vMapUv` gibt es auf dieser Fläche nicht.** three legt die UV-Varianten je
   Kartenslot an; die Wasserfläche hat gar keine Farbkarte, nur Normal- und
   Clearcoat-Normalkarte. Der Shader kompilierte nicht und die Konsole war voll
   mit „useProgram: program not valid". Behoben mit einer eigenen Varying.
2. **Vierecke wegzulassen reicht als Aussparung nicht.** Der erste Anlauf
   verwarf jedes Viereck, dessen Ecken im Loch lagen; der Rand folgte damit der
   Ringauflösung von rund 40 cm und stand als Zackenkranz aus dem Uferwulst.
   Jetzt werden die inneren Punkte **radial auf die Kontur gezogen** und nur die
   ganz innen liegenden Vierecke verworfen — sonst spannen sie nach dem
   Aufziehen eine Sehne quer durch das Becken auf. Auch das stand erst als
   helle Zacken im Bild.
3. **`hashNoise` ist ein Hash, kein Rauschen.** Ich habe ihn als Umrissfunktion
   benutzt — zwei benachbarte Winkel liefern damit unabhängige Werte, und der
   Uferwulst lief nicht in Zungen und Buchten aus, sondern in einen Zackenstern.
   Dieselbe Ursache hatte der neue Rand der Moosinseln aus Durchlauf 4. Ersetzt
   durch `welligerUmriss()`: eine Summe von Sinus-Termen mit ganzzahliger
   Frequenz — stetig, und bei 2π schließt sie sich von selbst.

### Was offen bleibt

* **Keine Glanzbahn auf dem Wasser** (kein Pixel über 190). Von den festen
  Kameras aus ist sie geometrisch nicht zu haben: Die Sonne steht links hinten,
  `b-pond` blickt nach rechts vorn, die Spiegelrichtung zeigt am Sonnenstand
  vorbei. Das ist kein Rechenfehler, sondern die Aufstellung. Ob der Teich
  überhaupt an einer Stelle liegt, an der er die Sonne fangen kann, ist eine
  **Kompositionsfrage** — Paket 7.

---

## Prüferbefund zu Paket 3 (Licht & Atmosphäre): **nicht bestanden**

Zwei von fünf Teilaufgaben bestehen, drei nicht.

| Teilaufgabe | Urteil | Beleg |
| --- | --- | --- |
| Lichtrichtung / Tageszeit | bestanden | Schattenlänge zu Höhe ≥ 3,2 : 1, Richtung über alle sechs Kameras konsistent |
| Schlagschatten | bestanden | dieselbe Sandfläche besonnt 182,2 gegen verschattet 140,3, an den Kernen Δ 74 — vorher Δ 8,6 |
| Kontaktverdunklung | **teilweise** | unter dem flach liegenden Trittstein Δ 78–88 über 18 px; an **stehenden** Objekten gar nicht: Torii-Pfoster endet bei L 48,4, zwei Pixel weiter steht der volle Sonnensand mit 180,7 |
| Warme Lichtspitzen | **nicht bestanden** | Anteil über L 230 in `a-eyelevel`, `b-pond`, `d-aerial` jeweils **0,00 %**; hellster Pixel unter dem Horizont 226,2. Die Sonnenscheibe selbst ist zu 20,7 % reines (255,255,255) — ausgefressen und nicht warm |
| Streulicht durch das Laub | **nicht bestanden** | Kronenschatten Δ 18 L (Ahorn) gegen Stamm- und Halmschatten Δ 68–77 L. Die Krone wirft **schwächer** als der Stamm — die Beleuchtung ist dort invertiert |

Dazu: **Die Lichtseiten sind gesunken.** Anteil über L 200 fiel von 31,2 % auf
1,7 % (`a-eyelevel`), 69,5 % auf 16,7 % (`d-aerial`). Das Paket hat die Szene
abgedunkelt, statt ihr eine Lichtkante zu geben. Die Schattenseiten der
Findlinge saufen ab (Anteil unter L 30 von 1,6 % auf 21,4 %). Der Himmel bleibt
eine Rampe (RMS-Rest 0,89 → 1,63, in `f-grove` bleiben die Zirren unter 4,2 L
und damit unter der Sichtbarkeitsschwelle). Und am Bambusfuß steht
Peter-Panning: ein 2–4 px heller Spalt zwischen Halm und Schattenansatz.

Ausdrücklich **nicht** gefunden: Schattenakne, Naht oder Kachel im Himmel,
ausgefressene Lichter außerhalb der Sonnenscheibe.

Gelungen und zu erhalten: Die **Tiefenstaffelung** ist vervierfacht — reine
Sandbänder in der Totale von nah nach fern 172,4 → 181,0 → 192,9 → 203,4 →
218,5, also 46,1 L über die Strecke gegen 11,0 L vorher, bei gleichzeitig
fallendem Kontrast. Vordergrund, Mitte und Ferne sind erstmals messbar
getrennt.

Zwei der drei Sand-Altbefunde sind durch das Licht mitgelöst worden
(Vordergrund-Tonwert, Korn); das Sägezahnprofil war noch offen und ist in
Durchlauf 4 nachgeholt worden.

**Offene Punkte für den zweiten Anlauf an Paket 3:** Lichtspitzen, Sonnenscheibe
warm statt weiß, Kontaktansatz an stehenden Objekten, Streulicht durch das Laub,
Peter-Panning am Bambusfuß, Himmel, Absaufen der Steinschattenseiten.

---

## Durchlauf 6 — Paket 3 (Licht & Atmosphäre), zweiter Anlauf

**Messwerte:** Draw-Calls 86 → 90, Dreiecke 59 712 → 60 514, Texturspeicher
21,52 MB unverändert, Shader-Programme 25 → 30, Konsole sauber. Regression:
`env-night` und `env-matrix` bitgleich, `env-dojo` Δmax 4 auf 0,009 %,
`env-island` im Eigenrauschen.

### Der Kern des Befunds: Ich hatte abgedunkelt statt Licht zu geben

Der Anteil über L 200 war von 31,2 % auf 1,7 % gefallen. Der Fehler war, die
Grundhelligkeit zu senken **und** die Sonne nur moderat anzuheben. Bei 19,4°
trifft die Sonne eine waagerechte Fläche mit cos 71° = 0,33; sie muss also rund
dreimal so stark sein wie bei Mittagsstand, um dieselbe Flächenhelligkeit zu
erreichen. Jetzt 4,1 statt 3,1, die Hemisphäre 1,05 statt 0,85 (sie ist im
Schatten die einzige Quelle), und der Kies hat ein Albedo von 0,78 statt 0,90
bekommen — sonst stand er als gebleichte Fläche im Bild.

Anteil über L 200, `a-eyelevel`: 1,7 % → **11,8 %**; `d-aerial`: 16,7 % →
41,3 %.

### Warum es die geforderten Lichtspitzen nicht aus dem Kies geben kann

Nachgerechnet, statt es dreimal zu probieren: Bei Sonnenstärke 4,6,
Einfallswinkel 71° und Albedo 0,77 liegt der diffuse Anteil einer waagerechten
Fläche bei rund 0,72 linear; mit Belichtung 1,1 durch die ACES-Kurve sind das
etwa L 210. Für L 230 bräuchte es das Doppelte, also eine Sonne um 9 — und die
würde jede senkrechte Fläche ausfressen.

Spitzen können deshalb nur aus dem **Glanz** kommen. Zwei Versuche, die
Rauheit des Kieskamms zu senken (0,42 und 0,25), sahen im Bild beide falsch
aus: Bei streifendem Blick auf eine waagerechte Fläche ist die Glanzkeule
ohnehin breit, und mit niedriger Rauheit leuchtet nicht eine Kante auf, sondern
der halbe Vordergrund — der Kies sah lackiert aus und der Schatten in der Rille
war wieder weg. Trockener Kies bleibt also stumpf.

Die Lichtspitzen kommen jetzt von den Dingen, die welche haben dürfen:

* **Der nasse Stein am Wasser** — ein eigenes Material mit Rauheit 0,24. Das
  ist der eine zusätzliche Draw-Call, der in dieser Szene eine echte
  Lichtspitze liefert, und er ist zugleich die Materialtrennung „nass gegen
  trocken", die dem Teichrand gefehlt hat.
* **Der Lichtkasten der Laterne** — jetzt ein unbeleuchtetes Material ohne
  Tonemapping. Vorher war ein Lichtkasten am späten Nachmittag genauso hell wie
  der Kies daneben.
* **Die Sonnenscheibe**, siehe unten.

### Die weiteren Punkte des Prüfers

* **Sonnenscheibe warm statt ausgefressen.** Additiv plus voller Kern ergab
  reines Weiß: 20,7 % der Scheibenfläche standen auf exakt (255,255,255). Kern
  gedeckelt und wärmer, Hof kräftiger.
* **Streulicht durch das Laub — zurückgedreht.** Der erste Anlauf nahm die
  Hüllkörper der Kronen aus der Schattenkarte, damit nur die alphageprüften
  Blattkarten werfen. Gemessen kam ein Kronenschatten von Δ 18 L heraus,
  während der bloße Stamm daneben Δ 68 warf — die Krone warf **schwächer als
  ihr eigener Stamm**. Die Karten decken aus Sonnenrichtung zu wenig Fläche.
  Der Hüllkörper wirft wieder mit; was entsteht, ist ein Baumschatten mit
  dichtem Kern und aufgelöstem Saum.
* **Kontaktverdunklung an stehenden Objekten.** Am Torii saß der Fleck in der
  Mitte des Tors — die Pfosten stehen aber 1,2 m links und rechts davon und
  damit außerhalb. Jetzt zwei Flecken an den Füßen.
* **Peter-Panning am Bambusfuß.** Normal-Bias von 0,008 auf 0,0025; ein Halm
  ist 7 cm dick, der Versatz darf nicht in die Größenordnung des Objekts
  kommen. Schattenakne hatte der Prüfer ausdrücklich nicht gefunden, es war
  also Luft nach unten.
* **Himmel.** Wolkenschwelle gesenkt, Stärke auf 1,0 — und eine **senkrechte
  Naht** beseitigt: Die zweite Wolkenoktave lief mit Faktor 2,31 über 4 Umläufe,
  also 9,24 — kein ganzer Umlauf. Jetzt 3,0 mal 4 gleich 12.

---

## Prüferbefund zu Paket 4 (Wasser) und Paket 2 (Sand, 2. Anlauf)

**Paket 4 „Wasser": nicht bestanden (2 von 5).**

| Teilaufgabe | Urteil | Beleg |
| --- | --- | --- |
| Ufer | teilweise | Nassstreifen 25–45 px, klar vom Sand getrennt (L 100–112 / Sättigung 0,45–0,51 gegen 150–180 / 0,20–0,25), aber ohne Nässegefälle: an der Wasserlinie L 106,1, 14 px landeinwärts 112,2 — außen **heller** statt dunkler |
| Tiefenton | **nein** | Wasserkörper x 450–690: 11 L Spannweite auf 240 px; radial ist die Mitte 4,2 L **heller** als das ufernahe Wasser |
| Nässe an den Steinen | **nein** | Uferstein Krone L 42,6 gegen Fuß 36,2 — 6 L, kein Sättigungsanstieg, keine Wasserlinienmarke |
| Wasserlinie | halb | links/fern eine Rampe über 10–14 px, aber bei x 640–710 eine **harte schwarze Naht**, 43–61 L unter beiden Nachbarn, facettiert |
| Spiegelung | **nein** | Anteil über L 190 auf der ganzen Fläche 0,0 %; die Laterne steht mit L 202,3 unmittelbar daneben, das Wasser darunter misst 107 |

Deutlich besser: die Koi. Spitzensättigung 0,878 → 0,299, Spitzenhelligkeit
210,0 → 141,4, und die Spalte durch den Teich ist nicht mehr monoton.

**Paket 2 „Sand", zweiter Anlauf: nicht bestanden (3 von 6).**

Bestanden: **Sägezahnprofil** (Flankenverhältnis 1,5 : 1 mit scharfem Grat,
vorher eine gerundete Welle), **Moiré** (Streifen-RMS 7,89 → 6,24, das
Flimmergewebe ist weg), **Rillenabstand** (Streuung 7,4 / 1,9 / 3,0 % →
62,6 / 16,3 / 22,9 %).

Nicht bestanden: **Musterabbruch** (6-facher Struktursprung über 4 px mit
dunkler Naht — jetzt ein Bogen statt einer Geraden, aber unverändert hart),
**tote Fernzone** (strukturloser Anteil 23,9 % → **35,1 %**, also schlechter),
**Moosrand** (2-px-Kante, unangetastet — der Moosrand ist erst in Durchlauf 7
angefasst worden).

Neu und schlechter: eine **schwarze Naht** an der vorderen rechten Wasserlinie,
**Treppenstufen** auf den dünnen Rillen der Mitteldistanz, und der **Rücken
zwischen den Rillen** ist im Nahfeld eine tote Ebene (185–190 L, ±5 L über
50 px).

---

## Durchlauf 7 — Paket 5: Bepflanzung

**Messwerte:** Draw-Calls 90 unverändert, Dreiecke 60 514 → 67 970,
Texturspeicher 21,52 MB unverändert, Konsole sauber. Regression: `env-night`
bitgleich, `env-dojo` Δmax 4 auf 0,010 %, `env-matrix` Δmax 2, `env-island` im
Eigenrauschen.

### Was sich sichtbar geändert hat

* **Die Bäume haben Astwerk.** Der Prüfer hatte gemessen: Der Sakura-Stamm
  zeigte über 70 px Höhe exakt denselben Wert, und zwischen Stamm und Krone lag
  nichts — „Brokkoli auf Stiel ohne einen einzigen Ast". Jetzt führt ein
  verjüngter Ast zu **jedem** Kronenansatz, dazu je ein Nebenzweig; alles im
  selben Mesh wie der Stamm, also ohne einen einzigen Draw-Call mehr.
* **Die Krone ist um einen halben Meter gestiegen.** Ohne das wäre vom Astwerk
  nichts zu sehen: Die Blattmasse begann bei 1,78 m, der Stamm endete bei 1,80.
  Ein Baum liest sich über die Lücke zwischen Stamm und Krone.
* **Bambus mit Verjüngung und Bogen.** Ein Halm ist unten doppelt so dick wie
  oben, neigt sich und biegt sich unter dem eigenen Schopf; die Internodien
  sind unten kurz, in der Mitte lang, oben wieder kürzer. Die Schöpfe sitzen an
  der **gebogenen** Spitze und gestaffelt über das obere Drittel — vorher hingen
  sie senkrecht über dem Fuß und damit neben dem Halm in der Luft.
* **Moos als Polster.** Fünfeinhalb Zentimeter Aufbauhöhe mit Buckeln, am Rand
  auf null auslaufend. Vorher eine Scheibe mit zwei Pixeln Kante.
* **Farbharmonie der Grüntöne.** Die Seerose stand bei Farbton 119° und
  Sättigung 0,51, während das übrige Spektrum der Szene zwischen 9° und 41°
  liegt — ein Fremdkörper. Sie bekommt jetzt denselben olivgetönten Grundton wie
  das Moos.

### Mein Fehler in diesem Durchlauf

Der erste Anlauf am Astwerk hat den Baum **schweben** lassen: Ich habe die
Stammgeometrie auf 0…1,8 verschoben, die Äste um −0,9 versetzt und dann das
Ganze noch einmal um +0,9 — der Stammfuß stand danach auf 0,9 m. Sofort im
Bild gesehen und behoben; die Astkoordinaten sind jetzt durchweg
Baum-Weltkoordinaten ohne Zwischenversatz.

Und ein zweiter: Die Astabschnitte waren offene Zylinder ohne Deckel. Die
Innenwand wird rückseitig weggeschnitten, und die Astspitzen sahen aus wie
abgesägte Rohre, durch die man den Himmel sieht.

---

## Durchlauf 8 — Paket 4 (Wasser), zweiter Anlauf

**Messwerte:** Draw-Calls 90 unverändert, Dreiecke 67 970 → 68 034,
Texturspeicher 21,52 MB unverändert, Konsole sauber. Regression: `env-night`
bitgleich, `env-dojo` Δmax 4 auf 0,010 %, `env-island` im Eigenrauschen.

### Warum der Teich nichts spiegelte — nachgerechnet statt geraten

Ein Laufzeit-Auszug hat zuerst geklärt, dass die Umgebungskarte überhaupt
ankommt: 768×1024, CubeUV-Mapping, Stärke 2,0, Rauheit 0,14. Der Weg war also
in Ordnung. Dann die Rechnung: Bei einem Blick von 1,5 m Augenhöhe auf einen
Teich in 3,5 m Abstand trifft man die Fläche unter **67° zur Normalen**; der
Fresnel-Anteil ist dort rund 12 %. Zwölf Prozent der Himmelsradianz von 0,66
sind 0,08 linear — nach der ACES-Kurve etwa L 90, und **genau L 90 hatte der
Prüfer gemessen.**

Der Fehler lag also nicht im Aufbau, sondern in der Quelle: Die Pegel der
Himmelsbeschreibung für die Spiegelungskarte standen deutlich unter dem, was
die sichtbare Kuppel zeigt. Horizont 0,66 → 0,98, Dunst 0,58 → 0,88,
Zenit 0,36 → 0,48. Dazu die Rauheit von 0,14 auf 0,09: Je schärfer die Keule,
desto mehr vom hellen Horizontband kommt zurück.

Gemessen auf der Wasserfläche: Anteil über L 190 von **0,0 % auf 0,4 %**,
Mittel 112 → 123, p95 143 → 168.

### Die schwarze Naht an der Wasserlinie

Sie war die Summe aus zwei Dingen: der dunkelsten Zone des Beckens (die genau
auf der Wasserlinie lag) und dem dunklen Saum, den der Wassershader dort noch
einmal darüberlegte (65 %). Zone aufgehellt, Saum auf 38 %, und die
Wasserfläche hat statt 96 nun 160 Segmente — bei 2 m Radius waren 96 Segmente
13 cm je Kante und die Wasserlinie aus zwei Metern sichtbar facettiert.

### Ein eigener Fehler

Die nassen Uferkiesel bekamen Rauheit 0,24 bei 45 % Verdunklung. Im Bild waren
das schwarze, glänzende Kiesel — Obsidian, nicht nasser Granit. Nasser Stein
ist dunkler und glatter als trockener, aber er bleibt Stein. Jetzt 0,34 und
26 %.

### Was am Wasser offen bleibt

* **Keine Spiegelung der Laterne.** Sie steht mit L 202 unmittelbar am Becken.
  Eine Punktlichtspiegelung bräuchte entweder eine zweite Umgebungskarte an
  ihrer Stelle oder ein Punktlicht — beides teuer für ein Detail.
* **Seerosen werfen keinen Schatten ins Wasser.** Sie liegen sechs Millimeter
  über der Fläche; bei 19° Sonnenstand liegt der Schatten damit 17 mm versetzt
  und damit unter dem Blatt. Der richtige Ort wäre der Beckengrund 40 cm
  darunter — dort ist das Wasser aber schon deckend.

---

## Durchlauf 9 — Paket 6: Steinwerk

**Messwerte:** Draw-Calls 90 unverändert, Dreiecke 68 034 → 68 158,
Texturspeicher 21,52 MB unverändert, Konsole sauber. Regression: `env-night`
bitgleich, `env-dojo` Δmax 4 auf 0,008 %, `env-matrix` Δmax 1, `env-island` im
Eigenrauschen.

### Was sich sichtbar geändert hat

* **Trittsteine.** Der Prüfer hatte gemessen: Breiten 21/22/23/21/23 px, Höhen
  13/14/14/13/14, gleicher Weltabstand, keiner gedreht, keiner eingesunken —
  fünf identische Scheiben auf einer Geraden. Jetzt sieben Steine mit
  gebrochenem, vieleckigem Umriss, jeder anders groß, jeder gedreht und leicht
  schräg gelegt, alle im Kies **versenkt** statt daraufgelegt, und der Pfad
  krümmt sich mit schwankender Schrittweite.
* **Findlinge.** G/R lag bei allen zwischen 0,82 und 0,85, B/R zwischen 0,57
  und 0,60 — nur die Helligkeit schwankte. Jetzt fünf Grundtöne: warm, kühl,
  bräunlich, olivgrau. Gemessen liegt der Hochpass eines Findlings jetzt bei
  2,807 gegen 1,775 auf dem Sand daneben; vorher war der Stein **glatter** als
  der Sand (1,988 gegen 2,845).
* **Uferrand.** Statt einer Perlenkette bei konstantem Winkelschritt jetzt
  gestörte Winkel, schwankende Größen und zwei bewusste Lücken.
* **Torii.** Aus dem H aus Balken ist ein Myōjin-Torii geworden: Kasagi mit
  Aufwärtsschwung und Verjüngung zu den Enden, Shimaki darunter, ein Nuki, der
  durch die Pfosten stößt und vorsteht, Gakuzuka als Mittelstrebe, Kusabi als
  Keile, und Pfosten, die sich verjüngen und oben nach innen neigen. Die vier
  Flächen, die vorher um höchstens 1 von 255 auseinanderlagen, tragen jetzt
  Scheitelfarben: oben ausgeblichen, Unterseiten nachgedunkelt, Füße vom
  Spritzwasser dunkel.
* **Laterne.** Aus dem Grundkörperstapel ist eine Yukimi-Laterne geworden: ein
  weit auskragendes sechseckiges Dach mit hochgezogenen Ecken, und ein
  Lichtkasten aus sechs Eckpfosten, zwischen denen das Licht heraussteht.

---

## Der Prüfer fällt aus

Der Prüf-Subagent ist beim Urteil über die Durchläufe 6 bis 8 mit
„monthly spend limit" abgebrochen, mitten in der Messung. Weitere Subagenten
lassen sich damit nicht mehr starten.

**Das ist eine echte Lücke, und ich schreibe sie hierher statt sie zu
überspielen:** Die Pakete 3 (Licht, zweiter Anlauf), 5 (Bepflanzung), 4
(Wasser, zweiter Anlauf) und 6 (Steinwerk) sind **nicht extern geprüft**. Was
ich zu ihnen berichte, sind meine eigenen Messungen mit denselben Werkzeugen —
und ich bin an meiner eigenen Arbeit nicht unbefangen. Die Zahlen stimmen; das
Urteil „bestanden" spreche ich mir nicht selbst zu.

Ab hier prüfe ich mit `tools/pixel.mjs`, `tools/region.mjs --hochpass`,
`tools/crop.mjs` und `tools/diff.mjs` gegen die Befunde, die der Prüfer
zuletzt schriftlich hinterlassen hat, und benenne jeden offenen Punkt.

---

## Durchlauf 10 — Paket 7 (Komposition) und Paket 8 (Leben & Bewegung)

**Messwerte:** Draw-Calls 90 → 97, Dreiecke 68 158 → 85 590, Texturspeicher
21,52 → 21,53 MB, Konsole sauber. Regression: `env-night` bitgleich,
`env-dojo` Δmax 5 auf 0,009 %, `env-matrix` Δmax 1, `env-island` im
Eigenrauschen.

### Paket 7: Der Garten hatte keine Grenze

Der schwerste Kompositionsbefund war nicht die Streuung der Objekte, sondern
das fehlende **Rahmen**. In der Totale lagen sie als lose Reihe auf einer
Fläche, die nach allen Seiten ins Nichts lief; der Prüfer hatte das Bildviertel
links unten mit 98,9 % strukturlosem Sand gemessen.

Ein Karesansui ist immer eingefasst. Die Mauer leistet drei Dinge auf einmal:

* Sie gibt der leeren Fläche einen **Grund** — aus „da ist nichts" wird „da ist
  absichtlich nichts", also das *ma*, um das es geht.
* Sie legt eine **waagerechte Linie** ins Bild, gegen die alle Silhouetten
  stehen. Vorher stand alles gegen Himmel.
* Sie trennt Mittelgrund von Ferne und macht die Tiefenstaffelung sichtbar.

Gebaut ist sie als verputzte Lehmmauer mit Sockel, Ziegeldach mit Überstand,
Firstrundung und Abschlusspfeilern, über 270° von 130° bis 400°. Die Lücke
liegt bei rund 85° — genau dort, wo man in den Garten blickt. Neun geschnittene
Sträucher (Karikomi) stehen in Gruppen davor und geben dem Blick Masse im
Mittelgrund. Die geharkte Fläche endet jetzt an der Mauer statt im Nebel.

### Paket 8: Blütenblätter waren Staub, Koi waren starr

* **Blütenblätter.** Gemessen: 28 Partikel, Seitenverhältnis **1,06** — runde,
  richtungslose Punkte, deren Dichte gegenläufig zum Baum verteilt war und die
  bis an den oberen Bildrand schwebten. `PointsMaterial` zeichnet immer
  achsenparallele Quadrate; ein Blatt mit Längsachse ist damit nicht zu machen.
  Jetzt 320 Instanzen mit gezeichneter Blattform samt Kerbe, jede mit eigener
  Fallgeschwindigkeit, Taumelachse, Drehrate und Schwingphase. Sie fallen an
  den **beiden Bäumen**, ihre Streuung wächst nach unten, und keines steigt
  über seine Krone. Ein Draw-Call.
* **Koi mit Körperwelle.** Beide waren „starr waagerecht ohne Körperbogen" — es
  wedelte nur der Schwanz an einem Gelenk, die Bewegung eines Spielzeugs. Ein
  Fisch schwimmt, indem eine Welle vom Kopf zum Schwanz durch ihn hindurchläuft.
  Die Welle steht jetzt im Vertexshader: seitlicher Versatz proportional zu
  sin(z·k − t·ω), Amplitude wächst nach hinten, der Kopf bleibt ruhig. Der
  Schwanz schlägt in derselben Phase weiter, sonst arbeitet er dagegen.

---

## Durchlauf 11 — Schlusspass

**Endstand:** Draw-Calls **97** von 120, Dreiecke **80 770** von 350 000,
Texturspeicher **21,53 MB** von 60, Shader-Programme 32, Konsole frei von
Errors und Warnings, `npm run build` grün. Regression über alle vier anderen
Umgebungen: `env-night` bitgleich, `env-matrix` Δmax 1, `env-dojo` Δmax 6 auf
0,011 % der Pixel, `env-island` im bekannten Eigenrauschen des Harness
(0,62–0,87 % bei ≥2, zwei Läufe desselben Standes liegen bei 0,80 %).

### Zwei Fehler an der Mauer, beide im Schlusspass gefunden

1. **Senkrechte Nähte in gleichem Abstand.** Die Mauer war aus 96 einzelnen
   Quadern entlang des Bogens verschmolzen; auf der Innenseite stoßen zwei
   benachbarte Quader unter 2,8° aneinander und lassen an jeder Fuge eine Kante
   stehen. Im Bild lag darüber ein regelmäßiges Raster senkrechter Striche —
   ein Programmierer-Tell, das die Konstruktion verrät. Jetzt ein Profil, das
   am Bogen entlanggezogen wird: Die Innenfläche ist eine Fläche.
2. **Die Innenfläche war schwarz.** Nach dem Umbau zeigte die Normale nach
   außen. Nachgerechnet statt geraten: Das Profil läuft innen nach oben, der
   Bogen mit wachsendem Winkel; für das Dreieck (a, b, d) ist die eine Kante ŷ
   und die andere die Tangente t̂ = (−sin α, 0, cos α), und ŷ × t̂ =
   (cos α, 0, sin α) — nach außen. Umgekehrte Reihenfolge, fertig.

### Was am Ende offen bleibt

Ehrlich und vollständig, nach der letzten schriftlichen Prüferliste und
meinen eigenen Nachmessungen:

**Sand (Paket 2, zwei Anläufe verbraucht, zwei blieben ungenutzt)**
* Der **Musterabbruch** am Rand der geharkten Fläche ist immer noch ein harter
  Ansatz — jetzt an der Mauer statt im Nebel, was ihm einen Grund gibt, aber
  der Sprung selbst ist nicht weich.
* Der **Rücken zwischen den Rillen** ist im Nahfeld eine ebene Fläche statt
  einer Wölbung.

**Licht (Paket 3)**
* **Warme Lichtspitzen** kommen von Sonnenscheibe, Laterne und nassem Stein.
  Aus dem Kies sind sie nicht zu holen: Bei Albedo 0,77 und 71° Einfall liegt
  der diffuse Anteil bei 0,72 linear, was mit Belichtung 1,1 durch die
  ACES-Kurve etwa L 210 ergibt. Für L 230 bräuchte es eine Sonne um 9, und die
  würde jede senkrechte Fläche ausfressen. Zwei Versuche über den Glanz sahen
  lackiert aus. Das ist eine Grenze der Belichtung, kein Versäumnis — aber es
  ist eine Grenze.
* **Streulicht durch das Laub** ist ein Baumschatten mit dichtem Kern und
  aufgelöstem Saum, keine Lichtflecken **im** Kern. Der Hüllkörper ist
  undurchsichtig; ohne ihn wirft die Krone schwächer als ihr eigener Stamm.

**Wasser (Paket 4)**
* Die **Laterne spiegelt sich nicht** im Teich. Eine Punktlichtspiegelung
  bräuchte eine zweite Umgebungskarte an ihrer Stelle.
* **Seerosen werfen keinen Schatten ins Wasser** — sie liegen sechs Millimeter
  über der Fläche, bei 19° Sonnenstand liegt der Schatten damit unter dem Blatt.

**Nicht extern geprüft:** Licht (2. Anlauf), Wasser (2. Anlauf), Bepflanzung,
Steinwerk, Komposition, Bewegung. Siehe Abschnitt „Der Prüfer fällt aus".

---

## Durchlauf 12 — Nacharbeit auf Zuruf

Vier Punkte aus der Sichtung: Mauer weg, Teich voll, Bäume seltsam, zu viele
fallende Blätter, abstehende Zweige oben.

**Messwerte:** Draw-Calls 97 → 93, Dreiecke 80 770 → 74 606, Texturspeicher
21,53 MB unverändert, Konsole sauber. Regression: `env-night` bitgleich,
`env-matrix` Δmax 2, `env-dojo` Δmax 6 auf 0,010 %, `env-island` im
Eigenrauschen.

### 1. Die Gartenmauer ist entfallen

Sie hat geleistet, was sie sollte — Einfassung, waagerechte Linie, Trennung von
Mittelgrund und Ferne —, aber sie hat den Garten auch geschlossen: Aus dem
offenen Kiesfeld unter weitem Himmel wurde ein Hof. `makeGartenmauer()` bleibt
im Code stehen, gebaut und geprüft, und ist in fünf Zeilen wieder einzuhängen.
Die Harkspur läuft dafür wieder weiter und unregelmäßiger aus, statt an einer
Kante zu enden, und die neun Sträucher sind von 9–11 m auf 6–8 m
herangerückt — an der Mauer standen sie richtig, ohne sie wären es Klumpen weit
draußen im leeren Kies.

### 2. Der Teich war nicht zu leer, er war zu schmal

**Das hier ist der Fehler, den ich am teuersten bezahlt habe, und er stand seit
Paket 4 im Code.** Die Wasserfläche ist eine `CircleGeometry` in der **XY**-Ebene,
die anschließend um −90° um X gekippt wird. Ich habe sie mit
`scale.set(rx, 1, rz)` zur Ellipse gemacht — geschrieben, als läge sie in der
XZ-Ebene. Die Skalierung wirkt aber **vor** der Drehung auf die lokalen Achsen:
Lokal-Y wird zu Welt-Z, lokal-Z (überall null) zu Welt-Y. Die Streckung auf
1,7 lief damit ins Leere, und der Teich war in Z nur 1,0 m weit — das Becken
ringsum aber 1,7. Übrig blieb ein breiter Streifen Uferhang, den ich für zu
wenig Wasser gehalten habe.

**Dreimal habe ich versucht, das mit dem Pegel zu beheben** (0,95 → 1,01 →
1,04 → 1,055 der Beckenkontur), und dreimal hat es nicht getragen. Der vierte
Anlauf war eine Messung: Ein Laufzeit-Auszug, der für zwölf Azimute den
äußersten Wasserpunkt und die Beckenkrone in Weltkoordinaten ausliest, zeigte
einen Wasserradius von **0,61 bis 1,10 statt konstant 1,04** — und 1/1,7 =
0,588 nennt die Ursache beim Namen. Fünf Minuten gegen drei Anläufe. Genau die
Regel, die im Auftrag steht und die ich zum zweiten Mal zu spät befolgt habe.

Zwei kleinere Befunde fielen dabei mit ab und sind ebenfalls behoben:

* Die Wasserkontur lief **spiegelverkehrt** zur Beckenkontur, weil der lokale
  Winkel der gekippten Scheibe dem negativen Weltwinkel entspricht.
* Das Flachwasser war mit Deckkraft 0,34 so durchsichtig, dass der Beckenhang
  ungebrochen durchschien und als trockenes Ufer las. Jetzt 0,62, und der
  Flachwasserton ist grünlich statt sandfarben.

### 3. Die Bäume

* **Abstehende Zweige oben.** Die Nebenzweige sollten die Silhouette
  unregelmäßig machen, endeten aber zwangsläufig irgendwo — und wo das
  außerhalb der Blattmasse lag, stand ein Stab in der Luft. Sie sind entfallen.
  Die Hauptäste enden jetzt außerdem tief **im** Schopf (−r·0,3 statt +r·0,25),
  statt an den oberen Ansätzen aus der Krone zu stechen.
* **Die Krone saß wie ein Pilzhut auf dem Stamm** — sechs Ansätze zwischen 2,30
  und 2,92 m ergaben eine breite, unten glatt abgeschnittene Platte. Jetzt acht
  (Sakura) beziehungsweise sieben (Ahorn) Ansätze mit deutlich mehr
  Höhenstreuung, zwei davon tief außen, so dass die Krone an den Seiten
  herabhängt und die Unterkante keine Waagerechte mehr ist. Kostet keine
  Draw-Calls, die Schöpfe sind Instanzen.
* **Zu viele Blätter.** 320 fallende Blätter sind kein Kirschbaum im Wind,
  sondern ein Schneesturm. Jetzt 90.

## Durchlauf 13 — Der Prüfer sieht den Zen-Garten zum ersten Mal seit dem Umbau

Nach dem Nachthimmel und der Himmelsinsel ist der Zen-Garten an der Reihe. Der
Prüfer hat sechs Bilder bekommen, ausdrücklich mit der Ansage, was für eine
Szene das ist (japanischer Garten, rein prozedural, bewusst stilisiert,
Nachmittagslicht), und hat **fünfzehn Mängel** gemeldet, nach visueller Wirkung
sortiert:

1. Moosflächen sind flache Klebebilder
2. Das Wasser ist eine tote milchige Scheibe ohne Spiegelung
3. Es gibt keine Welt hinter dem Garten — leerer Sand bis zum Horizont
4. Kein Objekt berührt den Boden (Torii-Fuß, Stämme, Trittsteine, Laternensockel)
5. Das Laternenlicht leuchtet nichts an
6. Der Bambus hat keine Halmknoten und liest sich nicht als Bambus
7. Das Torii hat einen einzigen Farbton ohne Flächentrennung
8. Der Sand ist zwei verschiedene Materialien; Aliasing in der Ferne; die
   Harkung läuft unter den Steinen durch
9. Die Terrassenkante der Sandfläche ist ungestaltet
10. Die Baumkronen sind Alpha-Blobs ohne Gegenlicht
11. Alle Steine sind derselbe Stein
12. Zwei Jahreszeiten gleichzeitig (Sakura und Herbstahorn), zwei Farbausreißer
13. Der Garten ist unbelebt
14. Wolken als parallele Schlieren, harte helle Bande am Horizont
15. Komposition von `a-eyelevel` und `d-aerial`

Ausdrücklich gelobt und nicht anzutasten: das Sandrelief im Nahbereich, die
weichen Laubschatten, der Farbklang, die Silhouette des Torii, die
Luftperspektive auf den fernen Steinen, die unregelmäßige Setzung der
Trittsteine.

**Budgetlage vorweg** (`tools/metrics/zen-16.json`): 93 von 120 Draw-Calls,
74 606 von 350 000 Dreiecken, 21,53 von 60 MB Textur. Dreiecke sind hier
reichlich da, **Draw-Calls sind knapp** — 27 frei. Alles, was neu dazukommt,
muss in ein bestehendes Mesh verschmelzen oder instanziert werden.

## Paket A — Die Moosinseln hatten fünfundvierzig Punkte (Prüferbefund 1)

Im Quelltext stand über dem Moos ein Absatz, der eine Kuppel mit Buckeln
beschreibt, dazu ein gewellter Umriss und ein Feuchtsaum im Sand daneben. Im
Bild lag trotzdem ein Abziehbild. Der Grund steht in einer einzigen Zeile:

    const mossGeo = new THREE.CircleGeometry(mossR, 44);

**`CircleGeometry` hat einen Punkt in der Mitte und 44 auf dem Rand. Dazwischen
liegt nichts.** Jede Höhenfunktion wurde also an genau diesen 45 Stellen
abgetastet, und weil der Rand definitionsgemäß auf null liegt, blieb von der
Kuppel ein Kegel und von den Buckeln nichts. Der Kommentar war richtig, die
Geometrie konnte ihn nicht tragen.

### Gemessen

`tools/moossaum.mjs` misst innerhalb der differenziellen Maske eines Knotens
vier Zahlen: **Kantensprung** (Helligkeitsunterschied über die Umrisslinie),
**Zackigkeit** (Randlänge geteilt durch die Wurzel der Fläche — für einen Kreis
3,54, und kleiner geht es nicht), **Saum** (Helligkeit im Randstreifen geteilt
durch die im Innern) und **Korn** (mittleres |L − Mittel(5×5)|, also
Feinstruktur ohne die weichen Schattenverläufe).

**Zwei eigene Fehler beim Messen, der zweite schlimmer als der erste.**

* Mit Schlagschatten misst `Saum` nicht den Saum, sondern den Baum: Der
  Laubschatten liegt in `c-torii` mitten auf der Fläche, also im Innern,
  während die Ableger am Rand in der Sonne stehen. Der Rand kam auf 1,068 —
  unabhängig davon, was die Scheitelfarben taten.
* Der Ausweg, „nur die besonnten Bildpunkte zu zählen, also alles über dem
  Mittelwert", war der schlimmere Fehler: **Ein dunkler Saum liegt unter dem
  Mittelwert und wird von genau diesem Filter weggeworfen.** Die Zahl blieb bei
  1,00. Aufgeflogen ist es an einer Probe mit verdreifachter Saumstärke: Der
  Kantensprung stieg von 33,99 auf 47,59, die Scheitelfarbe kam also sehr wohl
  im Bild an — nur nicht in meiner Messung. Ein Maß, das sein eigenes Signal
  herausfiltert, misst nichts.

Richtig ist `--ohne-werfer`: alle Schlagschatten aus, dann bleibt als
Verdunklung nur, was zum Polster selbst gehört.

Und der **Kantensprung ist zweideutig**, das gehört dazugesagt: Ein Abziehbild
springt hart, ein Polster mit dunklem Kontaktsaum aber auch — der Saum *ist*
ein dunkler Strich. Steigt er, während `Saum` unter 1 fällt, ist das ein
gewonnener Kontaktschatten und kein verlorener Übergang.

### Was geändert wurde

* **`ringScheibe(r, ringe, segmente)`** statt `CircleGeometry`: acht Ringe zu 44
  Segmenten, 353 Punkte und 704 Dreiecke je Fleck. Erst damit ist Relief
  überhaupt darstellbar.
* **Buckel aus einem Feld über zwei Achsen**, Wellenlängen 18 cm und 11 cm über
  dem Punktabstand (radial 12 cm, quer am Rand 14 cm).
* **Der Rand sinkt in den Sand** (−2,2 cm mit hoher Potenz), statt bei genau
  null an den Kies zu stoßen.
* **Der Saum ist dunkler statt heller.** Vorher stand dort `1 + rand2² · 0,35`:
  Der Umriss war der *hellste* Streifen der Fläche — genau die Signatur eines
  ausgestanzten Aufklebers. Direkt daneben ein zweiter Fehler: `hypot(x, z)` in
  einer Scheibe, die in der XY-Ebene liegt. z ist dort die Höhe; der Abstand
  vom Mittelpunkt war gar nicht der Abstand.
* **Ableger**: drei bis sechs kleinere Polster am Rand jedes Flecks, aus einem
  eigenen Zufallsstrom (sonst verschöbe sich alles, was danach gebaut wird), im
  selben Mesh verschmolzen — **null zusätzliche Draw-Calls**.

### Zwei Fehler, die erst der Umbau sichtbar gemacht hat

Beide standen vorher schon im Code und waren auf 45 Punkten unsichtbar:

* **Ein Speichenrad in jedem Fleck.** Die Höhe war mit `kissen(a · 1,7)`
  moduliert — einer Funktion, die *nur vom Winkel abhängt*. Auf einem Ringnetz
  ist das ein Stern aus Speichen. Gefallen; die Buckel kommen jetzt aus zwei
  Achsen.
* **Ein zweites Speichenrad aus der Farbe.** `hashNoise` liefert je
  Scheitelpunkt einen unabhängigen Wert; auf einem Ringnetz liegen die Punkte
  auf Speichen, und ein unabhängiger Wert je Punkt wird über die langen
  schmalen Dreiecke **radial verschmiert**. Ersetzt durch ein weiches Feld, in
  Weltmetern ausgewertet, damit die Flecken über die Grenze zwischen Fleck und
  Ableger hinweg weiterlaufen.

Dieselbe Unterscheidung also zweimal: Für ein Feld über einer Fläche braucht es
ein Rauschen, keinen Hash. Sie stand seit dem Uferwulst des Teichs im Log.

### Ergebnis

Alle Zahlen mit `--ohne-werfer`, vorher → nachher:

    Bild            Kantensprung   Zackigkeit      Saum        Korn
    a-eyelevel     23,23 → 37,73  8,64 → 11,75  1,001 → 0,946  3,99 → 6,99
    c-torii        26,99 → 40,64  4,73 →  7,80  1,008 → 0,943  2,87 → 4,78
    d-aerial       22,85 → 39,95  7,34 →  9,48  1,019 → 0,966  3,86 → 6,81

Die Zackigkeit steigt in `c-torii` um zwei Drittel: Das ist der Ausschlag der
Ableger, die die eine Linie zwischen Grün und Sand in mehrere zerlegen. Der
Saum fällt in allen drei Bildern unter 1, das Polster verschattet sich also
endlich an seinem eigenen Fuß. Das Korn steigt um drei Viertel.

### Kosten

    Draw-Calls      93 → 93         unverändert
    Dreiecke    74 606 → 79 576     (+4 970, 22,7 % des Budgets)
    Textur       21,53 MB → 21,53   unverändert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 6 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

## Paket B — Der Teich spiegelte, nur nichts mit einer Form (Prüferbefund 2)

Der Prüfer: „eine tote milchige Scheibe. Keinerlei Spiegelung — nicht vom
Himmel, nicht vom Torii, nicht von der direkt danebenstehenden Laterne, nicht
von den Ufersteinen. Keine Glanzlichter, keine Wellen. Und: der Teich ist als
einziges Element kalt."

### Der erste Verdacht war falsch, und die Messung hat es sofort gesagt

Naheliegend war „das Wasser hat gar keine Umgebungskarte". `tools/spiegelanteil.mjs`
hängt die Karte differenziell ab und wieder an; was sich ändert, ist die
Spiegelung. In `b-pond`: **77 717 Bildpunkte, 8,43 % des Bildes, mittlere
Änderung 109 Stufen.** Der Teich spiegelte also nicht nur, die Spiegelung war
der größte Teil seiner Helligkeit.

Nachgesehen, was in der Karte steht: `buildSkyEnvironment()` baut eine Kugel
mit einem Himmels-Shader — ein Verlauf und eine Sonnenscheibe, sonst nichts.
**Ein Verlauf, gespiegelt, bleibt ein Verlauf.** Der Garten kam in der Karte
nicht vor.

### Was geändert wurde

**Die Karte ist jetzt eine Aufnahme des Gartens.** Beim ersten Sichtbarwerden
sechs Bilder von der Mitte des Teichs aus, 35 cm über dem Wasser, durch den
PMREM gefaltet. Ausgeblendet wird alles, was nicht zum Garten gehört (Karten,
Tafel, die anderen vier Umgebungen) und alles, was auf dem Wasser liegt — die
Wasserfläche selbst würde sich sonst spiegeln, Seerosen und Lotus stünden
doppelt im Bild. Zur Laufzeit kostet das nichts: Es bleibt der eine Abgriff,
den das Material ohnehin macht.

**Ohne Tone-Mapping aufgenommen.** Der Renderer wendet ACES auch auf
Renderziele an; eine so aufgenommene Karte trüge die Kurve schon in sich und
bekäme sie beim Zeichnen ein zweites Mal.

**`envMapIntensity` von 1,5 auf 1,0.** Gemessen an einer flachen Kamera über
dem Teich: freier Himmel dicht über dem Horizont L 175 bis 181, Wasser L 210.
**Ein Spiegel kann nicht heller sein als das, was er spiegelt.** Jetzt 195 —
der Rest über dem Himmelswert ist der eigene Körper des Wassers und gehört
dorthin.

**Wärmere Wassertöne.** 0x5c7358 → 0x6d7448 und 0x11302f → 0x1d3026. Der
Prüfer hatte recht: Die alten Werte waren blaugrün, während Sand, Stein, Holz
und Himmel warm stehen.

**Eine gerechnete Glanzbahn.** Eine enge Keule um die Halbrichtung zwischen
Blick und Sonne, auf einer Fläche, deren Neigung aus zwei wandernden
Wellenzügen kommt. Aus der Umgebungskarte kommt sie nicht: Der PMREM faltet die
Sonnenscheibe bei Rauheit 0,09 zu einem weichen Fleck, und 256 Bildpunkte je
Würfelseite sind für eine Scheibe von einem halben Grad viel zu grob.

### Was ich versucht habe und was nicht ging

**Ein erkennbares Spiegelbild von Torii und Laterne ist mit einer
Umgebungskarte nicht zu haben, und das ist gemessen, nicht vermutet.** Probe:
Rauheit 0, Clearcoat-Rauheit 0, Kräuselung aus, dazu ein Durchgang mit der
**rohen** Würfelkarte statt der gefalteten. Das Bild war in allen drei Ständen
bis auf den Bildpunkt dasselbe — eine weiße Fläche. Der Grund ist Geometrie und
kein Fehler: Von den Winkeln, unter denen dieser Teich in den Prüfbildern zu
sehen ist, zeigt die Spiegelrichtung in den hellen Horizontsaum des Himmels.
Der Torii steht daneben, nicht dort.

Ein echtes Spiegelbild bräuchte eine ebene Spiegelung oder einen
Schablonendurchgang mit gespiegelten Kopien. Beides ist machbar — die vier
lohnenden Gegenstände (Torii, Laterne, Ufersteine, Findlinge) sind bereits je
ein verschmolzenes Netz, kosteten also vier Draw-Calls von 27 freien. **Offen,
mit dieser Begründung**, nicht als „geht nicht" abgetan.

**Die Glanzbahn ist in keinem der sechs Prüfbilder zu sehen** — auch das
gemessen und nicht übersehen. Sie braucht eine Kamera, die über das Wasser
**zur Sonne** blickt; alle sechs festen Kameras blicken von ihr weg. Der
Nachweis, dass sie steht, ist deshalb ein freies Bild:
`tools/shots/zen-19/x-glanzbahn.png`, Kamera bei (5,9 | 1,35 | 0,25). Dort
läuft eine helle, von den Wellen zerlegte Lichtbahn über den Teich. Das gehört
zu Prüferbefund 15 (Komposition): Keine der sechs Kameras nutzt das Gegenlicht
über dem Wasser.

### Ein Nebenbefund am Prüfstand

`measure.mjs` hat `envMap` **in keiner Zählung** geführt. Aufgefallen ist es
hier: Die größte einzelne Textur der Umgebung wechselte von einem
Himmelsverlauf auf eine Aufnahme des Gartens, und der Texturwert blieb auf die
zweite Stelle gleich. Die Karte wird jetzt getrennt ausgewiesen — **6 MB** beim
Zen-Garten. Getrennt und nicht dazugerechnet, damit die Zahlen früherer Läufe
vergleichbar bleiben; verschwiegen wird sie nicht mehr. Die alte Himmelskarte
war gleich groß (`PMREMGenerator.fromScene` benutzt dieselbe Würfelgröße 256),
das ist aus dem Quelltext von three abgeleitet und nicht gemessen.

### Ergebnis

    Spiegelanteil b-pond        8,43 % des Bildes, mittlere Aenderung 89,2
    Wasser gegen Himmel      210 → 195   (Himmel ueber dem Horizont 175–181)
    Ton                      blaugruen → olivgruen mit Bernsteinanteil
    Glanzbahn                nicht vorhanden → vorhanden (nur gegen die Sonne)

    Draw-Calls      93 → 93        unveraendert
    Dreiecke    79 576 → 79 576    unveraendert
    Textur       21,53 → 21,53 MB  unveraendert, dazu 6 MB Umgebungskarte

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

## Paket C — Eine Ferne, aber keine Mauer (Prüferbefund 3)

Der Prüfer: „`d-aerial` zeigt es unbarmherzig: eine Handvoll Objekte auf einem
winzigen Fleck, ringsum bis zum Horizont vollkommen leerer, strukturloser Sand.
Keine Einfassung, keine Mauer, keine Hecke, kein Hain im Rücken, keine Hügel,
keine Ferne. Ein Zen-Garten ist definitionsgemäß ein umschlossener Raum."

### Die naheliegende Antwort ist hier verboten

`makeGartenmauer()` steht im Code, gebaut und geprüft, und ist in fünf Zeilen
wieder einzuhängen. Sie ist in **Durchlauf 12 auf ausdrücklichen Zuruf des
Nutzers** herausgenommen worden; der Grund steht dort: Sie hat geleistet, was
sie sollte, aber sie hat den Garten geschlossen — aus dem offenen Kiesfeld
unter weitem Himmel wurde ein Hof. Diese Entscheidung gehört dem Nutzer, nicht
dem Prüfer, und sie wird hier nicht rückgängig gemacht.

Der Befund hat trotzdem einen Kern, und der ist nicht die Einfassung, sondern
die **Tiefenstaffelung**: Vordergrund, Mittelgrund, dann nichts. Die
Luftperspektive hatte nichts zu staffeln.

### Was geändert wurde

Ein **Hügelzug in 33 bis 45 Metern**, aus vier bis sechs ineinanderlaufenden
Kuppen je Gruppe, neun Gruppen mit drei Lücken, alles in **einem** Netz. Er
schließt nichts:

* Er steht im Nebelbereich (20 bis 46 m) und wird zu drei Vierteln in die
  Dunstfarbe gezogen.
* Er ist 2,0 bis 4,2 m hoch und lässt den Himmel offen.
* Drei Lücken, durch die der Blick hinausläuft.

Scheitelfarben statt einer Karte: In dieser Entfernung ist ein Texel kleiner
als ein Bildpunkt. Was noch liest, ist der Verlauf von der dunklen Flanke zum
lichten Rücken.

**Eigener Zufallsstrom**, sonst verschöbe sich alles, was danach gebaut wird.
Die Lücken verbrauchen ihre Ziehungen trotzdem — eine Änderung an ihnen darf
den Rest nicht verschieben.

### Zwei Anläufe

Der erste stand bei 30 bis 44 m mit Höhen von 2,5 bis 6 m. Zwei Fehler,
beide im Bild:

* Die Augenhöhenkamera steht bei z = +6; die nächste Gruppe lag damit **24 m**
  vor ihr und las als Kuppe im Mittelgrund statt als Ferne.
* 6 m Höhe auf 8 m Breite ergeben Halbkugeln. Ein Hügelrücken ist breit und
  niedrig; und die Kuppen einer Gruppe müssen weit auseinanderliegende Höhen
  haben, sonst steht eine Reihe gleich hoher Buckel da.

### Ergebnis

    Bild            Punkte   Mittel   p05   p50   p95
    a-eyelevel      34 954    168,2    89   182   218
    c-torii         39 313    152,1    83   155   209

Der Zug belegt also gut vier Prozent des Bildes und liegt im Tonwert zwischen
dem Sand davor und dem Himmel darüber — genau die Schicht, die gefehlt hat.

    Draw-Calls      93 → 95        (2 von 27 freien)
    Dreiecke    79 576 → 94 360    (27 % des Budgets)
    Textur       21,53 → 21,53 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,009 %. Build
grün, Konsole frei von Errors und Warnings.

**Was offen bleibt:** Der Prüfer wollte auch einen Hain im Rücken und ein Dach.
Beides wäre wieder ein Schritt Richtung Hof; der Hügelzug ist bewusst das
Äußerste, was ohne Widerspruch zur Nutzerentscheidung geht. Wenn der Garten
enger gefasst werden soll, ist das eine Frage an den Nutzer und keine, die ich
entscheide.

## Paket D — Kein Gegenstand hatte einen Fuß (Prüferbefund 4)

Der Prüfer, wörtlich: „Das direkte Sonnenlicht ist da und wirft brauchbare
lange Schatten — aber die **kurze Verschattung im Kontaktbereich** fehlt
komplett, und genau die entscheidet darüber, ob ein Objekt steht oder schwebt."
Aufgezählt: Torii-Fuß, Sakura-Stamm, Trittsteine, Ufersteine, Laternensockel.

### Gemessen, bevor gebaut wurde

`tools/knotenwerte.mjs --maske` auf `zen-kontaktschatten`: In `c-torii` kamen
**alle dreizehn** Kontaktverdunklungen des Gartens zusammen auf **1055
Bildpunkte** in zwei winzigen Flecken. In `e-sand`, der Nahsicht auf die
Trittsteine, waren es **399**.

Zwei Gründe, beide im Code nachlesbar:

* **Die Trittsteine hatten überhaupt keine.** In der Liste der dreizehn kamen
  sie nicht vor; ebenso wenig die neun Schnitthecken.
* **Die vorhandenen waren enger als ihr Gegenstand.** Die Findlinge trugen
  `size * 0.95` — die ganze Scheibe lag *unter* dem Stein und war unsichtbar.
  Sichtbar ist nur, was über die Kante hinausschaut.

### Was geändert wurde

Kontaktverdunklung für die sieben Trittsteine (mit der Streckung des Steins)
und die neun Schnitthecken; die vorhandenen weiter und kräftiger. Alle sitzen
im selben verschmolzenen Netz — **null zusätzliche Draw-Calls**.

Ein Zwischenstand war zu weit: `groesse * 1.5` ergab im Bild einen Schmierfleck
rund um den Stein statt eines Ansatzes an ihm. Eine Kontaktverdunklung ist eng
und dunkel, nicht weit und blass — jetzt 1,18-fach bei Deckkraft 0,8.

### Ergebnis

    Bild          Punkte in der Maske        p05 (dunkelste Stellen)
    c-torii        1 055 →  2 053             96 → 46
    e-sand           399 →  9 902             48 → 26
    a-eyelevel     5 754 → 17 949             97 → 36

Die Fläche verdreifacht bis verfünfundzwanzigfacht sich, und die dunkelsten
Stellen sinken um 50 bis 60 Stufen: Der Ansatz ist jetzt eine dunkle Linie am
Fuß und nicht mehr ein Hauch unter dem Gegenstand.

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 360 → 94 392    (+32)
    Textur       21,53 → 21,53 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 7 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

**Offen aus diesem Befund:** Die Ufersteine sitzen im Uferwulst und im Wasser,
nicht auf dem Kies — für sie ist die Kontaktverdunklung das falsche Mittel; der
Prüfer meint dort die Wasserlinie (Halbkugeln, die abgeschnitten werden statt
einzusinken). Und dass die Harkspur ungebrochen unter den Steinen durchläuft,
gehört zu Befund 8 und steht dort noch aus.

## Paket E — Das Laternenlicht leuchtete nichts an (Prüferbefund 5)

Der Prüfer: „Der Schein ist eine kreisrunde, symmetrische, weiche Scheibe, die
hinter der Laterne im Bild klebt. Sie erhellt weder die Dachunterseite noch den
Pfosten, noch die unmittelbar angrenzenden Steine, das Moos oder das Wasser
30 cm darunter. Damit ist offensichtlich, dass es ein aufgeklebtes Sprite ist."

Er hatte recht bis auf die Wortwahl: Es waren **zwei** aufgeklebte Dinge, die
beide nur sich selbst zeigen — ein unbeleuchteter Kasten
(`MeshBasicMaterial`, `toneMapped: false`) und ein additives Bildchen davor.
Eine Lichtquelle gab es nicht.

### Was geändert wurde

Eine Punktleuchte im Lichtkasten, 0xffb765, Reichweite 2,6 m, Abfall
quadratisch, **ohne Schatten**. Sie kostet keinen Draw-Call, sondern eine
Schleifenrunde je Fragment in den Standardmaterialien der Umgebung.

Ein erster Anlauf mit Stärke 3,2 war zu viel: Der Sockel leuchtete heller als
der besonnte Kies daneben, und die Dachunterseite las als zweite Lichtquelle.
Bei Tageslicht ist eine Steinlaterne ein Akzent, kein Scheinwerfer — jetzt 1,9.

    Bild          Bildpunkte, die sich aendern     mittlere Aenderung
    b-pond              12,4 % (>=2 Stufen)              1,30
    c-torii              7,5 %                            0,77
    f-grove              2,2 %                            0,28

Sockel, Zwischenplatte, Dachunterseite, die Steine daneben und der Teichrand
liegen jetzt im Schein.

### Eine Korrektur am vorigen Paket, gefunden über eine Nebenzahl

Der Prüfstand meldete nach dieser Änderung **55 Shader-Programme** statt der 32
vom Ausgangsstand, und der erste Gedanke war: die neue Leuchte. **Falsch.** Die
Zahlenreihe der Läufe zeigt, dass der Sprung ein Paket früher entstanden ist —
beim Teichspiegel:

    zen-16  32 Programme   (Ausgangsstand)
    zen-19  55             (Paket B, Teichspiegel)
    zen-20  55             (Paket C)
    zen-21  55             (Paket D)
    zen-22  55             (Paket E, Punktleuchte)

Die Punktleuchte kostet also **kein einziges** zusätzliches Programm. Der
Teichspiegel kostet 23, und das ist genau die Sorte Kosten, die in der Brille
als Ruckler beim Betreten des Gartens ankommt.

Zwei Programme davon sind gefunden und behoben: Die Aufnahme hatte blind alle
Kinder der Szene ausgeblendet, **darunter das Grundlicht und die
Hemisphärenaufhellung**, die in `main.js` an der Szene hängen und nicht an der
Umgebung. Eine andere Zahl von Leuchten ist eine andere Shader-Fassung — und
die Aufnahme entstand außerdem ohne einen Teil des Lichts. Jetzt bleiben die
Leuchten an: 55 → 53.

**Die übrigen 21 sind nicht erklärt.** Zwei Verdachte habe ich geprüft und
beide ausgeschlossen, jeder mit einem eigenen Messlauf: das abgeschaltete
Tone-Mapping während der Aufnahme (53 mit **und** ohne) und der Farbraum des
Renderziels (55 mit `SRGBColorSpace` wie ohne). Es bleibt als offener Posten
stehen, nicht als erledigt.

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 392 → 94 392    unveraendert
    Textur       21,53 → 21,53 MB  unveraendert
    Programme       55 → 53        (32 im Ausgangsstand, 21 unerklaert)

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 7 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

## Paket F — Der Bambus hatte Halmknoten, man sah sie nur nicht (Prüferbefund 6)

Der Prüfer: „Die Halme sind glatte grüne Röhren **ohne Halmknoten** — das ist
das eine Merkmal, an dem Bambus erkannt wird, und es fehlt. Alle Halme haben
denselben Durchmesser, dieselbe Farbe."

### Nachgesehen statt geglaubt

Geometrisch waren die Nodien da: `makeBambooStalk` setzt an jedes Internodium
eine Scheibe. Sie ist aber nur **16 % breiter** als der Halm und 2,6 cm hoch —
und ein Halm ist aus sechs Metern acht Bildpunkte breit. Die Scheibe war also
einen Bildpunkt breiter als das Rohr.

Was einen Nodus lesbar macht, ist nicht die Ausbuchtung, sondern der **dunkle
Ring** und die helle Wachsbinde darüber. Beides ist Farbe, und Farbe überlebt
die Verkleinerung. Nur konnte der Halm gar keine tragen:

    _bambooMat = weatheredWoodMaterial({ tone: 0x9fbc63, vertexColors: false });

Auch der Durchmesser-Vorwurf war zur Hälfte falsch: Die Halme sind 0,036 bis
0,052 dick und der Hain skaliert sie zusätzlich mit 0,8 bis 1,4. Die **Farbe**
war tatsächlich für alle dieselbe.

### Was geändert wurde

* `vertexColors: true` auf dem Halmwerkstoff.
* Am Nodus ein dunkler Ring (Faktor 0,58), darüber eine helle Wachsbinde
  (+26 %, nach 16 % des Internodiums aus), knapp unter dem nächsten Nodus
  wieder etwas dunkler, damit der Ring nicht aus dem Nichts kommt.
* Die Scheibe etwas kräftiger: 1,16 → 1,24 fach, 2,6 → 3,2 cm.
* **Ein Farbton je Halm, ohne eine einzige neue Ziehung.** Der Same kommt aus
  `radUnten` und `neigA` — Werten, die ohnehin gezogen wurden. Eine
  zusätzliche Ziehung aus `rand()` hätte alles verschoben, was danach im
  Garten gebaut wird.

Alles davon ist Farbe auf vorhandener Geometrie: **null zusätzliche Dreiecke,
null Draw-Calls.**

### Ergebnis

`tools/grasnarbe.mjs` über die Halme in `c-torii` (Kasten 165,380–330,470):

    Nachbarunterschied    |dx|          |dy|
    vorher                6,76          4,51
    nachher               6,77          5,26

Der **senkrechte** Unterschied steigt um 17 Prozent, der waagerechte bleibt auf
die zweite Stelle gleich. Genau das ist die Unterschrift eines Nodus: eine
waagerechte Gliederung. Wäre beides gestiegen, hätte ich Rauschen hinzugefügt
statt Ringe.

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 392 → 94 392    unveraendert
    Textur       21,53 → 21,53 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

### Was aus diesem Befund offen bleibt, und ein Fund nebenbei

Der Prüfer hat am selben Punkt auch das Laub bemängelt: „runde, kohlartige
Klumpen, auf die Halme aufgespießt, statt schmaler, lanzettlicher
Bambusblätter in Fächern." Das ist ein anderer Eingriff — es betrifft den
Blattatlas und die Anordnung der Karten — und steht noch aus.

**Und der Hain kostet dreizehn Draw-Calls von fünfundneunzig.** Jeder Halm ist
ein eigenes Netz, weil `update()` ihn einzeln dreht. Verschmolzen, mit dem
Wiegen im Scheitel-Shader wie beim Laub, wären das zwölf Draw-Calls weniger —
die größte einzelne Reserve, die der Garten hat. Notiert für den Fall, dass
ein späteres Paket den Platz braucht.

## Paket G — Das Torii: eine Hälfte des Befunds stimmte, die andere nicht (Prüferbefund 7)

Der Prüfer: „Über das gesamte Bauwerk **exakt ein Rotton** mit minimalem
Helligkeitsunterschied zwischen Vorderfläche und Seitenfläche der Pfosten —
obwohl die Sonne klar von links oben kommt. Keine Kantenlichter, keine Fase,
keine Verdunkelung in den Balkenanschlüssen, keine Holzmaserung, keine
Verwitterung."

### Nachgemessen: „ein Rotton" ist nicht reproduzierbar

`tools/knotenwerte.mjs` über die eigenen Bildpunkte des Knotens `zen-torii` in
`c-torii`, 18 548 Punkte:

    Mittel 86,7   p05 36   p50 79   p95 142   max 236

Das ist eine Spanne von über hundert Stufen, nicht eine von 1. Der Prüfer hat
offenbar die **zugewandten** Flächen abgetastet; die sind einander tatsächlich
ähnlich, weil die Scheitelfärbung nur von `normal.y` und der Höhe abhängt und
für vier senkrechte Flächen denselben Wert liefert. Der Rest der Spanne kommt
von der besonnten Oberseite und den Unterseiten. **Der Befund in seiner
gemessenen Form ist damit widerlegt; in seiner Beobachtung ist er richtig.**

### Was wirklich fehlte, und was jetzt da ist

**Erstens: Die Maserung war auf den Balken um das Zehnfache gestreckt.** Die
Pfosten bekamen `scaleUV(pillar, 3)`, die Balken gar nichts — und eine
`BoxGeometry` spannt ihre UVs einmal über jede Fläche. Auf dem 3,75 m langen
Kasagi lag **eine** Kachel, auf dem Pfosten daneben drei über 3,2 m. Dasselbe
Holz in zwei Maßstäben, und auf dem Balken eine Maserung, die so lang gezogen
war, dass sie als gleichmäßige Fläche las. Jetzt läuft jedes Teil über
`laenge / 0,35` UV-Einheiten; die Karte wiederholt sich intern [1, 3], deshalb
die Höhe durch 0,35 · 3.

**Zweitens: die Fugen.** Die Anschlüsse eines Myōjin-Torii stehen fest, es sind
vier — der Nuki durch beide Pfosten, der Shimaki auf beiden Pfostenköpfen, der
Kasagi auf dem Shimaki, die Gakuzuka zwischen beiden. Alle vier bekommen eine
Verdunklung in der Scheitelfarbe. Ohne sie ist das Tor ein einziger Körper, dem
jemand Kanten hineingezeichnet hat.

Ein erster Anlauf war zu schwach (Δmax 20, 0,49 % der Bildpunkte); die Tiefen
stehen jetzt rund 40 Prozent höher.

### Ergebnis

    zen-torii, eigene Bildpunkte   Mittel    p05
    vorher                          86,7      36
    nachher                         85,1      34

    Bild        geaenderte Bildpunkte   Δmax
    c-torii            0,54 %            29
    f-grove            0,59 %            29
    a-eyelevel         0,36 %            29

**Die Zahlen sind klein, und das gehört so gesagt:** Die Fugen sind schmale
Streifen, sie können den Mittelwert des ganzen Bauwerks nicht bewegen. Im Bild
ist der Unterschied größer als in der Zahl — das Tor liest jetzt als gefügte
Teile statt als ein Körper. Wer nur auf den Mittelwert sieht, würde dieses
Paket für wirkungslos halten.

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 392 → 94 392    unveraendert
    Textur       21,53 → 21,53 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

**Offen aus diesem Befund:** Kantenlichter und eine Fase an den Balkenkanten.
Beides bräuchte entweder zusätzliche Geometrie an jeder Kante oder einen
eigenen Shader-Term; die Frage ist, ob ein Tor in dieser Entfernung das trägt.
Nicht angefasst.

## Paket H — Die Harke lief unter allem durch (Prüferbefund 8, erste Hälfte)

Der Prüfer hat unter Nummer 8 vier Dinge zusammengefasst. Zwei davon sind hier
erledigt, zwei stehen noch aus.

### „Die Harkung ignoriert die Steine"

Wörtlich: „In `d-aerial` laufen die konzentrischen Ringe ungebrochen unter dem
Ahorn, den Felsen und den Moosgruppen durch. In einem Karesansui gibt es keine
Ringe unter einem Stein — es gibt Ringe **um** ihn herum."

Zur Hälfte war das schon gelöst: Um jede Steingruppe und um den Teich liegt ein
Ringband, und innerhalb seines Innenradius wird nicht geharkt
(`naht *= smoothstep(-0.12, 0.02, f)`). Um Moos und Teichufer hört die Spur
über `uSandFeucht` auf. **Nicht** gelöst war es für die beiden Bäume und die
sieben Trittsteine — und genau die hat der Prüfer benannt.

`uSandFeucht` konnte das nicht leisten: Es unterbricht die Harke **und** färbt
den Kies dunkler und gesättigter. Richtig am Moos, falsch unter einem
Baumstamm. Dazu waren seine sechs Plätze vergeben (Teich plus fünf
Moosinseln). Neu ist deshalb `uSandKahl` mit zwölf Plätzen: Ort, Halbmesser,
Stärke — Harke aus, Farbe unberührt. Der Auslauf ist mit 22 cm eng gehalten;
ein weicher Übergang über einen halben Meter sähe aus, als wäre die Rille dort
verweht, und eine Harke, die um einen Stein herumgeführt wird, hört an seinem
Rand auf.

Die Änderungskarte von `d-aerial` zeigt genau die sieben Trittsteine, den Fuß
der Sakura und den Fuß des Ahorns — und sonst nichts.

### „Die Harklinien zerfallen in gepunktete, gestrichelte Muster"

Der zweite Teil, und hier war die Ursache eine einzige Zahl:

    float scharf = 1.0 - smoothstep(0.10, 0.34, w);

`w` ist der Anteil einer Rillenperiode, den ein Bildpunkt überdeckt. 0,34 heißt
**drei Bildpunkte je Periode** — genau der Bereich, in dem ein Streifenmuster
in Punkte und Striche zerfällt. Die Spur stand also bis unmittelbar an die
Nyquist-Grenze.

Jetzt 0,09 bis 0,26, also Schluss bei knapp vier Bildpunkten je Periode:

    a-eyelevel, Kasten 960,395–1275,445     |dx|    |dy|    Anteil >40
    vorher                                  2,61    6,21      2,29 %
    nachher                                 1,44    4,21      1,24 %

**Ein erster Anlauf mit 0,07 bis 0,20 war zu scharf.** Im Bild war die ganze
rechte Bildhälfte ohne Spur — auch dort, wo sie vorher sauber stand. Das
Sandrelief im Nahbereich ist das, was der Prüfer ausdrücklich gelobt hat, und
es darf nicht mitbezahlen.

### Und ein Teil des Befunds ist nicht reproduzierbar

„In VR wird das kriechen und flimmern; es ist die auffälligste Bildstörung der
Szene." `tools/kamm.mjs --dreh` dreht die Kamera um Bruchteile eines
Bildpunktes — die einzige Messung, die in der Ferne noch etwas sagt:

    Bereich        Streuung   Zittern   Quotient
    Harke fern       29,9      0,98      0,033
    Harke nah        37,1      1,32      0,036

Der ferne Bereich zittert **weniger** als der nahe. Die Punktierung war da und
ist behoben; dass sie kriecht, ist gemessen nicht belegt.

### Was aus Befund 8 offen bleibt

* **„Der Sand ist zwei verschiedene Materialien"** mit einer sichtbaren Grenze
  auf derselben durchgehenden Fläche. Die Grenze ist genau die eben verschobene
  Ausblendung; ob sie jetzt als Übergang liest oder immer noch als Kante, ist
  eine eigene Messung wert.
* **Der Mustersprung** in `d-aerial` links oben, wo ein Bogensatz aufhört und
  ein anderer anfängt.

### Kosten

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 392 → 94 392    unveraendert
    Textur       21,53 → 21,53 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

**Und zum vierten Mal in dieser Sitzung:** ein Backtick in einem
GLSL-Kommentar innerhalb eines Template-Literals. `tools/shaderlint.mjs` als
`prebuild` hat ihn gefangen, bevor ein Bild entstanden ist — ohne ihn wäre der
Fehler als „Seite lädt nicht" aufgetreten.

## Paket I — Die Naht bei zwanzig Metern (Prüferbefund 9 und die zweite Hälfte von 8)

Der Prüfer hat dieselbe Linie zweimal gemeldet: als „der Sand ist zwei
verschiedene Materialien … der Wechsel geschieht auf derselben durchgehenden
Fläche und ist als Grenze sichtbar" (8) und als „eine harte Stufe quer durch
das Bild … eine scharfe, unbehandelte Facettenkante" (9).

### Drei Ursachen waren möglich, und ich habe alle drei falsch gewichtet

**Erstens war da tatsächlich eine Stufe.** Das Kiesbett ist eine flache Scheibe
bei y = −0,02, der Saum dahinter ein Ring bei y = −0,06 — **vier Zentimeter**
auf dem ganzen Umfang, aus 1,7 m Augenhöhe in 20 m Entfernung zwei Bildpunkte.
Das Bett neigt sich jetzt über die äußeren acht Prozent seines Halbmessers um
dieselben vier Zentimeter nach unten und trifft den Saum bündig.

**Zweitens waren es buchstäblich zwei Werkstoffe.** Das Bett ist ein
`MeshStandardMaterial` mit Rauheit 0,95, der Saum war ein
`MeshLambertMaterial`. Zwei Reflexionsmodelle geben unter demselben Licht
verschiedene Tonwerte. Jetzt beide `MeshStandardMaterial`.

**Drittens — und das ist es tatsächlich — fehlte dem Saum die Körnung.** Das
Bett trägt die Kornkarte des Sandes, der Saum trug gar keine, nur eine
Scheitelstreuung mit einer Wellenlänge von sieben Metern. Die Karte läuft
jetzt über den Ring mit derselben Kachelgröße weiter (0,7 m), also 148,6
Wiederholungen über die UV-Spanne einer `RingGeometry`, die den doppelten
Außenhalbmesser abdeckt.

### Und zwei eigene Fehlgriffe, die teurer waren als der Befund

**Ich habe den Saum zweimal abgedunkelt, und beide Male zu Unrecht.**
`tools/moossaum.mjs` misst den Unterschied über die Umrisslinie einer
differenziellen Maske und meldete +22,8 Stufen. Daraufhin habe ich
0xd9cba9 → 0xc0b496 → 0xa59b81 gezogen.

Der Fehler steckt im Maß: **Die Maske eines Rings berührt außen den Himmel und
innen den Kies.** Ihr Mittelwert mischt zwei Nähte, von denen nur eine gemeint
war — der helle Himmel außen hat den Wert nach oben gezogen, und ich habe
innen dagegen angearbeitet. Nach dem zweiten Schritt stand der Saum 38 Stufen
zu dunkel.

**Der zweite Fehlgriff war das Werkzeug dagegen.** Ein Blick senkrecht von oben
schien der saubere Weg — keine Perspektive, kein Himmel. Er ist es nicht:
`lockCamera` setzt `camera.up` fest auf (0, 1, 0), und bei senkrechtem Blick
steht das parallel zur Blickrichtung. `lookAt` ist dort entartet, und die
Bildorientierung fällt zufällig aus. Zwei Läufe desselben Standes lieferten
170,8 und 148,5 für dieselbe Fläche — einen Unterschied, den ich beinahe einer
Farbänderung zugeschrieben hätte, die diese Fläche gar nicht berührt.

`tools/bodennaht.mjs` blickt deshalb aus 45 Grad: steil genug, dass die Naht
nicht verschmiert, weit genug von der Senkrechten, dass `up` eindeutig bleibt.
Damit war es in einem Lauf entschieden.

### Ergebnis

    Sprung ueber die Naht bei r = 20 m (tools/bodennaht.mjs, 45 Grad)
    Ausgangsstand                       5,0 Stufen
    nachher                             2,4 Stufen

Der Tonsprung war also von Anfang an klein — **fünf Stufen**, nicht zweiund­
zwanzig. Sichtbar war die Naht als **Strukturgrenze**: gekörntes Bett gegen
glatten Ring. Genau die ist geschlossen.

    Draw-Calls      95 → 95        unveraendert
    Dreiecke    94 392 → 94 392    unveraendert
    Textur       21,53 → 21,86 MB  (+0,33 fuer die Kornkarte des Saums)

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,010 %. Build
grün, Konsole frei von Errors und Warnings.

### Und noch ein eigener Fehler

`tools/naht.mjs` gab es bereits — ein Werkzeug aus dem Nachthimmel-Auftrag, das
den leuchtenden Saum auf der Gratlinie misst. Ich habe es überschrieben. Das
Original ist aus dem Git wiederhergestellt, das neue heißt
`tools/bodennaht.mjs`. Wer ein Werkzeug anlegt, sieht vorher nach, ob der Name
frei ist.

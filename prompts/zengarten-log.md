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

## Paket J — Die Krone: der Kern des Befunds ist widerlegt (Prüferbefund 10)

Der Prüfer hat vier Dinge zusammengefasst, und der schwerste Vorwurf war
dieser: „In `f-grove` steht **die Sonne direkt hinter dem Baum**, trotzdem ist
die Krone auf der Kameraseite gleichmäßig hell wie frontal beleuchtet — keine
Verdunkelung, kein Randlicht, keine Durchleuchtung. Das indirekte Licht ist so
flach eingestellt, dass die Lichtrichtung im Laub verschwindet."

### Gemessen: die Durchleuchtung ist da, und sie steht nahe ihrem Maximum

`tools/gegenlicht.mjs` liest den Blickterm des Laub-Shaders aus und setzt die
Transluzenz differenziell auf 0, auf den Stand und auf das Dreifache:

    Blickachse * Lichtrichtung        +0,912   (in die Sonne — der Pruefer
                                               hatte mit der Geometrie recht)
    geometryViewDir * lightDir        −0,912   → fView = 0,912, fView² = 0,83

    Staerke der Transluzenz    Mittel im Kronenkasten
    x 0                        139,0
    x 1                        155,3
    x 3                        164,0

Die Durchleuchtung trägt also **16,3 Stufen** bei, und der Blickterm steht bei
83 Prozent seines Höchstwerts. Der Befund „keine Durchleuchtung" ist damit
widerlegt. Er ist auch erklärbar: Bis zum Insel-Paket, in dem das Vorzeichen
dieses Terms korrigiert wurde, lief er tatsächlich auf seinem Sockel — die
Korrektur steht in `src/dojo/foliage.js` und gilt für alle drei Umgebungen mit
Laub.

**Zwei eigene Fehler auf dem Weg dorthin.** `gegenlicht.mjs` ist an der Insel
entstanden und hatte `env-island` an zwei Stellen fest verdrahtet. Im
Zen-Garten hat es damit die Uniforms der **unsichtbaren** Insel verstellt und
den Garten gemessen — und meldete folgerichtig für x0, x1 und x3 denselben
Wert auf die Nachkommastelle. Das sah aus wie „die Transluzenz wirkt gar
nicht" und war ein Fehler im Messgerät. Dasselbe galt für die Leuchte, aus der
die Sonnenrichtung gelesen wird: Sie kam aus der Insel, und der Blickterm las
sich als −0,044 statt −0,912.

### Was von dem Befund bleibt, und was daran geändert ist

Richtig bleibt: „Kein Astwerk innerhalb der Krone — die Äste brechen abrupt an
der Blob-Kante ab." Der naheliegende Weg dagegen ist hier schon einmal gegangen
und wieder verworfen worden: `astwerk()` hatte Nebenzweige, und der Kommentar
dort sagt, warum sie fielen — „wo das außerhalb der Blattmasse lag, stand ein
abstehender Stab in der Luft. Ein Ast, der ins Nichts zeigt, ist schlimmer als
gar keiner."

Ein **Kronenansatz** ist der Ausweg: Er bringt seinen Ast *und* seinen Schopf
mit, kann also nirgends ins Nichts zeigen. Drei neue, weiter außen und tiefer
als die acht davor und kleiner:

    zen-sakura-karten (f-grove, ohne Schlagschatten)
                        Zackigkeit    innen-aussen
    vorher                 15,76         −12,68
    nachher                17,30          −5,12

Die Silhouette wird um zehn Prozent unruhiger, und der Tonabstand der Krone zu
dem, was sie umgibt, sinkt von 12,7 auf 5,1 Stufen — sie liest weniger als
ausgestanzte Fläche.

    Draw-Calls      95 → 95        unveraendert (die Schoepfe sind Instanzen)
    Dreiecke    94 392 → 96 744    (+2 352)
    Textur       21,86 → 21,86 MB  unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

**Offen:** Die treppigen Alpha-Ränder an der Silhouette. Sie kommen vom
Alpha-Test der Blattkarten; ein weicherer Übergang hieße Alpha-Blending, und
das hieße Sortierung — für eine Krone aus überlappenden Karten ist das kein
kleiner Schritt.

## Paket K — Jeder Stein war derselbe Stein, in der Form (Prüferbefund 11)

Der Prüfer: „Glatte, abgerundete Kartoffelformen, alle in derselben
Achsproportion, alle in dunklem Braunschwarz, ohne Kanten, Bruchflächen,
Schichtung oder Charakter. In einem Zen-Garten ist der einzelne Stein das
kompositorische Hauptmotiv — hier sind es austauschbare Kiesel."

Der **Ton** war in einem früheren Durchlauf schon gestreut (fünf Grundtöne,
nach einer Messung von G/R und B/R über alle Findlinge). Die **Form** nicht:

    weatheredStoneGeometry(new THREE.IcosahedronGeometry(size, 1), rand() * 1000, {
      amount: 0.26,
      frequency: 2.2,
      bevel: 0.3,

Diese drei Zahlen standen für alle sieben Findlinge, alle sechzehn Ufersteine,
alle sieben Trittsteine und die Laternensteine auf demselben Wert. `bevel: 0.3`
ist dabei der Grund, warum jeder Stein rund war: Er nimmt die Kante zurück.

### Was geändert wurde

Die drei Formzahlen kommen jetzt aus dem Samen, der ohnehin gezogen wird —
**keine neue Ziehung**, denn jede würde alles verschieben, was danach im Garten
gebaut wird:

    amount      0,18 … 0,40   von gedrungen bis zerklüftet
    frequency   1,5  … 3,7    grobe Bruchflächen gegen kleinteilige Verwitterung
    bevel       0,12 … 0,42   der wichtigste: kleiner Wert laesst die Kante stehen

Dazu ist die Grundfläche nicht mehr rund: `scale.x` und `scale.z` laufen von
0,78 bis 1,28, aus demselben Strom. Ein Findling hat eine Länge und eine
Breite.

### Ergebnis, und warum die naheliegende Zahl hier in die Irre führt

    zen-findlinge (c-torii, ohne Schlagschatten)
                       Zackigkeit    Kantensprung
    vorher                5,61          49,49
    nachher               5,78          46,11

Der Umriss aller Findlinge zusammen wird um drei Prozent unruhiger — wenig.
**Und ein einzelner Stein wurde messbar glatter:** Über den vorderen Findling
in `c-torii` fiel der Nachbarunterschied von |dx| 1,68 auf 1,47 und die
Streuung von 27,3 auf 23,1.

Das ist kein Rückschritt, sondern genau der Punkt: Dieser Stein hat aus seinem
Samen einen niedrigen `amount` gezogen und ist jetzt der ruhige unter den
sieben. Wer die Wirkung dieses Pakets an einem Stein misst, misst die
Ziehung. Sichtbar wird sie erst über mehrere — in `d-aerial` haben die beiden
Blöcke rechts der Mitte jetzt eine scharfe Gratlinie und eine ebene
Bruchfläche, wo vorher zwei Kiesel lagen.

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 4 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

**Offen aus diesem Befund:** die „harten weißen Glanzflecken" auf mehreren
Felsen, die der Prüfer als ausgefressene Spekular-Punkte beschrieben hat. In
den aktuellen Bildern finde ich sie nicht wieder; ob sie an den genannten
Stellen je standen oder ob ein früheres Paket sie beseitigt hat, ist nicht
geklärt. Und die Ufersteinkette ist weiterhin gleichmäßig verteilt — die
Streuung sitzt jetzt in der Form, nicht im Abstand.

## Paket L — Zwei Jahreszeiten zehn Meter auseinander (Prüferbefund 12)

Der Prüfer: „Blühende Sakura (Frühling) und leuchtend orangeroter Ahorn
(Herbst) stehen zehn Meter auseinander. Das bricht den ‚ein Ort, eine Zeit'-Test
bei einem japanischen Garten sofort. Zusätzlich sind genau diese beiden
Elemente die einzigen gesättigten Farben der Szene und fallen aus dem sonst
sehr disziplinierten Sand-Salbei-Oliv-Klang heraus."

### Das ist eine Entscheidung und keine Fehlerbehebung — deshalb steht sie hier

Der Widerspruch ist echt, und der naheliegende Ausweg wäre, einen der beiden
Bäume aufzugeben. Das kostet den einzigen Farbakzent der Szene neben dem Torii.

Es gibt einen dritten Weg, und er ist botanisch und nicht erfunden: Japanische
Ahorne der Sorten **'Deshojo'** und **'Shindeshojo'** treiben im April in einem
Karmesinrot aus, das erst später ins Grüne umschlägt. Ein solcher Baum steht
neben einer blühenden Kirsche in derselben Woche. Der Unterschied zum
Herbstlaub liegt im Farbton: weg vom Orange bei rund 20 Grad, hin zum Karmesin
bei 355 bis 5 Grad.

    Hüllkörper    0x9c3f22 0xb0512a 0x8a3520  →  0x8e3034 0xa03d3e 0x7c262c
    Blattkarten   cremeorange                 →  rosé
    Gegenlicht    0xd98f45 (Bernstein)        →  0xe0837a (Rosé)

**Der Nebeneffekt ist die halbe Antwort auf den zweiten Teil des Befunds.** Der
Prüfer hat das Magenta der Lotusblüten als „Signalton, der im Abendlicht
nirgendwo eine Entsprechung hat" bemängelt. Jetzt hat er eine: Der Ahorn steht
in derselben Familie.

### Ergebnis

Gemessen in `d-aerial` über den Farbton aller Bildpunkte mit einer Sättigung
über 0,45 (die Zahlen enthalten auch das Torii und die warmen Sandschatten,
sind also nicht der Baum allein):

    Farbtonband        vorher   nachher
    orange   10–40°     6840     5399
    rot     350–10°     3711     4985
    mittlere Saettigung  0,746    0,735

Rund 1400 Bildpunkte wandern vom Orange ins Rot, und die Sättigung in diesem
Bereich sinkt leicht.

    Bild        geaenderte Bildpunkte
    d-aerial          0,42 %
    a-eyelevel        0,07 %   (nur der aeusserste rechte Bildrand)
    b-pond, c-torii, e-sand, f-grove   bitgleich

**Und das ist selbst ein Befund:** Der Ahorn kommt in **zwei von sechs** festen
Kameras überhaupt vor, in einer davon nur mit dem Rand seiner Krone. Ein Baum,
der als einer von zwei Farbakzenten geführt wird, steht damit in zwei Dritteln
der Prüfbilder außerhalb. Das gehört zu Befund 15 (Komposition) und steht dort
noch aus.

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 7 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

**Falls der Frühlingsahorn nicht gewollt ist:** Es sind drei Farbwerte und eine
Gegenlichtfarbe in `mapleMaterials()` und `makeMaple()`; die alten stehen im
Commit daneben.

## Paket M — Die weißen Punkte waren kein Blütenblatt (Prüferbefund 13)

Der Prüfer hat unter „Der Garten ist unbelebt" fünf Dinge aufgezählt. Drei
davon sind nachgesehen und stimmen nicht, eines stimmt und ist behoben.

### Was nicht stimmt

**„Keine Fische im Teich."** Doch: `koi-flossen` und `koi-augen` sind in
`b-pond` mit 29 und 14 Bildpunkten im Bild. Sie sind klein und liegen unter
der Wasserfläche — dass man sie übersieht, ist ein Kompositionshinweis, aber
kein fehlendes Element.

**„Kein Windzeichen im Laub, alle Halme und Kronen stehen perfekt senkrecht."**
Der Wind steht im Scheitel-Shader des Laubs (`windStrength` 0,085 für die
Sakura, 0,07 für den Ahorn, 0,11 für den Bambus), und `updateFoliage(time)`
zählt ihn im `update()` dieser Umgebung hoch. **Ein Standbild kann das nicht
zeigen**, und der Prüfstand friert die Zeit auf 6,0 ein. Der Befund ist aus
einem Standbild nicht zu erheben — weder als richtig noch als falsch.

**„Die fliegenden Partikel erscheinen weiß statt rosa."** Die Blütenblätter
sind rosa (Karte von 255|228|238 bis 246|178|203). Die weißen Punkte, die er
an fünf Bildkoordinaten angegeben hat, sind **gar keine Blütenblätter**: Die
differenzielle Maske von `zen-blueten` ist an diesen Stellen leer.

### Was es wirklich war

Ein Knotentest über alle Kinder der Umgebungsgruppe — jedes einzeln
ausgeblendet, gemessen wird der eine Bildpunkt — hat es gefunden: Es sind die
**Staubpartikel**, ein `THREE.Points` ohne Namen. Siebzig additive Körner über
±12 m und bis 3,3 m Höhe, `fog: false`, Größe 0,08.

Drei Dinge machten daraus Bildfehler:

* **Sie standen überall.** Die Hälfte schwebte über der Horizontlinie und wurde
  gegen den hellen Himmel gezeichnet. Ein Staubkorn ist additiv — gegen einen
  Himmel von L 190 ist es in der Natur unsichtbar. Sichtbar wird Staub im
  Gegenlicht vor einem **dunklen** Grund.
* **Sie wurden mit der Entfernung nicht schwächer.** Ohne Nebel und additiv war
  ein Korn in 20 m so hell wie eines in 2 m — nur zwei Bildpunkte groß. Zwei
  helle Bildpunkte im leeren Himmel sind ein toter Bildpunkt.
* **Siebzig Stück** über diese Fläche ergeben ein Sternenfeld.

Jetzt ±7 m, Höhe 0,25 bis 1,5 m (also unter der Horizontlinie der
Augenhöhenkamera), fünfundvierzig gezeichnet, Größe 0,12. Und der Knoten heißt
`zen-staub` — ohne Namen hat mich die Suche drei Läufe gekostet.

Nebenbei am selben Punkt: Der Alphatest der Blütenblätter stand auf 0,45. Auf
sechs Bildpunkten Kantenlänge greift die Karte in eine Mipstufe, in der die
Deckkraft über die durchsichtige Umgebung gemittelt ist; bei 0,45 fällt fast
das ganze Blatt weg. 0,22 statt 0,45, dazu ein rosa `color` — die Fläche der
Blätter in `a-eyelevel` steigt von 1215 auf 2236 Bildpunkten.

### Ergebnis

    isolierte Lichtpunkte im freien Himmel (a-eyelevel, Kasten 850,60-1270,330)
    vorher     21
    nachher     2

    Blattflaeche zen-blueten (a-eyelevel)   1215 → 2236 Bildpunkte

### Und ein Fehler von mir, der teurer war als der Befund

Der erste Anlauf hat die Staubschleife von 70 auf 45 verkürzt. Das sind fünf
Ziehungen je Korn, also **125 Ziehungen weniger** aus dem Zufallsstrom des
Gartens — und damit verschiebt sich alles, was danach daraus gebaut wird.
Gemessen: **18 bis 50 Prozent geänderte Bildpunkte in allen sechs Kameras**
statt der erwarteten paar Staubkörner. Die Schleife zieht jetzt weiter
siebzigmal und zeichnet fünfundvierzig.

Diese Lehre steht seit dem Insel-Log an drei Stellen, und ich bin trotzdem
hineingelaufen. Aufgefallen ist sie nur, weil der Regressionsvergleich zu jedem
Paket gehört; ohne ihn wäre eine stillschweigend umgebaute Szene entstanden.

    Bild        geaenderte Bildpunkte (nach der Korrektur)
    a-eyelevel        0,49 %
    f-grove           0,51 %
    b-pond            0,19 %

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 7 bei 0,011 %. Build
grün, Konsole frei von Errors und Warnings.

**Offen:** die gefallenen Blätter auf dem Sand, die der Prüfer als „winzige
flache Farbtupfer, eher wie Schmutz" beschrieben hat. Sie sind dasselbe
Alphatest-Problem eine Stufe kleiner und stehen noch aus.

## Paket N — Die harte Bande am Horizont, und eine Änderung, die wieder ging (Prüferbefund 14)

Der Prüfer hat zwei Dinge gemeldet. Eines ist behoben, beim anderen bin ich
gescheitert und habe die Änderung zurückgenommen.

### Die Bande am Horizont — und sie war meine eigene

„Der Horizont selbst ist keine Auflösung, sondern eine harte helle Bande: Sand
und Himmel treffen auf einer scharfen Linie mit einem weißlichen Saum darüber
aufeinander."

Gemessen in `a-eyelevel`, Mittelwert über die Spalten 880 bis 1150:

    y      348    351    354    357    360    363    369    372
    L    180,7  179,5  178,0  175,0  171,9  170,2  197,5  192,4

Ein Sprung von **27,3 Stufen auf sechs Bildzeilen**. Und die Ursache ist nicht
die, die der Prüfer vermutet hat, sondern **der Hügelzug aus Paket C**: Seine
Füße liegen bei y = −0,35 und schneiden den Saum in einer geraden Linie, und
weil die Hügel mit L 170 bis 189 dunkler sind als der genebelte Boden davor
(197,5), stand dort eine Kante. Ich habe sie selbst gebaut, zwei Pakete vorher,
und im Bild von Paket C nicht gesehen.

Ein Hügelzug in 40 m Entfernung hat keinen sichtbaren Fuß — er beginnt dort, wo
der Dunst aufhört, ihn zu verschlucken. Die untersten dreißig Prozent der Kuppen
laufen jetzt in die Nebelfarbe 0xecd9bb, dieselbe, die `scene.fog` trägt. Das
ist kein Ersatz für Nebel, sondern seine Fortsetzung: Der Nebel sättigt erst bei
46 m, die Füße stehen bei 33.

    y      348    351    354    357    360    363    366    369
    L    180,7  179,5  178,6  181,7  184,5  188,3  193,5  198,5

    groesster Sprung im Band   27,3 → 6,7 Stufen

### Und eine Änderung, die ich zurückgenommen habe

„Die Wolken sind ausschließlich dünne, exakt waagerechte, parallele Schlieren in
immer derselben Stärke und Größe — keine Ballung, keine Maßstabsvariation."

Der Ansatz: eine Modulation der Wolkenstärke über den Azimut mit **einem**
Umlauf. Die schließt sich von selbst (keine senkrechte Naht) und sollte aus dem
gleichmäßigen Schleier eine bewölkte und eine offene Himmelshälfte machen.
Gebaut, gemessen — und wieder entfernt:

    Wolkenkorn (Hochpass) in einer Rundumsicht, freie Himmelsrichtungen
    Azimut       0     30     60     90    120    150    180
    vorher    0,381     —      —   0,216     —      —   0,209
    nachher   0,299  0,161  0,162  0,166  0,198  0,189  0,187

Das Verhältnis zwischen der wolkigsten und der klarsten Richtung bleibt bei
1,8 — **die Ballung ist in der Messung nicht zu sehen.** Was messbar ist: rund
zwanzig Prozent weniger Wolke insgesamt. Eine Änderung, die ich nicht als
Verbesserung zeigen kann, deren Preis aber messbar ist, gehört nicht in den
Code; auch der ungenutzte Uniform-Satz nicht. Zurückgenommen, mit den Zahlen.

**Was ich nicht ausgeschlossen habe:** dass die Ballung wirkt und mein Maß sie
nicht sieht. Das Wolkenband liegt zwischen 3 und 25 Grad über dem Horizont, die
Messkästen greifen bei 14 bis 27 Grad — also nur den oberen Rand. Ein Maß, das
den ganzen Streifen erfasst, könnte anders ausfallen. Solange es das nicht gibt,
bleibt der Befund offen und der Code unverändert.

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,010 %. Build
grün, Konsole frei von Errors und Warnings.

## Paket O — Komposition: gemessen, und dann nicht entschieden (Prüferbefund 15)

Der Prüfer: „`c-torii` ist gut komponiert. `a-eyelevel` dagegen legt den
Horizont fast mittig und lässt die obere Bildhälfte vollständig leer. `d-aerial`
zeigt, dass die Anlage in der Fläche keine Ordnung hat — die Objekte liegen als
lockere Traube ohne Achse, ohne Blickbeziehung Torii→Teich, ohne Wegführung,
die irgendwo hinführt. Der Weg der Trittsteine endet im Nichts."

### Was gemessen ist

Fläche jedes Merkmals in jeder festen Kamera, in Bildpunkten seiner eigenen
differenziellen Maske:

    Merkmal            a-eye   b-pond  c-torii  d-aerial  e-sand  f-grove
    zen-torii           8 693  24 495   18 552   10 442   14 722   8 894
    zen-wasser         12 178  77 347   70 957    7 526    6 426   6 525
    zen-trittsteine    23 437  23 209    6 791    1 993   37 195  12 090
    zen-laterne-stein   1 635   9 349    8 091      903    2 579   3 382
    zen-sakura-karten  28 024       –        –   10 323    3 976  19 669
    zen-ahorn-karten      611       –        –    4 953        –       –

**Vier Merkmale stehen in allen sechs Bildern** — Torii, Wasser, Trittsteine,
Laterne. So haltlos, wie der Befund klingt, ist die Anlage also nicht: Sie hat
einen Kern, den man aus jeder Richtung sieht.

**Der Ahorn ist der Ausreißer.** Er kommt in **zwei von sechs** Kameras vor, in
einer davon mit 611 Bildpunkten — dem äußersten rechten Bildrand. Ein Baum, der
als einer von zwei Farbakzenten gebaut ist, steht in zwei Dritteln der
Prüfbilder außerhalb.

### Was ich nicht ändere, und warum

**Die Bildausschnitte sind eingefroren.** In `harness-common.mjs` steht über den
Zen-Kameras: „DIESE WERTE DÜRFEN SICH ÜBER ALLE DURCHLÄUFE NICHT ÄNDERN – sonst
sind die Vergleichsbilder wertlos." Der Befund an `a-eyelevel` — Horizont
mittig, obere Bildhälfte leer — ist damit nicht mein Fehler zu beheben, sondern
eine Eigenschaft des Prüfstands. Ein besserer Ausschnitt wäre eine **zusätzliche**
Kamera, kein geänderter.

**Und die Anlage umzustellen ist keine Messfrage.** Den Ahorn in die Blickachse
zu rücken oder den Trittsteinpfad vom Torii zur Laterne zu führen, sind
Entscheidungen über den Garten, nicht Korrekturen an ihm — dieselbe Art
Entscheidung wie die Gartenmauer, die in Durchlauf 12 auf Zuruf gefallen ist.
Zwei Dinge sprechen dagegen, sie allein zu treffen:

* Der Trittsteinpfad trägt `e-sand` (37 195 Bildpunkte, die größte Fläche eines
  Merkmals in irgendeinem Bild) und `a-eyelevel` (23 437). Ihn zum Torii zu
  verlegen nimmt beiden Bildern ihren Vordergrund.
* Der Ahorn steht bei (4,8 | 3,2), also hinter allen Bodenkameras. Ihn nach
  vorn zu holen ändert die Silhouette jeder einzelnen Ansicht.

**Beides liegt damit beim Nutzer.** Die Zahlen dafür stehen oben; die Änderung
selbst ist in beiden Fällen klein — eine Position und eine Pfadgleichung.

    Kein Eingriff in diesem Paket. Draw-Calls 95, Dreiecke 96 744,
    Textur 21,86 MB.

## Stand nach fünfzehn Befunden

Prüferbefunde 1 bis 15 sind abgearbeitet: elf behoben, zwei widerlegt (die
Durchleuchtung der Kronen, „ein Rotton" am Torii), eine Änderung nach der
Messung zurückgenommen (die Wolkenballung), eine Entscheidung an den Nutzer
zurückgegeben (die Komposition).

Ausdrücklich offen, jeweils mit Begründung an ihrer Stelle im Log:

* Ein erkennbares Spiegelbild im Teich (braucht eine ebene Spiegelung oder
  einen Schablonendurchgang — die Umgebungskarte kann es nicht).
* Die treppigen Alpha-Ränder der Blattkarten (bräuchte Alpha-Blending und
  damit Sortierung).
* Kantenlichter und Fasen am Torii.
* Der Mustersprung im Harkbild links oben in `d-aerial`.
* Die gefallenen Blätter auf dem Sand als „Schmutz".
* Die Ufersteinkette mit gleichmäßigem Abstand.
* Und 21 der 23 zusätzlichen Shader-Programme, die der Teichspiegel kostet.

Budget: **95 von 120 Draw-Calls, 96 744 von 350 000 Dreiecken, 21,86 von 60 MB
Textur** (dazu 6 MB Umgebungskarte, die bis Paket B in keiner Zählung stand).
Die größte einzelne Reserve bleibt der Bambushain: dreizehn Draw-Calls, weil
jeder Halm ein eigenes Netz ist.

## Zweite Prüferrunde — was er von selbst als besser meldet, und was er neu findet

Der Prüfer hat die sechs Bilder ein zweites Mal beurteilt, **ohne seine alte
Liste**. Was er dabei ungefragt als verbessert nennt, ist die verlässlichste
Auskunft über die fünfzehn Pakete:

> „Der Sand im Nahbereich … das beste Material der Szene. **Klarer Fortschritt
> gegenüber meinem früheren Eindruck.**"
> „Weiche Schatten mit Halbschatten und stellenweise Blattdurchbrüchen … **Auch
> das deutlich besser als früher.**"
> „Die Komposition in `d`: Die Diagonale Bambushain → Teich mit Laterne → Ahorn
> führt den Blick … **Die Anordnung ist gut**; ihr fehlt nur die Fassung."

Sein Urteil in Zahlen: Boden 80 %, Licht 65 %, Wasser und Vegetation 35 %,
Ortsdefinition 20 % gegenüber einem sehr guten stilisierten Echtzeit-Renderer.

### Zwei seiner Befunde sind nachgemessen und falsch

**„Das Torii wirft keinen Schatten."** Er hat bei (560,380) nachgesehen, also
direkt unter dem Tor. Differenziell gemessen — `castShadow` aus und wieder an —
wirft es sehr wohl: **3496 Bildpunkte, mittlere Verdunklung 59,7 Stufen,
größte 132**, mit dem Schwerpunkt bei (867,408). Die Sonne steht tief und
links; der Schatten liegt neun Meter weiter rechts, nicht unter dem Bauwerk.
Auch die Laterne wirft (587 Bildpunkte, 11,5 Stufen) — schwächer, aber
vorhanden.

**„Keine Durchleuchtung im Laub."** Steht schon unter Paket J mit Zahlen; der
Blickterm liegt bei 0,83 seines Höchstwerts, die Transluzenz trägt 16,3
Stufen. Dass er den Effekt trotzdem nicht sieht, heißt: **16 Stufen sind zu
wenig**, um im Gegenlicht als Glühen zu lesen. Das ist ein anderer Befund als
„fehlt", und er steht damit wieder offen.

## Paket P — Ein Trittstein war ein weißes Blatt Papier

Sein Befund 5, und der beste des zweiten Durchgangs: „Die Deckfläche dieses
Steins ist geklipptes Weiß ohne jede Zeichnung, direkt daneben eine fast
schwarze Seitenfläche."

Gemessen im Kasten 0,455–74,495 von `e-sand`: **27,7 Prozent der Fläche auf 255
geklippt**, Median 212 gegen p05 26. Und im Ausgangsstand `zen-16` stand
dasselbe da (Median 219, p95 255) — der Fehler ist alt und war fünfzehn Pakete
lang unter meiner Nase.

### Die Ursache, in drei Schritten gemessen

Ein Durchgang über alle Leuchten der Umgebung, jede einzeln auf null:

    alles an                  Median 212   Anteil 255: 27,7 %
    ohne HemisphereLight      Median 204   Anteil 255: 26,2 %
    ohne die Hauptsonne       Median  56   Anteil 255:  0,0 %
    ohne das Fuelllicht       Median 212   Anteil 255: 27,7 %
    ohne die Punktleuchte     Median 212   Anteil 255: 27,7 %
    ohne die App-Leuchten     Median 208   Anteil 255: 27,3 %

Es ist allein die Hauptsonne mit Stärke 4,1. Die Kette dahinter: Die Kamera
steht 45 cm über dem Boden und sieht die Deckfläche **fast von der Kante** —
bei streifendem Blick geht der Fresnel-Anteil gegen eins —, und bei Rauheit
0,66 ist die Glanzkeule breit genug, dass die ganze Fläche darin liegt.

### Was geändert wurde

`zenGranite().roughness` von 0,66 auf 0,80. Die Reihe:

    Rauheit   Median   Anteil 255
    0,66        212      27,7 %
    0,80        210       0,0 %
    0,95        192       0,0 %
    1,00        181       0,0 %

0,80 nimmt das Ausbrennen vollständig weg und kostet zwei Stufen im Median. Und
die Lichtspitze, um derentwillen 0,66 einmal gewählt wurde, geht nicht
verloren: Auf den Findlingen liegt der Anteil über L 230 bei 0,66 **wie** bei
0,80 auf 0,00 Prozent — die Spitze war dort ohnehin nie.

    Trittstein in e-sand    Mittel 170,8 → 163,5   p95 255 → 246   max 255 → 254

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 5 bei 0,008 %. Build
grün, Konsole frei von Errors und Warnings.

### Die Liste der zweiten Runde, für den nächsten Durchgang

Neu oder wieder gemeldet, nach seiner Reihung: 1 keine Umgrenzung (und sein
neues Argument dazu: „dann müsste der Sand außerhalb aufhören, geharkt zu sein
— dass die Rillen bis zum Horizont durchlaufen, macht daraus einen Fehler statt
einer Aussage"), 2 Wasser als Milchglasplatte mit unmotiviertem Farbwechsel
zwischen den Kameras, 3 Alpha-Treppenkanten und zu schwaches Durchlicht im
Laub, 4 Bambusblätter als Kugeln, **5 erledigt**, 6 geklonte Trittsteine, 7
Sakura-Schatten als strukturloser Klecks mit Banding, 8 widerlegt, 9 Harkrillen
an den Trittsteinen und ein Systemsprung im Harkbild, 10 zu große und zu helle
Punkt-Sprites bis auf die fernen Hügel, 11 Moos mit gerader Plattenkante, 12
neutralgraue Schatten ohne kühles Indirektlicht, 13 speckiger Glanz auf den
Steinen, 14 Nebel frisst den Mittelgrund, 15 Laternenschein als flache Scheibe,
16 Seerosen ohne Kontaktschatten, 17 kaum Leben unter Wasser.

## Paket Q — Das Harkfeld hat jetzt einen Rand (zweite Runde, Befund 1)

Der Prüfer wollte eine Umgrenzung. Die Mauer ist auf Nutzerwunsch draußen, und
das bleibt so — aber sein Argument diesmal war ein anderes und ein besseres:

> „Dann müsste der Sand außerhalb aufhören, geharkt zu sein. Dass die Rillen
> bis zum Horizont durchlaufen, macht daraus einen Fehler statt einer Aussage."

### Zuerst: seine Beobachtung stimmt so nicht

Ein Blick von 6 m Höhe schräg über den Sand, Feinstruktur in dreizehn
Entfernungsbändern (`tools/hochpass-reihe.mjs`), einmal mit und einmal mit
`uSandTiefe = 0`, also ohne jede Harkung:

    Entfernung     4,8   6,0   7,6   9,8  11,2  12,9  15,2  18,3  22,5 m
    mit Harke     6,37  8,04  5,03  6,94  2,66  2,48  2,63  2,22  0,39
    ohne Harke    4,05  4,56  3,12  3,02  1,85  2,34  2,63  2,22  0,39

**Ab 12,9 m sind beide Reihen identisch.** Was dort draußen noch Struktur hat,
ist das Korn des Sandes, nicht die Harke. Die Rillen laufen also nicht bis zum
Horizont — sie sind bei dreizehn Metern zu Ende.

### Und trotzdem hat er recht, nur auf dem Zielgerät

Die Ausblendung hängt an zwei Dingen: an `grenze` (dem Ort) und an `scharf`
(der Auflösung, über `fwidth`). Bei 1280×720 und 70° Bildwinkel hat der
Prüfstand **10,3 Bildpunkte je Grad**; `scharf` erledigt die Spur dort schon
bei dreizehn Metern, und `grenze` mit seinem sechs Meter breiten Auslauf kommt
gar nicht mehr zum Zug.

Eine Quest 3 hat je Auge 2208 Bildpunkte auf rund 96 Grad, also **23 je Grad**
— gut das Doppelte. `fwidth` ist dort halb so groß, die Spur überlebt also
etwa die doppelte Entfernung: bis rund 29 m. **Die Sandscheibe hat 20 m
Halbmesser.** Auf dem Zielgerät läuft die Harkung damit tatsächlich bis an den
Rand der Scheibe und darüber hinaus in den Saum — genau das Bild, das der
Prüfer beschreibt, nur dass er es aus einem Bild erschlossen hat, in dem es
nicht steht.

### Was geändert wurde

Der Auslauf von `grenze` von ±3,0 m auf ±0,7 m. Damit endet das geharkte Feld
in einer Kante statt in einem Ausklingen. Eine Kreislinie wird daraus nicht:
Der Ort schwankt über den Azimut um ±5 m.

Gemessen bei **25° Bildwinkel** — 28,8 Bildpunkte je Grad, also etwas mehr als
die Brille —, dieselbe Bänderreihe:

    Band bei 12,7 m   3,371 → 2,680   (−20 %)
    Band bei 13,5 m   2,640 → 2,225   (−16 %)
    alle Baender dahinter   unveraendert

Bei 70° Bildwinkel ist die Änderung fast unsichtbar (0,08 bis 0,24 % geänderte
Bildpunkte in fünf der sechs Kameras), in `d-aerial` mit seinem steilen Blick
dagegen deutlich (10,4 %). **Das ist der Punkt dieses Pakets:** Eine Änderung,
die im Prüfstand kaum etwas tut und auf dem Zielgerät die Hälfte des Befunds
erledigt. Ohne die Rechnung über die Winkelauflösung hätte ich sie für
wirkungslos gehalten und wieder herausgenommen — so wie die Wolkenballung.

Im Bild von `d-aerial` endet die Spur jetzt in einer unregelmäßigen Linie, und
dahinter liegt glatter Kies.

    Draw-Calls      95 → 95         unveraendert
    Dreiecke    96 744 → 96 744     unveraendert
    Textur       21,86 → 21,86 MB   unveraendert

Insel, Nachthimmel und Matrix **bitgleich**, Dojo Δmax 4 bei 0,009 %. Build
grün, Konsole frei von Errors und Warnings.

### Und zum fünften Mal derselbe eigene Fehler

Ein Backtick in einem GLSL-Kommentar innerhalb eines Template-Literals.
`tools/shaderlint.mjs` hat ihn als `prebuild` gefangen, wie jedes Mal. Die
Regel für mich, damit es ein sechstes Mal nicht gibt: **In GLSL-Kommentaren
keine Backticks für Bezeichner** — der Name wird ausgeschrieben oder in
Anführungszeichen gesetzt. Der Preis dafür, sie zu vergessen, ist eine Seite,
die nicht lädt, und die Fehlermeldung sagt „missing ) after argument list".

## Paket R — Das Durchlicht im Laub: drei Hebel gemessen, keiner trägt

Der Prüfer hat in beiden Runden dasselbe gemeldet: „Die Sonne steht direkt
hinter der Sakura, trotzdem gibt es keinerlei Durchleuchten. Kein warmes
Aufglühen, kein Transluzenz-Saum." In Paket J hatte ich das mit Zahlen als
widerlegt bezeichnet — der Blickterm steht bei 0,83 seines Höchstwerts, die
Transluzenz trägt 16,3 Stufen bei. **Diese Bewertung war zu schnell.** Dass er
den Effekt zweimal nicht sieht, heißt: sechzehn Stufen sind zu wenig. Das ist
ein anderer Befund als „fehlt", und er stand damit wieder offen.

Drei Hebel kommen dafür in Frage. Alle drei sind gebaut, gemessen und wieder
zurückgenommen.

### Hebel 1: mehr Stärke — die Kurve lässt es nicht zu

    uTranslucency   x0     x1     x3
    Kronenmittel   139,0  155,3  164,0

Die dreifache Stärke bringt **8,7 Stufen**. Die Krone liegt bei L 155 im
flachen Teil der ACES-Kurve; dort kauft mehr Radianz kaum noch Helligkeit.
Dieselbe Lehre steht in allen drei Logs.

### Hebel 2: den Sockel senken — der Term ist schon geklemmt

`fGlow = fWrap * mix(0.40, 1.0, fView²)`. Der Sockel sagt, wie viel Leuchten
ein Blatt auch dann bekommt, wenn die Sonne im Rücken der Kamera steht. 0,40
auf 0,12 gesenkt, gemessen an zwei Kameras im selben Abstand vom Baum:

    Gegenlicht    164,1 → 163,8
    Vorderlicht   147,1 → 146,9

**Nichts.** Und der Grund steht im Code: `fWrap = pow(fBack, uTransPower)` mit
`fBack = max(0, dot(-L, N))`. Bei einem vorderlichtigen Blatt zeigt die Normale
zum Licht, `fBack` ist null, und dann ist der Sockel gleichgültig. Er greift nur
für Blätter, deren Normale vom Licht weg zeigt — und für die entscheidet
ohnehin der Blickterm. Der Sockel ist kein Hebel, er ist ein Nachkommastelle.

### Hebel 3: Kronenverdeckung — die Krone ist zu flach dafür

`verdeckung: 1.0`, der auf der Insel gemessene und gebaute Mechanismus.
Bandweise über die Sakura-Krone in `f-grove`, oben nach unten:

    vorher    170,2  163,0  162,9  195,2  187,6  142,7   Spanne 52,5
    nachher   171,1  163,7  162,7  195,3  187,6  142,7   Spanne 52,6

Ebenfalls nichts, und auch dafür gibt es einen Grund: Die Verdeckung zählt, wie
viel Laub **senkrecht über** einem Schopf steht. Die Insel hat kegelförmige
Kronen von mehreren Metern Höhe; die Sakura hier ist eine flache Kuppel von
einem Meter (Ansätze zwischen y = 2,00 und 3,04). Kaum ein Schopf hat andere
über sich, und was übrig bleibt, zieht die Mittelwertnormierung wieder ab.

### Warum keiner greift — die eigentliche Messung

    Himmel hinter der Krone   Mittel 156   p50 161   p95 176
    Krone (eigene Maske)      Mittel 151   p50 142   p95 207, max 221

Die hellsten siebzehn Prozent der Krone liegen **über** dem 95. Perzentil des
Himmels dahinter. Der Saum ist also da. Was fehlt, ist der Gegenpol: Krone und
Himmel haben praktisch denselben Mittelwert (151 gegen 156). Ein Gegenlichtbaum
liest, weil er dunkel ist und nur seine Ränder glühen — hier steht er in
derselben Tonlage wie sein Hintergrund, und der Hintergrund ist der helle
Dunsthimmel um eine tief stehende Sonne.

**Der Hebel wäre also nicht mehr Leuchten, sondern eine dunklere Krone** — und
das heißt: weniger Blattkarten, größere Lücken, mehr sichtbarer Hüllkörper.
Gemessen deckt die Kartenschicht die Hülle fast vollständig ab (19 669 gegen
1 167 Bildpunkte in `f-grove`). Das ist ein Eingriff in die Kronendichte und
damit in die Silhouette jedes Baums in drei Umgebungen — kein Nachziehen einer
Zahl. **Offen, mit dieser Begründung.**

Kein Eingriff in diesem Paket. Draw-Calls 95, Dreiecke 96 744, Textur 21,86 MB.

---

## Paket S — Der Teich war eine Milchglasplatte, und zwar aus drei Gründen

Prüferbefund 2 der zweiten Runde: *„Das Wasser ist eine opake Milchglasplatte …
Schlimmer: die Fläche wechselt die Farbe mit dem Blickwinkel unmotiviert — in
`a` fast reinweiß-hellgrau, in `c` blaugrau-grün, in `b` graugrün. Das liest
nicht als Fresnel, sondern als Fehler."*

Die drei Punktproben aus dem Bericht treffen in `a-eyelevel` Laub statt Wasser,
also war zuerst eine Maske nötig. `tools/wasserton.mjs` erzeugt sie
differenziell — Wasserfläche aus, Bild, an, Bild — und misst darin Ton,
Sättigung, Perzentile und, mit `--durchblick`, wie viel vom Beckengrund
überhaupt durchkommt.

### Befund 1: Die Deckkraft hing gar nicht an der Kamera

    Durchblick auf den Beckengrund, Stufen:
    a-eyelevel 10,5   b-pond 12,2   c-torii 9,5
    d-aerial    9,5   e-sand 10,8   f-grove 12,0

`a-eyelevel` blickt unter 11,5° über den Teich, `d-aerial` unter 31° hinein.
Auf Wasser ist das ein Unterschied um ein Vielfaches; hier war das Verhältnis
**1,1**. Genau das ist eine Milchglasplatte, und es erklärt auch die zweite
Hälfte des Befunds: Die Helligkeit schwankte über die Kameras um 54 Stufen,
aber ohne die Gegenprobe — ohne dass bei steilem Blick der Grund auftaucht —
kann das gar nicht als Fresnel lesen.

Der Grund stand in einer Zeile: `diffuseColor.a` hing allein am Radius auf der
Scheibe. Zwei Dinge kamen dazu, und die Reihenfolge ist lehrreich:

* **Schlick allein trägt zu wenig.** Mit F0 = 0,02 auf der gekräuselten
  Normale steht der Fresnelanteil bei 11,5° Blickhöhe auf 0,34. Das ist
  physikalisch richtig — Wasser reflektiert streifend eben nur ein Drittel —
  und der Durchblick bewegte sich kaum (10,5 → 11,0).
* **Der Weg durch das Wasser ist die eigentliche Größe.** Beer-Lambert rechnet
  mit der Strecke, nicht mit der Tiefe, und die ist Tiefe geteilt durch den
  Sinus des Blickwinkels. Streifend das Fünffache. Erst mit diesem Faktor
  kippte die Messung:

      Durchblick nachher:
      a-eyelevel  7,6   b-pond 12,9   c-torii  9,8
      d-aerial   11,4   e-sand  6,0   f-grove  8,6

  Verhältnis steil zu streifend jetzt **2,15** statt 0,90 — vorher stand es
  sogar verkehrt herum.

### Befund 2: Vier Fünftel des Bildes waren Spiegelung

Die zweite Messung (`--zutaten`) teilt das Bild der Fläche auf:

    Kamera        voll   Lackschicht   Umgebungskarte gesamt   ohne beides
    a-eyelevel   175,6         22,9                   144,8          38,7
    b-pond       130,9         21,6                    86,3          47,8
    d-aerial     109,3         14,6                    54,0          57,0
    e-sand       174,9         19,4                   156,9          34,0

Die Umgebungskarte lieferte **49 bis 90 Prozent** des gesamten Bildes. Eine
Fläche, die zu so einem Anteil aus einer glatten Himmelsspiegelung besteht,
landet im flachen Bereich der ACES-Kurve und verliert dort ihre Farbe — dieselbe
Lehre wie bei Wolken, Sonnenscheibe und Grasfase. Und die Gegenprobe stand
gleich daneben:

    Teichfläche   Sättigung  8,7 bis 19,0 %
    Beckengrund   Sättigung 45 bis 52 %, Ton 35–39° (warmer Sand)

Das Farbigste im ganzen Teich lag darunter und wurde von einem grauen Schleier
zugedeckt.

### Befund 3: Wasser hat eine Grenzfläche, nicht zwei

`waterMaterial()` stammt aus dem Dojo, wo es das Tsukubai-Becken trägt: dunkler
Stein unter einem Wasserfilm. Dort ist `clearcoat: 1` richtig — es sind wirklich
zwei Schichten. Ein Gartenteich ist keine beschichtete Oberfläche, und die
zweite Spiegelkeule war der Schleier.

Der Verdacht, sie trage die Kräuselung (sie hält die zweite Normalkarte), ließ
sich messen. `tools/wasserprobe.mjs` legt die Maske einmal fest und fährt dann
eine Reihe von Materialständen durch, mit einem Hochpass gegen die vier
Nachbarn als Strukturmaß — `b-pond`, 77 305 Bildpunkte:

    Ist-Stand            L 130,9   Umfang 70   Sättigung 13,2 %   Hochpass 0,90
    ior 1.333            L 128,2   Umfang 73   Sättigung 13,8 %   Hochpass 0,90
    clearcoat 0.35       L 117,8   Umfang 67   Sättigung 15,9 %   Hochpass 0,91
    clearcoat 0          L 109,3   Umfang 66   Sättigung 18,1 %   Hochpass 0,94
    envInt 0.6           L 107,4   Umfang 64   Sättigung 16,6 %   Hochpass 0,85
    ior+cc0+env0.55      L  84,2   Umfang 70   Sättigung 23,9 %   Hochpass 0,94

Der Hochpass **steigt** beim Abschalten der Lackschicht. Sie hat also nichts
aufgebrochen, sie hat zugedeckt — hier geht kein Kräuselmuster verloren. Der
grobe Regler `envMapIntensity` dagegen nimmt Struktur mit (0,90 → 0,85) und
schied damit aus, obwohl er die Sättigung ähnlich hebt. Ohne den Hochpass hätte
ich vermutlich ihn genommen.

Gewählt: `clearcoat = 0` und `ior = 1.333` (three rechnet ohne Angabe mit 1,5,
also Glas). `envMapIntensity` bleibt bei 1,0.

### Ergebnis über alle sechs Kameras

    Sättigung          vorher → nachher
    a-eyelevel   12,7 % → 13,0 %
    b-pond       14,1 % → 18,1 %
    c-torii      10,6 % → 14,1 %
    d-aerial     19,0 % → 26,2 %
    e-sand       15,5 % → 15,1 %
    f-grove      16,8 % → 16,8 %

    Binnenkontrast p95−p05, d-aerial  45 → 64
    Helligkeit streifend (a) 175,6 → 150,7, steil (d) 119,3 → 89,1

Die Spreizung zwischen streifendem und steilem Blick beträgt jetzt 62 Stufen
und hat endlich ihre Gegenprobe: streifend ein heller Spiegel, steil dunkles,
farbiges Wasser mit sichtbarem Grund. Das ist der Unterschied zwischen „wechselt
unmotiviert die Farbe" und Fresnel.

**Regression:** Insel, Matrix und Nachthimmel bitgleich (Δmax 0). Dojo Δmax 4 an
einem Punkt, 0,010 % der Bildpunkte ≥ 2 — die zeitgetriebene Kräuselung des
Tsukubai, nicht dieser Eingriff; das Dojo-Material ist unberührt, geändert wird
nur die Zen-Instanz nach dem Aufruf. Budget unverändert: 95 Draw-Calls,
96 744 Dreiecke, 21,86 MB Textur. Konsole sauber.

Bildstand `tools/shots/zen-36`.

### Nebenbefund, noch offen

`npm run build` meldet seit Längerem `IMPORT_IS_UNDEFINED` für `pfbm`,
`grainAt` und `colorTexture` in `src/dojo/ground.js` — die Namen sind in
`materials.js` vorhanden, aber nicht exportiert. Zur Laufzeit fängt das die
Rückfallkopie am Dateiende (`MAT.pfbm ?? fallbackPfbm`), es ist also kein
Fehler, aber es ist eine Warnung. Gehört ins Dojo-Paket.

---

## Paket T — Die Koi waren fünf Stufen vom Wasser entfernt

Prüferbefund 17: *„kaum Leben unter Wasser."* Das ist eine Behauptung über
Bildpunkte, und `tools/teichleben.mjs` macht sie zur Zahl — jede Lebensregung
im Teich einzeln abschalten, Bild vergleichen, Fläche und Abhebung zählen:

    b-pond      Fläche      Abhebung
    Seerosen    5232 px     17,2 Stufen
    Koi 0        413 px      5,2 Stufen
    Koi 1        377 px      4,6 Stufen

    e-sand      Koi 0          6 px     Koi 1   0 px

Zwei Fische sind da, seit Langem, mit gebogenem Körper, Flossen und Augen. Sie
waren nur nicht zu sehen: Ein Fisch, der sich um fünf Stufen vom Wasser
unterscheidet, ist nicht da. Und die Ursache war **das Absorptionsmodell aus
Paket S** — mein eigener Eingriff von vorhin. Der Weg-Faktor `pfad` machte bei
20° Blickhöhe aus 3,4 einen effektiven Koeffizienten von 9,9; die Deckkraft
stand über den Koi bei 0,89, es kamen elf Prozent von ihnen durch.

### Der eigentliche Denkfehler: Trübung ist nicht Tiefe

Beer-Lambert mit Koeffizient 3,4 beschreibt eine Wassersäule von Metern. Der
Teich hier ist keine dreissig Zentimeter tief; reines Wasser absorbiert auf
dieser Strecke praktisch nichts. Was den Grund eines Gartenteichs verdeckt, ist
Schwebstoff und die Spiegelung an der Oberfläche — und Letztere steht seit
Paket S ohnehin schon im Fresnelterm. Der Koeffizient war also doppelt gezählt
und um eine Größenordnung zu hoch.

Die Reihe (`tools/teichprobe.mjs`, Trübung als Uniform, damit die Quelle
während des Messlaufs unangetastet bleibt) fährt beide Forderungen zugleich —
`b-pond` für die Koi, `a-eyelevel` für den Durchblick, der bei streifendem
Blick klein bleiben soll:

    Trueb  Sockel      Koi 0   Koi 1   Wasser L   Sätt.   Durchblick a
    3,4  0,44/0,86       5,2     4,6      104,9   19,3%           7,5
    1,8  0,36/0,78       8,4     7,5      110,6   23,6%          11,5
    1,2  0,30/0,72      11,4     9,9      113,7   26,7%          14,6
    0,8  0,26/0,66      14,6    12,6      116,0   29,4%          17,5
    0,5  0,22/0,58      18,2    16,0      117,5   31,9%          20,7

Gewählt: **0,8 / 0,26 / 0,66**. Die Seerosen lesen bei 17 bis 20 Stufen, und
das ist der Maßstab: Bei 14,6 und 12,6 stehen die Koi in derselben Größenordnung
wie die Blätter, die im Bild unstrittig da sind.

### Der Durchblick steigt — und das war die richtige Richtung

Zuerst hielt ich den steigenden Durchblick bei streifendem Blick für den Preis.
Er ist es nicht, und die Sechs-Kamera-Messung sagt, warum:

                    Sättigung          Ton
    Kamera      Paket S → T       Paket S → T      Durchblick
    a-eyelevel   13,0 → 20,2 %     49° → 46°      7,6 → 17,5
    b-pond       18,1 → 29,6 %     68° → 50°     12,9 → 27,9
    c-torii      14,1 → 25,0 %     74° → 52°      9,8 → 24,1
    d-aerial     26,2 → 37,6 %     71° → 49°     11,4 → 27,5
    e-sand       15,1 → 19,2 %     54° → 50°      6,0 → 12,7
    f-grove      16,8 → 26,6 %     46° → 41°      8,6 → 18,7

    Ton-Spannweite ueber die sechs Kameras:  28° → 11°

Das Farbigste im Teich liegt darunter — der Beckengrund steht bei 45 bis 52 %
Sättigung. Ihn durchscheinen zu lassen ist der Weg zur Farbe, nicht der Preis
dafür. Und die **Ton-Spannweite fällt von 28° auf 11°**: Genau das war der
zweite Teil von Befund 2, *„wechselt die Farbe mit dem Blickwinkel
unmotiviert"*. Der Farbwechsel ist weg; was bleibt, ist ein Helligkeitswechsel
(147,8 streifend gegen 114,6 steil) bei gleichbleibendem Ton — und das ist
genau, wie Fresnel aussieht.

Das Verhältnis Durchblick steil zu streifend steht bei 27,9 zu 12,7, also 2,2.
Vor Paket S waren es 9,5 zu 10,8 — es stand verkehrt herum.

**Regression:** Insel, Matrix, Nachthimmel bitgleich. Dojo Δmax 5 an einem Punkt
(0,009 % ≥ 2, die zeitgetriebene Tsukubai-Kräuselung). Budget unverändert: 95
Draw-Calls, 96 744 Dreiecke, 21,86 MB Textur. Konsole sauber.

Bildstand `tools/shots/zen-37`.

### Was dabei sichtbar wurde und noch offen ist

Im Nahbild liegt das Seerosenblatt ohne Kontaktschatten auf dem Wasser
(Prüferbefund 16). Das steht als Nächstes an.

---

## Paket U — Der Staub saß auf den Hügeln

Prüferbefund 10: *„Punktsprites zu gross und zu hell, sie erscheinen auf den
fernen Huegeln."* Gemessen mit `knotenwerte.mjs`, `a-eyelevel`, Maske des
Knotens `zen-staub`:

    1734 Bildpunkte   Mittel 179   p50 190   p95 250   max 255
    49,9 % ueber L 190

Das Maximum bei 255 ist der Beweis: Die Körner schneiden ab. 45 Körner auf
1734 Bildpunkte sind ausserdem 39 Bildpunkte je Korn — bei `size: 0.12` mit
Größenabschwächung sind das in zwei Metern rund 31 Bildpunkte Durchmesser.

### Warum sie auf den Hügeln sitzen

Nicht Tiefensortierung, sondern der fehlende Abfall. Die Größenabschwächung
verkleinert das Korn mit der Entfernung, aber **jeder verbleibende Bildpunkt
bleibt gleich hell**. In zwölf Metern steht damit ein harter weisser Punkt vor
einem Hügel, den der Nebel bei 40 m fast weiss gewaschen hat. Der Szenennebel
greift nicht: Er beginnt bei 20 m, und der Staub steht mit ±7 m ganz davor.
`fog: false` am Material war insofern nicht einmal falsch — es hätte nichts
geändert.

Also ein eigener Abfall über die Sichttiefe, `smoothstep(4, 9, -mvPosition.z)`.
Staub, der Licht fängt, ist ohnehin eine Erscheinung des Nahbereichs; was man
in zehn Metern noch funkeln sieht, sind Insekten.

**Und wieder die unaufgelösten `#include`.** Der erste Anlauf zielte auf
`gl_Position = projectionMatrix * mvPosition;` — die Zeile steht in
`project_vertex` und ist in `onBeforeCompile` gar nicht sichtbar.
`ersetzeImShader` hat geworfen, wie es soll; mit `String.replace` wäre der
Abfall still ausgefallen und ich hätte die Zahlen gedeutet. Sechstes Mal, dass
dieser Baustein-Punkt zuschlägt, und das erste Mal, dass die Wächterfunktion es
in einem Zug erledigt hat.

### Ergebnis

    zen-staub, a-eyelevel     vorher → nachher
    Bildpunkte                  1734 → 1337
    ueber L 190                49,9 % → 42,0 %
    max                          255 → 253

Dazu `opacity` von 0,7 auf 0,45: Additiv auf Sand, der bei L 200 steht, schlägt
jedes Korn durch die Decke. Im Bild sind die Punkte über den fernen Hügeln, am
Torii und über der Wasserfläche verschwunden; im Nahbereich bleibt ein
Schimmer.

**Regression:** Insel, Matrix, Nachthimmel bitgleich. Dojo Δmax 8 an einem
Punkt. In den Zen-Kameras ändern sich 0,05 bis 0,25 % der Bildpunkte, und der
Schwerpunkt liegt jedes Mal in der Bildmitte, wo der Staub steht. Budget
unverändert: 95 Draw-Calls, 96 744 Dreiecke, 21,86 MB. Konsole sauber.

Bildstand `tools/shots/zen-38`.

### Befund 16 ist widerlegt

*„Seerosenblätter ohne Kontaktschatten"* — `castShadow` ist gesetzt, und der
Wurf kommt im Bild an. Differenziell gemessen (`teichleben.mjs --wurf`):

    b-pond     Seerosen  3412 px  11,1 Stufen
               Koi 0      286 px  12,3 Stufen
               Koi 1      462 px  11,0 Stufen
    d-aerial   Seerosen   406 px  13,1 Stufen
               Koi 0       71 px  17,7 Stufen
               Koi 1       54 px  21,4 Stufen

Der Schatten ist 61 Prozent so gross wie das Blatt selbst — die Sonne steht mit
19,4° so flach, dass er knapp danebenliegt, aber er ist da. Dass er vorher nicht
las, lag am Wasser darüber: Vor Paket T kamen elf Prozent davon durch, jetzt
rund fünfunddreissig.

**Werkzeugfehler nebenbei:** `castShadow` auf einer *Gruppe* ist wirkungslos —
der Wurf hängt an den Meshes darunter. Der erste Lauf meldete deshalb „Koi
wirft 0 px", und das war kein Befund, sondern der Fehler.

---

## Paket V — Die ferne Erde stand über dem Himmel

Prüferbefund 14: *„Der Nebel frisst den Mittelgrund."* Vier Spalten durch
`a-eyelevel`, Himmel oben, Hügel unten:

    x=400   Himmel y=300  L 172,0     Huegel y=360  L 199,9
    x=900   Himmel y=300  L 169,6     Huegel y=340  L 203,2

Sauberer gemessen mit `tools/fernsicht.mjs` — Maske der Hügel differenziell,
Himmelsband **derselben Spalten** zwölf bis vierunddreissig Zeilen darüber (ein
festes Rechteck hätte an manchen Spalten Hügel und an anderen Wolken erwischt):

    Huegel 34 753 px   L 175,8
    Himmel 24 426 px   L 162,6
    Differenz          +13,2

**Die ferne Erde stand dreizehn Stufen über dem Himmel darüber.** Damit kann
sie gar nicht als Erde lesen, nur als Dunstbank — und genau das war der Befund.

### Der naheliegende Griff ist der falsche

Eine dunklere Nebelfarbe bringt die Ferne zurück, und die Reihe zeigt es auch:

    0xecd9bb  Differenz +13,2
    0xdfcbab  Differenz  +4,9
    0xd3bd9c  Differenz  −3,2
    0xc7b18f  Differenz −10,4

Nur ist die Nebelfarbe hier gebunden. Die Horizontfarbe der Himmelskuppel ist
absichtlich dieselbe (der Kommentar an `makeDome` sagt, warum): Der Sandsaum
läuft bis dorthin, wo der Nebel gesättigt ist, und träfe dort ein anders
getönter Himmel auf den Boden, stünde die Horizontlinie als Kante im Bild. Im
Probebild mit 0xc7b18f war das auch prompt zu sehen — und dazu ein heller
Streifen am Hügelfuss, weil dessen Scheitelfarben in die **alte** Nebelfarbe
auslaufen. Man hätte drei Stellen zugleich nachziehen müssen.

### Die Endweite hat die Nebenwirkung nicht

Sie lässt den Hügeln mehr von ihrer eigenen Farbe, ohne den Ton zu verschieben,
bei dem Boden und Himmel zusammentreffen. Die Hügel stehen bei 33 bis 45 m; mit
`far = 46` waren sie zu 50 bis 96 Prozent Nebel, mit 62 nur noch zu 33 bis 63.

    far 46   Huegel 175,8   Differenz  +13,2
    far 55   Huegel 156,0   Differenz   −6,7
    far 62   Huegel 145,3   Differenz  −17,3
    far 70   Huegel 137,0   Differenz  −25,6
    far 82   Huegel 129,1   Differenz  −33,5

Gewählt: **62**. Bei 82 bekommen die Hügel im Bild wieder Sättigung und
verlieren damit die Ferne; bei 55 ist der Unterschied zu klein, um eine
Kammlinie zu tragen. Im Bild steht jetzt über die ganze Breite ein Höhenzug mit
Kuppen und Sätteln statt einer weissen Leere, und der Sandsaum läuft weiter
ohne Naht in den Himmel.

**Regression:** Insel, Matrix, Nachthimmel bitgleich. Dojo Δmax 8 an einem
Punkt. In den Zen-Kameras 3,3 bis 5,5 % geänderte Bildpunkte, in `d-aerial`
24,9 % — dort ist fast das ganze Bild Boden jenseits von 20 m, also genau die
Zone, die der Nebel betrifft. Budget unverändert: 95 Draw-Calls, 96 744
Dreiecke, 21,86 MB. Konsole sauber.

Bildstand `tools/shots/zen-39`.

---

## Paket W — Der Bambus hatte Kohlköpfe, weil sein Laub auf einer Kugel sass

Prüferbefund 4: *„Die Bambusblätter sind Kohlköpfe."* Der Grund ist
grundsätzlich und stand nicht im Bambuscode, sondern in `cardCluster`: Die
Funktion verteilt die Blattkarten auf einer **Fibonacci-Kugelschale**. Was dabei
entsteht, ist ein Ball — für eine Ahornkrone richtig, für Bambus falsch. Ein
Bambusschopf besteht aus Seitenzweigen, an denen die Blätter in einer Ebene
sitzen und nach unten hängen: flache Fächer, gestaffelt über das obere Drittel
des Halms, mit Himmel dazwischen.

### Der Atlas bleibt unangetastet, und zwar mit Grund

Der naheliegende Verdacht war der Blattatlas. Er stimmt nicht: Die Zeichnung
legt schon Büschel schmaler Blätter an, Breite zu Länge 1 : 11
(`w(u) = pow(sin(PI·u^0.58), 0.8) · 0.082`). Und er wird von `src/dojo/exterior.js`
mitbenutzt — eine Änderung dort ginge in eine Umgebung hinein, die in diesem
Paket nicht ansteht. Geändert wird nur die Anordnung, und die steht in
`makeBambooGrove` in `environments.js`. `squash` ist an `cardCluster` bereits ein
Parameter; es musste kein geteilter Code angefasst werden.

### Zwei Anläufe, und der erste war der Gegenfehler

**Anlauf 1** — `squash: 0.3`, drei Schöpfe je Halm, Maßstab (0,40 | 0,15 | 0,40),
Neigung 0,34 bis 0,70 rad. Ergebnis im Bild: keine Kohlköpfe mehr, dafür
**flache Teller auf Stöcken**. Die Scheiben standen zu waagerecht, waren zu
breit und liefen zu einer geschlossenen Decke zusammen. Der Ball war zu
kompakt, das hier war zu flach — beides ist derselbe Fehler, nämlich eine
geschlossene Masse ohne Zwischenraum.

**Anlauf 2** — der Schlüssel war nicht die Form des einzelnen Schopfs, sondern
**dieselbe Blattmenge auf mehr und kleinere Schöpfe**:

    Karten je Schopf   34 → 18
    cardScale        0,80 → 0,74
    squash           0,82 → 0,45
    Schöpfe je Halm     2 → 4, gestaffelt in Schritten von 0,145
    Maßstab   (0,28|0,30|0,28) → (0,27|0,20|0,27)
    Neigung             — → 0,5 bis 0,98 rad, wechselnd je Schopf
    Ansatz              — → seitlich am Halm (0,10 bis 0,25 m), nicht auf ihm

Im Bild stehen jetzt die Halme mit Knoten und Verjüngung frei, und darüber
liegt eine lichte Krone aus einzeln lesbaren Fächern mit Himmel dazwischen.

Die Drehreihenfolge ist `YXZ`, damit das Kippen **nach** dem Ausrichten wirkt:
erst zeigt der Fächer in seine Richtung, dann fällt er nach unten. Mit der
Vorgabe `XYZ` kippten alle Fächer in dieselbe Weltrichtung, unabhängig von
ihrer Ausrichtung.

**Kosten:** Draw-Calls unverändert 95 (die Schöpfe sind nach wie vor **eine**
Instanz), Dreiecke 96 744 → 96 952. 18 Karten auf 52 Instanzen sind 1872
Dreiecke gegen vorher 34 auf 26, also 1768 — die Verteilung ist praktisch
umsonst. Textur 21,86 MB. Konsole sauber.

**Regression:** Insel, Matrix, Nachthimmel bitgleich. Dojo Δmax 6 an einem
Punkt; der geteilte Atlas und `cardCluster` selbst sind unberührt. In den
Zen-Kameras 1,8 bis 11,0 % geänderte Bildpunkte — der Hain steht in `c-torii`
gross im Bild, und sein **Schattenwurf** auf dem Sand ändert sich mit, was den
Schwerpunkt der Abweichung auf den Boden zieht.

Bildstand `tools/shots/zen-41`.

### Was offen bleibt

Die einzelnen Blattspreiten lesen aus der Nähe noch rundlicher, als Bambus sie
hat. Das liegt an der Zeichnung im Atlas und an der Abtastung: Eine Spreite ist
im Prüfbild rund acht mal drei Bildpunkte gross, und der Alphaschwellwert
schneidet die Spitzen. Auf der Quest mit rund 23 px je Grad gegen 10,3 hier
ist dieselbe Spreite doppelt so breit abgetastet. Eine Änderung am Atlas beträfe
das Dojo mit; sie gehört in dessen Paket, nicht hierher.

---

## Paket X — Zwei Schattenbefunde nachgemessen: einer offen, einer widerlegt

Kein Eingriff in diesem Paket, zwei neue Werkzeuge und fünf Messungen.

### Befund 7: „Der Sakura-Schatten ist ein strukturloser Fleck"

Zuerst brauchte es ein Mass. `tools/laubschatten.mjs` misst drei Dinge im
differenziell gewonnenen Schattenfleck: Fläche, **Randanteil** (Umfang zu
Fläche) und die **Löcher** — unverschattete Bereiche, die ringsum von Schatten
umgeben sind, ermittelt durch Flutfüllung des Unverschatteten vom Bildrand her.

Der Randanteil allein hätte in die Irre geführt:

    Flaeche      13 701 px
    Randanteil     33,6 %   (ein geschlossener Fleck dieser Groesse haette 3,0 %)

Elffach so viel Rand wie eine Scheibe — das klingt nach aufgelöst. Die Löcher
sagen etwas anderes:

    Loecher   420,  zusammen 1186 px = 8,7 % der Schattenflaeche
              groesstes 25 px, Median 3 px

**Median drei Bildpunkte.** Das ist Rauschen am Alphaschwellwert, kein Lichtfleck.
91,3 Prozent des Schattens sind ungebrochene Verschattung; der hohe Randanteil
kommt von einem stark gelappten Umriss, nicht von Sprenkelung. Der Befund
stimmt also, und jetzt mit einer Zahl.

**Drei Hebel gemessen, keiner trägt:**

| Eingriff | Löcheranteil | Median |
| --- | --- | --- |
| Stand | 8,7 % | 3 px |
| Hüllkörper aus dem Schattenpass | 8,7 % | 3 px |
| Alphaschwelle des Tiefenmaterials 0,42 → 0,88 | 8,7 % | 3 px |
| Kronendichte 70 → 44 Karten je Ansatz | 8,4 % | 3 px |

* **Der Hüllkörper ist für den Schatten belanglos.** Ohne ihn misst der Fleck
  13 695 statt 13 701 Bildpunkte — sechs. Sein Schatten liegt vollständig
  innerhalb dessen, den die Karten ohnehin werfen. Die Vermutung, er fülle die
  Lücken zu, ist damit erledigt.
* **Die Alphaschwelle des Tiefenmaterials bewegt gar nichts** — vier Werte von
  0,42 bis 0,88 ergaben bis auf die letzte Stelle dieselben Zahlen. Der Grund
  ist der Atlas: Er wird mit gefüllten Pfaden auf ein Canvas gezeichnet, das
  Alpha ist also 0 oder 255 mit einem Bildpunkt Übergang. Eine höhere Schwelle
  hat schlicht nichts zum Verwerfen. Die uebliche Technik, einen Laubschatten
  ueber das Tiefenmaterial auszuduennen, greift hier nicht.
* **Die Kronendichte auch nicht.** 484 statt 770 Karten sind 0,3 Prozentpunkte.

Was bliebe, ist eine Krone, die **wirklich offen** ist — über mehr Volumen
verteilt, mit Lücken von zehn bis dreissig Zentimetern. Das ist derselbe
Eingriff, den Paket R schon als offen notiert hat, und aus demselben Grund:
Er ändert die Silhouette jedes Baums in drei Umgebungen. **Offen, mit drei
gemessenen Sackgassen mehr.**

### Befund 12: „Neutralgraue Schatten ohne kühles Indirektlicht" — widerlegt

`tools/schattenton.mjs` misst Ton und Sättigung derselben Bildpunkte einmal
verschattet und einmal nicht, und schaltet danach jedes Licht der sichtbaren
Umgebung einzeln ab, um zu sehen, wer den Schatten füllt.

    beleuchtet   rgb 203,181,147   L 182,9   Ton 36,3°   Saettigung 27,4 %
    im Schatten  rgb 143,133,116   L 134,1   Ton 38,4°   Saettigung 19,2 %

Neutralgrau wäre eine Sättigung nahe null; gemessen sind 19,2 Prozent. Und das
kühle Indirektlicht ist da — es ist sogar der Hauptfüller:

    HemisphereLight #b3cdf0 1,05      56,9 Stufen von 134
    DirectionalLight #ffd9a0 4,1       3,7
    DirectionalLight #ffcf9c 0,5       4,1
    PointLight #ffb765 1,9             0,0

Ohne das Hemisphärenlicht steigt die Sättigung im Schatten von 19,2 auf
**45,0 Prozent** — es ist also genau das, was den warmen Sand entsättigt.

**Kräftiger blau geht — wäre aber falsch.** Die Reihe über die Himmelsfarbe:

    0xb3cdf0   Schatten Saett 19,2 %  Ton  38,4°     beleuchtet Saett 27,4 %
    0x86ace8   Schatten Saett 11,1 %  Ton  33,0°     beleuchtet Saett 27,2 %
    0x5a8ce0   Schatten Saett  4,3 %  Ton 343,8°     beleuchtet Saett 27,4 %

Die beleuchtete Fläche bleibt fast unberührt, der Schatten kippt bis ins Blaue.
Nur: **Die Kuppel, die diese Szene beleuchtet, ist gar nicht so blau.**
Gemessen im Bild über die Höhe:

    ~35° Hoehe   (121,140,158)   Saettigung 23,4 %   Ton 209°
    ~24°         (142,147,150)   Saettigung  5,9 %
    ~11°         (161,156,145)   fast neutral
    ~2°          (186,166,136)   warm

Der Himmel erreicht **nirgends mehr als 23,4 Prozent** blaue Sättigung, und
unterhalb von 24° ist er neutral bis warm. Ein Hemisphärenlicht integriert die
ganze obere Halbkugel; sein Ergebnis kann nicht blauer sein als deren blauester
Punkt. Mit 25,4 Prozent Sättigung steht `0xb3cdf0` bereits **über** dem, was
die Kuppel hergibt. Es blauer zu stellen hiesse, die Schatten gegen den Himmel
zu färben, der sie wirft.

### Nebenbefund: Die aufgelegten Kontaktschatten sind sauber

    beleuchtet   Ton 37,8°   Saettigung 26,4 %
    darunter     Ton 37,8°   Saettigung 26,5 %   −19,3 Stufen

Ein reines Multiplizieren: dunkler, ohne den Ton anzufassen. Trotz
`toneMapped: false` und grauer Textur entsteht dort **kein** grauer Schleier.
Auch das war ein Verdacht, und auch er trägt nicht.

## Paket Y — Die schwarzen Splitter im Laub waren eine Lücke im Licht

Der Prüfer der dritten Runde nennt diesen Befund als einzigen, „der in fünf von
sechs Bildern gleichzeitig auffällt": „Das Laub aller drei Bäume und des
Bambus ist von schwarzen Splittern durchsetzt … Kein Blatt ist an der Spitze
schwarz. Das liest sich als Russ, als Fliegenschwarm oder als kaputte
Freistellung."

### Zuerst der Verdacht, der falsch war

Naheliegend war der Atlas: eine kaputte Freistellung, ein zu dunkler Farbeintrag,
ein Alpharand. `tools/blattatlas.mjs bamboo` widerlegt das in einem Bild — der
Bambusatlas ist sauber, kein Bildpunkt darin ist dunkler als L 60. Die Splitter
entstehen also **beim Rendern**, nicht beim Zeichnen des Atlas.

Gemessen im Bambusbüschel von `f-grove` (645,245–775,375, Auswahl über
G > B + 6):

    Median der Laubbildpunkte        L 164,6
    dunkelste 461 Bildpunkte         rgb(21, 31, 3)

Ein Verhältnis von 8:1 innerhalb eines Büschels. Das ist keine Modellierung,
das ist ein Loch.

### Der zweite Verdacht war ebenfalls falsch, und die Widerlegung war lehrreich

Die Vermutung: Der Durchleuchtungsterm rechnet mit `geometryNormal`, also der
Kartennormalen, und kann deshalb ein einzelnes Blatt nicht retten, dessen
Normal-Map es quer stellt. Der Versuch — `geometryNormal` durch `normal`
ersetzen — ergab ein **bitgleiches** Bild.

Der Grund steht in threes eigenem `lights_fragment_begin`:

```glsl
vec3 geometryNormal = normal;
```

Die beiden sind dieselbe Größe. `normal` trägt zu diesem Zeitpunkt bereits die
Normal-Map; `geometryNormal` ist nur ein zweiter Name dafür, kein
geometrischer Gegenpol. Der Durchleuchtungsterm folgte also schon immer dem
einzelnen Blatt.

**Bitgleich ist hier kein Fehlschlag gewesen, sondern der Beweis.** Ohne den
Versuch hätte ich am falschen Ort weitergesucht.

### Die eigentliche Ursache: eine Lücke quer zur Sonne

Drei Terme beleuchten ein Blatt, und alle drei waren an derselben Stelle blind:

| Normale zeigt … | Lambert | Durchleuchtung | Hemisphäre |
| --- | --- | --- | --- |
| zur Sonne | voll | 0 (geklemmt) | je nach Neigung |
| **quer zur Sonne** | **0** | **0** | **fast 0 bei waagerechter Normale** |
| von der Sonne weg | 0 | voll | je nach Neigung |

`fBack = max(0, dot(-L, N))` und `dot(N, L)` sind beide null, wenn die Normale
senkrecht auf der Lichtrichtung steht. Ein Blatt in dieser Lage bekommt von
niemandem etwas.

Dass diese Lücke überhaupt so breit trifft, liegt am Blattatlas. Gemessen über
die Blattfläche des Bambusatlas bei `normalScale` 1,15 (Alpha ≥ 110):

    Neigung der Schattierungsnormalen gegen die Karte
    Median 47,9 Grad   90. Hundertstel 66,3   Höchstwert 77,9

Eine Karte kann also frontal stehen und die Hälfte ihrer Blätter trotzdem quer.
Deshalb sitzen die Splitter **innerhalb** der Büschel und nicht an ihrem Rand,
und deshalb ist immer nur ein Teil eines Blattes schwarz.

### Die Behebung: ein Umgriff statt einer Klemme

`fBack` wird vorzeichenbehaftet genommen und die Durchleuchtung über die Quere
hinweg verbreitert:

```glsl
float fBack = -dot( fLight.direction, normal );
float fWrap = pow( max( 0.0, ( fBack + TRANS_WRAP ) / ( 1.0 + TRANS_WRAP ) ), uTransPower );
```

Das ist kein Sockel, sondern eine Verschiebung: Zum frontal beschienenen Blatt
hin fällt der Term auf null, dort hat Lambert längst übernommen. Die
Begründung ist die eines Bestands — ein Blatt zwischen Blättern steht nie im
Schwarzen, weil das Nachbarblatt es anleuchtet.

`TRANS_WRAP` ist gemessen, nicht gesetzt. Im Bambusbüschel von `f-grove`,
Schwarzanteil gegen den Zwischenabstand als Maß für die verbliebene
Modellierung:

    ohne Umgriff   p01  24,4   IQA 47,9   unter L 40   2,69 %
    0,70           p01  71,7   IQA 36,1   unter L 40   0,13 %
    0,96           p01  81,1   IQA 32,1   unter L 40   0,02 %
    1,53           p01  91,7   IQA 24,6   unter L 40   0,00 %

**Die 47,9 des Ausgangsstands sind kein Verlust.** Sie bestanden zum grossen
Teil aus den Splittern selbst — Schwarz neben Hell ist Kontrast, aber keine
Form. Breiter als 0,70 kostet Modellierung, ohne noch nennenswert Schwarz zu
finden. Gewählt: **0,70**.

### Was das in den anderen Umgebungen tut

`foliageMaterial` bedient Zengarten, Dojo und Insel. Der Umgriff wirkt überall,
und überall in dieselbe Richtung — Anteil der Laubbildpunkte unter L 40:

    Zen   f-grove Büschel      2,69 %  →  0,13 %
    Insel 5-backlight ganz    22,85 %  →  8,64 %   (p01 7,9 → 28,2)
    Insel 1-eyelevel ganz      5,45 %  →  3,13 %
    Dojo  c-engawa Garten      3,31 %  →  1,78 %
    Dojo  f-gegenlicht ganz    5,64 %  →  5,62 %

Das Gegenlichtbild der Insel ist der stärkste Fall, und das ist stimmig: Dort
steht die Sonne hinter dem Nadelbaum, und dort standen die meisten Blätter
quer. Der Dojo bewegt sich in `f-gegenlicht` kaum, weil sein Gegenlicht flach
einfällt und die Quere dort selten getroffen wird.

**Regression:** Konstrukt und Nachthimmel bitgleich. Insel und Dojo verändert,
in beiden Fällen gemessen als Rückgang des Schwarzanteils ohne Verlust an
Sättigung. Budget Zen: 95 Draw-Calls von 120, 96 952 Dreiecke von 350 000,
21,86 MB Textur. Ein Shader-Eingriff ohne neue Geometrie und ohne neue Textur.
Konsole sauber.

Bildstand `tools/shots/zen-52`.

## Paket Z — Die glänzende Pfütze war Staub, und das Moos war eine Frage der Projektion

Zwei Prüferbefunde, ein Ort: „Die Moosflächen liegen als glänzende Pfütze über
dem Harkmuster" (2) und „eine Reihe gleich heller Glühwürmchen, eines davon am
Himmel" (11).

### Es war gar nicht das Moos

Die weissen Flecken auf den Moosinseln sahen aus wie nasser Glanz. Gemessen
über die Maske des Knotens `zen-staub` in `b-pond` (`knotenwerte.mjs`,
`knotenkasten.mjs`):

    835 Bildpunkte in acht Stuecken
    Mittel 165, p95 212, Hoechstwert 244
    groesste Stuecke 11 bis 15 Bildpunkte breit
    zwei davon mitten auf einer Moosinsel, zwei ueber der Horizontlinie

Das ist der Staub. Zwei der acht sassen auf dem Moos, eines im Himmel — beide
Befunde in einer einzigen Punktwolke.

**Die Ursache stand als Begründung im Quelltext.** `size: 0.12` trug den
Kommentar „Ein Korn soll im Nahbereich mehrere Bildpunkte breit sein. Was nur
einen belegt, ist kein Staub, sondern Rauschen." Nachgerechnet: Bei 60 Grad
Bildwinkel und 720 Zeilen ist die Brennweite 623 Bildpunkte, und 0,12 m in drei
Metern sind damit **25 Bildpunkte**. Das ist kein Staubkorn, das ist ein
Nachtfalter.

Jetzt 0,055 m, und je Korn mit einem Streuwert multipliziert: Durchmesser mal
0,50 bis 1,25, Deckkraft mal 0,35 bis 1,00, quadratisch verteilt, damit die
schwachen Körner in der Überzahl sind. Der Streuwert kommt aus `ph`, das ohnehin
gezogen wird — **keine neue Ziehung**, sonst verschiebt sich alles, was danach
aus demselben Strom gebaut wird.

    vorher    835 Bildpunkte, 8 Stuecke, groesstes 15 px, Hoechstwert 244
    nachher   127 Bildpunkte, 5 Stuecke, groesstes  6 px, Hoechstwert 193

Kein Stück mehr über der Horizontlinie.

### Warum das Moos trotzdem glatt ist — und was daran zu ändern war

Nach dem Staub blieb eine glatte grüne Kuppel. Der naheliegende Verdacht war
eine zu schwache Normal-Map. Gemessen, indem `normalScale` von 1,15 auf 4,0
gesetzt wurde:

    Kasten ueber die Moosinsel in b-pond:  Δmittel 1,33  Δmax 29

Bei mehr als dreifacher Stärke. **Die Karte ist nicht zu schwach, sie wird
nicht abgetastet.** In `b-pond` liegen anderthalb Meter Moostiefe auf 35
Bildzeilen; radial ist die Fläche auf ein Zwanzigstel gestaucht, und in dieser
Richtung mittelt die Mip-Stufe jede Zeichnung weg — Normal-Map, Scheitelfarbe
und Relief gleichermassen.

Was bei dieser Stauchung überlebt, ist die **Silhouette**. Eine glatte Kuppel
liefert eine Ellipsenlinie gegen den Sand, und genau die liest sich als Pfütze.
Also drei Eingriffe, alle an der Kontur statt an der Fläche:

* **Vierzehn Ringe statt acht.** Der radiale Punktabstand fällt auf einem Meter
  Halbmesser von 12 auf 7 cm. Das ist die Obergrenze für alles, was aus
  Scheitelfarben kommt — ein Feld mit kürzerer Wellenlänge als der Punktabstand
  wird nicht feiner, es wird Rauschen.
* **Ein zweiter Fleckenmassstab bei 14 cm** neben dem bestehenden bei 28 cm,
  erst seit den vierzehn Ringen abtastbar.
* **Zwölf bis neunzehn Polsterbüschel je Insel**, 6 bis 15 cm Halbmesser, 3 bis
  6 cm hoch, auf `polsterHoehe()` gesetzt — derselben Funktion, die auch die
  Fläche formt, damit kein Büschel in der Luft hängt. Sie brechen die obere
  Kontur.

Gemessen mit `moossaum.mjs` in `b-pond`:

    Zustand              Zackigkeit   Saum    Korn
    vorher                    6,72   0,962   5,213
    14 Ringe + 2. Massstab    6,75   0,966   5,561
    dazu Bueschel             6,74   0,961   6,531

Zackigkeit und Saum bleiben, wo sie schon richtig waren; das **Korn steigt um
25 %**. Das ist die Zahl zur Sache: Die Fläche trägt jetzt Struktur, die die
Projektion nicht wegmittelt.

**Was offen bleibt und offen bleiben muss:** Die Normal-Map des Mooses ist aus
der Augenhöhenkamera weiterhin wirkungslos. Das ist keine Einstellung, das ist
die Projektion. Wer dort mehr Feinheit will, muss sie in die Silhouette legen,
nicht in eine Karte.

**Regression:** Konstrukt, Nachthimmel, Insel und Dojo bitgleich. Budget: 95
Draw-Calls von 120 (unverändert — alle Büschel liegen im selben Netz),
**101 752** Dreiecke von 350 000 (von 96 952; die Ringe kosten 2 640, die
Büschel 4 800 abzüglich der gesparten), 21,86 MB Textur. Konsole sauber.

Bildstand `tools/shots/zen-53`.

## Paket AA — Die Ferne war Nebelfarbe mit runder Kante (Prüferbefund 3, zweite Hälfte)

Der Prüfer: „kein Gartenabschluss — eine endlose Sandwüste mit der geharkten
Scheibe als Insel, ferne Hügel von Wolken nicht zu unterscheiden."

### Die erste Hälfte des Befundes wird nicht bearbeitet

`makeGartenmauer()` steht gebaut und geprüft im Code und ist in fünf Zeilen
wieder einzuhängen. Sie ist in **Durchlauf 12 auf ausdrücklichen Zuruf des
Nutzers** entfernt worden, weil sie aus dem offenen Kiesfeld einen Hof machte.
Diese Entscheidung gehört dem Nutzer. Sie steht seit Paket C so im Log und
bleibt so.

### Die zweite Hälfte war messbar, und die Messung sagte etwas anderes als erwartet

Gemessen über die Maske des Knotens `zen-ferne`, Grünüberschuss G − (R+B)/2:

    a-eyelevel   Median  12,5   Mittel L 145,8   Beitrag −37,9
    d-aerial     Median   8,5   Mittel L 180,2   Beitrag −20,9

Praktisch neutrale helle Buckel. Der naheliegende Griff war, sie grüner zu
machen — und der ist hier fast wirkungslos. Der Grünanteil des Grundtons
0x8e9468 wurde um 52 % erhöht (auf 0x74854a), auf dem Bild kam davon **ein
Viertel** an: Median 8,5 → 10,5.

Zwei Gründe, beide bekannt und beide hier zum ersten Mal zusammen wirksam:

* Der Nebel zieht bei 33 bis 56 m Kameraabstand 45 bis 85 Prozent der Farbe in
  die Dunstfarbe.
* Was übrig bleibt, liegt bei L 180 im **flachen Ast der ACES-Kurve**, und dort
  ist keine Sättigung mehr zu holen. Kontrast ist nur nach unten zu gewinnen —
  die Lehre steht seit dem Nachthimmel im Log und gilt auch hier.

### Was tatsächlich hilft: die Silhouette

Bei 85 % Nebel ist die Farbe erledigt, aber der **Umriss** nicht. Eine Wolke
ist rund, ein Hügelrücken ist oben gezackt. Vier bis acht Kegel je Kuppe, 0,45
bis 1,15 m hoch auf einem Rücken von 2 bis 4 m — gerade genug, dass eine Zacke
bei 40 m ein bis zwei Bildpunkte hoch steht. Dazu ein dunklerer Grundton
(0x5c6a34 / 0x333d1e statt 0x8e9468 / 0x555a3c) und ein schmalerer Nebelfuss
(0,22 statt 0,30, und höchstens 0,88 statt vollständig).

Der Nebelfuss war aus der Luftkamera der grösste Fehler: Von oben sieht man die
Kuppen von oben, und die untersten dreissig Prozent waren schlicht in
Nebelfarbe gemalt.

    Bild          vorher                       nachher
    a-eyelevel    L 145,8  Beitrag −37,9       L 123,6  Beitrag −59,9
    c-torii                                    L 110,5  Beitrag −73,0
    d-aerial      L 180,2  Beitrag −20,9       L 167,8  Beitrag −32,9

    Saettigung a-eyelevel   27,9 %  →  31,7 %
    Gruenueberschuss Median 12,5    →  14,0

**Der Beitrag ist die Zahl, auf die es ankommt**: Der Hügelzug steht in
`a-eyelevel` jetzt 60 statt 38 Stufen unter dem, was hinter ihm liegt, und in
`c-torii` 73. Das ist der Unterschied zwischen einer Dunstbank und einem
Rücken.

**Dasselbe Muster wie beim Moos, zwei Pakete früher:** Was eine starke
Auslöschung überlebt — dort die Stauchung der Projektion, hier der Nebel —, ist
die Silhouette und nicht die Fläche.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: 95 Draw-Calls
von 120 (unverändert, die Kegel liegen im selben Netz), **107 132** Dreiecke
von 350 000 (von 101 752; die Baumreihe kostet 5 380), 21,86 MB Textur.
Konsole sauber.

Bildstand `tools/shots/zen-54`.

## Paket AB — Seerosen und Lotus (Prüferbefunde 4 und 13)

### Das Seerosenblatt war eine Scheibe in einer Farbe

Der Prüfer: „die Seerosenblätter schweben über der Fläche" und, zwei Befunde
weiter, „neonmagentafarbene Origami-Lotusblüten".

Das Blatt war eine `CircleGeometry` — ein Mittelpunkt, ein Rand, dazwischen
nichts. Damit kann es weder eine Schüssel sein noch Rippen tragen noch einen
Saum haben; dieselbe Grenze, an der die Moosinseln schon einmal gescheitert
sind. Jetzt ein Ringnetz mit fünf Ringen (121 Punkte, 240 Dreiecke) und darauf:

* **Die Kerbe.** Der Einschnitt bis zur Mitte ist das deutlichste Merkmal eines
  Seerosenblatts. Der alte `thetaLength` von 1,85 π hat ihn als Tortenstück
  geschnitten — zwei gerade Kanten; jetzt läuft er spitz zu.
* **Schüsselform**, Rand 1,2 cm über der Mitte, mit welligem Wulst.
* **Rippen und Saum** in den Scheitelfarben: neun Strahlen als Helligkeit
  (Geometrie wäre bei 24 Segmenten unterabgetastet), Rand rötlich angelaufen.

### Kein Blatt hatte einen Schatten im Wasser

Sie schweben nicht — sie liegen bei y = 0,056 auf dem Wasser bei 0,050. Aber
bei 19° Sonnenstand fällt der Schlagschatten eines 6 mm hohen Blattes
vollständig **unter** das Blatt und ist unsichtbar. Was sichtbar wäre, ist das
Wasser, dem das Blatt den Himmel wegnimmt. Also eine dunkle Scheibe knapp unter
der Fläche, 25 % grösser als das Blatt, nach Osten versetzt.

**Ein Fehler dabei, und er ist lehrreich:** Der erste Anlauf liess die
Scheitelfarbe zum Rand hin nach Schwarz laufen und die Deckkraft bei 0,30
stehen. Schwarz auf 30 % ist aber **dunkler** als Dunkelgrün auf 30 % — der
Saum wurde der dunkelste Teil des Schattens statt der schwächste, und im Bild
stand ein harter Ring um jedes Blatt. Der Abfall gehört in den Alphakanal;
three liest ihn aus dem `color`-Attribut, wenn es vier Bestandteile hat.

### Die vierte Verschiebung des Zufallsstroms

`makeLilyPad` zog vorher zwei Zahlen und danach drei. Sieben Blätter, sieben
zusätzliche Ziehungen — und im ersten Bild danach standen Lotus, Koi und
Ufersteine woanders. Die Lehre steht in diesem Log an drei Stellen. Die Kerbe
wird jetzt aus der Drehung abgeleitet.

### Der Lotus war Origami, und zwar wörtlich

`ConeGeometry(0.05, 0.14, 4)`, elfmal. **Vier Seiten heisst vier ebene Facetten
und eine Spitze** — es gibt keine Krümmung, in der sich Licht verlaufen könnte.
Jetzt ein Blattgitter aus 4 × 7 Punkten mit Längsbogen und Querwölbung, drei
Kränze statt zwei (aussen flach und weit, innen steil), und die Samenkapsel als
flacher Kegelstumpf statt als Kugel.

Die Farbe war der zweite Teil: **0xff9dc2 hat den Rotkanal auf Anschlag.** In
einer Szene, deren Sand bei L 200 steht, ist ein voll ausgesteuerter Kanal der
hellste Punkt des Bildes. Eine Lotusblüte ist am Grund fast weiss und wird erst
zur Spitze rosa; der Verlauf steht jetzt in den Scheitelfarben.

Gemessen über die Maske des Knotens in `c-torii`:

    vorher    R p50 110   p95 236   Saettigung p50 40,1 %
    nachher   R p50 118   p95 181   Saettigung p50 33,6 %

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: **97**
Draw-Calls von 120 (von 95 — die Blattschatten sind ein eigenes Netz mit
eigenem Material), **113 444** Dreiecke von 350 000 (von 107 132), 21,86 MB
Textur. Konsole sauber.

**Was offen bleibt:** Der Koi ist weiterhin der hellste Fleck im Teich, und ein
Trittstein steht unverdunkelt im Wasser. Beides gehört zu Befund 4 und kommt im
nächsten Paket.

Bildstand `tools/shots/zen-55`.

## Paket AC — Der Trittstein im Teich, und ein Befund, den die Messung nicht bestätigt

### Der Stein lag einen Zentimeter über dem Wasser

Der Prüfer: „ein Trittstein sitzt darin, ohne dass er dunkler wird." Der Ort
stimmt und lässt sich nachrechnen: Der Pfad endet bei rund (2,9 | 0,0), der
Teich steht bei (3,2 | −1,2) mit den Halbachsen 2,04 und 1,70 — der Stein liegt
bei **0,72** der Ellipse, also klar innen.

Unverdunkelt war er, weil seine Oberseite bei y = 0,060 lag und das Wasser bei
0,050. **Einen Zentimeter darüber.** Von schräg oben sieht man fast nur diese
Oberseite, und die hat mit dem Wasser nichts zu tun. Ein Zentimeter ist
ausserdem keine Lage, in der ein Stein je liegt: Er steht entweder im Wasser
oder er ragt heraus.

### Zwei Wege, und der erste war falsch

Der erste Anlauf hat ihn zum **Sawatari** gemacht — Furtstein, Oberkante über
dem Spiegel, Fuss bis in die Sohle, nasser Saum an der Wasserlinie. Im Bild
stand eine Kiste im Teich:

* Der Block wird dabei 40 cm dick, und seine Flanke zeigt die auf das Fünffache
  gestreckte Kornkarte als senkrechte Streifen.
* Der nasse Saum wurde ein **rostroter Ring**. Der Grund ist eine Umkehrung,
  die ich nicht bedacht hatte: Unter Wasser hellt die Trübung die Fläche
  ohnehin auf. Eine Verdunklung genau dort erzeugt keinen nassen Stein, sondern
  eine Kante zwischen zwei Fehlern.

Ein Furtstein braucht eine eigene Gestalt. Ein gestreckter Trittstein ist
keine.

Der zweite Weg ist der einfachere und der, den der Befund wörtlich verlangt:
Der Stein **sinkt unter den Spiegel**, Oberkante 2,5 cm darunter, dazu ein
algiger Grundton (×0,70 / 0,76 / 0,66). Dann färbt ihn das Wasser mit derselben
tiefenabhängigen Trübung, die auch die Beckensohle trägt, und der Pfad endet am
Wasser statt hindurchzugehen.

### Der Koi ist kein weisser Splitter

Der Prüfer nennt ihn „ein unleserlicher weisser Splitter". Gemessen über die
Masken der Knoten:

    Bild        Knoten         Punkte  Mittel   p95   max   Beitrag
    b-pond      koi-koerper       937   112,3   148   169     −6,5
    b-pond      koi-flossen        66   139,0   155   167     +6,4
    c-torii     koi-koerper       804   103,2   152   164     −8,1
    c-torii     koi-flossen        40   139,3   167   170     +6,7

Kein Bildpunkt über L 190, der Höchstwert liegt bei 170, und der Körper ist in
beiden Bildern **dunkler als das, was hinter ihm liegt** — nicht heller. Das
grösste zusammenhängende Stück in `c-torii` misst 50 × 17 Bildpunkte.

„Weiss" trifft also nicht zu; der Fisch steht unter dem Mittelwert seiner
Umgebung. „Unleserlich" ist bei 50 × 17 Bildpunkten Ansichtssache und hier
nicht durch eine Zahl zu entscheiden. **Der Befund wird deshalb nicht
umgesetzt, sondern mit seinen Zahlen abgelegt.** Wer ihn wieder aufnimmt, soll
mit diesen Werten anfangen und nicht mit dem Eindruck.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget unverändert: 97
Draw-Calls von 120, 113 444 Dreiecke von 350 000, 21,86 MB Textur. Konsole
sauber.

Bildstand `tools/shots/zen-56`.

## Paket AD — Der Laternenhof war stärker als das Licht, und das Torii stand in Mehl

### Befund 5: eine Scheibe, die nichts beleuchtet

Gemessen in `e-sand` über die Masken der beiden Knoten:

    zen-laternenhof     10 507 Bildpunkte, Kreis von 124 px    Beitrag +29,0
    zen-laternenlicht   12 559 Bildpunkte                      Beitrag  +8,0

Das additive Bildchen war **dreieinhalbmal so kräftig wie die Beleuchtung**,
die es begründen soll. Und es war eine mathematisch runde Scheibe von 124
Bildpunkten, deren Rand gegen den hellen Himmel steht — genau das, was der
Prüfer als „hartkantige Scheibe" meldet.

Der Punkt, den er darüber hinaus macht, stimmt so nicht: Die Punktleuchte aus
einer früheren Runde beleuchtet sehr wohl etwas, nämlich 12 559 Bildpunkte um
8 Stufen. Sie war nur nicht zu sehen **neben** einem Hof, der viermal so stark
war.

Am späten Nachmittag hat eine Steinlaterne in klarer Luft überhaupt keinen Hof;
sichtbar ist allenfalls ein enger Überstrahl an der Lichtöffnung. Der Hof
schrumpft deshalb von 1,10 auf 0,42 und verliert ein Drittel seiner Deckkraft,
die Leuchte steigt von 1,9 auf 2,5.

    zen-laternenhof       562 Bildpunkte, ~40 px    Beitrag +7,8
    zen-laternenlicht  14 306 Bildpunkte            Beitrag +9,0

**Das Verhältnis ist jetzt herum:** Die Beleuchtung trägt mehr als ihr eigenes
Sinnbild. Im Bild fangen Dachunterseite, Knauf und Sockel warmes Licht, und die
Scheibe am Himmel ist weg.

### Befund 6: das Torii hat keine Fussplatte

Wörtlich richtig. Der Pfostenzylinder hörte bei y = 0 auf, darunter lag nur die
Kontaktverdunklung aus Paket D. Im Bild ist das ein roter Stab, der in Mehl
steckt.

Ein Torii steht nicht im Boden, es steht auf einem **Kamebara** — einem
steinernen Sockelwulst, der den Pfostenfuss umfasst und das Holz vom
aufsteigenden Wasser trennt. Ohne ihn fällt jedes Torii binnen weniger Jahre
am Fuss auseinander; er ist kein Zierat, sondern der Grund, warum die Dinger
stehen. Zwei Kegelstümpfe je Pfosten, der Neigung der Pfosten folgend, beide
Pfosten in **einem** Netz.

**Ein Fehler dabei:** Der erste Anlauf gab dem Sockel Scheitelfarben von 0,74
bis 1,00. `zenGranite()` trägt den Grundton 0xb8b2a8, und die Scheitelfarbe
multipliziert ihn — der Sockel stand damit bei L 200 und war heller als der
besonnte Sand daneben. Die Findlinge derselben Szene werden mit 0x8a8076 und
Verwandten eingefärbt, also mit rund 0,54; der Sockel gehört in dieselbe Reihe
und liegt jetzt bei 0,44 bis 0,60. Gemessen: 310 Bildpunkte bei L 97,5 gegen
einen Sand von rund 180.

**Was von Befund 6 offen bleibt:** Der Prüfer verlangt ausserdem eine Mulde und
einen aufgeworfenen Wulst im Sand um jeden Gegenstand. Die Kontaktverdunklung
gibt es seit Paket D und sie ist dort gemessen; eine Vertiefung im Sandnetz
gibt es nicht. Das ginge nur über die Scheitelpunkte von `makeSandBett`, und
die Steine werden erst nach dem Sand gesetzt — es wäre ein Umbau der
Reihenfolge, kein Zusatz. Offen und benannt.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: **99**
Draw-Calls von 120 (von 97 — der Sockel ist ein Netz, dazu das Material),
**113 956** Dreiecke von 350 000 (von 113 444), 21,86 MB Textur. Konsole
sauber.

Bildstand `tools/shots/zen-57`.

## Paket AE — Der Sand hatte weder Korn im Nahfeld noch Tiefe (Prüferbefund 7)

Der Prüfer nennt zwei Zahlen: unter 6 % Tonwertänderung über die ganze Tiefe,
und Hochpass 3,4 nah gegen 13,9 in der Mitte. Beide stimmen der Richtung nach.
Eine davon hat er falsch begründet.

### Das Korn: die Ursache ist Vergrösserung

`tools/hochpass-reihe.mjs` in `e-sand`, neun Bänder von nah nach fern:

    2,06  2,54  3,22  3,90  4,76  5,59  7,27  9,21  9,94

Faktor 4,8 in die falsche Richtung, deutlicher als seine Zahlen.

Die Kornkarte deckt 0,70 m auf 256 Texeln ab, also 2,7 mm je Texel. Am unteren
Bildrand von `e-sand` liegt der Kies rund 66 cm entfernt (Kamera 0,45 m,
Bildunterkante 34° unter der Waagerechten), wo ein Bildpunkt gut 0,5 mm
abdeckt. Die Karte wird dort **fünffach vergrössert**, und die bilineare
Filterung macht daraus Brei.

Dieselbe Karte ein zweites Mal, auf ein Achtel der Kachel gespannt: 8,75 cm
statt 0,70 m, also 0,34 mm je Texel. Ein Texturgriff mehr, kein Byte Speicher —
dasselbe Verfahren, das im Nachthimmel den Faktor 8,4 auf 4,4 gebracht hat.

    nachher  2,47  2,91  3,54  4,18  5,00  5,74  7,32  9,22  9,95

Das Nahfeld steigt um 20 %. **Mehr ist nicht zu holen, und der Grund gehört
dazugesagt:** Ich habe die Stärke bis 1,20 getrieben (das Sechsfache) und kam
auf 3,08. Bei 34° Streifwinkel ist der Boden längs der Blickrichtung 2,6:1
gestaucht; die anisotrope Filterung ist mit ihren acht Abgriffen erschöpft, und
die untersten zwanzig Bildzeilen sind ein senkrecht verschmierter Streifen, in
dem keine Karte mehr etwas ausrichtet. Was dort fehlt, fehlt der Auflösung,
nicht der Textur.

### Der Faktor 4,8 misst nicht, was er zu messen scheint

Die fernen Bänder von `e-sand` enthalten Moos, Trittsteine und dicht gestaffelte
Harkrillen; die nahen enthalten nur Sand. Der Hochpass zählt Objektkanten
genauso mit wie Korn. **Die Zahl vergleicht also Kies gegen Gegenstände**, und
ein Teil des Faktors ist ein Messartefakt, kein Bildfehler. Ich habe das
Verhältnis trotzdem verbessert, weil die Ursache im Nahfeld unabhängig davon
real ist.

### Die Tiefe: der Nebel fängt zu spät an

Median je Band über den reinen Sandbereich (y 440 bis 719, also 0,66 bis 2,3 m):

    vorher    177,0  177,1  177,2  178,1  179,3  180,0     Spanne 3,0 = 1,7 %
    nachher   168,9  169,2  169,4  170,5  172,4  174,0     Spanne 5,1 = 2,9 %

Der Grund ist die Reichweite des Nebels: Er beginnt bei 20 m, und in `e-sand`
liegt der gesamte sichtbare Sand zwischen 0,66 und 15 m. **Die
Luftperspektive, die sonst die Tiefe trägt, ist in diesem Bild nicht
eingeschaltet.**

Der Kies bekommt deshalb einen eigenen kurzen Tiefenterm, 12 % auf den ersten
60 cm, ausgelaufen bei 4,5 m. Er geht nach **unten**: Bei L 180 liegt die
Fläche im flachen Ast der ACES-Kurve, und Kontrast ist dort nur nach unten zu
gewinnen — dieselbe Lehre wie bei den fernen Hügeln zwei Pakete zuvor.

**1,7 % auf 2,9 % ist weniger als die 6 %, die der Befund verlangt, und ich
lasse es dabei.** Um in einem Bild, dessen Sand über acht Zehntel seiner Fläche
zwischen 0,66 und 2,3 m liegt, sechs Prozent zu erzeugen, bräuchte es rund 20 %
Amplitude auf drei Metern. Das ist keine Luftperspektive mehr, das ist eine
Vignette um die eigenen Füsse. Der ehrliche Weg wäre, den Nebel früher
beginnen zu lassen — aber der steht seit Paket C auf 20/62, weil genau diese
Werte den Hügelzug tragen, und die sind zwei Pakete alt.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget unverändert: 99
Draw-Calls von 120, 113 956 Dreiecke von 350 000, 21,86 MB Textur — der Eingriff
ist ein zweiter Abgriff auf einer Karte, die schon gebunden ist. Konsole sauber.

Bildstand `tools/shots/zen-58`.

## Paket AF — Die Findlinge waren Schokolade mit Gravur (Prüferbefund 8)

Der Prüfer: „nasse Schokoladenellipsoide mit Kratzlinien-Gravur." Drei Vorwürfe
in einem Satz, und alle drei liessen sich einzeln nachweisen.

### Die Farbe: sie waren die wärmste Fläche der Szene

Gemessen über die Knotenmasken in `b-pond`, Verhältnis Rot zu Blau und
Sättigung:

    zen-sand           1,37   27,0 %
    zen-trittsteine    1,40   28,4 %
    zen-ufersteine     1,52   34,5 %
    zen-laterne-stein  1,54   34,9 %
    zen-findlinge      1,74   42,7 %   <- allein auf weiter Flur

Zwei Ursachen, beide multiplikativ:

* Die fünf Grundtöne lagen bei einem Rot-zu-Blau von **1,14**, und die Sonne
  dieser Szene (0xffd9a0) bringt **1,59** mit. **Was unter goldenem Licht
  neutral aussehen soll, muss im Grundton kühl sein.** Die Töne liegen jetzt bei
  rund 1,00.
* Die Moospatina trägt 0x4e5c2e, deren Blaukanal bei 46 von 255 liegt. Mit
  Stärke 0,85 aufgetragen frisst sie dem Stein das Blau weg — die Findlinge
  standen im Blaukanal bei 41,8 gegen 51,2 der Trittsteine, die dieselbe Patina
  mit 0,45 tragen. Jetzt 0,62.

    nachher  zen-findlinge  1,44   30,4 %

Damit liegen sie im Feld der übrigen Steine statt darüber.

### Die Kratzlinien waren die Facettenkanten

Lange, gerade, ungefähr parallele Hell-Dunkel-Paare. Bei vierzehnfacher
Vergrösserung sind sie eindeutig: Es sind die Kanten der
`IcosahedronGeometry(size, **1**)` — 42 Punkte, 80 Dreiecke. Auf einem Stein,
der im Bild 350 Bildpunkte breit ist, sind das Facetten von rund 40 Bildpunkten,
und ihre Knicke stehen als Striche.

Unterteilung 2 (162 Punkte, 320 Dreiecke) löst sie auf — **und macht den Stein
zur glatten Kartoffel.** Das ist genau der Fehler, gegen den
`weatheredStoneGeometry()` überhaupt eingeführt wurde: Bei gleichbleibender
Verwitterungsamplitude verteilt sich dieselbe Störung auf viermal so viele
Punkte und wird zum Rauschen.

Die Verwitterung musste deshalb mit: `amount` von 0,18–0,40 auf **0,22–0,48**,
`frequency` von 1,5–3,7 auf **3,0–6,5**. Auf 42 Punkten war eine Frequenz von 3
unterabgetastet; auf 162 trägt sie. Danach hat der Stein Bruchflächen und einen
Grat statt Striche.

Hochpass im Kasten über den grossen Findling (950,420–1230,570), von nah nach
fern:

    vorher   3,96  2,89  3,18  6,82
    nachher  3,50  2,63  2,99  6,16

Der Feinanteil **fällt**, und das ist hier das Gewünschte: Was verschwindet,
sind die Striche, nicht die Struktur — die steht jetzt in der Silhouette und in
den Flächen.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: 99 Draw-Calls
von 120 unverändert, **118 356** Dreiecke von 350 000 (von 113 956; die
Unterteilung kostet 4 400 über alle Findlinge und die kleinen Steine), 21,86 MB
Textur. Konsole sauber.

Bildstand `tools/shots/zen-59`.

## Paket AG — Eine Regression von mir, und der Unterschied zwischen Busch und Stein

### Zuerst der Fehler

In Paket AA habe ich die Farben des fernen Hügelzugs so gesetzt:

```python
s = re.sub(r'const oben = new THREE.Color\(0x[0-9a-f]+\);', '…', s)
```

**Ohne Anzahl.** Das Muster passt auf zwei Stellen in `environments.js`, und die
zweite ist `makeKarikomi()`. Die geschnittenen Sträucher standen seit Paket AA
auf 0x5c6a34 / 0x333d1e — den Farben der fernen Hügel — statt auf ihren eigenen
0x7f8f52 / 0x3d4a2b. Drei Pakete lang, in drei festgeschriebenen Bildständen.

Gemessen über die Maske des Knotens in `a-eyelevel`:

    falsch      rgb(67,4 | 70,5 | 42,6)   Gruenueberschuss Median 16,0
    richtig     rgb(84,6 | 89,5 | 55,4)   Gruenueberschuss Median 21,0

Die Sträucher waren **26 % zu dunkel**.

Es ist derselbe Fehler wie der `sed`, der im Dojo-Log vier Materialien statt
einem getroffen hat. Die Lehre ist nicht „vorsichtiger sein", sondern: **Eine
Ersetzung ohne Anzahl ist eine Ersetzung über die ganze Datei, und ein
Farbwertmuster ist nie eindeutig.** Die Stelle trägt jetzt einen Kommentar, der
das festhält.

Was den Fehler drei Pakete lang getragen hat, ist ebenfalls benennbar: Ich habe
in jedem Paket die vier **anderen** Umgebungen auf Bitgleichheit geprüft, aber
den Zengarten selbst nur dort angesehen, wo ich gerade gearbeitet habe. Ein
Regressionsdiff des eigenen Bildsatzes gegen den Vorstand hätte 16 000
veränderte Bildpunkte gezeigt.

### Befund 9: dieselbe grüne Halbkuppel

„Dieselbe grüne Halbkuppel bedeutet Busch, Moosstein und Berg."

Für den Berg ist das seit Paket AA erledigt (Baumkamm). Für den Karikomi ist die
runde Masse **richtig** — er ist geschnitten, das ist sein Wesen. Was fehlte,
war die Oberfläche: Eine geschnittene Azalee hat Blattpolster von einer
Handbreite und kleine Schattentaschen dazwischen, ein Stein mit Moos hat das
nicht.

Auf 14 × 10 Segmenten liegt bei einem Halbmesser von 0,9 m ein Punkt alle 13 cm.
Ein Polster von 12 cm ist damit unterabgetastet und wird Rauschen statt Form —
dieselbe Grenze wie bei den Moosinseln in Paket Z. **28 × 20** bringt den
Punktabstand auf 6,5 cm und lässt zwei Massstäbe zu, 14 cm und 7 cm.

### Die Messung, in drei Zuständen getrennt

`moossaum.mjs` auf `zen-karikomi` in `a-eyelevel`:

    Zustand                        Punkte  Kantensprung  Zackigkeit   Saum    Korn
    vorher (falsche Farbe, 14x10)   16 177        36,37       20,78   1,355   8,024
    Farbe zurueck, 14x10            16 177        29,97       20,78   1,204   6,948
    Farbe zurueck, 28x20 + Polster  17 922        28,94       20,99   1,215   7,132

**Die Trennung ist der Punkt.** Der Rückgang von Korn und Kantensprung gehört
ganz der Farbe: Eine hellere Fläche liegt weiter im flachen Ast der ACES-Kurve
und trägt dort weniger absoluten Kontrast. Hätte ich nur den Endstand gegen den
Anfang gemessen, stünde hier „das Relief kostet Korn" — und das wäre falsch.

Das Relief selbst bringt Korn 6,95 → 7,13 und Zackigkeit 20,78 → 20,99, und die
Maske wächst um 1 745 Bildpunkte, weil die Polster nach aussen drücken. **Das
ist wenig für das, was im Bild zu sehen ist**, und der Grund gehört dazu: `Korn`
misst den Hochpass über die ganze Maske, und ein Blattpolster von 14 cm ist auf
zehn Meter kein Hochpassmerkmal, sondern eine Form. Der Beleg dafür ist der
Bildausschnitt, nicht die Zahl.

Der **Saum** fällt von 1,355 auf 1,215 — der Rand ist weniger heller als das
Innere und liest damit weniger als ausgestanzt. Über 1 bleibt er trotzdem, und
das ist der nächste offene Punkt an diesen Sträuchern.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: 99 Draw-Calls
von 120 unverändert, **132 972** Dreiecke von 350 000 (von 118 356; die feinere
Kugel kostet 14 600 über neun Sträucher), 21,86 MB Textur. Konsole sauber.

Bildstand `tools/shots/zen-60`.

## Paket AH — Der Wurzelanlauf, die braune Trommel, und ein schwarzes Band, das den Teich verdunkelt hat

### Befund 15: die braune Trommel am Fuss des Ahorns

Zuerst identifiziert, nicht geraten. `knotenkasten.mjs` in `d-aerial`:

    zen-findlinge   Stueck von 2 101 Bildpunkten bei 736,444–811,512

Also ein Findling der Steingruppe 2, die bei (4 | 1,5) stand — 1,9 m vom Ahorn
bei (4,8 | 3,2). Aus der Luftkamera decken sich beide auf dem Bild, und weil der
Stein flach ist (`scale.y` 0,55 bis 0,85) und im Schatten des Baums steht, liest
er als Fass hinter dem Stamm.

**Der erste Versuch war zu grob:** Gruppe 2 auf (2,7 | 0,9) verschoben. Der
Fleck war weg, aber die beiden Brocken drängten sich im Teichbild in den
Vordergrund. Jetzt (5,4 | 0,7): Sie stehen als Steingruppe **neben** dem Wasser,
und der Ahorn steht frei.

### Befund 6, zweiter Teil: Bäume ohne Fuss

Der Stamm war ein Zylinder, der bei y = 0 aufhört — im Bild eine flache Ellipse
auf dem Sand. Ein Baum hat dort seinen breitesten Punkt. `wurzelanlauf()` setzt
drei bis fünf Rippen an, die 6 cm **unter** null enden, damit aus keinem Winkel
eine Schnittkante zu sehen ist.

**Ein Fehlversuch dabei:** Der erste Anlauf setzte bei y = 0,20 an und lud auf
0,255 aus. Zwanzig Zentimeter sind zu kurz, um als Schwellung zu lesen — im Bild
sass ein Klumpen am Stamm. Ausserdem war sein oberer Halbmesser gleich dem des
Stammes, also deckungsgleich; durch die offene Oberkante sah man hinein, und das
gab einen hellen Fleck. Jetzt 42 cm hoch und oben 1,4 cm schmaler als der Stamm.

### Und dann das schwarze Band

Derselbe Aufruf an der Sakura zeichnet ein Band von **exakt rgb(0, 0, 0)** quer
über den Stamm, dort wo der Anlauf aus ihm heraustritt (y = 0,465). Am Ahorn,
mit derselben Funktion und derselben Bauart des Merges, passiert das nicht.

Reines Schwarz ist unter einem Hemisphärenlicht nicht durch Beleuchtung zu
erklären — es zeigt eine entartete Normale oder eine entartete Tangente an.
Offen und geschlossen (`openEnded`) versucht: Das Band bleibt in beiden Fällen.
**Ich habe die Ursache nicht gefunden**, und der Anlauf an der Sakura ist
deshalb wieder draussen. Der Kommentar an der Stelle hält den Befund fest.

### Die Kopplung, die ich fast übersehen hätte

Der Teich nimmt seine Spiegelung mit einer Würfelkamera aus der Teichmitte auf,
und die Sakura ist darin gross. Das schwarze Band hat die Umgebungskarte
verdunkelt und damit **den ganzen Teich**:

    mit dem Anlauf     zen-wasser  L 52,4   Beitrag −54,6
    ohne den Anlauf    zen-wasser  L 117,9  Beitrag +10,9

Ein Fehler am Baum, sichtbar am Wasser fünf Meter weiter. Ich habe ihn zuerst
der verschobenen Steingruppe zugeschrieben und die Verschiebung zurückgenommen —
der Teich blieb dunkel. Erst die Halbierung (Ahornanlauf behalten,
Sakuraanlauf entfernen) hat es gezeigt.

**Das ist der Beleg für die Lehre aus Paket AG:** Seit diesem Paket wird auch
der Zengarten selbst gegen seinen Vorstand gemessen, nicht nur die vier anderen
Umgebungen. Ohne diesen Diff wäre ein Teich aus Schlamm festgeschrieben worden.

### Eigenregression dieses Pakets, gegen `zen-60`

    c-torii     Δmax 1   0,000 %      e-sand   Δmax 1   0,000 %
    f-grove     Δmax 1   0,000 %      d-aerial          0,925 %
    a-eyelevel                        2,719 %
    b-pond                            8,732 %

`b-pond` und `d-aerial` tragen die verschobene Steingruppe, `a-eyelevel` und
`d-aerial` den Wurzelanlauf des Ahorns. Die drei Bilder, die weder das eine noch
das andere sehen, sind praktisch bitgleich — das ist die Gegenprobe.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: 99 Draw-Calls
von 120 unverändert, **133 140** Dreiecke von 350 000 (von 132 972), 21,86 MB
Textur. Konsole sauber.

Bildstand `tools/shots/zen-61b`.

## Paket AI — Das schwarze Band war eine Gleitkommastelle

Das Paket davor hat den Wurzelanlauf an der Sakura wieder herausgenommen, weil
er ein Band von exakt rgb(0, 0, 0) quer über den Stamm zeichnete und über die
Spiegelungskarte den ganzen Teich verdunkelte. Die Ursache stand dort als
ungeklärt.

### Die Messung, die es entschieden hat

Statt weiter im Bild zu suchen: die Geometrie in Node nachbauen und ihre
Normalen zählen. `three` lässt sich ohne Browser laden, `wurzelanlauf()` ist
zwanzig Zeilen.

    Ahorn   Punkte 60   Normale null 0   NaN  0   entartete Dreiecke 0/84
    Sakura  Punkte 60   Normale null 0   NaN 30   entartete Dreiecke 0/84

Dreissig von sechzig. Und ein Blick auf die Punkte zeigte: schon die
**Positionen** waren NaN, nicht erst die Normalen.

### Die Stelle

```js
const t = 1 - (py + (hoehe + 0.06) / 2) / (hoehe + 0.06);
…
const rippe = 1 + Math.pow(t, 2.2) * (…);
```

Am obersten Ring ist `py` genau die halbe Höhe, und `t` sollte null sein. Bei
`hoehe = 0.5` wird aus (0,28 + 0,28) / 0,56 in Gleitkomma aber
**1,0000000000000002**, und `t` ist **−1,5 · 10⁻¹⁶**.

`Math.pow(negativ, 2.2)` ist NaN. Damit wurden die Koordinaten der oberen zwei
Ringe NaN, `computeVertexNormals()` machte NaN-Normalen daraus, und der Shader
zeichnet eine Fläche mit NaN-Normale als exaktes Schwarz.

Am Ahorn ist `hoehe = 0.42`, und dieselbe Rechnung fällt zufällig exakt auf
null. **Derselbe Code, dasselbe Verfahren, ein Fehler, der von der
Bitdarstellung einer Konstanten abhängt.** Deshalb war er am einen Baum da und
am anderen nicht, und deshalb war er im Bild nicht zu erraten.

Die Behebung ist eine Klemmung auf [0, 1]. Der Anlauf ist an beiden Bäumen
wieder drin.

### Die Kette, rückwärts gelesen

    Gleitkommarest −1,5e−16
      → Math.pow(negativ, 2,2) = NaN
        → 30 von 60 Punkten mit NaN-Koordinaten
          → NaN-Normalen
            → schwarzes Band am Sakurastamm
              → schwarze Flaeche in der Wuerfelaufnahme aus der Teichmitte
                → dunkle Umgebungskarte
                  → zen-wasser von L 117,9 auf L 52,4

Sieben Glieder zwischen Ursache und Symptom, und das Symptom lag fünf Meter vom
Fehler entfernt in einem anderen Gegenstand. **Keine Bildbetrachtung führt
diese Kette rückwärts.** Was sie geführt hat, war das Nachrechnen der Geometrie
ausserhalb des Renderers — und der Eigenregressionsdiff, der überhaupt erst
gezeigt hat, dass etwas nicht stimmt.

### Eigenregression, gegen `zen-61b`

    a-eyelevel  0,501 %      d-aerial  0,057 %      f-grove  0,171 %
    b-pond      Δmax 1       c-torii   Δmax 1       e-sand   Δmax 1

Nur die drei Bilder, die den Sakurastamm sehen, ändern sich; der Teich ist
bitgleich, weil er in Paket AH schon auf dem richtigen Wert stand.

**Regression:** Alle vier anderen Umgebungen bitgleich. Budget: 99 Draw-Calls
von 120, **133 308** Dreiecke von 350 000 (von 133 140), 21,86 MB Textur.
Konsole sauber.

Bildstand `tools/shots/zen-62`.

## Paket AJ — Vierte Prüferrunde: zwei Befunde widerlegt, drei bestätigt

Nach elf abgearbeiteten Befunden hat sich die Szene so weit verändert, dass die
alte Liste nicht mehr taugte. Ein frisch unterrichteter Prüfer hat den Stand
`zen-62` beurteilt: fünfzehn Mängel, elf Dinge, die tragen.

**Sein Bericht ist detailliert und stellenweise falsch.** Drei seiner Befunde
habe ich nachgemessen, bevor ich etwas angefasst habe. Das war richtig.

### Widerlegt: „Das Torii wirft keinen Schatten" (sein schwerster Befund)

Er belegt ihn mit Helligkeitswerten unmittelbar neben den Pfeilerfüssen
(x 692–712 bei y 432 und 455) und findet dort keinen Abfall. Das stimmt — und
sagt nichts. Bei 19 Grad Sonnenhöhe steht der Schatten eines 3,7 m hohen Tors
**rund 10,6 m weit weg**, nicht an seinem Fuss.

Differenziell gemessen (`knotenkasten.mjs`, `knotenwerte.mjs` auf `zen-torii`
in `c-torii`):

    18 488 geaenderte Bildpunkte, Beitrag −76,7
    groesstes zusammenhaengendes Stueck: 10 445 px bei 855,409–1279,519

Das Stück liegt vollständig auf dem Sand, weit rechts vom Tor. Der Schatten ist
da, er ist gross, und er ist genau dort, wo die Sonnenhöhe ihn hinstellt.

### Widerlegt: „Keine Kantenglättung, kein einziger Mischpixel"

Gemessen über alle waagerechten Kantenübergänge im Toriibereich von `c-torii`
(Sprung > 60 in der Kanalsumme), Anteil mit echtem Zwischenwert:

    Torii c-torii        1 888 Kanten   68,6 % mit Mischbildpunkt
    Trittstein e-sand      420 Kanten   83,6 %

Und an drei Spalten quer über die Kasagi-Oberkante:

    x=600  Himmel (179,163,140) → Rot (147, 30, 19)          hart
    x=640  Himmel (180,163,139) → (172,131,109) → (144,29,19)  weich
    x=700  Himmel (177,162,140) → (164, 97, 80) → (149,31,20)  weich

Zwei von drei Spalten tragen einen sauberen Mischbildpunkt; die dritte trifft
die Kante zufällig auf einer Bildpunktgrenze. **Seine Koordinaten für diese
Kante lagen ausserdem zehn Zeilen daneben** — bei (595, 262–276) ist alles
Himmel.

### Halb bestätigt: „weisse und ebenso viele fast schwarze Splitter im Bambus"

Im Kasten 150,130–400,330 von `a-eyelevel`:

    ueber L 215:  36 von 50 451 Bildpunkten   (0,07 %)   hellster L 238,2
    unter L 45:   90 von 50 451               (0,18 %)

Die weissen gibt es — 36 Bildpunkte, warm-weiss, verstreut. Sie sind der
Durchleuchtungsterm aus Paket Y an seinem Maximum, und bei L 238 ist im flachen
ACES-Ast keine Farbe mehr übrig; deshalb weiss statt grüngelb.

Die „ebenso vielen fast schwarzen Späne" gibt es **nicht**. Die 90 dunklen
Bildpunkte sind rgb(30, 35, 4) bis rgb(38, 50, 7) — tiefes Schattengrün mit
G > R, also Laub im Eigenschatten, nicht Schwarz. An zwei seiner drei genannten
Koordinaten liegt **kein einziger** Bildpunkt unter L 60.

### Bestätigt und behoben: Wasserpflanzen auf dem Trockenen

„Eine Lotusblüte wächst am Laternenfuss auf dem Trockenen." Nachgerechnet:
Lotus und Seerosen wurden auf einer **Ellipse** gestreut, die Wasserlinie folgt
aber `teichUmriss` und schwankt um ±13 %. Wo der Umriss einspringt, liegt die
Ellipse aussen — und dort steht die Laterne, die bei (1,6 | −1,8) mit 0,86 der
Beckenellipse selbst im Teich fusst.

Beide werden jetzt am **selben Umriss** gestreut wie die Wasserfläche, und um
den Laternensockel bleibt ein Loch von 62 cm. Verschoben, nicht verworfen: Ein
Verwurf bräuchte eine Wiederholung und damit eine unbestimmte Zahl von
Ziehungen.

### Bestätigt und behoben: der weisse Ring unter dem Lichtkasten

Seine Beschreibung war zurückhaltend. Gemessen in `b-pond` über 370,300–430,320:

    Hoechstwert L 255,0 — voll ausgebrannt
    16,71 % der Kastenflaeche ueber L 215

Die Ursache stand in einer Zeile: Die Zwischenplatte war
`CylinderGeometry(0.17, 0.13, …)`, also **oben breiter als unten**. Ihre
Oberseite war damit eine waagerechte Kreisfläche von 17 cm Halbmesser, auf der
ein Lichtkasten von nur 10,8 cm steht — ein 6 cm breiter Ring aus hellem
Granit, frontal in der tief stehenden Sonne.

An einem Yukimi-doro ist diese Platte ein **Chidai**: unten breiter als oben,
mit Tropfkante. Umgedreht bleiben oben 2,4 cm Ring, und die sichtbare Fläche
ist die beschattete Unterseite. Über L 215: **16,71 % → 12,57 %**; der Rest ist
der Lichtkasten selbst, der ausbrennen darf, weil er die Lichtquelle ist.

### Was ich daraus mitnehme

Ein Prüfer, der an falschen Koordinaten misst, liefert Befunde, die sich wie
Messungen lesen und keine sind. **Drei geprüft, zwei gefallen.** Der Rest seiner
Liste wird von hier an einzeln nachgemessen, bevor daran gearbeitet wird — und
was sich nicht belegen lässt, wird nicht gebaut.

**Regression:** Alle vier anderen Umgebungen bitgleich. Im Zengarten 0,2 bis
2,1 % je Bild — die verschobenen Wasserpflanzen und die Laternenplatte. Budget:
99 Draw-Calls von 120, 133 308 Dreiecke von 350 000, 21,86 MB Textur. Konsole
sauber.

Bildstand `tools/shots/zen-63`.

## Paket AK — Der Ahorn war der einzige gesättigte Ton im Bild

Prüferbefund 1.9 und der erste Teil von 1.3. Beide nachgemessen, bevor etwas
angefasst wurde; einer bestätigt sich, einer nicht.

### Widerlegt: „der kleinere Kronenklumpen hängt ohne sichtbaren Ast frei"

Bei siebenfacher Vergrösserung von `d-aerial` (670,370–820,500) läuft ein Ast
von der Stammgabel nach rechts oben bis in den kleineren Schopf. Er ist
durchgehend, nicht verdeckt und rund vier Bildpunkte breit. Dass die Krone aus
zwei Massen besteht, stimmt als Beschreibung — ein Ahorn mit einem tiefen
Seitenast ist aber kein Fehler.

### Bestätigt: die Sättigung

Gemessen über die Knotenmasken in `d-aerial`:

    zen-ahorn-karten    66,5 %
    zen-ahorn-blobs     66,7 %
    zen-karikomi        37,2 %
    zen-sand            26,8 %
    zen-sakura-karten   23,7 %

**Doppelt so gesättigt wie das nächste Element, fast dreimal so gesättigt wie
Sand und Sakura.** Ein Farbakzent darf der stärkste Ton der Szene sein, aber
nicht ihr einziger.

### Der Hebel, und warum es nicht die Palette sein durfte

`color` kann nur kanalweise nach unten multiplizieren und taugt deshalb zum
Abdunkeln, nicht zum Entsättigen: Ein rotes Blatt weniger rot zu machen hiesse,
Grün und Blau **anzuheben**, und das kann eine Multiplikation nicht. Die
Palette wäre der andere Hebel — und genau der ist verboten, seit eine
Verdunklung für den Dojo dort das Bambuslaub des Zengartens mitgenommen hat
(Dojo-Log, Paket VI).

Also ein neuer Parameter an `foliageMaterial`: `entsaettigung`, ein Mischen zur
eigenen Helligkeit hin, auf der **Albedo** vor dem Licht, damit es von
Sonnenstand und Schatten unabhängig bleibt. Vorgabe 0 — wer nichts angibt,
bekommt Bild für Bild dasselbe wie vorher. Ein Uniform, kein zweites
Shader-Programm: `customProgramCacheKey` bleibt unverändert, alle Laubmaterialien
teilen weiter eine Übersetzung.

### Zwei Läufe, weil die erste Rechnung im falschen Raum stand

    0,35                      66,5 %  →  61,6 %
    0,55 + blasserer Saum     66,5 %  →  54,7 %

Der erste Wert war für den sRGB-Ausgaberaum gerechnet, das Mischen läuft aber
**linear** und vor der ACES-Kurve, die Sättigung in den dunklen Partien wieder
aufzieht. Dazu kam, dass ein Teil der Sättigung gar nicht aus der Albedo
stammt, sondern aus dem Durchleuchtungssaum: `transColor` stand auf 0xe0837a
mit 45,5 % Eigensättigung und geht mit halbem Gewicht in den Term ein. Jetzt
0xdba79f mit 29,5 %.

54,7 % gegen 37,2 % beim Karikomi: Der Ahorn bleibt der stärkste Ton im Bild —
das ist seine Aufgabe —, aber er ist nicht mehr doppelt so stark wie alles
andere.

### Der Hüllkörper war 30 Stufen dunkler als seine Karten

L 52 gegen L 82, gemessen über beide Knotenmasken. Wo die Karten eine Lücke
lassen, stand deshalb ein fast schwarzes Loch statt verschatteten Laubs — das
ist der zweite Teil von Befund 1.3, und er stimmt. Dieselbe Rechnung wie bei den
Karten und dazu ein Viertel heller: 0x8e3034 / 0xa03d3e / 0x7c262c wird zu
0x914548 / 0xa65656 / 0x7e383d. Blobs danach 53,8 % statt 66,7 %.

**Regression:** Alle vier anderen Umgebungen **bitgleich** — das ist die
Gegenprobe auf die Vorgabe 0 des neuen Parameters. Im Zengarten ändern sich nur
die beiden Bilder, die den Ahorn zeigen (`a-eyelevel` 0,07 %, `d-aerial`
0,42 %); die anderen vier stehen bei Δmax 1. Budget unverändert: 99 Draw-Calls
von 120, 133 308 Dreiecke von 350 000, 21,86 MB Textur. Konsole sauber.

Bildstand `tools/shots/zen-64`.

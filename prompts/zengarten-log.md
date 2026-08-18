# 🪷 Zen-Garten – Arbeitsprotokoll

Fortgeschrieben in **jedem** Durchlauf. Neueste Einträge oben.

## Stand

| Größe | Grenze | Ausgang (zen-00) | jetzt |
| --- | ---: | ---: | ---: |
| Draw-Calls env-zen (Höchstwert über 6 Kameras) | ≤ 120 | 166 ❌ | **54 ✅** |
| Dreiecke szenenweit | ≤ 350 000 | 20 028 | 28 074 ✅ |
| Texturspeicher | ≤ 60 MB | 29,77 MB | 20,77 MB ✅ |
| Shader-Programme | – | 20 | 19 |

Pakete: **1 und 2 bestanden.** 3–9 offen.

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

## Durchlauf 2 — Paket 2: Sand — **bestanden**

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

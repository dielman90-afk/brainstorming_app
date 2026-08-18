# 🪷 Zen-Garten – Arbeitsprotokoll

Fortgeschrieben in **jedem** Durchlauf. Neueste Einträge oben.

## Stand

| Größe | Grenze | Ausgang (zen-00) | jetzt |
| --- | ---: | ---: | ---: |
| Draw-Calls env-zen (Höchstwert über 6 Kameras) | ≤ 120 | 166 ❌ | **53 ✅** |
| Dreiecke szenenweit | ≤ 350 000 | 20 028 | 19 570 ✅ |
| Texturspeicher | ≤ 60 MB | 29,77 MB | 29,77 MB ✅ |
| Shader-Programme | – | 20 | 20 |

Pakete: **1 bestanden.** 2–9 offen.

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

# Prompt: 🌌 Nachthimmel auf das visuell Erreichbare bringen

> Zum Einfügen in eine **neue** Sitzung. Voraussetzung: Die Sitzung startet auf
> einem Branch, der die Zen-Garten-Arbeit enthält (siehe „Was zu übernehmen
> ist").

---

Bring die Umgebung **🌌 Nachthimmel** in `src/environments.js`
(`createNightEnvironment`, ab Zeile ~3704) auf das visuell beste Niveau, das bei
stabilen 72 fps auf einer Meta Quest 3 standalone erreichbar ist.

## Harte Randbedingungen

- **Rein prozedural.** Keine externen Assets: kein GLB/GLTF, keine Bilddateien,
  keine CDN-Anfragen. Geometrie aus Code, Texturen aus `<canvas>`.
- **Keine neuen Laufzeit-Abhängigkeiten.** three@^0.185 und was in
  `package.json` steht. Playwright ist als Entwicklungswerkzeug erlaubt.
- **Maßstab bleibt 1:1.** Der Nachthimmel hat **kein** `WORLD_SCALE`: Die
  Bodenfläche ist ein Quadrat von 96 × 96 m mit 150 × 150 Segmenten, der Nebel
  läuft von 22 bis 48 m, die Himmelskuppel hat Radius 44, die Sternschalen
  liegen bei 38 bis 40 m, der Mond steht bei [14 | 16 | −24], die
  Horizonthügel bei r = 26 bis 38 m. Wer daran dreht, bricht Nebeldistanzen,
  Locomotion und Kartenplatzierung.
- **Es bleibt Nacht.** Die Aufgabe ist nicht, es heller zu machen. Eine
  Nachtszene lebt davon, dass der Tonwertumfang **unten** liegt und trotzdem
  moduliert ist. Wer den Mond zur Sonne macht, hat die Aufgabe verfehlt.
- **Keine Regressionen.** Karten, Whiteboard, Wrist-Menü, Locomotion, Zonen und
  die **vier anderen Umgebungen** (🏝 Himmelsinsel, 🪷 Zen-Garten, ⬜ Konstrukt,
  ⛩ Dojo) müssen unverändert funktionieren. `npm run build` muss nach jedem
  Durchlauf grün sein. Die Konsole muss im Headless-Lauf frei von Errors **und**
  Warnings sein.

## Budget

Gemessen mit aktivem Nachthimmel (`tools/metrics/night-00.json`, sechs feste
Kameras):

| Größe | Grenze | Ist-Zustand |
| --- | ---: | ---: |
| Draw-Calls env-night | ≤ 120 | **40** ✅ |
| Dreiecke szenenweit | ≤ 350 000 | **51 842** ✅ |
| Texturspeicher | ≤ 60 MB | **0,77 MB** ✅ |
| Shader-Programme | – | 7 |

**Lies diese Tabelle genau, sie sagt das Gegenteil der letzten beiden
Aufträge.** Die Himmelsinsel und der Zen-Garten hatten zu viele Draw-Calls bei
zu wenig Inhalt. Der Nachthimmel reißt **kein einziges** Budget — er benutzt
keines. Vier Texturen, zusammen 0,77 MB von 60. Ein Drittel der erlaubten
Draw-Calls. Fünfzehn Prozent der Dreiecke. Zweiundvierzig Zeichenknoten für
eine ganze Welt.

Das ist kein Lob, sondern der Befund: **Es steht fast nichts drin.** Du hast
80 Draw-Calls, 298 000 Dreiecke und 59 MB Texturspeicher frei. Gib sie aus.

Instancing und Geometrie-Verschmelzung bleiben trotzdem Pflicht, sobald du
etwas hinzufügst, das in Stückzahl auftritt — Steine, Staub, Fernfelsen,
Sternfeld. Budgetverletzungen werden im **selben** Durchlauf behoben.

Zur Frame-Zeit: Der Container hat keine GPU, Chromium rendert per SwiftShader
in Software. Die Millisekunden sind **kein** Quest-Wert, sondern nur ein
Vergleichsmaßstab zwischen zwei Ständen. Behandle sie so und behaupte nichts
anderes. Zur Einordnung: Der Software-Boden (leere Umgebung, 1280 × 720) liegt
bei rund 61 ms; der Nachthimmel liegt heute bei 385 ms im schlechtesten Bild.

## Qualitätsanspruch

Stilisiertes AAA im Erreichbaren — Journey, Sky: Children of the Light,
No Man's Sky bei Nacht, Outer Wilds. **Ausdrücklich NICHT** Fotorealismus,
keine astronomische Simulation.

Acht prüfbare Kriterien:

1. **Silhouette** – liest jede Form auch als reiner Umriss gegen den Sternhimmel?
2. **Komposition** – Blickführung, Asymmetrie, bewusste Leere; wohin führt der
   Blick, wenn es keine Sonne gibt?
3. **Licht** – **eine** gerichtete Quelle (der Mond), Schlagschatten,
   Kontaktverdunklung, Streiflicht auf Kanten; und Himmelslicht als kühler
   Gegenpol dazu
4. **Farbharmonie** – kalte Mondseite gegen warmes Regolithrot, eine Tonart,
   keine Ausreißer
5. **Materialtrennung** – Staub, Fels, Gestein im Bruch, Eis/Frost, Ferne
6. **Tiefenstaffelung** – Vordergrund, Mitte, Ferne messbar getrennt, **ohne**
   dass Nebel alles in dieselbe Suppe zieht
7. **Bewegung** – Staub, Wind über den Dünen, Sternflimmern, ziehende Schleier;
   nichts im Gleichtakt
8. **Kein „Programmierer-Tell"** – keine sichtbare Regelmäßigkeit, Rasterung,
   Wiederholung; keine geometrischen Grundkörper, die als solche lesbar sind

## Was heute schon nachweislich falsch ist

Diese fünf sind gemessen, nicht vermutet. Sie sind der Startpunkt, nicht die
vollständige Liste — der Prüfer wird mehr finden.

1. **Die Szene wird von einem weißen Licht mit Stärke 1,4 beleuchtet.**
   `main.js` hat eine globale Hemisphärenleuchte (`0xffffff` / `0x334455`,
   Stärke 1,4), die für **alles** gilt; eine Umgebung kann sie über
   `env.sceneAmbient` herunterregeln. Der Zen-Garten tut das (0,35), die Insel
   hebt sie mit einer zweiten Leuchte der Stärke **−1,4** auf, der Nachthimmel
   tut **nichts** — und bekommt damit weißes Licht der Stärke 1,4 über seine
   eigene mondblaue Hemisphäre der Stärke 0,7 gelegt. Das ist der Grund, warum
   der Regolith flächig orange dasteht statt in Mondlicht.
2. **Kein einziger Schatten.** `renderer.shadowMap.enabled` ist global `true`,
   aber im Nachthimmel gilt: 39 Meshes, **0 Werfer, 0 Empfänger**. Kein
   Brocken, kein Hügel, kein Krater wirft etwas. Deshalb steht alles auf, statt
   zu stehen.
3. **Sterne stehen vor dem Boden.** Die Sternschalen liegen bei 38 bis 40 m,
   die Bodenfläche reicht bis 48 m. Alles, was weiter weg ist als die Schale,
   wird von den Sternen überzeichnet. Nachweis: `tools/shots/night-00/`,
   `d-aerial.png`, Ausschnitt bei (640, 175) — ein Dutzend Sterne liegt
   sichtbar **innerhalb** der dunklen Geländesilhouette.
4. **Der Boden trägt keine Modellierung.** `e-ground.png`, Bereich
   (100,400)–(1180,700): Mittel 50,2, p05–p95 = **31 bis 63**, also 32 von 255,
   und **kein einziges Pixel über 190**. Eine Fläche, die drei Viertel des
   Bildes füllt, hat zwölf Prozent Tonwertumfang und keine Lichtspitze.
5. **Der Mond ist eine weiße Scheibe.** `MeshBasicMaterial`, Farbe `0xe8ecf2`,
   keine Oberfläche, keine Maria, keine Randabdunklung, keine Phase, und ein
   Hof aus einem einzigen Sprite. Er ist die einzige Lichtquelle im Bild und
   damit das, worauf jeder Blick zuerst fällt.

## Arbeitspakete, in dieser Reihenfolge

1. **Licht.** Das steht vorn, weil jedes spätere Paket gegen falsches Licht
   arbeitet: `sceneAmbient` setzen, Mondlicht als **einzige** gerichtete Quelle
   mit Schattenkarte, Werfer und Empfänger setzen, Kontaktverdunklung.
   Kalt gegen warm statt hell gegen dunkel.
2. **Himmel.** Sternfeld nach Helligkeit und Farbtemperatur gestaffelt statt
   zwei Schalen mit je einer Größe; ein Milchstraßenband; Luftglühen und
   Extinktion zum Horizont; die Sterne müssen **hinter** das Gelände.
3. **Mond.** Oberfläche, Maria, Randabdunklung, Phase, mehrschichtiger Hof.
   Er ist das Motiv, auf das die Komposition zeigt.
4. **Boden.** Regolith: Korn, Verwehungen, Windrippel, Staubfahnen im Windschatten
   der Brocken, Ausbleichen und Verdunkeln nach Exposition. Die größte Fläche
   im Bild und damit der größte Hebel.
5. **Geländeform.** Krater mit Wall, Auswurfdecke und Strahlensystem statt
   fünf weichen Mulden; Dünen mit Luv- und Leeseite; die Kante bei 48 m auflösen.
6. **Steinwerk.** Brocken mit Bruchflächen, Verwitterung, halb verwehten Füßen;
   Fernfelsen und Abbruchkanten als Silhouette gegen den Sternhimmel.
7. **Komposition.** Blickführung ohne Sonne: Der Mond ist der einzige helle
   Punkt, alles andere ordnet sich ihm zu. Asymmetrie, bewusste Leere,
   ein Vordergrundanker.
8. **Leben & Bewegung.** Staubteufel, wehender Feinstaub über den Kämmen,
   Sternflimmern, ein Meteor. Alles mit eigener Phase; nichts im Gleichtakt.
9. **Schlusspass.** Performance, Konsistenz, Gesamtprüfung aller Bilder.

## Ablauf je Durchlauf

- **A** Genau **ein vollständiges** Paket bauen. Nicht drei halbe.
- **B** `npm run build` grün, Konsole sauber.
- **C** Screenshots von den festen Nacht-Kameras.
- **D** Messung (Draw-Calls, Dreiecke, Texturspeicher, Frame-Zeit).
- **E** Regressionsprüfung der anderen vier Umgebungen.
- **F** Der Prüfer (siehe unten).
- **G** Auswertung: Was ist bestanden, was offen, was war mein Fehler.

**Maximal 4 Durchläufe je Paket.** Ist es danach nicht bestanden: offene Punkte
nach `prompts/nachthimmel-log.md` schreiben, mir das klar sagen, zum nächsten
Paket gehen.

## Der Prüfer

**Genau EIN** Sub-Agent als Prüfer (claude-opus-5, reasoning effort high), vor
jedem Durchlauf neu gebrieft. Kein Fan-out, keine parallelen Agenten.

Er urteilt je Kriterium **bestanden / nicht bestanden mit Begründung**, listet
Mängel **nach visueller Wirkung** sortiert, schlägt **keine** Implementierung
vor und schreibt **keinen** Code. Gib ihm die Messwerkzeuge (`tools/pixel.mjs`,
`tools/region.mjs --hochpass`, `tools/crop.mjs`, `tools/diff.mjs`) und verlange
Befunde mit Koordinate und Zahl statt Eindrücken.

**Sag ihm ausdrücklich, dass es eine Nachtszene ist.** Ein Prüfer, der „Anteil
über L 230" als Maßstab anlegt, misst hier am Ziel vorbei; der richtige Maßstab
für eine Nacht ist Modulation im unteren Drittel, nicht Helligkeit.

**Wenn der Prüfer ausfällt** — er ist mir zuletzt an einem Ausgabelimit des
Kontos abgebrochen —, dann sag mir das sofort und prüfe selbst weiter, mit
denselben Werkzeugen und gegen seine letzte schriftliche Liste. Aber schreib
in dem Fall **nicht** „bestanden" ins Protokoll: An der eigenen Arbeit ist man
nicht unbefangen.

## Abbrechen und melden, wenn

- ein Paket nach 4 Durchläufen nicht besteht (weitermachen, aber melden),
- das Budget nur auf Kosten des Aussehens zu halten ist,
- eine Änderung eine andere Umgebung oder eine App-Funktion bricht,
- der Prüfer dreimal denselben Mangel ohne Fortschritt wiederholt.

## Commits und Protokoll

- Ein Commit je bestandenem Paket. Nachricht beschreibt, was **sichtbar** anders
  ist, plus Vorher/Nachher-Messwerte.
- Harness-Code gehört nach `tools/`, nicht nach `src/`.
- `prompts/nachthimmel-log.md` wird **jeden** Durchlauf fortgeschrieben.

## Ehrlichkeit

Berichte den Zustand, wie er ist. Ein geschöntes „AAA erreicht" ist wertlos —
ich sehe mir die Screenshots selbst an. Eigene Fehler gehören ins Protokoll.

---

## Was aus den vorigen Durchläufen zu übernehmen ist

Das ist kein Neuanfang. Diese Dinge stehen bereits im Repo und diese Lehren
sind bezahlt.

### Vorhandenes Werkzeug — nicht neu bauen

| Datei | Zweck |
| --- | --- |
| `tools/harness-common.mjs` | Server, Browser, App-Bootstrap, feste Kameras je Umgebung, `selectEnv`, `lockCamera` |
| `tools/screenshots.mjs` | Bildserie, `--env night`, `--all-envs` für die Regressionsprüfung |
| `tools/measure.mjs` | Draw-Calls, Dreiecke, Programme, Texturspeicher → JSON |
| `tools/inspect.mjs` | Aufschlüsselung: woraus die Draw-Calls bestehen |
| `tools/verify.mjs` | Ein Kommando: Build → Screenshots → Messung → Budgeturteil |
| `tools/pixel.mjs` | Pixelwert, Spaltenabtastung, Bildstatistik |
| `tools/region.mjs` | Kennzahlen eines Bildbereichs, `--hochpass` für Feinstruktur und Kantenstärke |
| `tools/crop.mjs` | Ausschnitt ohne Glättung vergrößern |
| `tools/diff.mjs` | Zwei Bilder vergleichen, mit `--karte` als Abweichungsbild |

Alle nehmen `--env night|zen|island`. Vorgabe ist `zen`; **gib `--env night`
immer mit**, sonst misst du die falsche Umgebung.

### Die sechs Nacht-Kameras stehen schon und sind eingefroren

`NIGHT_SHOTS` in `tools/harness-common.mjs`. **Diese Werte dürfen sich über
alle Durchläufe nicht mehr ändern**, sonst sind die Vergleichsbilder wertlos.

| Name | pos | look | fov |
| --- | --- | --- | ---: |
| a-eyelevel | −4.0, 1.6, 8.0 | 11.0, 7.0, −20.0 | 70 |
| b-moon | 0, 1.6, 4.0 | 14.0, 16.0, −24.0 | 60 |
| c-crater | −3.0, 1.7, 12.0 | −11.0, −0.6, 5.0 | 70 |
| d-aerial | 18.0, 14.0, 22.0 | 0, −0.5, 0 | 55 |
| e-ground | 2.0, 0.45, 5.0 | −2.0, −0.15, −3.0 | 60 |
| f-hills | 1.0, 1.6, 1.0 | −22.0, 3.5, −24.0 | 70 |

Der Ausgangsstand liegt als `tools/shots/night-00/` und
`tools/metrics/night-00.json` vor. **Fang mit dem Vergleich dagegen an, nicht
mit dem Bauen.**

### Zwei Messhinweise, die man kennen muss

* **Die Nacht-Bilder sind reproduzierbar**, solange nichts `Math.random()`
  benutzt. Eine Abweichung ist damit echt.
* **Die Insel ist nicht reproduzierbar.** Zwei Läufe desselben Standes
  unterscheiden sich bei `env-island.png` in 0,6 bis 0,9 % der Pixel (Schwelle
  2 von 255). Beim Regressionsblick auf die Insel zählt nur eine Abweichung
  deutlich darüber. `env-night`, `env-matrix` und `env-dojo` sind bitgleich
  bzw. praktisch bitgleich — dort ist jede Abweichung ein Befund.
* **Die Frame-Zeiten schwanken stark** (dieselbe Kamera zwischen zwei Läufen um
  Faktor 10). Benutz sie nicht als Argument.

### Bezahlte Lehren — bitte nicht wiederholen

**Zur Arbeitsweise:**

- **Nach zwei erfolglosen Anläufen aufhören zu raten und nachmessen.** Ich habe
  das in beiden bisherigen Aufträgen verletzt und beide Male teuer bezahlt.
  Zuletzt: Der Teich des Zen-Gartens sah halb leer aus, ich habe **dreimal** den
  Wasserstand angehoben, und erst ein Laufzeit-Auszug über zwölf Azimute
  (fünf Minuten) zeigte, dass die Wasserfläche in einer Achse gar nicht
  gestreckt war. Ein `page.evaluate` über die Szene klärt in fünf Minuten, was
  drei Durchläufe Raten nicht klären.
- **Während eines laufenden Messdurchlaufs nicht an `src/` arbeiten.** Vite lädt
  neu, der Durchlauf ist wertlos.
- **Ersetzungen im Quelltext treffen die erste Fundstelle, nicht deine.** Eine
  Änderung an `normalScale: new THREE.Vector2(0.9, 0.9)` sollte den Sand des
  Zen-Gartens treffen und traf den **Marsboden dieser Umgebung**. Gefunden nur,
  weil der Regressionsvergleich `env-night` mit 3,3 % abweichenden Pixeln
  meldete. Prüf nach jeder Ersetzung, welche Zeile du erwischt hast.

**Zu three und dem Renderer:**

- **`scale` wirkt auf die lokalen Achsen, vor der Drehung.** Eine
  `CircleGeometry` liegt in der XY-Ebene; wird sie um −90° um X gekippt, wird
  lokal-Y zu Welt-Z. `scale.set(rx, 1, rz)` streckt dann in Welt-Z gar nicht.
- **Wicklungsreihenfolge ausrechnen, nicht raten.** Für ein Band, das an einem
  Bogen entlanggezogen wird: Kreuzprodukt aus den beiden Kantenrichtungen
  hinschreiben, dann weiß man, wohin die Normale zeigt. Eine schwarze
  Innenfläche ist fast immer das.
- **Für φ' = φ + A·sin(f·φ) ist die Streuung des Abstands A·f**, nicht A. Ich
  habe A·f·Teilung gerechnet, kam auf 4 % und hatte 90 % im Bild.
- **`hashNoise` ist ein Hash, kein Rauschen.** Als Streuung je Scheitelpunkt
  richtig, als Umriss- oder Verlaufsfunktion ergibt es einen Zackenstern.
  Glatt und periodisch geht über eine Summe von Sinus-Termen mit ganzzahliger
  Frequenz (`welligerUmriss` in `src/environments.js`).
- **Gekachelte Verläufe brauchen ganzzahlige Faktoren.** Eine zweite
  Wolkenoktave mit Faktor 2,31 über 4 Umläufe ergab 9,24 — und eine senkrechte
  Naht quer durch den Himmel.
- **Ein Kranz aus Quadern hat Fugen.** 96 gerade Kisten entlang eines Bogens
  stoßen unter 2,8° aneinander und hinterlassen ein regelmäßiges Raster
  sichtbarer Kanten. Ein Profil, das am Bogen entlanggezogen wird, hat sie nicht.
- **Backticks in Kommentaren innerhalb eines Template-Literals** brechen den
  Shader-String. Der Build-Fehler zeigt auf die Kommentarzeile.
- **`vMapUv` gibt es nur, wenn das Material eine `map` hat.** three legt die
  UV-Varianten je Kartenslot an. Wer eine eigene UV braucht, deklariert eine
  eigene Varying.
- **`transparent` plus `side: DoubleSide` kostet zwei Draw-Calls**, nicht einen:
  three zeichnet erst Rück-, dann Vorderseiten. Für **ebene** Flächen ist der
  zweite Durchgang wirkungslos — `forceSinglePass: true`.
- **Scheitelfarben multiplizieren die Farbe, nicht die Deckkraft** — solange das
  Farbattribut drei Komponenten hat. Bei **vier** setzt three `USE_COLOR_ALPHA`
  und die vierte multipliziert die Deckkraft. Damit tragen viele gleichartige
  transparente Flecken in einem Draw-Call.
- **`vertexColors: true` ohne `color`-Attribut rendert schwarz.**
- **`continue` in einer `InstancedMesh`-Schleife** hinterlässt die
  Einheitsmatrix, also ein volles Objekt im Ursprung. Explizit auf Skalierung 0
  setzen.
- **`THREE.Fog` rechnet mit `-mvPosition.z`**, also der Tiefe entlang der
  Blickachse, nicht mit dem Abstand. Seitlich stehende Objekte bekommen
  deutlich weniger Dunst, als der Abstand vermuten lässt. Und der Nebel wird
  **nach** dem Tone-Mapping angewandt: Die Nebelfarbe landet als linearer Wert
  in einem sRGB-Bild und wirkt dunkler und satter, als der Hex-Wert aussieht.
- **Normal-Bias der Schattenkarte darf nicht in die Größenordnung des Objekts
  kommen.** 0,03 hat flache Trittsteine (6 cm dick) um ihren Schatten gebracht,
  0,008 ließ am Bambusfuß einen hellen Spalt (Peter-Panning). 0,0025 war richtig.

**Zu Licht und Tonwert:**

- **Lichtspitzen kommen nicht aus dem diffusen Anteil.** Bei Belichtung 1,1 und
  ACES braucht L 230 rund 1,45 linear — das ist mit vertretbarer Lichtstärke
  auf einer matten Fläche nicht zu haben. Spitzen kommen aus **Glanz** (niedrige
  Rauheit auf nassem oder glattem Material), aus **Eigenleuchten** mit
  `toneMapped: false`, und aus der Lichtquelle selbst. Für eine Nachtszene gilt
  das erst recht.
- **Aber: additiv plus voller Kern ergibt reines Weiß.** Die Sonnenscheibe des
  Zen-Gartens stand zu 20,7 % auf exakt (255,255,255) und hatte damit keine
  Farbe mehr. Kern deckeln.
- **Rauheit senken macht nicht eine Kante hell, sondern die Fläche.** Bei
  streifendem Blick auf eine waagerechte Fläche ist die Glanzkeule ohnehin
  breit; zwei Versuche, dem Kies eine Lichtkante zu geben, sahen beide lackiert
  aus.
- **Beleuchtete Materialien überstimmen einbebackene Lichtrichtung.** Wenn die
  Richtung in den Scheitelfarben stecken soll, muss das Material unbeleuchtet
  sein (`MeshBasicMaterial`).
- **Fresnel-Säume auf Flächen mit konstanter Normale** (`flatShading`,
  Blattkarten) werden zur **Flächen**helligkeit statt zur Kante. Kleiner Betrag,
  hoher Exponent — sonst sieht alles bereift aus.
- **Tonemapping-Sättigung.** Werte über ~0,9 landen im flachen Ast der
  ACES-Kurve; die Modellierung kollabiert dort zu einer weißen Fläche.

**Zu Detail und Abtastung:**

- **Der Detailgrad muss zur Abtastung passen.** Eine Struktur, deren Periode
  unter zwei Pixel fällt, kann nicht abgetastet werden; stehen bleibt Moiré.
  Rechnerische Muster können sich über `fwidth` ausblenden — aber sie dürfen
  nicht auf **nichts** ausblenden, sonst ist die Ferne leerer als vorher. Der
  Ausweg ist ein zweiter, gröberer Maßstab, der weiter trägt.
- **Eine gekachelte Textur mit erkennbaren Formen darin** (Einschlüsse,
  Abplatzer) verrät die Kachelung sofort. Reines Rauschen wiederholt sich
  unauffällig. Für große Flächen `cliffMaps()` in `src/dojo/stonework.js`
  ansehen — dort steht die Begründung ausführlich.
- **Korn muss zur Sichtweite passen.** Ein Texel von 1,25 mm ist physikalisch
  richtig für Sand und aus drei Metern nicht vorhanden, weil ein Pixel dort
  3,7 mm auflöst und die Mipmap längst gemittelt hat. Sichtbar ist, was gröber
  als etwa ein Zentimeter ist.
- **`mulberry32` ist ein gesäter Zufallsgenerator.** Ein zusätzlicher `rand()`-
  Aufruf verschiebt **alles** danach. Wenn nach einer Änderung plötzlich Steine
  woanders stehen, ist das die Ursache — kein neuer Fehler. Erst bauen, dann
  verschmelzen; dann verschiebt sich nichts.

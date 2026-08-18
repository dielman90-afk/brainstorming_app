# Prompt: 🪷 Zen-Garten auf das visuell Erreichbare bringen

> Zum Einfügen in eine **neue** Sitzung. Voraussetzung: Die Sitzung startet auf
> einem Branch, der die Himmelsinsel-Arbeit enthält (siehe „Ausgangslage").

---

Bring die Umgebung **🪷 Zen-Garten** in `src/environments.js`
(`createZenEnvironment`, ab Zeile ~4176) auf das visuell beste Niveau, das bei
stabilen 72 fps auf einer Meta Quest 3 standalone erreichbar ist.

## Harte Randbedingungen

- **Rein prozedural.** Keine externen Assets: kein GLB/GLTF, keine Bilddateien,
  keine CDN-Anfragen. Geometrie aus Code, Texturen aus `<canvas>`.
- **Keine neuen Laufzeit-Abhängigkeiten.** three@^0.185 und was in
  `package.json` steht. Playwright ist als Entwicklungswerkzeug erlaubt.
- **Maßstab bleibt 1:1.** Der Zen-Garten hat **kein** `WORLD_SCALE`: Die
  Sandfläche ist ein Kreis mit Radius 20 m, der Nebel läuft von 20 bis 46 m.
  Wer daran dreht, bricht Nebeldistanzen, Locomotion und Kartenplatzierung.
- **Keine Regressionen.** Karten, Whiteboard, Wrist-Menü, Locomotion, Zonen und
  die **vier anderen Umgebungen** (🏝 Himmelsinsel, 🌃 Nachtstadt, ⬜ Konstrukt,
  ⛩ Dojo) müssen unverändert funktionieren. `npm run build` muss nach jedem
  Durchlauf grün sein. Die Konsole muss im Headless-Lauf frei von Errors **und**
  Warnings sein.

## Budget

Gemessen wird mit aktivem Zen-Garten:

| Größe | Grenze | Ist-Zustand |
| --- | ---: | ---: |
| Draw-Calls env-zen | **≤ 120** | **166** ❌ |
| Dreiecke szenenweit | ≤ 350 000 | 20 028 ✅ |
| Texturspeicher | ≤ 60 MB | zu messen |
| Shader-Programme | – | 20 |

**Lies diese Tabelle genau.** Der Zen-Garten reißt das Draw-Call-Budget schon
im Ausgangszustand um 38 %, verbraucht aber nur **6 % des Dreiecksbudgets**.
Das ist exakt dieselbe Fehlverteilung, die die Himmelsinsel hatte: viele
winzige Einzelobjekte statt weniger verschmolzener Meshes. Zum Vergleich: Die
überarbeitete Himmelsinsel steht bei 77 Draw-Calls und 219 419 Dreiecken.

Instancing (`InstancedMesh`) und Geometrie-Verschmelzung (`mergeGeometries`,
die vorhandene `GeoBucket`-Hilfsklasse) sind **Pflicht, nicht Kür**.
Budgetverletzungen werden im **selben** Durchlauf behoben, nicht auf den
Schlusspass vertagt.

Zur Frame-Zeit: Der Container hat keine GPU, Chromium rendert per SwiftShader
in Software. Die Millisekunden sind **kein** Quest-Wert, sondern nur ein
Vergleichsmaßstab zwischen zwei Ständen. Behandle sie so und behaupte nichts
anderes.

## Qualitätsanspruch

Stilisiertes AAA im Erreichbaren — Journey, Sky: Children of the Light,
The Witness, Ghibli. **Ausdrücklich NICHT** Call of Duty, kein Fotorealismus.

Acht prüfbare Kriterien:

1. **Silhouette** – liest jede Form auch als reiner Umriss?
2. **Komposition** – Blickführung, Asymmetrie, bewusste Leere (*ma*)
3. **Licht** – Richtung, Schlagschatten, Kontaktverdunklung, Lichtspitzen
4. **Farbharmonie** – eine Tonart, keine Ausreißer
5. **Materialtrennung** – Sand, Stein, Wasser, Moos, Holz, Laub unterscheidbar
6. **Tiefenstaffelung** – Vordergrund, Mitte, Ferne messbar getrennt
7. **Bewegung** – Wind, Wasser, Koi, Blütenblätter; nichts im Gleichtakt
8. **Kein „Programmierer-Tell"** – keine sichtbare Regelmäßigkeit, Rasterung,
   Wiederholung; keine geometrischen Grundkörper, die als solche lesbar sind

## Arbeitspakete, in dieser Reihenfolge

1. **Draw-Call-Struktur.** 166 → ≤ 120, **ohne sichtbare Änderung**. Erst
   messen, woraus die Calls bestehen (`tools/inspect.mjs`), dann verschmelzen.
   Dieses Paket steht vorn, weil sonst jedes spätere Paket gegen ein bereits
   gerissenes Budget arbeitet.
2. **Sand.** Die größte Fläche im Bild und damit der größte Hebel: Harkmuster,
   Relief in den Rillen, Korn, Ausbleichen zum Rand, Übergang zum Moos.
3. **Licht & Atmosphäre.** Später Nachmittag. Schlagschatten, Kontakt-
   verdunklung, warme Lichtspitzen, Streulicht durch das Laub.
4. **Wasser.** Teich mit Ufer, Tiefenton, Nässe an den Steinen, Wasserlinie,
   Spiegelung. Kein aufgeklebtes hellblaues Band.
5. **Bepflanzung.** Sakura, Ahorn, Bambus, Moos: Silhouette, Astlage,
   Blattmassen statt Konfetti.
6. **Steinwerk.** Trittsteine, Laterne, Torii: Verwitterung, gebrochene Kanten,
   Standfestigkeit im Boden.
7. **Komposition.** Blickführung, Asymmetrie, bewusste Leere. Ein Zen-Garten
   ist gestaltet, nicht gestreut — das ist sein Unterschied zur Insel.
8. **Leben & Bewegung.** Koi, fallende Blütenblätter, Staub, Wind. Alles mit
   eigener Phase; nichts im Gleichtakt.
9. **Schlusspass.** Performance, Konsistenz, Gesamtprüfung aller Bilder.

## Ablauf je Durchlauf

- **A** Genau **ein vollständiges** Paket bauen. Nicht drei halbe.
- **B** `npm run build` grün, Konsole sauber.
- **C** Screenshots von den festen Zen-Kameras.
- **D** Messung (Draw-Calls, Dreiecke, Texturspeicher, Frame-Zeit).
- **E** Regressionsprüfung der anderen vier Umgebungen.
- **F** Der Prüfer (siehe unten).
- **G** Auswertung: Was ist bestanden, was offen, was war mein Fehler.

**Maximal 4 Durchläufe je Paket.** Ist es danach nicht bestanden: offene Punkte
nach `prompts/zengarten-log.md` schreiben, mir das klar sagen, zum nächsten
Paket gehen.

## Der Prüfer

**Genau EIN** Sub-Agent als Prüfer (claude-opus-5, reasoning effort high), vor
jedem Durchlauf neu gebrieft. Kein Fan-out, keine parallelen Agenten.

Er urteilt je Kriterium **bestanden / nicht bestanden mit Begründung**, listet
Mängel **nach visueller Wirkung** sortiert, schlägt **keine** Implementierung
vor und schreibt **keinen** Code. Gib ihm die Messwerkzeuge (`tools/pixel.mjs`,
`tools/region.mjs`, `tools/crop.mjs`) und verlange Befunde mit Koordinate und
Zahl statt Eindrücken.

## Abbrechen und melden, wenn

- ein Paket nach 4 Durchläufen nicht besteht (weitermachen, aber melden),
- das Budget nur auf Kosten des Aussehens zu halten ist,
- eine Änderung eine andere Umgebung oder eine App-Funktion bricht,
- der Prüfer dreimal denselben Mangel ohne Fortschritt wiederholt.

## Commits und Protokoll

- Ein Commit je bestandenem Paket. Nachricht beschreibt, was **sichtbar** anders
  ist, plus Vorher/Nachher-Messwerte.
- Harness-Code gehört nach `tools/`, nicht nach `src/`.
- `prompts/zengarten-log.md` wird **jeden** Durchlauf fortgeschrieben.

## Ehrlichkeit

Berichte den Zustand, wie er ist. Ein geschöntes „AAA erreicht" ist wertlos —
ich sehe mir die Screenshots selbst an. Eigene Fehler gehören ins Protokoll.

---

## Was aus dem Himmelsinsel-Durchlauf zu übernehmen ist

Das ist kein Neuanfang. Diese Dinge stehen bereits im Repo und diese Lehren
sind bezahlt:

**Vorhandenes Werkzeug — nicht neu bauen:**

| Datei | Zweck |
| --- | --- |
| `tools/harness-common.mjs` | Server, Browser, App-Bootstrap, feste Kameras, `selectEnv`, `lockCamera` |
| `tools/screenshots.mjs` | Bildserie, `--all-envs` für die Regressionsprüfung |
| `tools/measure.mjs` | Draw-Calls, Dreiecke, Programme, Texturspeicher → JSON |
| `tools/inspect.mjs` | Aufschlüsselung: woraus die Draw-Calls bestehen |
| `tools/verify.mjs` | Ein Kommando: Build → Screenshots → Messung → Budgeturteil |
| `tools/pixel.mjs` | Pixelwert, Spaltenabtastung, Bildstatistik |
| `tools/region.mjs` | Kennzahlen eines Bildbereichs |
| `tools/crop.mjs` | Ausschnitt ohne Glättung vergrößern |

**Erste Aufgabe am Harness:** Er ist auf die Insel eingerichtet. Trage in
`harness-common.mjs` einen festen Satz Zen-Kameras ein (vier bis sechs) und
friere sie ein — **diese Werte dürfen sich über alle Durchläufe nicht mehr
ändern**, sonst sind die Vergleichsbilder wertlos. Vorschlag als Startpunkt,
gemessen brauchbar:

```
a-eyelevel  pos [0, 1.6, 6]      look [0, 1.0, -12]   fov 70
b-pond      pos [2.5, 1.5, 2.0]  look [-3.0, 0.2, -4] fov 65
c-torii     pos [-4.0, 1.6, 5.0] look [3.0, 1.4, -8]  fov 70
d-aerial    pos [10, 9, 12]      look [0, 0, 0]       fov 55
```

**Bezahlte Lehren — bitte nicht wiederholen:**

- **Nach zwei erfolglosen Anläufen aufhören zu raten und nachmessen.** Am
  Schattenvolumen und an den Vogelbahnen sind je drei Durchläufe verbrannt,
  weil ich Symptome kuriert habe. Ein Laufzeit-Auszug (`page.evaluate` über die
  Szene) klärt in fünf Minuten, was drei Durchläufe Raten nicht klären.
- **Während eines laufenden Messdurchlaufs nicht an `src/` arbeiten.** Vite lädt
  neu, der Durchlauf ist wertlos. Zweimal passiert.
- **`mulberry32` ist ein gesäter Zufallsgenerator.** Ein zusätzlicher `rand()`-
  Aufruf verschiebt **alles** danach. Wenn nach einer Änderung plötzlich Wolken
  und Steine woanders stehen, ist das die Ursache — kein neuer Fehler.
- **Fresnel-Säume auf Flächen mit konstanter Normale** (`flatShading`,
  Blattkarten) werden zur **Flächen**helligkeit statt zur Kante. Kleiner Betrag,
  hoher Exponent — sonst sieht alles bereift aus.
- **Scheitelfarben multiplizieren die Farbe, nicht die Deckkraft.** Ausblenden
  braucht eine `alphaMap`.
- **`vertexColors: true` ohne `color`-Attribut rendert schwarz.**
- **Beleuchtete Materialien überstimmen einbebackene Lichtrichtung.** Wenn die
  Richtung in den Scheitelfarben stecken soll, muss das Material unbeleuchtet
  sein (`MeshBasicMaterial`).
- **Tonemapping-Sättigung.** Werte über ~0,9 landen im flachen Ast der
  ACES-Kurve; die Modellierung kollabiert dort zu einer weißen Fläche.
- **`THREE.Fog` rechnet mit `-mvPosition.z`**, also der Tiefe entlang der
  Blickachse — nicht mit dem Abstand. Seitlich stehende Objekte bekommen
  deutlich weniger Dunst, als der Abstand vermuten lässt.
- **`continue` in einer `InstancedMesh`-Schleife** hinterlässt die
  Einheitsmatrix, also ein volles Objekt im Ursprung. Explizit auf Skalierung 0
  setzen.
- **Eine gekachelte Textur mit erkennbaren Formen darin** (Einschlüsse,
  Abplatzer) verrät die Kachelung sofort. Reines Rauschen wiederholt sich
  unauffällig. Für große Flächen `cliffMaps()` in `src/dojo/stonework.js`
  ansehen — dort steht die Begründung ausführlich.
- **Der Detailgrad muss zur Abtastung passen.** Ein Sägezahn über eine
  Flankenkoordinate, der mit zwei Stützstellen je Periode abgetastet wird,
  kippt in eine Treppe um. Das sieht aus wie ein Formfehler, ist aber
  Unterabtastung.

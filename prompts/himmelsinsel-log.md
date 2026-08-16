# 🏝 Himmelsinsel – Überarbeitungsprotokoll

Fortlaufendes Protokoll der Durchläufe: Arbeitspaket, Durchlauf-Nr., Messwerte,
Prüfer-Urteil, offene Punkte.

## Werkzeuge

| Datei | Zweck |
| --- | --- |
| `tools/harness-common.mjs` | Server-Start, Browser, App-Bootstrap, **die sechs festen Kamerapositionen** |
| `tools/screenshots.mjs` | Sechs Insel-Ansichten (+ `--all-envs`: je ein Bild der drei anderen Umgebungen) |
| `tools/measure.mjs` | Draw-Calls, Dreiecke, Programme, Texturspeicher, Frame-Zeit → JSON |
| `tools/inspect.mjs` | Aufschlüsselung: woraus die Draw-Calls bestehen |
| `tools/verify.mjs` | Ein Kommando: Build → Screenshots → Messung → Budget-Urteil |

Aufruf eines Durchlaufs: `node tools/verify.mjs run-NN`

### Kamerapositionen (unveränderlich)

| # | Name | Position | Blickziel | FOV |
| --- | --- | --- | --- | --- |
| 1 | Augenhöhe Inselmitte | 1.5 / 1.6 / 9.0 | −2 / 1.2 / −14 | 70° |
| 2 | Blick zum Wasserfall | −2 / 1.7 / 6.0 | 15.5 / −1.5 / −9.1 | 65° |
| 3 | Über die Kante nach unten | 0 / 2.0 / 18.5 | 0 / −13 / 27 | 75° |
| 4 | Totale von schräg oben | 36 / 24 / 38 | 0 / −4 / 0 | 55° |
| 5 | Gegenlicht in die Sonne | −9 / 1.7 / 12 | 22 / 14 / −18 | 70° |
| 6 | Nahaufnahme Bodenvegetation | 4.6 / 0.55 / 7.4 | 1.0 / −0.15 / 1.6 | 60° |

### Ehrliche Einordnung der Frame-Zeit

Der Container hat **keine GPU** (`/dev/dri` fehlt); Chromium rendert per
SwiftShader in Software. Zum Vergleich: die leere ⬜-Konstrukt-Umgebung kostet
bei 1280×720 rund **0,45 ms**, die Insel im Ausgangsstand **105–175 ms**. Der
im Auftrag genannte Zielwert „≤ 8 ms im Desktop-Headless-Harness" ist unter
einem Software-Rasterizer für **keine** nicht-triviale Szene erreichbar und
sagt nichts über die Quest 3 aus. Die Zahl wird deshalb als **relativer**
Vergleichswert zwischen zwei Ständen geführt, nicht als bestandene/nicht
bestandene Budgetgrenze. Die belastbaren Budgetgrenzen sind Draw-Calls,
Dreiecke und Texturspeicher – und die sind auf der Quest ohnehin die
entscheidenden Größen.

---

## Durchlauf 0 – Bestandsaufnahme (Ausgangswerte)

Commit-Basis: `claude/himmelsinsel-optimization-2g3px8`, Stand vor der Überarbeitung.

### Messwerte (`tools/metrics/run-00.json`)

| Kameraposition | Draw-Calls | Dreiecke | Renderzeit (SW) |
| --- | ---: | ---: | ---: |
| 1 Augenhöhe | 102 | 25 744 | 114,5 ms |
| 2 Wasserfall | 84 | 18 714 | 168,8 ms |
| 3 Kante | 112 | 29 036 | 174,5 ms |
| 4 Totale | 111 | 30 752 | 105,3 ms |
| 5 Gegenlicht | 95 | 20 758 | 127,4 ms |
| 6 Bodennah | 78 | 21 768 | 130,6 ms |

| Budget | Ist | Grenze | |
| --- | ---: | ---: | --- |
| Draw-Calls (env-island) | **112** | 120 | knapp – nur 8 Reserve |
| Dreiecke (Szene) | 30 752 | 350 000 | 11× Reserve |
| Texturspeicher | 0,50 MB | 60 MB | 120× Reserve |
| Shader-Programme | 12 | – | |
| Konsole | sauber | – | |

### Aufschlüsselung der Draw-Calls (`tools/inspect.mjs`)

| Art | Knoten | Calls | Dreiecke |
| --- | ---: | ---: | ---: |
| Icosaeder-Meshes (Steine, Blumen-Einzelteile) | 40 | 40 | 1 880 |
| BufferGeometry (25 Wolken, 6 Felsunterseiten, 6 Rankenbündel, Fluss) | 38 | 38 | 41 356 |
| Cylinder (Baumstämme, mehrmaterialig) | 19 | 31 | 1 568 |
| **Blob-Schatten** | **28** | **28** | 56 |
| CircleGeometry (Quelle, Becken) | 12 | 12 | 148 |
| ConeGeometry (Nadelbaum-Etagen) | 10 | 10 | 280 |
| PlaneGeometry (Vogelflügel) | 8 | 8 | 16 |
| Sprites (Sonne, Dunst, Gischt, Schaum) | 4 | 4 | 0 |
| InstancedMesh (Blumen, Grasbüschel, Büsche, Pilze) | 4 | 4 | 3 392 |
| Sonstige (Kuppel, Regenbogen, Wassertropfen) | 3 | 3 | 2 416 |
| **Summe** | **166** | **178 potentiell / 112 gerendert** | 51 112 |

### Befund

Das Budget ist **falsch verteilt**: Draw-Calls sind zu 93 % ausgereizt,
Dreiecke zu 9 %, Texturspeicher zu 0,8 %. Die Umgebung besteht aus sehr vielen
sehr einfachen Einzelobjekten – genau das Profil, das eine mobile GPU
(Quest 3, XR2 Gen 2) am schlechtesten verträgt. Allein 28 Draw-Calls gehen für
Blob-Schatten mit zusammen 56 Dreiecken drauf.

Die Überarbeitung muss deshalb zuerst **verschmelzen und instanzieren**, um
Draw-Calls freizuräumen, und den freien Dreiecks- und Texturspeicher in echte
Form- und Materialdichte investieren.

### Arbeitspakete (Reihenfolge = Priorität)

1. Silhouette & Fels
2. Licht & Atmosphäre
3. Terrain-Material
4. Vegetation
5. Wasser
6. Wolken & Tiefe
7. Leben
8. Mini-Inseln
9. Performance-Pass

### Nebenbei behoben (Voraussetzung für „Konsole sauber")

- `THREE.Clock` → `THREE.Timer` in `src/main.js` (three r185 warnt bei jedem Start).
- `getContext('2d', { willReadFrequently: true })` für die Bildröhre im ⬜ Konstrukt.

Beides ist verhaltensneutral; die Regressionsbilder der drei anderen Umgebungen
liegen als Referenz in `tools/shots/reference/`.

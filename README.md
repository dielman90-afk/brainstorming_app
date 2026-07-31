# 🧠 WebXR Brainstorming für die Meta Quest 3

Eine Mixed-Reality-Brainstorming-App: Ideen-Karten schweben als 3D-Panels im Raum
(Passthrough auf der Quest 3), lassen sich mit den Controllern greifen und anordnen,
und Claude generiert auf Knopfdruck verwandte Ideen, Cluster-Vorschläge und
Zusammenfassungen.

**Stack:** Three.js + WebXR · Vite · Node/Express-Proxy für die Anthropic Messages API
(Modell `claude-sonnet-4-6`, API-Key nur serverseitig).

**Design:** „Soft Spatial Minimal" aus [claude.ai/design](https://claude.ai/design) –
warmes Anthrazit-Glas mit einem Amber-Akzent (`#ffb454`), Fonts *Space Grotesk*
+ *Sora* (via Google Fonts; ohne Internet greift der System-Font-Fallback).

## Features

- **Mixed Reality / VR:** Startet bevorzugt als `immersive-ar` (Passthrough auf der
  Quest 3), Fallback auf `immersive-vr`.
- **Vier virtuelle Umgebungen** (`src/environments.js`, komplett prozedural, ohne
  externe Assets): Der Button **„🌐 Umgebung“** schaltet zyklisch durch
  Passthrough/Weiß → **🏝 Himmelsinsel** (Low-Poly-Insel mit Bäumen, Büschen,
  Pilzen, Blumen, Fluss samt Wasserfall mit Schaum & Regenbogen, hängenden Ranken
  unter den Inseln, kreisenden Vögeln, Schmetterlingen, 3D-Wolken – auch unter den
  Inseln – und schwebenden Mini-Inseln) →
  **🌌 Nachthimmel** (Sternenfeld, Mond und natürlicher **Mars-Untergrund** mit
  Kratern, Felsen und Hügeln) → **🪷 Zen-Garten** (geharkter Sand, Koi-Teich mit
  Seerosen, Lotus & Wasser-Ringen, Bambushain, Kirschblüten- und Ahornbaum,
  Steinlaterne, Torii, Blütenblätter, Staubpartikel im Licht und Bodennebel) →
  **🌐 Studio** (schlichter heller Verlauf) → **⬜ Konstrukt** (nahtloser,
  komplett weißer Void im Stil des „Matrix“-Ladeprogramms – Kuppel und Boden im
  selben Weißton, kein sichtbarer Horizont, gleichmäßiges schattenfreies Licht).
  Keine Umgebung hat ein Boden-Raster; filmisches Tone-Mapping, weiche
  Beleuchtung, gebackenes Vertex-Shading und gefälschte Kontaktschatten
  (Blob-Shadows) sorgen für Tiefe ohne teure Echtzeit-Schatten. Die Auswahl wird
  gemerkt; eine reine VR-Session startet direkt in der zuletzt genutzten Umgebung
  (sonst Himmelsinsel).
- **Weltmaßstab:** Die Himmelsinsel ist 1:1 zum Nutzer bemaßt – Bäume rund 6 m,
  die Hauptinsel gut 40 m breit, Büsche auf Schulterhöhe. Sie war ursprünglich
  als Diorama modelliert (Bäume 1,6 m, Insel 10 m), wodurch man in VR wie ein
  Riese über der Landschaft stand. Der Faktor sitzt als `WORLD_SCALE` in
  `createIslandEnvironment` und skaliert die komplette Gruppe, sodass
  Lichtrichtungen, Blickwinkel und Silhouetten unverändert bleiben; die
  Nebeldistanzen gehen denselben Weg mit. Die Karten sind davon unberührt – sie
  bleiben handgroß und in Reichweite.
- **Fortbewegung durch die Landschaft** (`src/locomotion.js`): Ein Player-Rig
  (Gruppe mit Kamera + Controllern) bewegt den Nutzer durch die Welt. **Desktop:**
  WASD/Pfeile bewegen, Q/E runter/hoch – die gewohnte Orbit-Ansicht und
  Karten-Bedienung bleiben erhalten. **VR:** linker Stick = sanftes Gleiten in
  Blickrichtung (analog dosierbar), rechter Stick = Snap-Turn (komfortables
  ruckartiges Drehen). **Ohne Controller:** ins Leere pinchen und die Hand
  bewegen – man greift die Welt und zieht sich daran entlang; mit beiden Händen
  kommt Drehen dazu. Ein Pinch auf eine Karte oder einen Button greift bzw.
  klickt weiterhin und bewegt nicht. Der Zug ist um Faktor 8 übersetzt
  (`HAND_GAIN`) – 1:1 wäre auf einer 40 m breiten Insel unbrauchbar, so trägt
  ein Armzug rund 3 m. Gedreht wird dagegen 1:1, weil verstärkte Drehung
  desorientiert. Der Zug bleibt horizontal, damit man nicht unbeabsichtigt
  abhebt, und einzelne Frames werden vor der Übersetzung gekappt, damit ein
  Tracking-Aussetzer keinen Sprung auslöst.
- **Ideen-Karten:** Schwebende 3D-Panels mit Text. Per Controller-Ray anvisieren,
  mit dem Trigger greifen, verschieben und frei im Raum anordnen.
- **Hand-Menü** (`src/wristMenu.js`) auf zwei Reitern à fünf Reihen, damit das
  Panel trotz 19 Aktionen kompakt bleibt:
  - **💡 Ideen:** *Neue Karte*, *Themen-Start*, *Verwandte Ideen*, *Kritiker*,
    *Cluster*, *Zusammenfassen*, *Farbe*, *Verbinden*, *Karte löschen*
  - **🗂 Board:** *Rückgängig*, *Wiederholen*, *Zone*, *Timer*, *Whiteboard*,
    *Umgebung*, *Sichern*, *Laden*, *Als Datei*, *Alles löschen* (mit
    Zweifach-Bestätigung)

  Das Menü sitzt **mit Controllern** über dem Handrücken der linken Hand und
  reicht nach vorn ins Blickfeld (statt hinter dem Handgelenk Richtung
  Ellenbogen). **Ohne Controller** – also bei Hand-Tracking – schwebt es
  verkleinert über der **offenen Handfläche** und blendet sich automatisch ein,
  sobald die flache Hand zum Gesicht zeigt; bei Faust oder abgewandter Hand
  verschwindet es wieder. Buttons werden mit dem Ray der anderen Hand
  angevisiert und per Trigger bzw. Pinch geklickt. Die Hände werden bei
  Hand-Tracking als Gelenk-Kugeln dargestellt (prozedural, ohne externe Assets).
- **Undo/Redo:** Vollständiger Verlauf über *Anlegen, Löschen, „Alles löschen",
  Verschieben, Größe, Farbe, Text, Cluster, Verbindungen, Zonen, Import und
  Laden* –
  am Desktop per **Strg+Z / Strg+Umschalt+Z** (oder Strg+Y) und über die Buttons
  im Overlay, in VR über *„↶ Rückgängig"* / *„↷ Wiederholen"* im Menü. Intern
  sichert `src/history.js` pro Schritt einen Board-Snapshot (bis zu 60 Schritte);
  beim Zurücksetzen werden bestehende Karten anhand ihrer ID aktualisiert statt
  neu aufgebaut, damit Auswahl und Objekt-Identität erhalten bleiben. Die
  Whiteboard-Zeichnung ist bewusst *nicht* Teil des Verlaufs (ein PNG pro
  Schritt).
- **KI-Funktionen** (Server-Proxy → Anthropic Messages API mit Structured
  Outputs/JSON-Schema):
  - **Themen-Start:** Thema nennen → Claude füllt das Board mit 8–10 Start-Ideen.
  - **Verwandte Ideen:** 4–6 neue Ideen zur ausgewählten Karte, als Karten im
    Halbkreis vor dem Nutzer (Batches vertikal gestaffelt).
  - **Cluster anwenden:** Claude gruppiert die vorhandenen Karten thematisch –
    die Karten werden räumlich in Cluster-Spalten sortiert, pro Cluster
    eingefärbt und mit einer 📌-Titelkarte versehen.
  - **Zusammenfassen:** Das ganze Board als eine Karte.
  - **😈 Kritiker (Advocatus Diaboli):** Nennt 3–5 kritische Einwände, Risiken
    oder Gegenargumente zur ausgewählten Karte – als rote Karten.

  **Fehlerbehandlung und Ladeanzeige:** Jede Anfrage hat eine harte Zeitgrenze
  (45 s, für die Whiteboard-Vision 90 s) und wird bei Zeitüberschreitung,
  Verbindungsabbruch, `429` oder `5xx` bis zu dreimal mit wachsender Wartezeit
  wiederholt; ein `4xx` gilt als endgültig und wird nicht wiederholt. Während
  Claude arbeitet, läuft im Blickfeld eine **Ladeanzeige** mit Aktion,
  Sekundenzähler und – bei einem Wiederholversuch – dessen Nummer und Wartezeit
  (am Desktop zusätzlich als Ring im Status-Band). Schlägt eine Anfrage
  endgültig fehl, erscheint statt eines stillen Abbruchs eine **Fehlerkarte** im
  Raum mit Klartext („Server nicht erreichbar", „Zeitüberschreitung nach 45 s",
  der Serverfehler selbst); sie lässt sich anklicken bzw. mit Esc schließen und
  verschwindet sonst nach 10 s. Serverseitig bricht die Anfrage etwas früher ab
  als im Client, damit eine sprechende Meldung ankommt statt eines abgebrochenen
  `fetch`.
- **Kartenfarben:** 7 Farben pro Karte (mit leuchtendem Akzentstreifen am linken
  Rand) – am Desktop über die Farbpunkte im Rechtsklick-Menü, in VR über
  „🎨 Farbe“ (wechselt zyklisch). Cluster färben automatisch.
- **Kartengröße:** Jede Karte ist von 0,45× bis 2,2× skalierbar – am Desktop per
  **Mausrad über der Karte** oder **+/−** (bei ausgewählter Karte), in VR per
  **Daumenstick hoch/runter, während die Karte gegriffen ist**. Die Größe wird
  gespeichert und exportiert.
- **Verbindungslinien (Mindmap):** Karte auswählen → „🔗 Verbinden“ (Menü bzw.
  Rechtsklick → „Verbinden mit…“) → Ziel-Karte anklicken. Nochmal verbinden
  entfernt die Linie; Esc bricht ab. Linien folgen den Karten beim Verschieben.
- **Texteingabe:** Web Speech API (Deutsch), Fallback auf eine virtuelle
  3D-Tastatur. *Hinweis: Der Quest-Browser unterstützt die Web Speech API derzeit
  nicht – dort öffnet sich automatisch die Tastatur.*
- **📋 Whiteboard:** Ein zeichenbares Board im Raum (ein-/ausblenden über Menü
  bzw. Overlay-Button). Werkzeugleiste mit **Stift, Marker (halbtransparent),
  Radierer, 6 Farben, 3 Strichstärken, Formen (Linie/Rechteck/Kreis mit
  Live-Vorschau), Board wischen, Größe ➕/➖** und **🪄 „Zu Karten“**: Claude
  analysiert die Skizze per Vision und erzeugt daraus 3–8 Ideen-Karten.
  Zeichnen: am Desktop mit gedrückter Maustaste auf der Fläche, in VR mit
  gehaltenem Trigger. Verschieben über die Griffleiste oben (greifen wie eine
  Karte), Größe 0,6×–2,5× per ➕/➖, Mausrad über der Griffleiste oder Stick beim
  Halten. Zeichnung, Position und Größe werden mitgespeichert und exportiert.
- **🗂️ Zonen / Rahmen:** Beschriftete, halbtransparente Flächen zum räumlichen
  Gruppieren von Karten (z. B. „To Do / Doing / Done“). Greifbar zum Verschieben,
  skalierbar, per ✎ umbenennbar, 🎨 einfärbbar und ✕ löschbar. Werden im Board
  gespeichert und exportiert.
- **⏱️ Timer / Timebox:** Schwebende Uhr für moderierte Runden mit Presets
  (1/3/5/10 min), Start/Pause, Reset, Fortschrittsbalken und Gong bei Ablauf.
  Über das Menü ein-/ausblendbar, greifbar zum Positionieren.
- **Automatisches Speichern:** Das Board (Texte, Positionen, Farben,
  Verbindungen, Zonen und Whiteboard-Zeichnung) wird laufend im Browser gespeichert
  (localStorage) und beim nächsten Öffnen wiederhergestellt – auch nach einem
  Browser-Neustart. Gilt pro Gerät/Browser.
- **Board-Export/-Import** als JSON – am Desktop über „Export“/„Import“ im
  Overlay, in VR über *„⬇️ Als Datei"* im Menü (die Datei landet im
  Download-Ordner des Quest-Browsers und ist nach der Sitzung dort zu finden).
  Importiertes JSON wird vor dem Anwenden geprüft; ein defektes Board erzeugt
  eine klare Meldung statt eines halb geladenen Zustands.
- **Sicherungspunkte** (*„💾 Sichern"* / *„📂 Laden"*): manuelle Wiederherstellungs-
  punkte im Browser-Speicher, die letzten drei werden behalten. Das ist der Weg,
  der **auch mitten in einer XR-Sitzung** funktioniert – ein Datei-Dialog würde
  die immersive Sitzung verlassen. Ist der Speicher voll, werden erst ältere
  Punkte und zuletzt die Whiteboard-Zeichnung geopfert, bevor aufgegeben wird.
- **Desktop-Fallback:** Läuft ohne Headset im normalen Browser – Maus-Steuerung
  (Orbit), Karten per Klick auswählen und ziehen, alle Aktionen über das Overlay
  links oben. Ideal zum schnellen Iterieren. Das Overlay ist auf die Fensterhöhe
  begrenzt und **scrollt bei Bedarf selbst**, damit auch auf niedrigen Fenstern
  alle Bedienelemente bis hinunter zum XR-Button erreichbar bleiben.

## Projektstruktur

```
├── index.html              Overlay-UI (Desktop) + Einstieg
├── src/
│   ├── main.js             Szene, XR-Session (AR→VR-Fallback), Verdrahtung
│   ├── cards.js            IdeaCard + CardManager (Halbkreis-Anordnung, Serialisierung)
│   ├── interactions.js     Controller-/Hand-Raycasting, Grab + Maus-Fallback
│   ├── locomotion.js       Fortbewegung (Player-Rig): VR-Gleiten + Snap-Turn
│   ├── wristMenu.js        Menü-Panel an Controller bzw. Handfläche
│   ├── history.js          Undo/Redo (Board-Snapshots)
│   ├── hud.js              Statuszeile, Ladeanzeige und Fehlerkarte im Blickfeld
│   ├── keyboard.js         Virtuelle 3D-Tastatur (Fallback)
│   ├── speech.js           Web Speech API Wrapper
│   ├── ai.js               Client für den Server-Proxy (Timeout + Wiederholung)
│   ├── boardState.js       JSON-Export/-Import, Sicherungspunkte + Autosave
│   ├── environments.js     Fünf prozedurale Umgebungen (Insel, Mars-Nacht, Zen, Studio, Konstrukt)
│   ├── whiteboard.js       Zeichenbares Whiteboard mit Werkzeugleiste + KI-Analyse
│   ├── zones.js            Räumliche Zonen/Rahmen zum Gruppieren von Karten
│   ├── timer.js            Schwebende Timebox-Uhr mit Gong
│   └── textPanel.js        Canvas-Textur-Panels für Text
├── server/
│   ├── index.js            Express-Proxy (lokale Entwicklung)
│   └── ai-core.js          Anthropic-Aufruf, Prompts, JSON-Schema, Mock-Modus
├── netlify/functions/      Serverless-Variante des Proxys (für Netlify)
└── netlify.toml
```

## Setup

Voraussetzungen: **Node.js ≥ 20** und npm.

```bash
npm install
cp .env.example .env       # ANTHROPIC_API_KEY eintragen
npm run dev
```

`npm run dev` startet beides: den Express-Proxy (Port 3001) und den Vite-Dev-Server
(Port 5173, HTTPS via mkcert). Vite leitet `/api/*` an den Proxy weiter – der
API-Key verlässt den Server nie.

**Ohne API-Key testen:** `MOCK_AI=1 npm run dev` liefert statische Beispiel-Ideen,
damit der komplette Ablauf (Karten, Menü, Halbkreis) ohne Key funktioniert.

## Desktop-Test (ohne Headset)

Einfach `https://localhost:5173` öffnen:

| Aktion | Bedienung |
|---|---|
| Umschauen | Linke Maustaste ziehen (Orbit), Scrollen = Zoom |
| **Bewegen** | **W A S D / Pfeiltasten** durch die Landschaft, **Q / E** runter / hoch (Orbit-Ansicht bleibt erhalten) |
| Karte auswählen | Karte anklicken (Cyan-Rahmen = ausgewählt) |
| Karte verschieben | Karte anklicken und ziehen |
| Karte bearbeiten | **Doppelklick** auf die Karte (oder F2 bei ausgewählter Karte) |
| Kartengröße | **Mausrad über der Karte** oder **+ / −** bei ausgewählter Karte |
| Karte löschen | **Rechtsklick → „Karte löschen“** oder **Entf/Backspace** bei ausgewählter Karte |
| Kontextmenü | **Rechtsklick** auf eine Karte: Bearbeiten · Verwandte Ideen · Kritiker · Verbinden · Farbe · Löschen |
| Karte einfärben | Rechtsklick → Farbpunkt anklicken |
| Karten verbinden | Rechtsklick → „Verbinden mit…“ → Ziel-Karte anklicken (nochmal = Linie entfernen, Esc = abbrechen) |
| Neue Karte | Text ins Eingabefeld, „Neue Karte“ oder Enter |
| Themen-Start | Thema ins Eingabefeld → „🚀 Themen-Start“ |
| KI-Funktionen | Buttons „Verwandte Ideen“ / „Kritiker“ / „Cluster anwenden“ / „Zusammenfassen“ |
| **Rückgängig / Wiederholen** | **Strg+Z** / **Strg+Umschalt+Z** (auch Strg+Y) oder die Buttons im Overlay |
| Sicherungspunkt | „💾 Sichern“ / „📂 Laden“ im Overlay |
| Export/Import | Buttons im Overlay |
| Fehlerkarte schließen | Anklicken oder **Esc** |

## Auf der Quest 3 öffnen

WebXR funktioniert nur über **HTTPS** – dafür sorgt `vite-plugin-mkcert`.

### Variante A: Lokales Netzwerk (schnellste Iteration)

1. PC und Quest 3 ins **gleiche WLAN**.
2. `npm run dev` starten. Vite zeigt die Netzwerk-URL an, z. B.
   `https://192.168.1.42:5173`.
3. Diese URL im **Quest-Browser** öffnen. Beim ersten Mal erscheint eine
   Zertifikatswarnung (das mkcert-Zertifikat ist auf der Quest nicht als
   vertrauenswürdig installiert): **„Erweitert“ → „Trotzdem fortfahren“**.
4. Auf **„🥽 Mixed Reality starten (Passthrough)“** tippen. Unterstützt der
   Browser kein `immersive-ar`, bietet der Button automatisch VR an.

> Firewall-Hinweis: Port 5173 muss aus dem WLAN erreichbar sein. Der API-Proxy
> (3001) wird nur von Vite auf dem PC angesprochen und muss nicht freigegeben werden.

### Variante B: Deployment auf Netlify

Der Express-Server wird in Produktion durch eine Netlify Function ersetzt
(`netlify/functions/generate.mjs` – identische Logik, gleicher Endpunkt `/api/generate`).

1. Repo bei Netlify verbinden (Build-Command `npm run build`, Publish-Ordner `dist`
   – steht bereits in `netlify.toml`).
2. In den Site-Settings die Umgebungsvariable **`ANTHROPIC_API_KEY`** setzen
   (optional `MOCK_AI=1` für eine Demo ohne Key).
3. Deployen und die `https://….netlify.app`-URL im Quest-Browser öffnen –
   echtes Zertifikat, keine Warnung.

### Bedienung in VR/MR

| Aktion | Bedienung |
|---|---|
| **Bewegen (Gleiten)** | **Linker Daumenstick** – gleitet in Blickrichtung durch die Welt (analog dosierbar) |
| **Drehen (Snap-Turn)** | **Rechter Daumenstick links/rechts** – dreht ruckartig (komfortabel) |
| Karte greifen/verschieben | Mit dem Controller-Ray anvisieren, **Trigger halten**, loslassen zum Ablegen |
| Kartengröße | Karte greifen, dann **Daumenstick hoch/runter** |
| Karte auswählen | Kurz mit dem Trigger antippen (Cyan-Rahmen) |
| Menü **mit Controllern** | Über dem Handrücken der **linken Hand** – mit dem rechten Ray anvisieren und Trigger drücken |
| Menü **ohne Controller** | **Handfläche öffnen und zum Gesicht drehen** – das Menü erscheint darüber (linke Hand bevorzugt, die rechte geht genauso). Klicken per **Pinch** (Daumen + Zeigefinger) der anderen Hand |
| Bewegen **ohne Controller** | **Ins Leere pinchen und die Hand bewegen** = sich an der Welt entlangziehen · **beide Hände** = zusätzlich drehen |
| Menüseite wechseln | Reiter **„💡 Ideen“** bzw. **„🗂 Board“** oben im Panel antippen |
| Neue Karte | Menü → „＋ Neue Karte“ → sprechen bzw. virtuelle Tastatur |
| Themen-Start | Menü → „🚀 Themen-Start“ → Thema sprechen/tippen |
| Karte einfärben | Karte auswählen → Menü → „🎨 Farbe“ (wechselt zyklisch) |
| Karten verbinden | Karte auswählen → Menü → „🔗 Verbinden“ → Ziel-Karte antippen |
| Karte löschen | Karte auswählen → Menü → „🗑 Karte löschen“ |
| Alle Karten löschen | Menü → „🧹 Alles löschen“ → zur Bestätigung nochmal drücken |
| **Rückgängig / Wiederholen** | Menü → „🗂 Board“ → **„↶ Rückgängig“** / **„↷ Wiederholen“** |
| Board sichern / laden | Menü → „🗂 Board“ → „💾 Sichern“ / „📂 Laden“ |
| Board als Datei | Menü → „🗂 Board“ → „⬇️ Als Datei“ (liegt nach der Sitzung in den Downloads) |
| Fehlerkarte schließen | Die rote Karte im Blickfeld antippen (verschwindet sonst nach 10 s) |
| Zone / Timer | Menü → „🗂 Board“ → „🗂️ Zone“ bzw. „⏱️ Timer“ |
| Umgebung wechseln | Menü → „🌐 Umgebung“ (Passthrough → Himmelsinsel → Nachthimmel/Mars → Zen-Garten → Studio → Konstrukt) |
| Statusmeldungen | Kleines HUD-Panel unten im Blickfeld |

Die Platzierung des Menüs lässt sich in `src/wristMenu.js` über die Konstanten
oben in der Datei anpassen: `GRIP_POSITION`/`GRIP_TILT_X` für den Sitz am
Controller, `PALM_SCALE`/`PALM_LIFT`/`PALM_FORWARD` für die Handfläche sowie
`FACING_*`/`OPEN_*` für die Schwellen, ab denen die offene Hand das Menü
einblendet.

## API-Vertrag

`POST /api/generate` mit

```json
{ "action": "related" | "critic" | "cluster" | "summary" | "topic" | "whiteboard", "selectedIdea": "…", "topic": "…", "image": "<Base64-PNG>", "ideas": ["…", "…"] }
```

(`whiteboard` schickt den Board-Screenshot als Base64-PNG an Claude-Vision.)

antwortet für `related`/`critic`/`summary`/`topic`/`whiteboard` mit

```json
{ "ideas": [{ "text": "…" }] }
```

und für `cluster` mit Indizes in die mitgeschickte Ideen-Liste:

```json
{ "clusters": [{ "name": "…", "ideaIndexes": [0, 2, 5] }] }
```

Der Server erzwingt das jeweilige Format über Structured Outputs
(`output_config.format` mit JSON-Schema) und parst defensiv nach.

## Troubleshooting

- **„WebXR nicht verfügbar“ / Button bleibt deaktiviert:** Seite über `http://`
  statt `https://` geöffnet, oder der Browser kann kein WebXR (normaler
  Desktop-Browser → Desktop-Modus ist gewollt).
- **Zertifikatswarnung auf der Quest:** Normal bei mkcert – einmalig
  „Trotzdem fortfahren“. Wer das vermeiden will, deployt auf Netlify (Variante B).
- **KI-Buttons melden Fehler:** Die Fehlerkarte nennt die Ursache im Klartext.
  „Server nicht erreichbar" → läuft der Proxy (`npm run dev`)? „ANTHROPIC_API_KEY
  ist nicht gesetzt" → Key in `.env` bzw. in den Netlify-Umgebungsvariablen
  eintragen, oder mit `MOCK_AI=1` ohne Key testen. Zeitüberschreitungen und
  Rate-Limits werden automatisch bis zu dreimal wiederholt, bevor die Fehlerkarte
  erscheint.
- **Aus Versehen alles gelöscht:** **Strg+Z** bzw. „↶ Rückgängig" im Menü holt
  auch ein komplett geleertes Board zurück. Der Verlauf gilt pro Sitzung – nach
  einem Reload hilft „📂 Laden" (letzter Sicherungspunkt) oder ein JSON-Import.
- **Menü erscheint bei Hand-Tracking nicht:** Es zeigt sich nur bei **flacher,
  offener Hand, deren Innenfläche zum Gesicht zeigt** – Faust und Handrücken
  blenden es bewusst aus. Beide Hände funktionieren. Wenn gar keine Hände
  getrackt werden, sind im Quest-System die Handbewegungen einzuschalten und die
  Controller abzulegen (`hand-tracking` wird als optionales WebXR-Feature
  angefragt).
- **Spracheingabe reagiert nicht:** Der Quest-Browser unterstützt die Web Speech
  API nicht – die virtuelle Tastatur öffnet sich automatisch. Am Desktop braucht
  Chrome eine Mikrofon-Freigabe.
- **In VR sind nur das Menü, aber keine Karten sichtbar:** Beim Session-Start
  werden alle Karten automatisch in einem Halbkreis vor dich geholt (sobald die
  Headset-Pose bekannt ist). Falls sie mal außer Sicht geraten (z. B. weit
  weggeschoben), einfach die VR-Sitzung einmal beenden und neu starten – dann
  werden sie neu vor dir angeordnet.
- **Dev-Server ohne HTTPS starten** (z. B. für Headless-Tests):
  `NO_HTTPS=1 npm run dev:web`.

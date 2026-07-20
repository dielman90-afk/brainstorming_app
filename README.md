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
  Passthrough/Weiß → **🏝 Himmelsinsel** (Low-Poly-Insel mit Bäumen, Blumen,
  Fluss samt Wasserfall, kreisenden Vögeln, 3D-Wolken – auch unter den Inseln –
  und schwebenden Mini-Inseln) → **🌌 Nachthimmel** (Sternenfeld, Mond und
  natürlicher **Mars-Untergrund** mit Kratern, Felsen und Hügeln) →
  **🪷 Zen-Garten** (geharkter Sand, Koi-Teich, Steinlaterne, Torii,
  Kirschblütenbaum mit treibenden Blütenblättern) → **🌐 Studio** (schlichter
  heller Verlauf). Keine Umgebung hat ein Boden-Raster; filmisches Tone-Mapping
  und weiche Beleuchtung sorgen für einen weniger blockigen Look. Die Auswahl
  wird gemerkt; eine reine VR-Session startet direkt in der zuletzt genutzten
  Umgebung (sonst Himmelsinsel).
- **Fortbewegung durch die Landschaft** (`src/locomotion.js`): Ein Player-Rig
  (Gruppe mit Kamera + Controllern) bewegt den Nutzer durch die Welt. **Desktop:**
  WASD/Pfeile bewegen, Q/E runter/hoch – die gewohnte Orbit-Ansicht und
  Karten-Bedienung bleiben erhalten. **VR:** linker Stick = sanftes Gleiten in
  Blickrichtung (analog dosierbar), rechter Stick = Snap-Turn (komfortables
  ruckartiges Drehen).
- **Ideen-Karten:** Schwebende 3D-Panels mit Text. Per Controller-Ray anvisieren,
  mit dem Trigger greifen, verschieben und frei im Raum anordnen.
- **Handgelenk-Menü** (linker Controller, 2-Spalten-Raster): *Neue Karte*,
  *Themen-Start*, *Verwandte Ideen*, *Kritiker*, *Cluster anwenden*,
  *Zusammenfassen*, *Farbe*, *Verbinden*, *Zone*, *Timer*, *Whiteboard*,
  *Karte löschen*, *Alles löschen* (mit Zweifach-Bestätigung),
  *Umgebung umschalten*. Buttons werden mit dem Ray des anderen Controllers
  geklickt.
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
- **Board-Export/-Import** als JSON (Desktop-Overlay, Buttons „Export“/„Import“) –
  z. B. um ein Board vom Desktop auf die Quest zu bringen oder zu archivieren.
- **Desktop-Fallback:** Läuft ohne Headset im normalen Browser – Maus-Steuerung
  (Orbit), Karten per Klick auswählen und ziehen, alle Aktionen über das Overlay
  links oben. Ideal zum schnellen Iterieren.

## Projektstruktur

```
├── index.html              Overlay-UI (Desktop) + Einstieg
├── src/
│   ├── main.js             Szene, XR-Session (AR→VR-Fallback), Verdrahtung
│   ├── cards.js            IdeaCard + CardManager (Halbkreis-Anordnung, Serialisierung)
│   ├── interactions.js     Controller-Raycasting/Grab + Maus-Fallback
│   ├── locomotion.js       Fortbewegung (Player-Rig): VR-Gleiten + Snap-Turn
│   ├── wristMenu.js        Menü-Panel am Handgelenk
│   ├── keyboard.js         Virtuelle 3D-Tastatur (Fallback)
│   ├── speech.js           Web Speech API Wrapper
│   ├── ai.js               Client für den Server-Proxy
│   ├── boardState.js       JSON-Export/-Import + Autosave
│   ├── environments.js     Vier prozedurale VR-Umgebungen (Insel, Mars-Nacht, Zen, Studio)
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
| Export/Import | Buttons im Overlay |

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
| Menü | Am **linken Handgelenk** – mit dem rechten Ray anvisieren und Trigger drücken |
| Neue Karte | Menü → „＋ Neue Karte“ → sprechen bzw. virtuelle Tastatur |
| Themen-Start | Menü → „🚀 Themen-Start“ → Thema sprechen/tippen |
| Karte einfärben | Karte auswählen → Menü → „🎨 Farbe“ (wechselt zyklisch) |
| Karten verbinden | Karte auswählen → Menü → „🔗 Verbinden“ → Ziel-Karte antippen |
| Karte löschen | Karte auswählen → Menü → „🗑 Karte löschen“ |
| Alle Karten löschen | Menü → „🧹 Alles löschen“ → zur Bestätigung nochmal drücken |
| Umgebung wechseln | Menü → „🌐 Umgebung“ (Passthrough → Himmelsinsel → Nachthimmel/Mars → Zen-Garten → Studio) |
| Statusmeldungen | Kleines HUD-Panel unten im Blickfeld |

Die Position des Handgelenk-Menüs lässt sich in `src/wristMenu.js`
(`attachToGrip`, Konstanten für Position/Rotation) anpassen.

## API-Vertrag

`POST /api/generate` mit

```json
{ "action": "related" | "cluster" | "summary" | "topic" | "whiteboard", "selectedIdea": "…", "topic": "…", "image": "<Base64-PNG>", "ideas": ["…", "…"] }
```

(`whiteboard` schickt den Board-Screenshot als Base64-PNG an Claude-Vision.)

antwortet für `related`/`summary`/`topic` mit

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
- **KI-Buttons melden Fehler:** `ANTHROPIC_API_KEY` in `.env` prüfen (bzw. in den
  Netlify-Umgebungsvariablen), oder mit `MOCK_AI=1` ohne Key testen.
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

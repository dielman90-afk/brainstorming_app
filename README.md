# 🧠 WebXR Brainstorming für die Meta Quest 3

Eine Mixed-Reality-Brainstorming-App: Ideen-Karten schweben als 3D-Panels im Raum
(Passthrough auf der Quest 3), lassen sich mit den Controllern greifen und anordnen,
und Claude generiert auf Knopfdruck verwandte Ideen, Cluster-Vorschläge und
Zusammenfassungen.

**Stack:** Three.js + WebXR · Vite · Node/Express-Proxy für die Anthropic Messages API
(Modell `claude-sonnet-4-6`, API-Key nur serverseitig).

## Features

- **Mixed Reality / VR:** Startet bevorzugt als `immersive-ar` (Passthrough auf der
  Quest 3), Fallback auf `immersive-vr` mit einfacher Raum-Umgebung.
- **Ideen-Karten:** Schwebende 3D-Panels mit Text. Per Controller-Ray anvisieren,
  mit dem Trigger greifen, verschieben und frei im Raum anordnen.
- **Handgelenk-Menü** (linker Controller): *Neue Karte*, *Verwandte Ideen*,
  *Cluster*, *Zusammenfassen*, *Karte löschen*. Buttons werden mit dem Ray des
  anderen Controllers geklickt.
- **KI-Funktionen:** Der Client ruft `/api/generate` auf; der Server-Proxy nutzt die
  Anthropic Messages API mit Structured Outputs (JSON-Schema) und liefert immer
  `{ "ideas": [{ "text": "…" }] }`. Neue Ideen erscheinen als Karten im Halbkreis
  vor dem Nutzer (aufeinanderfolgende Batches vertikal gestaffelt).
- **Texteingabe:** Web Speech API (Deutsch), Fallback auf eine virtuelle
  3D-Tastatur. *Hinweis: Der Quest-Browser unterstützt die Web Speech API derzeit
  nicht – dort öffnet sich automatisch die Tastatur.*
- **Board-Export/-Import** als JSON (Desktop-Overlay, Buttons „Export“/„Import“).
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
│   ├── wristMenu.js        Menü-Panel am Handgelenk
│   ├── keyboard.js         Virtuelle 3D-Tastatur (Fallback)
│   ├── speech.js           Web Speech API Wrapper
│   ├── ai.js               Client für den Server-Proxy
│   ├── boardState.js       JSON-Export/-Import
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
| Karte auswählen | Karte anklicken (Cyan-Rahmen = ausgewählt) |
| Karte verschieben | Karte anklicken und ziehen |
| Karte bearbeiten | **Doppelklick** auf die Karte (oder F2 bei ausgewählter Karte) |
| Karte löschen | **Rechtsklick → „Karte löschen“** oder **Entf/Backspace** bei ausgewählter Karte |
| Kontextmenü | **Rechtsklick** auf eine Karte: Bearbeiten · Verwandte Ideen · Löschen |
| Neue Karte | Text ins Eingabefeld, „Neue Karte“ oder Enter |
| KI-Funktionen | Buttons „Verwandte Ideen“ / „Cluster“ / „Zusammenfassen“ |
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
| Karte greifen/verschieben | Mit dem Controller-Ray anvisieren, **Trigger halten**, loslassen zum Ablegen |
| Karte auswählen | Kurz mit dem Trigger antippen (Cyan-Rahmen) |
| Menü | Am **linken Handgelenk** – mit dem rechten Ray anvisieren und Trigger drücken |
| Neue Karte | Menü → „＋ Neue Karte“ → sprechen bzw. virtuelle Tastatur |
| Karte löschen | Karte auswählen → Menü → „🗑 Karte löschen“ |
| Statusmeldungen | Kleines HUD-Panel unten im Blickfeld |

Die Position des Handgelenk-Menüs lässt sich in `src/wristMenu.js`
(`attachToGrip`, Konstanten für Position/Rotation) anpassen.

## API-Vertrag

`POST /api/generate` mit

```json
{ "action": "related" | "cluster" | "summary", "selectedIdea": "…", "ideas": ["…", "…"] }
```

antwortet immer mit

```json
{ "ideas": [{ "text": "…" }] }
```

Der Server erzwingt das Format über Structured Outputs (`output_config.format`
mit JSON-Schema) und parst defensiv nach.

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
- **Dev-Server ohne HTTPS starten** (z. B. für Headless-Tests):
  `NO_HTTPS=1 npm run dev:web`.

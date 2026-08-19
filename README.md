# 🧠 WebXR Brainstorming für die Meta Quest 3

Eine Mixed-Reality-Brainstorming-App: Ideen-Karten schweben als 3D-Panels im Raum
(Passthrough auf der Quest 3), lassen sich mit den Controllern greifen und anordnen,
und Claude generiert auf Knopfdruck verwandte Ideen, Cluster-Vorschläge und
Zusammenfassungen.

**Stack:** Three.js + WebXR · Vite · Node/Express-Proxy für die Anthropic Messages API
(Modell `claude-sonnet-5`, API-Key nur serverseitig).

**Design:** „Soft Spatial Minimal" aus [claude.ai/design](https://claude.ai/design) –
warmes Anthrazit-Glas mit einem Amber-Akzent (`#ffb454`), Fonts *Space Grotesk*
+ *Sora*. Beide werden über `@fontsource` **lokal mitgebaut** (`src/fonts.js`) und
nicht vom Google-CDN geladen – die App sieht damit auch in Netzen ohne freien
Internetzugang so aus wie gedacht. Dieselbe Schrift trägt auch die 3D-Panels:
Deren Canvas-Text wird einmal nachgezeichnet, sobald die Fonts geladen sind.

## Features

- **Mixed Reality / VR:** Startet bevorzugt als `immersive-ar` (Passthrough auf der
  Quest 3), Fallback auf `immersive-vr`.
- **Alle Umgebungen mit PBR-Materialien.** Bis August 2026 war das Dojo die
  einzige Umgebung mit Normal- und Rauheitskarten; die übrigen drei hatten
  zusammen **240 Materialien und keine einzige Karte**. Genau das – nicht die
  Polygonzahl – ließ sie daneben wie Spielzeug aussehen. Seither teilen sie
  sich die Werkzeuge des Dojos (`src/dojo/materials.js`, `ground.js`,
  `stonework.js`, `foliage.js`): geharkter Sand mit echtem Rillenrelief, Granit
  mit Würfelprojektion und Moospatina, Wasser mit zwei gegeneinander wandernden
  Kräuselungslagen, Blattkarten mit Wind und Transluzenz, Marsregolith mit
  Korn. Der Ordnername `dojo/` ist damit ein leichter Fehlname – verschoben
  wird trotzdem nichts, siehe den Kommentar im Kopf von `materials.js`.

  **Gemessen kostet das bei p50 nichts.** Der Zen-Garten als Bezugsgröße:
  114,5 ms vorher, 114,9 ms nachher – bei 31 % mehr gezeichneten Dreiecken,
  14 zusätzlichen Draw-Calls und der doppelten Texturzahl. (p95 stieg um 16 %,
  ist aber das unzuverlässigere Signal: Die Streuung p95/p50 stieg mit, und das
  ist die Signatur von Fremdlast auf der CPU, nicht der Szene.)

- **Fünf virtuelle Umgebungen** (`src/environments.js` und `src/dojo/`, komplett
  prozedural, ohne externe Assets): Der Button **„Umgebung“** schaltet zyklisch durch
  Passthrough/Weiß → **🏝 Himmelsinsel** (Low-Poly-Insel mit Bäumen, Büschen,
  Pilzen, Blumen, Fluss samt Wasserfall mit Schaum & Regenbogen, hängenden Ranken
  unter den Inseln, kreisenden Vögeln, Schmetterlingen, 3D-Wolken – auch unter den
  Inseln – und schwebenden Mini-Inseln) →
  **🌌 Nachthimmel** (Sternenfeld, Mond und natürlicher **Mars-Untergrund** mit
  Kratern, Felsen und Hügeln) → **🪷 Zen-Garten** (geharkter Sand, Koi-Teich mit
  Seerosen, Lotus & Wasser-Ringen, Bambushain, Kirschblüten- und Ahornbaum,
  Steinlaterne, Torii, Blütenblätter, Staubpartikel im Licht und Bodennebel).
  Im Teich ziehen **zwei Koi** ihre Bahnen – Spindelkörper aus einem
  Rotationsprofil, seitlich schmal und hochrückig, mit weichen Flossen,
  wedelndem Schwanz und gefleckter Zeichnung als Canvas-Textur (Kohaku in
  Weiß-Rot, Ogon in Orange-Weiß). Zuvor waren es fünf flachgedrückte Kugeln mit
  Kegeln als Flossen, die im Wasser wie Bonbons mit Zacken aussahen.
  Sie schwimmen **kopfvoran**: Die Blickrichtung ist die Tangente der Bahn,
  abgeleitet aus der Position, nicht der Bahnwinkel plus ein fester Versatz.
  Genau der war vorher drin – mit 90° daneben, sodass die Fische breitseits
  durch den Teich zogen. Dazu eine leichte Schräglage in die Kurve und eine
  mitgehende Nase beim Auf- und Abtauchen; einer zieht seine Runden im, der
  andere gegen den Uhrzeigersinn. →
  **⬜ Konstrukt** (nahtloser, komplett weißer Void im Stil des
  „Matrix“-Ladeprogramms – Kuppel und Boden im selben Weißton, kein sichtbarer
  Horizont, gleichmäßiges schattenfreies Licht). Darin steht die **Einrichtung
  aus der Filmszene**, nachgebaut nach dem Standbild: zwei rote
  **Ohrensessel** – hohe Lehne mit seitlichen Flügeln, dichte
  Rautenknopfheftung, gerollte Armlehnen mit geschnitzter Holzrosette an der
  Stirn und gedrechselte Vorderbeine – und die **AWA-„Radiola"-Konsole** im
  Art-déco-Gehäuse auf einem niedrigen Ständer mit schräg gestellten Beinen.
  Die Anordnung ist eine **benutzbare Sitzordnung**: Das Gerät steht vor den
  Sesseln, die Bildröhre zeigt zu ihnen, und der Drehwinkel der Sessel wird
  nicht geschätzt, sondern aus den Positionen gerechnet – wer darin sitzt, hat
  den Bildschirm vor sich (**2,0 m Sitzabstand**, 5° Abweichung). Von vorn
  sieht man deshalb die Schauseite mit dem auf der Spitze stehenden
  „DEEP IMAGE"-Dreieck, genau wie im Standbild; das laufende Bild sieht, wer um
  die Gruppe herumgeht oder sich in einen Sessel stellt. Beides gleichzeitig
  geht nicht – Bildröhre und Schautafel liegen auf gegenüberliegenden Seiten
  des Gehäuses.
  Alles prozedural aus Geometrie und Canvas-Texturen: Die Ledernarbung ist eine
  gerechnete Normal-Map, Emblem und Schriftzüge sind eine gemalte Tafel (als
  Geometrie kosteten sie tausende Dreiecke für ein flaches Detail), das
  Bildschirmbild ein animierter Canvas mit Scanlines, Rauschen und
  durchlaufendem Bildstrich. Die Gruppe steht gut dreieinhalb Meter vor dem
  Startpunkt, also hinter dem Halbkreis, in dem neue Karten erscheinen.
  Das frühere **🌐 Studio** (schlichter heller Verlauf) ist entfernt: Es war vom
  Konstrukt kaum zu unterscheiden – beides eine helle, leere Kuppel – und
  verlängerte den Durchlauf des Buttons ohne erkennbaren Unterschied.
  Keine Umgebung hat ein Boden-Raster; filmisches Tone-Mapping, weiche
  Beleuchtung, gebackenes Vertex-Shading und gefälschte Kontaktschatten
  (Blob-Shadows) sorgen für Tiefe ohne teure Echtzeit-Schatten. Die Auswahl wird
  gemerkt (über die stabile `id` der Umgebung, nicht über ihre Position in der
  Liste – ein gemerkter Index zeigt nach dem Entfernen einer Umgebung auf die
  falsche Welt); eine reine VR-Session startet direkt in der zuletzt genutzten
  Umgebung (sonst Himmelsinsel).
- **⛩ Konstrukt-Dojo** (`src/dojo/`, fünfte Umgebung): der Trainingsraum aus
  demselben Film. Bricht bewusst mit dem flachen Low-Poly-Stil der anderen vier
  und ist der einzige Ort in der App mit **echten Schatten, PBR-Materialien und
  einer Environment-Map**.
  - **Materialien** (`src/dojo/materials.js`): acht Materialien aus zehn
    prozeduralen Karten – Hinoki mit Jahresringen, Tatami-Binsengeflecht,
    Kalkputz, Washi, geschmiedeter Stahl mit Hamon-Verlauf in der Rauheit,
    Eisen, Urushi-Lack, Reisstroh-Seil. Erzeugt über ein verallgemeinertes
    `heightToMaps()` (Höhenfeld → Sobel → Normal- und Rauheitskarte), dasselbe
    Verfahren wie bei der Ledernarbung des Ohrensessels.
  - **Periodisches Rauschen.** Ein Boden kachelt seine Textur rund zwanzig Mal;
    nicht wiederholendes Rauschen legt dabei ein sichtbares Nahtgitter über die
    ganze Fläche. Die Gitterindizes laufen deshalb modulo einer Periode, und
    weil jede Oktave die Frequenz verdoppelt, verdoppelt sich die Periode mit.
  - **Environment-Map statt Himmelskuppel:** eine Innenraum-Sonde (heller
    warmer Schlitz im Osten, dunkles Holz unten) durch den `PMREMGenerator`.
    Ohne sie rendern Klingen und Lack **schwarz** – ein Metall ohne etwas zu
    spiegeln hat keine diffuse Komponente. Gebaut erst beim ersten Aktivieren,
    nicht beim Laden.
  - **Ein** gerichtetes Licht mit **einer** Schattenkarte (2048 am Desktop,
    1024 in der Brille); alle Maße und die Sonnenrichtung stehen in
    `src/dojo/layout.js`, damit Schatten, Lichtschächte und Glanzlichter
    zwangsläufig zusammenpassen. Position **und** Ziel der Sonne wurden beim
    Verlängern des Raums um denselben Vektor verschoben – die Richtung ist
    dadurch unverändert, nur der beschattete Ausschnitt wandert mit.
  - **Öffnungen aus einer Beschreibung** (`buildOpening()` in
    `architecture.js`): Ostfront, Südfront, die hohen Bänder auf West- und
    Nordwand und das Ranma sind derselbe Bauteiltyp, unterschieden nur durch
    Maße und ein Vorzeichen `inward` – die Richtung von der Wandebene in den
    Raum. Vorher versetzten zwei getrennte Blöcke ihre Teile mit
    vorzeichenlosen Konstanten; das stimmte auf der Ostwand zufällig und
    stellte auf West und Nord das Papier vor das Gitter, auf West und Süd mit
    der Rückseite nach innen. Am Desktop unsichtbar (Washi ist beidseitig), in
    der Brille drei Löcher, weil `quality.js` dort auf `FrontSide` schaltet.
    Die Sprossen sind skalierte Einheitswürfel **ohne jede Drehung** – die
    Bauform, in der „welche Kante liegt auf welcher Achse" nicht mehr falsch
    sein kann.
  - **Außenwelt** (`src/dojo/exterior.js`): ein Bambushain, ein japanischer
    Garten hinter dem Süd-Eingang (Kiesbeet, Trittsteine, Kasuga-Laterne,
    Tsukubai, Ahorn), eine gemalte Baumlinie, eine Moosfläche. Der ganze Garten
    kostet **vier** Zeichenaufrufe: Laterne, Becken, Ahornstamm und
    Beeteinfassung sind zu einem Netz verschmolzen und unterscheiden sich nur
    in der Vertexfarbe – dasselbe Verfahren wie bei den Requisiten drinnen. Der Hain ist zuerst **Schattenwerfer**: Er
    steht zwischen Sonne und Ostfront und zeichnet seinen Schattenriss auf das
    Washi – das Bild, an dem man ein Dojo erkennt. Damit das funktioniert,
    hängt das Eigenleuchten des Papiers per `onBeforeCompile` an der
    Schattenmaske; ohne das leuchtet Papier gleichmäßig weiter, egal was davor
    steht. Gemessen verschattet der Hain 25,8 % der Fensterbreite in 34
    Hell-Dunkel-Wechseln. Die Außenwelt ist reine Kulisse: Die Begrenzung in
    `index.js` hält den Spieler im Raum.
  - **Bekannte Schwäche:** Der Raum ist pro Pixel deutlich teurer als die
    übrigen Umgebungen. Gemessen (p50, headless, Stand 2026-08-12): XR-Stufe
    das **4,6-fache** des Zen-Gartens (527 ms gegen 114,9 ms), Desktop-Stufe
    das 17-fache – bei 101 gegen 62 Draw-Calls. Die Last liegt nicht in der Geometrie, sondern im Fragment:
    Schattendurchgang, PBR mit Normal- und Rauheitskarte, IBL-Abtastung und
    additive Lagen. Die XR-Stufe lag nach Runde 5 noch beim 1,16-fachen; seither
    ist der Raum um 55 % größer geworden und hat eine Außenwelt bekommen.
    **Das Perf-Gate von 3,5× ist damit knapp verfehlt.** Gemessen wurde headless
    auf SwiftShader, einem Software-Rasterizer – der überzeichnet Fragmentkosten
    stark, aber mobile GPUs sind ebenfalls füllratenbegrenzt, und die
    *Rangfolge* der Posten überträgt sich. **Auf der Quest 3 ist das ungeprüft.**
    Zu beachten: Die p95-Referenz schwankt zwischen identischen Läufen um rund
    10 %; p50 ist das stabilere Signal (XR 504 ms gegen Zen 134 ms).

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
  WASD/Pfeile bewegen – die gewohnte Orbit-Ansicht und
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
- **Begehbarer Bereich** (`src/walkable.js`): Die Fortbewegung ist rein
  horizontal – es gibt **kein Hoch/Runter mehr**. Die frühere Freiflug-Belegung
  Q/E hatte keine Grenze: Man stieg durch Baumkronen, schwebte unter die Insel
  und landete, weil es keine Kollision gibt, regelmäßig *in* einem Objekt statt
  davor. Stattdessen beschreibt jede Umgebung selbst, wo man gehen darf und wie
  hoch dort der Boden liegt:

  | Umgebung | Grenze | Boden |
  | --- | --- | --- |
  | 🏝 Himmelsinsel | die Hauptinsel bis an die Abbruchkante (99 % des Umrisses) | das echte Gelände – über die ebene Mitte, den Randwall hinauf, über den Höhenrücken |
  | ⛩ Konstrukt-Dojo | Zonenkette Raum → Türdurchgang → Engawa → Stufe → Kiesbeet | je Zone, mit weicher Stufe |
  | 🌌 Nachthimmel | keine | das Dünen- und Kraterrelief |
  | 🪷 Zen-Garten, ⬜ Konstrukt, Passthrough | keine | eben |

  Grundriss und Standhöhe der Insel kommen aus **derselben** analytischen
  Formbeschreibung, aus der auch ihre Geometrie entsteht (`makeIslandShape`) –
  die Sperre kann deshalb nicht von dem abweichen, was man sieht. Der Bodenwechsel
  wird über wenige Bilder nachgeführt, damit aus der Dojo-Stufe keine
  Sprungschaltung und aus dem Inselwall ein Anstieg wird. Am Desktop, wo es keine
  Kopfpose gibt, darf die Orbit-Kamera in einem Band von 0,4 bis 2,6 m über
  diesem Boden stehen – das Board bleibt von schräg oben ansehbar, ohne dass man
  davonfliegen kann. **Es ist eine Projektion, kein Kollisionssystem:** Durch
  Laterne, Becken oder Baumstamm geht man weiterhin hindurch.
- **Ideen-Karten:** Schwebende 3D-Panels mit Text. Per Controller-Ray anvisieren,
  mit dem Trigger greifen, verschieben und frei im Raum anordnen.
- **Prozessflussdiagramm** (`src/flowLayout.js`, Reiter „Prozess" im
  Hand-Menü): Abläufe als richtiges Flussdiagramm bauen – mit **Formen**,
  **gerichteten Pfeilen** und **beschrifteten Zweigen**.
  - **Knotenarten** (`FLOW_TYPES` in `src/cards.js`): Start und Ende als Stadion,
    Tätigkeiten als Rechteck, Entscheidungen als **Raute** – jede mit eigener
    Farbe. Die Form sagt auf einen Blick, um welche Art Schritt es geht.
    Ein Prozessknoten ist dabei eine ganz normale Karte mit gesetztem `flowType`;
    dadurch erbt er Greifen, Auswahl, Undo/Redo, Autosave und Export, ohne dass
    davon etwas nachgebaut werden müsste.
  - **Pfeile** enden **am Rand** des Zielknotens, nicht in seiner Mitte – sonst
    verschwände die Spitze hinter der Karte und man sähe nur eine Linie, die im
    Knoten endet. Bei der Raute wird dafür ihr echter Umriss gerechnet
    (`|x|/hw + |y|/hh = 1`), nicht das umschließende Rechteck.
  - **Anordnen** legt den Prozess automatisch auf eine flache Tafel vor dem
    Nutzer, Fluss **von links nach rechts** (geschichtetes Layout, rein lokal
    gerechnet). Waagerecht, weil der Platz nach unten ausgeht: Zwischen Boden
    und bequemer Blickhöhe liegen keine anderthalb Meter, das reicht für vier
    bis fünf Zeilen. Zur Seite ist dagegen Platz ohne Ende – und lange Ketten
    sind die Regel, während eine Verzweigung selten mehr als zwei, drei Äste
    hat. Also bekommt die Kette die Waagerechte und die Geschwister die
    Senkrechte; die Tafel rückt bei langen Prozessen weiter weg, damit die
    äußeren Knoten im Blickfeld bleiben.
    **Rückführungen** – „Unterlagen nachfordern" zurück zur Prüfung –
    werden vorher per Tiefensuche erkannt und beim Rangieren übersprungen;
    gezeichnet werden sie trotzdem und zeigen dann nach oben. Ohne das würde der
    Rang eines Knotens im Kreis immer weiterwachsen.
  - **Aus Text bauen:** Ablauf in Worten beschreiben, Claude liefert Knoten und
    Kanten als strukturiertes JSON (`FLOW_SCHEMA` in `server/ai-core.js`, dieselbe
    Strecke wie *Cluster*), die App baut und ordnet das Diagramm. Ein **vorhandenes
    Prozessdiagramm wird dabei ersetzt** – zwei Prozesse gleichzeitig würden sich
    beim Anordnen dieselben Spalten teilen und ineinander stehen. Ideenkarten
    bleiben unberührt, und „Rückgängig" holt den alten Prozess zurück.
  - **Als Mermaid:** Export als `flowchart LR` (waagerecht wie in der App) –
    Stadion `([…])`, Rechteck
    `[…]`, Raute `{…}`, beschriftete Kanten `-->|ja|`. GitHub, Notion, Obsidian
    und Confluence rendern das direkt, der in VR gebaute Prozess ist also ohne
    Zwischenschritt im Dokument und dort weiter bearbeitbar. Ein Bild wäre eine
    Sackgasse.
- **Hand-Menü** (`src/wristMenu.js`) auf drei Reitern, damit das Panel trotz
  26 Aktionen kompakt bleibt. Jede Aktion trägt dasselbe Linien-Icon wie ihr
  Desktop-Knopf (eine Pfad-Definition in `src/icons.js`, auf die
  Canvas-Textur gezeichnet). Die kürzere Seite wird im Panel vertikal
  zentriert, damit unten keine leere Reihe klafft:
  - **Ideen:** *Neue Karte*, *Themen-Start*, *Verwandte Ideen*, *Kritiker*,
    *Cluster*, *Zusammenfassen*, *Farbe*, *Verbinden*, *Schrift*,
    *Karte löschen*
  - **Board:** *Rückgängig*, *Wiederholen*, *Zone*, *Timer*, *Whiteboard*,
    *Umgebung*, *Bildqualität*, *Als Datei*,
    *Alles löschen* (mit Zweifach-Bestätigung)
  - **Prozess:** *Aus Text bauen*, *Schritt*, *Form wechseln*, *Pfeil ziehen*,
    *Zweig benennen*, *Anordnen*, *Als Mermaid*

  Das Menü sitzt **mit Controllern** über dem Handrücken der linken Hand und
  reicht nach vorn ins Blickfeld (statt hinter dem Handgelenk Richtung
  Ellenbogen). **Ohne Controller** – also bei Hand-Tracking – schwebt es
  verkleinert über der **offenen Handfläche** und blendet sich automatisch ein,
  sobald die flache Hand zum Gesicht zeigt; bei Faust oder abgewandter Hand
  verschwindet es wieder. Dort liegt es nicht flach auf, sondern ist um gut 35°
  **aufgestellt** (`PALM_TILT`) – plan auf der Hand schaut man von schräg oben
  darauf, die Beschriftungen stehen stark verkürzt und die untere Reihe ist am
  schlechtesten zu treffen. Gekippt wird um die Unterkante, damit das Panel
  aufklappt statt in die Handfläche einzutauchen. Buttons werden mit dem Ray der anderen Hand
  angevisiert und per Trigger bzw. Pinch geklickt. Die Hände werden bei
  Hand-Tracking als Gelenk-Kugeln dargestellt (prozedural, ohne externe Assets).
- **Undo/Redo:** Vollständiger Verlauf über *Anlegen, Löschen, „Alles löschen",
  Verschieben, Größe, Farbe, Text, Cluster, Verbindungen, Zonen und Import* –
  am Desktop per **Strg+Z / Strg+Umschalt+Z** (oder Strg+Y) und über die Buttons
  im Overlay, in VR über *„Rückgängig"* / *„Wiederholen"* im Menü. Intern
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
  - **Zusammenfassen:** Das ganze Board als eine Karte – bewusst **größer**
    (1,7×) und neutral eingefärbt, damit sie sich vom Ideenfeld absetzt. Eine
    Zusammenfassung ist deutlich länger als eine Idee; auf Ideengröße war sie
    bisher nach rund hundert Zeichen mit „…" zu Ende. Der Prompt begrenzt sie
    zusätzlich auf 280 Zeichen, und Kartentext wird generell **verkleinert statt
    abgeschnitten** (`shrinkToFit` in `src/textPanel.js`, bis auf die halbe
    Basisgröße herunter).
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
  „Farbe“ (wechselt zyklisch). Cluster färben automatisch.
- **Kartengröße:** Jede Karte ist von 0,45× bis 2,2× skalierbar – am Desktop per
  **Mausrad über der Karte** oder **+/−** (bei ausgewählter Karte), in VR per
  **Daumenstick hoch/runter, während die Karte gegriffen ist**. Die Größe wird
  gespeichert und exportiert.
- **Verbindungslinien:** Karte auswählen → „Verbinden“ (Menü bzw.
  Rechtsklick → „Verbinden mit…“) → Ziel-Karte anklicken. Nochmal verbinden
  entfernt die Linie; Esc bricht ab. Linien folgen den Karten beim Verschieben.
- **Texteingabe in XR – die virtuelle Tastatur** (`src/keyboard.js`):
  In XR öffnet sich die virtuelle 3D-Tastatur im deutschen Layout (Umlaute, ß,
  Satzzeichen, Umschalttaste für genau ein Zeichen wie auf dem Handy). Optisch
  gehört sie zum Rest der App: abgerundetes Glas-Panel mit Amber-Rahmen, weich
  abgerundete Tasten, gleiche Farbwelt wie Hand-Menü und Whiteboard-Leiste.
  **In XR wird getippt – Spracheingabe gibt es dort nicht.** Warum, steht im
  nächsten Punkt.
- **Keine Spracheingabe in XR** (`src/speech.js`): Der Quest-Browser hat **keine
  funktionierende Web Speech API**. Er stellt `webkitSpeechRecognition` bereit –
  er ist Chromium-basiert –, aber darunter liegt nichts: Horizon OS ist ein
  abgespecktes Android ohne Spracherkennungsdienst. Ein `recognition.start()`
  läuft dort nicht ins Leere, sondern **riss den ganzen Browser mit**.
  Eine Prüfung auf „gibt es den Konstruktor?" hilft nicht, weil es ihn ja gibt.
  Es greifen deshalb zwei voneinander unabhängige Sperren:
  `isHeadsetBrowser()` erkennt das Gerät am User-Agent, und `setXRPresenting()`
  schaltet die Erkennung zusätzlich **für die Dauer jeder immersiven Sitzung**
  ab, auf jedem Gerät – eine Zeichenkette im User-Agent ist eine wacklige
  Grundlage für etwas, das den Browser abschießt (aus „Oculus Browser" wurde
  2024 „Meta Quest Browser").
  Entsprechend gibt es in XR **keine Mikrofon-Taste** auf der Tastatur und
  **keinen Eintrag „Sprachbefehle"** im Hand-Menü; auf einem Brillen-Browser
  verschwinden auch die beiden Overlay-Knöpfe ganz. Ein Knopf, der bestenfalls
  eine Fehlermeldung ausgibt und schlimmstenfalls den Browser mitreißt, gehört
  nicht in die Oberfläche.
  *Der Umweg über die Systemtastatur der Brille – deren Mikrofon-Taste kann
  diktieren – war ein Versuch, dort doch noch Diktat anzubieten. Auf echter
  Hardware hat er nicht getragen und ist wieder raus.*
- **Diktieren – nur am Desktop** (`src/speech.js`): Der Knopf **„Diktieren"**
  im Overlay füllt das Ideen-Feld mit dem Gesprochenen,
  Zwischenergebnisse laufen live mit, ein zweiter Druck bricht ab. Von dort geht
  es mit Enter oder jedem KI-Knopf normal weiter. Braucht Chrome oder Edge und
  eine Mikrofon-Freigabe.
- **🎙 Sprachbefehle – nur am Desktop** (`src/speech.js`): dauerhaftes Zuhören,
  ein-/ausschaltbar über den Overlay-Knopf – **standardmäßig aus**, ein ungefragt
  mithörendes Mikrofon will niemand. Erkannt werden u. a. *„neue Karte …"*,
  *„Thema …"*, *„verwandte Ideen"*, *„Kritiker"*, *„Cluster"*,
  *„zusammenfassen"*, *„verbinden"*, *„Karte löschen"*, *„rückgängig"*,
  *„Umgebung"*, *„Schrift"*. Bei *„neue Karte"* und *„Thema"* wird das
  Gesprochene direkt als Text übernommen – *„neue Karte Fahrradständer bauen"*
  legt die beschriftete Karte in einem Rutsch an.
  Ein Befehl zählt nur **am Satzanfang** und ohne Nachgeplapper, damit ein
  beiläufiges „…das können wir alles löschen…" im Gespräch nichts auslöst.
  Während eines Diktats pausiert die Befehlserkennung – zwei Erkenner streiten
  sich sonst um das Mikrofon. Der Start einer XR-Sitzung beendet sie ganz.
- **🔠 Kartenschrift** (Barrierefreiheit): drei Stufen (*Normal · Groß · Sehr
  groß*) über „Schrift" im Menü bzw. den Knopf im Overlay. Angepasst wird nur
  die Textgröße, die Kartenfläche bleibt gleich; die Stufe gilt auch für neue
  Karten und überdauert einen Reload.
- **Haptik in VR** (`src/haptics.js`): kurzes Controller-Rumble beim Greifen und
  Ablegen von Karten, bei Menü-Klicks, beim Verbinden, Löschen und bei einer
  Fehlerkarte. Bewusst sehr kurz (14–70 ms) – alles darüber fühlt sich wie eine
  Fehlermeldung an statt wie eine Bestätigung. Läuft über
  `gamepad.hapticActuators` mit `playEffect` als Rückfall; ohne Unterstützung
  passiert schlicht nichts.
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
  Overlay, in VR über *„Als Datei"* im Menü (die Datei landet im
  Download-Ordner des Quest-Browsers und ist nach der Sitzung dort zu finden).
  Importiertes JSON wird vor dem Anwenden geprüft; ein defektes Board erzeugt
  eine klare Meldung statt eines halb geladenen Zustands.
- **Desktop-Fallback:** Läuft ohne Headset im normalen Browser – Maus-Steuerung
  (Orbit), Karten per Klick auswählen und ziehen, alle Aktionen über das Overlay
  links oben. Ideal zum schnellen Iterieren. Das Overlay ist auf die Fensterhöhe
  begrenzt und **scrollt bei Bedarf selbst**, damit auch auf niedrigen Fenstern
  alle Bedienelemente bis hinunter zum XR-Button erreichbar bleiben. Gescrollt
  wird dabei ein innerer Container (`#overlay-scroll`); das Panel selbst
  schneidet ab. Vorher lag die Bildlaufleiste direkt auf dem Panel – ihre
  Pfeil-Knöpfe sitzen ganz oben und unten in der Spur und ragten damit sichtbar
  in die runden Ecken hinaus. Jetzt sind die Pfeile abgeschaltet, die Spur hält
  Abstand zu den Ecken, und der Balken ist ein schmaler, abgerundeter Griff. Es lässt
  sich über den Knopf rechts daneben oder mit **M** ein- und ausklappen –
  eingeklappt bleibt nur der Knopf stehen und das Board bekommt die volle
  Fläche. Der Zustand wird gemerkt und gilt auch nach einem Reload.

## Projektstruktur

```
├── index.html              Overlay-UI (Desktop) + Einstieg
├── src/
│   ├── main.js             Szene, XR-Session (AR→VR-Fallback), Verdrahtung
│   ├── cards.js            IdeaCard + CardManager (Halbkreis-Anordnung, Serialisierung,
│   │                       Knotenarten für Prozessdiagramme)
│   ├── connections.js      Lose Verbindungslinien + gerichtete Prozesspfeile mit Beschriftung
│   ├── flowLayout.js       Geschichtetes Layout fürs Prozessflussdiagramm
│   ├── tween.js            Sanftes Umsetzen von Objekten (Layout-Animation)
│   ├── interactions.js     Controller-/Hand-Raycasting, Grab + Maus-Fallback
│   ├── locomotion.js       Fortbewegung (Player-Rig): VR-Gleiten + Snap-Turn
│   ├── walkable.js         Begehbarer Bereich je Umgebung (Grenze + Bodenhöhe)
│   ├── wristMenu.js        Menü-Panel an Controller bzw. Handfläche
│   ├── history.js          Undo/Redo (Board-Snapshots)
│   ├── hud.js              Statuszeile, Ladeanzeige und Fehlerkarte im Blickfeld
│   ├── keyboard.js         Virtuelle 3D-Tastatur (XR, ohne Spracheingabe)
│   ├── speech.js           Diktat + Sprachbefehle – nur Desktop (Web Speech API)
│   ├── haptics.js          Controller-Rumble (Greifen, Klick, Verbinden, Löschen)
│   ├── fonts.js            Lokal gebündelte Schriften (@fontsource)
│   ├── ai.js               Client für den Server-Proxy (Timeout + Wiederholung)
│   ├── boardState.js       JSON-Export/-Import, Mermaid-Export, Autosave
│   ├── environments.js     Vier prozedurale Umgebungen (Insel, Mars-Nacht, Zen, Konstrukt
│   │                       inkl. Matrix-Sitzgruppe: Ohrensessel + Radiola-Konsole)
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
| **Prozessdiagramm** | Eigene **umrandete Gruppenbox „Prozessdiagramm"** im Overlay: Formleiste (*Start · Schritt · Entscheidung · Ende · Karte*, jede mit ihrer Miniaturform als Icon) setzt die Form der **ausgewählten** Karte direkt, dazu *Pfeil ziehen*, *Zweig*, *Anordnen*, *Aus Text*, *Mermaid*. Per **Rechtsklick auf eine Karte** gibt es dieselbe Formleiste und „Pfeil ziehen zu…" |
| **Diktieren** | **„Diktieren"** in der Overlay-Gruppe **„Sprache"** (direkt unter dem Eingabefeld) – das Gesprochene landet im Ideen-Feld (nochmal drücken = abbrechen). Chrome/Edge, nicht in XR |
| **Sprachbefehle** | **„Sprachbefehle"** in derselben Gruppe **„Sprache"** ein-/ausschalten. Chrome/Edge, nicht in XR |
| **Kartenschrift** | **„Schrift: …"** im Overlay – Normal → Groß → Sehr groß |
| Karte bearbeiten | **Doppelklick** auf die Karte (oder F2 bei ausgewählter Karte) |
| Kartengröße | **Mausrad über der Karte** oder **+ / −** bei ausgewählter Karte |
| Karte löschen | **Rechtsklick → „Karte löschen“** oder **Entf/Backspace** bei ausgewählter Karte |
| Kontextmenü | **Rechtsklick** auf eine Karte: Bearbeiten · Verwandte Ideen · Kritiker · Verbinden · Farbe · Löschen |
| Karte einfärben | Rechtsklick → Farbpunkt anklicken |
| Karten verbinden | Rechtsklick → „Verbinden mit…“ → Ziel-Karte anklicken (nochmal = Linie entfernen, Esc = abbrechen) |
| Neue Karte | Text ins Eingabefeld, „Neue Karte“ oder Enter |
| Themen-Start | Thema ins Eingabefeld → „Themen-Start“ |
| KI-Funktionen | Buttons „Verwandte Ideen“ / „Kritiker“ / „Cluster anwenden“ / „Zusammenfassen“ |
| **Rückgängig / Wiederholen** | **Strg+Z** / **Strg+Umschalt+Z** (auch Strg+Y) oder die Buttons im Overlay |
| Export/Import | Buttons im Overlay |
| Menü ein-/ausklappen | Knopf rechts neben dem Overlay oder **M** |
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
4. Auf **„Mixed Reality starten (Passthrough)“** tippen. Unterstützt der
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

**Netlify baut nur den Produktions-Branch.** Arbeit auf einem Feature-Branch
liegt auf der Brille nicht an, solange sie nicht gemerged ist – das ist keine
Kleinigkeit, sondern hat schon eine ganze Fehlersuche gekostet: Ein gemeldeter
Absturz war längst behoben, nur lief auf der Brille noch eine Woche alte
Fassung.

Damit das nicht wieder passiert, steht der Baustand **unten im Overlay**
(„Baustand `a1b2c3d` · Datum") und in `window.__app.build`. Der Wert kommt beim
Bauen aus Netlifys `COMMIT_REF` bzw. lokal aus `git rev-parse` (siehe
`vite.config.js`). Bei jeder Fehlermeldung zuerst dort nachsehen: Passt die
Kennung nicht zum erwarteten Commit, ist der Fehler nicht im Code, sondern im
Deployment.

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
| Menüseite wechseln | Reiter **„Ideen“**, **„Board“** bzw. **„Prozess“** oben im Panel antippen |
| Neue Karte | Menü → „Neue Karte“ → virtuelle Tastatur öffnet sich (Spracheingabe gibt es in XR nicht) |
| Themen-Start | Menü → „Themen-Start“ → Thema sprechen/tippen |
| **Kartenschrift** | Menü → „Ideen“ → **„Schrift“** (Normal → Groß → Sehr groß) |
| Karte einfärben | Karte auswählen → Menü → „Farbe“ (wechselt zyklisch) |
| Karten verbinden | Karte auswählen → Menü → „Verbinden“ → Ziel-Karte antippen |
| **Prozess bauen** | Menü → „Prozess“ → **„Aus Text bauen“** (Ablauf beschreiben) oder von Hand: „Schritt“ → „Form wechseln“ → „Pfeil ziehen“ → „Zweig benennen“ → „Anordnen“. In VR wird die Form **durchgeschaltet**; am Desktop direkt gewählt |
| **Prozess mitnehmen** | Menü → „Prozess“ → **„Als Mermaid“** – die `.mmd`-Datei rendert GitHub, Notion und Confluence direkt |
| Karte löschen | Karte auswählen → Menü → „Karte löschen“ |
| Alle Karten löschen | Menü → „Alles löschen“ → zur Bestätigung nochmal drücken |
| **Rückgängig / Wiederholen** | Menü → „Board“ → **„Rückgängig“** / **„Wiederholen“** |
| Board als Datei | Menü → „Board“ → „Als Datei“ (liegt nach der Sitzung in den Downloads) |
| Fehlerkarte schließen | Die rote Karte im Blickfeld antippen (verschwindet sonst nach 10 s) |
| Zone / Timer | Menü → „Board“ → „Zone“ bzw. „Timer“ |
| Umgebung wechseln | Menü → „Umgebung“ (Passthrough → Himmelsinsel → Nachthimmel/Mars → Zen-Garten → Konstrukt) |
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
- **Aus Versehen alles gelöscht:** **Strg+Z** bzw. „Rückgängig" im Menü holt
  auch ein komplett geleertes Board zurück. Der Verlauf gilt pro Sitzung – über
  einen Reload hinweg trägt das Autosave (das Board wird bei jeder Änderung
  automatisch gespeichert), für bewusste Stände der JSON-Export.
- **Menü erscheint bei Hand-Tracking nicht:** Es zeigt sich nur bei **flacher,
  offener Hand, deren Innenfläche zum Gesicht zeigt** – Faust und Handrücken
  blenden es bewusst aus. Beide Hände funktionieren. Wenn gar keine Hände
  getrackt werden, sind im Quest-System die Handbewegungen einzuschalten und die
  Controller abzulegen (`hand-tracking` wird als optionales WebXR-Feature
  angefragt).
- **Spracheingabe fehlt in der Brille:** Das ist Absicht. Der Quest-Browser hat
  keine funktionierende Spracherkennung – der Versuch, sie zu nutzen, hat den
  Browser abgeschossen. Deshalb gibt es in XR **keine Mikrofon-Taste und keinen
  Sprachbefehl-Eintrag**, und auf einem Brillen-Browser fehlen auch die beiden
  Overlay-Knöpfe. In XR wird über die virtuelle Tastatur getippt; diktieren geht
  am Desktop.
- **Spracheingabe reagiert nicht (Desktop):** Chrome oder Edge nötig – Firefox
  kann die Web Speech API gar nicht. Dazu eine **Mikrofon-Freigabe**
  (Adressleiste → Mikrofon zulassen) und eine Internetverbindung, weil die
  Erkennung serverseitig läuft; offline meldet sie „Spracherkennung braucht
  Internet". Startet man eine XR-Sitzung, wird ein laufender Erkenner beendet
  und bleibt bis zum Sitzungsende aus.
- **Sprachbefehl wird nicht erkannt:** Ein Kommando zählt nur am **Satzanfang**
  und ohne Zusatz dahinter – „Cluster" wirkt, „mach mal Cluster" und „Cluster
  bitte" nicht. Ausnahmen sind „neue Karte …" und „Thema …", bei denen alles
  Folgende als Text übernommen wird.
- **In VR sind nur das Menü, aber keine Karten sichtbar:** Beim Session-Start
  werden alle Karten automatisch in einem Halbkreis vor dich geholt (sobald die
  Headset-Pose bekannt ist). Falls sie mal außer Sicht geraten (z. B. weit
  weggeschoben), einfach die VR-Sitzung einmal beenden und neu starten – dann
  werden sie neu vor dir angeordnet.
- **Dev-Server ohne HTTPS starten** (z. B. für Headless-Tests):
  `NO_HTTPS=1 npm run dev:web`.

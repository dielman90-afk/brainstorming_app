// Gemeinsame Maße des Dojos.
//
// Architektur, Requisiten und Atmosphäre entstehen getrennt voneinander. Damit
// die drei Teile hinterher zusammenpassen – die Lichtschächte durch *diese*
// Shoji fallen, der Waffenständer an *dieser* Wand steht, die Schatten aus
// *dieser* Richtung kommen – stehen alle Maße hier und nirgends sonst.
// Zahlen doppelt zu pflegen wäre die sicherste Art, einen Raum zu bauen, in dem
// nichts zueinander passt.
//
// Alles in Metern, Weltkoordinaten, Boden bei y = 0.

// --- Der Raum ---------------------------------------------------------------
//
// Der Nutzer steht bei (0, 1.6, 0) und blickt nach −Z. Der Raum liegt also
// überwiegend vor ihm, mit etwas Luft im Rücken.
export const ROOM = {
  minX: -6,
  maxX: 6,
  minZ: -6.5,
  // **Nach Süden verlängert: 9 → 14 m.**
  //
  // Der Raum war quer zur Blickrichtung breiter als tief; man stand mit dem
  // Rücken fast an der Südwand. Die Referenzbilder zeigen durchweg eine Halle,
  // die in Blickrichtung *länger* ist als breit. Der Spawn bleibt bei (0,0),
  // der zusätzliche Platz liegt also im Rücken – dort, wo bisher die Wand war.
  //
  // Was daran hängt, leitet sich aus dieser Zahl ab: Dielen, Matten, Decke,
  // Unterzüge, Engawa, Ranma, Begrenzung. Die drei Stellen, die **nicht**
  // automatisch mitgehen, stehen unten in diesem File (FIELD, SUN.shadow,
  // SHOJI) – und genau deshalb stehen sie hier und nicht in architecture.js.
  maxZ: 7.5,
  floorY: 0,
  // **Geschlossene Decke statt offenem Dachstuhl.**
  //
  // Zuerst stand hier ein offener Giebeldachstuhl mit sichtbaren Sparren – weil
  // er dramatisch wirkt. Er war die Quelle praktisch jedes Lochs, an dem vier
  // Runden lang gearbeitet wurde (schwarze Decke, Magenta an den Traufen, zwei
  // Fortsätze in der Silhouette), und er entspricht nicht dem, wie ein Dojo
  // gebaut ist: Referenzbilder zeigen durchweg eine **geschlossene, flache
  // Decke** mit sichtbaren Unterzügen darunter und einem Fensterband (Ranma)
  // zwischen Wandkrone und Decke.
  //
  // Die geschlossene Decke ist zugleich billiger, dichter und leichter richtig
  // hinzubekommen. Höhe bleibt großzügig – unter drei Metern wirkt der Raum
  // wie ein Keller.
  wallTop: 3.05,   // Oberkante der geschlossenen Wand
  ranmaTop: 3.72,  // Oberkante des Fensterbands darüber
  ceilingY: 3.95,  // Unterseite der Deckenschalung
};

export const ROOM_WIDTH = ROOM.maxX - ROOM.minX; // 12
export const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ; // 9

// --- Freizone ---------------------------------------------------------------
//
// Karten erscheinen auf einem Halbkreis mit Radius 1,15 m und werden bei 1,5 m
// neu angeordnet (cards.js:256/294). Alles, was näher als FREE_RADIUS an den
// Ursprung rückt, steckt hinterher in den Karten. Das Konstrukt löst dasselbe
// Problem, indem es seine Sitzgruppe auf z = −3.9 schiebt.
export const FREE_RADIUS = 2.0;

// Hilfsprüfung für die Bauteile – im Zweifel lieber verschieben als hoffen.
export function insideFreeZone(x, z, margin = 0) {
  return Math.hypot(x, z) < FREE_RADIUS + margin;
}

// --- Tatami -----------------------------------------------------------------
//
// Normmaß. Das ist der Maßstabsgeber des Raums: Wer die Mattengröße verändert,
// verändert die gefühlte Größe von allem anderen.
export const TATAMI = { long: 1.82, short: 0.91, thickness: 0.055 };

// Ausdehnung des Mattenfeldes. Stand vorher als vier feste Zahlen in
// architecture.js – beim Verlängern des Raums wäre das Feld dort stehen
// geblieben und hätte nach einem Drittel der neuen Tiefe aufgehört, mitten im
// Raum, ohne dass irgendetwas es gemeldet hätte. Jetzt ist es abgeleitet:
// ringsum bleibt rund anderthalb Meter Diele frei.
export const FIELD = {
  x0: -3.64,
  x1: 3.64,
  z0: ROOM.minZ + 1.5,
  rows: Math.floor((ROOM.maxZ - 1.5 - (ROOM.minZ + 1.5)) / TATAMI.short),
};

// --- Wände ------------------------------------------------------------------
//
// Ost = Shoji-Front, dahinter steht die Sonne. West = Putz mit Waffenständer.
// Nord = Tokonoma. Süd = offene Veranda / Zugang.
export const WALL = {
  east: ROOM.maxX,
  west: ROOM.minX,
  north: ROOM.minZ,
  south: ROOM.maxZ,
  thickness: 0.12,
};

// --- Öffnungen ---------------------------------------------------------------
//
// Jede Öffnung beschreibt eine Wandebene (`axis`/`fixedVal`), die Richtung, in
// der der Raum liegt (`inward`), und ihre Ausdehnung längs der Wand. `inward`
// ist der Kern: Rahmen, Gitter und Papier sitzen in *drei* verschiedenen
// Abständen von der Wandebene, und die Papierfläche hat zusätzlich eine
// Vorderseite. Ohne Vorzeichen stimmt das auf zwei von vier Wänden – genau der
// Fehler, der im Ranma steckte und in der Brille (FrontSide) zu Löchern in
// West- und Südwand geführt hat.
//
// Vorzeichenregel: `inward` zeigt von der Wandebene in den Raum.

// Ostfront: die Sonnenseite. Behält Namen und Bedeutung, weil atmosphere.js an
// neun Stellen daraus rechnet (Lichtschächte, Blendenglühen, Bodenpfützen).
export const SHOJI = {
  axis: 'x',
  x: WALL.east,
  inward: -1,
  // Zehn statt sechs Felder: Die Front füllt die auf 14 m verlängerte Wand.
  // Feldbreite bleibt bei rund 1,2 m – die Zahl, die man als Maßstab liest.
  panels: 10,
  fromZ: -5.6,
  toZ: 6.6,
  sillY: 0.42, // Brüstungshöhe (Koshi)
  headY: 2.85, // Sturz
  koshi: true,
  lattice: { cols: 4, rows: 7, barWidth: 0.022, barDepth: 0.016 },
};

// Südfront: zur Engawa hin. Gleiche Bauart wie der Osten, aber im Schatten des
// eigenen Gebäudes – die Sonne steht im Osten, hier fällt nur Streulicht ein.
export const SHOJI_SOUTH = {
  axis: 'z',
  z: WALL.south,
  inward: -1,
  panels: 8,
  from: -5.0,
  to: 5.0,
  sillY: 0.42,
  headY: 2.85,
  koshi: true,
  shaded: true,
  lattice: { cols: 4, rows: 7, barWidth: 0.022, barDepth: 0.016 },
};

// Hohe Bänder auf den beiden möblierten Wänden. Sie beginnen über
// Waffenständer und Tokonoma, damit die Möblierung an der Wand stehen bleibt –
// eine bodentiefe Front hätte den Ständer vor ein Fenster gestellt und der
// Nische ihre geschlossene Rückwand genommen.
const BAND = { sillY: 1.75, headY: 2.85, koshi: false, shaded: true };

export const BAND_WEST = {
  ...BAND,
  axis: 'x',
  x: WALL.west,
  inward: 1,
  panels: 8,
  from: -5.4,
  to: 6.4,
  lattice: { cols: 3, rows: 3, barWidth: 0.022, barDepth: 0.016 },
};

// Nordwand: zwei Bänder links und rechts der Tokonoma.
export const BAND_NORTH = [
  {
    ...BAND,
    axis: 'z',
    z: WALL.north,
    inward: 1,
    panels: 2,
    from: -5.4,
    to: -1.65,
    lattice: { cols: 3, rows: 3, barWidth: 0.022, barDepth: 0.016 },
  },
  {
    ...BAND,
    axis: 'z',
    z: WALL.north,
    inward: 1,
    panels: 2,
    from: 1.65,
    to: 5.4,
    lattice: { cols: 3, rows: 3, barWidth: 0.022, barDepth: 0.016 },
  },
];

// Tokonoma (Bildnische) in der Nordwand.
export const TOKONOMA = {
  centerX: 0,
  width: 2.7,
  depth: 0.5,
  floorY: 0.14, // erhöhter Nischenboden
  headY: 2.6,
};

// Waffenständer an der Westwand.
export const RACK = { x: WALL.west + 0.28, z: -3.2, y: 0.0 };

// Makiwara (Schlagpfosten) – abseits der Freizone, aber im Blick.
export const MAKIWARA = { x: -2.9, z: -0.4 };

// --- Licht ------------------------------------------------------------------
//
// **Eine** Hauptlichtquelle, tief stehende Nachmittagssonne durch die
// Ostfront. Jeder Schatten, jedes Glanzlicht und jedes gebackene AO im ganzen
// Raum muss zu dieser Richtung passen – Rubrikpunkt 3, und der häufigste Weg,
// wie eine Szene „computergeneriert" aussieht, ist genau hier zu schludern.
export const SUN = {
  // Tiefer und schraeger als zuvor (rund 11 statt 18 Grad ueber dem Horizont).
  //
  // Kompositionsentscheidung, keine Helligkeitsfrage: Gemessen war nie etwas
  // geklemmt (Spitze 200 von 255), das Bild wurde nur von einer grossen Flaeche
  // ohne Binnenzeichnung an der Ostseite beherrscht. Steht die Sonne flacher,
  // ziehen sich Schaechte und Lichtpfuetzen **quer durch den Raum** bis zur
  // Westwand, statt sich neben der Shoji zu stauen – und die Fensterschatten
  // laufen ueber den ganzen Boden.
  //
  // Weil Schatten, Schaechte und Glanzlichter alle aus dieser einen Quelle
  // abgeleitet werden, gehen sie zwangslaeufig mit; genau dafuer steht sie hier
  // und nicht dreimal verteilt.
  // **Position und Ziel sind gemeinsam verschoben, die Richtung ist unverändert.**
  //
  // Vorher zielte die Sonne auf (−2,8 | 0,85 | −3,6). Das war die Mitte des
  // *alten* Raums; das Schattenfrustum ist um das Ziel zentriert, und im auf
  // 14 m verlängerten Raum hätte es die Südhälfte nicht mehr erfasst –
  // abgeschnittene Schatten am Rand, der klassische stille Fehler beim
  // Vergrößern einer Szene. Ziel liegt jetzt in der neuen Raummitte, und die
  // Position ist um denselben Vektor mitgewandert: `target − position` ist
  // bitgleich (−15,3 | −3,05 | −6,0) wie zuvor.
  //
  // Das ist wichtig, weil Lichtschächte, Bodenpfützen und jedes Glanzlicht aus
  // `sunDirection()` abgeleitet sind. Eine geänderte Richtung hätte die ganze
  // Beleuchtung neu justiert – hier ändert sich ausschließlich, *welcher*
  // Ausschnitt Schatten bekommt.
  position: [15.3, 3.9, 6.5],
  target: [0, 0.85, 0.5],
  color: 0xffe9c4,
  intensity: 1.9,
  // Ortho-Frustum eng um den Innenraum. Zu weit gefasst = weiche, matschige
  // Schatten; zu eng = abgeschnittene Schatten am Rand.
  //
  // 12 m Halbmaß decken die Raumdiagonale ab der neuen Mitte (√(6² + 7²) = 9,2)
  // plus den Bambushain vor der Ostfront ab. Die Karte wächst auf 2048 mit:
  // 24 m auf 1024 wären 2,3 cm je Texel gewesen, gröber als vor der
  // Verlängerung – und die Schatten des Hains auf dem Papier sind genau das,
  // wofür der Hain da ist. Mit 2048 sind es 1,17 cm, feiner als vorher.
  shadow: { halfExtent: 12, near: 0.5, far: 34, mapSize: 2048, bias: -0.0012, normalBias: 0.02 },
};

// Richtung, aus der das Licht kommt, als normalisierter Vektor – für
// Lichtschächte und alles, was sich daran ausrichten muss.
export function sunDirection() {
  const [px, py, pz] = SUN.position;
  const [tx, ty, tz] = SUN.target;
  const dx = tx - px;
  const dy = ty - py;
  const dz = tz - pz;
  const len = Math.hypot(dx, dy, dz);
  return [dx / len, dy / len, dz / len];
}

// Fülllicht: kühl, schwach, von der gegenüberliegenden Seite. Ohne das säuft
// alles ab, was die Sonne nicht trifft; mit zu viel davon verschwindet der
// Kontrast, der den Raum plastisch macht.
export const FILL = { color: 0x9fc2d8, ground: 0x7a6549, intensity: 0.85 };

// --- Zeichenbudget ----------------------------------------------------------
//
// Aufgeteilt auf die drei Bauteile, damit sich niemand auf Kosten der anderen
// bedient. Gemessen mit `renderer.info.render.calls` bei nur sichtbarem Dojo.
export const BUDGET = {
  architecture: { draws: 40, triangles: 60000 },
  props: { draws: 30, triangles: 40000 },
  atmosphere: { draws: 20, triangles: 20000 },
  exterior: { draws: 6, triangles: 40000 },
};

// --- Außenwelt ---------------------------------------------------------------
//
// Ein Bambushain zwischen Sonne und Ostfront. Der eigentliche Zweck ist nicht,
// dass man ihn *sieht* – durch Washi sieht man ohnehin nur Umrisse –, sondern
// dass er seine **Schatten auf das Papier wirft**. Das ist das Bild, an dem man
// ein Dojo erkennt, und es kostet nichts extra: Sonne und Schattendurchgang
// existieren bereits, der Hain hängt sich nur hinein.
//
// Deshalb steht `grove` nicht rundum, sondern als Streifen dort, wo er zwischen
// Sonne und Fenster steht. Rundum wäre teurer und auf drei Seiten wirkungslos.
export const EXTERIOR = {
  // Streifen östlich der Shoji-Front: nah genug für harte Schatten auf dem
  // Papier, weit genug, dass die Halme nicht in der Wand stehen.
  grove: { x0: 6.9, x1: 11.4, z0: -9.5, z1: 10.5, count: 46 },
  // Zweite Gruppe vor der Südfront – dort schaut man durch offene Felder
  // hinaus, hier zählt die Sicht und nicht der Schatten.
  south: { x0: -8.5, x1: 8.5, z0: 9.4, z1: 14.0, count: 26 },
  // Der Boden muss **über** die Kulisse hinausreichen (Radius 46), sonst endet
  // er sichtbar vor ihr und zwischen Bodenkante und Baumlinie steht ein heller
  // Streifen Himmel am Horizont.
  ground: { size: 110, y: -0.42 },
  // Ferne Baumlinie als Zylindermantel. Radius so, dass sie hinter dem Hain
  // liegt, Höhe so, dass sie den Blick durch ein 2,85 m hohes Fenster füllt.
  backdrop: { radius: 46, height: 26 },
};

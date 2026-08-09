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
  maxZ: 2.5,
  floorY: 0,
  // Traufhöhe innen. Ein Dojo ist hoch – unter 3,5 m wirkt es wie ein Keller,
  // und der Sinn der ganzen Übung ist ein Raum, in dem man sich klein fühlt.
  wallTop: 3.6,
  ridgeY: 5.4, // First des offenen Dachstuhls
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

// Shoji-Front an der Ostwand: sechs Felder, von z … bis z, Brüstung unten.
export const SHOJI = {
  x: WALL.east,
  panels: 6,
  fromZ: -5.6,
  toZ: 1.6,
  sillY: 0.42, // Brüstungshöhe (Koshi)
  headY: 2.85, // Sturz
  lattice: { cols: 4, rows: 7, barWidth: 0.022, barDepth: 0.016 },
};

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
  position: [11.5, 5.2, 1.5],
  target: [-1.0, 1.1, -3.0],
  color: 0xffe9c4,
  intensity: 2.5,
  // Ortho-Frustum eng um den Innenraum. Zu weit gefasst = weiche, matschige
  // Schatten; zu eng = abgeschnittene Schatten am Rand.
  shadow: { halfExtent: 8.5, near: 0.5, far: 26, mapSize: 1024, bias: -0.0012, normalBias: 0.02 },
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
export const FILL = { color: 0x9fc2d8, ground: 0x3a3730, intensity: 0.55 };

// --- Zeichenbudget ----------------------------------------------------------
//
// Aufgeteilt auf die drei Bauteile, damit sich niemand auf Kosten der anderen
// bedient. Gemessen mit `renderer.info.render.calls` bei nur sichtbarem Dojo.
export const BUDGET = {
  architecture: { draws: 40, triangles: 60000 },
  props: { draws: 30, triangles: 40000 },
  atmosphere: { draws: 20, triangles: 20000 },
};

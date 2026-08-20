// Begehbarer Bereich einer Umgebung.
//
// Jede Umgebung darf ein `walk`-Objekt mitgeben. Es beantwortet genau zwei
// Fragen, beide in WELTKOORDINATEN:
//
//   limit(x, z, out)  Wohin gehoert dieser Punkt? Liegt er ausserhalb des
//                     erlaubten Bereichs, wird die Projektion nach `out`
//                     geschrieben, sonst der Punkt selbst.
//   floorAt(x, z)     Wie hoch liegt dort der Boden?
//
// Dazu zwei optionale Angaben:
//
//   maxY              absolute Decke fuer die Desktop-Kamera (das Dojo hat
//                     eine, eine Insel unter offenem Himmel nicht)
//   reset()           wird gerufen, sobald die Umgebung aktiv wird
//
// **Das ist eine Projektion, kein Kollisionssystem.** Es kennt keinen Weg und
// keine Einzelobjekte: Man kann weiterhin durch eine Laterne, ein Becken oder
// einen Baumstamm hindurchgehen. Was es leistet, ist die Grundfrage — auf
// welcher Flaeche stehe ich, und wo hoert sie auf.
//
// Warum ueberhaupt: Ohne das lief man mit dem Stick durch die Wand ins schwarze
// Nichts hinter der Szene (in VR besonders unangenehm, weil nichts mehr
// Orientierung gibt) und am Desktop mit Q/E senkrecht durch Baumkronen und
// unter die Insel. Beide Tasten gibt es deshalb nicht mehr; die Hoehe kommt
// jetzt aus `floorAt`.

const IDENTITY_LIMIT = (x, z, out) => {
  out.x = x;
  out.z = z;
};

// Unbegrenzt, Boden auf y = 0. Vorgabe fuer jede Umgebung ohne eigenen
// Eintrag sowie fuer Passthrough und die weisse Desktop-Ansicht. In beiden
// Betriebsarten ist das ein Nichtstun in x/z — genau richtig fuer eine Welt,
// die keine Grenze braucht.
export const FLAT_WALK = {
  limit: IDENTITY_LIMIT,
  floorAt: () => 0,
};

// Unbegrenzt, aber mit Gelaende. Fuer Welten, deren Boden ein Hoehenfeld ist
// und die trotzdem bis ins Unendliche begehbar bleiben sollen (Nachthimmel).
export function makeHeightFieldWalk(floorAt) {
  return { limit: IDENTITY_LIMIT, floorAt };
}

// --- Begehbarer Bereich aus mehreren Zonen -----------------------------------
//
// Eine einzige Box reicht nicht, seit der Dojo-Garten betretbar ist: Raum,
// Tuerdurchgang, Veranda, Stufe und Kiesbeet sind zusammen ein L, kein
// Rechteck. Eine Box um beides liesse den Nutzer **neben** der Tuer durch die
// Suedwand laufen.
//
// **Warum nicht "die Zone mit der kleinsten Korrektur".** Das war der erste
// Entwurf und er ist falsch: Steht man im Raum bei x = 1,5 vor der
// geschlossenen Wand und drueckt nach Sueden, dann liegt der naechste Punkt der
// Verandazone naeher als der Raumrand — man wuerde durch die Wand geschoben.
//
// **Kette statt Naehe.** Man wechselt nur in eine Zone, in der man bereits
// **steht**. Sonst wird auf die aktuelle Zone geklemmt. Benachbarte Zonen
// ueberlappen sich deshalb grosszuegig — ohne Ueberlappung kaeme man nie
// hinueber, und bei zu knapper Ueberlappung springt man bei hoher
// Geschwindigkeit darueber hinweg (3,4 m/s mal 0,1 s Bildabstand sind 34 cm
// pro Bild).
//
// Damit entsteht ein Korridor ohne Wegfindung: Aus dem Raum erreicht man die
// Veranda nur durch den Tuerdurchgang, weil nur dessen Zone den Streifen
// dazwischen abdeckt.
export function makeZonesWalk(zones, { maxY } = {}) {
  let current = 0;
  const inside = (z, px, pz) => px >= z.minX && px <= z.maxX && pz >= z.minZ && pz <= z.maxZ;

  const zoneAt = (px, pz) => {
    if (!inside(zones[current], px, pz)) {
      const k = zones.findIndex((z) => inside(z, px, pz));
      if (k >= 0) current = k;
    }
    return zones[current];
  };

  return {
    maxY,
    reset() {
      current = 0;
    },
    limit(x, z, out) {
      const zone = zoneAt(x, z);
      out.x = Math.min(Math.max(x, zone.minX), zone.maxX);
      out.z = Math.min(Math.max(z, zone.minZ), zone.maxZ);
    },
    // Wird immer NACH `limit` mit dem geklemmten Punkt gerufen, die Zone steht
    // dann also schon fest.
    floorAt: () => zones[current].floorY ?? 0,
  };
}

// --- Begehbare Insel ---------------------------------------------------------
//
// Die Insel ist keine Box und kein Kreis: Ihr Umriss ist eine Sternform um den
// Ursprung (`shape.outline`, Faktor 0,6 bis 1,3), und ihre Oberflaeche ist ein
// Relief (`shape.heightAt`) — flach in der Mitte, nach aussen ein Randwall mit
// Hoehenruecken. Beides ist analytisch vorhanden und wird von der Geometrie und
// der Objektplatzierung ohnehin schon benutzt; die Sperre greift dieselben
// Funktionen ab und kann deshalb nicht davon abweichen.
//
// **Radiale Klemmung genuegt.** Weil der Umriss sternfoermig um den Ursprung
// ist, gibt es zu jedem Winkel genau einen Randpunkt. Wer tangential an der
// Kante entlanglaeuft, aendert dabei den Winkel und rutscht damit an ihr
// entlang — es blockiert nicht, es fuehrt.
//
// `scale` ist der Weltmassstab der Inselgruppe: Die Form rechnet in lokalen
// Einheiten, die Sperre bekommt Weltkoordinaten. `edge` ist der Anteil des
// Umrisses, bis zu dem gelaufen werden darf.
export function makeIslandWalk(shape, scale, edge = 0.99) {
  // ACHSENREIHENFOLGE: Die Insel rechnet ihren Winkel als atan2(x, z), nicht
  // als das uebliche atan2(z, x) — siehe `relief()` in environments.js. Wer das
  // vertauscht, bekommt einen um 90 Grad verdrehten Umriss, und die Sperre
  // steht dann quer zur sichtbaren Kante.
  const maxR = (a) => shape.radius * shape.outline(a) * edge;

  return {
    limit(x, z, out) {
      const lx = x / scale;
      const lz = z / scale;
      const r = Math.hypot(lx, lz);
      const R = maxR(Math.atan2(lx, lz));
      if (r <= R || r < 1e-6) {
        out.x = x;
        out.z = z;
        return;
      }
      const f = (R / r) * scale;
      out.x = lx * f;
      out.z = lz * f;
    },
    floorAt(x, z) {
      return shape.heightAt(x / scale, z / scale) * scale;
    },
  };
}

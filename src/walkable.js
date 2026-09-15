import { Vector3, Quaternion } from 'three';

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
// und die trotzdem bis ins Unendliche begehbar bleiben sollen.
export function makeHeightFieldWalk(floorAt) {
  return { limit: IDENTITY_LIMIT, floorAt };
}

// --- Begehbarer Planet -------------------------------------------------------
//
// Der Nachthimmel ist keine Platte mehr, sondern eine Kugel mit 25 m Halbmesser,
// die man in gut einer Minute umrunden kann. Auf ihr gaebe es kein „oben", das
// fuer die ganze Welt gilt — und genau davon lebt der Rest der App: `Locomotion`
// rechnet mit UP = (0,1,0), `cards.js` ordnet Karten auf einem Zylinder um den
// Nutzer an und richtet sie mit gleichbleibendem y auf, Whiteboard und Zonen
// sind flach und achsenparallel gebaut.
//
// **Deshalb bleibt der Spieler am Nordpol stehen und die Welt dreht sich unter
// ihm.** Optisch ist das dieselbe Relativbewegung, nur traegt eine andere Matrix
// sie. Der Spieler bleibt achsenparallel bei (0, R + Bodenhoehe, 0), und der
// gesamte uebrige Code laeuft unveraendert weiter.
//
// Der Umbau passt vollstaendig in dieses Objekt: `limit()` bekommt jedes Bild
// die Weltposition des Kopfes und schiebt sie ohnehin schon irgendwohin zurueck.
// Auf dem Planeten wird der Abstand vom Pol, den Stick, Handzug oder WASD
// erzeugt haben, in eine Weltdrehung umgerechnet, bevor er weggeklemmt wird.
// `Locomotion` und `updateDesktopMovement` bleiben unberuehrt und wissen nichts
// von Kugeln.
//
// **`freiraum` ist ein Totband, und Totbaender kosten doppelt.** Er soll
// zulassen, dass man sich vorbeugt, um eine Karte zu lesen, ohne dass sich die
// Welt dreht. Der erste Wert war 90 cm, und das war zu viel: Ein Totband in der
// **Position** muss bei jeder Richtungsumkehr einmal ganz durchlaufen werden —
// 1,8 m, in denen der Stick nichts bewirkt. Gemessen mit
// `tools/desktop-pose.mjs`: zwei Sekunden Vorwaertstaste ergaben **0,00 m**
// Weltdrehung, weil die Kamera nur von einem Rand des Freiraums zum anderen
// gewandert ist. Genau das meldet sich als „die Steuerung ist komisch".
//
// 25 cm kosten bei einer Umkehr eine halbe Sekunde bei Schrittgeschwindigkeit
// und fangen das Vorbeugen weiterhin ab. Die Kugel weicht auf 25 cm um 1,3 mm
// von der Tangentialebene ab; die Flaechennormale steht 0,6 Grad schief. Beim
// Gehen mit dem Stick ist der Freiraum nach 0,1 s durchlaufen, danach ist die
// Uebersetzung 1:1: 2,4 m/s Stickgeschwindigkeit sind 2,4 m/s ueber Grund.
//
//   radius       Planetenhalbmesser
//   heightAt(d)  Gelaendehoehe ueber der Kugel in Richtung d — in
//                PLANETENKOORDINATEN, also vor der Weltdrehung
//   welt         die Gruppe, die den Planeten traegt und gedreht wird
//   nachDrehung  wird nach jeder Drehung gerufen (der Himmel uebernimmt sie)
export function makePlanetWalk({ radius, heightAt, welt, nachDrehung, freiraum = 0.25 }) {
  const _achse = new Vector3();
  const _dir = new Vector3();
  const _inv = new Quaternion();

  return {
    istPlanet: true,
    radius,
    // **Der Freiraum gehoert nach aussen.** Der Pruefstand muss den Kopf um
    // genau diesen Betrag plus die Schrittlaenge abdriften lassen, sonst misst
    // er eine andere Uebersetzung als die, die in der Brille passiert. Als der
    // Wert von 0,9 auf 0,25 m fiel, hat `tools/rundgang.mjs` seine fest
    // eingetragene 0,9 behalten und daraufhin je Schritt 68 cm statt 3,3 cm
    // gedreht — der Rundgang „schloss nicht", und die Bodenkontaktzahlen waren
    // um den Faktor 20 verstellt. Eine Zahl, die zwei Seiten kennen muessen,
    // darf nur an einer Stelle stehen.
    freiraum,

    limit(x, z, out) {
      const r = Math.hypot(x, z);
      if (r <= freiraum) {
        out.x = x;
        out.z = z;
        return;
      }
      out.x = (x * freiraum) / r;
      out.z = (z * freiraum) / r;

      // ACHSE: Der Boden unter dem Nutzer soll dorthin wandern, wo der Nutzer
      // herkommt — er selbst kommt ja nicht vom Fleck. Mit der Abdrift
      // d = (x, 0, z) ist das eine Drehung um d x oben = (-z, 0, x): Wer nach
      // -Z geht, dreht die Welt um +X, und der Punkt unter ihm wandert nach +Z.
      // Der Winkel ist Strecke durch Halbmesser, damit ist die Uebersetzung
      // exakt 1:1 in Bogenmetern.
      _achse.set(-z, 0, x).multiplyScalar(1 / r);
      welt.rotateOnWorldAxis(_achse, (r - freiraum) / radius);
      nachDrehung?.(welt);
    },

    // Wird immer NACH `limit` mit dem geklemmten Punkt gerufen — x und z liegen
    // also innerhalb des Freiraums.
    //
    // Auf der Kugel ist der Boden bei gegebenem x/z nicht `hoehe`, sondern die
    // Hoehe der Kugelschale darueber: y = sqrt(Rg^2 - x^2 - z^2). Am Rand des
    // Freiraums sind das 1,6 cm — klein, aber die Pruefung verlangt Bodenkontakt
    // unter einem Zentimeter, und geschenkt ist es ohnehin.
    floorAt(x, z) {
      const r2 = x * x + z * z;
      _dir.set(x, Math.sqrt(Math.max(0, radius * radius - r2)), z).normalize();
      // Der Boden dreht sich mit der Welt; gefragt ist die Richtung, die vor
      // der Drehung dort lag.
      _dir.applyQuaternion(_inv.copy(welt.quaternion).invert());
      const rg = radius + heightAt(_dir);
      return Math.sqrt(Math.max(0, rg * rg - r2));
    },
  };
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

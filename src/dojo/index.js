import * as THREE from 'three';
import { buildArchitecture } from './architecture.js';
import { buildProps } from './props.js';
import { buildAtmosphere } from './atmosphere.js';
import { buildExterior } from './exterior.js';
import { applyQuality } from './quality.js';
import { ROOM } from './layout.js';

// ⛩ Konstrukt-Dojo – der Trainingsraum aus dem Film.
//
// Fügt die drei getrennt gebauten Teile zusammen und reicht sie als ganz
// normale Umgebung nach außen: `{ id, name, group, background, fog, update }`,
// dasselbe Format wie Insel, Nachthimmel, Zen-Garten und Konstrukt.
//
// **Warum eine eigene Datei je Teil.** `environments.js` hat 2671 Zeilen; alles
// hier hineinzuschreiben hätte die Datei um die Hälfte wachsen lassen und
// paralleles Arbeiten daran unmöglich gemacht. Architektur, Requisiten und
// Atmosphäre haben außerdem kaum Berührung miteinander – ihre einzige
// gemeinsame Grundlage sind die Maße in `layout.js`.
//
// **Warum die Environment-Map erst beim Einschalten entsteht.** Der
// PMREM-Generator braucht einen lebenden Renderer und rechnet auf der GPU. Beim
// Modulstart wäre das Startzeit für jeden Nutzer, auch für den, der das Dojo nie
// aufruft – und alle Umgebungen werden beim Laden eifrig gebaut (main.js:98).
// Deshalb baut `ensureEnvironment(renderer)` sie beim ersten Sichtbarwerden,
// einmal, und merkt sie sich.

export function createDojoEnvironment() {
  const group = new THREE.Group();
  group.name = 'env-dojo';

  const architecture = buildArchitecture();
  const props = buildProps();
  const exterior = buildExterior();
  group.add(architecture.group, props.group, exterior.group);

  let atmosphere = null;
  let envMap = null;
  // Startwert Desktop. Die XR-Sitzung meldet sich, wenn sie beginnt.
  let inXR = false;

  return {
    id: 'dojo',
    name: '⛩ Konstrukt-Dojo',
    // **Hintergrund und Nebel sind nicht mehr schwarz.**
    //
    // Vorher war beides fast schwarz, mit der Begründung: Der Raum ist
    // geschlossen, man sieht nirgends hinaus, und ein Himmel dahinter würde die
    // Illusion zerstören. Das galt, solange draußen nichts war – dann ist
    // Schwarz die ehrlichste Farbe für „hier endet die Welt".
    //
    // Jetzt steht dort ein Hain und dahinter eine Baumlinie, und man sieht
    // durch die Südfront wirklich hinaus. Der Nebel beginnt deshalb erst hinter
    // der Rückwand des Raums (14 m Tiefe) und trägt von da an die Ferne; im
    // Innenraum ist er nach wie vor nicht vorhanden.
    background: new THREE.Color(0x9fb0b4),
    fog: new THREE.Fog(0xa8b6b0, ROOM.maxZ - ROOM.minZ + 4, 62),
    group,

    // Begehbarer Bereich. Der Raum ist geschlossen; ohne Begrenzung laeuft man
    // durch die Wand und steht im Nichts. Die Renderschleife klemmt den Spieler
    // jeden Frame hier hinein (main.js).
    bounds: {
      minX: ROOM.minX + 0.45,
      maxX: ROOM.maxX - 0.45,
      minZ: ROOM.minZ + 0.45,
      maxZ: ROOM.maxZ - 0.45,
      minY: 0,
      maxY: ROOM.ranmaTop - 0.4,
    },

    // Wird von `applyEnvironment` beim Aktivieren aufgerufen. Ohne die
    // Environment-Map rendern Klingen, Beschläge und Lack **schwarz** – ein
    // Metall ohne etwas zu spiegeln hat keine diffuse Komponente. Das ist
    // nachgemessen, nicht vermutet.
    ensureEnvironment(renderer) {
      if (!atmosphere && renderer) {
        atmosphere = buildAtmosphere(renderer);
        group.add(atmosphere.group);
        envMap = atmosphere.environment;
      }
      // Stufe erneut anwenden: Beim ersten Aufruf gibt es die Effektlagen aus
      // atmosphere.js noch gar nicht, sie können also beim Umschalten davor
      // nicht erfasst worden sein.
      this.setQuality(inXR);
      return this.environment;
    },

    // Desktop bekommt alles, die Brille die sparsame Fassung. Aufgerufen aus
    // `applyEnvironment` und an den XR-Hooks in main.js – gemessene Grundlage
    // steht in quality.js.
    setQuality(nextInXR) {
      inXR = Boolean(nextInXR);
      if (!envMap) return null;
      this.environment = applyQuality(group, envMap, inXR);
      return this.environment;
    },

    environment: null,

    update(time) {
      architecture.update?.(time);
      props.update?.(time);
      exterior.update?.(time);
      atmosphere?.update?.(time);
    },
  };
}

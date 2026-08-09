import * as THREE from 'three';
import { buildArchitecture } from './architecture.js';
import { buildProps } from './props.js';
import { buildAtmosphere } from './atmosphere.js';
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
  group.add(architecture.group, props.group);

  let atmosphere = null;

  return {
    id: 'dojo',
    name: '⛩ Konstrukt-Dojo',
    // Hintergrund und Nebel sind fast schwarz: Der Raum ist geschlossen, man
    // sieht nirgends hinaus. Was durch die Shoji dringt, ist Licht, keine
    // Landschaft – ein Himmel dahinter würde die Illusion sofort zerstören.
    background: new THREE.Color(0x0a0c0e),
    fog: new THREE.Fog(0x0a0c0e, ROOM.ridgeY * 2.4, 34),
    group,

    // Wird von `applyEnvironment` beim Aktivieren aufgerufen. Ohne die
    // Environment-Map rendern Klingen, Beschläge und Lack **schwarz** – ein
    // Metall ohne etwas zu spiegeln hat keine diffuse Komponente. Das ist
    // nachgemessen, nicht vermutet.
    ensureEnvironment(renderer) {
      if (atmosphere || !renderer) return this.environment ?? null;
      atmosphere = buildAtmosphere(renderer);
      group.add(atmosphere.group);
      this.environment = atmosphere.environment;
      return this.environment;
    },

    environment: null,

    update(time) {
      architecture.update?.(time);
      props.update?.(time);
      atmosphere?.update?.(time);
    },
  };
}

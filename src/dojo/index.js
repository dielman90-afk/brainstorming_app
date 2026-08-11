import * as THREE from 'three';
import { buildArchitecture } from './architecture.js';
import { buildProps } from './props.js';
import { buildAtmosphere } from './atmosphere.js';
import { buildExterior } from './exterior.js';
import { applyQuality } from './quality.js';
import { buildSkyEnvironment, applySkyTo } from './skylight.js';

// **Warum 4,5 und nicht 1.**
//
// Gemessen, nicht gewählt: mittlere Helligkeit im Türausschnitt (320×220,
// dieselbe Pipeline, `readRenderTargetPixels`), einmal je Intensität.
//
//   Intensität   Luma   fast schwarze Bildpunkte
//   0 (Innenraumsonde)  73,1   1,4 %
//   1                   52,2   6,2 %
//   2                   60,3   2,7 %
//   3                   67,2   1,9 %
//   4,5                 76,2   1,2 %
//   6                   84,1   0,4 %
//
// Bei 1 wurde der Garten also **dunkler** als vorher, nicht heller – die
// Strahldichten in skylight.js (0,22 bis 0,58) liegen unter denen der
// Innenraum-Sonde. 4,5 stellt den vorherigen Stand wieder her und geht knapp
// darüber hinaus, was auch richtig ist: Ein Garten unter offenem Himmel
// bekommt mehr indirektes Licht als ein Raum unter einem Dach. Ab 6 füllt das
// Umgebungslicht auch die Tiefen zwischen den Blättern, und der Bestand
// verliert seine Binnenzeichnung.
//
// Die zweite Spalte ist der eigentliche Grund für die Höhe des Werts: Der
// Vorwurf am Garten war nie „zu dunkel im Mittel", sondern die schwarzen Löcher
// zwischen den Blättern. Genau die füllt das Himmelslicht.
const SKY_INTENSITY = 4.5;
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
  let sky = null;
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
      // **Zwei Sonden, nicht eine.**
      //
      // `atmosphere.js` baut eine Innenraum-Sonde – heller Schlitz im Osten,
      // dunkles Holz unten, Kalkputz ringsum. Für alles im Raum ist das genau
      // richtig. Für den Garten davor war es der Grund, warum er stumpf und
      // „wie im Zimmer fotografiert" aussah: Ein Blatt unter freiem Himmel
      // bekommt sein indirektes Licht von einer Halbkugel Himmel, nicht von
      // einer Holzdecke.
      //
      // three kennt genau **eine** `scene.environment`; der einzige Weg zu
      // zwei Sonden ist `material.envMap` je Material. Die Begründung dafür
      // steht ausführlich im Kopf von skylight.js.
      if (!sky && renderer) sky = buildSkyEnvironment(renderer);
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
      // **Reihenfolge ist Pflicht, nicht Geschmack.** `applyQuality()` setzt
      // `envMap` bei *jedem* Standardmaterial der Dojo-Gruppe neu – am Desktop
      // auf `null`, in XR auf die Innenraumkarte. Wer den Himmel davor
      // zuweist, verliert ihn wieder, und zwar lautlos.
      // **Die große Bodenfläche bleibt in der Brille ohne Himmelskarte.**
      //
      // Sie ist 110 m groß und kann durch die Südfront den halben
      // Bildausschnitt füllen – viel Fläche mal einer zusätzlichen
      // IBL-Abtastung je Bildpunkt. Was sie dafür bekommt, ist fast nichts:
      // Moos hat keine nennenswerte Spiegelung, und die Aufhellung der Tiefen,
      // wegen der das Himmelslicht überhaupt da ist, gibt es auf einer ebenen
      // Fläche ohne Tiefen nicht. Am Desktop ist Luft, dort bleibt sie drin –
      // dieselbe Abwägung, die exterior.js für Lambert statt PBR trifft.
      //
      // `skipSky` ist der dafür vorgesehene Ausstieg (skylight.js). Die Karte
      // muss zusätzlich aktiv abgeräumt werden: `applySkyTo()` überspringt ein
      // abgemeldetes Material, es nimmt ihm nichts weg.
      const groundMat = exterior.group.getObjectByName('dojo-exterior-ground')?.material;
      if (groundMat) {
        groundMat.userData.skipSky = inXR;
        if (inXR && groundMat.envMap) {
          groundMat.envMap = null;
          groundMat.needsUpdate = true;
        }
      }
      if (sky) applySkyTo(exterior.group, sky, SKY_INTENSITY);
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

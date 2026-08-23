import * as THREE from 'three';
import { buildArchitecture } from './architecture.js';
import { buildProps } from './props.js';
import { buildAtmosphere } from './atmosphere.js';
import { buildExterior } from './exterior.js';
import { applyQuality } from './quality.js';
import { buildSkyEnvironment, applySkyTo } from './skylight.js';
import { ROOM, EXTERIOR } from './layout.js';
import { makeZonesWalk } from '../walkable.js';

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

// Außenbauteile, die die Himmelskarte in der Brille wieder abgeben. Alles, was
// hier **nicht** steht, behält sie – das sind die Polster, die Kartenbüschel,
// die Kronen und die Fernkronen, also genau das Laub, dessen Tiefen der Himmel
// aufhellen soll.
const SKY_ONLY_ON_DESKTOP = [
  'dojo-exterior-ground',
  'dojo-garden-kies',
  'dojo-garden-stein',
  'dojo-garden-trittsteine',
  'dojo-bamboo',
];

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
  let quality = 'voll';

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

    // --- Begehbarer Bereich ---------------------------------------------
    //
    // **Eine Box reicht nicht mehr.** Raum, Türdurchgang, Engawa, Stufe und
    // Kiesbeet sind zusammen ein L; eine Box um alles ließe den Nutzer neben
    // der Tür durch die Südwand laufen. `makeZonesWalk` (walkable.js) arbeitet
    // deshalb als **Kette**: Man wechselt nur in eine Zone, in der man bereits
    // steht, sonst wird auf die aktuelle geklemmt. Damit entsteht ein Korridor
    // ohne Wegfindung – aus dem Raum erreicht man die Veranda nur durch den
    // Türdurchgang, weil nur dessen Zone den Streifen dazwischen abdeckt.
    //
    // **Die Überlappungen sind Pflicht, nicht Toleranz.** Ohne sie käme man nie
    // von einer Zone in die nächste; bei zu knapper Überlappung springt man bei
    // hoher Geschwindigkeit darüber hinweg (3,4 m/s mal 0,1 s Bildabstand sind
    // 34 cm je Bild). Alle Nachbarzonen überlappen deshalb um mindestens 0,5 m.
    //
    // `floorY` ist die Standfläche. Ohne sie schwebte man im Garten 42 cm über
    // dem Kies; main.js führt sie über wenige Bilder weich nach, damit die
    // Stufe keine Sprungschaltung wird.
    //
    // `minY` stand hier früher und wurde nie gelesen – die Untergrenze ergibt
    // sich aus `floorY` der jeweiligen Zone.
    //
    // Die Maße stammen aus der Architektur, nicht aus dem Augenmaß:
    // Deck bei y −0,06 plus 0,06 Dicke (architecture.js), Stufe bei y −0,17 plus
    // 0,11, Gartenboden bei EXTERIOR.ground.y + 0,045 Kies. Die lichte
    // Türöffnung folgt aus `SHOJI_SOUTH.openPanels` = [3, 4] bei acht Feldern
    // zwischen −5 und 5, also x ∈ [−1,25, 1,25].
    //
    // **Was hier nicht drinsteht:** Kollision mit Laterne und Becken. Es gibt
    // kein Kollisionssystem; man kann durch beide hindurchgehen. Das ist eine
    // bekannte Lücke und keine übersehene.
    walk: makeZonesWalk(
      [
        { minX: -5.55, maxX: 5.55, minZ: -6.05, maxZ: 7.05, floorY: 0 },
        // Türdurchgang: schmaler als die lichte Öffnung, damit man nicht am
        // Pfosten schrammt, und weit genug nach innen und außen gezogen, dass
        // beide Nachbarzonen sicher erreicht werden.
        { minX: -1.15, maxX: 1.15, minZ: 6.4, maxZ: 8.0, floorY: 0 },
        // Engawa: nur der Streifen vor der Tür. Über die ganze Wandbreite
        // gelegt wäre er von jedem Punkt der Südwand aus erreichbar – und
        // damit wäre die Kette wieder gerissen.
        { minX: -2.6, maxX: 2.6, minZ: 7.2, maxZ: 8.5, floorY: -0.03 },
        { minX: -1.3, maxX: 1.3, minZ: 8.1, maxZ: 9.0, floorY: -0.115 },
        // Kiesbeet, aber mit Abstand zum Rand: Die Pflanzung dahinter ist auf
        // Blickdistanz gebaut, nicht zum Hindurchlaufen.
        { minX: -4.6, maxX: 4.6, minZ: 8.6, maxZ: 12.4, floorY: EXTERIOR.ground.y + 0.045 },
      ],
      // Decke fuer die Desktop-Kamera. Ein Raum hat eine, eine Insel unter
      // offenem Himmel nicht — deshalb steht sie hier und nicht in walkable.js.
      { maxY: ROOM.ranmaTop - 0.4 }
    ),

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
      this.setQuality(quality);
      return this.environment;
    },

    // Desktop bekommt alles, die Brille die sparsame Fassung. Aufgerufen aus
    // `applyEnvironment` und an den XR-Hooks in main.js – gemessene Grundlage
    // steht in quality.js.
    // Nimmt eine Stufe ('sparsam' | 'mittel' | 'voll') oder – wie früher – einen
    // Boolean. `inXR` heißt hier weiterhin „nicht die volle Fassung"; die
    // Feinheit steckt in quality.js.
    setQuality(stufe) {
      quality = stufe;
      inXR = stufe === true || (typeof stufe === 'string' && stufe !== 'voll');
      if (!envMap) return null;
      this.environment = applyQuality(group, envMap, quality);
      // **Reihenfolge ist Pflicht, nicht Geschmack.** `applyQuality()` setzt
      // `envMap` bei *jedem* Standardmaterial der Dojo-Gruppe neu – am Desktop
      // auf `null`, in XR auf die Innenraumkarte. Wer den Himmel davor
      // zuweist, verliert ihn wieder, und zwar lautlos.
      // **In der Brille bekommt nur das Laub die Himmelskarte.**
      //
      // Gemessen, Blick durch die Südtür, sparsame Fassung, alles in einer
      // Sitzung (also unter gleicher Fremdlast, was hier entscheidend ist):
      //
      //   alles an                          1911,0 ms
      //   ohne Himmelskarte                 1274,6 ms   (−33,3 %)
      //   ohne Himmelskarte und Blattkarten  587,5 ms   (−69,3 %)
      //   Wiederholung desselben Falls       591,8 ms   (0,7 % Streuung)
      //
      // **Was diese 33 % nicht heißen.** Auf SwiftShader gibt es keine
      // Textur-Abtasteinheiten; ein Shader, der eine PMREM-Karte anfasst, wird
      // dort überproportional bestraft. Die Rangfolge überträgt sich auf die
      // Quest, der Faktor nicht – genau diese Verwechslung hat in Runde 5 die
      // Lichtschächte gekostet. Der Himmel wird deshalb **nicht** wegen der
      // Prozentzahl abgeschaltet.
      //
      // Abgezogen wird er dort, wo er unabhängig davon nichts leistet: Sein
      // Zweck ist, die Tiefen **zwischen den Blättern** aufzuhellen (das war
      // der Unterschied von 6,2 % auf 1,2 % fast schwarzer Bildpunkte). Kies,
      // Trittsteine, Laterne, Becken und Halme haben solche Tiefen nicht, und
      // die 110-m-Bodenfläche schon gar nicht – die kann durch die Südfront
      // den halben Bildausschnitt füllen. Am Desktop ist Luft, dort bleibt
      // alles wie es ist.
      //
      // `skipSky` ist der dafür vorgesehene Ausstieg (skylight.js). Die Karte
      // muss zusätzlich aktiv abgeräumt werden: `applySkyTo()` überspringt ein
      // abgemeldetes Material, es nimmt ihm nichts weg.
      for (const name of SKY_ONLY_ON_DESKTOP) {
        const material = exterior.group.getObjectByName(name)?.material;
        if (!material) continue;
        material.userData.skipSky = inXR;
        if (inXR && material.envMap) {
          material.envMap = null;
          material.needsUpdate = true;
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

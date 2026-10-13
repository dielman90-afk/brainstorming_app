// **Zwei Qualitaetsstufen – und beide zeigen dasselbe Bild.**
//
// Bis hierher gab es drei Stufen (sparsam, mittel, voll), und die beiden
// unteren haben gespart, indem sie das Bild veraenderten: doppelseitiges Laub
// wurde einseitig, die Umgebungskarte (IBL) fiel weg, Rauheitskarten wurden
// durch einen Mittelwert ersetzt, Blattkarten und Buesche ausgeduennt, additive
// Lagen ausgeblendet. Gemessen war jeder dieser Posten (cost.mjs), und als
// Rangfolge stimmte das auch:
//
//   IBL (scene.environment)          24,9 %
//   additive Lagen                   10,6 %
//   Schattenpass ganz aus             9,5 %
//   DoubleSide → FrontSide            9,0 %
//   Rauheitskarten (große Flächen)    8,8 %
//
// **Der Nutzer hat das Ergebnis auf der Quest 3 beurteilt: „Nur die hoechste
// Qualitaet sieht in VR gut aus. Alles andere ist nicht zu gebrauchen."** Die
// Brillenvorgabe war ausgerechnet „mittel". Im Dojo kippte das Bild am
// staerksten, weil dort fast der ganze Innenraum von der Umgebungskarte lebt –
// wer in der Brille die Stufe wechselte, sah einen anderen Raum.
//
// Deshalb gilt jetzt: **Die Optik ist nicht verhandelbar.** Beide Stufen laufen
// den Pfad, der frueher „voll" hiess, und zwar Anweisung fuer Anweisung, damit
// „Voll" bitgleich zum alten „voll" bleibt (`tools/stufenwechsel.mjs`).
// „Flüssig" spart nur, was man nicht sieht:
//
//   * Schattenkarte 1024 statt 2048 (gemessen rund 6,5 % der Bildzeit im Dojo;
//     sichtbar nur als etwas weichere Kante eines Halmschattens),
//   * den Schattenpass nur jedes zweite Bild (main.js, Animationsschleife) –
//     die Sonne steht still, es bewegt sich nur das Laub im Wind.
import * as THREE from 'three';

export const STUFEN = ['voll', 'fluessig'];

export function normStufe(stufe) {
  return STUFEN.includes(stufe) ? stufe : 'voll';
}

/**
 * Setzt die Qualitaetsstufe einer Umgebungsgruppe.
 *
 * @param {THREE.Object3D} group   Wurzel der Umgebung
 * @param {THREE.Texture|null} envMap  Umgebungskarte (PMREM) oder null
 * @param {string} stufe           'voll' | 'fluessig'
 * @returns {THREE.Texture|null}   Was als `scene.environment` gesetzt werden soll
 */
export function applyQuality(group, envMap, stufe) {
  // **Die Schattenkarte ist die einzige Stellschraube.** Auch die Insel, deren
  // Sonne mit 1024 gebaut wird, laeuft in „Voll" auf 2048 – so stand es schon
  // im alten Pfad, und genau so hat der Nutzer die volle Stufe gesehen.
  const want = normStufe(stufe) === 'fluessig' ? 1024 : 2048;
  group.traverse((o) => {
    if (!o.isDirectionalLight || !o.castShadow) return;
    if (o.shadow.mapSize.x === want) return;
    o.shadow.mapSize.set(want, want);
    // Ohne das Verwerfen behaelt three die alte Textur und die neue Groesse
    // greift nie – ein stiller Fehlschlag, der wie ein Messfehler aussaehe.
    o.shadow.map?.dispose();
    o.shadow.map = null;
  });

  // **Die Umgebungskarte kommt ueber die Szene, nicht ueber das Material.**
  // Der Himmel im Dojo-Garten wird nach diesem Aufruf neu verteilt – das war im
  // alten „voll"-Pfad genauso, und die Aufrufstelle ist darauf gebaut
  // (skylight.js, „erst applyQuality(), dann applySkyTo()").
  //
  // **Ausgenommen ist, wer seine Karte nur einmal bekommt.** Der Zen-Teich
  // erhaelt seine Spiegelung ein einziges Mal beim ersten Sichtbarwerden
  // (`ensureEnvironment`). Dieser Aufruf hat sie ihm bei jedem Stufenwechsel –
  // und bei jedem Start und Ende einer XR-Sitzung – wieder genommen, und
  // niemand hat sie zurueckgegeben: Nach dem ersten Umschalten war der Teich
  // eine matte Scheibe. Er traegt deshalb `eigeneUmgebungskarte`.
  group.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m?.isMeshStandardMaterial || m.envMap === null) continue;
      if (m.userData.eigeneUmgebungskarte === true) continue;
      m.envMap = null;
      m.needsUpdate = true;
    }
  });
  return envMap;
}

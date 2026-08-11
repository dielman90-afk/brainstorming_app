// Zwei Qualitätsstufen für das Dojo.
//
// Anlass ist eine Messung, keine Vermutung. Das Dojo braucht das 7,4-fache der
// Frame-Zeit des Zen-Gartens bei fast gleicher Zahl an Draw-Calls; die Last
// steckt im Fragment. `cost.mjs` hat jede Last einzeln abgeschaltet und gewogen:
//
//   IBL (scene.environment)          24,9 %
//   additive Lagen                   10,6 %
//   Schattenpass ganz aus             9,5 %
//   DoubleSide → FrontSide            9,0 %
//   Rauheitskarten (große Flächen)    8,8 %
//   Normal-Maps (große Flächen)       6,6 %
//   Schattenkarte 512 statt 1024      2,5 %
//
// Zwei Ergebnisse haben den ursprünglichen Plan umgeworfen:
//
// **Die Schattenkarte zu halbieren bringt fast nichts.** 2,5 % für sichtbar
// grobere Schatten ist ein schlechter Tausch – sie bleibt in beiden Stufen bei
// 1024. Teuer ist nicht ihre Auflösung, sondern der zusätzliche Durchgang, und
// der trägt den wertvollsten Teil des Looks.
//
// **Die IBL ist mit Abstand der größte Posten** – und zugleich unverzichtbar:
// Ohne Environment-Map rendern Klingen, Beschläge und Lack schwarz, weil ein
// Metall ohne etwas zu spiegeln keine diffuse Komponente hat. Deshalb wird sie
// nicht abgeschaltet, sondern **gezielt zugewiesen**.
//
// Normal-Maps bleiben ebenfalls in beiden Stufen: 6,6 % für das, was den
// gesamten Materialeindruck trägt, lohnt nicht.

import * as THREE from 'three';

// Materialien, die spürbar Fläche im Bild einnehmen. Bei ihnen zahlt sich jede
// eingesparte Texturabtastung aus; ihre Rauheit ist ohnehin so hoch, dass eine
// Rauheitskarte kaum etwas beiträgt.
const LARGE_SURFACES = new Set([
  'dojo-floor',
  'dojo-tatami',
  'dojo-tatami-heri',
  'dojo-walls',
  'dojo-deck',
  'dojo-tokonoma',
  'dojo-exterior-ground',
]);

// Bauteile der Außenwelt, die in der Brille entfallen.
//
// Das Blattwerk ist der teuerste Posten dort: gekreuzte Flächen mit
// `alphaTest`, also viel Überzeichnung *und* ein Schattendurchgang darüber. Die
// Halme dagegen bleiben – sie sind das, was die Schatten auf dem Papier macht,
// und genau deswegen steht der Hain überhaupt da. Die Kulisse bleibt ebenfalls:
// ein einziger unbeleuchteter Zylinder ist billiger als das Loch, das ihr
// Fehlen hinterlassen würde.
const XR_HIDDEN = new Set([
  'dojo-bamboo-laub',
  // **Der Wald entfällt in der Brille vollständig – gemessen, nicht vermutet.**
  //
  // Aus dem Raum ist er nicht zu sehen: Durch die Südöffnung erreichen 0 von
  // 1176 Strahlen irgendetwas hinter dem Garten (skyline.mjs), und Nord-, West-
  // und Ostfront sind Papier – dort kommt Licht durch, kein Bild. Der Spieler
  // ist auf den Raum geklemmt, es gibt also keinen Standpunkt, von dem aus ein
  // Waldbaum in einem Bild landet.
  //
  // WebGL verwirft nichts, nur weil eine Wand davorsteht; ohne diesen Eintrag
  // würden rund 12 000 Dreiecke jedes Bild durch die Vertexstufe laufen und
  // hinterher am Tiefentest scheitern. Am Desktop bleibt er sichtbar – dort
  // gibt es die freie Kamera, und dort ist die Luft dafür da.
  'dojo-wald-nahlaub',
  'dojo-wald-kronen',
  'dojo-wald-kronen-fern',
  'dojo-wald-staemme',
]);

// Instanzen, die in der Brille ausgedünnt werden: Name → Anteil.
//
// Ein `InstancedMesh` zeichnet nur die ersten `count` Instanzen; das kostet
// eine Zuweisung und spart sowohl im Bild als auch im Schattendurchgang. Die
// Halme sind in exterior.js gemischt abgelegt, damit die Kürzung Ost- und
// Südhain gleichmäßig trifft statt einen davon ganz zu entfernen.
//
// 55 % ist kein runder Wunschwert, sondern das, was nötig war, um mit dem
// verlängerten Raum und der Außenwelt wieder unter das Frame-Zeit-Gate zu
// kommen. Sichtbar ist der Unterschied auf dem Papier kaum – der Schattenriss
// wird lichter, nicht anders.
const XR_THIN = new Map([
  ['dojo-bamboo', 0.55],
  // Blattkarten sind das teuerste Neue im Garten: zwei Dreiecke **und** ein
  // Alpha-Test je Blatt, und der Alpha-Test verbietet das frühe Verwerfen von
  // Fragmenten. Ausdünnen kostet hier weniger als anderswo, weil unter jeder
  // Karte der dunkle Hüllkörper weitersteht – es wird also nicht die Pflanze
  // dünner, sondern nur ihr Saum.
  ['dojo-garden-blattkarten', 0.45],
  // Die Kronen bleiben dichter: Sie stehen in der Türachse und sind das, was
  // man in der Brille überhaupt zu sehen bekommt.
  ['dojo-garden-kronenkarten', 0.8],
  ['dojo-garden-farne', 0.5],
  // Die hinteren Reihen und die Fernkronen: Sie stehen zehn bis dreißig Meter
  // weg und haben in der Brille genau eine Aufgabe – den Horizont zuzuhalten.
  // Dafür zählt die Silhouette der Hüllkörper, nicht die Karte darauf.
  ['dojo-garden-blattkarten-fern', 0.45],
  ['dojo-garden-fernkronen', 0.6],
]);

// Ausgangszustand je Material einmal sichern, damit das Zurückschalten den
// exakten Zustand wiederherstellt statt einen nachgebauten.
function remember(material) {
  if (!material.userData._q) {
    material.userData._q = {
      roughnessMap: material.roughnessMap ?? null,
      roughness: material.roughness,
      side: material.side,
    };
  }
  return material.userData._q;
}

function eachMaterial(root, fn) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) fn(m, o);
  });
}

/**
 * Setzt die Qualitätsstufe der Dojo-Gruppe.
 *
 * @param {THREE.Object3D} group   Wurzel der Umgebung
 * @param {THREE.Texture}  envMap  Prozedurale Environment-Map (PMREM)
 * @param {boolean}        inXR    true = Brille (sparsam), false = Desktop
 * @returns {THREE.Texture|null}   Was als `scene.environment` gesetzt werden
 *                                 soll – in XR bewusst `null`.
 */
export function applyQuality(group, envMap, inXR) {
  // --- Schattenkarte ---------------------------------------------------------
  //
  // **Revidiert gegenüber Runde 5.** Damals stand hier: 512 statt 1024 spart
  // 2,5 %, das ist den sichtbaren Verlust nicht wert – bleibt in beiden Stufen
  // gleich. Diese Zahl gilt nicht mehr.
  //
  // Seither ist die Karte auf 2048 gewachsen (der verlängerte Raum brauchte ein
  // größeres Frustum, und die Bambusschatten auf dem Papier brauchen die
  // Auflösung), und der Schattenpass zeichnet jetzt zusätzlich rund 550
  // Außenobjekte. Neu gemessen kostet 2048 gegenüber 1024 rund 6,5 % der
  // Frame-Zeit – bei vierfacher Fläche.
  //
  // Desktop behält 2048, weil dort der Schattenriss des Hains das Bild trägt.
  // In der Brille zählt die Bildrate mehr als die Schärfe eines Halmschattens.
  group.traverse((o) => {
    if (!o.isDirectionalLight || !o.castShadow) return;
    const want = inXR ? 1024 : 2048;
    if (o.shadow.mapSize.x === want) return;
    o.shadow.mapSize.set(want, want);
    // Ohne das Verwerfen behält three die alte Textur und die neue Größe
    // greift nie – ein stiller Fehlschlag, der wie ein Messfehler aussähe.
    o.shadow.map?.dispose();
    o.shadow.map = null;
  });

  eachMaterial(group, (material, object) => {
    const base = remember(material);

    // --- Environment-Map ---------------------------------------------------
    //
    // `scene.environment` gilt für **alle** Standardmaterialien der Szene:
    // three kompiliert den Envmap-Pfad in jeden Shader, auch in den des
    // Bodens. `envMapIntensity = 0` spart deshalb nichts, der Shader tastet
    // trotzdem ab. Der einzige wirksame Weg ist, die Szene-Karte wegzulassen
    // und sie den wenigen Materialien einzeln zu geben, die sie brauchen.
    if (material.isMeshStandardMaterial) {
      const wants = material.userData.needsEnv === true;
      const next = inXR ? (wants ? envMap : null) : null;
      if (material.envMap !== next) {
        material.envMap = next;
        material.needsUpdate = true;
      }
    }

    // --- Rauheitskarten auf großen Flächen ---------------------------------
    //
    // Ersetzt durch einen Mittelwert. Auf einer gewachsten Diele ist die
    // Streuung der Rauheit ohnehin klein; was den Boden trägt, ist die
    // Normal-Map, und die bleibt.
    const large = LARGE_SURFACES.has(object.name);
    if (large && base.roughnessMap) {
      const wantMap = inXR ? null : base.roughnessMap;
      if (material.roughnessMap !== wantMap) {
        material.roughnessMap = wantMap;
        material.roughness = inXR ? 0.82 : base.roughness;
        material.needsUpdate = true;
      }
    }

    // --- Doppelseitig ------------------------------------------------------
    //
    // Doppelseitige Materialien schalten das Backface-Culling ab; jedes
    // verdeckte Dreieck wird trotzdem schattiert. Papier und Dachschalung
    // sieht man in der Brille praktisch nie von hinten.
    if (base.side === THREE.DoubleSide) {
      const wantSide = inXR ? THREE.FrontSide : THREE.DoubleSide;
      if (material.side !== wantSide) {
        material.side = wantSide;
        material.needsUpdate = true;
      }
    }
  });

  // --- Additive Lagen ------------------------------------------------------
  //
  // Lichtschächte, Bodenpfützen, Blendenglühen, Staub und Coderegen sind große,
  // halbtransparente Flächen: viel Überzeichnung für Stimmung. In der Brille
  // sind sie das Erste, was geht.
  // **Die Lichtschächte bleiben in der Brille an.** Revidiert.
  //
  // Runde 5 hat *alle* additiven Lagen in XR abgeschaltet – gemessene 10,6 %
  // für „Stimmung". Der Nutzer hat auf der Quest 3 dann gesehen, was diese
  // Zahl bedeutet: kein einziger Lichtstrahl. Das war die falsche Entscheidung,
  // und zwar aus einem Grund, der schon damals im Kommentar stand: Gemessen
  // wurde headless auf **SwiftShader**, einem Software-Rasterizer. Der bestraft
  // großflächige halbtransparente Geometrie weit härter als eine Adreno-GPU,
  // die für genau solche Überzeichnung gebaut ist. Aus einer Rangfolge, die
  // übertragbar ist, wurde ein Faktor gemacht, der es nicht ist.
  //
  // Die Schächte sind das, was den Raum von einer Kiste unterscheidet, und sie
  // sind der sichtbarste Teil der einen Sonne, an der hier alles hängt. Sie
  // bleiben. Was geht, ist das, was man in Bewegung ohnehin kaum sieht: Staub
  // und Coderegen – viele kleine Flächen, hohe Überzeichnung, wenig Bild.
  const XR_KEEP_ADDITIVE = /shaft|pool|schacht|bloom/i;
  group.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const thin = XR_THIN.get(o.name);
    if (thin !== undefined && o.isInstancedMesh && o.userData.fullCount) {
      o.count = inXR ? Math.max(1, Math.round(o.userData.fullCount * thin)) : o.userData.fullCount;
    }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const additive = m?.blending === THREE.AdditiveBlending;
    if (!additive && !XR_HIDDEN.has(o.name)) return;
    if (o.userData._qVis === undefined) o.userData._qVis = o.visible;
    const keep = additive && XR_KEEP_ADDITIVE.test(o.name || '');
    o.visible = inXR && !keep ? false : o.userData._qVis;
  });

  // Desktop bekommt die Karte weiterhin über die Szene – dort ist Luft, und der
  // Weg ist der einfachere. In XR bleibt `scene.environment` leer, damit der
  // teure Pfad nicht doch wieder in jedem Shader landet.
  return inXR ? null : envMap;
}

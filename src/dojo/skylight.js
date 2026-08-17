import * as THREE from 'three';
import { SUN, sunDirection } from './layout.js';

// ☀ Himmelslicht für den Außenbereich.
//
// **Das Problem.** `atmosphere.js` baut eine Innenraum-Sonde: heller warmer
// Schlitz im Osten, dunkles Holz unten, Kalkputz ringsum. Für alles *im* Dojo
// ist das genau richtig – ein spiegelnder Gegenstand mitten im Raum sieht
// nichts anderes. Für den Garten *davor* ist es falsch, und zwar nicht
// geringfügig: Ein Ahornblatt unter freiem Himmel bekommt sein indirektes Licht
// von einer Halbkugel Himmel, nicht von einer Holzdecke. Über
// `scene.environment` gilt die Innenraum-Sonde aber für **jedes**
// Standardmaterial der Szene, also auch für den Garten. Das Ergebnis ist ein
// Garten, dessen Blätter von unten warm und von oben stumpf angeleuchtet
// werden – die klassische „alles sieht aus wie in einem Zimmer fotografiert"-
// Signatur.
//
// **Die Lösung ist keine zweite `scene.environment`.** Die gibt es nicht; three
// kennt genau eine. Der Weg ist derselbe, den `quality.js` bereits beschreibt
// und begründet: `material.envMap` **pro Material**. Das ist hier nicht nur
// eine Sparmaßnahme, sondern die einzige Möglichkeit überhaupt, zwei
// verschiedene Sonden in einer Szene zu haben – und sie funktioniert, weil
// three in `WebGLPrograms.js:63` `material.envMap || environment` auswertet:
// Eine Karte am Material **schlägt** die Szenenkarte. Damit passt das Modul in
// beide Qualitätsstufen, ohne von ihnen etwas zu wissen:
//
//   Desktop: `scene.environment` = Innenraum-Sonde → Garten überschreibt sie.
//   XR:      `scene.environment` = null            → Garten hat als Einziger eine.
//
// **Reihenfolge ist Pflicht.** `applyQuality()` setzt bei *jedem*
// `MeshStandardMaterial` unter der Dojo-Gruppe `envMap` neu (auf `null` am
// Desktop, auf die Innenraumkarte in XR). Wer `applySkyTo()` davor aufruft,
// verliert die Karte wieder. Also: **erst `applyQuality()`, dann
// `applySkyTo()`.** Lambert bleibt von `applyQuality()` unangetastet und wäre
// unkritisch – aber der Garten wird nicht für immer Lambert bleiben.

// --- Was Lambert mit einer envMap macht (und was nicht) ----------------------
//
// Der Garten ist derzeit fast vollständig `MeshLambertMaterial`. In three
// 0.185.1 nachgelesen, nicht vermutet:
//
// 1. **Lambert bekommt echtes IBL-Diffuslicht.**
//    `lights_fragment_maps.glsl.js` ruft `getIBLIrradiance()` für
//    `STANDARD || LAMBERT || PHONG` auf, sobald `ENVMAP_TYPE_CUBE_UV` gesetzt
//    ist – und genau das ist eine PMREM-Karte. `lights_fragment_end` schlägt
//    das Ergebnis bei Lambert der normalen Irradianz zu. `meshlambert.glsl.js`
//    zieht dafür `envmap_physical_pars_fragment` herein, und
//    `WebGLMaterials.js:52` schreibt `envMapIntensity` in die Uniforms.
//    → `material.envMap` + `material.envMapIntensity` wirken bei Lambert.
//
// 2. **`combine` und `reflectivity` wirken nicht.** Das ist der Legacy-Pfad in
//    `envmap_fragment.glsl.js`, und dessen gesamter Rumpf – inklusive
//    `ENVMAP_BLENDING_MULTIPLY/MIX/ADD` – steckt in einem
//    `#ifdef ENVMAP_TYPE_CUBE`. Eine PMREM-Karte ist `ENVMAP_TYPE_CUBE_UV`,
//    also ist der Block leer. Er würde nur mit einer echten `CubeTexture`
//    greifen. Deshalb fasst dieses Modul `combine`/`reflectivity` nicht an: Sie
//    zu setzen wäre eine Stellschraube, die nichts dreht.
//
// 3. **Lambert bekommt keine Spiegelung.** Lambert definiert
//    `RE_IndirectDiffuse`, aber kein `RE_IndirectSpecular`. Die Sonnenscheibe
//    in der Karte trägt bei Lambert also nur über das Irradianz-Integral bei
//    (ein bisschen mehr Licht von der Sonnenseite), sie erzeugt **kein**
//    Glanzlicht. Das gerichtete Funkeln auf nassen Steinen und Blättern
//    braucht `MeshStandardMaterial` mit niedriger Rauheit – die Karte liefert
//    es, das Material muss es abholen. Steht hier, damit niemand die Scheibe
//    für kaputt hält, wenn ein Lambert-Kiesel nicht glitzert.
//
// 4. Nebenwirkung, harmlos: `envmap_pars_fragment` definiert für LAMBERT
//    `ENV_WORLDPOS` und legt damit ein `vWorldPosition`-Varying und zwei
//    ungenutzte Uniforms an. Kosten: ein Varying. Kein Bild ändert sich davon.

// --- Palette -----------------------------------------------------------------
//
// Alle Farben als **Hexwerte**. Grund: `Color.setHSL()` legt seine Argumente in
// three seit dem Color-Management im **linearen** Arbeitsraum aus, nicht in
// sRGB – ein „mittleres" L = 0.5 wird damit sichtbar zu hell. `new Color(hex)`
// nimmt dagegen sRGB an und rechnet in den Arbeitsraum um, also genau das, was
// man beim Blick auf einen Farbwähler erwartet. Der Helligkeitsfaktor daneben
// ist bewusst getrennt: Er ist eine Strahldichte und hat im Farbwähler nichts
// verloren.
//
// Die Zahlen sind aufeinander abgestimmt, nicht einzeln gewählt:
//   * `horizon` liegt nahe an `background` (0x9fb0b4) und `fog` (0xa8b6b0) aus
//     index.js. Was ein Blatt spiegelt, muss zu dem passen, was daneben
//     tatsächlich zu sehen ist – sonst reflektiert der Garten einen anderen Tag.
//   * `ground` ist die Bodenfarbe aus `groundTexture()` in exterior.js
//     (#4d5a3c). Das ist der Moos-/Grasbounce nach oben, der die Unterseiten
//     von Blättern und den Schatten unter den Steinen grünlich aufhellt statt
//     grau. Kräftig gedämpft, weil der Boden nur einen Bruchteil des Lichts
//     zurückwirft, das auf ihn fällt.
//   * `haze` ist die warme Dunstglocke um die Sonne. Sie ist der Grund, warum
//     der Himmel als „Nachmittag, tiefe Sonne im Osten" gelesen wird und nicht
//     als „Mittag". Nur additiv und nur horizontnah.
const SKY = {
  zenith: { hex: 0x5b83bd, level: 0.40 },
  horizon: { hex: 0xc3c6bd, level: 0.58 },
  haze: { hex: 0xffcb92, level: 0.42 },
  ground: { hex: 0x4d5a3c, level: 0.22 },
};

// Die Sonnenscheibe.
//
// **Radius 4°, nicht 0,27°.** Die echte Sonne ist ein halbes Grad breit. Der
// PMREM-Würfel hat 256 Texel je Kante, also rund 0,35° je Texel – eine echte
// Sonne wäre ein einzelnes Texel und würde beim Filtern zwischen den Mip-Stufen
// zerfallen (Flimmern beim Kopfdrehen, oder sie verschwindet ganz). 4° sind
// dieselbe Größenordnung, die Environment-Sonden für bewölkte Nachmittage
// ohnehin haben, und sie passen zu den weichen PCF-Schatten dieser Szene.
//
// **Helligkeit 15, nicht 100.** Die Scheibe deckt 2π(1−cos 4°) ≈ 0,0153 sr ab.
// Bei Strahldichte 15 steuert sie zur Bestrahlungsstärke einer zur Sonne
// gewandten Fläche rund 15 × 0,0153 ≈ 0,23 bei – gegen `SUN.intensity` = 1.9
// aus dem gerichteten Licht. Mehr wäre Doppelzählung: Das direkte Sonnenlicht
// **gibt es schon** als `DirectionalLight`, die Scheibe in der Karte ist nur
// für die Spiegelung da. Weniger, und ein glänzender nasser Stein bekäme kein
// Glanzlicht, sondern einen Schimmer.
const SUN_DISC = { hex: SUN.color, level: 15.0 };
const SUN_INNER = 0.038; // rad, ~2.2° – volle Helligkeit
const SUN_OUTER = 0.070; // rad, ~4.0° – Rand

// **Keine Vorunschärfe vor dem PMREM-Filter, und das ist der ganze Unterschied
// bei der Startzeit.** `atmosphere.js` nimmt `sigma = 0.03`, weil der
// Shoji-Schlitz eine harte Kante hat, die sich sonst als Treppe in die rauen
// Mips zeichnet. Hier gibt es keine harte Kante: Der Horizont ist ein
// smoothstep über gut 7°, und der Rand der Sonnenscheibe läuft über rund 1,8° –
// beides breiter als ein PMREM-Texel (256 Texel je 90°-Kante ≈ 0,35°).
//
// Gemessen (SwiftShader, headless, je vier Läufe):
//   sigma 0.015 → 164 ms beim ersten, 57–79 ms danach
//   sigma 0     →  37 ms beim ersten, 33–45 ms danach
// Das Muster von atmosphere.js (32×20, sigma 0.03) kostet zum Vergleich 71 ms.
//
// `sigma > 0` schiebt einen zusätzlichen vollen Blur-Durchgang über alle
// Mip-Stufen ein. Den für eine Unschärfe zu bezahlen, die im Bild niemand
// sieht, wäre der schlechteste Tausch dieser Datei.
const PREBLUR_SIGMA = 0;

function radiance(spec) {
  // `new Color(hex)` interpretiert sRGB und wandelt in den linearen
  // Arbeitsraum. Der PMREM rendert in ein lineares Half-Float-Target, `envMap`
  // erwartet lineare Werte – hier findet also keine weitere Wandlung statt.
  return new THREE.Color(spec.hex).multiplyScalar(spec.level);
}

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;     // normalisiert, zeigt ZUR Sonne
  uniform float uSunInner;
  uniform float uSunOuter;
  varying vec3 vDir;

  void main() {
    vec3 n = normalize(vDir);
    float h = n.y;                    // -1 Boden … +1 Zenit
    float up = clamp(h, 0.0, 1.0);

    // Zenit kühl, Horizont dunstig hell. Exponent < 1, weil der Verlauf eines
    // echten Himmels dicht über dem Horizont am steilsten ist: Die optische
    // Weglänge durch die Atmosphäre fällt schnell ab. Mit einem linearen
    // Verlauf sieht der Himmel aus wie ein Farbverlauf in einem Bildprogramm.
    vec3 sky = mix(uHorizon, uZenith, pow(up, 0.42));

    float toSun = dot(n, uSunDir);

    // Warme Dunstglocke um die Sonne, horizontnah. Das ist der Anteil, der die
    // Ostseite jedes Blattes wärmer macht als die Westseite – ohne ihn wäre die
    // Karte rundum gleich kühl und die eine Sonne dieser Szene würde im
    // indirekten Licht nicht mehr vorkommen.
    float glow = pow(max(toSun, 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.55, up));
    sky += uHaze * glow;

    // Unter dem Horizont: die Bodenfarbe des Gartens, nach oben abgestrahlt.
    // Nach unten hin dunkler – dort sieht eine Fläche nicht den offenen Boden,
    // sondern die Verschattung direkt unter sich.
    vec3 gnd = uGround * (0.55 + 0.45 * smoothstep(-0.85, 0.0, h));

    // Kein harter Schnitt am Horizont: Ein Gelände hat eine Baumlinie, und die
    // PMREM-Mips würden eine harte Kante als Ring in die rauen Stufen tragen.
    vec3 col = mix(gnd, sky, smoothstep(-0.06, 0.07, h));

    // Die Scheibe. Winkelmaß statt Kosinus, damit uSunInner und uSunOuter in
    // Radiant lesbar bleiben; der Shader läuft genau einmal.
    float ang = acos(clamp(toSun, -1.0, 1.0));
    float disc = 1.0 - smoothstep(uSunInner, uSunOuter, ang);
    col += uSunColor * disc;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- Aufbau ------------------------------------------------------------------
//
// Memoisiert, aus demselben Grund wie in `atmosphere.js`: Die Sonne bewegt sich
// nicht, die Karte ist statisch, und der PMREM-Durchlauf kostet GPU-Zeit und
// ein Rendertarget. Der Schlüssel ist der Renderer – ein Kontextverlust oder
// ein zweiter Renderer bekommt zwangsläufig eine neue Karte, weil Texturen
// nicht zwischen Kontexten wandern.
// **Der Zwischenspeicher ist nach Himmel geschlüsselt, nicht nur nach Renderer.**
//
// Seit der Zen-Garten dieselbe Funktion benutzt, gibt es mehr als einen Himmel:
// Die Dojo-Sonne steht bei [15,3 | 3,9 | 6,5], die des Zen-Gartens bei
// [−12 | 9 | −6], und die Zenit- und Dunstfarben unterscheiden sich ebenfalls.
// Mit dem alten Schlüssel „Renderer" hätte die zweite Umgebung stillschweigend
// die Karte der ersten bekommen – die Sonnenscheibe säße auf der falschen
// Seite, und zwar ohne jede Fehlermeldung. Genau die Sorte Fehler, die man erst
// an einem Glanzlicht bemerkt, das nach hinten zeigt.
const _skyCache = new Map();
let _sky = null;
let _buildMs = 0;

/**
 * Baut die PMREM-verarbeitete Himmelskarte für den Außenbereich.
 *
 * Prozedural, keine externen Dateien: eine Kugel mit Richtungs-Shader, durch
 * `PMREMGenerator.fromScene()` – dasselbe Muster wie die Innenraum-Sonde in
 * atmosphere.js. Der Generator faltet über die Richtung, die Geometrie der
 * Sonde ist also egal; was zählt, ist allein die Verteilung der Strahldichte.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} [himmel] Abweichender Himmel. Ohne Angabe der des Dojos –
 *   jede vorhandene Aufrufstelle bleibt damit buchstabengleich.
 * @param {string} [himmel.name]  Schlüssel für den Zwischenspeicher. **Pflicht,
 *   sobald irgendein anderer Wert gesetzt wird**, sonst teilen sich zwei
 *   verschiedene Himmel eine Karte.
 * @param {number[]} [himmel.sun]      Sonnen*position*, nicht Richtung.
 * @param {number[]} [himmel.target]   Wohin die Sonne zielt.
 * @param {number} [himmel.sunColor]   Farbe der Sonnenscheibe als Hex.
 * @param {object} [himmel.sky]        Ersatz für SKY (zenith/horizon/haze/ground).
 * @returns {THREE.Texture} CubeUV-Karte, direkt als `material.envMap` nutzbar.
 */
export function buildSkyEnvironment(renderer, himmel = null) {
  const schluessel = `${himmel?.name ?? 'dojo'}`;
  const gemerkt = _skyCache.get(schluessel);
  if (gemerkt && gemerkt.renderer === renderer) {
    _sky = gemerkt.texture;
    return _sky;
  }

  const t0 = performance.now();

  // Richtung **zur** Sonne. `sunDirection()` liefert die Richtung, in die das
  // Licht läuft; die Sonne steht auf der Gegenseite. Ohne `himmel` ist das die
  // eine Stelle, an der die Karte an layout.js hängt – und der Grund, warum ein
  // Verschieben der Dojo-Sonne die Scheibe automatisch mitnimmt.
  const [dx, dy, dz] =
    himmel?.sun && himmel?.target
      ? (() => {
          const d = [
            himmel.target[0] - himmel.sun[0],
            himmel.target[1] - himmel.sun[1],
            himmel.target[2] - himmel.sun[2],
          ];
          const len = Math.hypot(...d) || 1;
          return d.map((v) => v / len);
        })()
      : sunDirection();
  const sunDir = new THREE.Vector3(-dx, -dy, -dz).normalize();
  const himmelFarben = himmel?.sky ?? SKY;
  const sonnenScheibe = himmel?.sunColor
    ? { hex: himmel.sunColor, level: SUN_DISC.level }
    : SUN_DISC;

  const probe = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // Kein Tone-Mapping, keine Farbraumwandlung – der PMREM rendert linear.
    uniforms: {
      uZenith: { value: radiance(himmelFarben.zenith) },
      uHorizon: { value: radiance(himmelFarben.horizon) },
      uHaze: { value: radiance(himmelFarben.haze) },
      uGround: { value: radiance(himmelFarben.ground) },
      uSunColor: { value: radiance(sonnenScheibe) },
      uSunDir: { value: sunDir },
      uSunInner: { value: SUN_INNER },
      uSunOuter: { value: SUN_OUTER },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: SKY_FRAGMENT,
  });
  // Feiner unterteilt als die Innenraumsonde (32×20): Dort ist alles ein
  // Verlauf, hier sitzt eine 4°-Scheibe drin. Bei 32×20 wäre ein Segment rund
  // 11° breit – die Scheibe fiele in ein einziges Dreieck, und ihre Kante wäre
  // die Kante dieses Dreiecks statt ein Kreis.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(8, 64, 40), material);
  probe.add(shell);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(probe, PREBLUR_SIGMA, 0.1, 30);
  pmrem.dispose();

  shell.geometry.dispose();
  material.dispose();

  _skyCache.set(schluessel, { target, texture: target.texture, renderer });
  _sky = target.texture;
  _buildMs = performance.now() - t0;
  return _sky;
}

/** Gemessene Aufbauzeit des letzten echten Aufbaus in Millisekunden. */
export function skyBuildMs() {
  return _buildMs;
}

/** Gibt Karten und Rendertargets frei; der nächste Aufruf baut neu. */
export function disposeSkyEnvironment() {
  for (const eintrag of _skyCache.values()) eintrag.target?.dispose();
  _skyCache.clear();
  _sky = null;
}

// --- Zuweisung ---------------------------------------------------------------

// Materialtypen, bei denen `envMap` mit einer CubeUV-Karte tatsächlich etwas
// bewirkt. `MeshBasicMaterial` steht bewusst **nicht** hier: Es hat zwar eine
// `envMap`-Eigenschaft, benutzt aber ausschließlich den Legacy-Pfad
// (`ENVMAP_TYPE_CUBE`), der bei einer PMREM-Karte leer ist. Es zuzuweisen
// erzwänge nur eine Shader-Neuübersetzung ohne ein einziges geändertes Pixel –
// und die ferne Baumlinie (`dojo-backdrop`) ist absichtlich unbeleuchtet.
function takesEnv(material) {
  return (
    material.isMeshStandardMaterial === true ||
    material.isMeshLambertMaterial === true ||
    material.isMeshPhongMaterial === true
  );
}

// Ausgangszustand je Material einmal sichern, damit das Zurückschalten den
// exakten Zustand wiederherstellt statt einen nachgebauten. Dasselbe Muster wie
// `remember()` in quality.js, mit eigenem Schlüssel – die beiden dürfen sich
// nicht ins Gehege kommen.
//
// Warum „einmal": Beim zweiten Aufruf steht in `material.envMap` bereits die
// Himmelskarte. Würde hier erneut gesichert, wäre der „Ausgangszustand" die
// Karte selbst, und das Zurückschalten wäre ein No-Op. Genau dieser Fehler
// macht sich erst beim dritten Umschalten bemerkbar.
function remember(material) {
  if (!material.userData._sky) {
    material.userData._sky = {
      envMap: material.envMap ?? null,
      envMapIntensity: material.envMapIntensity,
    };
  }
  return material.userData._sky;
}

function eachMaterial(root, fn) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) fn(m, o);
  });
}

/**
 * Weist allen envMap-fähigen Materialien unterhalb von `root` die
 * Himmelskarte zu.
 *
 * Bewusst pro Material und nicht über `scene.environment` – siehe Kopf dieser
 * Datei. Ein Material kann sich mit `userData.skipSky = true` abmelden; das ist
 * für Dinge gedacht, die zwar im Außenbereich stehen, aber innen gespiegelt
 * gehören (z. B. ein Beschlag, der zur Hälfte unter dem Vordach sitzt).
 *
 * `envMap = null` stellt den gesicherten Ausgangszustand exakt wieder her –
 * damit ist der Rückweg dieselbe Funktion und kann nicht auseinanderlaufen.
 *
 * @param {THREE.Object3D} root       Wurzel des Außenbereichs
 * @param {THREE.Texture|null} envMap Himmelskarte, oder `null` zum Zurücksetzen
 * @param {number} [intensity=1]      Faktor auf `envMapIntensity`
 * @returns {number}                  Zahl der geänderten Materialien
 */
export function applySkyTo(root, envMap, intensity = 1) {
  if (!root) return 0;
  let touched = 0;

  eachMaterial(root, (material) => {
    if (!takesEnv(material)) return;
    if (material.userData.skipSky === true) return;

    const base = remember(material);
    const next = envMap ?? null;
    const wantIntensity = next ? intensity : base.envMapIntensity;

    // `needsUpdate` nur bei echter Änderung: Der Wechsel von „keine Karte" zu
    // „Karte" ändert die Shader-Defines und erzwingt eine Neuübersetzung. Jeden
    // Frame gesetzt wäre das ein Ruckler pro Frame – der teuerste denkbare Weg,
    // nichts zu ändern.
    if (material.envMap !== next) {
      material.envMap = next;
      material.needsUpdate = true;
      touched++;
    }
    // `envMapIntensity` ist ein reiner Uniform-Wert, kostet also nichts und
    // braucht kein `needsUpdate`. Bei Lambert und Phong wird er nur dann in die
    // Uniforms geschrieben, wenn `material.envMap` gesetzt ist
    // (WebGLMaterials.js:56) – deshalb steht die Zuweisung nach der Karte.
    if (material.envMapIntensity !== wantIntensity) {
      material.envMapIntensity = wantIntensity;
    }

    // Wenn die Karte zurückgenommen wird, ist auch der gesicherte Zustand
    // verbraucht. Ohne das bliebe ein Material für immer an seinem allerersten
    // Zustand hängen, selbst wenn ihm zwischendurch jemand anders eine Karte
    // gegeben hat.
    if (!next) delete material.userData._sky;
  });

  return touched;
}

/**
 * Nimmt die Himmelskarte unterhalb von `root` zurück und stellt den gesicherten
 * Ausgangszustand wieder her.
 *
 * @param {THREE.Object3D} root
 * @returns {number} Zahl der geänderten Materialien
 */
export function restoreSky(root) {
  return applySkyTo(root, null);
}

// --- Wo der Himmel hingehört -------------------------------------------------
//
// Nur zur Orientierung für den Aufrufer, keine Logik: Der Außenbereich ist die
// Gruppe `dojo-exterior` aus exterior.js. Alles darin steht unter freiem
// Himmel – Boden, Kies, Steine, Polster, Farne, Ahorne, Bambus. Die Kulisse
// (`dojo-backdrop`) ist `MeshBasicMaterial` und wird von `takesEnv()` ohnehin
// übersprungen.
//
// Die Ausdehnung des Gartens steht in `EXTERIOR.garden` (layout.js) und wird
// hier absichtlich nicht wiederholt – dieses Modul kennt keine Maße, nur
// Richtungen.
export const EXTERIOR_ROOT_NAME = 'dojo-exterior';

// Damit ein Aufrufer nicht raten muss, ob die Karte schon existiert.
export function currentSkyEnvironment() {
  return _sky;
}

// Nur für Messungen: die Richtung, in der die Scheibe in der Karte sitzt.
// Reflexionsprüfungen im Testskript vergleichen dagegen, statt `sunDirection()`
// dort noch einmal von Hand zu negieren.
export function skySunVector() {
  const [dx, dy, dz] = sunDirection();
  return new THREE.Vector3(-dx, -dy, -dz).normalize();
}

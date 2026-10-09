// **Durch eine virtuelle Umgebung darf das Zimmer nicht durchscheinen.**
//
// Die Quest startet die App als `immersive-ar`, also mit Passthrough – auch
// wenn im Menue eine Umgebung gewaehlt ist (main.js, `setupXRButton`). Der
// Compositor der Brille mischt dann jeden Bildpunkt ueber den Alphawert des
// Framebuffers mit dem Kamerabild: Alpha 1 deckt, alles darunter zeigt das
// Zimmer. Der Nutzer hat genau das gemeldet – durch die Pflanzen der
// Himmelsinsel sah er die Umrisse seines Zimmers.
//
// Zwei Quellen fuer Alpha unter 1, beide headless unsichtbar:
//
//   * **Die Loeschfarbe.** three loescht in einer AR-Sitzung mit (0,0,0,0),
//     egal was als Hintergrund gesetzt ist (WebGLBackground.js, Zweig
//     `alpha-blend`). Wo keine Geometrie steht – im Dojo der ganze Himmel ueber
//     dem Garten, die Kulisse ist ein oben offener Zylinder –, sieht man das
//     Zimmer. Durchsichtige Lagen, die darueber gemischt werden, behalten ihr
//     Alpha unter 1.
//   * **Undurchsichtige Werkstoffe, die trotzdem Alpha schreiben.** Das betrifft
//     alles mit `alphaToCoverage`: three setzt dort kein `OPAQUE`, und das Alpha
//     der Blattkarte landet ungemischt im Framebuffer (siehe
//     `deckendesAlpha` unten).
//
// Fuer die erste Quelle meldet die App three ein `opaque`, solange eine
// Umgebung aktiv ist. three loescht dann wie in VR mit der Hintergrundfarbe der
// Umgebung und Alpha 1 – `scene.background` ist bei allen fuenf eine Farbe. Im
// reinen Passthrough (keine Umgebung) bleibt alles, wie es war.
//
// `getEnvironmentBlendMode` wird ausser von WebGLBackground nirgends in three
// gelesen (r185); die Huelle aendert also nur die Loeschfarbe.
import * as THREE from 'three';

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ umgebungAktiv: () => boolean }} o
 * @returns {{ sitzungsModus: () => string|undefined, readonly aktiv: boolean }}
 *   `sitzungsModus` ist austauschbar, damit der Pruefstand eine AR-Sitzung
 *   nachstellen kann (tools/alphaprobe.mjs).
 */
export function dichtePassthroughAb(renderer, { umgebungAktiv }) {
  const xr = renderer.xr;
  const dichtung = {
    sitzungsModus: xr.getEnvironmentBlendMode.bind(xr),
    get aktiv() {
      return dichtung.sitzungsModus() === 'alpha-blend' && umgebungAktiv();
    },
  };
  xr.getEnvironmentBlendMode = () => (dichtung.aktiv ? 'opaque' : dichtung.sitzungsModus());
  return dichtung;
}

/**
 * Laesst einen undurchsichtigen Werkstoff das Alpha im Framebuffer stehen,
 * statt es zu ueberschreiben.
 *
 * Gebraucht fuer `alphaToCoverage`: Dort entscheidet das Alpha des Fragments
 * ueber die Abdeckung der vier MSAA-Abtastpunkte – es muss also im Shader
 * bleiben. Geschrieben werden darf es trotzdem nicht. Die Mischung erledigt
 * beides: Farbe ersetzt wie ohne Mischung (One/Zero), Alpha behaelt den Wert,
 * der schon dasteht (Zero/One), und das ist nach dem Loeschen 1.
 *
 * Kein zusaetzlicher Durchgang, kein zusaetzlicher Zeichenaufruf. Das Material
 * bleibt im undurchsichtigen Durchgang (`transparent` aendert sich nicht),
 * wird also weiter von vorn nach hinten sortiert und schreibt Tiefe.
 */
export function deckendesAlpha(material) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.ZeroFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

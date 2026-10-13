import * as THREE from 'three';

// **Ein PMREM-Generator für alle Spiegel- und Himmelskarten.**
//
// Vier Stellen falten eine Sonde zu einer Umgebungskarte: der Himmel
// (dojo/skylight.js, auch für den Zen-Garten), die Innenraum-Sonde des Dojos
// (dojo/atmosphere.js), der Teich im Zen-Garten und die Kuppel des Konstrukts
// (environments.js). Jede legte bisher ihren eigenen Generator an und
// entsorgte ihn gleich wieder – mit ihm seine Shader: die Unschärfe und die
// GGX-Faltung mit 256 Abtastwerten. Der nächste Generator übersetzte sie neu,
// beim ersten Besuch von Zen-Garten und Dojo bis zu viermal hintereinander,
// mitten im Umgebungswechsel.
//
// Geteilt ist das einmal. Der Generator bleibt bestehen und hält dafür sein
// Zwischenziel (rund 6 MB bei Würfelgröße 256) und zwei, drei Programme – ein
// fester, kleiner Preis gegen jedes erneute Übersetzen. Die Karten selbst sind
// eigene Renderziele; sie hängen nicht am Generator.
const _generatoren = new WeakMap();

export function gemeinsamerPmrem(renderer) {
  let generator = _generatoren.get(renderer);
  if (!generator) {
    generator = new THREE.PMREMGenerator(renderer);
    _generatoren.set(renderer, generator);
  }
  return generator;
}

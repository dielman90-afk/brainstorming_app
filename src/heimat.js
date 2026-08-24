import * as THREE from 'three';

// **Wo Inhalte hängen.**
//
// Vier der fünf Umgebungen sind ortsfest: Ihr Inhalt hängt an der Szene, und
// eine Karte bei (1,4 | 1,2 | −0,8) liegt dort, bis jemand sie anfasst. Der
// 🌌 Nachthimmel ist seit dem Umbau ein Planet mit 25 m Halbmesser, unter dem
// sich die Welt dreht (siehe `makePlanetWalk` in walkable.js): Der Nutzer bleibt
// am Nordpol stehen, und was an der Szene hängt, bliebe damit **vor ihm**
// stehen und liefe mit ihm um den Planeten herum.
//
// Karten und Zonen hängen deshalb an einer **Heimat** — der Szene in vier
// Umgebungen, der Weltgruppe des Planeten in der fünften. Damit bleibt liegen,
// was man ablegt, und der Planet wird zu der begehbaren Gedächtnislandkarte,
// für die sich der ganze Umbau lohnt.
//
// Das Whiteboard bekommt bewusst **keine** Heimat: Es wird ein- und
// ausgeblendet und bei jedem Einblenden vor den Nutzer gesetzt. Es ist ein
// Werkzeug, kein Gegenstand der Welt, und gehört damit zur Szene.
//
// Dieses Modul hält die drei Handgriffe, die Karten und Zonen dafür teilen —
// zweimal dieselbe Rechnung von Hand wäre zweimal dieselbe Gelegenheit, sie
// verschieden falsch zu machen.

const _q = new THREE.Quaternion();

// Die Heimat wechseln. Vorhandene Gruppen ziehen mit und behalten dabei ihre
// **Weltpose** — `attach()` rechnet sie um, `add()` würde sie versetzen.
//
// Objekte, deren Elter weder die alte noch die neue Heimat ist, bleiben, wo sie
// sind: Eine Karte in der Hand hängt am Controller und kommt beim Loslassen von
// selbst in die neue Heimat.
export function wechsleHeimat(alt, neu, gruppen) {
  if (neu === alt) return;
  neu.updateMatrixWorld(true);
  for (const g of gruppen) {
    if (g.parent === alt) neu.attach(g);
  }
}

// Eine **Weltkoordinate** in die Heimat umrechnen, an Ort und Stelle. Solange
// die Heimat die Szene ist (und die steht im Ursprung), ist das ein Nichtstun.
export function inHeimat(heimat, scene, v) {
  if (heimat === scene) return v;
  heimat.updateMatrixWorld(true);
  return heimat.worldToLocal(v);
}

// Die Pose einer Gruppe **relativ zur Heimat**, für das Speichern.
//
// Gerechnet wird über die Weltpose und nicht über die lokale: Nur so kommt auch
// eine gerade gegriffene Karte (Elter = Controller) richtig heraus. Auf dem
// Planeten wäre die Weltpose der Ort, an dem die Karte lag, **als der Nutzer
// dort stand** — nach dem Neuladen läge sie an der Stelle wieder, an der er
// zuletzt war, statt dort, wo er sie hingelegt hat.
export function poseInHeimat(heimat, scene, gruppe) {
  const eigen = heimat !== scene;
  if (eigen) heimat.updateMatrixWorld(true);
  const p = gruppe.getWorldPosition(new THREE.Vector3());
  const q = gruppe.getWorldQuaternion(new THREE.Quaternion());
  if (!eigen) return { position: p.toArray(), quaternion: q.toArray() };
  // Die Drehung der Heimat herausrechnen: q_lokal = q_heimat^-1 * q_welt.
  const heim = heimat.getWorldQuaternion(_q).invert();
  return {
    position: heimat.worldToLocal(p).toArray(),
    quaternion: heim.multiply(q).toArray(),
  };
}

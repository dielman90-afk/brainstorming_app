// Begehbarer Bereich je Umgebung (src/walkable.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { FLAT_WALK, makeZonesWalk, makeIslandWalk, makePlanetWalk } from '../../src/walkable.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function limit(walk, x, z) {
  const out = { x: NaN, z: NaN };
  walk.limit(x, z, out);
  return out;
}

describe('FLAT_WALK', () => {
  test('unbegrenzt, Boden auf null', () => {
    assert.deepEqual(limit(FLAT_WALK, 123, -45), { x: 123, z: -45 });
    assert.equal(FLAT_WALK.floorAt(5, 5), 0);
  });
});

describe('makeZonesWalk – Raum, Tür, Veranda', () => {
  // Raum (Boden 0) – Wand bei z = 3 bis 3,5 mit schmalem Türdurchgang –
  // Veranda (Boden −0,4) im Süden.
  const zones = [
    { minX: -3, maxX: 3, minZ: -3, maxZ: 3, floorY: 0 },
    { minX: -0.5, maxX: 0.5, minZ: 2.5, maxZ: 4, floorY: 0 },
    { minX: -3, maxX: 3, minZ: 3.5, maxZ: 6, floorY: -0.4 },
  ];

  test('im Raum: Wand hält, auch wenn die Veranda dahinter näher liegt', () => {
    const walk = makeZonesWalk(zones);
    walk.reset();
    // Ein Schritt in die Wand neben der Tür: Die Veranda ist 0,2 m entfernt,
    // der Raumrand 0,3 m. „Nächste Zone" würde durch die Wand schieben.
    assert.deepEqual(limit(walk, 2, 3.3), { x: 2, z: 3 });
    assert.equal(walk.floorAt(), 0);
  });

  test('durch die Tür auf die Veranda – Kette statt Nähe', () => {
    const walk = makeZonesWalk(zones);
    walk.reset();
    limit(walk, 0, 2.8); // in der Tür
    limit(walk, 0, 3.8); // im Überlapp Tür/Veranda
    limit(walk, 0, 5); // auf der Veranda
    assert.equal(walk.floorAt(), -0.4);
    assert.deepEqual(limit(walk, 2.5, 5.5), { x: 2.5, z: 5.5 }, 'auf der Veranda frei seitlich');
  });

  test('reset() setzt auf die erste Zone zurück', () => {
    const walk = makeZonesWalk(zones, { maxY: 3.2 });
    limit(walk, 0, 2.8);
    limit(walk, 0, 5);
    walk.reset();
    assert.equal(walk.floorAt(), 0);
    assert.equal(walk.maxY, 3.2);
  });
});

describe('makeIslandWalk', () => {
  // Kreisinsel, Halbmesser 10 (lokal), Weltmaßstab 4 → Rand bei 39,6 m (99 %).
  const shape = { radius: 10, outline: () => 1, heightAt: (x, z) => 0.5 - 0.001 * (x * x + z * z) };
  const walk = makeIslandWalk(shape, 4);

  test('innen frei, außen radial an den Rand geklemmt', () => {
    assert.deepEqual(limit(walk, 10, -5), { x: 10, z: -5 });
    const out = limit(walk, 80, 0);
    near(out.x, 39.6);
    near(out.z, 0);
  });

  test('Bodenhöhe aus derselben Formbeschreibung, im Weltmaßstab', () => {
    near(walk.floorAt(0, 0), 2.0);
    near(walk.floorAt(20, 0), (0.5 - 0.001 * 25) * 4);
  });
});

describe('makePlanetWalk', () => {
  function planet() {
    const welt = new Group();
    let turns = 0;
    const walk = makePlanetWalk({ radius: 25, heightAt: () => 0, welt, nachDrehung: () => turns++ });
    return { welt, walk, turns: () => turns };
  }

  test('im Freiraum: keine Drehung', () => {
    const { welt, walk, turns } = planet();
    assert.deepEqual(limit(walk, 0.1, -0.1), { x: 0.1, z: -0.1 });
    assert.equal(turns(), 0);
    assert.equal(welt.quaternion.w, 1);
  });

  test('außerhalb: Kopf zurück an den Freiraum, Welt dreht um Bogenlänge / Halbmesser', () => {
    const { welt, walk, turns } = planet();
    const out = limit(walk, 0, -1.25); // 1 m über den Freiraum hinaus nach Norden
    near(Math.hypot(out.x, out.z), walk.freiraum);
    assert.equal(turns(), 1);
    // Wer nach −Z geht, dreht die Welt um +X: Der Punkt unter ihm wandert nach +Z.
    const unterMir = new Vector3(0, 25, 0).applyQuaternion(welt.quaternion);
    near(Math.atan2(unterMir.z, unterMir.y), 1 / 25);
  });

  test('Boden auf der Kugel: am Pol der Halbmesser', () => {
    const { walk } = planet();
    near(walk.floorAt(0, 0), 25);
    near(walk.floorAt(0.25, 0), Math.sqrt(25 * 25 - 0.0625));
  });
});

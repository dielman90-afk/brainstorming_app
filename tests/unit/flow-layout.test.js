// Geschichtetes Layout für Prozessdiagramme (src/flowLayout.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { rankNodes, computeLayout } from '../../src/flowLayout.js';

const nodes = (...ids) => ids.map((id) => ({ id }));
const edges = (...pairs) => pairs.map(([a, b]) => ({ a, b }));
const ranks = (map) => Object.fromEntries(map);

describe('rankNodes', () => {
  test('Kette: Rang = Abstand vom Start', () => {
    const r = rankNodes(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c']));
    assert.deepEqual(ranks(r), { a: 0, b: 1, c: 2 });
  });

  test('ein Knoten liegt hinter ALLEN Vorgängern (längster Pfad)', () => {
    // a → b → c → d und zusätzlich a → d: d gehört hinter c, nicht neben b.
    const r = rankNodes(nodes('a', 'b', 'c', 'd'), edges(['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']));
    assert.equal(r.get('d'), 3);
  });

  test('Rückführung bricht die Rangvergabe nicht', () => {
    // „Unterlagen nachfordern" führt zurück zur Prüfung.
    const r = rankNodes(
      nodes('start', 'pruefen', 'ok', 'nachfordern', 'ende'),
      edges(['start', 'pruefen'], ['pruefen', 'ok'], ['pruefen', 'nachfordern'], ['nachfordern', 'pruefen'], ['ok', 'ende'])
    );
    assert.deepEqual(ranks(r), { start: 0, pruefen: 1, ok: 2, nachfordern: 2, ende: 3 });
  });

  test('reiner Kreis ohne Start terminiert', () => {
    const r = rankNodes(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c'], ['c', 'a']));
    assert.deepEqual(ranks(r), { a: 0, b: 1, c: 2 });
  });

  test('isolierte Knoten, Selbstschleifen und fremde Kanten', () => {
    const r = rankNodes(nodes('a', 'b', 'x'), edges(['a', 'b'], ['b', 'b'], ['a', 'unbekannt']));
    assert.deepEqual(ranks(r), { a: 0, b: 1, x: 0 });
  });

  test('lange Kette (200 Knoten) ohne Stacküberlauf', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `n${i}`);
    const r = rankNodes(nodes(...ids), edges(...ids.slice(1).map((id, i) => [ids[i], id])));
    assert.equal(r.get('n199'), 199);
  });
});

describe('computeLayout', () => {
  const frame = (boden = 0) => ({
    origin: new Vector3(0, 1.6, 0),
    right: new Vector3(1, 0, 0),
    forward: new Vector3(0, 0, -1),
    boden,
  });

  test('Fluss läuft von links nach rechts, mittig vor dem Nutzer', () => {
    const p = computeLayout(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c']), frame());
    assert.ok(p.get('a').x < p.get('b').x && p.get('b').x < p.get('c').x);
    assert.ok(Math.abs(p.get('b').x) < 1e-9, 'mittlerer Rang auf der Blickachse');
    for (const v of p.values()) assert.ok(v.z <= -2.0 + 1e-9, 'mindestens 2 m entfernt');
  });

  test('Geschwister stehen untereinander, nicht übereinander', () => {
    const p = computeLayout(nodes('a', 'b', 'c'), edges(['a', 'b'], ['a', 'c']), frame());
    assert.equal(p.get('b').x, p.get('c').x);
    assert.ok(Math.abs(p.get('b').y - p.get('c').y) >= 0.22 - 1e-9);
  });

  test('viele Geschwister werden gestaucht, aber nie deckungsgleich', () => {
    const kids = Array.from({ length: 12 }, (_, i) => `k${i}`);
    const p = computeLayout(nodes('root', ...kids), edges(...kids.map((k) => ['root', k])), frame());
    const ys = kids.map((k) => p.get(k).y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 0.22 - 1e-9);
  });

  test('Höhe gilt über dem Boden, nicht absolut (Planet: Boden bei 25 m)', () => {
    const flat = computeLayout(nodes('a'), [], frame(0));
    const planet = computeLayout(nodes('a'), [], frame(25.3));
    assert.ok(Math.abs(planet.get('a').y - flat.get('a').y - 25.3) < 1e-9);
  });

  test('lange Ketten rücken die Tafel weiter weg', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const p = computeLayout(nodes(...ids), edges(...ids.slice(1).map((id, i) => [ids[i], id])), frame());
    assert.ok(-p.get('n0').z > 2.0);
  });
});

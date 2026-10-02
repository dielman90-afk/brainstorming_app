// Board-Speicher (src/boardState.js): Importprüfung, Mermaid-Export, Autosave.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateBoard, boardToMermaid, saveBoardLocal, loadBoardLocal } from '../../src/boardState.js';

describe('validateBoard', () => {
  test('akzeptiert leere und normale Boards', () => {
    assert.doesNotThrow(() => validateBoard({ cards: [] }));
    assert.doesNotThrow(() => validateBoard({ cards: [{ text: 'A' }], connections: [] }));
  });

  for (const [label, data, pattern] of [
    ['null', null, /kein Board-Objekt/],
    ['Array', [], /kein Board-Objekt/],
    ['Text', 'board', /kein Board-Objekt/],
    ['ohne cards', {}, /„cards"/],
    ['cards kein Array', { cards: 'kaputt' }, /„cards"/],
    ['keine Karte mit Text', { cards: [{ x: 1 }, { text: 3 }] }, /hat einen Text/],
    ['connections kein Array', { cards: [], connections: {} }, /„connections"/],
  ]) {
    test(`lehnt ab: ${label}`, () => {
      assert.throws(() => validateBoard(data), pattern);
    });
  }
});

describe('boardToMermaid', () => {
  test('ohne Prozessknoten: null', () => {
    assert.equal(boardToMermaid({ cards: [{ id: '1', text: 'Idee' }] }), null);
    assert.equal(boardToMermaid({}), null);
  });

  test('Formen, Kurznamen, beschriftete und unbeschriftete Pfeile', () => {
    const text = boardToMermaid({
      cards: [
        { id: 'uuid-a', text: 'Antrag geht ein', flowType: 'start' },
        { id: 'uuid-b', text: 'Vollständig?', flowType: 'decision' },
        { id: 'uuid-c', text: 'Bewilligen', flowType: 'task' },
        { id: 'uuid-d', text: 'Fertig', flowType: 'end' },
        { id: 'uuid-x', text: 'Freie Idee' },
      ],
      connections: [
        { a: 'uuid-a', b: 'uuid-b', directed: true },
        { a: 'uuid-b', b: 'uuid-c', directed: true, label: 'ja' },
        { a: 'uuid-c', b: 'uuid-d', directed: true },
        { a: 'uuid-a', b: 'uuid-x', directed: true }, // Ziel ist kein Prozessknoten
        { a: 'uuid-a', b: 'uuid-d' }, // lose Linie, kein Pfeil
      ],
    });
    assert.equal(
      text,
      [
        'flowchart LR',
        '  n1(["Antrag geht ein"])',
        '  n2{"Vollständig?"}',
        '  n3["Bewilligen"]',
        '  n4(["Fertig"])',
        '  n1 --> n2',
        '  n2 -->|"ja"| n3',
        '  n3 --> n4',
        '',
      ].join('\n')
    );
  });

  test('Anführungszeichen und Zeilenumbrüche können das Diagramm nicht sprengen', () => {
    const text = boardToMermaid({
      cards: [
        { id: '1', text: 'Sag "hallo" [jetzt]\nund {dann}', flowType: 'task' },
        { id: '2', text: 'Ende', flowType: 'end' },
      ],
      connections: [{ a: '1', b: '2', directed: true, label: 'mit "Zitat"' }],
    });
    const lines = text.trim().split('\n');
    assert.equal(lines.length, 4, 'ein Knoten pro Zeile');
    assert.equal(lines[1], `  n1["Sag 'hallo' [jetzt] und {dann}"]`);
    assert.equal(lines[3], `  n1 -->|"mit 'Zitat'"| n2`);
  });
});

describe('Autosave', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
  });
  afterEach(() => {
    delete globalThis.localStorage;
  });

  test('noch nie gespeichert → null (dann zeigt die App Demo-Karten)', () => {
    assert.equal(loadBoardLocal(), null);
  });

  test('speichern und laden ergibt dasselbe Board', () => {
    const board = { cards: [{ id: '1', text: 'A', position: [0, 1, 2] }], connections: [], zones: [] };
    saveBoardLocal(board);
    assert.deepEqual(loadBoardLocal(), board);
  });

  test('defekter Speicherinhalt → null statt Absturz', () => {
    store.set('webxr-brainstorming-board', '{kaputt');
    assert.equal(loadBoardLocal(), null);
  });

  test('voller oder gesperrter Speicher wirft nicht', () => {
    globalThis.localStorage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    assert.doesNotThrow(() => saveBoardLocal({ cards: [] }));
  });
});

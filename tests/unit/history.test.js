// Undo/Redo (src/history.js) mit einem Zähler als „Board".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../../src/history.js';

function setup(limit = 60) {
  const board = { n: 0 };
  let restores = 0;
  const history = new History({
    capture: () => ({ ...board }),
    restore: (state) => {
      restores++;
      board.n = state.n;
      // Ein Restore darf selbst keinen Schritt erzeugen.
      history.commit('während restore');
    },
    limit,
  });
  history.reset('Start');
  return { board, history, restores: () => restores };
}

describe('History', () => {
  test('Ausgangszustand: weder Undo noch Redo', () => {
    const { history } = setup();
    assert.equal(history.canUndo, false);
    assert.equal(history.canRedo, false);
    assert.equal(history.undo(), null);
    assert.equal(history.redo(), null);
  });

  test('commit ohne Änderung erzeugt keinen Schritt', () => {
    const { history } = setup();
    assert.equal(history.commit('nichts'), false);
    assert.equal(history.entries.length, 1);
  });

  test('Undo und Redo stellen Zustände her und liefern die Beschriftung', () => {
    const { board, history } = setup();
    board.n = 1;
    history.commit('eins');
    board.n = 2;
    history.commit('zwei');
    assert.equal(history.undo(), 'zwei');
    assert.equal(board.n, 1);
    assert.equal(history.undo(), 'eins');
    assert.equal(board.n, 0);
    assert.equal(history.redo(), 'eins');
    assert.equal(board.n, 1);
  });

  test('restore läuft gesperrt – kein Schritt durch das Zurücksetzen selbst', () => {
    const { board, history, restores } = setup();
    board.n = 1;
    history.commit('eins');
    history.undo();
    assert.equal(restores(), 1);
    assert.equal(history.entries.length, 2);
    assert.equal(history.canRedo, true);
  });

  test('neue Änderung nach Undo verwirft den Redo-Ast', () => {
    const { board, history } = setup();
    board.n = 1;
    history.commit('eins');
    board.n = 2;
    history.commit('zwei');
    history.undo();
    board.n = 99;
    history.commit('neu');
    assert.equal(history.canRedo, false);
    assert.deepEqual(history.entries.map((e) => e.label), ['Start', 'eins', 'neu']);
  });

  test('Limit: älteste Schritte fallen heraus, Undo bleibt konsistent', () => {
    const { board, history } = setup(5);
    for (let i = 1; i <= 8; i++) {
      board.n = i;
      history.commit(`s${i}`);
    }
    assert.equal(history.entries.length, 5);
    while (history.canUndo) history.undo();
    assert.equal(board.n, 4, 'weiter zurück als das Limit geht es nicht');
  });

  test('onChange meldet jede Änderung des Verlaufs', () => {
    const { board, history } = setup();
    let changes = 0;
    history.onChange = () => changes++;
    board.n = 1;
    history.commit('eins');
    history.undo();
    history.redo();
    assert.equal(changes, 3);
  });
});

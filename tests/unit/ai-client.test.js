// Client für den Server-Proxy (src/ai.js): Wiederholung mit Backoff,
// Zeitgrenze und anzeigbare Fehlertexte. `fetch` wird ersetzt, die Wartezeiten
// laufen über die Mock-Uhr von node:test – der Test wartet keine Sekunde.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { requestAI, requestIdeas } from '../../src/ai.js';

const realFetch = globalThis.fetch;
let calls;

function respond(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Ein Promise zu Ende laufen lassen und dabei die Mock-Uhr vorspulen: Jede
// Wartezeit und jede Zeitgrenze feuert sofort.
async function settle(promise) {
  let done = false;
  const tracked = promise.finally(() => {
    done = true;
  });
  tracked.catch(() => {});
  while (!done) {
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.runAll();
  }
  return tracked;
}

beforeEach(() => {
  calls = [];
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
  globalThis.fetch = realFetch;
});

describe('requestAI', () => {
  test('schickt Aktion und Nutzdaten als JSON an /api/generate', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return respond(200, { ideas: [{ text: 'A' }] });
    };
    const data = await settle(requestAI('related', { selectedIdea: 'X', ideas: ['X'] }));
    assert.deepEqual(data, { ideas: [{ text: 'A' }] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/generate');
    assert.deepEqual(calls[0].body, { action: 'related', selectedIdea: 'X', ideas: ['X'] });
  });

  test('5xx: drei Versuche, Fortschritt vor jeder Wiederholung, dann die Servermeldung', async () => {
    globalThis.fetch = async () => {
      calls.push(1);
      return respond(500, { error: 'Kaputt' });
    };
    const progress = [];
    await assert.rejects(
      settle(requestAI('topic', { topic: 'x' }, { onProgress: (p) => progress.push(p) })),
      (err) => err.message === 'Kaputt' && err.status === 500
    );
    assert.equal(calls.length, 3);
    assert.deepEqual(progress.map((p) => p.attempt), [1, 2]);
    assert.ok(progress[1].waitMs > progress[0].waitMs, 'Wartezeit wächst');
  });

  test('429 wird wiederholt und kann im zweiten Versuch klappen', async () => {
    globalThis.fetch = async () => {
      calls.push(1);
      return calls.length === 1 ? respond(429, { error: 'Rate-Limit' }) : respond(200, { ideas: [] });
    };
    assert.deepEqual(await settle(requestAI('summary', {})), { ideas: [] });
    assert.equal(calls.length, 2);
  });

  test('4xx gilt als endgültig – kein Wiederholversuch', async () => {
    globalThis.fetch = async () => {
      calls.push(1);
      return respond(400, { error: 'topic fehlt.' });
    };
    await assert.rejects(settle(requestAI('topic', {})), /topic fehlt/);
    assert.equal(calls.length, 1);
  });

  test('Fehler ohne JSON-Körper: Statuscode als Meldung', async () => {
    globalThis.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 400 });
    await assert.rejects(settle(requestAI('topic', {})), /Serverfehler 400/);
  });

  test('keine Verbindung: Klartext statt „Failed to fetch"', async () => {
    globalThis.fetch = async () => {
      calls.push(1);
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(settle(requestAI('topic', {})), /Server nicht erreichbar/);
    assert.equal(calls.length, 3);
  });

  test('Zeitgrenze: Abbruch nach 45 s, drei Versuche, dann sprechende Meldung', async () => {
    globalThis.fetch = (url, { signal }) =>
      new Promise((resolve, reject) => {
        calls.push(1);
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    await assert.rejects(settle(requestAI('topic', {})), /Zeitüberschreitung nach 45 s/);
    assert.equal(calls.length, 3);
  });

  test('Whiteboard bekommt die längere Zeitgrenze (90 s)', async () => {
    globalThis.fetch = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    await assert.rejects(settle(requestAI('whiteboard', {})), /nach 90 s/);
  });
});

describe('requestIdeas', () => {
  test('filtert leere Einträge heraus', async () => {
    globalThis.fetch = async () => respond(200, { ideas: [{ text: 'A' }, { text: ' ' }, { text: 7 }, null] });
    assert.deepEqual(await settle(requestIdeas('related', {})), [{ text: 'A' }]);
  });

  test('wirft, wenn keine verwertbare Idee übrig bleibt oder die Liste fehlt', async () => {
    globalThis.fetch = async () => respond(200, { ideas: [{ text: '' }] });
    await assert.rejects(settle(requestIdeas('related', {})), /keine verwertbaren Ideen/);
    globalThis.fetch = async () => respond(200, { clusters: [] });
    await assert.rejects(settle(requestIdeas('related', {})), /keine Ideen-Liste/);
  });
});

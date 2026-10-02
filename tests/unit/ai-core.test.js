// Server-Kern (server/ai-core.js): Eingabeprüfung, Mock-Modus und das
// Säubern der Antwort von Claude. Es geht nie ein Aufruf an die echte API –
// geprüft wird entweder vor dem API-Aufruf oder im Mock-Modus.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateIdeas, parsePayload, ACTIONS } from '../../server/ai-core.js';

beforeEach(() => {
  process.env.MOCK_AI = '1';
});

async function rejectsWith(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    assert.match(err.message, pattern);
    return true;
  });
}

describe('generateIdeas – Eingabeprüfung', () => {
  test('unbekannte oder fehlende Aktion → 400', async () => {
    await rejectsWith(generateIdeas('hack', {}), 400, /Unbekannte Aktion/);
    await rejectsWith(generateIdeas(undefined, {}), 400, /Unbekannte Aktion/);
    // Kein Durchgriff auf Object.prototype
    await rejectsWith(generateIdeas('__proto__', {}), 400, /Unbekannte Aktion/);
    await rejectsWith(generateIdeas('toString', {}), 400, /Unbekannte Aktion/);
  });

  test('related/critic brauchen selectedIdea', async () => {
    await rejectsWith(generateIdeas('related', {}), 400, /selectedIdea/);
    await rejectsWith(generateIdeas('critic', { selectedIdea: '' }), 400, /selectedIdea/);
  });

  test('topic/flow brauchen ein nicht leeres Thema', async () => {
    await rejectsWith(generateIdeas('topic', { topic: '   ' }), 400, /topic/);
    await rejectsWith(generateIdeas('flow', {}), 400, /topic/);
    await rejectsWith(generateIdeas('topic', { topic: 42 }), 400, /topic/);
  });

  test('whiteboard braucht ein Bild und begrenzt die Größe', async () => {
    await rejectsWith(generateIdeas('whiteboard', {}), 400, /image/);
    await rejectsWith(generateIdeas('whiteboard', { image: 'x'.repeat(8_000_001) }), 400, /zu groß/);
  });

  test('cluster braucht mindestens zwei Karten', async () => {
    await rejectsWith(generateIdeas('cluster', { ideas: ['nur eine'] }), 400, /mindestens 2/);
    await rejectsWith(generateIdeas('cluster', { ideas: 'kein Array' }), 400, /mindestens 2/);
  });

  test('ohne Key und ohne Mock: verständlicher Fehler, kein API-Aufruf', async () => {
    process.env.MOCK_AI = '0';
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await rejectsWith(generateIdeas('topic', { topic: 'Test' }), 500, /ANTHROPIC_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe('generateIdeas – Mock-Modus', () => {
  const payloads = {
    related: { selectedIdea: 'Idee', ideas: ['a'] },
    critic: { selectedIdea: 'Idee', ideas: ['a'] },
    summary: { ideas: ['a', 'b'] },
    topic: { topic: 'Gartenparty' },
    whiteboard: { image: 'iVBORw0KGgo=' },
  };

  for (const [action, payload] of Object.entries(payloads)) {
    test(`${action} liefert eine Ideenliste`, async () => {
      const result = await generateIdeas(action, structuredClone(payload));
      assert.ok(Array.isArray(result.ideas) && result.ideas.length > 0);
      for (const idea of result.ideas) assert.equal(typeof idea.text, 'string');
    });
  }

  test('cluster verteilt alle Indizes', async () => {
    const result = await generateIdeas('cluster', { ideas: ['a', 'b', 'c', 'd', 'e'] });
    const all = result.clusters.flatMap((c) => c.ideaIndexes).sort();
    assert.deepEqual(all, [0, 1, 2, 3, 4]);
  });

  test('flow liefert Knoten und Kanten, die zusammenpassen', async () => {
    const result = await generateIdeas('flow', { topic: 'Urlaubsantrag' });
    const ids = new Set(result.nodes.map((n) => n.id));
    assert.equal(result.nodes.filter((n) => n.type === 'start').length, 1);
    for (const e of result.edges) assert.ok(ids.has(e.from) && ids.has(e.to));
  });

  test('jede Aktion aus ACTIONS ist im Mock abgedeckt', async () => {
    const extra = { cluster: { ideas: ['a', 'b'] }, flow: { topic: 'x' } };
    for (const action of ACTIONS) {
      const payload = structuredClone(payloads[action] ?? extra[action]);
      await assert.doesNotReject(generateIdeas(action, payload), action);
    }
  });
});

describe('parsePayload – Antwort von Claude säubern', () => {
  test('liest reines JSON, Code-Fences und JSON mit Begleittext', () => {
    const expected = { ideas: [{ text: 'A' }] };
    assert.deepEqual(parsePayload('related', '{"ideas":[{"text":"A"}]}'), expected);
    assert.deepEqual(parsePayload('related', '```json\n{"ideas":[{"text":"A"}]}\n```'), expected);
    assert.deepEqual(parsePayload('related', 'Hier: {"ideas":[{"text":"A"}]} – fertig.'), expected);
  });

  test('wirft bei unlesbarer oder unpassender Antwort', () => {
    assert.throws(() => parsePayload('related', 'kein JSON'), /nicht als JSON/);
    assert.throws(() => parsePayload('related', '{"foo":1}'), /keine Ideen/);
    assert.throws(() => parsePayload('cluster', '{"ideas":[]}'), /keine Cluster/);
    assert.throws(() => parsePayload('flow', '{"nodes":[]}'), /keine Prozessknoten/);
  });

  test('Ideen: leere und falsch getypte Einträge fliegen raus, Text wird getrimmt', () => {
    const r = parsePayload('topic', JSON.stringify({ ideas: [{ text: '  A ' }, { text: '' }, { text: 3 }, null, { x: 1 }] }));
    assert.deepEqual(r, { ideas: [{ text: 'A' }] });
  });

  test('Cluster: nur benannte Cluster, nur ganzzahlige Indizes', () => {
    const r = parsePayload(
      'cluster',
      JSON.stringify({
        clusters: [
          { name: ' Technik ', ideaIndexes: [0, 1.5, '2', 3] },
          { name: '', ideaIndexes: [4] },
          { name: 'Ohne Liste' },
        ],
      })
    );
    assert.deepEqual(r, { clusters: [{ name: 'Technik', ideaIndexes: [0, 3] }] });
  });

  test('Flow: unbekannte Art wird Schritt, fehlerhafte und doppelte Kanten fliegen raus', () => {
    const r = parsePayload(
      'flow',
      JSON.stringify({
        nodes: [
          { id: 'a', type: 'start', text: 'Los' },
          { id: 'b', type: 'quatsch', text: ' Prüfen ' },
          { id: 'c', type: 'end', text: '' }, // ohne Text → raus
        ],
        edges: [
          { from: 'a', to: 'b', label: ' ja ' },
          { from: 'a', to: 'b' }, // doppelt – würde im Client den Pfeil wieder entfernen
          { from: 'b', to: 'b' }, // Schleife auf sich selbst
          { from: 'b', to: 'c' }, // Ziel existiert nicht mehr
          { from: 'x', to: 'a' }, // Quelle unbekannt
        ],
      })
    );
    assert.deepEqual(r.nodes, [
      { id: 'a', type: 'start', text: 'Los' },
      { id: 'b', type: 'task', text: 'Prüfen' },
    ]);
    assert.deepEqual(r.edges, [{ from: 'a', to: 'b', label: 'ja' }]);
  });
});

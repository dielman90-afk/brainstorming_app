// HTTP-Schicht: Netlify-Funktion (Produktion) und Express-Proxy (lokal).
// Beide im Mock-Modus und ohne Key – es geht nichts an die echte API.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import handler from '../../netlify/functions/generate.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// Eigener Port, damit ein nebenher laufender Entwicklungs-Proxy nicht stört.
const PORT = Number(process.env.TEST_API_PORT || 3193);

const post = (body) =>
  new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Netlify-Funktion /api/generate', () => {
  before(() => {
    process.env.MOCK_AI = '1';
  });

  test('nur POST', async () => {
    const res = await handler(new Request('http://localhost/api/generate'));
    assert.equal(res.status, 405);
  });

  test('gültige Anfrage → 200 mit Ideen', async () => {
    const res = await handler(post({ action: 'topic', topic: 'Gartenparty' }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.ideas.length > 0);
  });

  test('Eingabefehler → 400 mit Meldung als JSON', async () => {
    const res = await handler(post({ action: 'related' }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /selectedIdea/);
  });
});

describe('Express-Proxy (server/index.js)', () => {
  let child;
  const base = `http://localhost:${PORT}`;

  before(async () => {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), MOCK_AI: '1', ANTHROPIC_API_KEY: '' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) return;
      } catch {
        // noch nicht oben
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Proxy kam auf Port ${PORT} nicht hoch`);
  });

  after(() => child?.kill());

  test('/api/health meldet Mock-Modus', async () => {
    const data = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(data, { ok: true, mock: true, hasKey: false });
  });

  test('POST /api/generate im Mock', async () => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'flow', topic: 'Urlaubsantrag' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.nodes.length && data.edges.length);
  });

  test('Eingabefehler → 400 mit JSON-Meldung', async () => {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cluster', ideas: ['nur eine'] }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /mindestens 2/);
  });
});

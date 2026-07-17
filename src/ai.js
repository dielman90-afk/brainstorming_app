// Client für den Server-Proxy – der Anthropic-Key bleibt serverseitig.
export async function requestIdeas(action, payload = {}) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Serverfehler ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.ideas)) {
    throw new Error('Unerwartete Antwort vom Server');
  }
  return data.ideas;
}

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

export const ACTIONS = ['related', 'cluster', 'summary', 'topic', 'whiteboard'];

const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

const CLUSTERS_SCHEMA = {
  type: 'object',
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ideaIndexes: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        required: ['name', 'ideaIndexes'],
        additionalProperties: false,
      },
    },
  },
  required: ['clusters'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du bist ein prägnanter, kreativer Brainstorming-Assistent für ein VR-Whiteboard.
Antworte immer auf Deutsch. Jede Idee ist ein kurzer, eigenständiger Kartentext
(maximal ca. 12 Wörter), ohne Nummerierung und ohne Markdown.`;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function buildPrompt(action, { selectedIdea, ideas = [], topic }) {
  const board = ideas.length
    ? `Aktuelle Karten auf dem Board:\n${ideas.map((t) => `- ${t}`).join('\n')}`
    : 'Das Board ist noch leer.';
  switch (action) {
    case 'related':
      return `${board}\n\nAusgewählte Karte: „${selectedIdea}“\n\nGeneriere 4 bis 6 neue, verwandte Ideen zur ausgewählten Karte. Vermeide Duplikate zu bestehenden Karten.`;
    case 'cluster': {
      const numbered = ideas.map((t, i) => `${i}: ${t}`).join('\n');
      return `Karten auf dem Board (mit Index):\n${numbered}\n\nGruppiere die Karten in 2 bis 4 thematische Cluster. Jede Karte gehört zu höchstens einem Cluster. Gib je Cluster einen kurzen, prägnanten Namen (1–3 Wörter) und die Liste der zugehörigen Karten-Indizes zurück.`;
    }
    case 'summary':
      return `${board}\n\nFasse das gesamte Board als Text einer einzelnen Karte zusammen (2 bis 3 kurze Sätze). Gib genau eine Idee zurück.`;
    case 'topic':
      return `${board}\n\nBrainstorming-Thema: „${topic}“\n\nErzeuge 8 bis 10 vielfältige, konkrete Ideen als Startpunkt für dieses Thema. Decke unterschiedliche Blickwinkel ab (Nutzen, Umsetzung, Zielgruppen, ungewöhnliche Ansätze). Vermeide Duplikate zu bestehenden Karten.`;
    case 'whiteboard':
      return `${board}\n\nDas Bild zeigt eine Whiteboard-Skizze aus einer Brainstorming-Sitzung. Analysiere die Skizze – handgeschriebenen Text, Diagramme, Pfeile, Zeichnungen und Symbole – und extrahiere daraus 3 bis 8 konkrete Ideen als Karten. Interpretiere auch grobe Zeichnungen wohlwollend. Vermeide Duplikate zu bestehenden Karten.`;
    default:
      throw badRequest(`Unbekannte Aktion: ${action}`);
  }
}

function mockPayload(action, payload) {
  if (action === 'summary') {
    return { ideas: [{ text: 'Mock-Zusammenfassung: Das Board dreht sich um eine VR-Brainstorming-App mit KI-Unterstützung.' }] };
  }
  if (action === 'cluster') {
    const count = payload.ideas?.length ?? 0;
    const a = [];
    const b = [];
    for (let i = 0; i < count; i++) (i % 2 === 0 ? a : b).push(i);
    return {
      clusters: [
        { name: 'Mock-Cluster A', ideaIndexes: a },
        { name: 'Mock-Cluster B', ideaIndexes: b },
      ],
    };
  }
  if (action === 'whiteboard') {
    return {
      ideas: [
        { text: 'Skizze: Zentrales Konzept aus der Zeichnung' },
        { text: 'Skizze: Verbindung zwischen zwei Elementen' },
        { text: 'Skizze: Offene Frage aus dem Diagramm' },
      ],
    };
  }
  if (action === 'topic') {
    return {
      ideas: [
        { text: `Mock: Zielgruppen für „${payload.topic}“ definieren` },
        { text: 'Mock: Schnellen Prototyp bauen' },
        { text: 'Mock: Konkurrenzangebote analysieren' },
        { text: 'Mock: Größtes Risiko benennen' },
        { text: 'Mock: Partner und Unterstützer suchen' },
        { text: 'Mock: Minimalversion in einer Woche' },
        { text: 'Mock: Ungewöhnlichste Lösung skizzieren' },
        { text: 'Mock: Erfolgsmessung festlegen' },
      ],
    };
  }
  return {
    ideas: [
      { text: 'Mock-Idee: Karten per Handtracking greifen' },
      { text: 'Mock-Idee: Farben für Kategorien' },
      { text: 'Mock-Idee: Timer für Brainstorming-Runden' },
      { text: 'Mock-Idee: Mehrspieler-Modus im selben Raum' },
    ],
  };
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractJson(text) {
  let data = tryParse(text);
  if (!data) {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    data = tryParse(stripped);
  }
  if (!data) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) data = tryParse(text.slice(start, end + 1));
  }
  if (!data) throw new Error('Antwort von Claude konnte nicht als JSON gelesen werden.');
  return data;
}

function parsePayload(action, text) {
  const data = extractJson(text);
  if (action === 'cluster') {
    if (!Array.isArray(data.clusters)) {
      throw new Error('Antwort von Claude enthielt keine Cluster.');
    }
    return {
      clusters: data.clusters
        .filter((c) => typeof c?.name === 'string' && c.name.trim() && Array.isArray(c?.ideaIndexes))
        .map((c) => ({
          name: c.name.trim(),
          ideaIndexes: c.ideaIndexes.filter((i) => Number.isInteger(i)),
        })),
    };
  }
  if (!Array.isArray(data.ideas)) {
    throw new Error('Antwort von Claude enthielt keine Ideen.');
  }
  return {
    ideas: data.ideas
      .filter((i) => typeof i?.text === 'string' && i.text.trim())
      .map((i) => ({ text: i.text.trim() })),
  };
}

// Serverseitige Zeitgrenze pro Anfrage. Sie liegt bewusst unter der Grenze im
// Client (src/ai.js), damit der Nutzer eine sprechende Fehlermeldung bekommt
// statt eines abgebrochenen fetch. Wiederholt wird ausschließlich im Client –
// sonst multiplizieren sich die Versuche beider Ebenen.
const REQUEST_TIMEOUT_MS = { whiteboard: 80_000, default: 38_000 };

function mapApiError(err) {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    const e = new Error('Zeitüberschreitung bei der Anthropic API.');
    e.status = 504;
    return e;
  }
  if (err instanceof Anthropic.AuthenticationError) {
    const e = new Error('Anthropic API-Key ungültig – ANTHROPIC_API_KEY in .env prüfen.');
    e.status = 500;
    return e;
  }
  if (err instanceof Anthropic.RateLimitError) {
    const e = new Error('Rate-Limit der Anthropic API erreicht – bitte kurz warten.');
    e.status = 429;
    return e;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    const e = new Error('Keine Verbindung zur Anthropic API.');
    e.status = 502;
    return e;
  }
  return err;
}

let client;

export async function generateIdeas(action, payload = {}) {
  if (!ACTIONS.includes(action)) throw badRequest(`Unbekannte Aktion: ${action}`);
  if (action === 'related' && !payload.selectedIdea) throw badRequest('selectedIdea fehlt.');
  if (action === 'topic' && !payload.topic?.trim?.()) throw badRequest('topic fehlt.');
  if (action === 'whiteboard') {
    if (typeof payload.image !== 'string' || !payload.image) throw badRequest('image (Base64-PNG) fehlt.');
    if (payload.image.length > 8_000_000) throw badRequest('Bild ist zu groß.');
  }
  if (!Array.isArray(payload.ideas)) payload.ideas = [];
  if (action === 'cluster' && payload.ideas.length < 2) {
    throw badRequest('Für Cluster werden mindestens 2 Karten benötigt.');
  }

  if (process.env.MOCK_AI === '1') return mockPayload(action, payload);

  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY ist nicht gesetzt (siehe .env.example). Zum Testen ohne Key: MOCK_AI=1.');
    e.status = 500;
    throw e;
  }
  client ??= new Anthropic();

  const schema = action === 'cluster' ? CLUSTERS_SCHEMA : IDEAS_SCHEMA;
  // Whiteboard: Skizze als Bild (Vision) + Prompt; sonst reiner Text
  const userContent =
    action === 'whiteboard'
      ? [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: payload.image },
          },
          { type: 'text', text: buildPrompt(action, payload) },
        ]
      : buildPrompt(action, payload);
  const request = {
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  };

  const requestOptions = {
    timeout: REQUEST_TIMEOUT_MS[action] ?? REQUEST_TIMEOUT_MS.default,
    maxRetries: 0,
  };

  let response;
  try {
    response = await client.messages.create(request, requestOptions);
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && String(err.message).includes('output_config')) {
      // Fallback, falls structured outputs nicht verfügbar sind: JSON per Prompt anfordern
      const { output_config, ...rest } = request;
      const formatHint = action === 'cluster'
        ? '{"clusters": [{"name": "...", "ideaIndexes": [0, 1]}]}'
        : '{"ideas": [{"text": "..."}]}';
      const hint = `\n\nAntworte ausschließlich mit JSON im Format ${formatHint}.`;
      const fallbackContent = Array.isArray(userContent)
        ? [...userContent.slice(0, -1), { type: 'text', text: buildPrompt(action, payload) + hint }]
        : userContent + hint;
      response = await client.messages.create(
        { ...rest, messages: [{ role: 'user', content: fallbackContent }] },
        requestOptions
      ).catch((e2) => { throw mapApiError(e2); });
    } else {
      throw mapApiError(err);
    }
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude hat die Anfrage abgelehnt.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  return parsePayload(action, textBlock?.text ?? '');
}

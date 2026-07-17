import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

export const ACTIONS = ['related', 'cluster', 'summary'];

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

const SYSTEM_PROMPT = `Du bist ein prägnanter, kreativer Brainstorming-Assistent für ein VR-Whiteboard.
Antworte immer auf Deutsch. Jede Idee ist ein kurzer, eigenständiger Kartentext
(maximal ca. 12 Wörter), ohne Nummerierung und ohne Markdown.`;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function buildPrompt(action, { selectedIdea, ideas = [] }) {
  const board = ideas.length
    ? `Aktuelle Karten auf dem Board:\n${ideas.map((t) => `- ${t}`).join('\n')}`
    : 'Das Board ist noch leer.';
  switch (action) {
    case 'related':
      return `${board}\n\nAusgewählte Karte: „${selectedIdea}“\n\nGeneriere 4 bis 6 neue, verwandte Ideen zur ausgewählten Karte. Vermeide Duplikate zu bestehenden Karten.`;
    case 'cluster':
      return `${board}\n\nGruppiere die Karten in 2 bis 4 thematische Cluster. Gib pro Cluster genau eine Idee zurück im Format: „Cluster <Name>: <welche Karten dazugehören>“.`;
    case 'summary':
      return `${board}\n\nFasse das gesamte Board als Text einer einzelnen Karte zusammen (2 bis 3 kurze Sätze). Gib genau eine Idee zurück.`;
    default:
      throw badRequest(`Unbekannte Aktion: ${action}`);
  }
}

function mockIdeas(action) {
  if (action === 'summary') {
    return [{ text: 'Mock-Zusammenfassung: Das Board dreht sich um eine VR-Brainstorming-App mit KI-Unterstützung.' }];
  }
  if (action === 'cluster') {
    return [
      { text: 'Cluster Produkt: Kernfunktionen der App' },
      { text: 'Cluster Nutzer: Zielgruppen und Bedürfnisse' },
    ];
  }
  return [
    { text: 'Mock-Idee: Karten per Handtracking greifen' },
    { text: 'Mock-Idee: Farben für Kategorien' },
    { text: 'Mock-Idee: Timer für Brainstorming-Runden' },
    { text: 'Mock-Idee: Mehrspieler-Modus im selben Raum' },
  ];
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseIdeas(text) {
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
  if (!data || !Array.isArray(data.ideas)) {
    throw new Error('Antwort von Claude konnte nicht als JSON gelesen werden.');
  }
  return {
    ideas: data.ideas
      .filter((i) => typeof i?.text === 'string' && i.text.trim())
      .map((i) => ({ text: i.text.trim() })),
  };
}

function mapApiError(err) {
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
  if (!Array.isArray(payload.ideas)) payload.ideas = [];

  if (process.env.MOCK_AI === '1') return { ideas: mockIdeas(action) };

  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY ist nicht gesetzt (siehe .env.example). Zum Testen ohne Key: MOCK_AI=1.');
    e.status = 500;
    throw e;
  }
  client ??= new Anthropic();

  const request = {
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: IDEAS_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(action, payload) }],
  };

  let response;
  try {
    response = await client.messages.create(request);
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && String(err.message).includes('output_config')) {
      // Fallback, falls structured outputs nicht verfügbar sind: JSON per Prompt anfordern
      const { output_config, ...rest } = request;
      response = await client.messages.create({
        ...rest,
        messages: [{
          role: 'user',
          content: `${request.messages[0].content}\n\nAntworte ausschließlich mit JSON im Format {"ideas": [{"text": "..."}]}.`,
        }],
      }).catch((e2) => { throw mapApiError(e2); });
    } else {
      throw mapApiError(err);
    }
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude hat die Anfrage abgelehnt.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  return parseIdeas(textBlock?.text ?? '');
}

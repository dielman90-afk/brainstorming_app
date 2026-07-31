// Client für den Server-Proxy – der Anthropic-Key bleibt serverseitig.
//
// Netzwerk in einer VR-Sitzung ist unzuverlässig (WLAN-Wechsel, Headset im
// Standby, kalte Serverless-Funktion). Deshalb: harte Zeitgrenze pro Versuch,
// automatische Wiederholung mit wachsender Wartezeit bei Fehlern, die sich von
// selbst erledigen können, und Fehlertexte, die man dem Nutzer direkt anzeigen
// kann – statt eines rohen „TypeError: Failed to fetch".

// Vision braucht deutlich länger als reine Textantworten.
const TIMEOUT_MS = { whiteboard: 90_000, default: 45_000 };
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function failure(message, { retryable = false, status = 0 } = {}) {
  const error = new Error(message);
  error.retryable = retryable;
  error.status = status;
  return error;
}

async function requestOnce(action, payload, timeout) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // 429 und 5xx sind typischerweise vorübergehend, 4xx ist unser Fehler.
      const retryable = res.status === 429 || res.status >= 500;
      throw failure(data.error || `Serverfehler ${res.status}`, { retryable, status: res.status });
    }

    return await res.json();
  } catch (err) {
    if (timedOut) {
      throw failure(
        `Zeitüberschreitung nach ${Math.round(timeout / 1000)} s – Claude hat nicht geantwortet.`,
        { retryable: true }
      );
    }
    // fetch wirft TypeError, wenn die Verbindung gar nicht zustande kommt.
    if (err instanceof TypeError) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      throw failure(
        offline ? 'Keine Netzwerkverbindung.' : 'Server nicht erreichbar – läuft der Proxy?',
        { retryable: !offline }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// onProgress({ attempt, maxAttempts, waitMs, message }) wird vor jeder
// Wiederholung aufgerufen – damit die Anzeige erklären kann, was gerade passiert.
export async function requestAI(action, payload = {}, { onProgress } = {}) {
  const timeout = TIMEOUT_MS[action] ?? TIMEOUT_MS.default;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await requestOnce(action, payload, timeout);
    } catch (err) {
      lastError = err;
      if (!err.retryable || attempt === MAX_ATTEMPTS) break;
      const waitMs = Math.round(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 400);
      onProgress?.({ attempt, maxAttempts: MAX_ATTEMPTS, waitMs, message: err.message });
      await sleep(waitMs);
    }
  }

  throw lastError;
}

export async function requestIdeas(action, payload = {}, options = {}) {
  const data = await requestAI(action, payload, options);
  if (!Array.isArray(data.ideas)) {
    throw failure('Unerwartete Antwort vom Server (keine Ideen-Liste).');
  }
  const ideas = data.ideas.filter((idea) => typeof idea?.text === 'string' && idea.text.trim());
  if (!ideas.length) {
    throw failure('Claude hat keine verwertbaren Ideen zurückgegeben – bitte nochmal versuchen.');
  }
  return ideas;
}

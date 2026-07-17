export function isSpeechAvailable() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Einmalige Spracherkennung; rejected bei fehlender Unterstützung,
// Fehlern oder Timeout – der Aufrufer öffnet dann die virtuelle Tastatur.
export function recognizeSpeech({ lang = 'de-DE', timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      reject(new Error('Web Speech API nicht verfügbar'));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      recognition.abort();
      reject(new Error('Zeitüberschreitung bei der Spracheingabe'));
    }, timeout);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) finish(resolve, transcript);
      else finish(reject, new Error('Nichts erkannt'));
    };
    recognition.onerror = (event) => finish(reject, new Error(`Spracheingabe: ${event.error}`));
    recognition.onend = () => finish(reject, new Error('Spracheingabe beendet ohne Ergebnis'));

    recognition.start();
  });
}

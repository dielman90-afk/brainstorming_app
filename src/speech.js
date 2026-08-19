// Spracheingabe über die Web Speech API: Diktat einer einzelnen Texteingabe.
//
// Ausschließlich für den Desktop (Chrome/Edge). In XR gibt es das nicht: kein
// Mikrofon-Knopf auf der virtuellen Tastatur, kein Eintrag im Hand-Menü, und
// auf einem Brillen-Browser fehlt der Abschnitt „Sprache" im Overlay ganz.
// Getippt wird dort.

function RecognitionClass() {
  return typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Brillen-Browser werden von der Web Speech API ausgenommen – und zwar hart.
//
// Der Quest-Browser ist Chromium-basiert und stellt `webkitSpeechRecognition`
// deshalb bereit. Darunter liegt aber nichts: Horizon OS ist ein abgespecktes
// Android ohne Spracherkennungsdienst. Ein `recognition.start()` läuft dort
// nicht ins Leere, sondern reißt im schlimmsten Fall den ganzen Browser mit –
// genau der Absturz, der beim Druck auf „🎤 Sprechen" auftrat.
//
// Eine Prüfung auf „gibt es den Konstruktor?" reicht dafür nicht, weil es ihn
// ja gibt. Deshalb wird das Gerät selbst erkannt.
//
// Der Umweg über die Systemtastatur der Brille (deren Mikrofon-Taste diktieren
// kann) war ein Versuch, dort doch noch Diktat anzubieten. Auf echter Hardware
// hat er nicht getragen und ist wieder raus.
const HEADSET_UA = /OculusBrowser|Quest|Horizon ?OS|Pico Browser|Wolvic/i;

export function isHeadsetBrowser() {
  if (typeof navigator === 'undefined') return false;
  return HEADSET_UA.test(navigator.userAgent || '');
}

// Zweite, gerätunabhängige Sperre.
//
// Die Kennung oben ist eine Zeichenkette, die Meta jederzeit umbauen kann –
// „Oculus Browser" heißt seit 2024 „Meta Quest Browser", und beim nächsten Mal
// fällt vielleicht das Wort „Quest" weg. Sich für etwas, das den Browser
// abschießt, allein darauf zu verlassen, wäre leichtsinnig.
//
// Deshalb zusätzlich der Zustand, um den es eigentlich geht: Läuft gerade eine
// immersive Sitzung? Dann ist Spracherkennung in jedem Fall tabu – auf
// autarken Brillen fehlt der Dienst dahinter, und selbst wo es ihn gibt, kann
// die Mikrofon-Abfrage in einer immersiven Sitzung nicht angezeigt werden.
// main.js setzt das bei sessionstart/sessionend.
let xrPresenting = false;

export function setXRPresenting(value) {
  xrPresenting = Boolean(value);
}

export function isSpeechAvailable() {
  if (xrPresenting || isHeadsetBrowser()) return false;
  return Boolean(RecognitionClass());
}

// Klartext für die Statuszeile, wenn nichts geht.
export function speechUnavailableReason() {
  if (isSpeechAvailable()) return null;
  if (xrPresenting || isHeadsetBrowser()) {
    return 'In der Brille gibt es keine Spracherkennung – dort wird getippt.';
  }
  return 'Dieser Browser kennt keine Spracherkennung – die Tastatur übernimmt.';
}

// Fehlercodes der API in verständliche Sätze übersetzen. „not-allowed" ist der
// häufigste Fall und als roher Code nicht zu deuten.
function errorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon nicht freigegeben – Zugriff im Browser erlauben.';
    case 'no-speech':
      return 'Nichts gehört.';
    case 'audio-capture':
      return 'Kein Mikrofon gefunden.';
    case 'network':
      return 'Spracherkennung braucht Internet – offline geht nur die Tastatur.';
    case 'aborted':
      return 'Spracheingabe abgebrochen.';
    default:
      return `Spracheingabe: ${code}`;
  }
}

// Fehler mit erhaltenem Code – der Aufrufer entscheidet anhand von
// SPEECH_DEAD_ENDS, ob ein anderer Eingabeweg probiert werden soll.
function speechError(code) {
  const error = new Error(errorMessage(code));
  error.code = code;
  return error;
}

// Einmalige Diktat-Eingabe.
//
// onPartial bekommt die Zwischenergebnisse, damit die Tastatur live mitschreiben
// kann – ohne diese Rückmeldung wirkt eine Sekunde Stille wie ein Absturz.
// Über `signal` (AbortSignal) lässt sich das Diktat von außen abbrechen.
export function recognizeSpeech({
  lang = 'de-DE',
  timeout = 12000,
  onPartial = null,
  onReady = null,
  signal = null,
} = {}) {
  return new Promise((resolve, reject) => {
    const Recognition = RecognitionClass();
    if (!Recognition) {
      reject(new Error('Web Speech API nicht verfügbar'));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = Boolean(onPartial);
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    let best = '';

    const timer = setTimeout(() => {
      if (settled) return;
      // Wurde schon etwas verstanden, gilt das als Ergebnis statt als Fehler.
      if (best.trim()) finish(resolve, best.trim());
      else finish(reject, new Error('Zeitüberschreitung bei der Spracheingabe'));
      recognition.abort();
    }, timeout);

    const onAbort = () => {
      recognition.abort();
      finish(reject, new Error('Spracheingabe abgebrochen.'));
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new Error('Spracheingabe abgebrochen.'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    recognition.onaudiostart = () => onReady?.();
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) best = final;
      const shown = (final || interim).trim();
      if (shown) onPartial?.(shown);
      if (final.trim()) finish(resolve, final.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' && best.trim()) {
        finish(resolve, best.trim());
        return;
      }
      finish(reject, speechError(event.error));
    };
    recognition.onend = () => {
      if (best.trim()) finish(resolve, best.trim());
      else finish(reject, new Error('Nichts erkannt.'));
    };

    try {
      recognition.start();
    } catch (err) {
      const error = new Error(`Spracheingabe konnte nicht starten: ${err.message}`);
      error.code = 'start-failed';
      finish(reject, error);
    }
  });
}


// **Sprachbefehle sind ersatzlos entfallen (Aug. 2026).**
//
// Hier standen eine Kommandotabelle (`VOICE_COMMANDS`), ein Abgleich am
// Satzanfang (`matchCommand`) und ein `VoiceCommands`-Erkenner, der dauerhaft
// zuhörte und die Erkennung nach jeder Stille neu startete. Sie bildeten gut
// zwanzig gesprochene Wendungen auf dieselben Aktions-IDs ab, die auch das
// Menü auslöst.
//
// Der Preis dafür war ein Mikrofon, das die ganze Sitzung mitschneidet und
// jede Äußerung serverseitig verarbeiten lässt – die Web Speech API tut genau
// das –, für einen zweiten Weg zu Knöpfen, die ohnehin danebenstehen.
//
// Das Diktat oben bleibt: Es macht etwas, das kein Knopf ersetzt, und es läuft
// nur für die Dauer einer einzelnen Eingabe.

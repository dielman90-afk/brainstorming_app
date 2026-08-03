// Spracheingabe über die Web Speech API: Diktat (einzelne Texteingabe) und
// Sprachbefehle (dauerhaftes Zuhören, Kommando → Aktion).
//
// Verfügbarkeit ist browserabhängig: Chrome/Edge am Desktop können es, Firefox
// nicht, und der Quest-Browser hat es lange nicht unterstützt. Deshalb wird
// nirgends davon ausgegangen, dass es geht – jede Funktion meldet sauber, wenn
// nicht, und die virtuelle Tastatur bleibt der Rückfallweg.

function RecognitionClass() {
  return typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechAvailable() {
  return Boolean(RecognitionClass());
}

// Klartext für die Statuszeile, wenn nichts geht.
export function speechUnavailableReason() {
  if (isSpeechAvailable()) return null;
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
      finish(reject, new Error(errorMessage(event.error)));
    };
    recognition.onend = () => {
      if (best.trim()) finish(resolve, best.trim());
      else finish(reject, new Error('Nichts erkannt.'));
    };

    try {
      recognition.start();
    } catch (err) {
      finish(reject, new Error(`Spracheingabe konnte nicht starten: ${err.message}`));
    }
  });
}

// --- Sprachbefehle ---

// Kommandos auf Aktions-IDs (dieselben wie im Hand-Menü). Mehrere Formulierungen
// je Aktion, weil niemand die exakte Menü-Beschriftung spricht.
// `takesText`: alles nach dem Kommando wird als Text mitgegeben
// („neue Karte Fahrradständer bauen" legt die Karte direkt beschriftet an).
export const VOICE_COMMANDS = [
  { action: 'new', takesText: true, phrases: ['neue karte', 'neue notiz', 'karte anlegen', 'notiz anlegen'] },
  { action: 'topic', takesText: true, phrases: ['thema', 'themen start', 'themenstart', 'start board'] },
  { action: 'related', phrases: ['verwandte ideen', 'ähnliche ideen', 'mehr ideen', 'weiterspinnen'] },
  { action: 'critic', phrases: ['kritiker', 'kritik', 'einwände', 'advocatus diaboli'] },
  { action: 'cluster', phrases: ['cluster', 'gruppieren', 'sortieren'] },
  { action: 'summary', phrases: ['zusammenfassen', 'zusammenfassung'] },
  { action: 'color', phrases: ['farbe', 'einfärben', 'farbe wechseln'] },
  { action: 'connect', phrases: ['verbinden', 'verbindung'] },
  { action: 'delete', phrases: ['karte löschen', 'lösche karte', 'karte entfernen'] },
  { action: 'clear', phrases: ['alles löschen', 'board leeren'] },
  { action: 'undo', phrases: ['rückgängig', 'zurück'] },
  { action: 'redo', phrases: ['wiederholen', 'wiederherstellen'] },
  { action: 'zone', phrases: ['zone', 'rahmen'] },
  { action: 'timer', phrases: ['timer', 'stoppuhr', 'timebox'] },
  { action: 'whiteboard', phrases: ['whiteboard', 'zeichnen', 'tafel'] },
  { action: 'environment', phrases: ['umgebung', 'welt wechseln', 'umgebung wechseln'] },
  { action: 'fontsize', phrases: ['schrift', 'schriftgröße', 'größere schrift'] },
  { action: 'save', phrases: ['sichern', 'speichern', 'sicherungspunkt'] },
  { action: 'load', phrases: ['laden', 'wiederherstellen von'] },
  { action: 'export', phrases: ['exportieren', 'als datei'] },
];

// Kleinschreibung, ohne Satzzeichen, einfache Leerzeichen. Die Erkennung liefert
// „Neue Karte, Fahrrad." – ohne Normalisierung greift kein Vergleich.
export function normalizeSpoken(text) {
  return String(text)
    .toLowerCase()
    .replace(/[.,;:!?„“"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Längste Phrase zuerst, damit „karte löschen" nicht von „karte" geschlagen wird.
const SORTED_COMMANDS = VOICE_COMMANDS.flatMap((cmd) =>
  cmd.phrases.map((phrase) => ({ ...cmd, phrase }))
).sort((a, b) => b.phrase.length - a.phrase.length);

// Bewusst nur Treffer am Satzanfang: Ein Kommando mitten im Gespräch
// („…dann können wir das alles löschen…") darf nichts auslösen.
export function matchCommand(spoken) {
  const text = normalizeSpoken(spoken);
  if (!text) return null;
  for (const cmd of SORTED_COMMANDS) {
    if (text === cmd.phrase) return { action: cmd.action, text: '' };
    if (text.startsWith(`${cmd.phrase} `)) {
      const rest = text.slice(cmd.phrase.length).trim();
      // Ohne takesText ist Nachgeplapper ein Zeichen, dass es kein Befehl war.
      if (!cmd.takesText) return rest ? null : { action: cmd.action, text: '' };
      return { action: cmd.action, text: rest };
    }
  }
  return null;
}

// Dauerhaftes Zuhören für Sprachbefehle. Chrome beendet die Erkennung nach
// Stille von selbst – deshalb wird sie neu gestartet, solange aktiv.
export class VoiceCommands {
  constructor({ lang = 'de-DE', onCommand, onHeard = null, onError = null, onStateChange = null } = {}) {
    this.lang = lang;
    this.onCommand = onCommand;
    this.onHeard = onHeard;
    this.onError = onError;
    this.onStateChange = onStateChange;
    this.active = false;
    this.paused = false;
    this._recognition = null;
    this._restartTimer = 0;
  }

  get available() {
    return isSpeechAvailable();
  }

  start() {
    if (this.active) return true;
    if (!this.available) return false;
    this.active = true;
    this.paused = false;
    this._spawn();
    this.onStateChange?.(true);
    return true;
  }

  stop() {
    this.active = false;
    clearTimeout(this._restartTimer);
    this._teardown();
    this.onStateChange?.(false);
  }

  toggle() {
    if (this.active) {
      this.stop();
      return false;
    }
    return this.start();
  }

  // Während eines Diktats pausieren: Zwei gleichzeitige Erkenner streiten sich
  // um das Mikrofon, und der diktierte Text würde als Befehl gedeutet.
  pause() {
    if (!this.active || this.paused) return;
    this.paused = true;
    clearTimeout(this._restartTimer);
    this._teardown();
  }

  resume() {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this._spawn();
  }

  _teardown() {
    const recognition = this._recognition;
    this._recognition = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Bereits beendet – nichts zu tun
    }
  }

  _scheduleRestart(delay = 400) {
    clearTimeout(this._restartTimer);
    if (!this.active || this.paused) return;
    this._restartTimer = setTimeout(() => this._spawn(), delay);
  }

  _spawn() {
    const Recognition = RecognitionClass();
    if (!Recognition || !this.active || this.paused) return;
    this._teardown();

    const recognition = new Recognition();
    this._recognition = recognition;
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const spoken = result[0]?.transcript ?? '';
        if (!spoken.trim()) continue;
        this.onHeard?.(spoken.trim());
        const match = matchCommand(spoken);
        if (match) this.onCommand?.(match);
      }
    };
    recognition.onerror = (event) => {
      // „no-speech"/„aborted" sind im Dauerbetrieb normal und kein Meldungsfall.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.active = false;
        this.onStateChange?.(false);
      }
      this.onError?.(errorMessage(event.error));
    };
    recognition.onend = () => this._scheduleRestart();

    try {
      recognition.start();
    } catch {
      this._scheduleRestart(800);
    }
  }
}

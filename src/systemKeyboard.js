// Brücke zur Systemtastatur der Brille.
//
// Warum es die überhaupt braucht: Der Quest-Browser kennt die Web Speech API
// nicht (kein `SpeechRecognition`), Diktat über speech.js scheitert dort also
// grundsätzlich. Die Brille selbst kann sehr wohl Sprache-zu-Text – aber nur in
// ihrer eigenen Systemtastatur, über deren Mikrofon-Taste.
//
// Meta bindet diese Tastatur an die ganz normale DOM-Fokussierung an: Ist
// `XRSession.isSystemKeyboardSupported` wahr, öffnet ein `focus()` auf ein
// <input> die Systemtastatur mitten in der laufenden immersiven Sitzung. Von
// dort tippt oder diktiert der Nutzer, und wir lesen das Ergebnis aus dem Feld.
//
// Zwei dokumentierte Eigenheiten prägen den Code:
//   1. Es gibt keine Tastendruck-Ereignisse. Der einzige Weg an den Text ist der
//      `value` des Feldes – deshalb wird zusätzlich zum `input`-Ereignis
//      gepollt.
//   2. Jeder Anzeigevorgang ist eine neue Bearbeitung, und der erste Tastendruck
//      überschreibt den vorhandenen Wert komplett. Vorbelegen ist damit sinnlos;
//      wir starten leer und hängen das Ergebnis an den bestehenden Text an.
//
// Während die Tastatur oben ist, steht die Sitzung laut Spezifikation auf
// `visible-blurred`. Genau daran erkennen wir Auf- und Zugehen – Controller- und
// Handeingaben sind in dieser Zeit ohnehin stillgelegt, unsere eigene
// „Abbrechen"-Taste also unerreichbar.

const PROXY_ID = 'system-keyboard-proxy';

// Nach dieser Zeit ohne Lebenszeichen der Systemtastatur wird einmal Bescheid
// gesagt – aber nicht abgebrochen. Ein Abbruch würde eine gerade laufende
// Diktat-Eingabe wegwerfen, nur weil ein Ereignis ausgeblieben ist.
const SILENT_AFTER = 4000;

const POLL_MS = 150;

export function systemKeyboardSupported(session) {
  return Boolean(session && session.isSystemKeyboardSupported);
}

// Das Feld muss wirklich im Dokument stehen und darf nicht `display:none` sein,
// sonst ist es nicht fokussierbar und die Tastatur bleibt aus. Es wird deshalb
// unsichtbar, aber vorhanden geparkt – zwei Pixel in der Ecke, ohne Mauszugriff,
// damit es am Desktop niemandem in die Quere kommt.
function createProxyInput() {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = PROXY_ID;
  input.lang = 'de';
  input.enterKeyHint = 'done';
  input.tabIndex = -1;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'sentences');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-hidden', 'true');
  Object.assign(input.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '2px',
    height: '2px',
    padding: '0',
    margin: '0',
    border: '0',
    outline: 'none',
    opacity: '0',
    background: 'transparent',
    color: 'transparent',
    caretColor: 'transparent',
    pointerEvents: 'none',
  });
  return input;
}

export class SystemKeyboardBridge {
  // getSession: Zugriff auf die aktuelle XRSession (renderer.xr.getSession()).
  // Sie wechselt bei jedem Sitzungsstart, darf also nicht gemerkt werden.
  constructor({ getSession = () => null } = {}) {
    this._getSession = getSession;
    this._input = null;
    this._busy = false;
  }

  get session() {
    try {
      return this._getSession?.() ?? null;
    } catch {
      return null;
    }
  }

  get available() {
    return systemKeyboardSupported(this.session);
  }

  // Klartext für die Statuszeile, wenn nichts geht.
  get unavailableReason() {
    if (this.available) return null;
    if (!this.session) return 'Systemtastatur gibt es nur in der laufenden VR-Sitzung.';
    return 'Diese Brille bietet keine Systemtastatur für Web-Inhalte.';
  }

  _ensureInput() {
    if (this._input?.isConnected) return this._input;
    const existing = document.getElementById(PROXY_ID);
    this._input = existing instanceof HTMLInputElement ? existing : createProxyInput();
    if (!this._input.isConnected) document.body.appendChild(this._input);
    return this._input;
  }

  // Öffnet die Systemtastatur und liefert den eingegebenen (oder diktierten)
  // Text, sobald sie wieder zugeht.
  //
  // onPartial: laufender Zwischenstand fürs Vorschaufeld.
  // onOpen:    die Tastatur ist tatsächlich aufgegangen.
  // onSilent:  nach SILENT_AFTER immer noch kein Lebenszeichen.
  request({ onPartial = null, onOpen = null, onSilent = null, signal = null } = {}) {
    if (this._busy) return Promise.reject(new Error('Die Systemtastatur ist bereits offen.'));
    const session = this.session;
    if (!systemKeyboardSupported(session)) {
      return Promise.reject(new Error(this.unavailableReason));
    }

    const input = this._ensureInput();
    input.value = '';
    this._busy = true;

    return new Promise((resolve, reject) => {
      let settled = false;
      let opened = false;
      let last = '';
      let poll = 0;
      let silentTimer = 0;

      const read = () => {
        if (input.value === last) return;
        last = input.value;
        onPartial?.(last);
      };

      const cleanup = () => {
        clearInterval(poll);
        clearTimeout(silentTimer);
        session.removeEventListener?.('visibilitychange', onVisibility);
        input.removeEventListener('input', read);
        input.removeEventListener('keydown', onKeyDown);
        signal?.removeEventListener('abort', onAbort);
        this._busy = false;
        try {
          input.blur();
        } catch {
          // Feld schon aus dem Dokument – nichts zu tun
        }
        input.value = '';
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      const done = () => {
        read();
        finish(resolve, last.trim());
      };

      const onVisibility = () => {
        // 'visible-blurred' = Systemtastatur liegt über der Szene.
        if (session.visibilityState === 'visible-blurred') {
          if (!opened) {
            opened = true;
            clearTimeout(silentTimer);
            onOpen?.();
          }
          return;
        }
        // Zurück auf 'visible': die Tastatur ist zu, die Eingabe steht.
        if (opened) done();
      };

      const onKeyDown = (event) => {
        // Eine angeschlossene Bluetooth-Tastatur liefert echte Ereignisse; die
        // Systemtastatur tut das nicht (deshalb das Polling).
        if (event.key === 'Enter') {
          event.preventDefault();
          done();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(reject, new Error('Eingabe abgebrochen.'));
        }
      };

      const onAbort = () => finish(reject, new Error('Eingabe abgebrochen.'));

      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(new Error('Eingabe abgebrochen.'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      session.addEventListener?.('visibilitychange', onVisibility);
      input.addEventListener('input', read);
      input.addEventListener('keydown', onKeyDown);
      poll = setInterval(read, POLL_MS);
      silentTimer = setTimeout(() => {
        if (!opened && !settled) onSilent?.();
      }, SILENT_AFTER);

      // Der eigentliche Auslöser. Muss synchron in der Nutzer-Geste stehen –
      // der Aufruf kommt aus dem 'selectstart'-Handler des Controllers, damit
      // die kurzzeitige Nutzeraktivierung des Browsers noch gilt.
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    });
  }

  dispose() {
    this._input?.remove();
    this._input = null;
  }
}

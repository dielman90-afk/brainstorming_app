// Schriften lokal gebündelt statt von fonts.googleapis.com.
//
// Auf der Quest hängt die App regelmäßig in Netzen ohne freien Internetzugang
// (Gäste-WLAN, Firmennetz, Hotspot ohne Datenvolumen). Vom CDN geladene Fonts
// fallen dort auf den System-Font zurück – die App sieht dann jedes Mal anders
// aus als beabsichtigt. Über npm (@fontsource) gebündelt landen die woff2-
// Dateien im eigenen Build und werden mit ausgeliefert.
//
// Bewusst nur die Latin-Subsets und nur die tatsächlich benutzten Schnitte:
// Umlaute, ß und die deutschen Anführungszeichen liegen alle im Latin-Bereich.
import '@fontsource/sora/latin-400.css';
import '@fontsource/sora/latin-500.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';

// Für die 3D-Panels (Canvas-Texturen) verwendete Familie samt Fallback-Kette.
export const PANEL_FONT_FAMILY = "'Sora', 'Segoe UI', system-ui, sans-serif";

// Canvas-Text wird einmalig beim Erzeugen gezeichnet. Sind die Webfonts zu
// diesem Zeitpunkt noch nicht geladen, rendert der Fallback-Font – und zwar
// dauerhaft, weil niemand neu zeichnet. Deshalb melden sich alle Panels hier an
// und werden nach dem Laden genau einmal neu gezeichnet.
const pending = new Set();
let fontsReady = false;

export function onFontsReady(redraw) {
  if (fontsReady) {
    redraw();
    return;
  }
  pending.add(redraw);
}

export function forgetFontListener(redraw) {
  pending.delete(redraw);
}

// document.fonts.load() erzwingt das Laden – ohne eine tatsächliche Verwendung
// im DOM würde `fonts.ready` sonst auflösen, bevor die Panel-Schrift überhaupt
// angefordert wurde.
const familiesToLoad = ['400 16px Sora', '600 16px Sora', '700 16px Sora'];

if (typeof document !== 'undefined' && document.fonts) {
  Promise.allSettled(familiesToLoad.map((font) => document.fonts.load(font)))
    .then(() => document.fonts.ready)
    .catch(() => {})
    .finally(() => {
      fontsReady = true;
      for (const redraw of pending) {
        try {
          redraw();
        } catch {
          // Ein kaputtes Panel darf die übrigen nicht blockieren
        }
      }
      pending.clear();
    });
} else {
  fontsReady = true;
}

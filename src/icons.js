// Monochrome Linien-Icons für alle drei Oberflächen: Desktop-Overlay,
// Kontextmenü und das Handgelenk-Menü in VR.
//
// **Eine Definition, zwei Renderer.** Jedes Icon ist ein SVG-Pfad (`d`-String)
// in einer 24×24-Box, als reine Strichzeichnung gedacht: keine Füllungen,
// runde Kappen, Strichstärke 2. Der Desktop rendert daraus ein Inline-`<svg>`
// mit `stroke: currentColor` (Hover-Farben kommen damit gratis aus dem
// vorhandenen CSS), das VR-Menü zeichnet denselben String über `new
// Path2D(d)` auf seine Canvas-Texturen. Es gibt also keinen Weg, auf dem
// Desktop und Brille verschiedene Symbole für dieselbe Aktion zeigen.
//
// Warum kein Icon-Font und keine Bilddateien: Die App lädt vollständig
// offline und ohne externe Assets – das ist eine harte Eigenschaft des
// Projekts (siehe README), keine Sparsamkeit. Pfadstrings kosten nichts.
//
// Die Emojis, die hier ersetzt werden, waren der meistgenannte Kritikpunkt am
// Menü: Sie rendern auf jeder Plattform anders, sind nicht einfärbbar (Hover
// und Aktiv-Zustand konnten nur den Text färben, nie das Symbol) und wirken
// nach Chat, nicht nach Werkzeug.

export const ICONS = {
  // --- Ideen ----------------------------------------------------------------
  plus: 'M12 5v14M5 12h14',
  // Funke für KI-Aktionen: ein vierstrahliger Stern.
  spark:
    'M12 4v5M12 15v5M4 12h5M15 12h5M7.5 7.5l2.2 2.2M14.3 14.3l2.2 2.2M16.5 7.5l-2.2 2.2M9.7 14.3l-2.2 2.2',
  // Kritiker: Sprechblase mit Blitz darin.
  critic: 'M4 5h16v11h-8l-4 4v-4H4zM13 7l-3 4h4l-3 4',
  // Cluster: vier Kacheln.
  cluster: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  // Zusammenfassen: Absatzlinien, die letzte kurz.
  summary: 'M5 7h14M5 12h14M5 17h8',
  // Farbe: Tropfen.
  color: 'M12 4c3.5 4.2 5.5 7 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 11 8.5 8.2 12 4z',
  // Verbinden: zwei Knoten mit Linie.
  connect:
    'M7.8 16.2 16.2 7.8M5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM19 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  // Schriftgröße: großes und kleines A als Striche.
  fontsize: 'M4 18 8.5 7l4.5 11M5.6 14.5h5.8M14 18l3-7 3 7M15.2 16h3.6',
  trash: 'M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13M10.5 10.5v6M13.5 10.5v6',
  // --- Board ----------------------------------------------------------------
  undo: 'M8 6 4 10l4 4M4 10h9a6 6 0 0 1 0 12h-2',
  redo: 'M16 6l4 4-4 4M20 10h-9a6 6 0 0 0 0 12h2',
  // Zone: gestrichelter Rahmen.
  zone: 'M4 7V5a1 1 0 0 1 1-1h2M10 4h4M17 4h2a1 1 0 0 1 1 1v2M20 10v4M20 17v2a1 1 0 0 1-1 1h-2M14 20h-4M7 20H5a1 1 0 0 1-1-1v-2M4 14v-4',
  timer: 'M12 21a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM12 9v4l3 2M10 3h4',
  whiteboard: 'M4 5h16v11H4zM9 16l-2 4M15 16l2 4M9 11l3-3 2 2 3-3',
  environment:
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  quality: 'M5 8h9M18 8h1M14 5.5v5M5 16h1M10 16h9M10 13.5v5',
  export: 'M12 4v11M8 8l4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
  import: 'M12 15V4M8 11l4 4 4-4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
  // --- Sprache --------------------------------------------------------------
  mic: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3',
  // Sprachbefehle: Schallwellen – bewusst anders als das Diktier-Mikrofon,
  // die beiden Knöpfe stehen direkt untereinander.
  voice: 'M5 9v6M9 6v12M13 8v8M17 5v14M21 10v4',
  // Themen-Start: Zielscheibe – der Ausgangspunkt, um den sich alles anordnet.
  topic:
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zM12 12.01',
  // --- Prozessdiagramm ------------------------------------------------------
  // Die vier Formen als das, was sie im Diagramm sind – Miniaturen der Knoten.
  'flow-start': 'M8 6.5h8a5.5 5.5 0 0 1 0 11H8a5.5 5.5 0 0 1 0-11z',
  'flow-task': 'M4 7h16v10H4z',
  'flow-decision': 'M12 4l8 8-8 8-8-8z',
  'flow-end':
    'M8 6.5h8a5.5 5.5 0 0 1 0 11H8a5.5 5.5 0 0 1 0-11zM9.5 9.5h5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 1 0-5z',
  'flow-none': 'M6 6l12 12M18 6 6 18',
  arrow: 'M4 12h14M13 6l6 6-6 6',
  label: 'M4 9a1 1 0 0 1 1-1h9l6 4-6 4H5a1 1 0 0 1-1-1zM8 12h.01',
  layout: 'M4 6h4v4H4zM10 14h4v4h-4zM16 6h4v4h-4zM8 8h8M12 10v4M18 10v2a2 2 0 0 1-2 2h-2',
  // Mermaid/Export als Verzweigung.
  branch:
    'M6 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 9v6M6 12c0-2 2-3 5-3h3',
  clear: 'M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13',
  edit: 'M14.5 5.5l4 4L9 19H5v-4zM12.5 7.5l4 4',
};

const VIEW = 24;

/**
 * Inline-SVG für den Desktop. `stroke: currentColor` – die Farbe kommt aus dem
 * umgebenden Element, Hover-Regeln des vorhandenen CSS greifen unverändert.
 */
export function iconSVG(id, size = 16) {
  const d = ICONS[id];
  if (!d) return '';
  return (
    `<svg viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" aria-hidden="true" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round"><path d="${d}"/></svg>`
  );
}

/**
 * Alle Elemente mit `data-icon` mit ihrem SVG bestücken. Elemente mit einem
 * `.ic`-Span (Aktionsliste: Icon rechts) bekommen es dort hinein, alle anderen
 * vorangestellt. Ein unbekannter Name wirft – ein leiser Tippfehler hieße
 * sonst: leere Halterung, und niemand merkt es.
 */
export function decorateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const id = el.dataset.icon;
    if (!ICONS[id]) throw new Error(`Unbekanntes Icon "${id}" an ${el.id || el.tagName}`);
    const svg = iconSVG(id);
    // Drei Träger: der .ic-Span selbst (Aktionsliste), ein Element mit
    // .ic-Kind, oder ein Knopf ohne Halterung (Icon wird vorangestellt).
    if (el.classList.contains('ic')) el.innerHTML = svg;
    else if (el.querySelector('.ic')) el.querySelector('.ic').innerHTML = svg;
    else el.insertAdjacentHTML('afterbegin', `<span class="ic-lead">${svg}</span>`);
  }
}

/**
 * Dasselbe Icon auf eine Canvas zeichnen (VR-Menü). `x`/`y` ist die linke
 * obere Ecke des Zielquadrats mit Kantenlänge `size`; Canvas 2D versteht
 * SVG-Pfadstrings direkt über Path2D, es gibt also keine zweite Formquelle.
 */
export function drawIcon(ctx, id, x, y, size, color, lineWidth = 2) {
  const d = ICONS[id];
  if (!d) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / VIEW, size / VIEW);
  ctx.strokeStyle = color;
  // Die Strichstärke gilt im 24er-Icon-Raum (der Kontext ist skaliert). Damit
  // wirken alle Icons gleich kräftig, unabhängig von der Zielgröße.
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
  ctx.restore();
}

// Board sichern und wiederherstellen. Drei Wege:
//
//   1. Datei-Export/-Import als JSON  – zum Archivieren und zum Umziehen
//      zwischen Geräten (Desktop ↔ Quest).
//   2. Sicherungspunkte im Browser    – „💾 Sichern" / „📂 Laden", der einzige
//      Weg, der auch mitten in einer laufenden XR-Sitzung funktioniert (ein
//      Datei-Dialog würde die Sitzung verlassen).
//   3. Autosave                       – läuft im Hintergrund, stellt das Board
//      beim nächsten Öffnen wieder her.
//
// "data" ist jeweils das komplette Board-JSON (Karten + Verbindungen +
// Whiteboard), das main.js über boardToJSON()/applyBoardJSON() zusammenstellt.

const STORAGE_KEY = 'webxr-brainstorming-board';
const SNAPSHOT_KEY = 'webxr-brainstorming-snapshots';
const MAX_SNAPSHOTS = 3;

// Prüft eingelesenes JSON, bevor es aufs Board losgelassen wird. Wirft mit
// einer Meldung, die direkt anzeigbar ist.
export function validateBoard(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Die Datei enthält kein Board-Objekt.');
  }
  if (!Array.isArray(data.cards)) {
    throw new Error('Im Board fehlt die Liste „cards".');
  }
  const usable = data.cards.filter((c) => typeof c?.text === 'string');
  if (data.cards.length && !usable.length) {
    throw new Error('Keine der Karten in der Datei hat einen Text.');
  }
  if (data.connections !== undefined && !Array.isArray(data.connections)) {
    throw new Error('„connections" muss eine Liste sein.');
  }
  return data;
}

export function downloadBoard(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brainstorm-board-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst nach dem Klick freigeben – sonst bricht der Download in manchen
  // Browsern ab, bevor er begonnen hat.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return data.cards?.length ?? 0;
}

// --- Mermaid-Export des Prozessflussdiagramms ---
//
// Mermaid, weil es GitHub, Notion, Obsidian und Confluence direkt rendern –
// der in VR gebaute Prozess ist damit ohne Zwischenschritt im Dokument und
// bleibt dort bearbeitbar. Ein Bild wäre eine Sackgasse.

const MERMAID_WRAP = {
  start: ['([', '])'],
  end: ['([', '])'],
  decision: ['{', '}'],
  task: ['[', ']'],
};

// Mermaid bricht an `[]{}()|"` ab; Anführungszeichen um den Text lösen das für
// fast alles, die verbleibenden Zeichen werden ersetzt.
function mermaidText(text) {
  const clean = String(text ?? '')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return `"${clean}"`;
}

// Lesbare, stabile Knotennamen: n1, n2, … statt der langen UUIDs.
export function boardToMermaid(data) {
  const nodes = (data?.cards ?? []).filter((c) => c.flowType);
  if (!nodes.length) return null;
  const names = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
  // LR statt TD: passt zur waagerechten Anordnung in der App, und lange
  // Prozesse sind auch im Dokument breit besser lesbar als hoch.
  const lines = ['flowchart LR'];

  for (const node of nodes) {
    const [open, close] = MERMAID_WRAP[node.flowType] ?? MERMAID_WRAP.task;
    lines.push(`  ${names.get(node.id)}${open}${mermaidText(node.text)}${close}`);
  }

  const edges = (data?.connections ?? []).filter(
    (c) => c.directed && names.has(c.a) && names.has(c.b)
  );
  for (const edge of edges) {
    const label = edge.label ? `|${mermaidText(edge.label)}|` : '';
    lines.push(`  ${names.get(edge.a)} -->${label} ${names.get(edge.b)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function downloadMermaid(data) {
  const text = boardToMermaid(data);
  if (!text) return 0;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prozess-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mmd`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return (data.cards ?? []).filter((c) => c.flowType).length;
}

export async function importBoardFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  return validateBoard(data);
}

// --- Sicherungspunkte (funktionieren auch in VR) ---

function readSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeSnapshots(list) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list));
}

// Legt einen Sicherungspunkt an (neueste zuerst) und hält die Liste klein.
// Bei vollem localStorage werden erst ältere Punkte, dann die Whiteboard-
// Zeichnung geopfert – lieber ein Sicherungspunkt ohne Skizze als keiner.
export function saveSnapshot(data) {
  const entry = {
    at: new Date().toISOString(),
    cards: data.cards?.length ?? 0,
    data,
  };
  let list = [entry, ...readSnapshots()].slice(0, MAX_SNAPSHOTS);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeSnapshots(list);
      return entry;
    } catch {
      if (list.length > 1) {
        list = list.slice(0, list.length - 1);
      } else if (list[0]?.data?.whiteboard?.image) {
        list = [{ ...list[0], data: { ...list[0].data, whiteboard: { ...list[0].data.whiteboard, image: null } } }];
      } else {
        throw new Error('Der Browser-Speicher ist voll – Sicherungspunkt nicht möglich.');
      }
    }
  }
  throw new Error('Der Browser-Speicher ist voll – Sicherungspunkt nicht möglich.');
}

export function listSnapshots() {
  return readSnapshots().map(({ at, cards }) => ({ at, cards }));
}

// Neuester Sicherungspunkt (index 0) bzw. ältere über den Index.
export function loadSnapshot(index = 0) {
  const entry = readSnapshots()[index];
  if (!entry) return null;
  return { ...entry, data: validateBoard(entry.data) };
}

// --- Autosave ---

export function saveBoardLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage voll oder blockiert – Autosave ist optional
  }
}

// Liefert null, wenn noch nie ein Board gespeichert wurde (dann Demo-Karten
// zeigen); sonst das gespeicherte Board-JSON.
export function loadBoardLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Export/Import als Datei sowie automatisches Speichern im Browser.
// "data" ist das komplette Board-JSON (Karten + Verbindungen), das main.js
// über boardToJSON()/applyBoardJSON() zusammenstellt bzw. anwendet.

export function downloadBoard(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `brainstorm-board-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importBoardFile(file) {
  return JSON.parse(await file.text());
}

const STORAGE_KEY = 'webxr-brainstorming-board';

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

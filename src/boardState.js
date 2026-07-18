export function downloadBoard(cardManager) {
  const json = JSON.stringify(cardManager.toJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `brainstorm-board-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importBoardFile(file, cardManager) {
  const text = await file.text();
  const data = JSON.parse(text);
  cardManager.loadJSON(data);
  return cardManager.cards.length;
}

// --- Automatisches Speichern im Browser (localStorage) ---

const STORAGE_KEY = 'webxr-brainstorming-board';

export function saveBoardLocal(cardManager) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cardManager.toJSON()));
  } catch {
    // localStorage voll oder blockiert – Autosave ist optional
  }
}

// Liefert null, wenn noch nie ein Board gespeichert wurde (dann Demo-Karten
// zeigen); sonst die Anzahl geladener Karten (0 = bewusst leeres Board).
export function loadBoardLocal(cardManager) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    cardManager.loadJSON(JSON.parse(raw));
    return cardManager.cards.length;
  } catch {
    return null;
  }
}

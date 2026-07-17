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

// **Die Reihenfolge der Welten steht nur hier.**
//
// Der Reiter „Welt" im Hand-Menü, die Leiste am Desktop und das Durchschalten
// lesen diese Liste; `createEnvironments` (environments.js) baut in derselben
// Reihenfolge. Gemerkt und getestet wird über die `id`, nie über die Position –
// so lässt sich die Liste umstellen, ohne eine gemerkte Wahl zu verbiegen.
//
// `kurz` ist der Name im Menü: ohne Emoji (die Menüs zeichnen Linien-Icons,
// siehe wristMenu.js) und vor allem **ohne die Welt dafür zu bauen**. Den
// vollen Namen kennt erst die Baufunktion; ihn über den Stellvertreter zu
// lesen, hieße alle fünf Welten zu bauen, nur um ein Menü zu beschriften.
//
// Das Konstrukt steht vorn, gleich nach dem Raum – so hat es der Nutzer
// gewünscht. Es ist zugleich die leichteste Welt (2 MB Texturen, 51 000
// Dreiecke gegen 17–43 MB bei den anderen).
export const UMGEBUNGEN = [
  { id: 'matrix', kurz: 'Konstrukt' },
  { id: 'island', kurz: 'Insel' },
  { id: 'night', kurz: 'Nachthimmel' },
  { id: 'zen', kurz: 'Zen-Garten' },
  { id: 'dojo', kurz: 'Dojo' },
];

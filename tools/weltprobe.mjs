// **Wählt man eine Welt direkt, und sieht man, dass sie gebaut wird?**
// (src/main.js `waehleUmgebung`, src/wristMenu.js Reiter „Welt",
// src/umgebungsliste.js)
//
// Gemeldet war: Der Umgebungswechsel hängt. Zwei Ursachen, zwei Prüfungen:
//
//   1. **Durchschalten baute jede Welt auf dem Weg.** Wer von der Insel zum
//      Dojo wollte, ließ Nachthimmel, Zen-Garten und Konstrukt mitbauen. Jetzt
//      wird direkt gewählt; gebaut ist danach genau die Zielwelt. Gegenprobe:
//      Durchschalten auf einer frischen Seite baut die Zwischenwelten.
//   2. **Der Bau lief im Takt des Klicks.** Die Brille reichte bis zum Ende
//      kein Bild ein, und das letzte zeigte die alte Welt ohne jedes Zeichen.
//      Jetzt steht erst „… wird aufgebaut" im Bild; gebaut wird mindestens ein
//      gezeichnetes Bild später.
//
// Dazu die Reihenfolge (Konstrukt vorn), der Reiter „Welt" mit acht Knöpfen
// und die Leiste „Umgebung" am Desktop, jeweils mit leuchtender Wahl.
//
// Die Bauzeiten stammen aus SwiftShader und sind nur untereinander
// vergleichbar – auf der Quest rechnet eine andere CPU und eine echte GPU.
//
// Aufruf: HARNESS_PORT=… node tools/weltprobe.mjs
import { startServer, launchBrowser, openApp } from './harness-common.mjs';

let fehler = 0;
const pruefe = (ok, text) => {
  if (!ok) fehler++;
  console.log(`  ${ok ? 'OK    ' : 'FEHLER'} ${text}`);
};

// Bilder zählen, bis die Bedingung gilt (oder die Geduld endet).
async function bisBild(page, bedingung, max = 600) {
  return page.evaluate(
    async ({ bedingung, max }) => {
      const pruef = new Function('app', `return (${bedingung});`);
      let n = 0;
      while (!pruef(window.__app) && n < max) {
        await new Promise((r) => requestAnimationFrame(r));
        n++;
      }
      return n;
    },
    { bedingung, max }
  );
}

const server = await startServer();
const browser = await launchBrowser();
try {
  // --- Reihenfolge, Namen ohne Bauen, Reiter und Leiste ----------------------
  const { page, messages } = await openApp(browser);
  console.log('\n=== Reihenfolge und Menü ===');
  const start = await page.evaluate(async () => {
    const { PAGES } = await import('/src/wristMenu.js');
    const app = window.__app;
    const envs = app.env.environments;
    const namen = envs.map((e) => e.kurzname);
    const welt = PAGES.find((p) => p.id === 'world');
    const board = PAGES.find((p) => p.id === 'board');
    return {
      ids: envs.map((e) => e.id),
      namen,
      gebaut: envs.filter((e) => e.gebaut).map((e) => e.id),
      reiter: PAGES.map((p) => p.label),
      welt: welt?.actions.map((a) => a.id),
      boardAlt: board.actions.some((a) => a.id === 'environment' || a.id === 'quality'),
      chips: [...document.querySelectorAll('#env-row button')].map((b) => b.textContent),
      qchips: [...document.querySelectorAll('#quality-row button')].map((b) => b.textContent),
      neutralLabel: app.wristMenu.buttonsById.get('env:neutral')?.label,
      neutralAktiv: app.wristMenu.buttonsById.get('env:neutral')?.active,
      chipAktiv: document.querySelector('#env-row button.active')?.textContent,
      vollAktiv: app.wristMenu.buttonsById.get('quality:voll')?.active,
    };
  });
  pruefe(
    start.ids.join(',') === 'matrix,island,night,zen,dojo',
    `Konstrukt steht vorn: ${start.ids.join(' → ')}`
  );
  pruefe(start.namen.join(',') === 'Konstrukt,Insel,Nachthimmel,Zen-Garten,Dojo', `Menünamen: ${start.namen.join(', ')}`);
  pruefe(start.gebaut.length === 0, `Namen lesen baut nichts (gebaut: ${start.gebaut.join(', ') || 'keine'})`);
  pruefe(start.reiter.join(',') === 'Ideen,Board,Prozess,Welt', `Reiter: ${start.reiter.join(' · ')}`);
  pruefe(
    start.welt?.join(',') ===
      'env:neutral,env:matrix,env:island,env:night,env:zen,env:dojo,quality:voll,quality:fluessig',
    `Reiter „Welt": ${start.welt?.length} Knöpfe`
  );
  pruefe(!start.boardAlt, '„Umgebung" und „Bildqualität" sind vom Board verschwunden');
  pruefe(
    start.chips.join(',') === 'Neutral,Konstrukt,Insel,Nachthimmel,Zen-Garten,Dojo' && start.qchips.join(',') === 'Voll,Flüssig',
    `Desktop-Leiste: ${start.chips.join(' · ')} | ${start.qchips.join(' · ')}`
  );
  pruefe(
    start.neutralLabel === 'Neutral' && start.neutralAktiv && start.chipAktiv === 'Neutral' && start.vollAktiv,
    'am Desktop ohne Welt: „Neutral" und „Voll" leuchten'
  );

  // --- Direktwahl mit Hinweis vor dem Bau -----------------------------------
  console.log('\n=== Direktwahl ===');
  const auftrag = await page.evaluate(() => {
    const app = window.__app;
    const dojo = app.env.environments.findIndex((e) => e.id === 'dojo');
    window.__bilderSeitKlick = 0;
    window.__bauBild = null;
    const zaehle = () => {
      window.__bilderSeitKlick++;
      if (window.__bauBild === null && app.env.environments[dojo].gebaut) window.__bauBild = window.__bilderSeitKlick;
      if (window.__bauBild === null) requestAnimationFrame(zaehle);
    };
    app.handleAction('env:dojo');
    requestAnimationFrame(zaehle);
    return {
      ausstehend: app.env.ausstehend() === dojo,
      gebaut: app.env.environments[dojo].gebaut,
      status: document.getElementById('status')?.textContent,
      busyBand: document.getElementById('status-band')?.classList.contains('busy'),
      knopf: app.wristMenu.buttonsById.get('env:dojo')?.active,
      chip: document.querySelector('#env-row button.active')?.textContent,
    };
  });
  pruefe(auftrag.ausstehend && !auftrag.gebaut, 'der Klick baut noch nicht – der Wechsel ist angemeldet');
  pruefe(/Dojo wird aufgebaut/.test(auftrag.status ?? '') && auftrag.busyBand, `sofort steht der Hinweis da: „${auftrag.status}"`);
  pruefe(auftrag.knopf && auftrag.chip === 'Dojo', 'der Dojo-Knopf leuchtet schon (Menü und Desktop)');
  await bisBild(page, 'app.env.ausstehend() === null && app.env.environments.find((e) => e.id === "dojo").gebaut', 2000);
  const nachDojo = await page.evaluate(() => {
    const app = window.__app;
    return {
      bauBild: window.__bauBild,
      aktuell: app.env.environments[app.env.current()]?.id,
      gebaut: app.env.environments.filter((e) => e.gebaut).map((e) => e.id),
      busyBand: document.getElementById('status-band')?.classList.contains('busy'),
      status: document.getElementById('status')?.textContent,
      protokoll: app.env.protokoll.slice(-1)[0],
    };
  });
  pruefe(nachDojo.bauBild >= 2, `gebaut wurde erst ${nachDojo.bauBild - 1} gezeichnete(s) Bild(er) nach dem Klick`);
  pruefe(nachDojo.aktuell === 'dojo', `jetzt aktiv: ${nachDojo.aktuell}`);
  pruefe(nachDojo.gebaut.join(',') === 'dojo', `gebaut ist nur die Zielwelt (${nachDojo.gebaut.join(', ')})`);
  pruefe(!nachDojo.busyBand && /Dojo aktiv/.test(nachDojo.status ?? ''), `danach: „${nachDojo.status}", kein Spinner mehr`);
  console.log(`  Bauzeit Dojo ${nachDojo.protokoll?.bauzeit.toFixed(0)} ms (SwiftShader, nur relativ)`);

  // Vom Dojo direkt in den Zen-Garten: Nachthimmel bleibt ungebaut.
  await page.evaluate(() => window.__app.handleAction('env:zen'));
  await bisBild(page, 'app.env.ausstehend() === null && app.env.environments.find((e) => e.id === "zen").gebaut', 2000);
  const nachZen = await page.evaluate(() => {
    const app = window.__app;
    return {
      aktuell: app.env.environments[app.env.current()]?.id,
      gebaut: app.env.environments.filter((e) => e.gebaut).map((e) => e.id),
      protokoll: app.env.protokoll.slice(-1)[0],
    };
  });
  pruefe(
    nachZen.aktuell === 'zen' && nachZen.gebaut.join(',') === 'zen,dojo',
    `Dojo → Zen-Garten baut nur den Garten (gebaut: ${nachZen.gebaut.join(', ')})`
  );
  console.log(`  Bauzeit Zen-Garten ${nachZen.protokoll?.bauzeit.toFixed(0)} ms (SwiftShader, nur relativ)`);

  // Zurück ins Dojo: schon gebaut, also sofort – ohne Hinweis und ohne Warten.
  const zurueck = await page.evaluate(() => {
    const app = window.__app;
    app.handleAction('env:dojo');
    return { aktuell: app.env.environments[app.env.current()]?.id, ausstehend: app.env.ausstehend() };
  });
  pruefe(zurueck.aktuell === 'dojo' && zurueck.ausstehend === null, 'eine gebaute Welt kommt sofort, ohne Umweg');

  // Neutral und Qualität über Menü-Aktionen und Desktop-Chips
  const rest = await page.evaluate(() => {
    const app = window.__app;
    app.handleAction('env:neutral');
    const neutral = { aktuell: app.env.current(), aktiv: app.wristMenu.buttonsById.get('env:neutral')?.active };
    document.querySelector('#quality-row button[data-stufe="fluessig"]').click();
    const q = {
      stufe: app.quality.aktuell(),
      menue: app.wristMenu.buttonsById.get('quality:fluessig')?.active,
      vollAus: !app.wristMenu.buttonsById.get('quality:voll')?.active,
      chip: document.querySelector('#quality-row button.active')?.textContent,
    };
    document.querySelector('#quality-row button[data-stufe="voll"]').click();
    document.querySelector('#env-row button[data-env="dojo"]').click();
    const chipWahl = app.env.environments[app.env.current()]?.id;
    return { neutral, q, chipWahl };
  });
  pruefe(rest.neutral.aktuell === -1 && rest.neutral.aktiv, '„Neutral" schaltet die Welt ab und leuchtet');
  pruefe(
    rest.q.stufe === 'fluessig' && rest.q.menue && rest.q.vollAus && rest.q.chip === 'Flüssig',
    'Chip „Flüssig": Stufe gewechselt, im Menü und am Desktop markiert'
  );
  pruefe(rest.chipWahl === 'dojo', 'ein Klick auf den Desktop-Chip „Dojo" wählt das Dojo');
  pruefe(messages.length === 0, `keine Fehler in der Konsole (${messages.length})`);
  if (messages.length) console.log('  ' + messages.join('\n  '));
  await page.context().close();

  // --- Gegenprobe: Durchschalten baut die Zwischenwelten --------------------
  console.log('\n=== Gegenprobe: Durchschalten ===');
  const { page: seite2 } = await openApp(browser);
  const durch = await seite2.evaluate(() => {
    const api = window.__app.env;
    const ziel = api.environments.findIndex((e) => e.id === 'zen');
    let schutz = 0;
    while (api.current() !== ziel && schutz++ < 12) api.cycle();
    return api.environments.filter((e) => e.gebaut).map((e) => e.id);
  });
  pruefe(
    durch.join(',') === 'matrix,island,night,zen',
    `vier Klicks auf „weiter" bis zum Zen-Garten bauen ${durch.length} Welten (${durch.join(', ')})`
  );
  await seite2.context().close();
} finally {
  await browser.close();
  await server.stop();
}

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nOK: alle Prüfungen bestanden');
process.exit(fehler ? 1 : 0);

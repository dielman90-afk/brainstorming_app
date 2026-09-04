// **Woher kommt das Loch im Selbstschatten der Insel?**
//
//   node tools/schattenleck.mjs
//
// Befund: In `3-edge-down` sitzt ein heller Fleck mitten im dunklen Kiel,
// Kasten (400,385)–(480,425) mit Mittel 88,8 gegen 47,4 daneben. Gemessen mit
// `tools/kielfleck.mjs` haben beide Flaechen praktisch dieselbe Normale und
// dasselbe N·L (0,368 gegen 0,393) — der Unterschied ist allein der
// Schlagschatten: Ohne ihn steht der dunkle Kasten bei 91,1, der helle bei
// 93,3. Der Fleck ist also ein LOCH im Schatten, keine beleuchtete Flaeche.
//
// Dieses Werkzeug dreht die beiden Regler des Schattens zur Laufzeit und misst
// beide Kaesten gleichzeitig. Sie muessen zusammen betrachtet werden: Ein
// Wert, der das Loch schliesst und dabei ueberall Schattenakne einbaut, hat
// nichts gewonnen.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const FLECK = [400, 385, 480, 425];
const KIEL = [520, 385, 600, 425];
// Eine Flaeche, auf der Schattenakne zuerst auftraete: die besonnte Wiese mit
// ihren flachen Winkeln.
const WIESE = [700, 40, 900, 110];

const mittel = (p, K) => {
  let s = 0;
  let n = 0;
  for (let y = K[1]; y <= K[3]; y++)
    for (let x = K[0]; x <= K[2]; x++) {
      const i = (y * p.width + x) * 4;
      s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      n++;
    }
  return s / n;
};
// Streuung als Mass fuer Akne: ein gestreiftes oder gesprenkeltes Feld hat eine
// hohe Standardabweichung, ein sauber beleuchtetes eine niedrige.
const streuung = (p, K) => {
  const m = mittel(p, K);
  let s = 0;
  let n = 0;
  for (let y = K[1]; y <= K[3]; y++)
    for (let x = K[0]; x <= K[2]; x++) {
      const i = (y * p.width + x) * 4;
      const l = 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      s += (l - m) * (l - m);
      n++;
    }
  return Math.sqrt(s / n);
};

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot());
};

const stelle = (page, feld, wert) =>
  page.evaluate(
    ({ feld, wert }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let n = 0;
      g.traverse((o) => {
        if (!o.isDirectionalLight || !o.castShadow) return;
        if (feld === 'mapSize') {
          o.shadow.mapSize.set(wert, wert);
          o.shadow.map?.dispose();
          o.shadow.map = null;
        } else {
          o.shadow[feld] = wert;
        }
        o.shadow.needsUpdate = true;
        n++;
      });
      return n;
    },
    { feld, wert }
  );

// `shadowSide` entscheidet, WELCHE Seite eines Koerpers im Schattendurchgang
// zeichnet. three setzt sie fuer `FrontSide`-Werkstoffe von sich aus auf
// `BackSide` — die Rueckseite, um Akne zu vermeiden. Bei einem Koerper mit
// grosser Tiefe (die Insel ist 33 m dick) liegt diese Rueckseite weit hinter
// der Vorderseite, und der gespeicherte Abstand gehoert dann zu einer ganz
// anderen Flaeche als der, die verdeckt.
const seiten = (page, wert) =>
  page.evaluate(
    (wert) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let n = 0;
      const namen = [];
      g.traverse((o) => {
        if (o.name !== 'island-body') return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (wert === null) namen.push(`side=${m.side} shadowSide=${m.shadowSide}`);
          else {
            m.shadowSide = wert;
            // **Ohne das war der erste Versuch ein Leerlauf.** three legt das
            // Tiefenmaterial je Werkstoff an und liest `shadowSide` beim
            // Anlegen; eine spaetere Aenderung greift erst nach `needsUpdate`.
            m.needsUpdate = true;
          }
          n++;
        }
      });
      return wert === null ? namen : n;
    },
    wert
  );

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island').find((s) => s.name === '3-edge-down'), 6.0);
  await ladeThree(page);
  const zeige = async (name) => {
    const p = await bild(page);
    process.stdout.write(
      `  ${name.padEnd(22)} Fleck ${mittel(p, FLECK).toFixed(1).padStart(5)}   Kiel ${mittel(p, KIEL).toFixed(1).padStart(5)}   Abstand ${(mittel(p, FLECK) - mittel(p, KIEL)).toFixed(1).padStart(5)}   Wiese ${mittel(p, WIESE).toFixed(1).padStart(5)} +/- ${streuung(p, WIESE).toFixed(2)}\n`
    );
  };
  await zeige('Stand');

  // **Wird die Schattenkarte ueberhaupt neu gezeichnet?** Wenn nicht, sind alle
  // Schalter, die nur die ERZEUGUNG der Karte betreffen (Werfer, Ortho-Kasten,
  // shadowSide, near/far), wirkungslos, waehrend die, die beim SCHATTIEREN
  // wirken (Licht aus, castShadow des Lichts, bias), sofort greifen. Genau
  // dieses Muster zeigen die Messungen.
  const karte = await page.evaluate(() => {
    const r = window.__app.renderer;
    return {
      autoUpdate: r.shadowMap.autoUpdate,
      needsUpdate: r.shadowMap.needsUpdate,
      enabled: r.shadowMap.enabled,
      typ: r.shadowMap.type,
    };
  });
  process.stdout.write(
    `  shadowMap: enabled=${karte.enabled} autoUpdate=${karte.autoUpdate} needsUpdate=${karte.needsUpdate} type=${karte.typ}\n`
  );

  // **Ein Bild sagt hier mehr als der naechste Regler.** Nur die Sonne an, alles
  // andere aus: Dann ist die Form des beleuchteten Bereichs unverstellt zu
  // sehen, und daran erkennt man, ob es ein Loch im Schatten ist oder etwas
  // ganz anderes.
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.isLight) o.visible = o.isDirectionalLight && o.castShadow;
    });
  });
  fs.writeFileSync('/tmp/nur-sonne.png', PNG.sync.write(await bild(page)));
  process.stdout.write('  -> /tmp/nur-sonne.png (nur die Sonne)\n');
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.isLight) o.visible = true;
    });
  });
  // **Der Blick der Sonne.** Die Schattenkarte ist nichts anderes als das, was
  // die Sonne sieht. Wenn eine Stelle im Bild beleuchtet ist, obwohl Geometrie
  // ueber ihr steht, dann fehlt diese Geometrie in genau diesem Blick — und
  // dann sieht man hier das Loch.
  const ausSonne = await page.evaluate(() => {
    const app = window.__app;
    // **Nur die Insel durchsuchen.** Die Szene enthaelt die Lichter aller
    // Umgebungen; ein `scene.traverse` liefert die letzte schattenwerfende
    // Sonne irgendeiner anderen Umgebung. Genau das ist mir hier passiert und
    // hat einen Ortho-Kasten von 12 gemeldet, wo die Insel 26,4 setzt.
    const gg = app.scene.children.find((c) => c.name === 'env-island');
    let sonne = null;
    gg.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && !sonne) sonne = o;
    });
    const sc = sonne.shadow.camera;
    sonne.shadow.updateMatrices(sonne);
    const cam = app.camera;
    app.__kameraAlt = cam.clone();
    cam.__alt = {
      p: cam.position.clone(),
      q: cam.quaternion.clone(),
      m: cam.projectionMatrix.clone(),
    };
    if (app.__harnessLock) cancelAnimationFrame(app.__harnessLock);
    sc.updateMatrixWorld(true);
    cam.position.setFromMatrixPosition(sc.matrixWorld);
    cam.quaternion.setFromRotationMatrix(sc.matrixWorld);
    cam.projectionMatrix.copy(sc.projectionMatrix);
    cam.projectionMatrixInverse.copy(sc.projectionMatrix).invert();
    cam.updateMatrixWorld(true);
    return {
      links: sc.left,
      rechts: sc.right,
      oben: sc.top,
      unten: sc.bottom,
      nah: sc.near,
      fern: sc.far,
    };
  });
  fs.writeFileSync('/tmp/aus-sonne.png', PNG.sync.write(await bild(page)));
  // Der Fleck im Clipraum der Schattenkamera. Liegt eine Koordinate ausserhalb
  // von -1..1, wird die Schattenkarte an dieser Stelle gar nicht abgefragt —
  // three liefert dann „nicht im Schatten", und kein Regler aendert daran etwas.
  const clip = await page.evaluate(({ K }) => {
    const T = window.__THREE;
    const app = window.__app;
    const g = app.scene.children.find((c) => c.name === 'env-island');
    let sonne = null;
    g.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && !sonne) sonne = o;
    });
    sonne.shadow.updateMatrices(sonne);
    const sc = sonne.shadow.camera;
    const cam = app.__kameraAlt ?? app.camera;
    const gr = new T.Vector2();
    app.renderer.getSize(gr);
    const rc = new T.Raycaster();
    const raus = [];
    for (const [name, px, py] of [
      ['Fleck', (K[0] + K[2]) / 2, (K[1] + K[3]) / 2],
      ['Kiel', 560, 405],
      ['Wiese', 800, 75],
    ]) {
      rc.setFromCamera(new T.Vector2((px / gr.x) * 2 - 1, -((py / gr.y) * 2 - 1)), cam);
      const h = rc.intersectObject(g, true).filter((x) => x.object.visible)[0];
      if (!h) {
        raus.push({ name, fehlt: true });
        continue;
      }
      const v = h.point.clone().project(sc);
      // Zu WELCHER Insel gehoert der Treffer? Die Mini-Inseln tragen dieselben
      // Knotennamen wie die Hauptinsel. Empfaengt ihr Koerper keine Schatten,
      // ist er von der Sonne voll beleuchtet — und dann greift kein einziger
      // Regler der Schattenkarte, genau wie gemessen.
      const kette = [];
      for (let o = h.object; o && o !== g; o = o.parent) kette.push(o.name || '(ohne Namen)');
      raus.push({
        name,
        welt: [h.point.x, h.point.y, h.point.z],
        clip: [v.x, v.y, v.z],
        empfaengt: !!h.object.receiveShadow,
        wirft: !!h.object.castShadow,
        kette: kette.join(' < '),
      });
    }
    return raus;
  }, { K: FLECK });
  process.stdout.write('  Clipraum der Schattenkamera (drinnen heisst alle drei zwischen -1 und 1):\n');
  for (const r of clip)
    process.stdout.write(
      r.fehlt
        ? `    ${r.name.padEnd(6)} (kein Treffer)\n`
        : `    ${r.name.padEnd(6)} Clip (${r.clip.map((v) => v.toFixed(3)).join(' | ')}) ${r.clip.every((v) => v >= -1 && v <= 1) ? 'drinnen' : 'DRAUSSEN'}` +
          `  empfaengt Schatten: ${r.empfaengt ? 'ja' : 'NEIN'}  wirft: ${r.wirft ? 'ja' : 'nein'}\n      ${r.kette}\n`
    );
  process.stdout.write(
    `  -> /tmp/aus-sonne.png (Blick der Sonne; Kasten ${ausSonne.links}..${ausSonne.rechts} x ${ausSonne.unten}..${ausSonne.oben}, near ${ausSonne.nah}, far ${ausSonne.fern})\n`
  );
  await lockCamera(page, shotsFor('island').find((s) => s.name === '3-edge-down'), 6.0);

  process.stdout.write('\nnormalBias:\n');
  for (const w of [0.035, 0.02, 0.01, 0.004, 0.0]) {
    await stelle(page, 'normalBias', w);
    await zeige(String(w));
  }
  await stelle(page, 'normalBias', 0.035);
  process.stdout.write('\nbias:\n');
  // Der erste Anlauf hat hier nur zwischen -0,0006 und +0,0002 gefahren — eine
  // Spanne, in der sich nichts ruehren KANN. Wenn ein Regler nichts bewirkt,
  // muss man ihn erst bis zum Anschlag drehen, bevor man ihn ausschliesst.
  for (const w of [-0.05, -0.01, -0.003, -0.0006, 0, 0.002]) {
    await stelle(page, 'bias', w);
    await zeige(String(w));
  }
  await stelle(page, 'bias', -0.0006);
  // --- Welches Licht malt den Fleck? ----------------------------------------
  //
  // Der erste Schalter dieses Werkzeugs hat ALLE gerichteten Lichter zugleich
  // ausgeschaltet und damit nichts unterschieden. Die Insel hat mehrere, und
  // nur eines wirft Schatten — ein Fuelllicht ohne Schatten waere durch keine
  // Schattenkarte zu beeinflussen und erklaerte, warum bisher kein Regler
  // gegriffen hat.
  const lichter = await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    const l = [];
    g.traverse((o) => {
      if (!o.isLight) return;
      o.__nr = l.length;
      l.push({
        nr: l.length,
        typ: o.type,
        staerke: o.intensity,
        schatten: !!o.castShadow,
        ort: [o.position.x, o.position.y, o.position.z],
      });
    });
    return l;
  });
  process.stdout.write('\nLichter der Insel, einzeln abgeschaltet:\n');
  for (const l of lichter) {
    await page.evaluate((nr) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      g.traverse((o) => {
        if (o.isLight) o.visible = o.__nr !== nr;
      });
    }, l.nr);
    await zeige(
      `${l.nr} ${l.typ.replace('Light', '')} ${l.staerke.toFixed(2)}${l.schatten ? ' Sch' : ''}`
    );
  }
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.isLight) o.visible = true;
    });
  });

  process.stdout.write(`\nWerkstoffe von island-body: ${(await seiten(page, null)).join(', ')}\n`);
  process.stdout.write('shadowSide (0=vorne, 1=hinten, 2=beide, null=Vorgabe):\n');
  for (const w of [0, 1, 2]) {
    await seiten(page, w);
    await zeige(String(w));
  }
  await seiten(page, null);

  // --- Reicht der Schattenkasten ueberhaupt bis zum Kiel? -------------------
  //
  // Kein Regler der Schattenkarte hat den Fleck bewegt, aber das Ausschalten
  // der Sonne loescht ihn. Beides zusammen heisst: Die Stelle wird nicht falsch
  // beschattet, sie wird GAR NICHT beschattet — sie liegt ausserhalb des
  // Ortho-Kastens der Schattenkamera. Ausserhalb liefert die Abfrage „nicht im
  // Schatten", und daran aendert keine Genauigkeitseinstellung etwas.
  //
  // Der Kasten misst +/- 26,4 Welteinheiten. Der Kiel reicht 32,8 tief; bei
  // einem Sonnenstand von 56 Grad ueber dem Horizont liegt sein tiefster Punkt
  // rund 27,2 Einheiten neben der Achse — knapp draussen.
  const kasten = (page, unten, seite) =>
    page.evaluate(
      ({ unten, seite }) => {
        const g = window.__app.scene.children.find((c) => c.name === 'env-island');
        g.traverse((o) => {
          if (!o.isDirectionalLight || !o.castShadow) return;
          const c = o.shadow.camera;
          c.left = -seite;
          c.right = seite;
          c.top = seite;
          c.bottom = -unten;
          c.updateProjectionMatrix();
          o.shadow.needsUpdate = true;
        });
      },
      { unten, seite }
    );
  process.stdout.write('\nOrtho-Kasten der Schattenkamera (unten / seitlich):\n');
  for (const [u, se] of [
    [26.4, 26.4],
    [32, 26.4],
    [38, 26.4],
    [46, 26.4],
    [38, 32],
    [46, 46],
  ]) {
    await kasten(page, u, se);
    await zeige(`unten ${u}  seitlich ${se}`);
  }
  await kasten(page, 26.4, 26.4);

  process.stdout.write('\nnear / far der Schattenkamera:\n');
  const nahFern = (page, nah, fern) =>
    page.evaluate(
      ({ nah, fern }) => {
        const g = window.__app.scene.children.find((c) => c.name === 'env-island');
        g.traverse((o) => {
          if (!o.isDirectionalLight || !o.castShadow) return;
          o.shadow.camera.near = nah;
          o.shadow.camera.far = fern;
          o.shadow.camera.updateProjectionMatrix();
          o.shadow.needsUpdate = true;
        });
      },
      { nah, fern }
    );
  for (const [n, f] of [
    [95, 215],
    [60, 215],
    [30, 260],
    [95, 300],
  ]) {
    await nahFern(page, n, f);
    await zeige(`near ${n}  far ${f}`);
  }
  await nahFern(page, 95, 215);

  // Letzte Frage: Wer verdeckt eigentlich den dunklen Kiel? Faellt er ohne
  // `island-body` als Werfer ins Licht, dann ist der Koerper dort der einzige
  // Verdecker — und dann verdeckt er den Fleck eben nicht, weil seine Form es
  // nicht hergibt. Das waere kein Fehler der Schattenkarte, sondern der Form.
  // **Erst die Liste, dann die Schalter.** Der erste Anlauf hat fuenf Namen von
  // Hand aufgezaehlt; alle fuenf abgeschaltet liess den Kiel dunkel, waehrend
  // das Abschalten des Lichtschattens ihn aufhellte. Es warf also etwas, das
  // nicht auf der Liste stand — und eine selbst getippte Liste ist keine
  // Messung.
  // **Die ganze Szene, nicht nur die Insel.** three zeichnet die Schattenkarte
  // ueber den gesamten Szenengraphen; jedes sichtbare Mesh mit `castShadow`
  // landet darin, egal zu welcher Umgebung es gehoert.
  const werfer = await page.evaluate(() => {
    const z = {};
    window.__app.scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      let sichtbar = o.visible;
      const kette = [];
      for (let e = o; e; e = e.parent) {
        if (e.name) kette.push(e.name);
        if (!e.visible) sichtbar = false;
      }
      if (!sichtbar) return;
      const k = `${o.name || '(ohne Namen)'} [${kette[kette.length - 1] || '?'}]`;
      z[k] = (z[k] || 0) + 1;
    });
    return z;
  });
  process.stdout.write(
    `\nAlle Werfer der Insel: ${Object.entries(werfer).map(([k, v]) => `${k} x${v}`).join(', ')}\n`
  );
  process.stdout.write('\nWerfer einzeln abgeschaltet:\n');
  for (const voll of Object.keys(werfer)) {
    const n = voll.slice(0, voll.lastIndexOf(' ['));
    await page.evaluate((n) => {
      window.__app.scene.traverse((o) => {
        if (o.isMesh && o.name === n) o.castShadow = false;
      });
    }, n);
    await zeige(`ohne Werfer ${n}`);
    await page.evaluate((n) => {
      window.__app.scene.traverse((o) => {
        if (o.isMesh && o.name === n) o.castShadow = true;
      });
    }, n);
  }

  // **Beides im selben Lauf.** Zwei Messungen aus zwei Werkzeugen zu
  // vergleichen ist keine Messung, sondern eine Vermutung ueber zwei Werkzeuge.
  process.stdout.write('\nAlle Werfer gegen den Lichtschalter, im selben Lauf:\n');
  await page.evaluate(() => {
    window.__app.scene.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  });
  await zeige('alle Werfer aus');
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.isDirectionalLight) o.castShadow = false;
    });
  });
  await zeige('+ Licht wirft nicht');
  await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    g.traverse((o) => {
      if (o.isDirectionalLight && o.intensity > 2) o.castShadow = true;
    });
  });
  await zeige('Licht wirft wieder');

  process.stdout.write('\nAufloesung der Schattenkarte:\n');
  for (const w of [1024, 2048]) {
    await stelle(page, 'mapSize', w);
    await zeige(String(w));
  }
} finally {
  await browser.close();
  await server.stop();
}

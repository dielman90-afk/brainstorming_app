import * as THREE from 'three';
import { PANEL_FONT_FAMILY, onFontsReady, forgetFontListener } from './fonts.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of String(text).split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (ctx.measureText(probe).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Zeichnet Text auf eine Canvas-Textur und liefert ein Plane-Mesh dazu.
export function createTextPanel({
  width = 0.32,
  height = 0.18,
  text = '',
  background = '#1e2733',
  color = '#f2f5f8',
  fontSize = 36,
  pxPerMeter = 1600,
  radius = 20,
  // singleLine: Text bleibt einzeilig; die Schrift wird bei Bedarf verkleinert,
  // damit sie in die Breite passt (kein Abschneiden mit „…“).
  singleLine = false,
  weight = 500,
  padding = 44,
  align = 'center', // 'center' | 'left' – links für Eingabefelder
  // Mehrzeiliger Text: lieber kleiner setzen als abschneiden. minFontScale ist
  // die Untergrenze als Anteil der Basisgröße.
  shrinkToFit = true,
  minFontScale = 0.5,

  accent = null, // Farbstreifen am linken Rand (z. B. Kategorie-Farbe)
  border = null, // feiner Rahmen um das Panel
  doubleSided = true, // Rückseiten-Ebene (für rundum lesbare Karten); für
  // UI-Panels am Handgelenk unnötig und vermeidet Transparenz-Sortierprobleme
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * pxPerMeter));
  canvas.height = Math.max(2, Math.round(height * pxPerMeter));
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material);

  // Rückseite: zweite Ebene um 180° um Y gedreht, gleiche Textur. So bleibt der
  // Text von hinten lesbar (nicht gespiegelt) und die Karte ist rundum sichtbar.
  let backMesh = null;
  if (doubleSided) {
    backMesh = new THREE.Mesh(geometry, material);
    backMesh.rotation.y = Math.PI;
    mesh.add(backMesh);
  }

  // renderedFontSize/truncated spiegeln, was zuletzt tatsächlich gezeichnet
  // wurde – für Diagnose und Tests („ist der Text vollständig draufgegangen?").
  const state = {
    text,
    background,
    color,
    accent,
    border,
    fontSize,
    renderedFontSize: fontSize,
    truncated: false,
  };

  const font = (px) => `${weight} ${px}px ${PANEL_FONT_FAMILY}`;

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const r = Math.min(radius, canvas.height / 2);
    if (state.background && state.background !== 'transparent') {
      let fill = state.background;
      // Array = vertikaler Verlauf [oben, unten]
      if (Array.isArray(fill)) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, fill[0]);
        gradient.addColorStop(1, fill[1]);
        fill = gradient;
      }
      ctx.fillStyle = fill;
      roundRect(ctx, 0, 0, canvas.width, canvas.height, r);
      ctx.fill();
      if (state.accent) {
        ctx.save();
        roundRect(ctx, 0, 0, canvas.width, canvas.height, r);
        ctx.clip();
        ctx.fillStyle = state.accent;
        ctx.fillRect(0, 0, 20, canvas.height);
        ctx.restore();
      }
      if (state.border) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = state.border;
        roundRect(ctx, 1.5, 1.5, canvas.width - 3, canvas.height - 3, r);
        ctx.stroke();
      }
    }

    ctx.fillStyle = state.color;
    ctx.textAlign = align === 'left' ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = canvas.width - padding;
    const textX = align === 'left' ? padding / 2 : canvas.width / 2;

    if (singleLine) {
      // Schriftgröße so weit reduzieren, bis der Text in eine Zeile passt
      let fs = state.fontSize;
      ctx.font = font(fs);
      while (fs > 10 && ctx.measureText(state.text).width > maxWidth) {
        fs -= 1;
        ctx.font = font(fs);
      }
      ctx.fillText(state.text, textX, canvas.height / 2 + 1);
      state.renderedFontSize = fs;
      state.truncated = false; // einzeilig wird nur verkleinert, nie gekürzt
      texture.needsUpdate = true;
      return;
    }

    // Passt der Text nicht in die Fläche, wird zuerst die Schrift verkleinert –
    // erst wenn auch das nicht reicht, wird gekürzt. Vorher wurde sofort
    // abgeschnitten: Eine Zusammenfassung („2 bis 3 Sätze") war damit nach rund
    // hundert Zeichen zu Ende und mit „…" nicht mehr zu gebrauchen.
    const fits = (fs) => {
      ctx.font = font(fs);
      const lines = wrapLines(ctx, state.text, maxWidth);
      const maxLines = Math.max(1, Math.floor((canvas.height - 24) / (fs * 1.25)));
      return { lines, maxLines, ok: lines.length <= maxLines };
    };

    let fontPx = state.fontSize;
    let layout = fits(fontPx);
    if (!layout.ok && shrinkToFit) {
      const minPx = Math.max(9, Math.round(state.fontSize * minFontScale));
      // Grobe Schritte zuerst, dann feiner – ein 1-px-Abstieg von 36 auf 16
      // würde bei jedem Neuzeichnen zwanzig Umbruch-Durchläufe kosten.
      for (let fs = fontPx - 2; fs >= minPx; fs -= 2) {
        layout = fits(fs);
        fontPx = fs;
        if (layout.ok) break;
      }
    }

    const lineHeight = fontPx * 1.25;
    let lines = layout.lines;
    state.truncated = lines.length > layout.maxLines;
    if (state.truncated) {
      lines = lines.slice(0, layout.maxLines);
      lines[layout.maxLines - 1] = `${lines[layout.maxLines - 1]} …`;
    }
    state.renderedFontSize = fontPx;
    ctx.font = font(fontPx);
    const y0 = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, textX, y0 + i * lineHeight, maxWidth));
    texture.needsUpdate = true;
  }
  redraw();
  // Nachziehen, sobald die gebündelte Schrift steht (siehe fonts.js)
  onFontsReady(redraw);

  return {
    mesh,
    setText(t) {
      state.text = t;
      redraw();
    },
    // Basis-Schriftgröße in Canvas-Pixeln. Wird für die umschaltbare
    // Kartenschrift genutzt; die Panel-Maße bleiben unverändert.
    setFontSize(px) {
      const next = Math.max(8, Math.round(px));
      if (next === state.fontSize) return;
      state.fontSize = next;
      redraw();
    },
    get fontSize() {
      return state.fontSize;
    },
    // Tatsächlich gezeichnete Größe (nach dem Verkleinern) und ob trotzdem
    // gekürzt werden musste.
    get renderedFontSize() {
      return state.renderedFontSize;
    },
    get truncated() {
      return state.truncated;
    },
    setColors({ background, color: fg, accent: newAccent, border: newBorder } = {}) {
      if (background) state.background = background;
      if (fg) state.color = fg;
      if (newAccent !== undefined) state.accent = newAccent;
      if (newBorder !== undefined) state.border = newBorder;
      redraw();
    },
    dispose() {
      forgetFontListener(redraw);
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}

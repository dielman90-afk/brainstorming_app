import * as THREE from 'three';

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

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
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

  const state = { text, background, color, accent, border };

  const font = (px) => `${weight} ${px}px 'Segoe UI', system-ui, sans-serif`;

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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = canvas.width - padding;

    if (singleLine) {
      // Schriftgröße so weit reduzieren, bis der Text in eine Zeile passt
      let fs = fontSize;
      ctx.font = font(fs);
      while (fs > 10 && ctx.measureText(state.text).width > maxWidth) {
        fs -= 1;
        ctx.font = font(fs);
      }
      ctx.fillText(state.text, canvas.width / 2, canvas.height / 2 + 1);
      texture.needsUpdate = true;
      return;
    }

    ctx.font = font(fontSize);
    const lineHeight = fontSize * 1.25;
    let lines = wrapLines(ctx, state.text, maxWidth);
    const maxLines = Math.max(1, Math.floor((canvas.height - 24) / lineHeight));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = `${lines[maxLines - 1]} …`;
    }
    const y0 = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, y0 + i * lineHeight, maxWidth));
    texture.needsUpdate = true;
  }
  redraw();

  return {
    mesh,
    setText(t) {
      state.text = t;
      redraw();
    },
    setColors({ background, color: fg, accent: newAccent, border: newBorder } = {}) {
      if (background) state.background = background;
      if (fg) state.color = fg;
      if (newAccent !== undefined) state.accent = newAccent;
      if (newBorder !== undefined) state.border = newBorder;
      redraw();
    },
    dispose() {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}

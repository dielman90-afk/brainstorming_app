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
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * pxPerMeter));
  canvas.height = Math.max(2, Math.round(height * pxPerMeter));
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

  const state = { text, background, color };

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = state.background;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, Math.min(radius, canvas.height / 2));
    ctx.fill();

    ctx.fillStyle = state.color;
    ctx.font = `500 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = canvas.width - 44;
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
    setColors({ background, color: fg } = {}) {
      if (background) state.background = background;
      if (fg) state.color = fg;
      redraw();
    },
    dispose() {
      texture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}

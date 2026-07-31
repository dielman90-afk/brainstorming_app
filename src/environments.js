import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Fünf umschaltbare VR-Umgebungen, komplett prozedural (keine externen Assets):
//   🏝 Himmelsinsel – Low-Poly-Insel mit Bäumen, Fluss/Wasserfall und Wolken
//   🌌 Nachthimmel  – Sternenfeld, Mond und rötlicher Mars-Untergrund
//   🪷 Zen-Garten   – ruhige Kies-/Steinlandschaft
//   🌐 Studio       – die schlichte helle Gradient-Umgebung
//   ⬜ Konstrukt    – nahtloser, komplett weißer Void („Matrix"-Ladeprogramm)
// Jede Umgebung: { id, name, background, group, update?(time) }
// Keine Umgebung besitzt ein Boden-Raster.

// Deterministisches Rauschen auf Positionsbasis – Nahtvertices (gleiche Position)
// verschieben sich identisch, es entstehen keine Risse im Mesh.
function hashNoise(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Himmelskuppel mit vertikalem Farbverlauf (von innen sichtbar)
function makeDome(topColor, horizonColor, bottomColor = horizonColor, radius = 44) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      horizonColor: { value: new THREE.Color(horizonColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, pow(h, 0.8))
          : mix(horizonColor, bottomColor, pow(-h, 0.8));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), material);
  dome.renderOrder = -1; // zuerst zeichnen, damit Sterne/Sprites darüber liegen
  return dome;
}

function makeGlowTexture(inner, mid = inner, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Gefälschter Kontaktschatten (Blob-Shadow) statt teurer Shadow-Maps ---
// Eine geteilte dunkle Radial-Textur + geteilte Plane-Geometrie erden Objekte
// nahezu kostenlos. Nur Skalierung/Position pro Instanz.
let _shadowTexture = null;
function shadowTexture() {
  if (_shadowTexture) return _shadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.24)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _shadowTexture = new THREE.CanvasTexture(canvas);
  _shadowTexture.colorSpace = THREE.SRGBColorSpace;
  return _shadowTexture;
}
const _shadowGeo = new THREE.PlaneGeometry(1, 1);
function makeBlobShadow(radius = 0.5, opacity = 1, y = 0.012) {
  const mesh = new THREE.Mesh(
    _shadowGeo,
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.position.y = y;
  mesh.renderOrder = 1; // knapp über dem opaken Boden
  return mesh;
}

// Weiche Vertex-Färbung (gebackenes AO / Mottling) auf eine Geometrie legen.
// tint(x,y,z) → Faktor (multipliziert die Materialfarbe pro Vertex).
function bakeVertexShade(geometry, tint) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = tint(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Vertices bunt einfärben (feste Farbe) – für zusammengesetzte Geometrien (Pilze).
function paintVertices(geometry, hex) {
  const c = new THREE.Color(hex);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Vertices radial verschieben (organische Kanten). smooth=true behält die
// Indizierung, damit die Wandflächen glatt statt facettiert schattiert werden.
function displaceRadial(geometry, amount, yAmount = 0, smooth = false) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const n = 1 + (hashNoise(x, y, z) - 0.5) * amount;
    pos.setX(i, x * n);
    pos.setZ(i, z * n);
    if (yAmount) pos.setY(i, y + (hashNoise(z, x, y) - 0.5) * yAmount);
  }
  if (smooth) {
    geometry.computeVertexNormals();
    return geometry;
  }
  const nonIndexed = geometry.toNonIndexed();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

function makeTree(rand) {
  const tree = new THREE.Group();
  const trunkHeight = 0.5 + rand() * 0.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, trunkHeight, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9, metalness: 0 })
  );
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  const foliageColor = rand() > 0.5 ? 0x3e8e4f : 0x57ab68;
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.85,
    metalness: 0,
  });
  if (rand() > 0.45) {
    // Nadelbaum: gestapelte, glatt schattierte Kegel
    const layers = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < layers; i++) {
      const radius = 0.45 - i * 0.12;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, 0.6, 14), foliageMaterial);
      cone.position.y = trunkHeight + 0.15 + i * 0.32;
      tree.add(cone);
    }
  } else {
    // Laubbaum: weiche, runde Krone aus zwei Icosaeder-Blobs (detail 1 = glatter)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), foliageMaterial);
    crown.position.y = trunkHeight + 0.26;
    crown.scale.y = 0.88;
    tree.add(crown);
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), foliageMaterial);
    blob.position.set(0.2 * (rand() > 0.5 ? 1 : -1), trunkHeight + 0.4, 0.12);
    tree.add(blob);
  }
  return tree;
}

// Blumen und Grasbüschel auf der Hauptinsel (InstancedMesh = 2 Draw-Calls)
function addGrassDecoration(group, rand, radius) {
  const flowerColors = [0xfff3b0, 0xffb3c1, 0xcdb4f6, 0xf8f9fa, 0xffd166];
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.025, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, emissiveIntensity: 0.2 }),
    54
  );
  flowers.name = 'flowers';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < flowers.count; i++) {
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.2 + rand() * 0.72);
    dummy.position.set(Math.sin(angle) * r, 0.02, Math.cos(angle) * r);
    dummy.scale.setScalar(0.8 + rand() * 0.7);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, color.setHex(flowerColors[Math.floor(rand() * flowerColors.length)]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);

  const tufts = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.024, 0.09, 6),
    new THREE.MeshStandardMaterial({ color: 0x4c9a4a, roughness: 0.9, metalness: 0 }),
    70
  );
  tufts.name = 'tufts';
  for (let i = 0; i < tufts.count; i++) {
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.15 + rand() * 0.78);
    dummy.position.set(Math.sin(angle) * r, 0.045, Math.cos(angle) * r);
    dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    dummy.scale.setScalar(0.8 + rand() * 0.8);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);
}

// Sanft animiertes Wasser: hellblaue Fläche mit fließenden Strähnen (Canvas-Textur,
// deren V-Offset über die Zeit scrollt).
function makeWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#8fd2f0');
  bg.addColorStop(1, '#5fb6e6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 64, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const x = 6 + Math.random() * 52;
    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    for (let y = -10; y < 270; y += 20) {
      ctx.lineTo(x + Math.sin(y * 0.08) * 4, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Kleiner Fluss von der Inselmitte zur Kante + Wasserfall über den Rand.
// Ursprung: eine Quelle in der Mitte, aus der ein schmaler Bach zur Klippe läuft
// und dort als Partikelstrom in die Tiefe stürzt.
function makeWaterfall(rand, islandRadius) {
  const group = new THREE.Group();
  group.name = 'waterfall';
  const angle = 2.1;
  const edgeX = Math.sin(angle) * (islandRadius - 0.5);
  const edgeZ = Math.cos(angle) * (islandRadius - 0.5);
  const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));

  const waterTex = makeWaterTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  });

  // --- Quelle in der Inselmitte ---
  const spring = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), waterMat);
  spring.rotation.x = -Math.PI / 2;
  spring.position.set(0.1, 0.02, 0.2);
  group.add(spring);
  // Kleiner Steinkranz um die Quelle
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1, metalness: 0 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + rand() * 0.05, 0), ringMat);
    stone.position.set(0.1 + Math.cos(a) * 0.34, 0.03, 0.2 + Math.sin(a) * 0.34);
    stone.rotation.set(rand(), rand(), rand());
    group.add(stone);
  }

  // --- Flussbett als Band entlang einer weichen Kurve (Mitte → Klippe) ---
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1, 0.02, 0.2),
    new THREE.Vector3(edgeX * 0.35 + 0.3, 0.02, edgeZ * 0.35 - 0.2),
    new THREE.Vector3(edgeX * 0.7 - 0.2, 0.02, edgeZ * 0.7 + 0.3),
    new THREE.Vector3(edgeX, 0.02, edgeZ),
  ]);
  const SEG = 60;
  const up = new THREE.Vector3(0, 1, 0);
  const riverPos = [];
  const riverUv = [];
  const riverIdx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const halfW = 0.14 + t * 0.34; // schmal an der Quelle, breiter zur Klippe
    riverPos.push(
      p.x - side.x * halfW, 0.022, p.z - side.z * halfW,
      p.x + side.x * halfW, 0.022, p.z + side.z * halfW
    );
    const v = t * 8;
    riverUv.push(0, v, 1, v);
    if (i < SEG) {
      const a = i * 2;
      riverIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPos, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUv, 2));
  riverGeo.setIndex(riverIdx);
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(riverGeo, waterMat);
  group.add(river);

  // --- Auffangbecken an der Kante, kurz bevor das Wasser stürzt ---
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), waterMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(edgeX, 0.02, edgeZ);
  pond.scale.x = 1.4;
  group.add(pond);

  // --- Sturz: Partikelstrom über die Klippe ---
  const count = 150;
  const fallLength = 6;
  const positions = new Float32Array(count * 3);
  const meta = [];
  for (let i = 0; i < count; i++) {
    meta.push({
      speed: 1.7 + rand() * 0.9,
      offset: rand() * fallLength,
      side: (rand() - 0.5) * 0.7,
      jitter: (rand() - 0.5) * 0.1,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const drops = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xdff2fc,
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  drops.frustumCulled = false;
  group.add(drops);

  // Feiner Sprühnebel am Fuß des Wasserfalls
  const mist = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.5)', 'rgba(220,240,255,0.2)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  const outX = Math.sin(angle) * (islandRadius + 0.15);
  const outZ = Math.cos(angle) * (islandRadius + 0.15);
  mist.position.set(outX, -1.2, outZ);
  mist.scale.set(2.4, 2.4, 1);
  group.add(mist);

  // Schaum an der Abbruchkante (pulsierendes weiches Glühen)
  const foam = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(235,248,255,0.5)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
      fog: false,
    })
  );
  foam.position.set(edgeX, 0.03, edgeZ);
  foam.scale.set(1.3, 0.5, 1);
  group.add(foam);

  // Regenbogen im Sprühnebel: halber Ring, radial über Vertex-Farben eingefärbt
  const rainbowGeo = new THREE.RingGeometry(1.0, 1.42, 48, 6, 0, Math.PI);
  const rp = rainbowGeo.attributes.position;
  const rColors = new Float32Array(rp.count * 3);
  const rc = new THREE.Color();
  for (let i = 0; i < rp.count; i++) {
    const rr = Math.hypot(rp.getX(i), rp.getY(i));
    const t = THREE.MathUtils.clamp((rr - 1.0) / 0.42, 0, 1); // innen 0 … außen 1
    rc.setHSL((270 * (1 - t)) / 360, 0.9, 0.6); // violett innen → rot außen
    rColors[i * 3] = rc.r;
    rColors[i * 3 + 1] = rc.g;
    rColors[i * 3 + 2] = rc.b;
  }
  rainbowGeo.setAttribute('color', new THREE.BufferAttribute(rColors, 3));
  const rainbow = new THREE.Mesh(
    rainbowGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  rainbow.position.set(outX, -1.4, outZ);
  rainbow.lookAt(0, -0.4, 0); // zum Inselzentrum ausrichten
  group.add(rainbow);

  return {
    group,
    update(time) {
      waterTex.offset.y = -time * 0.35;
      foam.material.opacity = 0.65 + Math.sin(time * 4) * 0.2;
      rainbow.material.opacity = 0.38 + Math.sin(time * 0.7) * 0.08;
      const pos = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const m = meta[i];
        const fall = (m.offset + time * m.speed) % fallLength;
        pos.setXYZ(
          i,
          outX + tangent.x * m.side + m.jitter * Math.sin(time * 3 + i),
          -0.05 - fall,
          outZ + tangent.z * m.side + m.jitter * Math.cos(time * 3 + i)
        );
      }
      pos.needsUpdate = true;
      mist.material.opacity = 0.45 + Math.sin(time * 2) * 0.1;
    },
  };
}

// Vögel: einfache Zwei-Flügel-Silhouetten, die in der Ferne kreisen
function makeBirds(rand) {
  const group = new THREE.Group();
  group.name = 'birds';
  const material = new THREE.MeshBasicMaterial({ color: 0x33404d, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Group();
    const wings = [];
    for (const dir of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.09), material);
      wing.position.x = dir * 0.13;
      wing.rotation.x = -Math.PI / 2;
      pivot.add(wing);
      bird.add(pivot);
      wings.push({ pivot, dir });
    }
    bird.userData = {
      radius: 8 + rand() * 8,
      height: 3.5 + rand() * 3.5,
      speed: (0.12 + rand() * 0.1) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      wings,
    };
    group.add(bird);
    birds.push(bird);
  }
  return {
    group,
    update(time) {
      for (const bird of birds) {
        const d = bird.userData;
        const a = time * d.speed + d.phase;
        bird.position.set(
          Math.sin(a) * d.radius,
          d.height + Math.sin(time * 1.3 + d.phase) * 0.35,
          Math.cos(a) * d.radius
        );
        bird.rotation.y = a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        const flap = Math.sin(time * 9 + d.phase) * 0.55;
        for (const { pivot, dir } of d.wings) pivot.rotation.z = flap * dir;
      }
    },
  };
}

// Bunte Schmetterlinge, die nah über der Insel gaukeln (Vögel-Muster, kleiner
// und schneller flatternd).
function makeButterflies(rand) {
  const group = new THREE.Group();
  group.name = 'butterflies';
  const colors = [0xff7aa2, 0xffd166, 0x8ec7ff, 0xc4a2ff, 0xff9e6b];
  const items = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const wings = [];
    for (const dir of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), mat);
      wing.position.x = dir * 0.05;
      wing.rotation.x = -Math.PI / 2;
      wing.scale.set(0.8, 1, 1.25);
      pivot.add(wing);
      b.add(pivot);
      wings.push({ pivot, dir });
    }
    b.userData = {
      radius: 2 + rand() * 4,
      height: 0.7 + rand() * 1.6,
      speed: (0.3 + rand() * 0.3) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      bob: rand() * Math.PI * 2,
      wings,
    };
    group.add(b);
    items.push(b);
  }
  return {
    group,
    update(time) {
      for (const b of items) {
        const d = b.userData;
        const a = time * d.speed + d.phase;
        b.position.set(
          Math.sin(a) * d.radius,
          d.height + Math.sin(time * 1.6 + d.bob) * 0.5,
          Math.cos(a) * d.radius
        );
        b.rotation.y = a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        const flap = Math.sin(time * 14 + d.phase) * 0.9 + 0.35;
        for (const { pivot, dir } of d.wings) pivot.rotation.z = flap * dir;
      }
    },
  };
}

// Volumetrisch wirkende Wolke: Cluster weicher Kugeln zu EINEM Mesh verschmolzen.
// Als echtes 3D-Objekt (kein Billboard-Sprite) dreht sie sich NICHT mit der
// Kopfbewegung – sie bleibt fest im Raum stehen.
const CLOUD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
  flatShading: false,
});

function makeCloud(rand, size = 1) {
  const geos = [];
  const puffs = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const s = (0.7 + rand() * 1.0) * size;
    const g = new THREE.SphereGeometry(s, 12, 10);
    g.translate(
      (rand() - 0.5) * 3.4 * size,
      (rand() - 0.5) * 0.7 * size,
      (rand() - 0.5) * 1.8 * size
    );
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  const cloud = new THREE.Mesh(merged, CLOUD_MATERIAL);
  cloud.scale.y = 0.62; // flach drücken → Wolkenform
  return cloud;
}

// Hängende Ranken/Wurzeln unter dem Inselrand, zu EINEM Mesh verschmolzen.
function makeVines(rand, radius, count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const rr = radius * (0.72 + rand() * 0.22);
    const len = 0.7 + rand() * 1.8;
    const g = new THREE.CylinderGeometry(0.012, 0.05, len, 5, 1);
    g.translate(0, -len / 2, 0); // oben am Rand, hängt nach unten
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ((rand() - 0.5) * 0.4));
    g.translate(Math.cos(a) * rr, -0.34, Math.sin(a) * rr);
    geos.push(g);
    // kleiner Blattknubbel am Ende
    if (rand() > 0.4) {
      const leaf = new THREE.IcosahedronGeometry(0.06 + rand() * 0.05, 0);
      leaf.translate(Math.cos(a) * rr, -0.34 - len, Math.sin(a) * rr);
      geos.push(leaf);
    }
  }
  // Cylinder ist indiziert, Icosaeder nicht → vor dem Merge vereinheitlichen
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  return new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0x4e6b3a, roughness: 1, metalness: 0 }));
}

// Schwebende Insel: Grasplatte mit Erdrand + felsige, zerklüftete Unterseite
function buildIsland(rand, { radius = 5, depth = 4, trees = 3, rocks = 4, vines = 9 } = {}) {
  const island = new THREE.Group();

  // Grasfläche + Erdrand glatt schattiert (smooth=true) → weniger facettiert.
  // Gebackenes Vertex-Shading: Rand/Unterseite dezent dunkler + leichtes Mottling.
  const capGeometry = bakeVertexShade(
    displaceRadial(new THREE.CylinderGeometry(radius, radius * 0.94, 0.32, 48, 1), 0.08, 0, true),
    (x, y, z) => {
      const edge = Math.min(1, Math.hypot(x, z) / radius); // 0 Mitte … 1 Rand
      const low = y < 0 ? 0.82 : 1; // Erdrand unten leicht abdunkeln
      const mott = 0.94 + hashNoise(x * 3, y, z * 3) * 0.12;
      return Math.min(1.05, (1 - edge * 0.12) * low * mott);
    }
  );
  const capMat = (color, rough = 1) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, vertexColors: true });
  const cap = new THREE.Mesh(capGeometry, [
    capMat(0x8a6844), // Erdrand
    capMat(0x6cbb5c, 0.95), // Gras
    capMat(0x6b4f34), // Unterseite
  ]);
  cap.position.y = -0.18; // Grasfläche liegt bei y ≈ -0.02
  island.add(cap);

  // Fels-Unterseite mit gebackenem AO (dunkler zur Spitze) für mehr Tiefe
  const rockGeometry = bakeVertexShade(
    displaceRadial(new THREE.ConeGeometry(radius * 0.92, depth, 32, 6), 0.3, 0.25),
    (x, y) => 0.7 + ((y + depth / 2) / depth) * 0.4 // Basis heller, Spitze dunkler
  );
  const rock = new THREE.Mesh(
    rockGeometry,
    new THREE.MeshStandardMaterial({ color: 0x7d6f5c, roughness: 1, metalness: 0, flatShading: true, vertexColors: true })
  );
  rock.rotation.x = Math.PI; // Spitze nach unten
  rock.position.y = -0.3 - depth / 2;
  island.add(rock);

  island.add(makeVines(rand, radius, vines));

  for (let i = 0; i < trees; i++) {
    const tree = makeTree(rand);
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.55 + rand() * 0.3);
    const tx = Math.sin(angle) * r;
    const tz = Math.cos(angle) * r;
    tree.position.set(tx, -0.02, tz);
    tree.rotation.y = rand() * Math.PI * 2;
    island.add(tree);
    const shadow = makeBlobShadow(0.45, 0.6, -0.005);
    shadow.position.set(tx, -0.005, tz);
    island.add(shadow);
  }

  for (let i = 0; i < rocks; i++) {
    const s = 0.12 + rand() * 0.2;
    const stone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 1, metalness: 0, flatShading: true })
    );
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.5 + rand() * 0.4);
    const sx = Math.sin(angle) * r;
    const sz = Math.cos(angle) * r;
    stone.position.set(sx, 0.03, sz);
    stone.scale.y = 0.6 + rand() * 0.5;
    stone.rotation.set(rand(), rand(), rand());
    island.add(stone);
    const shadow = makeBlobShadow(s * 1.6, 0.5, -0.005);
    shadow.position.set(sx, -0.005, sz);
    island.add(shadow);
  }

  return island;
}

// Unterwuchs: instanzierte Büsche + Pilze (wenige Draw-Calls) auf der Hauptinsel.
function addUndergrowth(group, rand, radius) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const bushColors = [0x4f9a4a, 0x3e8e4f, 0x5fb069, 0x6cbb5c];
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.16, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: false }),
    10
  );
  bushes.name = 'bushes';
  for (let i = 0; i < bushes.count; i++) {
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.25 + rand() * 0.72);
    dummy.position.set(Math.sin(angle) * r, 0.02, Math.cos(angle) * r);
    dummy.scale.set(0.7 + rand() * 0.9, 0.55 + rand() * 0.5, 0.7 + rand() * 0.9);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    bushes.setColorAt(i, color.setHex(bushColors[Math.floor(rand() * bushColors.length)]));
  }
  bushes.instanceMatrix.needsUpdate = true;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  group.add(bushes);

  // Pilz: verschmolzene Geometrie mit Vertex-Farben (weißer Stiel, roter Hut)
  const stem = new THREE.CylinderGeometry(0.02, 0.028, 0.09, 6);
  stem.translate(0, 0.045, 0);
  paintVertices(stem, 0xf1ebde);
  const cap = new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.7, 1);
  cap.translate(0, 0.09, 0);
  paintVertices(cap, 0xd7402f);
  const mushGeo = mergeGeometries([stem, cap]);
  const mushrooms = new THREE.InstancedMesh(
    mushGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true }),
    6
  );
  mushrooms.name = 'mushrooms';
  for (let i = 0; i < mushrooms.count; i++) {
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.2 + rand() * 0.75);
    dummy.position.set(Math.sin(angle) * r, 0.0, Math.cos(angle) * r);
    dummy.scale.setScalar(0.7 + rand() * 0.8);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    mushrooms.setMatrixAt(i, dummy.matrix);
  }
  mushrooms.instanceMatrix.needsUpdate = true;
  group.add(mushrooms);
}

function createIslandEnvironment() {
  const rand = mulberry32(20260718);
  const group = new THREE.Group();
  group.name = 'env-island';

  group.add(makeDome(0x3f83c9, 0xdceff7, 0xcfe8f7));

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,250,225,1)', 'rgba(255,238,180,0.55)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  sun.position.set(18, 24, -24);
  sun.scale.set(11, 11, 1);
  group.add(sun);

  group.add(new THREE.HemisphereLight(0xdcefff, 0x8f9b7a, 1.15));
  const sunlight = new THREE.DirectionalLight(0xfff2d9, 1.9);
  sunlight.position.set(10, 18, -8);
  group.add(sunlight);
  // Sanftes Fülllicht von unten, damit Wolken- und Inselunterseiten nicht absaufen
  const fill = new THREE.DirectionalLight(0xbfd4e8, 0.35);
  fill.position.set(-6, -10, 4);
  group.add(fill);

  // Warmes Rim-/Backlight zum Abheben der Silhouetten (billiger Realismus-Boost)
  const rim = new THREE.DirectionalLight(0xfff0d6, 0.5);
  rim.position.set(-14, 8, 18);
  group.add(rim);

  // Weiche Horizont-Dunstschicht für Tiefe
  const haze = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(226,240,250,0.55)', 'rgba(210,230,245,0.22)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
      fog: false,
    })
  );
  haze.position.set(0, 3, -30);
  haze.scale.set(90, 22, 1);
  group.add(haze);

  // Hauptinsel, auf der der Nutzer steht – mit Blumen, Gras, Fluss und Wasserfall
  group.add(buildIsland(rand, { radius: 5, depth: 4.5, trees: 3, rocks: 5, vines: 11 }));
  addGrassDecoration(group, rand, 4.4);
  addUndergrowth(group, rand, 4.4);
  const waterfall = makeWaterfall(rand, 5);
  group.add(waterfall.group);
  const birds = makeBirds(rand);
  group.add(birds.group);
  const butterflies = makeButterflies(rand);
  group.add(butterflies.group);

  // Entfernte Mini-Inseln, die sanft auf und ab schweben
  const minis = [];
  const miniConfigs = [
    { angle: 0.6, dist: 14, y: -1.5, scale: 0.35 },
    { angle: 2.4, dist: 19, y: 2.0, scale: 0.5 },
    { angle: 3.9, dist: 23, y: -3.0, scale: 0.65 },
    { angle: 5.2, dist: 16, y: 3.5, scale: 0.3 },
    { angle: 1.5, dist: 26, y: -5.5, scale: 0.55 },
  ];
  miniConfigs.forEach((cfg, i) => {
    const mini = buildIsland(rand, { radius: 5, depth: 4, trees: 2, rocks: 2 });
    mini.scale.setScalar(cfg.scale);
    mini.position.set(Math.sin(cfg.angle) * cfg.dist, cfg.y, Math.cos(cfg.angle) * cfg.dist);
    mini.userData.baseY = cfg.y;
    mini.userData.phase = i * 1.7;
    group.add(mini);
    minis.push(mini);
  });

  // Wolken in mehreren Höhenschichten – auch UNTER den Inseln sichtbar.
  const clouds = [];
  const cloudLayers = [
    { count: 9, yMin: 5, yMax: 13, rMin: 15, rMax: 36, size: 1.2 }, // hoch am Himmel
    { count: 7, yMin: -2, yMax: 3.5, rMin: 16, rMax: 32, size: 1.0 }, // auf Augenhöhe
    { count: 9, yMin: -13, yMax: -4, rMin: 8, rMax: 28, size: 1.35 }, // tief unter den Inseln
  ];
  for (const layer of cloudLayers) {
    for (let i = 0; i < layer.count; i++) {
      const cloud = makeCloud(rand, layer.size);
      const a = rand() * Math.PI * 2;
      const r = layer.rMin + rand() * (layer.rMax - layer.rMin);
      const y = layer.yMin + rand() * (layer.yMax - layer.yMin);
      cloud.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      cloud.rotation.y = rand() * Math.PI * 2;
      cloud.userData.baseX = cloud.position.x;
      cloud.userData.baseZ = cloud.position.z;
      cloud.userData.speed = 0.1 + rand() * 0.22;
      cloud.userData.range = 26;
      clouds.push(cloud);
      group.add(cloud);
    }
  }

  // Leichter Tiefennebel (fern), damit ferne Inseln/Wolken sanft ausblenden –
  // Karten in Reichweite (< 12 m) bleiben unberührt.
  const fog = new THREE.Fog(0xcfe4f2, 18, 46);

  return {
    id: 'island',
    name: '🏝 Himmelsinsel',
    background: new THREE.Color(0x9cc9e8),
    fog,
    group,
    update(time) {
      for (const mini of minis) {
        mini.position.y = mini.userData.baseY + Math.sin(time * 0.4 + mini.userData.phase) * 0.5;
      }
      for (const cloud of clouds) {
        const range = cloud.userData.range;
        const x = cloud.userData.baseX + time * cloud.userData.speed;
        cloud.position.x = ((x + range) % (range * 2) + range * 2) % (range * 2) - range;
      }
      waterfall.update(time);
      birds.update(time);
      butterflies.update(time);
    },
  };
}

// --- Wertrauschen (value noise) + fBm für natürliches, weiches Gelände ---
function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
function valueNoise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const tl = hashNoise(xi, zi, 0);
  const tr = hashNoise(xi + 1, zi, 0);
  const bl = hashNoise(xi, zi + 1, 0);
  const br = hashNoise(xi + 1, zi + 1, 0);
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v;
}
function fbm2(x, z) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += (valueNoise2(x * freq, z * freq) - 0.5) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}
// Kraterprofil (t = Abstand/Radius): Mulde innen, angehobener Wall am Rand.
function craterProfile(t) {
  if (t < 0.82) return -(1 - (t / 0.82) ** 2); // Schüssel: -1 … 0
  if (t < 1.14) return 0.32 * Math.sin((Math.PI * (t - 0.82)) / 0.32); // Randwall
  return 0;
}

// Natürlicher, rötlicher Mars-Untergrund: sanft gewelltes Gelände mit
// Einschlagkratern, verstreuten Felsen und weichen Hügeln am Horizont.
// Keine kastenförmigen Strukturen, kein Raster.
function makeMarsGround(rand) {
  const group = new THREE.Group();

  const craters = [
    { x: 9, z: -7, r: 3.0, depth: 0.9 },
    { x: -11, z: 5, r: 4.2, depth: 1.15 },
    { x: 5.5, z: 12, r: 2.4, depth: 0.7 },
    { x: -6, z: -13, r: 3.4, depth: 0.9 },
    { x: 15, z: 9, r: 5.0, depth: 1.3 },
  ];

  const heightAt = (x, z) => {
    const big = fbm2(x * 0.05, z * 0.05) * 3.2; // weite, rollende Dünen
    const med = fbm2(x * 0.16, z * 0.16) * 0.9; // mittlere Wellen
    const fine = (hashNoise(x * 1.7, z * 1.7, 7) - 0.5) * 0.12; // Körnung
    let h = big + med + fine;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.2) h += craterProfile(d / c.r) * c.depth;
    }
    // Zentrum flach halten, damit man eben steht
    return h * smoothstep(0.6, 4.5, Math.hypot(x, z));
  };

  // Dichtes Gitter (nicht CircleGeometry – die hat keine inneren Vertices)
  const SIZE = 96;
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x9c4a2b);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i); // PlaneGeometry: y ist die zweite Ebenenachse
    const h = heightAt(x, z);
    pos.setZ(i, h);
    // Leichte Farbmodulation: Höhen heller (Staub), Mulden dunkler
    const shade = 0.82 + smoothstep(-2, 3, h) * 0.4 + (hashNoise(x * 2.1, z * 2.1, 9) - 0.5) * 0.12;
    col.copy(base).multiplyScalar(shade);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  group.add(ground);

  // Verstreute Felsbrocken (mehr Facetten = Stein statt Kristall, flach gelagert)
  const rockColors = [0x843d24, 0x6f331f, 0x5a281a, 0x92472b];
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.5 + rand() * 16;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const s = 0.14 + rand() * 0.42;
    const geoR = new THREE.IcosahedronGeometry(s, 1);
    // Unregelmäßig verschieben, damit es kein glatter Edelstein ist
    const rp = geoR.attributes.position;
    for (let v = 0; v < rp.count; v++) {
      const f = 0.78 + hashNoise(rp.getX(v) * 40, rp.getY(v) * 40, rp.getZ(v) * 40 + i) * 0.44;
      rp.setXYZ(v, rp.getX(v) * f, rp.getY(v) * f, rp.getZ(v) * f);
    }
    geoR.computeVertexNormals();
    const rock = new THREE.Mesh(
      geoR,
      new THREE.MeshStandardMaterial({
        color: rockColors[Math.floor(rand() * rockColors.length)],
        roughness: 1,
        metalness: 0,
        flatShading: true,
      })
    );
    rock.position.set(bx, heightAt(bx, bz) - 0.03 + s * 0.25, bz);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.set(1 + rand() * 0.5, 0.45 + rand() * 0.4, 1 + rand() * 0.5);
    group.add(rock);
  }

  // Weiche, natürliche Hügel am Horizont (teilweise „vergrabene" Kuppeln) –
  // ersetzt die alten kastenförmigen Tafelberge.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x7a3820, roughness: 1, metalness: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.6;
    const r = 26 + rand() * 12;
    const R = 5 + rand() * 6;
    const hGeo = new THREE.SphereGeometry(R, 20, 14);
    const hp = hGeo.attributes.position;
    for (let v = 0; v < hp.count; v++) {
      const f = 1 + (valueNoise2(hp.getX(v) * 0.3 + i * 10, hp.getZ(v) * 0.3) - 0.5) * 0.5;
      hp.setXYZ(v, hp.getX(v) * f, hp.getY(v), hp.getZ(v) * f);
    }
    hGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hGeo, hillMat);
    const flat = 0.28 + rand() * 0.16;
    hill.scale.y = flat;
    // So weit eingraben, dass nur eine sanfte Kuppe herausschaut
    hill.position.set(Math.cos(a) * r, -R * flat * 0.62, Math.sin(a) * r);
    group.add(hill);
  }

  return group;
}

function createNightEnvironment() {
  const rand = mulberry32(42424242);
  const group = new THREE.Group();
  group.name = 'env-night';

  // Nachthimmel mit rötlich getöntem Mars-Horizont
  group.add(makeDome(0x0b1533, 0x2a1512, 0x160a08));

  const starTexture = makeGlowTexture('rgba(255,255,255,1)', 'rgba(210,225,255,0.6)', 64);
  const starsGroup = new THREE.Group();
  const shells = [
    { count: 1300, size: 0.28, opacity: 0.75 },
    { count: 200, size: 0.55, opacity: 1 },
  ];
  for (const shell of shells) {
    const positions = new Float32Array(shell.count * 3);
    for (let i = 0; i < shell.count; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const r = 38 + rand() * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = s * Math.cos(phi) * r;
      positions[i * 3 + 1] = Math.max(0.05 * r, Math.abs(u) * r);
      positions[i * 3 + 2] = s * Math.sin(phi) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: starTexture,
        size: shell.size,
        transparent: true,
        opacity: shell.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      })
    );
    starsGroup.add(stars);
  }
  group.add(starsGroup);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 32, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false })
  );
  moon.position.set(14, 16, -24);
  group.add(moon);
  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(220,232,255,0.9)', 'rgba(180,200,255,0.35)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  moonGlow.position.copy(moon.position);
  moonGlow.scale.set(8, 8, 1);
  group.add(moonGlow);

  // Beleuchtung, damit der Mars-Untergrund plastisch (rötlich) erscheint
  group.add(new THREE.HemisphereLight(0x3a4a72, 0x2a120a, 0.7));
  const moonLight = new THREE.DirectionalLight(0xcdd9ff, 0.7);
  moonLight.position.copy(moon.position);
  group.add(moonLight);
  // Warmes, sehr schwaches Bodenlicht für die typische Marsröte
  const groundGlow = new THREE.DirectionalLight(0xff7a4d, 0.25);
  groundGlow.position.set(-8, 3, 6);
  group.add(groundGlow);

  group.add(makeMarsGround(rand));

  return {
    id: 'night',
    name: '🌌 Nachthimmel',
    background: new THREE.Color(0x0a0605),
    fog: new THREE.Fog(0x1c0d09, 22, 48),
    group,
    update(time) {
      starsGroup.rotation.y = time * 0.004;
    },
  };
}

// --- Zen-Garten ---

// Sandfläche mit weichen, geharkten Wellenlinien (konzentrisch, organisch – kein Raster)
function makeSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#e7d4b0');
  g.addColorStop(1, '#dcc59c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  // körnung
  ctx.fillStyle = 'rgba(150,120,80,0.05)';
  for (let i = 0; i < 2600; i++) {
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // konzentrische Harkspuren um mehrere Zentren
  ctx.strokeStyle = 'rgba(180,150,110,0.5)';
  ctx.lineWidth = 2.5;
  const centers = [
    [512, 512], [250, 300], [780, 700], [720, 260],
  ];
  for (const [cx, cy] of centers) {
    for (let r = 22; r < 220; r += 22) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeZenStone(rand, size, color = 0x8b8680) {
  const geo = new THREE.IcosahedronGeometry(size, 1);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const f = 0.82 + hashNoise(pos.getX(v) * 30, pos.getY(v) * 30, pos.getZ(v) * 30) * 0.36;
    pos.setXYZ(v, pos.getX(v) * f, pos.getY(v) * f, pos.getZ(v) * f);
  }
  geo.computeVertexNormals();
  const stone = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true })
  );
  stone.scale.y = 0.55 + rand() * 0.3;
  stone.rotation.set(rand(), rand() * Math.PI * 2, rand());
  return stone;
}

// Steinlaterne (Ishidōrō): gestapelte Steinelemente mit warmem Glimmen
function makeLantern() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 1, metalness: 0 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 8), stoneMat);
  base.position.y = 0.06;
  group.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 8), stoneMat);
  post.position.y = 0.33;
  group.add(post);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.06, 8), stoneMat);
  platform.position.y = 0.57;
  group.add(platform);
  // Lichtkasten mit warmem Glimmen
  const box = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xff9e3d, emissiveIntensity: 0.9, roughness: 0.7 })
  );
  box.position.y = 0.69;
  group.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 6), stoneMat);
  roof.position.y = 0.86;
  group.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), stoneMat);
  finial.position.y = 0.96;
  group.add(finial);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,200,120,0.9)', 'rgba(255,150,60,0.35)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  glow.position.y = 0.69;
  glow.scale.set(1.2, 1.2, 1);
  group.add(glow);
  return group;
}

// Torii-Tor als ruhiger Landmark am Rand
function makeTorii() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb23a1f, roughness: 0.85, metalness: 0 });
  const h = 3.2;
  const span = 2.4;
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 12), mat);
    pillar.position.set(sx * span * 0.5, h / 2, 0);
    group.add(pillar);
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.1, 0.3, 0.42), mat);
  topBeam.position.y = h - 0.05;
  topBeam.rotation.z = 0.02;
  group.add(topBeam);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 0.2, 0.22, 0.34), mat);
  lintel.position.y = h - 0.6;
  group.add(lintel);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.3), mat);
  ridge.position.y = h - 0.32;
  group.add(ridge);
  return group;
}

// Bambushalm (segmentierter Stiel + wenige Blätter), zu 1 Mesh verschmolzen.
const BAMBOO_MAT = new THREE.MeshStandardMaterial({ color: 0x8fae55, roughness: 0.85, metalness: 0 });
function makeBambooStalk(rand) {
  const geos = [];
  const segs = 5 + Math.floor(rand() * 4);
  const rad = 0.035 + rand() * 0.02;
  let y = 0;
  for (let s = 0; s < segs; s++) {
    const segH = 0.34 + rand() * 0.14;
    const c = new THREE.CylinderGeometry(rad * 0.96, rad, segH, 7);
    c.translate(0, y + segH / 2, 0);
    geos.push(c);
    const knot = new THREE.CylinderGeometry(rad * 1.15, rad * 1.15, 0.03, 7);
    knot.translate(0, y + segH, 0);
    geos.push(knot);
    y += segH;
  }
  // ein paar Blätter oben
  for (let l = 0; l < 3; l++) {
    const leaf = new THREE.ConeGeometry(0.05, 0.34, 4);
    leaf.translate(0, 0.17, 0);
    const m = new THREE.Matrix4()
      .makeRotationZ(0.7 + rand() * 0.5)
      .premultiply(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2));
    leaf.applyMatrix4(m);
    leaf.translate(0, y - 0.1 - l * 0.12, 0);
    geos.push(leaf);
  }
  const stalk = new THREE.Mesh(mergeGeometries(geos), BAMBOO_MAT);
  stalk.userData.height = y;
  return stalk;
}

// Bambushain: mehrere Halme, die in update sanft wiegen.
function makeBambooGrove(rand, cx, cz) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const stalks = [];
  for (let i = 0; i < 13; i++) {
    const stalk = makeBambooStalk(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.3;
    stalk.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    stalk.scale.setScalar(0.8 + rand() * 0.6);
    stalk.userData.phase = rand() * Math.PI * 2;
    stalk.userData.sway = 0.02 + rand() * 0.03;
    group.add(stalk);
    stalks.push(stalk);
  }
  const shadow = makeBlobShadow(1.4, 0.4, 0.02);
  group.add(shadow);
  return {
    group,
    update(time) {
      for (const s of stalks) {
        s.rotation.z = Math.sin(time * 0.9 + s.userData.phase) * s.userData.sway;
        s.rotation.x = Math.cos(time * 0.7 + s.userData.phase) * s.userData.sway * 0.6;
      }
    },
  };
}

// Ahorn (Momiji) mit roter/oranger Krone als Farbkontrast.
function makeMaple(rand) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9, metalness: 0 })
  );
  trunk.position.y = 0.75;
  trunk.rotation.z = -0.08;
  tree.add(trunk);
  const leafColors = [0xd8442a, 0xe86a2a, 0xc23a2a, 0xf0913a];
  const canopy = [
    [0, 1.7, 0, 0.62], [0.5, 1.55, 0.15, 0.42], [-0.45, 1.6, -0.2, 0.46],
    [0.15, 1.95, -0.15, 0.4], [-0.2, 1.85, 0.35, 0.38],
  ];
  for (const [x, y, z, r] of canopy) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: leafColors[Math.floor(rand() * leafColors.length)], roughness: 0.85, metalness: 0 })
    );
    blob.position.set(x, y, z);
    blob.scale.y = 0.9;
    tree.add(blob);
  }
  return tree;
}

// Seerosenblatt (flache Scheibe mit Kerbe) + optional Lotusblüte.
const LILY_MAT = new THREE.MeshStandardMaterial({ color: 0x3f8f4d, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
function makeLilyPad(rand) {
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.16 + rand() * 0.1, 20, 0.5, Math.PI * 1.85), LILY_MAT);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = rand() * Math.PI * 2;
  return pad;
}
function makeLotus() {
  const g = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xff9dc2, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.5;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), petalMat);
      petal.position.set(Math.cos(a) * (0.05 + ring * 0.04), 0.05 + ring * 0.03, Math.sin(a) * (0.05 + ring * 0.04));
      petal.rotation.set(Math.PI / 2 - (0.7 - ring * 0.3), 0, -a);
      g.add(petal);
    }
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.6 })
  );
  center.position.y = 0.07;
  g.add(center);
  return g;
}

function createZenEnvironment() {
  const rand = mulberry32(70707070);
  const group = new THREE.Group();
  group.name = 'env-zen';

  // Warme, ruhige Spätnachmittags-Kuppel
  group.add(makeDome(0x8fb6d8, 0xf6e3c6, 0xe4cba2));

  // Weiches, warmes Licht
  group.add(new THREE.HemisphereLight(0xffe9cf, 0xb8a888, 1.05));
  const sun = new THREE.DirectionalLight(0xffe0b3, 1.7);
  sun.position.set(-12, 9, -6);
  group.add(sun);
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,240,210,1)', 'rgba(255,210,150,0.5)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  sunSprite.position.set(-22, 10, -18);
  sunSprite.scale.set(9, 9, 1);
  group.add(sunSprite);

  // Warmes Rim-/Backlight zum Abheben der Silhouetten
  const rim = new THREE.DirectionalLight(0xffdcb0, 0.45);
  rim.position.set(16, 6, 14);
  group.add(rim);

  // Sandfläche (flach, geharkt)
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(20, 72),
    new THREE.MeshStandardMaterial({ map: makeSandTexture(), roughness: 1, metalness: 0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.02;
  group.add(sand);

  // Moosinseln (leicht grüne Flecken)
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x6e8f52, roughness: 1, metalness: 0 });
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + rand() * 7;
    const moss = new THREE.Mesh(new THREE.CircleGeometry(0.5 + rand() * 0.8, 20), mossMat);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set(Math.cos(a) * r, -0.01, Math.sin(a) * r);
    moss.scale.set(1 + rand() * 0.6, 1, 0.7 + rand() * 0.5);
    group.add(moss);
  }

  // Stein-Arrangements (klassisch asymmetrische Gruppen)
  const stoneGroups = [
    { x: -3.5, z: -2.5, n: 3 },
    { x: 4, z: 1.5, n: 2 },
    { x: 1, z: -4.5, n: 3 },
  ];
  for (const sg of stoneGroups) {
    for (let i = 0; i < sg.n; i++) {
      const size = 0.28 + rand() * 0.45;
      const s = makeZenStone(rand, size, i === 0 ? 0x807a72 : 0x938c83);
      const px = sg.x + (rand() - 0.5) * 0.9;
      const pz = sg.z + (rand() - 0.5) * 0.9;
      s.position.set(px, 0.12 + rand() * 0.1, pz);
      group.add(s);
      const sh = makeBlobShadow(size * 1.5, 0.5);
      sh.position.set(px, 0.015, pz);
      group.add(sh);
    }
  }

  // Trittstein-Pfad
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0x7f7a73, roughness: 1, metalness: 0 })
    );
    step.position.set(-1.5 + i * 0.85, 0.01, 3.2 - i * 0.5 + Math.sin(i) * 0.2);
    step.scale.set(1 + rand() * 0.2, 1, 0.85);
    group.add(step);
  }

  // Koi-Teich
  const pondCenter = new THREE.Vector3(3.2, 0, -1.2);
  const waterTex = makeWaterTexture();
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 40),
    new THREE.MeshStandardMaterial({
      map: waterTex,
      color: 0x9fd0e0,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(pondCenter.x, 0.01, pondCenter.z);
  pond.scale.set(1.2, 1, 1);
  group.add(pond);
  // Steinrand um den Teich
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = makeZenStone(rand, 0.12 + rand() * 0.08, 0x8f8880);
    s.position.set(pondCenter.x + Math.cos(a) * 2.0, 0.05, pondCenter.z + Math.sin(a) * 1.7);
    group.add(s);
  }
  // Seerosenblätter + Lotusblüten auf der Wasseroberfläche
  for (let i = 0; i < 7; i++) {
    const pad = makeLilyPad(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.5;
    pad.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.03, pondCenter.z + Math.sin(a) * r);
    group.add(pad);
  }
  for (let i = 0; i < 3; i++) {
    const lotus = makeLotus();
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 1.1;
    lotus.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.04, pondCenter.z + Math.sin(a) * r);
    group.add(lotus);
  }
  // Wasser-Ringe: wachsen & blenden aus (dort, wo Koi auftauchen)
  const ripples = [];
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 28), rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.userData = { phase: rand() * 1000, period: 3 + rand() * 2 };
    group.add(ring);
    ripples.push(ring);
  }
  // Koi-Fische (mit Flossen, Fleck, Schwanzwedeln)
  const kois = [];
  const koiColors = [0xff7a3d, 0xffffff, 0xffb066, 0xff6a5a, 0xffd0a0];
  for (let i = 0; i < 5; i++) {
    const koi = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: koiColors[i % koiColors.length], roughness: 0.55, metalness: 0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), bodyMat);
    body.scale.set(0.5, 0.26, 1);
    koi.add(body);
    // Schwanz mit eigenem Pivot (wedelt)
    const tailPivot = new THREE.Group();
    tailPivot.position.z = -0.11;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 6), bodyMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -0.06;
    tail.scale.set(1, 0.35, 1);
    tailPivot.add(tail);
    koi.add(tailPivot);
    // Seitenflossen
    for (const dir of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 4), bodyMat);
      fin.rotation.z = dir * Math.PI / 2;
      fin.position.set(dir * 0.06, 0, 0.02);
      koi.add(fin);
    }
    // Kontrastfleck
    const patchColor = koiColors[i % 2 === 0 ? 1 : 0];
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: patchColor, roughness: 0.55 }));
    patch.scale.set(0.5, 0.2, 0.7);
    patch.position.set(0.01, 0.03, 0.03);
    koi.add(patch);
    koi.userData = { radius: 0.55 + i * 0.22, speed: (0.32 + rand() * 0.25) * (i % 2 ? 1 : -1), phase: rand() * 6.28, tail: tailPivot };
    group.add(koi);
    kois.push(koi);
  }

  // Kirschblütenbaum (Sakura)
  const sakura = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9, metalness: 0 })
  );
  trunk.position.y = 0.9;
  trunk.rotation.z = 0.12;
  sakura.add(trunk);
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xffc4dd, roughness: 0.85, metalness: 0 });
  const blossomPositions = [
    [0, 2.1, 0, 0.9], [0.6, 1.9, 0.2, 0.6], [-0.5, 2.0, -0.3, 0.7],
    [0.3, 2.4, -0.2, 0.55], [-0.3, 2.3, 0.4, 0.5], [0.1, 1.8, 0.5, 0.45],
  ];
  for (const [bx, by, bz, br] of blossomPositions) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), blossomMat);
    blob.position.set(bx, by, bz);
    blob.scale.y = 0.85;
    sakura.add(blob);
  }
  sakura.position.set(-4.5, 0, 2.5);
  group.add(sakura);
  const sakuraShadow = makeBlobShadow(1.3, 0.4);
  sakuraShadow.position.set(-4.4, 0.015, 2.5);
  group.add(sakuraShadow);

  // Ahorn (Momiji) als Farbkontrast gegenüber der Sakura
  const maple = makeMaple(rand);
  maple.position.set(4.8, 0, 3.2);
  group.add(maple);
  const mapleShadow = makeBlobShadow(1.0, 0.4);
  mapleShadow.position.set(4.8, 0.015, 3.2);
  group.add(mapleShadow);

  // Bambushain (wiegt in update)
  const bamboo = makeBambooGrove(rand, -6.5, -3.5);
  group.add(bamboo.group);

  // Steinlaterne + Torii (mit Kontaktschatten)
  const lantern = makeLantern();
  lantern.position.set(1.6, 0, -1.8);
  group.add(lantern);
  const lanternShadow = makeBlobShadow(0.4, 0.5);
  lanternShadow.position.set(1.6, 0.015, -1.8);
  group.add(lanternShadow);
  const torii = makeTorii();
  torii.position.set(-2, 0, -9);
  torii.rotation.y = 0.35;
  group.add(torii);
  const toriiShadow = makeBlobShadow(1.8, 0.35);
  toriiShadow.position.set(-2, 0.015, -9);
  toriiShadow.scale.x *= 2; // länglich unter dem Tor
  group.add(toriiShadow);

  // Warm glühende Staubpartikel im tiefen Sonnenlicht
  const DUST = 70;
  const dustPos = new Float32Array(DUST * 3);
  const dustMeta = [];
  for (let i = 0; i < DUST; i++) {
    dustMeta.push({ x: (rand() - 0.5) * 24, y: 0.3 + rand() * 3, z: (rand() - 0.5) * 24, sp: 0.1 + rand() * 0.2, ph: rand() * 6.28 });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,240,210,0.9)', 'rgba(255,220,170,0.4)', 32),
      color: 0xffe6c0,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    })
  );
  dust.frustumCulled = false;
  group.add(dust);

  // Zarter, tief liegender Bodennebel (langsam driftende Weichnebel-Sprites)
  const mistSprites = [];
  const mistMat = () =>
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,246,230,0.4)', 'rgba(250,235,210,0.16)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      fog: false,
    });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(mistMat());
    s.userData = { x: (rand() - 0.5) * 20, z: (rand() - 0.5) * 20, drift: (rand() - 0.5) * 0.15, ph: rand() * 6.28 };
    s.position.set(s.userData.x, 0.35, s.userData.z);
    s.scale.set(7 + rand() * 4, 2.2, 1);
    group.add(s);
    mistSprites.push(s);
  }

  // Treibende Kirschblütenblätter
  const PET = 120;
  const petalPos = new Float32Array(PET * 3);
  const petalMeta = [];
  for (let i = 0; i < PET; i++) {
    petalMeta.push({
      x: (rand() - 0.5) * 22,
      z: (rand() - 0.5) * 22,
      y0: rand() * 9,
      speed: 0.25 + rand() * 0.4,
      sway: rand() * 6.28,
      swayAmp: 0.25 + rand() * 0.5,
    });
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(
    petalGeo,
    new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,200,222,1)', 'rgba(255,175,205,0.7)', 48),
      color: 0xffd0e2,
      size: 0.14,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  petals.frustumCulled = false;
  group.add(petals);

  return {
    id: 'zen',
    name: '🪷 Zen-Garten',
    background: new THREE.Color(0xe9d3ae),
    fog: new THREE.Fog(0xecd9bb, 20, 46),
    group,
    update(time) {
      waterTex.offset.y = -time * 0.03;
      waterTex.offset.x = Math.sin(time * 0.1) * 0.02;
      bamboo.update(time);
      for (const koi of kois) {
        const d = koi.userData;
        const a = time * d.speed + d.phase;
        koi.position.set(
          pondCenter.x + Math.cos(a) * d.radius * 1.15,
          Math.sin(time * 2 + d.phase) * 0.01,
          pondCenter.z + Math.sin(a) * d.radius
        );
        koi.rotation.y = -a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        d.tail.rotation.y = Math.sin(time * 8 + d.phase) * 0.5; // Schwanzwedeln
      }
      // Wasser-Ringe: wachsen von klein → groß und blenden aus
      for (const ring of ripples) {
        const t = ((time + ring.userData.phase) % ring.userData.period) / ring.userData.period;
        const koi = kois[Math.floor(ring.userData.phase) % kois.length];
        if (t < 0.02) {
          ring.position.x = koi.position.x;
          ring.position.z = koi.position.z;
        }
        const s = 0.08 + t * 0.5;
        ring.scale.setScalar(s);
        ring.material.opacity = 0.35 * (1 - t);
      }
      // Staub sanft driften lassen
      const dp = dustGeo.attributes.position;
      for (let i = 0; i < DUST; i++) {
        const m = dustMeta[i];
        dp.setXYZ(
          i,
          m.x + Math.sin(time * 0.3 + m.ph) * 0.6,
          m.y + Math.sin(time * m.sp + m.ph) * 0.3,
          m.z + Math.cos(time * 0.25 + m.ph) * 0.6
        );
      }
      dp.needsUpdate = true;
      // Bodennebel driftet
      for (const s of mistSprites) {
        s.position.x = s.userData.x + Math.sin(time * 0.08 + s.userData.ph) * 3 * s.userData.drift * 6;
        s.material.opacity = 0.4 + Math.sin(time * 0.4 + s.userData.ph) * 0.12;
      }
      const H = 9;
      const p = petalGeo.attributes.position;
      for (let i = 0; i < PET; i++) {
        const m = petalMeta[i];
        const y = ((m.y0 - time * m.speed) % H + H) % H;
        p.setXYZ(
          i,
          m.x + Math.sin(time * 0.6 + m.sway) * m.swayAmp,
          y,
          m.z + Math.cos(time * 0.5 + m.sway) * m.swayAmp
        );
      }
      p.needsUpdate = true;
    },
  };
}

// Weiche, radiale Bodentextur (kein Raster) für das Studio
function makeSoftFloorTexture(center, edge) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, center);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStudioEnvironment() {
  const group = new THREE.Group();
  group.name = 'env-studio';

  group.add(makeDome(0x6f9dc9, 0xf2f7fb, 0xeaf1f8));

  group.add(new THREE.HemisphereLight(0xffffff, 0xc7d2dc, 1.2));

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({
      map: makeSoftFloorTexture('#ffffff', '#d3deea'),
      roughness: 0.9,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  return {
    id: 'studio',
    name: '🌐 Studio',
    background: new THREE.Color(0xdfe9f3),
    group,
  };
}

// ⬜ Konstrukt – der komplett weiße „Matrix"-Void: eine unendlich wirkende, nahtlose
// weiße Leere ohne sichtbaren Horizont. Kuppel und Boden teilen sich denselben Weißton,
// sodass keine Kante entsteht; ein hauchzarter, kühler Verlauf am Grund verhindert das
// desorientierende „Whiteout" und lässt die Karten räumlich verankert wirken.
function createMatrixEnvironment() {
  const group = new THREE.Group();
  group.name = 'env-matrix';

  // Umgebende Kuppel: reines Weiß oben, minimal kühleres Weiß am unteren Rand.
  group.add(makeDome(0xffffff, 0xeef1f4, 60));

  // Nahtloser Boden im selben Weißton wie der Kuppelgrund → unsichtbarer Horizont.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshBasicMaterial({ color: 0xf3f5f8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  // Sehr zarter Kontaktschatten unter dem Nutzer, damit „unten" spürbar bleibt,
  // ohne den weißen Gesamteindruck zu brechen.
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(120,130,145,0.18)', 'rgba(120,130,145,0.06)'),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.018;
  group.add(contact);

  // Gleichmäßiges, nahezu schattenfreies Licht: Karten sind überall gut lesbar.
  group.add(new THREE.HemisphereLight(0xffffff, 0xf0f2f5, 1.5));
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(2, 12, 6);
  group.add(fill);

  return {
    id: 'matrix',
    name: '⬜ Konstrukt',
    background: new THREE.Color(0xffffff),
    group,
  };
}

export function createEnvironments(scene) {
  const environments = [
    createIslandEnvironment(),
    createNightEnvironment(),
    createZenEnvironment(),
    createStudioEnvironment(),
    createMatrixEnvironment(),
  ];
  for (const env of environments) {
    env.group.visible = false;
    scene.add(env.group);
  }
  return environments;
}

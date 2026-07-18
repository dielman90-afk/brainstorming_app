import * as THREE from 'three';

// Drei umschaltbare VR-Umgebungen, komplett prozedural (keine externen Assets):
//   🏝 Himmelsinsel – Low-Poly-Insel mit Bäumen, Wolken und schwebenden Mini-Inseln
//   🌌 Nachthimmel  – Sternenfeld, Mond und leuchtendes Boden-Grid
//   🌐 Studio       – die schlichte helle Gradient-Umgebung
// Jede Umgebung: { id, name, background, group, update?(time) }

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
function makeDome(topColor, bottomColor, radius = 40) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
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
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 1.5)), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
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

function makeCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const blobs = [
    [70, 80, 50],
    [128, 60, 62],
    [190, 82, 48],
    [100, 66, 40],
    [160, 88, 44],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Vertices radial verschieben (organische Kanten), dann Flat-Shading-Facetten
function displaceRadial(geometry, amount, yAmount = 0) {
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
  const nonIndexed = geometry.toNonIndexed();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

function makeTree(rand) {
  const tree = new THREE.Group();
  const trunkHeight = 0.5 + rand() * 0.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, trunkHeight, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f, flatShading: true })
  );
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  const foliageColor = rand() > 0.5 ? 0x3e8e4f : 0x55a763;
  const layers = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < layers; i++) {
    const radius = 0.45 - i * 0.12;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, 0.55, 7),
      new THREE.MeshLambertMaterial({ color: foliageColor, flatShading: true })
    );
    cone.position.y = trunkHeight + 0.15 + i * 0.32;
    tree.add(cone);
  }
  return tree;
}

// Schwebende Insel: Grasplatte mit Erdrand + felsige, zerklüftete Unterseite
function buildIsland(rand, { radius = 5, depth = 4, trees = 3, rocks = 4 } = {}) {
  const island = new THREE.Group();

  const capGeometry = displaceRadial(new THREE.CylinderGeometry(radius, radius * 0.94, 0.3, 28, 1), 0.1);
  const cap = new THREE.Mesh(capGeometry, [
    new THREE.MeshLambertMaterial({ color: 0x7a5c3d, flatShading: true }), // Erdrand
    new THREE.MeshLambertMaterial({ color: 0x69b45a, flatShading: true }), // Gras
    new THREE.MeshLambertMaterial({ color: 0x6b4f34, flatShading: true }), // Unterseite
  ]);
  cap.position.y = -0.17; // Grasfläche liegt bei y ≈ -0.02
  island.add(cap);

  const rockGeometry = displaceRadial(new THREE.ConeGeometry(radius * 0.92, depth, 24, 5), 0.3, 0.25);
  const rock = new THREE.Mesh(
    rockGeometry,
    new THREE.MeshLambertMaterial({ color: 0x7d6f5c, flatShading: true })
  );
  rock.rotation.x = Math.PI; // Spitze nach unten
  rock.position.y = -0.3 - depth / 2;
  island.add(rock);

  for (let i = 0; i < trees; i++) {
    const tree = makeTree(rand);
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.55 + rand() * 0.3);
    tree.position.set(Math.sin(angle) * r, -0.03, Math.cos(angle) * r);
    tree.rotation.y = rand() * Math.PI * 2;
    island.add(tree);
  }

  for (let i = 0; i < rocks; i++) {
    const stone = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.12 + rand() * 0.2, 0),
      new THREE.MeshLambertMaterial({ color: 0x8a8f96, flatShading: true })
    );
    const angle = rand() * Math.PI * 2;
    const r = radius * (0.5 + rand() * 0.4);
    stone.position.set(Math.sin(angle) * r, 0.02, Math.cos(angle) * r);
    stone.scale.y = 0.6 + rand() * 0.5;
    stone.rotation.set(rand(), rand(), rand());
    island.add(stone);
  }

  return island;
}

function createIslandEnvironment() {
  const rand = mulberry32(20260718);
  const group = new THREE.Group();
  group.name = 'env-island';

  group.add(makeDome(0x3f83c9, 0xcfe8f7));

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,250,225,1)', 'rgba(255,238,180,0.55)'),
      transparent: true,
      depthWrite: false,
    })
  );
  sun.position.set(18, 24, -24);
  sun.scale.set(10, 10, 1);
  group.add(sun);

  group.add(new THREE.HemisphereLight(0xd9ecff, 0x9c8a6f, 1.1));
  const sunlight = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sunlight.position.set(10, 18, -8);
  group.add(sunlight);

  // Hauptinsel, auf der der Nutzer steht
  group.add(buildIsland(rand, { radius: 5, depth: 4.5, trees: 3, rocks: 5 }));

  // Entfernte Mini-Inseln, die sanft auf und ab schweben
  const minis = [];
  const miniConfigs = [
    { angle: 0.6, dist: 14, y: -1.5, scale: 0.35 },
    { angle: 2.4, dist: 19, y: 2.0, scale: 0.5 },
    { angle: 3.9, dist: 23, y: -3.0, scale: 0.65 },
    { angle: 5.2, dist: 16, y: 3.5, scale: 0.3 },
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

  // Treibende Wolken
  const cloudMaterial = new THREE.SpriteMaterial({
    map: makeCloudTexture(),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Sprite(cloudMaterial);
    cloud.name = `cloud-${i}`;
    const width = 5 + rand() * 5;
    cloud.scale.set(width, width * 0.45, 1);
    cloud.userData.baseX = (rand() - 0.5) * 60;
    cloud.userData.speed = 0.15 + rand() * 0.25;
    cloud.position.set(cloud.userData.baseX, 4 + rand() * 9, (rand() - 0.5) * 56);
    group.add(cloud);
    clouds.push(cloud);
  }

  return {
    id: 'island',
    name: '🏝 Himmelsinsel',
    background: new THREE.Color(0x8fc4e8),
    group,
    update(time) {
      for (const mini of minis) {
        mini.position.y = mini.userData.baseY + Math.sin(time * 0.4 + mini.userData.phase) * 0.5;
      }
      for (const cloud of clouds) {
        const x = cloud.userData.baseX + time * cloud.userData.speed;
        cloud.position.x = ((x % 60) + 60 + 30) % 60 - 30;
      }
    },
  };
}

function createNightEnvironment() {
  const rand = mulberry32(42424242);
  const group = new THREE.Group();
  group.name = 'env-night';

  group.add(makeDome(0x16244a, 0x04070d));

  const starTexture = makeGlowTexture('rgba(255,255,255,1)', 'rgba(210,225,255,0.6)', 64);
  const starsGroup = new THREE.Group();
  const shells = [
    { count: 1300, size: 0.28, opacity: 0.75 },
    { count: 200, size: 0.55, opacity: 1 },
  ];
  for (const shell of shells) {
    const positions = new Float32Array(shell.count * 3);
    for (let i = 0; i < shell.count; i++) {
      // Gleichverteilung auf Kugelschale, leicht über dem Horizont bevorzugt
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const r = 36 + rand() * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = s * Math.cos(phi) * r;
      positions[i * 3 + 1] = Math.abs(u) * r * (rand() > 0.15 ? 1 : -0.2);
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
      })
    );
    starsGroup.add(stars);
  }
  group.add(starsGroup);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf2 })
  );
  moon.position.set(14, 16, -24);
  group.add(moon);
  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(220,232,255,0.9)', 'rgba(180,200,255,0.35)'),
      transparent: true,
      depthWrite: false,
    })
  );
  moonGlow.position.copy(moon.position);
  moonGlow.scale.set(8, 8, 1);
  group.add(moonGlow);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshBasicMaterial({ color: 0x0a1220 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  const glowGrid = new THREE.GridHelper(22, 44, 0x00e5cc, 0x0d4a5a);
  glowGrid.position.y = -0.015;
  group.add(glowGrid);

  return {
    id: 'night',
    name: '🌌 Nachthimmel',
    background: new THREE.Color(0x04070d),
    group,
    update(time) {
      starsGroup.rotation.y = time * 0.004;
    },
  };
}

function createStudioEnvironment() {
  const group = new THREE.Group();
  group.name = 'env-studio';

  group.add(makeDome(0x6f9dc9, 0xeaf1f8));

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 48),
    new THREE.MeshBasicMaterial({ color: 0xf0f4f8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  group.add(new THREE.GridHelper(8, 24, 0xb8c7d6, 0xdde6ee));

  return {
    id: 'studio',
    name: '🌐 Studio',
    background: new THREE.Color(0xdfe9f3),
    group,
  };
}

export function createEnvironments(scene) {
  const environments = [createIslandEnvironment(), createNightEnvironment(), createStudioEnvironment()];
  for (const env of environments) {
    env.group.visible = false;
    scene.add(env.group);
  }
  return environments;
}

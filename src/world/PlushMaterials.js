import * as THREE from 'three';

let cachedPlushBump = null;
let cachedCorduroyBump = null;
let cachedCornTexture = null;
const texLoader = new THREE.TextureLoader();
const loadedTexCache = new Map();

export function loadTiledTexture(url, repeatX = 1, repeatY = 1) {
  const key = `${url}:${repeatX}:${repeatY}`;
  if (loadedTexCache.has(key)) return loadedTexCache.get(key);

  const tex = texLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  loadedTexCache.set(key, tex);
  return tex;
}

export function createPlushBumpTexture() {
  if (cachedPlushBump) return cachedPlushBump;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < size * size; i++) {
    const n = 100 + Math.floor(rand() * 125);
    const idx = i * 4;
    data[idx] = n;
    data[idx + 1] = n;
    data[idx + 2] = n;
    data[idx + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 720; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 3.8, y + Math.sin(a) * 3.8);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  cachedPlushBump = tex;
  return tex;
}

export function createCorduroyBumpTexture() {
  if (cachedCorduroyBump) return cachedCorduroyBump;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  for (let x = 0; x < size; x++) {
    const wave = Math.sin((x / size) * Math.PI * 26) * 0.5 + 0.5;
    const v = Math.floor(65 + wave * 180);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  cachedCorduroyBump = tex;
  return tex;
}

export function createCornKernelTexture() {
  if (cachedCornTexture) return cachedCornTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8c948';
  ctx.fillRect(0, 0, size, size);

  const cols = 12;
  const rows = 14;
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = (r % 2) * (cw * 0.5);
      const x = (c * cw + offset) % size;
      const y = r * ch;
      ctx.fillStyle = (r + c) % 3 === 0 ? '#ffe073' : '#f4be37';
      ctx.beginPath();
      ctx.ellipse(x + cw * 0.45, y + ch * 0.45, cw * 0.38, ch * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedCornTexture = tex;
  return tex;
}

export function createPlushMaterial(colorHex, opts = {}) {
  const base = new THREE.Color(colorHex);
  const sheen = opts.sheenColor
    ? new THREE.Color(opts.sheenColor)
    : base.clone().lerp(new THREE.Color('#ffffff'), 0.52);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: opts.roughness ?? 0.88,
    metalness: 0.0,
    sheen: opts.sheen ?? 1.0,
    sheenRoughness: opts.sheenRoughness ?? 0.52,
    sheenColor: sheen,
    bumpMap: createPlushBumpTexture(),
    bumpScale: opts.bumpScale ?? 0.032,
    ...opts.extra,
  });
}

export function createFeltMaterial(colorHex, opts = {}) {
  const base = new THREE.Color(colorHex);
  const sheen = opts.sheenColor
    ? new THREE.Color(opts.sheenColor)
    : base.clone().lerp(new THREE.Color('#ffffff'), 0.38);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.92,
    metalness: 0.0,
    sheen: 0.78,
    sheenRoughness: 0.64,
    sheenColor: sheen,
    bumpMap: createPlushBumpTexture(),
    bumpScale: 0.018,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export function createCorduroyMaterial(colorHex = '#c89b7b') {
  const base = new THREE.Color(colorHex);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.85,
    metalness: 0.0,
    sheen: 0.65,
    sheenRoughness: 0.6,
    sheenColor: base.clone().lerp(new THREE.Color('#fff2e6'), 0.4),
    bumpMap: createCorduroyBumpTexture(),
    bumpScale: 0.05,
  });
}

// Calibrated directly to reference/VIVACIOUS_VEGETABLE_AUBERGINE__68436.webp, VV2A__84205.jpg, VV4ABC__60128.jpg
export const SharedMaterials = {
  beadEye: new THREE.MeshPhysicalMaterial({
    color: '#110d12',
    roughness: 0.14,
    metalness: 0.04,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  }),
  stitchDark: new THREE.MeshStandardMaterial({
    color: '#1f1622',
    roughness: 0.85,
  }),
  seamLine: new THREE.MeshStandardMaterial({
    color: '#63445e',
    roughness: 0.92,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: '#ffd257',
    roughness: 0.25,
    metalness: 0.82,
    emissive: '#6e4900',
    emissiveIntensity: 0.16,
  }),
  silver: new THREE.MeshStandardMaterial({
    color: '#e8eef7',
    roughness: 0.22,
    metalness: 0.85,
  }),
  glassDome: new THREE.MeshPhysicalMaterial({
    color: '#e8f6ff',
    roughness: 0.08,
    metalness: 0.0,
    transmission: 0.65,
    transparent: true,
    opacity: 0.36,
    ior: 1.4,
  }),
  // Official Jellycat Aubergine Colors (Dusty Mauve-Plum & Olive Calyx & Warm Tan Corduroy)
  aubergineMauve: createPlushMaterial('#7e5b79', {
    sheenColor: '#c2a6be',
    roughness: 0.86,
    bumpScale: 0.036,
  }),
  aubergineSoftMauve: createPlushMaterial('#967391', {
    sheenColor: '#d1bad0',
    roughness: 0.86,
    bumpScale: 0.036,
  }),
  calyxOlive: createFeltMaterial('#6e7f48', {
    sheenColor: '#a2b379',
    doubleSided: true,
  }),
  stemOlive: createPlushMaterial('#5b6b39', {
    sheenColor: '#8d9e68',
    bumpScale: 0.025,
  }),
  charmCorduroyTan: createCorduroyMaterial('#c89b7b'),
  corduroyBrown: createCorduroyMaterial('#805846'),
};

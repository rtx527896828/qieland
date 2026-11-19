import * as THREE from 'three';
import { getDeviceProfile } from './SceneOptimizer.js';

let cachedPlushBump = null;
let cachedCorduroyBump = null;
let cachedCornTexture = null;
const texLoader = new THREE.TextureLoader();
const baseTexCache = new Map();
const baseTexClones = new Map();
const loadedTexCache = new Map();
const materialCache = new Map();
const pendingTexturePromises = [];
let totalTexturesQueued = 0;
let totalTexturesDone = 0;

function downscaleImageIfMobile(img) {
  const device = getDeviceProfile();
  if (!device.isMobileOrTablet) return img;
  const maxDim = 512;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if (w <= maxDim && h <= maxDim) return img;
  const scale = maxDim / Math.max(w, h);
  const tw = Math.max(64, Math.round(w * scale));
  const th = Math.max(64, Math.round(h * scale));
  try {
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    return c;
  } catch {
    return img;
  }
}

function getOrLoadBaseTexture(url) {
  if (baseTexCache.has(url)) return baseTexCache.get(url);

  totalTexturesQueued++;
  let resolveLoad;
  const loadPromise = new Promise((res) => {
    resolveLoad = res;
  });
  pendingTexturePromises.push(loadPromise);

  const tex = texLoader.load(
    url,
    (loaded) => {
      if (loaded.image) {
        const resized = downscaleImageIfMobile(loaded.image);
        if (resized !== loaded.image) {
          loaded.image = resized;
        }
      }
      loaded.needsUpdate = true;
      const clones = baseTexClones.get(url);
      if (clones) {
        for (const c of clones) c.needsUpdate = true;
      }
      totalTexturesDone++;
      resolveLoad(true);
    },
    undefined,
    () => {
      totalTexturesDone++;
      resolveLoad(false);
    }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = getDeviceProfile().anisotropy;
  baseTexCache.set(url, tex);
  return tex;
}

export function loadSingleTexture(url) {
  return getOrLoadBaseTexture(url);
}

export function loadTiledTexture(url, repeatX = 1, repeatY = 1) {
  const key = `${url}:${repeatX}:${repeatY}`;
  if (loadedTexCache.has(key)) return loadedTexCache.get(key);

  const base = getOrLoadBaseTexture(url);
  // Clone shares the exact same GPU Texture.source — zero duplicate download or VRAM!
  const tex = base.clone();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = getDeviceProfile().anisotropy;
  tex.needsUpdate = true;
  if (!baseTexClones.has(url)) baseTexClones.set(url, []);
  baseTexClones.get(url).push(tex);
  loadedTexCache.set(key, tex);
  return tex;
}

/**
 * Waits for all queued textures to finish downloading, decoding, and optional iPad
 * 512px downscaling so GPU warmup uploads every texture + mipmap once up front.
 */
export function waitForAllTextures(timeoutMs = 12000, onProgress = null) {
  if (pendingTexturePromises.length === 0) return Promise.resolve();
  let timer = null;
  if (onProgress) {
    onProgress(totalTexturesDone, totalTexturesQueued);
    timer = setInterval(() => onProgress(totalTexturesDone, totalTexturesQueued), 150);
  }
  return Promise.race([
    Promise.allSettled(pendingTexturePromises),
    new Promise((res) => setTimeout(res, timeoutMs)),
  ]).finally(() => {
    if (timer) clearInterval(timer);
    if (onProgress) onProgress(totalTexturesDone, totalTexturesQueued);
  });
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
  const usePhysical = Boolean(opts.physical && getDeviceProfile().usePhysicalPlush);
  const canCache = !opts.extra;
  const cacheKey = canCache
    ? `plush|${colorHex}|${opts.roughness ?? 0.88}|${opts.bumpScale ?? 0.032}|${opts.sheenColor ?? ''}|${usePhysical ? 1 : 0}`
    : null;
  if (cacheKey && materialCache.has(cacheKey)) return materialCache.get(cacheKey);

  const base = new THREE.Color(colorHex);
  let mat;
  if (usePhysical) {
    const sheen = opts.sheenColor
      ? new THREE.Color(opts.sheenColor)
      : base.clone().lerp(new THREE.Color('#ffffff'), 0.52);
    mat = new THREE.MeshPhysicalMaterial({
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
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: base,
      roughness: opts.roughness ?? 0.86,
      metalness: 0.0,
      bumpMap: getDeviceProfile().isMobileOrTablet ? null : createPlushBumpTexture(),
      bumpScale: opts.bumpScale ?? 0.028,
      ...opts.extra,
    });
  }
  if (cacheKey) materialCache.set(cacheKey, mat);
  return mat;
}

export function createFeltMaterial(colorHex, opts = {}) {
  const usePhysical = Boolean(opts.physical && getDeviceProfile().usePhysicalPlush);
  const cacheKey = `felt|${colorHex}|${opts.doubleSided ? 1 : 0}|${opts.sheenColor ?? ''}|${usePhysical ? 1 : 0}`;
  if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);

  const base = new THREE.Color(colorHex);
  const side = opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  let mat;
  if (usePhysical) {
    const sheen = opts.sheenColor
      ? new THREE.Color(opts.sheenColor)
      : base.clone().lerp(new THREE.Color('#ffffff'), 0.38);
    mat = new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.92,
      metalness: 0.0,
      sheen: 0.78,
      sheenRoughness: 0.64,
      sheenColor: sheen,
      bumpMap: createPlushBumpTexture(),
      bumpScale: 0.018,
      side,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: base,
      roughness: 0.9,
      metalness: 0.0,
      side,
    });
  }
  materialCache.set(cacheKey, mat);
  return mat;
}

export function createCorduroyMaterial(colorHex = '#c89b7b', opts = {}) {
  const usePhysical = Boolean(opts.physical && getDeviceProfile().usePhysicalPlush);
  const cacheKey = `cord|${colorHex}|${usePhysical ? 1 : 0}`;
  if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);

  const base = new THREE.Color(colorHex);
  let mat;
  if (usePhysical) {
    mat = new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.85,
      metalness: 0.0,
      sheen: 0.65,
      sheenRoughness: 0.6,
      sheenColor: base.clone().lerp(new THREE.Color('#fff2e6'), 0.4),
      bumpMap: createCorduroyBumpTexture(),
      bumpScale: 0.05,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: base,
      roughness: 0.85,
      metalness: 0.0,
      bumpMap: createCorduroyBumpTexture(),
      bumpScale: 0.045,
    });
  }
  materialCache.set(cacheKey, mat);
  return mat;
}

// Calibrated directly to reference/VIVACIOUS_VEGETABLE_AUBERGINE__68436.webp, VV2A__84205.jpg, VV4ABC__60128.jpg
export const SharedMaterials = {
  beadEye: new THREE.MeshStandardMaterial({
    color: '#110d12',
    roughness: 0.12,
    metalness: 0.12,
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
  // Avoid `transmission > 0` which forces a full-scene secondary render pass every frame!
  glassDome: new THREE.MeshStandardMaterial({
    color: '#dff4ff',
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
  }),
  // Official Jellycat Aubergine Colors (Dusty Mauve-Plum & Olive Calyx & Warm Tan Corduroy)
  aubergineMauve: createPlushMaterial('#7e5b79', {
    physical: true,
    sheenColor: '#c2a6be',
    roughness: 0.86,
    bumpScale: 0.036,
  }),
  aubergineSoftMauve: createPlushMaterial('#967391', {
    physical: true,
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

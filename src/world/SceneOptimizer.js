import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let cachedProfile = null;
const globalCanonicalMats = new Map();

export function resetMaterialDedupCache() {
  globalCanonicalMats.clear();
}

/**
 * Detects iPad / iOS / Android / touch tablets vs desktop GPUs so we can tune
 * pixel ratio, shadow resolution, foliage density, and shader complexity.
 */
export function getDeviceProfile() {
  if (cachedProfile) return cachedProfile;

  const hasWindow = typeof window !== 'undefined';
  const hasNav = typeof navigator !== 'undefined';
  const ua = hasNav ? navigator.userAgent || '' : '';
  const maxTouch = hasNav ? navigator.maxTouchPoints || 0 : 0;

  // iPadOS Safari reports "Macintosh" in UA with maxTouchPoints > 1
  const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouch > 1);
  const isPhone = /iPhone|iPod|Android.*Mobile|Mobile/i.test(ua);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  const isMobileOrTablet = isIPad || isPhone || isAndroidTablet;
  const dpr = hasWindow ? window.devicePixelRatio || 1 : 1;

  cachedProfile = {
    isIPad,
    isPhone,
    isMobileOrTablet,
    maxPixelRatio: isMobileOrTablet ? Math.min(dpr, 1.3) : Math.min(dpr, 1.75),
    shadowMapSize: isMobileOrTablet ? 1024 : 2048,
    grassCount: isMobileOrTablet ? 3600 : 9000,
    flowerCount: isMobileOrTablet ? 1400 : 3200,
    anisotropy: isMobileOrTablet ? 4 : 8,
    usePhysicalPlush: !isMobileOrTablet,
    antialias: !isPhone,
  };
  return cachedProfile;
}

function getMaterialSignature(mat, protectedMaterials) {
  if (protectedMaterials && protectedMaterials.has(mat)) {
    return `protected:${mat.uuid}`;
  }
  const color = mat.color ? mat.color.getHexString() : 'none';
  const emissive = mat.emissive ? mat.emissive.getHexString() : 'none';
  const sheenColor = mat.sheenColor ? mat.sheenColor.getHexString() : 'none';
  return [
    mat.type,
    color,
    (mat.roughness ?? 0.5).toFixed(2),
    (mat.metalness ?? 0).toFixed(2),
    emissive,
    (mat.emissiveIntensity ?? 0).toFixed(2),
    mat.map ? mat.map.uuid : '-',
    mat.bumpMap ? `${mat.bumpMap.uuid}:${(mat.bumpScale ?? 0).toFixed(3)}` : '-',
    mat.normalMap ? mat.normalMap.uuid : '-',
    mat.alphaMap ? mat.alphaMap.uuid : '-',
    mat.transparent ? 'T' : 'O',
    (mat.opacity ?? 1).toFixed(2),
    (mat.alphaTest ?? 0).toFixed(2),
    mat.side ?? 0,
    mat.vertexColors ? 'VC' : '-',
    mat.flatShading ? 'FS' : '-',
    mat.depthWrite === false ? 'DW0' : 'DW1',
    (mat.sheen ?? 0).toFixed(2),
    (mat.sheenRoughness ?? 0).toFixed(2),
    sheenColor,
    (mat.clearcoat ?? 0).toFixed(2),
    (mat.clearcoatRoughness ?? 0).toFixed(2),
  ].join('|');
}

function isBatchableMaterial(mat) {
  if (!mat || Array.isArray(mat)) return false;
  if (mat.isShaderMaterial || mat.isNodeMaterial) return false;
  if (mat.map && mat.map.isVideoTexture) return false;
  return (
    mat.isMeshStandardMaterial ||
    mat.isMeshPhysicalMaterial ||
    mat.isMeshBasicMaterial ||
    mat.isMeshLambertMaterial ||
    mat.isMeshPhongMaterial
  );
}

/**
 * Normalizes a geometry into a world-space BufferGeometry with consistent attributes
 * (position, normal, optional uv/color) so mergeGeometries never fails.
 */
function prepareGeometryWithMatrix(mesh, transformMatrix, wantUv, wantColor, forceNonIndexed) {
  let g = mesh.geometry.clone();
  if (forceNonIndexed && g.index) {
    const nonIdx = g.toNonIndexed();
    g.dispose();
    g = nonIdx;
  }

  g.applyMatrix4(transformMatrix);

  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }

  const vertCount = g.attributes.position.count;
  if (wantUv && !g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertCount * 2), 2));
  }
  if (wantColor && !g.attributes.color) {
    const cols = new Float32Array(vertCount * 3);
    cols.fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }

  // Strip any mismatching auxiliary attributes (tangent, uv1, etc.)
  for (const attrName of Object.keys(g.attributes)) {
    if (attrName === 'position' || attrName === 'normal') continue;
    if (attrName === 'uv' && wantUv) continue;
    if (attrName === 'color' && wantColor) continue;
    g.deleteAttribute(attrName);
  }

  // Handle negative-determinant matrices (mirrored meshes) so normals stay outward
  if (transformMatrix.determinant() < 0) {
    const pos = g.attributes.position;
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
      g.index.needsUpdate = true;
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        for (const key of Object.keys(g.attributes)) {
          const attr = g.attributes[key];
          const itemSize = attr.itemSize;
          for (let k = 0; k < itemSize; k++) {
            const a = attr.array[(i + 1) * itemSize + k];
            attr.array[(i + 1) * itemSize + k] = attr.array[(i + 2) * itemSize + k];
            attr.array[(i + 2) * itemSize + k] = a;
          }
        }
      }
    }
    g.computeVertexNormals();
  }

  return g;
}

/**
 * Spatially batches static meshes in `root` by canonicalized material & shadow flags,
 * dramatically cutting draw calls and material state switches while preserving
 * frustum culling and leaving every dynamic/animated subtree completely untouched.
 * Works both for world-space static roots and local-space moving rigid groups!
 */
export function optimizeStaticScene(
  root,
  {
    dynamicObjects = [],
    protectedMaterials = new Set(),
    noShadowObjects = [],
    chunkSize = 120,
    minShadowRadius = 1.25,
    includeHiddenRoot = false,
    label = 'static',
  } = {}
) {
  if (!root) return { beforeMeshes: 0, afterMeshes: 0, mergedGroups: 0, removedShadowCasters: 0 };
  root.updateMatrixWorld(true);
  const invRootMatrix = root.matrixWorld.clone().invert();
  const relMatrix = new THREE.Matrix4();

  const dynamicSet = new Set();
  for (const obj of dynamicObjects) {
    if (!obj || obj === root) continue;
    obj.traverse((child) => dynamicSet.add(child));
  }

  const noShadowSet = new Set();
  for (const obj of noShadowObjects) {
    if (!obj) continue;
    obj.traverse((child) => noShadowSet.add(child));
  }

  const canonicalMats = globalCanonicalMats;
  const buckets = new Map();
  const tmpSphere = new THREE.Sphere();

  let beforeMeshes = 0;
  let removedShadowCasters = 0;

  const candidates = [];
  root.traverse((obj) => {
    if (obj === root) return;
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
    if (dynamicSet.has(obj)) return;
    if (!obj.visible) return;
    if (obj.morphTargetInfluences) return;
    if (!obj.geometry || !obj.geometry.attributes?.position) return;
    if (!isBatchableMaterial(obj.material)) return;

    let cur = obj.parent;
    while (cur && cur !== root) {
      if (!cur.visible || dynamicSet.has(cur)) return;
      cur = cur.parent;
    }
    if (!includeHiddenRoot && !root.visible) return;

    candidates.push(obj);
  });

  for (const mesh of candidates) {
    beforeMeshes++;
    const mat = mesh.material;
    const matKey = getMaterialSignature(mat, protectedMaterials);
    if (!canonicalMats.has(matKey)) {
      canonicalMats.set(matKey, mat);
    }
    const sharedMat = canonicalMats.get(matKey);

    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    tmpSphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const radius = tmpSphere.radius;

    let castShadow = mesh.castShadow;
    if (castShadow && (noShadowSet.has(mesh) || radius < minShadowRadius)) {
      castShadow = false;
      removedShadowCasters++;
    }
    const receiveShadow = mesh.receiveShadow;

    let cx = 0;
    let cz = 0;
    if (chunkSize < 5000 && radius < chunkSize * 0.45) {
      cx = Math.floor(tmpSphere.center.x / chunkSize);
      cz = Math.floor(tmpSphere.center.z / chunkSize);
    } else {
      cx = 999;
      cz = 999;
    }

    const bucketKey = `${cx},${cz}|${matKey}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        material: sharedMat,
        castShadow,
        receiveShadow,
        meshes: [],
      };
      buckets.set(bucketKey, bucket);
    }
    bucket.meshes.push(mesh);
  }

  const batchedGroup = new THREE.Group();
  batchedGroup.name = `batched_${label}`;

  let afterMeshes = 0;
  let mergedGroups = 0;

  for (const bucket of buckets.values()) {
    const list = bucket.meshes;
    if (list.length === 1) {
      const m = list[0];
      m.material = bucket.material;
      m.castShadow = bucket.castShadow;
      afterMeshes++;
      continue;
    }

    let hasIndexed = false;
    let hasNonIndexed = false;
    let anyUv = false;
    let anyColor = false;

    for (const m of list) {
      if (m.geometry.index) hasIndexed = true;
      else hasNonIndexed = true;
      if (m.geometry.attributes.uv) anyUv = true;
      if (m.geometry.attributes.color) anyColor = true;
    }

    const forceNonIndexed = hasIndexed && hasNonIndexed;
    const prepared = [];
    for (const m of list) {
      relMatrix.multiplyMatrices(invRootMatrix, m.matrixWorld);
      prepared.push(prepareGeometryWithMatrix(m, relMatrix, anyUv, anyColor, forceNonIndexed));
    }

    const merged = mergeGeometries(prepared, false);
    for (const g of prepared) g.dispose();

    if (!merged) {
      for (const m of list) {
        m.material = bucket.material;
        m.castShadow = bucket.castShadow;
      }
      afterMeshes += list.length;
      continue;
    }

    merged.computeBoundingSphere();
    merged.computeBoundingBox();

    const batchedMesh = new THREE.Mesh(merged, bucket.material);
    batchedMesh.castShadow = bucket.castShadow;
    batchedMesh.receiveShadow = bucket.receiveShadow;
    batchedMesh.frustumCulled = true;
    batchedGroup.add(batchedMesh);

    for (const m of list) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    }

    afterMeshes++;
    mergedGroups++;
  }

  if (batchedGroup.children.length > 0) {
    root.add(batchedGroup);
  }

  return { beforeMeshes, afterMeshes, mergedGroups, removedShadowCasters };
}

/**
 * Collapses static child meshes inside a moving rigid assembly (e.g. a coaster car,
 * gondola, carousel mount, river boat, or parade float) into a few local-space
 * batched meshes so the entire assembly renders in ~3-6 draw calls instead of 50-180.
 */
export function optimizeRigidGroup(group, options = {}) {
  return optimizeStaticScene(group, {
    chunkSize: 9999,
    minShadowRadius: 0.9,
    includeHiddenRoot: true,
    ...options,
  });
}

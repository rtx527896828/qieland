import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  uniform,
  attribute,
  positionLocal,
  positionWorld,
  cameraPosition,
  vec3,
  float,
  sin,
  cos,
  mix,
  smoothstep,
  pow,
  dot,
  normalize,
  max,
  clamp,
  length,
} from 'three/tsl';
import { BRIDGE_SPECS, getRiverCenterRadius, PARK_CONSTANTS } from './ParkLayout.js';

export function createMeanderingRiverGeometry(
  getRadiusFn = getRiverCenterRadius,
  halfWidth = PARK_CONSTANTS.RIVER_HALF_WIDTH,
  segs = 260,
  crossSegs = 12
) {
  const geom = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = [];
  const bankDists = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const angle = u * Math.PI * 2;
    const rMid = getRadiusFn(angle);
    const sx = Math.sin(angle);
    const cz = Math.cos(angle);

    for (let j = 0; j <= crossSegs; j++) {
      const v = j / crossSegs; // 0 = inner bank, 1 = outer bank
      const offset = (v - 0.5) * 2.0 * halfWidth;
      const r = rMid + offset;

      positions.push(sx * r, 0, cz * r);
      normals.push(0, 1, 0);
      uvs.push(u * 24, v);
      // Distance from closest bank in meters (0 at edge, halfWidth at centerline)
      bankDists.push(halfWidth - Math.abs(offset));
    }
  }

  const rowStride = crossSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < crossSegs; j++) {
      const a = i * rowStride + j;
      const b = (i + 1) * rowStride + j;
      const c = (i + 1) * rowStride + (j + 1);
      const d = i * rowStride + (j + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute('aBankDist', new THREE.Float32BufferAttribute(bankDists, 1));
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Generates an extruded smooth stone coping curb tracing either the inner or outer meandering riverbank.
 */
export function createRiverBankCurbGeometry(
  sideSign = -1,
  getRadiusFn = getRiverCenterRadius,
  halfWidth = PARK_CONSTANTS.RIVER_HALF_WIDTH,
  segs = 220,
  width = 0.85,
  height = 0.52
) {
  const geom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const angle = u * Math.PI * 2;
    const rEdge = getRadiusFn(angle) + sideSign * halfWidth;
    const rOuter = rEdge + sideSign * width;
    const sx = Math.sin(angle);
    const cz = Math.cos(angle);

    // 4-point cross section per angle ring: bottom-water, top-water, top-land, bottom-land
    const yBot = -0.35;
    const yTop = -0.35 + height;
    const ring = [
      [sx * rEdge, yBot, cz * rEdge, u * 36, 0],
      [sx * rEdge, yTop, cz * rEdge, u * 36, 0.35],
      [sx * rOuter, yTop, cz * rOuter, u * 36, 0.7],
      [sx * rOuter, yBot, cz * rOuter, u * 36, 1.0],
    ];
    for (const [px, py, pz, tu, tv] of ring) {
      positions.push(px, py, pz);
      uvs.push(tu, tv);
    }
  }

  for (let i = 0; i < segs; i++) {
    const base = i * 4;
    const next = (i + 1) * 4;
    for (let k = 0; k < 3; k++) {
      const a = base + k;
      const b = base + k + 1;
      const c = next + k + 1;
      const d = next + k;
      if (sideSign < 0) {
        indices.push(a, d, b, b, d, c);
      } else {
        indices.push(a, b, d, b, c, d);
      }
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

export function createCanalWaterMaterial() {
  const uTime = uniform(0);
  const uSunDir = uniform(new THREE.Vector3(0.5, 0.75, 0.4).normalize());
  const uSkyColor = uniform(new THREE.Color('#cceeff'));
  const uShallowColor = uniform(new THREE.Color('#6ae8f4'));
  const uDeepColor = uniform(new THREE.Color('#196c9e'));

  const aBankDist = attribute('aBankDist', 'float');

  // Animated Gerstner-like wave displacement in local space (mesh is world-aligned)
  const w1 = sin(positionLocal.x.mul(0.45).add(uTime.mul(1.8)))
    .mul(cos(positionLocal.z.mul(0.42).add(uTime.mul(1.4))));
  const w2 = sin(positionLocal.x.add(positionLocal.z).mul(0.85).sub(uTime.mul(2.3)));
  const waveH = w1.mul(0.045).add(w2.mul(0.025));

  // Fragment-level ripple normal + Fresnel reflection + sun sparkle + shoreline foam
  const px = positionWorld.x;
  const pz = positionWorld.z;

  const gx = cos(px.mul(2.4).add(uTime.mul(2.2)))
    .mul(cos(pz.mul(2.1).sub(uTime.mul(1.7))))
    .mul(0.11)
    .add(cos(px.mul(5.3).sub(uTime.mul(3.1)).add(pz.mul(3.7))).mul(0.055));
  const gz = sin(px.mul(2.4).add(uTime.mul(2.2)))
    .mul(sin(pz.mul(2.1).sub(uTime.mul(1.7))))
    .mul(-0.11)
    .add(sin(px.mul(9.2).add(pz.mul(8.4)).add(uTime.mul(4.0))).mul(0.045));

  const N = normalize(vec3(gx.negate(), float(1.0), gz.negate()));
  const V = normalize(cameraPosition.sub(positionWorld));
  const L = normalize(uSunDir);
  const H = normalize(L.add(V));

  const depthT = smoothstep(float(0.0), float(3.2), aBankDist);
  const baseWater = mix(uShallowColor, uDeepColor, depthT);

  const ndotv = max(dot(N, V), float(0.0));
  const fresnel = pow(float(1.0).sub(ndotv), float(3.2));
  const reflFactor = clamp(fresnel.mul(0.78).add(0.08), float(0.0), float(0.85));
  const reflWater = mix(baseWater, uSkyColor.mul(0.92), reflFactor);

  const spec = pow(max(dot(N, H), float(0.0)), float(92.0));
  const litWater = reflWater.add(vec3(1.0, 0.98, 0.88).mul(spec.mul(1.15)));

  const foamPhase = aBankDist
    .mul(5.2)
    .sub(uTime.mul(2.6))
    .add(sin(px.mul(0.7).add(pz.mul(0.6))).mul(1.4));
  const foamMask = float(1.0)
    .sub(smoothstep(float(0.0), float(1.18), aBankDist))
    .mul(smoothstep(float(-0.2), float(0.6), sin(foamPhase)));
  const finalCol = mix(litWater, vec3(0.96, 0.99, 1.0), foamMask.mul(0.72));
  const finalAlpha = mix(float(0.76), float(0.92), depthT);

  const mat = new MeshBasicNodeMaterial({ transparent: true });
  mat.positionNode = vec3(positionLocal.x, positionLocal.y.add(waveH), positionLocal.z);
  mat.colorNode = finalCol;
  mat.opacityNode = finalAlpha;
  mat.uniforms = { uTime, uSunDir, uSkyColor, uShallowColor, uDeepColor };
  return mat;
}

export function createFountainWaterMaterial() {
  const uTime = uniform(0);
  const uSkyColor = uniform(new THREE.Color('#cceeff'));

  // Fountain disc is a CircleGeometry rotated -PI/2 around X, so local XY is radial and local +Z is world +Y
  const dLocal = length(positionLocal.xy);
  const waveZ = sin(dLocal.mul(6.0).sub(uTime.mul(5.0))).mul(0.025);

  const dWorld = length(positionWorld.xz);
  const ring = smoothstep(float(0.55), float(1.0), sin(dWorld.mul(8.5).sub(uTime.mul(5.5))));
  const baseCol = mix(vec3(0.32, 0.82, 0.96), uSkyColor, float(0.25));
  const finalCol = baseCol.add(vec3(0.85, 0.97, 1.0).mul(ring.mul(0.35)));

  const mat = new MeshBasicNodeMaterial({ transparent: true });
  mat.positionNode = vec3(positionLocal.x, positionLocal.y, positionLocal.z.add(waveZ));
  mat.colorNode = finalCol;
  mat.opacityNode = float(0.84);
  mat.uniforms = { uTime, uSkyColor };
  return mat;
}

export function createCanalLilyPads(
  getRadiusFn = getRiverCenterRadius,
  halfWidth = PARK_CONSTANTS.RIVER_HALF_WIDTH,
  bridgeSpecs = BRIDGE_SPECS
) {
  const group = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: '#56a84f', roughness: 0.65, side: THREE.DoubleSide });
  const petalWhite = new THREE.MeshStandardMaterial({ color: '#fff5f8', roughness: 0.45 });
  const petalPink = new THREE.MeshStandardMaterial({ color: '#ff9ec2', roughness: 0.45 });
  const stamenGold = new THREE.MeshStandardMaterial({ color: '#ffd447', roughness: 0.4 });

  const padMatrices = [];
  const pinkPetalMatrices = [];
  const whitePetalMatrices = [];
  const stamenMatrices = [];

  let seed = 888;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const clusterDummy = new THREE.Object3D();
  const partDummy = new THREE.Object3D();
  const worldMat = new THREE.Matrix4();

  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + (rand() - 0.5) * 0.06;
    const rMid = getRadiusFn(a);
    const side = i % 2 === 0 ? -1 : 1;
    const r = rMid + side * (halfWidth - 1.15 - rand() * 0.85);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;

    const nearBridge = bridgeSpecs.some((b) => Math.hypot(x - b.cx, z - b.cz) < 7.2);
    if (nearBridge) continue;

    clusterDummy.position.set(x, -0.20, z);
    clusterDummy.rotation.set(0, rand() * Math.PI * 2, 0);
    clusterDummy.scale.setScalar(1);
    clusterDummy.updateMatrix();

    const padScale = 0.85 + rand() * 0.4;
    partDummy.position.set(0, 0, 0);
    partDummy.rotation.set(0, 0, 0);
    partDummy.scale.set(padScale, 1, padScale);
    partDummy.updateMatrix();
    padMatrices.push(worldMat.multiplyMatrices(clusterDummy.matrix, partDummy.matrix).clone());

    if (i % 2 === 0) {
      const targetList = i % 4 === 0 ? pinkPetalMatrices : whitePetalMatrices;
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2;
        partDummy.position.set(Math.cos(pa) * 0.12, 0.09, Math.sin(pa) * 0.12);
        partDummy.rotation.set(Math.sin(pa) * 0.7, 0, -Math.cos(pa) * 0.7);
        partDummy.scale.setScalar(1);
        partDummy.updateMatrix();
        targetList.push(worldMat.multiplyMatrices(clusterDummy.matrix, partDummy.matrix).clone());
      }
      partDummy.position.set(0, 0.12, 0);
      partDummy.rotation.set(0, 0, 0);
      partDummy.scale.setScalar(1);
      partDummy.updateMatrix();
      stamenMatrices.push(worldMat.multiplyMatrices(clusterDummy.matrix, partDummy.matrix).clone());
    }
  }

  const addInst = (geo, mat, matrices) => {
    if (matrices.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  };

  addInst(new THREE.CylinderGeometry(0.52, 0.45, 0.03, 14, 1, false, 0, Math.PI * 1.82), padMat, padMatrices);
  addInst(new THREE.ConeGeometry(0.11, 0.26, 6), petalPink, pinkPetalMatrices);
  addInst(new THREE.ConeGeometry(0.11, 0.26, 6), petalWhite, whitePetalMatrices);
  addInst(new THREE.SphereGeometry(0.08, 8, 8), stamenGold, stamenMatrices);

  // Return a single animated bobbing group instead of 480 separate draw calls
  return { group, items: [{ mesh: group, phase: 0, isGroup: true }] };
}

import * as THREE from 'three';
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
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.75, 0.4).normalize() },
      uSkyColor: { value: new THREE.Color('#cceeff') },
      uShallowColor: { value: new THREE.Color('#6ae8f4') },
      uDeepColor: { value: new THREE.Color('#196c9e') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aBankDist;
      varying vec3 vWorldPos;
      varying float vBankDist;
      varying vec3 vNormalApprox;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vBankDist = aBankDist;

        float w1 = sin(world.x * 0.45 + uTime * 1.8) * cos(world.z * 0.42 + uTime * 1.4);
        float w2 = sin((world.x + world.z) * 0.85 - uTime * 2.3);
        float waveH = w1 * 0.045 + w2 * 0.025;
        world.y += waveH;

        float dx = 0.45 * cos(world.x * 0.45 + uTime * 1.8) * cos(world.z * 0.42 + uTime * 1.4) * 0.045
                 + 0.85 * cos((world.x + world.z) * 0.85 - uTime * 2.3) * 0.025;
        float dz = -0.42 * sin(world.x * 0.45 + uTime * 1.8) * sin(world.z * 0.42 + uTime * 1.4) * 0.045
                 + 0.85 * cos((world.x + world.z) * 0.85 - uTime * 2.3) * 0.025;
        vNormalApprox = normalize(vec3(-dx, 1.0, -dz));

        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSkyColor;
      uniform vec3 uShallowColor;
      uniform vec3 uDeepColor;

      varying vec3 vWorldPos;
      varying float vBankDist;
      varying vec3 vNormalApprox;

      vec3 rippleNormal(vec2 p, float t) {
        float n1 = sin(p.x * 2.4 + t * 2.2) * cos(p.y * 2.1 - t * 1.7);
        float n2 = sin(p.x * 5.3 - t * 3.1 + p.y * 3.7);
        float n3 = cos(p.x * 9.2 + p.y * 8.4 + t * 4.0);
        float gx = cos(p.x * 2.4 + t * 2.2) * cos(p.y * 2.1 - t * 1.7) * 0.09 + cos(p.x * 5.3 - t * 3.1 + p.y * 3.7) * 0.05;
        float gz = -sin(p.x * 2.4 + t * 2.2) * sin(p.y * 2.1 - t * 1.7) * 0.09 + sin(p.x * 9.2 + p.y * 8.4 + t * 4.0) * 0.04;
        return normalize(vec3(-gx, 1.0, -gz) + vec3(0.0, (n1 + n2 + n3) * 0.01, 0.0));
      }

      void main() {
        vec3 N = normalize(vNormalApprox + rippleNormal(vWorldPos.xz, uTime) * 0.65);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + V);

        float depthT = smoothstep(0.0, 3.2, vBankDist);
        vec3 baseWater = mix(uShallowColor, uDeepColor, depthT);

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
        vec3 waterCol = mix(baseWater, uSkyColor * 0.92, clamp(fresnel * 0.78 + 0.08, 0.0, 0.85));

        float spec = pow(max(dot(N, H), 0.0), 92.0);
        waterCol += vec3(1.0, 0.98, 0.88) * spec * 1.15;

        float foamWave = sin(vBankDist * 5.2 - uTime * 2.6 + sin(vWorldPos.x * 0.7 + vWorldPos.z * 0.6) * 1.4);
        float foamMask = (1.0 - smoothstep(0.0, 1.18, vBankDist)) * smoothstep(-0.2, 0.6, foamWave);
        waterCol = mix(waterCol, vec3(0.96, 0.99, 1.0), foamMask * 0.72);

        float alpha = mix(0.76, 0.92, depthT);
        gl_FragColor = vec4(waterCol, alpha);
      }
    `,
  });
}

export function createFountainWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSkyColor: { value: new THREE.Color('#cceeff') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float d = length(world.xz);
        world.y += sin(d * 6.0 - uTime * 5.0) * 0.025;
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSkyColor;
      varying vec3 vWorldPos;
      void main() {
        float d = length(vWorldPos.xz);
        float ring = smoothstep(0.55, 1.0, sin(d * 8.5 - uTime * 5.5));
        vec3 col = mix(vec3(0.32, 0.82, 0.96), uSkyColor, 0.25);
        col += vec3(0.85, 0.97, 1.0) * ring * 0.35;
        gl_FragColor = vec4(col, 0.84);
      }
    `,
  });
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

  const items = [];
  let seed = 888;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + (rand() - 0.5) * 0.06;
    const rMid = getRadiusFn(a);
    const side = i % 2 === 0 ? -1 : 1;
    const r = rMid + side * (halfWidth - 1.15 - rand() * 0.85);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;

    // Skip directly under any of the 5 asymmetric bridges
    const nearBridge = bridgeSpecs.some((b) => Math.hypot(x - b.cx, z - b.cz) < 7.2);
    if (nearBridge) continue;

    const cluster = new THREE.Group();
    cluster.position.set(x, -0.20, z);
    cluster.rotation.y = rand() * Math.PI * 2;

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 + rand() * 0.22, 0.45, 0.03, 18, 1, false, 0, Math.PI * 1.82),
      padMat
    );
    cluster.add(pad);

    if (i % 2 === 0) {
      const flower = new THREE.Group();
      flower.position.y = 0.04;
      const pMat = i % 4 === 0 ? petalPink : petalWhite;
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 6), pMat);
        petal.position.set(Math.cos(pa) * 0.12, 0.05, Math.sin(pa) * 0.12);
        petal.rotation.z = -Math.cos(pa) * 0.7;
        petal.rotation.x = Math.sin(pa) * 0.7;
        flower.add(petal);
      }
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), stamenGold);
      center.position.y = 0.08;
      flower.add(center);
      cluster.add(flower);
    }

    group.add(cluster);
    items.push({ mesh: cluster, phase: rand() * Math.PI * 2 });
  }

  return { group, items };
}

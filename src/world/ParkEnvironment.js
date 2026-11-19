import * as THREE from 'three';
import {
  createFeltMaterial,
  createPlushMaterial,
  loadTiledTexture,
  SharedMaterials,
} from './PlushMaterials.js';
import { createJellycatCharacter, loadComfyGLB } from './CharacterFactory.js';
import {
  BRIDGE_SPECS,
  CASTLE_PLATEAU,
  CURVED_PATH_ROUTES,
  getRiverCenterRadius,
  PARK_CONSTANTS,
  ZONE_CENTERS,
} from './ParkLayout.js';
import {
  createCanalLilyPads,
  createCanalWaterMaterial,
  createFountainWaterMaterial,
  createMeanderingRiverGeometry,
  createRiverBankCurbGeometry,
} from './WaterShader.js';

function createOnionDomeGeometry(radius = 3.2, height = 6.8) {
  const pts = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r;
    if (t < 0.28) {
      const k = t / 0.28;
      r = radius * (0.86 + 0.22 * Math.sin(k * Math.PI * 0.5));
    } else {
      const k = (t - 0.28) / 0.72;
      r = radius * 1.08 * Math.pow(Math.cos(k * Math.PI * 0.5), 1.45);
    }
    pts.push(new THREE.Vector2(Math.max(0.01, r), t * height));
  }
  return new THREE.LatheGeometry(pts, 40);
}

/**
 * Generates an extruded ground annular sector conforming to getRiverCenterRadius().
 */
function createMeanderingLandRingGeometry({
  isInner = true,
  segs = 240,
  radialSteps = 8,
  outerRadius = 132,
}) {
  const geom = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const angle = u * Math.PI * 2;
    const rMid = getRiverCenterRadius(angle);
    const sx = Math.sin(angle);
    const cz = Math.cos(angle);

    const rStart = isInner ? 0.0 : rMid + PARK_CONSTANTS.RIVER_HALF_WIDTH - 0.15;
    const rEnd = isInner ? rMid - PARK_CONSTANTS.RIVER_HALF_WIDTH + 0.15 : outerRadius;

    for (let j = 0; j <= radialSteps; j++) {
      const v = j / radialSteps;
      const r = THREE.MathUtils.lerp(rStart, rEnd, v);
      const x = sx * r;
      const z = cz * r;
      positions.push(x, 0, z);
      uvs.push(x * 0.12, z * 0.12);
    }
  }

  const stride = radialSteps + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radialSteps; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a smooth curved cobblestone/stone walkway ribbon + side curbs from a point array.
 */
function createCurvedPathMesh(route, pathMat, curbMat, layout) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const steps = Math.max(24, route.points.length * 14);
  const pts = curve.getPoints(steps);

  const positions = [];
  const uvs = [];
  const indices = [];

  const leftCurbPts = [];
  const rightCurbPts = [];

  let accumLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) accumLen += p.distanceTo(pts[i - 1]);

    const t = i / (pts.length - 1);
    const tangent = curve.getTangentAt(t).setY(0).normalize();
    const normalSide = new THREE.Vector3(-tangent.z, 0, tangent.x);

    // Dip cleanly below bridge abutments & river surface when crossing a bridge approach
    const inWater = layout.isInRiver(p.x, p.z, 0.4);
    const y = inWater ? -0.45 : 0.04;

    const lPos = p.clone().addScaledVector(normalSide, -route.halfWidth);
    const rPos = p.clone().addScaledVector(normalSide, route.halfWidth);
    positions.push(lPos.x, y, lPos.z, rPos.x, y, rPos.z);
    uvs.push(0, accumLen * 0.25, 1, accumLen * 0.25);

    if (!inWater) {
      leftCurbPts.push(p.clone().addScaledVector(normalSide, -(route.halfWidth + 0.16)).setY(0.11));
      rightCurbPts.push(p.clone().addScaledVector(normalSide, route.halfWidth + 0.16).setY(0.11));
    }
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2 + 1;
    const d = (i + 1) * 2;
    indices.push(a, b, d, b, c, d);
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setIndex(indices);
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.computeVertexNormals();

  const roadMesh = new THREE.Mesh(roadGeo, pathMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // Build curb strips for continuous non-water stretches
  for (const curbList of [leftCurbPts, rightCurbPts]) {
    if (curbList.length < 4) continue;
    // Split at river jumps (> 5m gap)
    let chunk = [curbList[0]];
    const emitChunk = (arr) => {
      if (arr.length < 2) return;
      const cCurve = new THREE.CatmullRomCurve3(arr);
      const curbMesh = new THREE.Mesh(
        new THREE.TubeGeometry(cCurve, Math.max(8, arr.length), 0.16, 6, false),
        curbMat
      );
      curbMesh.scale.y = 0.65;
      curbMesh.receiveShadow = true;
      group.add(curbMesh);
    };
    for (let i = 1; i < curbList.length; i++) {
      if (curbList[i].distanceTo(curbList[i - 1]) > 5.0) {
        emitChunk(chunk);
        chunk = [curbList[i]];
      } else {
        chunk.push(curbList[i]);
      }
    }
    emitChunk(chunk);
  }

  return group;
}

export class ParkEnvironment {
  constructor(scene, audioManager, layout) {
    this.scene = scene;
    this.audio = audioManager;
    this.layout = layout;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.timeMode = 'day';
    this.paradeActive = false;
    this.paradeAngle = 0;

    this.nightLights = [];
    this.balloons = [];
    this.fireworks = [];
    this.fireworkTimer = 0;
    this.paradeCoins = [];
    this.paradeCoinTimer = 0;
    this.fountainDroplets = [];
    this.waterfallDrops = [];
    this.mushrooms = [];
    this.canalShowDancers = [];
    this.windmillRotor = null;
    this.waterwheel = null;
    this.lighthouseBeacon = null;
    this.videoEl = null;
    this.jumboMat = null;
    this.exhibitModels = [];
    this.pavingMaterials = [];
    this.canalWaterMat = null;
    this.fountainWaterMat = null;
    this.lilyPads = [];
    this.lampBulbMat = new THREE.MeshStandardMaterial({
      color: '#fff6d1',
      emissive: '#ffcf66',
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });

    this._buildLighting();
    this._buildGroundAndCanal();
    this._buildPerimeterBermAndMountains();
    this._buildBridges();
    this._buildCenterFountainAndPlanters();
    this._buildEntranceGate();
    this._buildCastlePlateauAndExhibition();
    this._buildMainStreetTown();
    this._buildThemedZoneLandmarks();
    this._buildThemedZoneVillages();
    this._buildHighDensityFoliageAndGardens();
    this._buildParadeFloat();
  }

  _buildLighting() {
    this.hemiLight = new THREE.HemisphereLight('#fff5f9', '#7db582', 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff2dc', 1.32);
    this.sunLight.position.set(48, 76, 42);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 280;
    const d = 115;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight('#c4a4ed', 0.35);
    this.fillLight.position.set(-45, 32, -45);
    this.scene.add(this.fillLight);
  }

  _buildGroundAndCanal() {
    const grassTex = loadTiledTexture('./assets/textures/tex_grass.png', 4, 4);
    const cobbleTex = loadTiledTexture('./assets/textures/tex_cobblestone.png', 10, 10);
    const pathTex = loadTiledTexture('./assets/textures/tex_pathway.png', 2, 1);
    const patisserieTex = loadTiledTexture('./assets/textures/tex_patisserie_tile.png', 6, 6);
    const mossTex = loadTiledTexture('./assets/textures/tex_forest_moss.png', 5, 5);
    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 5, 10);

    const lawnMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: '#bfe3b4',
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Organic asymmetric inner island & outer park terrain cutouts hugging the meandering river
    const innerLand = new THREE.Mesh(
      createMeanderingLandRingGeometry({ isInner: true, segs: 240, radialSteps: 8 }),
      lawnMat
    );
    innerLand.receiveShadow = true;
    this.group.add(innerLand);

    const outerLand = new THREE.Mesh(
      createMeanderingLandRingGeometry({ isInner: false, segs: 240, radialSteps: 10, outerRadius: 170 }),
      lawnMat
    );
    outerLand.receiveShadow = true;
    this.group.add(outerLand);

    // Sub-surface riverbed disc (safely below -0.22m water surface across the whole channel band)
    const waterBed = new THREE.Mesh(
      new THREE.RingGeometry(46, 86, 128),
      new THREE.MeshStandardMaterial({ color: '#174663', roughness: 0.95 })
    );
    waterBed.rotation.x = -Math.PI / 2;
    waterBed.position.y = -0.82;
    this.group.add(waterBed);

    // Sculpted sandstone river embankments tracing both meandering banks
    const bankMat = new THREE.MeshStandardMaterial({ color: '#dfd0c2', roughness: 0.72 });
    const innerBank = new THREE.Mesh(
      createRiverBankCurbGeometry(-1, getRiverCenterRadius, PARK_CONSTANTS.RIVER_HALF_WIDTH, 220, 0.9, 0.48),
      bankMat
    );
    const outerBank = new THREE.Mesh(
      createRiverBankCurbGeometry(1, getRiverCenterRadius, PARK_CONSTANTS.RIVER_HALF_WIDTH, 220, 0.9, 0.48),
      bankMat
    );
    innerBank.receiveShadow = true;
    outerBank.receiveShadow = true;
    this.group.add(innerBank, outerBank);

    // Meandering animated GLSL river surface
    this.canalWaterMat = createCanalWaterMaterial();
    const waterMesh = new THREE.Mesh(
      createMeanderingRiverGeometry(getRiverCenterRadius, PARK_CONSTANTS.RIVER_HALF_WIDTH, 260, 12),
      this.canalWaterMat
    );
    waterMesh.position.y = -0.22;
    this.group.add(waterMesh);

    const lilies = createCanalLilyPads(getRiverCenterRadius, PARK_CONSTANTS.RIVER_HALF_WIDTH, BRIDGE_SPECS);
    this.group.add(lilies.group);
    this.lilyPads = lilies.items;

    // Zone Paving Materials
    const plazaMat = new THREE.MeshStandardMaterial({
      map: cobbleTex,
      color: '#f2e8e2',
      roughness: 0.78,
      metalness: 0.04,
    });
    const pathMat = new THREE.MeshStandardMaterial({
      map: pathTex,
      color: '#f2e8e0',
      roughness: 0.76,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const patisserieMat = new THREE.MeshStandardMaterial({
      map: patisserieTex,
      color: '#f7e6e8',
      roughness: 0.74,
      metalness: 0.04,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      map: mossTex,
      color: '#d8e8c8',
      roughness: 0.88,
      metalness: 0.0,
    });
    const pierWoodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: '#deb88a',
      roughness: 0.72,
      metalness: 0.05,
    });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#dac7e2', roughness: 0.68 });
    this.pavingMaterials.push(plazaMat, pathMat, patisserieMat, pierWoodMat);

    // Hub Plaza
    const mainPlaza = new THREE.Mesh(new THREE.CylinderGeometry(24.2, 24.4, 0.16, 72), plazaMat);
    mainPlaza.position.y = 0.0;
    mainPlaza.receiveShadow = true;
    this.group.add(mainPlaza);

    const innerCurb = new THREE.Mesh(new THREE.TorusGeometry(16.0, 0.18, 10, 72), curbMat);
    innerCurb.rotation.x = Math.PI / 2;
    innerCurb.position.y = 0.10;
    const outerCurb = new THREE.Mesh(new THREE.TorusGeometry(24.2, 0.22, 10, 72), curbMat);
    outerCurb.rotation.x = Math.PI / 2;
    outerCurb.position.y = 0.10;
    this.group.add(innerCurb, outerCurb);

    // Castle Forecourt & Main Entrance Plaza
    const forecourt = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.8, 0.16, 48), plazaMat);
    forecourt.position.set(-6, 0.0, -19.0);
    forecourt.receiveShadow = true;
    this.group.add(forecourt);

    const southPlaza = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.5, 0.16, 56), plazaMat);
    southPlaza.position.set(ZONE_CENTERS.mainGate.x, 0.0, ZONE_CENTERS.mainGate.z);
    southPlaza.receiveShadow = true;
    this.group.add(southPlaza);

    // Zone 2 SE Patisserie Bay Tiled Plazas
    const seCafePlaza = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.6, 0.14, 48), patisserieMat);
    seCafePlaza.position.set(76, 0.01, 39);
    seCafePlaza.receiveShadow = true;
    const seInnerPatio = new THREE.Mesh(new THREE.CylinderGeometry(16.5, 16.8, 0.12, 48), patisserieMat);
    seInnerPatio.position.set(24, 0.01, 27);
    seInnerPatio.receiveShadow = true;
    this.group.add(seCafePlaza, seInnerPatio);

    // Zone 4 W/NW Bunny's Harvest Forest Moss Patches
    for (const [mx, mz, mr] of [
      [-80, -24, 12.2],
      [-80, 21, 18.0],
      [-30, 22, 10.5],
      [-34, -16, 14.5],
    ]) {
      const mossPatch = new THREE.Mesh(new THREE.CylinderGeometry(mr, mr + 0.4, 0.09, 36), mossMat);
      mossPatch.position.set(mx, 0.01, mz);
      mossPatch.receiveShadow = true;
      this.group.add(mossPatch);
    }

    // Zone 5 East Neon Carnival Pier Wooden Boardwalk Deck
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.18, 46.0), pierWoodMat);
    pierDeck.position.set(80.0, 0.02, 4.0);
    pierDeck.rotation.y = 0.08;
    pierDeck.receiveShadow = true;
    this.group.add(pierDeck);

    // Curved organic cobblestone walkways connecting every bridge and themed zone
    for (const route of CURVED_PATH_ROUTES) {
      this.group.add(createCurvedPathMesh(route, pathMat, curbMat, this.layout));
    }
  }

  _buildBridges() {
    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 2, 2);
    const styles = {
      royal: { rail: '#865382', post: '#e8d7ce', lamp: '#ffd466' },
      patisserie: { rail: '#e089ad', post: '#fff0e6', lamp: '#ffaad4' },
      thrill: { rail: '#593b78', post: '#cfa86b', lamp: '#c88cff' },
      forest: { rail: '#8f5f3d', post: '#e2cba4', lamp: '#ffde8a' },
    };

    for (const b of BRIDGE_SPECS) {
      const st = styles[b.style] || styles.royal;
      const deckMat = new THREE.MeshStandardMaterial({ map: woodTex, color: '#deb07e', roughness: 0.72 });
      const stoneMat = new THREE.MeshStandardMaterial({ color: st.post, roughness: 0.65 });
      const railMat = new THREE.MeshStandardMaterial({ color: st.rail, roughness: 0.55 });
      const orbMat = new THREE.MeshStandardMaterial({
        color: '#fff6da',
        emissive: st.lamp,
        emissiveIntensity: 0.65,
      });

      const bridge = new THREE.Group();
      bridge.position.set(b.cx, 0, b.cz);
      bridge.rotation.y = b.angle;
      this.group.add(bridge);

      const segs = 24;
      const spanLen = b.halfSpan * 2;
      const segLen = spanLen / segs + 0.08;
      const deckW = b.halfWidth * 2;

      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs;
        const along = -b.halfSpan + t * spanLen;
        const y = 0.08 + Math.sin(t * Math.PI) * PARK_CONSTANTS.BRIDGE_PEAK_Y;
        const nextT = Math.min(1, t + 0.02);
        const slope =
          ((Math.sin(nextT * Math.PI) - Math.sin(t * Math.PI)) * PARK_CONSTANTS.BRIDGE_PEAK_Y) /
          (0.02 * spanLen);

        const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.24, segLen), deckMat);
        plank.position.set(0, y - 0.1, along);
        plank.rotation.x = -Math.atan(slope);
        plank.castShadow = true;
        plank.receiveShadow = true;
        bridge.add(plank);

        // Arched stone side stringers
        if (i % 2 === 0) {
          for (const sideX of [-(b.halfWidth - 0.22), b.halfWidth - 0.22]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.05, 10), railMat);
            post.position.set(sideX, y + 0.45, along);
            bridge.add(post);
          }
        }
      }

      // Smooth top handrails curving cleanly along both edges of the arched bridge
      for (const sideX of [-(b.halfWidth - 0.22), b.halfWidth - 0.22]) {
        const railPts = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          railPts.push(
            new THREE.Vector3(
              sideX,
              0.08 + Math.sin(t * Math.PI) * PARK_CONSTANTS.BRIDGE_PEAK_Y + 0.98,
              -b.halfSpan + t * spanLen
            )
          );
        }
        const railTube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 24, 0.1, 8, false),
          SharedMaterials.gold
        );
        bridge.add(railTube);

        // Twin stone piers & glowing globe lamps at both ends
        for (const endZ of [-b.halfSpan + 0.5, b.halfSpan - 0.5]) {
          const abutment = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.1, 0.75), stoneMat);
          abutment.position.set(sideX, 1.05, endZ);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.55, 4), SharedMaterials.gold);
          cap.rotation.y = Math.PI / 4;
          cap.position.set(sideX, 2.35, endZ);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), orbMat);
          lamp.position.set(sideX, 2.75, endZ);
          bridge.add(abutment, cap, lamp);
        }
      }
    }
  }

  _buildCenterFountainAndPlanters() {
    const fountain = new THREE.Group();
    this.group.add(fountain);

    const marbleMat = new THREE.MeshStandardMaterial({ color: '#ead8cd', roughness: 0.45 });
    const trimMarble = new THREE.MeshStandardMaterial({ color: '#dac3d8', roughness: 0.55 });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.24, 48), trimMarble);
    plinth.position.y = 0.12;
    plinth.receiveShadow = true;
    const basinWall = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.44, 16, 56), marbleMat);
    basinWall.rotation.x = Math.PI / 2;
    basinWall.position.y = 0.52;
    basinWall.castShadow = true;

    this.fountainWaterMat = createFountainWaterMaterial();
    const waterPool = new THREE.Mesh(new THREE.CircleGeometry(3.85, 48), this.fountainWaterMat);
    waterPool.rotation.x = -Math.PI / 2;
    waterPool.position.y = 0.62;

    const tierPts = [
      new THREE.Vector2(1.4, 0.2),
      new THREE.Vector2(0.85, 0.8),
      new THREE.Vector2(0.75, 1.4),
      new THREE.Vector2(2.35, 1.7),
      new THREE.Vector2(2.45, 1.85),
      new THREE.Vector2(0.7, 1.9),
      new THREE.Vector2(0.55, 2.7),
      new THREE.Vector2(1.45, 2.9),
      new THREE.Vector2(1.5, 3.02),
      new THREE.Vector2(0.45, 3.08),
      new THREE.Vector2(0.38, 3.65),
    ];
    const centerStem = new THREE.Mesh(new THREE.LatheGeometry(tierPts, 36), marbleMat);
    centerStem.castShadow = true;

    const rim1 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.09, 10, 36), SharedMaterials.gold);
    rim1.rotation.x = Math.PI / 2;
    rim1.position.y = 1.82;
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.08, 10, 32), SharedMaterials.gold);
    rim2.rotation.x = Math.PI / 2;
    rim2.position.y = 2.98;

    const topAubergine = createJellycatCharacter('aubergine_standard', { scale: 1.2 });
    topAubergine.position.y = 3.65;
    fountain.add(plinth, basinWall, waterPool, centerStem, rim1, rim2, topAubergine);

    const jetMat = new THREE.MeshBasicMaterial({ color: '#d8f6ff', transparent: true, opacity: 0.55 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pts = [];
      for (let s = 0; s <= 10; s++) {
        const t = s / 10;
        const r = 0.4 + t * 2.5;
        const y = 3.1 + (2.6 * t - 5.1 * t * t);
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const stream = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.035, 6, false), jetMat);
      fountain.add(stream);
    }

    for (let i = 0; i < 28; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#e6fbff', transparent: true, opacity: 0.82 })
      );
      drop.userData = { angle: (i / 28) * Math.PI * 2, phase: (i % 7) / 7 };
      fountain.add(drop);
      this.fountainDroplets.push(drop);
    }

    const stalkMat = new THREE.MeshStandardMaterial({ color: '#5b8a4e', roughness: 0.85 });
    const lavMat = new THREE.MeshStandardMaterial({ color: '#9f6be0', roughness: 0.72 });
    const stalkGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6);
    const bloomGeo = new THREE.CapsuleGeometry(0.06, 0.22, 4, 8);
    const stalkMats = [];
    const bloomMats = [];
    const dummy = new THREE.Object3D();

    for (const quad of [0.25, 0.75, 1.25, 1.75]) {
      const baseAng = quad * Math.PI;
      const bed = new THREE.Mesh(
        new THREE.TorusGeometry(12.0, 0.95, 10, 24, Math.PI * 0.26),
        new THREE.MeshStandardMaterial({ color: '#dcc7e2', roughness: 0.75 })
      );
      bed.rotation.x = Math.PI / 2;
      bed.rotation.z = -(baseAng - Math.PI * 0.13);
      bed.position.y = 0.2;
      bed.scale.set(1, 1, 0.45);
      fountain.add(bed);

      for (let k = 0; k < 100; k++) {
        const a = baseAng + ((k / 100) - 0.5) * Math.PI * 0.24;
        const r = 11.4 + (((k * 37) % 100) / 100) * 1.2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        dummy.position.set(x, 0.48, z);
        dummy.rotation.set(((k % 7) - 3) * 0.04, k * 0.6, ((k % 5) - 2) * 0.04);
        dummy.scale.setScalar(0.85 + (k % 4) * 0.12);
        dummy.updateMatrix();
        stalkMats.push(dummy.matrix.clone());
        dummy.position.y = 0.74;
        dummy.updateMatrix();
        bloomMats.push(dummy.matrix.clone());
      }
    }

    const stalkInst = new THREE.InstancedMesh(stalkGeo, stalkMat, stalkMats.length);
    const bloomInst = new THREE.InstancedMesh(bloomGeo, lavMat, bloomMats.length);
    stalkMats.forEach((m, i) => stalkInst.setMatrixAt(i, m));
    bloomMats.forEach((m, i) => bloomInst.setMatrixAt(i, m));
    fountain.add(stalkInst, bloomInst);
  }

  _buildEntranceGate() {
    const gate = new THREE.Group();
    gate.position.copy(ZONE_CENTERS.mainGate);
    gate.rotation.y = BRIDGE_SPECS[0].angle;
    this.group.add(gate);

    const wallTex = loadTiledTexture('./assets/textures/tex_castle_wall.png', 2, 3);
    const domeTex = loadTiledTexture('./assets/textures/tex_onion_dome.png', 3, 2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#9c6890', roughness: 0.84 });
    const domeMat = new THREE.MeshPhysicalMaterial({ map: domeTex, color: '#7b924e', roughness: 0.48, metalness: 0.15, sheen: 0.35 });
    const creamMat = new THREE.MeshStandardMaterial({ color: '#e6d2c3', roughness: 0.64 });

    for (const xSign of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 9.2, 28), wallMat);
      tower.position.set(xSign * 6.8, 4.6, 0);
      tower.castShadow = true;
      const cornice = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.25, 10, 28), creamMat);
      cornice.rotation.x = Math.PI / 2;
      cornice.position.set(xSign * 6.8, 9.2, 0);
      const dome = new THREE.Mesh(createOnionDomeGeometry(2.8, 5.2), domeMat);
      dome.position.set(xSign * 6.8, 9.3, 0);
      dome.castShadow = true;
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), SharedMaterials.gold);
      finial.position.set(xSign * 6.8, 14.9, 0);

      const ticketBooth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.8, 2.2), createPlushMaterial('#7e5b79'));
      ticketBooth.position.set(xSign * 6.8, 1.4, 2.2);
      const boothAwning = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.0, 12), createFeltMaterial('#ffe6ef'));
      boothAwning.position.set(xSign * 6.8, 3.2, 2.2);
      gate.add(tower, cornice, dome, finial, ticketBooth, boothAwning);
    }

    const archBridge = new THREE.Mesh(new THREE.BoxGeometry(14.5, 1.9, 2.4), wallMat);
    archBridge.position.set(0, 7.1, 0);
    archBridge.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.25, 2.6), SharedMaterials.gold);
    trim.position.set(0, 8.1, 0);
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), SharedMaterials.gold);
    crown.position.set(0, 9.3, 0);
    gate.add(archBridge, trim, crown);
  }

  _buildCastlePlateauAndExhibition() {
    const wallTex = loadTiledTexture('./assets/textures/tex_castle_wall.png', 3, 2);
    const domeTex = loadTiledTexture('./assets/textures/tex_onion_dome.png', 4, 2);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: '#a36e96',
      roughness: 0.86,
      metalness: 0.02,
    });
    const darkWallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: '#825277',
      roughness: 0.88,
    });
    const domeMat = new THREE.MeshPhysicalMaterial({
      map: domeTex,
      color: '#7a914d',
      roughness: 0.46,
      metalness: 0.16,
      sheen: 0.35,
      sheenColor: new THREE.Color('#c8d99a'),
    });
    const creamTrimMat = new THREE.MeshStandardMaterial({ color: '#e2ccbd', roughness: 0.66 });
    const stainedGlassMat = new THREE.MeshStandardMaterial({
      color: '#93c5fd',
      emissive: '#7c3aed',
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });

    // === 1. ELEVATED +1.8m ROYAL CASTLE TERRACE PLATEAU ===
    const plateauGroup = new THREE.Group();
    plateauGroup.position.set(CASTLE_PLATEAU.x, 0, CASTLE_PLATEAU.z);
    this.group.add(plateauGroup);

    const terraceCore = new THREE.Mesh(
      new THREE.CylinderGeometry(CASTLE_PLATEAU.radius, CASTLE_PLATEAU.radius + 0.8, CASTLE_PLATEAU.height + 0.08, 60),
      wallMat
    );
    terraceCore.position.y = (CASTLE_PLATEAU.height + 0.08) / 2;
    terraceCore.receiveShadow = true;
    terraceCore.castShadow = true;

    const terraceFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(CASTLE_PLATEAU.radius - 0.1, CASTLE_PLATEAU.radius - 0.1, 0.14, 60),
      new THREE.MeshStandardMaterial({ map: loadTiledTexture('./assets/textures/tex_cobblestone.png', 5, 5), color: '#f0e2df', roughness: 0.72 })
    );
    terraceFloor.position.y = CASTLE_PLATEAU.height + 0.04;
    terraceFloor.receiveShadow = true;
    plateauGroup.add(terraceCore, terraceFloor);

    // Carved balustrade columns around plateau edge (opening at southern stair mouth!)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wx = CASTLE_PLATEAU.x + Math.sin(a) * (CASTLE_PLATEAU.radius - 0.35);
      const wz = CASTLE_PLATEAU.z + Math.cos(a) * (CASTLE_PLATEAU.radius - 0.35);
      if (wx >= CASTLE_PLATEAU.stairMinX - 0.6 && wx <= CASTLE_PLATEAU.stairMaxX + 0.6 && wz > CASTLE_PLATEAU.z + 8.0) {
        continue;
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.95, 10), creamTrimMat);
      post.position.set(wx - CASTLE_PLATEAU.x, CASTLE_PLATEAU.height + 0.55, wz - CASTLE_PLATEAU.z);
      plateauGroup.add(post);
      if (i % 4 === 0) {
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), SharedMaterials.gold);
        fin.position.set(wx - CASTLE_PLATEAU.x, CASTLE_PLATEAU.height + 1.12, wz - CASTLE_PLATEAU.z);
        plateauGroup.add(fin);
      }
    }

    // === 2. 12-STEP GRAND ROYAL STAIRCASE & RED VELVET RUNNER ===
    const stairGroup = new THREE.Group();
    this.group.add(stairGroup);
    const stepCount = 12;
    const stairW = CASTLE_PLATEAU.stairMaxX - CASTLE_PLATEAU.stairMinX;
    const stairCenterX = (CASTLE_PLATEAU.stairMinX + CASTLE_PLATEAU.stairMaxX) / 2;
    const stairDepth = CASTLE_PLATEAU.stairBottomZ - CASTLE_PLATEAU.stairTopZ;
    const carpetMat = createFeltMaterial('#9b2f6c');

    for (let s = 0; s < stepCount; s++) {
      const t = (s + 0.5) / stepCount;
      const yTop = 0.08 + ((s + 1) / stepCount) * CASTLE_PLATEAU.height;
      const zPos = CASTLE_PLATEAU.stairBottomZ - t * stairDepth;
      const stepGeo = new THREE.BoxGeometry(stairW + 0.4, yTop, stairDepth / stepCount + 0.14);
      const step = new THREE.Mesh(stepGeo, creamTrimMat);
      step.position.set(stairCenterX, yTop / 2, zPos);
      step.receiveShadow = true;
      step.castShadow = true;
      stairGroup.add(step);

      const carpet = new THREE.Mesh(new THREE.BoxGeometry(stairW * 0.48, 0.05, stairDepth / stepCount + 0.12), carpetMat);
      carpet.position.set(stairCenterX, yTop + 0.02, zPos);
      stairGroup.add(carpet);
    }

    // Flanking stair cheek walls with glowing aubergine lanterns
    for (const sx of [CASTLE_PLATEAU.stairMinX - 0.35, CASTLE_PLATEAU.stairMaxX + 0.35]) {
      const bottomPost = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.4, 14), creamTrimMat);
      bottomPost.position.set(sx, 0.7, CASTLE_PLATEAU.stairBottomZ + 0.3);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), this.lampBulbMat);
      orb.position.set(sx, 1.62, CASTLE_PLATEAU.stairBottomZ + 0.3);
      stairGroup.add(bottomPost, orb);
    }

    // === 3. TWIN CASCADE WATERFALLS FLANKING THE PLATEAU ===
    const waterfallMat = new THREE.MeshStandardMaterial({
      color: '#79e7fa',
      emissive: '#38bdf8',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.78,
      roughness: 0.12,
    });
    for (const side of [-1, 1]) {
      const wfX = CASTLE_PLATEAU.x + side * (CASTLE_PLATEAU.radius + 0.25);
      const wfZ = CASTLE_PLATEAU.z + 3.0;
      const spout = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 2.2), creamTrimMat);
      spout.position.set(wfX - side * 0.4, 1.65, wfZ);
      const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.75, 1.85), waterfallMat);
      curtain.position.set(wfX + side * 0.45, 0.85, wfZ);
      const poolRim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.22, 10, 24), creamTrimMat);
      poolRim.rotation.x = Math.PI / 2;
      poolRim.position.set(wfX + side * 0.9, 0.14, wfZ);
      const poolWater = new THREE.Mesh(new THREE.CircleGeometry(1.65, 24), waterfallMat);
      poolWater.rotation.x = -Math.PI / 2;
      poolWater.position.set(wfX + side * 0.9, 0.12, wfZ);
      this.group.add(spout, curtain, poolRim, poolWater);

      for (let d = 0; d < 6; d++) {
        const mist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), waterfallMat);
        mist.userData = { baseX: wfX + side * 0.5, baseZ: wfZ + (d - 2.5) * 0.28, phase: d * 0.18 };
        this.group.add(mist);
        this.waterfallDrops.push(mist);
      }
    }

    // === 4. HIGH-POLY 9-TOWER ROYAL AUBERGINE CASTLE ON ELEVATED PLATEAU ===
    const castle = new THREE.Group();
    castle.position.copy(ZONE_CENTERS.castle);
    this.group.add(castle);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 11.2, 0.65, 36), creamTrimMat);
    plinth.scale.set(1.02, 1.0, 0.72);
    plinth.position.y = 0.32;
    plinth.receiveShadow = true;
    castle.add(plinth);

    const curtainWall = new THREE.Mesh(new THREE.BoxGeometry(16.0, 7.6, 3.2), darkWallMat);
    curtainWall.position.set(0, 4.1, 0.0);
    curtainWall.castShadow = true;
    curtainWall.receiveShadow = true;
    castle.add(curtainWall);

    const innerKeep = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 12.8, 36), wallMat);
    innerKeep.position.set(0, 6.8, -1.4);
    innerKeep.castShadow = true;
    castle.add(innerKeep);

    const gateBlock = new THREE.Mesh(new THREE.BoxGeometry(6.0, 9.0, 3.6), wallMat);
    gateBlock.position.set(0, 4.8, 2.5);
    gateBlock.castShadow = true;
    castle.add(gateBlock);

    const archFrame = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.3, 12, 28, Math.PI), creamTrimMat);
    archFrame.position.set(0, 2.4, 4.35);
    const archVoid = new THREE.Mesh(
      new THREE.CylinderGeometry(1.95, 1.95, 1.2, 24, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#2b1538' })
    );
    archVoid.rotation.z = Math.PI / 2;
    archVoid.rotation.y = Math.PI / 2;
    archVoid.position.set(0, 2.35, 3.85);

    const balcony = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.42, 1.3), creamTrimMat);
    balcony.position.set(0, 6.0, 4.75);
    const roseFrame = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.15, 10, 24), creamTrimMat);
    roseFrame.position.set(0, 7.8, 4.35);
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(0.92, 24), stainedGlassMat);
    roseGlass.position.set(0, 7.8, 4.38);
    const gableRoof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 3.4, 4), domeMat);
    gableRoof.rotation.y = Math.PI / 4;
    gableRoof.position.set(0, 11.0, 2.5);
    castle.add(archFrame, archVoid, balcony, roseFrame, roseGlass, gableRoof);

    const towerSpecs = [
      { x: 0, z: -1.5, r: 3.1, h: 21.0, domeH: 8.2 },
      { x: -3.9, z: 3.9, r: 1.75, h: 12.0, domeH: 4.8 },
      { x: 3.9, z: 3.9, r: 1.75, h: 12.0, domeH: 4.8 },
      { x: -7.2, z: 1.4, r: 2.25, h: 14.8, domeH: 5.8 },
      { x: 7.2, z: 1.4, r: 2.25, h: 14.8, domeH: 5.8 },
      { x: -9.8, z: -1.8, r: 1.9, h: 11.8, domeH: 4.5 },
      { x: 9.8, z: -1.8, r: 1.9, h: 11.8, domeH: 4.5 },
      { x: -4.8, z: -3.3, r: 1.85, h: 16.8, domeH: 5.6 },
      { x: 4.8, z: -3.3, r: 1.85, h: 16.8, domeH: 5.6 },
    ];

    for (const t of towerSpecs) {
      const tower = new THREE.Group();
      tower.position.set(t.x, 0, t.z);

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.94, t.r, t.h, 36), wallMat);
      cyl.position.y = t.h / 2;
      cyl.castShadow = true;
      cyl.receiveShadow = true;

      const cornice = new THREE.Mesh(new THREE.TorusGeometry(t.r * 1.05, 0.22, 12, 36), creamTrimMat);
      cornice.rotation.x = Math.PI / 2;
      cornice.position.y = t.h;
      const neckBand = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 1.02, t.r * 1.02, 0.5, 36), SharedMaterials.gold);
      neckBand.position.y = t.h - 0.45;

      const dome = new THREE.Mesh(createOnionDomeGeometry(t.r * 1.1, t.domeH), domeMat);
      dome.position.y = t.h + 0.08;
      dome.castShadow = true;

      for (let rb = 0; rb < 8; rb++) {
        const ra = (rb / 8) * Math.PI * 2;
        const ribPts = [];
        for (let s = 0; s <= 12; s++) {
          const k = s / 12;
          const rDome =
            k < 0.28
              ? t.r * 1.1 * (0.86 + 0.22 * Math.sin((k / 0.28) * Math.PI * 0.5))
              : t.r * 1.1 * 1.08 * Math.pow(Math.cos(((k - 0.28) / 0.72) * Math.PI * 0.5), 1.45);
          ribPts.push(new THREE.Vector3(Math.cos(ra) * (rDome + 0.04), t.h + 0.08 + k * t.domeH, Math.sin(ra) * (rDome + 0.04)));
        }
        const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 12, 0.05, 6, false), SharedMaterials.gold);
        tower.add(rib);
      }

      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), SharedMaterials.gold);
      finial.position.y = t.h + t.domeH + 0.55;

      for (const wy of [t.h * 0.45, t.h * 0.75]) {
        const wZ = t.r * 0.98;
        const winFrame = new THREE.Mesh(new THREE.BoxGeometry(t.r * 0.56, t.r * 0.92, 0.34), creamTrimMat);
        winFrame.position.set(0, wy, wZ);
        const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(t.r * 0.4, t.r * 0.76), stainedGlassMat);
        winGlass.position.set(0, wy, wZ + 0.19);
        tower.add(winFrame, winGlass);
      }

      tower.add(cyl, cornice, neckBand, dome, finial);
      castle.add(tower);
    }

    // === 5. JUMBO PARADE CINEMA + GLB CASTLE MAQUETTE + 3 AUBERGINE ROYAL BALCONY EXHIBITS ===
    const screenStage = new THREE.Group();
    screenStage.position.set(-19.5, 0, -21);
    screenStage.rotation.y = 0.55;
    this.group.add(screenStage);

    const stageBase = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.75, 2.0), creamTrimMat);
    stageBase.position.y = 0.37;
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(8.0, 4.6, 0.42), SharedMaterials.gold);
    screenFrame.position.set(0, 3.6, 0);
    for (const px of [-4.1, 4.1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 6.0, 16), wallMat);
      p.position.set(px, 3.0, 0);
      screenStage.add(p);
    }

    const texLoader = new THREE.TextureLoader();
    const fallbackTex = texLoader.load('./assets/images/castle_jumbo_frame.png');
    fallbackTex.colorSpace = THREE.SRGBColorSpace;
    this.jumboMat = new THREE.MeshBasicMaterial({ map: fallbackTex });
    const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.16), this.jumboMat);
    screenPlane.position.set(0, 3.6, 0.23);
    screenStage.add(stageBase, screenFrame, screenPlane);
    this.layout.addCollider('circle', -19.5, -21, 3.4);

    // Royal Castle ComfyUI GLB Architectural Maquette at SE Castle Forecourt
    const maquettePed = new THREE.Group();
    maquettePed.position.set(8.0, 0.08, -22.5);
    const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 0.85, 28), creamTrimMat);
    pedBase.position.y = 0.42;
    const pedRing = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.1, 10, 28), SharedMaterials.gold);
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.y = 0.85;
    maquettePed.add(pedBase, pedRing);
    this.group.add(maquettePed);
    this.layout.addCollider('circle', 8.0, -22.5, 2.4);
      loadComfyGLB('./assets/models/castle_royal.glb', 3.4).then((glb) => {
        if (glb) {
          glb.position.y = 0.88;
          maquettePed.add(glb);
          this.exhibitModels.push({ mesh: glb });
        }
      });

      const video = document.createElement('video');
      video.src = './assets/video/jumbo_parade.mp4';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.addEventListener('canplay', () => {
        const vTex = new THREE.VideoTexture(video);
        vTex.colorSpace = THREE.SRGBColorSpace;
        this.jumboMat.map = vTex;
        this.jumboMat.needsUpdate = true;
        video.play().catch(() => { });
      });
      video.load();
      this.videoEl = video;

      const castleLight = new THREE.PointLight('#ffd699', 0, 56);
      castleLight.position.set(0, 16, 12);
      castle.add(castleLight);
      this.nightLights.push({ light: castleLight, maxIntensity: 6.5 });

      // Three Official Aubergine ComfyUI GLB Exhibition Pedestals atop the +1.8m Royal Balcony!
      const exhibitSpecs = [
        { url: './assets/models/aubergine_standard.glb', fallback: 'aubergine_standard', x: -10.5, z: -32.2 },
        { url: './assets/models/aubergine_giant.glb', fallback: 'aubergine_giant', x: -6.0, z: -31.2 },
        { url: './assets/models/aubergine_charm.glb', fallback: 'aubergine_charm', x: -1.5, z: -32.2 },
      ];
      for (const ex of exhibitSpecs) {
        const ped = new THREE.Group();
        ped.position.set(ex.x, CASTLE_PLATEAU.height + 0.08, ex.z);
        const baseCyl = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.82, 24), createPlushMaterial('#d4bce2'));
        baseCyl.position.y = 0.41;
        baseCyl.castShadow = true;
        const trim = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.08, 10, 24), SharedMaterials.gold);
        trim.rotation.x = Math.PI / 2;
        trim.position.y = 0.82;
        ped.add(baseCyl, trim);

        const statue = createJellycatCharacter(ex.fallback, { scale: 1.15 });
        statue.position.y = 0.85;
        ped.add(statue);
        this.group.add(ped);
        this.layout.addCollider('circle', ex.x, ex.z, 1.35);

        const entry = { mesh: statue };
        this.exhibitModels.push(entry);

        loadComfyGLB(ex.url, 1.65).then((glb) => {
          if (glb) {
            ped.remove(statue);
            glb.position.y = 0.85;
            ped.add(glb);
            entry.mesh = glb;
          }
        });
      }
    }

  _buildThemedZoneLandmarks() {
      // === ZONE 2 SE: Patisserie Bay Golden Croissant Archway + 3-Tier Macaron Tower ===
      const croissantArch = new THREE.Group();
      croissantArch.position.set(44, 0, 23);
      croissantArch.rotation.y = 1.08;
      const macColors = ['#ffa8c5', '#a5f3fc', '#fde68a', '#d8b4fe'];
      for(const side of [- 4.2, 4.2]) {
      for (let m = 0; m < 4; m++) {
        const mac = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.9, 20), createPlushMaterial(macColors[m]));
        mac.position.set(side, 0.5 + m * 1.15, 0);
        const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.25, 20), SharedMaterials.eyeWhite);
        cream.position.set(side, 1.05 + m * 1.15, 0);
        croissantArch.add(mac, cream);
      }
      this.layout.addCollider('circle', 44 + Math.cos(1.08) * side, 23 - Math.sin(1.08) * side, 1.0);
    }
    const croissantBridge = new THREE.Mesh(
      new THREE.TorusGeometry(4.4, 0.78, 16, 28, Math.PI),
      createPlushMaterial('#ebb059')
    );
    croissantBridge.position.set(0, 4.5, 0);
    croissantArch.add(croissantBridge);
    this.group.add(croissantArch);

    // 3-Tier Giant Macaron Tower in SE Cafe Plaza
    const macTower = new THREE.Group();
    macTower.position.set(81, 0, 48);
    for (let i = 0; i < 4; i++) {
      const r = 2.0 - i * 0.35;
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.08, 0.9, 24), createPlushMaterial(macColors[i]));
      tier.position.y = 0.55 + i * 1.15;
      tier.castShadow = true;
      macTower.add(tier);
    }
    const towerBerry = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.3, 14), createPlushMaterial('#ef476f'));
    towerBerry.position.y = 5.2;
    macTower.add(towerBerry);
    this.group.add(macTower);
    this.layout.addCollider('circle', 81, 48, 2.2);

    // === ZONE 3 NE: Thrill Peak Crystal Clusters & Steampunk Gear Arch ===
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: '#a855f7',
      emissive: '#7e22ce',
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.1,
    });
    const basaltMat = new THREE.MeshStandardMaterial({ color: '#3b2b4a', roughness: 0.88 });
    const crystalSpots = [
      [40, -34, 1.2],
      [46, -29, 0.9],
      [64, -27, 1.3],
      [68, -48, 1.4],
      [46, -68, 1.5],
      [63, -64, 1.1],
    ];
    for (const [cx, cz, s] of crystalSpots) {
      const rock = new THREE.Group();
      rock.position.set(cx, 0, cz);
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7 * s, 0), basaltMat);
      boulder.scale.set(1.2, 0.75, 1.0);
      boulder.position.y = 0.6 * s;
      boulder.castShadow = true;
      rock.add(boulder);
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45 * s, (2.2 + k * 0.6) * s, 6), crystalMat);
        sp.position.set((k - 1.5) * 0.5 * s, (1.4 + k * 0.25) * s, (k % 2 === 0 ? 0.35 : -0.35) * s);
        sp.rotation.z = (k - 1.5) * 0.22;
        rock.add(sp);
      }
      const cl = new THREE.PointLight('#c084fc', 0, 18);
      cl.position.y = 2.6 * s;
      rock.add(cl);
      this.nightLights.push({ light: cl, maxIntensity: 3.2 });
      this.group.add(rock);
      this.layout.addCollider('circle', cx, cz, 1.7 * s);
    }

    // === ZONE 4 WEST: Dutch Spinning Windmill & Red Harvest Barn ===
    const wmCenter = ZONE_CENTERS.windmill;
    const wmGroup = new THREE.Group();
    wmGroup.position.copy(wmCenter);
    wmGroup.rotation.y = 0.45;
    this.group.add(wmGroup);
    this.layout.addCollider('circle', wmCenter.x, wmCenter.z, 5.2);

    const creamBrick = new THREE.MeshStandardMaterial({ color: '#e9dcc9', roughness: 0.8 });
    const darkTimber = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.82 });
    const barnRed = new THREE.MeshStandardMaterial({ color: '#c44536', roughness: 0.75 });
    const slateMat = new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.65 });
    const sailMat = new THREE.MeshStandardMaterial({ color: '#fff8e7', roughness: 0.7, side: THREE.DoubleSide });

    const millBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 4.2, 16), barnRed);
    millBase.position.y = 2.1;
    millBase.castShadow = true;
    const millTower = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.65, 6.2, 16), creamBrick);
    millTower.position.y = 7.3;
    millTower.castShadow = true;
    const millRoof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 3.0, 16), slateMat);
    millRoof.position.y = 11.8;
    const millFinial = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), SharedMaterials.gold);
    millFinial.position.y = 13.5;

    const rotor = new THREE.Group();
    rotor.position.set(0, 9.6, 2.05);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 14), darkTimber);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.8, 0.16), darkTimber);
      spar.position.y = 2.9;
      const canvasSail = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 4.4), sailMat);
      canvasSail.position.set(0.62, 3.3, 0.08);
      arm.add(spar, canvasSail);
      rotor.add(arm);
    }
    this.windmillRotor = rotor;
    wmGroup.add(millBase, millTower, millRoof, millFinial, rotor);

    // Adjacent Cozy Harvest Barn
    const barn = new THREE.Group();
    barn.position.set(5.6, 0, -2.5);
    const barnWalls = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.2, 6.2), barnRed);
    barnWalls.position.y = 2.1;
    barnWalls.castShadow = true;
    const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.8, 4), darkTimber);
    barnRoof.rotation.y = Math.PI / 4;
    barnRoof.position.y = 5.5;
    const barnDoor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, 0.2), SharedMaterials.white);
    barnDoor.position.set(0, 1.35, 3.12);
    barn.add(barnWalls, barnRoof, barnDoor);
    wmGroup.add(barn);
    this.layout.addCollider('circle', wmCenter.x + 5.0, wmCenter.z - 2.0, 4.0);

    // === 32 Glowing Giant Fairy Mushrooms in Bunny's Harvest Forest ===
    const stemMat = new THREE.MeshStandardMaterial({ color: '#f8eedc', roughness: 0.72 });
    const mushPalette = [
      new THREE.MeshStandardMaterial({ color: '#ff70a6', emissive: '#ff4d88', emissiveIntensity: 0.25, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: '#9d75ef', emissive: '#7c3aed', emissiveIntensity: 0.25, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: '#ff9770', emissive: '#ff7b54', emissiveIntensity: 0.25, roughness: 0.5 }),
    ];
    let mCount = 0;
    let mSeed = 909;
    const mRand = () => {
      mSeed = (mSeed * 16807) % 2147483647;
      return (mSeed - 1) / 2147483646;
    };
    for (let i = 0; i < 160 && mCount < 32; i++) {
      const mx = -96 + mRand() * 74;
      const mz = -48 + mRand() * 94;
      if (!this.layout.isPositionClear(mx, mz, 1.4)) continue;
      const scale = 0.75 + mRand() * 0.95;
      const mush = new THREE.Group();
      mush.position.set(mx, 0, mz);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.36 * scale, 1.6 * scale, 12), stemMat);
      stem.position.y = 0.8 * scale;
      stem.castShadow = true;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.95 * scale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mushPalette[mCount % mushPalette.length]
      );
      cap.position.y = 1.55 * scale;
      cap.castShadow = true;
      mush.add(stem, cap);
      this.group.add(mush);
      this.mushrooms.push({ mesh: mush, phase: mRand() * Math.PI * 2, baseScale: 1 });
      mCount++;
    }

    // === ZONE 5 EAST: Neon Star Pier Arch & Overhead Festoon Lights ===
    const pierArch = new THREE.Group();
    pierArch.position.set(78, 0, 29);
    pierArch.rotation.y = 0.12;
    const neonMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.4, roughness: 0.2 });
    const neonPink = new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#ec4899', emissiveIntensity: 1.4, roughness: 0.2 });
    for (const sx of [-4.6, 4.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 6.2, 12), SharedMaterials.wood);
      col.position.set(sx, 3.1, 0);
      pierArch.add(col);
    }
    const topNeon = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 12, 28, Math.PI), neonMat);
    topNeon.position.set(0, 5.8, 0);
    const topStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), neonPink);
    topStar.position.set(0, 10.6, 0);
    pierArch.add(topNeon, topStar);
    this.group.add(pierArch);

    // Overhead festoon string lamps down East Pier
    for (let z = -20; z <= 24; z += 11) {
      for (const sx of [71.5, 88.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.4, 8), SharedMaterials.wood);
        pole.position.set(sx, 2.2, z);
        this.group.add(pole);
      }
      const strandPts = [
        new THREE.Vector3(71.5, 4.3, z),
        new THREE.Vector3(80.0, 3.6, z),
        new THREE.Vector3(88.5, 4.3, z),
      ];
      const strand = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandPts), 14, 0.03, 6, false), neonMat);
      this.group.add(strand);
      for (let b = 0; b <= 4; b++) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), b % 2 === 0 ? neonPink : this.lampBulbMat);
        bulb.position.copy(new THREE.CatmullRomCurve3(strandPts).getPointAt(b / 4));
        this.group.add(bulb);
      }
    }
  }

  _createStorybookHouse({
    x,
    z,
    rotY = 0,
    width = 4.6,
    depth = 4.2,
    height = 5.4,
    wallColor = '#f3d5e5',
    roofColor = '#8a5b8d',
    roofStyle = 'gable',
    awningColor = '#ff85b3',
    mascotId = null,
    addCollider = true,
  }) {
    const house = new THREE.Group();
    house.position.set(x, 0, z);
    house.rotation.y = rotY;
    this.group.add(house);

    const wallTex = loadTiledTexture('./assets/textures/tex_castle_wall.png', 2, 2);
    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 2, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: wallColor, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#f7ece1', roughness: 0.65 });
    const roofMat = createPlushMaterial(roofColor);
    const winGlowMat = new THREE.MeshStandardMaterial({
      color: '#fff4c2',
      emissive: '#ffcf66',
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.45, depth + 0.35), trimMat);
    plinth.position.y = 0.22;
    plinth.receiveShadow = true;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    body.position.y = height / 2 + 0.4;
    body.castShadow = true;
    body.receiveShadow = true;

    const belt = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.26, depth + 0.24), trimMat);
    belt.position.y = height * 0.55 + 0.4;
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.36, 0.32, depth + 0.36), SharedMaterials.gold);
    cornice.position.y = height + 0.42;
    house.add(plinth, body, belt, cornice);

    // Front striped projecting shop awning + colonnade posts + glowing display window
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, 0.35, 1.55),
      new THREE.MeshStandardMaterial({ map: canopyTex, color: awningColor, roughness: 0.65 })
    );
    awning.position.set(0, 2.75, depth / 2 + 0.65);
    awning.rotation.x = 0.26;
    house.add(awning);

    for (const px of [-width * 0.4, width * 0.4]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.6, 10), trimMat);
      col.position.set(px, 1.4, depth / 2 + 1.15);
      house.add(col);
    }

    const shopWin = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.66, 1.7), winGlowMat);
    shopWin.position.set(0, 1.65, depth / 2 + 0.04);
    house.add(shopWin);

    if (mascotId) {
      const mini = createJellycatCharacter(mascotId, { scale: 0.48 });
      mini.position.set(0, 0.85, depth / 2 + 0.42);
      house.add(mini);
    }

    // Upper floor windows + floral window boxes
    for (const wx of [-width * 0.27, width * 0.27]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.25, 0.16), trimMat);
      frame.position.set(wx, height * 0.78 + 0.2, depth / 2 + 0.05);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.0), winGlowMat);
      pane.position.set(wx, height * 0.78 + 0.2, depth / 2 + 0.14);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.24, 0.32), createPlushMaterial('#7c4d3a'));
      box.position.set(wx, height * 0.78 - 0.52, depth / 2 + 0.2);
      const blooms = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), createPlushMaterial('#ff7aa8'));
      blooms.scale.set(1.6, 0.65, 0.8);
      blooms.position.set(wx, height * 0.78 - 0.36, depth / 2 + 0.22);
      house.add(frame, pane, box, blooms);
    }

    // Roof silhouette variations
    const roofY = height + 0.56;
    if (roofStyle === 'dome') {
      const dr = Math.min(width, depth) * 0.48;
      const dome = new THREE.Mesh(createOnionDomeGeometry(dr, 3.2), roofMat);
      dome.position.y = roofY;
      const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), SharedMaterials.gold);
      spire.position.y = roofY + 3.4;
      house.add(dome, spire);
    } else if (roofStyle === 'mansard') {
      const mansard = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.38, width * 0.58, 2.2, 4),
        roofMat
      );
      mansard.rotation.y = Math.PI / 4;
      mansard.scale.set(1, 1, depth / width);
      mansard.position.y = roofY + 1.1;
      const crest = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, 0.16, depth * 0.46), SharedMaterials.gold);
      crest.position.y = roofY + 2.25;
      house.add(mansard, crest);
    } else {
      const gable = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(width, depth) * 0.74, 2.8, 4),
        roofMat
      );
      gable.rotation.y = Math.PI / 4;
      gable.position.y = roofY + 1.35;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), trimMat);
      chimney.position.set(width * 0.28, roofY + 1.5, -depth * 0.2);
      house.add(gable, chimney);
    }

    if (addCollider) {
      this.layout.addCollider('circle', x, z, Math.max(width, depth) * 0.56);
    }
    return house;
  }

  _buildPerimeterBermAndMountains() {
    const mountainGroup = new THREE.Group();
    this.group.add(mountainGroup);

    const foothillMat = new THREE.MeshStandardMaterial({ color: '#619968', roughness: 0.92 });
    const slatePeakMat = new THREE.MeshStandardMaterial({ color: '#6e5285', roughness: 0.88 });
    const lavenderPeakMat = new THREE.MeshStandardMaterial({ color: '#8f71ab', roughness: 0.86 });
    const snowMat = new THREE.MeshStandardMaterial({ color: '#f3ebfa', roughness: 0.75 });

    let seed = 707;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // 40 sculpted perimeter foothills & Disney alpine backdrop peaks encircling park at r = 132..154m
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      const r = 133 + rand() * 20;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;

      const hillR = 9 + rand() * 7;
      const hillH = 8 + rand() * 6;
      const foothill = new THREE.Mesh(new THREE.ConeGeometry(hillR, hillH, 8), foothillMat);
      foothill.position.set(x, hillH * 0.42, z);
      foothill.rotation.y = rand() * Math.PI;
      mountainGroup.add(foothill);

      if (i % 2 === 0) {
        const peakH = 16 + rand() * 14;
        const peakR = 8.5 + rand() * 5.5;
        const pMat = i % 4 === 0 ? slatePeakMat : lavenderPeakMat;
        const peak = new THREE.Mesh(new THREE.ConeGeometry(peakR, peakH, 7), pMat);
        const px = Math.sin(a + 0.04) * (r + 8);
        const pz = Math.cos(a + 0.04) * (r + 8);
        peak.position.set(px, peakH * 0.48, pz);
        peak.rotation.y = rand() * Math.PI;
        mountainGroup.add(peak);

        if (peakH > 22) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(peakR * 0.36, peakH * 0.36, 7), snowMat);
          cap.position.set(px, peakH * 0.8, pz);
          cap.rotation.y = peak.rotation.y;
          mountainGroup.add(cap);
        }
      }
    }
  }

  _buildMainStreetTown() {
    const westShops = [
      { z: 26.5, h: 6.4, wc: '#f6d4e5', rc: '#865382', style: 'mansard', mascot: 'aubergine_king' },
      { z: 32.5, h: 5.2, wc: '#fce8c8', rc: '#d67465', style: 'gable', mascot: 'croissant' },
      { z: 38.5, h: 6.8, wc: '#e3d5f5', rc: '#5d477a', style: 'dome', mascot: 'aubergine_magician' },
      { z: 44.5, h: 5.4, wc: '#d8f1e2', rc: '#729e65', style: 'mansard', mascot: 'coffee_cup' },
      { z: 50.5, h: 5.8, wc: '#f9d5d3', rc: '#b36b88', style: 'gable', mascot: 'sweetcorn' },
    ];
    for (const s of westShops) {
      this._createStorybookHouse({
        x: -7.2,
        z: s.z,
        rotY: Math.PI / 2,
        width: 5.2,
        depth: 4.4,
        height: s.h,
        wallColor: s.wc,
        roofColor: s.rc,
        roofStyle: s.style,
        mascotId: s.mascot,
      });
    }

    const eastShops = [
      { x: 8.6, z: 24.5, h: 5.8, wc: '#e6d8fa', rc: '#8e5d9e', style: 'dome', mascot: 'boiled_egg' },
      { x: 8.8, z: 49.5, h: 6.2, wc: '#ffe3ec', rc: '#cf6f94', style: 'mansard', mascot: 'tomato' },
      { x: 9.2, z: 55.2, h: 8.4, wc: '#f5e1c3', rc: '#7a5780', style: 'dome', mascot: 'bartholomew_bear' },
      { x: -9.5, z: 81.5, h: 5.2, wc: '#f3d8e8', rc: '#8e5b82', style: 'gable', mascot: 'aubergine_baby' },
      { x: 17.5, z: 81.5, h: 5.2, wc: '#d8f0e4', rc: '#6b945c', style: 'mansard', mascot: 'bashful_bunny' },
    ];
    for (const s of eastShops) {
      const isGateSide = s.z > 75;
      this._createStorybookHouse({
        x: s.x,
        z: s.z,
        rotY: isGateSide ? 0 : -Math.PI / 2,
        width: 5.0,
        depth: 4.2,
        height: s.h,
        wallColor: s.wc,
        roofColor: s.rc,
        roofStyle: s.style,
        mascotId: s.mascot,
      });
    }

    // Overhead festive pennant bunting strands draped across Main Street
    const pennantColors = ['#ff80ab', '#ffd54f', '#81d4fa', '#ce93d8', '#a5d6a7'];
    const ropeMat = new THREE.MeshBasicMaterial({ color: '#f7e6c4' });
    for (const gz of [27, 36, 46, 52]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-4.8, 6.2, gz),
        new THREE.Vector3(2.0, 5.1, gz),
        new THREE.Vector3(8.5, 6.2, gz),
      ]);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.03, 5, false), ropeMat);
      this.group.add(rope);
      for (let f = 1; f < 9; f++) {
        const pt = curve.getPointAt(f / 9);
        const flag = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 0.48, 3),
          createFeltMaterial(pennantColors[(gz + f) % pennantColors.length])
        );
        flag.rotation.z = Math.PI;
        flag.position.set(pt.x, pt.y - 0.25, pt.z);
        this.group.add(flag);
      }
    }
  }

  _buildThemedZoneVillages() {
    // 1. SE Patisserie Bay Parisian Village (6 townhouses & bistros)
    const seTown = [
      { x: 86.5, z: 30, r: -Math.PI * 0.55, wc: '#ffe8d6', rc: '#d87e8a', st: 'mansard', m: 'croissant' },
      { x: 87.5, z: 36, r: -Math.PI * 0.52, wc: '#f8d7e8', rc: '#865b94', st: 'dome', m: 'coffee_cup' },
      { x: 87.5, z: 42, r: -Math.PI * 0.48, wc: '#fff1cc', rc: '#df8a68', st: 'gable', m: 'boiled_egg' },
      { x: 85.5, z: 48, r: -Math.PI * 0.42, wc: '#e4d8f8', rc: '#9b6b9e', st: 'mansard', m: null },
      { x: 64.5, z: 46, r: 0.45, wc: '#fce2ef', rc: '#c7688a', st: 'dome', m: 'aubergine_baby' },
      { x: 62.5, z: 27, r: 1.0, wc: '#fff0db', rc: '#a87654', st: 'gable', m: null },
    ];
    for (const b of seTown) {
      this._createStorybookHouse({
        x: b.x,
        z: b.z,
        rotY: b.r,
        width: 4.8,
        depth: 4.0,
        height: 5.2,
        wallColor: b.wc,
        roofColor: b.rc,
        roofStyle: b.st,
        mascotId: b.m,
      });
    }

    // 2. West Bunny's Harvest Forest Cottages + Riverside Rotating Waterwheel Mill
    const westCottages = [
      { x: -92, z: -10, r: Math.PI / 2, wc: '#f3e0c8', rc: '#b84a39', st: 'gable', m: 'bashful_bunny' },
      { x: -92.5, z: 2, r: Math.PI / 2, wc: '#e8d9be', rc: '#7a5238', st: 'mansard', m: 'sweetcorn' },
      { x: -91.5, z: 16, r: Math.PI / 2, wc: '#f5e6cf', rc: '#c45b41', st: 'gable', m: 'tomato' },
      { x: -89, z: 28, r: 1.15, wc: '#e2ead4', rc: '#6d8f56', st: 'dome', m: 'leek' },
      { x: -70, z: -34, r: 0.35, wc: '#f2dcc4', rc: '#b84a39', st: 'gable', m: 'bartholomew_bear' },
      { x: -64, z: 43, r: 2.3, wc: '#efe0cb', rc: '#8c5a3c', st: 'mansard', m: null },
    ];
    for (const c of westCottages) {
      this._createStorybookHouse({
        x: c.x,
        z: c.z,
        rotY: c.r,
        width: 4.8,
        depth: 4.2,
        height: 4.6,
        wallColor: c.wc,
        roofColor: c.rc,
        roofStyle: c.st,
        awningColor: '#7eb872',
        mascotId: c.m,
      });
    }

    // Riverside Waterwheel Millhouse on West Canal Bend (angle = 4.35)
    const wwAngle = 4.35;
    const wwR = getRiverCenterRadius(wwAngle) - 6.6;
    const wwX = Math.sin(wwAngle) * wwR;
    const wwZ = Math.cos(wwAngle) * wwR;
    const millHouse = this._createStorybookHouse({
      x: wwX,
      z: wwZ,
      rotY: wwAngle,
      width: 4.4,
      depth: 4.4,
      height: 4.8,
      wallColor: '#eadbc8',
      roofColor: '#9c4b39',
      roofStyle: 'gable',
      awningColor: '#d9a45b',
    });
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 1.4, 2.75);
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.16, 10, 24), SharedMaterials.wood);
    wheelGroup.add(wheelRim);
    for (let p = 0; p < 8; p++) {
      const pa = (p / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.1, 0.45), SharedMaterials.wood);
      spoke.rotation.z = pa;
      wheelGroup.add(spoke);
    }
    millHouse.add(wheelGroup);
    this.waterwheel = wheelGroup;

    // 3. East Pier Arcade Pavilions + 24m Striped Aubergine Harbor Lighthouse at (93, 0, -18)
    const eastArcades = [
      { x: 90.5, z: 6, r: -Math.PI / 2, wc: '#3b2452', rc: '#ff70a6', st: 'dome', m: 'aubergine_cool' },
      { x: 90.5, z: 16, r: -Math.PI / 2, wc: '#2f2047', rc: '#06b6d4', st: 'mansard', m: null },
      { x: 89.5, z: 25, r: -Math.PI * 0.65, wc: '#472a61', rc: '#fbbf24', st: 'dome', m: 'aubergine_astronaut' },
      { x: 67.5, z: 25, r: Math.PI / 2, wc: '#f3d9f0', rc: '#9d4edd', st: 'gable', m: null },
    ];
    for (const a of eastArcades) {
      this._createStorybookHouse({
        x: a.x,
        z: a.z,
        rotY: a.r,
        width: 4.6,
        depth: 4.0,
        height: 5.0,
        wallColor: a.wc,
        roofColor: a.rc,
        roofStyle: a.st,
        awningColor: '#22d3ee',
        mascotId: a.m,
      });
    }

    // 24m Striped Harbor Lighthouse
    const lh = new THREE.Group();
    lh.position.set(93, 0, -18);
    this.group.add(lh);
    this.layout.addCollider('circle', 93, -18, 4.0);
    const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.0, 3.0, 8), new THREE.MeshStandardMaterial({ color: '#e5d4c5', roughness: 0.7 }));
    lhBase.position.y = 1.5;
    lh.add(lhBase);
    for (let seg = 0; seg < 6; seg++) {
      const rBot = 2.8 - seg * 0.24;
      const rTop = 2.56 - seg * 0.24;
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, 2.8, 24),
        createPlushMaterial(seg % 2 === 0 ? '#7e4a8c' : '#fff5ee')
      );
      cyl.position.y = 4.4 + seg * 2.8;
      cyl.castShadow = true;
      lh.add(cyl);
    }
    const lhGallery = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.7, 0.8, 20), SharedMaterials.gold);
    lhGallery.position.y = 20.0;
    const lhGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 2.2, 20),
      new THREE.MeshStandardMaterial({ color: '#fff8d4', emissive: '#ffd54f', emissiveIntensity: 1.5, transparent: true, opacity: 0.75 })
    );
    lhGlass.position.y = 21.3;
    const lhDome = new THREE.Mesh(createOnionDomeGeometry(1.55, 2.8), SharedMaterials.calyxOlive);
    lhDome.position.y = 22.4;
    const beacon = new THREE.Group();
    beacon.position.y = 21.3;
    for (const s of [-1, 1]) {
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(3.5, 22, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: '#fff4a8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      beam.rotation.z = (s * Math.PI) / 2;
      beam.position.x = s * 11.2;
      beacon.add(beam);
    }
    this.lighthouseBeacon = beacon;
    lh.add(lhGallery, lhGlass, lhDome, beacon);

    // 4. NW CANAL INDOOR DARK-RIDE SHOW PAVILION ("小小茄子世界" 水上音乐长廊, angle 3.74..4.08)
    const archWallMat = new THREE.MeshStandardMaterial({
      map: loadTiledTexture('./assets/textures/tex_castle_wall.png', 2, 2),
      color: '#b689c4',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const darkVaultMat = new THREE.MeshStandardMaterial({
      color: '#120624',
      roughness: 0.9,
      side: THREE.BackSide,
    });
    const dancerIds = [
      'aubergine_baby',
      'bashful_bunny',
      'sweetcorn',
      'tomato',
      'boiled_egg',
      'croissant',
      'coffee_cup',
      'bartholomew_bear',
      'avocado',
      'aubergine_charm',
    ];
    const startAng = 3.74;
    const endAng = 4.08;
    const vaultRibs = 10;
    for (let i = 0; i <= vaultRibs; i++) {
      const t = i / vaultRibs;
      const a = THREE.MathUtils.lerp(startAng, endAng, t);
      const rMid = getRiverCenterRadius(a);
      const px = Math.sin(a) * rMid;
      const pz = Math.cos(a) * rMid;

      const frame = new THREE.Group();
      frame.position.set(px, 0, pz);
      frame.rotation.y = a + Math.PI / 2;

      // Exterior arched bridge roof over canal water (outer bank ±5.8m clear of canal ±4.8m!)
      const extArch = new THREE.Mesh(
        new THREE.CylinderGeometry(6.2, 6.2, 2.8, 20, 1, false, -Math.PI / 2, Math.PI),
        archWallMat
      );
      extArch.rotation.z = Math.PI / 2;
      extArch.rotation.y = Math.PI / 2;
      extArch.position.y = 1.2;
      const innerNight = new THREE.Mesh(
        new THREE.CylinderGeometry(5.85, 5.85, 2.85, 20, 1, false, -Math.PI / 2, Math.PI),
        darkVaultMat
      );
      innerNight.rotation.z = Math.PI / 2;
      innerNight.rotation.y = Math.PI / 2;
      innerNight.position.y = 1.2;
      frame.add(extArch, innerNight);

      if (i === 0 || i === vaultRibs) {
        for (const sideX of [-5.8, 5.8]) {
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 8.6, 16), archWallMat);
          turret.position.set(sideX, 4.3, 0);
          const d = new THREE.Mesh(createOnionDomeGeometry(1.15, 2.4), SharedMaterials.gold);
          d.position.set(sideX, 8.6, 0);
          frame.add(turret, d);
        }
      } else {
        // Illuminated floating performance stages along both water walls inside tunnel!
        const side = i % 2 === 0 ? -4.1 : 4.1;
        const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.7, 16), SharedMaterials.gold);
        stage.position.set(side, 0.15, 0);
        const doll = createJellycatCharacter(dancerIds[i % dancerIds.length], { scale: 0.9 });
        doll.position.set(side, 0.52, 0);
        const lantern = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 10, 10),
          new THREE.MeshStandardMaterial({ color: '#ffe57f', emissive: '#ff99cc', emissiveIntensity: 1.4 })
        );
        lantern.position.set(side * 0.65, 5.0, 0);
        frame.add(stage, doll, lantern);
        this.canalShowDancers.push({ mesh: doll, phase: i * 0.7 });
      }
      this.group.add(frame);
    }
  }

  _buildHighDensityFoliageAndGardens() {
    // 1. Batched Instanced Grass (12,000) & Wildflowers (4,200)
    const bladeGeo = new THREE.ConeGeometry(0.11, 0.48, 5);
    bladeGeo.translate(0, 0.24, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#6cb862', roughness: 0.85 });

    const flowerGeo = new THREE.DodecahedronGeometry(0.14, 0);
    flowerGeo.translate(0, 0.3, 0);
    const flowerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });

    const grassMatrices = [];
    const flowerMatrices = [];
    const flowerColors = [];
    const palette = [
      new THREE.Color('#fff6e8'),
      new THREE.Color('#d79eff'),
      new THREE.Color('#ff9cc2'),
      new THREE.Color('#ffe57f'),
    ];

    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const dummy = new THREE.Object3D();
    for (let i = 0; i < 24000 && grassMatrices.length < 12000; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 25 + rand() * 102;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (!this.layout.isPositionClear(x, z, 0.55)) continue;

      dummy.position.set(x, 0, z);
      dummy.rotation.set((rand() - 0.5) * 0.28, rand() * Math.PI * 2, (rand() - 0.5) * 0.28);
      const s = 0.75 + rand() * 0.95;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      grassMatrices.push(dummy.matrix.clone());

      if (i % 3 === 0 && flowerMatrices.length < 4200) {
        dummy.position.set(x + 0.16, 0, z + 0.16);
        dummy.scale.setScalar(0.75 + rand() * 0.55);
        dummy.updateMatrix();
        flowerMatrices.push(dummy.matrix.clone());
        flowerColors.push(palette[Math.floor(rand() * palette.length)]);
      }
    }

    const grassInst = new THREE.InstancedMesh(bladeGeo, bladeMat, grassMatrices.length);
    grassMatrices.forEach((m, idx) => grassInst.setMatrixAt(idx, m));
    grassInst.receiveShadow = true;
    this.group.add(grassInst);

    const flowerInst = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerMatrices.length);
    flowerMatrices.forEach((m, idx) => {
      flowerInst.setMatrixAt(idx, m);
      flowerInst.setColorAt(idx, flowerColors[idx]);
    });
    this.group.add(flowerInst);

    // 2. High-Density Batched Forest Canopy (340 Instanced Multi-Cluster Trees across island, outer grounds, and berm)
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 3.2, 8);
    trunkGeo.translate(0, 1.6, 0);
    const trunkInstMat = createPlushMaterial('#7a4e39');

    const puffGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 });
    const canopyPalette = [
      new THREE.Color('#9c72b8'), // Royal lavender
      new THREE.Color('#f0a2c8'), // Sakura blush
      new THREE.Color('#6abf76'), // Meadow emerald
      new THREE.Color('#f2c86b'), // Autumn golden maple
      new THREE.Color('#ea7b52'), // Warm harvest coral
      new THREE.Color('#3f7d58'), // Deep perimeter pine
    ];

    const trunkMatrices = [];
    const puffMatrices = [];
    const puffColors = [];

    for (let i = 0; i < 1600 && trunkMatrices.length < 340; i++) {
      const a = rand() * Math.PI * 2;
      const inOuterBerm = trunkMatrices.length < 180;
      const dist = inOuterBerm ? 123 + rand() * 14 : 28 + rand() * 78;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;

      if (!inOuterBerm) {
        if (!this.layout.isPositionClear(x, z, 2.3)) continue;
        // Avoid crowded Main Street inner canyon and NE coaster cavern footprint
        if (Math.abs(x) < 12 && z > 20 && z < 60) continue;
      }

      const rotY = rand() * Math.PI * 2;
      const sc = inOuterBerm ? 1.15 + rand() * 0.55 : 0.85 + rand() * 0.4;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      trunkMatrices.push(dummy.matrix.clone());

      const color =
        inOuterBerm
          ? canopyPalette[i % 2 === 0 ? 5 : 2]
          : x < -35
            ? canopyPalette[3 + (trunkMatrices.length % 2)]
            : x > 18 && z > 10
              ? canopyPalette[1]
              : canopyPalette[trunkMatrices.length % 3];

      const subPuffs = [
        [0, 3.8 * sc, 0, 1.32 * sc],
        [0.85 * sc, 3.1 * sc, 0.35 * sc, 1.0 * sc],
        [-0.78 * sc, 3.3 * sc, -0.35 * sc, 0.96 * sc],
        [0.15 * sc, 4.7 * sc, -0.25 * sc, 0.92 * sc],
      ];
      for (const [ox, oy, oz, rScale] of subPuffs) {
        dummy.position.set(x + ox, oy, z + oz);
        dummy.rotation.set(rand(), rand(), rand());
        dummy.scale.setScalar(rScale);
        dummy.updateMatrix();
        puffMatrices.push(dummy.matrix.clone());
        puffColors.push(color);
      }

      // Only add physical collider on inner walkable lawns when sparse enough so paths stay unblocked
      if (!inOuterBerm && trunkMatrices.length % 3 === 0) {
        this.layout.addCollider('circle', x, z, 0.72);
      }
    }

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkInstMat, trunkMatrices.length);
    trunkMatrices.forEach((m, idx) => trunkInst.setMatrixAt(idx, m));
    trunkInst.castShadow = true;
    this.group.add(trunkInst);

    const puffInst = new THREE.InstancedMesh(puffGeo, canopyMat, puffMatrices.length);
    puffMatrices.forEach((m, idx) => {
      puffInst.setMatrixAt(idx, m);
      puffInst.setColorAt(idx, puffColors[idx]);
    });
    puffInst.castShadow = true;
    puffInst.receiveShadow = true;
    this.group.add(puffInst);

    // 3. Manicured Boxwood Hedge Shrubs & Floral Bushes (180 instanced shrubs around plazas & town borders)
    const hedgeGeo = new THREE.SphereGeometry(0.75, 10, 8);
    const hedgeMat = createPlushMaterial('#579e54');
    const hedgeMatrices = [];
    for (let i = 0; i < 650 && hedgeMatrices.length < 180; i++) {
      const a = rand() * Math.PI * 2;
      const dist = 25 + rand() * 82;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (!this.layout.isPositionClear(x, z, 1.2)) continue;
      dummy.position.set(x, 0.42, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(1.25, 0.72 + rand() * 0.35, 1.0);
      dummy.updateMatrix();
      hedgeMatrices.push(dummy.matrix.clone());
    }
    const hedgeInst = new THREE.InstancedMesh(hedgeGeo, hedgeMat, hedgeMatrices.length);
    hedgeMatrices.forEach((m, idx) => hedgeInst.setMatrixAt(idx, m));
    this.group.add(hedgeInst);

    // 4. Theme Park Benches & Topiary Planters around Hub Plaza
    const woodBenchMat = createPlushMaterial('#c99567');
    const planterMat = new THREE.MeshStandardMaterial({ color: '#dcc7e2', roughness: 0.7 });
    const flowerBushMat = createPlushMaterial('#9c6ade');

    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      const r = 25.3;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (this.layout.isOnWalkwayOrCanal(x, z, 1.0)) continue;

      if (i % 2 === 0) {
        const bench = new THREE.Group();
        bench.position.set(x, 0, z);
        bench.rotation.y = a + Math.PI;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.2, 0.85), woodBenchMat);
        seat.position.y = 0.5;
        seat.castShadow = true;
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.68, 0.16), woodBenchMat);
        back.position.set(0, 0.92, -0.35);
        for (const sx of [-1.02, 1.02]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.8), SharedMaterials.gold);
          arm.position.set(sx, 0.48, 0);
          bench.add(arm);
        }
        bench.add(seat, back);
        this.group.add(bench);
        this.layout.addCollider('circle', x, z, 1.0);
      } else {
        const planter = new THREE.Group();
        planter.position.set(x, 0, z);
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.85, 0.65, 20), planterMat);
        pot.position.y = 0.32;
        const hedgeBody = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 16), flowerBushMat);
        hedgeBody.scale.set(0.9, 1.25, 0.9);
        hedgeBody.position.y = 1.15;
        const topLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.45, 8), SharedMaterials.calyxOlive);
        topLeaf.position.y = 2.25;
        planter.add(pot, hedgeBody, topLeaf);
        this.group.add(planter);
        this.layout.addCollider('circle', x, z, 1.05);
      }
    }

    // 5. Outdoor Cafes, Popcorn Carts & Directional Park Signposts
    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 2, 1);
    const umbrellaMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.7, side: THREE.DoubleSide });
    const cartSpecs = [
      { x: -3.2, z: 33, color: '#ff94b8', type: 'cart' },
      { x: 6.4, z: 42, color: '#87ceeb', type: 'cafe' },
      { x: 71, z: 44, color: '#ffd479', type: 'cafe' },
      { x: 79, z: 33, color: '#b48ee0', type: 'cart' },
      { x: -30, z: 22, color: '#f9a8d4', type: 'cafe' },
      { x: 10, z: -70, color: '#93c5fd', type: 'cart' },
    ];
    for (const cs of cartSpecs) {
      const prop = new THREE.Group();
      prop.position.set(cs.x, 0, cs.z);
      if (cs.type === 'cart') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.3), createPlushMaterial(cs.color));
        body.position.y = 1.0;
        body.castShadow = true;
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16, 1, false, -Math.PI / 2, Math.PI), umbrellaMat);
        roof.rotation.z = Math.PI / 2;
        roof.position.y = 2.6;
        prop.add(body, roof);
      } else {
        const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.14, 20), SharedMaterials.white);
        table.position.y = 0.95;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.7, 10), SharedMaterials.gold);
        pole.position.y = 1.35;
        const umb = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.0, 20), umbrellaMat);
        umb.position.y = 2.75;
        prop.add(table, pole, umb);
      }
      this.group.add(prop);
      this.layout.addCollider('circle', cs.x, cs.z, 1.5);
    }

    // 24 Vintage Street Lamps + Banners along routes
    const lampSpots = [
      [0, 22], [4.5, 42], [-4.5, 76], [12.5, 78], [-8, -16],
      [16, 14], [38, 22], [22, -16], [56, -42], [-22, -10],
      [-52, -8], [-74, 4], [74, 10], [74, -18], [16, -68],
      [-4, 52], [-4, 28], [6, 30], [72, 28], [-80, -8],
    ];
    const poleMat = new THREE.MeshStandardMaterial({ color: '#452b54', roughness: 0.4, metalness: 0.6 });
    const bannerMat = createFeltMaterial('#9f6be0');
    for (let i = 0; i < lampSpots.length; i++) {
      const [lx, lz] = lampSpots[i];
      const lamp = new THREE.Group();
      lamp.position.set(lx, 0, lz);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.85, 12), poleMat);
      base.position.y = 0.42;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.8, 10), poleMat);
      stem.position.y = 2.65;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), this.lampBulbMat);
      bulb.position.y = 4.65;
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 1.2), bannerMat);
      banner.position.set(0.35, 3.2, 0);
      lamp.add(base, stem, bulb, banner);
      if (i < 7) {
        const pt = new THREE.PointLight('#ffd278', 0, 22);
        pt.position.y = 4.5;
        lamp.add(pt);
        this.nightLights.push({ light: pt, maxIntensity: 3.0 });
      }
      this.group.add(lamp);
      this.layout.addCollider('circle', lx, lz, 0.45);
    }

    // Floating Hot Air Balloons drifting high across all 5 zones
    const balloonColors = ['#a672cc', '#ff8fb8', '#77d9b8'];
    for (let i = 0; i < 3; i++) {
      const bg = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 24), createPlushMaterial(balloonColors[i]));
      env.scale.y = 1.25;
      env.position.y = 4.2;
      const cal = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.4, 8), SharedMaterials.calyxOlive);
      cal.position.y = 8.4;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), SharedMaterials.wood);
      basket.position.y = -0.3;
      bg.add(env, cal, basket);
      bg.userData = { baseAngle: i * 2.1, radius: 52 + i * 16, speed: 0.055 + i * 0.015, baseY: 36 + i * 6 };
      this.group.add(bg);
      this.balloons.push(bg);
    }
  }

  _buildParadeFloat() {
    const floatGroup = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 7.2), SharedMaterials.aubergineMauve);
    chassis.position.y = 0.85;
    chassis.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.3, 7.45), SharedMaterials.gold);
    trim.position.y = 1.4;
    floatGroup.add(chassis, trim);

    const wheelMat = new THREE.MeshStandardMaterial({ color: '#ffd56b', roughness: 0.4 });
    for (const wx of [-2.1, 2.1]) {
      for (const wz of [-2.2, 2.2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.35, 18), wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.6, wz);
        floatGroup.add(w);
      }
    }

    const king = createJellycatCharacter('aubergine_king', { scale: 1.7 });
    king.position.set(0, 1.5, 0.8);
    const bear = createJellycatCharacter('bartholomew_bear', { scale: 1.05 });
    bear.position.set(-1.1, 1.5, -1.6);
    const bunny = createJellycatCharacter('bashful_bunny', { scale: 1.05 });
    bunny.position.set(1.1, 1.5, -1.6);
    floatGroup.add(king, bear, bunny);

    const floatLight = new THREE.PointLight('#ffd278', 0, 26);
    floatLight.position.set(0, 4.8, 0);
    floatGroup.add(floatLight);
    this.nightLights.push({ light: floatLight, maxIntensity: 4.5 });

    floatGroup.visible = false;
    this.group.add(floatGroup);
    this.paradeFloat = floatGroup;
    this.paradeStars = [king, bear, bunny];
  }

  setWetGround(wet) {
    for (const m of this.pavingMaterials) {
      m.roughness = wet ? 0.16 : 0.78;
      m.metalness = wet ? 0.25 : 0.04;
      m.needsUpdate = true;
    }
  }

  applyAtmosphere(mode, parade) {
    this.timeMode = mode;
    this.paradeActive = parade;
    this.paradeFloat.visible = parade;

    let skyHex = '#cceeff';
    if (mode === 'day') {
      skyHex = '#cceeff';
      this.scene.background = new THREE.Color(skyHex);
      this.scene.fog = new THREE.FogExp2(skyHex, 0.0028);
      this.hemiLight.color.set('#fff6fa');
      this.hemiLight.groundColor.set('#7db582');
      this.hemiLight.intensity = 0.72;
      this.sunLight.color.set('#fff2dc');
      this.sunLight.intensity = 1.32;
      this.sunLight.position.set(48, 76, 42);
      this.lampBulbMat.emissiveIntensity = 0.2;
      this.nightLights.forEach((n) => (n.light.intensity = 0));
    } else if (mode === 'sunset') {
      skyHex = '#f6cbe0';
      this.scene.background = new THREE.Color(skyHex);
      this.scene.fog = new THREE.FogExp2(skyHex, 0.0034);
      this.hemiLight.color.set('#ffdce8');
      this.hemiLight.groundColor.set('#8a6890');
      this.hemiLight.intensity = 0.85;
      this.sunLight.color.set('#ffb899');
      this.sunLight.intensity = 1.25;
      this.sunLight.position.set(-55, 28, 42);
      this.lampBulbMat.emissiveIntensity = 0.9;
      this.nightLights.forEach((n) => (n.light.intensity = n.maxIntensity * 0.35));
    } else if (mode === 'rain') {
      skyHex = '#a6cbe3';
      this.scene.background = new THREE.Color(skyHex);
      this.scene.fog = new THREE.FogExp2(skyHex, 0.0042);
      this.hemiLight.color.set('#e2f2ff');
      this.hemiLight.groundColor.set('#6d9978');
      this.hemiLight.intensity = 0.88;
      this.sunLight.color.set('#fff2d4');
      this.sunLight.intensity = 1.15;
      this.lampBulbMat.emissiveIntensity = 0.8;
      this.nightLights.forEach((n) => (n.light.intensity = n.maxIntensity * 0.3));
    } else if (mode === 'snow') {
      skyHex = '#d7e5f7';
      this.scene.background = new THREE.Color(skyHex);
      this.scene.fog = new THREE.FogExp2(skyHex, 0.004);
      this.hemiLight.color.set('#ffffff');
      this.hemiLight.groundColor.set('#a8c0d4');
      this.hemiLight.intensity = 0.95;
      this.sunLight.color.set('#f5faff');
      this.sunLight.intensity = 1.15;
      this.lampBulbMat.emissiveIntensity = 1.0;
      this.nightLights.forEach((n) => (n.light.intensity = n.maxIntensity * 0.4));
    } else {
      skyHex = '#1b0f30';
      this.scene.background = new THREE.Color(skyHex);
      this.scene.fog = new THREE.FogExp2('#23123f', 0.0042);
      this.hemiLight.color.set('#805ad5');
      this.hemiLight.groundColor.set('#2a1842');
      this.hemiLight.intensity = 0.72;
      this.sunLight.color.set('#c4b5fd');
      this.sunLight.intensity = 0.6;
      this.sunLight.position.set(-30, 58, -30);
      this.lampBulbMat.emissiveIntensity = 2.4;
      this.nightLights.forEach((n) => (n.light.intensity = n.maxIntensity));
      this._spawnFirework(true);
    }

    if (this.canalWaterMat) {
      this.canalWaterMat.uniforms.uSkyColor.value.set(skyHex);
      this.canalWaterMat.uniforms.uSunDir.value.copy(this.sunLight.position).normalize();
    }
    if (this.fountainWaterMat) {
      this.fountainWaterMat.uniforms.uSkyColor.value.set(skyHex);
    }
  }

  _spawnFirework(playSfx = false) {
    const center = new THREE.Vector3(
      -6 + (Math.random() - 0.5) * 32,
      30 + Math.random() * 14,
      -40 + (Math.random() - 0.5) * 14
    );
    const count = 90;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#d87eff'),
      new THREE.Color('#ffd65c'),
      new THREE.Color('#ff73b9'),
      new THREE.Color('#7affd4'),
    ];
    const baseColor = palette[Math.floor(Math.random() * palette.length)];
    const isAubergineShape = Math.random() < 0.45;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = center.x;
      positions[i * 3 + 1] = center.y;
      positions[i * 3 + 2] = center.z;
      let vx, vy, vz;
      if (isAubergineShape) {
        const t = (i / count) * Math.PI * 2;
        const pear = 1 - Math.sin(t) * 0.25;
        vx = Math.cos(t) * 8.5 * pear;
        vy = Math.sin(t) * 11.5;
        vz = (Math.random() - 0.5) * 2.5;
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const spd = 6 + Math.random() * 7;
        vx = Math.sin(phi) * Math.cos(theta) * spd;
        vy = Math.cos(phi) * spd;
        vz = Math.sin(phi) * Math.sin(theta) * spd;
      }
      velocities.push(new THREE.Vector3(vx, vy, vz));
      const c = baseColor.clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.72,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.fireworks.push({ pts, velocities, age: 0, life: 2.1 });
    if (playSfx && this.audio) this.audio.playSfx('fireworks', 0.45);
  }

  _spawnParadeCoin(pos) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16), SharedMaterials.gold);
    coin.rotation.x = Math.PI / 2;
    coin.position.set(pos.x + (Math.random() - 0.5) * 3.5, 0.9, pos.z + (Math.random() - 0.5) * 3.5);
    this.scene.add(coin);
    this.paradeCoins.push({ mesh: coin, life: 18 });
  }

  update(dt, elapsed, playerPos, onCollectCoin) {
    if (this.canalWaterMat) this.canalWaterMat.uniforms.uTime.value = elapsed;
    if (this.fountainWaterMat) this.fountainWaterMat.uniforms.uTime.value = elapsed;

    if (this.windmillRotor) {
      this.windmillRotor.rotation.z -= dt * 0.85;
    }
    if (this.waterwheel) {
      this.waterwheel.rotation.z -= dt * 0.9;
    }
    if (this.lighthouseBeacon) {
      this.lighthouseBeacon.rotation.y += dt * 1.4;
    }
    for (const d of this.canalShowDancers) {
      d.mesh.rotation.y = Math.sin(elapsed * 2.2 + d.phase) * 0.85;
      d.mesh.position.y = 0.52 + Math.abs(Math.sin(elapsed * 4.2 + d.phase)) * 0.16;
    }

    for (const m of this.mushrooms) {
      const pulse = 1.0 + Math.sin(elapsed * 2.2 + m.phase) * 0.04;
      m.mesh.scale.set(pulse, 2.0 - pulse, pulse);
    }

    for (const d of this.waterfallDrops) {
      const t = (elapsed * 1.4 + d.userData.phase) % 1;
      d.position.set(d.userData.baseX, THREE.MathUtils.lerp(1.65, 0.15, t * t), d.userData.baseZ);
    }

    for (const lp of this.lilyPads) {
      lp.mesh.position.y = -0.20 + Math.sin(elapsed * 1.8 + lp.phase) * 0.035;
      lp.mesh.rotation.z = Math.sin(elapsed * 1.3 + lp.phase) * 0.04;
    }

    for (const ex of this.exhibitModels) {
      ex.mesh.rotation.y = elapsed * 0.5;
    }

    for (const d of this.fountainDroplets) {
      const t = (elapsed * 0.85 + d.userData.phase) % 1;
      const r = 0.6 + t * 2.9;
      const y = 3.0 + (4.2 * t - 6.5 * t * t);
      d.position.set(Math.cos(d.userData.angle) * r, Math.max(0.62, y), Math.sin(d.userData.angle) * r);
    }

    for (const b of this.balloons) {
      const a = b.userData.baseAngle + elapsed * b.userData.speed;
      b.position.x = Math.cos(a) * b.userData.radius;
      b.position.z = Math.sin(a) * b.userData.radius;
      b.position.y = b.userData.baseY + Math.sin(elapsed * 1.1 + a) * 1.4;
      b.rotation.y = -a;
    }

    if (this.videoEl && this.videoEl.paused && this.videoEl.readyState >= 2) {
      this.videoEl.play().catch(() => { });
    }

    if (this.paradeActive) {
      this.paradeAngle += dt * 0.22;
      const r = 20.0;
      const fx = Math.sin(this.paradeAngle) * r;
      const fz = Math.cos(this.paradeAngle) * r;
      this.paradeFloat.position.set(fx, 0.08, fz);
      this.paradeFloat.rotation.y = this.paradeAngle + Math.PI / 2;

      for (const s of this.paradeStars) {
        s.rotation.y = Math.sin(elapsed * 2.5) * 0.35;
        s.position.y = 1.5 + Math.abs(Math.sin(elapsed * 5)) * 0.25;
      }

      this.fireworkTimer += dt;
      if (this.fireworkTimer > 1.7) {
        this.fireworkTimer = 0;
        this._spawnFirework(true);
      }

      this.paradeCoinTimer += dt;
      if (this.paradeCoinTimer > 2.2 && this.paradeCoins.length < 14) {
        this.paradeCoinTimer = 0;
        this._spawnParadeCoin(this.paradeFloat.position);
      }
    }

    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];
      fw.age += dt;
      if (fw.age >= fw.life) {
        this.scene.remove(fw.pts);
        fw.pts.geometry.dispose();
        fw.pts.material.dispose();
        this.fireworks.splice(i, 1);
        continue;
      }
      const posAttr = fw.pts.geometry.attributes.position;
      for (let j = 0; j < fw.velocities.length; j++) {
        fw.velocities[j].y -= 5.2 * dt;
        fw.velocities[j].multiplyScalar(0.985);
        posAttr.array[j * 3] += fw.velocities[j].x * dt;
        posAttr.array[j * 3 + 1] += fw.velocities[j].y * dt;
        posAttr.array[j * 3 + 2] += fw.velocities[j].z * dt;
      }
      posAttr.needsUpdate = true;
      fw.pts.material.opacity = Math.max(0, 1 - fw.age / fw.life);
    }

    for (let i = this.paradeCoins.length - 1; i >= 0; i--) {
      const c = this.paradeCoins[i];
      c.life -= dt;
      c.mesh.rotation.z += dt * 3.5;
      c.mesh.position.y = 0.85 + Math.sin(elapsed * 4 + i) * 0.2;
      if (playerPos && c.mesh.position.distanceTo(playerPos) < 1.9) {
        this.scene.remove(c.mesh);
        this.paradeCoins.splice(i, 1);
        onCollectCoin(5);
        continue;
      }
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.paradeCoins.splice(i, 1);
      }
    }
  }
}

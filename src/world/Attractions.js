import * as THREE from 'three';
import {
  createFeltMaterial,
  createPlushMaterial,
  loadTiledTexture,
  SharedMaterials,
} from './PlushMaterials.js';
import { createJellycatCharacter, loadComfyGLB } from './CharacterFactory.js';
import {
  getRiverCenterRadius,
  getTrainTrackRadius,
  ZONE_CENTERS,
} from './ParkLayout.js';
import { getDeviceProfile, optimizeRigidGroup, optimizeStaticScene } from './SceneOptimizer.js';

export class AttractionsManager {
  constructor(scene, layout) {
    this.scene = scene;
    this.layout = layout;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.interactables = [];
    this.fastTravelPoints = [
      { id: 'plaza', name: '圣茄喷泉 & 迎宾广场', emoji: '⛲', pos: new THREE.Vector3(0, 0.08, 12), desc: '三层雕花圣泉、薰衣草花池与主街咖啡推车' },
      { id: 'castle', name: '圣茄高台皇宫广场', emoji: '🏰', pos: new THREE.Vector3(-6, 0.08, -18), desc: '12级红毯石阶直上 +1.8m 高台皇宫、双翼瀑布与三茄子原型展' },
    ];

    this.train = null;
    this.coaster = null;
    this.spaceCoaster = null;
    this.haunted = null;
    this.buzz = null;
    this.splash = null;
    this.ferris = null;
    this.boats = null;
    this.teacups = null;
    this.dropTower = null;
    this.galleon = null;
    this.carousel = null;
    this.whackGarden = null;
    this.clawMachine = null;
    this.bumperArena = null;
    this.pastryGame = null;
    this.dartsGame = null;
    this.hoopsGame = null;
    this.ringTossGame = null;

    this._buildSteamTrain();
    this._buildCoaster();
    this._buildSpaceCoaster();
    this._buildHauntedMansion();
    this._buildBuzzBlasters();
    this._buildSplashMountain();
    this._buildFerrisWheel();
    this._buildLazyRiverBoats();
    this._buildTeacups();
    this._buildDropTower();
    this._buildPirateGalleon();
    this._buildCarousel();
    this._buildWhackGarden();
    this._buildClawMachine();
    this._buildBumperArena();
    this._buildPastryChefGame();
    this._buildDartBoothGame();
    this._buildCarnivalHoops();
    this._buildRingTossBooth();

    // Single shared indoor ride PointLight (replaces 3 always-on PointLights)
    this.indoorLight = new THREE.PointLight('#d946ef', 0, 26);
    this.indoorLight.position.set(0, -50, 0);
    this.group.add(this.indoorLight);

    // Spatially batch all static attraction geometry (tracks, pillars, stations, booths, shells)
    // while keeping every moving ride car, rotor, mini-game target, and animated prop untouched.
    const dynamicObjects = [
      this.train?.loco,
      ...(this.train?.carriages || []),
      ...(this.train?.smokePuffs?.map((p) => p.mesh) || []),
      ...(this.coaster?.cars || []),
      ...(this.spaceCoaster?.cars || []),
      this.spaceCoaster?.planet,
      ...(this.spaceCoaster?.astronauts?.map((a) => a.mesh) || []),
      ...(this.haunted?.cars || []),
      ...(this.haunted?.ghosts?.map((g) => g.mesh) || []),
      ...(this.haunted?.candles?.map((c) => c.mesh) || []),
      this.haunted?.crystalBall,
      ...(this.buzz?.cars || []),
      this.buzz?.boss,
      ...(this.buzz?.targets?.map((t) => t.mesh) || []),
      ...(this.splash?.boats || []),
      ...(this.splash?.splashDrops?.map((d) => d.mesh) || []),
      this.ferris?.rotor,
      ...(this.boats?.list?.map((b) => b.group) || []),
      ...(this.boats?.stars?.map((s) => s.mesh) || []),
      this.teacups?.platter,
      ...(this.teacups?.steamPuffs?.map((p) => p.mesh) || []),
      this.dropTower?.carriage,
      this.galleon?.shipPivot,
      this.carousel?.spinner,
      this.carousel?.finial,
      ...(this.whackGarden?.holes?.map((h) => h.mesh) || []),
      this.clawMachine?.clawPivot,
      this.clawMachine?.cable,
      this.clawMachine?.clawHead,
      this.clawMachine?.aimRing,
      ...(this.clawMachine?.prizes?.map((p) => p.mesh) || []),
      ...(this.bumperArena?.cars?.map((c) => c.mesh) || []),
      ...(this.bumperArena?.bouncePosts?.map((bp) => bp.ring) || []),
      this.pastryGame?.chef,
      this.pastryGame?.tray,
      ...(this.pastryGame?.items?.map((it) => it.mesh) || []),
      ...(this.dartsGame?.targets?.map((t) => t.mesh) || []),
      this.hoopsGame?.hoopAssembly,
      this.hoopsGame?.ball,
      this.hoopsGame?.powerNeedle3D,
      ...(this.ringTossGame?.pegs?.map((p) => p.mesh) || []),
      this.ringTossGame?.aimRing,
    ];

    const isMobile = getDeviceProfile().isMobileOrTablet;
    this.optimizationStats = optimizeStaticScene(this.group, {
      dynamicObjects,
      chunkSize: 120,
      minShadowRadius: isMobile ? 2.8 : 1.5,
      label: 'attractions',
    });

    // Collapse static meshes inside rigid moving ride assemblies (each car/gondola/cup/boat/mount
    // drops from 20-180 draw calls down to ~3-6 local-space batched meshes!)
    const rigidTargets = [
      ...(this.train?.carriages || []),
      ...(this.coaster?.cars || []),
      ...(this.spaceCoaster?.cars || []),
      this.spaceCoaster?.planet,
      ...(this.spaceCoaster?.astronauts?.map((a) => a.mesh) || []),
      ...(this.haunted?.cars || []),
      ...(this.haunted?.ghosts?.map((g) => g.mesh) || []),
      ...(this.haunted?.candles?.map((c) => c.mesh) || []),
      ...(this.buzz?.cars || []),
      ...(this.splash?.boats || []),
      ...(this.ferris?.gondolas || []),
      ...(this.boats?.list?.map((b) => b.group) || []),
      ...(this.teacups?.cups || []),
      this.dropTower?.carriage,
      this.galleon?.shipPivot,
      ...(this.carousel?.mounts?.map((m) => m.mesh) || []),
      ...(this.whackGarden?.holes?.map((h) => h.mesh) || []),
      ...(this.clawMachine?.prizes?.map((p) => p.mesh) || []),
      ...(this.bumperArena?.cars?.map((c) => c.mesh) || []),
      this.pastryGame?.chef,
      ...(this.ringTossGame?.pegs?.map((p) => p.mesh) || []),
    ];
    for (const rg of rigidTargets) {
      if (rg) optimizeRigidGroup(rg, { minShadowRadius: isMobile ? 3.2 : 1.4, label: 'ride_part' });
    }
    if (this.ferris?.rotor) {
      optimizeRigidGroup(this.ferris.rotor, {
        dynamicObjects: this.ferris.gondolas,
        minShadowRadius: 2.0,
        label: 'ferris_rotor',
      });
    }
    if (this.teacups?.platter) {
      optimizeRigidGroup(this.teacups.platter, {
        dynamicObjects: [
          ...(this.teacups.cups || []),
          ...(this.teacups.steamPuffs?.map((p) => p.mesh) || []),
        ],
        minShadowRadius: 1.8,
        label: 'teacups_platter',
      });
    }
    if (this.carousel?.spinner) {
      optimizeRigidGroup(this.carousel.spinner, {
        dynamicObjects: this.carousel.mounts?.map((m) => m.mesh) || [],
        minShadowRadius: 1.8,
        label: 'carousel_spinner',
      });
    }
  }

  setActiveIndoorRide(rideId) {
    if (!this.indoorLight) return;
    if (rideId === 'coaster' && this.coaster?.interiorCenter) {
      const p = this.coaster.interiorCenter;
      this.indoorLight.position.set(p.x, 6.5, p.z);
      this.indoorLight.color.set('#d946ef');
      this.indoorLight.intensity = 5.0;
    } else if (rideId === 'spacecoaster' && this.spaceCoaster?.origin) {
      const p = this.spaceCoaster.origin;
      this.indoorLight.position.set(p.x, 10.5, p.z);
      this.indoorLight.color.set('#818cf8');
      this.indoorLight.intensity = 4.2;
    } else if (rideId === 'haunted' && this.haunted?.origin) {
      const p = this.haunted.origin;
      this.indoorLight.position.set(p.x, 8.2, p.z);
      this.indoorLight.color.set('#a855f7');
      this.indoorLight.intensity = 4.5;
    } else if (rideId === 'buzz' && this.buzz?.origin) {
      const p = this.buzz.origin;
      this.indoorLight.position.set(p.x, 8.2, p.z);
      this.indoorLight.color.set('#22d3ee');
      this.indoorLight.intensity = 4.2;
    } else {
      this.indoorLight.intensity = 0;
    }
  }

  _addStationPad(pos, color = '#ffd257') {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.16, 28),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, roughness: 0.4 })
    );
    pad.position.set(pos.x, 0.08, pos.z);
    pad.receiveShadow = true;
    this.group.add(pad);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.08, 10, 32), SharedMaterials.gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, 0.18, pos.z);
    this.group.add(ring);
  }

  _registerAttraction({ id, type, name, emoji, padPos, teleportPos, radius = 3.2, desc }) {
    this._addStationPad(padPos);
    this.interactables.push({ id, type, name, emoji, pos: padPos.clone(), radius, desc });
    this.fastTravelPoints.push({ id, name, emoji, pos: teleportPos.clone(), desc });
  }

  // ==================== ① ROYAL AUBERGINE STEAM TRAIN (NEW 4.0) ====================
  _buildSteamTrain() {
    const pts = [];
    const segs = 120;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r = getTrainTrackRadius(a);
      pts.push(new THREE.Vector3(Math.sin(a) * r, 0.14, Math.cos(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);

    const samples = 240;
    const leftPts = [];
    const rightPts = [];
    const ballastPts = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      leftPts.push(p.clone().addScaledVector(side, -0.58));
      rightPts.push(p.clone().addScaledVector(side, 0.58));
      ballastPts.push(p.clone().add(new THREE.Vector3(0, -0.06, 0)));
    }

    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 2, 1);
    const tieGeo = new THREE.BoxGeometry(1.65, 0.1, 0.24);
    const tieMat = new THREE.MeshStandardMaterial({ map: woodTex, color: '#7a5238', roughness: 0.85 });
    const tieCount = 240;
    const tieInst = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tieCount; i++) {
      const t = i / tieCount;
      const p = curve.getPointAt(t);
      const look = curve.getPointAt((t + 0.004) % 1);
      dummy.position.set(p.x, 0.05, p.z);
      dummy.lookAt(look.x, 0.05, look.z);
      dummy.updateMatrix();
      tieInst.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(tieInst);

    const railMat = new THREE.MeshStandardMaterial({ color: '#c4b8d1', metalness: 0.7, roughness: 0.28 });
    const railL = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPts, true), 240, 0.065, 6, true), railMat);
    const railR = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPts, true), 240, 0.065, 6, true), railMat);
    this.group.add(railL, railR);

    // Grand Aubergine Train Depot platform along SE entrance branch (21.8, 0, 102.2)
    const depotPos = ZONE_CENTERS.train;
    const depot = new THREE.Group();
    depot.position.copy(depotPos);
    depot.rotation.y = -0.22;
    this.group.add(depot);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.48, 3.6), new THREE.MeshStandardMaterial({ map: woodTex, color: '#cfa378', roughness: 0.72 }));
    platform.position.y = 0.24;
    platform.receiveShadow = true;
    const stationWall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 2.2), SharedMaterials.aubergineMauve);
    stationWall.position.set(0, 1.85, -0.5);
    stationWall.castShadow = true;
    const stationRoof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 4), SharedMaterials.calyxOlive);
    stationRoof.rotation.y = Math.PI / 4;
    stationRoof.position.set(0, 4.4, -0.5);
    depot.add(platform, stationWall, stationRoof);
    this.layout.addCollider('circle', depotPos.x, depotPos.z, 4.0);

    // Locomotive + 2 passenger carriages
    const loco = new THREE.Group();
    const fallbackLoco = new THREE.Group();
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.2, 24), SharedMaterials.aubergineMauve);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.35, 0.45);
    boiler.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.3, 1.8), createPlushMaterial('#8e5c84'));
    cab.position.set(0, 1.75, -1.45);
    cab.castShadow = true;
    const cabRoof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 4), SharedMaterials.calyxOlive);
    cabRoof.rotation.y = Math.PI / 4;
    cabRoof.position.set(0, 3.2, -1.45);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.24, 1.15, 16), SharedMaterials.gold);
    chimney.position.set(0, 2.5, 1.55);
    const cowcatcher = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 4), SharedMaterials.gold);
    cowcatcher.rotation.x = Math.PI / 2;
    cowcatcher.rotation.z = Math.PI / 4;
    cowcatcher.position.set(0, 0.65, 2.35);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 4.2), createPlushMaterial('#311d3f'));
    chassis.position.set(0, 0.55, 0);
    for (const wx of [-0.92, 0.92]) {
      for (const wz of [-1.4, -0.1, 1.2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 16), createPlushMaterial('#d64550'));
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.45, wz);
        fallbackLoco.add(w);
      }
    }
    fallbackLoco.add(boiler, cab, cabRoof, chimney, cowcatcher, chassis);
    loco.add(fallbackLoco);
    this.group.add(loco);

      if (!getDeviceProfile().isMobileOrTablet) {
        loadComfyGLB('./assets/models/train_locomotive.glb', 3.4).then((glb) => {
          if (glb) {
            loco.remove(fallbackLoco);
            glb.position.y = 0.05;
            loco.add(glb);
          }
        });
      }

      const carriages = [];
      const riderIds = ['aubergine_king', 'bashful_bunny'];
      for (let c = 0; c < 2; c++) {
        const car = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.05, 3.4), createPlushMaterial(c === 0 ? '#b48ee0' : '#ff94b8'));
        body.position.y = 0.92;
        body.castShadow = true;
        const trim = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 3.5), SharedMaterials.gold);
        trim.position.y = 1.48;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.15, 3.5), createFeltMaterial('#ffe6ef'));
        roof.position.y = 2.65;
        for (const px of [-0.82, 0.82]) {
          for (const pz of [-1.4, 1.4]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), SharedMaterials.gold);
            post.position.set(px, 2.05, pz);
            car.add(post);
          }
        }
        const npc = createJellycatCharacter(riderIds[c], { scale: 0.72 });
        npc.position.set(0, 1.0, 0.5);
        car.add(body, trim, roof, npc);
        this.group.add(car);
        carriages.push(car);
      }

      // Animated steam puffs emitted from chimney
      const smokePuffs = [];
      const smokeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, roughness: 0.95 });
      for (let i = 0; i < 12; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), smokeMat.clone());
        this.group.add(puff);
        smokePuffs.push({ mesh: puff, age: (i / 12) * 1.8, life: 1.8, origin: new THREE.Vector3(), velY: 2.2 });
      }

      this.train = { curve, loco, carriages, smokePuffs, progress: 0.03, speed: 0.022, boost: 0, smokeTimer: 0 };
      this._registerAttraction({
        id: 'train',
        type: 'ride',
        name: '环园皇家蒸汽小火车',
        emoji: '🚂',
        padPos: new THREE.Vector3(21.5, 0, 108.0),
        teleportPos: new THREE.Vector3(19.5, 0.08, 105.0),
        desc: '环绕全园五大主题片区的 700 米复古蒸汽专线！按 Space 鸣笛全速冲刺！',
      });
    }

  _buildCoasterTrackAndCars({
      curve,
      samples = 300,
      tieCount = 260,
      railMat,
      spineMat,
      tieMat,
      pillarMat,
      pillarStep = 12,
      carCount = 5,
      carColor = '#7e5b79',
      headlightColor = '#ffcf5c',
      skipPillarCheck = null,
    }) {
      const leftPts = [];
      const rightPts = [];
      const spinePts = [];
      const up = new THREE.Vector3(0, 1, 0);

      for(let i = 0; i<samples; i++) {
      const t = i / samples;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      leftPts.push(p.clone().addScaledVector(side, -0.46));
      rightPts.push(p.clone().addScaledVector(side, 0.46));
      spinePts.push(p.clone().add(new THREE.Vector3(0, -0.3, 0)));
    }

    const tieGeo = new THREE.BoxGeometry(1.18, 0.1, 0.2);
    const tieInst = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tieCount; i++) {
      const t = i / tieCount;
      const p = curve.getPointAt(t);
      const look = curve.getPointAt((t + 0.004) % 1);
      dummy.position.copy(p).add(new THREE.Vector3(0, -0.06, 0));
      dummy.lookAt(look);
      dummy.updateMatrix();
      tieInst.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(tieInst);

    const railL = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPts, true), samples, 0.095, 8, true), railMat);
    const railR = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPts, true), samples, 0.095, 8, true), railMat);
    const spine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spinePts, true), samples, 0.16, 8, true), spineMat);
    railL.castShadow = true;
    railR.castShadow = true;
    this.group.add(railL, railR, spine);

    for (let i = 0; i < samples; i += pillarStep) {
      const p = curve.getPointAt(i / samples);
      if (skipPillarCheck && skipPillarCheck(p)) continue;
      if (p.y < 1.0) continue;
      const h = p.y - 0.3;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 10), pillarMat);
      col.position.set(p.x, h / 2, p.z);
      col.castShadow = true;
      const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.32, 10), SharedMaterials.silver);
      footing.position.set(p.x, 0.16, p.z);
      this.group.add(col, footing);
    }

    const cars = [];
    const bodyMat = createPlushMaterial(carColor);
    for (let i = 0; i < carCount; i++) {
      const car = new THREE.Group();
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.65, 0.65, 22, 1, false), bodyMat);
      tub.scale.set(0.95, 1.0, 1.38);
      tub.position.y = 0.32;
      tub.castShadow = true;
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.08, 10, 24), SharedMaterials.gold);
      trim.rotation.x = Math.PI / 2;
      trim.scale.set(0.95, 1.38, 1.0);
      trim.position.y = 0.64;
      const lapBar = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 16, Math.PI), SharedMaterials.silver);
      lapBar.position.set(0, 0.65, 0.35);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.8), createFeltMaterial('#ffe6ef'));
      seat.position.y = 0.25;
      car.add(tub, trim, lapBar, seat);

      if (i === 0) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 12), SharedMaterials.calyxOlive);
        cap.position.set(0, 0.72, 0.88);
        cap.rotation.x = 0.6;
        for (const hx of [-0.35, 0.35]) {
          const headLight = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 10, 10),
            new THREE.MeshStandardMaterial({ color: '#fff8d4', emissive: headlightColor, emissiveIntensity: 0.9 })
          );
          headLight.position.set(hx, 0.42, 0.98);
          car.add(headLight);
        }
        car.add(cap);
      }
      this.group.add(car);
      cars.push(car);
    }

    return cars;
  }

  // ==================== ② GRAND MATTERHORN & INDOOR CRYSTAL CAVERNS COASTER (320m+) ====================
  _buildCoaster() {
    const c = ZONE_CENTERS.coaster;
    const mountainCenter = new THREE.Vector3(c.x + 1, 0, c.z - 1);

    const pts = [
      new THREE.Vector3(c.x - 12.0, 1.8, c.z + 8.0), // 1. Victorian Station
      new THREE.Vector3(c.x - 14.0, 2.0, c.z + 1.0), // 2. Exit turn
      new THREE.Vector3(c.x - 14.0, 8.8, c.z - 8.0), // 3. Chain-lift hill
      new THREE.Vector3(c.x - 6.0, 19.5, c.z - 14.0), // 4. High cliff climb
      new THREE.Vector3(c.x + 2.0, 26.8, c.z - 12.0), // 5. Alpine summit 27m!
      new THREE.Vector3(c.x + 11.0, 23.0, c.z - 8.0), // 6. Crest drop
      new THREE.Vector3(c.x + 16.0, 14.5, c.z - 2.0), // 7. Banking dive
      new THREE.Vector3(c.x + 13.5, 6.2, c.z + 5.0), // 8. Cave Fang Portal Entry
      // --- INSIDE DARK CRYSTAL CAVERNS Figure-8 Tour (points 9..17 strictly inside r < 10.2 around (c.x+1, c.z-1)) ---
      new THREE.Vector3(c.x + 8.5, 4.2, c.z + 4.5), // 9. Fluorescent Mushroom Grotto
      new THREE.Vector3(c.x + 5.0, 2.6, c.z - 2.5), // 10. Jam Waterfall & Stalagmites
      new THREE.Vector3(c.x + 0.5, 2.2, c.z - 7.5), // 11. Deep Crystal Bend
      new THREE.Vector3(c.x - 6.0, 3.8, c.z - 5.0), // 12. Golden King & Crystal Dragon Treasury
      new THREE.Vector3(c.x - 7.5, 5.8, c.z + 1.5), // 13. Upper gallery climb
      new THREE.Vector3(c.x + 2.5, 7.6, c.z + 2.5), // 14. Flying over Dragon Treasury
      new THREE.Vector3(c.x + 7.2, 5.4, c.z - 5.2), // 15. Inner cavern helix turn
      new THREE.Vector3(c.x - 3.5, 5.2, c.z - 6.8), // 16. Neon crystal swoop
      new THREE.Vector3(c.x - 5.8, 3.6, c.z + 3.5), // 17. Approaching exit portal
      new THREE.Vector3(c.x - 1.5, 2.6, c.z + 6.5), // 18. Portal Burst Tunnel
      // --- BACK OUTSIDE INTO DAYLIGHT ALPINE GRAND DOUBLE-HELIX ---
      new THREE.Vector3(c.x + 4.5, 2.4, c.z + 10.2), // 19. Daylight exit!
      new THREE.Vector3(c.x + 13.5, 9.0, c.z + 12.8), // 20. Airtime Camelback #1
      new THREE.Vector3(c.x + 17.5, 16.0, c.z + 5.5), // 21. Outer Ridge High Turn
      new THREE.Vector3(c.x + 17.2, 19.5, c.z - 5.5), // 22. NE Alpine Helix Crest
      new THREE.Vector3(c.x + 10.5, 22.0, c.z - 13.5), // 23. Summit flyover!
      new THREE.Vector3(c.x - 0.5, 15.5, c.z - 15.8), // 24. North Ridge swoop
      new THREE.Vector3(c.x + 12.0, 12.0, c.z - 12.5), // 25. Fast drop curve
      new THREE.Vector3(c.x + 16.5, 6.2, c.z + 8.5), // 26. Low canyon speed sweep
      new THREE.Vector3(c.x + 7.5, 12.5, c.z + 14.5), // 27. Airtime Camelback #2
      new THREE.Vector3(c.x - 4.5, 8.0, c.z + 14.5), // 28. South Valley Bank
      new THREE.Vector3(c.x - 10.8, 2.2, c.z + 11.8), // 29. Final brake into Station
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);

    const railMat = new THREE.MeshStandardMaterial({ color: '#b487d4', metalness: 0.6, roughness: 0.28 });
    const spineMat = new THREE.MeshStandardMaterial({ color: '#6b4776', metalness: 0.45, roughness: 0.4 });
    const tieMat = new THREE.MeshStandardMaterial({ color: '#e5d4f7', roughness: 0.5 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#ffd56b', metalness: 0.55, roughness: 0.35 });

    const cars = this._buildCoasterTrackAndCars({
      curve,
      samples: 420,
      tieCount: 380,
      railMat,
      spineMat,
      tieMat,
      pillarMat,
      pillarStep: 14,
      carCount: 5,
      carColor: '#7e5b79',
      headlightColor: '#ffcf5c',
      skipPillarCheck: (p) => Math.hypot(p.x - mountainCenter.x, p.z - mountainCenter.z) < 10.5 && p.y < 10.0,
    });

    // Build Solid Sealed Mountain Massif + Pitch-Black Underground Show Cavern Drum!
    const mGroup = new THREE.Group();
    mGroup.position.copy(mountainCenter);
    this.group.add(mGroup);
    this.layout.addCollider('circle', mountainCenter.x, mountainCenter.z, 13.8);

    const cavernDarkMat = new THREE.MeshBasicMaterial({ color: '#080312', side: THREE.BackSide });
    const mountainRockMat = new THREE.MeshStandardMaterial({ color: '#583f6b', roughness: 0.9 });
    const snowMat = new THREE.MeshStandardMaterial({ color: '#f3ebfa', roughness: 0.72 });

    // 100% Sealed Opaque Cylindrical Cliff Wall (r_outer=14.0m) + Pitch-Black Inner Liner (r_inner=13.5m, y=0..11.6m)
    const outerCliffDrum = new THREE.Mesh(new THREE.CylinderGeometry(13.6, 14.3, 11.8, 36), mountainRockMat);
    outerCliffDrum.position.y = 5.9;
    outerCliffDrum.castShadow = true;
    const innerCavernWall = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.2, 11.6, 32, 1, true), cavernDarkMat);
    innerCavernWall.position.y = 5.8;
    const innerCavernCeil = new THREE.Mesh(new THREE.CircleGeometry(13.3, 32), new THREE.MeshBasicMaterial({ color: '#070210' }));
    innerCavernCeil.rotation.x = Math.PI / 2;
    innerCavernCeil.position.y = 11.55;
    const cavernFloor = new THREE.Mesh(new THREE.CircleGeometry(13.4, 32), new THREE.MeshStandardMaterial({ color: '#140826', roughness: 0.9 }));
    cavernFloor.rotation.x = -Math.PI / 2;
    cavernFloor.position.y = 0.08;
    mGroup.add(outerCliffDrum, innerCavernWall, innerCavernCeil, cavernFloor);

    // Exterior Matterhorn peaks crowning above sealed cavern roof + dramatic perimeter rock buttresses
    const mainPeak = new THREE.Mesh(new THREE.ConeGeometry(13.8, 17.5, 10), mountainRockMat);
    mainPeak.position.set(0, 19.6, 0);
    mainPeak.castShadow = true;
    const peakSnow = new THREE.Mesh(new THREE.ConeGeometry(5.8, 7.6, 10), snowMat);
    peakSnow.position.set(0, 25.0, 0);
    mGroup.add(mainPeak, peakSnow);

    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const rx = Math.sin(ang) * 13.0;
      const rz = Math.cos(ang) * 13.0;
      const crag = new THREE.Mesh(new THREE.ConeGeometry(3.4 + (k % 3) * 0.6, 12.5 + (k % 4) * 1.8, 7), mountainRockMat);
      crag.position.set(rx, 6.2, rz);
      crag.rotation.y = ang;
      crag.castShadow = true;
      mGroup.add(crag);
    }

    // Scenic Cascade Waterfall pouring down West mountain cliff into splash pool
    const wfMat = new THREE.MeshStandardMaterial({ color: '#79e7fa', emissive: '#38bdf8', emissiveIntensity: 0.35, transparent: true, opacity: 0.8 });
    const waterfallRibbon = new THREE.Mesh(new THREE.BoxGeometry(2.8, 12.0, 0.5), wfMat);
    waterfallRibbon.position.set(-10.5, 6.2, 4.5);
    waterfallRibbon.rotation.z = 0.22;
    waterfallRibbon.rotation.y = -0.6;
    const wfPool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), wfMat);
    wfPool.rotation.x = -Math.PI / 2;
    wfPool.position.set(-11.8, 0.14, 5.5);
    mGroup.add(waterfallRibbon, wfPool);

    // Underground Scene Props inside the Cavern (visible as cars wind inside!)
    const crystalGlowMat = new THREE.MeshStandardMaterial({ color: '#d8b4fe', emissive: '#a855f7', emissiveIntensity: 1.25 });
    const mushNeonMat = new THREE.MeshStandardMaterial({ color: '#ff70a6', emissive: '#ff2e88', emissiveIntensity: 1.15 });

    for (let s = 0; s < 16; s++) {
      const a = (s / 16) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.8 + (s % 3) * 0.8, 5), crystalGlowMat);
      sp.position.set(Math.cos(a) * 9.0, 1.4, Math.sin(a) * 9.0);
      mGroup.add(sp);
    }
    for (let m = 0; m < 6; m++) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mushNeonMat);
      cap.position.set(4.5 + (m % 3) * 1.4, 1.4, 1.5 - Math.floor(m / 3) * 2.5);
      mGroup.add(cap);
    }

    // Centerpiece: Giant Golden Aubergine King + Crystal Dragon guarding glowing Treasure Mound!
    const treasuryKing = createJellycatCharacter('aubergine_king', { scale: 2.3 });
    treasuryKing.position.set(-1.5, 0.4, -1.0);
    const dragonBody = new THREE.Mesh(new THREE.TorusKnotGeometry(1.1, 0.28, 48, 8, 2, 3), SharedMaterials.gold);
    dragonBody.position.set(-4.2, 2.8, -3.0);
    mGroup.add(treasuryKing, dragonBody);

    // Covered Victorian Station Platform
    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 2, 2);
    const station = new THREE.Group();
    station.position.set(c.x - 12.2, 0, c.z + 9.2);
    station.rotation.y = 0.5;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.48, 4.8), new THREE.MeshStandardMaterial({ map: woodTex, color: '#cfa378', roughness: 0.72 }));
    deck.position.y = 0.24;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.0, 4), SharedMaterials.aubergineMauve);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.2;
    for (const sx of [-2.8, 2.8]) {
      for (const sz of [-2.0, 2.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), SharedMaterials.wood);
        post.position.set(sx, 1.8, sz);
        station.add(post);
      }
    }
    station.add(deck, roof);
    this.group.add(station);

    this.coaster = {
      curve,
      cars,
      progress: 0,
      speed: 0.018,
      boost: 0,
      origin: c,
      interiorCenter: mountainCenter,
      indoorEnvelope: { type: 'cylinder', cx: mountainCenter.x, cz: mountainCenter.z, innerR: 12.6, maxY: 10.8 },
    };
    this._registerAttraction({
      id: 'coaster',
      type: 'ride',
      name: '圣茄紫晶雪山地下过山车',
      emoji: '🎢',
      padPos: new THREE.Vector3(19.5, 0, -15.5),
      teleportPos: new THREE.Vector3(17.5, 0.08, -14.0),
      desc: '300米+长室内外雪山奇幻过山车（约55秒沉浸之旅）！直冲27米雪峰再深入全黑水晶溶洞！',
    });
  }

  // ==================== ②B 100% SEALED INDOOR SPACE AUBERGINE MOUNTAIN (280m+) ====================
  _buildSpaceCoaster() {
    const c = ZONE_CENTERS.spacecoaster;
    const domeGroup = new THREE.Group();
    domeGroup.position.copy(c);
    this.group.add(domeGroup);

    // Monumental 100% Sealed Space Mountain Building: Cylindrical Drum (r=17.6, y=0..14.2) + Fluted Cone Roof (y=14.2..28.7)
    const extMat = new THREE.MeshStandardMaterial({ color: '#eef2ff', roughness: 0.28, metalness: 0.32 });
    const intDarkMat = new THREE.MeshBasicMaterial({ color: '#020109', side: THREE.BackSide });
    const neonCyanMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.5 });
    const neonPinkMat = new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#ec4899', emissiveIntensity: 1.4 });

    const outerDrum = new THREE.Mesh(new THREE.CylinderGeometry(17.6, 18.2, 14.2, 48), extMat);
    outerDrum.position.y = 7.1;
    outerDrum.castShadow = true;
    const outerCone = new THREE.Mesh(new THREE.ConeGeometry(17.8, 14.5, 48), extMat);
    outerCone.position.y = 21.45;
    outerCone.castShadow = true;
    domeGroup.add(outerDrum, outerCone);

    // 100% Sealed Pitch-Black Cosmic Interior Liner (r_inner=17.0, height=27.8m!)
    const innerDrum = new THREE.Mesh(new THREE.CylinderGeometry(17.0, 17.0, 14.2, 40, 1, true), intDarkMat);
    innerDrum.position.y = 7.1;
    const innerCone = new THREE.Mesh(new THREE.ConeGeometry(17.1, 13.8, 40, 1, true), intDarkMat);
    innerCone.position.y = 21.1;
    const darkFloor = new THREE.Mesh(new THREE.CircleGeometry(17.2, 40), new THREE.MeshBasicMaterial({ color: '#03010d' }));
    darkFloor.rotation.x = -Math.PI / 2;
    darkFloor.position.y = 0.08;
    domeGroup.add(innerDrum, innerCone, darkFloor);

    // 18 Metallic Gold Exterior Buttress Ribs + Tilted Orbital Ring + Entrance Marquee Portal
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const ribPts = [
        new THREE.Vector3(Math.cos(a) * 18.4, 0, Math.sin(a) * 18.4),
        new THREE.Vector3(Math.cos(a) * 17.9, 14.2, Math.sin(a) * 17.9),
        new THREE.Vector3(Math.cos(a) * 0.4, 28.8, Math.sin(a) * 0.4),
      ];
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 16, 0.16, 6, false), SharedMaterials.gold);
      domeGroup.add(rib);
    }
    const orbitalRing = new THREE.Mesh(new THREE.TorusGeometry(20.2, 0.28, 10, 64), SharedMaterials.gold);
    orbitalRing.rotation.set(Math.PI * 0.44, 0.2, 0.15);
    orbitalRing.position.y = 13.8;
    domeGroup.add(orbitalRing);

    // Futuristic TRON Neon Entrance Canopy facing SW boarding pad (8.0, -76.5)
    const portalArch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 10, 24, Math.PI), neonCyanMat);
    portalArch.position.set(-12.8, 0.2, 12.6);
    portalArch.rotation.y = Math.PI * 0.25;
    domeGroup.add(portalArch);

    this.layout.addCollider('circle', c.x, c.z, 17.2);

    // Pitch-Black Cosmic Planetarium Interior: 700 3D Stars + Rotating Ringed Aubergine Saturn + 6 Zero-G Astronauts!
    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    const starCols = new Float32Array(starCount * 3);
    const stPalette = [new THREE.Color('#ffffff'), new THREE.Color('#38bdf8'), new THREE.Color('#e879f9'), new THREE.Color('#fde047')];
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const y = 2.0 + Math.random() * 22.0;
      const maxR = y <= 14.0 ? 16.4 : Math.max(1.5, 16.4 * (1 - (y - 14.0) / 13.5));
      const r = maxR * (0.85 + Math.random() * 0.13);
      starPos[i * 3] = Math.cos(th) * r;
      starPos[i * 3 + 1] = y;
      starPos[i * 3 + 2] = Math.sin(th) * r;
      const col = stPalette[i % stPalette.length];
      starCols[i * 3] = col.r;
      starCols[i * 3 + 1] = col.g;
      starCols[i * 3 + 2] = col.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCols, 3));
    domeGroup.add(
      new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.36, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    );

    const aubPlanet = new THREE.Group();
    aubPlanet.position.set(0, 8.2, 0);
    const pBody = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 24, 20),
      new THREE.MeshStandardMaterial({ color: '#9333ea', emissive: '#6b21a8', emissiveIntensity: 0.9, roughness: 0.3 })
    );
    pBody.scale.y = 1.3;
    const pCal = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 8), SharedMaterials.calyxOlive);
    pCal.position.y = 3.8;
    const pRing = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.32, 10, 48), neonCyanMat);
    pRing.rotation.set(Math.PI * 0.42, 0.25, 0);
    aubPlanet.add(pBody, pCal, pRing);
    domeGroup.add(aubPlanet);

    const astronauts = [];
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      const astro = createJellycatCharacter('aubergine_astronaut', { scale: 1.05 });
      astro.position.set(Math.cos(ang) * 6.4, 5.2 + (a % 3) * 3.0, Math.sin(ang) * 6.4);
      domeGroup.add(astro);
      astronauts.push({ mesh: astro, baseY: astro.position.y, phase: a * 1.1 });
    }

    // 100% ENCLOSED 5-Tier Cosmic Spiral Track strictly inside r <= 11.2m, y in [2.2..12.2m] (wall at r=17.0m => >=5.8m safety margin!)
    const pts = [];
    const totalTurns = 5;
    const ptsPerTurn = 8;
    for (let i = 0; i < totalTurns * ptsPerTurn; i++) {
      const t = i / (totalTurns * ptsPerTurn);
      const ang = t * Math.PI * 2 * totalTurns;
      let r = 10.6;
      let y = 2.4;
      if (t < 0.28) {
        const k = t / 0.28;
        r = 10.8 - k * 0.8;
        y = 2.4 + k * 5.2;
      } else if (t < 0.56) {
        const k = (t - 0.28) / 0.28;
        r = 10.0 + Math.sin(k * Math.PI * 2) * 1.1;
        y = 7.6 + k * 4.4; // Climbs cleanly to y = 12.0m!
      } else if (t < 0.82) {
        const k = (t - 0.56) / 0.26;
        r = 10.4 - Math.sin(k * Math.PI) * 2.6; // Swoops tight past rotating Aubergine Saturn!
        y = 12.0 - k * 8.6; // High-speed zero-G dive down to y = 3.4m!
      } else {
        const k = (t - 0.82) / 0.18;
        r = 9.8 + Math.sin(k * Math.PI) * 1.2;
        y = 3.4 + Math.sin(k * Math.PI) * 3.4 - k * 1.0; // Final neon airtime camelback back to 2.4m!
      }
      pts.push(new THREE.Vector3(c.x + Math.cos(ang) * r, y, c.z + Math.sin(ang) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);

    const railMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.75, metalness: 0.65, roughness: 0.25 });
    const spineMat = new THREE.MeshStandardMaterial({ color: '#4c1d95', metalness: 0.6, roughness: 0.35 });
    const tieMat = new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#db2777', emissiveIntensity: 0.55 });

    const cars = this._buildCoasterTrackAndCars({
      curve,
      samples: 400,
      tieCount: 360,
      railMat,
      spineMat,
      tieMat,
      pillarMat: SharedMaterials.gold,
      pillarStep: 20,
      carCount: 4,
      carColor: '#5b21b6',
      headlightColor: '#22d3ee',
      skipPillarCheck: () => true, // Suspended cosmic track inside starfield!
    });

    // 24 Glowing Neon Laser Speed Gates threaded strictly along indoor cosmic helix
    for (let r = 0; r < 24; r++) {
      const t = r / 24;
      const p = curve.getPointAt(t);
      const look = curve.getPointAt((t + 0.01) % 1);
      const gateRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.065, 8, 20), r % 2 === 0 ? neonCyanMat : neonPinkMat);
      gateRing.position.copy(p);
      gateRing.lookAt(look);
      this.group.add(gateRing);
    }

    this.spaceCoaster = {
      curve,
      cars,
      progress: 0.0,
      speed: 0.019,
      boost: 0,
      origin: c,
      planet: aubPlanet,
      astronauts,
      indoorEnvelope: { type: 'cylinder', cx: c.x, cz: c.z, innerR: 16.4, maxY: 16.5 },
    };

    this._registerAttraction({
      id: 'spacecoaster',
      type: 'ride',
      name: '太空茄子星际室内过山车',
      emoji: '🚀',
      padPos: new THREE.Vector3(8.0, 0, -76.5),
      teleportPos: new THREE.Vector3(5.5, 0.08, -74.5),
      desc: '100% 全封闭漆黑宇宙星象穹顶室内过山车（约52秒沉浸太空之旅）！四层螺旋绕行星俯冲！',
    });
  }

  // ==================== ②C HAUNTED AUBERGINE MANSION INDOOR DARK RIDE (NEW 6.0) ====================
  _buildHauntedMansion() {
    const c = ZONE_CENTERS.haunted;
    const manor = new THREE.Group();
    manor.position.copy(c);
    this.group.add(manor);
    this.layout.addCollider('box', c.x, c.z, 12.2, 11.2);

    const wallTex = loadTiledTexture('./assets/textures/tex_castle_wall.png', 3, 2);
    const extMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#3b2452', roughness: 0.85 });
    const darkIntMat = new THREE.MeshBasicMaterial({ color: '#06020e', side: THREE.BackSide });
    const ghostGlowMat = new THREE.MeshStandardMaterial({ color: '#a7f3d0', emissive: '#34d399', emissiveIntensity: 1.15, transparent: true, opacity: 0.72 });
    const purpleGlowMat = new THREE.MeshStandardMaterial({ color: '#e9d5ff', emissive: '#a855f7', emissiveIntensity: 1.2 });

    // Sealed 24m x 22m x 12m Gothic Victorian Manor Building
    const extShell = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 22), extMat);
    extShell.position.y = 6.0;
    extShell.castShadow = true;
    const intShell = new THREE.Mesh(new THREE.BoxGeometry(23.2, 11.4, 21.2), darkIntMat);
    intShell.position.y = 5.75;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(17.5, 6.2, 4), new THREE.MeshStandardMaterial({ color: '#1f1030', roughness: 0.75 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 15.0;
    manor.add(extShell, intShell, roof);

    // 4 Corner Gothic Spires + Front Colonnade Porch facing East-South pad (-24, -73)
    for (const sx of [-11.5, 11.5]) {
      for (const sz of [-10.5, 10.5]) {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5.2, 8), new THREE.MeshStandardMaterial({ color: '#26143d' }));
        spire.position.set(sx, 14.5, sz);
        manor.add(spire);
      }
    }
    for (let p = -2; p <= 2; p++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 7.2, 12), new THREE.MeshStandardMaterial({ color: '#dcd2e8' }));
      col.position.set(12.8, 3.6, p * 3.0);
      manor.add(col);
    }

    // Interior Haunted Rooms: Ballroom Dancers, Levitating Crystal Ball, Floating Candles, Graveyard Choir!
    const ghosts = [];
    const dancerIds = ['aubergine_king', 'aubergine_magician', 'bashful_bunny', 'bartholomew_bear', 'croissant', 'aubergine_charm'];
    // Grand Ballroom center glowing chandelier + 6 waltzing ghostly couples!
    const chandelier = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.14, 8, 24), purpleGlowMat);
    chandelier.rotation.x = Math.PI / 2;
    chandelier.position.set(0, 7.8, 0);
    manor.add(chandelier);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const g = createJellycatCharacter(dancerIds[i], { scale: 0.95 });
      g.position.set(Math.cos(a) * 3.6, 1.2, Math.sin(a) * 3.6);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 12), ghostGlowMat);
      aura.position.y = 0.7;
      g.add(aura);
      manor.add(g);
      ghosts.push({ mesh: g, baseAngle: a, baseY: 1.2, radius: 3.6, isBallroom: true });
    }

    // Madame Aubergine's Levitating Crystal Ball Séance (NW corner)
    const crystalBall = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 20), ghostGlowMat);
    crystalBall.position.set(-6.5, 3.4, -5.8);
    const seanceTable = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 1.4, 16), createPlushMaterial('#43225c'));
    seanceTable.position.set(-6.5, 0.7, -5.8);
    manor.add(crystalBall, seanceTable);

    // 14 Floating Candles hovering throughout the dark manor
    const candles = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const candle = new THREE.Group();
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), SharedMaterials.white);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 6), new THREE.MeshBasicMaterial({ color: '#ffd54f' }));
      flame.position.y = 0.36;
      candle.add(wax, flame);
      candle.position.set(Math.cos(a) * 8.8, 4.8 + (k % 3) * 0.9, Math.sin(a) * 7.8);
      manor.add(candle);
      candles.push({ mesh: candle, baseY: candle.position.y, phase: k * 0.7 });
    }

    // 100% Indoor Sinuous Doom Buggy Track strictly inside |dx| <= 7.8, |dz| <= 6.8 (wall at ±11.6, ±10.6 => >=3.8m clearance!)
    const pts = [
      new THREE.Vector3(c.x + 7.4, 1.1, c.z + 6.4),
      new THREE.Vector3(c.x + 7.6, 1.3, c.z - 0.5),
      new THREE.Vector3(c.x + 6.8, 1.6, c.z - 6.4),
      new THREE.Vector3(c.x + 0.5, 2.2, c.z - 6.6),
      new THREE.Vector3(c.x - 6.8, 2.4, c.z - 6.2),
      new THREE.Vector3(c.x - 7.4, 2.8, c.z - 0.5),
      new THREE.Vector3(c.x - 6.8, 2.2, c.z + 6.2),
      new THREE.Vector3(c.x - 1.5, 1.6, c.z + 6.4),
      new THREE.Vector3(c.x - 4.2, 3.2, c.z + 1.8), // Upper balcony overlooking Haunted Ballroom!
      new THREE.Vector3(c.x - 4.6, 4.0, c.z - 3.6),
      new THREE.Vector3(c.x + 0.4, 4.2, c.z - 4.0),
      new THREE.Vector3(c.x + 4.8, 3.2, c.z - 2.2),
      new THREE.Vector3(c.x + 4.8, 2.4, c.z + 2.4),
      new THREE.Vector3(c.x + 3.2, 1.4, c.z + 6.2),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);

    const railMat = new THREE.MeshStandardMaterial({ color: '#7e22ce', metalness: 0.5, roughness: 0.4 });
    const spineMat = new THREE.MeshStandardMaterial({ color: '#1f1030' });
    const tieMat = new THREE.MeshStandardMaterial({ color: '#4c1d95' });
    const cars = this._buildCoasterTrackAndCars({
      curve,
      samples: 180,
      tieCount: 150,
      railMat,
      spineMat,
      tieMat,
      pillarMat: spineMat,
      pillarStep: 25,
      carCount: 3,
      carColor: '#2e1065',
      headlightColor: '#34d399',
      skipPillarCheck: () => true,
    });

    this.haunted = {
      curve,
      cars,
      progress: 0,
      speed: 0.019,
      ghosts,
      candles,
      crystalBall,
      origin: c,
      indoorEnvelope: { type: 'box', cx: c.x, cz: c.z, halfW: 10.8, halfD: 9.8, maxY: 10.2 },
    };

    this._registerAttraction({
      id: 'haunted',
      type: 'ride',
      name: '幽灵茄子古堡暗黑飞车',
      emoji: '👻',
      padPos: new THREE.Vector3(-22.5, 0, -74.5),
      teleportPos: new THREE.Vector3(-19.5, 0.08, -73.5),
      desc: '迪士尼经典鬼屋暗骑！乘幽灵车穿行全黑维多利亚古堡舞厅与水晶球降灵室，按 Space 点亮提灯抓鬼赢茄币！',
    });
  }

  // ==================== ②D ASTRO AUBERGINE BLASTERS INDOOR LASER DARK RIDE (NEW 6.0) ====================
  _buildBuzzBlasters() {
    const c = ZONE_CENTERS.buzz;
    const fortress = new THREE.Group();
    fortress.position.copy(c);
    this.group.add(fortress);
    this.layout.addCollider('box', c.x, c.z, 12.2, 11.2);

    const extMat = new THREE.MeshStandardMaterial({ color: '#2b205c', roughness: 0.5, metalness: 0.35 });
    const darkIntMat = new THREE.MeshBasicMaterial({ color: '#040112', side: THREE.BackSide });
    const neonGreen = new THREE.MeshStandardMaterial({ color: '#4ade80', emissive: '#22c55e', emissiveIntensity: 1.4 });
    const neonCyan = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#06b6d4', emissiveIntensity: 1.4 });

    const extShell = new THREE.Mesh(new THREE.BoxGeometry(24, 11, 22), extMat);
    extShell.position.y = 5.5;
    extShell.castShadow = true;
    const intShell = new THREE.Mesh(new THREE.BoxGeometry(23.2, 10.4, 21.2), darkIntMat);
    intShell.position.y = 5.25;
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.6, 22.6), neonGreen);
    roofTrim.position.y = 11.1;
    fortress.add(extShell, intShell, roofTrim);

    // Interactive Glowing 3D Z-Targets + Giant Evil Broccoli Emperor Mech Boss inside dark bay!
    const targets = [];
    const targetSpecs = [
      [8.5, 2.8, 3.0, 100], [8.5, 3.8, -4.5, 100], [3.0, 4.2, -8.5, 150],
      [-4.0, 3.0, -8.5, 150], [-8.8, 3.4, -4.0, 100], [-8.8, 4.2, 3.5, 150],
      [-3.5, 3.0, 8.5, 100], [3.5, 4.0, 8.5, 150], [2.2, 3.6, -2.5, 200],
      [-2.5, 3.2, 2.5, 200], [0, 5.2, -4.2, 250], [0, 4.8, 4.2, 250],
    ];
    for (let i = 0; i < targetSpecs.length; i++) {
      const [tx, ty, tz, pts] = targetSpecs[i];
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, ty, tz);
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.14, 10, 24), i % 2 === 0 ? neonGreen : neonCyan);
      const bullseye = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 14, 14),
        new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#e11d48', emissiveIntensity: 1.3 })
      );
      tGroup.add(outer, bullseye);
      fortress.add(tGroup);
      targets.push({ index: i, mesh: tGroup, bullseye, points: pts, cooldown: 0, baseY: ty });
    }

    // Centerpiece: Evil Broccoli Emperor Boss (500 pts!)
    const boss = new THREE.Group();
    boss.position.set(0, 1.0, 0);
    const bossBody = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 3.6, 16), createPlushMaterial('#166534'));
    bossBody.position.y = 1.8;
    const bossCrown = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 14), createPlushMaterial('#22c55e'));
    bossCrown.position.y = 4.2;
    const bossCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 1.6 })
    );
    bossCore.position.set(0, 2.3, 1.65);
    boss.add(bossBody, bossCrown, bossCore);
    fortress.add(boss);
    targets.push({ index: targetSpecs.length, mesh: boss, bullseye: bossCore, points: 500, cooldown: 0, baseY: 1.0, isBoss: true });

    // 100% Indoor Space Cruiser Track strictly inside |dx| <= 7.4, |dz| <= 6.6
    const pts = [
      new THREE.Vector3(c.x + 6.8, 1.3, c.z + 6.0),
      new THREE.Vector3(c.x + 7.2, 1.5, c.z - 5.8),
      new THREE.Vector3(c.x + 1.0, 2.0, c.z - 6.4),
      new THREE.Vector3(c.x - 6.8, 1.8, c.z - 5.8),
      new THREE.Vector3(c.x - 7.0, 1.5, c.z + 5.8),
      new THREE.Vector3(c.x - 1.5, 2.2, c.z + 6.2),
      new THREE.Vector3(c.x + 3.6, 2.8, c.z + 2.8),
      new THREE.Vector3(c.x + 3.6, 2.8, c.z - 2.8),
      new THREE.Vector3(c.x - 3.6, 2.8, c.z - 2.8),
      new THREE.Vector3(c.x - 3.6, 2.4, c.z + 2.8),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);
    const cars = this._buildCoasterTrackAndCars({
      curve,
      samples: 180,
      tieCount: 140,
      railMat: neonCyan,
      spineMat: new THREE.MeshStandardMaterial({ color: '#1e1b4b' }),
      tieMat: neonGreen,
      pillarMat: SharedMaterials.silver,
      pillarStep: 30,
      carCount: 3,
      carColor: '#1d4ed8',
      headlightColor: '#4ade80',
      skipPillarCheck: () => true,
    });

    this.buzz = {
      group: fortress,
      curve,
      cars,
      progress: 0,
      speed: 0.02,
      targets,
      boss,
      lasers: [],
      origin: c,
      indoorEnvelope: { type: 'box', cx: c.x, cz: c.z, halfW: 10.8, halfD: 9.8, maxY: 9.6 },
    };

    this._registerAttraction({
      id: 'buzz',
      type: 'ride',
      name: '巴斯光茄星际射击暗骑',
      emoji: '🔫',
      padPos: new THREE.Vector3(-42.5, 0, 67.5),
      teleportPos: new THREE.Vector3(-40.0, 0.08, 66.0),
      desc: '全室内霓虹激光射击暗骑！乘星际巡洋舰点击靶标或按 Space 发射激光击溃邪恶西兰花大帝！',
    });
  }

  // ==================== ②E SPLASH AUBERGINE MOUNTAIN LOG FLUME WATER COASTER (NEW 6.0) ====================
  _buildSplashMountain() {
    const c = ZONE_CENTERS.splash;
    const mtn = new THREE.Group();
    mtn.position.copy(c);
    this.group.add(mtn);
    this.layout.addCollider('circle', c.x, c.z, 11.0);

    const terracottaMat = new THREE.MeshStandardMaterial({ color: '#b46552', roughness: 0.88 });
    const mossMat = new THREE.MeshStandardMaterial({ color: '#589e5a', roughness: 0.85 });
    const waterChuteMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.45, roughness: 0.18 });

    // Sculpted Bayou Red-Rock Mountain Peak (21m tall) + Mossy Ledges + Splashdown Basin
    const mainMtn = new THREE.Mesh(new THREE.ConeGeometry(12.2, 21.5, 9), terracottaMat);
    mainMtn.position.set(0, 10.75, 0);
    mainMtn.castShadow = true;
    const mossCrown = new THREE.Mesh(new THREE.SphereGeometry(5.2, 16, 12), mossMat);
    mossCrown.scale.set(1.3, 0.45, 1.3);
    mossCrown.position.set(0, 15.2, 0);
    const splashPool = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.0, 0.5, 32), waterChuteMat);
    splashPool.position.set(-7.5, 0.25, -4.5);
    mtn.add(mainMtn, mossCrown, splashPool);

    // 220m+ Log Flume Waterway Curve: Scenic Bayou Float -> Timber Lift Hill to 20.5m -> 45° Waterfall Drop -> Splashdown Pool!
    const pts = [
      new THREE.Vector3(c.x - 10.5, 0.9, c.z - 6.0), // Station & Splash Pool Exit
      new THREE.Vector3(c.x - 13.5, 1.1, c.z + 2.5),
      new THREE.Vector3(c.x - 8.0, 1.6, c.z + 11.5),
      new THREE.Vector3(c.x + 3.5, 2.2, c.z + 13.2),
      new THREE.Vector3(c.x + 12.5, 4.5, c.z + 8.0), // Bayou scenic climb
      new THREE.Vector3(c.x + 14.0, 9.2, c.z - 2.5),
      new THREE.Vector3(c.x + 9.5, 14.5, c.z - 11.0), // Timber lift hill!
      new THREE.Vector3(c.x + 1.5, 19.8, c.z - 11.5), // 20m Summit Crest!
      new THREE.Vector3(c.x - 2.5, 20.2, c.z - 7.5), // Dramatic top pause!
      new THREE.Vector3(c.x - 6.0, 10.5, c.z - 5.5), // Steep 45° Waterfall Chute Drop!!
      new THREE.Vector3(c.x - 8.2, 1.2, c.z - 4.2), // SPLASHDOWN!
      new THREE.Vector3(c.x - 11.0, 0.9, c.z - 1.0),
      new THREE.Vector3(c.x - 13.0, 1.2, c.z - 7.5),
      new THREE.Vector3(c.x - 4.5, 1.8, c.z - 13.0),
      new THREE.Vector3(c.x + 7.0, 3.2, c.z - 12.5),
      new THREE.Vector3(c.x + 13.0, 2.2, c.z + 1.5),
      new THREE.Vector3(c.x + 4.5, 1.2, c.z + 9.5),
      new THREE.Vector3(c.x - 5.5, 1.0, c.z + 6.5),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.45);
    const flumeTrough = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.88, 10, true), waterChuteMat);
    this.group.add(flumeTrough);

    // Timber Trestle Supports
    const timberMat = createPlushMaterial('#8a5a3a');
    for (let i = 0; i < 24; i++) {
      const p = curve.getPointAt(i / 24);
      if (p.y < 1.8) continue;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, p.y - 0.5, 8), timberMat);
      col.position.set(p.x, (p.y - 0.5) / 2, p.z);
      this.group.add(col);
    }

    // Hollow Aubergine Log Boats (2 boats along flume)
    const boats = [];
    for (let b = 0; b < 2; b++) {
      const boat = new THREE.Group();
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.72, 3.0, 16), createPlushMaterial('#7e4b6c'));
      log.rotation.x = Math.PI / 2;
      log.position.y = 0.55;
      const bowLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 10), SharedMaterials.calyxOlive);
      bowLeaf.position.set(0, 0.95, 1.45);
      bowLeaf.rotation.x = 0.7;
      boat.add(log, bowLeaf);
      this.group.add(boat);
      boats.push(boat);
    }

    // 24 Animated 3D Water Splashdown Droplets at the plunge pool!
    const splashDrops = [];
    for (let d = 0; d < 24; d++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#e0f7ff', transparent: true, opacity: 0.85 })
      );
      drop.visible = false;
      this.group.add(drop);
      splashDrops.push({ mesh: drop, vel: new THREE.Vector3(), age: 99 });
    }

    this.splash = {
      curve,
      boats,
      progress: 0,
      speed: 0.022,
      boost: 0,
      splashDrops,
      splashOrigin: new THREE.Vector3(c.x - 8.2, 1.2, c.z - 4.2),
      lastDropTriggered: false,
    };

    this._registerAttraction({
      id: 'splash',
      type: 'ride',
      name: '飞溅茄子激流勇进',
      emoji: '🌊',
      padPos: new THREE.Vector3(46.0, 0, 71.0),
      teleportPos: new THREE.Vector3(43.5, 0.08, 69.0),
      desc: '迪士尼经典水上过山车！乘茄子独木舟攀登 20 米红岩雪山再 45° 瀑布俯冲激起漫天水花！',
    });
  }

  // ==================== ⑭ CARNIVAL BASKETBALL SHOOTOUT MINI-GAME (NEW 6.0) ====================
  _buildCarnivalHoops() {
    const c = ZONE_CENTERS.hoops;
    const court = new THREE.Group();
    court.position.copy(c);
    court.rotation.y = -Math.PI * 0.65;
    this.group.add(court);
    this.layout.addCollider('circle', c.x, c.z, 3.8);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 3, 1);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.4, 3.2), createPlushMaterial('#43225c'));
    frame.position.set(0, 2.7, -1.6);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 4), new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.6 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 6.4, -0.5);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.24, 5.2), createPlushMaterial('#d99b66'));
    floor.position.set(0, 0.12, 1.2);

    // Moving Backboard & Neon Hoop Assembly
    const hoopAssembly = new THREE.Group();
    hoopAssembly.position.set(0, 3.6, -0.1);
    const backboard = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.16), new THREE.MeshStandardMaterial({ color: '#fff8f0', emissive: '#38bdf8', emissiveIntensity: 0.25 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 24), new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#ea580c', emissiveIntensity: 0.6 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, -0.35, 0.58);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.34, 0.72, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true }));
    net.position.set(0, -0.72, 0.58);
    hoopAssembly.add(backboard, rim, net);

    // 3D Basketball Mesh
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.55 })
    );
    ball.position.set(0, 1.4, 3.0);

    // Hardware 3D Neon Power Gauge Bar & Moving Needle (replaces 60fps DOM layout thrashing!)
    const gaugeBar = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.22, 0.08),
      new THREE.MeshBasicMaterial({ color: '#2b1442' })
    );
    gaugeBar.position.set(0, 2.25, 1.35);
    const gaugeSweet = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.24, 0.1),
      new THREE.MeshBasicMaterial({ color: '#22c55e' })
    );
    gaugeSweet.position.set(0, 2.25, 1.36);
    const powerNeedle3D = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.34, 0.14),
      new THREE.MeshBasicMaterial({ color: '#fde047' })
    );
    powerNeedle3D.position.set(0, 2.25, 1.38);

    court.add(frame, roof, floor, hoopAssembly, ball, gaugeBar, gaugeSweet, powerNeedle3D);
    this.hoopsGame = { group: court, center: c, rotY: -Math.PI * 0.65, hoopAssembly, ball, powerNeedle3D };

    this._registerAttraction({
      id: 'hoops',
      type: 'minigame',
      name: '嘉年华超级投篮王',
      emoji: '🏀',
      padPos: new THREE.Vector3(56.5, 0, 52.5),
      teleportPos: new THREE.Vector3(54.0, 0.08, 51.0),
      desc: '游乐园嘉年华招牌投篮摊！看准移动篮筐与能量条黄金区，按 Space 或点击投篮按钮连中三分！',
    });
  }

  // ==================== ⑮ FAIRGROUND NEON RING TOSS BOOTH MINI-GAME (NEW 6.0) ====================
  _buildRingTossBooth() {
    const c = ZONE_CENTERS.ringtoss;
    const booth = new THREE.Group();
    booth.position.copy(c);
    this.group.add(booth);
    this.layout.addCollider('circle', c.x, c.z, 3.6);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 3, 1);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.1, 3.4), createPlushMaterial('#7e5b79'));
    counter.position.set(0, 0.55, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.2, 4), new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.6 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 5.8, 0);
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.6, 8), SharedMaterials.gold);
        post.position.set(sx, 2.4, sz);
        booth.add(post);
      }
    }
    booth.add(counter, roof);

    // 10 Target Pegs (Milk Bottles + 3 Golden Aubergine Prize Pegs!)
    const pegs = [];
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 5; col++) {
        const px = (col - 2) * 1.25;
        const pz = -0.85 + r * 1.1;
        const isGold = r === 0 && (col === 0 || col === 2 || col === 4);
        const peg = isGold
          ? createJellycatCharacter('aubergine_king', { scale: 0.45 })
          : new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.78, 12), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 }));
        peg.position.set(px, isGold ? 1.12 : 1.5, pz);
        booth.add(peg);
        pegs.push({ x: px, z: pz, isGold, points: isGold ? 40 : 15, mesh: peg });
      }
    }

    // Aiming Indicator Ring hovering over throw line
    const aimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.06, 10, 24),
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#f59e0b', emissiveIntensity: 1.0 })
    );
    aimRing.rotation.x = Math.PI / 2;
    aimRing.position.set(0, 2.0, 2.6);
    booth.add(aimRing);

    this.ringTossGame = { group: booth, center: c, pegs, aimRing, activeRings: [] };

    this._registerAttraction({
      id: 'ringtoss',
      type: 'minigame',
      name: '嘉年华霓虹套圈圈大师',
      emoji: '⭕',
      padPos: new THREE.Vector3(-26.0, 0, 71.5),
      teleportPos: new THREE.Vector3(-26.0, 0.08, 69.0),
      desc: '经典嘉年华套圈摊！左右瞄准黄金茄子雕像与牛奶瓶，按 Space 或点击抛圈赢得大奖！',
    });
  }

  // ==================== ③ FERRIS WHEEL ====================
  _buildFerrisWheel() {
    const c = ZONE_CENTERS.ferris;
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(c.x, 14.5, c.z);
    wheelGroup.rotation.y = Math.PI * 0.25;
    this.group.add(wheelGroup);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#e6d3f0', metalness: 0.45, roughness: 0.35 });
    for (const zOff of [-2.2, 2.2]) {
      for (const xSign of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 16.5, 14), frameMat);
        leg.position.set(xSign * 4.5, -7.2, zOff);
        leg.rotation.z = xSign * 0.52;
        leg.castShadow = true;
        wheelGroup.add(leg);
      }
    }
    this.layout.addCollider('circle', c.x, c.z, 3.8);

    const rotor = new THREE.Group();
    wheelGroup.add(rotor);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.0, 24), SharedMaterials.gold);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);

    const radius = 11.0;
    const innerR = 9.2;
    for (const zOff of [-1.2, 1.2]) {
      const outerRim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.22, 12, 64), SharedMaterials.gold);
      outerRim.position.z = zOff;
      const innerRim = new THREE.Mesh(new THREE.TorusGeometry(innerR, 0.14, 10, 64), frameMat);
      innerRim.position.z = zOff;
      rotor.add(outerRim, innerRim);
    }

    const spokeMat = new THREE.MeshStandardMaterial({ color: '#b487d4', emissive: '#581c87', emissiveIntensity: 0.25 });
    const gondolas = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, radius * 2, 10), spokeMat);
      spoke.rotation.z = a;
      rotor.add(spoke);

      const podPivot = new THREE.Group();
      podPivot.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);

      const cabin = new THREE.Group();
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 0.85, 0.92, 24), SharedMaterials.aubergineMauve);
      basket.position.y = -1.45;
      basket.castShadow = true;
      const rimGold = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.07, 8, 24), SharedMaterials.gold);
      rimGold.rotation.x = Math.PI / 2;
      rimGold.position.y = -0.98;
      const roof = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), SharedMaterials.calyxOlive);
      roof.position.y = -0.15;
      for (const pa of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), SharedMaterials.gold);
        rod.position.set(Math.cos(pa) * 0.85, -0.75, Math.sin(pa) * 0.85);
        cabin.add(rod);
      }
      cabin.add(basket, rimGold, roof);
      podPivot.add(cabin);
      rotor.add(podPivot);
      gondolas.push(podPivot);
    }

    this.ferris = { wheelGroup, rotor, gondolas, angle: 0 };
    this._registerAttraction({
      id: 'ferris',
      type: 'ride',
      name: '星空茄子摩天轮',
      emoji: '🎡',
      padPos: new THREE.Vector3(-23.5, 0, -11.5),
      teleportPos: new THREE.Vector3(-21.0, 0.08, -10.5),
      desc: '俯瞰邦尼兔森林与高台皇宫全景！最高点按 P 拍照享双倍金币！',
    });
  }

  // ==================== ④ MEANDERING LAZY RIVER BOATS ====================
  _buildLazyRiverBoats() {
    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 1, 2);
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: '#e6b88a', roughness: 0.65 });

    const boats = [];
    for (let i = 0; i < 3; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.72, 0.68, 24), SharedMaterials.aubergineMauve);
      hull.scale.set(0.95, 1.0, 1.85);
      hull.position.y = 0.25;
      hull.castShadow = true;

      const floorBench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 2.2), woodMat);
      floorBench.position.y = 0.35;

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.11, 10, 28), SharedMaterials.gold);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(0.95, 1.85, 1.0);
      rim.position.y = 0.58;

      const bowCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.58, 12), SharedMaterials.calyxOlive);
      bowCap.position.set(0, 0.68, 1.65);
      bowCap.rotation.x = 0.6;

      boat.add(hull, floorBench, rim, bowCap);
      this.group.add(boat);
      boats.push({ group: boat, angle: (i / 3) * Math.PI * 2 + 0.5, radialOffset: 0 });
    }

    const stars = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const radial = getRiverCenterRadius(a) + (i % 2 === 0 ? 2.1 : -2.1);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), SharedMaterials.gold);
      star.position.set(Math.sin(a) * radial, 0.85, Math.cos(a) * radial);
      this.group.add(star);
      stars.push({ mesh: star, active: true, respawn: 0 });
    }

    const dockPos = ZONE_CENTERS.boatDock;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.45, 4.4), woodMat);
    dock.position.set(dockPos.x, 0.22, dockPos.z + 2.2);
    dock.receiveShadow = true;
    this.group.add(dock);

    this.boats = { list: boats, stars, speed: 0.075 };
    this._registerAttraction({
      id: 'boat',
      type: 'ride',
      name: '蜿蜒翡翠河漂流船',
      emoji: '🚣',
      padPos: new THREE.Vector3(dockPos.x - 1.5, 0, dockPos.z - 2.6),
      teleportPos: new THREE.Vector3(dockPos.x - 3.0, 0.08, dockPos.z - 5.2),
      desc: '乘雕花游船顺蜿蜒碧水穿梭 5 座奇幻拱桥，收集水面黄金星！',
    });
  }

  // ==================== ⑤ STEERABLE TEACUPS + STEAM ====================
  _buildTeacups() {
    const center = ZONE_CENTERS.teacups;
    const baseGroup = new THREE.Group();
    baseGroup.position.copy(center);
    this.group.add(baseGroup);

    const floor = new THREE.Mesh(new THREE.CylinderGeometry(8.9, 9.3, 0.38, 48), createPlushMaterial('#e8cef0'));
    floor.position.y = 0.19;
    floor.receiveShadow = true;
    const floorRim = new THREE.Mesh(new THREE.TorusGeometry(9.0, 0.16, 10, 48), SharedMaterials.gold);
    floorRim.rotation.x = Math.PI / 2;
    floorRim.position.y = 0.38;
    baseGroup.add(floor, floorRim);

    const centerPot = new THREE.Mesh(new THREE.SphereGeometry(1.65, 28, 24), SharedMaterials.aubergineMauve);
    centerPot.position.y = 1.55;
    centerPot.castShadow = true;
    const potCap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.85, 16), SharedMaterials.calyxOlive);
    potCap.position.y = 3.0;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 1.4, 14), SharedMaterials.gold);
    spout.position.set(1.5, 1.9, 0);
    spout.rotation.z = -0.75;
    baseGroup.add(centerPot, potCap, spout);
    this.layout.addCollider('circle', center.x, center.z, 2.2);

    // Teapot steam wisps
    const steamPuffs = [];
    for (let i = 0; i < 6; i++) {
      const steam = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 8, 8),
        new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 })
      );
      baseGroup.add(steam);
      steamPuffs.push({ mesh: steam, phase: i / 6 });
    }

    const platter = new THREE.Group();
    baseGroup.add(platter);

    const cupPts = [
      new THREE.Vector2(0.01, 0.02),
      new THREE.Vector2(0.85, 0.02),
      new THREE.Vector2(1.05, 0.25),
      new THREE.Vector2(1.38, 0.78),
      new THREE.Vector2(1.54, 1.25),
      new THREE.Vector2(1.44, 1.28),
      new THREE.Vector2(0.95, 0.45),
      new THREE.Vector2(0.01, 0.45),
    ];
    const cupGeo = new THREE.LatheGeometry(cupPts, 36);

    const cups = [];
    const wheels = [];
    const cupColors = ['#7e5b79', '#f2e4d8', '#9c72b8', '#f0bfd0', '#6e4e6a', '#f2d8a7'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cup = new THREE.Group();
      cup.position.set(Math.cos(a) * 5.7, 0.38, Math.sin(a) * 5.7);

      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 1.2, 0.18, 32), createPlushMaterial('#efe2d8'));
      saucer.position.y = 0.09;
      saucer.receiveShadow = true;

      const bowl = new THREE.Mesh(cupGeo, createPlushMaterial(cupColors[i], { roughness: 0.42, sheen: 0.35 }));
      bowl.castShadow = true;

      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.075, 10, 32), SharedMaterials.gold);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.26;

      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.11, 10, 18, Math.PI * 1.15),
        SharedMaterials.gold
      );
      handle.position.set(1.42, 0.72, 0);
      handle.rotation.z = -Math.PI * 0.58;

      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 20), createFeltMaterial('#ffe6f0'));
      seat.position.y = 0.5;

      // Center brass steering wheel inside teacup!
      const steerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.55, 10), SharedMaterials.silver);
      steerPost.position.set(0, 0.78, 0.35);
      const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 20), SharedMaterials.gold);
      steerWheel.rotation.x = Math.PI / 2;
      steerWheel.position.set(0, 1.05, 0.35);
      wheels.push(steerWheel);

      cup.add(saucer, bowl, rim, handle, seat, steerPost, steerWheel);
      platter.add(cup);
      cups.push(cup);
    }

    this.teacups = { baseGroup, platter, cups, wheels, steamPuffs, spinBoost: 0, playerSpin: 0, platterAngle: 0, cupAngle: 0 };
    this._registerAttraction({
      id: 'teacups',
      type: 'ride',
      name: '巴塞罗那熊转转杯',
      emoji: '☕',
      padPos: new THREE.Vector3(13.5, 0, 29.0),
      teleportPos: new THREE.Vector3(12.0, 0.08, 26.5),
      desc: '入驻东南甜品湾！按 A/D 掌舵黄金方向盘、Space 加速旋转赢取茄币！',
    });
  }

  // ==================== ⑥ AVOCADO DROP TOWER ====================
  _buildDropTower() {
    const center = ZONE_CENTERS.droptower;
    const towerGroup = new THREE.Group();
    towerGroup.position.copy(center);
    this.group.add(towerGroup);

    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 1.0, 36), createPlushMaterial('#c8f09c'));
    cushion.position.y = 0.5;
    cushion.receiveShadow = true;
    towerGroup.add(cushion);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 28, 24), createPlushMaterial('#578a4e'));
    column.position.y = 14;
    column.castShadow = true;
    towerGroup.add(column);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 27.5, 8), SharedMaterials.gold);
      rail.position.set(Math.cos(a) * 1.4, 14, Math.sin(a) * 1.4);
      towerGroup.add(rail);
    }
    this.layout.addCollider('circle', center.x, center.z, 5.0);

    const domeTex = loadTiledTexture('./assets/textures/tex_onion_dome.png', 3, 2);
    const crownCap = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 0.8, 28),
      new THREE.MeshStandardMaterial({ map: domeTex, color: '#7f9452', roughness: 0.48 })
    );
    crownCap.position.y = 28.0;
    const crownRim = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.16, 10, 28), SharedMaterials.gold);
    crownRim.rotation.x = Math.PI / 2;
    crownRim.position.y = 27.6;
    const topper = createJellycatCharacter('avocado', { scale: 2.5 });
    topper.position.set(0, 28.4, 0);
    towerGroup.add(crownCap, crownRim, topper);

    const carriage = new THREE.Group();
    carriage.position.y = 2.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.5, 14, 32), SharedMaterials.aubergineMauve);
    ring.rotation.x = Math.PI / 2;
    carriage.add(ring);
    towerGroup.add(carriage);

    this.dropTower = {
      towerGroup,
      carriage,
      height: 2.0,
      velocity: 0,
      charge: 0,
      state: 'auto',
      hoverTimer: 0,
      autoTimer: 0,
    };

    this._registerAttraction({
      id: 'droptower',
      type: 'ride',
      name: '牛油果弹射跳楼机',
      emoji: '🥑',
      padPos: new THREE.Vector3(58.5, 0, -56.5),
      teleportPos: new THREE.Vector3(60.5, 0.08, -54.0),
      desc: '坐镇东北尖叫山巅！按住 Space 蓄力冲上 26 米高空再失重回弹！',
    });
  }

  // ==================== ⑦ SPACE AUBERGINE SWINGING GALLEON (NEW 4.0) ====================
  _buildPirateGalleon() {
    const center = ZONE_CENTERS.galleon;
    const galleonGroup = new THREE.Group();
    galleonGroup.position.copy(center);
    galleonGroup.rotation.y = 0.55;
    this.group.add(galleonGroup);

    const frameMat = new THREE.MeshStandardMaterial({ color: '#4d2e63', metalness: 0.5, roughness: 0.35 });
    const hullMat = createPlushMaterial('#6a407a');
    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 2, 2);
    const deckMat = new THREE.MeshStandardMaterial({ map: woodTex, color: '#deb27e', roughness: 0.72 });

    // Stone deck platform
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.45, 7.6), new THREE.MeshStandardMaterial({ color: '#6b4d7c', roughness: 0.75 }));
    plinth.position.y = 0.22;
    plinth.receiveShadow = true;
    galleonGroup.add(plinth);

    // Twin 15.5m A-frame legs + upper cross axle beam
    for (const zSide of [-3.2, 3.2]) {
      for (const xSign of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 16.0, 14), frameMat);
        leg.position.set(xSign * 3.8, 7.6, zSide);
        leg.rotation.z = xSign * 0.24;
        leg.castShadow = true;
        galleonGroup.add(leg);
      }
      this.layout.addCollider('circle', center.x + Math.sin(0.55) * zSide, center.z + Math.cos(0.55) * zSide, 2.2);
    }

    const axleBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7.4, 20), SharedMaterials.gold);
    axleBeam.rotation.x = Math.PI / 2;
    axleBeam.position.y = 14.8;
    galleonGroup.add(axleBeam);

    // Swinging Pendulum Pivot
    const shipPivot = new THREE.Group();
    shipPivot.position.y = 14.8;
    galleonGroup.add(shipPivot);

    // Dual rigid truss arms down to ship hull (length 11.4m -> ship floats y ~ 3.4m)
    for (const zSide of [-1.45, 1.45]) {
      for (const xOff of [-1.8, 1.8]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 11.6, 10), SharedMaterials.gold);
        arm.position.set(xOff, -5.8, zSide);
        arm.rotation.z = xOff > 0 ? 0.12 : -0.12;
        shipPivot.add(arm);
      }
    }

    const shipBody = new THREE.Group();
    shipBody.position.y = -11.4;
    shipPivot.add(shipBody);

    // Sculpted Aubergine Space Galleon Hull
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.15, 9.6, 20), hullMat);
    keel.rotation.z = Math.PI / 2;
    keel.scale.set(0.85, 1.0, 1.35);
    keel.castShadow = true;
    const shipDeck = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.26, 2.8), deckMat);
    shipDeck.position.y = 1.05;
    const gunwale = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.18, 10, 32), SharedMaterials.gold);
    gunwale.rotation.x = Math.PI / 2;
    gunwale.scale.set(1.0, 0.34, 1.0);
    gunwale.position.y = 1.25;

    // Prow & stern high curves + Astronaut Aubergine Figurehead!
    for (const endX of [-4.6, 4.6]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 14), hullMat);
      tip.position.set(endX, 1.9, 0);
      tip.rotation.z = endX > 0 ? -0.6 : 0.6;
      shipBody.add(tip);
    }
    const figurehead = createJellycatCharacter('aubergine_astronaut', { scale: 0.95 });
    figurehead.position.set(5.1, 2.4, 0);
    figurehead.rotation.y = Math.PI / 2;

    // Central Mast & Purple Striped Sail
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.2, 12), SharedMaterials.gold);
    mast.position.y = 4.1;
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.8),
      new THREE.MeshStandardMaterial({ map: loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 2, 1), side: THREE.DoubleSide })
    );
    sail.position.set(0, 4.4, 0.15);
    sail.rotation.y = Math.PI / 2;
    shipBody.add(keel, shipDeck, gunwale, figurehead, mast, sail);

    const seatAnchor = new THREE.Object3D();
    seatAnchor.position.set(1.8, 1.25, 0);
    shipBody.add(seatAnchor);

    this.galleon = {
      group: galleonGroup,
      shipPivot,
      seatAnchor,
      swingAngle: 0,
      swingVel: 0,
      maxAmp: 0.65,
      pumpCooldown: 0,
      riding: false,
      peakCount: 0,
    };

    this._registerAttraction({
      id: 'galleon',
      type: 'ride',
      name: '太空茄子摇摆海盗船',
      emoji: '🏴‍☠️',
      padPos: new THREE.Vector3(64.5, 0, -34.5),
      teleportPos: new THREE.Vector3(62.0, 0.08, -33.5),
      desc: '荡至 72° 失重高空的星际海盗船！按 W / Space 在低点加力冲上云霄！',
    });
  }

  // ==================== ⑧ CAROUSEL WITH FLORAL FRIEZE ====================
  _buildCarousel() {
    const center = ZONE_CENTERS.carousel;
    const group = new THREE.Group();
    group.position.copy(center);
    this.group.add(group);

    const step = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.5, 0.25, 48), createPlushMaterial('#e2cee8'));
    step.position.y = 0.12;
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.8, 0.35, 48), createPlushMaterial('#f2e6dc'));
    stage.position.y = 0.38;
    stage.receiveShadow = true;
    const stageTrim = new THREE.Mesh(new THREE.TorusGeometry(7.65, 0.12, 10, 48), SharedMaterials.gold);
    stageTrim.rotation.x = Math.PI / 2;
    stageTrim.position.y = 0.56;
    group.add(step, stage, stageTrim);

    const spinner = new THREE.Group();
    group.add(spinner);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 7.0, 28), SharedMaterials.gold);
    pillar.position.y = 4.0;
    const mirrorBand = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 3.6, 28), createPlushMaterial('#8e60bd'));
    mirrorBand.position.y = 3.8;
    spinner.add(pillar, mirrorBand);
    this.layout.addCollider('circle', center.x, center.z, 1.6);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 5, 1);
    const canopyMat = new THREE.MeshStandardMaterial({
      map: canopyTex,
      roughness: 0.65,
    });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(8.6, 3.3, 40), canopyMat);
    canopy.position.y = 8.6;
    canopy.castShadow = true;

    const canopyFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), SharedMaterials.gold);
    canopyFinial.position.y = 10.8;

    const canopyRim = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.22, 12, 48), SharedMaterials.gold);
    canopyRim.rotation.x = Math.PI / 2;
    canopyRim.position.y = 7.0;

    // Upper floral crown gallery ring
    const crownBand = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.25, 10, 32), createPlushMaterial('#ff96ba'));
    crownBand.rotation.x = Math.PI / 2;
    crownBand.position.y = 8.8;
    spinner.add(canopy, canopyFinial, canopyRim, crownBand);

    const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff8d4', emissive: '#ffcf5c', emissiveIntensity: 0.85 });
    const scallopMat = createFeltMaterial('#ff96ba');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const scallop = new THREE.Mesh(new THREE.SphereGeometry(0.88, 14, 12), i % 2 === 0 ? scallopMat : createFeltMaterial('#f2e6dc'));
      scallop.scale.set(1.0, 0.65, 0.35);
      scallop.position.set(Math.cos(a) * 8.25, 6.72, Math.sin(a) * 8.25);
      scallop.rotation.y = -a + Math.PI / 2;
      spinner.add(scallop);

      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), bulbMat);
      b1.position.set(Math.cos(a) * 8.48, 7.02, Math.sin(a) * 8.48);
      spinner.add(b1);
    }

    const mountTypes = [
      'aubergine_standard',
      'croissant',
      'boiled_egg',
      'tomato',
      'aubergine_giant',
      'sweetcorn',
      'coffee_cup',
      'bashful_bunny',
    ];
    const mounts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 5.3;

      const spiralPts = [];
      for (let s = 0; s <= 24; s++) {
        const t = s / 24;
        const sa = t * Math.PI * 8;
        spiralPts.push(new THREE.Vector3(Math.cos(a) * r + Math.cos(sa) * 0.04, 0.55 + t * 6.5, Math.sin(a) * r + Math.sin(sa) * 0.04));
      }
      const pole = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 24, 0.075, 8, false), SharedMaterials.gold);
      spinner.add(pole);

      const mount = createJellycatCharacter(mountTypes[i], { scale: 0.9 });
      mount.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
      mount.rotation.y = -a;

      const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 16), createFeltMaterial('#ff7aa8'));
      saddle.position.y = 1.15;
      mount.add(saddle);

      spinner.add(mount);
      mounts.push({ mesh: mount, localAngle: a, radius: r, phase: i * 0.8 });
    }

    this.carousel = { group, spinner, mounts, finial: canopyFinial, angle: 0 };
    this._registerAttraction({
      id: 'carousel',
      type: 'ride',
      name: '果蔬交响旋转木马',
      emoji: '🎠',
      padPos: new THREE.Vector3(22.5, 0, 13.5),
      teleportPos: new THREE.Vector3(20.0, 0.08, 12.0),
      desc: '粉白条纹波浪花冠顶篷！外侧无遮挡视角，按 Q 随时更换果蔬坐骑！',
    });
  }

  // ==================== ⑨ WHACK-A-VEGGIE GARDEN ====================
  _buildWhackGarden() {
    const center = ZONE_CENTERS.whack;
    const garden = new THREE.Group();
    garden.position.copy(center);
    this.group.add(garden);

    const woodTex = loadTiledTexture('./assets/textures/tex_wood.png', 2, 2);
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: '#e8b98a', roughness: 0.72 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.82, 8.2), woodMat);
    base.position.y = 0.41;
    base.castShadow = true;
    base.receiveShadow = true;
    const lawnTop = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.14, 7.7), createFeltMaterial('#74c96b'));
    lawnTop.position.y = 0.86;
    garden.add(base, lawnTop);

    for (const fx of [-4.2, 4.2]) {
      for (const fz of [-4.2, 4.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.4, 10), woodMat);
        post.position.set(fx, 0.7, fz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), SharedMaterials.gold);
        cap.position.set(fx, 1.45, fz);
        garden.add(post, cap);
      }
    }
    this.layout.addCollider('box', center.x, center.z, 4.3, 4.3);

    const holes = [];
    const moleTypes = ['sweetcorn', 'tomato', 'leek', 'aubergine_king'];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const hx = (c - 1) * 2.25;
        const hz = (r - 1) * 2.25;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 10, 24), createPlushMaterial('#573828'));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(hx, 0.94, hz);
        const holeVoid = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), new THREE.MeshBasicMaterial({ color: '#24140e' }));
        holeVoid.rotation.x = -Math.PI / 2;
        holeVoid.position.set(hx, 0.94, hz);
        const veggie = createJellycatCharacter(moleTypes[(r * 3 + c) % moleTypes.length], { scale: 0.68 });
        veggie.position.set(hx, -0.35, hz);
        garden.add(rim, holeVoid, veggie);

        holes.push({ index: r * 3 + c, mesh: veggie, baseX: hx, baseZ: hz, up: false, isGold: false, timer: 0 });
      }
    }

    this.whackGarden = { group: garden, holes, center };
    this._registerAttraction({
      id: 'whack',
      type: 'minigame',
      name: '邦尼兔菜园打地鼠',
      emoji: '🔨',
      padPos: new THREE.Vector3(-71.0, 0, 26.5),
      teleportPos: new THREE.Vector3(-69.0, 0.08, 24.5),
      desc: '邦尼兔森林里的农田狂欢！30秒疯狂敲击冒头的蔬菜与黄金茄子！',
    });
  }

  // ==================== ⑩ 3D CLAW MACHINE ====================
  _buildClawMachine() {
    const center = ZONE_CENTERS.claw;
    const machine = new THREE.Group();
    machine.position.copy(center);
    machine.rotation.y = Math.PI / 2;
    this.group.add(machine);
    this.layout.addCollider('box', center.x, center.z, 3.4, 3.4);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 3, 1);
    const cabinetMat = SharedMaterials.aubergineMauve;
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.0, 6.4), cabinetMat);
    base.position.y = 1.0;
    base.castShadow = true;
    machine.add(base);

    for (const x of [-3.0, 3.0]) {
      for (const z of [-3.0, 3.0]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), SharedMaterials.gold);
        p.position.set(x, 4.6, z);
        machine.add(p);
      }
    }
    const glassBox = new THREE.Mesh(
      new THREE.BoxGeometry(5.9, 5.0, 5.9),
      new THREE.MeshStandardMaterial({ color: '#eef8ff', transparent: true, opacity: 0.22, roughness: 0.08, depthWrite: false })
    );
    glassBox.position.y = 4.5;
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.0, 6.8), cabinetMat);
    topCap.position.y = 7.5;
    const pagodaRoof = new THREE.Mesh(
      new THREE.ConeGeometry(5.4, 2.4, 4),
      new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.6 })
    );
    pagodaRoof.rotation.y = Math.PI / 4;
    pagodaRoof.position.y = 9.2;
    machine.add(glassBox, topCap, pagodaRoof);

    const clawPivot = new THREE.Group();
    clawPivot.position.set(0, 6.6, 0);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), SharedMaterials.silver);
    cable.position.y = -0.5;
    const clawHead = new THREE.Group();
    clawHead.position.y = -1.0;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), SharedMaterials.gold);
    clawHead.add(hub);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const prong = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.08), SharedMaterials.silver);
      prong.position.set(Math.cos(a) * 0.25, -0.35, Math.sin(a) * 0.25);
      prong.rotation.z = Math.cos(a) * 0.35;
      clawHead.add(prong);
    }
    clawPivot.add(cable, clawHead);
    machine.add(clawPivot);

    const aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: '#ffcf5c', side: THREE.DoubleSide })
    );
    aimRing.rotation.x = -Math.PI / 2;
    aimRing.position.set(0, 2.04, 0);
    machine.add(aimRing);

    const prizeIds = [
      'aubergine_king',
      'aubergine_magician',
      'aubergine_astronaut',
      'aubergine_cool',
      'aubergine_baby',
      'aubergine_giant',
      'croissant',
      'boiled_egg',
    ];
    const prizes = [];
    for (let i = 0; i < prizeIds.length; i++) {
      const p = createJellycatCharacter(prizeIds[i], { scale: 0.62 });
      const px = ((i % 3) - 1) * 1.55 + (i % 2 === 0 ? 0.2 : -0.2);
      const pz = (Math.floor(i / 3) - 1) * 1.55;
      p.position.set(px, 2.02, pz);
      machine.add(p);
      prizes.push({ id: prizeIds[i], mesh: p, basePos: p.position.clone(), grabbed: false });
    }

    this.clawMachine = { group: machine, clawPivot, cable, clawHead, aimRing, prizes, center };
    this._registerAttraction({
      id: 'claw',
      type: 'minigame',
      name: '3D奇幻抓娃娃机',
      emoji: '🧸',
      padPos: new THREE.Vector3(-76.5, 0, 10.5),
      teleportPos: new THREE.Vector3(-74.0, 0.08, 9.5),
      desc: '操纵 3D 机械爪精准下爪，抓中稀有 Jellycat 玩偶直接点亮图鉴！',
    });
  }

  // ==================== ⑪ BUMPER ARENA WITH PINBALL BUMPERS ====================
  _buildBumperArena() {
    const center = ZONE_CENTERS.bumper;
    const arena = new THREE.Group();
    arena.position.copy(center);
    this.group.add(arena);

    const cobbleTex = loadTiledTexture('./assets/textures/tex_cobblestone.png', 5, 5);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(12.2, 12.6, 0.35, 48),
      new THREE.MeshStandardMaterial({ map: cobbleTex, color: '#53356b', roughness: 0.45 })
    );
    floor.position.y = 0.17;
    floor.receiveShadow = true;
    const wall = new THREE.Mesh(new THREE.TorusGeometry(12.0, 0.6, 14, 48), createPlushMaterial('#ff7db8'));
    wall.rotation.x = Math.PI / 2;
    wall.position.y = 0.7;

    const woodMat = createPlushMaterial('#b8845a');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 7.0, 12), woodMat);
      col.position.set(Math.cos(a) * 12.3, 3.5, Math.sin(a) * 12.3);
      col.castShadow = true;
      arena.add(col);
    }
    const pavilionRim = new THREE.Mesh(new THREE.TorusGeometry(12.3, 0.35, 12, 48), SharedMaterials.gold);
    pavilionRim.rotation.x = Math.PI / 2;
    pavilionRim.position.y = 7.0;
    const pavilionRoof = new THREE.Mesh(
      new THREE.ConeGeometry(13.2, 3.4, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: '#9c72b8', transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    );
    pavilionRoof.position.y = 8.7;
    arena.add(floor, wall, pavilionRim, pavilionRoof);
    this.layout.addCollider('circle', center.x, center.z, 12.5);

    // 3 Neon Pinball Bounce Posts inside arena!
    const bouncePosts = [];
    const postNeonMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.0, roughness: 0.2 });
    for (let p = 0; p < 3; p++) {
      const a = (p / 3) * Math.PI * 2;
      const px = Math.cos(a) * 4.5;
      const pz = Math.sin(a) * 4.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 1.4, 18), createPlushMaterial('#311d3f'));
      col.position.set(px, 0.9, pz);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.2, 10, 24), postNeonMat.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, 0.78, pz);
      arena.add(col, ring);
      bouncePosts.push({ x: px, z: pz, radius: 1.05, ring, pulse: 0 });
    }

    const cars = [];
    const driverIds = ['aubergine_cool', 'bartholomew_bear', 'avocado', 'sweetcorn', 'tomato', 'croissant'];
    const carColors = ['#7e5b79', '#ff8cb8', '#68c97d', '#ffd452', '#ff6b6b', '#70b7ff'];
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Group();
      const a = (i / 6) * Math.PI * 2;
      car.position.set(Math.cos(a) * 7.5, 0.38, Math.sin(a) * 7.5);

      const bumperRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.35, 12, 28), createPlushMaterial('#251733'));
      bumperRing.rotation.x = Math.PI / 2;
      bumperRing.position.y = 0.32;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.72, 24), createPlushMaterial(carColors[i]));
      shell.position.y = 0.52;
      shell.castShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.8, 8), SharedMaterials.silver);
      pole.position.set(0, 1.8, -0.8);
      const driver = createJellycatCharacter(driverIds[i], { scale: 0.64 });
      driver.position.y = 0.62;

      car.add(bumperRing, shell, pole, driver);
      arena.add(car);
      cars.push({ mesh: car, isPlayer: i === 0, vel: new THREE.Vector3(), heading: a + Math.PI / 2 });
    }

    this.bumperArena = { group: arena, center, radius: 10.2, cars, bouncePosts };
    this._registerAttraction({
      id: 'bumper',
      type: 'minigame',
      name: '霓虹弹珠碰碰车派对',
      emoji: '🏎️',
      padPos: new THREE.Vector3(68.5, 0, -5.0),
      teleportPos: new THREE.Vector3(66.5, 0.08, -4.5),
      desc: '东岸木栈道赛场！撞击 Jellycat 与 3 根霓虹弹珠反弹柱赢双倍茄币！',
    });
  }

  // ==================== ⑫ PATISSERIE CHEF PASTRY CATCHING MINI-GAME (NEW 4.0) ====================
  _buildPastryChefGame() {
    const center = ZONE_CENTERS.pastry;
    const booth = new THREE.Group();
    booth.position.copy(center);
    booth.rotation.y = -Math.PI * 0.62;
    this.group.add(booth);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 3, 1);
    const bakeryWall = new THREE.Mesh(new THREE.BoxGeometry(7.6, 5.2, 2.6), createPlushMaterial('#fff0e8'));
    bakeryWall.position.set(0, 2.6, -1.6);
    bakeryWall.castShadow = true;
    const balconyDeck = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.35, 1.8), SharedMaterials.gold);
    balconyDeck.position.set(0, 4.1, -0.3);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.6, 2.4), new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.6 }));
    awning.position.set(0, 5.8, -0.4);
    awning.rotation.x = 0.22;

    const stageMat = new THREE.MeshStandardMaterial({ color: '#f3d8e6', roughness: 0.6 });
    const stageFloor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.24, 3.6), stageMat);
    stageFloor.position.set(0, 0.12, 1.4);
    stageFloor.receiveShadow = true;

    const chef = createJellycatCharacter('croissant', { scale: 1.35 });
    chef.position.set(0, 4.3, -0.2);
    booth.add(bakeryWall, balconyDeck, awning, stageFloor, chef);
    this.layout.addCollider('circle', center.x, center.z, 3.2);

    // Movable Aubergine Basket Tray
    const tray = new THREE.Group();
    tray.position.set(0, 0.65, 1.8);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 0.55, 20), createPlushMaterial('#c99567'));
    basket.scale.set(1.25, 1.0, 0.8);
    const basketRim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 10, 24), SharedMaterials.gold);
    basketRim.rotation.x = Math.PI / 2;
    basketRim.scale.set(1.25, 0.8, 1.0);
    basketRim.position.y = 0.28;
    const mascot = createJellycatCharacter('aubergine_baby', { scale: 0.55 });
    mascot.position.set(0, 0.15, -0.45);
    tray.add(basket, basketRim, mascot);
    booth.add(tray);

    // Pool of falling treats + burnt toast hazards
    const items = [];
    const defs = [
      { kind: 'croissant', points: 15, build: () => createJellycatCharacter('croissant', { scale: 0.65 }) },
      { kind: 'egg', points: 15, build: () => createJellycatCharacter('boiled_egg', { scale: 0.65 }) },
      { kind: 'coffee', points: 15, build: () => createJellycatCharacter('coffee_cup', { scale: 0.65 }) },
      { kind: 'gold_aubergine', points: 35, build: () => createJellycatCharacter('aubergine_king', { scale: 0.65 }) },
      {
        kind: 'burnt',
        points: -15,
        build: () => {
          const g = new THREE.Group();
          const toast = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.28), new THREE.MeshStandardMaterial({ color: '#2b1f1c', roughness: 0.9 }));
          toast.position.y = 0.38;
          g.add(toast);
          return g;
        },
      },
    ];
    for (let i = 0; i < 8; i++) {
      const def = defs[i % defs.length];
      const mesh = def.build();
      mesh.visible = false;
      booth.add(mesh);
      items.push({ mesh, kind: def.kind, points: def.points, active: false, vx: 0, vy: 0 });
    }

    this.pastryGame = { group: booth, center, chef, tray, trayX: 0, items, rotY: -Math.PI * 0.62 };
    this._registerAttraction({
      id: 'pastry',
      type: 'minigame',
      name: '可颂大厨接甜点挑战',
      emoji: '🥐',
      padPos: new THREE.Vector3(67.0, 0, 35.5),
      teleportPos: new THREE.Vector3(64.5, 0.08, 34.0),
      desc: '可颂主厨从阳台抛撒金黄甜品与皇家茄子！A/D 接住美味并躲开烤焦吐司！',
    });
  }

  // ==================== ⑬ EAST PIER BALLOON DARTS SHOOTER (NEW 4.0) ====================
  _buildDartBoothGame() {
    const center = ZONE_CENTERS.darts;
    const tent = new THREE.Group();
    tent.position.copy(center);
    tent.rotation.y = -Math.PI / 2;
    this.group.add(tent);

    const canopyTex = loadTiledTexture('./assets/textures/tex_carousel_canopy.png', 3, 1);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.8, 0.6), createPlushMaterial('#2a183f'));
    backWall.position.set(0, 2.5, -2.4);
    backWall.castShadow = true;

    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 2.2, 4), new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.65 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 6.0, -0.3);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.1, 1.2), createPlushMaterial('#7e5b79'));
    counter.position.set(0, 0.55, 2.4);
    counter.castShadow = true;

    for (const sx of [-3.9, 3.9]) {
      for (const sz of [-2.3, 2.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.9, 10), SharedMaterials.gold);
        post.position.set(sx, 2.45, sz);
        tent.add(post);
      }
    }
    tent.add(backWall, roof, counter);
    this.layout.addCollider('circle', center.x, center.z, 3.6);

    const targets = [];
    const targetPalette = ['#ff6b9d', '#22d3ee', '#ffd166', '#c084fc'];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const isGold = r === 1 && (c === 1 || c === 2);
        const bx = (c - 1.5) * 1.65;
        const by = 1.6 + r * 1.1;
        const tGroup = new THREE.Group();
        tGroup.position.set(bx, by, -1.95);

        const balloon = new THREE.Mesh(
          new THREE.SphereGeometry(0.44, 16, 16),
          new THREE.MeshStandardMaterial({
            color: isGold ? '#ffd24c' : targetPalette[(r + c) % targetPalette.length],
            emissive: isGold ? '#ff9900' : '#220033',
            emissiveIntensity: isGold ? 0.55 : 0.18,
            roughness: 0.3,
          })
        );
        balloon.scale.y = 1.18;
        tGroup.add(balloon);

        if (isGold) {
          const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), SharedMaterials.calyxOlive);
          crown.position.y = 0.52;
          tGroup.add(crown);
        }

        tent.add(tGroup);
        targets.push({
          index: r * 4 + c,
          mesh: tGroup,
          baseX: bx,
          baseY: by,
          speed: (r % 2 === 0 ? 1 : -1) * (1.2 + r * 0.45),
          phase: c * 0.9,
          points: isGold ? 30 : 12,
          active: true,
          respawn: 0,
        });
      }
    }

    this.dartsGame = { group: tent, center, targets, activeDarts: [], rotY: -Math.PI / 2 };
    this._registerAttraction({
      id: 'darts',
      type: 'minigame',
      name: '神射手霓虹飞镖摊',
      emoji: '🎯',
      padPos: new THREE.Vector3(71.0, 0, 18.0),
      teleportPos: new THREE.Vector3(68.5, 0.08, 18.0),
      desc: '东岸嘉年华射击摊！点击气球或按 1-9 / Space 掷出 3D 飞镖击破移动黄金茄！',
    });
  }

  getNearestInteractable(playerPos) {
    let best = null;
    let bestDist = Infinity;
    for (const item of this.interactables) {
      const d = playerPos.distanceTo(item.pos);
      if (d <= item.radius && d < bestDist) {
        best = item;
        bestDist = d;
      }
    }
    return best;
  }

  update(dt, elapsed) {
    // ① Steam Train
    if (this.train) {
      const tr = this.train;
      tr.boost = Math.max(0, tr.boost - dt * 0.015);
      tr.progress = (tr.progress + dt * (tr.speed + tr.boost)) % 1;

      const pos = tr.curve.getPointAt(tr.progress);
      const look = tr.curve.getPointAt((tr.progress + 0.005) % 1);
      tr.loco.position.copy(pos);
      tr.loco.lookAt(look);

      for (let i = 0; i < tr.carriages.length; i++) {
        const ct = (tr.progress - (i + 1) * 0.010 + 1) % 1;
        const cp = tr.curve.getPointAt(ct);
        const cl = tr.curve.getPointAt((ct + 0.005) % 1);
        tr.carriages[i].position.copy(cp);
        tr.carriages[i].lookAt(cl);
      }

      tr.smokeTimer += dt;
      for (const pf of tr.smokePuffs) {
        pf.age += dt;
        if (pf.age >= pf.life) {
          pf.age = 0;
          pf.origin.copy(pos).add(new THREE.Vector3(0, 3.0, 0));
        }
        const k = pf.age / pf.life;
        pf.mesh.position.set(
          pf.origin.x + Math.sin(k * 5 + pf.life) * 0.35,
          pf.origin.y + pf.velY * pf.age,
          pf.origin.z + Math.cos(k * 4) * 0.35
        );
        pf.mesh.scale.setScalar(0.6 + k * 2.2);
        pf.mesh.material.opacity = Math.max(0, 0.72 * (1 - k));
      }
    }

    // ② Roller Coaster (Matterhorn)
    if (this.coaster) {
      const c = this.coaster;
      const spd = c.speed + c.boost;
      c.progress = (c.progress + dt * spd) % 1;
      for (let i = 0; i < c.cars.length; i++) {
        const t = (c.progress - i * 0.015 + 1) % 1;
        const pos = c.curve.getPointAt(t);
        const look = c.curve.getPointAt((t + 0.008) % 1);
        c.cars[i].position.copy(pos);
        c.cars[i].lookAt(look);
      }
    }

    // ②B Space Aubergine Dome Coaster
    if (this.spaceCoaster) {
      const sc = this.spaceCoaster;
      const spd = sc.speed + sc.boost;
      sc.progress = (sc.progress + dt * spd) % 1;
      for (let i = 0; i < sc.cars.length; i++) {
        const t = (sc.progress - i * 0.014 + 1) % 1;
        const pos = sc.curve.getPointAt(t);
        const look = sc.curve.getPointAt((t + 0.008) % 1);
        sc.cars[i].position.copy(pos);
        sc.cars[i].lookAt(look);
      }
      sc.planet.rotation.y += dt * 0.35;
      for (const a of sc.astronauts) {
        a.mesh.position.y = a.baseY + Math.sin(elapsed * 1.4 + a.phase) * 0.65;
        a.mesh.rotation.y += dt * 0.65;
      }
    }

    // ②C Haunted Mansion Doom Buggies + Ballroom Ghosts
    if (this.haunted) {
      const hm = this.haunted;
      hm.progress = (hm.progress + dt * hm.speed) % 1;
      for (let i = 0; i < hm.cars.length; i++) {
        const t = (hm.progress - i * 0.06 + 1) % 1;
        const pos = hm.curve.getPointAt(t);
        const look = hm.curve.getPointAt((t + 0.015) % 1);
        hm.cars[i].position.copy(pos);
        hm.cars[i].lookAt(look);
      }
      for (const g of hm.ghosts) {
        const a = g.baseAngle + elapsed * 0.65;
        g.mesh.position.set(Math.cos(a) * g.radius, g.baseY + Math.sin(elapsed * 2.4 + g.baseAngle) * 0.35, Math.sin(a) * g.radius);
        g.mesh.rotation.y = -a + Math.PI / 2;
      }
      for (const cd of hm.candles) {
        cd.mesh.position.y = cd.baseY + Math.sin(elapsed * 1.9 + cd.phase) * 0.25;
      }
      hm.crystalBall.position.y = 3.4 + Math.sin(elapsed * 2.2) * 0.32;
    }

    // ②D Astro Aubergine Blasters Cruisers + Boss
    if (this.buzz) {
      const bz = this.buzz;
      bz.progress = (bz.progress + dt * bz.speed) % 1;
      for (let i = 0; i < bz.cars.length; i++) {
        const t = (bz.progress - i * 0.08 + 1) % 1;
        const pos = bz.curve.getPointAt(t);
        const look = bz.curve.getPointAt((t + 0.015) % 1);
        bz.cars[i].position.copy(pos);
        bz.cars[i].lookAt(look);
      }
      bz.boss.rotation.y += dt * 0.9;
      for (const tg of bz.targets) {
        if (tg.cooldown > 0) tg.cooldown -= dt;
        if (!tg.isBoss) {
          tg.mesh.rotation.y += dt * 1.4;
          tg.mesh.position.y = tg.baseY + Math.sin(elapsed * 2.0 + tg.index) * 0.25;
        }
      }
    }

    // ②E Splash Mountain Log Flume Boats & Waterfall Splashdown Burst
    if (this.splash) {
      const sp = this.splash;
      const prevProg = sp.progress;
      sp.progress = (sp.progress + dt * (sp.speed + sp.boost)) % 1;
      for (let i = 0; i < sp.boats.length; i++) {
        const t = (sp.progress - i * 0.5 + 1) % 1;
        const pos = sp.curve.getPointAt(t);
        const look = sp.curve.getPointAt((t + 0.01) % 1);
        sp.boats[i].position.copy(pos);
        sp.boats[i].lookAt(look);
      }
      // Trigger dramatic 3D splashdown droplet spray when lead boat plunges into splash pool (t ~ 0.56)
      if (prevProg < 0.56 && sp.progress >= 0.56) {
        for (const d of sp.splashDrops) {
          d.age = 0;
          d.mesh.visible = true;
          d.mesh.position.copy(sp.splashOrigin);
          const a = Math.random() * Math.PI * 2;
          const spd = 2.5 + Math.random() * 4.5;
          d.vel.set(Math.cos(a) * spd, 5.5 + Math.random() * 5.0, Math.sin(a) * spd);
        }
      }
      for (const d of sp.splashDrops) {
        if (d.age < 1.3) {
          d.age += dt;
          d.vel.y -= 13.0 * dt;
          d.mesh.position.addScaledVector(d.vel, dt);
          if (d.age >= 1.3 || d.mesh.position.y < 0.2) d.mesh.visible = false;
        }
      }
    }

    // ③ Ferris Wheel
    if (this.ferris) {
      this.ferris.angle += dt * 0.22;
      this.ferris.rotor.rotation.z = this.ferris.angle;
      for (const pod of this.ferris.gondolas) {
        pod.rotation.z = -this.ferris.angle;
      }
    }

    // ④ Meandering River Boats
    if (this.boats) {
      for (const b of this.boats.list) {
        b.angle = (b.angle + dt * this.boats.speed) % (Math.PI * 2);
        const nextAngle = b.angle + 0.04;
        const rNow = getRiverCenterRadius(b.angle) + b.radialOffset;
        const rNext = getRiverCenterRadius(nextAngle) + b.radialOffset;
        const px = Math.sin(b.angle) * rNow;
        const pz = Math.cos(b.angle) * rNow;
        const nx = Math.sin(nextAngle) * rNext;
        const nz = Math.cos(nextAngle) * rNext;
        b.group.position.set(px, -0.22 + Math.sin(elapsed * 2 + b.angle) * 0.05, pz);
        b.group.lookAt(nx, b.group.position.y, nz);
      }
      for (const s of this.boats.stars) {
        if (s.active) {
          s.mesh.rotation.y += dt * 2.2;
          s.mesh.position.y = 0.85 + Math.sin(elapsed * 3 + s.mesh.position.x) * 0.16;
        } else {
          s.respawn -= dt;
          if (s.respawn <= 0) {
            s.active = true;
            s.mesh.visible = true;
          }
        }
      }
    }

    // ⑤ Teacups + Steam + Steering Wheels
    if (this.teacups) {
      const tc = this.teacups;
      tc.spinBoost = Math.max(0, tc.spinBoost - dt * 0.45);
      tc.platterAngle += dt * (0.55 + tc.spinBoost * 0.45);
      tc.cupAngle += dt * (1.2 + tc.spinBoost * 3.8 + tc.playerSpin * 2.4);
      tc.platter.rotation.y = tc.platterAngle;
      for (let i = 0; i < tc.cups.length; i++) {
        tc.cups[i].rotation.y = tc.cupAngle * (i % 2 === 0 ? 1 : -1);
      }
      for (const sp of tc.steamPuffs) {
        const t = (elapsed * 0.9 + sp.phase) % 1;
        sp.mesh.position.set(1.7 + Math.sin(t * 6) * 0.25, 2.35 + t * 2.6, Math.cos(t * 5) * 0.2);
        sp.mesh.scale.setScalar(0.5 + t * 1.8);
        sp.mesh.material.opacity = Math.max(0, 0.65 * (1 - t));
      }
    }

    // ⑥ Drop Tower
    if (this.dropTower && this.dropTower.state === 'auto') {
      const d = this.dropTower;
      d.autoTimer += dt;
      const cycle = d.autoTimer % 8;
      if (cycle < 3.5) {
        d.height = THREE.MathUtils.lerp(2.0, 24.5, cycle / 3.5);
      } else if (cycle < 4.5) {
        d.height = 24.5;
      } else if (cycle < 5.3) {
        const t = (cycle - 4.5) / 0.8;
        d.height = THREE.MathUtils.lerp(24.5, 2.0, t * t);
      } else {
        const bounce = Math.abs(Math.sin((cycle - 5.3) * Math.PI * 2.2)) * Math.exp(-(cycle - 5.3) * 1.4);
        d.height = 2.0 + bounce * 3.2;
      }
      d.carriage.position.y = d.height;
    }

    // ⑦ Swinging Pirate Galleon (ambient idle swing when not player-driven)
    if (this.galleon && !this.galleon.riding) {
      const ga = this.galleon;
      ga.swingAngle = Math.sin(elapsed * 1.35) * 0.62;
      ga.shipPivot.rotation.z = ga.swingAngle;
    }

    // ⑧ Carousel
    if (this.carousel) {
      const ca = this.carousel;
      ca.angle += dt * 0.65;
      ca.spinner.rotation.y = ca.angle;
      ca.finial.rotation.y = elapsed * 1.8;
      for (const m of ca.mounts) {
        m.mesh.position.y = 1.5 + Math.sin(elapsed * 3.0 + m.phase) * 0.38;
      }
    }

    // ⑪ Bumper Arena idle patrol + bounce post glow decay
    if (this.bumperArena) {
      if (!this.bumperArena.active) {
        for (let i = 0; i < this.bumperArena.cars.length; i++) {
          const c = this.bumperArena.cars[i];
          const a = elapsed * 0.35 + (i / 6) * Math.PI * 2;
          c.mesh.position.set(Math.cos(a) * 7.5, 0.38, Math.sin(a) * 7.5);
          c.mesh.rotation.y = -a;
        }
      }
      for (const bp of this.bumperArena.bouncePosts) {
        bp.pulse = Math.max(0, bp.pulse - dt * 2.5);
        bp.ring.material.emissiveIntensity = 0.85 + bp.pulse * 2.5;
        bp.ring.scale.setScalar(1.0 + bp.pulse * 0.25);
      }
    }
  }
}

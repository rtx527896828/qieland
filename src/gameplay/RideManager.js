import * as THREE from 'three';
import { createJellycatCharacter } from '../world/CharacterFactory.js';

export class RideManager {
  constructor(attractions, player, camera, audio, ui) {
    this.attractions = attractions;
    this.player = player;
    this.camera = camera;
    this.audio = audio;
    this.ui = ui;

    this.activeRide = null;
    this.firstPerson = false;
    this.snapCameraNext = false;
    this.riderMesh = null;
    this.carouselMountIdx = 0;
    this.isAtFerrisPeak = false;
    this.coinAccum = 0;
    this.teacupBonusCooldown = 0;
    this.galleonBonusCooldown = 0;
    this.hauntedFlashCooldown = 0;
    this.buzzScore = 0;
    this.buzzFireCooldown = 0;
    this.dropScoreGiven = false;

    this.rideYawOffset = 0;
    this.ridePitchOffset = 0.25;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._bindRideKeys();
  }

  _bindRideKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.activeRide) return;
      if (e.code === 'KeyV') {
        this.toggleCameraMode();
      } else if (e.code === 'KeyQ' && this.activeRide === 'carousel') {
        this.switchCarouselMount();
      } else if (e.code === 'Space') {
        if (this.activeRide === 'teacups') {
          this.boostTeacups();
        } else if (this.activeRide === 'train') {
          this.attractions.train.boost = 0.025;
          this.audio?.playSfx('coaster', 0.35);
        } else if (this.activeRide === 'haunted') {
          this.flashHauntedLantern();
        } else if (this.activeRide === 'buzz') {
          this.fireBuzzLaser();
        }
      } else if (
        e.code === 'KeyH' &&
        (this.activeRide === 'coaster' ||
          this.activeRide === 'spacecoaster' ||
          this.activeRide === 'splash' ||
          this.activeRide === 'train')
      ) {
        this.audio?.playSfx('coaster', 0.4);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.activeRide === 'droptower' && e.code === 'Space') {
        this.releaseDropLaunch();
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (this.activeRide !== 'buzz') return;
      if (e.target.closest('.ride-hud') || e.target.closest('.hud-top-right') || e.target.closest('.hud-top-left') || e.target.closest('.touch-ui')) {
        return;
      }
      this.fireBuzzLaserAtPointer(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.activeRide || !this.player.dragging) return;
      this.rideYawOffset -= e.movementX * 0.005;
      this.ridePitchOffset = THREE.MathUtils.clamp(this.ridePitchOffset + e.movementY * 0.004, -0.15, 0.9);
    });
  }

  enterRide(rideId) {
    if (this.activeRide) return;
    this.activeRide = rideId;
    this.player.enabled = false;
    this.firstPerson = false;
    this.snapCameraNext = true;
    this.isAtFerrisPeak = false;
    this.coinAccum = 0;
    this.buzzScore = 0;
    this.rideYawOffset = 0;
    this.ridePitchOffset = 0.22;

    const costId = this.player.costumeId.startsWith('comfy_') ? 'aubergine_charm' : this.player.costumeId;
    this.riderMesh = createJellycatCharacter(costId, { scale: 0.78 });

    if (rideId === 'train') {
      this.attractions.train.carriages[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 1.0, -0.35);
      this.audio?.playSfx('coaster', 0.4);
      this.ui.showRideHud('🚂 环园皇家蒸汽小火车', [
        { label: '📷 切换视角 [V]', onClick: () => this.toggleCameraMode() },
        { label: '📣 鸣笛全速 [Space]', onClick: () => { this.attractions.train.boost = 0.025; this.audio?.playSfx('coaster', 0.35); } },
      ]);
    } else if (rideId === 'coaster') {
      this.attractions.coaster.cars[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.25, 0);
      this.audio?.playSfx('coaster', 0.55);
      this.ui.showRideHud('🏔️ 圣茄紫晶雪山地下过山车', [
        { label: '📷 切换视角 [V]', onClick: () => this.toggleCameraMode() },
        { label: '⚡ 极速俯冲 [W / Space]', onClick: () => (this.attractions.coaster.boost = 0.025) },
      ]);
    } else if (rideId === 'spacecoaster') {
      this.attractions.spaceCoaster.cars[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.25, 0);
      this.audio?.playSfx('coaster', 0.55);
      this.ui.showRideHud('🚀 太空茄子星际室内过山车', [
        { label: '📷 驾驶舱/内景 [V]', onClick: () => this.toggleCameraMode() },
        { label: '🌌 曲速推进 [W / Space]', onClick: () => (this.attractions.spaceCoaster.boost = 0.028) },
      ]);
    } else if (rideId === 'haunted') {
      this.attractions.haunted.cars[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.25, 0);
      this.ui.showRideHud('👻 幽灵茄子古堡暗黑飞车', [
        { label: '🔦 点亮幽灵提灯 [Space]', onClick: () => this.flashHauntedLantern() },
        { label: '📷 切换视角 [V]', onClick: () => this.toggleCameraMode() },
      ]);
    } else if (rideId === 'buzz') {
      this.firstPerson = true; // First-person laser turret cockpit for crisp aiming!
      this.attractions.buzz.cars[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.25, 0);
      this.ui.showRideHud('🔫 巴斯光茄星际射击暗骑', [
        { label: '⚡ 发射激光 [Space / 点击靶标]', onClick: () => this.fireBuzzLaser() },
        { label: '📷 视角切换 [V]', onClick: () => this.toggleCameraMode() },
      ]);
    } else if (rideId === 'splash') {
      this.attractions.splash.boats[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.65, 0);
      this.audio?.playSfx('boat', 0.5);
      this.ui.showRideHud('🌊 飞溅茄子激流勇进', [
        { label: '🌊 激流加速 [W / Space]', onClick: () => (this.attractions.splash.boost = 0.022) },
        { label: '📷 视角切换 [V]', onClick: () => this.toggleCameraMode() },
      ]);
    } else if (rideId === 'ferris') {
      this.attractions.ferris.gondolas[0].add(this.riderMesh);
      this.riderMesh.position.set(0, -1.42, 0);
      this.ui.showRideHud('🎡 星空茄子摩天轮', [
        { label: '📷 车内俯瞰/外景 [V]', onClick: () => this.toggleCameraMode() },
        { label: '📸 绝美打卡 [P]', onClick: () => this.ui.triggerPhoto?.() },
      ]);
    } else if (rideId === 'boat') {
      this.attractions.boats.list[0].group.add(this.riderMesh);
      this.riderMesh.position.set(0, 0.35, 0);
      this.audio?.playSfx('boat', 0.5);
      this.ui.showRideHud('🚣 蜿蜒翡翠河漂流船', [
        { label: '⬅️ 向左划 [A]', onClick: () => this._nudgeBoat(-1.2) },
        { label: '➡️ 向右划 [D]', onClick: () => this._nudgeBoat(1.2) },
      ]);
    } else if (rideId === 'teacups') {
      this.attractions.teacups.cups[0].add(this.riderMesh);
      this.riderMesh.position.set(0, 0.68, 0);
      this.ui.showRideHud('☕ 巴塞罗那熊转转杯', [
        { label: '🌀 狂按加速旋转 [Space]', onClick: () => this.boostTeacups() },
      ]);
    } else if (rideId === 'droptower') {
      const dtower = this.attractions.dropTower;
      dtower.state = 'idle';
      dtower.height = 2.0;
      dtower.charge = 0;
      dtower.carriage.position.y = 2.0;
      dtower.carriage.add(this.riderMesh);
      this.riderMesh.position.set(0, 0.25, 2.25);
      this.ui.showRideHud('🥑 牛油果弹射跳楼机', [
        { label: '🚀 满蓄力弹射！', onClick: () => this.launchDropTower(1.0) },
      ]);
    } else if (rideId === 'galleon') {
      const ga = this.attractions.galleon;
      ga.riding = true;
      ga.swingAngle = 0.25;
      ga.swingVel = 0.9;
      ga.seatAnchor.add(this.riderMesh);
      this.riderMesh.position.set(0, 0.02, 0);
      this.riderMesh.rotation.y = Math.PI / 2;
      this.ui.showRideHud('🏴‍☠️ 太空茄子摇摆海盗船', [
        { label: '🚀 摆荡加力 [Space / W]', onClick: () => this._pumpGalleon(0.55) },
        { label: '📷 视角切换 [V]', onClick: () => this.toggleCameraMode() },
      ]);
    } else if (rideId === 'carousel') {
      this.carouselMountIdx = 0;
      const mount = this.attractions.carousel.mounts[0].mesh;
      mount.add(this.riderMesh);
      this.riderMesh.position.set(0, 1.05, 0);
      this.ui.showRideHud('🎠 果蔬交响旋转木马', [
        { label: '🦄 切换坐骑 [Q]', onClick: () => this.switchCarouselMount() },
        { label: '📷 视角切换 [V]', onClick: () => this.toggleCameraMode() },
      ]);
    }
  }

  flashHauntedLantern() {
    if (this.activeRide !== 'haunted' || this.hauntedFlashCooldown > 0) return;
    this.hauntedFlashCooldown = 2.0;
    this.ui.addCoins(8);
    this.audio?.playSfx('coin', 0.55);
    this.ui.toast('🔦 幽灵提灯照亮了古堡幽灵舞会！获赠 +8 开心茄币');
  }

  fireBuzzLaserAtPointer(clientX, clientY) {
    if (this.activeRide !== 'buzz' || this.buzzFireCooldown > 0) return;
    const bz = this.attractions.buzz;
    this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(bz.targets.map((t) => t.mesh), true);
    if (hits.length > 0) {
      const obj = hits[0].object;
      const target = bz.targets.find((t) => t.mesh === obj || t.mesh.children.includes(obj));
      if (target) {
        this._hitBuzzTarget(target);
        return;
      }
    }
    this.fireBuzzLaser();
  }

  fireBuzzLaser() {
    if (this.activeRide !== 'buzz' || this.buzzFireCooldown > 0) return;
    const bz = this.attractions.buzz;
    const carPos = new THREE.Vector3();
    bz.cars[0].getWorldPosition(carPos);
    let best = null;
    let bestDist = Infinity;
    for (const t of bz.targets) {
      if (t.cooldown > 0) continue;
      const wp = new THREE.Vector3();
      t.mesh.getWorldPosition(wp);
      const d = wp.distanceTo(carPos);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (best) this._hitBuzzTarget(best);
  }

  _hitBuzzTarget(target) {
    if (target.cooldown > 0) return;
    this.buzzFireCooldown = 0.25;
    target.cooldown = 1.6;
    this.buzzScore += target.points;
    const coinGain = target.isBoss ? 15 : 4;
    this.ui.addCoins(coinGain);
    this.audio?.playSfx('coin', 0.5);
    if (target.isBoss) {
      this.ui.toast(`💥 激光直击邪恶西兰花大帝核心！+500 分 & +15 茄币！`);
    }
  }

  _pumpGalleon(extraImpulse) {
    const ga = this.attractions.galleon;
    if (!ga) return;
    const sign = Math.abs(ga.swingVel) > 0.08 ? Math.sign(ga.swingVel) : Math.cos(ga.swingAngle) >= 0 ? 1 : -1;
    ga.swingVel += sign * extraImpulse;
  }

  _nudgeBoat(delta) {
    const b = this.attractions.boats.list[0];
    b.radialOffset = THREE.MathUtils.clamp(b.radialOffset + delta, -3.5, 3.5);
  }

  boostTeacups() {
    const tc = this.attractions.teacups;
    tc.spinBoost = Math.min(4.2, tc.spinBoost + 0.75);
    this.audio?.playSfx('squeak', 0.4);
    if (tc.spinBoost >= 3.4 && this.teacupBonusCooldown <= 0) {
      this.teacupBonusCooldown = 3.5;
      this.ui.addCoins(12);
      this.ui.toast('🌀 狂暴旋转达成！巴塞罗那熊撒出了 +12 开心茄币！');
    }
  }

  launchDropTower(power) {
    const d = this.attractions.dropTower;
    d.state = 'launching';
    d.velocity = 14 + power * 20;
    this.dropScoreGiven = false;
    this.audio?.playSfx('coaster', 0.5);
  }

  releaseDropLaunch() {
    const d = this.attractions.dropTower;
    if (d.state === 'charging') {
      this.launchDropTower(Math.max(0.35, d.charge));
      d.charge = 0;
    }
  }

  switchCarouselMount() {
    const mounts = this.attractions.carousel.mounts;
    this.riderMesh?.parent?.remove(this.riderMesh);
    this.carouselMountIdx = (this.carouselMountIdx + 1) % mounts.length;
    mounts[this.carouselMountIdx].mesh.add(this.riderMesh);
    this.riderMesh.position.set(0, 1.05, 0);
    this.audio?.playSfx('squeak', 0.35);
  }

  toggleCameraMode() {
    this.firstPerson = !this.firstPerson;
  }

  exitRide() {
    if (!this.activeRide) return;
    if (this.riderMesh?.parent) {
      this.riderMesh.parent.remove(this.riderMesh);
    }
    this.riderMesh = null;

    if (this.activeRide === 'droptower') this.attractions.dropTower.state = 'auto';
    if (this.activeRide === 'coaster') this.attractions.coaster.boost = 0;
    if (this.activeRide === 'spacecoaster') this.attractions.spaceCoaster.boost = 0;
    if (this.activeRide === 'splash') this.attractions.splash.boost = 0;
    if (this.activeRide === 'train') this.attractions.train.boost = 0;
    if (this.activeRide === 'teacups') this.attractions.teacups.playerSpin = 0;
    if (this.activeRide === 'galleon') this.attractions.galleon.riding = false;
    if (this.activeRide === 'buzz' && this.buzzScore > 0) {
      this.ui.toast(`🔫 星际射击暗骑结束！总得分 ${this.buzzScore} 分！`);
    }

    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();

    const pad = this.attractions.interactables.find((i) => i.id === this.activeRide);
    if (pad) {
      this.player.teleportTo(pad.pos);
    }
    this.activeRide = null;
    this.isAtFerrisPeak = false;
    this.player.enabled = true;
    this.ui.hideRideHud();
  }

  _isInsideEnvelope(pos, env) {
    if (!env) return false;
    if (env.type === 'cylinder') {
      return Math.hypot(pos.x - env.cx, pos.z - env.cz) < env.innerR && pos.y < env.maxY;
    }
    return (
      Math.abs(pos.x - env.cx) < env.halfW &&
      Math.abs(pos.z - env.cz) < env.halfD &&
      pos.y < env.maxY
    );
  }

  _clampCameraToEnvelope(pos, env) {
    if (!env) return pos;
    const out = pos.clone();
    out.y = THREE.MathUtils.clamp(out.y, 1.0, env.maxY - 0.8);
    if (env.type === 'cylinder') {
      const dx = out.x - env.cx;
      const dz = out.z - env.cz;
      const dist = Math.hypot(dx, dz);
      const limit = env.innerR - 0.8;
      if (dist > limit && dist > 0.001) {
        out.x = env.cx + (dx / dist) * limit;
        out.z = env.cz + (dz / dist) * limit;
      }
    } else if (env.type === 'box') {
      out.x = THREE.MathUtils.clamp(out.x, env.cx - (env.halfW - 0.8), env.cx + (env.halfW - 0.8));
      out.z = THREE.MathUtils.clamp(out.z, env.cz - (env.halfD - 0.8), env.cz + (env.halfD - 0.8));
    }
    return out;
  }

  _followRideCamera(worldPos, worldQuat, fpOffset, tpOffset, dt, indoorEnvelope = null, forceStrictInside = false) {
    const focus = worldPos.clone().add(new THREE.Vector3(0, 0.85, 0));
    const applyInside = forceStrictInside || this._isInsideEnvelope(worldPos, indoorEnvelope);
    let desired;

    if (this.firstPerson) {
      desired = worldPos.clone().add(fpOffset.clone().applyQuaternion(worldQuat));
      if (applyInside) desired = this._clampCameraToEnvelope(desired, indoorEnvelope);
      if (this.snapCameraNext) {
        this.camera.position.copy(desired);
        this.snapCameraNext = false;
      } else {
        this.camera.position.lerp(desired, Math.min(1, dt * 12));
      }
      const forward = new THREE.Vector3(0, 0, 14).applyQuaternion(worldQuat).add(worldPos);
      this.camera.lookAt(forward);
      return;
    }

    const offset = tpOffset.clone().applyQuaternion(worldQuat);
    desired = worldPos.clone().add(offset);
    if (applyInside) {
      desired = this._clampCameraToEnvelope(desired, indoorEnvelope);
    }

    if (this.snapCameraNext) {
      this.camera.position.copy(desired);
      this.snapCameraNext = false;
    } else {
      this.camera.position.lerp(desired, Math.min(1, dt * 10));
    }
    if (applyInside) {
      const clampedNow = this._clampCameraToEnvelope(this.camera.position, indoorEnvelope);
      this.camera.position.copy(clampedNow);
    }
    this.camera.lookAt(focus);
  }

  update(dt, _elapsed) {
    if (!this.activeRide) return;
    if (this.teacupBonusCooldown > 0) this.teacupBonusCooldown -= dt;
    if (this.galleonBonusCooldown > 0) this.galleonBonusCooldown -= dt;
    if (this.hauntedFlashCooldown > 0) this.hauntedFlashCooldown -= dt;
    if (this.buzzFireCooldown > 0) this.buzzFireCooldown -= dt;

    const keys = this.player.keys;
    const stick = this.player.touchStick || { x: 0, y: 0 };
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    this.riderMesh.getWorldPosition(worldPos);
    this.riderMesh.getWorldQuaternion(worldQuat);

    if (this.activeRide === 'train') {
      const tr = this.attractions.train;
      if (keys.has('KeyW') || keys.has('Space') || stick.y < -0.35) {
        tr.boost = THREE.MathUtils.lerp(tr.boost, 0.025, dt * 3);
      }
      this.coinAccum += dt;
      if (this.coinAccum >= 4.5) {
        this.coinAccum = 0;
        this.ui.addCoins(5);
      }
      this.ui.setRideStatus(`环园蒸汽巡游 | 按 [W/Space] 加速鸣笛 | [V] 切换视角 | 每 4.5s 获赏 +5 茄币`);
      this._followRideCamera(worldPos, worldQuat, new THREE.Vector3(0, 1.35, 0.4), new THREE.Vector3(0, 4.4, -10.5), dt);
    } else if (this.activeRide === 'coaster' || this.activeRide === 'spacecoaster') {
      const isSpace = this.activeRide === 'spacecoaster';
      const c = isSpace ? this.attractions.spaceCoaster : this.attractions.coaster;
      const baseSpd = isSpace ? 0.019 : 0.018;
      const maxBoost = isSpace ? 0.026 : 0.024;
      c.boost =
        keys.has('KeyW') || keys.has('Space') || stick.y < -0.35
          ? THREE.MathUtils.lerp(c.boost, maxBoost, dt * 4)
          : THREE.MathUtils.lerp(c.boost, 0, dt * 3);
      if (keys.has('KeyH')) {
        this.coinAccum += dt;
        if (this.coinAccum >= 0.7) {
          this.coinAccum = 0;
          this.ui.addCoins(2);
        }
      }
      const targetFov = 56 + (c.boost / maxBoost) * 12;
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 5);
        this.camera.updateProjectionMatrix();
      }
      const pct = Math.round(((c.speed + c.boost) / baseSpd) * 100);
      this.ui.setRideStatus(
        `${isSpace ? '🌌 全室内太空星象穹顶' : '🏔️ 雪山溶洞过山车'} · 速度 ${pct}% | [W/Space] 加速 | [V] 切换视角`
      );
      this._followRideCamera(
        worldPos,
        worldQuat,
        new THREE.Vector3(0, 1.3, 0.25),
        new THREE.Vector3(0, 1.85, -3.6),
        dt,
        c.indoorEnvelope,
        isSpace
      );
    } else if (this.activeRide === 'haunted') {
      const hm = this.attractions.haunted;
      this.ui.setRideStatus(`👻 全室内古堡暗黑游览中 | 按 [Space] 点亮幽灵提灯抓鬼赚茄币 | [V] 视角`);
      this._followRideCamera(
        worldPos,
        worldQuat,
        new THREE.Vector3(0, 1.32, 0.3),
        new THREE.Vector3(0, 1.8, -3.2),
        dt,
        hm.indoorEnvelope,
        true
      );
    } else if (this.activeRide === 'buzz') {
      const bz = this.attractions.buzz;
      this.ui.setRideStatus(`🔫 巴斯光茄激光积分: ${this.buzzScore} 分 | 直接点击/触屏发光靶标或按 [Space] 开火！`);
      this._followRideCamera(
        worldPos,
        worldQuat,
        new THREE.Vector3(0, 1.32, 0.35),
        new THREE.Vector3(0, 1.85, -3.2),
        dt,
        bz.indoorEnvelope,
        true
      );
    } else if (this.activeRide === 'splash') {
      const sp = this.attractions.splash;
      sp.boost =
        keys.has('KeyW') || keys.has('Space') || stick.y < -0.35
          ? THREE.MathUtils.lerp(sp.boost, 0.022, dt * 4)
          : THREE.MathUtils.lerp(sp.boost, 0, dt * 3);
      this.ui.setRideStatus(`🌊 激流勇进 · 当前高度 ${worldPos.y.toFixed(1)}m | 按 [W/Space] 划桨加速冲击瀑布！`);
      this._followRideCamera(worldPos, worldQuat, new THREE.Vector3(0, 1.35, 0.35), new THREE.Vector3(0, 3.2, -6.5), dt);
    } else if (this.activeRide === 'ferris') {
      this.isAtFerrisPeak = worldPos.y > 22.0;
      const peakMsg = this.isAtFerrisPeak
        ? '✨ 最高点绝佳俯瞰机位！按 [P] 拍照享双倍金币！'
        : `当前高度: ${worldPos.y.toFixed(1)}m | 可拖拽屏幕环顾全园`;
      this.ui.setRideStatus(peakMsg);
      if (this.firstPerson) {
        const camPos = worldPos.clone().add(new THREE.Vector3(0, 0.9, 0));
        this.camera.position.lerp(camPos, Math.min(1, dt * 8));
        const lookYaw = this.rideYawOffset;
        this.camera.lookAt(camPos.x + Math.sin(lookYaw) * 20, camPos.y - 4, camPos.z + Math.cos(lookYaw) * 20);
      } else {
        const ang = Math.PI * 0.25 + this.rideYawOffset;
        const camPos = worldPos.clone().add(new THREE.Vector3(Math.sin(ang) * 11, 2.5 + this.ridePitchOffset * 6, Math.cos(ang) * 11));
        this.camera.position.lerp(camPos, Math.min(1, dt * 6));
        this.camera.lookAt(worldPos.clone().add(new THREE.Vector3(0, 0.5, 0)));
      }
    } else if (this.activeRide === 'boat') {
      const b = this.attractions.boats.list[0];
      const steer = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + stick.x;
      b.radialOffset = THREE.MathUtils.clamp(b.radialOffset + steer * dt * 4.5, -3.5, 3.5);

      for (const s of this.attractions.boats.stars) {
        if (s.active && s.mesh.position.distanceTo(worldPos) < 2.6) {
          s.active = false;
          s.respawn = 12;
          s.mesh.visible = false;
          this.ui.addCoins(10);
          this.audio?.playSfx('coin', 0.6);
          this.ui.toast('⭐ 捞到河面黄金茄子星！+10 开心茄币');
        }
      }
      this.ui.setRideStatus(`用摇杆 / A / D 控制小船左右偏移穿行音乐长廊收集黄金星！偏移: ${b.radialOffset.toFixed(1)}m`);
      this._followRideCamera(worldPos, worldQuat, new THREE.Vector3(0, 1.35, 0.3), new THREE.Vector3(0, 3.6, -7.8), dt);
    } else if (this.activeRide === 'teacups') {
      const tc = this.attractions.teacups;
      const steer = (keys.has('KeyA') ? 1.6 : 0) - (keys.has('KeyD') ? 1.6 : 0) - stick.x * 1.6;
      tc.playerSpin = THREE.MathUtils.lerp(tc.playerSpin, steer, dt * 5);
      if (tc.wheels[0]) tc.wheels[0].rotation.z += dt * (steer * 6.0);

      const pct = Math.min(100, Math.round((tc.spinBoost / 3.8) * 100));
      this.ui.setRideStatus(`旋转充能: ${pct}% | 摇杆/A/D 掌舵方向盘 | Space 狂暴加速`);
      const center = tc.baseGroup.position;
      const outDir = worldPos.clone().sub(center).setY(0).normalize();
      const desired = worldPos.clone().addScaledVector(outDir, 7.5).add(new THREE.Vector3(0, 4.5, 0));
      this.camera.position.lerp(desired, Math.min(1, dt * 6));
      this.camera.lookAt(worldPos.clone().add(new THREE.Vector3(0, 0.5, 0)));
    } else if (this.activeRide === 'droptower') {
      const d = this.attractions.dropTower;
      if ((d.state === 'idle' || d.state === 'charging') && keys.has('Space')) {
        d.state = 'charging';
        d.charge = Math.min(1.0, d.charge + dt * 0.75);
      } else if (d.state === 'launching') {
        d.height += d.velocity * dt;
        d.velocity -= 18 * dt;
        if (d.height >= 26.2 || d.velocity <= 0) {
          d.state = 'hovering';
          d.hoverTimer = 1.6;
        }
      } else if (d.state === 'hovering') {
        d.hoverTimer -= dt;
        if (d.hoverTimer <= 0) {
          d.state = 'dropping';
          d.velocity = 0;
        }
      } else if (d.state === 'dropping') {
        d.velocity -= 34 * dt;
        d.height += d.velocity * dt;
        if (d.height <= 2.0) {
          d.height = 2.0;
          if (Math.abs(d.velocity) > 5.0) {
            d.velocity = -d.velocity * 0.55;
            this.audio?.playSfx('squeak', 0.55);
            if (!this.dropScoreGiven) {
              this.dropScoreGiven = true;
              this.ui.addCoins(15);
              this.ui.toast('🥑 软绵绵落地回弹！获赠 +15 开心茄币');
            }
          } else {
            d.velocity = 0;
            d.state = 'idle';
          }
        }
      }
      d.carriage.position.y = d.height;
      const statusMap = {
        idle: '按住 [Space] 或点击弹射蓄力升空！',
        charging: `⚡ 弹射蓄力中: ${Math.round(d.charge * 100)}% (松开起飞!)`,
        launching: `🚀 极速上升！当前高度 ${d.height.toFixed(1)}m`,
        hovering: '✨ 最高点失重悬停中... 准备下坠！',
        dropping: '😱 自由落体下坠！！',
      };
      this.ui.setRideStatus(statusMap[d.state] || '');
      const desired = new THREE.Vector3(d.towerGroup.position.x + 15, d.height + 5.5, d.towerGroup.position.z + 18);
      this.camera.position.lerp(desired, Math.min(1, dt * 6));
      this.camera.lookAt(worldPos);
    } else if (this.activeRide === 'galleon') {
      const ga = this.attractions.galleon;
      ga.swingVel -= 2.35 * Math.sin(ga.swingAngle) * dt;
      ga.swingVel *= 0.996;
      if (keys.has('Space') || keys.has('KeyW') || stick.y < -0.35) {
        const dirSign = Math.abs(ga.swingVel) > 0.08 ? Math.sign(ga.swingVel) : 1;
        ga.swingVel += dirSign * 1.15 * Math.cos(ga.swingAngle) * dt;
      }
      ga.swingAngle += ga.swingVel * dt;
      if (Math.abs(ga.swingAngle) > 1.26) {
        ga.swingAngle = Math.sign(ga.swingAngle) * 1.26;
        ga.swingVel *= -0.7;
      }
      ga.shipPivot.rotation.z = ga.swingAngle;

      const deg = Math.round(Math.abs(THREE.MathUtils.radToDeg(ga.swingAngle)));
      if (deg >= 62 && this.galleonBonusCooldown <= 0) {
        this.galleonBonusCooldown = 2.6;
        this.ui.addCoins(10);
        this.audio?.playSfx('coin', 0.5);
        this.ui.toast(`🏴‍☠️ 荡至 ${deg}° 极致失重最高点！获赠 +10 茄币！`);
      }
      this.ui.setRideStatus(`当前摆角: ${deg}° / 72° | 按住 [Space / W] 冲向最高点！`);

      if (this.firstPerson) {
        this._followRideCamera(worldPos, worldQuat, new THREE.Vector3(0, 1.35, 0.3), new THREE.Vector3(0, 4, -10), dt);
      } else {
        const gPos = ga.group.position;
        const desired = new THREE.Vector3(gPos.x - 14.5, 8.5 + this.ridePitchOffset * 5, gPos.z + 14.5);
        this.camera.position.lerp(desired, Math.min(1, dt * 6));
        this.camera.lookAt(worldPos);
      }
    } else if (this.activeRide === 'carousel') {
      const ca = this.attractions.carousel;
      const cPos = ca.group.position;
      this.ui.setRideStatus(`第 ${this.carouselMountIdx + 1} 号果蔬坐骑 | 按 [Q] 切换 | 可拖拽环顾 | [V] 切换第一人称`);

      if (this.firstPerson) {
        const focus = worldPos.clone().add(new THREE.Vector3(0, 1.15, 0));
        this.camera.position.lerp(focus, Math.min(1, dt * 10));
        const forward = new THREE.Vector3(0, 0, 10).applyQuaternion(worldQuat).add(focus);
        this.camera.lookAt(forward);
      } else {
        const outDir = worldPos.clone().sub(cPos).setY(0).normalize();
        outDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rideYawOffset * 0.65);
        const focus = worldPos.clone().add(new THREE.Vector3(0, 0.75, 0));
        const desired = cPos
          .clone()
          .addScaledVector(outDir, 10.6)
          .add(new THREE.Vector3(0, 2.8 + this.ridePitchOffset * 2.5, 0));
        this.camera.position.lerp(desired, Math.min(1, dt * 10));
        this.camera.lookAt(focus);
      }
    }
  }
}

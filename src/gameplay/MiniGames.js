import * as THREE from 'three';

export class MiniGamesManager {
  constructor(attractions, player, camera, audio, ui) {
    this.attractions = attractions;
    this.player = player;
    this.camera = camera;
    this.audio = audio;
    this.ui = ui;

    this.activeGame = null; // 'whack' | 'claw' | 'bumper' | 'pastry' | 'darts' | 'hoops' | 'ringtoss'
    this.timer = 0;
    this.score = 0;

    // Whack state
    this.whackSpawnTimer = 0;
    this.whackButtons = [];

    // Claw state
    this.clawX = 0;
    this.clawZ = 0;
    this.clawState = 'aim';
    this.clawHeight = 6.6;
    this.heldPrize = null;

    // Bumper state
    this.bumperDashCooldown = 0;
    this.bumperHitCooldown = 0;

    // Pastry chef state
    this.pastrySpawnTimer = 0;

    // Darts booth state
    this.dartCooldown = 0;
    this.dartRaycaster = new THREE.Raycaster();
    this.dartMouse = new THREE.Vector2();

    // Hoops shootout state
    this.hoopPower = 0;
    this.hoopBallFlight = null;
    this.hoopCombo = 0;
    this.hoopGaugeBar = null;

    // Ring toss state
    this.ringAimX = 0;
    this.ringCooldown = 0;

    this._bindKeys();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.activeGame) return;
      if (this.activeGame === 'whack') {
        const match = e.code.match(/^Digit([1-9])$/);
        if (match) {
          this.whackHole(parseInt(match[1], 10) - 1);
        }
      } else if (this.activeGame === 'claw' && e.code === 'Space') {
        e.preventDefault();
        this.dropClaw();
      } else if (this.activeGame === 'bumper' && e.code === 'Space') {
        e.preventDefault();
        this.dashBumper();
      } else if (this.activeGame === 'darts') {
        const match = e.code.match(/^Digit([1-9])$/);
        if (match) {
          this.throwDartAtTarget(parseInt(match[1], 10) - 1);
        } else if (e.code === 'Space') {
          e.preventDefault();
          this.throwDartAtNearest();
        }
      } else if (this.activeGame === 'hoops' && e.code === 'Space') {
        e.preventDefault();
        this.shootBasketball();
      } else if (this.activeGame === 'ringtoss' && e.code === 'Space') {
        e.preventDefault();
        this.tossRing();
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (this.activeGame !== 'darts') return;
      if (e.target.closest('.minigame-hud') || e.target.closest('.hud-top-right') || e.target.closest('.hud-top-left') || e.target.closest('.touch-ui')) {
        return;
      }
      this.dartMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.dartMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.dartRaycaster.setFromCamera(this.dartMouse, this.camera);
      const dg = this.attractions.dartsGame;
      const hits = this.dartRaycaster.intersectObjects(dg.targets.map((t) => t.mesh), true);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const target = dg.targets.find((t) => t.mesh === hitObj || t.mesh.children.includes(hitObj));
        if (target && target.active) {
          this.throwDartAtTarget(target.index);
        }
      }
    });
  }

  start(gameId) {
    if (this.activeGame) return;
    this.activeGame = gameId;
    this.player.enabled = false;
    this.score = 0;

    if (gameId === 'whack') {
      this.timer = 30;
      this.whackSpawnTimer = 0.2;
      for (const h of this.attractions.whackGarden.holes) {
        h.up = false;
        h.mesh.position.y = -0.35;
      }
      this._renderWhackControls();
      this.ui.showMiniGameHud(
        '🔨 邦尼兔菜园打地鼠',
        '点击下方格子或按数字 [1-9] 敲击冒头的蔬菜与黄金茄子！',
        '⏱️ 30s',
        '⭐ 0 分'
      );
    } else if (gameId === 'claw') {
      this.timer = 999;
      this.clawX = 0;
      this.clawZ = 0;
      this.clawState = 'aim';
      this.clawHeight = 6.6;
      this.heldPrize = null;
      this._renderClawControls();
      this.ui.showMiniGameHud(
        '🧸 3D 奇幻抓娃娃机',
        '用摇杆/[WASD]/按钮移动机械爪对准金圈，按 [Space] 下爪抓取稀有玩偶！',
        '♾️ 畅玩',
        `🎁 已抓 ${this.score} 个`
      );
    } else if (gameId === 'bumper') {
      this.timer = 45;
      const arena = this.attractions.bumperArena;
      arena.active = true;
      for (let i = 0; i < arena.cars.length; i++) {
        const a = (i / arena.cars.length) * Math.PI * 2;
        arena.cars[i].mesh.position.set(Math.cos(a) * 7.2, 0.38, Math.sin(a) * 7.2);
        arena.cars[i].vel.set(0, 0, 0);
        arena.cars[i].heading = a + Math.PI;
      }
      this.ui.clearMiniGameControls();
      this.ui.showMiniGameHud(
        '🏎️ 霓虹弹珠碰碰车派对',
        '用摇杆/[WASD] 驾驶碰碰车，撞击 Jellycat 或中央 3 根霓虹弹珠柱！',
        '⏱️ 45s',
        '💥 0 分'
      );
    } else if (gameId === 'pastry') {
      this.timer = 35;
      this.pastrySpawnTimer = 0.3;
      const pg = this.attractions.pastryGame;
      pg.trayX = 0;
      pg.tray.position.x = 0;
      for (const it of pg.items) {
        it.active = false;
        it.mesh.visible = false;
      }
      this._renderPastryControls();
      this.ui.showMiniGameHud(
        '🥐 可颂大厨接甜点挑战',
        '用摇杆/[A/D]/按钮移动篮筐接住甜点与皇家金茄！躲开焦黑吐司！',
        '⏱️ 35s',
        '🥐 0 分'
      );
    } else if (gameId === 'darts') {
      this.timer = 35;
      const dg = this.attractions.dartsGame;
      for (const t of dg.targets) {
        t.active = true;
        t.mesh.visible = true;
      }
      for (const d of dg.activeDarts) dg.group.remove(d.mesh);
      dg.activeDarts = [];
      this._renderDartControls();
      this.ui.showMiniGameHud(
        '🎯 神射手霓虹飞镖摊',
        '直接点击/触屏画面上飘动的气球、或按 [Space / 1-9] 射出 3D 飞镖！',
        '⏱️ 35s',
        '🎯 0 分'
      );
    } else if (gameId === 'hoops') {
      this.timer = 35;
      this.hoopCombo = 0;
      this.hoopBallFlight = null;
      this.attractions.hoopsGame.ball.position.set(0, 1.4, 3.0);
      this._renderHoopsControls();
      this.ui.showMiniGameHud(
        '🏀 嘉年华超级投篮王',
        '看准能量条落入中央绿色黄金区时按 [Space] 或点击投篮按钮空心入网！',
        '⏱️ 35s',
        '🏀 0 分'
      );
    } else if (gameId === 'ringtoss') {
      this.timer = 35;
      this.ringAimX = 0;
      const rt = this.attractions.ringTossGame;
      for (const r of rt.activeRings) rt.group.remove(r.mesh);
      rt.activeRings = [];
      this._renderRingTossControls();
      this.ui.showMiniGameHud(
        '⭕ 嘉年华霓虹套圈圈大师',
        '用摇杆/[A/D]/按钮左右瞄准牛奶瓶与黄金茄，按 [Space] 抛出 3D 发光圆环！',
        '⏱️ 35s',
        '⭕ 0 分'
      );
    }
  }

  _renderWhackControls() {
    const pad = document.createElement('div');
    pad.className = 'whack-pad';
    this.whackButtons = [];
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement('button');
      btn.className = 'whack-cell';
      btn.textContent = `${i + 1}`;
      btn.addEventListener('click', () => this.whackHole(i));
      pad.appendChild(btn);
      this.whackButtons.push(btn);
    }
    this.ui.setMiniGameControls(pad);
  }

  _renderClawControls() {
    const wrap = document.createElement('div');
    wrap.className = 'ride-actions';
    const actions = [
      { label: '⬅️ 左移', fn: () => (this.clawX = Math.max(-2.1, this.clawX - 0.55)) },
      { label: '➡️ 右移', fn: () => (this.clawX = Math.min(2.1, this.clawX + 0.55)) },
      { label: '⬆️ 里移', fn: () => (this.clawZ = Math.max(-2.1, this.clawZ - 0.55)) },
      { label: '⬇️ 外移', fn: () => (this.clawZ = Math.min(2.1, this.clawZ + 0.55)) },
      { label: '⏬ 下爪抓取 [Space]', fn: () => this.dropClaw() },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'ride-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      wrap.appendChild(btn);
    }
    this.ui.setMiniGameControls(wrap);
  }

  _renderPastryControls() {
    const wrap = document.createElement('div');
    wrap.className = 'ride-actions';
    const actions = [
      { label: '⬅️ 向左接 [A]', fn: () => (this.attractions.pastryGame.trayX = Math.max(-2.8, this.attractions.pastryGame.trayX - 0.85)) },
      { label: '➡️ 向右接 [D]', fn: () => (this.attractions.pastryGame.trayX = Math.min(2.8, this.attractions.pastryGame.trayX + 0.85)) },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'ride-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      wrap.appendChild(btn);
    }
    this.ui.setMiniGameControls(wrap);
  }

  _renderDartControls() {
    const wrap = document.createElement('div');
    wrap.className = 'ride-actions';
    const btnAuto = document.createElement('button');
    btnAuto.className = 'ride-btn';
    btnAuto.textContent = '🎯 发射飞镖 [Space]';
    btnAuto.addEventListener('click', () => this.throwDartAtNearest());
    wrap.appendChild(btnAuto);

    for (let i = 0; i < 6; i++) {
      const btn = document.createElement('button');
      btn.className = 'ride-btn';
      btn.textContent = i === 5 ? '👑 金茄号' : `🎈 #${i + 1}`;
      btn.addEventListener('click', () => this.throwDartAtTarget(i === 5 ? 5 : i));
      wrap.appendChild(btn);
    }
    this.ui.setMiniGameControls(wrap);
  }

  _renderHoopsControls() {
    const wrap = document.createElement('div');
    wrap.className = 'hoops-controls';
    const meterWrap = document.createElement('div');
    meterWrap.className = 'hoops-meter';
    const sweet = document.createElement('div');
    sweet.className = 'hoops-sweet';
    const needle = document.createElement('div');
    needle.className = 'hoops-needle';
    meterWrap.append(sweet, needle);
    this.hoopGaugeBar = needle;

    const btn = document.createElement('button');
    btn.className = 'ride-btn';
    btn.textContent = '🏀 立即出手投篮！[Space]';
    btn.addEventListener('click', () => this.shootBasketball());

    wrap.append(meterWrap, btn);
    this.ui.setMiniGameControls(wrap);
  }

  _renderRingTossControls() {
    const wrap = document.createElement('div');
    wrap.className = 'ride-actions';
    const actions = [
      { label: '⬅️ 左瞄准 [A]', fn: () => (this.ringAimX = Math.max(-2.7, this.ringAimX - 0.65)) },
      { label: '⭕ 抛圈！[Space]', fn: () => this.tossRing() },
      { label: '➡️ 右瞄准 [D]', fn: () => (this.ringAimX = Math.min(2.7, this.ringAimX + 0.65)) },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'ride-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      wrap.appendChild(btn);
    }
    this.ui.setMiniGameControls(wrap);
  }

  shootBasketball() {
    if (this.activeGame !== 'hoops' || this.hoopBallFlight) return;
    const hg = this.attractions.hoopsGame;
    const accuracy = Math.abs(this.hoopPower - 0.5);
    const made = accuracy <= 0.17;
    const targetX = hg.hoopAssembly.position.x + (made ? 0 : (this.hoopPower - 0.5) * 2.8);
    this.hoopBallFlight = {
      t: 0,
      start: new THREE.Vector3(0, 1.4, 3.0),
      target: new THREE.Vector3(targetX, made ? 3.25 : 3.7, 0.48),
      made,
    };
    this.audio?.playSfx('squeak', 0.45);
  }

  tossRing() {
    if (this.activeGame !== 'ringtoss' || this.ringCooldown > 0) return;
    this.ringCooldown = 0.35;
    const rt = this.attractions.ringTossGame;
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.06, 10, 24),
      new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.2 })
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(this.ringAimX, 2.0, 2.6);
    rt.group.add(ringMesh);
    this.audio?.playSfx('squeak', 0.4);

    // Pick closest peg horizontally + slightly randomized depth
    const targetZ = Math.random() < 0.5 ? -0.85 : 0.25;
    rt.activeRings.push({
      mesh: ringMesh,
      start: new THREE.Vector3(this.ringAimX, 2.0, 2.6),
      end: new THREE.Vector3(this.ringAimX, 1.28, targetZ),
      t: 0,
      landed: false,
      life: 2.2,
    });
  }

  throwDartAtNearest() {
    if (this.activeGame !== 'darts') return;
    const dg = this.attractions.dartsGame;
    const gold = dg.targets.find((t) => t.active && t.points >= 30);
    const any = gold || dg.targets.find((t) => t.active);
    if (any) this.throwDartAtTarget(any.index);
  }

  throwDartAtTarget(idx) {
    if (this.activeGame !== 'darts' || this.dartCooldown > 0) return;
    const dg = this.attractions.dartsGame;
    const target = dg.targets[idx];
    if (!target || !target.active) return;

    this.dartCooldown = 0.22;
    const dart = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: '#ffd56b', emissive: '#ffaa00', emissiveIntensity: 0.4 })
    );
    dart.rotation.x = -Math.PI / 2;
    dart.position.set(0, 1.35, 2.2);
    dg.group.add(dart);
    this.audio?.playSfx('squeak', 0.4);

    dg.activeDarts.push({
      mesh: dart,
      start: new THREE.Vector3(0, 1.35, 2.2),
      target,
      t: 0,
    });
  }

  whackHole(idx) {
    if (this.activeGame !== 'whack') return;
    const h = this.attractions.whackGarden.holes[idx];
    if (!h || !h.up) return;

    h.up = false;
    h.mesh.position.y = -0.35;
    if (this.whackButtons[idx]) this.whackButtons[idx].classList.remove('active');
    const pts = h.isGold ? 25 : 10;
    this.score += pts;
    this.audio?.playSfx('whack', 0.6);
    this.ui.addCoins(h.isGold ? 5 : 2);
    this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `⭐ ${this.score} 分`);
    if (h.isGold) this.ui.toast('🍆 敲中黄金茄子！+25 分 & +5 茄币');
  }

  dropClaw() {
    if (this.activeGame !== 'claw' || this.clawState !== 'aim') return;
    this.clawState = 'down';
    this.audio?.playSfx('squeak', 0.45);
  }

  dashBumper() {
    if (this.activeGame !== 'bumper' || this.bumperDashCooldown > 0) return;
    const car = this.attractions.bumperArena.cars[0];
    car.vel.x += Math.sin(car.heading) * 16;
    car.vel.z += Math.cos(car.heading) * 16;
    this.bumperDashCooldown = 1.6;
    this.audio?.playSfx('squeak', 0.5);
  }

  exit(completed = false) {
    if (!this.activeGame) return;
    const g = this.activeGame;
    if (g === 'bumper') this.attractions.bumperArena.active = false;
    if (g === 'pastry') {
      for (const it of this.attractions.pastryGame.items) {
        it.active = false;
        it.mesh.visible = false;
      }
    }
    if (g === 'darts') {
      const dg = this.attractions.dartsGame;
      for (const d of dg.activeDarts) dg.group.remove(d.mesh);
      dg.activeDarts = [];
    }
    if (g === 'ringtoss') {
      const rt = this.attractions.ringTossGame;
      for (const r of rt.activeRings) rt.group.remove(r.mesh);
      rt.activeRings = [];
    }

    if (completed && ['whack', 'bumper', 'pastry', 'darts', 'hoops', 'ringtoss'].includes(g)) {
      const reward = Math.max(10, Math.round(Math.max(0, this.score) * 0.4));
      this.ui.addCoins(reward);
      this.audio?.playSfx('coin', 0.65);
      this.ui.toast(`🏆 游玩结束！总得分 ${this.score}，获得 +${reward} 开心茄币！`);
    }

    const pad = this.attractions.interactables.find((i) => i.id === g);
    if (pad) this.player.teleportTo(pad.pos);
    this.activeGame = null;
    this.player.enabled = true;
    this.ui.hideMiniGameHud();
  }

  update(dt, elapsed) {
    if (!this.activeGame) return;
    const keys = this.player.keys;
    const stick = this.player.touchStick || { x: 0, y: 0 };

    if (this.activeGame === 'whack') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);
      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `⭐ ${this.score} 分`);

      const wg = this.attractions.whackGarden;
      this.whackSpawnTimer -= dt;
      if (this.whackSpawnTimer <= 0) {
        this.whackSpawnTimer = 0.65;
        const candidates = wg.holes.filter((h) => !h.up);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          pick.up = true;
          pick.isGold = pick.index === 8 || Math.random() < 0.25;
          pick.timer = 1.45;
          this.whackButtons[pick.index]?.classList.add('active');
        }
      }

      for (const h of wg.holes) {
        if (h.up) {
          h.timer -= dt;
          h.mesh.position.y = THREE.MathUtils.lerp(h.mesh.position.y, 1.05, dt * 14);
          if (h.timer <= 0) {
            h.up = false;
            this.whackButtons[h.index]?.classList.remove('active');
          }
        } else {
          h.mesh.position.y = THREE.MathUtils.lerp(h.mesh.position.y, -0.35, dt * 12);
        }
      }

      const c = wg.center;
      this.camera.position.lerp(new THREE.Vector3(c.x + 8.5, 9.2, c.z + 8.5), Math.min(1, dt * 6));
      this.camera.lookAt(c.x, 1.0, c.z);
    } else if (this.activeGame === 'claw') {
      const cm = this.attractions.clawMachine;
      if (this.clawState === 'aim') {
        const spd = 2.6;
        const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
        const mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + stick.y;
        this.clawZ = THREE.MathUtils.clamp(this.clawZ - mx * spd * dt, -2.1, 2.1);
        this.clawX = THREE.MathUtils.clamp(this.clawX + mz * spd * dt, -2.1, 2.1);
      } else if (this.clawState === 'down') {
        this.clawHeight -= 4.2 * dt;
        if (this.clawHeight <= 3.1) {
          this.clawHeight = 3.1;
          this.clawState = 'up';
          let closest = null;
          let minD = 0.98;
          for (const p of cm.prizes) {
            if (p.grabbed) continue;
            const d = Math.hypot(p.mesh.position.x - this.clawX, p.mesh.position.z - this.clawZ);
            if (d < minD) {
              minD = d;
              closest = p;
            }
          }
          if (closest) {
            closest.grabbed = true;
            this.heldPrize = closest;
            this.audio?.playSfx('coin', 0.6);
          }
        }
      } else if (this.clawState === 'up') {
        this.clawHeight += 3.6 * dt;
        if (this.heldPrize) this.heldPrize.mesh.position.set(this.clawX, this.clawHeight - 1.75, this.clawZ);
        if (this.clawHeight >= 6.6) {
          this.clawHeight = 6.6;
          this.clawState = 'aim';
          if (this.heldPrize) {
            const p = this.heldPrize;
            this.heldPrize = null;
            this.score++;
            this.ui.addCoins(50);
            this.ui.unlockDex(p.id);
            this.ui.toast(`🧸 抓中稀有 Jellycat！解锁图鉴并获得 +50 茄币！`);
            this.ui.updateMiniGameStats('♾️ 畅玩', `🎁 已抓 ${this.score} 个`);
            setTimeout(() => {
              p.mesh.position.copy(p.basePos);
              p.grabbed = false;
            }, 2500);
          } else {
            this.ui.toast('差一点点！再微调下金圈位置吧～');
          }
        }
      }

      cm.clawPivot.position.set(this.clawX, this.clawHeight, this.clawZ);
      cm.aimRing.position.set(this.clawX, 2.04, this.clawZ);

      const c = cm.center;
      this.camera.position.lerp(new THREE.Vector3(c.x + 8.6, 5.4, c.z), Math.min(1, dt * 6));
      this.camera.lookAt(c.x, 3.6, c.z);
    } else if (this.activeGame === 'bumper') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);
      if (this.bumperDashCooldown > 0) this.bumperDashCooldown -= dt;
      if (this.bumperHitCooldown > 0) this.bumperHitCooldown -= dt;

      const arena = this.attractions.bumperArena;
      const pCar = arena.cars[0];
      const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - stick.x;
      pCar.heading += steer * 3.2 * dt;
      let accel = -stick.y * 18;
      if (keys.has('KeyW') || keys.has('ArrowUp')) accel = 18;
      if (keys.has('KeyS') || keys.has('ArrowDown')) accel = -12;
      pCar.vel.x += Math.sin(pCar.heading) * accel * dt;
      pCar.vel.z += Math.cos(pCar.heading) * accel * dt;

      for (let i = 0; i < arena.cars.length; i++) {
        const car = arena.cars[i];
        if (!car.isPlayer) {
          car.heading += Math.sin(elapsed * 1.3 + i * 2.1) * 1.4 * dt;
          car.vel.x += Math.sin(car.heading) * 11 * dt;
          car.vel.z += Math.cos(car.heading) * 11 * dt;
        }
        car.vel.multiplyScalar(0.96);
        car.mesh.position.x += car.vel.x * dt;
        car.mesh.position.z += car.vel.z * dt;
        car.mesh.rotation.y = car.heading;

        const dist = Math.hypot(car.mesh.position.x, car.mesh.position.z);
        if (dist > arena.radius) {
          const nx = car.mesh.position.x / dist;
          const nz = car.mesh.position.z / dist;
          car.mesh.position.x = nx * arena.radius;
          car.mesh.position.z = nz * arena.radius;
          const dot = car.vel.x * nx + car.vel.z * nz;
          if (dot > 0) {
            car.vel.x -= 1.8 * dot * nx;
            car.vel.z -= 1.8 * dot * nz;
          }
          if (!car.isPlayer) car.heading += Math.PI * 0.65;
        }

        for (const bp of arena.bouncePosts) {
          const dx = car.mesh.position.x - bp.x;
          const dz = car.mesh.position.z - bp.z;
          const bd = Math.hypot(dx, dz);
          const minR = bp.radius + 1.15;
          if (bd < minR && bd > 0.001) {
            const nx = dx / bd;
            const nz = dz / bd;
            car.mesh.position.x = bp.x + nx * minR;
            car.mesh.position.z = bp.z + nz * minR;
            car.vel.x = nx * 17;
            car.vel.z = nz * 17;
            bp.pulse = 1.0;
            if (car.isPlayer && this.bumperHitCooldown <= 0) {
              this.bumperHitCooldown = 0.35;
              this.score += 15;
              this.audio?.playSfx('bumper', 0.65);
            }
          }
        }
      }

      for (let i = 0; i < arena.cars.length; i++) {
        for (let j = i + 1; j < arena.cars.length; j++) {
          const a = arena.cars[i];
          const b = arena.cars[j];
          const dx = b.mesh.position.x - a.mesh.position.x;
          const dz = b.mesh.position.z - a.mesh.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.4 && d > 0.001) {
            const nx = dx / d;
            const nz = dz / d;
            const overlap = 2.4 - d;
            a.mesh.position.x -= nx * overlap * 0.5;
            a.mesh.position.z -= nz * overlap * 0.5;
            b.mesh.position.x += nx * overlap * 0.5;
            b.mesh.position.z += nz * overlap * 0.5;
            a.vel.x -= nx * 12;
            a.vel.z -= nz * 12;
            b.vel.x += nx * 12;
            b.vel.z += nz * 12;

            if ((a.isPlayer || b.isPlayer) && this.bumperHitCooldown <= 0) {
              this.bumperHitCooldown = 0.35;
              this.score += 10;
              this.audio?.playSfx('bumper', 0.65);
            }
          }
        }
      }

      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `💥 ${this.score} 分`);
      const worldP = new THREE.Vector3();
      pCar.mesh.getWorldPosition(worldP);
      const center = arena.center;
      this.camera.position.lerp(new THREE.Vector3(center.x, 16, center.z + 18), Math.min(1, dt * 5));
      this.camera.lookAt(worldP);
    } else if (this.activeGame === 'pastry') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);

      const pg = this.attractions.pastryGame;
      const moveSpd = 5.4;
      const dir = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
      pg.trayX = THREE.MathUtils.clamp(pg.trayX + dir * moveSpd * dt, -2.8, 2.8);
      pg.tray.position.x = THREE.MathUtils.lerp(pg.tray.position.x, pg.trayX, dt * 15);
      pg.chef.position.x = Math.sin(elapsed * 2.2) * 2.2;
      pg.chef.rotation.y = Math.sin(elapsed * 4.4) * 0.3;

      this.pastrySpawnTimer -= dt;
      if (this.pastrySpawnTimer <= 0) {
        this.pastrySpawnTimer = 0.62;
        const free = pg.items.find((it) => !it.active);
        if (free) {
          free.active = true;
          free.mesh.visible = true;
          free.mesh.position.set(pg.chef.position.x + (Math.random() - 0.5) * 2.2, 4.4, 1.8);
          free.vy = -2.2 - Math.random() * 1.4;
        }
      }

      for (const it of pg.items) {
        if (!it.active) continue;
        it.vy -= 5.2 * dt;
        it.mesh.position.y += it.vy * dt;
        it.mesh.rotation.y += dt * 3.0;

        if (it.mesh.position.y <= 1.05 && Math.abs(it.mesh.position.x - pg.tray.position.x) < 1.35) {
          it.active = false;
          it.mesh.visible = false;
          this.score += it.points;
          if (it.points > 0) {
            this.audio?.playSfx('coin', 0.5);
            this.ui.addCoins(it.points >= 30 ? 8 : 3);
            if (it.points >= 30) this.ui.toast('👑 接住黄金皇家茄子！+35 分 & +8 茄币');
          } else {
            this.audio?.playSfx('whack', 0.45);
            this.ui.toast('🖤 哇呀！接到烤焦黑吐司 -15 分');
          }
        } else if (it.mesh.position.y < 0.1) {
          it.active = false;
          it.mesh.visible = false;
        }
      }

      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `🥐 ${this.score} 分`);
      const frontOffset = new THREE.Vector3(0, 4.4, 9.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), pg.rotY);
      this.camera.position.lerp(pg.center.clone().add(frontOffset), Math.min(1, dt * 6));
      this.camera.lookAt(pg.center.x, 2.3, pg.center.z);
    } else if (this.activeGame === 'darts') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);
      if (this.dartCooldown > 0) this.dartCooldown -= dt;

      const dg = this.attractions.dartsGame;
      for (const t of dg.targets) {
        if (t.active) {
          t.mesh.position.x = t.baseX + Math.sin(elapsed * t.speed + t.phase) * 0.9;
          t.mesh.position.y = t.baseY + Math.cos(elapsed * 2.1 + t.phase) * 0.14;
        } else {
          t.respawn -= dt;
          if (t.respawn <= 0) {
            t.active = true;
            t.mesh.visible = true;
          }
        }
      }

      for (let i = dg.activeDarts.length - 1; i >= 0; i--) {
        const d = dg.activeDarts[i];
        d.t += dt * 4.5;
        const targetPos = d.target.mesh.position.clone();
        d.mesh.position.lerpVectors(d.start, targetPos, Math.min(1, d.t));
        d.mesh.position.y += Math.sin(Math.min(1, d.t) * Math.PI) * 0.35;
        d.mesh.lookAt(targetPos);
        if (d.t >= 1) {
          if (d.target.active) {
            d.target.active = false;
            d.target.respawn = 3.2;
            d.target.mesh.visible = false;
            this.score += d.target.points;
            this.ui.addCoins(d.target.points >= 30 ? 7 : 3);
            this.audio?.playSfx('coin', 0.5);
            if (d.target.points >= 30) this.ui.toast('🎯 神射命中黄金茄靶！+30 分 & +7 茄币');
          }
          dg.group.remove(d.mesh);
          dg.activeDarts.splice(i, 1);
        }
      }

      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `🎯 ${this.score} 分`);
      const frontOffset = new THREE.Vector3(0, 3.5, 7.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), dg.rotY);
      this.camera.position.lerp(dg.center.clone().add(frontOffset), Math.min(1, dt * 6));
      this.camera.lookAt(dg.center.x, 2.5, dg.center.z);
    } else if (this.activeGame === 'hoops') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);

      const hg = this.attractions.hoopsGame;
      hg.hoopAssembly.position.x = Math.sin(elapsed * 1.9) * 1.65;
      this.hoopPower = 0.5 + Math.sin(elapsed * 3.4) * 0.48;
      if (hg.powerNeedle3D) {
        hg.powerNeedle3D.position.x = (this.hoopPower - 0.5) * 2.4;
      }
      if (this.hoopGaugeBar) {
        this.hoopGaugeBar.style.transform = `translate3d(${(this.hoopPower * 220 - 4).toFixed(1)}px, 0, 0)`;
      }

      if (this.hoopBallFlight) {
        const fl = this.hoopBallFlight;
        fl.t += dt * 2.1;
        const k = Math.min(1, fl.t);
        hg.ball.position.lerpVectors(fl.start, fl.target, k);
        hg.ball.position.y += Math.sin(k * Math.PI) * 2.8;
        hg.ball.rotation.x -= dt * 8;
        if (fl.t >= 1) {
          if (fl.made) {
            this.hoopCombo++;
            const pts = 20 + Math.min(30, this.hoopCombo * 5);
            this.score += pts;
            this.ui.addCoins(5);
            this.audio?.playSfx('coin', 0.55);
            this.ui.toast(`🏀 空心入网！${this.hoopCombo} 连击 +${pts} 分`);
          } else {
            this.hoopCombo = 0;
            this.audio?.playSfx('whack', 0.35);
          }
          hg.ball.position.set(0, 1.4, 3.0);
          this.hoopBallFlight = null;
        }
      }

      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `🏀 ${this.score} 分`);
      const frontOffset = new THREE.Vector3(0, 3.8, 8.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), hg.rotY);
      this.camera.position.lerp(hg.center.clone().add(frontOffset), Math.min(1, dt * 6));
      this.camera.lookAt(hg.center.x, 2.8, hg.center.z);
    } else if (this.activeGame === 'ringtoss') {
      this.timer -= dt;
      if (this.timer <= 0) return this.exit(true);
      if (this.ringCooldown > 0) this.ringCooldown -= dt;

      const rt = this.attractions.ringTossGame;
      const aimDir = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
      this.ringAimX = THREE.MathUtils.clamp(this.ringAimX + aimDir * 4.5 * dt, -2.7, 2.7);
      rt.aimRing.position.x = THREE.MathUtils.lerp(rt.aimRing.position.x, this.ringAimX, dt * 14);

      for (let i = rt.activeRings.length - 1; i >= 0; i--) {
        const r = rt.activeRings[i];
        if (!r.landed) {
          r.t += dt * 2.4;
          const k = Math.min(1, r.t);
          r.mesh.position.lerpVectors(r.start, r.end, k);
          r.mesh.position.y += Math.sin(k * Math.PI) * 1.9;
          if (r.t >= 1) {
            r.landed = true;
            const hitPeg = rt.pegs.find((p) => Math.hypot(p.x - r.end.x, p.z - r.end.z) < 0.72);
            if (hitPeg) {
              this.score += hitPeg.points;
              this.ui.addCoins(hitPeg.isGold ? 10 : 4);
              this.audio?.playSfx('coin', 0.55);
              if (hitPeg.isGold) this.ui.toast('👑 套中黄金茄子大奖！+40 分 & +10 茄币！');
            }
          }
        } else {
          r.life -= dt;
          if (r.life <= 0) {
            rt.group.remove(r.mesh);
            rt.activeRings.splice(i, 1);
          }
        }
      }

      this.ui.updateMiniGameStats(`⏱️ ${Math.ceil(this.timer)}s`, `⭕ ${this.score} 分`);
      this.camera.position.lerp(new THREE.Vector3(rt.center.x, 4.4, rt.center.z + 7.2), Math.min(1, dt * 6));
      this.camera.lookAt(rt.center.x, 1.5, rt.center.z);
    }
  }
}

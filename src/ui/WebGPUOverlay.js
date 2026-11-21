import * as THREE from 'three';

/**
 * Hardware-rendered WebGPU screen-space HUD overlay attached directly to the camera.
 * Renders the virtual touch joystick (ring + moving 3D knob), touch action buttons
 * (Jump/Boost, Interact, Camera View, Cheer), and floating interaction prompt banner
 * inside the single WebGPU render pass — eliminating DOM style/layout/paint thrashing
 * over the 3D canvas when rotating the camera or dragging controls on iPad & desktop.
 */
export class WebGPUOverlay {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'webgpu_hud_overlay';
    // Sit at z = -0.45 in camera space (camera.near = 0.2)
    this.hudDepth = 0.45;
    this.root.position.set(0, 0, -this.hudDepth);
    this.camera.add(this.root);

    this.visible = false;
    this.touchVisible = false;
    this.interactVisible = false;
    this.root.visible = false;

    this.stickX = 0;
    this.stickY = 0;
    this.interactReady = false;
    this.interactShortLabel = 'E 互动';

    this._buildJoystickMeshes();
    this._buildActionButtons();
    this._buildInteractBanner();
    this.updateLayout();
  }

  _makeHudMaterial(texture) {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }

  _configHudMesh(mesh, order = 9990) {
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  _buildJoystickMeshes() {
    // 1. Outer joystick ring texture (baked once to GPU)
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 256;
    ringCanvas.height = 256;
    const rctx = ringCanvas.getContext('2d');
    const grad = rctx.createRadialGradient(128, 128, 28, 128, 128, 118);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(0.7, 'rgba(84, 42, 116, 0.36)');
    grad.addColorStop(1, 'rgba(54, 24, 82, 0.58)');
    rctx.fillStyle = grad;
    rctx.beginPath();
    rctx.arc(128, 128, 116, 0, Math.PI * 2);
    rctx.fill();
    rctx.lineWidth = 7;
    rctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    rctx.stroke();

    // Directional chevrons
    rctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    rctx.font = 'bold 20px sans-serif';
    rctx.textAlign = 'center';
    rctx.textBaseline = 'middle';
    rctx.fillText('▲', 128, 30);
    rctx.fillText('▼', 128, 226);
    rctx.fillText('◀', 30, 128);
    rctx.fillText('▶', 226, 128);

    const ringTex = new THREE.CanvasTexture(ringCanvas);
    ringTex.colorSpace = THREE.SRGBColorSpace;
    this.joyBaseMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(ringTex)),
      9990
    );

    // 2. Inner movable plush purple knob texture (baked once to GPU)
    const knobCanvas = document.createElement('canvas');
    knobCanvas.width = 128;
    knobCanvas.height = 128;
    const kctx = knobCanvas.getContext('2d');
    const kgrad = kctx.createRadialGradient(48, 44, 6, 64, 64, 56);
    kgrad.addColorStop(0, '#ffffff');
    kgrad.addColorStop(0.45, '#d8b4fe');
    kgrad.addColorStop(1, '#6b21a8');
    kctx.fillStyle = kgrad;
    kctx.beginPath();
    kctx.arc(64, 64, 54, 0, Math.PI * 2);
    kctx.fill();
    kctx.lineWidth = 5;
    kctx.strokeStyle = '#ffffff';
    kctx.stroke();

    const knobTex = new THREE.CanvasTexture(knobCanvas);
    knobTex.colorSpace = THREE.SRGBColorSpace;
    this.joyKnobMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(knobTex)),
      9992
    );

    this.touchGroup = new THREE.Group();
    this.touchGroup.add(this.joyBaseMesh, this.joyKnobMesh);
    this.root.add(this.touchGroup);
  }

  _drawButtonTexture(canvas, label, bgTop, bgBot, isCircle = true) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bgBot);
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';

    if (isCircle) {
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.lineWidth = 5;
      const r = h / 2 - 4;
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, r);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = isCircle ? 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif' : 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 1);
  }

  _buildActionButtons() {
    // Jump button (circle)
    const jumpCanvas = document.createElement('canvas');
    jumpCanvas.width = 160;
    jumpCanvas.height = 160;
    this._drawButtonTexture(jumpCanvas, '⬆️ 跳/冲', '#a855f7', '#ec4899', true);
    const jumpTex = new THREE.CanvasTexture(jumpCanvas);
    jumpTex.colorSpace = THREE.SRGBColorSpace;
    this.btnJumpMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(jumpTex)),
      9991
    );

    // Interact button (circle, updates texture only when active/label changes)
    this.interactBtnCanvas = document.createElement('canvas');
    this.interactBtnCanvas.width = 160;
    this.interactBtnCanvas.height = 160;
    this._drawButtonTexture(this.interactBtnCanvas, 'E 互动', 'rgba(74, 38, 102, 0.86)', 'rgba(48, 22, 70, 0.92)', true);
    this.interactBtnTex = new THREE.CanvasTexture(this.interactBtnCanvas);
    this.interactBtnTex.colorSpace = THREE.SRGBColorSpace;
    this.btnInteractMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(this.interactBtnTex)),
      9991
    );

    // Mini pill: Camera View
    const viewCanvas = document.createElement('canvas');
    viewCanvas.width = 160;
    viewCanvas.height = 88;
    this._drawButtonTexture(viewCanvas, '📷 视角', 'rgba(67, 34, 92, 0.85)', 'rgba(45, 22, 66, 0.92)', false);
    const viewTex = new THREE.CanvasTexture(viewCanvas);
    viewTex.colorSpace = THREE.SRGBColorSpace;
    this.btnViewMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(viewTex)),
      9991
    );

    // Mini pill: Cheer
    const cheerCanvas = document.createElement('canvas');
    cheerCanvas.width = 160;
    cheerCanvas.height = 88;
    this._drawButtonTexture(cheerCanvas, '🙌 欢呼', 'rgba(67, 34, 92, 0.85)', 'rgba(45, 22, 66, 0.92)', false);
    const cheerTex = new THREE.CanvasTexture(cheerCanvas);
    cheerTex.colorSpace = THREE.SRGBColorSpace;
    this.btnCheerMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(cheerTex)),
      9991
    );

    this.touchGroup.add(this.btnJumpMesh, this.btnInteractMesh, this.btnViewMesh, this.btnCheerMesh);
  }

  _buildInteractBanner() {
    this.bannerCanvas = document.createElement('canvas');
    this.bannerCanvas.width = 512;
    this.bannerCanvas.height = 88;
    this.bannerTex = new THREE.CanvasTexture(this.bannerCanvas);
    this.bannerTex.colorSpace = THREE.SRGBColorSpace;

    this.bannerMesh = this._configHudMesh(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._makeHudMaterial(this.bannerTex)),
      9993
    );
    this.bannerMesh.visible = false;
    this.root.add(this.bannerMesh);
  }

  setHudVisible(v) {
    this.visible = v;
    this.root.visible = v;
    this.updateLayout();
  }

  setTouchControlsVisible(v) {
    if (this.touchVisible === v) return;
    this.touchVisible = v;
    this.touchGroup.visible = v;
  }

  /**
   * Moves the virtual joystick knob purely in WebGPU uniform space (zero DOM mutation!).
   */
  setJoystickState(normX, normY) {
    this.stickX = normX;
    this.stickY = normY;
    if (!this.joyBaseMesh || !this.joyKnobMesh) return;
    const maxOffset = this._joyRadiusWorld || 0.04;
    this.joyKnobMesh.position.x = this.joyBaseMesh.position.x + normX * maxOffset;
    this.joyKnobMesh.position.y = this.joyBaseMesh.position.y - normY * maxOffset;
  }

  /**
   * Updates the hardware-rendered touch interact button only when state/label changes.
   */
  setTouchInteractState(active, label = '互动') {
    const text = active ? `✨ ${label}` : 'E 互动';
    if (this.interactReady === active && this.interactShortLabel === text) return;
    this.interactReady = active;
    this.interactShortLabel = text;
    if (active) {
      this._drawButtonTexture(this.interactBtnCanvas, text, '#f59e0b', '#ea580c', true);
    } else {
      this._drawButtonTexture(
        this.interactBtnCanvas,
        text,
        'rgba(74, 38, 102, 0.86)',
        'rgba(48, 22, 70, 0.92)',
        true
      );
    }
    this.interactBtnTex.needsUpdate = true;
    const baseS = this._circleBtnWorld || 0.06;
    this.btnInteractMesh.scale.setScalar(active ? baseS * 1.07 : baseS);
  }

  /**
   * Updates or hides the hardware-rendered bottom-center interaction prompt banner.
   */
  setInteractBanner(visible, key = 'E', text = '') {
    if (!visible) {
      if (this.interactVisible) {
        this.interactVisible = false;
        this.bannerMesh.visible = false;
      }
      return;
    }

    const sig = `${key}|${text}`;
    if (!this.interactVisible) {
      this.interactVisible = true;
      this.bannerMesh.visible = true;
    }
    if (this._lastBannerSig === sig) return;
    this._lastBannerSig = sig;

    const c = this.bannerCanvas;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);

    // Pill background
    ctx.fillStyle = 'rgba(255, 250, 245, 0.95)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, (h - 12) / 2);
    ctx.fill();
    ctx.stroke();

    // Key badge
    ctx.fillStyle = '#43225c';
    ctx.beginPath();
    ctx.roundRect(22, 18, 56, h - 36, 14);
    ctx.fill();

    ctx.fillStyle = '#ffcf5c';
    ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, 50, h / 2 + 1);

    // Prompt text
    ctx.fillStyle = '#331c47';
    ctx.font = 'bold 25px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text.slice(0, 16), 92, h / 2 + 1);

    this.bannerTex.needsUpdate = true;
  }

  /**
   * Maps screen pixel positions of the touch controls & prompt banner to camera-local planes
   * so the WebGPU hardware meshes align 1:1 with the invisible touch hit zones on any screen size/FOV.
   */
  updateLayout() {
    if (typeof window === 'undefined') return;
    const sw = Math.max(1, window.innerWidth);
    const sh = Math.max(1, window.innerHeight);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const visH = 2 * this.hudDepth * Math.tan(fovRad / 2);
    const visW = visH * (sw / sh);

    const pxToWorldX = (px) => (px / sw - 0.5) * visW;
    const pxToWorldY = (py) => (0.5 - py / sh) * visH;
    const pxToWorldSize = (px) => (px / sh) * visH;

    // 1. Left Joystick (matches CSS: left 22px, bottom 24px, 132x132px)
    const joyDiam = pxToWorldSize(132);
    const knobDiam = pxToWorldSize(56);
    this._joyRadiusWorld = pxToWorldSize(46);
    const joyCx = pxToWorldX(22 + 66);
    const joyCy = pxToWorldY(sh - 24 - 66);

    this.joyBaseMesh.scale.set(joyDiam, joyDiam, 1);
    this.joyBaseMesh.position.set(joyCx, joyCy, 0);

    this.joyKnobMesh.scale.set(knobDiam, knobDiam, 1);
    this.joyKnobMesh.position.set(
      joyCx + this.stickX * this._joyRadiusWorld,
      joyCy - this.stickY * this._joyRadiusWorld,
      0.001
    );

    // 2. Right Action Buttons (matches CSS: right 22px, bottom 24px)
    const circleSize = pxToWorldSize(78);
    this._circleBtnWorld = circleSize;
    const jumpCx = pxToWorldX(sw - 22 - 39);
    const jumpCy = pxToWorldY(sh - 24 - 39);
    const interactCx = pxToWorldX(sw - 22 - 78 - 12 - 39);
    const interactCy = jumpCy;

    this.btnJumpMesh.scale.set(circleSize, circleSize, 1);
    this.btnJumpMesh.position.set(jumpCx, jumpCy, 0);

    this.btnInteractMesh.scale.setScalar(this.interactReady ? circleSize * 1.07 : circleSize);
    this.btnInteractMesh.position.set(interactCx, interactCy, 0);

    // Top row mini buttons (68x44px)
    const miniW = pxToWorldSize(74);
    const miniH = pxToWorldSize(42);
    const miniY = pxToWorldY(sh - 24 - 78 - 12 - 22);
    const cheerCx = pxToWorldX(sw - 22 - 37);
    const viewCx = pxToWorldX(sw - 22 - 74 - 12 - 37);

    this.btnCheerMesh.scale.set(miniW, miniH, 1);
    this.btnCheerMesh.position.set(cheerCx, miniY, 0);

    this.btnViewMesh.scale.set(miniW, miniH, 1);
    this.btnViewMesh.position.set(viewCx, miniY, 0);

    // 3. Bottom-center Interact Prompt Banner (310x52px at bottom 92px)
    const bannerW = pxToWorldSize(320);
    const bannerH = pxToWorldSize(55);
    const bannerY = pxToWorldY(sh - 92 - 27);
    this.bannerMesh.scale.set(bannerW, bannerH, 1);
    this.bannerMesh.position.set(0, bannerY, 0.002);
    this._baseBannerY = bannerY;
  }

  update(elapsed) {
    if (!this.visible) return;
    // If camera FOV changed (e.g. coaster boost), keep HUD scale locked to screen pixels
    if (this._lastFov !== this.camera.fov) {
      this._lastFov = this.camera.fov;
      this.updateLayout();
    }
    if (this.interactVisible && this._baseBannerY !== undefined) {
      this.bannerMesh.position.y = this._baseBannerY + Math.sin(elapsed * 4.0) * 0.0025;
    }
  }
}

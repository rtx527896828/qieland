import * as THREE from 'three';
import {
  animateJellycatRig,
  createJellycatCharacter,
  loadComfyGLB,
} from '../world/CharacterFactory.js';

const GLB_COSTUMES = {
  comfy_standard_glb: '/assets/models/aubergine_standard.glb',
  comfy_giant_glb: '/assets/models/aubergine_giant.glb',
  comfy_charm_glb: '/assets/models/aubergine_charm.glb',
};

export class PlayerController {
  constructor(scene, camera, domElement, audioManager, layout) {
    this.scene = scene;
    this.camera = camera;
    this.dom = domElement;
    this.audio = audioManager;
    this.layout = layout;

    this.root = new THREE.Group();
    this.root.position.set(0, 0.08, 12);
    this.scene.add(this.root);

    this.costumeId = 'aubergine_charm';
    this.mesh = createJellycatCharacter(this.costumeId);
    this.root.add(this.mesh);
    this.glbCache = new Map();

    this.velY = 0;
    this.onGround = true;
    this.isCheering = false;
    this.cheerTimer = 0;
    this.enabled = true;

    this.camYaw = 0;
    this.camPitch = 0.34;
    this.camDist = 9.0;
    this.dragging = false;
    this.lastMouse = { x: 0, y: 0 };

    this.keys = new Set();
    this.touchStick = { x: 0, y: 0 };
    this._bindInputs();
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
        if (this.enabled && e.code === 'Space') {
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          if (this.onGround) {
            this.velY = 9.2;
            this.onGround = false;
            this.audio?.playSfx('squeak', 0.45);
          }
        }
        if (this.enabled && e.code === 'KeyH') {
          this.isCheering = true;
          this.cheerTimer = 1.4;
        }
      });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.dragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.camYaw -= dx * 0.0065;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.005, 0.08, 1.15);
    });
    this.dom.addEventListener(
      'wheel',
      (e) => {
        this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.008, 3.8, 22.0);
      },
      { passive: true }
    );
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async setCostume(costumeId) {
    this.costumeId = costumeId;
    this.root.remove(this.mesh);
    const glbUrl = GLB_COSTUMES[costumeId];
    if (glbUrl) {
      let cached = this.glbCache.get(costumeId);
      if (!cached) {
        cached = await loadComfyGLB(glbUrl, 1.35);
        if (cached) this.glbCache.set(costumeId, cached);
      }
      if (cached) {
        this.mesh = cached;
        this.root.add(this.mesh);
        return true;
      }
    }
    const fallback = glbUrl ? 'aubergine_charm' : costumeId;
    this.mesh = createJellycatCharacter(fallback);
    this.root.add(this.mesh);
    return !glbUrl;
  }

  teleportTo(pos) {
    const p = pos.clone();
    this.layout.resolveCollisions(p, 0.65);
    p.y = this.layout.getGroundHeight(p.x, p.z);
    this.root.position.copy(p);
    this.velY = 0;
    this.onGround = true;
  }

  update(dt, elapsed) {
    if (this.cheerTimer > 0) {
      this.cheerTimer -= dt;
      if (this.cheerTimer <= 0) this.isCheering = false;
    }

    if (!this.enabled) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    let moveX = this.touchStick.x;
    let moveZ = this.touchStick.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    const mag = Math.hypot(moveX, moveZ);
    let speed = 0;
    if (mag > 0.08) {
      const inputVec = new THREE.Vector3(moveX, 0, moveZ).normalize();
      inputVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      const analogScale = Math.min(1, mag);
      const walkSpeed = (this.keys.has('ShiftLeft') ? 13.5 : 8.8) * analogScale;
      speed = walkSpeed;

      this.root.position.x += inputVec.x * walkSpeed * dt;
      this.root.position.z += inputVec.z * walkSpeed * dt;
      this.layout.resolveCollisions(this.root.position, 0.58);

      const targetYaw = Math.atan2(inputVec.x, inputVec.z);
      let diff = targetYaw - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, dt * 12);
    }

    const groundY = this.layout.getGroundHeight(this.root.position.x, this.root.position.z);
    this.velY -= 22.0 * dt;
    this.root.position.y += this.velY * dt;
    if (this.root.position.y <= groundY) {
      this.root.position.y = groundY;
      this.velY = 0;
      this.onGround = true;
    }

    animateJellycatRig(this.mesh, elapsed, speed, !this.onGround, this.isCheering);

    const target = new THREE.Vector3(
      this.root.position.x,
      this.root.position.y + 1.15,
      this.root.position.z
    );
    const offsetX = Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const offsetY = Math.sin(this.camPitch) * this.camDist;
    const offsetZ = Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const desiredCam = new THREE.Vector3(
      target.x + offsetX,
      Math.max(groundY + 0.6, target.y + offsetY),
      target.z + offsetZ
    );
    this.camera.position.lerp(desiredCam, Math.min(1, dt * 11));
    this.camera.lookAt(target);
  }
}

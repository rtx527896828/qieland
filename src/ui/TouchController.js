import * as THREE from 'three';

/**
 * Full multi-touch iPad & tablet controller:
 * - Left floating analog joystick (walks on foot, steers boat/teacups/bumper/claw/pastry/ringtoss)
 * - Right-side touch-drag camera orbit & 2-finger pinch zoom directly on #game-canvas
 * - Right tactile action pad: Jump/Boost (Space), Interact (E), Camera View (V), Cheer (H)
 */
export class TouchController {
  constructor(canvas, player, rideManager, onInteract, gpuOverlay = null) {
    this.canvas = canvas;
    this.player = player;
    this.rideManager = rideManager;
    this.onInteract = onInteract;
    this.gpuOverlay = gpuOverlay;

    this.rootEl = document.getElementById('touch-controls');
    this.joyZone = document.getElementById('touch-joystick');
    this.joyKnob = document.getElementById('touch-joystick-knob');
    this.btnJump = document.getElementById('touch-btn-jump');
    this.btnInteract = document.getElementById('touch-btn-interact');
    this.btnView = document.getElementById('touch-btn-view');
    this.btnCheer = document.getElementById('touch-btn-cheer');
    this.btnToggle = document.getElementById('btn-touch-toggle');

    this.isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    this.visible = this.isTouchDevice;

    this.joyTouchId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyMaxR = 46;

    this.camTouchId = null;
    this.camLast = { x: 0, y: 0 };
    this.pinchDist = 0;

    this._syncVisibility();
    this._bindToggle();
    this._bindJoystick();
    this._bindActionButtons();
    this._bindCanvasTouchOrbit();
  }

  _syncVisibility() {
    if (!this.rootEl) return;
    this.rootEl.classList.toggle('hidden', !this.visible);
    if (this.btnToggle) {
      this.btnToggle.classList.toggle('active-toggle', this.visible);
    }
    this.gpuOverlay?.setTouchControlsVisible(this.visible);
  }

  _bindToggle() {
    this.btnToggle?.addEventListener('click', () => {
      this.visible = !this.visible;
      this._syncVisibility();
    });
  }

  _bindJoystick() {
    if (!this.joyZone || !this.joyKnob) return;

    const resetStick = () => {
      this.joyTouchId = null;
      this.player.touchStick.x = 0;
      this.player.touchStick.y = 0;
      if (this.gpuOverlay) {
        this.gpuOverlay.setJoystickState(0, 0);
      } else {
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
      }
    };

    const updateStick = (clientX, clientY) => {
      const dx = clientX - this.joyOrigin.x;
      const dy = clientY - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(this.joyMaxR, dist);
      const nx = dist > 0.001 ? dx / dist : 0;
      const ny = dist > 0.001 ? dy / dist : 0;
      const ox = nx * clamped;
      const oy = ny * clamped;
      this.player.touchStick.x = ox / this.joyMaxR;
      this.player.touchStick.y = oy / this.joyMaxR;
      if (this.gpuOverlay) {
        this.gpuOverlay.setJoystickState(this.player.touchStick.x, this.player.touchStick.y);
      } else {
        this.joyKnob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      }
    };

    // Touch events (multi-touch native on iPad Safari/Chrome)
    this.joyZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.joyTouchId !== null) return;
        const t = e.changedTouches[0];
        this.joyTouchId = t.identifier;
        const rect = this.joyZone.getBoundingClientRect();
        this.joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        updateStick(t.clientX, t.clientY);
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this.joyTouchId === null) return;
        for (const t of e.changedTouches) {
          if (t.identifier === this.joyTouchId) {
            e.preventDefault();
            updateStick(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );

    const endTouch = (e) => {
      if (this.joyTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyTouchId) {
          resetStick();
          break;
        }
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    // Mouse fallback so desktop users testing Touch Mode can drag joystick too
    let mouseDragging = false;
    this.joyZone.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mouseDragging = true;
      const rect = this.joyZone.getBoundingClientRect();
      this.joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      updateStick(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDragging) return;
      updateStick(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (!mouseDragging) return;
      mouseDragging = false;
      resetStick();
    });
  }

  _bindActionButtons() {
    const pressSpace = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.player.keys.add('Space');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    };
    const releaseSpace = (e) => {
      e.preventDefault();
      this.player.keys.delete('Space');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    };

    if (this.btnJump) {
      this.btnJump.addEventListener('touchstart', pressSpace, { passive: false });
      this.btnJump.addEventListener('touchend', releaseSpace, { passive: false });
      this.btnJump.addEventListener('touchcancel', releaseSpace);
      this.btnJump.addEventListener('mousedown', pressSpace);
      this.btnJump.addEventListener('mouseup', releaseSpace);
      this.btnJump.addEventListener('mouseleave', () => this.player.keys.delete('Space'));
    }

    if (this.btnInteract) {
      const fireInteract = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onInteract?.();
      };
      this.btnInteract.addEventListener('touchstart', fireInteract, { passive: false });
      this.btnInteract.addEventListener('click', fireInteract);
    }

    if (this.btnView) {
      const toggleV = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true }));
      };
      this.btnView.addEventListener('touchstart', toggleV, { passive: false });
      this.btnView.addEventListener('click', toggleV);
    }

    if (this.btnCheer) {
      const pressH = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.player.keys.add('KeyH');
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true }));
      };
      const releaseH = () => {
        this.player.keys.delete('KeyH');
      };
      this.btnCheer.addEventListener('touchstart', pressH, { passive: false });
      this.btnCheer.addEventListener('touchend', releaseH);
      this.btnCheer.addEventListener('mousedown', pressH);
      this.btnCheer.addEventListener('mouseup', releaseH);
    }
  }

  _bindCanvasTouchOrbit() {
    if (!this.canvas) return;

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          const [t1, t2] = e.touches;
          this.pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          this.camTouchId = null;
          return;
        }
        for (const t of e.changedTouches) {
          if (t.identifier !== this.joyTouchId && this.camTouchId === null) {
            this.camTouchId = t.identifier;
            this.camLast = { x: t.clientX, y: t.clientY };
            break;
          }
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const [t1, t2] = e.touches;
          const d = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          if (this.pinchDist > 0) {
            const delta = this.pinchDist - d;
            this.player.camDist = THREE.MathUtils.clamp(this.player.camDist + delta * 0.035, 3.8, 22.0);
          }
          this.pinchDist = d;
          return;
        }

        if (this.camTouchId === null) return;
        for (const t of e.changedTouches) {
          if (t.identifier === this.camTouchId) {
            e.preventDefault();
            const dx = THREE.MathUtils.clamp(t.clientX - this.camLast.x, -90, 90);
            const dy = THREE.MathUtils.clamp(t.clientY - this.camLast.y, -90, 90);
            this.camLast.x = t.clientX;
            this.camLast.y = t.clientY;
            if (this.rideManager?.activeRide) {
              this.rideManager.rideYawOffset -= dx * 0.0065;
              this.rideManager.ridePitchOffset = THREE.MathUtils.clamp(
                this.rideManager.ridePitchOffset + dy * 0.005,
                -0.15,
                0.9
              );
            } else {
              this.player.camYaw -= dx * 0.0075;
              this.player.camPitch = THREE.MathUtils.clamp(this.player.camPitch + dy * 0.0055, 0.08, 1.15);
            }
            break;
          }
        }
      },
      { passive: false }
    );

    const endCam = (e) => {
      if (e.touches.length < 2) this.pinchDist = 0;
      for (const t of e.changedTouches) {
        if (t.identifier === this.camTouchId) {
          this.camTouchId = null;
          break;
        }
      }
    };
    this.canvas.addEventListener('touchend', endCam);
    this.canvas.addEventListener('touchcancel', endCam);
  }

  setInteractActive(active, label = '互动') {
    if (!this.btnInteract) return;
    const text = active ? `✨ ${label}` : 'E 互动';
    if (this._lastInteractActive === active && this._lastInteractText === text) return;
    this._lastInteractActive = active;
    this._lastInteractText = text;
    if (this.gpuOverlay) {
      this.gpuOverlay.setTouchInteractState(active, label);
    } else {
      this.btnInteract.classList.toggle('ready', active);
      this.btnInteract.textContent = text;
    }
  }
}

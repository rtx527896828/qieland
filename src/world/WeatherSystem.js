import * as THREE from 'three';

export const WEATHER_MODES = [
  { id: 'sunny', label: '☀️ 晴朗微风' },
  { id: 'sakura', label: '🌸 紫樱花瓣雨' },
  { id: 'rain', label: '🌧️ 太阳雨彩虹' },
  { id: 'snow', label: '❄️ 棉花糖初雪' },
  { id: 'parade', label: '🎆 星夜花车秀' },
];

export class WeatherSystem {
  constructor(scene, parkEnv, audio) {
    this.scene = scene;
    this.park = parkEnv;
    this.audio = audio;

    this.mode = 'sunny';
    this.particleCount = 1200;
    this.particles = null;
    this.velocities = [];
    this.rainbowGroup = null;
    this.starField = null;
    this.rainAudio = null;

    this._buildParticles();
    this._buildRainbow();
    this._buildStars();
  }

  _buildParticles() {
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
    this.velocities = [];

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = Math.random() * 42;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      this.velocities.push({
        vy: 1.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.particleMat = new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, this.particleMat);
    this.scene.add(this.particles);
  }

  _buildRainbow() {
    const group = new THREE.Group();
    group.position.set(0, 2, -62);
    const rainbowColors = ['#ff5e7e', '#ffa24d', '#ffe359', '#6ce08a', '#63c5ff', '#9c6bff'];
    for (let i = 0; i < rainbowColors.length; i++) {
      const r = 68 - i * 1.4;
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.72, 8, 64, Math.PI),
        new THREE.MeshBasicMaterial({
          color: rainbowColors[i],
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      group.add(arch);
    }
    // Faint secondary outer rainbow
    for (let i = 0; i < rainbowColors.length; i++) {
      const r = 80 + i * 1.1;
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.48, 8, 64, Math.PI),
        new THREE.MeshBasicMaterial({
          color: rainbowColors[rainbowColors.length - 1 - i],
          transparent: true,
          opacity: 0.20,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      group.add(arch);
    }
    group.visible = false;
    this.scene.add(group);
    this.rainbowGroup = group;
  }

  _buildStars() {
    const count = 800;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.44;
      const r = 175;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) + 8;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#fff3c4', size: 1.1, transparent: true, opacity: 0.9 });
    this.starField = new THREE.Points(geo, mat);
    this.starField.visible = false;
    this.scene.add(this.starField);
  }

  setMode(modeId) {
    this.mode = modeId;
    const colorAttr = this.particles.geometry.attributes.color;

    // Manage rain audio cleanly
    if (modeId === 'rain') {
      if (!this.rainAudio) {
        this.rainAudio = new Audio('./assets/audio/sfx_rain.flac');
        this.rainAudio.loop = true;
        this.rainAudio.volume = 0.28;
      }
      if (!this.audio?.muted && this.audio?.unlocked) {
        this.rainAudio.play().catch(() => { });
      }
    } else if (this.rainAudio && !this.rainAudio.paused) {
      this.rainAudio.pause();
    }

    this.rainbowGroup.visible = modeId === 'rain';
    this.starField.visible = modeId === 'parade';

    if (modeId === 'sunny') {
      this.park.applyAtmosphere('day', false);
      this.park.setWetGround(false);
      this.particleMat.size = 0.24;
      this.particleMat.opacity = 0.55;
      for (let i = 0; i < this.particleCount; i++) {
        colorAttr.setXYZ(i, 1.0, 0.95, 0.65);
      }
    } else if (modeId === 'sakura') {
      this.park.applyAtmosphere('sunset', false);
      this.park.setWetGround(false);
      this.particleMat.size = 0.42;
      this.particleMat.opacity = 0.9;
      for (let i = 0; i < this.particleCount; i++) {
        const isMauve = i % 3 === 0;
        colorAttr.setXYZ(i, isMauve ? 0.85 : 1.0, isMauve ? 0.65 : 0.78, isMauve ? 0.96 : 0.90);
      }
    } else if (modeId === 'rain') {
      this.park.applyAtmosphere('rain', false);
      this.park.setWetGround(true);
      this.particleMat.size = 0.30;
      this.particleMat.opacity = 0.65;
      for (let i = 0; i < this.particleCount; i++) {
        colorAttr.setXYZ(i, 0.75, 0.90, 1.0);
      }
    } else if (modeId === 'snow') {
      this.park.applyAtmosphere('snow', false);
      this.park.setWetGround(false);
      this.particleMat.size = 0.48;
      this.particleMat.opacity = 0.92;
      for (let i = 0; i < this.particleCount; i++) {
        colorAttr.setXYZ(i, 1.0, 0.99, 1.0);
      }
    } else if (modeId === 'parade') {
      this.park.applyAtmosphere('night', true);
      this.park.setWetGround(false);
      this.particleMat.size = 0.26;
      this.particleMat.opacity = 0.75;
      for (let i = 0; i < this.particleCount; i++) {
        colorAttr.setXYZ(i, 1.0, 0.86, 0.45);
      }
    }
    colorAttr.needsUpdate = true;
  }

  update(dt, elapsed, focusPos) {
    const posAttr = this.particles.geometry.attributes.position;
    const cx = focusPos ? focusPos.x : 0;
    const cz = focusPos ? focusPos.z : 0;

    for (let i = 0; i < this.particleCount; i++) {
      let x = posAttr.array[i * 3];
      let y = posAttr.array[i * 3 + 1];
      let z = posAttr.array[i * 3 + 2];
      const v = this.velocities[i];

      if (this.mode === 'rain') {
        y -= (18 + v.vy * 4) * dt;
        x -= 2.0 * dt;
      } else if (this.mode === 'sakura') {
        y -= (1.8 + v.vy * 0.5) * dt;
        x += Math.sin(elapsed * 1.4 + v.phase) * 1.6 * dt;
        z += Math.cos(elapsed * 1.1 + v.phase) * 1.2 * dt;
      } else if (this.mode === 'snow') {
        y -= (1.6 + v.vy * 0.45) * dt;
        x += Math.sin(elapsed * 0.9 + v.phase) * 0.9 * dt;
      } else {
        // Gentle floating pollen / fireflies
        y += Math.sin(elapsed * 1.2 + v.phase) * 0.45 * dt;
        x += Math.cos(elapsed * 0.8 + v.phase) * 0.55 * dt;
      }

      if (y < 0.2 || y > 44) {
        y = this.mode === 'sunny' || this.mode === 'parade' ? 1.2 + Math.random() * 14 : 36 + Math.random() * 8;
        x = cx + (Math.random() - 0.5) * 120;
        z = cz + (Math.random() - 0.5) * 120;
      }
      posAttr.array[i * 3] = x;
      posAttr.array[i * 3 + 1] = y;
      posAttr.array[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;

    if (this.starField.visible) {
      this.starField.rotation.y = elapsed * 0.008;
    }
  }
}

import './style.css';
import * as THREE from 'three';
import { AudioManager } from './gameplay/AudioManager.js';
import { ParkLayoutRegistry } from './world/ParkLayout.js';
import { ParkEnvironment } from './world/ParkEnvironment.js';
import { WeatherSystem, WEATHER_MODES } from './world/WeatherSystem.js';
import { AttractionsManager } from './world/Attractions.js';
import { PlayerController } from './gameplay/PlayerController.js';
import { NPCManager } from './gameplay/NPCManager.js';
import { RideManager } from './gameplay/RideManager.js';
import { MiniGamesManager } from './gameplay/MiniGames.js';
import { UIManager } from './ui/UIManager.js';
import { TouchController } from './ui/TouchController.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.90;

const rendererBadge = document.getElementById('renderer-badge');
rendererBadge.textContent = navigator.gpu ? 'WebGPU 就绪 · Three.js 毛绒引擎' : 'WebGL2 毛绒引擎';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.2, 420);

const ui = new UIManager();
const audio = new AudioManager();
const layout = new ParkLayoutRegistry();
const park = new ParkEnvironment(scene, audio, layout);
const weather = new WeatherSystem(scene, park, audio);
const attractions = new AttractionsManager(scene, layout);
const player = new PlayerController(scene, camera, canvas, audio, layout);
const npcs = new NPCManager(scene, ui, audio, layout);
const rideManager = new RideManager(attractions, player, camera, audio, ui);
const miniGames = new MiniGamesManager(attractions, player, camera, audio, ui);
const touchController = new TouchController(canvas, player, rideManager, () => handleInteract());

weather.setMode('sunny');

// Fast travel map & wardrobe
ui.renderMapPoints(attractions.fastTravelPoints, (pt) => {
  if (rideManager.activeRide) rideManager.exitRide();
  if (miniGames.activeGame) miniGames.exit(false);
  player.teleportTo(pt.pos);
  ui.toast(`✨ 已传送至 ${pt.emoji} ${pt.name}`);
});

ui.renderWardrobe(async (costumeId) => {
  const ok = await player.setCostume(costumeId);
  ui.unlockDex(costumeId);
  if (costumeId.startsWith('comfy_') && ok) {
    ui.toast('✨ 已切换为官方参考图经 ComfyUI Trellis2 生成的原生 3D 茄子！');
  } else {
    ui.toast('👗 茄子大明星换装完成！');
  }
});

// Top HUD buttons
let weatherIdx = 0;

function applyWeatherIndex(idx) {
  weatherIdx = idx % WEATHER_MODES.length;
  const w = WEATHER_MODES[weatherIdx];
  weather.setMode(w.id);

  document.getElementById('btn-weather').textContent = w.label;
  const isParade = w.id === 'parade';
  document.getElementById('btn-parade').textContent = isParade ? '✨ 巡游进行中 (点此切回白昼)' : '🎆 花车烟花夜';
  audio.playBgm(isParade ? 'parade' : 'day');
  ui.toast(`🌦️ 天气已切换为：${w.label}`);
}

document.getElementById('btn-map').onclick = () => ui.openModal('modal-map', player.root.position);
document.getElementById('btn-wardrobe').onclick = () => ui.openModal('modal-wardrobe');
document.getElementById('btn-hud-wardrobe').onclick = () => ui.openModal('modal-wardrobe');
document.getElementById('btn-dex').onclick = () => ui.openModal('modal-dex');
document.getElementById('btn-hud-dex').onclick = () => ui.openModal('modal-dex');
document.getElementById('btn-comfy').onclick = () => ui.openModal('modal-comfy');

document.getElementById('btn-weather').onclick = () => {
  applyWeatherIndex(weatherIdx + 1);
};

document.getElementById('btn-parade').onclick = () => {
  const nextIsParade = weather.mode !== 'parade';
  applyWeatherIndex(nextIsParade ? 4 : 0);
};

document.getElementById('btn-audio-toggle').onclick = () => {
  const muted = audio.toggleMute();
  document.getElementById('btn-audio-toggle').textContent = muted ? '🔇' : '🔊';
  if (weather.rainAudio) {
    if (muted) weather.rainAudio.pause();
    else if (weather.mode === 'rain') weather.rainAudio.play().catch(() => {});
  }
};

document.getElementById('btn-exit-ride').onclick = () => rideManager.exitRide();
document.getElementById('btn-exit-minigame').onclick = () => miniGames.exit(false);

function capturePostcard() {
  renderer.render(scene, camera);
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h);

  const pad = Math.max(18, Math.round(w * 0.018));
  ctx.strokeStyle = '#fffaf4';
  ctx.lineWidth = pad * 2;
  ctx.strokeRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(67, 34, 92, 0.86)';
  const bannerH = 54;
  ctx.fillRect(pad, h - pad - bannerH, w - pad * 2, bannerH);

  ctx.fillStyle = '#ffd479';
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  ctx.fillText('🍆 Qieland 4.0 · 茄子奇幻乐园 打卡纪念', pad + 18, h - pad - 18);

  const newlyFound = npcs.unlockVisibleInCamera(camera);
  let bonus = 10;
  let extraMsg = '';
  if (rideManager.isAtFerrisPeak) {
    bonus = 25;
    extraMsg += ' · 摩天轮最高点双倍奖励!';
  }
  if (newlyFound.length > 0) {
    bonus += newlyFound.length * 15;
    extraMsg += ` · 拍到并解锁了 ${newlyFound.join('、')}!`;
  }
  ui.addCoins(bonus);
  audio.playSfx('coin', 0.6);

  ui.showPhotoPostcard(
    off.toDataURL('image/png'),
    `📸 拍照成功！获得 +${bonus} 开心茄币${extraMsg}`
  );
}

ui.triggerPhoto = capturePostcard;
document.getElementById('btn-photo').onclick = capturePostcard;

let started = false;
document.getElementById('btn-enter-park').addEventListener('click', () => {
  started = true;
  document.getElementById('splash-screen').classList.add('hidden');
  ui.showHud();
  audio.unlock();
  ui.toast('🎉 欢迎来到 5 大非对称主题片区的 Qieland 4.0 茄子奇幻乐园！');
});

let currentPromptTarget = null;

function handleInteract() {
  if (rideManager.activeRide) {
    rideManager.exitRide();
    return;
  }
  if (miniGames.activeGame) return;
  if (!currentPromptTarget) return;

  if (currentPromptTarget.kind === 'attraction') {
    const item = currentPromptTarget.data;
    if (item.type === 'ride') {
      rideManager.enterRide(item.id);
    } else {
      miniGames.start(item.id);
    }
  } else if (currentPromptTarget.kind === 'npc') {
    npcs.talkTo(currentPromptTarget.data);
  }
}

window.addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Escape') {
    if (ui.isModalOpen()) {
      ui.closeAllModals();
    } else if (ui.isDialogueOpen()) {
      ui.hideDialogue();
    } else if (rideManager.activeRide) {
      rideManager.exitRide();
    } else if (miniGames.activeGame) {
      miniGames.exit(false);
    }
    return;
  }
  if (e.code === 'Space' && ui.isDialogueOpen()) {
    ui.hideDialogue();
    return;
  }
  if (e.code === 'KeyE' || e.code === 'KeyT') {
    if (!ui.isModalOpen()) {
      handleInteract();
    }
  } else if (e.code === 'KeyP' && !ui.isModalOpen()) {
    capturePostcard();
  } else if (e.code === 'KeyF' && !ui.isModalOpen()) {
    document.getElementById('btn-parade').click();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  park.update(dt, elapsed, player.root.position, (amt) => {
    ui.addCoins(amt);
    audio.playSfx('coin', 0.5);
    ui.toast(`🪙 捡到花车巡游掉落的金币 +${amt}`);
  });
  attractions.update(dt, elapsed);
  weather.update(dt, elapsed, started ? player.root.position : null);

  if (started) {
    player.update(dt, elapsed);
    npcs.update(dt, elapsed, player.root.position);
    rideManager.update(dt, elapsed);
    miniGames.update(dt, elapsed);

    if (!rideManager.activeRide && !miniGames.activeGame) {
      const nearAttraction = attractions.getNearestInteractable(player.root.position);
      const nearNpc = npcs.getNearestNpc(player.root.position);
      if (nearAttraction) {
        currentPromptTarget = { kind: 'attraction', data: nearAttraction };
        ui.showInteract(
          'E',
          `${nearAttraction.emoji} ${nearAttraction.type === 'ride' ? '乘坐' : '游玩'} ${nearAttraction.name}`,
          handleInteract
        );
        touchController.setInteractActive(true, nearAttraction.type === 'ride' ? '乘坐' : '游玩');
      } else if (nearNpc) {
        currentPromptTarget = { kind: 'npc', data: nearNpc };
        ui.showInteract('E', `${nearNpc.info.emoji} 与 ${nearNpc.info.name} 对话`, handleInteract);
        touchController.setInteractActive(true, '对话');
      } else {
        currentPromptTarget = null;
        ui.hideInteract();
        touchController.setInteractActive(false);
      }
    } else {
      currentPromptTarget = null;
      ui.hideInteract();
      touchController.setInteractActive(Boolean(rideManager.activeRide), '下车');
    }
  } else {
    const a = elapsed * 0.14;
    camera.position.set(Math.sin(a) * 38, 17, Math.cos(a) * 38 - 10);
    camera.lookAt(-4, 7, -28);
  }

  renderer.render(scene, camera);
}

animate();

import { COSTUME_LIST, JELLYCAT_ROSTER } from '../world/CharacterFactory.js';

export class UIManager {
  constructor() {
    this.coins = 100;
    this.unlockedIds = new Set(['aubergine_charm', 'aubergine_standard']);
    this.currentCostume = 'aubergine_charm';

    this.elHud = document.getElementById('hud');
    this.elCoins = document.getElementById('coin-count');
    this.elDexCount = document.getElementById('dex-progress');
    this.elDexModalCount = document.getElementById('dex-modal-count');
    this.elCostumeLabel = document.getElementById('costume-label');
    this.elToastBox = document.getElementById('toast-container');
    this.elMapPlayerDot = document.getElementById('map-player-dot');

    this.elInteract = document.getElementById('interact-prompt');
    this.elInteractKey = document.getElementById('interact-key');
    this.elInteractText = document.getElementById('interact-text');

    this.elDialogue = document.getElementById('dialogue-box');
    this.elDialogueAvatar = document.getElementById('dialogue-avatar');
    this.elDialogueName = document.getElementById('dialogue-name');
    this.elDialogueContent = document.getElementById('dialogue-content');

    this.elRideHud = document.getElementById('ride-hud');
    this.elRideTitle = document.getElementById('ride-hud-title');
    this.elRideStatus = document.getElementById('ride-hud-status');
    this.elRideActions = document.getElementById('ride-hud-actions');

    this.elMgHud = document.getElementById('minigame-hud');
    this.elMgTitle = document.getElementById('mg-title');
    this.elMgHint = document.getElementById('mg-hint');
    this.elMgTimer = document.getElementById('mg-timer');
    this.elMgScore = document.getElementById('mg-score');
    this.elMgControls = document.getElementById('mg-custom-controls');

    this.elBackdrop = document.getElementById('modal-backdrop');
    this.modals = ['modal-map', 'modal-wardrobe', 'modal-dex', 'modal-comfy', 'modal-photo'];

    this._bindModalClose();
    this._renderDex();
    this._renderComfyGallery();
  }

  _bindModalClose() {
    this.elBackdrop.addEventListener('click', () => this.closeAllModals());
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    this.elDialogue.addEventListener('click', () => this.hideDialogue());
  }

  openModal(id, playerPos = null) {
    this.closeAllModals();
    if (id === 'modal-map' && playerPos && this.elMapPlayerDot) {
      const pctX = Math.max(6, Math.min(94, 50 + (playerPos.x / 120) * 44));
      const pctY = Math.max(6, Math.min(94, 50 + (playerPos.z / 120) * 44));
      this.elMapPlayerDot.style.left = `${pctX}%`;
      this.elMapPlayerDot.style.top = `${pctY}%`;
    }
    this.elBackdrop.classList.remove('hidden');
    document.getElementById(id)?.classList.remove('hidden');
  }

  closeAllModals() {
    this.elBackdrop.classList.add('hidden');
    for (const m of this.modals) {
      document.getElementById(m)?.classList.add('hidden');
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  isModalOpen() {
    return !this.elBackdrop.classList.contains('hidden');
  }

  showHud() {
    this.elHud.classList.remove('hidden');
  }

  addCoins(n) {
    this.coins += n;
    this.elCoins.textContent = String(this.coins);
  }

  unlockDex(id) {
    if (this.unlockedIds.has(id)) return false;
    this.unlockedIds.add(id);
    const total = JELLYCAT_ROSTER.length;
    const count = this.unlockedIds.size;
    this.elDexCount.textContent = `${count} / ${total}`;
    this.elDexModalCount.textContent = `${count}/${total}`;
    this._renderDex();
    return true;
  }

  toast(msg) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.elToastBox.appendChild(div);
    setTimeout(() => div.remove(), 3400);
  }

  showInteract(key, text, onClick) {
    this.elInteract.classList.remove('hidden');
    this.elInteractKey.textContent = key;
    this.elInteractText.textContent = text;
    this.elInteract.onclick = onClick;
  }

  hideInteract() {
    this.elInteract.classList.add('hidden');
  }

  showDialogue(emoji, name, text) {
    this.elDialogueAvatar.textContent = emoji;
    this.elDialogueName.textContent = name;
    this.elDialogueContent.textContent = text;
    this.elDialogue.classList.remove('hidden');
  }

  hideDialogue() {
    this.elDialogue.classList.add('hidden');
  }

  isDialogueOpen() {
    return !this.elDialogue.classList.contains('hidden');
  }

  showRideHud(title, buttons = []) {
    this.elRideTitle.textContent = title;
    this.elRideActions.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'ride-btn';
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      this.elRideActions.appendChild(btn);
    }
    this.elRideHud.classList.remove('hidden');
  }

  setRideStatus(text) {
    this.elRideStatus.textContent = text;
  }

  hideRideHud() {
    this.elRideHud.classList.add('hidden');
  }

  showMiniGameHud(title, hint, timerText, scoreText) {
    this.elMgTitle.textContent = title;
    this.elMgHint.textContent = hint;
    this.elMgTimer.textContent = timerText;
    this.elMgScore.textContent = scoreText;
    this.elMgHud.classList.remove('hidden');
  }

  updateMiniGameStats(timerText, scoreText) {
    this.elMgTimer.textContent = timerText;
    this.elMgScore.textContent = scoreText;
  }

  setMiniGameControls(node) {
    this.elMgControls.innerHTML = '';
    this.elMgControls.appendChild(node);
  }

  clearMiniGameControls() {
    this.elMgControls.innerHTML = '';
  }

  hideMiniGameHud() {
    this.elMgHud.classList.add('hidden');
  }

  renderMapPoints(points, onTeleport) {
    const grid = document.getElementById('map-grid');
    grid.innerHTML = '';
    for (const pt of points) {
      const card = document.createElement('button');
      card.className = 'item-card';
      card.innerHTML = `
        <span class="emoji">${pt.emoji}</span>
        <div class="title">${pt.name}</div>
        <div class="sub">${pt.desc}</div>
      `;
      card.addEventListener('click', () => {
        onTeleport(pt);
        this.closeAllModals();
      });
      grid.appendChild(card);
    }
  }

  renderWardrobe(onSelectCostume) {
    const grid = document.getElementById('wardrobe-grid');
    grid.innerHTML = '';
    for (const c of COSTUME_LIST) {
      const card = document.createElement('button');
      card.className = `item-card ${c.id === this.currentCostume ? 'selected' : ''}`;
      card.innerHTML = `
        <span class="emoji">${c.emoji}</span>
        <div class="title">${c.name}</div>
        <div class="sub">${c.desc}</div>
      `;
      card.addEventListener('click', async () => {
        this.currentCostume = c.id;
        this.elCostumeLabel.textContent = c.name;
        await onSelectCostume(c.id);
        this.renderWardrobe(onSelectCostume);
        this.closeAllModals();
      });
      grid.appendChild(card);
    }
  }

  _renderDex() {
    const grid = document.getElementById('dex-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const item of JELLYCAT_ROSTER) {
      const unlocked = this.unlockedIds.has(item.id);
      const card = document.createElement('div');
      card.className = `dex-card ${unlocked ? '' : 'locked'}`;
      card.innerHTML = `
        <span class="dex-emoji">${item.emoji}</span>
        <div class="dex-name">${item.name}</div>
        <span class="dex-tag">${unlocked ? `已点亮 · ${item.category}` : '未遇到'}</span>
        <div class="dex-lore">${unlocked ? item.lore : '去乐园逛逛、对话、拍照或抓娃娃来解锁TA吧！'}</div>
      `;
      grid.appendChild(card);
    }
  }

  _renderComfyGallery() {
    const box = document.getElementById('comfy-gallery');
    if (!box) return;
    box.innerHTML = `
      <div class="comfy-card">
        <h4>🍆 官方三茄子参考图 → Trellis2 3D GLB</h4>
        <div class="tex-strip">
          <img src="./assets/reference/ref_standard.png" title="经典款" />
          <img src="./assets/reference/ref_giant.png" title="大号敦实款" />
          <img src="./assets/reference/ref_charm.png" title="短腿挂件款" />
          <img src="./assets/images/aubergine_hero.png" title="棚拍设定" />
        </div>
        <div class="comfy-status">已由你的 3 张参考图生成 <code>aubergine_standard.glb</code>、<code>aubergine_giant.glb</code>、<code>aubergine_charm.glb</code>，正陈列于圣茄城堡展亭！</div>
      </div>
      <div class="comfy-card">
        <h4>🗺️ Qwen 2.1 · 4.0 非对称五片区总平图 & 城堡原画</h4>
        <div class="tex-strip">
          <img src="./assets/images/park_master_map.png" title="Qieland 4.0 非对称五区总平图" />
          <img src="./assets/images/concept_castle.png" title="城堡原画" />
          <img src="./assets/images/train_solo_ref.png" title="蒸汽小火车原画" />
          <img src="./assets/images/castle_solo_ref.png" title="城堡立体白模" />
        </div>
        <div class="comfy-status">已生成 <code>park_master_map.png</code>、<code>train_locomotive.glb</code>、<code>castle_royal.glb</code> 实时置入乐园！</div>
      </div>
      <div class="comfy-card">
        <h4>🧱 九套无缝 PBR 地砖、苔藓森林、城堡砖石与顶篷纹理</h4>
        <div class="tex-strip">
          <img src="./assets/textures/tex_cobblestone.png" title="广场拼花砖" />
          <img src="./assets/textures/tex_patisserie_tile.png" title="甜品湾马赛克地砖" />
          <img src="./assets/textures/tex_forest_moss.png" title="邦尼兔林地苔藓" />
          <img src="./assets/textures/tex_wood.png" title="蜂蜜橡木栈道" />
        </div>
        <div class="comfy-status">五大片区各具专属地面材质贴图，雨天自动呈现湿润镜面反光！</div>
      </div>
      <div class="comfy-card">
        <h4>🎬 LTX-2.3 巨幕巡游视频 & 原声配乐</h4>
        <video src="./assets/video/jumbo_parade.mp4" controls loop muted playsinline poster="./assets/images/castle_jumbo_frame.png"></video>
        <audio controls src="./assets/audio/bgm_day.flac"></audio>
        <audio controls src="./assets/audio/bgm_parade.flac"></audio>
      </div>
    `;
  }

  showPhotoPostcard(dataUrl, captionText) {
    const img = document.getElementById('photo-preview-img');
    const dl = document.getElementById('btn-download-photo');
    const cap = document.getElementById('photo-caption');
    img.src = dataUrl;
    dl.href = dataUrl;
    cap.textContent = captionText;
    this.openModal('modal-photo');
  }
}

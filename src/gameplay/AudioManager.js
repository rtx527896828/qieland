export class AudioManager {
  constructor() {
    this.muted = false;
    this.ctx = null;
    this.bgmDay = null;
    this.bgmParade = null;
    this.currentBgm = null;
    this.sfxCache = {};
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx && !this.ctx) {
      this.ctx = new AudioCtx();
    }

    this.bgmDay = this._createAudio('/assets/audio/bgm_day.flac', true, 0.35);
    this.bgmParade = this._createAudio('/assets/audio/bgm_parade.flac', true, 0.38);

    const sfxNames = ['squeak', 'coaster', 'boat', 'whack', 'bumper', 'fireworks', 'coin'];
    for (const name of sfxNames) {
      this.sfxCache[name] = `/assets/audio/sfx_${name}.flac`;
    }

    this.playBgm('day');
  }

  _createAudio(src, loop = false, volume = 0.5) {
    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = volume;
    audio.preload = 'auto';
    return audio;
  }

  playBgm(mode = 'day') {
    if (!this.unlocked) return;
    const target = mode === 'parade' ? this.bgmParade : this.bgmDay;
    const other = mode === 'parade' ? this.bgmDay : this.bgmParade;
    if (other && !other.paused) {
      other.pause();
    }
    this.currentBgm = target;
    if (target && !this.muted) {
      target.play().catch(() => {});
    }
  }

  playSfx(name, volume = 0.65) {
    if (this.muted || !this.unlocked) return;
    const src = this.sfxCache[name];
    if (src) {
      const a = new Audio(src);
      a.volume = volume;
      a.play().catch(() => this._synthFallback(name));
    } else {
      this._synthFallback(name);
    }
  }

  _synthFallback(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (name === 'coin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(1120, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.currentBgm) {
      if (this.muted) {
        this.currentBgm.pause();
      } else {
        this.currentBgm.play().catch(() => {});
      }
    }
    return this.muted;
  }
}

// ============================================================
// notifySound.ts — Web Audio API 합성 "딩동" 짧은 2음 비프
// 외부 파일 없이 브라우저에서 직접 톤 합성
// ============================================================

let ctx: AudioContext | null = null;
const STORAGE_KEY = "teacher_notify_sound_v1";

interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0~1
}

const DEFAULT_PREFS: SoundPrefs = { enabled: true, volume: 0.5 };

export const loadSoundPrefs = (): SoundPrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_PREFS.volume,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const saveSoundPrefs = (prefs: SoundPrefs): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
};

const ensureCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
};

const playTone = (ac: AudioContext, freq: number, start: number, duration: number, volume: number) => {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ac.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
};

/** 2음 "딩-동" 알림음 */
export const playNotifyDing = (overrideVolume?: number): void => {
  const prefs = loadSoundPrefs();
  if (!prefs.enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  // resume on user-gesture browsers
  if (ac.state === "suspended") {
    void ac.resume();
  }
  const v = (overrideVolume ?? prefs.volume) * 0.6;
  // 딩 (높은 음) → 동 (낮은 음)
  playTone(ac, 988, 0, 0.18, v); // B5
  playTone(ac, 659, 0.18, 0.28, v); // E5
};

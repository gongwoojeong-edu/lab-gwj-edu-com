// 승인요청 알림용 음성(차임) — WebAudio 기반, 외부 파일 없이 동작
const MUTE_KEY = "gwj.teacher.approvalChime.muted";

export const isApprovalChimeMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setApprovalChimeMuted = (muted: boolean) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* noop */
  }
};

let ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  try {
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
};

const tone = (audio: AudioContext, freq: number, start: number, dur = 0.18, gain = 0.18) => {
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, audio.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, audio.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  osc.connect(g).connect(audio.destination);
  osc.start(audio.currentTime + start);
  osc.stop(audio.currentTime + start + dur + 0.02);
};

export const playApprovalChime = () => {
  if (isApprovalChimeMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    // 짧은 2음 차임 (C6 → E6)
    tone(audio, 1046.5, 0, 0.18);
    tone(audio, 1318.5, 0.16, 0.22);
  } catch {
    /* noop */
  }
};

// 사용자 첫 상호작용 시 AudioContext 잠금 해제 (자동재생 정책 우회)
let primed = false;
export const primeApprovalChime = () => {
  if (primed) return;
  primed = true;
  const handler = () => {
    getCtx();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
};

// 승인요청 알림 — 한국어 음성(Web SpeechSynthesis) 기반
// 예: "나예솔 1강 완료"
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

// sentence_id (예: "L01-001" / "L05-3-2") → "1강" 형식
export const unitLabelFromSentenceId = (sentenceId: string): string => {
  const m = sentenceId.match(/^L(\d{1,2})/i);
  if (!m) return sentenceId;
  return `${parseInt(m[1], 10)}강`;
};

const pickKoreanVoice = (): SpeechSynthesisVoice | null => {
  try {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => /ko(-|_)?KR/i.test(v.lang)) ||
      voices.find((v) => v.lang?.toLowerCase().startsWith("ko")) ||
      null
    );
  } catch {
    return null;
  }
};

export const speakApproval = (studentName: string, unitLabel: string) => {
  if (isApprovalChimeMuted()) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const text = `${studentName} ${unitLabel} 완료`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    const v = pickKoreanVoice();
    if (v) u.voice = v;
    synth.speak(u);
  } catch {
    /* noop */
  }
};

// 사용자 첫 상호작용 시 음성합성 잠금 해제 (자동재생 정책 우회) + voices 로딩
let primed = false;
export const primeApprovalChime = () => {
  if (primed) return;
  primed = true;
  try {
    // voices 비동기 로딩 트리거
    window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  } catch {
    /* noop */
  }
  const handler = () => {
    try {
      // 무음 utterance로 합성 엔진 깨우기
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.lang = "ko-KR";
      window.speechSynthesis.speak(u);
    } catch {
      /* noop */
    }
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
};

// 미리듣기 (토글 켤 때)
export const previewApprovalVoice = () => {
  try {
    const u = new SpeechSynthesisUtterance("음성 알림이 켜졌습니다");
    u.lang = "ko-KR";
    const v = pickKoreanVoice();
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
};

// 하위 호환 — 차임 함수 시그니처 유지 (기본 동작은 미리듣기와 동일)
export const playApprovalChime = () => {
  previewApprovalVoice();
};

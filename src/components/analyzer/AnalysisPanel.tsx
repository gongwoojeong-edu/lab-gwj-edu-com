import { cn } from "@/lib/utils";
import { Check, X, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  WordAnswer,
  NounAnswer,
  VerbAnswer,
  POS,
  NounForm,
  SentenceElement,
  VerbNumber,
  VerbTense,
  VerbAspect,
} from "@/data/sentences";

export type StepStatus = "idle" | "correct" | "wrong";

// ============================================================
// 명사 진행 상태
// ============================================================
export interface NounProgress {
  form: NounForm | null;
  element: SentenceElement | null;
  role: string | null;
  formStatus: StepStatus;
  elementStatus: StepStatus;
  roleStatus: StepStatus;
}

// ============================================================
// 동사 진행 상태 (다중 선택)
// ============================================================
export interface VerbProgress {
  number: VerbNumber | null;
  tense: VerbTense | null;
  aspect: VerbAspect[];
  voice: boolean; // 수동
  proVerb: boolean;
  confirmStatus: StepStatus;
}

interface AnalysisPanelProps {
  selectedWord: string | null;
  answer: WordAnswer | null;

  pos: POS | null;
  posStatus: StepStatus;
  onPosChange: (p: POS) => void;

  noun: NounProgress;
  onNounFormChange: (f: NounForm) => void;
  onNounElementChange: (e: SentenceElement) => void;
  onNounRoleChange: (r: string) => void;

  verb: VerbProgress;
  onVerbToggleNumber: (n: VerbNumber) => void;
  onVerbToggleTense: (t: VerbTense) => void;
  onVerbToggleAspect: (a: VerbAspect) => void;
  onVerbToggleVoice: () => void;
  onVerbToggleProVerb: () => void;
  onVerbConfirm: () => void;
}

// ============================================================
// LAYER 01: 품사
// ============================================================
const POS_LIST: { key: POS; circle: string; label: string; enabled: boolean }[] = [
  { key: "명사", circle: "ⓝ", label: "명사", enabled: true },
  { key: "형용사", circle: "ⓐ", label: "형용사", enabled: false },
  { key: "부사", circle: "ⓓ", label: "부사", enabled: false },
  { key: "동사", circle: "ⓥ", label: "동사", enabled: true },
  { key: "기타", circle: "ⓔ", label: "기타", enabled: false },
];

// ============================================================
// LAYER 02: 명사 형태
// ============================================================
const NOUN_FORMS: { key: NounForm; circle: string; label: string }[] = [
  { key: "명사", circle: "①", label: "명사" },
  { key: "to V", circle: "⑤", label: "to V" },
  { key: "V-ing", circle: "⑧", label: "V-ing" },
  { key: "접SV", circle: "⑪", label: "접SV" },
];

// ============================================================
// LAYER 03a: 문장성분
// ============================================================
const ELEMENTS: { key: SentenceElement; label: string; colorClass: string }[] = [
  { key: "S", label: "주어", colorClass: "bg-element-s-bg text-element-s border-element-s/40" },
  { key: "O", label: "목적어", colorClass: "bg-element-o-bg text-element-o border-element-o/40" },
  { key: "C", label: "보어", colorClass: "bg-element-c-bg text-element-c border-element-c/40" },
  { key: "M", label: "수식어", colorClass: "bg-element-m-bg text-element-m border-element-m/40" },
];

// ============================================================
// LAYER 03b: 세부역할 매핑
// ============================================================
const COMMON_ROLES_BY_ELEMENT: Record<SentenceElement, string[]> = {
  S: ["주어", "가주어", "진주어"],
  O: [
    "목적어(타동)",
    "목적어(전치)",
    "간접목적어",
    "직접목적어",
    "가목적어",
    "진목적어",
  ],
  C: ["주격보어", "목적격보어"],
  M: [],
};

const FORM_BONUS_ROLES_BY_ELEMENT: Partial<
  Record<NounForm, Partial<Record<SentenceElement, string[]>>>
> = {
  "to V": { S: ["의미상주어"] },
  "V-ing": { S: ["의미상주어"] },
};

// 형태 전용 칩 (성분 무관) — 03a 스킵
const FORM_ONLY_ROLES: Partial<Record<NounForm, string[]>> = {
  "to V": [
    "의문사(to V)",
    "부정형",
    "수동형",
    "완료형",
    "진행형",
    "원형부정사",
    "대부정사",
  ],
  "V-ing": ["부정형", "수동형", "완료형"],
  "접SV": ["명사절that", "whether/if", "의SV", "관대what", "복합관대~ever"],
};

const isFormOnlyRole = (form: NounForm | null, role: string | null): boolean => {
  if (!form || !role) return false;
  return FORM_ONLY_ROLES[form]?.includes(role) ?? false;
};

const StatusPill = ({ status }: { status: StepStatus }) => {
  if (status === "correct")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-element-o uppercase tracking-wider">
        <Check className="size-3" /> OK
      </span>
    );
  if (status === "wrong")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-destructive uppercase tracking-wider">
        <X className="size-3" /> Try
      </span>
    );
  return null;
};

export const AnalysisPanel = ({
  selectedWord,
  answer,
  pos,
  posStatus,
  onPosChange,
  noun,
  onNounFormChange,
  onNounElementChange,
  onNounRoleChange,
  verb,
  onVerbToggleNumber,
  onVerbToggleTense,
  onVerbToggleAspect,
  onVerbToggleVoice,
  onVerbToggleProVerb,
  onVerbConfirm,
}: AnalysisPanelProps) => {
  if (!selectedWord || !answer) {
    return (
      <aside className="glass-panel rounded-xl px-3 py-1.5 flex items-center justify-center text-center h-11">
        <p className="text-[11px] text-muted-foreground font-kr">
          단어를 선택하면 분석 메뉴가 활성화됩니다.
        </p>
      </aside>
    );
  }

  const posCorrect = posStatus === "correct";
  const isNoun = posCorrect && answer.pos === "명사";
  const isVerb = posCorrect && answer.pos === "동사";

  return (
    <aside className="glass-panel rounded-xl px-3 py-1.5">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        {/* Selected word */}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[9px] font-bold text-primary-glow uppercase tracking-widest">
            Sel
          </span>
          <span className="text-xs font-bold text-foreground truncate max-w-[160px]">
            "{selectedWord}"
          </span>
        </div>

        {/* LAYER 01 — 품사 */}
        <div className="flex items-center gap-1">
          {POS_LIST.map(({ key, circle, label, enabled }) => {
            const isSelected = pos === key;
            const isCorrect = isSelected && posCorrect;
            const isWrong = isSelected && posStatus === "wrong";
            const lockedOther = posCorrect && !isSelected;
            const disabled = !enabled || lockedOther;

            const trigger = (
              <button
                type="button"
                onClick={() => {
                  if (disabled) return;
                  onPosChange(key);
                }}
                disabled={disabled}
                title={enabled ? label : `${label} (준비 중)`}
                className={cn(
                  "inline-flex items-center gap-0.5 h-7 px-2 rounded-lg border text-[11px] font-bold font-kr transition-all",
                  "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
                  isCorrect && "bg-primary/10 text-primary border-primary/40",
                  isWrong && "border-destructive bg-destructive/10 text-destructive animate-pulse",
                  !enabled && "opacity-25 cursor-not-allowed",
                  lockedOther && "opacity-30 cursor-not-allowed",
                )}
              >
                <span className="font-mono text-[13px] leading-none">{circle}</span>
                <span>{label}</span>
              </button>
            );

            if (isCorrect && isNoun) {
              return (
                <Popover key={key} defaultOpen>
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={12}
                    avoidCollisions
                    className="w-[min(92vw,360px)] p-3 space-y-3 z-[60]"
                  >
                    <NounPanel
                      answer={answer as NounAnswer}
                      noun={noun}
                      onNounFormChange={onNounFormChange}
                      onNounElementChange={onNounElementChange}
                      onNounRoleChange={onNounRoleChange}
                    />
                  </PopoverContent>
                </Popover>
              );
            }

            if (isCorrect && isVerb) {
              return (
                <Popover key={key} defaultOpen>
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={12}
                    avoidCollisions
                    className="w-[min(92vw,360px)] p-3 space-y-3 z-[60]"
                  >
                    <VerbPanel
                      verb={verb}
                      onVerbToggleNumber={onVerbToggleNumber}
                      onVerbToggleTense={onVerbToggleTense}
                      onVerbToggleAspect={onVerbToggleAspect}
                      onVerbToggleVoice={onVerbToggleVoice}
                      onVerbToggleProVerb={onVerbToggleProVerb}
                      onVerbConfirm={onVerbConfirm}
                    />
                  </PopoverContent>
                </Popover>
              );
            }

            return <div key={key}>{trigger}</div>;
          })}
        </div>

        <div className="ml-auto">
          <StatusPill status={posStatus} />
        </div>
      </div>
    </aside>
  );
};

// ============================================================
// 명사 패널 (LAYER 02 → 03a → 03b)
// ============================================================
interface NounPanelProps {
  answer: NounAnswer;
  noun: NounProgress;
  onNounFormChange: (f: NounForm) => void;
  onNounElementChange: (e: SentenceElement) => void;
  onNounRoleChange: (r: string) => void;
}

const NounPanel = ({
  answer,
  noun,
  onNounFormChange,
  onNounElementChange,
  onNounRoleChange,
}: NounPanelProps) => {
  const formCorrect = noun.formStatus === "correct";
  const formOnlyMode =
    formCorrect &&
    !!noun.form &&
    (noun.form === "접SV" || (FORM_ONLY_ROLES[noun.form]?.length && answer.element === undefined));
  const elementUnlocked = formCorrect && !formOnlyMode;
  const elementCorrect = noun.elementStatus === "correct";
  const roleUnlocked = formCorrect && (formOnlyMode || elementCorrect);

  // role 옵션 계산
  const roleOptions = (() => {
    if (!noun.form) return [];
    if (formOnlyMode) return FORM_ONLY_ROLES[noun.form] ?? [];
    if (!noun.element) return [];
    const common = COMMON_ROLES_BY_ELEMENT[noun.element] ?? [];
    const bonus =
      FORM_BONUS_ROLES_BY_ELEMENT[noun.form]?.[noun.element] ?? [];
    return [...common, ...bonus];
  })();

  return (
    <>
      {/* LAYER 02 — 형태 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
            Layer 02 · 형태
          </p>
          <StatusPill status={noun.formStatus} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {NOUN_FORMS.map(({ key, circle, label }) => {
            const sel = noun.form === key;
            const ok = sel && noun.formStatus === "correct";
            const ng = sel && noun.formStatus === "wrong";
            return (
              <button
                key={key}
                type="button"
                onClick={() => onNounFormChange(key)}
                disabled={formCorrect && !sel}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold font-kr transition-all disabled:opacity-30",
                  ok && "bg-primary/15 text-primary border border-primary/40",
                  ng && "bg-destructive/10 text-destructive border border-destructive animate-pulse",
                  !sel && "bg-secondary text-foreground hover:bg-secondary/70 border border-transparent",
                )}
              >
                <span className="font-mono text-[12px] leading-none">{circle}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* LAYER 03a — 문장성분 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 font-kr",
              elementUnlocked ? "text-muted-foreground" : "text-muted-foreground/40",
            )}
          >
            {!elementUnlocked && <Lock className="size-2.5" />}
            Layer 03a · 문장성분
          </p>
          <StatusPill status={noun.elementStatus} />
        </div>
        {!formCorrect ? (
          <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
            형태 정답 후 열립니다.
          </p>
        ) : formOnlyMode ? (
          <p className="text-[11px] text-muted-foreground/70 italic font-kr px-1">
            — 형태 전용 (성분 단계 건너뜀)
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {ELEMENTS.map(({ key, label, colorClass }) => {
              const sel = noun.element === key;
              const ok = sel && noun.elementStatus === "correct";
              const ng = sel && noun.elementStatus === "wrong";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onNounElementChange(key)}
                  disabled={elementCorrect && !sel}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-30",
                    ok && colorClass,
                    ng && "border-destructive bg-destructive/10 text-destructive animate-pulse",
                    !sel && "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  <span className="font-mono">{key}</span>
                  <span className="font-kr">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LAYER 03b — 세부역할 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 font-kr",
              roleUnlocked ? "text-muted-foreground" : "text-muted-foreground/40",
            )}
          >
            {!roleUnlocked && <Lock className="size-2.5" />}
            Layer 03b · 세부역할
          </p>
          <StatusPill status={noun.roleStatus} />
        </div>
        {!roleUnlocked ? (
          <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
            이전 단계 정답 후 열립니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1 animate-in fade-in duration-200">
            {roleOptions.map((r) => {
              const sel = noun.role === r;
              const ok = sel && noun.roleStatus === "correct";
              const ng = sel && noun.roleStatus === "wrong";
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onNounRoleChange(r)}
                  disabled={noun.roleStatus === "correct" && !sel}
                  className={cn(
                    "px-2 py-1 rounded-md border text-[11px] font-bold font-kr transition-all disabled:opacity-30",
                    ok && "border-element-o bg-element-o-bg text-element-o",
                    ng && "border-destructive bg-destructive/10 text-destructive animate-pulse",
                    !sel && "border-border bg-card text-foreground hover:border-primary/30",
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {noun.roleStatus === "correct" && (
        <div className="rounded-xl bg-element-o-bg border border-element-o/30 p-2.5 text-center">
          <p className="text-[10px] font-bold text-element-o uppercase tracking-widest mb-0.5">
            Analysis Complete
          </p>
          <p className="text-xs font-bold text-foreground font-kr">
            {answer.koreanLabel}
          </p>
        </div>
      )}
    </>
  );
};

// ============================================================
// 동사 패널 (다중 선택 + ✱확정)
// ============================================================
interface VerbPanelProps {
  verb: VerbProgress;
  onVerbToggleNumber: (n: VerbNumber) => void;
  onVerbToggleTense: (t: VerbTense) => void;
  onVerbToggleAspect: (a: VerbAspect) => void;
  onVerbToggleVoice: () => void;
  onVerbToggleProVerb: () => void;
  onVerbConfirm: () => void;
}

const VERB_NUMBERS: VerbNumber[] = ["단수", "복수", "기타"];
const VERB_TENSES: VerbTense[] = ["현재", "과거", "미래"];
const VERB_ASPECTS: VerbAspect[] = ["진행", "완료"];

const VerbPanel = ({
  verb,
  onVerbToggleNumber,
  onVerbToggleTense,
  onVerbToggleAspect,
  onVerbToggleVoice,
  onVerbToggleProVerb,
  onVerbConfirm,
}: VerbPanelProps) => {
  const confirmed = verb.confirmStatus === "correct";
  const wrong = verb.confirmStatus === "wrong";

  const Row = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );

  const Chip = ({
    selected,
    onClick,
    children,
  }: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={confirmed}
      className={cn(
        "px-2 py-0.5 rounded-md text-[11px] font-bold font-kr border transition-all disabled:opacity-50",
        selected
          ? "bg-primary/15 text-primary border-primary/40"
          : "bg-card text-foreground border-border hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
          동사 분석 · 다중 선택
        </p>
        <StatusPill status={verb.confirmStatus} />
      </div>

      <div className="space-y-1.5">
        <Row label="수">
          {VERB_NUMBERS.map((n) => (
            <Chip key={n} selected={verb.number === n} onClick={() => onVerbToggleNumber(n)}>
              {n}
            </Chip>
          ))}
        </Row>
        <Row label="시제">
          {VERB_TENSES.map((t) => (
            <Chip key={t} selected={verb.tense === t} onClick={() => onVerbToggleTense(t)}>
              {t}
            </Chip>
          ))}
        </Row>
        <Row label="형">
          {VERB_ASPECTS.map((a) => (
            <Chip key={a} selected={verb.aspect.includes(a)} onClick={() => onVerbToggleAspect(a)}>
              {a}
            </Chip>
          ))}
        </Row>
        <Row label="태">
          <Chip selected={verb.voice} onClick={onVerbToggleVoice}>
            수동
          </Chip>
        </Row>
        <Row label="기타">
          <Chip selected={verb.proVerb} onClick={onVerbToggleProVerb}>
            대동사
          </Chip>
        </Row>
      </div>

      {wrong && (
        <p className="text-[10px] text-destructive font-bold font-kr text-center animate-pulse">
          선택을 다시 확인해 주세요.
        </p>
      )}

      <button
        type="button"
        onClick={onVerbConfirm}
        disabled={confirmed}
        className={cn(
          "w-full py-1.5 rounded-lg text-[11px] font-bold font-kr transition-all border",
          confirmed
            ? "bg-element-o-bg text-element-o border-element-o/40 cursor-default"
            : "bg-primary text-primary-foreground border-primary hover:opacity-90",
        )}
      >
        {confirmed ? "✓ 동사 분석 완료" : "✱ 동사 확정"}
      </button>
    </>
  );
};

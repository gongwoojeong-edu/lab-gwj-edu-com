import { cn } from "@/lib/utils";
import { Check, X, Lock } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ============================================================
// 정답 입력 모드 — wrong 상태/스타일 일괄 차단
// ============================================================
const AnswerInputModeContext = createContext(false);
export const AnswerInputModeProvider = AnswerInputModeContext.Provider;
const useAnswerInputMode = () => useContext(AnswerInputModeContext);
/** 정답 입력 모드면 "wrong" → "idle" 로 마스킹 */
const useMaskStatus = () => {
  const ans = useAnswerInputMode();
  return (s: StepStatus): StepStatus => (ans && s === "wrong" ? "idle" : s);
};
import type {
  WordAnswer,
  NounAnswer,
  VerbAnswer,
  AdjAnswer,
  AdvAnswer,
  EtcAnswer,
  POS,
  NounForm,
  AdjForm,
  AdvForm,
  AdvSubtype,
  EtcKind,
  SentenceElement,
  VerbNumber,
  VerbTense,
  VerbAspect,
} from "@/data/sentences";

export type StepStatus = "idle" | "correct" | "wrong";

// ============================================================
// 절 깊이 (1=주절 종속절, 2=절 안의 절, 3=3중 중첩) — 접SV form일 때만 의미 있음
// ============================================================
export type ClauseDepth = 1 | 2 | 3;

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
  clauseDepth?: ClauseDepth | null; // form === '접SV' 일 때만 의미 있음
}

// ============================================================
// 형용사 진행 상태
// ============================================================
export interface AdjProgress {
  form: AdjForm | null;
  element: "C" | "M" | null;
  role: string | null;
  formStatus: StepStatus;
  elementStatus: StepStatus;
  roleStatus: StepStatus;
  clauseDepth?: ClauseDepth | null;
}

// ============================================================
// 부사 진행 상태
// ============================================================
export interface AdvProgress {
  form: AdvForm | null;
  subtype: AdvSubtype | null;
  role: string | null;
  formStatus: StepStatus;
  subtypeStatus: StepStatus;
  roleStatus: StepStatus;
  clauseDepth?: ClauseDepth | null;
}

// ============================================================
// 기타 진행 상태
// ============================================================
export interface EtcProgress {
  kind: EtcKind | null;
  role: string | null;
  kindStatus: StepStatus;
  roleStatus: StepStatus;
}

// ============================================================
// 동사 진행 상태 (다중 선택)
// ============================================================
export interface VerbProgress {
  number: VerbNumber | null;
  tense: VerbTense | null;
  aspect: VerbAspect[];
  voice: boolean;
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
  onNounElementRole: (e: SentenceElement, r: string | null) => void;
  /** 절(접SV) 깊이 변경 — 명사절일 때만 호출됨 */
  onNounClauseDepthChange?: (d: ClauseDepth) => void;

  adj: AdjProgress;
  onAdjFormChange: (f: AdjForm) => void;
  onAdjElementChange: (e: "C" | "M") => void;
  onAdjRoleChange: (r: string) => void;
  onAdjElementRole: (e: "C" | "M", r: string | null) => void;
  onAdjClauseDepthChange?: (d: ClauseDepth) => void;

  adv: AdvProgress;
  onAdvFormChange: (f: AdvForm) => void;
  onAdvSubtypeChange: (s: AdvSubtype) => void;
  onAdvRoleChange: (r: string) => void;
  onAdvClauseDepthChange?: (d: ClauseDepth) => void;

  etc: EtcProgress;
  onEtcKindChange: (k: EtcKind) => void;
  onEtcRoleChange: (r: string) => void;

  verb: VerbProgress;
  onVerbToggleNumber: (n: VerbNumber) => void;
  onVerbToggleTense: (t: VerbTense) => void;
  onVerbToggleAspect: (a: VerbAspect) => void;
  onVerbToggleVoice: () => void;
  onVerbToggleProVerb: () => void;
  onVerbConfirm: () => void;

  // ===== Idiom / Phrase layer (Layer 9) — SVOC와 독립 =====
  idiomEnabled?: boolean;        // selectedWordIndices.length >= 1
  idiomExistingMeaning?: string; // 현재 선택 인덱스에 등록된 숙어가 있다면 의미
  onIdiomSave?: (meaning: string) => void;
  onIdiomRemove?: () => void;
  canErase?: boolean;
  onEraseSelection?: () => void;

  // ===== 수식 화살표 (Modifier Arrow) =====
  /** 형용사/M owner에서만 true → [수식 대상 지정] 버튼 노출 */
  canAssignModifierTarget?: boolean;
  /** 현재 selectedId가 pending source인지 — 버튼 ON/OFF 표시 */
  isPendingModifier?: boolean;
  /** 이미 target이 지정되어 있는지 — "지우기" 버튼 노출 */
  hasModifierTarget?: boolean;
  /** 현재 지정된 수식 대상 단어 텍스트 (지정 완료 상태에서 라벨로 표시) */
  currentModifierTargetLabel?: string | null;
  onAssignModifierTarget?: () => void;
  onClearModifierTarget?: () => void;
  onCancelPendingModifier?: () => void;

  // ===== 지시어 화살표 (Referent Arrow, 대명사 전용) =====
  /** POS=명사 owner일 때 true → [지시어 지정] 버튼 노출 */
  canAssignReferentTarget?: boolean;
  isPendingReferent?: boolean;
  hasReferentTarget?: boolean;
  /** 현재 지정된 지시 대상 단어 텍스트 */
  currentReferentTargetLabel?: string | null;
  onAssignReferentTarget?: () => void;
  onClearReferentTarget?: () => void;
  onCancelPendingReferent?: () => void;

  // ===== 정답 저장 워크플로우 =====
  answerInputMode?: boolean;
  ownerStatus?: "empty" | "dirty" | "saved";
  onSaveAnswer?: () => void;
  onDiscardAnswer?: () => void;
}

// ============================================================
// LAYER 01: 품사 (5종 모두 활성)
// ============================================================
const POS_LIST: { key: POS; circle: string; label: string }[] = [
  { key: "명사", circle: "ⓝ", label: "명사" },
  { key: "형용사", circle: "ⓐ", label: "형용사" },
  { key: "부사", circle: "ⓓ", label: "부사" },
  { key: "동사", circle: "ⓥ", label: "동사" },
  { key: "기타", circle: "ⓔ", label: "기타" },
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

// LAYER 02: 형용사 형태
const ADJ_FORMS: { key: AdjForm; circle: string; label: string }[] = [
  { key: "형용사", circle: "②", label: "형용사" },
  { key: "to V", circle: "⑥", label: "to V" },
  { key: "V-ing/PP", circle: "⑨", label: "V-ing/PP" },
  { key: "접SV", circle: "⑫", label: "접SV" },
  { key: "전N", circle: "⑭", label: "전N" },
];

// LAYER 02: 부사 형태
const ADV_FORMS: { key: AdvForm; circle: string; label: string }[] = [
  { key: "부사", circle: "③", label: "부사" },
  { key: "to V", circle: "⑦", label: "to V" },
  { key: "ing/pp", circle: "⑩", label: "ing/pp" },
  { key: "접SV", circle: "⑬", label: "접SV" },
  { key: "전N", circle: "⑮", label: "전N" },
];

// LAYER 02: 기타 종류
const ETC_KINDS: { key: EtcKind; label: string }[] = [
  { key: "비교", label: "비교" },
  { key: "의문문", label: "의문문" },
  { key: "감탄문", label: "감탄문" },
  { key: "명령문", label: "명령문" },
  { key: "접속", label: "접속" },
  { key: "가정법", label: "가정법" },
  { key: "도치/생략/동격", label: "도치/생략/동격" },
  { key: "삽입", label: "삽입" },
  { key: "부연", label: "부연" },
];

// ============================================================
// LAYER 03a: 문장성분 (명사용 4개)
// ============================================================
const ELEMENTS: { key: SentenceElement; label: string; colorClass: string }[] = [
  { key: "S", label: "주어", colorClass: "bg-element-s-bg text-element-s border-element-s/40" },
  { key: "O", label: "목적어", colorClass: "bg-element-o-bg text-element-o border-element-o/40" },
  { key: "C", label: "보어", colorClass: "bg-element-c-bg text-element-c border-element-c/40" },
  { key: "M", label: "수식어", colorClass: "bg-element-m-bg text-element-m border-element-m/40" },
];

// 형용사용 (C, M만)
const ADJ_ELEMENTS: { key: "C" | "M"; label: string; colorClass: string }[] = [
  { key: "C", label: "보어", colorClass: "bg-element-c-bg text-element-c border-element-c/40" },
  { key: "M", label: "수식어", colorClass: "bg-element-m-bg text-element-m border-element-m/40" },
];

// ============================================================
// LAYER 03b: 역할 옵션 표현
// ----
// RoleOption: 단일 버튼 또는 그룹(헤더 + 버튼 목록)
// 그룹의 header는 클릭 불가능한 라벨, items만 선택 가능
// ============================================================
export type RoleOption =
  | string
  | { header: string; items: string[] };

const COMMON_ROLES_BY_ELEMENT: Record<SentenceElement, RoleOption[]> = {
  S: ["주어", "대명사", "가주어", "진주어"],
  O: [
    "목적어(타동)",
    "대명사",
    "간접목적어",
    "직접목적어",
    "가목적어",
    "진목적어",
    "전치사의o",
    "to V의o",
    "V-ing의o",
  ],
  C: ["주격보어", "목적격보어", "대명사"],
  M: [],
};

const FORM_BONUS_ROLES_BY_ELEMENT: Partial<
  Record<NounForm, Partial<Record<SentenceElement, string[]>>>
> = {
  "to V": { S: ["의미상주어"] },
  "V-ing": { S: ["의미상주어"] },
};

const FORM_ONLY_ROLES: Partial<Record<NounForm, RoleOption[]>> = {
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
  // 명사절 — 5개 form × 3개 SVOC role(주어/목적어/보어) = 15 평탄 버튼
  // 라벨 자체가 부배지로 그대로 노출됨 (열 순서 유지)
  "접SV": [
    "that(주어)", "that(목적어)", "that(보어)",
    "whether/if(주어)", "whether/if(목적어)", "whether/if(보어)",
    "의문사(주어)", "의문사(목적어)", "의문사(보어)",
    "관대what(주어)", "관대what(목적어)", "관대what(보어)",
    "복합관대~ever(주어)", "복합관대~ever(목적어)", "복합관대~ever(보어)",
  ],
};

// ============================================================
// 형용사 세부역할 매핑
// ============================================================
const ADJ_ROLES_BY_FORM: Record<AdjForm, RoleOption[]> = {
  "형용사": ["형용사", "a주격보어", "a목적격보어", "a명사수식"],
  "to V": ["to 명사뒤수식", "be to부정사"],
  "V-ing/PP": [
    { header: "ing", items: ["명사앞수식", "명사뒤수식", "주격보어", "목적격보어"] },
    { header: "pp", items: ["명사앞수식", "명사뒤수식", "주격보어", "목적격보어"] },
  ],
  "접SV": [
    {
      header: "관대",
      items: ["주격", "목적격", "소유격", "전+RP", "계속적", "N of which", "N of whom"],
    },
    {
      header: "관부",
      items: ["where", "when", "why", "how", "that", "계속적"],
    },
  ],
  "전N": ["형용사 전치사구"],
};

// 형용사: element 단계 스킵하는 form (전N은 자동 M, 접SV는 자동 M, to V는 자동 M)
const ADJ_FORM_SKIPS_ELEMENT: Partial<Record<AdjForm, "C" | "M">> = {
  "전N": "M",
  "접SV": "M",
  "to V": "M",
  "V-ing/PP": "M",
};

// ============================================================
// 부사 세부역할 매핑
// ============================================================
const ADV_ROLES_BY_FORM: Record<AdvForm, RoleOption[]> = {
  "부사": ["부사"],
  "to V": ["목적", "감정의원인", "판단의근거", "조건", "결과", "형용사수식"],
  "ing/pp": ["분사구문", "완료", "부정", "독립", "with N 형부"],
  "접SV": ["시간", "장소", "이유", "조건", "양보", "결과", "양태", "비교"],
  "전N": ["부사 전치사구"],
};

// 부사 form일 때만 보이는 sub-type 행
const ADV_SUBTYPES: { key: "일반부사" | "접속부사"; label: string }[] = [
  { key: "일반부사", label: "일반부사" },
  { key: "접속부사", label: "접속부사" },
];

// ============================================================
// 기타 세부역할 매핑
// ============================================================
const ETC_ROLES_BY_KIND: Record<EtcKind, RoleOption[]> = {
  "비교": ["원급", "비교급", "최상급", "비교구문"],
  "의문문": ["의문대명사", "의문부사", "의문형용사", "간접의문"],
  "감탄문": ["What 감탄", "How 감탄"],
  "명령문": ["긍정명령", "부정명령", "Let 명령"],
  "접속": ["병렬", "상관", "유사관대"],
  "가정법": [
    {
      header: "가정법",
      items: ["가정법 현재", "가정법 과거", "가정법 과거완료", "혼합가정법"],
    },
    {
      header: "I wish",
      items: ["가정법 과거", "가정법 과거완료"],
    },
    {
      header: "as if",
      items: ["가정법 과거", "가정법 과거완료"],
    },
  ],
  "도치/생략/동격": [
    { header: "기타", items: ["도치", "생략", "동격"] },
  ],
  "삽입": ["어구 삽입", "절 삽입", "콤마 삽입"],
  "부연": ["부연 설명", "동격 부연", "추가 정보"],
};

const StatusPill = ({ status }: { status: StepStatus }) => {
  const mask = useMaskStatus();
  const s = mask(status);
  if (s === "correct")
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-element-o uppercase tracking-wider">
        <Check className="size-3" /> OK
      </span>
    );
  if (s === "wrong")
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
  onNounElementRole,
  onNounClauseDepthChange,
  adj,
  onAdjFormChange,
  onAdjElementChange,
  onAdjRoleChange,
  onAdjElementRole,
  onAdjClauseDepthChange,
  adv,
  onAdvFormChange,
  onAdvSubtypeChange,
  onAdvRoleChange,
  onAdvClauseDepthChange,
  etc,
  onEtcKindChange,
  onEtcRoleChange,
  verb,
  onVerbToggleNumber,
  onVerbToggleTense,
  onVerbToggleAspect,
  onVerbToggleVoice,
  onVerbToggleProVerb,
  onVerbConfirm,
  idiomEnabled,
  idiomExistingMeaning,
  onIdiomSave,
  onIdiomRemove,
  canErase,
  onEraseSelection,
  canAssignModifierTarget,
  isPendingModifier,
  hasModifierTarget,
  currentModifierTargetLabel,
  onAssignModifierTarget,
  onClearModifierTarget,
  onCancelPendingModifier,
  canAssignReferentTarget,
  isPendingReferent,
  hasReferentTarget,
  currentReferentTargetLabel,
  onAssignReferentTarget,
  onClearReferentTarget,
  onCancelPendingReferent,
  ownerStatus = "empty",
  onSaveAnswer,
  onDiscardAnswer,
}: AnalysisPanelProps) => {
  const answerInputMode = useAnswerInputMode();
  const hasSelection = !!selectedWord;

  // ALWAYS-ON 정책: selection 이 없어도 메뉴/지우개/관용구 카드는 항상 노출.
  // 원본 answer 의 pos 는 표시에 사용하지 않는다 (AI 추론 0%).
  const currentPos = pos ?? null;
  const posCorrect = posStatus === "correct";
  const isNoun = currentPos === "명사";
  const isVerb = currentPos === "동사";
  const isAdj = currentPos === "형용사";
  const isAdv = currentPos === "부사";
  const isEtc = currentPos === "기타";

  // 수식/지시어 props 묶음 — Noun/Adj 패널 내부 Layer 3 하단에서 사용
  const modifierSectionProps = {
    canAssignModifierTarget: !!canAssignModifierTarget,
    isPendingModifier: !!isPendingModifier,
    hasModifierTarget: !!hasModifierTarget,
    currentModifierTargetLabel: currentModifierTargetLabel ?? null,
    onAssignModifierTarget,
    onClearModifierTarget,
    onCancelPendingModifier,
  };
  const referentSectionProps = {
    canAssignReferentTarget: !!canAssignReferentTarget,
    isPendingReferent: !!isPendingReferent,
    hasReferentTarget: !!hasReferentTarget,
    currentReferentTargetLabel: currentReferentTargetLabel ?? null,
    onAssignReferentTarget,
    onClearReferentTarget,
    onCancelPendingReferent,
  };

  const renderSubPanel = () => {
    if (isNoun)
      return (
        <NounPanel
          answer={(answer as NounAnswer | null) ?? undefined}
          noun={noun}
          onNounFormChange={onNounFormChange}
          onNounElementChange={onNounElementChange}
          onNounRoleChange={onNounRoleChange}
          onNounElementRole={onNounElementRole}
          onClauseDepthChange={onNounClauseDepthChange}
          referent={referentSectionProps}
        />
      );
    if (isVerb)
      return (
        <VerbPanel
          verb={verb}
          onVerbToggleNumber={onVerbToggleNumber}
          onVerbToggleTense={onVerbToggleTense}
          onVerbToggleAspect={onVerbToggleAspect}
          onVerbToggleVoice={onVerbToggleVoice}
          onVerbToggleProVerb={onVerbToggleProVerb}
          onVerbConfirm={onVerbConfirm}
        />
      );
    if (isAdj)
      return (
        <AdjPanel
          answer={(answer as AdjAnswer | null) ?? undefined}
          adj={adj}
          onAdjFormChange={onAdjFormChange}
          onAdjElementChange={onAdjElementChange}
          onAdjRoleChange={onAdjRoleChange}
          onAdjElementRole={onAdjElementRole}
          onClauseDepthChange={onAdjClauseDepthChange}
          modifier={modifierSectionProps}
        />
      );
    if (isAdv)
      return (
        <AdvPanel
          answer={(answer as AdvAnswer | null) ?? undefined}
          adv={adv}
          onAdvFormChange={onAdvFormChange}
          onAdvSubtypeChange={onAdvSubtypeChange}
          onAdvRoleChange={onAdvRoleChange}
          onClauseDepthChange={onAdvClauseDepthChange}
        />
      );
    if (isEtc)
      return (
        <EtcPanel
          answer={(answer as EtcAnswer | null) ?? undefined}
          etc={etc}
          onEtcKindChange={onEtcKindChange}
          onEtcRoleChange={onEtcRoleChange}
          idiomEnabled={!!idiomEnabled}
          idiomSurface={selectedWord ?? ""}
          idiomExistingMeaning={idiomExistingMeaning}
          onIdiomSave={onIdiomSave}
          onIdiomRemove={onIdiomRemove}
          answerInputMode={answerInputMode}
        />
      );
    return null;
  };

  return (
    <aside className="glass-panel rounded-xl px-3 py-1.5 max-h-[calc(100dvh-4rem)] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
      {/* 정답 저장/취소 컨트롤은 화면 상단 헤더(정답 초기화 옆)로 이동됨 */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        {/* Selected word — 항상 노출, 미선택 시 placeholder */}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[9px] font-bold text-primary-glow uppercase tracking-widest">
            Sel
          </span>
          <span
            className={cn(
              "text-xs font-bold truncate max-w-[180px]",
              hasSelection ? "text-foreground" : "text-muted-foreground/60 italic font-kr",
            )}
          >
            {hasSelection ? `"${selectedWord}"` : "단어를 선택하세요"}
          </span>
        </div>

        {/* LAYER 01 — 품사 (항상 활성, 완료 후에도 재선택 허용) */}
        <div className="flex items-center gap-1 flex-wrap">
          {POS_LIST.map(({ key, circle, label }) => {
            const isSelected = pos === key;
            const isCorrect = isSelected && posCorrect;
            const isWrong = !answerInputMode && isSelected && posStatus === "wrong";
            const disabled = !hasSelection;

            const trigger = (
              <button
                type="button"
                onClick={() => {
                  if (disabled) return;
                  onPosChange(key);
                }}
                disabled={disabled}
                title={label}
                className={cn(
                  "inline-flex items-center gap-0.5 h-7 px-2 rounded-lg border text-[11px] font-bold font-kr transition-all",
                  "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
                  isCorrect && "bg-primary/10 text-primary border-primary/40",
                  isWrong && "border-destructive bg-destructive/10 text-destructive animate-pulse",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span className="font-mono text-[13px] leading-none">{circle}</span>
                <span>{label}</span>
              </button>
            );

            if (hasSelection && isSelected && (isNoun || isVerb || isAdj || isAdv || isEtc)) {
              return (
                <Popover key={key} defaultOpen>
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={12}
                    avoidCollisions
                    className="w-[min(92vw,380px)] p-3 space-y-3 z-[60] max-h-[80dvh] overflow-y-auto"
                  >
                    {renderSubPanel()}
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

      {/* 수식/지시어 UI는 NounPanel/AdjPanel 내부 Layer 3 하단으로 이동됨 */}

    </aside>
  );
};

// IdiomSection은 외부(Index.tsx 하단 toolbar)에서 직접 사용

// ============================================================
// Idiom / Phrase Section — SVOC 분석과 독립
// 항상 패널 하단에 별도 카드로 노출. enabled=false 면 안내 메시지만 표시.
// ============================================================
export const IdiomSection = ({
  surface,
  existingMeaning,
  answerInputMode,
  onSave,
  onRemove,
  enabled,
}: {
  surface: string;
  existingMeaning?: string;
  answerInputMode: boolean;
  onSave?: (meaning: string) => void;
  onRemove?: () => void;
  enabled: boolean;
}) => {
  const [draft, setDraft] = useState(existingMeaning ?? "");

  // existingMeaning이 외부에서 바뀌면 입력값 동기화
  useEffect(() => {
    setDraft(existingMeaning ?? "");
  }, [existingMeaning]);

  const handleSave = () => {
    const m = draft.trim();
    if (!m) return;
    onSave?.(m);
  };

  return (
    <div className="mt-2 pt-2 border-t-2 border-dashed border-border">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest font-kr"
          style={{ color: "hsl(var(--idiom-fg))" }}
        >
          🟩 관용구 / Phrase
        </p>
        {existingMeaning && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: "hsl(var(--idiom-bg))",
              color: "hsl(var(--idiom-fg))",
            }}
          >
            등록됨
          </span>
        )}
      </div>

      {!enabled ? (
        <p className="text-[10px] text-muted-foreground/70 italic font-kr px-1">
          단어를 선택하면 관용구/특수 의미로 등록할 수 있습니다.
        </p>
      ) : answerInputMode ? (
        <div className="space-y-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder={`"${surface}" 의미 (예: ~을 떠맡다)`}
            className="w-full h-8 px-2 rounded-md border border-border bg-background text-[12px] font-kr focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.trim()}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors disabled:opacity-40"
              style={{
                background: "hsl(var(--idiom-bg))",
                color: "hsl(var(--idiom-fg))",
                border: "1px solid hsl(var(--idiom-border))",
              }}
            >
              {existingMeaning ? "수정 저장" : "🟩 관용구 저장"}
            </button>
            {existingMeaning && (
              <button
                type="button"
                onClick={onRemove}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold font-kr bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      ) : existingMeaning ? (
        <p
          className="text-[12px] font-kr px-2 py-1 rounded"
          style={{
            background: "hsl(var(--idiom-bg))",
            color: "hsl(var(--idiom-fg))",
          }}
        >
          {existingMeaning}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground/70 italic font-kr px-1">
          정답 입력 모드에서 관용구로 등록할 수 있습니다.
        </p>
      )}
    </div>
  );
};

// ============================================================
// 공용: 관계(수식 / 지시어) 지정 섹션 — 명사/형용사 패널 내부 Layer 3 하단에 위치
// ============================================================
interface RelationSectionProps {
  /** "modifier" | "referent" — variant에 따라 라벨/색만 다름 */
  variant: "modifier" | "referent";
  isPending: boolean;
  hasTarget: boolean;
  currentTargetLabel: string | null;
  onAssign?: () => void;
  onClear?: () => void;
  onCancel?: () => void;
}
const RelationSection = ({
  variant,
  isPending,
  hasTarget,
  currentTargetLabel,
  onAssign,
  onClear,
  onCancel,
}: RelationSectionProps) => {
  const isMod = variant === "modifier";
  const title = isMod ? "수식 화살표" : "지시어 (대명사)";
  const assignLabel = isMod ? "→ 수식 대상 지정" : "→ 지시어 지정";
  const pendingMsg = isMod
    ? "🎯 본문에서 수식받을 단어를 클릭하세요"
    : "👉 본문에서 가리키는 단어를 클릭하세요";
  const accent = isMod
    ? "bg-primary/10 text-primary hover:bg-primary/20"
    : "bg-muted text-foreground hover:bg-muted/70";
  const targetText = isMod
    ? "text-primary font-bold"
    : "text-foreground font-bold underline decoration-dotted";

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border/40 pt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
          {title}
        </span>
        {isPending ? (
          <>
            <span className={cn("text-[11px] font-bold font-kr animate-pulse", isMod ? "text-primary" : "text-foreground")}>
              {pendingMsg}
            </span>
            <button
              type="button"
              onClick={onCancel ?? onAssign}
              className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/70"
              title="지정 취소 (ESC)"
            >
              취소
            </button>
          </>
        ) : hasTarget ? (
          <>
            <span className="text-[11px] font-semibold text-foreground font-kr">
              대상:{" "}
              <span className={targetText}>{currentTargetLabel ?? "?"}</span>
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={onAssign}
                className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border border-transparent", accent)}
                title="다른 단어로 변경"
              >
                ↻ 변경
              </button>
              <button
                type="button"
                onClick={onClear}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/70"
                title="삭제"
              >
                ✕ 삭제
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onAssign}
            className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border border-transparent", accent)}
            title="버튼을 누른 뒤 본문 단어를 클릭하세요"
          >
            {assignLabel}
          </button>
        )}
      </div>
    </div>
  );
};

// 패널에 주입되는 관계 섹션 props
type ModifierSectionInput = {
  canAssignModifierTarget: boolean;
  isPendingModifier: boolean;
  hasModifierTarget: boolean;
  currentModifierTargetLabel: string | null;
  onAssignModifierTarget?: () => void;
  onClearModifierTarget?: () => void;
  onCancelPendingModifier?: () => void;
};
type ReferentSectionInput = {
  canAssignReferentTarget: boolean;
  isPendingReferent: boolean;
  hasReferentTarget: boolean;
  currentReferentTargetLabel: string | null;
  onAssignReferentTarget?: () => void;
  onClearReferentTarget?: () => void;
  onCancelPendingReferent?: () => void;
};

// ============================================================
// 명사 패널
// ============================================================
interface NounPanelProps {
  answer?: NounAnswer;
  noun: NounProgress;
  onNounFormChange: (f: NounForm) => void;
  onNounElementChange: (e: SentenceElement) => void;
  onNounRoleChange: (r: string) => void;
  onNounElementRole: (e: SentenceElement, r: string | null) => void;
  onClauseDepthChange?: (d: ClauseDepth) => void;
  referent?: ReferentSectionInput;
}

const NounPanel = ({
  answer,
  noun,
  onNounFormChange,
  onNounRoleChange,
  onNounElementRole,
  onClauseDepthChange,
  referent,
}: NounPanelProps) => {
  const formCorrect = noun.formStatus === "correct";
  const formOnlyMode =
    formCorrect &&
    !!noun.form &&
    (noun.form === "접SV" ||
      ((FORM_ONLY_ROLES[noun.form]?.length ?? 0) > 0 && noun.element == null));

  // 형태전용(접SV 등): 평탄 element-role 그리드 대신 기존 RoleRow 재사용
  const formOnlyRoleOptions = formOnlyMode && noun.form ? FORM_ONLY_ROLES[noun.form] ?? [] : [];

  // 평탄 element-role 그리드용 데이터 (S/O/C/M)
  const elementRoleGroups = !formCorrect || formOnlyMode || !noun.form
    ? []
    : (ELEMENTS.map(({ key, label, colorClass }) => {
        const common = COMMON_ROLES_BY_ELEMENT[key] ?? [];
        const bonus = FORM_BONUS_ROLES_BY_ELEMENT[noun.form!]?.[key] ?? [];
        return { element: key, label, colorClass, options: [...common, ...bonus] };
      }));

  // 지시어 섹션 노출 조건 — Index.tsx에서 canAssignReferentTarget를 명사 owner일 때 true로 제공.
  // 추가로 role이 "대명사"이거나 form/role이 비어있을 때도 노출 (사용자가 대상 지정 가능).
  const showReferent = !!referent?.canAssignReferentTarget;

  return (
    <>
      <FormRow
        label="Layer 02 · 형태"
        status={noun.formStatus}
        items={NOUN_FORMS}
        selected={noun.form}
        locked={false}
        onSelect={(k) => onNounFormChange(k as NounForm)}
      />
      {noun.form === "접SV" && onClauseDepthChange && (
        <ClauseDepthRow value={noun.clauseDepth ?? 1} onChange={onClauseDepthChange} />
      )}
      {formOnlyMode ? (
        <>
          <RoleRow
            unlocked
            status={noun.roleStatus}
            options={formOnlyRoleOptions}
            selected={noun.role}
            onSelect={onNounRoleChange}
          />
          {/* 결함 #3: 명사 to V/V-ing/접SV form에서도 M(수식어) 옵션을 보장 노출 */}
          <NounMShortcut
            selectedRole={noun.role}
            roleStatus={noun.roleStatus}
            onPick={() => onNounElementRole("M", null)}
          />
        </>
      ) : (
        <ElementRoleGrid
          unlocked={!!noun.form}
          element={noun.element}
          elementStatus={noun.elementStatus}
          role={noun.role}
          roleStatus={noun.roleStatus}
          groups={elementRoleGroups}
          onPick={(e, r) => onNounElementRole(e as SentenceElement, r)}
        />
      )}
      {/* Layer 3 하단: 지시어(대명사) 대상 지정 */}
      {showReferent && referent && (
        <RelationSection
          variant="referent"
          isPending={referent.isPendingReferent}
          hasTarget={referent.hasReferentTarget}
          currentTargetLabel={referent.currentReferentTargetLabel}
          onAssign={referent.onAssignReferentTarget}
          onClear={referent.onClearReferentTarget}
          onCancel={referent.onCancelPendingReferent}
        />
      )}
      {noun.roleStatus === "correct" && (
        <CompletionBlock label={noun.role ?? noun.form ?? "완료"} />
      )}
    </>
  );
};

// ============================================================
// 형용사 패널
// ============================================================
interface AdjPanelProps {
  answer?: AdjAnswer;
  adj: AdjProgress;
  onAdjFormChange: (f: AdjForm) => void;
  onAdjElementChange: (e: "C" | "M") => void;
  onAdjRoleChange: (r: string) => void;
  onAdjElementRole: (e: "C" | "M", r: string | null) => void;
  onClauseDepthChange?: (d: ClauseDepth) => void;
  modifier?: ModifierSectionInput;
}

const AdjPanel = ({
  answer,
  adj,
  onAdjFormChange,
  onAdjRoleChange,
  onAdjElementRole,
  onClauseDepthChange,
  modifier,
}: AdjPanelProps) => {
  const formCorrect = adj.formStatus === "correct";
  const skipsElement = adj.form ? !!ADJ_FORM_SKIPS_ELEMENT[adj.form] : false;
  const roleOptions = adj.form ? ADJ_ROLES_BY_FORM[adj.form] : [];

  // skipsElement (전N, 접SV, to V, V-ing/PP) → 평탄 그리드 대신 기존 RoleRow
  // 그 외 (형용사) → C/M 평탄 element-role 그리드
  const elementRoleGroups = !formCorrect || skipsElement
    ? []
    : ADJ_ELEMENTS.map(({ key, label, colorClass }) => {
        let options: RoleOption[];
        if (key === "C") {
          options = roleOptions.filter(
            (o) => typeof o === "string" && /보어/.test(o),
          );
        } else {
          options = roleOptions.filter(
            (o) => typeof o === "string" && !/보어/.test(o),
          );
        }
        return { element: key, label, colorClass, options };
      });

  // 형용사가 선택되면 항상 수식선 지정 UI를 노출 (form/role 무관).
  // 명사수식 role을 골랐다면 강조 라벨이 추가되고, 그렇지 않아도 수동으로 수식 대상을 지정 가능.
  const showModifier = !!modifier;

  return (
    <>
      <FormRow
        label="Layer 02 · 형태"
        status={adj.formStatus}
        items={ADJ_FORMS}
        selected={adj.form}
        locked={false}
        onSelect={(k) => onAdjFormChange(k as AdjForm)}
      />
      {adj.form === "접SV" && onClauseDepthChange && (
        <ClauseDepthRow value={adj.clauseDepth ?? 1} onChange={onClauseDepthChange} />
      )}
      {skipsElement ? (
        <RoleRow
          unlocked={!!adj.form}
          status={adj.roleStatus}
          options={roleOptions}
          selected={adj.role}
          onSelect={onAdjRoleChange}
        />
      ) : (
        <ElementRoleGrid
          unlocked={!!adj.form}
          element={adj.element}
          elementStatus={adj.elementStatus}
          role={adj.role}
          roleStatus={adj.roleStatus}
          groups={elementRoleGroups}
          onPick={(e, r) => onAdjElementRole(e as "C" | "M", r)}
        />
      )}
      {/* Layer 3 하단: 수식 대상 명사 지정 */}
      {showModifier && modifier && (
        <RelationSection
          variant="modifier"
          isPending={modifier.isPendingModifier}
          hasTarget={modifier.hasModifierTarget}
          currentTargetLabel={modifier.currentModifierTargetLabel}
          onAssign={modifier.onAssignModifierTarget}
          onClear={modifier.onClearModifierTarget}
          onCancel={modifier.onCancelPendingModifier}
        />
      )}
      {adj.roleStatus === "correct" && (
        <CompletionBlock label={adj.role ?? adj.form ?? "완료"} />
      )}
    </>
  );
};

// ============================================================
// 평탄 Element-Role 그리드 (Layer 03 통합)
// 좌측: element 라벨 (헤더, 클릭 불가)
// 우측: 해당 element의 role 버튼들 — 한 번 클릭으로 element+role 동시 저장
// M (수식어): role 후보가 없으면 라벨 자체가 클릭 가능 → 즉시 완료
// ============================================================
const ElementRoleGrid = ({
  unlocked,
  element,
  elementStatus: rawElementStatus,
  role,
  roleStatus: rawRoleStatus,
  groups,
  onPick,
}: {
  unlocked: boolean;
  element: string | null;
  elementStatus: StepStatus;
  role: string | null;
  roleStatus: StepStatus;
  groups: { element: string; label: string; colorClass: string; options: RoleOption[] }[];
  onPick: (element: string, role: string | null) => void;
}) => {
  const mask = useMaskStatus();
  const elementStatus = mask(rawElementStatus);
  const roleStatus = mask(rawRoleStatus);
  const done = roleStatus === "correct";

  if (!unlocked) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 font-kr text-muted-foreground/40">
          <Lock className="size-2.5" />
          Layer 03 · 성분 / 세부역할
        </p>
        <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
          형태 정답 후 열립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
          Layer 03 · 성분 / 세부역할
        </p>
        <StatusPill status={done ? "correct" : roleStatus === "wrong" || elementStatus === "wrong" ? "wrong" : "idle"} />
      </div>
      <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-1">
        {groups.map((g) => {
          const isM = g.element === "M";

          // M with no role options → single button
          if (isM && g.options.length === 0) {
            const sel = element === g.element;
            const ok = sel && elementStatus === "correct";
            const ng = sel && elementStatus === "wrong";
            return (
              <div
                key={g.element}
                className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0"
              >
                <span className="shrink-0 w-[58px] pt-1 text-[11px] font-bold font-kr text-muted-foreground select-none flex items-center gap-1">
                  <span className="font-mono text-[12px]">{g.element}</span>
                  {g.label}
                </span>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => onPick(g.element, null)}
                    disabled={false}
                    className={cn(
                      "px-2 py-1 rounded-md text-[11px] font-bold font-kr transition-all disabled:opacity-30",
                      ok && g.colorClass,
                      ng && "bg-destructive/10 text-destructive border-destructive animate-pulse",
                      !sel && "bg-secondary/60 text-foreground hover:bg-primary/10",
                    )}
                  >
                    수식어 (즉시 완료)
                  </button>
                </div>
              </div>
            );
          }

          // 옵션 평탄화: '/'로 split
          const buttons: { value: string; display: string }[] = [];
          g.options.forEach((opt) => {
            if (typeof opt === "string") {
              const parts = opt.split("/").map((p) => p.trim()).filter(Boolean);
              if (parts.length <= 1) buttons.push({ value: opt, display: opt });
              else parts.forEach((p) => buttons.push({ value: p, display: p }));
            } else {
              opt.items.forEach((item) => {
                item
                  .split("/")
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .forEach((p) =>
                    buttons.push({ value: `${opt.header} ${p}`, display: `${opt.header} ${p}` }),
                  );
              });
            }
          });

          if (buttons.length === 0) return null;

          return (
            <div
              key={g.element}
              className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0"
            >
              <span className="shrink-0 w-[58px] pt-1 text-[11px] font-bold font-kr text-muted-foreground select-none flex items-center gap-1">
                <span className="font-mono text-[12px]">{g.element}</span>
                {g.label}
              </span>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-1">
                {buttons.map((b) => {
                  const sel = element === g.element && role === b.value;
                  const ok = sel && done;
                  const ng = sel && (roleStatus === "wrong" || elementStatus === "wrong");
                  return (
                    <button
                      key={`${g.element}-${b.value}`}
                      type="button"
                      onClick={() => onPick(g.element, b.value)}
                      disabled={false}
                      className={cn(
                        "px-2 py-1 rounded-md text-[11px] font-bold font-kr transition-all disabled:opacity-30 text-left",
                        ok && "bg-primary/15 text-primary",
                        ng && "bg-destructive/10 text-destructive animate-pulse",
                        !sel && "bg-secondary/60 text-foreground hover:bg-primary/10",
                      )}
                    >
                      {b.display}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// 부사 패널 (LAYER 02 → 03 / 03a 없음)
// ============================================================
interface AdvPanelProps {
  answer?: AdvAnswer;
  adv: AdvProgress;
  onAdvFormChange: (f: AdvForm) => void;
  onAdvSubtypeChange: (s: AdvSubtype) => void;
  onAdvRoleChange: (r: string) => void;
  onClauseDepthChange?: (d: ClauseDepth) => void;
}

const AdvPanel = ({
  answer,
  adv,
  onAdvFormChange,
  onAdvSubtypeChange,
  onAdvRoleChange,
  onClauseDepthChange,
}: AdvPanelProps) => {
  const mask = useMaskStatus();
  const advRoleStatus = mask(adv.roleStatus);
  const done = advRoleStatus === "correct";

  // form 클릭 → 자동으로 form + (필요시 subtype은 별도 클릭) + role 한번에
  const handlePick = (form: AdvForm, value: string, subtype?: AdvSubtype) => {
    if (adv.form !== form) onAdvFormChange(form);
    if (subtype && adv.subtype !== subtype) {
      setTimeout(() => onAdvSubtypeChange(subtype), 0);
    }
    setTimeout(() => onAdvRoleChange(value), 0);
  };

  return (
    <>
      {adv.form === "접SV" && onClauseDepthChange && (
        <ClauseDepthRow value={adv.clauseDepth ?? 1} onChange={onClauseDepthChange} />
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
            Layer 02·03 · 형태 / 세부역할
          </p>
          <StatusPill status={advRoleStatus} />
        </div>
        <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-1">
          {ADV_FORMS.map(({ key: form, circle, label: formLabel }) => {
            const options = ADV_ROLES_BY_FORM[form] ?? [];
            const isPlainAdverb = form === "부사";

            const buttons: { value: string; display: string; subtype?: AdvSubtype }[] = [];
            if (isPlainAdverb) {
              // 일반부사 / 접속부사를 직접 두 개 버튼으로
              ADV_SUBTYPES.forEach((s) => {
                buttons.push({ value: s.label, display: s.label, subtype: s.key });
              });
            } else {
              options.forEach((opt) => {
                if (typeof opt === "string") {
                  opt
                    .split("/")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .forEach((p) => buttons.push({ value: p, display: p }));
                } else {
                  opt.items.forEach((item) =>
                    item
                      .split("/")
                      .map((p) => p.trim())
                      .filter(Boolean)
                      .forEach((p) =>
                        buttons.push({ value: `${opt.header} ${p}`, display: p }),
                      ),
                  );
                }
              });
            }

            return (
              <div
                key={form}
                className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0"
              >
                <span
                  className="shrink-0 w-[64px] pt-1 text-[11px] font-bold font-kr text-muted-foreground select-none flex items-center gap-1"
                  aria-hidden
                >
                  {circle && <span className="font-mono text-[12px]">{circle}</span>}
                  {formLabel}
                </span>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {buttons.map((b) => {
                    const sel = adv.form === form && adv.role === b.value;
                    const ok = sel && done;
                    const ng = sel && advRoleStatus === "wrong";
                    return (
                      <button
                        key={`${form}-${b.value}`}
                        type="button"
                        onClick={() => handlePick(form, b.value, b.subtype)}
                        disabled={false}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] font-bold font-kr transition-all disabled:opacity-30 text-left",
                          ok && "bg-primary/15 text-primary",
                          ng && "bg-destructive/10 text-destructive animate-pulse",
                          !sel && "bg-secondary/60 text-foreground hover:bg-primary/10",
                        )}
                      >
                        {b.display}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {done && <CompletionBlock label={adv.role ?? adv.form ?? "완료"} />}
    </>
  );
};

// ============================================================
// 기타 패널 (LAYER 02 종류 → LAYER 03 세부)
// ============================================================
interface EtcPanelProps {
  answer?: EtcAnswer;
  etc: EtcProgress;
  onEtcKindChange: (k: EtcKind) => void;
  onEtcRoleChange: (r: string) => void;
  // 관용구 통합
  idiomEnabled: boolean;
  idiomSurface: string;
  idiomExistingMeaning?: string;
  onIdiomSave?: (meaning: string) => void;
  onIdiomRemove?: () => void;
  answerInputMode: boolean;
}

const EtcPanel = ({
  answer,
  etc,
  onEtcKindChange,
  onEtcRoleChange,
  idiomEnabled,
  idiomSurface,
  idiomExistingMeaning,
  onIdiomSave,
  onIdiomRemove,
  answerInputMode,
}: EtcPanelProps) => {
  const mask = useMaskStatus();
  const etcRoleStatus = mask(etc.roleStatus);
  const done = etcRoleStatus === "correct";

  // 한 번 클릭으로 kind + role 동시 설정
  const handlePick = (kind: EtcKind, value: string) => {
    if (etc.kind !== kind) onEtcKindChange(kind);
    // kind change가 비동기일 수 있어, 다음 tick에 role 설정
    setTimeout(() => onEtcRoleChange(value), 0);
  };

  return (
    <>
      {/* 관용구 등록 — 기타 패널 상단 */}
      <IdiomSection
        surface={idiomSurface}
        existingMeaning={idiomExistingMeaning}
        answerInputMode={answerInputMode}
        onSave={onIdiomSave}
        onRemove={onIdiomRemove}
        enabled={idiomEnabled}
      />
      <div className="space-y-1 mt-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
            Layer 02·03 · 종류 / 세부역할
          </p>
          <StatusPill status={etcRoleStatus} />
        </div>
        <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-1">
          {ETC_KINDS.map(({ key: kind, label: kindLabel }) => {
            const options = ETC_ROLES_BY_KIND[kind] ?? [];
            // 평탄화: 모든 옵션을 { value, display } 버튼 목록으로
            const buttons: { value: string; display: string; group?: string }[] = [];
            options.forEach((opt) => {
              if (typeof opt === "string") {
                opt
                  .split("/")
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .forEach((p) => buttons.push({ value: p, display: p }));
              } else {
                opt.items.forEach((item) => {
                  item
                    .split("/")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .forEach((p) =>
                      buttons.push({
                        value: `${opt.header} ${p}`,
                        display: p,
                        group: opt.header,
                      }),
                    );
                });
              }
            });

            // group이 있는 경우 group별로 묶기
            const grouped = new Map<string | undefined, typeof buttons>();
            buttons.forEach((b) => {
              const arr = grouped.get(b.group) ?? [];
              arr.push(b);
              grouped.set(b.group, arr);
            });

            return (
              <div
                key={kind}
                className="flex items-start gap-2 py-1 border-b border-border/40 last:border-0"
              >
                {/* 좌측 고정 헤더 (클릭 불가) */}
                <span
                  className="shrink-0 w-[58px] pt-1 text-[11px] font-bold font-kr text-muted-foreground select-none"
                  aria-hidden
                >
                  {kindLabel}
                </span>
                {/* 우측 버튼 그리드 */}
                <div className="flex-1 space-y-1">
                  {Array.from(grouped.entries()).map(([groupHeader, items]) => (
                    <div key={groupHeader ?? "_flat"} className="flex items-start gap-1.5">
                      {groupHeader && (
                        <span className="shrink-0 w-[52px] pt-1 text-[10px] font-semibold font-kr text-muted-foreground/70 select-none">
                          {groupHeader}
                        </span>
                      )}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {items.map((b) => {
                          const sel = etc.kind === kind && etc.role === b.value;
                          const ok = sel && done;
                          const ng = sel && etcRoleStatus === "wrong";
                          return (
                            <button
                              key={`${kind}-${b.value}`}
                              type="button"
                              onClick={() => handlePick(kind, b.value)}
                              disabled={false}
                              className={cn(
                                "px-2 py-1 rounded-md text-[11px] font-bold font-kr transition-all disabled:opacity-30 text-left",
                                ok && "bg-primary/15 text-primary",
                                ng && "bg-destructive/10 text-destructive animate-pulse",
                                !sel && "bg-secondary/60 text-foreground hover:bg-primary/10",
                              )}
                            >
                              {b.display}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {done && <CompletionBlock label={etc.role ?? etc.kind ?? "완료"} />}
    </>
  );
};

// ============================================================
// 공통 Row 컴포넌트
// ============================================================
// 절 깊이 토글 — 접SV form일 때만 노출. 깊이별 색상 자동 배정.
// ============================================================
const CLAUSE_DEPTH_CLASSES: Record<ClauseDepth, string> = {
  1: "bg-element-s-bg text-element-s border-element-s/40",
  2: "bg-element-o-bg text-element-o border-element-o/40",
  3: "bg-element-c-bg text-element-c border-element-c/40",
};

const ClauseDepthRow = ({
  value,
  onChange,
}: {
  value: ClauseDepth;
  onChange: (d: ClauseDepth) => void;
}) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
      절 깊이 (중첩 단계)
    </p>
    <div className="flex gap-1">
      {([1, 2, 3] as ClauseDepth[]).map((d) => {
        const sel = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-bold font-kr border transition-all",
              sel
                ? CLAUSE_DEPTH_CLASSES[d]
                : "bg-card text-muted-foreground border-border hover:border-primary/40",
            )}
            title={d === 1 ? "종속절" : d === 2 ? "절 안의 절" : "3중 중첩"}
          >
            깊이 {d}
          </button>
        );
      })}
    </div>
  </div>
);

// ============================================================
interface FormItem {
  key: string;
  circle?: string;
  label: string;
}

const FormRow = ({
  label,
  status: rawStatus,
  items,
  selected,
  locked,
  onSelect,
}: {
  label: string;
  status: StepStatus;
  items: FormItem[];
  selected: string | null;
  locked: boolean;
  onSelect: (k: string) => void;
}) => {
  const mask = useMaskStatus();
  const status = mask(rawStatus);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
          {label}
        </p>
        <StatusPill status={status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ key, circle, label: l }) => {
          const sel = selected === key;
          const ok = sel && status === "correct";
          const ng = sel && status === "wrong";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={locked && !sel}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold font-kr transition-all border disabled:opacity-30",
                ok && "bg-primary/15 text-primary border-primary/40",
                ng && "bg-destructive/10 text-destructive border-destructive animate-pulse",
                !sel && "bg-secondary text-foreground border-transparent hover:bg-secondary/70",
              )}
            >
              {circle && <span className="font-mono text-[12px] leading-none">{circle}</span>}
              <span>{l}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ElementRow = ({
  items,
  selected,
  status: rawStatus,
  unlocked,
  formCorrect,
  skipMessage,
  elementCorrect,
  onSelect,
}: {
  items: { key: string; label: string; colorClass: string }[];
  selected: string | null;
  status: StepStatus;
  unlocked: boolean;
  formCorrect: boolean;
  skipMessage?: string;
  elementCorrect: boolean;
  onSelect: (k: string) => void;
}) => {
  const mask = useMaskStatus();
  const status = mask(rawStatus);
  return (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <p
        className={cn(
          "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 font-kr",
          unlocked ? "text-muted-foreground" : "text-muted-foreground/40",
        )}
      >
        {!unlocked && <Lock className="size-2.5" />}
        Layer 03a · 문장성분
      </p>
      <StatusPill status={status} />
    </div>
    {!formCorrect ? (
      <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
        형태 정답 후 열립니다.
      </p>
    ) : skipMessage ? (
      <p className="text-[11px] text-muted-foreground/70 italic font-kr px-1">
        {skipMessage}
      </p>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ key, label, colorClass }) => {
          const sel = selected === key;
          const ok = sel && status === "correct";
          const ng = sel && status === "wrong";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={false}
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
  );
};

const RoleRow = ({
  unlocked,
  status: rawStatus,
  options,
  selected,
  onSelect,
}: {
  unlocked: boolean;
  status: StepStatus;
  options: RoleOption[];
  selected: string | null;
  onSelect: (r: string) => void;
}) => {
  const mask = useMaskStatus();
  const status = mask(rawStatus);
  const renderButton = (value: string, displayLabel: string) => {
    const sel = selected === value;
    const ok = sel && status === "correct";
    const ng = sel && status === "wrong";
    return (
      <button
        key={value}
        type="button"
        onClick={() => onSelect(value)}
        disabled={false}
        className={cn(
          "px-2 py-1 rounded-md text-[11px] font-bold font-kr transition-all disabled:opacity-30 text-left",
          ok && "bg-primary/15 text-primary",
          ng && "bg-destructive/10 text-destructive animate-pulse",
          !sel && "bg-secondary/60 text-foreground hover:bg-primary/10",
        )}
      >
        {displayLabel}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 font-kr",
            unlocked ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          {!unlocked && <Lock className="size-2.5" />}
          Layer 03b · 세부역할
        </p>
        <StatusPill status={status} />
      </div>
      {!unlocked ? (
        <p className="text-[11px] text-muted-foreground/60 italic font-kr px-1">
          이전 단계 정답 후 열립니다.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 animate-in fade-in duration-200">
          {/* Flat (ungrouped) values — slash로 구분된 문자열은 개별 버튼으로 분리 */}
          {(() => {
            const flat = options.filter((o): o is string => typeof o === "string");
            if (flat.length === 0) return null;
            // 각 flat 문자열을 '/'로 split → 개별 버튼
            const buttons: { value: string; label: string }[] = [];
            flat.forEach((s) => {
              const parts = s.split("/").map((p) => p.trim()).filter(Boolean);
              if (parts.length <= 1) {
                buttons.push({ value: s, label: s });
              } else {
                parts.forEach((p) => buttons.push({ value: p, label: p }));
              }
            });
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {buttons.map((b) => renderButton(b.value, b.label))}
              </div>
            );
          })()}

          {/* Grouped sections: non-clickable header + grid of items */}
          {options
            .filter(
              (o): o is { header: string; items: string[] } => typeof o !== "string",
            )
            .map((group) => (
              <div
                key={group.header}
                className="flex items-start gap-2 py-0.5"
              >
                <span
                  className="shrink-0 min-w-[44px] pt-1 text-[11px] font-bold font-kr text-muted-foreground select-none"
                  aria-hidden
                >
                  {group.header}
                </span>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {group.items.flatMap((item) => {
                    // 그룹 아이템도 '/' 분리 지원
                    const parts = item.split("/").map((p) => p.trim()).filter(Boolean);
                    const list = parts.length <= 1 ? [item] : parts;
                    return list.map((p) => {
                      const value = `${group.header} ${p}`;
                      return renderButton(value, p);
                    });
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const CompletionBlock = ({ label }: { label: string }) => (
  <div className="rounded-xl bg-element-o-bg border border-element-o/30 p-2.5 text-center">
    <p className="text-[10px] font-bold text-element-o uppercase tracking-widest mb-0.5">
      Analysis Complete
    </p>
    <p className="text-xs font-bold text-foreground font-kr">{label}</p>
  </div>
);

// ============================================================
// 동사 패널
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

// VerbPanel 내부에서 정의되어 있던 Row/Chip 컴포넌트를 외부로 분리.
// (내부 정의 시 매 렌더마다 새 함수 reference로 인식되어 unmount/remount 가
//  반복되며 onClick 이벤트가 손실되는 문제가 있었음 — 결함 #2 원인.)
const VerbRow = ({
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

const VerbChip = ({
  selected,
  confirmed,
  onClick,
  children,
}: {
  selected: boolean;
  confirmed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-md text-xs font-bold font-kr border transition-all min-h-[32px] min-w-[44px]",
      selected
        ? "bg-primary/15 text-primary border-primary/40"
        : "bg-card text-foreground border-border hover:border-primary/40 active:bg-primary/10",
      confirmed && !selected && "opacity-80",
    )}
  >
    {children}
  </button>
);

const VerbPanel = ({
  verb,
  onVerbToggleNumber,
  onVerbToggleTense,
  onVerbToggleAspect,
  onVerbToggleVoice,
  onVerbToggleProVerb,
  onVerbConfirm,
}: VerbPanelProps) => {
  const mask = useMaskStatus();
  const verbConfirmStatus = mask(verb.confirmStatus);
  const confirmed = verbConfirmStatus === "correct";
  const wrong = verbConfirmStatus === "wrong";

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
          동사 분석 · 다중 선택
        </p>
        <StatusPill status={verbConfirmStatus} />
      </div>

      <div className="space-y-1.5">
        <VerbRow label="수">
          {VERB_NUMBERS.map((n) => (
            <VerbChip
              key={n}
              selected={verb.number === n}
              confirmed={confirmed}
              onClick={() => onVerbToggleNumber(n)}
            >
              {n}
            </VerbChip>
          ))}
        </VerbRow>
        <VerbRow label="시제">
          {VERB_TENSES.map((t) => (
            <VerbChip
              key={t}
              selected={verb.tense === t}
              confirmed={confirmed}
              onClick={() => onVerbToggleTense(t)}
            >
              {t}
            </VerbChip>
          ))}
        </VerbRow>
        <VerbRow label="형">
          {VERB_ASPECTS.map((a) => (
            <VerbChip
              key={a}
              selected={verb.aspect.includes(a)}
              confirmed={confirmed}
              onClick={() => onVerbToggleAspect(a)}
            >
              {a}
            </VerbChip>
          ))}
        </VerbRow>
        <VerbRow label="태">
          <VerbChip selected={verb.voice} confirmed={confirmed} onClick={onVerbToggleVoice}>
            수동
          </VerbChip>
        </VerbRow>
        <VerbRow label="기타">
          <VerbChip selected={verb.proVerb} confirmed={confirmed} onClick={onVerbToggleProVerb}>
            대동사
          </VerbChip>
        </VerbRow>
      </div>

      {wrong && (
        <p className="text-[10px] text-destructive font-bold font-kr text-center animate-pulse">
          선택을 다시 확인해 주세요.
        </p>
      )}

      <button
        type="button"
        onClick={onVerbConfirm}
        className={cn(
          "w-full py-1.5 rounded-lg text-[11px] font-bold font-kr transition-all border",
          confirmed
            ? "bg-element-o-bg text-element-o border-element-o/40 hover:opacity-90"
            : "bg-primary text-primary-foreground border-primary hover:opacity-90",
        )}
      >
        {confirmed ? "✓ 동사 분석 완료 (다시 확정)" : "✱ 동사 확정"}
      </button>
    </>
  );
};

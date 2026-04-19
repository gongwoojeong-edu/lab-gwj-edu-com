import { cn } from "@/lib/utils";
import { Check, X, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
// 형용사 진행 상태
// ============================================================
export interface AdjProgress {
  form: AdjForm | null;
  element: "C" | "M" | null;
  role: string | null;
  formStatus: StepStatus;
  elementStatus: StepStatus;
  roleStatus: StepStatus;
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

  adj: AdjProgress;
  onAdjFormChange: (f: AdjForm) => void;
  onAdjElementChange: (e: "C" | "M") => void;
  onAdjRoleChange: (r: string) => void;

  adv: AdvProgress;
  onAdvFormChange: (f: AdvForm) => void;
  onAdvSubtypeChange: (s: AdvSubtype) => void;
  onAdvRoleChange: (r: string) => void;

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
  S: ["주어", "가주어", "진주어"],
  O: [
    "목적어(타동)",
    "간접목적어",
    "직접목적어",
    "가목적어",
    "진목적어",
    "전치사의o",
    "to V의o",
    "V-ing의o",
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
  "접SV": [
    { header: "명사절", items: ["that", "whether/if", "의SV", "관대what", "복합관대~ever"] },
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
  adj,
  onAdjFormChange,
  onAdjElementChange,
  onAdjRoleChange,
  adv,
  onAdvFormChange,
  onAdvSubtypeChange,
  onAdvRoleChange,
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
  const isAdj = posCorrect && answer.pos === "형용사";
  const isAdv = posCorrect && answer.pos === "부사";
  const isEtc = posCorrect && answer.pos === "기타";

  const renderSubPanel = () => {
    if (isNoun)
      return (
        <NounPanel
          answer={answer as NounAnswer}
          noun={noun}
          onNounFormChange={onNounFormChange}
          onNounElementChange={onNounElementChange}
          onNounRoleChange={onNounRoleChange}
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
          answer={answer as AdjAnswer}
          adj={adj}
          onAdjFormChange={onAdjFormChange}
          onAdjElementChange={onAdjElementChange}
          onAdjRoleChange={onAdjRoleChange}
        />
      );
    if (isAdv)
      return (
        <AdvPanel
          answer={answer as AdvAnswer}
          adv={adv}
          onAdvFormChange={onAdvFormChange}
          onAdvSubtypeChange={onAdvSubtypeChange}
          onAdvRoleChange={onAdvRoleChange}
        />
      );
    if (isEtc)
      return (
        <EtcPanel
          answer={answer as EtcAnswer}
          etc={etc}
          onEtcKindChange={onEtcKindChange}
          onEtcRoleChange={onEtcRoleChange}
        />
      );
    return null;
  };

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
        <div className="flex items-center gap-1 flex-wrap">
          {POS_LIST.map(({ key, circle, label }) => {
            const isSelected = pos === key;
            const isCorrect = isSelected && posCorrect;
            const isWrong = isSelected && posStatus === "wrong";
            const lockedOther = posCorrect && !isSelected;
            const disabled = lockedOther;

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
                  lockedOther && "opacity-30 cursor-not-allowed",
                )}
              >
                <span className="font-mono text-[13px] leading-none">{circle}</span>
                <span>{label}</span>
              </button>
            );

            if (isCorrect && (isNoun || isVerb || isAdj || isAdv || isEtc)) {
              return (
                <Popover key={key} defaultOpen>
                  <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={12}
                    avoidCollisions
                    className="w-[min(92vw,380px)] p-3 space-y-3 z-[60]"
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
    </aside>
  );
};

// ============================================================
// 명사 패널
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
    (noun.form === "접SV" ||
      ((FORM_ONLY_ROLES[noun.form]?.length ?? 0) > 0 && answer.element === undefined));
  const elementUnlocked = formCorrect && !formOnlyMode;
  const elementCorrect = noun.elementStatus === "correct";
  const roleUnlocked = formCorrect && (formOnlyMode || elementCorrect);

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
      <FormRow
        label="Layer 02 · 형태"
        status={noun.formStatus}
        items={NOUN_FORMS}
        selected={noun.form}
        locked={formCorrect}
        onSelect={(k) => onNounFormChange(k as NounForm)}
      />
      <ElementRow
        items={ELEMENTS}
        selected={noun.element}
        status={noun.elementStatus}
        unlocked={elementUnlocked}
        formCorrect={formCorrect}
        skipMessage={formOnlyMode ? "— 형태 전용 (성분 단계 건너뜀)" : undefined}
        elementCorrect={elementCorrect}
        onSelect={(e) => onNounElementChange(e as SentenceElement)}
      />
      <RoleRow
        unlocked={roleUnlocked}
        status={noun.roleStatus}
        options={roleOptions}
        selected={noun.role}
        onSelect={onNounRoleChange}
      />
      {noun.roleStatus === "correct" && (
        <CompletionBlock label={answer.koreanLabel} />
      )}
    </>
  );
};

// ============================================================
// 형용사 패널
// ============================================================
interface AdjPanelProps {
  answer: AdjAnswer;
  adj: AdjProgress;
  onAdjFormChange: (f: AdjForm) => void;
  onAdjElementChange: (e: "C" | "M") => void;
  onAdjRoleChange: (r: string) => void;
}

const AdjPanel = ({
  answer,
  adj,
  onAdjFormChange,
  onAdjElementChange,
  onAdjRoleChange,
}: AdjPanelProps) => {
  const formCorrect = adj.formStatus === "correct";
  const skipsElement = adj.form ? !!ADJ_FORM_SKIPS_ELEMENT[adj.form] : false;
  const elementUnlocked = formCorrect && !skipsElement;
  const elementCorrect = adj.elementStatus === "correct";
  const roleUnlocked = formCorrect && (skipsElement || elementCorrect);
  const roleOptions = adj.form ? ADJ_ROLES_BY_FORM[adj.form] : [];

  return (
    <>
      <FormRow
        label="Layer 02 · 형태"
        status={adj.formStatus}
        items={ADJ_FORMS}
        selected={adj.form}
        locked={formCorrect}
        onSelect={(k) => onAdjFormChange(k as AdjForm)}
      />
      <ElementRow
        items={ADJ_ELEMENTS}
        selected={adj.element}
        status={adj.elementStatus}
        unlocked={elementUnlocked}
        formCorrect={formCorrect}
        skipMessage={skipsElement ? "— 형태에 따라 성분 단계 자동 건너뜀" : undefined}
        elementCorrect={elementCorrect}
        onSelect={(e) => onAdjElementChange(e as "C" | "M")}
      />
      <RoleRow
        unlocked={roleUnlocked}
        status={adj.roleStatus}
        options={roleOptions}
        selected={adj.role}
        onSelect={onAdjRoleChange}
      />
      {adj.roleStatus === "correct" && (
        <CompletionBlock label={answer.koreanLabel} />
      )}
    </>
  );
};

// ============================================================
// 부사 패널 (LAYER 02 → 03 / 03a 없음)
// ============================================================
interface AdvPanelProps {
  answer: AdvAnswer;
  adv: AdvProgress;
  onAdvFormChange: (f: AdvForm) => void;
  onAdvSubtypeChange: (s: AdvSubtype) => void;
  onAdvRoleChange: (r: string) => void;
}

const AdvPanel = ({
  answer,
  adv,
  onAdvFormChange,
  onAdvSubtypeChange,
  onAdvRoleChange,
}: AdvPanelProps) => {
  const done = adv.roleStatus === "correct";

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
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
            Layer 02·03 · 형태 / 세부역할
          </p>
          <StatusPill status={adv.roleStatus} />
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
                    const ng = sel && adv.roleStatus === "wrong";
                    return (
                      <button
                        key={`${form}-${b.value}`}
                        type="button"
                        onClick={() => handlePick(form, b.value, b.subtype)}
                        disabled={done && !sel}
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
      {done && <CompletionBlock label={answer.koreanLabel} />}
    </>
  );
};

// ============================================================
// 기타 패널 (LAYER 02 종류 → LAYER 03 세부)
// ============================================================
interface EtcPanelProps {
  answer: EtcAnswer;
  etc: EtcProgress;
  onEtcKindChange: (k: EtcKind) => void;
  onEtcRoleChange: (r: string) => void;
}

const EtcPanel = ({
  answer,
  etc,
  onEtcKindChange,
  onEtcRoleChange,
}: EtcPanelProps) => {
  const done = etc.roleStatus === "correct";

  // 한 번 클릭으로 kind + role 동시 설정
  const handlePick = (kind: EtcKind, value: string) => {
    if (etc.kind !== kind) onEtcKindChange(kind);
    // kind change가 비동기일 수 있어, 다음 tick에 role 설정
    setTimeout(() => onEtcRoleChange(value), 0);
  };

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
            Layer 02·03 · 종류 / 세부역할
          </p>
          <StatusPill status={etc.roleStatus} />
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
                          const ng = sel && etc.roleStatus === "wrong";
                          return (
                            <button
                              key={`${kind}-${b.value}`}
                              type="button"
                              onClick={() => handlePick(kind, b.value)}
                              disabled={done && !sel}
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
      {done && <CompletionBlock label={answer.koreanLabel} />}
    </>
  );
};

// ============================================================
// 공통 Row 컴포넌트
// ============================================================
interface FormItem {
  key: string;
  circle?: string;
  label: string;
}

const FormRow = ({
  label,
  status,
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
}) => (
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

const ElementRow = ({
  items,
  selected,
  status,
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
}) => (
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
);

const RoleRow = ({
  unlocked,
  status,
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
  const renderButton = (value: string, displayLabel: string) => {
    const sel = selected === value;
    const ok = sel && status === "correct";
    const ng = sel && status === "wrong";
    return (
      <button
        key={value}
        type="button"
        onClick={() => onSelect(value)}
        disabled={status === "correct" && !sel}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AnalysisPanel,
  AnswerInputModeProvider,
  IdiomSection,
  type NounProgress,
  type AdjProgress,
  type AdvProgress,
  type EtcProgress,
  type VerbProgress,
  type StepStatus,
} from "@/components/analyzer/AnalysisPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KoreanHintButton } from "@/components/analyzer/KoreanHintButton";
import { AdminHintToggle } from "@/components/analyzer/AdminHintToggle";
import {
  SENTENCES,
  INTERNAL_OBJECT_ROLES,
  type POS,
  type NounForm,
  type AdjForm,
  type AdvForm,
  type AdvSubtype,
  type EtcKind,
  type SentenceElement,
  type VerbNumber,
  type VerbTense,
  type VerbAspect,
  type NounAnswer,
  type VerbAnswer,
  type AdjAnswer,
  type AdvAnswer,
  type EtcAnswer,
  type WordAnswer,
} from "@/data/sentences";
import { loadSentenceByCode } from "@/lib/sentenceSource";
import {
  GWJ_ACADEMY_NAME,
  GWJ_SYNTAX_PRODUCT_NAME,
} from "@/lib/gwj-brand";
import { cn } from "@/lib/utils";
import { Pencil, RotateCcw, MoreHorizontal, PanelRightOpen, Eraser, X, Save } from "lucide-react";
import { AiExtractButton } from "@/components/analyzer/AiExtractButton";
import { ExtractedWordsPanel } from "@/components/analyzer/ExtractedWordsPanel";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  loadCustomAnswers,
  upsertCustomAnswer,
  removeCustomAnswer,
  clearCustomAnswers,
  saveCustomAnswers,
  mergeAnswer,
  loadSavedOwners,
  saveSavedOwners,
  hydrateCustomAnswersFromCloud,
  setLocalStorageDisabled,
  type CustomAnswerMap,
} from "@/lib/customAnswers";
import {
  loadIdioms,
  upsertIdiom,
  removeIdiom,
  findIdiomCoveringIndex,
  findIdiomByIndices,
  getAllIdiomsFlat,
  hydrateIdiomsFromCloud,
  type IdiomMap,
  type IdiomMark,
} from "@/lib/idioms";
import {
  loadModifierTargets,
  upsertModifierTarget,
  removeModifierTargetBySource,
  getTargetsForSentence,
  hydrateModifierTargetsFromCloud,
  type ModifierTargetMap,
} from "@/lib/modifierTargets";
import {
  loadReferentTargets,
  upsertReferentTarget,
  removeReferentTargetBySource,
  getReferentsForSentence,
  hydrateReferentTargetsFromCloud,
  type ReferentTargetMap,
} from "@/lib/referentTargets";
import { useHintSettings } from "@/components/analyzer/HintSettingsContext";
import { Link } from "react-router-dom";
import { LEVEL_LABEL, formatSentenceCode } from "@/lib/levels";
import { useLevelLabels } from "@/hooks/useLevelLabels";
import { GraduationCap } from "lucide-react";
import { buildSubBadgeLabel, buildElementBadge, isClauseProgress } from "@/lib/labels";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookMarked } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth, signOut } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { StepProgressBar, type LearningStep } from "@/components/learning/StepProgressBar";
import { TranslationStep } from "@/components/learning/TranslationStep";
import { WordTestStep } from "@/components/learning/WordTestStep";
import { WordPreStep } from "@/components/learning/WordPreStep";
import { buildWordTest } from "@/lib/wordTestBuilder";
import {
  fetchSentenceProgress,
  upsertSentenceProgress,
  upsertOwnerProgress,
  fetchBadgeOffsets,
  upsertBadgeOffset,
} from "@/integrations/supabase/storage";

type WordProgress = {
  pos: POS | null;
  posStatus: StepStatus;
  noun: NounProgress;
  adj: AdjProgress;
  adv: AdvProgress;
  etc: EtcProgress;
  verb: VerbProgress;
  completed: boolean;
};

type FlushAnalysisResult = { total: number; saved: number; failed: number };

type AnalyzableToken = Extract<(typeof SENTENCES)[number]["tokens"][number], { type: "analyzable" }>;

const emptyNoun = (): NounProgress => ({
  form: null,
  element: null,
  role: null,
  formStatus: "idle",
  elementStatus: "idle",
  roleStatus: "idle",
});

const emptyAdj = (): AdjProgress => ({
  form: null,
  element: null,
  role: null,
  formStatus: "idle",
  elementStatus: "idle",
  roleStatus: "idle",
});

const emptyAdv = (): AdvProgress => ({
  form: null,
  subtype: null,
  role: null,
  formStatus: "idle",
  subtypeStatus: "idle",
  roleStatus: "idle",
});

const emptyEtc = (): EtcProgress => ({
  kind: null,
  role: null,
  kindStatus: "idle",
  roleStatus: "idle",
});

const emptyVerb = (): VerbProgress => ({
  number: null,
  tense: null,
  aspect: [],
  voice: false,
  proVerb: false,
  confirmStatus: "idle",
});

const emptyProgress = (): WordProgress => ({
  pos: null,
  posStatus: "idle",
  noun: emptyNoun(),
  adj: emptyAdj(),
  adv: emptyAdv(),
  etc: emptyEtc(),
  verb: emptyVerb(),
  completed: false,
});

  const progressToCloudPatch = (wp: WordProgress): Record<string, unknown> => {
    const base: Record<string, unknown> = { pos: wp.pos };
    if (wp.pos === "명사") {
      if (wp.noun.form) base.form = wp.noun.form;
      if (wp.noun.element) base.element = wp.noun.element;
      if (wp.noun.role) base.role = wp.noun.role;
    } else if (wp.pos === "형용사") {
      if (wp.adj.form) base.form = wp.adj.form;
      if (wp.adj.element) base.element = wp.adj.element;
      if (wp.adj.role) base.role = wp.adj.role;
    } else if (wp.pos === "부사") {
      if (wp.adv.form) base.form = wp.adv.form;
      if (wp.adv.subtype) base.subtype = wp.adv.subtype;
      if (wp.adv.role) base.role = wp.adv.role;
    } else if (wp.pos === "기타") {
      if (wp.etc.kind) base.kind = wp.etc.kind;
      if (wp.etc.role) base.role = wp.etc.role;
    } else if (wp.pos === "동사") {
      if (wp.verb.number) base.number = wp.verb.number;
      if (wp.verb.tense) base.tense = wp.verb.tense;
      base.aspect = wp.verb.aspect;
      base.voice = wp.verb.voice ? "수동" : undefined;
      base.proVerb = wp.verb.proVerb;
    }
    return base;
  };

const arraysEqualSet = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

// ============================================================
// 수식 화살표 SVG overlay — source/target token DOM 좌표를 측정해 곡선 path 렌더
// ============================================================
const OWNER_KEY_SEPARATOR_CONST = "::";
const SPAN_PREFIX_CONST = "span";

const ownerIdToWordIdx = (ownerId: string): number | null => {
  // 단일 토큰 owner: `${tokenId}::${idx}` → 마지막 segment가 idx
  const parts = ownerId.split(OWNER_KEY_SEPARATOR_CONST);
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
};

/** 마스터키 owner_id → 본문 wordUnits 인덱스 목록 (위치 힌트 음영용, 정답 내용은 노출하지 않음) */
const ownerIdToSelectionIndices = (
  ownerId: string,
  wordUnits: { tokenId?: string | null }[],
): number[] => {
  if (ownerId.startsWith(`${SPAN_PREFIX_CONST}${OWNER_KEY_SEPARATOR_CONST}`)) {
    const parts = ownerId.split(OWNER_KEY_SEPARATOR_CONST);
    const range = parts[2];
    if (!range) return [];
    const [s, e] = range.split("-").map((n) => Number(n));
    if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
    const out: number[] = [];
    for (let i = s; i <= e; i++) out.push(i);
    return out;
  }
  const idx = ownerIdToWordIdx(ownerId);
  if (idx !== null) return [idx];
  const parts = ownerId.split(OWNER_KEY_SEPARATOR_CONST);
  const tid = parts.length > 1 ? parts.slice(0, -1).join(OWNER_KEY_SEPARATOR_CONST) : ownerId;
  const found = wordUnits.findIndex((u) => u.tokenId === tid);
  return found >= 0 ? [found] : [];
};

type ArrowKind = "modifier" | "referent";

const ArrowOverlay = ({
  showModifier,
  showReferent,
  modifierRelations,
  referentRelations,
  tokenRefs,
  containerRef,
  layoutVersion,
}: {
  showModifier: boolean;
  showReferent: boolean;
  modifierRelations: { source: string; target: string }[];
  referentRelations: { source: string; target: string }[];
  tokenRefs: Map<number, HTMLSpanElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  layoutVersion: number;
}) => {
  void layoutVersion;
  const container = containerRef.current;
  if (!container) return null;
  const cRect = container.getBoundingClientRect();

  type Arrow = {
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    key: string;
    kind: ArrowKind;
  };
  const arrows: Arrow[] = [];

  const collect = (
    rels: { source: string; target: string }[],
    kind: ArrowKind,
    show: boolean,
  ) => {
    if (!show) return;
    rels.forEach((rel) => {
      const sIdx = ownerIdToWordIdx(rel.source);
      const tIdx = ownerIdToWordIdx(rel.target);
      if (sIdx === null || tIdx === null) return;
      const sEl = tokenRefs.get(sIdx);
      const tEl = tokenRefs.get(tIdx);
      if (!sEl || !tEl) return;
      const sR = sEl.getBoundingClientRect();
      const tR = tEl.getBoundingClientRect();
      const sx = sR.left - cRect.left + sR.width / 2;
      const sy = sR.top - cRect.top;
      const tx = tR.left - cRect.left + tR.width / 2;
      const ty = tR.top - cRect.top;
      arrows.push({ sx, sy, tx, ty, key: `${kind}:${rel.source}->${rel.target}`, kind });
    });
  };
  collect(modifierRelations, "modifier", showModifier);
  collect(referentRelations, "referent", showReferent);

  if (arrows.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="arrow-head-modifier"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
        </marker>
        <marker
          id="arrow-head-referent"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
        </marker>
      </defs>
      {arrows.map(({ sx, sy, tx, ty, key, kind }) => {
        const midX = (sx + tx) / 2;
        const dx = Math.abs(tx - sx);
        const lift = Math.min(60, Math.max(18, dx * 0.25));
        const peakY = Math.min(sy, ty) - lift;
        const isMod = kind === "modifier";
        return (
          <g key={key}>
            {!isMod && (
              <circle
                cx={sx}
                cy={sy - 2}
                r={2.5}
                fill="hsl(var(--muted-foreground))"
                opacity={0.85}
              />
            )}
            <path
              d={`M ${sx} ${sy - 2} Q ${midX} ${peakY} ${tx} ${ty - 2}`}
              stroke={isMod ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              strokeWidth={isMod ? 1.6 : 1.4}
              strokeDasharray={isMod ? "4 3" : "1 3"}
              strokeLinecap="round"
              fill="none"
              markerEnd={isMod ? "url(#arrow-head-modifier)" : "url(#arrow-head-referent)"}
              opacity={isMod ? 0.85 : 0.75}
            />
          </g>
        );
      })}
    </svg>
  );
};

const UserMenu = () => {
  const { user, roles } = useAuth();
  if (!user) return null;
  const studentNo = user.email?.split("@")[0] ?? "";
  const isTeacher = roles.includes("teacher") || roles.includes("admin");
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-card border border-border shadow-sm">
      <span className="text-[11px] font-mono font-bold">{studentNo}</span>
      {isTeacher && (
        <Link
          to="/teacher"
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          선생님 화면으로 이동
        </Link>
      )}
      <button
        type="button"
        onClick={() => signOut()}
        className="text-muted-foreground hover:text-destructive"
        title="로그아웃"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
};

interface IndexProps {
  /** 임베드 모드: 헤더/footer/학습진행 카드 숨김. SentenceLearn 같은 외부 컨테이너에서 분석기 UI만 사용. */
  embedMode?: boolean;
  /** 임베드 모드일 때 표시할 문장 id. 미지정 시 ?sentence= 쿼리 또는 다음 학습 문장 폴백. */
  embedSentenceId?: string;
  /** 임베드 모드에서 분석 완료(모든 단어 completed)가 감지될 때 호출. */
  onAnalysisDone?: () => void;
  /** 힌트 모드: 직전 시도에서 마스터키와 불일치였던 owner_id 집합 — 살짝 강조 */
  hintWrongOwnerIds?: Set<string>;
  /**
   * 학생 모드: 정답 라벨 노출 차단.
   * - localStorage/cloud customAnswers hydrate 차단
   * - 정답 입력 모드, 선생님 모드 배지, AdminHintToggle 등 admin UI 숨김
   * - 학생이 클릭한 owner만 progress가 채워짐 → 클릭 전엔 품사/배지 미노출
   * - 마스터키가 있으면 owner 위치만 옅은 음영으로 힌트 (정답 내용은 숨김)
   */
  studentMode?: boolean;
  /** 분석 진행률(0~1) 변화 콜백 — 외부 게이트에서 사용. meta.hasMaster 로 라벨 결정 */
  onAnalysisProgress?: (
    rate: number,
    meta: {
      hasMaster: boolean;
      filled: number;
      total: number;
      /** 마스터키에 명시 지정된 "필수 분석" owner 수 (0이면 비율 게이트 사용) */
      requiredTotal: number;
      /** 그중 학생이 분석을 채운 수 */
      requiredDone: number;
    },
  ) => void;
  /**
   * Hydrate 대상 user_id를 명시. 미지정 시 현재 로그인 사용자(기존 동작).
   * 비교/첨삭 화면에서 학생 또는 admin(마스터키) 데이터를 표시할 때 사용.
   */
  hydrateUserId?: string;
  /**
   * 비교 모드: 모든 편집/클릭/드래그/툴바/AnalysisPanel 비활성화.
   * 마우스 클릭 시 onOwnerToggle 콜백만 호출 (수동 마킹 토글용).
   */
  compareMode?: boolean;
  /** 빨강 음영 처리할 owner_id 집합 (마스터키와 불일치) */
  diffOwnerIds?: Set<string>;
  /** 회색 점선 처리할 owner_id 집합 (학생 미입력) */
  missingOwnerIds?: Set<string>;
  /** compareMode에서 owner 클릭 시 호출 — 수동 마킹 토글 */
  onOwnerToggle?: (ownerId: string) => void;
  /**
   * embedMode일 때도 admin 정답 입력 툴바(정답 입력/저장/초기화/AI추출/힌트 등)와
   * 지우개 도구바를 노출. 책장(PassageEditor) 같은 마스터키 편집 컨테이너에서 사용.
   */
  showStaffToolbar?: boolean;
  /**
   * 학생 모드에서 클라우드 hydrate 실패 시 호출.
   * 부모(SentenceLearn)에서 배너/토스트로 노출하고 [다시 불러오기] 버튼을 제공.
   * retry: 외부에서 재hydrate를 트리거하기 위한 함수 ID — 동일 sentence/user 한정.
   */
  onHydrationError?: (info: { message: string }) => void;
  /** 학생 분석 화면을 벗어나기 직전 현재 메모리 상태를 클라우드에 강제 저장한다. */
  onFlushStudentProgress?: ((flush: (() => Promise<FlushAnalysisResult>) | null) => void);
  /**
   * 외부에서 클라우드 hydrate를 강제로 다시 실행하기 위한 nonce.
   * 값이 바뀔 때마다 hydrate effect가 재실행된다.
   */
  reloadNonce?: number;
  /** [정답 저장 (전체)] 클릭으로 모든 patch가 커밋된 직후 호출 (1개 이상 저장됐을 때만). */
  onAfterCommitAll?: (savedCount: number) => void;
}

const Index = ({
  embedMode = false,
  embedSentenceId,
  onAnalysisDone,
  hintWrongOwnerIds,
  studentMode = false,
  onAnalysisProgress,
  hydrateUserId,
  compareMode = false,
  diffOwnerIds,
  missingOwnerIds,
  onOwnerToggle,
  showStaffToolbar = false,
  onHydrationError,
  onFlushStudentProgress,
  reloadNonce = 0,
  onAfterCommitAll,
}: IndexProps = {}) => {
  const isMobile = useIsMobile();
  const { displayStudent: levelDisplay } = useLevelLabels();
  const [sentenceIdx, setSentenceIdx] = useState(() => {
    if (embedSentenceId) {
      const idx = SENTENCES.findIndex((s) => s.id === embedSentenceId);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [autoLoading, setAutoLoading] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const sentence = SENTENCES[sentenceIdx];

  // 로그인 사용자의 다음 학습 문장 자동 선택
  // 우선순위: embedSentenceId prop > ?sentence= 쿼리 > resolveNextSentence
  useEffect(() => {
    let cancelled = false;
    setAutoLoading(true);

    const pickById = (id: string): boolean => {
      const idx = SENTENCES.findIndex((s) => s.id === id);
      if (idx >= 0) {
        setSentenceIdx(idx);
        setAutoLoading(false);
        return true;
      }
      return false;
    };

    if (embedSentenceId) {
      if (pickById(embedSentenceId)) return;
      void loadSentenceByCode(embedSentenceId).then((s) => {
        if (cancelled) return;
        if (s && pickById(embedSentenceId)) return;
        setAutoLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("sentence");
    if (requestedId) {
      if (pickById(requestedId)) return;
      void loadSentenceByCode(requestedId).then((s) => {
        if (cancelled) return;
        if (s && pickById(requestedId)) return;
        setAutoLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void import("@/lib/nextSentence").then(({ resolveNextSentence }) =>
      resolveNextSentence().then((res) => {
        if (cancelled) return;
        if (res.done || !res.sentence) {
          setAllDone(true);
        } else {
          const idx = SENTENCES.findIndex((s) => s.id === res.sentence!.id);
          if (idx >= 0) setSentenceIdx(idx);
        }
        setAutoLoading(false);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [embedSentenceId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, WordProgress>>({});
  const [studentSaveBusy, setStudentSaveBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 데스크톱에서 분석 패널 강제 숨김/복구 토글 (`?` 단축키 / 플로팅 버튼)
  const [analysisPanelHidden, setAnalysisPanelHidden] = useState(false);

  // ===== `?` (Shift+/) 단축키로 분석 패널 토글 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      }
      e.preventDefault();
      setAnalysisPanelHidden((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ===== 정답 입력 모드 =====
  // 관리자 편의: localStorage에 상태를 보존해 페이지/HMR 새로고침 후에도 유지
  const ANSWER_INPUT_MODE_KEY = "gts.answerInputMode";
  const [answerInputMode, _setAnswerInputMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(ANSWER_INPUT_MODE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const _persistAnswerInputMode = (v: boolean) => {
    _setAnswerInputMode(v);
    try {
      window.localStorage.setItem(ANSWER_INPUT_MODE_KEY, v ? "1" : "0");
    } catch {
      /* noop */
    }
  };
  // 모드 OFF 시 미저장 patch가 있으면 확인 다이얼로그
  const setAnswerInputMode = (v: boolean) => {
    if (!v && Object.keys(pendingPatchMap).length > 0) {
      setPendingNavAction(() => () => {
        setPendingPatchMap({});
        _persistAnswerInputMode(false);
      });
      return;
    }
    _persistAnswerInputMode(v);
  };
  const [customAnswers, setCustomAnswers] = useState<CustomAnswerMap>({});
  // 정답 입력 모드 — 미저장 patch 누적 (owner별)
  const [pendingPatchMap, setPendingPatchMap] = useState<Record<string, Record<string, unknown>>>({});
  // [정답 저장] 클릭으로 "분석 완료 확정"된 owner 집합
  const [savedOwnerSet, setSavedOwnerSet] = useState<Set<string>>(() => new Set());
  // 저장 확인 다이얼로그(다른 owner로 이동 / 모드 OFF 시 dirty 처리)
  const [pendingNavAction, setPendingNavAction] = useState<null | (() => void)>(null);

  // ===== 지우개 모드 (toggle) =====
  // ON: 완료 owner 클릭 시 즉시 삭제. 미분석 토큰 클릭은 무시.
  // OFF (기본): 완료 owner 클릭 → 다층 분석 진입. Shift+클릭은 삭제 단축키.
  const [eraserMode, setEraserMode] = useState(false);

  // ESC로 지우개 모드 해제 + body class 토글 (커스텀 커서 적용)
  useEffect(() => {
    document.body.classList.toggle("eraser-active", eraserMode);
    if (!eraserMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEraserMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [eraserMode]);
  // 언마운트 시 body class 정리
  useEffect(() => () => {
    document.body.classList.remove("eraser-active");
  }, []);

  // ===== 숙어 / Phrase store (SVOC와 독립) =====
  const [idiomMap, setIdiomMap] = useState<IdiomMap>({});

  // ===== 수식 화살표 (Modifier Target) =====
  const [modifierMap, setModifierMap] = useState<ModifierTargetMap>({});
  /** [수식 대상 지정] 버튼이 켜진 source ownerId — 다음 단어 클릭이 target으로 캡처됨 */
  const [pendingModifierSource, setPendingModifierSource] = useState<string | null>(null);
  // ===== 지시어 화살표 (Referent Target, 대명사 전용) =====
  const [referentMap, setReferentMap] = useState<ReferentTargetMap>({});
  const [pendingReferentSource, setPendingReferentSource] = useState<string | null>(null);
  const { showModifierArrows, showReferentArrows, isAdmin: ctxIsAdmin } = useHintSettings();
  // 학생 모드에서는 admin 전용 UI(정답 입력 토글/AdminHintToggle 등)만 숨김. role이 admin이어도 노출 차단.
  const isAdmin = !studentMode && ctxIsAdmin;
  // 본인 입력한 분석 결과는 학생 모드에서도 항상 표시되어야 한다.
  // (마스터키/타인 정답은 RLS로 자동 격리됨 → user_id=auth.uid() 본인 행만 hydrate)
  const showTeacherAnnotations = true;
  // 마스터키 owner_id 집합 — hasMaster 판정 + 학생 화면 위치 힌트(옅은 음영)용 (품사/배지는 노출 안 함)
  const [masterOwnerIds, setMasterOwnerIds] = useState<Set<string>>(new Set());
  // 마스터키에서 선생님이 "필수 분석"으로 명시 지정한 owner_id 집합
  const [masterRequiredIds, setMasterRequiredIds] = useState<Set<string>>(new Set());

  // ===== 학습 흐름 (Cloud) =====
  const [learningStep, setLearningStep] = useState<LearningStep>("pre");
  const [preDone, setPreDone] = useState(false);
  const [translationDone, setTranslationDone] = useState(false);
  const [wordTestDone, setWordTestDone] = useState(false);
  const [passedAt, setPassedAt] = useState<string | null>(null);

  // ===== 부배지 수동 드래그 오프셋 =====
  const [badgeOffsets, setBadgeOffsets] = useState<Record<string, number>>({});
  const dragStateRef = useRef<{ ownerId: string; startX: number; startDx: number } | null>(null);

  const persistBadgeOffset = (ownerId: string, dx: number) => {
    void upsertBadgeOffset(sentence.id, ownerId, dx).catch(() => {});
  };

  const handleBadgePointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    ownerId: string,
  ) => {
    if (compareMode) {
      e.stopPropagation();
      if (onOwnerToggle) onOwnerToggle(ownerId);
      return;
    }
    if (eraserMode) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragStateRef.current = {
      ownerId,
      startX: e.clientX,
      startDx: badgeOffsets[ownerId] ?? 0,
    };
  };

  const handleBadgePointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    const raw = st.startDx + (e.clientX - st.startX);
    const dx = Math.max(-150, Math.min(150, Math.round(raw)));
    setBadgeOffsets((prev) => ({ ...prev, [st.ownerId]: dx }));
  };

  const handleBadgePointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const finalDx = badgeOffsets[st.ownerId] ?? 0;
    persistBadgeOffset(st.ownerId, finalDx);
    dragStateRef.current = null;
  };

  const handleBadgeDoubleClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    ownerId: string,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setBadgeOffsets((prev) => {
      const n = { ...prev };
      delete n[ownerId];
      return n;
    });
    persistBadgeOffset(ownerId, 0);
  };

  // ESC: pending modifier/referent 즉시 취소
  useEffect(() => {
    if (!pendingModifierSource && !pendingReferentSource) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingModifierSource(null);
        setPendingReferentSource(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingModifierSource, pendingReferentSource]);

  // pending 중 다른 owner를 선택하면 pending 자동 취소
  useEffect(() => {
    if (pendingModifierSource && selectedId && selectedId !== pendingModifierSource) {
      setPendingModifierSource(null);
    }
    if (pendingReferentSource && selectedId && selectedId !== pendingReferentSource) {
      setPendingReferentSource(null);
    }
    // selectedId만 watch — pending source 변경 자체는 무시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    // 학생 모드는 localStorage를 신뢰하지 않는다.
    // - 다른 학생/관리자가 같은 브라우저를 썼을 때 잔재 키가 남아있을 위험
    // - v1→v2 마이그레이션 잔재
    // - cachedUserId 미준비 상태에서 __anon 폴백으로 빈 값을 읽는 사고
    // 위 사유로 학생 모드는 빈 상태로 시작 → 아래 클라우드 hydrate 결과만 신뢰한다.
    // 또한 글로벌 플래그를 켜서 customAnswers/idioms/modifier/referent 모듈 전체가
    // localStorage write를 건너뛰도록 한다(다른 학생 데이터 오염 차단).
    setLocalStorageDisabled(studentMode);
    if (studentMode) {
      // D(cacheCleanup) 임시 비활성화 — auth lock 충돌 우려로 보류.
      // 학생 모드는 이미 LS 우회(setLocalStorageDisabled) 상태이므로 잔재 노출 위험은 낮음.
      // if (hydrateUserId) {
      //   void import("@/lib/cacheCleanup").then(({ purgeForeignGwjKeys }) => {
      //     purgeForeignGwjKeys(hydrateUserId);
      //   });
      // }
      setCustomAnswers({});
      setIdiomMap({});
      setModifierMap({});
      setReferentMap({});
      setSavedOwnerSet(new Set());
      return;
    }
    // 선생님 모드는 새로고침 직후 작성 중 내용 보존을 위해 localStorage 캐시 사용 유지.
    setCustomAnswers(loadCustomAnswers());
    setIdiomMap(loadIdioms());
    setModifierMap(loadModifierTargets());
    setReferentMap(loadReferentTargets());
    setSavedOwnerSet(new Set(loadSavedOwners()));
  }, [studentMode, hydrateUserId]);

  // ===== sentence 변경 시 클라우드 hydration =====
  // owner_progress / modifier_relations / referent_relations 는 RLS로 user_id=auth.uid() 본인 행만 반환.
  // 따라서 학생은 본인 입력만, 관리자는 본인 입력(=마스터키)만 hydrate된다 → 데이터 누수 없음.
  // ⚠ 학생 모드에서는 이 hydrate가 단일 진실원이다. 실패 시 부모에 신호를 보낸다.
  useEffect(() => {
    let cancelled = false;
    const sid = sentence.id;
    // Promise.all은 하나라도 reject되면 전체 reject — 부분 실패 인지를 위해 allSettled 사용.
    Promise.allSettled([
      fetchSentenceProgress(sid),
      fetchBadgeOffsets(sid, hydrateUserId),
      hydrateCustomAnswersFromCloud(sid, hydrateUserId),
      hydrateModifierTargetsFromCloud(sid, hydrateUserId),
      hydrateReferentTargetsFromCloud(sid, hydrateUserId),
    ]).then((results) => {
      if (cancelled) return;
      const [progRes, offsRes, customsRes, modsRes, refsRes] = results;
      const prog = progRes.status === "fulfilled" ? progRes.value : null;
      const offs = offsRes.status === "fulfilled" ? offsRes.value : {};
      const customs = customsRes.status === "fulfilled" ? customsRes.value : null;
      const mods = modsRes.status === "fulfilled" ? modsRes.value : null;
      const refs = refsRes.status === "fulfilled" ? refsRes.value : null;

      // 학생 모드에서 핵심 hydrate(customs/mods/refs)가 하나라도 실패면 부모에 알린다.
      if (studentMode) {
        const failed = [customsRes, modsRes, refsRes].some((r) => r.status === "rejected");
        if (failed && onHydrationError) {
          onHydrationError({ message: "분석 데이터를 불러오지 못했어요." });
        }
      }

      // 분석 대상 단어가 없으면 pre/wordtest는 의미가 없으므로 자동 done 처리 →
      // 진행바가 '구문 분석'에서 시작되도록 보정
      const hasAnalyzableWords = sentence.tokens.some((t) => t.type === "analyzable");
      const pre = (prog?.pre_done ?? false) || !hasAnalyzableWords;
      const wt = (prog?.word_test_done ?? false) || !hasAnalyzableWords;
      const an = prog?.analysis_done ?? false;
      setPreDone(pre);
      setTranslationDone(prog?.translation_done ?? false);
      setWordTestDone(wt);
      setPassedAt(prog?.passed_at ?? null);
      // 새 순서: pre → wordtest → analysis → translation
      setLearningStep(!pre ? "pre" : !wt ? "wordtest" : !an ? "analysis" : "translation");
      setBadgeOffsets(offs);
      // 학생 모드에서 customs hydrate가 실패하면 빈 객체로 덮지 않는다(사용자 작업 손실 방지).
      // 선생님 모드에서는 첫 effect에서 localStorage로 채워둔 값이 fallback 역할.
      if (customs) setCustomAnswers(customs);
      if (mods) setModifierMap(mods);
      if (refs) setReferentMap(refs);
    });
    void hydrateIdiomsFromCloud(hydrateUserId).then((m) => {
      if (!cancelled) setIdiomMap(m);
    }).catch(() => { /* idiom 실패는 학습 게이트에 영향 없음 — 무시 */ });
    return () => {
      cancelled = true;
    };
  }, [sentence.id, hydrateUserId, reloadNonce, studentMode, onHydrationError]);

  // (hydration effect는 wordUnits 선언 이후로 이동 — 아래 참조)

  const resetCustomAnswers = () => {
    clearCustomAnswers();
    setCustomAnswers({});
    setProgressMap({});
    setCompletedSelectionMap({});
    setSelectedId(null);
    setSelectedWordIndices([]);
    setPendingPatchMap({});
    setSavedOwnerSet(new Set());
    saveSavedOwners([]);
    toast({
      title: "정답 데이터를 모두 삭제했습니다",
      description: "이제 처음부터 새로 입력할 수 있습니다.",
    });
  };

  // ===== 단어 단위 다중 선택 =====
  // 문장을 공백 기준으로 분리 — 절대 단어를 그룹화하지 않는다.
  const wordUnits = useMemo(() => {
    // analyzable 토큰의 text도 공백으로 쪼개서 평탄화
    const out: { word: string; tokenId?: string; tokenLocalIdx?: number; totalInToken?: number }[] = [];
    sentence.tokens.forEach((t) => {
      if (t.type === "static" && (t.role === "bracket" || t.role === "punct")) {
        // 구두점/괄호는 직전 단어에 붙이지 않고 별도 unit (선택 불가)
        out.push({ word: t.text });
        return;
      }
      const text = t.text;
      const parts = text.split(/\s+/).filter(Boolean);
      parts.forEach((p, i) => {
        if (t.type === "analyzable") {
          out.push({ word: p, tokenId: t.id, tokenLocalIdx: i, totalInToken: parts.length });
        } else {
          out.push({ word: p });
        }
      });
    });
    return out;
  }, [sentence]);

  const isPunct = (w: string) => /^[\.,;:!?"'()\[\]{}]+$/.test(w);

  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([]);
  const [completedSelectionMap, setCompletedSelectionMap] = useState<Record<string, number[]>>({});
  const [dragStart, setDragStart] = useState<number | null>(null);
  const isDragging = dragStart !== null;
  // 사용자가 직접 단어들을 드래그/Shift+클릭으로 묶어 만든 owner — spacer 채우기 허용
  // (자동 복원/단일 토큰 owner는 미포함). 세션 한정.
  const [userLinkedOwnerSet, setUserLinkedOwnerSet] = useState<Set<string>>(new Set());

  // owner별 자동 finalize 1회 처리 플래그 — 완료 owner를 재선택해도 selection이 사라지지 않도록
  // (hydration effect가 finalizedOwnersRef를 참조하므로 미리 선언)
  const finalizedOwnersRef = useRef<Set<string>>(new Set());

  // ===== customAnswers → progressMap / completedSelectionMap 자동 복원 =====
  // 새로고침 후에도 본인이 저장한 SVOC 배지·부배지·대괄호가 그대로 보이도록.
  // 현재 sentence 범위의 owner들만 hydrate하며, 학생 모드도 본인 데이터만 복원한다.
  useEffect(() => {
    if (!customAnswers || Object.keys(customAnswers).length === 0) return;

    const hydratedProgress: Record<string, WordProgress> = {};
    const hydratedSel: Record<string, number[]> = {};

    Object.entries(customAnswers).forEach(([ownerId, patch]) => {
      if (ownerId.startsWith(`${SPAN_PREFIX}${OWNER_KEY_SEPARATOR}`)) {
        const parts = ownerId.split(OWNER_KEY_SEPARATOR);
        if (parts[1] !== sentence.id) return;
        const range = parts[2]?.split("-").map(Number);
        if (!range || range.length !== 2 || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) return;
        const [s, e] = range;
        const indices: number[] = [];
        for (let i = s; i <= e; i++) {
          if (!isPunct(wordUnits[i]?.word ?? "")) indices.push(i);
        }
        if (indices.length === 0) return;
        hydratedSel[ownerId] = indices;
      } else {
        const lastSep = ownerId.lastIndexOf(OWNER_KEY_SEPARATOR);
        if (lastSep < 0) return;
        const tid = ownerId.slice(0, lastSep);
        const idxStr = ownerId.slice(lastSep + OWNER_KEY_SEPARATOR.length);
        const idx = Number(idxStr);
        if (!Number.isFinite(idx)) return;
        const tokenInSentence = sentence.tokens.some(
          (t) => t.type === "analyzable" && t.id === tid,
        );
        if (!tokenInSentence) return;
        if (!wordUnits[idx] || wordUnits[idx].tokenId !== tid) {
          const fb = wordUnits.findIndex((u) => u.tokenId === tid);
          if (fb < 0) return;
          hydratedSel[ownerId] = [fb];
        } else {
          hydratedSel[ownerId] = [idx];
        }
      }

      const p: Record<string, unknown> = (patch ?? {}) as Record<string, unknown>;
      const pos = p.pos as POS | undefined;
      if (!pos) return;
      const wp = emptyProgress();
      wp.pos = pos;
      wp.posStatus = "correct";
      if (pos === "명사") {
        if (typeof p.form === "string") { wp.noun.form = p.form as NounForm; wp.noun.formStatus = "correct"; }
        if (typeof p.element === "string") { wp.noun.element = p.element as SentenceElement; wp.noun.elementStatus = "correct"; }
        if (typeof p.role === "string") { wp.noun.role = p.role as string; wp.noun.roleStatus = "correct"; wp.completed = true; }
        else if (wp.noun.element === "M") wp.completed = true;
      } else if (pos === "형용사") {
        if (typeof p.form === "string") { wp.adj.form = p.form as AdjForm; wp.adj.formStatus = "correct"; }
        if (typeof p.element === "string") { wp.adj.element = p.element as "C" | "M"; wp.adj.elementStatus = "correct"; }
        if (typeof p.role === "string") { wp.adj.role = p.role as string; wp.adj.roleStatus = "correct"; wp.completed = true; }
        else if (wp.adj.element === "M") wp.completed = true;
      } else if (pos === "부사") {
        if (typeof p.form === "string") { wp.adv.form = p.form as AdvForm; wp.adv.formStatus = "correct"; }
        if (typeof p.subtype === "string") { wp.adv.subtype = p.subtype as AdvSubtype; wp.adv.subtypeStatus = "correct"; }
        if (typeof p.role === "string") { wp.adv.role = p.role as string; wp.adv.roleStatus = "correct"; }
        if (wp.adv.form || wp.adv.role) wp.completed = true;
      } else if (pos === "기타") {
        if (typeof p.kind === "string") { wp.etc.kind = p.kind as EtcKind; wp.etc.kindStatus = "correct"; }
        if (typeof p.role === "string") { wp.etc.role = p.role as string; wp.etc.roleStatus = "correct"; wp.completed = true; }
      } else if (pos === "동사") {
        if (typeof p.number === "string") wp.verb.number = p.number as VerbNumber;
        if (typeof p.tense === "string") wp.verb.tense = p.tense as VerbTense;
        if (Array.isArray(p.aspect)) wp.verb.aspect = p.aspect as VerbAspect[];
        if (p.voice) wp.verb.voice = true;
        if (p.proVerb) wp.verb.proVerb = true;
        wp.verb.confirmStatus = "correct";
        wp.completed = true;
      }
      hydratedProgress[ownerId] = wp;
    });

    if (Object.keys(hydratedSel).length > 0) {
      setCompletedSelectionMap((prev) => {
        const next = { ...prev };
        Object.entries(hydratedSel).forEach(([k, v]) => { if (!next[k]) next[k] = v; });
        return next;
      });
    }
    if (Object.keys(hydratedProgress).length > 0) {
      setProgressMap((prev) => {
        const next = { ...prev };
        Object.entries(hydratedProgress).forEach(([k, v]) => { if (!next[k]) next[k] = v; });
        return next;
      });
      Object.keys(hydratedProgress).forEach((id) => finalizedOwnersRef.current.add(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customAnswers, sentence.id, wordUnits]);

  // === SVG overlay 좌표 측정용 refs ===
  const sentenceContainerRef = useRef<HTMLDivElement | null>(null);
  const tokenRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const setTokenRef = (idx: number) => (el: HTMLSpanElement | null) => {
    if (el) tokenRefs.current.set(idx, el);
    else tokenRefs.current.delete(idx);
  };
  // 컨테이너 사이즈/스크롤 변경 시 화살표 좌표 재계산을 위한 트리거
  const [arrowLayoutVersion, setArrowLayoutVersion] = useState(0);
  useEffect(() => {
    const el = sentenceContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArrowLayoutVersion((v) => v + 1));
    ro.observe(el);
    const onResize = () => setArrowLayoutVersion((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);
  // 문장 변경 / 분석 변경 시 다음 paint 후 화살표 좌표 재측정
  useEffect(() => {
    const id = requestAnimationFrame(() => setArrowLayoutVersion((v) => v + 1));
    return () => cancelAnimationFrame(id);
  }, [sentence.id, modifierMap, referentMap, completedSelectionMap, progressMap]);

  // 모바일에서 단어 선택 시 Drawer open
  useEffect(() => {
    if (isMobile && selectedId) setDrawerOpen(true);
  }, [isMobile, selectedId]);

  const analyzableIds = useMemo(() => {
    const tokenIds = sentence.tokens
      .filter((t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> => t.type === "analyzable")
      .map((t) => t.id);
    if (tokenIds.length > 0) return tokenIds;
    return wordUnits
      .map((unit) => unit.tokenId)
      .filter((id): id is string => !!id);
  }, [sentence, wordUnits]);

  const OWNER_KEY_SEPARATOR = "::";
  const SPAN_PREFIX = "span";

  const isSpanOwnerId = (ownerId: string) => ownerId.startsWith(`${SPAN_PREFIX}${OWNER_KEY_SEPARATOR}`);

  // span::{sentenceId}::{start}-{end}
  const buildSpanOwnerId = (start: number, end: number) =>
    `${SPAN_PREFIX}${OWNER_KEY_SEPARATOR}${sentence.id}${OWNER_KEY_SEPARATOR}${start}-${end}`;

  const parseSpanRange = (ownerId: string): [number, number] | null => {
    if (!isSpanOwnerId(ownerId)) return null;
    const parts = ownerId.split(OWNER_KEY_SEPARATOR);
    const range = parts[2];
    if (!range) return null;
    const [s, e] = range.split("-").map((n) => Number(n));
    if (Number.isFinite(s) && Number.isFinite(e)) return [s, e];
    return null;
  };

  // span owner의 첫 analyzable 토큰을 owner의 "대표 토큰"으로 사용 (UI 표시 fallback)
  const getOwnerTokenId = (ownerId: string) => {
    if (isSpanOwnerId(ownerId)) {
      const range = parseSpanRange(ownerId);
      if (range) {
        for (let i = range[0]; i <= range[1]; i++) {
          const tid = wordUnits[i]?.tokenId;
          if (tid) return tid;
        }
      }
      return ownerId;
    }
    return ownerId.split(OWNER_KEY_SEPARATOR)[0] ?? ownerId;
  };

  // 진행률 계산용: span owner는 대표 1단어가 아니라 span 안의 모든 단어를 채운 것으로 본다.
  const getOwnerTokenIds = (ownerId: string) => {
    if (isSpanOwnerId(ownerId)) {
      const range = parseSpanRange(ownerId);
      if (range) {
        const ids = new Set<string>();
        for (let i = range[0]; i <= range[1]; i++) {
          const tid = wordUnits[i]?.tokenId;
          if (tid) ids.add(tid);
        }
        return Array.from(ids);
      }
    }
    const tid = getOwnerTokenId(ownerId);
    return tid ? [tid] : [];
  };

  const getTokenById = (tokenId: string | null | undefined): AnalyzableToken | undefined =>
    sentence.tokens.find(
      (t): t is AnalyzableToken => t.type === "analyzable" && t.id === tokenId,
    );

  // span owner의 가상 answer — 채점은 의미 없고 customAnswers 머지가 핵심
  const SPAN_VIRTUAL_ANSWER: WordAnswer = {
    pos: "명사",
    form: "명사",
    role: "",
    koreanLabel: "",
  } as WordAnswer;

  const getMergedAnswerForOwner = (ownerId: string, token: AnalyzableToken | undefined) => {
    const pending = pendingPatchMap[ownerId];
    if (isSpanOwnerId(ownerId)) {
      return mergeAnswer(mergeAnswer(SPAN_VIRTUAL_ANSWER, customAnswers[ownerId]), pending);
    }
    if (token && ownerId === token.id) {
      return mergeAnswer(mergeAnswer(token.answer, customAnswers[token.id]), pending);
    }
    return mergeAnswer(
      mergeAnswer((token?.answer ?? SPAN_VIRTUAL_ANSWER), customAnswers[ownerId]),
      pending,
    );
  };

  const completedCount = new Set(
    Object.entries(progressMap)
      .filter(([, value]) => value.completed)
      .flatMap(([ownerId]) => getOwnerTokenIds(ownerId)),
  ).size;
  const sentenceComplete = completedCount === analyzableIds.length && analyzableIds.length > 0;
  const analysisDone = sentenceComplete && Object.keys(pendingPatchMap).length === 0;
  // 단어(token) 기준 분석률: analyzable 토큰 중 어떤 owner라도 pos가 채워진 토큰의 비율
  const wordFilledCount = (() => {
    if (analyzableIds.length === 0) return 0;
    const filledTokenIds = new Set<string>();
    Object.entries(progressMap).forEach(([ownerId, wp]) => {
      if (!wp || !wp.pos) return;
      getOwnerTokenIds(ownerId).forEach((tid) => filledTokenIds.add(tid));
    });
    let n = 0;
    analyzableIds.forEach((id) => {
      if (filledTokenIds.has(id)) n += 1;
    });
    return n;
  })();
  // 분석 진행률 (0~1) — 단어(token) 기준으로 통일.
  // 마스터키 정답 단위(span/구절)와 학생 분석 단위가 달라도 학생 입장에서는
  // "모든 단어를 분석했으면 100%"가 되도록 단어 기준으로 분모/분자를 산정한다.
  const analysisRate =
    analyzableIds.length > 0 ? wordFilledCount / analyzableIds.length : 0;
  // 30% 이상 분석하면 다음 단계로 진행 가능 (SentenceLearn과 동일 기준)
  const canAdvanceToTranslation = analysisDone || analysisRate >= 0.3;

  // 분석 완료 상태를 Supabase에 동기화 + 임베드 모드면 외부 콜백 호출
  // ⚠ analysis_done=true 마킹 전에 progressMap의 모든 completed owner를 클라우드에
  //    강제 backfill 한다. 그렇지 않으면 owner_progress가 0행인 채로 analysis_done만
  //    true가 되어 매치율 NULL → 한글해석 단계로 못 넘어가는 사고가 재발한다.
  useEffect(() => {
    if (!analysisDone) return;
    if (!studentMode) {
      upsertSentenceProgress(sentence.id, { analysis_done: true }).catch(() => {});
      if (embedMode && onAnalysisDone) onAnalysisDone();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 현재 진행 중인 모든 completed owner를 owner_progress에 강제 upsert.
        // pos 없는 owner(예: clause/bracket span)는 customAnswers에 들어있는
        // 값을 그대로 보낸다.
        const tasks: Promise<unknown>[] = [];
        Object.entries(progressMap).forEach(([ownerId, wp]) => {
          if (!wp?.completed) return;
          const cloudPatch = wp.pos ? progressToCloudPatch(wp) : {};
          const customPatch = (customAnswers[ownerId] ?? {}) as Record<string, unknown>;
          const merged = { ...customPatch, ...cloudPatch };
          if (Object.keys(merged).length === 0) return;
          tasks.push(
            upsertOwnerProgress({
              sentence_id: sentence.id,
              owner_id: ownerId,
              progress: merged,
              custom_answer: merged,
              completed: true,
            }),
          );
        });
        if (tasks.length > 0) {
          const results = await Promise.allSettled(tasks);
          const failed = results.filter((r) => r.status === "rejected");
          if (failed.length > 0) {
            console.warn(
              `[analysisDone] ${failed.length}/${tasks.length} owner_progress upsert 실패 — analysis_done 마킹 보류`,
              failed,
            );
            return; // 실패 시 analysis_done 마킹 안 함 → 다음 useEffect tick에서 재시도
          }
        }
        if (cancelled) return;
        await upsertSentenceProgress(sentence.id, { analysis_done: true });
        if (embedMode && onAnalysisDone) onAnalysisDone();
      } catch (err) {
        console.warn("[analysisDone] 동기화 실패", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisDone, sentence.id, embedMode, onAnalysisDone, studentMode]);

  // 마스터키 owner_id 집합 hydrate — sentence 변경 시 한 번
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/analysisGrading").then(({ fetchMasterAnswers }) =>
      fetchMasterAnswers(sentence.id).then((m) => {
        if (cancelled) return;
        setMasterOwnerIds(new Set(Object.keys(m)));
        setMasterRequiredIds(
          new Set(
            Object.entries(m)
              .filter(([, v]) => (v as { required?: boolean } | null)?.required === true)
              .map(([ownerId]) => ownerId),
          ),
        );
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [sentence.id]);

  // 분석 진행률(0~1) 외부 통지 — 단어(token) 기준으로 통일
  useEffect(() => {
    if (!onAnalysisProgress) return;
    const total = analyzableIds.length;
    // 명시 "필수 분석" 지점 커버리지: 해당 owner를 직접 분석했거나,
    // span 지점이면 그 안의 단어 중 하나라도 학생이 분석했으면 채운 것으로 본다.
    let requiredDone = 0;
    if (masterRequiredIds.size > 0) {
      const filledTokenIds = new Set<string>();
      Object.entries(progressMap).forEach(([ownerId, wp]) => {
        if (!wp || !wp.pos) return;
        getOwnerTokenIds(ownerId).forEach((tid) => filledTokenIds.add(tid));
      });
      masterRequiredIds.forEach((ownerId) => {
        const direct = !!progressMap[ownerId]?.pos;
        const covered =
          direct || getOwnerTokenIds(ownerId).some((tid) => filledTokenIds.has(tid));
        if (covered) requiredDone += 1;
      });
    }
    onAnalysisProgress(total > 0 ? wordFilledCount / total : 0, {
      hasMaster: masterOwnerIds.size > 0,
      filled: wordFilledCount,
      total,
      requiredTotal: masterRequiredIds.size,
      requiredDone,
    });
  }, [completedCount, wordFilledCount, analyzableIds.length, onAnalysisProgress, masterOwnerIds, masterRequiredIds, progressMap]);

  const selectedTokenId = selectedId ? getOwnerTokenId(selectedId) : null;
  const selectedTokenRaw = getTokenById(selectedTokenId);
  // 정답 입력 모드에서 저장된 정답을 머지한 토큰
  // span owner: selectedTokenRaw 가 없을 수 있다 → 가상 토큰으로 wrap
  const selectedToken = selectedId
    ? selectedTokenRaw
      ? { ...selectedTokenRaw, answer: getMergedAnswerForOwner(selectedId, selectedTokenRaw) }
      : isSpanOwnerId(selectedId)
        ? {
            type: "analyzable" as const,
            id: selectedId,
            text: "",
            answer: getMergedAnswerForOwner(selectedId, undefined),
          }
        : undefined
    : undefined;
  const selectedAnswer = selectedToken?.answer ?? null;
  const progress = selectedId ? progressMap[selectedId] ?? emptyProgress() : emptyProgress();
  const activeSelectionIndices = useMemo(() => {
    if (selectedWordIndices.length > 0) {
      return Array.from(new Set(selectedWordIndices)).sort((a, b) => a - b);
    }

    if (selectedId && completedSelectionMap[selectedId]?.length) {
      return [...completedSelectionMap[selectedId]].sort((a, b) => a - b);
    }

    return [] as number[];
  }, [completedSelectionMap, selectedId, selectedWordIndices]);

  const reportStudentProgressSaveFailure = (err: unknown) => {
    // 콘솔에 진짜 원인(보통 supabase auth lock / 네트워크 일시 오류) 그대로 남긴다.
    console.warn("[studentAnalysisAutosave] owner_progress 저장 실패", err);
    const raw = (err as { message?: string } | null)?.message ?? "";
    const isAuthLock = /Lock|lock:sb-|NavigatorLock|steal/i.test(raw);
    // 인증 락/일시 충돌은 사용자에게 잘못된 안내(인터넷 탓)를 하지 않는다.
    // 분석 입력값 자체는 로컬 상태에 그대로 남아 다음 자동저장 사이클에서 재시도된다.
    if (isAuthLock) {
      console.info("[studentAnalysisAutosave] auth lock 충돌로 자동 재시도 예정 — 사용자 토스트 생략");
      return;
    }
    toast({
      title: "분석 저장이 잠시 지연됐어요",
      description:
        "작성한 분석은 화면에 그대로 남아있고 곧 자동으로 다시 저장됩니다. 한글 해석으로 그대로 진행해도 괜찮아요.",
    });
  };

  const saveStudentProgressEntries = useCallback(async (entries: [string, WordProgress][]): Promise<FlushAnalysisResult> => {
    if (entries.length === 0) return { total: 0, saved: 0, failed: 0 };
    const results = await Promise.allSettled(
      entries.map(([ownerId, wp]) => {
        const cloudPatch = progressToCloudPatch(wp);
        const customPatch = (customAnswers[ownerId] ?? {}) as Record<string, unknown>;
        const merged = { ...customPatch, ...cloudPatch };
        return upsertOwnerProgress({
          sentence_id: sentence.id,
          owner_id: ownerId,
          progress: merged,
          custom_answer: merged,
          completed: wp.completed,
        });
      }),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    return { total: entries.length, saved: entries.length - failed, failed };
  }, [customAnswers, progressMap, sentence.id]);

  useEffect(() => {
    if (!studentMode || !onFlushStudentProgress) return;
    onFlushStudentProgress(async () => {
      const entries = Object.entries(progressMap).filter(([, wp]) => wp?.pos);
      return saveStudentProgressEntries(entries);
    });
    return () => onFlushStudentProgress(null);
  }, [onFlushStudentProgress, progressMap, saveStudentProgressEntries, studentMode]);

  const flushStudentProgressToCloud = async () => {
    const entries = Object.entries(progressMap).filter(([, wp]) => wp?.pos);
    if (entries.length === 0) {
      toast({ title: "저장할 분석이 없습니다" });
      return;
    }
    setStudentSaveBusy(true);
    try {
      const result = await saveStudentProgressEntries(entries);
      if (result.failed > 0) throw new Error(`${result.failed}/${result.total}개 저장 실패`);
      toast({ title: "💾 저장됨", description: `분석 ${entries.length}개가 클라우드에 저장되었습니다.` });
    } catch (err) {
      reportStudentProgressSaveFailure(err);
    } finally {
      setStudentSaveBusy(false);
    }
  };

  const updateProgress = (id: string, updater: (prev: WordProgress) => WordProgress) => {
    setProgressMap((prev) => {
      const nextProgress = updater(prev[id] ?? emptyProgress());
      if (studentMode && nextProgress.pos) {
        const patch = progressToCloudPatch(nextProgress);
        void upsertOwnerProgress({
          sentence_id: sentence.id,
          owner_id: id,
          progress: patch,
          custom_answer: patch,
          completed: nextProgress.completed,
        }).catch(reportStudentProgressSaveFailure);
      }
      return {
        ...prev,
        [id]: nextProgress,
      };
    });
  };

  // 정답 입력 모드에서 한 필드를 저장
  const buildOwnerId = (indices: number[]) => {
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    if (sorted.length === 1) {
      const tid = wordUnits[sorted[0]]?.tokenId;
      if (tid) return `${tid}${OWNER_KEY_SEPARATOR}${sorted[0]}`;
      return null;
    }
    return buildSpanOwnerId(sorted[0], sorted[sorted.length - 1]);
  };

  const saveCustom = (ownerId: string, patch: Record<string, unknown>) => {
    const studentProgressPatch = studentMode && progressMap[ownerId]
      ? progressToCloudPatch(progressMap[ownerId])
      : {};
    // 학생 모드에서는 loadCustomAnswers()가 빈 객체를 반환하므로 메모리 맵을 baseMap으로 전달.
    const next = upsertCustomAnswer(ownerId, { ...studentProgressPatch, ...patch }, sentence.id, customAnswers);
    setCustomAnswers(next);
  };

  // ===== 정답 저장 워크플로우 =====
  // stagePatch: 변경사항을 메모리에만 누적 (localStorage 저장 X)
  const stagePatch = (ownerId: string, patch: Record<string, unknown>) => {
    setPendingPatchMap((prev) => ({
      ...prev,
      [ownerId]: { ...(prev[ownerId] ?? {}), ...patch },
    }));
  };
  // commitPatch: 누적된 patch를 localStorage에 저장 + savedOwnerSet 추가
  const commitPatch = (ownerId: string) => {
    const pending = pendingPatchMap[ownerId];
    if (pending && Object.keys(pending).length > 0) {
      const next = upsertCustomAnswer(ownerId, pending, sentence.id, customAnswers);
      setCustomAnswers(next);
      setPendingPatchMap((prev) => {
        const n = { ...prev };
        delete n[ownerId];
        return n;
      });
    }
    setSavedOwnerSet((prev) => {
      const n = new Set(prev);
      n.add(ownerId);
      saveSavedOwners(Array.from(n));
      return n;
    });
    toast({ title: "분석 완료 저장됨", description: "이 단어의 정답이 저장되었습니다." });
  };
  // commitAllPatches: pendingPatchMap의 모든 owner를 일괄 commit
  const commitAllPatches = () => {
    const entries = Object.entries(pendingPatchMap);
    if (entries.length === 0) {
      toast({ title: "저장할 변경사항이 없습니다" });
      return;
    }
    let merged = customAnswers;
    entries.forEach(([ownerId, patch]) => {
      if (Object.keys(patch).length > 0) {
        merged = upsertCustomAnswer(ownerId, patch, sentence.id, merged);
      }
    });
    setCustomAnswers(merged);
    setPendingPatchMap({});
    setSavedOwnerSet((prev) => {
      const n = new Set(prev);
      entries.forEach(([ownerId]) => n.add(ownerId));
      saveSavedOwners(Array.from(n));
      return n;
    });
    toast({
      title: `정답 ${entries.length}개 저장됨`,
      description: "모든 미저장 변경사항이 저장되었습니다.",
    });
    onAfterCommitAll?.(entries.length);
  };

  // discardPatch: 누적된 patch만 버림 (savedOwnerSet은 그대로)
  const discardPatch = (ownerId: string) => {
    setPendingPatchMap((prev) => {
      if (!prev[ownerId]) return prev;
      const n = { ...prev };
      delete n[ownerId];
      return n;
    });
  };
  const hasPendingPatch = (ownerId: string | null | undefined): boolean => {
    if (!ownerId) return false;
    const p = pendingPatchMap[ownerId];
    return !!p && Object.keys(p).length > 0;
  };
  const getOwnerStatus = (ownerId: string | null | undefined): "empty" | "dirty" | "saved" => {
    if (!ownerId) return "empty";
    if (hasPendingPatch(ownerId)) return "dirty";
    if (savedOwnerSet.has(ownerId)) return "saved";
    return "empty";
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (!progressMap[id]) {
      setProgressMap((prev) => ({ ...prev, [id]: emptyProgress() }));
    }
  };

  const clearActiveSelection = () => {
    setSelectedWordIndices([]);
    setSelectedId(null);
    setDragStart(null);
    setDrawerOpen(false);
  };

  const shouldPersistClauseSelection = () => {
    // 100% progress 기반 — 원본 answer 추론 금지 (Item 3)
    if (progress.pos === "명사" && progress.noun.form === "접SV") return true;
    if (progress.pos === "형용사" && progress.adj.form === "접SV") return true;
    if (progress.pos === "부사" && progress.adv.form === "접SV") return true;
    return false;
  };

  const finalizeCompletedAnalysis = (tokenId: string, options?: { persistClause?: boolean; progressPatch?: WordProgress }) => {
    const indices = Array.from(new Set(selectedWordIndices)).sort((a, b) => a - b);

    if (indices.length > 0) {
      setCompletedSelectionMap((prev) => ({
        ...prev,
        [tokenId]: indices,
      }));
      // 2개 이상 단어를 묶어 만든 owner는 "사용자 직접 연결"로 등록 → spacer 채우기 허용
      if (indices.length >= 2) {
        setUserLinkedOwnerSet((prev) => {
          if (prev.has(tokenId)) return prev;
          const n = new Set(prev);
          n.add(tokenId);
          return n;
        });
      }
    }

    if (options?.persistClause && indices.length > 0) {
      const studentProgressPatch = studentMode && options.progressPatch
        ? progressToCloudPatch(options.progressPatch)
        : {};
      saveCustom(tokenId, {
        ...studentProgressPatch,
        clauseStart: indices[0],
        clauseEnd: indices[indices.length - 1],
      });
    }

    clearActiveSelection();
  };

  // 선택된 인덱스들에서 분석 패널의 selectedId를 결정
  // - 단일 인덱스: tokenId::idx (단일 토큰 owner — 기존 정답과 머지)
  // - 다중 인덱스: span::sentenceId::start-end (별개 owner — 기존 단일 분석과 충돌 X)
  const pickSelectedIdFromIndices = (indices: number[]): string | null => {
    if (indices.length === 0) return null;
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
    if (sorted.length === 1) {
      const tid = wordUnits[sorted[0]]?.tokenId;
      if (tid) return `${tid}${OWNER_KEY_SEPARATOR}${sorted[0]}`;
      // analyzable 토큰이 없는 단어 단독은 분석 불가
      return null;
    }
    // 다중 인덱스: 항상 span owner — 단일 토큰 분석과 분리 보존
    return buildSpanOwnerId(sorted[0], sorted[sorted.length - 1]);
  };

  // ===== 단일 owner 즉시 삭제 (지우개 모드 / Shift 단축키 공용) =====
  // 모든 관련 state를 동시에 정리 — 보라 잔상이 남지 않도록 customAnswers, pendingPatch,
  // savedOwner, userLinkedOwnerSet, modifier/referent 관계까지 모두 제거.
  const eraseOwner = (ownerId: string) => {
    setProgressMap((prev) => {
      if (!(ownerId in prev)) return prev;
      const next = { ...prev };
      delete next[ownerId];
      finalizedOwnersRef.current.delete(ownerId);
      return next;
    });
    setCompletedSelectionMap((prev) => {
      if (!(ownerId in prev)) return prev;
      const next = { ...prev };
      delete next[ownerId];
      return next;
    });
    // customAnswers는 항상 제거 (재hydrate 방지) + localStorage 동기화
    setCustomAnswers((prev) => {
      if (!(ownerId in prev)) return prev;
      const nextCustom = { ...prev };
      delete nextCustom[ownerId];
      saveCustomAnswers(nextCustom);
      return nextCustom;
    });
    // pending patch / saved owner 표시도 정리
    setPendingPatchMap((prev) => {
      if (!prev[ownerId]) return prev;
      const n = { ...prev };
      delete n[ownerId];
      return n;
    });
    setSavedOwnerSet((prev) => {
      if (!prev.has(ownerId)) return prev;
      const n = new Set(prev);
      n.delete(ownerId);
      saveSavedOwners(Array.from(n));
      return n;
    });
    setUserLinkedOwnerSet((prev) => {
      if (!prev.has(ownerId)) return prev;
      const n = new Set(prev);
      n.delete(ownerId);
      return n;
    });
    // 수식/지시어 관계도 같이 삭제 (source가 owner인 항목)
    setModifierMap((prev) => removeModifierTargetBySource(prev, sentence.id, ownerId));
    setReferentMap((prev) => removeReferentTargetBySource(prev, sentence.id, ownerId));
    if (pendingModifierSource === ownerId) setPendingModifierSource(null);
    if (pendingReferentSource === ownerId) setPendingReferentSource(null);

    // 관용구 잔상 제거 — owner의 단어 인덱스 범위와 겹치는 idiom을 모두 삭제
    const ownerIndices = completedSelectionMap[ownerId];
    if (ownerIndices && ownerIndices.length > 0) {
      const sentIdioms = idiomMap[sentence.id] ?? [];
      const toRemove = sentIdioms.filter((m) =>
        m.indices.some((i) => ownerIndices.includes(i)),
      );
      if (toRemove.length > 0) {
        let nextIdiomMap = idiomMap;
        toRemove.forEach((m) => {
          nextIdiomMap = removeIdiom(sentence.id, m.indices);
        });
        setIdiomMap(nextIdiomMap);
      }
    }

    if (selectedId === ownerId) {
      setSelectedId(null);
      setSelectedWordIndices([]);
      setDragStart(null);
      setDrawerOpen(false);
    }
  };

  // ===== 단어 단위 선택 =====
  // 클릭 분기 (삭제는 오직 지우개 모드에서만):
  //   - eraserMode ON + 완료 owner 클릭 → 즉시 삭제
  //   - eraserMode ON + 미분석 토큰    → 무시
  //   - Shift+클릭 (선택 진행 중)      → 누적 선택 (삭제 아님)
  //   - eraserMode OFF + 완료 owner 클릭 → 클릭한 토큰 1개만 selection → 다층 분석 진입
  //   - 일반 클릭/드래그 → 새 분석 시작
  const handleWordMouseDown = (idx: number, e: React.MouseEvent) => {
    if (isPunct(wordUnits[idx].word)) return;
    e.stopPropagation();

    // === [비교 모드] — 클릭 시 onOwnerToggle 만 호출, 분석 동작 모두 차단 ===
    if (compareMode) {
      const tid = wordUnits[idx]?.tokenId;
      const ownerId = tid ? `${tid}${OWNER_KEY_SEPARATOR}${idx}` : null;
      if (ownerId && onOwnerToggle) onOwnerToggle(ownerId);
      return;
    }

    // === [수식 / 지시어 대상 지정] 모드 — 다음 클릭은 target 캡처 ===
    if (pendingModifierSource || pendingReferentSource) {
      const tid = wordUnits[idx]?.tokenId;
      const targetOwnerId = tid ? `${tid}${OWNER_KEY_SEPARATOR}${idx}` : null;
      if (pendingModifierSource && targetOwnerId && targetOwnerId !== pendingModifierSource) {
        setModifierMap((prev) =>
          upsertModifierTarget(prev, sentence.id, {
            source: pendingModifierSource,
            target: targetOwnerId,
          }),
        );
        toast({ title: "🎯 수식 대상 지정 완료" });
      } else if (
        pendingReferentSource &&
        targetOwnerId &&
        targetOwnerId !== pendingReferentSource
      ) {
        setReferentMap((prev) =>
          upsertReferentTarget(prev, sentence.id, {
            source: pendingReferentSource,
            target: targetOwnerId,
          }),
        );
        toast({ title: "👉 지시어 대상 지정 완료" });
      }
      setPendingModifierSource(null);
      setPendingReferentSource(null);
      return;
    }

    // 이 인덱스를 포함하는 완료 owner들 (좁은 layer 우선)
    const owners = Object.entries(completedSelectionMap)
      .filter(([oid, indices]) => indices.includes(idx) && progressMap[oid]?.completed)
      .sort(([, a], [, b]) => a.length - b.length);

    const hasCompletedOwner = owners.length > 0;

    // === 지우개 모드 — 클릭 = 가장 위(가장 안쪽/짧은) layer 1개만 삭제 ===
    // owners는 길이 오름차순 정렬됨 → owners[0]이 가장 안쪽(=가장 위에 쌓인) layer.
    // 버튼을 다시 클릭할 때까지 모드 유지(연속 삭제 가능).
    if (eraserMode) {
      if (hasCompletedOwner) {
        const [topOwnerId] = owners[0];
        eraseOwner(topOwnerId);
        const remaining = owners.length - 1;
        toast({
          title: `🧽 1개 분석 삭제됨${remaining > 0 ? ` · ${remaining}층 남음` : ""}`,
        });
      }
      return;
    }

    // === Shift+클릭 = 누적 선택 + 드래그 시작 (드래그로 범위 확장 가능) ===
    if (e.shiftKey && selectedWordIndices.length > 0) {
      const next = Array.from(new Set([...selectedWordIndices, idx])).sort((a, b) => a - b);
      setSelectedWordIndices(next);
      setDragStart(idx); // 드래그 확장 시작점
      const sid = pickSelectedIdFromIndices(next);
      if (sid) {
        setSelectedId(sid);
        setProgressMap((pm) => (pm[sid] ? pm : { ...pm, [sid]: emptyProgress() }));
      }
      return;
    }

    // === 일반 모드 — 단일 토큰 선택으로 새 분석/다층 분석 진입 ===
    // 완료 owner 위에서도 owner 전체를 selection으로 잡지 않고 단일 토큰만 선택
    // → 기존 owner는 보존된 채 그 위에 새 layer 분석 가능
    setDragStart(idx);
    setSelectedWordIndices([idx]);
    // 다층 분석 보장: 클릭한 단일 토큰이 이미 완료된 단일 owner(progressMap)면
    // 같은 인덱스로 span owner를 생성해 새 layer로 분리한다.
    let sid = pickSelectedIdFromIndices([idx]);
    if (sid && progressMap[sid]?.completed) {
      sid = buildSpanOwnerId(idx, idx);
    }
    if (sid) {
      setSelectedId(sid);
      setProgressMap((pm) => (pm[sid] ? pm : { ...pm, [sid]: emptyProgress() }));
    } else {
      setSelectedId(null);
    }
  };
  const handleWordMouseEnter = (idx: number) => {
    if (dragStart === null) return;
    if (isPunct(wordUnits[idx].word)) return;
    const lo = Math.min(dragStart, idx);
    const hi = Math.max(dragStart, idx);
    setSelectedWordIndices((prev) => {
      const next = new Set(prev);
      // 기존 누적 선택을 보존(Shift 워크플로) + 새 드래그 범위 union
      for (let i = lo; i <= hi; i++) {
        if (!isPunct(wordUnits[i].word)) next.add(i);
      }
      const arr = Array.from(next).sort((a, b) => a - b);
      const sid = pickSelectedIdFromIndices(arr);
      if (sid) {
        setSelectedId(sid);
        setProgressMap((pm) => (pm[sid] ? pm : { ...pm, [sid]: emptyProgress() }));
      }
      return arr;
    });
  };
  const finalizeSelection = () => {
    setDragStart(null);
  };
  const handleWordMouseUp = () => {
    if (dragStart === null) return;
    finalizeSelection();
  };

  // ===== 지우개: 선택된 인덱스를 덮는 모든 완료 owner를 일괄 삭제 =====
  const handleEraser = () => {
    const ownerIds = new Set<string>();
    // active 또는 완료 영역 인덱스 모두 수집
    const indices = new Set<number>(activeSelectionIndices);
    // selectedId가 있고 그것의 완료 영역이 있다면 거기 인덱스도 추가
    if (selectedId && completedSelectionMap[selectedId]) {
      completedSelectionMap[selectedId].forEach((i) => indices.add(i));
    }
    const indicesArr = Array.from(indices);

    // 1) 선택된 owner 자체
    if (selectedId) ownerIds.add(selectedId);
    // 2) 단일 토큰 owner들
    indicesArr.forEach((i) => {
      const ownerId = buildOwnerId([i]);
      if (ownerId) ownerIds.add(ownerId);
    });
    // 3) 어떤 인덱스라도 덮는 모든 완료 owner (단일/구/절 전부)
    Object.entries(completedSelectionMap).forEach(([oid, idxs]) => {
      if (idxs.some((i) => indicesArr.includes(i))) ownerIds.add(oid);
    });
    // 4) progressMap에 진행 중이지만 아직 미완료인 owner도 (완료 없이 시작만 한 케이스)
    if (selectedId && progressMap[selectedId]) ownerIds.add(selectedId);

    if (ownerIds.size === 0) {
      clearActiveSelection();
      return;
    }

    setProgressMap((prev) => {
      const next = { ...prev };
      ownerIds.forEach((id) => {
        delete next[id];
        finalizedOwnersRef.current.delete(id);
      });
      return next;
    });
    setCompletedSelectionMap((prev) => {
      const next = { ...prev };
      ownerIds.forEach((id) => delete next[id]);
      return next;
    });
    // clauseStart/clauseEnd customAnswer도 함께 정리
    const nextCustom = { ...customAnswers };
    let touched = false;
    ownerIds.forEach((id) => {
      if (nextCustom[id]) {
        delete nextCustom[id];
        touched = true;
      }
    });
    if (touched) {
      setCustomAnswers(nextCustom);
      saveCustomAnswers(nextCustom);
    }
    // pending/saved도 같이 정리
    setPendingPatchMap((prev) => {
      let changed = false;
      const n = { ...prev };
      ownerIds.forEach((id) => {
        if (n[id]) { delete n[id]; changed = true; }
      });
      return changed ? n : prev;
    });
    setSavedOwnerSet((prev) => {
      let changed = false;
      const n = new Set(prev);
      ownerIds.forEach((id) => {
        if (n.has(id)) { n.delete(id); changed = true; }
      });
      if (changed) saveSavedOwners(Array.from(n));
      return changed ? n : prev;
    });
    clearActiveSelection();
  };

  // ===== 숙어 / Phrase 핸들러 =====
  const currentSelectionSurface = () =>
    activeSelectionIndices
      .map((i) => wordUnits[i]?.word)
      .filter(Boolean)
      .join(" ");

  const currentSelectionIdiom = (): IdiomMark | undefined => {
    if (activeSelectionIndices.length === 0) return undefined;
    const sorted = [...activeSelectionIndices].sort((a, b) => a - b);
    return findIdiomByIndices(idiomMap, sentence.id, sorted);
  };

  const handleIdiomSave = (meaning: string) => {
    if (activeSelectionIndices.length === 0) return;
    const sorted = [...activeSelectionIndices].sort((a, b) => a - b);
    const surface = currentSelectionSurface();
    const next = upsertIdiom(sentence.id, sorted, surface, meaning);
    setIdiomMap(next);
    toast({
      title: "🟩 관용구 저장됨",
      description: `"${surface}" — ${meaning}`,
    });
  };

  const handleIdiomRemove = () => {
    if (activeSelectionIndices.length === 0) return;
    const sorted = [...activeSelectionIndices].sort((a, b) => a - b);
    const next = removeIdiom(sentence.id, sorted);
    setIdiomMap(next);
    toast({ title: "관용구를 삭제했습니다" });
  };

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => finalizeSelection();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // ===== LAYER 01: 품사 =====
  const handlePos = (p: POS) => {
    if (!selectedId) return;
    if (answerInputMode) {
      // 정답 입력 모드: pos 변경 시 다른 필드는 비워서 새 pos에 맞게 다시 입력하도록 한다
      stagePatch(selectedId, { pos: p });
      updateProgress(selectedId, (prev) => ({
        ...prev,
        pos: p,
        posStatus: "correct",
        noun: emptyNoun(),
        adj: emptyAdj(),
        adv: emptyAdv(),
        etc: emptyEtc(),
        verb: emptyVerb(),
        completed: false,
      }));
      return;
    }
    // 학생 모드에서는 정답 비교를 하지 않고 항상 수용 (정답 노출 차단)
    updateProgress(selectedId, (prev) => ({
      ...prev,
      pos: p,
      posStatus: "correct",
      noun: prev.noun,
      adj: prev.adj,
      adv: prev.adv,
      etc: prev.etc,
      verb: prev.verb,
      completed: false,
    }));
  };

  // ===== 명사 =====
  const handleNounForm = (f: NounForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { form: f });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        form: f,
        formStatus: "correct",
        element: prev.noun.element,
        elementStatus: prev.noun.elementStatus,
        role: prev.noun.role,
        roleStatus: prev.noun.roleStatus,
      },
      completed: false,
    }));
  };

  const handleNounElement = (e: SentenceElement) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { element: e });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        element: e,
        elementStatus: "correct",
        role: prev.noun.role,
        roleStatus: prev.noun.roleStatus,
      },
      completed: false,
    }));
  };

  const handleNounRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { role: r });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: { ...prev.noun, role: r, roleStatus: "correct" },
      completed: true,
    }));
  };

  // 평탄화 핸들러: element + role 한 번에 처리 (M은 role=null로 즉시 완료)
  const handleNounElementRole = (e: SentenceElement, r: string | null) => {
    if (!selectedId) return;
    if (answerInputMode) {
      if (selectedId) stagePatch(selectedId, { element: e, role: r ?? "수식어" });
      updateProgress(selectedId, (prev) => ({
        ...prev,
        noun: {
          ...prev.noun,
          element: e,
          elementStatus: "correct",
          role: r ?? "수식어",
          roleStatus: "correct",
        },
        completed: true,
      }));
      return;
    }
    // 학생 모드: 정답 비교 없이 학생 선택 그대로 완료 처리
    if (e === "M") {
      updateProgress(selectedId, (prev) => ({
        ...prev,
        noun: {
          ...prev.noun,
          element: e,
          elementStatus: "correct",
          role: r ?? "수식어",
          roleStatus: "correct",
        },
        completed: true,
      }));
      return;
    }
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        element: e,
        elementStatus: "correct",
        role: r,
        roleStatus: r !== null ? "correct" : "idle",
      },
      completed: r !== null,
    }));
  };

  // ===== 형용사 =====
  const handleAdjForm = (f: AdjForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { form: f });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        form: f,
        formStatus: "correct",
        element: prev.adj.element,
        elementStatus: prev.adj.elementStatus,
        role: prev.adj.role,
        roleStatus: prev.adj.roleStatus,
      },
      completed: false,
    }));
  };

  const handleAdjElement = (e: "C" | "M") => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { element: e });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        element: e,
        elementStatus: "correct",
        role: prev.adj.role,
        roleStatus: prev.adj.roleStatus,
      },
      completed: false,
    }));
  };

  const handleAdjRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { role: r });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: { ...prev.adj, role: r, roleStatus: "correct" },
      completed: true,
    }));
  };

  const handleAdjElementRole = (e: "C" | "M", r: string | null) => {
    if (!selectedId) return;
    if (answerInputMode) {
      if (selectedId) stagePatch(selectedId, { element: e, role: r ?? "수식어" });
      updateProgress(selectedId, (prev) => ({
        ...prev,
        adj: {
          ...prev.adj,
          element: e,
          elementStatus: "correct",
          role: r ?? "수식어",
          roleStatus: "correct",
        },
        completed: true,
      }));
      return;
    }
    // 학생 모드: 정답 비교 없이 학생 선택 그대로 완료 처리
    if (e === "M") {
      updateProgress(selectedId, (prev) => ({
        ...prev,
        adj: {
          ...prev.adj,
          element: e,
          elementStatus: "correct",
          role: r ?? "수식어",
          roleStatus: "correct",
        },
        completed: true,
      }));
      return;
    }
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        element: e,
        elementStatus: "correct",
        role: r,
        roleStatus: r !== null ? "correct" : "idle",
      },
      completed: r !== null,
    }));
  };

  // ===== 부사 =====
  const handleAdvForm = (f: AdvForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { form: f });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        form: f,
        formStatus: "correct",
        subtype: prev.adv.subtype,
        subtypeStatus: prev.adv.subtypeStatus,
        role: prev.adv.role,
        roleStatus: prev.adv.roleStatus,
      },
      completed: false,
    }));
  };

  const handleAdvSubtype = (s: AdvSubtype) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { subtype: s });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        subtype: s,
        subtypeStatus: "correct",
        role: prev.adv.role,
        roleStatus: prev.adv.roleStatus,
      },
      completed: false,
    }));
  };

  const handleAdvRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { role: r });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: { ...prev.adv, role: r, roleStatus: "correct" },
      completed: true,
    }));
  };

  // ===== 기타 =====
  const handleEtcKind = (k: EtcKind) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { kind: k });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      etc: {
        ...prev.etc,
        kind: k,
        kindStatus: "correct",
        role: prev.etc.role,
        roleStatus: prev.etc.roleStatus,
      },
      completed: false,
    }));
  };

  const handleEtcRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) stagePatch(selectedId, { role: r });
    updateProgress(selectedId, (prev) => ({
      ...prev,
      etc: { ...prev.etc, role: r, roleStatus: "correct" },
      completed: true,
    }));
  };

  // ===== 동사 =====
  const toggleVerb = (mut: (v: VerbProgress) => VerbProgress) => {
    if (!selectedId) return;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      verb: { ...mut(prev.verb), confirmStatus: "idle" },
      completed: false,
    }));
  };

  const handleVerbNumber = (n: VerbNumber) =>
    toggleVerb((v) => ({ ...v, number: v.number === n ? null : n }));
  const handleVerbTense = (t: VerbTense) =>
    toggleVerb((v) => ({ ...v, tense: v.tense === t ? null : t }));
  const handleVerbAspect = (a: VerbAspect) =>
    toggleVerb((v) => ({
      ...v,
      aspect: v.aspect.includes(a) ? v.aspect.filter((x) => x !== a) : [...v.aspect, a],
    }));
  const handleVerbVoice = () => toggleVerb((v) => ({ ...v, voice: !v.voice }));
  const handleVerbProVerb = () => toggleVerb((v) => ({ ...v, proVerb: !v.proVerb }));

  const handleVerbConfirm = () => {
    if (!selectedId) return;
    const v = progress.verb;
    if (answerInputMode) {
      // 정답 입력 모드: 현재 동사 진행 상태를 그대로 정답으로 저장
      if (selectedId) stagePatch(selectedId, {
        number: v.number ?? undefined,
        tense: v.tense ?? undefined,
        aspect: v.aspect,
        voice: v.voice ? "수동" : undefined,
        proVerb: v.proVerb,
      });
      updateProgress(selectedId, (prev) => ({
        ...prev,
        verb: { ...prev.verb, confirmStatus: "correct" },
        completed: true,
      }));
      return;
    }
    // 학생 모드: 정답 비교 없이 학생 선택 그대로 완료 처리
    updateProgress(selectedId, (prev) => ({
      ...prev,
      verb: { ...prev.verb, confirmStatus: "correct" },
      completed: true,
    }));
  };

  // (finalizedOwnersRef는 hydration effect와 함께 위쪽에서 선언됨)

  useEffect(() => {
    if (!selectedId) return;
    if (!progress.completed) return;
    // 이미 finalize 처리된 owner면 selection을 다시 지우지 않음
    if (finalizedOwnersRef.current.has(selectedId)) return;
    if (completedSelectionMap[selectedId]?.length) {
      // 이미 완료 영역이 저장된 owner를 재선택한 경우도 스킵
      finalizedOwnersRef.current.add(selectedId);
      return;
    }
    finalizedOwnersRef.current.add(selectedId);
    finalizeCompletedAnalysis(selectedId, {
      persistClause: shouldPersistClauseSelection(),
      progressPatch: progress,
    });
  }, [
    selectedId,
    progress.completed,
    progress.noun.form,
    progress.adj.form,
    progress.adv.form,
    selectedToken,
  ]);

  // 자동 순차 학습 정책상 수동 이동은 제거됨. 내부 리셋용으로만 보존.
  const _resetForNewSentence = () => {
    setSelectedId(null);
    setSelectedWordIndices([]);
    setDragStart(null);
    setProgressMap({});
    setCompletedSelectionMap({});
    setUserLinkedOwnerSet(new Set());
    setDrawerOpen(false);
    setEraserMode(false);
    setPendingModifierSource(null);
    setPendingReferentSource(null);
    tokenRefs.current.clear();
  };
  void _resetForNewSentence;

  const panelProps = {
    selectedWord:
      activeSelectionIndices.length > 0
        ? activeSelectionIndices.map((index) => wordUnits[index]?.word).filter(Boolean).join(" ")
        : selectedToken?.text ?? null,
    answer: selectedAnswer,
    pos: progress.pos,
    posStatus: progress.posStatus,
    onPosChange: handlePos,
    noun: progress.noun,
    onNounFormChange: handleNounForm,
    onNounElementChange: handleNounElement,
    onNounRoleChange: handleNounRole,
    onNounElementRole: handleNounElementRole,
    adj: progress.adj,
    onAdjFormChange: handleAdjForm,
    onAdjElementChange: handleAdjElement,
    onAdjRoleChange: handleAdjRole,
    onAdjElementRole: handleAdjElementRole,
    adv: progress.adv,
    onAdvFormChange: handleAdvForm,
    onAdvSubtypeChange: handleAdvSubtype,
    onAdvRoleChange: handleAdvRole,
    etc: progress.etc,
    onEtcKindChange: handleEtcKind,
    onEtcRoleChange: handleEtcRole,
    verb: progress.verb,
    onVerbToggleNumber: handleVerbNumber,
    onVerbToggleTense: handleVerbTense,
    onVerbToggleAspect: handleVerbAspect,
    onVerbToggleVoice: handleVerbVoice,
    onVerbToggleProVerb: handleVerbProVerb,
    onVerbConfirm: handleVerbConfirm,
    // 관용구는 분석과 독립 — 1개 단어에도 특수 의미 등록 가능
    idiomEnabled: activeSelectionIndices.length >= 1,
    idiomExistingMeaning: currentSelectionIdiom()?.meaning,
    onIdiomSave: handleIdiomSave,
    onIdiomRemove: handleIdiomRemove,
    canErase: activeSelectionIndices.length > 0,
    onEraseSelection: handleEraser,
    // ===== 수식 화살표 — 형용사/부사 또는 element=M owner에서만 활성 =====
    canAssignModifierTarget:
      !!selectedId &&
      (progress.pos === "형용사" ||
        progress.pos === "부사" ||
        (progress.pos === "명사" && progress.noun.element === "M")),
    isPendingModifier: !!selectedId && pendingModifierSource === selectedId,
    onAssignModifierTarget: () => {
      if (!selectedId) return;
      // 다른 모드 토글이 켜져있다면 먼저 끔
      setPendingReferentSource(null);
      setPendingModifierSource((cur) => (cur === selectedId ? null : selectedId));
    },
    onClearModifierTarget: () => {
      if (!selectedId) return;
      setModifierMap((prev) => removeModifierTargetBySource(prev, sentence.id, selectedId));
      setPendingModifierSource(null);
    },
    hasModifierTarget:
      !!selectedId &&
      getTargetsForSentence(modifierMap, sentence.id).some((r) => r.source === selectedId),
    currentModifierTargetLabel: (() => {
      if (!selectedId) return null;
      const rel = getTargetsForSentence(modifierMap, sentence.id).find(
        (r) => r.source === selectedId,
      );
      if (!rel) return null;
      const idx = ownerIdToWordIdx(rel.target);
      if (idx === null) return null;
      return wordUnits[idx]?.word ?? null;
    })(),
    onCancelPendingModifier: () => setPendingModifierSource(null),
    // ===== 지시어 화살표 — 명사 owner에서만 활성 (대명사/일반 명사 모두 가리키는 대상 지정 가능) =====
    canAssignReferentTarget: !!selectedId && progress.pos === "명사",
    isPendingReferent: !!selectedId && pendingReferentSource === selectedId,
    onAssignReferentTarget: () => {
      if (!selectedId) return;
      // 다른 모드 토글이 켜져있다면 먼저 끔
      setPendingModifierSource(null);
      setPendingReferentSource((cur) => (cur === selectedId ? null : selectedId));
    },
    onClearReferentTarget: () => {
      if (!selectedId) return;
      setReferentMap((prev) => removeReferentTargetBySource(prev, sentence.id, selectedId));
      setPendingReferentSource(null);
    },
    hasReferentTarget:
      !!selectedId &&
      getReferentsForSentence(referentMap, sentence.id).some((r) => r.source === selectedId),
    currentReferentTargetLabel: (() => {
      if (!selectedId) return null;
      const rel = getReferentsForSentence(referentMap, sentence.id).find(
        (r) => r.source === selectedId,
      );
      if (!rel) return null;
      const idx = ownerIdToWordIdx(rel.target);
      if (idx === null) return null;
      return wordUnits[idx]?.word ?? null;
    })(),
    onCancelPendingReferent: () => setPendingReferentSource(null),
    // ===== 정답 저장 워크플로우 =====
    answerInputMode,
    ownerStatus: getOwnerStatus(selectedId),
    onSaveAnswer: () => {
      if (selectedId) commitPatch(selectedId);
    },
    onDiscardAnswer: () => {
      if (selectedId) discardPatch(selectedId);
    },
  };

  const allIdiomsCount = useMemo(() => getAllIdiomsFlat(idiomMap).length, [idiomMap]);

  // 인덱스별 모든 owner들 — **외곽(긴 범위) → 안쪽(짧은 범위)** 순으로 정렬.
  // 따라서 owners[0] = Layer 1 (관대주격 등 외곽층), owners[last] = 가장 안쪽 layer.
  const completedOwnersByIndex = useMemo(() => {
    const m: Record<number, string[]> = {};
    Object.entries(completedSelectionMap).forEach(([ownerId, indices]) => {
      indices.forEach((index) => {
        if (!m[index]) m[index] = [];
        m[index].push(ownerId);
      });
    });
    Object.keys(m).forEach((k) => {
      const idx = Number(k);
      m[idx].sort(
        (a, b) =>
          (completedSelectionMap[b]?.length ?? 0) - (completedSelectionMap[a]?.length ?? 0),
      );
    });
    return m;
  }, [completedSelectionMap]);

  // 가장 안쪽(좁은) owner — 부속 배지/한글 라벨용
  const innerOwnerByIndex = useMemo(() => {
    const m: Record<number, string | undefined> = {};
    Object.entries(completedOwnersByIndex).forEach(([k, owners]) => {
      m[Number(k)] = owners[owners.length - 1];
    });
    return m;
  }, [completedOwnersByIndex]);
  // 가장 외곽(넓은) owner — 절 wrapper/배경용 (Layer 1)
  const outerOwnerByIndex = useMemo(() => {
    const m: Record<number, string | undefined> = {};
    Object.entries(completedOwnersByIndex).forEach(([k, owners]) => {
      m[Number(k)] = owners[0];
    });
    return m;
  }, [completedOwnersByIndex]);

  // 선생님 마스터키 owner → 본문 인덱스 (학생 모드 위치 힌트)
  const masterOwnersByIndex = useMemo(() => {
    const m: Record<number, string[]> = {};
    masterOwnerIds.forEach((ownerId) => {
      ownerIdToSelectionIndices(ownerId, wordUnits).forEach((index) => {
        if (!m[index]) m[index] = [];
        m[index].push(ownerId);
      });
    });
    return m;
  }, [masterOwnerIds, wordUnits]);

  const showMasterGuide = studentMode && !compareMode && masterOwnerIds.size > 0;

  // 병렬(parallel) owner 판별 — `기타 > 접속 > 병렬`
  const isParallelProgress = (p: WordProgress | undefined): boolean => {
    if (!p) return false;
    return p.pos === "기타" && p.etc.kind === "접속" && p.etc.role === "병렬";
  };
  // 등위접속사 단어 (병렬 owner의 anchor 후보)
  const COORD_CONJ = new Set(["and", "or", "but", "nor", "so", "yet", "for"]);
  const findAnchorIdx = (
    indices: number[],
    p: WordProgress | undefined,
  ): number => {
    if (indices.length === 0) return -1;
    if (isParallelProgress(p)) {
      const conjIdx = indices.find((i) => {
        const w = wordUnits[i]?.word?.toLowerCase().replace(/[^a-z]/g, "");
        return w ? COORD_CONJ.has(w) : false;
      });
      if (conjIdx !== undefined) return conjIdx;
    }
    return indices[0];
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div
      className={cn(
        embedMode ? "bg-transparent" : "min-h-screen bg-background",
        ((!embedMode && isAdmin) || (embedMode && isAdmin && showStaffToolbar)) && "pb-20",
      )}
    >
      {/* Header — embedMode일 때 숨김 */}
      {!embedMode && (
      <nav className="glass-panel sticky top-0 z-50 border-b px-6 lg:px-8 py-3">
        <div
          className={cn(
            "max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4",
            !analysisPanelHidden && "lg:pr-[calc(min(30vw,420px)+2rem)]",
          )}
        >
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="flex flex-col">
              <h1 className="font-kr font-bold text-base lg:text-lg text-primary leading-tight">
                {GWJ_ACADEMY_NAME}
              </h1>
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary-glow uppercase">
                {GWJ_SYNTAX_PRODUCT_NAME}
              </span>
            </div>
            <div className="hidden md:block h-7 w-px bg-border" />
            <div className="hidden md:flex flex-col gap-0.5 font-kr">
              <p className="text-[11px] text-muted-foreground">태도가 실력이 될 때까지</p>
              <p className="text-[11px] font-semibold text-foreground">
                설명할 수 있어야 진짜 아는 것이다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {autoLoading && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 shadow-sm">
                <div className="size-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-[11px] font-bold text-primary font-kr">다음 문장 불러오는 중…</span>
              </div>
            )}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <div className="size-2 rounded-full bg-element-o animate-pulse" />
              <span className="text-[11px] font-medium text-muted-foreground font-kr">
                {completedCount} / {analyzableIds.length} 완료
              </span>
            </div>
            <UserMenu />
          </div>
        </div>
      </nav>
      )}

      {/* 하단 staff 툴바 (선생님/관리자 전용). embedMode에선 showStaffToolbar=true일 때만 노출 */}
      {((!embedMode && isAdmin) || (embedMode && isAdmin && showStaffToolbar)) && (() => {
        const status = getOwnerStatus(selectedId);
        const canSave = answerInputMode && status === "dirty";
        return (
          <div
            className={cn(
              embedMode
                ? "sticky bottom-0 z-40"
                : "fixed bottom-0 inset-x-0 z-40",
              "border-t border-border/60 bg-background/85 backdrop-blur-sm",
              "shadow-[0_-4px_12px_rgba(0,0,0,0.05)]",
              "px-4 py-2",
            )}
          >
            <div
              className={cn(
                "max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto",
                !analysisPanelHidden && "lg:pr-[calc(min(30vw,420px)+2rem)]",
              )}
            >
              {/* 좌측: 정답 입력 / 저장 / 초기화 */}
              <label
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm cursor-pointer transition-colors shrink-0",
                  answerInputMode
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border",
                )}
                title="정답 입력 모드: 클릭한 항목이 정답으로 저장됩니다"
              >
                <Pencil className={cn("size-3.5", answerInputMode ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[11px] font-bold font-kr", answerInputMode ? "text-primary" : "text-muted-foreground")}>
                  정답 입력
                </span>
                <Switch
                  checked={answerInputMode}
                  onCheckedChange={setAnswerInputMode}
                  className="scale-75 -my-1"
                />
              </label>
              {answerInputMode && (
                <>
                  <button
                    type="button"
                    onClick={commitAllPatches}
                    disabled={Object.keys(pendingPatchMap).length === 0}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold font-kr transition-colors shrink-0",
                      Object.keys(pendingPatchMap).length > 0
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                        : "bg-muted text-muted-foreground/60 cursor-not-allowed",
                    )}
                    title="미저장 변경사항을 모두 저장합니다"
                  >
                    <Pencil className="size-3" />
                    정답 저장 (전체 {Object.keys(pendingPatchMap).length})
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-bold font-kr hover:bg-destructive/20 transition-colors shrink-0"
                        title="저장된 모든 정답을 지웁니다"
                      >
                        <RotateCcw className="size-3" />
                        정답 초기화
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-kr">
                          모든 정답 데이터를 삭제할까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-kr">
                          저장된 모든 customAnswers가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                          처음부터 다시 입력하시겠습니까?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-kr">취소</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={resetCustomAnswers}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-kr"
                        >
                          모두 삭제
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              <Separator orientation="vertical" className="h-6 mx-1 shrink-0" />

              {/* 우측: AI 추출 / 단어 목록 / 힌트 */}
              <div className="flex items-center gap-2 shrink-0">
                <AiExtractButton sentenceId={sentence.id} english={sentence.english} />
                <ExtractedWordsPanel sentenceId={sentence.id} english={sentence.english} />
                <AdminHintToggle />
              </div>
            </div>
          </div>
        );
      })()}

      {/* 미저장 변경 — 모드 OFF 확인 다이얼로그 */}
      <AlertDialog
        open={!!pendingNavAction}
        onOpenChange={(open) => {
          if (!open) setPendingNavAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-kr">저장하지 않은 정답이 있습니다</AlertDialogTitle>
            <AlertDialogDescription className="font-kr">
              아직 [정답 저장]을 누르지 않은 변경사항이 있습니다. 저장하지 않고 정답 입력 모드를 끌까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-kr">취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-kr"
              onClick={() => {
                const act = pendingNavAction;
                setPendingNavAction(null);
                act?.();
              }}
            >
              버리고 끄기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desktop: fixed top-right panel */}
      {!analysisPanelHidden && (
        <div
          className={cn(
            "hidden lg:flex flex-col fixed top-[64px] right-4 z-30",
            "w-[min(30vw,420px)]",
            // 내용 높이만큼만 차지하고, 길어지면 스크롤. 빈 패널이 지문을 가리지 않도록 bottom 고정 제거.
            isAdmin ? "max-h-[calc(100vh-64px-5rem)]" : "max-h-[calc(100vh-64px-1rem)]",
            selectedId
              ? "overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-background/85 backdrop-blur-sm shadow-lg"
              : "pointer-events-none",
          )}
        >
          {selectedId && (
            <AnswerInputModeProvider value={answerInputMode}>
              <AnalysisPanel {...panelProps} />
            </AnswerInputModeProvider>
          )}
        </div>
      )}

      {/* 데스크톱: 분석 패널이 숨겨진 경우 우측 하단 플로팅 복구 버튼 */}
      {analysisPanelHidden && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setAnalysisPanelHidden(false)}
              className={cn(
                "hidden lg:flex fixed right-4 z-40 items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors",
                isAdmin ? "bottom-20" : "bottom-4",
              )}
              aria-label="분석 패널 열기"
            >
              <PanelRightOpen className="size-4" />
              <span className="text-[11px] font-bold font-kr">분석 패널</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="font-kr text-[11px]">분석 패널 열기 ( ? )</span>
          </TooltipContent>
        </Tooltip>
      )}

      {allDone && (
        <main className="max-w-3xl mx-auto p-6 lg:p-12 pt-12 lg:pt-32">
          <div className="glass-panel rounded-3xl p-10 text-center space-y-6">
            <div className="mx-auto size-20 rounded-full bg-element-o-bg flex items-center justify-center text-4xl">
              🎓
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold font-kr">
              모든 학습을 완료했습니다!
            </h1>
            <p className="text-sm text-muted-foreground font-kr leading-relaxed">
              고3(L10)까지 모든 문장을 Pass하셨습니다.
              <br />
              훌륭합니다 — 진짜 아는 것을 증명하셨습니다.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
              <Link
                to="/learn"
                className="px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 font-kr"
              >
                다음 학습 →
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="px-4 py-2 rounded-md text-sm font-bold bg-secondary text-foreground hover:bg-secondary/80 font-kr"
              >
                로그아웃
              </button>
              {isAdmin && (
                <Link
                  to="/teacher"
                  className="px-4 py-2 rounded-md text-sm font-bold bg-accent text-accent-foreground hover:bg-accent/90 font-kr"
                >
                  선생님 대시보드 →
                </Link>
              )}
            </div>
          </div>
        </main>
      )}

      {!allDone && (
      <main
        className={cn(
          "max-w-7xl mx-auto flex flex-col gap-4",
          embedMode ? "p-0 pt-0" : "p-4 lg:p-8 pt-4 lg:pt-24",
          !embedMode && !analysisPanelHidden && "lg:pr-[calc(min(30vw,420px)+2rem)]",
        )}
      >
        {!embedMode && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-bold text-primary-glow tracking-widest uppercase font-kr">
                문장 분석 · {formatSentenceCode(sentence.level, sentence.no)}
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold font-kr bg-primary/10 text-primary border border-primary/20">
                {levelDisplay(sentence.level)}
              </span>
              {isAdmin && (
                <Link
                  to="/teacher"
                  className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  title="선생님 화면으로 이동"
                >
                  선생님 화면으로 이동
                </Link>
              )}
            </div>
            <KoreanHintButton korean={sentence.korean} />
          </div>
          {!studentMode && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] font-bold tabular-nums text-muted-foreground px-2 py-1 rounded-md bg-secondary">
                자동 순차 학습
              </span>
            </div>
          )}
        </div>
        )}

        {/* 정답 입력 모드 안내 배너 — 제거됨 (하단 토글 버튼이 ON 상태로 충분히 표시) */}

        {/* 학생용 미니 툴바 — embedMode + studentMode + 비교모드 아닐 때만 */}
        {embedMode && studentMode && !compareMode && (
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <KoreanHintButton korean={sentence.korean} />
              {showMasterGuide && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-[11px] font-bold text-primary font-kr">
                    📍 선생님 지정 분석 단위 {masterOwnerIds.size}개 · 현재 {completedCount}개 완료
                  </p>
                  <p className="text-[10px] text-primary/70 font-kr">
                    옅은 보라 음영 위치를 클릭해 분석하세요. (정답 내용은 숨김)
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEraserMode((p) => !p)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold font-kr transition-colors",
                eraserMode
                  ? "bg-destructive/15 border-destructive/40 text-destructive"
                  : "bg-card border-border text-muted-foreground hover:bg-accent",
              )}
              title="지우개 모드 (클릭한 분석 삭제 · 다시 눌러 해제)"
            >
              <Eraser className="size-3" />
              지우개
            </button>
            <button
              type="button"
              onClick={clearActiveSelection}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-card text-muted-foreground hover:bg-accent text-[11px] font-bold font-kr"
              title="현재 선택 해제"
            >
              <X className="size-3" />
              선택 해제
            </button>
            <button
              type="button"
              onClick={() => void flushStudentProgressToCloud()}
              disabled={studentSaveBusy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-primary/40 bg-primary/10 text-primary text-[11px] font-bold font-kr hover:bg-primary/20"
              title="저장 확인"
            >
              <Save className="size-3" />
              {studentSaveBusy ? "저장 중…" : "저장"}
            </button>
            </div>
          </div>
        )}

        {eraserMode && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-destructive font-kr">
              🧽 지우개 모드 — 클릭한 분석을 삭제합니다. 다시 버튼을 눌러 해제하세요 (ESC로 즉시 취소)
            </p>
            <button
              type="button"
              onClick={() => setEraserMode(false)}
              className="text-[11px] font-bold font-kr text-destructive underline underline-offset-2"
            >
              종료
            </button>
          </div>
        )}

        <section
          className={cn(
            "glass-panel rounded-2xl p-4 lg:p-6 relative overflow-hidden",
            eraserMode && "ring-2 ring-destructive/40",
          )}
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-secondary">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
              style={{
                width: `${analyzableIds.length ? (completedCount / analyzableIds.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* === 토큰 사이 인접 완료 layer 검사용 헬퍼 === */}
          {(() => null)()}
          {pendingModifierSource && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/40 text-[11px] font-bold font-kr text-primary inline-flex items-center gap-2">
              🎯 수식 대상이 될 단어를 클릭하세요
              <button
                type="button"
                onClick={() => setPendingModifierSource(null)}
                className="text-[10px] underline underline-offset-2 font-semibold"
              >
                취소
              </button>
            </div>
          )}
          {pendingReferentSource && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-[11px] font-bold font-kr text-foreground inline-flex items-center gap-2">
              👉 가리키는(지시) 대상 단어를 클릭하세요
              <button
                type="button"
                onClick={() => setPendingReferentSource(null)}
                className="text-[10px] underline underline-offset-2 font-semibold"
              >
                취소
              </button>
            </div>
          )}
          <div
            ref={sentenceContainerRef}
            className="relative flex flex-wrap items-end pb-1 pt-12 gap-y-10 select-none"
            onMouseLeave={() => isDragging && finalizeSelection()}
          >
            {/* === 수식 / 지시어 화살표 SVG overlay === */}
            <ArrowOverlay
              showModifier={showTeacherAnnotations && showModifierArrows}
              showReferent={showTeacherAnnotations && showReferentArrows}
              modifierRelations={getTargetsForSentence(modifierMap, sentence.id)}
              referentRelations={getReferentsForSentence(referentMap, sentence.id)}
              tokenRefs={tokenRefs.current}
              containerRef={sentenceContainerRef}
              layoutVersion={arrowLayoutVersion}
            />
            {wordUnits.map((u, idx) => {
              const word = u.word;
              const punct = isPunct(word);

              // 인접 완료 layer 공유 여부 (앞/뒤 단어가 같은 owner에 속하면 사이 공백을 보라로 채움)
              const ownersHere = completedOwnersByIndex[idx] ?? [];
              const ownersPrev = idx > 0 ? completedOwnersByIndex[idx - 1] ?? [] : [];
              const ownersNext =
                idx < wordUnits.length - 1 ? completedOwnersByIndex[idx + 1] ?? [] : [];
              const sharedWithPrev = ownersHere.find((o) => ownersPrev.includes(o) && progressMap[o]?.completed);
              const sharedWithNext = ownersHere.find((o) => ownersNext.includes(o) && progressMap[o]?.completed);
              const masterOwnersHere = masterOwnersByIndex[idx] ?? [];
              const masterOwnersPrev = idx > 0 ? masterOwnersByIndex[idx - 1] ?? [] : [];
              const masterOwnersNext =
                idx < wordUnits.length - 1 ? masterOwnersByIndex[idx + 1] ?? [] : [];
              const masterSharedWithPrev = masterOwnersHere.find((o) => masterOwnersPrev.includes(o));
              const masterSharedWithNext = masterOwnersHere.find((o) => masterOwnersNext.includes(o));

              // 구두점/괄호: 비대화형 (단, 인접 완료 layer 사이면 그 자체에 보라 배경)
              if (punct) {
                const fillBg = showTeacherAnnotations && sharedWithPrev && sharedWithNext;
                const masterFillBg = showMasterGuide && masterSharedWithPrev && masterSharedWithNext;
                return (
                  <span
                    key={idx}
                    className={cn(
                      "text-base font-medium text-foreground self-end leading-tight px-0.5 py-0.5",
                      fillBg && "bg-primary/[0.07] border-b border-primary/20",
                      !fillBg && masterFillBg && "bg-primary/[0.05] border-b border-primary/15",
                    )}
                    aria-hidden
                  >
                    {word}
                  </span>
                );
              }

              const isSelected = selectedWordIndices.includes(idx);
              const selectedTokenId = u.tokenId;
              // 안쪽 owner(좁은 layer = 부속) 우선, 없으면 외곽 owner(절)
              const ownerId = innerOwnerByIndex[idx];
              const tokenId = selectedTokenId ?? ownerId;
              const token = tokenId
                ? sentence.tokens.find(
                    (t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> =>
                      t.type === "analyzable" && t.id === tokenId,
                  )
                : undefined;
              const wp = ownerId ? progressMap[ownerId] : undefined;
               const ownerToken = ownerId ? getTokenById(getOwnerTokenId(ownerId)) : undefined;
               const ownerAnswer = ownerId && ownerToken ? getMergedAnswerForOwner(ownerId, ownerToken) : undefined;
              const completedIndices = ownerId ? completedSelectionMap[ownerId] ?? [] : [];
              const isCompleted = completedIndices.includes(idx) && !!wp?.completed;
              const isMasterGuideHere =
                showMasterGuide && masterOwnersHere.length > 0 && !isCompleted;
              const selStart = completedIndices[0];
              const selEnd = completedIndices[completedIndices.length - 1];
              const isFirstOfSelection = isCompleted && idx === selStart;
              const isLastOfSelection = isCompleted && idx === selEnd;
              // 안쪽 부배지 anchor — owner의 첫 인덱스 (병렬은 등위접속사 위치)
              const innerAnchorIdx = findAnchorIdx(completedIndices, wp);
              const isInnerBadgeAnchor = isCompleted && idx === innerAnchorIdx;

              // 외곽 layer (절) — 인덱스 범위만 잡고, 의미는 progress 에서.
              const outerOwnerId = outerOwnerByIndex[idx];
              const outerIndices = outerOwnerId
                ? completedSelectionMap[outerOwnerId] ?? []
                : [];

              // === 안쪽 layer element 결정 — 100% progress 기반 ===
              const innerBadge = wp ? buildElementBadge(wp) : undefined;
              const innerSubLabel = wp ? buildSubBadgeLabel(wp) : undefined;
              const isClauseSelection = wp ? isClauseProgress(wp) : false;
              const isParallelSelection = isParallelProgress(wp);
              let completedElement: "S" | "V" | "O" | "C" | undefined;
              if (showTeacherAnnotations && isCompleted && innerBadge) {
                if (innerBadge !== "M" && !isClauseSelection) {
                  completedElement = innerBadge;
                }
              }
              // SVOC 배지 anchor도 첫 단어(또는 등위접속사)
              const isElementBadgeAnchor = isCompleted && idx === innerAnchorIdx;

              // === 절(외곽 layer) 정보도 동일 progress 기반 ===
              const outerProgress = outerOwnerId ? progressMap[outerOwnerId] : undefined;
              const outerIsClauseLocal =
                !!outerProgress && isClauseProgress(outerProgress);
              const outerIsParallelLocal = isParallelProgress(outerProgress);
              const outerBadge = showTeacherAnnotations && outerProgress ? buildElementBadge(outerProgress) : undefined;
              const outerSubLabel = showTeacherAnnotations && outerProgress ? buildSubBadgeLabel(outerProgress) : undefined;
              const outerIsFirstLocal = outerIsClauseLocal && idx === outerIndices[0];
              const outerIsLastLocal =
                outerIsClauseLocal && idx === outerIndices[outerIndices.length - 1];
              const outerAnchorIdx = findAnchorIdx(outerIndices, outerProgress);
              const outerIsBadgeAnchor = outerIsClauseLocal && idx === outerAnchorIdx;

              // === 절 브래킷: 외곽 progress의 element badge 기준 (학생 모드는 숨김) ===
              const bracketRole: "S" | "V" | "O" | "C" | "M" | undefined =
                showTeacherAnnotations && outerIsClauseLocal ? outerBadge ?? "M" : undefined;

              // === 부배지 layer depth 계산 ===
              // ownersHere 순서: 외곽(긴 범위) → 안쪽(짧은 범위).
              // "라벨 있는(meaningful)" owner만 카운트해서 layer 번호를 부여한다.
              // → 3층에 해당하는 owner가 단순 부사 1개뿐이고 라벨이 비어 있으면,
              //   안쪽 owner는 자동으로 layer-2(보라)로 표기되어 빨강 색이 떠 있지 않게 됨.
              const meaningfulOwners = ownersHere.filter((oid) => !!buildSubBadgeLabel(progressMap[oid]));
              const totalLayers = meaningfulOwners.length || ownersHere.length;
              const layerNumOf = (oid: string | undefined): number => {
                if (!oid) return 1;
                const idxIn = meaningfulOwners.indexOf(oid);
                if (idxIn >= 0) return idxIn + 1;
                const fallback = ownersHere.indexOf(oid);
                return fallback >= 0 ? fallback + 1 : 1;
              };
              const innerLayerNum = layerNumOf(ownerId);
              const outerLayerNum = layerNumOf(outerOwnerId);
              // Layer 번호 표기 규칙: 단층(혼자)이거나 Layer 1이면 숫자 숨김. 2부터만.
              const showInnerLayerNum = totalLayers >= 2 && innerLayerNum >= 2;
              const showOuterLayerNum = totalLayers >= 2 && outerLayerNum >= 2;

              // 부배지(품사 라벨) — owner 첫 인덱스에만, 절은 별도 외곽 부배지로 처리
              const koreanLabel =
                showTeacherAnnotations && isCompleted && isInnerBadgeAnchor && !isClauseSelection ? innerSubLabel : undefined;
              const outerKoreanLabel =
                showTeacherAnnotations && outerIsClauseLocal && outerIsBadgeAnchor ? outerSubLabel : undefined;

              const bracketColorClass =
                bracketRole === "S"
                  ? "text-element-s"
                  : bracketRole === "V"
                  ? "text-element-v"
                  : bracketRole === "O"
                  ? "text-element-o"
                  : bracketRole === "C"
                  ? "text-element-c"
                  : "text-muted-foreground/60";
              const bracketWeight = bracketRole ? "font-extrabold" : "font-normal";

              // === Idiom 레이어 ===
              const idiomMark = findIdiomCoveringIndex(idiomMap, sentence.id, idx);
              const idiomFirst = idiomMark && idiomMark.indices[0] === idx;
              const idiomLast =
                idiomMark && idiomMark.indices[idiomMark.indices.length - 1] === idx;

              // 안쪽 완료 배경 — clause/parallel은 별도 처리, 일반(general)만 옅은 보라
              const innerCompleteBg =
                showTeacherAnnotations && isCompleted && !isSelected && !isClauseSelection && !isParallelSelection;

              // === Owner 종류별 배경 분기 ===
              // clause: 배경 거의 제거 (대괄호로 표현) / parallel: 진한 박스 / general: 옅은 보라 누적
              // 결함 #5: layer 번호에 비례해 alpha를 증가시켜 위층일수록 진하게 표시.
              const layerVars = ["--layer-1", "--layer-2", "--layer-3", "--layer-4"];
              const LAYER_ALPHAS = [0.14, 0.24, 0.34, 0.44];
              const buildLayerBg = (owners: string[]): string | undefined => {
                if (owners.length === 0) return undefined;
                const layers = owners
                  .map((oid, i) => {
                    const op = progressMap[oid];
                    // 살아있는 완료 owner만 배경 생성 — 잔상 방지
                    if (!op || !op.completed) return null;
                    if (isClauseProgress(op)) return null; // clause는 배경 X
                    if (isParallelProgress(op)) return null; // parallel은 별도 .parallel-box
                    const v = layerVars[i % layerVars.length];
                    const a = LAYER_ALPHAS[Math.min(i, LAYER_ALPHAS.length - 1)];
                    return `linear-gradient(hsl(var(${v}) / ${a}), hsl(var(${v}) / ${a}))`;
                  })
                  .filter((x): x is string => !!x);
                if (layers.length === 0) return undefined;
                return layers.join(", ");
              };
              const wordLayerBg = showTeacherAnnotations && !idiomMark ? buildLayerBg(ownersHere) : undefined;

              // 결함 #5: 본문 단어가 S/V인 경우 텍스트 색을 element 색으로 강조 (가장 안쪽 owner 기준)
              const innerElementForText: "S" | "V" | undefined =
                showTeacherAnnotations && isCompleted && innerBadge === "S"
                  ? "S"
                  : showTeacherAnnotations && isCompleted && wp?.pos === "동사"
                    ? "V"
                    : undefined;
              const wordTextColorClass =
                innerElementForText === "S"
                  ? "text-element-s font-extrabold"
                  : innerElementForText === "V"
                    ? "text-element-v font-extrabold"
                    : "";

              // 병렬 owner가 이 인덱스를 포함하면 박스 시각화 (학생 모드는 시각화 차단)
              const parallelOwnerHere = showTeacherAnnotations
                ? ownersHere.find((oid) => isParallelProgress(progressMap[oid]))
                : undefined;
              const parallelIndices = parallelOwnerHere
                ? completedSelectionMap[parallelOwnerHere] ?? []
                : [];
              const isParallelHere = parallelIndices.includes(idx);
              const isParallelStart = isParallelHere && idx === parallelIndices[0];
              const isParallelEnd = isParallelHere && idx === parallelIndices[parallelIndices.length - 1];

              // === 종속절 언더라인 클래스 (외곽 절 owner의 element 색) ===
              const clauseUnderlineClass = outerIsClauseLocal && bracketRole
                ? cn(
                    "clause-underline",
                    bracketRole === "S" && "clause-underline-s",
                    bracketRole === "V" && "clause-underline-v",
                    bracketRole === "O" && "clause-underline-o",
                    bracketRole === "C" && "clause-underline-c",
                    bracketRole === "M" && "clause-underline-m",
                  )
                : "";

              const wordNode = (
                <span
                  key={idx}
                  className={cn(
                    "inline-flex items-end leading-none whitespace-nowrap",
                    isParallelHere && "parallel-box parallel-box-start parallel-box-end",
                    clauseUnderlineClass,
                  )}
                  style={wordLayerBg ? { backgroundImage: wordLayerBg } : undefined}
                >
                  {bracketRole && outerIsFirstLocal && (
                    <span
                      className={cn("self-end pr-0.5 clause-bracket", bracketColorClass, bracketWeight)}
                      aria-hidden
                    >
                      [
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    ref={setTokenRef(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleWordMouseDown(idx, e);
                    }}
                    onMouseEnter={() => handleWordMouseEnter(idx)}
                    onMouseUp={handleWordMouseUp}
                    className={cn(
                      "relative inline-flex flex-col items-center cursor-pointer leading-none",
                      idiomMark && "py-0.5",
                      // 결함 #5: S/V 본문 단어 색 강조
                      wordTextColorClass,
                      hintWrongOwnerIds && ownerId && hintWrongOwnerIds.has(ownerId) &&
                        "ring-2 ring-amber-500/60 ring-offset-1 rounded-md bg-amber-500/5",
                      isMasterGuideHere &&
                        "rounded-sm bg-primary/[0.07] ring-1 ring-primary/20",
                      // 비교 모드 — 자동/수동 diff: 빨강 음영
                      compareMode && diffOwnerIds && ownerId && diffOwnerIds.has(ownerId) &&
                        "ring-2 ring-destructive/70 rounded-md bg-destructive/15 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]",
                      // 비교 모드 — 학생 미입력 owner: 회색 점선
                      compareMode && missingOwnerIds && ownerId && missingOwnerIds.has(ownerId) &&
                        "ring-2 ring-dashed ring-muted-foreground/50 rounded-md bg-muted/40",
                    )}
                    style={
                      idiomMark
                        ? {
                            background: "hsl(var(--idiom-bg))",
                            paddingLeft: idiomFirst ? "0.35rem" : "0.05rem",
                            paddingRight: idiomLast ? "0.35rem" : "0.05rem",
                            borderTopLeftRadius: idiomFirst ? "0.35rem" : 0,
                            borderBottomLeftRadius: idiomFirst ? "0.35rem" : 0,
                            borderTopRightRadius: idiomLast ? "0.35rem" : 0,
                            borderBottomRightRadius: idiomLast ? "0.35rem" : 0,
                          }
                        : undefined
                    }
                  >
                    {(koreanLabel || outerKoreanLabel) && (() => {
                      // 부배지 수직 cascade — 같은 단어 위 N개 layer가 있으면
                      // 안쪽(layer 1)이 가장 아래, 바깥(layer N)이 가장 위로 쌓이도록
                      // layerNum 기반 동적 top 계산. 한 칸 = 16px.
                      const STEP = 16;
                      const BASE = -18;
                      const innerTop = BASE - (innerLayerNum - 1) * STEP;
                      const outerTop = BASE - (outerLayerNum - 1) * STEP;
                      return (
                      <>
                        {koreanLabel && (
                          <span className="sub-badge-row" style={{ top: `${innerTop}px` }}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "sub-badge-pill",
                                    `sub-badge-pill-${innerLayerNum}`,
                                    totalLayers === 1 && "is-solo",
                                    answerInputMode && ownerId && hasPendingPatch(ownerId) && "is-dirty",
                                    answerInputMode && ownerId && !hasPendingPatch(ownerId) && savedOwnerSet.has(ownerId) && "is-saved",
                                  )}
                                  style={{
                                    transform: `translateX(${ownerId ? badgeOffsets[ownerId] ?? 0 : 0}px)`,
                                    cursor: eraserMode ? "inherit" : "grab",
                                    touchAction: "none",
                                  }}
                                  onPointerDown={(e) => ownerId && handleBadgePointerDown(e, ownerId)}
                                  onPointerMove={handleBadgePointerMove}
                                  onPointerUp={handleBadgePointerUp}
                                  onPointerCancel={handleBadgePointerUp}
                                  onDoubleClick={(e) => ownerId && handleBadgeDoubleClick(e, ownerId)}
                                  title="드래그로 좌우 이동, 더블클릭으로 위치 리셋"
                                >
                                  <span className={cn("sub-badge-num", !showInnerLayerNum && "is-hidden")}>{innerLayerNum}</span>
                                  <span className="truncate max-w-[120px]">{koreanLabel}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs font-kr">
                                {koreanLabel}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        )}
                        {outerKoreanLabel && (
                          <span className="sub-badge-row" style={{ top: `${outerTop}px` }}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    "sub-badge-pill",
                                    `sub-badge-pill-${outerLayerNum}`,
                                    totalLayers === 1 && "is-solo",
                                    answerInputMode && outerOwnerId && hasPendingPatch(outerOwnerId) && "is-dirty",
                                    answerInputMode && outerOwnerId && !hasPendingPatch(outerOwnerId) && savedOwnerSet.has(outerOwnerId) && "is-saved",
                                  )}
                                  style={{
                                    transform: `translateX(${outerOwnerId ? badgeOffsets[outerOwnerId] ?? 0 : 0}px)`,
                                    cursor: eraserMode ? "inherit" : "grab",
                                    touchAction: "none",
                                  }}
                                  onPointerDown={(e) => outerOwnerId && handleBadgePointerDown(e, outerOwnerId)}
                                  onPointerMove={handleBadgePointerMove}
                                  onPointerUp={handleBadgePointerUp}
                                  onPointerCancel={handleBadgePointerUp}
                                  onDoubleClick={(e) => outerOwnerId && handleBadgeDoubleClick(e, outerOwnerId)}
                                  title="드래그로 좌우 이동, 더블클릭으로 위치 리셋"
                                >
                                  <span className={cn("sub-badge-num", !showOuterLayerNum && "is-hidden")}>{outerLayerNum}</span>
                                  <span className="truncate max-w-[120px]">{outerKoreanLabel}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs font-kr">
                                {outerKoreanLabel}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        )}
                      </>
                      );
                    })()}

                    <span
                      className={cn(
                        "px-1 py-0.5 text-[16px] font-medium tracking-tight leading-tight text-foreground transition-colors",
                        // 안쪽 완료 (수식어/부속/일반 동일) — 진한 보라 음영 + 얇은 하단 보더
                        innerCompleteBg && "bg-primary/15 border-b border-primary/30",
                        isMasterGuideHere && !innerCompleteBg && "bg-primary/[0.07] border-b border-primary/15",
                        // clause(절)면 텍스트만 살짝 dim
                        isCompleted && !isSelected && isClauseSelection &&
                          "text-foreground/80",
                        // 선택된 인덱스 하이라이트
                        isSelected && "bg-primary/25",
                      )}
                    >
                      {word}
                    </span>
                    {completedElement && isElementBadgeAnchor && !isClauseSelection && (
                      <span
                        className={cn(
                          "absolute -bottom-3 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight pointer-events-none",
                          completedElement === "S" && "badge-s",
                          completedElement === "V" && "badge-v",
                          completedElement === "O" && "badge-o",
                          completedElement === "C" && "badge-c",
                        )}
                      >
                        {completedElement}
                      </span>
                    )}
                    {/* 절(접SV) — SVOC 배지: 절 시작 단어 아래 1회 (언더라인과 분리) */}
                    {outerIsClauseLocal && outerIsFirstLocal && outerBadge && outerBadge !== "M" && (
                      <span
                        className={cn(
                          "absolute -bottom-6 px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none tracking-tight pointer-events-none whitespace-nowrap shadow-sm",
                          outerBadge === "S" && "badge-s",
                          outerBadge === "V" && "badge-v",
                          outerBadge === "O" && "badge-o",
                          outerBadge === "C" && "badge-c",
                        )}
                      >
                        {outerBadge}
                      </span>
                    )}
                  </span>
                  {bracketRole && outerIsLastLocal && (
                    <span
                      className={cn("self-end pl-0.5 clause-bracket", bracketColorClass, bracketWeight)}
                      aria-hidden
                    >
                      ]
                    </span>
                  )}
                </span>
              );

              // 토큰 사이 공백 — 같은 owner를 공유하는 인접 단어 사이는 색을 채워 묶음 시각화.
              // 단, 병렬(parallel) owner는 단어별 독립 박스이므로 spacer 채우지 않음.
              const isLastWord = idx === wordUnits.length - 1;
              const sharedOwners = !isLastWord
                ? ownersHere.filter((o) => ownersNext.includes(o))
                : [];
              // 병렬 owner는 spacer 채움 제외 + 살아있는 완료 owner만 사용
              const fillableSharedOwners = sharedOwners.filter((o) => {
                const op = progressMap[o];
                return !!op && op.completed && !isParallelProgress(op);
              });
              const spacerBgImage = buildLayerBg(fillableSharedOwners);
              // 선택 중: 양쪽 모두 선택 → spacer도 동일 보라로 연결
              const isNextSelected = !isLastWord && selectedWordIndices.includes(idx + 1);
              const spacerSelectedBridge = isSelected && isNextSelected;
              // 완료(general) bridge: 양쪽 모두 같은 general owner의 완료 인덱스에 속하면 spacer도 동일 색·하단 보더
              const generalSharedOwner = fillableSharedOwners.find((oid) => {
                const op = progressMap[oid];
                return !!op && !isClauseProgress(op);
              });
              const spacerCompletedBridge = !!generalSharedOwner && !spacerSelectedBridge;
              // 절(clause) 언더라인 bridge — 양쪽 모두 같은 살아있는 clause owner에 속할 때만
              const clauseSharedOwner = sharedOwners.find((oid) => {
                const op = progressMap[oid];
                return !!op && op.completed && isClauseProgress(op);
              });
              const clauseSpacerUnderline = clauseSharedOwner ? clauseUnderlineClass : "";
              const masterSharedOwners = !isLastWord
                ? masterOwnersHere.filter((o) => masterOwnersNext.includes(o))
                : [];
              const masterSpacerBridge =
                showMasterGuide &&
                masterSharedOwners.length > 0 &&
                !spacerSelectedBridge &&
                !spacerCompletedBridge;
              const spacerNode = !isLastWord ? (
                <span
                  key={`sp-${idx}`}
                  className={cn(
                    "inline-flex items-end self-end leading-none",
                    spacerSelectedBridge && "bg-primary/25",
                    spacerCompletedBridge && "bg-primary/[0.07] border-b border-primary/20",
                    masterSpacerBridge && "bg-primary/[0.05] border-b border-primary/15",
                    clauseSpacerUnderline,
                  )}
                  style={spacerBgImage ? { backgroundImage: spacerBgImage } : undefined}
                  aria-hidden
                >
                  <span className="px-1 py-0.5 text-[16px] leading-tight">{"\u00A0"}</span>
                </span>
              ) : null;

              const node =
                idiomMark && idiomFirst ? (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>{wordNode}</TooltipTrigger>
                    <TooltipContent side="top" className="font-kr text-xs max-w-xs">
                      <p className="font-bold mb-0.5" style={{ color: "hsl(var(--idiom-fg))" }}>
                        🟩 {idiomMark.surface}
                      </p>
                      <p>{idiomMark.meaning}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  wordNode
                );

              return (
                <span key={`u-${idx}`} className="contents">
                  {node}
                  {spacerNode}
                </span>
              );
            })}
          </div>

          {/* 선택 도구바: 지우개 + 관용구 — embedMode에서는 숨김 (showStaffToolbar=true면 노출) */}
          {(!embedMode || (embedMode && showStaffToolbar && isAdmin)) && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
              {selectedWordIndices.length > 0
                ? `선택됨 · ${selectedWordIndices.length}개 단어`
                : selectedId && completedSelectionMap[selectedId]?.length
                ? `완료 영역 · ${completedSelectionMap[selectedId].length}개 단어`
                : "선택 없음"}
            </span>
            <button
              type="button"
              onClick={() => setEraserMode((v) => !v)}
              aria-pressed={eraserMode}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border",
                eraserMode
                  ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                  : "bg-destructive/10 text-destructive border-transparent hover:bg-destructive/20",
              )}
              title={
                eraserMode
                  ? "지우개 모드 ON (ESC 취소)"
                  : "지우개 활성화"
              }
            >
              🧽 지우개{eraserMode ? " · ON" : ""}
            </button>
            {selectedWordIndices.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedWordIndices([]);
                  setSelectedId(null);
                  setDragStart(null);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold font-kr transition-colors border bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/70"
                title="현재 선택을 모두 해제 (분석은 유지)"
              >
                ✕ 선택 해제
              </button>
            )}
            {/* 관용구 버튼 제거됨 — 분석 메뉴 '기타' 패널 안에서 등록/삭제 가능 */}
          </div>
          )}
          <div
            className="absolute -bottom-10 -right-10 size-64 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: "hsl(var(--primary-glow) / 0.2)" }}
          />
        </section>

        {/* ========== 학습 흐름 진행 바 + 단계별 카드 — embedMode에서 숨김 (외부 컨테이너에서 관리) ========== */}
        {!embedMode && (
        <div className="glass-panel rounded-2xl p-4 space-y-3">
          <StepProgressBar
            current={learningStep}
            preDone={preDone}
            analysisDone={analysisDone}
            translationDone={translationDone}
            wordTestDone={wordTestDone}
            onJump={(s) => {
              // 새 순서: pre → wordtest → analysis → translation
              if (s === "wordtest" && !preDone) return;
              if (s === "analysis" && (!preDone || !wordTestDone)) return;
              if (s === "translation" && !analysisDone) return;
              setLearningStep(s);
            }}
          />
          {/* 1) 단어 학습 */}
          {learningStep === "pre" && (() => {
            const surfaceMap: Record<string, string> = {};
            Object.keys(progressMap).forEach((oid) => {
              const tid = getOwnerTokenId(oid);
              const tok = getTokenById(tid);
              surfaceMap[oid] = tok && "text" in tok ? tok.text : "";
            });
            const completedOwners = Object.entries(progressMap)
              .filter(([, v]) => v.completed)
              .map(([k]) => k);
            const entries = buildWordTest(surfaceMap, progressMap as never, completedOwners);
            return (
              <>
                <WordPreStep
                  sentenceId={sentence.id}
                  entries={entries}
                  onCompleted={() => {
                    setPreDone(true);
                    upsertSentenceProgress(sentence.id, { pre_done: true }).catch(() => {});
                    setLearningStep("wordtest");
                  }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!preDone}
                    onClick={() => setLearningStep("wordtest")}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
                  >
                    다음: 단어 테스트 →
                  </button>
                </div>
              </>
            );
          })()}

          {/* 2) 단어 테스트 */}
          {learningStep === "wordtest" && (() => {
            const surfaceMap: Record<string, string> = {};
            Object.keys(progressMap).forEach((oid) => {
              const tid = getOwnerTokenId(oid);
              const tok = getTokenById(tid);
              surfaceMap[oid] = tok && "text" in tok ? tok.text : "";
            });
            const completedOwners = Object.entries(progressMap)
              .filter(([, v]) => v.completed)
              .map(([k]) => k);
            const entries = buildWordTest(surfaceMap, progressMap as never, completedOwners);
            return (
              <>
                <WordTestStep
                  sentenceId={sentence.id}
                  entries={entries}
                  onPassed={() => {
                    setWordTestDone(true);
                    void upsertSentenceProgress(sentence.id, {
                      word_test_done: true,
                    }).catch(() => {});
                    setLearningStep("analysis");
                  }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!wordTestDone}
                    onClick={() => setLearningStep("analysis")}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
                  >
                    다음: 구문 분석 →
                  </button>
                </div>
              </>
            );
          })()}

          {/* 3) 구문 분석 — 30% 이상이면 다음 단계로 진행 가능 */}
          {learningStep === "analysis" && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {canAdvanceToTranslation
                  ? "분석을 충분히 진행했어요. 한글 해석으로 넘어가세요."
                  : `분석을 30% 이상 완료하면 한글 해석으로 넘어갈 수 있어요. (${Math.round(analysisRate * 100)}%)`}
              </div>
              <button
                type="button"
                disabled={!canAdvanceToTranslation}
                onClick={() => setLearningStep("translation")}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
              >
                다음: 한글 해석 →
              </button>
            </div>
          )}

          {/* 4) 한글 해석 */}
          {learningStep === "translation" && (
            <TranslationStep
              sentenceId={sentence.id}
              englishSentence={wordUnits.map((w) => w.word).join(" ")}
              onSubmitted={() => {
                setTranslationDone(true);
                const passedAtIso = new Date().toISOString();
                setPassedAt(passedAtIso);
                void upsertSentenceProgress(sentence.id, {
                  translation_done: true,
                  status: "pass",
                  passed_at: passedAtIso,
                }).catch(() => {});
                void import("@/lib/nextSentence").then(({ advanceAfterPass }) =>
                  advanceAfterPass(sentence),
                );
              }}
            />
          )}
          {preDone && analysisDone && translationDone && wordTestDone && (
            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  void import("@/lib/nextSentence").then(({ resolveNextSentence, advanceAfterPass }) =>
                    advanceAfterPass(sentence).then(() => resolveNextSentence()).then((res) => {
                      if (res.done || !res.sentence) {
                        setAllDone(true);
                        return;
                      }
                      const idx = SENTENCES.findIndex((s) => s.id === res.sentence!.id);
                      if (idx >= 0) {
                        setSentenceIdx(idx);
                        setLearningStep("pre");
                      }
                    }),
                  );
                }}
                className="px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 font-kr"
              >
                다음 문장으로 →
              </button>
            </div>
          )}
        </div>
        )}

        {!embedMode && (
        <div className="glass-panel rounded-2xl p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "size-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                sentenceComplete ? "bg-element-o-bg text-element-o" : "bg-secondary text-primary",
              )}
            >
              {sentenceComplete ? "✓" : "i"}
            </div>
            <div>
              <p className="text-xs font-semibold">
                {sentenceComplete ? "Sentence Complete" : "Structural Context"}
              </p>
              <p className="text-[11px] text-muted-foreground font-kr">
                {sentenceComplete
                  ? "모든 단어 분석 완료 — 다음 문장으로 이동하세요"
                  : `${analyzableIds.length}개 분석 대상 단어 · 단계별 잠금 채점`}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {sentence.structureTags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 bg-secondary text-[10px] font-bold rounded-md text-secondary-foreground tracking-tight"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        )}
      </main>
      )}

      {/* Mobile: bottom-sheet drawer */}
      {isMobile && (
        <Drawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) setSelectedId(null);
          }}
        >
          <DrawerContent className="max-h-[88dvh]">
            <DrawerTitle className="sr-only">단어 분석</DrawerTitle>
            <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 overflow-y-auto max-h-[calc(88dvh-1.5rem)]">
              <AnswerInputModeProvider value={answerInputMode}>
                <AnalysisPanel {...panelProps} />
              </AnswerInputModeProvider>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {!embedMode && (
      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-[11px] text-muted-foreground font-kr">
          <span className="font-bold tracking-widest font-kr">
            {GWJ_ACADEMY_NAME} · {GWJ_SYNTAX_PRODUCT_NAME} · v0.5
          </span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
      )}
    </div>
    </TooltipProvider>
  );
};

export default Index;

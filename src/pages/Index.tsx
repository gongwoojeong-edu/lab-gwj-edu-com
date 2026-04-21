import { useEffect, useMemo, useRef, useState } from "react";

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
import { cn } from "@/lib/utils";
import { Pencil, RotateCcw, MoreHorizontal, PanelRightOpen } from "lucide-react";
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

const arraysEqualSet = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

// ============================================================
// 수식 화살표 SVG overlay — source/target token DOM 좌표를 측정해 곡선 path 렌더
// ============================================================
const OWNER_KEY_SEPARATOR_CONST = "::";
const ownerIdToWordIdx = (ownerId: string): number | null => {
  // 단일 토큰 owner: `${tokenId}::${idx}` → 마지막 segment가 idx
  const parts = ownerId.split(OWNER_KEY_SEPARATOR_CONST);
  const last = parts[parts.length - 1];
  const n = Number(last);
  return Number.isFinite(n) ? n : null;
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
          className="text-[10px] font-bold text-accent underline underline-offset-2"
        >
          선생님
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
   * - 학생이 클릭한 owner만 progress가 채워짐 → 클릭 전엔 어떤 라벨/배지도 안 보임
   */
  studentMode?: boolean;
  /** 분석 진행률(0~1) 변화 콜백 — 외부 게이트에서 사용 */
  onAnalysisProgress?: (rate: number) => void;
}

const Index = ({ embedMode = false, embedSentenceId, onAnalysisDone, hintWrongOwnerIds, studentMode = false, onAnalysisProgress }: IndexProps = {}) => {
  const isMobile = useIsMobile();
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [autoLoading, setAutoLoading] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const sentence = SENTENCES[sentenceIdx];

  // 로그인 사용자의 다음 학습 문장 자동 선택
  // 우선순위: embedSentenceId prop > ?sentence= 쿼리 > resolveNextSentence
  useEffect(() => {
    let cancelled = false;
    setAutoLoading(true);

    if (embedSentenceId) {
      const idx = SENTENCES.findIndex((s) => s.id === embedSentenceId);
      if (idx >= 0) {
        setSentenceIdx(idx);
        setAutoLoading(false);
        return;
      }
    }

    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("sentence");
    if (requestedId) {
      const idx = SENTENCES.findIndex((s) => s.id === requestedId);
      if (idx >= 0) {
        setSentenceIdx(idx);
        setAutoLoading(false);
        return;
      }
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
  // 학생 모드에서는 admin UI 전부 숨김 — role이 admin이어도 노출 차단
  const isAdmin = !studentMode && ctxIsAdmin;
  // 학생 모드에서 정답성 시각요소(보라 음영/배지/대괄호/언더라인/화살표/패널 정답) 일괄 숨김 플래그
  const showTeacherAnnotations = !studentMode;
  // 마스터키 owner_id 집합 — 학생 화면 분석률의 분모 계산에만 사용 (정답 본문은 사용 안 함)
  const [masterOwnerIds, setMasterOwnerIds] = useState<Set<string>>(new Set());

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
    // 학생 모드: localStorage 정답 캐시 로드 차단 — 어떤 라벨도 새지 않도록.
    if (studentMode) {
      setCustomAnswers({});
      setIdiomMap(loadIdioms());
      setModifierMap(loadModifierTargets());
      setReferentMap(loadReferentTargets());
      setSavedOwnerSet(new Set());
      return;
    }
    setCustomAnswers(loadCustomAnswers());
    setIdiomMap(loadIdioms());
    setModifierMap(loadModifierTargets());
    setReferentMap(loadReferentTargets());
    setSavedOwnerSet(new Set(loadSavedOwners()));
  }, [studentMode]);

  // ===== sentence 변경 시 클라우드 hydration =====
  useEffect(() => {
    let cancelled = false;
    const sid = sentence.id;
    // 학생 모드: 본인 owner_progress조차 hydrate하지 않는다.
    // (자기첨삭 모드(reviewMode)에서만 별도 fetch로 비교)
    const customsP = studentMode
      ? Promise.resolve({} as CustomAnswerMap)
      : hydrateCustomAnswersFromCloud(sid);
    const modsP = studentMode
      ? Promise.resolve({} as ModifierTargetMap)
      : hydrateModifierTargetsFromCloud(sid);
    const refsP = studentMode
      ? Promise.resolve({} as ReferentTargetMap)
      : hydrateReferentTargetsFromCloud(sid);
    Promise.all([
      fetchSentenceProgress(sid),
      fetchBadgeOffsets(sid),
      customsP,
      modsP,
      refsP,
    ]).then(([prog, offs, customs, mods, refs]) => {
      if (cancelled) return;
      const pre = prog?.pre_done ?? false;
      setPreDone(pre);
      setTranslationDone(prog?.translation_done ?? false);
      setWordTestDone(prog?.word_test_done ?? false);
      setPassedAt(prog?.passed_at ?? null);
      setLearningStep(pre ? "analysis" : "pre");
      setBadgeOffsets(offs);
      setCustomAnswers(customs);
      setModifierMap(mods);
      setReferentMap(refs);
    });
    // 관용구는 전체 sentence 공유 — 한 번만 hydrate (학생 모드에서도 OK: 관용구는 정답 단서 아님)
    void hydrateIdiomsFromCloud().then((m) => {
      if (!cancelled) setIdiomMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [sentence.id, studentMode]);

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
  // 새로고침 후에도 SVOC 배지·부배지·대괄호가 그대로 보이도록.
  // 현재 sentence 범위의 owner들만 hydrate.
  useEffect(() => {
    // 학생 모드: 정답 라벨/배지가 자동 복원되어 노출되는 것을 차단
    if (studentMode) return;
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

  const analyzableIds = useMemo(
    () =>
      sentence.tokens
        .filter((t): t is Extract<typeof sentence.tokens[number], { type: "analyzable" }> => t.type === "analyzable")
        .map((t) => t.id),
    [sentence],
  );

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
      .map(([ownerId]) => getOwnerTokenId(ownerId)),
  ).size;
  const sentenceComplete = completedCount === analyzableIds.length && analyzableIds.length > 0;
  const analysisDone = sentenceComplete && Object.keys(pendingPatchMap).length === 0;

  // 분석 완료 상태를 Supabase에 동기화 + 임베드 모드면 외부 콜백 호출
  useEffect(() => {
    if (!analysisDone) return;
    upsertSentenceProgress(sentence.id, { analysis_done: true }).catch(() => {});
    if (embedMode && onAnalysisDone) onAnalysisDone();
  }, [analysisDone, sentence.id, embedMode, onAnalysisDone]);

  // 마스터키 owner_id 집합 hydrate — sentence 변경 시 한 번
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/analysisGrading").then(({ fetchMasterAnswers }) =>
      fetchMasterAnswers(sentence.id).then((m) => {
        if (cancelled) return;
        setMasterOwnerIds(new Set(Object.keys(m)));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [sentence.id]);

  // 분석 진행률(0~1) 외부 통지 — 마스터키 정답 owner 대비 (없으면 단어 분석 대비로 fallback)
  useEffect(() => {
    if (!onAnalysisProgress) return;
    if (masterOwnerIds.size > 0) {
      let filled = 0;
      masterOwnerIds.forEach((oid) => {
        const wp = progressMap[oid];
        if (wp && wp.pos) filled += 1;
      });
      onAnalysisProgress(filled / masterOwnerIds.size);
      return;
    }
    // fallback: 마스터 미등록 문장 — 학생이 막히지 않도록 단어 분석률 사용
    const total = analyzableIds.length;
    onAnalysisProgress(total > 0 ? completedCount / total : 0);
  }, [completedCount, analyzableIds.length, onAnalysisProgress, masterOwnerIds, progressMap]);

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

  const updateProgress = (id: string, updater: (prev: WordProgress) => WordProgress) => {
    setProgressMap((prev) => ({
      ...prev,
      [id]: updater(prev[id] ?? emptyProgress()),
    }));
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
    const next = upsertCustomAnswer(ownerId, patch, sentence.id);
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
      const next = upsertCustomAnswer(ownerId, pending, sentence.id);
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

  const finalizeCompletedAnalysis = (tokenId: string, options?: { persistClause?: boolean }) => {
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
      saveCustom(tokenId, {
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

    // === 지우개 모드 — 1회용. 클릭한 단어 위 모든 owner를 한 번에 삭제. ===
    if (eraserMode) {
      if (hasCompletedOwner) {
        owners.forEach(([ownerId]) => eraseOwner(ownerId));
        toast({ title: `🧽 ${owners.length}개 분석 삭제됨` });
      }
      // 미분석 토큰을 클릭해도 모드 해제 (헛클릭 방지)
      setEraserMode(false);
      return;
    }

    // === Shift+클릭 = 누적 선택 (삭제 아님) ===
    if (e.shiftKey && selectedWordIndices.length > 0) {
      const next = Array.from(new Set([...selectedWordIndices, idx])).sort((a, b) => a - b);
      setSelectedWordIndices(next);
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
    const sid = pickSelectedIdFromIndices([idx]);
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
      title: "🟫 관용구 저장됨",
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
    answer: studentMode ? null : selectedAnswer,
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
    // 관용구는 분석과 독립이지만 단일 단어에서는 주도 UI가 되지 않음
    idiomEnabled: activeSelectionIndices.length >= 2,
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
        !embedMode && isAdmin && "pb-20",
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
                공우정바른학원
              </h1>
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary-glow uppercase">
                GWJ Syntax Master
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

      {/* 하단 고정 staff 툴바 (선생님/관리자 전용) — embedMode일 때 숨김 */}
      {!embedMode && isAdmin && (() => {
        const status = getOwnerStatus(selectedId);
        const canSave = answerInputMode && status === "dirty";
        return (
          <div
            className={cn(
              "fixed bottom-0 inset-x-0 z-40",
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
                    onClick={() => {
                      if (selectedId) commitPatch(selectedId);
                    }}
                    disabled={!canSave}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold font-kr transition-colors shrink-0",
                      canSave
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                        : "bg-muted text-muted-foreground/60 cursor-not-allowed",
                    )}
                    title={
                      !selectedId
                        ? "단어를 먼저 선택하세요"
                        : canSave
                        ? "현재 단어의 분석을 정답으로 저장"
                        : status === "saved"
                        ? "이미 저장된 정답입니다"
                        : "변경사항이 없습니다"
                    }
                  >
                    <Pencil className="size-3" />
                    {status === "saved" ? "재저장" : "정답 저장"}
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
            <div className="flex items-center justify-center gap-2 pt-2">
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
                  className="px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 font-kr"
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-bold text-primary-glow tracking-widest uppercase font-kr">
                문장 분석 · {formatSentenceCode(sentence.level, sentence.no)}
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold font-kr bg-primary/10 text-primary border border-primary/20">
                {LEVEL_LABEL[sentence.level]}
              </span>
              {isAdmin && (
                <Link
                  to="/teacher"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold font-kr bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                  title="선생님 모드 진입"
                >
                  <GraduationCap className="size-3" />
                  선생님 모드
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

        {answerInputMode && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 flex items-center gap-2">
            <Pencil className="size-4 text-primary shrink-0" />
            <p className="text-[12px] font-semibold text-primary font-kr">
              정답 입력 모드 — 선택한 항목이 즉시 정답으로 저장됩니다 (채점 없음)
            </p>
          </div>
        )}

        {eraserMode && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-destructive font-kr">
              🧽 지우개 모드 — 다음 클릭 1회만 삭제 후 자동 해제됩니다 (ESC로 즉시 취소)
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

              // 구두점/괄호: 비대화형 (단, 인접 완료 layer 사이면 그 자체에 보라 배경)
              if (punct) {
                const fillBg = sharedWithPrev && sharedWithNext;
                return (
                  <span
                    key={idx}
                    className={cn(
                      "text-base font-medium text-foreground self-end leading-tight px-0.5 py-0.5",
                      fillBg && "bg-primary/[0.07] border-b border-primary/20",
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
              if (isCompleted && innerBadge) {
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
              const outerBadge = outerProgress ? buildElementBadge(outerProgress) : undefined;
              const outerSubLabel = outerProgress ? buildSubBadgeLabel(outerProgress) : undefined;
              const outerIsFirstLocal = outerIsClauseLocal && idx === outerIndices[0];
              const outerIsLastLocal =
                outerIsClauseLocal && idx === outerIndices[outerIndices.length - 1];
              const outerAnchorIdx = findAnchorIdx(outerIndices, outerProgress);
              const outerIsBadgeAnchor = outerIsClauseLocal && idx === outerAnchorIdx;

              // === 절 브래킷: 외곽 progress의 element badge 기준 ===
              const bracketRole: "S" | "V" | "O" | "C" | "M" | undefined =
                outerIsClauseLocal ? outerBadge ?? "M" : undefined;

              // === 부배지 layer depth 계산 ===
              // ownersHere 순서: 외곽(긴 범위, Layer 1) → 안쪽(짧은 범위, Layer N).
              const totalLayers = ownersHere.length;
              const innerLayerIdx = ownerId ? ownersHere.indexOf(ownerId) : -1;
              const outerLayerIdx = outerOwnerId ? ownersHere.indexOf(outerOwnerId) : -1;
              const innerLayerNum = innerLayerIdx >= 0 ? innerLayerIdx + 1 : 1;
              const outerLayerNum = outerLayerIdx >= 0 ? outerLayerIdx + 1 : 1;
              // Layer 번호 표기 규칙: 단층(혼자)이거나 Layer 1이면 숫자 숨김. 2부터만.
              const showInnerLayerNum = totalLayers >= 2 && innerLayerNum >= 2;
              const showOuterLayerNum = totalLayers >= 2 && outerLayerNum >= 2;

              // 부배지(품사 라벨) — owner 첫 인덱스에만, 절은 별도 외곽 부배지로 처리
              const koreanLabel =
                isCompleted && isInnerBadgeAnchor && !isClauseSelection ? innerSubLabel : undefined;
              const outerKoreanLabel =
                outerIsClauseLocal && outerIsBadgeAnchor ? outerSubLabel : undefined;

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
                isCompleted && !isSelected && !isClauseSelection && !isParallelSelection;

              // === Owner 종류별 배경 분기 ===
              // clause: 배경 거의 제거 (대괄호로 표현) / parallel: 진한 박스 / general: 옅은 보라 누적
              const layerVars = ["--layer-1", "--layer-2", "--layer-3", "--layer-4"];
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
                    return `linear-gradient(hsl(var(${v}) / 0.20), hsl(var(${v}) / 0.20))`;
                  })
                  .filter((x): x is string => !!x);
                if (layers.length === 0) return undefined;
                return layers.join(", ");
              };
              const wordLayerBg = buildLayerBg(ownersHere);

              // 병렬 owner가 이 인덱스를 포함하면 박스 시각화
              const parallelOwnerHere = ownersHere.find((oid) => isParallelProgress(progressMap[oid]));
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
                      hintWrongOwnerIds && ownerId && hintWrongOwnerIds.has(ownerId) &&
                        "ring-2 ring-amber-500/60 ring-offset-1 rounded-md bg-amber-500/5",
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
                      // 부배지 수직 stagger — 동일 단어에 2개 anchor면 outer를 inner보다 위로,
                      // 동일 anchor 단어가 인접 단어와 같은 layer 깊이일 때도 layer 번호로 vertical offset
                      // 인접 anchor 충돌 회피를 위해 inner는 -18px (기본), outer는 -34px (한 칸 위)
                      const innerTop = -18;
                      const outerTop = koreanLabel ? -34 : -18;
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
              const spacerNode = !isLastWord ? (
                <span
                  key={`sp-${idx}`}
                  className={cn(
                    "inline-flex items-end self-end leading-none",
                    spacerSelectedBridge && "bg-primary/25",
                    spacerCompletedBridge && "bg-primary/[0.07] border-b border-primary/20",
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
                        🟫 {idiomMark.surface}
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

          {/* 선택 도구바: 지우개 + 관용구 — 항상 노출 */}
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
              if (s === "analysis" && !preDone) return;
              if (s === "translation" && !analysisDone) return;
              if (s === "wordtest" && !translationDone) return;
              setLearningStep(s);
            }}
          />
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
                  }}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!preDone}
                    onClick={() => setLearningStep("analysis")}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
                  >
                    다음: 구문 분석 →
                  </button>
                </div>
              </>
            );
          })()}
          {learningStep === "analysis" && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!analysisDone}
                onClick={() => setLearningStep("translation")}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
              >
                다음: 한글 해석 →
              </button>
            </div>
          )}
          {learningStep === "translation" && (
            <>
              <TranslationStep
                sentenceId={sentence.id}
                englishSentence={wordUnits.map((w) => w.word).join(" ")}
                onSubmitted={() => {
                  setTranslationDone(true);
                  upsertSentenceProgress(sentence.id, { translation_done: true }).catch(() => {});
                }}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!translationDone}
                  onClick={() => setLearningStep("wordtest")}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed font-kr"
                >
                  다음: 단어 테스트 →
                </button>
              </div>
            </>
          )}
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
                    const passedAtIso = new Date().toISOString();
                    setPassedAt(passedAtIso);
                    void upsertSentenceProgress(sentence.id, {
                      word_test_done: true,
                      status: "pass",
                      passed_at: passedAtIso,
                    }).catch(() => {});
                    void import("@/lib/nextSentence").then(({ advanceAfterPass }) =>
                      advanceAfterPass(sentence),
                    );
                  }}
                />
              </>
            );
          })()}
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
            공우정바른학원 · GWJ Syntax Master · v0.5
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

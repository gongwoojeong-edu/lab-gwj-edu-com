import { useEffect, useMemo, useState } from "react";

import {
  AnalysisPanel,
  AnswerInputModeProvider,
  type NounProgress,
  type AdjProgress,
  type AdvProgress,
  type EtcProgress,
  type VerbProgress,
  type StepStatus,
} from "@/components/analyzer/AnalysisPanel";
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
import { ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";
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
  clearCustomAnswers,
  mergeAnswer,
  type CustomAnswerMap,
} from "@/lib/customAnswers";
import {
  loadIdioms,
  upsertIdiom,
  removeIdiom,
  findIdiomCoveringIndex,
  findIdiomByIndices,
  getAllIdiomsFlat,
  type IdiomMap,
  type IdiomMark,
} from "@/lib/idioms";
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

const Index = () => {
  const isMobile = useIsMobile();
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const sentence = SENTENCES[sentenceIdx];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, WordProgress>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ===== 정답 입력 모드 =====
  const [answerInputMode, setAnswerInputMode] = useState(false);
  const [customAnswers, setCustomAnswers] = useState<CustomAnswerMap>({});

  // ===== 숙어 / Phrase store (SVOC와 독립) =====
  const [idiomMap, setIdiomMap] = useState<IdiomMap>({});

  useEffect(() => {
    setCustomAnswers(loadCustomAnswers());
    setIdiomMap(loadIdioms());
  }, []);

  const resetCustomAnswers = () => {
    clearCustomAnswers();
    setCustomAnswers({});
    setProgressMap({});
    setCompletedSelectionMap({});
    setSelectedId(null);
    setSelectedWordIndices([]);
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
    if (isSpanOwnerId(ownerId)) {
      return mergeAnswer(SPAN_VIRTUAL_ANSWER, customAnswers[ownerId]);
    }
    if (token && ownerId === token.id) {
      return mergeAnswer(token.answer, customAnswers[token.id]);
    }
    return mergeAnswer((token?.answer ?? SPAN_VIRTUAL_ANSWER), customAnswers[ownerId]);
  };

  const completedCount = new Set(
    Object.entries(progressMap)
      .filter(([, value]) => value.completed)
      .map(([ownerId]) => getOwnerTokenId(ownerId)),
  ).size;
  const sentenceComplete = completedCount === analyzableIds.length && analyzableIds.length > 0;

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
    const tokenIds = Array.from(
      new Set(sorted.map((index) => wordUnits[index]?.tokenId).filter(Boolean)),
    ) as string[];

    if (tokenIds.length !== 1 || sorted.length !== 1) {
      return pickSelectedIdFromIndices(sorted);
    }

    return `${tokenIds[0]}${OWNER_KEY_SEPARATOR}${sorted[0]}`;
  };

  const saveCustom = (ownerId: string, patch: Record<string, unknown>) => {
    const next = upsertCustomAnswer(ownerId, patch);
    setCustomAnswers(next);
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

  // ===== 단어 단위 선택 =====
  // 완료 영역 클릭 정책:
  //   - 단일 토큰 클릭은 항상 새 빈 분석으로 시작 (인접 완료 토큰 owner 자동 복원 X)
  //   - owner 복원은 사용자가 명시적으로 완료 토큰 묶음 전체를 다시 드래그/클릭으로 선택했을 때만
  const handleWordMouseDown = (idx: number, e: React.MouseEvent) => {
    if (isPunct(wordUnits[idx].word)) return;
    e.stopPropagation();

    // 이 인덱스를 포함하는 완료 owner들
    const owners = Object.entries(completedSelectionMap).filter(([, indices]) =>
      indices.includes(idx),
    );

    // 단일 토큰 owner(자기 자신만)인 경우에만 owner 복원 — 다중 토큰 owner는 자동 복원 X
    const singleSelfOwner = owners.find(
      ([, indices]) => indices.length === 1 && indices[0] === idx,
    );
    if (singleSelfOwner && progressMap[singleSelfOwner[0]]?.completed) {
      const [ownerId] = singleSelfOwner;
      setSelectedId(ownerId);
      setSelectedWordIndices([idx]);
      setDragStart(idx);
      return;
    }

    // 일반 경로: 새 빈 분석 시작 (다중 토큰 완료 영역과 충돌해도 상속 X)
    setDragStart(idx);
    setSelectedWordIndices((prev) => {
      let next: number[];
      if (prev.includes(idx)) {
        next = prev.filter((i) => i !== idx);
      } else {
        next = [...prev, idx].sort((a, b) => a - b);
      }
      // selectedId는 현재 선택의 동사 토큰 우선
      const sid = pickSelectedIdFromIndices(next);
      if (sid) {
        setSelectedId(sid);
        setProgressMap((pm) => (pm[sid] ? pm : { ...pm, [sid]: emptyProgress() }));
      } else {
        setSelectedId(null);
      }
      return next;
    });
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

  // ===== 지우개: 선택된 단어들의 분석만 초기화 (숙어 마크는 유지) =====
  const handleEraser = () => {
    const ownerIds = new Set<string>();
    const indices = activeSelectionIndices.slice();
    indices.forEach((i) => {
      const ownerId = buildOwnerId([i]);
      if (ownerId) ownerIds.add(ownerId);
    });
    // 추가: 완료된 토큰 owner도 모두 포함 (selectedWordIndices가 완료 영역의 일부일 때)
    indices.forEach((i) => {
      const owner = Object.entries(completedSelectionMap).find(([, idxs]) =>
        idxs.includes(i),
      )?.[0];
      if (owner) ownerIds.add(owner);
    });
    setProgressMap((prev) => {
      const next = { ...prev };
      ownerIds.forEach((id) => delete next[id]);
      return next;
    });
    setCompletedSelectionMap((prev) => {
      const next = { ...prev };
      ownerIds.forEach((id) => delete next[id]);
      return next;
    });
    // clauseStart/clauseEnd customAnswer도 함께 정리
    if (ownerIds.size > 0) {
      const nextCustom = { ...customAnswers };
      let touched = false;
      ownerIds.forEach((id) => {
        const cur = nextCustom[id];
        if (cur && ("clauseStart" in cur || "clauseEnd" in cur)) {
          const { clauseStart: _cs, clauseEnd: _ce, ...rest } = cur as Record<string, unknown>;
          nextCustom[id] = rest;
          touched = true;
        }
      });
      if (touched) {
        setCustomAnswers(nextCustom);
        // localStorage에도 반영
        try {
          window.localStorage.setItem("gwj.customAnswers.v1", JSON.stringify(nextCustom));
        } catch {
          /* ignore */
        }
      }
    }
    // 관용구(브라운톤) — active 인덱스를 덮는 idiom 마크도 함께 제거
    if (indices.length > 0) {
      const sentenceMarks = idiomMap[sentence.id] ?? [];
      const toRemove = sentenceMarks.filter((m) =>
        m.indices.some((i) => indices.includes(i)),
      );
      if (toRemove.length > 0) {
        let nextMap = idiomMap;
        toRemove.forEach((m) => {
          nextMap = removeIdiom(sentence.id, m.indices);
        });
        setIdiomMap(nextMap);
      }
    }
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
      saveCustom(selectedId, { pos: p });
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
    const correct = answerInputMode || selectedToken?.answer.pos === p;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      pos: p,
      posStatus: correct ? "correct" : "wrong",
      noun: correct ? prev.noun : emptyNoun(),
      adj: correct ? prev.adj : emptyAdj(),
      adv: correct ? prev.adv : emptyAdv(),
      etc: correct ? prev.etc : emptyEtc(),
      verb: correct ? prev.verb : emptyVerb(),
      completed: false,
    }));
  };

  // ===== 명사 =====
  const handleNounForm = (f: NounForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { form: f });
    const ans = (selectedToken?.answer ?? null) as NounAnswer | null;
    const correct = answerInputMode || ans?.form === f;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        element: correct ? prev.noun.element : null,
        elementStatus: "idle",
        role: correct ? prev.noun.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleNounElement = (e: SentenceElement) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { element: e });
    const ans = (selectedToken?.answer ?? null) as NounAnswer | null;
    const correct = answerInputMode || ans?.element === e;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        element: e,
        elementStatus: correct ? "correct" : "wrong",
        role: correct ? prev.noun.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleNounRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { role: r });
    const ans = (selectedToken?.answer ?? null) as NounAnswer | null;
    const correct = answerInputMode || ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: { ...prev.noun, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // 평탄화 핸들러: element + role 한 번에 처리 (M은 role=null로 즉시 완료)
  const handleNounElementRole = (e: SentenceElement, r: string | null) => {
    if (!selectedId) return;
    if (answerInputMode) {
      if (selectedId) saveCustom(selectedId, { element: e, role: r ?? "수식어" });
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
    const ans = (selectedToken?.answer ?? null) as NounAnswer | null;
    const elementOk = ans?.element === e;
    if (e === "M") {
      // M: role 없이 element만 맞으면 완료
      updateProgress(selectedId, (prev) => ({
        ...prev,
        noun: {
          ...prev.noun,
          element: e,
          elementStatus: elementOk ? "correct" : "wrong",
          role: elementOk ? (ans?.role ?? "수식어") : null,
          roleStatus: elementOk ? "correct" : "idle",
        },
        completed: elementOk,
      }));
      return;
    }
    const roleOk = elementOk && r !== null && ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      noun: {
        ...prev.noun,
        element: e,
        elementStatus: elementOk ? "correct" : "wrong",
        role: r,
        roleStatus: !elementOk ? "idle" : roleOk ? "correct" : "wrong",
      },
      completed: roleOk,
    }));
  };

  // ===== 형용사 =====
  const handleAdjForm = (f: AdjForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { form: f });
    const ans = (selectedToken?.answer ?? null) as AdjAnswer | null;
    const correct = answerInputMode || ans?.form === f;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        element: correct ? prev.adj.element : null,
        elementStatus: "idle",
        role: correct ? prev.adj.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdjElement = (e: "C" | "M") => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { element: e });
    const ans = (selectedToken?.answer ?? null) as AdjAnswer | null;
    const correct = answerInputMode || ans?.element === e;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        element: e,
        elementStatus: correct ? "correct" : "wrong",
        role: correct ? prev.adj.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdjRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { role: r });
    const ans = (selectedToken?.answer ?? null) as AdjAnswer | null;
    const correct = answerInputMode || ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: { ...prev.adj, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  const handleAdjElementRole = (e: "C" | "M", r: string | null) => {
    if (!selectedId) return;
    if (answerInputMode) {
      if (selectedId) saveCustom(selectedId, { element: e, role: r ?? "수식어" });
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
    const ans = (selectedToken?.answer ?? null) as AdjAnswer | null;
    const elementOk = ans?.element === e;
    if (e === "M") {
      updateProgress(selectedId, (prev) => ({
        ...prev,
        adj: {
          ...prev.adj,
          element: e,
          elementStatus: elementOk ? "correct" : "wrong",
          role: elementOk ? (ans?.role ?? "수식어") : null,
          roleStatus: elementOk ? "correct" : "idle",
        },
        completed: elementOk,
      }));
      return;
    }
    const roleOk = elementOk && r !== null && ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adj: {
        ...prev.adj,
        element: e,
        elementStatus: elementOk ? "correct" : "wrong",
        role: r,
        roleStatus: !elementOk ? "idle" : roleOk ? "correct" : "wrong",
      },
      completed: roleOk,
    }));
  };

  // ===== 부사 =====
  const handleAdvForm = (f: AdvForm) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { form: f });
    const ans = (selectedToken?.answer ?? null) as AdvAnswer | null;
    const correct = answerInputMode || ans?.form === f;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        form: f,
        formStatus: correct ? "correct" : "wrong",
        subtype: correct ? prev.adv.subtype : null,
        subtypeStatus: "idle",
        role: correct ? prev.adv.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdvSubtype = (s: AdvSubtype) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { subtype: s });
    const ans = (selectedToken?.answer ?? null) as AdvAnswer | null;
    const correct = answerInputMode || ans?.subtype === s;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: {
        ...prev.adv,
        subtype: s,
        subtypeStatus: correct ? "correct" : "wrong",
        role: correct ? prev.adv.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleAdvRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { role: r });
    const ans = (selectedToken?.answer ?? null) as AdvAnswer | null;
    const correct = answerInputMode || ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      adv: { ...prev.adv, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  // ===== 기타 =====
  const handleEtcKind = (k: EtcKind) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { kind: k });
    const ans = (selectedToken?.answer ?? null) as EtcAnswer | null;
    const correct = answerInputMode || ans?.kind === k;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      etc: {
        ...prev.etc,
        kind: k,
        kindStatus: correct ? "correct" : "wrong",
        role: correct ? prev.etc.role : null,
        roleStatus: "idle",
      },
      completed: false,
    }));
  };

  const handleEtcRole = (r: string) => {
    if (!selectedId) return;
    if (answerInputMode && selectedId) saveCustom(selectedId, { role: r });
    const ans = (selectedToken?.answer ?? null) as EtcAnswer | null;
    const correct = answerInputMode || ans?.role === r;
    updateProgress(selectedId, (prev) => ({
      ...prev,
      etc: { ...prev.etc, role: r, roleStatus: correct ? "correct" : "wrong" },
      completed: correct,
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
      if (selectedId) saveCustom(selectedId, {
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
    const ans = (selectedToken?.answer ?? null) as VerbAnswer | null;
    const correct = !!ans &&
      (ans.number ?? null) === v.number &&
      (ans.tense ?? null) === v.tense &&
      arraysEqualSet(ans.aspect ?? [], v.aspect) &&
      (ans.voice === "수동") === v.voice &&
      (ans.proVerb ?? false) === v.proVerb;

    updateProgress(selectedId, (prev) => ({
      ...prev,
      verb: { ...prev.verb, confirmStatus: correct ? "correct" : "wrong" },
      completed: correct,
    }));
  };

  useEffect(() => {
    if (!selectedId || !progress.completed) return;

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

  const goToSentence = (next: number) => {
    if (next < 0 || next >= SENTENCES.length) return;
    setSentenceIdx(next);
    setSelectedId(null);
    setSelectedWordIndices([]);
    setDragStart(null);
    setProgressMap({});
    setCompletedSelectionMap({});
    setDrawerOpen(false);
  };

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
    // 관용구는 분석과 독립이지만 단일 단어에서는 주도 UI가 되지 않음
    idiomEnabled: activeSelectionIndices.length >= 2,
    idiomExistingMeaning: currentSelectionIdiom()?.meaning,
    onIdiomSave: handleIdiomSave,
    onIdiomRemove: handleIdiomRemove,
    canErase: activeSelectionIndices.length > 0,
    onEraseSelection: handleEraser,
  };

  const allIdiomsCount = useMemo(() => getAllIdiomsFlat(idiomMap).length, [idiomMap]);

  // 인덱스별 모든 owner들 (다층 layer 지원: 좁은 owner = 안쪽 layer 우선)
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
          (completedSelectionMap[a]?.length ?? 0) - (completedSelectionMap[b]?.length ?? 0),
      );
    });
    return m;
  }, [completedSelectionMap]);

  // 안쪽(좁은) layer owner — 부속 배지/한글 라벨용
  // 외곽(넓은) layer owner — 절 wrapper/배경용
  const innerOwnerByIndex = useMemo(() => {
    const m: Record<number, string | undefined> = {};
    Object.entries(completedOwnersByIndex).forEach(([k, owners]) => {
      m[Number(k)] = owners[0];
    });
    return m;
  }, [completedOwnersByIndex]);
  const outerOwnerByIndex = useMemo(() => {
    const m: Record<number, string | undefined> = {};
    Object.entries(completedOwnersByIndex).forEach(([k, owners]) => {
      m[Number(k)] = owners[owners.length - 1];
    });
    return m;
  }, [completedOwnersByIndex]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="glass-panel sticky top-0 z-50 border-b px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
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
            <label
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm cursor-pointer transition-colors",
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-bold font-kr hover:bg-destructive/20 transition-colors"
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
            )}
            <AdminHintToggle />
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold font-kr transition-colors border"
                  style={{
                    background: "hsl(var(--idiom-bg))",
                    color: "hsl(var(--idiom-fg))",
                    borderColor: "hsl(var(--idiom-border))",
                  }}
                  title="등록된 관용구 전체 보기"
                >
                  <BookMarked className="size-3" />
                  관용구 {allIdiomsCount}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-kr">📚 등록된 관용구 / Phrase</DialogTitle>
                </DialogHeader>
                {allIdiomsCount === 0 ? (
                  <p className="text-sm text-muted-foreground font-kr py-6 text-center">
                    아직 등록된 관용구가 없습니다. 정답 입력 모드에서 단어를 선택하고 관용구를 저장하세요.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {getAllIdiomsFlat(idiomMap).map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border p-2.5 flex items-baseline justify-between gap-3"
                        style={{
                          background: "hsl(var(--idiom-bg) / 0.4)",
                          borderColor: "hsl(var(--idiom-border))",
                        }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: "hsl(var(--idiom-fg))" }}>
                            {m.surface}
                          </p>
                          <p className="text-xs font-kr text-foreground/80 mt-0.5">{m.meaning}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {m.sentenceId}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DialogContent>
            </Dialog>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
              <div className="size-2 rounded-full bg-element-o animate-pulse" />
              <span className="text-[11px] font-medium text-muted-foreground font-kr">
                {completedCount} / {analyzableIds.length} 완료
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Desktop: fixed top-right panel */}
      <div className="hidden lg:block fixed top-[76px] right-4 z-40 w-[min(34vw,460px)]">
        <AnswerInputModeProvider value={answerInputMode}>
          <AnalysisPanel {...panelProps} />
        </AnswerInputModeProvider>
      </div>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 pt-4 lg:pt-24 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] font-bold text-primary-glow tracking-widest uppercase font-kr">
              문장 분석 · No. {String(sentence.no).padStart(3, "0")}
            </p>
            <KoreanHintButton korean={sentence.korean} />
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => goToSentence(sentenceIdx - 1)}
              disabled={sentenceIdx === 0}
              className="size-8 rounded-lg bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="이전 문장"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[11px] font-bold tabular-nums text-muted-foreground px-1">
              {sentenceIdx + 1} / {SENTENCES.length}
            </span>
            <button
              onClick={() => goToSentence(sentenceIdx + 1)}
              disabled={sentenceIdx === SENTENCES.length - 1}
              className="size-8 rounded-lg bg-secondary text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="다음 문장"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {answerInputMode && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 flex items-center gap-2">
            <Pencil className="size-4 text-primary shrink-0" />
            <p className="text-[12px] font-semibold text-primary font-kr">
              정답 입력 모드 — 선택한 항목이 즉시 정답으로 저장됩니다 (채점 없음)
            </p>
          </div>
        )}

        <section className="glass-panel rounded-2xl p-4 lg:p-6 relative overflow-hidden">
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
          <div
            className="flex flex-wrap items-end gap-y-7 pt-2 pb-1 select-none"
            onMouseLeave={() => isDragging && finalizeSelection()}
          >
            {wordUnits.map((u, idx) => {
              const word = u.word;
              const punct = isPunct(word);

              // 인접 완료 layer 공유 여부 (앞/뒤 단어가 같은 owner에 속하면 사이 공백을 보라로 채움)
              const ownersHere = completedOwnersByIndex[idx] ?? [];
              const ownersPrev = idx > 0 ? completedOwnersByIndex[idx - 1] ?? [] : [];
              const ownersNext =
                idx < wordUnits.length - 1 ? completedOwnersByIndex[idx + 1] ?? [] : [];
              const sharedWithPrev = ownersHere.find((o) => ownersPrev.includes(o));
              const sharedWithNext = ownersHere.find((o) => ownersNext.includes(o));

              // 구두점/괄호: 비대화형 (단, 인접 완료 layer 사이면 그 자체에 보라 배경)
              if (punct) {
                const fillBg = sharedWithPrev && sharedWithNext;
                return (
                  <span
                    key={idx}
                    className={cn(
                      "text-base font-medium text-foreground self-end leading-tight px-0.5",
                      fillBg && "bg-primary/[0.10]",
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

              // 외곽 layer (절) — 인덱스 범위만 잡고, 의미는 progress 에서.
              const outerOwnerId = outerOwnerByIndex[idx];
              const outerIndices = outerOwnerId
                ? completedSelectionMap[outerOwnerId] ?? []
                : [];

              // === 안쪽 layer element 결정 — 100% progress 기반 (Item 3, 4) ===
              // 원본 ownerAnswer.koreanLabel/pos 추론 금지.
              const innerBadge = wp ? buildElementBadge(wp) : undefined;
              const innerSubLabel = wp ? buildSubBadgeLabel(wp) : undefined;
              const isClauseSelection = wp ? isClauseProgress(wp) : false;
              let completedElement: "S" | "V" | "O" | "C" | undefined;
              let isModifier = false;
              if (isCompleted && innerBadge) {
                if (innerBadge === "M") isModifier = true;
                else if (!isClauseSelection) {
                  completedElement = innerBadge;
                }
              }

              // === 절(외곽 layer) 정보도 동일 progress 기반 ===
              const outerProgress = outerOwnerId ? progressMap[outerOwnerId] : undefined;
              const outerIsClauseLocal =
                !!outerProgress && isClauseProgress(outerProgress);
              const outerBadge = outerProgress ? buildElementBadge(outerProgress) : undefined;
              const outerSubLabel = outerProgress ? buildSubBadgeLabel(outerProgress) : undefined;
              const outerIsFirstLocal = outerIsClauseLocal && idx === outerIndices[0];
              const outerIsLastLocal =
                outerIsClauseLocal && idx === outerIndices[outerIndices.length - 1];
              const outerMidIdx = outerIndices.length
                ? outerIndices[Math.floor((outerIndices.length - 1) / 2)]
                : -1;
              const outerIsBadgeAnchor = outerIsClauseLocal && idx === outerMidIdx;

              // === 절 브래킷: 외곽 progress의 element badge 기준 ===
              const bracketRole: "S" | "V" | "O" | "C" | "M" | undefined =
                outerIsClauseLocal ? outerBadge ?? "M" : undefined;

              // 부배지(품사 라벨) — 단어 layer 우선
              const koreanLabel =
                isCompleted && isFirstOfSelection ? innerSubLabel : undefined;

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

              // 외곽 절(보라) 배경은 outerIsClauseLocal 로 처리.
              // 안쪽 완료(보라 진하게) 배경
              const innerCompleteBg =
                isCompleted && !isSelected && !isModifier && !isClauseSelection;

              const wordNode = (
                <span
                  key={idx}
                  className={cn(
                    "inline-flex items-end leading-none whitespace-nowrap",
                    // 외곽 절 배경 — 시작/끝에 좌/우 패딩으로 시각화, 사이 공백은 별도 span이 처리
                    outerIsClauseLocal && "bg-primary/[0.06]",
                  )}
                >
                  {bracketRole && outerIsFirstLocal && (
                    <span
                      className={cn("self-end pr-0.5 text-[18px]", bracketColorClass, bracketWeight)}
                      aria-hidden
                    >
                      [
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleWordMouseDown(idx, e);
                    }}
                    onMouseEnter={() => handleWordMouseEnter(idx)}
                    onMouseUp={handleWordMouseUp}
                    className={cn(
                      "relative inline-flex flex-col items-center cursor-pointer leading-none",
                      idiomMark && "py-0.5",
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
                    {koreanLabel && (
                      <span className="absolute -top-3.5 text-[9px] font-semibold font-kr text-primary whitespace-nowrap tracking-tight leading-none pointer-events-none">
                        {koreanLabel}
                      </span>
                    )}
                    <span
                      className={cn(
                        "px-1 py-0.5 text-[16px] font-medium tracking-tight leading-tight text-foreground transition-colors",
                        // 안쪽 완료 (부속/일반) — 진한 보라
                        innerCompleteBg && "bg-primary/[0.14] border-b border-primary/30",
                        // 안쪽이 modifier/clause면 텍스트만 살짝 dim
                        isCompleted && !isSelected && (isModifier || isClauseSelection) &&
                          "text-foreground/80",
                        // 선택된 인덱스 하이라이트
                        isSelected && "bg-primary/25",
                        // 둥근 모서리: 자기 layer의 시작/끝만
                        isFirstOfSelection && "rounded-l-sm",
                        isLastOfSelection && "rounded-r-sm",
                        !isFirstOfSelection && !isLastOfSelection && isCompleted && "rounded-none",
                      )}
                    >
                      {word}
                    </span>
                    {completedElement && isFirstOfSelection && !isClauseSelection && (
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
                    {/* 절(접SV) — 단어와 동일한 SVOC 배지 + 부배지 (Item 4) */}
                    {outerIsClauseLocal && outerIsBadgeAnchor && outerBadge && outerBadge !== "M" && (
                      <span
                        className={cn(
                          "absolute -bottom-7 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight pointer-events-none whitespace-nowrap",
                          outerBadge === "S" && "badge-s",
                          outerBadge === "V" && "badge-v",
                          outerBadge === "O" && "badge-o",
                          outerBadge === "C" && "badge-c",
                        )}
                      >
                        {outerBadge}
                        {outerSubLabel ? ` · ${outerSubLabel}` : ""}
                      </span>
                    )}
                    {outerIsClauseLocal && outerIsBadgeAnchor && (!outerBadge || outerBadge === "M") && outerSubLabel && (
                      <span className="absolute -bottom-7 px-1 py-0 rounded text-[9px] font-bold leading-none tracking-tight pointer-events-none whitespace-nowrap bg-primary/15 text-primary">
                        {outerSubLabel}
                      </span>
                    )}
                  </span>
                  {bracketRole && outerIsLastLocal && (
                    <span
                      className={cn("self-end pl-0.5 text-[18px]", bracketColorClass, bracketWeight)}
                      aria-hidden
                    >
                      ]
                    </span>
                  )}
                </span>
              );

              // 토큰 사이 공백 span — 다음 단어와 같은 owner를 공유하면 보라로 채움
              const isLastWord = idx === wordUnits.length - 1;
              const spacerBg =
                !isLastWord && (sharedWithNext || (outerIsClauseLocal && ownersNext.includes(outerOwnerId ?? "")))
                  ? "bg-primary/[0.10]"
                  : sharedWithNext === undefined && outerIsClauseLocal && outerOwnerByIndex[idx + 1] === outerOwnerId
                  ? "bg-primary/[0.06]"
                  : "";
              const spacerNode = !isLastWord ? (
                <span
                  key={`sp-${idx}`}
                  className={cn("inline-block self-end leading-tight", spacerBg)}
                  aria-hidden
                >
                  {"\u00A0"}
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

          {/* 선택 도구바: 지우개 + 선택 해제 — 항상 노출 (Item 2, 5) */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-kr">
              {selectedWordIndices.length > 0
                ? `선택됨 · ${selectedWordIndices.length}개 단어`
                : "선택 없음"}
            </span>
            <button
              type="button"
              onClick={handleEraser}
              disabled={activeSelectionIndices.length === 0}
              className="px-2.5 py-1 rounded-md bg-destructive/10 text-destructive text-[11px] font-bold font-kr hover:bg-destructive/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="현재 선택 또는 완료된 분석 데이터를 모두 삭제"
            >
              🧽 지우개
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedWordIndices([]);
                setSelectedId(null);
                setDrawerOpen(false);
              }}
              disabled={selectedWordIndices.length === 0 && !selectedId}
              className="px-2.5 py-1 rounded-md bg-secondary text-foreground text-[11px] font-bold font-kr hover:bg-secondary/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="하이라이트만 해제 (저장 데이터 유지)"
            >
              선택 해제
            </button>
          </div>

          <div
            className="absolute -bottom-10 -right-10 size-64 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: "hsl(var(--primary-glow) / 0.2)" }}
          />
        </section>

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
      </main>

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

      <footer className="max-w-7xl mx-auto px-6 lg:px-8 pb-10 pt-4">
        <div className="flex justify-between items-center border-t border-border pt-6 text-[11px] text-muted-foreground font-kr">
          <span className="font-bold tracking-widest font-kr">
            공우정바른학원 · GWJ Syntax Master · v0.5
          </span>
          <span className="italic">설명할 수 있어야 진짜 아는 것이다</span>
        </div>
      </footer>
    </div>
    </TooltipProvider>
  );
};

export default Index;

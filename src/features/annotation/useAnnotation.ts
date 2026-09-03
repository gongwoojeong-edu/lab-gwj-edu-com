// ============================================================
// useAnnotation — 판서 로드 · 자동저장 · undo/redo 스택
//   · 자동저장: 스트로크 완료 후 1.5초 debounce → fn_save_annotation
//   · 실패해도 화면의 필기는 유지. 툴바에서 재시도.
//   · 하드삭제 없음 — 서버 삭제는 fn_delete_annotation(soft)
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnnotationScope, Strokes } from "./types";

const UNDO_LIMIT = 30;
const SAVE_DEBOUNCE_MS = 1500;

export type SaveState = "idle" | "dirty" | "saving" | "error";

interface Params {
  sentenceId: string;
  studentId: string | null;
  scope?: AnnotationScope;
  /** false 면 서버 저장을 하지 않는다(읽기 전용 뷰) */
  canEdit: boolean;
}

interface Result {
  strokes: Strokes;
  loaded: boolean;
  aspect: number;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  /** 새 스트로크 커밋(되돌리기 스택에 이전 상태 push) */
  commit: (next: Strokes, aspect: number) => void;
  /** 그리는 중 미리보기 — 스택/저장 없음 */
  setPreview: (next: Strokes) => void;
  undo: () => void;
  redo: () => void;
  retry: () => void;
  /** 외부(실시간 수신)에서 통째로 교체 */
  replace: (next: Strokes, aspect: number) => void;
}

export const useAnnotation = ({
  sentenceId,
  studentId,
  scope = "teacher",
  canEdit,
}: Params): Result => {
  const [strokes, setStrokes] = useState<Strokes>([]);
  const [aspect, setAspect] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const undoStack = useRef<Strokes[]>([]);
  const redoStack = useRef<Strokes[]>([]);
  const [stackVer, setStackVer] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ strokes: Strokes; aspect: number } | null>(null);

  // ---------- 로드 ----------
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setStrokes([]);
    undoStack.current = [];
    redoStack.current = [];
    setStackVer((v) => v + 1);

    const run = async () => {
      let q = supabase
        .from("sentence_annotations")
        .select("strokes, aspect")
        .eq("sentence_id", sentenceId)
        .eq("scope", scope)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      q = studentId ? q.eq("user_id", studentId) : q.is("user_id", null);
      const { data } = await q.maybeSingle();
      if (!alive) return;
      if (data) {
        setStrokes((data.strokes as unknown as Strokes) ?? []);
        setAspect(Number(data.aspect) || 1);
      }
      setLoaded(true);
    };
    run().catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [sentenceId, studentId, scope]);

  // ---------- 저장 ----------
  const flush = useCallback(async () => {
    const payload = pending.current;
    if (!payload || !canEdit) return;
    setSaveState("saving");
    const { error } = await supabase.rpc("fn_save_annotation", {
      p_sentence_id: sentenceId,
      p_user_id: studentId,
      p_scope: scope,
      p_strokes: payload.strokes as unknown as never,
      p_aspect: payload.aspect,
    });
    if (error) {
      setSaveState("error");
      return;
    }
    pending.current = null;
    setSaveState("idle");
  }, [canEdit, sentenceId, studentId, scope]);

  const scheduleSave = useCallback(
    (next: Strokes, nextAspect: number) => {
      if (!canEdit) return;
      pending.current = { strokes: next, aspect: nextAspect };
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [canEdit, flush],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // 미저장분 이탈 경고
  useEffect(() => {
    if (saveState === "idle") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  const commit = useCallback(
    (next: Strokes, nextAspect: number) => {
      setStrokes((prev) => {
        undoStack.current = [...undoStack.current, prev].slice(-UNDO_LIMIT);
        redoStack.current = [];
        setStackVer((v) => v + 1);
        return next;
      });
      setAspect(nextAspect);
      scheduleSave(next, nextAspect);
    },
    [scheduleSave],
  );

  const setPreview = useCallback((next: Strokes) => setStrokes(next), []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setStrokes((cur) => {
      redoStack.current = [...redoStack.current, cur].slice(-UNDO_LIMIT);
      scheduleSave(prev, aspect);
      return prev;
    });
    setStackVer((v) => v + 1);
  }, [aspect, scheduleSave]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setStrokes((cur) => {
      undoStack.current = [...undoStack.current, cur].slice(-UNDO_LIMIT);
      scheduleSave(next, aspect);
      return next;
    });
    setStackVer((v) => v + 1);
  }, [aspect, scheduleSave]);

  const retry = useCallback(() => {
    void flush();
  }, [flush]);

  const replace = useCallback((next: Strokes, nextAspect: number) => {
    setStrokes(next);
    setAspect(nextAspect || 1);
    setLoaded(true);
  }, []);

  return {
    strokes,
    aspect,
    loaded,
    saveState,
    canUndo: stackVer >= 0 && undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    commit,
    setPreview,
    undo,
    redo,
    retry,
    replace,
  };
};

// ============================================================
// AnnotationLayer — 캔버스 + 툴바 + 로드/저장 훅을 묶은 사용 단위
//   · canEdit=true  : 선생님 판서 (툴바 표시, 자동저장, 실시간 송신)
//   · canEdit=false : 읽기 전용 표시 (학생 화면 — 실시간 수신)
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationToolbar, type ToolbarState } from "./AnnotationToolbar";
import { useAnnotation } from "./useAnnotation";
import type { Strokes } from "./types";

interface Props {
  sentenceId: string;
  studentId: string | null;
  canEdit: boolean;
  /** 실시간 중계 채널명 (선생님 → 학생) */
  channelName?: string;
  extraBottomPx?: number;
  toolbarClassName?: string;
}

const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export const AnnotationLayer = ({
  sentenceId,
  studentId,
  canEdit,
  channelName,
  extraBottomPx = 72,
  toolbarClassName,
}: Props) => {
  const ann = useAnnotation({ sentenceId, studentId, scope: "teacher", canEdit });
  const [tool, setTool] = useState<ToolbarState>({
    penMode: false,
    eraser: false,
    color: 1,
    width: "thin",
    visible: true,
    allowMouse: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const showMouseToggle = useMemo(() => !isTouchDevice(), []);

  // 실시간 중계
  useEffect(() => {
    if (!channelName) return;
    const ch = supabase.channel(`${channelName}-annot`, {
      config: { broadcast: { self: false } },
    });
    if (!canEdit) {
      ch.on("broadcast", { event: "annot" }, (payload) => {
        const body = (payload as { payload?: { strokes?: Strokes; aspect?: number; sentenceId?: string } })
          .payload;
        if (!body || body.sentenceId !== sentenceId) return;
        ann.replace(body.strokes ?? [], body.aspect ?? 1);
      });
    }
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, canEdit, sentenceId]);

  const broadcast = (strokes: Strokes, aspect: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "annot",
      payload: { sentenceId, strokes, aspect },
    });
  };

  const handleCommit = (next: Strokes, aspect: number) => {
    ann.commit(next, aspect);
    if (canEdit) broadcast(next, aspect);
  };

  return (
    <>
      {canEdit && (
        <AnnotationToolbar
          {...tool}
          saveState={ann.saveState}
          canUndo={ann.canUndo}
          canRedo={ann.canRedo}
          showMouseToggle={showMouseToggle}
          onChange={(patch) => setTool((t) => ({ ...t, ...patch }))}
          onUndo={() => {
            ann.undo();
          }}
          onRedo={() => {
            ann.redo();
          }}
          onRetry={ann.retry}
          className={toolbarClassName}
        />
      )}
      <AnnotationCanvas
        strokes={ann.strokes}
        aspect={ann.aspect}
        enabled={canEdit && tool.penMode}
        visible={tool.visible}
        eraser={tool.eraser}
        color={tool.color}
        width={tool.width}
        allowMouse={tool.allowMouse}
        extraBottomPx={extraBottomPx}
        onPreview={ann.setPreview}
        onCommit={handleCommit}
      />
    </>
  );
};

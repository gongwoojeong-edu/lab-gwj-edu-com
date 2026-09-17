ALTER TABLE public.sentence_approvals
  ADD COLUMN IF NOT EXISTS resolved_feedback boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sentence_approvals.resolved_feedback IS '승인 시 선생님이 이전 첨삭 항목을 해결됨으로 체크했는지 여부 — 재학습 해결 칭찬 트리거';
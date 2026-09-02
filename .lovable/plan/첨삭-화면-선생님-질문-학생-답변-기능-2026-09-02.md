# 첨삭 화면 — 선생님 질문 / 학생 답변 기능

티칭 중(선생님이 [티칭 시작]으로 학생 화면을 띄운 상태) 선생님이 질문을 보내고, 학생이 답하고, 선생님이 O/X로 판정하는 실시간 문답 기능을 추가합니다. 모든 문답은 기록으로 남아 나중에 다시 볼 수 있습니다.

예)
```text
선생님: they의 지시어는?        [보내기]
학생:  cats요                   [제출]
선생님: ⭕  (학생 화면에 즉시 O 표시)
```

## 선생님 화면 (승인/첨삭 창)
- 기존 4칸 메모 아래에 **문답** 영역 추가.
- 질문 입력창 + [질문 보내기]. 원하면 보기(객관식) 2~4개를 추가로 입력해 보낼 수 있음(비워두면 자유 입력형).
- 보낸 질문이 목록으로 쌓이고, 학생 답이 도착하면 즉시 그 아래에 표시됨.
- 각 답변 옆에 **⭕ / ❌** 버튼 — 누르면 학생 화면에 바로 표시.
- 승인/보류 처리 시 문답 세션은 티칭 종료와 함께 자동 닫힘(기록은 남음).

## 학생 화면 (티칭 오버레이)
- 원문/내 해석/실시간 메모 아래에 문답 영역이 나타남.
- 자유 입력형: 텍스트 입력 + [제출]. 객관식: 보기 버튼 중 선택.
- 제출 후 선생님 판정이 오면 O/X 배지와 함께 표시(오답이면 다시 답할 수 있음).
- 여러 질문이 순서대로 쌓여 대화처럼 보임.

## 기록 보기
- 승인창의 "이전 선생님 첨삭" 이력 카드에 해당 문장의 지난 문답(질문·학생답·O/X)을 함께 표시.
- 학생은 학습화면 첨삭 패널 / 알림함 상세에서 자신의 지난 문답을 다시 볼 수 있음.

## 기술 메모
- 새 테이블 `teaching_questions`: `user_id`(학생), `teacher_id`, `sentence_id`, `question`, `choices jsonb`, `answer text`, `answered_at`, `verdict text('correct'|'wrong')`, `judged_at`, timestamps.
  - GRANT: authenticated(select/insert/update), service_role(all). RLS: 학생은 본인 행 조회 + 본인 답변 컬럼만 업데이트, 교사/관리자(`has_role`)는 조회·생성·판정.
- 전달은 기존 `teaching-{studentUserId}` broadcast 채널 재사용 + DB 저장 병행(새 이벤트 `question` / `answer` / `verdict`). 새 폴링 없음.
- 선생님: `TeacherApprovalDialog.tsx`에 문답 패널 추가, 로직은 `src/lib/teachingQuestions.ts`로 분리.
- 학생: `TeachingOverlay.tsx`에 답변 UI 추가.
- 이력 표시: `SentenceReviewDetail.tsx` / 승인창 이력 카드에서 같은 헬퍼 재사용.

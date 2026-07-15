# 승인 "보류(held)" 상태 추가

승인 대기 문장을 지금 판정하지 않고 "보류"로 넘겨, 나중에 자세한 첨삭 코멘트를 달아 최종 평가하도록 흐름을 확장합니다.

## 동작 요약

- 선생님이 승인 팝업에서 **[보류]** 버튼 → `sentence_approvals.status='held'` 로 전환, 임시 메모 저장 가능.
- 학생 화면: "선생님이 자세한 첨삭을 준비 중이에요" 안내(진행은 계속 대기, 잠금은 유지).
- 승인 대기 화면 상단에 탭 추가: **대기 (23)** / **보류 (n)**.
- 보류 카드에서 다시 **[승인하기]** 클릭 → 기존 팝업 그대로, 이번에는 최종 등급 + 상세 첨삭 입력 후 확정.
- 학생이 재제출하면 새 attempt로 pending 이 다시 만들어지며, 이전 held 행은 참고 이력으로 남음.

## 데이터 모델

`sentence_approvals`
- CHECK 제약 완화: `status IN ('pending','approved','held')`
- 컬럼 추가:
  - `held_at timestamptz` — 보류 시각
  - `held_memo text` — 임시 메모(공식 첨삭 이전 초안)
  - `held_by uuid` — 보류 처리한 선생님
- RLS: 선생님/관리자 UPDATE 정책 그대로 사용 (status 값만 확장).
- `sentence_progress` 는 **손대지 않음** — 학생은 계속 대기 상태(=잠금 유지).

## 코드 변경

### `src/lib/sentenceApprovals.ts`
- `ApprovalStatus`: `"pending" | "approved" | "held"`
- 신규 함수 `holdApprovalRequest({ approvalId, memo?, studentUserId })`
  - `status='held'`, `held_at=now()`, `held_by=approverId`, `held_memo=memo`
  - `sentence_progress` 는 갱신하지 않음
  - 학생 알림 생성: kind='hold', title="선생님이 자세한 첨삭을 준비 중입니다"
- `fetchPendingApprovals()` 시그니처 확장: `fetchApprovalsByStatus(status: 'pending'|'held')`
  - 기존 호출부 호환 유지 위해 기본값 'pending'.

### `src/pages/teacher/PendingApprovals.tsx`
- 상단 탭 (Tabs) 추가: 대기 / 보류 (각각 count 배지).
- 목록 로딩을 선택된 status 기준으로 실행.
- 보류 탭 카드에는 "보류됨 · 임시메모: …" 표시 + [승인하기] 버튼 그대로 노출.

### `src/components/learning/TeacherApprovalDialog.tsx`
- 하단 버튼 영역에 좌측 [보류] 버튼 추가 (outline).
- 클릭 시 `holdApprovalRequest` 호출 → 다이얼로그 닫고 목록 새로고침.
- 기존 [승인] 흐름은 변경 없음.

### 학생 사이드 표기 (`SentenceLearn` 등 approval 상태 표시부)
- `held` 상태일 때 배지/문구: "선생님 상세 첨삭 준비중" (앰버 톤).
- 학습 잠금은 그대로 유지 (pending 과 동일 취급).

## 마이그레이션 SQL 개요

```sql
ALTER TABLE public.sentence_approvals DROP CONSTRAINT IF EXISTS sentence_approvals_status_check;
ALTER TABLE public.sentence_approvals
  ADD CONSTRAINT sentence_approvals_status_check
  CHECK (status IN ('pending','approved','held'));
ALTER TABLE public.sentence_approvals
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_memo text,
  ADD COLUMN IF NOT EXISTS held_by uuid;
```

## 범위 밖 (별도 요청 시 진행)

- 첨삭 히스토리(여러 번 첨삭 코멘트 누적) — 지금은 최종 `memo` 한 필드로 덮어씀.
- 보류 자동 만료/알림 리마인더.
- 학생 알림함 UI에서 hold 카드 전용 아이콘.

승인하시면 마이그레이션부터 진행하겠습니다.
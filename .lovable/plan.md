# 유닛 단위 일괄 첨삭 (Batch Grading)

## 목표
특별과제를 낼 때 "문장별 승인 대기" 대신 **유닛(또는 여러 유닛) 전체를 다 제출한 뒤 한꺼번에 첨삭**하는 옵션을 추가한다.
예) 모의고사 4지문 숙제 → 학생은 4지문 분석+한글해석을 끊김 없이 연속 제출 → 선생님이 4지문을 한 화면에서 일괄 첨삭 → 수업 때 워크북 활동.

## 현재 동작 (확인됨)
- 학생이 한글해석을 제출하면 `createApprovalRequest`로 문장 1건당 승인 요청 행이 생기고, `SentenceLearn`에서 `ApprovalWaitingPanel`이 떠서 **선생님 승인 전까지 대기**한다.
- 선생님 `/teacher/approvals`는 문장 단위 행 목록이며 다이얼로그도 1문장 단위다.

## 추가할 것

### 1) 과제 옵션: 첨삭 방식
과제 출제 화면(`/teacher/assignments`)에 라디오 추가:
- **문장별 즉시 첨삭** (기존 기본값, 변경 없음)
- **일괄 첨삭 (유닛/과제 단위)** — 새 옵션

일괄 첨삭이면 과제에 포함된 모든 문장을 다 제출해야 첨삭이 시작된다.

### 2) 학생 흐름
- 일괄 첨삭 과제에서는 해석 제출 후 **대기 화면 없이 다음 문장으로 계속 진행**한다.
- 마지막 문장까지 제출하면 "제출 완료 · 선생님 첨삭 대기중" 카드 1개만 표시(문장별 대기 배너 제거).
- 첨삭이 끝나면 알림 1건으로 통보되고, 학생 홈/과제 카드에서 문장별 등급·메모를 열람.

### 3) 선생님 일괄 첨삭 화면
승인함(`/teacher/approvals`)에 **"일괄 첨삭" 탭** 추가:
- 카드 단위 = (학생 × 과제). 예: `황준서 · 모의고사 4지문 (4/4 제출완료)`
- 카드를 열면 지문별로 [원문 / 정답 해석 / 학생 해석 / 등급 / 서식 메모 4칸]이 세로로 나열.
- 하단에 **전체 등급 일괄 적용** 버튼 + **일괄 승인** 버튼. 개별 지문만 다른 등급/메모로 덮어쓸 수 있음.
- 아직 전원 제출 전인 과제는 "제출 대기 (2/4)"로 회색 표시, 승인 버튼 비활성(원하면 강제 첨삭 가능).

## 기술 상세

**DB 마이그레이션**
- `assignments.grading_mode text not null default 'per_sentence'` (`'per_sentence' | 'batch'`)

**수정 파일**
- `src/pages/teacher/Assignments.tsx` — 출제 폼에 첨삭 방식 라디오, insert/수정 시 `grading_mode` 반영
- `src/lib/sentenceApprovals.ts` — `fetchBatchApprovalGroups()`(과제×학생 그룹 + 제출/전체 문장 수), `approveBatch(items[])`(문장별 등급·메모 배열로 일괄 승인, 진도 pass 갱신, 알림 1건)
- `src/pages/SentenceLearn.tsx` — 과제의 `grading_mode === 'batch'`면 `ApprovalWaitingPanel` 대신 즉시 다음 문장으로 이동
- `src/pages/teacher/PendingApprovals.tsx` — 탭에 "일괄 첨삭" 추가
- `src/components/learning/BatchApprovalDialog.tsx` (신규) — 다지문 첨삭 다이얼로그, 기존 `StructuredMemoInput` 재사용
- `src/lib/studentNotifications.ts` 호출부 — 일괄 첨삭 완료 알림 문구

**호환성**
- `grading_mode` 기본값이 `per_sentence`라 기존 과제·진행 중 학생 흐름은 그대로 유지된다.
- 일괄 승인도 내부적으로는 기존 `sentence_approvals` 행을 문장별로 approved 처리하므로 리포트/평가 통계는 변경 없이 동작한다.

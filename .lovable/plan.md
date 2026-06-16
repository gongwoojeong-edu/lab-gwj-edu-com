# 선생님 승인 게이트 + 5단계 평가 (공우정잉글랩 로직)

## 흐름 (개선 후)

```
단어시험 → 분석 → 한글해석 제출
   ↓
[승인 대기 화면]  ← 학생 화면에서 멈춤, 다음 문장 불가
   ↓ 선생님이 같은 화면에서 "승인" 클릭
[승인 다이얼로그]
  · 선생님 PIN
  · 평가: 매우잘함 / 잘함 / 보통 / 미흡 / 재학습
  · 메모 (선택)
   ↓ 확인
sentence_progress.status='pass' + 등급/메모 저장 → 다음 문장
```

미승인 시: 학생은 승인 대기 화면에서 멈춤. 새로고침해도 동일. 선생님이 승인해야 진행.

## DB 변경

새 테이블 `sentence_approvals`:
- user_id, sentence_id (PK 일부), attempt_no
- status: 'pending' | 'approved'
- grade: 'excellent' | 'good' | 'fair' | 'poor' | 'redo' (null 허용 — 대기 중)
- memo: text
- approved_by (선생님 uid), requested_at, approved_at
- RLS: 본인 학생 select/insert, 선생님 role select/update, GRANT 포함

`sentence_progress`에 컬럼 2개 추가 (캘린더 배지 표시 최적화):
- `last_grade text`, `last_memo text`

## 학생 화면 변경 (`SentenceLearn.tsx`)

`TranslationStep` `onSubmitted` 핸들러 수정:
- 기존: 즉시 `status=pass` + 다음 문장 이동
- 신규: `sentence_approvals` insert(status=pending) → 승인 대기 패널 표시
  - 패널: "선생님 승인을 기다리고 있어요" + 한글해석 본인 입력 표시 + [선생님 승인] 버튼
  - realtime 구독: 같은 row가 approved 되면 자동으로 다음 문장
- 진입 시 기존 pending 행이 있으면 동일 패널로 복귀 (새로고침 안전)

## 선생님 승인 다이얼로그 (신규)

`src/components/learning/TeacherApprovalDialog.tsx`:
- PIN 입력 (기존 `fetchTeacherPin` 재사용)
- 5등급 라디오 버튼 (큰 칩 UI, 색상 구분)
- 메모 Textarea (선택)
- 확인 → `sentence_approvals` update(status=approved, grade, memo, approved_by, approved_at) + `sentence_progress` update(status=pass, last_grade, last_memo, passed_at)

## 캘린더 배지 상세 표시

`LearningResultsCalendar.tsx` 배지 클릭 상세:
- 한글해석/분석 배지에 `last_grade` 칩 + `last_memo` 라인 추가

## 영향 범위 (코드)

- `supabase/migrations/...` — 새 테이블 + grant + RLS, sentence_progress 컬럼 2개
- `src/lib/sentenceApprovals.ts` — CRUD + 구독 헬퍼 (신규)
- `src/components/learning/TeacherApprovalDialog.tsx` — 신규
- `src/components/learning/ApprovalWaitingPanel.tsx` — 신규
- `src/pages/SentenceLearn.tsx` — 번역 제출 후 게이트 진입, realtime 구독
- `src/pages/teacher/LearningResultsCalendar.tsx` — 배지 상세에 등급/메모 표시

## 호환성

- 기존에 이미 `pass` 처리된 문장: 승인 row 없음 → 정상 통과로 간주, 회고적 게이트 적용 안 함
- 선생님이 PIN 없으면 안내 메시지 (`TeacherAnalysisOverride`와 동일 패턴)

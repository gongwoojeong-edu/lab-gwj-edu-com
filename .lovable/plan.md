

## 선생님 전용 검토 화면 (사이드바이사이드)

### 현황 정리
- 학생용 `/learn/sentence/:id/review` 페이지는 이미 **좌:마스터 / 우:내답안** 비교 UI가 구현되어 있음
- 하지만 이 페이지는 항상 `auth.uid()` 기준으로 학생 답안을 가져오므로, 선생님이 [보기]를 클릭하면 **선생님 본인의 빈 답안**이 표시됨
- 선생님이 학생 본인의 답안을 검토할 수 있는 별도 경로가 필요

### 신규 라우트
**경로**: `/teacher/review/:requestId`  
**가드**: `requireRole="teacher"` (선생님/관리자만 접근)

### 신규 페이지: `src/pages/teacher/TeacherAnalysisReview.tsx`

**기능**:
1. URL의 `requestId`로 `analysis_review_requests` 행 조회 → `user_id`, `sentence_id`, `attempt_no`, `track`, `analysis_rate` 추출
2. 학생 프로필 조회(`student_profiles`) → 학생 이름·학번 표시
3. **마스터 답안** = 기존 `fetchMasterAnswers(sentence_id)` 그대로
4. **학생 답안** = 신규 헬퍼 `fetchStudentAnswersByUserId(sentenceId, userId)` 호출
5. 좌(학생 답안) / 우(마스터 답안) 사이드바이사이드로 표시 — 학생 화면과 좌우만 반대 (요청서 사양: 좌:학생 / 우:마스터)
6. 헤더 액션: [승인] · [반려] · [학생 화면으로 돌아가기 = 요청 목록]

### 신규 헬퍼: `src/lib/analysisGrading.ts` 확장
```ts
fetchStudentAnswersByUserId(sentenceId: string, userId: string)
  → owner_progress 테이블에서 user_id=userId 행만 fetch
  → RLS 정책 op2_select가 "teacher 또는 admin이면 OK"이므로 별도 권한 추가 불필요
```

### UI 구성

```text
┌─────────────────────────────────────────────────────────────┐
│ ← 요청 목록   [학생: 김민수 (S001)] [📊 분석률 65%] [🟡 미통보조] │
│ Passage L02-12 · "Although the rain fell..."                 │
│                                       [✗ 반려]  [✓ 승인]     │
├─────────────────────────────────────────────────────────────┤
│  🧑‍🎓 학생 답안              ↔            🏛️ 마스터 답안      │
├──────────────────────────┬──────────────────────────────────┤
│ owner-1 / Although       │ owner-1 / Although               │
│ 기타 · 종속접속사         │ 기타 · 종속접속사 · 양보          │
│                ✅       │                                  │
├──────────────────────────┼──────────────────────────────────┤
│ owner-2 / rain           │ owner-2 / rain                   │
│ —(미입력)                │ 명 · 일반 · 주절-주어             │
│                ❌       │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

- 행별 일치 상태 아이콘(✅/⚠️/❌) — 기존 `isMatch()` 로직 재사용
- Read-only (선생님도 답안 수정 불가, 검토 전용)
- 관용구 섹션도 함께 표시
- 헤더에서 즉시 [승인]/[반려] 가능 → 요청 목록으로 자동 복귀

### 라우팅 변경

**`src/App.tsx`**: `/teacher/review/:requestId` 신규 라우트 추가  
**`src/pages/teacher/AnalysisRequests.tsx`** `goReview()` 수정:
```ts
// 이전: navigate(`/learn/sentence/${id}/review`)  // 학생용 → 선생님 보면 빈 화면
// 신규: navigate(`/teacher/review/${req.id}`)
```

### 학생 화면의 정답 보기 (확인됨, 변경 없음)
- 학생은 결과 카드에서 "🏛️ 자기 첨삭 모드 켜기" 버튼 → `/learn/sentence/:id/review`
- 승인된 요청이 있을 때만 마스터 답안 노출 (베껴쓰기 차단 정책 유지)
- 변경 사항 없음

### 작업 순서
1. `src/lib/analysisGrading.ts`에 `fetchStudentAnswersByUserId(sentenceId, userId)` 추가
2. `src/pages/teacher/TeacherAnalysisReview.tsx` 신규 페이지 (사이드바이사이드 + 승인/반려)
3. `src/App.tsx`에 `/teacher/review/:requestId` 라우트 등록
4. `src/pages/teacher/AnalysisRequests.tsx` [보기] 버튼이 신규 라우트로 이동
5. 검증: 학생 요청 → 선생님 [보기] 클릭 → 학생 답안과 마스터 답안 좌우 비교 → [승인] → 학생 화면 자기 첨삭 모드 잠금 해제

### 기술 메모
- `owner_progress` RLS 정책 `op2_select`가 이미 `teacher` 역할 SELECT를 허용하므로 DB 변경 불필요
- 선생님은 read-only이므로 `mine` state mutation 핸들러 일체 노출 안 함
- 라우트 가드는 기존 `RequireAuth requireRole="teacher"` 패턴 그대로


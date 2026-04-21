

## 학습이력 통합 + 과거과제함 + 단어테스트 시간제한

### 1. 학생화면 — 완료된 특별과제 카드 자동 숨김

**문제**: 과제 학습 끝나도 카드 그대로 — 학생이 "다 했는지" 확인 불가.

**구현 (`src/pages/StudentHome.tsx`)**:
- `assignments` 로드 후 각 과제의 `sentence_id` 에 대해 `sentence_progress` 조회
- `status === "pass"` 인 과제는 카드에서 **즉시 제외**
- 학습 페이지에서 PASS 후 홈으로 돌아오면 자동으로 사라짐

```text
[활성 과제] 진행중 카드만 표시
[완료된 과제] → "과거 과제함"으로 이동 (선생님 메뉴)
```

### 2. 선생님 대시보드 → 과거 과제함 메뉴 추가

**추가 파일**: `src/pages/teacher/AssignmentsPast.tsx`

- 사이드바에 메뉴 항목 추가: `📚 과거 과제함` (`TeacherLayout.tsx`)
- 라우트 추가: `/teacher/assignments/past` (`App.tsx`)
- 페이지 내용:
  - 마감된(`due_at < now()`) 또는 모든 학생이 PASS한 과제 표시
  - 각 행: 제목 / 마감일 / 대상 학생 / 학생별 통과율 (예: `3 / 5명 통과`)
  - 행 클릭 시 학생별 학습 이력 (sentence_attempt_logs) 펼침

또한 현재 `/teacher/assignments` 페이지(활성 과제 관리)의 상단에 "과거 과제함 보기 →" 링크 추가.

### 3. 학습 이력 통합 — 모든 학습 기록 (정규/복습/과제/시험 구분 X)

**현재 상태**: `sentence_attempt_logs` 테이블에 이미 모든 학습 시도가 기록됨.

**추가 사항**:
- 컬럼 신설: `attempt_source text` (`"regular" | "review" | "assignment" | "test"`)
  - 단순 표시용 메타 — 필터링/통계용. 모든 시도는 동일하게 누적 저장.
- `recordAttempt` 호출 시 진입 경로(URL의 `?assignment=`, `?review=` 등)에서 자동 판별
- DailyTestSummary / 학생 상세에 통합 이력 표시 (구분 라벨만 다른 색)

### 4. 복습(Re-attempt) 도구 동일화

복습으로 진입한 sentence(`sentence_progress.status === "fail"` 또는 PASS 후 재학습)에서도:
- ✅ HAND OUT 시험지 출력 요청 (현재 가능)
- ✅ 재시험 (현재 가능)
- ✅ HO 점수 입력 → handout_results upsert (선생님 측)
- 추가: 복습으로 학습 시 `sentence_progress` 의 기존 PASS 상태를 **덮어쓰지 않음** — 새 attempt만 누적

→ `recordAttempt` 의 `upsertSentenceProgress` 호출에 `if (previousStatus === "pass" && !newPass) skip status update` 가드 추가

### 5. 단어테스트 시간제한 — 20초/문제 (설정 가능)

**구현 (`src/components/learning/WordTestStep.tsx`)**:

설정 위치:
- DB: `student_profiles` 테이블에 `word_test_time_limit_sec int default 20` 컬럼 추가
- 선생님 학생 목록(`TeacherStudents.tsx`)에서 학생별 설정 (0 = 시간제한 OFF, 5~60초)

학생 화면(`WordTestStep`):
- 각 문제마다 카운트다운 표시 (인풋 위 진행바 + "남은 시간: 12초")
- 0초 도달 시:
  - 입력값 그대로 자동 제출 (빈 답이면 오답 처리)
  - 자동으로 다음 문제 → 마지막 문제는 자동 finalize
- 시간제한 = 0 이면 타이머 숨김

```text
┌──────────────────────────┐
│ 5/10  ████░░░░░░ 8초     │
│  apple                    │
│  [_______________]        │
└──────────────────────────┘
```

### 변경 파일

| 파일 | 변경 |
|---|---|
| 마이그레이션 (신규) | `attempt_source` (sentence_attempt_logs), `word_test_time_limit_sec` (student_profiles) |
| `src/pages/StudentHome.tsx` | 완료된 과제 필터링 |
| `src/pages/teacher/AssignmentsPast.tsx` (신규) | 과거 과제함 페이지 |
| `src/components/teacher/TeacherLayout.tsx` | 사이드바 메뉴 추가 |
| `src/App.tsx` | 라우트 추가 |
| `src/pages/teacher/Assignments.tsx` | "과거 과제함" 링크 |
| `src/pages/SentenceLearn.tsx` | `attempt_source` 자동 판별 + PASS 덮어쓰기 가드 |
| `src/components/learning/WordTestStep.tsx` | 카운트다운 타이머 + 자동 제출 |
| `src/pages/TeacherStudents.tsx` | 학생별 시간제한 설정 입력 |
| `src/lib/studentProfile.ts` | 시간제한 필드 |
| `src/integrations/supabase/storage.ts` | `attempt_source` 전파 |

### 비고

- 단어테스트 3종(스펠/뜻/혼합) 시퀀스는 그대로 유지 — 시간제한은 각 시퀀스 모드에 동일 적용
- 기본값 20초는 합리적 시작점이나, 학생 수준에 따라 선생님이 조절 가능
- 과거 과제함은 학생 화면에는 노출하지 않음 (학생은 "최근 학습 Passage" 섹션에서 본인 이력만 확인)


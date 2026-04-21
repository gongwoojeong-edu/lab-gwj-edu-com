

## 단어학습/구문분석/한글해석/단어시험 — 4단계 일관화

### 변경 범위 요약

| 영역 | 현재 | 변경 후 |
|---|---|---|
| 라벨 (선생님·학생) | "분석/번역/단어테스트" 3개 | **단어학습 / 구문분석 / 한글해석 / 단어시험** 4개 |
| 출제·수정 폼 체크박스 | 3개 (`include_pre`는 항상 true로 강제) | 4개 (`includePre` 노출, 사용자가 끄기 가능) |
| 학생 화면 / 선생님 위젯 배지 | 3개 컬러 칩 | 4개 컬러 칩 (켜진 것만 컬러, 꺼진 건 회색·취소선) |
| 학습 페이지 (`SentenceLearn`) 단계 | 항상 4단계 모두 진행 | **체크 안 된 단계는 자동 스킵** + 잠금 해제 + 다음 단계로 즉시 이동 |

### 1) `src/components/teacher/AssignmentStepBadges.tsx`

4단계를 표시하도록 props 확장:
- props 추가: `includePre: boolean`
- `STEPS` 배열을 학습 흐름 순서대로 4개로:
  ```
  단어학습(pre) → 구문분석(analysis) → 한글해석(translation) → 단어시험(wordtest)
  ```
- 호출 측 3곳(`Assignments.tsx`, `StudentHome.tsx`, `TeacherHome.tsx`)에 `includePre={a.include_pre}` 전달

### 2) `src/pages/teacher/Assignments.tsx`

#### 출제·수정 폼 (라벨 4개 정렬)
`renderStepCheckboxes` 의 체크박스 배열을 흐름 순서로 교체:
```
단어학습 / 구문분석 / 한글해석 / 단어시험
```

#### 프리셋 버튼 재정의
- `[전체]` → 4개 모두 on
- `[분석만]` → 단어학습 + 구문분석 (해석/시험 off)
- `[단어만]` → 단어학습 + 단어시험 (분석/해석 off)

#### 목록 카드 배지에 `include_pre` 전달
`AssignmentStepBadges`에 `includePre` prop 전달 (`AssignmentRow.include_pre` 이미 SELECT됨)

### 3) `src/pages/StudentHome.tsx`

- `AssignmentRow` 타입에 `include_pre: boolean` 추가
- `assignments` SELECT 쿼리에 `include_pre` 컬럼 추가
- 카드의 `<AssignmentStepBadges>` 에 `includePre={a.include_pre}` 추가

### 4) `src/pages/teacher/TeacherHome.tsx`

- `UpcomingAssignment` 타입에 `include_pre: boolean` 추가
- 마감 임박 위젯 SELECT 컬럼에 `include_pre` 추가
- 위젯 배지에 `includePre` prop 추가

### 5) `src/pages/SentenceLearn.tsx` — 자동 스킵 (특별과제 진입 시)

#### 동작
URL이 특별과제로 진입한 경우(`?assignment=<id>` 또는 `state.assignmentId`)와 **무관하게**, 학습 시작 시 해당 sentence와 연결된 활성 과제 중 가장 임박한 1건의 `include_*` 4개 boolean을 가져와 다음 규칙으로 단계 처리:

| 단계 | 체크 OFF면 |
|---|---|
| `pre` (단어학습) | 자동으로 `pre_done=true` upsert + 다음 단계로 진입 |
| `analysis` (구문분석) | `analysis_done=true` upsert + 다음 단계 (분석 점수 0으로 기록) |
| `translation` (한글해석) | `translation_done=true` upsert + 다음 단계 |
| `wordtest` (단어시험) | `recordAttempt` 시 `word_test_passed=true` 강제 + 즉시 PASS |

또한 **단계 탭(`Step tabs`)에서도 OFF인 단계에는 작은 "스킵" 회색 라벨**을 노출(잠금 아이콘 대신 "스킵 표시")해 학생이 현황을 인지하도록 합니다.

#### 구현 위치
- `useEffect` 진입 시 1회: `assignments` 테이블에서 `sentence_id = sentence.id AND due_at >= now()` 행 1건 SELECT → `skipFlags = { pre, analysis, translation, wordtest }` state 저장 (없으면 모두 true → 기존 동작 유지)
- 초기 step 결정 로직(176-179행)에서 OFF 단계는 건너뛰며 `pre_done`/`analysis_done`/`translation_done` 자동 upsert
- `WordPreStep` / `Index(분석)` / `TranslationStep` / `WordTestStep` 각 완료 콜백 후 `safeSetStep`을 호출할 때 다음 단계가 OFF면 한 번 더 스킵

### 변경 파일 (5개)

1. `src/components/teacher/AssignmentStepBadges.tsx` — props/순서/라벨 4개로 확장
2. `src/pages/teacher/Assignments.tsx` — 라벨/프리셋/배지 호출 4개로 정리
3. `src/pages/StudentHome.tsx` — SELECT + 배지에 `include_pre` 추가
4. `src/pages/teacher/TeacherHome.tsx` — SELECT + 배지에 `include_pre` 추가
5. `src/pages/SentenceLearn.tsx` — `assignments` 룩업 + 단계 자동 스킵 로직

### 비고

- DB 컬럼 `include_pre / include_analysis / include_translation / include_wordtest` 는 이미 존재 → 마이그레이션 없음
- 기존 과제(모두 true 기본값)는 동작 변화 없음 — 자동 스킵 영향 0


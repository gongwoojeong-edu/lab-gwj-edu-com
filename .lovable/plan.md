

## 플랜 — 구문분석 / 정답확인 / 인쇄대기열 / 학습결과 통합 개선

### 1. 구문분석 (`src/pages/Index.tsx`)

#### 1-1. Shift+클릭으로 단어 추가 시에도 드래그 동작 허용
현재 `handleWordMouseDown` 의 Shift+클릭 분기는 단순히 인덱스만 누적하고 `dragStart` 를 설정하지 않아서 드래그 확장이 불가. 변경:
- Shift+클릭 시 기존 인덱스를 `selectedWordIndices` 에 누적함과 동시에 `setDragStart(idx)` 를 호출 → 그 다음 mouse-enter 가 정상적으로 범위 확장.
- `handleWordMouseEnter` 에서 dragStart 와 idx 사이 + 이미 선택된 인덱스의 union 으로 확장 (Shift 워크플로 보존).

#### 1-2. 학생 화면에서도 지우개 / 선택 해제 / 저장 버튼 노출
현재 staff toolbar 는 `isAdmin && (!embedMode || showStaffToolbar)` 조건으로만 렌더 — 학생은 분석을 잘못해도 되돌릴 수단이 없음. 변경:
- 학생용 미니 툴바를 `embedMode + studentMode` 일 때 분석 패널 상단 또는 문장 컨테이너 우상단에 노출.
- 노출 버튼: **[지우개]** (eraserMode 토글), **[선택 해제]** (`clearActiveSelection()`), **[저장]** (분석 진행 자동 저장은 이미 동작 — 명시적 [저장] 버튼은 현재 owner 의 progress 를 `sentence_progress` 로 즉시 sync + "저장됨" 토스트 표기).
- 학생용은 정답 입력 / 정답 초기화 / AI 추출 / 힌트 버튼은 노출 X.

#### 1-3. 절 내부 절(N중 절) 분석 버그
현재 `handleWordMouseDown` 일반 클릭 경로에서 완료 owner 위 클릭 시 단일 토큰만 선택해 다층 분석을 시작하도록 의도되어 있으나, 클릭한 단어가 이미 안쪽 owner 의 일부일 때 `pickSelectedIdFromIndices` 가 그 단일 토큰의 owner_id 를 반환해 기존 분석을 덮어씀.
- 수정: 단일 토큰 owner 가 이미 progressMap 에 존재하고 완료 상태면, 동일 인덱스로 새 span owner(`buildSpanOwnerId(idx, idx)`) 를 강제 생성해 별도 layer 로 분리.
- 또한 Shift+드래그로 새 절을 묶을 때 기존 안쪽 owner 와 인덱스 범위가 겹쳐도 새 span owner 로 분리되도록 `pickSelectedIdFromIndices` 의 단일 인덱스 분기에서 "기존 단일 owner 가 이미 완료된 경우" span owner 로 fallback.

#### 1-4. 분석율 산정 기준 보정 (마스터키 분석 owner 대비)
현재 `Index.tsx` line 1004-1018 의 `onAnalysisProgress` 는 `masterOwnerIds.size > 0` 이면 마스터키 owner 대비로 계산하도록 되어 있어 정상이나, `SentenceLearn.tsx` 의 `analysisRate` 표기(`Math.round(analysisRate * 100)%`) 와 게이트 검사도 동일해야 함. 검증 후, 마스터키가 없을 때만 `completedCount / analyzableIds.length` fallback 으로 명확화.
- 또한 `analysisGrading.gradeAnalysis` 의 `rate = total / masterIds.length` (이미 마스터 분모) 도 그대로 사용 — 변경 불필요.
- UI 라벨 보강: 학생 화면에 `({Math.round(rate*100)}% — 마스터키 N개 owner 중 M개 완료)` 형태로 분모를 명시.

#### 1-5. "견해차" → "의문점" + 단어학습 완료 화면에서 숨김
- `SentenceLearn.tsx` line 896-917 의 "분석 결과에 견해차가 있나요?" 카드를 `step === "analysis"` 일 때만 노출하도록 조건 추가 (현재 `step === "post"` 인 단어시험 완료 화면에도 노출됨).
- 모든 "견해차" 문구를 "**의문점**" 으로 치환:
  - `SentenceLearn.tsx` line 801, 898, 907.
  - `TeacherAnalysisOverride.tsx` line 31, 39.

### 2. 정답확인 (자기 첨삭 / 시각 비교)

#### 2-1. 텍스트 보여주는 보기(`AnalysisReview.tsx`) 삭제
- `src/pages/AnalysisReview.tsx` 파일 폐기. `App.tsx` 의 `/learn/review/:sentenceId` 라우트 제거.
- 학생 화면 `SentenceLearn.tsx` 의 `renderReviewRequestButton` 에서 승인 후 "보기" 버튼이 `AnalysisReview` 로 이동하던 링크를 `AnalysisCompare` (`/teacher/compare/:sid/:uid`) 로 교체. 단, 학생 자신의 비교는 새 라우트 `/learn/compare/:sentenceId` 로 띄우고 내부적으로 `studentId = auth.uid()` 로 `AnalysisCompare` 를 재사용 (compareMode + 본인 hydrate).

#### 2-2. [시각 비교] → [정답 확인] 라벨 변경
- `AnalysisRequests.tsx` line 247: `🖼 시각 비교` → **[정답 확인]**.
- `TeacherAnalysisReview.tsx` line 280-285: 동일 라벨 변경.
- `AnalysisCompare.tsx` 의 페이지 헤더 "둘 다 인쇄" 도 그대로 유지하되, 페이지 타이틀/배지에서 "시각 비교" 라는 명칭 사용 시 "정답 확인" 으로 통일.

#### 2-3. 시각비교 — 차이 요약 누락 버그
현재 `AnalysisCompare.tsx` line 218-253 의 차이 요약 표는 `diff.details.filter(d => d.status !== "exact")` 만 표시 → `analysisCompare.ts` 의 `details` 에 학생 답안이 일부 채워졌더라도 정상.
- 점검 필요: `computeCompareDiff` 가 `details` 에 모든 master owner 를 push 하는데, `manualToggles` 로 추가된 owner (마스터에는 없지만 학생이 임의 입력한 owner) 는 누락. 보완:
  - `computeCompareDiff` 가 학생 owner 중 master 에 없는 항목도 `details` 에 `status: "extra"` 로 추가.
  - 표에 "extra" 행 표시 (학생이 마스터에 없는 owner 를 분석한 경우).
- 또한 표 컬럼에 **요지(label)** 컬럼 추가: master_pos / student_pos 외에 owner 단어(surface) 도 함께 표기.

### 3. 인쇄 대기열 — 학습결과와 동등 UI

#### 3-1. PrintQueue 항목을 학습결과와 동일 한 줄 카드 형태로 재구성
**파일**: `src/pages/teacher/PrintQueue.tsx`
- 현재 단순 [인쇄] 버튼 1개 → 학습결과 페이지와 동일하게 **문장코드 / 구문분석(P/F %) / 단어시험 / 단어HO / 구문HO** 컬럼 표기.
- 데이터 보강: `fetchPendingPrintRequests` 결과를 `sentence_attempt_logs` 와 join 해 각 (user_id, sentence_id) 의 best 점수도 함께 보여줌.
- 인쇄 액션을 항목별로 분리:
  - **[구문 인쇄]** — 기존 핸드아웃(분석/한글해석 페이지).
  - **[단어 인쇄]** — 단어 HO 시험지(아래 4번에서 새 라우트).
  - **[전체 인쇄]** — 구문 + 단어를 한 PDF/탭으로 묶음.
- 인쇄 시 **PDF 미리보기 단계 제거**: `?autoprint=1` 으로 이미 자동 인쇄 트리거 중. 추가로 화면 진입 직후 toolbar 의 PDF 미리보기 영역을 숨기고 `window.print()` 를 0ms 지연으로 호출 → 사용자는 곧바로 OS 인쇄 대화상자를 봄. 미리보기를 원하면 toolbar 의 [PDF로 보기] 별도 버튼 노출.

#### 3-2. 단어 HO 인쇄 — 오답만 / 전체 옵션
- 신규 라우트 `/teacher/handout/word/:passageCode?student=...&scope=wrong|all&autoprint=1`.
- 신규 페이지 `src/pages/HandoutWord.tsx`: `word_test_results` 의 최신 시도에서 `wrong_words` 를 가져와 단어 학습지 출력.
  - `scope=wrong` → 틀린 단어만, `scope=all` → 추출된 모든 단어.
- PrintQueue / LearningResults 의 [단어 인쇄] 버튼 옆에 토글 (오답만 / 전체) 라디오 또는 드롭다운 추가.

#### 3-3. PrintQueue 의 안내 문구 수정
- 기존 "PDF 가 새 탭에서 열립니다" 문구를 "**OS 인쇄 대화상자가 자동으로 열립니다. PDF 작업이 필요하면 [PDF로 보기]를 누르세요.**" 로 변경.

### 4. 학습결과 페이지 (`src/pages/teacher/LearningResults.tsx`)

#### 4-1. 온라인 학습 성적(구문분석 + 단어시험) 누락 보정
- 현재 `attemptMap` 은 `sentence_attempt_logs` 와 `word_test_results` 를 사용하지만, 점수가 표시되지 않는 행이 발생.
- 원인: `word_test_results` 보충 로직이 `if (!cur)` 조건이라 attempt log 가 있고 word_score 가 0인 경우 word_test_results 의 점수가 무시됨. 변경:
  - `word_test_results` 결과를 항상 best_word_score 와 비교 후 max 적용.
- `attempt_source = 'regular'` 만 best 통계로 사용하던 부분이 있다면 모든 attempt 를 합산.

#### 4-2. 행 동작 워크플로 재정렬
- HO 입력란 활성화: **인쇄 완료 후** (`isPrinted`) — 현재와 동일.
- 인쇄 버튼 활성화: **HO 입력 전엔 노란 점멸 효과로 활성**, 인쇄 후 회색으로 표기. (요청 사항: "인쇄 버튼은 HO 성적 입력 후 활성화" → 재해석: 인쇄 후 HO 가 입력되면 행 전체가 "확정" 상태로 잠금. 미입력이면 인쇄 버튼이 강조되어 재인쇄 가능.)
  - 명확한 구현:
    - 1단계 (인쇄 전): `[인쇄]` 버튼만 활성, HO 입력 disabled.
    - 2단계 (인쇄 완료 + HO 미입력): HO 입력 활성, [인쇄] 는 [재인쇄] 로 라벨 변경 + secondary 스타일.
    - 3단계 (HO 입력 완료): HO 인풋 disabled (저장됨 표기), [재인쇄] 만 가능.

#### 4-3. 재시험 → 특별과제(assignment)로 자동 부여
- 현재 `handleRetest` 는 `sentence_progress.status='retest'` 만 갱신 → 학생이 자연스럽게 그 문장으로 재진입할 동선이 약함.
- 변경: `handleRetest` 가 `assignments` 테이블에 **재시험 과제** row insert.
  - 필드: `title="[재시험] {sentence_code}"`, `description="이전 학습 결과 기반 재시험"`, `student_id=userId`, `sentence_id=sid`, `due_at=now()+1day`, include_pre/analysis/translation/wordtest 모두 true, `teacher_id=auth.uid()`.
  - 동시에 기존 `sentence_progress.status='retest'` 도 유지(학생 홈 RetestBanner 표시용).
- 학습결과 행에 **재시험 배지** 표기: `assignments` 에서 `(student_id, sentence_id, title startsWith "[재시험]")` 가 존재하면 행 우측에 작은 `[재시험]` 배지.

#### 4-4. 인쇄 완료 표기
- 현재 행 `문장 코드` 옆에 `<Printer />` 시간 표기로 이미 구현.
- 보강: `isPrinted` 면 행 좌측에 녹색 점 + tooltip "인쇄 완료 HH:mm".

#### 4-5. 학생 제출 결과 보기 버튼 (구문분석, 한글해석)
- 각 점수 셀 옆에 작은 [👁 보기] 아이콘 버튼 추가:
  - **구문분석 보기**: 새 탭으로 `/teacher/compare/:sentenceId/:userId` 열기 (마스터 vs 학생 그래픽 비교).
  - **한글해석 보기**: Popover 또는 Dialog 로 `sentence_translations.text` 를 그 자리에서 표시. 길면 "전체 보기" 링크로 새 탭.
- 단어시험 보기: `word_test_results.items` + `wrong_words` 를 Dialog 로 표 형태 표시.

### 5. 단어 채점 정규화 (단어 뜻 띄어쓰기 / 영어 스펠 대소문자)

#### 5-1. 한국어 뜻 — 띄어쓰기 무시
**파일**: `src/lib/wordTestBuilder.ts`
- `normalizeKo` 가 이미 `.replace(/\s+/g, " ")` 을 적용 → " " 1개로 축약. 변경: 모든 공백 제거 (`.replace(/\s+/g, "")`) 로 강화.
- `isAnswerCorrect` 의 `exps.some((e) => e === g || e.includes(g) || g.includes(e))` 를 normalizeKo 적용된 후 비교 — 띄어쓰기 차이 완전 무시.

#### 5-2. 영어 스펠 — 대소문자 무시
**파일**: `src/lib/wordTest.ts`
- `normSpell` 이 이미 `.toLowerCase()` + 공백제거 → 대/소문자 무시 정상. 단, `isQuestionCorrect` 내 비교가 직접 `q.word` 를 normalize 하므로 OK.
- 추가 보강: `wordTestBuilder.isAnswerCorrect` 의 영어 정답(POS=단어 자체) 케이스에도 `.toLowerCase()` 명시.

### 변경 파일 요약

- `src/pages/Index.tsx` — Shift 드래그 결합, 학생 미니 툴바, N중 절 owner 분리, 분석률 라벨 분모 표기.
- `src/pages/SentenceLearn.tsx` — "견해차" 카드를 analysis step 한정, "의문점" 표현 변경.
- `src/components/learning/TeacherAnalysisOverride.tsx` — "견해차" 문구 교체.
- `src/pages/AnalysisReview.tsx` — 파일 삭제. `src/App.tsx` 라우트 제거 + `/learn/compare/:sid` 신설.
- `src/pages/teacher/AnalysisCompare.tsx` — 차이 요약 보강(extra status, surface 컬럼), [정답 확인] 라벨.
- `src/pages/teacher/AnalysisRequests.tsx`, `TeacherAnalysisReview.tsx` — 라벨 변경.
- `src/lib/analysisCompare.ts` — `details` 에 학생-only owner(`extra`) 추가.
- `src/pages/teacher/PrintQueue.tsx` — 학습결과 동등 컬럼, [구문/단어/전체] 분리, 자동 인쇄 강화.
- `src/pages/HandoutWord.tsx` — 신규(단어 HO 학습지, scope=wrong|all).
- `src/App.tsx` — `/teacher/handout/word/:code` 라우트 신설, `/learn/compare/:sid` 라우트 신설.
- `src/pages/teacher/LearningResults.tsx` — 온라인 점수 보정, 재인쇄 라벨, 재시험→assignments insert, 재시험 배지, 결과 보기 버튼.
- `src/lib/wordTestBuilder.ts` — `normalizeKo` 공백 완전 제거.
- `src/lib/wordTest.ts` — 영어 스펠 비교 보강.

DB 스키마 변경 없음. 기존 `assignments` 테이블 그대로 사용(재시험은 title prefix 로 식별).


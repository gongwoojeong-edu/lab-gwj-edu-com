

## 플랜 보강 (3차) — 사이드바·인쇄 워크플로 정리

### 1. 사이드바 메뉴 정리

**파일**: `src/components/teacher/TeacherLayout.tsx`

#### 1-1. "책장", "학습관리" 그룹 라벨 도드라지게
현재 그룹 라벨이 작은 회색 텍스트(`text-xs muted`)라 영역 구분이 약함. 변경:
- 폰트 크기 `text-sm font-bold text-foreground` 로 격상.
- 아이콘 크기도 `size-4` 로 키움.
- 활성(그룹 내 라우트가 현재 경로) 시 추가로 `bg-primary/10 text-primary rounded-md px-2` 적용 → 어느 영역에 있는지 한눈에.

#### 1-2. "과거 과제함" 글씨 정상화
현재 `size="sm"` + `text-xs` 로 다른 메뉴보다 작게 표시됨. 변경:
- `SidebarMenuButton` 의 `size="sm"` 제거.
- `text-xs` 제거 → 다른 항목과 동일한 폰트 크기.

### 2. "재시험 관리" 메뉴 제거 + 학습결과함으로 통합

#### 2-1. 사이드바에서 "재시험 관리" 항목 삭제
**파일**: `src/components/teacher/TeacherLayout.tsx`
- `RefreshCcw` 아이콘과 `/teacher/retests` 링크 `SidebarMenuItem` 제거.
- import 정리.

#### 2-2. 라우트 정리
**파일**: `src/App.tsx`
- `/teacher/retests` Route 유지(직접 URL 접근은 가능). 단 사이드바 진입점만 제거.

#### 2-3. 학습결과함에 [재시험] 버튼 삽입
**파일**: `src/pages/teacher/LearningResults.tsx`
- 각 sentence row 액션 영역에 **[재시험]** 버튼 추가 (`RefreshCcw` 아이콘).
- 클릭 시: 해당 학생·문장에 대해 재시험을 부여하는 동작.
  - 구현: `word_test_results` 의 최신 결과를 `passed=false` 로 표기(단순 마킹) 또는 `assignments` 에 retest 플래그로 신규 row 추가 — 가장 가벼운 1안 채택: 학생 다음 학습 사이클에서 해당 문장이 재출제 되도록 `sentence_progress.status='retest'` 로 업데이트.
- 버튼 옆 토스트: "재시험 등록됨 — 학생이 다음 접속 시 해당 문장 다시 출제".

### 3. 학습결과함 — 모든 학습 활동 반영 (이전 플랜 재확인)

**파일**: `src/pages/teacher/LearningResults.tsx`

이전 플랜 그대로 진행:
- 데이터 소스 확장: `print_requests(printed)` ∪ `sentence_attempt_logs` ∪ `handout_results` ∪ `sentence_translations` ∪ `word_test_results` ∪ `word_pre_results`.
- HO 점수 학생 헤더 인라인 배치.
- 각 sentence row 우측 액션:
  - **[PDF]** — 새 탭으로 핸드아웃 미리보기 (`handleOpenPdf`).
  - **[인쇄]** — `print_requests` 행 신규 insert(`status='printed'`) + `ensureHandoutRow` + 새 탭 `/teacher/handout/...` 자동 인쇄 트리거.
  - **[재시험]** — 위 2-3 동작.
- 학생 카드 상단 일괄 버튼은 유지하되 라벨도 **[전체 인쇄]** 로 단축.

### 4. 인쇄대기열 — 워크플로 변경 (사용자 의도 반영)

**파일**: `src/pages/teacher/PrintQueue.tsx`

**변경된 흐름**:
- 각 행에 단일 버튼 **[PDF]** (`Printer` 아이콘) — 라벨 단축.
- 클릭 → `handleOpenHandout` 가 PDF만 새 탭 오픈. **이 시점에는 처리 완료로 마킹하지 않음**.
- 새 탭 PDF 화면에서 사용자가 브라우저 인쇄(또는 핸드아웃 페이지의 [인쇄] 버튼)를 누른 시점에 백그라운드에서 처리됨 표기.
  - 구현: `Handout.tsx` 에 `window.onbeforeprint` 리스너 추가 → `?fromQueue=1&reqId=...` 쿼리가 있으면 `markPrintRequestHandled(reqId)` + `ensureHandoutRow` 호출.
  - `PrintQueue` 의 `handleOpenHandout` 가 새 탭 URL에 `?fromQueue=1&reqId={req.id}&studentId={user_id}` 포함.
- [처리 완료] 별도 버튼 제거 (이전 플랜과 동일).
- 인쇄 처리되면 실시간 구독에 의해 해당 행이 목록에서 사라지고, 학습결과함에 자동 합류.

#### 라벨 통일
- `PrintQueue` 의 `[핸드아웃 PDF]` → **[PDF]**
- `LearningResults` 의 `[핸드아웃 인쇄]` → **[인쇄]**
- `[전체 핸드아웃 인쇄]` → **[전체 인쇄]**

### 5. 함께 처리 (이전 플랜 누적 유지)

- `setPassageReady` 헬퍼로 책장 [학생 공개/비공개] 토글 정상화.
- `Index.tsx`: 단일 [정답 저장 (전체)] 버튼, 보라 배너 제거, N중 부배지 cascade.
- `AdminHintToggle`/`HintSettingsContext`: 수식선/지시어 토글 제거 — 항상 표시.
- 사이드바 `대시보드` 그룹 라벨도 활성 시 동일 음영(2번에 포함).

### 변경 파일 요약

- `src/components/teacher/TeacherLayout.tsx` — 그룹 라벨 강조, 과거과제함 폰트 정상화, 재시험관리 항목 제거.
- `src/pages/teacher/PrintQueue.tsx` — 단일 [PDF] 버튼, 처리완료 자동화 쿼리.
- `src/pages/teacher/LearningResults.tsx` — 데이터 소스 확장, [PDF]/[인쇄]/[재시험] 액션, HO 인라인.
- `src/pages/Handout.tsx` — `?fromQueue=1&reqId=...` 처리(`onbeforeprint`).
- `src/lib/sentenceSource.ts` — `setPassageReady` 헬퍼.
- `src/pages/teacher/PassageEditor.tsx` — `togglePublish` 수정.
- `src/pages/Index.tsx` — 단일 [정답 저장(전체)], 배너 제거, N중


## 플랜 — 사이드바·대시보드·학습결과·인쇄 통합 정리

### 1. 사이드바 메뉴 정리
**파일**: `src/components/teacher/TeacherLayout.tsx`

- "과거 과제함" 메뉴 항목 **삭제** (특별과제 페이지 내부에서 접근 가능 → 중복 제거).
- "과거 과제함" → "과거 과제"로 라벨 변경(만약 다른 곳에 남는 자리 있으면). 실제로는 위 삭제로 메뉴에서 사라짐.
- "학습결과함" → **"학습결과"** 로 라벨 변경.
- 기존 활성 음영 강조 유지.

### 2. 대시보드 — "마감 임박 특별과제" 학습완료 표기
**파일**: `src/pages/teacher/TeacherHome.tsx`

- 각 과제 행에 이미 `progressByAsg[a.id]` 진척 데이터를 보유.
- 새 헬퍼: `targetUserIds` 전원이 모든 step `pass`/`done` 이면 행 우측에 **녹색 [학습완료]** 배지 추가, 마감 시간 배지 옆 또는 대체.
- 단일 학생 과제(`student_id` 지정)면 그 학생만 평가, 전체 과제면 모든 학생 통과 시에만 [완료].
- 일부만 완료면 `(N/M 완료)` 작은 라벨 추가.

### 3. PDF 누르면 학생화면으로 리다이렉트되는 버그 (★ 핵심)

**원인**: `RequireAuth.tsx` line 54-60 — 교사가 `viewMode === "student"` 상태이면 모든 `/teacher/*` 라우트가 `/learn` 으로 강제 리다이렉트됨. 새 탭에서 핸드아웃 열 때 동일 origin 으로 viewMode 가 공유되어 학생 화면으로 튕김.

**수정** (`src/components/auth/RequireAuth.tsx`):
- line 54-60 의 `mode === "student"` 강제 리다이렉트 조건을 **완화**: 핸드아웃처럼 인쇄 전용 라우트(`/teacher/handout/`)는 viewMode 와 무관하게 통과시킴.
- 단순화 안: `requireRole` 이 명시되어 통과한 사용자는 viewMode 강제 리다이렉트 면제. (즉 staff 권한이 있고 페이지가 staff role 을 명시적으로 요구한다면 viewMode 무시)
- 결과: 학습결과함의 `[PDF]`/`[인쇄]` 새 탭이 정상적으로 핸드아웃을 표시.

### 4. 학습결과 페이지 — 한 줄 통합 + 인쇄 후 HO 활성

**파일**: `src/pages/teacher/LearningResults.tsx`

#### 4-1. 페이지 제목/메뉴 라벨
- `학습결과함` → `학습결과` (h1 텍스트).

#### 4-2. 한 줄 컬럼 재설계 (기존 표 헤더 교체)
| 문장코드 | 구문분석 (P/F) | 단어시험 (점수) | 단어HO (점수) | 구문HO (P/F) | 인쇄 |

- **문장코드** — 그대로.
- **구문분석** — `analysis_passed` 면 P(녹색), 아니면 F(빨강). + 매치율 % 작게 병기 (`P 87%` 형태).
- **단어시험** — `best_word_score` 점수, pass/fail 색상.
- **단어HO** — `WordHoInput` 인라인 (수동 입력란). 자동계산 옵션:
  - **신규 입력 형식**: 사용자가 `8/10` 또는 `8/10` 입력 시 80점으로 자동 환산. 수동 점수 입력도 그대로 허용. `WordHoInput` 의 onChange/parse 확장.
  - 인쇄 전이면 **disabled** (회색 placeholder "—"), 인쇄 완료된 sentence 행만 활성화.
- **구문HO** — `SyntaxHoToggle` 인라인. 동일하게 인쇄 전이면 비활성, 인쇄 후 활성.
- **인쇄** — 단일 버튼 [인쇄]. 클릭 시:
  1. 새 탭 핸드아웃 오픈 (자동 인쇄 트리거 쿼리 `?student=&autoprint=1` 추가),
  2. `print_requests` 에 `status='printed'` 행 insert,
  3. `ensureHandoutRow(...)` 로 HO 행 보장,
  4. 로컬 state `printedSet` 에 `{userId, sentenceId}` 추가하여 그 행의 HO 입력 즉시 활성.
- 이전의 [재시험] 버튼은 행 우측 컴팩트 아이콘 메뉴(`⋮`) 하위로 이동 — 한 줄 폭 절약.
- 인쇄 항목 선택 박스(체크박스) 신규 추가: 행 선두 체크 → 헤더 [선택 인쇄] 일괄 버튼. 학생 카드 헤더의 [전체 인쇄]는 유지.

#### 4-3. 인쇄 완료 마킹
- 인쇄대기열에서 인쇄 처리되면 (`subscribeToPrintRequests`) 학습결과 페이지도 실시간 구독해 동일 `printedSet` 갱신.
- 인쇄 완료 후 행에 [인쇄완료 ✓ HH:mm] 표기 + HO 입력 활성.
- HO 입력 활성 조건: `attemptMap[key].printed_at != null` OR 로컬 `printedSet` 에 포함.

#### 4-4. 성능 개선
- `handlePrint` 종료 후 전체 `refresh()` 호출 제거 → 로컬 state 직접 갱신(낙관적 업데이트).
- 클릭 즉시 새 탭 오픈 → 백그라운드에서 insert/ensureHandoutRow.
- `attemptMap` 갱신은 print_requests realtime 구독에 위임.

### 5. 인쇄대기열 — 인쇄 후 학습결과로 이동 강화
**파일**: `src/pages/teacher/PrintQueue.tsx`, `src/pages/Handout.tsx`

- PrintQueue 의 [PDF] 버튼 라벨 → **[인쇄]** 로 변경(직관성).
- Handout 새 탭 URL 에 `?fromQueue=1&autoprint=1` 추가 — 페이지 로드 후 자동으로 `window.print()` 호출.
- `Handout.tsx`: `autoprint=1` 이면 데이터 로드 직후 `setTimeout(() => window.print(), 300)`.
- `onbeforeprint` 에서 기존대로 `markPrintRequestHandled` + `ensureHandoutRow` 처리(현행 유지).
- 처리 후 PrintQueue 페이지에는 realtime 으로 행 사라지고, 학습결과 페이지에 새 라인 자동 합류 (실시간 구독).

### 6. 콘솔 경고 정리 (forwardRef)
**파일**: `src/components/teacher/WordHoInput.tsx`, `src/components/teacher/SyntaxHoToggle.tsx`

- `LearningResults` 가 두 컴포넌트에 ref 를 전달하지는 않지만, `Card` 내부 layout 에서 ref forwarding warning 발생.
- `WordHoInput` 을 `React.forwardRef` 로 감싸 ref 를 내부 input 으로 전달.
- `SyntaxHoToggle` 도 동일 패턴(Button ref 위임).
- 콘솔 노이즈 제거 + React strict mode 호환.

### 변경 파일 요약

- `src/components/auth/RequireAuth.tsx` — staff role 명시 라우트는 viewMode 무시 (PDF 리다이렉트 버그 해결).
- `src/components/teacher/TeacherLayout.tsx` — 과거과제함 항목 제거, 학습결과함→학습결과 라벨 변경.
- `src/pages/teacher/TeacherHome.tsx` — 마감 임박 과제에 [학습완료] 배지.
- `src/pages/teacher/LearningResults.tsx` — 페이지 제목 변경, 한 줄 통합 표, 인쇄 후 HO 활성, 8/10→80 자동환산, 낙관적 갱신, 선택 인쇄.
- `src/pages/teacher/PrintQueue.tsx` — [PDF] → [인쇄] 라벨, autoprint 쿼리.
- `src/pages/Handout.tsx` — `autoprint=1` 시 자동 인쇄 트리거.
- `src/components/teacher/WordHoInput.tsx`, `SyntaxHoToggle.tsx` — `forwardRef` 전환.

DB 스키마 변경 없음.


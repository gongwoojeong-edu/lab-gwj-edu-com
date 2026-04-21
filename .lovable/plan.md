

## 핸드아웃 입력 행 자동 생성 + 학습완료 목록 인쇄여부 표시

### 현재 동작

- `/teacher` 대시보드 "오늘의 핸드아웃 성적 입력" 표는 **모든 학생을 항상 빈 행으로 노출** → 인쇄도 안 한 학생까지 입력 대상으로 보여 산만함.
- 인쇄(`/teacher/print-queue`에서 PDF 열기)와 성적 입력 사이에 연결이 없음.

### 제안 동작

**(1) 인쇄 실행 = 핸드아웃 입력 행 자동 생성**
- `PrintQueue.tsx` "PDF 열기" 버튼을 누르면 → 해당 학생·당일 날짜의 `handout_results` 행을 **빈 점수로 upsert** (없을 때만 생성, 이미 있으면 그대로 둠).
- 동시에 `print_requests`를 `printed`로 마킹(기존 "처리 완료" 흐름 유지). 즉 "PDF 열기"가 곧 "인쇄 완료 처리 + 입력 행 생성" 한 번에.
- TeacherHome 입력 표는 **오늘 행이 존재하는 학생만** 표시. 행이 없으면 "오늘 인쇄된 핸드아웃 없음" 안내.

**(2) 학습완료 목록 — "인쇄됨" 배지**
- 기존 `DailyTestSummary`(학생 행 펼침에서 보이는 14일 일별 표)에 **인쇄 여부 컬럼/배지** 추가.
- 판단 기준: 해당 날짜에 그 학생의 `print_requests.status = 'printed'` 이력이 1건 이상이면 🖨 배지 표시.
- 인쇄 0건이면 회색 dash.

**(3) 수동 추가 옵션 (탈출구)**
- 인쇄 안 했어도 즉석 채점이 필요한 경우를 위해 입력 표 상단에 *"+ 학생 추가"* 드롭다운 → 선택 시 그 학생의 빈 행 즉시 생성(handout_results upsert).

### 구체 변경

| 파일 | 변경 |
|---|---|
| `src/lib/handoutResults.ts` | `ensureHandoutRow(userId, teacherId, testDate)` — 행 없으면 빈 score로 upsert, 있으면 no-op. 반환 `HandoutResult`. |
| `src/lib/printRequests.ts` | `markPrintRequestHandled` 호출 시점에 `ensureHandoutRow` 같이 호출하거나, PrintQueue에서 두 함수 순차 실행. |
| `src/pages/teacher/PrintQueue.tsx` | "PDF 열기" 클릭 시 (a) PDF 새 탭 열기 (b) `markPrintRequestHandled` (c) `ensureHandoutRow` 순으로 실행. 별도 "처리 완료" 버튼은 백업용으로 유지. |
| `src/pages/teacher/TeacherHome.tsx` | 학생 표 데이터를 `students` 전원 → **오늘 `handout_results` 가 존재하는 학생만** 필터. 빈 상태일 때 안내 카드. 상단에 "+ 학생 추가" Combobox(없는 학생 선택 시 `ensureHandoutRow` 후 새로고침). |
| `src/components/teacher/DailyTestSummary.tsx` | 14일치 데이터에 그 날짜 `print_requests` 인쇄건수 매핑 → 컬럼 "인쇄"에 🖨 + 건수, 없으면 `—`. |
| `src/lib/dailyTest.ts` | `DailyTestRecord`에 `printed_count: number` 필드 추가, `buildDailyTestRecord`에서 같이 채움. |

### 데이터 모델

- 신규 테이블 없음. `handout_results`(이미 빈 점수 허용 — `word_ho_score`/`syntax_ho_result` 둘 다 nullable) 그대로 활용.
- `print_requests.status='printed'` 와 `handled_at` 이미 존재 → 인쇄 이력 조회용.

### 비고

- 마이그레이션 없음. RLS 변경 없음.
- 인쇄 안 한 학생을 표에서 숨기는 게 핵심 UX 변화 — "+ 학생 추가" 탈출구로 보완.
- `DailyTestSummary` 인쇄 배지는 그날 학생이 인쇄해 가져갔는지(=실제 오프라인 학습 여부) 빠르게 확인 가능.


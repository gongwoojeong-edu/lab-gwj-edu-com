## 학습결과 "전체인쇄" → 유닛 통합 워크북 (앞면=영어+해석 / 뒷면=구조도)

### 현재 문제
학습결과 화면에서 학생 카드 우측 상단의 **[전체인쇄]** 버튼은 지금 단순히 학생의 모든 sentence를 돌면서 **개별 핸드아웃 N장을 N개의 인쇄창**으로 띄우고 있습니다 (`handlePrintAll`, line 602). 
이미 만들어둔 통합 워크북 빌더 `buildUnitWorkbookHtmlFor` 자체는 존재하지만, 학습결과 화면의 "전체인쇄"가 그것을 호출하지 않아 사용자가 원하는 "유닛 한판" 결과물이 나오지 않는 상태입니다.

또한 사용자가 새로 정의한 양면 레이아웃은 기존 `unitWorkbook.ts` 구성 (지문별 분석 채점본 + 마지막 통합 해석본)과도 다릅니다.

### 새 출력 사양

**앞면 (영문분석 + 학생해석)**
유닛 안의 **모든 완료 문장**을 한 흐름으로 이어서 출력. 각 문장 블록:
1) 학생이 제출한 **분석 채점본** (영어 단어 위/아래 품사·역할 라벨이 컬러로 채점된 형태 — 인쇄 시 컬러 유지, 기존 `buildAnalysisPrintHtml` 스타일 그대로)
2) 바로 아래 같은 페이지 흐름으로 학생이 제출한 **한글해석** (없으면 "(미제출)")
- B5 세로, 문장 사이는 점선으로만 구분, 페이지가 부족하면 자동으로 다음 장으로 이어짐.

**뒷면 (구조도)**
- 유닛에 등록된 `textbook_units.structure_pdf_url` 또는 `analysis_pdf_url` (기존 포맷). 
- PDF가 등록되어 있으면 `<embed>` 또는 새 페이지 안내(브라우저 인쇄 시 별도 첨부 안내). 
- 등록 PDF가 없으면 "구조도 작성용 빈 페이지" (현재 `uo-end-page` 의 grid 영역) 1장으로 fallback.

**컬러 보존**
이미 `buildAnalysisPrintHtml` 에서 `-webkit-print-color-adjust: exact` 가 들어가 있어 인쇄 시 채점 컬러(녹/적/주/회)는 그대로 유지됩니다. 새 통합본도 동일 스타일을 그대로 inline 합니다.

### 구현 변경

#### 1. `src/lib/unitWorkbook.ts` — `buildUnitWorkbookHtmlFor` 의 `unit_only` 본문 재작성
- 기존: 문장 N개 × (분석 1p + 해석 1p) + 마지막 tail 2p
- 신규: **표지 1p → 분석+해석 통합 본문(자동 분할) → 구조도 뒷면 1p**
- 분석 부분은 `preloadAnalysisPayload` + `buildAnalysisPrintHtml` 로 만들지만, 페이지 단위가 아니라 **본문 섹션만** 추출하여 한 흐름에 이어 붙임. 각 문장 블록 끝에 `<div class="ko-block">` 으로 학생 한글해석을 붙임.
- 구조도 페이지: `textbook_units` 에서 `structure_pdf_url`(우선) 또는 `analysis_pdf_url` 을 fetch → 있으면 `<embed src="..." class="page" type="application/pdf">`, 없으면 빈 grid 페이지.

#### 2. `src/lib/printTemplates.ts`
- `buildAnalysisPrintHtml` 의 본문 영역만 따로 반환할 수 있도록 헬퍼 `buildAnalysisBodyFragment(payload)` 추가 (page wrapper 없이 inner section + 토큰 스타일).
- 새 함수 `buildUnitCombinedWorkbookHtml({ ctx, items, structurePdfUrl })`:
  - 표지 + 모든 item 의 (분석 fragment + 학생 한글해석 블록) 을 `.combined-block { break-inside: avoid }` 로 감싸서 한 흐름에 출력
  - 마지막에 구조도 페이지 (PDF embed 또는 빈 grid)

#### 3. `src/pages/teacher/LearningResults.tsx`
- `handlePrintAll(userId, sentenceIds)` 를 다음과 같이 변경:
  - sentence 들을 unit 단위로 그룹핑 (이미 화면에 있는 그룹 로직 재사용)
  - 각 unit 마다 `buildUnitWorkbookHtmlFor({ unitId, unitTitle, unitCode, studentId: userId, mode: students[userId].unit_workbook_mode })` 호출
  - 결과 HTML 들을 `launchPrintHtmlMany` 로 순차 인쇄 (유닛 1개면 1번만 뜸 → 사용자가 본 "한 워크북" 경험)
- 유닛 헤더의 작은 프린터 아이콘(line 936)도 동일하게 단일 유닛용 `buildUnitWorkbookHtmlFor` 호출로 교체.

### 동작 시나리오
- 학생 카드 모드 토글이 **유닛만** 인 상태에서 [전체인쇄] 클릭 → 유닛별 1개 워크북, 앞면=영어 분석+학생 해석 통합, 뒷면=구조도. 인쇄창 1개(유닛 1개 시).
- **유닛+문장** 모드는 기존 동작(지문별 분석/단어/해석) 유지.
- 컬러 채점 라벨은 컬러 인쇄로 그대로 출력.

### 변경 파일
- `src/lib/printTemplates.ts` — `buildAnalysisBodyFragment`, `buildUnitCombinedWorkbookHtml` 추가
- `src/lib/unitWorkbook.ts` — `unit_only` 분기 시 새 통합 빌더 사용 + 구조도 PDF fetch
- `src/pages/teacher/LearningResults.tsx` — `handlePrintAll` 을 유닛 단위 통합 워크북 호출로 교체


## 플랜 — 학습결과 화면 보기만 개선

핸드아웃 인쇄에는 이미 한글해석이 포함되어 있으므로, **학습결과 화면의 [보기] 동선만** 손봄.

### 1. 학습결과 컬럼 라벨 변경
**파일**: `src/pages/teacher/LearningResults.tsx`

- "구문분석" 컬럼 헤더 → **"분석+해석"** 으로 라벨 변경.
- 점수 셀 표기: 기존 분석율 `%` 옆에 한글해석 P/F 병기.
  - 예: `85% · 해석✓` (제출+내용 있음) / `85% · 해석✗` (미제출).
- 해당 셀의 [👁보기] 버튼 1개로 통합 (별도 한글해석 보기 버튼 추가 안 함).

### 2. [👁보기] — 분석 + 해석 동시 표시
**파일**: `src/pages/teacher/AnalysisCompare.tsx`

- 학습결과의 [👁보기] 클릭 시 기존처럼 `/teacher/compare/:sentenceId/:userId` 로 이동.
- `AnalysisCompare.tsx` 상단 헤더 영역에 **학생 한글해석 카드** 추가:
  - `sentence_translations` 에서 `(sentence_id, user_id)` 의 학생 제출본 fetch.
  - 영어 원문 카드 바로 아래에 "학생 한글해석" 라벨 카드로 표시.
  - 미제출이면 "한글해석 미제출" 회색 안내.
- 인쇄 시에는 비교 페이지의 한글해석 카드도 함께 인쇄되도록 print CSS 유지(no-print 클래스 미부여).

### 3. 인쇄 버튼 / 핸드아웃은 변경 없음
- `AnalysisHandout.tsx` 는 이미 한글해석 포함 — 수정 없음.
- 한글해석 별도 인쇄 라우트/페이지 신설 안 함.

### 변경 파일 요약
- `src/pages/teacher/LearningResults.tsx` — 컬럼 헤더 "분석+해석", 점수 셀에 해석 P/F 병기.
- `src/pages/teacher/AnalysisCompare.tsx` — 헤더 아래 학생 한글해석 카드 추가.

DB 스키마 변경 없음. 그 외 항목(N중 절 다층 렌더, autoprint 즉시 인쇄, 차이요약 surface, 사이드바 [요청확인] 통합, 특별과제 마감 후 미완료 존치)은 직전 승인 계획대로 그대로 진행.


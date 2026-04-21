

## 특별과제 — UI 마무리 (DB 마이그레이션 완료 상태)

DB(`include_analysis`/`include_translation`/`include_wordtest`) 는 이미 적용되어 있어, **UI 코드 작업만** 진행합니다.

### 1) `src/pages/teacher/Assignments.tsx`

- 출제 폼에 **학습 단계 체크박스** 3개 추가 (분석 / 번역 / 단어테스트, 기본 모두 체크, 최소 1개 필수)
- 빠른 프리셋 버튼: `[전체] [분석만] [단어만]`
- 각 과제 행에 **연필 아이콘** → 수정 다이얼로그 (제목·대상·마감일·교재/지문·학습 단계·설명 모두 수정 가능)
- 각 과제 행에 **+1주 칩** (마감일 빠른 연장)
- 목록 카드에 단계 배지 `[분석] [번역] [단어테스트]` (포함된 것만 컬러)

### 2) `src/pages/StudentHome.tsx`

- 특별과제 카드에 단계 배지 표시 (포함=컬러, 미포함=회색·취소선)

### 3) `src/pages/teacher/TeacherHome.tsx`

- 마감 임박 위젯 카드에도 동일한 단계 배지 표시

### 변경 파일 (3개)

- `src/pages/teacher/Assignments.tsx`
- `src/pages/StudentHome.tsx`
- `src/pages/teacher/TeacherHome.tsx`

### 제외 (후속 라운드)

- 학습 페이지(`SentenceLearn`)에서 체크 안 된 단계 자동 스킵 — 별도 요청 시 진행


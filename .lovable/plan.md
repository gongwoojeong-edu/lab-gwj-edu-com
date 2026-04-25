# 유닛 워크북 모드 토글 → 실제 인쇄 분기 연결

## 목표

`student_profiles.unit_workbook_mode` 값(`unit_only` / `both`)을 유닛 워크북 인쇄 시 실제로 반영한다.

- **both (기본값)**: 지금처럼 [분석 채점본 → 단어 시험지 → 한글해석 HO] 3종 모두 인쇄
- **unit_only**: **단어 시험지 섹션을 빼고** [분석 채점본 → 한글해석 HO] 2종만 인쇄

> 표지(목차/스탬프)와 표지의 안내 문구도 모드에 맞게 살짝 조정한다.

---

## 변경 파일 (3개)

### 1. `src/lib/unitWorkbook.ts` — 핵심 분기

- `BuildUnitWorkbookInput`에 `mode: "unit_only" | "both"` 필드 추가 (선택값, 기본 `"both"`).
- `buildPassageSection(sentenceId, studentId, mode)` 시그니처 확장:
  - `mode === "unit_only"` 이면 단어 시험지 블록 (현재 113~123줄) **스킵**.
  - 분석 채점본 + 한글해석 HO는 그대로 유지.
- `buildUnitWorkbookHtmlFor`:
  - 인자에서 `mode` 받아 `buildPassageSection` 호출 시 전달.
  - 표지(`buildCoverPage`)에 모드를 함께 넘겨, 푸트노트 문구를 모드별로 분기:
    - both → "각 지문은 [분석 채점본 → 단어 시험지 → 한글해석본] 순으로 구성되어 있어요."
    - unit_only → "각 지문은 [분석 채점본 → 한글해석본] 순으로 구성되어 있어요. (유닛 모드 · 단어 시험지 제외)"
  - 표지의 페이지 번호 추정값 `i * 3 + 2` 도 모드에 따라 `i * 2 + 2` 로 분기 (단순 표시값이지만 일관성).
- 반환 객체에 `mode` 도 함께 실어두면 호출부에서 토스트 메시지에 활용 가능 (옵션).

### 2. `src/pages/teacher/BookshelfUnit.tsx` — 호출부에 모드 전달

- `handlePrintUnitWorkbook` (현재 189~218줄):
  - 선택된 학생의 `mode`(이미 `studentList`에서 들고 있음, 156~158줄)를 찾아 `buildUnitWorkbookHtmlFor` 호출 시 함께 전달.
  - 인쇄 성공 토스트 description에 모드 라벨 추가 (예: `12개 지문 포함 · 유닛+문장`).
- 학생 선택 Select의 라벨(786줄)은 이미 `· 유닛만` 표시가 있으므로 유지.

### 3. (옵션) `src/pages/teacher/Assignments.tsx` / `RequestsInbox.tsx` / `LearningResults.tsx`

- 이 페이지들은 **유닛 워크북이 아니라 개별 지문 HO/Word 인쇄**라서 모드 분기와 무관하다.
- 단, 같은 토글 컴포넌트가 거기에도 노출돼 있으므로 사용자에게 혼선이 없도록 **이번 작업에서는 손대지 않고**, 추후 토글의 의미를 안내하는 툴팁만 추가하는 별도 작업으로 분리.

---

## 동작 검증 (작업 후 직접 확인)

1. `vera` 계정 또는 임의 학생 1명을 골라 `unit_workbook_mode`를 `unit_only`로 변경.
2. 책장 → 해당 유닛 진입 → "유닛 워크북 인쇄" 클릭.
3. 미리보기 PDF 에서:
   - 표지 푸트노트가 "분석 채점본 → 한글해석본" 으로 바뀌었는지.
   - 각 지문 섹션에 **단어 시험지 페이지가 없는지**.
4. 같은 학생을 `both`로 바꾼 뒤 다시 인쇄 → 단어 시험지가 다시 포함되는지.

---

## 영향 범위 / 리스크

- DB 스키마 변경 없음 (`unit_workbook_mode` 컬럼은 이미 존재).
- 기존 호출부는 `mode` 미지정 시 기본값 `"both"` 로 동작하므로 **하위 호환**.
- 단어 추출/단어 시험지 데이터가 없는 학생도 `unit_only` 모드면 자연스럽게 깔끔한 워크북이 나오는 부수적 효과.

---

## 작업 순서

1. `unitWorkbook.ts` 에 `mode` 분기 추가
2. `BookshelfUnit.tsx` 호출부에 학생 모드 전달
3. 타입 체크 (`tsc --noEmit`) 통과 확인
4. 사용자 시연 환경에서 실제 인쇄 1회 확인

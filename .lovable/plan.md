## 목표

지금까지 혼동의 근원이었던 **학생별 `unit_workbook_mode` 설정을 폐기**하고, 워크북 인쇄 자체를 깔끔한 **2축 모델**로 다시 정의합니다.

- **축 1 — 워크북 종류**: 구문(분석+해석) / 단어
- **축 2 — 범위**: 유닛 통합 / 문장별

→ 총 **4종 인쇄 옵션**. 교사가 인쇄할 때마다 직접 선택. 학생 프로필에는 어떤 모드 설정도 저장하지 않음.

또한 단어와 구문은 **절대 같은 PDF에 섞지 않습니다**. 따로 출력.

---

## 새 인쇄 UI (교사용)

학생 카드/행의 "워크북 인쇄" 버튼을 누르면 모달이 뜨고, 4개 카드 중 하나를 선택:

```text
┌─────────────────────┬─────────────────────┐
│ 구문 · 유닛 통합     │ 구문 · 문장별       │
│ 유닛 전체 문장의     │ 한 지문의 영어 +    │
│ 영어 + 한글해석      │ 한글해석            │
│ (= 김재원 디자인)    │                     │
├─────────────────────┼─────────────────────┤
│ 단어 · 유닛 통합     │ 단어 · 문장별       │
│ 유닛 전체 단어 시험  │ 한 지문 단어 시험   │
└─────────────────────┴─────────────────────┘
```

- 카드 선택 → 미리보기(포함 지문 / 예상 페이지) → [인쇄 시작]
- 단어와 구문은 별도 인쇄 잡으로 처리. 두 개 필요하면 교사가 두 번 누름.

---

## 학생 설정 정리

- 학생 프로필 토글 `WorkbookModeToggle` **모든 화면에서 제거**:
  - `src/pages/teacher/RequestsInbox.tsx`
  - `src/pages/teacher/Assignments.tsx`
  - `src/pages/teacher/LearningResults.tsx`
  - `src/pages/teacher/BookshelfUnit.tsx`
  - `src/pages/TeacherStudents.tsx`
- `WorkbookModeToggle.tsx` 컴포넌트 파일 삭제
- DB 컬럼 `student_profiles.unit_workbook_mode` 는 **드롭하지 않고 그대로 둠**(데이터 안전). 코드에서 단지 더 이상 읽지/쓰지 않음. 추후 정리 마이그레이션은 별도.

---

## 코드 변경 (기술 영역)

### `src/lib/unitWorkbook.ts`
- `buildUnitWorkbookHtmlFor` 의 `mode` 파라미터를 새 4종 enum으로 교체:
  - `"syntax_unit"` → 기존 `buildUnitOnlyCombined()` 그대로 (= 김재원 디자인)
  - `"syntax_passage"` → 한 지문에 대해 [영어 + 학생 한글해석]만 (분석/단어 없음)
  - `"word_unit"` → 유닛 전체 단어 시험지 (`buildWordPrintHtml` 의 묶음 버전)
  - `"word_passage"` → 한 지문 단어 시험지
- 기존 `buildPassageSection`, `buildCoverPage`, `COVER_HEAD` 는 **사용처가 없어지므로 제거** (또는 export 안 하고 dead-code로 남김 → 정리 권장).
- `summarizeUnitProgress` 는 유닛 통합용에만 사용. 문장별은 단일 지문 ID만 받음.

### `src/components/teacher/UnitWorkbookPreviewDialog.tsx`
- 모드 선택 UI를 4-카드 그리드로 교체.
- "지문당 포함 섹션" 박스 제거(혼란 요소).
- 메타 표시: 학생 / 유닛 / 선택한 워크북 종류 / 포함 지문 수 / 예상 페이지.

### 호출부
- `LearningResults.tsx`, `BookshelfUnit.tsx` 의 인쇄 버튼은 학생별 mode를 안 읽고, 모달의 선택값을 그대로 `buildUnitWorkbookHtmlFor` 에 전달.

### 인쇄 단위
- 문장별(syntax_passage / word_passage) 인쇄는 "이 학생의 완료 지문 N개"를 PDF 한 묶음으로 (각 지문 1페이지씩). 또는 단일 선택. → **선택한 유닛 안의 완료 지문 전체를 묶어** 한 번에 인쇄(현재 흐름과 동일).

---

## 결과

- 배아은·전승우도 김재원과 동일하게 깔끔한 디자인 출력 (구문 유닛통합 카드 선택 시).
- 학생별로 따로 설정할 게 없어 미래의 "왜 학생마다 디자인이 다르지?" 혼란 원천 봉쇄.
- 단어 시험지는 항상 별도 인쇄 — 구문과 섞일 일 없음.

---

## 영향 범위

수정: 4 페이지 + 1 라이브러리 + 1 모달  
삭제: 1 컴포넌트(`WorkbookModeToggle`)  
DB: 변경 없음 (컬럼 보존, 코드에서 무시)

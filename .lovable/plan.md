
# 워크북 모드 선택 옵션 노출 위치 정리

## 현재 상태 (코드 확인 결과)

워크북 모드 값(`student_profiles.unit_workbook_mode`: `"unit_only"` 또는 `"both"`)은 이미 DB에 학생별로 저장되고 있습니다. 하지만 **선택 UI는 현재 단 한 곳, 학생 관리 페이지(TeacherStudents)에만 존재**합니다.

| 화면 | 워크북 모드 선택 가능? |
|---|---|
| 학생 관리 (진도설정) | ✅ 있음 (Select: 유닛만 / 유닛+문장) |
| 책장 > 유닛 (일괄 인쇄) | ⚠️ 표시만 됨 ("· 유닛만" 라벨), 변경 불가 |
| 과제 줄 때 (Assignments) | ❌ 없음 |
| 요청 확인 (RequestsInbox) | ❌ 없음 |
| 학습 결과 (LearningResults) | ❌ 없음 |

## 제안 (요청하신 4곳 모두에 추가)

학생별 모드 토글을 **공용 컴포넌트** `<WorkbookModeToggle studentId mode />`로 만들어서 아래 모든 곳에 동일하게 배치합니다. 어디서 바꿔도 같은 DB 컬럼이 갱신되어 즉시 반영됩니다.

1. **학생 관리 (진도설정)** — 이미 있음, 그대로 유지
2. **책장 > 유닛 (워크북 일괄 인쇄)** — 학생 행에 토글 추가 (인쇄 직전 마지막 점검용)
3. **과제 줄 때 (Assignments)** — 학생 선택 행 옆에 토글 추가 (과제 부여 시 어떤 워크북 받을지 즉석 조정)
4. **요청 확인 (RequestsInbox)** — 학생 이름 옆에 작은 배지/토글로 노출 (인쇄 요청 처리 직전 확인)
5. **학습 결과 (LearningResults)** — 학생 행에 표시 + 변경 가능

## 동작 규칙

- **`unit_only`** = 유닛 단위 통합 워크북만 인쇄
- **`both`** = 문장별 워크북 + 유닛 통합 워크북 모두 인쇄
- 한 곳에서 변경하면 다른 모든 화면에 즉시 반영 (단일 DB 컬럼이므로)
- 토스트로 "○○ 학생 워크북 모드: 유닛만 / 유닛+문장 저장됨" 안내

## 기술 세부

- **신규 파일**: `src/components/teacher/WorkbookModeToggle.tsx`
  - props: `userId`, `value: "unit_only" | "both"`, `onChange?`
  - shadcn `Select` 또는 `ToggleGroup` 사용 (좁은 폭에서는 작은 버튼 2개)
  - 변경 시 `student_profiles.unit_workbook_mode` UPDATE
- **수정 파일**:
  - `src/pages/teacher/Assignments.tsx` — 학생 목록 로드 시 `unit_workbook_mode` select에 포함, 행에 토글 렌더
  - `src/pages/teacher/RequestsInbox.tsx` — 요청별 user_id로 모드 조인 표시
  - `src/pages/teacher/LearningResults.tsx` — 학생별 행에 모드 컬럼/토글 추가
  - `src/pages/teacher/BookshelfUnit.tsx` — 표시만 되던 라벨을 토글로 교체
  - `src/pages/TeacherStudents.tsx` — 기존 Select를 신규 공용 컴포넌트로 교체 (동작 동일)
- DB/마이그레이션 변경 없음 (컬럼 이미 존재)

## 확인 부탁

- 4곳 모두 추가 진행 OK 인가요?
- 아니면 우선 **과제 줄 때 + 요청 확인** 2곳만 먼저 추가할까요? (학습결과는 사후 분석용이라 변경 빈도 낮음)

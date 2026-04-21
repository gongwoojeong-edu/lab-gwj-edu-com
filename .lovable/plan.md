

## 특별과제 단계 박스 — 진척/결과 표시 (수정판)

### 변경 요약

이전 플랜에서 **(2) 박스 안 진척/결과 인라인 표시 작업은 제외**합니다. 박스 내부 `12/20 · 85` 텍스트는 추가하지 않고, 기존 박스 모양 그대로 두되 hover 시에만 상세 정보를 보여줍니다.

### 최종 작업 범위

**(1) 활성화된 단계만 표시** ✅ 유지
- `include=true`인 단계 박스만 렌더링.
- `include=false`는 완전히 숨김.

**(2) 박스 안 인라인 진척/결과 표시** ❌ **제외**
- 박스 내부 `n/N · avg` 텍스트 추가 없음.
- 박스 외형은 기존 그대로 유지.

**(3) Hover 시 학생별 점수 리스트** ✅ 유지
- 각 박스에 `HoverCard` 적용.
- 컨텐츠: `이름 · 점수 · PASS/FAIL` 한 줄씩.
- 단어학습/한글해석은 `완료/미완료` 뱃지(점수 컬럼 빈칸).
- PASS 초록 / FAIL 호박색 / 미응시 회색.

### 데이터 소스 (hover 컨텐츠용)

| 단계 | 완료 판정 | 점수 |
|---|---|---|
| **단어학습** | `word_pre_results.completed=true` 1건 이상 | 최신 1건 `known/(known+unknown) × 100` |
| **구문분석** | `sentence_attempt_logs.analysis_passed=true` 1건 이상 | PASS 중 최고 `analysis_match_rate × 100` |
| **한글해석** | `sentence_translations` 행 존재 | 점수 없음 (제출 여부만) |
| **단어시험** | `word_test_results.passed=true` 1건 이상 | PASS 중 최고 `score × 100` |

집계는 누적(과제 시작~현재 모든 시도) 기준.

### 파일 변경

| 파일 | 변경 |
|---|---|
| `src/lib/assignmentProgress.ts` | **신규** — 4개 단계 진척 fetch 통합 헬퍼. `fetchAssignmentProgress(sentenceId, targetUserIds)` → user별 결과 Map 반환. |
| `src/components/teacher/AssignmentStepBadges.tsx` | `include=false` 단계 숨김. 박스에 `HoverCard` wrapping(progress + studentNameMap props 있을 때만). 박스 내부 텍스트는 기존 그대로(라벨만). |
| `src/pages/teacher/Assignments.tsx` | 과제별 `targetUserIds` 계산 → `fetchAssignmentProgress` 호출 → progress 캐시 → `AssignmentStepBadges`에 전달. |
| `src/pages/teacher/AssignmentsPast.tsx` | 동일하게 progress 전달. |
| `src/pages/teacher/TeacherHome.tsx` | "마감 임박" 카드에서도 동일 progress 전달. |

### 비고

- DB 변경 없음, RLS 변경 없음.
- 기존 `AssignmentStepBadges` props(`size`, `className`) 유지.
- progress 미전달 시 hover 비활성(현재 동작과 동일).


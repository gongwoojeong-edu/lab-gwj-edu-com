

## 목표

[정답 저장] 버튼을 **"이 단어 분석 완료" 확정 사인**으로 정의. 저장 = 완료 마킹 + localStorage commit. 저장 후에도 자유롭게 재수정/재저장 가능.

## 상태 정의 (정답 입력 모드 기준)

owner별로 3가지 상태:

| 상태 | 조건 | 시각 표시 |
|---|---|---|
| **빈 상태** | progress 없음 | 표시 없음 |
| **작업 중 (dirty)** | 변경했지만 미저장 | 부배지에 점선 테두리 + 빨간 점, 패널에 "미저장" |
| **완료 (saved)** | [정답 저장] 클릭 후 | 부배지 실선 + ✓ 마크, 패널에 "분석 완료" |

추가 수정 시 → 다시 dirty → 다시 저장 = 완료 갱신 (사이클 반복)

## 변경 내용

### 1. `src/pages/Index.tsx`

- 새 state
  - `pendingPatchMap: Record<ownerId, Record<string, unknown>>` — 미저장 누적 patch
  - `savedOwnerSet: Set<ownerId>` — [정답 저장] 클릭으로 "완료 확정"된 owner 집합 (localStorage `gwj.savedOwners.v1`에 영속)
- 헬퍼
  - `stagePatch(ownerId, patch)` — pendingPatchMap에 머지 (자동저장 X)
  - `commitPatch(ownerId)` — pending → `upsertCustomAnswer`로 저장 + `savedOwnerSet`에 추가 + pending entry 제거 + toast "분석 완료 저장됨"
  - `discardPatch(ownerId)` — pending entry 제거 (저장 상태 변화 없음)
  - `getOwnerStatus(ownerId)` → `"empty" | "dirty" | "saved"`
- 기존 자동저장 호출(`if (answerInputMode) saveCustom(...)`)을 모두 `stagePatch(...)`로 교체
- 예외 (자동저장 유지)
  - 절(clause) 범위 확정 — 구조적 데이터
  - 지우개로 owner 삭제 — `customAnswers`와 `savedOwnerSet`에서 함께 제거
- `getMergedAnswerForOwner`가 `customAnswers + pendingPatch`까지 머지 → 화면값은 즉시 반영
- selectedId 변경 / 정답 입력 모드 OFF 시 dirty 남아있으면 AlertDialog: [저장 후 이동] / [버리고 이동] / [취소]
- 다른 문장으로 이동 시 dirty가 있어도 위 규칙 동일 적용

### 2. `src/components/analyzer/AnalysisPanel.tsx`

- props 추가: `answerInputMode`, `ownerStatus: "empty"|"dirty"|"saved"`, `onSaveAnswer`, `onDiscardAnswer`
- 정답 입력 모드일 때 패널 헤더에:
  - `ownerStatus === "saved"` → 초록 ✓ 배지 "분석 완료" + [재저장] 버튼 (변경 없으면 disabled)
  - `ownerStatus === "dirty"` → 빨간 점 + "미저장 변경" + [정답 저장] (primary) + [변경 취소]
  - `ownerStatus === "empty"` → 버튼 숨김

### 3. 부배지 시각 마킹 (`src/index.css` + `src/pages/Index.tsx`)

- 부배지 렌더 시 owner 상태 클래스 추가:
  - `.sub-badge-pill.is-dirty` — 점선 테두리 (`border-dashed`) + 우측 상단 작은 빨간 점
  - `.sub-badge-pill.is-saved` — 기본 실선 유지 + 우측 상단 작은 ✓ (정답 입력 모드에서만 노출)
- 일반(학생) 모드에서는 dirty/saved 마킹 노출하지 않음 (혼란 방지)

### 4. 영속화

- `gwj.savedOwners.v1` (localStorage): `string[]` — 완료 확정 owner id 목록
- 새로고침 시 복원, 문장 교체 시 해당 문장 토큰만 필터링해 사용

## 변경 파일

- `src/pages/Index.tsx`
- `src/components/analyzer/AnalysisPanel.tsx`
- `src/index.css`

## 검증

1. 정답 입력 모드 ON → 필드 변경: 화면 즉시 반영 / localStorage 변화 없음 / 부배지 점선 + 빨간 점 / 패널 "미저장"
2. [정답 저장] 클릭: localStorage 저장 / 부배지 실선 + ✓ / 패널 "분석 완료" / toast 안내
3. 저장된 owner 다시 수정: 즉시 dirty 상태로 전환 / [재저장] 활성 / 누르면 다시 완료
4. dirty 상태에서 다른 owner 클릭 또는 모드 OFF: 확인 다이얼로그 3종 동작
5. [변경 취소]: 마지막 저장 값으로 복원, 완료 표시 유지
6. 지우개로 owner 삭제: customAnswers + savedOwners 모두 정리
7. 새로고침: 저장된 완료 상태/값 복원, 미저장 변경은 사라짐
8. 일반 모드(학생 화면): dirty/saved 마킹 안 보임


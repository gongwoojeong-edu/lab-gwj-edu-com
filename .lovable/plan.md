

기존 플랜에 대명사 지시어/수식 방향 화살표의 **수정·삭제 기능**을 추가합니다.

## 추가 항목

### F) 화살표 수정/삭제 UX

**어디에서 조작하나**
- `AnalysisPanel` 하단의 `[수식 대상 지정]` / `[지시어 지정]` 버튼 영역을 상태별 3분기로 확장:
  1. 미지정 상태 → `[지정]` 버튼
  2. 지정 완료 상태 → `대상: <단어>` 라벨 + `[변경]` + `[삭제]` 두 버튼
  3. pending(대상 클릭 대기) 상태 → `[취소]` 버튼 + 안내 배너

**동작 규칙**
- **변경**: pending 상태로 진입 → 본문에서 새 단어 클릭 시 `upsertModifierTarget` / `upsertReferentTarget`으로 덮어쓰기
- **삭제**: 즉시 `removeModifierTargetBySource` / `removeReferentTargetBySource` 호출, 화살표 사라짐, localStorage 동기화
- **owner 자체 삭제(eraser)**: 기존대로 해당 owner의 화살표도 자동 정리 (이미 구현된 cleanup 경로 재사용)
- **pending 중 다른 owner 선택**: pending 자동 취소
- **pending 중 ESC 키**: pending 취소 (선택 구현)

**본문 측 보조 조작 (선택적)**
- 화살표 자체에 마우스를 올리면 작은 `×` 아이콘이 떠서 클릭 시 삭제
- 데스크톱만 적용, 모바일은 패널 버튼으로만 조작
- 구현 난이도 낮으면 포함, 아니면 패널 버튼만으로 충분

## 수정 대상 파일

- `src/components/analyzer/AnalysisPanel.tsx`
  - 버튼 영역을 `미지정 / 지정완료 / pending` 3상태 렌더링으로 분기
  - `currentModifierTarget`, `currentReferentTarget` prop 추가 (현재 owner의 저장값)
  - `onRemoveModifierTarget`, `onRemoveReferentTarget` prop 추가
  - `onCancelPending` prop 추가
- `src/pages/Index.tsx`
  - 위 prop들 연결
  - `removeModifierTargetBySource` / `removeReferentTargetBySource` 호출 핸들러
  - pending 취소 핸들러
  - (선택) `ArrowOverlay`에 hover 삭제 핸들 추가
- `src/lib/modifierTargets.ts`, `src/lib/referentTargets.ts`
  - 이미 `removeXBySource` 함수 존재 → 추가 작업 없음

## 검증

14. 지정 완료 상태에서 패널에 `대상: <단어> [변경] [삭제]`가 보인다
15. `[변경]` → 새 단어 클릭 시 화살표 끝점만 바뀐다
16. `[삭제]` → 화살표 즉시 사라지고 새로고침 후에도 사라진 상태 유지
17. pending 중 `[취소]` 누르면 pending 해제, 본문 클릭 가로채기 해제
18. owner를 eraser로 지우면 해당 화살표도 같이 사라진다
19. (선택 구현 시) 화살표 hover → `×` → 클릭으로 삭제 가능




## 현재까지 합의된/누락된 항목 정리

이번 턴 기준 다음 플랜으로 한 번에 묶어서 처리합니다. "선택 해제 버튼 복구"는 명시적으로 포함합니다.

## 구현 계획

### 1) 삭제 게이트 단일화 (`src/pages/Index.tsx`)
- `handleWordMouseDown`에서 `Shift/Ctrl/Meta + 완료 owner 클릭 → eraseOwner` 분기 **완전 제거**
- 삭제 진입 조건은 **오직** `eraserMode === true && 완료 owner 클릭` 하나
- 결과: 추가분석 의도 클릭이 절대 삭제로 이어지지 않음

### 2) 완료 owner 클릭 시 다층 분석 진입 보장
- eraserMode OFF + 완료 owner 클릭:
  - 기존 owner 보존
  - 클릭한 토큰 1개만 새 selection으로 시작 → 새 ownerId로 새 layer 생성
- Shift+클릭은 기존 selection에 토큰 누적 (확장 선택, 삭제 아님)

### 3) "선택 해제" 버튼 복구
- 위치: 분석 패널 / 하단 toolbar (지우개 버튼 옆)
- 표시 조건: `activeSelectionIndices.length > 0` 일 때만 노출
- 동작: `setActiveSelectionIndices([])` + `setSelectedId(null)` (진행 중 임시 progress도 초기화)
- 라벨: "선택 해제" + X 아이콘

### 4) 다층 색 가시성 (`WordChip.tsx` + `Index.tsx` + `index.css`)
- owner별 layer depth(1·2·3) 계산해서 `WordChip`에 prop으로 전달
- 이미 정의된 `--layer-1 ~ --layer-4` 토큰을 layer depth에 맞춰 적용
- 누적 시 좌측 또는 하단에 얇은 색 막대(2px)로 layer 개수 표시
- stacking opacity 상향 (예: 0.18 → 0.32)

### 5) 하단 배지 = SVOC 전용 (`WordChip.tsx` + `labels.ts`)
- 하단 큰 배지에는 `buildElementBadge` 결과(S/V/O/C/M)만 표시
- 부배지(품사·역할 라벨) 문구는 하단에서 제거하고 상단/툴팁으로만 노출

## 수정 파일
- `src/pages/Index.tsx` — 삭제 게이트 단일화, 선택 해제 버튼 연결, layer depth 계산
- `src/components/analyzer/AnalysisPanel.tsx` — "선택 해제" 버튼 footer 추가
- `src/components/analyzer/WordChip.tsx` — layer depth별 색, 하단 배지 SVOC만
- `src/index.css` — stacking opacity 조정, layer 막대 스타일
- (필요 시) `src/lib/labels.ts` — SVOC/부배지 분리 유틸 정리

## 검증 기준
1. Shift/Ctrl/Cmd 클릭으로 절대 삭제되지 않음
2. 지우개 OFF + 완료 owner 클릭 → 다층 분석 진입
3. 2층/3층 쌓일 때 색이 명확히 다르게 보임
4. 지우개 ON + 완료 owner 클릭 시에만 삭제
5. 분석 중 "선택 해제" 버튼으로 selection 즉시 비우기 가능
6. 하단 배지에 S/V/O/C/M 만 노출 (부배지 문구 없음)


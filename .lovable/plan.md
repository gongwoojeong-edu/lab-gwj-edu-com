

## 분석 계획

### 1) `era` 등 일부 단어 분석 메뉴 미표시 문제

**원인 추정:**
- `era`는 `s1-4b` 토큰으로 정의되어 있고 `role: "to V의o"`로 등록됨
- 직전 작업에서 단일클릭이 무조건 single-target select 되도록 바꿨음에도 여전히 메뉴가 안 뜬다면, `selectedWord`가 세팅돼도 패널 내부에서 해당 토큰의 기존 분석(`role`이 SUPPRESS_ROLES에 포함)에 따라 POS/role 옵션이 비활성/숨김 처리되었을 가능성
- 또는 `INTERNAL_OBJECT_ROLES`(전치사의o/to V의o/V-ing의o)에 해당하는 토큰이 다른 owner span(예: `to solidify` 형용사 to V) 안에 시각적으로 포함돼 있어서, 클릭 시 outer owner가 잡혀 era가 selectedWord로 안 들어가는 케이스

**해결:**
- `Index.tsx`의 `handleWordMouseDown`에서 클릭 좌표 토큰을 **항상** 단일 selection으로 강제 (outer owner span hit-test 무시)
- `AnalysisPanel`이 `selectedWord` 존재만으로 항상 보이도록 보장 (현재 desktop은 항상 렌더되나, 내부 POS row가 disabled되는 케이스 점검)
- 지우개 토글 버튼은 헤더에 항상 보이도록 보장 (현재도 보이지만 selectedWord 없을 때 비활성 → 항상 활성으로 변경)
- `selectedWord`가 없을 때도 패널에 "단어를 클릭하세요" 안내 + POS 버튼은 disabled, 지우개는 항상 enabled

### 2) 접속사절 내부 다층 분석 시 여러 단어 클릭(드래그) 유지

**원인 추정:**
- 직전 변경에서 단일클릭 = 단일 토큰만 선택, 멀티는 Shift/Ctrl/드래그 필요로 바꿨음
- 절(접SV) 내부에서 "여러 단어 묶어 추가 분석"을 하려면 드래그가 절 owner span을 가로질러 작동해야 함
- 현재 드래그 로직이 절 owner span을 만나면 owner 전체로 확장되어 부분 다층 선택이 막힐 수 있음

**해결:**
- 드래그 선택 시 outer 절 owner span 무시하고 raw token 인덱스 범위로만 selection 구성
- 절 내부 부분 선택(예: `has influenced and aided` 또는 `influenced and aided`)이 그대로 유지되도록 처리
- 클릭/드래그가 절 안에 있어도 outer owner로 자동 확장되지 않게 분기

**구현 위치:** `src/pages/Index.tsx`
- `handleWordMouseDown` / `handleWordMouseEnter` / drag commit 로직에서 `outerOwnerKey` 기반 자동 확장 제거 (다층 분석 의도 우선)
- 단, 지우개 모드일 때는 클릭한 owner span 전체 삭제 동작은 유지

### 검증 시나리오
1. `era` 단일 클릭 → 분석 패널 POS 버튼 활성화, 지우개 버튼 항상 보임
2. `that has influenced and aided the development of sports` 1차 분석(형용사 > 접SV > 관대주격) 후
3. 절 내부에서 `has`, `influenced`, `aided` 드래그 → 3개 토큰 선택 유지, 동사 > 현재완료 분석 가능
4. 그 위에 다시 `influenced and aided` 드래그 → 기타 > 병렬 분석 가능
5. 각 layer별 배경색이 겹쳐 표시되며 기존 분석 유지


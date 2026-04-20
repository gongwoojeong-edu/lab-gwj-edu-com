
## 목표

다음 3가지를 한 번에 정리합니다.

1. `this day` 같은 단어에 남는 보라 배경이 지우개 후 완전히 사라지도록 수정
2. `that has influenced`처럼 접속절 내부 다층 부배지가 겹치지 않도록 간격/배치 개선
3. 명사의 `지시어` 버튼, 형용사의 `수식어 대상 지정` 버튼을 Layer 3 하단으로 내려 선택 가능하게 재배치

---

## 1. 지우개 후 `this day` 보라 배경 잔상 제거

### 원인
현재 본문 배경은 `completedSelectionMap` 기준으로 레이어를 다시 그리는데, 지우개는 클릭한 위치의 owner만 지우더라도 같은 구간에 걸친 다른 owner/hydrated owner가 남아 있으면 `buildLayerBg()`가 계속 보라색을 생성할 수 있습니다. 특히 span owner와 단일 owner가 겹친 경우 잔상이 생기기 쉽습니다.

### 변경
`src/pages/Index.tsx`
- 지우개 클릭 시 해당 인덱스를 덮는 완료 owner를 전부 수집하는 로직을 더 엄격하게 정리
- 삭제 기준을 `completedSelectionMap` + `progressMap.completed` + 현재 문장 범위 owner로 통일
- `eraseOwner()`에서 아래 상태를 반드시 함께 정리
  - `progressMap`
  - `completedSelectionMap`
  - `customAnswers`
  - `pendingPatchMap`
  - `savedOwnerSet`
  - `userLinkedOwnerSet`
  - modifier / referent 관계
- 삭제 직후 렌더에 남은 owner가 실제로 있는 경우만 배경이 그려지도록 `buildLayerBg()` 방어 조건 강화
- 구두점/스페이서 배경 계산도 동일한 살아있는 owner 목록만 사용하도록 맞춤

### 기대 결과
- `to this day`, `solidify`처럼 이전에 분석했다가 지운 단어의 보라 배경이 완전히 사라짐
- 단어/스페이서/구두점 중 일부만 남는 잔상도 같이 제거됨

---

## 2. 접속절 내부 다층 부배지 겹침 해결

### 원인
현재 부배지는 같은 anchor 단어에 2개가 붙을 때만 단순히 좌우로 `±28px` 이동합니다. 실제 pill 너비나 단어 위치는 반영하지 않아 `that has influenced` 같은 구간에서 여전히 겹칩니다.

### 변경
`src/pages/Index.tsx`
- 부배지 배치를 “2개면 left/right” 수준이 아니라, anchor 기준으로 각 pill의 순서별 오프셋을 계산하는 방식으로 변경
- 같은 단어에 2개 이상 부배지가 걸리면 다음 규칙 적용
  - Layer 1/외곽 badge는 anchor 근처 유지
  - Layer 2, 3, 4 badge는 누적 간격으로 더 멀리 이동
  - 단어가 문장 왼쪽에 가까우면 오른쪽 위주, 오른쪽에 가까우면 왼쪽 위주, 중앙이면 양쪽 분산
- `data-shift="left|right"` 한 단계 대신, 예: `data-shift-step="0|1|2"` 또는 inline transform 값으로 거리 누적
- anchor 단위로 부배지 개수를 세서 2개, 3개, 4개 모두 처리

`src/index.css`
- `.sub-badge-row` gap 확대
- `.sub-badge-pill` 좌우 margin/max-width 조정
- shift 거리 1단계/2단계 규칙 추가
- 필요 시 row의 top 위치를 소폭 더 위로 올려 badge와 본문 충돌도 완화

### 기대 결과
- `that has influenced` 같은 다층 접속절 내부 부배지가 서로 겹치지 않음
- 2층/3층 이상이 한 단어에 걸려도 간격이 유지됨
- 기존 layer 색상/번호색은 그대로 유지

---

## 3. `지시어`, `수식어 대상 지정` 버튼을 Layer 3 하단으로 이동

### 원인
현재 이 두 기능은 `AnalysisPanel` 상단 공통 영역에 렌더되어, Popover 내부의 Layer 02/03 버튼들 뒤쪽으로 밀리거나 선택 동선이 어색합니다.

### 변경
`src/components/analyzer/AnalysisPanel.tsx`

#### 명사 패널
- 공통 상단의 `지시어 (대명사)` 블록을 제거
- `NounPanel` 안에서 Layer 03 역할 선택 이후 하단에 별도 섹션으로 렌더
- 노출 조건
  - 명사 role이 `대명사`이거나 지시 대상이 필요한 명사 해석일 때만 표시
- 위치
  - `ElementRoleGrid` 바로 아래, 완료 라벨 위 또는 완료 라벨 바로 아래로 고정

#### 형용사 패널
- 현재 상단 공통의 `수식 화살표` 블록을 제거
- `AdjPanel` 안에서 형용사 role이 `명사수식 / 명사앞수식 / 명사뒤수식`일 때 Layer 03 하단에 버튼 노출
- 기존 안내문만 있는 카드 대신 실제 버튼/상태 UI까지 이 위치로 이동
  - 지정
  - 변경
  - 삭제
  - 취소
  - 현재 대상 라벨

#### 공통 구조 정리
- `AnalysisPanel` 상단에는 품사/저장/선택 정보만 남기고
- modifier/referent UI는 각 품사 패널의 문맥 안에서 렌더
- 기존 prop 구조는 유지하고 렌더 위치만 품사별 하위 컴포넌트로 이동

### 기대 결과
- `대명사 지시어`, `형용사 수식어` 버튼이 뒤에 가려지지 않음
- 사용 흐름이 “Layer 02/03 선택 → 바로 아래에서 대상 지정”으로 자연스러워짐

---

## 변경 파일

- `src/pages/Index.tsx`
  - 지우개 삭제 범위 정리
  - 살아있는 owner 기준 배경 계산 보강
  - 부배지 오프셋 계산 로직 개선
- `src/components/analyzer/AnalysisPanel.tsx`
  - 지시어/수식어 대상 지정 UI를 상단 공통 영역에서 제거
  - 명사/형용사 패널 내부 Layer 3 하단으로 재배치
- `src/index.css`
  - 부배지 row/pill 간격 확대
  - 다단계 shift 스타일 추가

---

## 기술 세부사항

- 배경은 “현재 살아있는 완료 owner”만 기준으로 계산하도록 통일
- 부배지 배치는 단순 좌/우 토글이 아니라 anchor 기준 누적 오프셋 방식으로 변경
- 기능 prop은 재사용하되 렌더 위치만 품사 패널 내부로 이동해 회귀를 최소화
- 병렬/절 언더라인 규칙은 이번 작업에서 건드리지 않고 유지

---

## 검증

1. `this day` 분석 후 지우개 클릭 시 단어 배경, 스페이서 배경, 주변 잔상이 모두 사라짐
2. `solidify`도 동일하게 보라 잔상 없이 완전히 삭제됨
3. `that has influenced`에서 부배지 2개 이상이 겹치지 않고 읽을 수 있음
4. 명사에서 `대명사` 선택 후 `지시어 지정` 버튼이 Layer 3 하단에 보여 바로 클릭 가능
5. 형용사에서 `명사수식/명사앞수식/명사뒤수식` 선택 후 `수식 대상 지정` UI가 Layer 3 하단에 노출
6. 저장 버튼, 지우개, 절/병렬 표시 등 기존 동작은 유지


## 문제 재정의 (정답입력 모드)

| # | 문제 | 원인 추정 | 처리 방향 |
|---|---|---|---|
| 1 | `that soon followed` 접SV 분석 후 `[ ]` 대괄호 안 묶이고 보라 배경도 끊김 | 절(clause) 선택 저장 시 `clauseStart/clauseEnd`가 customAnswers에 안 박히거나, 렌더 루프가 절 범위를 인접 토큰까지 확장 안 함 | 절 확정 시 첫·끝 토큰에 `clauseStart=true`/`clauseEnd=true` + `clauseElement` 저장, 렌더에서 범위 내 모든 토큰(공백 포함) 보라 배경 + 양 끝 `[ ]` 표시 |
| 2 | 완료된 단어 클릭해도 재선택/지우개 안 됨 | 직전 라운드에서 `handleWordMouseDown`에 완료 토큰 복원 분기 추가했으나 idiom wrapper / clause wrapper의 outer span이 이벤트 가로채거나, `selectedId` 충돌로 패널이 안 뜸 | 완료 토큰 mousedown → `e.stopPropagation()` 후 owner의 `completedSelectionMap` 인덱스로 `selectedId·selectedWordIndices` 복원 + 진행상태 패널 로드 보장 |
| 3 | `force`를 V-ing의 o로 단독 분석 불가 | V-ing 본동사(`influencing` 등)가 이미 완료된 상태에서 인접 명사 단독 선택 시 부속 분석 진입 막힘 (또는 V-ing role 옵션에 "V-ing의 목적어" 미노출) | 완료 토큰과 무관하게 단독 단어 선택 시 명사 분석 진입 가능, `NounPanel`의 element=O role에 "V-ing의 목적어" 옵션 노출 보장 |
| 5 | `the era`를 to V의 o로 분석 불가 | 마찬가지로 명사 element=O role에 "to부정사의 목적어" 옵션이 컨텍스트에 없거나 다중선택 누적 안 됨 | role 옵션 보장 + 다중 토큰 드래그 후 명사 분석 진입 정상화 |
| 6 | `that has influenced and aided the development of sports` 접SV 분석 시 "숙어저장"만 뜨고 분석 패널 안 나옴 | 다중 단어 선택 시 길이 임계 또는 idiom hover wrapper가 분석 패널 트리거 가로챔. 또는 절 분석 진입 조건이 단일 동사 포함 가정 | 긴 다중 선택도 분석 패널 표시, idiom 입력 영역과 분석 영역 분리, "접SV 절로 분석" 버튼 항상 노출 |
| 7 | **다층(중첩) 분석 불가** — 절 안에서 또 절/구 선택해 추가 분석 못 함 | 토큰별 progress가 단일 owner 가정. 같은 토큰에 절 owner + 내부 부속 owner 두 층을 못 가짐 | progress/completedSelectionMap을 **layer 배열**로 확장: `layers: { ownerId, indices, kind: "clause"|"phrase"|"word" }[]`. 가장 안쪽 layer의 분석을 우선 표시, 외곽 layer 배경은 옅게, 부속 배지는 layer별로 누적 |

## 탐색이 더 필요한 지점

플랜 확정 전 다음 파일을 더 봐야 정확한 위치 잡힘:
- `src/pages/Index.tsx` 1100~1436 (완료 토큰 mousedown 복원 분기, 절 wrapper 렌더, idiom hover wrapper)
- `src/components/analyzer/AnalysisPanel.tsx` `NounPanel` element=O role 옵션 (V-ing의o, to V의o, 전치사의o)
- `customAnswers` 절/부속 저장 키 구조 (`clauseStart/clauseEnd/clauseElement`, `attachKind`, `attachOwnerId`)

명확화 필요: **다층 구조 저장 방식** — 같은 토큰이 외곽 절과 내부 부속에 동시에 속할 때 progress·element 배지·한국어 라벨을 어느 layer 기준으로 표시할지.

## 변경 계획 (확정 전 골격)

### 1. 데이터 모델 확장 (`src/pages/Index.tsx`)
- `completedSelectionMap: Record<string, number[]>` → `completedLayers: Array<{ ownerId, indices, kind: "clause"|"attach"|"word" }>`
- `progressMap`은 ownerId별 그대로, 단 같은 토큰이 여러 ownerId를 가질 수 있음
- `customAnswers`에 layer 정보 같이 저장 (clauseStart/End/Element 외에 `attachOf: tokenId`, `attachKind` 추가)

### 2. 렌더 (`src/pages/Index.tsx`)
- 토큰별 소속 layer 전체 조회 → 가장 외곽 layer 배경(절은 보라 + `[ ]`), 가장 안쪽 layer의 element 배지 + 한글 라벨 표시
- 인접 토큰이 같은 layer에 속하면 사이 공백도 같은 배경 채움
- 절 wrapper 첫/끝에 `[`, `]` (이미 있음) + 절 element 배지 1개

### 3. 완료 토큰 클릭 (`handleWordMouseDown`)
- 완료 토큰 mousedown 시 클릭 위치 토큰의 layer 중 **가장 안쪽** owner를 selectedId로 복원
- shift/double-click 시 더 외곽 layer로 전환 (선택사항, 기본은 안쪽)
- 분석 패널이 기존 progress 그대로 로드 → 수정/지우개 동작

### 4. 다중 선택 분석 진입 (`AnalysisPanel`)
- 선택 길이 무관하게 POS 패널 노출
- 명사 element=O role에 "V-ing의 목적어", "to부정사의 목적어", "전치사의 목적어", "분사의 목적어" 항상 옵션 제공
- 접SV 분석 버튼은 동사 포함 다중 선택 시 항상 노출 (idiom 저장과 별도 영역)

### 5. idiom hover wrapper 재정비 (`Index.tsx`)
- idiom outer wrapper `pointer-events-none`로 유지하되 hover 툴팁 영역은 별도 absolute span으로 분리
- 내부 단어 mousedown/enter/up/click 모두 정상 통과

## 손대지 않을 것
- 하단 SVOC 영문 배지 / 합성 부속 라벨 (전치사의 o 등)
- 한국어 의미 라벨, idiom localStorage 키, 식별자
- 데이터/테스트 페이지

## 진행 범위
1·2·3·5·6·7 항목 한 라운드에 통합 처리.  
핵심은 **#7 다층 layer 구조** — 이게 들어가야 1·3·5·6도 자연스럽게 풀림.


## 문제 정리

1. **`driving` 분석이 `force`에도 적용됨**  
   `force` 단독 클릭 시 인접 완료 토큰(`driving`)의 owner가 복원되어 분석 내용이 force에 묻어남. 단독 토큰 클릭은 항상 새 빈 분석으로 시작해야 함.

2. **LAYER 9 제목이 "숙어"로 남아있음**  
   `AnalysisPanel.tsx` 어딘가 한 곳이 아직 "숙어" 문자열을 쓰고 있음.

3. **관용구 영역이 LAYER로 들어가 있어서 일반 분석 패널을 가림**  
   `most`, `era` 단독 선택 시 POS 패널 대신 LAYER 9(관용구) UI만 노출. 관용구는 레이어 시스템과 무관하므로 분리 필요.

## 탐색 필요
- `AnalysisPanel.tsx`에서 LAYER 9 / "숙어" 문자열 위치
- `IdiomSection`이 어떻게 layer 배열에 끼어 있는지
- `Index.tsx` `handleWordMouseDown` 단독 토큰 분기 — 인접 완료 토큰의 owner를 잘못 복원하는 분기 확인

## 변경 계획

### 1. `Index.tsx` — 단독 토큰 클릭 시 분석 격리
- `handleWordMouseDown`에서 단일 토큰 클릭 시:
  - 그 토큰의 인덱스가 다른 owner의 `completedSelectionMap`에 포함돼 있어도 **자동 복원하지 않음**
  - 항상 빈 progress로 새 분석 시작 (selectedId = 해당 tokenId, selectedWordIndices = [idx])
  - 기존 owner 복원은 사용자가 명시적으로 완료 토큰 묶음 전체를 다시 선택했을 때만 적용
- `force` 단독 클릭 → 빈 명사 패널, `driving` 분석은 그대로 보존

### 2. `AnalysisPanel.tsx` — 관용구 섹션을 레이어에서 분리
- `IdiomSection`을 LAYER 목록 외부로 이동
  - 패널 상단 또는 하단에 항상 별도 영역으로 노출 (다중 선택 시에만)
  - 단일 토큰 선택 시에는 관용구 섹션 숨김 (관용구는 2단어 이상)
- LAYER 번호 매김에서 관용구 제외 → LAYER는 분석 owner들만 카운트
- "숙어" 잔여 문자열을 모두 "관용구"로 교체

### 3. 관용구 영역 시각 분리
- 분석 패널과 다른 카드/섹션 헤더로 구분 (예: `border-t` 위에 "관용구 저장" 별도 블록)
- POS 패널과 동시 표시되어 사용자가 분석 vs 관용구 저장 중 자유 선택

## 손대지 않을 것
- 다층 layer 모델, 절 배경/브래킷, 부속배지
- localStorage 키, idiom 식별자
- 하단 SVOC 배지

## 수정 파일
- `src/pages/Index.tsx` (handleWordMouseDown 단독 클릭 분기)
- `src/components/analyzer/AnalysisPanel.tsx` (IdiomSection 위치 분리, "숙어"→"관용구")

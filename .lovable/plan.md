

## 작업 계획

### 1) 지우개 버튼 위치 정리
- `AnalysisPanel` 헤더의 지우개 버튼 제거 → 하단 toolbar에만 유지
- 활성화 규칙 변경:
  - **분석 완료된 owner를 클릭/덮을 때만 활성화**
  - **분석되지 않은 단어 단순 클릭 시 → 비활성화**
  - 즉, `activeSelectionIndices` 중 하나라도 완료 owner에 속하거나, `selectedId`가 완료 owner일 때만 활성

### 2) 관용어구 설정 버튼 하단 이동
- `IdiomSection` 트리거를 하단 toolbar로 이동 (지우개 옆)
- popover/dialog로 입력 UI 노출, 저장/삭제 동작 유지
- 활성화 규칙: 1개 이상 토큰 선택 시 활성화

### 3) 불필요한 "선택 해제" 버튼 삭제
- 빈 곳/다른 단어 클릭으로 자동 해제되므로 별도 버튼 제거

### 4) 분석완료 단어(`provided` 등) 클릭 + 지우개 삭제 정상화
- `handleWordMouseDown`: 완료 owner(단일/구/절) 클릭 시 전체 범위 `selectedWordIndices` 복원
- 완료 owner 재선택 시 자동 finalize effect 재실행 차단 → selection 유지
- 완료 토큰의 `pointer-events-none` 등 클릭 차단 요소 제거
- `handleEraser`: 선택 인덱스를 덮는 모든 완료 owner를 일괄 수집 → `progressMap`, `completedSelectionMap`, `customAnswers`(절 range 포함) 정리

### 5) 다층 분석 색상 = 레이어별 컬러 스택
- 현재 보라 농도만 변하는 단일 톤 로직 제거
- depth별 다른 색의 반투명 배경:
  - 1층: 연보라 (violet)
  - 2층: 인디고 (indigo)
  - 3층: 연파랑 (sky)
  - 4층+: 순환
- 반투명 배경이 겹치면 자연스럽게 더 진해져 nesting 시각화
- 토큰 spacer도 동일 layer 색 inherit
- 절은 대괄호 + 회색 underline로 word/phrase layer와 분리

### 6) 절/구의 메인 SVOC 배지 분리 렌더링
- 절/구가 S/V/O/C로 분석되면 범위 하단에 **큰 메인 SVOC 배지** 표시
- `outerSubLabel`은 메인 배지와 합치지 않고 보조 라벨로 분리
- 예: Clause-as-Object → 노란 큰 `O` 배지

### 수정 예정 파일
- `src/pages/Index.tsx`
- `src/components/analyzer/AnalysisPanel.tsx`
- `src/index.css`
- 필요 시 `src/lib/labels.ts`, `src/components/analyzer/WordChip.tsx`

### 검증 기준
1. 분석 매뉴얼 헤더에 지우개/관용어구 버튼 없음
2. 하단 toolbar = `[지우개] [관용어구]`, 선택 해제 버튼 없음
3. **미분석 단어 클릭 시 지우개 비활성화**
4. 완료 단어(`provided` 등) 클릭 시 선택 유지 + 지우개 활성화 + 실제 삭제 가능
5. 단일/구/절 모두 지우개 삭제 가능
6. 다층 분석 시 1·2·3층이 서로 다른 색으로 쌓이고 겹침 영역이 더 진하게 보임
7. 절/구가 O이면 큰 노란 `O` 메인 배지 표시
8. 지우개 모드 아닐 때 클릭은 추가 분석 흐름 유지


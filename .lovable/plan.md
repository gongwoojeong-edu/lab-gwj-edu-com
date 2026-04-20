

## 작업 계획

### 1) 지우개 버튼 위치 정리
- `AnalysisPanel`(분석 매뉴얼) 헤더의 지우개 버튼 제거
- 하단 footer 영역에만 유지
- 활성화 규칙: 분석완료 토큰을 클릭하거나 선택 영역이 완료 owner를 덮을 때 항상 활성화

### 2) 관용어구 설정 버튼 하단 이동
- `AnalysisPanel` 안의 `IdiomSection` 트리거를 하단 toolbar로 이동 (지우개 옆)
- 클릭 시 popover/dialog로 관용어구 입력 UI 노출 (저장/삭제 동작 그대로)
- 활성화 규칙: 1개 이상 토큰 선택 시 활성화
- 결과: 분석 매뉴얼은 POS/요소/역할 선택에만 집중, 하단 toolbar = [지우개] [관용어구]

### 3) 불필요한 "선택 해제" 버튼 삭제
- 빈 곳/다른 단어 클릭으로 선택 해제가 자동 처리되므로 별도 버튼 제거
- 하단 toolbar 및 패널 내부 모두 정리

### 4) 지우개가 `provided` 같은 완료 분석을 못 지우는 문제 수정
- `handleEraser` 로직 변경: 현재 선택 인덱스를 덮는 **모든 완료 owner**(단일 토큰/구 span/절)를 수집해 일괄 삭제
- `progressMap`, `completedSelectionMap`, `customAnswers`(절 range 포함) 모두 정리

### 5) 다층 분석 색 구분 가독성 개선
- layer depth 기준 색상 체계
  - 절(최외곽): 대괄호 + 회색 underline 강화
  - 1층: 연보라 / 2층: 연남보라 / 3층: 연파랑 / 4층 이상: 순환
- 토큰 spacer 배경도 동일 depth 색을 따라가도록 맞춤
- SVOC 배지·부배지는 최우선 layer만 표시, 배경 대비 조정

### 6) 다층 owner 렌더링 기준 정리
- 인덱스별 owner 목록 전체를 depth 순으로 순회 → 배경 누적 표시
- 절 여부는 바깥 clause owner 기준 유지

### 수정 예정 파일
- `src/pages/Index.tsx`
- `src/components/analyzer/AnalysisPanel.tsx`
- 필요 시 `src/index.css` 소폭 조정

### 검증 기준
1. 분석 매뉴얼 헤더에 지우개/관용어구 버튼 없음
2. 하단 toolbar = [지우개] [관용어구], 선택해제 버튼 없음
3. `provided` 등 완료 토큰 클릭 → 지우개로 실제 삭제
4. 단일/구/절 모두 지우개로 삭제 가능
5. 절 + 동사층 + 병렬층 다층 시 각 layer 색이 명확히 구분
6. 지우개 모드 아닐 때 클릭은 추가 분석 흐름 유지


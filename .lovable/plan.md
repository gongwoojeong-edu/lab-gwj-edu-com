

## 현재 상태

코드 확인 결과 **이전 플랜은 아직 구현되지 않았습니다**:
- `eraserMode` state 없음
- `handleEraser`는 여전히 "선택된 인덱스 기반 일괄 삭제" 방식
- 하단 지우개 버튼은 `eraseEnabled`(선택 기반)로 활성/비활성 토글
- 완료 owner 클릭 = 지우개 대상 + 다층 분석 진입이 충돌하는 기존 구조 그대로

따라서 접속사절 내부 다층 분석이 여전히 충돌합니다. 아래 플랜으로 실제 구현하겠습니다.

## 구현 계획

### 1) `eraserMode` 토글 state 도입 (`src/pages/Index.tsx`)
- `const [eraserMode, setEraserMode] = useState(false)`
- ESC 키로 OFF (window keydown)
- 페이지 이동/문장 변경 시 자동 OFF

### 2) 하단 지우개 버튼 = 토글 스위치
- `disabled` 속성 제거 → 항상 클릭 가능
- ON 상태: `bg-destructive text-white` + 아이콘 강조
- OFF 상태: 기존 outline 톤
- `aria-pressed={eraserMode}`

### 3) `handleWordMouseDown` 분기 재설계
- **eraserMode ON + 완료 owner 클릭** → 해당 owner 즉시 삭제, selection은 비움
- **eraserMode ON + 미분석 토큰** → 무시
- **eraserMode OFF + Shift+클릭 + 완료 owner** → 즉시 삭제 (보조 단축키)
- **eraserMode OFF + 완료 owner 클릭** → 클릭한 토큰 1개만 selection으로 시작 (전체 owner indices 복원하지 않음) → 그 위에 새 layer 분석 진입
- **eraserMode OFF + 일반 클릭/드래그** → 기존 흐름 유지

### 4) 단일 owner 즉시 삭제 헬퍼
- `eraseOwner(ownerId, indices)` 추가: `progressMap`, `completedSelectionMap`, `customAnswers`에서 해당 owner만 정리
- 기존 선택 기반 `handleEraser`는 Shift/모드 클릭 경로에서 단일 owner 인자로 호출

### 5) 시각적 피드백
- eraserMode ON일 때 본문 영역에 `cursor-pointer` + 옅은 빨강 ring
- 상단에 작은 안내 배너: "지우개 모드 — 분석된 항목 클릭 시 삭제 (ESC 종료)"
- Shift+클릭 삭제 시 toast: "삭제됨"

### 6) 자동 finalize 가드 유지
- `finalizedOwnersRef`는 그대로 유지하되, 완료 owner 위에 새 selection이 들어오면 새 owner로 분리되도록 `buildOwnerId` 흐름 점검

## 수정 파일
- `src/pages/Index.tsx` (대부분)
- `src/components/analyzer/AnalysisPanel.tsx` (canErase prop은 유지하되 문구 정리만)

## 검증 기준
1. 기본 상태에서 `provided` 클릭 → 다층 분석 진입, 삭제 X
2. 접속사절 내부 토큰 클릭 → 절은 유지된 채 새 분석 가능
3. 지우개 모드 ON + 완료 owner 클릭 → 즉시 삭제
4. 지우개 모드 ON + 미분석 토큰 클릭 → 무반응
5. Shift+클릭으로도 삭제 가능
6. ESC로 모드 해제
7. 다층 색상 stacking 정상 동작


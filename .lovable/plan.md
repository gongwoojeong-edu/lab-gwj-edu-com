

## 책장 정답지 입력기 = 정답 입력기(구) 통합

### 문제 진단

- 책장 → 지문 편집(`PassageEditor`)의 **"분석 저장 (ready)"** 버튼은 `saveSentenceTokens`만 호출 → 이 함수는 sentence **tokens(단어 분할)** 만 DB에 쓰고, 실제 정답(품사·역할·요소)은 저장하지 않습니다.
- 정답은 `Index` 내부의 **정답 입력 모드 토글 + [정답 저장]** 흐름 (`upsertCustomAnswer` → `owner_progress` 테이블, admin uid)으로만 저장되는데, 이 툴바는 `embedMode={true}` 라 PassageEditor에서 **숨겨져** 있습니다.
- 결과: 사용자는 분석을 하지만 **저장 경로가 끊긴 상태** → 화면을 떠나면 사라지는 것처럼 보임.

### 해결 방향 — 정답 입력기(구) 자리에 분석기 그대로

`PassageEditor`를 단순 컨테이너로 만들고, **`Index` 컴포넌트의 admin 툴바를 임베드 모드에서도 노출** 하도록 변경. 별도의 "분석 저장" 버튼은 제거하고, **"교재 ready 표시"** 토글만 헤더에 남깁니다.

### 작업 내역

#### 1. `src/pages/Index.tsx`
- 새 prop `showStaffToolbar?: boolean` 추가 (기본 false). admin 권한 가진 사용자가 embedMode일 때 이 prop이 true면 하단 툴바를 노출.
- 툴바 렌더 조건을 `(!embedMode && isAdmin) || (embedMode && isAdmin && showStaffToolbar)` 로 변경.
- 툴바를 임베드용으로 노출할 때는 `fixed bottom-0 inset-x-0` → 컨테이너 내 `sticky bottom-0` 스타일 변형 (PassageEditor 카드 안에 안착하도록).
- 지우개/관용구 도구바도 `embedMode + showStaffToolbar`일 때 함께 표시.

#### 2. `src/pages/teacher/PassageEditor.tsx`
- 우측 상단 **"분석 저장 (ready)"** 버튼 제거. 대신 작은 토글 버튼 **"학생 공개 (ready ↔ draft)"** 만 남김 → 이 버튼은 `saveSentenceTokens(code, currentTokens, true|false)` 로 `analysis_status` 만 토글.
- `<Index embedMode embedSentenceId={passage.code} showStaffToolbar />` 로 호출.
- 카드 `max-h-[calc(100vh-220px)] overflow-auto` 유지 — 내부 sticky 툴바가 카드 하단에 고정되도록 컨테이너 구조 정리.
- 안내 문구 추가: "분석은 [정답 입력] 토글 켜고 단어 클릭 → [정답 저장] 으로 저장됩니다 (마스터키)."

#### 3. (선택) `src/lib/sentenceSource.ts`
- `saveSentenceTokens` 의 두 번째 인자 `tokens` 가 사실상 안 쓰이는 호출이 생기므로, `setPassageReady(code, ready: boolean)` 헬퍼를 추가하여 깔끔히 분리.

### 기대 동작

1. 책장 → 지문 → 편집 진입 → admin 툴바가 카드 하단에 표시됨.
2. **[정답 입력]** 토글 ON → 단어 선택 → 분석 입력 → **[정답 저장]** 클릭 → `owner_progress` 에 admin 데이터로 저장 (= 마스터키).
3. 모든 마스터 분석을 마치면 우측 상단 **[학생 공개]** 클릭 → `analysis_status='ready'` 로 변경 → 학생에게 노출.
4. 정답 초기화 / 지우개 / 관용구 / AI 단어 추출 / 힌트 토글 모두 동일하게 동작.

### 영향도

- DB 스키마 변경 없음.
- `Index`의 기존 (`/`, `/learn/sentence/...`) 경로 동작은 prop default가 false이므로 영향 없음.
- 학생 화면(`SentenceLearn`)은 `embedMode` 만 쓰고 `showStaffToolbar` 미지정 → 영향 없음.

### 비고

이번 턴은 "분석 저장 안 됨" 핵심 버그만 해결. Phase 2(레벨 DB) 및 Phase 3(다중 절 깊이 시각화)은 후속 턴.


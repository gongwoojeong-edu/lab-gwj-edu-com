
## 플랜 — 화면전환 없는 즉시 인쇄로 전환

가능합니다. 브라우저 인쇄창은 결국 “인쇄할 문서 컨텍스트”가 필요하지만, 그 문서를 **새 탭/새 화면**으로 띄울 필요는 없습니다.  
지금은 `window.open(...autoprint=1)` 방식이라 SPA 전체가 새 탭에서 로드되고, 그 뒤 데이터 fetch 후 `window.print()`가 실행되어 느리게 체감됩니다. 이를 **숨김 iframe 기반 즉시 인쇄**로 바꾸겠습니다.

### 1. 공통 인쇄 런처 추가
**신규 파일**: `src/lib/printLauncher.ts`

- 숨김 `<iframe>` 를 만들어 현재 화면 안에서 인쇄 전용 문서를 로드.
- URL 예시:
  - 구문 HO: `/teacher/handout/:code?student=...&autoprint=1&embed=1`
  - 단어 HO: `/teacher/handout/word/:code?student=...&scope=...&mode=...&autoprint=1&embed=1`
  - 분석 HO: `/teacher/handout/analysis/:sentenceId/:studentId?mode=...&autoprint=1&embed=1`
- 동작:
  1. iframe 생성
  2. 해당 인쇄 URL 로드
  3. iframe 내부 문서가 준비되면 `contentWindow.print()` 실행
  4. `afterprint` 또는 타임아웃 후 iframe 정리
- 중복 클릭 방지용 `jobKey` 지원
- 실패 시에만 fallback 으로 새 탭 미리보기 열기

### 2. 인쇄 페이지를 iframe/자동인쇄 친화적으로 정리
**파일**:
- `src/pages/Handout.tsx`
- `src/pages/HandoutWord.tsx`
- `src/pages/teacher/AnalysisHandout.tsx`

- `embed=1` 쿼리 지원:
  - 상단 툴바/배경/불필요 여백 최소화
  - 로드 직후 곧바로 인쇄 가능하도록 시각 요소 정리
- `autoprint=1` 처리 개선:
  - 단순 `setTimeout(..., 0)` 대신 “데이터 준비 완료 + 레이아웃 안정화” 시점에 인쇄
  - 필요 시 `requestAnimationFrame` 1~2회 후 `window.print()`
- `beforeprint/afterprint` 훅 정리:
  - 기존 처리 완료 마킹 로직 유지
  - iframe 인쇄에서도 동일하게 동작하도록 보장
- 인쇄 완료 후 embed 문서가 화면용 UI를 남기지 않도록 정리

### 3. 학습결과 화면의 직접 인쇄를 모두 iframe 방식으로 교체
**파일**: `src/pages/teacher/LearningResults.tsx`

- 현재 `window.open(...autoprint=1)` 사용 부분을 공통 런처로 교체:
  - 분석+해석 셀 옆 인쇄 버튼
  - 단어시험 셀 드롭다운 인쇄
- 유지:
  - 단어 조건 드롭다운(오답만/전체, 한글/스펠/혼합)
  - 인쇄 후 HO 입력 활성화 로직
  - 낙관적 printed 상태 표시
- 제거/수정:
  - 새 탭 전환 전제 문구
  - “탭 열림” 성격의 토스트를 “인쇄창 실행” 성격으로 변경

### 4. 요청확인/인쇄대기열도 화면전환 없이 즉시 인쇄
**파일**:
- `src/pages/teacher/RequestsInbox.tsx`
- `src/pages/teacher/PrintQueue.tsx`

- 구문 / 단어 / 전체 인쇄 모두 공통 런처 사용
- `all` 동작은
  - 구문 1건 + 단어 1건을 순차 실행
  - 동시에 여러 print 호출로 충돌하지 않게 큐 처리
- 기존 처리완료 마킹과 handout row 보장 로직은 유지
- 안내 문구를 “새 탭이 열립니다”에서 “현재 화면에서 바로 인쇄창이 뜹니다”로 변경

### 5. PDF 미리보기는 별도 경로로 유지
**대상 파일**:
- `src/pages/teacher/LearningResults.tsx`
- `src/pages/teacher/PrintQueue.tsx`
- 필요 시 관련 버튼이 있는 다른 화면

- 사용자가 말한 대로:
  - **직접 인쇄 버튼** = 화면전환 없이 즉시 인쇄
  - **미리보기/PDF 보기 버튼** = 기존처럼 새 탭/미리보기 진입
- 즉, “인쇄”와 “미리보기”를 동작상 명확히 분리

### 6. 분석 비교 화면의 인쇄도 동일 원칙 적용
**파일**: `src/pages/teacher/AnalysisCompare.tsx`

- 현재 상단의 핸드아웃(채점/blank) 관련 버튼은:
  - 직접 인쇄 버튼이면 iframe 즉시 인쇄로 변경
  - 미리보기 성격 버튼이면 라벨을 명확히 분리
- `window.print()` 로 현재 비교화면 전체를 찍는 버튼은 그대로 둘지,  
  아니면 “미리보기 상태에서 인쇄” 정책에 맞춰 보조 동작으로만 남길지 정리
  - 권장: “현재 화면 인쇄”는 유지하되 주 인쇄 버튼은 핸드아웃 직접 인쇄로 통일

### 7. 인쇄 큐/충돌 제어
**구현 포인트**: `src/lib/printLauncher.ts`

- 브라우저는 동시에 여러 `print()` 호출 시 무시/경합이 생길 수 있으므로
  - 간단한 Promise queue 적용
  - 한 번에 1건씩 순차 실행
- `전체 인쇄` 같은 다건 요청은 큐에 쌓아 차례대로 인쇄창 표시
- 진행 중 재클릭 시 무시 또는 “이미 인쇄 준비 중” 처리

### 8. 사용자 체감 속도 개선 포인트
- 새 탭 오픈 제거 → 화면전환 제거
- embed 모드에서 툴바/배경/여분 UI 비활성화 → 초기 렌더 축소
- 공통 런처에서 print-ready 시점 제어 → 빈 페이지/늦은 인쇄 방지
- 실패 시에만 미리보기 fallback → 평소에는 즉시 인쇄

## 변경 파일 요약
- 신규: `src/lib/printLauncher.ts`
- 수정:
  - `src/pages/Handout.tsx`
  - `src/pages/HandoutWord.tsx`
  - `src/pages/teacher/AnalysisHandout.tsx`
  - `src/pages/teacher/LearningResults.tsx`
  - `src/pages/teacher/RequestsInbox.tsx`
  - `src/pages/teacher/PrintQueue.tsx`
  - `src/pages/teacher/AnalysisCompare.tsx`

## 기대 결과
- 인쇄 버튼 클릭 시 **현재 화면 유지**
- 별도 탭/화면 이동 없이 **OS 인쇄창만 즉시 활성화**
- PDF/미리보기는 필요할 때만 별도 진입
- 단어 조건 드롭다운은 그대로 유지

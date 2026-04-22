
## 검토 결론

제미나이 조언은 **방향은 일부 맞지만, 현재 코드 기준으로는 그대로 적용하면 핵심 병목을 못 잡습니다.**

### 그대로 채택할 항목
1. **Data Pre-loading**
   - 맞습니다. 지금은 클릭 후 iframe 안에서 다시 fetch 하므로 느립니다.
   - 특히 `LearningResults`, `PrintQueue`, `RequestsInbox`, `AnalysisCompare`에서 **인쇄용 데이터 자체를 클릭 전에 준비**해야 합니다.

2. **Minimalist Print Window**
   - 맞습니다. 다만 `window.open()` 새 팝업보다는, 이미 도입한 **hidden iframe 재사용**을 유지하되
   - **URL 라우트 로드 방식**이 아니라 **부모에서 가벼운 HTML을 직접 주입(srcdoc / document.write)** 하는 쪽이 더 빠릅니다.
   - 이렇게 해야 React/Router/Auth/페이지 fetch를 다시 태우지 않습니다.

3. **Error Handling**
   - 꼭 필요합니다.
   - 지금은 `launchPrint()` 실패와 데이터 누락이 섞여 있고, 일부는 `[object Object]` 또는 모호한 토스트로 끝납니다.

### 제한적으로만 채택할 항목
4. **Base64 Image Conversion**
   - 현재 인쇄 경로의 핵심 문서(`PrintableHandout`, `PrintableWord`)에는 **외부 URL 이미지가 거의 없습니다.**
   - QR은 `QRCodeSVG` 인라인 SVG라서 **Base64 변환 이득이 거의 없고**, 오히려 Canvas 변환이 CPU를 더 씁니다.
   - 따라서 이 항목은 **“실제 외부 이미지가 있는 경우만 선택 적용”** 으로 두는 게 맞습니다.
   - 전역 기본 전략으로 쓰기엔 과합니다.

### 제미나이 조언이 놓친 실제 핵심 문제
1. **현재 `/print/*`도 여전히 React 앱 전체를 부팅**
   - `src/App.tsx`에서 `/print/handout`, `/print/word`, `/print/analysis`가 아직 `RequireAuth` 안에 있습니다.
   - 즉, hidden iframe이 떠도 실제로는 **전체 SPA + 인증 + 라우팅 + 각 페이지 fetch**를 다시 태웁니다.

2. **`PrintableAnalysis`가 여전히 `Index`를 임베드**
   - 이건 가장 무거운 경로입니다.
   - “경량 인쇄” 이름과 달리 실제로는 분석기 본체를 다시 마운트합니다.

3. **DB 에러 원인이 아직 남아 있음**
   - `handout_results`에 `sentence_id` 인덱스는 추가됐지만, 원래의 `UNIQUE (user_id, test_date)` 제약이 남아 있습니다.
   - 그래서 문장별 분리 저장을 해도 **같은 날 같은 학생의 다른 문장 저장 시 중복 오류**가 날 수 있습니다.
   - 게다가 `PrintQueue`, `RequestsInbox`는 아직 `ensureHandoutRow(..., testDate)` 호출 시 **`sentenceId`를 안 넘기고 있습니다.**

---

## 구현 플랜

### 1. URL 기반 iframe 인쇄를 버리고, “HTML 직주입” 방식으로 전환
**핵심 변경:** `src/lib/printLauncher.ts`

- `launchPrint(url)` 중심 구조를
  - `launchPrintHtml(html, options)`
  - `prewarmPrintDocument(key, html)`
  형태로 확장
- hidden iframe은 유지하되, `frame.src = "/print/..."` 대신
  - `iframe.contentDocument.open()`
  - 최소 HTML + 인라인 CSS 주입
  - `document.close()`
  - 문서 준비 완료 후 `contentWindow.print()`
- 이렇게 하면:
  - React 앱 재부팅 없음
  - Router/Auth 없음
  - 네트워크 재조회 최소화
  - 클릭 직후 거의 바로 print preview 진입

### 2. 인쇄용 데이터 사전 적재 계층 추가
**신규 유틸 제안:** `src/lib/printPreload.ts` 또는 유사 파일

- 문서 종류별로 인쇄 payload를 미리 준비:
  - **구문 HO**: 학생정보, 지문, 번역, 구조힌트
  - **단어 HO**: 학생정보, 오답단어/전체단어, 모드 정보
  - **분석 인쇄**: 학생정보, 비교 diff, 문장 텍스트/토큰
- `LearningResults.refresh()` 완료 시:
  - 현재 화면의 학생/문장 목록 기준으로 첫 배치 preload
- `PrintQueue`, `RequestsInbox`도 행 렌더 후 preload
- 클릭 시에는 “fetch 후 print”가 아니라 **준비된 payload → HTML 생성 → 즉시 print**

### 3. 인쇄 템플릿을 React 페이지가 아닌 “순수 HTML 템플릿”으로 분리
**신규 유틸 제안:** `src/lib/printTemplates.ts`

- `buildHandoutPrintHtml(payload)`
- `buildWordPrintHtml(payload)`
- `buildAnalysisPrintHtml(payload)`

원칙:
- 순수 HTML 문자열
- 인라인 CSS + `@media print`
- 불필요한 컴포넌트/아이콘/상태 없음
- 이미지가 있으면 `loading="eager"` 적용
- 가능하면 SVG/텍스트 중심

이렇게 하면 기존 `PrintableHandout.tsx`, `PrintableWord.tsx`, `PrintableAnalysis.tsx`는
- **미리보기/수동 디버그용**으로만 남기고
- **실제 즉시 인쇄 경로에서는 사용하지 않음**

### 4. `PrintableAnalysis`의 무거운 `Index` 임베드 제거
**가장 큰 속도 개선 포인트**

- 현재 `PrintableAnalysis`는 `Index`를 마운트해서 사실상 분석기 전체를 띄웁니다.
- 즉시 인쇄용은 다음처럼 단순화:
  - 상단: 학생/문장 정보
  - 중단: 비교 결과 요약(틀린 요소 목록, 강조 문장/구절)
  - 하단: 재분석용 줄칸
- 즉, **인쇄용 분석본은 정적 문서**로 재구성
- 인터랙티브 분석 화면이 필요한 경우만 기존 `/teacher/compare/...` 또는 미리보기 경로 사용

### 5. `handout_results` 저장 구조를 완전히 문장별로 정리
**DB + 호출부 동시 수정 필요**

#### DB 마이그레이션
- 기존 `UNIQUE (user_id, test_date)` 제거
- `(user_id, test_date, COALESCE(sentence_id, ''))` 유니크만 유지
- 필요 시 기존 제약/인덱스 이름 기준으로 안전하게 `DROP CONSTRAINT` / `DROP INDEX`

#### 호출부 수정
- `src/pages/teacher/PrintQueue.tsx`
  - `ensureHandoutRow(req.user_id, null, toIsoDate(new Date()))`
  - 를 `sentenceId` 포함 호출로 변경
- `src/pages/teacher/RequestsInbox.tsx`
  - 동일하게 `sentenceId` 전달
- `src/lib/handoutResults.ts`
  - `fetchHandoutResultsByDate`도 user 단독 key가 아니라
    `user_id::sentence_id` 기준으로 맞추거나 배열 반환으로 정리
- 목적:
  - 다른 문장 값이 같이 바뀌는 문제 방지
  - duplicate key 오류 제거
  - 인쇄 직후 점수 입력칸 활성화 로직 안정화

### 6. 에러를 “단계별”로 분리해서 사용자에게 보여주기
**파일:** `LearningResults.tsx`, `PrintQueue.tsx`, `RequestsInbox.tsx`, `AnalysisCompare.tsx`, `printLauncher.ts`

에러 분류:
- 학생 정보 없음
- 지문 데이터 없음
- 단어 목록 없음
- 분석 비교 데이터 없음
- 인쇄 문서 생성 실패
- 브라우저 인쇄창 호출 실패

토스트 예시:
- “학생 정보가 없어 인쇄를 준비하지 못했어요.”
- “지문 데이터를 아직 못 불러왔어요. 잠시 후 다시 시도해 주세요.”
- “이 브라우저가 인쇄창 호출을 막았어요. 미리보기로 열어주세요.”

### 7. Base64 이미지는 “선택 옵션”으로만 적용
- 현재 문서 기준 필수 아님
- 추후 외부 로고/사진/서명 이미지를 인쇄에 넣을 때만 적용
- 적용 위치:
  - preload 단계에서 1회 변환
  - 클릭 시 변환 금지
- QR은 인라인 SVG 유지

---

## 변경 대상 요약

### 수정
- `src/lib/printLauncher.ts`
- `src/lib/handoutResults.ts`
- `src/pages/teacher/LearningResults.tsx`
- `src/pages/teacher/PrintQueue.tsx`
- `src/pages/teacher/RequestsInbox.tsx`
- `src/pages/teacher/AnalysisCompare.tsx`
- `src/App.tsx` (print route 역할 축소 또는 preview 전용 정리)

### 신규
- `src/lib/printPreload.ts`
- `src/lib/printTemplates.ts`

### DB 마이그레이션
- `handout_results` 기존 `(user_id, test_date)` 유니크 제거
- 문장별 유니크만 유지

---

## 기대 결과

- 인쇄 버튼 클릭 시 **React 앱 재로딩 없이** 즉시 문서 주입
- **OS 인쇄창 / 미리보기 속도 대폭 개선**
- 현재처럼 “print route 들어가서 다시 fetch”하는 병목 제거
- `[object Object]` 같은 모호한 오류 대신 원인별 메시지 표시
- 같은 학생이 같은 날 여러 문장을 인쇄/채점해도 **서로 값이 섞이지 않음**
- 제미나이 조언은 **Data Pre-loading / Minimal HTML / Error Handling은 채택**,  
  **Base64 이미지는 실제 필요 시만 적용**하는 방향이 가장 적합

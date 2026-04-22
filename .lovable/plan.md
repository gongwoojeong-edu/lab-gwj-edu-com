

## 플랜 — 인쇄 즉시 활성화 + "[object Object]" 토스트 제거

### 진단

스크린샷 우측 하단의 **"인쇄 처리 일부 실패 [object Object]"** 토스트가 정확한 단서입니다.
1. `LearningResults.handlePrint` 의 `catch (e) { description: String(e) }` → Supabase 에러 객체는 `String(e)` 시 `[object Object]` 로 찍힘.
2. iframe 내부 핸드아웃 페이지가 **로드 도중 에러로 죽거나**, `__LOVABLE_PRINT_READY` 시그널을 못 보낸 채 멈춰 → 인쇄창은 떠도 **빈 페이지** 또는 **인쇄/미리보기 버튼이 무동작**.
3. iframe 내부에서 SPA 전체(라우터, 인증, RequireAuth 등)를 통째로 끌고 들어가기 때문에 폰트/QR/lazy 컴포넌트가 다 풀려야 print() 가 의미 있게 동작 → 체감상 매우 느리고, 일부 환경에선 빈 페이지로 나옴.

→ 사용자가 요청한 4가지 최적화 (pre-warm iframe / heavy lib 제거 / eager 이미지 / 컴포넌트 경량화) 전부 적용 + 토스트 메시지 정리.

---

### 1. 진짜 가벼운 "PrintableWorkbook" 라우트 신설

**신규 파일**: `src/pages/print/PrintableHandout.tsx`, `src/pages/print/PrintableWord.tsx`, `src/pages/print/PrintableAnalysis.tsx`

- 라우트 prefix: `/print/handout/...`, `/print/word/...`, `/print/analysis/...`
- 특징:
  - `RequireAuth` 미사용 — supabase anon key 로 직접 SELECT (RLS 허용 범위 안에서)
  - React Router/Provider 트리 최소화 (필요 시 별도 Router branch)
  - **애니메이션, lucide 아이콘, Button, Toolbar 등 인쇄와 무관한 UI 전부 제거**
  - `<img>` 없음 (있으면 `loading="eager"` + `decoding="sync"`)
  - QR 코드도 SSR-safe `qrcode.react` 만 사용 (이미 가벼움) → 유지
  - 순수 텍스트 + 표 + `@media print` 만으로 구성
  - html2pdf/jspdf 등 무거운 라이브러리 import 절대 없음 (현재도 없지만 정책 명문화)
- 기존 `Handout.tsx`, `HandoutWord.tsx`, `AnalysisHandout.tsx` 는 **교사 미리보기 전용**(/teacher/handout/...) 으로 남겨 호환 유지.

### 2. Pre-warmed Hidden Iframe 풀

**파일 수정**: `src/lib/printLauncher.ts`

- 모듈 레벨에 **항상 살아 있는 hidden iframe 1개**(off-screen) 를 lazy 생성해 풀로 보관.
- 첫 인쇄 클릭 전에 백그라운드로 미리 다음 URL 을 prefetch:
  - 가장 마지막에 학습결과를 본 학생의 첫 sentence 인쇄 URL (LearningResults 마운트 시 1건 워밍).
- 인쇄 클릭 시:
  1. 풀의 iframe 에 `src` 만 교체 (새 DOM/iframe 생성 안 함 → DNS/캐시 hit).
  2. iframe 내부가 `window.__LOVABLE_PRINT_READY = true` 를 세팅하면 **부모에서 즉시** `iframe.contentWindow.print()`.
  3. afterprint 후 iframe 은 **파기하지 않고 about:blank 로 비워 재사용**.
- 동시 print() 충돌 방지를 위한 직렬 큐는 유지.
- 다건(전체 인쇄) 은 풀 iframe 1개를 순차 재사용.

### 3. Print-ready 시그널 견고화

**파일**: 새 `PrintableHandout/Word/Analysis` 3종

- 데이터 fetch 완료 + 1 rAF + 폰트 ready (`document.fonts?.ready`) 후
  - `__LOVABLE_PRINT_READY = true`
- `autoprint=1` 인 경우(직접 새 탭으로 띄운 fallback) 에서만 자체 `window.print()` 호출
- iframe 내부 인쇄에서는 **자체 print() 호출 안 함**(부모만 호출, 이중 호출 방지)
- iframe 모드 식별: `embed=1` 쿼리 → 이때만 `__LOVABLE_PRINT_READY` 시그널 사용, autoprint 분기 비활성

### 4. 토스트 / 에러 처리 정리

**파일 수정**: `src/pages/teacher/LearningResults.tsx`, `RequestsInbox.tsx`, `PrintQueue.tsx`

- 모든 `String(e)` → 다음 helper 로 교체:
  ```ts
  const errMsg = (e: unknown) =>
    e instanceof Error ? e.message
    : typeof e === "string" ? e
    : (e as { message?: string })?.message ?? JSON.stringify(e);
  ```
- `print_requests` insert 실패는 **사용자 토스트로 띄우지 않음** (콘솔 경고만). 인쇄 자체는 성공이므로 사용자에게 실패처럼 보이면 안 됨.
- `ensureHandoutRow` 실패만 별도 케이스로 처리 — 토스트는 `description: errMsg(e)` 사용.
- 성공 토스트는 "인쇄창이 열립니다" → "인쇄 준비 완료 — 인쇄창이 떴어요" 로 정리.

### 5. 라우팅 등록

**파일 수정**: `src/App.tsx`

- 신규 print 라우트 추가:
  - `/print/handout/:passageCode`
  - `/print/word/:passageCode`
  - `/print/analysis/:sentenceId/:studentId`
- 모두 `RequireAuth` 바깥에 위치 (인쇄용은 supabase anon SELECT 로 동작).
- 단, 학생 식별 정보 등 민감 데이터는 anon SELECT 가능한지 RLS 확인 후 필요한 SELECT 정책만 보장.

### 6. 호출부 URL 교체

**파일 수정**:
- `src/pages/teacher/LearningResults.tsx`
- `src/pages/teacher/RequestsInbox.tsx`
- `src/pages/teacher/PrintQueue.tsx`
- `src/pages/teacher/AnalysisCompare.tsx`

- `launchPrint` 에 넘기는 URL 들을 `/teacher/handout/...` → `/print/handout/...` 등 신규 경량 라우트로 교체.
- 미리보기(PDF) 버튼은 기존 `/teacher/handout/...` 유지 (사용자 요청대로 드물게 사용).

### 7. 워밍 호출

**파일 수정**: `src/pages/teacher/LearningResults.tsx`

- 학생/문장 목록 로드 완료 시점에 첫 학생의 첫 sentence 로 `prewarmPrintIframe(url)` 호출.
- `printLauncher.ts` 에 `prewarmPrintIframe(url)` export 추가 — iframe 풀에 미리 src 만 로드 후 print 안 함.

---

### 변경 파일 요약
- 신규
  - `src/pages/print/PrintableHandout.tsx`
  - `src/pages/print/PrintableWord.tsx`
  - `src/pages/print/PrintableAnalysis.tsx`
- 수정
  - `src/lib/printLauncher.ts` (iframe 풀 + prewarm)
  - `src/App.tsx` (print 라우트 등록)
  - `src/pages/teacher/LearningResults.tsx` (URL 교체 + prewarm + 토스트 정리)
  - `src/pages/teacher/RequestsInbox.tsx` (URL 교체)
  - `src/pages/teacher/PrintQueue.tsx` (URL 교체)
  - `src/pages/teacher/AnalysisCompare.tsx` (URL 교체)

### 기대 결과
- 인쇄 버튼 클릭 → **현재 화면 유지 + OS 인쇄창 즉시 활성화 + 미리보기 정상 표시 + 인쇄 정상 동작**.
- "[object Object]" 토스트 사라짐. 실패 시 사람이 읽을 수 있는 메시지.
- pre-warm 덕분에 첫 인쇄도 체감상 즉각적.
- PDF 미리보기는 기존 `/teacher/handout/...` 경로로 별도 유지.


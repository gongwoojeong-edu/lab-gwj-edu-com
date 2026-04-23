

## 플랜 — 지문별 분석자료 PDF 업로드/열람/인쇄 워크플로

### 목표
선생님이 책장에서 지문에 **클로드 분석 PDF**를 업로드 → 학생이 **Hand out 학습 완료 후** 열람 가능 → 필요 시 **인쇄 요청** → 선생님 인박스에서 처리.

### 1. 백엔드 (Supabase)

**Storage 버킷 신설**
- `analysis-materials` 버킷 생성 (private)
- 경로 규칙: `{passage_id}/{timestamp}-{filename}.pdf`
- RLS:
  - SELECT: 인증된 사용자 전체 (학생 열람 허용 — 열람 조건은 앱에서 게이팅)
  - INSERT/UPDATE/DELETE: teacher/admin만

**`textbook_passages` 컬럼 추가**
- `analysis_pdf_url text` — 공개 경로(또는 storage 경로)
- `analysis_pdf_name text` — 원본 파일명
- `analysis_pdf_uploaded_at timestamptz`

**`print_requests` 컬럼 추가**
- `kind text default 'handout'` — `'handout' | 'analysis'`로 구분
- `file_url text` — 분석자료 인쇄 요청 시 PDF URL 저장

### 2. 선생님 화면 — 책장 유닛 페이지 (`BookshelfUnit.tsx`)

지문 테이블에 **「분석자료」 컬럼** 추가:
- 미업로드 → `[PDF 업로드]` 버튼 (파일 선택 → Storage 업로드 → 컬럼 갱신)
- 업로드 완료 → 파일명 + `[교체]` `[삭제]` 버튼
- 업로드 진행 중 로딩 스피너 표시

### 3. 학생 화면 — 학생 홈 (`StudentHome.tsx`)

`recent` 학습 카드에서 **Hand out 학습 완료**(`handout_results`에 해당 sentence 결과가 존재)인 지문에 한해:
- 분석 PDF가 업로드되어 있으면 `[분석자료 보기]` 버튼 노출
  - 클릭 시 새 탭에서 PDF 열기 + 열람 로그 기록(선택)
- `[인쇄 요청]` 버튼 → `print_requests`에 `kind='analysis'`, `file_url=<pdf_url>`로 insert

**게이팅 조건 함수** (`src/lib/handoutResults.ts` 활용):
```text
canViewAnalysis = handoutResult exists AND passage.analysis_pdf_url != null
```

### 4. 선생님 인박스 (`RequestsInbox.tsx`)

기존 `print` 항목을 `kind`별로 뱃지 구분:
- `handout` → 기존 시험지 인쇄 흐름 유지
- `analysis` → "분석자료" 뱃지 + `[PDF 열기]` 버튼(새 탭) + `[인쇄 완료] ` 버튼
  - 인쇄 완료 시 `markPrintRequestHandled` 재사용

### 5. 라이브러리 갱신

**`src/lib/printRequests.ts`**
- `createPrintRequest`에 `kind`, `file_url` 옵션 추가
- 학생용 `createAnalysisPrintRequest(sentenceId, fileUrl)` 헬퍼 신설

**`src/lib/textbooks.ts`**
- `uploadAnalysisPdf(passageId, file)` — Storage 업로드 + 컬럼 갱신
- `deleteAnalysisPdf(passageId)` — 파일 삭제 + 컬럼 클리어

### 6. 검증 케이스
1. 선생님: 지문에 PDF 업로드 → 파일명 표시, 교체/삭제 동작
2. 학생: Hand out 미완료 상태 → 버튼 미노출
3. 학생: Hand out 완료 + PDF 있음 → 「분석자료 보기」/「인쇄 요청」 노출
4. 선생님 인박스: 분석 인쇄 요청이 별도 뱃지로 표시되고 PDF 미리보기 가능
5. PDF 미업로드 지문: 학생 화면에 "선생님이 자료를 준비 중입니다" 표시

### 변경/생성 파일
- 마이그레이션: storage 버킷 + `textbook_passages`/`print_requests` 컬럼 추가
- 수정: `src/lib/printRequests.ts`, `src/lib/textbooks.ts`
- 수정: `src/pages/teacher/BookshelfUnit.tsx` (업로드 UI)
- 수정: `src/pages/StudentHome.tsx` (열람/인쇄 요청 버튼)
- 수정: `src/pages/teacher/RequestsInbox.tsx` (kind 분기)

### 기대 결과
선생님은 클로드에서 만든 분석 PDF를 **지문 단위로 한 번 업로드**해 두면, 학생은 Hand out 학습이 끝나는 즉시 열람·인쇄 요청을 할 수 있다. 인쇄 요청은 기존 인박스 흐름에 통합되어 추가 학습 곡선 없이 처리된다.


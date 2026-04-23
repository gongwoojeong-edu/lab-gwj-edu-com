

## 플랜 — 클로드 지문분석기 → 학생 학습기 직접 전송 연동

클로드 앱에서 만든 자료(지문 + 분석교안 + 구조도)를 PDF로 출력해 업로드하는 대신, **클릭 한 번으로 이 앱의 Bookshelf에 Passage로 등록**하고, 학생이 즉시 구문분석 학습기에서 학습할 수 있게 합니다.

### 1. 데이터 흐름

```text
[클로드 지문분석기]                    [이 앱 — Lovable Cloud]
 library record                         textbook_passages
  ├ textbook                ──┐          ├ code (자동 생성)
  ├ lesson                   │          ├ english   ← passage
  ├ item_code                │          ├ korean    ← topic_ko/title_ko
  ├ title_ko                 ├──POST──▶ ├ tokens    ← (없음, 학생이 분석)
  ├ expected_title           │          └ unit_id   ← 매칭된 Unit
  ├ topic_ko / topic_en      │
  ├ passage (영문 본문)       │         textbook_units (옵션)
  ├ structure_steps         ──┤──PUT──▶  └ structure_pdf_url ← 구조도 HTML→PDF 자동저장
  └ analysis(교안 본문) ────────┴──PUT──▶  └ analysis_pdf_url  ← 분석교안 HTML→PDF 자동저장
```

### 2. 새 Edge Function: `import-claude-handout`

POST 요청을 받아 인증된 교사/관리자만 처리:

| 입력 필드 | 처리 |
|---|---|
| `textbook`, `lesson`, `item_code` | 기존 Series/Textbook/Unit과 자동 매칭. 없으면 자동 생성(설정 가능) |
| `passage` (영문) | `textbook_passages.english`에 저장. `code`는 `{textbook}-{lesson}-{item_code}` 규칙으로 생성 |
| `topic_ko`, `title_ko` | `korean` 컬럼 |
| `analysis_html`, `structure_html` (선택) | Storage `analysis-materials` 버킷에 업로드 후 Unit의 `analysis_pdf_url` / `structure_pdf_url`에 연결 |
| 응답 | 생성된 `passage_id`, `code`, 학생이 바로 진입할 수 있는 `learn_url` |

검증: Zod로 입력 스키마 검사, JWT 검증, 교사/관리자 role 확인.

### 3. 클로드 분석기에 추가할 "전송" 버튼 (사용자가 이식)

`buildStandaloneHtml` 옆에 새 함수 `sendToLearner(id)`를 추가:

```js
async function sendToLearner(id) {
  const rec = library.find(r => r.id === id);
  const url = "https://lab.gwj-edu.com/api/import-claude-handout";  // 실제는 Edge Function URL
  const apiKey = localStorage.getItem("GWJ_IMPORT_KEY");           // 교사 발급 1회 토큰
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      textbook: rec.data.textbook, lesson: rec.data.lesson, item_code: rec.data.item_code,
      title_ko: rec.data.title_ko, expected_title: rec.data.expected_title,
      topic_ko: rec.data.topic_ko, topic_en: rec.data.topic_en,
      passage: rec.data.passage,
      analysis_html: renderAnalysisToString(rec.data),
      structure_html: renderStructureToString(rec.data),
    }),
  });
  const j = await res.json();
  if (j.ok) showToast(`📚 학습기 전송 완료: ${j.code}`, 'success');
}
```

라이브러리 카드의 footer에 `📚 학습기로 전송` 버튼만 한 줄 추가하면 됩니다. 코드 스니펫은 작업 후 최종본으로 제공.

### 4. 인증 — "1회용 Import Token"

Edge Function이 외부(Claude 앱)에서 호출되므로 안전한 토큰 인증 필요:

- 새 테이블 `import_tokens(id, teacher_id, token_hash, label, created_at, last_used_at, revoked)`
- 교사 화면(`/teacher/integrations`)에서 토큰 발급/회수
- 발급 시 1회만 평문 노출 → 교사가 클로드 앱 콘솔에 `localStorage.setItem("GWJ_IMPORT_KEY", "...")` 로 저장
- Edge Function은 토큰 해시로 교사 식별 후 그 교사의 권한으로 DB 작성

### 5. 교사 UI 추가

| 위치 | 변경 |
|---|---|
| `src/pages/teacher/Integrations.tsx` (신규) | Import Token 발급/관리 + 클로드 앱에 붙여넣을 스니펫 표시 |
| `src/components/teacher/TeacherLayout.tsx` | 사이드바 "외부 연동" 메뉴 추가 |
| `src/App.tsx` | `/teacher/integrations` 라우트 추가 |
| `src/pages/teacher/BookshelfUnit.tsx` | Passage 행에 "클로드에서 자동 등록됨" 뱃지 (소스 표시) |

### 6. 변경/생성 파일 요약

| 구분 | 파일 |
|---|---|
| 신규 마이그레이션 | `import_tokens` 테이블 + RLS (교사 본인만 SELECT/INSERT/UPDATE, 토큰 해시 저장) |
| 신규 Edge Function | `supabase/functions/import-claude-handout/index.ts` (verify_jwt = false, 토큰으로 자체 인증) |
| 신규 페이지 | `src/pages/teacher/Integrations.tsx` |
| 수정 | `src/components/teacher/TeacherLayout.tsx`, `src/App.tsx`, `src/pages/teacher/BookshelfUnit.tsx` |
| 사용자 수동 작업 | 클로드 HTML 앱에 `sendToLearner()` 함수 + 버튼 1개 추가 (스니펫 제공) |

### 7. 기대 결과

- 클로드 앱에서 "📚 학습기로 전송" 클릭 → 1초 내에 이 앱의 Bookshelf에 Passage 자동 등록
- 분석교안/구조도 PDF도 동시에 해당 Unit에 첨부됨
- 학생은 별도 작업 없이 바로 학습 시작 (`/learn/sentence/{passage_code}`)
- 교사는 PDF 다운로드 → 업로드 왕복 작업 불필요

### 8. 다음 단계 (승인 후)

1. DB 마이그레이션 + Edge Function 배포
2. 교사 Integrations 페이지 구현
3. 사용자에게 클로드 앱에 붙여넣을 최종 JS 스니펫 + 토큰 설정 가이드 제공


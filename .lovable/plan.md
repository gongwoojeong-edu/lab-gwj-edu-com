

## 자동 단어 추출 + PRE 데이터 소스 전환

선생님이 문장 하나만 등록하면 AI가 핵심 단어를 자동 추출하고, 그 결과가 모든 학생의 PRE 단어 학습 목록으로 즉시 흘러 들어가게 합니다. 음절 분리는 이미 만들어둔 유틸이 자동 적용됩니다.

### 1. 새 테이블: `sentence_word_extractions`

문장 단위로 한 번만 추출하고 모든 학생이 공유.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `sentence_id` | text PK | 문장 ID |
| `english` | text | 추출에 사용된 원문(스냅샷) |
| `words` | jsonb | `[{ word, meaning, pos }]` 배열 |
| `model` | text | 사용된 AI 모델명 |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

- RLS: 모든 인증 사용자 SELECT 허용, INSERT/UPDATE는 teacher/admin만.
- 선생님이 같은 문장을 다시 등록하면 upsert로 갱신.

### 2. 새 Edge Function: `extract-sentence-words`

- 입력: `{ sentenceId, english }`.
- 권한: teacher/admin만 호출 가능 (JWT 검증 + `has_role` 확인). 학생이 호출하면 거부.
- Lovable AI Gateway (`google/gemini-3-flash-preview`) 호출, **tool calling**으로 구조화된 결과 강제:
  ```
  { words: [{ word: string, meaning: string (한국어), pos: "명사|동사|형용사|부사" }] }
  ```
- 시스템 프롬프트: 핵심 학습 단어만 5~10개 선별, 관사/대명사/be동사 제외, 원형 또는 표면형 유지, 한국어 뜻은 짧게.
- 결과를 `sentence_word_extractions`에 upsert.
- 429/402 에러는 그대로 클라이언트로 반환.

### 3. 선생님 화면: 자동 추출 트리거

`src/pages/Index.tsx`의 분석기 화면에 “**AI 단어 추출**” 버튼 추가 (헤더 또는 사이드 패널).
- 클릭 시 현재 문장 ID + 영문으로 edge function 호출 → 토스트로 추출된 단어 N개 표시.
- 또한 신규 문장(`user_sentences`)이 저장될 때 자동으로 1회 호출 (백그라운드, 실패해도 무시).

### 4. 학생 PRE 데이터 소스 우선순위 변경

`src/pages/SentenceLearn.tsx`에서 `entries`를 만드는 로직을 새 헬퍼 `resolveWordEntries(sentenceId, english)`로 교체:

```text
1순위) sentence_word_extractions 캐시 → words → WordTestEntry 변환
2순위) 캐시 없으면 학생 본인이 직접 호출할 수 없으므로,
       teacher/admin owner_progress를 fetch (staff 캐시) → buildWordTest
3순위) 그래도 비면 본인 owner_progress (현재 동작) — 안전망
```

학생 화면이 비어 있는 상황(=캐시 미존재)이라면 안내 카드를 띄움: “선생님이 아직 단어 추출을 하지 않았어요.” + 자동으로 백오프 재조회 1회.

### 5. 음절 분리 자동화 확인

`WordPreStep`은 이미 `splitIntoSyllables(current.word)`로 음절 버튼을 자동 생성합니다. 새 데이터 소스에서 받은 `word` 문자열도 동일하게 들어가므로 추가 작업 불필요. 다만 추출된 단어가 다음절·하이픈 포함일 수 있어, 기존 유틸이 처리 못 하는 경우(예: `well-known`)는 하이픈 단위로 한 번 더 분할하도록 보강.

### 6. WordTestEntry 매핑

추출 결과 → `WordTestEntry`:
```text
{ ownerId: `extract:${index}`, word, expected: meaning }
```
`ownerId`는 추출 캐시일 때 `extract:` 접두사를 붙여 staff/own 데이터와 충돌 방지.

### 7. 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `supabase/migrations/...` | `sentence_word_extractions` 테이블 + RLS |
| `supabase/functions/extract-sentence-words/index.ts` | 신규 (Lovable AI tool calling) |
| `supabase/config.toml` | 함수 등록 (`verify_jwt = true`) |
| `src/lib/wordExtraction.ts` | 신규: fetch/upsert + edge function 호출 + entries 변환 |
| `src/lib/syllables.ts` | 하이픈/어퍼스트로피 1차 분할 보강 |
| `src/pages/SentenceLearn.tsx` | `resolveWordEntries` 우선순위 적용 + 빈 상태 안내 |
| `src/pages/Index.tsx` | 헤더에 “AI 단어 추출” 버튼 + 신규 문장 저장 시 자동 호출 |

### 동작 흐름 요약

```text
[선생님] 문장 등록 / "AI 단어 추출" 클릭
     │
     ▼
edge function (Lovable AI) → sentence_word_extractions 저장
     │
     ▼
[학생] /learn/sentence/:id 진입
     │
     ▼
SentenceLearn → fetchExtraction() → entries
     │
     ▼
WordPreStep → splitIntoSyllables() → 듣기 버튼 자동 생성
```

### 사전 확인

- Lovable AI는 LOVABLE_API_KEY가 이미 설정되어 있어 추가 시크릿 불필요.
- teacher/admin 역할은 사용자가 직접 추가 예정 — 비어 있어도 함수 자체는 동작하지만 권한 체크에서 막힘. 권한 체크는 “role이 teacher/admin이거나, role 테이블이 비어있으면 첫 사용자에게 허용”은 하지 않고 **엄격히 staff만** 허용 (보안 우선).


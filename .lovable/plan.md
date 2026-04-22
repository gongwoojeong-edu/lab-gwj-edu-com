

## 플랜 — 새 지문 본문이 분석 입력기에 표시되지 않는 문제 해결

### 원인
- 책장에서 `bulkInsertPassages`로 추가된 지문은 `tokens = null`로 저장됨
- `Index.tsx`(분석 입력기)는 `sentence.tokens` 배열을 단어 단위로 렌더링하므로, 토큰이 없으면 **본문이 한 글자도 보이지 않음**
- 헤더 미리보기에는 `english` 원문이 그대로 노출되니 사용자가 더 혼란

### 해결 방향 — 토큰 자동 생성
영문이 있으면 자동으로 단어 토큰을 만들어 즉시 클릭/분석 가능하게 한다.

#### 1. 토크나이저 헬퍼 신설
**파일:** `src/lib/sentenceSource.ts` 내부에 `buildTokensFromEnglish(english: string): SentenceToken[]` 추가
- 단어/구두점/공백을 분리해 `SentenceToken` 형태로 변환
  - 단어 → `{ kind: "word", text }` (analyzer가 클릭 대상으로 인식)
  - 구두점(`,.!?;:`) → `{ kind: "punct", text }`
  - 줄바꿈/공백은 분리 토큰으로 안정 처리
- 기존 정적 SENTENCES의 `W()` / `P()` 헬퍼와 동일한 형태로 출력 (호환성 보장)

`src/data/sentences.ts`의 `W`, `P` 등 헬퍼와 `SentenceToken` 타입 구조를 먼저 확인 후, 동일 시그니처로 생성

#### 2. 머지 시 토큰 자동 채움
**파일:** `src/lib/sentenceSource.ts` `hydrateSentencesFromDb`
- DB row의 `tokens`가 비어있고 `english`가 있으면, **메모리상에서 자동 토큰화**해서 `Sentence.tokens`에 넣음
- DB는 그대로 두고 런타임에서만 채움 (정답 저장 시 `saveSentenceTokens`로 자연스럽게 DB 반영)
- `loadSentenceByCode`에도 동일 처리

#### 3. PassageEditor 헤더 문구 보강
**파일:** `src/pages/teacher/PassageEditor.tsx`
- 안내 문구를 "본문은 자동으로 분리되어 표시됩니다. 단어를 클릭해 정답을 입력하세요."로 명료화
- "AI 단어 추출"은 선택 단계임을 표시 (필수 아님)

#### 4. 검증 케이스
- 새로 만든 `L08-U2603-001`처럼 `tokens=null`인 지문도 정답 입력기 캔버스에 본문이 즉시 표시되어야 함
- 정답 입력 토글 후 단어 클릭 → 기존 흐름 그대로 동작
- 정답 저장 시 `saveSentenceTokens`로 토큰이 DB에 정착

### 변경 파일
- 수정: `src/lib/sentenceSource.ts` (토크나이저 + hydrate 보강)
- 수정: `src/pages/teacher/PassageEditor.tsx` (안내 문구)

### 기대 결과
- 새 책/지문도 추가 직후 본문이 분석 입력기에 그대로 표시됨
- "AI 단어 추출"을 누르지 않아도 즉시 정답 입력 가능
- 기존 정적 SENTENCES와 100% 동일한 토큰 구조라 분석 로직 영향 없음


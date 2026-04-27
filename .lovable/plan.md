## 무엇이 잘못됐나 (한 줄 요약)

본문(`textbook_passages.english`)을 수정했지만, **이전 영문 기준으로 만들어진 부속 데이터**가 그대로 남아있어 분석학습 화면에서 옛 본문이 보입니다.

## 원인 — 데이터 확인 결과

DB 직접 조회로 확인한 사실:

| 위치 | `L04-S1V1U1-002`의 영문 |
|---|---|
| `textbook_passages.english` (본문 원본) | `Lucy: Wow! Is this for me? What's this?` ✅ 올바름 |
| `sentence_word_extractions.english` (AI 단어추출 캐시) | `Today, he brought a new device for Lucy.` ❌ 옛 본문 |

→ 처음에 002로 잘못 분리됐던 영문(`Today, he brought…` = 사실 001의 두 번째 절)으로 **AI 단어추출이 한 번 실행되면서 캐시**가 만들어졌고, 이후 본문을 올바르게 다시 수정해도 이 캐시는 자동 정리되지 않아 분석학습에서 옛 단어/영문이 그대로 노출되고 있습니다.

추가로, 본문이 바뀌면 다음 캐시들도 모두 옛 영문 기준으로 남아 같은 종류의 어긋남을 일으킬 수 있습니다:
- `textbook_passages.tokens` (자동 토큰 캐시)
- `sentence_word_extractions` (AI 단어 추출 캐시)
- `sentence_translations` / `sentence_analyses` 등 학생/선생 작업물 (영문 변경 시 의미가 달라짐)

## 해결 계획

### 1) 즉시 데이터 정리 (이번 002 사례 + 같은 증상 가진 다른 지문)
- `sentence_word_extractions` 행들 중 짝이 되는 `textbook_passages.english`와 **영문이 일치하지 않는 행을 찾아 삭제** (한 번의 마이그레이션 SQL).
- 마찬가지로 `textbook_passages.tokens` 컬럼도 본문이 그 후 수정된 흔적이 있으면 NULL로 비워 자동 토큰화로 재생성되도록 함.

### 2) 본문 수정 시 자동 캐시 무효화 (재발 방지 — 핵심)
`updatePassage()` (textbooks.ts) 호출 시 `english`가 바뀌면 같은 트랜잭션 흐름에서 자동으로:
- `textbook_passages.tokens` → `null`로 리셋
- `sentence_word_extractions` 해당 sentence_id 행 **삭제**
- (옵션) 학생 진행 데이터(translation/analysis)는 **삭제하지 않음** — 다만 본문 편집 화면에 "본문이 바뀌면 학생들의 기존 분석 결과는 새 본문과 어긋날 수 있어요" 경고 토스트 표시.

### 3) PassageEditor에서 본문 수정 UI 보강
- 본문이 수정되면 자동으로 SENTENCES 메모리 캐시 강제 재 hydrate (이미 일부 있으나 보강).
- "본문이 바뀌었습니다 — AI 단어추출 캐시를 정리했어요" 토스트로 사용자에게 명시.

### 4) 선생님용 안전장치 — 한 번 누르면 정리되는 버튼 (보너스)
PassageEditor 우상단에 "이 지문 캐시 초기화" 버튼:
- `tokens` 비우기 + `sentence_word_extractions` 삭제
- 어쩌다 과거 잘못 캐시된 지문도 손쉽게 복구 가능.

## 작업 범위 (파일)

- `src/lib/textbooks.ts` — `updatePassage()`에서 english 변경 감지 시 캐시 무효화 로직 추가
- `src/lib/wordExtraction.ts` — `clearExtraction(sentenceId)` 헬퍼 (이미 deleteExtraction 있음, 재사용)
- `src/pages/teacher/PassageEditor.tsx` — 캐시 초기화 버튼 + 사용자 안내 토스트
- 마이그레이션 1건 — 현재 어긋난 `sentence_word_extractions` 정리

## 기대 결과

- 002 진입 시 분석학습 본문이 `Lucy: Wow! Is this for me? What's this?`로 올바르게 표시
- 앞으로 본문을 수정하면 옛 캐시가 자동 정리되어 같은 문제 재발 안 함
- 선생님이 직접 "이 지문 캐시 초기화" 한 번으로 복구 가능

# 문장암기 · 단락흐름암기 기획안

> **제품**: 공우정 구문랩 (lab.gwj-edu.com)  
> **작성**: Cursor 기획 → 이 repo 구현 → Lovable Publish/SQL  
> **상태**: v0.3 (2026-06) — task_mode 3종·유닛/지문별 테스크 부여

---

## 1. 한 줄 요약

**영문만 넣으면** 암기 콘텐츠가 자동 구성되고 **한글은 인라인 편집**.  
선생님이 지문·유닛마다 **「분석만 / 암기만 / 분석+암기」** 를 자유롭게 지정하고, **특별과제**로 학생·유닛·문장 단위 테스크를 부여한다. **모든 옵션은 선생님 전용.**

---

## 2. 왜 구문랩인가

| 이미 있는 것 | 문장암기에 쓰는 방식 |
|-------------|---------------------|
| `textbook_passages` (지문·영문·한글) | 영문만 넣으면 **자동구성**, 한글 **인라인 편집** |
| `SentenceLearn` 4단계 + 선생님 승인 | `analysis_only` · `analysis_and_memorize` |
| `assignments` (특별과제) | **유닛·지문** 단위 `task_mode` 부여 확장 |
| `student_passage_overrides` | 지문별 `task_mode` override |

Orbit(잉글앱)은 **과제 부여·알림·통계 집계**만 (후순위). 실행 UI는 전부 구문랩.

---

## 3. 테스크 모드 — 분석만 / 암기만 / 분석+암기

### 3.1 세 가지 모드 (`task_mode`)

| UI 라벨 | DB 값 | 학생이 하는 일 | 완료 조건 |
|---------|-------|---------------|----------|
| **분석만** | `analysis_only` | 단어→테스트→구문→해석→승인 | `sentence_progress.status = pass` |
| **암기만** | `memorize_only` | 문장암기 (A~E) | `mem_passed_at` |
| **분석+암기** | `analysis_and_memorize` | 분석 pass **후** 문장암기 | pass **and** `mem_passed_at` |

```
[analysis_only]       1~4단계 → 승인 → 끝
[memorize_only]       5.문장암기 → (6.단락흐름)
[analysis_and_memorize]  1~4 → 승인 → 5.문장암기 → (6.단락흐름)
```

### 3.2 학생 홈 — 지문별 버튼

| task_mode | 노출 | 배지 |
|-----------|------|------|
| `analysis_only` | **구문 학습** 만 | `분석` |
| `memorize_only` | **문장암기** 만 | `암기` |
| `analysis_and_memorize` | 구문 → pass 후 **문장암기** | `분석+암기` |

### 3.3 테스크 지정 — 4계층 (선생님 전용, 유닛·지문 자유)

```
④ 특별과제 (assignments)        ← 최우선 (기한·대상)
③ 학생×지문 override
② 지문 passage.task_mode        ← null → ①
① 유닛 default_task_mode
```

| 계층 | 범위 | 예 |
|------|------|-----|
| **① 유닛** | 유닛 전체 기본 | 「2603모고」= `analysis_and_memorize` |
| **② 지문** | 문장 1줄 | 5번만 `memorize_only` |
| **③ 학생 override** | 학생×지문 | A학생 3번만 `analysis_only` |
| **④ 특별과제** | **유닛 전체** 또는 **문장 1개** | 금요일까지 유닛 암기만 |

#### 유닛·지문 mix 예시

```
유닛 default = analysis_and_memorize
  지문 1~4: 유닛 따름
  지문 5:   analysis_only   ← 분석만
  지문 6:   memorize_only   ← 암기만

과제: gwj0123 / 유닛 전체 / memorize_only / 금요일  ← ④가 ①②보다 우선
```

### 3.4 특별과제 확장 (`assignments`)

```sql
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS
  unit_id uuid REFERENCES textbook_units(id),
  task_mode text CHECK (task_mode IN (
    'analysis_only', 'memorize_only', 'analysis_and_memorize'
  ));
-- sentence_id: 1문장 과제 | unit_id: 유닛 전체 | 둘 다 있으면 sentence 우선
```

기존 `include_pre`, `include_analysis` … 는 **`analysis_only` / `analysis_and_memorize`의 세부 스킵**용으로 유지.

### 3.5 `resolveTaskMode()` (런타임)

`src/lib/taskMode.ts` — ④→③→②→①→`analysis_and_memorize` 순 resolve.

### 3.6 공개(ready)

| task_mode | `analysis_status` | `mem_status` |
|-----------|-------------------|--------------|
| `analysis_only` | ready | — |
| `memorize_only` | — | ready + korean |
| `analysis_and_memorize` | ready | ready |

### 3.7 선생님 UI

```
[유닛]  테스크: ( )분석만 ( )암기만 (•)분석+암기
[지문表]  # | 영문 | 한글 | 테스크▼ | 구문공개 | 암기공개
[특별과제]  범위: ( )1문장 (•)유닛전체  테스크: [암기만▼]  마감: …
```

### 3.8 확정 원칙

- **분석만 / 암기만 / 분석+암기** 3종 — 유닛·지문·과제 **자유 조합**
- **모든 옵션 선생님 지정** — 학생 선택 UI 없음
- 지문表 **테스크 컬럼은 기본 노출** (mix가 일반적)

---

## 4. 콘텐츠 자동구성 · 한글 인라인 편집

**원칙**: 선생님은 **영어 원문만** 넣는다. 나머지는 시스템이 채우고, **한글만** 목록에서 바로 고친다.

### 4.1 등록 UX (책장 유닛)

기존 **본문 삽입** 흐름 확장 (`BookshelfVolume` bulk import 재사용).

```
1. 영문 붙여넣기 (단일 / 벌크 / sentence split)
2. [자동 구성] 클릭
3. 지문 목록: 영문 | 한글(편집) | **테스크** | 구문공개 | 암기공개
4. 한글 셀 클릭 → 수정 → 저장 (PassageEditor 불필요)
5. [암기 공개] → mem_status=ready
```

### 4.2 영문 입력 시 자동 생성

| 항목 | 생성 방식 | 저장 |
|------|----------|------|
| 코드·번호 | `bulkInsertPassages` | `textbook_passages` |
| 영문 정규화 | `stripKoreanFromEnglishSource` | `english` |
| **한글 초안** | AI EF `compose-memorization-passage` | `korean` |
| 암기 토큰 | `buildTokensFromEnglish` | `mem_tokens` jsonb |
| 한글 어구 | 초안을 절·쉼표 기준 split | `mem_korean_chunks` jsonb |
| 빈칸 후보 | content word 20~40% | `mem_cloze_spec` jsonb |
| 오디오 (P1) | TTS 큐 | `passage_audio` |

**구문 정답과 분리**: `memorize_only`는 `tokens.answer`(구문 정답) **불필요**.  
나중에 `analysis_only` → `analysis_and_memorize`로 바꿀 때 PassageEditor에서 정답 입력.

### 4.3 한글 인라인 편집

| 위치 | 동작 |
|------|------|
| 책장 유닛 지문表 | 한글 셀 클릭 → textarea → `updatePassageKorean` |
| 암기 미리보기 | 한글만 연필 아이콘 |
| 일괄 재번역 | 선택 N건 → AI → 덮어쓰기 전 diff |

**암기 공개 조건 (P0)**: `english` + `korean` not null → `mem_status=ready` 가능.

### 4.4 자동구성 EF

`compose-memorization-passage` — Input: `passage_id` / Output: korean + mem_* jsonb.  
EF 없을 때: 토큰·빈칸은 로컬 heuristic, **한글은 선생님 인라인 필수**.

### 4.5 트랙별 UI

| UI | `analysis_only` | `memorize_only` | `analysis_and_memorize` |
|----|-----------------|-----------------|-------------------------|
| PassageEditor | ✅ | 숨김 | ✅ |
| `analysis_status` | ✅ | — | ✅ |
| `mem_status` | — | ✅ | ✅ |
| 한글 인라인 | ✅ | ✅ | ✅ |
| 자동 구성 | 선택 | ✅ | ✅ |

---

## 5. 문장암기 (한 문장) — 방향 선택 + 5개 미니게임

### 5.0 학습 방향 (한↔영) — 선택 옵션

문장암기 전체에 걸쳐 **「무엇을 보고 무엇을 맞히는가」**를 정하는 축이다.

| 값 | 라벨 (UI) | 의미 | 학습 목표 |
|----|-----------|------|----------|
| `ko_to_en` | **한글 → 영문** | 한글(뜻)을 보고 영문을 **생산** | 쓰기·말하기·시험 대비 |
| `en_to_ko` | **영문 → 한글** | 영문을 보고 한글(뜻)을 **생산** | 독해·의미 확인 |
| `both` | **양방향** | 위 두 방향 **모두** pass | 완전 암기 (기본 권장: 고등) |

#### 설정 위치 — **선생님만** (우선순위)

```
특별과제 > 유닛·지문 > 레벨 기본 > ko_to_en
```

| 설정 | 위치 | 설명 |
|------|------|------|
| 레벨 기본 | 관리자 | L01~L05: `ko_to_en` / L06+: `both` 등 |
| 유닛 | 책장 유닛 설정 | 해당 유닛 **전체** 기본 방향 |
| 지문 예외 | 지문表 (고급) | null이면 유닛 따름 |
| 특별과제 | 과제 생성 | `mem_direction` override |

학생은 시작 화면에서 **「선생님 지정: 한→영」** 뱃지만 본다. 토글·선택 없음.

#### 방향별 미니게임 동작

| 단계 | `ko_to_en` (한→영) | `en_to_ko` (영→한) |
|------|-------------------|-------------------|
| **A 듣기+딕테이션** | 영어 오디오 듣고 → **영문** 타이핑 | 영어 오디오 듣고 → **한글** 타이핑 (또는 영문 제시 → 한글 타이핑) |
| **B 어순배열** | 한글 문장 제시 → **영단어** 칩 배열 | 영문 제시 → **한글 어구** 칩 배열 (어구 단위 split) |
| **C 빈칸채우기** | 한글 힌트 + 영문 빈칸 | 영문 제시 + **한글** 빈칸 (객관식 4지) |
| **D 발화** | 한글 보고 → **영어** 소리내어 읽기 | 영문 보고 → **한국어** 소리내어 읽기 |
| **E 녹음** | D와 동일 방향으로 녹음 | D와 동일 |

**A 듣기 세부 (권장 UX)**

- `ko_to_en`: 원어민 **영어** 오디오 → 영문 딕테이션 (기본·가장 자연스러움)
- `en_to_ko`: 원어민 **영어** 오디오 → 들은 뒤 **한글 해석** 타이핑 (의미 암기).  
  ※ 한글 TTS 듣기→한글 타이핑은 P2 (한글 TTS 품질 이슈)

**`both` 완료 규칙**

- 같은 문장에서 `ko_to_en` 트랙 A~D(설정된 단계) 완료 **후** `en_to_ko` 트랙 반복  
- 또는 시작 화면에서 방향 1개만 골라 1회 pass (선생님이 `both` 지정 시 **둘 다** 필수)
- progress: `mem_ko_to_en_done`, `mem_en_to_ko_done` 분리 (아래 7.1)

#### 단락흐름암기에도 적용

| 방향 | UX |
|------|-----|
| `ko_to_en` | **한글 문장** 카드만 보여주고 → 영문 지문 순서( passage_no )대로 배열 |
| `en_to_ko` | **영문** 카드만 보여주고 → 의미 흐름(= passage_no )대로 배열 |
| `both` | 한→영 배열 pass 후, 영→한(카드 라벨 반대) 한 세트 더 |

---

한 문장당 **고정 순서**로 진행. 각 미니게임 통과 시 다음 unlock (틀리면 해당 게임만 재시도).  
**선택된 방향**에 맞는 prompt·정답·채점 대상이 바뀐다.

```
A. 듣기+딕테이션  →  B. 어순배열  →  C. 빈칸채우기  →  D. 소리내어 읽기(발화)  →  E. 녹음 제출(선택)
```

### A. 듣기 + 딕테이션 (Listen → Type)

| 항목 | 내용 |
|------|------|
| UX | 방향에 따라: (한→영) 오디오 → **영문** 타이핑 / (영→한) 오디오 → **한글** 타이핑 |
| 채점 | 대소문자·구두점 관대 비교 (영문). 한글은 공백·어미 `(다\|요\|니다)` 등 **관대 normalizer** |
| 통과 | 정확도 ≥ 90% (또는 Levenshtein 허용 1~2단어) |
| 힌트 | 1회: 첫 글자/첫 단어 / 2회: 글자·단어 수 |

**오디오 소스 (우선순위)**  
1. 선생님·관리자 업로드 WAV/MP3 (`passage_audio` 테이블)  
2. 캐시된 TTS (Edge Function → Storage, sentence당 1회 생성)  
3. 브라우저 fallback TTS (오프라인·미생성 시, "원어민" 품질 아님 표시)

### B. 어순 배열 (Word Scramble)

| 항목 | 내용 |
|------|------|
| UX | **한→영**: 한글 제시 → 영단어 칩 배열 / **영→한**: 영문 제시 → 한글 어구 칩 배열 |
| 데이터 | `ko_to_en`: `tokens` 영단어 / `en_to_ko`: `korean` 어구 split (쉼표·절 경계) |
| 난이도 | L01~L05: 6단어(어구) 이하 청크 / L06+: 전체 |

### C. 빈칸 채우기 (Cloze)

| 항목 | 내용 |
|------|------|
| UX | **한→영**: 한글 힌트 + 영문 빈칸 / **영→한**: 영문 + 한글 빈칸 |
| 빈칸 선정 | `ko_to_en`: S/V/O/C analyzable / `en_to_ko`: 한글 절·핵심 어구 |
| 모드 | **객관식**(P0) → **주관식**(P1) |

### D. 소리내어 읽기 — 발화 인식 (Read Aloud)

| 항목 | 내용 |
|------|------|
| UX | **한→영**: 한글 표시 → 영어 발화 / **영→한**: 영문 표시 → 한국어 발화 |
| 채점 | 인식 텍스트 vs 해당 방향 정답 유사도 |
| 한계 | Chrome/Edge 위주, 학원 PC 마이크 품질 이슈 → **통과 기준 완화(80%)** + 재시도 3회 |
| P1 | Azure/Google Speech EF (영어 발음 평가는 `ko_to_en` 우선) |

### E. 녹음 제출 — 녹음 vs 촬영?

| 옵션 | 권장 | 이유 |
|------|------|------|
| **오디오 녹음** | **P0 기본** | 용량小, 프라이버시, 학원 PC 카메라 불필요, 선생님 귀 검수 가능 |
| **영상 촬영** | **P2 선택** | 입모양·자세 확인용. Storage·동의·대역폭 부담. 특정 레벨·발표 과제만 |
| **녹음 필수 여부** | 선생님/유닛 설정 | D(발화인식)만으로 pass 가능하게 기본값 |

**E단계 역할**: D에서 자동 통과 못한 학생의 **선생님 청취용 증빙**, 또는 **A등급 도전** (선택).

---

## 6. 단락흐름암기 (문장 배열)

**같은 유닛(`unit_id`)의 passage들**을 하나의 단락으로 본다.

### 6.1 UX

1. 유닛 내 문장 목록(한글 힌트만 또는 번호)을 **올바른 순서**로 배열  
2. (P1) 한 문장씩 듣고 순서 맞추기 — 오디오만 순서 섞음  
3. (P1) 전체 단락 듣기 후 **핵심 문장 1개** 고르기  

### 6.2 데이터

- 그룹 키: `unit_id` (별도 `paragraph_id` 불필요 — 유닛 = 단락 묶음)  
- 순서 정답: `textbook_passages.passage_no` ASC  
- 진도: `paragraph_flow_progress (user_id, unit_id)`

### 6.3 통과 조건

- 1회 완벽 배열 → pass  
- 2회 이상 실패 → 한글 번역 힌트 unlock  
- 선생님 승인: **불필요** (자동 pass). 단, 유닛 워크북 제출 전 **완료 필수** 옵션.

---

## 7. 화면·라우팅

| 경로 | 설명 |
|------|------|
| `/learn/:sentenceId/memorize` | 문장암기 — **방향 선택** 후 5미니게임 |
| `/learn/unit/:unitId/flow` | 단락흐름암기 (신규) |
| `StudentHome` | `resolveTaskMode()` → 버튼·배지 분기 |
| `SentenceLearn` | `analysis_only` · `analysis_and_memorize` only |
| `BookshelfUnit` | 테스크 컬럼 · 한글 인라인 · [자동구성] |
| `LearningResults` | 트랙별·암기 단계별 점수·시도 횟수 |

---

## 8. 데이터 모델 (초안)

### 8.0 `textbook_passages` / `textbook_units` 확장

```sql
-- units
ALTER TABLE textbook_units ADD COLUMN IF NOT EXISTS
  default_task_mode text NOT NULL DEFAULT 'analysis_and_memorize'
    CHECK (default_task_mode IN (
      'analysis_only', 'memorize_only', 'analysis_and_memorize'
    ));

-- passages
ALTER TABLE textbook_passages ADD COLUMN IF NOT EXISTS
  task_mode text CHECK (task_mode IN (
    'analysis_only', 'memorize_only', 'analysis_and_memorize'
  )),
  mem_status text NOT NULL DEFAULT 'draft' CHECK (mem_status IN ('draft', 'ready')),
  mem_tokens jsonb,
  mem_korean_chunks jsonb,
  mem_cloze_spec jsonb,
  korean_source text DEFAULT 'auto',
  mem_composed_at timestamptz;

ALTER TABLE student_passage_overrides ADD COLUMN IF NOT EXISTS
  task_mode text CHECK (task_mode IN (
    'analysis_only', 'memorize_only', 'analysis_and_memorize'
  ));

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS
  unit_id uuid REFERENCES textbook_units(id),
  task_mode text CHECK (task_mode IN (
    'analysis_only', 'memorize_only', 'analysis_and_memorize'
  ));
```

### 8.1 `sentence_progress` 확장

```sql
ALTER TABLE sentence_progress ADD COLUMN IF NOT EXISTS
  mem_listen_done      boolean NOT NULL DEFAULT false,
  mem_scramble_done    boolean NOT NULL DEFAULT false,
  mem_cloze_done       boolean NOT NULL DEFAULT false,
  mem_speech_done      boolean NOT NULL DEFAULT false,
  mem_record_done      boolean NOT NULL DEFAULT false,
  mem_ko_to_en_done    boolean NOT NULL DEFAULT false,  -- both 모드용
  mem_en_to_ko_done    boolean NOT NULL DEFAULT false,  -- both 모드용
  mem_direction        text,  -- 마지막 시도 방향: ko_to_en | en_to_ko
  mem_passed_at        timestamptz,
  mem_attempt_count    int NOT NULL DEFAULT 0;
```

**pass 판정**

- `ko_to_en` / `en_to_ko` 단일: 해당 방향 A~D(설정된 단계) 완료 → `mem_passed_at`
- `both`: `mem_ko_to_en_done` AND `mem_en_to_ko_done` → `mem_passed_at`

### 8.1b `memorization_settings` (유닛·레벨)

```sql
-- unit_id 또는 level (둘 중 하나)
-- mem_direction: ko_to_en | en_to_ko | both
-- steps_enabled: jsonb  { listen, scramble, cloze, speech, record }
-- ※ allow_student_direction_pick 없음 (선생님 전용 확정)
```

### 8.2 `memorization_attempt_logs`

문장암기 시도별 상세 (기존 `attempt_logs`와 분리).

```sql
-- user_id, sentence_id, step, direction (ko_to_en | en_to_ko)
-- score, detail jsonb, created_at
```

### 8.3 `passage_audio`

```sql
-- sentence_id (= passage code), storage_path, voice_label, duration_ms, source (upload|tts)
```

### 8.4 `memorization_recordings`

```sql
-- user_id, sentence_id, storage_path, mime, duration_ms, created_at
-- RLS: 본인 insert/select, staff select all
```

### 8.5 `paragraph_flow_progress`

```sql
-- user_id, unit_id, best_score, attempt_count, passed_at
```

---

## 9. 선생님·관리자 설정

| 설정 | 위치 | 기본값 |
|------|------|--------|
| **테스크** (`analysis_only` / `memorize_only` / `analysis_and_memorize`) | 유닛·지문·과제·override | `analysis_and_memorize` |
| **암기 방향** | 유닛·과제 (**선생님만**) | `ko_to_en` |
| 암기 단계 A~E | 유닛 (**선생님만**) | A~C ON |
| 발화 vs 녹음 필수 | 유닛 | 발화만 |
| 단락흐름암기 필수 | 유닛 | ON (고등), OFF (초등) |
| 오디오 업로드 | 책장 지문 편집 | 없으면 TTS |
| 특별과제 `include_memorize` | `assignments` 확장 | false |

---

## 10. 기술 선택 (Lovable 친화)

| 기능 | P0 (1차 출시) | P1 | 비고 |
|------|--------------|-----|------|
| 오디오 | Storage + `<audio>` | TTS EF `generate-passage-audio` | `_shared` 없이 EF 단일 파일 |
| 딕테이션·어순·빈칸 | **프론트 only** | — | DB는 progress만 |
| 발화 인식 | Web Speech API | Azure Speech EF | 학원 PC Chrome 가정 |
| 녹음 | `MediaRecorder` → Storage | — | mp4/webm, 30초 상한 |
| 촬영 | — | `getUserMedia` video | P2, 학부모 동의 |
| AI 한글 초안 | — | EF `compose-memorization-passage` | `extract-sentence-words` 패턴 |

**Edge Function 최소화**: P0는 **오디오 업로드 + 녹음 업로드**만 Storage signed URL (기존 PDF 패턴 재사용).

---

## 11. 단계별 롤아웃

### Phase 0 — 2주 목표 (MVP)

- [ ] DB migration (`task_mode`, `unit_id` on assignments, mem_* jsonb)
- [ ] `src/lib/taskMode.ts` + StudentHome 분기
- [ ] 책장: 자동구성 · 한글 인라인 · **지문表 테스크 컬럼**
- [ ] 특별과제: **유닛 전체** / 1문장 + task_mode
- [ ] `/learn/:id/memorize` — 방향 선택 + A/B/C
- [ ] `StudentHome`: 트랙별 버튼 분기
- [ ] LearningResults mem 완료 표시

### Phase 1 — +2주

- [ ] D 발화 인식
- [ ] E 오디오 녹음 제출 + 선생님 청취 UI
- [ ] TTS 자동 생성 EF
- [ ] `/learn/unit/:unitId/flow` 단락흐름

### Phase 2 — 이후

- [ ] 영상 제출 (선택 과제)
- [ ] Azure 발음 평가
- [ ] Orbit 과제·알림 연동
- [ ] 단어앱 약점 단어 → 빈칸 우선 연동

---

## 12. Lovable 배포 체크리스트

1. Cursor에서 코드 + migration SQL 커밋 → push  
2. Lovable **SQL** 탭: migration 실행  
3. Storage bucket `passage-audio`, `mem-recordings` + RLS policy  
4. Edge Function (TTS/업로드 URL) 있으면 **재배포** (shared import 금지)  
5. **Publish** frontend  
6. 테스트 계정 1명으로 문장 1개 E2E

---

## 13. 열린 결정 (확인 필요)

1. **문장암기를 해석 pass 직후 필수로 할지**, 다음날 워밍업으로 미룰지 (`syntax_full`만)  
2. **초등(L01~L03)** 은 A(듣기) + B(어순)만 하고 C~E 생략할지  
3. **오디오**: 교재별 일괄 TTS vs 선생님 녹음 품질 우선  
4. **단락흐름**: `unit` = 시험지 1회 분량이 항상 맞는지  
5. ~~**한↔영 방향**~~ → **확정**: 선생님 지정, 학생 선택 없음  
6. ~~**자동구성 + 인라인 한글 + 암기전용 트랙**~~ → **확정**  
7. ~~**task_mode 3종 + 유닛/지문/과제 자유 부여**~~ → **확정** §3

---

## 14. 다음 액션

1. Phase 0: `taskMode.ts` + BookshelfUnit 테스크 컬럼 + assignments `unit_id`  
2. `compose-memorization-passage` EF (또는 P0 로컬 heuristic + 한글 수동)  
3. `MemorizeLearn.tsx` + `StudentHome` 트랙 분기

---

*이 문서는 구문랩 개발·운영 기준으로 갱신한다.*

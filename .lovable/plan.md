

## 책장 + 학습관리 대시보드 + 권한/뷰 전환 시스템

### 1. gwj0000에게 admin 권한 부여
- `user_roles`에 `(gwj0000_user_id, 'admin')` 추가 (이미 teacher라면 그대로 두고 admin도 추가)

---

### 2. 데이터 모델 — 지문을 DB로 이전

현재 지문은 `src/data/sentences.ts` 정적 파일에 있어서 책장으로 관리할 수 없습니다. 책장 UI가 의미 있으려면 DB 기반이어야 합니다.

#### 신규 테이블

**`textbooks`** — 교재(레벨별 묶음)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `level` | text | `L01`~`L10` |
| `unit_no` | int | 유닛 번호 (1=S1) |
| `title` | text | 예: "고1 S1" |
| `description` | text \| null | |
| `created_by` | uuid | 작성자 |
| `created_at` / `updated_at` | timestamptz | |
| UNIQUE(`level`, `unit_no`) | | |

**`textbook_passages`** — 교재에 속한 지문
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `textbook_id` | uuid | FK |
| `passage_no` | int | 교재 내 순번 (1,2,3…) |
| `code` | text UNIQUE | 기존 sentence id (예: `s1`, `G3-S1-001`) — 진행도 호환용 |
| `english` | text | 영어 본문 |
| `korean` | text \| null | 모범 번역 |
| `tokens` | jsonb \| null | 정답 분석 결과(현재 `SentenceToken[]` 구조 그대로) |
| `analysis_status` | text | `draft` \| `ready` |
| `created_at` / `updated_at` | timestamptz | |

#### RLS
- SELECT: `authenticated` 전체 (학생도 학습용으로 읽음)
- INSERT/UPDATE/DELETE: `teacher` 또는 `admin`

#### 데이터 마이그레이션
- `L08 / Unit 1 ("고1 S1")` 자동 생성
- 현재 `SENTENCES` 5개(s1~s5)의 english/korean/tokens를 `textbook_passages`로 시드 (`code`는 기존 그대로 → `sentence_progress` 등 기존 진행 데이터 호환 유지)

---

### 3. 코드 측 데이터 어댑터

`src/lib/sentenceSource.ts` 신규:
- `loadAllSentences()` / `loadSentenceById(code)` — DB에서 읽고 기존 `Sentence` 타입으로 변환
- `loadSentencesByLevel(level)` — 학생 메인의 `resolveNextSentence`가 사용
- 기존 `SENTENCES` 정적 배열은 폴백/시드 전용으로만 남김

기존 호출처(`SentenceLearn`, `Index`, `nextSentence.ts`, `StudentHome` 등)를 어댑터로 교체.

---

### 4. 사이드바 레이아웃 (선생님 화면)

`src/components/teacher/TeacherSidebar.tsx` + `TeacherLayout.tsx` 신규.

```text
[GWJ Lab]                       [👁 학생화면 보기]
┌──────────────┬────────────────────────────────┐
│ 📚 책장       │   (선택된 메뉴 화면)            │
│   L01 초3    │                                │
│   …          │                                │
│   L08 고1 ✓  │                                │
│   L10 고3    │                                │
│              │                                │
│ 🎓 학습관리    │                                │
│   학생목록    │                                │
│   교재부여    │                                │
│   인쇄대기열  │                                │
│   재시험관리  │                                │
│              │                                │
│ ⚙ 설정       │                                │
│   권한관리    │                                │
└──────────────┴────────────────────────────────┘
```

라우트:
| 경로 | 화면 |
|---|---|
| `/teacher` | 대시보드 홈 (요약 카드) |
| `/teacher/bookshelf` | 책장 전체 (10개 레벨 그리드) |
| `/teacher/bookshelf/:level` | 특정 레벨의 교재 목록 |
| `/teacher/bookshelf/:level/:unitNo` | 교재 상세(지문 리스트) |
| `/teacher/bookshelf/:level/:unitNo/:passageCode/edit` | **통합 편집창** |
| `/teacher/students` | 학생 목록 (기존, 사이드바로 이동) |
| `/teacher/assignments` | 교재 부여 |
| `/teacher/print-queue` | 인쇄 대기열 (2단계 인쇄와 연결) |
| `/teacher/retests` | 재시험 관리 |

---

### 5. 책장 UI

#### `/teacher/bookshelf`
- L01~L10 카드 10개. 각 카드에 교재 수 / 지문 수 / 상태(`ready`/`draft` 비율) 표시.

#### `/teacher/bookshelf/:level`
- 해당 레벨의 교재(Unit) 리스트 + **[+ 새 교재 만들기]** 버튼
  - 새 교재: `unit_no`, `title` 입력 → `textbooks` insert
- 각 교재 카드에 옆 버튼 2개:
  - **[교재 만들기]** — 영어 본문 일괄 삽입 모달 (다음 항목)
  - **[열기]** — 교재 상세로 이동

#### 영어 본문 삽입 모달
- 큰 textarea: 영어 본문을 줄 단위 또는 빈 줄 구분으로 붙여넣기
- 옵션: 자동 분할 방식 (a) 빈 줄 기준 / (b) 한 줄=한 지문 / (c) 문장 단위
- 미리보기 → 각 항목에 `passage_no` 자동 부여, `code`는 `{level}-U{unit}-{nnn}` 자동 생성
- **[저장]** → `textbook_passages` 일괄 insert (`analysis_status='draft'`)

#### `/teacher/bookshelf/:level/:unitNo`
- 지문 리스트 테이블: `passage_no` / `code` / 본문 미리보기 / 상태(draft/ready) / 단어 추출 여부
- 각 행에 **[정답 설정]** 버튼 → 통합 편집창으로 이동

---

### 6. 통합 편집창 (`/teacher/bookshelf/:level/:unitNo/:passageCode/edit`)

한 화면에 좌/우 2분할:

```text
┌─────────────────────────────────────────────────┐
│ [← 교재로]   L08 / U1 / s1   [상태: draft] [저장] │
├──────────────────────────┬──────────────────────┤
│  ◀ 구문분석 정답 입력     │  ▶ 단어 추출/편집     │
│  (기존 Index.tsx 임베드)  │  (기존 ExtractedWords-│
│  - 영어 토큰 클릭        │   Panel 임베드)       │
│  - POS/요소/역할 지정    │  - AI 추출 버튼       │
│  - 수식/지시 관계         │  - 행 추가/수정/삭제  │
│  - 관용구 등록           │  - 저장              │
│  → 저장 시 tokens jsonb  │                      │
│     로 textbook_passages │                      │
│     에 upsert            │                      │
└──────────────────────────┴──────────────────────┘
```

구현:
- `Index.tsx`에 이미 있는 `embedMode` prop 활용. 기존에는 `embedSentenceId`로 정적 sentence 로드 → DB 어댑터 거치도록 수정.
- 우측은 `ExtractedWordsPanel`을 항상 펼친 상태(`Sheet` 대신 `Card`)로 임베드하도록 prop `inline` 추가.
- 상단 **[저장]**: 좌측 분석 결과를 `textbook_passages.tokens`에 저장 + `analysis_status='ready'`로 표시.

---

### 7. 선생님↔학생 화면 전환

`useViewMode()` 훅 + `localStorage('view_mode': 'teacher'|'student')`:
- 선생님/관리자 헤더 우측에 토글: **[👁 학생 화면 보기 / 🛠 선생님 화면 보기]**
- 학생 모드일 때:
  - `RequireAuth`는 `requireRole='teacher'` 라우트로의 리다이렉트를 막지 않되, 선생님이 학생 모드면 `/learn`으로 이동
  - 학생 메인 진입 — 선생님 자신의 진행도(`sentence_progress` 등)를 그대로 사용해 실제 학생처럼 학습 가능
- 선생님 모드로 토글 시 사이드바 레이아웃으로 복귀

`StudentHome` / `SentenceLearn` 헤더에도 작은 "🛠 선생님 화면" 버튼 노출(선생님/관리자에게만).

---

### 8. 학습관리 메뉴 (스켈레톤만, 후속 단계 연결)

이번 단계에서는 페이지 골격 + 기존 데이터 표시까지:
- **학생목록**: 기존 `TeacherStudents`를 사이드바 레이아웃 안으로 이동
- **교재부여**: `assignments` 테이블 후속 — 이번엔 placeholder + 안내
- **인쇄대기열**: 직전 2단계 인쇄 시스템 산출물(`print_jobs`)을 그대로 표시할 자리. 해당 테이블이 아직 없으면 placeholder
- **재시험관리**: `word_test_results.passed=false`인 학생/지문 리스트 표시 + "재시험 부여" placeholder

---

### 9. 작업 순서 (default 모드 전환 후)

1. DB 마이그레이션: `textbooks`, `textbook_passages` + RLS + 인덱스
2. 데이터 시드: gwj0000 admin 부여 + L08/U1 + s1~s5 시드 (insert)
3. `src/lib/sentenceSource.ts` 어댑터 + 기존 호출처 교체
4. `TeacherLayout` + `TeacherSidebar` + 라우트 재정비
5. 책장 페이지 3단계(`bookshelf` → `:level` → `:unitNo`) + 본문 삽입 모달
6. 통합 편집창 (`Index` embed + `ExtractedWordsPanel` inline)
7. 선생님↔학생 뷰 전환 토글
8. 학습관리 메뉴 스켈레톤 4종

---

### 10. 결정 필요 항목

진행 전 4가지 확인:

1. **기존 `SENTENCES` 정적 배열 처리** — (a) DB 시드 후 파일은 폴백으로 보존 (b) 완전 제거하고 DB만 사용 → 권장 (a)
2. **본문 삽입 자동 분할 기본값** — (a) 빈 줄 기준 (b) 한 줄=한 지문 (c) 한 문장(. ! ?) 기준 → 권장 (a)
3. **`code` 자동 생성 규칙** — (a) `{level}-U{unit}-{nnn}` 예: `L08-U1-001` (b) 기존 `s1` 같은 짧은 형식 유지 → 권장 (a), 단 기존 s1~s5는 그대로 보존
4. **2단계 인쇄 시스템** — 직전 메시지의 인쇄 시스템(print_jobs 등)은 이번 작업과 별개 단계. 이번에는 사이드바 메뉴 자리만 만들고 placeholder. 나중에 별도 진행. OK?

답변 확인 후 default 모드로 전환하여 1번부터 순차 진행합니다.


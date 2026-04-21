

## 세 가지 작업

### 1. 관용구 — 단어 1개 선택에서도 등록 허용

**문제**: 현재 2개 이상 단어를 선택해야만 관용구 등록 UI가 활성화됨 (`activeSelectionIndices.length >= 2`). 한 단어짜리 숙어/특수 의미(예: spring=용수철 외 "샘솟다")도 등록하고 싶음.

**변경**:
- `src/pages/Index.tsx` 1906행: `idiomEnabled: activeSelectionIndices.length >= 2` → `>= 1`
- `src/components/analyzer/AnalysisPanel.tsx` 677행 안내문: `"2개 이상 단어를 선택하면…"` → `"단어를 선택하면 관용구로 등록할 수 있습니다."`
- 단어 1개일 때 등록된 관용구는 기존 인쇄/하이라이트 로직(`findIdiomCoveringIndex`)이 이미 인덱스 1개도 처리하므로 추가 작업 불필요.

### 2. 단어학습 — 음절 발음 정확도 개선 ("ce"가 "씨이"로 들리는 문제)

**원인**: `splitIntoSyllables("enhance")` → `["en", "han", "ce"]`. 마지막 청크 `"ce"`를 Web Speech가 단어 단위로 인식해 알파벳 이름 "씨이"로 발음. `"tion"`, `"ble"`, `"tle"` 등 음절 단독 발음 시 자주 발생.

**해결 — 두 단계로 보강** (`src/lib/syllables.ts`):

(1) **Silent-e 청크 병합**: 마지막 청크가 짧고 자음+e로 끝나면(`"ce"`, `"ge"`, `"se"`, `"te"`, `"ne"`, `"ve"` 등) 직전 청크와 합친다.
- `splitIntoSyllables("enhance")` → `["en", "hance"]`
- `splitIntoSyllables("decide")` → `["de", "cide"]`
- `splitIntoSyllables("simple")` → `["sim", "ple"]` (이미 `le` 처리 있음, 유지)

(2) **자음으로 시작하는 짧은 청크는 발음 힌트 추가**: 그래도 단독으로 분리되는 짧은 자음군 청크(`"ble"`, `"tle"`, `"tion"`)를 발음할 때 `speakChunk` 내부에서 **단어 컨텍스트로 감싸서 발음**한다. 예: `"tion"` 단독 발음이 아니라 `"-tion"` 이나 더미 모음 `"shun"` 식의 phonetic alias 사용.
   - 단순화 안: 청크 길이 ≤ 2이고 자음으로 끝나면 직전 청크와 자동 병합.
   - 추가로 `speakChunk`에서 청크 단독 발음 시 `rate`를 `0.65`로 약간 더 늦춰 자모음 분리 발음을 유도.

(3) **테스트 케이스로 회귀 방지**: `src/test/syllables.test.ts` 신규 — `enhance`, `decide`, `provide`, `simple`, `nation`, `little` 등 분리 결과가 의도한 대로 나오는지 확인.

### 3. 핸드아웃 입력 영역 디자인 개편 (Dark Violet + 카드 + 아이콘 + 본문 줄간격)

**대상**: `src/pages/teacher/TeacherHome.tsx` "오늘의 핸드아웃 성적 입력" 섹션 + `src/components/teacher/WordHoInput.tsx` + `src/components/teacher/SyntaxHoToggle.tsx`.

**변경**:

(A) **컬러 토큰 정리** (`src/index.css`):
- `--brand-violet: 262 60% 45%` (Dark Violet) — 이미 primary가 보라 계열인지 확인 후 약간 어둡게 보정.
- `--brand-violet-soft: 262 50% 96%` (호버/포커스 배경)
- 신규 유틸 `.handout-card`, `.handout-input` 정의.

(B) **TeacherHome.tsx 핸드아웃 표 → 학생별 카드 그리드**:
- 기존 `<table>` 구조를 카드 리스트로 변경. 각 학생을 `Card`(`shadow-sm`, `rounded-xl`, `border-violet-100`) 컨테이너에 담음.
- 카드 헤더: 학번 · 이름 · 현재 진행 (회색 작은 텍스트)
- 카드 본문: 좌측 `[📖 단어 HO]` `WordHoInput` / 우측 `[✏️ 구문 HO]` `SyntaxHoToggle`
- 우측 끝: 종합점수 배지 + 펼치기 버튼 (`DailyTestSummary`)
- 라벨에 lucide 아이콘: `BookOpen`, `PenLine`
- 숫자/점수는 `font-mono tabular-nums` → 가독성 좋은 sans-serif

(C) **WordHoInput.tsx 입력창 리디자인**:
- 기존 투박한 박스 → 인라인 underline 스타일: `border-0 border-b-2 border-input focus:border-violet-600 rounded-none bg-transparent`
- 너비 확장 `w-20`, 폰트 `text-lg font-semibold tabular-nums`
- 저장 표시(`Check`)는 입력창 우측 inline, 부드러운 fade-in
- 기존 amber "재시" 배지 유지

(D) **SyntaxHoToggle.tsx 토글 리디자인**:
- 두 버튼(P/F)을 segmented control 형태로: 활성 버튼은 `bg-violet-600 text-white`, 비활성은 `text-muted-foreground hover:bg-violet-50`
- 컨테이너 `border rounded-lg p-0.5 bg-muted/30`

(E) **분석 본문 줄간격 2.5배** (학생들이 종이/화면에서 분석 메모 가능하도록):
- 사용자 의도 확인 필요 — "본문 줄간격"이 (a) 핸드아웃 출력물의 분석 본문(`Index.tsx`/`AnalysisHandout.tsx`)인지, (b) TeacherHome 카드 본문인지 모호.
- 맥락상 (a) 인쇄용 핸드아웃의 본문으로 판단 → `src/pages/teacher/AnalysisHandout.tsx`와 `src/pages/Handout.tsx`의 본문 영역에 `leading-[2.5]` (또는 `line-height: 2.5em`) 적용. 단, 분석 그래픽(절 괄호·뱃지 위치)이 깨지지 않도록 본문 기본 텍스트 영역에만 적용하고 분석 그래픽 컨테이너는 기존 leading 유지.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/Index.tsx` | `idiomEnabled` 임계값 1로 |
| `src/components/analyzer/AnalysisPanel.tsx` | IdiomSection 안내문 수정 |
| `src/lib/syllables.ts` | silent-e 병합 + 짧은 자음 청크 병합 + rate 미세조정 |
| `src/test/syllables.test.ts` *신규* | 음절 분리 회귀 테스트 |
| `src/pages/teacher/TeacherHome.tsx` | 핸드아웃 표 → 카드 그리드 |
| `src/components/teacher/WordHoInput.tsx` | underline 스타일 입력창 |
| `src/components/teacher/SyntaxHoToggle.tsx` | segmented control |
| `src/index.css` | brand violet 토큰 + 핸드아웃 유틸 |
| `src/pages/teacher/AnalysisHandout.tsx`, `src/pages/Handout.tsx` | 본문 `leading-[2.5]` |

### 비고

- DB/스키마 변경 없음.
- 음절 분리는 영어 정자법 휴리스틱이라 100%는 아니지만 흔한 오류(silent-e, -tion, -le)를 우선 잡음. 추가 케이스 발견 시 테스트 추가하며 점진 보강.
- 핸드아웃 디자인은 Dark Violet **포인트** 사용 — 인쇄 시 흑백 가독성 보장을 위해 본문은 흑백 유지.




## 단계 우선 진행으로 변경 (Stage-major → Word-major 대신)

기존: 단어1[①②③④] → 단어2[①②③④] → … (Word-major)
변경: **모든 단어 ①음절각인 → 모든 단어 ②발화 → … ④의미인출** (Stage-major)

### 흐름

1. ① 음절각인 라운드: 단어 1~N 순서대로 음절각인 통과
2. ② 발화 라운드: 단어 1~N 순서대로 발화 통과
3. ③ 스펠링 라운드: 단어 1~N 순서대로 스펠링 통과
4. ④ 의미인출 라운드: 단어 1~N 순서대로 의미 통과
5. 모두 끝나면 PASS 도장 → 결과 저장

### 패스 판정

- 각 단계 라운드 안에서 단어별 통과 조건은 동일: `score ≥ 90 OR stuck OR teacherSkipped`.
- 통과 안 하면 같은 단어를 같은 단계에서 재시도 (기존 동작 유지).
- 모든 단어가 ① 라운드를 통과해야 ② 라운드 시작.

### 진행 바 표시 변경 (`WordStageProgressBar`)

각 단계 바의 % 의미를 **"이 단계에서 통과한 단어 수 / 전체"** 로 변경:
- `① 음절각인 ▓▓▓▓░ 6/10` 형태.
- 현재 진행 중인 단계는 `bg-primary` + 펄스, 끝난 단계는 `bg-emerald-500` + 100%.
- 헤더 라인: `2단계 발화 · 단어 3 / 10  ·  Computer` 처럼 "현재 라운드 + 진척".
- 4개 바 세로 정렬 유지.
- 전체 진척 = (완료 단계 × N + 현재 단계 통과 단어 수) / (4 × N).

### 자료구조 변경 (`WordPreStep`)

```ts
type StageKey = "syllable" | "speak" | "spell" | "meaning";
const STAGE_ORDER = ["syllable", "speak", "spell", "meaning"];

state:
  stageIdx: 0..3            // 현재 단계
  wordIdx:  0..N-1          // 현재 라운드 내 단어 인덱스
  passedPerStage: Record<StageKey, number>  // 단계별 통과 단어 수
  perWordScores: Record<word, StageScores>  // 단어별 4개 점수 누적
  perWordFlags : Record<word, Partial<Record<StageKey, "stuck"|"teacher_skip">>>
  assistEntries: AssistEntry[]
```

`handleStageFinish(score, meta)`:
- 통과 안 하면 같은 단어/단계 재시도.
- 통과 시:
  - `perWordScores[word][stageIdx] = score`, 플래그 누적.
  - `wordIdx + 1 < N` → `wordIdx++` (같은 단계 다음 단어).
  - 마지막 단어면 → `passedPerStage[stage] = N`, `stageIdx + 1 < 4` → 다음 단계 시작 (`wordIdx = 0`).
  - 마지막 단어 + 마지막 단계 → PASS 도장 → 저장.

저장 로직(`saveResults`)은 단어별 누적 점수 기준으로 동일하게 known/unknown/assist_log 산출.

### 단계 라운드 전환 UX

각 단계 시작 직전 1.2초 풀스크린 카드:
- "② 발화 라운드 시작 · 10개 단어"
- 학습자가 흐름을 인지하도록 step transition.

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/components/learning/WordPreStep.tsx` | 상태 머신 stage-major 로 재작성, 단어/단계 인덱스 분리, 라운드 전환 카드, 저장 로직 단어별 점수 기반 재계산 |
| `src/components/learning/WordStageProgressBar.tsx` | 각 바 % = 단계별 통과 단어 수 / 전체. 헤더에 라운드명·단어 인덱스 표시. props 시그니처 변경 |

### 호환성

- 결과 DB 스키마는 그대로 (`known_words`, `unknown_words`, `assist_log`).
- 한 단어를 여러 단계에서 만나도 단어별 점수는 단계 라운드 종료 시점에 합산 저장.


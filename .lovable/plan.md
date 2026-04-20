

## 목표

요청하신 7가지 시각/UX 이슈를 한 번에 정리.

---

## 1. 종속절(Clause) — 언더라인 + 하단 SVOC 배지

**현재**: 절은 `[ ]` 대괄호 + 외곽 부배지(한글)만 표시, SVOC 배지는 owner anchor에 작게 따로 노출.

**변경** (`src/pages/Index.tsx` + `src/index.css`):
- 절 owner의 모든 단어 하단에 **연속 언더라인** (`border-b-2 border-{element-color}`)을 spacer까지 이어 그림 → 절 범위가 한눈에 보임
- 대괄호 `[ ]`는 그대로 유지하되 굵기/색은 element 색과 동일하게 통일
- 하단 SVOC 배지(`outerBadge`)는 절의 **시작 단어 바로 아래** 한 번만 크게 표시 (현재 `-bottom-7` → 언더라인과 겹치지 않도록 `-bottom-6` + 약간 더 크게)
- 외곽 한글 부배지는 절 시작 단어 위에 anchor 유지

## 2. 병렬(Parallel) — 단어별 개별 박스

**현재**: 병렬 owner는 `.parallel-box` + spacer까지 이어진 보라 박스로 한 덩어리 처리.

**변경** (`src/index.css` + `src/pages/Index.tsx`):
- spacer의 `sharedParallel` 연결 제거 → spacer는 비움
- `.parallel-box-start` / `.parallel-box-end` 무조건 모든 단어에 적용 (각 단어가 독립 박스)
- `.parallel-box`의 border를 **`border-2`로 도드라지게** + 좌우 모두 둥근 radius

## 3. 다층(Layer 3) 부배지 간격

**현재**: `.sub-badge-row gap-1.5` + `.sub-badge-pill mx-0.5`.

**변경** (`src/index.css`):
- `.sub-badge-row` `gap-1.5` → `gap-2`
- `.sub-badge-pill` `mx-0.5` → `mx-1`
- 같은 단어에 2개 이상 anchor될 때 명확히 분리되게 좌우 padding 미세 증가

## 4. Layer 색상 차별화 + pill 배경↔텍스트 톤 매칭

**변경** (`src/index.css`):
- 각 layer의 **본문 배경**(`linear-gradient hsl(var(--layer-N) / 0.20)`)과 **부배지 pill 배경**의 hue/채도가 더 강하게 매칭되도록:
  - Layer 2 amber: 본문 `/0.18` → `/0.22`, pill 배경 `/0.28`
  - Layer 3 crimson: hue 350 → **340** (보라와 구분 강화), 본문/pill 모두 채도 +5
  - Layer 4 teal: hue 175 → **185** (3차 crimson과 보색 거리 ↑)
- pill의 텍스트 색을 본문 layer 색과 동일 hue로 통일 → "이 라벨이 어느 색 칠과 짝"인지 즉시 인지

## 5. `this day` 보라색 — 원인 + 해결

**원인 확인**: `to this day`는 `src/data/sentences.ts` line 253에 정답 데이터로 등록되어 있고 (`pos: 부사, form: 전N`), `progressMap` hydration이 customAnswers/원본 정답에서 자동 복원하여 Layer 1 violet pill로 표시됨.

**해결** (`src/pages/Index.tsx`):
- **단층(혼자) owner는 violet 강조 제거** — pill 배경/테두리 transparent, 텍스트만 muted-foreground 톤
- `.sub-badge-pill.is-solo` 클래스 추가, `totalLayers === 1`일 때 부여
- `.sub-badge-pill-1.is-solo`에서 violet 배경/border/번호 모두 제거
- 다층(2+)일 때만 layer별 색 알약 노출 — 원래 의도대로 복원

## 6. 한글 힌트 노출 시간

**변경** (`src/components/analyzer/KoreanHintButton.tsx`):
- `durationMs` 기본값 `2500` → **`5000`** (5초)
- 페이드아웃 시작 시점(`durationMs - 400`)도 자동 조정됨

## 7. 본문 텍스트 수정 위치

**현재 상태**: 본문(영어 문장 + 한국어 번역 + 토큰 분해)은 모두 **`src/data/sentences.ts`** 파일에 하드코딩.

**옵션** (구현 변경 X, 안내):
- 각 sentence는 `english`, `korean`, `tokens[]` 필드로 정의
- 토큰별 정답(`pos/form/element/role/koreanLabel`)도 같은 파일에 인라인
- UI에서 직접 편집하려면 별도 "문장 편집 모드" 페이지가 필요 (요청 시 다음 단계로 분리)

→ 이번 plan은 **위치 안내까지만**. 편집 UI가 필요하면 별도 작업으로 분리.

---

## 변경 파일

- `src/index.css` — 절 언더라인, 병렬 박스, 부배지 간격, layer 색 재정의, `.is-solo` 룰
- `src/pages/Index.tsx` — 절 언더라인 적용, 병렬 spacer 끊기, 단층 owner `is-solo` 클래스 부여
- `src/components/analyzer/KoreanHintButton.tsx` — 기본 노출 시간 5000ms

## 검증

1. 절 owner 단어들 하단에 element 색 연속 언더라인, 시작 단어 아래 SVOC 배지 1회
2. 병렬 owner의 `and / or` 등 각 단어가 두꺼운 테두리 개별 박스
3. 한 단어에 부배지 2~3개 anchor 시 좌우 간격 시원
4. Layer 2/3/4 본문 색칠 ↔ pill 색 톤이 한눈에 매칭, layer 간 hue 차이 뚜렷
5. `to this day`처럼 단층 owner는 보라색 알약 사라지고 깔끔한 라벨만
6. 한글 힌트 5초간 표시
7. 본문 수정은 `src/data/sentences.ts`에서 가능 — 채팅으로 알려주면 직접 반영


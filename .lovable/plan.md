
## 요청 정리 — 8개 통합 보강 (최종 블루프린트)

| # | 항목 | 현재 상태 |
|---|---|---|
| 1 | 정답 모드 채점 차단 | ✅ 직전 작업으로 `useMaskStatus` 적용 완료 — 추가로 wrong 토스트/animation 잔존 여부만 점검 |
| 2 | 다층 레이어 공존 | ⚠️ 현재 token당 단일 progress. Clause/Parallel/SVOC/Idiom을 별도 namespace로 분리 필요 |
| 3 | 정확 인덱스 기반 | ✅ 직전 작업으로 smart grouping 제거 완료 — 회귀 점검만 |
| 4 | 닫는 `]` | ✅ 직전 작업 — 회귀 점검 |
| 5 | 완료 단어 재선택/편집 | ⚠️ 현재 완료 토큰 클릭 시 새 selection으로 시작은 되지만, 기존 분석을 패널에 다시 로드하는 경로가 약함 — 재진입 시 progress 복원 필요 |
| 6 | 지우개 vs 선택해제 분리 | ⚠️ 일부 혼용. 명확히 두 버튼·두 핸들러로 분리 |
| 7 | 모바일 패널 잘림 | ⚠️ Drawer content에 스크롤·padding 안전영역 보강 필요 |
| 8 | 숙어 레이어 (신규) | ❌ 미구현 — 이전 플랜의 데이터모델/UI 그대로 적용 |

## 데이터 구조 변경 (Item 2)

`progressMap`은 그대로 유지하되 **Idiom은 완전 별도 store**로 분리해 SVOC와 절대 간섭 안 하게:
- `src/lib/idioms.ts` 신규 — `gwj.idioms.v1` localStorage
- `customAnswers`(SVOC 분석)와 `idioms`는 같은 단어에 동시 존재 가능
- 렌더링: idiom = outer wrapper (sepia background + tooltip), SVOC = inner span (기존 그대로) → 시각적 공존

Clause/Parallel은 이미 `completedSelectionMap`으로 토큰별 분리 저장 중 → 변경 없음.

## 변경 파일

### `src/lib/idioms.ts` (신규)
```ts
type IdiomMark = { id, sentenceId, indices[], surface, meaning, createdAt }
loadIdioms / saveIdioms / upsertIdiom / removeIdiom
getIdiomsForSentence(sentenceId) / getAllIdiomsFlat()  // 테스트 세션용
findIdiomCoveringIndex(sentenceId, idx)
```

### `src/index.css`
```css
--idiom-bg: 30 35% 90%;
--idiom-border: 28 40% 70%;
--idiom-fg: 25 35% 30%;
/* dark mode 변형 포함 */
```

### `src/components/analyzer/AnalysisPanel.tsx`
- **신규 섹션 "🟫 숙어 / Phrase"** — 항상 노출 (selectedWordIndices ≥ 1)
  - 정답 모드: meaning 입력 + `[숙어 저장]` / 기존 마크 시 `[수정]`·`[삭제]`
  - 일반 모드: 등록된 숙어 hover 안내만
- **회귀 점검**: `useMaskStatus`가 모든 wrong 경로(POS/element/role/verb confirm)에서 동작하는지 확인
- **모바일 보강**: 패널 root에 `max-h-[calc(100dvh-3.5rem)] overflow-y-auto pb-[env(safe-area-inset-bottom)]` + 간격 축소

### `src/pages/Index.tsx`
- **숙어 lookup**: 렌더 루프에서 `findIdiomCoveringIndex` → 외곽 wrapper로 sepia 배경 + `Tooltip`(meaning)
  - SVOC 배경은 inner span 유지 → 두 색 동시 표시
  - 같은 idiom 연속 토큰: 첫 토큰 `rounded-l pl-1`, 마지막 `rounded-r pr-1`
- **재선택 (Item 5)**: 완료 토큰 클릭 시
  - 해당 토큰의 `progressMap` 엔트리를 그대로 `selectedId`에 복원 → 패널이 기존 분석 로드 (이미 데이터 있으므로 자동)
  - 새 `selectedWordIndices`는 해당 토큰의 저장된 `completedSelectionMap` 인덱스로 세팅
- **버튼 분리 (Item 6)**:
  - `[🧽 지우개]` → progress + completedSelectionMap + idiom mark(겹치는 경우 별도 확인) 삭제
  - `[✕ 선택해제]` → `selectedWordIndices`만 비우기
  - 자동 deselect: `progress.completed === true` 시 `clearActiveSelection()` (이미 동작)
- **헤더**: `📚 등록 숙어 N` 카운터 + 클릭 시 모달로 전체 리스트 (sentenceId·surface·meaning) — 추후 `/test` 라우트가 `getAllIdiomsFlat()`으로 동일 데이터 사용
- **모바일 Drawer**: `max-h-[85dvh]` + 내부 스크롤 영역, `pb-safe` 클래스

## 진행 범위
- ✅ Item 1·3·4 회귀 점검 (이미 적용됨)
- ✅ Item 2 — Idiom store 분리로 SVOC와 공존
- ✅ Item 5 — 완료 토큰 재선택 시 progress 복원
- ✅ Item 6 — 지우개/선택해제 명확히 두 버튼으로 분리
- ✅ Item 7 — 모바일 Drawer/Panel 스크롤·safe-area 보강
- ✅ Item 8 — Idiom 레이어 (마킹·tooltip·헤더 카운터·테스트용 export API)
- ❌ `/test` 어휘 테스트 페이지 자체는 별도 작업 (요청 시 진행) — 이번엔 데이터 source만 준비
- ❌ SENTENCES 데이터 변경 없음

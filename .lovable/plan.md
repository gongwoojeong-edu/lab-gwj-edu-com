
## 요청 정리

4개 정밀 보강:
1. **[접SV] 닫는 대괄호 누락 수정** — `]`이 안 보이는 케이스
2. **정답 입력 모드 = 절대 채점 없음** — `wrong`/`Try` 모두 차단
3. **`O` 태그 숨김 강화** — 전치사의o / to V의o / V-ing의o 는 하단 `O` 배지 미표시
4. **선택 자동 리셋 + 완료 상태 가시화** — 분석 완료 시 `selectedWordIndices` 즉시 비우고, 완료된 단어는 옅은 색/배지로 "완료" 상태 유지

## 현재 코드 점검 결과

| 항목 | 현재 상태 |
|---|---|
| 1. 닫는 `]` | `bracketRole && isLastOfSelection` 조건으로 렌더 중. 그러나 `clauseEnd`가 `completedIndices` 마지막 값이고 wrap 컨테이너가 `inline-flex items-end`라 줄바꿈 시 분리 가능. 실제 데이터에서 렌더 여부를 다시 검증해야 함 — 가장 의심 가는 원인은 `completedIndices`가 단일 인덱스(클릭 1번)일 때 `clauseStart === clauseEnd`라 `[` `]` 둘 다 같은 단어에 붙는데 한쪽만 보일 수 있고, drag 범위일 땐 정상이어야 함. 디버깅 필요. |
| 2. 정답 모드 채점 차단 | `handlePos`에서 정답 모드일 땐 `posStatus: "correct"` 강제. 그러나 `AnalysisPanel`에 `answerInputMode` 신호가 전혀 안 들어가서 `StatusPill`이 wrong을 띄울 수 있는 경로 잔존. 동사 confirm 등도 점검 필요. |
| 3. `O` 배지 숨김 | `INTERNAL_OBJECT_ROLES.has(a.role)` 체크는 명사 케이스에만 있음. role이 `"전치사의o"` 등이면 `completedElement` 자체가 세팅 안 됨 → 배지 안 보임 → ✅ 동작. 다만 `role` 값이 정확히 일치해야 하므로 데이터 확인 필요. 추가로 `to V`/`V-ing` 자체(form 기준)일 때도 숨겨야 한다는 요구 — 현재 form 기준 숨김은 없음. |
| 4. 자동 리셋 | `useEffect([selectedId, progress.completed, ...])`로 `progress.completed===true` 시 `clearActiveSelection()` 호출 중. 그러나 `clearActiveSelection`이 `selectedId`도 null로 만들어서 다음 클릭 시 fresh selection은 OK. "완료" 상태 시각화는 `bg-primary/[0.08]` + 하단 배지로 이미 구현. 단, modifier/접SV는 의도적으로 배경 없음. 추가 가시 신호 필요 시 보강. |

## 수정 계획

### Fix 1 — 닫는 `]` 보강
- `Index.tsx` 렌더 루프: `bracketRole && isLastOfSelection` 조건 유지하되 `inline-flex items-end whitespace-nowrap`로 같은 단어 wrap에서 `[word]`가 한 단위로 묶이도록 강화.
- 1단어 클릭으로 끝난 절(`clauseStart === clauseEnd`)에서도 `[` 와 `]` 둘 다 그리도록 확인 (현재 둘 다 `isFirstOfSelection`/`isLastOfSelection` 각각 true이므로 정상 — 시각 검증).

### Fix 2 — 정답 모드 채점 완전 차단
- `Index.tsx`에서 `AnalysisPanel`에 `answerInputMode` prop 전달.
- `AnalysisPanel.tsx`:
  - 새 prop `answerInputMode?: boolean` 추가.
  - 모든 `StatusPill` 호출부에서 `answerInputMode`면 `status === "wrong"`을 `"idle"`로 치환 (또는 pill 자체를 안 그림).
  - 버튼의 `ng`(빨간 강조 + animate-pulse) 클래스 적용 시 `answerInputMode`면 비활성.
  - 동사 confirm wrong 표시 동일 처리.

### Fix 3 — `O` 태그 숨김 명확화
- 현재 명사 케이스에서 `INTERNAL_OBJECT_ROLES.has(a.role)`로 처리되지만, **명사+`form === "to V"` 또는 `"V-ing"` 자체**(즉, to-V/V-ing이 목적어 노드인 경우)도 하단 `O` 배지를 숨겨달라는 요청.
- `Index.tsx` `completedElement` 결정 블록에 추가 조건:
  ```
  if (a.pos === "명사" && (a.form === "to V" || a.form === "V-ing")) {
    // O 배지 미표시 (단어 위 한국어 라벨은 유지)
    completedElement = undefined;
  }
  ```
  → role 기반 숨김(`INTERNAL_OBJECT_ROLES`)과 form 기반 숨김 둘 다 적용.

### Fix 4 — 완료 상태 가시화 + 자동 리셋
- 자동 리셋은 이미 동작 → 유지.
- 완료된 단어 시각화 강화:
  - 일반 완료: 현재 `bg-primary/[0.08]` → `bg-primary/[0.10]`로 살짝 강화 + `border-b border-primary/30`로 "처리됨" 하단 라인 추가 (modifier/접SV 제외).
  - Modifier/접SV: 텍스트 색만 `text-foreground/80`로 살짝 dim해서 "완료됐지만 비-색상" 신호.
- 다음 클릭이 이전 완료 단어와 그룹화되지 않도록 `handleWordMouseDown` 검증: 현재 토글 추가 방식이라 새 클릭은 단순히 그 인덱스만 추가됨 → ✅ OK. 단, 이전 selection은 완료 시 useEffect로 비워졌으므로 OK.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/Index.tsx` | (1) 브래킷 wrap에 `whitespace-nowrap` 적용 (3) `to V`/`V-ing` 폼일 때 `completedElement` 미세팅 (4) 완료 단어 시각 보강 + `answerInputMode` panelProps 전달 |
| `src/components/analyzer/AnalysisPanel.tsx` | `answerInputMode` prop 수신, `StatusPill`/버튼 wrong 스타일·pill을 모드 ON 시 idle로 치환, 동사 confirm wrong 동일 |

## 진행 범위
- ✅ 닫는 `]` 시각 보강
- ✅ 정답 모드에서 wrong/Try 메시지 완전 제거
- ✅ to V·V-ing·전치사의o 케이스에서 `O` 배지 숨김
- ✅ 분석 완료 후 selection 즉시 해제, 완료 단어는 옅은 보라 + 하단 라인으로 "처리됨" 시각화
- ❌ 부사·기타 패널 구조 변경 없음
- ❌ 데이터(SENTENCES) 변경 없음


## 요청 정리

누적 선택 로직은 그대로 두고, 나머지 4개 기능을 한 번에 통합:
1. 정답 입력 모드 토글 + localStorage 저장
2. 지우개 버튼 (선택 단어들의 분석 초기화)
3. Layer 3A/3B 평탄화 (2-클릭 시스템) — 명사/형용사
4. [접SV] 선택 시 절 범위에 굵은 [ ] 괄호 표시

## 현재 상태 점검

- ✅ `src/lib/customAnswers.ts` 이미 존재 (load/save/upsert/merge)
- ✅ `Index.tsx`에 `answerInputMode` state, 헤더 토글, 노란 배너, 정답 초기화 버튼이 이전 승인된 플랜에서 구현됨 (요약 기준)
- ❓ 지우개 버튼 — 이전에 추가된 듯하나 동작이 모호하다는 피드백 있었음. 현재 구현 점검 필요
- ❌ Layer 3A/3B 평탄화 — 미구현 (직전 플랜은 거절됨, 이번 메시지로 재요청)
- ❌ [접SV] 괄호 표시 — 미구현

## 구현 계획

### 1) 정답 입력 모드 (이미 있음 → 점검만)
- 헤더 토글, 노란 배너, `[정답 초기화]` 버튼이 정상 동작하는지 코드 확인 후 누락 시 보완
- 모든 핸들러(`handleNounElementRole` 신규 포함)가 `answerInputMode`일 때 `upsertCustomAnswer`로 즉시 저장

### 2) 지우개 (Eraser)
- 헤더 또는 sentence 영역 위에 `[지우개]` 버튼
- 동작: `selectedWordIndices`에 포함된 토큰들의 `progressMap` 항목 삭제 → SVOC 태그·색상·괄호 모두 사라짐
- 선택 상태(보라 하이라이트)는 유지 → 사용자가 같은 단어로 다시 분석 가능
- 선택 0개일 때 disabled

### 3) Layer 3A+3B 평탄화 (명사/형용사)

`AnalysisPanel.tsx`의 `NounPanel`/`AdjPanel` 03 영역을 다음 구조로 교체:

```text
03 | Function & Role
─────────────────────────────────
[S 주어 ▸]   [주어] [가주어] [진주어]
[O 목적어 ▸] [목적어] [간접목적어] [직접목적어]
[C 보어 ▸]   [주격보어] [목적격보어]
[M 수식어]   ← 단독 클릭 = 즉시 완료
─────────────────────────────────
```

- 좌측: element 라벨(클릭 불가, 헤더 역할)
- 우측: 그 element의 role 후보 버튼들 (form별로 동적 계산)
- 모든 role 후보를 form 선택 직후 한 화면에 노출
- role 버튼 클릭 1회로 element+role 동시 저장 + `completed: true` (Shape → Role = 2클릭)
- M은 단일 버튼이며 클릭 즉시 완료, 색상/태그 미부여

`Index.tsx`에 신규 핸들러:
```ts
handleNounElementRole(element, role)  // 두 단계를 한 번에 처리
handleAdjElementRole(element, role)
```
- 채점 모드: 둘 다 정답이면 correct + completed, 아니면 wrong
- 정답 입력 모드: 채점 없이 둘 다 저장 + completed
- M: role 없이 element만 저장 + completed, 색/태그 부여 안 함

### 4) [접SV] 괄호 표시

- 동사의 특수 분류 또는 별도 POS 선택지로 `접SV`(접속사+SV 절) 처리
- 선택된 단어 범위(연속이든 비연속이든 포함된 인덱스의 min~max)를 절 범위로 저장: `clauseRanges: { start, end }[]`
- 렌더 시 절 시작 토큰 앞에 `[ `, 끝 토큰 뒤에 `]` 출력 (굵게, 보라색)
- `progressMap`에 `clause: true` 또는 `Index.tsx` state `clauseBrackets`에 저장 → 정답 입력 모드면 `customAnswers`에도 보관

확인이 필요한 점: 현재 `POS` 목록에 `접SV`가 있는지, 아니면 신규 추가해야 하는지. 코드 점검 후 결정.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/Index.tsx` | 지우개 버튼+핸들러, `handleNounElementRole`/`handleAdjElementRole` 신규, [접SV] 절 범위 state·저장·렌더, 정답 모드 보강 |
| `src/components/analyzer/AnalysisPanel.tsx` | `NounPanel`/`AdjPanel` 03 영역을 element-header + role-buttons 평탄 그리드로 교체. M 단독 버튼. `[접SV]` 옵션이 동사 패널에 없으면 추가 |
| `src/lib/customAnswers.ts` | 절 범위 저장용 헬퍼 추가(필요 시) |

## 진행 범위
- ✅ 정답 입력 모드 점검·보완
- ✅ 지우개(분석만 지움, 선택 유지)
- ✅ 명사/형용사 03 평탄화 (2클릭)
- ✅ M 즉시 완료(태그·색 없음)
- ✅ [접SV] 절 굵은 [ ] 괄호 + 데이터 저장
- ❌ 부사·기타 패널은 이미 평탄 → 변경 없음
- ❌ 누적 선택 로직은 손대지 않음

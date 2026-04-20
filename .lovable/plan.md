

기존 플랜에 두 가지 표기 위치(대명사 지시어, 형용사 수식 대상)를 추가합니다.

## 추가 항목

### C) 대명사 지시어(referent) 표기 위치

**어디에서 입력하나**
- `AnalysisPanel` → POS가 `명사`이고 사용자가 추가 옵션으로 `대명사`를 의미하는 항목을 고른 경우 (현재 noun form/role 흐름 안에서 처리)
- 별도 작은 입력 영역 `[지시어 지정]` 버튼을 명사 패널 하단에 노출
- 클릭 시 본문에서 가리키는 대상 토큰을 클릭 → referent로 저장

**어디에 표시되나**
- 본문 단어 위쪽에 SVG 점선 화살표 (수식 화살표와 같은 overlay 사용)
- 수식 화살표와 구분 위해 색/스타일 분리:
  - 수식 화살표: 보라 점선
  - 지시어 화살표: 회색 점-점선 (dot dash) + 시작점에 작은 동그라미
- 텍스트 라벨 없음 (감독 요청 동일 적용)

**저장**
- `src/lib/referentTargets.ts` 신규 — `modifierTargets.ts` 와 동일 패턴
- localStorage 영구화

### D) 형용사 수식 대상(modifier target) 표기 위치 — 기존 B) 보강

**어디에서 입력하나** (기존 플랜 재확인)
- `AnalysisPanel` → POS가 `형용사`이거나 element가 `M`으로 확정된 owner일 때만
- 패널 하단에 `[수식 대상 지정]` 버튼 노출
- 버튼 클릭 → 패널 상단에 안내 배너 “대상 단어를 클릭하세요” 표시
- 본문에서 다른 토큰 클릭 시 target 저장 + pending 해제
- 같은 source로 다시 누르면 덮어쓰기, owner 삭제 시 관계 자동 삭제

**어디에 표시되나**
- 본문 단어 위쪽 SVG overlay (보라 점선 곡선)
- SVOC 배지(아래)와 절대 겹치지 않음
- Admin 토글 `수식선 표시` ON일 때만 노출

### E) 두 화살표 공통 overlay

- 단일 `ArrowOverlay` SVG 컴포넌트로 통합
- prop으로 `kind: "modifier" | "referent"` 받아 색/dash 패턴 분기
- token DOM ref map은 한 벌만 유지

## 추가/수정 파일

- `src/components/analyzer/AnalysisPanel.tsx`
  - 명사 패널 하단 `[지시어 지정]` 버튼 (대명사 선택 시 조건부)
  - 형용사/M owner 패널 하단 `[수식 대상 지정]` 버튼
  - pending 안내 배너
- `src/pages/Index.tsx`
  - `pendingArrowSource: { ownerId, kind } | null` 통합 상태
  - 클릭 가로채기 분기 (modifier / referent 동일 흐름, kind만 다름)
  - `ArrowOverlay`에 두 종류 화살표 모두 전달
- (신규) `src/lib/referentTargets.ts` — `modifierTargets.ts`와 동일 구조
- `src/components/analyzer/HintSettingsContext.tsx` — `showReferentArrows` 추가
- `src/components/analyzer/AdminHintToggle.tsx` — `지시어 표시` 스위치 추가

## 검증 (추가)

8. 명사를 대명사로 분석하면 패널 하단에 `[지시어 지정]` 버튼 노출
9. 클릭 → 본문 단어 클릭 → 회색 점-점선 화살표 표시
10. 형용사/M owner에서만 `[수식 대상 지정]` 버튼 노출 (다른 POS에서는 숨김)
11. 두 화살표가 동시에 있어도 색/스타일로 즉시 구분
12. Admin 토글로 각각 독립적으로 on/off
13. 새로고침 후에도 두 관계 모두 유지


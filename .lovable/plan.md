
## 추가 수정 사항 (지우개 직전 계획에 통합)

### 1) 관용구 지우개 — 브라운톤 배경 동시 삭제
- 현재: `customAnswers`/`progress`만 삭제, idiom 표시(브라운 underline 배경)는 잔존
- 수정: 지우개 핸들러에서 active span(또는 단일 토큰)을 덮는 `IdiomMark` 도 같이 제거
  - `removeIdiom(sentenceId, indices)` 호출 추가
  - 절 owner면 절 범위와 일치하거나 그 안에 포함된 idiom 모두 제거
  - 단일 토큰 owner면 그 인덱스를 덮는 idiom 1건 제거
- 결과: 지우개 한 번으로 SVOC + 한글라벨 + 부배지 + 절 + idiom 브라운톤 모두 클리어

### 2) 특정 element=O 인 경우 SVOC 하단 배지 표시 안 함, 부배지만
대상:
- `V-ing` (현재분사/동명사 등) 의 목적어 → 부배지에 그 단어의 element=O 라벨 노출, **하단 SVOC 배지 X**
- `to V` (to부정사) 의 목적어 → 동일
- `전치사` 의 목적어 → 동일

처리 위치: `src/lib/labels.ts` `buildElementBadge`
- 명사 progress 에서 `role`/`form` 이 다음 중 하나면 element=O 여도 `undefined` 반환:
  - `V-ing의 O` / `Ving의O`
  - `to V의 O` / `toV의O`
  - `전치사의 O` / `전치사의목적어`
- 정확한 라벨 문자열은 `AnalysisPanel`의 `COMMON_ROLES_BY_ELEMENT`/`FORM_BONUS_ROLES_BY_ELEMENT` 확인 후 일치시킴
- 부배지(`buildSubBadgeLabel`)는 그대로 라벨 문자열 노출 → 하단에는 부배지만 보임

### 3) 접속사절(접SV) 대괄호 복원
- 증상: 절 범위 양 끝의 `[` `]` 브래킷이 다시 사라짐
- 원인 추정: 절 렌더 분기가 progress 의 `isClauseProgress` 가 아니라 원본 토큰 기준이라 누락
- 수정: `Index.tsx` 단어 렌더 루프에서 각 토큰별로
  - 그 토큰이 어떤 span owner 의 시작/끝인지 계산
  - 시작 토큰 앞: `[` 표시, 끝 토큰 뒤: `]` 표시
  - 단, 해당 owner 가 `isClauseProgress(progress)` 인 경우만
- 절 SVOC 배지 + 부배지 위치도 `]` 바로 아래 중앙에 동일 스타일로 노출 (기존 4번 항목 유지)

## 수정 파일
- `src/pages/Index.tsx`
  - 지우개 핸들러: `removeIdiom` 호출 추가
  - 절 브래킷 렌더 로직 복원 (owner span 시작/끝 기반)
- `src/lib/labels.ts`
  - `buildElementBadge` 에 V-ing의O / toV의O / 전치사의O 예외 추가
- `src/components/analyzer/AnalysisPanel.tsx` (필요 시)
  - 정확한 role 라벨 문자열 확인용

## 검증
1. 관용구 마킹된 단어 지우개 → 브라운 배경까지 같이 사라짐
2. `playing tennis` 의 `tennis` 를 `V-ing의 O` 로 저장 → 부배지 `V-ing의 O`만, 하단 SVOC 배지 없음
3. `to study English` 의 `English` 를 `to V의 O` → 부배지만, 하단 배지 없음
4. `in the room` 의 `room` 을 `전치사의 O` → 부배지만, 하단 배지 없음
5. `that soon followed` 절 저장 → 양 끝 `[ ]` 다시 표시 + 부배지 `관대주격` + SVOC 하단 배지 표시

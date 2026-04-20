

## 상태 요약

이전에 승인하신 5개 항목 플랜은 코드에 **반영되지 않았습니다**. 직전 응답에서 `bun.lock`만 수정됐을 뿐 `Index.tsx`/`index.css`는 그대로입니다. 현재 다음이 모두 미해결입니다.

- `customAnswers`는 저장은 되지만 새로고침 후 화면(`progressMap`, `completedSelectionMap`)이 복원 안 됨
- `completedOwnersByIndex`는 여전히 좁은 → 넓은 순 → 바깥 절이 큰 번호로 밀림
- layer 번호가 1부터 표시됨
- 부배지/SVOC 배지가 owner 중간 인덱스 anchor
- clause·parallel·일반 완료가 동일한 `buildLayerBg`로 그려져 박스가 무차별로 쳐짐
- 병렬 전용 강조 스타일 없음

## 이번 작업

이전 플랜을 그대로 다시 실행합니다 (이번엔 실제 코드 변경).

### 1. 정답 데이터 화면 자동 복원
`src/pages/Index.tsx`
- 마운트 시 `loadCustomAnswers()` 결과로 각 sentence × owner를 순회해 `progressMap`/`completedSelectionMap`을 재구성하는 effect 추가
- 문장 전환 시에도 현재 sentence 범위에 해당하는 owner들을 `customAnswers` 기준으로 다시 hydrate
- span owner(`span::sentenceId::s-e`)와 단일 토큰 owner 모두 처리
- 저장된 `pos`, `noun.element`, `verb.tense` 등에서 `completed: true`로 마크 가능한 항목만 자동 완료 처리

### 2. 다층 번호 체계 수정
`src/pages/Index.tsx`
- `completedOwnersByIndex` 정렬을 **긴 범위 → 짧은 범위**로 뒤집어 외곽층(=관대주격 등)이 layer 1이 되게
- `innerLayerNum` / `outerLayerNum` 계산 시:
  - 인덱스가 1개 owner에만 속하면 숫자 숨김
  - 2개 이상이면 1은 숨기고 2부터 표시
- `sub-badge-pill` 안의 `.sub-badge-num` 표시 여부를 prop/조건부 렌더링으로 분기

### 3. anchor 위치를 "맨 앞 단어" 기준으로 통일
`src/pages/Index.tsx`
- 현재 `innerMidIdx` / `outerMidIdx`(중간 인덱스) anchor → **첫 인덱스(`completedIndices[0]`)** anchor로 변경
- 병렬 owner(`기타 > 접속 > 병렬`)인 경우:
  - 범위 내 단어 중 등위접속사(and / or / but / nor / so / yet / for) 위치를 찾아 그 위에 anchor
  - 없으면 첫 단어
- 하단 SVOC 배지(`completedElement`, `outerBadge`)도 동일하게 첫 단어 또는 등위접속사 위로

### 4. clause / parallel / general 시각 분기
`src/pages/Index.tsx`, `src/index.css`
- owner 종류 판별 헬퍼 추가:
  - `isClauseOwner(progress)` — `접SV` 형식
  - `isParallelOwner(progress)` — `기타 > 접속 > 병렬`
  - 그 외 general
- `buildLayerBg`에 종류 인자 추가:
  - clause: 배경 거의 제거 (투명도 0.05 이하 또는 아예 생략)
  - parallel: 진한 배경 + border
  - general: 현재와 비슷한 옅은 보라
- spacer 배경 채움도 owner 종류별로 분기 (clause면 채우지 않음)

### 5. 병렬 전용 박스 스타일
`src/index.css`
- `.parallel-box`, `.parallel-box-start`, `.parallel-box-end` 클래스 추가
  - 배경 농도↑, `border: 1px solid hsl(var(--primary) / 0.4)`
  - 시작/끝 모서리 rounded
  - spacer도 같은 톤으로 채워 시각적 박스 연결

### 6. 대괄호 가독성 강화
`src/index.css`
- 기존 bracket span에 size·weight·색 대비 강화
- clause인데 박스를 빼는 만큼 `[` `]`가 명확히 보이도록

## 변경 파일

- `src/pages/Index.tsx`
- `src/index.css`

## 검증

1. 정답 입력 → 새로고침 → 부배지/SVOC 배지/대괄호 그대로 보임
2. 같은 문장에서 단층 owner는 layer 번호 안 보임
3. 다층(2개 이상 owner 겹침)이면 외곽층이 layer 1, 안쪽이 2/3 순서로 번호
4. 관대주격 외곽 owner의 부배지에 숫자 없음
5. 부배지·SVOC가 첫 단어 위/아래 표시 (병렬은 등위접속사 위)
6. 접속사절 단어들에 두꺼운 박스 사라지고 `[` `]`만 강조
7. 병렬은 명확히 박스로 감싸진 형태로 보임




## 목표

분석 단어를 **직사각형 박스**로 통일하고, 단어 여러 개를 연속 선택·완료해도 박스가 **끊기지 않고 하나의 긴 사각형**으로 보이게 정리합니다.

## 변경 내용

### 1. 단어 박스를 사각형으로 통일
`src/pages/Index.tsx` (라인 ~2000~2136 word render 영역)
- 단어 wrapper(`wordNode`)에서 `rounded-sm` 제거 → 모서리 0
- 본문 텍스트 span의 `rounded-l-sm` / `rounded-r-sm` / `rounded-none` 분기 모두 제거 → 항상 사각형
- 둥근 모서리는 **owner 전체의 시작/끝**에서만 적용 (병렬 박스의 `parallel-box-start/end`만 유지)
- padding 좌우를 일정하게 맞춰 spacer와 자연스럽게 연결

### 2. 선택·완료 영역을 끊김 없이 연결
`src/pages/Index.tsx`
- 현재 단어 본체는 `bg-primary/25`(선택) / `bg-primary/[0.07]`(완료)로 칠해지는데, **spacer는 다른 로직(`buildLayerBg`)**으로 칠해져 색·진하기가 다름
- 변경:
  - **선택 중(`isSelected`) spacer**: 양쪽 모두 선택이면 `bg-primary/25`로 동일 채움 → 시각적으로 한 박스
  - **완료(general) spacer**: `bg-primary/[0.07] border-b border-primary/20`를 spacer에도 동일 적용 → 단어와 동일한 농도·하단 라인으로 연결
  - 단어와 spacer의 `line-height` / `vertical-align` / `height` 통일해서 위·아래 끊김 제거
- spacer는 `inline-block` → 단어와 같은 `inline-flex items-end`로 정렬, 같은 padding-y 적용

### 3. 다층(누적) 배경도 spacer까지 동일하게 흐르게
`src/pages/Index.tsx`
- `buildLayerBg`는 그대로 유지하되, 단어 wrapper와 spacer의 `style.backgroundImage`가 **같은 layer 세트일 때 시각적으로 이어지게** padding/margin 차이 제거
- 단어 사이 공백 폭을 미세 조정(예: `min-width: 0.35rem`)해서 너무 넓은 빈칸이 박스를 잘라보이게 하는 현상 방지

### 4. 하단 보더(완료 표시)도 연결
`src/pages/Index.tsx`
- 완료 영역의 `border-b border-primary/20`를 단어/spacer 양쪽에 동일하게 그려, 박스 하단 라인이 한 줄로 쭉 이어지게 함

### 5. 병렬·절(clause)은 기존 정책 유지
- 병렬: `.parallel-box` + `parallel-box-start/end`만 끝모서리 둥글게 (변경 없음)
- 절(clause): bracket 중심, 박스 제거 정책 유지 (변경 없음)

### 6. 구두점 처리
- `punct` 토큰도 인접한 owner 영역 안에 포함되면 동일 배경/하단 보더가 적용되도록 `fillBg` 분기를 단어와 동일한 클래스로 통일

## 변경 파일

- `src/pages/Index.tsx` — 단어/spacer 렌더 클래스 정리, 둥근 모서리 제거, 선택·완료 시 spacer 동일 채움
- `src/index.css` — 필요 시 spacer 정렬용 유틸 한두 줄 추가 (선택)

## 검증

1. 단어 한 개만 선택해도 사각형 박스
2. 단어 2~5개 드래그 선택 시 가운데 빈칸 없이 하나의 직사각형
3. 완료된 영역도 동일하게 끊김 없는 직사각형 + 하단 보더 한 줄
4. 다층 누적 시에도 spacer까지 같은 색 띠가 이어짐
5. 절(접SV)은 기존처럼 박스 없이 `[ ]` 중심
6. 병렬은 기존 강조 박스 유지
7. 구두점이 박스 중간에 있어도 박스가 끊기지 않음


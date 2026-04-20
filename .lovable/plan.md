

## 문제

부배지(품사·역할 라벨)가:
1. **수직 겹침**: 안쪽 layer 부배지 + 외곽 절(clause) 부배지가 같은 `-top-3.5` 위치에 배치되어 겹침
2. **수평 겹침**: 인접한 단어들의 긴 한글 라벨이 옆 단어 라벨과 겹쳐 읽기 어려움
3. **색 단서 부족**: 부배지가 모두 `text-primary` 한 가지 색이라 어느 layer 소속인지 시각적으로 구분 불가

## 해결 아이디어

### A) Layer별 색·세로 위치 분리
- 안쪽 layer 부배지: `--layer-1` 색, `top: -14px`
- 외곽 절(clause) 부배지: `--layer-2` 색, `top: -28px` (한 줄 위로 띄움)
- 3층 이상이면 layer-3, top -42px … (layer index × 14px 만큼 위로)
- 각 부배지는 자기 owner의 layer 색 칩 배경(연하게) + 진한 글자색 → 본문 색띠와 매칭

### B) 수평 겹침 방지
- 부배지를 `absolute` + `left: 0` 대신 **owner 청크의 가운데 단어**에만 1번 표시 (현재 안쪽은 첫 단어, 절은 중간 단어에 표시 — 이걸 통일해서 둘 다 **중간 인덱스**에 anchor)
- 길어질 경우 `max-width` + ellipsis 대신, 부배지를 **작은 알약(pill) 형태**로 만들고 hover 시 tooltip으로 풀 텍스트 노출
- 인접 owner끼리는 layer가 다르면 세로 위치가 자동으로 분리됨 (위 A) → 가로 충돌도 자연스럽게 완화

### C) 부배지 디자인 토큰화
- `pill` 스타일: `px-1.5 py-0 rounded-full text-[9px] font-semibold`
- 배경: `hsl(var(--layer-N) / 0.18)`, 글자: `hsl(var(--layer-N))`
- 본문 stacking 색과 동일 토큰 사용 → "이 라벨은 이 색띠 소속"이 즉시 보임

### D) 본문 우측에 layer 범례(legend) 한 줄
- 분석 패널 또는 본문 상단에 `■ Layer 1: 단어  ■ Layer 2: 절  ■ Layer 3: …` 작은 색 범례 표시
- 다층 색이 무엇을 의미하는지 사용자가 즉시 인지

## 수정 파일

- `src/pages/Index.tsx` (라인 1438~1572 부근)
  - 안쪽 부배지(koreanLabel)와 외곽 절 부배지를 **layer depth 기반 top offset + layer 색**으로 렌더
  - 두 부배지 모두 owner의 **중간 인덱스**에 anchor (양쪽 다 한 곳에서만 노출)
  - pill 스타일로 통일, hover tooltip으로 풀 텍스트
- `src/index.css`
  - `.sub-badge-pill` 컴포넌트 클래스 추가 (layer별 색 변형)
- 본문 컨테이너 상단에 Layer Legend 1줄 추가 (Index.tsx)

## 검증 기준

1. 절 + 안쪽 단어가 겹친 영역에서 두 부배지가 **세로로 분리**되어 둘 다 읽힘
2. 부배지 색이 본문 layer 색과 일치 (1층=violet, 2층=indigo, 3층=sky …)
3. 인접 owner의 부배지가 가로로 겹치지 않음 (anchor를 청크 중앙에 배치)
4. 라벨이 길면 줄임표 + hover로 풀 텍스트 확인 가능
5. 본문 상단 legend로 색의 의미 파악 가능


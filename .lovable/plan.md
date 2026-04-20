

## 분석 패널이 문장을 가리는 문제 — 해결안

### 원인

분석 패널은 `fixed top-[64px] right-4 w-[min(34vw,460px)]` 로 화면 우측에 떠 있는데, 본문(`<main className="max-w-7xl mx-auto …">`)은 패널 폭만큼의 **여백을 두지 않아서** 문장 오른쪽 단어들(스크린샷의 `patronage ; however …` 부분)이 패널 뒤로 들어갑니다.

### 수정 (단일 파일: `src/pages/Index.tsx`)

#### 1. 본문 우측에 패널 폭만큼 패딩 확보

데스크톱(`lg:`)에서만, 본문 `<main>` 과 헤더 내부 컨테이너에 우측 패딩 추가:

- `<main className="max-w-7xl mx-auto p-4 lg:p-8 pt-4 lg:pt-24 lg:pr-[calc(min(34vw,460px)+2rem)] flex flex-col gap-4">`
- 헤더(`<nav>`)와 staff 하단바도 동일한 `lg:pr-…` 적용해서 시각적 정렬 유지.
- 분석 패널이 숨김(`analysisPanelHidden=true`) 상태일 땐 패딩 제거 → 본문이 다시 풀폭 사용. 이를 위해 패딩 클래스를 `cn(... , !analysisPanelHidden && "lg:pr-[calc(min(34vw,460px)+2rem)]")` 로 토글.

#### 2. 패널 폭 살짝 슬림화 (선택)

`w-[min(34vw,460px)]` → `w-[min(30vw,420px)]` 로 줄여서 1200px대 화면에서 본문이 답답하지 않게. 큰 화면(1600px+)에선 차이 미미.

#### 3. 모바일/태블릿 영향 없음

`lg:` 접두사로만 우측 패딩을 주므로 `<lg` 화면(드로어/시트로 패널 표시)에는 영향 없음.

### 동작 결과

- **1211px (현재)**: 문장 영역이 약 760px로 줄어들고 우측에 분석 패널 공간이 확보되어 `patronage ; however …` 같은 단어가 더 이상 가려지지 않음.
- **패널 숨김(`?` 키)**: 본문이 즉시 풀폭으로 확장.
- **모바일**: 변화 없음 (시트 방식 유지).
- **학생/선생님 동일 적용** (학생은 패널이 시트로 뜨므로 데스크톱 패딩이 영향 주지 않도록 `analysisPanelHidden` + `lg:` 가드만으로 충분).

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/pages/Index.tsx` | `<nav>` 내부 컨테이너 / `<main>` / 하단 staff 바에 `lg:pr-[calc(min(30vw,420px)+2rem)]` 조건부 추가, 분석 패널 폭을 `w-[min(30vw,420px)]` 로 슬림화 |


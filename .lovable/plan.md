

## 목표

요청하신 6가지를 한 번에 정리:
1. 병렬 박스 슬림화 (직각 + 단어에만)
2. spacer는 채우지 않음 (단, 사용자가 단어 연결로 직접 선택한 경우엔 채움)
3. 지우개 = 1회용 활성화 + 커스텀 커서
4. 접속사절 다층 부배지 자동 간격(공간 많은 쪽으로 이동)
5. 선생님-학생 등록 UI 뼈대(더미)
6. 초3~고3 10단계 레벨 + `L{레벨}-{3자리}` 넘버링

---

## 1. 병렬 박스 — 직각 + 작게 + 단어에만

`src/index.css`
- `.parallel-box`
  - `border-radius: 0.5rem` → **`0`** (직각)
  - `padding: 0 2px` → **`0 1px`**
  - `border: 2px` → **`1.5px`** (작아 보이게)
  - 배경 `--primary/0.10` 유지
- `.parallel-box-start/.parallel-box-end` `border-radius` 0으로 통일

`src/pages/Index.tsx`
- spacer에는 `parallel-box` 클래스 절대 부여 안 함 (이미 그렇지만 회귀 방지 주석 추가)

## 2. spacer 채우기 규칙 정리

`src/pages/Index.tsx` (토큰 spacer 렌더 지점, 약 2120~2170줄 인근 `backgroundImage` 계산)
- 현재: spacer가 양옆 owner 모두 같은 owner면 자동 채움
- 변경:
  - **자동 분석(원본/customAnswer 복원) owner의 spacer는 채우지 않음** (배경 transparent)
  - **사용자가 직접 단어들을 드래그/Shift+클릭으로 연결한 owner**(= `userLinkedOwnerSet`에 등록된 owner)는 spacer 채움 유지
- 신규 state `userLinkedOwnerSet: Set<ownerId>`
  - 드래그 또는 Shift+클릭으로 2개 이상 단어를 묶어 분석을 시작/완료한 owner id를 추가
  - 단일 단어 클릭으로 만들어진 owner는 추가 안 함
  - localStorage 영속화는 생략 (세션 한정)

## 3. 지우개 — 1회용 + 커스텀 커서

`src/pages/Index.tsx`
- `eraserMode`(토글)는 유지하되 `handleWordMouseDown`의 지우개 분기에서 **삭제 직후 `setEraserMode(false)`** 호출 → 한 번 쓰면 자동 해제
- 상단 지우개 버튼 라벨/툴팁 변경: "🧽 지우개 — 한 번만 사용"
- 토글 표시는 ON/OFF 그대로(시각적 활성 표시 필요)

`src/index.css` + `public/eraser-cursor.svg`(신규)
- 작은 지우개 아이콘 SVG(16×16, 핑크/회색 톤) 추가
- `body.eraser-active, body.eraser-active *` → `cursor: url('/eraser-cursor.svg') 4 12, not-allowed;`
- `Index.tsx`에서 `eraserMode`에 따라 `document.body.classList.toggle('eraser-active', eraserMode)` (useEffect)

## 4. 접속사절 다층 부배지 자동 위치 조정

`src/pages/Index.tsx`(`SubBadgeStack` / 부배지 anchor 계산 지점)
- 현재: 각 owner의 부배지는 owner 시작 단어 아래 고정 anchor
- 변경: 같은 단어 위에 anchor된 부배지 개수가 2개 이상이면 좌우 빈 공간을 비교해 더 넓은 쪽으로 일부를 밀어내기
  - 알고리즘:
    - 토큰 row에서 anchor 단어 인덱스 i, 좌측 빈 spacer 폭 vs 우측 빈 spacer 폭 측정 (DOM 측정 대신 `tokens[i±1]` static spacer 길이로 근사)
    - layer 2~ 부배지를 공간 큰 쪽으로 `transform: translateX(±N px)` 시프트
  - 구현은 SubBadge 렌더 시 `data-shift="left|right"` 속성 + CSS transition
- spacing 충돌 시 줄바꿈은 발생하지 않도록 `white-space: nowrap` 유지

## 5. 선생님-학생 등록 UI 뼈대 (더미, 백엔드 X)

신규 라우트 2개 (`src/App.tsx` 등록):
- `/teacher` — 선생님 대시보드 더미
- `/teacher/students` — 학생 등록/목록 더미

신규 파일:
- `src/pages/TeacherDashboard.tsx`
  - 카드 3종: "내 학생 (n명)" / "할당된 문장" / "최근 분석 활동"
  - `[학생 등록]` 버튼 → `/teacher/students`
- `src/pages/TeacherStudents.tsx`
  - 학생 목록 테이블(이름/레벨/등록일/상태) — 더미 데이터 5명
  - `[+ 학생 추가]` 다이얼로그: 이름·레벨(L01~L10) 선택 → 로컬 state에만 추가(localStorage `gwj.students.v1`)
  - 행별 [수정][삭제]
- `src/pages/Index.tsx`(상단 헤더)에 `[선생님 모드]` 진입 링크 추가 (관리자 토글 ON일 때만 노출)

데이터 모델(타입만 정의, 추후 Lovable Cloud 마이그레이션 대비)
```ts
type StudentLevel = `L${'01'|'02'|...|'10'}`;
interface Student { id: string; name: string; level: StudentLevel; createdAt: string; }
```

> 인증/Cloud 연결은 다음 단계로 분리. 지금은 화면 + 로컬 저장만.

## 6. 레벨 시스템 + 문장 넘버링 `L{레벨}-{3자리}`

레벨 정의 (`src/lib/levels.ts` 신규)
```ts
export const LEVELS = [
  { code: 'L01', label: '초3' },
  { code: 'L02', label: '초4' },
  { code: 'L03', label: '초5' },
  { code: 'L04', label: '초6' },
  { code: 'L05', label: '중1' },
  { code: 'L06', label: '중2' },
  { code: 'L07', label: '중3' },
  { code: 'L08', label: '고1' },
  { code: 'L09', label: '고2' },
  { code: 'L10', label: '고3' },
] as const;
```

데이터 스키마 확장 (`src/data/sentences.ts`)
- `Sentence`에 `level: LevelCode` 필드 추가 (기존 5문장은 일단 `'L10'`으로 마킹 — 현재 지문이 고3 수준)
- 각 문장 `code: string` 게터: `${level}-${String(no).padStart(3,'0')}` → 예 `L10-001`

표시 변경 (`src/pages/Index.tsx`)
- 헤더 "문장 분석 · No. 001" → **"문장 분석 · L10-001"**
- 헤더 옆에 작은 레벨 chip(`초3` 등) 노출
- `KoreanHintButton` 옆에 변동 없음

> 현재 5문장 모두 L10. 다른 레벨 문장 추가는 별도 데이터 작업.

---

## 변경 파일

- `src/index.css` — 병렬 박스 슬림, 지우개 커서
- `src/pages/Index.tsx` — spacer 채우기 규칙, 지우개 1회용+커서 토글, 부배지 자동 시프트, 헤더 레벨 표기, 선생님 모드 링크
- `src/App.tsx` — `/teacher`, `/teacher/students` 라우트
- `src/pages/TeacherDashboard.tsx` (신규)
- `src/pages/TeacherStudents.tsx` (신규)
- `src/lib/levels.ts` (신규)
- `src/data/sentences.ts` — 각 문장 `level` 필드 추가
- `public/eraser-cursor.svg` (신규)

## 검증

1. 병렬 owner: 단어마다 작은 직각 박스, spacer는 비어 있음
2. 자동 복원된 owner의 spacer는 무색, 사용자가 드래그로 묶은 owner의 spacer는 색칠 유지
3. 지우개 버튼 1회 클릭 → 활성 + 커서 변경 → 단어 클릭 → 삭제 + 자동 해제 + 커서 복귀
4. 같은 단어에 부배지 2~3개일 때 좌/우 빈 공간 큰 쪽으로 자동 시프트, 겹침 없음
5. `/teacher` 진입 시 더미 대시보드, `/teacher/students`에서 학생 추가/수정/삭제 가능
6. 헤더에 `L10-001 · 고3` 형식으로 표기, 다른 레벨 문장 추가 시 자동 반영


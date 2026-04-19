

## 전체 분석 구조 완성 + 모바일 Bottom-Sheet + 신규 본문 로드

이번 단계에서 5개 품사(명사·형용사·부사·동사·기타) 라인을 **모두** 구현하고, 모바일에서 영어 본문을 가리지 않도록 **하단 Bottom-Sheet**를 도입합니다. 기존 명사/동사 흐름은 유지하면서 형용사·부사·기타를 같은 4-Layer 패턴으로 확장합니다.

### 1. 데이터 스키마 확장 (`src/data/sentences.ts`)

기존 `NounAnswer`/`VerbAnswer`에 더해 3개 추가:

```ts
type AdjForm  = "형용사" | "to V" | "V-ing/PP" | "접SV" | "전N";
type AdvForm  = "부사"   | "to V" | "ing/pp"   | "접SV" | "전N";
type EtcKind  = "비교" | "의문문" | "감탄문" | "명령문"
              | "접속" | "가정법" | "도치/생략/동격";

type AdjAnswer  = { pos: "형용사"; form: AdjForm; element?: "C"|"M"; role: string; koreanLabel: string };
type AdvAnswer  = { pos: "부사";   form: AdvForm; role: string; koreanLabel: string };
type EtcAnswer  = { pos: "기타";   kind: EtcKind; role: string; koreanLabel: string };
type WordAnswer = NounAnswer | VerbAnswer | AdjAnswer | AdvAnswer | EtcAnswer;
```

### 2. LAYER 02·03 매핑 테이블 (`AnalysisPanel.tsx`)

**명사** (기존 + 보강)
- 공통 역할에 `전치사의o`, `to V의o`, `V-ing의o` 추가
- 원형부정사·대부정사·의문사(toV) 등 형태 전용 칩 그대로

**형용사** — LAYER 02 형태 → LAYER 03
| 형태 | 칩 |
|---|---|
| ②형용사 | 형용사, a주격보어, a목적격보어, a명사수식 |
| ⑥to V | to 명사뒤수식, be to부정사 |
| ⑨V-ing/PP | ing명사앞수식, ing명사뒤수식, ing주격보어, ing목적격보어, pp명사앞수식, pp명사뒤수식, pp주격보어, pp목적격보어 |
| ⑫접SV | 관대(주격/목적격/소유격/전+RP/계속적/N of which/N of whom), 관부(where/when/why/how/that/계속적) |
| ⑭전N | 형용사 전치사구 |

**부사** — LAYER 02 형태 → LAYER 03
| 형태 | 칩 |
|---|---|
| ③부사 | 부사 |
| ⑦to V | 목적, 감정의원인, 판단의근거, 조건, 결과, 형용사수식 |
| ⑩ing/pp | 분사구문, 완료, 부정, 독립, with N 형부 |
| ⑬접SV | 시간, 장소, 이유, 조건, 양보, 결과, 양태, 비교 |
| ⑮전N | 부사 전치사구 |

**기타** — LAYER 02 종류 → LAYER 03
- 비교 / 의문문 / 감탄문 / 명령문 / 접속(병렬·상관·유사관대) / 가정법 / 도치·생략·동격
- 각 종류별 세부 칩 1줄 (자유 선택)

**동사** — 변경 없음 (수/시제/형/태/대동사 다중 + ✱확정)

### 3. UI 규칙: 내부 목적어는 하단 'O' 배지 숨김

`Index.tsx`의 `completedElement` 계산에서:
```ts
const INTERNAL_OBJECT_ROLES = new Set(["전치사의o", "to V의o", "V-ing의o"]);
if (token.answer.pos === "명사" && INTERNAL_OBJECT_ROLES.has(role)) {
  completedElement = undefined; // 하단 S/V/O/C/M 배지 미표시
}
```
한국어 라벨(상단)은 그대로 노출.

### 4. 모바일 Bottom-Sheet 도입

**문제**: 현재 모바일은 `lg:hidden` 정적 블록으로 분석 패널을 본문 위에 깔아 영어 원문을 밀어내거나 가린다.

**해결**:
- 모바일에서 단어를 탭하면 `vaul` 기반 `Drawer`(이미 설치됨 — `src/components/ui/drawer.tsx` 존재)가 하단에서 슬라이드 업
- Drawer 내부에 `<AnalysisPanel>` 렌더, 본문은 그대로 보임 (백드롭 없이 / 또는 약한 dim)
- 데스크톱(`lg:`)은 기존 우상단 fixed 패널 유지
- Drawer 핸들로 사용자가 높이 조절 가능 (vaul 기본 제공)
- 단어 미선택 시 닫힘, 선택 시 자동 open

```text
모바일: [본문 영역 전체] ↓ 단어 탭 ↓ [Drawer가 하단 40~60% 슬라이드 업]
데스크톱: [본문 60%] [우상단 fixed 패널 460px]
```

### 5. 신규 본문 로드 (`src/data/sentences.ts`)

제공된 5문장 패러그래프를 `SENTENCES` 배열의 새 항목들로 추가 (기존 s1/s2는 그대로 유지하거나 교체 — **교체** 권장: 새 패러그래프를 메인으로):

```text
s1: Radio provided the driving force ... aided the development of sports.
s2: Who knew that sportscaster Bill Stern ... for decades?
s3: The display platform, the television, ... American public.
s4: The television provided a means ... engage their publics.
s5: The notion of a "picture being worth ..." ... presentation of sports.
```

각 문장의 모든 분석 대상 단어/구에 대해 `pos / form / element / role / koreanLabel`을 수동 태깅. 구(phrase) 단위 토큰(예: `the driving force`, `to solidify the era of patronage`)은 단일 `analyzable` 토큰으로 묶어 분석 가능하게 함.

### 6. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `src/data/sentences.ts` | AdjAnswer/AdvAnswer/EtcAnswer 타입 추가 · 새 5문장 데이터 작성 (기존 데모 교체) |
| `src/components/analyzer/AnalysisPanel.tsx` | 형용사/부사/기타 패널 추가 · 형태 매핑 상수 확장 · 명사 역할 칩에 내부 목적어 3종 추가 |
| `src/components/analyzer/AnalysisPanel.tsx` (LAYER01) | 5개 품사 모두 활성화 |
| `src/pages/Index.tsx` | 모바일 Drawer 도입 · 내부 목적어 시 하단 배지 숨김 처리 · Adj/Adv/Etc 핸들러 추가 |
| (재사용) `src/components/ui/drawer.tsx` | vaul Drawer 그대로 사용 |

### 7. 진행 범위
✅ LAYER 01: 5품사 모두 활성  
✅ LAYER 02·03: 명사·형용사·부사·동사·기타 전부 매핑 구현  
✅ 내부 목적어(`전치사의o` 등) 시 하단 S/V/O/C/M 배지 숨김  
✅ 모바일 Bottom-Sheet (vaul Drawer)  
✅ 5문장 패러그래프 로드 + 토큰화 + 정답 데이터 태깅  
⚠️ 정답 태깅은 텍스트 의미 해석 기반 — 검토 후 수정 가능하도록 데이터 분리


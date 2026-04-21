

## 핸드아웃 출력물 디자인 개편 + 성적 입력 UI 복구

오해가 있었습니다. "핸드아웃 UI 개편"은 **선생님 입력 화면**이 아니라 **인쇄되는 출력물(B5 학생본 핸드아웃)** 디자인이었습니다. 입력 UI는 이전 상태로 되돌리고, 출력물에 Dark Violet 디자인을 적용합니다.

### 1. 성적 입력 UI 복구

| 파일 | 복구 내용 |
|---|---|
| `src/components/teacher/WordHoInput.tsx` | 인라인 underline 스타일 → 기존 박스형 `Input` 으로 복구 |
| `src/components/teacher/SyntaxHoToggle.tsx` | segmented control → 기존 단일 토글 형태로 복구 |
| `src/pages/teacher/TeacherHome.tsx` | 카드 그리드 → 기존 `<table>` 표 형태로 복구 (BookOpen/PenLine 아이콘 제거) |

### 2. 핸드아웃 출력물 디자인 개편 (Dark Violet)

**대상**: `src/pages/teacher/AnalysisHandout.tsx` (학생본 단독 인쇄), `src/pages/Handout.tsx` (마스터+학생 통합 인쇄).

**디자인 방향** — 사용자가 모은 Pinterest 워크북 레퍼런스에 부합:
- **컬러**: 흑백 본문 + Dark Violet 포인트 (헤더 라인, 학생명 강조, 섹션 제목)
- **타이포**: 헤더는 굵은 sans-serif, 본문은 깔끔한 줄간격
- **레이아웃**: B5 세로(`@page { size: B5 portrait; margin: 8mm }`)
- **카드/섹션**: `shadow-sm rounded-md border` 학습지 느낌

**구체 변경**:

(A) **`AnalysisHandout.tsx`** — 학생본 단독 인쇄
- 상단 헤더 바: 좌측 "공우정바른학원" 로고 텍스트 + 우측 sentenceId/날짜, **Dark Violet 하단 굵은 라인 (border-b-2 border-primary)**
- 학생 정보 행: 학번·이름 strong 강조 + 보라 액센트
- 본문 분석 영역: `border rounded-md p-3 bg-card` 카드 + `leading-[2.5]` 유지 (메모용 줄간격)
- 채점본 모드: 빨강 음영 자동 + 안내문 *"※ 위 분석에서 표시(빨강 음영)된 부분에 유의하여 다시 분석해 보세요."* 보라 굵게
- 하단 재분석 영역: 1/3 비율의 줄노트(`repeating-linear-gradient`로 9mm 간격 가로줄) + "재분석 영역" 라벨
- 푸터: 작은 회색 안내 *"도저히 막힐 때만 선생님께 [정답 보기 요청]을 보내세요."*

(B) **`Handout.tsx`** — 통합/일반 핸드아웃
- 헤더 동일 톤(Dark Violet 라인 + 로고)
- 본문 분석 영역에 `leading-[2.5]` 적용 (이미 적용됨, 유지)
- 단어/구문 등 섹션 제목(있는 경우) 보라색 강조 라인

(C) **인쇄 색상 보장** (이미 있는 규칙 유지/보강)
```css
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
```

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/components/teacher/WordHoInput.tsx` | 이전 박스형 입력으로 복구 |
| `src/components/teacher/SyntaxHoToggle.tsx` | 이전 단일 토글로 복구 |
| `src/pages/teacher/TeacherHome.tsx` | 카드 그리드 → 표 형태 복구 |
| `src/pages/teacher/AnalysisHandout.tsx` | Dark Violet 헤더/액센트 + 줄노트 재분석 영역 강화 |
| `src/pages/Handout.tsx` | Dark Violet 헤더/액센트 적용 |

### 비고

- 음절 발음 개선(`syllables.ts`)과 관용구 단일 단어 허용(`Index.tsx`, `AnalysisPanel.tsx`)은 **그대로 유지** — 이 작업과 무관한 별도 개선이고 정상 작동 중.
- 본문 줄간격 `leading-[2.5]`는 출력물의 핵심 요구이므로 유지.
- DB 변경 없음.


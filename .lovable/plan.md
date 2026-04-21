

## 첨삭 시스템 + 핸드아웃 개편 — 통합 플랜

제미나이 조언 중 **수용/보류/대안**을 명확히 구분해 정리합니다.

### ✅ 수용 (이전 플랜 + 추가)

| 항목 | 처리 |
|---|---|
| 좌우 병렬 마스터/학생 뷰 | **수용** — 이전엔 세로 2단이었으나 데스크톱 좌/우, 모바일 위/아래로 변경 |
| diff 자동 음영 (틀린 owner 빨강) | 이전 플랜에 이미 포함 |
| 학생본 단독 인쇄 + 음영 유지 | 이전 플랜에 이미 포함 |
| 하단 재분석 여백 (필기용) | **신규 수용** — 핸드아웃 하단 1/3 공백 + "유의하여 다시 분석" 안내 |
| Dark Violet 미니멀 핸드아웃 디자인 | **부분 수용** — 인쇄는 흑백 보장이 우선이라 본문은 흑백, 헤더 액센트만 보라 |
| "정답은 노출하지 않는다" (학생 핸드아웃) | **수용** — 핸드아웃 모드는 항상 학생본만 |
| 학생 [마스터키 보기] 요청 + 열람 로그 | **수용** — 기존 `analysis_review_requests` 재활용 (열람 시 `responded_at` 기록으로 로그 자동 생성) |

### ❌ 보류/대안 (제미나이 조언 중)

| 제미나이 제안 | 본 플랜 결정 | 이유 |
|---|---|---|
| **선생님이 마우스 드래그/클릭으로 직접 틀림 마킹** | **보류** | diff는 `analysisGrading.detailsEqual`로 **자동** 산출. 수동 마킹은 첨삭 노동량을 늘림. **대신** "diff 결과 수정" 토글 제공: 자동 빨강 owner를 선생님이 클릭해서 빼거나(false-positive) 추가(false-negative) 가능 |
| **첨삭 메모 팝업** (owner별 메모) | **Phase 2로 분리** | 신규 테이블 필요(`compare_annotations`). 1차 출시 후 사용 패턴 보고 결정 |
| "PDF 출력 엔진" | **window.print() + @media print CSS** | 별도 PDF 라이브러리 불필요. 브라우저 인쇄로 PDF 저장 가능. 한글 폰트/렌더링 이슈 회피 |
| 이미지 기반 렌더링 | **DOM 그대로 재사용** | `Index.tsx` 분석 그래픽이 이미 SVG/HTML. 이미지 변환 불필요, 인쇄 품질 우수 |

### 최종 화면 구성

**A. 비교/첨삭 뷰 — `/teacher/compare/:sentenceId/:studentId`**

```text
┌─ 상단 바 (no-print) ─────────────────────────────────┐
│ 학생명·번호 │ 일치율 87% │ 자동 마킹 3 │ 수동 ±   │
│ [🖨 학생본 인쇄(채점)] [🖨 학생본 인쇄(blank)] [🖨 둘다]│
└──────────────────────────────────────────────────────┘
┌─ 데스크톱: 좌우 2단 / 모바일: 세로 2단 ─────────────┐
│ ┌─ 마스터키 (정답) ─┐  ┌─ 학생 분석 ─────────────┐ │
│ │ 분석 그래픽 그대로│  │ 분석 그래픽 + 빨강 음영 │ │
│ │ 읽기 전용         │  │ 클릭으로 마킹 토글 가능 │ │
│ └───────────────────┘  └─────────────────────────┘ │
└──────────────────────────────────────────────────────┘
┌─ 차이 요약 (no-print) ───────────────────────────────┐
│ owner │ 표면형 │ 정답 │ 학생 답 │ 자동 │ 토글       │
└──────────────────────────────────────────────────────┘
```

- 선생님이 학생 패널의 owner를 클릭하면 빨강 음영 on/off (수동 보정)
- 보정 결과는 sessionStorage에 저장 (DB 미저장 — Phase 1 단순화)
- 인쇄 시 보정된 최종 diffOwnerIds 사용

**B. 학생본 핸드아웃 — `/teacher/handout/analysis/:sentenceId/:studentId?mode=marked|blank`**

```text
┌─ 헤더 (보라 액센트 라인) ──────────────────────────┐
│ 공우정바른학원 │ 학생명 ____ 번호 __ 날짜 ____   │
│ Sentence: L05-0012                                  │
└────────────────────────────────────────────────────┘
┌─ 본문 (학생 분석 그래픽) ──────────────────────────┐
│ The boy [who lives next door] is kind.             │
│  S        접SV  ▓▓▓     M       V   C              │  ← marked 모드: 빨강
└────────────────────────────────────────────────────┘
"위 분석에서 표시된 부분에 유의하여 다시 분석해 보세요"
┌─ 재분석 필기 영역 (하단 1/3, 줄눈 가이드) ────────┐
│                                                    │
│  ╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴ │
│  ╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴ │
└────────────────────────────────────────────────────┘
하단: [정답 보기 요청 QR] (선생님 승인 시 모바일에서 마스터본 열람)
```

### Index.tsx 확장 (이전 플랜 그대로)

```ts
interface IndexProps {
  hydrateUserId?: string;        // 누구 데이터 hydrate
  compareMode?: boolean;          // 읽기 전용
  diffOwnerIds?: Set<string>;    // 빨강 음영
  missingOwnerIds?: Set<string>; // 회색 점선
  onOwnerToggle?: (ownerId: string) => void;  // ★ 신규: 수동 마킹 토글
}
```

### Storage 함수 옵셔널 userId (이전 플랜 그대로)

`fetchOwnerProgressForSentence / fetchModifierRelations / fetchReferentRelations / fetchIdiomsAll / fetchBadgeOffsets` 5개에 옵셔널 userId. RLS는 이미 teacher/admin 허용 확인됨.

### 학생 [마스터키 보기] 동선 (제미나이 추가분)

학생이 종이로 재분석 중 → 학생 화면 `AnalysisReview.tsx` 진입 → "마스터키 열람 요청" 버튼 → 기존 `analysis_review_requests` 생성 → 선생님 승인 시 학생이 마스터본 열람 (이미 구현된 플로우 재사용, **변경 없음**).

선생님 대시보드의 열람 로그는 `analysis_review_requests.responded_at` 기준으로 이미 추적 가능.

### 신규 / 수정 파일

**신규**
- `src/pages/teacher/AnalysisCompare.tsx` — 좌우 병렬 비교/첨삭 뷰
- `src/pages/teacher/AnalysisHandout.tsx` — 학생본 핸드아웃 (marked/blank)
- `src/lib/analysisCompare.ts` — `computeCompareDiff()` 헬퍼

**수정**
- `src/pages/Index.tsx` — 5개 prop 추가 (hydrate/compare/diff/missing/onOwnerToggle)
- `src/integrations/supabase/storage.ts` — 5개 fetch 함수 옵셔널 userId
- `src/App.tsx` — 2개 라우트 추가
- `src/pages/TeacherStudents.tsx` — "📋 비교" 진입 버튼
- `src/components/teacher/StudentHistorySheet.tsx` — 최근 시도 로그 행에 비교 버튼
- `src/pages/teacher/TeacherAnalysisReview.tsx` — "🖼 시각 비교" 링크
- `src/pages/teacher/AnalysisRequests.tsx` — "🖼 시각 비교" 빠른 링크

### 단계별 출시

| 단계 | 내용 |
|---|---|
| **Phase 1 (이번)** | Index.tsx 확장 + AnalysisCompare 좌우 병렬 뷰 + AnalysisHandout (marked/blank) + 핵심 진입(TeacherStudents, StudentHistorySheet) + 수동 마킹 토글 (sessionStorage) |
| **Phase 2** | TeacherAnalysisReview / AnalysisRequests 시각 비교 링크 추가, 인쇄 CSS 미세조정, 핸드아웃 QR(마스터키 요청) |
| **Phase 3** | 첨삭 메모 팝업 (owner별 텍스트 메모, 신규 테이블 `compare_annotations`) |
| **Phase 4** | Hand-out 전면 리디자인 (사용자가 따로 요청 예정 — 본 플랜과 분리) |

### 비고

- **자동 + 수동 보정 결합**: 자동 diff(POS/세부 불일치)를 1차 마킹하고, 선생님이 클릭으로 추가/제외 가능 → 제미나이가 제안한 "수동 드래그"보다 빠르고 정확
- **이미지 변환 안 함**: 분석 그래픽이 이미 DOM(절 괄호·뱃지·화살표 SVG)이라 그대로 인쇄. 한글 폰트·렌더링 이슈 0
- **인쇄 색상 보장**: `print-color-adjust: exact`로 빨강 음영 인쇄에서도 유지
- **B5 세로** 권장 (`@page { size: B5 portrait; margin: 8mm }`) — 핸드아웃 표준 규격
- 학생 마스터키 열람은 **기존 승인 플로우 재사용** — 새 권한 시스템 불필요


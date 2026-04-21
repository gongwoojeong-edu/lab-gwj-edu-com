

## 자기 첨삭 시스템 + **분석률 사전 확인 화면** 추가

기존 승인 플랜에 **"분석 단계에서 다음 단계로 넘어갈 때 정답률 확인 화면"** 단계를 추가합니다.

### 추가 단계: 분석 제출 확인 다이얼로그

**트리거**: 학생이 분석 단계에서 "다음 단계 →" 버튼 클릭 시 (translation 단계로 이동 직전)

**표시 내용** (모달 다이얼로그):
```text
┌──────────────────────────────────────────┐
│  📊 분석 제출 확인                         │
│                                            │
│  현재 분석률: 72%   ████████░░             │
│  마스터 owner: 11개 / 분석 완료: 8개        │
│                                            │
│  필수 owner 충족 여부:                     │
│   ✅ 주절 주어(S)                          │
│   ✅ 주절 동사(V)                          │
│   ❌ 접속절 동사(V) — 누락                 │
│                                            │
│  자기 첨삭 요청 가능 여부:                 │
│   🟡 미통 보조 트랙 (50% 이상, 미통 시)    │
│                                            │
│  [← 더 분석하기]  [그래도 제출 →]          │
└──────────────────────────────────────────┘
```

### 표시되는 정보

`gradeAnalysis(sentenceId)` 결과를 활용:
- **분석률 막대**: `rate * 100`%, 색상 단계(빨강 <50, 주황 50~79, 초록 ≥80)
- **owner 진행도**: 마스터 개수 vs 학생이 채운 개수
- **필수 owner 체크리스트**: 주절 S/V, 접속절 V 각각 ✅/❌
- **자기 첨삭 트랙 안내**: 현재 상태로 어느 트랙 요청이 가능한지 미리 보여줌
  - 80% + 필수 충족 → 🟢 정상 트랙 가능
  - 50%+ 충족, 미통 시 → 🟡 미통 보조 가능 (단, 미통이 되어야 활성)
  - 50% 미만 → 🔒 요청 불가
- **세부 diff 토글** (선택): "어떤 owner를 놓쳤는지 보기" 펼치면 owner ID 목록만 노출 (정답 내용은 숨김 — 자기 첨삭 승인 후에만 공개)

### 다이얼로그 액션

| 버튼 | 동작 |
|------|------|
| ← 더 분석하기 | 다이얼로그 닫고 분석 화면 그대로 유지 |
| 그래도 제출 → | 다이얼로그 닫고 `analysisDone=true` 처리 + translation 단계로 진행 |

선택지: "다시 보지 않기"(localStorage 플래그) 옵션은 **추가하지 않음** — 분석률 인지를 항상 강제.

### 구현 위치

**신규 컴포넌트**: `src/components/learning/AnalysisSubmitConfirmDialog.tsx`
- props: `open`, `onOpenChange`, `sentenceId`, `currentStatus`(pending/fail/pass), `onConfirmSubmit`
- 내부에서 `gradeAnalysis()` 호출하여 실시간 산출

**호출부**: `src/pages/SentenceLearn.tsx`
- 분석 → translation 전환을 일으키는 "다음 단계" 버튼 클릭 시 곧장 `safeSetStep("translation")` 대신 다이얼로그 먼저 열기
- 다이얼로그 `onConfirmSubmit` → 기존 전환 로직 실행

### 자기 첨삭 시스템 본체와의 연동

이 확인 화면은 **자기 첨삭 요청과는 독립**된 게이트입니다:
- 학생은 다이얼로그를 보고 "분석률 부족 → 더 분석" 또는 "이 정도면 제출"을 결정
- 제출 후 word test 단계 결과에서 미통이면 자기 첨삭 요청 트랙으로 진입
- 다이얼로그에서 본 분석률/필수 owner 정보가 자기 첨삭 요청 버튼 활성화 조건과 동일한 기준이므로 학생이 일관되게 인지

### 기존 플랜 항목과의 정합성

| 기존 플랜 단계 | 영향 |
|--------------|------|
| 1. 마이그레이션 (`analysis_review_requests` + `track`) | 변경 없음 |
| 2. `analysisReview.ts` 헬퍼 | 변경 없음 |
| 3. 학생 자기 첨삭 요청 버튼 5-state | 변경 없음 |
| 4. `AnalysisReview.tsx` read-only 비교 | 변경 없음 |
| 5. 선생님 대시보드 + 알림음 (Web Audio 합성) | 변경 없음 |
| **신규 6. 분석 제출 확인 다이얼로그** | `SentenceLearn.tsx` "다음 단계" 핸들러 + 신규 컴포넌트 1개 |

### 작업 순서 (전체 통합)

1. 마이그레이션: `analysis_review_requests` + `track` 컬럼 + RLS + realtime
2. `src/lib/analysisReview.ts` (request CRUD + 트랙 판정 + 구독 헬퍼)
3. `src/components/learning/AnalysisSubmitConfirmDialog.tsx` **(신규 — 분석률 확인)**
4. `SentenceLearn.tsx` "다음 단계" 클릭 → 다이얼로그 게이트 + 자기 첨삭 요청 버튼 5-state
5. `Index.tsx`에 `readOnlyMode` + `userIdOverride` prop 확장
6. `src/pages/AnalysisReview.tsx` 신설 (좌 마스터 / 우 내 답)
7. `src/pages/teacher/AnalysisRequests.tsx` + Web Audio 합성 알림음 + 사이드바 메뉴
8. 라우트 등록 (`/learn/sentence/:id/review`, `/teacher/requests`)

### 검증 (E2E) 추가 항목

- 분석률 30%에서 "다음 단계" 클릭 → 다이얼로그 빨강 막대 + 필수 owner 누락 표시
- 다이얼로그에서 "더 분석하기" → 분석 화면 그대로
- "그래도 제출" → translation 단계로 이동
- 분석률 85% + 모든 필수 ✅ → 다이얼로그 초록 막대 + "🟢 정상 트랙 요청 가능" 안내
- word test 미통 + 분석률 60% → 결과 화면에서 자기 첨삭 요청 버튼 🆘 amber 활성

### 결정사항 (확정)

- A) 알림음: **Web Audio API 합성** (외부 파일 없이 짧은 2음 비프) — 선생님 대시보드 전용
- B) 자기 첨삭 후: 해당 attempt 분석 잠금, 새 attempt에서 재분석 가능
- 분석 제출 확인 다이얼로그: **항상 표시** (다시 보지 않기 옵션 없음)




## 학생 화면 버튼 동작 점검 + 수정안

### 현재 동작 (확인된 문제)

학생 화면(`StudentHome.tsx`)의 "최근 학습 지문" 카드에:

| 버튼 | 의도된 동작 | 실제 동작 |
|------|------------|-----------|
| **인쇄(프린트)** | 선생님에게 "오프라인 시험지 인쇄 요청" 알림 전송 | `/teacher/handout/:code?student=:userId` PDF 핸드아웃 페이지가 학생 브라우저에서 그냥 열림 |
| **정답보기 요청** | 학생이 본인 분석을 선생님 정답과 대조하는 요청 전송 | **버튼 자체가 없음** (요청 진입 경로 없음) |

→ "프린트"는 학생용 동작이 잘못 연결되어 있고, "정답보기 요청"은 학생 홈에 노출이 빠져 있습니다. (요청 시스템 자체는 `analysis_review_requests` 테이블 + `analysisReview.ts` + 선생님 `AnalysisRequests.tsx`로 이미 완성)

### 해결안

**1. "인쇄" 버튼 → "시험지 요청" 버튼으로 변경**
- 라벨: `인쇄` → `시험지 요청` (아이콘 `Printer` 유지)
- 동작 변경: 새 창 열기 제거 → `print_requests` 신규 테이블에 INSERT
- 같은 지문에 대해 24시간 내 중복 요청 방지 (이미 pending이면 비활성 + "요청됨" 표시)
- 성공 시 toast: "선생님께 시험지 요청이 전송되었습니다"

**2. "정답보기 요청" 버튼 추가**
- 위치: 같은 카드의 액션 영역, "시험지 요청" 옆
- 라벨: `정답보기 요청` (아이콘 `Eye`)
- 동작: `analysisReview.ts`의 `requestAnalysisReview()` 호출 (`SentenceLearn`에서 쓰는 로직 재사용)
- 분석 진행률이 부족하면(예: 40% 미만) 비활성 + 툴팁 "분석을 더 진행한 후 요청 가능"
- 이미 pending/approved 요청이 있으면 상태 뱃지 표시 (`대기중` / `승인됨` / `반려됨`)

**3. (필요 시) PDF는 선생님 전용 유지**
- `/teacher/handout/...` 라우트는 선생님 화면에서만 진입 (이미 책장 → 패시지 카드에 인쇄 버튼 있음)
- 학생은 이 라우트에 직접 도달하지 않음

### 신규 DB

**테이블 `print_requests`** (마이그레이션 필요)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid | 학생 |
| teacher_id | uuid nullable | 학생의 담당 |
| sentence_id | text | 지문 코드 |
| status | enum(pending/printed/canceled) | 기본 pending |
| requested_at | timestamptz | now() |
| handled_at | timestamptz nullable | |
| handled_by | uuid nullable | |

RLS:
- `select`: 본인 OR teacher/admin
- `insert`: 본인(`user_id = auth.uid()`)
- `update`/`delete`: teacher/admin

실시간: `supabase_realtime`에 추가 → 선생님 사이드바에 "🖨 시험지 요청 N" 뱃지

### 선생님 화면 연계

**4. 선생님 신규 페이지 `/teacher/print-requests`** (또는 기존 `PrintQueue.tsx` 재활용)
- pending 목록: 학생/지문/요청시각
- 행 액션: `[핸드아웃 PDF 열기]`(현재 `/teacher/handout/...` 페이지로 이동) + `[처리 완료]` 토글
- "처리 완료" 누르면 status=printed → 목록에서 사라짐

**5. `TeacherLayout` 사이드바**
- 기존 "정답 대조 요청" 옆에 "시험지 요청" 메뉴 + 카운트 뱃지 추가

### 학생 화면 카드 레이아웃 (변경 후)

```text
┌─────────────────────────────────────────┐
│ 지문 미리보기...                         │
│ 상태: ✅ PASS / ❌ FAIL                  │
│ ─────────────────────────────────────── │
│ [🖨 시험지 요청]  [👁 정답보기 요청]     │
│ [↻ 다시 풀기]                            │
└─────────────────────────────────────────┘
```

### 작업 순서

1. 마이그레이션: `print_requests` 테이블 + RLS + realtime publication 추가
2. `src/lib/printRequests.ts` 신규 — `createPrintRequest`, `fetchPendingPrintRequests`, `subscribeToPrintRequests`, `markPrintRequestHandled`
3. `StudentHome.tsx`:
   - "인쇄" 버튼 → "시험지 요청"으로 라벨/동작 교체 (페이지 이동 제거)
   - "정답보기 요청" 버튼 추가 (`analysisReview` 사용)
   - 각 카드에 본인 요청 상태 로드 → 중복 방지
4. `PrintQueue.tsx` 본 페이지화 — pending 목록 + 처리 완료 액션
5. `TeacherLayout.tsx`: "시험지 요청" 사이드바 항목 + 실시간 카운트
6. 검증: 학생 카드 → 시험지 요청/정답보기 요청 → 선생님 사이드바 뱃지 +1 → 각 페이지에서 처리/승인 → 뱃지 감소

### 기술 메모
- 핸드아웃 PDF 페이지(`/teacher/handout/...`)는 그대로 유지 (선생님이 요청 처리 시 사용)
- `analysisReview.ts`에는 이미 `getMyRequest(sentenceId)` / `requestAnalysisReview` / `cancelMyRequest`가 있어 학생 카드에서 그대로 호출 가능
- 분석 진행률은 `owner_progress`에서 카드 로드 시 합산 (또는 가장 최근 attempt log의 `analysis_match_rate`)
- 두 요청 모두 같은 학생/지문 조합에 대해 1건만 pending 허용 (unique partial index)


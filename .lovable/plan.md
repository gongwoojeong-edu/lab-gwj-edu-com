

## "정답보기 요청 보는 곳"이 안 보이는 이유 + 해결안

### 원인
선생님 첨삭 요청 대시보드는 **`AnalysisRequests.tsx`** (경로 `/teacher/analysis-requests` 추정)로 이미 만들어져 있습니다. 하지만 현재 `TeacherLayout`의 사이드바와 `TeacherHome`의 상단 타일 어디에도 이 페이지로 가는 링크가 없어서 선생님이 도달할 방법이 없습니다.

### 해결 방안: 진입 경로 2곳에 노출 + 실시간 대기 건수 뱃지

**1. `TeacherHome.tsx` 상단 타일에 "정답 대조 요청" 추가**
   - 기존 5개 타일(책장/학생목록/교재부여/인쇄/재시험) 옆에 6번째 타일 추가
   - 아이콘: `ClipboardCheck` (lucide)
   - 라벨: **"정답 대조 요청"** / 부연: "학생 자기첨삭 승인"
   - 우상단 빨강 뱃지로 **현재 pending 건수** 표시 (0이면 숨김)
   - 클릭 → `/teacher/analysis-requests`

**2. `TeacherLayout.tsx` 사이드바에도 동일 메뉴 추가**
   - "대시보드" 아래에 "정답 대조 요청" `NavLink`
   - 우측에 pending 건수 뱃지 (실시간)

**3. 실시간 pending 건수 훅 신설** — `src/hooks/usePendingReviewCount.ts`
   - mount 시 `fetchPendingRequests().length` 초기값
   - `subscribeToReviewRequests`로 INSERT/UPDATE/DELETE 변경 시 재조회
   - 사이드바·타일·헤더 어디서든 같은 카운트 공유
   - 새 요청 도착 시 알림음(`playNotifyDing`)은 기존 `AnalysisRequests` 페이지에서만 울리도록 유지 (대시보드에서는 시각 알림만)

**4. (옵션) 라우트 경로 검증**
   - `App.tsx`에 `/teacher/analysis-requests` → `AnalysisRequests` 라우트가 등록돼 있는지 확인
   - 누락 시 추가, 가드는 `RequireAuth requireRole="teacher"`

### 레이아웃

```text
┌─ TeacherHome ────────────────────────────────────────────┐
│ 대시보드                                                  │
│ ┌────┬────┬────┬────┬────┬───────────┐                  │
│ │책장│학생│교재│인쇄│재시│정답대조 ⓷ │ ← 6번째 타일+뱃지 │
│ └────┴────┴────┴────┴────┴───────────┘                  │
│                                                          │
│ 오늘의 핸드아웃 성적 입력                                 │
│ ...                                                      │
└──────────────────────────────────────────────────────────┘

사이드바
├ 대시보드
├ 정답 대조 요청  ⓷  ← 추가
├ 책장
├ 학생 관리
└ 설정
```

### 작업 순서
1. `src/hooks/usePendingReviewCount.ts` 신규 — 초기 fetch + 실시간 구독으로 pending 카운트 유지
2. `src/pages/teacher/TeacherHome.tsx` — `TILES` 배열에 "정답 대조 요청" 추가, 카운트 뱃지 렌더 (grid를 6열로 확장 또는 wrap 허용)
3. `src/components/teacher/TeacherLayout.tsx` — 사이드바 메뉴에 "정답 대조 요청" `NavLink` + 카운트 뱃지 추가
4. `src/App.tsx` 확인 — `/teacher/analysis-requests` 라우트 존재 보장 (없으면 추가)
5. 검증: 학생이 첨삭 요청 전송 → 선생님 대시보드 타일·사이드바 뱃지가 즉시 +1 → 클릭 시 요청 목록 진입 → 승인/반려 시 뱃지 감소

### 기술 메모
- 뱃지는 작은 빨강 원에 흰 숫자(`absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full text-[10px] px-1.5`)
- `usePendingReviewCount`는 unmount 시 `unsubscribe` 정리 필수
- 카운트 0일 때는 뱃지 자체를 렌더하지 않음 (UI 노이즈 방지)
- DB·RLS 변경 없음, 기존 `analysisReview.ts` 헬퍼 그대로 사용


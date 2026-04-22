

## 플랜 — "보류(HOLD)" 상태 도입 + 마스터 없어도 요청은 허용 (공유는 마스터 등록 후)

### 핵심 요구
1. 마스터키 없는 문장: `pass`/`fail` 대신 **`hold`(보류)** 로 표기
2. 학생은 **선생님분석본보기 요청을 보낼 수 있음**
3. 요청은 들어오되, 마스터가 없으니 선생님이 **즉시 승인 불가** → 마스터 등록 후 공유

---

### 1. DB / 타입 — `hold` 상태 신설
- `sentence_progress.status` 컬럼은 `text` (CHECK 없음) → 마이그레이션 불필요
- 코드 타입만 확장:
  - `src/integrations/supabase/storage.ts`
    - `SentenceProgressStatus = "pending" | "pass" | "fail" | "hold"`
- 영향받는 곳 모두에서 `"pending" | "pass" | "fail"` → `... | "hold"` 로 확장
  - `SentenceLearn.tsx` (`previousStatus`)
  - `AnalysisSubmitConfirmDialog.tsx` (`currentStatus`)
  - `analysisReview.ts` (`decideTrack`의 `sentenceStatus`)
  - `StudentHome.tsx` (`RecentItem.status` 및 쿼리 `.in("status", ["pass","fail","hold"])`)

### 2. 분석 채점 후 status 결정 로직 변경
**파일:** `src/pages/SentenceLearn.tsx` `recordAttempt`

기존:
- 마스터 없으면 `analysisPassed=true` → 결과 항상 `pass`

변경:
- `grade.hasMaster === false` 인 경우:
  - `overallPass` 계산은 단어시험만 반영
  - `sentence_progress.status`를 **`"hold"`** 로 저장
  - `passed_at`은 **null 유지** (보상/streak 미부여)
- `grade.hasMaster === true` 인 경우: 기존 그대로 (`pass`/`fail`)
- 복습(`isReviewOfPassed`) 분기는 그대로 — 한 번 PASS한 문장은 `hold`로 강등하지 않음
- `setAnalysisGrade`에 hasMaster 그대로 보관

### 3. UI 라벨 — "보류" 배지
공통 헬퍼를 `analysisGrading.ts`에 추가:
```ts
export const statusLabel = (s: "pending"|"pass"|"fail"|"hold") =>
  ({ pass: "PASS", fail: "미통", hold: "보류", pending: "진행중" } as const)[s];
```

적용 위치:
- `SentenceLearn.tsx` 헤더 배지: 기존 `미통`/`PASS` 옆에 `hold`인 경우 회색 톤 **"보류"** 배지 추가
- `SentenceLearn.tsx` `showFailIntro`: `status === "hold"`이면 표시하지 않음 (재도전 인트로는 미통 전용)
- `StudentHome.tsx` 최근 학습 목록: `hold`인 카드는 회색 "보류" 배지로 표기 (PASS/FAIL 색과 분리)
- 통계/도넛(`AchievementDonut`, `learningStats.fetchAchievementDistribution`)은 **현 단계 변경 없음** — `hold`는 카운트에서 제외(=PASS도 FAIL도 아닌 "진행중"으로 묶이지 않게 별도 필드 추가는 보류 → 단순히 분모에서 제외)

### 4. 자기 첨삭 요청은 마스터 없어도 허용
**파일:** `src/lib/analysisReview.ts` — `decideTrack` 확장
- `sentenceStatus === "hold"`인 경우, `rate >= 0.5` 이면 `"normal"` 트랙 생성 허용
- (낮은 rate라도 학생이 요청을 보낼 수 있도록 임계는 50%로 통일)

**파일:** `src/pages/SentenceLearn.tsx` `renderReviewRequestButton`
- 기존: `if (!hasMaster && !openRequest) return null;` → **삭제**
- `hasMaster === false`인 경우에도 버튼 노출:
  - 라벨: `"선생님분석본보기 요청 (분석률 N%)"`
  - rate ≥ 0.5 이면 활성, 미만이면 비활성
  - 보낸 후 `pending` 상태 그대로 노출

**파일:** `src/pages/SentenceLearn.tsx` `requestAnalysisReview`
- `sentenceStatus`에 `previousStatus`가 `hold` 인 경우도 그대로 전달

### 5. 선생님 측 — 마스터 없는 요청 처리
**파일:** `src/pages/teacher/RequestsInbox.tsx`, `src/pages/teacher/AnalysisRequests.tsx`, `src/pages/teacher/TeacherAnalysisReview.tsx`

- 요청 행 로드 시 해당 `sentence_id`의 마스터(원장 owner_progress) 존재 여부를 함께 조회 (이미 있는 admin id 캐싱 활용 가능)
- 마스터 없는 요청에 **`마스터 미등록` 회색 배지** 표기
- **"승인" 버튼 비활성** + 툴팁: `"마스터 등록 후 승인 가능"`
- "거절"은 가능
- 승인 후 처리는 기존 로직 그대로 (학생이 정답 확인 가능)
- 마스터 등록 화면(`TeacherAnalysisReview`)에서 마스터 저장 직후, 해당 sentence의 pending 요청들을 자동으로 표시/일괄 승인 옵션 제공 (1차에서는 표시만, 일괄 승인은 추후 결정)

### 6. 학생 측 안내 — 단, "마스터 없음"이라는 표현은 절대 노출 금지
- 학생이 요청을 보낸 후 `pending` 상태에서:
  - 기존 "승인 대기 중" 배지 그대로
  - 추가 멘트는 없음 (학생에겐 마스터 유무를 노출하지 않음)
- 승인되면 기존처럼 "정답 확인" 버튼으로 자연스럽게 전환

### 7. 통계/과제 진행률 보호
- `assignmentCompletion.ts` / `assignmentProgress.ts`: `status === "hold"`는 PASS 아님 → 과제 완료 카운트 영향 없음 (현 코드가 `=== "pass"`만 보므로 자동 안전)
- `learningStats.fetchClassKpis`는 `passSentencesToday`만 보므로 영향 없음
- `StudentHome` 최근 5개 쿼리: `.in("status", ["pass","fail","hold"])`로 변경 (보류 카드도 보이게)

---

### 변경 파일 요약

#### 수정
- `src/integrations/supabase/storage.ts` — 타입 확장
- `src/lib/analysisGrading.ts` — `statusLabel` 헬퍼 추가
- `src/lib/analysisReview.ts` — `decideTrack`에 `hold` 케이스 추가
- `src/pages/SentenceLearn.tsx`
  - `previousStatus` 타입 확장
  - `recordAttempt`: 마스터 없으면 status `hold`, passed_at null
  - 헤더에 "보류" 배지
  - `showFailIntro`는 hold일 때 비표시
  - `renderReviewRequestButton`: 마스터 없어도 노출 (rate ≥ 0.5)
- `src/components/learning/AnalysisSubmitConfirmDialog.tsx` — `currentStatus` 타입 확장
- `src/pages/StudentHome.tsx` — `RecentItem.status` 확장, 쿼리 `hold` 포함, 회색 "보류" 배지
- `src/pages/teacher/RequestsInbox.tsx` — 마스터 미등록 배지 + 승인 비활성
- `src/pages/teacher/AnalysisRequests.tsx` — 동일
- `src/pages/teacher/TeacherAnalysisReview.tsx` — 동일 + 마스터 저장 후 해당 sentence의 pending 요청 표시

### 기대 결과
- 마스터 없는 문장: 결과가 PASS/FAIL이 아닌 **"보류"** 로 명확히 구분
- 학생은 자유롭게 요청 가능, 마스터 미존재 메시지 노출 0건
- 선생님은 마스터 미등록 요청을 식별하고, 마스터 등록 → 승인 흐름으로 자연스럽게 공유


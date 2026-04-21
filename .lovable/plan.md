

## "특별과제(TASK)" 명칭 통일 + 지문 분석 통/미통 체제 + 미통 재학습 시스템

### 1. 명칭 통일: "복습 TASK" → "특별과제(TASK)"

직전 단계에서 합의한 모든 곳에서 명칭 변경:
- DB 테이블 이름은 기술적 식별자라 `review_tasks` 유지(코드/SQL 안정성)
- 사용자 대면 라벨만 모두 **"특별과제(TASK)"** 로 통일
  - StudentHome 섹션 헤더, 진입 버튼, 토스트, 빈 상태 안내
  - TeacherDashboard / StudentDetail 탭명 → "특별과제 현황"
  - BookshelfUnit 부여 다이얼로그 → "특별과제 부여하기"

---

### 2. 마스터키 시스템 (원장 owner_progress 기반)

**원장 마스터 등록 흐름**
- 원장(admin) 본인이 일반 학습 흐름으로 지문을 분석하면, 그 owner_progress 행이 자동으로 그 지문의 마스터키가 됨
- 별도 UI 불필요. 단, **마스터 미등록 지문**은 통/미통 판정이 불가능하므로 임시로 "기록만 남김(상태 = 통)" 처리하고, BookshelfUnit에 "마스터 미등록" 배지 노출

**일치율 산출 로직 (`src/lib/analysisGrading.ts` 신규)**
```
masterScore(sentenceId, studentUserId):
  master = owner_progress where user_id = (admin) and sentence_id = X
  student = owner_progress where user_id = student and sentence_id = X
  for each owner_id in master:
    완전일치(pos+form+element+role+nounSubrole 등 모든 필드) → 1.0
    부분일치(pos만 같음) → 0.4
    누락/불일치 → 0.0
  return average
```
- `student_profiles.analysis_pass_threshold` 컬럼 추가 (기본 0.8)

---

### 3. 지문 분석 통/미통 판정 (자동)

**판정 시점**: 학생이 SentenceLearn 3단계(단어테스트)까지 완료하는 순간 = 분석 일치율 산출 → DB 기록

**`sentence_attempt_logs` 테이블 신규** (모든 시도를 누적, 덮어쓰기 금지)
| 컬럼 | 타입 |
|---|---|
| id | uuid PK |
| user_id | uuid |
| sentence_id | text |
| attempt_no | int (해당 학생·지문 n번째 시도) |
| analysis_match_rate | numeric (0~1) |
| analysis_passed | boolean (>= threshold) |
| word_test_score | numeric |
| word_test_passed | boolean |
| owner_diff | jsonb (틀린 owner_id 배열 + 학생/마스터 답안) |
| translation_text | text |
| started_at | timestamptz |
| completed_at | timestamptz |
- RLS: 본인 + 스태프 select, 본인 insert

**`sentence_progress.status` 의미 재정의**
- `pass` (분석 일치율 ≥ threshold 이고 단어테스트 통과)
- `fail` (둘 중 하나라도 실패) — 기존 `in_progress` 대체
- `pending` (아직 한 번도 완료 안 함)

---

### 4. 학생 화면: 점수 노출 차단 + 미통 비차단

**WordTestStep RESULT 화면 변경**
- `Math.round(score * 100)점` 숫자 제거
- 큰 배지로 **PASS** 또는 **TRY AGAIN** 만 표시
- 틀린 단어 목록은 그대로 유지(학습 가치)

**SentenceLearn 완료 시점 처리**
- 분석 일치율 + 단어테스트 결과 모두 산출 → `sentence_attempt_logs` insert
- `sentence_progress.status` 업데이트 (`pass` | `fail`)
- 화면: PASS면 "학습 홈으로", FAIL이면 "다음 지문 →" + "이 지문 다시 도전" 두 버튼 모두 노출 (**비차단**)
- `nextSentence.ts`의 `resolveNextSentence`는 `status in ('pass','fail')` 모두를 "완료한 지문"으로 보고 다음으로 진행

**StudentHome 지문 목록**
- 최근 학습 지문에 상태 뱃지: `PASS` (emerald) / `미통` (amber) / `미시작` (muted)
- '미통' 카드에는 **[다시 도전]** 버튼 노출

---

### 5. 미통 재진입 화면 (SentenceLearn 미통 진입 시)

**진입 시 분기**: `sentence_progress.status === 'fail'` 이면 인트로 카드 노출
- **[이전 기록 보기]** → 다이얼로그로 `sentence_attempt_logs` 시간순 표시 (시도 차수, 일치율 PASS/TRY AGAIN, 틀린 owner 수, 일시)
- **[다시 도전하기]** → 기존 owner_progress를 보존한 채 학습 재개. 새 시도는 새 attempt_no로 누적

**힌트 모드 (학생별 토글)**
- `student_profiles.hint_mode_enabled` boolean 컬럼 추가 (기본 false)
- TeacherDashboard 학생 행에 토글 스위치
- ON이고 미통 재진입일 때, **분석 단계 owner 칩**에 직전 시도에서 마스터키와 불일치였던 owner를 amber outline + 작은 ⚠ 배지로 살짝 강조 (단어테스트는 영향 없음)
- 직전 시도의 `owner_diff`를 활용

---

### 6. 선생님 대시보드: 학습 성실도 패널

**StudentDetail (`/teacher/students/:userId`) [전체 히스토리] 탭 강화**
- 지문별 시도 타임라인:
  - 가로 한 줄에 시도들이 chip으로 나열 (1차: TRY AGAIN 78%, 2차: PASS 92%, ...)
  - 일치율 숫자 노출은 **선생님 화면에서만**
- 컬럼: 지문코드 | 첫시도 | 마지막시도 | 시도 수 | 최고 일치율 | 단어테스트 통과율 | 현재 상태
- 상단 요약 카드: 평균 일치율, 미통 지문 수, 평균 시도 수 = "학습 성실도" 지표

**TeacherDashboard 학생 테이블**: 기존 progress 옆에 "미통 N개" 뱃지 추가

---

### 7. 작업 순서

1. DB 마이그레이션
   - `sentence_attempt_logs` 테이블 + RLS
   - `student_profiles.analysis_pass_threshold` (numeric, default 0.8) + `hint_mode_enabled` (bool, default false)
   - `sentence_progress.status` check constraint 갱신 (`pass|fail|pending`)
2. `src/lib/analysisGrading.ts` (마스터키 비교 로직)
3. `src/integrations/supabase/storage.ts`에 `insertAttemptLog`, `fetchAttemptLogs`, `fetchMasterAnswers` 추가
4. WordTestStep result UI 점수 제거 → PASS/TRY AGAIN 배지화
5. SentenceLearn 완료 시점에 attempt log 기록 + status 업데이트
6. SentenceLearn 미통 재진입 인트로 (이전 기록 보기 / 다시 도전)
7. 힌트 모드 hooks → Index 분석 화면 owner 칩 강조
8. StudentHome 카드 미통 뱃지 + 다시 도전
9. StudentDetail 히스토리 탭 + 성실도 요약
10. TeacherDashboard 학생별 hint_mode_enabled 토글
11. 명칭 통일: "복습" → "특별과제(TASK)" 사용자 대면 라벨 일괄 교체

승인하시면 1번부터 순차 진행합니다.


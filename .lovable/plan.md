

## 🏛️ 오프라인 성적 관리 + 일간테스트(종합) 통합 시스템

### 1. DB 설계 — `handout_results` 테이블 신설

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid (학생) | RLS 키 |
| `teacher_id` | uuid | 입력한 선생님 (null 허용) |
| `test_date` | date | 시험 날짜 (기본 today) |
| `session_no` | int | 학습 회차 (학생별, 날짜별 자동 증가) |
| `word_ho_score` | numeric(5,2) | 단어 핸드아웃 0~100 (null 허용) |
| `syntax_ho_result` | text | `'PASS'` / `'FAIL'` (null 허용) |
| `is_integrated` | boolean | 일간테스트(종합) 합산 완료 여부 |
| `created_at` / `updated_at` | timestamptz | |

**제약**: `unique (user_id, test_date)` — 한 학생/하루 한 행.  
**RLS**: 학생은 본인 SELECT, 선생님/관리자는 ALL.  
**보조 함수**: `next_session_no(p_user_id, p_test_date)` — 해당 학생의 직전 `session_no` + 1 자동 산출.

### 2. 선생님 대시보드 UI — 인라인 입력

**위치**: `TeacherDashboard.tsx`의 학생 테이블 우측에 컬럼 2개 추가 (`단어HO` / `구문HO`).

**상단 글로벌 제어 바** (테이블 위):
- 📅 날짜 선택 (shadcn DatePicker, 기본 오늘)
- 🔢 회차 표시 (선택한 날짜 기준 자동 산출, 읽기 전용 배지)
- 🎯 합격 기준 안내 (단어HO 80점 미만 = FAIL)

**행별 인라인 입력**:
- 단어 HO: `<Input type="number" min=0 max=100>` — `onBlur` + `Enter`키로 저장, Enter 시 다음 학생 칸으로 포커스 이동(`useRef` 배열).
- 구문 HO: `[P]` / `[F]` 토글 버튼 한 쌍 — 클릭 즉시 저장.
- 상태 표시: 저장 중 회색 spinner, 완료 시 ✓ 200ms 페이드.

**자동 저장(Auto-save)**: 별도 저장 버튼 없음. `useDebouncedCallback` 300ms로 `upsert` 호출. 실패 시 sonner toast 에러.

### 3. 일간테스트(종합) — 가중 평균 산정

**가중치 (확정)**: 구문분석 40% + 단어테스트 30% + 단어HO 20% + 구문HO 10%

```text
종합점수 =
  (분석률 × 100) × 0.4
+ (단어테스트점수)   × 0.3
+ (단어HO점수)      × 0.2
+ (구문HO PASS=100/FAIL=0) × 0.1
```

**데이터 소스 매핑** (해당 `test_date` 기준):
- 분석률 → `sentence_attempt_logs.analysis_match_rate` 그날 평균
- 단어테스트 → `word_test_results.score` 그날 평균
- 단어HO / 구문HO → `handout_results` 해당 행

**완성 조건**: 4개 값 모두 존재 → `is_integrated=true` 자동 토글.

### 4. 통합 뷰 — 학생 상세 섹션

`TeacherStudents.tsx`의 학생 행 확장(또는 학생 상세 모달)에 **"일간테스트(종합)" 섹션** 추가:
- 날짜별 행: 회차 / 4종 점수 막대(가로 stacked) / 종합점수 / PASS·FAIL 뱃지
- 최근 14일 표시 + 더보기

### 5. 학생 앱 알림 연동

**백엔드 트리거 없이 클라이언트 폴링**: `StudentHome` mount 시 `handout_results`에서 `user_id=me AND (word_ho_score < 80 OR syntax_ho_result = 'FAIL')`인 최근 7일 행 조회.

**UI** (선택된 옵션: 헤더 옆 알림 아이콘 + 배너):
- 헤더 우측: 🔔 빨강 dot 아이콘 (재시 대상 N건)
- 본문 상단: amber 배너 카드
  - "⚠️ {날짜} 단어 핸드아웃 재시험 대상입니다 (점수: 65/100)"
  - "⚠️ {날짜} 구문 핸드아웃 재시험 대상입니다"
  - 닫기(X) 시 localStorage에 `dismissed_<id>` 저장

**완료 축하**: 그날 `is_integrated=true` & 종합점수 ≥ 80 → 첫 진입 시 confetti 1회 + "🎉 오늘의 일간테스트(종합) 완료!" 토스트.

### 6. 회차 자동 산출 정책

- `test_date`별로 학생별 회차 1, 2, 3… 자동 부여
- 같은 날 두 번째 입력은 같은 회차 행에 덮어쓰기 (1일=1회차 고정 방식 채택)
- 회차 표시는 누적 카운트: `select count(*) where user_id=me and test_date <= today` → 직관적 "5회차" 라벨

### 7. 확장성 — 표준 JSON

`handout_results` + 통합 산정 결과를 표준 스키마로 직렬화하는 헬퍼 `src/lib/dailyTestExport.ts`:
```ts
export interface DailyTestRecord {
  schema_version: "1.0";
  student_id: string;
  test_date: string;        // ISO yyyy-mm-dd
  session_no: number;
  scores: {
    online_analysis: number | null;     // 0-100
    online_word_test: number | null;
    offline_word_handout: number | null;
    offline_syntax_handout: "PASS" | "FAIL" | null;
    integrated_total: number | null;    // 가중 평균
  };
  is_integrated: boolean;
  generated_at: string;     // ISO
}
```
미래 '공우정 성장모니터' 앱에서 `select * from handout_results` + 이 직렬화 함수로 즉시 사용 가능.

### 작업 순서

1. **마이그레이션**: `handout_results` 테이블 + RLS + `next_session_no()` 함수
2. **`src/lib/handoutResults.ts`** (신규): CRUD + 회차 산출 + upsert 헬퍼
3. **`src/lib/dailyTest.ts`** (신규): 가중 평균 계산 + 4종 데이터 fetch + 표준 JSON 직렬화
4. **`src/pages/TeacherDashboard.tsx`** 개편:
   - 상단 날짜 선택 바 + 회차 배지
   - 학생 행에 `단어HO` / `구문HO` 인라인 입력 (300ms debounce + Enter 포커스 이동)
5. **`src/components/teacher/DailyTestSummary.tsx`** (신규): 학생별 일간테스트(종합) 표·차트 섹션
6. **`src/pages/TeacherStudents.tsx`** 또는 학생 상세에 위 컴포넌트 임베드
7. **`src/components/student/RetestBanner.tsx`** (신규) + `StudentHome.tsx` 헤더 🔔 아이콘 + 본문 배너 통합
8. **완료 축하 이펙트**: `StudentHome`에 confetti 1회 (canvas-confetti or CSS 키프레임)
9. **검증**: 인라인 입력 → 자동 저장 → 학생 앱 알림 노출 → 4종 충족 시 종합 PASS/축하 흐름 E2E

### 기술 메모

- 회차 자동 산출은 RPC `next_session_no` 또는 클라이언트 select count로 처리 (RPC 권장).
- DatePicker는 shadcn `<Calendar>` + `<Popover>` (pointer-events-auto 적용).
- 자동 저장 실패 시 입력 칸 빨강 테두리 + 재시도 버튼.
- 알림 배너는 `Card` + amber 톤(`bg-amber-50 border-amber-300`).
- Confetti는 라이브러리 추가 없이 `<div>` + CSS 애니메이션으로 가볍게.


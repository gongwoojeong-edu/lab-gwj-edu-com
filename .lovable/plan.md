

## 학습이력 관리 — 선생님 대시보드 우선 구현

학생 화면은 추후 작업하고, 이번에는 선생님이 학생을 한눈에 분석할 수 있는 대시보드 위젯만 구축합니다.

### 구현 범위 (선생님 화면 only)

#### A. 반(전체) 통계 카드 — `TeacherHome` 상단 추가
4개 KPI 카드 가로 배치:
1. **오늘 학습 활동 학생** (n / 전체)
2. **오늘 누적 PASS 문장 수**
3. **오늘 평균 통합점수** (handout_results.integrated_total 평균)
4. **이번 주 활성 학생 수** (최근 7일 내 attempt 1회 이상)

#### B. 학생별 학습 이력 시트 — `TeacherStudents` 행에 "📊 이력" 버튼
버튼 클릭 시 우측에서 슬라이드 인 `Sheet`(반응형: 모바일 풀스크린):

1. **헤더**: 학생명 / 번호 / 현재 레벨·번호 / 시작 레벨
2. **성취 분포 도넛** — `sentence_progress.status` 집계 (PASS/FAIL/진행중)
3. **학습 로드맵 스텝퍼** — L01→L10 가로 10단계, 시작레벨~현재레벨 칠해짐, 현재 위치 핀
4. **레벨별 통합점수 추이 라인차트** — 최근 30일, 레벨별 색상 시리즈 (recharts)
5. **소스별 학습량 스택바** — regular/review/assignment/test 4색, 기간 토글(7/14/30일)
6. **최근 시도 로그 테이블** — `sentence_attempt_logs` 최근 20건 (날짜/문장ID/레벨/소스/PASS여부/매치율)

### 데이터 소스 (마이그레이션 0)

| 위젯 | 쿼리 |
|---|---|
| 반 KPI | `sentence_attempt_logs`, `sentence_progress`, `handout_results` 오늘·주간 집계 |
| 성취 도넛 | `sentence_progress where user_id = X` 그룹바이 status |
| 로드맵 | `student_profiles.start_level/current_level/current_no` + `LEVELS` 상수 |
| 추이 라인 | `handout_results where user_id = X order by test_date desc limit 30` |
| 소스 스택바 | `sentence_attempt_logs` 날짜·attempt_source 그룹 집계 |
| 최근 로그 | `sentence_attempt_logs order by created_at desc limit 20` |

### 신규 / 수정 파일

**신규**
- `src/lib/learningStats.ts` — 집계 헬퍼 (`fetchClassKpis`, `fetchAchievementDistribution`, `fetchLevelTrend`, `fetchSourceBreakdown`, `fetchRecentAttempts`)
- `src/components/stats/AchievementDonut.tsx`
- `src/components/stats/RoadmapStepper.tsx`
- `src/components/stats/LevelTrendChart.tsx`
- `src/components/stats/SourceBreakdownBar.tsx`
- `src/components/stats/ClassKpiCards.tsx`
- `src/components/teacher/StudentHistorySheet.tsx`

**수정**
- `src/pages/teacher/TeacherHome.tsx` — 상단에 `<ClassKpiCards />` 추가
- `src/pages/TeacherStudents.tsx` — 각 학생 행에 "📊 이력" 버튼 + `StudentHistorySheet` 연결

### 기술 메모

- 차트: 이미 설치된 `recharts` + `src/components/ui/chart.tsx` 래퍼 활용
- 신규 라이브러리·DB 마이그레이션 없음
- 학생당 조회량: 최근 90일치 (수백 행) → 클라이언트 집계로 충분
- 학생 화면(`StudentHistory`)은 이번 단계에서 제외 — 추후 동일 위젯 재사용 예정
- 기존 `DailyTestSummary` 위젯은 유지 (단기 일별 표 vs 신규 위젯 = 장기 추세 분석)

### 비고

- 모바일 뷰: KPI 카드 2x2 그리드, 시트 위젯 세로 스택
- 데스크톱: KPI 4열, 시트 내부 차트 2열 그리드
- 권한: 선생님/관리자만 접근 (기존 RLS로 자동 보호)


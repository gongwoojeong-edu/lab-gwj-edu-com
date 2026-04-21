

## 다중 개선 작업 (8개 항목)

### 작업 분류 — 우선순위순

**A. 즉시 가능한 시각/버그 수정 (이번 턴)**
1. 관용구 색상 갈색 → 초록 변경
2. 관용구 지우개 잔상(갈색 음영) 수정
3. 3층 색상 노랑/빨강 변경 — 빨강 채택(현재 amber와 가장 차별화)
4. 일반부사 등 3층 분석 항목 없을 때 2층으로 부배지 표기
5. 학습완료 화면에 "다음 학습" 버튼 추가
6. 답안제출 조건: 분석률 80% + 주절 S·V + 접속절 V 필수

**B. 구조 변경 필요 (이번 턴)**
7. 분석률 학생별 지정 — 이미 `analysis_pass_threshold` 컬럼 존재. 선생님 페이지 UI만 추가

**C. 신규 기능 (이번 턴)**
8. 특별과제 마감일 — `assignments` 테이블 신규 생성 + UI

---

### 1) 관용구 색상: 갈색 → 초록
파일: `src/index.css`
- `--idiom-bg`, `--idiom-border`, `--idiom-fg` HSL을 초록 계열로 교체
  - `--idiom-bg: 145 50% 90%`
  - `--idiom-border: 145 55% 55%`
  - `--idiom-fg: 145 60% 25%`
- 다크 모드도 동일 hue로 매핑
- `IdiomSection` 헤더 이모지 🟫 → 🟩

### 2) 관용구 지우개 잔상 수정
파일: `src/pages/Index.tsx`, `src/lib/idioms.ts`
- 현재 `eraseOwner`는 progressMap만 정리, idiom map은 손대지 않음
- 지우개 클릭 시: 해당 인덱스를 covering하는 idiom도 함께 `removeIdiom` 호출 (cloud + localStorage 동기 제거)
- 추가로 `eraseOwner` 종료 후 단어 인덱스 기반으로 idiom 잔존 검사 → 있으면 제거
- AnalysisPanel의 "관용구 삭제" 경로(line 1423-1427)도 검증

### 3) 3층 색상 변경: amber → 빨강 계열
파일: `src/index.css`
- `--layer-3: 0 75% 55%` (선명한 red)
- `.sub-badge-pill-3` 배경/텍스트/테두리도 red 톤 재조정
  - bg `hsl(0 75% 55% / 0.20)`, color `hsl(0 75% 38%)`, border `hsl(0 75% 55% / 0.7)`
  - num bg `hsl(0 75% 50%)`
- 본문 layer 색칠 hue도 자동 매칭 (변수 단일 소스)

### 4) Layer3 분석 없을 때 → Layer2 부배지
파일: `src/pages/Index.tsx` (badge layer 계산부 ~2472-2481)
- 현재: `innerLayerNum = ownersHere.indexOf(ownerId) + 1` — 외곽부터 1, 2, 3 순
- 문제: 3층 owner가 단순 부사 1개뿐인데 layer3 색(red)으로 표기됨
- 수정: layer 번호 부여 시 "내용물(label)이 있는 owner"만 카운트하도록 보정
  - `meaningfulOwners = ownersHere.filter(oid => buildSubBadgeLabel(progressMap[oid]))`
  - innerLayerNum/outerLayerNum을 meaningfulOwners 기준으로 재계산
- 결과: 3층이 비어 있으면 안쪽 owner는 자동으로 layer2로 표기

### 5) 학습완료 화면에 "다음 학습" 버튼
파일: `src/pages/Index.tsx` (line 2228-2261)
- "모든 학습을 완료했습니다" 화면 하단 버튼 영역에 추가:
  - **다음 학습 →** (primary): `/learn`으로 이동 → resolveNextSentence가 다음 문장 자동 픽업
  - 학생 홈으로 이동: `/learn` 라우트
- allDone 진짜 종료 케이스라도 "처음부터 복습" 같은 fallback은 추후 검토 (이번엔 다음학습 버튼만)

### 6) 답안제출 조건: 80% + 주절 S/V + 접속절 V 필수
파일: `src/lib/analysisGrading.ts`, `src/pages/SentenceLearn.tsx`
- `gradeAnalysis()` 결과에 `requiredOwnersFilled: boolean` 추가
- 마스터키 owner들 중 다음을 "필수 owner"로 식별:
  - 주절 owner (외곽 절이 아닌 owner) 중 element=S, V인 owner
  - 접속절(form="접SV") owner의 element=V 또는 동사 owner
- 학생 progressMap에서 해당 owner들이 모두 `pos !== null`이면 충족
- `analysisPassed = (rate >= threshold) && requiredOwnersFilled`
- 미충족 시 attempt log에 `analysis_passed=false`, 화면에 "주절 S/V·접속절 V는 모두 분석되어야 합니다" 안내

### 7) 분석률 학생별 지정 UI
파일: `src/pages/TeacherStudents.tsx`, `src/lib/studentProfile.ts`
- 이미 DB 컬럼 `analysis_pass_threshold` 존재
- TeacherStudents 테이블에 "분석 통과율" 컬럼 추가 (현재 단어테스트 통과율과 동일 패턴)
- 0.5 ~ 1.0 사이 % 입력 → `student_profiles.analysis_pass_threshold` 업데이트
- 저학년일수록 높게 권장한다는 안내 문구 추가
- 기존 `recordAttempt`는 이미 `profile?.analysis_pass_threshold`를 사용하므로 그대로 동작

### 8) 특별과제 마감일 기능
DB 마이그레이션 + UI
- 신규 테이블 `assignments`:
  - id, teacher_id (uuid), student_id (uuid, nullable=전체), title, description, sentence_id (nullable), due_at (timestamptz), created_at
  - RLS: teacher/admin은 본인 생성건 CRUD, 학생은 자기 student_id 또는 NULL인 행 SELECT만
- `src/pages/teacher/Assignments.tsx` 빈 placeholder를 실제 UI로 교체:
  - 과제 생성 폼 (제목, 대상 학생 select, 마감일 DatePicker, 설명)
  - 기존 과제 리스트 (제목, 학생, 마감일, 남은 시간, 삭제)
- 학생 화면(`StudentHome.tsx`)에 "특별과제" 카드 — 마감일/잔여시간 표시, 클릭 시 해당 sentence로 이동

---

### 작업 순서
1. CSS 색상 (1, 3) 일괄 교체
2. 관용구 지우개 잔상 수정 (2)
3. Layer 번호 보정 (4)
4. 학습완료 다음학습 버튼 (5)
5. 필수 owner 게이트 (6)
6. TeacherStudents 분석률 UI (7)
7. assignments 테이블 마이그레이션 + Assignments 페이지 + 학생홈 카드 (8)

### 검증 (end-to-end)
- 관용구 등록 → 초록색 표시 → 지우개로 단어 클릭 → 갈색/초록 음영 모두 사라짐
- 3층 owner 분석 결과 부배지·본문 색이 빨강 계열로 표시
- 일반부사만 있는 단순 문장에서 부사 부배지가 layer2 색상(보라)으로 표시
- 학생 화면에서 분석률 80% 미만이거나 주절 S/V/접속절 V 누락 시 word-test 통과해도 fail 처리
- 선생님이 학생 분석률을 70%로 변경 → 해당 학생만 70% 게이트 적용
- 선생님이 마감일 있는 과제 생성 → 학생홈에 표시 → 클릭하면 해당 문장으로 이동
- 학습 완료 화면에서 "다음 학습" 클릭 → /learn → 다음 문장 자동 진입 (있으면) 또는 다시 완료 화면


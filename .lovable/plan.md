

## 학생 헤더 정리 + 분석기 선생님 PIN 통과 기능

### 1) 학생화면 헤더 모드 표시 정리

**대상 파일**: `src/pages/StudentHome.tsx`, `src/pages/SentenceLearn.tsx`, `src/pages/Index.tsx`

**변경 내용**:
- "🛠 선생님 화면" 큰 버튼 → 작은 텍스트 링크로 교체
- "학생 모드" 라벨 칩 제거 (헤더 자체가 학생화면임을 의미)
- 우측 상단 표기 형식:
  ```
  [streak/점수 칩]  선생님 화면으로 이동  [로그아웃]
  ```
  - 텍스트 링크 스타일: `text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline`
  - 클릭 시 `setMode("teacher")` + `navigate("/teacher")`
  - staff(teacher/admin) 권한자에게만 표시 (기존 조건 유지)
- `Index.tsx` 내 `UserMenu`의 "선생님" 링크와 상단 "선생님 모드" Link도 동일 스타일로 통일

### 2) 분석기 선생님 PIN 통과/스킵 기능

**신규 컴포넌트**: `src/components/learning/TeacherAnalysisOverride.tsx`
- 기존 `TeacherSkipButton`(단어 학습용)과 같은 PIN 검증 로직 재사용
- `student_profiles.teacher_pin`을 조회/대조
- PIN 일치 시 `onApproved()` 호출

**호출부**: `src/pages/SentenceLearn.tsx`의 `recordAttempt()` 흐름에 통합

**동작 시나리오**:
- 학생이 word test를 통과했지만 분석 게이트(`grade.hasMaster && (분석률 부족 OR 필수 owner 누락)`)에 막혀 `overallPass = false`로 판정될 때
  - 결과 화면에 "선생님 확인 후 통과" 버튼 노출
  - 선생님이 PIN 입력 → `analysisPassed = true`로 강제 → `overallPass = true` → `sentence_progress.status = "pass"`로 업데이트
  - `sentence_attempt_logs`에 새 row 추가: `analysis_passed: true`, `owner_diff`에 `{teacherOverride: true}` 메타 포함
- 분석 진행 중에도 사용 가능 (분석 패널 헤더 우측에 작은 "선생님 확인 후 스킵" 텍스트 버튼)
  - 클릭 → PIN 입력 → 즉시 word test 단계로 점프 (분석률 검증 우회)
  - `Index.tsx`에서 `analysisDone` flag를 강제 true로 설정하는 콜백 prop 추가

**호출 위치 두 곳**:
1. **`SentenceLearn.tsx` 결과 카드**: word test 결과 표시 영역 (Fail 표시 부근)에 작은 "선생님 확인 후 통과" 버튼 추가
2. **`Index.tsx` 분석 화면 상단**: 기존 사이드바/툴바 영역에 "선생님 확인 후 분석 스킵" 텍스트 버튼 추가

### 3) UI 디자인 (PIN 다이얼로그)

기존 `TeacherSkipButton`의 다이얼로그 패턴을 그대로 따름:
- 타이틀: "선생님 패스키"
- 설명: "분석 결과에 견해차가 있을 때 선생님 확인 후 통과 처리합니다"
- 4-6자리 숫자 입력
- PIN 미설정 시 안내 + 비활성화

### 4) 데이터 흐름

```text
[분석 게이트 막힘 / 견해차]
   ↓
[학생: 선생님 호출]
   ↓
[선생님 PIN 입력]
   ↓
[검증 OK]
   ↓
- attempt_log: analysis_passed=true, owner_diff에 teacherOverride 메타
- sentence_progress: status="pass", passed_at=now
- 화면: PASS 처리, 다음 학습 버튼 활성화
```

### 작업 순서
1. `StudentHome.tsx` / `SentenceLearn.tsx` / `Index.tsx` 헤더에서 "🛠 선생님 화면" 버튼을 작은 텍스트 링크로 교체, "학생 모드" 칩 제거
2. `TeacherAnalysisOverride.tsx` 신규 작성 (PIN 검증 + 다이얼로그)
3. `SentenceLearn.tsx`의 fail 결과 화면에 "선생님 확인 후 통과" 버튼 + handler 추가 (`recordAttempt`에 force flag 옵션)
4. `Index.tsx` 분석 단계 헤더에 "선생님 확인 후 스킵" 버튼 추가 → analysisDone 강제 true 콜백
5. `SentenceLearn.tsx`에서 그 콜백 받아 `step="post"`로 전환

### 검증 (end-to-end)
- 학생화면(`/learn`, `/learn/sentence/s1`) 헤더에 큰 "선생님 화면" 버튼이 사라지고 작은 텍스트 링크만 보임
- 일부 owner만 분석한 채 word test 통과 → 결과 화면에 "선생님 확인 후 통과" 버튼 노출
- 잘못된 PIN → 거부 토스트, 입력 칸 리셋
- 올바른 PIN → 즉시 PASS 처리, sentence_progress.status="pass", 다음 학습 버튼 표시
- 분석 중 "선생님 확인 후 스킵" → word test 단계로 즉시 진입


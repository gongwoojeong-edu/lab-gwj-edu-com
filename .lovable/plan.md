

# 단어 테스트기 1단계: 테스트 + 통과 포인트

## 범위 (이번 라운드)
- 오늘학습용 단어 테스트 본체 (스펠링 / 뜻쓰기 초성힌트 / 혼합)
- 학생별 통과 커트라인 개별 설정
- 재시험 강제: 통과 못하면 틀린 단어만 WordPreStep 4단계 재사용 → 끝나야 재시험 버튼 활성화
- 통과 포인트 자동 지급 + 학생 홈에 연속 통과(불꽃 🔥) 표시
- (다음 라운드로 미룸: 누적 시험지, B5 출력, 인쇄 대기열, QR, 출력 로그)

---

## 1. DB 스키마 변경

```text
student_profiles  
  + word_test_pass_threshold  numeric  default 0.8     // 학생별 커트라인
  + points                    integer  default 0       // 누적 포인트
  + current_streak            integer  default 0       // 연속 통과
  + best_streak               integer  default 0

word_test_results (기존 — 컬럼 추가)
  + mode             text   default 'mixed'   // 'spell' | 'meaning' | 'mixed'
  + attempt_no       integer default 1        // 1=첫 시험, 2+ = 재시험
  + wrong_words      jsonb  default '[]'      // [{word, expected, given}]
  + remediation_done boolean default false    // 틀린단어 복습 완료 여부

points_log (신규)
  id uuid pk, user_id uuid, sentence_id text,
  delta integer, reason text,                 // 'word_test_pass' | 'streak_bonus'
  created_at timestamptz default now()
  RLS: 본인 SELECT, 본인 INSERT, teacher/admin SELECT
```

`sentence_progress.word_test_done` 는 이미 존재 — 통과 시 `true` + `status='pass'` + `passed_at` 저장.

---

## 2. 새 파일 / 수정 파일

```text
NEW  src/lib/wordTest.ts
       - WordTestMode = 'spell' | 'meaning' | 'mixed'
       - buildQuestions(entries, mode) → Question[]
       - normalize / 채점 헬퍼 (한/영 분리)
       - 초성힌트 생성: ㄱㄴㄷ... 자모 첫 분해

REWRITE src/components/learning/WordTestStep.tsx
       - 모드 선택 UI (학생 본인 + 시작 버튼)
       - 한 단어씩 큰 카드, 입력 → 즉시 채점 → 다음 단어
       - 결과 카드: 점수 / cutoff 비교 / PASS·FAIL
       - PASS  → insertWordTestResult + grantPassReward + onPassed
       - FAIL  → 틀린단어 표시 + '틀린단어 복습 시작' 버튼
       - 복습 단계: <WordPreStep entries={wrongOnly} ... /> 임베드,
                    completed 콜백 → remediation_done=true 저장 → '재시험' 활성화
       - 재시험은 attempt_no+1 로 새 시도

NEW  src/lib/rewards.ts
       - grantPassReward(sentenceId, score)
         → student_profiles points += basePoints
         → current_streak += 1, best_streak = max
         → points_log insert
         → sentence_progress { word_test_done:true, status:'pass', passed_at:now }
       - resetStreakOnFail() : current_streak = 0

UPDATE src/integrations/supabase/storage.ts
       - insertWordTestResult: mode, attempt_no, wrong_words, remediation_done
       - fetchAttemptCount(sentenceId)
       - fetchStudentRewards(): { points, current_streak, best_streak, threshold }

UPDATE src/pages/SentenceLearn.tsx
       - 'post' 단계 placeholder 교체 → <WordTestStep ... onPassed={() => navigate('/learn')} />

UPDATE src/pages/StudentHome.tsx
       - 헤더 우측에 🔥 streak 칩 + 💎 points 칩
       - 통과 직후 진입 시 toast '🎉 +N 포인트 / 🔥 연속 N회'

UPDATE src/pages/TeacherStudents.tsx
       - 학생별 [통과 커트라인] 입력 (50~100%, 기본 80%)
       - 저장 → student_profiles.word_test_pass_threshold
```

---

## 3. 학생 단어 테스트 흐름

```text
[Step 3 진입]
   │
   ▼
시작 화면 ─ 모드 선택 (스펠링 / 뜻쓰기 / 혼합) + cutoff 표시
   │
   ▼
문제 카드 × N      ← 단어별 입력, Enter로 다음
   │
   ▼
결과 (score / cutoff)
   ├─ PASS → 포인트 +N, 🔥 streak +1, sentence pass 저장 → 학습홈
   └─ FAIL → 틀린단어 N개 표시
              │
              ▼ (필수)
          틀린단어 복습 (WordPreStep 임베드 — 4단계)
              │ remediation_done=true
              ▼
          [재시험] 버튼 활성화 → attempt_no+1 로 위 흐름 반복
```

---

## 4. UX / 디자인 (Dark Violet 포인트만 살짝)
- 모드 선택 칩: outline 기본, 선택 시 `bg-primary text-primary-foreground`
- 진행도 바: primary 그라데이션 (얇게)
- PASS 도장: 기존 WordPreStep과 동일 스타일 재사용
- 🔥 streak 아이콘: amber, 포인트는 primary tint
- cutoff/현재 점수 비교: PASS는 emerald, FAIL은 destructive

---

## 5. 채점 규칙
- **스펠링**: 대소문자/공백 무시. 정확히 일치해야 정답.
- **뜻쓰기 초성힌트**: 정답 한글의 초성만 노출 (예: "사과" → "ㅅㄱ"). 입력은 기존 `isAnswerCorrect`(쉼표/슬래시 분리, 부분일치) 재사용.
- **혼합**: 단어마다 랜덤으로 스펠링 또는 뜻 출제.

---

## 6. 포인트 규칙 (1단계 기본값)
- 첫 시도 통과: **+10**
- 재시험 통과: **+5**
- 100점 보너스: **+5**
- 연속 5회 통과 보너스: **+20**

(추후 선생님이 조정 가능하도록 상수화)

---

## 7. 다음 라운드(이번 작업에서 제외)
누적 시험지 빌더, B5 print 레이아웃, QR(원어민 발음 + 정답지), 인쇄 대기열(선생님 승인), 출력 로그, 사운드 알림 — 별도 라운드로 분리.


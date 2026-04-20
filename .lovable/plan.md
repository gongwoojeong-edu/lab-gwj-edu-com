

## 음성 인식 안전망 + 음절 재생 + 진행 바 두께 + 선생님 패스키

### 1. 10회 안전망 + **선생님 패스키 스킵** (②발화, ④의미인출)

#### 자동 안전망 (10회)
- ②/④ 단계에서 시도 카운터 표시: `시도 N/10`.
- 5회 도달 시 보조 안내 토스트("발음이 어려우면 천천히 또박또박").
- 10회 도달 시 자동으로 "기록 후 다음으로" → 점수 **70**, `stuck=true` 플래그 → 다음 단계로 진행.

#### 선생님 패스키 (조기 스킵)
- 패널 우측 하단에 작은 **"선생님 확인 후 스킵"** 버튼(자물쇠 아이콘).
- 클릭 시 PIN 입력 다이얼로그 → 선생님이 4자리 PIN 입력 → 일치하면 즉시 통과 처리.
- 통과 점수 = **90** (정상 통과 하한), `teacherSkipped=true` 플래그 → 정상 패스로 인정.
- 시도 횟수 무관하게 어느 시점이든 사용 가능 (학생이 너무 막히면 옆에서 선생님이 풀어주는 동선).

#### PIN 관리
- **저장 위치**: `student_profiles` 테이블에 `teacher_pin` 컬럼(text, nullable, 기본 `null`) 추가 → 선생님 대시보드의 학생 행에서 직접 설정.
- 학생별 PIN 이라 한 교실에서 학생끼리 알아내도 다른 학생 화면엔 안 통함.
- PIN 미설정 학생 → "선생님 확인 후 스킵" 버튼 비활성화 + "선생님께 PIN 설정 요청" 안내.
- PIN 검증은 클라이언트에서 `student_profiles.teacher_pin` 과 단순 일치 비교 (RLS로 자기 자신 row 만 SELECT 가능).
- 보안 등급은 "교실 안전망" 수준이며 강한 보안이 필요한 값은 아님(학습 흐름 보조 용도).

#### 결과 기록
- 컴포넌트 로컬 누적: `assistEntries: { word, stage, type: "stuck" | "teacher_skip", attempts, lastHeard? }[]`.
- 단어 학습 완료 시 `word_pre_results.unknown_words` 와 별도 컬럼 `assist_log`(jsonb, 신규) 에 저장.
- 선생님 대시보드 표시는 후속 라운드에서 추가.

### 2. 음절 1단계 — 마지막 음절 + 통단어 순차 재생 보장

**현재 버그**: 마지막 음절 클릭 → 즉시 `useEffect` 가 통단어 재생 → `speechSynthesis.cancel()` 로 마지막 음절 음성이 잘림.

**수정 (`SyllablePanel.tsx`)**:
- 자동 트리거 `useEffect` 제거.
- `playOne` 안에서 `speakChunk` 의 `onend` 콜백 활용:
  - 클릭 후 마지막 미클릭 음절이 사라지는 시점이면, **음절 음성이 끝난 직후 350ms** → `speakWord(word)` 실행.
  - 통단어 음성의 `onend` 직후 800ms → `onFinish(100)`.
- 한 음절짜리 단어/빈 분리는 통단어 1회만 재생 후 통과.

> 구현 세부: 기존 `speakChunk` 가 `onend` 를 노출하지 않으면 `src/lib/syllables.ts` 시그니처를 `speakChunk(text, opts, onEnd?)` 로 확장.

### 3. 4개 진행 바 두께 강화 (`WordStageProgressBar.tsx`)

| 요소 | 변경 |
|------|------|
| 단계 채움 바 | `h-2` → **`h-4`**, `rounded-full` 유지 |
| 라벨/점수 글자 | `text-xs` → **`text-sm font-semibold`** |
| 좌측 펄스 점 | `w-1.5 h-1.5` → **`w-2.5 h-2.5`** |
| 전체 진척 바 | `h-1.5` → **`h-2.5`** |
| 그리드 간격 | `gap-3` → `gap-4`, 컨테이너 `py-3` → `py-4` |
| 모바일 | 동일 두께 유지 (가독성 우선) |

### 패스 판정 (업데이트)

- ① 음절 / ③ 스펠링: 점수 **≥ 90** 이어야 통과.
- ② 발화 / ④ 의미: 점수 **≥ 90 OR `stuck=true`(10회) OR `teacherSkipped=true`(PIN)** 이면 통과.
- 4단계 모두 통과 → 단어 PASS → 다음 단어.

### DB 마이그레이션

```sql
ALTER TABLE student_profiles ADD COLUMN teacher_pin text;
ALTER TABLE word_pre_results ADD COLUMN assist_log jsonb DEFAULT '[]'::jsonb;
```

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/lib/syllables.ts` | `speakChunk` 에 `onEnd` 콜백 매개변수 추가 |
| `src/components/learning/panels/SyllablePanel.tsx` | 자동 useEffect 제거, `onend` 체이닝으로 마지막 음절→통단어→`onFinish` 순차 |
| `src/components/learning/panels/SpeakPanel.tsx` | 시도 카운터 노출, 10회 안전망(점수 70 + stuck), 선생님 PIN 스킵 다이얼로그 (점수 90 + teacherSkipped). `onFinish(score, { stuck?, teacherSkipped? })` |
| `src/components/learning/panels/MeaningPanel.tsx` | 동일 안전망 + PIN 스킵 적용 |
| `src/components/learning/WordPreStep.tsx` | `onFinish` 두 번째 인자 처리: stuck/teacherSkipped 인 경우 단어 패스 인정. `assistEntries` 누적 후 `word_pre_results.assist_log` 에 저장 |
| `src/components/learning/WordStageProgressBar.tsx` | 바/라벨/점 두께 상향 |
| `src/lib/wordPre.ts` | `insertWordPreResult` 시그니처에 `assistLog` 추가 |
| `src/pages/TeacherStudents.tsx` | 학생 행에 "PIN 설정" 버튼 + 다이얼로그(4자리 입력 → `student_profiles.teacher_pin` 업데이트) |
| supabase/migrations | 위 SQL 마이그레이션 |


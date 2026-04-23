

## 플랜 — 즉시 저장 + 실시간 표시 + 정체 학생 추적

### 1. DB 마이그레이션

`sentence_progress` 테이블에 컬럼 추가:
- `analysis_match_rate numeric DEFAULT NULL` — 분석 일치율 (즉시 저장용)
- `last_activity_at timestamptz DEFAULT now()` — 마지막 단계 활동 시각 (정체 판단 기준)

Realtime 활성화:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.sentence_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.word_test_results;
```

### 2. 각 단계별 즉시 저장 (SentenceLearn.tsx)

현재 상태: 단어테스트(`insertWordTestResult`)는 이미 즉시 저장됨. 분석 점수와 활동 시각은 한글해석 제출까지 대기 중.

**변경 내용:**
- **단어학습 완료 시**: `upsertSentenceProgress(id, { pre_done: true, last_activity_at: now })` — 이미 `pre_done`은 저장 중, `last_activity_at` 추가
- **단어테스트 통과 시**: `upsertSentenceProgress(id, { word_test_done: true, last_activity_at: now })` 추가
- **분석 통과 시**: `upsertSentenceProgress(id, { analysis_done: true, analysis_match_rate: rate, last_activity_at: now })` 추가
- **한글해석 제출 시**: 기존 `recordAttempt` 로직 유지 (최종 `sentence_attempt_logs` 기록)

이렇게 하면 선생님 화면에서 `sentence_progress` 또는 `word_test_results`를 쿼리하면 중간 단계 결과도 즉시 확인 가능.

### 3. 선생님 화면 실시간 반영 (TeacherHome.tsx)

**Realtime 구독 추가:**
- `sentence_progress` 테이블의 UPDATE 이벤트 구독
- `word_test_results` 테이블의 INSERT 이벤트 구독
- 변경 감지 시 해당 과제의 `fetchAssignmentProgress`를 re-fetch
- 수동 **새로고침 버튼** 추가 (과제 섹션 우측 상단)

**`fetchAssignmentProgress` 보강:**
- 분석 점수 소스: 기존 `sentence_attempt_logs`에 더해 `sentence_progress.analysis_match_rate`도 fallback으로 활용 (attempt log가 없어도 분석 점수 표시)

### 4. 정체 학생 추적

**정체 정의 (두 가지 분류):**
1. **장기 정체**: `last_activity_at`이 3일 이상 경과 + 아직 `translation_done = false`인 학생
2. **마감 임박 미완료**: 과제 `due_at`이 24시간 이내인데 모든 단계를 끝내지 못한 학생

**TeacherHome 요약 카드:**
- 기존 KPI 카드 아래에 "정체 학생" 알림 카드 추가
- 장기 정체 N명 / 마감 임박 미완료 N명 표시
- 각 학생의 **마지막 완료 단계 + 단어테스트 점수** 미리보기 (상위 5명)
- "전체 보기 →" 링크로 상세 페이지 이동

**신규 페이지: `/teacher/stalled`**
- 장기 정체 섹션 + 마감 임박 섹션 분리
- 각 학생별: 이름, 과제명, 마지막 활동 시각, 완료된 단계 배지, 단어테스트 점수
- 정렬: 가장 오래 정체된 순
- "독려 메시지 보내기" 등은 추후 확장 영역

### 5. 변경/생성 파일 요약

| 구분 | 파일 | 내용 |
|------|------|------|
| 마이그레이션 | `supabase/migrations/` | `sentence_progress` 컬럼 추가 + realtime 활성화 |
| 수정 | `src/pages/SentenceLearn.tsx` | 각 단계 완료 시 `upsertSentenceProgress` 호출에 `last_activity_at` 포함 |
| 수정 | `src/lib/assignmentProgress.ts` | 분석 점수 fallback 소스 추가 (`sentence_progress.analysis_match_rate`) |
| 수정 | `src/pages/teacher/TeacherHome.tsx` | Realtime 구독 + 새로고침 버튼 + 정체 학생 요약 카드 |
| 신규 | `src/pages/teacher/StalledStudents.tsx` | 정체 학생 상세 페이지 |
| 수정 | `src/App.tsx` | `/teacher/stalled` 라우트 추가 |
| 수정 | `src/components/teacher/TeacherLayout.tsx` | 사이드바에 "정체 학생" 메뉴 추가 |

### 6. 기대 결과

- 학생이 단어테스트만 끝내도 선생님 화면에 점수가 바로 보임
- 분석만 통과한 상태에서도 일치율이 즉시 반영됨
- 3일 이상 다음 단계로 넘어가지 못한 학생이 자동 리스트업
- 마감 24시간 전 미완료 학생도 별도 경고


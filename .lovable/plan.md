# 문장 건너뛰기(스킵) 기능

## 정리된 요구사항
- 스킵은 **선생님 PIN 확인**이 있어야 실행됨 (학생 임의 스킵 불가)
- 스킵한 문장은 **별도 상태로 기록** — 통과(pass)와 구분되어 보임
- **언제든 스킵 해제** 가능 → 해제하면 그 문장이 다시 학습 대상으로 돌아옴
- 스킵 지정 시 **학생 명단에서 여러 명 선택** 가능 (한 지문을 여러 학생에게 한 번에 스킵)

## 학생 화면에서
- 학습 화면(구문/암기) 상단에 "선생님 확인 후 이 문장 건너뛰기" 버튼 추가
- 누르면 기존 선생님 패스키(PIN) 창이 뜨고, 일치할 때만 스킵 처리
- 스킵되면 그 문장은 진도에서 빠지고 바로 다음 문장으로 이동
- 이미 스킵된 문장에 들어오면 "선생님이 건너뛰기로 지정한 문장" 안내 표시

## 선생님 화면에서
- 학생목록의 기존 "단어학습 스킵 관리" 창을 **스킵 관리**로 확장: 지문별로 `단어학습 스킵` / `문장 전체 스킵` 두 가지 토글
- 새 **문장 스킵 일괄 지정** 창 추가
  - 교재 보관함 유닛/지문 화면과 학습결과 화면에서 열기
  - 위쪽: 대상 지문(현재 유닛 지문 목록에서 다중 선택)
  - 아래쪽: **학생 명단 다중 선택**(검색 + 전체선택, 우리 반 학생 기준)
  - 버튼: `스킵 지정` / `스킵 해제`
- 학습결과·워크북 목록에서 스킵 문장은 회색 "스킵" 배지로 표시하고, 진행률 분모에서 제외

## 기술 메모
- `student_passage_overrides` 에 `skip_sentence boolean not null default false` 컬럼 추가 (마이그레이션). 기존 `skip_pre` 와 같은 행 사용, `user_id,sentence_id` 유니크 유지
- `src/lib/studentPassageOverrides.ts`: `upsertSkipSentence`, `bulkSetSkipSentence(userIds, sentenceIds, value)`, `fetchSkippedSentenceIds(userId)` 추가
- `src/lib/nextSentence.ts`: 진도 후보 필터에 스킵 지문 제외(일반 진도 + 특별과제 경로 모두). 스킵 해제 시 자동으로 후보 복귀
- `src/lib/learningStats.ts` / 진행률 계산: 스킵 문장을 분모에서 제외하고 "스킵 n" 별도 표기
- 학생 스킵 버튼은 기존 `TeacherSkipButton`(PIN 창) 재사용, 승인 시 `upsertSkipSentence` 후 다음 문장 이동
- 새 컴포넌트 `src/components/teacher/SentenceSkipBulkDialog.tsx` (지문 다중 × 학생 다중)
- RLS: 기존 `student_passage_overrides` 정책 유지(교사/관리자 쓰기, 학생 본인 읽기)

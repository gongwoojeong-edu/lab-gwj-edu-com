# 승인 평가에 "코칭 필요(조건부 통과)" 옵션 추가

## 목표
재학습(redo)을 시킬 정도는 아니지만 어색한 해석 등 교정이 필요한 문장을, 승인하면서도 "워크북에서 제대로 다시 써보기" 대상으로 표시하는 흐름을 추가한다.

## 동작 방식
1. 선생님 승인 창(`TeacherApprovalDialog`)의 등급 선택에 **"코칭"** 버튼 추가
   - 위치: 기존 5개 등급(매우잘함/잘함/보통/미흡/재학습) 뒤에 6번째로
   - 색상: 보라 계열 배지 (기존 등급과 구분)
2. **코칭 등급으로 승인하면**
   - 문장은 통과(pass) 처리 — 학생은 다음 문장으로 진행 (재학습과 달리 막지 않음)
   - `sentence_progress.coach_flagged_at` + `last_coach_memo` 기록 (워크북 코칭 대상 표시)
   - 학생 알림함: "선생님 코멘트 — 워크북에서 다시 써보기" 메시지 + 메모 전달
3. **학생 화면 표시**
   - 알림을 누르면 해당 문장 첨삭 보기로 이동 (기존 평가 알림과 동일)
   - 유닛/문장 목록에서 코칭 대상 문장에 작은 보라 배지(선택 사항 — 2단계)
4. **선생님 화면 표시**
   - 승인 대기/이력 목록의 등급 배지에 "코칭" 표시
   - 워크북 미리보기/인쇄 시 코칭 대상 문장 목록을 모아볼 수 있는 필터는 이번 범위에서 제외(필요 시 후속)

## 데이터 변경
- `sentence_approvals.grade` 체크에 `coach` 값 허용 (CHECK 제약이 있으면 마이그레이션으로 추가)
- `sentence_progress`에 `coach_flagged_at timestamptz`, `last_coach_memo text` 컬럼 추가
- 새 테이블 없음 — 기존 승인/진도 테이블 확장만

## 코드 변경 (프론트)
- `src/lib/sentenceApprovals.ts`
  - `ApprovalGrade`에 `"coach"` 추가, `GRADE_LABEL`(코칭), `GRADE_BADGE_CLASS`, `GRADE_ORDER` 갱신
  - `approveSentenceRequest`: coach는 pass 처리 + `coach_flagged_at`/`last_coach_memo` 기록, redo_requested_at은 건드리지 않음
  - 알림 문구: "선생님 코칭 — 워크북에서 다시 써보세요"
  - `applyApprovalToMyProgress`: coach 승인 시 pass + 코칭 플래그 반영
- `src/components/learning/TeacherApprovalDialog.tsx`: 등급 버튼 목록에 "코칭" 추가
- `src/lib/studentNotifications.ts` 또는 알림 표시 쪽: coach 등급 문구 처리
- 타입(`src/integrations/supabase/types.ts`)은 자동 생성이므로 컬럼 추가 후 갱신 확인

## 기술 메모
- 기존 `grade` 컬럼이 text + CHECK 제약인지 먼저 확인하고, 제약이 있으면 `ALTER ... DROP/ADD CONSTRAINT` 마이그레이션 포함
- 통계/리포트(`EvaluationReports`, `LearningResults`)에서 coach는 "통과"로 집계되도록 기존 pass 기준 로직 확인
- 타입 검사: `bunx tsgo --noEmit`

## 확인 필요
- 배지 색상/문구("코칭" 외 다른 이름 선호 시 변경 가능)

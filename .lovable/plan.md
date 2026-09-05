# 승인 평가에 "코칭(조건부 통과)" 옵션 추가

## 배경 확인 결과
- **재학습(redo)은 이미 한글해석만 다시 합니다.** 선생님이 redo로 승인해도 분석·단어·통과 기록은 그대로 유지되고, 학생 화면에 "추가학습 시작 — 한글 해석 다시 제출" 버튼만 뜨며 누르면 해석 단계로 바로 갑니다. 별도 수정 불필요(분석 검수 강화는 별도 과제로).
- `sentence_approvals.grade`에는 허용 값 목록 제약이 있어, 새 등급 추가 시 DB 변경이 필요합니다.

## 목표
재학습을 시킬 정도는 아니지만 교정이 필요한 문장을, 통과시키면서 "워크북에서 제대로 다시 써보기" 대상으로 표시하는 **코칭** 등급을 추가한다.

## 동작 방식
1. 선생님 승인 창 등급 버튼에 **"코칭"** 추가 (기존 5개 등급 뒤, 보라 계열 배지)
2. 코칭으로 승인하면
   - 문장은 통과 처리 — 학생은 다음 문장으로 바로 진행
   - 코칭 대상 표시(`coach_flagged_at`, `last_coach_memo`)를 진도에 기록
   - 학생 알림: "선생님 코칭 — 워크북에서 다시 써보세요" + 메모 전달
3. 학생 화면: 기존 평가 배너처럼 코칭 배지+코멘트 확인 후 다음 문장 이동
4. 선생님 화면: 승인 이력 목록에서 "코칭" 배지로 구분 표시

## DB 변경 (마이그레이션)
- `sentence_approvals` grade 허용 값에 `coach` 추가 (기존 CHECK 제약 교체)
- `sentence_progress`에 `coach_flagged_at`, `last_coach_memo` 컬럼 추가
- 새 테이블 없음

## 코드 변경
- `src/lib/sentenceApprovals.ts`: 등급 타입/라벨/배지에 coach 추가, 승인 시 통과 처리 + 코칭 플래그 기록, 알림 문구
- `src/components/learning/TeacherApprovalDialog.tsx`: 등급 버튼 추가
- `src/pages/SentenceLearn.tsx`·`src/components/student/RedoAlertBar.tsx`: coach는 재학습 알림 대상에서 제외, 평가 배너 문구 확인
- 승인 후 `applyApprovalToMyProgress`에 코칭 플래그 반영

## 기술 메모
- 통계/리포트에서 coach는 "통과"로 집계되는지 기존 로직 확인 후 맞춤
- 타입 검사: `bunx tsgo --noEmit`
- 배지 이름/색상은 구현 중 조정 가능

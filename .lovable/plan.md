## 정책 변경

**현재(초기화형):** 재학습 등급 → `sentence_progress.status = fail` 로 되돌림. 통과 기록 무효화.

**변경(추가학습형):** 재학습 등급 → 기존 통과 기록(`status=pass`, `passed_at`, `*_done`, `last_grade`) **그대로 유지**. 별도 플래그 `redo_requested_at` 만 켜서 학생에게 "한 번 더 제출" 요청.

학습이력(`sentence_attempt_logs`, `sentence_approvals`)은 이미 attempt_no 가 증가하며 매번 별도 행으로 누적되므로, 추가 제출은 기존 기록 위에 덧붙는 구조가 자동으로 보장됩니다.

## 작업 항목

1. **DB 스키마**
   - `sentence_progress` 에 `redo_requested_at timestamptz` 컬럼 추가
   - `last_redo_memo text` 컬럼 추가 (가장 최근 추가학습 사유 메모, 학생 화면 안내용)

2. **승인 로직 (`src/lib/sentenceApprovals.ts`)**
   - `redo` 등급 처리를 다음과 같이 변경:
     - `status`, `passed_at`, `*_done` 플래그는 절대 손대지 않음
     - `redo_requested_at = now()`, `last_redo_memo = memo`, `last_grade = 'redo'` 만 갱신
   - `redo` 가 아닌 등급으로 승인되면 `redo_requested_at = null` 로 해제 (요청 충족 처리)

3. **학생 알림**
   - 기존 evaluation 알림에 "한 번 더 제출해주세요" 문구 추가
   - 알림 클릭 시 해당 문장으로 이동 (이미 동작)

4. **학생 화면 — `SentenceLearn`**
   - `status='pass'` + `redo_requested_at` 존재 시 상단에 호박색 배너:
     "선생님이 추가학습을 요청했습니다 — {메모}" + [다시 제출하기] 버튼
   - 다시 제출 모드에서는 한글 해석 패널을 다시 활성화. 제출 시 `createApprovalRequest` 가 attempt_no+1 새 행 생성 (기존 코드 그대로 동작)
   - 통과 상태(녹색 완료 표시)는 유지 — 학생이 "추가 학습이지 초기화가 아님"을 시각적으로 인지

5. **학생 홈 (`StudentHome`)**
   - 특별과제 카드 아래 "추가학습 요청" 섹션 추가 — `redo_requested_at` 이 있는 문장 목록과 빠른 진입 버튼

6. **다이얼로그 문구 (`TeacherApprovalDialog`)**
   - 버튼: "재학습으로 되돌리기" → **"추가학습 요청 보내기"**
   - 안내: "기존 통과 기록은 유지되며, 학생이 한 번 더 제출하게 됩니다."
   - 토스트: "추가학습 요청을 보냈어요"

## 영향 범위

- 통과율/완료 카운트는 영향 없음 (status=pass 유지)
- 캘린더/학습이력 페이지는 그대로 — 매 attempt 가 별도 행으로 이미 표시됨
- 기존에 `status=fail` 로 되돌려놓은 과거 redo 건은 그대로 둠 (소급 변경 X)

# 마스터 미등록 → 즉시 마스터키 등록 후 정답공개

## 현재 동작 (확인됨)
- 정답보기(자료열람) 요청의 승인 버튼은 `fetchMasterAvailability` 결과가 없으면 비활성 + "마스터 미등록" 뱃지만 표시된다(`RequestsInbox.tsx`, `TeacherAnalysisReview.tsx`).
- 마스터키 = **admin 계정의 `owner_progress`** 행이다(`analysisGrading.ts`). 즉 관리자 계정이 해당 지문을 학습화면에서 직접 분석해 저장하면 마스터키가 생긴다. 현재는 그 화면으로 가는 링크가 어디에도 없다.

## 추가할 것

### 1) "마스터 등록" 버튼
마스터가 없는 정답보기 요청 카드에 주황색 **[🔑 마스터 등록]** 버튼 추가.
- 클릭 → 새 탭으로 `/learn/sentence/{sentence_id}?master=1` (해당 지문 분석 화면) 오픈.
- 분석 화면 상단에 "마스터키 등록 모드" 배너 표시(이 계정의 분석이 정답으로 저장된다는 안내).

### 2) 돌아와서 즉시 승인
- 요청 카드에 **[↻ 마스터 확인]** 새로고침 버튼 추가 → `fetchMasterAvailability` 재조회.
- 창 포커스가 돌아오면(window focus) 자동으로 한 번 재조회해서, 등록을 마치고 탭을 닫으면 승인 버튼이 스스로 활성화되도록 한다.

### 3) 권한 안내
- 마스터키는 admin 계정 분석만 인정되므로, admin이 아닌 선생님에게는 버튼 대신 "마스터 등록은 관리자 계정에서 가능합니다" 툴팁/안내를 보여준다.

### 4) 상세 검토 화면에도 동일 적용
`TeacherAnalysisReview.tsx`(요청 → 보기) 헤더의 "마스터 미등록" 뱃지 옆에 같은 [마스터 등록] 버튼과 재확인 버튼 추가.

## 기술 상세
- 수정: `src/pages/teacher/RequestsInbox.tsx` — 카드 액션에 버튼 2개, `refreshMasterAvailability()` 콜백, `focus` 이벤트 리스너, `useAuth().roles`로 admin 판정.
- 수정: `src/pages/teacher/TeacherAnalysisReview.tsx` — 동일 버튼 + 마스터 재조회.
- 수정: `src/pages/SentenceLearn.tsx` — `?master=1` 쿼리일 때 상단 안내 배너 표시(학습 로직 변경 없음, 저장 경로는 기존 owner_progress 그대로).
- DB 변경 없음.

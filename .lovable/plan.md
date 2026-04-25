
# 학생 홈 "최근 학습" 카드 — 분석자료/인쇄 버튼 제거

## 문제

최근 학습 Passage 카드에 표시되는 두 버튼이 학생 화면에서는 동작하지 않으면서 자리만 차지하고 있음:

- **[분석자료 보기]**
- **[분석 인쇄 요청]** / 요청 후 [분석 인쇄 요청됨]

학생이 클릭해도 의미 있는 결과가 없고, 카드를 시각적으로 복잡하게 만듦.

## 변경 내용

**파일**: `src/pages/StudentHome.tsx` (786~825행)

해당 두 버튼 블록 (`{handoutDoneSet.has(...) && analysisPdfMap[...] && (...)}`) **전체 제거**.

남는 버튼:
- 정답보기 요청 / 정답보기 대기중 / 재요청
- 시험지 요청 / 시험지 요청됨 (이미 있던 것)
- **다시 하기 / 다시 도전** (1단계부터)

## 부수 정리 (선택)

`handleViewAnalysisPdf`, `handleRequestAnalysisPrint`, `handleCancelAnalysisPrint` 핸들러와 `analysisPdfMap`, `analysisPrintReqs` 상태는 다른 곳에서 사용 가능성이 있으니 **그대로 둡니다**. 호출처만 사라져도 동작에는 무관.

이후 사용 흔적 없는 게 확인되면 별도 정리 작업으로 제거 예정.

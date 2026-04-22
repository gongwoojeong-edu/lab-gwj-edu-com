

## 플랜 — 마스터키 없어도 학생 진행 가능 + 라벨 동적 변경

### 현재 동작 정리
- 마스터키(원장 admin의 owner_progress)가 없으면 `gradeAnalysis`가 `hasMaster: false`, `rate: 1` 반환
- `recordAttempt` 단계에선 이미 “마스터 없으면 자동 PASS” 처리되어 있어 진행은 가능
- 그러나 **UI/문구**는 여전히 "마스터 답안이 등록되지 않았다"는 멘트, "분석률" 라벨 고정 등 마스터 없는 케이스를 노출함
- `Index.tsx`의 진행률은 마스터 없으면 “단어 분석률(전체단어 대비)”로 자동 fallback 중 — 이미 부분 구현됨

### 사용자 요구
1. 선생님(원장) 정답 입력이 없어도 학생이 막힘 없이 진행
2. 정답이 없을 땐 "**전체 단어 대비 분석률**"로 표기 (라벨 = "분석률")
3. 정답이 있을 땐 라벨을 "**정답률**"로 변경
4. "마스터 답안 없음", "선생님 정답 미등록" 같은 멘트는 **절대 노출 금지**

---

### 1. `AnalysisSubmitConfirmDialog.tsx` 정비
- `!grade.hasMaster` 분기에서 **"마스터 답안이 등록되지 않았어요"** 안내 문구 제거
- 마스터가 없으면 `gradeAnalysis` 결과 대신 **전체 토큰 대비 분석된 owner 비율**을 표시
  - 다이얼로그 props에 `wordAnalysisRate?: number`(0~1)와 `analyzableTotal?: number`, `analyzedFilled?: number` 추가
  - 호출부(`Index.tsx`)에서 이미 계산하는 진행률을 그대로 전달
- 라벨 동적 처리:
  - `hasMaster === true` → `"정답률"`
  - `hasMaster === false` → `"분석률"`
- 마스터 없을 때 화면 구성:
  - 진행률 바 + "X / Y owner 분석 완료"만 노출
  - 필수 owner 체크리스트 / 자기 첨삭 트랙 / 세부 diff 섹션 모두 숨김
  - "자유롭게 진행하세요" 같은 안내 문구 삭제 (조용히 진행)
  - `"그래도 제출 →"` 버튼 라벨을 마스터 유무와 무관하게 `"제출 →"`로 통일

### 2. `SentenceLearn.tsx` 문구 수정
- `recordAttempt` 내부의 `"주절 S/V·접속절 V 분석이 필요해요"` 토스트는 `grade.hasMaster && !requiredOk`일 때만 발화 — **유지**(이미 hasMaster 가드 있음)
- `requestAnalysisReview`의 실패 토스트 문구에서 "마스터" 언급 없으므로 그대로 유지
- `renderReviewRequestButton`의 `"선생님분석본보기요청 (분석률 N%)"` 라벨을 `hasMaster` 여부에 따라 `"정답률"`/`"분석률"` 동적 표기
  - 이를 위해 grade 결과의 `hasMaster`를 state에 보관 (현재 `analysisGrade`에 추가)
  - `setAnalysisGrade`에 `hasMaster` 필드 포함
- 마스터 없는 문장에서도 자기 첨삭 요청 버튼은 굳이 노출 안 해도 됨 → **마스터 없으면 버튼 영역 자체 숨김** (인쇄 첨삭 후 추후 활성화 여지 남김)

### 3. `StudentHome.tsx` / 관련 토스트
- `"분석률이 부족해요"` 토스트는 학생이 자기 첨삭 요청할 때만 발화 → 마스터 없는 문장에선 요청 자체가 비활성이므로 변경 불필요. 단, 라벨 일관성을 위해 `hasMaster` 알 수 있는 곳은 `정답률` 라벨로 교체

### 4. `Index.tsx` 분석률 외부 통지 라벨
- `onAnalysisProgress` 콜백 자체는 숫자(0~1)만 넘기므로 변경 없음
- 단, 호출부(SentenceLearn 등)에서 라벨을 결정할 수 있도록 `onAnalysisProgress(rate, { hasMaster: boolean })` 시그니처로 확장
  - SentenceLearn은 이 정보를 받아 라벨 결정에 사용
- 마스터 없을 때 fallback 계산식은 이미 `completedCount / analyzableIds.length`로 동작 중 → 그대로 사용

### 5. 인쇄/검토 화면 라벨도 동일 규칙 적용 (선택적, 일관성 위해 권장)
- `TeacherAnalysisReview.tsx`, `RequestsInbox.tsx`, `AnalysisRequests.tsx`
- 현재는 항상 "분석률" 표기 → 검토 요청은 마스터가 있어야만 생성되므로 사실상 "정답률" 라벨로 통일하는 게 정확함
- `analysis_review_requests`에 들어오는 케이스는 무조건 마스터 존재 → 라벨을 `"정답률"`로 일괄 변경

### 6. 라벨 결정 헬퍼 1개 추가
- `src/lib/analysisGrading.ts`에 다음 export 추가:
  ```ts
  export const rateLabel = (hasMaster: boolean) => (hasMaster ? "정답률" : "분석률");
  ```
- 모든 표기 지점에서 이 헬퍼 사용 → 향후 변경 일관성 확보

---

### 변경 파일 요약
- 수정
  - `src/components/learning/AnalysisSubmitConfirmDialog.tsx` (마스터 없음 멘트 제거 + 라벨 동적 + 단어 대비 분석률 표시)
  - `src/pages/SentenceLearn.tsx` (라벨 동적 + 마스터 없으면 첨삭 버튼 숨김 + analysisGrade에 hasMaster 보관)
  - `src/pages/Index.tsx` (`onAnalysisProgress` 시그니처 확장)
  - `src/lib/analysisGrading.ts` (`rateLabel` 헬퍼 추가)
  - `src/pages/teacher/TeacherAnalysisReview.tsx` (라벨 "정답률"로 변경)
  - `src/pages/teacher/RequestsInbox.tsx` (라벨 "정답률"로 변경)
  - `src/pages/teacher/AnalysisRequests.tsx` (라벨 "정답률"로 변경)

### 기대 결과
- 마스터키가 없는 문장도 **학생이 그대로 진행** 가능
- 마스터 없는 문장: "분석률 N%" + "X/Y owner 분석 완료" 만 표시, "마스터 답안" 류 멘트 0건
- 마스터 있는 문장: 모든 표기가 "**정답률**"로 통일
- 추후 인쇄 첨삭으로 마스터를 보강해도 동일 화면이 자연스럽게 "정답률"로 전환


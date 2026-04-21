

## 학생 화면 정답 노출 차단 + 모드 라벨 + 분석률 기준 변경

### 핵심 원칙
- **모든 분석 기능(클릭/드래그/패널 입력/저장/관용구/수식·지시 연결)은 그대로 유지**
- **admin이 입력한 마스터키/정답 데이터는 학생 화면에 일절 표시 안 함**
- 학생 본인이 입력한 진행 상태도 화면에 "정답처럼 보이는 시각요소"는 숨김 (음영/배지/대괄호/언더라인/화살표)
- 학생은 자기 입력 인터랙션과 진행률만 보고, 채점은 단어테스트 후 "정답 보기 요청"에서만 노출

### 1) 학생 화면에서 마스터키 hydrate 완전 차단
파일: `src/pages/Index.tsx`, 필요 시 `src/lib/customAnswers.ts` 호출부

- `studentMode === true`일 때:
  - `hydrateCustomAnswersFromCloud(sentenceId)` 호출 금지
  - admin owner_progress를 progressMap에 머지하는 모든 경로 차단
  - 로컬 캐시(localStorage `customAnswers v2`)도 학생 본인 user_id 키로만 로드 (이미 user_id 스코프 적용돼 있음 — 재확인)
- 마스터키는 오직 다음 두 곳에서만 사용:
  - `gradeAnalysis()` (단어테스트 후 채점 — 학생 화면에서 이 결과 자체는 노출 안 함)
  - 진행률 분모 계산 (owner_id 목록만 사용, progress 본문은 폐기)

### 2) 학생 모드에서 정답성 시각요소 전면 숨김
파일: `src/pages/Index.tsx`

단일 플래그 `const showTeacherAnnotations = !studentMode;`로 일괄 제어. 분석 입력 인터랙션은 그대로 둠.

숨길 시각요소:
- 보라색 완료 음영 (`innerCompleteBg`, spacer 완료 연결 음영)
- 절 대괄호 `[` `]`
- 절 하단 underline
- 품사/역할 부배지 (`koreanLabel`, `outerKoreanLabel`)
- SVOC 배지 (`completedElement`, `outerBadge`)
- `ArrowOverlay`의 수식·지시 화살표 (학생 모드면 강제 false)
- `AnalysisPanel`로 넘어가는 `answer` (학생 모드면 `null`)

유지하는 것:
- 단어 클릭/드래그 선택 하이라이트 (선택 중 ring)
- 분석 패널 열림, POS/요소/역할 입력 UI
- 관용구 등록, 수식·지시 연결 입력 UI
- 자기 입력 저장 (`upsertCustomAnswer`, `upsertOwnerProgress`)
- 비분석 토큰 클릭 차단 (이미 적용)

### 3) 헤더 모드 라벨: 학생 화면에서 "학생 모드"
파일: 학생 라우트(`/learn/sentence/:id`) 헤더 — `SentenceLearn.tsx` 또는 그 안에서 임베드된 `Index.tsx`의 헤더

- 현재 "선생님 모드"로 하드코딩되거나 잘못 매핑된 부분을 `useViewMode().mode` 기반으로 교체:
  - `mode === "teacher" ? "선생님 모드" : "학생 모드"`
- 학생 라우트는 항상 `student` 뷰이므로 자동으로 "학생 모드" 표시
- 구현 단계에서 헤더 렌더 위치 정확히 grep해서 한 곳만 수정

### 4) 분석률 산정 기준: "마스터키 정답 owner 대비"
파일: `src/pages/Index.tsx`, `src/lib/analysisGrading.ts`

현재: `completedCount / analyzableIds.length` (분석 가능 단어 전체 대비)

변경:
- `fetchMasterAnswers(sentenceId)`로 마스터 owner_id 목록 조회 (progress 본문은 사용 안 함, 분모 계산용 ID만)
- 분모 = `master owner_id 개수`
- 분자 = 학생 progressMap 중 master owner_id 집합에 포함되고 값이 채워진(`pos !== null`) 개수
- `onAnalysisProgress`에서 위 비율을 emit
- `SentenceLearn.tsx`는 받은 비율을 그대로 80% 게이트로 사용 (변경 없음)
- **fallback**: 마스터 owner가 0개인 문장(원장 미등록)일 때는 학생이 막히지 않도록 기존 방식(`completedCount / analyzableIds.length`)으로 자동 전환
- **중요**: 마스터 fetch 결과는 분모용 ID 집합만 추출하고, 학생 화면 어떤 표시에도 정답 데이터는 들어가지 않음

### 작업 순서
1. `Index.tsx`에서 학생 모드 hydrate 차단 (`hydrateCustomAnswersFromCloud` 등 호출 가드)
2. `showTeacherAnnotations` 플래그 도입 → 음영/배지/대괄호/언더라인/화살표/패널 answer 모두 분기
3. 헤더 모드 라벨을 `useViewMode().mode` 기반으로 교체
4. 분석률 계산을 마스터 owner 집합 기반으로 변경 + fallback
5. 검증
   - 학생 화면(`/learn/sentence/s1`): 보라 박스/대괄호/언더라인/배지/화살표/패널 정답 모두 안 보임. 헤더 "학생 모드". 진행률은 마스터 owner 채움 비율. 단어 클릭/패널 입력/저장은 정상 동작
   - 정답지(선생님/admin): 모든 시각요소·라벨 정상, 헤더 "선생님 모드"
   - 마스터 미등록 문장: 학생이 막히지 않고 fallback 비율로 진행 가능


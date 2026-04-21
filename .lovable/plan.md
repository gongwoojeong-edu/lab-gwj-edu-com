

## 학생 화면 정답 노출 차단 + 모드 라벨 + 분석률 기준 변경 (구현 재개)

### 라우트 기반 강제 고정 (확정)
- `/learn/...` 학생 라우트 → 항상 학생 모드 (admin 계정도 동일)
- `/teacher/bookshelf/.../edit` 책장 편집 → 항상 정답지 모드
- `useViewMode` 토글은 헤더 라벨 표시용으로만 사용

### 1) 학생 화면 마스터키 hydrate 차단
파일: `src/pages/Index.tsx`

- `studentMode === true`일 때 `hydrateCustomAnswersFromCloud(sentenceId)` 호출 가드
- admin owner_progress가 progressMap에 머지되는 모든 경로 차단
- 마스터키는 오직 다음에서만 사용:
  - 진행률 분모 계산 (owner_id 목록만, progress 본문 폐기)
  - 단어테스트 후 `gradeAnalysis()` 채점 (결과는 학생 화면 미노출)

### 2) 학생 모드 정답성 시각요소 전면 숨김
파일: `src/pages/Index.tsx`

`const showTeacherAnnotations = !studentMode;` 단일 플래그로 일괄 제어.

숨길 대상:
- 보라색 완료 음영 (`innerCompleteBg`, spacer 완료 연결 음영)
- 절 대괄호 `[` `]`, 절 하단 underline, `bracketRole`
- 품사/역할 부배지 (`koreanLabel`, `outerKoreanLabel`)
- SVOC 배지 (`completedElement`, `outerBadge`)
- `ArrowOverlay` 수식·지시 화살표 (학생 모드면 강제 false)
- `AnalysisPanel`로 넘기는 `answer`는 학생 모드면 `null`

유지:
- 단어 클릭/드래그 선택 하이라이트 (선택 중 ring)
- 분석 패널 입력 UI (POS/요소/역할 선택)
- 관용구 등록, 수식·지시 연결 입력
- 자기 입력 저장 경로
- 비분석 토큰 클릭 차단

### 3) 헤더 모드 라벨
파일: 학생 라우트 헤더 (`SentenceLearn.tsx` 또는 `Index.tsx` 내 헤더)

- `useViewMode().mode` 기반 매핑: `mode === "teacher" ? "선생님 모드" : "학생 모드"`
- 학생 라우트는 항상 student 뷰 → 자동으로 "학생 모드" 표시

### 4) 분석률: 마스터키 정답 owner 대비
파일: `src/pages/Index.tsx`, 필요 시 `src/lib/analysisGrading.ts`

- `fetchMasterAnswers(sentenceId)`로 마스터 owner_id 목록만 추출 (progress 본문 폐기)
- 분모 = master owner_id 개수
- 분자 = 학생 progressMap 중 master owner_id 집합에 포함되고 `pos !== null`인 개수
- `onAnalysisProgress`에서 위 비율 emit
- **fallback**: master owner 0개일 때 기존 `completedCount / analyzableIds.length`로 자동 전환
- `SentenceLearn.tsx` 80% 게이트는 그대로 사용

### 작업 순서
1. `Index.tsx`에 `showTeacherAnnotations` 플래그 도입
2. 학생 모드 hydrate 차단 (`hydrateCustomAnswersFromCloud` 가드)
3. 음영/배지/대괄호/언더라인/화살표/패널 answer 모두 분기 적용
4. 헤더 라벨을 `useViewMode().mode` 기반으로 교체
5. 분석률 계산 마스터 owner 기반으로 변경 + fallback
6. 검증
   - 학생 화면 `/learn/sentence/s1`: 정답성 시각요소 전부 숨김, 헤더 "학생 모드", 진행률은 마스터 owner 채움 비율, 입력/저장은 정상
   - 정답지 화면(책장 편집): 모든 시각요소·라벨 정상, 헤더 "선생님 모드"
   - 마스터 미등록 문장: fallback으로 학습 진행 가능


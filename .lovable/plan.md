

## 학생 화면에 정답 라벨이 노출되는 원인과 해결안

### 원인 (확정)

학생의 `progressMap`이 비어 있어야 라벨이 안 뜨는데, 다음 두 경로로 자동으로 채워지고 있습니다:

1. **localStorage `gwj.customAnswers.v1` (user 분리 없음)** — 같은 브라우저에서 admin이 한 번이라도 답안 입력 모드로 정답을 넣었거나, 학생 본인이 admin 모드를 켰다 끈 흔적이 모두 남습니다. 로그아웃해도 안 지워집니다. → `loadCustomAnswers()`로 그대로 읽혀 `customAnswers` state에 들어갑니다.
2. **`hydrateCustomAnswersFromCloud(sentenceId)`** — 본인 `owner_progress`만 가져오긴 하지만, "정답을 입력해본 학생/관리자/이전 시도" 모두 한 사용자 안에서는 구분이 없습니다. 그리고 `customAnswers → progressMap` auto-hydrate가 admin/학생 구분 없이 동작합니다 (`Index.tsx` L720~811).

이 progress가 `buildSubBadgeLabel(wp)` / `buildElementBadge(wp)`로 들어가 WordChip 위(주어/단수과거/ing 명사앞숫자/to V의수식…)와 아래(S/V/O) 배지로 그대로 노출됩니다.

추가로 학생 화면에 "선생님 모드", "자동 순차 학습", "한글 힌트" 토글이 노출되어 학생이 admin용 동작을 트리거할 수 있는 구조도 영향이 있습니다.

---

### 해결안

#### 1. 학생 모드에서 customAnswers/progress hydrate 차단

`src/pages/Index.tsx` 라우팅이 `/`(학생 진입) 와 `/teacher/answers`(선생님 정답입력) 양쪽에서 같은 `<Index />`를 사용. 진입 경로에 따라 모드가 갈리도록 prop 추가:

- `/` (학생): `<Index studentMode />`
- `/teacher/answers` (admin): `<Index />` (현재 그대로)

`studentMode === true` 일 때:
- `loadCustomAnswers()` / `hydrateCustomAnswersFromCloud()` **호출 자체를 스킵**, `customAnswers`는 항상 빈 객체
- `customAnswers → progressMap` auto-hydrate useEffect (L720~811) **early-return**
- 결과: 학생 화면 진입 시 progressMap이 무조건 비어 있고, 학생 본인이 클릭한 owner만 progress가 채워짐 → 클릭 전에는 어떤 라벨/배지도 표시 안 됨

#### 2. localStorage 누수 차단 (현장 데이터 보호)

- `loadCustomAnswers()` 진입 시 user_id를 함께 저장한 키로 분리:
  - 키 변경: `gwj.customAnswers.v1` → `gwj.customAnswers.v2.<user_id>` (anonymous는 `__anon`)
  - 다른 user로 로그인하면 다른 키를 읽으므로 admin이 같은 브라우저에서 입력한 답이 학생에게 새지 않음
- 학생 모드에서는 어차피 1번 처리로 읽지도 않지만, admin이 학생 계정으로 잠시 들어가더라도 안전망 역할

#### 3. 학생 모드에서 admin/teacher 전용 UI 숨김

학생 화면(`studentMode`)에서 다음을 모두 비표시:
- "선생님 모드" 배지/링크 (`Index.tsx` L2244)
- "자동 순차 학습" 배지 (L2255)
- "한글 힌트" 토글 (한글힌트는 학생 학습 베껴쓰기 차단을 위해 어차피 분석 단계에서만 노출)
- `AdminHintToggle` (이미 isAdmin 가드 있음 — 재확인)
- `AnswerInputModeProvider`의 토글 진입점 (admin 전용)

`HintSettingsContext`의 `isAdmin: true` 하드코딩(L23)을 실제 role에서 읽도록 변경(`useUserRole`로 admin 여부 판정).

#### 4. 학생 자기 답안만 별도 테이블/스코프에 저장

승인된 통합 플랜 3번 ("학생 owner 완료 시 upsertOwnerProgress 자동 호출")은 그대로 진행하되, 마스터 답안과 학생 답안이 **같은 `owner_progress` 테이블에서 user_id로 분리**되도록 보장 (이미 `user_id` 컬럼 존재). RLS 점검: 본인 row만 SELECT 가능해야 함.

→ 학생 화면 `hydrateCustomAnswersFromCloud`를 (1)에서 끈 결과, 학생은 본인 답안조차 hydrate 안 됨. 이건 **자기첨삭 모드(reviewMode)** 진입 시에만 별도 fetch로 표시 (승인된 플랜 8~9번).

---

### 작업 순서

1. `src/pages/Index.tsx`에 `studentMode?: boolean` prop 추가, `/` 라우트에서 true 전달
2. `studentMode`일 때 `loadCustomAnswers` / `hydrateCustomAnswersFromCloud` / hydrate useEffect 모두 스킵
3. `studentMode`일 때 "선생님 모드" 배지·"자동 순차 학습" 배지·`AnswerInputMode` 진입점·`AdminHintToggle` 비표시
4. `HintSettingsContext` `isAdmin`을 `useUserRole().isAdmin` 기반으로 변경
5. `loadCustomAnswers/saveCustomAnswers/clearCustomAnswers`에 user_id 스코프 키 적용 + 마이그레이션(이전 키는 무시·삭제)
6. 검증
   - admin 계정으로 정답 입력 → 로그아웃 → 학생 계정으로 같은 지문 진입 → **어떤 라벨/배지도 안 보여야 함**
   - 학생이 분석 클릭 → 본인 클릭한 owner만 progress·라벨 노출
   - admin 계정으로 다시 진입 → 정답 입력 화면(`/teacher/answers`) 정상 동작


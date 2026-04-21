

## 학생→선생님 화면 토글이 안 되는 버그 수정

### 원인
`useViewMode` 훅은 자체 pub-sub listener로 상태를 동기화하는데, `StudentHome`과 `SentenceLearn`의 "🛠 선생님 화면" 버튼은 훅의 `setMode()`를 쓰지 않고 `localStorage.setItem("view_mode", "teacher")`를 **직접** 호출합니다.

→ listener가 호출되지 않음 → `RequireAuth` 내부의 `useViewMode().mode`는 여전히 `"student"` → `/teacher` 진입 시 가드(53–60행)에 걸려 즉시 `/learn`으로 redirect → 화면이 학생 홈에 머무는 것처럼 보임.

### 수정 내용

**1. `src/pages/StudentHome.tsx`**
- `useViewMode` 훅 import
- 버튼 onClick에서 `localStorage.setItem(...)` 제거 → `setMode("teacher")` 호출 후 `navigate("/teacher")`

**2. `src/pages/SentenceLearn.tsx`**
- 동일하게 `useViewMode().setMode("teacher")` 사용

**3. `src/hooks/useViewMode.ts` 견고화 (안전망)**
- `useEffect`에서 cross-tab 동기화를 위한 `window.addEventListener("storage", ...)` 추가
- mount 시점에 `localStorage`에서 다시 읽어 state를 sync하도록 하여, 어떤 경로로 값이 바뀌어도 모든 인스턴스가 최신 상태를 갖도록 보장

이 세 변경으로 어느 화면에서 토글하든 모든 `useViewMode` 인스턴스(특히 `RequireAuth`)가 즉시 최신 모드를 반영하여 `/teacher`로 정상 진입합니다.




## 핸드아웃 성적입력란이 안 보이는 이유 + 해결안

### 원인
핸드아웃 입력 UI는 **`TeacherDashboard.tsx`** (경로 `/teacher/dashboard`)에 구현되어 있습니다.
하지만 선생님 로그인 시 기본 진입 화면은 **`/teacher`** = `TeacherHome.tsx`로, 이 페이지는 단순 타일 메뉴만 표시되고 핸드아웃 입력 UI가 없습니다. 사이드바의 "대시보드" 링크 역시 `/teacher`로만 연결되어 있어, 입력란이 들어있는 화면에 도달할 경로 자체가 없습니다.

### 해결 방안: 핸드아웃 입력 섹션을 `TeacherHome`에 통합

별도 라우트(`/teacher/dashboard`)는 노후 화면이므로, 메인 대시보드(`/teacher` = `TeacherHome`)에 핸드아웃 입력 UI를 직접 통합합니다.

### 변경 사항

**1. `src/pages/teacher/TeacherHome.tsx` 개편**
   - 기존 5개 타일은 상단에 압축해 유지 (사이드바와 중복이지만 빠른 진입용)
   - 그 아래 **"오늘의 핸드아웃 성적 입력"** 섹션 추가:
     - `SessionDateBar` (날짜 선택 + 입력 진행률)
     - 학생 목록 테이블: 학번 / 이름 / 단어HO 입력 / 구문HO P·F 토글
     - `HandoutInputRow` 컴포넌트 그대로 재사용 (Enter로 다음 학생 포커스 이동)
     - 자동 저장 로직 (`upsertHandoutResult`) 그대로 재사용
   - 데이터 소스: `fetchAllStudents`, `fetchHandoutResultsByDate`, `useAuth`

**2. 코드 정리**
   - `src/pages/TeacherDashboard.tsx`와 `/teacher/dashboard` 라우트는 향후 충돌·혼동 방지를 위해 **유지하되 deprecated 처리**(주석만 추가, 동작은 변경 없음).
   - 사용자에겐 `/teacher`만 노출되므로 실질적으로 단일 화면으로 일원화.

**3. 레이아웃**
```text
┌─ TeacherLayout (사이드바 포함) ────────────────┐
│ ── 대시보드 ────────────────────────────────  │
│ [책장] [학생 목록] [교재 부여] [인쇄] [재시험]  │ ← 기존 타일 (축소)
│                                                │
│ ── 오늘의 핸드아웃 성적 입력 ─────────────────  │
│ [📅 2026-04-21]  입력 완료 3/12명             │
│                                                │
│ 학번  이름   단어HO  구문HO                    │
│ S001  김민수  [85 ]   [P][F]    ✓             │
│ S002  이지은  [   ]   [P][F]                  │
│ ...                                            │
└────────────────────────────────────────────────┘
```

### 작업 순서
1. `TeacherHome.tsx`에 학생 목록 fetch + 핸드아웃 fetch + `SessionDateBar` + 입력 테이블 추가
2. `HandoutInputRow` import해서 행마다 렌더, Enter 포커스 이동을 위한 `useRef` map 구성
3. 기존 타일 메뉴는 상단에 축약(grid 3열 → 5열, 카드 padding 축소)
4. 검증: `/teacher` 진입 시 즉시 핸드아웃 입력란 노출, 자동 저장 동작 확인

### 기술 메모
- `TeacherDashboard.tsx`의 학생 fetch + 핸드아웃 fetch + Enter 포커스 로직을 그대로 가져와 `TeacherHome.tsx`에 이식
- 권한 토글(admin 전용)·시작 레벨 변경 등 학생 관리 기능은 `/teacher/students`에 이미 있으므로 `TeacherHome`에서는 **핸드아웃 입력 컬럼만** 노출 (간결성 유지)
- 추가 DB 변경 없음


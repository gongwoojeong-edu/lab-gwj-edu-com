## 문제 진단 결과

### 1) 이름열 고정
새 과제 생성 — "대상 학생" popover의 학생 행이 좁은 너비에서 우측의 워크북 모드 select(`유닛+문장`/`유닛만`)에 밀려 이름이 잘립니다. 이름은 좌측 sticky로 항상 보이게 하고, 우측 영역은 가로 스크롤로 처리합니다.

### 2) 계정 수정 오류 — 진짜 원인
DB 확인 결과:
- `student_profiles` 에 **gwj0211 행은 1개만 존재**하며 `display_name`은 여전히 "신지우"입니다.
- 신지우(gwj0038)와 신지우(gwj0211)은 **동명이인의 별개 계정**으로 정상 데이터입니다 (중복 아님).
- 사용자가 학생 관리 화면에서 "신지우 → 김나연" 으로 변경한 것은 **`student_profiles.display_name` 을 update 하지 않았습니다.**

코드 원인 (`src/pages/TeacherStudents.tsx`):
- 학생 목록 자체가 **localStorage(`gwj.students.v1`) 기반의 가짜 명단**으로 관리됨
- `submit()`(이름 수정) → `persist(next)` → localStorage만 갱신, DB는 손도 안 댐
- 다른 모든 설정 update가 `.eq("display_name", s.name)` 으로 행을 찾으므로, 이름이 바뀌면 옛 이름과 새 이름 모두 매칭이 실패해 설정이 적용되지 않음
- 사용자가 관찰한 "계속 새로 생긴다"는 현상은, 동명이인이 popover에 함께 보이면서 + 수정한 이름이 어디에도 반영되지 않아 **수정이 안 된 것처럼 느껴지는 것**

## 작업 계획

### A. 이름열 고정 (`src/pages/teacher/Assignments.tsx`)
"대상 학생" popover 내부 학생 행 레이아웃 개편:
- popover 내부 가로 스크롤 컨테이너 추가
- 이름 칸을 `sticky left-0 bg-popover` 로 고정 (체크박스 + 이름 + 학번 묶음)
- 우측 워크북 모드 토글은 가로 스크롤 영역에 위치
- popover 너비는 현재 `--radix-popover-trigger-width` 유지

### B. 학생명 수정이 실제 DB(student_profiles)에 반영되도록 수정 (`src/pages/TeacherStudents.tsx`)

핵심 변경:
1. **편집 다이얼로그에 user_id 보존**
   - 학생 row가 DB에 존재하면 (현재 `noMap[name]` 으로 student_no를 들고 있는 경우) `user_id` 도 함께 들고 다닌다
2. **이름 수정 시 DB update 호출 추가**
   - `submit()` 의 editing 분기에서, 매칭되는 `user_id` 가 있으면
     `supabase.from("student_profiles").update({ display_name: name.trim() }).eq("user_id", user_id)` 실행
   - 매칭 실패 시(`user_id` 없음) "DB 계정에 연결되지 않은 로컬 항목입니다"로 토스트
3. **모든 설정 update 의 키를 `display_name` → `user_id` 로 교체**
   - L118, L150/153, L183, L210, L236 의 `.eq("display_name", s.name)` 들을 `.eq("user_id", s.userId)` 로 변경
   - 이렇게 하면 동명이인이 있어도 옳은 행에 적용되고, 이름 변경 후에도 깨지지 않음
4. **localStorage 의존 제거(점진)**: 이번 작업에서는 `Student` 타입에 `userId?: string` 필드를 추가하고, DB 머지 시 채워 넣음. 기존 localStorage 항목은 그대로 두되, DB 매칭이 있는 경우 항상 DB-기반으로 동작

### C. 데이터 정리 — 이번 변경 직후 사용자가 직접 다시 시도

- 신지우(gwj0211, `a6865c03-...`) → 학생 관리에서 **"김나연"** 으로 수정 → 이번엔 실제 `student_profiles.display_name` 이 update 됩니다.
- 신지우(gwj0038)은 **삭제하지 않음** (동명이인 정상 계정).
- DB 직접 정리는 필요 없음 — 중복 row가 실제론 없습니다.

## 영향 범위

- 다른 화면(`Assignments`, `RequestsInbox`, `LearningResults`, `BookshelfUnit` 등)에서 `student_profiles` 를 그대로 읽으므로, 이름이 바뀌면 자동 반영됩니다.
- `student_no`, `user_id` 는 변경하지 않습니다.

## 변경되는 파일

- `src/pages/teacher/Assignments.tsx` — popover 행 레이아웃(이름 sticky, 우측 가로 스크롤)
- `src/pages/TeacherStudents.tsx` — 편집/저장/설정 update 로직을 user_id 기반으로 전환, 이름 수정 시 DB update 추가

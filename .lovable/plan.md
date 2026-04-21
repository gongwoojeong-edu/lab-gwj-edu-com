

## 특별과제 출제 UX 개선 + 학생 노출 버그 수정

### A. 학생 화면에 과제가 안 보이는 원인 (확인됨)

방금 출제하신 과제 DB 확인 결과:
- `due_at = 2026-04-20 15:00:00+00` (UTC) = **KST 2026-04-21 00:00**
- 서버 현재시각 = `2026-04-21 09:37 UTC` → 이미 **9시간 전 만료**
- 학생 화면 쿼리는 `due_at >= now()` 필터라서 자동으로 숨겨진 상태

**근본 원인:** `Calendar`에서 "오늘(4/21)"을 선택하면 JS `Date`가 **로컬 자정 00:00:00**으로 들어가서, 출제 직후 이미 만료된 시각이 됩니다. → 마감일을 **그날 23:59:59**로 보정하면 해결.

### B. 교재 선택을 "검색 가능한 클릭 선택"으로 교체

현재: 텍스트 입력으로 `sentence_id`(예: `s12`) 직접 타이핑 → 오타·식별 어려움
변경: 교재(textbook) → 지문(passage) 2단계 클릭 + 실시간 검색

### 수정 사항 (`src/pages/teacher/Assignments.tsx`)

#### 1) 마감일 보정 (버그 수정)

기존:
```ts
due_at: dueDate.toISOString()  // 자정 → 즉시 만료 위험
```
변경:
```ts
const endOfDay = new Date(dueDate);
endOfDay.setHours(23, 59, 59, 999);  // 그날 끝까지 유효
due_at: endOfDay.toISOString()
```

#### 2) 교재 선택 UI — Popover + Command (cmdk 검색)

기존 "연결 문장 ID (선택)" `Input` 한 줄을 **두 칸**으로 교체:

**(a) 교재 선택**
- `Popover + Command` (`@/components/ui/command` — 이미 프로젝트에 존재)
- 표시 형식: `[L03] 천일문 기초 · Unit 3` (`textbooks.level` + `title` + `unit_no`)
- 실시간 필터: 레벨 코드 / 제목 / unit 번호 어느 키워드로도 매칭
- 화면 진입 시 `fetchAllTextbooks()`로 1회 로드

**(b) 지문 선택 (선택, 교재 고른 뒤 활성화)**
- 교재 선택 시 `fetchPassagesByTextbook(textbookId)` 호출
- 표시: `#001 — Radio provided the driving force…` (passage_no + english 앞 50자)
- 선택값을 `passage.code`(예: `s1`)로 저장 → 기존 `sentence_id` 컬럼에 그대로 들어감
- "지문 미지정"(전체 교재 안내용 과제) 옵션도 허용 → `sentence_id = null`

선택 결과 표시 영역 (`Popover Trigger` 라벨):
```
[L03] 천일문 기초 · Unit 3 / #001 Radio provided…
```

#### 3) 목록 렌더에 교재명 표시

기존: `· 문장 s12`
변경: 미리 만들어둔 `Map<code, "[L03] 천일문 기초 · #001">` 으로 사람이 읽는 라벨 출력

### 변경 파일

- `src/pages/teacher/Assignments.tsx` — 위 3가지 수정 (다른 파일 변경 없음)

### 추가 작업 — 기존에 잘못 만들어진 만료 과제 처리

DB에 이미 들어간 `dc4e2e1c…` 행은 마감이 과거라 학생에게 안 보입니다. 옵션:
1. **과제 페이지에서 휴지통 버튼으로 직접 삭제** (기능 이미 있음) — 권장
2. 또는 마이그레이션으로 `due_at`를 미래로 일괄 보정

→ 1번 권장. 새 UI로 다시 출제하시면 정상 노출됩니다.

### 기술 메모

- `cmdk` 기반 `Command` 컴포넌트는 이미 `src/components/ui/command.tsx`에 존재 → 의존성 추가 없음
- `textbooks` / `textbook_passages` 모두 `select`는 `authenticated` 전체 허용이라 RLS 추가 변경 없음
- DB 스키마·migration 변경 없음


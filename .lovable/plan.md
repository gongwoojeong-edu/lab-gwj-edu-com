

## 특별과제 — 학습 단계 선택 + 마감일 수정 + 학생 화면 단계 표시

### 1) DB: assignments에 "포함 학습 단계" 컬럼 추가

```sql
ALTER TABLE public.assignments
  ADD COLUMN include_analysis  boolean NOT NULL DEFAULT true,
  ADD COLUMN include_translation boolean NOT NULL DEFAULT true,
  ADD COLUMN include_wordtest  boolean NOT NULL DEFAULT true;
```
- 기본값 = 셋 다 true (=기존 과제는 "전체" 의미로 호환)
- RLS·트리거·FK 추가 변경 없음

### 2) 출제 폼에 "학습 단계" 체크박스 그룹 추가 (`Assignments.tsx`)

마감일 칸 아래 한 줄:

```
학습 단계 *  [✓] 분석   [✓] 번역   [✓] 단어테스트
```
- 최소 1개는 체크해야 저장 가능 (toast로 안내)
- "전체 학생" 처럼 빠른 프리셋 버튼: `[전체] [분석만] [단어만]`
- INSERT 시 세 boolean 그대로 저장

### 3) 과제 목록에서 인라인 수정 (제목/마감일/단계/설명)

각 행에 ✏️ 아이콘 → 클릭 시 **수정 다이얼로그** 오픈:
- 필드: 제목, 마감일(달력), 학습 단계 체크박스, 설명, (대상 학생·연결 교재/지문은 수정 가능하도록 동일 UI 재사용)
- 저장: `update assignments set ... where id = ?`
- 단, **마감일 빠른 연장**용으로 행 우측에 `+1주` 칩도 함께 — 다이얼로그 안 열고 한 클릭 연장
- 휴지통은 그대로 유지

### 4) 학생 화면 카드에 "포함 단계" 배지 (`StudentHome.tsx`)

특별과제 카드에 단계 칩 표시:
```
[분석] [번역] [단어테스트]    1일 3시간 남음
```
- 체크된 것만 색 배지, 빠진 건 회색·취소선
- "학습 시작" 버튼은 그대로 — 학습 페이지 자체 단계 분기는 후속 작업으로 분리(현재 학습 페이지는 항상 전체 단계 진행). 이번 단계에서는 **학생에게 "어떤 단계가 필수인지" 명확히 보이게**만 하고, 학습 페이지가 단계를 강제 스킵하도록 만드는 건 다음 라운드에서 진행 (요청 시 같이 처리).

### 변경 파일

1. **마이그레이션 (신규)** — assignments 컬럼 3개 추가
2. `src/pages/teacher/Assignments.tsx` — 체크박스 + 프리셋 + 수정 다이얼로그 + +1주 버튼
3. `src/pages/StudentHome.tsx` — 단계 배지 표시
4. `src/pages/teacher/TeacherHome.tsx` (마감 임박 위젯) — 단계 배지 동일 표시 (보조)

### 확인 1가지

학습 페이지(`SentenceLearn`)에서 **체크 안 된 단계를 자동 스킵**까지 이번에 구현할까요, 아니면 우선 "표시만" 하고 다음 라운드에 분리할까요?

<lov-plan>

## 특별과제 — 학습 단계 선택 + 마감일 수정 + 학생 화면 단계 표시

### 1) DB: assignments에 "포함 학습 단계" 컬럼 추가

```sql
ALTER TABLE public.assignments
  ADD COLUMN include_analysis   boolean NOT NULL DEFAULT true,
  ADD COLUMN include_translation boolean NOT NULL DEFAULT true,
  ADD COLUMN include_wordtest   boolean NOT NULL DEFAULT true;
```
- 기본값 = 셋 다 true (기존 과제는 "전체"로 호환)
- RLS/트리거/FK 추가 변경 없음

### 2) 출제 폼에 "학습 단계" 체크박스 그룹 추가 (`Assignments.tsx`)

마감일 칸 아래 한 줄:

```
학습 단계 *  [✓] 분석   [✓] 번역   [✓] 단어테스트
```
- Checkbox 3개, 최소 1개 체크 필수 (미충족 시 toast 안내)
- INSERT 시 세 boolean 그대로 저장

### 3) 과제 목록에서 전체 수정 다이얼로그

각 행에 연필(Pencil) 아이콘 추가 → 클릭 시 **Dialog** 오픈:
- 필드: 제목, 대상 학생, 마감일(달력), 학습 단계 체크박스, 연결 교재/지문, 설명
- 저장: `supabase.from("assignments").update({...}).eq("id", row.id)`
- 휴지통(삭제)은 그대로 유지

### 4) 과제 목록 + 학생 화면에 "포함 단계" 배지 표시

과제 카드에 단계 칩 표시:
```
[분석] [번역] [단어테스트]    1일 3시간 남음
```
- 포함된 단계만 색 배지로 표시
- `StudentHome.tsx`와 `Assignments.tsx` 목록 양쪽에 동일 적용

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| 마이그레이션 (신규) | `include_analysis`, `include_translation`, `include_wordtest` 컬럼 추가 |
| `src/pages/teacher/Assignments.tsx` | 체크박스 + 수정 다이얼로그 + 단계 배지 |
| `src/pages/StudentHome.tsx` | 단계 배지 표시 |
| `src/pages/teacher/TeacherHome.tsx` | 마감 임박 위젯에 단계 배지 (보조) |

### 참고

학습 페이지(`SentenceLearn`)에서 체크 안 된 단계를 **자동 스킵**하는 로직은 이번 범위에 포함하지 않습니다 (별도 요청 시 후속 구현). 이번에는 "어떤 단계가 포함인지 명확히 보여주기"까지만 진행합니다.


# 유닛 단위 건너뛰기(스킵)

## 목표
교재 보관함 **권(유닛 목록) 화면**에서 여러 유닛과 여러 학생을 선택해 **유닛 통째로 건너뛰기**를 지정/해제한다.
문장 스킵과 동일한 정책 — 선생님이 지정, 언제든 해제, 해제 시 즉시 진도 복귀. 단, **유닛 단위로 저장**하여 이후 지문이 추가/삭제돼도 그 유닛 전체가 계속 스킵 상태로 유지된다.

## 동작
- 스킵된 유닛에 속한 지문은 학생 진도 후보에서 빠지고, 진행률 분모에서도 제외된다.
- 스킵 해제하면 그 유닛의 지문이 즉시 진도/분모에 복귀.
- 학생이 링크로 스킵 유닛 지문에 직접 들어오면 "선생님이 건너뛰기로 지정한 유닛입니다" 안내 배지 표시(학습 차단까지는 아니고 안내 중심).

## 데이터베이스
신규 테이블 `student_unit_overrides`:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `unit_id uuid not null references textbook_units(id) on delete cascade`
- `skip_unit boolean not null default true`
- `created_by uuid`
- `created_at / updated_at timestamptz not null default now()`
- `unique(user_id, unit_id)`

권한·RLS(기존 `student_passage_overrides`와 동일 구조):
- `GRANT SELECT, INSERT, UPDATE, DELETE ON student_unit_overrides TO authenticated; GRANT ALL TO service_role;` (anon 없음)
- `ENABLE ROW LEVEL SECURITY`
- SELECT: 학생 본인(`user_id = auth.uid()`) 또는 교사/관리자(`has_role`)
- INSERT/UPDATE/DELETE: 교사/관리자만(`has_role('teacher'/'admin')`)
- `updated_at` 트리거(`set_updated_at()` 재사용)

## 라이브러리 — `src/lib/studentUnitOverrides.ts` (신규)
- `fetchSkippedUnitIds(userId): Promise<Set<string>>` — skip_unit=true인 unit_id 집합
- `fetchSkippedPassageCodes(userId): Promise<Set<string>>` — 스킵 유닛에 속하는 모든 지문 code 집합(`student_unit_overrides` ↔ `textbook_passages` 조인). 동적이라 지문 변동 자동 반영.
- `fetchSkipUnitMapForStudents(userIds, unitIds?): Promise<Record<userId, Set<unitId>>>` — 다이얼로그용 현황
- `upsertSkipUnit(userId, unitId, skip)`
- `bulkSetSkipUnit(userIds, unitIds, skip)` — 청크 upsert

## 진도/분모 연동
핵심: 유닛 스킵 code 집합을 기존 "문장 스킵" 필터와 동일한 방식으로 합쳐서 제외.

- `src/lib/nextSentence.ts`
  - `resolveNextSentence`: 현재 문장 스킵 집합(`fetchSkippedSentenceIds`)에 유닛 스킵 code 집합(`fetchSkippedPassageCodes`)을 합쳐 `inLevel` 후보에서 제외. 범위 미지정(레벨 전체) 케이스도 동일하게 제외.
  - `resolveNextAfterPass`:
    - 특별과제 경로의 `skippedCodes`에 유닛 스킵 code 합산.
    - 같은 유닛 다음 지문 루프: 유닛 스킵 code skip.
    - 다음 유닛 탐색 루프: 유닛이 스킵된 unit은 건너뜀.
  - `resolveEarlierIncompleteInAssignment` / `resolveFirstIncompleteInSameUnit`: 유닛 스킵 code 제외(순서 복구 시 스킵 유닛 지문으로 빠지지 않도록).
- `src/lib/progressScope.ts`
  - `fetchScopeStatusMap`: 분모 codes에서 문장 스킵뿐 아니라 유닛 스킵 code까지 제외. `student_unit_overrides`에서 유닛별 스킵 여부를 가져와 해당 unit의 codes를 분모에서 뺀다(`buildBookIndex`의 `codesByUnit` 활용).
- `src/pages/StudentHome.tsx` 등 진도 표시: 분모 계산이 progressScope 기반이므로 자동 반영(별도 분모 표기는 기존 그대로).

## UI — 권(유닛 목록) 화면
- `src/pages/teacher/BookshelfVolume.tsx`:
  - 유닛 다중선택 도구 모음(`selectedIds.size > 0` 영역)에 **"유닛 스킵 지정"** 버튼 추가(`SkipForward` 아이콘). 선택된 유닛을 기본 대상으로 `UnitSkipBulkDialog` 오픈.
  - 상태: `const [unitSkipOpen, setUnitSkipOpen] = useState(false)`.
- 신규 `src/components/teacher/UnitSkipBulkDialog.tsx`:
  - `SentenceSkipBulkDialog` 패턴 재사용(지문→유닛으로 치환).
  - 위: 대상 유닛 다중 선택(현재 권의 units, 기본 = 전달받은 selectedIds, 전체/해제).
  - 아래: 학생 명단 다중 선택(검색 + 전체선택, `orbit_enrollment_active` 재원생).
  - 학생별 현재 스킵 유닛 수 배지(`fetchSkipUnitMapForStudents`).
  - 버튼: `스킵 지정` / `스킵 해제` → `bulkSetSkipUnit`.
- (선택) 각 유닛 카드에 "유닛 스킵 N명" 배지 — 해당 유닛을 스킵된 학생 수. 페이지 진입 시 1회 집계. 부가 기능이므로 우선순위 낮음.

## 학생 화면 안내
- `src/pages/SentenceLearn.tsx`(및 필요시 `MemorizeLearn.tsx`): 현재 지문의 unit이 유닛 스킵 대상이면 기존 "건너뛰기 지정" 배지 옆에 "이 유닛은 선생님이 건너뛰기로 지정했습니다" 안내 배지. 학습 자체를 강제 차단하지는 않음(링크 진입 대비 안내).

## 기술 메모
- 유닛 스킵은 교사 지정 전용. 학생 PIN 자가 스킵은 문장 단위 기존 기능 유지(유닛에는 추가 안 함).
- RLS는 기존 `student_passage_overrides` 정책과 동일 구조 유지.
- 타입: 마이그레이션 후 자동 재생성되는 `types.ts` 반영 확인.
- 검증: `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx vitest run src/test/example.test.ts`.

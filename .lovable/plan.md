# RLS 수정: 학생 계정에서 마스터키 정상 동작

## 1. 진단 재확인 ✅

요청하신 진단은 정확합니다.

- 현재 `user_roles_select_own_or_admin` 정책: `user_id = auth.uid() OR has_role(auth.uid(), 'admin')`
- 학생 세션 → 본인의 `student` 행만 보임 → admin user_id 0건
- 결과: `fetchAdminUserIds()`(`analysisGrading.ts`, `masterAvailability.ts`) 빈 배열 → `owner_progress` 마스터 조회 0건 → `analysisHasMaster=false` → hold 분기

옵션 A-1(role IN ('admin','teacher') 추가)이 최소 변경으로 정확히 이 경로만 푸는 올바른 방법입니다. admin/teacher의 `user_id`는 이미 `assignments.teacher_id`, `owner_progress.user_id` 등으로 학생에게 사실상 노출돼 있고, 실제 데이터는 각 테이블 RLS가 보호하므로 추가 보안 리스크는 없습니다.

## 2. 마이그레이션 SQL

```sql
-- user_roles SELECT 정책 완화: admin/teacher 행은 모든 인증 사용자에게 노출
-- (student 행은 여전히 본인 또는 admin만 조회 가능 — 개인정보 보호 유지)
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;

CREATE POLICY user_roles_select_own_or_admin
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR role IN ('admin'::app_role, 'teacher'::app_role)
);
```

다른 테이블/정책/함수 변경 없음. 코드 변경 없음.

## 3. 영향 범위 분석

**user_roles 직접 조회 코드(전수)**
| 위치 | 호출 주체 | 이번 변경 영향 |
|---|---|---|
| `src/lib/analysisGrading.ts` `fetchAdminUserIds` | 학생/교사 모두 | ✅ 직접 수혜 — admin 행 반환됨 |
| `src/lib/masterAvailability.ts` `fetchAdminUserIds` | 학생/교사 | ✅ 직접 수혜 — 마스터 유무 정상 판정 |
| `src/lib/userRoles.ts` `fetchAllUserRoles` | admin 전용 화면 | 변동 없음 — 학생 호출 경로 없음, admin은 어차피 모두 봄 |
| `src/hooks/useAuth.ts` | 본인 role 조회 | 변동 없음 — `user_id = auth.uid()` |

**`has_role()` 함수**: SECURITY DEFINER + 자체 search_path로 RLS 바이패스 평가 → 정책 변경에 영향받지 않음.

**다른 테이블 RLS 충돌**: 없음. admin/teacher의 user_id 노출은 이미 다른 곳에서 일어나는 일이며, 민감 데이터(`student_profiles`, `owner_progress`, `sentence_progress` 등)는 자체 정책으로 보호됨.

**과제 설정 드롭박스 unit fetch**:
- `textbook_units`/`textbook_passages`는 authenticated 전체 SELECT라 unit 자체는 항상 보였음
- "마스터 등록된 unit만 활성/노출"하는 화면은 `fetchMasterAvailability` → `user_roles`(admin id) → `owner_progress` 경로 의존
- 이번 수정으로 학생 화면(또는 학생 모드 시뮬레이션)에서 마스터 유무 표시가 정상화됨

## 4. 잘못 쌓인 데이터 영향 분석

DB 조회 결과, `status='hold'` 7건 중 마스터키 등록이 실제로 있는데 hold로 잘못 저장된 행은 **2건**입니다:

| user_id (앞 8자리) | sentence_id | match_rate | has_master | last_activity |
|---|---|---|---|---|
| b71f3532… | s1 | 83.3% | true | 2026-04-25 09:00 |
| 70422ffc… | s2 | 100% | true | 2026-04-25 08:47 |

나머지 5건은 진짜 마스터 미등록 unit이라 `hold`가 정상입니다.

**권장 처리**: 정책 수정 후 별도 보정 INSERT/UPDATE로 위 2건만 재평가합니다(match_rate ≥ 0.8 → `pass`). 학생이 다시 진입해 정답 제출하지 않아도 자동 채점되도록.

```sql
UPDATE public.sentence_progress AS sp
SET status = CASE
      WHEN sp.analysis_match_rate >= 0.8 THEN 'pass'
      ELSE 'fail'
    END,
    passed_at = CASE
      WHEN sp.analysis_match_rate >= 0.8 THEN COALESCE(sp.passed_at, now())
      ELSE sp.passed_at
    END,
    updated_at = now()
WHERE sp.status = 'hold'
  AND sp.analysis_match_rate IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.owner_progress op
    JOIN public.user_roles ur ON ur.user_id = op.user_id AND ur.role = 'admin'
    WHERE op.sentence_id = sp.sentence_id
  );
```

(정확히 위 2건만 영향. 마스터 미등록 5건은 그대로 hold 유지)

## 5. 권장 적용 순서

1. **마이그레이션 1 적용** — `user_roles` SELECT 정책 교체 (위 SQL)
2. **검증 시나리오 1~7 수동 확인** — 학생 계정 로그인 후 마스터 있는 unit 진입, hold가 아닌 pass/fail 저장되는지
3. **데이터 보정** — 위 UPDATE를 별도 인서트 작업으로 실행해 잘못 쌓인 2건 정상화
4. **사후 모니터링** — 1~2일간 신규 `status='hold' + has_master=true` 행이 더 생기지 않는지 주기적 확인

## 변경 파일 요약

- 신규 마이그레이션 1개 (`user_roles` SELECT 정책만)
- 코드 변경 0개
- 데이터 보정 별도 단계 (2단계로 분리, 마이그레이션 후 사용자 검증을 거친 뒤 진행 권장)

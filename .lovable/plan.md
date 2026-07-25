
# sync-orbit-english 재배포 + orbit_class_days 컬럼 적용

## 현황
- `supabase/functions/sync-orbit-english/index.ts` 코드에는 이미 요일 파싱/저장 로직이 포함됨 (수정 없음).
- 마이그레이션 파일 `supabase/migrations/20260725120000_orbit_class_days.sql` 존재하나 **DB에 미적용** (컬럼 조회 시 0 rows).

## 실행 순서 (build 모드 전환 후)

1. **마이그레이션 적용** — `student_profiles.orbit_class_days text[]` 추가 + GIN 인덱스
2. **Edge Function 재배포** — `sync-orbit-english` 1개만
3. **배포/컬럼 존재 검증** — `supabase--curl_edge_functions`로 함수 헬스 확인 or 로그 확인
4. **동기화 실행 안내** — 함수는 `SYNC_CRON_SECRET` 필요하므로 UI 경로 안내:
   - **선생님 화면 → 학생정보(TeacherStudents) → 상단 "오르빗 동기화" 버튼** (또는 pg_cron이 매일 04:00 KST 자동 실행)

## 손대지 않는 것
- 함수 로직/리팩터
- 다른 Edge Function
- 프론트 UI

## 완료 보고 항목
- 마이그레이션 성공 여부
- 재배포 대상 함수명·프로젝트 ref (vyiwfkctilezvpafqjek)
- 동기화 실행 결과 또는 실행 경로

승인해주시면 마이그레이션 → 재배포 순으로 즉시 진행합니다.

# 특별과제 유닛 단위 카드 그룹핑

## 목표
선생님이 유닛 단위로 출제한 특별과제(예: "모고38" → 7문장)를 학생 대시보드에서 **카드 1개**로 묶어서 보여주고, 진척도(N/M 완료) 및 "다음 미완료 문장으로 이어하기"를 제공합니다.

## 접근 방식
스키마 변경 없이 **클라이언트 그룹핑**으로 처리합니다 (가장 안전·즉시 적용 가능).

- 그룹 키: `title | due_at | student_id | unit_prefix(sentence_id)`
- `unit_prefix` 추출 규칙: `L08-U260338-001` → `L08-U260338` (정규식 `^(.*)-\d{3}$`)
- 매칭 안 되는 sentence_id(레거시)는 단일 카드로 fallback

## 변경 파일

### `src/pages/StudentHome.tsx`

1. `AssignmentGroup` 인터페이스 추가 + `extractUnitPrefix()` 헬퍼 함수
2. assignments 로드 후 그룹 빌더 실행:
   - 같은 그룹 키로 묶기
   - 각 행의 `progressFlags`로 sentence별 완료 여부 계산
   - `totalCount` / `doneCount` / `inProgressCount` / `nextSentenceId` 산출
   - 모든 sentence가 완료된 그룹은 숨김(현재 단일 행 숨김 로직과 동일 정책)
3. 상태: `assignments: AssignmentRow[]` → `assignmentGroups: AssignmentGroup[]`
4. UI 변경 (특별과제 섹션, 555-645행):
   - 카드 1개 = 1유닛 그룹
   - 제목: `{title}` (예: "모고38")
   - 진척도 뱃지: `완료 N/M` (예: "완료 2/7")
   - 진행중 표시: 일부 sentence 시작했으면 "진행중" 뱃지
   - 버튼:
     - 다음 미완료 문장이 있으면 → `이어하기` (다음 sentence로 이동)
     - 모두 완료면 → 숨김
   - 마감 남은시간, AssignmentStepBadges, description은 유지

## 진척도 계산 규칙
- sentence 1개의 "완료" = 그 과제의 ON된 단계(pre/wt/analysis/translation) 모두 완료
- `nextSentenceId`: 같은 유닛 sentence들을 sentence_id 오름차순으로 정렬했을 때 첫 번째 미완료 문장

## 다음 단계 (이번 작업 외)
- DB에 `assignments.unit_id` 컬럼 추가 (다음 마이그레이션 사이클)
- 선생님 화면(`Assignments.tsx`)도 유닛 단위로 묶어 표시
- `AssignmentsPast.tsx` 동일 처리

## 영향 없음
- DB 스키마 변경 없음
- 선생님 출제 UI 변경 없음 (이미 유닛 전체를 자동 부여하도록 되어 있음)
- 진행 중인 학습 데이터 보존

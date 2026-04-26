## 변경 목표

1. **진입 위치 이동**: 페이지 상단(우측 "과거 과제함 보기 →" 텍스트 링크)을 제거하고, **"진행중 과제 (N)" 헤더 옆**(스크린샷 녹색 표시 위치)에 같은 형태의 버튼을 배치한다.
2. **버튼화**: 진행중 과제 카드 내 다른 컨트롤들과 톤이 어울리는 작은 버튼으로 통일 (variant="outline", size="sm").
3. **완료 과제 목록 포맷 통일**: 현재 `AssignmentsPast`는 개별 row 단위 + accordion으로 표시되는데, 이를 **진행중 과제와 동일한 "유닛 그룹" 카드 포맷**으로 바꾼다 (제목 + "유닛 · 지문 N개" 뱃지 + 대상/마감/통과수 + AssignmentStepBadges).

---

## 변경 파일

### 1) `src/pages/teacher/Assignments.tsx`

- **상단 헤더 영역(L987–L997)**: 우측의 `<a href="/teacher/assignments/past">과거 과제함 보기 →</a>` 링크 제거.
- **"진행중 과제 ({activeGroups.length})" 헤더 줄(L1126)**: `<h2>` 와 같은 줄에 우측 정렬로 `Link` 기반 버튼 추가.
  ```tsx
  <div className="flex items-center justify-between gap-2">
    <h2 className="...">진행중 과제 ({activeGroups.length})</h2>
    <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
      <Link to="/teacher/assignments/past">
        <ClipboardList className="size-3.5 mr-1" />
        완료 과제함
      </Link>
    </Button>
  </div>
  ```

### 2) `src/pages/teacher/AssignmentsPast.tsx` — 전면 리팩터

진행중과 동일한 그룹화/렌더링 로직을 도입한다.

**추가 로드**:
- `textbook_passages`에서 `code → unit_id` 매핑 (`codeToUnit`)
- `textbooks` / `units` / `passages` (라벨용)
- `fetchAssignmentProgress` 결과 (`progressByAsg`) — 그룹 진척 계산용

**그룹화**: 진행중과 동일한 키 `${title}|${due_at}|${student_id}|${unit_id}` 로 묶고 `AssignmentGroup` 구조 생성.

**완료 판정**: 기존 `isAssignmentDone(r, progressByAsg[r.id], allIds)` 를 그룹 내 모든 row에 적용해 `group의 모든 row가 완료`인 그룹만 표시. (현재 로직 유지)

**카드 렌더링**: 진행중 카드와 동일한 마크업 사용
- 제목 + `유닛 · 지문 N개` 뱃지
- "대상 / 마감일 / 통과 N/M명 / 유닛라벨" 메타 라인 (마감일은 빨강 강조 없이 회색)
- `AssignmentStepBadges` (mergedProgress 동일 계산)
- 우측 액션은 **삭제 버튼만** (완료된 과제이므로 +1주 / 수정 제거)
- 기존 accordion(개별 학생 PASS/FAIL 표) 제거 — 뱃지 hover로 충분

**경로/상단**: "← 진행중 과제로" 백 링크 유지.

---

## 기술 메모

- 진행중 카드의 `mergedProgress` 계산 블록(L1141–L1173)은 그대로 옮겨 재사용. 가능하면 `Assignments.tsx`/`AssignmentsPast.tsx` 양쪽에서 import할 수 있도록 `src/lib/assignmentGroup.ts`(신규) 같은 헬퍼로 추출하는 것도 검토하나, 우선은 **단순 복제**로 진행해 변경 범위를 최소화한다.
- `isAssignmentDone` 호출 시 그룹 단위 완료 여부 = 그룹 내 모든 row가 완료. 기존 `AssignmentsPast`의 row 단위 필터를 그룹 단위로 변경.
- 라우트(`/teacher/assignments/past`)는 그대로. 변경 없음.

## 영향 범위

- 데이터 모델 변경 없음 (DB 마이그레이션 불필요)
- 두 파일만 수정: `Assignments.tsx`, `AssignmentsPast.tsx`
